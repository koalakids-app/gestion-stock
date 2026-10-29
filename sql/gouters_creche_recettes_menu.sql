-- ============================================================================
-- Menu public : le titre des recettes de goûter figure sur le menu du jour
-- ============================================================================
-- À appliquer à la main. Remplace menu_public(date, crèche) : pour chaque profil,
-- les noms des recettes choisies (gouters_creche_recettes) précèdent le texte
-- saisi par la crèche. Reprend aussi la version « moyen / grand » + option
-- « fait tous ses goûters » (le grand lit bien `gouter_grand`).
-- ============================================================================
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
        'bb18_gouter', coalesce(c.moyen,
                          case when coalesce(o.tous_gouters, false) then null else m.bb18_gouter end),
        'grand', coalesce(m.grand, '[]'::jsonb),
        'grand_gouter', coalesce(c.grand,
                          case when coalesce(o.tous_gouters, false) then null else m.grand_gouter end),
        'bb18_gouter_creche', (c.moyen is not null),
        'grand_gouter_creche', (c.grand is not null),
        'gouter_creche', (c.moyen is not null or c.grand is not null)
      ) as j
    from generate_series(1, 5) as d(jour)
    left join public.menus_semaine m
      on m.date_debut = p_date and m.jour = d.jour
    left join public.menus_gouters_creche g
      on g.creche_id = p_creche and g.date_debut = p_date and g.jour = d.jour
    left join public.gouters_creche_options o
      on o.creche_id = p_creche
    left join lateral (
      select
        nullif(concat_ws(' / ',
          (select string_agg(r.nom, ' / ' order by r.nom)
             from public.gouters_creche_recettes gr
             join public.recettes r on r.id = gr.recette_id
            where gr.creche_id = p_creche and gr.date_debut = p_date
              and gr.jour = d.jour and gr.profil = 'moyen'),
          nullif(g.gouter, '')), '') as moyen,
        nullif(concat_ws(' / ',
          (select string_agg(r.nom, ' / ' order by r.nom)
             from public.gouters_creche_recettes gr
             join public.recettes r on r.id = gr.recette_id
            where gr.creche_id = p_creche and gr.date_debut = p_date
              and gr.jour = d.jour and gr.profil = 'grand'),
          nullif(g.gouter_grand, '')), '') as grand
    ) c on true
    where m.id is not null or c.moyen is not null or c.grand is not null
  ) t;
$$;

revoke all on function public.menu_public(date, uuid) from public;
grant execute on function public.menu_public(date, uuid) to anon, authenticated;
