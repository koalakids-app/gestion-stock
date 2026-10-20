# Koala Kids — notes pour Claude

Voir `README.md` pour l'architecture générale. Pas de build : HTML + JS vanilla, les scripts sont
chargés tels quels par les pages (ex. `demandes.html` charge `js/pages/demandes/*.js` et `js/enfants/*.js`).

## Base de données (Supabase)
- Projet utilisé par l'application : `juyrceadazrovlitxceb` (le second projet du compte, `drxqjeilbunpfqyecpdg`, n'a pas la table `enfants`).
- Les changements de schéma s'appliquent à la main sur Supabase ; garder un fichier dans `sql/` pour chacun.
- L'outil MCP Supabase expire parfois (60 s) sur un `drop column` : lancer alors le SQL dans le SQL Editor.
- Colonnes/contraintes ajoutées hors dépôt (à versionner dans `sql/` si besoin) :
  - `enfants_gouter_base_check` accepte `'gbb'`, `'ggr'`, `'creche'`.
  - `pai.panier_repas boolean not null default false`.
- À supprimer quand possible : colonne vide et inutilisée `enfants.pai_panier_repas`.

## Règles métier de la commande repas traiteur (MCM)
- Le comptage vient d'une source unique : `crCountsParJour` (`js/pages/demandes/06-export-direct.js`), utilisée par le bon et par le rappel des effectifs (`mcmCmdRenderEffectifs`, `04-filtre-presents-uniquement.js`).
- Exclus du bon : enfants au biberon (BIB), **goûter crèche** (`enfants.gouter_base = 'creche'`, uniquement le goûter), **PAI actif avec panier repas** (repas et goûter).
- Aucun goûter avant 6 mois ; le régime SV n'existe pas au goûter.
- Ligne du bon : le code repas décide, pas l'âge (`mcmLigne`) — BB → « Bébés − de 6 mois », M → « Bébés 6-18 mois », G → « Grands » (ou périscolaire à partir de 48 mois).
- Repas BB (légumes sans protéines, avec ou sans régime) : goûter compris dans le repas, donc aucun goûter ; le goûter « bébé » (`gbb`) s'appelle désormais « goûter moyen » à l'écran.
- Le PAI se saisit **dans le registre de soins** (`infirmerie.html`, table `pai`, case « Panier repas »). La fiche enfant le **lit** (`enfPaiCharger`, `enfPaiPanier` dans `js/enfants/01-core.js`), elle ne le modifie pas. Un PAI clôturé remet l'enfant dans la commande.

## Menu du traiteur par QR code
- `menu.html` (page publique, sans compte) lit la fonction `menu_public(date)` (`sql/menu_public.sql`, à appliquer à la main) : une seule semaine, colonnes d'affichage uniquement. Le QR se génère dans MCM › Menus (`mcmMenuQr`) ; version « permanente » sans date = semaine en cours.
- Goûters faits par la crèche : table `menus_gouters_creche` (`sql/menus_gouters_creche.sql`, à appliquer à la main ; accès via `kk_acces_creche`), deux textes par crèche et par jour (`gouter` = moyens, `gouter_grand` = grands ; `sql/gouters_creche_moyen_grand.sql`), qui remplacent `bb18_gouter`/`grand_gouter` du traiteur pour cette crèche (`js/pages/demandes/13-gouters-creche.js`). `menu_public(date, crèche)` fusionne les deux ; le QR d'un référent porte `?c=<id crèche>`.
- Goûter moyen : deux lignes par jour (produit 1 / produit 2, texte stocké « a / b ») avec un effectif chacune (`gouters_creche_effectifs.moyens_l1`/`moyens_l2`, `sql/gouters_creche_moyens_lignes.sql`, à appliquer à la main ; `moyens` = le plus grand des deux).
- Option « cette crèche fait tous ses goûters » : table `gouters_creche_options` (`sql/gouters_creche_option_tous.sql`) ; jour vide = aucun goûter affiché, et `crCountsParJour` ne compte aucun goûter pour cette crèche (`gouterTous`).

- Recettes des goûters : tables `recettes`, `recettes_ingredients`, `gouters_creche_effectifs` (moyens/grands par jour), `gouters_creche_recettes` (`sql/recettes_gouters.sql`, à appliquer à la main). Recettes communes aux crèches (écriture direction via `kk_est_direction()`), allergènes par ingrédient. Logique et récapitulatif 2 semaines dans `js/pages/demandes/14-recettes-gouters.js` (`gcLignes` calcule les produits à commander).

## Projet pédagogique
- Page publique `projet-pedagogique.html` (sans compte, lien à envoyer) : le PDF `projet-pedagogique-koalakids.pdf` (racine) se feuillette comme un livre (pdf.js + page-flip depuis un CDN, `js/pages/projet-pedagogique.js`, pages dessinées à la demande) et reste téléchargeable. Le même lecteur sert aux PDF de Documents (bouton livre de `docRowHtml`, via `?f=<url>&t=<titre>`). Le projet pédagogique lui-même s'affiche à partir d'images pré-calculées `projet-pedagogique-pages/p-001.jpg…` (sans pdf.js, `NB_PAGES` dans le JS) : pour le mettre à jour, remplacer le PDF puis régénérer les images (`pdftoppm -jpeg -jpegopt quality=70,optimize=y -scale-to-x 900 -scale-to-y -1 projet-pedagogique-koalakids.pdf projet-pedagogique-pages/p`) et ajuster `NB_PAGES`. La recherche par mot lit `projet-pedagogique-texte.json` (texte de chaque page, issu de `pdftotext -f N -l N`, points de suite retirés) : à régénérer avec le PDF. Notice : section « Projet pédagogique » de `js/pages/documents-2.js`.

## Archives sur disque dur
- Export des dossiers archivés d'une crèche en un .zip (direction uniquement) : `archExporterCreche` (`js/pages/parametres-archives.js`), carte « Archives sur disque dur » dans Paramètres › Les établissements (crèche sélectionnée). Il couvre enfants archivés, employés archivés et stagiaires clos, puis supprime les fichiers de Supabase après confirmation et écrit une ligne par dossier dans `archivage_purges`. Les exports dossier par dossier sont eux aussi réservés à la direction (`isDirection`).

- Coffre-fort, étape 1 : journal `acces_documents` (`sql/acces_documents.sql`, à appliquer à la main), alimenté par `kkJournaliserAcces` (`js/coffre-journal.js`) à chaque `createSignedUrl` de document sensible ; affiché dans Paramètres (`coffreChargerJournal`, `js/pages/parametres-archives.js`). `sql/storage_retirer_acces_anonyme.sql` retire des policies `anon` « allow all » sur `storage.objects` (audit du 2026) : à appliquer à la main après test des pages publiques.
- Coffre-fort, étape 2 : `sql/storage_filtrage_par_creche.sql` (à appliquer à la main) limite la lecture/écriture des buckets `documents-admin`, `carnets`, `stagiaires` (dossier = id de la fiche) et la lecture de `sante` (via `pai.piece_jointe`) à la crèche du référent (`kk_acces_dossier`, `kk_acces_fichier_pai`, `kk_acces_creche`) ; la direction garde tout.

## Module Stock
- Les référents lisent l'inventaire, les commandes et l'historique de **toutes** les crèches de l'organisation (lecture seule) ; l'écriture reste limitée à leur crèche. Policies SELECT `*_lecture_organisation` dans `sql/stock_lecture_organisation_referents.sql` (appliquées). Le stock de couches d'une référente reste limité à sa crèche.

## Messages aux employés
- Sens unique, direction/référents → employés : `messages_employes` + `messages_employes_destinataires` (`sql/messages_employes.sql`, à appliquer à la main ; une instruction à la fois si l'éditeur expire). Écriture dans Demandes (`js/pages/demandes/15-messages-employes.js`, bouton « Message aux employés »), lecture dans Mon espace (`loadMessages`, `js/pages/collaborateur.js`). Seuls les employés avec `employes.user_id` reçoivent.
- Push employés : `push_subscriptions.employe_id` (au lieu de `referent_id`), enregistré par la RPC `upsert_push_subscription` ; `notify-push` accepte `employe_ids`. Pendant le silence (heures, week-end, férié), rien n'est retenu pour les employés : le message reste dans Mon espace.
- Les notifications des référents tenues pendant le silence vont dans `notifs_retenues` (`sql/notifs_retenues.sql`) et sont livrées à la première connexion hors silence (`livrerNotifsRetenues`).

## Notice de l'application
- Notice Demandes : `js/pages/demandes-2.js` (sections `enfants`, `mcm`, etc.).
- Notice du registre de soins : bloc « Les PAI » dans `js/pages/infirmerie.js`.
- Bouton « ? » flottant sur toutes les pages internes : `js/notice-flottante.js` (ouvre `openNotice()` / `#btnNotice` de la page, sinon un court mode d'emploi par page dans `PAGES`). Une nouvelle page interne doit charger ce script après `support-chat.js`.
- Dans Demandes, la notice s'ouvre sur l'onglet de la section en cours (`NOTICE_ONGLET_SECTION`, `js/pages/demandes-2.js`) : une nouvelle section doit y être associée.
- Toute modification fonctionnelle doit mettre la notice à jour.

## Habitudes de travail
- Branche de développement de la session, pull request vers `main` en **squash**.
- Après une fusion, repartir de `origin/main` (`git checkout -B <branche> origin/main`) ; le push demande `--force-with-lease`.
- Vérifier la syntaxe des JS modifiés avec `node --check`.
