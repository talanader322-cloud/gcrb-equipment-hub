import { supabase } from "@/integrations/supabase/client";
import type { DownloadRecord, Favorite, RecentItem, SavedSearch } from "@/lib/types";

export type EntityType = "machine_model" | "catalog" | "part" | "assembly" | "manufacturer";

/** Per-user workspace data. Every row is protected by an owner-scoped policy. */
export const personalRepository = {
  async listFavorites(): Promise<Favorite[]> {
    const { data, error } = await supabase
      .from("favorites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async isFavorite(entityType: EntityType, entityId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("favorites")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
  },

  async toggleFavorite(userId: string, entityType: EntityType, entityId: string): Promise<boolean> {
    const existing = await supabase
      .from("favorites")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (existing.data) {
      const { error } = await supabase.from("favorites").delete().eq("id", existing.data.id);
      if (error) throw new Error(error.message);
      return false;
    }
    const { error } = await supabase
      .from("favorites")
      .insert({ user_id: userId, entity_type: entityType, entity_id: entityId });
    if (error) throw new Error(error.message);
    return true;
  },

  async listRecent(limit = 20): Promise<RecentItem[]> {
    const { data, error } = await supabase
      .from("recent_items")
      .select("*")
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async trackRecent(userId: string, entityType: EntityType, entityId: string): Promise<void> {
    await supabase.from("recent_items").upsert(
      {
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
        opened_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entity_type,entity_id" },
    );
  },

  async listSavedSearches(limit = 20): Promise<SavedSearch[]> {
    const { data, error } = await supabase
      .from("saved_searches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async saveSearch(userId: string, query: string, filters: Record<string, unknown>): Promise<void> {
    const { error } = await supabase
      .from("saved_searches")
      .insert({ user_id: userId, query, filters: filters as never });
    if (error) throw new Error(error.message);
  },

  async deleteSavedSearch(id: string): Promise<void> {
    const { error } = await supabase.from("saved_searches").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async listDownloads(): Promise<
    (DownloadRecord & { catalog: { id: string; title: string } | null })[]
  > {
    const { data, error } = await supabase
      .from("download_records")
      .select("*, catalog:catalogs(id,title)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as (DownloadRecord & { catalog: { id: string; title: string } | null })[];
  },

  async beginDownload(userId: string, catalogId: string): Promise<DownloadRecord> {
    const existing = await supabase
      .from("download_records")
      .select("*")
      .eq("user_id", userId)
      .eq("catalog_id", catalogId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data) {
      const { data, error } = await supabase
        .from("download_records")
        .update({
          status: "downloading",
          progress: 0,
          local_reference: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    const { data, error } = await supabase
      .from("download_records")
      .insert({ user_id: userId, catalog_id: catalogId, status: "downloading", progress: 0 })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateDownload(
    id: string,
    patch: { status?: string; progress?: number; local_reference?: string | null },
  ): Promise<void> {
    const { error } = await supabase
      .from("download_records")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async clearOfflineReference(userId: string, catalogId: string): Promise<void> {
    const { error } = await supabase
      .from("download_records")
      .update({
        status: "removed",
        progress: 0,
        local_reference: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("catalog_id", catalogId);
    if (error) throw new Error(error.message);
  },
};
