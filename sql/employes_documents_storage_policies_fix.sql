-- ============================================================================
-- Correctif des policies Storage du bucket `documents-employes`
-- ============================================================================
-- Bug dans sql/employes_documents_storage_policies.sql : à l'intérieur du
-- EXISTS (SELECT ... FROM referents r JOIN employes e ...), la colonne `name`
-- utilisée dans `storage.foldername(name)` était résolue par Postgres vers
-- `referents.name` (le nom du/de la référent·e — cette colonne existe aussi
-- dans la sous-requête) au lieu du nom de fichier de `storage.objects`,
-- shadowing silencieux confirmé par `select ... from pg_policies` :
--   storage.foldername(r.name)   -- faux : nom du/de la référent·e
-- au lieu de :
--   storage.foldername(objects.name)  -- attendu : chemin du fichier
--
-- Ce script supprime puis recrée les 3 policies avec la colonne pleinement
-- qualifiée (storage.objects.name), qui ne peut plus être capturée par la
-- sous-requête.
-- ============================================================================

drop policy if exists documents_employes_select on storage.objects;
drop policy if exists documents_employes_insert on storage.objects;
drop policy if exists documents_employes_delete on storage.objects;

create policy documents_employes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents-employes'
    and exists (
      select 1 from public.referents r
      join public.employes e on e.id::text = (storage.foldername(storage.objects.name))[1]
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy documents_employes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents-employes'
    and exists (
      select 1 from public.referents r
      join public.employes e on e.id::text = (storage.foldername(storage.objects.name))[1]
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy documents_employes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents-employes'
    and exists (
      select 1 from public.referents r
      join public.employes e on e.id::text = (storage.foldername(storage.objects.name))[1]
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
