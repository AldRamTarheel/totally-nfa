-- Follow-up indexes for common dashboard query patterns.
create index if not exists idx_stock_picks_status on stock_picks (status);
create index if not exists idx_stock_picks_created_at on stock_picks (created_at desc);
create index if not exists idx_retro_week_start on weekly_retrospectives (week_start desc);
