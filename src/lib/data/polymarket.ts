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
  endDate?: string;
}

function parseMarket(raw: RawMarket): PredictionMarket | null {
  if (!raw.question || !raw.slug) return null;
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

/** Full-text search across Polymarket events; returns each event's underlying markets. */
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

const MACRO_KEYWORDS = ["fed interest rate", "recession", "inflation cpi"];

/** Highest-liquidity active markets touching macro themes (Fed, recession, inflation). */
export async function getMacroRelevantMarkets(): Promise<PredictionMarket[]> {
  const results = await Promise.all(MACRO_KEYWORDS.map((kw) => searchMarkets(kw, 5)));
  const seen = new Set<string>();
  const merged: PredictionMarket[] = [];
  for (const market of results.flat()) {
    if (seen.has(market.slug)) continue;
    seen.add(market.slug);
    merged.push(market);
  }
  return merged.sort((a, b) => b.volume - a.volume).slice(0, 10);
}
