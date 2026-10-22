-- ============================================================================
-- Documents : crée le modèle « Plan de maîtrise sanitaire (PMS) »
-- (template_key = pms_sanitaire), à remplir et à signer en ligne, dans la
-- catégorie Protocoles (sous-catégorie « hygiène » ou « sanitaire » si elle
-- existe), pour chaque organisation.
-- ============================================================================
-- À exécuter dans le SQL Editor Supabase (rôle postgres : kk_mon_org() est
-- alors NULL, d'où l'org_id posé explicitement). Idempotent : peut être relancé,
-- ne crée ni catégorie ni document en double.
-- Le modèle lui-même (formulaire, pré-remplissage depuis la crèche choisie et
-- PDF) vit dans js/pages/documents/07-pms-sanitaire.js. Il lit
-- etablissements et creches.capacity / capacity_surnombre : aucun changement
-- de schéma n'est nécessaire.
-- ============================================================================

do $$
declare
  o record;
  cat_id uuid;
begin
  for o in select id from public.organisations loop
    -- 1) sous-catégorie « hygiène / sanitaire » ; 2) racine « Protocoles… » ; 3) création
    select id into cat_id from public.doc_categories
     where org_id = o.id and parent_id is not null
       and (lower(translate(nom,'éÉèêù','eEeeu')) like '%hygiene%'
         or lower(translate(nom,'éÉèêù','eEeeu')) like '%sanitaire%')
     order by ordre limit 1;

    if cat_id is null then
      select id into cat_id from public.doc_categories
       where org_id = o.id and parent_id is null
         and lower(nom) like 'protocole%'
       order by ordre limit 1;
    end if;

    if cat_id is null then
      insert into public.doc_categories (org_id, nom, parent_id, couleur, ordre)
      values (o.id, 'Protocoles', null, '#4A3F9F',
              coalesce((select max(ordre) from public.doc_categories where org_id = o.id), 0) + 1)
      returning id into cat_id;
    end if;

    if not exists (
      select 1 from public.documents_koala
       where org_id = o.id and template_key = 'pms_sanitaire' and actif is not false
    ) then
      insert into public.documents_koala
        (org_id, titre, description, categorie_id, creche_id, type, template_key, schema_champs)
      values
        (o.id,
         'Plan de maîtrise sanitaire (PMS)',
         'Plan de maîtrise sanitaire d’une micro-crèche en liaison froide (repas livrés, réchauffés sur place) : bonnes pratiques, analyse des dangers, traçabilité, non-conformités, formation et fiches d’enregistrement. Les informations de la crèche se remplissent seules. À remplir et à signer en ligne.',
         cat_id, null, 'remplissable', 'pms_sanitaire', '[]'::jsonb);
    end if;
  end loop;
end $$;
