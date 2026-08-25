import * as cheerio from "cheerio";
import type { InsiderTrade, InsiderSentimentSummary } from "@/lib/data/insider-scraper";
import { summarizeInsiderTrades } from "@/lib/data/insider-scraper";

// Finviz is a free, public, unofficial data source scraped best-effort for
// educational use, as a supplement/backup to OpenInsider — same caveats
// apply: not a licensed feed, markup isn't guaranteed stable, and any parse
// failure returns an empty result rather than throwing.
const USER_AGENT =
  "Mozilla/5.0 (compatible; TotallyNFA-Educational-Bot/1.0; personal research script)";
const REQUEST_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMoney(text: string): number {
  const cleaned = text.replace(/[+$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Finviz renders dates as "Aug 24 '26" (MMM D 'YY).
function parseFinvizDate(text: string): Date {
  const match = text.trim().match(/^(\w{3})\s+(\d{1,2})\s+'(\d{2})$/);
  if (!match) return new Date(NaN);
  const [, mon, day, yy] = match;
  return new Date(`${mon} ${day}, 20${yy}`);
}

function classifyTransaction(label: string): "P" | "S" | null {
  if (label === "Buy") return "P";
  if (label === "Sale") return "S";
  return null; // skip "Proposed Sale", "Option Exercise", blanks, etc.
}

async function fetchHtml(url: string): Promise<cheerio.CheerioAPI | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    return cheerio.load(await res.text());
  } catch {
    return null;
  }
}

/** Site-wide "latest insider trading" feed — used for candidate discovery. */
async function getLatestActivity(): Promise<InsiderTrade[]> {
  const $ = await fetchHtml("https://finviz.com/insidertrading.ashx");
  if (!$) return [];

  const trades: InsiderTrade[] = [];
  $("#insider-table")
    .find("tr")
    .slice(1) // header row
    .each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 9) return;
      const ticker = $(cells[0]).find("a.tab-link").first().text().trim();
      const transactionType = classifyTransaction($(cells[4]).text().trim());
      if (!ticker || !transactionType) return;

      trades.push({
        ticker,
        insiderName: $(cells[1]).text().trim(),
        title: $(cells[2]).text().trim(),
        transactionType,
        transactionDate: parseFinvizDate($(cells[3]).text()),
        shares: Math.abs(parseMoney($(cells[6]).text())),
        pricePerShare: parseMoney($(cells[5]).text()),
        totalValue: Math.abs(parseMoney($(cells[7]).text())),
        sourceUrl: "https://finviz.com/insidertrading.ashx",
      });
    });
  return trades;
}

/** Per-ticker insider trading history from that ticker's Finviz quote page. */
async function getTickerActivity(ticker: string): Promise<InsiderTrade[]> {
  const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}`;
  const $ = await fetchHtml(url);
  if (!$) return [];

  const trades: InsiderTrade[] = [];
  $("tr.fv-insider-row").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 8) return;
    const transactionType = classifyTransaction($(cells[3]).text().trim());
    if (!transactionType) return;

    trades.push({
      ticker,
      insiderName: $(cells[0]).text().trim(),
      title: $(cells[1]).text().trim(),
      transactionType,
      transactionDate: parseFinvizDate($(cells[2]).text()),
      shares: Math.abs(parseMoney($(cells[5]).text())),
      pricePerShare: parseMoney($(cells[4]).text()),
      totalValue: Math.abs(parseMoney($(cells[6]).text())),
      sourceUrl: url,
    });
  });
  return trades;
}

/** Same shape/contract as insider-scraper.ts's getInsiderActivity, for drop-in use as a supplemental source. */
export async function getInsiderActivity(ticker?: string): Promise<InsiderTrade[]> {
  const trades = ticker ? await getTickerActivity(ticker) : await getLatestActivity();
  await sleep(REQUEST_DELAY_MS);
  return trades;
}

export async function getInsiderSentiment(ticker: string): Promise<InsiderSentimentSummary> {
  const trades = await getInsiderActivity(ticker);
  return summarizeInsiderTrades(ticker, trades);
}
