-- ============================================================================
-- Visite de préinscription → calendrier des événements
-- ============================================================================
-- inscriptions.html reporte la date de visite d'une demande dans `evenements`
-- (type « visite »). evenements.preinscription_id relie l'événement à sa
-- demande : une visite déplacée met à jour le même événement, une visite
-- retirée ou une demande supprimée l'efface (on delete cascade).
-- Un seul événement par demande (index unique partiel).
--
-- Appliqué en prod via Supabase MCP (migration evenements_preinscription_id),
-- documenté ici pour traçabilité.
-- ============================================================================
alter table public.evenements
  add column if not exists preinscription_id uuid references public.preinscriptions(id) on delete cascade;
create unique index if not exists evenements_preinscription_id_key
  on public.evenements(preinscription_id) where preinscription_id is not null;
