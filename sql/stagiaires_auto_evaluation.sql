-- ============================================================================
-- Auto-évaluation du stagiaire EJE
-- ============================================================================
-- Le stagiaire note lui-même les compétences visées depuis son lien
-- (stagiaire.html, edge function dossier-stagiaire, action `auto_evaluer`) ;
-- le tuteur peut aussi la saisir ou la corriger dans la fiche.
--
-- Colonne séparée de `evaluation` : l'enregistrement de l'évaluation par le
-- tuteur réécrit tout `evaluation` et pourrait sinon écraser une réponse
-- envoyée entre-temps par le stagiaire.
--   { eje_comp: { <compétence>: 'a'|'b'|'n' }, commentaire: '...', le: 'AAAA-MM-JJ', via: 'lien' }
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb).
-- ============================================================================

alter table public.stagiaires
  add column if not exists auto_evaluation jsonb;
