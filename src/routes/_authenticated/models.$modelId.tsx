import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import { personalRepository } from "@/services/repositories/personalRepository";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/models/$modelId")({
  head: () => ({
    meta: [
      { title: "بطاقة الموديل | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Machine model details, serial ranges and related catalogs.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ModelPage,
});

function ModelPage() {
  const { modelId } = Route.useParams();
  const { t, locale } = useI18n();
  const { user } = useSession();

  const model = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => catalogRepository.getModel(modelId),
  });

  useEffect(() => {
    if (user && model.data) void personalRepository.trackRecent(user.id, "machine_model", modelId);
  }, [user, model.data, modelId]);

  if (model.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!model.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { model: row, aliases, serialRanges, catalogs, compatibility } = model.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{row.model_name}</h1>
        <Badge variant="outline">{row.manufacturer?.name}</Badge>
        {row.equipment_type && (
          <Badge variant="secondary">
            {locale === "ar"
              ? (row.equipment_type.name_ar ?? row.equipment_type.name)
              : row.equipment_type.name}
          </Badge>
        )}
      </div>
      {row.description && (
        <p className="max-w-3xl text-sm text-muted-foreground">{row.description}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("entity.serialRanges")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {serialRanges.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("state.none")}</p>
            )}
            {serialRanges.map((range) => (
              <div key={range.id} className="rounded-md border border-border p-2">
                <p className="font-mono text-sm">
                  {range.display_value ??
                    `${range.serial_prefix ?? ""}${range.serial_from ?? ""}–${range.serial_to ?? ""}`}
                </p>
                {range.notes && <p className="text-xs text-muted-foreground">{range.notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("entity.aliases")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {aliases.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("state.none")}</p>
            )}
            {aliases.map((alias) => (
              <Badge key={alias.id} variant="outline" className="font-mono">
                {alias.alias}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("entity.catalogs")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {catalogs.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("state.empty")}</p>
          )}
          {catalogs.map((catalog) => (
            <Link
              key={catalog.id}
              to="/catalogs/$catalogId"
              params={{ catalogId: catalog.id }}
              className="rounded-md border border-border p-3 hover:bg-accent/60"
            >
              <p className="text-sm font-medium">{catalog.title}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {catalog.catalog_number ?? "—"} · {catalog.language}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("entity.parts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("entity.partNumber")}</TableHead>
                <TableHead>{t("entity.description")}</TableHead>
                <TableHead>{t("entity.notes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compatibility.map((item) => {
                const part = (
                  item as {
                    part: {
                      id: string;
                      primary_part_number: string;
                      description: string | null;
                    } | null;
                  }
                ).part;
                if (!part) return null;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">
                      <Link
                        to="/parts/$partId"
                        params={{ partId: part.id }}
                        className="text-primary hover:underline"
                      >
                        {part.primary_part_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{part.description ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
