import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/lib/types";
import { fileStorageService } from "@/services/storage/fileStorageService";

/**
 * Institution-owned machines (machine_assets) and their original manuals.
 *
 * Rule: an asset manual is never a standalone document. It always points at a
 * real catalog (asset_manuals.catalog_id -> catalogs -> catalog_files), so the
 * unified Catalog Viewer and the offline store work for original CD manuals
 * exactly as they do for internal catalogs.
 */

export type MachineAsset = Tables["machine_assets"]["Row"];
export type AssetManual = Tables["asset_manuals"]["Row"];

const ASSET_SELECT = `
  *,
  machine_model:machine_models(
    id, model_name, series, image_url,
    manufacturer:manufacturers(id, name, slug),
    equipment_type:equipment_types(id, name, name_ar, slug)
  )
`;

export type AssetListRow = MachineAsset & {
  machine_model: {
    id: string;
    model_name: string;
    series: string | null;
    image_url: string | null;
    manufacturer: { id: string; name: string; slug: string } | null;
    equipment_type: { id: string; name: string; name_ar: string | null; slug: string } | null;
  } | null;
  manualCount: number;
};

export type AssetFilters = {
  manufacturerId?: string;
  equipmentTypeId?: string;
  branch?: string;
  manufactureYear?: number;
  search?: string;
  page?: number;
  pageSize?: number;
};

function escapeOr(value: string): string {
  return value.replace(/[(),]/g, " ").trim();
}

export const assetRepository = {
  /** Resolve model ids for model-scoped filters and for model-name search. */
  async resolveModelIds(params: {
    manufacturerId?: string;
    equipmentTypeId?: string;
    modelSearch?: string;
  }): Promise<string[]> {
    let query = supabase.from("machine_models").select("id").limit(1000);
    if (params.manufacturerId) query = query.eq("manufacturer_id", params.manufacturerId);
    if (params.equipmentTypeId) query = query.eq("equipment_type_id", params.equipmentTypeId);
    if (params.modelSearch) query = query.ilike("model_name", `%${params.modelSearch}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.id);
  },

  async listAssets(filters: AssetFilters = {}) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 48;
    const term = filters.search ? escapeOr(filters.search) : "";

    // Model-scoped filters (manufacturer / equipment type) are resolved to model
    // ids first, which is more predictable than filtering an embedded relation.
    let scopedModelIds: string[] | null = null;
    if (filters.manufacturerId || filters.equipmentTypeId) {
      scopedModelIds = await this.resolveModelIds({
        ...(filters.manufacturerId ? { manufacturerId: filters.manufacturerId } : {}),
        ...(filters.equipmentTypeId ? { equipmentTypeId: filters.equipmentTypeId } : {}),
      });
      if (scopedModelIds.length === 0) return { rows: [], total: 0 };
    }

    let query = supabase
      .from("machine_assets")
      .select(ASSET_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (filters.branch) query = query.eq("branch", filters.branch);
    if (filters.manufactureYear) query = query.eq("manufacture_year", filters.manufactureYear);
    if (scopedModelIds) query = query.in("machine_model_id", scopedModelIds);

    if (term) {
      // Search covers serial number, asset number and model name.
      const modelMatches = await this.resolveModelIds({ modelSearch: term });
      const clauses = [
        `serial_number.ilike.%${term}%`,
        `asset_number.ilike.%${term}%`,
        `branch.ilike.%${term}%`,
        `project.ilike.%${term}%`,
      ];
      if (modelMatches.length > 0) {
        clauses.push(`machine_model_id.in.(${modelMatches.join(",")})`);
      }
      query = query.or(clauses.join(","));
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as AssetListRow[];
    const counts = await this.manualCounts(rows.map((row) => row.id));
    return {
      rows: rows.map((row) => ({ ...row, manualCount: counts[row.id] ?? 0 })),
      total: count ?? rows.length,
    };
  },


  /** Assets whose model matches the given machine model. */
  async listAssetsByModel(machineModelId: string) {
    const { data, error } = await supabase
      .from("machine_assets")
      .select(ASSET_SELECT)
      .eq("machine_model_id", machineModelId)
      .order("serial_number");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as AssetListRow[];
    const counts = await this.manualCounts(rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, manualCount: counts[row.id] ?? 0 }));
  },

  async manualCounts(assetIds: string[]): Promise<Record<string, number>> {
    if (assetIds.length === 0) return {};
    const { data, error } = await supabase
      .from("asset_manuals")
      .select("machine_asset_id")
      .in("machine_asset_id", assetIds);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const key = (row as { machine_asset_id: string }).machine_asset_id;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  },

  /** Serial numbers and asset numbers used by the assets filter panels. */
  async listFilterOptions() {
    const { data, error } = await supabase
      .from("machine_assets")
      .select("branch, manufacture_year")
      .limit(1000);
    if (error) throw new Error(error.message);
    const branches = new Set<string>();
    const years = new Set<number>();
    for (const row of (data ?? []) as { branch: string | null; manufacture_year: number | null }[]) {
      if (row.branch) branches.add(row.branch);
      if (row.manufacture_year) years.add(row.manufacture_year);
    }
    return {
      branches: [...branches].sort((a, b) => a.localeCompare(b)),
      years: [...years].sort((a, b) => b - a),
    };
  },

  async getAsset(id: string) {
    const [asset, manuals] = await Promise.all([
      supabase.from("machine_assets").select(ASSET_SELECT).eq("id", id).maybeSingle(),
      supabase
        .from("asset_manuals")
        .select(
          `*, catalog:catalogs(
             id, title, catalog_number, catalog_type, language, revision,
             serial_from, serial_to, page_count, file_id
           )`,
        )
        .eq("machine_asset_id", id)
        .order("uploaded_at", { ascending: false }),
    ]);
    if (asset.error) throw new Error(asset.error.message);
    if (!asset.data) return null;
    if (manuals.error) throw new Error(manuals.error.message);

    const row = asset.data as unknown as AssetListRow;
    let modelCatalogs: {
      id: string;
      title: string;
      catalog_type: string;
      catalog_number: string | null;
      language: string;
      revision: string | null;
    }[] = [];

    if (row.machine_model_id) {
      const { data, error } = await supabase
        .from("catalogs")
        .select("id, title, catalog_type, catalog_number, language, revision")
        .eq("machine_model_id", row.machine_model_id)
        .eq("active", true)
        .order("title");
      if (error) throw new Error(error.message);
      modelCatalogs = data ?? [];
    }

    return {
      asset: row,
      manuals: (manuals.data ?? []) as unknown as (AssetManual & {
        catalog: {
          id: string;
          title: string;
          catalog_number: string | null;
          catalog_type: string;
          language: string;
          revision: string | null;
          serial_from: string | null;
          serial_to: string | null;
          page_count: number | null;
          file_id: string | null;
        } | null;
      })[],
      modelCatalogs,
    };
  },

  async createAsset(input: Tables["machine_assets"]["Insert"]) {
    const { data, error } = await supabase
      .from("machine_assets")
      .insert(input)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  },

  async updateAsset(id: string, patch: Tables["machine_assets"]["Update"]) {
    const { error } = await supabase.from("machine_assets").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },

  /**
   * Asset photos live in the PRIVATE machine-images bucket and are only ever
   * read through short-lived signed URLs. No public bucket is used.
   */
  async uploadAssetPhoto(assetId: string, file: File): Promise<string> {
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `assets/${assetId}/${Date.now()}-${safeName}`;
    const stored = await fileStorageService.upload("machine-images", path, file);
    const previous = await supabase
      .from("machine_assets")
      .select("image_url")
      .eq("id", assetId)
      .maybeSingle();
    try {
      await this.updateAsset(assetId, { image_url: stored.path });
    } catch (error) {
      await fileStorageService.remove("machine-images", stored.path).catch(() => undefined);
      throw error;
    }
    const old = previous.data?.image_url;
    if (old && old !== stored.path) {
      await fileStorageService.remove("machine-images", old).catch(() => undefined);
    }
    return stored.path;
  },

  async signedPhotoUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    try {
      return await fileStorageService.getSignedUrl("machine-images", path, 3600);
    } catch {
      return null;
    }
  },
};
