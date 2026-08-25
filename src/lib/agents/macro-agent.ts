import { z } from "zod";
import { getMacroSnapshot } from "@/lib/data/yahoo";
import { getMacroNews, type NewsHeadline } from "@/lib/data/news";
import { getMacroRelevantMarkets, type PredictionMarket } from "@/lib/data/polymarket";
import { generateStructured } from "@/lib/gemini/client";
import type { MacroAgentOutput } from "@/lib/types";

const macroOutputSchema = z.object({
  regime: z.enum(["risk-on", "risk-off", "neutral"]),
  summary: z.string().min(1),
  keyFactors: z.array(z.string()).min(1),
});

export interface MacroAgentResult {
  analysis: MacroAgentOutput;
  // The raw news/market data the analysis drew on, kept around so the route
  // can persist them as clickable references on the pick detail page.
  news: NewsHeadline[];
  markets: PredictionMarket[];
}

/**
 * Macro/Context Agent: assesses overall market risk appetite from index/
 * commodity proxies, recent macro headlines, and prediction-market odds.
 */
export async function runMacroAgent(): Promise<MacroAgentResult> {
  const [quotes, news, markets] = await Promise.all([
    getMacroSnapshot(),
    getMacroNews(8),
    getMacroRelevantMarkets(),
  ]);

  const prompt = `You are a macro context analyst for an educational stock-picking tool.

Market proxy quotes (QQQ = tech/growth, GLD = gold/safe-haven, USO = oil):
${JSON.stringify(quotes, null, 2)}

Recent macro headlines:
${news.map((n) => `- ${n.title} (${n.source ?? "unknown source"}, ${n.pubDate})`).join("\n")}

Prediction market odds relevant to the macro backdrop (Fed policy, recession, inflation):
${markets.map((m) => `- "${m.question}": ${m.outcomes.map((o) => `${o.name} ${(o.probability * 100).toFixed(0)}%`).join(", ")}`).join("\n")}

Based only on this data, classify the current market regime and summarize the tailwinds/headwinds relevant to picking a single US equity today.

Respond with ONLY JSON matching this exact shape, no markdown fences:
{
  "regime": "risk-on" | "risk-off" | "neutral",
  "summary": "2-3 sentence summary of the current regime",
  "keyFactors": ["short bullet", "short bullet", ...]
}`;

  const analysis = await generateStructured(prompt, macroOutputSchema);
  return { analysis, news, markets };
}
