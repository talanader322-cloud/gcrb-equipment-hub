import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, Loader2, Sparkles, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { matchModelByFilename, modelImageService } from "@/services/models/modelImageService";

type Item = {
  id: string;
  file: File;
  modelId: string | null;
  status: "pending" | "working" | "done" | "failed";
  error?: string;
};

/**
 * Manager tool: drop a batch of machine photos, matched to models by filename
 * (canonical model name or registered alias), plus a one-click pass that adopts
 * the first catalog page for every machine that still has no photo.
 */
export function ModelPhotoBulkUpload() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);

  const models = useQuery({
    queryKey: ["models-photo-state"],
    queryFn: () => modelImageService.listModelsWithoutPhoto(),
  });
  const modelList = models.data ?? [];
  const missing = modelList.filter((model) => !model.hasPhoto);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["models-photo-state"] });
    void queryClient.invalidateQueries({ queryKey: ["models"] });
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Item[] = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        modelId: matchModelByFilename(file.name, modelList),
        status: "pending" as const,
      }));
    setItems((current) => [...current, ...next]);
  };

  const uploadAll = async () => {
    setBusy(true);
    for (const item of items) {
      if (item.status === "done" || !item.modelId) continue;
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, status: "working" } : row)),
      );
      try {
        await modelImageService.upload(item.modelId, item.file);
        setItems((current) =>
          current.map((row) => (row.id === item.id ? { ...row, status: "done" } : row)),
        );
      } catch (error) {
        setItems((current) =>
          current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  status: "failed",
                  error: error instanceof Error ? error.message : "failed",
                }
              : row,
          ),
        );
      }
    }
    setBusy(false);
    refresh();
  };

  /** Adopt the first available catalog page for every model still missing a photo. */
  const fillFromCatalogs = async () => {
    setAutoBusy(true);
    let done = 0;
    for (const model of missing) {
      try {
        const candidates = await modelImageService.listCandidates(model.id);
        const first = candidates[0];
        if (!first) continue;
        await modelImageService.applyCandidate(model.id, first);
        done += 1;
      } catch {
        // A single unreachable diagram must not stop the pass.
      }
    }
    setAutoBusy(false);
    refresh();
    toast[done > 0 ? "success" : "info"](
      done > 0
        ? t("modelImage.bulkAutoDone").replace("{count}", String(done))
        : t("modelImage.bulkAutoNone"),
    );
  };

  const readyCount = items.filter((item) => item.modelId && item.status !== "done").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImagePlus className="size-4" />
          {t("modelImage.bulkTitle")}
          <Badge variant="outline">
            {t("modelImage.missingCount").replace("{count}", String(missing.length))}
          </Badge>
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={autoBusy} onClick={() => void fillFromCatalogs()}>
            {autoBusy ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="me-2 size-4" />
            )}
            {t("modelImage.bulkAutoRun")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            {t("modelImage.bulkChoose")}
          </Button>
          <Button size="sm" disabled={busy || readyCount === 0} onClick={() => void uploadAll()}>
            {busy && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("modelImage.bulkUploadAll")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("modelImage.bulkAutoHint")}</p>
        <p className="text-xs text-muted-foreground">{t("modelImage.bulkHint")}</p>

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
          className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
        >
          {t("modelImage.bulkChoose")}
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <p className="min-w-0 flex-1 truncate font-mono text-xs">{item.file.name}</p>
                <Select
                  value={item.modelId ?? "none"}
                  onValueChange={(value) =>
                    setItems((current) =>
                      current.map((row) =>
                        row.id === item.id
                          ? { ...row, modelId: value === "none" ? null : value }
                          : row,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder={t("modelImage.selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("modelImage.statusUnmatched")}</SelectItem>
                    {modelList.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.modelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <StatusBadge item={item} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ item }: { item: Item }) {
  const { t } = useI18n();
  if (item.status === "working") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        {t("modelImage.working")}
      </Badge>
    );
  }
  if (item.status === "done") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="size-3" />
        {t("modelImage.statusDone")}
      </Badge>
    );
  }
  if (item.status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1" title={item.error}>
        <XCircle className="size-3" />
        {t("modelImage.statusFailed")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      {item.modelId ? t("modelImage.statusPending") : t("modelImage.statusUnmatched")}
    </Badge>
  );
}
