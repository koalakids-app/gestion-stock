-- ============================================================================
-- Date de naissance provisoire — bascule avant la naissance
-- ============================================================================
-- La bascule d'une préinscription en fiche enfant est désormais autorisée
-- avant la naissance : la fiche enfant est alors créée avec le TERME PRÉVU
-- en guise de date de naissance (`enfants.dob`), à corriger dès que la vraie
-- date est connue. Sans marqueur, aucun autre module (demandes.html,
-- contrats.html, documents.html, famille.html, suivi.html) ne peut savoir
-- que cette date n'est pas la vraie naissance — ils la traitent tous comme
-- une date réelle pour calculer l'âge, le groupe, le calendrier vaccinal, le
-- taux CMG, ou pour l'imprimer sur des documents remis à la famille.
--
-- Cette colonne porte ce signal. Elle vaut TRUE à la création par bascule
-- « à naître ». Elle repasse à FALSE dès qu'on enregistre la fiche enfant
-- depuis demandes.html (module Effectifs), qu'on ait ou non changé la date —
-- enregistrer la fiche vaut confirmation.
-- ============================================================================

alter table public.enfants
  add column if not exists naissance_provisoire boolean not null default false;

comment on column public.enfants.naissance_provisoire is
  'TRUE si dob est un terme prévu (bascule avant la naissance) et non une date de naissance confirmée.';
