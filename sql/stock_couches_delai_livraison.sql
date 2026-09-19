-- ============================================================================
-- Délai de livraison par référence — module Couches (stock.html)
-- ============================================================================
-- Objectif : l'alerte « rupture imminente » comparait les jours de stock
-- restants estimés à une constante unique côté client (72 h pour toutes les
-- références). Un fournisseur peut différer d'une taille à l'autre — la
-- taille 3, par exemple, se réapprovisionne parfois plus lentement qu'une
-- taille plus courante. Rendu configurable par crèche × type × taille, sur
-- le même principe que seuil_alerte_jours (sql/stock_couches.sql).
-- ============================================================================

alter table public.stock_couches
  add column if not exists delai_livraison_jours integer not null default 3;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select creche, type_couche, taille, seuil_alerte_jours, delai_livraison_jours
from public.stock_couches
order by creche, type_couche, taille;
