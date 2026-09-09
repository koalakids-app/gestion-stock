-- ============================================================================
-- Pièces jointes dans la messagerie (demandes à un référent/à la direction,
-- réponses dans le fil de discussion, consignes)
-- ============================================================================
-- `demandes` porte à la fois les messages directs et les consignes (type
-- 'consigne') : une seule paire de colonnes couvre donc les deux cas demandés.
-- `messages` porte les réponses dans un fil de discussion.
--
-- Le fichier lui-même est stocké dans le bucket Storage `assets` (déjà utilisé
-- par Frais pro, Stagiaires, etc.) — jamais en base64 en base, conformément à
-- la convention du projet (voir README, section Notes techniques).
-- ============================================================================

alter table public.demandes add column if not exists attachment_url text;
alter table public.demandes add column if not exists attachment_name text;

alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_name text;
