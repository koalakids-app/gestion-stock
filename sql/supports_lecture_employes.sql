-- Supports pédagogiques : lecture par les employés (comptes « Mon espace » sans fiche `referents`).
-- kk_mon_org() ne lit que `referents` : un employé obtenait une organisation vide, donc aucune ligne
-- (page avec ses cadres mais sans thématique ni support). On ne modifie PAS kk_mon_org() (109 politiques
-- l'utilisent) : une fonction dédiée, limitée à ces deux lectures, retrouve l'organisation par la crèche.
-- À appliquer à la main.

create or replace function public.kk_support_org()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select r.org_id from public.referents r where r.user_id = (select auth.uid()) limit 1),
    (select c.org_id from public.employes e join public.creches c on c.id = e.creche_id
      where e.user_id = (select auth.uid()) limit 1)
  )
$$;
revoke all on function public.kk_support_org() from public;
grant execute on function public.kk_support_org() to authenticated;

drop policy if exists supports_themes_select on public.supports_themes;
create policy supports_themes_select on public.supports_themes for select to authenticated
  using (org_id = public.kk_support_org() and public.kk_support_membre());

drop policy if exists supports_pedagogiques_select on public.supports_pedagogiques;
create policy supports_pedagogiques_select on public.supports_pedagogiques for select to authenticated
  using (org_id = public.kk_support_org() and public.kk_support_membre());
