import * as cheerio from "cheerio";
import type { Sentiment } from "@/lib/types";

// OpenInsider is a free, public, unofficial data source scraped best-effort
// for educational use — not a licensed data feed. Requests are rate-limited
// and identify themselves via User-Agent; any parse failure returns an empty
// result rather than throwing, since the underlying markup isn't guaranteed
// stable.
const USER_AGENT =
  "Mozilla/5.0 (compatible; TotallyNFA-Educational-Bot/1.0; personal research script)";
const REQUEST_DELAY_MS = 1000;

export interface InsiderTrade {
  ticker: string;
  insiderName: string;
  title: string;
  transactionType: "P" | "S";
  transactionDate: Date;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  sourceUrl: string;
}

export interface InsiderSentimentSummary {
  ticker: string;
  buyCount90d: number;
  sellCount90d: number;
  netValue90d: number;
  sentiment: Sentiment;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMoney(text: string): number {
  const cleaned = text.replace(/[+$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseQty(text: string): number {
  return parseMoney(text);
}

/** Parses an OpenInsider "tinytable" HTML page into rows keyed by header name. */
function parseTinyTable($: cheerio.CheerioAPI): Record<string, string>[] {
  const table = $("table.tinytable").first();
  if (table.length === 0) return [];
  const headers = table
    .find("tr")
    .first()
    .find("th")
    .map((_, el) => $(el).text().trim())
    .get();
  const rows: Record<string, string>[] = [];
  table
    .find("tr")
    .slice(1)
    .each((_, tr) => {
      const cells = $(tr)
        .find("td")
        .map((_, td) => $(td).text().trim())
        .get();
      if (cells.length === 0) return;
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cells[i] ?? "";
      });
      rows.push(row);
    });
  return rows;
}

function rowsToTrades(rows: Record<string, string>[], sourceUrl: string): InsiderTrade[] {
  const trades: InsiderTrade[] = [];
  for (const row of rows) {
    const tradeTypeRaw = row["Trade Type"] ?? "";
    const isPurchase = tradeTypeRaw.startsWith("P");
    const isSale = tradeTypeRaw.startsWith("S");
    if (!isPurchase && !isSale) continue; // skip option exercises/other filing types
    const ticker = (row["Ticker"] ?? "").trim();
    if (!ticker) continue;
    trades.push({
      ticker,
      insiderName: row["Insider Name"] ?? "",
      title: row["Title"] ?? "",
      transactionType: isPurchase ? "P" : "S",
      transactionDate: new Date(row["Trade Date"] ?? row["Filing Date"] ?? ""),
      shares: Math.abs(parseQty(row["Qty"] ?? "0")),
      pricePerShare: parseMoney(row["Price"] ?? "0"),
      totalValue: Math.abs(parseMoney(row["Value"] ?? "0")),
      sourceUrl,
    });
  }
  return trades;
}

async function fetchTable(url: string): Promise<Record<string, string>[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    return parseTinyTable($);
  } catch {
    return [];
  }
}

/**
 * Insider trading activity. With no ticker, scans OpenInsider's site-wide
 * "latest cluster buys" feed (candidate discovery). With a ticker, pulls
 * that ticker's own recent filing history.
 */
export async function getInsiderActivity(ticker?: string): Promise<InsiderTrade[]> {
  const url = ticker
    ? `http://openinsider.com/screener?s=${encodeURIComponent(ticker)}`
    : "http://openinsider.com/latest-cluster-buys";
  const rows = await fetchTable(url);
  await sleep(REQUEST_DELAY_MS);
  return rowsToTrades(rows, url);
}

/** Aggregates a ticker's recent insider trades into a simple buy/sell sentiment summary. */
export async function getInsiderSentiment(ticker: string): Promise<InsiderSentimentSummary> {
  const trades = await getInsiderActivity(ticker);
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = trades.filter((t) => t.transactionDate.getTime() >= ninetyDaysAgo);

  const buys = recent.filter((t) => t.transactionType === "P");
  const sells = recent.filter((t) => t.transactionType === "S");
  const netValue90d =
    buys.reduce((sum, t) => sum + t.totalValue, 0) - sells.reduce((sum, t) => sum + t.totalValue, 0);

  let sentiment: Sentiment = "neutral";
  if (buys.length > sells.length && netValue90d > 0) sentiment = "bullish";
  else if (sells.length > buys.length && netValue90d < 0) sentiment = "bearish";

  return {
    ticker,
    buyCount90d: buys.length,
    sellCount90d: sells.length,
    netValue90d,
    sentiment,
  };
}
