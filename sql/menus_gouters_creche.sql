-- ============================================================================
-- Goûters préparés par la crèche (en remplacement du goûter du traiteur)
-- ============================================================================
-- Certaines crèches préparent elles-mêmes leurs goûters. Chaque crèche saisit
-- son goûter du jour (lundi à vendredi) pour une semaine ; il remplace, pour
-- cette crèche, le goûter du traiteur (`menus_semaine.bb18_gouter` et
-- `grand_gouter`) dans les menus affichés (MCM › Menus, Présences, page
-- publique menu.html). Un seul texte par jour : il vaut pour les bébés de
-- 6-18 mois et pour les grands (pas de goûter avant 6 mois).
--
-- Accès : référents/direction/employés de la crèche via kk_acces_creche()
-- (la direction sans crèche rattachée accède aux crèches de son organisation).
-- ============================================================================

create table if not exists public.menus_gouters_creche (
  id          uuid primary key default gen_random_uuid(),
  creche_id   uuid not null references public.creches(id) on delete cascade,
  date_debut  date not null,                  -- lundi de la semaine concernée
  jour        smallint not null check (jour between 1 and 5),  -- 1 = lundi … 5 = vendredi
  gouter      text not null check (length(btrim(gouter)) > 0 and length(gouter) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (creche_id, date_debut, jour)
);

create index if not exists menus_gouters_creche_creche_idx
  on public.menus_gouters_creche (creche_id, date_debut);

alter table public.menus_gouters_creche enable row level security;

create policy menus_gouters_creche_select on public.menus_gouters_creche
  for select to authenticated using (public.kk_acces_creche(creche_id));

create policy menus_gouters_creche_insert on public.menus_gouters_creche
  for insert to authenticated with check (public.kk_acces_creche(creche_id));

create policy menus_gouters_creche_update on public.menus_gouters_creche
  for update to authenticated
  using (public.kk_acces_creche(creche_id))
  with check (public.kk_acces_creche(creche_id));

create policy menus_gouters_creche_delete on public.menus_gouters_creche
  for delete to authenticated using (public.kk_acces_creche(creche_id));

-- ============================================================================
-- Page publique : menu_public(date, crèche)
-- ============================================================================
-- S'ajoute à menu_public(date) (sql/menu_public.sql), qui reste en place pour
-- les anciens liens. Sans goûter de crèche le résultat est identique. Avec une crèche, son
-- goûter remplace celui du traiteur pour chaque jour où il est renseigné, et
-- `gouter_creche` vaut true pour que la page l'indique. Un jour sans menu
-- traiteur mais avec un goûter de crèche est renvoyé (menus encore non
-- importés). Toujours une seule semaine, colonnes d'affichage uniquement.
-- Les deux versions coexistent (arguments différents) : un appel avec
-- {p_date} seul utilise l'ancienne, un appel avec {p_date, p_creche} la nouvelle
-- (p_creche peut être null). Pas de valeur par défaut, pour éviter toute
-- ambiguïté entre les deux.
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
        'bb18_gouter', coalesce(nullif(g.gouter, ''), m.bb18_gouter),
        'grand', coalesce(m.grand, '[]'::jsonb),
        'grand_gouter', coalesce(nullif(g.gouter, ''), m.grand_gouter),
        'gouter_creche', (nullif(g.gouter, '') is not null)
      ) as j
    from generate_series(1, 5) as d(jour)
    left join public.menus_semaine m
      on m.date_debut = p_date and m.jour = d.jour
    left join public.menus_gouters_creche g
      on g.creche_id = p_creche and g.date_debut = p_date and g.jour = d.jour
    where m.id is not null or nullif(g.gouter, '') is not null
  ) t;
$$;

revoke all on function public.menu_public(date, uuid) from public;
grant execute on function public.menu_public(date, uuid) to anon, authenticated;
