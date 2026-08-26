import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { CATALOG_TYPES } from "@/lib/types";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import type { TranslationKey } from "@/lib/translations";

export const Route = createFileRoute("/_authenticated/catalogs/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? (search["q"] as string) : "",
    catalogType: typeof search["catalogType"] === "string" ? (search["catalogType"] as string) : "",
    manufacturerId:
      typeof search["manufacturerId"] === "string" ? (search["manufacturerId"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "الكتالوجات والأدلة | GCRB Equipment Catalog" },
      { name: "description", content: "Parts books, service manuals and technical documentation." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CatalogsPage,
});

function CatalogsPage() {
  const { t } = useI18n();
  const navigate = Route.useNavigate();
  const { q, catalogType, manufacturerId } = Route.useSearch();

  const manufacturers = useQuery({
    queryKey: ["manufacturers"],
    queryFn: () => catalogRepository.listManufacturers(),
  });
  const catalogs = useQuery({
    queryKey: ["catalogs", q, catalogType, manufacturerId],
    queryFn: () =>
      catalogRepository.listCatalogs({
        ...(q ? { search: q } : {}),
        ...(catalogType ? { catalogType } : {}),
        ...(manufacturerId ? { manufacturerId } : {}),
        pageSize: 60,
      }),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.catalogs")}</h1>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Input
            defaultValue={q}
            placeholder={t("entity.title")}
            className="max-w-xs"
            onChange={(event) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, q: event.target.value }) })
            }
          />
          <Select
            value={catalogType || "any"}
            onValueChange={(value) =>
              navigate({
                to: ".",
                search: (prev) => ({ ...prev, catalogType: value === "any" ? "" : value }),
              })
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("filter.catalogType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("filter.any")}</SelectItem>
              {CATALOG_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`catalogType.${type}` as TranslationKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={manufacturerId || "any"}
            onValueChange={(value) =>
              navigate({
                to: ".",
                search: (prev) => ({ ...prev, manufacturerId: value === "any" ? "" : value }),
              })
            }
          >
            <SelectTrigger className="w-[200px]">
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
        </CardContent>
      </Card>

      {catalogs.isLoading && <Skeleton className="h-40 w-full" />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {catalogs.data?.rows.map((row) => (
          <Link key={row.id} to="/catalogs/$catalogId" params={{ catalogId: row.id }}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm font-semibold">{row.title}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {row.catalog_number ?? "—"} · {row.manufacturer?.name}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">
                    {t(`catalogType.${row.catalog_type}` as TranslationKey)}
                  </Badge>
                  <Badge variant="secondary">{row.language.toUpperCase()}</Badge>
                  {row.serial_from && (
                    <Badge variant="outline" className="font-mono">
                      {row.serial_from}
                      {row.serial_to ? `–${row.serial_to}` : "→"}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {catalogs.data?.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
      )}
    </div>
  );
}
