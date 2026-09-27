-- ============================================================================
-- Fix critique multi-tenant : kk_acces_creche_nom() comparait le mauvais nom
-- ============================================================================
-- Depuis la Part 5.1 (creches chargées depuis Supabase, cf. commit
-- "Part 5.1 (ludotheque.html) : crèches chargées depuis Supabase"),
-- creches.name porte la raison sociale complète ("Koalakids Toulon Brunet").
-- Mais kk_acces_creche_nom(nom) comparait directement `c.name = nom`, alors
-- que articles/univers/stock_couches/commandes/historique.creche stockent le
-- libellé court historique ("Brunet") : plus aucune ligne ne matchait, et les
-- RLS suivantes renvoyaient un résultat vide pour tout le monde :
--   univers_stock_access, articles_stock_access, commandes_stock_access,
--   historique_stock_access, stock_couches_select/insert/update,
--   stock_couches_mouvements_select/insert.
-- C'est ce qui faisait disparaître les propositions de la ludothèque (et
-- silencieusement articles/stock/commandes/historique avec elles).
--
-- Fix : dériver le libellé court avec la même règle que
-- kk_stock_couches_nom_court() / shortCrecheName() côté front (retirer les
-- préfixes d'enseigne "Koalakids " et de ville "Toulon ") avant de comparer.
-- ============================================================================

create or replace function public.kk_acces_creche_nom(nom text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.referents r
    left join public.creches c on c.id = r.creche_id
    where r.user_id = auth.uid()
      and (
        kk_stock_couches_nom_court(c.name) = nom
        or (r.creche_id is null and nom is not null and exists (
          select 1 from public.creches c2 where kk_stock_couches_nom_court(c2.name) = nom and c2.org_id = r.org_id
        ))
      )
  );
$function$;
