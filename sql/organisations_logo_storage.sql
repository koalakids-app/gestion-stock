-- ============================================================================
-- Logo de l'organisation : bucket public + droits d'écriture pour la direction
--
-- Permet à la direction de téléverser le logo de son organisation depuis
-- Paramètres > Le réseau (js/pages/parametres.js). Le chemin de l'URL publique
-- est enregistré dans organisations.logo_url, puis appliqué par js/branding.js
-- sur tous les éléments [data-branding-logo].
--
-- Bucket PUBLIC en lecture (le logo figure aussi sur des pages sans session :
-- devis, contrats, dépôt de pièces). Écriture limitée à la direction, et
-- uniquement dans le dossier <org_id>/ de sa propre organisation.
-- À exécuter une fois sur le projet Supabase de l'application.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos-organisations', 'logos-organisations', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_organisations_insert on storage.objects;
create policy logos_organisations_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos-organisations'
    and public.kk_est_direction()
    and (storage.foldername(name))[1] = public.kk_mon_org()::text
  );

drop policy if exists logos_organisations_update on storage.objects;
create policy logos_organisations_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos-organisations'
    and public.kk_est_direction()
    and (storage.foldername(name))[1] = public.kk_mon_org()::text
  );

drop policy if exists logos_organisations_delete on storage.objects;
create policy logos_organisations_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos-organisations'
    and public.kk_est_direction()
    and (storage.foldername(name))[1] = public.kk_mon_org()::text
  );

-- La direction peut modifier la ligne de SA organisation (logo, et plus tard
-- couleurs/nom). La lecture reste couverte par organisations_select.
alter table public.organisations enable row level security;

drop policy if exists organisations_update_direction on public.organisations;
create policy organisations_update_direction on public.organisations
  for update to authenticated
  using (id = public.kk_mon_org() and public.kk_est_direction())
  with check (id = public.kk_mon_org() and public.kk_est_direction());
