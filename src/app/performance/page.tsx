import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BenchmarkComparisonCard } from "@/components/performance/benchmark-comparison-card";
import { EquityCurveChart } from "@/components/performance/equity-curve-chart";
import { PortfolioSimCard } from "@/components/performance/portfolio-sim-card";
import { ConvictionCalibrationTable } from "@/components/performance/conviction-calibration-table";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { getHistorical, getQuotes } from "@/lib/data/yahoo";
import {
  resolvePicks,
  computeBenchmarkSummary,
  computeEquityCurve,
  computePortfolioSim,
  computeConvictionBuckets,
} from "@/lib/analytics/performance";
import type { StockPick } from "@/lib/types";

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
  const [qqqBars, quotes] = await Promise.all([
    getHistorical("QQQ", { period1: new Date(picks[0].created_at) }),
    activeTickers.length > 0 ? getQuotes(activeTickers) : Promise.resolve([]),
  ]);

  const livePriceByTicker = new Map<string, number>();
  for (const q of quotes) {
    livePriceByTicker.set(q.symbol, q.regularMarketPrice);
  }

  const resolved = resolvePicks(picks, qqqBars, livePriceByTicker);
  const summary = computeBenchmarkSummary(resolved);
  const equityCurve = computeEquityCurve(resolved);
  const sim = computePortfolioSim(resolved);
  const buckets = computeConvictionBuckets(resolved);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hypothetical performance across every pick, benchmarked against QQQ.
        </p>
      </div>
      <BenchmarkComparisonCard summary={summary} />
      <EquityCurveChart points={equityCurve} />
      <PortfolioSimCard sim={sim} />
      <ConvictionCalibrationTable buckets={buckets} />
    </div>
  );
}
