import type { ExternalSource } from "@/lib/types";

import {
  APIConnector,
  AuthorizedFeedConnector,
  ManualURLConnector,
  PDFSourceConnector,
  PublicCatalogConnector,
} from "./baseConnectors";
import { DemoConnector } from "./demoConnector";
import { KPartPublicConnector } from "./kPartConnector";
import type { SourceConnector } from "./types";

type Factory = (source: ExternalSource) => SourceConnector;

/**
 * Connector registry. Each external source row references a `connector_key`;
 * adding a new approved source means registering one isolated adapter here.
 */
const factories: Record<string, Factory> = {
  demo: (source) => new DemoConnector({ source }),
  api: (source) => new APIConnector({ source }),
  public_catalog: (source) => new PublicCatalogConnector({ source }),
  authorized_feed: (source) => new AuthorizedFeedConnector({ source }),
  manual_url: (source) => new ManualURLConnector({ source }),
  pdf_source: (source) => new PDFSourceConnector({ source }),
  k_part_public: (source) => new KPartPublicConnector({ source }),
};

export function getConnector(source: ExternalSource): SourceConnector | null {
  const factory = factories[source.connector_key] ?? factories[source.source_type];
  return factory ? factory(source) : null;
}

export function registeredConnectorKeys(): string[] {
  return Object.keys(factories);
}
