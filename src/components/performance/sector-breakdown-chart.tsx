import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SectorBucket } from "@/lib/analytics/sector-breakdown";

const ROW_HEIGHT = 28;
const TOP_MARGIN = 6;
const LABEL_WIDTH = 130;
const RETURN_WIDTH = 60;
const WIDTH = 560;
const BAR_AREA_WIDTH = WIDTH - LABEL_WIDTH - RETURN_WIDTH;

function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function SectorBreakdownChart({ buckets }: { buckets: SectorBucket[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sector Diversification</CardTitle>
        <CardDescription>Which sectors your picks are actually concentrated in.</CardDescription>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data yet</p>
        ) : (
          <SectorBreakdownSvg buckets={buckets} />
        )}
      </CardContent>
    </Card>
  );
}

function SectorBreakdownSvg({ buckets }: { buckets: SectorBucket[] }) {
  const maxCount = Math.max(...buckets.map((b) => b.count));
  const height = buckets.length * ROW_HEIGHT + TOP_MARGIN;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" style={{ height }}>
      {buckets.map((bucket, i) => {
        const y = TOP_MARGIN + i * ROW_HEIGHT;
        const barWidth = maxCount > 0 ? (bucket.count / maxCount) * BAR_AREA_WIDTH : 0;
        const barY = y + 4;
        const barHeight = ROW_HEIGHT - 12;

        return (
          <g key={bucket.sector}>
            <text
              x={0}
              y={y + ROW_HEIGHT / 2}
              dy="0.32em"
              fontSize="11"
              className="fill-foreground"
            >
              {bucket.sector}
            </text>
            <rect
              x={LABEL_WIDTH}
              y={barY}
              width={Math.max(barWidth, 2)}
              height={barHeight}
              rx={3}
              className="fill-primary"
            />
            <text
              x={LABEL_WIDTH + Math.max(barWidth, 2) + 6}
              y={y + ROW_HEIGHT / 2}
              dy="0.32em"
              fontSize="10"
              className="fill-muted-foreground"
            >
              {bucket.count}
            </text>
            <text
              x={WIDTH}
              y={y + ROW_HEIGHT / 2}
              dy="0.32em"
              textAnchor="end"
              fontSize="11"
              className={bucket.avgReturnPct >= 0 ? "fill-emerald-600" : "fill-red-600"}
            >
              {formatPct(bucket.avgReturnPct)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
