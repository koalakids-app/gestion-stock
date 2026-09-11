-- ============================================================================
-- Dossier de pièces administratives (envoi d'un lien aux parents pour déposer
-- en ligne les documents administratifs demandés à l'inscription)
-- ============================================================================
-- Même principe que `dossiers_familles` (dossier de familiarisation) : un
-- envoi = un jeton = un lien public (pieces.html), valable 15 jours. La page
-- publique ne touche à aucune table directement : tout passe par l'edge
-- function `dossier-pieces`, en service_role (voir README, section "Pages
-- publiques").
--
-- Les fichiers déposés — que ce soit par la famille via ce lien, ou importés
-- directement par une référente (remise en main propre, pièce jointe reçue
-- par mail) — vivent tous dans la table `enfants_documents_admin` déjà posée
-- (voir sql/enfants_documents_admin.sql), avec deux colonnes en plus :
--   - piece_key  : quelle pièce de la liste PIECES_ADMIN (demandes.html) ceci
--                  satisfait ; null pour un import libre hors liste.
--   - dossier_id : via quel envoi la famille l'a déposée ; null pour un
--                  import fait directement par une référente.
-- ============================================================================

create table if not exists public.dossiers_pieces (
  id         uuid primary key default gen_random_uuid(),
  enfant_id  uuid not null references public.enfants(id) on delete cascade,
  token      text not null unique,
  email      text,
  statut     text not null default 'envoye',   -- envoye | annule
  envoye_le  timestamptz not null default now(),
  expire_le  timestamptz not null,
  relances   int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists dossiers_pieces_enfant_id_idx
  on public.dossiers_pieces (enfant_id);

alter table public.enfants_documents_admin
  add column if not exists piece_key text,
  add column if not exists dossier_id uuid references public.dossiers_pieces(id) on delete set null;

alter table public.dossiers_pieces enable row level security;

-- Même portée que les autres tables liées à un enfant : direction = tout,
-- référente = sa crèche uniquement. La famille n'a pas de compte : le lien
-- public passe par l'edge function `dossier-pieces` en service_role, qui
-- contourne RLS — aucune policy `anon` n'est nécessaire ni souhaitable ici.
create policy dossiers_pieces_select on public.dossiers_pieces
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = dossiers_pieces.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy dossiers_pieces_insert on public.dossiers_pieces
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = dossiers_pieces.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy dossiers_pieces_update on public.dossiers_pieces
  for update to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = dossiers_pieces.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  )
  with check (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = dossiers_pieces.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
