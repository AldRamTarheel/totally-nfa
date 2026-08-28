import { ImageResponse } from "next/og";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { computePnlPercent } from "@/lib/pnl";
import type { StockPick } from "@/lib/types";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

async function getPick(id: string): Promise<StockPick | null> {
  const supabase = getBrowserSupabase();
  const { data } = await supabase.from("stock_picks").select("*").eq("id", id).maybeSingle();
  return (data as StockPick) ?? null;
}

const BG = "#171717";
const FG = "#f5f5f5";
const MUTED = "#a1a1aa";

function FallbackCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BG,
        color: FG,
        fontFamily: "system-ui",
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 700 }}>Totally N.F.A.</div>
      <div style={{ fontSize: 28, color: MUTED, marginTop: 16 }}>
        Educational AI stock pick tracker
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let pick: StockPick | null = null;
  try {
    pick = await getPick(id);
  } catch {
    pick = null;
  }

  if (!pick) {
    return new ImageResponse(<FallbackCard />, { ...size });
  }

  const livePrice = pick.last_checked_price ?? pick.alert_price;
  const pnlPct = computePnlPercent(pick.alert_price, livePrice);
  const positive = pnlPct >= 0;
  const pnlColor = positive ? "#34d399" : "#f87171";

  const thesisSnippet =
    pick.thesis.length > 140 ? `${pick.thesis.slice(0, 140).trimEnd()}…` : pick.thesis;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: BG,
          color: FG,
          fontFamily: "system-ui",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: MUTED }}>Totally N.F.A.</div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
            <div style={{ fontSize: 128, fontWeight: 700 }}>{pick.ticker}</div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 600, color: pnlColor }}>
              {positive ? "+" : ""}
              {pnlPct.toFixed(2)}%
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 8 }}>
            Conviction {pick.conviction_score}/10
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: MUTED, maxWidth: 1000 }}>
          {thesisSnippet}
        </div>
      </div>
    ),
    { ...size }
  );
}
