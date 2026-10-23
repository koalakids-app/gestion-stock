-- ============================================================================
-- Codes de secours de la double authentification (TOTP)
-- ============================================================================
-- Si un·e utilisateur·trice perd son téléphone, un code de secours (à usage unique)
-- permet de retirer l'ancien appareil puis d'en configurer un nouveau, sans l'aide
-- de la direction. Les codes ne sont JAMAIS stockés en clair : seulement leur
-- empreinte SHA-256. La table n'est lisible que par l'edge function
-- `mfa-codes-secours` (clé service) : RLS activée, aucune policy.
--
--  - mfa_codes_secours        : une ligne par code (empreinte, date d'utilisation).
--  - mfa_codes_secours_essais : limite les essais ratés (5 puis 15 minutes de pause).
--
-- À appliquer à la main sur Supabase (une instruction à la fois si l'éditeur expire).
-- ============================================================================

create table if not exists public.mfa_codes_secours (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  utilise_le  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists mfa_codes_secours_user_idx on public.mfa_codes_secours (user_id);

create table if not exists public.mfa_codes_secours_essais (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  essais   integer not null default 0,
  dernier  timestamptz not null default now()
);

alter table public.mfa_codes_secours enable row level security;
alter table public.mfa_codes_secours_essais enable row level security;

revoke all on public.mfa_codes_secours from anon, authenticated;
revoke all on public.mfa_codes_secours_essais from anon, authenticated;
