-- ============================================================================
-- Autorise le statut « remis » sur documents_reponses (fiche enfant, onglet
-- Documents → « à rapporter en papier » / fiche sanitaire)
-- ============================================================================
-- demandes.html coche un document « à rapporter en papier » (autorisation
-- droit à l'image, fiche sanitaire...) en insérant une ligne
-- documents_reponses avec statut = 'remis' (« reçu en main propre »,
-- distinct de 'signe' qui suppose une signature en ligne via l'outil
-- Documents). La contrainte CHECK posée à la création de la table ne
-- connaissait que 'prepare' et 'signe' : chaque tentative de cocher échouait
-- silencieusement (violates check constraint "documents_reponses_statut_chk").
--
-- À exécuter manuellement dans le SQL editor Supabase — ce dépôt ne migre
-- rien automatiquement (voir README, section Architecture).
-- ============================================================================

alter table public.documents_reponses
  drop constraint if exists documents_reponses_statut_chk;

alter table public.documents_reponses
  add constraint documents_reponses_statut_chk
  check (statut in ('prepare', 'signe', 'remis'));
