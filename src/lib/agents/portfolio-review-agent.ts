import { z } from "zod";
import { getNewsForTicker } from "@/lib/data/news";
import { generateStructured } from "@/lib/gemini/client";
import { computePnlPercent } from "@/lib/pnl";
import type { StockPick } from "@/lib/types";

const portfolioReviewSchema = z.object({
  summary: z.string().min(1),
  pickNotes: z.array(
    z.object({
      ticker: z.string().min(1),
      note: z.string().min(1),
      sentimentShift: z.enum(["improving", "stable", "weakening"]),
    })
  ),
});

export interface PortfolioReviewOutput {
  summary: string;
  pickNotes: { ticker: string; note: string; sentimentShift: "improving" | "stable" | "weakening" }[];
}

export interface PortfolioReviewInput {
  pick: StockPick;
  livePrice: number;
}

/**
 * Portfolio Review Agent: runs whenever the daily pipeline doesn't produce a
 * new pick, so a quiet day still gets an honest check-in instead of
 * silence. Reviews EVERY currently-active position together in ONE Gemini
 * call (never one call per ticker) — bounded quota regardless of portfolio
 * size — pulling fresh news per ticker to judge whether the original thesis
 * is holding up, fading, or worth watching more closely.
 */
export async function runPortfolioReviewAgent(inputs: PortfolioReviewInput[]): Promise<PortfolioReviewOutput> {
  if (inputs.length === 0) {
    return { summary: "No active positions to review.", pickNotes: [] };
  }

  const context = await Promise.all(
    inputs.map(async ({ pick, livePrice }) => ({
      ticker: pick.ticker,
      thesis: pick.thesis,
      convictionScore: pick.conviction_score,
      alertPrice: pick.alert_price,
      livePrice,
      returnPct: Number(computePnlPercent(pick.alert_price, livePrice).toFixed(2)),
      invalidationPrice: pick.invalidation_price,
      targetPrice: pick.target_price,
      recentNews: (await getNewsForTicker(pick.ticker, 4)).map(
        (n) => `${n.title} (${n.source ?? "unknown"})`
      ),
    }))
  );

  const prompt = `You are reviewing an educational AI stock-picking tool's currently active positions on a day it found no new pick worth making. Be honest, not promotional — if conviction is fading, say so plainly.

ACTIVE POSITIONS:
${JSON.stringify(context, null, 2)}

For each position, write a short note (1-2 sentences) on whether the original thesis still holds up given the fresh news and price action — explicitly judge whether conviction looks like it's improving, stable, or weakening, and whether it still seems worth holding, worth watching more closely, or worth reconsidering. This is educational commentary only, not a real trading instruction.

Then write one overall summary paragraph (2-3 sentences) covering the portfolio as a whole, written for a push notification (a real person will read this on their phone).

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "summary": "2-3 sentence overall summary",
  "pickNotes": [
    { "ticker": "TICK", "note": "1-2 sentences", "sentimentShift": "improving" | "stable" | "weakening" }
  ]
}`;

  return generateStructured(prompt, portfolioReviewSchema);
}
