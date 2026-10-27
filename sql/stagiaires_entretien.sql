-- ============================================================================
-- Entretien d'un stagiaire / alternant → calendrier des événements
-- ============================================================================
-- La fiche stagiaire (demandes.html › Stagiaires) fixe la date et l'heure d'un
-- rendez-vous d'entretien ; il est reporté dans `evenements` (type « entretien »).
-- evenements.stagiaire_id relie l'événement à la fiche : un entretien déplacé met
-- à jour le même événement, un entretien retiré ou une fiche supprimée l'efface.
-- Un seul événement d'entretien par fiche (index unique partiel).
-- À appliquer à la main sur Supabase.
-- ============================================================================
alter table public.stagiaires
  add column if not exists entretien_date date,
  add column if not exists entretien_heure text;

alter table public.evenements
  add column if not exists stagiaire_id uuid references public.stagiaires(id) on delete cascade;
create unique index if not exists evenements_stagiaire_id_key
  on public.evenements(stagiaire_id) where stagiaire_id is not null;
