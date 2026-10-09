-- ============================================================================
-- Livret d'accueil du stagiaire (document en ligne, signé sur le lien du stagiaire)
-- ============================================================================
-- Le modèle est le gabarit `livret_stagiaire` de documents.html : texte commun,
-- complété par les données de la crèche (nom, adresse, capacité, équipe…) et
-- modifiable livret par livret. Ce script ne fait que créer l'entrée dans la
-- liste des documents ; le reste est dans l'application.
--
-- Circuit : documents.html -> remplir le livret, choisir la fiche stagiaire,
-- cocher « Mettre ce livret à signer sur le lien du stagiaire » -> il apparaît
-- dans « Documents à signer » de stagiaire.html (edge function dossier-stagiaire,
-- actions `get` et `livret_signer`) -> statut « signe » + signature,
-- horodatage, IP et empreinte du texte dans documents_reponses.
--
-- Rien à migrer côté schéma : tout passe par documents_koala / documents_reponses
-- (donnees jsonb). L'edge function dossier-stagiaire doit être redéployée
-- (--no-verify-jwt).
-- ============================================================================
-- org_id : le trigger trg_documents_koala_set_org_id le renseigne depuis l'utilisateur
-- connecté ; dans l'éditeur SQL il n'y en a pas, on le prend donc sur la crèche (une
-- seule organisation). Alternative sans SQL : Documents > Nouveau document >
-- « Remplissable » > modèle « Livret d'accueil du stagiaire (crèche) ».
-- Rangé dans Ressources humaines > Stagiaires, avec les anciens livrets par crèche :
-- sans catégorie, il atterrirait dans « Sans catégorie » (dossier replié, en bas de
-- la liste) et passerait inaperçu. La catégorie est cherchée par son nom ; si elle
-- n'existe pas, le document est créé sans catégorie.
insert into public.documents_koala (titre, description, type, template_key, schema_champs, actif, org_id, categorie_id)
select 'Livret d''accueil du stagiaire',
       'Livret d''accueil et acte d''engagement, au nom de la crèche, à faire signer en ligne par le stagiaire.',
       'remplissable', 'livret_stagiaire', '[]'::jsonb, true,
       (select org_id from public.creches order by created_at limit 1),
       (select c.id from public.doc_categories c
          join public.doc_categories p on p.id = c.parent_id
         where c.nom = 'Stagiaires' and p.nom = 'Ressources humaines' limit 1)
where not exists (select 1 from public.documents_koala where template_key = 'livret_stagiaire');

-- Déjà créé sans catégorie (première version du script) : on le range.
update public.documents_koala k
   set categorie_id = (select c.id from public.doc_categories c
                         join public.doc_categories p on p.id = c.parent_id
                        where c.nom = 'Stagiaires' and p.nom = 'Ressources humaines' limit 1)
 where k.template_key = 'livret_stagiaire' and k.categorie_id is null;
