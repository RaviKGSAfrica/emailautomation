-- Align pre-existing tables with the application schema.
-- The live database already contains leads/email_threads/email_messages/
-- quotations/audits with a subset of columns, so this migration only adds
-- missing columns, indexes, and triggers. All statements are idempotent.

-- leads: missing pipeline/spec columns
alter table public.leads add column if not exists phone text;
alter table public.leads add column if not exists status text not null default 'new';
alter table public.leads add column if not exists audit_stage text not null default 'intake';
alter table public.leads add column if not exists specs jsonb not null default '{}'::jsonb;
alter table public.leads add column if not exists last_contacted_at timestamptz;
alter table public.leads add column if not exists next_follow_up_at timestamptz;
alter table public.leads add column if not exists updated_at timestamptz not null default now();

-- email_threads: missing created_at
alter table public.email_threads add column if not exists created_at timestamptz not null default now();

-- email_messages: missing routing/content columns
alter table public.email_messages add column if not exists recipient_email text;
alter table public.email_messages add column if not exists subject text;
alter table public.email_messages add column if not exists body_html text;
alter table public.email_messages add column if not exists provider_message_id text;
alter table public.email_messages add column if not exists sent_at timestamptz not null default now();

-- provider_message_id powers inbound dedupe in /api/emails/sync
create unique index if not exists idx_email_messages_provider_id
  on public.email_messages(provider_message_id)
  where provider_message_id is not null;

-- quotations: missing lifecycle timestamps
alter table public.quotations add column if not exists sent_at timestamptz;
alter table public.quotations add column if not exists accepted_at timestamptz;
alter table public.quotations add column if not exists expires_at timestamptz;
alter table public.quotations add column if not exists updated_at timestamptz not null default now();

-- audits: missing scheduling/findings columns
alter table public.audits add column if not exists type text not null default 'initial';
alter table public.audits add column if not exists scheduled_for date;
alter table public.audits add column if not exists completed_at timestamptz;
alter table public.audits add column if not exists recertify_due_at date;
alter table public.audits add column if not exists findings jsonb not null default '{}'::jsonb;
alter table public.audits add column if not exists updated_at timestamptz not null default now();

-- Triggers (idempotent: drop + recreate)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch
  before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_quotations_touch on public.quotations;
create trigger trg_quotations_touch
  before update on public.quotations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_audits_touch on public.audits;
create trigger trg_audits_touch
  before update on public.audits
  for each row execute function public.touch_updated_at();

-- Auto-audit when a quotation is accepted
create or replace function public.handle_quote_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ACCEPTED' and old.status is distinct from 'ACCEPTED' then
    insert into public.audits (lead_id, type, status, scheduled_for, recertify_due_at)
    values (new.lead_id, 'initial', 'scheduled', current_date, current_date + interval '90 days');

    update public.leads
    set status = 'won',
        stage = 'AUDIT_SCHEDULED',
        audit_stage = 'in_progress',
        updated_at = now()
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quote_accepted on public.quotations;
create trigger trg_quote_accepted
  after update on public.quotations
  for each row execute function public.handle_quote_accepted();

-- Auto-audit when a lead is certified
create or replace function public.handle_lead_certified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.audit_stage = 'certified' and (old.audit_stage is distinct from 'certified') then
    insert into public.audits (lead_id, type, status, scheduled_for, recertify_due_at)
    values (new.id, 'initial', 'scheduled', current_date, current_date + interval '90 days');
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lead_certified on public.leads;
create trigger trg_lead_certified
  before update on public.leads
  for each row execute function public.handle_lead_certified();
