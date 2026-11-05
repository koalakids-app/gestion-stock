-- ============================================================================
-- Espace famille — renvoi du lien par e-mail (edge function `renvoyer-lien-famille`)
-- Journal des demandes, pour limiter les envois : 3 par adresse et 10 par IP et par heure.
-- On ne garde qu'une empreinte SHA-256 de l'adresse (jamais l'adresse elle-même).
-- Service_role uniquement (aucune policy). À appliquer à la main sur Supabase.
-- ============================================================================
create table if not exists public.famille_renvois (
  id          bigint generated always as identity primary key,
  ip          text not null,
  email_hash  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists famille_renvois_ip_idx    on public.famille_renvois (ip, created_at desc);
create index if not exists famille_renvois_email_idx on public.famille_renvois (email_hash, created_at desc);
alter table public.famille_renvois enable row level security;   -- aucune policy : service_role seul
