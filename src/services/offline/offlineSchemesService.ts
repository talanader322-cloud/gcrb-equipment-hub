import { supabase } from "@/integrations/supabase/client";

/**
 * Offline storage for schematic (parts-book diagram) images.
 *
 * Images are mirrored to Supabase storage by the importer ("catalogs"
 * bucket, path `schemes/{catalogId}/{book}/{page}.ext`). For offline use the
 * browser downloads each mirrored image (signed URL) into the Cache API and
 * records metadata in IndexedDB, mirroring offlineCatalogService.
 */

export type OfflineSchemeMetadata = {
  key: string;
  catalogId: string;
  pageNumber: number;
  size: number;
  mimeType: string;
  downloadedAt: string;
  provider: "browser-cache";
};

export type OfflineSchemeItem = {
  pageNumber: number;
  imageStoragePath: string | null;
  imageUrl: string | null;
};

export type OfflineObjectUrl = {
  url: string;
  revoke: () => void;
};

const CACHE_NAME = "gcrb-scheme-images-v1";
const DB_NAME = "gcrb-offline-schemes-v1";
const DB_VERSION = 1;
const STORE_NAME = "schemes";

function metadataKey(catalogId: string, pageNumber: number): string {
  return `${catalogId}:${pageNumber}`;
}

function cacheRequest(key: string): Request {
  return new Request(`https://offline.gcrb.local/schemes/${encodeURIComponent(key)}`);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("catalogId", "catalogId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open the offline schemes database."));
  });
}

async function idbPut(metadata: OfflineSchemeMetadata): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(metadata);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Offline scheme metadata write failed."));
  });
  database.close();
}

async function idbList(): Promise<OfflineSchemeMetadata[]> {
  const database = await openDatabase();
  const result = await new Promise<OfflineSchemeMetadata[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as OfflineSchemeMetadata[]) ?? []);
    request.onerror = () =>
      reject(request.error ?? new Error("Offline scheme metadata list failed."));
  });
  database.close();
  return result;
}

async function idbDeleteByCatalog(catalogId: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const index = transaction.objectStore(STORE_NAME).index("catalogId");
    const request = index.openKeyCursor(IDBKeyRange.only(catalogId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        transaction.objectStore(STORE_NAME).delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Offline scheme delete failed."));
  });
  database.close();
}

async function resolveSourceUrl(item: OfflineSchemeItem): Promise<string | null> {
  if (item.imageStoragePath) {
    try {
      const { data, error } = await supabase.storage
        .from("catalogs")
        .createSignedUrl(item.imageStoragePath, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {
      return null;
    }
  }
  return item.imageUrl;
}

export const offlineSchemesService = {
  isSupported(): boolean {
    return typeof window !== "undefined" && "caches" in window && "indexedDB" in window;
  },

  async requestPersistence(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  },

  async list(catalogId: string): Promise<OfflineSchemeMetadata[]> {
    if (!this.isSupported()) return [];
    return (await idbList())
      .filter((row) => row.catalogId === catalogId)
      .sort((a, b) => a.pageNumber - b.pageNumber);
  },

  async isSaved(catalogId: string, pageNumber: number): Promise<boolean> {
    if (!this.isSupported()) return false;
    const rows = await idbList();
    return rows.some((row) => row.catalogId === catalogId && row.pageNumber === pageNumber);
  },

  async downloadAll(
    catalogId: string,
    items: OfflineSchemeItem[],
    onProgress?: (saved: number, total: number) => void,
  ): Promise<{ saved: number; skipped: number }> {
    if (!this.isSupported()) throw new Error("Offline storage is not supported by this browser.");
    const cache = await caches.open(CACHE_NAME);
    let saved = 0;
    for (const item of items) {
      const sourceUrl = await resolveSourceUrl(item);
      if (!sourceUrl) continue;
      try {
        const response = await fetch(sourceUrl, { credentials: "omit" });
        if (!response.ok) continue;
        const blob = await response.blob();
        const key = metadataKey(catalogId, item.pageNumber);
        await cache.put(
          cacheRequest(key),
          new Response(blob, {
            headers: {
              "content-type": blob.type || "image/png",
              "content-length": String(blob.size),
            },
          }),
        );
        await idbPut({
          key,
          catalogId,
          pageNumber: item.pageNumber,
          size: blob.size,
          mimeType: blob.type || "image/png",
          downloadedAt: new Date().toISOString(),
          provider: "browser-cache",
        });
        saved += 1;
        onProgress?.(saved, items.length);
      } catch {
        // skip sources that cannot be fetched (missing mirror / CORS)
      }
    }
    onProgress?.(saved, items.length);
    return { saved, skipped: items.length - saved };
  },

  async open(catalogId: string, pageNumber: number): Promise<OfflineObjectUrl | null> {
    if (!this.isSupported()) return null;
    const key = metadataKey(catalogId, pageNumber);
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheRequest(key));
    if (!response) return null;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  },

  async removeAll(catalogId: string): Promise<void> {
    if (!this.isSupported()) return;
    const rows = await idbList();
    const cache = await caches.open(CACHE_NAME);
    for (const row of rows) {
      if (row.catalogId === catalogId) {
        await cache.delete(cacheRequest(row.key));
      }
    }
    await idbDeleteByCatalog(catalogId);
  },
};
