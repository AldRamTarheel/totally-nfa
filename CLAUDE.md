@AGENTS.md

# Totally N.F.A.

An educational (not financial advice) AI stock-picking tool. A multi-agent Gemini pipeline reads
macro conditions, insider trading activity, technical setups, and prediction-market odds, then
picks at most one equity per weekday, pushes a phone notification via ntfy.sh, and tracks its own
performance (including grading itself against a benchmark and its own past predictions). Every
piece of the stack is a free tier or free/open tool — see "Free-tier constraints" below before
adding anything.

## Architecture

**Ingestion** (`src/lib/data/*`) — each module is a plain async function wrapper around one
external source, fails soft (empty array / all-null) rather than throwing where the data is
best-effort: `yahoo.ts` (quotes/OHLCV/macro proxies via `yahoo-finance2`), `insider-scraper.ts` +
`finviz-scraper.ts` + `insider-combined.ts` (OpenInsider and Finviz insider filings, merged and
deduplicated since both report the same underlying SEC Form 4s), `news.ts` (Google News RSS),
`polymarket.ts` (Polymarket's public Gamma API).

**Agents** (`src/lib/agents/*`) — `macro-agent.ts`, `insider-agent.ts`, `technical-agent.ts` each
fetch their own data slice and call Gemini (via `src/lib/gemini/client.ts`'s `generateStructured`,
which validates the response with zod and retries once on invalid JSON, with separate quota-aware
retry for 429/503). `synthesis-engine.ts` is the only agent that produces the final persisted pick,
combining all three plus the top candidate's own news into one conviction score / invalidation
price / target price / thesis. `retrospective-agent.ts` powers the Friday grading job.

**Persistence & exits** — `stock_picks` in Supabase, with a partial unique index
(`ticker where status='active'`) doing 100% of the active-duplicate prevention at the DB level, no
application-level dedup logic needed. `src/lib/position-monitor.ts`'s `closeHitPositions` checks
every active pick's live price against both `invalidation_price` and `target_price` and auto-closes
+ notifies on a hit — called from the daily-pick cron (before spending quota on a new pick) and
again defensively from weekly-grade.

**Cron routes** (`src/app/api/cron/{daily-pick,weekly-grade}/route.ts`) — both gated by
`src/lib/cron-auth.ts`'s `isAuthorizedCronRequest` (checks `Authorization: Bearer $CRON_SECRET` or
a `?secret=` query param) *before* any external call, so an unauthorized hit costs nothing.

**Notifications** (`src/lib/notifications/*`) — `ntfy.ts` is the raw `fetch(POST
https://ntfy.sh/<topic>)` helper and `getNtfyTopic` (reads `app_settings.ntfy_topic`, falls back to
`NTFY_DEFAULT_TOPIC`); `position-alerts.ts` formats exit notifications.

## Known gotchas (hard-won — don't reintroduce these)

- **`yahoo-finance2` v4** requires `new YahooFinance({suppressNotices:[...]})`, not the old static
  methods (`yahooFinance.quote(...)` throws "Call `new YahooFinance()` first").
- Its `chart()`/`getHistorical` rejects an **explicitly-present `period2: undefined`** key — the
  schema validator treats a present-but-undefined key differently from an omitted one. Only spread
  `period2` in when actually provided (see `getHistorical` in `src/lib/data/yahoo.ts`).
- **OpenInsider's HTML** uses a non-breaking space (` `) inside multi-word header labels like
  "Trade Type" — a naive `row["Trade Type"]` lookup silently returns `undefined` forever. Always
  normalize scraped header/cell text with `/\s+/g` (JS's `\s` already matches ` ` per spec)
  before doing exact-string lookups.
- **Polymarket's `active` flag stays `true` forever**, even for markets resolved years ago — it
  does not mean "still tradable." The real signal is `closed === false`. The
  `/markets?active=true&closed=false&order=volume24hr&ascending=false` endpoint reliably returns
  current markets; the `/public-search` endpoint does **not** filter out closed markets at all.
- **`gemini-flash-latest`** currently resolves to a brand-new preview model (`gemini-3.7-flash`)
  with a very tight (~20/day) free-tier quota. `src/lib/env.ts` deliberately defaults
  `GEMINI_MODEL` to `gemini-flash-lite-latest`, which has real headroom. Don't "fix" this back.
- The reasoning pipeline is **quota-conscious by design**: 4 Gemini calls/day total (macro,
  insider, technical, synthesis; +1 more, weekly, for retrospective). **Never add a new Gemini call
  for an incidental feature** — every feature added after the initial build (benchmarking, sparkline,
  earnings flag, pipeline logging, etc.) uses only already-fetched data or new free
  (yahoo-finance2/Supabase-only) fetches, on purpose.
- Vercel Cron on the Hobby plan only supports **once-per-day** schedules per job — this is why
  exit-checking is folded into the once-daily `daily-pick` run instead of its own more-frequent cron.
- Vercel auto-injects `Authorization: Bearer <value>` on cron requests when the env var is
  literally named `CRON_SECRET` — this is why `cron-auth.ts`'s header check needs no extra Vercel
  config.
- `next-themes` requires `suppressHydrationWarning` on `<html>` (it mutates the class attribute
  client-side before hydration) — already set in `src/app/layout.tsx`.
- Next.js `Metadata.themeColor` is deprecated — use a separate `export const viewport: Viewport`.

## Free-tier constraints

- **Gemini**: ~4 calls/day budget in normal operation. The free tier's per-model quotas can be
  surprisingly tight and inconsistent between models — if something suddenly 429s, check whether
  `GEMINI_MODEL` needs to point at a different alias, not just "wait and retry."
- **Vercel Cron (Hobby)**: once/day per job, two jobs total (`vercel.json`). Use manual `curl`
  triggers (below) for anything more frequent during development.
- **ntfy.sh**: no auth at all — the topic name *is* the only secret. Never log it, never put it
  somewhere public other than the app's own Settings page.
- **OpenInsider / Finviz**: unofficial, scraped, best-effort. Expect occasional garbage rows
  (e.g. a source site's own broken SEO template titles) — that's the data, not a bug to chase.

## Common commands

```bash
npm run dev            # local dev server
npm run build           # production build (also type-checks)
npm run lint             # eslint
```

Manually trigger a cron job (works locally against `http://localhost:3000` or against the deployed
URL):

```bash
curl -X POST https://totally-nfa.vercel.app/api/cron/daily-pick \
  -H "Authorization: Bearer $CRON_SECRET"
curl -X POST https://totally-nfa.vercel.app/api/cron/weekly-grade \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Environment variables

See `.env.local.example` for the full list with comments; `src/lib/env.ts` validates all of them
with zod at first use (server-only vars) or at import (the two `NEXT_PUBLIC_*` ones). Quick
reference:

| Var | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `GEMINI_MODEL` | Defaults to `gemini-flash-lite-latest`; only override if you've checked quota on the alternative first |
| `NTFY_DEFAULT_TOPIC` | Any hard-to-guess string; also editable at runtime via the Settings page |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `MACRO_TICKERS` | Defaults to `QQQ,GLD,USO` |

## Deployment

- Vercel project: `aldair2/totally-nfa`, live at https://totally-nfa.vercel.app
- GitHub: https://github.com/AldRamTarheel/totally-nfa (public)
- All env vars above are already set on Vercel across Production/Preview/Development. A `git push`
  to `main` auto-deploys.
