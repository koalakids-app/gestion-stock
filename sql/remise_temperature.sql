-- ============================================================================
-- Remise en température : registre saisi en ligne (Accès terrain)
-- ============================================================================
-- Reprend la « Fiche de contrôle de la remise en températures » (version 2023)
-- utilisée par les équipes : nature du plat, T° et heure de mise en chauffe,
-- T° et heure de fin de réchauffe, T° après mixage, observations, visa
-- (= fait_par). Une ligne = un plat un jour donné ; la fiche papier est
-- hebdomadaire, le registre regroupe les lignes par jour.
--
-- `creche` est le nom court de la crèche (« Brunet »), comme nettoyage_journal.
-- Droits via kk_acces_creche_nom() : direction = toutes les crèches de
-- l'organisation, référent(e) / employé(e) = la leur.
-- Registre de traçabilité : une ligne ne se complète qu'une fois (fin de réchauffe) ; suppression par la direction,
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
  temp_chauffe    numeric(4,1),
  heure_chauffe   time,
  temp_fin        numeric(4,1),
  heure_fin       time,
  temp_mixage     numeric(4,1),
  conforme        boolean not null default true,
  observation     text,
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
-- PARTIE 2 bis — Saisie en deux temps (mise en chauffe, puis fin de réchauffe)
-- ============================================================================
-- Une ligne ouverte (temp_fin vide) peut être complétée UNE fois, par l'équipe
-- de la crèche ; dès que temp_fin est renseignée, la ligne est figée. Le
-- déclencheur interdit de modifier autre chose que la fin de réchauffe
-- (plat, date, mise en chauffe, auteur restent tels que saisis).
drop policy if exists remise_temperature_update on public.remise_temperature_journal;
create policy remise_temperature_update on public.remise_temperature_journal
  for update to authenticated
  using (public.kk_acces_creche_nom(creche) and temp_fin is null)
  with check (public.kk_acces_creche_nom(creche));

create or replace function public.remise_temperature_fige()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if old.temp_fin is not null then
    raise exception 'Relevé terminé : modification impossible';
  end if;
  if new.creche is distinct from old.creche
     or new.fait_le is distinct from old.fait_le
     or new.plat is distinct from old.plat
     or new.temp_chauffe is distinct from old.temp_chauffe
     or new.heure_chauffe is distinct from old.heure_chauffe
     or new.fait_par_user is distinct from old.fait_par_user
     or new.created_at is distinct from old.created_at then
    raise exception 'Seule la fin de réchauffe peut être complétée';
  end if;
  return new;
end;
$function$;

drop trigger if exists remise_temperature_fige on public.remise_temperature_journal;
create trigger remise_temperature_fige before update on public.remise_temperature_journal
  for each row execute function public.remise_temperature_fige();


-- ============================================================================
-- PARTIE 3 / 3 — Vérification (lecture seule)
-- ============================================================================
-- Doit renvoyer rowsecurity = true, puis 4 policies (select, insert, update, delete).
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename = 'remise_temperature_journal';

select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'remise_temperature_journal'
 order by cmd;

-- Annulation complète (historique compris) :
-- drop table if exists public.remise_temperature_journal;
