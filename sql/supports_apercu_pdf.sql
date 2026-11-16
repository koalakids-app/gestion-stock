-- ============================================================================
-- Supports pédagogiques : aperçu PDF d'un document Word / PowerPoint
-- ============================================================================
-- `apercu_path` = chemin (dans le bucket privé `supports-pedagogiques`) d'une
-- version PDF du document, affichée dans le lecteur intégré avec une mise en page
-- fidèle ; l'original reste téléchargeable (`fichier_path`). Vide = aperçu simplifié
-- (Word) ou téléchargement seul. À appliquer à la main après supports_pedagogiques.sql.
-- ============================================================================
alter table public.supports_pedagogiques add column if not exists apercu_path text;
