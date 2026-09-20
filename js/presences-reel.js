/* ============================================================================
   PRÉSENCES — heures réelles des enfants et forfait « journée non pointée »
   ----------------------------------------------------------------------------
   Source : table `pointages` (arrivée / départ de la tablette ou du kiosque),
   contre les horaires des contrats (`enfants_contrats`). Trois vues s'appuient
   sur le même calcul, prCharger() : la colonne « Durée réelle » du Gantt jour,
   le tableau de la semaine et le récapitulatif du mois.

   RÈGLE DE FACTURATION (montant unique, `forfait_non_pointe` dans la config
   des tarifs). Un jour de contrat est facturé au forfait quand :
     - aucune arrivée n'est pointée (une présence cochée à la main ne compte pas) ;
     - une arrivée est pointée mais pas le départ (oubli).
   Exceptions : jour férié, jour de fermeture de la crèche ou du réseau, et absence JUSTIFIÉE déclarée (table
   `enfants_absences`) à partir du 4e jour calendaire — les 3 premiers jours
   d'absence (délai de carence) restent facturés.
   Le jour en cours n'est jamais facturé : la journée n'est pas terminée.
   Le forfait est calculé ici, puis ajouté en ligne aux factures mensuelles par
   factures.html (création des brouillons, ou bouton dans la fiche d'un brouillon).
   Ce fichier ne dépend que de `sb` : il est chargé par demandes.html et factures.html.
   ============================================================================ */
const PR_CARENCE_JOURS=3;
const PR_JOURS_COURTS=['Lun','Mar','Mer','Jeu','Ven'];
let prTarifsCharges=false,prForfaitVal=0;
const PR_TARIFS_ID='00000000-0000-0000-0000-000000000001';
function prIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function prParseJours(j){
  if(typeof ctParseJours==='function')return ctParseJours(j);
  if(j==null)return [];
  let v=j;
  if(typeof v==='string'){const t=v.trim();try{v=JSON.parse(t);}catch(e){v=t.replace(/[{}\[\]"']/g,'').split(',');}}
  if(!Array.isArray(v))v=[v];
  return v.map(x=>parseInt(x,10)).filter(n=>n>=1&&n<=7);
}
/* Forfait « journée non pointée » : lu dans la config des tarifs (montant unique). */
async function prChargerForfait(){
  try{
    const{data,error}=await sb.from('tarifs_repas_config').select('config').eq('id',PR_TARIFS_ID).maybeSingle();
    if(error)throw error;
    prForfaitVal=Number((data&&data.config&&data.config.forfait_non_pointe)||0);
  }catch(e){console.warn('[PR] forfait',e);}
  prTarifsCharges=true;
}

function prAddDays(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return prIso(d);}
function prDiffJours(a,b){return Math.round((new Date(a+'T00:00:00')-new Date(b+'T00:00:00'))/86400000);}
function prFmtDuree(min){
  if(min==null||isNaN(min))return '';
  const m=Math.round(min),h=Math.floor(m/60),r=m%60;
  return h+'h'+String(r).padStart(2,'0');
}
function prFmtEcart(min){return (min<0?'−':'+')+prFmtDuree(Math.abs(min));}
function prEuro(n){return (Math.round(n*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function prHeureMin(t){
  const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));
  return m?parseInt(m[1],10)*60+parseInt(m[2],10):null;
}
function prForfait(){return Number(prForfaitVal)||0;}

/* Jours fériés français (métropole) d'une année, en ISO. */
const _prFeriesCache={};
const _prCache=new Map(); // dernières journées calculées, relues par la correction de départ
function prFeries(an){
  if(_prFeriesCache[an])return _prFeriesCache[an];
  const a=an%19,b=Math.floor(an/100),c=an%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),
    g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,
    l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
    mois=Math.floor((h+l-7*m+114)/31),jour=((h+l-7*m+114)%31)+1;
  const paques=an+'-'+String(mois).padStart(2,'0')+'-'+String(jour).padStart(2,'0');
  const s=new Set([an+'-01-01',an+'-05-01',an+'-05-08',an+'-07-14',an+'-08-15',an+'-11-01',an+'-11-11',an+'-12-25',
    prAddDays(paques,1),prAddDays(paques,39),prAddDays(paques,50)]);
  return _prFeriesCache[an]=s;
}
function prEstFerie(iso){return prFeries(parseInt(iso.slice(0,4),10)).has(iso);}

/* Jours de fermeture saisis dans Paramètres › Fonctionnement : ceux de la crèche
   (etablissements.jours_fermeture) et ceux du réseau (reseau_config.jours_fermeture_reseau).
   Même source que fermetureAt() de demandes.html, relue ici pour que factures.html
   n'en dépende pas. Un jour fermé n'est jamais facturé au forfait. */
let _prFerm=null;
async function prChargerFermetures(){
  const out={parCreche:{},reseau:[]};
  try{
    const{data}=await sb.from('etablissements').select('creche_id,jours_fermeture');
    (data||[]).forEach(function(e){out.parCreche[e.creche_id]=Array.isArray(e.jours_fermeture)?e.jours_fermeture:[];});
  }catch(e){console.warn('[PR] fermetures crèche',e);}
  try{
    const{data}=await sb.from('reseau_config').select('config');
    const cfg=(data&&data[0]&&data[0].config)||{};
    out.reseau=Array.isArray(cfg.jours_fermeture_reseau)?cfg.jours_fermeture_reseau:[];
  }catch(e){console.warn('[PR] fermetures réseau',e);}
  _prFerm=out;
}
function prEstFerme(crecheId,iso){
  if(!_prFerm)return false;
  return ((_prFerm.parCreche[crecheId]||[]).concat(_prFerm.reseau)).some(function(f){return f&&f.debut&&iso>=f.debut&&iso<=(f.fin||f.debut);});
}

async function prPaged(mk){
  let out=[],from=0;
  for(;;){
    const{data,error}=await mk().range(from,from+999);
    if(error)throw error;
    out=out.concat(data||[]);
    if(!data||data.length<1000)break;
    from+=1000;
  }
  return out;
}

/* Calcule, pour chaque enfant et chaque jour de [d1,d2] écoulé, le statut de
   présence réelle. Retourne {calc:Map('enfantId|date'→jour), abs, erreurs}.
   statut : pointe · depart_manquant · non_pointe · absence_carence ·
            absence_deduite · ferie · en_cours · attente */
async function prCharger(enfants,d1,d2){
  if(!prTarifsCharges)await prChargerForfait();
  if(!_prFerm)await prChargerFermetures();
  const calc=new Map(),erreurs=[];
  const ids=enfants.map(e=>e.id);
  if(!ids.length)return{calc:calc,abs:[],erreurs:erreurs};
  const debutISO=new Date(d1+'T00:00:00').toISOString(),finISO=new Date(prAddDays(d2,1)+'T00:00:00').toISOString();
  let cts=[],pts=[],abs=[];
  try{cts=await prPaged(()=>sb.from('enfants_contrats').select('*').in('enfant_id',ids));}catch(e){erreurs.push('contrats');console.warn('[PR] contrats',e);}
  try{pts=await prPaged(()=>sb.from('pointages').select('id,enfant_id,action,horodatage,source').in('enfant_id',ids).gte('horodatage',debutISO).lt('horodatage',finISO).order('horodatage'));}catch(e){erreurs.push('pointages');console.warn('[PR] pointages',e);}
  try{abs=await prPaged(()=>sb.from('enfants_absences').select('*').in('enfant_id',ids).lte('date_debut',d2).gte('date_fin',d1));}catch(e){erreurs.push('absences (table absente ? lancer sql/absences_forfait.sql)');console.warn('[PR] absences',e);}

  const ptsJour={};
  pts.forEach(function(p){
    const dt=new Date(p.horodatage),k=p.enfant_id+'|'+prIso(dt);
    (ptsJour[k]=ptsJour[k]||[]).push({action:p.action,t:dt,id:p.id,source:p.source});
  });
  const ctsEnf={};
  cts.forEach(function(c){(ctsEnf[c.enfant_id]=ctsEnf[c.enfant_id]||[]).push(c);});
  const absEnf={};
  abs.forEach(function(a){(absEnf[a.enfant_id]=absEnf[a.enfant_id]||[]).push(a);});

  const today=prIso(new Date());
  const fin=d2<today?d2:today;
  enfants.forEach(function(e){
    for(let date=d1;date<=fin;date=prAddDays(date,1)){
      if(e.date_sortie&&date>e.date_sortie)break;
      const dj=new Date(date+'T00:00:00').getDay(),wd=dj===0?7:dj;
      let ct=null;
      (ctsEnf[e.id]||[]).forEach(function(c){
        if(c.date_debut&&c.date_debut>date)return;
        if(c.date_fin&&c.date_fin<date)return;
        if(prParseJours(c.jours).indexOf(wd)<0)return;
        if(!ct||(c.date_debut||'')>(ct.date_debut||''))ct=c;
      });
      const jr=ptsJour[e.id+'|'+date]||[];
      const arr=jr.filter(x=>x.action==='arrivee'),dep=jr.filter(x=>x.action==='depart');
      if(!ct&&!arr.length)continue;
      const cmA=ct?prHeureMin(ct.heure_debut):null,cmB=ct?prHeureMin(ct.heure_fin):null;
      const r={enfant_id:e.id,date:date,statut:'',forfait:false,debut:null,fin:null,minutes:null,
        contratMin:(cmA!=null&&cmB!=null&&cmB>cmA)?cmB-cmA:null,contratFin:ct?String(ct.heure_fin||'').slice(0,5):'',sousContrat:!!ct};
      if(arr.length){
        const d0=arr[0].t;
        r.debut=String(d0.getHours()).padStart(2,'0')+':'+String(d0.getMinutes()).padStart(2,'0');
        const depApres=dep.filter(x=>x.t>d0);
        if(depApres.length){
          const d9=depApres[depApres.length-1].t;
          r.fin=String(d9.getHours()).padStart(2,'0')+':'+String(d9.getMinutes()).padStart(2,'0');
          r.minutes=Math.round((d9-d0)/60000);
          r.statut='pointe';
          // Le départ retenu est une correction manuelle : on garde son id pour pouvoir la supprimer.
          if(depApres[depApres.length-1].source==='correction')r.correctionId=depApres[depApres.length-1].id;
        }else if(date===today){
          r.statut='en_cours';
          r.minutes=Math.max(0,Math.round((new Date()-d0)/60000));
        }else{
          r.statut='depart_manquant';r.forfait=true;
        }
      }else if(prEstFerie(date)||prEstFerme(e.creche_id,date)){
        r.statut='ferie';
      }else{
        const ab=(absEnf[e.id]||[]).find(a=>a.date_debut<=date&&a.date_fin>=date&&a.justifiee!==false);
        if(ab){
          if(prDiffJours(date,ab.date_debut)>=PR_CARENCE_JOURS)r.statut='absence_deduite';
          else{r.statut='absence_carence';r.forfait=true;}
        }else if(date===today){
          r.statut='attente';
        }else{
          r.statut='non_pointe';r.forfait=true;
        }
      }
      calc.set(e.id+'|'+date,r);
      _prCache.set(e.id+'|'+date,r);
    }
  });
  return{calc:calc,abs:abs,erreurs:erreurs};
}

const PR_LIBELLES={pointe:'Pointé',en_cours:'Présent (en cours)',depart_manquant:'Départ non pointé',non_pointe:'Non pointé',
  absence_carence:'Absence justifiée (carence)',absence_deduite:'Absence justifiée',ferie:'Jour férié ou fermeture',attente:'En attente de pointage'};

/* Cellule « Durée réelle » du Gantt jour. */
function prCelluleGantt(r,enfantId,dateStr){
  const fo=prForfait();
  const pillO=function(t){return '<span style="display:inline-block;font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:999px;background:#fbd9bd;color:#7a3d0c;white-space:nowrap">'+t+'</span>';};
  const lienDep='<a href="#" onclick="prOuvrirDepart(\''+enfantId+'\',\''+dateStr+'\');return false;" style="font-size:10.5px;color:var(--koala);font-weight:600">Corriger</a>';
  const lien='<a href="#" onclick="prOuvrirAbsence(\''+enfantId+'\',\''+dateStr+'\');return false;" style="font-size:10.5px;color:var(--koala)">Absence</a>';
  if(!r)return '';
  const sub=function(t){return '<div style="font-size:10.5px;color:var(--muted);font-weight:400">'+t+'</div>';};
  if(r.statut==='pointe')return '<b>'+prFmtDuree(r.minutes)+'</b>'+(r.correctionId?sub('départ corrigé · '+prLienSuppr(r.correctionId)):(r.contratMin!=null?sub('contrat '+prFmtDuree(r.contratMin)):''));
  if(r.statut==='en_cours')return '<b>'+prFmtDuree(r.minutes)+'</b>'+sub('en cours');
  if(r.statut==='attente')return sub('en attente');
  if(r.statut==='ferie')return sub('férié ou fermé');
  if(r.statut==='absence_deduite')return '<b style="font-weight:600;color:#0f6e56">Absence</b>'+sub('justifiée, non facturée');
  const lib=r.statut==='depart_manquant'?'départ oublié':(r.statut==='absence_carence'?'carence':'non pointé');
  return pillO('forfait'+(fo>0?' '+prEuro(fo):''))+sub(lib+(r.statut==='absence_carence'?'':' · '+(r.statut==='depart_manquant'?lienDep:lien)));
}

/* ─────────────────────────── Vue semaine ─────────────────────────── */
async function prRenderSemaine(){
  const box=document.getElementById('hebdo-reel-view');
  if(!box)return;
  const crecheId=getPresenceCrecheId();
  if(isDirection&&!crecheId){box.innerHTML='';return;}
  const enfants=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):[...cacheEnfants])
    .sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr',{sensitivity:'base'})||(a.nom||'').localeCompare(b.nom||'','fr',{sensitivity:'base'}));
  if(!enfants.length){box.innerHTML='';return;}
  const ws=weekStart(),jours=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return prIso(d);});
  box.innerHTML='<div style="font-size:12px;color:var(--muted);padding:.5rem 0">Calcul des heures réelles…</div>';
  const res=await prCharger(enfants,jours[0],jours[4]);
  const fo=prForfait();
  let rows='',nb=0,totForfaits=0;
  enfants.forEach(function(e){
    let reel=0,contrat=0,nbF=0,aDonnees=false,cells='';
    jours.forEach(function(d){
      const r=res.calc.get(e.id+'|'+d);
      if(!r){cells+='<td style="text-align:center;color:var(--muted)">—</td>';return;}
      aDonnees=true;
      if(r.statut==='pointe'||r.statut==='en_cours'){reel+=r.minutes||0;cells+='<td style="text-align:center">'+prFmtDuree(r.minutes)+'</td>';}
      else if(r.forfait){nbF++;cells+='<td style="text-align:center"><span style="font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:999px;background:#fbd9bd;color:#7a3d0c">forfait</span></td>';}
      else if(r.statut==='absence_deduite'){cells+='<td style="text-align:center;color:#0f6e56;font-size:11px">absence</td>';}
      else{cells+='<td style="text-align:center;color:var(--muted);font-size:11px">'+(r.statut==='ferie'?'férié':'…')+'</td>';}
      if(r.contratMin!=null&&['pointe','depart_manquant','non_pointe','absence_carence'].indexOf(r.statut)>=0)contrat+=r.contratMin;
    });
    if(!aDonnees)return;
    nb++;totForfaits+=nbF;
    rows+='<tr><td style="white-space:nowrap">'+escHtml(e.prenom+' '+e.nom)+'</td>'+cells
      +'<td style="text-align:right;font-weight:700">'+prFmtDuree(reel)+(nbF?' <span style="font-weight:400;color:#7a3d0c">+ '+nbF+' forfait'+(nbF>1?'s':'')+'</span>':'')+'</td>'
      +'<td style="text-align:right">'+(contrat?prFmtDuree(contrat):'—')+'</td>'
      +'<td style="text-align:right;'+(contrat&&reel<contrat?'color:#a32d2d':'color:#0f6e56')+'">'+(contrat?prFmtEcart(reel-contrat):'—')+'</td>'
      +'<td style="text-align:right">'+(nbF&&fo>0?prEuro(nbF*fo):(nbF?'—':''))+'</td></tr>';
  });
  if(!nb){box.innerHTML='';return;}
  box.innerHTML='<div style="margin-top:22px;border-top:1px solid var(--border);padding-top:14px">'
    +'<div style="font-weight:700;font-size:13.5px;color:var(--koala);margin-bottom:8px"><i class="ti ti-clock-check"></i> Heures réelles de la semaine <span style="font-weight:400;font-size:11.5px;color:var(--muted)">— d’après les pointages tablette, comparées au contrat</span></div>'
    +(res.erreurs.length?'<div style="font-size:12px;color:var(--orange);margin-bottom:6px">Lecture incomplète : '+res.erreurs.join(', ')+'.</div>':'')
    +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums">'
    +'<thead><tr style="border-bottom:2px solid var(--koala);color:var(--muted);font-size:11px"><th style="text-align:left;padding:4px 6px">Enfant</th>'
    +PR_JOURS_COURTS.map(j=>'<th style="padding:4px 6px">'+j+'</th>').join('')
    +'<th style="text-align:right;padding:4px 6px">Réel</th><th style="text-align:right;padding:4px 6px">Contrat</th><th style="text-align:right;padding:4px 6px">Écart</th><th style="text-align:right;padding:4px 6px">Forfaits</th></tr></thead>'
    +'<tbody>'+rows.replace(/<td/g,'<td style="padding:6px;border-bottom:1px solid #f0eef8"').replace(/style="padding:6px;border-bottom:1px solid #f0eef8" style="/g,'style="padding:6px;border-bottom:1px solid #f0eef8;')+'</tbody></table></div></div>';
}

/* ─────────────────────────── Vue mois ─────────────────────────── */
let _prMoisCtx=null;
function prMoisMove(delta){
  const inp=document.getElementById('presence-date');
  const d=new Date((inp.value||todayStr())+'T00:00:00');
  d.setDate(1);d.setMonth(d.getMonth()+delta);
  inp.value=prIso(d);
  renderPresence();
}
async function renderPresenceMois(){
  const box=document.getElementById('presence-mois-view');
  if(!box)return;
  const crecheId=getPresenceCrecheId();
  const ref=new Date((document.getElementById('presence-date').value||todayStr())+'T00:00:00');
  const an=ref.getFullYear(),mo=ref.getMonth();
  const d1=prIso(new Date(an,mo,1)),d2=prIso(new Date(an,mo+1,0));
  const label=ref.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const nav='<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">'
    +'<button class="ibtn" onclick="prMoisMove(-1)" style="padding:5px 9px;font-size:15px">◀</button>'
    +'<span style="font-weight:700;color:var(--koala);font-size:13px;min-width:120px;text-align:center;text-transform:capitalize">'+escHtml(label)+'</span>'
    +'<button class="ibtn" onclick="prMoisMove(1)" style="padding:5px 9px;font-size:15px">▶</button>'
    +'<div style="margin-left:auto;display:flex;gap:8px"><button class="btn-sm" onclick="prOuvrirAbsence()"><i class="ti ti-calendar-off"></i> Déclarer une absence</button>'
    +'<button class="btn-green" onclick="prExportMois()"><i class="ti ti-download"></i> Exporter CSV</button></div></div>';
  if(isDirection&&!crecheId){box.innerHTML=nav+'<div class="empty-state"><i class="ti ti-building"></i><p>Sélectionnez une crèche.</p></div>';return;}
  const enfants=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):[...cacheEnfants])
    .sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr',{sensitivity:'base'})||(a.nom||'').localeCompare(b.nom||'','fr',{sensitivity:'base'}));
  box.innerHTML=nav+'<div style="font-size:12px;color:var(--muted);padding:.5rem 0">Calcul du mois…</div>';
  const res=await prCharger(enfants,d1,d2);
  const fo=prForfait();
  const lignes=[];
  const T={jours:0,reel:0,contrat:0,nf:0};
  enfants.forEach(function(e){
    const L={e:e,jours:0,reel:0,contrat:0,detail:[],corriges:[]};
    for(let d=d1;d<=d2;d=prAddDays(d,1)){
      const r=res.calc.get(e.id+'|'+d);
      if(!r)continue;
      if(r.statut==='pointe'||r.statut==='en_cours'||r.statut==='depart_manquant')L.jours++;
      if(r.statut==='pointe'||r.statut==='en_cours')L.reel+=r.minutes||0;
      if(r.contratMin!=null&&['pointe','depart_manquant','non_pointe','absence_carence'].indexOf(r.statut)>=0)L.contrat+=r.contratMin;
      if(r.forfait)L.detail.push(r);
      if(r.correctionId)L.corriges.push(r);
    }
    if(!L.jours&&!L.contrat&&!L.detail.length)return;
    lignes.push(L);T.jours+=L.jours;T.reel+=L.reel;T.contrat+=L.contrat;T.nf+=L.detail.length;
  });
  _prMoisCtx={lignes:lignes,mois:d1.slice(0,7),forfait:fo,total:T};
  const th='padding:5px 6px;text-align:right;font-size:11px;color:var(--muted);border-bottom:2px solid var(--koala)';
  let body='';
  lignes.forEach(function(L){
    body+='<tr><td style="padding:6px;border-bottom:1px solid #f0eef8">'+escHtml(L.e.prenom+' '+L.e.nom)+'</td>'
      +'<td style="padding:6px;text-align:right;border-bottom:1px solid #f0eef8">'+L.jours+'</td>'
      +'<td style="padding:6px;text-align:right;font-weight:700;border-bottom:1px solid #f0eef8">'+prFmtDuree(L.reel)+'</td>'
      +'<td style="padding:6px;text-align:right;border-bottom:1px solid #f0eef8">'+(L.contrat?prFmtDuree(L.contrat):'—')+'</td>'
      +'<td style="padding:6px;text-align:right;border-bottom:1px solid #f0eef8;color:'+(L.contrat&&L.reel<L.contrat?'#a32d2d':'#0f6e56')+'">'+(L.contrat?prFmtEcart(L.reel-L.contrat):'—')+'</td>'
      +'<td style="padding:6px;text-align:right;border-bottom:1px solid #f0eef8">'+L.detail.length+'</td>'
      +'<td style="padding:6px;text-align:right;border-bottom:1px solid #f0eef8;font-weight:'+(L.detail.length?'700':'400')+'">'+(fo>0?prEuro(L.detail.length*fo):'—')+'</td></tr>';
  });
  const tot='<tr style="font-weight:700"><td style="padding:6px">Total</td><td style="padding:6px;text-align:right">'+T.jours+'</td><td style="padding:6px;text-align:right">'+prFmtDuree(T.reel)+'</td><td style="padding:6px;text-align:right">'+prFmtDuree(T.contrat)+'</td>'
    +'<td style="padding:6px;text-align:right;color:'+(T.reel<T.contrat?'#a32d2d':'#0f6e56')+'">'+(T.contrat?prFmtEcart(T.reel-T.contrat):'—')+'</td><td style="padding:6px;text-align:right">'+T.nf+'</td><td style="padding:6px;text-align:right">'+(fo>0?prEuro(T.nf*fo):'—')+'</td></tr>';
  // Détail des jours facturés au forfait
  let det='';
  lignes.filter(L=>L.detail.length).forEach(function(L){
    det+='<div style="margin-top:8px"><b style="font-size:12px">'+escHtml(L.e.prenom+' '+L.e.nom)+'</b> <span style="font-size:12px;color:var(--muted)">'
      +L.detail.map(function(r){return new Date(r.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+' ('+(PR_LIBELLES[r.statut]||r.statut).toLowerCase()+')'+(r.statut==='depart_manquant'?' <a href="#" onclick="prOuvrirDepart(\''+L.e.id+'\',\''+r.date+'\');return false;" style="color:var(--koala);font-weight:600">Corriger</a>':'');}).join(' · ')+'</span></div>';
  });
  // Départs corrigés à la main (supprimables : la journée redevient « départ oublié »)
  let corr='';
  lignes.filter(L=>L.corriges.length).forEach(function(L){
    corr+='<div style="margin-top:6px;font-size:12px"><b>'+escHtml(L.e.prenom+' '+L.e.nom)+'</b> <span style="color:var(--muted)">'
      +L.corriges.map(function(r){return new Date(r.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+' (départ à '+escHtml(prFmtHM(r.fin))+') '+prLienSuppr(r.correctionId);}).join(' · ')+'</span></div>';
  });
  // Absences déclarées sur le mois
  let absHtml='';
  const nomE={};enfants.forEach(function(e){nomE[e.id]=e.prenom+' '+e.nom;});
  res.abs.slice().sort((a,b)=>a.date_debut.localeCompare(b.date_debut)).forEach(function(a){
    const f=s=>new Date(s+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
    absHtml+='<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0"><span><b>'+escHtml(nomE[a.enfant_id]||'')+'</b> — '+f(a.date_debut)+(a.date_fin!==a.date_debut?' au '+f(a.date_fin):'')
      +' · '+(a.justifiee===false?'non justifiée':'justifiée')+(a.motif?' · '+escHtml(a.motif):'')+'</span>'
      +'<button class="ibtn" title="Supprimer" onclick="prSupprAbsence(\''+a.id+'\')" style="padding:2px 6px"><i class="ti ti-trash"></i></button></div>';
  });
  box.innerHTML=nav
    +(res.erreurs.length?'<div style="font-size:12px;color:var(--orange);margin-bottom:8px">Lecture incomplète : '+res.erreurs.join(', ')+'.</div>':'')
    +(fo>0?'<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Forfait journée non pointée : <b>'+prEuro(fo)+'</b> par jour (unique pour toutes les crèches).</div>'
       :'<div style="font-size:12px;color:var(--orange);margin-bottom:8px">Forfait journée non pointée non défini : renseignez-le dans Semaine › Commande repas › Modifier les tarifs.</div>')
    +(lignes.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums"><thead><tr>'
      +'<th style="'+th+';text-align:left">Enfant</th><th style="'+th+'">Jours présents</th><th style="'+th+'">Heures réelles</th><th style="'+th+'">Heures contrat</th><th style="'+th+'">Écart</th><th style="'+th+'">Jours à forfait</th><th style="'+th+'">Forfaits</th></tr></thead><tbody>'+body+tot+'</tbody></table></div>'
      :'<div class="empty-state"><i class="ti ti-calendar-off"></i><p>Aucune donnée de présence sur ce mois.</p></div>')
    +(det?'<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px"><div style="font-weight:700;font-size:12.5px;color:var(--koala)">Jours facturés au forfait</div>'+det+'</div>':'')
    +(corr?'<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px"><div style="font-weight:700;font-size:12.5px;color:var(--koala)">Départs corrigés à la main</div>'+corr+'</div>':'')
    +'<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px"><div style="font-weight:700;font-size:12.5px;color:var(--koala);margin-bottom:4px">Absences déclarées</div>'
    +(absHtml||'<div style="font-size:12px;color:var(--muted)">Aucune. Une absence justifiée n’est plus facturée à partir du 4e jour (délai de carence de 3 jours).</div>')+'</div>';
}
function prExportMois(){
  const c=_prMoisCtx;
  if(!c||!c.lignes.length){showBanner('Rien à exporter pour ce mois.','error');return;}
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"';
  const n=v=>String(v).replace('.',',');
  const rows=[['Enfant','Jours présents','Heures réelles','Heures contrat','Ecart (min)','Jours à forfait','Forfait unitaire','Montant forfaits']];
  c.lignes.forEach(function(L){
    rows.push([L.e.prenom+' '+L.e.nom,L.jours,prFmtDuree(L.reel),prFmtDuree(L.contrat),L.reel-L.contrat,L.detail.length,n(c.forfait),n(L.detail.length*c.forfait)]);
  });
  rows.push(['TOTAL',c.total.jours,prFmtDuree(c.total.reel),prFmtDuree(c.total.contrat),c.total.reel-c.total.contrat,c.total.nf,n(c.forfait),n(c.total.nf*c.forfait)]);
  const csv='﻿'+rows.map(r=>r.map(q).join(';')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='presences_reelles_'+c.mois+'.csv';
  document.body.appendChild(a);a.click();a.remove();
}

/* ─────────────────────────── Absences ─────────────────────────── */
function prOuvrirAbsence(enfantId,dateStr){
  let ov=document.getElementById('modal-abs-wrap');
  if(!ov){
    ov=document.createElement('div');
    ov.className='overlay';ov.id='modal-abs-wrap';
    ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-abs-wrap');};
    ov.innerHTML='<div class="modal" style="max-width:420px;width:100%">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h3 style="font-size:15px;color:var(--koala);margin:0"><i class="ti ti-calendar-off"></i> Déclarer une absence</h3>'
      +'<button class="btn-cancel" onclick="closeModal(\'modal-abs-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
      +'<div class="fg"><label class="flabel">Enfant</label><select class="finput" id="abs-enfant"></select></div>'
      +'<div style="display:flex;gap:10px"><div class="fg" style="flex:1"><label class="flabel">Du</label><input type="date" class="finput" id="abs-debut"></div>'
      +'<div class="fg" style="flex:1"><label class="flabel">Au</label><input type="date" class="finput" id="abs-fin"></div></div>'
      +'<div class="fg"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="abs-justifiee" checked> Absence justifiée (certificat, prévenance)</label>'
      +'<div style="font-size:11.5px;color:var(--muted);margin-top:4px">Les 3 premiers jours restent facturés au forfait (délai de carence), les suivants ne le sont plus.</div></div>'
      +'<div class="fg"><label class="flabel">Motif (optionnel)</label><input class="finput" id="abs-motif" placeholder="Maladie, hospitalisation…"></div>'
      +'<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn-cancel" onclick="closeModal(\'modal-abs-wrap\')">Annuler</button>'
      +'<button class="btn-primary" onclick="prEnregistrerAbsence()"><i class="ti ti-check"></i> Enregistrer</button></div></div>';
    document.body.appendChild(ov);
  }
  const crecheId=getPresenceCrecheId();
  const enfants=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):[...cacheEnfants])
    .sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr',{sensitivity:'base'}));
  document.getElementById('abs-enfant').innerHTML=enfants.map(e=>'<option value="'+e.id+'">'+escHtml(e.prenom+' '+e.nom)+'</option>').join('');
  if(enfantId)document.getElementById('abs-enfant').value=enfantId;
  const d=dateStr||document.getElementById('presence-date').value||todayStr();
  document.getElementById('abs-debut').value=d;document.getElementById('abs-fin').value=d;
  document.getElementById('abs-justifiee').checked=true;document.getElementById('abs-motif').value='';
  ov.classList.add('open');
}
async function prEnregistrerAbsence(){
  const enfant_id=document.getElementById('abs-enfant').value;
  const date_debut=document.getElementById('abs-debut').value,date_fin=document.getElementById('abs-fin').value;
  if(!enfant_id||!date_debut||!date_fin){showBanner('Renseignez l’enfant et les dates.','error');return;}
  if(date_fin<date_debut){showBanner('La date de fin précède celle de début.','error');return;}
  const{error}=await sb.from('enfants_absences').insert({enfant_id:enfant_id,date_debut:date_debut,date_fin:date_fin,
    justifiee:document.getElementById('abs-justifiee').checked,motif:document.getElementById('abs-motif').value.trim()||null,
    created_by:(currentUser&&currentUser.id)||null});
  if(error){console.warn('[PR] absence',error);showBanner('Absence non enregistrée : '+(error.message||'erreur')+'. La table enfants_absences existe-t-elle ?','error');return;}
  closeModal('modal-abs-wrap');
  showBanner('Absence enregistrée');
  renderPresence();
}
async function prSupprAbsence(id){
  if(!confirm('Supprimer cette absence ? Les jours concernés redeviennent facturables au forfait.'))return;
  const{error}=await sb.from('enfants_absences').delete().eq('id',id);
  if(error){showBanner('Suppression impossible.','error');return;}
  renderPresence();
}

/* ───────────────────── Correction d'un départ oublié ─────────────────────
   Ajoute un pointage « départ » marqué source='correction' (voir
   sql/pointages_correction.sql), au nom de la personne connectée. La journée
   cesse aussitôt d'être facturée au forfait. */
function prFmtHM(t){const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));return m?parseInt(m[1],10)+'h'+m[2]:'';}
function prOuvrirDepart(enfantId,dateStr){
  const r=_prCache.get(enfantId+'|'+dateStr);
  const e=cacheEnfants.find(x=>String(x.id)===String(enfantId));
  if(!r||!e){showBanner('Journée introuvable, rafraîchissez la page.','error');return;}
  let ov=document.getElementById('modal-dep-wrap');
  if(!ov){
    ov=document.createElement('div');
    ov.className='overlay';ov.id='modal-dep-wrap';
    ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-dep-wrap');};
    ov.innerHTML='<div class="modal" style="max-width:400px;width:100%">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h3 style="font-size:15px;color:var(--koala);margin:0"><i class="ti ti-clock-edit"></i> Corriger un départ oublié</h3>'
      +'<button class="btn-cancel" onclick="closeModal(\'modal-dep-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
      +'<div id="dep-info" style="font-size:13px;margin-bottom:10px"></div>'
      +'<div class="fg"><label class="flabel">Heure de départ réelle</label><input type="time" class="finput" id="dep-heure"></div>'
      +'<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">Le départ est ajouté aux pointages, marqué « correction » avec votre nom. La journée cesse alors d\'être facturée au forfait.</div>'
      +'<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn-cancel" onclick="closeModal(\'modal-dep-wrap\')">Annuler</button>'
      +'<button class="btn-primary" onclick="prEnregistrerDepart()"><i class="ti ti-check"></i> Enregistrer le départ</button></div></div>';
    document.body.appendChild(ov);
  }
  ov.dataset.enfant=enfantId;ov.dataset.date=dateStr;ov.dataset.debut=r.debut||'';
  document.getElementById('dep-info').innerHTML='<b>'+escHtml(e.prenom+' '+e.nom)+'</b>, '
    +new Date(dateStr+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})
    +'<br>Arrivée pointée à <b>'+escHtml(prFmtHM(r.debut))+'</b>'+(r.contratFin?', contrat jusqu\'à '+escHtml(prFmtHM(r.contratFin)):'');
  document.getElementById('dep-heure').value=r.contratFin||'';
  ov.classList.add('open');
}
function prLienSuppr(id){
  return '<a href="#" onclick="prSupprimerCorrection(\''+id+'\');return false;" style="color:#a32d2d;font-weight:600">Supprimer</a>';
}
/* Supprime une correction de départ. Le filtre source='correction' garantit
   qu'un vrai pointage tablette ne peut jamais être supprimé d'ici. */
async function prSupprimerCorrection(id){
  if(!confirm('Supprimer ce départ corrigé ? La journée redevient « départ oublié » et sera facturée au forfait tant qu\'un départ n\'est pas saisi.'))return;
  const{data,error}=await sb.from('pointages').delete().eq('id',id).eq('source','correction').select('id');
  if(error){console.warn('[PR] suppression correction',error);showBanner('Suppression impossible : '+(error.message||'erreur'),'error');return;}
  if(!data||!data.length){showBanner('Suppression refusée par la base (droits ou délai dépassé).','error');return;}
  showBanner('Correction supprimée');
  renderPresence();
}
async function prEnregistrerDepart(){
  const ov=document.getElementById('modal-dep-wrap');
  const enfantId=ov.dataset.enfant,dateStr=ov.dataset.date,debut=ov.dataset.debut;
  const heure=document.getElementById('dep-heure').value;
  if(!heure){showBanner('Renseignez l\'heure de départ.','error');return;}
  if(debut&&heure<=debut){showBanner('Le départ doit suivre l\'arrivée ('+prFmtHM(debut)+').','error');return;}
  const e=cacheEnfants.find(x=>String(x.id)===String(enfantId));
  const quand=new Date(dateStr+'T'+heure+':00');
  if(quand>new Date()){showBanner('Ce départ est dans le futur.','error');return;}
  const{error}=await sb.from('pointages').insert({creche_id:e.creche_id,enfant_id:enfantId,action:'depart',
    horodatage:quand.toISOString(),effectue_par:(currentUser&&currentUser.id)||null,source:'correction'});
  if(error){
    console.warn('[PR] correction départ',error);
    showBanner('Départ non enregistré : '+(error.message||'erreur')+(/source_check/.test(error.message||'')?' — lancer sql/pointages_correction.sql.':''),'error');
    return;
  }
  closeModal('modal-dep-wrap');
  showBanner('Départ corrigé');
  renderPresence();
}
