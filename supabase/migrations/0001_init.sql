-- Totally N.F.A. — core schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query) on a
-- free-tier project. Safe to re-run (all statements are idempotent).

create extension if not exists pgcrypto;

-- StockPicks -----------------------------------------------------------
create table if not exists stock_picks (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  created_at timestamptz not null default now(),
  alert_price numeric not null,
  last_checked_price numeric,
  last_checked_at timestamptz,
  conviction_score smallint not null check (conviction_score between 1 and 10),
  invalidation_price numeric not null,
  insider_sentiment text check (insider_sentiment in ('bullish', 'bearish', 'neutral')),
  thesis text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  category text,
  tags text[] not null default '{}',
  closed_at timestamptz,
  closed_reason text
);

-- De-dup: only one ACTIVE pick per ticker at a time. This partial unique
-- index is the entire de-duplication mechanism — a second insert attempt
-- for the same active ticker will fail at the DB level.
create unique index if not exists uniq_active_ticker
  on stock_picks (ticker)
  where status = 'active';

-- WeeklyRetrospectives ---------------------------------------------------
create table if not exists weekly_retrospectives (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  summary text not null,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (week_start, week_end)
);

-- Settings ---------------------------------------------------------------
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('ntfy_topic', 'totally-nfa-alerts-CHANGE-ME')
on conflict (key) do nothing;

-- Row Level Security -------------------------------------------------------
-- Dashboard reads with the anon key; all writes go through server API
-- routes using the service-role key, which bypasses RLS entirely — so no
-- write policies are defined (anon has no write path at all).
alter table stock_picks enable row level security;
alter table weekly_retrospectives enable row level security;
alter table app_settings enable row level security;

drop policy if exists "Public read access" on stock_picks;
create policy "Public read access" on stock_picks for select using (true);

drop policy if exists "Public read access" on weekly_retrospectives;
create policy "Public read access" on weekly_retrospectives for select using (true);

drop policy if exists "Public read access" on app_settings;
create policy "Public read access" on app_settings for select using (true);
