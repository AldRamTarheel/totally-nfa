// Shared domain types used across agents, API routes, and UI components.

export type PickStatus = "active" | "closed";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type MarketRegime = "risk-on" | "risk-off" | "neutral";
export type Trend = "uptrend" | "downtrend" | "sideways";

/** Row shape of the `stock_picks` table. */
export interface StockPick {
  id: string;
  ticker: string;
  created_at: string;
  alert_price: number;
  last_checked_price: number | null;
  last_checked_at: string | null;
  conviction_score: number;
  invalidation_price: number;
  insider_sentiment: Sentiment | null;
  thesis: string;
  status: PickStatus;
  category: string | null;
  tags: string[];
  closed_at: string | null;
  closed_reason: string | null;
}

/** Row shape of the `weekly_retrospectives` table. */
export interface WeeklyRetrospective {
  id: string;
  week_start: string;
  week_end: string;
  summary: string;
  stats: RetrospectiveStats;
  created_at: string;
}

export interface RetrospectiveStats {
  pickCount: number;
  winRate: number;
  avgReturnPct: number;
  bestPick?: { ticker: string; returnPct: number };
  worstPick?: { ticker: string; returnPct: number };
  [key: string]: unknown;
}

// --- Agent I/O shapes ---

export interface MacroAgentOutput {
  regime: MarketRegime;
  summary: string;
  keyFactors: string[];
}

export interface InsiderCandidate {
  ticker: string;
  insiderSentiment: Sentiment;
  rationale: string;
}

export interface InsiderAgentOutput {
  candidates: InsiderCandidate[];
}

export interface TechnicalAgentOutput {
  ticker: string;
  trend: Trend;
  technicalNotes: string;
  suggestedInvalidationPrice: number;
}

export interface SynthesisOutput {
  ticker: string | null;
  convictionScore: number;
  invalidationPrice: number;
  thesis: string;
  insiderSentiment: Sentiment;
  category: string;
  tags: string[];
}

export interface RetrospectiveAgentOutput {
  summary: string;
  stats: RetrospectiveStats;
}
