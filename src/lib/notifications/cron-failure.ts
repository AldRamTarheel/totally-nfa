import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { sendNtfyNotification, getNtfyTopic } from "@/lib/notifications/ntfy";

/**
 * Sends a distinct push notification when a cron pipeline throws, resilient
 * even if Supabase itself is what's broken (in which case the ntfy topic
 * falls back to the raw NTFY_DEFAULT_TOPIC env var rather than the
 * app_settings override). Never throws — a failing failure-notification
 * must not mask the real error.
 */
export async function sendCronFailureNotification(
  job: "daily-pick" | "weekly-grade",
  error: unknown
): Promise<void> {
  let topic: string | undefined;

  try {
    const supabase = getServerSupabase();
    topic = await getNtfyTopic(supabase);
  } catch {
    topic = process.env.NTFY_DEFAULT_TOPIC;
  }

  if (!topic) {
    console.error("sendCronFailureNotification: no ntfy topic available, cannot notify of", job, "failure");
    return;
  }

  try {
    await sendNtfyNotification({
      topic,
      title: job === "daily-pick" ? "⚠️ Daily Pick Failed" : "⚠️ Weekly Grade Failed",
      message: String((error as Error)?.message ?? error).slice(0, 400),
      priority: 4,
      tags: ["rotating_light"],
    });
  } catch (err) {
    console.error("sendCronFailureNotification: failed to send ntfy notification:", err);
  }
}
