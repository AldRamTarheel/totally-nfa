import { z } from "zod";
import { getNewsForTicker, type NewsHeadline } from "@/lib/data/news";
import { generateStructured } from "@/lib/gemini/client";
import type {
  MacroAgentOutput,
  InsiderAgentOutput,
  InsiderCandidate,
  TechnicalAgentOutput,
  SynthesisOutput,
} from "@/lib/types";
import { runTechnicalAgent } from "@/lib/agents/technical-agent";

export const synthesisOutputSchema = z.object({
  ticker: z.string().min(1).nullable(),
  convictionScore: z.number().int().min(1).max(10),
  invalidationPrice: z.number().positive(),
  targetPrice: z.number().positive(),
  thesis: z.string().min(1),
  insiderSentiment: z.enum(["bullish", "bearish", "neutral"]),
  category: z.string().min(1),
  tags: z.array(z.string()),
});

interface SynthesisInputs {
  macro: MacroAgentOutput;
  insider: InsiderAgentOutput;
  // Which candidate to actually evaluate. Callers decide this — e.g. the
  // daily-pick route skips candidates that are already active picks (a free
  // DB check) before spending any Gemini quota, so a persistently top-ranked
  // ticker doesn't block a genuinely new opportunity from ever being
  // considered. Defaults to the top-ranked candidate if omitted.
  candidate?: InsiderCandidate;
}

export interface SynthesisResult {
  pick: SynthesisOutput;
  // Carried through for persistence on the pick detail page — not part of
  // the AI's decision output itself.
  technical: TechnicalAgentOutput | null;
  tickerNews: NewsHeadline[];
}

function noPick(reason: string): SynthesisResult {
  return {
    pick: {
      ticker: null,
      convictionScore: 1,
      invalidationPrice: 0,
      targetPrice: 0,
      thesis: reason,
      insiderSentiment: "neutral",
      category: "no-pick",
      tags: [],
    },
    technical: null,
    tickerNews: [],
  };
}

/**
 * Synthesis Engine: the only agent that produces the final persisted pick.
 * Runs the Technical Agent against the insider agent's single top-ranked
 * candidate, pulls that candidate's recent news, and asks Gemini to make one
 * bold, well-justified call (or explicitly decline with ticker: null).
 */
export async function runSynthesisEngine(inputs: SynthesisInputs): Promise<SynthesisResult> {
  const { macro, insider } = inputs;

  if (insider.candidates.length === 0) {
    return noPick("No insider-conviction candidates surfaced today.");
  }

  // Only run the Technical Agent on a single candidate (not several in
  // parallel) — Gemini's free tier caps at ~5 requests per minute, and this
  // pipeline already makes 4 calls total (macro, insider, technical,
  // synthesis) in one run. Bursting parallel technical calls on top of that
  // reliably blows the quota.
  const primaryTicker = (inputs.candidate ?? insider.candidates[0]).ticker;
  let technical: TechnicalAgentOutput | null = null;
  try {
    technical = await runTechnicalAgent(primaryTicker);
  } catch (err) {
    console.error(`Technical agent failed for ${primaryTicker}:`, err);
  }

  if (!technical) {
    return noPick(`Technical data unavailable for today's top insider candidate (${primaryTicker}).`);
  }

  const tickerNews = await getNewsForTicker(primaryTicker, 6);

  const prompt = `You are the synthesis engine of an educational, "for entertainment/education only" AI stock-picking tool. You connect macro narrative, insider conviction, and technical setup into ONE bold, well-justified equity pick on a single candidate ticker — or you explicitly decline if it isn't compelling.

MACRO CONTEXT:
${JSON.stringify(macro, null, 2)}

ALL INSIDER CANDIDATES CONSIDERED TODAY (for context; you are only evaluating one of them, shown below):
${JSON.stringify(insider.candidates, null, 2)}

CANDIDATE UNDER EVALUATION: ${primaryTicker}
TECHNICAL READ:
${JSON.stringify(technical, null, 2)}

RECENT NEWS ON ${primaryTicker}:
${tickerNews.map((n) => `- ${n.title} (${n.source ?? "unknown"}, ${n.pubDate})`).join("\n") || "No recent headlines found."}

Decide whether ${primaryTicker} has a strong enough combined case (set ticker to "${primaryTicker}"), or decline (set ticker to null) if it isn't compelling enough for a real conviction call. Assign:
- a conviction score 1-10 (10 = extremely high conviction)
- an invalidation price: a specific downside price level that, if closed below, disproves the thesis (use the technical agent's suggestion as a starting point, adjust if warranted)
- a target price: a specific realistic upside price level (a take-profit goal — e.g. near a prior resistance/swing high) where the thesis would be considered played out and worth exiting
- a 2-4 sentence thesis that explicitly connects the macro regime, insider signal, and technical setup

Also assign a short category label (e.g. "insider-cluster-buy", "macro-momentum", "earnings-catalyst") and a few lowercase tags.

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "ticker": "${primaryTicker}" | null,
  "convictionScore": number (1-10 integer),
  "invalidationPrice": number,
  "targetPrice": number,
  "thesis": "2-4 sentences",
  "insiderSentiment": "bullish" | "bearish" | "neutral",
  "category": "short-label",
  "tags": ["tag1", "tag2"]
}`;

  const pick = await generateStructured(prompt, synthesisOutputSchema);
  return { pick, technical, tickerNews };
}
