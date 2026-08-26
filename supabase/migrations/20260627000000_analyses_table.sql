-- Dialogue — Fase 3 backend: analyses (AI outputs from different agents)

-- 1) Analyses: one row per analysis type per conversation.
create table if not exists public.analyses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  type            text not null check (type in ('psykolog', 'forretningsreferat', 'interview')),
  output          jsonb not null default '{}',
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, conversation_id, type)
);

alter table public.analyses enable row level security;

-- Owners can read/write only their own analyses.
drop policy if exists "analyses_select_own" on public.analyses;
create policy "analyses_select_own" on public.analyses
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "analyses_insert_own" on public.analyses;
create policy "analyses_insert_own" on public.analyses
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "analyses_update_own" on public.analyses;
create policy "analyses_update_own" on public.analyses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "analyses_delete_own" on public.analyses;
create policy "analyses_delete_own" on public.analyses
  for delete to authenticated using (auth.uid() = user_id);

-- 2) Keep updated_at fresh.
drop trigger if exists analyses_touch on public.analyses;
create trigger analyses_touch
  before update on public.analyses
  for each row execute function public.touch_updated_at();

-- 3) Subscribe to live analysis updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'analyses'
  ) then
    alter publication supabase_realtime add table public.analyses;
  end if;
end $$;
