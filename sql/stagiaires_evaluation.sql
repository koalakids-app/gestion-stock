-- ============================================================================
-- Évaluation du stagiaire (grille « Suivi du stagiaire »)
-- ============================================================================
-- Grille remplie par la structure d'accueil pour les stagiaires AEPE, IEPE et
-- stage découverte : comportement général, aptitude professionnelle, acquis,
-- activités effectuées, chacun noté Très bien / Bien / À améliorer + commentaire,
-- puis appréciation générale.
--
-- Stockée en JSON sur la fiche (les critères évoluent sans changer le schéma) :
--   { profil: 'aepe'|'iepe'|'decouverte',
--     notes: { <critere>: { n: 'tb'|'b'|'a', c: 'commentaire' } },
--     appreciation: '...' }
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb).
-- Les politiques RLS existantes de `stagiaires` s'appliquent aux nouvelles colonnes.
-- ============================================================================

alter table public.stagiaires
  add column if not exists evaluation jsonb,
  add column if not exists evaluation_le date;
