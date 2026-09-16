-- ============================================================================
-- 37a — Suivi de l'enfant : référentiel des repères de développement
-- ============================================================================
-- Table paramétrable, alimentée UNIQUEMENT par import CSV depuis l'écran
-- réservé à la direction (jamais de libellé ni d'INSERT en dur dans le code
-- ou dans les scripts SQL). Un repère déjà utilisé n'est jamais supprimé :
-- on le désactive (actif = false) pour que les observations passées restent
-- lisibles.
--
-- Structure conçue pour accepter l'ajout ultérieur de tranches d'âge sans
-- migration : `tranche` est un texte libre, pas un enum.
-- ============================================================================

create table if not exists public.suivi_jalons (
  id         uuid primary key default gen_random_uuid(),
  domaine    text not null,
  tranche    text not null,
  ordre      int not null default 0,
  libelle    text not null,
  actif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un même repère (domaine + tranche + libellé) ne doit pas exister deux fois :
-- c'est aussi la règle de déduplication utilisée par l'aperçu d'import CSV.
create unique index if not exists suivi_jalons_domaine_tranche_libelle_uniq
  on public.suivi_jalons (domaine, tranche, libelle);

create index if not exists suivi_jalons_domaine_tranche_idx
  on public.suivi_jalons (domaine, tranche) where actif;

alter table public.suivi_jalons enable row level security;

-- Lecture : toute personne authentifiée du réseau (utilisé aussi bien par la
-- tablette de saisie — via une session authentifiée du kiosque connecté, ou
-- filtré côté fonction SECURITY DEFINER pour le kiosque par code — que par
-- les écrans de synthèse). Même portée que les autres tables communes au
-- réseau (ex. `creches`) : pas de restriction par crèche, le référentiel est
-- commun aux 6 micro-crèches.
create policy suivi_jalons_select on public.suivi_jalons
  for select to authenticated
  using (true);

-- Écriture (ajout / modification / désactivation / réordonnancement) :
-- réservée à la direction (referents.creche_id is null), comme les autres
-- écrans de paramétrage réseau.
create policy suivi_jalons_insert on public.suivi_jalons
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.creche_id is null
    )
  );

create policy suivi_jalons_update on public.suivi_jalons
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

-- Pas de policy DELETE : un repère se désactive (actif = false), il ne se
-- supprime jamais une fois qu'il a pu servir.

grant select, insert, update on public.suivi_jalons to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.suivi_jalons) as nb_lignes,
  (select count(*) from pg_policies where schemaname='public' and tablename='suivi_jalons') as nb_policies;
