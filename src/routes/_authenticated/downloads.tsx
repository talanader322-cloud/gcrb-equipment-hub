import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { personalRepository } from "@/services/repositories/personalRepository";

export const Route = createFileRoute("/_authenticated/downloads")({
  head: () => ({
    meta: [
      { title: "التنزيلات | GCRB Equipment Catalog" },
      { name: "description", content: "Catalog documents downloaded for offline field use." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DownloadsPage,
});

function DownloadsPage() {
  const { t, formatDate } = useI18n();
  const downloads = useQuery({
    queryKey: ["downloads"],
    queryFn: () => personalRepository.listDownloads(),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.downloads")}</h1>
      {downloads.isLoading && <Skeleton className="h-32 w-full" />}
      <Card>
        <CardContent className="space-y-2 p-4">
          {downloads.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
          )}
          {downloads.data?.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
            >
              {row.catalog ? (
                <Link
                  to="/catalogs/$catalogId"
                  params={{ catalogId: row.catalog.id }}
                  className="truncate text-sm text-primary hover:underline"
                >
                  {row.catalog.title}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{row.status}</Badge>
                <span className="text-muted-foreground">{formatDate(row.created_at)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
