"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface HistoryBar {
  date: string;
  close: number;
}

export function PriceSparkline({
  ticker,
  sinceISO,
  untilISO,
}: {
  ticker: string;
  sinceISO: string;
  untilISO?: string;
}) {
  const [bars, setBars] = useState<HistoryBar[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ symbol: ticker, period1: sinceISO });
    if (untilISO) params.set("period2", untilISO);

    fetch(`/api/history?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { bars?: HistoryBar[] }) => {
        if (!cancelled) setBars(data.bars ?? []);
      })
      .catch((err) => {
        console.error(`PriceSparkline fetch failed for ${ticker}:`, err);
        if (!cancelled) setBars([]);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, sinceISO, untilISO]);

  if (bars === null) {
    return <Skeleton className="h-[60px] w-full" />;
  }

  if (bars.length < 2) {
    return null;
  }

  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = bars
    .map((bar, i) => {
      const x = (i / (bars.length - 1)) * 300;
      const y = 60 - ((bar.close - min) / range) * 56 - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const isUp = bars[bars.length - 1].close >= bars[0].close;

  return (
    <svg viewBox="0 0 300 60" className="w-full h-[60px]" preserveAspectRatio="none">
      <polyline
        fill="none"
        strokeWidth="2"
        points={points}
        className={isUp ? "stroke-emerald-600" : "stroke-red-600"}
      />
    </svg>
  );
}
