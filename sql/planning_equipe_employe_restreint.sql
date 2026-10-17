-- ============================================================================
-- planning_equipe : un(e) employé(e) ne voit que ses propres lignes
-- ============================================================================
-- Problème : planning_equipe_select (et planning_equipe_write) s'appuyaient sur
-- kk_acces_creche(creche_id), vrai pour toute ligne `referents` de la crèche,
-- y compris role = 'employe'. Les politiques RLS s'additionnent : la règle
-- large l'emportait sur planning_equipe_select_self, et « Mon planning »
-- (collaborateur.html) affichait donc le planning de toute l'équipe, en
-- lecture comme en écriture.
--
-- Correctif : lecture/écriture larges réservées aux rôles direction et
-- referent ; un(e) employé(e) passe uniquement par planning_equipe_select_self
-- (rapprochement par prénom ou employes.planning_nom, cf.
-- sql/collaborateurs_planning_nom.sql), qui reste inchangée.
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb).
-- ============================================================================

create or replace function public.kk_acces_creche_gestion(cible uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.referents r
    where r.user_id = auth.uid()
      and r.role in ('direction', 'referent')
      and (
        r.creche_id = cible
        or (r.creche_id is null and cible is not null and exists (
          select 1 from public.creches c where c.id = cible and c.org_id = r.org_id
        ))
      )
  );
$$;

drop policy if exists planning_equipe_select on public.planning_equipe;
create policy planning_equipe_select on public.planning_equipe
  for select
  using (public.kk_acces_creche_gestion(creche_id));

drop policy if exists planning_equipe_write on public.planning_equipe;
create policy planning_equipe_write on public.planning_equipe
  for all
  using (public.kk_acces_creche_gestion(creche_id))
  with check (public.kk_acces_creche_gestion(creche_id));
