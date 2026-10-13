-- ============================================================================
-- Consommation de couches sur 14 jours — alimente l'estimation « jours
-- restants » de stock.html (page Couches).
-- ============================================================================
-- Net des saisies « Couches du jour » (sql/stock_couches_jour.sql, motif
-- couches_jour) : les corrections à la baisse se retranchent. `jours` = nombre
-- de jours distincts avec saisie, pour ne pas diluer la moyenne d'une crèche
-- qui vient de commencer à saisir. security_invoker : les droits de lecture de
-- stock_couches_mouvements (par crèche) s'appliquent à l'appelant.
-- ============================================================================
create or replace view public.stock_couches_conso14 with (security_invoker = true) as
select creche, type_couche, taille,
       sum(-delta)::integer as conso14,
       count(distinct created_at::date)::integer as jours
from public.stock_couches_mouvements
where motif = 'couches_jour' and created_at >= now() - interval '14 days'
group by creche, type_couche, taille;

grant select on public.stock_couches_conso14 to authenticated;
