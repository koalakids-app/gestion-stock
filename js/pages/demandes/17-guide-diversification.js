/* ════════════════════════════════════════════════════════════════════════════
   GUIDE DE LA DIVERSIFICATION ALIMENTAIRE (MCM › Menus › « Guide diversification »)
   Synthèse du « Petit guide de la diversification alimentaire » (Santé publique
   France / mangerbouger.fr, avis Anses et HCSP), par tranche d'âge. Texte en dur :
   pour le mettre à jour, modifier GD_TRANCHES. Lecture seule, accessible à tous.
   ════════════════════════════════════════════════════════════════════════════ */
const GD_TRANCHES=[
  {id:'principes',titre:'Principes à tout âge',icone:'ti-heart-handshake',points:[
    'Chaque nouveauté est une étape : observer l’enfant (surpris ? intéressé ?), le rassurer, le laisser expérimenter à son rythme.',
    '**Ne pas forcer** : reproposer quelques jours plus tard l’aliment refusé, souvent plusieurs fois (parfois jusqu’à 10). Distinguer le refus d’un aliment nouveau d’un véritable dégoût (on ne force jamais).',
    'Proposer sans jamais forcer à finir l’assiette ou le biberon ; l’appétit varie d’un jour à l’autre. Pas de nourriture en dehors des repas « pour compenser ».',
    '**Signes de faim** : pleure, s’agite, ouvre la bouche à l’approche du sein, du biberon ou de la cuillère. **Signes de rassasiement** : s’endort, ralentit, tourne la tête, regarde ailleurs, veut quitter sa chaise.',
    '**Pas d’écran** pendant le repas : l’enfant mange moins bien et sent moins quand il est rassasié.',
    'La seule boisson indispensable est **l’eau** (du robinet convient). Pas de jus de fruits (même sans sucre ajouté), de boissons aux fruits ni de sodas, même light. Eau à la tasse ou au verre dès 6 mois.',
    '**Pas de sel** avant 3 ans (fait maison comme petits pots) ; relever avec herbes et aromates. Yaourts et fromages blancs sucrés avec des fruits écrasés plutôt qu’avec du sucre.',
    '**Matières grasses indispensables** avant 3 ans : ajouter crues aux préparations de l’huile (colza, noix, olive en variant) ou de temps en temps un peu de beurre.',
    'Privilégier le fait maison, les produits de saison, les féculents complets, les légumes secs. Éviter les produits ultra-transformés (chips, nuggets, pizzas, sodas…).',
    'Petits pots du commerce : pratiques mais moins variés ; **ne pas les réchauffer dans leur barquette plastique** (transvaser).',
    'L’alimentation végétalienne ou vegan n’est pas adaptée aux enfants (risque de carences). Pas de compléments alimentaires sans prescription médicale.',
    'Hygiène : surfaces, ustensiles et frigo nettoyés régulièrement ; **4 °C maximum** dans la zone la plus froide du réfrigérateur.',
    'Écouter les parents : leurs habitudes alimentaires doivent être respectées par les personnes qui gardent l’enfant (crèche, assistante maternelle).'
  ]},
  {id:'0-4',titre:'De la naissance à 4 mois : du lait, rien que du lait',icone:'ti-baby-bottle',points:[
    'Lait maternel ou préparation pour nourrissons (« lait 1er âge ») uniquement, sans rien d’autre.',
    'Passage au « lait 2e âge » dès que l’enfant prend au moins un repas complet sans lait par jour.',
    'Les boissons végétales (« lait » d’amande…) ne répondent pas aux besoins des moins de 1 an. Le soja et tous les produits à base de soja sont déconseillés avant 3 ans.'
  ]},
  {id:'4-6',titre:'De 4 à 6 mois : on commence à goûter à tout',icone:'ti-salad',points:[
    'Début possible à partir de 4 mois (avis médical si prématuré) ; **après 6 mois révolus**, le lait seul ne suffit plus.',
    '**Tous les groupes d’aliments** peuvent être introduits, y compris les allergènes (œuf, arachide, fruits à coque en poudre, gluten) : plus tôt ils sont goûtés, plus la tolérance se développe. **Avis du médecin ou de la PMI s’il y a des allergies dans la famille.** Pas d’ordre particulier à respecter.',
    'Donner chaque **nouvel aliment séparément**, puis mélanger une fois qu’il est accepté seul.',
    'Quantités : quelques cuillérées au début, puis davantage selon l’appétit, suivies du lait à volonté.',
    '**À la cuillère** : purées et compotes bien lisses (soupes mixées possibles à la tasse). Présenter la cuillère **par en dessous** (du menton vers la bouche). Laisser l’enfant toucher avec les doigts.',
    'Légumes secs (lentilles, pois chiches, haricots) en purée très lisse dès 4/6 mois ; fruits à coque **uniquement en poudre** (½ cuillère à café, non salés).',
    'Produits laitiers : yaourt, petits suisses, fromage blanc **non sucrés**, un peu de fromage râpé fondu dans les purées. **Pas de produits ½ écrémés, écrémés ou 0 % MG** (trop pauvres en matières grasses). Pas besoin de produits « spécial bébé ».',
    '**Pas de lait cru ni de fromage au lait cru.** Viande, poisson et œufs **toujours bien cuits** (pas de mousse au chocolat ni de mayonnaise maison). Varier les espèces de poisson : certains sont à éviter ou limiter jusqu’à 3 ans (voir le site de l’Anses).',
    'Purée : légumes, légumes secs, pommes de terre cuits à l’eau ou à la vapeur sans sel ; volaille, viande, poisson bien cuits ; mixer avec un peu d’eau et de matière grasse.',
    'Conservation : purée **24 h maximum** au réfrigérateur en boîte hermétique, ou **2 mois maximum** congelée (bac à glaçons puis poche datée).',
    'Dessert ou goûter : fruit de saison épluché, cuit avec un peu d’eau puis mixé, **sans sucre ajouté** ; puis fruits tendres crus ou cuits écrasés à la fourchette.'
  ]},
  {id:'6-8',titre:'À partir de 6/8 mois : on commence à mâcher',icone:'ti-mood-kid',points:[
    'Proposer progressivement de **nouvelles textures** : une seule nouvelle texture par repas ; les morceaux varient d’un petit pot à l’autre.',
    '**6/8 mois** : aliments hachés ou écrasés grossièrement à la fourchette ; ajout de pâtes alphabet, semoule, riz bien cuit, petits morceaux de volaille tendre ou de poisson très cuit, œuf dur haché.',
    '**8 mois** : morceaux très mous qui s’écrasent entre la langue et le palais (ex. banane).',
    '**10 mois** : morceaux à croquer ou à mâcher avec les dents (aliments cuits, fruits crus, crudités en petits morceaux).',
    'Laisser l’enfant **prendre des morceaux tendres avec les doigts** (il les malaxe, les suçote, les mâchouille). Bien assis, sous le regard de l’adulte pendant tout le repas.',
    '**Prêt pour de nouvelles textures** : avale les purées lisses et épaisses, tient sa tête et son dos droits, fait des mouvements de mâchonnement, tient un aliment et le porte à sa bouche, essaie de prendre dans l’assiette de l’adulte.',
    'Un quignon de pain de temps en temps stimule la mastication ; au début, le retirer s’il est trop imbibé de salive.',
    '**Diversification menée par l’enfant (DME)** : morceaux bien cuits proposés d’emblée, possible dès 6 mois environ si l’enfant se tient bien assis et porte les aliments à sa bouche ; découverte accompagnée, aliments très variés, vigilance sur la déglutition.',
    '**Sécurité** : pas d’aliments petits, durs et ronds (type cacahuète) avant 5 ans. Couper les aliments mous et ronds ou ovales en deux, ôter les pépins des raisins.'
  ]},
  {id:'1an',titre:'À partir de 1 an : on mange presque comme les grands',icone:'ti-soup',points:[
    'L’enfant mange presque comme la famille, en **quantités adaptées** à son âge.',
    '**Rythme** : vers 8 mois, 4 repas par jour dont 2 repas diversifiés et 2 tétées ou biberons ; à partir de 1 an, **3 repas + 1 goûter**.',
    'Jusqu’à 3 ans, **beaucoup de lait** : environ 500 ml par jour (petit-déjeuner et goûter). À partir de 1 an : lait de croissance nature (enrichi en fer) ou lait de vache **entier** UHT (jamais écrémé), éventuellement en alternance.',
    'Avec du lait entier UHT seul, proposer des aliments riches en fer (légumes secs, poisson, œufs, viande) et en vitamine C (agrumes).',
    '**Un goûter, et un seul** : de préférence une tartine et un fruit (ou une compote) ou un produit laitier. Limiter au maximum viennoiseries, gâteaux, biscuits et chocolat, et les introduire le plus tard possible ; les biscuits du commerce « pour les moins de 3 ans » sont souvent trop gras et sucrés.',
    'Si l’enfant a déjà goûté à la crèche ou chez la nounou, **ne pas lui redonner de goûter**.',
    'Hors repas, ne pas laisser de nourriture visible ou à portée de main ; ne pas laisser l’enfant se servir seul dans le placard ou le réfrigérateur.',
    'Ne pas laisser un enfant dans son lit avec un biberon (habitude de s’endormir en mangeant, risque de caries).'
  ]},
  {id:'2ans',titre:'Vers 2 ans : on refuse souvent certains aliments',icone:'ti-mood-puzzled',points:[
    'Le refus (surtout des légumes) est **normal** à cet âge : l’enfant affirme son autonomie. S’armer de patience, ne pas forcer ; le repas doit rester un moment de plaisir.',
    '**Poser des limites** : c’est l’adulte qui décide de la composition du repas. Si l’enfant refuse un plat, ne pas compenser avec plus de dessert ou un gros goûter.',
    'Éviter le **chantage affectif** (« encore une cuillère pour me faire plaisir », « si tu finis, tu auras un dessert ») : l’enfant mange parce qu’il a faim.',
    'Un enfant a ses préférences : rien n’empêche de reproposer un aliment apprécié plusieurs fois dans la semaine.',
    '**Montrer l’exemple** : plus de légumes au menu de toute la famille. Varier les recettes d’un même légume (salade, tarte, pot-au-feu), ajouter de la couleur (courgettes, brocolis, tomates). Le ketchup n’est pas une sauce tomate (très sucré).',
    'Faire découvrir les fruits et légumes ensemble : courses, cuisine, petite culture de basilic ou de tomates en pot.'
  ]}
];
const GD_CRECHE=[
  'Pas de goûter avant 6 mois ; un seul goûter par jour, de préférence tartine + fruit ou produit laitier, à limiter en produits sucrés.',
  'Produits laitiers nature, entiers (pas ½ écrémés ni 0 %) pour les moins de 3 ans ; pas de lait cru.',
  'Pas de sel ajouté, pas de jus ni de soda : eau à la tasse ou au verre dès 6 mois.',
  'Textures : respecter la progression (mixé lisse → écrasé → morceaux mous dès 8 mois → morceaux à croquer dès 10 mois) et ne jamais forcer un enfant à finir.',
  'Sécurité : couper en deux les aliments ronds et mous, ôter les pépins, pas d’aliments petits, durs et ronds avant 5 ans.',
  'Allergènes introduits tôt, mais avis médical si allergies familiales ; vérifier les PAI et fiches enfants avant de proposer un nouvel aliment.'
];
function gdMd(t){return escHtml(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');}
function guideDiversificationOuvrir(){
  let ov=document.getElementById('modal-guide-div-wrap');if(ov)ov.remove();
  ov=document.createElement('div');ov.className='overlay';ov.id='modal-guide-div-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-guide-div-wrap');};
  ov.innerHTML='<div class="modal" style="max-width:680px;width:100%;max-height:90vh;overflow:auto">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">'
    +'<h3 style="margin:0"><i class="ti ti-baby-carriage"></i> Guide de la diversification alimentaire</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-guide-div-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Synthèse du <em>Petit guide de la diversification alimentaire</em> (Santé publique France, mangerbouger.fr), de la naissance à 3 ans. Pour le détail et les illustrations, se reporter au guide d’origine et à <strong>1000-premiers-jours.fr</strong>.</p>'
    +'<div style="border:1px solid var(--koala);border-radius:8px;padding:8px 12px;margin-bottom:10px;background:#EEEDF8"><div style="font-size:12px;font-weight:700;color:var(--koala);text-transform:uppercase;margin-bottom:4px"><i class="ti ti-building-community"></i> À retenir pour la crèche et la commande de repas</div>'
    +'<ul style="margin:0 0 0 18px;padding:0;font-size:13px;line-height:1.6">'+GD_CRECHE.map(function(p){return'<li>'+gdMd(p)+'</li>';}).join('')+'</ul></div>'
    +GD_TRANCHES.map(function(t,i){
      return'<details style="border:1px solid var(--border);border-radius:8px;padding:6px 12px;margin-bottom:6px"'+(i===0?' open':'')+'>'
        +'<summary style="cursor:pointer;font-weight:700;font-size:14px;padding:4px 0"><i class="ti '+t.icone+'"></i> '+escHtml(t.titre)+'</summary>'
        +'<ul style="margin:6px 0 4px 18px;padding:0;font-size:13px;line-height:1.6">'+t.points.map(function(p){return'<li style="margin-bottom:3px">'+gdMd(p)+'</li>';}).join('')+'</ul></details>';
    }).join('')
    +'<div style="text-align:right;margin-top:10px"><button class="btn-cancel" onclick="closeModal(\'modal-guide-div-wrap\')">Fermer</button></div></div>';
  document.body.appendChild(ov);
  ov.classList.add('open');
}
window.guideDiversificationOuvrir=guideDiversificationOuvrir;
