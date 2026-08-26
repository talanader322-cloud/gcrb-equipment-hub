import { supabase } from "@/integrations/supabase/client";
import { normalizeCode, normalizeText } from "@/lib/normalize";
import type {
  AssemblyResult,
  CatalogResult,
  LocalSearchResults,
  ModelResult,
  PartResult,
  SearchFilters,
  SearchScope,
} from "@/lib/types";

const MODEL_SELECT =
  "*, manufacturer:manufacturers(id,name,slug), equipment_type:equipment_types(id,name,name_ar,slug)";
const CATALOG_SELECT =
  "*, manufacturer:manufacturers(id,name,slug), machine_model:machine_models(id,model_name)";
const PART_SELECT = "*, manufacturer:manufacturers(id,name,slug)";
const LIMIT = 50;

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type SerialModelRow = { machine_model_id: string; match_rank: number };

function sanitize(value: string): string {
  return value.replace(/[%,()*]/g, " ").trim();
}

async function searchSerialModelIds(query: string, filters: SearchFilters): Promise<string[]> {
  const rpcDb = supabase as unknown as RpcClient;
  const { data, error } = await rpcDb.rpc("search_serial_model_ids", {
    p_query: query,
    p_manufacturer_id: filters.manufacturerId ?? null,
    p_equipment_type_id: filters.equipmentTypeId ?? null,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return (data as SerialModelRow[]).map((row) => row.machine_model_id);
}

async function searchModels(
  raw: string,
  code: string,
  filters: SearchFilters,
): Promise<ModelResult[]> {
  const text = sanitize(raw);
  const found = new Map<string, ModelResult>();

  let q = supabase
    .from("machine_models")
    .select(MODEL_SELECT)
    .or(
      [
        `normalized_model_name.ilike.%${code}%`,
        `model_name.ilike.%${text}%`,
        `series.ilike.%${text}%`,
      ].join(","),
    )
    .limit(LIMIT);
  if (filters.manufacturerId) q = q.eq("manufacturer_id", filters.manufacturerId);
  if (filters.equipmentTypeId) q = q.eq("equipment_type_id", filters.equipmentTypeId);
  const direct = await q;
  if (direct.error) throw new Error(direct.error.message);
  for (const row of (direct.data ?? []) as ModelResult[]) found.set(row.id, row);

  const aliasRes = await supabase
    .from("machine_aliases")
    .select("machine_model_id")
    .ilike("normalized_alias", `%${code}%`)
    .limit(LIMIT);
  if (aliasRes.error) throw new Error(aliasRes.error.message);

  const serialQuery = filters.serialNumber?.trim() || raw;
  const serialIds = await searchSerialModelIds(serialQuery, filters);
  const extraIds = new Set<string>([
    ...(aliasRes.data ?? []).map((a) => a.machine_model_id),
    ...serialIds,
  ]);

  const missing = [...extraIds].filter((id) => !found.has(id));
  if (missing.length > 0) {
    let q2 = supabase.from("machine_models").select(MODEL_SELECT).in("id", missing).limit(LIMIT);
    if (filters.manufacturerId) q2 = q2.eq("manufacturer_id", filters.manufacturerId);
    if (filters.equipmentTypeId) q2 = q2.eq("equipment_type_id", filters.equipmentTypeId);
    const extra = await q2;
    if (extra.error) throw new Error(extra.error.message);
    for (const row of (extra.data ?? []) as ModelResult[]) found.set(row.id, row);
  }

  const serialOrder = new Map(serialIds.map((id, index) => [id, index]));
  return [...found.values()].sort((a, b) => {
    const aExact = normalizeCode(a.model_name) === code ? 1 : 0;
    const bExact = normalizeCode(b.model_name) === code ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (
      (serialOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (serialOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

async function searchParts(
  raw: string,
  code: string,
  filters: SearchFilters,
): Promise<PartResult[]> {
  const text = sanitize(raw);
  const upper = normalizeText(text);
  const found = new Map<string, PartResult>();

  let q = supabase
    .from("parts")
    .select(PART_SELECT)
    .or(
      [
        `normalized_part_number.ilike.%${code}%`,
        `primary_part_number.ilike.%${text}%`,
        `normalized_description.ilike.%${upper}%`,
      ].join(","),
    )
    .limit(LIMIT);
  if (filters.manufacturerId) q = q.eq("manufacturer_id", filters.manufacturerId);
  const direct = await q;
  if (direct.error) throw new Error(direct.error.message);
  for (const row of (direct.data ?? []) as PartResult[]) found.set(row.id, row);

  const aliasRes = await supabase
    .from("part_aliases")
    .select("part_id")
    .ilike("normalized_number", `%${code}%`)
    .limit(LIMIT);
  if (aliasRes.error) throw new Error(aliasRes.error.message);

  const missing = [...new Set((aliasRes.data ?? []).map((a) => a.part_id))].filter(
    (id) => !found.has(id),
  );
  if (missing.length > 0) {
    let extraQuery = supabase.from("parts").select(PART_SELECT).in("id", missing).limit(LIMIT);
    if (filters.manufacturerId)
      extraQuery = extraQuery.eq("manufacturer_id", filters.manufacturerId);
    const extra = await extraQuery;
    if (extra.error) throw new Error(extra.error.message);
    for (const row of (extra.data ?? []) as PartResult[]) found.set(row.id, row);
  }

  const ranked = [...found.values()].sort(
    (a, b) =>
      Number(normalizeCode(b.primary_part_number) === code) -
      Number(normalizeCode(a.primary_part_number) === code),
  );

  if (!filters.machineModelId) return ranked;

  const compat = await supabase
    .from("part_machine_compatibility")
    .select("part_id")
    .eq("machine_model_id", filters.machineModelId);
  if (compat.error) throw new Error(compat.error.message);
  const allowed = new Set((compat.data ?? []).map((c) => c.part_id));
  return ranked.filter((p) => allowed.has(p.id));
}

async function searchCatalogs(
  raw: string,
  code: string,
  filters: SearchFilters,
): Promise<CatalogResult[]> {
  const text = sanitize(raw);
  const upper = normalizeText(text);
  let q = supabase
    .from("catalogs")
    .select(CATALOG_SELECT)
    .or(
      [
        `normalized_catalog_number.ilike.%${code}%`,
        `catalog_number.ilike.%${text}%`,
        `normalized_title.ilike.%${upper}%`,
      ].join(","),
    )
    .limit(LIMIT);
  if (filters.manufacturerId) q = q.eq("manufacturer_id", filters.manufacturerId);
  if (filters.machineModelId) q = q.eq("machine_model_id", filters.machineModelId);
  if (filters.catalogType) q = q.eq("catalog_type", filters.catalogType);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as CatalogResult[]).sort(
    (a, b) =>
      Number(normalizeCode(b.catalog_number ?? "") === code) -
      Number(normalizeCode(a.catalog_number ?? "") === code),
  );
}

async function searchAssemblies(raw: string): Promise<AssemblyResult[]> {
  const upper = normalizeText(sanitize(raw));
  const code = normalizeCode(raw);
  const { data, error } = await supabase
    .from("assemblies")
    .select("*, catalog:catalogs(id,title,catalog_number)")
    .or([`normalized_title.ilike.%${upper}%`, `assembly_number.ilike.%${code}%`].join(","))
    .limit(LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as AssemblyResult[];
}

export const searchService = {
  async searchLocal(
    query: string,
    scope: SearchScope = "all",
    filters: SearchFilters = {},
  ): Promise<LocalSearchResults> {
    const raw = query.trim();
    const code = normalizeCode(raw);
    const empty: LocalSearchResults = {
      query: raw,
      normalizedQuery: code,
      models: [],
      parts: [],
      catalogs: [],
      assemblies: [],
      total: 0,
    };
    if (!raw) return empty;

    const wants = (s: SearchScope) => scope === "all" || scope === s;
    const [models, parts, catalogs, assemblies] = await Promise.all([
      wants("models") ? searchModels(raw, code, filters) : Promise.resolve([]),
      wants("parts") ? searchParts(raw, code, filters) : Promise.resolve([]),
      wants("catalogs") ? searchCatalogs(raw, code, filters) : Promise.resolve([]),
      wants("assemblies") ? searchAssemblies(raw) : Promise.resolve([]),
    ]);

    return {
      query: raw,
      normalizedQuery: code,
      models,
      parts,
      catalogs,
      assemblies,
      total: models.length + parts.length + catalogs.length + assemblies.length,
    };
  },
};
