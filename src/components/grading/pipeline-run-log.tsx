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

// Mobile card layout — 5 columns (with a free-text Message column) doesn't
// fit a phone screen even inside the table's own scroll container; below
// `sm` this stacked view replaces the table so nothing scrolls sideways.
function RunCard({ run }: { run: PipelineRun }) {
  return (
    <div className="rounded-lg border p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{run.job}</span>
        <Badge className={statusBadgeClass(run.status)}>{run.status}</Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {format(new Date(run.created_at), "MMM d, h:mm a")}
        {run.ticker && ` · ${run.ticker}`}
      </div>
      {run.message && (
        <p className="text-xs text-muted-foreground line-clamp-2">{run.message}</p>
      )}
    </div>
  );
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
          <>
            <div className="sm:hidden space-y-2">
              {runs.map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
            </div>
            <div className="hidden sm:block">
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
