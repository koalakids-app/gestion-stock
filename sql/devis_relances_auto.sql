-- ============================================================================
-- Relances automatiques de devis
-- ============================================================================
-- La fonction Edge `relances-devis-auto` (déclenchée chaque jour ouvré par
-- .github/workflows/relances-devis-auto.yml) relance les familles qui n'ont pas
-- répondu à leur devis. Réglages par organisation dans reseau_config.config
-- (jsonb, pas de colonne à ajouter) : relances_devis_auto_active,
-- relances_devis_delai_jours, relances_devis_intervalle_jours,
-- relances_devis_max, relances_devis_finale_jours, relances_devis_mode
-- ('validation' par défaut : l'équipe valide chaque relance · 'auto').
--
-- Ici :
--   1. devis.relance_auto_stop : la direction peut exclure UN devis des
--      relances automatiques (famille jointe par téléphone, par exemple).
--   2. devis_relances_log : trace de tout ce que le robot a fait (relance n°N,
--      dernier rappel, alerte à l'équipe, échec d'envoi). Écrite par la
--      fonction Edge (service_role), lue par la direction.
-- À exécuter une fois sur le projet Supabase de l'application.
-- ============================================================================

alter table public.devis
  add column if not exists relance_auto_stop boolean not null default false,
  -- Mode « avec validation » : posé par le robot quand une relance est due,
  -- remis à null quand l'équipe l'envoie (envoyer-devis) ou la reporte.
  add column if not exists relance_a_valider_le timestamptz;

create table if not exists public.devis_relances_log (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis(id) on delete cascade,
  preinscription_id uuid,
  org_id uuid,
  -- relance : relance régulière · finale : dernier rappel avant expiration ·
  -- a_valider : relance proposée à l'équipe (mode avec validation) ·
  -- alerte : l'équipe est prévenue d'appeler la famille · echec : mail refusé
  type text not null check (type in ('relance','finale','a_valider','alerte','echec')),
  numero int,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists devis_relances_log_devis_idx
  on public.devis_relances_log (devis_id, created_at desc);

alter table public.devis_relances_log enable row level security;

-- Lecture seule pour l'application, réservée à la direction de l'organisation. Aucune politique
-- d'écriture : seul le service_role (fonction Edge) insère.
drop policy if exists devis_relances_log_select on public.devis_relances_log;
create policy devis_relances_log_select on public.devis_relances_log
  for select to authenticated
  using (org_id = public.kk_mon_org() and public.kk_est_direction());
