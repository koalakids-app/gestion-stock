-- ============================================================================
-- "Mon espace" pour les référentes : mêmes informations RH minimales que les
-- collaborateurs/trices (table employes), pour leur ouvrir l'accès à
-- collaborateur.html (planning + compteur d'heures supplémentaires) sans
-- fusionner les deux tables — étape progressive vers une fusion à terme.
-- ============================================================================
-- Contrairement aux employes (dont le planning n'existe qu'en texte libre via
-- planning_equipe, rapproché par prénom), les référentes ont déjà un planning
-- individuel robuste : la table `planning`, indexée par `referent_id`. Pas
-- besoin de rapprochement fragile ici — collaborateur.html interrogera
-- directement `planning` pour elles.
-- ============================================================================

alter table public.referents add column if not exists heures_hebdo numeric;
alter table public.referents add column if not exists date_debut date;
alter table public.referents add column if not exists date_fin date;

-- ----------------------------------------------------------------------------
-- Une référente peut lire ses propres pointages (nécessaire au calcul du
-- compteur d'heures — même principe que pointages_select_self_employe, mais
-- via salarie_id, la colonne utilisée pour les référents dans `pointages`).
-- ----------------------------------------------------------------------------
create policy pointages_select_self_referent on public.pointages
  for select to authenticated
  using (
    exists (
      select 1 from public.referents r
      where r.user_id = auth.uid() and r.id = pointages.salarie_id
    )
  );

-- ----------------------------------------------------------------------------
-- Compteur d'heures supplémentaires : généralisé pour fonctionner aussi bien
-- pour un(e) collaborateur/trice (table employes, pointages.employe_id) que
-- pour une référente (table referents, pointages.salarie_id). Même
-- référentiel 1607h proraté que précédemment.
-- ----------------------------------------------------------------------------
create or replace function public.kk_collaborateur_heures_annuelles(p_annee int)
returns table(
  heures_realisees numeric,
  heures_dues numeric,
  solde numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employe        public.employes;
  v_referent       public.referents;
  v_id             uuid;
  v_est_employe    boolean;
  v_heures_hebdo   numeric;
  v_date_debut     date;
  v_date_fin       date;
  v_debut_annee    date := make_date(p_annee, 1, 1);
  v_fin_annee      date := make_date(p_annee, 12, 31);
  v_periode_debut  date;
  v_periode_fin    date;
  v_jours_periode  int;
  v_realisees      numeric := 0;
  v_dues           numeric;
begin
  select * into v_employe from public.employes where user_id = auth.uid();
  if v_employe.id is not null then
    v_est_employe := true;
    v_id := v_employe.id;
    v_heures_hebdo := v_employe.heures_hebdo;
    v_date_debut := v_employe.date_debut;
    v_date_fin := v_employe.date_fin;
  else
    select * into v_referent from public.referents where user_id = auth.uid();
    if v_referent.id is null then
      raise exception 'Aucune fiche collaborateur ou référente liée à ce compte.';
    end if;
    v_est_employe := false;
    v_id := v_referent.id;
    v_heures_hebdo := v_referent.heures_hebdo;
    v_date_debut := v_referent.date_debut;
    v_date_fin := v_referent.date_fin;
  end if;

  -- Heures réalisées : appariement chronologique arrivée→départ.
  select coalesce(sum(extract(epoch from (p.depart - p.arrivee)) / 3600.0), 0)
    into v_realisees
  from (
    select
      horodatage as arrivee,
      lead(horodatage) over (order by horodatage) as depart,
      action,
      lead(action) over (order by horodatage) as action_suivante
    from public.pointages
    where ((v_est_employe and employe_id = v_id) or (not v_est_employe and salarie_id = v_id))
      and horodatage >= v_debut_annee and horodatage < (v_fin_annee + 1)
  ) p
  where p.action = 'arrivee' and p.action_suivante = 'depart';

  -- Heures dues : 1607h temps plein, proratées temps de travail contractuel
  -- et période de présence effective dans l'année (contrat borné).
  v_periode_debut := greatest(v_debut_annee, coalesce(v_date_debut, v_debut_annee));
  v_periode_fin := least(v_fin_annee, coalesce(v_date_fin, v_fin_annee));
  if v_periode_fin < v_periode_debut then
    v_dues := 0;
  else
    v_jours_periode := (v_periode_fin - v_periode_debut) + 1;
    v_dues := 1607.0
      * (coalesce(v_heures_hebdo, 35) / 35.0)
      * (v_jours_periode::numeric / (v_fin_annee - v_debut_annee + 1));
  end if;

  return query select
    round(v_realisees, 2),
    round(v_dues, 2),
    round(v_realisees - v_dues, 2);
end;
$$;

revoke all on function public.kk_collaborateur_heures_annuelles(int) from public;
grant execute on function public.kk_collaborateur_heures_annuelles(int) to authenticated;
