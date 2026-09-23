-- ============================================================================
-- Journal immuable des purges de dossiers enfant/employé
-- ============================================================================
-- Distinct de enfants.archive_le/employes.archive_le : l'archivage sort un
-- dossier des vues actives et reste réversible. La purge, elle, anonymise/
-- supprime les données au-delà du délai légal — geste rare et définitif, dont
-- la preuve doit survivre même une fois la fiche anonymisée. Pas de policy
-- update/delete : personne ne peut modifier ou effacer une ligne une fois
-- écrite.
-- ============================================================================

create table if not exists public.archivage_purges (
  id           uuid primary key default gen_random_uuid(),
  entite_type  text not null check (entite_type in ('enfant','employe')),
  entite_id    uuid not null,
  creche_id    uuid references public.creches(id),
  annee_sortie int,
  purge_le     timestamptz not null default now(),
  purge_par    uuid references auth.users(id),
  motif        text,
  created_at   timestamptz not null default now()
);

create index if not exists archivage_purges_entite_idx
  on public.archivage_purges (entite_type, entite_id);

alter table public.archivage_purges enable row level security;

create policy archivage_purges_select on public.archivage_purges
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = archivage_purges.creche_id)
    )
  );

create policy archivage_purges_insert on public.archivage_purges
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = archivage_purges.creche_id)
    )
  );
