-- Mark a single quotation per lead as the "selected" one used for
-- follow-up emails and dashboard analytics.
alter table public.quotations
  add column if not exists is_active boolean not null default false;

create index if not exists idx_quotations_active
  on public.quotations(lead_id, is_active)
  where is_active;
