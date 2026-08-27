import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, FileCheck2, HardDrive, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import {
  offlineCatalogService,
  type OfflineCatalogMetadata,
} from "@/services/offline/offlineCatalogService";
import { personalRepository } from "@/services/repositories/personalRepository";

export const Route = createFileRoute("/_authenticated/downloads")({
  head: () => ({
    meta: [
      { title: "التنزيلات | GCRB Equipment Catalog" },
      { name: "description", content: "Offline catalog download manager for field use." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DownloadsPage,
});

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function DownloadsPage() {
  const { t, formatDate, locale } = useI18n();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [offlineRows, setOfflineRows] = useState<OfflineCatalogMetadata[]>([]);

  const downloads = useQuery({
    queryKey: ["downloads"],
    queryFn: () => personalRepository.listDownloads(),
  });

  const refreshOffline = async () => {
    const rows = await offlineCatalogService.list();
    setOfflineRows(rows);
  };

  useEffect(() => {
    void refreshOffline();
  }, []);

  const removeOffline = useMutation({
    mutationFn: async (row: OfflineCatalogMetadata) => {
      await offlineCatalogService.remove(row.catalogId, row.fileId);
      if (user) await personalRepository.clearOfflineReference(user.id, row.catalogId);
    },
    onSuccess: () => {
      void refreshOffline();
      void queryClient.invalidateQueries({ queryKey: ["downloads"] });
      toast.success(locale === "ar" ? "تم حذف النسخة المحلية" : "Offline copy removed");
    },
  });

  const openOffline = async (row: OfflineCatalogMetadata) => {
    const opened = await offlineCatalogService.open(row.catalogId, row.fileId);
    if (!opened) {
      toast.error(locale === "ar" ? "النسخة المحلية غير موجودة" : "Offline file is missing");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = opened.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.click();
    window.setTimeout(opened.revoke, 60_000);
  };

  const completedSize = offlineRows.reduce((sum, row) => sum + row.size, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.downloads")}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? "إدارة الكتالوجات المحفوظة على هذا الجهاز للاستخدام بدون إنترنت."
              : "Manage catalogs stored on this device for offline field use."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refreshOffline()}>
          <RefreshCw className="me-2 size-4" />
          {t("action.refresh")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <WifiOff className="size-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold">{offlineRows.length}</p>
              <p className="text-xs text-muted-foreground">
                {locale === "ar" ? "كتالوج متاح بدون إنترنت" : "Offline catalogs"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <HardDrive className="size-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold">{formatBytes(completedSize)}</p>
              <p className="text-xs text-muted-foreground">
                {locale === "ar" ? "المساحة المحلية المستخدمة" : "Local storage used"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileCheck2 className="size-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold">
                {downloads.data?.filter((row) => row.status === "completed").length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === "ar" ? "سجل تنزيل مكتمل" : "Completed download records"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === "ar" ? "النسخ المحلية على هذا الجهاز" : "Local copies on this device"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {offlineRows.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {locale === "ar"
                ? "لا توجد كتالوجات محفوظة محليًا بعد. افتح أي كتالوج واختر تنزيل للاستخدام بدون إنترنت."
                : "No offline catalogs yet. Open a catalog and choose Download for offline use."}
            </div>
          )}
          {offlineRows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/catalogs/$catalogId"
                    params={{ catalogId: row.catalogId }}
                    className="max-w-[480px] truncate text-sm font-medium text-primary hover:underline"
                  >
                    {row.filename}
                  </Link>
                  <Badge variant="secondary" className="gap-1">
                    <WifiOff className="size-3" />
                    {locale === "ar" ? "Offline" : "Offline"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  <span>{formatBytes(row.size)}</span>
                  <span>{formatDate(row.downloadedAt)}</span>
                  {row.checksum && (
                    <span>SHA-256 {row.checksum.replace("sha256:", "").slice(0, 16)}…</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void openOffline(row)}>
                  <ExternalLink className="me-2 size-4" />
                  {locale === "ar" ? "فتح المحلي" : "Open local"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOffline.mutate(row)}
                  disabled={removeOffline.isPending}
                >
                  <Trash2 className="me-2 size-4" />
                  {t("action.delete")}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === "ar" ? "سجل التنزيلات السحابي" : "Cloud download history"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {downloads.isLoading && <Skeleton className="h-24 w-full" />}
          {downloads.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
          )}
          {downloads.data?.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
            >
              {row.catalog ? (
                <Link
                  to="/catalogs/$catalogId"
                  params={{ catalogId: row.catalog.id }}
                  className="truncate text-sm text-primary hover:underline"
                >
                  {row.catalog.title}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{row.status}</Badge>
                <span className="font-mono">{row.progress}%</span>
                <span className="text-muted-foreground">{formatDate(row.updated_at)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
