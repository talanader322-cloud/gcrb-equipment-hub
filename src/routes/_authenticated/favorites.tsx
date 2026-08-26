import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { EntityLinkList } from "@/components/EntityLinkList";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { personalRepository } from "@/services/repositories/personalRepository";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({
    meta: [
      { title: "المفضلة | GCRB Equipment Catalog" },
      { name: "description", content: "Saved machines, catalogs and parts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { t } = useI18n();
  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => personalRepository.listFavorites(),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.favorites")}</h1>
      {favorites.isLoading && <Skeleton className="h-32 w-full" />}
      <Card>
        <CardContent className="space-y-2 p-4">
          <EntityLinkList
            items={
              favorites.data?.map((row) => ({
                id: row.id,
                entityType: row.entity_type,
                entityId: row.entity_id,
                timestamp: row.created_at,
              })) ?? []
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
