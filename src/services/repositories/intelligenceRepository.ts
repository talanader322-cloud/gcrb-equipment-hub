import { supabase } from "@/integrations/supabase/client";
import type { DiscoveredDocument, MachineQueryLog, PartAlternate } from "@/lib/types";

/**
 * Intelligence repository — machine query history, catalog page search,
 * discovered documents and part alternatives. Uses the security-definer RPCs
 * from the Phase 4 migration so all catalog mutations stay ACID and
 * permission-gated.
 */

export type CatalogPageSearchHit = {
  page_number: number;
  content: string;
  relevance: number;
};

export type PartAlternateSuggestion = {
  candidate_part_id: string;
  primary_part_number: string;
  description: string | null;
  manufacturer_id: string;
  manufacturer_name: string;
  model_models: string[];
  match_pct: number;
  match_type: string;
  quality_note: string | null;
  basis: string;
  curated: boolean;
};

export const MATCH_TYPES = [
  "identical",
  "supersession",
  "cross_oem",
  "equivalent",
  "pattern",
] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const intelligenceRepository = {
  /* ---------------- machine query history ---------------- */

  async trackModelQuery(machineModelId: string, query: string, matched = true): Promise<void> {
    const { error } = await supabase.from("machine_query_log").insert({
      machine_model_id: machineModelId,
      query,
      matched,
    });
    if (error) {
      // Query logging is best-effort and must never break the search UX.
      console.warn("[intelligence] query log insert failed", error.message);
    }
  },

  async listModelQueries(machineModelId: string, limit = 8): Promise<MachineQueryLog[]> {
    const { data, error } = await supabase
      .from("machine_query_log")
      .select("*")
      .eq("machine_model_id", machineModelId)
      .order("searched_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as MachineQueryLog[];
  },

  /* ---------------- catalog page search ---------------- */

  async searchCatalogPages(catalogId: string, query: string): Promise<CatalogPageSearchHit[]> {
    const { data, error } = await supabase.rpc("search_catalog_pages", {
      p_catalog_id: catalogId,
      p_query: query,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as CatalogPageSearchHit[];
  },

  /* ---------------- part alternatives ---------------- */

  async suggestAlternates(partId: string): Promise<PartAlternateSuggestion[]> {
    const { data, error } = await supabase.rpc("suggest_part_alternates", {
      p_part_id: partId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as PartAlternateSuggestion[];
  },

  async addPartAlternate(input: {
    partId: string;
    alternatePartId: string;
    matchType: MatchType;
    matchPct: number;
    qualityNote?: string | null;
  }): Promise<void> {
    const { error } = await supabase.from("part_alternates").insert({
      part_id: input.partId,
      alternate_part_id: input.alternatePartId,
      match_type: input.matchType,
      match_pct: input.matchPct,
      ...(input.qualityNote ? { quality_note: input.qualityNote } : {}),
    } satisfies Partial<PartAlternate>);
    if (error) throw new Error(error.message);
  },

  async searchParts(query: string, limit = 12) {
    const term = query.replace(/[%,()]/g, "").trim();
    if (!term) return [];
    const { data, error } = await supabase
      .from("parts")
      .select("id, primary_part_number, description, manufacturer:manufacturers(name)")
      .or(`primary_part_number.ilike.%${term}%,description.ilike.%${term}%`)
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      primary_part_number: string;
      description: string | null;
      manufacturer: { name: string } | null;
    }[];
  },

  /* ---------------- discovered documents ---------------- */

  async listDiscovered(params: {
    query?: string;
    catalogId?: string;
    limit?: number;
  }): Promise<DiscoveredDocument[]> {
    let q = supabase
      .from("discovered_documents")
      .select("*")
      .order("discovered_at", { ascending: false })
      .limit(params.limit ?? 30);
    if (params.query) q = q.eq("query", params.query);
    if (params.catalogId) q = q.eq("catalog_id", params.catalogId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as DiscoveredDocument[];
  },

  async saveDiscovered(input: {
    query: string;
    sourceLabel?: string | null;
    sourceId?: string | null;
    title: string;
    url: string;
    kind?: string;
    status?: string;
    verified?: boolean;
  }): Promise<DiscoveredDocument> {
    const { data, error } = await supabase
      .from("discovered_documents")
      .insert({
        query: input.query,
        source_label: input.sourceLabel ?? null,
        source_id: input.sourceId ?? null,
        title: input.title,
        url: input.url,
        kind: "pdf",
        status: input.status ?? "discovered",
        verified: input.verified ?? false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as DiscoveredDocument;
  },

  async updateDiscovered(
    id: string,
    patch: Partial<Pick<DiscoveredDocument, "status" | "catalog_id" | "verified" | "filename">>,
  ): Promise<void> {
    const { error } = await supabase.from("discovered_documents").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },

  /* ---------------- analysis status helpers ---------------- */

  async setCatalogAnalysisStatus(
    catalogId: string,
    status: "none" | "analyzing" | "indexed" | "failed",
  ): Promise<void> {
    const { error } = await supabase
      .from("catalogs")
      .update({ analysis_status: status })
      .eq("id", catalogId);
    if (error) throw new Error(error.message);
  },
};
