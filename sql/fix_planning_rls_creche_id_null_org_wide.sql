-- Même régression que documents_koala/evenements/frais_annexes/documents_reponses
-- (migration fix_regression_creche_id_null_org_wide_donnees du 26/09) : la table
-- planning n'avait pas été corrigée. kk_acces_creche(cible) renvoie toujours faux
-- quand cible (le creche_id du référent visé) est NULL, ce qui est le cas du
-- coordinateur (compte direction sans crèche fixe, ex. COORD_REF_ID dans
-- demandes.html). Son planning devenait invisible pour tout le monde sauf
-- lui-même (directeurs/trices techniques ET autres comptes direction/admin).
-- On ajoute la branche "creche_id du référent visé est NULL => accès org-wide",
-- sur le même modèle que les tables déjà corrigées.

drop policy if exists planning_select on public.planning;
create policy planning_select on public.planning
  for select using (
    referent_id = (select r.id from public.referents r where r.user_id = auth.uid())
    or exists (
      select 1 from public.referents r2 where r2.id = planning.referent_id
      and (
        (r2.creche_id is not null and public.kk_acces_creche(r2.creche_id))
        or (r2.creche_id is null and r2.org_id = public.kk_mon_org())
      )
    )
  );

drop policy if exists planning_insert on public.planning;
create policy planning_insert on public.planning
  for insert with check (
    referent_id = (select r.id from public.referents r where r.user_id = auth.uid())
    or exists (
      select 1 from public.referents r2 where r2.id = planning.referent_id
      and (
        (r2.creche_id is not null and public.kk_acces_creche(r2.creche_id))
        or (r2.creche_id is null and r2.org_id = public.kk_mon_org())
      )
    )
  );

drop policy if exists planning_update on public.planning;
create policy planning_update on public.planning
  for update using (
    referent_id = (select r.id from public.referents r where r.user_id = auth.uid())
    or exists (
      select 1 from public.referents r2 where r2.id = planning.referent_id
      and (
        (r2.creche_id is not null and public.kk_acces_creche(r2.creche_id))
        or (r2.creche_id is null and r2.org_id = public.kk_mon_org())
      )
    )
  );

drop policy if exists planning_delete on public.planning;
create policy planning_delete on public.planning
  for delete using (
    referent_id = (select r.id from public.referents r where r.user_id = auth.uid())
    or exists (
      select 1 from public.referents r2 where r2.id = planning.referent_id
      and (
        (r2.creche_id is not null and public.kk_acces_creche(r2.creche_id))
        or (r2.creche_id is null and r2.org_id = public.kk_mon_org())
      )
    )
  );
