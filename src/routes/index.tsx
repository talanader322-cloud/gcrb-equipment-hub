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
      { title: "تسجيل الدخول | كاتلوج معدات المؤسسة العامة للطرق والجسور" },
      {
        name: "description",
        content:
          "Internal catalog for heavy-equipment spare parts, parts books and service manuals of the General Corporation for Roads and Bridges.",
      },
      { property: "og:title", content: "كاتلوج معدات المؤسسة العامة للطرق والجسور" },
      {
        property: "og:description",
        content: "Institutional access to the internal equipment catalog.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
