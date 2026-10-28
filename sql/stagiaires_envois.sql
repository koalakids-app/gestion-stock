-- ============================================================================
-- Stagiaires : documents envoyés par la crèche à la personne (hors catalogue)
-- ============================================================================
-- Sens crèche → stagiaire, fichiers propres à UNE fiche (convention à signer,
-- consignes de stage, plan d'accès...), à part des pièces demandées
-- (stagiaires_docs_types) et des ressources communes (stagiaires_ressources).
-- Fichiers dans le bucket privé `stagiaires`, sous <id fiche>/envois/ : le
-- premier dossier reste l'id de la fiche, donc les policies de
-- sql/storage_filtrage_par_creche.sql s'appliquent sans changement.
-- La personne les ouvre depuis son lien (edge function dossier-stagiaire,
-- action `envoi_url`, à redéployer avec --no-verify-jwt) ; la première
-- ouverture est datée. À appliquer à la main sur Supabase.
-- ============================================================================
create table if not exists public.stagiaires_envois (
  id            uuid primary key default gen_random_uuid(),
  stagiaire_id  uuid not null references public.stagiaires(id) on delete cascade,
  libelle       text not null,
  message       text,
  bucket        text not null default 'stagiaires',
  path          text not null,
  filename      text,
  mime          text,
  taille        integer,
  envoye_par    text,
  ouvert_le     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists stagiaires_envois_stagiaire_idx on public.stagiaires_envois(stagiaire_id);

alter table public.stagiaires_envois enable row level security;

-- Même portée que documents_externes (stagiaire) : direction = tout, référente =
-- sa crèche, jamais une fiche sans crèche. Aucune policy anon : la personne passe
-- par l'edge function.
drop policy if exists stagiaires_envois_all on public.stagiaires_envois;
create policy stagiaires_envois_all on public.stagiaires_envois
  for all to authenticated
  using (
    est_direction() or exists (
      select 1 from public.stagiaires st
      join public.referents r on r.user_id = auth.uid()
      where st.id = stagiaires_envois.stagiaire_id
        and r.role = 'referent' and st.creche_id is not null
        and r.creche_id::text = st.creche_id
    )
  )
  with check (
    est_direction() or exists (
      select 1 from public.stagiaires st
      join public.referents r on r.user_id = auth.uid()
      where st.id = stagiaires_envois.stagiaire_id
        and r.role = 'referent' and st.creche_id is not null
        and r.creche_id::text = st.creche_id
    )
  );

-- Date du dernier e-mail « un document vous attend » (edge function
-- envoyer-envoi-stagiaire, à déployer avec la vérification JWT activée).
alter table public.stagiaires_envois add column if not exists prevenu_le timestamptz;
