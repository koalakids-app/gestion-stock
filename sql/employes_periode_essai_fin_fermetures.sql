-- ============================================================================
-- Fin de la période d'essai — report en cas de fermeture "vacances"
-- ============================================================================
-- kk_trg_set_periode_essai_fin (cf. sql/employes_periode_essai_fin.sql) ne
-- faisait jusqu'ici que date_debut + 2 ou 4 mois, sans tenir compte des
-- absences : légalement, la période d'essai est suspendue (donc son terme
-- reporté d'autant) pendant les congés du salarié. La seule donnée
-- d'absence disponible aujourd'hui dans l'app est le calendrier des
-- fermetures de crèche (sql/etablissements_jours_fermeture.sql, type
-- "vacances" uniquement — jours fériés et journées pédagogiques isolés ne
-- suspendent pas l'essai).
--
-- Pour chaque fermeture "vacances" (propre à la crèche de la fiche, ou du
-- réseau entier via reseau_config.config->'jours_fermeture_reseau') qui
-- tombe dans la période d'essai en cours, sa durée est ajoutée à la date de
-- fin. En boucle : repousser la fin peut faire entrer une nouvelle
-- fermeture dans la fenêtre (ex. la fin recalculée tombe juste avant les
-- vacances de la Toussaint). Même règle côté base (ici, source de vérité)
-- que côté client (empPeriodeEssaiFin, demandes.html), qui ne fait que
-- l'anticiper pour l'affichage immédiat en attendant l'aller-retour serveur.
-- ============================================================================

create or replace function public.kk_trg_set_periode_essai_fin()
returns trigger
language plpgsql
as $$
declare
  fin date;
  ferms jsonb;
  f jsonb;
  f_debut date;
  f_fin date;
  jours int;
  comptees text[] := '{}';
  cle text;
  changed boolean;
begin
  if new.date_debut is null then
    new.periode_essai_fin := null;
    return new;
  end if;

  fin := new.date_debut
    + (case when new.periode_essai_renouvelee then interval '4 months' else interval '2 months' end);

  select coalesce(e.jours_fermeture,'[]'::jsonb)
      || coalesce((select rc.config->'jours_fermeture_reseau' from public.reseau_config rc limit 1),'[]'::jsonb)
    into ferms
    from public.etablissements e
    where e.creche_id = new.creche_id;

  if ferms is null then
    ferms := '[]'::jsonb;
  end if;

  changed := true;
  while changed loop
    changed := false;
    for f in select value from jsonb_array_elements(ferms) as value loop
      if (f->>'type') is distinct from 'vacances' then continue; end if;
      if (f->>'debut') is null then continue; end if;
      f_debut := (f->>'debut')::date;
      f_fin := coalesce((f->>'fin')::date, f_debut);
      cle := f_debut::text || '|' || f_fin::text;
      if cle = any(comptees) then continue; end if;
      if f_debut > fin or f_fin < new.date_debut then continue; end if;
      comptees := comptees || cle;
      jours := (f_fin - f_debut) + 1;
      fin := fin + jours;
      changed := true;
    end loop;
  end loop;

  new.periode_essai_fin := fin;
  return new;
end;
$$;

-- Recalcul des fiches existantes non encore actées (une fiche actée n'a
-- plus besoin d'alerte, inutile de la retoucher).
update public.employes
  set periode_essai_fin = periode_essai_fin -- déclenche le trigger, qui refait le calcul
  where date_debut is not null and periode_essai_actee = false;
