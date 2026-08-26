import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Plus, PlugZap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { testSource } from "@/lib/online.functions";
import { sourcesRepository } from "@/services/repositories/sourcesRepository";

type ManagedSourceConfig = {
  mode?: string;
  search_url_template?: string;
  allows_download?: boolean;
  manufacturer_scope?: string[];
  notes?: string;
};

function configOf(value: unknown): ManagedSourceConfig {
  return value && typeof value === "object" ? (value as ManagedSourceConfig) : {};
}

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({
    meta: [
      { title: "المصادر الإلكترونية | GCRB Equipment Catalog" },
      { name: "description", content: "Managed external heavy-equipment catalog sources." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const { t, formatDate, locale } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const queryClient = useQueryClient();
  const runTest = useServerFn(testSource);
  const canManage = Boolean(access.data?.canManageCatalog || access.data?.isAdmin);

  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    searchTemplate: "",
    manufacturers: "",
    requiresAuth: false,
    allowsDownload: false,
    priority: "50",
    notes: "",
  });

  const sources = useQuery({ queryKey: ["sources"], queryFn: () => sourcesRepository.list() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["sources"] });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      sourcesRepository.update(id, { enabled }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const slug = form.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!slug) throw new Error(locale === "ar" ? "اسم المصدر مطلوب" : "Source name is required");
      return sourcesRepository.create({
        name: form.name.trim(),
        slug,
        source_type: "catalog_website",
        connector_key: "link_template",
        base_url: form.baseUrl.trim() || null,
        enabled: false,
        priority: Number(form.priority) || 50,
        requires_authentication: form.requiresAuth,
        configuration: {
          mode: "managed_link",
          search_url_template: form.searchTemplate.trim() || undefined,
          allows_download: form.allowsDownload,
          manufacturer_scope: form.manufacturers
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          notes: form.notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تمت إضافة المصدر" : "Source added");
      setForm({
        name: "",
        baseUrl: "",
        searchTemplate: "",
        manufacturers: "",
        requiresAuth: false,
        allowsDownload: false,
        priority: "50",
        notes: "",
      });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: (sourceId: string) => runTest({ data: { sourceId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`${t("sources.testOk")} — ${result.message}`);
      else toast.error(`${t("sources.testFail")} — ${result.message}`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("sources.title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {locale === "ar"
            ? "مصادر البحث المعتمدة للكتالوجات. إضافة رابط لا تشغّل أي كود خارجي؛ البحث الآلي يحتاج Connector مخصصًا وآمنًا."
            : "Approved catalog discovery sources. Adding a URL never executes third-party code; automated extraction requires a dedicated safe connector."}
        </p>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4" />
              {locale === "ar" ? "إضافة مصدر بحث" : "Add catalog source"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate();
              }}
            >
              <Field label={locale === "ar" ? "اسم المصدر" : "Source name"}>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label={locale === "ar" ? "رابط الموقع" : "Base URL"}>
                <Input dir="ltr" type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://..." />
              </Field>
              <Field label={locale === "ar" ? "قالب رابط البحث" : "Search URL template"}>
                <Input dir="ltr" value={form.searchTemplate} onChange={(e) => setForm({ ...form, searchTemplate: e.target.value })} placeholder="https://site/search?q={query}" />
              </Field>
              <Field label={locale === "ar" ? "الشركات المدعومة" : "Manufacturers"}>
                <Input value={form.manufacturers} onChange={(e) => setForm({ ...form, manufacturers: e.target.value })} placeholder="Komatsu, Caterpillar" />
              </Field>
              <Field label={locale === "ar" ? "أولوية البحث" : "Priority"}>
                <Input dir="ltr" type="number" min="1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              </Field>
              <Field label={locale === "ar" ? "ملاحظات" : "Notes"}>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.requiresAuth} onCheckedChange={(value) => setForm({ ...form, requiresAuth: value })} />
                {locale === "ar" ? "يحتاج تسجيل دخول" : "Requires login"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.allowsDownload} onCheckedChange={(value) => setForm({ ...form, allowsDownload: value })} />
                {locale === "ar" ? "المصدر يسمح بالتنزيل" : "Source permits download"}
              </label>
              <div className="md:col-span-2 lg:col-span-3">
                <Button type="submit" disabled={create.isPending}>
                  {locale === "ar" ? "حفظ المصدر" : "Save source"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {sources.isLoading && <Skeleton className="h-40 w-full" />}

      <div className="grid gap-4 md:grid-cols-2">
        {sources.data?.map((source) => {
          const config = configOf(source.configuration);
          return (
            <Card key={source.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {source.name}
                    {source.connector_key === "demo" && <Badge variant="secondary">Demo</Badge>}
                  </CardTitle>
                  <p className="font-mono text-xs text-muted-foreground">{source.connector_key}</p>
                </div>
                <Switch
                  checked={source.enabled}
                  disabled={!canManage || source.connector_key === "demo"}
                  onCheckedChange={(enabled) => toggle.mutate({ id: source.id, enabled })}
                />
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Row label={t("sources.priority")} value={String(source.priority)} />
                <Row label={t("sources.baseUrl")} value={source.base_url ?? "—"} mono />
                <Row label={locale === "ar" ? "قالب البحث" : "Search template"} value={config.search_url_template ?? "—"} mono />
                <Row label={locale === "ar" ? "التنزيل" : "Download"} value={config.allows_download ? (locale === "ar" ? "مسموح" : "Permitted") : (locale === "ar" ? "غير مؤكد" : "Not verified")} />
                <Row label={locale === "ar" ? "الشركات" : "Manufacturers"} value={config.manufacturer_scope?.join(", ") || "—"} />
                <Row label={t("sources.requiresAuth")} value={source.requires_authentication ? t("sources.enabled") : t("sources.disabled")} />
                <Row label={t("sources.lastSuccess")} value={source.last_success_at ? formatDate(source.last_success_at) : t("sources.never")} />
                {source.last_error && <p className="rounded-md bg-destructive/10 p-2 font-mono text-destructive">{source.last_error}</p>}
                <div className="flex flex-wrap gap-2 pt-2">
                  {source.base_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={source.base_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="me-2 size-4" />
                        {locale === "ar" ? "فتح المصدر" : "Open source"}
                      </a>
                    </Button>
                  )}
                  {canManage && source.connector_key !== "link_template" && (
                    <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate(source.id)}>
                      <PlugZap className="me-2 size-4" />
                      {t("sources.status")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {locale === "ar"
          ? "لا يتم تجاوز تسجيل الدخول أو الاشتراكات أو CAPTCHA. زر التنزيل سيظهر فقط عندما يثبت الـConnector أن الملف متاح للتنزيل المسموح."
          : "Login, subscriptions, CAPTCHA and access controls are never bypassed. Download is enabled only when a connector verifies a permitted file URL."}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "max-w-[65%] truncate font-mono" : "max-w-[65%] truncate"}>{value}</span>
    </div>
  );
}
