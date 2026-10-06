-- ============================================================================
-- Horaires propres à chaque jour d'un contrat d'accueil (enfants_contrats).
-- heure_debut / heure_fin restent les horaires par défaut ; horaires_jours
-- les remplace pour les jours listés, au format :
--   {"1": {"debut": "08:00", "fin": "17:00"}, "3": {"debut": "09:00", "fin": "12:00"}}
-- (clé = numéro du jour ISO, 1 = lundi). Null = mêmes horaires tous les jours.
-- ============================================================================
alter table public.enfants_contrats
  add column if not exists horaires_jours jsonb;
