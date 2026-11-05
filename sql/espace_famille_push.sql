-- ============================================================================
-- Espace famille — notifications push (action `push_abonner` de l'edge function
-- `espace-famille`, envoi par `notify-push` avec `acces_ids`).
-- Un appareil = un abonnement push rattaché à l'accès (famille_acces) du parent.
-- Service_role uniquement (aucune policy). Supprimé avec l'accès.
-- À appliquer à la main sur Supabase.
-- ============================================================================
create table if not exists public.famille_push (
  id          uuid primary key default gen_random_uuid(),
  acces_id    uuid not null references public.famille_acces(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists famille_push_acces_idx on public.famille_push (acces_id);
alter table public.famille_push enable row level security;   -- aucune policy : service_role seul
