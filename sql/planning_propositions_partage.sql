-- ============================================================================
-- Ludothèque › Planning des propositions : brouillon et partage à l'équipe
-- ============================================================================
-- À appliquer APRÈS sql/planning_propositions_ludiques.sql.
--
-- Une semaine de planning est un brouillon tant qu'elle n'a pas été partagée :
-- seules les personnes de la crèche (kk_acces_creche_nom, direction comprise)
-- la voient. « Partager » crée / met à jour une ligne de
-- planning_propositions_semaines (partage_le) : la semaine devient lisible par
-- toutes les crèches de l'organisation. Une modification faite après le partage
-- reste visible (planning vivant) mais marque la semaine « modifiée depuis le
-- partage » (modifie_le > partage_le) pour proposer de la repartager.
-- « Repasser en brouillon » remet partage_le à null.
--
-- À exécuter dans le SQL Editor Supabase, UNE PARTIE À LA FOIS. Idempotent.
-- Annulation : voir la fin du fichier.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 / 4 — Table de l'état des semaines
-- ============================================================================
create table if not exists public.planning_propositions_semaines (
  creche       text not null,
  lundi        date not null check (extract(isodow from lundi) = 1),
  partage_le   timestamptz,
  partage_par  uuid,
  partage_nom  text,
  modifie_le   timestamptz not null default now(),
  primary key (creche, lundi)
);

alter table public.planning_propositions_semaines enable row level security;


-- ============================================================================
-- PARTIE 2 / 4 — Droits (l'état est lisible de toute l'organisation ; le
-- contenu d'un brouillon, lui, ne l'est que de la crèche)
-- ============================================================================
drop policy if exists planning_semaines_select on public.planning_propositions_semaines;
create policy planning_semaines_select on public.planning_propositions_semaines
  for select to authenticated
  using (public.kk_meme_org_creche_nom(creche));

drop policy if exists planning_semaines_ecriture on public.planning_propositions_semaines;
create policy planning_semaines_ecriture on public.planning_propositions_semaines
  for all to authenticated
  using (public.kk_acces_creche_nom(creche))
  with check (public.kk_acces_creche_nom(creche));

-- Lecture des propositions planifiées : la crèche voit tout (brouillon compris),
-- les autres crèches de l'organisation ne voient que les semaines partagées.
drop policy if exists planning_propositions_select on public.planning_propositions;
create policy planning_propositions_select on public.planning_propositions
  for select to authenticated
  using (
    public.kk_acces_creche_nom(creche)
    or (
      public.kk_meme_org_creche_nom(creche)
      and exists (
        select 1 from public.planning_propositions_semaines s
        where s.creche = planning_propositions.creche
          and s.lundi = date_trunc('week', planning_propositions.jour)::date
          and s.partage_le is not null
      )
    )
  );


-- ============================================================================
-- PARTIE 3 / 4 — Partage (partage_le et modifie_le identiques) et suivi des
-- modifications
-- ============================================================================
create or replace function public.kk_planning_prop_partager(p_creche text, p_lundi date, p_nom text)
 returns public.planning_propositions_semaines
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare r public.planning_propositions_semaines;
begin
  insert into public.planning_propositions_semaines
    (creche, lundi, partage_le, partage_par, partage_nom, modifie_le)
  values (p_creche, p_lundi, now(), auth.uid(), left(p_nom, 120), now())
  on conflict (creche, lundi) do update
    set partage_le = now(), partage_par = auth.uid(),
        partage_nom = excluded.partage_nom, modifie_le = now()
  returning * into r;
  return r;
end;
$function$;

revoke all on function public.kk_planning_prop_partager(text, date, text) from public, anon;
grant execute on function public.kk_planning_prop_partager(text, date, text) to authenticated;

-- Toute modification d'une semaine déjà connue (partagée un jour) met à jour
-- modifie_le. SECURITY DEFINER : la personne qui modifie n'écrit pas
-- directement dans la table d'état.
create or replace function public.kk_planning_prop_touche()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.planning_propositions_semaines
       set modifie_le = now()
     where creche = old.creche and lundi = date_trunc('week', old.jour)::date;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.planning_propositions_semaines
       set modifie_le = now()
     where creche = new.creche and lundi = date_trunc('week', new.jour)::date;
  end if;
  return null;
end;
$function$;

revoke all on function public.kk_planning_prop_touche() from public, anon, authenticated;


-- ============================================================================
-- PARTIE 4 / 4 — Déclencheur
-- ============================================================================
drop trigger if exists planning_propositions_touche on public.planning_propositions;
create trigger planning_propositions_touche
  after insert or update or delete on public.planning_propositions
  for each row execute function public.kk_planning_prop_touche();

-- ============================================================================
-- Annulation :
--   drop trigger if exists planning_propositions_touche on public.planning_propositions;
--   drop function if exists public.kk_planning_prop_touche();
--   drop function if exists public.kk_planning_prop_partager(text, date, text);
--   drop table if exists public.planning_propositions_semaines;
--   puis recréer planning_propositions_select comme dans
--   sql/planning_propositions_ludiques.sql (partie 2).
-- ============================================================================
