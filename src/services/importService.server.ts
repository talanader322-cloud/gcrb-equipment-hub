import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { normalizeCode, normalizeText } from "@/lib/normalize";
import type { ImportPayload } from "@/services/connectors/types";

type Client = SupabaseClient<Database>;

/**
 * Import service (server-only).
 *
 * Maps a connector's neutral ImportPayload into corporation database records.
 * Duplicate detection is scoped by manufacturer (and model where applicable)
 * so identical model/part numbers from different OEMs are never conflated.
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

async function findManufacturer(db: Client, name: string) {
  const slug = slugify(name);
  const { data, error } = await db
    .from("manufacturers")
    .select("id,name,slug")
    .or(`slug.eq.${slug},name.ilike.${name}`)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findModel(db: Client, manufacturerId: string, modelName: string) {
  const { data, error } = await db
    .from("machine_models")
    .select("id,model_name")
    .eq("manufacturer_id", manufacturerId)
    .eq("normalized_model_name", normalizeCode(modelName))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findPart(db: Client, manufacturerId: string, partNumber: string) {
  const { data, error } = await db
    .from("parts")
    .select("id,primary_part_number")
    .eq("manufacturer_id", manufacturerId)
    .eq("normalized_part_number", normalizeCode(partNumber))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findCatalog(
  db: Client,
  payload: ImportPayload,
  manufacturerId: string,
  modelId: string | null,
) {
  let query = db.from("catalogs").select("id,title").eq("manufacturer_id", manufacturerId);

  if (modelId) query = query.eq("machine_model_id", modelId);
  if (payload.catalogNumber) {
    query = query.eq("normalized_catalog_number", normalizeCode(payload.catalogNumber));
  } else if (payload.catalogTitle) {
    query = query.eq("normalized_title", normalizeText(payload.catalogTitle));
  } else {
    return null;
  }

  if (payload.revision) query = query.eq("revision", payload.revision);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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

  if (!payload.manufacturerName) return report;

  const manufacturer = await findManufacturer(db, payload.manufacturerName);
  if (!manufacturer) return report;

  report.manufacturer = { id: manufacturer.id, name: manufacturer.name };

  if (payload.modelName) {
    report.model = await findModel(db, manufacturer.id, payload.modelName);
  }

  if (payload.partNumber) {
    report.part = await findPart(db, manufacturer.id, payload.partNumber);
  }

  if (payload.catalogTitle || payload.catalogNumber) {
    report.catalog = await findCatalog(db, payload, manufacturer.id, report.model?.id ?? null);
  }

  return report;
}

async function ensureManufacturer(db: Client, name: string): Promise<string> {
  const existing = await findManufacturer(db, name);
  if (existing) return existing.id;
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
  if (existing.error) throw new Error(existing.error.message);
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
  /** "link" reuses the detected duplicate model; "create" is only valid when no duplicate exists. */
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
      const existing = options.linkModelId
        ? { id: options.linkModelId }
        : await findModel(db, outcome.manufacturerId, payload.modelName);

      if (existing) {
        outcome.modelId = existing.id;
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
        if (serial.error) throw new Error(serial.error.message);
        if (!serial.data) {
          const createdSerial = await db.from("serial_ranges").insert({
            machine_model_id: outcome.modelId,
            serial_prefix: null,
            serial_from: payload.serialFrom,
            serial_to: payload.serialTo,
            display_value: payload.serialDisplay,
            notes: "Imported from an approved external source.",
          });
          if (createdSerial.error) throw new Error(createdSerial.error.message);
          outcome.created.push("serial_range");
        }
      }
    }

    if (payload.partNumber && outcome.manufacturerId) {
      const existing = await findPart(db, outcome.manufacturerId, payload.partNumber);
      if (existing) {
        outcome.partId = existing.id;
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

        const normalized = normalizeCode(payload.partNumber);
        if (normalized && normalized !== payload.partNumber) {
          const alias = await db.from("part_aliases").insert({
            part_id: created.data.id,
            alternate_number: normalized,
            alias_type: "normalized",
          });
          if (alias.error && alias.error.code !== "23505") throw new Error(alias.error.message);
        }
      }
      if (outcome.partId && outcome.modelId) {
        const compat = await db
          .from("part_machine_compatibility")
          .select("id")
          .eq("part_id", outcome.partId)
          .eq("machine_model_id", outcome.modelId)
          .limit(1)
          .maybeSingle();
        if (compat.error) throw new Error(compat.error.message);
        if (!compat.data) {
          const createdCompat = await db.from("part_machine_compatibility").insert({
            part_id: outcome.partId,
            machine_model_id: outcome.modelId,
            notes: payload.serialDisplay ? `Applies to ${payload.serialDisplay}.` : null,
          });
          if (createdCompat.error) throw new Error(createdCompat.error.message);
        }
      }
    }

    if (!payload.partNumber && (payload.catalogTitle || payload.catalogNumber) && outcome.manufacturerId) {
      const existing = await findCatalog(db, payload, outcome.manufacturerId, outcome.modelId);
      if (existing) {
        outcome.catalogId = existing.id;
        outcome.linked.push("catalog");
      } else if (payload.catalogTitle) {
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
          const relation = await db.from("catalog_machine_relations").insert({
            catalog_id: created.data.id,
            machine_model_id: outcome.modelId,
          });
          if (relation.error && relation.error.code !== "23505") throw new Error(relation.error.message);
        }
      }
    }

    const item = await db.from("import_job_items").insert({
      import_job_id: jobId,
      external_reference: payload.externalReference,
      entity_type: payload.partNumber ? "part" : "catalog",
      status: "imported",
      local_entity_id: outcome.partId ?? outcome.catalogId ?? outcome.modelId,
    });
    if (item.error) throw new Error(item.error.message);

    const completed = await db
      .from("import_jobs")
      .update({
        status: "completed",
        imported_records: 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (completed.error) throw new Error(completed.error.message);

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
