-- ============================================================================
-- Supports pédagogiques : groupes de thématiques
-- ============================================================================
-- `groupe` regroupe plusieurs thématiques sous un même intertitre du menu
-- (ex. « Développement du jeune enfant »). Vide = thématique « simple ».
-- À appliquer à la main après supports_pedagogiques.sql. Idempotent.
-- ============================================================================
alter table public.supports_themes add column if not exists groupe text
  check (groupe is null or length(groupe) <= 120);
