-- ============================================================================
-- Étend le journal archivage_purges aux stagiaires et alternants
-- ============================================================================
-- Oubliée dans sql/documents_externes_stagiaires.sql : la fonction d'export
-- des documents (voir js/stagiaires.js, stgExporterDocuments) écrit aussi
-- dans ce journal une fois les fichiers supprimés du stockage en ligne.
-- ============================================================================

alter table public.archivage_purges drop constraint if exists archivage_purges_entite_type_check;
alter table public.archivage_purges
  add constraint archivage_purges_entite_type_check
  check (entite_type in ('enfant','employe','stagiaire'));
