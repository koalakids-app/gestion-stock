-- ============================================================================
-- Réunions d'équipe (demandes.html, module js/reunions-equipe.js)
-- ============================================================================
-- Comptes rendus rédigés par les directeurs/trices techniques (table
-- `referents`, en base) pour leur propre micro-crèche : réunion d'équipe,
-- réunion famille, avec un partenaire/la PMI, etc. Chaque crèche ne voit que
-- ses propres comptes rendus, la direction voit tout.
--
-- Distinct de reunions_direction / actions_direction (suivi des réunions de
-- direction avec plan d'action inter-crèches) : on ne touche à aucune des
-- deux ici.
--
-- Un compte rendu passe de statut 'brouillon' (modifiable par son auteur) à
-- 'valide' (figé, cf. reunions_equipe_2_trigger.sql) une fois relu. La
-- réouverture d'un compte rendu validé est réservée à la direction et
-- tracée (voir reunions_equipe_3_rls.sql).
-- ============================================================================

create table if not exists public.reunions_equipe (
  id                 uuid primary key default gen_random_uuid(),
  creche_id          uuid not null references public.creches(id),
  date_reunion       date not null,
  heure              time,
  type               text not null default 'equipe' check (type in ('equipe', 'autre')),
  type_autre         text,
  participants       text,
  excuses            text,
  contenu            text,
  decisions          text,
  prochaine_reunion  date,
  statut             text not null default 'brouillon' check (statut in ('brouillon', 'valide')),
  auteur_id          uuid references public.referents(id),
  valide_le          timestamptz,
  valide_par         uuid references public.referents(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists reunions_equipe_creche_date_idx
  on public.reunions_equipe (creche_id, date_reunion desc);
