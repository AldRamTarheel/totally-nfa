import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { PipelineRun, PipelineStatus } from "@/lib/pipeline-log";

function statusBadgeClass(status: PipelineStatus): string {
  switch (status) {
    case "picked":
    case "graded":
      return "bg-emerald-600 text-white";
    case "error":
      return "bg-red-600 text-white";
    default:
      return "bg-slate-400 text-white";
  }
}

export function PipelineRunLog({ runs }: { runs: PipelineRun[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Run Log</CardTitle>
        <CardDescription>Every cron invocation, including days the AI declined to pick.</CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No runs logged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{format(new Date(run.created_at), "MMM d, h:mm a")}</TableCell>
                  <TableCell>{run.job}</TableCell>
                  <TableCell>
                    <Badge className={statusBadgeClass(run.status)}>{run.status}</Badge>
                  </TableCell>
                  <TableCell>{run.ticker ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{run.message ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
