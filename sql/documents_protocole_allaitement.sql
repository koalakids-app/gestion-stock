-- ============================================================================
-- Documents : crée le modèle « Protocole allaitement maternel »
-- (template_key = allaitement), à lire et à signer en ligne, dans la catégorie « Santé »,
-- pour chaque organisation.
-- ============================================================================
-- À exécuter dans le SQL Editor Supabase (rôle postgres : kk_mon_org() est
-- alors NULL, d'où l'org_id posé explicitement). Idempotent : peut être relancé,
-- ne crée ni catégorie ni document en double.
-- Le modèle lui-même (formulaire + PDF) vit dans js/pages/documents/03-part.js et js/pages/famille.js.
-- ============================================================================

do $$
declare
  o record;
  cat_id uuid;
begin
  for o in select id from public.organisations loop
    -- Catégorie racine « Santé » (réutilise l'existante, sans tenir compte de la casse/accents)
    select id into cat_id
      from public.doc_categories
     where org_id = o.id and parent_id is null
       and lower(translate(nom,'éÉ','eE')) = 'sante'
     order by ordre limit 1;

    if cat_id is null then
      insert into public.doc_categories (org_id, nom, parent_id, couleur, ordre)
      values (o.id, 'Santé', null, '#4A3F9F',
              coalesce((select max(ordre) from public.doc_categories where org_id = o.id), 0) + 1)
      returning id into cat_id;
    end if;

    -- Document remplissable basé sur le modèle prédéfini
    if not exists (
      select 1 from public.documents_koala
       where org_id = o.id and template_key = 'allaitement' and actif is not false
    ) then
      insert into public.documents_koala
        (org_id, titre, description, categorie_id, creche_id, type, template_key, schema_champs)
      values
        (o.id,
         'Protocole allaitement maternel',
         'Protocole de recueil, conservation et transport du lait maternel, à remplir et à signer en ligne par le parent.',
         cat_id, null, 'remplissable', 'allaitement', '[]'::jsonb);
    end if;
  end loop;
end $$;
