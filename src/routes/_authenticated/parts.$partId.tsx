import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Plus, Shuffle, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { catalogRepository } from "@/services/repositories/catalogRepository";
import {
  intelligenceRepository,
  MATCH_TYPES,
  type MatchType,
} from "@/services/repositories/intelligenceRepository";
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
  const access = useAccess(user?.id);
  const queryClient = useQueryClient();
  const [altSearch, setAltSearch] = useState("");
  const [selectedAlt, setSelectedAlt] = useState<{
    id: string;
    primary_part_number: string;
    description: string | null;
  } | null>(null);
  const [matchType, setMatchType] = useState<MatchType>("equivalent");
  const [matchPct, setMatchPct] = useState(95);
  const [note, setNote] = useState("");

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
  const alternates = useQuery({
    queryKey: ["part-alternates", partId],
    enabled: Boolean(part.data),
    queryFn: () => intelligenceRepository.suggestAlternates(partId),
  });
  const altOptions = useQuery({
    queryKey: ["part-alt-search", partId, altSearch],
    enabled: altSearch.trim().length >= 2,
    queryFn: () => intelligenceRepository.searchParts(altSearch.trim(), 8),
  });
  const addAlternate = useMutation({
    mutationFn: () =>
      intelligenceRepository.addPartAlternate({
        partId,
        alternatePartId: selectedAlt!.id,
        matchType,
        matchPct,
        qualityNote: note || null,
      }),
    onSuccess: () => {
      toast.success(t("parts.alternateAdded"));
      setSelectedAlt(null);
      setAltSearch("");
      setMatchType("equivalent");
      setMatchPct(95);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["part-alternates", partId] });
    },
    onError: (error: Error) => {
      if (/duplicate|23505/i.test(error.message)) {
        toast.error(t("parts.alternateExists"));
      } else {
        toast.error(error.message);
      }
    },
  });

  useEffect(() => {
    if (user && part.data) void personalRepository.trackRecent(user.id, "part", partId);
  }, [user, part.data, partId]);

  if (part.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!part.data) return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;

  const { part: row, aliases, compatibility, assemblyParts } = part.data;
  const canManage = Boolean(access.data?.canManageCatalog);

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
          <CardTitle className="flex items-center gap-2 text-base">
            <Shuffle className="size-4" />
            {t("parts.alternatives")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("parts.alternativesHint")}</p>
          {alternates.isPending && <Skeleton className="h-20 w-full" />}
          {alternates.data && alternates.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("parts.noAlternates")}</p>
          )}
          {(alternates.data ?? []).length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {(alternates.data ?? []).map((item) => (
                <div
                  key={`${item.candidate_part_id}-${item.basis}-${item.match_pct}`}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/parts/$partId"
                      params={{ partId: item.candidate_part_id }}
                      className="truncate font-mono text-sm font-semibold text-primary hover:underline"
                    >
                      {item.primary_part_number}
                    </Link>
                    <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
                      {item.match_pct}%
                    </Badge>
                  </div>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="presentation"
                  >
                    <div
                      className={
                        item.match_pct >= 90
                          ? "h-full rounded-full bg-primary"
                          : item.match_pct >= 70
                            ? "h-full rounded-full bg-amber-500"
                            : "h-full rounded-full bg-muted-foreground"
                      }
                      style={{ width: `${Math.max(0, Math.min(100, item.match_pct))}%` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.description ?? "—"} · {item.manufacturer_name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge variant="outline" className="text-[10px]">
                      {t(`matchType.${item.match_type}` as never)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {basisLabel(item.basis, t)}
                    </Badge>
                    {item.curated && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("parts.qualityNote")}
                      </Badge>
                    )}
                  </div>
                  {item.model_models.length > 0 && (
                    <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
                      {t("parts.forModels")}: {item.model_models.join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4" />
              {t("parts.addAlternateTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("parts.addAlternate")}</p>
              <Input
                value={altSearch}
                onChange={(event) => setAltSearch(event.target.value)}
                placeholder={t("parts.alternatePart")}
                className="font-mono text-xs"
              />
              {altOptions.isFetching && (
                <p className="text-xs text-muted-foreground">{t("search.running")}</p>
              )}
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {(altOptions.data ?? []).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedAlt(option)}
                    className={`block w-full rounded-md border p-2 text-start ${
                      selectedAlt?.id === option.id
                        ? "border-primary bg-accent/60"
                        : "border-border"
                    }`}
                  >
                    <p className="truncate font-mono text-xs font-medium">
                      {option.primary_part_number}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {option.description ?? "—"} · {option.manufacturer?.name ?? ""}
                    </p>
                  </button>
                ))}
              </div>
              {selectedAlt && (
                <p className="rounded-md border border-primary/40 bg-accent/40 p-2 font-mono text-xs">
                  {selectedAlt.primary_part_number} — {selectedAlt.description ?? "—"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Select value={matchType} onValueChange={(value) => setMatchType(value as MatchType)}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder={t("parts.alternateMatchType")} />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`matchType.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={matchPct}
                  onChange={(event) => setMatchPct(Number(event.target.value))}
                  placeholder={t("parts.alternateMatchPct")}
                  className="font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("parts.alternateQualityNote")}
                className="text-xs"
              />
              <Button
                type="button"
                className="w-full"
                disabled={!selectedAlt || addAlternate.isPending}
                onClick={() => addAlternate.mutate()}
              >
                {t("parts.addAlternate")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

function basisLabel(basis: string, t: ReturnType<typeof useI18n>["t"]): string {
  switch (basis) {
    case "curated":
      return t("parts.basis.curated");
    case "curated (reverse)":
      return t("parts.basis.curatedReverse");
    case "supersession":
      return t("parts.basis.supersession");
    case "cross_oem":
      return t("parts.basis.crossOem");
    default:
      return basis;
  }
}
