-- ============================================================================
-- Multi-tenant (Part 5.1) : généralise kk_stock_couches_nom_court()
-- ============================================================================
-- sql/stock_couches_nom_creche.sql figeait la correspondance nom complet →
-- libellé court dans un CASE par nom de crèche, valable uniquement pour les
-- 6 sites Koala Kids existants au moment où il a été écrit. Toute nouvelle
-- crèche (Koala Kids ou une autre organisation cliente) y serait tombée dans
-- la branche `else p_nom` et se serait retrouvée sous son nom complet dans
-- stock_couches — invisible pour stock.html, qui compare des libellés courts.
--
-- Remplacé par la même règle de dérivation que shortCrecheName() côté front
-- (stock.html, documents.html, ludotheque.html, demandes.html) : retirer les
-- préfixes d'enseigne ("Koalakids ") et de ville ("Toulon ") plutôt que de
-- lister chaque nom. Vérifié : produit exactement les mêmes libellés pour
-- les 6 crèches Koala Kids actuelles (aucune migration de données requise).
-- ============================================================================

create or replace function public.kk_stock_couches_nom_court(p_nom text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(regexp_replace(regexp_replace(p_nom, '^Koalakids\s+', '', 'i'), '^Toulon\s+', '', 'i')), ''), p_nom);
$$;
