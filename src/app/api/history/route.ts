import { getHistorical } from "@/lib/data/yahoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/history?symbol=AAPL&period1=2026-01-01&period2=2026-06-01
 * Used client-side by the price sparkline. Degrades gracefully — always
 * returns { bars: [] } rather than a 4xx/5xx, since this is a nice-to-have
 * UI feature, not core pipeline data.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  const period1 = url.searchParams.get("period1");
  const period2 = url.searchParams.get("period2");

  if (!symbol || !period1) {
    return Response.json({ bars: [] });
  }

  try {
    const bars = await getHistorical(symbol, {
      period1: new Date(period1),
      period2: period2 ? new Date(period2) : undefined,
      interval: "1d",
    });
    return Response.json({
      bars: bars.map((b) => ({ date: b.date.toISOString(), close: b.close })),
    });
  } catch {
    return Response.json({ bars: [] });
  }
}
