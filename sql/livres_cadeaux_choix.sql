-- ============================================================================
-- Livres cadeaux — choix du livre et prix par tranche d'âge
-- ============================================================================
-- Demandes › Enfants & suivi › Livres cadeaux (js/pages/demandes/25-livres-cadeaux.js).
-- Une ligne par tranche d'âge (t0 = 0-12 mois … t3 = plus de 36 mois), commune à
-- toutes les crèches de l'organisation : titre du livre, prix unitaire, image
-- (couverture réduite à 500 px côté navigateur, stockée en data-URL JPEG, ~50 Ko).
-- Lecture : toute l'organisation. Écriture : direction seule.
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb). Idempotent.
-- ============================================================================
create table if not exists public.livres_cadeaux_choix (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null default public.kk_mon_org(),
  tranche  text not null check (tranche in ('t0','t1','t2','t3')),
  titre    text,
  prix     numeric check (prix is null or (prix >= 0 and prix <= 1000)),
  image    text,
  maj_le   timestamptz not null default now(),
  unique (org_id, tranche)
);
alter table public.livres_cadeaux_choix enable row level security;

drop policy if exists livres_cadeaux_choix_lecture on public.livres_cadeaux_choix;
create policy livres_cadeaux_choix_lecture on public.livres_cadeaux_choix
  for select to authenticated using (org_id = (select public.kk_mon_org()));

drop policy if exists livres_cadeaux_choix_ecriture on public.livres_cadeaux_choix;
create policy livres_cadeaux_choix_ecriture on public.livres_cadeaux_choix
  for all to authenticated
  using (org_id = (select public.kk_mon_org()) and public.kk_est_direction())
  with check (org_id = (select public.kk_mon_org()) and public.kk_est_direction());

-- Annulation : drop table if exists public.livres_cadeaux_choix;
