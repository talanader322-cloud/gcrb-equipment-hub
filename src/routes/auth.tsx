import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Database, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | GCRB Equipment Catalog" },
      { name: "description", content: "Sign in to the internal GCRB equipment catalog." },
      { property: "og:title", content: "Sign in — GCRB Equipment Catalog" },
      { property: "og:description", content: "Institutional access to the equipment catalog." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, dir, locale } = useI18n();
  const navigate = useNavigate();
  const { user, ready } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/dashboard", replace: true });
  }, [ready, user, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4" dir={dir}>
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Database className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{t("auth.title")}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{t("app.org")}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="me-2 size-4 animate-spin" />}
              {t("auth.signIn")}
            </Button>
          </form>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
            {locale === "ar"
              ? "الدخول مخصص لمستخدمي المؤسسة المعتمدين. يتم إنشاء الحسابات وإدارة الصلاحيات بواسطة مسؤول النظام."
              : "Access is restricted to approved institutional users. Accounts and roles are managed by the system administrator."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
