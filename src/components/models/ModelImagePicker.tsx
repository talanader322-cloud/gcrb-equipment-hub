import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, FileImage, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import {
  modelImageService,
  type ModelImageCandidate,
} from "@/services/models/modelImageService";

/**
 * Manager panel that turns a page of the machine's own catalog into the model
 * photo, with a manual upload as the fallback for models that have no catalog.
 */
export function ModelImagePicker({
  modelId,
  hasPhoto,
  imageSource,
}: {
  modelId: string;
  hasPhoto: boolean;
  imageSource: string | null;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const candidates = useQuery({
    queryKey: ["model-image-candidates", modelId],
    queryFn: () => modelImageService.listCandidates(modelId),
  });
  const pdfs = useQuery({
    queryKey: ["model-catalog-pdfs", modelId],
    queryFn: () => modelImageService.listCatalogPdfs(modelId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["model", modelId] });
    void queryClient.invalidateQueries({ queryKey: ["models"] });
  };

  const adopt = useMutation({
    mutationFn: (candidate: ModelImageCandidate) =>
      modelImageService.applyCandidate(modelId, candidate),
    onSuccess: () => {
      toast.success(t("modelImage.saved"));
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("state.error")),
    onSettled: () => setBusyKey(null),
  });

  const cover = useMutation({
    mutationFn: (file: { storagePath: string; filename: string | null }) =>
      modelImageService.applyCatalogCover(modelId, file),
    onSuccess: (ok) => {
      if (ok) {
        toast.success(t("modelImage.saved"));
        refresh();
      } else {
        toast.error(t("modelImage.coverFailed"));
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("state.error")),
    onSettled: () => setBusyKey(null),
  });

  const upload = useMutation({
    mutationFn: (file: File) => modelImageService.upload(modelId, file),
    onSuccess: () => {
      toast.success(t("modelImage.saved"));
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("state.error")),
    onSettled: () => setBusyKey(null),
  });

  const list = candidates.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileImage className="size-4" />
          {t("modelImage.title")}
          {hasPhoto && imageSource && (
            <Badge variant="secondary">
              {t(`modelImage.source.${imageSource}` as never) || imageSource}
            </Badge>
          )}
        </CardTitle>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setBusyKey("upload");
              upload.mutate(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busyKey !== null}
            onClick={() => fileInput.current?.click()}
          >
            {busyKey === "upload" ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Camera className="me-2 size-4" />
            )}
            {hasPhoto ? t("modelImage.change") : t("modelImage.upload")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("modelImage.hint")}</p>

        {candidates.isLoading && <Skeleton className="h-24 w-full" />}
        {!candidates.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("modelImage.noCandidates")}</p>
        )}

        {list.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {list.map((candidate) => (
              <CandidateTile
                key={candidate.key}
                candidate={candidate}
                busy={busyKey === candidate.key}
                disabled={busyKey !== null}
                onApprove={() => {
                  setBusyKey(candidate.key);
                  adopt.mutate(candidate);
                }}
              />
            ))}
          </div>
        )}

        {(pdfs.data ?? []).length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">{t("modelImage.coverFromPdf")}</p>
            {(pdfs.data ?? []).map((file) => (
              <div
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <p className="min-w-0 truncate text-sm">
                  {file.filename ?? file.catalogTitle || file.storagePath}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyKey !== null}
                  onClick={() => {
                    setBusyKey(file.id);
                    cover.mutate({ storagePath: file.storagePath, filename: file.filename });
                  }}
                >
                  {busyKey === file.id ? (
                    <Loader2 className="me-2 size-4 animate-spin" />
                  ) : (
                    <Check className="me-2 size-4" />
                  )}
                  {t("modelImage.useCover")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CandidateTile({
  candidate,
  busy,
  disabled,
  onApprove,
}: {
  candidate: ModelImageCandidate;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
}) {
  const { t } = useI18n();
  const preview = useQuery({
    queryKey: ["model-candidate-preview", candidate.key],
    queryFn: () => modelImageService.candidatePreviewUrl(candidate),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onApprove}
      title={candidate.title ?? `page ${candidate.pageNumber}`}
      className="group overflow-hidden rounded-md border border-border text-start transition-colors hover:border-primary disabled:opacity-60"
    >
      <div className="relative aspect-[4/3] bg-muted/40">
        {preview.isLoading && <Skeleton className="size-full" />}
        {preview.data && (
          <img
            src={preview.data}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-contain"
          />
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
      </div>
      <div className="p-1.5">
        <p className="truncate text-[11px] text-muted-foreground">
          {t("modelImage.page")} {candidate.pageNumber}
        </p>
      </div>
    </button>
  );
}
