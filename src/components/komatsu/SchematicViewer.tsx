import { useQuery } from "@tanstack/react-query";
import { ExternalLink, HardDriveDownload, ImageOff, Loader2, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import type { CatalogScheme, CatalogSchemePart } from "@/lib/types";
import { offlineSchemesService } from "@/services/offline/offlineSchemesService";
import { intelligenceRepository } from "@/services/repositories/intelligenceRepository";
import { fileStorageService } from "@/services/storage/fileStorageService";

export type SchemeRow = CatalogScheme & { parts: CatalogSchemePart[] };

export type SchematicCatalog = {
  id: string;
  title: string;
  catalog_number: string | null;
  external_source_url: string | null;
  indexed_page_count: number | null;
  manufacturer: { id: string; name: string; slug: string } | null;
};

function fill(template: string, args: Record<string, string>): string {
  return Object.entries(args).reduce(
    (acc, [key, value]) => acc.replace(`{${key}}`, value),
    template,
  );
}

type I18n = { t: ReturnType<typeof useI18n>["t"]; locale: "ar" | "en" };

function SchemeImage({
  catalogId,
  scheme,
  t,
  locale,
}: {
  catalogId: string;
  scheme: SchemeRow;
} & I18n) {
  const [state, setState] = useState<{
    url: string | null;
    kind: "offline" | "storage" | "hotlink" | "none";
  }>({ url: null, kind: "none" });

  useEffect(() => {
    let active = true;
    let revoke: (() => void) | null = null;
    void (async () => {
      if (await offlineSchemesService.isSaved(catalogId, scheme.page_number)) {
        const opened = await offlineSchemesService.open(catalogId, scheme.page_number);
        if (active && opened) {
          revoke = opened.revoke;
          setState({ url: opened.url, kind: "offline" });
        }
        return;
      }
      if (scheme.image_storage_path) {
        try {
          const url = await fileStorageService.getSignedUrl(
            "catalogs",
            scheme.image_storage_path,
            3600,
          );
          if (active) setState({ url, kind: "storage" });
        } catch {
          if (active) setState({ url: null, kind: "none" });
        }
        return;
      }
      if (scheme.image_url) {
        if (active) setState({ url: scheme.image_url, kind: "hotlink" });
        return;
      }
      if (active) setState({ url: null, kind: "none" });
    })();
    return () => {
      active = false;
      revoke?.();
    };
  }, [catalogId, scheme]);

  if (!state.url) {
    return (
      <div className="flex h-[52vh] items-center justify-center rounded-md border border-dashed border-border text-center">
        <div>
          <ImageOff className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{t("scheme.noDiagram")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-muted/30">
      <a href={state.url} target="_blank" rel="noreferrer">
        <img
          src={state.url}
          alt={scheme.title ?? `page ${scheme.page_number}`}
          className="mx-auto max-h-[52vh] w-auto object-contain"
        />
      </a>
      <Badge
        variant={state.kind === "offline" ? "secondary" : "outline"}
        className="absolute end-2 top-2"
      >
        {state.kind === "offline"
          ? locale === "ar"
            ? "نسخة محلية"
            : "Local copy"
          : state.kind === "storage"
            ? locale === "ar"
              ? "من التخزين"
              : "From storage"
            : "Online"}
      </Badge>
    </div>
  );
}

function SchemePartsTable({ parts, t }: { parts: CatalogSchemePart[] } & I18n) {
  const sorted = [...parts].sort((a, b) => {
    const na = Number((a.item_ref ?? "").match(/\d+/)?.[0] ?? Infinity);
    const nb = Number((b.item_ref ?? "").match(/\d+/)?.[0] ?? Infinity);
    return na - nb;
  });
  if (sorted.length === 0) {
    return <p className="p-4 text-center text-xs text-muted-foreground">{t("state.none")}</p>;
  }
  return (
    <ScrollArea className="max-h-[40vh] rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">{t("scheme.item")}</TableHead>
            <TableHead>{t("scheme.number")}</TableHead>
            <TableHead>{t("scheme.name")}</TableHead>
            <TableHead className="w-14">{t("scheme.qty")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((part) => (
            <TableRow key={part.id}>
              <TableCell className="font-mono text-xs">{part.item_ref ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs" dir="ltr">
                {part.number || part.short_number || "—"}
                <span className="block font-mono text-[10px] text-muted-foreground" dir="ltr">
                  {[part.ref0, part.ref1, part.alt].filter(Boolean).join(" · ") || "\u00A0"}
                </span>
              </TableCell>
              <TableCell className="max-w-[240px] text-xs">{part.name ?? "—"}</TableCell>
              <TableCell className="text-xs">{part.quantity ?? "1"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function SchematicViewerInner({
  catalog,
  schemes,
  initialPage,
}: {
  catalog: SchematicCatalog;
  schemes: SchemeRow[];
  initialPage?: number | null;
}) {
  const { t, locale } = useI18n();
  const [selectedPage, setSelectedPage] = useState<number | null>(initialPage ?? null);
  const [schemeFilter, setSchemeFilter] = useState("");
  const [offlinePages, setOfflinePages] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (typeof initialPage === "number") setSelectedPage(initialPage);
  }, [initialPage]);

  const selected =
    schemes.find((scheme) => scheme.page_number === selectedPage) ??
    schemes.find((scheme) => scheme.image_url || scheme.image_storage_path) ??
    schemes[0] ??
    null;

  const pageHits = useQuery({
    queryKey: ["catalog-pages", catalog.id, searchTerm],
    enabled: searchTerm.trim().length > 0,
    queryFn: () => intelligenceRepository.searchCatalogPages(catalog.id, searchTerm.trim()),
  });

  useEffect(() => {
    let active = true;
    void offlineSchemesService.list(catalog.id).then((rows) => {
      if (!active) return;
      setOfflinePages(new Set(rows.map((row) => row.pageNumber)));
    });
    return () => {
      active = false;
    };
  }, [catalog.id]);

  const downloadAll = async () => {
    setSaving(true);
    setSaveProgress(0);
    const items = schemes.map((scheme) => ({
      pageNumber: scheme.page_number,
      imageStoragePath: scheme.image_storage_path,
      imageUrl: scheme.image_url,
    }));
    const result = await offlineSchemesService.downloadAll(catalog.id, items, (saved, total) =>
      setSaveProgress(total > 0 ? Math.round((saved / total) * 100) : 0),
    );
    const rows = await offlineSchemesService.list(catalog.id);
    setOfflinePages(new Set(rows.map((row) => row.pageNumber)));
    setSaving(false);
    setSaveProgress(null);
    if (result.saved > 0) toast.success(t("scheme.downloaded"));
    else toast.info(t("scheme.offlineNone"));
  };

  const removeAll = async () => {
    await offlineSchemesService.removeAll(catalog.id);
    setOfflinePages(new Set());
    toast.success(t("scheme.removed"));
  };

  const visibleSchemes = schemes.filter(
    (scheme) =>
      !schemeFilter ||
      String(scheme.page_number).includes(schemeFilter) ||
      (scheme.title ?? "").toLowerCase().includes(schemeFilter.toLowerCase()),
  );

  return (
    <div className="grid min-h-[70vh] gap-3 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <Card className="overflow-hidden">
        <CardHeader className="space-y-3 p-3">
          <CardTitle className="text-sm">{t("scheme.pages")}</CardTitle>
          <div className="relative">
            <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={schemeFilter}
              onChange={(event) => setSchemeFilter(event.target.value)}
              placeholder={t("books.filter")}
              className="ps-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="max-h-[62vh] space-y-1 overflow-y-auto p-2 pt-0">
          {visibleSchemes.map((scheme) => (
            <Button
              key={scheme.id}
              variant={selected?.page_number === scheme.page_number ? "secondary" : "ghost"}
              className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-start"
              onClick={() => setSelectedPage(scheme.page_number)}
            >
              <span className="min-w-0 text-xs">
                <span className="me-2 font-mono text-muted-foreground">{scheme.page_number}</span>
                {scheme.title ?? ""}
                {offlinePages.has(scheme.page_number) && (
                  <span className="ms-2 text-[10px] text-muted-foreground">
                    ● {locale === "ar" ? "محلي" : "offline"}
                  </span>
                )}
              </span>
            </Button>
          ))}
          {visibleSchemes.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">{t("books.noBooks")}</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 p-3">
          <div>
            <CardTitle className="text-sm">{selected?.title ?? "—"}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("catalog.page")} {selected?.page_number ?? "—"}
            </p>
          </div>
          {catalog.external_source_url && (
            <Button asChild variant="outline" size="sm">
              <a href={catalog.external_source_url} target="_blank" rel="noreferrer">
                <ExternalLink className="me-2 size-3" />
                {t("scheme.openInBrowser")}
              </a>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0">
          {selected ? (
            <>
              <SchemeImage catalogId={catalog.id} scheme={selected} t={t} locale={locale} />
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {fill(t("scheme.parts"), { count: String(selected.parts.length) })}
                </p>
                <SchemePartsTable parts={selected.parts} t={t} locale={locale} />
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{t("state.none")}</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">{t("scheme.offline")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {offlinePages.size > 0
                  ? `${offlinePages.size} / ${schemes.length}`
                  : t("scheme.offlineNone")}
              </span>
              <Badge variant={offlinePages.size > 0 ? "secondary" : "outline"}>
                {offlinePages.size > 0 ? "✓" : "—"}
              </Badge>
            </div>
            {saveProgress !== null && (
              <div className="space-y-1">
                <Progress value={saveProgress} />
                <p className="text-muted-foreground">{saveProgress}%</p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Button
                size="sm"
                onClick={() => void downloadAll()}
                disabled={saving || schemes.length === 0}
              >
                {saving ? (
                  <>
                    <Loader2 className="me-2 size-4 animate-spin" />
                    {fill(t("scheme.downloading"), { count: String(schemes.length) })}
                  </>
                ) : (
                  <>
                    <HardDriveDownload className="me-2 size-4" />
                    {t("scheme.download")}
                  </>
                )}
              </Button>
              {offlinePages.size > 0 && (
                <Button size="sm" variant="outline" onClick={() => void removeAll()}>
                  <Trash2 className="me-2 size-4" />
                  {t("scheme.remove")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">{t("catalog.search.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
            <div className="flex gap-2">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setSearchTerm(searchTerm.trim());
                }}
                placeholder={t("catalog.search.placeholder")}
                className="font-mono text-xs"
              />
              <Button size="sm" onClick={() => setSearchTerm(searchTerm.trim())}>
                <Search className="size-4" />
              </Button>
            </div>
            {pageHits.isPending && (
              <p className="text-xs text-muted-foreground">{t("search.running")}</p>
            )}
            {pageHits.data?.length === 0 && pageHits.isFetched && (
              <p className="text-xs text-muted-foreground">{t("catalog.search.none")}</p>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(pageHits.data ?? []).slice(0, 10).map((hit) => (
                <button
                  key={hit.page_number}
                  type="button"
                  onClick={() => setSelectedPage(hit.page_number)}
                  className="block w-full rounded-md border border-border p-2 text-start hover:bg-accent/60"
                >
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold">
                      {t("catalog.page")} {hit.page_number}
                    </span>
                    <Search className="size-3 text-muted-foreground" />
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
            <CardTitle className="text-sm">{t("viewer.info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("entity.manufacturer")}</span>
              <span>{catalog.manufacturer?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("entity.catalogNumber")}</span>
              <span className="font-mono">{catalog.catalog_number ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("scheme.pages")}</span>
              <span className="font-mono">{schemes.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SchematicViewer({
  catalog,
  schemes,
  initialPage,
}: {
  catalog: SchematicCatalog;
  schemes: SchemeRow[];
  initialPage?: number | null;
}) {
  return (
    <SchematicViewerInner catalog={catalog} schemes={schemes} initialPage={initialPage ?? null} />
  );
}
