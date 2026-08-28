import { supabase } from "@/integrations/supabase/client";
import type {
  Assembly,
  AssemblyPart,
  Catalog,
  CatalogFile,
  CatalogSection,
  EquipmentType,
  MachineAlias,
  Manufacturer,
  Part,
  PartAlias,
  SerialRange,
} from "@/lib/types";

/**
 * Repository layer — the ONLY place that talks to the database for catalog
 * data. UI components consume services/hooks, never queries.
 */

const MODEL_SELECT =
  "*, manufacturer:manufacturers(id,name,slug), equipment_type:equipment_types(id,name,name_ar,slug)";
const CATALOG_SELECT =
  "*, manufacturer:manufacturers(id,name,slug), machine_model:machine_models(id,model_name)";
const PART_SELECT = "*, manufacturer:manufacturers(id,name,slug)";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export type Page<T> = { rows: T[]; total: number };

export const catalogRepository = {
  async getStats() {
    const [manufacturers, types, models, catalogs, parts, sources] = await Promise.all([
      supabase.from("manufacturers").select("id", { count: "exact", head: true }),
      supabase.from("equipment_types").select("id", { count: "exact", head: true }),
      supabase.from("machine_models").select("id", { count: "exact", head: true }),
      supabase.from("catalogs").select("id", { count: "exact", head: true }),
      supabase.from("parts").select("id", { count: "exact", head: true }),
      supabase
        .from("external_sources")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true),
    ]);
    const firstError = [manufacturers, types, models, catalogs, parts, sources].find(
      (r) => r.error,
    );
    if (firstError?.error) throw new Error(firstError.error.message);
    return {
      manufacturers: manufacturers.count ?? 0,
      equipmentTypes: types.count ?? 0,
      models: models.count ?? 0,
      catalogs: catalogs.count ?? 0,
      parts: parts.count ?? 0,
      enabledSources: sources.count ?? 0,
    };
  },

  async listManufacturers(includeInactive = false): Promise<Manufacturer[]> {
    let q = supabase.from("manufacturers").select("*").order("name");
    if (!includeInactive) q = q.eq("active", true);
    return unwrap(await q);
  },

  async getManufacturerBySlug(slug: string): Promise<Manufacturer | null> {
    const { data, error } = await supabase
      .from("manufacturers")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async listEquipmentTypes(includeInactive = false): Promise<EquipmentType[]> {
    let q = supabase.from("equipment_types").select("*").order("name");
    if (!includeInactive) q = q.eq("active", true);
    return unwrap(await q);
  },

  async listModels(params: {
    manufacturerId?: string;
    equipmentTypeId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    let q = supabase
      .from("machine_models")
      .select(MODEL_SELECT, { count: "exact" })
      .order("model_name")
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (params.manufacturerId) q = q.eq("manufacturer_id", params.manufacturerId);
    if (params.equipmentTypeId) q = q.eq("equipment_type_id", params.equipmentTypeId);
    if (params.search) q = q.ilike("model_name", `%${params.search}%`);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const modelIds = (data ?? []).map((model) => model.id);
    let catalogCounts: Record<string, number> = {};
    if (modelIds.length > 0) {
      const { data: catalogRows, error: catalogError } = await supabase
        .from("catalogs")
        .select("machine_model_id")
        .in("machine_model_id", modelIds);
      if (catalogError) throw new Error(catalogError.message);
      catalogCounts = (catalogRows ?? []).reduce<Record<string, number>>((acc, item) => {
        if (item.machine_model_id)
          acc[item.machine_model_id] = (acc[item.machine_model_id] ?? 0) + 1;
        return acc;
      }, {});
    }
    return { rows: data ?? [], total: count ?? 0, catalogCounts };
  },

  async getModel(id: string) {
    const [model, aliases, serials, catalogs, compat, assets] = await Promise.all([
      supabase.from("machine_models").select(MODEL_SELECT).eq("id", id).maybeSingle(),
      supabase.from("machine_aliases").select("*").eq("machine_model_id", id),
      supabase.from("serial_ranges").select("*").eq("machine_model_id", id).order("serial_from"),
      supabase.from("catalogs").select(CATALOG_SELECT).eq("machine_model_id", id).order("title"),
      supabase
        .from("part_machine_compatibility")
        .select("*, part:parts(*, manufacturer:manufacturers(id,name,slug))")
        .eq("machine_model_id", id)
        .limit(200),
      supabase
        .from("machine_assets")
        .select("id, serial_number, asset_number, branch, manufacture_year, machine_model_id")
        .eq("machine_model_id", id)
        .order("serial_number"),
    ]);
    if (model.error) throw new Error(model.error.message);
    if (!model.data) return null;
    return {
      model: model.data,
      aliases: (aliases.data ?? []) as MachineAlias[],
      serialRanges: (serials.data ?? []) as SerialRange[],
      catalogs: catalogs.data ?? [],
      compatibility: compat.data ?? [],
      assets: assets.data ?? [],
    };
  },

  async catalogCountsByModel(modelIds: string[]): Promise<Record<string, number>> {
    if (modelIds.length === 0) return {};
    const { data, error } = await supabase
      .from("catalogs")
      .select("machine_model_id")
      .in("machine_model_id", modelIds);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce<Record<string, number>>((acc, item) => {
      if (item.machine_model_id) acc[item.machine_model_id] = (acc[item.machine_model_id] ?? 0) + 1;
      return acc;
    }, {});
  },

  async listCatalogs(params: {
    manufacturerId?: string;
    machineModelId?: string;
    catalogType?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    let q = supabase
      .from("catalogs")
      .select(CATALOG_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (params.manufacturerId) q = q.eq("manufacturer_id", params.manufacturerId);
    if (params.machineModelId) q = q.eq("machine_model_id", params.machineModelId);
    if (params.catalogType) q = q.eq("catalog_type", params.catalogType);
    if (params.search) q = q.ilike("title", `%${params.search}%`);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: data ?? [], total: count ?? 0 };
  },

  async getCatalog(id: string) {
    const [catalog, sections, assemblies, files] = await Promise.all([
      supabase.from("catalogs").select(CATALOG_SELECT).eq("id", id).maybeSingle(),
      supabase.from("catalog_sections").select("*").eq("catalog_id", id).order("sort_order"),
      supabase.from("assemblies").select("*").eq("catalog_id", id).order("sort_order"),
      supabase
        .from("catalog_files")
        .select("*")
        .eq("catalog_id", id)
        .order("uploaded_at", { ascending: false }),
    ]);
    if (catalog.error) throw new Error(catalog.error.message);
    if (!catalog.data) return null;
    return {
      catalog: catalog.data,
      sections: (sections.data ?? []) as CatalogSection[],
      assemblies: (assemblies.data ?? []) as Assembly[],
      files: (files.data ?? []) as CatalogFile[],
    };
  },

  async listParts(params: {
    manufacturerId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    let q = supabase
      .from("parts")
      .select(PART_SELECT, { count: "exact" })
      .order("primary_part_number")
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (params.manufacturerId) q = q.eq("manufacturer_id", params.manufacturerId);
    if (params.search) {
      const s = params.search.replace(/[%,()]/g, "");
      q = q.or(`primary_part_number.ilike.%${s}%,description.ilike.%${s}%`);
    }
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: data ?? [], total: count ?? 0 };
  },

  async getPart(id: string) {
    const [part, aliases, compat, assemblyParts] = await Promise.all([
      supabase.from("parts").select(PART_SELECT).eq("id", id).maybeSingle(),
      supabase.from("part_aliases").select("*").eq("part_id", id),
      supabase
        .from("part_machine_compatibility")
        .select(
          "*, machine_model:machine_models(id,model_name,manufacturer_id), serial_range:serial_ranges(id,display_value,serial_from,serial_to)",
        )
        .eq("part_id", id),
      supabase
        .from("assembly_parts")
        .select(
          "*, assembly:assemblies(id,title,assembly_number,catalog_id, catalog:catalogs(id,title,catalog_number,catalog_type)), superseded_by:parts!assembly_parts_superseded_by_part_id_fkey(id,primary_part_number,description)",
        )
        .eq("part_id", id),
    ]);
    if (part.error) throw new Error(part.error.message);
    if (!part.data) return null;
    return {
      part: part.data,
      aliases: (aliases.data ?? []) as PartAlias[],
      compatibility: compat.data ?? [],
      assemblyParts: assemblyParts.data ?? [],
    };
  },

  async getAssembly(id: string) {
    const [assembly, parts, diagrams] = await Promise.all([
      supabase
        .from("assemblies")
        .select("*, catalog:catalogs(id,title,catalog_number,catalog_type)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("assembly_parts")
        .select(
          "*, part:parts!assembly_parts_part_id_fkey(id,primary_part_number,description,manufacturer_id)",
        )
        .eq("assembly_id", id)
        .order("sort_order"),
      supabase.from("diagrams").select("*").eq("assembly_id", id),
    ]);
    if (assembly.error) throw new Error(assembly.error.message);
    if (!assembly.data) return null;
    return {
      assembly: assembly.data,
      parts: (parts.data ?? []) as (AssemblyPart & {
        part: Pick<Part, "id" | "primary_part_number" | "description" | "manufacturer_id"> | null;
      })[],
      diagrams: diagrams.data ?? [],
    };
  },

  async listSerialRanges(modelId?: string): Promise<SerialRange[]> {
    let q = supabase.from("serial_ranges").select("*").order("created_at", { ascending: false });
    if (modelId) q = q.eq("machine_model_id", modelId);
    return unwrap(await q);
  },

  async manufacturerStats(manufacturerId: string) {
    const [models, catalogs, parts] = await Promise.all([
      supabase
        .from("machine_models")
        .select("id", { count: "exact", head: true })
        .eq("manufacturer_id", manufacturerId),
      supabase
        .from("catalogs")
        .select("id", { count: "exact", head: true })
        .eq("manufacturer_id", manufacturerId),
      supabase
        .from("parts")
        .select("id", { count: "exact", head: true })
        .eq("manufacturer_id", manufacturerId),
    ]);
    return {
      models: models.count ?? 0,
      catalogs: catalogs.count ?? 0,
      parts: parts.count ?? 0,
    };
  },

  async getCatalogsByIds(ids: string[]): Promise<Catalog[]> {
    if (ids.length === 0) return [];
    return unwrap(await supabase.from("catalogs").select(CATALOG_SELECT).in("id", ids));
  },

  async getPartsByIds(ids: string[]): Promise<Part[]> {
    if (ids.length === 0) return [];
    return unwrap(await supabase.from("parts").select(PART_SELECT).in("id", ids));
  },

  async getModelsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return unwrap(await supabase.from("machine_models").select(MODEL_SELECT).in("id", ids));
  },
};
