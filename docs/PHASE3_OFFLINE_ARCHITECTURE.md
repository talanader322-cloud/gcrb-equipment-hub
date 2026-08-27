# Phase 3 — Catalog Viewer, Download Manager & Offline Architecture

## Goal

Phase 3 turns GCRB Equipment Catalog from a cloud-only catalog database into an application that can keep technical manuals available on a field computer when internet access is unavailable.

## Runtime architecture

```text
Lovable / Web today
  React + TanStack Start
          |
          +-- Supabase/Postgres (catalog metadata)
          +-- Private Storage (catalog PDFs)
          +-- OfflineCatalogStore interface
                  |
                  +-- Browser provider (Phase 3)
                  |     Cache Storage = PDF bytes
                  |     IndexedDB = local metadata/checksum
                  |
                  +-- Tauri provider (desktop phase)
                        AppData/catalogs = PDF bytes
                        SQLite = local metadata/search cache
```

UI code must never write directly to Cache Storage, IndexedDB, SQLite or the desktop filesystem. It talks only to `OfflineCatalogStore`.

## Browser offline provider

Implemented in `src/services/offline/offlineCatalogService.ts`.

- Streams a signed private PDF URL.
- Reports real byte progress when `Content-Length` is available.
- Calculates SHA-256 after download.
- Stores the PDF in Cache Storage.
- Stores catalog/file metadata in IndexedDB.
- Requests persistent browser storage where supported.
- Opens the offline PDF through an object URL.
- Removes the file and local metadata together.

This is device-local storage. One user's browser cache is never considered authoritative corporate data.

## Download job lifecycle

```text
pending/downloading
      |
      +--> progress 0..100
      |
      +--> completed + local_reference
      |
      +--> failed
      |
      +--> removed
```

`download_records` is the auditable user-facing history. The actual offline PDF remains on the device.

## Catalog viewer

The catalog screen is organized into three work areas:

1. Section tree / table of contents.
2. PDF viewer, opening directly at the selected section page when page metadata exists.
3. Assembly list and catalog metadata.

When an offline copy exists, the viewer prefers the local file over the cloud signed URL.

## Exploded diagram / parts view

The assembly screen shows:

- exploded diagram image when available;
- page/diagram selection;
- position number;
- part number;
- description;
- quantity;
- selected-part detail card;
- link to the full part card.

Future diagram hotspot coordinates already fit the existing `diagram_hotspots` domain model and can be layered over the diagram without changing the database architecture.

## Tauri desktop provider — next conversion phase

The Windows `.exe` implementation should add a second `OfflineCatalogStore` provider with the same contract.

Recommended implementation:

- Tauri v2.
- SQLite database under the application data directory.
- Catalog PDF files under `AppData/GCRB Equipment Catalog/catalogs/`.
- Atomic `.part` temporary files while downloading.
- HTTP Range requests for resumable downloads when the storage/source supports byte ranges.
- SHA-256 verification before marking a download complete.
- local search cache for manufacturers, models, serial ranges, catalogs, sections, assemblies and parts.
- sync queue for local changes that are allowed to sync back to the institutional server.

## Security rules

- Corporate PDFs remain private in cloud storage.
- Cloud access uses short-lived signed URLs.
- Service-role credentials are never exposed in the UI or desktop bundle.
- Local files are copies for authorized field use, not public URLs.
- External source authentication/paywalls/CAPTCHAs are never bypassed.

## What Phase 3 intentionally does not claim

Browser Cache Storage cannot guarantee native-file-system resume after a browser/process crash. True resumable downloads and SQLite full offline search belong to the Tauri provider. The Phase 3 interfaces and UI are designed so that conversion does not require rebuilding the application screens.
