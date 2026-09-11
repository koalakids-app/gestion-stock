-- ============================================================================
-- Documents administratifs importés (fiche enfant, onglet Documents)
-- ============================================================================
-- Distinct des formulaires remplis/signés via l'outil Documents
-- (`documents_reponses`) et du carnet de vaccination (`vaccins_pj`, données de
-- santé) : ce sont des pièces libres qu'une référente dépose directement —
-- pièce d'identité, justificatif de domicile, attestation CAF, etc.
--
-- Même convention que `vaccins_pj` : bucket Storage PRIVÉ, aucune URL publique
-- enregistrée. On ne garde que le bucket et le chemin de l'objet ; chaque
-- ouverture demande à Supabase une URL signée valable quelques minutes.
--
-- Étape manuelle requise, en dehors de ce script : créer le bucket Storage
-- PRIVÉ `documents-admin` dans le dashboard Supabase (Storage → New bucket,
-- Public = off), avec des policies calquées sur celles du bucket `carnets`.
-- ============================================================================

create table if not exists public.enfants_documents_admin (
  id         uuid primary key default gen_random_uuid(),
  enfant_id  uuid not null references public.enfants(id) on delete cascade,
  bucket     text not null,
  path       text not null,
  filename   text,
  created_at timestamptz not null default now()
);

create index if not exists enfants_documents_admin_enfant_id_idx
  on public.enfants_documents_admin (enfant_id);

alter table public.enfants_documents_admin enable row level security;

-- Même portée que les autres tables liées à un enfant : direction = tout,
-- référente = sa crèche uniquement, jamais d'accès anonyme.
create policy enfants_documents_admin_select on public.enfants_documents_admin
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_documents_admin.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy enfants_documents_admin_insert on public.enfants_documents_admin
  for insert to authenticated
  with check (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_documents_admin.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );

create policy enfants_documents_admin_delete on public.enfants_documents_admin
  for delete to authenticated
  using (
    exists (
      select 1 from public.referents r
      join public.enfants e on e.id = enfants_documents_admin.enfant_id
      where r.user_id = auth.uid()
        and (r.creche_id is null or r.creche_id = e.creche_id)
    )
  );
