import { supabase } from "@/integrations/supabase/client";
import type { ExternalSearchResult, ExternalSource } from "@/lib/types";

export const sourcesRepository = {
  async list(): Promise<ExternalSource[]> {
    const { data, error } = await supabase
      .from("external_sources")
      .select("*")
      .order("priority")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async get(id: string): Promise<ExternalSource | null> {
    const { data, error } = await supabase
      .from("external_sources")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: {
    name: string;
    slug: string;
    source_type: string;
    connector_key: string;
    base_url: string | null;
    enabled: boolean;
    priority: number;
    requires_authentication: boolean;
    configuration: Record<string, unknown>;
  }): Promise<ExternalSource> {
    const { data, error } = await supabase
      .from("external_sources")
      .insert({ ...input, configuration: input.configuration as never })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, patch: Partial<ExternalSource>): Promise<void> {
    const { error } = await supabase.from("external_sources").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async recordTest(id: string, ok: boolean, message: string): Promise<void> {
    const patch = ok
      ? { last_success_at: new Date().toISOString(), last_error: null }
      : { last_error: message };
    await supabase.from("external_sources").update(patch).eq("id", id);
  },

  /** Temporary online discovery results — never part of the catalog itself. */
  async listTemporaryResults(query?: string): Promise<ExternalSearchResult[]> {
    let q = supabase
      .from("external_search_results")
      .select("*")
      .order("discovered_at", { ascending: false })
      .limit(200);
    if (query) q = q.eq("query", query);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
