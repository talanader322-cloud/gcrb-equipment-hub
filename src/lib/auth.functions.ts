import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/lib/types";

type SignInInput = { username: string; password: string };
type IdInput = { userId: string };

function clientKey(): string | null {
  const request = getRequest();
  const header = request?.headers;
  if (!header) return null;
  return (
    header.get("cf-connecting-ip") ??
    header.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: unknown }>;
  };
  const { data } = await supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "system_admin",
  });
  if (!data) throw new Error("Forbidden: system administrators only");
}

export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input: SignInInput) => input)
  .handler(async ({ data }) => {
    const { signInWithUsernameServer } = await import("@/services/authService.server");
    return signInWithUsernameServer(data.username, data.password, clientKey());
  });

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listManagedUsers } = await import("@/services/authService.server");
    return listManagedUsers();
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      username: string;
      password: string;
      fullName: string;
      role: AppRole;
      jobTitle?: string | null;
      department?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { createManagedUser } = await import("@/services/authService.server");
    return createManagedUser(data);
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: IdInput & { password: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { setManagedUserPassword } = await import("@/services/authService.server");
    await setManagedUserPassword(data.userId, data.password);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: IdInput & { active: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { setManagedUserActive } = await import("@/services/authService.server");
    await setManagedUserActive(data.userId, data.active);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: IdInput & { role: AppRole }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { setManagedUserRole } = await import("@/services/authService.server");
    await setManagedUserRole(data.userId, data.role);
    return { ok: true };
  });

export const setUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: IdInput & { username: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { updateManagedUsername } = await import("@/services/authService.server");
    await updateManagedUsername(data.userId, data.username);
    return { ok: true };
  });
