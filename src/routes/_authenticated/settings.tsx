import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccess, useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
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
          <CardTitle className="text-base">{t("settings.password")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid max-w-md gap-3" onSubmit={submitPassword}>
            <div className="space-y-1.5">
              <Label htmlFor="cur-pw">{t("settings.currentPassword")}</Label>
              <Input
                id="cur-pw"
                type="password"
                dir="ltr"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">{t("settings.newPassword")}</Label>
              <Input
                id="new-pw"
                type="password"
                dir="ltr"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">{t("settings.passwordHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw2">{t("settings.confirmPassword")}</Label>
              <Input
                id="new-pw2"
                type="password"
                dir="ltr"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Button type="submit" disabled={saving}>
                {t("settings.password")}
              </Button>
            </div>
          </form>
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
