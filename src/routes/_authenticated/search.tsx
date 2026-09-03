import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Globe2, Loader2, Save, Search as SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess, useSession } from "@/hooks/useSession";
import { searchOnline } from "@/lib/online.functions";
import { useI18n } from "@/lib/i18n";
import type { OnlineResult, SearchScope } from "@/lib/types";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import { intelligenceRepository } from "@/services/repositories/intelligenceRepository";
import { personalRepository } from "@/services/repositories/personalRepository";
import { sourcesRepository } from "@/services/repositories/sourcesRepository";
import { searchService } from "@/services/searchService";

const SCOPES: SearchScope[] = ["all", "models", "parts", "catalogs", "assemblies"];

type LinkConfig = {
  search_url_template?: string;
  manufacturer_scope?: string[];
  allows_download?: boolean;
};

function sourceConfig(value: unknown): LinkConfig {
  return value && typeof value === "object" ? (value as LinkConfig) : {};
}

function sourceSearchUrl(
  baseUrl: string | null,
  configuration: unknown,
  query: string,
): string | null {
  const config = sourceConfig(configuration);
  const template = config.search_url_template?.trim();
  if (template) return template.replaceAll("{query}", encodeURIComponent(query));
  return baseUrl;
}

/** Purely numeric part numbers arrive parsed as numbers, so coerce to text. */
function asSearchText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: asSearchText(search["q"]),
    scope: SCOPES.includes(search["scope"] as SearchScope)
      ? (search["scope"] as SearchScope)
      : ("all" as SearchScope),
    manufacturerId: asSearchText(search["manufacturerId"]),
  }),
  head: () => ({
    meta: [
      { title: "البحث الشامل | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Universal search across models, serials, parts and catalogs.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t, locale } = useI18n();
  const navigate = Route.useNavigate();
  const { q, scope, manufacturerId } = Route.useSearch();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const [term, setTerm] = useState(q);
  const [online, setOnline] = useState<OnlineResult[]>([]);
  const automaticSearchKey = useRef("");

  useEffect(() => {
    setTerm(q);
    setOnline([]);
    automaticSearchKey.current = "";
  }, [q, scope, manufacturerId]);

  const manufacturers = useQuery({
    queryKey: ["manufacturers"],
    queryFn: () => catalogRepository.listManufacturers(),
  });
  const managedSources = useQuery({
    queryKey: ["sources", "managed-search-links"],
    queryFn: () => sourcesRepository.list(),
  });
  const local = useQuery({
    queryKey: ["local-search", q, scope, manufacturerId],
    enabled: q.length > 0,
    queryFn: () => searchService.searchLocal(q, scope, manufacturerId ? { manufacturerId } : {}),
  });

  const onlineSearch = useMutation({
    mutationFn: () =>
      searchOnline({ data: { query: q, filters: manufacturerId ? { manufacturerId } : {} } }),
    onSuccess: (result) => {
      setOnline(result.results);
      for (const failure of result.errors) toast.error(`${failure.source}: ${failure.message}`);
      if (result.results.length === 0) toast.info(t("search.noOnline"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!q || local.data?.total !== 0 || onlineSearch.isPending) return;
    const key = `${q}|${scope}|${manufacturerId}`;
    if (automaticSearchKey.current === key) return;
    automaticSearchKey.current = key;
    onlineSearch.mutate();
  }, [q, scope, manufacturerId, local.data?.total, onlineSearch.isPending]);

  const saveSearch = useMutation({
    mutationFn: () =>
      personalRepository.saveSearch(user!.id, q, { scope, manufacturerId: manufacturerId || null }),
    onSuccess: () => toast.success(t("search.saved")),
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    navigate({ to: ".", search: (prev) => ({ ...prev, q: term.trim() }) });
  }

  const results = local.data;
  const sourceLinks = (managedSources.data ?? [])
    .filter((source) => source.enabled && source.connector_key === "link_template")
    .map((source) => ({
      source,
      url: q ? sourceSearchUrl(source.base_url, source.configuration, q) : source.base_url,
    }))
    .filter((item): item is typeof item & { url: string } => Boolean(item.url));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("search.title")}</h1>
        {q && (
          <Button variant="outline" size="sm" onClick={() => saveSearch.mutate()}>
            <Save className="me-2 size-4" />
            {t("search.saveSearch")}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <form onSubmit={submit} className="flex flex-wrap gap-2">
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={t("top.searchPlaceholder")}
              className="min-w-[240px] flex-1 font-mono"
            />
            <Select
              value={manufacturerId || "any"}
              onValueChange={(value) =>
                navigate({
                  to: ".",
                  search: (prev) => ({ ...prev, manufacturerId: value === "any" ? "" : value }),
                })
              }
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder={t("filter.manufacturer")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("filter.any")}</SelectItem>
                {manufacturers.data?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">
              <SearchIcon className="me-2 size-4" />
              {t("search.run")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!q || onlineSearch.isPending}
              onClick={() => onlineSearch.mutate()}
            >
              {onlineSearch.isPending ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Globe2 className="me-2 size-4" />
              )}
              {t("search.online")}
            </Button>
          </form>

          <Tabs
            value={scope}
            onValueChange={(value) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, scope: value as SearchScope }) })
            }
          >
            <TabsList>
              {SCOPES.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {t(`scope.${item}` as never)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {results && (
            <p className="font-mono text-xs text-muted-foreground">
              {t("search.normalizedAs")}: {results.normalizedQuery || "—"} ·{" "}
              {t("search.resultCount", { count: results.total })}
            </p>
          )}
        </CardContent>
      </Card>

      {q && sourceLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {locale === "ar" ? "البحث في المصادر المعتمدة" : "Search approved sources"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {sourceLinks.map(({ source, url }) => (
              <Button key={source.id} variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="me-2 size-4" />
                  {locale === "ar" ? `ابحث في ${source.name}` : `Search ${source.name}`}
                </a>
              </Button>
            ))}
            <p className="basis-full text-xs text-muted-foreground">
              {locale === "ar"
                ? "هذه روابط بحث يديرها مدير الكتالوج وليست نتائج مؤكدة. النتائج المؤكدة تظهر فقط من Connectors المخصصة."
                : "These are catalog-manager search links, not verified results. Verified results appear only through dedicated connectors."}
            </p>
          </CardContent>
        </Card>
      )}

      {!q && <p className="text-sm text-muted-foreground">{t("search.emptyQuery")}</p>}
      {local.isLoading && <Skeleton className="h-40 w-full" />}
      {local.isError && (
        <p className="text-sm text-destructive">{(local.error as Error).message}</p>
      )}

      {results && results.total === 0 && (
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <p className="text-sm font-medium">{t("search.noLocal")}</p>
            <p className="text-xs text-muted-foreground">{t("search.onlineHint")}</p>
          </CardContent>
        </Card>
      )}

      {results && results.models.length > 0 && (
        <ResultGroup title={t("search.groupModels")}>
          {results.models.map((row) => (
            <Link
              key={row.id}
              to="/models/$modelId"
              params={{ modelId: row.id }}
              onClick={() => void intelligenceRepository.trackModelQuery(row.id, q, true)}
              className="block rounded-md border border-border p-3 hover:bg-accent/60"
            >
              <p className="font-mono text-sm font-semibold">{row.model_name}</p>
              <p className="text-xs text-muted-foreground">
                {row.manufacturer?.name} · {row.equipment_type?.name ?? "—"}
              </p>
            </Link>
          ))}
        </ResultGroup>
      )}

      {results && results.parts.length > 0 && (
        <ResultGroup title={t("search.groupParts")}>
          {results.parts.map((row) => (
            <Link
              key={row.id}
              to="/parts/$partId"
              params={{ partId: row.id }}
              className="block rounded-md border border-border p-3 hover:bg-accent/60"
            >
              <p className="font-mono text-sm font-semibold">{row.primary_part_number}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.description ?? "—"} · {row.manufacturer?.name}
              </p>
            </Link>
          ))}
        </ResultGroup>
      )}

      {results && results.schematicParts.length > 0 && (
        <ResultGroup title={t("search.groupSchematicParts")}>
          <p className="text-xs text-muted-foreground">{t("search.schematicHint")}</p>
          {results.schematicParts.map((row) => (
            <Link
              key={row.scheme_part_id}
              to="/catalogs/$catalogId"
              params={{ catalogId: row.catalog_id }}
              search={{
                page: row.page_number,
                ...(row.number || row.short_number
                  ? { highlight: (row.number || row.short_number) as string }
                  : {}),
              }}
              className="block rounded-md border border-border p-3 hover:bg-accent/60"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-sm font-semibold" dir="ltr">
                  {row.number || row.short_number || "—"}
                </p>
                {row.model_name && <Badge variant="secondary">{row.model_name}</Badge>}
                <Badge variant="outline">
                  {t("catalog.page")} {row.page_number}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {row.name ?? "—"} · {row.scheme_title ?? row.catalog_title}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {row.manufacturer_name} · {row.catalog_title}
                {row.item_ref ? ` · ${t("scheme.item")} ${row.item_ref}` : ""}
              </p>
            </Link>
          ))}
        </ResultGroup>
      )}

      {results && results.catalogs.length > 0 && (
        <ResultGroup title={t("search.groupCatalogs")}>
          {results.catalogs.map((row) => (
            <Link
              key={row.id}
              to="/catalogs/$catalogId"
              params={{ catalogId: row.id }}
              className="block rounded-md border border-border p-3 hover:bg-accent/60"
            >
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {row.catalog_number ?? "—"} · {row.manufacturer?.name}
              </p>
            </Link>
          ))}
        </ResultGroup>
      )}

      {results && results.assemblies.length > 0 && (
        <ResultGroup title={t("search.groupAssemblies")}>
          {results.assemblies.map((row) => (
            <Link
              key={row.id}
              to="/assemblies/$assemblyId"
              params={{ assemblyId: row.id }}
              className="block rounded-md border border-border p-3 hover:bg-accent/60"
            >
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {row.assembly_number ?? "—"} · {row.catalog?.title}
              </p>
            </Link>
          ))}
        </ResultGroup>
      )}

      {online.length > 0 && (
        <ResultGroup title={t("search.groupOnline")}>
          {online.map((row) => (
            <div
              key={`${row.sourceId}-${row.externalId}`}
              className="rounded-md border border-dashed border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{row.title}</p>
                <Badge variant="outline">{t("state.temporary")}</Badge>
                {row.isDemo && <Badge variant="secondary">{t("sources.demoBadge")}</Badge>}
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {row.manufacturer ?? "—"} · {row.model ?? "—"} · {row.partNumber ?? "—"} ·{" "}
                {row.sourceName}
              </p>
              {row.externalUrl && (
                <Button variant="link" size="sm" asChild className="px-0">
                  <a href={row.externalUrl} target="_blank" rel="noreferrer">
                    {locale === "ar" ? "فتح المصدر" : "Open source"}
                  </a>
                </Button>
              )}
              {access.data?.canManage ? (
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link
                    to="/import"
                    search={{ sourceId: row.sourceId, externalId: row.externalId }}
                  >
                    {t("action.preview")}
                  </Link>
                </Button>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">{t("import.notPermitted")}</p>
              )}
            </div>
          ))}
        </ResultGroup>
      )}
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2">{children}</CardContent>
    </Card>
  );
}
