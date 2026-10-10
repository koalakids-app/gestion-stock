
/* La grille peut ne pas avoir été ouverte de la session : le devis en a besoin. */
async function chargeGrille(){
  try{
    const[t,f]=await Promise.all([
      sb.from('tarifs').select('*').order('ordre'),
      sb.from('frais_annexes').select('*').order('ordre')
    ]);
    if(t.error)throw t.error;
    if(f.error)throw f.error;
    TARIFS=t.data||[];FRAIS=f.data||[];
  }catch(e){console.error('[chargeGrille]',e);toast('Grille tarifaire inaccessible.',true);}
}

/* Volume hebdomadaire du devis — même règle que la fiche, sur ses propres
   champs : le devis peut retenir un contrat différent de la demande initiale. */
function dHeuresHebdo(){
  const m=t=>{const r=/^(\d{1,2}):(\d{2})/.exec(t||'');return r?(+r[1])*60+(+r[2]):null;};
  const a=m(val('dHd')),b=m(val('dHf'));
  const n=document.querySelectorAll('.ckDJour:checked').length;
  if(a==null||b==null||b<=a||!n)return null;
  return Math.round((b-a)/60*n*100)/100;
}

/* Changer de crèche change le calendrier de facturation. On suit la nouvelle
   crèche, sauf si la direction a déjà corrigé le nombre à la main : sa saisie
   l'emporte, sinon elle serait effacée sans prévenir. */
function dCrecheChange(){
  if(!semManuel){
    const n=semainesDe(val('dCreche'));
    if(n!=null)setVal('dSem',n);
  }
  // Les semaines de fermeture sont propres à chaque crèche : le nombre de jours
  // déduits de la période en dépend, et doit suivre le changement.
  dPeriodeChange();
}
function dSemManuel(){semManuel=true;dSync();}

/* ---------- LA PÉRIODE D'ACCUEIL ---------- */
/* Un contrat Koala Kids commence rarement au 1er janvier. Le cas normal est une
   entrée en cours d'année et une fin au 31 août : onze mois, pas douze. Lisser
   sur une année théorique donnait une mensualité juste mais un total annuel
   faux d'un mois entier.

   Dès qu'une fin d'accueil est posée, le calcul ne part plus d'un nombre de
   semaines mais du NOMBRE DE JOURS D'ACCUEIL réellement compris entre les deux
   dates — lundi, mardi et vendredi entre le 6 octobre et le 31 août, par
   exemple, un par un, années bissextiles et mois courts inclus.

   Les fermetures sont déduites de ce compte. La base n'en connaît que le
   NOMBRE de semaines (`etablissements.semaines_fermeture`), pas les dates : on
   en propose donc une estimation au prorata de la durée, affichée dans un champ
   modifiable. Une estimation qu'on peut corriger vaut mieux qu'un calcul exact
   impossible — et mieux qu'un chiffre faux qu'on ne verrait pas. */

/* Compte les jours d'accueil entre deux dates, bornes incluses. On itère jour
   par jour plutôt que de multiplier des semaines : sur onze mois l'écart entre
   les deux méthodes atteint plusieurs jours, et chaque jour vaut ici une heure
   de tarif horaire plus un frais d'entretien. */
function joursAccueilEntre(deb,fin,jours){
  if(!deb||!fin||!jours||!jours.length)return null;
  const d0=new Date(String(deb).slice(0,10)+'T12:00:00');
  const d1=new Date(String(fin).slice(0,10)+'T12:00:00');
  if(isNaN(d0)||isNaN(d1)||d1<d0)return null;
  // Garde-fou : au-delà de cinq ans, c'est une saisie aberrante, pas un contrat.
  if((d1-d0)/86400000>1830)return null;
  const set={};jours.forEach(j=>{set[Number(j)]=1;});
  let n=0;
  for(const d=new Date(d0);d<=d1;d.setDate(d.getDate()+1)){
    const js=d.getDay()===0?7:d.getDay();   // 1 = lundi … 7 = dimanche
    if(set[js])n++;
  }
  return n;
}

/* Nombre de mensualités. Un accueil du 6 octobre au 31 août se facture onze
   fois : on compte les mois civils touchés, ce qui est la façon dont une
   facturation mensuelle fonctionne réellement — le mois d'entrée compte pour
   un, même entamé. Le champ reste modifiable pour les cas limites. */
function moisEntre(deb,fin){
  if(!deb||!fin)return null;
  const a=String(deb).slice(0,10).split('-').map(Number);
  const b=String(fin).slice(0,10).split('-').map(Number);
  if(a.length!==3||b.length!==3)return null;
  const n=(b[0]-a[0])*12+(b[1]-a[1])+1;
  return n>0?n:null;
}

/* Jours de fermeture à déduire, estimés au prorata de la durée du contrat.
   Cinq semaines de fermeture sur douze mois, trois jours d'accueil par
   semaine, onze mois de contrat → 5 × 3 × 11/12 ≈ 14 jours.
   N'intervient plus qu'en repli, quand le calendrier de Paramètres ne couvre
   pas la période du devis — voir fermetureReelle() ci-dessous. */
function fermetureEstimee(crecheId,nbJoursSemaine,mois){
  const e=etabDe(crecheId);
  const sem=e&&e.semaines_fermeture!=null?Number(e.semaines_fermeture):5;
  if(!nbJoursSemaine||!mois)return 0;
  return Math.round(sem*nbJoursSemaine*(mois/12));
}

/* Les vraies dates de fermeture : le calendrier saisi dans Paramètres, à la
   fois propre à l'établissement (etablissements.jours_fermeture) et commun au
   réseau (reseau_config.jours_fermeture_reseau) — vacances, jours fériés
   propres à la crèche, journées pédagogiques. Chaque entrée a un début et,
   pour une plage, une fin ; sans fin, elle ne couvre qu'un jour. */
function joursFermesCalendrier(crecheId){
  return toArr(etabDe(crecheId).jours_fermeture).concat(toArr(RESEAU.jours_fermeture_reseau));
}

/* Décompte réel des jours de fermeture qui tombent sur un jour d'accueil de la
   période du devis, à partir de ce calendrier — jour par jour, comme
   joursAccueilEntre(). Renvoie null quand le calendrier ne contient AUCUNE
   date dans l'intervalle [deb,fin] : c'est le signe qu'il n'a pas été rempli
   pour cette période plutôt que d'une fermeture nulle, et l'appelant retombe
   alors sur l'estimation au prorata. */
function fermetureReelle(crecheId,jours,deb,fin){
  if(!deb||!fin||!jours||!jours.length)return null;
  const d0=new Date(String(deb).slice(0,10)+'T12:00:00');
  const d1=new Date(String(fin).slice(0,10)+'T12:00:00');
  if(isNaN(d0)||isNaN(d1)||d1<d0)return null;

  const fermees=new Set();
  joursFermesCalendrier(crecheId).forEach(x=>{
    if(!x||!x.debut)return;
    const a=new Date(String(x.debut).slice(0,10)+'T12:00:00');
    if(isNaN(a))return;
    const b=x.fin?new Date(String(x.fin).slice(0,10)+'T12:00:00'):a;
    if(isNaN(b)||b<a)return;
    for(const d=new Date(a);d<=b;d.setDate(d.getDate()+1))fermees.add(d.toISOString().slice(0,10));
  });
  if(!fermees.size)return null;

  const set={};jours.forEach(j=>{set[Number(j)]=1;});
  let n=0,couverte=false;
  for(const d=new Date(d0);d<=d1;d.setDate(d.getDate()+1)){
    if(!fermees.has(d.toISOString().slice(0,10)))continue;
    couverte=true;
    const js=d.getDay()===0?7:d.getDay();
    if(set[js])n++;
  }
  return couverte?n:null;
}

/* Recalcule les trois champs de période à partir des dates. Appelée quand une
   date change — jamais quand la direction corrige un des champs à la main,
   sinon sa saisie serait effacée dans la foulée. */
/* Les semaines annuelles et la période sont deux façons EXCLUSIVES de compter.
   Dès qu'une fin d'accueil est posée, les 47 semaines ne servent plus à rien :
   le calcul part des jours réels. Les laisser à l'écran laissait croire
   qu'elles pilotaient encore le montant — c'est le champ le plus visible du
   bloc. On montre donc l'un ou l'autre, jamais les deux. */
function dAfficheRegime(){
  const avecTerme=!!val('dFin');
  const sb2=document.getElementById('dSemBox');
  const pb=document.getElementById('dPeriodeBox');
  if(sb2)sb2.style.display=avecTerme?'none':'';
  if(pb)pb.style.display=avecTerme?'':'none';
  // Par défaut caché : dPeriodeChange le montre lui-même, et seulement quand
  // le chiffre affiché est une estimation, pas un décompte calendaire réel.
  if(!avecTerme){
    const fw=document.getElementById('dFermWarn');
    if(fw)fw.style.display='none';
  }
}

/* Bascule le texte d'avertissement selon l'origine du chiffre : « estimee »
   quand aucune fermeture du calendrier de Paramètres ne couvre la période
   (repli sur le prorata), masqué quand le décompte vient du vrai calendrier. */
function dMajFermWarn(estimee){
  const fw=document.getElementById('dFermWarn');
  if(!fw)return;
  fw.style.display=estimee?'':'none';
}

function dPeriodeChange(){
  const fin=val('dFin'),deb=val('dDebut');
  dAfficheRegime();
  if(!fin){dSync();return;}
  // Sans date de début, ou avec des dates inversées, il n'y a rien à compter :
  // on vide plutôt que de laisser à l'écran les chiffres d'une période
  // précédente. dSync se charge d'expliquer pourquoi.
  if(!deb||fin<=deb){
    setVal('dJours','');setVal('dFerm','');setVal('dMois','');
    dMajFermWarn(false);dSync();return;
  }
  const jours=[...document.querySelectorAll('.ckDJour:checked')].map(c=>Number(c.value));
  const bruts=joursAccueilEntre(deb,fin,jours);
  const mois=moisEntre(deb,fin);
  // Le calendrier de Paramètres prime dès qu'il couvre la période ; sinon on
  // retombe sur l'estimation au prorata, moins fiable mais toujours disponible.
  const reel=fermetureReelle(val('dCreche'),jours,deb,fin);
  const ferm=reel!=null?reel:fermetureEstimee(val('dCreche'),jours.length,mois);
  setVal('dMois',mois||'');
  setVal('dFerm',mois?ferm:'');
  setVal('dJours',bruts==null?'':Math.max(0,bruts-ferm));
  dMajFermWarn(reel==null);
  dSync();
}
/* Corriger les fermetures met à jour les jours facturés, sans toucher au reste. */
function dFermChange(){
  const jours=[...document.querySelectorAll('.ckDJour:checked')].map(c=>Number(c.value));
  const bruts=joursAccueilEntre(val('dDebut'),val('dFin'),jours);
  if(bruts!=null)setVal('dJours',Math.max(0,bruts-(Number(val('dFerm'))||0)));
  dSync();
}

/* Le coeur du calcul. Tout est ramené au MOIS : c'est le montant que la
   famille paiera, et celui sur lequel le CMG se plafonne.
     accueil mensuel  = heures hebdo × semaines ÷ 12 × tarif horaire
     frais unitaires  = jours hebdo  × semaines ÷ 12 × montant
   Les frais mensuels s'ajoutent tels quels ; les frais uniques et annuels
   sortent du récurrent et sont présentés à part. */
/* ---------- REMISES LIBRES ---------- */
function ajustRend(editable){
  const box=document.getElementById('dAjustBox');
  if(!AJUST.length){box.innerHTML='';return;}
  const dis=editable===false?' disabled':'';
  box.innerHTML=AJUST.map((a,i)=>
    '<div class="g3" style="grid-template-columns:2fr 1fr 1fr auto;align-items:end;margin-bottom:8px">'
    +'<div class="f"><label class="lb">Libellé</label><input value="'+esc(a.libelle)+'" placeholder="Ex. Berceau d\'entreprise"'+dis+' oninput="ajustMaj('+i+',\'libelle\',this.value)"></div>'
    +'<div class="f"><label class="lb">Nature</label><select'+dis+' onchange="ajustMaj('+i+',\'sens\',this.value)">'
      +'<option value="remise"'+(a.sens==='remise'?' selected':'')+'>Remise</option>'
      +'<option value="majoration"'+(a.sens==='majoration'?' selected':'')+'>Majoration</option></select></div>'
    +'<div class="f"><label class="lb">Valeur</label><div style="display:flex;gap:4px">'
      +'<input type="number" step="0.01" min="0" value="'+(a.valeur===''?'':esc(a.valeur))+'"'+dis+' oninput="ajustMaj('+i+',\'valeur\',this.value)">'
      +'<select'+dis+' style="max-width:84px" onchange="ajustMaj('+i+',\'mode\',this.value)">'
        +'<option value="eur"'+(a.mode==='eur'?' selected':'')+'>€/mois</option>'
        +'<option value="pct"'+(a.mode==='pct'?' selected':'')+'>%</option></select></div></div>'
    +(editable===false?'<span></span>':'<button type="button" class="btn btn-g" title="Retirer" onclick="ajustRetire('+i+')"><i class="ti ti-x"></i></button>')
    +'</div>').join('');
}
function ajustAjoute(){
  AJUST.push({libelle:'',sens:'remise',mode:'eur',valeur:''});
  ajustRend(true);dSync();
}
function ajustRetire(i){AJUST.splice(i,1);ajustRend(true);dSync();}
function ajustMaj(i,k,v){AJUST[i][k]=v;dSync();}

function dCalcule(){
  const h=dHeuresHebdo();
  const nj=document.querySelectorAll('.ckDJour:checked').length;
  const sem=Number(val('dSem'))||47;
  const creche=val('dCreche')||null;

  /* DEUX RÉGIMES, et un seul chiffre les distingue : la date de fin.

     Sans terme — le devis se lisse sur une année théorique, comme avant :
       jours facturés par mois = jours hebdo × semaines ÷ 12

     Avec terme — on part des jours d'accueil réellement comptés entre les deux
     dates, fermetures déduites, répartis sur les mois facturés :
       jours facturés par mois = jours de la période ÷ mois

     Les deux formules produisent la même mensualité quand la période couvre une
     année pleine. L'écart apparaît sur les contrats courts, et c'est
     précisément là que l'ancienne se trompait. */
  const avecTerme=!!val('dFin');
  const moisP=avecTerme?(Number(val('dMois'))||moisEntre(val('dDebut'),val('dFin'))||12):12;
  const joursP=avecTerme?(val('dJours')===''?null:Number(val('dJours'))):null;
  // Jours d'accueil facturés par mois — la quantité qui porte tout le reste.
  const jparmois=avecTerme
    ? (joursP==null?null:joursP/moisP)
    : nj*sem/12;
  const hparjour=(nj&&h!=null)?h/nj:null;   // amplitude d'une journée

  let tarif=null;
  const forc=val('dTarif');
  if(forc)tarif=TARIFS.find(t=>String(t.id)===String(forc))||null;
  else if(h!=null)tarif=tarifPour(h,creche);

  const lignes=[];
  if(tarif&&h!=null&&jparmois!=null){
    let q,pu,tot;
    if(tarif.mode==='horaire'){q=jparmois*(hparjour||0);pu=Number(tarif.montant);tot=q*pu;}
    else if(tarif.mode==='journee'){q=jparmois;pu=Number(tarif.montant);tot=q*pu;}
    else{q=1;pu=Number(tarif.montant);tot=pu;}
    lignes.push({libelle:tarif.libelle,description:tarif.description||'',type:'accueil',
      quantite:Math.round(q*1000)/1000,montant_unitaire:pu,total:Math.round(tot*100)/100,
      unite:tarif.mode==='horaire'?'h':(tarif.mode==='journee'?'j':'mois')});
  }

  [...document.querySelectorAll('.ckFrais:checked')].forEach(c=>{
    const f=FRAIS.find(x=>String(x.id)===String(c.value));
    if(!f)return;
    const signe=f.est_reduction?-1:1;
    let q=1,unite='';
    if(f.type==='unitaire'){q=jparmois==null?0:jparmois;unite='j';}
    lignes.push({libelle:f.libelle,description:f.description||'',type:f.type,
      quantite:Math.round(q*1000)/1000,montant_unitaire:signe*Number(f.montant),
      total:Math.round(signe*Number(f.montant)*q*100)/100,unite:unite});
  });

  /* Remises libres : calculées après la grille, car un pourcentage porte sur
     la mensualité telle qu'elle sort des lignes ci-dessus. */
  const baseMens=lignes.filter(l=>['accueil','mensuel','unitaire'].indexOf(l.type)>=0)
    .reduce((t,l)=>t+l.total,0);
  AJUST.forEach(a=>{
    const v=Number(a.valeur);
    if(!(v>0)||!String(a.libelle||'').trim())return;
    const signe=a.sens==='remise'?-1:1;
    const m=a.mode==='pct'?Math.round(baseMens*v)/100:v;
    lignes.push({libelle:String(a.libelle).trim(),
      description:a.mode==='pct'?nbFr(v)+' % de la mensualité':'',
      type:'mensuel',quantite:1,montant_unitaire:signe*m,
      total:Math.round(signe*m*100)/100,unite:''});
  });

  const recur=['accueil','mensuel','unitaire'];
  const mensuel=lignes.filter(l=>recur.indexOf(l.type)>=0).reduce((s,l)=>s+l.total,0);
  const uniques=lignes.filter(l=>l.type==='unique').reduce((s,l)=>s+l.total,0);
  const annuels=lignes.filter(l=>l.type==='annuel').reduce((s,l)=>s+l.total,0);

  return{h:h,nj:nj,sem:sem,tarif:tarif,lignes:lignes,
    avecTerme:avecTerme,mois:moisP,joursPeriode:joursP,jparmois:jparmois,
    mensuel:Math.round(mensuel*100)/100,
    uniques:Math.round(uniques*100)/100,
    // Le total sur la DURÉE du contrat, et non sur douze mois d'office.
    annuel:Math.round((mensuel*moisP+annuels)*100)/100};
}

/* Estimation CMG. Deux plafonds jouent : le montant du barème selon les
   revenus, et la part maximale du coût que le CMG peut couvrir (85 %). C'est
   le plus petit des deux qui s'applique — sur un petit contrat, c'est
   toujours le second. */
function dCmgCalcule(mensuel){
  const rev=val('dRev')===''?null:Number(val('dRev'));
  const sit=val('dSit')||'couple';
  const p=ficheId?PRE.find(x=>String(x.id)===String(ficheId)):null;
  const age=ageAns(p&&p.dob,val('dDebut'));

  if(!CMG_BAREME.length)return{err:'Barème CMG non renseigné en base — exécutez le script 24g.'};
  if(rev==null)return{err:'Renseignez les revenus du foyer pour estimer le CMG.'};
  if(age==null)return{err:'Renseignez la date de naissance et la date de début pour estimer le CMG.'};
  if(age>=6)return{err:'Le CMG s\'éteint aux 6 ans de l\'enfant.'};

  const tr=CMG_BAREME.filter(b=>b.situation===sit)
    .sort((a,b)=>(a.revenu_max==null?1:0)-(b.revenu_max==null?1:0)||Number(a.revenu_max)-Number(b.revenu_max))
    .find(b=>b.revenu_max==null||rev<=Number(b.revenu_max));
  if(!tr)return{err:'Aucune tranche de barème ne correspond à cette situation.'};

  const ratio=age>=3?Number(CMG_CFG.ratio_3_6||0.5):1;
  const plafondBareme=Math.round(Number(tr.montant)*ratio*100)/100;
  const plafondCout=Math.round(mensuel*Number(CMG_CFG.taux_max||0.85)*100)/100;
  const cmg=Math.min(plafondBareme,plafondCout);
  return{age:age,ratio:ratio,bareme:plafondBareme,cout:plafondCout,
    cmg:Math.round(cmg*100)/100,reste:Math.round((mensuel-cmg)*100)/100,
    limite:plafondCout<plafondBareme?'cout':'bareme'};
}

function dSync(){
  const c=dCalcule();
  DCALC=c;

  const ref=semainesDe(val('dCreche'));
  const origine=ref==null
    ? ' Aucune crèche retenue : valeur par défaut.'
    : (Number(c.sem)===ref ? ' Nombre repris des paramètres de la crèche.'
                           : ' Corrigé à la main — les paramètres de la crèche indiquent '+ref+' semaines.');
  if(c.h==null){
    document.getElementById('dVol').textContent=
      'Renseignez les jours et les horaires pour calculer le volume hebdomadaire.';
  }else if(c.avecTerme){
    const deb=val('dDebut'),fin=val('dFin');
    const el=document.getElementById('dVol');
    const tete=c.h+' h par semaine sur '+c.nj+' jour'+(c.nj>1?'s':'')+'. ';
    if(!deb){
      el.textContent=tete+'Renseignez la date de début : sans elle, ni les jours ni les mois ne peuvent être comptés.';
    }else if(fin<=deb){
      /* Une fin antérieure au début est presque toujours une erreur d'année —
         on saisit 2026 en pensant à la rentrée suivante. Le dire, et proposer
         la correction probable, évite de laisser trois cases vides sans motif.
         La base refuserait de toute façon (devis_periode_ck), mais bien plus
         tard et bien moins clairement. */
      const p=fin.split('-');
      const suggestion=p.length===3?[String(Number(p[0])+1),p[1],p[2]].join('-'):null;
      el.innerHTML=esc(tete)+'<span style="color:var(--red);font-weight:700">La fin de l\'accueil ('
        +dfr(fin)+') est antérieure au début ('+dfr(deb)+').</span>'
        +(suggestion&&suggestion>deb?' Vouliez-vous le <b>'+dfr(suggestion)+'</b> ?':'');
    }else if(c.joursPeriode==null){
      el.textContent=tete+'Renseignez les jours d\'accueil de la période.';
    }else{
      el.textContent=tete+c.joursPeriode+' jour'+(c.joursPeriode>1?'s':'')+' d\'accueil facturés du '
        +dfr(deb)+' au '+dfr(fin)+', répartis sur '+nbFr(c.mois)+' mois — '
        +'soit '+nbFr(Math.round(c.jparmois*100)/100)+' jour'+(c.jparmois>1?'s':'')+' par mois.';
    }
  }else{
    document.getElementById('dVol').textContent=
      c.h+' h par semaine sur '+c.nj+' jour'+(c.nj>1?'s':'')+', soit '
      +(Math.round(c.h*c.sem*100)/100)+' h sur '+c.sem+' semaines.'+origine
      +' Accueil sans terme : lissage sur douze mois.';
  }

  const th=document.getElementById('dTarifHint');
  if(!c.tarif){
    th.textContent=c.h==null?'Le tarif se déduit du volume hebdomadaire.'
      :'Aucune ligne de la grille ne couvre '+nbFr(c.h)+' h par semaine.';
  }else{
    const forceId=val('dTarif');
    const auto=c.h==null?null:tarifPour(c.h,val('dCreche')||null);
    const base=(forceId?'Tarif forcé : ':'Retenu automatiquement : ')
      +esc(c.tarif.libelle)+' — '+euro(c.tarif.montant)+' '
      +(c.tarif.mode==='horaire'?'de l\'heure':(c.tarif.mode==='journee'?'la journée':'par mois'))+'.';
    /* Un tarif forcé ne suit plus le volume : c'est sa raison d'être, et il y a
       de bonnes raisons d'en poser un. Mais c'est aussi ce qui laisse facturer
       9,90 € un contrat de 52,5 h que la grille place à 9,00 €. On ne corrige
       pas d'office — le forçage est un choix, et l'écraser serait pire — mais
       on montre l'écart et ce que la grille aurait retenu. */
    let alerte='';
    /* Une ligne horaire sans aucune borne s'applique à tous les contrats. Elle
       est rarement voulue : c'est la signature d'une fourchette laissée vide à
       la saisie. Tant qu'elle est là, tous les devis sortent au même tarif. */
    if(c.tarif.mode==='horaire'&&c.tarif.heures_min==null&&c.tarif.heures_max==null){
      alerte+='<div class="warn"><i class="ti ti-alert-triangle"></i><span>'
        +'Cette ligne ne porte <b>aucune borne horaire</b> : elle s\'applique à tout '
        +'volume, quel que soit le contrat. Complétez sa fourchette dans l\'écran '
        +'Tarifs — sans quoi tous les devis sortiront à ce tarif.</span></div>';
    }
    if(forceId&&auto&&String(auto.id)!==String(c.tarif.id)){
      alerte='<div class="warn"><i class="ti ti-alert-triangle"></i><span>'
        +'Ce tarif ne correspond pas au volume saisi. Pour '+esc(nbFr(c.h))
        +' h par semaine, la grille retient <b>'+esc(auto.libelle)+'</b> à '
        +euro(auto.montant)+'. Repassez sur « choix automatique » pour la suivre.'
        +'</span></div>';
    }
    th.innerHTML=base+alerte;
  }

  document.getElementById('dFraisHint').textContent=
    'Un montant en vert se soustrait du total. Les frais uniques et annuels sont présentés hors mensualité.';

  // Le détail chiffré
  const box=document.getElementById('dLignes');
  if(!c.lignes.length){box.innerHTML='<p class="hint">Rien à chiffrer pour l\'instant.</p>';}
  else{
    const recur=['accueil','mensuel','unitaire'];
    const q=l=>l.unite?(Math.round(l.quantite*100)/100).toLocaleString('fr-FR')+' '+l.unite+' × '+euro(Math.abs(l.montant_unitaire)):'';
    const tr=l=>'<tr'+(l.total<0?' class="neg"':'')+'><td>'+esc(libelleLigne(l))
      +(l.description?'<div class="q">'+esc(l.description)+'</div>':'')+'</td>'
      +'<td class="q">'+q(l)+'</td><td class="m">'+(l.total<0?'− ':'')+euro(Math.abs(l.total))+'</td></tr>';
    let html='<table class="lg">'+c.lignes.filter(l=>recur.indexOf(l.type)>=0).map(tr).join('')
      +'<tr class="tot"><td colspan="2">Total mensuel</td><td class="m">'+euro(c.mensuel)+'</td></tr></table>';
    const hors=c.lignes.filter(l=>recur.indexOf(l.type)<0);
    if(hors.length)html+='<div style="margin-top:12px"><table class="lg">'+hors.map(tr).join('')+'</table>'
      +'<p class="hint" style="margin-top:6px">Facturés en une fois ou à l\'année, hors mensualité.</p></div>';
    html+='<p class="hint" style="margin-top:8px">'
      +(c.avecTerme
        ? '<b>'+euro(c.annuel)+'</b> sur la durée du contrat — '+nbFr(c.mois)+' mensualités.'
        : '<b>'+euro(c.annuel)+'</b> sur douze mois, accueil sans terme.')+'</p>';
    box.innerHTML=html;
  }

  // CMG
  const p=ficheId?PRE.find(x=>String(x.id)===String(ficheId)):null;
  const age=ageAns(p&&p.dob,val('dDebut'));
  setVal('dAge',age==null?'—':(age+' an'+(age>1?'s':'')+(age<3?' · plein tarif CMG':(age<6?' · CMG divisé par deux':' · plus de droit'))));

  const cm=dCmgCalcule(c.mensuel);
  const cbox=document.getElementById('dCmg');
  if(cm.err){cbox.innerHTML='<p class="hint">'+esc(cm.err)+'</p>';}
  else{
    const pourquoi=cm.limite==='cout'
      ? 'Plafonné à '+Math.round((CMG_CFG.taux_max||0.85)*100)+' % du coût : le barème autoriserait '+euro(cm.bareme)+'.'
      : 'Montant du barème. Le plafond des '+Math.round((CMG_CFG.taux_max||0.85)*100)+' % autoriserait jusqu\'à '+euro(cm.cout)+'.';
    cbox.innerHTML='<div class="box">'
      +'<div style="display:flex;justify-content:space-between"><span>Coût mensuel</span><b>'+euro(c.mensuel)+'</b></div>'
      +'<div style="display:flex;justify-content:space-between;color:var(--green);margin-top:4px"><span>CMG estimé</span><b>− '+euro(cm.cmg)+'</b></div>'
      +'<div class="rac"><span>Reste à charge</span><b>'+euro(cm.reste)+'</b></div>'
      +'<p class="hint" style="margin:8px 0 0">'+esc(pourquoi)+' Estimation indicative : seule la CAF fait foi.</p></div>';
  }

  // Le tarif horaire au-delà duquel la famille perd tout droit au CMG.
  const plaf=Number(CMG_CFG.plafond_horaire||10);
  const dep=c.tarif&&c.tarif.mode==='horaire'&&Number(c.tarif.montant)>plaf;
  if(dep)document.getElementById('dCmg').insertAdjacentHTML('afterbegin',
    '<div class="warn"><i class="ti ti-alert-triangle"></i><span>Le tarif retenu dépasse '+plaf
    +' € de l\'heure : au-delà de ce seuil, la famille perd <b>la totalité</b> du CMG, et non une fraction.</span></div>');
}

async function saveDevis(){
  if(!ficheId){toast('Enregistrez d\'abord la demande.',true);return;}
  const c=DCALC||dCalcule();
  if(!c.lignes.length){toast('Rien à chiffrer : vérifiez les jours, les horaires et le tarif.',true);return;}

  /* La contrainte devis_periode_ck refuserait ces dates, mais son message
     Postgres est illisible pour qui saisit un devis. On tranche ici. */
  if(val('dFin')&&val('dDebut')&&val('dFin')<=val('dDebut')){
    toast('La fin de l\'accueil doit être postérieure au début — vérifiez l\'année.',true);
    return;
  }
  /* Un devis sans crèche passe la sauvegarde (la colonne est nullable) mais
     devient invisible partout : la règle de sécurité par organisation ne
     laisse remonter que les devis dont la crèche appartient au réseau. */
  if(!val('dCreche')){
    toast('Choisissez la crèche concernée avant d\'enregistrer ce devis.',true);
    return;
  }
  const cm=dCmgCalcule(c.mensuel);
  const row={
    preinscription_id:ficheId,
    statut:'brouillon',
    creche_id:val('dCreche')||null,
    date_debut:val('dDebut')||null,
    jours:[...document.querySelectorAll('.ckDJour:checked')].map(x=>Number(x.value)),
    heure_debut:val('dHd'),heure_fin:val('dHf'),
    heures_hebdo:c.h||0,semaines_an:Number(val('dSem'))||47,
    date_fin:val('dFin')||null,
    jours_accueil:c.avecTerme&&c.joursPeriode!=null?Math.round(c.joursPeriode):null,
    mois_factures:c.avecTerme?c.mois:null,
    tarif_id:c.tarif?c.tarif.id:null,
    tarif_libelle:c.tarif?c.tarif.libelle:'',
    tarif_mode:c.tarif?c.tarif.mode:'horaire',
    tarif_montant:c.tarif?Number(c.tarif.montant):0,
    total_mensuel:c.mensuel,total_annuel:c.annuel,frais_uniques:c.uniques,
    cmg_estime:cm.err?null:cm.cmg,
    reste_a_charge:cm.err?null:cm.reste,
    commentaire:val('dCom'),notes_internes:val('dNotes')
  };

  const btn=document.getElementById('btnSaveDev');
  btn.disabled=true;
  try{
    let id=devisId;
    if(id){
      row.updated_at=new Date().toISOString();
      const{error}=await sb.from('devis').update(row).eq('id',id);
      if(error)throw error;
    }else{
      // Le numéro vient de devis_numero_seq ; si un trigger le pose déjà,
      // l'insert sans numero passe. Sinon on retombe sur un numéro daté.
      row.created_by=ME?ME.id:null;
      let ins=await sb.from('devis').insert(row).select().single();
      if(ins.error&&ins.error.code==='23502'){
        row.numero='D'+auj().replace(/-/g,'')+'-'+String(Date.now()).slice(-4);
        ins=await sb.from('devis').insert(row).select().single();
      }
      if(ins.error)throw ins.error;
      id=ins.data.id;devisId=id;
    }

    // Les lignes sont remplacées en bloc : un brouillon n'a pas d'historique
    // à préserver, et un devis envoyé n'arrive jamais ici.
    await sb.from('devis_lignes').delete().eq('devis_id',id);
    const lignes=c.lignes.map((l,i)=>({devis_id:id,libelle:l.libelle,description:l.description,
      type:l.type,quantite:l.quantite,montant_unitaire:l.montant_unitaire,total:l.total,ordre:(i+1)*10}));
    if(lignes.length){
      const{error}=await sb.from('devis_lignes').insert(lignes);
      if(error)throw error;
    }

    // Les revenus saisis ici valent pour la fiche : les laisser diverger
    // ferait deux chiffres pour une même famille.
    const rev=val('dRev')===''?null:Number(val('dRev'));
    const p=PRE.find(x=>String(x.id)===String(ficheId));
    if(p&&rev!==p.revenus_foyer){
      await sb.from('preinscriptions').update({revenus_foyer:rev}).eq('id',ficheId);
      p.revenus_foyer=rev;
    }

    toast('Devis enregistré ✅');
    closeOv('ovDevis');
    await loadDevis(ficheId);
  }catch(e){
    console.error('[saveDevis]',e);
    toast('Enregistrement impossible : '+(e.message||'erreur inconnue'),true);
  }finally{btn.disabled=false;}
}

/* Réponse de la famille saisie par la direction (appel, mail, passage sur place).
   Elle porte sur UN devis ; les autres devis de la famille ne bougent pas. Le
   statut de la demande suit tout seul via le déclencheur devis_statut_suivre :
   « Refusé » seulement quand plus aucun devis ni contrat n'est vivant. */
async function repondreDevis(id,statut){
  const d=DEVIS.find(x=>String(x.id)===String(id));
  if(!d)return;
  const refus=statut==='refuse';
  let motif='';
  if(refus){
    const m=prompt('Refuser le devis '+(d.numero||'')+' ?\nMotif (facultatif) :','');
    if(m===null)return;
    motif=m.trim().slice(0,500);
  }else if(!confirm('Marquer le devis '+(d.numero||'')+' comme accepté par la famille ?'))return;
  try{
    const upd={statut:statut,repondu_le:new Date().toISOString()};
    if(refus)upd.motif_refus=motif;
    const{error}=await sb.from('devis').update(upd).eq('id',id).is('repondu_le',null);
    if(error)throw error;
    closeOv('ovDevis');
    await loadDevis(ficheId);
    toast(refus?'Devis refusé.':'Devis accepté.');
  }catch(e){
    console.error('[repondreDevis]',e);
    toast('Mise à jour impossible : '+(e.message||'erreur inconnue'),true);
  }
}

async function delDevis(){
  if(!devisId)return;
  // Chaque devis a ses propres lignes et n'est référencé par rien d'autre :
  // le supprimer n'affecte jamais les autres devis de la même famille.
  const avertissement=DCUR&&DCUR.statut==='accepte'
    ? 'Ce devis a été accepté par la famille. Le supprimer ne modifiera aucun autre devis, '
      +'mais effacera cet engagement — êtes-vous sûr(e) ?'
    : DCUR&&DCUR.statut==='envoye'
    ? 'Ce devis a été envoyé à la famille et son lien deviendra invalide. '
      +'Les autres devis de la famille ne seront pas affectés — confirmer la suppression ?'
    : 'Supprimer ce devis ? Ses lignes seront supprimées avec lui, sans toucher aux autres devis de la famille.';
  if(!confirm(avertissement))return;
  try{
    await sb.from('devis_lignes').delete().eq('devis_id',devisId);
    const{error}=await sb.from('devis').delete().eq('id',devisId);
    if(error)throw error;
    closeOv('ovDevis');
    await loadDevis(ficheId);
    toast('Devis supprimé.');
  }catch(e){
    console.error('[delDevis]',e);
    toast('Suppression impossible : '+(e.message||'erreur inconnue'),true);
  }
}

/* ---------- L'HISTORIQUE DES DEMANDES ---------- */
/* Toutes les demandes, transformées ou non. La file d'attente ne montre que ce
   qui est vivant — les inscrites en sortent, les refusées se noient. Or ce sont
   justement les dossiers clos qui portent l'information de gestion : combien de
   demandes reçues cette année, combien sont devenues des inscriptions, d'où
   viennent les familles, et combien de temps il s'écoule entre le premier
   contact et la signature.

   Aucune table nouvelle : tout est déjà en base. Il manquait l'écran.

   L'année est SCOLAIRE, de septembre à août, parce que c'est l'unité dans
   laquelle une crèche pense ses effectifs. Une demande reçue en juillet 2027
   appartient à l'année 2026-2027, pas à 2027-2028. */
let HDEVIS=null;   // tous les devis du réseau, chargés une fois
let HCONTRATS=null;// tous les contrats d'accueil du réseau, chargés une fois

function anneeScolaire(iso){
  if(!iso)return null;
  const d=String(iso).slice(0,10).split('-').map(Number);
  if(d.length!==3)return null;
  return d[1]>=9?d[0]:d[0]-1;   // septembre ouvre l'année
}
function libelleAnnee(a){return a+'-'+(a+1);}

async function openHisto(){
  openOv('ovHisto');
  document.getElementById('hListe').innerHTML='<p class="hint">Chargement…</p>';

  /* Les devis de tout le réseau, en une fois. On ne charge que ce que
     l'historique affiche — ni lignes, ni signatures, qui pèseraient lourd pour
     rien. */
  if(!HDEVIS){
    try{
      const{data,error}=await sb.from('devis')
        .select('id,preinscription_id,statut,numero,envoye_le,repondu_le,total_mensuel,reste_a_charge,created_at')
        .order('created_at');
      if(error)throw error;
      HDEVIS=data||[];
    }catch(e){
      console.error('[openHisto]',e);
      HDEVIS=[];
      toast('Devis inaccessibles — l\'historique reste lisible sans eux.',true);
    }
  }

  /* Les contrats d'accueil de tout le réseau : c'est ce qui manquait pour que
     l'historique montre le parcours complet d'un dossier — devis, mais aussi
     signature et contresignature du contrat — sans avoir à ouvrir la fiche. */
  if(!HCONTRATS){
    try{
      const{data,error}=await sb.from('contrats')
        .select('id,preinscription_id,type,statut,numero,repondu_le,contresigne_le,total_mensuel')
        .eq('type','initial').order('created_at');
      if(error)throw error;
      HCONTRATS=data||[];
    }catch(e){
      console.warn('[openHisto contrats]',e);
      HCONTRATS=[];
    }
  }

  // Les années présentes dans les données, la plus récente d'abord.
  const annees=[...new Set(PRE.map(p=>anneeScolaire(p.created_at)).filter(a=>a!=null))]
    .sort((a,b)=>b-a);
  document.getElementById('hAnnee').innerHTML=
    '<option value="">Toutes les années</option>'
    +annees.map(a=>'<option value="'+a+'">Année '+libelleAnnee(a)+'</option>').join('');

  document.getElementById('hCreche').innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  setVal('hVue','dossier');
  majStatutsHisto();

  renderHisto();
}

/* Les options du filtre « Statut » dépendent de la vue : les statuts d'une
   demande n'ont pas de sens pour lister des devis individuels. */
function majStatutsHisto(){
  const vue=val('hVue');
  document.getElementById('hStatut').innerHTML=vue==='devis'
    ? '<option value="">Tous les statuts</option>'
      +Object.keys(D_STATUTS).map(x=>'<option value="'+x+'">'+esc(D_STATUTS[x].l)+'</option>').join('')
    : '<option value="">Tous les statuts</option>'
      +ORDRE_STATUTS.map(x=>'<option value="'+x+'">'+esc(STATUTS[x].l)+'</option>').join('');
}
function changerVueHisto(){majStatutsHisto();renderHisto();}

/* Le parcours d'un dossier, reconstitué depuis les devis et le contrat initial
   qui s'y rattachent — le tableau de bord complet d'une demande sans avoir à
   l'ouvrir. */
function parcours(p){
  const ds=(HDEVIS||[]).filter(d=>String(d.preinscription_id)===String(p.id));
  const envoyes=ds.filter(d=>d.envoye_le).sort((a,b)=>String(a.envoye_le).localeCompare(String(b.envoye_le)));
  const accepte=ds.filter(d=>d.statut==='accepte'&&d.repondu_le)
    .sort((a,b)=>String(a.repondu_le).localeCompare(String(b.repondu_le)))[0]||null;
  const refuse=ds.filter(d=>d.statut==='refuse'&&d.repondu_le)
    .sort((a,b)=>String(b.repondu_le).localeCompare(String(a.repondu_le)))[0]||null;
  // Le contrat le plus avancé : contresigné vaut mieux que signé, qui vaut
  // mieux qu'envoyé — un contrat refusé ou annulé ne fait pas progresser.
  const RANG={contresigne:4,signe:3,envoye:2,brouillon:1,expire:0,refuse:0,annule:0};
  const cs=(HCONTRATS||[]).filter(c=>String(c.preinscription_id)===String(p.id));
  const contrat=cs.sort((a,b)=>(RANG[b.statut]||0)-(RANG[a.statut]||0))[0]||null;
  return{
    nbDevis:ds.length,
    premierEnvoi:envoyes.length?envoyes[0].envoye_le:null,
    accepte:accepte,refuse:refuse,contrat:contrat,
    mensuel:contrat?contrat.total_mensuel:(accepte?accepte.total_mensuel:(envoyes.length?envoyes[envoyes.length-1].total_mensuel:null))
  };
}

/* Délai en jours entre deux dates, ou null. */
function delaiJours(a,b){
  if(!a||!b)return null;
  const d0=new Date(String(a).slice(0,10)+'T12:00:00');
  const d1=new Date(String(b).slice(0,10)+'T12:00:00');
  if(isNaN(d0)||isNaN(d1))return null;
  const n=Math.round((d1-d0)/86400000);
  return n>=0?n:null;
}
/* Médiane plutôt que moyenne : un dossier resté six mois en sommeil tirerait la
   moyenne au point de la rendre inutile. */
function mediane(t){
  const v=t.filter(x=>x!=null).sort((a,b)=>a-b);
  if(!v.length)return null;
  const m=Math.floor(v.length/2);
  return v.length%2?v[m]:Math.round((v[m-1]+v[m])/2);
}

function histoFiltre(){
  const an=val('hAnnee'),cre=val('hCreche'),st=val('hStatut');
  const q=val('hSearch').toLowerCase();
  return PRE.filter(p=>{
    if(an&&String(anneeScolaire(p.created_at))!==an)return false;
    if(cre&&String(p.creche_id)!==cre
      &&toArr(p.creches_souhaitees).map(String).indexOf(cre)<0)return false;
    if(st&&p.statut!==st)return false;
    if(q&&((p.prenom||'')+' '+(p.nom||'')+' '+(p.ville||'')+' '+(p.source||''))
      .toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
}

function renderHisto(){
  if(val('hVue')==='devis'){renderHistoDevis();return;}
  const l=histoFiltre();

  /* Les compteurs. Le taux de transformation est le chiffre que réclame un
     gestionnaire : combien de demandes reçues deviennent des enfants accueillis.
     On le calcule sur les dossiers CLOS — inscrits, refusés, sans suite — car
     inclure les dossiers encore en cours le ferait mécaniquement chuter en
     début d'année sans que rien n'aille mal. */
  const n=l.length;
  const inscrits=l.filter(p=>p.statut==='inscrit').length;
  const perdus=l.filter(p=>['refuse','sans_suite'].indexOf(p.statut)>=0).length;
  const clos=inscrits+perdus;
  const enCours=n-clos;
  const taux=clos?Math.round(inscrits/clos*100):null;

  const parc=l.map(parcours);
  const avecDevis=parc.filter(x=>x.premierEnvoi).length;
  const delais=l.map((p,i)=>delaiJours(p.created_at,parc[i].accepte?parc[i].accepte.repondu_le:null));
  const med=mediane(delais);

  const st=(v,lib)=>'<div class="hs"><div class="n">'+v+'</div><div class="l">'+esc(lib)+'</div></div>';
  document.getElementById('hStats').innerHTML=
    st(n,'demandes')
    +st(avecDevis,'devis envoyés')
    +st(inscrits,'inscrits')
    +st(perdus,'refus / sans suite')
    +st(enCours,'en cours')
    +st(taux==null?'—':taux+' %','transformation')
    +st(med==null?'—':med+' j','délai médian');

  const box=document.getElementById('hListe');
  if(!n){
    box.innerHTML='<div class="empty"><i class="ti ti-inbox"></i><p>Aucune demande ne correspond à ces filtres.</p></div>';
    document.getElementById('hNote').textContent='';
    return;
  }

  box.innerHTML=l.map((p,i)=>{
    const x=parc[i];
    const s=STATUTS[p.statut]||STATUTS.nouvelle;
    const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom';
    const cr=nomCreche(p.creche_id)||toArr(p.creches_souhaitees).map(nomCreche).filter(Boolean).join(' · ')||'crèche non retenue';
    // Le parcours, étape par étape. Une étape non franchie reste visible en
    // grisé : c'est là que le dossier s'est arrêté, et c'est l'information.
    const et=(lib,date,ok)=>'<span class="e'+(ok?'':' off')+'">'+esc(lib)
      +(date?' <b>'+dfr(date)+'</b>':'')+'</span>';
    return '<div class="hl" onclick="closeOv(\'ovHisto\');openFiche(\''+p.id+'\')" style="cursor:pointer">'
      +'<div class="t"><span class="n">'+esc(nom)+'</span>'
      +'<span class="tag" style="background:'+s.bg+';color:'+s.fg+'">'+esc(s.l)+'</span>'
      +'<span class="c">'+esc(cr)+(p.source?' · '+esc(p.source):'')+'</span></div>'
      +'<div class="p">'
      +et('Demande',p.created_at,true)
      +et('Devis envoyé',x.premierEnvoi,!!x.premierEnvoi)
      +(x.refuse?et('Refusé',x.refuse.repondu_le,true):et('Accepté',x.accepte?x.accepte.repondu_le:null,!!x.accepte))
      +(x.contrat&&x.contrat.statut==='refuse'?et('Contrat refusé',x.contrat.repondu_le,true)
        :x.contrat&&x.contrat.statut==='contresigne'?et('Contrat contresigné',x.contrat.contresigne_le,true)
        :x.contrat&&x.contrat.statut==='signe'?et('Contrat signé',x.contrat.repondu_le,true)
        :et('Contrat',null,false))
      +et('Inscrit',null,!!p.enfant_id)
      +(x.mensuel?'<span class="e">'+euro(x.mensuel)+' / mois</span>':'')
      +'</div></div>';
  }).join('');

  document.getElementById('hNote').innerHTML=
    'Le taux de transformation porte sur les <b>dossiers clos</b> ('+clos+') : '
    +'inclure les demandes encore en cours le ferait chuter en début d\'année sans qu\'aucune ne soit perdue. '
    +'Le délai médian sépare la demande de l\'acceptation du devis.';
}

/* Vue « Tous les devis » : chaque devis individuellement, quel que soit son
   statut — y compris les brouillons, qu'aucune autre vue ne montre — plutôt
   que le résumé par dossier de la vue « Par dossier ». */
function renderHistoDevis(){
  const an=val('hAnnee'),cre=val('hCreche'),st=val('hStatut'),q=val('hSearch').toLowerCase();
  const byId={};PRE.forEach(p=>{byId[p.id]=p;});
  const l=(HDEVIS||[]).filter(d=>{
    const p=byId[d.preinscription_id];
    if(an&&String(anneeScolaire(d.created_at))!==an)return false;
    if(cre&&!(p&&(String(p.creche_id)===cre||toArr(p.creches_souhaitees).map(String).indexOf(cre)>=0)))return false;
    if(st&&d.statut!==st)return false;
    if(q&&(p?((p.prenom||'')+' '+(p.nom||'')):'').toLowerCase().indexOf(q)<0
      &&(d.numero||'').toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));

  const parStatut={};
  Object.keys(D_STATUTS).forEach(s=>parStatut[s]=0);
  l.forEach(d=>{parStatut[d.statut]=(parStatut[d.statut]||0)+1;});
  document.getElementById('hStats').innerHTML=Object.keys(D_STATUTS)
    .map(s=>'<div class="hs"><div class="n">'+(parStatut[s]||0)+'</div><div class="l">'+esc(D_STATUTS[s].l)+'</div></div>').join('');

  const box=document.getElementById('hListe');
  if(!l.length){
    box.innerHTML='<div class="empty"><i class="ti ti-inbox"></i><p>Aucun devis ne correspond à ces filtres.</p></div>';
    document.getElementById('hNote').textContent='';
    return;
  }
  box.innerHTML=l.map(d=>{
    const p=byId[d.preinscription_id];
    const nom=p?(((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom'):'Demande introuvable';
    const cr=p?(nomCreche(p.creche_id)||toArr(p.creches_souhaitees).map(nomCreche).filter(Boolean).join(' · ')):'';
    const ds=D_STATUTS[d.statut]||D_STATUTS.brouillon;
    return '<div class="hl"'+(p?' onclick="closeOv(\'ovHisto\');openFiche(\''+p.id+'\')" style="cursor:pointer"':'')+'>'
      +'<div class="t"><span class="n">'+esc(nom)+'</span>'
      +'<span class="tag" style="background:'+ds.bg+';color:'+ds.fg+'">'+esc(ds.l)+'</span>'
      +'<span class="c">'+esc(d.numero||'')+(cr?' · '+esc(cr):'')+'</span></div>'
      +'<div class="p">'
      +'<span class="e">créé <b>'+dfr(d.created_at)+'</b></span>'
      +(d.envoye_le?'<span class="e">envoyé <b>'+dfr(d.envoye_le)+'</b></span>':'')
      +(d.repondu_le?'<span class="e">répondu <b>'+dfr(d.repondu_le)+'</b></span>':'')
      +(d.total_mensuel?'<span class="e">'+euro(d.total_mensuel)+' / mois</span>':'')
      +'</div></div>';
  }).join('');
  document.getElementById('hNote').textContent=l.length+' devis.';
}

/* Export pour le gestionnaire. Point-virgule et BOM : Excel en français ouvre
   sinon tout dans une seule colonne. */
function exporterHisto(){
  const l=histoFiltre();
  if(!l.length){toast('Rien à exporter avec ces filtres.',true);return;}
  const parc=l.map(parcours);
  const col=['Prénom','Nom','Crèche','Statut','Origine','Demande le','Devis envoyé le',
             'Accepté le','Refusé le','Motif du refus','Mensualité','Reste à charge','Inscrit'];
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const lignes=l.map((p,i)=>{
    const x=parc[i];
    return [p.prenom||'',p.nom||'',
      nomCreche(p.creche_id)||'',
      (STATUTS[p.statut]||{}).l||p.statut,
      p.source||'',
      dfr(p.created_at),dfr(x.premierEnvoi),
      x.accepte?dfr(x.accepte.repondu_le):'',
      x.refuse?dfr(x.refuse.repondu_le):'',
      x.refuse?(x.refuse.motif_refus||''):'',
      x.mensuel!=null?String(x.mensuel).replace('.',','):'',
      x.accepte&&x.accepte.reste_a_charge!=null?String(x.accepte.reste_a_charge).replace('.',','):'',
      p.enfant_id?'oui':'non'].map(q).join(';');
  });
  const txt='﻿'+col.map(q).join(';')+'\n'+lignes.join('\n');
  const url=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download='koalakids-demandes-'+auj()+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast(l.length+' demande'+(l.length>1?'s':'')+' exportée'+(l.length>1?'s':'')+' ✅');
}

/* ---------- LA BASCULE : préinscription → fiche enfant ---------- */
/* Le dernier pas du module. Une préinscription est une intention ; une fiche
   enfant est une présence, qui pèse sur les effectifs PMI, les commandes de
   repas et les feuilles de présence. On ne franchit ce seuil qu'une fois le
   devis accepté, et jamais automatiquement : c'est un bouton, précédé d'un
   écran qui montre ce qui va être écrit.

   Quatre écritures s'enchaînent — enfant, parents, contrat, rattachement —
   sans transaction possible via PostgREST. L'ordre est donc choisi pour que le
   pire échec soit réparable : si le rattachement final échoue, l'application
   supprime l'enfant qu'elle vient de créer (la cascade emporte parents et
   contrat) plutôt que de laisser un enfant orphelin dans les présences.

   CE QUI NE SUIT PAS. `enfants` ne porte ni PAI, ni médecin, ni adresse, ni
   n° allocataire ; `enfants_parents` n'a ni profession ni téléphone
   professionnel. Ces informations restent sur la préinscription, consultables,
   mais ne sont pas recopiées. L'écran le dit avant d'écrire : le découvrir
   trois semaines plus tard en cherchant le médecin d'un enfant serait pire. */
let BS=null;   // le plan de bascule préparé par ouvrirBascule()

async function ouvrirBascule(){
  const p=ficheId?PRE.find(x=>String(x.id)===String(ficheId)):null;
  if(!p){toast('Enregistrez d\'abord la demande.',true);return;}
  if(p.enfant_id){toast('Cette demande a déjà été basculée.',true);return;}

  /* C'est le CONTRAT contresigné qui commande, et non plus le devis accepté.
     Le devis reste chargé — il figure sur l'écran de vérification, parce qu'il
     dit sur quoi la famille s'était engagée — mais toutes les valeurs
     techniques viennent du contrat : c'est lui qui a été signé. */
  const ct=contratComplet();
  if(!ct){
    const enCours=contratEnCours();
    toast(enCours
      ? 'Le contrat '+(enCours.numero||'')+' n\'est pas encore contresigné : la fiche enfant attend qu\'il soit complet des deux parts.'
      : 'Aucun contrat contresigné : établissez le contrat d\'accueil avant de créer la fiche enfant.',true);
    return;
  }
  const d=devisAccepte();

  const crecheId=ct.creche_id||(d&&d.creche_id)||p.creche_id||null;
  const jours=toArr(ct.jours).map(Number).filter(Boolean);

  BS={pre:p,devis:d,contrat:ct,crecheId:crecheId,jours:jours,homonymes:[]};

  document.getElementById('bsBody').innerHTML='<p class="hint">Vérification en cours…</p>';
  document.getElementById('btnBsGo').disabled=true;
  openOv('ovBascule');

  /* Homonymes : même nom de famille dans le réseau. On ne bloque pas — une
     fratrie porte le même nom, et c'est le cas le plus fréquent — mais on
     montre, parce qu'un doublon créé par erreur ne se voit qu'une fois les
     présences faussées. */
  try{
    if(p.nom&&String(p.nom).trim()){
      const{data}=await sb.from('enfants')
        .select('id,prenom,nom,dob,creche_id')
        .ilike('nom',String(p.nom).trim());
      BS.homonymes=data||[];
    }
  }catch(e){console.warn('[bascule homonymes]',e);}

  rendreBascule();
}

function rendreBascule(){
  const p=BS.pre,d=BS.devis,ct=BS.contrat;
  const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom';
  const li=(k,v)=>'<div class="kvb"><span>'+esc(k)+'</span><b>'+esc(v||'—')+'</b></div>';

  let h='';

  /* Le document qui fonde la bascule, nommé en premier. Trois semaines plus
     tard, savoir de quel contrat cette fiche enfant est née est la première
     question qu'on se pose. */
  h+='<div class="warn" style="background:var(--green-l);color:var(--green)">'
   +'<i class="ti ti-file-certificate"></i><span>Contrat <b>'+esc(ct.numero||'')+'</b>, '
   +'signé par la famille le '+dfr(ct.repondu_le)
   +(ct.repondu_par?' au nom de '+esc(ct.repondu_par):'')
   +', contresigné le '+dfr(ct.contresigne_le)
   +(ct.contresigne_par?' par '+esc(ct.contresigne_par):'')+'.</span></div>';

  // Ce qui manque et qui empêcherait la fiche d'être exploitable.
  const bloquants=[];
  if(!p.prenom&&!p.nom)bloquants.push('la demande n\'a ni prénom ni nom');
  if(!p.dob)bloquants.push('la date de naissance (ou le terme prévu) n\'est pas renseignée');
  if(!BS.crecheId)bloquants.push('aucune crèche retenue');
  if(!BS.jours.length)bloquants.push('le contrat ne porte aucun jour d\'accueil');
  if(!ct.heure_debut||!ct.heure_fin)bloquants.push('le contrat ne porte pas d\'horaires');

  if(bloquants.length){
    h+='<div class="warn"><i class="ti ti-alert-triangle"></i><span><b>Bascule impossible en l\'état.</b><br>'
      +bloquants.map(esc).join('<br>')+'</span></div>';
  }
  // À naître : la bascule reste autorisée, mais avec le terme prévu en
  // guise de date de naissance provisoire — à corriger dès la naissance,
  // faute de quoi la fiche enfant garderait une date fictive.
  if(!bloquants.length&&p.ne_ou_a_naitre==='a_naitre'){
    h+='<div class="warn" style="background:var(--amber-l);color:var(--amber)"><i class="ti ti-alert-triangle"></i><span>'
      +'<b>Enfant encore « à naître ».</b> La fiche sera créée avec le <b>terme prévu</b> ('+dfr(p.dob)+') '
      +'en guise de date de naissance. Corrigez-la sur la fiche enfant dès que la naissance sera connue.</span></div>';
  }

  h+='<div class="sec">L\'enfant qui sera créé</div>'
   +li('Prénom et nom',nom)
   +li(p.ne_ou_a_naitre==='a_naitre'?'Date de naissance (terme prévu)':'Date de naissance',dfr(p.dob))
   +li('Crèche',nomCreche(BS.crecheId))
   +li('Allergies',p.allergies)
   +li('Régime particulier',p.regime_repas||'aucun');

  /* Les dates viennent maintenant du CONTRAT signé, et elles ne devraient plus
     avoir à être corrigées : un contrat sans date de début ne peut pas être
     enregistré. Les champs restent modifiables pour le cas où la famille a
     décalé son arrivée entre la signature et l'entrée effective — mais toute
     divergence est signalée, parce qu'elle fait diverger la feuille de présence
     du document signé. */
  const dDefaut=ct.date_debut||d&&d.date_debut||p.date_entree_souhaitee||'';
  h+='<div class="g2" style="margin-top:10px">'
   +'<div class="f"><label class="lb">Date d\'entrée — début du contrat</label>'
   +'<input id="bsDate" type="date" value="'+esc(dDefaut)+'"></div>'
   +'<div class="f"><label class="lb">Fin du contrat</label>'
   +'<input id="bsDateFin" type="date" value="'+esc(ct.date_fin||'')+'"></div></div>'
   +'<p class="hint">Dates reprises du <b>contrat signé</b>. Ne les modifiez que si l\'arrivée a été '
   +'décalée depuis la signature : la feuille de présence doit correspondre au document que la '
   +'famille a signé, et un écart durable se règle par un avenant, pas ici.</p>';

  h+='<div class="sec">Les parents rattachés <span style="font-size:12px;color:var(--muted);font-weight:600">('+PARENTS.length+')</span></div>';
  if(!PARENTS.length){
    h+='<p class="hint">Aucun parent saisi : la fiche enfant sera créée sans coordonnées. '
      +'Vous pourrez les ajouter ensuite, mais l\'envoi du dossier de familiarisation en dépend.</p>';
  }else{
    h+=PARENTS.map(x=>'<div class="kvb"><span>'+esc(LIENS[x.lien]||'Responsable légal')+'</span><b>'
      +esc(((x.prenom||'')+' '+(x.nom||'')).trim()||'—')
      +(x.email?' · '+esc(x.email):'')+(x.telephone?' · '+esc(x.telephone):'')+'</b></div>').join('');
  }

  h+='<div class="sec">La ligne d\'accueil qui sera créée</div>'
   +li('Jours',BS.jours.map(j=>(JOURS.find(x=>x[0]===j)||[0,''])[1].toLowerCase()).filter(Boolean).join(', '))
   +li('Horaires',(String(ct.heure_debut||'').slice(0,5))+' – '+(String(ct.heure_fin||'').slice(0,5)))
   +li('Repas',ct.repas||'non précisé')
   +li('Mensualité',euro(ct.total_mensuel)+' par mois');
  h+='<p class="hint">Ces valeurs sont celles du <b>contrat signé</b>, et c\'est ce qui a changé : '
   +'jusqu\'ici la ligne d\'accueil était tirée du devis. Elle pilote les feuilles de présence, '
   +'la vue Gantt et l\'export PMI. Le contrat lui restera rattaché : on saura toujours de quel '
   +'document elle est née.</p>';
  if(d&&Number(d.total_mensuel)!==Number(ct.total_mensuel)){
    h+='<div class="warn"><i class="ti ti-alert-triangle"></i><span>'
      +'Le contrat porte '+euro(ct.total_mensuel)+' par mois là où le devis '+esc(d.numero||'')
      +' en portait '+euro(d.total_mensuel)+'. C\'est le <b>contrat</b> qui fait foi — il a été signé. '
      +'Vérifiez simplement que la famille en a bien été informée.</span></div>';
  }

  // Homonymes
  if(BS.homonymes.length){
    h+='<div class="warn"><i class="ti ti-users"></i><span><b>'+BS.homonymes.length+' enfant'
      +(BS.homonymes.length>1?'s portent':' porte')+' déjà ce nom de famille :</b><br>'
      +BS.homonymes.map(e=>esc(((e.prenom||'')+' '+(e.nom||'')).trim())
        +(e.dob?' · né(e) le '+dfr(e.dob):'')+(e.creche_id?' · '+esc(nomCreche(e.creche_id)):'')).join('<br>')
      +'<br>Fratrie, ou doublon ? Vérifiez avant de créer.</span></div>';
  }

  // Ce qui ne sera pas repris — listé seulement si c'est renseigné.
  const perdus=[];
  if(p.pai)perdus.push('le PAI'+(p.pai_detail?' ('+p.pai_detail+')':''));
  if(p.medecin)perdus.push('le médecin traitant');
  if(p.adresse||p.ville)perdus.push('l\'adresse du foyer');
  if(p.num_allocataire)perdus.push('le n° allocataire');
  if(PARENTS.some(x=>x.profession))perdus.push('la profession des parents');
  if(PARENTS.some(x=>x.telephone_pro))perdus.push('le téléphone professionnel');
  if(perdus.length){
    h+='<div class="warn" style="background:var(--violet-l);color:var(--violet)">'
      +'<i class="ti ti-info-circle"></i><span><b>Ne sera pas recopié</b> — la fiche enfant n\'a pas de champ pour : '
      +esc(perdus.join(', '))+'.<br>Ces informations restent sur la demande, qui demeure consultable.</span></div>';
  }

  h+='<p class="hint">La demande passera en <b>Inscrit</b> et sortira de la file active. '
   +'Elle reste accessible par le compteur « Inscrit ».</p>';

  document.getElementById('bsBody').innerHTML=h;
  document.getElementById('btnBsGo').disabled=bloquants.length>0;
}

async function lancerBascule(){
  if(!BS)return;
  const p=BS.pre,d=BS.devis,ct=BS.contrat;
  const dateEntree=val('bsDate');
  const dateFin=val('bsDateFin')||null;
  if(!dateEntree){
    toast('Renseignez la date d\'entrée : le contrat d\'accueil ne peut pas s\'en passer.',true);
    const c=document.getElementById('bsDate');if(c)c.focus();
    return;
  }
  if(dateFin&&dateFin<=dateEntree){
    toast('La fin du contrat doit être postérieure à la date d\'entrée.',true);
    const c=document.getElementById('bsDateFin');if(c)c.focus();
    return;
  }
  const b=document.getElementById('btnBsGo');
  b.disabled=true;b.textContent='Création…';

  let enfantId=null;
  try{
    /* 1. L'enfant. `groupe` n'est pas posé ici : demandes.html le recalcule
       depuis la date de naissance à chaque chargement, et le poser à la main
       reviendrait à écrire une règle en double, qui divergerait. */
    const rowEnfant={
      prenom:p.prenom||'',nom:p.nom||'',
      dob:p.dob||null,
      /* Signale aux autres modules (effectifs, vaccinations, CMG, documents
         famille, contrat…) que cette date est un terme prévu et non une
         naissance confirmée — sans ce marqueur, ils la traiteraient comme
         une vraie date de naissance sans avertir personne. */
      naissance_provisoire:p.ne_ou_a_naitre==='a_naitre',
      creche_id:BS.crecheId,
      date_entree:dateEntree,
      /* `date_sortie` reste vide, même quand une fin de contrat est connue :
         elle marque un départ EFFECTIF, et la poser d'avance ferait disparaître
         l'enfant des listes et des effectifs avant qu'il ne soit parti. C'est
         le contrat qui porte le terme prévu. */
      allergies:p.allergies||'',
      regime_repas:p.regime_repas||null
    };
    const ins=await sb.from('enfants').insert(rowEnfant).select().single();
    if(ins.error)throw ins.error;
    enfantId=ins.data.id;

    // 2. Les parents. Les colonnes absentes côté enfants_parents (profession,
    //    téléphone professionnel) sont volontairement laissées de côté.
    if(PARENTS.length){
      const lignes=PARENTS.map(x=>({
        enfant_id:enfantId,
        lien:x.lien||'autre',
        prenom:x.prenom||'',nom:x.nom||'',
        telephone:x.telephone||'',email:x.email||'',
        destinataire:x.destinataire!==false
      }));
      const{error}=await sb.from('enfants_parents').insert(lignes);
      if(error)throw error;
    }

    /* 3. La ligne d'accueil, tirée du CONTRAT SIGNÉ et non plus du devis.
       C'est le changement de fond du module Contrat : le document produit la
       ligne technique. `repas` suit aussi, ce que le devis ne portait pas. */
    const insCt=await sb.from('enfants_contrats').insert({
      enfant_id:enfantId,
      date_debut:dateEntree,
      date_fin:dateFin,
      jours:BS.jours,
      heure_debut:ct.heure_debut||null,
      heure_fin:ct.heure_fin||null,
      repas:ct.repas||null,
      notes:'Créée à la bascule du contrat '+(ct.numero||'')
    }).select().single();
    if(insCt.error)throw insCt.error;
    const ligneCtId=insCt.data.id;

    /* 4. Le rattachement. `.is('enfant_id',null)` est le garde-fou contre un
       double clic ou une bascule menée en parallèle depuis un autre poste :
       la seconde ne trouve plus de ligne à modifier, et sa fiche enfant est
       défaite juste après. */
    const{data:maj,error:ePre}=await sb.from('preinscriptions')
      .update({enfant_id:enfantId,statut:'inscrit'})
      .eq('id',p.id).is('enfant_id',null).select();
    if(ePre)throw ePre;
    if(!maj||!maj.length)throw new Error('Cette demande vient d\'être basculée ailleurs.');

    /* 5. Le contrat rejoint l'enfant. Cette écriture vient APRÈS le point de
       non-retour, et volontairement : si elle échoue, la fiche enfant est
       complète et exploitable — présences, repas, effectifs PMI — et il ne
       manque qu'un lien, qui se répare d'un clic depuis le module Contrats.
       La défaire aurait détruit un enfant valide pour une colonne manquante.
       C'est pourquoi son échec est signalé sans annuler la bascule. */
    try{
      const{error:eLien}=await sb.from('contrats')
        .update({enfant_id:enfantId,enfants_contrat_id:ligneCtId,
                 updated_at:new Date().toISOString()})
        .eq('id',ct.id);
      if(eLien)throw eLien;
    }catch(x){
      console.error('[bascule rattachement contrat]',x);
      toast('Fiche enfant créée, mais le contrat '+(ct.numero||'')+' n\'a pas pu y être rattaché. '
        +'Signalez-le : le lien se répare sans toucher à la fiche.',true);
    }

    p.enfant_id=enfantId;p.statut='inscrit';
    closeOv('ovBascule');closeOv('ovFiche');
    render();
    toast('Fiche enfant créée ✅ — '+((p.prenom||'')+' '+(p.nom||'')).trim());
  }catch(e){
    console.error('[lancerBascule]',e);
    /* Défaire ce qui a été créé. Supprimer l'enfant emporte parents et contrat
       par cascade. Un enfant à demi créé fausserait les présences et les
       effectifs PMI sans que personne ne sache d'où il sort. */
    if(enfantId){
      try{await sb.from('enfants').delete().eq('id',enfantId);}
      catch(x){console.error('[bascule annulation]',x);}
    }
    const msg=e.code==='42501'
      ? 'Droits insuffisants sur la fiche enfant — exécutez la partie 3 du script 29.'
      : (e.message||'erreur inconnue');
    toast('Bascule impossible : '+msg+' Rien n\'a été créé.',true);
    b.disabled=false;b.innerHTML='<i class="ti ti-check"></i> Créer la fiche enfant';
  }
}
