-- ============================================================================
-- Annuaire des partenaires et institutions (CAF, PMI, prestataire repas MCM...)
-- ============================================================================
-- Carnet d'adresses des organismes avec lesquels le réseau travaille : nom,
-- catégorie, contact, téléphone, e-mail, adresse, notes libres.
--
-- `creche_id` nullable : vide = concerne tout le réseau (CAF, PMI...),
-- renseigné = contact propre à une seule crèche. Les deux cas sont mélangés
-- dans le même annuaire, avec un badge distinguant les entrées réseau.
--
-- Accès en lecture et en écriture ouvert à toute personne authentifiée ayant
-- une fiche referents (direction ou directrice technique) — un annuaire de
-- contacts partagé n'a pas besoin d'un cloisonnement aussi strict que les
-- données d'un enfant ou d'un salarié.
-- ============================================================================

create table if not exists public.partenaires (
  id           uuid primary key default gen_random_uuid(),
  creche_id    uuid references public.creches(id) on delete cascade,
  categorie    text not null default 'Autre',
  nom          text not null,
  contact_nom  text,
  telephone    text,
  email        text,
  adresse      text,
  notes        text,
  ordre        int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create index if not exists partenaires_creche_id_idx
  on public.partenaires (creche_id);

alter table public.partenaires enable row level security;

create policy partenaires_select on public.partenaires
  for select to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy partenaires_insert on public.partenaires
  for insert to authenticated
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy partenaires_update on public.partenaires
  for update to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );

create policy partenaires_delete on public.partenaires
  for delete to authenticated
  using (
    exists (select 1 from public.referents r where r.user_id = auth.uid())
  );
