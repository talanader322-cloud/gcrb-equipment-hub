-- Phase 5 — Komatsu (777parts "kbp" / Google Storage) parts-book importer.
-- Stores each book as a catalogs row, its text as catalog_pages (so the
-- existing in-catalog + global search RPCs work unchanged), and each scheme
-- page as catalog_schemes (+ parts) so diagrams and part tables are browsable.
-- Append-only + idempotent.

-- ---------------------------------------------------------------------------
-- 1. catalogs: book-level external URL (used by the schematic importer)
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS external_source_url text;

-- ---------------------------------------------------------------------------
-- 2. catalog_schemes — one row per diagram page of an imported parts book
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  title text,
  image_url text,
  image_storage_path text,
  mirrored boolean NOT NULL DEFAULT false,
  part_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_schemes_catalog_page
  ON public.catalog_schemes (catalog_id, page_number);
CREATE INDEX IF NOT EXISTS ix_catalog_schemes_catalog
  ON public.catalog_schemes (catalog_id);

GRANT SELECT ON public.catalog_schemes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_schemes TO authenticated;
GRANT ALL ON public.catalog_schemes TO service_role;
ALTER TABLE public.catalog_schemes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog schemes read" ON public.catalog_schemes;
CREATE POLICY "catalog schemes read" ON public.catalog_schemes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "catalog schemes manager write" ON public.catalog_schemes;
CREATE POLICY "catalog schemes manager write" ON public.catalog_schemes
  FOR ALL TO authenticated USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. catalog_scheme_parts — part rows listed on a diagram page
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_scheme_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.catalog_schemes(id) ON DELETE CASCADE,
  item_ref text,
  ref0 text,
  ref1 text,
  alt text,
  quantity text,
  number text,
  short_number text,
  name text,
  options jsonb DEFAULT '[]'::jsonb,
  book_id text,
  page_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_scheme_parts_scheme_item
  ON public.catalog_scheme_parts (scheme_id, item_ref) WHERE item_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_catalog_scheme_parts_short
  ON public.catalog_scheme_parts (short_number) WHERE short_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_catalog_scheme_parts_number
  ON public.catalog_scheme_parts (number) WHERE number IS NOT NULL AND number <> '';

GRANT SELECT ON public.catalog_scheme_parts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_scheme_parts TO authenticated;
GRANT ALL ON public.catalog_scheme_parts TO service_role;
ALTER TABLE public.catalog_scheme_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog scheme parts read" ON public.catalog_scheme_parts;
CREATE POLICY "catalog scheme parts read" ON public.catalog_scheme_parts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "catalog scheme parts manager write" ON public.catalog_scheme_parts;
CREATE POLICY "catalog scheme parts manager write" ON public.catalog_scheme_parts
  FOR ALL TO authenticated USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. RPC: create-or-find a catalog row for an imported parts book (no PDF)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_schematic_catalog(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_title text := NULLIF(TRIM(p_payload->>'title'), '');
  v_manufacturer_id uuid := NULLIF(TRIM(p_payload->>'manufacturerId'), '')::uuid;
  v_machine_model_id uuid := NULLIF(TRIM(p_payload->>'machineModelId'), '')::uuid;
  v_book text := NULLIF(TRIM(p_payload->>'book'), '');
  v_catalog_number text := NULLIF(TRIM(p_payload->>'catalogNumber'), '');
  v_reference text := NULLIF(TRIM(p_payload->>'reference'), '');
  v_source_url text := NULLIF(TRIM(p_payload->>'sourceUrl'), '');
  v_page_count int := COALESCE(NULLIF(p_payload->>'pageCount', '')::int, 0);
  v_catalog_id uuid;
  v_created boolean := false;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may import parts books.' USING ERRCODE = '42501';
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'A book title is required.' USING ERRCODE = '22023';
  END IF;
  IF v_book IS NULL THEN
    RAISE EXCEPTION 'A book identifier is required.' USING ERRCODE = '22023';
  END IF;
  IF v_reference IS NULL THEN
    v_reference := 'kbp_json:' || v_book;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.manufacturers m WHERE m.id = v_manufacturer_id) THEN
    RAISE EXCEPTION 'Manufacturer does not exist.' USING ERRCODE = '22023';
  END IF;
  IF v_machine_model_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.machine_models mm WHERE mm.id = v_machine_model_id
  ) THEN
    RAISE EXCEPTION 'Machine model does not exist.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_catalog_id
  FROM public.catalogs c
  WHERE c.external_document_ref = v_reference
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_catalog_id IS NULL THEN
    INSERT INTO public.catalogs (
      manufacturer_id, machine_model_id, catalog_number, title, catalog_type,
      language, page_count, searchable, active,
      external_source_reference, external_source_label, external_source_url,
      external_document_ref, analysis_status
    ) VALUES (
      v_manufacturer_id, v_machine_model_id, v_catalog_number, v_title, 'parts_catalog',
      'en', GREATEST(v_page_count, 0), true, true,
      v_reference, 'kbp_json', v_source_url, v_reference, 'indexed'
    ) RETURNING id INTO v_catalog_id;
    v_created := true;
  ELSE
    UPDATE public.catalogs
    SET title = v_title,
        catalog_number = COALESCE(v_catalog_number, catalog_number),
        external_source_url = COALESCE(v_source_url, external_source_url),
        analysis_status = 'indexed',
        searchable = true
    WHERE id = v_catalog_id;
  END IF;

  IF v_machine_model_id IS NOT NULL THEN
    INSERT INTO public.catalog_machine_relations (catalog_id, machine_model_id)
    VALUES (v_catalog_id, v_machine_model_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'catalogId', v_catalog_id, 'created', v_created);
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_schematic_catalog(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_schematic_catalog(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_schematic_catalog(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_schematic_catalog(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC: bulk upsert of schematic pages (image refs + part rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_catalog_schemes(p_catalog_id uuid, p_pages jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_page jsonb;
  v_part jsonb;
  v_scheme_id uuid;
  v_total int := 0;
  v_page_no int;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may import schematic pages.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_pages) <> 'array' THEN
    RAISE EXCEPTION 'p_pages must be an array.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalogs c WHERE c.id = p_catalog_id) THEN
    RAISE EXCEPTION 'Catalog does not exist.' USING ERRCODE = '22023';
  END IF;

  FOR v_page IN SELECT value FROM jsonb_array_elements(p_pages)
  LOOP
    v_page_no := (v_page->>'pageNumber')::int;
    IF v_page_no IS NULL OR v_page_no < 1 THEN
      CONTINUE;
    END IF;
    v_total := v_total + 1;

    INSERT INTO public.catalog_schemes (
      catalog_id, page_number, title, image_url, image_storage_path, mirrored, part_count
    ) VALUES (
      p_catalog_id,
      v_page_no,
      NULLIF(TRIM(COALESCE(v_page->>'title', '')), ''),
      NULLIF(TRIM(COALESCE(v_page->>'imageUrl', '')), ''),
      NULLIF(TRIM(COALESCE(v_page->>'storagePath', '')), ''),
      COALESCE((v_page->>'mirrored')::boolean, false),
      COALESCE(jsonb_array_length(v_page->'parts'), 0)
    )
    ON CONFLICT (catalog_id, page_number) DO UPDATE
      SET title = EXCLUDED.title,
          image_url = EXCLUDED.image_url,
          image_storage_path = EXCLUDED.image_storage_path,
          mirrored = EXCLUDED.mirrored,
          part_count = EXCLUDED.part_count,
          updated_at = now()
    RETURNING id INTO v_scheme_id;

    DELETE FROM public.catalog_scheme_parts WHERE scheme_id = v_scheme_id;

    FOR v_part IN SELECT value FROM jsonb_array_elements(COALESCE(v_page->'parts', '[]'::jsonb))
    LOOP
      INSERT INTO public.catalog_scheme_parts (
        scheme_id, item_ref, ref0, ref1, alt, quantity, number, short_number, name, options,
        book_id, page_id
      ) VALUES (
        v_scheme_id,
        NULLIF(TRIM(COALESCE(v_part->>'itemRef', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'ref0', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'ref1', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'alt', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'quantity', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'number', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'shortNumber', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'name', '')), ''),
        COALESCE(v_part->'options', '[]'::jsonb),
        NULLIF(TRIM(COALESCE(v_part->>'bookId', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'pageId', '')), '')
      );
    END LOOP;
  END LOOP;

  UPDATE public.catalogs
  SET analysis_status = 'indexed',
      indexed_page_count = v_total,
      page_count = GREATEST(COALESCE(page_count, 0), v_total),
      searchable = true
  WHERE id = p_catalog_id;

  RETURN jsonb_build_object('ok', true, 'schemes', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_catalog_schemes(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_catalog_schemes(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_catalog_schemes(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_schemes(uuid, jsonb) TO service_role;