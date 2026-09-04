import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ModelPhotoBulkUpload } from "@/components/models/ModelPhotoBulkUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccess, useSession } from "@/hooks/useSession";
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserActive,
  setUserRole,
} from "@/lib/auth.functions";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/translations";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["system_admin", "catalog_manager", "technical_user", "viewer"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "الإدارة | GCRB Equipment Catalog" },
      { name: "description", content: "User accounts, roles and system administration." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { t, formatDate } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const queryClient = useQueryClient();
  const isAdmin = Boolean(access.data?.isAdmin);

  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    jobTitle: "",
    department: "",
    role: "viewer" as AppRole,
  });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const users = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: () => listUsers(),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const fail = (error: Error) => toast.error(error.message);

  const create = useMutation({
    mutationFn: () =>
      createUser({
        data: {
          username: form.username,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          jobTitle: form.jobTitle || null,
          department: form.department || null,
        },
      }),
    onSuccess: () => {
      toast.success(t("users.created"));
      setForm({
        username: "",
        password: "",
        fullName: "",
        jobTitle: "",
        department: "",
        role: "viewer",
      });
      refresh();
    },
    onError: fail,
  });

  const role = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole }) => setUserRole({ data: vars }),
    onSuccess: () => {
      toast.success(t("admin.roleUpdated"));
      refresh();
    },
    onError: fail,
  });

  const active = useMutation({
    mutationFn: (vars: { userId: string; active: boolean }) => setUserActive({ data: vars }),
    onSuccess: () => {
      toast.success(t("users.updated"));
      refresh();
    },
    onError: fail,
  });

  const reset = useMutation({
    mutationFn: (vars: { userId: string; password: string }) => resetUserPassword({ data: vars }),
    onSuccess: () => {
      toast.success(t("users.updated"));
      setResetFor(null);
      setNewPassword("");
    },
    onError: fail,
  });

  if (access.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">{t("admin.noPermission")}</p>;
  }

  return (
    <div className="space-y-5">
      <ModelPhotoBulkUpload />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("users.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("users.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("users.create")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-username">{t("users.username")}</Label>
              <Input
                id="new-username"
                dir="ltr"
                autoCapitalize="none"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
              <p className="text-[11px] text-muted-foreground">{t("users.usernameHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{t("users.password")}</Label>
              <Input
                id="new-password"
                type="password"
                dir="ltr"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-fullname">{t("auth.fullName")}</Label>
              <Input
                id="new-fullname"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-job">{t("users.jobTitle")}</Label>
              <Input
                id="new-job"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-department">{t("users.department")}</Label>
              <Input
                id="new-department"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("users.role")}</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setForm({ ...form, role: value as AppRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`role.${r}` as TranslationKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={create.isPending}>
                {t("users.create")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.users")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.isLoading && <Skeleton className="m-4 h-24" />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.username")}</TableHead>
                <TableHead>{t("entity.name")}</TableHead>
                <TableHead>{t("users.role")}</TableHead>
                <TableHead>{t("users.status")}</TableHead>
                <TableHead>{t("entity.createdAt")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {row.username ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      {row.full_name ?? "—"}
                      {row.id === user?.id && <Badge variant="secondary">{t("entity.you")}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.roles[0] ?? "viewer"}
                      onValueChange={(value) =>
                        role.mutate({ userId: row.id, role: value as AppRole })
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {t(`role.${r}` as TranslationKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.active ? "default" : "destructive"}>
                      {row.active ? t("users.active") : t("users.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(row.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {row.id !== user?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => active.mutate({ userId: row.id, active: !row.active })}
                        >
                          {row.active ? t("users.deactivate") : t("users.activate")}
                        </Button>
                      )}
                      {resetFor === row.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="password"
                            dir="ltr"
                            className="h-8 w-40"
                            placeholder={t("users.newPassword")}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                          <Button
                            size="sm"
                            disabled={newPassword.length < 8 || reset.isPending}
                            onClick={() => reset.mutate({ userId: row.id, password: newPassword })}
                          >
                            {t("action.confirm")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setResetFor(null)}>
                            {t("action.cancel")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setResetFor(row.id);
                            setNewPassword("");
                          }}
                        >
                          {t("users.resetPassword")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
