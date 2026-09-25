-- ============================================================================
-- Fichier original du menu (impression pour les familles)
-- ============================================================================
-- L'import du menu hebdomadaire (MCM > Menus) ne conservait jusqu'ici que les
-- données extraites du fichier Excel du traiteur (une ligne par jour dans
-- `menus_semaine`). On garde en plus le fichier original tel quel, dans le
-- bucket public `menus-repas`, pour pouvoir le réouvrir et l'imprimer — c'est
-- ce document, avec la mise en page du traiteur, qui est affiché aux
-- familles, pas le tableau reconstruit par l'appli.
--
-- `fichier_path` : chemin de l'objet dans le bucket `menus-repas`
--   (<timestamp>_<nom original>.<ext>, voir handleImportMenusFile).
-- `fichier_nom` : nom du fichier tel qu'importé, pour l'affichage.
-- Un même fichier (un onglet Excel par semaine) est référencé par toutes les
-- semaines qu'il contient : plusieurs lignes de `menus_semaine` peuvent donc
-- partager le même `fichier_path`.
-- ============================================================================

alter table public.menus_semaine
  add column if not exists fichier_path text,
  add column if not exists fichier_nom text;

-- Bucket public : le menu n'est pas une donnée sensible, il est affiché aux
-- familles ; pas besoin d'URL signée pour l'imprimer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menus-repas', 'menus-repas', true, 15728640,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

create policy menus_repas_select on storage.objects
  for select to authenticated
  using (bucket_id = 'menus-repas');

create policy menus_repas_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menus-repas'
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy menus_repas_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'menus-repas'
    and exists (select 1 from public.referents r where r.user_id = auth.uid())
  );
