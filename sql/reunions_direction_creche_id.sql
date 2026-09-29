-- ============================================================================
-- Lieu de la réunion de direction : dans quelle crèche elle se tient
-- ============================================================================
-- Ajoute reunions_direction.creche_id (nullable — NULL = siège / non précisé,
-- toutes les réunions n'ayant pas lieu dans une crèche). Exposé dans le mode
-- réunion (demandes.html, module "Suivi des actions de direction") comme un
-- champ "Lieu", et repris dans le compte rendu (js/reunions-direction.js).
-- ============================================================================

alter table public.reunions_direction
  add column if not exists creche_id uuid references public.creches(id) on delete set null;
