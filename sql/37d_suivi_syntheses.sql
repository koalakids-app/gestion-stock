-- ============================================================================
-- 37d — Suivi de l'enfant : synthèses (jour / semaine / mois / année)
-- ============================================================================
-- `contenu` est généré automatiquement (jsonb structuré : tendances repas/
-- sommeil, évolution par domaine en langage positif, faits marquants...),
-- jamais saisi à la main depuis zéro — la référente/direction relit et
-- valide, elle ne rédige pas de zéro.
--
-- Cycle de statut :
--   - jour / semaine        : aucune validation requise (§5 du cahier des
--                              charges) → passent directement de 'brouillon'
--                              à 'publiee' au moment du départ pointé.
--   - mois                  : 'brouillon' → 'validee' (référente) → 'publiee'
--                              au départ pointé du dernier jour de la période.
--   - annee                 : 'brouillon' → 'validee' (référente ET
--                              direction) → 'publiee' au départ pointé.
--
-- La règle bloquante « pas de publication sans pointages.action='depart' ce
-- jour-là » n'est PAS un simple check ici (elle interroge une autre table) :
-- elle sera posée comme trigger BEFORE UPDATE dans le script 37g, avant les
-- fonctions kiosque. Les contraintes ci-dessous ne garantissent que la
-- cohérence interne (pas de publication sans validation requise, pas de
-- statut 'publiee' sans date de publication).
-- ============================================================================

create table if not exists public.suivi_syntheses (
  id                    uuid primary key default gen_random_uuid(),
  enfant_id             uuid not null references public.enfants(id) on delete cascade,
  creche_id             uuid not null references public.creches(id),
  periode_type          text not null check (periode_type in ('jour', 'semaine', 'mois', 'annee')),
  periode_debut         date not null,
  periode_fin           date not null,
  contenu               jsonb not null default '{}'::jsonb,
  statut                text not null default 'brouillon' check (statut in ('brouillon', 'validee', 'publiee')),
  valide_referente_id   uuid references public.referents(id),
  valide_referente_le   timestamptz,
  valide_direction_id   uuid references public.referents(id),
  valide_direction_le   timestamptz,
  publiee_le            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint suivi_syntheses_periode_coherente check (periode_fin >= periode_debut),
  constraint suivi_syntheses_publiee_datee check (statut <> 'publiee' or publiee_le is not null),
  -- Mois et année ne peuvent pas être 'validee'/'publiee' sans validation référente.
  constraint suivi_syntheses_validation_referente check (
    periode_type in ('jour', 'semaine')
    or statut = 'brouillon'
    or valide_referente_le is not null
  ),
  -- Année ne peut pas être 'validee'/'publiee' sans validation direction en plus.
  constraint suivi_syntheses_validation_direction check (
    periode_type <> 'annee'
    or statut = 'brouillon'
    or valide_direction_le is not null
  )
);

-- Une seule synthèse par enfant / type de période / période.
create unique index if not exists suivi_syntheses_enfant_periode_uniq
  on public.suivi_syntheses (enfant_id, periode_type, periode_debut);

create index if not exists suivi_syntheses_creche_idx
  on public.suivi_syntheses (creche_id, periode_type, periode_debut desc);

create index if not exists suivi_syntheses_a_publier_idx
  on public.suivi_syntheses (periode_fin) where statut <> 'publiee';

alter table public.suivi_syntheses enable row level security;

create policy suivi_syntheses_select on public.suivi_syntheses
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_syntheses.creche_id)
    )
  );

create policy suivi_syntheses_insert on public.suivi_syntheses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_syntheses.creche_id)
    )
  );

create policy suivi_syntheses_update on public.suivi_syntheses
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_syntheses.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_syntheses.creche_id)
    )
  );

-- Pas de policy DELETE : une synthèse déjà publiée ne se supprime pas
-- (traçabilité vis-à-vis de la famille) ; à regénérer en brouillon si besoin.

grant select, insert, update on public.suivi_syntheses to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.suivi_syntheses) as nb_lignes,
  (select count(*) from pg_policies where schemaname='public' and tablename='suivi_syntheses') as nb_policies;
