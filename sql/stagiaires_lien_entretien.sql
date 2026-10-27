-- ============================================================================
-- Stagiaires : deux liens distincts
-- ============================================================================
-- 1. Lien d'ENTRETIEN (avant l'acceptation du stage) : le projet pédagogique à
--    lire et le questionnaire à remplir. Il ne permet ni de déposer de pièce, ni
--    de signer. Jeton propre : `token_entretien`.
-- 2. Lien de DOCUMENTS (après l'acceptation) : téléversement des pièces et
--    livret d'accueil à signer. C'est le jeton existant `token`.
-- La fonction dossier-stagiaire reconnaît le jeton reçu et n'ouvre que ce qui
-- correspond à son lien. À appliquer à la main sur Supabase, puis redéployer
-- la fonction (--no-verify-jwt).
-- ============================================================================
alter table public.stagiaires
  add column if not exists token_entretien text,
  add column if not exists token_entretien_expire_le timestamptz,
  add column if not exists lien_entretien_envoye_le timestamptz;

create unique index if not exists stagiaires_token_entretien_key
  on public.stagiaires(token_entretien) where token_entretien is not null;
