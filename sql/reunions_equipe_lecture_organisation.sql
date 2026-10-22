-- ============================================================================
-- Réunions d'équipe : les référents lisent les comptes rendus de TOUTES les
-- crèches de leur organisation (lecture seule).
-- ============================================================================
-- La policy reunions_equipe_select limite un référent à sa crèche. Cette policy
-- SELECT s'ajoute en OU ; insert/update/delete restent régis par les policies
-- existantes (crèche du référent uniquement). Jamais d'accès inter-organisations.
-- Les réunions de direction (actions_direction / reunions_direction) ne sont pas
-- concernées.
--
-- Annulation :
--   drop policy if exists reunions_equipe_lecture_organisation on public.reunions_equipe;
-- ============================================================================

drop policy if exists reunions_equipe_lecture_organisation on public.reunions_equipe;
create policy reunions_equipe_lecture_organisation
  on public.reunions_equipe for select to authenticated
  using (
    exists (
      select 1
      from public.referents r
      left join public.creches c0 on c0.id = r.creche_id
      join public.creches c on c.org_id = coalesce(r.org_id, c0.org_id)
      where r.user_id = auth.uid()
        and c.id = reunions_equipe.creche_id
    )
  );
