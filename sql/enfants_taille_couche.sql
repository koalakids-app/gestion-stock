-- ============================================================================
-- Taille (et type) de couche de l'enfant — support du module Couches
-- (sql/stock_couches.sql)
-- ============================================================================
-- Deux colonnes, saisies une fois sur la fiche enfant (comme le groupe ou le
-- régime alimentaire) et quasiment jamais retouchées :
--   - taille_couche : 3, 4, 5 ou 6.
--   - type_couche   : 'couche' (classique, tailles 3 à 6) ou 'culotte'
--     (couche-culotte, disponible seulement en tailles 4 et 5 — utilisée en
--     général à l'apprentissage de la propreté).
--
-- C'est ce qui permet de décompter automatiquement le bon article de stock à
-- chaque « Change » saisi dans le suivi (suivi.html) sans que l'équipe n'ait
-- à préciser quoi que ce soit à chaque change : le trigger de
-- stock_couches.sql lit ces deux colonnes pour savoir quel article décompter.
--
-- taille_couche NULL tant que non renseignée : aucun décompte n'a lieu pour
-- un enfant sans taille connue (le trigger ignore silencieusement ce cas).
-- type_couche vaut 'couche' par défaut (le cas très majoritaire).
-- ============================================================================

alter table public.enfants
  add column if not exists taille_couche text
    check (taille_couche in ('3','4','5','6'));

alter table public.enfants
  add column if not exists type_couche text not null default 'couche'
    check (type_couche in ('couche','culotte'));

alter table public.enfants drop constraint if exists enfants_type_couche_taille_chk;
alter table public.enfants
  add constraint enfants_type_couche_taille_chk
  check (type_couche <> 'culotte' or taille_couche in ('4','5'));

comment on column public.enfants.taille_couche is
  'Taille de couche (3/4/5/6) — utilisée pour décompter automatiquement le stock à chaque « Change » saisi dans le suivi.';
comment on column public.enfants.type_couche is
  'couche (classique) ou culotte (couche-culotte, tailles 4/5 uniquement) — voir stock_couches.';
