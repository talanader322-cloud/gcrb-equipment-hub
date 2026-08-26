import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Star } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import { personalRepository } from "@/services/repositories/personalRepository";

export const Route = createFileRoute("/_authenticated/parts/$partId")({
  head: () => ({
    meta: [
      { title: "بطاقة قطعة الغيار | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Part number details, alternates and machine compatibility.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PartPage,
});

function PartPage() {
  const { partId } = Route.useParams();
  const { t } = useI18n();
  const { user } = useSession();
  const queryClient = useQueryClient();

  const part = useQuery({
    queryKey: ["part", partId],
    queryFn: () => catalogRepository.getPart(partId),
  });
  const favorite = useQuery({
    queryKey: ["favorite", "part", partId],
    enabled: Boolean(user),
    queryFn: () => personalRepository.isFavorite("part", partId),
  });
  const toggleFavorite = useMutation({
    mutationFn: () => personalRepository.toggleFavorite(user!.id, "part", partId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorite", "part", partId] }),
  });

  useEffect(() => {
    if (user && part.data) void personalRepository.trackRecent(user.id, "part", partId);
  }, [user, part.data, partId]);

  if (part.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!part.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { part: row, aliases, compatibility, assemblyParts } = part.data;

  async function copyNumber() {
    await navigator.clipboard.writeText(row.primary_part_number);
    toast.success(t("action.copied"));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {row.primary_part_number}
          </h1>
          <p className="text-sm text-muted-foreground">
            {row.description ?? "—"} · {row.manufacturer?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyNumber}>
            <Copy className="me-2 size-4" />
            {t("action.copy")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => toggleFavorite.mutate()}>
            <Star className={favorite.data ? "me-2 size-4 fill-current" : "me-2 size-4"} />
            {favorite.data ? t("action.unfavorite") : t("action.favorite")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("entity.alternateNumbers")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {aliases.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("state.none")}</p>
            )}
            {aliases.map((alias) => (
              <Badge key={alias.id} variant="outline" className="font-mono">
                {alias.alternate_number}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("entity.compatibleModels")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {compatibility.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("state.none")}</p>
            )}
            {compatibility.map((item) => {
              const model = (item as { machine_model: { id: string; model_name: string } | null })
                .machine_model;
              const range = (item as { serial_range: { display_value: string | null } | null })
                .serial_range;
              if (!model) return null;
              return (
                <div key={item.id} className="flex items-center justify-between gap-2">
                  <Link
                    to="/models/$modelId"
                    params={{ modelId: model.id }}
                    className="font-mono text-sm text-primary hover:underline"
                  >
                    {model.model_name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {range?.display_value ?? item.notes ?? ""}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("entity.assemblies")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {assemblyParts.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("state.none")}</p>
          )}
          {assemblyParts.map((item) => {
            const assembly = (
              item as {
                assembly: {
                  id: string;
                  title: string;
                  assembly_number: string | null;
                  catalog: { id: string; title: string } | null;
                } | null;
              }
            ).assembly;
            const superseded = (
              item as { superseded_by: { id: string; primary_part_number: string } | null }
            ).superseded_by;
            if (!assembly) return null;
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <Link
                    to="/assemblies/$assemblyId"
                    params={{ assemblyId: assembly.id }}
                    className="truncate text-sm font-medium text-primary hover:underline"
                  >
                    {assembly.assembly_number ? `${assembly.assembly_number} · ` : ""}
                    {assembly.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {assembly.catalog?.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span>
                    {t("entity.position")}: {item.position_number ?? "—"}
                  </span>
                  <span>
                    {t("entity.quantity")}: {item.quantity ?? "—"}
                  </span>
                  {superseded && (
                    <Link to="/parts/$partId" params={{ partId: superseded.id }}>
                      <Badge variant="secondary">
                        {t("entity.supersededBy")}: {superseded.primary_part_number}
                      </Badge>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
