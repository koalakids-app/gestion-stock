-- ============================================================================
-- Notes libres / pense-bête (demandes.html)
-- ============================================================================
-- Un espace de prise de notes personnelles, distinct du module « À faire » :
-- ici on note des choses à se rappeler, sans notion de tâche à cocher, de
-- date ou de priorité. Chaque note n'est lisible et modifiable que par son
-- auteur.
-- ============================================================================

create table if not exists public.notes_libres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titre text,
  contenu text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_libres_auteur_idx
  on public.notes_libres (user_id, updated_at desc);

alter table public.notes_libres enable row level security;

create policy notes_libres_select on public.notes_libres
  for select to authenticated
  using (user_id = auth.uid());

create policy notes_libres_insert on public.notes_libres
  for insert to authenticated
  with check (user_id = auth.uid());

create policy notes_libres_update on public.notes_libres
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notes_libres_delete on public.notes_libres
  for delete to authenticated
  using (user_id = auth.uid());
