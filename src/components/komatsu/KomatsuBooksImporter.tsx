import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Database, ExternalLink, Loader2, Play, Search, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
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
import {
  loadCachedBookList,
  loadCachedBookMeta,
  loadImportedBooks,
  normalizeKeys,
  resolveBookTitles,
  runKomatsuImport,
  scanKomatsuBooks,
  type BookImportEvent,
  type KomatsuBookRef,
  type ScannedBookMeta,
} from "@/lib/komatsuBooks";
import { catalogRepository } from "@/services/repositories/catalogRepository";

function fill(template: string, args: Record<string, string>): string {
  return Object.entries(args).reduce(
    (acc, [key, value]) => acc.replace(`{${key}}`, value),
    template,
  );
}

function KomatsuBooksImporterView() {
  const { t } = useI18n();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const access = useAccess(user?.id);

  const [books, setBooks] = useState<KomatsuBookRef[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [mirrorImages, setMirrorImages] = useState(true);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<{ book: string; done: number; total: number } | null>(
    null,
  );
  const [summary, setSummary] = useState<{ books: number; pages: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logLinesRef = useRef<ReactNode[]>([]);
  const lastLogFlush = useRef(0);
  const [, setLogVersion] = useState(0);
  const [meta, setMeta] = useState<Record<string, ScannedBookMeta>>({});
  const [resolvingTitles, setResolvingTitles] = useState(false);
  const [titleProgress, setTitleProgress] = useState<{ done: number; total: number } | null>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);

  const komatsu = useQuery({
    queryKey: ["manufacturer", "komatsu"],
    queryFn: () => catalogRepository.findManufacturerByName("Komatsu"),
  });
  const imported = useQuery({
    queryKey: ["imported-books"],
    queryFn: () => loadImportedBooks(),
  });
  const myModels = useQuery({
    queryKey: ["my-model-names"],
    queryFn: () => catalogRepository.listOrgModelNames(),
    enabled: onlyMine,
  });

  const pushLog = useCallback((line: ReactNode) => {
    logLinesRef.current.push(
      <span key={logLinesRef.current.length} dir="ltr" className="block">
        <span className="text-muted-foreground">{new Date().toLocaleTimeString()}</span> {line}
      </span>,
    );
    if (logLinesRef.current.length > 400) logLinesRef.current.shift();
    const now = Date.now();
    if (now - lastLogFlush.current > 200) {
      lastLogFlush.current = now;
      setLogVersion((version) => version + 1);
    }
  }, []);

  const handleEvent = useCallback(
    (event: BookImportEvent) => {
      if (event.type === "scan") {
        pushLog(fill(t("books.booksFound"), { count: String(event.totalBooks) }));
      } else if (event.type === "books") {
        setCurrent({ book: event.bookRef, done: event.done, total: event.total });
        pushLog(
          fill(t("books.importing"), {
            book: event.bookRef,
            done: String(event.done),
            total: String(event.total),
          }),
        );
      } else if (event.type === "pages") {
        const step = Math.max(1, Math.ceil(event.total / 40));
        if (event.done % step === 0 || event.done === event.total) {
          setCurrent({ book: event.bookRef, done: event.done, total: event.total });
        }
      } else if (event.type === "log") {
        pushLog(event.message);
      } else if (event.type === "done") {
        setSummary({ books: event.books, pages: event.pages });
        pushLog(
          fill(t("books.doneAll"), { books: String(event.books), pages: String(event.pages) }),
        );
        setRunning(false);
        void queryClient.invalidateQueries({ queryKey: ["imported-books"] });
        void queryClient.invalidateQueries({ queryKey: ["catalogs"] });
        toast.success(
          fill(t("books.doneAll"), { books: String(event.books), pages: String(event.pages) }),
        );
      } else if (event.type === "error") {
        pushLog(<span className="text-destructive">error: {event.message}</span>);
      }
    },
    [pushLog, queryClient, t],
  );

  const startResolveTitles = useCallback(
    (scanned: KomatsuBookRef[]) => {
      const controller = new AbortController();
      resolveAbortRef.current = controller;
      setResolvingTitles(true);
      setTitleProgress({ done: 0, total: scanned.length });
      void resolveBookTitles(scanned, {
        signal: controller.signal,
        onProgress: (done, total) => setTitleProgress({ done, total }),
      })
        .then((resolved) => {
          if (controller.signal.aborted) return;
          setMeta(resolved);
          pushLog(fill(t("books.titleResolved"), { count: String(scanned.length) }));
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          pushLog(
            <span className="text-destructive">
              titles: {err instanceof Error ? err.message : String(err)}
            </span>,
          );
        })
        .finally(() => {
          if (resolveAbortRef.current === controller) resolveAbortRef.current = null;
          setResolvingTitles(false);
          setTitleProgress(null);
        });
    },
    [pushLog, t],
  );

  const doScan = useMutation({
    mutationFn: () => scanKomatsuBooks(),
    onMutate: () => {
      setScanning(true);
      setSummary(null);
      pushLog("scan: listing remote books…");
    },
    onSuccess: (scanned) => {
      setBooks(scanned);
      setScanning(false);
      pushLog(fill(t("books.booksFound"), { count: String(scanned.length) }));
      toast.success(fill(t("books.booksFound"), { count: String(scanned.length) }));
      startResolveTitles(scanned);
    },
    onError: (error: Error) => {
      setScanning(false);
      pushLog(<span className="text-destructive">scan failed: {error.message}</span>);
      toast.error(fill(t("books.error"), { message: error.message }));
    },
  });

  const runImport = useMutation({
    mutationFn: async (selected: KomatsuBookRef[]) => {
      const manufacturerId = komatsu.data?.id;
      if (!manufacturerId) throw new Error("Komatsu manufacturer not found in the database.");
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setSummary(null);
      await runKomatsuImport({
        manufacturerId,
        mirrorImages,
        ...(onlyMine && (myModels.data?.length ?? 0) > 0
          ? { onlyModels: myModels.data ?? [] }
          : {}),
        books: selected,
        signal: controller.signal,
        onEvent: handleEvent,
      });
    },
    onSettled: () => {
      abortRef.current = null;
      setCurrent(null);
      setRunning(false);
    },
    onError: (error: Error) => {
      pushLog(<span className="text-destructive">import: {error.message}</span>);
      toast.error(fill(t("books.error"), { message: error.message }));
    },
  });

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      resolveAbortRef.current?.abort();
    };
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const scanned = books ?? [];
  const filterActive = filter.trim().length > 0;
  const filtered = scanned.filter((b) => {
    if (!filterActive) return true;
    const q = normalizeKeys(filter);
    if (!q) return true;
    if (normalizeKeys(b.book).includes(q)) return true;
    const m = meta[b.book];
    if (m && (normalizeKeys(m.title).includes(q) || normalizeKeys(m.text).includes(q))) return true;
    return false;
  });
  const importedMap = imported.data;
  const allPendingCount = scanned.filter((b) => !importedMap?.has(`kbp_json:${b.book}`)).length;
  const emptyFilter = filterActive && filtered.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-4" />
          {t("books.tab")}
        </CardTitle>
        <CardDescription>{t("books.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!access.data?.canManageCatalog && (
          <p className="text-sm text-amber-600">{t("books.managerOnly")}</p>
        )}

        {komatsu.data === null && !komatsu.isLoading && (
          <p className="text-sm text-destructive">
            {fill(t("books.error"), {
              message:
                "Komatsu is missing from the Manufacturers list — add it in Administration first.",
            })}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-filter">{t("books.filter")}</Label>
            <Input
              id="book-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-56"
              placeholder="1, 12, 145..."
              dir="ltr"
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
            <Label htmlFor="only-mine">{t("books.onlyMine")}</Label>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch id="mirror-images" checked={mirrorImages} onCheckedChange={setMirrorImages} />
            <Label htmlFor="mirror-images">{t("books.mirrorImages")}</Label>
          </div>
          <div className="flex items-center gap-2 pb-1 ms-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={scanning || running || !access.data?.canManageCatalog}
              onClick={() => doScan.mutate()}
            >
              {scanning ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Database className="me-2 size-4" />
              )}
              {t("books.scan")}
            </Button>
            {!running ? (
              <div className="flex items-center gap-2">
                {filterActive && filtered.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!access.data?.canManageCatalog || !komatsu.data}
                    onClick={() => runImport.mutate(filtered)}
                  >
                    <Search className="me-2 size-4" />
                    {fill(t("books.importSearchResults"), { count: String(filtered.length) })}
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={!access.data?.canManageCatalog || !komatsu.data || scanned.length === 0}
                  onClick={() => runImport.mutate(scanned)}
                >
                  <Play className="me-2 size-4" />
                  {filterActive ? t("books.importAllScanned") : t("books.importAll")}
                  {allPendingCount > 0 && ` (${allPendingCount})`}
                </Button>
              </div>
            ) : (
              <Button variant="destructive" size="sm" onClick={stop}>
                <Square className="me-2 size-4" />
                {t("books.stop")}
              </Button>
            )}
          </div>
        </div>

        {scanning && (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="me-2 inline size-4 animate-spin" />
            {t("books.scanning")}
          </p>
        )}

        {current && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground" dir="ltr">
              <span>
                {fill(t("books.importing"), {
                  book: current.book,
                  done: String(current.done),
                  total: String(current.total),
                })}
              </span>
              <span>
                {current.total > 0 ? Math.round((current.done / current.total) * 100) : 0}%
              </span>
            </div>
            <Progress value={current.total > 0 ? (current.done / current.total) * 100 : 0} />
          </div>
        )}

        {summary && (
          <p className="text-sm text-muted-foreground" dir="ltr">
            ✓ {summary.books} books · {summary.pages} pages
          </p>
        )}

        {resolvingTitles && titleProgress && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {fill(t("books.resolvingTitles"), {
              done: String(titleProgress.done),
              total: String(titleProgress.total),
            })}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => resolveAbortRef.current?.abort()}
            >
              {t("books.stop")}
            </Button>
          </p>
        )}

        {books === null ? (
          <p className="text-sm text-muted-foreground">{t("books.chooseFirst")}</p>
        ) : emptyFilter ? (
          <p className="text-sm text-muted-foreground">
            {fill(t("books.emptyFilterHint"), { query: filter })}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("books.noBooks")}</p>
        ) : (
          <ScrollArea className="h-72 rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("books.bookNo")}</TableHead>
                  <TableHead>{t("books.titleColumn")}</TableHead>
                  <TableHead>{t("import.jobStatus")}</TableHead>
                  <TableHead className="text-end">{t("action.open")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const catalogId = importedMap?.get(`kbp_json:${b.book}`);
                  const isCurrent = current?.book === b.book;
                  const bookMeta = meta[b.book];
                  const showTitle =
                    bookMeta?.title && normalizeKeys(bookMeta.title) !== normalizeKeys(b.book)
                      ? bookMeta.title
                      : null;
                  return (
                    <TableRow key={b.book}>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {b.book}
                      </TableCell>
                      <TableCell
                        className="max-w-64 truncate text-xs text-muted-foreground"
                        dir="auto"
                      >
                        {showTitle ?? "—"}
                      </TableCell>
                      <TableCell>
                        {isCurrent ? (
                          <Badge variant="secondary">
                            <Loader2 className="me-1 size-3 animate-spin" />
                            {t("books.importing").split(" ")[0]}
                          </Badge>
                        ) : catalogId ? (
                          <Badge>
                            <span className="me-1">✓</span>
                            {t("books.imported")}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{t("books.pending")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        {catalogId && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={`/catalogs/${catalogId}`}>
                              <ExternalLink className="me-1 size-3" />
                              {t("action.open")}
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("books.log")}</p>
          <ScrollArea className="h-32 rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px]">
            {logLinesRef.current.length === 0 ? (
              <p className="text-muted-foreground">—</p>
            ) : (
              logLinesRef.current.map((line, index) => (
                <p key={index} className="text-xs" dir="ltr">
                  {line}
                </p>
              ))
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

export function KomatsuBooksImporter() {
  return <KomatsuBooksImporterView />;
}
