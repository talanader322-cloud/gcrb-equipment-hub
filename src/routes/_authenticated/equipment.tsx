import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Plus, X } from "lucide-react";
import { useState } from "react";

import { NewEquipmentPanel } from "@/components/NewEquipmentPanel";
import { ModelPhoto } from "@/components/models/ModelPhoto";
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
import { catalogRepository } from "@/services/repositories/catalogRepository";

export const Route = createFileRoute("/_authenticated/equipment")({
  validateSearch: (search: Record<string, unknown>) => ({
    manufacturerId:
      typeof search["manufacturerId"] === "string" ? (search["manufacturerId"] as string) : "",
    equipmentTypeId:
      typeof search["equipmentTypeId"] === "string" ? (search["equipmentTypeId"] as string) : "",
    q: typeof search["q"] === "string" ? (search["q"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "المعدات والموديلات | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Machine models, assets, series and serial ranges by manufacturer.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EquipmentPage,
});

function EquipmentPage() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const navigate = Route.useNavigate();
  const { manufacturerId, equipmentTypeId, q } = Route.useSearch();
  const [showNewAsset, setShowNewAsset] = useState(false);
  const canManage = Boolean(access.data?.canManageCatalog);

  const manufacturers = useQuery({
    queryKey: ["manufacturers"],
    queryFn: () => catalogRepository.listManufacturers(),
  });
  const types = useQuery({
    queryKey: ["equipment-types"],
    queryFn: () => catalogRepository.listEquipmentTypes(),
  });
  const models = useQuery({
    queryKey: ["models", manufacturerId, equipmentTypeId, q],
    queryFn: () =>
      catalogRepository.listModels({
        ...(manufacturerId ? { manufacturerId } : {}),
        ...(equipmentTypeId ? { equipmentTypeId } : {}),
        ...(q ? { search: q } : {}),
        pageSize: 60,
      }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.equipment")}</h1>
        {canManage && (
          <Button onClick={() => setShowNewAsset((value) => !value)}>
            {showNewAsset ? <X className="me-2 size-4" /> : <Plus className="me-2 size-4" />}
            {showNewAsset
              ? locale === "ar"
                ? "إغلاق نموذج الإضافة"
                : "Close form"
              : locale === "ar"
                ? "إضافة معدة جديدة وكتالوجاتها"
                : "New equipment & manuals"}
          </Button>
        )}
      </div>

      {showNewAsset && <NewEquipmentPanel onSaved={() => setShowNewAsset(false)} />}

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Input
            defaultValue={q}
            placeholder={t("filter.model")}
            className="max-w-xs font-mono"
            onChange={(event) =>
              navigate({ to: ".", search: (prev) => ({ ...prev, q: event.target.value }) })
            }
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
          <Select
            value={equipmentTypeId || "any"}
            onValueChange={(value) =>
              navigate({
                to: ".",
                search: (prev) => ({ ...prev, equipmentTypeId: value === "any" ? "" : value }),
              })
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("filter.equipmentType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("filter.any")}</SelectItem>
              {types.data?.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {locale === "ar" ? (item.name_ar ?? item.name) : item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {models.isLoading && <Skeleton className="h-40 w-full" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.data?.rows.map((row) => (
          <Link key={row.id} to="/models/$modelId" params={{ modelId: row.id }}>
            <Card className="h-full overflow-hidden transition-colors hover:border-primary">
              <ModelPhoto
                imagePath={row.image_path}
                imageUrl={row.image_url}
                equipmentTypeSlug={row.equipment_type?.slug ?? null}
                alt={row.model_name}
                className="aspect-[16/9] w-full border-b border-border bg-muted/40 object-cover"
                iconClassName="size-8"
              />
              <CardContent className="space-y-1 p-4">
                <p className="font-mono text-base font-semibold">{row.model_name}</p>
                <p className="text-xs text-muted-foreground">{row.manufacturer?.name}</p>
                <div className="flex items-center gap-2">
                  {row.equipment_type && (
                    <Badge variant="outline">
                      {locale === "ar"
                        ? (row.equipment_type.name_ar ?? row.equipment_type.name)
                        : row.equipment_type.name}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="gap-1 font-mono">
                    <BookOpen className="size-3" />
                    {models.data?.catalogCounts[row.id] ?? 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {models.data?.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
      )}
    </div>
  );
}
