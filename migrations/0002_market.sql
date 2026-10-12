-- Public market cache only. No personal data, no free-text notes, no user_id.
create table if not exists market_cache (
  ticker text primary key,
  company_name text not null,
  sic integer,
  sic_description text not null default '',
  snapshot jsonb not null,
  price double precision,
  price_currency text,
  fetched_at timestamptz not null default now()
);

create index if not exists market_cache_fetched_idx on market_cache (fetched_at desc);

create table if not exists scan_log (
  id bigserial primary key,
  ticker text not null,
  model smallint not null check (model between 1 and 4),
  verdict text not null,
  scanned_at timestamptz not null default now()
);

create index if not exists scan_log_scanned_idx on scan_log (scanned_at desc);
create index if not exists scan_log_ticker_idx on scan_log (ticker);
