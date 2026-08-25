import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

// ntfy topics are used directly in a URL path segment, so keep them to
// URL-safe characters.
const ntfyTopicSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Topic must be letters, numbers, hyphens, or underscores only");

export async function GET() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "ntfy_topic").maybeSingle();
  return Response.json({ ntfyTopic: data?.value ?? getServerEnv().NTFY_DEFAULT_TOPIC });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ntfyTopicSchema.safeParse(body?.ntfyTopic);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid topic" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "ntfy_topic", value: parsed.data, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, ntfyTopic: parsed.data });
}
