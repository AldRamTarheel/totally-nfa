/**
 * Caps how many positions can be open at once. Anti-repetition
 * (candidate-selection.ts) only stops the *same* ticker from re-firing —
 * nothing previously stopped the active list from growing unbounded if
 * every day's candidate happened to be a fresh ticker. Set high (30) on
 * purpose: the goal here isn't a tight portfolio, it's a backstop against
 * literally unbounded growth while still covering a wide range of sectors.
 */
export const MAX_ACTIVE_POSITIONS = 30;

export function isAtCapacity(activeCount: number): boolean {
  return activeCount >= MAX_ACTIVE_POSITIONS;
}
