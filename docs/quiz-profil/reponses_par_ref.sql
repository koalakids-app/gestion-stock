-- ============================================================================
-- kk_reponses_par_ref : réponses question par question d'un quiz « profil »
-- ============================================================================
-- À EXÉCUTER dans le projet Supabase de quiz-protocoles (SQL editor), à la main.
--
-- La fiche collaborateur (employes.html) affiche le profil par axe via
-- kk_resultats_par_ref, qui ne renvoie volontairement pas le détail des
-- réponses. Cette fonction, à part, renvoie les réponses d'UN résultat, à
-- condition de connaître à la fois le `ref` de la personne et l'id du résultat
-- (deux identifiants opaques, non devinables). Pas de listing ouvert.
-- Aucune fonction existante n'est modifiée.
--   reponses : [{ordre, enonce, axe, reponse, lecture}]
--   axes     : [{code, libelle, niveau}]
-- ============================================================================

create or replace function public.kk_reponses_par_ref(p_ref text, p_resultat uuid)
returns table(
  id uuid,
  quiz_titre text,
  passe_le timestamptz,
  axes jsonb,
  reponses jsonb
)
language sql
security definer
set search_path = public
as $$
  select r.id, q.titre, r.passe_le,
         case when jsonb_typeof(r.detail -> 'axes') = 'array' then r.detail -> 'axes' else '[]'::jsonb end,
         case when jsonb_typeof(r.detail -> 'reponses') = 'array'
              then (select coalesce(jsonb_agg(jsonb_build_object(
                             'ordre', a -> 'ordre', 'enonce', a ->> 'enonce', 'axe', a ->> 'axe',
                             'reponse', a ->> 'reponse', 'lecture', a ->> 'lecture')
                           order by coalesce((a ->> 'ordre')::int, 0)), '[]'::jsonb)
                    from jsonb_array_elements(r.detail -> 'reponses') a)
              else '[]'::jsonb end
  from public.resultats r
  join public.quiz q on q.id = r.quiz_id
  where p_ref is not null and p_ref <> '' and p_resultat is not null
    and r.ref = p_ref and r.id = p_resultat and q.mode = 'profil';
$$;

revoke all on function public.kk_reponses_par_ref(text, uuid) from public;
grant execute on function public.kk_reponses_par_ref(text, uuid) to anon, authenticated;
