import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

/**
 * Browser/anon-key Supabase client. Safe to import from client components —
 * RLS restricts this to read-only access on public tables (see
 * supabase/migrations/0001_init.sql). Never use this for writes.
 */
export function getBrowserSupabase() {
  const env = getPublicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}
