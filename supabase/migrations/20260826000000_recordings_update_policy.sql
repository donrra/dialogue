-- Fix: "Prøv igen" på transskribering fejlede med
-- "new row violates row-level security policy".
--
-- Appen uploader lydfilen med upsert (overskriv hvis den findes). Første
-- upload er en INSERT og var tilladt - men et nyt forsøg rammer en UPDATE
-- på storage.objects, og der fandtes kun insert/select/delete-politikker.
-- Denne politik lader ejeren overskrive filer i sin egen mappe ({uid}/...).
drop policy if exists "recordings_update_own" on storage.objects;
create policy "recordings_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
