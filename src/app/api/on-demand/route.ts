import { getServerSupabase } from "@/lib/supabase/server";
import { runOnDemandAgent } from "@/lib/agents/on-demand-agent";
import { DataFetchError } from "@/lib/data/yahoo";

export const dynamic = "force-dynamic";
// Give the single Gemini call room to ride out Gemini free-tier rate-limit
// waits, mirroring the cron routes.
export const maxDuration = 60;

const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;
const DAILY_LIMIT = 3;

/**
 * True if today's UTC on-demand-analysis quota (3/day, across all visitors —
 * this is a public, unauthenticated route, so the cap doubles as abuse/cost
 * protection) has already been used up. Mirrors the UTC-day-boundary pattern
 * from alreadyHandledToday in src/app/api/cron/daily-pick/route.ts.
 */
async function dailyLimitReached(supabase: ReturnType<typeof getServerSupabase>): Promise<boolean> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("on_demand_analyses")
    .select("id", { count: "exact", head: true })
    .gte("requested_at", startOfDayUtc.toISOString());
  return (count ?? 0) >= DAILY_LIMIT;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => null)) as { ticker?: unknown } | null;
    const rawTicker = typeof body?.ticker === "string" ? body.ticker : "";
    const ticker = rawTicker.trim().toUpperCase();

    if (!TICKER_PATTERN.test(ticker)) {
      return Response.json(
        { error: "Enter a valid ticker symbol (letters, dots, or dashes only, up to 10 characters)." },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Check the rate limit BEFORE any Gemini/Yahoo call — cost control and
    // general good practice, same principle as isAuthorizedCronRequest
    // running before any external call on the cron routes.
    if (await dailyLimitReached(supabase)) {
      return Response.json(
        { error: "Daily on-demand limit reached (3/day) — try again tomorrow." },
        { status: 429 }
      );
    }

    let result;
    try {
      result = await runOnDemandAgent(ticker);
    } catch (err) {
      if (err instanceof DataFetchError) {
        return Response.json(
          { error: `Couldn't find ticker '${ticker}' — check the symbol and try again.` },
          { status: 404 }
        );
      }
      throw err;
    }

    const requestedAt = new Date().toISOString();
    const { error: insertError } = await supabase.from("on_demand_analyses").insert({
      ticker,
      requested_at: requestedAt,
      conviction_score: result.convictionScore,
      invalidation_price: result.invalidationPrice,
      target_price: result.targetPrice,
      thesis: result.thesis,
      sentiment: result.sentiment,
      category: result.category,
      tags: result.tags,
    });
    if (insertError) throw insertError;

    return Response.json({
      ticker,
      convictionScore: result.convictionScore,
      invalidationPrice: result.invalidationPrice,
      targetPrice: result.targetPrice,
      thesis: result.thesis,
      sentiment: result.sentiment,
      category: result.category,
      tags: result.tags,
      requestedAt,
    });
  } catch (err) {
    console.error("on-demand analysis failed:", err);
    return Response.json({ error: "Something went wrong generating this analysis." }, { status: 500 });
  }
}
