-- Goûters moyens : un effectif par ligne (ex. yaourt / compote).
-- À appliquer à la main (SQL Editor, projet juyrceadazrovlitxceb).
-- `moyens` reste le plus grand des deux effectifs ; les anciennes lignes (null)
-- reprennent `moyens` pour les deux produits.
alter table public.gouters_creche_effectifs add column if not exists moyens_l1 smallint check (moyens_l1 between 0 and 99);
alter table public.gouters_creche_effectifs add column if not exists moyens_l2 smallint check (moyens_l2 between 0 and 99);
