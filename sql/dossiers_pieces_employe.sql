-- ============================================================================
-- Dossier de pièces d'embauche (envoi d'un lien au salarié pour déposer en
-- ligne les documents demandés à l'embauche)
-- ============================================================================
-- Même principe que `dossiers_pieces` côté famille (sql/dossiers_pieces.sql) :
-- un envoi = un jeton = un lien public (pieces-employe.html), valable 15
-- jours. La page publique ne touche à aucune table directement : tout passe
-- par l'edge function `dossier-pieces-employe`, en service_role (voir
-- README, section "Pages publiques").
--
-- Les fichiers déposés — que ce soit par le/la salarié(e) via ce lien, ou
-- importés directement par une référente — vivent tous dans la table
-- `employes_documents` déjà posée (voir sql/employes_documents.sql), avec
-- une colonne en plus :
--   - dossier_id : via quel envoi le/la salarié(e) l'a déposé ; null pour un
--                  import fait directement par une référente.
-- (piece_key existe déjà sur employes_documents.)
-- ============================================================================

create table if not exists public.dossiers_pieces_employe (
  id         uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employes(id) on delete cascade,
  token      text not null unique,
  email      text,
  statut     text not null default 'envoye',   -- envoye | annule
  envoye_le  timestamptz not null default now(),
  expire_le  timestamptz not null,
  relances   int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists dossiers_pieces_employe_employe_id_idx
  on public.dossiers_pieces_employe (employe_id);

alter table public.employes_documents
  add column if not exists dossier_id uuid references public.dossiers_pieces_employe(id) on delete set null;

alter table public.dossiers_pieces_employe enable row level security;

-- Même portée que la fiche employé elle-même : direction = tout, référente
-- = sa crèche uniquement. Le/la salarié(e) n'a pas besoin d'un compte pour
-- déposer ses pièces : le lien public passe par l'edge function
-- `dossier-pieces-employe` en service_role, qui contourne RLS — aucune
-- policy `anon` n'est nécessaire ni souhaitable ici.
create policy dossiers_pieces_employe_select on public.dossiers_pieces_employe
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.employes e on e.id = dossiers_pieces_employe.employe_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy dossiers_pieces_employe_insert on public.dossiers_pieces_employe
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      join public.employes e on e.id = dossiers_pieces_employe.employe_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy dossiers_pieces_employe_update on public.dossiers_pieces_employe
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.employes e on e.id = dossiers_pieces_employe.employe_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      join public.employes e on e.id = dossiers_pieces_employe.employe_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
