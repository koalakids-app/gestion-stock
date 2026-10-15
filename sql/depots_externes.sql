-- ============================================================================
-- Documents déposés par une famille ou une stagiaire (liens pieces.html /
-- stagiaire.html) : file d'attente « à regarder » pour la référente.
-- ============================================================================
-- Les edge functions dossier-pieces et dossier-stagiaire (service_role) ajoutent
-- une ligne à chaque dépôt, puis préviennent par notification push la
-- référente de la crèche. « Ma journée » et « Mon tableau de bord » listent les
-- lignes dont vu_le est nul ; ouvrir la fiche (ou cliquer la ligne) les marque
-- comme vues. Les fichiers eux-mêmes restent dans leurs tables d'origine
-- (enfants_documents_admin, stagiaires_documents).
-- ============================================================================

create table if not exists public.depots_externes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid,
  creche_id     uuid,
  source        text not null check (source in ('enfant','stagiaire')),
  enfant_id     uuid,
  stagiaire_id  uuid,
  libelle       text,
  depose_le     timestamptz not null default now(),
  vu_le         timestamptz,
  vu_par        uuid
);

create index if not exists depots_externes_non_vus_idx
  on public.depots_externes (creche_id, depose_le) where vu_le is null;

alter table public.depots_externes enable row level security;

-- Direction (referents.creche_id nul) = toute son organisation ; directrice
-- technique = sa crèche. Pas d'insertion ni de suppression depuis le front :
-- seules les edge functions (service_role) écrivent.
drop policy if exists depots_externes_select on public.depots_externes;
create policy depots_externes_select on public.depots_externes
  for select to authenticated
  using (
    org_id = public.kk_mon_org()
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = depots_externes.creche_id)
    )
  );

drop policy if exists depots_externes_update on public.depots_externes;
create policy depots_externes_update on public.depots_externes
  for update to authenticated
  using (
    org_id = public.kk_mon_org()
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = depots_externes.creche_id)
    )
  )
  with check (
    org_id = public.kk_mon_org()
    and exists (
      select 1 from public.referents r
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = depots_externes.creche_id)
    )
  );

-- Dossier de pièces administratives : date de la dernière relance, pour ne pas
-- reproposer « à relancer » le jour même (même règle que dossiers_familles).
alter table public.dossiers_pieces
  add column if not exists derniere_relance timestamptz;
