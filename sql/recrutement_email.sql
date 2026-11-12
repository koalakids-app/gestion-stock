-- ============================================================================
-- Recrutement : civilité et type de candidature (texte de l'e-mail du lien)
-- ============================================================================
-- L'e-mail envoyé par `envoyer-lien-candidat` reprend le message habituel de la
-- direction : « Bonjour Mme <nom>, je fais suite à votre <type de candidature>… ».
-- Deux colonnes de plus sur la fiche. À appliquer après sql/recrutement.sql.
-- Appliqué sur Supabase le 12 novembre 2026.
-- ============================================================================
alter table public.recrutement_candidats
  add column if not exists civilite text not null default 'Mme',
  add column if not exists type_candidature text;

alter table public.recrutement_candidats drop constraint if exists recrutement_candidats_civilite_ck;
alter table public.recrutement_candidats add constraint recrutement_candidats_civilite_ck
  check (civilite in ('Mme', 'M.', ''));
