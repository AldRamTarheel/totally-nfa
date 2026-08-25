import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getQuotes } from "@/lib/data/yahoo";
import { computePnlPercent, hasHitInvalidation, hasHitTarget } from "@/lib/pnl";
import type { StockPick, ClosedReason } from "@/lib/types";

export interface ClosedPosition {
  id: string;
  ticker: string;
  reason: ClosedReason;
  returnPct: number;
  livePrice: number;
}

/**
 * Checks every active pick's live price against its invalidation (stop-loss)
 * and target (take-profit) levels, closing and stamping a reason on any that
 * crossed either one. Called once per day from the daily-pick cron (before
 * generating a new pick) so exits are caught same-day rather than only in
 * the Friday weekly-grade run, and again defensively from weekly-grade
 * itself. Picks that are neither hit just get their last_checked_price
 * refreshed for the dashboard's live PnL.
 */
export async function closeHitPositions(supabase: SupabaseClient): Promise<ClosedPosition[]> {
  const { data: active, error } = await supabase.from("stock_picks").select("*").eq("status", "active");
  if (error) throw error;

  const picks = (active ?? []) as StockPick[];
  if (picks.length === 0) return [];

  const uniqueTickers = [...new Set(picks.map((p) => p.ticker))];
  const quotes = await getQuotes(uniqueTickers);
  const priceByTicker = new Map(quotes.map((q) => [q.symbol, q.regularMarketPrice]));

  const closed: ClosedPosition[] = [];
  const now = new Date().toISOString();

  for (const pick of picks) {
    const livePrice = priceByTicker.get(pick.ticker);
    if (livePrice == null) continue; // couldn't fetch a quote this run; leave as-is

    let reason: ClosedReason = null;
    if (hasHitInvalidation(pick.alert_price, pick.invalidation_price, livePrice)) {
      reason = "invalidation_hit";
    } else if (pick.target_price && hasHitTarget(pick.alert_price, pick.target_price, livePrice)) {
      reason = "target_hit";
    }

    if (reason) {
      const { error: updateError } = await supabase
        .from("stock_picks")
        .update({
          status: "closed",
          closed_at: now,
          closed_reason: reason,
          last_checked_price: livePrice,
          last_checked_at: now,
        })
        .eq("id", pick.id)
        .eq("status", "active"); // guard against a race with another run
      if (updateError) {
        console.error(`Failed to close ${pick.ticker}:`, updateError);
        continue;
      }
      closed.push({
        id: pick.id,
        ticker: pick.ticker,
        reason,
        returnPct: computePnlPercent(pick.alert_price, livePrice),
        livePrice,
      });
    } else {
      await supabase
        .from("stock_picks")
        .update({ last_checked_price: livePrice, last_checked_at: now })
        .eq("id", pick.id);
    }
  }

  return closed;
}
