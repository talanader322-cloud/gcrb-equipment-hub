/**
 * Durable cache for the Komatsu parts-book scan.
 *
 * The previous implementation kept ~7,900 book records in a single
 * localStorage key. Serialising the whole object on every flush quickly
 * exceeded the ~5MB quota, the write threw, the error was swallowed, and the
 * user lost all progress on refresh. IndexedDB has no practical size limit
 * here and lets us write only the records that changed.
 */

export type CachedBookMeta = {
  book: string;
  title: string;
  /** Truncated searchable text (enough for filtering, small enough to store). */
  text: string;
  status: "ok" | "error";
  attempts: number;
};

export type CachedBookRef = { book: string; dir: string };

const DB_NAME = "gcrb-komatsu";
const DB_VERSION = 1;
const META_STORE = "book-meta";
const LIST_STORE = "book-list";
const LIST_KEY = "scanned";
const LEGACY_KEYS = ["gcrb-komatsu-book-meta-v1", "gcrb-komatsu-book-meta-v2"];

/** Max characters of searchable text kept per book. */
export const MAX_BOOK_TEXT = 300;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "book" });
        }
        if (!db.objectStoreNames.contains(LIST_STORE)) {
          db.createObjectStore(LIST_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

/** Reads every cached book record, keyed by book number. */
export async function readAllBookMeta(): Promise<Record<string, CachedBookMeta>> {
  const out: Record<string, CachedBookMeta> = {};
  try {
    const db = await openDb();
    const store = db.transaction(META_STORE, "readonly").objectStore(META_STORE);
    const rows = await new Promise<CachedBookMeta[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result ?? []) as CachedBookMeta[]);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    for (const row of rows) {
      if (row?.book) out[row.book] = row;
    }
  } catch {
    // fall through to the legacy migration below
  }
  await migrateLegacyCache(out);
  return out;
}

/** One-time import of the old localStorage cache, then drop it. */
async function migrateLegacyCache(into: Record<string, CachedBookMeta>): Promise<void> {
  if (typeof localStorage === "undefined") return;
  const pending: CachedBookMeta[] = [];
  for (const key of LEGACY_KEYS) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, { title?: string; text?: string }>;
      for (const [book, value] of Object.entries(parsed ?? {})) {
        if (into[book] || !value?.title) continue;
        const record: CachedBookMeta = {
          book,
          title: value.title,
          text: (value.text ?? "").slice(0, MAX_BOOK_TEXT),
          status: "ok",
          attempts: 1,
        };
        into[book] = record;
        pending.push(record);
      }
    } catch {
      // ignore corrupt legacy payloads
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  if (pending.length > 0) await writeBookMeta(pending);
}

/** Writes a batch of records; throws so callers can surface persistence failures. */
export async function writeBookMeta(records: CachedBookMeta[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  const store = tx.objectStore(META_STORE);
  for (const record of records) store.put(record);
  await txDone(tx);
}

/** Persists the scanned book list so a refresh does not require a re-scan. */
export async function saveScannedBooks(refs: CachedBookRef[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(LIST_STORE, "readwrite");
  tx.objectStore(LIST_STORE).put({ savedAt: Date.now(), refs }, LIST_KEY);
  await txDone(tx);
}

export async function loadScannedBooks(): Promise<CachedBookRef[] | null> {
  try {
    const db = await openDb();
    const store = db.transaction(LIST_STORE, "readonly").objectStore(LIST_STORE);
    const value = await new Promise<{ refs?: CachedBookRef[] } | undefined>((resolve, reject) => {
      const req = store.get(LIST_KEY);
      req.onsuccess = () => resolve(req.result as { refs?: CachedBookRef[] } | undefined);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    });
    const refs = value?.refs;
    return Array.isArray(refs) && refs.length > 0 ? refs : null;
  } catch {
    return null;
  }
}
