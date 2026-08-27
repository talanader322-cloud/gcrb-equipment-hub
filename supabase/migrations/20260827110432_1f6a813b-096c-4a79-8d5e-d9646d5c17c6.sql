-- Constrain manual/source vocabulary used by the unified original-manual pipeline.
ALTER TABLE public.asset_manuals
  DROP CONSTRAINT IF EXISTS asset_manuals_manual_type_check;
ALTER TABLE public.asset_manuals
  ADD CONSTRAINT asset_manuals_manual_type_check CHECK (
    manual_type IS NULL OR manual_type IN (
      'parts_catalog','operation_manual','service_manual','workshop_manual',
      'maintenance_manual','engine_manual','transmission_manual',
      'electrical_diagram','hydraulic_diagram','specification_manual','other'
    )
  );

ALTER TABLE public.asset_manuals
  DROP CONSTRAINT IF EXISTS asset_manuals_source_type_check;
ALTER TABLE public.asset_manuals
  ADD CONSTRAINT asset_manuals_source_type_check CHECK (
    source_type IN ('original_cd','original_print','institution_scan','online_import','other')
  );

COMMENT ON COLUMN public.asset_manuals.source_type IS
  'Provenance of the document. original_cd = original manual/CD supplied with the machine by the OEM or vendor (the institutional-original value used by the unified upload pipeline).';

-- Atomic creation of catalogs -> catalog_files -> asset_manuals.
CREATE OR REPLACE FUNCTION public.create_asset_manual(p_asset_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_model_id uuid;
  v_manufacturer_id uuid;
  v_catalog_id uuid;
  v_file_id uuid;
  v_manual_id uuid;
  v_title text := NULLIF(btrim(p_payload->>'title'), '');
  v_manual_type text := COALESCE(NULLIF(btrim(p_payload->>'manualType'), ''), 'other');
  v_language text := COALESCE(NULLIF(btrim(p_payload->>'language'), ''), 'en');
  v_revision text := NULLIF(btrim(p_payload->>'revision'), '');
  v_catalog_number text := NULLIF(btrim(p_payload->>'catalogNumber'), '');
  v_serial_from text := NULLIF(btrim(p_payload->>'serialFrom'), '');
  v_serial_to text := NULLIF(btrim(p_payload->>'serialTo'), '');
  v_source_type text := COALESCE(NULLIF(btrim(p_payload->>'sourceType'), ''), 'original_cd');
  v_storage_path text := NULLIF(btrim(p_payload->>'storagePath'), '');
  v_bucket text := COALESCE(NULLIF(btrim(p_payload->>'storageBucket'), ''), 'catalogs');
  v_filename text := NULLIF(btrim(p_payload->>'originalFilename'), '');
  v_checksum text := NULLIF(btrim(p_payload->>'checksum'), '');
  v_file_size bigint := NULLIF(p_payload->>'fileSize', '')::bigint;
  v_mime text := COALESCE(NULLIF(btrim(p_payload->>'mimeType'), ''), 'application/pdf');
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may upload original manuals.' USING ERRCODE = '42501';
  END IF;

  IF v_storage_path IS NULL OR v_checksum IS NULL OR v_file_size IS NULL OR v_file_size <= 0 THEN
    RAISE EXCEPTION 'A stored PDF file reference (path, checksum, size) is required.' USING ERRCODE = '22023';
  END IF;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Manual title is required.' USING ERRCODE = '22023';
  END IF;

  SELECT ma.machine_model_id INTO v_model_id
  FROM public.machine_assets ma WHERE ma.id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine asset not found.' USING ERRCODE = '22023';
  END IF;

  IF v_model_id IS NULL THEN
    RAISE EXCEPTION 'This machine must be linked to a model before original manuals can be stored.' USING ERRCODE = '22023';
  END IF;

  SELECT mm.manufacturer_id INTO v_manufacturer_id
  FROM public.machine_models mm WHERE mm.id = v_model_id;

  INSERT INTO public.catalogs (
    manufacturer_id, machine_model_id, catalog_number, title, catalog_type,
    language, revision, serial_from, serial_to, searchable, active
  ) VALUES (
    v_manufacturer_id, v_model_id, v_catalog_number, v_title, v_manual_type,
    v_language, v_revision, v_serial_from, v_serial_to, true, true
  ) RETURNING id INTO v_catalog_id;

  INSERT INTO public.catalog_files (
    catalog_id, storage_provider, storage_bucket, storage_path,
    original_filename, mime_type, file_size, checksum
  ) VALUES (
    v_catalog_id, 'supabase', v_bucket, v_storage_path,
    v_filename, v_mime, v_file_size, v_checksum
  ) RETURNING id INTO v_file_id;

  UPDATE public.catalogs SET file_id = v_file_id WHERE id = v_catalog_id;

  INSERT INTO public.catalog_machine_relations (catalog_id, machine_model_id)
  VALUES (v_catalog_id, v_model_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.asset_manuals (
    machine_asset_id, catalog_id, manual_type, title, original_filename,
    file_size, checksum, language, revision, serial_from, serial_to,
    source_type, uploaded_by
  ) VALUES (
    p_asset_id, v_catalog_id, v_manual_type, v_title, v_filename,
    v_file_size, v_checksum, v_language, v_revision, v_serial_from, v_serial_to,
    v_source_type, v_user_id
  ) RETURNING id INTO v_manual_id;

  RETURN jsonb_build_object(
    'ok', true, 'catalogId', v_catalog_id, 'catalogFileId', v_file_id, 'manualId', v_manual_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_asset_manual(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_asset_manual(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_asset_manual(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_asset_manual(uuid, jsonb) TO service_role;