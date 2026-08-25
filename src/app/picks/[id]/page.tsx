import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConvictionBadge } from "@/components/picks/conviction-badge";
import { PickPriceStats } from "@/components/picks/pick-price-stats";
import { PriceSparkline } from "@/components/picks/price-sparkline";
import { EarningsFlag } from "@/components/picks/earnings-flag";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { StockPick } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getPick(id: string): Promise<StockPick | null> {
  const supabase = getBrowserSupabase();
  const { data } = await supabase.from("stock_picks").select("*").eq("id", id).maybeSingle();
  return (data as StockPick) ?? null;
}

const regimeStyle: Record<string, string> = {
  "risk-on": "bg-emerald-600 text-white",
  "risk-off": "bg-red-600 text-white",
  neutral: "bg-slate-400 text-white",
};

const trendStyle: Record<string, string> = {
  uptrend: "bg-emerald-600 text-white",
  downtrend: "bg-red-600 text-white",
  sideways: "bg-slate-400 text-white",
};

const sentimentStyle: Record<string, string> = {
  bullish: "bg-emerald-600 text-white",
  bearish: "bg-red-600 text-white",
  neutral: "bg-slate-400 text-white",
};

function ReferenceLink({ title, url, meta }: { title: string; url: string; meta?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
    >
      <span className="flex-1">
        <span className="block">{title}</span>
        {meta && <span className="block text-xs text-muted-foreground mt-0.5">{meta}</span>}
      </span>
      <ExternalLink className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
    </a>
  );
}

export default async function PickDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pick = await getPick(id);
  if (!pick) notFound();

  const details = pick.details ?? {};
  const refs = details.references;
  const hasReferences =
    refs &&
    ((refs.tickerNews?.length ?? 0) > 0 ||
      (refs.macroNews?.length ?? 0) > 0 ||
      (refs.markets?.length ?? 0) > 0 ||
      refs.yahooFinanceUrl ||
      refs.openInsiderUrl);

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Dashboard
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{pick.ticker}</h1>
        <ConvictionBadge score={pick.conviction_score} />
        <Badge variant={pick.status === "active" ? "default" : "secondary"} className="capitalize">
          {pick.status === "closed" && pick.closed_reason === "target_hit"
            ? "Target Hit"
            : pick.status === "closed" && pick.closed_reason === "invalidation_hit"
              ? "Stopped Out"
              : pick.status}
        </Badge>
        {pick.category && <Badge variant="outline">{pick.category}</Badge>}
        {pick.status === "active" && <EarningsFlag ticker={pick.ticker} />}
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Picked {format(new Date(pick.created_at), "MMMM d, yyyy 'at' h:mm a")}
        {pick.closed_at && ` · Closed ${format(new Date(pick.closed_at), "MMMM d, yyyy 'at' h:mm a")}`}
      </p>

      <PickPriceStats pick={pick} />

      <Card>
        <CardHeader>
          <CardTitle>Price Since Pick</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceSparkline
            ticker={pick.ticker}
            sinceISO={pick.created_at}
            untilISO={pick.status === "closed" ? (pick.closed_at ?? undefined) : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Thesis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{pick.thesis}</p>
          {pick.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {pick.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(details.macro || details.insider || details.technical) && (
        <div className="grid gap-4 sm:grid-cols-3">
          {details.macro && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Macro Context</CardTitle>
                <Badge className={cn("w-fit", regimeStyle[details.macro.regime])}>
                  {details.macro.regime}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{details.macro.summary}</p>
                {details.macro.keyFactors.length > 0 && (
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {details.macro.keyFactors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {details.insider && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Insider Signal</CardTitle>
                {pick.insider_sentiment && (
                  <Badge className={cn("w-fit", sentimentStyle[pick.insider_sentiment])}>
                    {pick.insider_sentiment}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {details.insider.candidates
                  .filter((c) => c.ticker === pick.ticker)
                  .map((c) => (
                    <p key={c.ticker} className="text-sm text-muted-foreground">
                      {c.rationale}
                    </p>
                  ))}
                {details.insider.candidates.length > 1 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Other candidates considered:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {details.insider.candidates
                        .filter((c) => c.ticker !== pick.ticker)
                        .map((c) => (
                          <Badge key={c.ticker} variant="outline" className="text-xs">
                            {c.ticker}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {details.technical && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Technical Setup</CardTitle>
                <Badge className={cn("w-fit", trendStyle[details.technical.trend])}>
                  {details.technical.trend}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{details.technical.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {hasReferences && (
        <Card>
          <CardHeader>
            <CardTitle>References</CardTitle>
            <CardDescription>
              The actual sources behind this pick — go verify them yourself.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {refs?.yahooFinanceUrl && (
                <ReferenceLink title={`${pick.ticker} on Yahoo Finance`} url={refs.yahooFinanceUrl} />
              )}
              {refs?.openInsiderUrl && (
                <ReferenceLink title={`${pick.ticker} insider filings on OpenInsider`} url={refs.openInsiderUrl} />
              )}
            </div>

            {refs && refs.tickerNews.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  News on {pick.ticker}
                </p>
                <div className="space-y-2">
                  {refs.tickerNews.map((n, i) => (
                    <ReferenceLink key={i} title={n.title} url={n.url} meta={n.source} />
                  ))}
                </div>
              </div>
            )}

            {refs && refs.markets.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Prediction markets referenced (macro context)
                </p>
                <div className="space-y-2">
                  {refs.markets.map((m, i) => (
                    <ReferenceLink
                      key={i}
                      title={m.question}
                      url={m.url}
                      meta={m.outcomes.map((o) => `${o.name} ${(o.probability * 100).toFixed(0)}%`).join(" · ")}
                    />
                  ))}
                </div>
              </div>
            )}

            {refs && refs.macroNews.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Macro headlines</p>
                <div className="space-y-2">
                  {refs.macroNews.map((n, i) => (
                    <ReferenceLink key={i} title={n.title} url={n.url} meta={n.source} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!hasReferences && (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground">
            This pick was made before structured references were tracked, so no source links are
            available for it.
          </p>
        </>
      )}
    </div>
  );
}
