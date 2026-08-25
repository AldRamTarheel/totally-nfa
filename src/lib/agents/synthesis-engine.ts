import { z } from "zod";
import { getNewsForTicker } from "@/lib/data/news";
import { generateStructured } from "@/lib/gemini/client";
import type { MacroAgentOutput, InsiderAgentOutput, TechnicalAgentOutput, SynthesisOutput } from "@/lib/types";
import { runTechnicalAgent } from "@/lib/agents/technical-agent";

export const synthesisOutputSchema = z.object({
  ticker: z.string().min(1).nullable(),
  convictionScore: z.number().int().min(1).max(10),
  invalidationPrice: z.number().positive(),
  thesis: z.string().min(1),
  insiderSentiment: z.enum(["bullish", "bearish", "neutral"]),
  category: z.string().min(1),
  tags: z.array(z.string()),
});

interface SynthesisInputs {
  macro: MacroAgentOutput;
  insider: InsiderAgentOutput;
}

/**
 * Synthesis Engine: the only agent that produces the final persisted pick.
 * Runs the Technical Agent against the insider agent's top candidate(s),
 * pulls that candidate's recent news, and asks Gemini to make one bold,
 * well-justified call (or explicitly decline with ticker: null).
 */
export async function runSynthesisEngine(inputs: SynthesisInputs): Promise<SynthesisOutput> {
  const { macro, insider } = inputs;

  if (insider.candidates.length === 0) {
    return {
      ticker: null,
      convictionScore: 1,
      invalidationPrice: 0,
      thesis: "No insider-conviction candidates surfaced today.",
      insiderSentiment: "neutral",
      category: "no-pick",
      tags: [],
    };
  }

  // Run technical analysis on the top 3 insider candidates in parallel.
  const topCandidates = insider.candidates.slice(0, 3);
  const technicalResults = await Promise.allSettled(
    topCandidates.map((c) => runTechnicalAgent(c.ticker))
  );
  const technical: TechnicalAgentOutput[] = technicalResults
    .filter((r): r is PromiseFulfilledResult<TechnicalAgentOutput> => r.status === "fulfilled")
    .map((r) => r.value);

  if (technical.length === 0) {
    return {
      ticker: null,
      convictionScore: 1,
      invalidationPrice: 0,
      thesis: "Technical data unavailable for today's insider candidates.",
      insiderSentiment: "neutral",
      category: "no-pick",
      tags: [],
    };
  }

  // Pull news for the single top-ranked candidate to keep prompt size small.
  const primaryTicker = topCandidates[0].ticker;
  const news = await getNewsForTicker(primaryTicker, 6);

  const prompt = `You are the synthesis engine of an educational, "for entertainment/education only" AI stock-picking tool. You connect macro narrative, insider conviction, and technical setup into ONE bold, well-justified equity pick — or you explicitly decline if nothing is compelling.

MACRO CONTEXT:
${JSON.stringify(macro, null, 2)}

INSIDER CANDIDATES:
${JSON.stringify(insider.candidates, null, 2)}

TECHNICAL READS ON THOSE CANDIDATES:
${JSON.stringify(technical, null, 2)}

RECENT NEWS ON TOP CANDIDATE (${primaryTicker}):
${news.map((n) => `- ${n.title} (${n.source ?? "unknown"}, ${n.pubDate})`).join("\n") || "No recent headlines found."}

Pick exactly ONE ticker from the candidates above that has the strongest combined case (or set ticker to null if none are compelling enough for a real conviction call). Assign a conviction score 1-10 (10 = extremely high conviction), an invalidation price (a specific price level that, if closed below, disproves the thesis — use the technical agent's suggestion as a starting point, adjust if warranted), and a 2-4 sentence thesis that explicitly connects the macro regime, insider signal, and technical setup. Also assign a short category label (e.g. "insider-cluster-buy", "macro-momentum", "earnings-catalyst") and a few lowercase tags.

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "ticker": "TICK" | null,
  "convictionScore": number (1-10 integer),
  "invalidationPrice": number,
  "thesis": "2-4 sentences",
  "insiderSentiment": "bullish" | "bearish" | "neutral",
  "category": "short-label",
  "tags": ["tag1", "tag2"]
}`;

  return generateStructured(prompt, synthesisOutputSchema);
}
