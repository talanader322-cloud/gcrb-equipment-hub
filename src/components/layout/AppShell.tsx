import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Cog,
  Database,
  Download,
  Factory,
  FileStack,
  Gauge,
  Globe2,
  Import,
  LogOut,
  Moon,
  Search,
  Shield,
  Star,
  Sun,
  Wrench,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/translations";

type NavItem = { to: string; labelKey: TranslationKey; icon: typeof Gauge };

const CATALOG_NAV: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
  { to: "/search", labelKey: "nav.search", icon: Search },
  { to: "/manufacturers", labelKey: "nav.manufacturers", icon: Factory },
  { to: "/equipment", labelKey: "nav.equipment", icon: Boxes },
  { to: "/assets", labelKey: "nav.assets", icon: HardHat },
  { to: "/catalogs", labelKey: "nav.catalogs", icon: FileStack },
  { to: "/parts", labelKey: "nav.parts", icon: Wrench },
];

const DATA_NAV: NavItem[] = [
  { to: "/sources", labelKey: "nav.onlineSources", icon: Globe2 },
  { to: "/import", labelKey: "nav.importCenter", icon: Import },
];

const PERSONAL_NAV: NavItem[] = [
  { to: "/favorites", labelKey: "nav.favorites", icon: Star },
  { to: "/recent", labelKey: "nav.recent", icon: Clock },
  { to: "/downloads", labelKey: "nav.downloads", icon: Download },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, locale, toggleLocale, dir } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [term, setTerm] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const sources = useQuery({
    queryKey: ["sources-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_sources")
        .select("id, enabled")
        .eq("enabled", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    if (!q) return;
    navigate({ to: "/search", search: { q, scope: "all", manufacturerId: "" } });
  }

  const systemNav: NavItem[] = [
    ...(access.data?.isAdmin
      ? [{ to: "/admin", labelKey: "nav.administration" as TranslationKey, icon: Shield }]
      : []),
    { to: "/settings", labelKey: "nav.settings", icon: Cog },
  ];

  const groups: { titleKey: TranslationKey; items: NavItem[] }[] = [
    { titleKey: "nav.catalogSection", items: CATALOG_NAV },
    { titleKey: "nav.dataSection", items: DATA_NAV },
    { titleKey: "nav.personalSection", items: PERSONAL_NAV },
    { titleKey: "nav.systemSection", items: systemNav },
  ];

  return (
    <div className="flex min-h-screen bg-background" dir={dir}>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-e border-sidebar-border bg-sidebar md:flex",
          collapsed ? "w-[68px]" : "w-72",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Database className="size-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                {t("app.name")}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{t("app.org")}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {groups.map((group) => (
            <div key={group.titleKey}>
              {!collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(group.titleKey)}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                      )}
                      title={t(item.labelKey)}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setCollapsed((v) => !v)}
          >
            {dir === "rtl" ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
            {!collapsed && <span>{t("top.collapseSidebar")}</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur">
          <form onSubmit={submitSearch} className="relative flex-1 max-w-2xl">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={t("top.searchPlaceholder")}
              className="ps-9 font-mono text-sm"
              aria-label={t("nav.search")}
            />
          </form>

          <div className="ms-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden gap-1 sm:flex">
              <span className="size-2 rounded-full bg-emerald-500" />
              {t("top.dbOnline")}
            </Badge>
            <Badge variant="secondary" className="hidden sm:flex">
              {sources.data?.length
                ? t("top.sourcesEnabled", { count: sources.data.length })
                : t("top.noSources")}
            </Badge>
            <Button variant="ghost" size="sm" onClick={toggleLocale} aria-label={t("top.language")}>
              {locale === "ar" ? "EN" : "ع"}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t("top.theme")}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="hidden text-end sm:block">
              <p className="text-xs font-medium">
                {access.data?.profile?.full_name ?? access.data?.profile?.username ?? "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {access.data?.roles[0] ? t(`role.${access.data.roles[0]}` as TranslationKey) : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label={t("top.signOut")}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>

        <footer className="border-t border-border px-4 py-3 text-center text-[11px] text-muted-foreground md:px-8">
          {t("app.org")} — {t("app.version")}
        </footer>
      </div>
    </div>
  );
}
