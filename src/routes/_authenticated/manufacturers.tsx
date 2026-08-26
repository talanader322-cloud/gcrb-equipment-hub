import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Factory } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { catalogRepository } from "@/services/repositories/catalogRepository";

export const Route = createFileRoute("/_authenticated/manufacturers")({
  head: () => ({
    meta: [
      { title: "الشركات المصنعة | GCRB Equipment Catalog" },
      { name: "description", content: "Heavy-equipment manufacturers covered by the catalog." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManufacturersPage,
});

function ManufacturersPage() {
  const { t } = useI18n();
  const manufacturers = useQuery({
    queryKey: ["manufacturers"],
    queryFn: () => catalogRepository.listManufacturers(),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.manufacturers")}</h1>
      {manufacturers.isLoading && <Skeleton className="h-40 w-full" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {manufacturers.data?.map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <Factory className="size-4 text-primary" />
                <p className="text-sm font-semibold">{row.name}</p>
                {row.short_name && <Badge variant="outline">{row.short_name}</Badge>}
              </div>
              {row.official_website && (
                <a
                  href={row.official_website}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-mono text-xs text-primary hover:underline"
                >
                  {row.official_website}
                </a>
              )}
              <Link
                to="/equipment"
                search={{ manufacturerId: row.id, equipmentTypeId: "", q: "" }}
                className="inline-block text-xs font-medium text-primary hover:underline"
              >
                {t("action.viewAll")}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
