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
 * Online discovery. Runs entirely server-side so that source credentials never
 * reach the browser. Results are advisory only until a catalog manager imports
 * them.
 */
export const searchOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ query: z.string().min(1), filters: filtersSchema.default({}) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
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
        await supabase
          .from("external_sources")
          .update({ last_success_at: new Date().toISOString(), last_error: null })
          .eq("id", source.id);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Unknown connector error";
        errors.push({ source: source.name, message });
        await supabase.from("external_sources").update({ last_error: message }).eq("id", source.id);
      }
    }

    if (results.length > 0) {
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("external_search_results").insert(
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
    }

    return { results, errors };
  });

export const testSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
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
    await supabase
      .from("external_sources")
      .update(
        outcome.ok
          ? { last_success_at: new Date().toISOString(), last_error: null }
          : { last_error: outcome.message },
      )
      .eq("id", data.sourceId);
    return outcome;
  });

export const previewOnlineImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sourceId: z.string().uuid(), externalId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
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
    // Atomic import: all domain writes happen in a single database
    // transaction (public.import_external_payload). The import job row
    // remains auditable even when the domain writes roll back.
    const { data: outcome, error: rpcError } = await supabase.rpc(
      "import_external_payload",
      {
        p_payload: payload as never,
        p_source_id: data.sourceId,
        p_duplicate_strategy: data.duplicateStrategy,
        ...(data.linkModelId ? { p_link_model_id: data.linkModelId } : {}),
      },
    );
    if (rpcError) throw new Error(rpcError.message);
    const parsed = outcome as {
      ok: boolean;
      error?: string;
      manufacturerId?: string | null;
      modelId?: string | null;
      catalogId?: string | null;
      partId?: string | null;
      created?: string[];
      linked?: string[];
    };
    if (!parsed.ok) throw new Error(parsed.error ?? "Import failed.");
    return {
      manufacturerId: parsed.manufacturerId ?? null,
      modelId: parsed.modelId ?? null,
      catalogId: parsed.catalogId ?? null,
      partId: parsed.partId ?? null,
      created: parsed.created ?? [],
      linked: parsed.linked ?? [],
    };
  });
