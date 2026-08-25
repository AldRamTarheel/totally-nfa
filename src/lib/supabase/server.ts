import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses RLS entirely — import ONLY from
 * server-only code (API routes, cron routes, server components). Never
 * import this from a "use client" component or expose it to the browser.
 */
export function getServerSupabase() {
  const env = getServerEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
