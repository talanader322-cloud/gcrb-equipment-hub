export type OfflineCatalogMetadata = {
  key: string;
  catalogId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string | null;
  cacheKey: string;
  downloadedAt: string;
  provider: "browser-cache";
};

export type OfflineDownloadInput = {
  catalogId: string;
  fileId: string;
  url: string;
  filename: string;
  mimeType?: string | null;
};

export type OfflineDownloadProgress = {
  loaded: number;
  total: number | null;
  percent: number;
};

export type OfflineObjectUrl = {
  url: string;
  revoke: () => void;
};

export interface OfflineCatalogStore {
  readonly provider: string;
  isSupported(): boolean;
  requestPersistence(): Promise<boolean>;
  download(
    input: OfflineDownloadInput,
    onProgress?: (progress: OfflineDownloadProgress) => void,
  ): Promise<OfflineCatalogMetadata>;
  get(catalogId: string, fileId: string): Promise<OfflineCatalogMetadata | null>;
  findByCatalog(catalogId: string): Promise<OfflineCatalogMetadata | null>;
  list(): Promise<OfflineCatalogMetadata[]>;
  open(catalogId: string, fileId: string): Promise<OfflineObjectUrl | null>;
  remove(catalogId: string, fileId: string): Promise<void>;
}

const CACHE_NAME = "gcrb-catalog-files-v1";
const DB_NAME = "gcrb-offline-catalogs-v1";
const DB_VERSION = 1;
const STORE_NAME = "catalogs";

function metadataKey(catalogId: string, fileId: string): string {
  return `${catalogId}:${fileId}`;
}

function cacheRequest(key: string): Request {
  return new Request(`https://offline.gcrb.local/catalogs/${encodeURIComponent(key)}`);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return `sha256:${toHex(digest)}`;
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
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline database."));
  });
}

async function idbPut(metadata: OfflineCatalogMetadata): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(metadata);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline metadata write failed."));
  });
  database.close();
}

async function idbGet(key: string): Promise<OfflineCatalogMetadata | null> {
  const database = await openDatabase();
  const result = await new Promise<OfflineCatalogMetadata | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as OfflineCatalogMetadata | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Offline metadata read failed."));
  });
  database.close();
  return result;
}

async function idbList(): Promise<OfflineCatalogMetadata[]> {
  const database = await openDatabase();
  const result = await new Promise<OfflineCatalogMetadata[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as OfflineCatalogMetadata[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error("Offline metadata list failed."));
  });
  database.close();
  return result;
}

async function idbDelete(key: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline metadata delete failed."));
  });
  database.close();
}

class BrowserOfflineCatalogStore implements OfflineCatalogStore {
  readonly provider = "browser-cache";

  isSupported(): boolean {
    return typeof window !== "undefined" && "caches" in window && "indexedDB" in window;
  }

  async requestPersistence(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }

  async download(
    input: OfflineDownloadInput,
    onProgress?: (progress: OfflineDownloadProgress) => void,
  ): Promise<OfflineCatalogMetadata> {
    if (!this.isSupported()) throw new Error("Offline storage is not supported by this browser.");

    const response = await fetch(input.url, { credentials: "omit" });
    if (!response.ok) throw new Error(`Catalog download failed with HTTP ${response.status}.`);

    const declaredTotal = Number(response.headers.get("content-length") ?? "0");
    const total = Number.isFinite(declaredTotal) && declaredTotal > 0 ? declaredTotal : null;
    const mimeType = input.mimeType || response.headers.get("content-type") || "application/pdf";
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          const percent = total ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
          onProgress?.({ loaded, total, percent });
        }
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const chunk = new Uint8Array(arrayBuffer);
      chunks.push(chunk);
      loaded = chunk.byteLength;
    }

    const blob = new Blob(chunks, { type: mimeType });
    const key = metadataKey(input.catalogId, input.fileId);
    const cacheKey = cacheRequest(key).url;
    const checksum = await sha256(blob);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheRequest(key),
      new Response(blob, {
        headers: {
          "content-type": mimeType,
          "content-length": String(blob.size),
          "x-gcrb-filename": encodeURIComponent(input.filename),
          ...(checksum ? { "x-gcrb-sha256": checksum } : {}),
        },
      }),
    );

    const metadata: OfflineCatalogMetadata = {
      key,
      catalogId: input.catalogId,
      fileId: input.fileId,
      filename: input.filename,
      mimeType,
      size: blob.size,
      checksum,
      cacheKey,
      downloadedAt: new Date().toISOString(),
      provider: "browser-cache",
    };
    await idbPut(metadata);
    onProgress?.({ loaded: blob.size, total: total ?? blob.size, percent: 100 });
    return metadata;
  }

  async get(catalogId: string, fileId: string): Promise<OfflineCatalogMetadata | null> {
    if (!this.isSupported()) return null;
    return idbGet(metadataKey(catalogId, fileId));
  }

  async findByCatalog(catalogId: string): Promise<OfflineCatalogMetadata | null> {
    if (!this.isSupported()) return null;
    const rows = await idbList();
    return rows
      .filter((row) => row.catalogId === catalogId)
      .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))[0] ?? null;
  }

  async list(): Promise<OfflineCatalogMetadata[]> {
    if (!this.isSupported()) return [];
    return (await idbList()).sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  }

  async open(catalogId: string, fileId: string): Promise<OfflineObjectUrl | null> {
    if (!this.isSupported()) return null;
    const key = metadataKey(catalogId, fileId);
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheRequest(key));
    if (!response) return null;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }

  async remove(catalogId: string, fileId: string): Promise<void> {
    if (!this.isSupported()) return;
    const key = metadataKey(catalogId, fileId);
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(cacheRequest(key));
    await idbDelete(key);
  }
}

/**
 * Browser provider used by Lovable today. The interface intentionally mirrors
 * the future Tauri provider, where metadata will live in SQLite and PDFs will
 * live under the desktop application's data directory.
 */
export const offlineCatalogService: OfflineCatalogStore = new BrowserOfflineCatalogStore();
