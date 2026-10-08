-- ============================================================================
-- Articles « Entretien » et « Cuisine » : lisibles par toutes les crèches de
-- l'organisation (pour pouvoir les commander), modifiables uniquement par la
-- crèche à laquelle ils sont rattachés.
-- ============================================================================
-- Contexte : articles_stock_access (ALL) n'autorise une ligne que si
-- kk_acces_creche_nom(creche) est vrai, c'est-à-dire pour la seule crèche de
-- l'utilisateur. Un article Entretien/Cuisine créé sans structure est rattaché
-- à la première crèche : les autres crèches ne le voient donc pas dans le
-- sélecteur « Choisir depuis articles existants » de la commande.
--
-- Cette migration AJOUTE une policy SELECT (les policies sont cumulées en OU) :
--   * lecture seule, uniquement pour les catégories Entretien et Cuisine ;
--   * limitée aux crèches de la MÊME organisation que l'utilisateur
--     (jamais d'accès inter-organisations) ;
--   * aucune écriture supplémentaire : insert/update/delete restent régis par
--     articles_stock_access.
--
-- Annulation :
--   drop policy if exists articles_entretien_cuisine_lecture on public.articles;
--   drop function if exists public.kk_meme_org_creche_nom(text);
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

drop policy if exists articles_entretien_cuisine_lecture on public.articles;
create policy articles_entretien_cuisine_lecture
  on public.articles
  for select
  using (cat in ('Entretien', 'Cuisine') and public.kk_meme_org_creche_nom(creche));
