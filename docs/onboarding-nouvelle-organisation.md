# Checklist — ajouter une nouvelle organisation cliente

Ce document décrit comment activer un nouveau réseau de crèches sur l'appli, sur le
projet Supabase multi-tenant existant (une seule base pour toutes les organisations,
cloisonnée par `org_id` + RLS — voir `sql/` et les migrations `*org*`).

À faire dans l'ordre. Chaque étape indique où et comment.

## 1. Créer l'organisation

```sql
insert into public.organisations (nom, slug, couleur_primaire, couleur_secondaire,
                                   app_url, email_expediteur)
values ('Nom du réseau', 'slug-du-reseau', '#XXXXXX', '#XXXXXX',
        'https://exemple.fr', 'contact@exemple.fr')
returning id;
```

- `slug` : identifiant technique, unique, en minuscules/tirets — pas encore utilisé
  ailleurs dans le code aujourd'hui, mais réservé pour du routage futur.
- `couleur_primaire` / `couleur_secondaire` : appliquées automatiquement aux pages
  internes (direction/référent·e) via `js/branding.js`, sur les variables CSS
  `--violet`/`--koala` et `--orange` (+ teintes claires/foncées dérivées).
- `logo_url` : à renseigner une fois le logo uploadé (étape 2).
- `police_titre` / `police_texte` : non branchées dans le code actuellement (colonnes
  présentes en base pour un usage futur) — laisser vide.

**`app_url` — point d'attention architecture** : la fonction edge `manifest` résout
l'organisation d'une page publique en comparant l'origine de la requête à
`organisations.app_url`. Comme le dépôt est publié sur un seul site GitHub Pages
(un seul domaine possible), **plusieurs organisations avec des `app_url` différents
nécessitent chacune leur propre nom de domaine pointé vers une copie du site** (fork
du repo + Pages + domaine personnalisé), ou de servir l'app depuis des sous-domaines
via un proxy (non mis en place aujourd'hui). Si le nouveau client utilise le même
domaine que l'existant, laisser `app_url` identique et savoir que le manifest PWA et
les pages publiques par jeton (devis, contrat, dépôt de pièces) afficheront le
branding de la première organisation trouvée pour ce domaine — pas un blocage pour
les pages internes (branding par session, pas par domaine), mais une limite réelle du
PWA/branding public tant qu'un domaine dédié n'est pas mis en place.

## 2. Logo

Uploader le logo dans le bucket Storage public dédié (même mécanisme que les autres
assets publics de l'app), récupérer l'URL publique, puis :

```sql
update public.organisations set logo_url = 'https://.../logo.png' where id = '<org_id>';
```

Le logo apparaît automatiquement partout où `[data-branding-logo]` est posé sur un
`<img>` (pages avec `js/branding.js`) et dans les pages publiques par jeton qui
renvoient `organisation.logo_url` (`dossier-contrat`, `dossier-devis`,
`dossier-pieces`, `dossier-pieces-employe`) ainsi que dans le manifest PWA
(`_logo_url`, consommé par `index.html`).

## 3. Crèche(s) / site(s)

```sql
insert into public.creches (name, addr, capacity, org_id)
values ('Nom du site', 'Adresse complète', 20, '<org_id>')
returning id;
```

Répéter pour chaque site du réseau. `name` est le nom complet affiché ; si le réseau a
des libellés courts ailleurs dans l'app (stock, planning), regarder
`shortCrecheName()` (dupliquée dans plusieurs fichiers front + `sql/multi_tenant_stock_couches_nom_court.sql`)
qui ne fait que retirer les préfixes `Koalakids `/`Toulon ` — inoffensif pour un nom
qui ne les contient pas, donc rien à adapter pour un nouveau client.

## 4. Établissement (identité légale, pour devis/contrats/factures)

```sql
insert into public.etablissements
  (creche_id, raison_sociale, forme_juridique, siret, code_ape, adresse_siege,
   representant_nom, representant_qualite, telephone, email, pmi_numero,
   jours_ouverture, jours_fermeture, heure_ouverture, heure_fermeture,
   semaines_fermeture, semaines_facturees, observations)
values ('<creche_id>', 'Raison sociale complète', 'SAS', '123 456 789 00012',
        '8891A', 'Adresse du siège', 'Prénom Nom', 'Gérant·e',
        '0X XX XX XX XX', 'contact@exemple.fr', 'PMI-XXXXX',
        '["lundi","mardi","mercredi","jeudi","vendredi"]', '[]',
        '07:30', '18:30', 5, 47, '');
```

Une ligne par crèche/site (toutes les colonnes ci-dessus sont `NOT NULL` — même une
chaîne vide passe, mais pas `null`). Ces champs alimentent les mentions légales des
devis/contrats/factures (`vueFamille()` dans les edge functions `dossier-*`).

## 5. Configuration réseau (`reseau_config`)

```sql
insert into public.reseau_config (org_id, config)
values ('<org_id>', '{
  "preavis_mois": 2,
  "devis_validite_jours": 30,
  "contrat_validite_jours": 30,
  "facturation_terme": "echu",
  "facturation_jour_envoi": 10,
  "facturation_jour_echeance": 20,
  "carence_maladie_jours": 3,
  "frais_dossier_impaye": 40,
  "modes_reglement": "",
  "facture_mentions": "",
  "facture_deductions": "",
  "devis_mentions": "",
  "contrat_mentions": "",
  "preavis_resiliation": "",
  "conditions_resiliation": "",
  "pedagogie_texte": "",
  "jours_fermeture_reseau": [],
  "otp_signature_active": true
}'::jsonb);
```

Reprendre la structure de la ligne Koala Kids existante (`select config from
reseau_config`) comme référence pour les clés — le code lit chaque clé avec un
fallback silencieux si absente, donc mieux vaut copier une ligne existante et
adapter plutôt que reconstruire à la main.

## 6. Premier compte direction

Avec le fix du 26/09/2026 (edge function `create-referent`, voir commit associé),
`referents.org_id` est résolu à partir du compte **appelant**, pas transmis par le
client — ce qui veut dire qu'**il faut déjà avoir un compte direction actif dans la
nouvelle organisation pour en inviter un second** via l'interface. Pour le tout
premier compte d'une organisation, il n'y a pas de contournement via l'UI : le créer
directement en base.

```sql
-- 1. Compte Auth (à faire depuis le dashboard Supabase > Authentication > Add user
--    > Send invite, avec l'email de la personne) — récupérer l'UUID généré.
-- 2. Fiche referents :
insert into public.referents (user_id, name, email, poste, role, org_id)
values ('<user_id_auth>', 'Prénom Nom', 'email@exemple.fr', 'Direction', 'direction',
        '<org_id>');
```

Une fois ce premier compte actif, tous les comptes suivants (direction ou référent·e)
peuvent être créés normalement depuis `demandes.html` (module Référent·es), qui
appelle `create-referent` et hérite automatiquement du bon `org_id`.

## 7. Vérifications avant de livrer l'accès

- Se connecter avec le premier compte direction et confirmer que `js/branding.js`
  applique bien les couleurs/logo/nom (aucune page ne doit encore afficher
  "Koala Kids").
- Vérifier qu'aucune crèche/donnée d'une autre organisation n'apparaît (RLS scoping) —
  ouvrir un module qui liste les crèches, confirmer qu'on ne voit que celles du
  nouveau réseau.
- Si le réseau utilise les indemnités kilométriques (`js/frais-ik.js`, onglet Frais IK
  de `demandes.html`) : la topologie démarre à zéro (aucune distance pré-remplie,
  un groupe par site) — à compléter dans l'onglet par la nouvelle organisation
  elle-même, ce n'est pas une étape d'onboarding technique.
- `mcp__Supabase__get_advisors` (sécurité) ne doit signaler aucune nouvelle alerte
  liée aux tables insérées ci-dessus.

## Hors périmètre de cette checklist

- **Domaine dédié / sous-domaine par client** : non automatisé, voir point
  d'attention à l'étape 1.
- **Emails sortants (Gmail SMTP)** : `email_expediteur` sur `organisations` n'est
  qu'un champ d'affichage — les edge functions d'envoi (`envoyer-devis`,
  `envoyer-contrat`, etc.) utilisent aujourd'hui un compte Gmail unique
  (`GMAIL_USER`/`GMAIL_APP_PASSWORD`, secrets projet), partagé entre toutes les
  organisations. Un envoi "au nom" du nouveau client avec sa propre adresse
  d'expédition nécessiterait une évolution (compte SMTP par organisation ou service
  d'envoi transactionnel avec expéditeurs vérifiés).
