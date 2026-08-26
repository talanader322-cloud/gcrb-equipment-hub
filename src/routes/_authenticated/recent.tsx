import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { EntityLinkList } from "@/components/EntityLinkList";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { personalRepository, type EntityType } from "@/services/repositories/personalRepository";

export const Route = createFileRoute("/_authenticated/recent")({
  head: () => ({
    meta: [
      { title: "العناصر الأخيرة | GCRB Equipment Catalog" },
      { name: "description", content: "Recently opened machines, catalogs and parts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecentPage,
});

function RecentPage() {
  const { t } = useI18n();
  const recent = useQuery({
    queryKey: ["recent"],
    queryFn: () => personalRepository.listRecent(50),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.recent")}</h1>
      {recent.isLoading && <Skeleton className="h-32 w-full" />}
      <Card>
        <CardContent className="space-y-2 p-4">
          <EntityLinkList
            items={
              recent.data?.map((row) => ({
                id: row.id,
                entityType: row.entity_type as EntityType,
                entityId: row.entity_id,
                timestamp: row.opened_at,
              })) ?? []
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
