import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PipelineJob = "daily-pick" | "weekly-grade";

export type PipelineStatus =
  | "picked"
  | "duplicate"
  | "no-pick"
  | "graded"
  | "no-picks-to-grade"
  | "error";

export interface PipelineRun {
  id: string;
  job: PipelineJob;
  status: PipelineStatus;
  ticker: string | null;
  message: string | null;
  created_at: string;
}

/**
 * Records one cron invocation's outcome so a day the AI declines to pick
 * (or the pipeline errors) still leaves a visible trace in the UI. Never
 * throws — a logging failure must not crash a cron run that otherwise
 * succeeded (or mask the original error in a cron run that failed).
 */
export async function logPipelineRun(
  supabase: SupabaseClient,
  entry: { job: PipelineJob; status: PipelineStatus; ticker?: string; message?: string }
): Promise<void> {
  try {
    const { error } = await supabase.from("pipeline_runs").insert({
      job: entry.job,
      status: entry.status,
      ticker: entry.ticker ?? null,
      message: entry.message ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("logPipelineRun failed:", err);
  }
}
