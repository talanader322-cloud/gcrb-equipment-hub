import type { ExternalSource, OnlineResult, SearchFilters } from "@/lib/types";

/**
 * SourceConnector — the modular contract every external catalog source must
 * implement. The application is deliberately NOT coupled to any single
 * external website.
 *
 * Hard rules for every implementation:
 *  - no paywall, subscription, authentication or CAPTCHA bypass
 *  - no scraping of protected or unauthorized content
 *  - credentials are read from server-side environment variables only
 */
export interface SourceConnector {
  readonly key: string;
  readonly category: ConnectorCategory;
  readonly isDemo: boolean;

  search(query: string, filters: SearchFilters): Promise<OnlineResult[]>;
  getResultDetails(externalId: string): Promise<OnlineResult | null>;
  getCatalogMetadata(externalId: string): Promise<CatalogMetadata | null>;
  canImport(result: OnlineResult): boolean;
  importMetadata(result: OnlineResult): ImportPayload;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

export type ConnectorCategory =
  | "api"
  | "public_catalog"
  | "authorized_feed"
  | "manual_url"
  | "pdf_source"
  | "demo";

export type CatalogMetadata = {
  manufacturer: string | null;
  model: string | null;
  equipmentType: string | null;
  serialRange: string | null;
  catalogType: string | null;
  catalogNumber: string | null;
  title: string;
  language: string | null;
  revision: string | null;
  pageCount: number | null;
};

/** Neutral shape the import service maps into corporation database records. */
export type ImportPayload = {
  manufacturerName: string | null;
  equipmentTypeName: string | null;
  modelName: string | null;
  serialFrom: string | null;
  serialTo: string | null;
  serialDisplay: string | null;
  catalogNumber: string | null;
  catalogTitle: string;
  catalogType: string;
  language: string;
  revision: string | null;
  partNumber: string | null;
  partDescription: string | null;
  externalReference: string;
  externalUrl: string | null;
};

export type ConnectorContext = { source: ExternalSource };
