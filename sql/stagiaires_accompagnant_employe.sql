-- ============================================================================
-- Accompagnant·e d'un·e stagiaire/alternant·e : n'importe quel·le salarié·e
-- de la structure (table employes), pas seulement un compte referents.
-- `stagiaires.referent_id` reste utilisé quand l'accompagnant·e est un
-- directeur/trice (technique) ou la direction ; `accompagnant_employe_id`
-- porte le choix d'un·e salarié·e. Une seule des deux colonnes est renseignée.
-- ============================================================================
alter table public.stagiaires
  add column if not exists accompagnant_employe_id uuid references public.employes(id) on delete set null;
