import { supabase } from "@/integrations/supabase/client";

/**
 * Object-storage abstraction.
 *
 * The MVP provider is Lovable Cloud storage. Cloudflare R2, Amazon S3 and a
 * desktop local-disk provider can be added by implementing this interface —
 * UI components must never talk to a storage SDK directly.
 */
export type StorageBucket =
  "catalogs" | "diagrams" | "thumbnails" | "manufacturer-logos" | "machine-images";

export type StoredObject = {
  provider: string;
  bucket: StorageBucket;
  path: string;
  size: number;
  mimeType: string;
  originalFilename: string;
};

export interface FileStorageService {
  readonly provider: string;
  upload(bucket: StorageBucket, path: string, file: File): Promise<StoredObject>;
  getSignedUrl(bucket: StorageBucket, path: string, expiresInSeconds?: number): Promise<string>;
  remove(bucket: StorageBucket, path: string): Promise<void>;
}

class CloudFileStorageService implements FileStorageService {
  readonly provider = "supabase";

  async upload(bucket: StorageBucket, path: string, file: File): Promise<StoredObject> {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;
    return {
      provider: this.provider,
      bucket,
      path,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      originalFilename: file.name,
    };
  }

  async getSignedUrl(
    bucket: StorageBucket,
    path: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  }

  async remove(bucket: StorageBucket, path: string): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
  }
}

export const fileStorageService: FileStorageService = new CloudFileStorageService();

/** Deterministic, collision-safe storage path for a catalog technical file. */
export function buildCatalogPath(catalogId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${catalogId}/${Date.now()}-${safe}`;
}
