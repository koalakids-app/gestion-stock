-- ============================================================================
-- Ludothèque : propositions (table univers) lisibles par toutes les crèches de
-- l'organisation, modifiables uniquement par la crèche à laquelle elles sont
-- rattachées.
-- ============================================================================
-- Contexte : univers_stock_access (ALL) n'autorise une ligne que si
-- kk_acces_creche_nom(creche) est vrai, c'est-à-dire pour la seule crèche de
-- l'utilisateur. Un directeur/une référente de crèche ne voit donc que les
-- propositions de sa propre crèche (liste vide si elle n'en a pas), alors que
-- ludotheque.html est conçue pour que toutes les crèches consultent les
-- propositions et ne modifient que les leurs (SK_WRITE_CRECHE).
--
-- Cette migration AJOUTE une policy SELECT (les policies sont cumulées en OU) :
--   * lecture seule ;
--   * limitée aux crèches de la MÊME organisation que l'utilisateur
--     (jamais d'accès inter-organisations) ;
--   * aucune écriture supplémentaire : insert/update/delete restent régis par
--     univers_stock_access.
--
-- Annulation :
--   drop policy if exists univers_lecture_organisation on public.univers;
-- (kk_meme_org_creche_nom est partagée avec articles : ne pas la supprimer.)
-- ============================================================================

create or replace function public.kk_meme_org_creche_nom(nom text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.referents r
    left join public.creches c0 on c0.id = r.creche_id
    join public.creches c on c.org_id = coalesce(r.org_id, c0.org_id)
    where r.user_id = auth.uid()
      and nom is not null
      and kk_stock_couches_nom_court(c.name) = nom
  );
$function$;

drop policy if exists univers_lecture_organisation on public.univers;
create policy univers_lecture_organisation
  on public.univers
  for select
  using (public.kk_meme_org_creche_nom(creche));
