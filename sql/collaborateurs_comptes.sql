-- ============================================================================
-- Comptes de connexion pour les collaborateurs/trices (table `employes`)
-- ============================================================================
-- Jusqu'ici `employes.user_id` existait mais n'était pas exploité (voir
-- commentaire de sql/module_employes.sql). Ce script l'active :
--   - un(e) collaborateur/trice peut désormais se connecter (compte auth.users
--     créé côté serveur par la fonction Edge `creer-compte-collaborateur`,
--     qui pose `employes.user_id`) ;
--   - une fois connecté(e), il/elle peut lire SA PROPRE fiche, SON planning
--     (table `planning_equipe`, qui liste déjà tout le monde par prénom —
--     import Excel, cf. demandes.html) et SES pointages (pour calculer son
--     compteur d'heures supplémentaires annualisées).
-- Aucun droit d'écriture n'est donné : la fiche, le planning et les pointages
-- restent saisis/importés par la direction/référente, comme aujourd'hui.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Un(e) collaborateur/trice peut lire sa propre fiche `employes`.
-- ----------------------------------------------------------------------------
create policy employes_select_self on public.employes
  for select to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2) Un(e) collaborateur/trice peut lire les lignes de planning_equipe qui le
--    concernent : même crèche que sa fiche, prénom identique (comparaison
--    insensible à la casse/aux espaces, le rapprochement se fait par prénom
--    car planning_equipe est alimenté par import Excel, sans employe_id).
-- ----------------------------------------------------------------------------
create policy planning_equipe_select_self on public.planning_equipe
  for select to authenticated
  using (
    exists (
      select 1 from public.employes e
      where e.user_id = auth.uid()
        and e.creche_id = planning_equipe.creche_id
        and lower(trim(e.prenom)) = lower(trim(planning_equipe.prenom))
    )
  );

-- ----------------------------------------------------------------------------
-- 3) Un(e) collaborateur/trice peut lire ses propres pointages (nécessaire au
--    calcul du compteur d'heures — arrivées/départs déjà horodatés).
-- ----------------------------------------------------------------------------
create policy pointages_select_self_employe on public.pointages
  for select to authenticated
  using (
    exists (
      select 1 from public.employes e
      where e.user_id = auth.uid() and e.id = pointages.employe_id
    )
  );

-- ----------------------------------------------------------------------------
-- 4) Compteur d'annualisation des heures supplémentaires.
--    Référentiel simple pour démarrer : 1607h/an (durée légale temps plein),
--    proraté selon `employes.heures_hebdo` quand elle est renseignée
--    (heures_dues = 1607 * heures_hebdo/35), et selon la période de présence
--    dans l'année (date_debut/date_fin du contrat) quand elle est connue.
--    Heures réalisées = somme des durées arrivée→départ (pointages, source
--    kiosque) sur l'année civile demandée. Un départ sans arrivée préalable
--    (ou l'inverse) est ignoré : la paire s'apparie par ordre chronologique.
--    À ajuster plus tard si la convention collective réelle diffère.
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
  v_debut_annee    date := make_date(p_annee, 1, 1);
  v_fin_annee      date := make_date(p_annee, 12, 31);
  v_periode_debut  date;
  v_periode_fin    date;
  v_jours_periode  int;
  v_realisees      numeric := 0;
  v_dues           numeric;
begin
  select * into v_employe from public.employes where user_id = auth.uid();
  if v_employe.id is null then
    raise exception 'Aucune fiche collaborateur liée à ce compte.';
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
    where employe_id = v_employe.id
      and horodatage >= v_debut_annee and horodatage < (v_fin_annee + 1)
  ) p
  where p.action = 'arrivee' and p.action_suivante = 'depart';

  -- Heures dues : 1607h temps plein, proratées temps de travail contractuel
  -- et période de présence effective dans l'année (contrat borné).
  v_periode_debut := greatest(v_debut_annee, coalesce(v_employe.date_debut, v_debut_annee));
  v_periode_fin := least(v_fin_annee, coalesce(v_employe.date_fin, v_fin_annee));
  if v_periode_fin < v_periode_debut then
    v_dues := 0;
  else
    v_jours_periode := (v_periode_fin - v_periode_debut) + 1;
    v_dues := 1607.0
      * (coalesce(v_employe.heures_hebdo, 35) / 35.0)
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
