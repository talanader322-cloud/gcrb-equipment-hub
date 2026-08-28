import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, HardHat, Plus, X } from "lucide-react";
import { useState } from "react";

import { AssetPhoto } from "@/components/assets/AssetPhoto";
import { NewEquipmentPanel } from "@/components/NewEquipmentPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { assetRepository } from "@/services/repositories/assetRepository";
import { catalogRepository } from "@/services/repositories/catalogRepository";

export const Route = createFileRoute("/_authenticated/assets/")({
  validateSearch: (search: Record<string, unknown>) => ({
    manufacturerId: typeof search["manufacturerId"] === "string" ? search["manufacturerId"] : "",
    equipmentTypeId: typeof search["equipmentTypeId"] === "string" ? search["equipmentTypeId"] : "",
    branch: typeof search["branch"] === "string" ? search["branch"] : "",
    year: typeof search["year"] === "string" ? search["year"] : "",
    q: typeof search["q"] === "string" ? search["q"] : "",
  }),
  head: () => ({
    meta: [
      { title: "معدات المؤسسة | GCRB Equipment Catalog" },
      {
        name: "description",
        content:
          "Institution-owned machines with serial numbers, asset numbers, branches and original manuals.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const canManage = Boolean(access.data?.canManageCatalog);
  const navigate = Route.useNavigate();
  const { manufacturerId, equipmentTypeId, branch, year, q } = Route.useSearch();
  const [showNew, setShowNew] = useState(false);

  const manufacturers = useQuery({
    queryKey: ["manufacturers"],
    queryFn: () => catalogRepository.listManufacturers(),
  });
  const types = useQuery({
    queryKey: ["equipment-types"],
    queryFn: () => catalogRepository.listEquipmentTypes(),
  });
  const options = useQuery({
    queryKey: ["asset-filter-options"],
    queryFn: () => assetRepository.listFilterOptions(),
  });
  const assets = useQuery({
    queryKey: ["assets", manufacturerId, equipmentTypeId, branch, year, q],
    queryFn: () =>
      assetRepository.listAssets({
        ...(manufacturerId ? { manufacturerId } : {}),
        ...(equipmentTypeId ? { equipmentTypeId } : {}),
        ...(branch ? { branch } : {}),
        ...(year ? { manufactureYear: Number(year) } : {}),
        ...(q ? { search: q } : {}),
      }),
  });

  const modelIds = (assets.data?.rows ?? [])
    .map((row) => row.machine_model?.id)
    .filter((value): value is string => Boolean(value));
  const catalogCounts = useQuery({
    queryKey: ["catalog-counts", "assets", modelIds.slice().sort().join(",")],
    enabled: modelIds.length > 0,
    queryFn: () => catalogRepository.catalogCountsByModel(modelIds),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.assets")}</h1>
          <p className="text-sm text-muted-foreground">{t("assets.subtitle")}</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowNew((value) => !value)}>
            {showNew ? <X className="me-2 size-4" /> : <Plus className="me-2 size-4" />}
            {showNew ? t("action.cancel") : t("assets.new")}
          </Button>
        )}
      </div>

      {showNew && (
        <NewEquipmentPanel
          onSaved={() => {
            setShowNew(false);
            void assets.refetch();
          }}
        />
      )}

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Input
            defaultValue={q}
            dir="ltr"
            placeholder={t("assets.searchPlaceholder")}
            className="max-w-xs font-mono"
            onChange={(event) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, q: event.target.value }) })
            }
          />
          <FilterSelect
            value={manufacturerId}
            placeholder={t("filter.manufacturer")}
            anyLabel={t("filter.any")}
            options={(manufacturers.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
            onChange={(value) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, manufacturerId: value }) })
            }
          />
          <FilterSelect
            value={equipmentTypeId}
            placeholder={t("filter.equipmentType")}
            anyLabel={t("filter.any")}
            options={(types.data ?? []).map((item) => ({
              value: item.id,
              label: locale === "ar" ? (item.name_ar ?? item.name) : item.name,
            }))}
            onChange={(value) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, equipmentTypeId: value }) })
            }
          />
          <FilterSelect
            value={branch}
            placeholder={t("assets.branch")}
            anyLabel={t("filter.any")}
            options={(options.data?.branches ?? []).map((item) => ({ value: item, label: item }))}
            onChange={(value) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, branch: value }) })
            }
          />
          <FilterSelect
            value={year}
            placeholder={t("assets.year")}
            anyLabel={t("filter.any")}
            options={(options.data?.years ?? []).map((item) => ({
              value: String(item),
              label: String(item),
            }))}
            onChange={(value) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, year: value }) })
            }
          />
        </CardContent>
      </Card>

      {assets.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      )}

      {assets.isError && <p className="text-sm text-destructive">{t("state.error")}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assets.data?.rows.map((row) => (
          <Link key={row.id} to="/assets/$assetId" params={{ assetId: row.id }}>
            <Card className="h-full overflow-hidden transition-colors hover:border-primary">
              <AssetPhoto
                path={row.image_path}
                fallbackPath={row.machine_model?.image_url ?? null}
                className="h-36 w-full"
              />
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-base font-semibold" dir="ltr">
                    {row.machine_model?.model_name ?? t("state.none")}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className="gap-1 font-mono">
                      <BookOpen className="size-3" />
                      {catalogCounts.data?.[row.machine_model?.id ?? ""] ?? 0}
                    </Badge>
                    <Badge variant="outline">
                      {row.manualCount} {t("assets.manualsShort")}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.machine_model?.manufacturer?.name ?? t("state.none")}
                  {row.machine_model?.equipment_type
                    ? ` · ${
                        locale === "ar"
                          ? (row.machine_model.equipment_type.name_ar ??
                            row.machine_model.equipment_type.name)
                          : row.machine_model.equipment_type.name
                      }`
                    : ""}
                </p>
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <Meta label={t("assets.serialNumber")} value={row.serial_number} mono />
                  <Meta label={t("assets.assetNumber")} value={row.asset_number} mono />
                  <Meta
                    label={t("assets.year")}
                    value={row.manufacture_year ? String(row.manufacture_year) : null}
                    mono
                  />
                  <Meta label={t("assets.branch")} value={row.branch} />
                  <Meta label={t("assets.project")} value={row.project} />
                </dl>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!assets.isLoading && assets.data?.rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <HardHat className="size-10 text-muted-foreground" />
            <p className="text-base font-medium">{t("assets.emptyTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("assets.emptyBody")}</p>
            {canManage && !showNew && (
              <Button variant="outline" onClick={() => setShowNew(true)}>
                <Plus className="me-2 size-4" />
                {t("assets.new")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  anyLabel,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  anyLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || "any"} onValueChange={(next) => onChange(next === "any" ? "" : next)}>
      <SelectTrigger className="w-[190px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="any">{anyLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono" : ""} dir={mono ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
