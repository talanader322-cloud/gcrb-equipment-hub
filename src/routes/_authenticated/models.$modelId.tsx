import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Factory, History, Layers, Package, Truck } from "lucide-react";
import { useState } from "react";

import { DiscoveryPanel } from "@/components/discovery/DiscoveryPanel";
import { SchematicViewer } from "@/components/komatsu/SchematicViewer";
import { ModelImagePicker } from "@/components/models/ModelImagePicker";
import { ModelPhoto } from "@/components/models/ModelPhoto";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { CATALOG_TYPES, type CatalogType, type MachineQueryLog } from "@/lib/types";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import { intelligenceRepository } from "@/services/repositories/intelligenceRepository";


export const Route = createFileRoute("/_authenticated/models/$modelId")({
  head: () => ({
    meta: [
      { title: "بطاقة الموديل | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Machine model details, serial ranges and related catalogs.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ModelPage,
});

function ModelPage() {
  const { modelId } = Route.useParams();
  const { t, locale } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("info");
  const [schemeCatalogId, setSchemeCatalogId] = useState<string | null>(null);

  const model = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => catalogRepository.getModel(modelId),
  });
  const queryLog = useQuery({
    queryKey: ["model-queries", modelId],
    queryFn: () => intelligenceRepository.listModelQueries(modelId, 8),
  });


  if (model.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!model.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { model: row, aliases, serialRanges, catalogs, compatibility, assets } = model.data;
  const canManage = Boolean(access.data?.canManageCatalog);
  const queries = queryLog.data ?? [];

  const groupedCatalogs = CATALOG_TYPES.map((type) => ({
    type,
    items: catalogs.filter(
      (c) =>
        c.catalog_type === type ||
        (type === "other" && !CATALOG_TYPES.includes(c.catalog_type as CatalogType)),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="relative border-b border-border bg-muted/40 md:border-b-0 md:border-e">
            <ModelPhoto
              imagePath={row.image_path}
              imageUrl={row.image_url}
              equipmentTypeSlug={row.equipment_type?.slug}
              alt={row.model_name}
              className="aspect-[4/3] size-full object-cover md:aspect-auto"
              iconClassName="size-12"
            />
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{row.model_name}</h1>
              {row.manufacturer && <Badge variant="outline">{row.manufacturer.name}</Badge>}
              {row.equipment_type && (
                <Badge variant="secondary">
                  {locale === "ar"
                    ? (row.equipment_type.name_ar ?? row.equipment_type.name)
                    : row.equipment_type.name}
                </Badge>
              )}
              {row.series && <Badge variant="outline">{row.series}</Badge>}
            </div>
            {row.description && (
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{row.description}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                icon={<Factory className="size-4" />}
                label={t("entity.manufacturer")}
                value={row.manufacturer?.name ?? "—"}
                mono
              />
              <Stat
                icon={<Layers className="size-4" />}
                label={t("model.production")}
                value={
                  row.production_from || row.production_to
                    ? `${row.production_from ?? "…"}–${row.production_to ?? "…"}`
                    : "—"
                }
              />
              <Stat
                icon={<BookOpen className="size-4" />}
                label={t("entity.catalogs")}
                value={String(catalogs.length)}
              />
              <Stat
                icon={<Package className="size-4" />}
                label={t("entity.parts")}
                value={String(compatibility.length)}
              />
            </div>
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap justify-start">
          <TabsTrigger value="info">{t("model.tabs.info")}</TabsTrigger>
          <TabsTrigger value="assets">{t("model.tabs.assets")}</TabsTrigger>
          <TabsTrigger value="queries">{t("model.tabs.queries")}</TabsTrigger>
          <TabsTrigger value="catalogs">{t("model.tabs.catalogs")}</TabsTrigger>
          <TabsTrigger value="schemes">{t("model.tabs.schemes")}</TabsTrigger>
          <TabsTrigger value="parts">{t("model.tabs.parts")}</TabsTrigger>
          <TabsTrigger value="discovery">{t("model.tabs.discovery")}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("entity.serialRanges")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {serialRanges.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("state.none")}</p>
                )}
                {serialRanges.map((range) => (
                  <div key={range.id} className="rounded-md border border-border p-2">
                    <p className="font-mono text-sm">
                      {range.display_value ??
                        `${range.serial_prefix ?? ""}${range.serial_from ?? ""}–${range.serial_to ?? ""}`}
                    </p>
                    {range.notes && <p className="text-xs text-muted-foreground">{range.notes}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("entity.aliases")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {aliases.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("state.none")}</p>
                )}
                {aliases.map((alias) => (
                  <Badge key={alias.id} variant="outline" className="font-mono">
                    {alias.alias}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("model.assetsForModel")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {assets.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
              )}
              {assets.map((asset) => (
                <Link
                  key={asset.id}
                  to="/assets/$assetId"
                  params={{ assetId: asset.id }}
                  className="rounded-md border border-border p-3 hover:bg-accent/60"
                >
                  <p className="font-mono text-sm font-medium">{asset.serial_number ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {asset.asset_number ?? "—"} · {asset.branch ?? "—"}
                  </p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queries">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("model.lastQueries")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {queries.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("model.lastQueriesEmpty")}</p>
              )}
              {queries.map((query) => (
                <QueryRow key={query.id} item={query} locale={locale} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalogs" className="space-y-4">
          {groupedCatalogs.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                {t("state.empty")}
              </CardContent>
            </Card>
          )}
          {groupedCatalogs.map((group) => (
            <Card key={group.type}>
              <CardHeader>
                <CardTitle className="text-base">
                  {t(`catalogType.${group.type}` as never)}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {group.items.map((catalog) => (
                  <Link
                    key={catalog.id}
                    to="/catalogs/$catalogId"
                    params={{ catalogId: catalog.id }}
                    className="rounded-md border border-border p-3 hover:bg-accent/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{catalog.title}</p>
                      <AnalysisBadge status={catalog.analysis_status} t={t} />
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {catalog.catalog_number ?? "—"} · {catalog.language} ·{" "}
                      {catalog.publication_date ? catalog.publication_date.slice(0, 4) : "—"}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="schemes" className="space-y-3">
          <ModelSchemes
            catalogs={catalogs.map((catalog) => ({
              id: catalog.id,
              title: catalog.title,
              catalog_number: catalog.catalog_number,
            }))}
            selectedId={schemeCatalogId}
            onSelect={setSchemeCatalogId}
          />
        </TabsContent>

        <TabsContent value="parts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("entity.parts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("entity.partNumber")}</TableHead>
                    <TableHead>{t("entity.description")}</TableHead>
                    <TableHead>{t("entity.notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compatibility.map((item) => {
                    const part = (
                      item as {
                        part: {
                          id: string;
                          primary_part_number: string;
                          description: string | null;
                        } | null;
                      }
                    ).part;
                    if (!part) return null;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono">
                          <Link
                            to="/parts/$partId"
                            params={{ partId: part.id }}
                            className="text-primary hover:underline"
                          >
                            {part.primary_part_number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{part.description ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discovery">
          <DiscoveryPanel
            model={row}
            canManage={canManage}
            onArchived={() => void queryClient.invalidateQueries({ queryKey: ["model", modelId] })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ModelSchemes({
  catalogs,
  selectedId,
  onSelect,
}: {
  catalogs: { id: string; title: string; catalog_number: string | null }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const activeId = selectedId ?? catalogs[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ["catalog", activeId],
    enabled: Boolean(activeId),
    queryFn: () => catalogRepository.getCatalog(activeId!),
  });

  if (catalogs.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {t("model.schemesEmpty")}
        </CardContent>
      </Card>
    );
  }

  const schemes = detail.data?.schemes ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("model.selectCatalog")}</span>
        {catalogs.map((catalog) => (
          <button
            key={catalog.id}
            type="button"
            onClick={() => onSelect(catalog.id)}
            className={`rounded-md border px-2.5 py-1.5 text-xs ${
              activeId === catalog.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-accent/60"
            }`}
          >
            {catalog.title}
            {catalog.catalog_number ? (
              <span className="ms-1 font-mono text-[10px] text-muted-foreground">
                {catalog.catalog_number}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {detail.isLoading && <Skeleton className="h-64 w-full" />}
      {!detail.isLoading && schemes.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t("model.schemesEmpty")}
          </CardContent>
        </Card>
      )}
      {!detail.isLoading && schemes.length > 0 && detail.data && (
        <SchematicViewer
          catalog={{
            id: detail.data.catalog.id,
            title: detail.data.catalog.title,
            catalog_number: detail.data.catalog.catalog_number,
            external_source_url: detail.data.catalog.external_source_url,
            indexed_page_count: detail.data.catalog.indexed_page_count,
            manufacturer: detail.data.catalog.manufacturer ?? null,
          }}
          schemes={schemes}
        />
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className={`mt-1 truncate text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function AnalysisBadge({
  status,
  t,
}: {
  status: string | null;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (status === "indexed") {
    return (
      <Badge variant="secondary" className="shrink-0 text-[11px]">
        {t("catalog.analysis.indexed")}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="shrink-0 text-[11px]">
        {t("catalog.analysis.failed")}
      </Badge>
    );
  }
  if (status === "analyzing") {
    return (
      <Badge variant="outline" className="shrink-0 text-[11px]">
        {t("catalog.analysis.analyzing")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 text-[11px] text-muted-foreground">
      {t("catalog.analysis.none")}
    </Badge>
  );
}

function QueryRow({ item, locale }: { item: MachineQueryLog; locale: string }) {
  const { t } = useI18n();
  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-SY" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(item.searched_at));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <History className="size-4 shrink-0 text-muted-foreground" />
        <p className="truncate font-mono text-sm" dir="auto">
          {item.query}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.matched ? (
          <Badge variant="secondary" className="text-[11px]">
            {t("search.matched") as never}
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
    </div>
  );
}
