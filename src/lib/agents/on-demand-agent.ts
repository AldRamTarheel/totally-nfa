import { z } from "zod";
import { subDays } from "date-fns";
import { getQuote, getHistorical } from "@/lib/data/yahoo";
import { getNewsForTicker } from "@/lib/data/news";
import { generateStructured } from "@/lib/gemini/client";

export const onDemandOutputSchema = z.object({
  convictionScore: z.number().int().min(1).max(10),
  invalidationPrice: z.number().positive(),
  targetPrice: z.number().positive(),
  thesis: z.string().min(1),
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  category: z.string().min(1),
  tags: z.array(z.string()),
});

export type OnDemandResult = z.infer<typeof onDemandOutputSchema>;

interface SimpleTechnicalSummary {
  windowDays: number;
  startClose: number;
  lastClose: number;
  pctChangeOverWindow: number;
  avgCloseLast20: number | null;
  pctFromAvgLast20: number | null;
}

/**
 * Cheap, deterministic technical summary computed in plain code — no
 * separate Technical Agent Gemini call here, since this whole feature is
 * budgeted at exactly one Gemini call per request. Mirrors the spirit of
 * technical-agent.ts's deriveIndicators but intentionally simpler.
 */
function summarizeTechnicals(bars: { date: Date; close: number }[]): SimpleTechnicalSummary {
  const startClose = bars.at(0)?.close ?? 0;
  const lastClose = bars.at(-1)?.close ?? 0;
  const last20 = bars.slice(-20);
  const avgCloseLast20 =
    last20.length > 0 ? last20.reduce((sum, b) => sum + b.close, 0) / last20.length : null;

  return {
    windowDays: bars.length,
    startClose,
    lastClose,
    pctChangeOverWindow: startClose > 0 ? ((lastClose - startClose) / startClose) * 100 : 0,
    avgCloseLast20,
    pctFromAvgLast20:
      avgCloseLast20 && avgCloseLast20 > 0 ? ((lastClose - avgCloseLast20) / avgCloseLast20) * 100 : null,
  };
}

/**
 * On-Demand Agent: the single Gemini call behind the public "Ask the AI
 * About a Ticker" box. Deliberately self-contained (no macro-agent or
 * insider-agent call) — gathers only free Yahoo/News data, computes a simple
 * technical summary in plain code, and asks Gemini for one bold-but-justified
 * educational read framed explicitly as a one-off, not a tracked pick.
 *
 * Lets DataFetchError from getQuote/getHistorical propagate — the API route
 * catches it and turns it into a friendly "ticker not found" response.
 */
export async function runOnDemandAgent(ticker: string): Promise<OnDemandResult> {
  const quote = await getQuote(ticker);
  const bars = await getHistorical(ticker, { period1: subDays(new Date(), 90) });
  const technical = summarizeTechnicals(bars);
  const news = await getNewsForTicker(ticker, 6);

  const prompt = `You are the on-demand analyst for an educational, "for entertainment/education only" AI stock-picking tool. A site visitor typed in a ticker and wants ONE bold, well-justified educational read on it right now. This is a one-off, on-demand educational read — not a tracked pick, not financial advice.

TICKER: ${ticker}

LIVE QUOTE:
${JSON.stringify(
  {
    price: quote.regularMarketPrice,
    changePercent: quote.regularMarketChangePercent,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
  },
  null,
  2
)}

SIMPLE TECHNICAL SUMMARY (last ~90 trading days):
${JSON.stringify(technical, null, 2)}

RECENT NEWS:
${news.map((n) => `- ${n.title} (${n.source ?? "unknown"}, ${n.pubDate})`).join("\n") || "No recent headlines found."}

Give a bold-but-justified educational read on ${ticker}. Assign:
- a conviction score 1-10 (10 = extremely high conviction, in either direction)
- an invalidation price: a specific downside price level that, if closed below, disproves your thesis
- a target price: a specific realistic upside price level where the thesis would be considered played out
- a 2-4 sentence thesis grounded in the quote, technical summary, and news above, explicitly noting this is a one-off educational read, not a tracked pick or financial advice
- an overall sentiment ("bullish", "bearish", or "neutral")
- a short category label (e.g. "momentum-breakout", "earnings-catalyst", "value-dip") and a few lowercase tags

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "convictionScore": number (1-10 integer),
  "invalidationPrice": number,
  "targetPrice": number,
  "thesis": "2-4 sentences",
  "sentiment": "bullish" | "bearish" | "neutral",
  "category": "short-label",
  "tags": ["tag1", "tag2"]
}`;

  return generateStructured(prompt, onDemandOutputSchema);
}
