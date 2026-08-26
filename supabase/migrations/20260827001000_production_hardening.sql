-- =========================================================
-- GCRB Equipment Catalog - production hardening
-- =========================================================

-- 1) Ensure required private storage buckets exist.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('catalogs', 'catalogs', false, 524288000),
  ('diagrams', 'diagrams', false, 52428800),
  ('thumbnails', 'thumbnails', false, 10485760),
  ('manufacturer-logos', 'manufacturer-logos', false, 10485760),
  ('machine-images', 'machine-images', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- 2) Enforce OEM-aware uniqueness for normalized model and part identifiers.
--    These constraints prevent cross-import duplication while still allowing
--    the same technical code to exist under different manufacturers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_models_manufacturer_normalized
  ON public.machine_models (manufacturer_id, normalized_model_name)
  WHERE normalized_model_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_manufacturer_normalized
  ON public.parts (manufacturer_id, normalized_part_number)
  WHERE normalized_part_number IS NOT NULL;

-- Prefer catalog number for identity when available.
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogs_oem_model_number_revision
  ON public.catalogs (
    manufacturer_id,
    COALESCE(machine_model_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_catalog_number,
    COALESCE(revision, '')
  )
  WHERE normalized_catalog_number IS NOT NULL;

-- Fall back to title identity only for catalogs without a catalog number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogs_oem_model_title_revision_no_number
  ON public.catalogs (
    manufacturer_id,
    COALESCE(machine_model_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_title,
    COALESCE(revision, '')
  )
  WHERE normalized_catalog_number IS NULL AND normalized_title IS NOT NULL;

-- 3) Tighten profile and role visibility.
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles self or admin read"
  ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'system_admin'));

DROP POLICY IF EXISTS "roles readable by authenticated" ON public.user_roles;
CREATE POLICY "roles self or admin read"
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'system_admin'));

-- 4) Limit import history visibility to the creator or catalog managers.
DROP POLICY IF EXISTS "import jobs readable" ON public.import_jobs;
CREATE POLICY "import jobs scoped read"
  ON public.import_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_catalog(auth.uid()));

DROP POLICY IF EXISTS "import items readable" ON public.import_job_items;
CREATE POLICY "import items scoped read"
  ON public.import_job_items
  FOR SELECT TO authenticated
  USING (
    public.can_manage_catalog(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.import_jobs j
      WHERE j.id = import_job_id
        AND j.user_id = auth.uid()
    )
  );

-- 5) Prevent unauthorised direct writes to temporary online-search cache.
DROP POLICY IF EXISTS "temp results writable" ON public.external_search_results;
CREATE POLICY "temp results manager insert"
  ON public.external_search_results
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalog(auth.uid()));

-- NOTE: online search for technical users should persist cache rows through a
-- trusted server/service-role path in the next phase. Until then, users may
-- still receive connector results in the response without relying on cache writes.
