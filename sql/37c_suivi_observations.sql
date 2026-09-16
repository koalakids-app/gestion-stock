-- ============================================================================
-- 37c — Suivi de l'enfant : observations de développement (jalons + notes)
-- ============================================================================
-- Une ligne = soit un jalon du référentiel pointé "observé" ou "en
-- émergence" (jamais "non acquis" : rien n'est affiché tant que ce n'est pas
-- coché), soit une note libre (dictée vocale ou texte), soit les deux à la
-- fois (un jalon commenté).
--
-- `partage` distingue ce qui reste interne à l'équipe de ce qui pourra un
-- jour apparaître dans une synthèse famille — cette table ne décide PAS de
-- la publication elle-même (ça, c'est `suivi_syntheses` + la règle de
-- pointage de départ), elle ne fait que marquer l'intention au moment de la
-- saisie. `posture` (port d'attache / phare / boussole) est facultative.
--
-- Même schéma de traçabilité et de gel que `suivi_saisies` (37b).
-- ============================================================================

create table if not exists public.suivi_observations (
  id                  uuid primary key default gen_random_uuid(),
  enfant_id           uuid not null references public.enfants(id) on delete cascade,
  creche_id           uuid not null references public.creches(id),
  jalon_id            uuid references public.suivi_jalons(id),
  statut              text check (statut in ('observe', 'emergence')),
  note                text,
  posture             text check (posture in ('port_attache', 'phare', 'boussole')),
  partage             text not null default 'interne' check (partage in ('interne', 'famille')),
  horodatage          timestamptz not null default now(),
  auteur_referent_id  uuid references public.referents(id),
  source              text not null default 'kiosque_connecte'
                        check (source in ('kiosque_connecte', 'kiosque_code', 'ordinateur')),
  locked_at           timestamptz,
  created_at          timestamptz not null default now(),

  -- Un jalon pointé doit porter un statut ; une ligne sans jalon est
  -- forcément une note libre.
  constraint suivi_observations_jalon_statut_coherent
    check (jalon_id is null or statut is not null),
  -- Une ligne ne peut pas être vide : jalon et/ou note.
  constraint suivi_observations_contenu_non_vide
    check (jalon_id is not null or coalesce(note, '') <> '')
);

create index if not exists suivi_observations_enfant_horodatage_idx
  on public.suivi_observations (enfant_id, horodatage desc);

create index if not exists suivi_observations_creche_horodatage_idx
  on public.suivi_observations (creche_id, horodatage desc);

create index if not exists suivi_observations_jalon_idx
  on public.suivi_observations (jalon_id) where jalon_id is not null;

create index if not exists suivi_observations_a_verrouiller_idx
  on public.suivi_observations (horodatage) where locked_at is null;

alter table public.suivi_observations enable row level security;

create policy suivi_observations_select on public.suivi_observations
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_observations.creche_id)
    )
  );

create policy suivi_observations_insert on public.suivi_observations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_observations.creche_id)
    )
  );

create policy suivi_observations_update on public.suivi_observations
  for update to authenticated
  using (
    locked_at is null
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_observations.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_observations.creche_id)
    )
  );

create policy suivi_observations_delete on public.suivi_observations
  for delete to authenticated
  using (
    locked_at is null
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.creche_id is null
    )
  );

grant select, insert, update, delete on public.suivi_observations to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.suivi_observations) as nb_lignes,
  (select count(*) from pg_policies where schemaname='public' and tablename='suivi_observations') as nb_policies;
