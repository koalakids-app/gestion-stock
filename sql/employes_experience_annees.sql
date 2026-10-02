-- ============================================================================
-- Années d'expérience petite enfance d'un(e) collaborateur/trice
-- ============================================================================
-- Sert au Gantt des présences (demandes.html) : une professionnelle EJE,
-- psychomotricienne ou auxiliaire de puériculture avec au moins 3 ans
-- d'expérience peut être seule avec 3 enfants maximum le matin et le soir.
-- À exécuter dans l'éditeur SQL de Supabase. Sans effet sur les données
-- existantes : la colonne reste vide tant qu'elle n'est pas renseignée.
-- ============================================================================

alter table public.employes add column if not exists experience_annees numeric;
