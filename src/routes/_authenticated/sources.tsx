import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PlugZap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { testSource } from "@/lib/online.functions";
import { sourcesRepository } from "@/services/repositories/sourcesRepository";

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({
    meta: [
      { title: "المصادر الإلكترونية | GCRB Equipment Catalog" },
      {
        name: "description",
        content: "Modular connectors for approved external equipment catalog sources.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const { t, formatDate } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const queryClient = useQueryClient();
  const runTest = useServerFn(testSource);

  const sources = useQuery({ queryKey: ["sources"], queryFn: () => sourcesRepository.list() });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      sourcesRepository.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: (sourceId: string) => runTest({ data: { sourceId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`${t("sources.testOk")} — ${result.message}`);
      else toast.error(`${t("sources.testFail")} — ${result.message}`);
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("sources.title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("sources.subtitle")}</p>
      </div>

      {sources.isLoading && <Skeleton className="h-40 w-full" />}

      <div className="grid gap-4 md:grid-cols-2">
        {sources.data?.map((source) => (
          <Card key={source.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {source.name}
                  {source.connector_key === "demo" && (
                    <Badge variant="secondary">{t("sources.demoBadge")}</Badge>
                  )}
                </CardTitle>
                <p className="font-mono text-xs text-muted-foreground">{source.connector_key}</p>
              </div>
              <Switch
                checked={source.enabled}
                disabled={!access.data?.isAdmin}
                onCheckedChange={(enabled) => toggle.mutate({ id: source.id, enabled })}
              />
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <Row label={t("sources.type")} value={source.source_type} />
              <Row label={t("sources.priority")} value={String(source.priority)} />
              <Row label={t("sources.baseUrl")} value={source.base_url ?? "—"} mono />
              <Row
                label={t("sources.requiresAuth")}
                value={source.requires_authentication ? t("sources.enabled") : t("sources.disabled")}
              />
              <Row
                label={t("sources.lastSuccess")}
                value={source.last_success_at ? formatDate(source.last_success_at) : t("sources.never")}
              />
              {source.last_error && (
                <p className="rounded-md bg-destructive/10 p-2 font-mono text-destructive">
                  {t("sources.lastError")}: {source.last_error}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={test.isPending}
                onClick={() => test.mutate(source.id)}
              >
                <PlugZap className="me-2 size-4" />
                {t("sources.status")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t("sources.credentialsNote")} {t("sources.demoNote")}
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "truncate font-mono" : "truncate"}>{value}</span>
    </div>
  );
}
