import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

export interface NtfyParams {
  topic: string;
  title: string;
  message: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  clickUrl?: string;
}

/**
 * Sends a push notification via ntfy.sh — a free, keyless HTTP POST to a
 * public topic. Anyone who subscribes to the same topic string (via the
 * ntfy app or web) receives it, so the topic should be a hard-to-guess
 * string, not a real secret.
 */
export async function sendNtfyNotification(params: NtfyParams): Promise<void> {
  const headers: Record<string, string> = {
    Title: params.title,
    Priority: String(params.priority ?? 3),
  };
  if (params.tags?.length) headers.Tags = params.tags.join(",");
  if (params.clickUrl) headers.Click = params.clickUrl;

  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(params.topic)}`, {
    method: "POST",
    headers,
    body: params.message,
  });
  if (!res.ok) {
    throw new Error(`ntfy.sh notification failed: ${res.status} ${await res.text()}`);
  }
}

/** Reads the configured ntfy topic from app_settings, falling back to the env default. */
export async function getNtfyTopic(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "ntfy_topic")
    .maybeSingle();
  return data?.value || getServerEnv().NTFY_DEFAULT_TOPIC;
}
