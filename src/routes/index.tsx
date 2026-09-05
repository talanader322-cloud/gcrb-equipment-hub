import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth", replace: true });
  },
  head: () => ({
    meta: [
      { title: "كاتلوج معدات المؤسسة العامة للطرق والجسور | GCRB Equipment Catalog" },
      {
        name: "description",
        content:
          "Internal catalog for heavy-equipment spare parts, parts books and service manuals of the General Corporation for Roads and Bridges.",
      },
      {
        property: "og:title",
        content: "كاتلوج معدات المؤسسة العامة للطرق والجسور",
      },
      {
        property: "og:description",
        content:
          "Search machine models, serial ranges, part numbers and technical documentation in one internal system.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t, dir, toggleLocale, locale } = useI18n();
  const { user, ready } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && user) navigate({ to: "/dashboard", replace: true });
  }, [ready, user, navigate]);

  const features = [
    { icon: Search, title: t("search.title"), body: t("top.searchPlaceholder") },
    { icon: FileStack, title: t("nav.catalogs"), body: t("entity.catalogs") },
    { icon: Wrench, title: t("nav.parts"), body: t("entity.alternateNumbers") },
    { icon: Globe2, title: t("nav.onlineSources"), body: t("sources.subtitle") },
  ];

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Database className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t("app.name")}</p>
            <p className="text-[11px] text-muted-foreground">{t("app.org")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggleLocale}>
            {locale === "ar" ? "EN" : "ع"}
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">{t("auth.signIn")}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-16 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t("app.name")}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("auth.subtitle")}</p>
        <div className="mt-6 flex gap-3">
          <Button asChild size="lg">
            <Link to="/auth">{t("auth.signIn")}</Link>
          </Button>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="space-y-2 p-5">
                <feature.icon className="size-5 text-primary" />
                <p className="text-sm font-semibold">{feature.title}</p>
                <p className="line-clamp-3 text-xs text-muted-foreground">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
