-- ============================================================================
-- Renforcement de la signature du contrat de travail (documents.html,
-- modèle contrat_travail) — même principe que le contrat d'accueil famille,
-- voir sql/contrats_signature_renforcee.sql et supabase/functions/dossier-contrat.
-- ============================================================================
-- Objectif : rester une signature électronique SIMPLE au sens eIDAS (pas de
-- prestataire de confiance qualifié), mais réduire le risque de répudiation :
--
--   1. Un code à 6 chiffres, envoyé par e-mail à l'adresse de la fiche
--      collaborateur/trice (table `employes`) et valable 10 minutes, peut
--      être exigé avant que la signature du/de la salarié(e) soit acceptée
--      — activable dans Paramètres → Le réseau une fois l'envoi d'e-mail
--      opérationnel (cf. supabase/functions/signature-otp). Tant que ce
--      n'est pas activé, la signature reste possible mais l'interface
--      l'indique clairement comme « non vérifiée par code ».
--   2. Le contenu exact du PDF généré au moment de la signature est scellé
--      par une empreinte (SHA-256), calculée côté client (jsPDF ne tourne
--      pas côté serveur ici) puis conservée avec la réponse.
--   3. Chaque étape (envoi de code, échec, vérification, signature,
--      modification a posteriori par la direction d'un contrat déjà signé)
--      est journalisée avec IP et user-agent dans une table à part.
--
-- Colonnes génériques sur `documents_reponses` (pas seulement pour
-- contrat_travail : réutilisables par un futur modèle qui en aurait besoin).
-- ============================================================================

alter table public.documents_reponses
  add column if not exists otp_code_hash      text,
  add column if not exists otp_expire_le      timestamptz,
  add column if not exists otp_tentatives     integer not null default 0,
  add column if not exists otp_envois         integer not null default 0,
  add column if not exists otp_dernier_envoi  timestamptz,
  add column if not exists otp_verifie_le     timestamptz,
  add column if not exists otp_employe_id     uuid references public.employes(id) on delete set null,
  add column if not exists signature_empreinte    text,
  add column if not exists signature_ip           text,
  add column if not exists signature_user_agent   text;

comment on column public.documents_reponses.otp_code_hash is
  'SHA-256(code + reponse_id) du code de vérification en attente. Jamais le code en clair.';
comment on column public.documents_reponses.signature_empreinte is
  'SHA-256 du PDF généré au moment de la signature — calculé côté client (jsPDF), transmis tel quel.';

-- ----------------------------------------------------------------------------
-- Journal de preuve, distinct de `documents_reponses` — table d'ajout seul :
-- aucune policy update/delete, même la direction ne peut pas réécrire un
-- événement déjà journalisé depuis l'application.
-- ----------------------------------------------------------------------------
create table if not exists public.documents_reponses_preuves (
  id           uuid primary key default gen_random_uuid(),
  reponse_id   uuid not null references public.documents_reponses(id) on delete cascade,
  evenement    text not null check (evenement in (
    'code_envoye', 'code_echec', 'code_verifie', 'signature',
    'signature_sans_otp', 'modification_direction'
  )),
  ip           text,
  user_agent   text,
  detail       jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists documents_reponses_preuves_reponse_idx
  on public.documents_reponses_preuves (reponse_id, created_at);

alter table public.documents_reponses_preuves enable row level security;

-- Lecture par la direction/référente de la crèche de la réponse concernée,
-- même règle que sur `documents_reponses` lui-même.
create policy documents_reponses_preuves_select on public.documents_reponses_preuves
  for select to authenticated
  using (
    exists (
      select 1 from public.documents_reponses dr
      join public.referents r on r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = dr.creche_id)
      where dr.id = documents_reponses_preuves.reponse_id
    )
  );

grant select on public.documents_reponses_preuves to authenticated;

-- Aucune policy insert/update/delete pour authenticated/anon : seule la
-- fonction Edge `signature-otp` (clé service role) écrit ici.
