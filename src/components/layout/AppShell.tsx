import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  HardHat,
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
  Menu,
  Moon,
  Search,
  Shield,
  Star,
  Sun,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/translations";

type NavItem = { to: string; labelKey: TranslationKey; icon: typeof Gauge };

const COLLAPSE_KEY = "gcrb.sidebar.collapsed";

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

function Brand({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
      <div className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Database className="size-5" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{t("app.name")}</p>
          <p className="truncate text-[11px] text-sidebar-foreground/60">{t("app.org")}</p>
        </div>
      )}
    </div>
  );
}

function SidebarNav({
  collapsed,
  onNavigate,
  isAdmin,
}: {
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
  isAdmin?: boolean | undefined;
}) {
  const { t, dir } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const systemNav: NavItem[] = [
    ...(isAdmin
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
    <TooltipProvider delayDuration={200}>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {groups.map((group) => (
          <div key={group.titleKey}>
            {collapsed ? (
              <div className="mx-3 mb-2 h-px bg-sidebar-border" />
            ) : (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/45">
                {t(group.titleKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                const Icon = item.icon;
                const link = (
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-1 w-[3px] rounded-full bg-sidebar-primary transition-opacity",
                        dir === "rtl" ? "end-0" : "start-0",
                        active ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                        "group-hover:text-sidebar-primary",
                      )}
                    />
                    {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                  </Link>
                );

                if (!collapsed) return <div key={item.to}>{link}</div>;
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side={dir === "rtl" ? "left" : "right"}>
                      {t(item.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, locale, toggleLocale, dir } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [term, setTerm] = useState("");

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

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

  return (
    <div className="flex min-h-screen bg-background" dir={dir}>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-72",
        )}
      >
        <Brand compact={collapsed} />
        <SidebarNav collapsed={collapsed} isAdmin={access.data?.isAdmin} />
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              collapsed ? "justify-center" : "justify-start",
            )}
            onClick={toggleCollapsed}
            aria-label={t("top.collapseSidebar")}
          >
            {(dir === "rtl") !== collapsed ? (
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
          <div className="hazard-stripe pointer-events-none absolute inset-x-0 bottom-0 h-[3px]" aria-hidden />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("nav.dashboard")}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "right" : "left"}
              className="w-72 border-sidebar-border bg-sidebar p-0"
            >
              <SheetTitle className="sr-only">{t("app.name")}</SheetTitle>
              <Brand />
              <SidebarNav
                collapsed={false}
                isAdmin={access.data?.isAdmin}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

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
              <span className="size-2 rounded-full bg-success" />
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
