-- ============================================================================
-- Goûters de la crèche : un goûter « moyen » et un goûter « grand »
-- ============================================================================
-- Comme le traiteur (bb18_gouter / grand_gouter), la crèche saisit deux
-- goûters par jour : `gouter` = goûter des moyens (bébés 6-18 mois, colonne
-- existante, nom conservé pour ne pas casser l'appli en cours) et
-- `gouter_grand` = goûter des grands. L'un ou l'autre peut rester vide (le
-- profil concerné retombe alors sur le goûter du traiteur, sauf option « fait
-- tous ses goûters »), mais pas les deux : la ligne est alors supprimée.
-- Les lignes déjà saisies valaient pour les deux profils : on les recopie.
-- ============================================================================

alter table public.menus_gouters_creche
  add column if not exists gouter_grand text;

update public.menus_gouters_creche
   set gouter_grand = gouter
 where gouter_grand is null;

alter table public.menus_gouters_creche
  alter column gouter drop not null;

alter table public.menus_gouters_creche
  drop constraint if exists menus_gouters_creche_gouter_check;

alter table public.menus_gouters_creche
  add constraint menus_gouters_creche_gouters_check check (
    (nullif(btrim(coalesce(gouter, '')), '') is not null
       or nullif(btrim(coalesce(gouter_grand, '')), '') is not null)
    and length(coalesce(gouter, '')) <= 200
    and length(coalesce(gouter_grand, '')) <= 200
  );

-- menu_public(date, crèche) : chaque profil prend son propre goûter de crèche.
-- Indicateurs `bb18_gouter_creche` / `grand_gouter_creche` par profil ;
-- `gouter_creche` (l'un ou l'autre) est conservé pour les pages déjà ouvertes.
create or replace function public.menu_public(p_date date, p_creche uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.j order by t.jour), '[]'::jsonb)
  from (
    select
      d.jour,
      jsonb_build_object(
        'jour', d.jour,
        'semaine_num', m.semaine_num,
        'theme', m.theme,
        'bb6', coalesce(m.bb6, '[]'::jsonb),
        'bb18', coalesce(m.bb18, '[]'::jsonb),
        'bb18_gouter', coalesce(nullif(g.gouter, ''),
                          case when coalesce(o.tous_gouters, false) then null else m.bb18_gouter end),
        'grand', coalesce(m.grand, '[]'::jsonb),
        'grand_gouter', coalesce(nullif(g.gouter_grand, ''),
                          case when coalesce(o.tous_gouters, false) then null else m.grand_gouter end),
        'bb18_gouter_creche', (nullif(g.gouter, '') is not null),
        'grand_gouter_creche', (nullif(g.gouter_grand, '') is not null),
        'gouter_creche', (nullif(g.gouter, '') is not null or nullif(g.gouter_grand, '') is not null)
      ) as j
    from generate_series(1, 5) as d(jour)
    left join public.menus_semaine m
      on m.date_debut = p_date and m.jour = d.jour
    left join public.menus_gouters_creche g
      on g.creche_id = p_creche and g.date_debut = p_date and g.jour = d.jour
    left join public.gouters_creche_options o
      on o.creche_id = p_creche
    where m.id is not null
       or nullif(g.gouter, '') is not null
       or nullif(g.gouter_grand, '') is not null
  ) t;
$$;

revoke all on function public.menu_public(date, uuid) from public;
grant execute on function public.menu_public(date, uuid) to anon, authenticated;
