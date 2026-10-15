-- ============================================================================
-- kk_resultats_par_ref : renvoyer aussi le profil des quiz « sans note »
-- ============================================================================
-- À EXÉCUTER dans le projet Supabase de quiz-protocoles (SQL editor).
--
-- Un quiz en mode « profil » enregistre dans `resultats` score/total/% à 0 et
-- le profil dans `detail` ({mode:'profil', axes:[{code,libelle,niveau,…}], …}).
-- gestion-stock n'en recevait rien : la fiche collaborateur affichait donc
-- « 0/N · 0 % » (ou rien) au lieu du profil. On ajoute deux colonnes :
--   mode : 'profil' ou 'score'
--   axes : [{code, libelle, niveau}] (niveau = appui | construction | accompagner),
--          uniquement pour un profil, sinon null.
-- Seuls code/libelle/niveau sortent : jamais le détail des réponses.
-- Le type de retour change : il faut donc supprimer la fonction avant de la
-- recréer (create or replace ne le permet pas). Les anciens appels
-- (quiz_id, score, pourcentage, passe_le…) continuent de fonctionner.
-- ============================================================================

drop function if exists public.kk_resultats_par_ref(text);

create function public.kk_resultats_par_ref(p_ref text)
returns table(
  id uuid,
  quiz_id uuid,
  quiz_titre text,
  score int,
  total int,
  pourcentage int,
  passe_le timestamptz,
  mode text,
  axes jsonb
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.quiz_id, q.titre, r.score, r.total, r.pourcentage, r.passe_le,
         case when q.mode = 'profil' then 'profil' else 'score' end,
         case when q.mode = 'profil' and jsonb_typeof(r.detail -> 'axes') = 'array'
              then (select coalesce(jsonb_agg(jsonb_build_object(
                             'code', a ->> 'code', 'libelle', a ->> 'libelle', 'niveau', a ->> 'niveau')), '[]'::jsonb)
                    from jsonb_array_elements(r.detail -> 'axes') a)
         end
  from public.resultats r
  join public.quiz q on q.id = r.quiz_id
  where p_ref is not null and p_ref <> '' and r.ref = p_ref
  order by r.passe_le desc;
$$;

revoke all on function public.kk_resultats_par_ref(text) from public;
grant execute on function public.kk_resultats_par_ref(text) to anon, authenticated;
