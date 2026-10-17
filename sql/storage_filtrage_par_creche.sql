-- ============================================================================
-- Coffre-fort, étape 2 : lecture des documents sensibles limitée à la crèche
-- ============================================================================
-- Avant : tout·e référent·e (n'importe quelle crèche) pouvait lire, écrire et
-- supprimer les fichiers des buckets `documents-admin`, `carnets`,
-- `stagiaires` (policies *_referents : « exists referents où user_id = moi »)
-- et lire ceux de `sante`. Seul `documents-employes` filtrait par crèche.
--
-- Après : la direction garde tout ; un·e référent·e n'accède qu'aux fiches de
-- sa crèche, via kk_acces_creche() (qui gère aussi le cloisonnement par
-- organisation). Le chemin des fichiers porte l'identifiant de la fiche :
--   documents-admin, carnets : <enfant_id>/…
--   stagiaires               : <stagiaire_id>/…
--   sante                    : pai/<pai_id>_…  (lien via pai.piece_jointe)
--
-- Vérifié avant écriture (lecture seule, 404 fichiers) : aucune fiche sans
-- crèche ; 1 fichier orphelin (sans fiche) dans carnets, documents-admin et
-- stagiaires, qui ne sera plus lisible que par la direction.
--
-- Les dépôts publics (familles, stagiaires) passent par des edge functions en
-- service role : non concernés. Pour `sante`, seule la LECTURE est resserrée :
-- le téléversement d'une pièce PAI précède l'écriture de la fiche (le chemin
-- ne contient pas encore de crèche), il reste donc ouvert aux rôles actuels.
--
-- À appliquer à la main dans le SQL Editor, puis tester (voir fin de fichier).
-- ============================================================================

create or replace function public.kk_acces_dossier(p_type text, p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.kk_est_direction()
    or case p_type
         when 'enfant' then exists (
           select 1 from public.enfants e
           where e.id::text = p_id and public.kk_acces_creche(e.creche_id))
         when 'stagiaire' then exists (
           select 1 from public.stagiaires s
           where s.id::text = p_id
             -- stagiaires.creche_id est de type text (pas uuid) : cast protégé
             and s.creche_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and public.kk_acces_creche(s.creche_id::uuid))
         else false
       end;
$$;

-- ---- documents-admin et carnets : dossier = <enfant_id>/ --------------------
drop policy if exists documents_admin_select_referents on storage.objects;
drop policy if exists documents_admin_insert_referents on storage.objects;
drop policy if exists documents_admin_delete_referents on storage.objects;
drop policy if exists carnets_select_referents on storage.objects;
drop policy if exists carnets_insert_referents on storage.objects;
drop policy if exists carnets_delete_referents on storage.objects;

create policy documents_admin_select_creche on storage.objects
  for select to authenticated
  using (bucket_id = 'documents-admin'
         and public.kk_acces_dossier('enfant', (storage.foldername(storage.objects.name))[1]));
create policy documents_admin_insert_creche on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents-admin'
         and public.kk_acces_dossier('enfant', (storage.foldername(storage.objects.name))[1]));
create policy documents_admin_delete_creche on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents-admin'
         and public.kk_acces_dossier('enfant', (storage.foldername(storage.objects.name))[1]));

create policy carnets_select_creche on storage.objects
  for select to authenticated
  using (bucket_id = 'carnets'
         and public.kk_acces_dossier('enfant', (storage.foldername(storage.objects.name))[1]));
create policy carnets_insert_creche on storage.objects
  for insert to authenticated
  with check (bucket_id = 'carnets'
         and public.kk_acces_dossier('enfant', (storage.foldername(storage.objects.name))[1]));
create policy carnets_delete_creche on storage.objects
  for delete to authenticated
  using (bucket_id = 'carnets'
         and public.kk_acces_dossier('enfant', (storage.foldername(storage.objects.name))[1]));

-- ---- stagiaires : dossier = <stagiaire_id>/ ---------------------------------
drop policy if exists stagiaires_select_referents on storage.objects;
drop policy if exists stagiaires_insert_referents on storage.objects;
drop policy if exists stagiaires_delete_referents on storage.objects;

create policy stagiaires_select_creche on storage.objects
  for select to authenticated
  using (bucket_id = 'stagiaires'
         and public.kk_acces_dossier('stagiaire', (storage.foldername(storage.objects.name))[1]));
create policy stagiaires_insert_creche on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stagiaires'
         and public.kk_acces_dossier('stagiaire', (storage.foldername(storage.objects.name))[1]));
create policy stagiaires_delete_creche on storage.objects
  for delete to authenticated
  using (bucket_id = 'stagiaires'
         and public.kk_acces_dossier('stagiaire', (storage.foldername(storage.objects.name))[1]));

-- ---- sante : lecture via la fiche PAI qui référence le fichier ---------------
create or replace function public.kk_acces_fichier_pai(p_chemin text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.kk_est_direction()
    or exists (
      select 1 from public.pai p
      where p.piece_jointe = p_chemin and public.kk_acces_creche(p.creche_id));
$$;

drop policy if exists sante_select on storage.objects;
create policy sante_select on storage.objects
  for select to authenticated
  using (bucket_id = 'sante'
         and public.kk_acces_fichier_pai(storage.objects.name));

-- ============================================================================
-- À TESTER APRÈS APPLICATION
-- 1. Direction : ouvrir un document administratif, un carnet, une pièce de
--    stagiaire et un PAI de chaque crèche → tout s'ouvre.
-- 2. Référent·e d'une crèche : ouvrir ceux de SA crèche → s'ouvre ;
--    en importer un nouveau → fonctionne.
-- 3. Même référent·e : un enfant d'une autre crèche n'est pas visible dans sa
--    liste (règles de tables) ; ses fichiers ne s'ouvrent pas non plus.
-- 4. Dépôt d'une pièce par une famille et par un stagiaire (liens publics).
--
-- RETOUR ARRIÈRE (si un cas légitime est bloqué) : recréer les anciennes
-- policies, par exemple pour documents-admin :
--   create policy documents_admin_select_referents on storage.objects
--     for select to authenticated using (bucket_id = 'documents-admin'
--       and exists (select 1 from referents r where r.user_id = auth.uid()));
-- (idem insert/delete, carnets, stagiaires ; sante_select : rôles direction
--  et referent), puis supprimer les policies *_creche.
-- ============================================================================
