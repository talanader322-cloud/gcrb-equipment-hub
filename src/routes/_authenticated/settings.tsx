import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { TranslationKey } from "@/lib/translations";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | GCRB Equipment Catalog" },
      { name: "description", content: "Language, appearance and account preferences." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user } = useSession();
  const access = useAccess(user?.id);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.appearance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">{t("settings.language")}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={locale === "ar" ? "default" : "outline"}
                onClick={() => setLocale("ar")}
              >
                العربية
              </Button>
              <Button
                size="sm"
                variant={locale === "en" ? "default" : "outline"}
                onClick={() => setLocale("en")}
              >
                English
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">{t("settings.theme")}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
              >
                {t("settings.light")}
              </Button>
              <Button
                size="sm"
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
              >
                {t("settings.dark")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-mono text-xs text-muted-foreground" dir="ltr">
            {access.data?.profile?.username ?? "—"}
          </p>

          {access.data?.roles.map((role) => (
            <p key={role}>{t(`role.${role}` as TranslationKey)}</p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.about")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("settings.desktopNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
