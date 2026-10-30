-- ============================================================================
-- kk_resultats_sans_ref_par_nom : retrouver les quiz passés par le lien de GROUPE
-- ============================================================================
-- À EXÉCUTER dans le projet Supabase de quiz-protocoles (SQL editor).
--
-- Le lien envoyé à toute l'équipe ne contient pas le `ref` de la fiche : le
-- résultat est enregistré avec ref vide, et kk_resultats_par_ref ne le voit pas
-- (Mon espace : « Fait » absent). Cette fonction renvoie ces résultats SANS ref
-- dont le prénom et le nom saisis correspondent (casse, accents et espaces
-- ignorés). Elle ne sort que quiz/titre/date : jamais le détail ni le profil.
-- Un résultat déjà rattaché à une fiche (ref renseigné) n'est jamais renvoyé ici.
-- ============================================================================

create or replace function public.kk_norm_nom(t text)
returns text language sql immutable as $$
  select regexp_replace(lower(translate(trim(coalesce(t,'')),
    'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ','aaaeeeeiioouuucaaaeeeeiioouuuc')), '\s+', ' ', 'g')
$$;

create or replace function public.kk_resultats_sans_ref_par_nom(p_prenom text, p_nom text)
returns table(id uuid, quiz_id uuid, quiz_titre text, passe_le timestamptz)
language sql
security definer
set search_path = public
as $$
  select r.id, r.quiz_id, q.titre, r.passe_le
  from public.resultats r
  join public.quiz q on q.id = r.quiz_id
  where kk_norm_nom(p_prenom) <> '' and kk_norm_nom(p_nom) <> ''
    and coalesce(r.ref, '') = ''
    and kk_norm_nom(r.prenom) = kk_norm_nom(p_prenom)
    and kk_norm_nom(r.nom) = kk_norm_nom(p_nom)
  order by r.passe_le desc;
$$;

revoke all on function public.kk_resultats_sans_ref_par_nom(text, text) from public;
grant execute on function public.kk_resultats_sans_ref_par_nom(text, text) to anon, authenticated;
