-- Composer features: attachments, team notes, storage bucket

-- Attachments metadata on messages (files live in Supabase Storage)
alter table public.email_messages add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Internal team notes per thread (never emailed to the client)
create table if not exists public.thread_notes (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  author text not null default 'team',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_thread_notes_thread on public.thread_notes(thread_id, created_at desc);

alter table public.thread_notes enable row level security;

-- DEV: anon access consistent with the rest of the portal
create policy "anon dev access thread_notes" on public.thread_notes
  for all to anon using (true) with check (true);

-- Private storage bucket for email attachments
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;
