/* toggleLieuField() et onLieuChange() etaient definis ici une premiere fois,
   dans une version anterieure qui ignorait le type « reunion » et le champ
   detachement. Une seconde definition, plus bas et voisine de onTypeChange(),
   les ecrasait au chargement : c'est elle qui s'executait reellement. Modifier
   celle d'ici n'avait donc aucun effet visible. Le doublon mort est supprime,
   la version active reste a cote de onTypeChange(). */
// ── HELPERS HORAIRES ──
function buildTimeOptions(selId,defaultVal){
  const sel=document.getElementById(selId);if(!sel)return;sel.innerHTML='';
  for(let h=6;h<=20;h++)for(let m=0;m<60;m+=30){
    const v=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    const o=document.createElement('option');o.value=v;o.textContent=String(h).padStart(2,'0')+'h'+String(m).padStart(2,'0');
    if(v===defaultVal)o.selected=true;sel.appendChild(o);
  }
}
function initTimeSelects(){
  buildTimeOptions('e-hdebut','08:30');
  buildTimeOptions('e-hfin','17:00');
  // Pause début : de 10h à 15h
  const selD=document.getElementById('e-pause-debut');
  if(selD){
    selD.innerHTML='<option value="">Aucune</option>';
    for(let h=10;h<=15;h++)for(let m=0;m<60;m+=15){
      const v=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
      const o=document.createElement('option');o.value=v;
      o.textContent=String(h).padStart(2,'0')+'h'+String(m).padStart(2,'0');
      if(v==='12:00')o.selected=true;
      selD.appendChild(o);
    }
    selD.onchange=onPauseDebutChange;
    onPauseDebutChange();
  }
}

function onPauseDebutChange(){
  const selD=document.getElementById('e-pause-debut');
  const selF=document.getElementById('e-pause-fin');
  const sep=document.getElementById('e-pause-sep');
  const val=selD?.value;
  if(!val){if(selF)selF.style.display='none';if(sep)sep.style.display='none';return;}
  if(sep)sep.style.display='';
  if(selF){
    selF.style.display='';selF.innerHTML='';
    // Fin : de debut+15min à debut+3h
    const[h,m]=val.split(':').map(Number);
    const startMin=h*60+m+15;
    const endMin=Math.min(h*60+m+180, 18*60);
    for(let total=startMin;total<=endMin;total+=15){
      const fh=Math.floor(total/60);const fm=total%60;
      const fv=String(fh).padStart(2,'0')+':'+String(fm).padStart(2,'0');
      const o=document.createElement('option');o.value=fv;
      o.textContent=String(fh).padStart(2,'0')+'h'+String(fm).padStart(2,'0');
      if(fv===String(h).padStart(2,'0')+':'+(m+60<60?String(m+60).padStart(2,'0'):'00'))o.selected=true;
      selF.appendChild(o);
    }
    // Sélectionner +1h par défaut
    const defFin=String(h+(m+60>=60?1:0)).padStart(2,'0')+':'+String((m+60)%60).padStart(2,'0');
    const defOpt=Array.from(selF.options).find(o=>o.value===defFin);
    if(defOpt)defOpt.selected=true;
  }
}
function formatHeure(h){return h?h.replace(':','h'):''; }

// ── MODAL REFERENT ──
function onTypeChange(){
  const t=document.getElementById('e-type').value;
  document.getElementById('e-horaires-wrap').style.display=['absent','conge','ferie','vacances'].includes(t)?'none':'';
  document.getElementById('e-lieu-wrap').style.display=['presence','formation','reunion'].includes(t)?'':'none';
  document.getElementById('e-lieu-autre-wrap').style.display='none';
  document.getElementById('e-detach-wrap').style.display=t==='detachement'?'':'none';
}
function onLieuChange(){document.getElementById('e-lieu-autre-wrap').style.display=document.getElementById('e-lieu').value==='Autre'?'':'none';}
function toggleLieuField(){onTypeChange();}

let editingPlanningEventId=null;

function openEventModal(){
  initTimeSelects();
  editingPlanningEventId=null;
  document.getElementById('e-day').value='0';
  document.getElementById('e-full-week').checked=false;
  document.getElementById('e-full-week-wrap').style.display='';
  document.getElementById('e-lieu').value='';
  document.getElementById('e-lieu-autre').value='';
  document.getElementById('e-detach-type').value='Formation';
  document.getElementById('e-detach-desc').value='';
  document.getElementById('e-type').value='presence';
  document.getElementById('modal-event-title').textContent='Mon planning — Journée';
  onTypeChange();
  document.getElementById('modal-event-wrap').classList.add('open');
}

function openEventAt(d,eventId){
  openEventModal();
  document.getElementById('e-day').value=d;
  if(!eventId)return; // nouvel événement ce jour (mode ajout)

  // Mode édition : pré-remplir avec l'événement existant trouvé dans le cache courant
  editingPlanningEventId=eventId;
  document.getElementById('e-full-week-wrap').style.display='none'; // pas de sens en édition d'un seul événement
  document.getElementById('modal-event-title').textContent='Modifier l\'événement';
  const userId=currentProfile?.id||currentUser?.id;
  const ws=weekStart();const semaine=ipDateToLocalISO(ws);
  const evs=_planningCache[userId+'_'+semaine]||[];
  const ev=evs.find(e=>e.id===eventId);
  if(!ev)return;
  document.getElementById('e-type').value=ev.type;
  onTypeChange();
  if(ev.hdebut)document.getElementById('e-hdebut').value=ev.hdebut;
  if(ev.hfin)document.getElementById('e-hfin').value=ev.hfin;
  if(ev.pause){
    const[pd,pf]=ev.pause.split('-');
    if(pd)document.getElementById('e-pause-debut').value=pd;
    if(pf){document.getElementById('e-pause-fin').value=pf;document.getElementById('e-pause-fin').style.display='';document.getElementById('e-pause-sep').style.display='';}
  }
  if(ev.lieu){
    const lieuSelect=document.getElementById('e-lieu');
    const knownLieux=[...lieuSelect.options].map(o=>o.value);
    if(knownLieux.includes(ev.lieu)){lieuSelect.value=ev.lieu;}
    else{lieuSelect.value='Autre';document.getElementById('e-lieu-autre-wrap').style.display='';document.getElementById('e-lieu-autre').value=ev.lieu;}
  }
  if(ev.detach_type)document.getElementById('e-detach-type').value=ev.detach_type;
  if(ev.detach_desc)document.getElementById('e-detach-desc').value=ev.detach_desc;
}

// ── MODAL COORDINATEUR ──
// Le champ « Intitulé libre » n'apparaît que pour le type « autre » : il sert de libellé
// affiché dans la grille. Le champ « Ville » alimente ev.lieu, donc directement le calcul
// des frais IK (ikLoadFromPlanning ne lit que ev.lieu).
function onEcTypeChange(){
  const t=document.getElementById('ec-type').value;
  document.getElementById('ec-type-libre-wrap').style.display=(t==='autre')?'':'none';
}

// Villes proposées : crèches du réseau + lieux déjà enregistrés dans la config IK.
function ecFillVilleList(){
  const dl=document.getElementById('ec-ville-list');
  if(!dl)return;
  let lieux=[];
  try{lieux=ikGetConfig().lieux||[];}catch(e){lieux=IK_SITES.slice();}
  dl.innerHTML=lieux.map(l=>'<option value="'+String(l).replace(/"/g,'&quot;')+'">').join('');
}

function ecResetModal(){
  document.getElementById('ec-lieu').value='';
  document.getElementById('ec-type').value='presence';
  document.getElementById('ec-type-libre').value='';
  document.getElementById('ec-ville').value='';
  onEcTypeChange();
  ecFillVilleList();
  // La liste des lieux vient de la config IK partagée : on la rafraîchit sans bloquer l'ouverture.
  if(typeof ikConfigPull==='function')ikConfigPull().then(ecFillVilleList).catch(()=>{});
}

function openEventCoordModal(){
  document.getElementById('ec-day').value='0';document.getElementById('ec-slot').value='0';
  ecResetModal();
  document.getElementById('modal-event-coord-wrap').classList.add('open');
}
function openCoordEventAt(d,s){
  document.getElementById('ec-day').value=d;document.getElementById('ec-slot').value=s;
  ecResetModal();
  document.getElementById('modal-event-coord-wrap').classList.add('open');
}

// ════════════════════════════════════════════════════════════════════════
// ── IMPORT PLANNING EXCEL (équipe) ──
// ════════════════════════════════════════════════════════════════════════

// Lundi ISO de la semaine contenant la date ISO donnée (YYYY-MM-DD)
// Formate un objet Date en YYYY-MM-DD en restant en heure LOCALE (toISOString() convertit en UTC,
// ce qui décale la date d'un jour pour les fuseaux horaires en avance sur UTC, comme la France l'été).
function ipDateToLocalISO(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function mondayOfISO(dateISO){
  const d=new Date(dateISO+'T00:00:00');
  const day=d.getDay();
  const diff=d.getDate()-(day===0?6:day-1);
  const m=new Date(d.getFullYear(),d.getMonth(),diff);
  return ipDateToLocalISO(m);
}

const IP_MOIS_FR={'janvier':0,'janv':0,'jan':0,'fevrier':1,'fevr':1,'fev':1,'mars':2,'mar':2,
  'avril':3,'avr':3,'mai':4,'juin':5,'juillet':6,'juil':6,'aout':7,
  'septembre':8,'sept':8,'sep':8,'octobre':9,'oct':9,'novembre':10,'nov':10,'decembre':11,'dec':11};

function ipNormStr(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}

// Extrait {day, monthRaw} sans résoudre le mois — la résolution se fait au niveau de la semaine entière
function ipParseDayMonthRaw(label){
  const m=String(label||'').match(/(\d{1,2})\s*([A-Za-zÀ-ÿ]+)/);
  if(!m)return null;
  const day=parseInt(m[1]);
  if(isNaN(day))return null;
  const monthRaw=ipNormStr(m[2]).replace(/\.$/,'');
  return {day,monthRaw};
}

// Résout un monthRaw en index de mois (0-11) UNIQUEMENT si non-ambigu (≥4 lettres = distingue juin/juillet, mar/mai, etc.)
function ipResolveUnambiguousMonth(monthRaw){
  if(!monthRaw||monthRaw.length<4)return null; // trop court pour être fiable seul ("Ju","Ma" etc.)
  for(const k in IP_MOIS_FR){if(monthRaw.startsWith(k)||k.startsWith(monthRaw))return IP_MOIS_FR[k];}
  return null;
}
// Résolution permissive (utilisée seulement en dernier recours si aucune colonne de la semaine n'est fiable)
function ipResolveAnyMonth(monthRaw){
  if(!monthRaw)return null;
  for(const k in IP_MOIS_FR){if(monthRaw.startsWith(k)||k.startsWith(monthRaw.slice(0,4)))return IP_MOIS_FR[k];}
  return null;
}

function ipToISO(year,monthIdx,day){return year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');}

// Parse les 5 libellés de colonnes (Lundi→Vendredi) d'une ligne "Sem XX" en dates ISO fiables,
// en s'appuyant sur la cohérence calendaire de la semaine plutôt que sur chaque mois isolément.
function ipParseWeekColumns(labels,refYear,warnings,weekLabel){
  const raws=labels.map(ipParseDayMonthRaw); // [{day,monthRaw}|null, ...] x5
  // 1) Trouver une colonne "ancre" dont le mois est non-ambigu
  let anchorIdx=-1,anchorMonth=null;
  for(let i=0;i<5;i++){
    if(!raws[i])continue;
    const mi=ipResolveUnambiguousMonth(raws[i].monthRaw);
    if(mi!==null){anchorIdx=i;anchorMonth=mi;break;}
  }
  if(anchorIdx===-1){
    // Aucune colonne fiable : on tente une résolution permissive par colonne (dernier recours)
    warnings.push('Semaine "'+weekLabel+'" — aucun mois explicite fiable trouvé, résolution approximative utilisée');
    return raws.map((r,i)=>{
      if(!r)return null;
      const mi=ipResolveAnyMonth(r.monthRaw);
      if(mi===null)return null;
      return {day:i,dateISO:ipToISO(refYear,mi,r.day),label:labels[i]};
    });
  }
  // 2) Construire la date ancre, puis déduire chaque autre colonne par décalage de jours calendaires
  const anchorDate=new Date(refYear,anchorMonth,raws[anchorIdx].day);
  const cols=[];
  for(let i=0;i<5;i++){
    if(!raws[i]){cols.push(null);continue;}
    const expected=new Date(anchorDate);
    expected.setDate(anchorDate.getDate()+(i-anchorIdx));
    // Vérifie que le jour-du-mois donné dans le fichier correspond bien à la date calendaire attendue
    if(expected.getDate()===raws[i].day){
      cols.push({day:i,dateISO:ipDateToLocalISO(expected),label:labels[i]});
    }else{
      // Incohérence : le jour ne correspond pas au décalage attendu — on retente une résolution directe du mois si possible
      const mi=ipResolveUnambiguousMonth(raws[i].monthRaw)??ipResolveAnyMonth(raws[i].monthRaw);
      if(mi!==null){
        cols.push({day:i,dateISO:ipToISO(refYear,mi,raws[i].day),label:labels[i]});
      }else{
        cols.push(null);
        warnings.push('Semaine "'+weekLabel+'" — colonne '+(i+1)+' incohérente : "'+labels[i]+'"');
      }
    }
  }
  return cols;
}

function ipParseCreneauLabel(label){
  const norm=String(label||'').toUpperCase().replace(/\s+/g,'');
  const matches=[...norm.matchAll(/(\d{1,2})H(\d{2})?/g)].map(m=>{
    const h=m[1].padStart(2,'0');const mn=(m[2]||'00').padStart(2,'0');return h+':'+mn;
  });
  if(matches.length<4)return null;
  const[hdebut,finMatin,debutAprem,hfin]=matches;
  return{hdebut,hfin,pause:finMatin+'-'+debutAprem};
}
// ── Rendu visuel des créneaux horaires (colonne “Horaire” du planning équipe) ──────────
// Le libellé brut vient du fichier Excel (ex: “07H00-12H00/12H30-14H30”). On en extrait les
// paires d’heures pour un affichage lisible : une ligne par plage, la durée de pause entre
// les deux, et le total travaillé en pastille.
function peFmtDuree(mins){
  const h=Math.floor(mins/60),m=mins%60;
  return m?h+'h'+String(m).padStart(2,'0'):h+'h';
}
function peCreneauSegments(label){
  const norm=String(label||'').toUpperCase().replace(/\s+/g,'');
  const t=[...norm.matchAll(/(\d{1,2})H(\d{2})?/g)].map(m=>parseInt(m[1],10)*60+parseInt(m[2]||'0',10));
  if(t.length<2||t.length%2)return null;
  const segs=[];
  for(let i=0;i<t.length;i+=2){
    if(t[i+1]<=t[i])return null;
    segs.push([t[i],t[i+1]]);
  }
  return segs;
}
function peFmtHeure(mins){
  return String(Math.floor(mins/60)).padStart(2,'0')+'h'+String(mins%60).padStart(2,'0');
}
// fsMain / fsSub : tailles de police adaptées au contexte (écran ou impression compacte)
function peRenderCreneau(label,fsMain,fsSub){
  const segs=peCreneauSegments(label);
  if(!segs)return '<span style="font-size:'+fsMain+';word-break:break-word">'+String(label||'')+'</span>';
  let total=0,out='<div style="font-variant-numeric:tabular-nums">';
  segs.forEach((sg,i)=>{
    total+=sg[1]-sg[0];
    if(i>0){
      const pause=sg[0]-segs[i-1][1];
      if(pause>0)out+='<div style="white-space:nowrap;font-size:'+fsSub+';color:#9C9AA8;font-weight:500;padding:1px 0">pause '+peFmtDuree(pause)+'</div>';
    }
    out+='<div style="white-space:nowrap;font-size:'+fsMain+';font-weight:700;color:#3D3580">'+
         peFmtHeure(sg[0])+'<span style="opacity:.4;font-weight:400;padding:0 2px">→</span>'+peFmtHeure(sg[1])+'</div>';
  });
  out+='<div style="display:inline-block;margin-top:3px;background:#EFEEF7;color:#3D3580;border-radius:999px;'+
       'padding:1px 7px;font-size:'+fsSub+';font-weight:700;white-space:nowrap">'+peFmtDuree(total)+'</div>';
  return out+'</div>';
}

function ipDetectSpecialType(cellText){
  const t=ipNormStr(cellText);
  if(t.includes('ferie'))return 'ferie';
  if(t.includes('vacances'))return 'vacances';
  if(t.includes('reunion'))return 'reunion';
  if(t.includes('formation')||t.includes('contes'))return 'formation';
  if(t.includes('absent')||t.includes('arret')||t.includes('maladie'))return 'absent';
  return null;
}
function ipIsFerieCell(cellText){return ipNormStr(cellText).includes('ferie');}

// Détecte si une autre crèche est explicitement mentionnée dans la cellule (ex: "Miline contes PICOT2")
// et retourne son nom canonique, sinon null.
const IP_CRECHES_CANON={
  'brunet':'Brunet','cuers':'Cuers','ollioules':'Ollioules',
  'st jean':'St Jean','stjean':'St Jean','saint jean':'St Jean',
  'picot 1':'Picot 1','picot1':'Picot 1','picot 2':'Picot 2','picot2':'Picot 2'
};
function ipDetectLieuMentionne(cellText){
  const t=ipNormStr(cellText);
  for(const k in IP_CRECHES_CANON){if(t.includes(k))return IP_CRECHES_CANON[k];}
  return null;
}

function ipCellMatchesName(cellText,targetName){
  const norm=ipNormStr(cellText),target=ipNormStr(targetName);
  if(!norm||!target)return false;
  const re=new RegExp('\\b'+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b');
  return re.test(norm);
}

// Mots-clés à exclure quand on détecte automatiquement les prénoms (ne sont pas des noms de personnes)
const IP_MOTS_EXCLUS=new Set(['ferier','ferie','reunion','rt','contes','formation','absent','arret','maladie',
  'brunet','cuers','ollioules','st','jean','saint','picot','1','2']);

// Détecte automatiquement tous les prénoms distincts présents dans les cellules de créneaux du classeur,
// en ignorant les mots-clés spéciaux (FERIER, réunion, contes, noms de crèches...).
function ipExtractAllNames(workbook){
  const allRows=[];
  workbook.SheetNames.forEach(name=>{
    const sheet=workbook.Sheets[name];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
    allRows.push(...rows);
  });
  const names=new Set();
  let inWeekSection=false;
  for(const row of allRows){
    const firstCell=String(row[0]||'').trim();
    if(/^Sem\s*\d+/i.test(firstCell)){inWeekSection=true;continue;}
    if(!inWeekSection||!/^\d{1,2}\s*H/i.test(firstCell))continue;
    for(let c=1;c<=5;c++){
      const cellText=String(row[c]||'').trim();
      if(!cellText)continue;
      // Premier "mot" de la cellule = le prénom (le reste peut être "réunion RT", "contes PICOT2", etc.)
      const firstWord=cellText.split(/\s+/)[0];
      const normWord=ipNormStr(firstWord);
      if(normWord&&!IP_MOTS_EXCLUS.has(normWord)&&/^[a-zà-ÿ-]+$/i.test(firstWord)){
        names.add(firstWord);
      }
    }
  }
  return[...names].sort();
}

// Parse le classeur entier (toutes les feuilles — une conversion PDF→Excel crée souvent une feuille par page)
// et extrait les événements pour un prénom donné
function ipExtractEvents(workbook,targetName,lieuFixe,refYear){
  const allRows=[];
  workbook.SheetNames.forEach(name=>{
    const sheet=workbook.Sheets[name];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
    allRows.push(...rows);
  });
  const rows=allRows;
  const events=[],warnings=[];
  let currentWeekCols=null,currentWeekRows=[];
  const ferieDaysAdded=new Set();

  function flushFerieCheck(){
    if(!currentWeekCols)return;
    for(let c=0;c<5;c++){
      const col=currentWeekCols[c];
      if(!col)continue;
      const cellValues=currentWeekRows.map(r=>r[c+1]).filter(v=>v);
      if(cellValues.length&&cellValues.every(v=>ipIsFerieCell(v))){
        if(!ferieDaysAdded.has(col.dateISO)){
          events.push({dateISO:col.dateISO,day:col.day,type:'ferie',lieu:'',hdebut:'',hfin:'',pause:'',
            sourceCell:'FERIE (jour entier)',sourceCreneauLabel:'—'});
          ferieDaysAdded.add(col.dateISO);
        }
      }
    }
  }

  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    const firstCell=String(row[0]||'').trim();

    if(/^Sem\s*\d+/i.test(firstCell)){
      flushFerieCheck();
      currentWeekRows=[];
      const labels=[1,2,3,4,5].map(c=>row[c]);
      currentWeekCols=ipParseWeekColumns(labels,refYear,warnings,firstCell);
      continue;
    }

    if(currentWeekCols&&/^\d{1,2}\s*H/i.test(firstCell)){
      currentWeekRows.push(row);
      const creneau=ipParseCreneauLabel(firstCell);
      if(!creneau){
        warnings.push('Créneau illisible : "'+firstCell+'" (ligne '+(i+1)+') — ignoré');
        continue;
      }
      for(let c=1;c<=5;c++){
        const cellText=row[c];
        if(!cellText)continue;
        if(ipCellMatchesName(cellText,targetName)){
          const col=currentWeekCols[c-1];
          if(!col){warnings.push('Ligne '+(i+1)+' col '+c+' : trouvé "'+targetName+'" mais date de colonne illisible');continue;}
          const special=ipDetectSpecialType(cellText);
          const type=special||'presence';
          const lieuMentionne=ipDetectLieuMentionne(cellText);
          const lieuFinal=lieuMentionne||lieuFixe;
          events.push({
            dateISO:col.dateISO,day:col.day,type,
            lieu:(type==='presence'||type==='formation'||type==='reunion')?lieuFinal:'',
            hdebut:(type==='conge'||type==='absent'||type==='ferie'||type==='vacances')?'':creneau.hdebut,
            hfin:(type==='conge'||type==='absent'||type==='ferie'||type==='vacances')?'':creneau.hfin,
            pause:(type==='conge'||type==='absent'||type==='ferie'||type==='vacances')?'':creneau.pause,
            sourceCell:String(cellText),sourceCreneauLabel:firstCell
          });
        }
      }
    }
  }
  flushFerieCheck();

  // Avertir si le prénom n'a jamais été trouvé explicitement (seuls des jours fériés génériques détectés)
  const foundNominally=events.some(e=>e.sourceCell!=='FERIE (jour entier)');
  if(!foundNominally){
    warnings.unshift('⚠ Le prénom "'+targetName+'" n\'apparaît dans aucune cellule du fichier — vérifiez l\'orthographe. '+(events.length?'Seul(s) jour(s) férié(s) détecté(s) ci-dessous.':''));
  }

  // Fusionner les activités multiples du même jour (ex: "contes" + présence normale) en une description combinée,
  // car le planning directrice technique ne peut stocker qu'une seule case par jour.
  const IP_LABELS_FOR_MERGE={presence:'Présence',absent:'Absent',conge:'Congé',formation:'Formation',reunion:'Réunion'};
  const byDate={};
  const order=[];
  events.forEach(e=>{
    if(!byDate[e.dateISO]){byDate[e.dateISO]=[];order.push(e.dateISO);}
    byDate[e.dateISO].push(e);
  });
  const merged=order.map(dateISO=>{
    const list=byDate[dateISO];
    if(list.length===1)return list[0];
    // Plusieurs activités le même jour : fusion en une seule case combinée
    const combinedLabel=list.map(e=>{
      const lbl=IP_LABELS_FOR_MERGE[e.type]||e.type;
      const lieuTxt=e.lieu?' '+e.lieu:'';
      const horaireTxt=e.hdebut?' ('+e.hdebut+'-'+e.hfin+')':'';
      return lbl+lieuTxt+horaireTxt;
    }).join(' + ');
    // On garde le type/horaires du premier segment pour les champs structurés, mais le label texte porte toute l'info
    const first=list[0];
    return{
      dateISO,day:first.day,type:first.type,
      lieu:first.lieu,hdebut:first.hdebut,hfin:first.hfin,pause:first.pause,
      sourceCell:list.map(e=>e.sourceCell).join(' / '),
      sourceCreneauLabel:list.map(e=>e.sourceCreneauLabel).join(' / '),
      merged:true,mergedLabel:combinedLabel
    };
  });

  merged.sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  return{events:merged,warnings};
}

let _ipPendingReferentId=null,_ipPendingByPerson=null,_ipPendingReferentPrenom=null,_ipPendingCrecheId=null;
