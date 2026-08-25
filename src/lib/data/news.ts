import Parser from "rss-parser";

const parser = new Parser();

export interface NewsHeadline {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
}

function googleNewsRssUrl(query: string): string {
  const params = new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

// Google News RSS titles are formatted "Headline - Source Name"; rss-parser
// doesn't surface a separate <source> field, so extract it heuristically.
function splitSource(title: string): { title: string; source?: string } {
  const idx = title.lastIndexOf(" - ");
  if (idx === -1) return { title };
  return { title: title.slice(0, idx), source: title.slice(idx + 3) };
}

async function fetchHeadlines(query: string, limit: number): Promise<NewsHeadline[]> {
  try {
    const feed = await parser.parseURL(googleNewsRssUrl(query));
    return (feed.items ?? []).slice(0, limit).map((item) => {
      const { title, source } = splitSource(item.title ?? "");
      return {
        title,
        link: item.link ?? "",
        pubDate: item.pubDate ?? item.isoDate ?? "",
        source,
      };
    });
  } catch {
    // Best-effort feed — fail soft so a Google News hiccup doesn't kill the pipeline.
    return [];
  }
}

/** Recent headlines mentioning a specific ticker. */
export async function getNewsForTicker(ticker: string, limit = 8): Promise<NewsHeadline[]> {
  return fetchHeadlines(`${ticker} stock`, limit);
}

/** Broad macro/market headlines for the Macro Agent. */
export async function getMacroNews(limit = 8): Promise<NewsHeadline[]> {
  return fetchHeadlines("stock market economy Fed", limit);
}
