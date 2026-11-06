-- ============================================================================
-- Stagiaires : date de la dernière relance « pièces manquantes »
-- ============================================================================
-- Posée par l'edge function relancer-stagiaire (bouton « Relancer » de la fiche),
-- affichée sous le bouton. Facultatif : sans la colonne, l'e-mail part quand
-- même mais la date n'est pas retenue. À appliquer à la main.
-- ============================================================================
alter table public.stagiaires
  add column if not exists relance_le timestamptz;
