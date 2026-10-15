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
- Option « cette crèche fait tous ses goûters » : table `gouters_creche_options` (`sql/gouters_creche_option_tous.sql`) ; jour vide = aucun goûter affiché, et `crCountsParJour` ne compte aucun goûter pour cette crèche (`gouterTous`).

## Notice de l'application
- Notice Demandes : `js/pages/demandes-2.js` (sections `enfants`, `mcm`, etc.).
- Notice du registre de soins : bloc « Les PAI » dans `js/pages/infirmerie.js`.
- Toute modification fonctionnelle doit mettre la notice à jour.

## Habitudes de travail
- Branche de développement de la session, pull request vers `main` en **squash**.
- Après une fusion, repartir de `origin/main` (`git checkout -B <branche> origin/main`) ; le push demande `--force-with-lease`.
- Vérifier la syntaxe des JS modifiés avec `node --check`.
