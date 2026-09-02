import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  HardDriveDownload,
  Loader2,
  Search,
  Star,
  Trash2,
  Upload,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { TranslationKey } from "@/lib/translations";
import { SchematicViewer } from "@/components/komatsu/SchematicViewer";
import { downloadCatalogOffline } from "@/services/offline/catalogDownloadManager";
import {
  offlineCatalogService,
  type OfflineCatalogMetadata,
} from "@/services/offline/offlineCatalogService";
import { adminRepository } from "@/services/repositories/adminRepository";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import { intelligenceRepository } from "@/services/repositories/intelligenceRepository";
import { personalRepository } from "@/services/repositories/personalRepository";
import { pdfAnalysisService } from "@/services/pdf/pdfAnalysisService";
import { buildCatalogPath, fileStorageService } from "@/services/storage/fileStorageService";

export const Route = createFileRoute("/_authenticated/catalogs/$catalogId")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const raw = Number(search["page"]);
    return Number.isFinite(raw) && raw > 0 ? { page: Math.trunc(raw) } : {};
  },
  head: () => ({
    meta: [
      { title: "عرض الكتالوج | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Interactive catalog viewer, sections, assemblies and offline file.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  const { catalogId } = Route.useParams();
  const { page: requestedPage } = Route.useSearch();
  const { t, locale } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null);
  const [offlineMeta, setOfflineMeta] = useState<OfflineCatalogMetadata | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [sectionQuery, setSectionQuery] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [pageSearchTerm, setPageSearchTerm] = useState("");
  const [viewerPage, setViewerPage] = useState<number | null>(requestedPage ?? null);

  const pageHits = useQuery({
    queryKey: ["catalog-pages", catalogId, pageSearchTerm],
    enabled: pageSearchTerm.trim().length > 0,
    queryFn: () => intelligenceRepository.searchCatalogPages(catalogId, pageSearchTerm.trim()),
  });

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
      setCloudUrl(null);
      setOfflineMeta(null);
      return;
    }
    fileStorageService
      .getSignedUrl("catalogs", primaryFile.storage_path, 3600)
      .then((url) => {
        if (active) setCloudUrl(url);
      })
      .catch(() => {
        if (active) setCloudUrl(null);
      });
    offlineCatalogService
      .get(catalogId, primaryFile.id)
      .then((metadata) => {
        if (active) setOfflineMeta(metadata);
      })
      .catch(() => {
        if (active) setOfflineMeta(null);
      });
    return () => {
      active = false;
    };
  }, [catalogId, primaryFile]);

  useEffect(() => {
    let active = true;
    let revoke: (() => void) | null = null;
    if (!primaryFile || !offlineMeta) {
      setOfflineUrl(null);
      return;
    }
    offlineCatalogService.open(catalogId, primaryFile.id).then((opened) => {
      if (!active || !opened) return;
      revoke = opened.revoke;
      setOfflineUrl(opened.url);
    });
    return () => {
      active = false;
      revoke?.();
    };
  }, [catalogId, offlineMeta, primaryFile]);

  const toggleFavorite = useMutation({
    mutationFn: () => personalRepository.toggleFavorite(user!.id, "catalog", catalogId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["favorite", "catalog", catalogId] }),
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

  const offlineDownload = useMutation({
    mutationFn: async () => {
      if (!user || !primaryFile || !cloudUrl) throw new Error("Catalog file is not available.");
      setDownloadProgress(0);
      await offlineCatalogService.requestPersistence();
      return downloadCatalogOffline(
        { userId: user.id, catalogId, file: primaryFile, signedUrl: cloudUrl },
        ({ percent }) => setDownloadProgress(percent),
      );
    },
    onSuccess: (metadata) => {
      setOfflineMeta(metadata);
      setDownloadProgress(100);
      void queryClient.invalidateQueries({ queryKey: ["downloads"] });
      toast.success(
        locale === "ar" ? "تم حفظ الكتالوج للاستخدام بدون إنترنت" : "Catalog saved for offline use",
      );
      window.setTimeout(() => setDownloadProgress(null), 1200);
    },
    onError: (error: Error) => {
      setDownloadProgress(null);
      toast.error(error.message);
    },
  });

  const removeOffline = useMutation({
    mutationFn: async () => {
      if (!user || !primaryFile) return;
      await offlineCatalogService.remove(catalogId, primaryFile.id);
      await personalRepository.clearOfflineReference(user.id, catalogId);
    },
    onSuccess: () => {
      setOfflineMeta(null);
      setOfflineUrl(null);
      void queryClient.invalidateQueries({ queryKey: ["downloads"] });
      toast.success(locale === "ar" ? "تم حذف النسخة المحلية" : "Offline copy removed");
    },
  });

  const analyze = useMutation({
    mutationFn: async () => {
      if (!primaryFile) throw new Error(t("viewer.noFile"));
      await intelligenceRepository.setCatalogAnalysisStatus(catalogId, "analyzing");
      const signed = await fileStorageService.getSignedUrl(
        "catalogs",
        primaryFile.storage_path,
        3600,
      );
      const response = await fetch(signed, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const analysis = await pdfAnalysisService.analyze(new Uint8Array(buffer));
      if (!analysis.ok) {
        await intelligenceRepository.setCatalogAnalysisStatus(catalogId, "failed");
        throw new Error(analysis.note ?? "PDF analysis failed");
      }
      const textPages = analysis.pages.filter((page) => page.content.length > 0);
      if (textPages.length === 0) {
        await intelligenceRepository.setCatalogAnalysisStatus(catalogId, "failed");
        return { ok: true as const, textPages: 0, total: analysis.pageCount };
      }
      const { error } = await supabase.rpc("upsert_catalog_pages", {
        p_catalog_id: catalogId,
        p_pages: textPages,
      });
      if (error) {
        await intelligenceRepository.setCatalogAnalysisStatus(catalogId, "failed");
        throw new Error(error.message);
      }
      return { ok: true as const, textPages: textPages.length, total: analysis.pageCount };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["catalog", catalogId] });
      if (result.ok && result.textPages === 0) {
        toast.info(t("catalog.analyze.noText"));
      } else if (result.ok) {
        toast.success(t("catalog.analyze.result", { count: result.textPages }));
      }
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["catalog", catalogId] });
      toast.error(error.message);
    },
  });

  if (catalog.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!catalog.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { catalog: row, sections, assemblies, schemes } = catalog.data;
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? null;
  const visibleSections = sections.filter((section) => {
    const query = sectionQuery.trim().toLowerCase();
    if (!query) return true;
    return `${section.section_number ?? ""} ${section.title}`.toLowerCase().includes(query);
  });
  const visibleAssemblies = selectedSection
    ? assemblies.filter((assembly) => assembly.section_id === selectedSection.id)
    : assemblies;
  const viewerBaseUrl = offlineUrl ?? cloudUrl;
  const pageAnchor = viewerPage ?? selectedSection?.page_from ?? null;
  const viewerUrl = !viewerBaseUrl
    ? null
    : pageAnchor
      ? `${viewerBaseUrl}#page=${pageAnchor}`
      : viewerBaseUrl;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{row.title}</h1>
            {offlineMeta && (
              <Badge className="gap-1" variant="secondary">
                <WifiOff className="size-3" />
                {locale === "ar" ? "متاح بدون إنترنت" : "Available offline"}
              </Badge>
            )}
          </div>
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
          {cloudUrl && primaryFile && user && !offlineMeta && (
            <Button
              size="sm"
              onClick={() => offlineDownload.mutate()}
              disabled={offlineDownload.isPending}
            >
              <HardDriveDownload className="me-2 size-4" />
              {downloadProgress === null
                ? locale === "ar"
                  ? "تنزيل للاستخدام بدون إنترنت"
                  : "Download for offline"
                : `${downloadProgress}%`}
            </Button>
          )}
          {offlineMeta && primaryFile && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => removeOffline.mutate()}
              disabled={removeOffline.isPending}
            >
              <Trash2 className="me-2 size-4" />
              {locale === "ar" ? "حذف النسخة المحلية" : "Remove offline copy"}
            </Button>
          )}
          {cloudUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={cloudUrl} target="_blank" rel="noreferrer" download>
                <Download className="me-2 size-4" />
                {locale === "ar" ? "تنزيل ملف" : "Download file"}
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

      {downloadProgress !== null && downloadProgress < 100 && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {locale === "ar" ? "جاري حفظ الكتالوج محليًا" : "Saving catalog locally"} ·{" "}
            {downloadProgress}%
          </p>
        </div>
      )}

      {schemes.length > 0 ? (
        <SchematicViewer catalog={row} schemes={schemes} />
      ) : (
        <div className="grid min-h-[72vh] gap-3 xl:grid-cols-[280px_minmax(0,1fr)_310px]">
          <Card className="overflow-hidden">
            <CardHeader className="space-y-3 p-3">
              <CardTitle className="text-sm">{t("viewer.contents")}</CardTitle>
              <div className="relative">
                <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={sectionQuery}
                  onChange={(event) => setSectionQuery(event.target.value)}
                  placeholder={locale === "ar" ? "بحث في الأقسام..." : "Search sections..."}
                  className="ps-8"
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[62vh] space-y-1 overflow-y-auto p-2 pt-0">
              <Button
                variant={selectedSectionId === null ? "secondary" : "ghost"}
                className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-start text-xs"
                onClick={() => {
                  setSelectedSectionId(null);
                  setViewerPage(null);
                }}
              >
                {locale === "ar" ? "كل الكتالوج" : "Whole catalog"}
              </Button>
              {visibleSections.map((section) => (
                <Button
                  key={section.id}
                  variant={selectedSectionId === section.id ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-start"
                  onClick={() => {
                    setSelectedSectionId(section.id);
                    setViewerPage(null);
                  }}
                >
                  <span className="min-w-0 text-xs">
                    {section.section_number && (
                      <span className="me-2 font-mono text-muted-foreground">
                        {section.section_number}
                      </span>
                    )}
                    {section.title}
                    {section.page_from && (
                      <span className="ms-2 font-mono text-[10px] text-muted-foreground">
                        p.{section.page_from}
                      </span>
                    )}
                  </span>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between space-y-0 p-3">
              <div>
                <CardTitle className="text-sm">
                  {selectedSection?.title ?? t("viewer.title")}
                </CardTitle>
                {selectedSection?.page_from && (
                  <p className="text-xs text-muted-foreground">
                    {t("viewer.page")} {selectedSection.page_from}
                    {selectedSection.page_to &&
                    selectedSection.page_to !== selectedSection.page_from
                      ? `–${selectedSection.page_to}`
                      : ""}
                  </p>
                )}
              </div>
              <Badge variant={offlineUrl ? "secondary" : "outline"} className="gap-1">
                {offlineUrl ? <CheckCircle2 className="size-3" /> : <FileText className="size-3" />}
                {offlineUrl ? (locale === "ar" ? "نسخة محلية" : "Local copy") : "Cloud PDF"}
              </Badge>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {viewerUrl ? (
                <iframe
                  src={viewerUrl}
                  title={row.title}
                  className="h-[64vh] w-full rounded-md border border-border bg-background"
                />
              ) : (
                <div className="flex h-[64vh] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center">
                  <FileText className="size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">{t("viewer.noFile")}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">{t("viewer.uploadHint")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">{t("entity.assemblies")}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[38vh] space-y-1 overflow-y-auto p-2 pt-0">
                {visibleAssemblies.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">{t("state.none")}</p>
                )}
                {visibleAssemblies.map((assembly) => (
                  <Link
                    key={assembly.id}
                    to="/assemblies/$assemblyId"
                    params={{ assemblyId: assembly.id }}
                    className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-xs hover:bg-accent/60"
                  >
                    <span className="min-w-0">
                      {assembly.assembly_number && (
                        <span className="me-1 font-mono text-muted-foreground">
                          {assembly.assembly_number}
                        </span>
                      )}
                      {assembly.title}
                    </span>
                    <ExternalLink className="mt-0.5 size-3 shrink-0" />
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">{t("catalog.search.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                <div className="flex gap-2">
                  <Input
                    value={pageSearchTerm}
                    onChange={(event) => setPageSearchTerm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        setPageSearchTerm(pageSearchTerm.trim());
                      }
                    }}
                    placeholder={t("catalog.search.placeholder")}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPageSearchTerm(pageSearchTerm.trim())}
                    disabled={pageHits.isFetching}
                  >
                    {pageHits.isFetching ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                  </Button>
                </div>
                {pageHits.isPending && (
                  <p className="text-xs text-muted-foreground">{t("search.running")}</p>
                )}
                {pageHits.data?.length === 0 && row.analysis_status !== "indexed" && (
                  <p className="text-xs text-muted-foreground">{t("catalog.search.notIndexed")}</p>
                )}
                {pageHits.data?.length === 0 && row.analysis_status === "indexed" && (
                  <p className="text-xs text-muted-foreground">{t("catalog.search.none")}</p>
                )}
                {(pageHits.data ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("catalog.search.hits", { count: pageHits.data!.length })}
                  </p>
                )}
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {(pageHits.data ?? []).slice(0, 12).map((hit) => (
                    <button
                      key={hit.page_number}
                      type="button"
                      onClick={() => setViewerPage(hit.page_number)}
                      className="block w-full rounded-md border border-border p-2 text-start hover:bg-accent/60"
                    >
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold">
                          {t("catalog.page")} {hit.page_number}
                        </span>
                        <FileSearch className="size-3 text-muted-foreground" />
                      </span>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {hit.content.slice(0, 160)}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">{t("catalog.analyze.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t("viewer.info")}</span>
                  <AnalysisStatusBadge
                    status={row.analysis_status}
                    indexedCount={row.indexed_page_count}
                    t={t}
                  />
                </div>
                {row.analysis_status === "indexed" && row.indexed_page_count !== null && (
                  <p className="text-muted-foreground">
                    {t("catalog.indexedPages", { count: row.indexed_page_count })}
                  </p>
                )}
                {access.data?.canManageCatalog && primaryFile ? (
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={() => analyze.mutate()}
                    disabled={analyze.isPending || row.analysis_status === "analyzing"}
                  >
                    {analyze.isPending || row.analysis_status === "analyzing" ? (
                      <>
                        <Loader2 className="me-2 size-4 animate-spin" />
                        {t("catalog.analyze.running")}
                      </>
                    ) : (
                      <>
                        <Search className="me-2 size-4" />
                        {t("catalog.analyze.run")}
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="text-muted-foreground">{t("catalog.analyze.notAllowed")}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">{t("viewer.info")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("entity.manufacturer")}</span>
                  <span>{row.manufacturer?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("entity.catalogNumber")}</span>
                  <span className="font-mono">{row.catalog_number ?? "—"}</span>
                </div>
                {row.machine_model && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("entity.model")}</span>
                    <Link
                      to="/models/$modelId"
                      params={{ modelId: row.machine_model.id }}
                      className="font-mono text-primary hover:underline"
                    >
                      {row.machine_model.model_name}
                    </Link>
                  </div>
                )}
                {(row.serial_from || row.serial_to) && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("filter.serialRange")}</span>
                    <span className="font-mono">
                      {row.serial_from ?? "…"}–{row.serial_to ?? "UP"}
                    </span>
                  </div>
                )}
                {primaryFile && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t("entity.file")}</span>
                      <span
                        className="max-w-[170px] truncate"
                        title={primaryFile.original_filename ?? ""}
                      >
                        {primaryFile.original_filename ?? "PDF"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {locale === "ar" ? "الحجم" : "Size"}
                      </span>
                      <span>
                        {primaryFile.file_size
                          ? `${(Number(primaryFile.file_size) / 1024 / 1024).toFixed(1)} MB`
                          : "—"}
                      </span>
                    </div>
                  </>
                )}
                {offlineMeta?.checksum && (
                  <div className="space-y-1 border-t pt-2">
                    <span className="text-muted-foreground">SHA-256</span>
                    <p className="break-all font-mono text-[10px]">
                      {offlineMeta.checksum.replace("sha256:", "")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisStatusBadge({
  status,
  indexedCount,
  t,
}: {
  status: string | null;
  indexedCount: number | null;
  t: ReturnType<typeof useI18n>["t"];
}) {
  let label: string;
  if (status === "indexed") label = t("catalog.analysis.indexed");
  else if (status === "analyzing") label = t("catalog.analysis.analyzing");
  else if (status === "failed") label = t("catalog.analysis.failed");
  else label = t("catalog.analysis.none");
  const variant: "default" | "secondary" | "outline" | "destructive" =
    status === "indexed"
      ? "secondary"
      : status === "failed"
        ? "destructive"
        : status === "analyzing"
          ? "outline"
          : "outline";
  return (
    <Badge variant={variant} className="shrink-0 text-[11px]">
      {label}
      {status === "indexed" && indexedCount !== null ? ` · ${indexedCount}` : ""}
    </Badge>
  );
}
