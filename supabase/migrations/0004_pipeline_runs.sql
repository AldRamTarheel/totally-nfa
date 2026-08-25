create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('daily-pick', 'weekly-grade')),
  status text not null check (status in ('picked', 'duplicate', 'no-pick', 'graded', 'no-picks-to-grade', 'error')),
  ticker text,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pipeline_runs_created_at on pipeline_runs (created_at desc);

alter table pipeline_runs enable row level security;
drop policy if exists "Public read access" on pipeline_runs;
create policy "Public read access" on pipeline_runs for select using (true);
