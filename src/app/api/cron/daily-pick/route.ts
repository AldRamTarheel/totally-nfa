import { isAuthorizedCronRequest, unauthorizedResponse } from "@/lib/cron-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { runMacroAgent } from "@/lib/agents/macro-agent";
import { runInsiderAgent } from "@/lib/agents/insider-agent";
import { runSynthesisEngine } from "@/lib/agents/synthesis-engine";
import { getQuote } from "@/lib/data/yahoo";
import { sendNtfyNotification, getNtfyTopic } from "@/lib/notifications/ntfy";
import { notifyClosures } from "@/lib/notifications/position-alerts";
import { closeHitPositions } from "@/lib/position-monitor";
import type { PickDetails } from "@/lib/types";

export const dynamic = "force-dynamic";
// Give the pipeline room to ride out Gemini free-tier rate-limit waits.
// Vercel caps this to whatever the plan allows (60s on Hobby); harmless to
// request more.
export const maxDuration = 120;

async function handle(req: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) return unauthorizedResponse();

  try {
    const supabase = getServerSupabase();
    const topic = await getNtfyTopic(supabase);

    // 1. Check every active pick against its invalidation/target levels
    // FIRST, before spending any Gemini quota on a new pick — exits matter
    // more than new ideas, and this is the only time in the day this runs.
    const closures = await closeHitPositions(supabase);
    await notifyClosures(topic, closures);

    // 2. Run the reasoning pipeline: macro -> insider -> synthesis (which
    // internally runs the technical agent on the insider candidates).
    const [macroResult, insider] = await Promise.all([runMacroAgent(), runInsiderAgent()]);
    const { analysis: macro, news: macroNews, markets } = macroResult;
    const { pick: synthesis, technical, tickerNews } = await runSynthesisEngine({ macro, insider });

    if (!synthesis.ticker) {
      return Response.json({ status: "no-pick", reason: synthesis.thesis, closures });
    }

    // 3. De-dup: skip if this ticker already has an active pick.
    const { data: existing, error: lookupError } = await supabase
      .from("stock_picks")
      .select("id")
      .eq("ticker", synthesis.ticker)
      .eq("status", "active")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      return Response.json({ status: "duplicate-active", ticker: synthesis.ticker, closures });
    }

    // 4. Current price becomes the alert price.
    const quote = await getQuote(synthesis.ticker);

    // 5. Build the structured breakdown + source references for the pick
    // detail page — everything here is either an already-fetched real URL
    // (news articles, prediction markets) or deterministic from the ticker
    // (Yahoo Finance, OpenInsider).
    const details: PickDetails = {
      macro: { regime: macro.regime, summary: macro.summary, keyFactors: macro.keyFactors },
      insider: { candidates: insider.candidates },
      technical: technical ? { trend: technical.trend, notes: technical.technicalNotes } : undefined,
      references: {
        tickerNews: tickerNews.map((n) => ({ title: n.title, url: n.link, source: n.source })),
        macroNews: macroNews.map((n) => ({ title: n.title, url: n.link, source: n.source })),
        markets: markets.map((m) => ({
          question: m.question,
          url: `https://polymarket.com/event/${m.slug}`,
          outcomes: m.outcomes,
        })),
        yahooFinanceUrl: `https://finance.yahoo.com/quote/${synthesis.ticker}`,
        openInsiderUrl: `http://openinsider.com/screener?s=${synthesis.ticker}`,
      },
    };

    // 6. Persist the pick.
    const { error: insertError } = await supabase.from("stock_picks").insert({
      ticker: synthesis.ticker,
      alert_price: quote.regularMarketPrice,
      last_checked_price: quote.regularMarketPrice,
      last_checked_at: new Date().toISOString(),
      conviction_score: synthesis.convictionScore,
      invalidation_price: synthesis.invalidationPrice,
      target_price: synthesis.targetPrice,
      insider_sentiment: synthesis.insiderSentiment,
      thesis: synthesis.thesis,
      category: synthesis.category,
      tags: synthesis.tags,
      status: "active",
      details,
    });
    if (insertError) throw insertError;

    // 7. Notify.
    await sendNtfyNotification({
      topic,
      title: `New Pick: ${synthesis.ticker} (Conviction ${synthesis.convictionScore}/10)`,
      message: synthesis.thesis,
      tags: ["chart_with_upwards_trend"],
    });

    return Response.json({
      status: "created",
      ticker: synthesis.ticker,
      convictionScore: synthesis.convictionScore,
      closures,
    });
  } catch (err) {
    console.error("daily-pick cron failed:", err);
    return Response.json({ status: "error", message: (err as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
