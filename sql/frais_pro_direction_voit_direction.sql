-- Frais pro : la direction doit voir (et régler) aussi les dépenses des membres de la
-- direction, qui n'ont pas de crèche (referents.creche_id IS NULL).
-- Cause : kk_acces_creche(NULL) vaut toujours false, et les policies update/delete
-- exigeaient creche_id dans les crèches de l'organisation -> dépenses invisibles.
-- On rattache désormais la personne à l'organisation via referents.org_id.

drop policy if exists frais_pro_select_own_or_direction on public.frais_pro;
create policy frais_pro_select_own_or_direction on public.frais_pro
for select using (
  person_id in (select r.id from public.referents r where r.user_id = auth.uid())
  or kk_acces_creche((select r2.creche_id from public.referents r2 where r2.id = frais_pro.person_id))
  or (kk_est_direction() and exists (
        select 1 from public.referents r
        where r.id = frais_pro.person_id and r.org_id = kk_mon_org()))
);

drop policy if exists frais_pro_update on public.frais_pro;
create policy frais_pro_update on public.frais_pro
for update using (
  (kk_est_direction() and exists (
     select 1 from public.referents r
     where r.id = frais_pro.person_id and r.org_id = kk_mon_org()))
  or (person_id = kk_mon_ref_id() and coalesce(regle,false) = false)
) with check (
  (kk_est_direction() and exists (
     select 1 from public.referents r
     where r.id = frais_pro.person_id and r.org_id = kk_mon_org()))
  or (person_id = kk_mon_ref_id() and coalesce(regle,false) = false)
);

drop policy if exists frais_pro_delete on public.frais_pro;
create policy frais_pro_delete on public.frais_pro
for delete using (
  (kk_est_direction() and exists (
     select 1 from public.referents r
     where r.id = frais_pro.person_id and r.org_id = kk_mon_org()))
  or (person_id = kk_mon_ref_id() and coalesce(regle,false) = false)
);
