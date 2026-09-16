-- ============================================================================
-- 37e — Suivi de l'enfant : accès famille (jetons)
-- ============================================================================
-- Même modèle que `contrats.token` : un jeton `uuid` imprévisible, généré
-- côté direction/référente sous RLS — jamais par une edge function de sa
-- propre initiative. La famille ouvre `famille-suivi.html?t=<token>`, qui
-- appelle une edge function `suivi-famille` en `service_role` ; aucune
-- policy `anon` n'existe sur `suivi_syntheses`/`suivi_observations`/
-- `suivi_saisies` : la famille ne les lit jamais directement.
--
-- Un jeton par enfant ET par parent `destinataire` (pas un jeton unique
-- partagé) : chaque parent peut être révoqué indépendamment. Le contrôle
-- "ce parent a bien destinataire = true" est une logique inter-tables ; elle
-- sera posée comme trigger dans 37g, avec le reste des vérifications qui
-- interrogent une autre table.
--
-- Un jeton révoqué n'est jamais supprimé (traçabilité) : `actif = false` +
-- `revoque_le`.
-- ============================================================================

create table if not exists public.suivi_acces_famille (
  id           uuid primary key default gen_random_uuid(),
  enfant_id    uuid not null references public.enfants(id) on delete cascade,
  creche_id    uuid not null references public.creches(id),
  parent_id    uuid not null references public.enfants_parents(id) on delete cascade,
  token        uuid not null default gen_random_uuid() unique,
  actif        boolean not null default true,
  revoque_le   timestamptz,
  revoque_par  uuid references public.referents(id),
  cree_par     uuid references public.referents(id),
  created_at   timestamptz not null default now()
);

-- Un seul accès actif à la fois par couple enfant/parent (on révoque puis
-- on en recrée un, on n'en accumule pas plusieurs valides en parallèle).
create unique index if not exists suivi_acces_famille_enfant_parent_actif_uniq
  on public.suivi_acces_famille (enfant_id, parent_id) where actif;

create index if not exists suivi_acces_famille_creche_idx
  on public.suivi_acces_famille (creche_id);

alter table public.suivi_acces_famille enable row level security;

create policy suivi_acces_famille_select on public.suivi_acces_famille
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_acces_famille.creche_id)
    )
  );

create policy suivi_acces_famille_insert on public.suivi_acces_famille
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_acces_famille.creche_id)
    )
  );

-- Révocation (actif=false) uniquement, pas de modification du jeton/parent
-- une fois créé — la contrainte "champs non modifiables" reste applicative,
-- pas imposée par une policy dédiée, comme ailleurs dans le projet.
create policy suivi_acces_famille_update on public.suivi_acces_famille
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_acces_famille.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_acces_famille.creche_id)
    )
  );

-- Pas de policy DELETE : on révoque, on ne supprime jamais un accès émis.

grant select, insert, update on public.suivi_acces_famille to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.suivi_acces_famille) as nb_lignes,
  (select count(*) from pg_policies where schemaname='public' and tablename='suivi_acces_famille') as nb_policies;
