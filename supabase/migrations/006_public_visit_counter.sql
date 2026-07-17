create table if not exists public.public_visit_days (
  id uuid primary key default gen_random_uuid(),
  visit_day date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (visit_day, visitor_hash)
);

create index if not exists public_visit_days_created_at_idx
  on public.public_visit_days (created_at desc);

alter table public.public_visit_days enable row level security;
revoke all on public.public_visit_days from anon, authenticated;

comment on table public.public_visit_days is
  'Privacy-minimized aggregate counter: one service-role-created row per browser token per UTC day.';
