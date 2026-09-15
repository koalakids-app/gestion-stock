-- ============================================================================
-- PAI (Projet d'Accueil Individualisé) — fiche enfant, dossier santé
-- ============================================================================
-- Documents liés au PAI d'un enfant (allergies, protocole d'urgence, ordonnances
-- associées, etc.) : donnée de santé, au même titre que le carnet de
-- vaccination (`vaccins_pj`). Même bucket Storage PRIVÉ `carnets` — déjà créé
-- et déjà doté de policies pour les données de santé enfant, pas de nouvelle
-- étape manuelle requise. Aucune URL publique enregistrée : seuls le bucket et
-- le chemin de l'objet sont gardés en base, une URL signée est générée à
-- chaque ouverture.
-- ============================================================================

create table if not exists public.enfants_pai (
  id         uuid primary key default gen_random_uuid(),
  enfant_id  uuid not null references public.enfants(id) on delete cascade,
  bucket     text not null,
  path       text not null,
  filename   text,
  created_at timestamptz not null default now()
);

create index if not exists enfants_pai_enfant_id_idx
  on public.enfants_pai (enfant_id);

alter table public.enfants_pai enable row level security;

-- Même portée que les autres tables liées à un enfant : direction = tout,
-- référente = sa crèche uniquement, jamais d'accès anonyme.
create policy enfants_pai_select on public.enfants_pai
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_pai.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy enfants_pai_insert on public.enfants_pai
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_pai.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy enfants_pai_delete on public.enfants_pai
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_pai.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
