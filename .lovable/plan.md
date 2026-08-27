# Stage B Corrective Hardening (before Stage C)

Six corrections, applied to the accepted Stage B architecture. Stage C is not started.

## 1. Rename asset photo field to a path

New corrective migration (the applied one is untouched): rename `machine_assets.image_url` to `machine_assets.image_path`. Existing asset data is test-only, so a plain rename is safe. `machine_models.image_url` stays as is.

Then update the generated database types, `assetRepository` (select, update, previous-value read), `/assets`, `/assets/$assetId`, and `AssetPhoto` usage. `signedPhotoUrl()` drops the branch that returns an `http(s)` value directly — the field is a private storage path only, and signed URLs are generated per read and never persisted.

## 2. Harden the `create_asset_manual` RPC

Second migration replacing the function body, keeping SECURITY DEFINER, fixed `search_path`, the `can_manage_catalog(auth.uid())` gate, and the revoked PUBLIC/anon EXECUTE. New server-side checks before any insert:

- `storageBucket` must equal `catalogs`
- `storagePath` must start with `assets/<p_asset_id>/`
- `mimeType` must equal `application/pdf`
- `fileSize` must be `> 0` and `<= 209715200`
- `checksum` must match `^[0-9a-f]{64}$`
- the object must already exist in `storage.objects` with `bucket_id = 'catalogs'` and `name = storagePath`, otherwise raise

Manual/source type stay constrained by existing CHECK constraints. Each failure raises a distinct message so tests can assert the specific rejection.

## 3. Surface storage cleanup failures

In `manualUploadService`, the compensating delete after an RPC failure is no longer swallowed. If the delete succeeds, the original database error is thrown unchanged. If the delete also fails, a combined high-priority error is raised and logged, naming both the registration failure and the orphaned object path (no secrets, no signed URLs in the log). The misleading "orphan files are impossible" comment is corrected.

## 4. Safe partial-upload retry in NewEquipmentPanel

Keep the created `assetId` in component state. On save: create the asset only when no `assetId` exists yet; upload drafts sequentially; remove each draft from the list as it succeeds so a retry never re-uploads a stored manual. On a failure mid-batch, show "Equipment created successfully. X of Y manuals saved. Complete the remaining manuals from the equipment page." with a link/button to `/assets/<assetId>`. The per-manual RPC stays atomic; the batch is not one transaction. Form reset (and clearing `assetId`) happens only after a fully successful batch.

## 5. Fix recent-item semantics

Remove the incorrect `trackRecent(user.id, "machine_model", assetId)` call from the asset detail page. No asset IDs are stored under `entity_type = machine_model`. A real `machine_asset` entity type is deferred to a later, intentional change.

## 6. Photo upload validation

`assetRepository.uploadAssetPhoto` validates before upload: non-empty, size cap (5 MB), extension plus magic-byte sniffing for JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), and WebP (`RIFF....WEBP`). MIME type alone is not trusted. Bucket stays the private `machine-images`; upload/update/delete remain manager-only.

## Validation

`bun run typecheck`, `bun run lint`, `bun run build`, then verify: `image_path` exists and `image_url` is gone on `machine_assets`; photos still render through signed URLs; RPC rejects wrong bucket, out-of-namespace path, oversize file, invalid checksum, and non-existent storage object; new-equipment retry creates no duplicate asset; the bad recent tracking is gone; cleanup failure is reported. Temporary test data is removed afterwards, and a correction report is returned.
