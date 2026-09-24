-- ============================================================================
-- RLS reunions_equipe
-- ============================================================================
-- Lecture : direction (referents.creche_id is null) = tout ; directeur/trice
-- technique = uniquement les comptes rendus de sa propre crèche. Aucun accès
-- anonyme, aucun accès pour les auxiliaires (elles n'ont pas de ligne dans
-- `referents`).
--
-- Écriture : un directeur/trice technique peut créer et modifier les comptes
-- rendus de sa crèche tant qu'ils sont en 'brouillon' (y compris passer lui
-- même en 'valide' : auto-validation après relecture). Une fois 'valide', le
-- trigger reunions_equipe_verrou empêche toute modification de contenu ; la
-- policy update_referent ci-dessous empêche en plus explicitement un
-- directeur/trice technique de rouvrir un compte rendu validé (using porte
-- sur la ligne AVANT modification). Seule la direction peut rouvrir (repasser
-- statut à 'brouillon'), via update_direction qui n'a pas cette restriction.
-- ============================================================================

alter table public.reunions_equipe enable row level security;

create policy reunions_equipe_select on public.reunions_equipe
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = reunions_equipe.creche_id)
    )
  );

create policy reunions_equipe_insert on public.reunions_equipe
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = reunions_equipe.creche_id)
    )
  );

-- Directeur/trice technique : modification autorisée seulement si le compte
-- rendu est encore un brouillon (empêche la réouverture par ce rôle).
create policy reunions_equipe_update_referent on public.reunions_equipe
  for update to authenticated
  using (
    reunions_equipe.statut = 'brouillon'
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and r.creche_id = reunions_equipe.creche_id
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and r.creche_id = reunions_equipe.creche_id
    )
  );

-- Direction : modification libre, y compris réouverture d'un CR validé.
create policy reunions_equipe_update_direction on public.reunions_equipe
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.creche_id is null
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.creche_id is null
    )
  );

-- Suppression : directeur/trice technique uniquement sur ses propres
-- brouillons (jamais un CR validé) ; direction sans restriction.
create policy reunions_equipe_delete_referent on public.reunions_equipe
  for delete to authenticated
  using (
    reunions_equipe.statut = 'brouillon'
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and r.creche_id = reunions_equipe.creche_id
    )
  );

create policy reunions_equipe_delete_direction on public.reunions_equipe
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.creche_id is null
    )
  );

grant select, insert, update, delete on public.reunions_equipe to authenticated;
