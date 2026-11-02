/* Jeu de société « Le Sentier du Koala » — contenu des cartes.
 *
 * Q(cat, public, question, bonne réponse, mauvaise 1, mauvaise 2, à retenir)
 *   cat    : dev (développement) · ped (pédagogie) · pro (protocoles) · par (familles)
 *   public : 'e' équipe · 'p' parents · 'x' les deux
 * D(public, sujet, pistes)  : carte « Partage » sans bonne réponse (échange en groupe)
 *
 * Repères généraux de bonnes pratiques de la petite enfance : à faire relire par la direction
 * et à confronter aux protocoles propres à chaque établissement avant usage en formation.
 */
(function () {
  'use strict';
  var CARTES = [];
  function Q(cat, pub, q, bon, m1, m2, retenir) {
    CARTES.push({ id: CARTES.length, cat: cat, pub: pub, type: 'q', q: q, bon: bon, mauvaises: [m1, m2], retenir: retenir });
  }
  function D(pub, sujet, pistes) {
    CARTES.push({ id: CARTES.length, cat: 'partage', pub: pub, type: 'd', q: sujet, retenir: pistes });
  }

  /* ───────── 🧠 Développement ───────── */
  Q('dev', 'x', "À quel âge la plupart des enfants font-ils leurs premiers pas seuls ?",
    "Entre 12 et 18 mois", "Avant 9 mois", "Pas avant 24 mois",
    "La marche s'acquiert dans une large plage, le plus souvent entre 12 et 18 mois. Si l'enfant ne marche pas à 18 mois, on en parle au médecin.");
  Q('dev', 'x', "Un bébé de 8 mois pleure quand une personne inconnue s'approche. Que se passe-t-il ?",
    "L'angoisse de l'étranger : il distingue ses proches, c'est un progrès", "Il est trop gâté", "Il a un trouble de la sociabilité",
    "Vers 8 mois, l'enfant reconnaît ses figures d'attachement et se méfie des inconnus. Il faut le rassurer, pas le forcer à aller dans les bras.");
  Q('dev', 'x', "Vers quel âge un enfant dit-il ses premiers mots ?",
    "Autour de 12 mois", "Vers 6 mois", "Vers 3 ans",
    "Avant les premiers mots, il babille (dès 6-8 mois) et comprend bien plus de mots qu'il n'en dit. Un rythme varie d'un enfant à l'autre.");
  Q('dev', 'x', "Un enfant de 2 ans dit « non » à tout et se jette par terre. C'est…",
    "Une étape normale : il affirme son autonomie et ses émotions le dépassent", "Un signe de mauvaise éducation", "Un problème de comportement qui demande une punition",
    "Le cerveau des tout-petits ne sait pas encore réguler les émotions fortes. L'adulte rassure, nomme l'émotion et garde un cadre clair et stable.");
  Q('dev', 'x', "Quelle recommandation courante existe pour les écrans chez les tout-petits ?",
    "Pas d'écran avant 3 ans", "Dès 6 mois, en petites séquences", "Dès 1 an pour les dessins animés dits « éducatifs »",
    "Avant 3 ans, les écrans prennent la place des échanges, du jeu et du sommeil. Mieux vaut des livres, du jeu libre et du temps avec l'adulte.");
  Q('dev', 'x', "Quelle est la meilleure façon d'aider un enfant à bien parler ?",
    "Lui parler beaucoup, nommer ce qu'il fait, reformuler ses phrases", "Corriger chaque mot mal prononcé", "Lui répondre en déformant les mots pour qu'il comprenne",
    "On reformule simplement (« Oui, un gros camion ! ») sans faire répéter. Les mots justes et des phrases courtes nourrissent le langage.");
  Q('dev', 'e', "Selon l'approche de Pikler (motricité libre), un bébé qui ne tient pas encore assis seul est…",
    "Laissé libre de découvrir seul ses postures, sans être installé assis", "Installé assis avec des coussins pour le stimuler", "Maintenu assis chaque jour pour s'entraîner",
    "On ne met pas l'enfant dans une position qu'il ne maîtrise pas seul : il bouge mieux, plus sûr de lui, et la posture vient quand il est prêt.");
  Q('dev', 'p', "Mon bébé de 7 mois ne tient pas encore assis seul. Dois-je m'inquiéter ?",
    "Pas forcément : chaque enfant a son rythme, j'en parle au médecin au prochain rendez-vous", "Oui, il faut le caler assis tous les jours", "Oui, c'est forcément un retard grave",
    "La station assise sans appui arrive souvent entre 6 et 9 mois, parfois plus tard. En cas de doute, le médecin ou la PMI font le point.");
  Q('dev', 'x', "Pourquoi un enfant de 18 mois mord-il parfois ?",
    "Il n'a pas encore les mots pour dire frustration, excitation ou envie", "Il est agressif par nature", "Il veut faire mal volontairement",
    "La morsure est fréquente entre 1 et 2 ans. On console d'abord l'enfant mordu, on dit calmement « on ne mord pas, ça fait mal », on propose un autre geste ou un mot.");
  Q('dev', 'x', "Combien d'heures dort environ un enfant de 2 ans sur 24 heures, sieste comprise ?",
    "11 à 14 heures", "8 à 9 heures", "16 à 18 heures",
    "Les besoins varient d'un enfant à l'autre : on observe les signes de fatigue plutôt que de forcer ou de supprimer la sieste.");
  Q('dev', 'x', "Le doudou ou la tétine d'un enfant, c'est…",
    "Un objet transitionnel qui le rassure quand ses parents sont absents", "Une mauvaise habitude à supprimer vite", "Un jouet comme un autre",
    "On ne le retire pas de force et on le garde à portée de l'enfant. Il disparaît naturellement quand l'enfant n'en a plus besoin.");
  Q('dev', 'x', "Propreté : quand l'enfant est-il prêt ?",
    "Quand il en montre les signes (reste sec, curieux, dit « pipi »), souvent entre 2 et 3 ans", "Dès 12 mois, il suffit de l'asseoir sur le pot", "Seulement après 4 ans",
    "La maîtrise des sphincters dépend de la maturation du système nerveux. Pas de pression ni de comparaison : on accompagne quand l'enfant est prêt.");
  Q('dev', 'x', "Vers quel âge un bébé commence-t-il à se retourner du dos sur le ventre ?",
    "Entre 4 et 6 mois", "À 1 mois", "Vers 10 mois",
    "Le retournement arrive en général entre 4 et 6 mois. Le bébé a besoin de temps au sol, libre de ses mouvements, pour y arriver.");

  /* ───────── 🎨 Pédagogie ───────── */
  Q('ped', 'e', "Le « panier des trésors » (Goldschmied) s'adresse à…",
    "Des bébés qui tiennent assis, environ 6-12 mois, avec des objets du quotidien", "Des enfants de 3 ans avec des jouets sonores", "Des bébés allongés avec des jouets en plastique colorés",
    "Brosse, anneaux, tissus, bois, métal : des objets de textures différentes à explorer librement, sans que l'adulte dirige le jeu.");
  Q('ped', 'x', "Un enfant essaie de mettre ses chaussures seul. Que fait l'adulte ?",
    "Il l'encourage et lui laisse le temps (« aide-moi à faire seul »)", "Il le fait à sa place pour gagner du temps", "Il le gronde parce qu'on est en retard",
    "Faire avec, plutôt que faire à la place. Prévoir plus de temps le matin est le vrai secret.");
  Q('ped', 'x', "Un enfant hurle de colère. Quelle première réaction l'aide le plus ?",
    "Se mettre à sa hauteur, nommer l'émotion (« tu es en colère ») et l'accompagner", "Lui dire de se calmer ou il sera puni", "L'ignorer complètement jusqu'à ce que ça passe",
    "Mettre des mots sur l'émotion aide l'enfant à la reconnaître, puis à la réguler. Le calme de l'adulte est contagieux.");
  Q('ped', 'x', "La fessée et les violences éducatives ordinaires sont…",
    "Interdites par la loi depuis 2019", "Tolérées si elles sont rares", "Autorisées à la maison, interdites en crèche",
    "La loi du 10 juillet 2019 interdit les violences éducatives ordinaires (fessée, gifle, humiliations…). Des alternatives existent : cadre, explications, coopération.");
  Q('ped', 'e', "Pendant la période d'adaptation (familiarisation), il est recommandé de…",
    "Progresser par étapes, avec un parent présent au début, sur plusieurs jours", "Confier l'enfant toute la journée dès le premier jour", "Demander au parent de ne pas rester pour que l'enfant s'habitue vite",
    "Le parent est la base de sécurité : sa présence au début permet à l'enfant de créer des liens avec les professionnels sans rupture brutale.");
  Q('ped', 'x', "Le matin, au moment de la séparation, le plus aidant est de…",
    "Dire au revoir clairement, même si l'enfant pleure, puis partir", "Partir discrètement pendant qu'il joue", "Rester une heure pour être sûr qu'il aille bien",
    "Partir en cachette brise la confiance. Un rituel court (câlin, mot doux, signe à la fenêtre) rassure et se retrouve chaque jour.");
  Q('ped', 'x', "Que développe surtout le jeu libre ?",
    "Créativité, autonomie, langage et résolution de problèmes", "Rien, c'est du temps perdu", "Uniquement la motricité",
    "Quand l'enfant choisit son jeu, il expérimente, imagine et apprend à surmonter les difficultés. L'adulte est présent, il observe et sécurise.");
  Q('ped', 'e', "Observer un enfant sans intervenir sert à…",
    "Comprendre ses intérêts et ses besoins pour adapter l'accueil", "Le surveiller pour le sanctionner", "Noter ce qu'il fait de mal",
    "L'observation bienveillante nourrit les transmissions, le projet pédagogique et les choix d'aménagement.");
  Q('ped', 'x', "Quel type de jouet favorise le plus l'imagination ?",
    "Des objets simples et ouverts (cubes, tissus, boîtes, bois)", "Des jouets électroniques qui chantent et clignotent", "Des jouets très réalistes qui n'ont qu'un seul usage",
    "Plus le jouet est simple, plus l'enfant invente. Le tissu devient cape, couverture, cabane…");
  Q('ped', 'x', "Lire un livre à un bébé de 6 mois est…",
    "Utile : langage, attention et lien affectif dès les premiers mois", "Inutile avant 3 ans", "Utile seulement s'il reste immobile",
    "Même s'il mord le livre ! Lire tous les jours, avec des mots simples et des images, prépare le langage.");
  Q('ped', 'p', "Parler sa langue d'origine à la maison avec son enfant, c'est…",
    "Une richesse : l'enfant entend un langage riche et apprendra plus facilement d'autres langues", "À éviter pour ne pas retarder le français", "Réservé aux vacances",
    "On parle à l'enfant dans la langue où l'on est le plus à l'aise. Le français s'apprend aussi à la crèche et à l'école.");
  Q('ped', 'e', "Les transmissions du soir aux parents doivent surtout…",
    "Raconter la journée de façon factuelle et positive, y compris les difficultés, sans jugement", "Lister les bêtises de la journée", "Se limiter à « tout s'est bien passé »",
    "Un repas, une sieste, un jeu, un moment de joie : des informations concrètes aident les parents à retrouver leur enfant.");
  Q('ped', 'x', "Un enfant refuse de prêter son jouet. L'adulte…",
    "Reconnaît son besoin et propose d'attendre son tour ou un autre jeu", "Oblige à prêter tout de suite", "Retire le jouet à tout le monde",
    "Avant 3 ans, le partage n'est pas acquis : l'enfant construit d'abord la notion de « à moi ». On l'aide à patienter, sans forcer.");
  Q('ped', 'x', "Un enfant de 2 ans ne veut pas ranger. Le mieux est de…",
    "Rendre le rangement concret et ludique, et ranger avec lui", "Lui demander de ranger seul tous les jouets", "Le punir s'il ne range pas",
    "Une consigne simple (« les voitures dans la caisse ») et un adulte qui participe font toute la différence.");
  Q('ped', 'e', "Un espace bien aménagé pour des tout-petits comprend…",
    "Un espace sûr, des jouets accessibles à hauteur d'enfant, des coins calmes et des zones de mouvement", "Tous les jouets rangés en hauteur", "Un seul grand espace sans zones",
    "Des repères clairs et du matériel accessible favorisent l'autonomie : l'enfant choisit, sort et range.");

  /* ───────── 🧼 Protocoles ───────── */
  Q('pro', 'x', "Un nourrisson doit être couché pour dormir…",
    "Sur le dos, sur un matelas ferme, sans oreiller ni couette", "Sur le ventre, c'est plus sécurisant", "Sur le côté, calé par des coussins",
    "Sur le dos, dans une gigoteuse, sans tour de lit ni peluche : ces règles réduisent le risque de mort inattendue du nourrisson.");
  Q('pro', 'x', "Quelle est la température idéale d'une chambre de bébé ?",
    "Environ 18-20 °C", "24-26 °C, bien chauffée", "15 °C pour l'endurcir",
    "Un bébé trop couvert ou dans une pièce trop chaude est exposé aux risques. On l'habille légèrement et on aère la chambre.");
  Q('pro', 'x', "Un enfant a de la fièvre. Premier réflexe ?",
    "Le découvrir un peu, le faire boire et surveiller sa tolérance", "Le couvrir pour le faire transpirer", "Le plonger dans un bain froid",
    "On regarde surtout l'état général. Avant 3 mois, une température de 38 °C ou plus impose un avis médical sans attendre. Tout médicament suit l'ordonnance ou le protocole médical.");
  Q('pro', 'x', "À partir de quelle température rectale parle-t-on de fièvre ?",
    "38 °C et plus", "37,2 °C", "39,5 °C",
    "À partir de 38 °C. Le thermomètre sert de repère, mais l'état général de l'enfant (agitation, abattement, douleur) compte autant.");
  Q('pro', 'x', "Un bébé de moins d'un an s'étouffe et ne peut plus tousser ni respirer. Quel geste ?",
    "5 claques dans le dos puis 5 compressions du thorax, en alternance, et appeler le 15", "Lui mettre les doigts dans la bouche", "Lui donner de l'eau pour faire passer",
    "Bébé à plat ventre sur l'avant-bras, tête plus basse que le thorax : 5 claques entre les omoplates. Si ça ne passe pas, retourner et faire 5 compressions du milieu du thorax. Appeler ou faire appeler le 15.");
  Q('pro', 'x', "Quel numéro d'urgence européen est gratuit pour toute détresse ?",
    "Le 112", "Le 17", "Le 119",
    "Le 112 fonctionne partout en Europe. Le 15 (SAMU) pour une urgence médicale, le 18 pour les pompiers, le 119 pour un enfant en danger.");
  Q('pro', 'x', "Brûlure légère par eau chaude. On…",
    "Refroidit tout de suite sous l'eau du robinet (ni glacée) au moins 10 minutes", "Applique du beurre ou du dentifrice", "Pose de la glace directement sur la peau",
    "Refroidir vite limite la profondeur de la brûlure. On ne retire pas un vêtement collé à la peau et on demande un avis médical si la brûlure est étendue, au visage ou sur un bébé.");
  Q('pro', 'x', "Combien de temps faut-il se laver les mains avec du savon ?",
    "Environ 30 secondes, puis séchage avec un papier à usage unique", "5 secondes suffisent", "Le savon n'est pas nécessaire",
    "Paumes, dos des mains, entre les doigts, ongles, poignets. C'est le geste n°1 contre la transmission des microbes.");
  Q('pro', 'e', "Au change d'un enfant, quand se laver les mains ?",
    "Avant et après chaque change", "Seulement après", "Seulement si la couche est très souillée",
    "Avant pour ne pas apporter de microbes à l'enfant, après pour ne pas en emporter ailleurs.");
  Q('pro', 'e', "Un parent laisse un médicament sans ordonnance. Que faire ?",
    "Ne pas le donner : il faut une ordonnance (ou un protocole médical) et une autorisation écrite", "Le donner, le parent est responsable", "Le donner si l'enfant a l'air mal",
    "Seuls les traitements prescrits (ou prévus par le protocole médical de la structure) sont administrés, avec l'accord écrit des parents.");
  Q('pro', 'e', "Un enfant a un PAI pour une allergie alimentaire. Au goûter…",
    "On applique strictement le PAI : aliments autorisés et trousse d'urgence accessible", "On adapte selon notre appréciation du risque", "On lui laisse goûter un tout petit morceau",
    "Le Projet d'accueil individualisé est écrit avec le médecin et la famille. Il s'applique à la lettre, et toute l'équipe sait où est la trousse.");
  Q('pro', 'x', "Après une chute sur la tête, quels signes imposent d'appeler le 15 ?",
    "Vomissements répétés, somnolence inhabituelle, perte de connaissance, saignement important", "Un pleur de 30 secondes", "Une petite bosse sans autre signe",
    "Même sans signe alarmant, on surveille l'enfant pendant 24 heures et on prévient les parents.");
  Q('pro', 'e', "Sur la table à langer, la règle absolue est de…",
    "Ne jamais lâcher l'enfant : une main toujours sur lui", "Le laisser quelques secondes pour attraper un body", "Compter sur la ceinture de sécurité",
    "Les chutes se produisent en un instant. On prépare tout ce qu'il faut avant de poser l'enfant.");
  Q('pro', 'e', "Suspicion de maltraitance sur un enfant : que faire ?",
    "Noter les faits objectifs, alerter la direction et transmettre une information préoccupante ; le 119 peut conseiller", "Interroger longuement l'enfant", "Attendre d'avoir une preuve avant d'en parler",
    "On ne mène pas d'enquête et on n'attend pas la certitude. Les faits sont notés tels qu'ils sont constatés, sans interprétation, et partagés avec la direction.");
  Q('pro', 'x', "Les pleurs d'un bébé sont inconsolables et l'adulte est à bout. Que faire ?",
    "Poser le bébé en sécurité sur le dos, sortir quelques minutes, respirer et appeler un relais", "Le secouer doucement pour le calmer", "Le laisser pleurer sans jamais revenir",
    "Secouer un bébé peut provoquer des lésions cérébrales graves et irréversibles. Demander de l'aide n'est pas un échec, c'est protéger l'enfant.");
  Q('pro', 'x', "Un enfant a des poux. Faut-il l'écarter de la crèche ?",
    "Pas d'éviction obligatoire, mais un traitement dès que possible", "Oui, 15 jours", "Oui, il faut lui raser la tête",
    "On prévient l'équipe et on traite sans attendre : lotion adaptée, vérification des proches, lavage des bonnets et du linge.");
  Q('pro', 'x', "Un enfant a avalé un produit ménager. Que faire ?",
    "Appeler le 15 ou le centre antipoison, ne pas le faire vomir, garder l'emballage", "Lui faire boire du lait et le faire vomir", "Attendre de voir si ça passe",
    "Faire vomir aggrave souvent les brûlures. On garde l'emballage pour informer le médecin et on suit ses consignes.");
  Q('pro', 'x', "Un biberon préparé est resté à moitié plein après le repas. On…",
    "Jette ce qu'il reste", "Le garde au frais pour le prochain repas", "Le réchauffe plus fort pour tuer les microbes",
    "Dès que l'enfant a bu, sa salive apporte des bactéries. Un lait reconstitué se consomme dans l'heure qui suit sa préparation.");
  Q('pro', 'x', "Le miel avant un an, c'est…",
    "Interdit : risque de botulisme", "Autorisé après 6 mois", "Sans danger",
    "Il peut contenir des spores responsables du botulisme du nourrisson. À éviter aussi dans les gâteaux ou en tétine.");
  Q('pro', 'e', "À quelle température doit être conservé un aliment au réfrigérateur ?",
    "Entre 0 et 4 °C", "Entre 8 et 10 °C", "À −5 °C",
    "La chaîne du froid est un point central de la maîtrise sanitaire. Les températures se relèvent chaque jour, avec une action en cas d'écart.");
  Q('pro', 'x', "Soleil et bébé de moins d'un an…",
    "Pas d'exposition directe : ombre, vêtements couvrants, chapeau", "Un peu de bronzage aide la vitamine D", "Une crème d'indice 5 suffit",
    "La peau des bébés est fine et très sensible. On évite les heures les plus chaudes et on hydrate régulièrement.");

  /* ───────── 👨‍👩‍👧 Familles et partenariat ───────── */
  Q('par', 'p', "Dans la voiture, jusqu'à quel âge le siège bébé doit-il rester dos à la route ?",
    "Au moins 15 mois, et idéalement le plus longtemps possible", "Dès 6 mois, face à la route", "Seulement jusqu'à 3 mois",
    "Dos à la route, la tête et la nuque de l'enfant sont mieux protégées en cas de choc. C'est la norme i-Size.");
  Q('par', 'p', "Au bain, un bébé peut rester seul quelques secondes si l'eau est basse ?",
    "Jamais : quelques centimètres d'eau suffisent pour une noyade", "Oui, si l'eau est basse", "Oui, s'il tient assis",
    "Un bébé qui glisse ne crie pas. On prépare tout avant le bain, et on le sort avec soi s'il faut répondre au téléphone ou à la porte.");
  Q('par', 'p', "Mon enfant de 2 ans refuse un légume. Que faire ?",
    "Le proposer à nouveau, sans forcer ni punir (jusqu'à 8-10 fois)", "Le forcer à finir son assiette", "Arrêter définitivement après un refus",
    "La peur des aliments nouveaux est normale à cet âge. Voir, sentir, toucher, goûter… le goût vient par la répétition et le plaisir de manger ensemble.");
  Q('par', 'p', "Le brossage des dents d'un tout-petit…",
    "Dès la première dent, 2 fois par jour, avec une petite quantité de dentifrice fluoré (grain de riz avant 3 ans)", "Seulement à partir de 6 ans", "Sans dentifrice jusqu'à 10 ans",
    "Les dents de lait comptent : elles guident les dents définitives. On brosse pour l'enfant avant de le laisser faire seul, et on crache sans rincer.");
  Q('par', 'p', "Comment savoir si un jouet est dangereux pour un enfant de moins de 3 ans ?",
    "S'il passe dans un rouleau de papier toilette, il est trop petit : risque d'étouffement", "S'il fait plus de 10 cm", "On ne peut pas le savoir",
    "Les petites pièces, piles bouton et aimants sont particulièrement dangereux. On vérifie aussi l'âge indiqué sur l'emballage.");
  Q('par', 'p', "Que favorise l'endormissement le soir ?",
    "Un rituel calme et régulier (bain, histoire, câlin) sans écran", "Une série sur la tablette pour l'occuper", "Des jeux agités juste avant le lit",
    "Des gestes toujours dans le même ordre rassurent l'enfant, qui anticipe le moment du coucher.");
  Q('par', 'p', "Mon enfant a de la fièvre le matin : je lui donne un antipyrétique et le dépose à la crèche sans le dire ?",
    "Non : j'informe l'équipe, car la fièvre masquée peut cacher une maladie", "Oui, comme ça il tiendra la journée", "Oui, mais je ne dis rien pour ne pas être refusé",
    "Les professionnels doivent savoir ce que l'enfant a reçu et pourquoi. Un enfant malade se repose mieux à la maison.");
  Q('par', 'p', "Mon enfant revient grognon et fatigué à 17 h. C'est…",
    "Normal : la collectivité est intense, il a besoin de retrouvailles calmes", "La preuve que la crèche est trop dure", "Un caprice à corriger",
    "Il garde ses émotions toute la journée et les lâche quand il retrouve ses parents : un câlin, un goûter, un temps de calme suffisent souvent.");
  Q('par', 'p', "Cordon de tétine ou collier au cou d'un bébé…",
    "À éviter pendant le sommeil et le jeu : risque de strangulation", "Sans danger si surveillé", "Obligatoire pour les poussées dentaires",
    "Le cordon d'une tétine ne doit pas dépasser 22 cm, et rien autour du cou au lit.");
  Q('par', 'p', "Quand parler d'une inquiétude avec l'équipe de la crèche ?",
    "Dès qu'elle apparaît : le dialogue parents-professionnels est la clé", "À la fin de l'année", "Jamais, pour ne pas déranger",
    "Les professionnels connaissent bien votre enfant. Un rendez-vous peut être demandé à tout moment.");
  Q('par', 'e', "Une maman vous demande comment va un autre enfant de la section. Que répondez-vous ?",
    "Que vous ne donnez pas d'information sur les autres familles, et qu'elle peut en parler avec la direction ou l'autre parent", "Que tout va bien pour lui, vous le connaissez", "Que vous allez lui raconter ce qui s'est passé",
    "La discrétion professionnelle protège toutes les familles, même quand l'information semble banale.");
  Q('par', 'e', "Un parent vous confie une situation personnelle difficile. Votre posture ?",
    "Écouter avec bienveillance, rester dans votre rôle et orienter vers la direction ou les services adaptés", "Donner des conseils personnels", "En parler en salle de pause pour avoir l'avis de l'équipe",
    "Écouter ne veut pas dire résoudre. On redit ce qui est confidentiel et on relaie à la direction ce qui concerne l'enfant.");
  Q('par', 'e', "Un parent refuse que son enfant soit pris en photo. Vous…",
    "Respectez le choix indiqué dans l'autorisation de droit à l'image", "Prenez la photo en cachant le visage plus tard", "La prenez quand même pour le projet de la crèche",
    "Sans autorisation, pas de photo ni de publication. Les images d'enfants relèvent de la protection des données.");
  Q('par', 'e', "Un parent est régulièrement en retard le soir. Que faire ?",
    "En parler tôt, sans jugement, rappeler le cadre et chercher une solution ensemble", "Attendre qu'il s'excuse", "Le critiquer devant les autres parents",
    "Un retard répété pèse sur l'équipe et sur l'enfant. Une discussion calme évite que la situation s'installe.");
  Q('par', 'x', "Un parent est en colère à son arrivée. Quelle attitude aide à apaiser la situation ?",
    "Écouter jusqu'au bout, reformuler, proposer un temps pour en reparler au calme", "Se justifier tout de suite point par point", "Répondre sur le même ton",
    "Reformuler (« si je comprends bien… ») montre qu'on a entendu. On règle le fond à tête reposée, hors de la vue des enfants.");

  /* ───────── 💬 Partage ───────── */
  D('x', "Un parent dit au revoir en dix secondes et file pendant que l'enfant pleure. Comment l'aider, sans le juger ?",
    "Pistes : proposer un rituel court et identique chaque jour ; rassurer sur le fait que les pleurs passent vite ; donner une nouvelle dans la journée ; valoriser le parent.");
  D('x', "Quel rituel de retrouvailles le soir facilite le passage de la crèche à la maison ?",
    "Pistes : un câlin avant de partir, laisser l'enfant raconter ou montrer sa journée, éviter de commencer par les courses, garder le doudou.");
  D('e', "Un enfant mord régulièrement. Qui prévenir, que dire aux parents des deux enfants et quelles actions mettre en place ?",
    "Pistes : noter quand et où ça arrive, repérer les déclencheurs, protéger les autres, parler aux deux familles avec les mêmes mots, proposer un geste ou un mot à l'enfant, valoriser les réussites.");
  D('p', "Quelle est votre plus grande difficulté du moment avec votre enfant (repas, sommeil, colères…) ? Partagez une astuce qui marche chez vous.",
    "Pistes : on échange sans juger. L'important n'est pas la solution parfaite mais ce qui convient à votre enfant et à votre famille.");
  D('x', "Citez trois gestes du quotidien qui montrent à un enfant qu'on le respecte.",
    "Pistes : annoncer ce qu'on va faire avant de le toucher, se mettre à sa hauteur, lui laisser le temps de répondre, le laisser choisir, s'excuser quand on se trompe.");
  D('e', "Un parent critique une collègue devant d'autres parents. Comment réagissez-vous ?",
    "Pistes : rester calme, ne pas se justifier sur place, proposer un échange en privé, prévenir la direction, soutenir l'équipe sans minimiser le ressenti du parent.");
  D('x', "Quel jeu simple et gratuit pourriez-vous proposer à un enfant de 18 mois avec ce que vous avez sous la main ?",
    "Pistes : boîtes à remplir et vider, tissus à cacher, ballon en chaussettes, instruments en casseroles, comptines avec les doigts.");
  D('x', "Racontez un moment où vous avez dû lâcher prise face à une colère. Qu'est-ce qui vous a aidé ?",
    "Pistes : respirer, sortir du conflit un instant, demander du soutien, se rappeler que l'enfant n'est pas contre vous mais dépassé.");
  D('e', "Une famille parle peu français. Comment s'assurer qu'elle a compris un protocole (médicament, urgence, allergie) ?",
    "Pistes : phrases courtes, pictogrammes, interprète ou proche présent, demander de reformuler, remettre un document traduit si possible.");
  D('p', "Comment préparez-vous votre enfant à un changement (crèche, école, naissance, déménagement) ?",
    "Pistes : en parler avec des mots simples, lire des livres sur le sujet, visiter, garder des repères, prévoir du temps de qualité.");
  D('e', "Un enfant refuse la sieste. Quelles alternatives respectueuses de son rythme proposez-vous ?",
    "Pistes : un coin calme avec livres, accompagner l'endormissement, proposer un temps de repos sans obligation de dormir, échanger avec la famille sur les besoins.");
  D('x', "Dire « tu as bien essayé » plutôt que « tu es le meilleur » : qu'est-ce que cela change pour l'enfant ?",
    "Pistes : on valorise l'effort et pas la comparaison, l'enfant ose recommencer et accepte l'échec comme une étape de l'apprentissage.");

  window.KK_JEU_CARTES = CARTES;

  /* Cartes « Chance » */
  window.KK_JEU_CHANCE = [
    { t: "Un grand sourire d'enfant te donne de l'énergie !", e: "Avance de 2 cases.", move: 2 },
    { t: "Une chanson commune détend tout le monde.", e: "Avance de 3 cases.", move: 3 },
    { t: "Le doudou est introuvable…", e: "Recule de 2 cases.", move: -2 },
    { t: "Embouteillage devant le portillon !", e: "Passe ton prochain tour.", passe: true },
    { t: "Journée parfaite, tout s'enchaîne.", e: "Rejoue !", rejoue: true },
    { t: "Un câlin réconfortant.", e: "Gagne une feuille d'eucalyptus 🌿.", feuille: 1 },
    { t: "Un oubli de dernière minute.", e: "Recule d'une case.", move: -1 },
    { t: "Un merci spontané d'un parent ou d'un collègue.", e: "Gagne une feuille 🌿 et avance d'une case.", feuille: 1, move: 1 }
  ];
})();
