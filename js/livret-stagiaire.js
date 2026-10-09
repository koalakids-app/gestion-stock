/* Texte du livret d'accueil du stagiaire, partagé entre documents.html (saisie
   et PDF) et stagiaire.html (lecture et signature par le stagiaire) : une seule
   source, donc le texte signé est celui que la crèche a préparé. */
const LV_GESTIONNAIRES='M. Andy Janin et Cyril Gabriel';
const LV_EQUIPE_DEFAUT={
  'Ollioules':'L’équipe est composée d’un directeur technique (CAP AEPE de formation), de 3 professionnels de la petite enfance (Auxiliaire de Puériculture ou CAP Accompagnante Educative Petite Enfance de formation) et d’une alternante en formation d’éducatrice de jeunes enfants.'
};
var LV_CHAMPS=['lv_texte','lv_creche','lv_adresse','lv_capacite','lv_gestionnaires','lv_ages','lv_horaires','lv_accueil','lv_equipe',
  'sal_nom','lv_formation','lv_periode','lv_tuteur','lv_lieu','lv_date'];
function lvSectionsBase(g){
  const nom=g('lv_creche')?('Koalakids '+g('lv_creche')):'Koala Kids';
  const cap=g('lv_capacite');
  const S=[];
  S.push({t:'',p:['Bonjour, vous allez effectuer un stage à la micro-crèche « '+nom+' ». Ce livret d’accueil contient quelques informations importantes afin que ce stage vous apporte entière satisfaction et soit un réel temps d’échanges entre vous, le personnel et les enfants.']});
  S.push({t:'Présentation de la structure',p:[
    'La micro-crèche est gérée par '+(g('lv_gestionnaires')||LV_GESTIONNAIRES)+'.',
    'Nous accueillons des enfants âgés '+(g('lv_ages')||'de 2 mois 1/2 à 4 ans (6 ans pour les enfants porteurs de handicap)')+'. '
      +'La capacité d’accueil est de '+(cap||'12')+' places. '
      +(g('lv_horaires')||'Les horaires de la structure sont de 7h à 19h')+' '+(g('lv_accueil')||'avec un accueil de l’enfant de 7h30 à 18h30 (selon les contrats)')+'.',
    g('lv_equipe')||''
  ].filter(Boolean)});
  S.push({t:'Lieux de vie',p:['La micro-crèche offre un lieu de vie sécurisant qui favorise l’épanouissement, l’autonomie et les apprentissages de chaque enfant.']});
  S.push({t:'Objectifs pédagogiques de la structure',li:[
    'Répondre aux besoins de sécurité physique et affective de l’enfant.',
    'Développer l’autonomie et l’indépendance.',
    'Favoriser la socialisation.',
    'Assurer la continuité du projet familial en proposant un accueil individualisé.',
    'Proposer des activités d’éveil quotidiennes afin de favoriser le développement des capacités de l’enfant.'],
    p:['Le projet pédagogique, sur le concept de la libre exploration éducative, s’appuie sur plusieurs pédagogies actives, en particulier l’approche Montessori (l’enfant acteur et auteur de son jeu), l’approche d’Emmi Pickler (l’importance de la motricité libre chez l’enfant). Au-delà de ça, c’est le regard que vous allez porter sur l’enfant qui va déterminer la qualité de votre accompagnement éducatif.']});
  S.push({t:'L’accueil',p:['Dès votre arrivée, nous informerons les familles de votre présence grâce à votre photo accompagnée de votre prénom, de l’intitulé de la formation pour laquelle vous réalisez ce stage et de la durée de celui-ci. Cependant, n’hésitez pas à vous présenter vous aussi aux parents.']});
  S.push({t:'Horaires',p:['Vos horaires ont été définis avant le début de votre stage dans le respect de ce qui est prévu par l’école ou l’organisme de formation et des impératifs de fonctionnement de notre structure. Un changement reste toutefois possible en accord avec votre référente et uniquement de manière exceptionnelle.',
    'Il vous sera demandé d’être ponctuel et de nous informer au plus vite de tout retard ou absence et de nous transmettre un justificatif (certificat médical etc.).']});
  S.push({t:'Tenue',p:['Vous devez avoir une tenue propre et adaptée pour être à l’aise auprès des enfants. Vous serez amené à faire des activités salissantes avec les enfants (peinture, pâte à modeler etc.) ainsi nous vous conseillons de prévoir une tenue de rechange.'],
    li:['Prévoyez une paire de chaussures pour l’intérieur.','Évitez les bijoux (pas de bague).','Vos cheveux seront attachés et vos ongles devront être assez courts.',
        'Les téléphones portables restent au vestiaire (et en mode silencieux). Vous avez la possibilité de donner le numéro de la crèche si vous avez besoin d’être joint.']});
  S.push({t:'Hygiène et sécurité',p:['Vous devez respecter la réglementation en termes d’hygiène et de sécurité. La phase d’observation en début de stage vous permettra de prendre connaissance des protocoles élaborés par la structure.',
    'Vous veillerez à ne pas mettre les enfants en danger, tant physiquement que psychiquement.',
    'Nous vous rappelons que votre statut de stagiaire ne vous permet pas de rester seul(e) avec les enfants.']});
  S.push({t:'Tabac',p:['Il est strictement interdit de fumer dans l’enceinte de la structure et à l’extérieur du bâtiment, en particulier devant la crèche.']});
  S.push({t:'Repas',p:['Vous disposez d’une heure de pause pour votre déjeuner. Vous devez apporter votre repas. Un frigo, un four micro-ondes ainsi que des couverts sont à votre disposition dans la cuisine. Le repas se prend en salle de pause. Il vous appartient de laisser cette salle propre après votre pause.']});
  S.push({t:'Déroulement du stage',p:[
    'Le premier jour, vous serez accueilli par votre référent(e) ou un(e) de ses collègues qui vous expliquera le fonctionnement de la micro-crèche. Rapidement, nous vous demanderons de présenter vos objectifs de stage à l’ensemble du personnel afin que toute l’équipe puisse vous accompagner au mieux.',
    'Votre stage commencera par quelques jours d’observation pendant lesquels vous allez progressivement faire connaissance avec le personnel, les enfants et leurs familles avant de pouvoir participer plus activement aux activités quotidiennes. Cette observation doit être active :'],
    li:['Vous devez avoir un comportement agréable et vous mettre à la hauteur des enfants. Répondez à leurs sollicitations sans les brusquer et en adoptant une attitude positive et un langage adapté.',
        'Vous observerez et repèrerez les différents moments clés de la journée ainsi que la dynamique de l’équipe.'],
    p2:['Votre référente décidera, après concertation avec l’équipe et selon votre formation, des modalités de votre participation aux différents soins (repas, changes, coucher etc.), cela inclut le portage des enfants.',
    'Durant votre stage, n’hésitez pas à poser des questions. D’autre part, vos initiatives seront les bienvenues mais toujours en accord avec l’équipe.',
    'Un bilan de mi-stage sera effectué à votre initiative ou à celle de votre référente. C’est un moment d’échange important à ce stade de votre formation. N’hésitez pas à nous faire part de vos demandes et de vos éventuelles suggestions quant à notre objectif permanent d’améliorer l’accueil des enfants et de leurs familles.']});
  S.push({t:'Discrétion professionnelle',p:['Tous les stagiaires sont soumis à une obligation de discrétion professionnelle. Vous ne devez, en aucun cas, divulguer des informations concernant la structure, les enfants accueillis ou leurs familles. Vous ne pourrez accéder seul(e) aux dossiers personnels des enfants.']});
  S.push({t:'Une journée type à la micro-crèche '+nom,p:['Il n’y a pas de journée type car chaque jour, l’enfant vit des expériences différentes en fonction de ce que les adultes lui apportent au quotidien. Chaque enfant est accueilli et accompagné en fonction de ses besoins propres. Vous retrouverez les temps habituels que tout enfant vit, comme le jeu, le repas, les soins corporels ou le sommeil. Mais notre accompagnement se déroule tout au long de la journée, dans chaque acte de la vie quotidienne en réponse à chaque besoin de chaque enfant, au cas par cas. Le fil conducteur est le jeu et la mise en place d’univers ludiques dans lesquels l’enfant est acteur et auteur de son jeu.']});
  S.push({t:'Rapport de stage',p:['Vous aurez sans doute un rapport de stage à rédiger et aurez besoin de différentes informations et/ou documents. N’hésitez pas à nous solliciter tout au long de votre stage. D’autre part, vous ne devez jamais mentionner les noms/prénoms des enfants accueillis et le partage de photos des enfants n’est pas autorisé.']});
  S.push({t:'Un outil pour vous aider à valider vos compétences',p:['Le directeur technique de la micro-crèche remplira votre feuille de bilan de stage après concertation avec l’équipe et en s’appuyant sur votre feuille de suivi/validation des compétences (ci-jointe).',
    'N’oubliez pas, un bon stage dépend uniquement de vous et du sens que vous donnez à votre projet professionnel. Alors à vous de jouer !',
    'Bon stage parmi nous !']});
  return S;
}

/* Une section = {t, items:[{k:'p'|'li', t}]} : forme unique pour l'affichage, le
   PDF et l'éditeur. */
function lvItems(S){
  return S.map(x=>({t:x.t||'',items:[].concat(
    (x.p||[]).map(t=>({k:'p',t})),(x.li||[]).map(t=>({k:'li',t})),(x.p2||[]).map(t=>({k:'p',t})))}));
}
/* Texte modifié à la main pour CE livret (JSON stocké dans donnees.lv_texte) ;
   à défaut, le texte type rempli avec les données de la crèche. */
function lvSections(g,texteJson){
  if(texteJson){
    try{
      const T=typeof texteJson==='string'?JSON.parse(texteJson):texteJson;
      if(Array.isArray(T)&&T.length)return T.map(x=>({t:String(x.t||''),items:(x.items||[]).map(i=>({k:i.k==='li'?'li':'p',t:String(i.t||'')}))}));
    }catch(e){}
  }
  return lvItems(lvSectionsBase(g));
}
function lvSectionsEnTexte(items){return items.map(i=>(i.k==='li'?'- ':'')+i.t).join('\n');}
function lvTexteEnItems(txt){
  return String(txt||'').split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>/^[-•]\s+/.test(l)?{k:'li',t:l.replace(/^[-•]\s+/,'')}:{k:'p',t:l});
}
