-- ============================================================================
-- Recrutement : suppression de la table recrutement_reglages
-- ============================================================================
-- Elle portait les questions d'un premier questionnaire intégré, remplacé par le
-- quiz en ligne (quiz-protocoles). Vide et inutilisée. Appliqué le 12 novembre 2026.
-- ============================================================================
drop table if exists public.recrutement_reglages;
