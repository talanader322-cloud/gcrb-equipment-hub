import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];

export type Manufacturer = Tables["manufacturers"]["Row"];
export type EquipmentType = Tables["equipment_types"]["Row"];
export type MachineModel = Tables["machine_models"]["Row"];
export type MachineAlias = Tables["machine_aliases"]["Row"];
export type SerialRange = Tables["serial_ranges"]["Row"];
export type Catalog = Tables["catalogs"]["Row"];
export type CatalogFile = Tables["catalog_files"]["Row"];
export type CatalogSection = Tables["catalog_sections"]["Row"];
export type Assembly = Tables["assemblies"]["Row"];
export type AssemblyPart = Tables["assembly_parts"]["Row"];
export type Part = Tables["parts"]["Row"];
export type PartAlias = Tables["part_aliases"]["Row"];
export type ExternalSource = Tables["external_sources"]["Row"];
export type ExternalSearchResult = Tables["external_search_results"]["Row"];
export type ImportJob = Tables["import_jobs"]["Row"];
export type Favorite = Tables["favorites"]["Row"];
export type RecentItem = Tables["recent_items"]["Row"];
export type SavedSearch = Tables["saved_searches"]["Row"];
export type DownloadRecord = Tables["download_records"]["Row"];
export type Profile = Tables["profiles"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const APP_ROLES: AppRole[] = [
  "system_admin",
  "catalog_manager",
  "technical_user",
  "viewer",
];

export const CATALOG_TYPES = [
  "parts_catalog",
  "service_manual",
  "workshop_manual",
  "operation_manual",
  "hydraulic_manual",
  "electrical_manual",
  "engine_manual",
  "technical_manual",
  "other",
] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];

export const SOURCE_TYPES = [
  "api",
  "public_catalog",
  "authorized_feed",
  "manual_url",
  "pdf_source",
  "demo",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type SearchMode = "auto" | "local" | "online";
export type SearchScope = "all" | "models" | "parts" | "catalogs" | "assemblies";

export type SearchFilters = {
  manufacturerId?: string;
  equipmentTypeId?: string;
  machineModelId?: string;
  catalogType?: string;
  serialNumber?: string;
  sourceId?: string;
  origin?: "all" | "local" | "online";
};

export type ModelResult = MachineModel & {
  manufacturer: Pick<Manufacturer, "id" | "name" | "slug"> | null;
  equipment_type: Pick<EquipmentType, "id" | "name" | "name_ar" | "slug"> | null;
};

export type PartResult = Part & {
  manufacturer: Pick<Manufacturer, "id" | "name" | "slug"> | null;
};

export type CatalogResult = Catalog & {
  manufacturer: Pick<Manufacturer, "id" | "name" | "slug"> | null;
  machine_model: Pick<MachineModel, "id" | "model_name"> | null;
};

export type AssemblyResult = Assembly & {
  catalog: Pick<Catalog, "id" | "title" | "catalog_number"> | null;
};

/** A normalized result coming from an external source connector. */
export type OnlineResult = {
  sourceId: string;
  sourceName: string;
  sourceSlug: string;
  isDemo: boolean;
  externalId: string;
  resultType: "catalog" | "model" | "part";
  title: string;
  manufacturer: string | null;
  model: string | null;
  partNumber: string | null;
  description: string | null;
  catalogType: string | null;
  serialRange: string | null;
  equipmentType: string | null;
  externalUrl: string | null;
  importable: boolean;
  metadata: Record<string, string | number | boolean | null>;
};

export type LocalSearchResults = {
  query: string;
  normalizedQuery: string;
  models: ModelResult[];
  parts: PartResult[];
  catalogs: CatalogResult[];
  assemblies: AssemblyResult[];
  total: number;
};
