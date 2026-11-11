-- ============================================================================
-- Entrées à venir — lecture seule pour les référents
-- ============================================================================
-- Demandes › Pilotage › « Entrées à venir » (js/pages/demandes/19-suivi-inscriptions.js),
-- qui remplace l'ancienne vue « Inscriptions en cours » (suivi_inscriptions_referent,
-- laissée en place, plus appelée).
-- Enfants déjà inscrits dont l'accueil n'a pas encore commencé, pour les crèches
-- auxquelles la personne a accès (kk_acces_creche : sa crèche pour un référent,
-- toutes pour la direction). Même règle que le module Inscriptions :
--   - une ligne d'accueil (enfants_contrats) en cours => déjà arrivé, exclu ;
--   - date d'entrée = première ligne d'accueil future, sinon enfants.date_entree
--     si elle est dans le futur ;
--   - dossiers archivés exclus.
-- Champs d'affichage seulement : nom, naissance, crèche, date d'entrée et
-- coordonnées des parents (prénom, nom, téléphone, e-mail, table enfants_parents) ;
-- jamais de montant ni de donnée de santé. Aucune écriture possible.
--
-- Annulation : drop function if exists public.entrees_a_venir_referent();
-- ============================================================================

create or replace function public.entrees_a_venir_referent()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select en.id, en.prenom, en.nom, en.dob, en.creche_id,
      coalesce(
        (select min(l.date_debut::date) from public.enfants_contrats l
          where l.enfant_id = en.id and l.date_debut::date > current_date),
        case when en.date_entree::date > current_date then en.date_entree::date end
      ) as entree
    from public.enfants en
    where en.archive_le is null
      and en.creche_id is not null
      and public.kk_acces_creche(en.creche_id)
      and not exists (
        select 1 from public.enfants_contrats l
        where l.enfant_id = en.id
          and l.date_debut::date <= current_date
          and (l.date_fin is null or l.date_fin::date >= current_date))
  )
  select coalesce(json_agg(json_build_object(
      'id', e.id, 'prenom', e.prenom, 'nom', e.nom, 'dob', e.dob,
      'creche_id', e.creche_id, 'entree', e.entree,
      'parents', coalesce((
        select json_agg(json_build_object(
            'prenom', ep.prenom, 'nom', ep.nom, 'telephone', ep.telephone, 'email', ep.email)
          order by ep.nom, ep.prenom)
        from public.enfants_parents ep where ep.enfant_id = e.id), '[]'::json)) order by e.entree, e.nom), '[]'::json)
  from e
  where e.entree is not null;
$$;

revoke all on function public.entrees_a_venir_referent() from public, anon;
grant execute on function public.entrees_a_venir_referent() to authenticated;
