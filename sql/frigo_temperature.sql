-- ============================================================================
-- Température du réfrigérateur : registre saisi en ligne (Accès terrain)
-- ============================================================================
-- Fiche 2 du PMS (« Température du réfrigérateur »), relevée trois fois par
-- jour par la personne qui s'occupe de la cuisine : le matin, avant la mise
-- des plats au four, et en fin de journée. Une ligne = un relevé.
--
-- `creche` est le nom court de la crèche (« Brunet »), comme
-- remise_temperature_journal. Droits via kk_acces_creche_nom().
-- Registre de traçabilité : pas de modification ; suppression par la
-- direction, ou par l'auteur dans les 15 minutes (erreur de clic).
-- Conforme = 4 °C ou moins (au-delà, observation obligatoire côté écran).
--
-- À exécuter dans le SQL Editor Supabase, UNE PARTIE À LA FOIS. Idempotent.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 3 — Table du registre
-- ============================================================================
create table if not exists public.frigo_temperature_journal (
  id             uuid primary key default gen_random_uuid(),
  creche         text not null,
  fait_le        date not null default current_date,
  moment         text not null check (moment in ('matin','avant_four','soir')),
  temperature    numeric(4,1) not null,
  heure          time,
  conforme       boolean not null default true,
  observation    text,
  fait_par       text,
  fait_par_user  uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create index if not exists frigo_temperature_creche_idx
  on public.frigo_temperature_journal (creche, fait_le desc);

alter table public.frigo_temperature_journal enable row level security;


-- ============================================================================
-- PARTIE 2 / 3 — Droits
-- ============================================================================
drop policy if exists frigo_temperature_select on public.frigo_temperature_journal;
create policy frigo_temperature_select on public.frigo_temperature_journal
  for select to authenticated
  using (public.kk_acces_creche_nom(creche));

drop policy if exists frigo_temperature_insert on public.frigo_temperature_journal;
create policy frigo_temperature_insert on public.frigo_temperature_journal
  for insert to authenticated
  with check (public.kk_acces_creche_nom(creche) and fait_par_user = auth.uid());

-- Aucune policy UPDATE : un relevé ne se modifie pas.
drop policy if exists frigo_temperature_delete on public.frigo_temperature_journal;
create policy frigo_temperature_delete on public.frigo_temperature_journal
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
 where schemaname = 'public' and tablename = 'frigo_temperature_journal';

select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'frigo_temperature_journal'
 order by cmd;

-- Annulation complète (historique compris) :
-- drop table if exists public.frigo_temperature_journal;
