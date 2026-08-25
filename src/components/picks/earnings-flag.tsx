"use client";

import { useEffect, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface EarningsResponse {
  earningsDate: string | null;
}

export function EarningsFlag({ ticker }: { ticker: string }) {
  const [data, setData] = useState<EarningsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/earnings?symbol=${encodeURIComponent(ticker)}`)
      .then((res) => res.json())
      .then((res: EarningsResponse) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        console.error(`EarningsFlag fetch failed for ${ticker}:`, err);
        if (!cancelled) setData({ earningsDate: null });
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!data?.earningsDate) {
    return null;
  }

  const earningsDate = new Date(data.earningsDate);
  const days = differenceInCalendarDays(earningsDate, new Date());

  if (days < 0) {
    return null;
  }

  if (days <= 14) {
    return (
      <Badge className="bg-amber-500 text-white gap-1">
        <AlertTriangle className="size-3" />
        Earnings in {days}d ({format(earningsDate, "MMM d")})
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs">
      Next earnings: {format(earningsDate, "MMM d, yyyy")}
    </Badge>
  );
}
