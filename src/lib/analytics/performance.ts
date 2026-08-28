// Pure analytics functions for the /performance page. No I/O here — the page
// component fetches picks/QQQ history/live quotes and passes plain data in.

import type { StockPick } from "@/lib/types";
import type { OhlcvBar } from "@/lib/data/yahoo";
import { computePnlPercent } from "@/lib/pnl";

export interface ResolvedPick {
  pick: StockPick;
  endDate: Date;
  endPrice: number;
  returnPct: number;
  benchmarkReturnPct: number;
}

export interface BenchmarkSummary {
  avgPickReturnPct: number;
  avgBenchmarkReturnPct: number;
  alphaPct: number;
  count: number;
}

export interface EquityCurvePoint {
  date: Date;
  cumulativeAvgReturnPct: number;
}

export interface PortfolioSim {
  totalInvested: number;
  totalPnlDollars: number;
  totalValue: number;
  perPick: { ticker: string; pnlDollars: number }[];
}

export interface ConvictionBucket {
  label: string;
  count: number;
  avgReturnPct: number | null;
}

export interface BenchmarkDefinition {
  symbol: string;
  label: string;
  category: "Index Funds" | "Commodities";
}

/**
 * Curated comparison set — index funds plus commodity-tracking ETFs (actual
 * futures aren't a clean fit for yahoo-finance2's retail-quote endpoints,
 * but GLD/SLV/USO already serve as the app's commodity proxies elsewhere —
 * see MACRO_TICKERS). Each is just another getHistorical() call, so adding
 * more here costs zero Gemini quota.
 */
export const BENCHMARKS: BenchmarkDefinition[] = [
  { symbol: "QQQ", label: "Nasdaq-100 (QQQ)", category: "Index Funds" },
  { symbol: "SPY", label: "S&P 500 (SPY)", category: "Index Funds" },
  { symbol: "DIA", label: "Dow Jones (DIA)", category: "Index Funds" },
  { symbol: "IWM", label: "Russell 2000 (IWM)", category: "Index Funds" },
  { symbol: "GLD", label: "Gold (GLD)", category: "Commodities" },
  { symbol: "SLV", label: "Silver (SLV)", category: "Commodities" },
  { symbol: "USO", label: "Crude Oil (USO)", category: "Commodities" },
];

/** The bar with the largest `date <= target`, or the first bar if none qualify. */
export function findNearestBar(bars: OhlcvBar[], target: Date): OhlcvBar | undefined {
  if (bars.length === 0) return undefined;
  const targetTime = target.getTime();
  let best: OhlcvBar | undefined;
  for (const bar of bars) {
    if (bar.date.getTime() <= targetTime) {
      if (!best || bar.date.getTime() > best.date.getTime()) {
        best = bar;
      }
    }
  }
  return best ?? bars[0];
}

export function resolvePicks(
  picks: StockPick[],
  // Whichever benchmark's daily bars to diff each pick's window against —
  // called once per benchmark in BENCHMARKS, not just QQQ.
  benchmarkBars: OhlcvBar[],
  livePriceByTicker: Map<string, number>
): ResolvedPick[] {
  return picks.map((pick) => {
    const endDate = pick.status === "closed" && pick.closed_at ? new Date(pick.closed_at) : new Date();
    const endPrice =
      pick.status === "closed"
        ? (pick.last_checked_price ?? pick.alert_price)
        : (livePriceByTicker.get(pick.ticker) ?? pick.last_checked_price ?? pick.alert_price);
    const returnPct = computePnlPercent(pick.alert_price, endPrice);

    const startBar = findNearestBar(benchmarkBars, new Date(pick.created_at));
    const endBar = findNearestBar(benchmarkBars, endDate);
    const benchmarkReturnPct = startBar && endBar ? computePnlPercent(startBar.close, endBar.close) : 0;

    return { pick, endDate, endPrice, returnPct, benchmarkReturnPct };
  });
}

export function computeBenchmarkSummary(resolved: ResolvedPick[]): BenchmarkSummary {
  if (resolved.length === 0) {
    return { avgPickReturnPct: 0, avgBenchmarkReturnPct: 0, alphaPct: 0, count: 0 };
  }
  const avgPickReturnPct = resolved.reduce((sum, r) => sum + r.returnPct, 0) / resolved.length;
  const avgBenchmarkReturnPct = resolved.reduce((sum, r) => sum + r.benchmarkReturnPct, 0) / resolved.length;
  return {
    avgPickReturnPct,
    avgBenchmarkReturnPct,
    alphaPct: avgPickReturnPct - avgBenchmarkReturnPct,
    count: resolved.length,
  };
}

export function computeEquityCurve(resolved: ResolvedPick[]): EquityCurvePoint[] {
  const sorted = [...resolved].sort(
    (a, b) => new Date(a.pick.created_at).getTime() - new Date(b.pick.created_at).getTime()
  );
  const points: EquityCurvePoint[] = [];
  let runningSum = 0;
  sorted.forEach((r, i) => {
    runningSum += r.returnPct;
    points.push({
      date: new Date(r.pick.created_at),
      cumulativeAvgReturnPct: runningSum / (i + 1),
    });
  });
  return points;
}

export function computePortfolioSim(resolved: ResolvedPick[], dollarsPerPick = 1000): PortfolioSim {
  const perPick = resolved.map((r) => ({
    ticker: r.pick.ticker,
    pnlDollars: dollarsPerPick * (r.returnPct / 100),
  }));
  const totalInvested = dollarsPerPick * resolved.length;
  const totalPnlDollars = perPick.reduce((sum, p) => sum + p.pnlDollars, 0);
  return {
    totalInvested,
    totalPnlDollars,
    totalValue: totalInvested + totalPnlDollars,
    perPick,
  };
}

export function computeConvictionBuckets(resolved: ResolvedPick[]): ConvictionBucket[] {
  const definitions: { label: string; predicate: (score: number) => boolean }[] = [
    { label: "High (8-10)", predicate: (score) => score >= 8 },
    { label: "Medium (5-7)", predicate: (score) => score >= 5 && score <= 7 },
    { label: "Low (1-4)", predicate: (score) => score <= 4 },
  ];

  return definitions.map(({ label, predicate }) => {
    const inBucket = resolved.filter((r) => predicate(r.pick.conviction_score));
    const count = inBucket.length;
    const avgReturnPct = count === 0 ? null : inBucket.reduce((sum, r) => sum + r.returnPct, 0) / count;
    return { label, count, avgReturnPct };
  });
}
