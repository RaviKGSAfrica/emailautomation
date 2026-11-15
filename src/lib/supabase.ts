import { createBrowserClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Server-side admin client. Uses SUPABASE_SERVICE_ROLE_KEY when present
// (API routes); falls back to the anon key so importing this module from
// client components is safe — the service key is never exposed to the browser
// because it is not a NEXT_PUBLIC_ variable.
//
// Lazily initialized via Proxy so importing this module does not require env
// vars at build time (Next.js collects page data without .env.local present).
let _admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _admin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => {
    const value = (getAdmin() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as Function).bind(getAdmin()) : value;
  },
});
