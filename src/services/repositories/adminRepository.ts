import { supabase } from "@/integrations/supabase/client";
import type { ImportJob, Tables } from "@/lib/types";

type Update<T extends keyof Tables> = Tables[T]["Update"];

/** Write-side repository for administration modules (RLS enforces the roles). */
export const adminRepository = {
  /* ---------------- manufacturers ---------------- */
  async createManufacturer(input: {
    name: string;
    short_name: string | null;
    slug: string;
    official_website: string | null;
    logo_url: string | null;
  }) {
    const { error } = await supabase.from("manufacturers").insert(input);
    if (error) throw new Error(error.message);
  },
  async updateManufacturer(id: string, patch: Update<"manufacturers">) {
    const { error } = await supabase.from("manufacturers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },

  /* ---------------- equipment types ---------------- */
  async createEquipmentType(input: {
    name: string;
    name_ar: string | null;
    slug: string;
    icon: string | null;
  }) {
    const { error } = await supabase.from("equipment_types").insert(input);
    if (error) throw new Error(error.message);
  },
  async updateEquipmentType(id: string, patch: Update<"equipment_types">) {
    const { error } = await supabase.from("equipment_types").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },

  /* ---------------- machine models ---------------- */
  async createModel(input: {
    manufacturer_id: string;
    equipment_type_id: string | null;
    model_name: string;
    series: string | null;
    description: string | null;
  }) {
    const { data, error } = await supabase
      .from("machine_models")
      .insert(input)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  },
  async updateModel(id: string, patch: Update<"machine_models">) {
    const { error } = await supabase.from("machine_models").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async addAlias(machine_model_id: string, alias: string) {
    const { error } = await supabase.from("machine_aliases").insert({ machine_model_id, alias });
    if (error) throw new Error(error.message);
  },

  /* ---------------- serial ranges ---------------- */
  async createSerialRange(input: {
    machine_model_id: string;
    serial_prefix: string | null;
    serial_from: string | null;
    serial_to: string | null;
    display_value: string | null;
    notes: string | null;
  }) {
    const { error } = await supabase.from("serial_ranges").insert(input);
    if (error) throw new Error(error.message);
  },
  async deleteSerialRange(id: string) {
    const { error } = await supabase.from("serial_ranges").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  /* ---------------- parts ---------------- */
  async createPart(input: {
    manufacturer_id: string;
    primary_part_number: string;
    description: string | null;
    notes: string | null;
  }) {
    const { data, error } = await supabase.from("parts").insert(input).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  },
  async updatePart(id: string, patch: Update<"parts">) {
    const { error } = await supabase.from("parts").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async addPartAlias(part_id: string, alternate_number: string, alias_type = "alternate") {
    const { error } = await supabase
      .from("part_aliases")
      .insert({ part_id, alternate_number, alias_type });
    if (error) throw new Error(error.message);
  },

  /* ---------------- catalogs ---------------- */
  async createCatalog(input: {
    manufacturer_id: string;
    machine_model_id: string | null;
    catalog_number: string | null;
    title: string;
    catalog_type: string;
    language: string;
    revision: string | null;
    serial_from: string | null;
    serial_to: string | null;
  }) {
    const { data, error } = await supabase.from("catalogs").insert(input).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  },
  async updateCatalog(id: string, patch: Update<"catalogs">) {
    const { error } = await supabase.from("catalogs").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async attachCatalogFile(input: {
    catalog_id: string;
    storage_provider: string;
    storage_bucket: string;
    storage_path: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
  }) {
    const { data, error } = await supabase
      .from("catalog_files")
      .insert(input)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("catalogs").update({ file_id: data.id }).eq("id", input.catalog_id);
    return data.id;
  },
  async createSection(input: {
    catalog_id: string;
    section_number: string | null;
    title: string;
    sort_order: number;
    page_from: number | null;
    page_to: number | null;
  }) {
    const { error } = await supabase.from("catalog_sections").insert(input);
    if (error) throw new Error(error.message);
  },
  async createAssembly(input: {
    catalog_id: string;
    section_id: string | null;
    assembly_number: string | null;
    title: string;
    sort_order: number;
  }) {
    const { error } = await supabase.from("assemblies").insert(input);
    if (error) throw new Error(error.message);
  },

  /* users & roles are managed through src/lib/auth.functions.ts (server-side, admin-only) */

  /* ---------------- import jobs ---------------- */
  async listImportJobs(): Promise<ImportJob[]> {
    const { data, error } = await supabase
      .from("import_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
