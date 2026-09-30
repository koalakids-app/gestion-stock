-- ============================================================================
-- Demandes envoyées à plusieurs destinataires : regroupement à l'affichage
-- ============================================================================
-- Une demande envoyée à N personnes reste enregistrée en N lignes (statut, fil
-- de discussion et notifications restent propres à chaque destinataire), mais
-- ces lignes partagent un même `groupe_envoi` : l'application les affiche alors
-- comme UNE seule demande. `destinataires_noms` liste tous les destinataires,
-- pour que chacun voie à qui la demande a été adressée.
-- ============================================================================

alter table public.demandes
  add column if not exists groupe_envoi uuid,
  add column if not exists destinataires_noms text;

create index if not exists demandes_groupe_envoi_idx
  on public.demandes (groupe_envoi)
  where groupe_envoi is not null;
