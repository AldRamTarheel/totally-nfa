// Pure analytics function for the /performance page's win-rate card. No I/O
// here — the page component fetches picks and passes plain data in.

import type { StockPick } from "@/lib/types";

export interface WinRateSummary {
  closedCount: number;
  targetHitCount: number;
  invalidationHitCount: number;
  winRatePct: number | null;
}

/**
 * Only picks closed via a clean win/loss signal (`target_hit` or
 * `invalidation_hit`) count toward the win rate — a `manual` or `graded`
 * closure isn't a thesis outcome, and neither is a still-active pick.
 */
export function computeWinRate(picks: StockPick[]): WinRateSummary {
  let targetHitCount = 0;
  let invalidationHitCount = 0;

  for (const pick of picks) {
    if (pick.status !== "closed") continue;
    if (pick.closed_reason === "target_hit") {
      targetHitCount += 1;
    } else if (pick.closed_reason === "invalidation_hit") {
      invalidationHitCount += 1;
    }
  }

  const closedCount = targetHitCount + invalidationHitCount;
  const winRatePct = closedCount === 0 ? null : (targetHitCount / closedCount) * 100;

  return { closedCount, targetHitCount, invalidationHitCount, winRatePct };
}
