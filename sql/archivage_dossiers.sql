-- ============================================================================
-- Archivage des dossiers enfants/employés en fin de contrat
-- ============================================================================
-- date_sortie (enfants) / date_fin (employes) existent déjà et donnent le
-- signal "dossier terminé" ; ces deux colonnes ne font qu'ajouter la trace
-- de l'archivage volontaire, toujours déclenché à la main depuis la fiche
-- (jamais automatique) : le statut affiché à l'écran se déduit de
-- date_sortie/date_fin + archive_le, il n'y a pas de colonne "statut" à
-- garder synchronisée.
-- ============================================================================

alter table public.enfants add column if not exists archive_le timestamptz;
alter table public.enfants add column if not exists archive_par uuid references auth.users(id);

alter table public.employes add column if not exists archive_le timestamptz;
alter table public.employes add column if not exists archive_par uuid references auth.users(id);
