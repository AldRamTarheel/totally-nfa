import { isAuthorizedCronRequest, unauthorizedResponse } from "@/lib/cron-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { runMacroAgent } from "@/lib/agents/macro-agent";
import { runInsiderAgent } from "@/lib/agents/insider-agent";
import { runSynthesisEngine } from "@/lib/agents/synthesis-engine";
import { runPortfolioReviewAgent, type PortfolioReviewInput } from "@/lib/agents/portfolio-review-agent";
import { getQuote, getQuotes } from "@/lib/data/yahoo";
import { sendNtfyNotification, getNtfyTopic } from "@/lib/notifications/ntfy";
import { notifyClosures } from "@/lib/notifications/position-alerts";
import { closeHitPositions } from "@/lib/position-monitor";
import { sendCronFailureNotification } from "@/lib/notifications/cron-failure";
import { logPipelineRun } from "@/lib/pipeline-log";
import type { PickDetails, StockPick } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
// Give the pipeline room to ride out Gemini free-tier rate-limit waits.
// Vercel caps this to whatever the plan allows (60s on Hobby); harmless to
// request more.
export const maxDuration = 120;

/**
 * True if today's daily-pick decision (pick / duplicate / no-pick) has
 * already been made and logged. Multiple schedulers now hit this endpoint
 * as independent backups for each other (Vercel Cron, GitHub Actions,
 * cron-job.org) since none of them alone has proven reliable on the free
 * tier — Vercel Hobby cron has both silently skipped entire days AND fired
 * up to an hour late, sometimes landing right on top of a manual retry.
 * Without this guard, every redundant trigger burns the macro+insider
 * Gemini calls again just to re-derive "nothing new" — this happened for
 * real on 2026-08-27 (two full picks minutes apart from one manual trigger
 * plus one very-late Vercel fire). A prior 'error' doesn't count as
 * "already handled" — a retry after a genuine failure should still run.
 */
async function alreadyHandledToday(supabase: SupabaseClient): Promise<boolean> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("pipeline_runs")
    .select("id")
    .eq("job", "daily-pick")
    .in("status", ["picked", "duplicate", "no-pick"])
    .gte("created_at", startOfDayUtc.toISOString())
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Sends the "nothing new today" notification — a genuine daily check-in
 * instead of silence, so a run of quiet days never feels like the app went
 * dark. Reviews whatever's currently active (if anything) via the
 * Portfolio Review Agent (one Gemini call regardless of portfolio size) and
 * logs the same summary to the Pipeline Run Log.
 */
async function sendNoPickUpdate(
  supabase: SupabaseClient,
  topic: string,
  status: "no-pick" | "duplicate",
  reason: string
): Promise<void> {
  const { data: active } = await supabase.from("stock_picks").select("*").eq("status", "active");
  const activePicks = (active ?? []) as StockPick[];

  let summary: string;
  if (activePicks.length === 0) {
    summary = `${reason} No active positions to review yet.`;
  } else {
    const quotes = await getQuotes(activePicks.map((p) => p.ticker));
    const priceByTicker = new Map(quotes.map((q) => [q.symbol, q.regularMarketPrice]));
    const reviewInputs: PortfolioReviewInput[] = activePicks.map((pick) => ({
      pick,
      livePrice: priceByTicker.get(pick.ticker) ?? pick.last_checked_price ?? pick.alert_price,
    }));
    const review = await runPortfolioReviewAgent(reviewInputs);
    summary = `${reason} ${review.summary}`;
  }

  await logPipelineRun(supabase, { job: "daily-pick", status, message: summary });
  await sendNtfyNotification({
    topic,
    title: "No New Pick Today",
    message: summary,
    tags: ["bar_chart"],
  });
}

async function handle(req: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) return unauthorizedResponse();

  let supabase: SupabaseClient | undefined;

  try {
    supabase = getServerSupabase();
    const topic = await getNtfyTopic(supabase);

    // 1. Check every active pick against its invalidation/target levels
    // FIRST, before spending any Gemini quota on a new pick — exits matter
    // more than new ideas, and this is the only time in the day this runs.
    const closures = await closeHitPositions(supabase);
    await notifyClosures(topic, closures);

    // 1b. If today's pick decision was already made by an earlier trigger
    // (a different scheduler, or a manual retry), stop here — no Gemini
    // calls, no duplicate notification. Position exits above still run
    // every time regardless, since those are free (Yahoo-only) and time-
    // sensitive no matter how many schedulers fire.
    if (await alreadyHandledToday(supabase)) {
      return Response.json({ status: "already-handled-today", closures });
    }

    // 2. Run the reasoning pipeline: macro -> insider (2 Gemini calls).
    const [macroResult, insider] = await Promise.all([runMacroAgent(), runInsiderAgent()]);
    const { analysis: macro, news: macroNews, markets } = macroResult;

    if (insider.candidates.length === 0) {
      await sendNoPickUpdate(supabase, topic, "no-pick", "No insider-conviction candidates surfaced today.");
      return Response.json({ status: "no-pick", reason: "no-candidates", closures });
    }

    // 3. Find the highest-ranked candidate that ISN'T already an active
    // pick — a cheap DB check, no Gemini cost — instead of only ever
    // looking at candidate #1. Without this, a ticker that keeps
    // resurfacing as the top insider candidate would silently block the
    // pipeline from ever considering anything else once it's already held.
    const { data: activeRows } = await supabase.from("stock_picks").select("ticker").eq("status", "active");
    const activeTickers = new Set((activeRows ?? []).map((r) => r.ticker as string));
    const freshCandidate = insider.candidates.find((c) => !activeTickers.has(c.ticker));

    if (!freshCandidate) {
      await sendNoPickUpdate(
        supabase,
        topic,
        "duplicate",
        "Today's strongest insider candidates are all already active picks — nothing new to add."
      );
      return Response.json({ status: "duplicate-active", closures });
    }

    // 4. Run synthesis on that one fresh candidate (technical + synthesis —
    // the other 2 Gemini calls in the normal 4-call daily budget).
    const { pick: synthesis, technical, tickerNews } = await runSynthesisEngine({
      macro,
      insider,
      candidate: freshCandidate,
    });

    if (!synthesis.ticker) {
      await sendNoPickUpdate(supabase, topic, "no-pick", synthesis.thesis);
      return Response.json({ status: "no-pick", reason: synthesis.thesis, closures });
    }

    // Belt-and-suspenders re-check right before insert (the DB's own unique
    // active-ticker index is the real backstop if this ever races).
    const { data: existing, error: lookupError } = await supabase
      .from("stock_picks")
      .select("id")
      .eq("ticker", synthesis.ticker)
      .eq("status", "active")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      await sendNoPickUpdate(
        supabase,
        topic,
        "duplicate",
        `${synthesis.ticker} became an active pick moments ago — nothing new to add.`
      );
      return Response.json({ status: "duplicate-active", ticker: synthesis.ticker, closures });
    }

    // 5. Current price becomes the alert price.
    const quote = await getQuote(synthesis.ticker);

    // 6. Build the structured breakdown + source references for the pick
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

    // 7. Persist the pick.
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

    await logPipelineRun(supabase, { job: "daily-pick", status: "picked", ticker: synthesis.ticker });

    // 8. Notify. Exactly one notification fires per day either way — this
    // is the "new pick" version; sendNoPickUpdate covers every other path.
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
    await sendCronFailureNotification("daily-pick", err).catch((notifyErr) => {
      console.error("daily-pick: failed to send cron failure notification:", notifyErr);
    });
    if (supabase) {
      await logPipelineRun(supabase, {
        job: "daily-pick",
        status: "error",
        message: (err as Error).message,
      }).catch(() => {});
    }
    return Response.json({ status: "error", message: (err as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
