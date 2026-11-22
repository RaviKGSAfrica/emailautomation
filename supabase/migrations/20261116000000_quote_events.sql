-- Quote engagement tracking: email opens (pixel) and approval-link clicks
create table if not exists public.quote_events (
  id uuid primary key default uuid_generate_v4(),
  quotation_id uuid references public.quotations(id) on delete cascade,
  approval_token text not null,
  event_type text not null check (event_type in ('open', 'click')),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_events_token on public.quote_events(approval_token, event_type);
create index if not exists idx_quote_events_quotation on public.quote_events(quotation_id);

alter table public.quote_events enable row level security;

-- Writes happen server-side via service role (bypasses RLS).
-- DEV: allow anon read so the dashboard can show engagement counts.
create policy "anon dev read quote_events" on public.quote_events
  for select to anon using (true);
