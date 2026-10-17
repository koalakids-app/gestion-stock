-- Documents ouverts aux employés (rôle `employe`, Accès terrain) : case cochée
-- dans Documents › Modifier le document. À appliquer à la main sur Supabase.
alter table public.documents_koala add column if not exists acces_employe boolean not null default false;

-- Reprise de l'existant : l'autorisation de médicament ponctuelle était déjà proposée sur l'Accès terrain.
update public.documents_koala set acces_employe = true where template_key = 'medicament_ponctuel';

-- RLS : un employé ne lit que les documents cochés « Ouvert aux employés » et n'écrit jamais.
-- (docs_write, FOR ALL, lui ouvrait aussi la lecture via kk_acces_creche : on l'exclut.)
alter policy docs_read on public.documents_koala using (
  (
    ((creche_id is not null) and creche_id in (select id from public.creches where org_id = kk_mon_org()))
    or ((creche_id is null) and org_id = kk_mon_org())
  )
  and (
    coalesce(kk_mon_role(), '') <> 'employe'
    or (acces_employe and (creche_id is null or kk_acces_creche(creche_id)))
  )
);

alter policy docs_write on public.documents_koala using (
  coalesce(kk_mon_role(), '') <> 'employe' and (
    ((creche_id is not null) and kk_acces_creche(creche_id))
    or ((creche_id is null) and org_id = kk_mon_org() and kk_mon_role() = 'direction')
  )
) with check (
  coalesce(kk_mon_role(), '') <> 'employe' and (
    ((creche_id is not null) and kk_acces_creche(creche_id))
    or ((creche_id is null) and org_id = kk_mon_org() and kk_mon_role() = 'direction')
  )
);
