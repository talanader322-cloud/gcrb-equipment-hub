ALTER TABLE public.machine_assets RENAME COLUMN image_url TO image_path;

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
  v_prefix text := 'assets/' || p_asset_id::text || '/';
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_catalog(v_user_id) THEN
    RAISE EXCEPTION 'Only catalog managers may upload original manuals.' USING ERRCODE = '42501';
  END IF;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Manual title is required.' USING ERRCODE = '22023';
  END IF;

  IF v_bucket <> 'catalogs' THEN
    RAISE EXCEPTION 'Original manuals may only be stored in the private catalogs bucket.' USING ERRCODE = '22023';
  END IF;

  IF v_storage_path IS NULL
     OR left(v_storage_path, length(v_prefix)) <> v_prefix
     OR length(v_storage_path) <= length(v_prefix)
     OR position('..' IN v_storage_path) > 0 THEN
    RAISE EXCEPTION 'The stored file path must live inside this machine namespace (%).', v_prefix USING ERRCODE = '22023';
  END IF;

  IF v_mime <> 'application/pdf' THEN
    RAISE EXCEPTION 'Only PDF documents are accepted for original manuals.' USING ERRCODE = '22023';
  END IF;

  IF v_file_size IS NULL OR v_file_size <= 0 OR v_file_size > 209715200 THEN
    RAISE EXCEPTION 'The document size must be greater than zero and at most 200 MB.' USING ERRCODE = '22023';
  END IF;

  IF v_checksum IS NULL OR v_checksum !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'A valid SHA-256 checksum (64 hexadecimal characters) is required.' USING ERRCODE = '22023';
  END IF;

  SELECT ma.machine_model_id INTO v_model_id
  FROM public.machine_assets ma WHERE ma.id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine asset not found.' USING ERRCODE = '22023';
  END IF;

  IF v_model_id IS NULL THEN
    RAISE EXCEPTION 'This machine must be linked to a model before original manuals can be stored.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'catalogs' AND o.name = v_storage_path
  ) THEN
    RAISE EXCEPTION 'The referenced stored document does not exist.' USING ERRCODE = '22023';
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
    v_filename, v_mime, v_file_size, lower(v_checksum)
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
    v_file_size, lower(v_checksum), v_language, v_revision, v_serial_from, v_serial_to,
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