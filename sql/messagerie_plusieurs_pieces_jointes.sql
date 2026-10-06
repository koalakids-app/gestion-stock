-- ============================================================================
-- Plusieurs pièces jointes par demande / consigne / réponse / brouillon
-- ============================================================================
-- Nouvelle colonne `attachments` : tableau JSON [{"url": "...", "name": "..."}].
-- attachment_url / attachment_name restent renseignées avec la PREMIÈRE pièce
-- (compatibilité avec les e-mails, notifications et lignes existantes).
-- À exécuter une fois dans l'éditeur SQL de Supabase, AVANT de déployer.
-- ============================================================================

alter table public.demandes             add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages             add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.demandes_brouillons  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages_brouillons  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.consignes_brouillons add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Reprise des pièces jointes uniques déjà enregistrées.
update public.demandes             set attachments = jsonb_build_array(jsonb_build_object('url', attachment_url, 'name', attachment_name)) where attachment_url is not null and attachments = '[]'::jsonb;
update public.messages             set attachments = jsonb_build_array(jsonb_build_object('url', attachment_url, 'name', attachment_name)) where attachment_url is not null and attachments = '[]'::jsonb;
update public.demandes_brouillons  set attachments = jsonb_build_array(jsonb_build_object('url', attachment_url, 'name', attachment_name)) where attachment_url is not null and attachments = '[]'::jsonb;
update public.messages_brouillons  set attachments = jsonb_build_array(jsonb_build_object('url', attachment_url, 'name', attachment_name)) where attachment_url is not null and attachments = '[]'::jsonb;
update public.consignes_brouillons set attachments = jsonb_build_array(jsonb_build_object('url', attachment_url, 'name', attachment_name)) where attachment_url is not null and attachments = '[]'::jsonb;
