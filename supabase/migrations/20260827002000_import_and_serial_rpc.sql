-- =========================================================
-- GCRB Equipment Catalog - transactional import + serial search
-- =========================================================

-- Prevent duplicate catalog/model relations when serial_range_id is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_machine_relations_nullable_serial
  ON public.catalog_machine_relations (
    catalog_id,
    machine_model_id,
    COALESCE(serial_range_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Server-side serial lookup. This replaces loading hundreds of serial ranges
-- into the browser and scales with the database instead.
CREATE OR REPLACE FUNCTION public.search_serial_model_ids(
  p_query TEXT,
  p_manufacturer_id UUID DEFAULT NULL,
  p_equipment_type_id UUID DEFAULT NULL
)
RETURNS TABLE(machine_model_id UUID, match_rank INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      public.normalize_code(p_query) AS normalized,
      NULLIF(REGEXP_REPLACE(COALESCE(p_query, ''), '[^0-9]', '', 'g'), '')::NUMERIC AS numeric_value
  ),
  candidates AS (
    SELECT
      sr.machine_model_id,
      GREATEST(
        CASE
          WHEN public.normalize_code(sr.display_value) = i.normalized THEN 120
          WHEN sr.serial_prefix IS NOT NULL
            AND i.normalized LIKE public.normalize_code(sr.serial_prefix) || '%' THEN 100
          ELSE 0
        END,
        CASE
          WHEN i.numeric_value IS NOT NULL
           AND NULLIF(REGEXP_REPLACE(COALESCE(sr.serial_from, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
           AND i.numeric_value >= NULLIF(REGEXP_REPLACE(sr.serial_from, '[^0-9]', '', 'g'), '')::NUMERIC
           AND (
             sr.serial_to IS NULL
             OR NULLIF(REGEXP_REPLACE(sr.serial_to, '[^0-9]', '', 'g'), '') IS NULL
             OR i.numeric_value <= NULLIF(REGEXP_REPLACE(sr.serial_to, '[^0-9]', '', 'g'), '')::NUMERIC
           )
           AND (
             sr.serial_prefix IS NULL
             OR public.normalize_code(sr.serial_prefix) = ''
             OR i.normalized LIKE public.normalize_code(sr.serial_prefix) || '%'
           )
          THEN 80
          ELSE 0
        END
      )::INT AS rank_value
    FROM public.serial_ranges sr
    JOIN public.machine_models mm ON mm.id = sr.machine_model_id
    CROSS JOIN input i
    WHERE i.normalized IS NOT NULL
      AND (p_manufacturer_id IS NULL OR mm.manufacturer_id = p_manufacturer_id)
      AND (p_equipment_type_id IS NULL OR mm.equipment_type_id = p_equipment_type_id)
  )
  SELECT c.machine_model_id, MAX(c.rank_value)::INT AS match_rank
  FROM candidates c
  WHERE c.rank_value > 0
  GROUP BY c.machine_model_id
  ORDER BY MAX(c.rank_value) DESC, c.machine_model_id
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.search_serial_model_ids(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_serial_model_ids(TEXT, UUID, UUID) TO authenticated;

-- Atomic external import. The import job is created before the inner
-- subtransaction. If a domain write fails, PostgreSQL rolls all domain writes
-- back, while the job is retained and marked failed.
CREATE OR REPLACE FUNCTION public.import_external_payload(
  p_payload JSONB,
  p_source_id UUID,
  p_duplicate_strategy TEXT DEFAULT 'link',
  p_link_model_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_job_id UUID;
  v_manufacturer_id UUID;
  v_equipment_type_id UUID;
  v_model_id UUID;
  v_catalog_id UUID;
  v_part_id UUID;
  v_serial_range_id UUID;
  v_existing_id UUID;
  v_name TEXT := NULLIF(TRIM(p_payload->>'manufacturerName'), '');
  v_equipment_type TEXT := NULLIF(TRIM(p_payload->>'equipmentTypeName'), '');
  v_model_name TEXT := NULLIF(TRIM(p_payload->>'modelName'), '');
  v_serial_from TEXT := NULLIF(TRIM(p_payload->>'serialFrom'), '');
  v_serial_to TEXT := NULLIF(TRIM(p_payload->>'serialTo'), '');
  v_serial_display TEXT := NULLIF(TRIM(p_payload->>'serialDisplay'), '');
  v_catalog_number TEXT := NULLIF(TRIM(p_payload->>'catalogNumber'), '');
  v_catalog_title TEXT := NULLIF(TRIM(p_payload->>'catalogTitle'), '');
  v_catalog_type TEXT := COALESCE(NULLIF(TRIM(p_payload->>'catalogType'), ''), 'other');
  v_language TEXT := COALESCE(NULLIF(TRIM(p_payload->>'language'), ''), 'en');
  v_revision TEXT := NULLIF(TRIM(p_payload->>'revision'), '');
  v_part_number TEXT := NULLIF(TRIM(p_payload->>'partNumber'), '');
  v_part_description TEXT := NULLIF(TRIM(p_payload->>'partDescription'), '');
  v_external_reference TEXT := COALESCE(NULLIF(TRIM(p_payload->>'externalReference'), ''), 'unknown');
  v_slug TEXT;
  v_error TEXT;
  v_created TEXT[] := ARRAY[]::TEXT[];
  v_linked TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may import external records.' USING ERRCODE = '42501';
  END IF;

  IF p_duplicate_strategy NOT IN ('link', 'create') THEN
    RAISE EXCEPTION 'Invalid duplicate strategy.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.import_jobs (
    source_id, user_id, import_type, status, total_records
  ) VALUES (
    p_source_id, v_user_id, 'online_result', 'running', 1
  ) RETURNING id INTO v_job_id;

  BEGIN
    -- Manufacturer -----------------------------------------------------------
    IF v_name IS NOT NULL THEN
      v_slug := TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(v_name, '[^A-Za-z0-9]+', '-', 'g')));
      SELECT id INTO v_manufacturer_id
      FROM public.manufacturers
      WHERE slug = v_slug OR LOWER(name) = LOWER(v_name)
      ORDER BY CASE WHEN slug = v_slug THEN 0 ELSE 1 END
      LIMIT 1;

      IF v_manufacturer_id IS NULL THEN
        INSERT INTO public.manufacturers (name, short_name, slug)
        VALUES (v_name, v_name, v_slug)
        RETURNING id INTO v_manufacturer_id;
        v_created := array_append(v_created, 'manufacturer');
      ELSE
        v_linked := array_append(v_linked, 'manufacturer');
      END IF;
    END IF;

    -- Equipment type --------------------------------------------------------
    IF v_equipment_type IS NOT NULL THEN
      v_slug := TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(v_equipment_type, '[^A-Za-z0-9]+', '-', 'g')));
      SELECT id INTO v_equipment_type_id
      FROM public.equipment_types
      WHERE slug = v_slug OR LOWER(name) = LOWER(v_equipment_type)
      LIMIT 1;

      IF v_equipment_type_id IS NULL THEN
        INSERT INTO public.equipment_types (name, slug)
        VALUES (v_equipment_type, v_slug)
        RETURNING id INTO v_equipment_type_id;
        v_created := array_append(v_created, 'equipment_type');
      END IF;
    END IF;

    -- Machine model ---------------------------------------------------------
    IF v_model_name IS NOT NULL AND v_manufacturer_id IS NOT NULL THEN
      IF p_link_model_id IS NOT NULL THEN
        SELECT id INTO v_model_id
        FROM public.machine_models
        WHERE id = p_link_model_id AND manufacturer_id = v_manufacturer_id;
        IF v_model_id IS NULL THEN
          RAISE EXCEPTION 'Requested linked model does not belong to the selected manufacturer.';
        END IF;
      ELSE
        SELECT id INTO v_existing_id
        FROM public.machine_models
        WHERE manufacturer_id = v_manufacturer_id
          AND normalized_model_name = public.normalize_code(v_model_name)
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
          IF p_duplicate_strategy = 'create' THEN
            RAISE EXCEPTION 'A matching model already exists for this manufacturer.';
          END IF;
          v_model_id := v_existing_id;
        ELSE
          INSERT INTO public.machine_models (
            manufacturer_id, equipment_type_id, model_name, description
          ) VALUES (
            v_manufacturer_id, v_equipment_type_id, v_model_name, v_part_description
          ) RETURNING id INTO v_model_id;
          v_created := array_append(v_created, 'machine_model');
        END IF;
      END IF;

      IF NOT ('machine_model' = ANY(v_created)) THEN
        v_linked := array_append(v_linked, 'machine_model');
      END IF;

      IF v_serial_display IS NOT NULL THEN
        SELECT id INTO v_serial_range_id
        FROM public.serial_ranges
        WHERE machine_model_id = v_model_id
          AND display_value = v_serial_display
        LIMIT 1;

        IF v_serial_range_id IS NULL THEN
          INSERT INTO public.serial_ranges (
            machine_model_id, serial_from, serial_to, display_value, notes
          ) VALUES (
            v_model_id, v_serial_from, v_serial_to, v_serial_display,
            'Imported from an approved external source.'
          ) RETURNING id INTO v_serial_range_id;
          v_created := array_append(v_created, 'serial_range');
        END IF;
      END IF;
    END IF;

    -- Part ------------------------------------------------------------------
    IF v_part_number IS NOT NULL AND v_manufacturer_id IS NOT NULL THEN
      SELECT id INTO v_part_id
      FROM public.parts
      WHERE manufacturer_id = v_manufacturer_id
        AND normalized_part_number = public.normalize_code(v_part_number)
      LIMIT 1;

      IF v_part_id IS NULL THEN
        INSERT INTO public.parts (
          manufacturer_id, primary_part_number, description, notes
        ) VALUES (
          v_manufacturer_id, v_part_number, v_part_description,
          'Imported from external reference ' || v_external_reference || '.'
        ) RETURNING id INTO v_part_id;
        v_created := array_append(v_created, 'part');

        IF public.normalize_code(v_part_number) IS DISTINCT FROM v_part_number THEN
          INSERT INTO public.part_aliases (part_id, alternate_number, alias_type)
          VALUES (v_part_id, public.normalize_code(v_part_number), 'normalized')
          ON CONFLICT DO NOTHING;
        END IF;
      ELSE
        v_linked := array_append(v_linked, 'part');
      END IF;

      IF v_model_id IS NOT NULL THEN
        INSERT INTO public.part_machine_compatibility (
          part_id, machine_model_id, serial_range_id, notes
        ) VALUES (
          v_part_id, v_model_id, v_serial_range_id,
          CASE WHEN v_serial_display IS NOT NULL THEN 'Applies to ' || v_serial_display || '.' ELSE NULL END
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- Catalog ---------------------------------------------------------------
    IF v_part_number IS NULL
       AND v_manufacturer_id IS NOT NULL
       AND (v_catalog_number IS NOT NULL OR v_catalog_title IS NOT NULL) THEN
      IF v_catalog_number IS NOT NULL THEN
        SELECT id INTO v_catalog_id
        FROM public.catalogs
        WHERE manufacturer_id = v_manufacturer_id
          AND machine_model_id IS NOT DISTINCT FROM v_model_id
          AND normalized_catalog_number = public.normalize_code(v_catalog_number)
          AND COALESCE(revision, '') = COALESCE(v_revision, '')
        LIMIT 1;
      ELSE
        SELECT id INTO v_catalog_id
        FROM public.catalogs
        WHERE manufacturer_id = v_manufacturer_id
          AND machine_model_id IS NOT DISTINCT FROM v_model_id
          AND normalized_catalog_number IS NULL
          AND normalized_title = public.normalize_text(v_catalog_title)
          AND COALESCE(revision, '') = COALESCE(v_revision, '')
        LIMIT 1;
      END IF;

      IF v_catalog_id IS NULL THEN
        IF v_catalog_title IS NULL THEN
          RAISE EXCEPTION 'Catalog title is required when creating a new catalog.';
        END IF;

        INSERT INTO public.catalogs (
          manufacturer_id, machine_model_id, catalog_number, title,
          catalog_type, language, revision, serial_from, serial_to,
          source_id, external_source_reference
        ) VALUES (
          v_manufacturer_id, v_model_id, v_catalog_number, v_catalog_title,
          v_catalog_type, v_language, v_revision, v_serial_from, v_serial_to,
          p_source_id, v_external_reference
        ) RETURNING id INTO v_catalog_id;
        v_created := array_append(v_created, 'catalog');

        IF v_model_id IS NOT NULL THEN
          INSERT INTO public.catalog_machine_relations (
            catalog_id, machine_model_id, serial_range_id
          ) VALUES (
            v_catalog_id, v_model_id, v_serial_range_id
          ) ON CONFLICT DO NOTHING;
        END IF;
      ELSE
        v_linked := array_append(v_linked, 'catalog');
      END IF;
    END IF;

    INSERT INTO public.import_job_items (
      import_job_id, external_reference, entity_type, status, local_entity_id
    ) VALUES (
      v_job_id,
      v_external_reference,
      CASE WHEN v_part_number IS NOT NULL THEN 'part' ELSE 'catalog' END,
      'imported',
      COALESCE(v_part_id, v_catalog_id, v_model_id)
    );

    UPDATE public.import_jobs
    SET status = 'completed', imported_records = 1, completed_at = now()
    WHERE id = v_job_id;

  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    UPDATE public.import_jobs
    SET status = 'failed', failed_records = 1, error_log = v_error, completed_at = now()
    WHERE id = v_job_id;

    INSERT INTO public.import_job_items (
      import_job_id, external_reference, entity_type, status, error_message
    ) VALUES (
      v_job_id, v_external_reference, 'unknown', 'failed', v_error
    );

    RETURN jsonb_build_object(
      'ok', false,
      'jobId', v_job_id,
      'error', v_error
    );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'jobId', v_job_id,
    'manufacturerId', v_manufacturer_id,
    'modelId', v_model_id,
    'catalogId', v_catalog_id,
    'partId', v_part_id,
    'created', to_jsonb(v_created),
    'linked', to_jsonb(v_linked)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_external_payload(JSONB, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_external_payload(JSONB, UUID, TEXT, UUID) TO authenticated;
