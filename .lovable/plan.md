# Phase 2 + Phase 3 deployment

## What I verified first (real reads, no changes made)

Database (the project's live production database, project ref ending `...jziq`):

- Present: `manufacturers`, `equipment_types`, `machine_models`, `catalogs`, `catalog_files`, `external_sources`, `download_records`, `profiles`, `user_roles`, `can_manage_catalog(...)`, and the private `catalogs` storage bucket. Correct project — safe to proceed.
- Missing (Phase 2 not applied yet): `machine_assets`, `asset_manuals`, and the `external_sources` columns `allows_download`, `search_url_template`, `manufacturer_scope`, `notes`.
- `external_sources` currently holds exactly one row: the Demo connector, still enabled. TehCat, 777parts, AVRORA PARTS, K-Part are absent.
- All five storage buckets are private.

Code:

- `supabase/migrations/20260827020000_phase2_catalog_sources_assets.sql` does not exist in this workspace, and no Phase 3 code (offline store, checksum, Cache Storage / IndexedDB) exists. The current viewer, downloads page and equipment page are the earlier basic versions.

## Honest limitation on Steps 4-7

This environment has no GitHub access (no credentials, no `gh`), so I cannot fetch PR #4's head, review its diff, run CI on GitHub, merge it into `main`, or report a merge commit SHA. Those steps must be done by you in GitHub, or I do the equivalent work here in Lovable (which pushes to the repo through Lovable's own sync).

Proposed path: I build Phase 2 + Phase 3 in this project, verify them against the live database and in the running app, and you then merge/close PR #4 as appropriate. I will not report merge, CI, or SHA results I did not execute.

## Phase 2 — database

One idempotent migration (submitted for your approval):

- `ALTER TABLE public.external_sources ADD COLUMN IF NOT EXISTS allows_download boolean NOT NULL DEFAULT false`, `search_url_template text`, `manufacturer_scope text[]`, `notes text`.
- `UPDATE public.external_sources SET enabled = false WHERE connector_key = 'demo'`.
- Insert-or-update (on conflict on `slug`) the four approved heavy-equipment sources: TehCat, 777parts, AVRORA PARTS, K-Part — each with source type, connector key, base URL, search URL template, manufacturer scope, download allowance and notes. No agricultural sources.
- `CREATE TABLE IF NOT EXISTS public.machine_assets` (machine model reference, serial number, asset tag, location, status, notes, timestamps) and `public.asset_manuals` (asset reference, catalog/file reference, title, language, sort order, timestamps), each with: indexes, `GRANT SELECT/INSERT/UPDATE/DELETE` to `authenticated` and `GRANT ALL` to `service_role`, RLS enabled, read policy for any authenticated user, and write policies gated on `can_manage_catalog(auth.uid())`.
- No writes to `storage.buckets`; the existing private `catalogs` bucket is reused.

Then verification by query: both tables exist, the four columns exist, demo disabled, four sources present, buckets still private, RLS enabled on both new tables, and policy checks confirming manager-only writes.

## Phase 2 — application

- Catalog Sources screen (`/sources`) extended for admins/catalog managers: edit enable state, priority, download allowance, search URL template, manufacturer scope and notes; demo source labelled non-production.
- New `k_part` public connector registered in the connector registry (public metadata only, no paywall/CAPTCHA/login bypass); TehCat / 777parts / AVRORA PARTS registered as managed link-out sources whose results carry an external URL instead of scraped content.
- Equipment page gains "إضافة معدة جديدة وكتالوجاتها": create a machine model + machine asset with serial number, then upload one or more PDF manuals in a single flow into the private `catalogs` bucket, creating `catalog_files`, `catalogs` and `asset_manuals` rows.

## Phase 3 — viewer, assemblies, offline

- Catalog viewer rebuilt: PDF pane with page jump input, sections navigation panel (tree from `catalog_sections`), and an assemblies workspace listing assemblies, their parts (position / quantity / supersession) and diagram with hotspot links into part details.
- `OfflineCatalogStore` abstraction (web implementation now, Tauri + SQLite implementation later): streams the signed PDF with progress, computes a SHA-256 checksum via WebCrypto, stores the blob in browser Cache Storage and its metadata (catalog id, size, checksum, timestamp) in IndexedDB, and exposes list / open / remove.
- Downloads manager page: per-catalog progress bar to 100%, recorded checksum, "متاح بدون إنترنت" status, open-offline-copy and remove actions, kept in sync with `download_records`.
- Arabic RTL and English LTR strings added for every new label.

## Verification I will actually run

- Database queries for all ten Step 3 checks plus a policy check that a plain authenticated user cannot write to the new tables.
- `bun run typecheck`, `bun run lint`, `bun run build` in this workspace — no ESLint rule loosening, no `any`/ignore escapes.
- Browser run signed in as `admin2`: Komatsu / D155A-1 search shows no synthetic demo result; create model + asset with serial; upload a PDF; open viewer; check sections and assemblies panels; download offline to 100%; confirm checksum and "متاح بدون إنترنت"; open offline copy; see it in Downloads; remove it and confirm state resets. Existing username/password login re-checked.

## Final report

Migration status, all database verification results, local typecheck/lint/build results, functional test results — and an explicit statement that PR #4 review, GitHub CI and the merge to `main` were not performed here, with what you need to do.
