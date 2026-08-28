import type { InsiderCandidate } from "@/lib/types";

/**
 * Finds the highest-ranked insider candidate that ISN'T already an active
 * pick — a cheap, pure check (no I/O, no Gemini cost) — instead of always
 * evaluating candidate #1. Without this, a ticker that keeps resurfacing as
 * the top insider candidate would silently block the pipeline from ever
 * considering anything else once it's already held. Extracted out of the
 * daily-pick route so this decision is unit-testable on its own.
 */
export function findFreshCandidate(
  candidates: InsiderCandidate[],
  activeTickers: Set<string>
): InsiderCandidate | undefined {
  return candidates.find((c) => !activeTickers.has(c.ticker));
}
