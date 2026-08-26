import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, FileStack, Factory, Globe2, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import { personalRepository } from "@/services/repositories/personalRepository";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة المعلومات | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Overview of catalog coverage, sources and recent activity.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => catalogRepository.getStats() });
  const catalogs = useQuery({
    queryKey: ["catalogs", "recent"],
    queryFn: () => catalogRepository.listCatalogs({ pageSize: 6 }),
  });
  const recent = useQuery({
    queryKey: ["recent", "dashboard"],
    queryFn: () => personalRepository.listRecent(6),
  });
  const searches = useQuery({
    queryKey: ["saved-searches", "dashboard"],
    queryFn: () => personalRepository.listSavedSearches(6),
  });

  const cards = [
    { key: "dash.manufacturers" as const, value: stats.data?.manufacturers, icon: Factory },
    { key: "dash.equipmentTypes" as const, value: stats.data?.equipmentTypes, icon: Boxes },
    { key: "dash.models" as const, value: stats.data?.models, icon: Boxes },
    { key: "dash.catalogs" as const, value: stats.data?.catalogs, icon: FileStack },
    { key: "dash.parts" as const, value: stats.data?.parts, icon: Wrench },
    { key: "dash.onlineSources" as const, value: stats.data?.enabledSources, icon: Globe2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dash.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dash.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">{t(card.key)}</span>
                <card.icon className="size-4" />
              </div>
              {stats.isLoading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <p className="font-mono text-2xl font-semibold">{card.value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("dash.recentCatalogs")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {catalogs.isLoading && <Skeleton className="h-24 w-full" />}
            {catalogs.data?.rows.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
            )}
            {catalogs.data?.rows.map((row) => (
              <Link
                key={row.id}
                to="/catalogs/$catalogId"
                params={{ catalogId: row.id }}
                className="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-accent/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {row.catalog_number ?? "—"} · {row.manufacturer?.name}
                  </p>
                </div>
                <Badge variant="outline">{t(`catalogType.${row.catalog_type}` as never)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("nav.recent")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recent.data?.length ? (
                recent.data.map((item) => (
                  <p key={item.id} className="truncate font-mono text-xs text-muted-foreground">
                    {item.entity_type} · {item.entity_id.slice(0, 8)}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dash.recentSearches")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {searches.data?.length ? (
                searches.data.map((item) => (
                  <Link
                    key={item.id}
                    to="/search"
                    search={{ q: item.query, scope: "all", manufacturerId: "" }}
                    className="block truncate font-mono text-xs text-primary hover:underline"
                  >
                    {item.query}
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
