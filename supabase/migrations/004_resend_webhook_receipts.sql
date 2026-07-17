create table if not exists resend_webhook_receipts(
  id text primary key,
  event_type text not null,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null check(status in('processing','completed','failed')),
  delivery_count integer not null default 0,
  error_code text
);
alter table resend_webhook_receipts enable row level security;
-- No public policies: only protected service-role server code may read or write receipts.
