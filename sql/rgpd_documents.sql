-- ============================================================================
-- Registre RGPD : stockage privé réservé à la direction
-- ============================================================================
-- Le registre des traitements décrit les mesures de sécurité de l'application :
-- il ne doit PAS être servi par GitHub Pages (tout le dépôt est publié). Le
-- fichier vit dans le bucket privé `rgpd` (chemin fixe `registre-rgpd.docx`),
-- lu et remplacé uniquement par la direction (Paramètres › Les établissements ›
-- « Documents RGPD », js/pages/parametres-rgpd.js). Chaque ouverture est
-- inscrite dans `acces_documents` (sql/acces_documents.sql).
-- À appliquer à la main sur Supabase, une partie à la fois. Idempotent.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rgpd', 'rgpd', false, 8388608,
        array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rgpd_select_direction on storage.objects;
drop policy if exists rgpd_insert_direction on storage.objects;
drop policy if exists rgpd_update_direction on storage.objects;
drop policy if exists rgpd_delete_direction on storage.objects;

create policy rgpd_select_direction on storage.objects
  for select to authenticated
  using (bucket_id = 'rgpd' and public.kk_est_direction());

create policy rgpd_insert_direction on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rgpd' and public.kk_est_direction());

create policy rgpd_update_direction on storage.objects
  for update to authenticated
  using (bucket_id = 'rgpd' and public.kk_est_direction())
  with check (bucket_id = 'rgpd' and public.kk_est_direction());

create policy rgpd_delete_direction on storage.objects
  for delete to authenticated
  using (bucket_id = 'rgpd' and public.kk_est_direction());
