import { normalizeCode } from "@/lib/normalize";
import type { OnlineResult, SearchFilters } from "@/lib/types";

import type {
  CatalogMetadata,
  ConnectorContext,
  ImportPayload,
  SourceConnector,
} from "./types";

function modelFromQuery(query: string): string | null {
  const cleaned = query
    .trim()
    .replace(/^komatsu\s+/i, "")
    .split(/\s+/)[0]
    ?.replace(/[^A-Za-z0-9-]/g, "")
    .toUpperCase();
  return cleaned && /[A-Z]/.test(cleaned) && /\d/.test(cleaned) ? cleaned : null;
}

function slugForModel(model: string): string {
  return model.toLowerCase();
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSerialRange(text: string, model: string): string | null {
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const afterModel = text.match(
    new RegExp(`${escaped}[^.]{0,120}?S\\/?N\\s*([A-Z0-9-]+(?:\\s*-\\s*[A-Z0-9]+)?(?:\\s+UP)?)`, "i"),
  );
  if (afterModel?.[1]) return afterModel[1].replace(/\s+/g, " ").toUpperCase();
  const generic = text.match(/S\/?N\s*([A-Z0-9-]+(?:\s*-\s*[A-Z0-9]+)?(?:\s+UP)?)/i);
  return generic?.[1] ? generic[1].replace(/\s+/g, " ").toUpperCase() : null;
}

/**
 * K-Part public model connector.
 *
 * Reads only public model metadata pages. It does not sign in, bypass a
 * subscription, access protected diagrams, or download paid manuals.
 */
export class KPartPublicConnector implements SourceConnector {
  readonly category = "public_catalog" as const;
  readonly isDemo = false;

  constructor(private readonly ctx: ConnectorContext) {}

  get key(): string {
    return this.ctx.source.connector_key;
  }

  async search(query: string, _filters: SearchFilters): Promise<OnlineResult[]> {
    const model = modelFromQuery(query);
    if (!model) return [];

    const externalUrl = `https://k-part.com/catalog/komatsu/${slugForModel(model)}/`;
    const response = await fetch(externalUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "GCRB-Equipment-Catalog/1.0 (+institutional catalog metadata lookup)",
      },
    });
    if (!response.ok) return [];

    const html = await response.text();
    const text = stripHtml(html);
    const normalizedText = normalizeCode(text) ?? "";
    const normalizedModel = normalizeCode(model) ?? model;
    if (!normalizedText.includes(normalizedModel)) return [];

    const serialRange = extractSerialRange(text, model);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch?.[1] ? stripHtml(titleMatch[1]) : "";
    const title = pageTitle.toLowerCase().includes("catalog")
      ? pageTitle
      : `Komatsu ${model} Parts Catalog`;

    return [
      {
        sourceId: this.ctx.source.id,
        sourceName: this.ctx.source.name,
        sourceSlug: this.ctx.source.slug,
        isDemo: false,
        externalId: `kpart-komatsu-${slugForModel(model)}`,
        resultType: "catalog",
        title,
        manufacturer: "Komatsu",
        model,
        partNumber: null,
        description:
          "Verified from the public K-Part model page. Full interactive materials may require an active K-Part subscription.",
        catalogType: "parts_catalog",
        serialRange,
        equipmentType: null,
        externalUrl,
        importable: true,
        metadata: {
          verified_public_page: true,
          download_permitted: false,
          subscription_may_be_required: true,
        },
      },
    ];
  }

  async getResultDetails(externalId: string): Promise<OnlineResult | null> {
    const prefix = "kpart-komatsu-";
    if (!externalId.startsWith(prefix)) return null;
    return (await this.search(externalId.slice(prefix.length), {}))[0] ?? null;
  }

  async getCatalogMetadata(externalId: string): Promise<CatalogMetadata | null> {
    const result = await this.getResultDetails(externalId);
    if (!result) return null;
    return {
      manufacturer: result.manufacturer,
      model: result.model,
      equipmentType: null,
      serialRange: result.serialRange,
      catalogType: "parts_catalog",
      catalogNumber: null,
      title: result.title,
      language: "en",
      revision: null,
      pageCount: null,
    };
  }

  canImport(result: OnlineResult): boolean {
    return result.sourceId === this.ctx.source.id && !result.isDemo;
  }

  importMetadata(result: OnlineResult): ImportPayload {
    const serial = result.serialRange;
    let serialFrom: string | null = null;
    let serialTo: string | null = null;
    if (serial) {
      const normalized = serial.replace(/\s+/g, "");
      if (/^\d+-UP$/i.test(normalized)) serialFrom = normalized.split("-")[0] ?? null;
      else if (/^\d+-\d+$/.test(normalized)) [serialFrom, serialTo] = normalized.split("-");
    }
    return {
      manufacturerName: "Komatsu",
      equipmentTypeName: null,
      modelName: result.model,
      serialFrom,
      serialTo,
      serialDisplay: serial,
      catalogNumber: null,
      catalogTitle: result.title,
      catalogType: "parts_catalog",
      language: "en",
      revision: null,
      partNumber: null,
      partDescription: result.description,
      externalReference: result.externalId,
      externalUrl: result.externalUrl,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const response = await fetch("https://k-part.com/", {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "GCRB-Equipment-Catalog/1.0" },
    });
    return response.ok
      ? { ok: true, message: "K-Part public catalog metadata is reachable." }
      : { ok: false, message: `K-Part returned HTTP ${response.status}.` };
  }
}
