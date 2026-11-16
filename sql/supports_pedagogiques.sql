-- ============================================================================
-- Supports pédagogiques (ex-Padlet « Supports pédagogiques Koalakids »)
-- ============================================================================
-- Bibliothèque de ressources de formation des équipes, classées par thématique :
-- vidéos (YouTube), PDF, documents Word / PowerPoint, images et liens.
--  * supports_themes        : thématiques (créées / renommées par la direction).
--  * supports_pedagogiques  : un support = un lien (`url`) OU un fichier copié
--                             dans le bucket privé `supports-pedagogiques`
--                             (`fichier_path`). `a_voir` = parcours de formation.
--  * supports_vus           : suivi personnel (vu + notes), visible par la seule
--                             personne concernée.
-- Lecture : tout compte de l'organisation ayant une fiche référent·e ou
-- collaborateur·trice. Écriture : direction (`kk_est_direction()`).
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb), une partie à
-- la fois. Idempotent.
-- ============================================================================

-- 1) Qui peut lire : référent·e ou collaborateur·trice
create or replace function public.kk_support_membre()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.referents where user_id = auth.uid())
      or exists (select 1 from public.employes  where user_id = auth.uid());
$$;
revoke all on function public.kk_support_membre() from public;
grant execute on function public.kk_support_membre() to authenticated;

-- 2) Tables
create table if not exists public.supports_themes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid default public.kk_mon_org(),
  nom         text not null check (length(btrim(nom)) > 0 and length(nom) <= 120),
  icone       text not null default '📚',
  couleur     text not null default '#ffe3d6',
  ordre       integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.supports_pedagogiques (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid default public.kk_mon_org(),
  theme_id     uuid not null references public.supports_themes(id) on delete cascade,
  titre        text not null check (length(btrim(titre)) > 0 and length(titre) <= 300),
  description  text,
  type         text not null check (type in ('video','pdf','document','image','lien')),
  url          text,            -- lien externe (YouTube, article, podcast…)
  fichier_path text,            -- fichier copié dans le bucket `supports-pedagogiques`
  fichier_nom  text,
  mime         text,
  taille       bigint,
  a_voir       boolean not null default false,
  date_source  date,            -- date de publication d'origine (Padlet)
  ordre        integer not null default 0,
  created_at   timestamptz not null default now(),
  check (url is not null or fichier_path is not null or type = 'video')
);
create index if not exists supports_pedagogiques_theme_idx on public.supports_pedagogiques (theme_id, ordre);

create table if not exists public.supports_vus (
  user_id     uuid not null default auth.uid(),
  support_id  uuid not null references public.supports_pedagogiques(id) on delete cascade,
  vu_le       timestamptz not null default now(),
  notes       text,
  primary key (user_id, support_id)
);

alter table public.supports_themes       enable row level security;
alter table public.supports_pedagogiques enable row level security;
alter table public.supports_vus          enable row level security;

-- 3) Politiques
drop policy if exists supports_themes_select on public.supports_themes;
drop policy if exists supports_themes_ecriture on public.supports_themes;
create policy supports_themes_select on public.supports_themes
  for select to authenticated
  using (org_id = public.kk_mon_org() and public.kk_support_membre());
create policy supports_themes_ecriture on public.supports_themes
  for all to authenticated
  using (org_id = public.kk_mon_org() and public.kk_est_direction())
  with check (org_id = public.kk_mon_org() and public.kk_est_direction());

drop policy if exists supports_pedagogiques_select on public.supports_pedagogiques;
drop policy if exists supports_pedagogiques_ecriture on public.supports_pedagogiques;
create policy supports_pedagogiques_select on public.supports_pedagogiques
  for select to authenticated
  using (org_id = public.kk_mon_org() and public.kk_support_membre());
create policy supports_pedagogiques_ecriture on public.supports_pedagogiques
  for all to authenticated
  using (org_id = public.kk_mon_org() and public.kk_est_direction())
  with check (org_id = public.kk_mon_org() and public.kk_est_direction());

drop policy if exists supports_vus_perso on public.supports_vus;
create policy supports_vus_perso on public.supports_vus
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4) Stockage privé des fichiers (50 Mo max par fichier)
insert into storage.buckets (id, name, public, file_size_limit)
values ('supports-pedagogiques', 'supports-pedagogiques', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists supports_fichiers_select on storage.objects;
drop policy if exists supports_fichiers_insert on storage.objects;
drop policy if exists supports_fichiers_update on storage.objects;
drop policy if exists supports_fichiers_delete on storage.objects;

create policy supports_fichiers_select on storage.objects
  for select to authenticated
  using (bucket_id = 'supports-pedagogiques' and public.kk_support_membre());
create policy supports_fichiers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'supports-pedagogiques' and public.kk_est_direction());
create policy supports_fichiers_update on storage.objects
  for update to authenticated
  using (bucket_id = 'supports-pedagogiques' and public.kk_est_direction())
  with check (bucket_id = 'supports-pedagogiques' and public.kk_est_direction());
create policy supports_fichiers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'supports-pedagogiques' and public.kk_est_direction());
