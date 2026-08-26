import { normalizeCode } from "@/lib/normalize";
import type { OnlineResult, SearchFilters } from "@/lib/types";

import type { CatalogMetadata, ConnectorContext, ImportPayload, SourceConnector } from "./types";

/** Development-only connector. It never returns results in production and
 * never fabricates a generic match for an unknown query. */
export class DemoConnector implements SourceConnector {
  readonly category = "demo" as const;
  readonly isDemo = true;

  constructor(private readonly ctx: ConnectorContext) {}

  get key(): string {
    return this.ctx.source.connector_key;
  }

  private base(externalId: string): OnlineResult {
    return {
      sourceId: this.ctx.source.id,
      sourceName: this.ctx.source.name,
      sourceSlug: this.ctx.source.slug,
      isDemo: true,
      externalId,
      resultType: "catalog",
      title: "",
      manufacturer: null,
      model: null,
      partNumber: null,
      description: null,
      catalogType: null,
      serialRange: null,
      equipmentType: null,
      externalUrl: null,
      importable: true,
      metadata: { demo: true, generated_by: "demo-connector" },
    };
  }

  async search(query: string, _filters: SearchFilters): Promise<OnlineResult[]> {
    if (import.meta.env.PROD) return [];
    const q = query.trim();
    if (!q) return [];
    const code = normalizeCode(q);
    const results: OnlineResult[] = [];

    if (code.startsWith("GD511")) {
      results.push({
        ...this.base("demo-catalog-gd511a1-parts"),
        title: "KOMATSU GD511A-1 Parts Catalog",
        manufacturer: "Komatsu",
        model: "GD511A-1",
        equipmentType: "Motor Grader",
        serialRange: "10001-UP",
        catalogType: "parts_catalog",
        description: "Development fixture only.",
      });
    }

    if (code.startsWith("23A15") || code.includes("TRANSMISSION")) {
      results.push({
        ...this.base("demo-part-23A1500053"),
        resultType: "part",
        title: "23A-15-00053 TRANSMISSION ASS'Y",
        manufacturer: "Komatsu",
        model: "GD511A-1",
        equipmentType: "Motor Grader",
        partNumber: "23A-15-00053",
        description: "Development fixture only.",
        catalogType: null,
      });
    }

    return results;
  }

  async getResultDetails(externalId: string): Promise<OnlineResult | null> {
    if (import.meta.env.PROD) return null;
    const all = [
      ...(await this.search("GD511A-1", {})),
      ...(await this.search("23A-15-00053", {})),
    ];
    return all.find((result) => result.externalId === externalId) ?? null;
  }

  async getCatalogMetadata(externalId: string): Promise<CatalogMetadata | null> {
    const result = await this.getResultDetails(externalId);
    if (!result) return null;
    return {
      manufacturer: result.manufacturer,
      model: result.model,
      equipmentType: result.equipmentType,
      serialRange: result.serialRange,
      catalogType: result.catalogType,
      catalogNumber: null,
      title: result.title,
      language: "en",
      revision: null,
      pageCount: null,
    };
  }

  canImport(result: OnlineResult): boolean {
    return !import.meta.env.PROD && result.importable && result.isDemo;
  }

  importMetadata(result: OnlineResult): ImportPayload {
    const serial = result.serialRange ?? null;
    const serialFrom = serial ? (serial.split("-")[0] ?? null) : null;
    return {
      manufacturerName: result.manufacturer,
      equipmentTypeName: result.equipmentType,
      modelName: result.model,
      serialFrom,
      serialTo: null,
      serialDisplay: serial,
      catalogNumber: null,
      catalogTitle: result.title,
      catalogType: result.catalogType ?? "other",
      language: "en",
      revision: null,
      partNumber: result.partNumber,
      partDescription: result.description,
      externalReference: result.externalId,
      externalUrl: result.externalUrl,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: !import.meta.env.PROD,
      message: import.meta.env.PROD
        ? "Demo connector is disabled in production."
        : "Demo connector is available for development fixtures only.",
    };
  }
}
