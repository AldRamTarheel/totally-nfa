/**
 * A position open this long with neither its target nor invalidation price
 * ever hit gets flagged in the UI — but deliberately never force-closed.
 * Auto-closing would fabricate an exit decision the AI never actually made;
 * flagging just keeps "days held" honest and visible instead.
 */
export const STALE_THRESHOLD_DAYS = 45;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days between `createdAt` and `now` (floor, never negative). */
export function computeDaysHeld(createdAt: string | Date, now: Date = new Date()): number {
  const start = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const diffMs = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

export function isStale(createdAt: string | Date, now: Date = new Date()): boolean {
  return computeDaysHeld(createdAt, now) >= STALE_THRESHOLD_DAYS;
}
