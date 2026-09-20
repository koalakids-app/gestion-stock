-- ============================================================================
-- Calendrier des jours de fermeture de la crèche
-- ============================================================================
-- Paramètres ne portait jusqu'ici qu'un nombre de semaines de fermeture par
-- an (semaines_fermeture), sans dire lesquelles : impossible d'afficher aux
-- familles ou à l'équipe les dates réelles (vacances, jours fériés propres à
-- la crèche, journées pédagogiques).
--
-- jours_fermeture porte la liste de ces périodes, une par entrée :
--   { "debut": "2026-08-03", "fin": "2026-08-21", "type": "vacances", "label": "Fermeture d'été" }
-- "fin" reprend "debut" pour une fermeture d'un seul jour (jour férié,
-- journée pédagogique). "type" vaut vacances, ferie ou pedagogique.
-- ============================================================================

alter table public.etablissements add column if not exists jours_fermeture jsonb not null default '[]'::jsonb;
