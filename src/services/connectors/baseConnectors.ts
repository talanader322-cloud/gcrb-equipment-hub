import type { OnlineResult, SearchFilters } from "@/lib/types";

import type {
  CatalogMetadata,
  ConnectorCategory,
  ConnectorContext,
  ImportPayload,
  SourceConnector,
} from "./types";

/**
 * Base connector categories.
 *
 * Each category is a placeholder adapter for a class of APPROVED source. They
 * intentionally return no results until an authorized integration (official OEM
 * API, licensed feed, permitted public endpoint, uploaded files) is configured
 * for the specific source by an administrator. Nothing here scrapes or bypasses
 * access controls.
 */
abstract class BaseConnector implements SourceConnector {
  readonly isDemo = false;
  abstract readonly category: ConnectorCategory;

  protected constructor(protected readonly ctx: ConnectorContext) {}

  get key(): string {
    return this.ctx.source.connector_key;
  }

  protected notConfigured(): string {
    return `Source "${this.ctx.source.name}" has no approved integration configured yet.`;
  }

  async search(_query: string, _filters: SearchFilters): Promise<OnlineResult[]> {
    return [];
  }

  async getResultDetails(_externalId: string): Promise<OnlineResult | null> {
    return null;
  }

  async getCatalogMetadata(_externalId: string): Promise<CatalogMetadata | null> {
    return null;
  }

  canImport(result: OnlineResult): boolean {
    return result.importable;
  }

  importMetadata(result: OnlineResult): ImportPayload {
    return {
      manufacturerName: result.manufacturer,
      equipmentTypeName: result.equipmentType,
      modelName: result.model,
      serialFrom: null,
      serialTo: null,
      serialDisplay: result.serialRange,
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
    return { ok: false, message: this.notConfigured() };
  }
}

/** Official OEM / authorized catalog REST APIs. */
export class APIConnector extends BaseConnector {
  readonly category = "api" as const;
  constructor(ctx: ConnectorContext) {
    super(ctx);
  }
}

/** Explicitly permitted public catalog endpoints. */
export class PublicCatalogConnector extends BaseConnector {
  readonly category = "public_catalog" as const;
  constructor(ctx: ConnectorContext) {
    super(ctx);
  }
}

/** Licensed / authorized technical data feeds. */
export class AuthorizedFeedConnector extends BaseConnector {
  readonly category = "authorized_feed" as const;
  constructor(ctx: ConnectorContext) {
    super(ctx);
  }
}

/** Manually registered document URLs provided by authorized staff. */
export class ManualURLConnector extends BaseConnector {
  readonly category = "manual_url" as const;
  constructor(ctx: ConnectorContext) {
    super(ctx);
  }
}

/** Internal corporation PDF/CSV/Excel-derived document collections. */
export class PDFSourceConnector extends BaseConnector {
  readonly category = "pdf_source" as const;
  constructor(ctx: ConnectorContext) {
    super(ctx);
  }
}
