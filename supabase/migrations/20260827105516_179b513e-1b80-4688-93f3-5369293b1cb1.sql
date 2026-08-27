-- 1. Asset-specific photo (private storage object path; served via signed URLs)
ALTER TABLE public.machine_assets
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.machine_assets.image_url IS
  'Asset-specific photo. Private storage object path in the machine-images bucket, read only through signed URLs. Distinct from machine_models.image_url, which stays model-level.';

-- 2. asset_manuals: catalog_id becomes the canonical document relationship
ALTER TABLE public.asset_manuals
  ALTER COLUMN storage_path DROP NOT NULL;

DO $$
DECLARE v_orphans integer;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.asset_manuals WHERE catalog_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Cannot enforce asset_manuals.catalog_id NOT NULL: % row(s) still lack a catalog link; backfill catalogs + catalog_files for them first.', v_orphans;
  END IF;
END $$;

ALTER TABLE public.asset_manuals
  ALTER COLUMN catalog_id SET NOT NULL;

COMMENT ON COLUMN public.asset_manuals.catalog_id IS
  'Required. Every original equipment manual is a real catalog: catalogs -> catalog_files -> private catalogs bucket. asset_manuals only expresses asset-specific ownership/association, never a second document architecture.';

COMMENT ON COLUMN public.asset_manuals.storage_path IS
  'Legacy/mirror only, nullable. The authoritative file reference is catalog_files via catalog_id. New writes must not depend on this column.';

-- 3. Normalized hotspot coordinate standard
ALTER TABLE public.diagram_hotspots
  DROP CONSTRAINT IF EXISTS diagram_hotspots_normalized_bounds;

ALTER TABLE public.diagram_hotspots
  ADD CONSTRAINT diagram_hotspots_normalized_bounds CHECK (
    x >= 0 AND x <= 1
    AND y >= 0 AND y <= 1
    AND width >= 0 AND width <= 1
    AND height >= 0 AND height <= 1
    AND x + width <= 1
    AND y + height <= 1
  );

COMMENT ON TABLE public.diagram_hotspots IS
  'Exploded-diagram hotspots. x, y, width and height are NORMALIZED fractions (0.0-1.0) of the original diagram image bounds, never pixel values, so hotspots stay aligned at any zoom level, screen size or RTL/LTR layout.';
