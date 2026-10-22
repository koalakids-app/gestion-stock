-- ============================================================================
-- Réunions des directeurs techniques (reunions_equipe.type = 'directeurs')
-- ============================================================================
-- Deux familles de comptes rendus dans la même table :
--   - 'equipe' (hebdomadaire de chaque équipe) et 'autre' (famille, PMI…) :
--     rattachés à une crèche, visibles uniquement par le référent de cette
--     crèche et par la direction (inchangé).
--   - 'directeurs' : réunion des directeurs/trices techniques, toutes crèches
--     confondues, visible par tous les référents et par la direction. Pas de
--     crèche (creche_id null).
-- À appliquer à la main sur Supabase (une instruction à la fois si l'éditeur
-- expire).
-- ============================================================================

alter table public.reunions_equipe alter column creche_id drop not null;

alter table public.reunions_equipe drop constraint if exists reunions_equipe_type_check;
alter table public.reunions_equipe
  add constraint reunions_equipe_type_check check (type in ('equipe', 'autre', 'directeurs'));

-- Un compte rendu 'directeurs' n'a pas de crèche ; les autres en ont une.
alter table public.reunions_equipe drop constraint if exists reunions_equipe_creche_selon_type;
alter table public.reunions_equipe
  add constraint reunions_equipe_creche_selon_type
  check ((type = 'directeurs') = (creche_id is null));

-- Lecture : direction = tout ; référent = sa crèche + les réunions des
-- directeurs.
drop policy if exists reunions_equipe_select on public.reunions_equipe;
create policy reunions_equipe_select on public.reunions_equipe
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (
          r.creche_id is null
          or r.creche_id = reunions_equipe.creche_id
          or reunions_equipe.type = 'directeurs'
        )
    )
  );

-- Création : un référent crée pour sa crèche ou une réunion des directeurs.
drop policy if exists reunions_equipe_insert on public.reunions_equipe;
create policy reunions_equipe_insert on public.reunions_equipe
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (
          r.creche_id is null
          or r.creche_id = reunions_equipe.creche_id
          or reunions_equipe.type = 'directeurs'
        )
    )
  );

-- Modification / suppression d'un brouillon par un référent : sa crèche, ou
-- une réunion des directeurs dont il est l'auteur.
drop policy if exists reunions_equipe_update_referent on public.reunions_equipe;
create policy reunions_equipe_update_referent on public.reunions_equipe
  for update to authenticated
  using (
    reunions_equipe.statut = 'brouillon'
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and r.creche_id is not null
        and (
          r.creche_id = reunions_equipe.creche_id
          or (reunions_equipe.type = 'directeurs' and reunions_equipe.auteur_id = r.id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and r.creche_id is not null
        and (
          r.creche_id = reunions_equipe.creche_id
          or (reunions_equipe.type = 'directeurs' and reunions_equipe.auteur_id = r.id)
        )
    )
  );

drop policy if exists reunions_equipe_delete_referent on public.reunions_equipe;
create policy reunions_equipe_delete_referent on public.reunions_equipe
  for delete to authenticated
  using (
    reunions_equipe.statut = 'brouillon'
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and r.creche_id is not null
        and (
          r.creche_id = reunions_equipe.creche_id
          or (reunions_equipe.type = 'directeurs' and reunions_equipe.auteur_id = r.id)
        )
    )
  );

-- Les réunions d'équipe ne sont visibles que par leur crèche (et la direction) :
-- on retire la lecture inter-crèches de reunions_equipe_lecture_organisation.sql.
-- Les réunions des directeurs (sans crèche) restent lisibles par tous les
-- référents via reunions_equipe_select ci-dessus.
drop policy if exists reunions_equipe_lecture_organisation on public.reunions_equipe;
