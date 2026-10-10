-- ============================================================================
-- Compteur d'heures annualisées : passage du référentiel 1607h à 1820,04h
-- (12 mois x 151,67h/mois, base retenue par la direction pour le calcul du
-- temps de travail dû, en remplacement de la durée légale annuelle 1607h
-- utilisée jusqu'ici dans kk_collaborateur_heures_annuelles).
-- Le reste du calcul est inchangé : la référence temps plein est toujours
-- proratée selon `heures_hebdo` (employes/referents) et selon la période de
-- présence effective dans l'année (date_debut/date_fin du contrat).
-- ============================================================================

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

  -- Heures dues : 1820,04h temps plein (12 x 151,67h), proratées temps de
  -- travail contractuel et période de présence effective dans l'année
  -- (contrat borné).
  v_periode_debut := greatest(v_debut_annee, coalesce(v_date_debut, v_debut_annee));
  v_periode_fin := least(v_fin_annee, coalesce(v_date_fin, v_fin_annee));
  if v_periode_fin < v_periode_debut then
    v_dues := 0;
  else
    v_jours_periode := (v_periode_fin - v_periode_debut) + 1;
    v_dues := 1820.04
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
