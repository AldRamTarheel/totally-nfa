import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WinRateSummary } from "@/lib/analytics/win-rate";

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

export function WinRateCard({ summary }: { summary: WinRateSummary }) {
  const { closedCount, targetHitCount, invalidationHitCount, winRatePct } = summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Win Rate</CardTitle>
        <CardDescription>
          How often a closed pick hit its target vs. its invalidation price.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {closedCount === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough closed picks yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile label="Closed (Win/Loss)" value={`${targetHitCount}/${invalidationHitCount}`} />
            <StatTile
              label="Win Rate"
              value={winRatePct == null ? "—" : `${winRatePct.toFixed(0)}%`}
              valueClassName={
                winRatePct == null ? "text-muted-foreground" : winRatePct >= 50 ? "text-emerald-600" : "text-red-600"
              }
            />
            <StatTile label="Total Closed" value={String(closedCount)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
