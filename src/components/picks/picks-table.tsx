"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConvictionBadge } from "@/components/picks/conviction-badge";
import { computePnlPercent } from "@/lib/pnl";
import { cn } from "@/lib/utils";
import type { StockPick } from "@/lib/types";

interface QuoteMap {
  [ticker: string]: number;
}

type StatusFilter = "all" | "active" | "target_hit" | "invalidation_hit";
type CategoryFilter = "all" | string;
type ConvictionFilter = "all" | "high" | "medium" | "low";

function PnlCell({ alertPrice, livePrice }: { alertPrice: number; livePrice: number | null }) {
  if (livePrice == null) return <Skeleton className="h-4 w-14" />;
  const pct = computePnlPercent(alertPrice, livePrice);
  const positive = pct >= 0;
  return (
    <span className={cn("font-mono font-medium", positive ? "text-emerald-600" : "text-red-600")}>
      {positive ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

function PicksRows({ picks, liveQuotes }: { picks: StockPick[]; liveQuotes: QuoteMap }) {
  const router = useRouter();

  return (
    <>
      {picks.map((pick) => (
        <TableRow
          key={pick.id}
          className="cursor-pointer"
          onClick={() => router.push(`/picks/${pick.id}`)}
        >
          <TableCell className="font-semibold">
            <Link
              href={`/picks/${pick.id}`}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {pick.ticker}
            </Link>
          </TableCell>
          <TableCell className="font-mono">${pick.alert_price.toFixed(2)}</TableCell>
          <TableCell className="font-mono">
            {liveQuotes[pick.ticker] != null ? `$${liveQuotes[pick.ticker].toFixed(2)}` : (
              <Skeleton className="h-4 w-14" />
            )}
          </TableCell>
          <TableCell>
            <PnlCell alertPrice={pick.alert_price} livePrice={liveQuotes[pick.ticker] ?? null} />
          </TableCell>
          <TableCell>
            <ConvictionBadge score={pick.conviction_score} />
          </TableCell>
          <TableCell className="font-mono text-muted-foreground">
            {pick.target_price ? `$${pick.target_price.toFixed(2)}` : "—"}
          </TableCell>
          <TableCell>
            <Badge
              variant={pick.status === "active" ? "default" : "secondary"}
              className="capitalize"
            >
              {pick.status === "closed" && pick.closed_reason === "target_hit"
                ? "target hit"
                : pick.status === "closed" && pick.closed_reason === "invalidation_hit"
                  ? "stopped out"
                  : pick.status}
            </Badge>
          </TableCell>
          <TableCell className="text-muted-foreground text-xs">
            {formatDistanceToNow(new Date(pick.created_at), { addSuffix: true })}
          </TableCell>
          <TableCell>
            <ChevronRight className="size-4 text-muted-foreground" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function PicksTableShell({ picks, liveQuotes }: { picks: StockPick[]; liveQuotes: QuoteMap }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticker</TableHead>
          <TableHead>Alert Price</TableHead>
          <TableHead>Live Price</TableHead>
          <TableHead>PnL %</TableHead>
          <TableHead>Conviction</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Picked</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <PicksRows picks={picks} liveQuotes={liveQuotes} />
      </TableBody>
    </Table>
  );
}

function convictionBucket(score: number): "high" | "medium" | "low" {
  if (score >= 8) return "high";
  if (score >= 5) return "medium";
  return "low";
}

export function PicksTable({
  picks,
  showFilters = false,
}: {
  picks: StockPick[];
  showFilters?: boolean;
}) {
  const tickers = useMemo(() => [...new Set(picks.map((p) => p.ticker))], [picks]);
  const [liveQuotes, setLiveQuotes] = useState<QuoteMap>({});

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [convictionFilter, setConvictionFilter] = useState<ConvictionFilter>("all");

  const categories = useMemo(
    () => [...new Set(picks.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort(),
    [picks]
  );

  const filteredPicks = useMemo(() => {
    return picks.filter((pick) => {
      if (statusFilter !== "all") {
        if (statusFilter === "active") {
          if (pick.status !== "active") return false;
        } else if (statusFilter === "target_hit") {
          if (!(pick.status === "closed" && pick.closed_reason === "target_hit")) return false;
        } else if (statusFilter === "invalidation_hit") {
          if (!(pick.status === "closed" && pick.closed_reason === "invalidation_hit")) return false;
        }
      }

      if (categoryFilter !== "all" && pick.category !== categoryFilter) return false;

      if (convictionFilter !== "all" && convictionBucket(pick.conviction_score) !== convictionFilter) {
        return false;
      }

      return true;
    });
  }, [picks, statusFilter, categoryFilter, convictionFilter]);

  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;

    fetch(`/api/quotes?symbols=${tickers.join(",")}`)
      .then((res) => res.json())
      .then((data: { quotes: { symbol: string; regularMarketPrice: number }[] }) => {
        if (cancelled) return;
        const map: QuoteMap = {};
        for (const q of data.quotes ?? []) map[q.symbol] = q.regularMarketPrice;
        setLiveQuotes(map);
      })
      .catch(() => {
        /* live prices are best-effort; alert price still renders */
      });

    return () => {
      cancelled = true;
    };
  }, [tickers]);

  if (picks.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No picks yet.</p>;
  }

  return (
    <>
      {showFilters && (
        <div className="flex gap-2 mb-3">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="target_hit">Target hit</SelectItem>
              <SelectItem value="invalidation_hit">Stopped out</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={convictionFilter}
            onValueChange={(value) => setConvictionFilter(value as ConvictionFilter)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Conviction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All convictions</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showFilters && filteredPicks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No picks match these filters.
        </p>
      ) : (
        <PicksTableShell picks={filteredPicks} liveQuotes={liveQuotes} />
      )}
    </>
  );
}
