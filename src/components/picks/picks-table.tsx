"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
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
import { ConvictionBadge } from "@/components/picks/conviction-badge";
import { computePnlPercent } from "@/lib/pnl";
import { cn } from "@/lib/utils";
import type { StockPick } from "@/lib/types";

interface QuoteMap {
  [ticker: string]: number;
}

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
  return (
    <>
      {picks.map((pick) => (
        <TableRow key={pick.id}>
          <TableCell className="font-semibold">{pick.ticker}</TableCell>
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
            ${pick.invalidation_price.toFixed(2)}
          </TableCell>
          <TableCell>
            <Badge variant={pick.status === "active" ? "default" : "secondary"}>{pick.status}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground whitespace-normal max-w-xs">
            {pick.thesis}
          </TableCell>
          <TableCell className="text-muted-foreground text-xs">
            {formatDistanceToNow(new Date(pick.created_at), { addSuffix: true })}
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
          <TableHead>Invalidation</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Thesis</TableHead>
          <TableHead>Picked</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <PicksRows picks={picks} liveQuotes={liveQuotes} />
      </TableBody>
    </Table>
  );
}

export function PicksTable({ picks }: { picks: StockPick[] }) {
  const tickers = useMemo(() => [...new Set(picks.map((p) => p.ticker))], [picks]);
  const [liveQuotes, setLiveQuotes] = useState<QuoteMap>({});

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

  return <PicksTableShell picks={picks} liveQuotes={liveQuotes} />;
}
