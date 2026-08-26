import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ExternalLink, FileText, Star, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/translations";
import { adminRepository } from "@/services/repositories/adminRepository";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import { personalRepository } from "@/services/repositories/personalRepository";
import { buildCatalogPath, fileStorageService } from "@/services/storage/fileStorageService";

export const Route = createFileRoute("/_authenticated/catalogs/$catalogId")({
  head: () => ({
    meta: [
      { title: "عرض الكتالوج | GCRB Equipment Catalog" },
      { name: "description", content: "Catalog contents, assemblies and attached document." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  const { catalogId } = Route.useParams();
  const { t } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ["catalog", catalogId],
    queryFn: () => catalogRepository.getCatalog(catalogId),
  });

  const favorite = useQuery({
    queryKey: ["favorite", "catalog", catalogId],
    enabled: Boolean(user),
    queryFn: () => personalRepository.isFavorite("catalog", catalogId),
  });

  useEffect(() => {
    if (user && catalog.data) void personalRepository.trackRecent(user.id, "catalog", catalogId);
  }, [user, catalog.data, catalogId]);

  const primaryFile = catalog.data?.files[0] ?? null;

  useEffect(() => {
    let active = true;
    if (!primaryFile) {
      setFileUrl(null);
      return;
    }
    fileStorageService
      .getSignedUrl("catalogs", primaryFile.storage_path, 3600)
      .then((url) => {
        if (active) setFileUrl(url);
      })
      .catch(() => setFileUrl(null));
    return () => {
      active = false;
    };
  }, [primaryFile]);

  const toggleFavorite = useMutation({
    mutationFn: () => personalRepository.toggleFavorite(user!.id, "catalog", catalogId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorite", "catalog", catalogId] }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const stored = await fileStorageService.upload(
        "catalogs",
        buildCatalogPath(catalogId, file.name),
        file,
      );
      await adminRepository.attachCatalogFile({
        catalog_id: catalogId,
        storage_provider: stored.provider,
        storage_bucket: stored.bucket,
        storage_path: stored.path,
        original_filename: stored.originalFilename,
        mime_type: stored.mimeType,
        file_size: stored.size,
      });
    },
    onSuccess: () => {
      toast.success(t("import.uploaded"));
      void queryClient.invalidateQueries({ queryKey: ["catalog", catalogId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const registerDownload = useMutation({
    mutationFn: () => personalRepository.recordDownload(user!.id, catalogId),
  });

  if (catalog.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!catalog.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { catalog: row, sections, assemblies } = catalog.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{row.title}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {row.catalog_number ?? "—"} · {row.manufacturer?.name} ·{" "}
            {t(`catalogType.${row.catalog_type}` as TranslationKey)} · {row.language.toUpperCase()}
            {row.revision ? ` · ${t("entity.revision")} ${row.revision}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => toggleFavorite.mutate()}>
            <Star className={favorite.data ? "me-2 size-4 fill-current" : "me-2 size-4"} />
            {favorite.data ? t("action.unfavorite") : t("action.favorite")}
          </Button>
          {fileUrl && (
            <Button asChild size="sm" onClick={() => registerDownload.mutate()}>
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <Download className="me-2 size-4" />
                {t("action.download")}
              </a>
            </Button>
          )}
          {access.data?.canManage && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload.mutate(file);
                }}
              />
              <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
                <Upload className="me-2 size-4" />
                {t("action.upload")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("viewer.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {fileUrl ? (
              <iframe
                src={fileUrl}
                title={row.title}
                className="h-[70vh] w-full rounded-md border border-border"
              />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center">
                <FileText className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">{t("viewer.noFile")}</p>
                <p className="text-xs text-muted-foreground">{t("viewer.uploadHint")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("viewer.contents")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {sections.length === 0 && <p className="text-sm text-muted-foreground">{t("state.none")}</p>}
              {sections.map((section) => (
                <p key={section.id} className="font-mono text-xs">
                  {section.section_number ? `${section.section_number} · ` : ""}
                  {section.title}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("entity.assemblies")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {assemblies.length === 0 && <p className="text-sm text-muted-foreground">{t("state.none")}</p>}
              {assemblies.map((assembly) => (
                <Link
                  key={assembly.id}
                  to="/assemblies/$assemblyId"
                  params={{ assemblyId: assembly.id }}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-xs hover:bg-accent/60"
                >
                  <span className="truncate">
                    {assembly.assembly_number ? `${assembly.assembly_number} · ` : ""}
                    {assembly.title}
                  </span>
                  <ExternalLink className="size-3 shrink-0" />
                </Link>
              ))}
            </CardContent>
          </Card>

          {row.machine_model && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("entity.model")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  to="/models/$modelId"
                  params={{ modelId: row.machine_model.id }}
                  className="font-mono text-sm text-primary hover:underline"
                >
                  {row.machine_model.model_name}
                </Link>
                {row.serial_from && (
                  <Badge variant="outline" className="ms-2 font-mono">
                    {row.serial_from}
                    {row.serial_to ? `–${row.serial_to}` : "→"}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
