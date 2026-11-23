-- ============================================================================
-- referents : fin de la « infinite recursion detected in policy for relation "referents" »
-- (à appliquer à la main sur le projet juyrceadazrovlitxceb ; appliqué le 23/11/2026)
-- ============================================================================
-- Les politiques d'écriture de `referents` contenaient la sous-requête
--   creche_id IN (select id from creches where org_id = kk_mon_org())
-- Or les politiques de `creches` (referent_own_creche, direction_all_creches) relisent
-- `referents` : PostgreSQL détecte la boucle dès qu'on modifie une ligne de `referents`
-- (ex. relier un profil terrain à une fiche : update referents set employe_id = ...).
-- La fonction SECURITY DEFINER ci-dessous fait la même vérification sans passer par les
-- politiques de `creches`. Même résultat : la crèche appartient à l'organisation de l'appelant.

create or replace function public.kk_creche_dans_mon_org(p_creche uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.creches c
    where c.id = p_creche and c.org_id = public.kk_mon_org()
  );
$$;
revoke all on function public.kk_creche_dans_mon_org(uuid) from public;
grant execute on function public.kk_creche_dans_mon_org(uuid) to anon, authenticated, service_role;

drop policy if exists referents_insert on public.referents;
create policy referents_insert on public.referents
  for insert
  with check (public.kk_est_direction() and public.kk_creche_dans_mon_org(creche_id));

drop policy if exists referents_update_direction on public.referents;
create policy referents_update_direction on public.referents
  for update
  using (public.kk_est_direction() and public.kk_creche_dans_mon_org(creche_id))
  with check (public.kk_est_direction() and public.kk_creche_dans_mon_org(creche_id));

drop policy if exists referents_delete on public.referents;
create policy referents_delete on public.referents
  for delete
  using (public.kk_est_direction() and public.kk_creche_dans_mon_org(creche_id));
