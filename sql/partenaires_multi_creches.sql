-- ============================================================================
-- Annuaire des partenaires : plusieurs crèches par partenaire
-- ============================================================================
-- Un même intervenant extérieur (ex. RSAI) ne travaille parfois qu'avec une
-- partie du réseau : la colonne `creche_id` (une seule crèche ou tout le
-- réseau) est remplacée par `creche_ids`, un tableau de crèches concernées.
-- Tableau vide = tout le réseau (même sémantique que l'ancien NULL).
-- ============================================================================

alter table public.partenaires
  add column if not exists creche_ids uuid[] not null default '{}';

update public.partenaires
  set creche_ids = array[creche_id]
  where creche_id is not null and creche_ids = '{}';

alter table public.partenaires
  drop column if exists creche_id;

create index if not exists partenaires_creche_ids_idx
  on public.partenaires using gin (creche_ids);
