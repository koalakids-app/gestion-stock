-- ============================================================================
-- Coordonnées traiteur de la crèche, réutilisées sur la commande repas
-- ============================================================================
-- La commande repas (demandes.html, bon MCM) demandait jusqu'ici l'adresse, le
-- téléphone, le mail, le contact et le nom de la responsable à chaque
-- ouverture : ces champs n'étaient mémorisés que dans le localStorage de
-- l'appareil (cr_info_<creche_id>), donc à ressaisir sur chaque poste et pour
-- chaque nouvelle personne qui commande.
--
-- On les stocke désormais une fois sur la fiche crèche elle-même, pour être
-- pré-remplis d'office sur toutes les commandes de ce site, quel que soit
-- l'appareil ou la personne qui commande.
-- ============================================================================

alter table public.creches add column if not exists repas_tel text;
alter table public.creches add column if not exists repas_mail text;
alter table public.creches add column if not exists repas_contact text;
alter table public.creches add column if not exists repas_responsable text;
