-- ============================================================================
-- Brouillons de consignes (Demandes & consignes)
-- ============================================================================
-- La direction prépare une consigne, l'enregistre en brouillon et l'envoie plus
-- tard. Les brouillons sont volontairement dans une table à part : une ligne de
-- `demandes` de type « consigne » est visible de tous les directeurs/trices
-- techniques dès sa création. Ici, chaque brouillon n'est lisible que par son
-- auteur, et uniquement s'il fait partie de la direction.
-- ============================================================================

create table if not exists public.consignes_brouillons (
  id uuid primary key default gen_random_uuid(),
  subject text,
  description text,
  priority text not null default 'normal',
  attachment_url text,
  attachment_name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consignes_brouillons_auteur_idx
  on public.consignes_brouillons (created_by, updated_at desc);

alter table public.consignes_brouillons enable row level security;

create policy consignes_brouillons_select on public.consignes_brouillons
  for select to authenticated
  using (
    created_by = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid() and r.role = 'direction')
  );

create policy consignes_brouillons_insert on public.consignes_brouillons
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid() and r.role = 'direction')
  );

create policy consignes_brouillons_update on public.consignes_brouillons
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy consignes_brouillons_delete on public.consignes_brouillons
  for delete to authenticated
  using (created_by = auth.uid());
