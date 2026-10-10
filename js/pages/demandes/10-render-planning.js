
// ── RENDER PLANNING ──
async function renderPlanning(){
  const ws=weekStart();const semaine=ipDateToLocalISO(ws);
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  document.getElementById('week-label').textContent=fmt(days5[0])+' – '+fmt(days5[4])+' (S'+hebdoNumSemaine(days5[0])+')';
  const iAmCoord=currentProfile?.role==='direction';
  const userId=currentProfile?.id||currentUser?.id||'dir';
  const coord=getCoordRef();
  const addBtn=document.getElementById('planning-add-btn');
  const refLabel=document.getElementById('planning-ref-label');
  const refSelect=document.getElementById('planning-ref-select');
  const topBadge=document.getElementById('planning-top-badge');
  const coordBadge=document.getElementById('planning-coord-badge');
  const coordAdd=document.getElementById('planning-coord-add-btn');
  const coordLabel=document.getElementById('planning-coord-label');
  const coordSelect=document.getElementById('planning-coord-select');
  const importBtn=document.getElementById('planning-import-btn');
  const gridMine=document.getElementById('planning-grid-mine');
  const gridOther=document.getElementById('planning-grid-other');
  if(iAmCoord){
    if(addBtn)addBtn.style.display='none';
    if(importBtn)importBtn.style.display='none';
    if(refLabel)refLabel.style.display='none';
    if(refSelect){refSelect.style.display='';
      if(refSelect.options.length<=1){
        const refs=cacheReferents.filter(r=>r.role!=='direction');
        refSelect.innerHTML='<option value="">-- Choisir un/une directeur/trice technique --</option>'+refs.map(r=>'<option value="'+r.id+'">'+r.name+'</option>').join('');
      }
    }
    if(topBadge){topBadge.textContent='👁 Lecture seule';topBadge.style.background='#f0f0f5';topBadge.style.color='#888';}
    const selectedId=refSelect?.value;
    if(gridMine){
      if(!selectedId)gridMine.innerHTML='<div style="text-align:center;padding:2rem;color:#bbb;font-size:13px">Sélectionnez un/une directeur/trice technique</div>';
      else{if(!_syncSilencieuse)gridMine.innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement…</div>';
        const evs=await planningLoad(selectedId,semaine);gridMine.innerHTML=getPlanningGrid(evs,selectedId,semaine,false);}
    }
    // Bloc du bas : tout compte direction peut choisir de voir/éditer SON propre planning,
    // ou de consulter (lecture seule) celui d'un autre membre de la direction (ex. le coordinateur
    // principal). Ceci corrige le cas où un autre compte "direction" (ex. Andy Janin, Cyril Gabriel)
    // ne voyait jamais que son propre planning et jamais celui du coordinateur.
    const dirAccounts=cacheReferents.filter(r=>r.role==='direction');
    if(coordSelect){
      coordSelect.style.display=dirAccounts.length>1?'':'none';
      if(coordLabel)coordLabel.textContent=dirAccounts.length>1?'Planning direction':'Planning du coordinateur';
      const opts=dirAccounts.map(r=>'<option value="'+r.id+'">'+r.name+(r.id===currentProfile.id?' (moi)':'')+'</option>').join('');
      if(coordSelect.options.length<=1||coordSelect.getAttribute('data-count')!=String(dirAccounts.length)){
        coordSelect.innerHTML=opts;
        coordSelect.value=currentProfile.id;
        coordSelect.setAttribute('data-count',String(dirAccounts.length));
      }
    }
    const viewedCoordId=(coordSelect&&coordSelect.value)||currentProfile.id;
    const viewedCoord=dirAccounts.find(r=>r.id===viewedCoordId)||currentProfile;
    const isOwnCoordPlanning=viewedCoordId===currentProfile.id;
    if(coordBadge){
      if(isOwnCoordPlanning){coordBadge.textContent='✏️ Modifiable';coordBadge.style.background='var(--koala-light)';coordBadge.style.color='var(--koala)';}
      else{coordBadge.textContent='👁 Lecture seule';coordBadge.style.background='#f0f0f5';coordBadge.style.color='#888';}
    }
    if(coordAdd)coordAdd.style.display=isOwnCoordPlanning?'':'none';
    if(gridOther){
      if(!viewedCoord)gridOther.innerHTML='<div style="text-align:center;padding:2rem;color:#bbb;font-size:13px">—</div>';
      else{if(!_syncSilencieuse)gridOther.innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement…</div>';
        const cEvs=await planningLoad(viewedCoord.id,semaine);gridOther.innerHTML=getPlanningGridSimple(cEvs,isOwnCoordPlanning?viewedCoord.id:null,semaine,viewedCoord.creche_id);}
    }
  }else{
    if(!userId||userId==='dir'){setTimeout(()=>renderPlanning(),500);return;}
    if(addBtn)addBtn.style.display='';
    if(importBtn)importBtn.style.display='';
    if(refSelect)refSelect.style.display='none';
    if(refLabel){refLabel.style.display='';refLabel.textContent=currentProfile?.name||'Mon planning';}
    if(topBadge){topBadge.textContent='✏️ Modifiable';topBadge.style.background='var(--koala-light)';topBadge.style.color='var(--koala)';}
    if(gridMine){if(!_syncSilencieuse)gridMine.innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement…</div>';
      const evs=await planningLoad(userId,semaine);gridMine.innerHTML=getPlanningGrid(evs,userId,semaine,true);}
    if(coordBadge){coordBadge.textContent='👁 Lecture seule';coordBadge.style.background='#f0f0f5';coordBadge.style.color='#888';}
    if(coordAdd)coordAdd.style.display='none';
    if(gridOther){
      if(!coord)gridOther.innerHTML='<div style="text-align:center;padding:2rem;color:#bbb;font-size:13px">Coordinateur non disponible</div>';
      else{if(!_syncSilencieuse)gridOther.innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement…</div>';
        const cEvs=await planningLoad(coord.id,semaine);gridOther.innerHTML=getPlanningGridSimple(cEvs,null,semaine,coord.creche_id);}
    }
  }
  await renderPlanningEquipe();
}

// ── PLANNING ÉQUIPE (toutes les salariées d'une crèche, importé depuis Excel) ──
let _peCache={};
async function peLoad(crecheId,semaineDate){
  const k=crecheId+'_'+semaineDate;
  if(_peCache[k])return _peCache[k];
  const{data,error}=await sb.from('planning_equipe').select('*').eq('creche_id',crecheId).eq('semaine',semaineDate);
  if(error){console.error('[PlanningEquipe]',error.message);return[];}
  _peCache[k]=data||[];return _peCache[k];
}
function peInvalidate(crecheId,semaineDate){delete _peCache[crecheId+'_'+semaineDate];}
function peInvalidateAll(crecheId){
  Object.keys(_peCache).forEach(k=>{if(k.startsWith(crecheId+'_'))delete _peCache[k];});
}

// ── SYNCHRONISATION AVEC LE PLANNING INDIVIDUEL DE LA DIRECTRICE TECHNIQUE ──
// Comme lors d'un import Excel/PDF : toute personne du planning équipe qui
// correspond à la directrice technique titulaire de la crèche voit aussi son
// planning individuel (table "planning", celui affiché en haut de l'onglet
// et sur collaborateur.html) mis à jour automatiquement.
function peFindReferentIdForPrenom(crecheId,prenom,silent){
  const target=ipNormStr(prenom);
  if(!target)return null;
  // Clé de rapprochement, par ordre de priorité : le prénom réglé explicitement sur
  // la fiche directeur technique (referents.planning_nom — l'équivalent, pour ce
  // module, du prénom qu'on choisissait déjà lors d'un import Excel/PDF), sinon
  // celui de la fiche employé liée (employes.planning_nom, cf.
  // sql/collaborateurs_planning_nom.sql), sinon le nom de la fiche referents.
  const ref=(cacheReferents||[]).find(r=>{
    if(r.creche_id!==crecheId)return false;
    if(r.planning_nom)return ipNormStr(r.planning_nom)===target;
    const emp=r.employe_id?(cacheEmployes||[]).find(e=>e.id===r.employe_id):null;
    if(emp&&emp.planning_nom)return ipNormStr(emp.planning_nom)===target;
    if(!r.name)return false;
    // Tolère "Prénom Nom" comme "Nom Prénom" : on compare à chaque mot du nom complet.
    return String(r.name).trim().split(/\s+/).some(w=>ipNormStr(w)===target);
  });
  if(!ref&&!silent)console.warn('[PlanningEquipe] Aucun directeur/trice technique de cette crèche ne correspond au prénom "'+prenom+'" — son planning individuel ne sera pas mis à jour. Vérifiez l\'Annuaire des directeurs/trices techniques (ou employes.planning_nom en cas d\'homonymie).');
  return ref?ref.id:null;
}
async function peSyncReferentPlanning(crecheId,semaine,jour,prenom,ev){
  const referentId=peFindReferentIdForPrenom(crecheId,prenom);
  if(!referentId)return;
  await sb.from('planning').delete().eq('referent_id',referentId).eq('semaine',semaine).eq('jour',jour).is('slot',null);
  await planningSave(referentId,semaine,{
    day:jour,slot:null,type:ev.type||'presence',label:ev.label||prenom,lieu:ev.lieu||null,
    hdebut:ev.hdebut||null,hfin:ev.hfin||null,pause:ev.pause||null,detachType:'',detachDesc:'',multi:true
  });
  planningInvalidate(referentId,semaine);
}
async function peUnsyncReferentPlanning(crecheId,semaine,jour,prenom){
  const referentId=peFindReferentIdForPrenom(crecheId,prenom);
  if(!referentId)return;
  await sb.from('planning').delete().eq('referent_id',referentId).eq('semaine',semaine).eq('jour',jour).is('slot',null);
  planningInvalidate(referentId,semaine);
}

// Comme lors d'un import Excel/PDF, où l'on choisissait explicitement le prénom de la
// directrice technique dans le fichier : ce réglage (referents.planning_nom) permet
// de fiabiliser le rapprochement automatique quand le prénom du planning équipe ne
// correspond pas exactement au nom de sa fiche.
let _peRefNomTargetId=null;
function peRenderRefNomRow(crecheId,editable){
  const row=document.getElementById('pe-ref-nom-row');
  if(!row)return;
  const ref=editable?(cacheReferents||[]).find(r=>r.creche_id===crecheId):null;
  if(!ref){row.style.display='none';_peRefNomTargetId=null;return;}
  _peRefNomTargetId=ref.id;
  document.getElementById('pe-ref-nom-label').textContent='Prénom de '+ref.name+' dans ce planning :';
  document.getElementById('pe-ref-nom-input').value=ref.planning_nom||'';
  document.getElementById('pe-ref-nom-input').placeholder=ref.name?String(ref.name).trim().split(/\s+/)[0]:'';
  row.style.display='flex';
}
async function peSaveRefPlanningNom(){
  if(!_peRefNomTargetId)return;
  const val=document.getElementById('pe-ref-nom-input').value.trim();
  const ok=await dbUpdate('referents',_peRefNomTargetId,{planning_nom:val||null});
  if(!ok){showBanner('Erreur lors de l\'enregistrement.','error');return;}
  const ref=(cacheReferents||[]).find(r=>r.id===_peRefNomTargetId);
  if(ref)ref.planning_nom=val||null;
  showBanner('Prénom enregistré ✅');
}

// Répercute sur le planning individuel du directeur technique les créneaux déjà présents
// dans Planning équipe cette semaine — utile quand ils ont été ajoutés avant que le
// rapprochement (nom de la fiche, ou pe-ref-nom-input) ne soit correctement réglé.
async function peResyncWeek(){
  if(!_peCurCrecheId||!_peCurSemaine)return;
  const btn=document.getElementById('pe-resync-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Resynchronisation…';}
  const rows=await peLoad(_peCurCrecheId,_peCurSemaine);
  let nb=0;
  for(const r of rows){
    if(peFindReferentIdForPrenom(_peCurCrecheId,r.prenom)){
      await peSyncReferentPlanning(_peCurCrecheId,_peCurSemaine,r.jour,r.prenom,{type:r.type,label:r.label||r.prenom,lieu:r.lieu,hdebut:r.hdebut,hfin:r.hfin,pause:r.pause});
      nb++;
    }
  }
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-refresh"></i> Resynchroniser';}
  if(nb)await renderPlanning();
  showBanner(nb?nb+' créneau(x) répercuté(s) sur le planning individuel ✅':'Aucun créneau de cette semaine ne correspond à un/une directeur/trice technique connu.',nb?undefined:'error');
}

// ── ÉDITION D'UNE CASE DU TABLEAU ÉQUIPE (remplace/ajoute/supprime un nom sur un créneau) ──
let _peEditCtx=null; // {eventId|null, creneauLabel, jour, crecheId, semaine}

// Remplit la liste déroulante des prénoms en conservant la sélection courante.
function peRemplirPrenoms(noms,selection,selectId){
  const sel=document.getElementById(selectId||'pe-edit-prenom');
  if(!sel)return;
  const liste=[...new Set(noms)].filter(Boolean)
    .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
  sel.innerHTML='<option value="">-- Choisir --</option>'
    +liste.map(n=>'<option value="'+escHtml(n)+'">'+escHtml(n)+'</option>').join('')
    +'<option value="__autre__">Autre (saisir)…</option>';
  if(selection&&liste.includes(selection))sel.value=selection;
  return liste;
}

async function peOpenCellEdit(eventId,creneauLabel,jourStr,crecheId,semaine){
  const jour=parseInt(jourStr);
  _peEditCtx={eventId:eventId||null,creneauLabel,jour,crecheId,semaine};

  const cached=_peCache[crecheId+'_'+semaine]||[];
  const ev=eventId?cached.find(r=>r.id===eventId):null;
  const courant=ev?ev.prenom:'';

  // Liste immédiate : les prénoms présents dans la semaine affichée.
  peRemplirPrenoms(cached.map(r=>r.prenom).concat(courant?[courant]:[]),courant);

  document.getElementById('pe-edit-prenom-autre').value='';
  document.getElementById('pe-edit-prenom-autre').style.display='none';
  document.getElementById('pe-edit-creneau-label').textContent=creneauLabel+' — '+DAYS[jour];
  if(eventId){
    document.getElementById('pe-edit-title').textContent='Modifier le créneau';
    document.getElementById('pe-edit-delete-btn').style.display='';
  }else{
    document.getElementById('pe-edit-title').textContent='Ajouter sur ce créneau';
    document.getElementById('pe-edit-delete-btn').style.display='none';
  }
  document.getElementById('modal-pe-edit-wrap').classList.add('open');

  // Puis on élargit : la semaine affichée ne contient que les personnes déjà
  // planifiées CETTE semaine-là. Quelqu'un qui n'y travaille pas (congés,
  // arrivée en cours de mois, semaine encore vide) en était absent et devenait
  // impossible à ajouter autrement qu'en le retapant via « Autre ».
  // On y ajoute donc tous les prénoms connus de la crèche, toutes semaines
  // confondues, ainsi que les directrices techniques qui y sont rattachées.
  try{
    const connus=(typeof spPrenomsConnus==='function')?await spPrenomsConnus(crecheId):[];
    const refs=(cacheReferents||[])
      .filter(r=>r.creche_id===crecheId&&r.name)
      .map(r=>String(r.name).trim().split(/\s+/)[0]);
    // La modale a pu être refermée pendant la requête.
    if(!_peEditCtx||_peEditCtx.crecheId!==crecheId||_peEditCtx.semaine!==semaine)return;
    const sel=document.getElementById('pe-edit-prenom');
    const choixActuel=sel?sel.value:'';
    peRemplirPrenoms(
      cached.map(r=>r.prenom).concat(connus,refs,courant?[courant]:[]),
      (choixActuel&&choixActuel!=='__autre__')?choixActuel:courant
    );
    if(choixActuel==='__autre__'&&sel)sel.value='__autre__';
  }catch(e){console.error('[PlanningEquipe] liste prénoms',e);}
}

function peOnPrenomChange(){
  const v=document.getElementById('pe-edit-prenom').value;
  document.getElementById('pe-edit-prenom-autre').style.display=v==='__autre__'?'':'none';
}

async function peSaveCellEdit(){
  if(!_peEditCtx)return;
  const sel=document.getElementById('pe-edit-prenom').value;
  const prenom=sel==='__autre__'?document.getElementById('pe-edit-prenom-autre').value.trim():sel;
  if(!prenom){alert('Choisissez ou saisissez un prénom.');return;}

  const{eventId,creneauLabel,jour,crecheId,semaine}=_peEditCtx;
  const creneau=ipParseCreneauLabel(creneauLabel);
  const prevRow=eventId?(_peCache[crecheId+'_'+semaine]||[]).find(r=>r.id===eventId):null;
  const prevPrenom=prevRow?prevRow.prenom:null;
  const btn=document.querySelector('#modal-pe-edit-wrap .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Enregistrement…';}

  let error;
  if(eventId){
    ({error}=await sb.from('planning_equipe').update({prenom}).eq('id',eventId));
  }else{
    ({error}=await sb.from('planning_equipe').insert({
      creche_id:crecheId,prenom,semaine,jour,type:'presence',label:prenom,
      lieu:null,hdebut:creneau?.hdebut||null,hfin:creneau?.hfin||null,pause:creneau?.pause||null,
      creneau_label:creneauLabel
    }));
  }

  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Enregistrer';}
  if(error){console.error('[PlanningEquipe] edit:',error.message);showBanner('Erreur lors de l\'enregistrement.','error');return;}

  if(prevPrenom&&prevPrenom!==prenom)await peUnsyncReferentPlanning(crecheId,semaine,jour,prevPrenom);
  await peSyncReferentPlanning(crecheId,semaine,jour,prenom,{
    type:'presence',label:prenom,lieu:null,hdebut:creneau?.hdebut||null,hfin:creneau?.hfin||null,pause:creneau?.pause||null
  });

  peInvalidate(crecheId,semaine);
  closeModal('modal-pe-edit-wrap');
  await renderPlanning();
  showBanner(prenom+' enregistré(e) ✅');
}

async function peDeleteCellEdit(){
  if(!_peEditCtx||!_peEditCtx.eventId)return;
  if(!confirm('Retirer cette personne de ce créneau ?'))return;
  const{eventId,jour,crecheId,semaine}=_peEditCtx;
  const removedRow=(_peCache[crecheId+'_'+semaine]||[]).find(r=>r.id===eventId);
  const{error}=await sb.from('planning_equipe').delete().eq('id',eventId);
  if(error){console.error('[PlanningEquipe] delete:',error.message);showBanner('Erreur lors de la suppression.','error');return;}
  if(removedRow)await peUnsyncReferentPlanning(crecheId,semaine,jour,removedRow.prenom);
  peInvalidate(crecheId,semaine);
  closeModal('modal-pe-edit-wrap');
  await renderPlanning();
  showBanner('Créneau libéré ✅');
}

// ── CRÉATION MANUELLE D'UN CRÉNEAU (construire le planning à la main, sans import) ──
function peTimeToLabel(hhmm){return String(hhmm||'').replace(':','h');}

async function peOpenNewCreneau(){
  if(!_peCurCrecheId||!_peCurEditable)return;
  const joursWrap=document.getElementById('pe-nc-jours');
  joursWrap.innerHTML=DAYS.map((d,i)=>'<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:#F5F4FA;border-radius:8px;padding:5px 9px;cursor:pointer"><input type="checkbox" class="pe-nc-jour-cb" value="'+i+'"> '+d+'</label>').join('');
  document.getElementById('pe-nc-hdebut').value='08:00';
  document.getElementById('pe-nc-hfin').value='18:00';
  document.getElementById('pe-nc-pause-toggle').checked=false;
  document.getElementById('pe-nc-pause-wrap').style.display='none';
  document.getElementById('pe-nc-pause-debut').value='12:30';
  document.getElementById('pe-nc-pause-fin').value='14:00';
  document.getElementById('pe-nc-prenom-autre').value='';
  document.getElementById('pe-nc-prenom-autre').style.display='none';

  const cached=_peCache[_peCurCrecheId+'_'+_peCurSemaine]||[];
  peRemplirPrenoms(cached.map(r=>r.prenom),'','pe-nc-prenom');
  document.getElementById('modal-pe-new-creneau-wrap').classList.add('open');

  try{
    const connus=(typeof spPrenomsConnus==='function')?await spPrenomsConnus(_peCurCrecheId):[];
    const refs=(cacheReferents||[]).filter(r=>r.creche_id===_peCurCrecheId&&r.name).map(r=>String(r.name).trim().split(/\s+/)[0]);
    if(!document.getElementById('modal-pe-new-creneau-wrap').classList.contains('open'))return;
    peRemplirPrenoms(cached.map(r=>r.prenom).concat(connus,refs),'','pe-nc-prenom');
  }catch(e){console.error('[PlanningEquipe] liste prénoms',e);}
}

function peNcTogglePause(){
  document.getElementById('pe-nc-pause-wrap').style.display=document.getElementById('pe-nc-pause-toggle').checked?'flex':'none';
}
function peNcOnPrenomChange(){
  const v=document.getElementById('pe-nc-prenom').value;
  document.getElementById('pe-nc-prenom-autre').style.display=v==='__autre__'?'':'none';
}

async function peSaveNewCreneau(){
  if(!_peCurCrecheId||!_peCurSemaine)return;
  const jours=[...document.querySelectorAll('.pe-nc-jour-cb:checked')].map(cb=>parseInt(cb.value,10));
  if(!jours.length){alert('Choisissez au moins un jour.');return;}
  const hdebut=document.getElementById('pe-nc-hdebut').value;
  const hfin=document.getElementById('pe-nc-hfin').value;
  if(!hdebut||!hfin){alert('Renseignez les heures de début et de fin.');return;}
  const avecPause=document.getElementById('pe-nc-pause-toggle').checked;
  const pauseDebut=document.getElementById('pe-nc-pause-debut').value;
  const pauseFin=document.getElementById('pe-nc-pause-fin').value;
  if(avecPause&&(!pauseDebut||!pauseFin)){alert('Renseignez la plage de pause, ou décochez-la.');return;}
  const sel=document.getElementById('pe-nc-prenom').value;
  const prenom=sel==='__autre__'?document.getElementById('pe-nc-prenom-autre').value.trim():sel;
  if(!prenom){alert('Choisissez ou saisissez un prénom.');return;}

  const creneauLabel=avecPause
    ?peTimeToLabel(hdebut)+'-'+peTimeToLabel(pauseDebut)+'/'+peTimeToLabel(pauseFin)+'-'+peTimeToLabel(hfin)
    :peTimeToLabel(hdebut)+'-'+peTimeToLabel(hfin);
  const pause=avecPause?(pauseDebut+'-'+pauseFin):null;

  const btn=document.querySelector('#modal-pe-new-creneau-wrap .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Enregistrement…';}
  const rowsToInsert=jours.map(jour=>({
    creche_id:_peCurCrecheId,prenom,semaine:_peCurSemaine,jour,type:'presence',label:prenom,
    lieu:null,hdebut,hfin,pause,creneau_label:creneauLabel
  }));
  const{error}=await sb.from('planning_equipe').insert(rowsToInsert);
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Ajouter';}
  if(error){console.error('[PlanningEquipe] new:',error.message);showBanner('Erreur lors de l\'enregistrement.','error');return;}

  for(const jour of jours){
    await peSyncReferentPlanning(_peCurCrecheId,_peCurSemaine,jour,prenom,{type:'presence',label:prenom,lieu:null,hdebut,hfin,pause});
  }

  peInvalidate(_peCurCrecheId,_peCurSemaine);
  closeModal('modal-pe-new-creneau-wrap');
  await renderPlanning();
  showBanner('Créneau ajouté ✅');
}

// ── DUPLICATION D'UN JOUR VERS D'AUTRES JOURS (même semaine) ──
let _peDupDaySource=null;
function peOpenDuplicateDay(dayIndex){
  if(!_peCurCrecheId||!_peCurEditable)return;
  _peDupDaySource=dayIndex;
  document.getElementById('pe-dup-day-sub').textContent='Copier le contenu du '+DAYS[dayIndex]+' vers :';
  const wrap=document.getElementById('pe-dup-day-targets');
  wrap.innerHTML=DAYS.map((d,i)=>i===dayIndex?'':'<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:#F5F4FA;border-radius:8px;padding:5px 9px;cursor:pointer"><input type="checkbox" class="pe-dup-day-cb" value="'+i+'"> '+d+'</label>').join('');
  document.getElementById('pe-dup-day-replace').checked=true;
  document.getElementById('modal-pe-dup-day-wrap').classList.add('open');
}
async function peSaveDuplicateDay(){
  if(_peDupDaySource==null||!_peCurCrecheId||!_peCurSemaine)return;
  const targets=[...document.querySelectorAll('.pe-dup-day-cb:checked')].map(cb=>parseInt(cb.value,10));
  if(!targets.length){alert('Choisissez au moins un jour de destination.');return;}
  const replace=document.getElementById('pe-dup-day-replace').checked;

  const btn=document.querySelector('#modal-pe-dup-day-wrap .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Duplication…';}

  const cached=await peLoad(_peCurCrecheId,_peCurSemaine);
  const sourceRows=cached.filter(r=>r.jour===_peDupDaySource);
  if(!sourceRows.length){
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Dupliquer';}
    showBanner('Aucun créneau à dupliquer sur ce jour.','error');
    return;
  }

  if(replace){
    const oldTargetRows=cached.filter(r=>targets.includes(r.jour));
    const{error:errDel}=await sb.from('planning_equipe').delete().eq('creche_id',_peCurCrecheId).eq('semaine',_peCurSemaine).in('jour',targets);
    if(errDel){console.error('[PlanningEquipe] dup day del:',errDel.message);showBanner('Erreur lors du remplacement.','error');if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Dupliquer';}return;}
    for(const r of oldTargetRows)await peUnsyncReferentPlanning(_peCurCrecheId,_peCurSemaine,r.jour,r.prenom);
  }

  const rowsToInsert=[];
  targets.forEach(jour=>sourceRows.forEach(r=>rowsToInsert.push({
    creche_id:_peCurCrecheId,prenom:r.prenom,semaine:_peCurSemaine,jour,type:r.type||'presence',label:r.label||r.prenom,
    lieu:r.lieu||null,hdebut:r.hdebut||null,hfin:r.hfin||null,pause:r.pause||null,creneau_label:r.creneau_label||null
  })));
  const{error}=await sb.from('planning_equipe').insert(rowsToInsert);
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Dupliquer';}
  if(error){console.error('[PlanningEquipe] dup day:',error.message);showBanner('Erreur lors de la duplication.','error');return;}

  for(const jour of targets){
    for(const r of sourceRows){
      await peSyncReferentPlanning(_peCurCrecheId,_peCurSemaine,jour,r.prenom,{type:r.type,label:r.label||r.prenom,lieu:r.lieu,hdebut:r.hdebut,hfin:r.hfin,pause:r.pause});
    }
  }

  peInvalidate(_peCurCrecheId,_peCurSemaine);
  closeModal('modal-pe-dup-day-wrap');
  await renderPlanning();
  showBanner('Journée dupliquée ✅');
}

// ── DUPLICATION DE LA SEMAINE AFFICHÉE VERS LES SEMAINES SUIVANTES ──
function peOpenDuplicateWeek(){
  if(!_peCurCrecheId||!_peCurEditable)return;
  const ws=new Date(_peCurSemaine+'T00:00:00');
  document.getElementById('pe-dup-week-sub').textContent='Copier la semaine du '+ws.toLocaleDateString('fr-FR')+' sur les semaines suivantes.';
  document.getElementById('pe-dup-week-count').value='1';
  document.getElementById('pe-dup-week-replace').checked=true;
  document.getElementById('modal-pe-dup-week-wrap').classList.add('open');
}
async function peSaveDuplicateWeek(){
  if(!_peCurCrecheId||!_peCurSemaine)return;
  const count=Math.max(1,Math.min(12,parseInt(document.getElementById('pe-dup-week-count').value,10)||1));
  const replace=document.getElementById('pe-dup-week-replace').checked;

  const btn=document.querySelector('#modal-pe-dup-week-wrap .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Duplication…';}

  const sourceRows=await peLoad(_peCurCrecheId,_peCurSemaine);
  if(!sourceRows.length){
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Dupliquer';}
    showBanner('Aucun créneau à dupliquer sur cette semaine.','error');
    return;
  }

  const baseDate=new Date(_peCurSemaine+'T00:00:00');
  for(let i=1;i<=count;i++){
    const targetDate=new Date(baseDate);targetDate.setDate(baseDate.getDate()+7*i);
    const targetSemaine=ipDateToLocalISO(targetDate);
    if(replace){
      const oldTargetRows=await peLoad(_peCurCrecheId,targetSemaine);
      const{error:errDel}=await sb.from('planning_equipe').delete().eq('creche_id',_peCurCrecheId).eq('semaine',targetSemaine);
      if(errDel){console.error('[PlanningEquipe] dup week del:',errDel.message);continue;}
      for(const r of oldTargetRows)await peUnsyncReferentPlanning(_peCurCrecheId,targetSemaine,r.jour,r.prenom);
    }
    const rowsToInsert=sourceRows.map(r=>({
      creche_id:_peCurCrecheId,prenom:r.prenom,semaine:targetSemaine,jour:r.jour,type:r.type||'presence',label:r.label||r.prenom,
      lieu:r.lieu||null,hdebut:r.hdebut||null,hfin:r.hfin||null,pause:r.pause||null,creneau_label:r.creneau_label||null
    }));
    const{error}=await sb.from('planning_equipe').insert(rowsToInsert);
    if(error)console.error('[PlanningEquipe] dup week:',error.message);
    for(const r of sourceRows){
      await peSyncReferentPlanning(_peCurCrecheId,targetSemaine,r.jour,r.prenom,{type:r.type,label:r.label||r.prenom,lieu:r.lieu,hdebut:r.hdebut,hfin:r.hfin,pause:r.pause});
    }
    peInvalidate(_peCurCrecheId,targetSemaine);
  }

  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Dupliquer';}
  closeModal('modal-pe-dup-week-wrap');
  await renderPlanning();
  showBanner(count>1?count+' semaines dupliquées ✅':'Semaine dupliquée ✅');
}
