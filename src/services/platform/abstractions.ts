/**
 * Platform abstraction interfaces.
 *
 * These exist so the same React UI can later be packaged as a Windows desktop
 * application (Tauri + SQLite + local catalog files + central synchronization)
 * without rewriting feature code. Tauri is intentionally NOT implemented in
 * this phase — only the web implementations below are wired up.
 */

export interface DownloadService {
  /** Returns a URL/handle the user can open or save the catalog file from. */
  requestCatalogDownload(catalogId: string): Promise<{ url: string; filename: string } | null>;
}

export interface LocalCacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface SettingsService {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
}

export interface SyncService {
  /** Desktop edition: pull catalog metadata + files for offline use. */
  syncCatalog(catalogId: string): Promise<void>;
  /** Desktop edition: push locally queued changes to the central database. */
  pushPendingChanges(): Promise<void>;
  isSupported(): boolean;
}

export interface SearchRepository {
  searchLocal(query: string): Promise<unknown>;
}

/* ------------------------- web implementations ------------------------- */

export const webLocalCacheService: LocalCacheService = {
  async get<T>(key: string) {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  async set<T>(key: string, value: T) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

export const webSettingsService: SettingsService = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  },
};

/** Desktop-only synchronization is unavailable in the web edition. */
export const unavailableSyncService: SyncService = {
  async syncCatalog() {
    throw new Error("Offline synchronization is available in the desktop edition only.");
  },
  async pushPendingChanges() {
    throw new Error("Offline synchronization is available in the desktop edition only.");
  },
  isSupported: () => false,
};
