-- ============================================================================
-- Organigramme : nombre de jours travaillés par semaine
-- ============================================================================
-- `jours_semaine` (1 à 7, facultatif) : permet d'afficher le temps de direction par jour travaillé sur la carte
-- (ex. 0,5 ETP = 17 h 30 sur 4 jours = 4 h 23 par jour). Affichage seulement : le planning PMI répartit déjà le temps
-- de direction sur les jours réellement travaillés (`pmiRepartirBureau`). À appliquer après sql/organigramme.sql. Idempotent.
-- Annulation : alter table public.organigramme_cartes drop column jours_semaine;
-- ============================================================================
alter table public.organigramme_cartes
  add column if not exists jours_semaine smallint check (jours_semaine is null or (jours_semaine between 1 and 7));
