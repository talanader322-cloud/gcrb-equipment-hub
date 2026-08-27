import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/lib/types";

/** Live Supabase session for the current browser. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, ready };
}

export type AccessLevel = {
  roles: AppRole[];
  profile: Profile | null;
  isAdmin: boolean;
  canManage: boolean;
  canManageCatalog: boolean;
};

/** Roles come from the dedicated user_roles table, never from the profile. */
export function useAccess(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["access", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AccessLevel> => {
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId!),
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
      ]);
      if (rolesRes.error) throw new Error(rolesRes.error.message);
      const roles = (rolesRes.data ?? []).map((r) => r.role);
      const canManage = roles.includes("system_admin") || roles.includes("catalog_manager");
      return {
        roles,
        profile: profileRes.data ?? null,
        isAdmin: roles.includes("system_admin"),
        canManage,
        canManageCatalog: canManage,
      };
    },
  });
}
