-- ============================================================================
-- Organigramme : motif de l'absence (arrêt, mutation, congé)
-- ============================================================================
-- `absence_motif` précise pourquoi une carte est grisée (`en_arret`) : 'arret' (par défaut), 'mutation' (mutée dans
-- une autre crèche, ex. pour remplacer quelqu'un) ou 'conge'. Libellé du badge : EN ARRÊT / MUTÉ·E / EN CONGÉ.
-- Dans tous les cas la carte reste hors des totaux de la crèche. À appliquer après sql/organigramme_remplacement.sql. Idempotent.
-- Annulation : alter table public.organigramme_cartes drop column absence_motif;
-- ============================================================================
alter table public.organigramme_cartes
  add column if not exists absence_motif text check (absence_motif is null or absence_motif in ('arret','mutation','conge'));
