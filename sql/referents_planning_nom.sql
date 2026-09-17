-- ============================================================================
-- Rapprochement planning équipe → planning individuel du directeur technique
-- ============================================================================
-- Comme employes.planning_nom (cf. sql/collaborateurs_planning_nom.sql) pour
-- les collaborateurs/trices, mais pour les directeurs/trices techniques
-- (table referents) : certaines n'ont pas de fiche employes liée
-- (referents.employe_id optionnel), donc le rapprochement ne peut pas
-- toujours s'appuyer sur employes.planning_nom.
--
-- `referents.planning_nom` permet à la direction d'indiquer explicitement,
-- comme on le faisait déjà en choisissant le prénom lors d'un import Excel/
-- PDF, quel prénom du planning équipe correspond à cette personne — laissé
-- vide, le rapprochement automatique (planning_nom de la fiche employé
-- liée, sinon le nom de la fiche referents) continue de s'appliquer.
-- ============================================================================

alter table public.referents add column if not exists planning_nom text;
