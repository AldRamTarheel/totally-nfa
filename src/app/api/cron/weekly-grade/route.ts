import { startOfWeek, endOfWeek, subWeeks, formatISO } from "date-fns";
import { isAuthorizedCronRequest, unauthorizedResponse } from "@/lib/cron-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getQuotes } from "@/lib/data/yahoo";
import { computePnlPercent, hasHitInvalidation } from "@/lib/pnl";
import { runRetrospectiveAgent, type GradedPick } from "@/lib/agents/retrospective-agent";
import { sendNtfyNotification, getNtfyTopic } from "@/lib/notifications/ntfy";
import type { StockPick } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  try {
    const supabase = getServerSupabase();
    const { weekStart, weekEnd } = getPreviousWeekBounds();

    // 1. Pull picks created within last week's window.
    const { data: picks, error: fetchError } = await supabase
      .from("stock_picks")
      .select("*")
      .gte("created_at", weekStart.toISOString())
      .lte("created_at", weekEnd.toISOString());
    if (fetchError) throw fetchError;

    const typedPicks = (picks ?? []) as StockPick[];

    if (typedPicks.length === 0) {
      return Response.json({ status: "no-picks-to-grade", weekStart, weekEnd });
    }

    // 2. Fetch live prices, compute PnL and invalidation status per pick.
    const uniqueTickers = [...new Set(typedPicks.map((p) => p.ticker))];
    const quotes = await getQuotes(uniqueTickers);
    const priceByTicker = new Map(quotes.map((q) => [q.symbol, q.regularMarketPrice]));

    const graded: GradedPick[] = typedPicks.map((pick) => {
      const livePrice = priceByTicker.get(pick.ticker) ?? pick.alert_price;
      return {
        ...pick,
        returnPct: computePnlPercent(pick.alert_price, livePrice),
        hitInvalidation: hasHitInvalidation(pick.alert_price, pick.invalidation_price, livePrice),
      };
    });

    // 3. Auto-close any active picks that crossed their invalidation price.
    const closures = graded.filter((g) => g.hitInvalidation && g.status === "active");
    for (const g of closures) {
      const { error: updateError } = await supabase
        .from("stock_picks")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_reason: "invalidation_hit",
          last_checked_price: priceByTicker.get(g.ticker) ?? g.alert_price,
          last_checked_at: new Date().toISOString(),
        })
        .eq("id", g.id);
      if (updateError) console.error(`Failed to auto-close ${g.ticker}:`, updateError);
    }

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

    // 6. Notify.
    const topic = await getNtfyTopic(supabase);
    await sendNtfyNotification({
      topic,
      title: "Weekly AI Retrospective Ready",
      message: retro.summary.slice(0, 200),
    });

    return Response.json({ status: "graded", pickCount: graded.length, closedCount: closures.length });
  } catch (err) {
    console.error("weekly-grade cron failed:", err);
    return Response.json({ status: "error", message: (err as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
