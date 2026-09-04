import { supabase } from "@/integrations/supabase/client";
import { fetchKomatsuDiagram } from "@/lib/komatsuProxy.functions";
import { validateAssetImage } from "@/services/repositories/assetRepository";
import { fileStorageService } from "@/services/storage/fileStorageService";

/**
 * Model photos.
 *
 * A model photo is preferably taken from the machine's own catalog (a diagram
 * page or the rendered PDF cover) and then COPIED into the private
 * machine-images bucket. Copying — rather than pointing at the catalog object —
 * keeps the model card intact when a catalog is re-imported or a scheme is
 * deleted. `machine_models.image_path` therefore stores a storage PATH only and
 * is always read through a short-lived signed URL.
 */

export type ModelImageCandidate = {
  key: string;
  catalogId: string;
  catalogTitle: string;
  pageNumber: number;
  title: string | null;
  imageStoragePath: string | null;
  imageUrl: string | null;
  source: "scheme";
};

const MAX_CANDIDATES = 12;

export const modelImageService = {
  /** Short-lived signed URL for a private model photo path. */
  async signedUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    try {
      return await fileStorageService.getSignedUrl("machine-images", path, 3600);
    } catch {
      return null;
    }
  },

  /**
   * Image candidates taken from the catalogs already linked to this model.
   * The earliest pages come first — the cover/general-view page of a parts book
   * is nearly always the best machine picture available.
   */
  async listCandidates(modelId: string): Promise<ModelImageCandidate[]> {
    const { data: catalogs, error: catalogError } = await supabase
      .from("catalogs")
      .select("id, title")
      .eq("machine_model_id", modelId)
      .order("title");
    if (catalogError) throw new Error(catalogError.message);
    const catalogRows = catalogs ?? [];
    if (catalogRows.length === 0) return [];

    const titles = new Map(catalogRows.map((row) => [row.id, row.title]));
    const { data: schemes, error: schemeError } = await supabase
      .from("catalog_schemes")
      .select("id, catalog_id, page_number, title, image_url, image_storage_path")
      .in(
        "catalog_id",
        catalogRows.map((row) => row.id),
      )
      .order("page_number")
      .limit(MAX_CANDIDATES * 2);
    if (schemeError) throw new Error(schemeError.message);

    return (schemes ?? [])
      .filter((scheme) => scheme.image_storage_path || scheme.image_url)
      .slice(0, MAX_CANDIDATES)
      .map((scheme) => ({
        key: scheme.id,
        catalogId: scheme.catalog_id,
        catalogTitle: titles.get(scheme.catalog_id) ?? "",
        pageNumber: scheme.page_number,
        title: scheme.title,
        imageStoragePath: scheme.image_storage_path,
        imageUrl: scheme.image_url,
        source: "scheme" as const,
      }));
  },

  /** Preview URL for a candidate (signed for private objects, direct otherwise). */
  async candidatePreviewUrl(candidate: ModelImageCandidate): Promise<string | null> {
    if (candidate.imageStoragePath) {
      try {
        return await fileStorageService.getSignedUrl("catalogs", candidate.imageStoragePath, 3600);
      } catch {
        return null;
      }
    }
    return candidate.imageUrl ?? null;
  },

  /** Raw bytes for a candidate, fetched through the server proxy when hotlinked. */
  async candidateBytes(candidate: ModelImageCandidate): Promise<{ bytes: Blob; mime: string }> {
    if (candidate.imageStoragePath) {
      const { data, error } = await supabase.storage
        .from("catalogs")
        .download(candidate.imageStoragePath);
      if (error || !data) throw new Error(error?.message ?? "Diagram image could not be read.");
      return { bytes: data, mime: data.type || "image/png" };
    }
    if (!candidate.imageUrl) throw new Error("This candidate has no image.");
    const proxied = await fetchKomatsuDiagram({ data: { url: candidate.imageUrl } });
    const binary = atob(proxied.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return {
      bytes: new Blob([bytes], { type: proxied.contentType }),
      mime: proxied.contentType,
    };
  },

  /** Adopt a catalog page/diagram as the model photo. */
  async applyCandidate(modelId: string, candidate: ModelImageCandidate): Promise<string> {
    const { bytes, mime } = await this.candidateBytes(candidate);
    const extension = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
    const file = new File([bytes], `page-${candidate.pageNumber}.${extension}`, { type: mime });
    return await this.store(modelId, file, "scheme");
  },

  /** Manager-uploaded photo (used when no catalog is archived for the model). */
  async upload(modelId: string, file: File): Promise<string> {
    await validateAssetImage(file);
    return await this.store(modelId, file, "manual");
  },

  /** Adopt a rendered PDF page (catalog cover) as the model photo. */
  async applyRenderedPage(modelId: string, file: File): Promise<string> {
    return await this.store(modelId, file, "catalog_page");
  },

  /**
   * Order of work: upload the new object -> update the row -> delete the old
   * object. A failed row update removes the freshly uploaded object so the
   * previous photo stays valid.
   */
  async store(
    modelId: string,
    file: File,
    source: "scheme" | "manual" | "catalog_page",
  ): Promise<string> {
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `models/${modelId}/${Date.now()}-${safeName}`;
    const previous = await supabase
      .from("machine_models")
      .select("image_path")
      .eq("id", modelId)
      .maybeSingle();
    if (previous.error) throw new Error(previous.error.message);

    const stored = await fileStorageService.upload("machine-images", path, file);
    const { error } = await supabase
      .from("machine_models")
      .update({ image_path: stored.path, image_source: source })
      .eq("id", modelId);
    if (error) {
      await fileStorageService.remove("machine-images", stored.path).catch(() => undefined);
      throw new Error(error.message);
    }
    const old = previous.data?.image_path;
    if (old && old !== stored.path) {
      await fileStorageService.remove("machine-images", old).catch(() => undefined);
    }
    return stored.path;
  },

  /** Models that still have no photo, with their canonical name and aliases. */
  async listModelsWithoutPhoto() {
    const [models, aliases] = await Promise.all([
      supabase
        .from("machine_models")
        .select("id, model_name, image_path")
        .eq("active", true)
        .order("model_name"),
      supabase.from("machine_aliases").select("machine_model_id, alias"),
    ]);
    if (models.error) throw new Error(models.error.message);
    if (aliases.error) throw new Error(aliases.error.message);
    const aliasMap = new Map<string, string[]>();
    for (const row of aliases.data ?? []) {
      const list = aliasMap.get(row.machine_model_id) ?? [];
      if (row.alias) list.push(row.alias);
      aliasMap.set(row.machine_model_id, list);
    }
    return (models.data ?? []).map((row) => ({
      id: row.id,
      modelName: row.model_name,
      hasPhoto: Boolean(row.image_path),
      aliases: aliasMap.get(row.id) ?? [],
    }));
  },
};

/** Loose code comparison so `D155-1`, `d155 1` and `D1551` all match. */
export function codeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Match an uploaded filename to a model by canonical name or alias. */
export function matchModelByFilename(
  filename: string,
  models: { id: string; modelName: string; aliases: string[] }[],
): string | null {
  const base = filename.replace(/\.[A-Za-z0-9]+$/, "");
  const key = codeKey(base);
  if (!key) return null;
  const exact = models.find(
    (model) =>
      codeKey(model.modelName) === key || model.aliases.some((alias) => codeKey(alias) === key),
  );
  if (exact) return exact.id;
  const contained = models
    .flatMap((model) => [
      { id: model.id, code: codeKey(model.modelName) },
      ...model.aliases.map((alias) => ({ id: model.id, code: codeKey(alias) })),
    ])
    .filter((entry) => entry.code.length >= 4 && key.includes(entry.code))
    .sort((a, b) => b.code.length - a.code.length);
  return contained[0]?.id ?? null;
}
