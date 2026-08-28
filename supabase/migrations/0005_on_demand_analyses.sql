-- `on_demand_analyses` is intentionally a SEPARATE table from `stock_picks`.
-- These are one-off "ask the AI about a ticker" snapshots triggered directly
-- by a public visitor, not tracked positions: no auto-close, no
-- position-monitor involvement, and none of the anti-repetition/capacity
-- logic that governs `stock_picks` applies here. Each row is just a
-- point-in-time AI opinion, rate-limited to 3/day (see src/app/api/on-demand
-- /route.ts), and never transitions status or gets revisited.

create table if not exists on_demand_analyses (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  requested_at timestamptz not null default now(),
  conviction_score smallint not null check (conviction_score between 1 and 10),
  invalidation_price numeric not null,
  target_price numeric not null,
  thesis text not null,
  sentiment text check (sentiment in ('bullish', 'bearish', 'neutral')),
  category text,
  tags text[] not null default '{}'
);

create index if not exists idx_on_demand_analyses_requested_at on on_demand_analyses (requested_at desc);

alter table on_demand_analyses enable row level security;
drop policy if exists "Public read access" on on_demand_analyses;
create policy "Public read access" on on_demand_analyses for select using (true);
