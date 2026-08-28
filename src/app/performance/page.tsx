import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BenchmarkComparisonCard } from "@/components/performance/benchmark-comparison-card";
import { EquityCurveChart } from "@/components/performance/equity-curve-chart";
import { PortfolioSimCard } from "@/components/performance/portfolio-sim-card";
import { ConvictionCalibrationTable } from "@/components/performance/conviction-calibration-table";
import { WinRateCard } from "@/components/performance/win-rate-card";
import { SectorBreakdownChart } from "@/components/performance/sector-breakdown-chart";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { getHistorical, getQuotes, getSectorInfo } from "@/lib/data/yahoo";
import {
  resolvePicks,
  computeBenchmarkSummary,
  computeEquityCurve,
  computePortfolioSim,
  computeConvictionBuckets,
  BENCHMARKS,
  type BenchmarkSummary,
} from "@/lib/analytics/performance";
import { computeWinRate } from "@/lib/analytics/win-rate";
import { computeSectorBreakdown } from "@/lib/analytics/sector-breakdown";
import type { StockPick } from "@/lib/types";
import type { OhlcvBar } from "@/lib/data/yahoo";

export const dynamic = "force-dynamic";

async function getPicks(): Promise<StockPick[]> {
  const supabase = getBrowserSupabase();
  const { data } = await supabase.from("stock_picks").select("*").order("created_at", { ascending: true });
  return (data ?? []) as StockPick[];
}

export default async function PerformancePage() {
  const picks = await getPicks();

  if (picks.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance Analytics</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No data yet</CardTitle>
            <CardDescription>No picks yet — check back once the daily pipeline has run.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    );
  }

  const activeTickers = picks.filter((p) => p.status === "active").map((p) => p.ticker);
  const earliestPickDate = new Date(picks[0].created_at);

  // One getHistorical() call per benchmark (all Yahoo-only, zero Gemini
  // cost) — fail soft per-symbol so one bad/delisted ticker in the list
  // doesn't take down the whole page.
  const [benchmarkResults, quotes] = await Promise.all([
    Promise.allSettled(
      BENCHMARKS.map(async (b) => ({
        symbol: b.symbol,
        bars: await getHistorical(b.symbol, { period1: earliestPickDate }),
      }))
    ),
    activeTickers.length > 0 ? getQuotes(activeTickers) : Promise.resolve([]),
  ]);

  const benchmarkBarsBySymbol = new Map<string, OhlcvBar[]>();
  for (const result of benchmarkResults) {
    if (result.status === "fulfilled") {
      benchmarkBarsBySymbol.set(result.value.symbol, result.value.bars);
    } else {
      console.error("performance page: benchmark history fetch failed:", result.reason);
    }
  }

  const livePriceByTicker = new Map<string, number>();
  for (const q of quotes) {
    livePriceByTicker.set(q.symbol, q.regularMarketPrice);
  }

  // Pick returns don't depend on which benchmark is selected, so resolve
  // once against QQQ's window for the equity curve / sim / calibration
  // (all benchmark-independent) ...
  const resolved = resolvePicks(picks, benchmarkBarsBySymbol.get("QQQ") ?? [], livePriceByTicker);
  const equityCurve = computeEquityCurve(resolved);
  const sim = computePortfolioSim(resolved);
  const buckets = computeConvictionBuckets(resolved);

  // ... and separately compute a summary per available benchmark, so the
  // comparison card can switch between them client-side with no refetch.
  const availableBenchmarks = BENCHMARKS.filter((b) => benchmarkBarsBySymbol.has(b.symbol));
  const summariesBySymbol: Record<string, BenchmarkSummary> = {};
  for (const b of availableBenchmarks) {
    const resolvedForBenchmark = resolvePicks(picks, benchmarkBarsBySymbol.get(b.symbol)!, livePriceByTicker);
    summariesBySymbol[b.symbol] = computeBenchmarkSummary(resolvedForBenchmark);
  }

  // Sector info is Yahoo-only (zero Gemini cost) and fail-soft per ticker —
  // a lookup failure just falls into "Unknown" in the breakdown rather than
  // dropping the pick or failing the page.
  const uniqueTickers = [...new Set(picks.map((p) => p.ticker))];
  const sectorResults = await Promise.allSettled(
    uniqueTickers.map(async (ticker) => ({ ticker, info: await getSectorInfo(ticker) }))
  );
  const sectorByTicker = new Map<string, string | null>();
  for (const result of sectorResults) {
    if (result.status === "fulfilled") {
      sectorByTicker.set(result.value.ticker, result.value.info.sector);
    } else {
      console.error("performance page: sector info fetch failed:", result.reason);
    }
  }

  const winRateSummary = computeWinRate(picks);
  const sectorBuckets = computeSectorBreakdown(picks, sectorByTicker, livePriceByTicker);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hypothetical performance across every pick, benchmarked against the index or commodity of your choice.
        </p>
      </div>
      <BenchmarkComparisonCard summariesBySymbol={summariesBySymbol} benchmarks={availableBenchmarks} />
      <EquityCurveChart points={equityCurve} />
      <PortfolioSimCard sim={sim} />
      <ConvictionCalibrationTable buckets={buckets} />
      <WinRateCard summary={winRateSummary} />
      <SectorBreakdownChart buckets={sectorBuckets} />
    </div>
  );
}
