ALTER TABLE public.catalog_schemes
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer;

CREATE TABLE IF NOT EXISTS public.catalog_scheme_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.catalog_schemes(id) ON DELETE CASCADE,
  item_ref text,
  x1 integer NOT NULL,
  y1 integer NOT NULL,
  x2 integer NOT NULL,
  y2 integer NOT NULL
);

CREATE INDEX IF NOT EXISTS catalog_scheme_labels_scheme_idx
  ON public.catalog_scheme_labels (scheme_id);

GRANT SELECT ON public.catalog_scheme_labels TO authenticated;
GRANT ALL ON public.catalog_scheme_labels TO service_role;

ALTER TABLE public.catalog_scheme_labels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'catalog_scheme_labels'
      AND policyname = 'Authenticated users can read scheme labels'
  ) THEN
    CREATE POLICY "Authenticated users can read scheme labels"
      ON public.catalog_scheme_labels FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'catalog_scheme_labels'
      AND policyname = 'Catalog managers can write scheme labels'
  ) THEN
    CREATE POLICY "Catalog managers can write scheme labels"
      ON public.catalog_scheme_labels FOR ALL TO authenticated
      USING (public.can_manage_catalog(auth.uid()))
      WITH CHECK (public.can_manage_catalog(auth.uid()));
  END IF;
END $$;

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
  v_label jsonb;
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
    v_page_no := NULLIF(COALESCE(v_page->>'pageNumber', v_page->>'page_number'), '')::int;
    IF v_page_no IS NULL OR v_page_no < 1 THEN
      CONTINUE;
    END IF;
    v_total := v_total + 1;

    INSERT INTO public.catalog_schemes (
      catalog_id, page_number, title, image_url, image_storage_path, mirrored, part_count,
      image_width, image_height
    ) VALUES (
      p_catalog_id,
      v_page_no,
      NULLIF(TRIM(COALESCE(v_page->>'title', '')), ''),
      NULLIF(TRIM(COALESCE(v_page->>'imageUrl', v_page->>'image_url', '')), ''),
      NULLIF(TRIM(COALESCE(v_page->>'storagePath', v_page->>'image_storage_path', '')), ''),
      COALESCE((v_page->>'mirrored')::boolean, false),
      COALESCE(jsonb_array_length(v_page->'parts'), 0),
      NULLIF(COALESCE(v_page->>'imageWidth', v_page->>'image_width'), '')::int,
      NULLIF(COALESCE(v_page->>'imageHeight', v_page->>'image_height'), '')::int
    )
    ON CONFLICT (catalog_id, page_number) DO UPDATE
      SET title = EXCLUDED.title,
          image_url = COALESCE(EXCLUDED.image_url, public.catalog_schemes.image_url),
          image_storage_path = COALESCE(EXCLUDED.image_storage_path, public.catalog_schemes.image_storage_path),
          mirrored = EXCLUDED.mirrored OR public.catalog_schemes.mirrored,
          part_count = EXCLUDED.part_count,
          image_width = COALESCE(EXCLUDED.image_width, public.catalog_schemes.image_width),
          image_height = COALESCE(EXCLUDED.image_height, public.catalog_schemes.image_height),
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
        NULLIF(TRIM(COALESCE(v_part->>'itemRef', v_part->>'item_ref', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'ref0', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'ref1', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'alt', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'quantity', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'number', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'shortNumber', v_part->>'short_number', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'name', '')), ''),
        COALESCE(v_part->'options', '[]'::jsonb),
        NULLIF(TRIM(COALESCE(v_part->>'bookId', v_part->>'book_id', '')), ''),
        NULLIF(TRIM(COALESCE(v_part->>'pageId', v_part->>'page_id', '')), '')
      );
    END LOOP;

    DELETE FROM public.catalog_scheme_labels WHERE scheme_id = v_scheme_id;

    FOR v_label IN SELECT value FROM jsonb_array_elements(COALESCE(v_page->'labels', '[]'::jsonb))
    LOOP
      IF NULLIF(v_label->>'x1', '') IS NULL OR NULLIF(v_label->>'y1', '') IS NULL
         OR NULLIF(v_label->>'x2', '') IS NULL OR NULLIF(v_label->>'y2', '') IS NULL THEN
        CONTINUE;
      END IF;
      INSERT INTO public.catalog_scheme_labels (scheme_id, item_ref, x1, y1, x2, y2)
      VALUES (
        v_scheme_id,
        NULLIF(TRIM(COALESCE(v_label->>'itemRef', v_label->>'item_ref', '')), ''),
        (v_label->>'x1')::int,
        (v_label->>'y1')::int,
        (v_label->>'x2')::int,
        (v_label->>'y2')::int
      );
    END LOOP;
  END LOOP;

  UPDATE public.catalogs
  SET analysis_status = 'indexed',
      indexed_page_count = GREATEST(COALESCE(indexed_page_count, 0), v_total),
      page_count = GREATEST(COALESCE(page_count, 0), v_total),
      searchable = true
  WHERE id = p_catalog_id;

  RETURN jsonb_build_object('ok', true, 'schemes', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_catalog_to_model(p_catalog_id uuid, p_model_hint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_hint text := public.normalize_code(p_model_hint);
  v_model_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may link catalogs to models.' USING ERRCODE = '42501';
  END IF;
  IF v_hint IS NULL OR length(v_hint) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hint_too_short');
  END IF;

  SELECT mm.id INTO v_model_id
  FROM public.machine_models mm
  WHERE mm.normalized_model_name IS NOT NULL
    AND v_hint = mm.normalized_model_name
  ORDER BY length(mm.normalized_model_name) DESC
  LIMIT 1;

  IF v_model_id IS NULL THEN
    SELECT mm.id INTO v_model_id
    FROM public.machine_aliases ma
    JOIN public.machine_models mm ON mm.id = ma.machine_model_id
    WHERE ma.normalized_alias IS NOT NULL AND v_hint = ma.normalized_alias
    LIMIT 1;
  END IF;

  IF v_model_id IS NULL THEN
    SELECT mm.id INTO v_model_id
    FROM public.machine_models mm
    WHERE mm.normalized_model_name IS NOT NULL
      AND length(mm.normalized_model_name) >= 4
      AND v_hint LIKE mm.normalized_model_name || '%'
    ORDER BY length(mm.normalized_model_name) DESC
    LIMIT 1;
  END IF;

  IF v_model_id IS NULL THEN
    SELECT mm.id INTO v_model_id
    FROM public.machine_aliases ma
    JOIN public.machine_models mm ON mm.id = ma.machine_model_id
    WHERE ma.normalized_alias IS NOT NULL
      AND length(ma.normalized_alias) >= 4
      AND v_hint LIKE ma.normalized_alias || '%'
    ORDER BY length(ma.normalized_alias) DESC
    LIMIT 1;
  END IF;

  IF v_model_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_match');
  END IF;

  UPDATE public.catalogs SET machine_model_id = v_model_id WHERE id = p_catalog_id;

  INSERT INTO public.catalog_machine_relations (catalog_id, machine_model_id)
  SELECT p_catalog_id, v_model_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_machine_relations cmr
    WHERE cmr.catalog_id = p_catalog_id AND cmr.machine_model_id = v_model_id
  );

  RETURN jsonb_build_object('ok', true, 'modelId', v_model_id);
END;
$function$;