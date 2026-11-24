-- ============================================================================
-- Livres cadeaux — suivi de la remise (qui a reçu son cadeau)
-- ============================================================================
-- Demandes › Enfants & suivi › Livres cadeaux › « Suivi de remise »
-- (js/pages/demandes/25-livres-cadeaux.js). Une ligne par enfant et par année
-- (année de la date de référence) : présence = cadeau remis.
-- Lecture / écriture : direction et référent·e de la crèche (kk_acces_creche_gestion).
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb). Idempotent.
-- ============================================================================
create table if not exists public.livres_cadeaux_remis (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null default public.kk_mon_org(),
  creche_id  uuid not null references public.creches(id) on delete cascade,
  enfant_id  uuid not null references public.enfants(id) on delete cascade,
  annee      int  not null,
  remis_le   timestamptz not null default now(),
  unique (enfant_id, annee)
);
create index if not exists livres_cadeaux_remis_creche_idx on public.livres_cadeaux_remis(creche_id, annee);
alter table public.livres_cadeaux_remis enable row level security;

drop policy if exists livres_cadeaux_remis_tout on public.livres_cadeaux_remis;
create policy livres_cadeaux_remis_tout on public.livres_cadeaux_remis
  for all to authenticated
  using (org_id = (select public.kk_mon_org()) and public.kk_acces_creche_gestion(creche_id))
  with check (org_id = (select public.kk_mon_org()) and public.kk_acces_creche_gestion(creche_id));

-- Annulation : drop table if exists public.livres_cadeaux_remis;
