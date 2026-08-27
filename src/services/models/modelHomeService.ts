import { assetRepository } from "@/services/repositories/assetRepository";
import { catalogRepository } from "@/services/repositories/catalogRepository";

export const MODEL_CATALOG_CATEGORIES = [
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

export type ModelCatalogCategory = (typeof MODEL_CATALOG_CATEGORIES)[number];

export type ModelCatalogGroup<TCatalog> = {
  category: ModelCatalogCategory;
  catalogs: TCatalog[];
};

const CATALOG_TYPE_ALIASES: Record<string, ModelCatalogCategory> = {
  parts: "parts_catalog",
  part: "parts_catalog",
  parts_catalog: "parts_catalog",
  operation: "operation_manual",
  operator: "operation_manual",
  operation_manual: "operation_manual",
  service: "service_manual",
  service_manual: "service_manual",
  workshop: "workshop_manual",
  workshop_manual: "workshop_manual",
  maintenance: "maintenance_manual",
  maintenance_manual: "maintenance_manual",
  engine: "engine_manual",
  engine_manual: "engine_manual",
  transmission: "transmission_manual",
  transmission_manual: "transmission_manual",
  electrical: "electrical_diagram",
  electrical_diagram: "electrical_diagram",
  wiring_diagram: "electrical_diagram",
  hydraulic: "hydraulic_diagram",
  hydraulic_diagram: "hydraulic_diagram",
  specification: "specification_manual",
  specifications: "specification_manual",
  specification_manual: "specification_manual",
};

export function normalizeCatalogCategory(value: string | null | undefined): ModelCatalogCategory {
  if (!value) return "other";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CATALOG_TYPE_ALIASES[normalized] ?? "other";
}

export function groupModelCatalogs<
  TCatalog extends { id: string; title: string; catalog_type: string },
>(catalogs: TCatalog[]): ModelCatalogGroup<TCatalog>[] {
  const buckets = new Map<ModelCatalogCategory, TCatalog[]>();
  for (const category of MODEL_CATALOG_CATEGORIES) buckets.set(category, []);

  for (const catalog of catalogs) {
    const category = normalizeCatalogCategory(catalog.catalog_type);
    buckets.get(category)!.push(catalog);
  }

  return MODEL_CATALOG_CATEGORIES.map((category) => ({
    category,
    catalogs: buckets.get(category) ?? [],
  }));
}

export function formatSerialApplicability(range: {
  display_value?: string | null;
  serial_prefix?: string | null;
  serial_from?: string | null;
  serial_to?: string | null;
}): string {
  const explicit = range.display_value?.trim();
  if (explicit) return explicit;

  const prefix = range.serial_prefix?.trim() ?? "";
  const from = range.serial_from?.trim() ?? "";
  const to = range.serial_to?.trim() ?? "";
  const start = `${prefix}${from}`.trim();

  if (start && to) return `${start}–${to}`;
  if (start) return `${start}-UP`;
  if (to) return `UP TO ${to}`;
  return "—";
}

/** Stage C domain boundary for the equipment-model home screen. */
export const modelHomeService = {
  async get(modelId: string) {
    const [detail, assets] = await Promise.all([
      catalogRepository.getModel(modelId),
      assetRepository.listAssetsByModel(modelId),
    ]);

    if (!detail) return null;

    const activeCatalogs = detail.catalogs.filter((catalog) => catalog.active !== false);

    return {
      ...detail,
      catalogs: activeCatalogs,
      catalogGroups: groupModelCatalogs(activeCatalogs),
      assets,
      serialApplicability: detail.serialRanges.map((range) => ({
        ...range,
        label: formatSerialApplicability(range),
      })),
    };
  },
};
