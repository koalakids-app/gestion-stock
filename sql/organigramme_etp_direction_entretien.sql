-- ============================================================================
-- Organigramme : ETP de direction et ETP entretien / repas par carte
-- ============================================================================
-- `etp_direction` : part de la carte consacrée à la direction (ex. 0,5 ETP = 17 h 30 / semaine pour la directrice).
-- `etp_entretien` : part consacrée à l'entretien et à la restauration (repas, goûter, ménage).
-- Ce sont des « dont » du temps de travail de la carte (information, déjà comprise dans heures_hebdo / etp) ;
-- l'organigramme en fait le total par crèche. Reprise possible depuis Documents › Calcul des ETP et de l'encadrement.
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb), après sql/organigramme.sql. Idempotent.
-- Annulation : alter table public.organigramme_cartes drop column etp_direction, drop column etp_entretien;
-- ============================================================================
alter table public.organigramme_cartes
  add column if not exists etp_direction numeric check (etp_direction is null or (etp_direction >= 0 and etp_direction <= 2)),
  add column if not exists etp_entretien numeric check (etp_entretien is null or (etp_entretien >= 0 and etp_entretien <= 2));
