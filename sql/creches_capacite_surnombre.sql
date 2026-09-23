-- ============================================================================
-- Capacité en cas de surnombre autorisé (accueil exceptionnel à 115%)
-- ============================================================================
-- creches.capacity porte la capacité agréée PMI (12 berceaux maximum pour une
-- micro-crèche) : c'est le dénominateur affiché ("X / 12") sur la grille de
-- présence hebdomadaire (demandes.html, ligne "Effectif").
--
-- Certaines crèches ont en plus une autorisation d'accueil en surnombre
-- (jusqu'à 115% de la capacité agréée en usage occasionnel/exceptionnel,
-- soit 14 pour une capacité de 12). capacity_surnombre porte ce plafond
-- réel : au-delà, l'effectif du jour est signalé en rouge sur la grille.
-- Pour une crèche sans cette autorisation, capacity_surnombre reste null et
-- le seuil rouge retombe sur la capacité agréée elle-même (comportement
-- précédent, inchangé).
-- ============================================================================

alter table public.creches add column if not exists capacity_surnombre integer;
