-- ============================================================================
-- Période d'essai en CDD (art. L1242-10 du Code du travail)
-- ============================================================================
-- Jusqu'ici le trigger appliquait 2 mois (4 renouvelée) à tous les contrats.
-- En CDD : 1 jour par semaine de contrat (semaines entières), plafonné à
-- 2 semaines si le contrat dure 6 mois au plus, à 1 mois au-delà ; pas de
-- renouvellement. Sans date de fin (terme imprécis) : plafond de 2 semaines.
-- Le report pour fermetures "vacances" est conservé. Même règle côté client :
-- empPeriodeEssaiFin (demandes.html).
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
  duree_j int;
  limite date;
  changed boolean;
begin
  if new.date_debut is null then
    new.periode_essai_fin := null;
    return new;
  end if;

  if new.type_contrat = 'CDD' then
    if new.date_fin is not null and new.date_fin >= new.date_debut then
      duree_j := (new.date_fin - new.date_debut) + 1;
      limite := (new.date_debut + interval '6 months')::date;
      if new.date_fin < limite then
        fin := new.date_debut + least(duree_j / 7, 14);
      else
        fin := (new.date_debut + interval '1 month')::date;
      end if;
    else
      fin := new.date_debut + 14;
    end if;
  else
    fin := (new.date_debut
      + (case when new.periode_essai_renouvelee then interval '4 months' else interval '2 months' end))::date;
  end if;

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


update public.employes
  set periode_essai_fin = periode_essai_fin -- déclenche le trigger
  where date_debut is not null and periode_essai_actee = false;
