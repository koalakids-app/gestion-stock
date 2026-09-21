-- ============================================================================
-- Policies Storage pour le bucket privé `documents-employes`
-- ============================================================================
-- Étape manuelle requise AVANT ce script : créer le bucket dans le dashboard
-- Supabase (Storage → New bucket → name = documents-employes, Public = OFF),
-- avec des policies calquées sur celles du bucket `documents-admin`.
--
-- Convention de chemin : <employe_id>/<timestamp>_<random>.<ext>
-- (voir employes.html, empHandleDocUpload, et l'edge function
-- dossier-pieces-employe) — le premier segment du chemin est l'id de la
-- fiche employé, ce qui permet de retrouver sa crèche.
--
-- Pas de policy `update` : l'appli ne fait jamais de remplacement de fichier
-- en place, seulement upload + suppression.
--
-- Aucune policy `anon` : le dépôt public via pieces-employe.html passe par
-- l'edge function `dossier-pieces-employe`, en service_role, qui contourne
-- RLS — l'accès direct au bucket reste réservé aux comptes référents.
-- ============================================================================

create policy documents_employes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents-employes'
    and exists (
      select 1 from public.referents r
      join public.employes e on e.id::text = (storage.foldername(name))[1]
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
      join public.employes e on e.id::text = (storage.foldername(name))[1]
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
      join public.employes e on e.id::text = (storage.foldername(name))[1]
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
