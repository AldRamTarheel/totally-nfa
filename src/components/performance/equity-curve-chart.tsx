import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquityCurvePoint } from "@/lib/analytics/performance";

const WIDTH = 560;
const CHART_HEIGHT = 140;
const TOP_MARGIN = 10;
const USABLE_HEIGHT = 120;

function valueToY(value: number, minY: number, maxY: number): number {
  const range = maxY - minY || 1;
  return CHART_HEIGHT - ((value - minY) / range) * USABLE_HEIGHT - TOP_MARGIN;
}

export function EquityCurveChart({ points }: { points: EquityCurvePoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Equity Curve</CardTitle>
        <CardDescription>Cumulative average return across all picks, in the order they were made.</CardDescription>
      </CardHeader>
      <CardContent>
        {points.length < 2 ? (
          <p className="text-sm text-muted-foreground">Not enough picks yet for a trend line</p>
        ) : (
          <EquityCurveSvg points={points} />
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Equal-weight, hypothetical performance across all picks (active picks marked-to-market at
          current price). Educational only — not investment advice.
        </p>
      </CardContent>
    </Card>
  );
}

function EquityCurveSvg({ points }: { points: EquityCurvePoint[] }) {
  const values = points.map((p) => p.cumulativeAvgReturnPct);
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * WIDTH;
    const y = valueToY(p.cumulativeAvgReturnPct, minY, maxY);
    return { x, y };
  });

  const zeroY = valueToY(0, minY, maxY);
  const last = points.at(-1)!;
  const lineClassName = last.cumulativeAvgReturnPct >= 0 ? "stroke-emerald-600" : "stroke-red-600";
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <svg viewBox="0 0 600 160" className="w-full h-40">
      <line
        x1={0}
        y1={zeroY}
        x2={WIDTH}
        y2={zeroY}
        strokeDasharray="4 4"
        className="stroke-muted-foreground/40"
      />
      <polyline fill="none" strokeWidth="2" className={lineClassName} points={polylinePoints} />
      <text x={0} y={TOP_MARGIN} fontSize="9" className="fill-muted-foreground">
        {maxY.toFixed(1)}%
      </text>
      <text x={0} y={zeroY - 3} fontSize="9" className="fill-muted-foreground">
        0%
      </text>
      <text x={0} y={CHART_HEIGHT} fontSize="9" className="fill-muted-foreground">
        {minY.toFixed(1)}%
      </text>
      <text x={0} y={155} fontSize="9" className="fill-muted-foreground">
        {format(points[0].date, "MMM d")}
      </text>
      <text x={WIDTH} y={155} fontSize="9" textAnchor="end" className="fill-muted-foreground">
        {format(last.date, "MMM d")}
      </text>
    </svg>
  );
}
