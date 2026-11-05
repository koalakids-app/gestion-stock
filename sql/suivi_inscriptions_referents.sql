-- ============================================================================
-- Suivi des inscriptions et des devis en cours — lecture seule pour les référents
-- ============================================================================
-- Demandes › Pilotage › « Inscriptions en cours » (js/pages/demandes/19-suivi-inscriptions.js).
-- Les référents n'ont pas accès aux tables preinscriptions / devis (module
-- Inscriptions réservé à la direction). Cette fonction SECURITY DEFINER ne
-- renvoie QUE des champs d'affichage, pour les dossiers de leur crèche :
--   - jamais de montant, de lien/jeton de signature, de contact des parents,
--     de donnée de santé, ni de note interne ;
--   - seulement les dossiers en cours (nouvelle, en_contact, devis_envoye, accepte).
-- Aucune écriture possible : c'est une fonction de lecture, sans policy d'UPDATE.
--
-- Réservée aux rôles referent et direction (un compte employe obtient une liste vide).
--
-- Annulation : drop function if exists public.suivi_inscriptions_referent();
-- ============================================================================

create or replace function public.suivi_inscriptions_referent()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select id, prenom, nom, dob, ne_ou_a_naitre, date_entree_souhaitee,
           statut, created_at, creche_id, creches_souhaitees
    from public.preinscriptions
    where statut in ('nouvelle','en_contact','devis_envoye','accepte')
      and exists (select 1 from public.referents r
                  where r.user_id = auth.uid() and r.role in ('referent','direction'))
      and (
        (creche_id is not null and public.kk_acces_creche(creche_id))
        or (creche_id is null and exists (
              select 1 from public.creches c
              where public.kk_acces_creche(c.id)
                and creches_souhaitees::text like '%' || c.id::text || '%'))
      )
  )
  select json_build_object(
    'inscriptions', coalesce((
      select json_agg(row_to_json(p) order by p.date_entree_souhaitee nulls last, p.created_at)
      from p), '[]'::json),
    'devis', coalesce((
      select json_agg(json_build_object(
          'id', d.id, 'numero', d.numero, 'statut', d.statut,
          'envoye_le', d.envoye_le, 'expire_le', d.expire_le,
          'repondu_le', d.repondu_le,
          'preinscription_id', d.preinscription_id,
          'creche_id', p.creche_id, 'creches_souhaitees', p.creches_souhaitees,
          'prenom', p.prenom, 'nom', p.nom)
          order by d.envoye_le desc nulls last)
      from public.devis d
      join p on p.id = d.preinscription_id
      where d.statut in ('brouillon','envoye','accepte')), '[]'::json)
  );
$$;

revoke all on function public.suivi_inscriptions_referent() from public, anon;
grant execute on function public.suivi_inscriptions_referent() to authenticated;
