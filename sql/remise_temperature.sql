-- ============================================================================
-- Remise en température : registre saisi en ligne (Accès terrain)
-- ============================================================================
-- Reprend la « Fiche 3 – Remise en température et service » du plan de maîtrise
-- sanitaire (Documents › outils de traçabilité) : plat, heure de début, T° à
-- cœur, heure de fin, T° de maintien, heure de service, conforme, action
-- corrective, visa (= fait_par).
--
-- `creche` est le nom court de la crèche (« Brunet »), comme nettoyage_journal.
-- Droits via kk_acces_creche_nom() : direction = toutes les crèches de
-- l'organisation, référent(e) / employé(e) = la leur.
-- Registre de traçabilité : aucune modification ; suppression par la direction,
-- ou par l'auteur dans les 15 minutes (erreur de clic).
--
-- À exécuter dans le SQL Editor Supabase, UNE PARTIE À LA FOIS. Idempotent.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 3 — Table du registre
-- ============================================================================
create table if not exists public.remise_temperature_journal (
  id              uuid primary key default gen_random_uuid(),
  creche          text not null,
  fait_le         date not null default current_date,
  plat            text not null,
  heure_debut     time,
  temp_coeur      numeric(4,1),
  heure_fin       time,
  temp_maintien   numeric(4,1),
  heure_service   time,
  conforme        boolean not null default true,
  action          text,
  fait_par        text,
  fait_par_user   uuid default auth.uid(),
  created_at      timestamptz not null default now()
);

create index if not exists remise_temperature_creche_idx
  on public.remise_temperature_journal (creche, fait_le desc);

alter table public.remise_temperature_journal enable row level security;


-- ============================================================================
-- PARTIE 2 / 3 — Droits (pas de modification, suppression limitée)
-- ============================================================================
drop policy if exists remise_temperature_select on public.remise_temperature_journal;
create policy remise_temperature_select on public.remise_temperature_journal
  for select to authenticated
  using (public.kk_acces_creche_nom(creche));

drop policy if exists remise_temperature_insert on public.remise_temperature_journal;
create policy remise_temperature_insert on public.remise_temperature_journal
  for insert to authenticated
  with check (public.kk_acces_creche_nom(creche) and fait_par_user = auth.uid());

-- Aucune policy UPDATE : une ligne du registre ne se modifie pas.
drop policy if exists remise_temperature_delete on public.remise_temperature_journal;
create policy remise_temperature_delete on public.remise_temperature_journal
  for delete to authenticated
  using (
    public.kk_est_direction()
    or (fait_par_user = auth.uid() and created_at > now() - interval '15 minutes')
  );


-- ============================================================================
-- PARTIE 3 / 3 — Vérification (lecture seule)
-- ============================================================================
-- Doit renvoyer rowsecurity = true, puis 3 policies (select, insert, delete).
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename = 'remise_temperature_journal';

select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'remise_temperature_journal'
 order by cmd;

-- Annulation complète (historique compris) :
-- drop table if exists public.remise_temperature_journal;
