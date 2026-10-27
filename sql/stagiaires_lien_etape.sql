-- ============================================================================
-- Stagiaires : un seul lien, deux étapes
-- ============================================================================
-- Le lien de la fiche (`token`) a une étape :
--   'entretien' (avant l'acceptation) : le projet pédagogique à lire et le
--                questionnaire à remplir, sans dépôt ni signature ;
--   'documents' (après l'acceptation) : dépôt des pièces en ligne et livret
--                d'accueil à signer.
-- Le bouton « Ouvrir les documents » de la fiche fait passer le MÊME lien à
-- 'documents'. Les liens déjà envoyés restent à 'documents' (valeur par défaut).
-- La fonction dossier-stagiaire filtre selon l'étape. À appliquer à la main sur
-- Supabase, puis redéployer la fonction (--no-verify-jwt).
-- ============================================================================
alter table public.stagiaires
  add column if not exists lien_etape text not null default 'documents';

alter table public.stagiaires drop constraint if exists stagiaires_lien_etape_ck;
alter table public.stagiaires add constraint stagiaires_lien_etape_ck
  check (lien_etape in ('entretien','documents'));
