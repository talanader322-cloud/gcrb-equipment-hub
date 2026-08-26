import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/translations";
import type { AppRole } from "@/lib/types";
import { adminRepository } from "@/services/repositories/adminRepository";

const ROLES: AppRole[] = ["system_admin", "catalog_manager", "technical_user", "viewer"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "الإدارة | GCRB Equipment Catalog" },
      { name: "description", content: "User roles and system administration." },
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

  const users = useQuery({
    queryKey: ["admin-users"],
    enabled: Boolean(access.data?.isAdmin),
    queryFn: () => adminRepository.listUsers(),
  });

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AppRole }) =>
      adminRepository.setUserRole(userId, role),
    onSuccess: () => {
      toast.success(t("admin.roleUpdated"));
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (access.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!access.data?.isAdmin) {
    return <p className="text-sm text-muted-foreground">{t("admin.noPermission")}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.users")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.isLoading && <Skeleton className="m-4 h-24" />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("entity.name")}</TableHead>
                <TableHead>{t("entity.email")}</TableHead>
                <TableHead>{t("admin.role")}</TableHead>
                <TableHead>{t("entity.createdAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{row.full_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.email ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={row.roles[0] ?? "viewer"}
                        onValueChange={(value) =>
                          setRole.mutate({ userId: row.id, role: value as AppRole })
                        }
                      >
                        <SelectTrigger className="w-[190px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`role.${role}` as TranslationKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {row.id === user?.id && <Badge variant="secondary">{t("entity.you")}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(row.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
