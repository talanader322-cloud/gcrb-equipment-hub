# GCRB Equipment Catalog — Revised Implementation Plan (v2)

All 12 architectural corrections are accepted and folded into the plan below. Nothing that already works in Phase 2/3 will be rebuilt; the existing architecture is extended.

## Current state confirmed before planning
- `asset_manuals` inserts in `NewEquipmentPanel` write `storage_path` directly and leave `catalog_id` NULL — this is the document silo to be removed.
- `machine_assets` has no image column; `machine_models.image_url` exists and will not be reused as an asset photo.
- `diagrams` and `diagram_hotspots` are empty (0 rows), so the coordinate standard can be fixed now with no data migration risk.
- `external_sources`: Demo disabled; K-Part = `k_part_public` connector; TehCat / 777parts / AVRORA = `link_template`; `allows_download = false` everywhere.
- `sources.tsx` writes `search_url_template`, `allows_download`, `manufacturer_scope`, `notes` into `configuration` JSON instead of the real Phase 2 columns.

## Approved decisions (locked)
- PR #4 is already merged into main (`4261beda`). No merge attempt, no rebuild of Phase 2/3 — extend current main.
- Equipment photos: **private storage + signed URLs**, reusing the existing private `machine-images` bucket. No public bucket. `machine_models.image_url` stays model-level; `machine_assets.image_url` is asset-specific.
- `allows_download = false` for **all** sources through stages A–G. K-Part = verified metadata only; TehCat / 777parts / AVRORA = managed links (AVRORA disabled until a verified URL is configured). Stage H is built but capability-gated and effectively off.
- No real data required to start: stages A–G ship with professional empty states; any temporary test record is removed after verification.

## Stage B orchestration correction (accepted)
Storage and Postgres cannot share one transaction. The pipeline is an **orchestrated transaction**:
1. Validate the PDF (type + `%PDF-` magic bytes + size).
2. Upload to the private `catalogs` bucket.
3. One atomic database RPC creates `catalogs` → `catalog_files` → `asset_manuals` together.
4. On DB failure: delete the uploaded storage object and return the error. On upload failure: no database rows are written. Never an orphan storage file.

## Schema migration (first step — approval card required)
1. `machine_assets.image_url text NULL` + comment (asset-specific private photo path).
2. `asset_manuals`: `storage_path` becomes a nullable legacy mirror; `catalog_id` becomes `NOT NULL` behind a guard that aborts if any row still lacks a catalog (currently 0 rows).
3. `diagram_hotspots`: CHECK constraint `x, y, width, height` in [0,1] **and** `x + width <= 1`, `y + height <= 1`, plus a table comment declaring the normalized standard. Table is empty, so no coordinate conversion.
4. No new bucket: private `catalogs` for documents, private `machine-images` for photos.

Nothing else in the schema is touched.

## Implementation order (Migration + A + B first, then report and pause for your review)

### A. Machine assets foundation
- `assetRepository`: list/get/create/update assets, list manuals, link/unlink manual catalogs.
- `/assets` — the "معدات المؤسسة / Institution Equipment" surface: professional card grid with photo, model, manufacturer, equipment type, serial number, asset number, year, branch, project, saved-catalog count, offline indicator.
- Filters: manufacturer, equipment type, branch, year; search by serial, asset number, model.
- `/assets/$assetId` — exact machine: photo, manufacturer, model, equipment type, **Serial Number, Asset Number, Year, Branch, Project, Purchase Reference, Notes**, original manuals, model-level catalogs, offline status.
- Asset photo upload (managers only) writing `machine_assets.image_url`.

### B. Unify original manuals with the catalog system
- Rework the upload flow in `NewEquipmentPanel` (and add the same on the asset page) so each uploaded PDF runs the orchestrated transaction above: validate → upload to the private `catalogs` bucket → atomic RPC creating the `catalogs` row (manufacturer, model, catalog_type selector, title, language, revision, serial applicability) + `catalog_files` row + `asset_manuals` row → cleanup of the storage object if the RPC fails.
- `asset_manuals` becomes purely the asset↔catalog association plus asset-scoped metadata (manual_type, serial_from/to, source_type = `original_cd`).
- Result: CD manuals, admin uploads, and permitted external downloads all open in the same Catalog Viewer and use the same OfflineCatalogStore. No second viewer, no second storage path.

### C. Model page as equipment home
- Header: `KOMATSU D155A-1` + equipment type badge, manufacturer, model photo. **No single serial number in the header.**
- "Applicable Serial Ranges" block listing every range (5508-UP, 7001-9000, …).
- Catalogs grouped into category tiles: Parts Catalog, Operation, Service, Workshop, Maintenance, Engine, Transmission, Electrical, Hydraulic, Specifications, Other — each with count and offline state.
- Institution-owned assets for this model listed inline, linking to `/assets/$assetId`.

### D. Unified search experience
- Sequence: local database → dedicated verified connectors (automatic only when local finds nothing) → managed links presented as explicit buttons ("Search TehCat", "Search 777parts", "Search AVRORA PARTS"). Managed links are never described as searched results.
- Single strong local model match surfaces a prominent "Open model" action.
- External capability badges: Verified, Managed Link, Importable, Download permitted, Authentication required.
- Filters exposed: manufacturer, equipment type, serial number, catalog type.
- The three actions stay visually and semantically distinct: **Open source** / **Save to institution library** / **Download for offline use**.

### E. Catalog viewer workspace
- Left: section tree (searchable). Center: PDF page or exploded diagram. Right: assemblies/navigation. Bottom/adaptive: parts table.
- Section click → jump PDF to `page_from` + filter assemblies. Assembly click → show its diagram and parts in place, without leaving the viewer.
- Header: manufacturer, model, catalog title, catalog number, serial applicability, revision, language + actions (favorite, download file, save offline, remove offline, open source when applicable).

### F. Exploded diagrams + normalized hotspots
- Coordinate standard: `x, y, width, height` ∈ [0,1] relative to original image bounds, enforced by the CHECK constraints in the schema step and by an ingest validator.
- Overlay renderer with zoom and pan; hotspot click → highlight the matching `assembly_parts` row; row click → highlight the hotspot.
- Graceful fallback to the parts table when no diagram or hotspots exist.

### G. Source management real-column correction
- Read the real columns first, fall back to `configuration` JSON only for legacy rows; write only real columns from now on. `configuration` keeps connector-specific settings only.
- Capability chips shown consistently wherever a source appears.

### H. Safe connector download framework
Server-side only, shown solely when the source has a dedicated connector **and** `allows_download = true` **and** the connector returns `download_permitted = true` with a permitted direct file URL. The downloader implements: HTTPS only, per-connector host allowlist, SSRF/private-IP and localhost blocking, redirect limit, max file size, Content-Type validation, `%PDF-` magic-byte check, SHA-256, duplicate detection before storing, write into the private `catalogs` bucket, `catalog_files` record, audit logging, and cleanup on failure. No bypass of authentication, subscription, CAPTCHA, paywall, or anti-bot protection — ever.

### I. Design-system and bilingual polish
Industrial institutional identity, consistent card/table density, real empty states and skeletons, full RTL/LTR parity on every new screen.

---

## Who does what

### Your tasks (in the repository / as owner)
1. **Merge PR #4** (Phase 2/3 code) into the main branch before I start, or tell me to work on top of the current branch state — I will not merge branches.
2. **Approve the migration** when the approval card appears (asset image column, asset_manuals link, hotspot constraints).
3. **Decide the photo policy**: signed URLs from a private bucket (recommended, no new bucket) or a public `equipment-images` bucket.
4. **Provide content I cannot invent**: real machine photos, real asset rows (serial/asset number/branch/project), and the original CD PDFs for at least one machine so B can be validated end to end.
5. **Confirm per-source download policy**: for each source, whether `allows_download` may be turned on and which host(s) are permitted — I will not enable download for any source without your written approval.
6. **Optional**: if you want a real connector for TehCat / 777parts / AVRORA, confirm each site's terms allow automated access; until then they stay managed links.
7. **Publish** after each stage you accept, and report anything that looks wrong in preview.

### My tasks (in the application)
1. Apply the schema migration in step 0 and verify it.
2. Build `assetRepository`, `/assets`, `/assets/$assetId` with photo upload (stage A).
3. Convert asset-manual upload into the unified catalog pipeline and migrate the flow in `NewEquipmentPanel` (stage B).
4. Rebuild `models.$modelId` as the equipment home with serial ranges and category tiles (stage C).
5. Rework `search.tsx` into the unified sequenced search with capability badges and the three distinct actions (stage D).
6. Upgrade the catalog viewer into the four-panel workspace (stage E).
7. Implement the diagram overlay with normalized hotspots and two-way highlighting (stage F).
8. Correct `sources.tsx` to the real Phase 2 columns with legacy fallback (stage G).
9. Implement the hardened server-side download framework, disabled by default until you approve a source (stage H).
10. Final design/RTL polish and a verification pass on the full `Komatsu D155A-1` scenario (stage I).

I will deliver stages in this order, each independently shippable, and report what to check after every stage.
