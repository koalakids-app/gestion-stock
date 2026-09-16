-- ============================================================================
-- 37f — Suivi de l'enfant : journal des consultations famille
-- ============================================================================
-- Écrite UNIQUEMENT par l'edge function `suivi-famille` (service_role,
-- bypass RLS) au moment où une famille ouvre une synthèse avec son jeton —
-- jamais par un rôle `anon` ou `authenticated` directement, même pattern que
-- `kiosk_login_attempts`. Lue par l'équipe (date, parent) depuis l'écran
-- synthèse, d'où une policy SELECT pour `authenticated`, scopée par crèche.
-- ============================================================================

create table if not exists public.suivi_consultations (
  id           uuid primary key default gen_random_uuid(),
  acces_id     uuid not null references public.suivi_acces_famille(id) on delete cascade,
  synthese_id  uuid not null references public.suivi_syntheses(id) on delete cascade,
  creche_id    uuid not null references public.creches(id),
  consulte_le  timestamptz not null default now()
);

create index if not exists suivi_consultations_synthese_idx
  on public.suivi_consultations (synthese_id, consulte_le desc);

create index if not exists suivi_consultations_creche_idx
  on public.suivi_consultations (creche_id, consulte_le desc);

alter table public.suivi_consultations enable row level security;

create policy suivi_consultations_select on public.suivi_consultations
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = suivi_consultations.creche_id)
    )
  );

-- Pas de policy INSERT/UPDATE/DELETE : seule l'edge function service_role
-- écrit ici (elle contourne la RLS), aucun rôle applicatif n'y a droit.

grant select on public.suivi_consultations to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.suivi_consultations) as nb_lignes,
  (select count(*) from pg_policies where schemaname='public' and tablename='suivi_consultations') as nb_policies;
