import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, HardDriveDownload, PackageSearch, Tractor } from "lucide-react";
import { useEffect } from "react";

import { AssetPhoto } from "@/components/assets/AssetPhoto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { MODEL_CATALOG_CATEGORIES, modelHomeService } from "@/services/models/modelHomeService";
import { offlineCatalogService } from "@/services/offline/offlineCatalogService";
import { personalRepository } from "@/services/repositories/personalRepository";

export const Route = createFileRoute("/_authenticated/models/$modelId")({
  head: () => ({
    meta: [
      { title: "بطاقة الموديل | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Equipment model home: serial applicability, categorized catalogs and institution assets.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ModelPage,
});

const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  parts_catalog: { ar: "كتالوج قطع الغيار", en: "Parts Catalog" },
  operation_manual: { ar: "دليل التشغيل", en: "Operation Manual" },
  service_manual: { ar: "دليل الخدمة", en: "Service Manual" },
  workshop_manual: { ar: "دليل الورشة", en: "Workshop Manual" },
  maintenance_manual: { ar: "دليل الصيانة", en: "Maintenance Manual" },
  engine_manual: { ar: "المحرك", en: "Engine Manual" },
  transmission_manual: { ar: "ناقل الحركة", en: "Transmission Manual" },
  electrical_diagram: { ar: "الكهرباء", en: "Electrical" },
  hydraulic_diagram: { ar: "الهيدروليك", en: "Hydraulic" },
  specification_manual: { ar: "المواصفات", en: "Specifications" },
  other: { ar: "أخرى", en: "Other" },
};

function ModelPage() {
  const { modelId } = Route.useParams();
  const { t, locale } = useI18n();
  const { user } = useSession();

  const model = useQuery({
    queryKey: ["model-home", modelId],
    queryFn: () => modelHomeService.get(modelId),
  });

  const offline = useQuery({
    queryKey: ["offline-catalogs"],
    queryFn: () => offlineCatalogService.list(),
  });

  useEffect(() => {
    if (user && model.data) void personalRepository.trackRecent(user.id, "machine_model", modelId);
  }, [user, model.data, modelId]);

  if (model.isLoading) return <Skeleton className="h-72 w-full" />;
  if (model.isError) return <p className="text-sm text-destructive">{t("state.error")}</p>;
  if (!model.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { model: row, aliases, serialApplicability, catalogGroups, assets, compatibility } = model.data;
  const offlineIds = new Set((offline.data ?? []).map((item) => item.catalogId));

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[240px_1fr]">
          <div className="overflow-hidden rounded-lg border bg-muted/30">
            {row.image_url ? (
              <img src={row.image_url} alt={row.model_name} className="h-48 w-full object-contain" />
            ) : (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                <Tractor className="size-14" />
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-3xl font-semibold tracking-tight" dir="ltr">
                {row.model_name}
              </h1>
              {row.manufacturer?.name && <Badge variant="outline">{row.manufacturer.name}</Badge>}
              {row.equipment_type && (
                <Badge variant="secondary">
                  {locale === "ar"
                    ? (row.equipment_type.name_ar ?? row.equipment_type.name)
                    : row.equipment_type.name}
                </Badge>
              )}
            </div>
            {row.description && <p className="max-w-3xl text-sm text-muted-foreground">{row.description}</p>}
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {aliases.map((alias) => (
                  <Badge key={alias.id} variant="outline" className="font-mono">
                    {alias.alias}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{model.data.catalogs.length} {locale === "ar" ? "كتالوج" : "catalogs"}</Badge>
              <Badge variant="secondary">{assets.length} {locale === "ar" ? "معدة بالمؤسسة" : "institution assets"}</Badge>
              <Badge variant="secondary">{compatibility.length} {locale === "ar" ? "قطعة متوافقة" : "compatible parts"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === "ar" ? "نطاقات السيريال المنطبقة" : "Applicable Serial Ranges"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {serialApplicability.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("state.none")}</p>
          ) : (
            serialApplicability.map((range) => (
              <div key={range.id} className="rounded-md border px-3 py-2">
                <p className="font-mono text-sm" dir="ltr">{range.label}</p>
                {range.notes && <p className="mt-1 text-xs text-muted-foreground">{range.notes}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5" />
          <h2 className="text-lg font-semibold">{locale === "ar" ? "مكتبة الموديل" : "Model Library"}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MODEL_CATALOG_CATEGORIES.map((category) => {
            const group = catalogGroups.find((item) => item.category === category)!;
            const offlineCount = group.catalogs.filter((catalog) => offlineIds.has(catalog.id)).length;
            const label = CATEGORY_LABELS[category]?.[locale === "ar" ? "ar" : "en"] ?? category;
            return (
              <Card key={category} className="min-h-36">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">{label}</CardTitle>
                    <Badge variant="outline">{group.catalogs.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {offlineCount > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <HardDriveDownload className="size-3" />
                      {offlineCount} {locale === "ar" ? "بدون إنترنت" : "offline"}
                    </Badge>
                  )}
                  {group.catalogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("state.none")}</p>
                  ) : (
                    group.catalogs.slice(0, 3).map((catalog) => (
                      <Link
                        key={catalog.id}
                        to="/catalogs/$catalogId"
                        params={{ catalogId: catalog.id }}
                        className="block rounded-md border p-2 text-sm hover:bg-accent/60"
                      >
                        <span className="line-clamp-1 font-medium">{catalog.title}</span>
                        <span className="block font-mono text-xs text-muted-foreground" dir="ltr">
                          {catalog.catalog_number ?? "—"}
                        </span>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageSearch className="size-4" />
              {locale === "ar" ? "معدات المؤسسة من هذا الموديل" : "Institution Assets for This Model"}
            </CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link
                to="/assets"
                search={{ manufacturerId: "", equipmentTypeId: "", branch: "", year: "", q: "" }}
              >
                {locale === "ar" ? "معدات المؤسسة" : "Institution Equipment"}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {assets.length === 0 && <p className="text-sm text-muted-foreground">{t("state.empty")}</p>}
          {assets.map((asset) => (
            <Link
              key={asset.id}
              to="/assets/$assetId"
              params={{ assetId: asset.id }}
              className="grid grid-cols-[80px_1fr] gap-3 rounded-md border p-3 hover:bg-accent/60"
            >
              <AssetPhoto
                path={asset.image_path}
                fallbackPath={null}
                alt={asset.serial_number}
                className="h-20 w-20 rounded-md"
              />
              <div className="min-w-0 space-y-1">
                <p className="font-mono text-sm font-medium" dir="ltr">S/N {asset.serial_number}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {asset.asset_number || "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[asset.branch, asset.project].filter(Boolean).join(" · ") || "—"}
                </p>
                <Badge variant="outline">{asset.manualCount} {locale === "ar" ? "دليل" : "manuals"}</Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
