-- ============================================================================
-- Menu du traiteur consultable sans compte (page menu.html, ouverte par QR code)
-- ============================================================================
-- La table `menus_semaine` reste lisible par les seuls référents connectés.
-- Cette fonction n'expose, à un visiteur anonyme, que les lignes d'UNE semaine
-- (celle dont on donne le lundi) et seulement les colonnes d'affichage : ni
-- chemin de fichier, ni identifiants internes. Pas de liste des semaines, pas
-- de recherche : il faut connaître la date du lundi.
-- Le menu du traiteur n'est pas une donnée sensible (il est déjà affiché aux
-- familles).
-- ============================================================================

create or replace function public.menu_public(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'jour', jour,
        'semaine_num', semaine_num,
        'theme', theme,
        'bb6', bb6,
        'bb18', bb18,
        'bb18_gouter', bb18_gouter,
        'grand', grand,
        'grand_gouter', grand_gouter
      ) order by jour
    ),
    '[]'::jsonb
  )
  from public.menus_semaine
  where date_debut = p_date;
$$;

revoke all on function public.menu_public(date) from public;
grant execute on function public.menu_public(date) to anon, authenticated;
