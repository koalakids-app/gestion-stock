-- ============================================================================
-- Recrutement d'un·e salarié·e en remplacement
-- ============================================================================
-- Demandes › Équipe › « Recrutement » (js/pages/demandes/26-recrutement.js).
-- Une fiche par candidat·e, avec un lien personnel (candidat.html?t=<jeton>)
-- qui lui donne : le projet pédagogique à lire, les pièces jointes choisies
-- (fiche de poste…) et le questionnaire sur le projet. La page publique n'a
-- aucun accès aux tables ni au bucket : tout passe par l'edge function
-- `dossier-candidat` (service_role, --no-verify-jwt).
--
--   recrutement_candidats   la fiche, le lien, le suivi du questionnaire
--                           (reponses = { ouvert_le }, reponses_le = « j'ai répondu » ;
--                           le questionnaire est un quiz du projet quiz-protocoles,
--                           son résultat y est enregistré avec ref = id de la fiche)
--   recrutement_documents   bibliothèque de pièces jointes réutilisables
--                           (creche_id vide = toutes les crèches, direction)
--   recrutement_envois      les pièces jointes au lien d'UN·E candidat·e
--   recrutement_reglages    inutilisée (premier questionnaire intégré, abandonné) :
--                           à supprimer quand possible
--   bucket privé `recrutement` :
--     <id candidat>/…                    fichier propre à une fiche
--     bibliotheque/<id organisation>/…   fichier de la bibliothèque
--
-- Accès : direction et référent·e·s (kk_acces_creche_gestion), sur leur crèche ;
-- jamais les comptes « employe » de l'accès terrain. Aucune policy anon.
-- Conservation : 2 ans au plus après le dernier contact (recommandation CNIL),
-- la fiche se supprime depuis l'application (fichiers compris).
--
-- Appliqué sur Supabase le 12 novembre 2026.
-- ============================================================================

-- ---- Partie 1 : tables -----------------------------------------------------
create table if not exists public.recrutement_candidats (
  id                  uuid primary key default gen_random_uuid(),
  creche_id           uuid not null references public.creches(id),
  prenom              text not null,
  nom                 text,
  email               text,
  telephone           text,
  poste               text,
  remplace            text,
  date_debut          date,
  date_fin            date,
  statut              text not null default 'candidature'
                      check (statut in ('candidature','entretien','retenu','refuse','desiste')),
  entretien_date      date,
  entretien_heure     text,
  notes               text,
  avec_projet         boolean not null default true,
  avec_questionnaire  boolean not null default true,
  token               text unique,
  token_expire_le     timestamptz,
  lien_envoye_le      timestamptz,
  lien_ouvert_le      timestamptz,
  projet_ouvert_le    timestamptz,
  reponses            jsonb,
  reponses_le         timestamptz,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists recrutement_candidats_creche_idx on public.recrutement_candidats(creche_id);

create table if not exists public.recrutement_documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.kk_mon_org(),
  creche_id   uuid references public.creches(id) on delete cascade,
  libelle     text not null,
  bucket      text not null default 'recrutement',
  path        text not null,
  filename    text,
  mime        text,
  taille      integer,
  created_at  timestamptz not null default now()
);

create table if not exists public.recrutement_envois (
  id           uuid primary key default gen_random_uuid(),
  candidat_id  uuid not null references public.recrutement_candidats(id) on delete cascade,
  -- Renseigné quand la pièce vient de la bibliothèque : le fichier est alors
  -- partagé, il ne faut pas le supprimer en retirant la pièce d'une fiche.
  document_id  uuid references public.recrutement_documents(id) on delete cascade,
  libelle      text not null,
  message      text,
  bucket       text not null default 'recrutement',
  path         text not null,
  filename     text,
  mime         text,
  taille       integer,
  envoye_par   text,
  ouvert_le    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists recrutement_envois_candidat_idx on public.recrutement_envois(candidat_id);

create table if not exists public.recrutement_reglages (
  org_id      uuid primary key default public.kk_mon_org(),
  questions   jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---- Partie 2 : droits (RLS) -----------------------------------------------
alter table public.recrutement_candidats enable row level security;
alter table public.recrutement_documents enable row level security;
alter table public.recrutement_envois    enable row level security;
alter table public.recrutement_reglages  enable row level security;

drop policy if exists recrutement_candidats_gestion on public.recrutement_candidats;
create policy recrutement_candidats_gestion on public.recrutement_candidats
  for all to authenticated
  using (public.kk_acces_creche_gestion(creche_id))
  with check (public.kk_acces_creche_gestion(creche_id));

drop policy if exists recrutement_envois_gestion on public.recrutement_envois;
create policy recrutement_envois_gestion on public.recrutement_envois
  for all to authenticated
  using (exists (select 1 from public.recrutement_candidats c
                 where c.id = recrutement_envois.candidat_id
                   and public.kk_acces_creche_gestion(c.creche_id)))
  with check (exists (select 1 from public.recrutement_candidats c
                      where c.id = recrutement_envois.candidat_id
                        and public.kk_acces_creche_gestion(c.creche_id)));

-- Bibliothèque : lue par la direction et les référent·e·s de l'organisation
-- (documents communs + ceux de leur crèche) ; un document commun (creche_id
-- vide) n'est écrit que par la direction.
drop policy if exists recrutement_documents_lecture on public.recrutement_documents;
create policy recrutement_documents_lecture on public.recrutement_documents
  for select to authenticated
  using (org_id = public.kk_mon_org()
         and public.kk_mon_role() in ('direction','referent')
         and (creche_id is null or public.kk_acces_creche_gestion(creche_id)));

drop policy if exists recrutement_documents_ecriture on public.recrutement_documents;
create policy recrutement_documents_ecriture on public.recrutement_documents
  for all to authenticated
  using (org_id = public.kk_mon_org()
         and (public.kk_est_direction()
              or (creche_id is not null and public.kk_acces_creche_gestion(creche_id))))
  with check (org_id = public.kk_mon_org()
         and (public.kk_est_direction()
              or (creche_id is not null and public.kk_acces_creche_gestion(creche_id))));

drop policy if exists recrutement_reglages_lecture on public.recrutement_reglages;
create policy recrutement_reglages_lecture on public.recrutement_reglages
  for select to authenticated
  using (org_id = public.kk_mon_org() and public.kk_mon_role() in ('direction','referent'));

drop policy if exists recrutement_reglages_ecriture on public.recrutement_reglages;
create policy recrutement_reglages_ecriture on public.recrutement_reglages
  for all to authenticated
  using (org_id = public.kk_mon_org() and public.kk_est_direction())
  with check (org_id = public.kk_mon_org() and public.kk_est_direction());

-- ---- Partie 3 : bucket privé et accès aux fichiers --------------------------
insert into storage.buckets (id, name, public)
values ('recrutement', 'recrutement', false)
on conflict (id) do nothing;

-- p_nom = chemin complet du fichier dans le bucket.
create or replace function public.kk_acces_recrutement(p_nom text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (storage.foldername(p_nom))[1] = 'bibliotheque' then
      public.kk_mon_role() in ('direction','referent')
      and (storage.foldername(p_nom))[2] = public.kk_mon_org()::text
    else exists (
      select 1 from public.recrutement_candidats c
      where c.id::text = (storage.foldername(p_nom))[1]
        and public.kk_acces_creche_gestion(c.creche_id))
  end;
$$;
revoke all on function public.kk_acces_recrutement(text) from public, anon;
grant execute on function public.kk_acces_recrutement(text) to authenticated;

drop policy if exists recrutement_select on storage.objects;
drop policy if exists recrutement_insert on storage.objects;
drop policy if exists recrutement_delete on storage.objects;
create policy recrutement_select on storage.objects
  for select to authenticated
  using (bucket_id = 'recrutement' and public.kk_acces_recrutement(name));
create policy recrutement_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recrutement' and public.kk_acces_recrutement(name));
create policy recrutement_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'recrutement' and public.kk_acces_recrutement(name));

-- Vérification :
-- select id, public from storage.buckets where id = 'recrutement';
-- select tablename, policyname from pg_policies where tablename like 'recrutement%';
