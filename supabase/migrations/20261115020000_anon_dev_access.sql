-- DEV ONLY: allow the anon role to read/write pipeline tables so the portal
-- works without Supabase Auth. Remove or replace with proper auth policies
-- before any public deployment.

do $$
declare t text;
begin
  foreach t in array array['leads','email_threads','email_messages','quotations','audits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "anon dev access %I" on public.%I', t, t);
    execute format(
      'create policy "anon dev access %I" on public.%I for all to anon using (true) with check (true)',
      t, t
    );
  end loop;
end $$;
