-- ============================================================================
-- Rapprochement planning_equipe : nom de secours en cas d'homonymie
-- ============================================================================
-- planning_equipe.prenom est alimenté par l'import Excel et rapproché du
-- prénom de la fiche employes (cf. sql/collaborateurs_comptes.sql). Si deux
-- personnes de la même crèche portent le même prénom (ou un prénom que
-- l'Excel orthographie autrement), le rapprochement automatique se trompe.
--
-- `employes.planning_nom` permet à la direction de préciser, au cas par cas,
-- le nom exact tel qu'il apparaît dans le planning équipe pour cette
-- personne — laissé vide, le prénom de la fiche continue de servir de clé de
-- rapprochement comme avant.
-- ============================================================================

alter table public.employes add column if not exists planning_nom text;

drop policy if exists planning_equipe_select_self on public.planning_equipe;
create policy planning_equipe_select_self on public.planning_equipe
  for select to authenticated
  using (
    exists (
      select 1 from public.employes e
      where e.user_id = auth.uid()
        and e.creche_id = planning_equipe.creche_id
        and lower(trim(coalesce(e.planning_nom, e.prenom))) = lower(trim(planning_equipe.prenom))
    )
  );
