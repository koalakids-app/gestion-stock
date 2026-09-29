-- ============================================================================
-- Lieu de la PROCHAINE réunion de direction (distinct de creche_id, qui est
-- le lieu de la réunion en cours)
-- ============================================================================
-- NULL = siège / non précisé. Repris dans l'événement calendrier "Réunion de
-- coordination" auto-synchronisé par adSyncEvenementProchaine
-- (js/reunions-direction.js) : creche_id et le libellé "lieu" de l'événement
-- suivent désormais le lieu choisi ici, pas seulement la date.
-- ============================================================================

alter table public.reunions_direction
  add column if not exists prochaine_reunion_creche_id uuid references public.creches(id) on delete set null;
