-- Liste des enfants (id, prénom, nom) de SA crèche pour les employés.
-- La policy enf_read réserve la lecture de `enfants` aux rôles referent/direction :
-- sur la tablette (session employé) les listes de choix d'enfant (fiche incident
-- de l'Accès terrain, registre de soins) restaient vides. Cette fonction n'expose
-- que le nom, pour les dossiers non archivés de la crèche de l'appelant.
-- À appliquer à la main.
create or replace function public.kk_enfants_noms()
returns table (id uuid, prenom text, nom text, creche_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id, e.prenom, e.nom, e.creche_id
  from public.enfants e
  where e.creche_id = public.kk_ma_creche()
    and e.archive_le is null
    and public.kk_mon_role() in ('employe','referent','direction')
  order by e.prenom;
$$;
revoke all on function public.kk_enfants_noms() from public, anon;
grant execute on function public.kk_enfants_noms() to authenticated;
