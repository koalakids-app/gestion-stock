-- ============================================================================
-- Mon espace : le planning d'une pro ne s'affichait pas quand son prénom
-- différait par un accent, la casse, un tiret ou un double espace entre la
-- fiche employé et le planning équipe (Demandes rapproche sans accents).
-- À appliquer à la main sur Supabase (projet juyrceadazrovlitxceb),
-- une partie à la fois (l'éditeur s'arrête à la première erreur).
-- ============================================================================

-- ---------- PARTIE 1 : fonction de normalisation -----------------------------
create or replace function public.kk_norm_prenom(t text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select regexp_replace(
    translate(
      lower(trim(coalesce(t, ''))),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœ-',
      'aaaaaaceeeeiiiinooooouuuuyyo '
    ),
    '\s+', ' ', 'g'
  );
$$;

-- ---------- PARTIE 2 : règle de lecture ------------------------------------
drop policy if exists planning_equipe_select_self on public.planning_equipe;
create policy planning_equipe_select_self on public.planning_equipe
  for select to authenticated
  using (
    exists (
      select 1 from public.employes e
      where e.user_id = auth.uid()
        and e.creche_id = planning_equipe.creche_id
        and public.kk_norm_prenom(coalesce(e.planning_nom, e.prenom))
            = public.kk_norm_prenom(planning_equipe.prenom)
    )
  );

-- ---------- PARTIE 3 : contrôle (lecture seule) ------------------------------
-- Employés avec compte dont aucune ligne de planning ne correspond encore
-- (pas de planning importé, ou prénom réellement différent : renseigner
-- « Nom dans le planning » sur la fiche).
select e.prenom, e.planning_nom, e.creche_id
from public.employes e
where e.user_id is not null
  and e.archive_le is null
  and not exists (
    select 1 from public.planning_equipe p
    where p.creche_id = e.creche_id
      and public.kk_norm_prenom(p.prenom)
          = public.kk_norm_prenom(coalesce(e.planning_nom, e.prenom))
  );
