import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PicksTable } from "@/components/picks/picks-table";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { StockPick } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getPicks() {
  const supabase = getBrowserSupabase();
  const { data: active } = await supabase
    .from("stock_picks")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const { data: past } = await supabase
    .from("stock_picks")
    .select("*")
    .eq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    active: (active ?? []) as StockPick[],
    past: (past ?? []) as StockPick[],
  };
}

export default async function DashboardPage() {
  const { active, past } = await getPicks();

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Active Picks</CardTitle>
          <CardDescription>
            Currently open AI picks, deduplicated to one active alert per ticker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PicksTable picks={active} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past Picks</CardTitle>
          <CardDescription>Closed picks — invalidated or manually resolved.</CardDescription>
        </CardHeader>
        <CardContent>
          <PicksTable picks={past} showFilters />
        </CardContent>
      </Card>
    </div>
  );
}
