// Public, unauthenticated Polymarket Gamma API — no signup/key required.
const GAMMA_BASE = "https://gamma-api.polymarket.com";

export interface PredictionMarket {
  question: string;
  slug: string;
  outcomes: { name: string; probability: number }[];
  volume: number;
  endDate: string;
}

interface RawMarket {
  question?: string;
  slug?: string;
  outcomes?: string; // JSON-encoded string array, e.g. '["Yes","No"]'
  outcomePrices?: string; // JSON-encoded string array of prices/probabilities
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  endDate?: string;
  // Polymarket's `active` flag stays true even for long-resolved markets —
  // `closed` is the actual "still open for trading" signal. Always check
  // `closed === false`, never rely on `active` alone.
  closed?: boolean;
}

function parseMarket(raw: RawMarket): PredictionMarket | null {
  if (!raw.question || !raw.slug) return null;
  if (raw.closed === true) return null; // exclude resolved/historical markets
  let names: string[] = [];
  let prices: string[] = [];
  try {
    names = JSON.parse(raw.outcomes ?? "[]");
    prices = JSON.parse(raw.outcomePrices ?? "[]");
  } catch {
    return null;
  }
  return {
    question: raw.question,
    slug: raw.slug,
    outcomes: names.map((name, i) => ({ name, probability: Number(prices[i] ?? 0) })),
    volume: Number(raw.volumeNum ?? raw.volume ?? 0),
    endDate: raw.endDate ?? "",
  };
}

/**
 * Full-text search across Polymarket events for a keyword/company name;
 * returns each matching event's underlying markets, excluding closed ones.
 */
export async function searchMarkets(keyword: string, limit = 10): Promise<PredictionMarket[]> {
  try {
    const url = `${GAMMA_BASE}/public-search?${new URLSearchParams({
      q: keyword,
      limit_per_type: String(limit),
    })}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: { markets?: RawMarket[] }[] };
    const markets = (data.events ?? []).flatMap((e) => e.markets ?? []);
    return markets.map(parseMarket).filter((m): m is PredictionMarket => m !== null);
  } catch {
    return [];
  }
}

const MACRO_KEYWORDS = ["fed", "interest rate", "recession", "inflation", "cpi", "unemployment", "jobs report"];

/**
 * Highest-liquidity currently-open markets touching macro themes (Fed,
 * recession, inflation). Pulls from the actively-tradable markets endpoint
 * (filtered server-side by closed=false) rather than the broader search
 * index, which mixes in long-resolved historical markets.
 */
export async function getMacroRelevantMarkets(): Promise<PredictionMarket[]> {
  try {
    const url = `${GAMMA_BASE}/markets?${new URLSearchParams({
      active: "true",
      closed: "false",
      limit: "100",
      order: "volume24hr",
      ascending: "false",
    })}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const raw = (await res.json()) as RawMarket[];
    const relevant = raw.filter((m) => {
      const haystack = `${m.question ?? ""} ${m.slug ?? ""}`.toLowerCase();
      return MACRO_KEYWORDS.some((kw) => haystack.includes(kw));
    });
    return relevant
      .map(parseMarket)
      .filter((m): m is PredictionMarket => m !== null)
      .slice(0, 10);
  } catch {
    return [];
  }
}
