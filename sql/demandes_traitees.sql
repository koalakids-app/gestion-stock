-- ============================================================================
-- « Traitée pour moi » (messagerie Demandes & consignes)
-- ============================================================================
-- `demandes.status = 'traite'` est une valeur unique, partagée : dès qu'une
-- personne marquait une demande traitée, elle quittait la vue « En cours » de
-- TOUT LE MONDE (collaborateurs de la crèche, direction, autres destinataires).
--
-- On sépare désormais deux choses :
--   * `demandes.status` reste l'état de la demande vu de l'expéditeur (badge
--     « ✅ Traitée », notifications) — inchangé ;
--   * cette table dit, personne par personne, quelles demandes j'ai traitées :
--     c'est elle qui décide si la carte quitte MA liste « En cours ». Les autres
--     la voient toujours tant qu'ils ne l'ont pas traitée eux-mêmes.
--
-- Même principe que `consignes_lues` / `demandes_masquees` : une ligne par
-- personne et par demande, RLS scopée à son propre `auth.uid()`.
-- ============================================================================

create table if not exists public.demandes_traitees (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes(id) on delete cascade,
  traite_par uuid not null references auth.users(id) on delete cascade,
  traite_at timestamptz not null default now(),
  constraint demandes_traitees_une_par_personne unique (demande_id, traite_par)
);

create index if not exists demandes_traitees_personne_idx
  on public.demandes_traitees (traite_par, traite_at desc);

alter table public.demandes_traitees enable row level security;

create policy demandes_traitees_select on public.demandes_traitees
  for select to authenticated
  using (
    traite_par = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy demandes_traitees_insert on public.demandes_traitees
  for insert to authenticated
  with check (
    traite_par = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy demandes_traitees_delete on public.demandes_traitees
  for delete to authenticated
  using (traite_par = auth.uid());

-- Reprise de l'existant : les demandes déjà traitées restent traitées pour
-- chaque personne de l'organisation (elles étaient déjà masquées pour tous).
insert into public.demandes_traitees (demande_id, traite_par, traite_at)
select d.id, r.user_id, coalesce(d.treated_at, now())
from public.demandes d
join public.referents r on r.org_id = d.org_id and r.user_id is not null
where d.status = 'traite'
on conflict (demande_id, traite_par) do nothing;
