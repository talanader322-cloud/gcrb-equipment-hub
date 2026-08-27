# Phase 2 database migration only

Scope: one idempotent migration against the already-verified live production database, plus real verification queries. No application code is written, no Phase 2/Phase 3 files are recreated, no branches are merged.

## Verified current state (read before planning)

- Core objects present: `manufacturers`, `equipment_types`, `machine_models`, `catalogs`, `catalog_files`, `external_sources`, `download_records`, `profiles`, `user_roles`, `can_manage_catalog(...)`, private `catalogs` bucket. Correct project.
- Missing: `machine_assets`, `asset_manuals`, and `external_sources` columns `allows_download`, `search_url_template`, `manufacturer_scope`, `notes`.
- `external_sources` holds one row only: the Demo connector, currently `enabled = true`. TehCat, 777parts, AVRORA PARTS, K-Part absent.
- All five storage buckets are private.

## Migration contents

1. `ALTER TABLE public.external_sources` — `ADD COLUMN IF NOT EXISTS allows_download boolean NOT NULL DEFAULT false`, `search_url_template text`, `manufacturer_scope text[] NOT NULL DEFAULT '{}'`, `notes text`.
2. Disable demo: `UPDATE public.external_sources SET enabled = false WHERE connector_key = 'demo'`.
3. Upsert the four approved heavy-equipment sources on `slug` (existing rows are updated, never duplicated; no agricultural sources):
   - TehCat — `https://en.tehcat.ru/catalog/`, `connector_key = 'link_template'`, enabled, `allows_download = false`
   - 777parts — `https://777parts.com/`, `link_template`, enabled, `allows_download = false`
   - AVRORA PARTS — `link_template`, **disabled**, no base URL until a Catalog Manager configures a verified one, `allows_download = false`
   - K-Part — `https://k-part.com/`, `connector_key = 'k_part_public'`, enabled, `allows_download = false`, notes recording public-metadata-only usage
4. `CREATE TABLE IF NOT EXISTS public.machine_assets` with exactly the requested fields (`machine_model_id` referencing `machine_models`, `serial_number NOT NULL`, `asset_number`, `manufacture_year`, `branch`, `project`, `purchase_reference`, `notes`, `created_by`, `created_at`, `updated_at`), plus indexes on `machine_model_id`, on `serial_number`, and a partial unique index on `asset_number WHERE asset_number IS NOT NULL`. `updated_at` trigger uses the existing `set_updated_at()`.
5. `CREATE TABLE IF NOT EXISTS public.asset_manuals` with the requested fields (`machine_asset_id` referencing `machine_assets`, nullable `catalog_id` referencing `catalogs`, `manual_type`, `title`, `original_filename`, unique `storage_path`, `file_size`, `checksum`, `language`, `revision`, `serial_from`, `serial_to`, `source_type` defaulting to `original_equipment_manual`, `uploaded_by`, `uploaded_at`), plus indexes on `machine_asset_id` and on `checksum WHERE checksum IS NOT NULL`.
6. Grants and RLS for both new tables: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`, `ENABLE ROW LEVEL SECURITY`, one read policy for `authenticated`, and insert/update/delete policies gated on `public.can_manage_catalog(auth.uid())`. Existing policies elsewhere are untouched.
7. No `storage.buckets` insert or update; the private `catalogs` bucket is reused as-is.

Policies and index creation are written to be re-runnable (drop-if-exists then create, `IF NOT EXISTS` where supported), so a later merge of the PR's own migration file cannot conflict destructively.

## Verification (real queries after apply)

All sixteen checks: both tables exist; the four `external_sources` columns exist; demo `enabled = false`; each of the four sources present with the intended enabled/allows_download values; `pg_class.relrowsecurity` true for both new tables; `storage.buckets.public = false` for `catalogs`; the policy set proves manager-only writes while any authenticated user can read, and a role-simulated write attempt as a non-manager authenticated user is rejected.

## Note on the connector keys

`link_template` and `k_part_public` are not yet in the application's connector registry — that code lives in PR #4. Until that merges, those rows are inert configuration in the database, which is the intended sequencing. I will not add registry code here.

## Report

Migration applied YES/NO, then PASS/FAIL for each of the listed checks, based only on executed queries.
