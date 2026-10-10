const DATA = [
  // ═══════════ AGRÉMENT & CRÉATION ═══════════
  {
    id: 1,
    category: "agrement",
    title: "Définition juridique de la micro-crèche",
    ref: "Art. L.2324-1 CSP — Décret 2021-1131",
    summary: "Établissement accueillant au maximum 12 enfants de moins de 6 ans, soumis à autorisation préalable du Président du Conseil Départemental.",
    source: "Code de l'action sociale et des familles",
    date: "Sept. 2021",
    detail: {
      description: "La micro-crèche est un établissement d'accueil du jeune enfant (EAJE) à capacité réduite. Elle entre dans la catégorie des crèches collectives mais bénéficie de règles assouplies en raison de sa petite taille.",
      points: [
        "Accueil de 1 à 12 enfants simultanément (de moins de 6 ans)",
        "Statut juridique libre : association, SARL, SAS, auto-entrepreneur, SCI…",
        "Dépôt de dossier obligatoire auprès du Conseil Départemental",
        "Instruction du dossier par le service PMI (Protection Maternelle et Infantile)",
        "Délai d'instruction : 3 mois maximum (silence vaut refus)"
      ],
      details: [
        { label: "Capacité max.", value: "12 berceaux" },
        { label: "Âge des enfants", value: "0 à 6 ans" },
        { label: "Autorité compétente", value: "Président CD" },
        { label: "Service instructeur", value: "PMI" }
      ],
      alert: "Toute ouverture sans autorisation est passible de sanctions pénales (Art. L.2324-2 CSP). L'autorisation est délivrée pour une durée de 5 ans renouvelable.",
      sources: ["Art. L.2324-1 CSP", "Décret n°2021-1131 du 30 août 2021", "Art. R.2324-17 CSP"]
    }
  },
  {
    id: 2,
    category: "agrement",
    title: "Dossier de demande d'autorisation",
    ref: "Art. R.2324-18 à R.2324-21 CSP",
    summary: "Composition précise du dossier à adresser au Président du Conseil Départemental pour obtenir l'autorisation d'ouverture.",
    source: "CASF — PMI",
    date: "2021",
    detail: {
      description: "Le dossier de demande d'autorisation doit être complet pour être recevable. Un dossier incomplet suspend le délai d'instruction de 3 mois.",
      points: [
        "Identité et qualifications du gestionnaire (personne physique ou morale)",
        "Statuts de la structure et extrait Kbis ou RNA",
        "Description des locaux : plans, superficie, emplacement, accès handicapés",
        "Projet d'établissement détaillé (projet éducatif, social, pédagogique)",
        "Règlement de fonctionnement",
        "Liste nominative et qualifications du personnel prévu",
        "Avis de conformité des locaux (sécurité, accessibilité, ERP)",
        "Attestation assurance responsabilité civile professionnelle"
      ],
      details: [
        { label: "Délai d'instruction", value: "3 mois" },
        { label: "Validité autorisation", value: "5 ans renouv." },
        { label: "Dépôt", value: "Conseil Départ." },
        { label: "Silence vaut", value: "Refus" }
      ],
      alert: "Le projet d'établissement doit inclure : les objectifs éducatifs, les modalités d'accueil, la politique d'inclusion du handicap, et les pratiques professionnelles attendues.",
      sources: ["Art. R.2324-18 CSP", "Art. R.2324-19 CSP", "Décret 2021-1131"]
    }
  },
  {
    id: 3,
    category: "agrement",
    tags: ["decret2025"],
    caduque: false,
    title: "Contrôle et renouvellement de l'autorisation",
    ref: "Art. L.2324-3 et R.2324-22 CSP — Décret 2025-304",
    summary: "L'autorisation passe de 5 à 15 ans (décret 2025). Le PMI effectue des visites de contrôle inopinées. Toute modification de capacité ou de locaux nécessite une autorisation modificative.",
    source: "CASF — Décret 2025-304",
    date: "Avril 2025",
    update2025: [
      { date: "3 avril 2025 — En vigueur", text: "La durée de l'autorisation est portée à 15 ans (contre 5 ans précédemment). Le renouvellement doit désormais être demandé 12 mois avant l'expiration (contre 6 mois)." },
      { date: "3 avril 2025 — En vigueur", text: "Le décret formalise 4 types de procédures distincts : création, extension, transformation, cession. Chacun requiert une autorisation explicite du Conseil Départemental." },
      { date: "3 avril 2025 — En vigueur", text: "Augmenter la capacité d'accueil (ex. : de 10 à 12 enfants) est désormais qualifié d'extension et nécessite une procédure d'autorisation à part entière." }
    ],
    detail: {
      description: "La PMI dispose de pouvoirs de contrôle étendus. Elle peut suspendre ou retirer l'autorisation en cas de manquement grave. Le décret 2025-304 a profondément réformé les procédures d'autorisation.",
      points: [
        "Durée de l'autorisation : 15 ans (depuis avril 2025, contre 5 ans auparavant)",
        "Renouvellement à demander 12 mois avant l'expiration",
        "4 procédures distinctes : création / extension / transformation / cession",
        "Toute extension de capacité nécessite une autorisation modificative",
        "Visites de contrôle inopinées possibles à tout moment",
        "Fermeture administrative possible en urgence (48h sans délai contradictoire)",
        "Obligation de signalement de tout incident grave à la PMI sous 24h"
      ],
      details: [
        { label: "Durée autorisation", value: "15 ans (nouveau)" },
        { label: "Délai renouvellement", value: "12 mois avant fin" },
        { label: "Extension capacité", value: "Autorisation requise" },
        { label: "Délai signalement", value: "24h" }
      ],
      alert: "Les structures ayant une autorisation délivrée avant le décret 2025 la conservent jusqu'à son terme, mais le renouvellement sera soumis aux nouvelles règles. Anticipez dès maintenant.",
      sources: ["Art. L.2324-3 CSP", "Art. R.2324-22 CSP", "Décret n°2025-304 du 1er avril 2025"]
    }
  },

  // ═══════════ ENCADREMENT & PERSONNEL ═══════════
  {
    id: 4,
    category: "encadrement",
    tags: ["decret2025"],
    caduque: true,
    title: "Référent technique obligatoire",
    ref: "Art. R.2324-34 et R.2324-35 CSP — Décret 2025-304",
    summary: "⚠ Cette fonction est SUPPRIMÉE au 1er septembre 2026 par le décret 2025-304. Elle est remplacée par une direction obligatoire à 0,5 ETP minimum. En vigueur jusqu'au 31 août 2026.",
    source: "CASF — Décret 2025-304",
    date: "Modifié avril 2025",
    update2025: [
      { date: "1er septembre 2026 — SUPPRESSION", text: "La fonction de référent technique est supprimée dans les micro-crèches. Elle est remplacée par une direction structurée à temps partiel." },
      { date: "3 avril 2025 — En vigueur immédiat", text: "La direction de la micro-crèche doit représenter au minimum 0,5 ETP par structure. Une même personne ne peut plus diriger plus de 2 micro-crèches." },
      { date: "Transition — Jusqu'au 31 août 2026", text: "Les référents techniques en poste peuvent continuer à exercer jusqu'à l'échéance. Les structures doivent préparer leur plan de conformité dès maintenant." }
    ],
    detail: {
      description: "ATTENTION : Le décret 2025-304 supprime la fonction de référent technique à compter du 1er septembre 2026. D'ici là, les règles actuelles restent applicables. La nouvelle organisation impose une direction à 0,5 ETP minimum.",
      points: [
        "⚠ JUSQU'AU 31/08/2026 : Référent technique requis (IPDE, EJE, infirmier DE, médecin ou AP 5 ans)",
        "À PARTIR DU 01/09/2026 : Remplacement par une direction à 0,5 ETP minimum",
        "Direction limitée à 2 micro-crèches maximum par personne",
        "Le directeur doit être un professionnel diplômé de niveau III ou II",
        "Formalisation obligatoire d'une fiche de poste direction",
        "Convention de mutualisation possible entre 2 structures max. (contre 3 auparavant)"
      ],
      details: [
        { label: "Suppression", value: "01/09/2026" },
        { label: "Direction min.", value: "0,5 ETP" },
        { label: "Structures max.", value: "2 par directeur" },
        { label: "Transition", value: "Jusqu'au 31/08/26" }
      ],
      alert: "Les structures multi-sites gérées par un seul référent technique doivent impérativement revoir leur organisation RH. Une direction par micro-crèche à 0,5 ETP représente un surcoût salarial significatif à anticiper dans le budget 2025-2026.",
      sources: ["Art. R.2324-34 CSP", "Décret n°2025-304 du 1er avril 2025", "Question sénat QSE 260207705 — fév. 2026"]
    }
  },
  {
    id: 5,
    category: "encadrement",
    tags: ["decret2025"],
    title: "Taux d'encadrement et présence simultanée",
    ref: "Art. R.2324-43 et R.2324-44 CSP — Décret 2025-304",
    summary: "2 professionnels minimum dès 4 enfants accueillis. En dessous de 4 enfants : 1 seul professionnel catégorie 1 possible (EJE, AP, IDE). Ratios : 1 pour 5 non-marcheurs, 1 pour 8 marcheurs (ou 1 pour 6 au choix). Qualifications : pleine application au 1er sept. 2027 (reporté).",
    source: "CASF — Décret 2025-304 — Report ministeriel mars 2026",
    date: "Mis à jour avril 2026",
    update2025: [
      { date: "En vigueur immédiat — règle de présence", text: "2 professionnels minimum doivent être présents simultanément dès que 4 enfants sont accueillis. En dessous de 4 enfants, 1 seul professionnel est possible sous conditions strictes de qualification." },
      { date: "Jusqu'au 31 août 2026 — période transitoire qualifications", text: "Un professionnel niveau 3 (CAP AEPE) avec 2 ans d'expérience peut encore accueillir seul jusqu'à 3 enfants, à condition que la structure justifie d'un engagement en VAE vers un diplôme catégorie 1." },
      { date: "⚡ REPORTÉ — À partir du 1er septembre 2027 (annonce min. Rist, 26 mars 2026)", text: "Seul un professionnel de catégorie 1 (EJE, AP, infirmier DE, ou titulaire du titre IEPE) peut encadrer seul jusqu'à 3 enfants. Les CAP AEPE sans évolution de diplôme ne pourront plus assurer cet encadrement solo." },
      { date: "Nouveau — sortie extérieure (en vigueur)", text: "Interdit d'emmener un groupe d'enfants en sortie extérieure si le professionnel est seul, quelle que soit sa qualification." }
    ],
    detail: {
      description: "Les règles de présence simultanée en micro-crèche combinent deux logiques : le ratio enfants/adultes et le seuil de 4 enfants déclenchant l'obligation de binôme. Les exigences de qualification pour l'encadrement solo ont été reportées à septembre 2027.",
      points: [
        "✅ Dès 4 enfants accueillis : 2 professionnels présents simultanément obligatoires",
        "✅ 1 à 3 enfants : 1 seul professionnel possible, sous conditions de qualification",
        "Jusqu'au 31/08/2026 : CAP AEPE + 2 ans d'expérience accepté en solo si VAE en cours",
        "À partir du 01/09/2027 (reporté) : seul un professionnel catégorie 1 peut encadrer seul ≤ 3 enfants",
        "Catégorie 1 : EJE, auxiliaire de puériculture, infirmier DE, psychomotricien, puériculteur, titre IEPE",
        "Ratio général : 1 pour 5 non-marcheurs / 1 pour 8 marcheurs (OU 1 pour 6 — au choix du règlement)",
        "Sortie extérieure : interdite si le professionnel est seul avec les enfants",
        "Gestionnaire non diplômé et stagiaires exclus des ratios"
      ],
      details: [
        { label: "Seuil 2 profess.", value: "Dès 4 enfants" },
        { label: "Solo ≤ 3 enfants", value: "Cat. 1 requis (09/27)" },
        { label: "Ratio non-march.", value: "1 pour 5" },
        { label: "Ratio marcheurs", value: "1 pour 8 (ou 1/6)" }
      ],
      alert: "Le report à 2027 est conditionnel : les structures doivent prouver avant le 1er septembre 2026 qu'au moins un salarié est engagé dans une VAE vers un diplôme catégorie 1 (dont le nouveau titre IEPE). Sans cet engagement, la dérogation transitoire ne s'applique pas.",
      sources: ["Art. R.2324-43 CSP", "Art. R.2324-44 CSP", "Décret n°2025-304 du 1er avril 2025", "Annonce min. Stéphanie Rist — Comité filière PE, 26 mars 2026"]
    }
  },
  {
    id: 6,
    category: "encadrement",
    tags: ["decret2025"],
    title: "Qualifications requises du personnel",
    ref: "Art. R.2324-42 CSP — Décret 2025-304",
    summary: "40 à 50% du personnel doit être catégorie 1 (EJE, AP, infirmier, puériculteur, titre IEPE). Les CAP AEPE restent dans les 60% catégorie 2. Pleine application reportée au 1er septembre 2027.",
    source: "CASF — DGCS — Décret 2025-304 — Report min. Rist mars 2026",
    date: "Mis à jour avril 2026",
    update2025: [
      { date: "3 avril 2025 — En vigueur", text: "Le décret renforce les exigences : 40 à 50% du personnel doit être catégorie 1 (EJE, AP, infirmier DE, puériculteur). Pour 4 salariés, au moins 2 doivent être titulaires d'un diplôme catégorie 1." },
      { date: "Nouveau titre — IEPE (Intervenant·e Petite Enfance)", text: "Créé pour permettre aux CAP AEPE de monter en catégorie 1. Niveau 4 (bac), accessible par formation ou VAE pour les salariés expérimentés. Durée VAE : 12 à 18 mois." },
      { date: "⚡ REPORTÉ — 1er septembre 2027 (annonce min. Rist, 26 mars 2026)", text: "Pleine application des exigences de qualification reportée d'un an. Raison : les CAP AEPE n'avaient pas le temps de valider leur titre IEPE avant septembre 2026. Ce report est conditionnel à un engagement en VAE." },
      { date: "Obligation avant le 1er sept. 2026 — condition du report", text: "Chaque structure doit prouver qu'au moins un salarié est engagé dans un parcours de VAE vers un diplôme catégorie 1 (dont le titre IEPE) pour bénéficier de la dérogation jusqu'en 2027." }
    ],
    detail: {
      description: "Le décret 2025-304 crée deux catégories de professionnels. La catégorie 1 (diplômés d'État) doit représenter 40 à 50% de l'équipe. Les CAP AEPE restent employables en catégorie 2, mais ne peuvent plus être seuls avec des enfants ni compter dans les 40% à partir de 2027.",
      points: [
        "Catégorie 1 (40-50% min.) : EJE, auxiliaire de puériculture, infirmier DE, puériculteur, psychomotricien, titre IEPE",
        "Catégorie 2 (60% max.) : CAP AEPE, assistants maternels expérimentés, autres profils qualifiés",
        "Titre IEPE (nouveau) : niveau 4, voie de montée en catégorie 1 pour les CAP AEPE — accessible par VAE",
        "VAE vers IEPE : durée 12 à 18 mois, à engager avant le 1er septembre 2026 pour bénéficier du report",
        "Catégorie 2 seule : ne peut pas encadrer seul des enfants (binôme obligatoire dès 4 enfants et même solo exigences catégorie 1)",
        "Pleine application reportée au 1er septembre 2027 (annonce ministerielle du 26 mars 2026)",
        "Arrêtés complémentaires toujours attendus pour préciser certaines modalités"
      ],
      details: [
        { label: "Catégorie 1 min.", value: "40–50% équipe" },
        { label: "CAP AEPE", value: "Catégorie 2 (60%)" },
        { label: "Titre IEPE", value: "Passage cat. 1" },
        { label: "Pleine applic.", value: "01/09/2027" }
      ],
      alert: "Le report à 2027 n'est pas automatique. Les structures qui n'engagent aucun salarié en VAE avant le 1er septembre 2026 ne bénéficient pas de la dérogation et doivent être conformes dès 2026. Contacter la PMI et la CAF locale pour confirmer les modalités applicables à votre département.",
      sources: ["Art. R.2324-42 CSP", "Décret n°2025-304 du 1er avril 2025", "Annonce min. Stéphanie Rist — Comité filière PE, 26 mars 2026", "SNPPE — mars 2026"]
    }
  },

  // ═══════════ FINANCEMENT & AIDES ═══════════
  {
    id: 7,
    category: "financement",
    title: "Prestation de Service Unique (PSU) CAF",
    ref: "Lettre-circulaire CAF n°2014-004",
    summary: "Aide versée par la CAF calculée sur les heures réelles de présence des enfants. Couvre environ 66% du prix de revient horaire plafonné.",
    source: "CAF / CNAF",
    date: "2014 (actualisée 2024)",
    detail: {
      description: "La PSU est la principale aide publique aux EAJE. Elle est versée directement à la structure en contrepartie d'un accueil facturé aux familles selon leurs revenus (barème CNAF).",
      points: [
        "Taux de base : 66% du prix de revient horaire dans la limite d'un plafond CNAF",
        "Plafond PSU 2024 : environ 10,38 €/h (revu annuellement)",
        "Facturation aux familles : selon le barème national CNAF basé sur le QF",
        "La micro-crèche doit établir une convention avec la CAF",
        "Contrôles annuels : taux d'occupation, heures facturées, effectifs",
        "Bonus attractivité, inclusion handicap, territoire peuvent s'ajouter"
      ],
      details: [
        { label: "Taux couverture", value: "≈ 66% coûts" },
        { label: "Plafond 2024", value: "~10,38 €/h" },
        { label: "Base calcul", value: "Heures réelles" },
        { label: "Convention CAF", value: "Obligatoire" }
      ],
      alert: "Pour bénéficier de la PSU, le taux d'occupation doit être supérieur à 70% en moyenne annuelle. En dessous, la CAF peut appliquer des pénalités ou rompre la convention.",
      sources: ["Lettre-circulaire CNAF n°2014-004", "Règlement intérieur CNAF 2024", "Art. L.531-1 CSS"]
    }
  },
  {
    id: 8,
    category: "financement",
    title: "Complément Mode de Garde (CMG) PAJE — Micro-crèches PAJE",
    ref: "Art. L.531-5 à L.531-9 CSS",
    summary: "Les micro-crèches qui ne bénéficient pas de la PSU peuvent opter pour le régime PAJE : les familles perçoivent directement le CMG, versé par la CAF.",
    source: "CAF / Sécurité sociale",
    date: "Actualisé 2022",
    detail: {
      description: "Le régime PAJE s'applique aux micro-crèches qui fonctionnent sans convention PSU. Les parents paient directement la structure, et la CAF leur rembourse le CMG sous forme d'aide mensuelle plafonnée selon les revenus.",
      points: [
        "Le CMG est versé aux parents (pas à la structure directement)",
        "Montant variable selon les revenus du foyer et le nombre d'enfants",
        "CMG 2024 : jusqu'à 923 €/mois pour les revenus les plus modestes",
        "Avantage fiscal : crédit d'impôt pour frais de garde complémentaire (50%)",
        "La micro-crèche doit être habilitée à recevoir les bénéficiaires du CMG",
        "Facturation libre (pas encadrée par le barème CNAF)"
      ],
      details: [
        { label: "Bénéficiaire", value: "Les parents" },
        { label: "CMG max. 2024", value: "~923 €/mois" },
        { label: "Crédit impôt", value: "50% frais" },
        { label: "Tarif libre", value: "Oui (PAJE)" }
      ],
      alert: "Le choix entre PSU et PAJE est structurant pour le modèle économique. La PSU sécurise les recettes mais contraint les tarifs. La PAJE offre plus de liberté tarifaire mais rend la solvabilité dépendante des revenus des familles.",
      sources: ["Art. L.531-5 CSS", "Art. L.531-6 CSS", "Décret n°2022-737"]
    }
  },
  {
    id: 9,
    category: "financement",
    title: "Aides à l'investissement : FNAS et collectivités",
    ref: "Fonds National d'Action Sociale CAF — COG 2023-2027",
    summary: "La CAF peut financer une partie des travaux d'aménagement ou d'équipement via le FNAS, selon les priorités définies dans la COG et les plans territoriaux.",
    source: "CNAF / CAF locale",
    date: "COG 2023-2027",
    detail: {
      description: "En complément du financement de fonctionnement (PSU), la branche famille peut accorder des aides à la création ou au réaménagement de places de crèche dans les zones déficitaires.",
      points: [
        "Plan crèches territoriaux : financement jusqu'à 3 000 € par berceau créé",
        "FNAS mobilisable pour l'aménagement, le mobilier, le matériel pédagogique",
        "Les conseils départementaux peuvent cofinancer (variable selon départements)",
        "Communes et intercommunalités : subventions complémentaires possibles",
        "Contrat Enfance Jeunesse (CEJ) : aide pluriannuelle pour structures sous convention",
        "Exonération de taxe foncière possible pour locaux dédiés à la petite enfance"
      ],
      details: [
        { label: "Aide création", value: "≤ 3 000 €/berceau" },
        { label: "Dispositif", value: "FNAS / COG" },
        { label: "Période", value: "2023-2027" },
        { label: "Contrat", value: "CEJ" }
      ],
      alert: "Les aides à l'investissement sont conditionnées à l'ouverture effective de la structure et au maintien de l'activité pendant une durée minimale (généralement 5 à 10 ans). Un remboursement proportionnel peut être exigé en cas de fermeture anticipée.",
      sources: ["COG CNAF 2023-2027", "Règlement FNAS 2023", "Code général des impôts Art. 1382"]
    }
  },

  // ═══════════ LOCAUX & SÉCURITÉ ═══════════
  {
    id: 10,
    category: "locaux",
    title: "Superficie et espaces réglementaires",
    ref: "Art. R.2324-54 à R.2324-60 CSP",
    summary: "Minimum 2 m² par enfant dans les espaces de jeux, espace de sommeil séparé obligatoire, coin repas, salle de change avec lave-mains. Espaces extérieurs recommandés.",
    source: "CASF — PMI",
    date: "2021",
    detail: {
      description: "Les règles de superficie visent à garantir le bien-être des enfants et la qualité des soins. La PMI vérifie la conformité des locaux avant toute autorisation et lors des visites de contrôle.",
      points: [
        "Espace de jeux/éveil : minimum 2 m² par enfant accueilli simultanément",
        "Salle de sommeil séparée et sécurisée (accès adultes limité, surveillance adaptée)",
        "Espace repas/cuisine conforme aux règles HACCP",
        "Table à langer avec protection, lavabo à portée de main dans chaque salle de change",
        "Sanitaires adultes séparés des zones enfants",
        "Accès PMR : rampes, portes larges (90 cm min.), ascenseur si étage"
      ],
      details: [
        { label: "Surface jeux", value: "2 m²/enfant min." },
        { label: "Sommeil", value: "Espace séparé" },
        { label: "Change", value: "Lavabo attenant" },
        { label: "Accès PMR", value: "Obligatoire" }
      ],
      alert: "Aucune surface minimale totale n'est fixée par les textes nationaux (la PMI locale peut imposer des exigences plus strictes). La règle des 2 m² s'applique à la superficie des espaces de vie, hors dégagements, sanitaires et cuisines.",
      sources: ["Art. R.2324-54 CSP", "Art. R.2324-57 CSP", "Norme NF EN 716"]
    }
  },
  {
    id: 11,
    category: "locaux",
    title: "Classification ERP et règles de sécurité incendie",
    ref: "Arrêté du 25 juin 1980 — ERP Type R",
    summary: "Les micro-crèches sont classées ERP de type R (locaux d'enseignement) ou type J (structures d'accueil pour personnes âgées/enfants handicapés). Normes incendie strictes.",
    source: "Ministère Intérieur — SDIS",
    date: "2024",
    detail: {
      description: "Toute micro-crèche doit obtenir un avis favorable de la Commission de Sécurité avant ouverture. La classification ERP conditionne les obligations en matière d'extincteurs, issues de secours, détection incendie, etc.",
      points: [
        "Classification : ERP type R (5e catégorie pour < 200 personnes)",
        "Dossier de sécurité à déposer en mairie avant travaux (si ERP)",
        "Visite d'ouverture obligatoire par la Commission de Sécurité",
        "Extincteurs : 1 extincteur poudre ABC par 200 m² (min. 1 par niveau)",
        "Détecteurs de fumée interconnectés obligatoires",
        "Issues de secours : largeur min. 90 cm, dégagées, signalées",
        "Plan d'évacuation affiché et exercices semestriels obligatoires"
      ],
      details: [
        { label: "Type ERP", value: "Type R / 5e catégorie" },
        { label: "Visite ouverture", value: "Obligatoire" },
        { label: "Exercices évacu.", value: "2/an" },
        { label: "Commission", value: "Sécurité mairie" }
      ],
      alert: "L'avis favorable de la Commission de Sécurité est une condition sine qua non pour l'ouverture. Un avis défavorable non levé expose le gestionnaire à une interdiction d'ouverture et à des sanctions pénales.",
      sources: ["Arrêté 25/06/1980 modifié", "Art. R.123-2 Code construction", "Décret n°95-260"]
    }
  },
  {
    id: 12,
    category: "locaux",
    title: "Accessibilité et normes PMR",
    ref: "Loi du 11/02/2005 — Décret n°2006-555",
    summary: "Les micro-crèches doivent être accessibles aux personnes à mobilité réduite : rampes d'accès, portes de 90 cm, sanitaires adaptés, signalétique adaptée.",
    source: "Code de la construction",
    date: "2015 (Ad'AP)",
    detail: {
      description: "L'obligation d'accessibilité s'applique à tout ERP recevant du public. Pour les locaux existants, des dérogations peuvent être accordées via un Agenda d'Accessibilité Programmée (Ad'AP).",
      points: [
        "Accès extérieur de plain-pied ou rampe à 5% max. (8% exceptionnel)",
        "Largeur de passage minimum : 90 cm pour les portes, 1,40 m pour les couloirs",
        "Sanitaires adaptés PMR avec barres d'appui",
        "Signalétique en relief et contraste visuel pour malvoyants",
        "Stationnement PMR à proximité de l'entrée",
        "Interphone ou sonnette accessible depuis fauteuil (hauteur 90-130 cm)"
      ],
      details: [
        { label: "Rampe max.", value: "5% (8% excep.)" },
        { label: "Largeur porte", value: "90 cm min." },
        { label: "Dérogation", value: "Via Ad'AP" },
        { label: "Contrôle", value: "SCDA/DDT" }
      ],
      alert: "Le non-respect des règles d'accessibilité est passible d'une amende pouvant aller jusqu'à 45 000 € pour les personnes morales. Les dérogations doivent être demandées officiellement à la préfecture.",
      sources: ["Loi n°2005-102", "Décret n°2006-555", "Arrêté du 20/04/2017"]
    }
  },

  // ═══════════ SANTÉ & HYGIÈNE ═══════════
  {
    id: 13,
    category: "sante",
    title: "Protocole de soins et médicaments",
    ref: "Art. R.2324-30 à R.2324-33 CSP",
    summary: "Administration de médicaments possible uniquement sur ordonnance médicale et avec protocole signé par un médecin. Médicaments sous clé, traçabilité obligatoire.",
    source: "CASF — ANSES — HAS",
    date: "2021",
    detail: {
      description: "La gestion des soins et médicaments en micro-crèche est strictement encadrée pour protéger les enfants et dégager la responsabilité des professionnels.",
      points: [
        "Ordonnance médicale obligatoire pour tout médicament administré",
        "Protocole d'administration validé par le médecin référent de la structure",
        "Armoire à pharmacie fermée à clé, hors de portée des enfants",
        "Fiche de traçabilité : heure, dose, nom de l'enfant, signature de l'administrant",
        "Autorisation écrite des parents pour tout acte de soin (même homéopathie)",
        "Médicaments nominatifs : ne pas partager entre enfants",
        "Trousse de premiers secours obligatoire avec liste de matériel définie"
      ],
      details: [
        { label: "Ordonnance", value: "Obligatoire" },
        { label: "Protocole médecin", value: "Requis" },
        { label: "Armoire", value: "Fermée à clé" },
        { label: "Traçabilité", value: "Obligatoire" }
      ],
      alert: "En cas de doute sur l'état de santé d'un enfant, le professionnel doit immédiatement contacter les parents. Si l'enfant est inconscient ou en détresse respiratoire : appel du 15 (SAMU) en premier.",
      sources: ["Art. R.2324-30 CSP", "Recommandations HAS 2019", "Circulaire DGS/PS3/2002"]
    }
  },
  {
    id: 14,
    category: "sante",
    title: "Éviction des enfants malades — Maladies à déclaration obligatoire",
    ref: "Art. R.2324-25 CSP — Arrêté du 14/03/1986",
    summary: "Liste des maladies entraînant une éviction obligatoire avec durées définies. Obligations de signalement pour les maladies à déclaration obligatoire (MDO) à l'ARS.",
    source: "ARS — SPF",
    date: "2023",
    detail: {
      description: "Les règles d'éviction protègent les autres enfants et le personnel. Certaines maladies doivent également être signalées à l'Agence Régionale de Santé (ARS) dans le cadre de la surveillance épidémiologique nationale.",
      points: [
        "Méningite bactérienne : éviction immédiate, signalement ARS sous 24h (MDO)",
        "Varicelle : éviction jusqu'à dessèchement de toutes les vésicules",
        "Gastro-entérite : éviction 48h après la fin des symptômes",
        "Conjonctivite bactérienne : éviction jusqu'à traitement antibiotique 24h",
        "Impétigo : éviction jusqu'à guérison clinique (sous traitement)",
        "Fièvre > 38°5 : éviction recommandée, retour possible après 24h d'apyrexie",
        "COVID-19 : protocoles actualisés selon recommandations SPF en vigueur"
      ],
      details: [
        { label: "Méningite", value: "Signalement 24h" },
        { label: "Varicelle", value: "Éviction lésions" },
        { label: "Gastro", value: "48h symptômes" },
        { label: "Fièvre > 38,5°", value: "Éviction recomm." }
      ],
      alert: "La liste des maladies à déclaration obligatoire est mise à jour régulièrement par le ministère de la Santé. La structure doit disposer de la liste actualisée et former le personnel à la procédure de signalement.",
      sources: ["Arrêté 14/03/1986", "Art. R.3113-1 CSS", "Bulletins SPF 2024"]
    }
  },
  {
    id: 15,
    category: "sante",
    title: "Règles d'hygiène alimentaire — HACCP",
    ref: "Règlement CE n°852/2004 — Arrêté du 21/12/2009",
    summary: "Les repas servis aux enfants sont soumis aux normes HACCP. Obligation de traçabilité des aliments, contrôle des températures, formation du personnel à l'hygiène alimentaire.",
    source: "DGCCRF — DDPP",
    date: "2024",
    detail: {
      description: "Même pour des petites quantités, la réglementation hygiène alimentaire s'applique pleinement. La micro-crèche peut préparer les repas sur place ou les faire livrer par un prestataire agréé.",
      points: [
        "Plan de maîtrise sanitaire (PMS) obligatoire, adapté à l'activité",
        "Relevé de températures : réfrigérateur (< 4°C), congélateur (< -18°C) — 2x/jour",
        "Conservation des plats témoins 5 jours minimum pour les repas servis",
        "Formation HACCP d'au moins 1 personne référente pour la cuisine",
        "Pas d'œufs crus, de charcuterie non cuite pour les moins de 3 ans",
        "Eau du robinet conforme ou eau embouteillée pour la préparation des biberons",
        "Matériaux au contact alimentaire : sans BPA (biberons, bols, cuillères)"
      ],
      details: [
        { label: "PMS", value: "Obligatoire" },
        { label: "Temp. frigo", value: "< 4°C" },
        { label: "Plats témoins", value: "5 jours" },
        { label: "Formation HACCP", value: "1 référent min." }
      ],
      alert: "En cas de toxi-infection alimentaire collective (TIAC), la déclaration à l'ARS et à la DDPP est obligatoire sous 24h. La micro-crèche peut être suspendue le temps de l'enquête épidémiologique.",
      sources: ["Règlement CE 852/2004", "Arrêté 21/12/2009", "Note DGAL/SDSSA/2023"]
    }
  },

  // ═══════════ GESTION & ADMINISTRATIF ═══════════
  {
    id: 16,
    category: "gestion",
    title: "Règlement de fonctionnement",
    ref: "Art. R.2324-26 CSP",
    summary: "Document obligatoire remis à chaque famille lors de l'inscription. Il définit les horaires, les tarifs, les modalités d'accueil, les règles de vie et les droits des parents.",
    source: "CASF",
    date: "2021",
    detail: {
      description: "Le règlement de fonctionnement est un contrat moral entre la structure et les familles. Il doit être approuvé par la PMI et mis à jour en cas de modification significative.",
      points: [
        "Horaires d'ouverture et de fermeture, jours fériés et congés annuels",
        "Modalités de facturation : tarif horaire, mensualisation, absences",
        "Conditions d'accueil (entrées/sorties, personnes autorisées à reprendre l'enfant)",
        "Règles d'hygiène et de santé (vaccinations, médicaments, éviction)",
        "Procédures en cas d'urgence médicale",
        "Droits et participation des parents (réunions, accès aux informations)",
        "Conditions de rupture du contrat d'accueil (préavis, modalités)"
      ],
      details: [
        { label: "Document", value: "Obligatoire" },
        { label: "Remise", value: "À l'inscription" },
        { label: "Approbation", value: "PMI" },
        { label: "Mise à jour", value: "À chaque modif." }
      ],
      alert: "Le règlement de fonctionnement doit être affiché dans un lieu visible de la structure. Les parents doivent signer un accusé de réception. En cas de litige, ce document fait foi devant les tribunaux.",
      sources: ["Art. R.2324-26 CSP", "Guide DGCS 2021"]
    }
  },
  {
    id: 17,
    category: "gestion",
    title: "Contrat d'accueil et facturation aux familles",
    ref: "Art. R.2324-27 CSP — Barème CNAF",
    summary: "Un contrat d'accueil individuel doit être signé pour chaque enfant. Pour les structures sous PSU : tarification selon le barème national CNAF (quotient familial).",
    source: "CASF — CNAF",
    date: "2024",
    detail: {
      description: "Le contrat d'accueil précise les engagements réciproques de la famille et de la structure. La durée et les modalités de résiliation doivent être clairement stipulées.",
      points: [
        "Mentions obligatoires : identité des parties, dates, nombre d'heures hebdomadaires",
        "Tarification PSU : plancher à 0,25 €/h et plafond variable selon revenus",
        "Plancher CAF 2024 : 0,26 €/h — plafond maximum : ≈ 4,80 €/h selon QF",
        "Mensualisation possible (lissage des frais sur 12 mois)",
        "Préavis de résiliation : généralement 1 à 3 mois selon le contrat",
        "Attestation fiscale annuelle obligatoire pour les familles (crédit d'impôt)",
        "Contrat PAJE : tarification libre mais CMG versé aux familles"
      ],
      details: [
        { label: "Plancher PSU 2024", value: "0,26 €/h" },
        { label: "Plafond PSU 2024", value: "≈ 4,80 €/h" },
        { label: "Attestation fisc.", value: "Annuelle obligat." },
        { label: "Mensualisation", value: "Possible" }
      ],
      alert: "La facturation aux familles doit refléter les heures réellement contractualisées, pas uniquement les heures effectivement utilisées. Les absences non justifiées médicalement sont généralement dues.",
      sources: ["Art. R.2324-27 CSP", "Barème CNAF 2024", "Art. 200 quater B CGI"]
    }
  },
  {
    id: 18,
    category: "gestion",
    title: "Projet d'établissement et évaluation",
    ref: "Art. R.2324-29 CSP — Recommandations ANESM",
    summary: "Document pédagogique obligatoire décrivant les valeurs, les objectifs éducatifs et les pratiques professionnelles de la structure. Réévalué tous les 5 ans.",
    source: "CASF — HAS / ANESM",
    date: "2021",
    detail: {
      description: "Le projet d'établissement est la charte pédagogique de la micro-crèche. Il engage l'ensemble de l'équipe et doit être cohérent avec les pratiques quotidiennes observées lors des contrôles PMI.",
      points: [
        "Valeurs et philosophie d'accueil de la structure",
        "Projet éducatif et pédagogique : activités, rythmes, autonomie",
        "Projet social : accueil des familles, diversité, inclusion",
        "Politique d'accueil des enfants en situation de handicap (PPRE si besoin)",
        "Organisation du travail et modalités de coordination de l'équipe",
        "Formation continue et supervision de l'équipe",
        "Modalités d'évaluation interne et de participation des familles"
      ],
      details: [
        { label: "Obligatoire", value: "Oui" },
        { label: "Révision", value: "Tous les 5 ans" },
        { label: "Annexé à", value: "Dossier agrément" },
        { label: "Évaluation", value: "Interne + externe" }
      ],
      alert: "Depuis la réforme de 2021, le projet d'établissement doit intégrer un volet spécifique sur la bientraitance et la prévention de la maltraitance (en lien avec les recommandations HAS). Son absence peut bloquer le renouvellement de l'autorisation.",
      sources: ["Art. R.2324-29 CSP", "Recommandations HAS 2022", "Décret 2021-1131"]
    }
  },
  {
    id: 19,
    category: "gestion",
    title: "Registres obligatoires et archivage",
    ref: "Art. R.2324-50 à R.2324-52 CSP",
    summary: "Registre de présence des enfants, registre du personnel, cahier de liaison, fiches de soins : documents obligatoires devant être conservés 5 ans minimum.",
    source: "CASF",
    date: "2021",
    detail: {
      description: "La tenue de registres fiables est indispensable pour la sécurité des enfants, la facturation aux familles et la conformité réglementaire lors des contrôles PMI.",
      points: [
        "Registre de présence : entrée/sortie de chaque enfant avec heure exacte",
        "Registre du personnel : présences, qualifications, remplacements",
        "Cahier de liaison ou application numérique : transmissions famille ↔ équipe",
        "Fiche de vie quotidienne : repas, sommeil, soins pour chaque enfant",
        "Registre des incidents : chutes, morsures, accidents — avec suites données",
        "Conservation : 5 ans minimum pour les registres de présence et soins",
        "RGPD : données personnelles des familles et enfants protégées (politique de confidentialité)"
      ],
      details: [
        { label: "Conservation", value: "5 ans minimum" },
        { label: "Incidents", value: "Registre dédié" },
        { label: "Numérique", value: "Accepté" },
        { label: "RGPD", value: "Applicable" }
      ],
      alert: "L'absence de registres à jour lors d'un contrôle PMI peut entraîner une mise en demeure. En cas d'accident grave d'un enfant, les registres sont les premières pièces demandées par les enquêteurs et les assureurs.",
      sources: ["Art. R.2324-50 CSP", "RGPD Règlement UE 2016/679", "Guide CNIL 2021"]
    }
  },
  {
    id: 20,
    category: "gestion",
    title: "Assurances obligatoires",
    ref: "Art. L.2324-1 CSP — Droit des assurances",
    summary: "Responsabilité civile professionnelle obligatoire pour la structure et le gestionnaire. Assurance des locaux, des personnes accueillies et du personnel également requises.",
    source: "CASF — Code assurances",
    date: "2024",
    detail: {
      description: "Les obligations d'assurance couvrent les risques liés à l'accueil d'enfants en bas âge. Un défaut d'assurance engage personnellement la responsabilité du gestionnaire.",
      points: [
        "RC professionnelle : couvre les dommages causés aux enfants, familles, tiers",
        "RC exploitation : couvre les dommages liés à l'activité de la structure",
        "Assurance locaux : multirisque professionnelle (incendie, dégâts des eaux, vol)",
        "Assurance des accidents corporels des enfants accueillis",
        "Protection juridique professionnelle (recommandée)",
        "Justificatif d'assurance à fournir dans le dossier d'agrément",
        "Mise à jour annuelle des attestations (exigible par la PMI)"
      ],
      details: [
        { label: "RC Pro", value: "Obligatoire" },
        { label: "Locaux", value: "Obligatoire" },
        { label: "Accident enfants", value: "Obligatoire" },
        { label: "Mise à jour", value: "Annuelle" }
      ],
      alert: "La couverture RC professionnelle doit inclure spécifiquement l'accueil du jeune enfant (< 6 ans). Certaines polices standard excluent cette activité ou prévoient des plafonds insuffisants. Vérifier les exclusions de garanties.",
      sources: ["Art. L.2324-1 CSP", "Code des assurances Art. L.121-1", "Guide professionnel FFSA"]
    }
  },

  // ═══════════ DÉCRET 2025-304 — NOUVELLES FICHES ═══════════
  {
    id: 21,
    category: "decret2025",
    isNew: true,
    tags: ["decret2025"],
    title: "Décret 2025-304 — Vue d'ensemble et calendrier",
    ref: "Décret n° 2025-304 du 1er avril 2025 — JO 2 avril 2025",
    summary: "Réforme majeure en 3 temps : application immédiate (avril 2025), direction/RT (sept. 2026), qualifications/CAP AEPE reportées à sept. 2027. Nouveau titre IEPE créé pour la transition.",
    source: "Journal Officiel — 2 avril 2025 — Report min. Rist 26 mars 2026",
    date: "Mis à jour avril 2026",
    detail: {
      description: "Le décret n° 2025-304 du 1er avril 2025 s'applique en trois vagues successives. Un report ministériel annoncé le 26 mars 2026 décale les exigences de qualification (CAP AEPE) de septembre 2026 à septembre 2027, sous conditions.",
      points: [
        "🟢 3 avril 2025 : procédures d'autorisation, autorisation 15 ans, projet qualité",
        "🟠 1er septembre 2026 : suppression référent technique, direction 0,5 ETP obligatoire",
        "🔴 1er septembre 2027 (reporté) : qualifications catégorie 1 obligatoires, fin encadrement solo CAP AEPE",
        "Condition du report 2027 : justifier d'une VAE engagée avant le 1er septembre 2026",
        "Nouveau titre IEPE (niveau 4) créé : voie de montée en catégorie 1 pour les CAP AEPE",
        "Direction limitée à 2 micro-crèches maximum par personne (dès sept. 2026)",
        "4 procédures d'autorisation formalisées : création, extension, transformation, cession"
      ],
      details: [
        { label: "Vague 1", value: "3 avril 2025" },
        { label: "Vague 2 (RT/Direction)", value: "1er sept. 2026" },
        { label: "Vague 3 (Qualif.)", value: "1er sept. 2027" },
        { label: "Durée autorisation", value: "15 ans" }
      ],
      alert: "Le report à 2027 pour les qualifications a été annoncé oralement lors du Comité de filière PE du 26 mars 2026 par la ministre Stéphanie Rist. Le décret modificatif n'était pas encore publié au JO à cette date. Surveiller sa publication pour confirmer les modalités exactes.",
      sources: ["Décret n°2025-304 du 1er avril 2025", "JO du 2 avril 2025", "Annonce min. Rist — Comité filière PE, 26 mars 2026", "Question sénat QSE 260207705 — fév. 2026"]
    }
  },
  {
    id: 22,
    category: "decret2025",
    isNew: true,
    tags: ["decret2025"],
    title: "Nouvelle direction obligatoire à 0,5 ETP",
    ref: "Décret n° 2025-304 — Art. R.2324-34 nouveau CSP",
    summary: "À partir du 1er septembre 2026, chaque micro-crèche doit avoir un directeur dédié à hauteur de 0,5 ETP minimum. Une même personne ne peut diriger plus de 2 structures.",
    source: "Décret 2025-304",
    date: "Entrée en vigueur : 1er sept. 2026",
    detail: {
      description: "Cette mesure phare du décret 2025 supprime le système du référent technique à temps partiel ou mutualisé sur plusieurs structures sans limite. Elle impose une direction structurée et mieux rémunérée.",
      points: [
        "Direction obligatoire à 0,5 ETP minimum par micro-crèche",
        "Une même personne : maximum 2 micro-crèches en direction",
        "Profil requis : professionnel diplômé de niveau III ou II (EJE, infirmier, puériculteur, médecin)",
        "Fiche de poste direction à formaliser et à présenter à la PMI",
        "La fonction de direction inclut : management, pédagogie, conformité réglementaire, lien avec familles",
        "Convention de mutualisation possible entre 2 structures max. (formalisation obligatoire)",
        "Surcoût estimé : entre 15 000 € et 25 000 € annuels par structure selon les cas"
      ],
      details: [
        { label: "ETP minimum", value: "0,5 ETP/structure" },
        { label: "Max. structures", value: "2 par directeur" },
        { label: "Entrée en vigueur", value: "01/09/2026" },
        { label: "Surcoût estimé", value: "15–25 k€/an" }
      ],
      alert: "La pénurie nationale de professionnels diplômés (EJE, puéricultrices) rend cette obligation particulièrement difficile à respecter dans les zones rurales et périurbaines. Des fermetures de structures sont redoutées si aucun assouplissement n'est prévu. Surveiller les textes correctifs prévus en 2026.",
      sources: ["Décret n°2025-304 du 1er avril 2025", "Question sénat QSE 260207705", "Analyse Leia-app.fr avril 2026"]
    }
  },
  {
    id: 23,
    category: "decret2025",
    isNew: true,
    tags: ["decret2025"],
    title: "4e volet obligatoire du projet d'établissement",
    ref: "Art. R.2324-29 CSP modifié — Décret 2025-304",
    summary: "Le projet d'établissement comprend désormais 4 volets obligatoires : éducatif, social, pédagogique + nouveau volet sur la qualité d'accueil (Référentiel National Qualité).",
    source: "CASF — HAS — Décret 2025-304",
    date: "Avril 2025",
    detail: {
      description: "Le décret 2025-304 ajoute un 4e projet au sein du projet d'établissement obligatoire, en lien avec le Référentiel National de la Qualité d'Accueil du Jeune Enfant (RNQAJE) publié par la HAS.",
      points: [
        "Volet 1 (inchangé) : Projet éducatif — valeurs, philosophie, accompagnement de l'enfant",
        "Volet 2 (inchangé) : Projet pédagogique — activités, rythmes, pratiques professionnelles",
        "Volet 3 (inchangé) : Projet social — accueil des familles, diversité, inclusion",
        "Volet 4 (nouveau) : Projet qualité d'accueil — alignement avec le Référentiel National HAS",
        "Le référentiel HAS couvre : sécurité, bien-être, développement de l'enfant, relation avec les familles",
        "Auto-évaluation annuelle recommandée sur la base du référentiel",
        "Le volet qualité doit être présenté à la PMI lors du renouvellement d'autorisation"
      ],
      details: [
        { label: "Volets obligatoires", value: "4 (dont 1 nouveau)" },
        { label: "Référentiel", value: "RNQAJE — HAS" },
        { label: "Auto-évaluation", value: "Annuelle recomm." },
        { label: "Contrôle PMI", value: "Au renouvellement" }
      ],
      alert: "Le projet d'établissement doit être mis à jour pour intégrer ce 4e volet qualité. Les structures en renouvellement d'autorisation dont le projet ne comprend pas ce volet risquent un avis défavorable de la PMI. Télécharger le Référentiel HAS sur has-sante.fr.",
      sources: ["Décret n°2025-304 du 1er avril 2025", "Référentiel HAS RNQAJE 2022", "Art. R.2324-29 CSP modifié"]
    }
  },
  {
    id: 24,
    category: "decret2025",
    isNew: true,
    tags: ["decret2025", "encadrement"],
    title: "CAP AEPE en micro-crèche — Statut, droits et avenir",
    ref: "Décret 2025-304 — SNPPE mars 2026 — Report min. Rist 26 mars 2026",
    summary: "Les CAP AEPE peuvent toujours travailler en micro-crèche (60% catégorie 2). Mais ils ne peuvent plus être seuls avec des enfants. Voie de montée : titre IEPE niveau 4 par VAE. Pleine application reportée au 1er sept. 2027.",
    source: "SNPPE — Décret 2025-304 — Annonce ministérielle",
    date: "Mis à jour avril 2026",
    update2025: [
      { date: "✅ Maintenu — CAP AEPE en micro-crèche", text: "Contrairement aux rumeurs, le CAP AEPE n'est pas supprimé en micro-crèche. Les titulaires continuent d'exercer dans les 60% de catégorie 2. Le SNPPE a formellement démenti les affirmations contraires (mars 2026)." },
      { date: "❌ Interdit dès maintenant — encadrement solo", text: "Un CAP AEPE seul ne peut plus encadrer un groupe d'enfants. Dès 4 enfants : binôme obligatoire. Même pour 1 à 3 enfants, un professionnel catégorie 1 est requis pour l'encadrement solo." },
      { date: "🎓 Solution — Titre IEPE (niveau 4 / catégorie 1)", text: "Nouveau titre créé pour permettre aux CAP AEPE de passer en catégorie 1. Accessible par VAE (12-18 mois) ou formation. Donne accès à l'encadrement solo et compte dans les 40-50% obligatoires." },
      { date: "⚡ Report au 1er sept. 2027 — conditionnel", text: "La pleine application des exigences catégorie 1 est reportée d'un an. Condition : la structure doit prouver avant le 1er septembre 2026 qu'au moins un salarié CAP AEPE est engagé dans une VAE vers l'IEPE ou autre diplôme catégorie 1." }
    ],
    detail: {
      description: "Le décret 2025-304 ne supprime pas le CAP AEPE des micro-crèches mais restreint significativement leur autonomie professionnelle. La voie de montée en compétences via le titre IEPE devient stratégique pour les professionnels et les gestionnaires.",
      points: [
        "✅ CAP AEPE : toujours autorisé à travailler en micro-crèche dans les 60% catégorie 2",
        "❌ CAP AEPE : ne peut pas être seul avec des enfants (ni 1, ni 3, ni plus)",
        "❌ CAP AEPE : ne compte pas dans les 40-50% obligatoires de catégorie 1",
        "🎓 IEPE : nouveau titre niveau 4, passe le CAP AEPE en catégorie 1 — accessible par VAE",
        "📅 VAE IEPE : durée 12 à 18 mois, à engager avant le 1er septembre 2026 pour le report",
        "🔄 Période transitoire 2026-2027 : CAP AEPE + 2 ans d'expérience toléré si VAE en cours",
        "📅 1er septembre 2027 : sans titre IEPE, le CAP AEPE reste en catégorie 2 définitivement"
      ],
      details: [
        { label: "Travail en micro-crèche", value: "✅ Oui (cat. 2)" },
        { label: "Encadrement solo", value: "❌ Interdit" },
        { label: "Montée cat. 1", value: "Titre IEPE (VAE)" },
        { label: "Échéance", value: "01/09/2027" }
      ],
      alert: "Les gestionnaires dont l'équipe repose majoritairement sur des CAP AEPE risquent de se retrouver avec 0% de catégorie 1 en septembre 2027 si aucune VAE n'est engagée. Identifier dès maintenant les salariés éligibles à la VAE IEPE et formaliser leur engagement avant le 1er septembre 2026.",
      sources: ["SNPPE — communiqué mars 2026", "Décret n°2025-304 du 1er avril 2025", "Annonce min. Stéphanie Rist — 26 mars 2026", "Eloformation — analyse fév. 2026"]
    }
  },

  // ═══════════ RÉFÉRENTIEL BÂTIMENTAIRE ═══════════
  {
    id: 25,
    category: "locaux",
    title: "Référentiel bâtimentaire national — Vue d'ensemble",
    ref: "Arrêté du 31 août 2021 — CSP Art. R.2324-54 à R.2324-60",
    summary: "Cadre réglementaire unifié fixant les normes de locaux, d'aménagement et d'affichage pour tous les EAJE. Obligatoire pour les nouvelles structures depuis sept. 2022. Mise en conformité des structures existantes : sept. 2026.",
    source: "DGCS — Arrêté 31 août 2021",
    date: "Sept. 2022 (nouvelles) / Sept. 2026 (existantes)",
    detail: {
      description: "Le référentiel bâtimentaire national, créé par l'arrêté du 31 août 2021, unifie et renforce les normes applicables à tous les EAJE en France, y compris les micro-crèches. Il met fin aux interprétations locales variables selon les services PMI.",
      points: [
        "Applicable aux nouvelles demandes déposées après le 31 août 2022 : 70 dispositions intégrales",
        "Structures existantes avant cette date : 23 dispositions obligatoires + mise en conformité totale au 1er sept. 2026",
        "Concerne : superficies intérieures, espaces extérieurs, sécurité, accessibilité, qualité de l'air, affichage",
        "Outil d'autodiagnostic officiel DGCS/AMF disponible pour évaluer sa conformité",
        "Les gestionnaires doivent pouvoir justifier les écarts aux recommandations non obligatoires",
        "La PMI vérifie la conformité lors de l'instruction du dossier d'agrément et des contrôles"
      ],
      details: [
        { label: "Texte fondateur", value: "Arrêté 31/08/2021" },
        { label: "Nouvelles struct.", value: "Dès sept. 2022" },
        { label: "Struct. existantes", value: "Conf. sept. 2026" },
        { label: "Nb dispositions", value: "70 (intégral)" }
      ],
      alert: "Les structures existantes ouvertes avant septembre 2022 doivent être en conformité totale avec les 70 dispositions du référentiel au 1er septembre 2026. Un autodiagnostic est disponible sur le site du ministère (DGCS/AMF). Un écart non justifié peut bloquer le renouvellement d'autorisation.",
      sources: ["Arrêté du 31 août 2021 (JO du 2 sept. 2021)", "Art. R.2324-54 à R.2324-60 CSP", "Guide DGCS 2022", "Outil autodiagnostic AMF/DGCS"]
    }
  },
  {
    id: 26,
    category: "locaux",
    title: "Superficies intérieures et extérieures obligatoires",
    ref: "Arrêté du 31 août 2021 — Référentiel bâtimentaire EAJE",
    summary: "7 m² par place autorisée en intérieur (5,5 m² en zone dense). Espace extérieur : 15 m² minimum pour les micro-crèches en zone tendue, ou 2 m²/place (min. 20 m²) en zone normale.",
    source: "DGCS — Arrêté 31 août 2021",
    date: "Sept. 2022",
    detail: {
      description: "Le référentiel fixe pour la première fois des normes nationales uniformes de superficie, mettant fin aux disparités entre départements. Ces chiffres s'appliquent aux espaces de vie des enfants, hors circulations, sanitaires, locaux techniques et espaces réservés au personnel.",
      points: [
        "Surface intérieure : 7 m² minimum par place autorisée (hors circulations, sanitaires, locaux tech.)",
        "Zone très dense (ZTD) : 5,5 m² par place autorisée, si espace motricité/éveil supplémentaire prévu",
        "Espace extérieur privatif micro-crèche (zone tendue) : 15 m² minimum",
        "Espace extérieur zone normale : 2 m² par place, minimum 20 m²",
        "Alternative extérieur : espace public sécurisé à moins de 300 m, accessible au moins 15h/semaine",
        "Pour une micro-crèche de 12 places : 84 m² intérieurs minimum (ou 66 m² en zone dense)",
        "Les surfaces sont vérifiées sur plans puis in situ lors de la visite PMI"
      ],
      details: [
        { label: "Intérieur standard", value: "7 m²/place" },
        { label: "Intérieur zone dense", value: "5,5 m²/place" },
        { label: "Extérieur micro-cr.", value: "15 m² min." },
        { label: "Exemple 12 places", value: "84 m² min." }
      ],
      alert: "La surface de 7 m²/place est calculée sur les seuls espaces de vie des enfants. Un local de 100 m² bruts ne donne pas automatiquement droit à 14 places : il faut déduire les sanitaires, couloirs non aménagés, cuisine, bureau, locaux techniques. Faire valider le calcul par la PMI avant signature du bail.",
      sources: ["Arrêté du 31 août 2021", "Référentiel bâtimentaire national — tableau récapitulatif", "Journal EJE — analyse 2021"]
    }
  },
  {
    id: 27,
    category: "locaux",
    title: "Sécurité, qualité de l'air, aménagements et affichage obligatoires",
    ref: "Arrêté du 31 août 2021 — Référentiel bâtimentaire EAJE",
    summary: "Contrôle d'accès (visiophone/digicode), fenêtres sécurisées, prises à 1,30 m, ventilation 30 m³/h/enfant, matériaux classés A ou A+, bruit < 40 dB. 8 affichages obligatoires dont la Charte nationale.",
    source: "DGCS — Arrêté 31 août 2021",
    date: "Sept. 2022",
    detail: {
      description: "Au-delà des superficies, le référentiel bâtimentaire détaille les exigences techniques de sécurité passive, de qualité environnementale et d'affichage. Ces éléments sont contrôlés par la PMI lors de toute visite et conditionnent l'autorisation d'ouverture.",
      points: [
        "Contrôle d'accès : visiophone ou interphone + digicode ou badge obligatoire à l'entrée",
        "Fenêtres sécurisées : système anti-ouverture ou hauteur d'allège ≥ 1,30 m côté enfants",
        "Prises électriques : à 1,30 m de hauteur minimum, ou protégées par cache-prises",
        "Ventilation : 30 m³/h/enfant minimum — VMC ou ventilation naturelle contrôlée",
        "Matériaux : classés A ou A+ (émissions COV faibles) — peintures, revêtements, colles",
        "Bruit ambiant : < 40 dB dans les espaces de vie (hors bruit des enfants)",
        "Portes : oculus de surveillance ou anti-pincement des doigts sur toutes les portes intérieures",
        "Espace allaitement : prévoir un coin calme, confortable, intime (pas de salle dédiée obligatoire)"
      ],
      details: [
        { label: "Ventilation", value: "30 m³/h/enfant" },
        { label: "Matériaux", value: "Classe A ou A+" },
        { label: "Bruit ambiant", value: "< 40 dB" },
        { label: "Accès", value: "Visiophone + badge" }
      ],
      alert: "8 affichages sont obligatoirement visibles dans les locaux : plan d'évacuation, numéros d'urgence (119, SAMU, pompiers), consignes Vigipirate, interdiction de fumer/vapoter, projet d'établissement, règlement de fonctionnement, menus, et Charte nationale d'accueil du jeune enfant (désormais opposable juridiquement). L'absence de l'un de ces affichages est un manquement relevé lors des contrôles PMI.",
      sources: ["Arrêté du 31 août 2021 — Référentiel bâtimentaire", "Emy Working — analyse avril 2025", "Guide DGCS affichage obligatoire EAJE"]
    }
  },

  // ═══════════ SANTÉ — NOUVELLES FICHES ═══════════
  {
    id: 28,
    category: "sante",
    title: "RSAI — Référent Santé et Accueil Inclusif",
    ref: "Art. R.2324-39 à R.2324-46-2 CSP — Décret 2021-1131",
    summary: "Obligatoire depuis le 1er janvier 2023 dans toutes les micro-crèches. Minimum 10h/an dont 2h/trimestre. Profil : médecin, puériculteur·trice ou infirmier·e avec 3 ans d'expérience en pédiatrie.",
    source: "Code de la santé publique — Décret 2021-1131",
    date: "Obligatoire depuis janv. 2023",
    detail: {
      description: "Le RSAI remplace la fonction de médecin référent de crèche. Il est le garant de la qualité sanitaire et de l'inclusion des enfants en situation de handicap ou de maladie chronique. Son intervention est encadrée par convention entre la micro-crèche et le professionnel.",
      points: [
        "Obligation depuis le 1er janvier 2023 pour toutes les micro-crèches (décret 2021-1131)",
        "Durée minimale : 10 heures annuelles, dont 2 heures par trimestre",
        "Profils autorisés : médecin avec expérience en santé du jeune enfant, puériculteur·trice DE, infirmier·e DE avec 3 ans d'expérience auprès de jeunes enfants",
        "Missions : protocoles de santé, accueil inclusif, formation de l'équipe, lien avec familles",
        "Rédige et valide les protocoles sanitaires (médicaments, soins, éviction, urgences)",
        "Coordonne la mise en place des PAI pour les enfants en situation de handicap ou maladie chronique",
        "Contribue au repérage des enfants en danger (signalement IP/CRIP)",
        "Peut être mutualisé entre plusieurs structures d'un même réseau ou territoire"
      ],
      details: [
        { label: "Obligatoire depuis", value: "Janv. 2023" },
        { label: "Temps minimum", value: "10h/an, 2h/trim." },
        { label: "Profil", value: "Médecin / puéric. / IDE" },
        { label: "Mutualisation", value: "Possible" }
      ],
      alert: "L'absence de RSAI ou le non-respect du temps minimal d'intervention est un manquement relevé lors des contrôles PMI. Le coût peut être significatif pour une petite structure — envisager la mutualisation avec d'autres micro-crèches ou via un réseau. Conserver les feuilles de présence et comptes-rendus des interventions.",
      sources: ["Art. R.2324-39 CSP", "Art. R.2324-46-2 CSP", "Décret n°2021-1131 du 30 août 2021", "Crechemploi — analyse 2025"]
    }
  },
  {
    id: 29,
    category: "sante",
    title: "PAI — Projet d'Accueil Individualisé et accueil inclusif",
    ref: "Art. R.2324-39 CSP — Loi du 11/02/2005 — Circulaire DGESCO 2003",
    summary: "Toute micro-crèche a l'obligation d'accueillir les enfants en situation de handicap ou maladie chronique. Le PAI est le document contractuel tripartite (famille, médecin, structure) définissant les adaptations nécessaires.",
    source: "CASF — Code de la santé publique — Loi 2005-102",
    date: "2023",
    detail: {
      description: "L'accueil inclusif est une obligation légale et non une option. La micro-crèche ne peut pas refuser un enfant au seul motif d'un handicap ou d'une maladie chronique. Le PAI organise concrètement les adaptations nécessaires à son accueil.",
      points: [
        "Obligation d'accueil : aucune structure agréée ne peut refuser un enfant au seul motif d'un handicap ou d'une pathologie chronique",
        "PAI initié à la demande de la famille, en lien avec le médecin traitant ou pédiatre de l'enfant",
        "Document tripartite signé par : famille, médecin de l'enfant, directeur de la structure et RSAI",
        "Contenu du PAI : adaptations nécessaires, médicaments autorisés, régimes alimentaires, protocoles d'urgence",
        "Le PAI est révisé à chaque changement de l'état de santé de l'enfant et en début d'année",
        "Formation de l'équipe aux besoins spécifiques de l'enfant : rôle du RSAI",
        "Lien avec les partenaires extérieurs : MDPH, CAMSP, médecin spécialiste",
        "Bonus inclusif CAF : aide financière supplémentaire pour l'accueil d'enfants en situation de handicap"
      ],
      details: [
        { label: "Refus d'accueil", value: "Interdit (handicap)" },
        { label: "Signataires PAI", value: "3 parties" },
        { label: "Révision", value: "À chaque évolution" },
        { label: "Aide CAF", value: "Bonus inclusif" }
      ],
      alert: "Le refus d'accueil d'un enfant en situation de handicap sans motif légitime expose le gestionnaire à des poursuites pour discrimination. La micro-crèche peut toutefois signaler à la PMI une inadéquation entre ses moyens et les besoins de l'enfant, afin de trouver une solution adaptée.",
      sources: ["Art. R.2324-39 CSP", "Loi n°2005-102 du 11 fév. 2005", "Circulaire DGESCO 2003-135", "Guide CNAF accueil inclusif 2022"]
    }
  },
  {
    id: 30,
    category: "sante",
    title: "Interdiction des écrans — Arrêté du 2 juillet 2025",
    ref: "Arrêté du 2 juillet 2025 — JO du 3 juillet 2025",
    summary: "Depuis le 3 juillet 2025, il est interdit d'exposer les enfants de moins de 3 ans aux écrans dans toutes les structures d'accueil agréées (crèches, micro-crèches, assistants maternels).",
    source: "Journal Officiel — 3 juillet 2025",
    date: "En vigueur : 3 juillet 2025",
    detail: {
      description: "Cette interdiction fait suite aux recommandations des autorités sanitaires sur les effets néfastes des écrans sur le développement du jeune enfant (langage, sommeil, attention). Elle s'applique à tous les types d'écrans dans tous les contextes d'accueil professionnel.",
      points: [
        "Interdiction totale d'exposition aux écrans pour les enfants de moins de 3 ans en structure d'accueil",
        "Tous les écrans concernés : télévisions, tablettes, smartphones, ordinateurs, vidéoprojecteurs",
        "Applicable dans toutes les structures : crèches, micro-crèches, haltes-garderies, assistants maternels agréés",
        "En vigueur depuis le 3 juillet 2025 (lendemain de la publication au JO)",
        "Signalétique recommandée : affichage visible dans les espaces de vie des enfants",
        "Aucune dérogation prévue, y compris pour visionnage à finalité pédagogique",
        "Contrôle PMI : l'absence de mesures concrètes peut être relevée lors des inspections"
      ],
      details: [
        { label: "En vigueur", value: "3 juillet 2025" },
        { label: "Âge concerné", value: "Moins de 3 ans" },
        { label: "Structures", value: "Tous EAJE + AM" },
        { label: "Dérogations", value: "Aucune" }
      ],
      alert: "L'interdiction vise les écrans utilisés à des fins de divertissement ou d'occupation. Les équipements professionnels (badge d'accès, écran de surveillance sécurité, caisse) ne sont pas concernés. En cas de doute sur un usage spécifique, consulter la PMI de votre département.",
      sources: ["Arrêté du 2 juillet 2025", "JO du 3 juillet 2025", "Recommandations ANSES 2023", "Fonds Alcuin — analyse fév. 2026"]
    }
  },

  // ═══════════ ENCADREMENT — NOUVELLES FICHES ═══════════
  {
    id: 31,
    category: "encadrement",
    title: "APP — Analyse des Pratiques Professionnelles",
    ref: "Art. R.2324-37 CSP — Décret 2021-1131",
    summary: "Obligatoire depuis septembre 2021 dans tous les EAJE y compris les micro-crèches. Séances régulières animées par un professionnel extérieur qualifié. Fréquence minimale non fixée par décret mais exigée par la PMI.",
    source: "Code de la santé publique — Décret 2021-1131",
    date: "Obligatoire depuis sept. 2021",
    detail: {
      description: "L'APP est un dispositif de supervision collective permettant aux équipes de prendre du recul sur leurs pratiques, d'analyser les situations difficiles et de faire évoluer leur posture professionnelle. Elle est obligatoire et constitue un levier de prévention de la maltraitance.",
      points: [
        "Obligation légale depuis le 1er septembre 2021 (décret 2021-1131 — Art. R.2324-37 CSP)",
        "Animée par un professionnel extérieur à la structure (psychologue, superviseur petite enfance, EJE expérimenté...)",
        "Participation de toute l'équipe encadrante : les séances ne remplacent pas les réunions d'équipe",
        "Fréquence minimale : non précisée par décret mais la PMI attend une régularité (au moins 4 séances/an recommandées)",
        "Objectifs : analyse des situations complexes, prévention de l'épuisement professionnel, cohésion d'équipe",
        "Financement possible via OPCO (prise en charge de la formation) ou fonds propres",
        "Traces documentaires attendues : compte-rendu de séances (anonymisés), preuve de présence de l'intervenant"
      ],
      details: [
        { label: "Obligatoire depuis", value: "Sept. 2021" },
        { label: "Animateur", value: "Professionnel externe" },
        { label: "Fréquence conseillée", value: "4 séances/an min." },
        { label: "Financement", value: "OPCO possible" }
      ],
      alert: "L'absence d'APP est un manquement relevé lors des contrôles PMI depuis 2022. Conserver les convocations, listes de présence et comptes-rendus (même anonymisés) pour justifier la mise en œuvre. Le gestionnaire peut se faire accompagner par son réseau ou sa fédération pour trouver un prestataire.",
      sources: ["Art. R.2324-37 CSP", "Décret n°2021-1131 du 30 août 2021", "AMA Campus — juin 2025", "Doudelio — sept. 2025"]
    }
  },
  {
    id: 32,
    category: "encadrement",
    title: "Charte nationale pour l'accueil du jeune enfant",
    ref: "Décret 2021-1131 — Art. R.2324-17 CSP modifié par décret 2025-304",
    summary: "Document fondateur opposable juridiquement depuis 2021. Affichage obligatoire dans la structure. Base des contrôles PMI et du projet d'établissement. Les gestionnaires s'engagent à en respecter les 10 engagements.",
    source: "DGCS — Ministère des Solidarités",
    date: "2021 — Renforcée en 2025",
    detail: {
      description: "La Charte nationale pour l'accueil du jeune enfant a été rendue opposable juridiquement par le décret 2021-1131. Le décret 2025-304 renforce encore son poids : les gestionnaires doivent veiller à ce que droits et besoins des enfants soient respectés sur son fondement.",
      points: [
        "10 engagements fondamentaux : bientraitance, respect des rythmes, place des parents, diversité...",
        "Opposable juridiquement depuis 2021 : peut être invoquée devant les tribunaux",
        "Affichage obligatoire dans un lieu visible de la structure (hall d'accueil, salle principale)",
        "Remise obligatoire aux familles lors de l'inscription (avec le règlement de fonctionnement)",
        "Base des contrôles PMI : toute pratique contraire à la Charte peut entraîner une mise en demeure",
        "Décret 2025-304 : les gestionnaires doivent veiller à son respect sur le fondement des référentiels nationaux",
        "Lien direct avec le projet d'établissement qui doit en décliner les principes"
      ],
      details: [
        { label: "Opposable depuis", value: "2021" },
        { label: "Affichage", value: "Obligatoire" },
        { label: "Remise familles", value: "À l'inscription" },
        { label: "Engagements", value: "10" }
      ],
      alert: "La Charte est désormais un document juridiquement contraignant. Une pratique contraire à ses principes (ex. : punitions corporelles, isolement, non-respect du rythme de l'enfant) peut constituer un motif de suspension ou de retrait d'autorisation. La télécharger sur le site du ministère et l'intégrer au livret d'accueil des familles.",
      sources: ["Décret n°2021-1131 du 30 août 2021", "Art. R.2324-17 CSP modifié", "Décret n°2025-304 du 1er avril 2025", "Charte nationale DGCS 2021"]
    }
  },

  // ═══════════ GESTION — NOUVELLES FICHES ═══════════
  {
    id: 33,
    category: "gestion",
    title: "DUERP — Document Unique d'Évaluation des Risques Professionnels",
    ref: "Art. L.4121-3 et R.4121-1 Code du travail",
    summary: "Obligatoire dès le premier salarié. Recense tous les risques professionnels (TMS, risques psychosociaux, chutes, produits chimiques...). Mis à jour au minimum une fois par an et après tout accident du travail.",
    source: "Code du travail — INRS",
    date: "Obligatoire (mis à jour annuellement)",
    detail: {
      description: "Le DUERP est un outil de prévention obligatoire pour l'employeur. En micro-crèche, les risques spécifiques sont nombreux : troubles musculo-squelettiques (port d'enfants), risques psychosociaux (épuisement), expositions aux maladies infectieuses, chutes.",
      points: [
        "Obligatoire dès 1 salarié — responsabilité exclusive de l'employeur/gestionnaire",
        "Risques spécifiques petite enfance : TMS (lombalgies, port de charges), RPS (burn-out), infections, chutes",
        "Mis à jour au minimum 1 fois par an (et après tout accident du travail, changement de locaux ou d'organisation)",
        "Consultable par tous les salariés, le CSE (si applicable), l'inspection du travail et la médecine du travail",
        "Depuis 2022 : accompagné d'un programme annuel de prévention des risques",
        "Conservation : pendant au moins 40 ans après la dernière mise à jour",
        "Médecine du travail : peut accompagner gratuitement la rédaction du DUERP"
      ],
      details: [
        { label: "Obligatoire dès", value: "1 salarié" },
        { label: "Mise à jour", value: "1 fois/an min." },
        { label: "Conservation", value: "40 ans" },
        { label: "Aide gratuite", value: "Médecine du travail" }
      ],
      alert: "L'absence de DUERP expose l'employeur à une amende de 1 500 € (3 000 € en récidive) et engage sa responsabilité civile en cas d'accident du travail. En cas de sinistre, l'assureur peut se retourner contre le gestionnaire si le DUERP n'a pas été maintenu à jour.",
      sources: ["Art. L.4121-3 Code du travail", "Art. R.4121-1 Code du travail", "INRS — guide DUERP 2022", "MC Consult crèche — fév. 2025"]
    }
  },
  {
    id: 34,
    category: "gestion",
    title: "Convention collective — CCNSAP (secteur lucratif) et ALISFA (associatif)",
    ref: "CCN SAP — IDCC 3127 — Avenant du 24 nov. 2023 — Applicable au 1er janv. 2025",
    summary: "Depuis le 1er janvier 2025, toutes les micro-crèches du secteur lucratif appliquent la CCNSAP. Les associatives restent sous ALISFA. Nouveauté 2026 : prévoyance obligatoire pour tous les salariés au 1er mai 2026.",
    source: "FESP — FFEC — Accord de branche nov. 2023",
    date: "En vigueur : 1er janv. 2025",
    detail: {
      description: "L'application d'une convention collective est désormais clarifiée pour l'ensemble du secteur. La CCNSAP couvre les micro-crèches privées commerciales, tandis que les structures associatives restent sous la CCN ALISFA. Une prévoyance obligatoire pour tous les salariés entre en vigueur le 1er mai 2026.",
      points: [
        "Micro-crèches privées (SARL, SAS, EI...) : CCN des Services à la Personne (IDCC 3127) depuis le 1er janv. 2025",
        "Micro-crèches associatives : CCN ALISFA (IDCC 1261) — non concernées par la CCNSAP",
        "Avantages CCNSAP : prime d'ancienneté dès 2 ans, formation continue facilitée, évolution de carrière",
        "Grilles salariales spécifiques à la petite enfance en cours de négociation par la branche",
        "Prévoyance obligatoire pour tous les salariés (cadres et non-cadres) : 1er mai 2026",
        "Garanties prévoyance : décès, invalidité, incapacité de travail",
        "Bonus attractivité CAF : accessible aux structures PAJE sous conditions de revalorisation salariale"
      ],
      details: [
        { label: "Lucratif", value: "CCNSAP (IDCC 3127)" },
        { label: "Associatif", value: "ALISFA (IDCC 1261)" },
        { label: "Prévoyance", value: "Obligat. 1er mai 2026" },
        { label: "Ancienneté", value: "Prime dès 2 ans" }
      ],
      alert: "Les gestionnaires de micro-crèches privées qui n'appliquaient aucune convention collective avant 2025 sont désormais tenus d'appliquer la CCNSAP. L'absence d'application expose à des redressements en cas de contrôle URSSAF. Vérifier également la mise en conformité pour la prévoyance avant le 1er mai 2026.",
      sources: ["CCN SAP — IDCC 3127", "Avenant du 24 nov. 2023", "CCN ALISFA — IDCC 1261", "Leia-app — prévoyance avril 2026", "Les Pros de la PE — déc. 2024"]
    }
  },
  {
    id: 35,
    category: "gestion",
    title: "Signalement — Protection de l'enfance (IP / CRIP)",
    ref: "Art. L.226-3 et L.226-4 CASF — Art. 434-3 Code pénal",
    summary: "Tout professionnel de la petite enfance est tenu de signaler sans délai toute situation d'enfant en danger ou en risque de l'être. L'IP (information préoccupante) est transmise à la CRIP du département. Le signalement au procureur s'impose en cas de danger grave.",
    source: "CASF — Code pénal — HAS",
    date: "Obligation permanente",
    detail: {
      description: "La protection de l'enfance est une obligation légale pour tous les professionnels en contact avec des enfants. La non-déclaration d'une situation de danger connue est pénalement sanctionnée. Le RSAI joue un rôle clé dans le dispositif de repérage.",
      points: [
        "IP (information préoccupante) : transmise à la CRIP (Cellule de Recueil des Informations Préoccupantes) du département",
        "Signalement au Procureur de la République : obligatoire si l'enfant est en danger grave et immédiat",
        "Obligation pour tout professionnel ayant connaissance d'une situation de danger ou de risque",
        "Non-signalement : délit pénal — jusqu'à 3 ans d'emprisonnement et 45 000 € d'amende (Art. 434-3 Code pénal)",
        "Le RSAI coordonne le repérage des enfants en danger en lien avec la direction",
        "Formation de l'équipe à la détection des signes de maltraitance : obligation du gestionnaire",
        "Protocole interne de signalement à formaliser et à intégrer au projet d'établissement",
        "Numéro national : 119 (Allô Enfance en Danger) — disponible 24h/24"
      ],
      details: [
        { label: "IP → CRIP", value: "Département" },
        { label: "Danger grave", value: "→ Procureur" },
        { label: "Non-signalement", value: "Délit pénal" },
        { label: "Numéro urgence", value: "119" }
      ],
      alert: "Le signalement n'est pas une accusation : c'est une obligation de protection. Un professionnel qui signale de bonne foi est protégé par la loi même si les faits s'avèrent non fondés. En revanche, ne pas signaler une situation connue engage la responsabilité pénale personnelle du professionnel et du gestionnaire.",
      sources: ["Art. L.226-3 CASF", "Art. L.226-4 CASF", "Art. 434-3 Code pénal", "Recommandations HAS bientraitance 2022", "Guide DGCS signalement 2019"]
    }
  }
];
