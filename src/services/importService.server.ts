import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { normalizeCode, normalizeText } from "@/lib/normalize";
import type { ImportPayload } from "@/services/connectors/types";

type Client = SupabaseClient<Database>;

type RpcError = { message: string } | null;
type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError }>;
};

export type DuplicateReport = {
  manufacturer: { id: string; name: string } | null;
  model: { id: string; model_name: string } | null;
  catalog: { id: string; title: string } | null;
  part: { id: string; primary_part_number: string } | null;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function findManufacturer(db: Client, name: string) {
  const slug = slugify(name);
  const { data: bySlug, error: slugError } = await db
    .from("manufacturers")
    .select("id,name,slug")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (slugError) throw new Error(slugError.message);
  if (bySlug) return bySlug;

  const { data: byName, error: nameError } = await db
    .from("manufacturers")
    .select("id,name,slug")
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (nameError) throw new Error(nameError.message);
  return byName;
}

async function findModel(db: Client, manufacturerId: string, modelName: string) {
  const { data, error } = await db
    .from("machine_models")
    .select("id,model_name")
    .eq("manufacturer_id", manufacturerId)
    .eq("normalized_model_name", normalizeCode(modelName))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findPart(db: Client, manufacturerId: string, partNumber: string) {
  const { data, error } = await db
    .from("parts")
    .select("id,primary_part_number")
    .eq("manufacturer_id", manufacturerId)
    .eq("normalized_part_number", normalizeCode(partNumber))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findCatalog(
  db: Client,
  payload: ImportPayload,
  manufacturerId: string,
  modelId: string | null,
) {
  let query = db.from("catalogs").select("id,title").eq("manufacturer_id", manufacturerId);
  if (modelId) query = query.eq("machine_model_id", modelId);
  if (payload.catalogNumber) {
    query = query.eq("normalized_catalog_number", normalizeCode(payload.catalogNumber));
  } else if (payload.catalogTitle) {
    query = query.eq("normalized_title", normalizeText(payload.catalogTitle));
  } else {
    return null;
  }
  if (payload.revision) query = query.eq("revision", payload.revision);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function detectDuplicates(
  db: Client,
  payload: ImportPayload,
): Promise<DuplicateReport> {
  const report: DuplicateReport = {
    manufacturer: null,
    model: null,
    catalog: null,
    part: null,
  };

  if (!payload.manufacturerName) return report;
  const manufacturer = await findManufacturer(db, payload.manufacturerName);
  if (!manufacturer) return report;
  report.manufacturer = { id: manufacturer.id, name: manufacturer.name };

  if (payload.modelName) report.model = await findModel(db, manufacturer.id, payload.modelName);
  if (payload.partNumber) report.part = await findPart(db, manufacturer.id, payload.partNumber);
  if (payload.catalogTitle || payload.catalogNumber) {
    report.catalog = await findCatalog(db, payload, manufacturer.id, report.model?.id ?? null);
  }

  return report;
}

export type ImportOptions = {
  duplicateStrategy: "link" | "create";
  linkModelId?: string | null;
};

export type ImportOutcome = {
  manufacturerId: string | null;
  modelId: string | null;
  catalogId: string | null;
  partId: string | null;
  created: string[];
  linked: string[];
};

type ImportRpcResult = {
  ok: boolean;
  jobId?: string;
  manufacturerId?: string | null;
  modelId?: string | null;
  catalogId?: string | null;
  partId?: string | null;
  created?: string[];
  linked?: string[];
  error?: string;
};

function asRpcResult(value: unknown): ImportRpcResult {
  if (!value || typeof value !== "object") {
    throw new Error("Import RPC returned an invalid response.");
  }
  return value as ImportRpcResult;
}

export async function importPayload(
  db: Client,
  payload: ImportPayload,
  sourceId: string,
  _userId: string,
  options: ImportOptions,
): Promise<ImportOutcome> {
  const rpcDb = db as unknown as RpcClient;
  const { data, error } = await rpcDb.rpc("import_external_payload", {
    p_payload: payload as unknown as Json,
    p_source_id: sourceId,
    p_duplicate_strategy: options.duplicateStrategy,
    p_link_model_id: options.linkModelId ?? null,
  });

  if (error) throw new Error(error.message);
  const result = asRpcResult(data);
  if (!result.ok) throw new Error(result.error ?? "External import failed.");

  return {
    manufacturerId: result.manufacturerId ?? null,
    modelId: result.modelId ?? null,
    catalogId: result.catalogId ?? null,
    partId: result.partId ?? null,
    created: Array.isArray(result.created) ? result.created : [],
    linked: Array.isArray(result.linked) ? result.linked : [],
  };
}
