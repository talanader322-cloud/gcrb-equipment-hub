import { supabase } from "@/integrations/supabase/client";
import { classifyQuery, normalizeCode, normalizeText } from "@/lib/normalize";
import type {
  AssemblyResult,
  CatalogResult,
  LocalSearchResults,
  ModelResult,
  PartResult,
  SearchFilters,
  SearchScope,
} from "@/lib/types";

/**
 * Search service — universal local search across the corporation database.
 *
 * Every technical identifier is matched both exactly (as entered) and through
 * its normalized form, so `23A-15-00053` and `23A1500053` are equivalent.
 */

const MODEL_SELECT =
  "*, manufacturer:manufacturers(id,name,slug), equipment_type:equipment_types(id,name,name_ar,slug)";
const CATALOG_SELECT =
  "*, manufacturer:manufacturers(id,name,slug), machine_model:machine_models(id,model_name)";
const PART_SELECT = "*, manufacturer:manufacturers(id,name,slug)";
const LIMIT = 50;

function sanitize(value: string): string {
  return value.replace(/[%,()*]/g, " ").trim();
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

  // aliases
  const aliasRes = await supabase
    .from("machine_aliases")
    .select("machine_model_id")
    .ilike("normalized_alias", `%${code}%`)
    .limit(LIMIT);
  // serial prefix / serial number ranges
  const serialRes = await supabase
    .from("serial_ranges")
    .select("machine_model_id, serial_prefix, serial_from, serial_to")
    .limit(500);

  const extraIds = new Set<string>((aliasRes.data ?? []).map((a) => a.machine_model_id));
  const serialQuery = filters.serialNumber ? normalizeCode(filters.serialNumber) : code;
  const numeric = Number(serialQuery.replace(/\D/g, ""));
  for (const r of serialRes.data ?? []) {
    const prefixMatch = r.serial_prefix
      ? normalizeCode(r.serial_prefix) === serialQuery ||
        serialQuery.startsWith(normalizeCode(r.serial_prefix))
      : false;
    const from = Number((r.serial_from ?? "").replace(/\D/g, ""));
    const to = r.serial_to ? Number(r.serial_to.replace(/\D/g, "")) : Number.POSITIVE_INFINITY;
    const inRange =
      Number.isFinite(numeric) && numeric > 0 && Number.isFinite(from) && numeric >= from && numeric <= to;
    if (prefixMatch || inRange) extraIds.add(r.machine_model_id);
  }

  const missing = [...extraIds].filter((id) => !found.has(id));
  if (missing.length > 0) {
    let q2 = supabase.from("machine_models").select(MODEL_SELECT).in("id", missing).limit(LIMIT);
    if (filters.manufacturerId) q2 = q2.eq("manufacturer_id", filters.manufacturerId);
    if (filters.equipmentTypeId) q2 = q2.eq("equipment_type_id", filters.equipmentTypeId);
    const extra = await q2;
    for (const row of (extra.data ?? []) as ModelResult[]) found.set(row.id, row);
  }

  return [...found.values()];
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
  const missing = [...new Set((aliasRes.data ?? []).map((a) => a.part_id))].filter(
    (id) => !found.has(id),
  );
  if (missing.length > 0) {
    const extra = await supabase.from("parts").select(PART_SELECT).in("id", missing).limit(LIMIT);
    for (const row of (extra.data ?? []) as PartResult[]) found.set(row.id, row);
  }

  if (filters.machineModelId) {
    const compat = await supabase
      .from("part_machine_compatibility")
      .select("part_id")
      .eq("machine_model_id", filters.machineModelId);
    const allowed = new Set((compat.data ?? []).map((c) => c.part_id));
    return [...found.values()].filter((p) => allowed.has(p.id));
  }

  return [...found.values()];
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
  return (data ?? []) as CatalogResult[];
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
  /** Local-first universal search. Never touches external sources. */
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

    const kind = classifyQuery(raw);
    const rank = <T extends { id: string }>(rows: T[], exact: (row: T) => boolean) =>
      [...rows].sort((a, b) => Number(exact(b)) - Number(exact(a)));

    const rankedParts = rank(parts, (p) => normalizeCode(p.primary_part_number) === code);
    const rankedModels = rank(models, (m) => normalizeCode(m.model_name) === code);

    return {
      query: raw,
      normalizedQuery: code,
      models: kind === "model" ? rankedModels : rankedModels,
      parts: rankedParts,
      catalogs,
      assemblies,
      total: models.length + parts.length + catalogs.length + assemblies.length,
    };
  },
};
