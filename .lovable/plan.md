# GCRB Equipment Catalog — Gap Analysis & Development Plan

## Part 1 — Can the target scenario complete today?

Scenario: search `Komatsu D155A-1` → local first → external → verified result → import → download PDF → becomes library catalog → open in in-app viewer → offline copy.

**Answer: No. The workflow stops at the "download the catalog file from the source" step.**

Where it stands today (verified in code and database):

1. Local search — works. `searchService.searchLocal` normalizes the query and searches models, aliases, serial ranges (via `search_serial_model_ids`), parts, catalogs, assemblies. Local always runs first.
2. External search — works but is **manual**: the user must press "Online search". There is no automatic fallback when local returns 0 results, and no automatic redirect to the model page on an exact local match.
3. Verified external result — partially: only K-Part has a real connector (`k_part_public`). TehCat, 777parts, AVRORA PARTS are `link_template` (managed search links, correctly excluded from connector results). Demo source is disabled in the database, so no demo results in production.
4. Import to library — works for **metadata only**, through the atomic `import_external_payload` RPC (managers only).
5. **Download the PDF from the source — MISSING.** No connector exposes a file; `allows_download = false` on every source and K-Part explicitly returns `download_permitted: false`. A library PDF exists only if a manager uploads it by hand on the catalog page.
6. In-app viewer — works once a file exists (3-panel layout, section tree, jump to `page_from`).
7. Offline copy — works (Cache Storage + IndexedDB + SHA-256 + progress + "متاح بدون إنترنت" + Downloads page + remove).

So: search → import metadata → manual PDF upload → viewer → offline is complete. Search → automatic download from an external source is not, and by design must stay blocked for any source that requires auth/subscription/CAPTCHA.

## Part 2 — Requirement-by-requirement

| # | Requirement | Status | Note |
|---|---|---|---|
| 1 | Search workflow, normalization, local priority | PARTIAL | Filters limited to manufacturer only in UI (service supports type/model/serial); online is a manual button; no exact-match auto-open |
| 2 | External result classification & actions | PARTIAL | "Open source", "Preview/import" exist; "Download and save" absent; no capability badges (verified vs managed link) |
| 3 | Institution library | PARTIAL | Import writes manufacturer→model→catalog; PDF only via manual upload |
| 4 | Machine/Model page as home screen | MISSING/DIFFERENT | No machine image, no serial header (`S/N 5508-UP`), catalogs are a flat list not grouped by catalog category, **no `machine_assets` shown at all** |
| 5 | Catalog viewer layout | PARTIAL | Left sections / center PDF / right assemblies present; no bottom parts table; header lacks serial applicability; no "open source" |
| 6 | Section navigation | MATCHED | Searchable tree, selection filters assemblies, jumps to `page_from` |
| 7 | Exploded diagram + hotspots | MISSING | Assembly parts table exists; no diagram rendering, no hotspot↔row interaction. `diagrams` and `diagram_hotspots` tables are empty and unused by the app |
| 8 | Three distinct operations | PARTIAL | "Save to library" and "offline download" are distinct; "download from source" missing, so B is incomplete |
| 9 | Offline workflow | MATCHED | As described, storage provider is abstracted for future Tauri |
| 10 | New equipment workflow | PARTIAL | `NewEquipmentPanel` creates `machine_asset` + uploads manuals; nothing anywhere **reads** them back (0 rows in DB, no asset list, no asset page) |
| 11 | Source management | PARTIAL/DIFFERENT | All fields editable, arbitrary URL correctly becomes a managed link — but the UI writes `search_url_template`, `allows_download`, `manufacturer_scope`, `notes` into the `configuration` JSON instead of the real Phase 2 columns added by the migration. Two sources of truth |

## Part 3 — Development plan (frontend-led, world-class UX)

### A. Institution Equipment ("معدات المؤسسة") — new primary surface
- New route `/assets`: professional card grid, one card per real machine — photo, model name, manufacturer, equipment type, serial number, asset number, year, branch/project, count of saved catalogs and original manuals, "Available offline" indicator.
- Filters: manufacturer, equipment type, branch, year; search by name/serial/asset number/model.
- New route `/assets/$assetId`: asset header with photo, full asset data, its original CD/supplied manuals (opened in the in-app viewer), plus catalogs inherited from its model.
- Machine photos: upload per asset and per model into the existing private bucket; graceful branded placeholder by equipment type when no photo.

### B. Model page rebuilt as the equipment home screen
- Hero header: photo, `KOMATSU D155A-1`, equipment type, `S/N 5508-UP`, quick actions (favorite, offline, add asset).
- Catalogs grouped into category tiles: Parts / Operation / Service / Workshop / Maintenance / Engine / Transmission / Electrical / Hydraulic / Specifications — each tile shows count and offline state.
- Institution-owned assets for that model listed inline, linking to `/assets/$assetId`.

### C. Unified search experience
- Single result surface: local results first, then a clearly separated "External sources" band with badges — Verified connector / Managed search link / Import allowed / Download allowed.
- Automatic external search when local returns nothing (still user-cancellable), with per-source progress.
- Exact single local model match offers a one-click jump to the model page.
- Expose the filters the service already supports (equipment type, catalog type, serial number).

### D. Catalog viewer upgrade
- Add the bottom/adaptive parts table for the selected assembly so the viewer becomes the workspace.
- Header gains serial applicability and revision/language chips; "Open source" when the catalog came from an external source.
- Keep the three distinct actions visually separate: Open source / Save to library / Download for offline.

### E. Assemblies: exploded diagram + hotspots
- Render `diagrams.image_url` with an overlay of `diagram_hotspots`; click hotspot → highlight part row, click row → highlight hotspot; zoom/pan.
- Falls back to today's table when no diagram data exists.

### F. Source management correctness
- Move `allows_download`, `search_url_template`, `manufacturer_scope`, `notes` reads/writes onto the real columns; keep backward-compatible reads from `configuration` during transition.
- Show source capability chips consistently wherever external results appear.

### G. Download-from-source (bounded, safe)
- Add a capability-gated "Download and save" action that only appears when the source is a real connector, `allows_download = true`, and the connector returns a direct, freely accessible file URL. Fetch happens server-side into the private `catalogs` bucket and creates the `catalog_files` row. No auth/subscription/CAPTCHA/paywall bypass, ever.

### H. Design system polish
- Institutional industrial identity retained; refine card/table density, empty states, skeletons, and full RTL/LTR parity on every new screen.

## Technical notes
- New/changed routes: `/assets`, `/assets/$assetId`; rewrite of `models.$modelId`, `search`, `assemblies.$assemblyId`, `catalogs.$catalogId`; edits to `sources.tsx`.
- New repository methods for `machine_assets` / `asset_manuals` / `diagrams` / `diagram_hotspots` (tables and RLS already exist).
- Server-side file fetch as a new `createServerFn` in a thin wrapper module.
- No schema migration expected beyond an optional `image_url` on `machine_assets` for asset photos; confirmed `machine_models.image_url` already exists.
- Suggested order: A → B → C → D → E → F → G → H, each shippable on its own.
