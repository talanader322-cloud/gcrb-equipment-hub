// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Lovable Cloud always provides the server-side bindings. Mirror the two public
// values into Vite's client bundle when a deployment omits their VITE_* aliases.
// These are intentionally public connection values; the service-role key is
// never exposed here.
const clientSupabaseUrl = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const clientSupabasePublishableKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];

export default defineConfig({
  vite: {
    define: {
      ...(clientSupabaseUrl
        ? { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(clientSupabaseUrl) }
        : {}),
      ...(clientSupabasePublishableKey
        ? {
            "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
              clientSupabasePublishableKey,
            ),
          }
        : {}),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
