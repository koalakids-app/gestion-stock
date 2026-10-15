-- ============================================================================
-- Option « cette crèche fait tous ses goûters »
-- ============================================================================
-- Réglage par crèche (une ligne par crèche, activée depuis MCM › Menus ›
-- Goûters de la crèche). Quand `tous_gouters` est vrai :
--   * un jour sans goûter de crèche n'affiche AUCUN goûter (au lieu de retomber
--     sur celui du traiteur) : menus de l'appli, Présences, page publique ;
--   * le bon de commande traiteur ne compte aucun goûter pour cette crèche.
-- Accès : comme menus_gouters_creche, via kk_acces_creche().
-- ============================================================================

create table if not exists public.gouters_creche_options (
  creche_id    uuid primary key references public.creches(id) on delete cascade,
  tous_gouters boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.gouters_creche_options enable row level security;

create policy gouters_creche_options_select on public.gouters_creche_options
  for select to authenticated using (public.kk_acces_creche(creche_id));

create policy gouters_creche_options_insert on public.gouters_creche_options
  for insert to authenticated with check (public.kk_acces_creche(creche_id));

create policy gouters_creche_options_update on public.gouters_creche_options
  for update to authenticated
  using (public.kk_acces_creche(creche_id))
  with check (public.kk_acces_creche(creche_id));

create policy gouters_creche_options_delete on public.gouters_creche_options
  for delete to authenticated using (public.kk_acces_creche(creche_id));

-- menu_public(date, crèche) : même signature que dans menus_gouters_creche.sql,
-- avec prise en compte de l'option (jour sans goûter de crèche = pas de goûter).
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
        'grand_gouter', coalesce(nullif(g.gouter, ''),
                          case when coalesce(o.tous_gouters, false) then null else m.grand_gouter end),
        'gouter_creche', (nullif(g.gouter, '') is not null)
      ) as j
    from generate_series(1, 5) as d(jour)
    left join public.menus_semaine m
      on m.date_debut = p_date and m.jour = d.jour
    left join public.menus_gouters_creche g
      on g.creche_id = p_creche and g.date_debut = p_date and g.jour = d.jour
    left join public.gouters_creche_options o
      on o.creche_id = p_creche
    where m.id is not null or nullif(g.gouter, '') is not null
  ) t;
$$;

revoke all on function public.menu_public(date, uuid) from public;
grant execute on function public.menu_public(date, uuid) to anon, authenticated;
