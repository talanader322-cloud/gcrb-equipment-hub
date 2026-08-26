import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

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
import { useI18n } from "@/lib/i18n";
import { catalogRepository } from "@/services/repositories/catalogRepository";

export const Route = createFileRoute("/_authenticated/assemblies/$assemblyId")({
  head: () => ({
    meta: [
      { title: "المجموعة الفنية | GCRB Equipment Catalog" },
      { name: "description", content: "Assembly parts list with positions and quantities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssemblyPage,
});

function AssemblyPage() {
  const { assemblyId } = Route.useParams();
  const { t } = useI18n();

  const assembly = useQuery({
    queryKey: ["assembly", assemblyId],
    queryFn: () => catalogRepository.getAssembly(assemblyId),
  });

  if (assembly.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!assembly.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { assembly: row, parts, diagrams } = assembly.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {row.assembly_number ? `${row.assembly_number} · ` : ""}
          {row.title}
        </h1>
        {row.catalog && (
          <Link
            to="/catalogs/$catalogId"
            params={{ catalogId: row.catalog.id }}
            className="font-mono text-xs text-primary hover:underline"
          >
            {row.catalog.catalog_number ?? ""} {row.catalog.title}
          </Link>
        )}
      </div>

      {diagrams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("viewer.thumbnails")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {diagrams.map((diagram) => (
              <div key={diagram.id} className="rounded-md border border-border p-2 text-xs">
                {diagram.title ?? t("viewer.page")} {diagram.page_number ?? ""}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("entity.parts")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("entity.position")}</TableHead>
                <TableHead>{t("entity.partNumber")}</TableHead>
                <TableHead>{t("entity.description")}</TableHead>
                <TableHead>{t("entity.quantity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.position_number ?? "—"}</TableCell>
                  <TableCell className="font-mono">
                    {item.part ? (
                      <Link
                        to="/parts/$partId"
                        params={{ partId: item.part.id }}
                        className="text-primary hover:underline"
                      >
                        {item.part.primary_part_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{item.part?.description ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.quantity ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
