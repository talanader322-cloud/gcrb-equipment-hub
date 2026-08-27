import { supabase } from "@/integrations/supabase/client";
import { fileStorageService } from "@/services/storage/fileStorageService";

/**
 * UNIFIED ORIGINAL MANUAL PIPELINE — the single implementation used by every
 * screen that stores an original equipment manual.
 *
 * Order of operations (never varies):
 *   validate PDF -> SHA-256 -> upload to the PRIVATE `catalogs` bucket ->
 *   atomic RPC (catalogs + catalog_files + asset_manuals) -> success.
 *
 * If the RPC fails the uploaded storage object is deleted. That compensating
 * delete can itself fail, and when it does the failure is reported loudly
 * instead of being swallowed — orphan files are unlikely, not impossible.
 *
 * The canonical document location is catalogs -> catalog_files -> catalogs
 * bucket. asset_manuals.storage_path is legacy and is NEVER written here.
 */

export const MANUAL_TYPES = [
  "parts_catalog",
  "operation_manual",
  "service_manual",
  "workshop_manual",
  "maintenance_manual",
  "engine_manual",
  "transmission_manual",
  "electrical_diagram",
  "hydraulic_diagram",
  "specification_manual",
  "other",
] as const;

export type ManualType = (typeof MANUAL_TYPES)[number];

/** Institutional original-manual provenance (manual/CD shipped with the machine). */
export const INSTITUTION_ORIGINAL_SOURCE_TYPE = "original_cd";

export const MAX_MANUAL_BYTES = 200 * 1024 * 1024; // 200 MB per document

export type ManualDraft = {
  id: string;
  file: File;
  manualType: ManualType;
  title: string;
  language: string;
  revision: string;
  catalogNumber: string;
  serialFrom: string;
  serialTo: string;
};

export type ManualUploadResult = {
  catalogId: string;
  catalogFileId: string;
  manualId: string;
};

export function inferManualType(name: string): ManualType {
  const value = name.toLowerCase();
  if (value.includes("part")) return "parts_catalog";
  if (value.includes("operation") || value.includes("operator")) return "operation_manual";
  if (value.includes("workshop")) return "workshop_manual";
  if (value.includes("service")) return "service_manual";
  if (value.includes("maint")) return "maintenance_manual";
  if (value.includes("engine")) return "engine_manual";
  if (value.includes("transmission")) return "transmission_manual";
  if (value.includes("electric") || value.includes("wiring")) return "electrical_diagram";
  if (value.includes("hydraulic")) return "hydraulic_diagram";
  if (value.includes("spec")) return "specification_manual";
  return "other";
}

export function createManualDraft(file: File): ManualDraft {
  return {
    id: crypto.randomUUID(),
    file,
    manualType: inferManualType(file.name),
    title: file.name.replace(/\.pdf$/i, ""),
    language: "en",
    revision: "",
    catalogNumber: "",
    serialFrom: "",
    serialTo: "",
  };
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates the document and returns its SHA-256.
 * MIME type is never trusted on its own — the real `%PDF-` magic bytes are read.
 */
export async function validatePdf(file: File): Promise<{ checksum: string }> {
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_MANUAL_BYTES) {
    throw new Error(
      `The file exceeds the maximum allowed size of ${MAX_MANUAL_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (!/\.pdf$/i.test(file.name)) throw new Error("Only files with a .pdf extension are accepted.");
  if (file.type && file.type !== "application/pdf") {
    throw new Error("Only PDF documents are accepted.");
  }

  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 5));
  const magic = String.fromCharCode(...header);
  if (magic !== "%PDF-") throw new Error("The selected file is not a valid PDF document.");

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { checksum: hex(digest) };
}

/**
 * Stores one original manual for one machine asset. Atomic end to end.
 */
export async function uploadAssetManual(
  assetId: string,
  draft: ManualDraft,
): Promise<ManualUploadResult> {
  const { checksum } = await validatePdf(draft.file);

  const safeName = draft.file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const storagePath = `assets/${assetId}/${crypto.randomUUID()}-${safeName}`;

  const stored = await fileStorageService.upload("catalogs", storagePath, draft.file);

  try {
    const { data, error } = await supabase.rpc("create_asset_manual", {
      p_asset_id: assetId,
      p_payload: {
        title: draft.title.trim() || draft.file.name,
        manualType: draft.manualType,
        language: draft.language.trim() || "en",
        revision: draft.revision.trim() || null,
        catalogNumber: draft.catalogNumber.trim() || null,
        serialFrom: draft.serialFrom.trim() || null,
        serialTo: draft.serialTo.trim() || null,
        sourceType: INSTITUTION_ORIGINAL_SOURCE_TYPE,
        storagePath: stored.path,
        storageBucket: "catalogs",
        originalFilename: draft.file.name,
        mimeType: "application/pdf",
        fileSize: draft.file.size,
        checksum,
      },
    });
    if (error) throw new Error(error.message);

    const result = data as unknown as {
      ok?: boolean;
      catalogId?: string;
      catalogFileId?: string;
      manualId?: string;
    } | null;
    if (!result?.ok || !result.catalogId || !result.catalogFileId || !result.manualId) {
      throw new Error("The manual could not be registered in the institution library.");
    }
    return {
      catalogId: result.catalogId,
      catalogFileId: result.catalogFileId,
      manualId: result.manualId,
    };
  } catch (error) {
    // Transaction failed: compensate by deleting the uploaded object. A failed
    // cleanup is a high-priority condition and is never silently ignored.
    const dbMessage = error instanceof Error ? error.message : String(error);
    try {
      await fileStorageService.remove("catalogs", stored.path);
    } catch (cleanupError) {
      const cleanupMessage =
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      // No tokens, signed URLs or credentials are logged — only the object path.
      console.error(
        "[manual-upload] ORPHAN STORAGE OBJECT: database registration failed and cleanup failed.",
        { bucket: "catalogs", path: stored.path, dbMessage, cleanupMessage },
      );
      throw new Error(
        `The manual could not be registered (${dbMessage}) and the uploaded file could not be removed (${cleanupMessage}). Please report this: catalogs/${stored.path}`,
      );
    }
    throw error;
  }
}

/** Uploads several drafts, reporting completed count for progress UI. */
export async function uploadAssetManuals(
  assetId: string,
  drafts: ManualDraft[],
  onProgress?: (done: number, total: number) => void,
  onDraftUploaded?: (draftId: string) => void,
): Promise<ManualUploadResult[]> {
  const results: ManualUploadResult[] = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index]!;
    results.push(await uploadAssetManual(assetId, draft));
    onDraftUploaded?.(draft.id);
    onProgress?.(index + 1, drafts.length);
  }
  return results;
}
