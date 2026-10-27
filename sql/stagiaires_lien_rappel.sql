-- ============================================================================
-- Stagiaires : notification quand la fiche passe en « lien à envoyer »
-- ============================================================================
-- La fonction rappel-stagiaires-lien (GitHub Actions, chaque jour ouvré) prévient
-- la direction et les référentes de la crèche, une seule fois par fiche, puis
-- pose lien_rappel_le. Créer ou renouveler le lien remet la colonne à nul : une
-- nouvelle échéance préviendra de nouveau. « Ma journée » liste de toute façon
-- ces fiches (section « Stagiaires — liens à envoyer »). À appliquer à la main.
-- ============================================================================
alter table public.stagiaires
  add column if not exists lien_rappel_le timestamptz;
