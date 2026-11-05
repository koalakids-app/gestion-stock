-- ============================================================================
-- Album photos, étape 2 : tri automatique par reconnaissance du visage
-- ============================================================================
-- Circuit fermé : le calcul se fait dans le navigateur (bibliothèque et modèles
-- hébergés dans le dépôt, dossier vendor/face-api). Aucune photo ne part vers un
-- service extérieur. Seule l'EMPREINTE d'un visage de référence (128 nombres, pas
-- une image) est enregistrée, et seulement pour un enfant dont les parents ont
-- donné un accord DISTINCT du droit à l'image. Les visages des autres enfants
-- présents sur une photo ne sont jamais enregistrés (calcul éphémère).
--
-- Désactivé par défaut : la direction l'active crèche par crèche
-- (creches.tri_visage), une fois le traitement inscrit au registre RGPD et le
-- texte d'accord validé par le DPO.
--
-- À appliquer après sql/album_photos.sql, UNE PARTIE À LA FOIS. Chaque partie est
-- idempotente. Annulation : fin du fichier.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 4 — Colonnes et tables
-- ============================================================================
alter table public.creches add column if not exists tri_visage boolean not null default false;
alter table public.creches add column if not exists tri_visage_seuil smallint not null default 90;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creches_tri_visage_seuil_check') then
    alter table public.creches
      add constraint creches_tri_visage_seuil_check check (tri_visage_seuil between 50 and 99);
  end if;
end $$;

-- photo déjà analysée (évite de recalculer) et nombre de visages détectés
alter table public.album_photos add column if not exists tri_le timestamptz;
alter table public.album_photos add column if not exists tri_visages smallint;

-- une ligne = accord des parents pour le tri par visage de cet enfant
create table if not exists public.album_visages_accord (
  enfant_id uuid primary key references public.enfants(id) on delete cascade,
  creche_id uuid not null references public.creches(id) on delete cascade,
  accord_le timestamptz not null default now(),
  accord_par uuid default auth.uid() references auth.users(id) on delete set null
);

-- empreintes de référence (128 nombres), jamais l'image
create table if not exists public.album_references (
  id         uuid primary key default gen_random_uuid(),
  enfant_id  uuid not null references public.enfants(id) on delete cascade,
  creche_id  uuid not null references public.creches(id) on delete cascade,
  descripteur real[] not null check (array_length(descripteur, 1) = 128),
  ajoute_par uuid default auth.uid() references auth.users(id) on delete set null,
  ajoute_le  timestamptz not null default now()
);
create index if not exists album_references_enfant_idx on public.album_references (enfant_id);

-- propositions du tri, en attente de validation par une personne
create table if not exists public.album_propositions (
  photo_id  uuid not null references public.album_photos(id) on delete cascade,
  enfant_id uuid not null references public.enfants(id) on delete cascade,
  score     smallint not null check (score between 0 and 100),
  calcule_le timestamptz not null default now(),
  primary key (photo_id, enfant_id)
);

-- le retrait de l'accord efface les références et les propositions de l'enfant
create or replace function public.kk_album_retrait_accord()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.album_references  where enfant_id = old.enfant_id;
  delete from public.album_propositions where enfant_id = old.enfant_id;
  return old;
end;
$$;
drop trigger if exists album_retrait_accord on public.album_visages_accord;
create trigger album_retrait_accord
  after delete on public.album_visages_accord
  for each row execute function public.kk_album_retrait_accord();

-- nouvelles actions au journal
alter table public.album_journal drop constraint if exists album_journal_action_check;
alter table public.album_journal add constraint album_journal_action_check
  check (action in ('ajout','classement','retrait','suppression','remise',
                    'tri_visage','reference','accord','accord_retire'));


-- ============================================================================
-- PARTIE 2 / 4 — Droits (direction : tout ; référent·e : sa crèche)
-- ============================================================================
alter table public.album_visages_accord enable row level security;
alter table public.album_references     enable row level security;
alter table public.album_propositions   enable row level security;

drop policy if exists album_visages_accord_acces on public.album_visages_accord;
create policy album_visages_accord_acces on public.album_visages_accord
  for all to authenticated
  using (public.kk_est_direction() or public.kk_acces_creche(creche_id))
  with check (public.kk_est_direction() or public.kk_acces_creche(creche_id));

drop policy if exists album_references_lecture on public.album_references;
create policy album_references_lecture on public.album_references
  for select to authenticated
  using (public.kk_est_direction() or public.kk_acces_creche(creche_id));

-- une référence n'est acceptée que si l'accord de l'enfant existe
drop policy if exists album_references_ajout on public.album_references;
create policy album_references_ajout on public.album_references
  for insert to authenticated
  with check ((public.kk_est_direction() or public.kk_acces_creche(creche_id))
              and exists (select 1 from public.album_visages_accord a where a.enfant_id = album_references.enfant_id));

drop policy if exists album_references_suppression on public.album_references;
create policy album_references_suppression on public.album_references
  for delete to authenticated
  using (public.kk_est_direction() or public.kk_acces_creche(creche_id));

drop policy if exists album_propositions_acces on public.album_propositions;
create policy album_propositions_acces on public.album_propositions
  for all to authenticated
  using (exists (select 1 from public.album_photos p
                 where p.id = photo_id
                   and (public.kk_est_direction() or public.kk_acces_creche(p.creche_id))))
  with check (exists (select 1 from public.album_photos p
                      where p.id = photo_id
                        and (public.kk_est_direction() or public.kk_acces_creche(p.creche_id))));


-- ============================================================================
-- PARTIE 3 / 4 — Seule la direction active ou règle le tri par visage
-- ============================================================================
-- Le réglage passe par une fonction : un·e référent·e ne peut pas modifier la
-- colonne creches.tri_visage par une écriture directe.
create or replace function public.kk_album_reglage_visage(p_creche uuid, p_actif boolean, p_seuil smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.kk_est_direction() then
    raise exception 'Réservé à la direction';
  end if;
  update public.creches
     set tri_visage = coalesce(p_actif, tri_visage),
         tri_visage_seuil = coalesce(p_seuil, tri_visage_seuil)
   where id = p_creche;
end;
$$;
revoke all on function public.kk_album_reglage_visage(uuid, boolean, smallint) from public;
grant execute on function public.kk_album_reglage_visage(uuid, boolean, smallint) to authenticated;


-- ============================================================================
-- PARTIE 4 / 4 — Vérification (lecture seule)
-- ============================================================================
-- select id, name, tri_visage, tri_visage_seuil from public.creches;
-- select count(*) from public.album_visages_accord;
-- select policyname from pg_policies where tablename in ('album_visages_accord','album_references','album_propositions');

-- ============================================================================
-- Annulation complète :
--   drop table if exists public.album_propositions, public.album_references, public.album_visages_accord cascade;
--   drop function if exists public.kk_album_retrait_accord();
--   drop function if exists public.kk_album_reglage_visage(uuid, boolean, smallint);
--   alter table public.album_photos drop column if exists tri_le, drop column if exists tri_visages;
--   alter table public.creches drop column if exists tri_visage, drop column if exists tri_visage_seuil;
-- ============================================================================
