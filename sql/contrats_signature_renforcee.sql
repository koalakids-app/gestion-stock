-- ============================================================================
-- Renforcement de la signature famille des contrats (dossier-contrat)
-- ============================================================================
-- Objectif : rester une signature électronique SIMPLE au sens eIDAS (pas de
-- prestataire de confiance qualifié), mais réduire nettement le risque de
-- répudiation :
--
--   1. Le signataire doit prouver qu'il contrôle, AU MOMENT DE SIGNER, la
--      boîte mail à laquelle le contrat a été envoyé : un code à 6 chiffres,
--      à durée de vie courte, est exigé en plus du nom et du tracé.
--   2. Le contenu exact qui a été présenté à la famille est scellé par une
--      empreinte (SHA-256) au moment de la signature : toute modification
--      ultérieure du contrat redonnerait une empreinte différente.
--   3. Chaque étape (ouverture, envoi de code, échec de code, signature,
--      refus) est journalisée avec IP et user-agent dans une table à part,
--      distincte de `contrats` — un journal de preuve ne doit pas pouvoir
--      être réécrit par une mise à jour de la ligne qu'il documente.
--
-- Ceci NE fait PAS de cette signature une signature électronique AVANCÉE au
-- sens eIDAS : cela suppose un identifiant de confiance qualifié et un
-- horodatage qualifié, qu'aucune brique ici ne fournit. C'est un
-- renforcement du dossier de preuve, pas un changement de qualification
-- juridique.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonnes portées par `contrats`
-- ----------------------------------------------------------------------------
-- Le code lui-même n'est jamais stocké en clair : seule son empreinte
-- (SHA-256, salée par le token du contrat, qui est déjà secret) l'est. Une
-- fuite de la base ne permet donc pas de rejouer un code en attente.
alter table public.contrats
  add column if not exists otp_code_hash      text,
  add column if not exists otp_expire_le      timestamptz,
  add column if not exists otp_tentatives     integer not null default 0,
  add column if not exists otp_envois         integer not null default 0,
  add column if not exists otp_dernier_envoi  timestamptz,
  add column if not exists otp_verifie_le     timestamptz,
  add column if not exists signature_empreinte    text,
  add column if not exists signature_ip           text,
  add column if not exists signature_user_agent   text;

comment on column public.contrats.otp_code_hash is
  'SHA-256(code + token) du code de vérification en attente. Jamais le code en clair.';
comment on column public.contrats.signature_empreinte is
  'SHA-256 du contenu exact (montants, dates, clauses) présenté à la famille au moment de la signature.';

-- ----------------------------------------------------------------------------
-- 2. Journal de preuve, distinct de `contrats`
-- ----------------------------------------------------------------------------
-- Table d'ajout seul (pas de policy UPDATE ni DELETE) : un événement déjà
-- journalisé ne doit plus pouvoir être modifié, y compris par la direction.
create table if not exists public.contrats_preuves (
  id          uuid primary key default gen_random_uuid(),
  contrat_id  uuid not null references public.contrats(id) on delete cascade,
  evenement   text not null check (evenement in (
    'ouverture', 'code_envoye', 'code_echec', 'code_verifie', 'signature', 'refus'
  )),
  ip          text,
  user_agent  text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists contrats_preuves_contrat_idx
  on public.contrats_preuves (contrat_id, created_at);

alter table public.contrats_preuves enable row level security;

-- Lecture par la direction/référente de la crèche du contrat, même règle que
-- sur `contrats` lui-même.
create policy contrats_preuves_select on public.contrats_preuves
  for select to authenticated
  using (
    exists (
      select 1 from public.contrats c
      join public.referents r on r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = c.creche_id)
      where c.id = contrats_preuves.contrat_id
    )
  );

-- Aucune policy insert/update/delete pour `authenticated` ou `anon` : seule
-- l'edge function `dossier-contrat`, en `service_role`, écrit ici — jamais un
-- utilisateur connecté ni la page publique.

grant select on public.contrats_preuves to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification
-- ----------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='contrats' and column_name like 'otp_%')
    as nb_colonnes_otp,
  (select count(*) from pg_policies
     where schemaname='public' and tablename='contrats_preuves') as nb_policies;
