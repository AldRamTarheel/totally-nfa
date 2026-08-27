@AGENTS.md

# Totally N.F.A.

An educational (not financial advice) AI stock-picking tool. A multi-agent Gemini pipeline reads
macro conditions, insider trading activity, technical setups, and prediction-market odds, then
picks at most one equity per weekday, pushes a phone notification via ntfy.sh, and tracks its own
performance (including grading itself weekly and benchmarking against QQQ). Every piece of the
stack is a free tier or free/open tool — see "Free-tier constraints" below before adding anything.

## Architecture

**Ingestion** (`src/lib/data/*`) — each module is a plain async function wrapper around one
external source, fails soft (empty array / all-null) rather than throwing where the data is
best-effort: `yahoo.ts` (quotes/OHLCV/macro proxies via `yahoo-finance2`, plus `getEarningsCalendar`
for the pick detail page's earnings flag), `insider-scraper.ts` + `finviz-scraper.ts` +
`insider-combined.ts` (OpenInsider and Finviz insider filings, merged and deduplicated since both
report the same underlying SEC Form 4s), `news.ts` (Google News RSS), `polymarket.ts` (Polymarket's
public Gamma API).

**Agents** (`src/lib/agents/*`) — `macro-agent.ts`, `insider-agent.ts`, `technical-agent.ts` each
fetch their own data slice and call Gemini (via `src/lib/gemini/client.ts`'s `generateStructured`,
which validates the response with zod and retries once on invalid JSON, with separate quota-aware
retry for 429/503 that parses Gemini's own suggested `retryDelay`). `synthesis-engine.ts` is the
only agent that produces the final persisted pick — it takes an explicit `candidate` to evaluate
(the caller picks which one; see "anti-repetition" below), combining it with the macro/insider
context plus its own recent news into one conviction score / invalidation price / target price /
thesis. `retrospective-agent.ts` powers the Friday grading job. `portfolio-review-agent.ts` powers
the "nothing new today" daily check-in — ONE Gemini call reviewing every active position's fresh
news together (never one call per ticker), judging conviction as improving/stable/weakening.

**Anti-repetition (important behavioral design)** — the daily-pick route does NOT just evaluate
`insider.candidates[0]`. It first checks (a free DB query, zero Gemini cost) which ranked
candidates are already active picks, and only spends the technical+synthesis Gemini calls on the
first one that ISN'T. Without this, a ticker that keeps resurfacing as the top insider candidate
would silently block any other opportunity from ever being considered — this actually happened in
production (BRVE stayed top-ranked for days) before the fix. **Exactly one ntfy notification fires
every day**, either "New Pick" or "No New Pick Today" (the latter carries the portfolio review
summary) — there is no silent/no-notification outcome anymore.

**Persistence & exits** — `stock_picks` in Supabase, with a partial unique index
(`ticker where status='active'`) doing 100% of the active-duplicate prevention at the DB level, no
application-level dedup logic needed. `src/lib/position-monitor.ts`'s `closeHitPositions` checks
every active pick's live price against both `invalidation_price` and `target_price` and auto-closes
+ notifies on a hit — called from the daily-pick cron (before spending quota on a new pick) and
again defensively from weekly-grade. `pipeline_runs` (via `src/lib/pipeline-log.ts`'s
`logPipelineRun`) logs every single cron invocation — picked/duplicate/no-pick/graded/error — so a
day with nothing new still leaves a visible trace on the `/grading` page's Pipeline Run Log.

**Cron routes** (`src/app/api/cron/{daily-pick,weekly-grade}/route.ts`) — both gated by
`src/lib/cron-auth.ts`'s `isAuthorizedCronRequest` (checks `Authorization: Bearer $CRON_SECRET` or
a `?secret=` query param) *before* any external call, so an unauthorized hit costs nothing. Both
also call `sendCronFailureNotification` (`src/lib/notifications/cron-failure.ts`) on any thrown
error — it has its own independent fallback to read `NTFY_DEFAULT_TOPIC` directly from env if even
`getServerSupabase()`/`getNtfyTopic()` are what's broken, so a failure alert has the best chance of
still going out.

**Reliability: Vercel Cron is not fully trustworthy on Hobby.** It has been observed to silently
skip a scheduled run entirely — zero runtime logs, zero `pipeline_runs` row, no error, nothing —
not just "delayed." `.github/workflows/backup-cron.yml` is a GitHub Actions workflow that pings
both cron endpoints ~10 minutes after Vercel's own schedule as a free, independent backup; it's a
safe no-op if Vercel already ran (DB dedup / `no-picks-to-grade` response either way). Its
`CRON_SECRET` is stored as a GitHub Actions repo secret (`gh secret set CRON_SECRET`), separate from
Vercel's copy of the same value.

**Notifications** (`src/lib/notifications/*`) — `ntfy.ts` is the raw `fetch(POST
https://ntfy.sh/<topic>)` helper and `getNtfyTopic` (reads `app_settings.ntfy_topic`, falls back to
`NTFY_DEFAULT_TOPIC`); `position-alerts.ts` formats exit notifications; `cron-failure.ts` formats
failure alerts (distinct "⚠️" title/tag from normal pick/exit notifications).

**Frontend pages** — `/` dashboard (active + past picks, `picks-table.tsx` renders a full `<Table>`
on `sm:` and up but a stacked-card layout below it — see mobile note below), `/picks/[id]` detail
page (price sparkline via `/api/history`, earnings-date flag via `/api/earnings`, macro/insider/
technical breakdown, References with real source links), `/performance` (benchmark-vs-QQQ,
cumulative equity curve, $1,000/pick hypothetical portfolio sim, conviction-score calibration — all
hand-rolled inline SVG, no charting library), `/grading` (weekly retrospectives + Pipeline Run Log),
`/settings` (ntfy topic config). Dark mode via `next-themes` (already-installed, just needed
wiring), toggle in the nav. PWA-installable (`public/manifest.json` + real icon PNGs generated via
macOS's built-in `qlmanage`/`sips` — no new dependency needed for that).

**Mobile responsiveness** — shadcn's `<Table>` wraps in its own `overflow-x-auto` container, which
sounds safe but a 9-column table (picks) or 5-column table (pipeline log) still doesn't fit a phone
screen even with that scroll container — it just becomes an internal horizontal scrollbar, which
reads as "the whole site scrolls sideways." Fixed by rendering a completely different stacked-card
layout below the `sm` breakpoint (`className="sm:hidden"` for cards, `"hidden sm:block"` for the
real table) rather than relying on the scroll container to save you. Same fix applied to the nav bar
(hamburger + slide-down menu below `sm`, full horizontal nav above it) — a 4-link nav row was
wrapping into 3 cramped lines on narrow phones. Verify fixes with
`document.documentElement.scrollWidth === window.innerWidth` at 375px, not just eyeballing.

## Known gotchas (hard-won — don't reintroduce these)

- **`yahoo-finance2` v4** requires `new YahooFinance({suppressNotices:[...]})`, not the old static
  methods (`yahooFinance.quote(...)` throws "Call `new YahooFinance()` first").
- Its `chart()`/`getHistorical` rejects an **explicitly-present `period2: undefined`** key — the
  schema validator treats a present-but-undefined key differently from an omitted one. Only spread
  `period2` in when actually provided (see `getHistorical` in `src/lib/data/yahoo.ts`).
- **OpenInsider's HTML** uses a non-breaking space (` `) inside multi-word header labels like
  "Trade Type" — a naive `row["Trade Type"]` lookup silently returns `undefined` forever. Always
  normalize scraped header/cell text with `/\s+/g` (JS's `\s` already matches ` ` per spec)
  before doing exact-string lookups.
- **Polymarket's `active` flag stays `true` forever**, even for markets resolved years ago — it
  does not mean "still tradable." The real signal is `closed === false`. The
  `/markets?active=true&closed=false&order=volume24hr&ascending=false` endpoint reliably returns
  current markets; the `/public-search` endpoint does **not** filter out closed markets at all.
- **`gemini-flash-latest`** currently resolves to a brand-new preview model (`gemini-3.7-flash`)
  with a very tight (~20/day) free-tier quota. `src/lib/env.ts` deliberately defaults
  `GEMINI_MODEL` to `gemini-flash-lite-latest`, which has real headroom. Don't "fix" this back.
- The reasoning pipeline is **quota-conscious by design**: normally 4 Gemini calls/day (macro,
  insider, technical, synthesis), +1 more on a "nothing new today" day (portfolio review), +1
  more weekly (retrospective). If the top candidate is a duplicate, the anti-repetition logic tries
  the *next* candidate instead — same call count, just a different ticker, not extra calls. **Never
  add a new Gemini call for an incidental feature** — every feature added after the initial build
  uses only already-fetched data or new free (yahoo-finance2/Supabase-only) fetches, on purpose.
- **Vercel Cron on Hobby can silently skip a run entirely**, not just run late — verified via zero
  runtime logs and zero `pipeline_runs` rows on a day it should have fired. This is why the GitHub
  Actions backup cron exists; don't remove it without a better reliability guarantee in place.
- Vercel auto-injects `Authorization: Bearer <value>` on cron requests when the env var is
  literally named `CRON_SECRET` — this is why `cron-auth.ts`'s header check needs no extra Vercel
  config.
- `next-themes` requires `suppressHydrationWarning` on `<html>` (it mutates the class attribute
  client-side before hydration) — already set in `src/app/layout.tsx`.
- Next.js `Metadata.themeColor` is deprecated — use a separate `export const viewport: Viewport`.
- shadcn's `<Table>` component's built-in horizontal scroll container is **not** a real mobile
  fix for wide tables — see "Mobile responsiveness" above. Always test at 375px width with
  `scrollWidth`/`clientWidth`, not just a desktop screenshot.
- This project's `select.tsx` wraps `@base-ui/react/select`, **not Radix** — the controlled props
  (`value`/`onValueChange`) happen to match Radix's convention, but verify against
  `node_modules/@base-ui/react/select`'s actual types rather than assuming, especially if there's
  no existing `<Select>` usage elsewhere in the codebase to copy from.
- `docx-js`'s `PositionalTab` (for right-aligned text on the same line) is not reliably honored by
  LibreOffice's renderer — it silently fails to right-align. Use plain `tabStops` +
  `new Tab()` instead (fully supported everywhere); only use `PositionalTab` if you've visually
  verified the specific renderer honors it.
- When splitting a large feature set across parallel subagents, give each one a **strictly disjoint
  file list** up front (verify with `git diff --stat` after) rather than trusting them to coordinate
  — concurrent edits to a shared file (e.g. `layout.tsx`, `nav-tabs.tsx`) are the actual risk, not
  the agents' individual correctness.

## Free-tier constraints

- **Gemini**: ~4–6 calls/day budget depending on the day's outcome (see above). The free tier's
  per-model quotas can be surprisingly tight and inconsistent between models — if something
  suddenly 429s, check whether `GEMINI_MODEL` needs to point at a different alias, not just "wait
  and retry."
- **Vercel Cron (Hobby)**: once/day per job, two jobs total (`vercel.json`), and *not guaranteed to
  fire at all* — see the GitHub Actions backup. Use manual `curl` triggers (below) for anything
  more frequent during development.
- **ntfy.sh**: no auth at all — the topic name *is* the only secret. Never log it, never put it
  somewhere public other than the app's own Settings page.
- **OpenInsider / Finviz**: unofficial, scraped, best-effort. Expect occasional garbage rows
  (e.g. a source site's own broken SEO template titles) — that's the data, not a bug to chase.
- **GitHub Actions** (backup cron): free tier scheduled workflows are also best-effort, but running
  two independent providers makes a full silent miss on both, on the same day, very unlikely.

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

Manually trigger the GitHub Actions backup workflow (also runs both jobs):

```bash
gh workflow run "Backup Cron Trigger"
gh run list --workflow="Backup Cron Trigger" --limit 3   # check it actually succeeded
```

Debug "did the cron actually run today" — check `pipeline_runs` in Supabase (via the dashboard SQL
editor, or `supabase-js` with the service-role key) ordered by `created_at desc`; this is more
authoritative than Vercel's own logs, which have a short retention window.

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
| `CRON_SECRET` | `openssl rand -hex 32`; also set as a GitHub Actions repo secret (`gh secret set CRON_SECRET`) for the backup workflow |
| `MACRO_TICKERS` | Defaults to `QQQ,GLD,USO` |

## Deployment

- Vercel project: `aldair2/totally-nfa`, live at https://totally-nfa.vercel.app
- GitHub: https://github.com/AldRamTarheel/totally-nfa (public)
- All env vars above are already set on Vercel across Production/Preview/Development. A `git push`
  to `main` auto-deploys.
- `.github/workflows/backup-cron.yml` runs on GitHub's own schedule, independent of Vercel deploys —
  it doesn't need redeploying when the app changes, only if the cron paths/schedule change.
- Supabase migrations live in `supabase/migrations/*.sql`, applied manually via the Supabase SQL
  Editor (no CLI/ORM migration runner wired up) — always check the highest-numbered file to see
  what's already been applied vs. what's new in a session.
