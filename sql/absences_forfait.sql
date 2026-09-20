-- ============================================================================
-- Absences déclarées des enfants (justifiées ou non) — sert au forfait
-- « journée non pointée » du module Présences.
-- ============================================================================
-- Règle : un jour de contrat sans pointage d'arrivée, ou avec une arrivée sans
-- départ, est facturé au forfait journée (config `forfait_non_pointe` dans
-- tarifs_repas_config, montant unique pour toutes les crèches).
-- Exception : une absence JUSTIFIÉE déclarée ici n'est plus facturée à partir
-- du 4e jour calendaire (délai de carence de 3 jours : les 3 premiers restent dus).
-- ============================================================================

create table if not exists public.enfants_absences (
  id uuid primary key default gen_random_uuid(),
  enfant_id uuid not null references public.enfants(id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  justifiee boolean not null default true,
  motif text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint enfants_absences_dates_check check (date_fin >= date_debut)
);

create index if not exists enfants_absences_enfant_idx
  on public.enfants_absences (enfant_id, date_debut);

alter table public.enfants_absences enable row level security;

-- Même portée que les autres tables liées à un enfant : direction = tout,
-- référente = sa crèche uniquement.
create policy enfants_absences_select on public.enfants_absences
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_absences.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy enfants_absences_insert on public.enfants_absences
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_absences.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy enfants_absences_update on public.enfants_absences
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_absences.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_absences.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy enfants_absences_delete on public.enfants_absences
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_absences.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
