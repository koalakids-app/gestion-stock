
// ── Structure du modèle PMI officiel (feuille « Feuil1 » du classeur embarqué) ──
// Le classeur PMI n'est pas régulier : les blocs de jours ne sont pas espacés de la même
// façon et lundi/mardi n'ont pas la ligne « Nombre d'enfants accueillis » des autres jours.
// On ne redessine donc rien : on remplit les lignes existantes, repérées ici une fois pour
// toutes. `nom` = ligne d'en-tête NOM/prénom, `staff` = première/dernière ligne utilisable
// pour les salarié·e·s, `total` = ligne « Hors encadrement » qui porte les totaux.
// `enfants` = ligne « Nombre d'enfants accueillis ». Elle existe pour les cinq jours, mais
// le modèle a oublié d'en écrire le libellé pour lundi et mardi : on le rétablit au
// remplissage (la mise en forme, elle, est bien présente dans le gabarit).
const PMI_TPL_DAYS=[
  {jour:0, nom:8,  staffFirst:9,  staffLast:14, enfants:15, total:16},
  {jour:1, nom:22, staffFirst:23, staffLast:28, enfants:29, total:30},
  {jour:2, nom:41, staffFirst:42, staffLast:47, enfants:48, total:49},
  {jour:3, nom:56, staffFirst:57, staffLast:62, enfants:63, total:64},
  {jour:4, nom:73, staffFirst:74, staffLast:79, enfants:80, total:81}
];
const PMI_LIBELLE_ENFANTS="Nombre d'enfants accueillis";
const PMI_LIBELLE_DIRECTION='Direction';
const PMI_LIBELLE_ENTRETIEN='Entretien/restauration';
const PMI_TPL_COL_FIRST=4;      // D = 07h00-07h15
const PMI_TPL_COL_LAST=51;      // AY = 18h45-19h00
const PMI_TPL_COL_DIPLOME=52;   // AZ « Nbre heures personnel diplômé * »
const PMI_TPL_COL_QUALIFIE=53;  // BA « Nbre heures personnel qualifié ** »
const PMI_TPL_MAX_STAFF=PMI_TPL_DAYS.reduce((n,d)=>Math.min(n,d.staffLast-d.staffFirst+1),99);

// ATTENTION : ne jamais écrire `cell.fill = …` sur une cellule issue du modèle.
// ExcelJS renvoie pour `cell.style` l'objet de style PARTAGÉ par toutes les cellules qui
// utilisent la même mise en forme, et le raccourci `cell.fill = …` modifie cet objet en
// place : colorier un créneau repeignait donc, en silence, toutes les cellules vides de la
// grille (mêmes bordures = même style). On réaffecte donc toujours un style neuf.
function pmiPeindre(cell,argb){
  cell.style=Object.assign({},cell.style,{fill:{type:'pattern',pattern:'solid',fgColor:{argb:argb}}});
}
function pmiEffacerFond(cell){
  const f=cell.fill;
  if(f&&f.pattern&&f.pattern!=='none')cell.style=Object.assign({},cell.style,{fill:{type:'pattern',pattern:'none'}});
}

/* ── Nombre d'enfants accueillis ───────────────────────────────────────────
   La ligne se déduit des présences enfants déjà enregistrées (import Gertrude ou
   pointage), en comptant pour chaque quart d'heure les enfants présents.

   `presences` porte une ligne par demi-journée (slot M / A) avec, lorsque l'import a
   pu les lire, les horaires réels d'arrivée et de départ. On applique le même ordre de
   priorité que la feuille de présence hebdomadaire :
     1. les horaires réellement enregistrés ce jour-là ;
     2. à défaut ceux du contrat d'accueil couvrant cette date, ramenés à la demi-journée
        concernée quand l'enfant n'est présent que le matin ou que l'après-midi (le contrat
        décrit une journée entière, le prendre tel quel gonflerait le comptage) ;
     3. sans horaire ni contrat exploitable, l'enfant ne peut pas être situé sur la grille :
        il n'est pas compté, et l'export le signale plutôt que d'inventer une amplitude.  */
const PMI_FIN_MATIN=12*60+30;
const PMI_DEBUT_APREM=13*60+30;

function pmiHeureEnMinutes(t){
  const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));
  return m?parseInt(m[1],10)*60+parseInt(m[2],10):null;
}

// Contrat d'accueil applicable à un enfant pour une date donnée (le plus récent qui couvre
// à la fois la période et le jour de la semaine).
function pmiContratPour(contrats,enfantId,dateISO){
  const d=new Date(dateISO+'T12:00:00');
  const jourSemaine=d.getDay()===0?7:d.getDay();   // 1 = lundi … 7 = dimanche
  let choisi=null;
  (contrats||[]).forEach(c=>{
    if(c.enfant_id!==enfantId)return;
    if(c.date_debut&&c.date_debut>dateISO)return;
    if(c.date_fin&&c.date_fin<dateISO)return;
    if(ctParseJours(c.jours).indexOf(jourSemaine)<0)return;
    if(!choisi||(c.date_debut||'')>(choisi.date_debut||''))choisi=c;
  });
  return choisi;
}

async function pmiChargerPresencesEnfants(crecheId,weeks){
  const res={parDate:{},sansHoraire:0};
  try{
    let enfants=(typeof cacheEnfants!=='undefined'?cacheEnfants:[]).filter(e=>e.creche_id===crecheId);
    if(!enfants.length){
      const{data}=await sb.from('enfants').select('id,creche_id').eq('creche_id',crecheId);
      enfants=data||[];
    }
    const ids=enfants.map(e=>e.id);
    if(!ids.length)return res;

    const dates=[];
    weeks.forEach(w=>(w.dates||[]).forEach(d=>{if(dates.indexOf(d)<0)dates.push(d);}));
    if(!dates.length)return res;

    const{data:pres}=await sb.from('presences').select('*').in('presence_date',dates).in('enfant_id',ids);
    if(!pres||!pres.length)return res;

    let contrats=[];
    try{
      const{data}=await sb.from('enfants_contrats').select('*').in('enfant_id',ids);
      contrats=data||[];
    }catch(e){/* table absente : on se contente des horaires enregistrés */}

    // Les deux demi-journées d'un même enfant sont fusionnées en une seule plage.
    const parEnfantDate={};
    pres.forEach(p=>{
      if(p.status!=='present'&&p.status!=='partial')return;
      const k=p.enfant_id+'_'+p.presence_date;
      const o=parEnfantDate[k]||(parEnfantDate[k]={enfant:p.enfant_id,date:p.presence_date,matin:false,aprem:false,hd:null,hf:null});
      const slot=String(p.slot||'').toUpperCase();
      if(slot==='M')o.matin=true;
      if(slot==='A')o.aprem=true;
      const hd=pmiHeureEnMinutes(p.heure_debut),hf=pmiHeureEnMinutes(p.heure_fin);
      if(hd!==null&&(o.hd===null||hd<o.hd))o.hd=hd;
      if(hf!==null&&(o.hf===null||hf>o.hf))o.hf=hf;
    });

    Object.keys(parEnfantDate).forEach(k=>{
      const o=parEnfantDate[k];
      let deb=o.hd,fin=o.hf;
      if(deb===null||fin===null){
        const ct=pmiContratPour(contrats,o.enfant,o.date);
        if(ct){
          deb=pmiHeureEnMinutes(ct.heure_debut);
          fin=pmiHeureEnMinutes(ct.heure_fin);
          if(deb!==null&&fin!==null){
            if(o.matin&&!o.aprem)fin=Math.min(fin,PMI_FIN_MATIN);
            if(o.aprem&&!o.matin)deb=Math.max(deb,PMI_DEBUT_APREM);
          }
        }
      }
      if(deb===null||fin===null||fin<=deb){res.sansHoraire++;return;}
      (res.parDate[o.date]||(res.parDate[o.date]=[])).push([deb,fin]);
    });
  }catch(e){
    console.warn('[PMI] présences enfants indisponibles :',e);
  }
  return res;
}

// Nombre d'enfants présents sur chacun des 48 quarts d'heure de 7h à 19h.
function pmiComptesParQuart(intervalles){
  const comptes=[];
  for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
    const debut=7*60+(c-PMI_TPL_COL_FIRST)*15,fin=debut+15;
    let n=0;
    (intervalles||[]).forEach(iv=>{if(iv[0]<fin&&iv[1]>debut)n++;});
    comptes.push(n);
  }
  return comptes;
}

/* ── Bloc récapitulatif et contrôles réglementaires ────────────────────────
   Le bas du tableau PMI est un petit tableau à deux colonnes dont les en-têtes sont
   « Nbre d'heures d'encadrement des enfants » (AL) et « Taux d'encadrement » (AU),
   pour les trois lignes « Personnel diplômé » (92), « Personnel qualifié » (93) et
   « Total hebdomadaire » (94). Tout s'en déduit des heures déjà calculées jour par jour.

   Les contrôles reprennent les deux textes que le modèle cite lui-même :
     · art. R2324-42 : le personnel du 1° (diplômé) doit représenter au moins 40 % de
       l'effectif — donc des heures d'encadrement ;
     · art. R2324-43-1 : en micro-crèche, l'effectif ne peut être inférieur à deux
       professionnels dès la présence de quatre enfants.
   S'y ajoute le dépassement de la capacité d'accueil de la fiche crèche.

   Le taux « un professionnel pour cinq enfants qui ne marchent pas / huit qui marchent »
   n'est volontairement pas contrôlé : l'application ne sait pas quels enfants marchent,
   et l'inventer donnerait une conformité fausse. */
const PMI_MINI_PROS=2;
const PMI_ENFANTS_DECLENCHEUR=4;
const PMI_PART_DIPLOME_MINI=40;
const PMI_NOMS_JOURS=['lundi','mardi','mercredi','jeudi','vendredi'];

function pmiHeureDeQuart(i){
  const m=7*60+i*15;
  return String(Math.floor(m/60)).padStart(2,'0')+'h'+String(m%60).padStart(2,'0');
}

// Parcourt les 48 quarts d'heure d'une journée et regroupe les quarts consécutifs qui
// présentent la même anomalie, pour signaler « mardi 12h30–13h00 » plutôt que 48 lignes.
function pmiControlerJournee(nomJour,comptesEnfants,staffParQuart,capacite,anomalies){
  let debut=null,detail=null;
  const clore=fin=>{
    if(debut!==null)anomalies.push(nomJour+' '+pmiHeureDeQuart(debut)+'–'+pmiHeureDeQuart(fin)+' : '+detail);
    debut=null;detail=null;
  };
  for(let i=0;i<comptesEnfants.length;i++){
    const e=comptesEnfants[i]||0,p=staffParQuart[i]||0;
    let d=null;
    if(capacite&&e>capacite)d=e+' enfants accueillis pour une capacité de '+capacite;
    else if(e>=PMI_ENFANTS_DECLENCHEUR&&p<PMI_MINI_PROS)
      d=p+' professionnel'+(p>1?'s':'')+' pour '+e+' enfants (minimum 2 dès 4 enfants)';
    if(d!==detail){clore(i);if(d){debut=i;detail=d;}}
  }
  clore(comptesEnfants.length);
}

/* ── Temps de bureau de la direction / du directeur technique ───────────────
   Ces heures sont travaillées mais ne relèvent pas de l'encadrement : le modèle leur
   réserve la ligne « Direction », sous l'intitulé « Hors encadrement des enfants ». Elles
   sont donc retirées des heures d'encadrement de la personne, du total du jour et du
   décompte servant aux contrôles de taux.

   Placement : on cherche, à l'intérieur des heures réellement travaillées ce jour-là, la
   plage continue où le retrait de la personne pèse le moins sur l'accueil. Sont écartées
   les plages qui laisseraient moins de deux professionnels avec quatre enfants ou plus
   (R2324-43-1), ou plus aucun professionnel alors que des enfants sont présents. Parmi les
   plages restantes, on privilégie celles où le plus de collègues restent sur le terrain,
   puis celles où les enfants sont les moins nombreux — ce qui fait naturellement tomber le
   temps de bureau sur le milieu de journée, quand les équipes du matin et de l'après-midi
   se chevauchent. */
const PMI_PENALITE_INTERDIT=100000;

function pmiSegmentsContigus(cols){
  if(!cols.length)return[];
  const tri=cols.slice().sort((a,b)=>a-b),segs=[];
  let seg=[tri[0]];
  for(let i=1;i<tri.length;i++){
    if(tri[i]===tri[i-1]+1)seg.push(tri[i]);
    else{segs.push(seg);seg=[tri[i]];}
  }
  segs.push(seg);
  return segs;
}

// Répartit le volume hebdomadaire de bureau sur les jours réellement travaillés par la
// personne : 17,5 h sur cinq jours donnent 3,5 h par jour, mais si elle n'est là que quatre
// jours cette semaine-là, le volume se répartit sur ces quatre jours. Le reliquat dû aux
// arrondis au quart d'heure est ajouté aux premiers jours.
function pmiRepartirBureau(weekInfo,prenom,heuresHebdo){
  const quartsParJour=[0,0,0,0,0];
  if(!prenom||!(heuresHebdo>0))return quartsParJour;
  const dispo=[];
  PMI_TPL_DAYS.forEach(day=>{
    const src=weekInfo.rows.find(x=>x.jour===day.jour&&(x.prenom||'').trim()===prenom);
    const res=src?pmiSlotsForRow(src):{cols:[]};
    const n=(res.cols||[]).filter(c=>c>=PMI_TPL_COL_FIRST&&c<=PMI_TPL_COL_LAST).length;
    if(n>0)dispo.push({jour:day.jour,max:n});
  });
  if(!dispo.length)return quartsParJour;
  let restant=Math.round(heuresHebdo*4);
  const base=Math.floor(restant/dispo.length);
  dispo.forEach(d=>{const n=Math.min(base,d.max);quartsParJour[d.jour]=n;restant-=n;});
  // reliquat : on complète jour par jour, sans dépasser les heures travaillées
  for(let tour=0;tour<4&&restant>0;tour++){
    dispo.forEach(d=>{
      if(restant<=0)return;
      if(quartsParJour[d.jour]<d.max){quartsParJour[d.jour]++;restant--;}
    });
  }
  return quartsParJour;
}

// Le retrait de la personne ne doit jamais faire tomber l'accueil sous le minimum légal.
function pmiRetraitInterdit(col,staffParQuart,comptesEnfants){
  const i=col-PMI_TPL_COL_FIRST;
  const enfants=comptesEnfants[i]||0;
  const restants=(staffParQuart[i]||0)-1;
  return(enfants>=PMI_ENFANTS_DECLENCHEUR&&restants<PMI_MINI_PROS)||(enfants>0&&restants<1);
}

/* On ne cherche que des plages SANS infraction : placer du temps de bureau ne doit jamais
   créer un sous-effectif. Si la durée visée n'entre nulle part, on raccourcit la plage
   plutôt que de la caser en force — le volume non placé est signalé à l'utilisateur. */
function pmiChoisirCreneauBureau(colsTravaillees,nbQuarts,staffParQuart,comptesEnfants){
  if(!colsTravaillees.length||nbQuarts<=0)return[];
  const segments=pmiSegmentsContigus(colsTravaillees);
  for(let n=Math.min(nbQuarts,colsTravaillees.length);n>=1;n--){
    let meilleur=null;
    segments.forEach(seg=>{
      if(seg.length<n)return;
      for(let d=0;d+n<=seg.length;d++){
        const fenetre=seg.slice(d,d+n);
        if(fenetre.some(c=>pmiRetraitInterdit(c,staffParQuart,comptesEnfants)))continue;
        let score=0;
        fenetre.forEach(c=>{
          const i=c-PMI_TPL_COL_FIRST;
          score-=((staffParQuart[i]||0)-1)*10;   // laisser le plus de collègues possible
          score+=comptesEnfants[i]||0;           // à équipe égale, les moments les moins chargés
        });
        if(!meilleur||score<meilleur.score)meilleur={score,cols:fenetre};
      }
    });
    if(meilleur)return meilleur.cols;
  }
  return[];
}

/* ── Temps de repas et d'entretien ─────────────────────────────────────────
   Ces heures sont travaillées mais ne relèvent pas non plus de l'encadrement : elles vont
   sur la ligne « Entretien/restauration ». Contrairement au temps de bureau, elles peuvent
   être réparties sur toute l'équipe, et par petits bouts (préparation du repas, service,
   remise en état, ménage du soir).

   Priorité de placement, dans cet ordre :
     1. les quarts d'heure où aucun enfant n'est accueilli — typiquement avant l'ouverture
        aux enfants et après la fermeture, alors que les professionnels sont déjà là : ces
        créneaux ne coûtent rien à l'encadrement ;
     2. à défaut, les moments où le retrait d'une personne laisse le plus de collègues sur
        le terrain, et où les enfants sont les moins nombreux.
   Comme pour le temps de bureau, aucun créneau qui ferait passer sous le minimum légal
   n'est retenu : le volume non plaçable est signalé plutôt que forcé.

   Chaque quart d'heure est confié à une seule personne, celle qui en a le moins assuré
   jusque-là, pour que la charge tourne réellement sur toute l'équipe. */
function pmiColonneDeHeure(hhmm,defaut){
  const m=/^(\d{1,2}):(\d{2})/.exec(String(hhmm||''));
  if(!m)return defaut;
  const min=parseInt(m[1],10)*60+parseInt(m[2],10);
  return PMI_TPL_COL_FIRST+Math.round((min-7*60)/15);
}

function pmiPlacerEntretien(presences,nbQuarts,staffParQuart,comptesEnfants,colOuverture,colFermeture){
  const choix=[];
  if(nbQuarts<=0)return choix;
  const compteur={};
  presences.forEach(x=>{compteur[x.prenom]=0;});

  const candidats=[];
  for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
    const i=c-PMI_TPL_COL_FIRST;
    const enfants=comptesEnfants[i]||0;
    // La priorité se fonde sur les horaires d'accueil DÉCLARÉS, pas sur l'absence d'enfants
    // enregistrés : une semaine dont les présences n'ont pas été importées ne doit pas passer
    // pour une semaine sans enfants. La légalité du retrait, elle, reste évaluée sur les
    // effectifs réels juste en dessous.
    const horsAccueil=(c<colOuverture||c>=colFermeture)?1:0;
    if(!presences.some(x=>x.cols.indexOf(c)>=0))continue;
    const restants=(staffParQuart[i]||0)-1;
    const interdit=!horsAccueil&&((enfants>=PMI_ENFANTS_DECLENCHEUR&&restants<PMI_MINI_PROS)||(enfants>0&&restants<1));
    if(interdit)continue;
    candidats.push({col:c,horsAccueil:horsAccueil,enfants:enfants,restants:restants});
  }
  candidats.sort((a,b)=>(b.horsAccueil-a.horsAccueil)||(b.restants-a.restants)
                       ||(a.enfants-b.enfants)||(a.col-b.col));

  // Les quarts retenus sont regroupés en blocs continus, chacun confié à UNE personne :
  // sans cela l'attribution alternait toutes les 15 minutes et découpait les lignes
  // individuelles en peigne, ce qui ne correspond à aucune organisation réelle.
  const retenus=candidats.slice(0,nbQuarts).map(c=>c.col).sort((a,b)=>a-b);
  pmiSegmentsContigus(retenus).forEach(seg=>{
    let i=0;
    while(i<seg.length){
      const dispo=presences.filter(x=>x.cols.indexOf(seg[i])>=0)
        .sort((a,b)=>compteur[a.prenom]-compteur[b.prenom]);
      if(!dispo.length){i++;continue;}
      const qui=dispo[0];
      let j=i;
      // bloc de 2 h au plus, pour que la charge tourne quand l'équipe le permet
      while(j<seg.length&&j-i<8&&qui.cols.indexOf(seg[j])>=0){
        choix.push({col:seg[j],prenom:qui.prenom});
        compteur[qui.prenom]++;
        j++;
      }
      i=(j>i)?j:i+1;
    }
  });
  return choix;
}

function pmiEcrireRecap(ws,stats,capacite){
  const arrondi=x=>Math.round(x*100)/100;
  const total=stats.heuresDiplome+stats.heuresQualifie;
  if(stats.heuresOuverture)ws.getCell('O92').value=arrondi(stats.heuresOuverture);
  if(capacite)ws.getCell('O93').value=capacite;
  ws.getCell('AL92').value=arrondi(stats.heuresDiplome);
  ws.getCell('AL93').value=arrondi(stats.heuresQualifie);
  ws.getCell('AL94').value=arrondi(total);
  const pourcent=v=>total?(Math.round(v/total*1000)/10)+' %':'';
  ws.getCell('AU92').value=pourcent(stats.heuresDiplome);
  ws.getCell('AU93').value=pourcent(stats.heuresQualifie);
  ws.getCell('AU94').value=total?'100 %':'';
  return total?stats.heuresDiplome/total*100:null;
}

function pmiB64ToArrayBuffer(b64){
  const bin=atob(b64), out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out.buffer;
}

// Duplique une feuille à l'identique (le modèle sert de base à chaque semaine exportée).
// Les fusions doivent être appliquées AVANT les styles : ExcelJS réinitialise le style des
// cellules intérieures d'une plage au moment du merge, ce qui faisait disparaître les
// bordures droite/bas de toutes les cellules fusionnées du modèle.
function pmiCloneSheet(wb,src,name){
  const ws=wb.addWorksheet(name,{pageSetup:JSON.parse(JSON.stringify(src.pageSetup||{}))});
  ws.columns=src.columns.map(c=>({width:c.width}));
  (src.model.merges||[]).forEach(m=>{try{ws.mergeCells(m);}catch(e){}});
  src.eachRow({includeEmpty:true},(row,rn)=>{
    const nr=ws.getRow(rn);
    if(row.height)nr.height=row.height;
    row.eachCell({includeEmpty:true},(cell,cn)=>{
      const nc=nr.getCell(cn);
      if(cell.type!==ExcelJS.ValueType.Merge&&cell.value!==null&&cell.value!==undefined)nc.value=cell.value;
      nc.style=cell.style;
    });
  });
  return ws;
}

// Remplit une feuille (copie vierge du modèle) avec les horaires d'une semaine.
// Les colonnes « NOM/prénom » (B) et « Qualification » (C) du modèle sont étroites et
// n'ont pas le renvoi à la ligne : un intitulé un peu long (« Psychomotricien·ne DE »)
// débordait ou se retrouvait tronqué. On l'active, et on rehausse la ligne juste ce qu'il
// faut — la hauteur du modèle (27) ne tient qu'une seule ligne de texte.
const PMI_LIGNE_PT=15.75;                                   // hauteur d'une ligne en Arial 12
const PMI_CAR_PAR_LIGNE={2:15,3:11};                        // capacité approx. des colonnes B et C
function pmiNbLignes(texte,colonne){
  const max=PMI_CAR_PAR_LIGNE[colonne]||12;
  let lignes=1,courante=0;
  String(texte||'').split(/\s+/).filter(Boolean).forEach(mot=>{
    while(mot.length>max){                                   // mot plus long que la colonne : coupé
      if(courante>0){lignes++;courante=0;}
      lignes++;mot=mot.slice(max);
    }
    if(courante===0)courante=mot.length;
    else if(courante+1+mot.length<=max)courante+=1+mot.length;
    else{lignes++;courante=mot.length;}
  });
  return Math.min(lignes,3);
}
function pmiTexteAvecRenvoi(cell,valeur){
  cell.value=valeur;
  if(!cell.alignment||!cell.alignment.wrapText)
    cell.style=Object.assign({},cell.style,{alignment:Object.assign({},cell.alignment,{wrapText:true})});
}

function pmiFillSheet(ws,weekInfo,crecheName,staffList,qualifMap,nomMap,colorMap,enfantsParDate,capacite,expMap,direction,entretien){
  ws.getCell('B2').value=crecheName;
  ws.getCell('AZ1').value=weekInfo.dateDebut+' - '+weekInfo.dateFin;

  const stats={heuresDiplome:0,heuresQualifie:0,heuresOuverture:0,heuresBureau:0,bureau:[],
                heuresEntretien:0,entretien:[],parPersonne:{},anomalies:[]};
  // Suivi des heures de chacun : le temps de bureau et l'entretien sont PRÉLEVÉS sur les
  // heures déjà planifiées, jamais ajoutés — ce récapitulatif permet de le vérifier et de
  // comparer le total hebdomadaire de chacun à son contrat.
  const compter=(prenom,champ,heures)=>{
    const o=stats.parPersonne[prenom]||(stats.parPersonne[prenom]={planifie:0,encadrement:0,direction:0,entretien:0});
    o[champ]+=heures;
  };

  // Continuité de direction de chaque jour (même règle que le planning équipe à l'écran).
  const continuite=peContinuiteDirection(weekInfo.rows.filter(x=>x.creneau_label),weekInfo.crecheId,weekInfo.semaine);

  PMI_TPL_DAYS.forEach(day=>{
    // 1) remise à zéro : le modèle fourni contient encore quelques valeurs d'un remplissage
    //    manuel antérieur (des totaux en AZ notamment) qu'il ne faut pas laisser passer.
    for(let r=day.staffFirst;r<=day.staffLast;r++){
      ws.getCell(r,2).value=null;
      ws.getCell(r,3).value=null;
      ws.getCell(r,PMI_TPL_COL_DIPLOME).value=null;
      ws.getCell(r,PMI_TPL_COL_QUALIFIE).value=null;
      for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
        const cell=ws.getCell(r,c);
        cell.value=null;
        pmiEffacerFond(cell);
      }
    }
    ws.getCell(day.total,PMI_TPL_COL_DIPLOME).value=null;
    ws.getCell(day.total,PMI_TPL_COL_QUALIFIE).value=null;

    // 2) créneaux de chacun, AVANT toute écriture : le placement du temps de bureau a
    //    besoin de connaître l'équipe présente et l'effectif enfants de la journée.
    const dayRows=weekInfo.rows.filter(x=>x.jour===day.jour);
    const staffParQuart=new Array(PMI_TPL_COL_LAST-PMI_TPL_COL_FIRST+1).fill(0);
    let colMin=null,colMax=null;
    const presences=staffList.slice(0,PMI_TPL_MAX_STAFF).map((p,i)=>{
      const src=dayRows.find(x=>(x.prenom||'').trim()===p);
      const res=src?pmiSlotsForRow(src):{cols:[],minutes:0};
      const cols=(res.cols||[]).filter(c=>c>=PMI_TPL_COL_FIRST&&c<=PMI_TPL_COL_LAST);
      compter(p,'planifie',cols.length*0.25);
      cols.forEach(c=>{
        // Un créneau travaillé = un professionnel présent auprès des enfants
        // (la pause, absente de res.cols, ne compte donc pas dans l'encadrement).
        staffParQuart[c-PMI_TPL_COL_FIRST]++;
        if(colMin===null||c<colMin)colMin=c;
        if(colMax===null||c>colMax)colMax=c;
      });
      return{prenom:p,ligne:day.staffFirst+i,cols:cols};
    });

    const dateISO=(weekInfo.dates||[])[day.jour];
    const comptes=pmiComptesParQuart(enfantsParDate&&dateISO?enfantsParDate[dateISO]:null);

    // 3) temps de bureau de la direction : retiré de l'encadrement, reporté ligne « Direction »
    let colsBureau=[];
    if(direction&&direction.quartsParJour[day.jour]>0){
      const cible=presences.find(x=>x.prenom===direction.prenom);
      if(cible&&cible.cols.length){
        colsBureau=pmiChoisirCreneauBureau(cible.cols,direction.quartsParJour[day.jour],staffParQuart,comptes);
        const retire=new Set(colsBureau);
        cible.cols=cible.cols.filter(c=>!retire.has(c));
        colsBureau.forEach(c=>{staffParQuart[c-PMI_TPL_COL_FIRST]--;});
        compter(direction.prenom,'direction',colsBureau.length*0.25);
      }
    }

    // 3 bis) repas et entretien : répartis sur toute l'équipe, hors encadrement
    let choixEntretien=[];
    if(entretien&&entretien.quarts>0){
      choixEntretien=pmiPlacerEntretien(presences,entretien.quarts,staffParQuart,comptes,
        entretien.colOuverture,entretien.colFermeture);
      choixEntretien.forEach(ch=>{
        const cible=presences.find(x=>x.prenom===ch.prenom);
        if(cible)cible.cols=cible.cols.filter(c=>c!==ch.col);
        staffParQuart[ch.col-PMI_TPL_COL_FIRST]--;
        compter(ch.prenom,'entretien',0.25);
      });
    }

    // 4) écriture des lignes salarié·e·s
    let totalDiplome=0,totalQualifie=0;
    presences.forEach(x=>{
      const p=x.prenom,r=x.ligne;
      const nomAffiche=pmiNomComplet(p,nomMap&&nomMap[p]);
      const qualif=qualifMap[p]||'';
      pmiTexteAvecRenvoi(ws.getCell(r,2),nomAffiche);
      pmiTexteAvecRenvoi(ws.getCell(r,3),qualif);
      const lignes=Math.max(pmiNbLignes(nomAffiche,2),pmiNbLignes(qualif,3));
      const ligne=ws.getRow(r);
      const besoin=lignes*PMI_LIGNE_PT;
      if(besoin>(ligne.height||0))ligne.height=besoin;
      if(!x.cols.length)return;
      const argb=colorMap[p]||'FF3D3580';
      x.cols.forEach(c=>pmiPeindre(ws.getCell(r,c),argb));
      const h=Math.round(x.cols.length*0.25*100)/100;
      compter(p,'encadrement',h);
      const diplome=pmiQualifEstDiplome(qualif,expMap&&expMap[p]);
      ws.getCell(r,diplome?PMI_TPL_COL_DIPLOME:PMI_TPL_COL_QUALIFIE).value=h;
      if(diplome)totalDiplome+=h;else totalQualifie+=h;
    });

    // 5) totaux du jour, sur la ligne « Hors encadrement » comme dans le modèle
    if(totalDiplome)ws.getCell(day.total,PMI_TPL_COL_DIPLOME).value=Math.round(totalDiplome*100)/100;
    if(totalQualifie)ws.getCell(day.total,PMI_TPL_COL_QUALIFIE).value=Math.round(totalQualifie*100)/100;

    // 6) lignes « Direction » et « Entretien/restauration » : le modèle n'en porte le
    //    libellé que le lundi, on le rétablit comme pour la ligne des enfants.
    const rDirection=day.total+1,rEntretien=day.total+2;
    if(!ws.getCell(rDirection,2).value)ws.getCell(rDirection,2).value=PMI_LIBELLE_DIRECTION;
    if(!ws.getCell(rEntretien,2).value)ws.getCell(rEntretien,2).value=PMI_LIBELLE_ENTRETIEN;
    for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
      pmiEffacerFond(ws.getCell(rDirection,c));
      pmiEffacerFond(ws.getCell(rEntretien,c));
    }
    // Bout de ligne : le volume horaire hors encadrement de la journée. Il est écrit dans la
    // seule colonne AZ — la colonne BA reste vide — pour qu'il se lise comme un total de
    // ligne et non comme des heures d'encadrement ventilées diplômé / qualifié.
    ws.getCell(rDirection,PMI_TPL_COL_DIPLOME).value=null;
    ws.getCell(rDirection,PMI_TPL_COL_QUALIFIE).value=null;
    ws.getCell(rEntretien,PMI_TPL_COL_DIPLOME).value=null;
    ws.getCell(rEntretien,PMI_TPL_COL_QUALIFIE).value=null;

    if(colsBureau.length){
      const argb=(direction&&colorMap[direction.prenom])||'FF3D3580';
      colsBureau.forEach(c=>pmiPeindre(ws.getCell(rDirection,c),argb));
      const segs=pmiSegmentsContigus(colsBureau)
        .map(s=>pmiHeureDeQuart(s[0]-PMI_TPL_COL_FIRST)+'–'+pmiHeureDeQuart(s[s.length-1]-PMI_TPL_COL_FIRST+1));
      const hBureau=Math.round(colsBureau.length*0.25*100)/100;
      ws.getCell(rDirection,PMI_TPL_COL_DIPLOME).value=hBureau;
      stats.bureau.push(PMI_NOMS_JOURS[day.jour]+' '+segs.join(' et ')
        +' ('+hBureau+' h)');
      stats.heuresBureau+=colsBureau.length*0.25;
    }

    if(choixEntretien.length){
      choixEntretien.forEach(ch=>pmiPeindre(ws.getCell(rEntretien,ch.col),colorMap[ch.prenom]||'FF3D3580'));
      const segs=pmiSegmentsContigus(choixEntretien.map(ch=>ch.col))
        .map(sg=>pmiHeureDeQuart(sg[0]-PMI_TPL_COL_FIRST)+'–'+pmiHeureDeQuart(sg[sg.length-1]-PMI_TPL_COL_FIRST+1));
      const hEntretien=Math.round(choixEntretien.length*0.25*100)/100;
      ws.getCell(rEntretien,PMI_TPL_COL_DIPLOME).value=hEntretien;
      stats.entretien.push(PMI_NOMS_JOURS[day.jour]+' '+segs.join(', ')
        +' ('+hEntretien+' h)');
      stats.heuresEntretien+=choixEntretien.length*0.25;
    }

    // 6 bis) continuité de direction : écrite sur la ligne « Direction » du document, dans
    //    des cases libres (le texte déborde sur les cases vides à droite). Placée avant le
    //    temps de bureau s'il tient avant, sinon juste après, pour ne pas le recouvrir.
    const contTxt=(continuite[day.jour]||[]).join(' — ');
    if(contTxt){
      const largeur=Math.ceil(contTxt.length/2)+1;   // cases d'un quart d'heure nécessaires, environ
      let colTxt=PMI_TPL_COL_FIRST;
      if(colsBureau.length){
        const cMin=Math.min(...colsBureau),cMax=Math.max(...colsBureau);
        colTxt=(cMin-PMI_TPL_COL_FIRST>=largeur)?PMI_TPL_COL_FIRST:Math.min(cMax+1,PMI_TPL_COL_LAST);
      }
      const cell=ws.getCell(rDirection,colTxt);
      cell.value='Continuité : '+contTxt;
      cell.font={bold:true,name:'Calibri',size:10,color:{argb:'FF000000'}};
      cell.alignment={horizontal:'left',vertical:'middle',wrapText:false};
    }

    // 7) nombre d'enfants accueillis, quart d'heure par quart d'heure
    if(!ws.getCell(day.enfants,2).value)ws.getCell(day.enfants,2).value=PMI_LIBELLE_ENFANTS;
    for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
      const n=comptes[c-PMI_TPL_COL_FIRST];
      ws.getCell(day.enfants,c).value=n>0?n:null;   // hors accueil : case laissée vide
    }

    // 8) cumuls de la semaine et contrôles réglementaires du jour
    stats.heuresDiplome+=totalDiplome;
    stats.heuresQualifie+=totalQualifie;
    // Amplitude d'ouverture : de la première arrivée au dernier départ, pauses incluses.
    if(colMin!==null)stats.heuresOuverture+=(colMax-colMin+1)*0.25;
    pmiControlerJournee(PMI_NOMS_JOURS[day.jour],comptes,staffParQuart,capacite,stats.anomalies);
  });

  const partDiplome=pmiEcrireRecap(ws,stats,capacite);
  if(partDiplome!==null&&partDiplome<PMI_PART_DIPLOME_MINI)
    stats.anomalies.unshift('sur la semaine, '+(Math.round(partDiplome*10)/10)
      +' % des heures d\'encadrement sont assurées par du personnel diplômé (minimum 40 % — art. R2324-42)');

  // Rien d'autre n'est touché : le bloc du lundi n'a pas le libellé « Total des heures
  // d'encadrement » des quatre autres jours, mais l'ajouter obligerait à fusionner AN16:AY16
  // et ferait disparaître le quadrillage de ces cellules. Le modèle reste tel qu'il est.
  return stats;
}

// ExcelJS réécrit la police par défaut du classeur (police n°0) en Calibri 11, alors que le
// modèle PMI utilise Calibri 10. Ce détail n'est pas cosmétique : Excel exprime la largeur
// des colonnes en nombre de caractères de CETTE police, si bien qu'à valeur de largeur
// identique la grille des quarts d'heure sortait sensiblement plus large que sur l'original.
// On rétablit donc la police d'origine dans styles.xml, une fois le classeur écrit.
const PMI_POLICE_DEFAUT='<font><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/><scheme val="minor"/></font>';
async function pmiRestaurerPoliceParDefaut(buffer){
  if(typeof JSZip==='undefined')return buffer;
  try{
    const zip=await JSZip.loadAsync(buffer);
    const f=zip.file('xl/styles.xml');
    if(!f)return buffer;
    const xml=await f.async('string');
    const patched=xml.replace(/(<fonts[^>]*>)<font>[\s\S]*?<\/font>/,'$1'+PMI_POLICE_DEFAUT);
    if(patched===xml)return buffer;
    zip.file('xl/styles.xml',patched);
    // DEFLATE explicite : sans lui JSZip réécrit le classeur sans compression, ce qui fait
    // passer le fichier d'une cinquantaine de Ko à plusieurs centaines.
    return await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE',compressionOptions:{level:6}});
  }catch(e){
    console.warn('[PMI] police par défaut non rétablie :',e);
    return buffer;
  }
}

// Les anomalies restent dans l'application : le fichier remis à la PMI n'est jamais annoté.
function pmiAfficherControles(controles,reserves,capacite){
  const total=controles.reduce((n,c)=>n+c.stats.anomalies.length,0);
  if(!total&&!reserves.length)return;
  if(!document.getElementById('modal-pmi-controles-wrap')){
    document.body.insertAdjacentHTML('beforeend',`
<div class="overlay" id="modal-pmi-controles-wrap">
  <div class="modal" style="max-width:640px;max-height:86vh;display:flex;flex-direction:column">
    <h3><i class="ti ti-alert-triangle"></i> Points de vigilance</h3>
    <div id="pmi-controles-corps" style="overflow-y:auto;flex:1;font-size:13px;line-height:1.7"></div>
    <div class="mactions"><button class="btn-primary" onclick="closeModal('modal-pmi-controles-wrap')">Fermer</button></div>
  </div>
</div>`);
  }
  let html='<div class="info-box" style="margin-bottom:14px"><i class="ti ti-info-circle" style="font-size:15px"></i> '
    +'Ces contrôles portent sur les données du planning et des présences. Le fichier Excel, lui, n\'est pas annoté.</div>';
  controles.forEach(c=>{
    const s=c.stats,tot=s.heuresDiplome+s.heuresQualifie;
    const part=tot?Math.round(s.heuresDiplome/tot*1000)/10:0;
    html+='<div style="margin-bottom:14px">'
      +'<div style="font-weight:700;color:var(--koala);margin-bottom:4px">Semaine du '+escHtml(c.semaine)+'</div>'
      +'<div style="color:var(--muted);font-size:12px;margin-bottom:6px">'
      +'Heures d\'encadrement : '+(Math.round(tot*100)/100)+' h — dont '+part+' % de personnel diplômé'
      +(capacite?' · capacité : '+capacite+' enfants':'')+'</div>';
    const gens=Object.keys(s.parPersonne||{}).filter(k=>s.parPersonne[k].planifie>0);
    if(gens.length){
      const r2=v=>Math.round(v*100)/100;
      html+='<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px">'
        +'<tr style="color:var(--muted)"><th style="text-align:left;font-weight:600">&nbsp;</th>'
        +'<th style="text-align:right;font-weight:600">Planifié</th>'
        +'<th style="text-align:right;font-weight:600">Encadrement</th>'
        +'<th style="text-align:right;font-weight:600">Bureau</th>'
        +'<th style="text-align:right;font-weight:600">Repas/entretien</th></tr>';
      gens.forEach(k=>{
        const o=s.parPersonne[k];
        // Contrôle : rien n'est ajouté aux heures planifiées, la somme doit retomber dessus.
        const ecart=Math.abs(o.planifie-(o.encadrement+o.direction+o.entretien))>0.01;
        html+='<tr><td>'+escHtml(k)+'</td>'
          +'<td style="text-align:right'+(ecart?';color:var(--red);font-weight:700':'')+'">'+r2(o.planifie)+' h</td>'
          +'<td style="text-align:right">'+r2(o.encadrement)+' h</td>'
          +'<td style="text-align:right">'+(o.direction?r2(o.direction)+' h':'—')+'</td>'
          +'<td style="text-align:right">'+(o.entretien?r2(o.entretien)+' h':'—')+'</td></tr>';
      });
      html+='</table>'
        +'<div style="font-size:11px;color:var(--muted);margin-bottom:8px">'
        +'Le temps de bureau et l\'entretien sont prélevés sur les heures déjà planifiées : la colonne '
        +'« Planifié » est inchangée et reste à comparer au contrat de chacun — aucune heure supplémentaire '
        +'n\'est générée par cet export.</div>';
    }
    if(s.entretien.length)
      html+='<div style="font-size:12px;margin-bottom:6px">'
        +'<span style="font-weight:600">Repas / entretien placés :</span> '
        +escHtml(s.entretien.join(' · '))+'</div>';
    if(s.bureau.length)
      html+='<div style="font-size:12px;margin-bottom:6px">'
        +'<span style="font-weight:600">Temps de bureau placé :</span> '
        +escHtml(s.bureau.join(' · '))+'</div>';
    html+=s.anomalies.length
      ? '<ul style="margin:0 0 0 18px;padding:0">'+s.anomalies.map(a=>'<li>'+escHtml(a)+'</li>').join('')+'</ul>'
      : '<div style="color:var(--koala)">✅ Aucune anomalie détectée.</div>';
    html+='</div>';
  });
  if(reserves.length)
    html+='<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">'
      +'<div style="font-weight:700;margin-bottom:4px">Limites de ce contrôle</div>'
      +'<ul style="margin:0 0 0 18px;padding:0">'+reserves.map(r=>'<li>'+escHtml(r)+'</li>').join('')+'</ul></div>';
  document.getElementById('pmi-controles-corps').innerHTML=html;
  document.getElementById('modal-pmi-controles-wrap').classList.add('open');
}

async function pmiGenerateExcel(){
  const ctx=_pmiExportCtx;
  if(!ctx)return;
  if(typeof ExcelJS==='undefined'){alert('La bibliothèque Excel (ExcelJS) n\'a pas pu être chargée. Réessayez dans un instant.');return;}
  const btn=document.getElementById('pmi-export-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Génération…';}
  try{
    const qualifMap=pmiCollectQualifs();
    const expMap=pmiCollectExperience();
    const nomMap=pmiCollectNoms();
    const colorMap=pmiBuildColorMap(ctx.staffList);
    const withData=ctx.weeks.filter(w=>w.rows.length);

    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(pmiB64ToArrayBuffer(PMI_TEMPLATE_B64));
    const tpl=wb.worksheets[0];

    // Les feuilles supplémentaires sont clonées AVANT tout remplissage, pour partir
    // à chaque fois du modèle vierge et non de la semaine précédente.
    const noms=withData.map(w=>('Semaine '+w.dateDebut.replace(/\//g,'-')).slice(0,31));
    const feuilles=[tpl];
    for(let i=1;i<withData.length;i++)feuilles.push(pmiCloneSheet(wb,tpl,noms[i]));
    tpl.name=noms[0];

    // Feuil2 / Feuil3 : feuilles vides du classeur d'origine, inutiles dans l'export.
    wb.worksheets.slice().forEach(w=>{if(/^Feuil[23]$/.test(w.name))wb.removeWorksheet(w.id);});

    const capacite=(cacheCreches||[]).find(c=>c.id===ctx.crecheId)?.capacity||null;

    // Temps de bureau de la direction : la répartition dépend des jours réellement
    // travaillés, elle est donc recalculée pour chaque semaine exportée.
    const dirPrenom=(document.getElementById('pmi-direction-prenom')||{}).value||'';
    const dirHeures=parseFloat((document.getElementById('pmi-direction-heures')||{}).value)||0;
    pmiDirectionSet(ctx.crecheId,dirPrenom,dirHeures);

    const entHeures=parseFloat((document.getElementById('pmi-entretien-heures')||{}).value)||0;
    const entOuv=(document.getElementById('pmi-ouverture')||{}).value||PMI_OUVERTURE_DEFAUT;
    const entFerm=(document.getElementById('pmi-fermeture')||{}).value||PMI_FERMETURE_DEFAUT;
    pmiEntretienSet(ctx.crecheId,entHeures,entOuv,entFerm);
    const entretien=entHeures>0?{
      quarts:Math.round(entHeures*4),
      colOuverture:pmiColonneDeHeure(entOuv,PMI_TPL_COL_FIRST),
      colFermeture:pmiColonneDeHeure(entFerm,PMI_TPL_COL_LAST+1)
    }:null;
    const controles=withData.map((w,i)=>({
      semaine:w.dateDebut,
      stats:pmiFillSheet(feuilles[i],w,ctx.crecheName,ctx.staffList,qualifMap,nomMap,colorMap,ctx.enfantsParDate,capacite,expMap,
        (dirPrenom&&dirHeures>0)?{prenom:dirPrenom,quartsParJour:pmiRepartirBureau(w,dirPrenom,dirHeures)}:null,
        entretien)
    }));

    const buf=await pmiRestaurerPoliceParDefaut(await wb.xlsx.writeBuffer());
    const slug=(ctx.crecheName||'creche').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
    const fileName='Planning_PMI_'+slug+'_'+withData[0].dateDebut.replace(/\//g,'-')+'.xlsx';
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    closeModal('modal-pmi-export-wrap');
    const trop=ctx.staffList.length-PMI_TPL_MAX_STAFF;
    const reserves=[];
    if(trop>0)reserves.push('Le modèle ne comporte que '+PMI_TPL_MAX_STAFF+' lignes par jour : '+trop+' personne(s) ne figurent pas dans le fichier.');
    if(ctx.enfantsSansHoraire)reserves.push(ctx.enfantsSansHoraire+' présence(s) enfant sans horaire ni contrat n\'ont pas pu être comptées dans la ligne « Nombre d\'enfants accueillis ».');
    if(!capacite)reserves.push('Aucune capacité d\'accueil n\'est renseignée sur la fiche de la crèche : la case correspondante reste vide et le dépassement de capacité n\'a pas pu être vérifié.');
    if(entretien){
      const place=controles.reduce((n,c)=>n+c.stats.heuresEntretien,0);
      const attendu=entHeures*5*controles.length;
      if(attendu-place>0.25)
        reserves.push('Repas et entretien : '+(Math.round(place*100)/100)+' h ont pu être placées sur '
          +(Math.round(attendu*100)/100)+' h attendues — les créneaux restants dégraderaient le taux d\'encadrement.');
    }
    if(dirPrenom&&dirHeures>0){
      const place=controles.reduce((n,c)=>n+c.stats.heuresBureau,0);
      const attendu=dirHeures*controles.length;
      if(Math.abs(place-attendu)>0.25)
        reserves.push('Temps de bureau : '+(Math.round(place*100)/100)+' h ont pu être placées sur '
          +(Math.round(attendu*100)/100)+' h attendues — les heures de travail de '+dirPrenom
          +' ne suffisent pas à les absorber sur certaines semaines.');
    }

    const nbAnomalies=controles.reduce((n,c)=>n+c.stats.anomalies.length,0);
    if(typeof window!=='undefined')window.controlesGlobaux=controles;   // exposé pour les vérifications
    pmiAfficherControles(controles,reserves,capacite);
    showBanner(nbAnomalies||reserves.length
      ? 'Planning PMI généré — '+(nbAnomalies||'aucun')+' point'+(nbAnomalies>1?'s':'')+' de vigilance à vérifier.'
      : 'Planning PMI généré ✅', (nbAnomalies||reserves.length)?'error':undefined);
  }catch(e){
    console.error('[pmiGenerateExcel]',e);
    showBanner('Erreur lors de la génération du fichier : '+e.message,'error');
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-download"></i> Générer le fichier Excel';}
  }
}
window.pmiGenerateExcel=pmiGenerateExcel;

// 3) Planning équipe (toutes les salariées de la crèche affichée) — 1, 2 ou 3 semaines sur la même page
async function peBuildPrintHTML(){
  const sel=document.getElementById('pe-creche-select');
  const crecheId=isDirection?sel?.value:currentProfile?.creche_id;
  if(!crecheId){alert('Choisissez d\'abord une crèche.');return null;}
  const crecheName=cacheCreches.find(c=>c.id===crecheId)?.name||'';
  const nbWeeks=parseInt(document.getElementById('pe-print-weeks')?.value)||1;
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

  const ws0=weekStart();
  let bodyHTML='';
  let nbWithData=0;
  for(let w=0;w<nbWeeks;w++){
    const wsW=new Date(ws0);wsW.setDate(ws0.getDate()+7*w);
    const semaineW=ipDateToLocalISO(wsW);
    const days5=Array.from({length:5},(_,i)=>{const d=new Date(wsW);d.setDate(wsW.getDate()+i);return d;});
    const rows=await peLoad(crecheId,semaineW);
    await peLoadRemplacantes(crecheId,semaineW);
    bodyHTML+='<div style="margin-top:'+(w>0?'18px':'0')+'">'+
      '<div style="font-weight:700;font-size:13px;color:#3D3580;margin-bottom:4px">Semaine du '+fmt(days5[0])+' au '+fmt(days5[4])+'</div>'+
      (rows.length?getPlanningEquipeTable(rows,semaineW,crecheName,crecheId,false,true,nbWeeks):'<div style="font-size:11px;color:#999;padding:6px 0">Aucune donnée pour cette semaine.</div>')+
      '</div>';
    if(rows.length)nbWithData++;
  }
  if(!nbWithData){alert('Aucune donnée pour cette crèche sur la période choisie.');return null;}

  const days5First=Array.from({length:5},(_,i)=>{const d=new Date(ws0);d.setDate(ws0.getDate()+i);return d;});
  const subtitle='Planning équipe — '+crecheName+' — '+nbWeeks+' semaine(s) à partir du '+fmt(days5First[0]);
  return{crecheId,crecheName,subtitle,bodyHTML,dateDebut:fmt(days5First[0]),nbWeeks};
}

async function printPlanningEquipe(){
  const d=await peBuildPrintHTML();
  if(!d)return;
  printPlanningDoc('Planning équipe',d.subtitle,d.bodyHTML,'portrait');
}
