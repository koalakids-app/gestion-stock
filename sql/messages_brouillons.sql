-- ============================================================================
-- Brouillons de messages (fil de discussion d'une demande)
-- ============================================================================
-- Un brouillon par fil et par personne : on prépare une réponse, on la garde, on
-- l'envoie plus tard. Table à part : une ligne de `messages` est lue de l'autre
-- partie dès sa création. Chaque brouillon n'est lisible que par son auteur.
-- ============================================================================

create table if not exists public.messages_brouillons (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes(id) on delete cascade,
  body text,
  attachment_url text,
  attachment_name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_brouillons_un_par_fil unique (demande_id, created_by)
);

alter table public.messages_brouillons enable row level security;

create policy messages_brouillons_select on public.messages_brouillons
  for select to authenticated
  using (
    created_by = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy messages_brouillons_insert on public.messages_brouillons
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy messages_brouillons_update on public.messages_brouillons
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy messages_brouillons_delete on public.messages_brouillons
  for delete to authenticated
  using (created_by = auth.uid());
