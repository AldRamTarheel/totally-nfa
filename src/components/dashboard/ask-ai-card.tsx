"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConvictionBadge } from "@/components/picks/conviction-badge";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const DAILY_LIMIT = 3;

interface OnDemandResult {
  ticker: string;
  convictionScore: number;
  invalidationPrice: number;
  targetPrice: number;
  thesis: string;
  sentiment: "bullish" | "bearish" | "neutral" | null;
  category: string | null;
  tags: string[];
  requestedAt: string;
}

const sentimentStyle: Record<string, string> = {
  bullish: "bg-emerald-600 text-white",
  bearish: "bg-red-600 text-white",
  neutral: "bg-slate-400 text-white",
};

function startOfTodayUtcIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchTodayCount(): Promise<number> {
  const supabase = getBrowserSupabase();
  const { count } = await supabase
    .from("on_demand_analyses")
    .select("id", { count: "exact", head: true })
    .gte("requested_at", startOfTodayUtcIso());
  return count ?? 0;
}

async function fetchRecentHistory(): Promise<OnDemandResult[]> {
  const supabase = getBrowserSupabase();
  const { data } = await supabase
    .from("on_demand_analyses")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(5);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ticker: row.ticker as string,
    convictionScore: row.conviction_score as number,
    invalidationPrice: row.invalidation_price as number,
    targetPrice: row.target_price as number,
    thesis: row.thesis as string,
    sentiment: (row.sentiment as OnDemandResult["sentiment"]) ?? null,
    category: (row.category as string | null) ?? null,
    tags: (row.tags as string[]) ?? [],
    requestedAt: row.requested_at as string,
  }));
}

export function AskAiCard() {
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [history, setHistory] = useState<OnDemandResult[]>([]);
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnDemandResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTodayCount().then((count) => {
      if (!cancelled) setTodayCount(count);
    });
    fetchRecentHistory().then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const limitReached = todayCount != null && todayCount >= DAILY_LIMIT;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim() || loading || limitReached) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/on-demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        // Refresh the count in case the failure was a stale local count vs.
        // a rate limit that was hit by another visitor in the meantime.
        fetchTodayCount().then(setTodayCount);
        return;
      }
      setResult(data as OnDemandResult);
      setTicker("");
      const [count, recent] = await Promise.all([fetchTodayCount(), fetchRecentHistory()]);
      setTodayCount(count);
      setHistory(recent);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask the AI About a Ticker</CardTitle>
        <CardDescription>
          Get a one-off educational AI read on any ticker — not a tracked pick, not financial
          advice. Capped at {DAILY_LIMIT} requests per day across all visitors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            maxLength={10}
            disabled={loading || limitReached}
            className="sm:max-w-[160px]"
          />
          <Button type="submit" disabled={loading || limitReached || !ticker.trim()}>
            {loading ? "Thinking…" : "Ask AI"}
          </Button>
          <span className="text-xs text-muted-foreground self-center sm:ml-2">
            {todayCount == null ? "…" : `${todayCount}/${DAILY_LIMIT} used today`}
          </span>
        </form>

        {limitReached && (
          <p className="text-sm text-muted-foreground">
            Daily on-demand limit reached — try again tomorrow.
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            {error}
          </p>
        )}

        {result && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{result.ticker}</span>
              <ConvictionBadge score={result.convictionScore} />
              {result.sentiment && (
                <Badge className={cn("w-fit", sentimentStyle[result.sentiment])}>
                  {result.sentiment}
                </Badge>
              )}
              {result.category && (
                <Badge variant="outline" className="text-xs">
                  {result.category}
                </Badge>
              )}
            </div>
            <p className="text-sm leading-relaxed">{result.thesis}</p>
            <div className="flex flex-wrap gap-4 text-sm font-mono">
              <span className="text-red-600">Invalidation: ${result.invalidationPrice.toFixed(2)}</span>
              <span className="text-emerald-600">Target: ${result.targetPrice.toFixed(2)}</span>
            </div>
            {result.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Recent on-demand history</p>
            <div className="space-y-2">
              {history.map((row, i) => (
                <div
                  key={`${row.ticker}-${row.requestedAt}-${i}`}
                  className="rounded-md border px-3 py-2 text-sm space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{row.ticker}</span>
                      <ConvictionBadge score={row.convictionScore} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(row.requestedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{row.thesis}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
