export function DisclaimerFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/50">
      <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Educational project only — not financial advice.</strong>{" "}
        Totally N.F.A. is an AI experiment that connects public data sources (market quotes, scraped
        insider filings, news headlines, prediction markets) into hypothetical stock &quot;picks&quot;
        for learning purposes. Data may be delayed, inaccurate, incomplete, or sourced from unofficial
        scrapers. Nothing on this site is investment, financial, legal, or tax advice, and no
        recommendation to buy or sell any security is being made. Do your own research and consult a
        licensed professional before making any financial decision.
      </div>
    </footer>
  );
}
