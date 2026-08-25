import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ConvictionBucket } from "@/lib/analytics/performance";

export function ConvictionCalibrationTable({ buckets }: { buckets: ConvictionBucket[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conviction Calibration</CardTitle>
        <CardDescription>Does higher conviction actually mean better returns?</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead>Picks</TableHead>
              <TableHead>Avg Return</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((bucket) => (
              <TableRow key={bucket.label}>
                <TableCell>{bucket.label}</TableCell>
                <TableCell>{bucket.count}</TableCell>
                <TableCell
                  className={cn(
                    "font-mono",
                    bucket.avgReturnPct != null &&
                      (bucket.avgReturnPct >= 0 ? "text-emerald-600" : "text-red-600")
                  )}
                >
                  {bucket.avgReturnPct === null
                    ? "—"
                    : `${bucket.avgReturnPct >= 0 ? "+" : ""}${bucket.avgReturnPct.toFixed(2)}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
