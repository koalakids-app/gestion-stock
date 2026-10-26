/* ---------- PLAN DE MAÎTRISE SANITAIRE (PMS) ----------
   Modèle « à remplir » pour une micro-crèche en liaison froide : repas livrés
   par un prestataire (MCM), réchauffés sur place, sans fabrication.
   Une réponse par crèche (cf. TPL_ETABLISSEMENT). Dès que la crèche est choisie,
   l'identité du site est pré-remplie depuis Paramètres › Les établissements
   (fiche `etablissements`) et la fiche `creches` : adresse, gestionnaire, SIRET,
   représentant, téléphone, e-mail, agrément PMI, capacité, horaires.
   Règle de pré-remplissage : un champ vide ou encore égal à la valeur posée
   automatiquement est mis à jour quand on change de crèche ; un champ corrigé à la
   main n'est jamais écrasé (sauf « Recharger les informations de la crèche »).
   Toute la partie rédigée (tableaux et textes) vit dans PMS_ST, enregistrée en un
   seul champ (pms_json) ; « Revenir au modèle » restaure le contenu type.
   Écran et PDF lisent le même état. */

const PMS_PRESTA='Les mamans cuisinières du monde (MCM)';

const PMS_TABLES={
 bp:{titre:'2. Bonnes pratiques d’hygiène',
  cols:[['Thème',20],['Règle',50],['Preuve / fréquence',30]],
  def:[
   ['Hygiène du personnel','Tenue propre, cheveux attachés, ongles courts, sans bijoux ni vernis pendant la manipulation des repas','Contrôle visuel quotidien'],
   ['Lavage des mains','Avant toute manipulation des plats, après les changes, les toilettes, un mouchoir, la manipulation des déchets','Affichage au point d’eau'],
   ['Santé du personnel','Signaler toute diarrhée, vomissement, plaie infectée ou lésion cutanée ; éviction de la manipulation selon l’avis médical','Fiche de signalement'],
   ['Nettoyage et désinfection','Plan par zone : produit, dilution, fréquence, responsable (plan de travail, plats inox, ustensiles, four, frigo, sols)','Fiche 4 – nettoyage et désinfection'],
   ['Nettoyage des jeux et des espaces de vie','Jouets, tapis, mobilier, sols, sanitaires et change : plan par crèche, fréquence et méthode définis ; chaque nettoyage est enregistré (qui, quand, quel produit)','Registre des nettoyages (application Stock › Nettoyages), repris ci-dessous'],
   ['Matériel de remise en température','Four, bain-marie ou maintien au chaud entretenus ; thermomètre-sonde nettoyé entre chaque usage et contrôlé selon la procédure du paragraphe 3','Fiche 5 – vérification de la sonde'],
   ['Lutte contre les nuisibles','Locaux fermés, contrôle visuel régulier, intervention d’un prestataire si besoin','Registre des interventions'],
   ['Déchets','Poubelles à pédale fermées, vidées chaque jour, jamais en contact avec les plats','Contrôle visuel'],
   ['Eau','Eau potable du réseau pour la préparation et le lavage','Carnet sanitaire si requis'],
   ['Entretien du chauffe-biberon','Chaque jour : débrancher, laisser refroidir, vider l’eau, nettoyer l’extérieur avec un chiffon humide et de l’eau savonneuse, repasser un chiffon rincé à l’eau claire, essuyer. Chaque semaine (plus si l’eau est très calcaire) : appareil vide et froid, solution à 50 % d’eau et 50 % de vinaigre blanc (6 à 8 %) jusqu’au niveau maximal, un cycle complet (5 à 10 min), laisser agir 15 à 20 min, vider, rincer avec un cycle à l’eau claire (deux fois si l’odeur persiste), essuyer l’intérieur et laisser sécher à l’air libre','Date et nom de la personne notés dans la fiche d’entretien du matériel ; fiche 4. Source : protocole « désinfection chauffe-biberon » (Documents)'],
   ['Entretien des biberons et tétines','Rincer à l’eau froide, nettoyer à l’eau chaude avec du liquide vaisselle et un goupillon, laver tétine, bague et capuchon, rincer le tout ; laisser égoutter démonté, tête en bas, à l’air libre. Si possible, lave-vaisselle à 65 °C minimum, cycle complet avec séchage, y compris bagues et capuchons, sauf les tétines en caoutchouc (celles en silicone y vont) : celles-ci sont nettoyées à l’écouvillon et sèchent sur un arbre à biberon. En attendant le lave-vaisselle, les biberons peuvent tremper dans l’évier avec du liquide vaisselle. Le goupillon est lavé, rincé et séché dans un endroit propre. La stérilisation n’est pas indispensable','Fiche 4 ; plan de nettoyage des locaux. Source : protocole HACCP Cuisine et biberonnerie (Documents) ; fiche Ministère de la Santé / AFSSA (2006)'],
   ['Préparation des biberons (lait infantile)','Préparés à la demande, jamais à l’avance, par le professionnel qui en a besoin, sur un plan de travail propre et différent de celui de la distribution des plats. Mains lavées, tablier ou blouse, charlotte, ni montre ni bijoux, ongles courts. Eau du robinet froide uniquement, après quelques secondes d’écoulement, sans filtre (robinet nettoyé et détartré chaque semaine au vinaigre blanc) ; les parents peuvent apporter une eau faiblement minéralisée. Pas besoin de chauffer l’eau. Dilution : une mesurette arasée pour 30 ml d’eau. Biberon identifié au nom de l’enfant avec la date et l’heure de préparation, conservé monté et fermé : au réfrigérateur sur une étagère dédiée, ou dans un placard fermé à l’abri de la poussière','Étiquette nominative datée et horodatée. Source : protocole HACCP Cuisine et biberonnerie (Documents)'],
   ['Conservation, réchauffage et service des biberons','Biberon non consommé : au frigo sur une étagère (pas dans la porte) à +4 °C maximum, jusqu’au départ de l’enfant le soir, puis jeté ; à température ambiante (à l’abri du soleil et de toute source de chaleur) : 1 h ; réchauffé : 30 min maximum. Jamais de biberon entamé conservé, même au frigo. Réchauffage au chauffe-biberon ou au bain-marie, jamais au micro-ondes ; le biberon peut aussi être donné à température ambiante. Agiter et toujours contrôler la température avant de le proposer (quelques gouttes sur le poignet ou l’avant-bras)','Fiche 2 (frigo). Source : protocole HACCP Cuisine et biberonnerie (Documents) ; ameli.fr'],
   ['Lait maternel apporté par la famille','Protocole de recueil et d’allaitement signé par la famille. Contenant au nom de l’enfant avec la date et l’heure du tirage, en petite quantité ; apporté chaque jour en poche isotherme, 4 h maximum entre le frigo de la famille et celui de la crèche ; vérifier transport et étiquetage à l’arrivée. Stocké au frigo à 4 °C, dans un endroit propre et dédié, pas dans la porte. Mains lavées, peu de manipulations. Réchauffer au bain-marie ou à l’eau chaude (décongélation préalable sous l’eau tiède), micro-ondes strictement interdit ; agiter, tester sur le poignet ; consommé dans la demi-heure après réchauffage, sinon jeté. Lait décongelé : consommé dans les 24 h, jamais recongelé ; congélation 4 mois maximum. Noter la quantité bue. Préférer le lait frais, garder le congelé pour les urgences','Étiquette nominative ; heure de sortie du congélateur donnée par la famille. Source : protocole lait maternel et protocole HACCP Cuisine et biberonnerie (Documents)'],
   ['Conservation du lait infantile et des bouteilles','Bouteilles d’eau et de lait ouvertes : 24 h au frigo, avec date, heure d’ouverture et nom de l’enfant. Boîte de lait ouverte : 1 mois maximum (ou moins selon la boîte) dans un placard fermé, à l’abri de l’humidité et de la poussière, date d’ouverture notée ; boîtes non utilisées rendues aux parents avant la date limite','Contrôle visuel. Source : protocole HACCP Cuisine et biberonnerie (Documents)'],
   ['Entretien du réfrigérateur et de la cuisine','Réfrigérateurs, four et chauffe-biberon : chaque semaine (débrancher, vider, démonter clayettes et bacs, nettoyer, rincer, désinfecter avec un produit alimentaire, laisser sécher, remettre en route et réinstaller les denrées à +4 °C) ; congélateur : dépoussiérage et dégivrage chaque trimestre. Plan de travail, placards extérieurs, évier, robinet, poignées, poubelle, sol : chaque jour. Placards et lave-vaisselle : chaque mois','Plan de nettoyage des locaux, fiche 4. Source : protocole HACCP Cuisine et biberonnerie (Documents)'],
   ['Allergènes','Information écrite des familles et de l’équipe pour chaque plat ; vigilance sur les enfants avec PAI','Fiche allergènes du prestataire, classée']]},
 hz:{titre:'Analyse des dangers',
  cols:[['Étape',13],['Danger',17],['Mesure de maîtrise',24],['Limite à respecter',22],['Si non conforme',24]],
  def:[
   ['Réception','Rupture de la chaîne du froid, DLC dépassée, emballage abîmé','Mesure de température à la livraison, contrôle DLC et intégrité','T° affichée sur le produit ou, à défaut, +3 °C maximum [à confirmer avec MCM]','Refuser ou isoler le plat, prévenir MCM, noter sur la fiche'],
   ['Stockage','Prolifération microbienne','Frigo dédié, lecture de la T° 2 fois par jour (matin et soir), barquettes mises au frigo dans les 30 min suivant la livraison','Inférieure à +4 °C (+6 °C maximum pour continuer à consommer l’aliment) [à confirmer]','Vérifier le frigo, isoler les plats, appeler la maintenance'],
   ['Transfert inox','Contamination croisée, perte de l’étiquette du plat','Plat et ustensiles propres, mains lavées, étiquette de la barquette conservée','Transfert juste avant la remise en température','Jeter le plat si contamination suspectée'],
   ['Remise en température','Survie des bactéries','Mesure de T° à cœur avec la sonde','63 °C à cœur, atteints en moins d’1 heure [à valider avec votre DDPP]','Poursuivre le chauffage et remesurer, sinon ne pas servir'],
   ['Maintien au chaud','Reprise de la croissance microbienne','Maintien en continu jusqu’au service','63 °C minimum','Si l’écart est constaté tout de suite, réchauffer à 63 °C et remesurer ; sinon ne pas servir [à valider]'],
   ['Biberons','Contamination par un biberon ou une tétine mal lavés ; multiplication rapide des germes dans le lait reconstitué','Lavage et rinçage après chaque usage, préparation à la demande, étiquette nominative datée et horodatée, plan de travail propre','Température ambiante : 1 h maximum ; biberon réchauffé : 30 min maximum ; frigo : +4 °C maximum, jusqu’au départ de l’enfant ; lait maternel réchauffé : 30 min','Jeter le lait et relaver le biberon, rappeler la procédure ; ne jamais garder un biberon entamé ni réchauffer au micro-ondes'],
   ['Service','Contamination par les mains ou le matériel','Mains lavées, ustensiles propres, plats couverts','Service dans la durée définie par le site [à fixer]','Jeter ce qui a été touché ou laissé à découvert'],
   ['Restes','Réutilisation à risque','Élimination en fin de service','Aucun reste resservi','Sans objet']]},
 so:{titre:'Contrôle de la sonde de température',
  cols:[['Contrôle',22],['Comment',46],['Quand',32]],
  def:[
   ['Contrôle visuel','Sonde propre, non abîmée, affichage lisible, pile en état','Avant chaque service'],
   ['Nettoyage','Nettoyer et désinfecter la sonde entre deux plats mesurés','Après chaque mesure'],
   ['Vérification de justesse','Plonger la sonde dans un bain d’eau et de glace pilée : lecture attendue proche de 0 °C ; ou comparaison avec un thermomètre de référence','À l’arrivée du matériel, chaque année, après une chute ou un doute'],
   ['Tolérance','Écart maximum de ±1 °C par rapport à la référence [à confirmer]','À chaque vérification'],
   ['Si l’écart est trop grand','Ne plus utiliser la sonde ; la remplacer ou la faire étalonner ; signaler au responsable PMS les repas mesurés depuis le dernier contrôle conforme','Immédiatement'],
   ['Responsable du contrôle','[nom, fonction]','Chaque année et à chaque remplacement']]},
 tr:{titre:'Documents de traçabilité',
  cols:[['Document',26],['Contenu',34],['Durée de conservation',40]],
  def:[
   ['Étiquette de la barquette (ou photo)','Nom du plat, lot, DLC, fournisseur','Au moins jusqu’à la fin de la consommation du plat, et collée ou photographiée sur le registre du jour'],
   ['Bon de livraison et facture','Date, quantités, mode de conservation','6 mois après la DLC pour les produits frais'],
   ['Registre du jour','Date, site, plat servi, lot, T° de remise en température','6 mois après la DLC du plat'],
   ['Fiches de températures et de nettoyage','Relevés signés : température du réfrigérateur (matin et soir), réception, remise en température, nettoyage','3 ans (règle HACCP), y compris les relevés du réfrigérateur'],
   ['Coordonnées des fournisseurs','Nom, adresse, téléphone, n° d’agrément','Tant que le fournisseur est actif'],
   ['Fiche allergènes du prestataire','Allergènes de chaque plat','Version en vigueur, plus l’historique de 6 mois']]},
 nc:{titre:'6. Non-conformités, TIAC et alertes',
  cols:[['Situation',32],['Action immédiate',36],['Suite à donner',32]],
  def:[
   ['Livraison non conforme (T°, DLC, emballage)','Refuser ou isoler le plat, ne pas le servir','Prévenir MCM, noter sur la fiche 1'],
   ['Réfrigérateur en panne ou T° hors limite','Isoler les plats, vérifier leur état','Faire intervenir la maintenance, noter sur la fiche 2'],
   ['T° à cœur non atteinte','Poursuivre le chauffage et remesurer, sinon ne pas servir','Noter sur la fiche 3, analyser la cause'],
   ['Nettoyage des jeux ou des espaces non réalisé à la fréquence prévue','Le faire dès que possible et l’enregistrer avec l’observation','Informer la référente, rappeler le plan à l’équipe'],
   ['Biberon mal lavé, tétine abîmée, lait laissé plus d’1 h à température ambiante (30 min après réchauffage), ou reste de biberon','Ne pas servir, jeter le lait, relaver ou remplacer le biberon ou la tétine','Rappeler la procédure à l’équipe, noter sur la fiche 4'],
   ['Plat tombé, touché ou laissé à découvert','Ne pas servir','Jeter, noter'],
   ['Sonde hors tolérance, abîmée ou perdue','Ne plus l’utiliser, passer à une sonde de remplacement','Noter sur la fiche 5, faire étalonner ou remplacer la sonde'],
   ['Suspicion de TIAC (plusieurs enfants ou adultes malades après un repas)','Garder les restes éventuels et les étiquettes, noter les repas et les symptômes','Prévenir la direction, MCM, la DDPP du Var et les familles']]},
 ct:{titre:'Contacts utiles',
  cols:[['Contact',40],['Nom et téléphone',60]],
  def:[
   ['DDPP du Var',''],
   ['MCM, prestataire repas',''],
   ['Responsable PMS',''],
   ['Médecin de la structure ou centre antipoison','']]},
 fo:{titre:'7. Formation, vérification et mise à jour',
  cols:[['Action',50],['Qui',25],['Fréquence',25]],
  def:[
   ['Formation à l’hygiène alimentaire pour tout le personnel qui manipule les repas','Responsable PMS','À l’arrivée, puis chaque année'],
   ['Rappel des règles de lavage des mains et de remise en température','Référent·e hygiène','Chaque trimestre'],
   ['Contrôle des fiches 1 à 4','Responsable PMS','Chaque mois'],
   ['Vérification de la sonde (fiche 5) et du réfrigérateur','Référent·e hygiène','Chaque année'],
   ['Révision complète du PMS','Responsable PMS','Chaque année, et à chaque changement de prestataire ou de matériel']]}
};

/* Textes types : une ligne par paragraphe ; « → » = consigne en gras, « - » = puce. */
const PMS_TXT_DEF={
 intro:'Ce plan décrit comment le site maîtrise la sécurité sanitaire de repas livrés en liaison froide puis réchauffés sur place, sans fabrication. Les mentions entre [crochets] sont à compléter ou à valider.',
 flux:['Réception des repas livrés en barquettes plastique, contrôle de la température et des étiquettes',
  'Stockage au réfrigérateur, jusqu’au moment de la remise en température',
  'Transfert de la barquette vers un plat inox propre, avec des ustensiles propres',
  'Remise en température',
  'Maintien au chaud jusqu’au service',
  'Service aux enfants',
  'Élimination des restes : aucun reste n’est resservi ni conservé'].join('\n'),
 danger:'Le risque principal est la prolifération de bactéries si la chaîne du froid ou la remontée en température est mal tenue. Les températures ci-dessous sont des repères d’usage, à confirmer par le fournisseur et par la DDPP.',
 sonde:'La sonde de température valide toutes les mesures du plan (réception, remise en température, maintien au chaud). Sans contrôle de sa justesse, ces mesures n’ont pas de valeur. Les tolérances sont des repères à confirmer avec votre DDPP.',
 trace:'La traçabilité permet de retrouver l’origine d’un plat et les enfants concernés en cas d’alerte produit ou de toxi-infection alimentaire collective (TIAC). Aucun texte ne fixe une durée unique : les durées retenues suivent les guides professionnels et prennent la plus protectrice.\n→ Au moment du transfert vers le plat inox, l’étiquette de la barquette est collée dans le registre du jour ou photographiée avant d’être jetée : le plat inox n’est plus relié à son lot.',
 retrait:['Retrait ou rappel produit :',
  '- Retrouver le lot dans le registre et identifier les repas servis',
  '- Isoler et ne plus servir les restes éventuels du lot concerné',
  '- Prévenir MCM, puis la DDPP si le produit a été consommé',
  '- Informer les familles concernées, noter les actions menées',
  '* Repas témoins : leur obligation dépend du type d’établissement et n’est pas traitée ici. À valider auprès de la DDPP du Var et du contrat avec le prestataire.'].join('\n')
};
const PMS_TXT_LABELS={intro:'Introduction',flux:'Étapes du flux (une par ligne)',danger:'Principe de l’analyse',sonde:'Principe du contrôle de la sonde',trace:'Principe de la traçabilité',retrait:'Retrait ou rappel de produit'};

/* Fiches vierges à imprimer, en annexe du PDF */
const PMS_FICHES=[
 ['Fiche 1 – Réception et traçabilité',['Date','Plat','Lot','DLC','T° réception','Conforme','Visa'],[22,40,24,24,26,22,24]],
 ['Fiche 2 – Température du réfrigérateur',['Date','T° matin','T° soir','Conforme','Action corrective','Visa'],[22,24,24,24,64,24]],
 ['Fiche 3 – Contrôle de la remise en températures',['Jour','Nature des plats','T° mise en chauffe','Heure mise en chauffe','T° fin de réchauffe','Heure fin de réchauffe','T° après mixage','Observations','Visa'],[20,32,20,17,20,17,19,22,15],['Lundi','Mardi','Mercredi','Jeudi','Vendredi']],
 ['Fiche 4 – Nettoyage et désinfection',['Date','Zone ou matériel','Produit utilisé','Fait par (nom)','Fait','Visa'],[22,46,40,34,20,20]],
 ['Fiche 5 – Vérification de la sonde de température',['Date','Sonde (repère)','Lecture eau glacée (°C)','Écart (°C)','Conforme','Action','Visa'],[22,30,30,22,22,34,22]]
];

const PMS_FIELDS=['creche','pms_date','pms_version','pms_adresse','pms_gest','pms_siret','pms_rep','pms_tel','pms_mail','pms_pmi',
                  'pms_cap','pms_horaires','pms_repas_jour','pms_ddpp_date','pms_resp','pms_hyg','pms_presta','pms_json'];
/* champs pré-remplis depuis la crèche (id → libellé) */
const PMS_AUTO=['pms_adresse','pms_gest','pms_siret','pms_rep','pms_tel','pms_mail','pms_pmi','pms_cap','pms_horaires'];

/* ---------- état modifiable ---------- */
let PMS_ST=null;
function pmsDefaut(){
  const t={};Object.keys(PMS_TABLES).forEach(k=>{t[k]=PMS_TABLES[k].def.map(r=>r.slice());});
  return {t:t,txt:Object.assign({},PMS_TXT_DEF)};
}
function pmsCharger(json){
  const d=pmsDefaut();let s=null;
  try{s=json?JSON.parse(json):null;}catch(e){s=null;}
  if(s&&typeof s==='object'){
    if(s.t&&typeof s.t==='object')Object.keys(PMS_TABLES).forEach(k=>{if(Array.isArray(s.t[k]))d.t[k]=s.t[k];});
    if(s.txt&&typeof s.txt==='object')Object.keys(PMS_TXT_DEF).forEach(c=>{if(typeof s.txt[c]==='string')d.txt[c]=s.txt[c];});
  }
  return d;
}
/* Vide tant que rien n'a été touché : un formulaire intact reste « sans contenu ». */
function pmsSync(){
  const e=document.getElementById('ff_pms_json');if(!e||!PMS_ST)return;
  const j=JSON.stringify(PMS_ST);
  e.value=(j===JSON.stringify(pmsDefaut()))?'':j;
}

/* ---------- tableaux modifiables ---------- */
function pmsTblHtml(k){
  const T=PMS_TABLES[k],rows=PMS_ST.t[k];
  return `<div class="ftw"><table class="ft"><tr>${T.cols.map(c=>`<th style="width:${c[1]}%">${esc(c[0])}</th>`).join('')}<th style="width:40px"></th></tr>`
   +rows.map((r,i)=>`<tr>${T.cols.map((c,j)=>`<td><textarea rows="2" oninput="pmsSetCell('${k}',${i},${j},this.value)">${esc(r[j]||'')}</textarea></td>`).join('')}`
     +`<td class="x"><button type="button" class="pms-b" title="Supprimer la ligne" onclick="pmsDelRow('${k}',${i})"><i class="ti ti-x"></i></button></td></tr>`).join('')
   +`</table></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">
    <button type="button" class="btn btn-s" onclick="pmsAddRow('${k}')"><i class="ti ti-plus"></i> Ajouter une ligne</button>
    <button type="button" class="btn btn-g" onclick="pmsResetTbl('${k}')"><i class="ti ti-restore"></i> Revenir au modèle</button>
   </div>`;
}
function pmsRenderTbl(k){const e=document.getElementById('pms-t-'+k);if(e)e.innerHTML=pmsTblHtml(k);pmsSync();}
function pmsSetCell(k,i,j,v){PMS_ST.t[k][i][j]=v;pmsSync();}
function pmsAddRow(k){PMS_ST.t[k].push(PMS_TABLES[k].cols.map(()=>''));pmsRenderTbl(k);}
function pmsDelRow(k,i){PMS_ST.t[k].splice(i,1);pmsRenderTbl(k);}
function pmsResetTbl(k){
  if(!confirm('Revenir au tableau type ? Les lignes saisies dans ce tableau seront perdues.'))return;
  PMS_ST.t[k]=PMS_TABLES[k].def.map(r=>r.slice());pmsRenderTbl(k);
}
function pmsTblBloc(k){return `<h3>${esc(PMS_TABLES[k].titre)}</h3><div id="pms-t-${k}">${pmsTblHtml(k)}</div>`;}

/* ---------- textes ---------- */
function pmsSetTxt(c,v){PMS_ST.txt[c]=v;pmsSync();}
function pmsResetTxt(c){
  const e=document.getElementById('pms-x-'+c);
  PMS_ST.txt[c]=PMS_TXT_DEF[c];if(e)e.value=PMS_TXT_DEF[c];pmsSync();
}
function pmsTxtHtml(c,rows){
  return `<label style="font-size:12px;color:var(--muted)">${esc(PMS_TXT_LABELS[c])}</label>
   <textarea id="pms-x-${c}" rows="${rows}" oninput="pmsSetTxt('${c}',this.value)">${esc(PMS_ST.txt[c])}</textarea>
   <button type="button" class="btn btn-g" style="margin:6px 0 14px" onclick="pmsResetTxt('${c}')"><i class="ti ti-restore"></i> Revenir au texte type</button>`;
}

/* ---------- pré-remplissage depuis la crèche choisie ---------- */
const PMS_CAP={};  /* id crèche → {capacity, capacity_surnombre} (lus à la demande) */
async function pmsChargerCap(id){
  if(PMS_CAP[id])return PMS_CAP[id];
  let r=await sb.from('creches').select('capacity,capacity_surnombre').eq('id',id).maybeSingle();
  /* script creches_capacite_surnombre.sql pas encore passé : on se contente de la capacité agréée */
  if(r.error)r=await sb.from('creches').select('capacity').eq('id',id).maybeSingle();
  return PMS_CAP[id]=(r&&r.data)||{};
}
/* Registre des nettoyages (application Stock › Nettoyages), lu à la demande */
const PMS_NETT={};  /* nom court de la crèche → {plan, journal, erreur} */
const PMS_NETT_FREQ={apres_usage:'Après chaque usage',quotidien:'Chaque jour',hebdomadaire:'Chaque semaine',mensuel:'Chaque mois'};
const PMS_NETT_TYPE={jeux:'Jeux et jouets',espace:'Espaces et mobilier'};
function pmsNettCle(cr){return cr?shortCrecheName(cr.name):'';}
async function pmsChargerNett(cr){
  const cle=pmsNettCle(cr);if(!cle)return null;
  const depuis=new Date(Date.now()-62*864e5).toISOString().slice(0,10);
  try{
    const [p,j]=await Promise.all([
      sb.from('nettoyage_plan').select('id,type,libelle,frequence,methode,ordre').eq('creche',cle).eq('actif',true).order('type').order('ordre'),
      sb.from('nettoyage_journal').select('plan_id,type,libelle,fait_le,fait_par,produit,observation,created_at').eq('creche',cle).gte('fait_le',depuis).order('fait_le',{ascending:false}).order('created_at',{ascending:false}).limit(1000)
    ]);
    if(p.error||j.error)PMS_NETT[cle]={plan:[],journal:[],erreur:(p.error||j.error).message||'erreur'};
    else PMS_NETT[cle]={plan:p.data||[],journal:j.data||[],erreur:''};
  }catch(e){PMS_NETT[cle]={plan:[],journal:[],erreur:String(e&&e.message||e)};}
  return PMS_NETT[cle];
}
function pmsNettJoursAvant(n){return new Date(Date.now()-n*864e5).toISOString().slice(0,10);}
/* une ligne de synthèse par ligne du plan : fréquence, nombre sur 30 jours, dernier passage */
function pmsNettSynthese(d){
  const lim=pmsNettJoursAvant(30);
  return d.plan.map(l=>{
    const fait=d.journal.filter(x=>x.plan_id===l.id);
    const rec=fait.filter(x=>x.fait_le>=lim);
    const der=fait[0];
    return {type:l.type,libelle:l.libelle,freq:PMS_NETT_FREQ[l.frequence]||l.frequence,methode:l.methode||'',
      n:rec.length,der:der?new Date(der.fait_le+'T12:00:00').toLocaleDateString('fr-FR'):'aucun',par:der?(der.fait_par||'non renseigné'):'—'};
  });
}
function pmsNettHtml(){
  const cr=pmsCrecheChoisie(),cle=pmsNettCle(cr);
  if(!cr)return '<p class="hint">Choisissez une crèche pour afficher son registre des nettoyages.</p>';
  const d=PMS_NETT[cle];
  if(!d)return '<p class="hint">Lecture du registre des nettoyages…</p>';
  const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const lien=' <a href="stock.html" target="_blank">Ouvrir Stock › Nettoyages</a>';
  if(d.erreur)return '<p class="hint">Registre des nettoyages indisponible ('+esc(d.erreur)+').'+lien+'</p>';
  if(!d.plan.length)return '<p class="hint">Aucun plan de nettoyage défini pour cette crèche.'+lien+'</p>';
  const lignes=pmsNettSynthese(d).map(l=>'<tr><td>'+esc(PMS_NETT_TYPE[l.type]||l.type)+'</td><td>'+esc(l.libelle)+'</td><td>'+esc(l.freq)+'</td><td>'+l.n+'</td><td>'+esc(l.der)+'</td><td>'+esc(l.par)+'</td></tr>').join('');
  return '<table class="ft"><tr><th>Type</th><th>Jeux / espace</th><th>Fréquence</th><th>Fait (30 j)</th><th>Dernier nettoyage</th><th>Fait par</th></tr>'+lignes+'</table><p class="hint">Lecture en direct du registre ; le PDF reprend cette synthèse et le détail des 14 derniers jours.'+lien+'</p>';
}
async function pmsMajNett(){
  const cr=pmsCrecheChoisie();
  const el=document.getElementById('pms-nett');
  if(!cr){if(el)el.innerHTML=pmsNettHtml();const rm0=document.getElementById('pms-remise');if(rm0)rm0.innerHTML=pmsRemiseHtml();return;}
  if(el)el.innerHTML='<p class="hint">Lecture du registre des nettoyages…</p>';
  const rm=document.getElementById('pms-remise');if(rm)rm.innerHTML='<p class="hint">Lecture du registre de remise en température…</p>';
  await Promise.all([pmsChargerNett(cr),pmsChargerRemise(cr)]);
  const c2=pmsCrecheChoisie();
  if(c2&&String(c2.id)===String(cr.id)){const e2=document.getElementById('pms-nett');if(e2)e2.innerHTML=pmsNettHtml();const r2=document.getElementById('pms-remise');if(r2)r2.innerHTML=pmsRemiseHtml();}
}
/* Registre de remise en température (Accès terrain › Remise en température), lu à la demande */
const PMS_REMISE={};  /* nom court de la crèche → {journal, erreur} */
async function pmsChargerRemise(cr){
  const cle=pmsNettCle(cr);if(!cle)return null;
  const depuis=pmsNettJoursAvant(62);
  try{
    const r=await sb.from('remise_temperature_journal').select('fait_le,plat,temp_chauffe,heure_chauffe,temp_fin,heure_fin,temp_mixage,conforme,observation,fait_par,created_at')
      .eq('creche',cle).gte('fait_le',depuis).order('fait_le',{ascending:false}).order('created_at',{ascending:false}).limit(1000);
    PMS_REMISE[cle]=r.error?{journal:[],erreur:r.error.message||'erreur'}:{journal:r.data||[],erreur:''};
  }catch(e){PMS_REMISE[cle]={journal:[],erreur:String(e&&e.message||e)};}
  return PMS_REMISE[cle];
}
const pmsTemp=t=>t==null?'':String(t).replace('.',',')+' °C';
const pmsHeureCourte=h=>String(h||'').slice(0,5);
/* une ligne par plat : chauffe, fin de réchauffe, mixage, conformité, observation, visa */
function pmsRemiseLignes(d,jours){
  const lim=pmsNettJoursAvant(jours);
  return d.journal.filter(x=>x.fait_le>=lim).map(x=>[
    new Date(x.fait_le+'T12:00:00').toLocaleDateString('fr-FR'),x.plat||'',
    [pmsTemp(x.temp_chauffe),pmsHeureCourte(x.heure_chauffe)].filter(Boolean).join(' · '),
    [pmsTemp(x.temp_fin),pmsHeureCourte(x.heure_fin)].filter(Boolean).join(' · '),
    pmsTemp(x.temp_mixage),x.temp_fin==null?'—':x.conforme===false?'Non':'Oui',x.temp_fin==null?'Fin non saisie. '+(x.observation||''):(x.observation||''),x.fait_par||'non renseigné']);
}
function pmsRemiseHtml(){
  const cr=pmsCrecheChoisie(),cle=pmsNettCle(cr);
  if(!cr)return '<p class="hint">Choisissez une crèche pour afficher son registre de remise en température.</p>';
  const d=PMS_REMISE[cle];
  if(!d)return '<p class="hint">Lecture du registre de remise en température…</p>';
  const e=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  if(d.erreur)return '<p class="hint">Registre de remise en température indisponible ('+e(d.erreur)+').</p>';
  const l=pmsRemiseLignes(d,14),nc=l.filter(r=>r[5]==='Non').length;
  if(!l.length)return '<p class="hint">Aucun relevé de remise en température sur les 14 derniers jours (saisie dans Accès terrain › Remise en température).</p>';
  return '<table class="ft"><tr><th>Date</th><th>Plat</th><th>Mise en chauffe</th><th>Fin de réchauffe</th><th>Après mixage</th><th>Conforme</th><th>Observation</th><th>Visa</th></tr>'
    +l.map(r=>'<tr>'+r.map(c=>'<td>'+e(c)+'</td>').join('')+'</tr>').join('')+'</table>'
    +'<p class="hint">'+l.length+' plat'+(l.length>1?'s':'')+' relevé'+(l.length>1?'s':'')+' sur 14 jours, dont '+nc+' non conforme'+(nc>1?'s':'')+'. Lecture en direct du registre tenu dans Accès terrain ; le PDF reprend ce tableau.</p>';
}
/* ===== Archive mensuelle du registre de remise en température (direction) =====
   La règle HACCP demande de conserver ces relevés 3 ans : la table n'est jamais purgée, et la direction en sort
   un PDF (à classer) et un CSV (tableur) par mois, pour la crèche choisie ou pour toutes. */
function pmsMoisDefaut(){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function pmsMoisBornes(m){
  const a=new Date(+m.slice(0,4),+m.slice(5,7)-1,1),b=new Date(a.getFullYear(),a.getMonth()+1,1);
  const f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
  return{de:f(a),a:f(b),label:a.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})};
}
async function pmsMoisDonnees(cle,m){
  const b=pmsMoisBornes(m),rows=[];
  for(let off=0;;off+=1000){   /* pagination : un mois dépasse rarement 1000 lignes, mais on ne tronque jamais */
    const r=await sb.from('remise_temperature_journal').select('fait_le,plat,temp_chauffe,heure_chauffe,temp_fin,heure_fin,temp_mixage,conforme,observation,fait_par,created_at')
      .eq('creche',cle).gte('fait_le',b.de).lt('fait_le',b.a).order('fait_le').order('created_at').range(off,off+999);
    if(r.error)throw r.error;
    rows.push(...(r.data||[]));
    if((r.data||[]).length<1000)break;
  }
  return rows;
}
function pmsMoisLigne(x){
  return [new Date(x.fait_le+'T12:00:00').toLocaleDateString('fr-FR'),x.plat||'',
    [pmsTemp(x.temp_chauffe),pmsHeureCourte(x.heure_chauffe)].filter(Boolean).join(' · '),
    [pmsTemp(x.temp_fin),pmsHeureCourte(x.heure_fin)].filter(Boolean).join(' · '),
    pmsTemp(x.temp_mixage),x.temp_fin==null?'—':x.conforme===false?'Non':'Oui',
    (x.temp_fin==null?'Fin de réchauffe non saisie. ':'')+(x.observation||''),x.fait_par||'non renseigné'];
}
async function pmsExporterMois(format,toutes){
  if(!IS_DIRECTION){toast('Export réservé à la direction.',true);return;}
  const m=(document.getElementById('pmsMois')||{}).value||'';
  if(!/^\d{4}-\d{2}$/.test(m)){toast('Choisissez un mois.',true);return;}
  const cr=pmsCrecheChoisie();
  const liste=toutes?(CRECHES||[]).map(c=>({nom:c.name,cle:pmsNettCle(c)})):(cr?[{nom:cr.name,cle:pmsNettCle(cr)}]:[]);
  if(!liste.length){toast('Choisissez une crèche (ou « toutes les crèches »).',true);return;}
  const b=pmsMoisBornes(m);
  try{
    const jeux=[];
    for(const c of liste)jeux.push({nom:c.nom,rows:await pmsMoisDonnees(c.cle,m)});
    const fichier='remise-en-temperature_'+m+(toutes?'_toutes-creches':'_'+slug(liste[0].nom));
    if(format==='csv'){
      const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
      const lignes=[['Crèche','Date','Plat','T° mise en chauffe','Heure mise en chauffe','T° fin de réchauffe','Heure fin de réchauffe','T° après mixage','Conforme','Observation','Visa'].map(q).join(';')];
      jeux.forEach(j=>j.rows.forEach(x=>lignes.push([j.nom,x.fait_le,x.plat,x.temp_chauffe,pmsHeureCourte(x.heure_chauffe),x.temp_fin,pmsHeureCourte(x.heure_fin),x.temp_mixage,x.temp_fin==null?'':x.conforme===false?'Non':'Oui',x.observation,x.fait_par].map(v=>q(v==null?'':String(v).replace(/^(\d+)\.(\d)$/,'$1,$2'))).join(';'))));
      const blob=new Blob(['﻿'+lignes.join('\r\n')],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fichier+'.csv';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),2000);
      toast('Export CSV prêt.');return;
    }
    const{jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape'});
    jeux.forEach((j,idx)=>{
      if(idx)doc.addPage();
      let y=pdfLogo(doc,20);
      doc.setFontSize(15);doc.setFont(undefined,'bold');doc.setTextColor(30);
      doc.text(pdfSafe('Registre de remise en température — '+b.label),14,y+2);y+=8;
      doc.setFontSize(10);doc.setFont(undefined,'normal');
      const nc=j.rows.filter(x=>x.temp_fin!=null&&x.conforme===false).length,ouv=j.rows.filter(x=>x.temp_fin==null).length;
      doc.text(pdfSafe(j.nom+' · '+j.rows.length+' plat'+(j.rows.length>1?'s':'')+' relevé'+(j.rows.length>1?'s':'')+' · '+nc+' non conforme'+(nc>1?'s':'')+(ouv?' · '+ouv+' sans fin de réchauffe saisie':'')),14,y);y+=5;
      doc.setFontSize(8.5);doc.setTextColor(90);
      doc.text(pdfSafe('Critère du PMS : 63 °C à cœur atteints en moins d’1 heure. Conservation du registre : 3 ans minimum (règle HACCP).'),14,y);doc.setTextColor(30);y+=5;
      const rows=[{head:true,cells:['Date','Plat','Mise en chauffe','Fin de réchauffe','Mixage','Conforme','Observation','Visa']}];
      if(j.rows.length)j.rows.forEach(x=>rows.push({cells:pmsMoisLigne(x)}));
      else rows.push({cells:['','Aucun relevé ce mois-ci','','','','','','']});
      y=pdfGrid(doc,14,y,[20,52,30,30,20,18,72,27],rows,{fs:8,minH:7});
      if(y>255){doc.addPage();y=pdfLogo(doc,20);}
      y+=8;doc.setFontSize(9);doc.setFont(undefined,'bold');
      doc.text(pdfSafe('Vu par la direction le '+'.'.repeat(14)+'      Nom et signature :'),14,y);
      doc.setDrawColor(200);doc.rect(110,y-4,90,18);
    });
    pdfSortie(doc,fichier+'.pdf');
  }catch(e){
    console.error('[pmsExporterMois]',e);
    toast('Export impossible : '+((e&&e.message)||'erreur'),true);
  }
}
function pmsArchiveHtml(){
  if(!IS_DIRECTION)return '';
  return `<div class="txtbox" style="margin-top:10px"><b>Archive mensuelle — direction</b><br>
    La règle HACCP demande de garder ces relevés <b>3 ans</b> : ils restent enregistrés (aucune suppression automatique). Chaque mois, exportez le registre et classez le PDF avec le PMS.
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
      <div><label>Mois</label><input type="month" id="pmsMois" value="${pmsMoisDefaut()}" max="${new Date().toISOString().slice(0,7)}"></div>
      <button type="button" class="btn" onclick="pmsExporterMois('pdf',false)">PDF de la crèche choisie</button>
      <button type="button" class="btn" onclick="pmsExporterMois('pdf',true)">PDF toutes les crèches</button>
      <button type="button" class="btn" onclick="pmsExporterMois('csv',true)">CSV toutes les crèches</button>
    </div></div>`;
}
function pmsCrecheChoisie(){
  const nom=(document.getElementById('ff_creche')||{}).value||'';
  return (CRECHES||[]).find(c=>(c.name||'').trim()===nom)||null;
}
const pmsHeure=h=>String(h||'').slice(0,5);
const pmsDateFr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
function pmsValeurs(cr,cap){
  const et=etabDe(cr.id);
  const n=cap&&cap.capacity?Number(cap.capacity):0, s=cap&&cap.capacity_surnombre?Number(cap.capacity_surnombre):0;
  const horaires=(et.heure_ouverture||et.heure_fermeture)?pmsHeure(et.heure_ouverture)+' – '+pmsHeure(et.heure_fermeture):'';
  return {
    pms_adresse:cr.addr||et.adresse_site||'',
    pms_gest:et.raison_sociale||'',
    pms_siret:et.siret||'',
    pms_rep:[et.representant_nom,et.representant_qualite].filter(Boolean).join(', '),
    pms_tel:et.telephone||'',
    pms_mail:et.email||'',
    pms_pmi:[et.pmi_numero,et.pmi_date?'du '+pmsDateFr(et.pmi_date):''].filter(Boolean).join(' '),
    pms_cap:n?n+' enfants'+(s&&s>n?' (jusqu’à '+s+' en surnombre autorisé)':''):'',
    pms_horaires:horaires
  };
}
/* force=false : ne remplit que les champs vides ou encore égaux à la valeur auto ;
   force=true : remplace tout (bouton « Recharger »). */
async function pmsPrefill(force){
  const cr=pmsCrecheChoisie();
  const note=document.getElementById('pms-auto-note');
  if(!cr){const nb=document.getElementById('pms-nett');if(nb)nb.innerHTML=pmsNettHtml();const nr=document.getElementById('pms-remise');if(nr)nr.innerHTML=pmsRemiseHtml();if(note)note.textContent='Choisissez une crèche : ses informations (adresse, SIRET, agrément PMI, capacité…) se remplissent seules.';return;}
  pmsMajNett();
  const cap=await pmsChargerCap(cr.id);
  /* la crèche a changé pendant la lecture : on laisse la dernière demande finir */
  const choisie=pmsCrecheChoisie();
  if(!choisie||String(choisie.id)!==String(cr.id))return;
  const val=pmsValeurs(cr,cap);
  let n=0;
  PMS_AUTO.forEach(id=>{
    const el=document.getElementById('ff_'+id),v=val[id];
    if(!el||!v)return;
    if(force||!el.value||el.dataset.auto==='1'){el.value=v;el.dataset.auto='1';n++;}
  });
  const sansFiche=!etabDe(cr.id).creche_id;
  if(note)note.textContent=sansFiche
    ?'La fiche établissement de cette crèche n’est pas encore renseignée : complétez Paramètres › Les établissements pour que le reste se remplisse seul.'
    :'Informations lues dans Paramètres › Les établissements pour « '+cr.name+' ». Chaque champ reste modifiable ; un champ corrigé à la main n’est plus écrasé.';
  return n;
}
/* Une réponse par crèche. Si la saisie ouverte appartient déjà à une autre crèche,
   changer de crèche ne la réécrit jamais : on ouvre le plan existant de la nouvelle
   crèche, ou on démarre un plan vierge pour elle. Le plan de l'ancienne crèche,
   déjà enregistré, n'est pas touché. */
let PMS_CRECHE_FORCEE='';
async function pmsCrecheChanged(){
  const cr=pmsCrecheChoisie();
  if(cr&&fillRep&&fillRep.creche_id&&String(fillRep.creche_id)!==String(cr.id)){
    const ancienne=(CRECHES||[]).find(c=>String(c.id)===String(fillRep.creche_id));
    const ancNom=ancienne?ancienne.name:'l’autre crèche';
    const{data}=await sb.from('documents_reponses').select('id')
      .eq('document_id',fillDoc.id).eq('creche_id',cr.id).is('enfant_id',null)
      .order('updated_at',{ascending:false}).limit(1);
    const existante=data&&data[0];
    const msg=existante
      ?'Un plan existe déjà pour « '+cr.name+' ». L’ouvrir ? Les modifications non enregistrées du plan de « '+ancNom+' » seront perdues ; son plan enregistré n’est pas touché.'
      :'Démarrer un nouveau plan pour « '+cr.name+' » ? Les modifications non enregistrées du plan de « '+ancNom+' » seront perdues ; son plan enregistré n’est pas touché.';
    if(!confirm(msg)){
      const sel=document.getElementById('ff_creche');if(sel)sel.value=ancienne?ancienne.name:'';
      return;
    }
    if(existante){await openFill(fillDoc.id,existante.id);return;}
    PMS_CRECHE_FORCEE=cr.name;fillRep=null;
    try{resetFillForm();}finally{PMS_CRECHE_FORCEE='';}
    return;
  }
  pmsPrefill(false);
}
async function pmsRecharger(){
  if(!pmsCrecheChoisie())return toast('Choisissez d’abord une crèche');
  if(!confirm('Recharger les informations de la crèche ? Les champs d’identité saisis à la main seront remplacés.'))return;
  await pmsPrefill(true);toast('Informations rechargées');
}

const PMS_CSS=`<style>
.tpl.pms table.ft td.x{width:40px;text-align:center}
.tpl.pms table.ft textarea{width:100%;font-size:12.5px;line-height:1.45;border:1px solid var(--border);border-radius:6px;padding:5px 7px;resize:vertical;min-height:52px}
.tpl.pms .pms-b{border:0;background:transparent;color:#B03A2E;cursor:pointer;font-size:16px;padding:4px}
.tpl.pms textarea.pms-txt,.tpl.pms>textarea{width:100%;font-size:13px;line-height:1.55}
.tpl.pms .auto-note{font-size:12.5px;color:var(--muted);margin:0 0 12px}
</style>`;

TPL.pms_sanitaire={
 fields:PMS_FIELDS,
 large:true,
 html:v=>{
  PMS_ST=pmsCharger(v.pms_json);
  const noms=(CRECHES||[]).map(c=>c.name);
  let nom=v.creche||PMS_CRECHE_FORCEE||'';
  /* un(e) référent(e) ouvre le modèle sur sa propre crèche */
  if(!nom&&typeof PROF!=='undefined'&&PROF&&PROF.creche_id){
    const mine=(CRECHES||[]).find(c=>String(c.id)===String(PROF.creche_id));if(mine)nom=mine.name;
  }
  return `<div class="tpl pms">${FT_CSS}${PMS_CSS}
  <h3>Plan de maîtrise sanitaire</h3>
  <input type="hidden" id="ff_pms_json" value="${esc(v.pms_json)}">
  <div class="grid2">
    <div class="f"><label>Crèche</label><select id="ff_creche" onchange="pmsCrecheChanged()"><option value=""></option>${noms.map(n=>`<option${nom===n?' selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="f"><label>Date</label>${inHtml('pms_date',v.pms_date||new Date().toISOString().slice(0,10),'date')}</div>
  </div>
  <div class="f"><label>PMS — N° / version</label>${inHtml('pms_version',v.pms_version)}</div>
  <p class="auto-note" id="pms-auto-note"></p>
  <div style="margin:0 0 12px"><button type="button" class="btn btn-g" onclick="pmsRecharger()"><i class="ti ti-refresh"></i> Recharger les informations de la crèche</button></div>

  <h3>1. Présentation de l’établissement</h3>
  <div class="f"><label>Adresse du site</label>${inHtml('pms_adresse',v.pms_adresse)}</div>
  <div class="grid2">
    <div class="f"><label>Gestionnaire</label>${inHtml('pms_gest',v.pms_gest)}</div>
    <div class="f"><label>SIRET</label>${inHtml('pms_siret',v.pms_siret)}</div>
  </div>
  <div class="f"><label>Représentant du gestionnaire</label>${inHtml('pms_rep',v.pms_rep)}</div>
  <div class="grid2">
    <div class="f"><label>Téléphone</label>${inHtml('pms_tel',v.pms_tel,'tel')}</div>
    <div class="f"><label>E-mail</label>${inHtml('pms_mail',v.pms_mail,'email')}</div>
  </div>
  <div class="grid2">
    <div class="f"><label>Agrément PMI</label>${inHtml('pms_pmi',v.pms_pmi)}</div>
    <div class="f"><label>Capacité d’accueil</label>${inHtml('pms_cap',v.pms_cap)}</div>
  </div>
  <div class="grid2">
    <div class="f"><label>Horaires d’ouverture</label>${inHtml('pms_horaires',v.pms_horaires)}</div>
    <div class="f"><label>Repas servis par jour</label>${inHtml('pms_repas_jour',v.pms_repas_jour)}</div>
  </div>
  <div class="grid2">
    <div class="f"><label>Responsable du PMS</label>${inHtml('pms_resp',v.pms_resp)}</div>
    <div class="f"><label>Référent·e hygiène du site</label>${inHtml('pms_hyg',v.pms_hyg)}</div>
  </div>
  <div class="grid2">
    <div class="f"><label>Prestataire repas</label>${inHtml('pms_presta',v.pms_presta||PMS_PRESTA)}</div>
    <div class="f"><label>Déclaration d’activité auprès de la DDPP (date)</label>${inHtml('pms_ddpp_date',v.pms_ddpp_date,'date')}</div>
  </div>
  <p class="hint" style="font-size:13px;font-style:normal">Tout le contenu ci-dessous est modifiable pour l’adapter à votre structure. Remplacez les passages entre [crochets]. Chaque bouton « Revenir au modèle » restaure le contenu type.</p>
  ${pmsTxtHtml('intro',3)}

  ${pmsTblBloc('bp')}

  <h3>Nettoyage des jeux et des espaces de vie</h3>
  <p class="hint" style="font-size:13px;font-style:normal">Traçabilité tenue dans l’application Stock (onglet Nettoyages) : plan de la crèche et registre horodaté.</p>
  <div id="pms-nett"></div>

  <h3>3. Flux de l’activité et analyse des dangers (HACCP)</h3>
  ${pmsTxtHtml('flux',8)}
  ${pmsTxtHtml('danger',3)}
  <div id="pms-t-hz">${pmsTblHtml('hz')}</div>
  <h3>Remise en température : relevés des 14 derniers jours</h3>
  <p class="hint" style="font-size:13px;font-style:normal">Registre tenu en ligne dans l’Accès terrain (tuile « Remise en température »), en complément de la fiche 3 papier vierge (annexe du PDF) : plat, températures et heures, conformité, visa.</p>
  <div id="pms-remise"></div>
  ${pmsArchiveHtml()}
  ${pmsTxtHtml('sonde',3)}
  ${pmsTblBloc('so')}

  <h3>4. Traçabilité</h3>
  ${pmsTxtHtml('trace',6)}
  <div id="pms-t-tr">${pmsTblHtml('tr')}</div>
  ${pmsTxtHtml('retrait',8)}

  <h3>5. Fiches d’enregistrement</h3>
  <p class="hint" style="font-size:13px;font-style:normal">Cinq fiches vierges (réception et traçabilité, température du réfrigérateur, contrôle de la remise en températures, nettoyage, vérification de la sonde) sont ajoutées à l’export PDF, à imprimer et à classer dans le PMS.</p>

  ${pmsTblBloc('nc')}
  ${pmsTblBloc('ct')}
  ${pmsTblBloc('fo')}

  <h3>Validation du PMS</h3>
  <div class="grid2">
    ${sigBoxHtml('direction','Direction')}
    ${sigBoxHtml('referent','Référent(e) hygiène')}
  </div>
 </div>`;
 },
 mount:()=>{
  ['direction','referent'].forEach(mountSig);
  /* un champ retouché à la main n'est plus remplacé par le pré-remplissage */
  PMS_AUTO.forEach(id=>{
    const el=document.getElementById('ff_'+id);
    if(el)el.addEventListener('input',()=>{el.dataset.auto='';});
  });
  /* crèche déjà connue (référent, réponse reprise) : on complète les champs vides */
  pmsPrefill(false);
 },
 pdf:doc=>{
  const g=id=>{const e=document.getElementById('ff_'+id);return e?String(e.value||'').trim():'';};
  const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
  const dots=n=>'.'.repeat(n);
  const W=182,M=14;let y=pdfLogo(doc,20);
  const nom=g('creche');
  const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
  const P=(t,size,bold,x,col)=>{
    doc.setFontSize(size||10);doc.setFont(undefined,bold?'bold':'normal');
    if(col)doc.setTextColor(col[0],col[1],col[2]);
    const L=doc.splitTextToSize(pdfSafe(t),W-((x||M)-M));need(L.length*4.8+3);
    doc.text(L,x||M,y);y+=L.length*4.8+2.5;doc.setTextColor(30);
  };
  const bloc=txt=>String(txt||'').split(/\r?\n/).forEach(l=>{
    const t=l.trim();if(!t)return;
    if(t[0]==='→')P(t,10,true);
    else if(t[0]==='-')P(t,10,false,M+4);
    else if(t[0]==='*')P(t,8.5,false,M,[110,110,110]);
    else P(t,10);
  });
  const H=t=>{need(14);y+=2;P(t,11.5,true,M,[74,63,159]);};
  const tbl=k=>{
    const T=PMS_TABLES[k],w=T.cols.map(c=>W*c[1]/100);
    const rows=PMS_ST.t[k].filter(r=>r.some(c=>String(c||'').trim()));
    y=pdfGrid(doc,M,y,w,[{head:true,cells:T.cols.map(c=>c[0])}].concat(rows.map(r=>T.cols.map((c,j)=>r[j]||''))),{fs:8.5,minH:8});
    y+=4;
  };
  const val=(v,n)=>v||dots(n||30);

  /* ---------- Titre et identité ---------- */
  doc.setFontSize(16);doc.setFont(undefined,'bold');
  doc.text('Plan de maîtrise sanitaire',M,y+2);y+=9;
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(90);
  doc.text(pdfSafe('Date : '+(dfr(g('pms_date'))||dots(10))+'     PMS N° / version : '+(g('pms_version')||dots(10))+(nom?'     '+nom:'')),M,y);
  doc.setTextColor(30);y+=8;
  H('1. PRÉSENTATION DE L’ÉTABLISSEMENT');
  bloc(PMS_ST.txt.intro);
  y=pdfGrid(doc,M,y,[58,124],[
    ['Site',nom],['Adresse',g('pms_adresse')],['Gestionnaire',g('pms_gest')],['SIRET',g('pms_siret')],
    ['Représentant',g('pms_rep')],['Téléphone',g('pms_tel')],['E-mail',g('pms_mail')],
    ['Agrément PMI',g('pms_pmi')],['Capacité d’accueil',g('pms_cap')],['Horaires d’ouverture',g('pms_horaires')],
    ['Repas servis par jour',g('pms_repas_jour')],['Responsable du PMS',g('pms_resp')],['Référent·e hygiène',g('pms_hyg')],
    ['Prestataire repas',g('pms_presta')],['Déclaration DDPP',dfr(g('pms_ddpp_date'))]
  ].map(r=>({cells:[r[0],r[1]||'']})),{minH:7});
  y+=4;

  /* ---------- 2. Bonnes pratiques ---------- */
  H('2. BONNES PRATIQUES D’HYGIÈNE');
  tbl('bp');
  {
    const cr=pmsCrecheChoisie(),d=cr&&PMS_NETT[pmsNettCle(cr)];
    need(24);P('Nettoyage des jeux et des espaces de vie',10,true);
    if(!d||d.erreur||!d.plan.length){
      P(!d?'Registre non chargé : ouvrez le document après avoir choisi la crèche.':d.erreur?'Registre des nettoyages indisponible à la génération de ce document.':'Aucun plan de nettoyage défini pour cette crèche dans l’application Stock.',9);
      y+=2;
    }else{
      const syn=pmsNettSynthese(d);
      y=pdfGrid(doc,M,y,[24,46,28,20,26,38],[{head:true,cells:['Type','Jeux / espace','Fréquence','Fait (30 j)','Dernier','Fait par']}]
        .concat(syn.map(l=>({cells:[PMS_NETT_TYPE[l.type]||l.type,l.libelle,l.freq,String(l.n),l.der,l.par]}))),{fs:8,minH:7});
      y+=3;
      const lim=pmsNettJoursAvant(14),det=d.journal.filter(x=>x.fait_le>=lim);
      P('Détail des 14 derniers jours ('+det.length+' nettoyage'+(det.length>1?'s':'')+')',9,true);
      if(det.length)y=pdfGrid(doc,M,y,[20,52,38,32,40],[{head:true,cells:['Date','Jeux / espace','Fait par','Produit','Observation']}]
        .concat(det.map(x=>({cells:[new Date(x.fait_le+'T12:00:00').toLocaleDateString('fr-FR'),x.libelle,x.fait_par||'non renseigné',x.produit||'',x.observation||'']}))),{fs:8,minH:7});
      else P('Aucun nettoyage enregistré sur la période.',9);
      y+=4;
    }
  }

  /* ---------- 3. Flux et dangers ---------- */
  H('3. FLUX DE L’ACTIVITÉ ET ANALYSE DES DANGERS (HACCP)');
  String(PMS_ST.txt.flux||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach((l,i)=>P((i+1)+'. '+l,10,false,M+3));
  bloc(PMS_ST.txt.danger);
  tbl('hz');
  {
    const cr=pmsCrecheChoisie(),d=cr&&PMS_REMISE[pmsNettCle(cr)];
    need(24);P('Remise en température : relevés des 14 derniers jours',10,true);
    if(!d||d.erreur){
      P(!d?'Registre non chargé : ouvrez le document après avoir choisi la crèche.':'Registre de remise en température indisponible à la génération de ce document.',9);
      y+=2;
    }else{
      const l=pmsRemiseLignes(d,14),nc=l.filter(r=>r[5]==='Non').length;
      P(l.length+' plat'+(l.length>1?'s':'')+' relevé'+(l.length>1?'s':'')+', dont '+nc+' non conforme'+(nc>1?'s':'')+' (critère : 63 °C à cœur en moins d’1 heure).',9);
      if(l.length)y=pdfGrid(doc,M,y,[18,36,24,24,16,14,32,18],[{head:true,cells:['Date','Plat','Mise en chauffe','Fin de réchauffe','Mixage','Conf.','Observation','Visa']}]
        .concat(l.map(r=>({cells:r}))),{fs:7.5,minH:7});
      else P('Aucun relevé sur la période : saisie dans Accès terrain › Remise en température.',9);
      y+=4;
    }
  }
  P('Contrôle de la sonde de température',10.5,true);
  bloc(PMS_ST.txt.sonde);
  tbl('so');

  /* ---------- 4. Traçabilité ---------- */
  H('4. TRAÇABILITÉ');
  bloc(PMS_ST.txt.trace);
  tbl('tr');
  bloc(PMS_ST.txt.retrait);

  /* ---------- 6. Non-conformités ---------- */
  H('6. NON-CONFORMITÉS, TIAC ET ALERTES');
  tbl('nc');
  P('Contacts utiles',10.5,true);
  tbl('ct');

  /* ---------- 7. Formation ---------- */
  H('7. FORMATION, VÉRIFICATION ET MISE À JOUR');
  tbl('fo');

  /* ---------- Validation ---------- */
  need(52);
  doc.setFontSize(10);doc.setFont(undefined,'bold');doc.text('Validation du PMS',M,y);y+=5;
  [['direction','Direction',M],['referent','Référent(e) hygiène',M+96]].forEach(([role,lab,px])=>{
    doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(lab+' :',px,y+2);
    doc.setDrawColor(200);doc.rect(px,y+4,86,32);
    if(SIGS[role]){try{doc.addImage(SIGS[role],'PNG',px+2,y+6,82,28);}catch(e){}}
  });
  y+=40;

  /* ---------- 5. Fiches d'enregistrement vierges ---------- */
  PMS_FICHES.forEach(f=>{
    doc.addPage();y=pdfLogo(doc,20);
    doc.setFontSize(13);doc.setFont(undefined,'bold');doc.text(pdfSafe(f[0]),M,y+2);y+=8;
    doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(90);
    doc.text(pdfSafe((nom?nom+' · ':'')+'PMS '+(g('pms_version')||'')),M,y);doc.setTextColor(30);y+=5;
    const rows=[{head:true,cells:f[1]}];
    if(f[3]){
      /* fiche hebdomadaire : cinq lignes par jour (jour inscrit sur la première) */
      doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(pdfSafe('SEMAINE DU '+dots(14)+' AU '+dots(14)+'      SEM : '+dots(4)),M,y+1);y+=6;doc.setFont(undefined,'normal');
      f[3].forEach(j=>{for(let i=0;i<5;i++)rows.push(f[1].map((c,k)=>k===0&&i===0?j:''));});
    }else for(let i=0;i<22;i++)rows.push(f[1].map(()=>''));
    y=pdfGrid(doc,M,y,f[2],rows,{fs:f[3]?7.5:8.5,minH:f[3]?8.4:9});
  });

  pdfSortie(doc,slug(fillDoc.titre)+(nom?'_'+slug(nom):'')+'.pdf');
  return true;
 }
};
TPL_LABELS.pms_sanitaire='Plan de maîtrise sanitaire — PMS (établissement)';
