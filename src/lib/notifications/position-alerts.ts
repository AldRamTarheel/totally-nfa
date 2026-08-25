import "server-only";
import { sendNtfyNotification } from "@/lib/notifications/ntfy";
import type { ClosedPosition } from "@/lib/position-monitor";

const CLOSE_NOTIFICATION_COPY: Record<string, { title: string; tag: string }> = {
  target_hit: { title: "Target Hit", tag: "dart" },
  invalidation_hit: { title: "Stopped Out", tag: "octagonal_sign" },
};

/** Sends one ntfy push per closed position — used by both cron routes so exits notify consistently regardless of which one catches them. */
export async function notifyClosures(topic: string, closures: ClosedPosition[]): Promise<void> {
  for (const c of closures) {
    const copy = CLOSE_NOTIFICATION_COPY[c.reason ?? ""] ?? { title: "Position Closed", tag: "bell" };
    await sendNtfyNotification({
      topic,
      title: `${copy.title}: ${c.ticker} (${c.returnPct >= 0 ? "+" : ""}${c.returnPct.toFixed(1)}%)`,
      message: `${c.ticker} hit its ${c.reason === "target_hit" ? "target" : "invalidation"} price at $${c.livePrice.toFixed(2)}.`,
      tags: [copy.tag],
    });
  }
}
