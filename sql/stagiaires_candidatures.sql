-- ============================================================================
-- Stagiaires : le « mur » des candidatures (le Padlet, dans l'application)
-- ============================================================================
-- La direction reçoit des candidatures de stage / d'alternance par e-mail. Elle
-- les PUBLIE ici (identité, formation, période souhaitée, CV et lettre de
-- motivation joints) ; les référent·e·s de toutes les crèches les voient, les
-- ouvrent à l'écran et SE POSITIONNENT pour prendre contact. La direction voit
-- qui s'est positionné et ATTRIBUE la candidature à une crèche : la fiche
-- stagiaire est alors créée (js/stagiaires/08-candidatures.js).
--
--   stagiaires_candidatures            la candidature publiée (CV / lettre = chemins)
--   stagiaires_candidatures_interets   « je me positionne » : une ligne par référent·e
--   bucket privé `stagiaires-vivier`   <id candidature>/cv-….ext et lettre-….ext
--
-- Accès : lecture = direction et référent·e·s de l'organisation (jamais les
-- comptes « employe » de l'accès terrain) ; publication, modification,
-- attribution, suppression = direction ; se positionner = chaque référent·e
-- pour lui/elle-même. Aucune policy anon.
-- Conservation : les CV contiennent des données personnelles. Supprimer la
-- candidature (bouton « Supprimer ») retire aussi les fichiers ; à faire dès
-- qu'elle est classée (politique de confidentialité à tenir à jour).
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb), une partie à la fois.
-- ============================================================================

-- ---- Partie 1 : tables -----------------------------------------------------
create table if not exists public.stagiaires_candidatures (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id),
  prenom             text not null,
  nom                text,
  email              text,
  telephone          text,
  type_contrat       text not null default 'stagiaire' check (type_contrat in ('stagiaire','alternant')),
  ecole              text,
  formation          text,
  niveau             text,
  date_debut         date,
  date_fin           date,
  notes              text,
  cv_path            text,
  cv_nom             text,
  cv_mime            text,
  lettre_path        text,
  lettre_nom         text,
  lettre_mime        text,
  statut             text not null default 'ouverte' check (statut in ('ouverte','attribuee','classee')),
  attribuee_creche   text,          -- id de la crèche (même type que stagiaires.creche_id)
  attribuee_referent uuid,
  stagiaire_id       uuid references public.stagiaires(id) on delete set null,
  created_by         text,
  created_at         timestamptz not null default now()
);
create index if not exists stagiaires_candidatures_org_idx on public.stagiaires_candidatures(org_id, statut);

create table if not exists public.stagiaires_candidatures_interets (
  id             uuid primary key default gen_random_uuid(),
  candidature_id uuid not null references public.stagiaires_candidatures(id) on delete cascade,
  referent_id    uuid not null references public.referents(id) on delete cascade,
  creche_id      text,
  referent_nom   text,
  message        text,
  created_at     timestamptz not null default now(),
  unique (candidature_id, referent_id)
);
create index if not exists stagiaires_cand_interets_idx on public.stagiaires_candidatures_interets(candidature_id);

-- ---- Partie 2 : droits -----------------------------------------------------
-- Direction ou référent·e de l'organisation de la candidature.
create or replace function public.kk_vivier_acces(cible_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.referents r
    where r.user_id = auth.uid()
      and r.role in ('direction', 'referent')
      and r.org_id = cible_org
  );
$$;

alter table public.stagiaires_candidatures enable row level security;
alter table public.stagiaires_candidatures_interets enable row level security;

drop policy if exists stagiaires_cand_select on public.stagiaires_candidatures;
create policy stagiaires_cand_select on public.stagiaires_candidatures
  for select to authenticated using (public.kk_vivier_acces(org_id));

drop policy if exists stagiaires_cand_ecriture on public.stagiaires_candidatures;
create policy stagiaires_cand_ecriture on public.stagiaires_candidatures
  for all to authenticated
  using (public.est_direction() and public.kk_vivier_acces(org_id))
  with check (public.est_direction() and public.kk_vivier_acces(org_id));

drop policy if exists stagiaires_cand_int_select on public.stagiaires_candidatures_interets;
create policy stagiaires_cand_int_select on public.stagiaires_candidatures_interets
  for select to authenticated using (exists (
    select 1 from public.stagiaires_candidatures c
    where c.id = candidature_id and public.kk_vivier_acces(c.org_id)));

-- Se positionner : pour soi-même seulement.
drop policy if exists stagiaires_cand_int_insert on public.stagiaires_candidatures_interets;
create policy stagiaires_cand_int_insert on public.stagiaires_candidatures_interets
  for insert to authenticated with check (
    exists (select 1 from public.referents r
            where r.id = referent_id and r.user_id = auth.uid() and r.role in ('direction','referent'))
    and exists (select 1 from public.stagiaires_candidatures c
                where c.id = candidature_id and public.kk_vivier_acces(c.org_id)));

-- Retirer son positionnement ; la direction peut retirer n'importe lequel.
drop policy if exists stagiaires_cand_int_delete on public.stagiaires_candidatures_interets;
create policy stagiaires_cand_int_delete on public.stagiaires_candidatures_interets
  for delete to authenticated using (
    public.est_direction()
    or exists (select 1 from public.referents r where r.id = referent_id and r.user_id = auth.uid()));

-- ---- Partie 3 : bucket privé des CV et lettres -----------------------------
insert into storage.buckets (id, name, public)
values ('stagiaires-vivier', 'stagiaires-vivier', false)
on conflict (id) do nothing;

drop policy if exists stagiaires_vivier_select on storage.objects;
create policy stagiaires_vivier_select on storage.objects
  for select to authenticated using (
    bucket_id = 'stagiaires-vivier' and exists (
      select 1 from public.stagiaires_candidatures c
      where c.id::text = (storage.foldername(name))[1] and public.kk_vivier_acces(c.org_id)));

drop policy if exists stagiaires_vivier_insert on storage.objects;
create policy stagiaires_vivier_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'stagiaires-vivier' and public.est_direction() and exists (
      select 1 from public.stagiaires_candidatures c
      where c.id::text = (storage.foldername(name))[1] and public.kk_vivier_acces(c.org_id)));

drop policy if exists stagiaires_vivier_delete on storage.objects;
create policy stagiaires_vivier_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'stagiaires-vivier' and public.est_direction() and exists (
      select 1 from public.stagiaires_candidatures c
      where c.id::text = (storage.foldername(name))[1] and public.kk_vivier_acces(c.org_id)));
