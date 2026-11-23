-- ============================================================================
-- Récapitulatif mensuel de la consommation de couches (stock.html › Couches)
-- ============================================================================
-- Source : couches_jour (une ligne par enfant et par jour, saisie « Couches du
-- jour »). Renvoie le total par enfant et par mois sur les p_mois derniers mois
-- (mois en cours compris). Droits : direction (referents.creche_id null) = toutes
-- les crèches, référent·e = sa crèche (même règle que kk_couches_ordi_autorise).
-- `creche` = nom court, comme stock_couches. Type et taille = ceux de la fiche
-- enfant aujourd'hui. À appliquer à la main.
-- ============================================================================
create or replace function public.kk_couches_recap_mensuel(p_mois integer default 12)
returns table(creche text, mois date, enfant_id uuid, prenom text, nom text,
              type_couche text, taille text, nb integer, jours integer)
language sql stable security definer set search_path = public
as $$
  select public.kk_stock_couches_nom_court(c.name),
         date_trunc('month', cj.jour)::date,
         e.id, e.prenom, e.nom,
         coalesce(e.type_couche,'couche'), e.taille_couche,
         sum(cj.nb)::integer,
         count(*) filter (where cj.nb > 0)::integer
  from public.couches_jour cj
  join public.enfants e on e.id = cj.enfant_id
  join public.creches c on c.id = e.creche_id
  where cj.jour >= (date_trunc('month', current_date) - make_interval(months => greatest(least(coalesce(p_mois,12),36),1) - 1))::date
    and public.kk_couches_ordi_autorise(e.creche_id)
  group by 1, 2, e.id, e.prenom, e.nom, 3, e.taille_couche;
$$;
revoke all on function public.kk_couches_recap_mensuel(integer) from public;
grant execute on function public.kk_couches_recap_mensuel(integer) to authenticated;
