/** Percent change from alert price to live price. Positive = up since the pick. */
export function computePnlPercent(alertPrice: number, livePrice: number): number {
  if (!alertPrice) return 0;
  return ((livePrice - alertPrice) / alertPrice) * 100;
}

/** Whether a pick's thesis has been invalidated, i.e. price crossed the invalidation level. */
export function hasHitInvalidation(
  alertPrice: number,
  invalidationPrice: number,
  livePrice: number
): boolean {
  // Invalidation is a downside stop for a bullish thesis (invalidation < alert),
  // but guard both directions in case a thesis is ever framed as bearish.
  const isBullish = invalidationPrice < alertPrice;
  return isBullish ? livePrice <= invalidationPrice : livePrice >= invalidationPrice;
}

/** Whether a pick has reached its take-profit target price. */
export function hasHitTarget(alertPrice: number, targetPrice: number, livePrice: number): boolean {
  // Target is an upside goal for a bullish thesis (target > alert), but guard
  // both directions in case a thesis is ever framed as bearish.
  const isBullish = targetPrice > alertPrice;
  return isBullish ? livePrice >= targetPrice : livePrice <= targetPrice;
}
