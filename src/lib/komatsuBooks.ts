import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { CatalogSchemePart } from "@/lib/types";

/**
 * Komatsu parts-books importer.
 *
 * Source: the public "kbp" parts store served by 777parts.org/a1/
 * (a React/Ext JS app). The actual data lives in a public Google Cloud
 * Storage bucket mirrored from the Komatsu parts books:
 *
 *   page JSON : https://storage.googleapis.com/kbp_json/p1/{aa}/{book}/{page}.json
 *   diagrams  : https://c1.a2109.com/komatsu/{dir}/{file}a.png
 *
 * Listing is done through the public GCS JSON API (delimiter listing), which
 * also works without any credentials.
 */

// BookRef.dir already carries the full object prefix (e.g. "p1/2/12/"), so the
// base URL must stop at the bucket root to avoid a doubled "p1/p1/…" path.
const GCS_BASE = "https://storage.googleapis.com/kbp_json/";
const GCS_LIST = "https://storage.googleapis.com/storage/v1/b/kbp_json/o";

export type KomatsuBookRef = {
  book: string;
  dir: string;
};

export type BookImportEvent =
  | { type: "scan"; totalBooks: number }
  | { type: "books"; done: number; total: number; bookRef: string }
  | { type: "pages"; done: number; total: number; bookRef: string; page: number }
  | { type: "log"; message: string }
  | { type: "done"; books: number; pages: number }
  | { type: "error"; message: string };

type GcsPageJson = {
  book?: {
    id_group?: string | null;
    BookName?: string | null;
    BookInfo?: string | null;
    BookAbout?: string | null;
    BookSection?: string | null;
    BookDir?: string | null;
  } | null;
  data?: {
    PageTitle?: string | null;
    PageRef?: string | null;
  } | null;
  image?: unknown[];
  views?: unknown[];
  part?: Array<{
    id?: number | string | null;
    ref0?: string | null;
    ref1?: string | null;
    alt?: string | null;
    quantity?: string | number | null;
    item?: string | number | null;
    number?: string | null;
    short_number?: string | null;
    name?: string | null;
    parent_id?: unknown;
    data_id?: unknown;
    level?: number | null;
    options?: unknown;
    page_id?: number | string | null;
    book_id?: number | string | null;
  }>;
};

type GcsListResponse = {
  items?: { name: string }[];
  prefixes?: string[];
  nextPageToken?: string;
};

type GcsListParams = {
  prefix: string;
  delimiter?: string;
  pageToken?: string;
  signal?: AbortSignal;
};

function buildListParams(opts: {
  prefix: string;
  delimiter?: string;
  pageToken?: string | undefined;
  signal?: AbortSignal | undefined;
}): GcsListParams {
  const params: GcsListParams = { prefix: opts.prefix };
  if (opts.delimiter) params.delimiter = opts.delimiter;
  if (opts.pageToken) params.pageToken = opts.pageToken;
  if (opts.signal) params.signal = opts.signal;
  return params;
}

async function gcsList(params: GcsListParams): Promise<GcsListResponse> {
  const url = new URL(GCS_LIST);
  url.searchParams.set("prefix", params.prefix);
  url.searchParams.set("maxResults", "1000");
  if (params.delimiter) url.searchParams.set("delimiter", params.delimiter);
  if (params.pageToken) url.searchParams.set("pageToken", params.pageToken);
  const init: RequestInit = {};
  if (params.signal) init.signal = params.signal;
  const res = await fetch(url.toString(), init);
  if (!res.ok)
    throw new Error(`GCS list ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`);
  return (await res.json()) as GcsListResponse;
}

/** Enumerate every Komatsu book directory (aa- then book-level, two levels). */
export async function scanKomatsuBooks(signal?: AbortSignal): Promise<KomatsuBookRef[]> {
  const aaDirs: string[] = [];
  {
    let token: string | undefined;
    do {
      if (signal?.aborted) throw new DOMException("Scan aborted", "AbortError");
      const page = await gcsList(
        buildListParams({ prefix: "p1/", delimiter: "/", pageToken: token, signal }),
      );
      for (const p of page.prefixes ?? []) {
        if (/^p1\/\d+\/$/.test(p)) aaDirs.push(p);
      }
      token = page.nextPageToken;
    } while (token);
  }

  const books: KomatsuBookRef[] = [];
  for (const aa of aaDirs) {
    let token: string | undefined;
    do {
      if (signal?.aborted) throw new DOMException("Scan aborted", "AbortError");
      const page = await gcsList(
        buildListParams({ prefix: aa, delimiter: "/", pageToken: token, signal }),
      );
      for (const p of page.prefixes ?? []) {
        const match = /^p1\/\d+\/([0-9A-Za-z._-]+)\/$/.exec(p);
        const id = match?.[1];
        if (id) books.push({ book: id, dir: p });
      }
      token = page.nextPageToken;
    } while (token);
  }
  books.sort((a, b) => numericCompare(a.book, b.book));
  return books;
}

function numericCompare(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

/** List the .json page numbers of one book. */
export async function listKomatsuPages(
  book: KomatsuBookRef,
  signal?: AbortSignal,
): Promise<number[]> {
  const pages: number[] = [];
  let token: string | undefined;
  do {
    if (signal?.aborted) throw new DOMException("Import aborted", "AbortError");
    const page = await gcsList(buildListParams({ prefix: book.dir, pageToken: token, signal }));
    for (const item of page.items ?? []) {
      const m = /^(\d+)\.json$/.exec(item.name.slice(book.dir.length));
      const pageNo = m?.[1];
      if (pageNo) pages.push(Number(pageNo));
    }
    token = page.nextPageToken;
  } while (token);
  pages.sort((a, b) => a - b);
  return pages;
}

async function fetchPageJson(
  book: KomatsuBookRef,
  page: number,
  signal?: AbortSignal,
): Promise<GcsPageJson> {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch(`${GCS_BASE}${book.dir}${page}.json`, init);
  if (!res.ok) throw new Error(`Page ${page}: HTTP ${res.status}`);
  return (await res.json()) as GcsPageJson;
}

function normalizeImages(list: unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const entry of list ?? []) {
    if (typeof entry === "string") {
      if (entry.trim()) out.push(entry);
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      for (const key of ["url", "src", "file", "a"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          out.push(value);
          break;
        }
      }
    }
  }
  return out;
}

function bookTitleFrom(page: GcsPageJson): string {
  const b = page.book;
  if (!b) return "";
  for (const text of [b.BookName, b.BookInfo, b.BookAbout]) {
    const trimmed = text ? String(text).trim() : "";
    if (trimmed) return trimmed.split("\n")[0] ?? "";
  }
  return "";
}

function bookTextFrom(page: GcsPageJson): string {
  const b = page.book;
  if (!b) return "";
  return [b.BookName, b.BookInfo, b.BookSection, b.BookAbout]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
}

function buildPageContent(page: GcsPageJson): string {
  const lines: string[] = [];
  if (page.data?.PageTitle) lines.push(String(page.data.PageTitle));
  if (page.data?.PageRef) lines.push(String(page.data.PageRef));
  for (const p of page.part ?? []) {
    const bits = [
      p.number,
      p.short_number,
      p.name,
      p.quantity != null ? String(p.quantity) : "",
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    lines.push(bits.join(" "));
  }
  return lines.join("\n").trim();
}

function buildPagePayload(page: GcsPageJson): {
  title: string | null;
  imageUrl: string | null;
  storagePath: string | null;
  mirrored: boolean;
  parts: Partial<CatalogSchemePart>[];
} {
  const images = normalizeImages(page.image);
  return {
    title: page.data?.PageTitle ?? null,
    imageUrl: images[0] ?? null,
    storagePath: null,
    mirrored: false,
    parts: (page.part ?? []).map((p, index) => ({
      item_ref: p.item != null ? String(p.item) : String(index),
      ref0: p.ref0 ?? null,
      ref1: p.ref1 ?? null,
      alt: p.alt ?? null,
      quantity: p.quantity != null ? String(p.quantity) : null,
      number: p.number ?? null,
      short_number: p.short_number ?? null,
      name: p.name ?? null,
      options: (Array.isArray(p.options) && p.options.length > 0 ? p.options : []) as Json,
      book_id: p.book_id != null ? String(p.book_id) : null,
      page_id: p.page_id != null ? String(p.page_id) : null,
    })),
  };
}

async function uploadImage(
  catalogId: string,
  book: string,
  page: number,
  imageUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = (imageUrl.split(".").pop() ?? "png").split(/[/?#]/)[0] || "png";
    const path = `schemes/${catalogId}/${book}/${page}.${ext}`;
    const { error } = await supabase.storage
      .from("catalogs")
      .upload(path, blob, { upsert: true, contentType: blob.type || "image/png" });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

export type ImportBookOptions = {
  manufacturerId: string;
  mirrorImages: boolean;
  signal?: AbortSignal;
};

/** Import a single book: create/update its catalogs row, index text + schemes. */
export async function importKomatsuBook(
  ref: KomatsuBookRef,
  options: ImportBookOptions,
  onEvent: (event: BookImportEvent) => void,
): Promise<{ catalogId: string; pages: number } | null> {
  const { manufacturerId, mirrorImages, signal } = options;

  onEvent({ type: "log", message: `book ${ref.book}: listing pages…` });
  const pages = await listKomatsuPages(ref, signal);

  const cover = await fetchPageJson(ref, pages[0] ?? 1, signal);
  const title = bookTitleFrom(cover) || `Komatsu parts book ${ref.book}`;
  const reference = `kbp_json:${ref.book}`;

  onEvent({ type: "log", message: `book ${ref.book}: “${title}” (${pages.length} pages)` });

  const { data: created, error: createError } = await supabase.rpc("upsert_schematic_catalog", {
    p_payload: {
      manufacturerId,
      book: ref.book,
      catalogNumber: `777parts-${ref.book}`,
      title,
      reference,
      sourceUrl: `https://777parts.org/a1/#k=!0!${ref.book}?!1`,
      pageCount: pages.length,
    },
  });
  if (createError) throw new Error(createError.message);
  const catalogId = ((created as { catalogId?: string }) ?? {}).catalogId;
  if (!catalogId) throw new Error("Catalog creation returned no id.");

  const schemePages: {
    pageNumber: number;
    title: string | null;
    imageUrl: string | null;
    storagePath: string | null;
    mirrored: boolean;
    parts: Partial<CatalogSchemePart>[];
  }[] = [];

  const textPages: {
    pageNumber: number;
    title: string | null;
    content: string;
  }[] = [];

  let done = 0;
  let index = 0;
  const runner = async () => {
    while (index < pages.length) {
      if (signal?.aborted) throw new DOMException("Import aborted", "AbortError");
      const i = index++;
      const page = pages[i];
      if (page === undefined) continue;
      try {
        const json = await fetchPageJson(ref, page, signal);
        const payload = buildPagePayload(json);
        let storagePath: string | null = null;
        let mirrored = false;
        if (mirrorImages && payload.imageUrl) {
          storagePath = await uploadImage(catalogId, ref.book, page, payload.imageUrl);
          mirrored = storagePath !== null;
        }
        schemePages.push({ ...payload, pageNumber: page, storagePath, mirrored });
        textPages.push({
          pageNumber: page,
          title: `${title} — ${payload.title ?? ""}`.trim(),
          content: buildPageContent(json),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        onEvent({
          type: "log",
          message: `book ${ref.book}: page ${page} skipped (${errMsg(err)})`,
        });
      } finally {
        done += 1;
        onEvent({ type: "pages", done, total: pages.length, bookRef: ref.book, page });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pages.length) }, () => runner()));

  if (schemePages.length > 0) {
    await supabase.rpc("set_catalog_schemes", { p_catalog_id: catalogId, p_pages: schemePages });
  }
  if (textPages.length > 0) {
    await supabase.rpc("upsert_catalog_pages", { p_catalog_id: catalogId, p_pages: textPages });
  }

  return { catalogId, pages: textPages.length };
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export type RunImportOptions = {
  manufacturerId: string;
  mirrorImages: boolean;
  onlyModels?: string[];
  books?: KomatsuBookRef[];
  signal?: AbortSignal;
  onEvent: (event: BookImportEvent) => void;
};

export async function runKomatsuImport(options: RunImportOptions): Promise<void> {
  const { manufacturerId, mirrorImages, onlyModels, books, signal, onEvent } = options;
  const since = Date.now();
  const pending = books ?? [];

  onEvent({ type: "scan", totalBooks: pending.length });
  if (pending.length === 0) {
    onEvent({ type: "log", message: "No books to import." });
    return;
  }

  let booksDone = 0;
  let pagesDone = 0;

  for (const ref of pending) {
    if (signal?.aborted) throw new DOMException("Import aborted", "AbortError");
    if (onlyModels && onlyModels.length > 0) {
      const pages = await listKomatsuPages(ref, signal);
      const cover = await fetchPageJson(ref, pages[0] ?? 1, signal);
      if (!matchesAnyModel(bookTextFrom(cover), onlyModels)) {
        onEvent({ type: "log", message: `book ${ref.book}: skipped (not in my equipment list)` });
        continue;
      }
    }
    try {
      const opts: ImportBookOptions = { manufacturerId, mirrorImages };
      if (signal) opts.signal = signal;
      const result = await importKomatsuBook(ref, opts, onEvent);
      if (result) {
        booksDone += 1;
        pagesDone += result.pages;
        onEvent({ type: "books", done: booksDone, total: pending.length, bookRef: ref.book });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      onEvent({ type: "error", message: `book ${ref.book}: ${errMsg(err)}` });
    }
  }

  const seconds = Math.round((Date.now() - since) / 1000);
  onEvent({
    type: "log",
    message: `Finished in ${seconds}s — ${booksDone} books, ${pagesDone} pages indexed.`,
  });
  onEvent({ type: "done", books: booksDone, pages: pagesDone });
}

function matchesAnyModel(text: string, models: string[]): boolean {
  const haystack = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return models.some((m) => haystack.includes(m.toLowerCase().replace(/[^a-z0-9]/g, "")));
}

/**
 * Normalize a search term / book text so "D155-1", "D1551" and "d155 1"
 * all compare equal. Numbers, letters, unicode included; separators dropped.
 */
export function normalizeKeys(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.]+/g, "");
}

export type ScannedBookMeta = {
  title: string;
  text: string;
};

// v2: the v1 cache may hold empty entries written while page-JSON URLs were
// broken (doubled "p1/" prefix), so it must not be reused.
const BOOK_META_CACHE_KEY = "gcrb-komatsu-book-meta-v2";

function readBookMetaCache(): Record<string, ScannedBookMeta> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(BOOK_META_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ScannedBookMeta>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBookMetaCache(cache: Record<string, ScannedBookMeta>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BOOK_META_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort; title resolution still works without persistence
  }
}

export type ResolveTitlesOptions = {
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
};

/**
 * Fetch the first page of each book to extract its title / model text,
 * with bounded concurrency. Results are cached in localStorage keyed by
 * book number so an already-resolved list is instant on the next visit.
 */
export async function resolveBookTitles(
  refs: KomatsuBookRef[],
  options: ResolveTitlesOptions = {},
): Promise<Record<string, ScannedBookMeta>> {
  const { concurrency = 8, signal, onProgress } = options;
  const cache = readBookMetaCache();
  const result: Record<string, ScannedBookMeta> = {};
  const missing = refs.filter((ref) => !cache[ref.book]);
  let done = refs.length - missing.length;
  onProgress?.(done, refs.length);

  let index = 0;
  const runner = async () => {
    while (index < missing.length) {
      if (signal?.aborted) throw new DOMException("Title resolution aborted", "AbortError");
      const ref = missing[index++];
      if (!ref) continue;
      try {
        const pages = await listKomatsuPages(ref, signal);
        const cover = await fetchPageJson(ref, pages[0] ?? 1, signal);
        const meta: ScannedBookMeta = {
          title: bookTitleFrom(cover) || ref.book,
          text: bookTextFrom(cover),
        };
        cache[ref.book] = meta;
        result[ref.book] = meta;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        result[ref.book] = { title: ref.book, text: "" };
      } finally {
        done += 1;
        onProgress?.(done, refs.length);
        if (done % 25 === 0) writeBookMetaCache(cache);
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, missing.length) }, () => runner()),
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw err;
  } finally {
    writeBookMetaCache(cache);
  }

  for (const ref of refs) {
    const cached = cache[ref.book];
    if (cached) result[ref.book] = cached;
  }
  return result;
}

/** Load already-imported book references mapped to their catalogs rows. */
export async function loadImportedBooks(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("catalogs")
    .select("external_document_ref, id")
    .eq("external_source_label", "kbp_json");
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.external_document_ref) map.set(row.external_document_ref, row.id);
  }
  return map;
}
