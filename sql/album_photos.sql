-- ============================================================================
-- Album photos : photos de la crèche classées par enfant (étape 1, tri manuel)
-- ============================================================================
-- Tables :
--   album_photos          une ligne par photo (fichier + miniature dans le bucket
--                         privé `album`, chemin = <creche_id>/<photo_id>.jpg).
--   album_photos_enfants  qui figure sur la photo (une photo de groupe apparaît
--                         dans le dossier de chaque enfant, stockée une seule fois).
--   album_journal         trace des ajouts, classements, retraits, suppressions et
--                         remises aux parents. Sans UPDATE ni DELETE ; lecture : direction.
-- Droits : direction = tout ; référent·e = sa crèche (kk_acces_creche).
-- Aucune reconnaissance de visage à cette étape.
--
-- À exécuter dans le SQL Editor Supabase, UNE PARTIE À LA FOIS. Chaque partie
-- est idempotente. Annulation : fin du fichier.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 4 — Tables
-- ============================================================================
create table if not exists public.album_photos (
  id          uuid primary key default gen_random_uuid(),
  creche_id   uuid not null references public.creches(id) on delete cascade,
  chemin      text not null,
  chemin_mini text not null,
  prise_le    date not null default current_date,
  legende     text,
  ajoute_par  uuid default auth.uid() references auth.users(id) on delete set null,
  ajoute_le   timestamptz not null default now()
);
create index if not exists album_photos_creche_idx on public.album_photos (creche_id, prise_le desc);

create table if not exists public.album_photos_enfants (
  photo_id   uuid not null references public.album_photos(id) on delete cascade,
  enfant_id  uuid not null references public.enfants(id) on delete cascade,
  classe_par uuid default auth.uid() references auth.users(id) on delete set null,
  classe_le  timestamptz not null default now(),
  primary key (photo_id, enfant_id)
);
create index if not exists album_photos_enfants_enfant_idx on public.album_photos_enfants (enfant_id);

create table if not exists public.album_journal (
  id         uuid primary key default gen_random_uuid(),
  creche_id  uuid references public.creches(id) on delete set null,
  user_id    uuid not null default auth.uid() references auth.users(id),
  action     text not null check (action in ('ajout','classement','retrait','suppression','remise')),
  enfant_id  uuid,
  libelle    text,
  nb         integer,
  fait_le    timestamptz not null default now()
);
create index if not exists album_journal_creche_idx on public.album_journal (creche_id, fait_le desc);


-- ============================================================================
-- PARTIE 2 / 4 — Droits sur les tables
-- ============================================================================
alter table public.album_photos          enable row level security;
alter table public.album_photos_enfants  enable row level security;
alter table public.album_journal         enable row level security;

drop policy if exists album_photos_acces on public.album_photos;
create policy album_photos_acces on public.album_photos
  for all to authenticated
  using (public.kk_est_direction() or public.kk_acces_creche(creche_id))
  with check (public.kk_est_direction() or public.kk_acces_creche(creche_id));

drop policy if exists album_photos_enfants_acces on public.album_photos_enfants;
create policy album_photos_enfants_acces on public.album_photos_enfants
  for all to authenticated
  using (exists (select 1 from public.album_photos p
                 where p.id = photo_id
                   and (public.kk_est_direction() or public.kk_acces_creche(p.creche_id))))
  with check (exists (select 1 from public.album_photos p
                      where p.id = photo_id
                        and (public.kk_est_direction() or public.kk_acces_creche(p.creche_id))));

drop policy if exists album_journal_insert on public.album_journal;
create policy album_journal_insert on public.album_journal
  for insert to authenticated
  with check (user_id = auth.uid()
              and (creche_id is null or public.kk_est_direction() or public.kk_acces_creche(creche_id)));

drop policy if exists album_journal_lecture on public.album_journal;
create policy album_journal_lecture on public.album_journal
  for select to authenticated
  using (public.kk_est_direction());


-- ============================================================================
-- PARTIE 3 / 4 — Bucket privé « album » (dossier = identifiant de la crèche)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('album', 'album', false)
on conflict (id) do update set public = false;

create or replace function public.kk_acces_album(p_dossier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.kk_est_direction()
    or (p_dossier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.kk_acces_creche(p_dossier::uuid));
$$;

drop policy if exists album_select on storage.objects;
drop policy if exists album_insert on storage.objects;
drop policy if exists album_delete on storage.objects;

create policy album_select on storage.objects
  for select to authenticated
  using (bucket_id = 'album' and public.kk_acces_album((storage.foldername(storage.objects.name))[1]));
create policy album_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'album' and public.kk_acces_album((storage.foldername(storage.objects.name))[1]));
create policy album_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'album' and public.kk_acces_album((storage.foldername(storage.objects.name))[1]));


-- ============================================================================
-- PARTIE 4 / 4 — Vérification (lecture seule)
-- ============================================================================
-- select count(*) from public.album_photos;
-- select policyname from pg_policies where tablename in ('album_photos','album_photos_enfants','album_journal');
-- select id, public from storage.buckets where id = 'album';

-- ============================================================================
-- Annulation complète (supprime aussi les liens ; les fichiers du bucket
-- se vident à part, dans Storage) :
--   drop table if exists public.album_journal, public.album_photos_enfants, public.album_photos cascade;
--   drop policy if exists album_select on storage.objects;
--   drop policy if exists album_insert on storage.objects;
--   drop policy if exists album_delete on storage.objects;
--   drop function if exists public.kk_acces_album(text);
-- ============================================================================
