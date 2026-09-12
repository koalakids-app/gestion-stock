let kioskCrecheId=null,kioskMode='enfants',kioskPointagesToday=[],kioskSearch='',kioskBusy=false;
let _kioskClockTimer=null,_kioskToastTimer=null;

function openKiosque(){
  kioskCrecheId=isDirection?(localStorage.getItem('kioskCrecheId')||(cacheCreches[0]?.id||null)):(currentProfile?.creche_id||null);
  if(!kioskCrecheId){showBanner('Aucune crèche associée à votre compte.','error');return;}
  kioskMode='enfants';kioskSearch='';kioskPointagesToday=[];
  const s=document.getElementById('kiosque-search');if(s)s.value='';
  kioskSyncModeBtns();
  document.getElementById('kiosque-who-name').textContent=currentProfile?.name||currentUser?.email||'—';
  kioskRenderCrecheSelect();
  document.getElementById('kiosque-overlay').classList.add('open');
  document.documentElement.requestFullscreen?.().catch(()=>{});
  kioskStartClock();
  kioskLoadToday();
}
window.openKiosque=openKiosque;

function closeKiosque(){
  document.getElementById('kiosque-overlay').classList.remove('open');
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  kioskStopClock();
}
window.closeKiosque=closeKiosque;

function kioskStartClock(){kioskTickClock();_kioskClockTimer=setInterval(kioskTickClock,1000);}
function kioskStopClock(){if(_kioskClockTimer){clearInterval(_kioskClockTimer);_kioskClockTimer=null;}}
function kioskTickClock(){
  const n=new Date();
  const c=document.getElementById('kiosque-clock');if(c)c.textContent=n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const d=document.getElementById('kiosque-date');if(d)d.textContent=n.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
}

function kioskRenderCrecheSelect(){
  const wrap=document.getElementById('kiosque-creche-wrap');if(!wrap)return;
  if(!isDirection){wrap.style.display='none';return;}
  wrap.style.display='flex';
  const sel=document.getElementById('kiosque-creche-select');
  sel.innerHTML=cacheCreches.map(c=>'<option value="'+c.id+'"'+(c.id===kioskCrecheId?' selected':'')+'>'+c.name+'</option>').join('');
}
function kioskChangeCreche(id){
  kioskCrecheId=id;
  localStorage.setItem('kioskCrecheId',id);
  kioskLoadToday();
}
window.kioskChangeCreche=kioskChangeCreche;

async function kioskLoadToday(){
  const d0=new Date();d0.setHours(0,0,0,0);
  const d1=new Date(d0);d1.setDate(d1.getDate()+1);
  const{data,error}=await sb.from('pointages').select('*').eq('creche_id',kioskCrecheId)
    .gte('horodatage',d0.toISOString()).lt('horodatage',d1.toISOString())
    .order('horodatage',{ascending:true});
  if(error){console.warn('[kiosque] chargement pointages',error);showBanner('Erreur de chargement des pointages.','error');}
  kioskPointagesToday=data||[];
  kioskRender();
}

function kioskStatusMap(){
  const map={};
  kioskPointagesToday.forEach(p=>{
    const key=p.enfant_id?('e_'+p.enfant_id):p.employe_id?('m_'+p.employe_id):('s_'+p.salarie_id);
    if(!map[key]||new Date(p.horodatage)>new Date(map[key].horodatage))map[key]=p;
  });
  return map;
}

function kioskSetMode(m){
  kioskMode=m;kioskSearch='';
  const s=document.getElementById('kiosque-search');if(s)s.value='';
  kioskSyncModeBtns();kioskRender();
}
window.kioskSetMode=kioskSetMode;
function kioskSyncModeBtns(){
  document.getElementById('kiosque-tab-enfants')?.classList.toggle('active',kioskMode==='enfants');
  document.getElementById('kiosque-tab-personnel')?.classList.toggle('active',kioskMode==='personnel');
}
function kioskOnSearch(v){kioskSearch=v;kioskRender();}
window.kioskOnSearch=kioskOnSearch;

function kioskRender(){
  const grid=document.getElementById('kiosque-grid');if(!grid)return;
  const statusMap=kioskStatusMap();
  const today=todayStr();
  let items,presentCount=0;
  if(kioskMode==='enfants'){
    items=cacheEnfants.filter(e=>e.creche_id===kioskCrecheId&&(!e.date_sortie||e.date_sortie>=today)).map(r=>({...r,_kind:'enfants'}));
  }else{
    // Personnel = référent(e)s/direction (compte de connexion) + employés (sans compte).
    // Un référent sans crèche assignée (creche_id null, cas typique de la direction qui
    // supervise toutes les crèches) doit pouvoir se pointer depuis n'importe quel kiosque.
    items=cacheReferents.filter(r=>r.creche_id===kioskCrecheId||r.creche_id==null).map(r=>({...r,_kind:'referent'}))
      .concat(cacheEmployes.filter(e=>e.creche_id===kioskCrecheId).map(e=>({...e,_kind:'employe'})));
  }
  const keyOf=p=>(p._kind==='enfants'?'e_':p._kind==='employe'?'m_':'s_')+p.id;
  items.forEach(p=>{const l=statusMap[keyOf(p)];if(l&&l.action==='arrivee')presentCount++;});
  const counts=document.getElementById('kiosque-counts');
  if(counts)counts.textContent=presentCount+' / '+items.length+' présent(s)';
  if(kioskSearch){
    const s=kioskSearch.toLowerCase();
    items=items.filter(p=>((p.prenom||p.name||'')+' '+(p.nom||'')).toLowerCase().includes(s));
  }
  items=items.slice().sort((a,b)=>(a.prenom||a.name||'').localeCompare(b.prenom||b.name||'','fr',{sensitivity:'base'}));
  if(!items.length){grid.innerHTML='<div class="kiosk-empty"><i class="ti ti-search-off" style="font-size:24px;display:block;margin-bottom:8px;opacity:.5"></i>Aucun'+(kioskMode==='enfants'?' enfant':' membre du personnel')+' trouvé.</div>';return;}
  grid.innerHTML=items.map(p=>{
    const key=keyOf(p);
    const last=statusMap[key];
    const present=!!(last&&last.action==='arrivee');
    const label=p._kind==='referent'?(p.name||''):(p.prenom||'');
    const sub=p._kind==='enfants'?(p.nom||''):p._kind==='employe'?(p.poste||'Employé(e)'):(p.poste||(p.role==='direction'?'Direction':'Référente'));
    const heure=last?new Date(last.horodatage).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
    const statusTxt=present?('Présent(e) depuis '+heure):(last?('Parti(e) à '+heure):'Pas encore pointé(e)');
    return '<button class="kiosk-tile'+(present?' present':'')+'" onclick="kioskToggle(this,\''+p._kind+'\',\''+p.id+'\')">'
      +'<div class="kiosk-tile-name">'+label+'</div>'
      +(sub?'<div class="kiosk-tile-sub">'+sub+'</div>':'')
      +'<div class="kiosk-tile-status">'+statusTxt+'</div>'
      +'<div class="kiosk-tile-action">'+(present?'<i class="ti ti-door-exit"></i> Départ':'<i class="ti ti-door-enter"></i> Arrivée')+'</div>'
      +'</button>';
  }).join('');
}

/* Lien pointage → présences (mode kiosque connecté). Même règle que côté
   SQL (kk_kiosk_pointer, cf. sql/lien_pointage_presence.sql) : présent sur
   toute la journée (M+A, comme togglePresence), et on ne touche JAMAIS
   heure_debut/heure_fin ici — laissés null pour que le Gantt du module
   Présences retombe sur les horaires du contrat d'accueil plutôt que sur
   l'heure de pointage. Un slot déjà renseigné (statut quelconque) n'est
   jamais écrasé. */
async function presMarquerPresentDepuisPointage(enfantId,dateStr){
  try{
    const{data:existant}=await sb.from('presences').select('slot').eq('enfant_id',enfantId).eq('presence_date',dateStr);
    const deja=new Set((existant||[]).map(p=>p.slot));
    const manquants=['M','A'].filter(s=>!deja.has(s));
    if(!manquants.length)return;
    await sb.from('presences').insert(manquants.map(slot=>({enfant_id:enfantId,presence_date:dateStr,slot,status:'present',source:'pointage'})));
  }catch(e){console.warn('[presMarquerPresentDepuisPointage]',e);}
}

async function kioskToggle(btn,mode,id){
  if(kioskBusy)return;
  kioskBusy=true;
  if(btn)btn.disabled=true;
  try{
    const statusMap=kioskStatusMap();
    const key=(mode==='enfants'?'e_':mode==='employe'?'m_':'s_')+id;
    const last=statusMap[key];
    const present=!!(last&&last.action==='arrivee');
    const action=present?'depart':'arrivee';
    const row={creche_id:kioskCrecheId,action,effectue_par:currentUser.id};
    if(mode==='enfants')row.enfant_id=id;else if(mode==='employe')row.employe_id=id;else row.salarie_id=id;
    const saved=await dbInsert('pointages',row);
    if(!saved){showBanner(window._lastDbError||'Erreur d’enregistrement du pointage.','error');return;}
    kioskPointagesToday.push(saved);
    if(mode==='enfants'&&action==='arrivee')await presMarquerPresentDepuisPointage(id,todayStr());
    kioskRender();
    const person=mode==='enfants'?cacheEnfants.find(e=>e.id===id):mode==='employe'?cacheEmployes.find(e=>e.id===id):cacheReferents.find(r=>r.id===id);
    kioskShowUndo(saved,person);
  }finally{
    kioskBusy=false;
  }
}
window.kioskToggle=kioskToggle;

function kioskShowUndo(row,person){
  const box=document.getElementById('kiosque-toast');if(!box)return;
  const nom=person?(person.prenom||person.name||''):'';
  const verbe=row.action==='arrivee'?'Arrivée':'Départ';
  box.innerHTML='<span><i class="ti ti-circle-check"></i> '+verbe+' enregistrée pour '+nom+'</span>'
    +'<button onclick="kioskUndo(\''+row.id+'\')"><i class="ti ti-arrow-back-up"></i> Annuler</button>';
  box.classList.add('show');
  clearTimeout(_kioskToastTimer);
  _kioskToastTimer=setTimeout(()=>box.classList.remove('show'),8000);
}
async function kioskUndo(pointageId){
  const ok=await dbDeleteStrict('pointages',pointageId);
  if(ok){
    kioskPointagesToday=kioskPointagesToday.filter(p=>p.id!==pointageId);
    kioskRender();
    document.getElementById('kiosque-toast').classList.remove('show');
    showBanner('Pointage annulé.');
  }else{
    showBanner(window._lastDbError||'Impossible d’annuler (délai dépassé).','error');
  }
}
window.kioskUndo=kioskUndo;

document.addEventListener('fullscreenchange',function(){
  if(!document.fullscreenElement&&document.getElementById('kiosque-overlay')?.classList.contains('open')){
    // sortie du plein écran (touche Échap...) : on referme aussi le mode kiosque
    closeKiosque();
  }
});
