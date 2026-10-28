-- ============================================================================
-- « Masquer pour moi » dans le suivi des actions de direction
-- ============================================================================
-- Supprimer une action (bouton corbeille) l'efface pour tout le monde, y compris
-- la personne concernée. Pour la sortir de SA vue sans toucher à l'action, on
-- ajoute une ligne ici : l'action reste intacte (statut, responsable, comptes
-- rendus) et disparaît seulement de la liste, des compteurs et de la revue de la
-- personne qui l'a masquée. Elle la retrouve dans le filtre « Masquées ».
--
-- Même principe que demandes_masquees : une ligne par personne et par action,
-- RLS limitée à son propre auth.uid(). À appliquer à la main sur Supabase.
-- ============================================================================

create table if not exists public.actions_direction_masquees (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions_direction(id) on delete cascade,
  masque_par uuid not null references auth.users(id) on delete cascade,
  masque_at timestamptz not null default now(),
  constraint actions_direction_masquees_une_par_personne unique (action_id, masque_par)
);

create index if not exists actions_direction_masquees_personne_idx
  on public.actions_direction_masquees (masque_par);

alter table public.actions_direction_masquees enable row level security;

create policy actions_direction_masquees_select on public.actions_direction_masquees
  for select to authenticated
  using (masque_par = auth.uid());

create policy actions_direction_masquees_insert on public.actions_direction_masquees
  for insert to authenticated
  with check (masque_par = auth.uid() and public.kk_est_direction());

create policy actions_direction_masquees_delete on public.actions_direction_masquees
  for delete to authenticated
  using (masque_par = auth.uid());
