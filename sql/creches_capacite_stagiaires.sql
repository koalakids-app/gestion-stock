-- ============================================================================
-- Capacité d'accueil des stagiaires et alternants, par crèche
-- ============================================================================
-- stagiaires_capacite : nombre de stagiaires/alternants que la crèche peut
--   accueillir en même temps. Vide = 1.
-- stagiaires_chevauchement_semaines : nombre de semaines pendant lesquelles
--   la crèche accepte un stagiaire de plus que sa capacité (passation entre
--   deux stagiaires). 0 ou vide = aucun chevauchement toléré ; 1 = une semaine
--   (5 jours ouvrés), au plus UN stagiaire de plus que la capacité.
-- Utilisés par l'onglet « Disponibilités » du module Stagiaires.
-- ============================================================================

alter table public.creches add column if not exists stagiaires_capacite integer;
alter table public.creches add column if not exists stagiaires_chevauchement_semaines integer;

alter table public.creches drop constraint if exists creches_stagiaires_capacite_ck;
alter table public.creches add constraint creches_stagiaires_capacite_ck
  check (stagiaires_capacite is null or stagiaires_capacite between 1 and 20);

alter table public.creches drop constraint if exists creches_stagiaires_chevauchement_ck;
alter table public.creches add constraint creches_stagiaires_chevauchement_ck
  check (stagiaires_chevauchement_semaines is null or stagiaires_chevauchement_semaines between 0 and 8);
