import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Camera, FileStack, HardDriveDownload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AssetManualUploadPanel } from "@/components/assets/AssetManualUploadPanel";
import { AssetPhoto } from "@/components/assets/AssetPhoto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { assetRepository } from "@/services/repositories/assetRepository";
import { offlineCatalogService } from "@/services/offline/offlineCatalogService";

export const Route = createFileRoute("/_authenticated/assets/$assetId")({
  head: () => ({
    meta: [
      { title: "بطاقة المعدة | GCRB Equipment Catalog" },
      {
        name: "description",
        content:
          "Institution machine record: serial number, asset number, branch, project and original manuals.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssetDetailPage,
});

function AssetDetailPage() {
  const { assetId } = Route.useParams();
  const { t, locale } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const canManage = Boolean(access.data?.canManageCatalog);
  const queryClient = useQueryClient();
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const asset = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => assetRepository.getAsset(assetId),
  });

  const offline = useQuery({
    queryKey: ["offline-catalogs"],
    queryFn: () => offlineCatalogService.list(),
  });

  // NOTE: recent-item tracking is intentionally NOT recorded here. A machine
  // asset id is not a machine_model id, and `machine_asset` is not yet a
  // supported recent-items entity type.

  const photoMutation = useMutation({
    mutationFn: (file: File) => assetRepository.uploadAssetPhoto(assetId, file),
    onSuccess: () => {
      toast.success(t("assets.photoSaved"));
      void queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("state.error")),
    onSettled: () => setUploadingPhoto(false),
  });

  if (asset.isLoading) return <Skeleton className="h-64 w-full" />;
  if (asset.isError) return <p className="text-sm text-destructive">{t("state.error")}</p>;
  if (!asset.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { asset: row, manuals, modelCatalogs } = asset.data;
  const model = row.machine_model;
  const offlineCatalogIds = new Set((offline.data ?? []).map((item) => item.catalogId));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          <AssetPhoto
            path={row.image_path}
            fallbackPath={model?.image_url ?? null}
            alt={model?.model_name ?? ""}
            className="h-56 w-full"
          />
          <CardContent className="space-y-2 p-4">
            {canManage && (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                      toast.error(t("assets.imageOnly"));
                      return;
                    }
                    setUploadingPhoto(true);
                    photoMutation.mutate(file);
                  }}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={uploadingPhoto}
                  onClick={() => photoInput.current?.click()}
                >
                  <Camera className="me-2 size-4" />
                  {row.image_path ? t("assets.changePhoto") : t("assets.uploadPhoto")}
                </Button>
              </>
            )}
            <p className="text-xs text-muted-foreground">{t("assets.photoHint")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="font-mono text-2xl" dir="ltr">
                {model?.model_name ?? t("state.none")}
              </CardTitle>
              {model?.manufacturer && <Badge variant="outline">{model.manufacturer.name}</Badge>}
              {model?.equipment_type && (
                <Badge variant="secondary">
                  {locale === "ar"
                    ? (model.equipment_type.name_ar ?? model.equipment_type.name)
                    : model.equipment_type.name}
                </Badge>
              )}
            </div>
            {model && (
              <Link
                to="/models/$modelId"
                params={{ modelId: model.id }}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {t("action.open")} — {t("nav.equipment")}
              </Link>
            )}
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label={t("assets.serialNumber")} value={row.serial_number} mono />
              <Detail label={t("assets.assetNumber")} value={row.asset_number} mono />
              <Detail
                label={t("assets.year")}
                value={row.manufacture_year ? String(row.manufacture_year) : null}
                mono
              />
              <Detail label={t("assets.branch")} value={row.branch} />
              <Detail label={t("assets.project")} value={row.project} />
              <Detail label={t("assets.purchaseReference")} value={row.purchase_reference} />
              <Detail label={t("assets.notes")} value={row.notes} wide />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" />
            {t("assets.originalManuals")}
            <Badge variant="outline">{manuals.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {manuals.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("assets.noManuals")}</p>
          )}
          {manuals.map((manual) => (
            <div
              key={manual.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {manual.title ?? manual.catalog?.title ?? manual.original_filename}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{manual.catalog?.catalog_type ?? manual.manual_type}</span>
                  {manual.catalog?.revision && <span dir="ltr">rev {manual.catalog.revision}</span>}
                  {manual.catalog?.language && (
                    <span className="uppercase">{manual.catalog.language}</span>
                  )}
                  {(manual.serial_from || manual.serial_to) && (
                    <span dir="ltr">
                      S/N {manual.serial_from ?? "…"} — {manual.serial_to ?? "…"}
                    </span>
                  )}
                  {manual.catalog_id && offlineCatalogIds.has(manual.catalog_id) && (
                    <Badge variant="secondary" className="gap-1">
                      <HardDriveDownload className="size-3" />
                      {t("assets.offlineAvailable")}
                    </Badge>
                  )}
                </p>
              </div>
              {manual.catalog_id && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/catalogs/$catalogId" params={{ catalogId: manual.catalog_id }}>
                    {t("assets.openInViewer")}
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {canManage && <AssetManualUploadPanel assetId={assetId} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileStack className="size-4" />
            {t("assets.modelCatalogs")}
            <Badge variant="outline">{modelCatalogs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {modelCatalogs.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
          )}
          {modelCatalogs.map((catalog) => (
            <div
              key={catalog.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{catalog.title}</p>
                <p className="text-xs text-muted-foreground">
                  {catalog.catalog_type}
                  {catalog.catalog_number ? ` · ${catalog.catalog_number}` : ""}
                  {offlineCatalogIds.has(catalog.id) ? ` · ${t("assets.offlineAvailable")}` : ""}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/catalogs/$catalogId" params={{ catalogId: catalog.id }}>
                  {t("action.openCatalog")}
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"} dir={mono ? "ltr" : undefined}>
        {value || "—"}
      </dd>
    </div>
  );
}
