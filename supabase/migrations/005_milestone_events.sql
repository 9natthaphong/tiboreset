create table if not exists public.milestone_events (
  id uuid primary key default gen_random_uuid(),
  source_post_id text not null unique,
  source_url text not null,
  source_account text not null,
  reported_active_users bigint not null check (reported_active_users > 0),
  denominator text not null check (denominator in ('codex_only','codex_and_chatgpt_work','unknown')),
  reset_type text not null check (reset_type in ('full','banked','scheduled','announcement_only')),
  announced_at timestamptz not null,
  execution_at timestamptz,
  verification_status text not null check (verification_status in ('extracted','needs_review','verified','rejected')),
  verification_method text not null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists milestone_events_verified_lookup on public.milestone_events (verification_status, denominator, reported_active_users desc, announced_at desc);
alter table public.milestone_events enable row level security;
revoke all on public.milestone_events from anon, authenticated;
