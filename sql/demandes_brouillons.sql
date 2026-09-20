-- ============================================================================
-- Brouillons de demandes (Demandes & consignes)
-- ============================================================================
-- Chacun (direction ou directeur/trice technique) prépare une demande, l'enregistre
-- en brouillon et l'envoie plus tard. Table à part : une ligne de `demandes` est
-- visible du destinataire dès sa création. Chaque brouillon n'est lisible que par
-- son auteur.
-- Les destinataires cochés sont gardés dans `destinataires` (tableau d'ids de
-- referents) : à l'envoi, l'application crée une demande par destinataire.
-- ============================================================================

create table if not exists public.demandes_brouillons (
  id uuid primary key default gen_random_uuid(),
  creche_id uuid references public.creches(id) on delete set null,
  destinataires jsonb not null default '[]'::jsonb,
  email text,
  subject text,
  description text,
  priority text not null default 'normal',
  theme text,
  attachment_url text,
  attachment_name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demandes_brouillons_auteur_idx
  on public.demandes_brouillons (created_by, updated_at desc);

alter table public.demandes_brouillons enable row level security;

create policy demandes_brouillons_select on public.demandes_brouillons
  for select to authenticated
  using (
    created_by = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy demandes_brouillons_insert on public.demandes_brouillons
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy demandes_brouillons_update on public.demandes_brouillons
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy demandes_brouillons_delete on public.demandes_brouillons
  for delete to authenticated
  using (created_by = auth.uid());
