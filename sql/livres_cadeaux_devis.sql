-- ============================================================================
-- Livres cadeaux — devis du libraire, une ou plusieurs pièces jointes par crèche
-- ============================================================================
-- Demandes › Enfants & suivi › Livres cadeaux (js/pages/demandes/25-livres-cadeaux.js).
-- Table `livres_cadeaux_devis` (une ligne par fichier : nom, montant TTC facultatif)
-- et bucket privé `livres-devis` (chemin `<creche_id>/<horodatage>-<nom>`).
-- Lecture : direction (toutes les crèches) et référent·e de la crèche (kk_acces_creche).
-- Écriture : direction seule.
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb). Idempotent.
-- ============================================================================
create table if not exists public.livres_cadeaux_devis (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.kk_mon_org(),
  creche_id   uuid not null references public.creches(id) on delete cascade,
  fichier_path text not null,
  fichier_nom  text not null,
  montant     numeric check (montant is null or (montant >= 0 and montant <= 1000000)),
  created_at  timestamptz not null default now()
);
create index if not exists livres_cadeaux_devis_creche_idx on public.livres_cadeaux_devis(creche_id);
alter table public.livres_cadeaux_devis enable row level security;

drop policy if exists livres_cadeaux_devis_lecture on public.livres_cadeaux_devis;
create policy livres_cadeaux_devis_lecture on public.livres_cadeaux_devis
  for select to authenticated
  using (org_id = (select public.kk_mon_org()) and public.kk_acces_creche(creche_id));

drop policy if exists livres_cadeaux_devis_ecriture on public.livres_cadeaux_devis;
create policy livres_cadeaux_devis_ecriture on public.livres_cadeaux_devis
  for all to authenticated
  using (org_id = (select public.kk_mon_org()) and public.kk_est_direction())
  with check (org_id = (select public.kk_mon_org()) and public.kk_est_direction());

insert into storage.buckets (id, name, public, file_size_limit)
values ('livres-devis', 'livres-devis', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists livres_devis_select on storage.objects;
create policy livres_devis_select on storage.objects
  for select to authenticated
  using (bucket_id = 'livres-devis'
         and public.kk_acces_creche(((storage.foldername(name))[1])::uuid));

drop policy if exists livres_devis_insert on storage.objects;
create policy livres_devis_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'livres-devis' and public.kk_est_direction());

drop policy if exists livres_devis_update on storage.objects;
create policy livres_devis_update on storage.objects
  for update to authenticated
  using (bucket_id = 'livres-devis' and public.kk_est_direction())
  with check (bucket_id = 'livres-devis' and public.kk_est_direction());

drop policy if exists livres_devis_delete on storage.objects;
create policy livres_devis_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'livres-devis' and public.kk_est_direction());

-- Annulation : drop table if exists public.livres_cadeaux_devis;
--              delete from storage.buckets where id = 'livres-devis'; (après avoir vidé le bucket)
