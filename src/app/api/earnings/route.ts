import { getEarningsCalendar } from "@/lib/data/yahoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/earnings?symbol=AAPL
 * Live-computed every call — earnings dates move and pass, so a stored
 * value would go stale. Used client-side by the earnings-date flag.
 */
export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol");

  if (!symbol) {
    return Response.json({ earningsDate: null, exDividendDate: null, dividendDate: null });
  }

  const cal = await getEarningsCalendar(symbol);
  return Response.json({
    earningsDate: cal.earningsDate?.toISOString() ?? null,
    exDividendDate: cal.exDividendDate?.toISOString() ?? null,
    dividendDate: cal.dividendDate?.toISOString() ?? null,
  });
}
