-- ============================================================================
-- Recrutement : confirmation du rendez-vous par la candidate
-- ============================================================================
-- Bouton « Confirmer le rendez-vous » sur candidat.html (action `rdv_confirme`
-- de l'edge function dossier-candidat). La date de confirmation s'efface si le
-- rendez-vous est modifié dans la fiche. À appliquer après sql/recrutement.sql.
-- Appliqué sur Supabase le 12 novembre 2026.
-- ============================================================================
alter table public.recrutement_candidats
  add column if not exists rdv_confirme_le timestamptz;
