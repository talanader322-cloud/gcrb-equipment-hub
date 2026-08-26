import { normalizeCode } from "@/lib/normalize";
import type { OnlineResult, SearchFilters } from "@/lib/types";

import type { CatalogMetadata, ConnectorContext, ImportPayload, SourceConnector } from "./types";

/**
 * DEMO connector — clearly marked synthetic source.
 *
 * Its only purpose is to validate the online-search / preview / import /
 * duplicate-detection architecture. It performs no network requests and must
 * never be presented as real live external data.
 */
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
    const q = query.trim();
    if (!q) return [];
    const code = normalizeCode(q);
    const results: OnlineResult[] = [];

    // Known validation fixtures ------------------------------------------------
    if (code.startsWith("GD511")) {
      results.push({
        ...this.base(`demo-catalog-gd511a1-parts`),
        resultType: "catalog",
        title: "KOMATSU GD511A-1 Parts Catalog",
        manufacturer: "Komatsu",
        model: "GD511A-1",
        equipmentType: "Motor Grader",
        serialRange: "10001-UP",
        catalogType: "parts_catalog",
        description: "Demo parts catalog metadata for the GD511A-1 motor grader.",
      });
      results.push({
        ...this.base(`demo-catalog-gd511a1-service`),
        resultType: "catalog",
        title: "KOMATSU GD511A-1 Shop / Service Manual",
        manufacturer: "Komatsu",
        model: "GD511A-1",
        equipmentType: "Motor Grader",
        serialRange: "10001-UP",
        catalogType: "service_manual",
        description: "Demo service manual metadata for the GD511A-1 motor grader.",
      });
      results.push({
        ...this.base(`demo-model-gd655-5`),
        resultType: "model",
        title: "KOMATSU GD655-5 Motor Grader",
        manufacturer: "Komatsu",
        model: "GD655-5",
        equipmentType: "Motor Grader",
        serialRange: "50001-UP",
        catalogType: null,
        description: "Demo equipment model discovered online (not yet in the local database).",
      });
    }

    if (code.startsWith("23A15") || code.includes("TRANSMISSION")) {
      results.push({
        ...this.base(`demo-part-23A1500053`),
        resultType: "part",
        title: "23A-15-00053 TRANSMISSION ASS'Y",
        manufacturer: "Komatsu",
        model: "GD511A-1",
        equipmentType: "Motor Grader",
        partNumber: "23A-15-00053",
        description: "TRANSMISSION ASS'Y",
        catalogType: null,
      });
      results.push({
        ...this.base(`demo-part-23A1500061`),
        resultType: "part",
        title: "23A-15-00061 TRANSMISSION ASS'Y (alternate)",
        manufacturer: "Komatsu",
        model: "GD511A-1",
        equipmentType: "Motor Grader",
        partNumber: "23A-15-00061",
        description: "TRANSMISSION ASS'Y",
        catalogType: null,
      });
    }

    // Generic echo result so any query demonstrates the workflow ---------------
    if (results.length === 0) {
      results.push({
        ...this.base(`demo-generic-${code || "query"}`),
        resultType: "catalog",
        title: `Demo catalog record matching "${q}"`,
        manufacturer: "Komatsu",
        model: q.toUpperCase(),
        equipmentType: null,
        catalogType: "technical_manual",
        description: "Synthetic demo record generated to validate the online search workflow.",
      });
    }

    return results;
  }

  async getResultDetails(externalId: string): Promise<OnlineResult | null> {
    // Generic echo records encode their query code in the id, so rebuild them
    // directly instead of searching the fixture set.
    const generic = externalId.startsWith("demo-generic-")
      ? externalId.slice("demo-generic-".length)
      : null;
    if (generic) {
      const found = await this.search(generic, {});
      return found.find((r) => r.externalId === externalId) ?? null;
    }
    const all = await this.search("GD511A-1", {});
    const parts = await this.search("23A-15-00053", {});
    return [...all, ...parts].find((r) => r.externalId === externalId) ?? null;
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
    return result.importable && result.isDemo;
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
      ok: true,
      message: "Demo connector is operational (synthetic data, no network request performed).",
    };
  }
}
