import { z } from "zod";
import { getInsiderActivity, getInsiderSentiment } from "@/lib/data/insider-scraper";
import { generateStructured } from "@/lib/gemini/client";
import type { InsiderAgentOutput } from "@/lib/types";

const insiderOutputSchema = z.object({
  candidates: z
    .array(
      z.object({
        ticker: z.string().min(1),
        insiderSentiment: z.enum(["bullish", "bearish", "neutral"]),
        rationale: z.string().min(1),
      })
    )
    .max(5),
});

const CANDIDATE_POOL_SIZE = 8;

/**
 * Insider/Fundamental Agent: scans OpenInsider's cluster-buy feed for
 * candidate tickers with unusually high-conviction insider accumulation,
 * then asks Gemini to rank the strongest few.
 */
export async function runInsiderAgent(): Promise<InsiderAgentOutput> {
  const clusterBuys = await getInsiderActivity(); // site-wide cluster buy discovery

  // Dedup to unique tickers, ranked by total purchase value in the feed, cap the pool
  // so we don't hammer per-ticker pages or blow up the prompt.
  const byTicker = new Map<string, number>();
  for (const trade of clusterBuys) {
    if (trade.transactionType !== "P") continue;
    byTicker.set(trade.ticker, (byTicker.get(trade.ticker) ?? 0) + trade.totalValue);
  }
  const topTickers = [...byTicker.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATE_POOL_SIZE)
    .map(([ticker]) => ticker);

  if (topTickers.length === 0) {
    return { candidates: [] };
  }

  const sentiments = await Promise.all(topTickers.map((t) => getInsiderSentiment(t)));

  const prompt = `You are an insider-activity analyst for an educational stock-picking tool.

Candidate tickers currently showing cluster insider buying, with their 90-day insider trade summary:
${JSON.stringify(sentiments, null, 2)}

From these candidates, identify up to 5 tickers with the strongest, most credible insider-conviction bullish signal (multiple insiders buying, meaningful dollar amounts relative to sells). Explain each briefly.

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "candidates": [
    { "ticker": "TICK", "insiderSentiment": "bullish" | "bearish" | "neutral", "rationale": "1-2 sentences" }
  ]
}`;

  return generateStructured(prompt, insiderOutputSchema);
}
