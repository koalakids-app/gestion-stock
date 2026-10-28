-- Incidents déclarés depuis l'Accès terrain par un compte « employe ».
-- Jusqu'ici seules les policies `direction_all_incidents` et `inc_referent`
-- existaient : l'INSERT d'un employé était refusé par la RLS, donc l'incident
-- n'arrivait jamais dans Demandes › Incidents.
-- À appliquer à la main dans le SQL Editor.

drop policy if exists inc_employe on public.incidents;
create policy inc_employe on public.incidents
  for all to authenticated
  using      (kk_mon_role() = 'employe' and creche_id = kk_ma_creche())
  with check (kk_mon_role() = 'employe' and creche_id = kk_ma_creche());
