-- ============================================================================
-- Ludothèque › Planning des propositions ludiques
-- ============================================================================
-- Une ligne = une proposition (table `univers`) placée un jour de la semaine
-- pour une crèche. 4 propositions maximum par jour, du lundi au vendredi :
-- `position` va de 1 à 4 et (creche, jour, position) est unique, donc la
-- limite est tenue par la base, pas seulement par l'écran.
--
-- `creche` = nom court (« Brunet »), comme `univers.creche`.
-- Lecture : toutes les crèches de l'organisation (kk_meme_org_creche_nom).
-- Écriture : la crèche du compte (kk_acces_creche_nom), direction comprise.
-- Supprimer une proposition la retire des plannings (cascade).
--
-- À exécuter dans le SQL Editor Supabase, UNE PARTIE À LA FOIS. Idempotent.
-- Annulation : drop table public.planning_propositions;
--              drop function public.kk_planning_prop_echanger(uuid, uuid);
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 3 — Table
-- ============================================================================
create table if not exists public.planning_propositions (
  id              uuid primary key default gen_random_uuid(),
  creche          text not null,
  jour            date not null check (extract(isodow from jour) between 1 and 5),
  position        smallint not null check (position between 1 and 4),
  proposition_id  uuid not null references public.univers(id) on delete cascade,
  note            text,
  cree_par        uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  constraint planning_propositions_place_unique
    unique (creche, jour, position) deferrable initially immediate
);

create index if not exists planning_propositions_creche_jour_idx
  on public.planning_propositions (creche, jour);
create index if not exists planning_propositions_proposition_idx
  on public.planning_propositions (proposition_id);

alter table public.planning_propositions enable row level security;


-- ============================================================================
-- PARTIE 2 / 3 — Droits
-- ============================================================================
drop policy if exists planning_propositions_select on public.planning_propositions;
create policy planning_propositions_select on public.planning_propositions
  for select to authenticated
  using (public.kk_meme_org_creche_nom(creche));

drop policy if exists planning_propositions_ecriture on public.planning_propositions;
create policy planning_propositions_ecriture on public.planning_propositions
  for all to authenticated
  using (public.kk_acces_creche_nom(creche))
  with check (public.kk_acces_creche_nom(creche));


-- ============================================================================
-- PARTIE 3 / 3 — Échange de deux propositions d'une même journée (↑ / ↓)
-- ============================================================================
-- La contrainte d'unicité est reportée à la fin de la fonction, sinon l'échange
-- de deux positions échouerait au milieu. SECURITY INVOKER : les droits de la
-- personne s'appliquent (RLS ci-dessus).
create or replace function public.kk_planning_prop_echanger(p_a uuid, p_b uuid)
 returns void
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  ra public.planning_propositions;
  rb public.planning_propositions;
begin
  select * into ra from public.planning_propositions where id = p_a;
  select * into rb from public.planning_propositions where id = p_b;
  if ra.id is null or rb.id is null
     or ra.creche <> rb.creche or ra.jour <> rb.jour then
    raise exception 'echange_impossible';
  end if;
  set constraints public.planning_propositions_place_unique deferred;
  update public.planning_propositions set position = rb.position where id = ra.id;
  update public.planning_propositions set position = ra.position where id = rb.id;
end;
$function$;

revoke all on function public.kk_planning_prop_echanger(uuid, uuid) from public, anon;
grant execute on function public.kk_planning_prop_echanger(uuid, uuid) to authenticated;
