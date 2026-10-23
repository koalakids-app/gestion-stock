-- À exécuter dans le projet QUIZ (phbcqxjzobzwuzetgbem).
-- Demandes (direction) signale dans la cloche un·e collaborateur·trice qui a
-- réalisé tous les quiz qui lui ont été envoyés (js/pages/demandes/16-parcours-quiz-termine.js).
-- Même principe que kk_envois_par_ref : pas d'accès direct aux tables, les
-- identifiants opaques (`ref` = id de la fiche) sont fournis par l'appelant.
-- Ne renvoie que la ref et deux compteurs : ni nom, ni mail, ni réponse.
-- Seuls les envois de type « quiz » comptent (pas les modules de formation).
create or replace function public.kk_parcours_quiz_termines(p_refs text[])
returns table (ref text, nb_envois int, nb_faits int, dernier_le timestamptz)
language sql stable security definer set search_path = public as $$
  with envois as (
    select distinct e.ref, e.item_id
    from public.envois_quiz e
    where e.kind = 'quiz' and e.etat = 'envoye' and e.ref = any(p_refs)
  ), faits as (
    select en.ref, en.item_id, max(r.passe_le) as passe_le
    from envois en
    join public.resultats r on r.ref = en.ref and r.quiz_id = en.item_id
    group by en.ref, en.item_id
  )
  select en.ref, count(*)::int, count(f.item_id)::int, max(f.passe_le)
  from envois en
  left join faits f on f.ref = en.ref and f.item_id = en.item_id
  group by en.ref
  having count(*) = count(f.item_id);
$$;
revoke all on function public.kk_parcours_quiz_termines(text[]) from public;
grant execute on function public.kk_parcours_quiz_termines(text[]) to anon, authenticated, service_role;

select proname from pg_proc where proname = 'kk_parcours_quiz_termines';
