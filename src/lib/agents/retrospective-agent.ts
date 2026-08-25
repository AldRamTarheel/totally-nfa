import { z } from "zod";
import { generateStructured } from "@/lib/gemini/client";
import type { RetrospectiveAgentOutput, StockPick } from "@/lib/types";

const retrospectiveOutputSchema = z.object({
  summary: z.string().min(1),
  stats: z.object({
    pickCount: z.number(),
    winRate: z.number(),
    avgReturnPct: z.number(),
    bestPick: z.object({ ticker: z.string(), returnPct: z.number() }).optional(),
    worstPick: z.object({ ticker: z.string(), returnPct: z.number() }).optional(),
  }),
});

export interface GradedPick extends StockPick {
  returnPct: number;
  hitInvalidation: boolean;
}

/**
 * Weekly Auto-Grading Agent: reviews the week's picks against their live
 * prices and writes a plain-language retrospective. Stats are computed
 * deterministically in TS first; Gemini only writes the narrative summary
 * (and echoes the stats back so both live in one persisted JSON blob).
 */
export async function runRetrospectiveAgent(graded: GradedPick[]): Promise<RetrospectiveAgentOutput> {
  if (graded.length === 0) {
    return {
      summary: "No picks were made this week, so there is nothing to grade.",
      stats: { pickCount: 0, winRate: 0, avgReturnPct: 0 },
    };
  }

  const wins = graded.filter((g) => g.returnPct > 0);
  const winRate = (wins.length / graded.length) * 100;
  const avgReturnPct = graded.reduce((sum, g) => sum + g.returnPct, 0) / graded.length;
  const sorted = [...graded].sort((a, b) => b.returnPct - a.returnPct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const stats = {
    pickCount: graded.length,
    winRate,
    avgReturnPct,
    bestPick: { ticker: best.ticker, returnPct: best.returnPct },
    worstPick: { ticker: worst.ticker, returnPct: worst.returnPct },
  };

  const prompt = `You are an honest, self-critical AI reviewing your own stock picks from the past week for an educational tool. Do not sugarcoat losses.

This week's graded picks (returnPct = % change from alert price to current price):
${JSON.stringify(
  graded.map((g) => ({
    ticker: g.ticker,
    thesis: g.thesis,
    convictionScore: g.conviction_score,
    alertPrice: g.alert_price,
    livePrice: g.last_checked_price,
    returnPct: Number(g.returnPct.toFixed(2)),
    hitInvalidation: g.hitInvalidation,
  })),
  null,
  2
)}

Computed stats: ${JSON.stringify(stats, null, 2)}

Write a 3-5 sentence retrospective: what worked, what didn't, and any pattern worth noting (e.g. did high-conviction picks actually outperform?). Be specific about tickers.

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "summary": "3-5 sentence retrospective",
  "stats": ${JSON.stringify(stats)}
}`;

  return generateStructured(prompt, retrospectiveOutputSchema);
}
