import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BenchmarkSummary } from "@/lib/analytics/performance";

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

export function BenchmarkComparisonCard({ summary }: { summary: BenchmarkSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Picks vs. QQQ</CardTitle>
        <CardDescription>
          Average return of each pick&apos;s holding window vs. QQQ over the same window.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.count === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile label="Your Avg Return" value={formatPct(summary.avgPickReturnPct)} />
            <StatTile label="QQQ Avg Return" value={formatPct(summary.avgBenchmarkReturnPct)} />
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
