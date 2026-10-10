
// ── UI : ouverture modale ──
function openImportPlanningModal(){
  const sel=document.getElementById('ip-referent');
  const refs=cacheReferents.filter(r=>r.role==='referent');
  sel.innerHTML='<option value="">-- Choisir --</option>'+refs.map(r=>{
    const creche=cacheCreches.find(c=>c.id===r.creche_id)?.name||'';
    return '<option value="'+r.id+'" data-creche="'+creche+'" data-creche-id="'+(r.creche_id||'')+'">'+r.name+(creche?' ('+creche+')':'')+'</option>';
  }).join('');
  sel.onchange=()=>{
    const opt=sel.options[sel.selectedIndex];
    const creche=opt?.dataset?.creche;
    if(creche)document.getElementById('ip-lieu').value=creche;
    const name=opt?.textContent?.split(' (')[0];
    if(name)document.getElementById('ip-prenom').value=name.split(' ')[0];
  };
  document.getElementById('ip-prenom').value='';
  document.getElementById('ip-lieu').value='';
  document.getElementById('ip-filename').textContent='';
  document.getElementById('ip-file-input').value='';
  document.getElementById('ip-step-config').style.display='';
  document.getElementById('ip-step-preview').style.display='none';
  document.getElementById('ip-result').style.display='none';
  document.getElementById('ip-btn-confirm').style.display='none';
  _ipPendingByPerson=null;_ipPendingCrecheId=null;_ipPendingReferentPrenom=null;

  // Si c'est la directrice technique elle-même qui importe (pas la direction), pré-sélectionner son propre profil
  if(!isDirection&&currentProfile?.id){
    sel.value=currentProfile.id;
    sel.onchange();
  }

  // Affiche la zone "dernier import" si un import a déjà été fait pour cette crèche
  const crecheIdForLast=!isDirection?currentProfile?.creche_id:null;
  showLastImportZone(crecheIdForLast);

  document.getElementById('modal-import-planning-wrap').classList.add('open');
}

/* ── Fraîcheur des données importées ────────────────────────────────────────
   Savoir quand remonte le dernier import évite de travailler sur un planning périmé et
   permet d'anticiper le suivant. Le repère existant ne vivait que dans le localStorage de
   l'appareil ayant fait l'import : invisible pour les autres. On lit donc la date en base,
   avec repli sur le repère local — `created_at` n'existe pas forcément sur ces tables, et
   mieux vaut une date locale qu'une date fausse. */
function ipAgeLisible(d){
  const jours=Math.floor((new Date()-d)/86400000);
  if(jours<=0)return "aujourd'hui";
  if(jours===1)return 'hier';
  if(jours<7)return 'il y a '+jours+' jours';
  if(jours<14)return 'il y a une semaine';
  return 'il y a '+Math.floor(jours/7)+' semaines';
}
function ipLibelleFraicheur(prefixe,d){
  if(!d)return '';
  const jours=Math.floor((new Date()-d)/86400000);
  const couleur=jours>=7?'var(--orange-dark)':'var(--muted)';
  return '<span style="color:'+couleur+'">'+prefixe+' '
    +d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' à '
    +d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
    +' · '+ipAgeLisible(d)+'</span>';
}
async function ipDateDernierImportPlanning(crecheId){
  try{
    const{data,error}=await sb.from('planning_equipe').select('created_at')
      .eq('creche_id',crecheId).not('import_batch_id','is',null)
      .order('created_at',{ascending:false}).limit(1);
    if(!error&&data&&data.length&&data[0].created_at)return new Date(data[0].created_at);
  }catch(e){/* colonne absente : on retombe sur le repère local */}
  try{
    const raw=localStorage.getItem('lastImportBatch_'+crecheId);
    if(raw){const d=new Date(JSON.parse(raw).date);if(!isNaN(d))return d;}
  }catch(e){}
  return null;
}
async function ipDateDernierePresence(crecheId,dateStrs){
  try{
    const ids=(cacheEnfants||[]).filter(e=>e.creche_id===crecheId).map(e=>e.id);
    if(!ids.length)return null;
    const{data,error}=await sb.from('presences').select('created_at')
      .in('presence_date',dateStrs).in('enfant_id',ids)
      .order('created_at',{ascending:false}).limit(1);
    if(!error&&data&&data.length&&data[0].created_at)return new Date(data[0].created_at);
  }catch(e){}
  return null;
}

function showLastImportZone(crecheId){
  const zone=document.getElementById('ip-last-import-zone');
  if(!zone)return;
  if(!crecheId){zone.style.display='none';return;}
  const raw=localStorage.getItem('lastImportBatch_'+crecheId);
  if(!raw){zone.style.display='none';return;}
  try{
    const info=JSON.parse(raw);
    const dateFr=new Date(info.date).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    document.getElementById('ip-last-import-text').innerHTML='📌 Dernier import effectué le <strong>'+dateFr+'</strong>. Si une erreur s\'est glissée, vous pouvez l\'annuler avant d\'en refaire un.';
    zone.style.display='';
  }catch(e){zone.style.display='none';}
}

async function resetLastImport(){
  const crecheId=!isDirection?currentProfile?.creche_id:document.getElementById('ip-referent').selectedOptions[0]?.dataset?.crecheId;
  if(!crecheId){alert('Crèche introuvable.');return;}
  const raw=localStorage.getItem('lastImportBatch_'+crecheId);
  if(!raw){alert('Aucun import récent trouvé pour cette crèche.');return;}
  const info=JSON.parse(raw);
  if(!confirm('Annuler le dernier import du '+new Date(info.date).toLocaleString('fr-FR')+' ?\n\nCela supprimera toutes les lignes créées par cet import, dans le planning équipe ET le planning individuel concerné.'))return;

  const btn=document.querySelector('#ip-last-import-zone .btn-cancel');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Suppression…';}

  const{error:err1}=await sb.from('planning_equipe').delete().eq('creche_id',crecheId).eq('import_batch_id',info.batchId);
  let err2=null;
  if(info.referentId){
    const res=await sb.from('planning').delete().eq('referent_id',info.referentId).eq('import_batch_id',info.batchId);
    err2=res.error;
  }

  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i> Réinitialiser ce dernier import';}

  if(err1||err2){
    console.error('[ResetImport]',err1?.message,err2?.message);
    showBanner('Erreur lors de la réinitialisation.','error');
    return;
  }

  localStorage.removeItem('lastImportBatch_'+crecheId);
  peInvalidateAll(crecheId);
  if(info.referentId)planningInvalidateAll(info.referentId);
  document.getElementById('ip-last-import-zone').style.display='none';
  showBanner('Dernier import annulé ✅');
  await renderPlanning();
}

function handleImportPlanningFile(event){
  const file=event.target.files[0];
  if(!file)return;
  const prenomRef=document.getElementById('ip-prenom').value.trim();
  const lieu=document.getElementById('ip-lieu').value;
  const referentId=document.getElementById('ip-referent').value;
  const crecheId=document.getElementById('ip-referent').selectedOptions[0]?.dataset?.crecheId;
  const year=parseInt(document.getElementById('ip-year').value)||new Date().getFullYear();

  if(!referentId){alert('Choisissez d\'abord le/la directeur/trice technique titulaire.');event.target.value='';return;}
  if(!prenomRef){alert('Indiquez son prénom dans le fichier.');event.target.value='';return;}
  if(!lieu){alert('Choisissez la crèche / lieu à appliquer.');event.target.value='';return;}

  document.getElementById('ip-filename').textContent='📄 '+file.name;

  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=new Uint8Array(e.target.result);
      const wb=XLSX.read(data,{type:'array'});

      const allNames=ipExtractAllNames(wb);
      const byPerson={}; // prenom -> {events, warnings}
      allNames.forEach(name=>{byPerson[name]=ipExtractEvents(wb,name,lieu,year);});

      // S'assurer que le prénom de la directrice technique est bien inclus même s'il n'a pas été détecté automatiquement
      // (orthographe différente du premier mot de cellule, etc.)
      if(!byPerson[prenomRef]){byPerson[prenomRef]=ipExtractEvents(wb,prenomRef,lieu,year);}

      _ipPendingByPerson=byPerson;
      _ipPendingReferentId=referentId;
      _ipPendingReferentPrenom=prenomRef;
      _ipPendingCrecheId=crecheId;

      renderImportPlanningPreview(byPerson,prenomRef);
    }catch(err){
      document.getElementById('ip-result').style.display='';
      document.getElementById('ip-result').innerHTML='<div style="color:var(--red);font-size:13px">⚠ Erreur de lecture du fichier : '+err.message+'</div>';
    }
  };
  reader.readAsArrayBuffer(file);
}

const IP_TYPE_LABELS={presence:'🏠 Présence',absent:'❌ Absent',conge:'🌴 Congé',formation:'📚 Formation',reunion:'👥 Réunion',ferie:'🎌 Férié',vacances:'🏖️ Vacances'};
const IP_LABELS_PLAIN={presence:'Présence',absent:'Absent',conge:'Congé',formation:'Formation',reunion:'Réunion',ferie:'Férié',vacances:'Vacances'};

function renderImportPlanningPreview(byPerson,prenomRef){
  document.getElementById('ip-step-config').style.display='none';
  document.getElementById('ip-step-preview').style.display='';

  const names=Object.keys(byPerson);
  const totalEvents=names.reduce((s,n)=>s+byPerson[n].events.length,0);
  const allWarnings=names.flatMap(n=>byPerson[n].warnings);

  if(totalEvents===0){
    document.getElementById('ip-preview-summary').innerHTML='<div style="color:var(--orange);font-size:13px">⚠ Aucun créneau détecté dans ce fichier. Vérifiez le format.</div>';
    document.getElementById('ip-preview-list').innerHTML='';
    document.getElementById('ip-btn-confirm').style.display='none';
  }else{
    document.getElementById('ip-preview-summary').innerHTML=
      '<div style="font-size:13px;color:var(--koala);font-weight:700">✅ '+names.length+' salarié(e)(s) détecté(e)(s), '+totalEvents+' événement(s) au total</div>'+
      '<div style="font-size:11px;color:var(--ink2);margin-top:4px">"'+prenomRef+'" recevra en plus son planning individuel personnel.</div>'+
      '<div style="font-size:11px;color:var(--orange);margin-top:4px">⚠ Les jours déjà renseignés seront remplacés par les données de ce fichier.</div>';

    document.getElementById('ip-preview-list').innerHTML=names.map(name=>{
      const{events}=byPerson[name];
      const isRef=ipNormStr(name)===ipNormStr(prenomRef);
      const badge=isRef?'<span style="font-size:10px;background:var(--koala-light);color:var(--koala);padding:2px 7px;border-radius:8px;margin-left:6px">directeur/trice technique — planning individuel + équipe</span>':'<span style="font-size:10px;background:#f0f0f5;color:#888;padding:2px 7px;border-radius:8px;margin-left:6px">planning équipe</span>';
      const rows=events.map(e=>{
        const dateFr=new Date(e.dateISO+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'});
        const titre=e.merged?e.mergedLabel:(IP_TYPE_LABELS[e.type]+' '+(e.lieu?'@ '+e.lieu:''));
        const horaire=!e.merged&&e.hdebut?('<br><span style="color:var(--ink2)">'+e.hdebut+'–'+e.hfin+'</span>'):'';
        return '<div style="padding:5px 10px;border-bottom:1px solid var(--border);font-size:11px;display:flex;justify-content:space-between;gap:8px"><div>'+dateFr+' — '+titre+horaire+'</div><span style="color:#bbb;white-space:nowrap">"'+e.sourceCell+'"</span></div>';
      }).join('');
      return '<details style="border-bottom:1px solid var(--border)"><summary style="padding:8px 12px;cursor:pointer;font-size:12px;font-weight:700;color:var(--koala)">'+name+badge+' — '+events.length+' jour(s)</summary>'+rows+'</details>';
    }).join('');
    document.getElementById('ip-btn-confirm').style.display='';
  }

  document.getElementById('ip-preview-warnings').innerHTML=allWarnings.length?
    '<div style="font-size:11px;color:var(--orange);background:var(--amber-lt);padding:8px 10px;border-radius:8px;max-height:100px;overflow-y:auto">⚠ '+allWarnings.length+' avertissement(s) :<br>'+allWarnings.join('<br>')+'</div>':'';
}

async function confirmImportPlanning(){
  if(!_ipPendingByPerson||!_ipPendingReferentId||!_ipPendingCrecheId){
    if(!_ipPendingCrecheId){
      document.getElementById('ip-result').style.display='';
      document.getElementById('ip-result').innerHTML='<div style="color:var(--red);font-size:13px">⚠ Impossible de déterminer la crèche du/de la directeur/trice technique sélectionné — vérifiez sa fiche dans l\'annuaire.</div>';
    }
    return;
  }
  const btn=document.getElementById('ip-btn-confirm');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Import en cours…';

  const batchId=(crypto?.randomUUID)?crypto.randomUUID():('batch-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  let savedRef=0,savedEquipe=0,failed=0;

  for(const name in _ipPendingByPerson){
    const{events}=_ipPendingByPerson[name];
    const isRef=ipNormStr(name)===ipNormStr(_ipPendingReferentPrenom);

    for(const e of events){
      const semaine=mondayOfISO(e.dateISO);
      const label=e.merged?e.mergedLabel:(e.lieu||IP_LABELS_PLAIN[e.type]||e.type);

      // Toujours enregistrer dans le planning équipe (toutes les salariées, y compris la directrice technique)
      const{error:errEquipe}=await sb.from('planning_equipe').upsert({
        creche_id:_ipPendingCrecheId,prenom:name,semaine,jour:e.day,type:e.type,label,
        lieu:e.lieu||null,hdebut:e.hdebut||null,hfin:e.hfin||null,pause:e.pause||null,
        source_cell:e.sourceCell,creneau_label:e.merged?null:e.sourceCreneauLabel,
        import_batch_id:batchId
      },{onConflict:'creche_id,prenom,semaine,jour'});
      if(errEquipe){console.error('[PlanningEquipe]',errEquipe.message);failed++;}else{savedEquipe++;}

      // En plus, si c'est la directrice technique titulaire, enregistrer aussi dans son planning individuel.
      // On supprime d'abord tout événement existant ce jour-là (l'upsert sur slot=NULL ne déduplique
      // pas correctement en SQL, NULL n'étant jamais égal à NULL pour une contrainte unique), puis on
      // insère la nouvelle version — ce qui correspond au comportement "remplacer" annoncé dans l'aperçu.
      if(isRef){
        await sb.from('planning').delete().eq('referent_id',_ipPendingReferentId).eq('semaine',semaine).eq('jour',e.day).is('slot',null);
        const ok=await planningSave(_ipPendingReferentId,semaine,{
          day:e.day,slot:null,type:e.type,label,lieu:e.lieu,
          hdebut:e.hdebut,hfin:e.hfin,pause:e.pause,detachType:'',detachDesc:'',multi:true,batchId
        });
        if(ok)savedRef++;else failed++;
      }
    }
  }

  // Mémorise le batch_id du dernier import pour cette crèche, afin que le bouton "Réinitialiser" sache quoi cibler
  localStorage.setItem('lastImportBatch_'+_ipPendingCrecheId,JSON.stringify({batchId,referentId:_ipPendingReferentId,date:new Date().toISOString()}));

  btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Importer ces événements';
  document.getElementById('ip-result').style.display='';
  document.getElementById('ip-result').innerHTML=failed?
    '<div style="color:var(--orange);font-size:13px">⚠ Import partiel : '+savedEquipe+' jour(s) équipe + '+savedRef+' jour(s) directeur/trice technique enregistrés, '+failed+' échec(s). Voir la console.</div>':
    '<div style="color:var(--koala);font-size:13px;font-weight:700">✅ Import terminé : '+savedEquipe+' jour(s) dans le planning équipe, dont '+savedRef+' aussi dans le planning individuel de '+_ipPendingReferentPrenom+'.</div>';
  document.getElementById('ip-btn-confirm').style.display='none';

  await renderPlanning();
}

// ── SUPABASE PLANNING ──
const COORD_REF_ID='b608fd68-3c86-485f-b55c-75f465b03650';
let _planningCache={};
async function planningLoad(referentId,semaineDate){
  const k=referentId+'_'+semaineDate;
  if(_planningCache[k])return _planningCache[k];
  const{data,error}=await sb.from('planning').select('*').eq('referent_id',referentId).eq('semaine',semaineDate);
  if(error){console.error('[Planning]',error.message);return[];}
  _planningCache[k]=data||[];return _planningCache[k];
}
function planningInvalidate(r,s){delete _planningCache[r+'_'+s];}
function planningInvalidateAll(referentId){
  Object.keys(_planningCache).forEach(k=>{if(k.startsWith(referentId+'_'))delete _planningCache[k];});
}
async function planningSave(referentId,semaineDate,ev){
  const row={referent_id:referentId,semaine:semaineDate,jour:ev.day,slot:ev.slot!==undefined?ev.slot:null,
    type:ev.type,label:ev.label||null,lieu:ev.lieu||null,hdebut:ev.hdebut||null,hfin:ev.hfin||null,
    pause:ev.pause||null,detach_type:ev.detachType||null,detach_desc:ev.detachDesc||null,
    import_batch_id:ev.batchId||null};

  // Modification d'un événement existant précis (édition) : update ciblé par id, jamais d'upsert sur jour/slot
  if(ev.id){
    const{error}=await sb.from('planning').update(row).eq('id',ev.id);
    if(error){console.error('[Planning] update:',error.message);return false;}
    planningInvalidate(referentId,semaineDate);return true;
  }

  // Nouvel événement pour le planning directeur technique individuel (multi-événements/jour autorisé) : insert pur
  if(ev.multi){
    const{error}=await sb.from('planning').insert(row);
    if(error){console.error('[Planning] insert:',error.message);return false;}
    planningInvalidate(referentId,semaineDate);return true;
  }

  // Comportement existant (coordinateur, slot 0/1, ou import) : upsert sur jour/slot
  const{error}=await sb.from('planning').upsert(row,{onConflict:'referent_id,semaine,jour,slot'});
  if(error){console.error('[Planning] save:',error.message);return false;}
  planningInvalidate(referentId,semaineDate);return true;
}
async function planningDeleteRow(id,referentId,semaineDate){
  const{error}=await sb.from('planning').delete().eq('id',id);
  if(error){console.error('[Planning] del:',error.message);return false;}
  planningInvalidate(referentId,semaineDate);return true;
}
async function delPlanningEvent(id,referentId,semaine){await planningDeleteRow(id,referentId,semaine);await renderPlanning();}

// ── SAVE EVENT REFERENT ──
async function saveEvent(){
  const type=document.getElementById('e-type').value;
  const fullWeek=document.getElementById('e-full-week').checked;
  const dayVal=parseInt(document.getElementById('e-day').value);
  const userId=currentProfile?.id||currentUser?.id;
  if(!userId){alert('Erreur : profil non chargé.');return;}
  let hdebut='',hfin='',pause='';
  if(!['absent','conge','ferie','vacances'].includes(type)){
    hdebut=document.getElementById('e-hdebut').value;hfin=document.getElementById('e-hfin').value;const pd=document.getElementById('e-pause-debut').value;
    const pf=pd?document.getElementById('e-pause-fin')?.value:'';
    pause=pd&&pf?pd+'-'+pf:'';
    if(hdebut>=hfin){alert("L'heure de fin doit être après l'heure de début.");return;}
  }
  let lieu='';
  if(['presence','formation','reunion'].includes(type)){
    const s=document.getElementById('e-lieu').value;
    lieu=s==='Autre'?document.getElementById('e-lieu-autre').value.trim():s;
    if(!lieu){alert('Indiquez un lieu.');return;}
  }
  let detachType='',detachDesc='';
  if(type==='detachement'){detachType=document.getElementById('e-detach-type').value;detachDesc=document.getElementById('e-detach-desc').value.trim();}
  const labels={presence:'Présence',absent:'Absent',conge:'Congé',formation:'Formation',reunion:'Réunion',detachement:'Détachement',ferie:'Férié',vacances:'Vacances'};
  const label=lieu||(detachType||labels[type]||type);
  const ws=weekStart();const semaine=ipDateToLocalISO(ws);
  const days=fullWeek?[0,1,2,3,4]:[dayVal];
  const btn=document.querySelector('#modal-event-wrap .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Enregistrement…';}
  if(editingPlanningEventId){
    // Édition d'un événement existant précis : update ciblé, jamais de doublon
    await planningSave(userId,semaine,{id:editingPlanningEventId,day:dayVal,slot:null,type,label,lieu,hdebut,hfin,pause,detachType,detachDesc});
  }else{
    // Nouvel événement : insert pur pour autoriser plusieurs événements le même jour
    for(const d of days)await planningSave(userId,semaine,{day:d,slot:null,type,label,lieu,hdebut,hfin,pause,detachType,detachDesc,multi:true});
  }
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Enregistrer';}
  editingPlanningEventId=null;
  closeModal('modal-event-wrap');await renderPlanning();
}

// Le planning « coordinateur » est celui de l'utilisateur connecté lorsqu'il est direction.
// Plusieurs comptes direction peuvent coexister : on ne cherche donc JAMAIS par nom ni par
// simple find(role==='direction'), qui renverrait une direction arbitraire.
function getCoordRef(){
  if(currentProfile?.role==='direction')return currentProfile;
  return cacheReferents.find(r=>r.id===COORD_REF_ID)
      || cacheReferents.find(r=>r.role==='direction')
      || null;
}

// ── SAVE EVENT COORDINATEUR ──
async function saveEventCoord(){
  const coord=getCoordRef();
  if(!coord){alert('Coordinateur introuvable.');return;}
  const ws=weekStart();const semaine=ipDateToLocalISO(ws);
  const type=document.getElementById('ec-type').value;
  const creche=document.getElementById('ec-lieu').value;
  const libre=(document.getElementById('ec-type-libre').value||'').trim();
  const ville=(document.getElementById('ec-ville').value||'').trim();
  if(type==='autre'&&!libre){alert('Précisez l\'intitulé libre.');return;}
  // Libellé affiché dans la grille : l'intitulé libre s'il existe, sinon la crèche, sinon le type.
  const label=libre||creche||type;
  // Lieu retenu pour les IK : la ville saisie prime sur la crèche sélectionnée.
  const lieu=ville||creche||'';
  const day=parseInt(document.getElementById('ec-day').value);
  const slot=parseInt(document.getElementById('ec-slot').value);
  const btn=document.querySelector('#modal-event-coord-wrap .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Enregistrement…';}
  let ok=await planningSave(coord.id,semaine,{day,slot,type,label,lieu});
  // Repli si la colonne « type » de la table planning n'accepte pas encore la valeur « autre » :
  // on conserve l'intitulé libre dans label et on retombe sur « detachement ».
  if(!ok&&type==='autre')ok=await planningSave(coord.id,semaine,{day,slot,type:'detachement',label,lieu});
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Enregistrer';}
  if(!ok)alert('Enregistrement impossible — vérifiez la connexion.');
  closeModal('modal-event-coord-wrap');await renderPlanning();
}

// ── GRILLES ──
function getPlanningGrid(events,referentId,semaine,editable){
  const ws=weekStart();const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  const _pgCrecheId=(cacheReferents.find(r=>r.id===referentId)||{}).creche_id;
  let html='<div class="pg-hd"></div>';
  days5.forEach((d,i)=>{
    const _fermD=fermetureAt(_pgCrecheId,ipDateToLocalISO(d));
    html+='<div class="pg-hd"'+(_fermD?' style="background:var(--red-l,#FDE8E8);color:var(--red,#C62828)" title="'+escHtml(fermetureLabel(_fermD))+'"':'')+'>'+DAYS[i]+'<br><span style="font-size:10px;font-weight:400;opacity:0.7">'+fmt(d)+'</span>'+(_fermD?'<br><span style="font-size:9.5px;font-weight:800"><i class="ti ti-door-off"></i> Fermé</span>':'')+'</div>';
  });
  html+='<div class="pg-time" style="font-size:10px">Journée</div>';
  days5.forEach((_,di)=>{
    const evs=events.filter(e=>(e.jour===di||e.day===di)&&(e.slot===null||e.slot===undefined));
    html+='<div class="'+(editable?'pg-cell':'pg-cell-ro')+'">';
    if(evs.length){
      const labels={presence:'Présence',absent:'Absent',conge:'Congé',formation:'Formation',reunion:'Réunion',detachement:'Détachement',ferie:'Férié',vacances:'Vacances'};
      evs.forEach(ev=>{
        const titre=ev.label||labels[ev.type]||ev.type;
        const del=editable?'<span class="pg-del" onclick="event.stopPropagation();delPlanningEvent(\''+ev.id+'\',\''+referentId+'\',\''+semaine+'\')"><i class="ti ti-x"></i></span>':'';
        let detail='';
        if(ev.hdebut&&ev.hfin)detail+='<div style="font-size:10px;margin-top:3px;opacity:0.85">⏱ '+formatHeure(ev.hdebut)+'–'+formatHeure(ev.hfin)+'</div>';
        if(ev.pause)detail+='<div style="font-size:10px;opacity:0.7">☕ '+ev.pause+'</div>';
        if(ev.detach_desc||ev.detachDesc)detail+='<div style="font-size:10px;margin-top:2px;opacity:0.8;font-style:italic">'+(ev.detach_desc||ev.detachDesc)+'</div>';
        html+='<div class="pg-card '+ev.type+'" '+(editable?'onclick="event.stopPropagation();openEventAt('+di+',\''+ev.id+'\')"':'')+'>'+del+titre+detail+'</div>';
      });
      if(editable)html+='<div class="pg-add-more" onclick="event.stopPropagation();openEventAt('+di+')" title="Ajouter un autre événement ce jour"><i class="ti ti-plus"></i></div>';
    }else if(editable){html+='<div class="pg-add" onclick="openEventAt('+di+')">+ ajouter</div>';}
    else{html+='<div style="text-align:center;padding:1rem;color:#ddd;font-size:11px">—</div>';}
    html+='</div>';
  });
  return html;
}

// Libellé principal d'une case du planning coordinateur : l'intitulé saisi, sinon le lieu.
function pgEvLabel(e){return e.label||e.lieu||e.type;}
// Ville affichée en sous-ligne quand elle diffère du libellé (déplacement hors crèche).
function pgEvVille(e){
  if(!e.lieu||e.lieu===e.label)return'';
  return'<span class="pg-ev-ville">📍 '+e.lieu+'</span>';
}

function getPlanningGridSimple(events,coordId,semaine,crecheIdHint){
  const ws=weekStart();const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  const editable=!!coordId;
  const _pgsCrecheId=crecheIdHint||(cacheReferents.find(r=>r.id===coordId)||{}).creche_id;
  let html='<div class="pg-hd"></div>';
  days5.forEach((d,i)=>{
    const _fermD=fermetureAt(_pgsCrecheId,ipDateToLocalISO(d));
    html+='<div class="pg-hd"'+(_fermD?' style="background:var(--red-l,#FDE8E8);color:var(--red,#C62828)" title="'+escHtml(fermetureLabel(_fermD))+'"':'')+'>'+DAYS[i]+'<br><span style="font-size:10px;font-weight:400;opacity:0.7">'+fmt(d)+'</span>'+(_fermD?'<br><span style="font-size:9.5px;font-weight:800"><i class="ti ti-door-off"></i> Fermé</span>':'')+'</div>';
  });
  ['Matin','Après-midi'].forEach((slot,si)=>{
    html+='<div class="pg-time">'+slot+'</div>';
    days5.forEach((_,di)=>{
      const evs=events.filter(e=>(e.jour===di||e.day===di)&&e.slot===si);
      if(editable){
        html+='<div class="pg-cell" onclick="openCoordEventAt('+di+','+si+')">';
        if(!evs.length)html+='<span style="font-size:10px;color:#ccc">+ ajouter</span>';
        evs.forEach(e=>{html+='<div class="pg-ev '+e.type+'" onclick="event.stopPropagation();delPlanningEvent(\''+e.id+'\',\''+coordId+'\',\''+semaine+'\')">'+
          pgEvLabel(e)+' <i class="ti ti-x" style="font-size:10px;opacity:0.8"></i>'+pgEvVille(e)+'</div>';});
      }else{
        html+='<div class="pg-cell-ro">';
        if(!evs.length)html+='<div style="text-align:center;padding:0.5rem;color:#ddd;font-size:11px">—</div>';
        else evs.forEach(e=>{html+='<div class="pg-ev '+e.type+'" style="opacity:0.85">'+pgEvLabel(e)+pgEvVille(e)+'</div>';});
      }
      html+='</div>';
    });
  });
  return html;
}
