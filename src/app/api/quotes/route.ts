import { getQuotes } from "@/lib/data/yahoo";

export const dynamic = "force-dynamic";

/** GET /api/quotes?symbols=AAPL,MSFT — used client-side by the dashboard for live PnL. */
export async function GET(req: Request) {
  const symbolsParam = new URL(req.url).searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return Response.json({ quotes: [] });
  }

  const quotes = await getQuotes(symbols);
  return Response.json({ quotes });
}
