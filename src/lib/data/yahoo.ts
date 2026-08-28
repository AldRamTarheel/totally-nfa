import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";
import { getServerEnv } from "@/lib/env";

// yahoo-finance2 v4 requires an instance (the old static-method API was removed).
// suppressNotices silences the library's survey/notice console spam.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export class DataFetchError extends Error {
  constructor(
    public readonly symbol: string,
    cause: unknown
  ) {
    super(`Failed to fetch Yahoo Finance data for ${symbol}: ${(cause as Error)?.message ?? cause}`);
    this.name = "DataFetchError";
  }
}

export interface QuoteSnapshot {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export interface OhlcvBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toQuoteSnapshot(symbol: string, q: Record<string, unknown>): QuoteSnapshot {
  return {
    symbol,
    regularMarketPrice: Number(q.regularMarketPrice ?? 0),
    regularMarketChangePercent: Number(q.regularMarketChangePercent ?? 0),
    regularMarketVolume: Number(q.regularMarketVolume ?? 0),
    fiftyTwoWeekHigh: Number(q.fiftyTwoWeekHigh ?? 0),
    fiftyTwoWeekLow: Number(q.fiftyTwoWeekLow ?? 0),
  };
}

/**
 * Current quotes for one or more symbols. Fetches per-symbol so a single bad
 * ticker doesn't fail the whole batch — failures are silently skipped from
 * the result (callers that need to know about failures should catch
 * DataFetchError from getQuote instead).
 */
export async function getQuotes(symbols: string[]): Promise<QuoteSnapshot[]> {
  const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  return results
    .filter((r): r is PromiseFulfilledResult<QuoteSnapshot> => r.status === "fulfilled")
    .map((r) => r.value);
}

/** Single-symbol quote. Throws DataFetchError on failure. */
export async function getQuote(symbol: string): Promise<QuoteSnapshot> {
  try {
    const q = await yf.quote(symbol);
    return toQuoteSnapshot(symbol, q as unknown as Record<string, unknown>);
  } catch (err) {
    throw new DataFetchError(symbol, err);
  }
}

/**
 * Historical daily bars, e.g. for technical-agent indicator calculations.
 * `period1`/`period2` accept anything `new Date(...)` can parse (ISO date
 * strings, timestamps); default window is the last 90 days.
 */
export async function getHistorical(
  symbol: string,
  opts: { period1?: string | Date; period2?: string | Date; interval?: "1d" | "1wk" } = {}
): Promise<OhlcvBar[]> {
  try {
    // yahoo-finance2's schema validator rejects an explicitly-present
    // `period2: undefined` key (as opposed to the key being omitted), so
    // only include it when actually provided.
    const result = await yf.chart(symbol, {
      period1: opts.period1 ?? subDays(new Date(), 90),
      ...(opts.period2 ? { period2: opts.period2 } : {}),
      interval: opts.interval ?? "1d",
    });
    return (result.quotes ?? [])
      .filter((bar) => bar.close != null)
      .map((bar) => ({
        date: new Date(bar.date),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        volume: Number(bar.volume ?? 0),
      }));
  } catch (err) {
    throw new DataFetchError(symbol, err);
  }
}

/** Macro proxy quotes (QQQ/GLD/USO by default, configurable via MACRO_TICKERS). */
export async function getMacroSnapshot(): Promise<QuoteSnapshot[]> {
  const { MACRO_TICKERS } = getServerEnv();
  return getQuotes(MACRO_TICKERS);
}

export interface EarningsCalendar {
  earningsDate: Date | null;
  exDividendDate: Date | null;
  dividendDate: Date | null;
}

/**
 * Fetched live on every page view (not stored at pick-creation time) since
 * earnings dates move and pass — a stored value would go stale. Non-fatal:
 * returns all-null on failure rather than throwing, since this is a
 * supplementary UI flag, not core pipeline data.
 */
export async function getEarningsCalendar(symbol: string): Promise<EarningsCalendar> {
  try {
    const result = await yf.quoteSummary(symbol, { modules: ["calendarEvents"] });
    const events = (result as unknown as Record<string, unknown>).calendarEvents as
      | Record<string, unknown>
      | undefined;
    const earnings = events?.earnings as { earningsDate?: (string | Date)[] } | undefined;
    return {
      earningsDate: earnings?.earningsDate?.[0] ? new Date(earnings.earningsDate[0]) : null,
      exDividendDate: events?.exDividendDate ? new Date(events.exDividendDate as string) : null,
      dividendDate: events?.dividendDate ? new Date(events.dividendDate as string) : null,
    };
  } catch (err) {
    console.error(`getEarningsCalendar(${symbol}) failed:`, err);
    return { earningsDate: null, exDividendDate: null, dividendDate: null };
  }
}

export interface SectorInfo {
  sector: string | null;
  industry: string | null;
}

/**
 * Sector/industry classification for the performance page's sector
 * diversification chart. Non-fatal: returns all-null on failure rather than
 * throwing, since this is a supplementary UI breakdown, not core pipeline
 * data.
 */
export async function getSectorInfo(symbol: string): Promise<SectorInfo> {
  try {
    const result = await yf.quoteSummary(symbol, { modules: ["assetProfile"] });
    const profile = (result as unknown as Record<string, unknown>).assetProfile as
      | Record<string, unknown>
      | undefined;
    return {
      sector: (profile?.sector as string | undefined) ?? null,
      industry: (profile?.industry as string | undefined) ?? null,
    };
  } catch (err) {
    console.error(`getSectorInfo(${symbol}) failed:`, err);
    return { sector: null, industry: null };
  }
}
