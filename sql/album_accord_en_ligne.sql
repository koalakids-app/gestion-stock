-- ============================================================================
-- Album photos : accord des parents SIGNÉ EN LIGNE pour le tri par visage
-- ============================================================================
-- Le parent lit le texte et signe dans l'Espace famille (espace-famille.html, via
-- l'edge function `espace-famille`, action `accord_visage`). Chaque signature est
-- conservée (preuve : texte et version, nom saisi, date, empreinte de l'adresse IP)
-- et n'est jamais modifiée : une nouvelle réponse ajoute une ligne, la dernière fait foi.
--   - « J'autorise » -> crée l'accord de l'enfant (album_visages_accord).
--   - « Je n'autorise pas » -> supprime l'accord ; le déclencheur efface alors les
--     références (empreintes) et les propositions de l'enfant.
-- Le texte signé vit dans l'edge function (constante, avec sa version) ; voir aussi
-- docs/album-accord-reconnaissance-visage.md (à faire relire par le DPO).
--
-- À appliquer après sql/album_tri_visage.sql, UNE PARTIE À LA FOIS. Chaque partie
-- est idempotente. Annulation : fin du fichier.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 3 — Table des signatures
-- ============================================================================
create table if not exists public.album_accords_signatures (
  id             uuid primary key default gen_random_uuid(),
  enfant_id      uuid not null references public.enfants(id) on delete cascade,
  creche_id      uuid not null references public.creches(id) on delete cascade,
  acces_id       uuid references public.famille_acces(id) on delete set null,
  parent_id      uuid references public.enfants_parents(id) on delete set null,
  decision       text not null check (decision in ('autorise','refuse')),
  signataire_nom text not null,
  texte_version  text not null,
  texte_hash     text not null,
  ip_hash        text,
  user_agent     text,
  signe_le       timestamptz not null default now()
);
create index if not exists album_accords_signatures_enfant_idx
  on public.album_accords_signatures (enfant_id, signe_le desc);
create index if not exists album_accords_signatures_creche_idx
  on public.album_accords_signatures (creche_id, signe_le desc);


-- ============================================================================
-- PARTIE 2 / 3 — Droits et colonnes liées
-- ============================================================================
alter table public.album_accords_signatures enable row level security;

-- Lecture : direction et référent·e de la crèche. Aucune écriture depuis l'application :
-- seule l'edge function (service_role) ajoute une signature.
drop policy if exists album_accords_signatures_lecture on public.album_accords_signatures;
create policy album_accords_signatures_lecture on public.album_accords_signatures
  for select to authenticated
  using (public.kk_est_direction() or public.kk_acces_creche(creche_id));

-- provenance de l'accord : saisi par la crèche (papier) ou signé par la famille
alter table public.album_visages_accord add column if not exists source text not null default 'creche';
alter table public.album_visages_accord add column if not exists signature_id uuid
  references public.album_accords_signatures(id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'album_visages_accord_source_check') then
    alter table public.album_visages_accord
      add constraint album_visages_accord_source_check check (source in ('creche','famille'));
  end if;
end $$;

-- le journal accepte une action sans compte de la crèche (signature d'un parent)
alter table public.album_journal alter column user_id drop not null;


-- ============================================================================
-- PARTIE 3 / 3 — Vérification (lecture seule)
-- ============================================================================
-- select count(*) from public.album_accords_signatures;
-- select policyname from pg_policies where tablename = 'album_accords_signatures';
-- select column_name from information_schema.columns
--  where table_name = 'album_visages_accord' and column_name in ('source','signature_id');

-- ============================================================================
-- Annulation :
--   alter table public.album_visages_accord drop column if exists signature_id, drop column if exists source;
--   drop table if exists public.album_accords_signatures cascade;
--   -- (user_id du journal : remettre « not null » seulement si aucune ligne n'est sans compte)
-- ============================================================================
