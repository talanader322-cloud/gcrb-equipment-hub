import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CloudDownload, Database } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { importOnlineResult, previewOnlineImport } from "@/lib/online.functions";
import { adminRepository } from "@/services/repositories/adminRepository";
import { sourcesRepository } from "@/services/repositories/sourcesRepository";

export const Route = createFileRoute("/_authenticated/import")({
  validateSearch: (search: Record<string, unknown>) => ({
    sourceId: typeof search["sourceId"] === "string" ? (search["sourceId"] as string) : "",
    externalId: typeof search["externalId"] === "string" ? (search["externalId"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "مركز الاستيراد | GCRB Equipment Catalog" },
      { name: "description", content: "Review and import verified external catalog records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const { t, formatDate } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sourceId, externalId } = Route.useSearch();

  const preview = useServerFn(previewOnlineImport);
  const runImport = useServerFn(importOnlineResult);

  const temporary = useQuery({
    queryKey: ["temporary-results"],
    queryFn: () => sourcesRepository.listTemporaryResults(),
  });
  const jobs = useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => adminRepository.listImportJobs(),
  });

  const previewQuery = useQuery({
    queryKey: ["import-preview", sourceId, externalId],
    enabled: Boolean(sourceId && externalId),
    queryFn: () => preview({ data: { sourceId, externalId } }),
  });

  const doImport = useMutation({
    mutationFn: () =>
      runImport({ data: { sourceId, externalId, duplicateStrategy: "link" as const } }),
    onSuccess: () => {
      toast.success(t("import.imported"));
      void queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["catalogs"] });
    },
    onError: (error: Error) => toast.error(`${t("import.importFailed")}: ${error.message}`),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("import.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("import.subtitle")}</p>
      </div>

      <Tabs defaultValue="online">
        <TabsList>
          <TabsTrigger value="online">{t("import.tabOnline")}</TabsTrigger>
          <TabsTrigger value="jobs">{t("import.tabJobs")}</TabsTrigger>
        </TabsList>

        <TabsContent value="online" className="space-y-4">
          {sourceId && externalId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CloudDownload className="size-4" />
                  {t("import.preview")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {previewQuery.isLoading && <Skeleton className="h-24 w-full" />}
                {previewQuery.data && (
                  <>
                    <p className="text-sm font-medium">{previewQuery.data.result.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {previewQuery.data.result.manufacturer ?? "—"} ·{" "}
                      {previewQuery.data.result.model ?? "—"} ·{" "}
                      {previewQuery.data.result.partNumber ?? "—"}
                    </p>
                    <div className="rounded-md border border-border p-3 text-xs">
                      <p className="font-medium">{t("import.duplicateCheck")}</p>
                      {Object.values(previewQuery.data.duplicates).some(Boolean) ? (
                        <p className="text-muted-foreground">{t("import.duplicateFound")}</p>
                      ) : (
                        <p className="text-muted-foreground">{t("import.noDuplicate")}</p>
                      )}
                    </div>
                    {!previewQuery.data.importable && (
                      <p className="text-xs text-destructive">{t("import.notPermitted")}</p>
                    )}
                    <Button
                      size="sm"
                      disabled={
                        !previewQuery.data.importable ||
                        !access.data?.canManage ||
                        doImport.isPending
                      }
                      onClick={() => doImport.mutate()}
                    >
                      <Database className="me-2 size-4" />
                      {t("action.import")}
                    </Button>
                    {!access.data?.canManage && (
                      <p className="text-xs text-muted-foreground">{t("admin.noPermission")}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("import.temporaryResults")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {temporary.isLoading && <Skeleton className="h-24 w-full" />}
              {temporary.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("import.noTemporary")}</p>
              )}
              {temporary.data?.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.title ?? row.external_id}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {row.manufacturer ?? "—"} · {row.model ?? "—"} · {row.part_number ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{row.result_type}</Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        navigate({
                          to: "/import",
                          search: { sourceId: row.source_id, externalId: row.external_id },
                        })
                      }
                    >
                      {t("import.preview")}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("import.jobStatus")}</TableHead>
                    <TableHead>{t("import.records")}</TableHead>
                    <TableHead>{t("entity.createdAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.data?.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Badge variant={job.status === "completed" ? "default" : "outline"}>
                          {job.status === "completed" && <CheckCircle2 className="me-1 size-3" />}
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {job.imported_records}/{job.total_records} · {job.failed_records}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(job.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {jobs.data?.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {t("import.noJobs")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
