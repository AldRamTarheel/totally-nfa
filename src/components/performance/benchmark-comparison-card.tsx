"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BenchmarkDefinition, BenchmarkSummary } from "@/lib/analytics/performance";

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

function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function BenchmarkComparisonCard({
  summariesBySymbol,
  benchmarks,
}: {
  summariesBySymbol: Record<string, BenchmarkSummary>;
  benchmarks: BenchmarkDefinition[];
}) {
  const defaultSymbol = benchmarks.some((b) => b.symbol === "QQQ") ? "QQQ" : (benchmarks[0]?.symbol ?? "");
  const [selected, setSelected] = useState(defaultSymbol);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, BenchmarkDefinition[]>();
    for (const b of benchmarks) {
      if (!byCategory.has(b.category)) byCategory.set(b.category, []);
      byCategory.get(b.category)!.push(b);
    }
    return [...byCategory.entries()];
  }, [benchmarks]);

  const activeBenchmark = benchmarks.find((b) => b.symbol === selected);
  const summary = summariesBySymbol[selected];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>Your Picks vs. {activeBenchmark?.label ?? "Benchmark"}</CardTitle>
          <CardDescription>
            Average return of each pick&apos;s holding window vs. the selected benchmark over the same window.
          </CardDescription>
        </div>
        {benchmarks.length > 0 && (
          <Select value={selected} onValueChange={(value) => value && setSelected(value)}>
            <SelectTrigger size="sm" className="w-[190px]">
              <SelectValue placeholder="Benchmark" />
            </SelectTrigger>
            <SelectContent>
              {grouped.map(([category, items]) => (
                <SelectGroup key={category}>
                  <SelectLabel>{category}</SelectLabel>
                  {items.map((b) => (
                    <SelectItem key={b.symbol} value={b.symbol}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent>
        {!summary || summary.count === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile label="Your Avg Return" value={formatPct(summary.avgPickReturnPct)} />
            <StatTile label={`${activeBenchmark?.label ?? "Benchmark"} Avg Return`} value={formatPct(summary.avgBenchmarkReturnPct)} />
            <StatTile
              label="Alpha"
              value={formatPct(summary.alphaPct)}
              valueClassName={summary.alphaPct >= 0 ? "text-emerald-600" : "text-red-600"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
