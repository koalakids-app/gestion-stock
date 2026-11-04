-- ============================================================================
-- Espace famille : documents PDF mis à disposition (devis, contrat signé)
-- ============================================================================
-- Le devis et le contrat sont dessinés en PDF dans le navigateur de la crèche (jsPDF) : rien
-- n'était conservé. Au moment de l'envoi du devis / de la contresignature du contrat, la crèche
-- dépose aussi une copie dans le bucket privé `famille-docs` et l'indexe ici. L'edge function
-- `espace-famille` (service_role) retrouve ceux de l'enfant :
--   - type 'contrat' : source_id = contrats.id        (enfant = contrats.enfant_id)
--   - type 'devis'   : source_id = devis.id           (enfant = contrat de l'enfant dont devis_id = source_id)
-- et signe l'ouverture (URL de 2 minutes). La famille ne lit jamais la table ni le bucket.
-- À appliquer à la main (une partie à la fois si l'éditeur expire), après espace_famille.sql.
-- ============================================================================

create table if not exists public.famille_documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid default public.kk_mon_org(),
  creche_id   uuid not null references public.creches(id),
  type        text not null check (type in ('devis', 'contrat')),
  source_id   uuid not null,
  titre       text not null,
  path        text not null,
  publie_le   timestamptz not null default now(),
  publie_par  uuid references public.referents(id),
  unique (type, source_id)
);
create index if not exists famille_documents_creche_idx on public.famille_documents (creche_id);

alter table public.famille_documents enable row level security;

drop policy if exists famille_documents_select on public.famille_documents;
create policy famille_documents_select on public.famille_documents
  for select to authenticated using (public.kk_acces_creche(creche_id));
drop policy if exists famille_documents_insert on public.famille_documents;
create policy famille_documents_insert on public.famille_documents
  for insert to authenticated with check (public.kk_acces_creche(creche_id));
drop policy if exists famille_documents_update on public.famille_documents;
create policy famille_documents_update on public.famille_documents
  for update to authenticated using (public.kk_acces_creche(creche_id)) with check (public.kk_acces_creche(creche_id));
drop policy if exists famille_documents_delete on public.famille_documents;
create policy famille_documents_delete on public.famille_documents
  for delete to authenticated using (public.kk_acces_creche(creche_id));
grant select, insert, update, delete on public.famille_documents to authenticated;

-- Bucket privé : <creche_id>/<type>-<id>.pdf ; accès limité à la crèche du référent (direction : tout).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('famille-docs', 'famille-docs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists famille_docs_select on storage.objects;
create policy famille_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'famille-docs' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.kk_acces_creche(((storage.foldername(name))[1])::uuid));
drop policy if exists famille_docs_insert on storage.objects;
create policy famille_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'famille-docs' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.kk_acces_creche(((storage.foldername(name))[1])::uuid));
drop policy if exists famille_docs_update on storage.objects;
create policy famille_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'famille-docs' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.kk_acces_creche(((storage.foldername(name))[1])::uuid));
drop policy if exists famille_docs_delete on storage.objects;
create policy famille_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'famille-docs' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.kk_acces_creche(((storage.foldername(name))[1])::uuid));

select (select count(*) from pg_policies where schemaname='public' and tablename='famille_documents') as policies_table,
       (select count(*) from pg_policies where schemaname='storage' and policyname like 'famille_docs_%') as policies_bucket;
