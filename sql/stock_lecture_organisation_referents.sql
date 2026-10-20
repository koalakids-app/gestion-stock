-- ============================================================================
-- Module Stock : les référents lisent l'inventaire, les commandes et
-- l'historique de TOUTES les crèches de leur organisation (lecture seule).
-- ============================================================================
-- Contexte : articles_stock_access, commandes_stock_access et
-- historique_stock_access (ALL) ne laissent passer que la crèche du compte
-- (kk_acces_creche_nom). Depuis la migration multi-organisations, un référent ne
-- voyait donc plus que sa propre crèche, alors que la page Stock affiche les 6
-- crèches. Ces policies SELECT s'ajoutent en OU ; l'écriture reste régie par les
-- policies existantes (crèche du référent uniquement). Jamais d'accès
-- inter-organisations (kk_meme_org_creche_nom).
--
-- Annulation :
--   drop policy if exists articles_lecture_organisation on public.articles;
--   drop policy if exists commandes_lecture_organisation on public.commandes;
--   drop policy if exists historique_lecture_organisation on public.historique;
-- ============================================================================

drop policy if exists articles_lecture_organisation on public.articles;
create policy articles_lecture_organisation
  on public.articles for select
  using (public.kk_meme_org_creche_nom(creche));

drop policy if exists commandes_lecture_organisation on public.commandes;
create policy commandes_lecture_organisation
  on public.commandes for select
  using (public.kk_meme_org_creche_nom(creche));

drop policy if exists historique_lecture_organisation on public.historique;
create policy historique_lecture_organisation
  on public.historique for select
  using (public.kk_meme_org_creche_nom(creche));
