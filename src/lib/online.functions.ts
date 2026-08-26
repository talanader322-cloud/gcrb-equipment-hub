import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExternalSource, OnlineResult, SearchFilters } from "@/lib/types";
import { getConnector } from "@/services/connectors/registry";
import { detectDuplicates, importPayload } from "@/services/importService.server";

const filtersSchema = z.object({
  manufacturerId: z.string().optional(),
  equipmentTypeId: z.string().optional(),
  machineModelId: z.string().optional(),
  catalogType: z.string().optional(),
  serialNumber: z.string().optional(),
  sourceId: z.string().optional(),
});

/**
 * Online discovery. Runs entirely server-side so source credentials never
 * reach the browser. Technical users may search; only catalog managers may
 * persist temporary cache rows or connector health metadata.
 */
export const searchOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().min(1), filters: filtersSchema.default({}) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canManage } = await supabase.rpc("can_manage_catalog", { _user_id: userId });

    const { data: sources, error } = await supabase
      .from("external_sources")
      .select("*")
      .eq("enabled", true)
      .order("priority");
    if (error) throw new Error(error.message);

    const results: OnlineResult[] = [];
    const errors: { source: string; message: string }[] = [];

    for (const source of (sources ?? []) as ExternalSource[]) {
      const connector = getConnector(source);
      if (!connector) {
        errors.push({ source: source.name, message: "No connector registered." });
        continue;
      }

      try {
        const found = await connector.search(data.query, data.filters as SearchFilters);
        results.push(...found);

        if (canManage) {
          const statusUpdate = await supabase
            .from("external_sources")
            .update({ last_success_at: new Date().toISOString(), last_error: null })
            .eq("id", source.id);
          if (statusUpdate.error) {
            errors.push({ source: source.name, message: statusUpdate.error.message });
          }
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Unknown connector error";
        errors.push({ source: source.name, message });

        if (canManage) {
          await supabase.from("external_sources").update({ last_error: message }).eq("id", source.id);
        }
      }
    }

    if (canManage && results.length > 0) {
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const cacheWrite = await supabase.from("external_search_results").insert(
        results.map((result) => ({
          source_id: result.sourceId,
          query: data.query,
          result_type: result.resultType,
          external_id: result.externalId,
          title: result.title,
          manufacturer: result.manufacturer,
          model: result.model,
          part_number: result.partNumber,
          description: result.description,
          catalog_type: result.catalogType,
          external_url: result.externalUrl,
          metadata: (result.metadata ?? {}) as never,
          expires_at: expires,
        })),
      );
      if (cacheWrite.error) {
        errors.push({ source: "cache", message: cacheWrite.error.message });
      }
    }

    return { results, errors };
  });

export const testSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canManage } = await supabase.rpc("can_manage_catalog", { _user_id: userId });
    if (!canManage) throw new Error("Only catalog managers may test external sources.");

    const { data: source, error } = await supabase
      .from("external_sources")
      .select("*")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) return { ok: false, message: "Source not found." };

    const connector = getConnector(source as ExternalSource);
    if (!connector) return { ok: false, message: "No connector registered for this source." };

    const outcome = await connector.testConnection();
    const statusUpdate = await supabase
      .from("external_sources")
      .update(
        outcome.ok
          ? { last_success_at: new Date().toISOString(), last_error: null }
          : { last_error: outcome.message },
      )
      .eq("id", data.sourceId);
    if (statusUpdate.error) throw new Error(statusUpdate.error.message);
    return outcome;
  });

export const previewOnlineImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sourceId: z.string().uuid(), externalId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canManage } = await supabase.rpc("can_manage_catalog", { _user_id: userId });
    if (!canManage) throw new Error("Only catalog managers may preview external imports.");

    const { data: source } = await supabase
      .from("external_sources")
      .select("*")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (!source) throw new Error("Source not found.");

    const connector = getConnector(source as ExternalSource);
    if (!connector) throw new Error("No connector registered for this source.");

    const result = await connector.getResultDetails(data.externalId);
    if (!result) throw new Error("External record is no longer available.");

    const payload = connector.importMetadata(result);
    const duplicates = await detectDuplicates(supabase, payload);
    const metadata = await connector.getCatalogMetadata(data.externalId);
    return { result, payload, duplicates, metadata, importable: connector.canImport(result) };
  });

export const importOnlineResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceId: z.string().uuid(),
        externalId: z.string().min(1),
        duplicateStrategy: z.enum(["link", "create"]).default("link"),
        linkModelId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canManage } = await supabase.rpc("can_manage_catalog", { _user_id: userId });
    if (!canManage) throw new Error("Only catalog managers may import external records.");

    const { data: source } = await supabase
      .from("external_sources")
      .select("*")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (!source) throw new Error("Source not found.");

    const connector = getConnector(source as ExternalSource);
    if (!connector) throw new Error("No connector registered for this source.");

    const result = await connector.getResultDetails(data.externalId);
    if (!result || !connector.canImport(result)) {
      throw new Error("This external record cannot be imported.");
    }

    const payload = connector.importMetadata(result);
    return importPayload(supabase, payload, data.sourceId, userId, {
      duplicateStrategy: data.duplicateStrategy,
      linkModelId: data.linkModelId ?? null,
    });
  });
