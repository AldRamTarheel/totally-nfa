import { z } from "zod";
import { getHistorical, type OhlcvBar } from "@/lib/data/yahoo";
import { generateStructured } from "@/lib/gemini/client";
import type { TechnicalAgentOutput } from "@/lib/types";

const technicalOutputSchema = z.object({
  ticker: z.string().min(1),
  trend: z.enum(["uptrend", "downtrend", "sideways"]),
  technicalNotes: z.string().min(1),
  suggestedInvalidationPrice: z.number().positive(),
});

function sma(bars: OhlcvBar[], period: number): number | null {
  if (bars.length < period) return null;
  const window = bars.slice(-period);
  return window.reduce((sum, b) => sum + b.close, 0) / period;
}

interface DerivedIndicators {
  lastClose: number;
  sma20: number | null;
  sma50: number | null;
  avgVolume20d: number;
  latestVolume: number;
  volumeRatio: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  pctFromHigh: number;
  pctFromLow: number;
}

function deriveIndicators(bars: OhlcvBar[]): DerivedIndicators {
  const lastClose = bars.at(-1)?.close ?? 0;
  const closes = bars.map((b) => b.close);
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const avgVolume20d =
    bars.slice(-20).reduce((sum, b) => sum + b.volume, 0) / Math.max(1, Math.min(20, bars.length));
  const latestVolume = bars.at(-1)?.volume ?? 0;

  return {
    lastClose,
    sma20: sma(bars, 20),
    sma50: sma(bars, 50),
    avgVolume20d,
    latestVolume,
    volumeRatio: avgVolume20d > 0 ? latestVolume / avgVolume20d : 1,
    fiftyTwoWeekHigh: high,
    fiftyTwoWeekLow: low,
    pctFromHigh: high > 0 ? ((lastClose - high) / high) * 100 : 0,
    pctFromLow: low > 0 ? ((lastClose - low) / low) * 100 : 0,
  };
}

/**
 * Technical Agent: computes trend/volume/consolidation indicators in plain
 * TS (cheap, deterministic), then asks Gemini to interpret the *derived*
 * numbers — never raw OHLCV — into a trend call and a reasonable invalidation
 * price for a bullish thesis.
 */
export async function runTechnicalAgent(ticker: string): Promise<TechnicalAgentOutput> {
  const bars = await getHistorical(ticker);
  const indicators = deriveIndicators(bars);

  const prompt = `You are a technical analyst for an educational stock-picking tool.

Ticker: ${ticker}
Derived technical indicators from the last ~90 trading days:
${JSON.stringify(indicators, null, 2)}

Assess trend strength (uptrend/downtrend/sideways) and volume behavior (is a recent volume spike or tight consolidation visible from these numbers?). Suggest a reasonable invalidation price: a support-level price that, if closed below, would disprove a bullish thesis on this ticker (should be below the last close, typically near a recent swing low or the 50-day average).

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "ticker": "${ticker}",
  "trend": "uptrend" | "downtrend" | "sideways",
  "technicalNotes": "2-3 sentences on trend/volume",
  "suggestedInvalidationPrice": number
}`;

  return generateStructured(prompt, technicalOutputSchema);
}
