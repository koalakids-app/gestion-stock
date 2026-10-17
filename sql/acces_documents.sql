-- ============================================================================
-- Journal des consultations de documents sensibles (« coffre-fort », étape 1)
-- ============================================================================
-- Une ligne à chaque ouverture d'un document des buckets sensibles (pièces
-- administratives, PAI, carnets de vaccination, documents employés et
-- stagiaires, pièces du registre de soins) : qui, quel fichier, quand.
-- Écrit par js/coffre-journal.js au moment où le lien signé est demandé.
-- Immuable : pas de policy update/delete. Lecture réservée à la direction.
-- À appliquer à la main sur Supabase.
-- ============================================================================

create table if not exists public.acces_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id),
  bucket      text not null,
  chemin      text not null,
  entite_type text check (entite_type in ('enfant','employe','stagiaire')),
  entite_id   uuid,
  creche_id   uuid references public.creches(id),
  libelle     text,
  ouvert_le   timestamptz not null default now()
);

create index if not exists acces_documents_ouvert_idx
  on public.acces_documents (ouvert_le desc);
create index if not exists acces_documents_entite_idx
  on public.acces_documents (entite_type, entite_id);

-- La crèche se déduit de la fiche : le client n'a pas à (et ne peut pas) la
-- falsifier.
create or replace function public.kk_acces_documents_creche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  if new.entite_type = 'enfant' then
    select creche_id into new.creche_id from public.enfants where id = new.entite_id;
  elsif new.entite_type = 'employe' then
    select creche_id into new.creche_id from public.employes where id = new.entite_id;
  elsif new.entite_type = 'stagiaire' then
    select creche_id into new.creche_id from public.stagiaires where id = new.entite_id;
  end if;
  return new;
end;
$$;

drop trigger if exists acces_documents_creche on public.acces_documents;
create trigger acces_documents_creche
  before insert on public.acces_documents
  for each row execute function public.kk_acces_documents_creche();

alter table public.acces_documents enable row level security;

drop policy if exists acces_documents_insert on public.acces_documents;
create policy acces_documents_insert on public.acces_documents
  for insert to authenticated
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

drop policy if exists acces_documents_select on public.acces_documents;
create policy acces_documents_select on public.acces_documents
  for select to authenticated
  using (public.kk_est_direction());
