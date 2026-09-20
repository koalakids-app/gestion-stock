-- ============================================================================
-- Correction d'un départ oublié (module Présences)
-- ============================================================================
-- La direction ou la référente peut ajouter l'heure de départ d'un enfant dont
-- le départ n'a pas été pointé. Le pointage ajouté est marqué source =
-- 'correction' (qui l'a fait : effectue_par ; quand : created_at) pour le
-- distinguer d'un vrai pointage tablette ou kiosque.
-- ============================================================================

alter table public.pointages drop constraint if exists pointages_source_check;
alter table public.pointages
  add constraint pointages_source_check
  check (source in ('kiosque_connecte', 'kiosque_code', 'correction'));
