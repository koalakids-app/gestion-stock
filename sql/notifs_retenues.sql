-- ============================================================================
-- notifs_retenues : notifications push reçues pendant la plage de silence
-- ============================================================================
-- Avant : notify-push abandonnait toute notification émise entre 19 h et 8 h
-- (réponse « skipped: silence »), le/la référent·e ne la voyait jamais.
-- Maintenant : la fonction les range ici (une ligne par référent·e) et la page
-- Demandes les livre à la première connexion hors plage de silence
-- (livrerNotifsRetenues, js/pages/demandes/02-…js).
-- À appliquer à la main sur Supabase.
-- ============================================================================

create table if not exists public.notifs_retenues (
  id uuid primary key default gen_random_uuid(),
  referent_id uuid not null references public.referents(id) on delete cascade,
  title text not null,
  body text not null default '',
  url text,
  tag text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists notifs_retenues_a_livrer
  on public.notifs_retenues (referent_id) where delivered_at is null;

alter table public.notifs_retenues enable row level security;

-- Insertion : uniquement par la fonction notify-push (clé service, hors RLS).
-- Lecture et marquage « livré » : chacun·e ne voit que les siennes.
drop policy if exists notifs_retenues_own_select on public.notifs_retenues;
create policy notifs_retenues_own_select on public.notifs_retenues
  for select to authenticated
  using (referent_id in (select id from public.referents where user_id = auth.uid()));

drop policy if exists notifs_retenues_own_update on public.notifs_retenues;
create policy notifs_retenues_own_update on public.notifs_retenues
  for update to authenticated
  using (referent_id in (select id from public.referents where user_id = auth.uid()))
  with check (referent_id in (select id from public.referents where user_id = auth.uid()));
