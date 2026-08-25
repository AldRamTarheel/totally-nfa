"use client";

import { useEffect, useState } from "react";
import { computePnlPercent } from "@/lib/pnl";
import { cn } from "@/lib/utils";
import type { StockPick } from "@/lib/types";

function StatTile({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold font-mono mt-1", valueClassName)}>{value}</div>
    </div>
  );
}

export function PickPriceStats({ pick }: { pick: StockPick }) {
  const [livePrice, setLivePrice] = useState<number | null>(pick.last_checked_price);

  useEffect(() => {
    if (pick.status !== "active") return; // closed picks show their frozen last_checked_price
    let cancelled = false;
    fetch(`/api/quotes?symbols=${pick.ticker}`)
      .then((res) => res.json())
      .then((data: { quotes: { symbol: string; regularMarketPrice: number }[] }) => {
        if (cancelled) return;
        const q = data.quotes?.[0];
        if (q) setLivePrice(q.regularMarketPrice);
      })
      .catch(() => {
        /* keep last_checked_price as the fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [pick.ticker, pick.status]);

  const pnl = livePrice != null ? computePnlPercent(pick.alert_price, livePrice) : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <StatTile label="Alert Price" value={`$${pick.alert_price.toFixed(2)}`} />
      <StatTile
        label={pick.status === "active" ? "Live Price" : "Price at Close"}
        value={livePrice != null ? `$${livePrice.toFixed(2)}` : "—"}
      />
      <StatTile
        label="PnL"
        value={pnl != null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%` : "—"}
        valueClassName={pnl != null ? (pnl >= 0 ? "text-emerald-600" : "text-red-600") : undefined}
      />
      <StatTile
        label="Target"
        value={pick.target_price ? `$${pick.target_price.toFixed(2)}` : "—"}
        valueClassName="text-emerald-600"
      />
      <StatTile
        label="Invalidation"
        value={`$${pick.invalidation_price.toFixed(2)}`}
        valueClassName="text-red-600"
      />
    </div>
  );
}
