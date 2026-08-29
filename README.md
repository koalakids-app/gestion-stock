# Koala Kids — Suite de gestion

Application web de gestion pour un réseau de **6 micro-crèches** de la région toulonnaise
(réseau Koala Kids / Kangourou Kids) : **Brunet, Cuers, Ollioules, Picot 1, Picot 2, St Jean**.

Développée et maintenue en interne par le coordinateur pédagogique (EJE), elle centralise
la coordination des équipes, le suivi des enfants, la gestion du matériel et les obligations
administratives et réglementaires.

---

## Architecture

Pas de framework, pas d'étape de build : chaque outil est un **fichier HTML autonome**
(HTML + CSS + JS vanilla), déployé tel quel.

| Couche | Technologie |
|---|---|
| Frontend | HTML/CSS/JS vanilla, fichier unique par application |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Stockage fichiers | Supabase Storage, bucket public `assets` |
| Emails | Resend (via Edge Functions) |
| Hébergement | GitHub Pages — `koalakids-app.github.io` |
| Client cible | Chrome sur tablette / mobile Android |

**Librairies chargées par CDN :** Supabase JS, SheetJS (XLSX), ExcelJS, JSZip, pdf.js,
html2canvas, jsPDF, Tabler Icons.

> SheetJS ne sait écrire ni couleurs, ni gras, ni bordures dans sa version gratuite :
> les exports mis en forme (présence hebdomadaire, planning PMI) passent par **ExcelJS**,
> chargé en différé — son absence n'empêche pas l'application de fonctionner.

L'application est installable en PWA (`manifest.json` + `sw.js`) : depuis Chrome,
menu ⋮ → *Ajouter à l'écran d'accueil*.

---

## Les fichiers

### Applications principales

| Fichier | Rôle |
|---|---|
| `index.html` | Portail d'accueil — accès à tous les outils |
| `demandes.html` | Application de coordination (14 modules, voir ci-dessous) |
| `stock.html` | Gestion du stock pédagogique et des commandes |
| `documents.html` | Bibliothèque de documents et formulaires avec signature |

### Outils annexes

| Fichier | Rôle |
|---|---|
| `padlets.html` | Liens vers les 8 tableaux Padlet du réseau |
| `signature.html` | Page de signature à distance (ouverte via QR code) |
| `migration-photos-storage.html` | Utilitaire ponctuel : migration des photos base64 vers Storage |
| `manifest.json`, `sw.js` | Configuration PWA |
| `keep-alive.yml` | GitHub Action de ping périodique |

---

## `demandes.html` — modules

| Module | Accès | Description |
|---|---|---|
| **Demandes** | tous | Fil de discussion entre terrain et direction, consignes avec suivi de lecture |
| **Incidents** | tous | Déclaration et suivi des incidents |
| **Présences** | tous | Deux onglets : *Jour* (vue Gantt, pointage) et *Semaine* (grille, synthèse repas, commande traiteur, export Excel). Import PDF commun |
| **Référents** | direction | Annuaire et gestion des comptes de connexion |
| **Planning équipe** | tous | Import Excel/PDF, grille modifiable, impression multi-semaines, envoi PDF par mail, **export PMI** |
| **Remplaçantes** | tous | Créneaux des intervenantes ponctuelles — vues semaine / mois / par personne |
| **Événements** | tous | Calendrier mensuel, 10+ types d'événements colorés |
| **Tableau de bord direction** | direction | Vue consolidée du jour + export/restauration des sauvegardes |
| **Mon tableau de bord** | référent | Vue du jour limitée à sa crèche |
| **Vaccinations** | tous | Suivi des doses obligatoires par enfant, calcul automatique des échéances |
| **Contrôle EAJE** | tous | Grille d'auto-contrôle réglementaire (19 sections), sauvegarde auto, export PDF |
| **Frais IK** | direction | Saisie des trajets, génération du classeur Excel au format officiel |
| **Frais pro** | tous | Dépenses mensuelles, justificatifs, export Excel et envoi par mail |
| **À faire** | perso | Todo quotidien du coordinateur |

### Module Présences — les deux onglets

La barre d'outils du haut s'adapte à l'onglet ouvert (classe `.pres-jour-only`,
bascule par `presMajBarre()`) : les commandes qui agissent sur le sélecteur de date
sont masquées dans la vue Semaine, où elles porteraient sur une journée non affichée.

- **Jour** — vue Gantt, une ligne par enfant, barre horaire 7h–19h. Seul onglet où l'on
  pointe les présences. Commandes propres : navigation de date, *Appliquer les contrats*,
  *Ajouter à la journée*, *Exporter* (récapitulatif du jour).
- **Semaine** — grille hebdomadaire avec horaires réels, synthèse repas, bon de commande
  traiteur et export Excel mis en forme. Navigation de semaine indépendante.

L'ancienne vue « Semaine » en carrés matin/après-midi a été supprimée : elle affichait
les mêmes données en moins riche, sans horaires ni navigation.

### Export PMI

Bouton **Export PMI** du module Planning équipe. Produit le tableau réglementaire attendu
par la PMI, à partir du planning équipe et des présences enfants déjà en base.

Le classeur officiel fourni par la PMI est **embarqué en base64** (`PMI_TEMPLATE_B64`) et
sert de gabarit : l'export ne redessine pas la grille, il ouvre ce fichier avec ExcelJS et
y écrit les données. Mise en page, bordures, largeurs de colonnes et textes réglementaires
restent donc rigoureusement identiques à l'original (même principe que le modèle des frais IK).

Ce qui est calculé automatiquement :

- horaires de chaque salariée, en couleur, pauses déduites, ventilés en personnel
  **diplômé (1°)** ou **qualifié (2°)** de l'article R2324-42 ;
- **nombre d'enfants accueillis** par quart d'heure, déduit des présences (horaires réels
  de l'import en priorité, contrat d'accueil à défaut) ;
- ligne **Direction** — temps de bureau placé dans les heures de travail de la personne,
  au moment où son retrait pèse le moins sur l'accueil ;
- ligne **Entretien/restauration** — répartie sur l'équipe, en priorité hors présence des
  enfants (avant ouverture, après fermeture), puis autour du repas ;
- **récapitulatif hebdomadaire** : heures d'ouverture, capacité, heures et pourcentages.

Contraintes structurantes :

- le temps de bureau et l'entretien sont **prélevés** sur les heures planifiées, jamais
  ajoutés : aucune heure supplémentaire n'est créée, et un test vérifie l'égalité
  `encadrement + bureau + entretien = heures planifiées` pour chaque personne ;
- aucun créneau qui ferait passer sous le minimum légal n'est retenu : à défaut de plage
  sûre, le volume est raccourci et le reliquat signalé ;
- les contrôles réglementaires s'affichent **dans l'application uniquement**, jamais dans
  le fichier remis à la PMI.

Le modèle ne comporte que **6 lignes de salariées par jour** ; au-delà, l'export prévient.

Les saisies non déductibles du planning (nom de famille, qualification, ancienneté,
volume de bureau et d'entretien, horaires d'accueil) sont mémorisées **par crèche dans
`localStorage`** — à renseigner une seule fois.

## `stock.html` — modules

Inventaire (matériel pédagogique + consommables) · Commandes · Fournisseurs ·
Historique · Univers ludiques (avec galeries photo).

## `documents.html`

Bibliothèque de documents classés par catégories emboîtables. Deux types de documents :

- **à télécharger** — un fichier joint, stocké dans le bucket `assets` ;
- **à remplir en ligne** — un formulaire dont les champs sont définis à la création
  (texte, zone de texte, date, e-mail, nombre, case à cocher).

Deux modes de signature, combinables sur un même document :

- **manuscrite** — tracé au doigt ou au stylet directement à l'écran ;
- **à distance** — un QR code est généré, la personne le scanne et signe depuis son
  propre téléphone via `signature.html`. La signature remonte automatiquement dans le
  document. Le lien est valable **30 minutes** ; la page interroge la base toutes les
  3 secondes. Un bouton permet de copier le lien pour l'envoyer par SMS ou mail.

Le signataire à distance n'a besoin ni de compte ni d'application : le jeton ne donne
accès qu'à cette signature précise.

Les réponses sont archivées, réouvrables et exportables en PDF (document rempli ou
trame vierge).

**Tables :** `doc_categories`, `documents_koala`, `documents_reponses`,
`signatures_pending`.

---

## Rôles et permissions

| Rôle | `creche_id` | Portée |
|---|---|---|
| `direction` | `null` | Accès complet, toutes crèches |
| `referent` | défini | Sa crèche uniquement |
| `employe` | défini | Accès restreint |

Le cloisonnement est assuré par les politiques RLS de Supabase.

---

## Notes techniques

Points à connaître avant toute intervention sur le code :

- **RLS** — les politiques doivent utiliser `referents.user_id = auth.uid()`,
  jamais `referents.id` : `id` est la clé primaire de `referents`, `user_id` est la
  clé étrangère vers `auth.users`. Les confondre casse silencieusement les accès.
- **Dates** — toujours passer par la fonction locale de conversion ISO.
  `toISOString().slice(0,10)` décale la date d'un jour en UTC+2 (heure d'été).
- **Photos** — jamais de base64 en base : tout passe par le bucket Storage `assets`.
- **Échecs d'écriture silencieux** — vérifier d'abord une session expirée avant de
  suspecter une politique RLS.
- **Avant login** — un utilisateur anonyme ne peut lire aucune table, y compris
  `creches`. Toute liste affichée avant authentification doit venir d'une constante.
- **Table `creches`** — la colonne s'appelle `name`, pas `nom`.
- **Table `presences`** — pas de colonne `creche_id` : le filtrage se fait via `enfants`.
- **Import planning** — le parseur exige le format `HHhMM-HHhMM/HHhMM-HHhMM`.
  Les plages simples type `10H-18H` sont ignorées sans message d'erreur.
- **Deux clients Supabase** — le client secondaire doit être créé avec
  `{auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}}`
  pour éviter les conflits GoTrueClient.
- **Anomalie préexistante** (à ne pas signaler) : `stock.html` présente un écart de
  balises `<div>` de −1. `demandes.html` est équilibré depuis la refonte du module
  Présences.

### Pièges ExcelJS (exports mis en forme)

Trois écueils rencontrés sur l'export PMI, tous silencieux :

- **`cell.fill = …` modifie un style partagé.** `cell.style` renvoie l'objet de style
  commun à toutes les cellules de même mise en forme ; le raccourci `cell.fill` le mute
  en place. Colorier un créneau repeignait ainsi toute la grille. Toujours réaffecter un
  style neuf : `cell.style = Object.assign({}, cell.style, {fill})`.
- **La police par défaut est réécrite en Calibri 11**, alors que le modèle PMI est en
  Calibri 10. Excel exprimant la largeur des colonnes en caractères de cette police, la
  grille sortait ~10 % plus large. `pmiRestaurerPoliceParDefaut()` rétablit la police
  d'origine dans `styles.xml` après écriture, via JSZip.
- **Duplication de feuille** — appliquer les fusions **avant** les styles : ExcelJS
  réinitialise le style des cellules intérieures d'une plage au moment du merge, ce qui
  fait disparaître les bordures droite et bas.

Par ailleurs, un nom d'onglet Excel ne peut contenir `\ / ? * : [ ]` — les dates au format
`JJ/MM/AAAA` doivent être transformées avant d'y servir de titre. Et une réécriture JSZip
sans `compression:'DEFLATE'` produit un fichier plusieurs fois plus lourd.

## Déploiement

Envoi manuel des fichiers sur GitHub, publication automatique via GitHub Pages.

> ⚠️ L'envoi manuel peut écraser silencieusement une version plus récente.
> Vérifier le nombre de lignes du fichier après chaque envoi comme contrôle d'intégrité.

## Sauvegardes

- **Supabase** — continue, à chaque écriture.
- **Cache navigateur** — automatique, pour le confort de chargement.
- **Export JSON** — manuel, depuis le tableau de bord direction. À faire chaque semaine.

## Aide intégrée

`demandes.html`, `stock.html` et `documents.html` disposent chacun d'une notice
complète, accessible par le bouton **?** flottant en bas à droite de l'écran.

La notice de `demandes.html` (`NOTICE_DEM`) compte **15 onglets**, un par module, dont
**📋 Export PMI**. Toute modification d'un module doit s'accompagner de la mise à jour de
l'onglet correspondant : un onglet déclaré dans la barre sans clé dans `NOTICE_DEM`
s'affiche vide, sans erreur.

`signature.html` n'a pas de notice : la page est mono-usage, ouverte par un signataire
extérieur au réseau, et déjà auto-explicative.
