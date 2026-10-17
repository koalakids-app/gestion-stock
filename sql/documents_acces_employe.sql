-- Documents ouverts aux employés (rôle `employe`, Accès terrain) : case cochée
-- dans Documents › Modifier le document. À appliquer à la main sur Supabase.
alter table public.documents_koala add column if not exists acces_employe boolean not null default false;

-- Reprise de l'existant : l'autorisation de médicament ponctuelle était déjà proposée sur l'Accès terrain.
update public.documents_koala set acces_employe = true where template_key = 'medicament_ponctuel';

-- RLS : un employé ne lit que les documents cochés « Ouvert aux employés » et n'écrit jamais.
-- (docs_write, FOR ALL, lui ouvrait aussi la lecture via kk_acces_creche : on l'exclut.)
-- Catégories ouvertes aux employés : tous les documents de la catégorie et de ses sous-catégories.
alter table public.doc_categories add column if not exists acces_employe boolean not null default false;

create or replace function public.kk_cat_ouverte_employes(cat uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  with recursive remonte as (
    select id, parent_id, acces_employe, 1 as n from public.doc_categories where id = cat
    union all
    select c.id, c.parent_id, c.acces_employe, r.n + 1 from public.doc_categories c join remonte r on c.id = r.parent_id where r.n < 6
  )
  select coalesce(bool_or(acces_employe), false) from remonte;
$$;

alter policy docs_read on public.documents_koala using (
  (
    ((creche_id is not null) and creche_id in (select id from public.creches where org_id = kk_mon_org()))
    or ((creche_id is null) and org_id = kk_mon_org())
  )
  and (
    coalesce(kk_mon_role(), '') <> 'employe'
    or (
      (acces_employe or (categorie_id is not null and kk_cat_ouverte_employes(categorie_id)))
      and (creche_id is null or kk_acces_creche(creche_id))
    )
  )
);

update public.doc_categories set acces_employe = true where lower(translate(nom,'éÉ','eE')) like 'protocole%' and parent_id is null;

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
