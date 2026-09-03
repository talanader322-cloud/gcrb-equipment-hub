import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  Clock,
  Download,
  Factory,
  FileStack,
  Globe2,
  HardHat,
  Import,
  Search,
  Star,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/translations";
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

const QUICK_ACTIONS: { to: string; labelKey: TranslationKey; icon: typeof Search }[] = [
  { to: "/search", labelKey: "nav.search", icon: Search },
  { to: "/manufacturers", labelKey: "nav.manufacturers", icon: Factory },
  { to: "/equipment", labelKey: "nav.equipment", icon: Boxes },
  { to: "/assets", labelKey: "nav.assets", icon: HardHat },
  { to: "/catalogs", labelKey: "nav.catalogs", icon: FileStack },
  { to: "/parts", labelKey: "nav.parts", icon: Wrench },
  { to: "/sources", labelKey: "nav.onlineSources", icon: Globe2 },
  { to: "/import", labelKey: "nav.importCenter", icon: Import },
  { to: "/favorites", labelKey: "nav.favorites", icon: Star },
  { to: "/recent", labelKey: "nav.recent", icon: Clock },
  { to: "/downloads", labelKey: "nav.downloads", icon: Download },
];

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
    { key: "dash.models" as const, value: stats.data?.models, icon: HardHat },
    { key: "dash.catalogs" as const, value: stats.data?.catalogs, icon: FileStack },
    { key: "dash.parts" as const, value: stats.data?.parts, icon: Wrench },
    { key: "dash.onlineSources" as const, value: stats.data?.enabledSources, icon: Globe2 },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-md border border-border bg-header px-5 py-6 text-header-foreground shadow-raised">
        <div className="hazard-stripe absolute inset-x-0 top-0 h-1.5" aria-hidden />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("dash.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-header-foreground/70">{t("dash.subtitle")}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div key={card.key} className="tile">
            <div className="flex items-center justify-between">
              <span className="label-caps">{t(card.key)}</span>
              <span className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                <card.icon className="size-4" />
              </span>
            </div>
            {stats.isLoading ? (
              <Skeleton className="h-7 w-14" />
            ) : (
              <p className="font-mono text-2xl font-semibold tabular-nums">{card.value ?? 0}</p>
            )}
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="label-caps">{t("dash.quickAccess")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="tile items-center justify-center gap-3 py-6 text-center"
            >
              <span className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-amber">
                <action.icon className="size-6" />
              </span>
              <span className="text-sm font-semibold leading-tight">{t(action.labelKey)}</span>
            </Link>
          ))}
        </div>
      </section>

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
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary hover:bg-accent/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <FileStack className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {row.catalog_number ?? "—"} · {row.manufacturer?.name}
                    </p>
                  </div>
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
