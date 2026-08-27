import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ImageIcon, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
      { name: "description", content: "Exploded diagram and linked assembly parts list." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssemblyPage,
});

function AssemblyPage() {
  const { assemblyId } = Route.useParams();
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedDiagram, setSelectedDiagram] = useState(0);

  const assembly = useQuery({
    queryKey: ["assembly", assemblyId],
    queryFn: () => catalogRepository.getAssembly(assemblyId),
  });

  const filteredParts = useMemo(() => {
    const rows = assembly.data?.parts ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((item) =>
      `${item.position_number ?? ""} ${item.part?.primary_part_number ?? ""} ${item.part?.description ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [assembly.data?.parts, query]);

  if (assembly.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!assembly.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { assembly: row, parts, diagrams } = assembly.data;
  const activeDiagram = diagrams[selectedDiagram] ?? diagrams[0] ?? null;
  const selectedItem = parts.find((item) => item.id === selectedPartId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <Badge variant="outline">
          {parts.length} {locale === "ar" ? "قطعة" : "parts"}
        </Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-3">
            <CardTitle className="text-base">
              {locale === "ar" ? "الرسم التفصيلي Exploded View" : "Exploded diagram"}
            </CardTitle>
            {diagrams.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {diagrams.map((diagram, index) => (
                  <button
                    key={diagram.id}
                    type="button"
                    className={`rounded border px-2 py-1 text-xs ${selectedDiagram === index ? "bg-primary text-primary-foreground" : "bg-background"}`}
                    onClick={() => setSelectedDiagram(index)}
                  >
                    {diagram.page_number ? `P.${diagram.page_number}` : index + 1}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {activeDiagram?.image_url ? (
              <div className="relative flex min-h-[58vh] items-center justify-center overflow-auto rounded-md border bg-white p-4">
                <img
                  src={activeDiagram.image_url}
                  alt={activeDiagram.title ?? row.title}
                  className="max-h-[68vh] max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex min-h-[58vh] flex-col items-center justify-center gap-3 rounded-md border border-dashed text-center text-muted-foreground">
                <ImageIcon className="size-10" />
                <div>
                  <p className="text-sm font-medium">
                    {locale === "ar" ? "لا توجد صورة رسم مرتبطة بعد" : "No diagram image attached yet"}
                  </p>
                  <p className="mt-1 text-xs">
                    {locale === "ar"
                      ? "يمكن لمدير الكتالوج ربط صورة الرسم أو استيرادها من الكتالوج."
                      : "A catalog manager can attach or import the exploded diagram image."}
                  </p>
                </div>
              </div>
            )}
            {activeDiagram && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{activeDiagram.title ?? row.title}</span>
                {activeDiagram.page_number && <span>· {t("viewer.page")} {activeDiagram.page_number}</span>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader className="space-y-3 p-3">
              <CardTitle className="text-base">{t("entity.parts")}</CardTitle>
              <div className="relative">
                <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={locale === "ar" ? "بحث برقم الموضع أو القطعة..." : "Search position or part number..."}
                  className="ps-8"
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[46vh] overflow-auto p-0">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>{t("entity.position")}</TableHead>
                    <TableHead>{t("entity.partNumber")}</TableHead>
                    <TableHead>{t("entity.description")}</TableHead>
                    <TableHead>{t("entity.quantity")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredParts.map((item) => (
                    <TableRow
                      key={item.id}
                      className={`cursor-pointer ${selectedPartId === item.id ? "bg-accent" : ""}`}
                      onClick={() => setSelectedPartId(item.id)}
                    >
                      <TableCell>
                        <Badge variant={selectedPartId === item.id ? "default" : "outline"} className="font-mono">
                          {item.position_number ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.part?.primary_part_number ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[230px] truncate text-xs">
                        {item.part?.description ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.quantity ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm">
                {locale === "ar" ? "تفاصيل القطعة المحددة" : "Selected part details"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {selectedItem?.part ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge className="font-mono text-base">{selectedItem.position_number ?? "—"}</Badge>
                    <span className="font-mono text-lg font-semibold">
                      {selectedItem.part.primary_part_number}
                    </span>
                  </div>
                  <p className="text-sm">{selectedItem.part.description ?? "—"}</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("entity.quantity")}</span>
                    <span className="font-mono">{selectedItem.quantity ?? "—"}</span>
                  </div>
                  <ButtonLink partId={selectedItem.part.id} label={locale === "ar" ? "فتح بطاقة القطعة" : "Open part card"} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "اختر قطعة من الجدول لعرض بياناتها وربطها بالرسم."
                    : "Select a part from the table to inspect it and correlate it with the diagram."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ButtonLink({ partId, label }: { partId: string; label: string }) {
  return (
    <Link
      to="/parts/$partId"
      params={{ partId }}
      className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      {label}
    </Link>
  );
}
