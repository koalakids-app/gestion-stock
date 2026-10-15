-- ============================================================================
-- Formations conseillées d'après le quiz (thème du quiz)
-- ============================================================================
-- À EXÉCUTER dans le projet Supabase de quiz-protocoles (SQL editor).
--
-- Quand un quiz noté est « À revoir » (moins de 80 %), gestion-stock propose à
-- la direction les micro-formations du thème auquel ce quiz est rattaché
-- (theme.quiz_id) : sens inverse de kk_modules_quiz (formation -> quiz).
-- Ne renvoie que les formations publiées, dans l'ordre du thème, avec leur
-- seul titre : aucune réponse ni contenu de quiz.
-- theme.quiz_id est de type text, quiz.id de type uuid : comparaison en texte.
-- ============================================================================

create or replace function public.kk_formations_pour_quiz(p_quiz_ids uuid[])
returns table(quiz_id uuid, module_id uuid, module_titre text, ordre int)
language sql
security definer
set search_path = public
as $$
  select q.id, m.id, m.titre, m.ordre
  from public.quiz q
  join public.theme t on t.quiz_id::text = q.id::text
  join public.module m on m.theme_id = t.id and m.publie = true
  where q.id = any(p_quiz_ids)
  order by q.id, m.ordre;
$$;

revoke all on function public.kk_formations_pour_quiz(uuid[]) from public;
grant execute on function public.kk_formations_pour_quiz(uuid[]) to anon, authenticated;
