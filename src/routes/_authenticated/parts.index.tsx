import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

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

export const Route = createFileRoute("/_authenticated/parts/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? (search["q"] as string) : "",
    manufacturerId:
      typeof search["manufacturerId"] === "string" ? (search["manufacturerId"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "قطع الغيار | GCRB Equipment Catalog" },
      { name: "description", content: "Spare part numbers, descriptions and alternates." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PartsPage,
});

function PartsPage() {
  const { t } = useI18n();
  const navigate = Route.useNavigate();
  const { q, manufacturerId } = Route.useSearch();

  const manufacturers = useQuery({
    queryKey: ["manufacturers"],
    queryFn: () => catalogRepository.listManufacturers(),
  });
  const parts = useQuery({
    queryKey: ["parts", q, manufacturerId],
    queryFn: () =>
      catalogRepository.listParts({
        ...(q ? { search: q } : {}),
        ...(manufacturerId ? { manufacturerId } : {}),
        pageSize: 80,
      }),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.parts")}</h1>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Input
            defaultValue={q}
            placeholder={t("entity.partNumber")}
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
        </CardContent>
      </Card>

      {parts.isLoading && <Skeleton className="h-40 w-full" />}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("entity.partNumber")}</TableHead>
                <TableHead>{t("entity.description")}</TableHead>
                <TableHead>{t("entity.manufacturer")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.data?.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">
                    <Link
                      to="/parts/$partId"
                      params={{ partId: row.id }}
                      className="text-primary hover:underline"
                    >
                      {row.primary_part_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{row.description ?? "—"}</TableCell>
                  <TableCell className="text-sm">{row.manufacturer?.name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {parts.data?.rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("state.empty")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
