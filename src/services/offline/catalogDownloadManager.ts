import type { CatalogFile } from "@/lib/types";

import { offlineCatalogService, type OfflineDownloadProgress } from "./offlineCatalogService";
import { personalRepository } from "../repositories/personalRepository";

export type DownloadManagerInput = {
  userId: string;
  catalogId: string;
  file: CatalogFile;
  signedUrl: string;
};

export async function downloadCatalogOffline(
  input: DownloadManagerInput,
  onProgress?: (progress: OfflineDownloadProgress) => void,
) {
  const job = await personalRepository.beginDownload(input.userId, input.catalogId);
  let lastPersistedProgress = -1;
  try {
    const metadata = await offlineCatalogService.download(
      {
        catalogId: input.catalogId,
        fileId: input.file.id,
        url: input.signedUrl,
        filename: input.file.original_filename ?? `${input.catalogId}.pdf`,
        mimeType: input.file.mime_type,
      },
      (progress) => {
        onProgress?.(progress);
        const coarse = Math.max(0, Math.min(100, Math.floor(progress.percent / 5) * 5));
        if (coarse !== lastPersistedProgress) {
          lastPersistedProgress = coarse;
          void personalRepository.updateDownload(job.id, {
            status: coarse >= 100 ? "completed" : "downloading",
            progress: coarse,
          });
        }
      },
    );
    await personalRepository.updateDownload(job.id, {
      status: "completed",
      progress: 100,
      local_reference: `${metadata.provider}:${metadata.key}`,
    });
    return metadata;
  } catch (error) {
    await personalRepository.updateDownload(job.id, { status: "failed" });
    throw error;
  }
}
