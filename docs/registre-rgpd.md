# Registre des activités de traitement (RGPD, art. 30)

Application **Koala Kids — Suite de gestion** (application créée par David Bucari).
Document établi le 6 novembre 2026 à partir du code du dépôt (tables SQL, edge functions, pages). À relire et valider par la direction (et le DPO s'il est désigné) avant tout usage officiel.

> **Légende** — ✅ = mesure déjà en place dans l'application. ⚠️ = point à décider ou à compléter par la direction (la case n'est pas déductible du code).

---

## 1. Identification

| Rubrique | Contenu |
|---|---|
| Responsable de traitement | Chaque organisation cliente (réseau de crèches, ligne de `organisations`). Pour Koala Kids : ⚠️ raison sociale, adresse, SIRET, représentant légal à compléter |
| Représentant / contact RGPD | ⚠️ nom et e-mail du DPO ou référent RGPD (l'app y renvoie déjà : « validation du DPO et inscription au registre RGPD » pour le tri par visage) |
| Rôle de l'éditeur de l'application | Sous-traitant des organisations clientes (application multi-tenant, une base partagée, isolation par `org_id` + RLS). ⚠️ Contrat de sous-traitance (art. 28) à prévoir avec chaque organisation cliente |
| Finalité générale | Gestion d'un réseau de micro-crèches : accueil des enfants, relation avec les familles, gestion du personnel et des stagiaires, obligations réglementaires (PMI, HACCP, registres) |

### Personnes concernées
Enfants accueillis · parents / représentants légaux · employé·e·s et candidat·e·s · stagiaires · intervenants externes (registre de sécurité) · utilisateurs de l'application (direction, référent·e·s).

### Rôles et accès (mesure transversale ✅)
`direction` (toute l'organisation) · `referent` (sa crèche) · `employe` (Mon espace, Accès terrain). Cloisonnement par RLS Postgres entre crèches et entre organisations. Les référents lisent le stock de toutes les crèches (lecture seule), jamais les données des enfants des autres crèches.

---

## 2. Registre des traitements

| N° | Traitement | Finalité | Base légale | Personnes | Données traitées | Destinataires | Conservation |
|---|---|---|---|---|---|---|---|
| T1 | **Préinscription en ligne** (`preinscription.html`, edge `preinscription-publique`) | Recueillir la demande d'une famille, générer un devis brouillon, estimer le CMG | Mesures précontractuelles (art. 6.1.b) ; case de consentement à l'envoi | Parents, enfant à naître / né | Identité et coordonnées des parents, profession, revenus du foyer (calcul CMG), date de naissance / terme de l'enfant, souhaits d'accueil | Direction et référent·e de la crèche concernée ; e-mail de confirmation à la famille | ⚠️ à fixer (proposition : 1 an sans suite, puis suppression) |
| T2 | **Inscriptions, devis et contrats d'accueil** (`inscriptions.html`, `devis.html`, `contrats.html`, `signature-contrat.html`) | Établir devis et contrat, signature en ligne renforcée (code à usage unique, empreinte SHA-256, journal `contrats_preuves`) | Contrat (6.1.b) | Parents, enfant | Identité, coordonnées, revenus du foyer, horaires, tarifs, signatures, preuves de signature (IP, user-agent, date) | Direction, référent·e ; famille (PDF signé par e-mail) | Durée du contrat + 5 ans (prescription) ; ⚠️ valider |
| T3 | **Dossier de l'enfant** (`enfants`, `enfants_parents`, `enfants_documents_admin`, `enfants_contrats`, pièces administratives) | Gérer l'accueil quotidien, la sécurité, les obligations d'agrément | Contrat (6.1.b), obligation légale (CSP, art. R.2324-30 s.) | Enfants, parents, personnes autorisées | Identité, naissance, adresse, parents, autorités parentales, allergies et régime alimentaire, régime repas, pièces administratives (livret de famille, justificatifs), code image de pointage | Équipe de la crèche concernée, direction | 5 ans après la sortie (rappel affiché sur la fiche) ; archivage manuel puis purge/anonymisation tracée (`archivage_purges`) |
| T4 | **Données de santé de l'enfant** : PAI, registre de soins/infirmerie, vaccinations, médicaments (`pai`, `registre_infirmerie`, `vaccinations`, `sante`, `enfants_pai`) | Sécurité sanitaire, administration de médicaments sur ordonnance, PAI (panier repas inclus) | Obligation légale (6.1.c) ; données de santé : art. 9.2.h/c ; consentement parental écrit pour les médicaments | Enfants | Pathologies, allergies, ordonnances, PAI, vaccins, incidents, soins, pièces jointes (bucket `sante`) | Personnel habilité de la crèche, direction. **Aucune donnée de santé ni nom d'enfant dans les e-mails d'alerte** (`notify-infirmerie`) | Registres : 5 ans minimum ; PAI clôturé : conservé dans le dossier jusqu'à la purge du dossier |
| T5 | **Présences, pointage et facturation** (`presences`, `pointages`, `kiosk_devices`, `factures`, `factures_reglements`, `enfants_absences`) | Suivi des heures d'accueil, pointage sur tablette liée, facturation, calcul du forfait | Contrat (6.1.b), obligation légale (comptabilité) | Enfants, parents, employé·e·s | Heures d'arrivée / départ, absences, montants, règlements. Pointage par code image (4 images) ou numérique | Direction, référent·e ; comptabilité | Facturation : 10 ans (code de commerce) ; présences : 5 ans (registre de présence, minimum légal) |
| T6 | **Suivi pédagogique de l'enfant** (`suivi_jalons`, `suivi_saisies`, `suivi_observations`, `suivi_syntheses`, `suivi_acces_famille`, `suivi_consultations`) | Observation du développement, restitution aux parents | Mission d'accueil / intérêt légitime (6.1.f) ; ⚠️ vérifier information des parents | Enfants, parents | Observations, jalons, synthèses ; journal de consultation par les familles | Équipe de la crèche ; parents via lien personnel | 5 ans après la sortie |
| T7 | **Espace famille** (`espace-famille.html`, edge `espace-famille`, `famille_acces`, `famille_messages`, `famille_messages_lus`, `famille_documents`, `famille_push`) | Informer les familles, remettre code image, contrat et devis PDF, recevoir des documents, notifications push | Contrat (6.1.b) ; notifications push : consentement (6.1.a) | Parents | Code d'accès, e-mail, messages lus, documents déposés / reçus, abonnement push (endpoint), IP hachée pour la limitation de tentatives | Équipe de la crèche | Accès actif tant que l'enfant est accueilli ; **révoqué, jamais supprimé** puis supprimé avec la fiche ; abonnements push supprimés avec l'accès |
| T8 | **Album photos et tri par visage** (`album_photos`, `album_photos_enfants`, `album_journal`, `album_references`, `album_propositions`, `album_visages_accord`, `album_accords_signatures`) | Classer les photos par enfant et les remettre aux parents au départ | Tri manuel : droit à l'image signé à l'entrée. **Tri par visage : consentement distinct, explicite et révocable** (art. 6.1.a / 9.2.a, données biométriques) | Enfants, parents | Photos des enfants ; **empreinte de visage (128 nombres)** uniquement pour les enfants ayant un accord, jamais pour les autres enfants d'une photo | Équipe de la crèche, direction (journal) | Photos remises aux parents puis **supprimées au départ, aucune archive**. Retrait de l'accord : références et propositions effacées par déclencheur. Journal : sans UPDATE |
| T9 | **Restauration traiteur (MCM)** (`menus_semaine`, commandes repas, `mcm_avis_repas`, goûters, recettes) | Commander les repas selon le régime, les PAI, les allergènes | Contrat / intérêt légitime | Enfants | Effectifs par type de repas, régimes (biberon, sans viande…), PAI panier repas — **le bon envoyé au traiteur est agrégé (effectifs), sans nom**, ⚠️ à confirmer pour chaque commande | Traiteur (MCM) | ⚠️ à fixer (proposition : 3 ans) |
| T10 | **Hygiène et sécurité (PMS/HACCP)** (`remise_temperature_journal`, `frigo_temperature_journal`, `nettoyage_*`, `rs_*`, `registre-visiteur.html`) | Traçabilité sanitaire et sécurité des locaux | Obligation légale (6.1.c) | Employé·e·s qui saisissent ; intervenants externes (nom, signature) | Relevés de température, nettoyages, contrôles ; nom et signature de l'intervenant externe ; PAI panier repas (nom de l'enfant dans le plat « Panier repas PAI — <enfant> ») | Direction, référent·e, autorités de contrôle | **3 ans minimum** (règle HACCP, table jamais purgée) |
| T11 | **Dossier du personnel** (`employes`, `employes_documents`, `dossiers_pieces_employe`, `heures_validations_mensuelles`, frais, formations) | Gestion administrative RH, contrat de travail, heures, formations | Contrat de travail (6.1.b), obligation légale (droit du travail, agrément) | Employé·e·s | Identité, coordonnées, diplômes, expérience, contrat, période d'essai, pièces (casier judiciaire, pièce d'identité, etc.), heures, frais, formations | Direction, référent·e de la crèche (selon droits) ; employé·e pour son propre dossier | 5 ans après la fin du contrat (rappel affiché), puis purge/anonymisation tracée |
| T12 | **Signature de documents du personnel** (`signature-otp`, `documents_reponses`, `documents_reponses_preuves`) | Signer le contrat de travail avec preuve (code à usage unique, empreinte SHA-256) | Contrat (6.1.b), intérêt légitime (preuve) | Employé·e·s, parents (documents) | Signature manuscrite, IP, user-agent, date, empreinte du PDF | Direction | Durée du contrat + 5 ans |
| T13 | **Visites médicales du personnel** (`employes_visites_medicales`) | Suivre les échéances de médecine du travail (Odalia) | Obligation légale (6.1.c, Code du travail) | Employé·e·s | Dates de visite, avis d'aptitude, compte rendu (fichier) — **aucune donnée médicale détaillée** | Direction, référent·e (échéances) | Fichier retiré après export archive ; la ligne (date, avis) reste pendant la durée du dossier |
| T14 | **Planning de l'équipe et pointage du personnel** (`planning_equipe`, `pointages`, planning IA) | Organiser le travail, suivre les heures | Contrat de travail (6.1.b) | Employé·e·s | Horaires, pauses, pointages. La génération IA ne transmet que prénom + horaires (aucune autre donnée) | Direction, référent·e ; employé·e (son planning) | ⚠️ à fixer (proposition : 5 ans) |
| T15 | **Accès terrain par code image** (`terrain_code_image.sql`, edge `terrain-code-image`) | Authentification rapide du personnel sur tablette partagée | Intérêt légitime (6.1.f) | Employé·e·s, référent·e·s | Code image (hors direction), journal des échecs (5 échecs / 10 min) | — | Journaux d'échecs : durée courte |
| T16 | **Stagiaires** (`stagiaires`, `stagiaires_documents`, `stagiaires_envois`, `stagiaires_jours`, `stagiaire.html`, edge `dossier-stagiaire`) | Gérer l'entretien, l'accueil, les documents et l'évaluation des stagiaires | Mesures précontractuelles et convention (6.1.b) | Stagiaires, éventuellement mineur·e·s | Identité, coordonnées, établissement, convention, pièces, évaluations, jours de présence | Direction, référent·e, accompagnant·e | ⚠️ à fixer (proposition : 5 ans après la fin du stage) ; suppression des fichiers après export (archive) |
| T17 | **Messagerie et notifications** (`messages_employes`, `messages_*`, `push_subscriptions`, `notifs_retenues`, `support_messages`) | Communication interne, alertes (push), support applicatif | Intérêt légitime (6.1.f) ; push : consentement | Employé·e·s, référent·e·s, direction | Contenu des messages, pièces jointes, page et appareil joints au support, abonnement push | Direction, destinataires du message, responsable du support | ⚠️ à fixer (proposition : 2 ans) |
| T18 | **Réunions d'équipe et direction** (`reunions_equipe`, `reunions_direction`, transcription de notes manuscrites) | Comptes rendus de réunion | Intérêt légitime (6.1.f) | Employé·e·s, enfants et familles cités | Comptes rendus ; **photos de notes envoyées à l'API Anthropic pour transcription, sans stockage ni journal des images ni du texte** (`transcrire-notes`) | Direction, référent·e·s | 5 ans ⚠️ |
| T19 | **Sécurité des comptes et journalisation** (`login_events`, `acces_documents`, `presence_utilisateurs`, MFA TOTP, `mfa_codes_secours`, alerte de connexion) | Sécuriser les accès, détecter les connexions inhabituelles, tracer l'ouverture des documents sensibles | Intérêt légitime (6.1.f), obligation de sécurité (art. 32) | Utilisateurs de l'application | Identifiant, appareil, user-agent, dates de connexion, ouverture de documents sensibles, présence en ligne, empreinte SHA-256 des codes de secours | Direction (journaux) ; l'utilisateur voit ses connexions | `presence_utilisateurs` : une ligne par personne, sans historique ; ⚠️ durée des journaux de connexion et d'accès aux documents à fixer (proposition : 1 an) |
| T20 | **Stock, commandes, fournisseurs** (`stock.html`, `stock_couches*`, `fournisseurs`, `partenaires`) | Gestion du matériel et des couches | Intérêt légitime | Contacts de fournisseurs | Coordonnées professionnelles. Stock : stockage local au navigateur (export manuel) | Direction, référent·e | Durée de la relation commerciale |
| T21 | **Sauvegarde hebdomadaire** (edge `sauvegarde-hebdomadaire`, GitHub Actions) | Continuité d'activité | Intérêt légitime / obligation de sécurité (art. 32) | Toutes catégories ci-dessus | Dump JSON compressé de toutes les tables, envoyé par e-mail (SMTP Gmail) | Destinataire(s) défini(s) par `BACKUP_EMAIL_TO` ; ⚠️ contient des données de toutes les organisations et des données de santé | ⚠️ à fixer (suppression des anciennes sauvegardes par la boîte réceptrice) |

---

## 3. Sous-traitants et destinataires externes

| Prestataire | Rôle | Données concernées | Localisation / garanties |
|---|---|---|---|
| **Supabase** | Base de données, authentification, stockage de fichiers, edge functions | Toutes | ⚠️ région du projet à vérifier (idéalement UE) ; DPA Supabase à signer |
| **GitHub** (Pages, Actions) | Hébergement du site statique, tâches planifiées | Aucune donnée personnelle stockée (le code est public ou privé, les secrets sont dans GitHub / Supabase) | États-Unis ; clauses contractuelles types |
| **Google (Gmail SMTP)** | Envoi des e-mails (contrats, codes, alertes, sauvegardes) | Contenu des e-mails (voir règles ci-dessous) | ⚠️ compte `koalakids.app@gmail.com` : vérifier l'activation de la validation en deux étapes et le DPA Google Workspace si utilisé |
| **Anthropic** | API d'IA pour la transcription de notes manuscrites et la génération de planning | Photos de notes de réunion ; prénoms + horaires | ⚠️ DPA et réglage de non-conservation à vérifier ; transferts hors UE |
| **MCM (traiteur)** | Réception des bons de commande repas | Effectifs par catégorie de repas (⚠️ vérifier l'absence de noms) | France |
| **Services de push navigateur** (FCM, Mozilla, Apple) | Acheminement des notifications | Endpoint technique ; message sans donnée de santé | Liste blanche des hôtes dans `espace-famille` |
| **CDN** (jsDelivr, cdnjs, Google Fonts) | Bibliothèques JS et polices | Adresse IP du visiteur | ⚠️ envisager l'hébergement local des polices (déjà fait pour face-api dans `vendor/`) |
| **Odalia** (médecine du travail) | Organisme externe | Aucun échange automatisé via l'app | — |

**Règles d'e-mail déjà appliquées ✅** : aucune donnée de santé ni nom d'enfant dans les alertes d'infirmerie ; réponses aux familles redirigées vers `a.janin@koalakids.fr` ; consigne de ne pas envoyer de documents par e-mail (dépôt dans l'Espace famille).

---

## 4. Mesures de sécurité (art. 32)

**Contrôle d'accès**
- ✅ Authentification Supabase, **double authentification TOTP** obligatoire avec codes de secours à usage unique (empreinte SHA-256 seule stockée).
- ✅ RLS Postgres par organisation et par crèche, y compris sur le stockage (`storage_filtrage_par_creche.sql`).
- ✅ Retrait des policies `anon` « allow all » sur le stockage (`storage_retirer_acces_anonyme.sql`, à appliquer après test).
- ✅ Alerte e-mail et push à la première connexion depuis un nouvel appareil.
- ✅ Accès terrain par code image : jamais pour la direction, verrouillage après 5 min d'inactivité, 5 échecs / 10 min.
- ✅ Pointage lié à un appareil (`kiosk_devices.appareil_id`).

**Liens et pages publiques**
- ✅ Session courte (15 min d'inactivité, 2 h maximum), jeton retiré de l'URL, session signée HMAC côté serveur.
- ✅ Espace famille : 10 codes faux / 15 min / IP bloquent ; renvoi de lien : 3 / h / adresse et 10 / h / IP, réponse toujours neutre ; empreintes SHA-256 d'adresses.
- ✅ Préinscription : champ piège, 20 demandes / h / crèche, 3 / adresse / jour.

**Traçabilité**
- ✅ Journal des ouvertures de documents sensibles (`acces_documents`, lecture direction, immuable).
- ✅ Journaux immuables : `archivage_purges`, `album_journal`, `nettoyage_journal`, preuves de signature (ajout seul).
- ✅ Export des dossiers archivés (direction uniquement) avec suppression des fichiers Supabase après confirmation.

**Minimisation et protection des données sensibles**
- ✅ Tri par visage **désactivé par défaut**, circuit fermé (modèles hébergés dans `vendor/face-api/`, calcul dans le navigateur), empreinte seulement avec accord distinct, signature en ligne versionnée et hachée.
- ✅ Les référents n'accèdent aux inscriptions que par une fonction SECURITY DEFINER qui ne renvoie ni montant, ni contact, ni donnée de santé.
- ✅ Photos de notes de réunion transcrites en mémoire, jamais conservées.
- ✅ Menu public (`menu.html`) : colonnes d'affichage uniquement.
- ✅ Silence réseau : pas de push hors heures ouvrées pour les employés.

**Sauvegardes**
- ✅ Supabase continue + sauvegarde hebdomadaire par e-mail. ⚠️ Cette sauvegarde est la plus sensible du dispositif (voir §6).

---

## 5. Droits des personnes

| Droit | Comment l'exercer aujourd'hui |
|---|---|
| Information (art. 13-14) | ⚠️ Mention d'information : une case de consentement existe sur la préinscription ; une **politique de confidentialité complète** (identité du responsable, finalités, durées, droits, DPO, CNIL) reste à rédiger et à lier depuis `preinscription.html`, `espace-famille.html`, le contrat d'accueil et le dossier du personnel |
| Accès / portabilité | Export dossier par dossier (direction) ; PDF du contrat et du devis dans l'Espace famille ; photos remises en .zip au départ |
| Rectification | Modification de la fiche par la crèche sur demande ; documents redéposables dans l'Espace famille |
| Effacement | Purge/anonymisation après le délai légal (journal `archivage_purges`) ; suppression d'un accès famille ; suppression des photos au départ ; retrait de l'accord du tri par visage (effet immédiat) |
| Opposition / retrait du consentement | Tri par visage et notifications push : retrait possible à tout moment |
| Limitation | À traiter au cas par cas par la direction (marquer la fiche, la désactiver) |
| Procédure | ⚠️ Définir l'adresse de contact, le délai de réponse (1 mois) et un registre des demandes |

---

## 6. Points à compléter ou à décider

1. **Responsable et DPO** : renseigner l'identité du responsable de traitement et du DPO ou référent (§1). Désignation obligatoire à étudier : traitement à grande échelle de données de santé d'enfants et usage de données biométriques (tri par visage).
2. **Analyse d'impact (AIPD)** à mener pour : tri par visage (biométrie, mineurs), données de santé des enfants, sauvegarde par e-mail de toute la base.
3. **Sauvegarde hebdomadaire par e-mail** : elle sort des données de santé de toutes les organisations vers une boîte Gmail. À remplacer si possible par un stockage chiffré (ou chiffrer le fichier), et limiter les destinataires.
4. **Politique de confidentialité** et mentions d'information (familles, personnel, stagiaires) à rédiger et à publier.
5. **Durées de conservation** marquées ⚠️ à valider ; automatiser la purge des journaux (connexions, accès documents, messages) qui n'est pas en place.
6. **Contrats de sous-traitance** (Supabase, Google, Anthropic) et vérification des transferts hors UE.
7. **Polices et bibliothèques externes** (Google Fonts, jsDelivr, cdnjs) : héberger localement pour éviter la transmission de l'IP des visiteurs.
8. **Nom de l'enfant dans le registre de remise en température** (plat « Panier repas PAI — <enfant> ») : donnée de santé indirecte dans un registre conservé 3 ans ; envisager les initiales.
9. **Suppression en base de la colonne `enfants.pai_panier_repas`** (vide et inutilisée, voir `CLAUDE.md`) pour respecter la minimisation.
10. **Violation de données** : documenter la procédure (notification CNIL sous 72 h, information des familles) ; l'alerte de connexion et le journal d'accès aux documents servent de base à la détection.

---

## 7. Mise à jour du registre

Toute modification fonctionnelle touchant des données personnelles (nouvelle table, nouvel envoi d'e-mail, nouveau prestataire) doit mettre à jour ce document. Il complète la notice de l'application et `CLAUDE.md`.
