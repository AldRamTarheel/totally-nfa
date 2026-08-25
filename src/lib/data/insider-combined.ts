import * as openInsider from "@/lib/data/insider-scraper";
import * as finviz from "@/lib/data/finviz-scraper";
import { summarizeInsiderTrades } from "@/lib/data/insider-scraper";
import type { InsiderTrade, InsiderSentimentSummary } from "@/lib/data/insider-scraper";

/**
 * OpenInsider and Finviz both surface the same underlying SEC Form 4
 * filings, so naively concatenating their results double-counts every
 * transaction both sites report — inflating conviction. Dedup on the
 * numeric/date fields (ticker, date, shares, price), which describe the
 * same real-world filing regardless of how each site formats the insider's
 * name.
 */
function dedupeTrades(trades: InsiderTrade[]): InsiderTrade[] {
  const seen = new Set<string>();
  const deduped: InsiderTrade[] = [];
  for (const t of trades) {
    const key = `${t.ticker}|${t.transactionDate.toDateString()}|${t.shares}|${t.pricePerShare}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }
  return deduped;
}

/**
 * Insider activity merged across OpenInsider (primary) and Finviz
 * (supplement/backup), deduplicated. If one source fails or changes its
 * markup, the other still returns results rather than the whole signal
 * going dark.
 */
export async function getCombinedInsiderActivity(ticker?: string): Promise<InsiderTrade[]> {
  const [primary, secondary] = await Promise.allSettled([
    openInsider.getInsiderActivity(ticker),
    finviz.getInsiderActivity(ticker),
  ]);
  const trades = [
    ...(primary.status === "fulfilled" ? primary.value : []),
    ...(secondary.status === "fulfilled" ? secondary.value : []),
  ];
  if (primary.status === "rejected") console.error("OpenInsider fetch failed:", primary.reason);
  if (secondary.status === "rejected") console.error("Finviz fetch failed:", secondary.reason);
  return dedupeTrades(trades);
}

export async function getCombinedInsiderSentiment(ticker: string): Promise<InsiderSentimentSummary> {
  const trades = await getCombinedInsiderActivity(ticker);
  return summarizeInsiderTrades(ticker, trades);
}
