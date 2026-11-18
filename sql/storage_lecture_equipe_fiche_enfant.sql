-- ============================================================================
-- Accès terrain › Fiches enfants : lecture des documents par l'équipe (employe)
-- ============================================================================
-- kk_acces_dossier() passe par kk_acces_creche_gestion (direction + référent),
-- donc un compte `employe` ne pouvait pas ouvrir les fichiers de `documents-admin`
-- et `carnets` (« Object not found »). On ajoute des policies SELECT SEULEMENT
-- (jamais d'écriture) pour le rôle employe, limitées aux enfants de SA crèche.
-- `sante` (PAI du registre de soins) passait déjà par kk_acces_creche.
-- À appliquer à la main.
-- ============================================================================
create or replace function public.kk_acces_dossier_lecture_equipe(p_id text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.kk_mon_role(), '') = 'employe'
    and exists (select 1 from public.enfants e
                where e.id::text = p_id and public.kk_acces_creche(e.creche_id));
$$;
revoke all on function public.kk_acces_dossier_lecture_equipe(text) from public, anon;
grant execute on function public.kk_acces_dossier_lecture_equipe(text) to authenticated;

drop policy if exists documents_admin_select_equipe on storage.objects;
create policy documents_admin_select_equipe on storage.objects
  for select to authenticated
  using (bucket_id = 'documents-admin'
         and public.kk_acces_dossier_lecture_equipe((storage.foldername(name))[1]));

drop policy if exists carnets_select_equipe on storage.objects;
create policy carnets_select_equipe on storage.objects
  for select to authenticated
  using (bucket_id = 'carnets'
         and public.kk_acces_dossier_lecture_equipe((storage.foldername(name))[1]));
