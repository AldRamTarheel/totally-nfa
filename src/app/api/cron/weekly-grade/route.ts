import { startOfWeek, endOfWeek, subWeeks, formatISO } from "date-fns";
import { isAuthorizedCronRequest, unauthorizedResponse } from "@/lib/cron-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getQuotes } from "@/lib/data/yahoo";
import { computePnlPercent, hasHitInvalidation } from "@/lib/pnl";
import { runRetrospectiveAgent, type GradedPick } from "@/lib/agents/retrospective-agent";
import { sendNtfyNotification, getNtfyTopic } from "@/lib/notifications/ntfy";
import { notifyClosures } from "@/lib/notifications/position-alerts";
import { closeHitPositions } from "@/lib/position-monitor";
import { sendCronFailureNotification } from "@/lib/notifications/cron-failure";
import { logPipelineRun } from "@/lib/pipeline-log";
import type { StockPick } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getPreviousWeekBounds() {
  const now = new Date();
  const lastWeekAnchor = subWeeks(now, 1);
  // Monday-start week, matching a typical trading week.
  const weekStart = startOfWeek(lastWeekAnchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(lastWeekAnchor, { weekStartsOn: 1 });
  return { weekStart, weekEnd };
}

async function handle(req: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) return unauthorizedResponse();

  let supabase: SupabaseClient | undefined;

  try {
    supabase = getServerSupabase();
    const topic = await getNtfyTopic(supabase);

    // 1. Defensive re-check: daily-pick already closes hit positions every
    // weekday, but this catches anything from a weekend gap or a missed run.
    const closures = await closeHitPositions(supabase);
    await notifyClosures(topic, closures);

    const { weekStart, weekEnd } = getPreviousWeekBounds();

    // 2. Pull picks created within last week's window (their status now
    // reflects any closures from step 1).
    const { data: picks, error: fetchError } = await supabase
      .from("stock_picks")
      .select("*")
      .gte("created_at", weekStart.toISOString())
      .lte("created_at", weekEnd.toISOString());
    if (fetchError) throw fetchError;

    const typedPicks = (picks ?? []) as StockPick[];

    if (typedPicks.length === 0) {
      await logPipelineRun(supabase, { job: "weekly-grade", status: "no-picks-to-grade" });
      return Response.json({ status: "no-picks-to-grade", weekStart, weekEnd, closures });
    }

    // 3. Fetch live prices and compute PnL for grading.
    const uniqueTickers = [...new Set(typedPicks.map((p) => p.ticker))];
    const quotes = await getQuotes(uniqueTickers);
    const priceByTicker = new Map(quotes.map((q) => [q.symbol, q.regularMarketPrice]));

    const graded: GradedPick[] = typedPicks.map((pick) => {
      const livePrice = priceByTicker.get(pick.ticker) ?? pick.last_checked_price ?? pick.alert_price;
      return {
        ...pick,
        returnPct: computePnlPercent(pick.alert_price, livePrice),
        hitInvalidation: hasHitInvalidation(pick.alert_price, pick.invalidation_price, livePrice),
      };
    });

    // 4. Ask Gemini to write the retrospective.
    const retro = await runRetrospectiveAgent(graded);

    // 5. Persist (unique constraint on week_start/week_end prevents dup runs).
    const { error: insertError } = await supabase.from("weekly_retrospectives").upsert(
      {
        week_start: formatISO(weekStart, { representation: "date" }),
        week_end: formatISO(weekEnd, { representation: "date" }),
        summary: retro.summary,
        stats: retro.stats,
      },
      { onConflict: "week_start,week_end" }
    );
    if (insertError) throw insertError;

    await logPipelineRun(supabase, {
      job: "weekly-grade",
      status: "graded",
      message: retro.summary.slice(0, 200),
    });

    // 6. Notify.
    await sendNtfyNotification({
      topic,
      title: "Weekly AI Retrospective Ready",
      message: retro.summary.slice(0, 200),
    });

    return Response.json({ status: "graded", pickCount: graded.length, closures });
  } catch (err) {
    console.error("weekly-grade cron failed:", err);
    await sendCronFailureNotification("weekly-grade", err).catch((notifyErr) => {
      console.error("weekly-grade: failed to send cron failure notification:", notifyErr);
    });
    if (supabase) {
      await logPipelineRun(supabase, {
        job: "weekly-grade",
        status: "error",
        message: (err as Error).message,
      }).catch(() => {});
    }
    return Response.json({ status: "error", message: (err as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
