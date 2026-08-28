import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ExternalLink,
  Globe2,
  Loader2,
  MessageSquareWarning,
  Search as SearchIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { inspectRemoteDocument, proxyFetchRemoteDocument } from "@/lib/catalogDiscovery.functions";
import { searchOnline } from "@/lib/online.functions";
import type { ModelResult, OnlineResult } from "@/lib/types";
import { pdfAnalysisService } from "@/services/pdf/pdfAnalysisService";
import { intelligenceRepository } from "@/services/repositories/intelligenceRepository";
import { sourcesRepository } from "@/services/repositories/sourcesRepository";
import { fileStorageService } from "@/services/storage/fileStorageService";

type LinkConfig = {
  search_url_template?: string;
};

type PipelineLog = { percent: number; message: string };

export function DiscoveryPanel({
  model,
  canManage,
  onArchived,
}: {
  model: ModelResult;
  canManage: boolean;
  onArchived?: (catalogId: string) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(`${model.model_name} parts catalog`);
  const [manualUrl, setManualUrl] = useState("");
  const [runQuery, setRunQuery] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  const [log, setLog] = useState<PipelineLog[]>([]);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const managedLinks = useQuery({
    queryKey: ["sources", "discovery-links"],
    queryFn: () => sourcesRepository.list(),
  });

  const online = useMutation({
    mutationFn: () =>
      searchOnline({
        data: { query: runQuery, filters: { manufacturerId: model.manufacturer_id } },
      }),
    onSuccess: (result) => {
      for (const failure of result.errors) toast.error(`${failure.source}: ${failure.message}`);
      if (result.results.length === 0) toast.info(t("discovery.noResults"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function addLog(percent: number, message: string) {
    setLog((previous) => [...previous, { percent, message }].slice(-40));
  }

  const archive = useMutation({
    mutationFn: async (url: string) => {
      if (!canManage) throw new Error(t("discovery.managerOnly"));
      setBusy(true);
      setLog([]);
      setPreviewUrl(null);

      addLog(6, locale === "ar" ? "فحص الرابط والتحقق من الأمان..." : "Inspecting the link...");
      const inspection = await inspectRemoteDocument({ data: { url } });
      addLog(14, locale === "ar" ? "جاري سحب وثيقة PDF..." : "Fetching the PDF document...");
      if (inspection.ok && inspection.contentLength === null) {
        addLog(
          16,
          locale === "ar"
            ? "جاري التنزيل الفعلي (بدون حجم معلن)..."
            : "Streaming the document (no declared size)...",
        );
      }

      let bytes: Uint8Array<ArrayBuffer> | null = null;
      try {
        const response = await fetch(url, { credentials: "omit", mode: "cors" });
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const head = new Uint8Array(buffer.slice(0, 5));
          if (new TextDecoder("latin1").decode(head) === "%PDF-") bytes = new Uint8Array(buffer);
        }
      } catch {
        bytes = null;
      }

      let viaProxy = false;
      if (!bytes) {
        const proxy = await proxyFetchRemoteDocument({ data: { url } });
        if (!proxy.ok || !proxy.base64) throw new Error(proxy.error ?? t("discovery.fetchFailed"));
        bytes = base64ToBytes(proxy.base64);
        viaProxy = true;
      }
      addLog(
        48,
        locale === "ar"
          ? "تم استلام الوثيقة والتحقق من أنها PDF صالح"
          : "Document received and verified as a valid PDF",
      );

      const checksum = await sha256Hex(bytes);
      const safeName = filenameFromUrl(url, "catalog.pdf");
      const storagePath = `discovered/${model.id}/${crypto.randomUUID()}-${safeName}`;

      addLog(
        58,
        locale === "ar"
          ? "رفع الوثيقة إلى مخزن المؤسسة الآمن..."
          : "Uploading to the secure institution store...",
      );
      const stored = await fileStorageService.upload(
        "catalogs",
        storagePath,
        new File([bytes], safeName, { type: "application/pdf" }),
      );

      const matchedResult =
        online.data?.results.find((result) => result.externalUrl === url) ?? null;

      addLog(
        70,
        locale === "ar"
          ? "إنشاء سجل الكتالوج (أرشفة)..."
          : "Creating the archived catalog record...",
      );
      const { data: outcome, error: rpcError } = await supabase.rpc(
        "create_catalog_from_discovery",
        {
          p_payload: {
            machineModelId: model.id,
            manufacturerId: model.manufacturer_id,
            title: buildCatalogTitle(model.model_name),
            catalogType: "parts_catalog",
            language: "en",
            sourceLabel: matchedResult?.sourceName ?? null,
            sourceUrl: url,
            externalReference: matchedResult?.externalId ?? null,
            storageBucket: "catalogs",
            storagePath,
            originalFilename: stored.originalFilename,
            mimeType: "application/pdf",
            fileSize: stored.size,
            checksum,
          } as never,
        },
      );
      if (rpcError) throw new Error(rpcError.message);
      const created = outcome as { ok: boolean; catalogId?: string; error?: string } | null;
      if (!created?.ok || !created.catalogId)
        throw new Error(created?.error ?? t("discovery.archiveFailed"));
      const catalogId = created.catalogId;

      addLog(
        78,
        locale === "ar"
          ? "استخراج النص وفهرسة الصفحات..."
          : "Extracting text and indexing pages...",
      );
      const analysis = await pdfAnalysisService.analyze(bytes);
      let indexedCount = 0;
      if (analysis.ok && analysis.textPages > 0) {
        const { error } = await supabase.rpc("upsert_catalog_pages", {
          p_catalog_id: catalogId,
          p_pages: analysis.pages
            .filter((page) => page.source === "text")
            .map((page) => ({ pageNumber: page.pageNumber, content: page.content })),
        } as never);
        if (error) throw new Error(error.message);
        indexedCount = analysis.textPages;
        addLog(
          94,
          locale === "ar"
            ? `تمت فهرسة ${indexedCount} صفحة — أصبح البحث عن أرقام القطع ممكناً`
            : `${indexedCount} pages indexed — part-number search is now available`,
        );
      } else {
        await intelligenceRepository.setCatalogAnalysisStatus(catalogId, "failed");
        addLog(
          94,
          (analysis.note ? `${analysis.note} ` : "") +
            (locale === "ar"
              ? "(سيظل قابلاً للفتح والتنزيل)"
              : "(it remains viewable and downloadable)"),
        );
      }

      try {
        const doc = await intelligenceRepository.saveDiscovered({
          query: runQuery || model.model_name,
          sourceLabel: matchedResult?.sourceName ?? null,
          sourceId: matchedResult?.sourceId ?? null,
          title: buildCatalogTitle(model.model_name),
          url,
          kind: "pdf",
          status: "archived",
          verified: viaProxy,
        });
        await intelligenceRepository.updateDiscovered(doc.id, {
          catalog_id: catalogId,
          filename: safeName,
        });
      } catch (error) {
        console.warn("[discovery] discovered-document log failed", error);
      }

      addLog(
        100,
        locale === "ar"
          ? "اكتمل — الكتالوج مؤرشف ومتوفر الآن"
          : "Done — the catalog is archived and available",
      );
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      await queryClient.invalidateQueries({ queryKey: ["model", model.id] });
      onArchived?.(catalogId);
      return catalogId;
    },
    onError: (error: Error) => {
      setBusy(false);
      toast.error(error.message);
    },
    onSuccess: () => {
      setBusy(false);
      toast.success(locale === "ar" ? "تمت أرشفة الكتالوج المكتشف" : "Discovered catalog archived");
    },
  });

  const sourceLinks = (managedLinks.data ?? [])
    .filter((source) => source.enabled && source.connector_key === "link_template")
    .map((source) => {
      const config = (source.configuration ?? {}) as LinkConfig;
      const template = config.search_url_template?.trim();
      return {
        source,
        url:
          runQuery && template
            ? template.replaceAll("{query}", encodeURIComponent(runQuery))
            : source.base_url,
      };
    })
    .filter((item): item is typeof item & { url: string } => Boolean(item.url));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" />
        <span>
          {locale === "ar"
            ? "تصفّح الإنترنت داخل التطبيق لأدلة المعدات المتاحة علنياً. لا نجتاز اشتراكات ولا نسجّل دخولاً ولا نكسر أي حماية. الوثائق المؤرشفة تُخزَّن خصوصاً في مخزن المؤسسة."
            : "Browse the internet from inside the app for publicly available machine catalogs. No subscription bypass, no logins, no protection cracking. Archived documents are stored privately in the institution store."}
        </span>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <SearchIcon className="size-4" />
            {t("discovery.find")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const term = query.trim();
              if (!term || online.isPending) return;
              setRunQuery(term);
              online.mutate();
            }}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-[220px] flex-1 font-mono"
              dir="ltr"
            />
            <Button type="submit" disabled={online.isPending || !query.trim()}>
              {online.isPending ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Globe2 className="me-2 size-4" />
              )}
              {locale === "ar" ? "ابحث في الإنترنت" : "Search the internet"}
            </Button>
          </form>

          {sourceLinks.length > 0 && runQuery !== "" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {locale === "ar" ? "مصادر معتمدة:" : "Approved sources:"}
              </span>
              {sourceLinks.map(({ source, url }) => (
                <Button key={source.id} variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="me-1 size-3" />
                    {source.name}
                  </a>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!online.isPending && online.data?.results.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("discovery.noResults")}</p>
      )}
      {online.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

      <div className="space-y-2">
        {online.data?.results.map((result) => (
          <DiscoveryResultRow
            key={`${result.sourceId}-${result.externalId}`}
            result={result}
            canManage={canManage}
            archiving={archive.isPending}
            onArchive={(url) => archive.mutate(url)}
            onPreview={(url) => {
              if (!url) {
                toast.info(
                  locale === "ar"
                    ? "لا يوجد رابط خارجي لهذه النتيجة"
                    : "This result has no external link",
                );
                return;
              }
              setPreviewBlocked(false);
              setPreviewUrl(url);
            }}
            locale={locale}
          />
        ))}
        {(online.data?.results.length ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            {locale === "ar"
              ? "النتائج المباشرة تأتي من الموصّلات المعتمدة. ابدأ من «معاينة» ثم اسحب أي ملف PDF تشير إليه الصفحة، أو الصق رابط PDF مباشراً."
              : "Direct results come from approved connectors. Start with Preview, fetch any PDF the page points to, or paste a direct PDF link."}
          </p>
        )}
      </div>

      {previewUrl && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 p-3">
            <CardTitle className="text-sm">
              {locale === "ar" ? "معاينة داخل التطبيق" : "In-app preview"}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPreviewUrl(null)}>
              {t("action.cancel")}
            </Button>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {previewBlocked ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-6 text-center">
                <MessageSquareWarning className="size-6 text-muted-foreground" />
                <p className="max-w-sm text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "المصدر يمنع عرضه داخل نافذة التطبيق. افتحه في تبويب جديد."
                    : "The source denies embedding inside the app. Open it in a new tab instead."}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="me-2 size-4" />
                    {locale === "ar" ? "فتح المصدر" : "Open source"}
                  </a>
                </Button>
              </div>
            ) : (
              <iframe
                ref={previewRef}
                src={previewUrl}
                title={previewUrl}
                className="h-[60vh] w-full rounded-md border border-border bg-background"
                sandbox="allow-scripts allow-same-origin"
                onLoad={() => {
                  try {
                    if (previewRef.current?.contentWindow?.document) setPreviewBlocked(false);
                  } catch {
                    setPreviewBlocked(true);
                  }
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {busy && log.length > 0 && (
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm">
              {locale === "ar" ? "أرشفة وتحليل الوثيقة" : "Archiving & analysing the document"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            <Progress value={log[log.length - 1]?.percent ?? 0} />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {log.map((entry, index) => (
                <p key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-8 shrink-0 font-mono">{entry.percent}%</span>
                  <span className={entry.percent >= 100 ? "text-primary" : ""}>
                    {entry.message}
                  </span>
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-sm">
            {locale === "ar" ? "أو الصق رابط PDF مباشر" : "Or paste a direct PDF link"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
          <Input
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            className="min-w-[260px] flex-1 font-mono"
            dir="ltr"
            placeholder="https://example.com/catalog/d155a-1.pdf"
          />
          <Button
            variant={manualUrl.trim() ? "default" : "outline"}
            disabled={!manualUrl.trim() || archive.isPending || busy}
            onClick={() => archive.mutate(manualUrl.trim())}
          >
            {archive.isPending ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <BookOpen className="me-2 size-4" />
            )}
            {locale === "ar" ? "سحب وأرشفة" : "Fetch & archive"}
          </Button>
          <p className="basis-full text-[11px] text-muted-foreground" dir="ltr">
            {locale === "ar" ? "مثال للتجربة:" : "Try, e.g.:"} https://www.orimi.com/pdf-test.pdf
          </p>
        </CardContent>
      </Card>

      {!canManage && (
        <p className="text-xs text-destructive">
          {locale === "ar"
            ? "السحب والأرشفة يتطلبان دور مدير كتالوج."
            : "Fetching and archiving require the catalog-manager role."}
        </p>
      )}
    </div>
  );
}

function DiscoveryResultRow({
  result,
  canManage,
  archiving,
  onArchive,
  onPreview,
  locale,
}: {
  result: OnlineResult;
  canManage: boolean;
  archiving: boolean;
  onArchive: (url: string) => void;
  onPreview: (url: string | null) => void;
  locale: "ar" | "en";
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{result.title}</p>
            {result.isDemo && (
              <Badge variant="secondary">{locale === "ar" ? "تجريبي" : "Demo"}</Badge>
            )}
            <Badge variant="outline">{result.sourceName}</Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {result.manufacturer ?? "—"} · {result.model ?? "—"} · {result.partNumber ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result.externalUrl && (
            <Button variant="outline" size="sm" onClick={() => onPreview(result.externalUrl)}>
              <Sparkles className="me-2 size-4" />
              {locale === "ar" ? "معاينة" : "Preview"}
            </Button>
          )}
          {result.externalUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={result.externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="me-2 size-4" />
                {locale === "ar" ? "فتح المصدر" : "Open"}
              </a>
            </Button>
          )}
          {result.externalUrl && canManage && (
            <Button size="sm" disabled={archiving} onClick={() => onArchive(result.externalUrl!)}>
              <BookOpen className="me-2 size-4" />
              {locale === "ar" ? "سحب وأرشفة" : "Fetch & archive"}
            </Button>
          )}
        </div>
      </div>
      {result.description && (
        <p className="mt-1 text-xs text-muted-foreground">{result.description}</p>
      )}
    </div>
  );
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const name = url.split("?")[0]?.split("/").pop()?.trim();
    if (name && name.toLowerCase().endsWith(".pdf")) return name.replace(/[^A-Za-z0-9._-]/g, "_");
  } catch {
    /* ignore */
  }
  return fallback;
}

function buildCatalogTitle(modelName: string): string {
  return `${modelName.toUpperCase()} — Parts Catalog`;
}
