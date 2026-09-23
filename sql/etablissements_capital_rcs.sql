-- ============================================================================
-- Fiche d'identité juridique — capital social et RCS
-- ============================================================================
-- Nécessaires à l'en-tête « Entre les soussignés » du contrat de travail
-- (documents.html, modèle contrat_travail), sur le même principe que les
-- champs raison_sociale/siret/etc. déjà posés ici : saisis une fois dans
-- Paramètres, réutilisés dans tous les documents sortants.
-- ============================================================================

alter table public.etablissements add column if not exists capital_social text;
alter table public.etablissements add column if not exists rcs_ville text;
