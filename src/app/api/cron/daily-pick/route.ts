import { isAuthorizedCronRequest, unauthorizedResponse } from "@/lib/cron-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { runMacroAgent } from "@/lib/agents/macro-agent";
import { runInsiderAgent } from "@/lib/agents/insider-agent";
import { runSynthesisEngine } from "@/lib/agents/synthesis-engine";
import { getQuote } from "@/lib/data/yahoo";
import { sendNtfyNotification, getNtfyTopic } from "@/lib/notifications/ntfy";

export const dynamic = "force-dynamic";
// Give the pipeline room to ride out Gemini free-tier rate-limit waits.
// Vercel caps this to whatever the plan allows (60s on Hobby); harmless to
// request more.
export const maxDuration = 120;

async function handle(req: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) return unauthorizedResponse();

  try {
    // 1. Run the reasoning pipeline: macro -> insider -> synthesis (which
    // internally runs the technical agent on the insider candidates).
    const [macro, insider] = await Promise.all([runMacroAgent(), runInsiderAgent()]);
    const synthesis = await runSynthesisEngine({ macro, insider });

    if (!synthesis.ticker) {
      return Response.json({ status: "no-pick", reason: synthesis.thesis });
    }

    const supabase = getServerSupabase();

    // 2. De-dup: skip if this ticker already has an active pick.
    const { data: existing, error: lookupError } = await supabase
      .from("stock_picks")
      .select("id")
      .eq("ticker", synthesis.ticker)
      .eq("status", "active")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      return Response.json({ status: "duplicate-active", ticker: synthesis.ticker });
    }

    // 3. Current price becomes the alert price.
    const quote = await getQuote(synthesis.ticker);

    // 4. Persist the pick.
    const { error: insertError } = await supabase.from("stock_picks").insert({
      ticker: synthesis.ticker,
      alert_price: quote.regularMarketPrice,
      last_checked_price: quote.regularMarketPrice,
      last_checked_at: new Date().toISOString(),
      conviction_score: synthesis.convictionScore,
      invalidation_price: synthesis.invalidationPrice,
      insider_sentiment: synthesis.insiderSentiment,
      thesis: synthesis.thesis,
      category: synthesis.category,
      tags: synthesis.tags,
      status: "active",
    });
    if (insertError) throw insertError;

    // 5. Notify.
    const topic = await getNtfyTopic(supabase);
    await sendNtfyNotification({
      topic,
      title: `New Pick: ${synthesis.ticker} (Conviction ${synthesis.convictionScore}/10)`,
      message: synthesis.thesis,
      tags: ["chart_with_upwards_trend"],
    });

    return Response.json({ status: "created", ticker: synthesis.ticker, convictionScore: synthesis.convictionScore });
  } catch (err) {
    console.error("daily-pick cron failed:", err);
    return Response.json({ status: "error", message: (err as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
