-- documents_reponses : un employé (rôle `employe`) crée ses propres réponses, les modifie tant qu'elles
-- ne sont ni signées ni remises, et ne voit ni ne touche celles des autres. À appliquer à la main.
-- Les autres rôles gardent exactement leurs droits.
alter policy docrep_select on public.documents_reponses using (
  (
    ((creche_id is not null) and kk_acces_creche(creche_id))
    or ((creche_id is null) and org_id = kk_mon_org())
  )
  and (coalesce(kk_mon_role(), '') <> 'employe' or rempli_par = auth.uid())
);

alter policy docrep_insert on public.documents_reponses with check (
  (
    ((creche_id is not null) and kk_acces_creche(creche_id))
    or ((creche_id is null) and org_id = kk_mon_org())
  )
  and (coalesce(kk_mon_role(), '') <> 'employe' or rempli_par = auth.uid())
);

alter policy docrep_update on public.documents_reponses using (
  (
    ((creche_id is not null) and kk_acces_creche(creche_id))
    or ((creche_id is null) and org_id = kk_mon_org())
  )
  and (coalesce(kk_mon_role(), '') <> 'employe'
       or (rempli_par = auth.uid() and coalesce(statut, '') not in ('signe', 'remis')))
) with check (
  (
    ((creche_id is not null) and kk_acces_creche(creche_id))
    or ((creche_id is null) and org_id = kk_mon_org())
  )
  and (coalesce(kk_mon_role(), '') <> 'employe' or rempli_par = auth.uid())
);

alter policy docrep_delete on public.documents_reponses using (
  ((creche_id is not null) and kk_acces_creche(creche_id) and (kk_mon_role() = 'direction'))
  or ((creche_id is null) and (org_id = kk_mon_org()) and (kk_mon_role() = 'direction'))
  or (
    (creche_id = kk_ma_creche()) and (coalesce(statut, '') <> 'signe')
    and (coalesce(kk_mon_role(), '') <> 'employe' or rempli_par = auth.uid())
  )
);
