import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

export function PortfolioSimCard({
  sim,
}: {
  sim: { totalInvested: number; totalPnlDollars: number; totalValue: number };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hypothetical Portfolio ($1,000/pick)</CardTitle>
        <CardDescription>If you had put an equal $1,000 into every pick.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label="Total Invested" value={`$${sim.totalInvested.toLocaleString()}`} />
          <StatTile
            label="Total P&L"
            value={`${sim.totalPnlDollars >= 0 ? "+" : ""}$${sim.totalPnlDollars.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}`}
            valueClassName={sim.totalPnlDollars >= 0 ? "text-emerald-600" : "text-red-600"}
          />
          <StatTile
            label="Current Value"
            value={`$${sim.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
