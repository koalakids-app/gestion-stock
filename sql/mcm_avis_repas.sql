-- ============================================================================
-- Avis des enfants sur les plats du prestataire repas (MCM)
-- ============================================================================
-- Permet à l'équipe de noter, plat par plat et par crèche, si les enfants ont
-- apprécié ou non un plat du menu importé dans `menus_semaine` — pour repérer
-- ce qui plaît ou revient souvent en reste, et en discuter avec MCM.
-- Une ligne par (semaine, jour, crèche, profil traiteur, plat). `profil` ne
-- couvre que « bb18 » et « grand » : les bébés de moins de 6 mois (bb6) ne
-- sont pas concernés, ils n'expriment pas de préférence alimentaire.
-- `plat` reprend le texte exact du plat tel qu'importé (une ligne de
-- `menus_semaine.bb18`/`grand`), ce qui permet de retrouver le même plat
-- s'il revient une autre semaine.
-- ============================================================================

create table if not exists public.mcm_avis_repas (
  id            uuid primary key default gen_random_uuid(),
  date_debut    date not null,
  jour          smallint not null check (jour between 1 and 5),
  creche_id     uuid not null references public.creches(id) on delete cascade,
  profil        text not null check (profil in ('bb18','grand')),
  plat          text not null,
  appreciation  text not null check (appreciation in ('aime','neutre','naime_pas')),
  commentaire   text,
  referent_id   uuid references public.referents(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (date_debut, jour, creche_id, profil, plat)
);

create index if not exists mcm_avis_repas_date_debut_idx
  on public.mcm_avis_repas (date_debut);

create index if not exists mcm_avis_repas_plat_idx
  on public.mcm_avis_repas (plat);

alter table public.mcm_avis_repas enable row level security;

-- Lecture ouverte à tout référent authentifié, direction comme directeur/trice
-- technique : la synthèse des avis (tous plats confondus) a besoin de voir
-- toutes les crèches, même principe que `menus_semaine`.
create policy mcm_avis_repas_select on public.mcm_avis_repas
  for select to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy mcm_avis_repas_insert on public.mcm_avis_repas
  for insert to authenticated
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy mcm_avis_repas_update on public.mcm_avis_repas
  for update to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy mcm_avis_repas_delete on public.mcm_avis_repas
  for delete to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );
