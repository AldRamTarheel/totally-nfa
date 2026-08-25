-- Adds a take-profit counterpart to invalidation_price, and a structured
-- breakdown of the reasoning behind each pick (macro/insider/technical +
-- clickable source references) for the pick detail page.
alter table stock_picks add column if not exists target_price numeric;
alter table stock_picks add column if not exists details jsonb not null default '{}';
