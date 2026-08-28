-- Phase 4 — In-app catalog discovery, PDF text analysis, part alternatives,
-- and per-model query history (append-only, idempotent migration).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. catalogs: discovery provenance + text-analysis state
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS external_source_label text,
  ADD COLUMN IF NOT EXISTS external_source_url text,
  ADD COLUMN IF NOT EXISTS external_document_ref text,
  ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS indexed_page_count integer;

ALTER TABLE public.catalogs
  DROP CONSTRAINT IF EXISTS catalogs_analysis_status_check;
ALTER TABLE public.catalogs
  ADD CONSTRAINT catalogs_analysis_status_check CHECK (
    analysis_status IN ('none','analyzing','indexed','failed')
  );

COMMENT ON COLUMN public.catalogs.analysis_status IS
  'none = not analysed; analyzing = extractor running; indexed = text pages stored in catalog_pages; failed = extraction failed.';
COMMENT ON COLUMN public.catalogs.indexed_page_count IS
  'Number of text-bearing pages extracted into catalog_pages.';

-- ---------------------------------------------------------------------------
-- 2. machine_query_log — system-wide per-equipment query history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machine_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_model_id uuid NOT NULL REFERENCES public.machine_models(id) ON DELETE CASCADE,
  query text NOT NULL,
  normalized_query text,
  matched boolean NOT NULL DEFAULT true,
  searched_by uuid DEFAULT auth.uid(),
  searched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_machine_query_log_model_time
  ON public.machine_query_log (machine_model_id, searched_at DESC);
CREATE INDEX IF NOT EXISTS ix_machine_query_log_norm
  ON public.machine_query_log (normalized_query) WHERE normalized_query IS NOT NULL;

GRANT SELECT, INSERT ON public.machine_query_log TO authenticated;
GRANT ALL ON public.machine_query_log TO service_role;
ALTER TABLE public.machine_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machine query log read" ON public.machine_query_log;
CREATE POLICY "machine query log read" ON public.machine_query_log
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "machine query log insert" ON public.machine_query_log;
CREATE POLICY "machine query log insert" ON public.machine_query_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. catalog_pages — extracted text layer for in-catalog part-number search
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  content text NOT NULL,
  normalized_content text NOT NULL,
  extracted_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_pages_catalog_page
  ON public.catalog_pages (catalog_id, page_number);
CREATE INDEX IF NOT EXISTS ix_catalog_pages_trgm
  ON public.catalog_pages USING gin (normalized_content gin_trgm_ops);

GRANT SELECT ON public.catalog_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_pages TO authenticated;
GRANT ALL ON public.catalog_pages TO service_role;
ALTER TABLE public.catalog_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog pages read" ON public.catalog_pages;
CREATE POLICY "catalog pages read" ON public.catalog_pages
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "catalog pages manager write" ON public.catalog_pages;
CREATE POLICY "catalog pages manager write" ON public.catalog_pages
  FOR ALL TO authenticated USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. part_alternates — curated alternative-part links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.part_alternates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  alternate_part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  match_type text NOT NULL DEFAULT 'equivalent',
  match_pct smallint NOT NULL DEFAULT 80,
  quality_note text,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_alternates_match_pct_check CHECK (match_pct BETWEEN 0 AND 100),
  CONSTRAINT part_alternates_no_self CHECK (part_id <> alternate_part_id),
  CONSTRAINT part_alternates_match_type_check CHECK (
    match_type IN ('identical','supersession','cross_oem','equivalent','pattern')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_part_alternates_direction
  ON public.part_alternates (part_id, alternate_part_id);
CREATE INDEX IF NOT EXISTS ix_part_alternates_alternate
  ON public.part_alternates (alternate_part_id);

GRANT SELECT ON public.part_alternates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_alternates TO authenticated;
GRANT ALL ON public.part_alternates TO service_role;
ALTER TABLE public.part_alternates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "part alternates read" ON public.part_alternates;
CREATE POLICY "part alternates read" ON public.part_alternates
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "part alternates manager write" ON public.part_alternates;
CREATE POLICY "part alternates manager write" ON public.part_alternates
  FOR ALL TO authenticated USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. discovered_documents — persisted in-app discovery hits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovered_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  source_id uuid REFERENCES public.external_sources(id) ON DELETE SET NULL,
  source_label text,
  title text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'web',
  mime_type text,
  size_hint bigint,
  filename text,
  verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'discovered',
  catalog_id uuid REFERENCES public.catalogs(id) ON DELETE SET NULL,
  discovered_by uuid DEFAULT auth.uid(),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discovered_documents_kind_check CHECK (kind IN ('pdf','web','catalog_page','managed')),
  CONSTRAINT discovered_documents_status_check CHECK (
    status IN ('discovered','inspected','fetching','downloaded','archived','failed','rejected')
  )
);

CREATE INDEX IF NOT EXISTS ix_discovered_documents_query
  ON public.discovered_documents (query, discovered_at DESC);
CREATE INDEX IF NOT EXISTS ix_discovered_documents_catalog
  ON public.discovered_documents (catalog_id) WHERE catalog_id IS NOT NULL;

GRANT SELECT ON public.discovered_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovered_documents TO authenticated;
GRANT ALL ON public.discovered_documents TO service_role;
ALTER TABLE public.discovered_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discovered docs read" ON public.discovered_documents;
CREATE POLICY "discovered docs read" ON public.discovered_documents
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "discovered docs insert" ON public.discovered_documents;
CREATE POLICY "discovered docs insert" ON public.discovered_documents
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "discovered docs manager update" ON public.discovered_documents;
CREATE POLICY "discovered docs manager update" ON public.discovered_documents
  FOR UPDATE TO authenticated USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));
DROP POLICY IF EXISTS "discovered docs manager delete" ON public.discovered_documents;
CREATE POLICY "discovered docs manager delete" ON public.discovered_documents
  FOR DELETE TO authenticated USING (public.can_manage_catalog(auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. RPC: atomic creation of a catalog from an in-app discovered PDF
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_catalog_from_discovery(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_model_id uuid := NULLIF(TRIM(p_payload->>'machineModelId'), '')::uuid;
  v_manufacturer_id uuid := NULLIF(TRIM(p_payload->>'manufacturerId'), '')::uuid;
  v_title text := NULLIF(TRIM(p_payload->>'title'), '');
  v_catalog_type text := COALESCE(NULLIF(TRIM(p_payload->>'catalogType'), ''), 'parts_catalog');
  v_language text := COALESCE(NULLIF(TRIM(p_payload->>'language'), ''), 'en');
  v_revision text := NULLIF(TRIM(p_payload->>'revision'), '');
  v_serial_from text := NULLIF(TRIM(p_payload->>'serialFrom'), '');
  v_serial_to text := NULLIF(TRIM(p_payload->>'serialTo'), '');
  v_catalog_number text := NULLIF(TRIM(p_payload->>'catalogNumber'), '');
  v_source_label text := NULLIF(TRIM(p_payload->>'sourceLabel'), '');
  v_source_url text := NULLIF(TRIM(p_payload->>'sourceUrl'), '');
  v_external_ref text := NULLIF(TRIM(p_payload->>'externalReference'), '');
  v_storage_path text := NULLIF(TRIM(p_payload->>'storagePath'), '');
  v_bucket text := COALESCE(NULLIF(TRIM(p_payload->>'storageBucket'), ''), 'catalogs');
  v_filename text := NULLIF(TRIM(p_payload->>'originalFilename'), '');
  v_checksum text := NULLIF(TRIM(p_payload->>'checksum'), '');
  v_mime text := COALESCE(NULLIF(TRIM(p_payload->>'mimeType'), ''), 'application/pdf');
  v_file_size bigint := NULLIF(p_payload->>'fileSize', '')::bigint;
  v_page_count int := NULLIF(p_payload->>'pageCount', '')::int;
  v_catalog_id uuid;
  v_file_id uuid;
  v_prefix text := 'discovered/';
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may archive discovered documents.' USING ERRCODE = '42501';
  END IF;

  IF v_model_id IS NULL THEN
    RAISE EXCEPTION 'A machine model is required to archive a discovered catalog.' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Catalog title is required.' USING ERRCODE = '22023';
  END IF;
  IF v_bucket <> 'catalogs' THEN
    RAISE EXCEPTION 'Discovered documents may only be stored in the private catalogs bucket.' USING ERRCODE = '22023';
  END IF;
  IF v_storage_path IS NULL
     OR left(v_storage_path, length(v_prefix)) <> v_prefix
     OR position('..' IN v_storage_path) > 0 THEN
    RAISE EXCEPTION 'The stored file path must live inside the discovered namespace (%).', v_prefix USING ERRCODE = '22023';
  END IF;
  IF v_mime <> 'application/pdf' THEN
    RAISE EXCEPTION 'Only PDF documents are accepted.' USING ERRCODE = '22023';
  END IF;
  IF v_file_size IS NULL OR v_file_size <= 0 OR v_file_size > 209715200 THEN
    RAISE EXCEPTION 'The document size must be greater than zero and at most 200 MB.' USING ERRCODE = '22023';
  END IF;
  IF v_checksum IS NULL OR v_checksum !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'A valid SHA-256 checksum (64 hexadecimal characters) is required.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.machine_models mm WHERE mm.id = v_model_id
  ) THEN
    RAISE EXCEPTION 'Machine model does not exist.' USING ERRCODE = '22023';
  END IF;

  IF v_manufacturer_id IS NULL THEN
    SELECT mm.manufacturer_id INTO v_manufacturer_id
    FROM public.machine_models mm WHERE mm.id = v_model_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'catalogs' AND o.name = v_storage_path
  ) THEN
    RAISE EXCEPTION 'The referenced stored document does not exist.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.catalogs (
    manufacturer_id, machine_model_id, catalog_number, title, catalog_type,
    language, revision, serial_from, serial_to, page_count, searchable, active,
    source_id, external_source_reference, external_source_label, external_source_url,
    external_document_ref, analysis_status
  ) VALUES (
    v_manufacturer_id, v_model_id, v_catalog_number, v_title, v_catalog_type,
    v_language, v_revision, v_serial_from, v_serial_to, v_page_count, true, true,
    NULL, v_external_ref, v_source_label, v_source_url, v_external_ref, 'analyzing'
  ) RETURNING id INTO v_catalog_id;

  INSERT INTO public.catalog_files (
    catalog_id, storage_provider, storage_bucket, storage_path,
    original_filename, mime_type, file_size, checksum
  ) VALUES (
    v_catalog_id, 'supabase', v_bucket, v_storage_path,
    v_filename, v_mime, v_file_size, lower(v_checksum)
  ) RETURNING id INTO v_file_id;

  UPDATE public.catalogs SET file_id = v_file_id WHERE id = v_catalog_id;

  INSERT INTO public.catalog_machine_relations (catalog_id, machine_model_id)
  VALUES (v_catalog_id, v_model_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true, 'catalogId', v_catalog_id, 'catalogFileId', v_file_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_catalog_from_discovery(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_catalog_from_discovery(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_catalog_from_discovery(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_from_discovery(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. RPC: bulk upsert of extracted catalog pages
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_catalog_pages(p_catalog_id uuid, p_pages jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_page jsonb;
  v_total int := 0;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may index catalog pages.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_pages) <> 'array' THEN
    RAISE EXCEPTION 'p_pages must be an array.' USING ERRCODE = '22023';
  END IF;

  FOR v_page IN SELECT value FROM jsonb_array_elements(p_pages)
  LOOP
    IF (v_page->>'pageNumber')::int IS NULL OR (v_page->>'pageNumber')::int < 1 THEN
      CONTINUE;
    END IF;
    v_total := v_total + 1;
    INSERT INTO public.catalog_pages (catalog_id, page_number, content, normalized_content)
    VALUES (
      p_catalog_id,
      (v_page->>'pageNumber')::int,
      COALESCE(v_page->>'content', ''),
      COALESCE(public.normalize_text(v_page->>'content'), '')
    )
    ON CONFLICT (catalog_id, page_number) DO UPDATE
      SET content = EXCLUDED.content,
          normalized_content = EXCLUDED.normalized_content,
          extracted_at = now();
  END LOOP;

  UPDATE public.catalogs
  SET analysis_status = 'indexed',
      indexed_page_count = v_total,
      page_count = GREATEST(COALESCE(page_count, 0), v_total),
      searchable = true
  WHERE id = p_catalog_id;

  RETURN jsonb_build_object('ok', true, 'pages', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_catalog_pages(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_catalog_pages(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_pages(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_pages(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. RPC: full-text-ish search across a catalog's extracted pages
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_catalog_pages(p_catalog_id uuid, p_query text)
RETURNS TABLE (page_number int, content text, relevance real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH q AS (
    SELECT COALESCE(public.normalize_text(p_query), '') AS n
  )
  SELECT cp.page_number, cp.content,
         GREATEST(similarity(cp.normalized_content, q.n), 0)::real AS relevance
  FROM public.catalog_pages cp
  CROSS JOIN q
  WHERE cp.catalog_id = p_catalog_id
    AND q.n <> ''
    AND (
      cp.normalized_content LIKE '%' || q.n || '%'
      OR similarity(cp.normalized_content, q.n) > 0.15
    )
  ORDER BY relevance DESC, cp.page_number ASC
  LIMIT 80;
$$;

REVOKE ALL ON FUNCTION public.search_catalog_pages(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_catalog_pages(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_catalog_pages(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_catalog_pages(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. RPC: suggest alternative parts (curated links first, then computed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suggest_part_alternates(p_part_id uuid)
RETURNS TABLE (
  candidate_part_id uuid,
  primary_part_number text,
  description text,
  manufacturer_id uuid,
  manufacturer_name text,
  model_models text[],
  match_pct int,
  match_type text,
  quality_note text,
  basis text,
  curated boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_other_manufacturer uuid;
  v_norm_desc text;
  v_oem_match int := 88;
  v_cross_oem int := 64;
BEGIN
  SELECT p.manufacturer_id, p.normalized_description
  INTO v_other_manufacturer, v_norm_desc
  FROM public.parts p WHERE p.id = p_part_id;

  RETURN QUERY
  WITH model_list AS (
    SELECT pmc.part_id, ARRAY_AGG(mm.model_name ORDER BY mm.model_name)::text[] AS models
    FROM public.part_machine_compatibility pmc
    JOIN public.machine_models mm ON mm.id = pmc.machine_model_id
    GROUP BY pmc.part_id
  )
  SELECT
    p2.id AS candidate_part_id,
    p2.primary_part_number,
    p2.description,
    p2.manufacturer_id,
    m2.name AS manufacturer_name,
    COALESCE(ml.models, ARRAY[]::text[]) AS model_models,
    pa.match_pct::int AS match_pct,
    pa.match_type::text AS match_type,
    pa.quality_note AS quality_note,
    'curated' AS basis,
    true AS curated
  FROM public.part_alternates pa
  JOIN public.parts p2 ON p2.id = pa.alternate_part_id
  JOIN public.manufacturers m2 ON m2.id = p2.manufacturer_id
  LEFT JOIN model_list ml ON ml.part_id = p2.id
  WHERE pa.part_id = p_part_id

  UNION ALL

  SELECT
    p2.id, p2.primary_part_number, p2.description,
    p2.manufacturer_id, m2.name,
    COALESCE(ml.models, ARRAY[]::text[]),
    pa.match_pct::int, pa.match_type::text, pa.quality_note,
    'curated (reverse)' AS basis, true AS curated
  FROM public.part_alternates pa
  JOIN public.parts p2 ON p2.id = pa.part_id
  JOIN public.manufacturers m2 ON m2.id = p2.manufacturer_id
  LEFT JOIN model_list ml ON ml.part_id = p2.id
  WHERE pa.alternate_part_id = p_part_id

  UNION ALL

  SELECT
    p2.id, p2.primary_part_number, p2.description,
    p2.manufacturer_id, m2.name,
    COALESCE(ml.models, ARRAY[]::text[]),
    96, 'supersession'::text,
    'Replacement part recorded on the same assembly.' AS quality_note,
    'supersession' AS basis, false AS curated
  FROM public.assembly_parts ap
  JOIN public.parts p2 ON p2.id = ap.superseded_by_part_id
  JOIN public.manufacturers m2 ON m2.id = p2.manufacturer_id
  LEFT JOIN model_list ml ON ml.part_id = p2.id
  WHERE ap.part_id = p_part_id

  UNION ALL

  SELECT
    p2.id, p2.primary_part_number, p2.description,
    p2.manufacturer_id, m2.name,
    COALESCE(ml.models, ARRAY[]::text[]),
    94, 'supersession'::text,
    'Supersedes this part on the same assembly.' AS quality_note,
    'supersession' AS basis, false AS curated
  FROM public.assembly_parts ap
  JOIN public.parts p2 ON p2.id = ap.part_id
  JOIN public.manufacturers m2 ON m2.id = p2.manufacturer_id
  LEFT JOIN model_list ml ON ml.part_id = p2.id
  WHERE ap.superseded_by_part_id = p_part_id

  UNION ALL

  SELECT
    p2.id, p2.primary_part_number, p2.description,
    p2.manufacturer_id, m2.name,
    COALESCE(ml.models, ARRAY[]::text[]),
    CASE WHEN p2.manufacturer_id = v_other_manufacturer THEN v_oem_match ELSE v_cross_oem END AS match_pct,
    'cross_oem'::text AS match_type,
    'Same technical description catalogued for another machine.' AS quality_note,
    'cross_oem' AS basis, false AS curated
  FROM public.parts p2
  JOIN public.manufacturers m2 ON m2.id = p2.manufacturer_id
  LEFT JOIN model_list ml ON ml.part_id = p2.id
  WHERE p2.id <> p_part_id
    AND v_norm_desc IS NOT NULL
    AND p2.normalized_description IS NOT NULL
    AND p2.normalized_description = v_norm_desc

  ORDER BY match_pct DESC, match_type ASC
  LIMIT 40;
END;
$function$;

REVOKE ALL ON FUNCTION public.suggest_part_alternates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suggest_part_alternates(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.suggest_part_alternates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_part_alternates(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Demo seeds: Komatsu D155A-1 (+ alias D155-1), Caterpillar D6R, and
--     cross-machine / cross-OEM spare-part alternatives (clearly demo data).
-- ---------------------------------------------------------------------------
INSERT INTO public.machine_models (manufacturer_id, equipment_type_id, model_name, series, description, image_url)
SELECT m.id, e.id, 'D155A-1', 'D155A', 'Komatsu bulldozer (D155A-1) demo record used to validate the equipment hub and online catalog discovery. No official logos or copyrighted images are used.', NULL
FROM public.manufacturers m, public.equipment_types e
WHERE m.slug = 'komatsu' AND e.slug = 'bulldozer'
  AND NOT EXISTS (
    SELECT 1 FROM public.machine_models mm
    WHERE mm.manufacturer_id = m.id AND mm.normalized_model_name = public.normalize_code('D155A-1')
  );

INSERT INTO public.machine_aliases (machine_model_id, alias)
SELECT id, 'D155-1' FROM public.machine_models WHERE model_name = 'D155A-1'
  AND NOT EXISTS (SELECT 1 FROM public.machine_aliases a WHERE a.machine_model_id = machine_models.id AND a.alias = 'D155-1');

INSERT INTO public.machine_aliases (machine_model_id, alias)
SELECT id, 'D155A1' FROM public.machine_models WHERE model_name = 'D155A-1'
  AND NOT EXISTS (SELECT 1 FROM public.machine_aliases a WHERE a.machine_model_id = machine_models.id AND a.alias = 'D155A1');

INSERT INTO public.serial_ranges (machine_model_id, serial_prefix, serial_from, serial_to, display_value, notes)
SELECT id, 'D155A', '12000', NULL, '12000-UP', 'Demo serial range for D155A-1.'
FROM public.machine_models WHERE model_name = 'D155A-1'
  AND NOT EXISTS (SELECT 1 FROM public.serial_ranges sr WHERE sr.machine_model_id = machine_models.id AND sr.display_value = '12000-UP');

INSERT INTO public.machine_models (manufacturer_id, equipment_type_id, model_name, series, description, image_url)
SELECT m.id, e.id, 'D6R', 'D6R', 'Caterpillar D6R demo record used to validate cross-OEM spare-part alternatives.', NULL
FROM public.manufacturers m, public.equipment_types e
WHERE m.slug = 'caterpillar' AND e.slug = 'bulldozer'
  AND NOT EXISTS (
    SELECT 1 FROM public.machine_models mm
    WHERE mm.manufacturer_id = m.id AND mm.normalized_model_name = public.normalize_code('D6R')
  );

INSERT INTO public.serial_ranges (machine_model_id, serial_prefix, serial_from, serial_to, display_value, notes)
SELECT id, 'D6R', 'A6R', NULL, 'A6R-UP', 'Demo serial range for D6R.'
FROM public.machine_models WHERE model_name = 'D6R'
  AND NOT EXISTS (SELECT 1 FROM public.serial_ranges sr WHERE sr.machine_model_id = machine_models.id AND sr.display_value = 'A6R-UP');

-- One shared demo description across three machines (Komatsu buldozer, Komatsu grader, Caterpillar buldozer).
INSERT INTO public.parts (manufacturer_id, primary_part_number, description, notes)
SELECT id, 'DEMO-155A-0001', 'SPOOL ASS''Y', 'Demo spare part for D155A-1 (equipment hub validation).'
FROM public.manufacturers WHERE slug = 'komatsu'
  AND NOT EXISTS (SELECT 1 FROM public.parts p WHERE p.primary_part_number = 'DEMO-155A-0001');

INSERT INTO public.parts (manufacturer_id, primary_part_number, description, notes)
SELECT id, 'DEMO-511A-0022', 'SPOOL ASS''Y', 'Demo spare part for GD511A-1 (equipment hub validation).'
FROM public.manufacturers WHERE slug = 'komatsu'
  AND NOT EXISTS (SELECT 1 FROM public.parts p WHERE p.primary_part_number = 'DEMO-511A-0022');

INSERT INTO public.parts (manufacturer_id, primary_part_number, description, notes)
SELECT id, 'DEMO-CAT-2214', 'SPOOL ASS''Y', 'Demo spare part for D6R (cross-OEM alternative validation).'
FROM public.manufacturers WHERE slug = 'caterpillar'
  AND NOT EXISTS (SELECT 1 FROM public.parts p WHERE p.primary_part_number = 'DEMO-CAT-2214');

INSERT INTO public.part_machine_compatibility (part_id, machine_model_id, serial_range_id, notes)
SELECT p.id, mm.id, sr.id, 'Demo compatibility: applies to 12000-UP.'
FROM public.parts p
JOIN public.machine_models mm ON mm.model_name = 'D155A-1'
JOIN public.serial_ranges sr ON sr.machine_model_id = mm.id
WHERE p.primary_part_number = 'DEMO-155A-0001'
  AND NOT EXISTS (SELECT 1 FROM public.part_machine_compatibility c WHERE c.part_id = p.id AND c.machine_model_id = mm.id);

INSERT INTO public.part_machine_compatibility (part_id, machine_model_id, serial_range_id, notes)
SELECT p.id, mm.id, sr.id, 'Demo compatibility: applies to 10001-UP.'
FROM public.parts p
JOIN public.machine_models mm ON mm.model_name = 'GD511A-1'
JOIN public.serial_ranges sr ON sr.machine_model_id = mm.id
WHERE p.primary_part_number = 'DEMO-511A-0022'
  AND NOT EXISTS (SELECT 1 FROM public.part_machine_compatibility c WHERE c.part_id = p.id AND c.machine_model_id = mm.id);

INSERT INTO public.part_machine_compatibility (part_id, machine_model_id, serial_range_id, notes)
SELECT p.id, mm.id, sr.id, 'Demo compatibility: applies to A6R-UP.'
FROM public.parts p
JOIN public.machine_models mm ON mm.model_name = 'D6R'
JOIN public.serial_ranges sr ON sr.machine_model_id = mm.id
WHERE p.primary_part_number = 'DEMO-CAT-2214'
  AND NOT EXISTS (SELECT 1 FROM public.part_machine_compatibility c WHERE c.part_id = p.id AND c.machine_model_id = mm.id);