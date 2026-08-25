import { RetrospectiveList } from "@/components/grading/retrospective-list";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { WeeklyRetrospective } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getRetrospectives() {
  const supabase = getBrowserSupabase();
  const { data } = await supabase
    .from("weekly_retrospectives")
    .select("*")
    .order("week_start", { ascending: false });
  return (data ?? []) as WeeklyRetrospective[];
}

export default async function GradingPage() {
  const retrospectives = await getRetrospectives();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Auto-Grading</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every Friday, the AI reviews its own picks from the past week against live prices and writes
          an honest retrospective.
        </p>
      </div>
      <RetrospectiveList retrospectives={retrospectives} />
    </div>
  );
}
