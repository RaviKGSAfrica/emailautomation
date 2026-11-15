-- Core schema & auto-audit trigger
-- Schema aligned with api routes: quotations / email_messages / leads.stage

create extension if not exists "uuid-ossp";

-- Leads / companies in the audit pipeline
create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  contact_name text,
  contact_email text,
  phone text,
  status text not null default 'new'
    check (status in ('new', 'qualified', 'quoted', 'won', 'lost')),
  stage text not null default 'NEW'
    check (stage in ('NEW', 'QUOTED', 'AUDIT_SCHEDULED', 'AUDIT_IN_PROGRESS', 'CERTIFIED', 'LOST')),
  audit_stage text not null default 'intake'
    check (audit_stage in ('intake', 'in_progress', 'review', 'certified', 'expired')),
  specs jsonb not null default '{}'::jsonb,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inbound + outbound email threads
create table if not exists public.email_threads (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  subject text not null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Individual email messages (inbound + outbound)
create table if not exists public.email_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_email text not null,
  recipient_email text,
  subject text,
  body_text text,
  body_html text,
  provider_message_id text unique,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_email_messages_thread on public.email_messages(thread_id, sent_at);
create index if not exists idx_email_threads_lead on public.email_threads(lead_id);

-- Quotations sent to leads
create table if not exists public.quotations (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  quote_number text not null unique
    default 'QT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  approval_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  mandays integer not null default 0,
  total_amount numeric(12, 2) not null default 0,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quotations_lead on public.quotations(lead_id);
create index if not exists idx_quotations_token on public.quotations(approval_token);

-- Audit events / recertification tracking
create table if not exists public.audits (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null default 'initial',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'failed')),
  scheduled_for date,
  completed_at timestamptz,
  recertify_due_at date,
  findings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audits_lead on public.audits(lead_id);
create index if not exists idx_audits_recertify on public.audits(recertify_due_at)
  where recertify_due_at is not null;

-- Auto-audit trigger: when a lead reaches 'certified', schedule an audit
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

-- Auto-audit on quote acceptance: trg_quote_accepted fires when a quotation
-- transitions to 'ACCEPTED', generating the Audit row and advancing the Lead.
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

-- Keep updated_at fresh on quotations/audits/email_threads
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quotations_touch on public.quotations;
create trigger trg_quotations_touch
  before update on public.quotations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_audits_touch on public.audits;
create trigger trg_audits_touch
  before update on public.audits
  for each row execute function public.touch_updated_at();

-- Row Level Security
alter table public.leads enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
alter table public.quotations enable row level security;
alter table public.audits enable row level security;

-- Authenticated portal users can read/write pipeline data.
-- Tighten these policies to your auth model as needed.
create policy "authenticated full access leads" on public.leads
  for all to authenticated using (true) with check (true);
create policy "authenticated full access threads" on public.email_threads
  for all to authenticated using (true) with check (true);
create policy "authenticated full access messages" on public.email_messages
  for all to authenticated using (true) with check (true);
create policy "authenticated full access quotations" on public.quotations
  for all to authenticated using (true) with check (true);
create policy "authenticated full access audits" on public.audits
  for all to authenticated using (true) with check (true);
