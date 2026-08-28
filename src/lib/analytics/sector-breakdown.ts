// Pure analytics function for the /performance page's sector-diversification
// chart. No I/O here — the page component fetches sector info/live prices
// and passes plain data in.

import type { StockPick } from "@/lib/types";
import { computePnlPercent } from "@/lib/pnl";

export interface SectorBucket {
  sector: string;
  count: number;
  avgReturnPct: number;
}

/**
 * Groups picks by sector (falling back to "Unknown" rather than dropping a
 * pick whose sector lookup failed) and averages each pick's return within
 * the group. Return resolution follows the same fallback chain as
 * `resolvePicks` in `performance.ts`: closed picks use their last-checked
 * price, active picks prefer a live quote.
 */
export function computeSectorBreakdown(
  picks: StockPick[],
  sectorByTicker: Map<string, string | null>,
  livePriceByTicker: Map<string, number>
): SectorBucket[] {
  const bySector = new Map<string, { totalReturnPct: number; count: number }>();

  for (const pick of picks) {
    const sector = sectorByTicker.get(pick.ticker) ?? "Unknown";
    const endPrice =
      pick.status === "closed"
        ? (pick.last_checked_price ?? pick.alert_price)
        : (livePriceByTicker.get(pick.ticker) ?? pick.last_checked_price ?? pick.alert_price);
    const returnPct = computePnlPercent(pick.alert_price, endPrice);

    const existing = bySector.get(sector);
    if (existing) {
      existing.totalReturnPct += returnPct;
      existing.count += 1;
    } else {
      bySector.set(sector, { totalReturnPct: returnPct, count: 1 });
    }
  }

  return [...bySector.entries()]
    .map(([sector, { totalReturnPct, count }]) => ({
      sector,
      count,
      avgReturnPct: totalReturnPct / count,
    }))
    .sort((a, b) => b.count - a.count);
}
