# Koala Kids — Suite de gestion

Application web de gestion pour un réseau de micro-crèches : coordination des équipes,
suivi des enfants, gestion du matériel et obligations administratives.

Développée et maintenue en interne.

---

## Architecture

Pas de framework, pas d'étape de build : chaque outil est un **fichier HTML autonome**
(HTML + CSS + JS vanilla).

| Couche | Technologie |
|---|---|
| Frontend | HTML/CSS/JS vanilla, fichier unique par application |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Emails | Resend (via Edge Functions) |
| Hébergement | GitHub Pages |
| Client cible | Chrome sur tablette / mobile Android |

L'application est installable en PWA (`manifest.json` + `sw.js`).

---

## Les fichiers

### Applications principales

| Fichier | Rôle |
|---|---|
| `index.html` | Portail d'accueil — accès à tous les outils |
| `demandes.html` | Application de coordination (17 modules : présences, planning, enfants, stagiaires, etc.) |
| `stock.html` | Gestion du stock pédagogique et des commandes |
| `documents.html` | Bibliothèque de documents et formulaires avec signature |

### Outils annexes

Pages de dépôt/signature à usage ponctuel, ouvertes par des personnes externes au réseau
via un lien à durée limitée (`signature.html`, `famille.html`, `pieces.html`,
`stagiaire.html`), et configuration PWA (`manifest.json`, `sw.js`).

---

## Rôles et permissions

| Rôle | Portée |
|---|---|
| `direction` | Accès complet, toutes crèches |
| `referent` | Sa crèche uniquement |
| `employe` | Accès restreint |

Le cloisonnement est assuré par les politiques RLS de Supabase.

---

## Déploiement

Publication automatique via GitHub Pages.

## Sauvegardes

- **Supabase** — continue, à chaque écriture.
- **Export JSON** — manuel, depuis le tableau de bord direction.

## Aide intégrée

`demandes.html`, `stock.html` et `documents.html` disposent chacun d'une notice
complète, accessible par le bouton **?** flottant en bas à droite de l'écran.
