import { describe, it, expect } from "vitest";
import {
  findNearestBar,
  resolvePicks,
  computeBenchmarkSummary,
  computeEquityCurve,
  computePortfolioSim,
  computeConvictionBuckets,
  type ResolvedPick,
} from "@/lib/analytics/performance";
import type { StockPick } from "@/lib/types";
import type { OhlcvBar } from "@/lib/data/yahoo";

function makePick(overrides: Partial<StockPick> = {}): StockPick {
  return {
    id: "pick-1",
    ticker: "AAA",
    created_at: "2026-01-01T00:00:00Z",
    alert_price: 100,
    last_checked_price: null,
    last_checked_at: null,
    conviction_score: 7,
    invalidation_price: 90,
    target_price: 120,
    insider_sentiment: "bullish",
    thesis: "test thesis",
    status: "active",
    category: null,
    tags: [],
    closed_at: null,
    closed_reason: null,
    details: {},
    ...overrides,
  };
}

function bar(date: string, close: number): OhlcvBar {
  return { date: new Date(date), open: close, high: close, low: close, close, volume: 0 };
}

/** Builds a fully-typed ResolvedPick without going through resolvePicks, for
 * tests of the downstream aggregation functions (summary/curve/sim/buckets)
 * that only care about returnPct/benchmarkReturnPct and pick metadata. */
function makeResolved(
  returnPct: number,
  benchmarkReturnPct: number,
  pickOverrides: Partial<StockPick> = {}
): ResolvedPick {
  const pick = makePick(pickOverrides);
  return {
    pick,
    endDate: new Date(pick.created_at),
    endPrice: pick.alert_price,
    returnPct,
    benchmarkReturnPct,
  };
}

describe("findNearestBar", () => {
  const bars = [bar("2026-01-01", 100), bar("2026-01-05", 110), bar("2026-01-10", 120)];

  it("returns the bar with the largest date <= target", () => {
    expect(findNearestBar(bars, new Date("2026-01-07"))?.close).toBe(110);
  });

  it("falls back to the first bar when none qualify", () => {
    expect(findNearestBar(bars, new Date("2025-01-01"))?.close).toBe(100);
  });

  it("returns undefined for an empty array", () => {
    expect(findNearestBar([], new Date("2026-01-01"))).toBeUndefined();
  });
});

describe("resolvePicks", () => {
  it("uses the live price from livePriceByTicker for an active pick", () => {
    const pick = makePick({ ticker: "AAA", alert_price: 100, last_checked_price: 90 });
    const bars = [bar("2026-01-01", 100), bar("2026-01-10", 150)];
    const live = new Map([["AAA", 120]]);

    const [resolved] = resolvePicks([pick], bars, live);

    expect(resolved.endPrice).toBe(120);
    expect(resolved.returnPct).toBeCloseTo(20);
  });

  it("falls back to last_checked_price when the ticker is missing from the live map", () => {
    const pick = makePick({ ticker: "AAA", alert_price: 100, last_checked_price: 95 });
    const bars = [bar("2026-01-01", 100)];

    const [resolved] = resolvePicks([pick], bars, new Map());

    expect(resolved.endPrice).toBe(95);
  });

  it("falls back to alert_price when both the live map and last_checked_price are missing", () => {
    const pick = makePick({ ticker: "AAA", alert_price: 100, last_checked_price: null });
    const bars = [bar("2026-01-01", 100)];

    const [resolved] = resolvePicks([pick], bars, new Map());

    expect(resolved.endPrice).toBe(100);
    expect(resolved.returnPct).toBe(0);
  });

  it("uses last_checked_price as of closed_at for a closed pick, ignoring the live map entirely", () => {
    const pick = makePick({
      ticker: "AAA",
      alert_price: 100,
      last_checked_price: 115,
      status: "closed",
      closed_at: "2026-01-05T00:00:00Z",
    });
    // Deliberately stale/wrong live price to prove closed picks never read it.
    const live = new Map([["AAA", 999]]);
    const bars = [bar("2026-01-01", 100), bar("2026-01-05", 110), bar("2026-01-10", 200)];

    const [resolved] = resolvePicks([pick], bars, live);

    expect(resolved.endPrice).toBe(115);
    expect(resolved.returnPct).toBeCloseTo(15);
  });

  it("uses closed_at (not now) as the window end date for a closed pick", () => {
    const pick = makePick({
      ticker: "AAA",
      created_at: "2026-01-01T00:00:00Z",
      status: "closed",
      closed_at: "2026-01-05T00:00:00Z",
      last_checked_price: 110,
    });
    const bars = [bar("2026-01-01", 100), bar("2026-01-05", 110), bar("2026-01-10", 200)];

    const [resolved] = resolvePicks([pick], bars, new Map());

    expect(resolved.endDate).toEqual(new Date("2026-01-05T00:00:00Z"));
    // benchmark window is created_at (bar close 100) -> closed_at (bar close 110), NOT the
    // last/most-recent bar (close 200), proving "now" isn't used for a closed pick.
    expect(resolved.benchmarkReturnPct).toBeCloseTo(10);
  });

  it("falls back to alert_price for a closed pick when last_checked_price is null", () => {
    const pick = makePick({
      ticker: "AAA",
      alert_price: 100,
      last_checked_price: null,
      status: "closed",
      closed_at: "2026-01-05T00:00:00Z",
    });
    const bars = [bar("2026-01-01", 100)];

    const [resolved] = resolvePicks([pick], bars, new Map());

    expect(resolved.endPrice).toBe(100);
  });
});

describe("computeBenchmarkSummary", () => {
  it("averages pick vs benchmark returns and computes alpha as the difference", () => {
    const resolved = [makeResolved(10, 4), makeResolved(20, 6)];

    const summary = computeBenchmarkSummary(resolved);

    expect(summary.avgPickReturnPct).toBeCloseTo(15);
    expect(summary.avgBenchmarkReturnPct).toBeCloseTo(5);
    expect(summary.alphaPct).toBeCloseTo(10);
    expect(summary.count).toBe(2);
  });

  it("returns all zeros for empty input without dividing by zero", () => {
    const summary = computeBenchmarkSummary([]);

    expect(summary).toEqual({
      avgPickReturnPct: 0,
      avgBenchmarkReturnPct: 0,
      alphaPct: 0,
      count: 0,
    });
  });
});

describe("computeEquityCurve", () => {
  it("sorts points chronologically by created_at regardless of input order, with a correct running average", () => {
    // Deliberately out of order in the input array.
    const resolved = [
      makeResolved(30, 0, { created_at: "2026-01-03T00:00:00Z" }), // day 3
      makeResolved(10, 0, { created_at: "2026-01-01T00:00:00Z" }), // day 1
      makeResolved(-4, 0, { created_at: "2026-01-02T00:00:00Z" }), // day 2
    ];

    const points = computeEquityCurve(resolved);

    expect(points.map((p) => p.date.toISOString())).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      "2026-01-03T00:00:00.000Z",
    ]);
    // Running averages by hand: [10], [10,-4] avg 3, [10,-4,30] avg 12.
    expect(points[0].cumulativeAvgReturnPct).toBeCloseTo(10);
    expect(points[1].cumulativeAvgReturnPct).toBeCloseTo(3);
    expect(points[2].cumulativeAvgReturnPct).toBeCloseTo(12);
  });
});

describe("computePortfolioSim", () => {
  it("computes totalInvested, per-pick and total P&L dollars, and totalValue with an explicit dollarsPerPick", () => {
    const resolved = [
      makeResolved(10, 0, { ticker: "AAA" }), // +$100 on $1000
      makeResolved(-5, 0, { ticker: "BBB" }), // -$50 on $1000
    ];

    const sim = computePortfolioSim(resolved, 1000);

    expect(sim.totalInvested).toBe(2000);
    expect(sim.perPick).toEqual([
      { ticker: "AAA", pnlDollars: 100 },
      { ticker: "BBB", pnlDollars: -50 },
    ]);
    expect(sim.totalPnlDollars).toBeCloseTo(50);
    expect(sim.totalValue).toBeCloseTo(2050);
  });

  it("defaults dollarsPerPick to 1000 when not passed", () => {
    const resolved = [makeResolved(10, 0)];

    const sim = computePortfolioSim(resolved);

    expect(sim.totalInvested).toBe(1000);
    expect(sim.perPick[0].pnlDollars).toBeCloseTo(100);
  });
});

describe("computeConvictionBuckets", () => {
  it("buckets picks into High (8-10) / Medium (5-7) / Low (1-4) by conviction_score with correct averages", () => {
    const resolved = [
      makeResolved(20, 0, { conviction_score: 9 }), // High
      makeResolved(10, 0, { conviction_score: 8 }), // High
      makeResolved(-6, 0, { conviction_score: 6 }), // Medium
      makeResolved(2, 0, { conviction_score: 3 }), // Low
    ];

    const buckets = computeConvictionBuckets(resolved);
    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b]));

    expect(byLabel["High (8-10)"].count).toBe(2);
    expect(byLabel["High (8-10)"].avgReturnPct).toBeCloseTo(15);
    expect(byLabel["Medium (5-7)"].count).toBe(1);
    expect(byLabel["Medium (5-7)"].avgReturnPct).toBeCloseTo(-6);
    expect(byLabel["Low (1-4)"].count).toBe(1);
    expect(byLabel["Low (1-4)"].avgReturnPct).toBeCloseTo(2);
  });

  it("gives a bucket with zero picks avgReturnPct: null, not 0 or NaN", () => {
    const resolved = [makeResolved(20, 0, { conviction_score: 9 })];

    const buckets = computeConvictionBuckets(resolved);
    const medium = buckets.find((b) => b.label === "Medium (5-7)");

    expect(medium?.count).toBe(0);
    expect(medium?.avgReturnPct).toBeNull();
  });
});
