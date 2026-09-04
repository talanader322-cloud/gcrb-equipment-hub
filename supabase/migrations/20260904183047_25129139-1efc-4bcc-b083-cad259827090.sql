ALTER TABLE public.machine_models
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS image_source text;

ALTER TABLE public.machine_models
  DROP CONSTRAINT IF EXISTS machine_models_image_source_check;

ALTER TABLE public.machine_models
  ADD CONSTRAINT machine_models_image_source_check
  CHECK (image_source IS NULL OR image_source IN ('catalog_page','scheme','manual'));

COMMENT ON COLUMN public.machine_models.image_path IS
  'Model photo. Private storage object path in the machine-images bucket, read only through signed URLs.';
COMMENT ON COLUMN public.machine_models.image_source IS
  'Where the model photo came from: catalog_page (rendered PDF page), scheme (catalog diagram) or manual (uploaded by a manager).';