-- Klient-mappe: AI-vedligeholdt behandlingsoverblik per klient.
-- Klienter oprettes lokalt i appen (client_id er appens eget id); kun
-- overblikket - der bygges af serverens AI-agent - ligger her.

create table if not exists public.client_overviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       text not null,
  client_name     text not null,
  output          jsonb not null default '{}',
  session_count   integer not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table public.client_overviews enable row level security;

drop policy if exists "client_overviews_select_own" on public.client_overviews;
create policy "client_overviews_select_own" on public.client_overviews
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "client_overviews_insert_own" on public.client_overviews;
create policy "client_overviews_insert_own" on public.client_overviews
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "client_overviews_update_own" on public.client_overviews;
create policy "client_overviews_update_own" on public.client_overviews
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "client_overviews_delete_own" on public.client_overviews;
create policy "client_overviews_delete_own" on public.client_overviews
  for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists client_overviews_touch on public.client_overviews;
create trigger client_overviews_touch
  before update on public.client_overviews
  for each row execute function public.touch_updated_at();
