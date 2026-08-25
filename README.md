# Totally N.F.A. — AI Stock Analysis & Alert App

**Educational project only. Not financial advice.** An AI experiment that connects macroeconomic
narrative, insider trading activity, technical setups, news, and prediction markets into daily
equity "picks," delivered as free push notifications, with a dashboard to track historical
performance. Built entirely on free-tier tools — see [Tech stack](#tech-stack) below.

## Manual setup steps (do these first)

The app needs three accounts it can't create for you — all free, no credit card required for the
tiers used here.

1. **Supabase** — create a free project at [supabase.com](https://supabase.com/dashboard).
   - In the SQL Editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
     then [`supabase/migrations/0002_indexes.sql`](supabase/migrations/0002_indexes.sql).
   - In Project Settings → API, copy the **Project URL**, **anon public key**, and
     **service_role key**.
2. **Gemini API key** — create one for free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
3. **ntfy.sh topic** — no signup needed. Just pick a hard-to-guess topic name (e.g.
   `totally-nfa-alerts-x7k2p9`) and install the [ntfy app](https://ntfy.sh/) (iOS/Android) or
   subscribe at ntfy.sh in a browser. Anyone who knows the exact topic string can subscribe, so
   treat it like an unlisted URL, not a password.

Then:

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEMINI_API_KEY`, and `NTFY_DEFAULT_TOPIC` with the values from steps 1–3.
`CRON_SECRET` is already pre-generated in `.env.local`; keep it as-is or regenerate with:

```bash
openssl rand -hex 32
```

## Running locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Dashboard/Grading pages will show a clear error until real Supabase
credentials are in `.env.local`; Settings loads regardless.

## Manually triggering the pipeline (no need to wait for the cron schedule)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-pick
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-grade
```

Both also accept the secret as `?secret=...` for convenience. Requests without a valid secret get
a `401` before any external API calls are made.

## Deploying to Vercel

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new) (free Hobby plan).
2. Add all the `.env.local` variables as Vercel Project → Settings → Environment Variables.
   Vercel automatically sends `Authorization: Bearer <value>` on cron requests when the variable
   is literally named `CRON_SECRET`, which is exactly what [`vercel.json`](vercel.json)'s cron jobs
   rely on.
3. Confirm both jobs appear under Project → Cron Jobs after your first deploy:
   - Daily pick: `30 13 * * 1-5` (UTC) ≈ 9:30am ET. Vercel Cron runs in UTC, so this drifts an hour
     during DST changes — a known limitation of the free Cron tier, adjust the schedule seasonally
     if it matters to you.
   - Weekly grading: `0 20 * * 5` (Friday).

## Tech stack

Every piece of this app is free: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui,
Supabase (Postgres, free tier), ntfy.sh (free push, no signup), Vercel Cron (free Hobby tier),
Google Gemini API (`@google/genai`, free tier), `yahoo-finance2` for market data, `rss-parser`
against Google News RSS, a `cheerio`-based OpenInsider scraper for insider trading data, and the
public Polymarket Gamma API for prediction-market sentiment.

## Architecture

- **`src/lib/data/`** — data ingestion: `yahoo.ts` (quotes/OHLCV), `insider-scraper.ts`
  (OpenInsider), `news.ts` (Google News RSS), `polymarket.ts` (prediction markets).
- **`src/lib/agents/`** — the reasoning pipeline: `macro-agent.ts`, `insider-agent.ts`,
  `technical-agent.ts`, `synthesis-engine.ts` (final pick), `retrospective-agent.ts` (weekly
  grading). Each calls Gemini via `src/lib/gemini/client.ts`, which validates responses with zod
  and retries once on invalid JSON.
- **`src/app/api/cron/`** — `daily-pick` (9:30am pipeline run + dedup + ntfy push) and
  `weekly-grade` (Friday retrospective + auto-close invalidated picks).
- **`src/app/`** — dashboard (`page.tsx`), AI Auto-Grading (`grading/`), Settings (`settings/`).
- **`supabase/migrations/`** — schema: `stock_picks`, `weekly_retrospectives`, `app_settings`.
  De-duplication is a partial unique index on `(ticker) where status = 'active'` — the database
  itself refuses a second active pick on the same ticker.
