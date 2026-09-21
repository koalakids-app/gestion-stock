-- ============================================================================
-- Corbeille personnelle des demandes (messagerie)
-- ============================================================================
-- Jusqu'ici, supprimer une demande dans la messagerie (bouton corbeille, réservé
-- à la direction) effaçait la ligne de `demandes` en base : elle disparaissait
-- pour tout le monde, sans possibilité de récupération.
--
-- On passe donc à une suppression « pour moi » : au lieu d'un DELETE sur
-- `demandes`, on ajoute une ligne ici. La demande reste intacte et visible des
-- autres personnes, mais disparaît de la liste de celle qui l'a supprimée — qui
-- peut la retrouver et la restaurer depuis sa corbeille. Seule la direction
-- garde la possibilité de supprimer une demande définitivement, pour tout le
-- monde, depuis la corbeille.
--
-- Même principe que `consignes_lues` / `*_brouillons` : table à part, une ligne
-- par personne et par demande, RLS scopée à son propre `auth.uid()`.
-- ============================================================================

create table if not exists public.demandes_masquees (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes(id) on delete cascade,
  masque_par uuid not null references auth.users(id) on delete cascade,
  masque_at timestamptz not null default now(),
  constraint demandes_masquees_un_par_personne unique (demande_id, masque_par)
);

create index if not exists demandes_masquees_personne_idx
  on public.demandes_masquees (masque_par, masque_at desc);

alter table public.demandes_masquees enable row level security;

create policy demandes_masquees_select on public.demandes_masquees
  for select to authenticated
  using (
    masque_par = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy demandes_masquees_insert on public.demandes_masquees
  for insert to authenticated
  with check (
    masque_par = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy demandes_masquees_delete on public.demandes_masquees
  for delete to authenticated
  using (masque_par = auth.uid());
