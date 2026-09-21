-- ============================================================================
-- Documents d'embauche importés (fiche collaborateur/trice, employes.html)
-- ============================================================================
-- Pièces liées à l'embauche d'un(e) collaborateur/trice (CNI, RIB, diplômes,
-- carte vitale, justificatif de domicile, extrait de casier judiciaire...),
-- distinctes des colonnes ajoutées par employes_contrat_travail.sql (état
-- civil et contrat de travail saisis en texte, sans pièce jointe).
--
-- Même convention que enfants_documents_admin / vaccins_pj : bucket Storage
-- PRIVÉ, aucune URL publique enregistrée. On ne garde que le bucket et le
-- chemin de l'objet ; chaque ouverture demande à Supabase une URL signée
-- valable quelques minutes.
--
-- Étape manuelle requise, en dehors de ce script : créer le bucket Storage
-- PRIVÉ `documents-employes` dans le dashboard Supabase (Storage → New
-- bucket, Public = off), avec des policies calquées sur celles du bucket
-- `documents-admin`.
-- ============================================================================

create table if not exists public.employes_documents (
  id         uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employes(id) on delete cascade,
  bucket     text not null,
  path       text not null,
  filename   text,
  piece_key  text,
  created_at timestamptz not null default now()
);

create index if not exists employes_documents_employe_id_idx
  on public.employes_documents (employe_id);

alter table public.employes_documents enable row level security;

-- Même portée que la fiche employé elle-même : direction = tout, référente
-- = sa crèche uniquement, jamais d'accès anonyme.
create policy employes_documents_select on public.employes_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.employes e on e.id = employes_documents.employe_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy employes_documents_insert on public.employes_documents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      join public.employes e on e.id = employes_documents.employe_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy employes_documents_delete on public.employes_documents
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.employes e on e.id = employes_documents.employe_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
