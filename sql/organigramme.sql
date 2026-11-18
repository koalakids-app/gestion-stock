-- ============================================================================
-- Organigramme composé à la main (Demandes › Équipe › Organigramme)
-- ============================================================================
-- Une ligne = une carte de l'organigramme (une personne). Les cartes forment un
-- arbre par crèche (`parent_id`). `creche_id` vide = niveau « réseau »
-- (gestionnaires, coordinateur…) affiché au-dessus des crèches.
--
-- Une carte peut être liée à une fiche (`employe_id` ou `referent_id`) pour
-- pré-remplir nom, poste, diplôme et temps de travail ; les textes restent
-- modifiables sur la carte. Personne n'est obligé d'avoir une fiche (gestionnaire
-- extérieur, personne en cours de recrutement…).
--   heures_hebdo : temps de travail hebdomadaire ; l'ETP est calculé (heures / 35)
--                  sauf si `etp` est renseigné à la main.
--   note         : texte libre (« + 2 ans d'expérience », « alternance : 3 sem/mois crèche, 1 sem/mois école »…).
--   rsai         : Référent·e Santé et Accueil Inclusif (badge sur la carte).
--
-- Droits : lecture = toute l'organisation (via kk_mon_org) ; écriture =
-- direction et référent·e·s de la crèche (kk_acces_creche_gestion), niveau réseau
-- = direction seule (kk_est_direction).
--
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb), UNE PARTIE
-- À LA FOIS. Idempotent. Annulation : fin du fichier.
-- ============================================================================

-- PARTIE 1 / 2 — Table
create table if not exists public.organigramme_cartes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default public.kk_mon_org(),
  creche_id    uuid references public.creches(id) on delete cascade,
  parent_id    uuid references public.organigramme_cartes(id) on delete set null,
  employe_id   uuid references public.employes(id) on delete set null,
  referent_id  uuid references public.referents(id) on delete set null,
  nom          text not null,
  poste        text,
  diplome      text,
  heures_hebdo numeric check (heures_hebdo is null or (heures_hebdo >= 0 and heures_hebdo <= 60)),
  etp          numeric check (etp is null or (etp >= 0 and etp <= 2)),
  note         text,
  rsai         boolean not null default false,
  ordre        integer not null default 0,
  created_at   timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);
create index if not exists organigramme_cartes_creche_idx on public.organigramme_cartes(creche_id);
create index if not exists organigramme_cartes_parent_idx on public.organigramme_cartes(parent_id);

create or replace function public.organigramme_cartes_maj()
returns trigger language plpgsql set search_path to 'public' as $$
begin new.maj_le := now(); return new; end $$;
drop trigger if exists organigramme_cartes_maj on public.organigramme_cartes;
create trigger organigramme_cartes_maj before insert or update on public.organigramme_cartes
  for each row execute function public.organigramme_cartes_maj();

-- PARTIE 2 / 2 — Droits (RLS)
alter table public.organigramme_cartes enable row level security;

drop policy if exists organigramme_cartes_lecture on public.organigramme_cartes;
create policy organigramme_cartes_lecture on public.organigramme_cartes
  for select to authenticated
  using (org_id = (select public.kk_mon_org()));

drop policy if exists organigramme_cartes_ecriture on public.organigramme_cartes;
create policy organigramme_cartes_ecriture on public.organigramme_cartes
  for all to authenticated
  using (
    org_id = (select public.kk_mon_org())
    and (case when creche_id is null then public.kk_est_direction()
              else public.kk_acces_creche_gestion(creche_id) end)
  )
  with check (
    org_id = (select public.kk_mon_org())
    and (case when creche_id is null then public.kk_est_direction()
              else public.kk_acces_creche_gestion(creche_id) end)
  );

-- Annulation complète :
--   drop table if exists public.organigramme_cartes;
