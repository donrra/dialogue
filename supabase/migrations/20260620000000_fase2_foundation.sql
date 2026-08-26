-- Dialogue — Fase 2 backend foundation
-- Storage bucket for audio + a transcriptions table, both locked down with RLS.

-- 1) Private bucket for audio recordings.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  524288000, -- 500 MB ceiling per file
  array['audio/aac','audio/mp4','audio/x-m4a','audio/m4a','audio/mpeg','application/octet-stream']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Transcriptions: one row per recorded conversation.
create table if not exists public.transcriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  audio_path      text,
  status          text not null default 'pending'
                    check (status in ('pending','uploading','processing','done','error')),
  language        text,
  segments        jsonb not null default '[]'::jsonb,
  error           text,
  gladia_id       text,
  duration_ms     integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, conversation_id)
);

alter table public.transcriptions enable row level security;

-- Owners (incl. anonymous users) can read/write only their own rows.
drop policy if exists "transcriptions_select_own" on public.transcriptions;
create policy "transcriptions_select_own" on public.transcriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "transcriptions_insert_own" on public.transcriptions;
create policy "transcriptions_insert_own" on public.transcriptions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "transcriptions_update_own" on public.transcriptions;
create policy "transcriptions_update_own" on public.transcriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transcriptions_delete_own" on public.transcriptions;
create policy "transcriptions_delete_own" on public.transcriptions
  for delete to authenticated using (auth.uid() = user_id);

-- 3) Storage RLS: each user only touches their own folder ({uid}/file).
drop policy if exists "recordings_insert_own" on storage.objects;
create policy "recordings_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recordings_delete_own" on storage.objects;
create policy "recordings_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists transcriptions_touch on public.transcriptions;
create trigger transcriptions_touch
  before update on public.transcriptions
  for each row execute function public.touch_updated_at();

-- 5) Let the app subscribe to live status changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transcriptions'
  ) then
    alter publication supabase_realtime add table public.transcriptions;
  end if;
end $$;
