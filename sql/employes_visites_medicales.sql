-- ============================================================================
-- Suivi des visites médicales obligatoires des collaborateurs (Odalia)
-- ============================================================================
-- Médecine du travail : visite d'information et de prévention (VIP) dans les
-- 3 mois suivant l'embauche, puis renouvelée au plus tard tous les 5 ans (3 ans
-- si suivi adapté) ; visites de reprise, à la demande, etc. L'organisme est
-- Odalia (valeur par défaut, modifiable). Une ligne = une visite :
--   date_visite renseignée  -> visite effectuée ;
--   date_visite vide + rdv_le -> rendez-vous pris, pas encore passé.
-- Même portée que la fiche employé : direction = tout, référente = sa crèche.
-- Aucune donnée de santé : seulement l'avis (apte / apte avec aménagements /
-- inapte) et la date, jamais le contenu médical. À appliquer à la main.
-- ============================================================================
create table if not exists public.employes_visites_medicales (
  id           uuid primary key default gen_random_uuid(),
  employe_id   uuid not null references public.employes(id) on delete cascade,
  type         text not null default 'periodique'
               check (type in ('embauche','periodique','reprise','mi_carriere','a_la_demande','autre')),
  organisme    text not null default 'Odalia',
  date_visite  date,
  rdv_le       date,
  prochaine_le date,
  avis         text check (avis in ('apte','apte_amenagements','inapte')),
  observations text,
  created_at   timestamptz not null default now()
);

create index if not exists employes_visites_medicales_employe_idx
  on public.employes_visites_medicales (employe_id, date_visite desc);

alter table public.employes_visites_medicales enable row level security;

create policy visites_medicales_select on public.employes_visites_medicales
  for select to authenticated
  using (exists (
    select 1 from public.referents r
    join public.employes e on e.id = employes_visites_medicales.employe_id
    where r.user_id = auth.uid()
      and (r.creche_id is null or r.creche_id = e.creche_id)));

create policy visites_medicales_insert on public.employes_visites_medicales
  for insert to authenticated
  with check (exists (
    select 1 from public.referents r
    join public.employes e on e.id = employes_visites_medicales.employe_id
    where r.user_id = auth.uid()
      and (r.creche_id is null or r.creche_id = e.creche_id)));

create policy visites_medicales_update on public.employes_visites_medicales
  for update to authenticated
  using (exists (
    select 1 from public.referents r
    join public.employes e on e.id = employes_visites_medicales.employe_id
    where r.user_id = auth.uid()
      and (r.creche_id is null or r.creche_id = e.creche_id)))
  with check (exists (
    select 1 from public.referents r
    join public.employes e on e.id = employes_visites_medicales.employe_id
    where r.user_id = auth.uid()
      and (r.creche_id is null or r.creche_id = e.creche_id)));

create policy visites_medicales_delete on public.employes_visites_medicales
  for delete to authenticated
  using (exists (
    select 1 from public.referents r
    join public.employes e on e.id = employes_visites_medicales.employe_id
    where r.user_id = auth.uid()
      and (r.creche_id is null or r.creche_id = e.creche_id)));
