# Domaine dédié par organisation — analyse (non implémenté)

Limite d'architecture actuelle : une seule organisation peut avoir un
branding public correct (manifest PWA, pages de dépôt/signature par jeton),
car ces pages résolvent l'organisation à partir du **domaine** de la
requête (`organisations.app_url`), et l'appli n'est aujourd'hui servie que
depuis un seul domaine (GitHub Pages, un seul domaine personnalisé possible
par dépôt). Les pages internes (avec session) ne sont pas concernées : leur
branding vient de la session, pas du domaine.

Ce document capture l'analyse d'une solution, **à mettre en œuvre le jour
où un client a réellement besoin de son propre domaine** — pas avant : tant
qu'il n'y a qu'une organisation active, ce n'est pas un problème réel.

## Pourquoi on ne peut pas juste ajouter un deuxième domaine

GitHub Pages n'autorise qu'un seul domaine personnalisé par dépôt. Pointer
un deuxième domaine dessus ne fonctionne pas sans intermédiaire.

## Le design envisagé

Un reverse proxy (Cloudflare Worker, ou produit "Cloudflare for SaaS")
entre le domaine du client et l'appli :

```
client2.fr (DNS chez le client, proxied via Cloudflare)
   → Cloudflare Worker
   → fetch("https://<compte>.github.io/gestion-stock/...")
   → renvoie la page telle quelle au navigateur, sous client2.fr
```

Point important : le Worker doit toujours aller chercher le contenu via
l'URL `<compte>.github.io/<repo>/...` (qui fonctionne sans vérification de
domaine), jamais via `koalakids.fr` — sinon GitHub sert un domaine non
reconnu.

## Ce qui marche déjà sans rien changer

- **Les appels Supabase** (auth, données, edge functions) partent
  directement du navigateur vers le projet Supabase, peu importe le
  domaine qui a servi la page.
- **`js/branding.js`** (pages internes) résout l'organisation par la
  session, pas par le domaine — déjà agnostique du domaine servant la page.
- **La fonction edge `manifest`** résout l'organisation via l'en-tête
  `Origin` du navigateur, qui reflète le vrai domaine affiché (`client2.fr`),
  pas l'origine GitHub Pages sous-jacente — fonctionne à travers un proxy
  sans modification, à condition que `organisations.app_url` soit réglé sur
  `client2.fr`.
- **Aucun chemin absolu** (`/xxx`) dans les fichiers HTML/JS du dépôt
  (vérifié le 26/09/2026) : tout est en chemins relatifs, donc servir le
  même contenu sous un sous-chemin (`github.io/gestion-stock/...`) ou à la
  racine d'un domaine personnalisé ne pose pas de problème de liens cassés.

## Ce qu'il faudrait mettre en place

1. **DNS + TLS par client** : soit un compte Cloudflare partagé avec un
   Worker qui route par nom d'hôte, soit le produit **Cloudflare for SaaS**
   ("Custom Hostnames"), conçu spécifiquement pour "plusieurs domaines
   clients → une seule origine", avec émission automatique des certificats
   TLS.
2. **Un nouveau compte/dépendance d'infra** : aujourd'hui tout tourne sur
   GitHub + Supabase uniquement ; ça ajoute Cloudflare (ou équivalent) comme
   brique supplémentaire à gérer et payer.

## Deux variantes

| | Worker maison | Cloudflare for SaaS |
|---|---|---|
| Coût | Gratuit (petit volume) | Payant (add-on) |
| Effort de mise en place | Un script Worker (~30 lignes) | Config produit, moins de code |
| Contrôle | Total | Standardisé |
| Recommandé pour | Tester avec 1-2 clients | Passer à l'échelle (5+ clients) |

## Recommandation

Prototyper avec un Worker sur un sous-domaine de test (ex.
`test-client.koalakids.fr`) avant de committer à l'approche, le jour où un
client réel en a besoin.
