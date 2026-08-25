import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { normalizeCode, normalizeText } from "@/lib/normalize";
import type { ImportPayload } from "@/services/connectors/types";

type Client = SupabaseClient<Database>;

/**
 * Import service (server-only).
 *
 * Maps a connector's neutral ImportPayload into corporation database records.
 * Duplicate detection always uses normalized identifiers so the same
 * manufacturer / model / catalog / part is never created twice.
 */

export type DuplicateReport = {
  manufacturer: { id: string; name: string } | null;
  model: { id: string; model_name: string } | null;
  catalog: { id: string; title: string } | null;
  part: { id: string; primary_part_number: string } | null;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function detectDuplicates(
  db: Client,
  payload: ImportPayload,
): Promise<DuplicateReport> {
  const report: DuplicateReport = {
    manufacturer: null,
    model: null,
    catalog: null,
    part: null,
  };

  if (payload.manufacturerName) {
    const slug = slugify(payload.manufacturerName);
    const { data } = await db
      .from("manufacturers")
      .select("id,name,slug")
      .or(`slug.eq.${slug},name.ilike.${payload.manufacturerName}`)
      .limit(1)
      .maybeSingle();
    if (data) report.manufacturer = { id: data.id, name: data.name };
  }

  if (payload.modelName) {
    const code = normalizeCode(payload.modelName);
    const { data } = await db
      .from("machine_models")
      .select("id,model_name")
      .eq("normalized_model_name", code)
      .limit(1)
      .maybeSingle();
    if (data) report.model = data;
  }

  if (payload.catalogTitle) {
    const { data } = await db
      .from("catalogs")
      .select("id,title")
      .eq("normalized_title", normalizeText(payload.catalogTitle))
      .limit(1)
      .maybeSingle();
    if (data) report.catalog = data;
  }

  if (payload.partNumber) {
    const { data } = await db
      .from("parts")
      .select("id,primary_part_number")
      .eq("normalized_part_number", normalizeCode(payload.partNumber))
      .limit(1)
      .maybeSingle();
    if (data) report.part = data;
  }

  return report;
}

async function ensureManufacturer(db: Client, name: string): Promise<string> {
  const existing = await db
    .from("manufacturers")
    .select("id")
    .or(`slug.eq.${slugify(name)},name.ilike.${name}`)
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data.id;
  const { data, error } = await db
    .from("manufacturers")
    .insert({ name, slug: slugify(name), short_name: name })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function ensureEquipmentType(db: Client, name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await db
    .from("equipment_types")
    .select("id")
    .or(`slug.eq.${slugify(name)},name.ilike.${name}`)
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data.id;
  const { data, error } = await db
    .from("equipment_types")
    .insert({ name, slug: slugify(name) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export type ImportOptions = {
  /** "link" reuses the detected duplicate model; "create" adds a new record. */
  duplicateStrategy: "link" | "create";
  linkModelId?: string | null;
};

export type ImportOutcome = {
  manufacturerId: string | null;
  modelId: string | null;
  catalogId: string | null;
  partId: string | null;
  created: string[];
  linked: string[];
};

export async function importPayload(
  db: Client,
  payload: ImportPayload,
  sourceId: string,
  userId: string,
  options: ImportOptions,
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = {
    manufacturerId: null,
    modelId: null,
    catalogId: null,
    partId: null,
    created: [],
    linked: [],
  };

  const job = await db
    .from("import_jobs")
    .insert({
      source_id: sourceId,
      user_id: userId,
      import_type: "online_result",
      status: "running",
      total_records: 1,
    })
    .select("id")
    .single();
  if (job.error) throw new Error(job.error.message);
  const jobId = job.data.id;

  try {
    if (payload.manufacturerName) {
      outcome.manufacturerId = await ensureManufacturer(db, payload.manufacturerName);
    }
    const equipmentTypeId = await ensureEquipmentType(db, payload.equipmentTypeName);

    if (payload.modelName && outcome.manufacturerId) {
      const code = normalizeCode(payload.modelName);
      const existing = options.linkModelId
        ? { data: { id: options.linkModelId } }
        : await db
            .from("machine_models")
            .select("id")
            .eq("normalized_model_name", code)
            .limit(1)
            .maybeSingle();

      if (existing.data && options.duplicateStrategy === "link") {
        outcome.modelId = existing.data.id;
        outcome.linked.push("machine_model");
      } else if (existing.data && options.duplicateStrategy === "create") {
        outcome.modelId = existing.data.id;
        outcome.linked.push("machine_model");
      } else {
        const created = await db
          .from("machine_models")
          .insert({
            manufacturer_id: outcome.manufacturerId,
            equipment_type_id: equipmentTypeId,
            model_name: payload.modelName,
            description: payload.partDescription,
          })
          .select("id")
          .single();
        if (created.error) throw new Error(created.error.message);
        outcome.modelId = created.data.id;
        outcome.created.push("machine_model");
      }

      if (payload.serialDisplay && outcome.modelId) {
        const serial = await db
          .from("serial_ranges")
          .select("id")
          .eq("machine_model_id", outcome.modelId)
          .eq("display_value", payload.serialDisplay)
          .limit(1)
          .maybeSingle();
        if (!serial.data) {
          await db.from("serial_ranges").insert({
            machine_model_id: outcome.modelId,
            serial_prefix: null,
            serial_from: payload.serialFrom,
            serial_to: payload.serialTo,
            display_value: payload.serialDisplay,
            notes: "Imported from an approved external source.",
          });
          outcome.created.push("serial_range");
        }
      }
    }

    if (payload.partNumber && outcome.manufacturerId) {
      const code = normalizeCode(payload.partNumber);
      const existing = await db
        .from("parts")
        .select("id")
        .eq("normalized_part_number", code)
        .limit(1)
        .maybeSingle();
      if (existing.data) {
        outcome.partId = existing.data.id;
        outcome.linked.push("part");
      } else {
        const created = await db
          .from("parts")
          .insert({
            manufacturer_id: outcome.manufacturerId,
            primary_part_number: payload.partNumber,
            description: payload.partDescription,
            notes: `Imported from external reference ${payload.externalReference}.`,
          })
          .select("id")
          .single();
        if (created.error) throw new Error(created.error.message);
        outcome.partId = created.data.id;
        outcome.created.push("part");
        if (code !== normalizeCode(payload.partNumber.replace(/[^A-Za-z0-9]/g, ""))) {
          // no-op: normalized alias identical
        }
        await db
          .from("part_aliases")
          .insert({ part_id: created.data.id, alternate_number: code, alias_type: "normalized" });
      }
      if (outcome.partId && outcome.modelId) {
        const compat = await db
          .from("part_machine_compatibility")
          .select("id")
          .eq("part_id", outcome.partId)
          .eq("machine_model_id", outcome.modelId)
          .limit(1)
          .maybeSingle();
        if (!compat.data) {
          await db.from("part_machine_compatibility").insert({
            part_id: outcome.partId,
            machine_model_id: outcome.modelId,
            notes: payload.serialDisplay ? `Applies to ${payload.serialDisplay}.` : null,
          });
        }
      }
    }

    if (!payload.partNumber && payload.catalogTitle && outcome.manufacturerId) {
      const existing = await db
        .from("catalogs")
        .select("id")
        .eq("normalized_title", normalizeText(payload.catalogTitle))
        .limit(1)
        .maybeSingle();
      if (existing.data) {
        outcome.catalogId = existing.data.id;
        outcome.linked.push("catalog");
      } else {
        const created = await db
          .from("catalogs")
          .insert({
            manufacturer_id: outcome.manufacturerId,
            machine_model_id: outcome.modelId,
            catalog_number: payload.catalogNumber,
            title: payload.catalogTitle,
            catalog_type: payload.catalogType,
            language: payload.language,
            revision: payload.revision,
            serial_from: payload.serialFrom,
            serial_to: payload.serialTo,
            source_id: sourceId,
            external_source_reference: payload.externalReference,
          })
          .select("id")
          .single();
        if (created.error) throw new Error(created.error.message);
        outcome.catalogId = created.data.id;
        outcome.created.push("catalog");
        if (outcome.modelId) {
          await db.from("catalog_machine_relations").insert({
            catalog_id: created.data.id,
            machine_model_id: outcome.modelId,
          });
        }
      }
    }

    await db.from("import_job_items").insert({
      import_job_id: jobId,
      external_reference: payload.externalReference,
      entity_type: payload.partNumber ? "part" : "catalog",
      status: "imported",
      local_entity_id: outcome.partId ?? outcome.catalogId ?? outcome.modelId,
    });
    await db
      .from("import_jobs")
      .update({
        status: "completed",
        imported_records: 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import error";
    await db
      .from("import_jobs")
      .update({
        status: "failed",
        failed_records: 1,
        error_log: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await db.from("import_job_items").insert({
      import_job_id: jobId,
      external_reference: payload.externalReference,
      entity_type: "unknown",
      status: "failed",
      error_message: message,
    });
    throw new Error(message);
  }
}
