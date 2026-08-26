import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/types";

/** Internal auth-email domain. Never exposed to the browser. */
const AUTH_EMAIL_DOMAIN = "users.gcrb.local";
const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function authEmailFor(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createAuthClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Backend is not configured");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function recordAttempt(username: string, clientKey: string | null, success: boolean) {
  await supabaseAdmin.from("auth_login_attempts").insert({ username, client_key: clientKey, success });
}

async function isRateLimited(username: string, clientKey: string | null) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const byUser = await supabaseAdmin
    .from("auth_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("username", username)
    .eq("success", false)
    .gte("attempted_at", since);
  if ((byUser.count ?? 0) >= MAX_FAILED_ATTEMPTS) return true;
  if (!clientKey) return false;
  const byClient = await supabaseAdmin
    .from("auth_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("client_key", clientKey)
    .eq("success", false)
    .gte("attempted_at", since);
  return (byClient.count ?? 0) >= MAX_FAILED_ATTEMPTS * 4;
}

export type SignInOutcome =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; reason: "invalid" | "disabled" | "rate_limited" };

export async function signInWithUsernameServer(
  rawUsername: string,
  password: string,
  clientKey: string | null,
): Promise<SignInOutcome> {
  const username = normalizeUsername(rawUsername);
  if (!username || !password) return { ok: false, reason: "invalid" };
  if (await isRateLimited(username, clientKey)) return { ok: false, reason: "rate_limited" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, active")
    .eq("username", username)
    .maybeSingle();

  if (!profile) {
    await recordAttempt(username, clientKey, false);
    return { ok: false, reason: "invalid" };
  }
  if (!profile.active) {
    await recordAttempt(username, clientKey, false);
    return { ok: false, reason: "disabled" };
  }

  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  const email = userRes?.user?.email;
  if (!email) {
    await recordAttempt(username, clientKey, false);
    return { ok: false, reason: "invalid" };
  }

  const auth = createAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    await recordAttempt(username, clientKey, false);
    return { ok: false, reason: "invalid" };
  }

  await recordAttempt(username, clientKey, true);
  return {
    ok: true,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

export type ManagedUser = {
  id: string;
  username: string | null;
  full_name: string | null;
  job_title: string | null;
  department: string | null;
  locale: string;
  active: boolean;
  created_at: string;
  roles: AppRole[];
};

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const [profiles, roles] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, username, full_name, job_title, department, locale, active, created_at")
      .order("created_at"),
    supabaseAdmin.from("user_roles").select("user_id, role"),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  if (roles.error) throw new Error(roles.error.message);

  const byUser = new Map<string, AppRole[]>();
  for (const r of roles.data ?? []) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]);
  }
  return (profiles.data ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
}

export async function assertUsernameFree(username: string, exceptUserId?: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data && data.id !== exceptUserId) throw new Error("Username already exists");
}

export async function createManagedUser(input: {
  username: string;
  password: string;
  fullName: string;
  role: AppRole;
  jobTitle?: string | null;
  department?: string | null;
}) {
  const username = normalizeUsername(input.username);
  if (!USERNAME_PATTERN.test(username)) throw new Error("Invalid username format");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  await assertUsernameFree(username);

  const created = await supabaseAdmin.auth.admin.createUser({
    email: authEmailFor(username),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? "Could not create the user");
  }
  const userId = created.data.user.id;

  try {
    const profile = await supabaseAdmin
      .from("profiles")
      .update({
        username,
        full_name: input.fullName,
        job_title: input.jobTitle ?? null,
        department: input.department ?? null,
        active: true,
      })
      .eq("id", userId);
    if (profile.error) throw new Error(profile.error.message);

    const clearRoles = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    if (clearRoles.error) throw new Error(clearRoles.error.message);

    const roleRes = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: input.role });
    if (roleRes.error) throw new Error(roleRes.error.message);
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw error;
  }

  return { id: userId, username };
}

export async function setManagedUserPassword(userId: string, password: string) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}

export async function setManagedUserActive(userId: string, active: boolean) {
  const { error } = await supabaseAdmin.from("profiles").update({ active }).eq("id", userId);
  if (error) throw new Error(error.message);
  const authUpdate = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (authUpdate.error) {
    await supabaseAdmin.from("profiles").update({ active: !active }).eq("id", userId);
    throw new Error(authUpdate.error.message);
  }
}

export async function setManagedUserRole(userId: string, role: AppRole) {
  const existing = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (existing.error) throw new Error(existing.error.message);

  const del = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  if (del.error) throw new Error(del.error.message);
  const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
  if (error) {
    if ((existing.data ?? []).length > 0) {
      await supabaseAdmin.from("user_roles").insert(
        existing.data!.map((item) => ({ user_id: userId, role: item.role })),
      );
    }
    throw new Error(error.message);
  }
}

export async function updateManagedUsername(userId: string, rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  if (!USERNAME_PATTERN.test(username)) throw new Error("Invalid username format");
  await assertUsernameFree(username, userId);

  const previous = await supabaseAdmin.from("profiles").select("username").eq("id", userId).single();
  if (previous.error) throw new Error(previous.error.message);

  const authUpdate = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: authEmailFor(username),
  });
  if (authUpdate.error) throw new Error(authUpdate.error.message);

  const { error } = await supabaseAdmin.from("profiles").update({ username }).eq("id", userId);
  if (error) {
    if (previous.data.username) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: authEmailFor(previous.data.username),
      });
    }
    throw new Error(error.message);
  }
}
