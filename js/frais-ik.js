// FRAIS IK
// ============================================================
// Sites du réseau (crèches). Les distances par défaut sont celles depuis Cuers.
const IK_DEFAULT_DIST={'Brunet':22,'Cuers':0,'Ollioules':30,'St Jean':20,'Picot 1':25,'Picot 2':25};
const IK_SITES=Object.keys(IK_DEFAULT_DIST);
const IK_GROUPS={'Picot 1':'Picot 1 - Picot 2','Picot 2':'Picot 1 - Picot 2','Brunet':'Brunet','Ollioules':'Ollioules - St Jean','St Jean':'Ollioules - St Jean','Cuers':'Cuers'};
const IK_GROUP_ORDER=['Picot 1 - Picot 2','Brunet','Ollioules - St Jean','Cuers'];
const IK_DEFAULT_DEPART='Cuers';

// Distances inter-sites PRÉ-REMPLIES À TITRE INDICATIF (estimations à vérifier
// et à corriger dans l'onglet — elles n'ont aucune valeur justificative en l'état).
const IK_ESTIM_INTER={
  'Brunet|Ollioules':9,'Brunet|Picot 1':5,'Brunet|Picot 2':5,'Brunet|St Jean':4,
  'Ollioules|Picot 1':7,'Ollioules|Picot 2':7,'Ollioules|St Jean':11,
  'Picot 1|Picot 2':2,'Picot 1|St Jean':6,'Picot 2|St Jean':6
};

let ikRows=[];

function ikPairKey(a,b){return[a,b].sort().join('|');}

// Matrice complète par défaut : ligne Cuers = IK_DEFAULT_DIST, le reste = estimations.
function ikBuildDefaultMatrix(){
  const m={};
  IK_SITES.forEach(a=>{
    m[a]={};
    IK_SITES.forEach(b=>{
      if(a===b){m[a][b]=0;return;}
      if(a==='Cuers'){m[a][b]=IK_DEFAULT_DIST[b]||0;return;}
      if(b==='Cuers'){m[a][b]=IK_DEFAULT_DIST[a]||0;return;}
      m[a][b]=IK_ESTIM_INTER[ikPairKey(a,b)]||0;
    });
  });
  return m;
}

// Config : { lieux:[], matrix:{A:{B:km}}, defaultDepart, bareme, estimReviewed:bool }
// Migre les deux formats antérieurs (dist plat depuis Cuers, puis departs+matrix).
function ikGetConfig(){
  const saved=JSON.parse(localStorage.getItem('ik_config')||'{}');
  const matrix=ikBuildDefaultMatrix();
  if(saved.dist&&!saved.matrix){
    // format v1 : distances plates depuis Cuers
    Object.entries(saved.dist).forEach(([c,km])=>{
      if(matrix['Cuers'])matrix['Cuers'][c]=km;
      if(matrix[c])matrix[c]['Cuers']=km;
    });
  }
  if(saved.matrix){
    Object.entries(saved.matrix).forEach(([a,row])=>{
      matrix[a]=Object.assign({},matrix[a]||{},row);
    });
  }
  const lieux=IK_SITES.slice();
  const extra=(saved.lieux||saved.departs||[]).concat(Object.keys(saved.matrix||{}));
  extra.forEach(l=>{if(l&&!lieux.includes(l))lieux.push(l);});
  lieux.forEach(l=>{if(!matrix[l])matrix[l]={};});
  const defaultDepart=lieux.includes(saved.defaultDepart)?saved.defaultDepart:IK_DEFAULT_DEPART;
  return{lieux,matrix,defaultDepart,bareme:saved.bareme||0.248,estimReviewed:!!saved.estimReviewed};
}

// ---------------- Synchronisation Supabase ----------------
// Le module a longtemps vécu uniquement dans le localStorage : chaque appareil avait donc
// ses propres distances et ses propres lignes, d'où des totaux différents entre l'ordinateur
// et la tablette. Le localStorage reste utilisé comme miroir local (lecture synchrone par
// ikGetConfig, et repli hors ligne), mais la référence est désormais Supabase.
//   frais_ik_config  : une ligne unique 'global' — matrice des distances, lieux, barème.
//   frais_ik_lignes  : une ligne par (personne, mois) — le tableau des trajets en jsonb.
const IK_CFG_ID='global';
let ikSyncOk=true;

function ikSyncWarn(op,e){
  ikSyncOk=false;
  console.warn('[IK sync] '+op+' :',(e&&e.message)||e);
}

async function ikConfigPull(){
  try{
    const{data,error}=await sb.from('frais_ik_config').select('config').eq('id',IK_CFG_ID).maybeSingle();
    if(error)throw error;
    ikSyncOk=true;
    if(data&&data.config)localStorage.setItem('ik_config',JSON.stringify(data.config));
    return true;
  }catch(e){ikSyncWarn('lecture config',e);return false;}
}

async function ikConfigPush(cfg){
  try{
    const{error}=await sb.from('frais_ik_config')
      .upsert({id:IK_CFG_ID,config:cfg,updated_at:new Date().toISOString()},{onConflict:'id'});
    if(error)throw error;
    ikSyncOk=true;return true;
  }catch(e){ikSyncWarn('écriture config',e);return false;}
}

async function ikRowsPull(personId,month){
  try{
    const{data,error}=await sb.from('frais_ik_lignes').select('lignes')
      .eq('referent_id',personId).eq('mois',month).maybeSingle();
    if(error)throw error;
    ikSyncOk=true;
    return(data&&Array.isArray(data.lignes))?data.lignes:null;
  }catch(e){ikSyncWarn('lecture lignes',e);return null;}
}

async function ikRowsPush(personId,month,rows){
  try{
    const{error}=await sb.from('frais_ik_lignes')
      .upsert({referent_id:personId,mois:month,lignes:rows,updated_at:new Date().toISOString()},
              {onConflict:'referent_id,mois'});
    if(error)throw error;
    ikSyncOk=true;return true;
  }catch(e){ikSyncWarn('écriture lignes',e);return false;}
}

function ikWriteConfig(cfg){
  localStorage.setItem('ik_config',JSON.stringify(cfg));
  return ikConfigPush(cfg); // promesse : les appelants peuvent l'attendre ou l'ignorer
}

function ikDefaultDepart(){return ikGetConfig().defaultDepart||IK_DEFAULT_DEPART;}

// km entre deux lieux connus (matrice symétrique : on retient la valeur renseignée)
function ikKm(a,b,matrix){
  if(!a||!b||a===b)return 0;
  const m=matrix||ikGetConfig().matrix;
  const ab=(m[a]||{})[b];
  if(ab!==undefined&&ab!==null&&ab!=='')return Number(ab)||0;
  const ba=(m[b]||{})[a];
  if(ba!==undefined&&ba!==null&&ba!=='')return Number(ba)||0;
  return 0;
}

// Kilométrage d'une ligne : matrice si les deux lieux sont connus, sinon saisie manuelle.
function ikRowKm(row,matrix){
  if(row.ignored)return 0;
  if(row.creche)return ikKm(row.depart||IK_DEFAULT_DEPART,row.creche,matrix);
  return Number(row.km)||0;
}

// Onglet Excel d'une ligne : groupe de la destination, sinon groupe du site de départ,
// sinon rattachement à Cuers (site de rattachement administratif).
function ikRowGroup(row){
  const dep=row.depart;
  const depGroup=(dep&&dep!=='Cuers'&&IK_GROUPS[dep])?IK_GROUPS[dep]:null;
  // trajet de retour vers le site de rattachement : on garde l'onglet du site quitté,
  // pour qu'une journée chaînée ne soit pas éclatée sur trois onglets.
  if(row.creche==='Cuers'&&depGroup)return depGroup;
  if(row.creche&&IK_GROUPS[row.creche])return IK_GROUPS[row.creche];
  if(depGroup)return depGroup;
  return 'Cuers';
}

// ---------------- Configuration des lieux et distances ----------------

async function ikSaveConfig(){
  const cfg=ikGetConfig();
  const depart=document.getElementById('ik-depart-config').value||IK_DEFAULT_DEPART;
  const row=Object.assign({},cfg.matrix[depart]||{});
  document.querySelectorAll('.ik-dist-input').forEach(inp=>{
    const km=parseFloat(inp.value)||0;
    const dest=inp.dataset.creche;
    row[dest]=km;
    if(!cfg.matrix[dest])cfg.matrix[dest]={};
    cfg.matrix[dest][depart]=km; // matrice symétrique
  });
  cfg.matrix[depart]=row;
  cfg.bareme=parseFloat(document.getElementById('ik-bareme').value)||0.248;
  const def=document.getElementById('ik-depart-default').value;
  if(def)cfg.defaultDepart=def;
  cfg.estimReviewed=true;
  const ok=await ikWriteConfig(cfg);
  ikRenderConfig();
  ikRenderTable();
  showBanner(ok?'Configuration sauvegardée — valable sur tous vos appareils.'
               :'Configuration sauvegardée sur cet appareil uniquement (synchronisation indisponible).');
}

function ikAddDepart(){
  const ville=(prompt('Nom du lieu à ajouter (ville, centre de formation, PMI…) :')||'').trim();
  if(!ville)return;
  const cfg=ikGetConfig();
  if(cfg.lieux.some(d=>d.toLowerCase()===ville.toLowerCase())){alert('Ce lieu existe déjà.');return;}
  cfg.lieux.push(ville);
  cfg.matrix[ville]={};
  ikWriteConfig(cfg);
  ikRenderConfig(ville);
  ikRenderTable();
  showBanner('Lieu « '+ville+' » ajouté — renseignez ses distances puis sauvegardez.');
}

function ikRemoveDepart(){
  const cfg=ikGetConfig();
  const depart=document.getElementById('ik-depart-config').value;
  if(!depart)return;
  if(IK_SITES.includes(depart)){alert('Les crèches du réseau ne peuvent pas être supprimées de la liste des lieux.');return;}
  if(!confirm('Retirer le lieu « '+depart+' » ?'))return;
  cfg.lieux=cfg.lieux.filter(d=>d!==depart);
  delete cfg.matrix[depart];
  Object.values(cfg.matrix).forEach(row=>{delete row[depart];});
  if(cfg.defaultDepart===depart)cfg.defaultDepart=IK_DEFAULT_DEPART;
  ikWriteConfig(cfg);
  ikRows.forEach(r=>{if(r.depart===depart)r.depart=cfg.defaultDepart;});
  ikSaveRows();
  ikRenderConfig();
  ikRenderTable();
}

// Enregistre un lieu saisi librement sur une ligne, avec ses km, dans la liste des lieux.
function ikSaveRowLieu(idx){
  const row=ikRows[idx];
  if(!row||!row.lieu)return;
  const cfg=ikGetConfig();
  if(cfg.lieux.some(l=>l.toLowerCase()===row.lieu.toLowerCase())){alert('Ce lieu est déjà enregistré.');return;}
  const depart=row.depart||IK_DEFAULT_DEPART;
  const km=Number(row.km)||0;
  cfg.lieux.push(row.lieu);
  cfg.matrix[row.lieu]={};
  cfg.matrix[row.lieu][depart]=km;
  if(!cfg.matrix[depart])cfg.matrix[depart]={};
  cfg.matrix[depart][row.lieu]=km;
  ikWriteConfig(cfg);
  ikRows.forEach(r=>{if(r.lieu===row.lieu)r.creche=row.lieu;});
  ikSaveRows();
  ikRenderConfig();
  ikRenderTable();
  showBanner('Lieu « '+row.lieu+' » enregistré ('+km+' km depuis '+depart+').');
}

function ikRenderConfig(selectDepart){
  const cfg=ikGetConfig();
  document.getElementById('ik-bareme').value=cfg.bareme;
  const selEl=document.getElementById('ik-depart-config');
  const current=selectDepart||selEl.value||cfg.defaultDepart;
  selEl.innerHTML=cfg.lieux.map(d=>`<option value="${d}"${d===current?' selected':''}>${d}</option>`).join('');
  const defEl=document.getElementById('ik-depart-default');
  defEl.innerHTML=cfg.lieux.map(d=>`<option value="${d}"${d===cfg.defaultDepart?' selected':''}>${d}</option>`).join('');
  const depart=selEl.value||IK_DEFAULT_DEPART;
  const row=cfg.matrix[depart]||{};
  const grid=document.getElementById('ik-config-grid');
  grid.innerHTML=cfg.lieux.filter(c=>c!==depart).map(lieu=>{
    const km=ikKm(depart,lieu,cfg.matrix);
    return`<div class="ik-config-card"><span class="ik-config-label">${lieu}</span><input type="number" class="ik-config-input ik-dist-input" data-creche="${lieu}" value="${km}" min="0" step="1" onchange="ikRenderTable()"> <span style="font-size:12px;color:var(--muted)">km</span></div>`;
  }).join('');
  const warn=document.getElementById('ik-estim-warn');
  if(warn)warn.style.display=cfg.estimReviewed?'none':'';
  const dl=document.getElementById('ik-lieux-list');
  if(dl)dl.innerHTML=cfg.lieux.map(l=>`<option value="${l.replace(/"/g,'&quot;')}"></option>`).join('');
}

// Matrice « en cours d'édition » : config sauvegardée + valeurs saisies dans la grille.
function ikGetCurrentMatrix(){
  const cfg=ikGetConfig();
  const selEl=document.getElementById('ik-depart-config');
  const depart=selEl?selEl.value:IK_DEFAULT_DEPART;
  const row=Object.assign({},cfg.matrix[depart]||{});
  document.querySelectorAll('.ik-dist-input').forEach(inp=>{
    const km=parseFloat(inp.value)||0;
    row[inp.dataset.creche]=km;
    if(!cfg.matrix[inp.dataset.creche])cfg.matrix[inp.dataset.creche]={};
    cfg.matrix[inp.dataset.creche][depart]=km;
  });
  cfg.matrix[depart]=row;
  return cfg.matrix;
}

function ikDepartOptions(selected){
  const cfg=ikGetConfig();
  const list=cfg.lieux.slice();
  if(selected&&!list.includes(selected))list.push(selected);
  return list.map(d=>`<option value="${d.replace(/"/g,'&quot;')}"${d===selected?' selected':''}>${d}</option>`).join('');
}

function ikLocalDate(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),j=String(d.getDate()).padStart(2,'0');
  return`${y}-${m}-${j}`;
}

const IK_ALIASES={
  'saint jean':'St Jean','st-jean':'St Jean','stjean':'St Jean',
  'saint-jean':'St Jean',
  'ollioules':'Ollioules',
  'brunet':'Brunet',
  'picot 1':'Picot 1','picot1':'Picot 1',
  'picot 2':'Picot 2','picot2':'Picot 2',
  'cuers':'Cuers'
};

// Reconnaît un lieu connu (crèche du réseau OU lieu ajouté par l'utilisateur).
// Retourne null si le lieu est libre : la ligne demandera alors une saisie de km.
function ikDetectCreche(lieu){
  if(!lieu)return null;
  const l=String(lieu).trim().toLowerCase();
  if(!l)return null;
  const known=ikGetConfig().lieux;
  for(const c of known){if(l===c.toLowerCase())return c;}
  for(const[alias,creche] of Object.entries(IK_ALIASES)){if(l===alias)return creche;}
  for(const[alias,creche] of Object.entries(IK_ALIASES)){if(l.includes(alias))return creche;}
  for(const c of known){if(l.includes(c.toLowerCase()))return c;}
  return null;
}

function ikReadPlanning(yearMonth){
  const[year,month]=yearMonth.split('-').map(Number);
  const rows=[];
  const userId=currentProfile?.id||'dir';
  const firstDay=new Date(year,month-1,1);
  const lastDay=new Date(year,month,0);
  let cursor=new Date(firstDay);
  const dow=cursor.getDay();
  cursor.setDate(cursor.getDate()-(dow===0?6:dow-1));
  const checkedKeys=new Set();
  while(cursor<=lastDay){
    const keyDate=ipDateToLocalISO(cursor);
    const key=`events_${keyDate}_${userId}`;
    if(!checkedKeys.has(key)){
      checkedKeys.add(key);
      const events=JSON.parse(localStorage.getItem(key)||'[]');
      events.forEach(ev=>{
        if(ev.type==='absent'||ev.type==='reunion')return;
        const evDate=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+ev.day);
        if(evDate.getMonth()+1!==month||evDate.getFullYear()!==year)return;
        rows.push({id:`${ev.id}_${ikLocalDate(evDate)}`,date:ikLocalDate(evDate),lieu:ev.lieu,slot:ev.slot});
      });
    }
    cursor.setDate(cursor.getDate()+7);
  }
  return ikChainDays(rows);
}

// ---------------- Chaînage des journées multi-sites ----------------
// Une journée à un seul site => aller-retour (2 trajets).
// Une journée à plusieurs sites => chaîne réelle : départ → site 1 → site 2 → … → retour,
// un trajet par ligne, dans l'ordre des créneaux du planning.
function ikChainDays(raw){
  const depart=ikDefaultDepart();
  const byDate={};
  raw.forEach(r=>{(byDate[r.date]=byDate[r.date]||[]).push(r);});
  const out=[];
  Object.keys(byDate).sort().forEach(date=>{
    const evs=byDate[date].slice().sort((a,b)=>(a.slot||0)-(b.slot||0));
    // séquence des lieux visités, sans doublon consécutif
    const etapes=[];
    evs.forEach(e=>{
      const lieu=(e.lieu||'').trim();
      if(!lieu)return;
      if(etapes.length&&etapes[etapes.length-1].lieu===lieu)return;
      etapes.push({lieu,id:e.id,slot:e.slot||0});
    });
    if(!etapes.length)return;
    if(etapes.length===1){
      out.push(ikMakeRow(`${etapes[0].id}`,date,depart,etapes[0].lieu,2,etapes[0].slot));
      return;
    }
    let from=depart;
    etapes.forEach((e,i)=>{
      out.push(ikMakeRow(`${e.id}_s${i}`,date,from,e.lieu,1,e.slot));
      from=ikDetectCreche(e.lieu)||e.lieu;
    });
    out.push(ikMakeRow(`${etapes[etapes.length-1].id}_ret`,date,from,depart,1,99));
  });
  out.sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot);
  return out;
}

function ikMakeRow(id,date,depart,lieu,nbr,slot){
  const creche=ikDetectCreche(lieu);
  const dep=ikDetectCreche(depart)||depart;
  const ignored=!lieu||!String(lieu).trim()||(creche&&creche===dep)||(!creche&&String(lieu).trim()===dep);
  return{
    id,date,depart:dep,lieu:String(lieu).trim(),creche,nbr,slot:slot||0,
    km:0,ignored:!!ignored,
    trajet:ignored?String(lieu).trim():`${dep}/${String(lieu).trim()}`
  };
}

function ikReeval(rows){
  const cfgDep=ikDefaultDepart();
  return rows.map(r=>{
    const depart=r.depart||IK_DEFAULT_DEPART;
    const lieu=(r.lieu||(r.trajet||'').split('/').pop()||'').trim();
    const base=ikMakeRow(r.id,r.date,depart,lieu,r.nbr||2,r.slot);
    // on conserve le km saisi manuellement pour les lieux libres
    return Object.assign(base,{km:r.km!==undefined?r.km:0});
  });
}

// ---------------- Personne concernée ----------------
function ikPersonId(){
  const sel=document.getElementById('ik-person-select');
  return(sel&&sel.value)||currentProfile?.id||currentUser?.id||'dir';
}

function ikPersonName(){
  const id=ikPersonId();
  const p=(cacheReferents||[]).find(r=>r.id===id);
  return p?.name||currentProfile?.name||'';
}

// « David Bucari » -> « BUCARI David » (format attendu par le modèle FDEPvi)
function ikFormatEmployeeName(name){
  const n=(name||'').trim();
  if(!n)return'BUCARI David';
  const parts=n.split(/\s+/);
  if(parts.length<2)return n.toUpperCase();
  const nom=parts.pop();
  return nom.toUpperCase()+' '+parts.join(' ');
}

function ikRowsKey(month){return`ik_rows_${ikPersonId()}_${month}`;}

function ikPersonChanged(){ikLoad();}

function ikRenderPersonSelect(){
  const sel=document.getElementById('ik-person-select');
  if(!sel)return;
  const me=currentProfile?.id||'';
  const refs=(cacheReferents||[]).filter(r=>r.role==='direction'||r.role==='referent');
  const previous=sel.value;
  sel.innerHTML=refs.map(r=>`<option value="${r.id}">${r.name}${r.role==='direction'?' 🔑':''}</option>`).join('');
  if(previous&&refs.some(r=>r.id===previous))sel.value=previous;
  else if(refs.some(r=>r.id===me))sel.value=me;
}

async function ikLoad(){
  const month=document.getElementById('ik-month').value;
  if(!month)return;
  const personId=ikPersonId();
  const info=document.getElementById('ik-load-info');
  if(info)info.textContent='Synchronisation…';

  // 1. Config partagée : elle conditionne tous les kilométrages, on la relit avant les lignes.
  await ikConfigPull();
  ikRenderConfig();

  // 2. Lignes du mois : la base fait foi ; le localStorage ne sert que si la base n'a rien
  //    (premier passage, ancien mois saisi avant la synchronisation, ou appareil hors ligne).
  let saved=await ikRowsPull(personId,month);
  let origine='synchronisé';
  if(!saved){
    saved=JSON.parse(localStorage.getItem(ikRowsKey(month))||'null');
    if(!saved&&personId===(currentProfile?.id||'dir'))saved=JSON.parse(localStorage.getItem(`ik_rows_${month}`)||'null');
    if(saved)origine=ikSyncOk?'repris de cet appareil et synchronisé':'appareil seul (hors ligne)';
  }

  if(saved){
    ikRows=ikReeval(saved);
    ikSortRows();
    ikSaveRows(); // remonte en base les mois qui n'existaient qu'en local
    ikRenderTable();
    ikSetLoadInfo(origine);
  }
  else await ikLoadFromPlanning();
}

function ikSetLoadInfo(origine){
  const actives=ikRows.filter(r=>!r.ignored);
  const matrix=ikGetCurrentMatrix();
  const sansKm=actives.filter(r=>!(ikRowKm(r,matrix)>0)).length;
  let txt=`${actives.length} trajet(s) — ${origine}`;
  if(sansKm)txt+=` · ⚠️ ${sansKm} ligne(s) sans kilométrage (non exportée(s))`;
  if(!ikSyncOk)txt+=' · ⚠️ synchronisation indisponible : saisie locale à cet appareil';
  document.getElementById('ik-load-info').textContent=txt;
}

async function ikLoadFromPlanning(){
  const month=document.getElementById('ik-month').value;
  if(!month){alert('Sélectionnez un mois.');return;}
  document.getElementById('ik-load-info').textContent='Chargement depuis Supabase…';
  const userId=ikPersonId();
  const[year,monthNum]=month.split('-').map(Number);
  const firstDay=new Date(year,monthNum-1,1);
  const lastDay=new Date(year,monthNum,0);
  let cursor=new Date(firstDay);
  const dow=cursor.getDay();
  cursor.setDate(cursor.getDate()-(dow===0?6:dow-1));
  const raw=[];
  while(cursor<=lastDay){
    const semaine=ipDateToLocalISO(cursor);
    const events=await planningLoad(userId,semaine);
    events.forEach(ev=>{
      if(ev.type==='absent'||ev.type==='conge'||ev.type==='reunion')return;
      if(!ev.lieu)return;
      const day=ev.jour!==undefined?ev.jour:ev.day;
      const evDate=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+day);
      if(evDate.getMonth()+1!==monthNum||evDate.getFullYear()!==year)return;
      raw.push({id:`${ev.id}_${ikLocalDate(evDate)}`,date:ikLocalDate(evDate),lieu:ev.lieu,slot:ev.slot});
    });
    cursor.setDate(cursor.getDate()+7);
  }
  ikRows=ikChainDays(raw);
  ikSaveRows();
  ikRenderTable();
  ikSetLoadInfo('chargé depuis le planning');
}

function ikSaveRows(){
  const month=document.getElementById('ik-month').value;
  if(!month)return;
  const rows=ikRows;
  localStorage.setItem(ikRowsKey(month),JSON.stringify(rows)); // miroir local / repli hors ligne
  ikRowsPush(ikPersonId(),month,rows);                          // référence : Supabase
}

function ikRenderTable(){
  const tbody=document.getElementById('ik-tbody');
  const matrix=ikGetCurrentMatrix();
  const bareme=parseFloat(document.getElementById('ik-bareme').value)||0.248;
  if(!ikRows.length){tbody.innerHTML='';document.getElementById('ik-empty').style.display='block';ikUpdateTotals();return;}
  document.getElementById('ik-empty').style.display='none';
  let lastDate=null;
  tbody.innerHTML=ikRows.map((row,idx)=>{
    const km=ikRowKm(row,matrix);
    const tKm=row.nbr*km;
    const mont=tKm*bareme;
    const group=ikRowGroup(row);
    const badge=row.ignored?'<span class="ik-ignored-badge">ignoré</span>':
      group==='Picot 1 - Picot 2'?'<span class="ik-group-badge ik-g1">Picot</span>':
      group==='Brunet'?'<span class="ik-group-badge ik-g2">Brunet</span>':
      group==='Cuers'?'<span class="ik-group-badge ik-g4">Cuers</span>':
      '<span class="ik-group-badge ik-g3">Ollio/SJ</span>';
    const inp=(f,v,w='120px',t='text',extra='')=>`<input type="${t}" ${extra} value="${String(v).replace(/"/g,'&quot;')}" onchange="ikUpdateRow(${idx},'${f}',this.value)" style="width:${w};padding:4px 7px;border:1.5px solid transparent;border-radius:6px;font-size:12.5px;font-family:inherit;background:transparent" onfocus="this.style.borderColor='var(--koala)';this.style.background='#fff'" onblur="this.style.borderColor='transparent';this.style.background='transparent'">`;
    const departSel=`<select onchange="ikUpdateRow(${idx},'depart',this.value)" style="width:130px;padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;font-family:inherit;background:#fff">${ikDepartOptions(row.depart||IK_DEFAULT_DEPART)}</select>`;
    const destInp=inp('lieu',row.lieu||'','150px','text','list="ik-lieux-list"');
    // séparateur visuel entre journées, pour lire les chaînes multi-sites
    const sep=(lastDate!==null&&row.date!==lastDate)?' style="border-top:2px solid var(--border)"':'';
    lastDate=row.date;
    // flèches actives seulement à l'intérieur d'une même journée
    const canUp=idx>0&&ikRows[idx-1].date===row.date;
    const canDown=idx<ikRows.length-1&&ikRows[idx+1].date===row.date;
    const arrow=(dir,ok,icon,titre)=>`<button class="ik-row-del" ${ok?`onclick="ikMoveRow(${idx},${dir})" title="${titre}"`:'disabled title="Première ou dernière étape de la journée"'} style="${ok?'':'opacity:0.25;cursor:default'}"><i class="ti ti-${icon}" style="font-size:12px"></i></button>`;
    const actions=`<div style="display:flex;gap:2px;align-items:center">${arrow(-1,canUp,'chevron-up','Monter dans la journée')}${arrow(1,canDown,'chevron-down','Descendre dans la journée')}<button class="ik-row-del" onclick="ikDeleteRow(${idx})" title="Supprimer"><i class="ti ti-x"></i></button></div>`;
    if(row.ignored)return`<tr${sep?' style="opacity:0.4;border-top:2px solid var(--border)"':' style="opacity:0.4"'}><td>${inp('date',row.date,'95px')}</td><td>${departSel}</td><td class="ik-ignored">${destInp}</td><td colspan="4" style="text-align:center;font-size:12px;color:#bbb;font-style:italic">— destination vide ou identique au départ, non comptabilisé —</td><td style="text-align:center">${badge}</td><td>${actions}</td></tr>`;
    // lieu libre (hors liste) : km saisissable + bouton d'enregistrement du lieu
    const kmCell=row.creche
      ?`<td style="text-align:center;font-weight:600">${km}${km>0?'':' <span title="Distance non renseignée entre ces deux lieux — complétez la grille des distances" style="color:var(--orange);font-size:11px">⚠️</span>'}</td>`
      :`<td style="text-align:center">${inp('km',row.km||0,'55px','number')}${Number(row.km)>0?` <button class="ik-row-del" title="Enregistrer ce lieu dans la liste" onclick="ikSaveRowLieu(${idx})"><i class="ti ti-map-pin-plus" style="font-size:12px"></i></button>`:' <span title="Kilométrage à saisir" style="color:var(--orange);font-size:11px">⚠️</span>'}</td>`;
    return`<tr${sep}><td>${inp('date',row.date,'95px')}</td><td>${departSel}</td><td>${destInp}</td><td style="text-align:center">${inp('nbr',row.nbr,'50px','number')}</td>${kmCell}<td class="ik-val">${tKm}</td><td class="ik-val">${mont.toFixed(2)} €</td><td style="text-align:center">${badge}</td><td>${actions}</td></tr>`;
  }).join('');
  ikUpdateTotals();
}

function ikUpdateRow(idx,field,value){
  const row=ikRows[idx];
  if(field==='nbr')row.nbr=parseInt(value)||1;
  else if(field==='km')row.km=parseFloat(value)||0;
  else row[field]=value;
  if(field==='lieu'||field==='depart'||field==='trajet'){
    const depart=ikDetectCreche(row.depart)||row.depart||IK_DEFAULT_DEPART;
    const lieu=(field==='trajet'?String(value).split('/').pop():(row.lieu||'')).trim();
    const rebuilt=ikMakeRow(row.id,row.date,depart,lieu,row.nbr,row.slot);
    Object.assign(row,rebuilt,{km:row.km||0});
  }
  if(field==='date')ikSortRows();
  ikSaveRows();
  ikRenderTable();
}

function ikDeleteRow(idx){ikRows.splice(idx,1);ikRenumberSlots();ikSaveRows();ikRenderTable();}

// Renumérote les étapes (slot) de 0..n dans chaque journée, d'après l'ordre courant du tableau.
function ikRenumberSlots(){
  let last=null,n=0;
  ikRows.forEach(r=>{if(r.date!==last){last=r.date;n=0;}r.slot=n++;});
}

// Remet les lignes dans l'ordre chronologique, en conservant l'ordre des étapes d'une même journée.
function ikSortRows(){
  ikRows=ikRows.map((r,i)=>Object.assign(r,{_i:i}))
    .sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.slot||0)-(b.slot||0)||a._i-b._i);
  ikRows.forEach(r=>{delete r._i;});
  ikRenumberSlots();
}

// Déplace une ligne d'un cran, uniquement à l'intérieur de sa journée
// (l'ordre chronologique entre journées reste garanti par le tri).
function ikMoveRow(idx,dir){
  const j=idx+dir;
  if(j<0||j>=ikRows.length)return;
  if(ikRows[j].date!==ikRows[idx].date)return;
  const tmp=ikRows[idx];ikRows[idx]=ikRows[j];ikRows[j]=tmp;
  ikRenumberSlots();
  ikSaveRows();ikRenderTable();
}

function ikAddRow(){
  const month=document.getElementById('ik-month').value;
  const derniere=ikRows.length?ikRows[ikRows.length-1].date:null;
  const date=derniere||(month?month+'-01':ipDateToLocalISO(new Date()));
  // slot élevé : la nouvelle ligne se place en dernière étape de sa journée, puis le tri la replace
  ikRows.push(ikMakeRow(Date.now().toString(),date,ikDefaultDepart(),'',1,999));
  ikSortRows();
  ikSaveRows();ikRenderTable();
}

// Recompose la chaîne d'une journée après modification manuelle des lieux.
function ikRechainDate(date){
  const raw=ikRows.filter(r=>r.date===date).map(r=>({id:r.id,date:r.date,lieu:r.lieu,slot:r.slot}));
  if(raw.length<2)return;
  const chained=ikChainDays(raw);
  ikRows=ikRows.filter(r=>r.date!==date).concat(chained)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot);
  ikSaveRows();ikRenderTable();
  showBanner('Journée du '+ikFmtDate(date)+' rechaînée.');
}

function ikUpdateTotals(){
  const matrix=ikGetCurrentMatrix();
  const bareme=parseFloat(document.getElementById('ik-bareme').value)||0.248;
  let tKm=0,tEur=0,tP=0,tB=0,tO=0,tC=0;
  ikRows.filter(r=>!r.ignored).forEach(r=>{
    const km=ikRowKm(r,matrix),tk=r.nbr*km,m=tk*bareme;
    tKm+=tk;tEur+=m;
    const g=ikRowGroup(r);
    if(g==='Picot 1 - Picot 2')tP+=m;
    else if(g==='Brunet')tB+=m;
    else if(g==='Ollioules - St Jean')tO+=m;
    else if(g==='Cuers')tC+=m;
  });
  document.getElementById('ik-tot-km').textContent=tKm;
  document.getElementById('ik-tot-eur').textContent=tEur.toFixed(2).replace('.',',');
  document.getElementById('ik-tot-picot').textContent=tP.toFixed(2).replace('.',',')+' €';
  document.getElementById('ik-tot-brunet').textContent=tB.toFixed(2).replace('.',',')+' €';
  document.getElementById('ik-tot-osj').textContent=tO.toFixed(2).replace('.',',')+' €';
  const cuersEl=document.getElementById('ik-tot-cuers');
  if(cuersEl)cuersEl.textContent=tC.toFixed(2).replace('.',',')+' €';
}

function ikInit(){
  const now=new Date();
  const month=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  if(!document.getElementById('ik-month').value)document.getElementById('ik-month').value=month;
  ikRenderPersonSelect();
  ikRenderConfig();
  ikLoad();
}

// Sélection de la journée à rechaîner (recompose départ → sites → retour).
function ikRechainPrompt(){
  const dates=[...new Set(ikRows.map(r=>r.date))].sort();
  const multi=dates.filter(d=>ikRows.filter(r=>r.date===d).length>1);
  if(!multi.length){alert('Aucune journée à plusieurs déplacements ce mois-ci.');return;}
  const choix=prompt('Journées à plusieurs déplacements :\n\n'+multi.map(d=>'  '+ikFmtDate(d)).join('\n')+'\n\nSaisis la date à rechaîner (JJ/MM/AAAA) :',ikFmtDate(multi[0]));
  if(!choix)return;
  const m=choix.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso=m?`${m[3]}-${m[2]}-${m[1]}`:choix.trim();
  if(!multi.includes(iso)){alert('Cette date ne fait pas partie des journées multi-déplacements.');return;}
  ikRechainDate(iso);
}

function ikFmtDate(d){if(!d)return'';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});}

// ============================================================
// Génération du vrai fichier .xlsx FDEPvi (template Koala Kids)
// Le classeur modèle (logos, styles, mises en forme) est embarqué en base64
// et manipulé au niveau XML/zip pour produire un rendu strictement identique
// au fichier source du réseau, avec un onglet FDEPvi par groupe de crèches.
// ============================================================
const IK_TEMPLATE_B64 = "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";

function ikExcelSerial(d){
  const epoch = Date.UTC(1899,11,30);
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc - epoch) / 86400000);
}

function ikEscapeXml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Construit le sheet1.xml dynamique (en-tête fixe + N lignes de données + pied de page décalé)
// à partir du sheet1.xml du template. Retourne {xml, delta, lastRow}.
function ikBuildSheetXml(templateXml, rows, employeeName, monthNameCap, firstDate, lastDate, bareme){
  const n = rows.length;

  const headerEnd = templateXml.indexOf('<row r="10"');
  let header = templateXml.slice(0, headerEnd);

  const row10Match = templateXml.match(/<row r="10"[^>]*>[\s\S]*?<\/row>/);
  const row10Template = row10Match[0];

  const tailStart = templateXml.indexOf('<row r="21"');
  const sheetDataEnd = templateXml.indexOf('</sheetData>');
  let tail = templateXml.slice(tailStart, sheetDataEnd);
  tail = tail.replace(/<row r="41"[^/]*\/>/, ''); // résidu cosmétique du fichier d'origine

  let footer = templateXml.slice(sheetDataEnd);

  header = header.replace(
    /<c r="E3" s="38"[^/][\s\S]*?<\/c>/,
    `<c r="E3" s="38" t="inlineStr"><is><t>${ikEscapeXml(employeeName)}</t></is></c>`
  );
  header = header.replace(/<c r="B4" s="26"><v>[\d.]+<\/v><\/c>/, `<c r="B4" s="26"><v>${bareme}</v></c>`);
  header = header.replace(/<c r="J4" s="1"><v>\d+<\/v><\/c>/, `<c r="J4" s="1"><v>${ikExcelSerial(firstDate)}</v></c>`);
  header = header.replace(/<c r="L4" s="2"><v>\d+<\/v><\/c>/, `<c r="L4" s="2"><v>${ikExcelSerial(lastDate)}</v></c>`);

  // --- Construit les lignes de données 10..10+n-1 et calcule les sommes au passage ---
  // (les sommes sont calculées ici, AVANT row 6 / M4 qui en ont besoin)
  let dataRowsXml = '';
  let sumG=0, sumN=0;
  for(let i=0;i<n;i++){
    const r = rows[i];
    const rn = 10 + i;
    const eVal = r.nbr * r.km;
    const gVal = eVal * bareme;
    const nVal = gVal; // N = G+H+I+J+K+L-M, et H..M sont vides (0) dans ce gabarit
    sumG += gVal; sumN += nVal;
    let block = row10Template;
    block = block.replace(/r="10"/, `r="${rn}"`);
    block = block.replace(/r="([A-N])10"/g, (m,col)=>`r="${col}${rn}"`);
    block = block.replace(/D10\*C10/, `D${rn}*C${rn}`);
    block = block.replace(/E10=""/, `E${rn}=""`);
    block = block.replace(/\+E10\*/, `+E${rn}*`);
    block = block.replace(/\+G10\+H10\+I10\+J10\+K10\+L10-M10/, `+G${rn}+H${rn}+I${rn}+J${rn}+K${rn}+L${rn}-M${rn}`);
    block = block.replace(new RegExp(`<c r="A${rn}" s="33"><v>\\d+</v></c>`), `<c r="A${rn}" s="33"><v>${ikExcelSerial(r.date)}</v></c>`);
    block = block.replace(new RegExp(`<c r="B${rn}" s="19" t="s"><v>\\d+</v></c>`), `<c r="B${rn}" s="19" t="inlineStr"><is><t>${ikEscapeXml(r.trajet)}</t></is></c>`);
    block = block.replace(new RegExp(`<c r="C${rn}" s="31"><v>\\d+</v></c>`), `<c r="C${rn}" s="31"><v>${r.nbr}</v></c>`);
    block = block.replace(new RegExp(`<c r="D${rn}" s="32"><v>\\d+</v></c>`), `<c r="D${rn}" s="32"><v>${r.km}</v></c>`);
    // Remplace les valeurs en cache des formules par les vraies valeurs calculées
    // (essentiel pour les viewers qui n'exécutent pas le moteur de calcul Excel)
    block = block.replace(/(<f>D\d+\*C\d+<\/f>)<v>[^<]*<\/v>/, `$1<v>${eVal}</v>`);
    block = block.replace(/(<f>\+IF\(E\d+="",0,\+E\d+\*\$B\$4\)<\/f>)<v>[^<]*<\/v>/, `$1<v>${gVal}</v>`);
    block = block.replace(/(<f>\+G\d+\+H\d+\+I\d+\+J\d+\+K\d+\+L\d+-M\d+<\/f>)<v>[^<]*<\/v>/, `$1<v>${nVal}</v>`);
    dataRowsXml += block;
  }

  const lastDataRow = n > 0 ? 9 + n : 9;
  const row6New =
    '<row r="6" spans="1:14" ht="18" customHeight="1" x14ac:dyDescent="0.2">' +
    '<c r="A6" s="12"/><c r="B6" s="12"/><c r="C6" s="12"/><c r="D6" s="12"/><c r="E6" s="27"/><c r="F6" s="27"/>' +
    `<c r="G6" s="13"><f>SUM(G10:G${lastDataRow})</f><v>${sumG}</v></c>` +
    `<c r="H6" s="13"><f>SUM(H9:H${lastDataRow})</f><v>0</v></c>` +
    `<c r="I6" s="13"><f>SUM(I9:I${lastDataRow})</f><v>0</v></c>` +
    `<c r="J6" s="13"><f>SUM(J9:J${lastDataRow})</f><v>0</v></c>` +
    `<c r="K6" s="13"><f>SUM(K9:K${lastDataRow})</f><v>0</v></c>` +
    `<c r="L6" s="13"><f>SUM(L9:L${lastDataRow})</f><v>0</v></c>` +
    `<c r="M6" s="14"><f>SUM(M9:M${lastDataRow})</f><v>0</v></c>` +
    `<c r="N6" s="14"><f>SUM(N10:N${lastDataRow})</f><v>${sumN}</v></c>` +
    '</row>';
  header = header.replace(/<row r="6"[^>]*>[\s\S]*?<\/row>/, row6New);

  // Désactive fitToPage (instable avec un nombre de lignes variable) — conserve scale="94" fixe
  header = header.replace('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>', '<sheetPr/>');
  // M4 = +M6+N6-M5 = 0 + sumN - 0
  header = header.replace(/<c r="M4" s="43"><f>\+M6\+N6-M5<\/f>(?:<v>[^<]*<\/v>)?<\/c>/, `<c r="M4" s="43"><f>+M6+N6-M5</f><v>${sumN}</v></c>`);
  header = header.replace(/(<f>[^<]*<\/f>)<v\s*\/>/g, '$1');

  const delta = n - 11; // le gabarit original a 11 lignes (10..20)
  let tailShifted = tail.replace(/r="([A-N]?)(2[1-4])"/g, (m,prefix,num)=>`r="${prefix}${parseInt(num,10)+delta}"`);
  const newMoisRow = 22 + delta;
  tailShifted = tailShifted.replace(
    new RegExp(`<c r="F${newMoisRow}" s="28"(?: t="s")?(?:/>|>[\\s\\S]*?</c>)`),
    `<c r="F${newMoisRow}" s="28" t="inlineStr"><is><t>${ikEscapeXml(monthNameCap)}</t></is></c>`
  );

  const visaR = 21 + delta;
  const r24 = 24 + delta;
  let footerNew = footer
    .replace('<mergeCell ref="L21:L24"/>', `<mergeCell ref="L${visaR}:L${r24}"/>`)
    .replace('<mergeCell ref="I21:I24"/>', `<mergeCell ref="I${visaR}:I${r24}"/>`)
    .replace('<mergeCell ref="A21:A24"/>', `<mergeCell ref="A${visaR}:A${r24}"/>`)
    .replace('<mergeCell ref="E21:E24"/>', `<mergeCell ref="E${visaR}:E${r24}"/>`);
  const maxRow = Math.max(r24, 24);
  header = header.replace(/<dimension ref="A1:N\d+"\/>/, `<dimension ref="A1:N${maxRow}"/>`);

  const xml = header + dataRowsXml + tailShifted + footerNew;
  return {xml, delta, lastRow: r24};
}

// Décale uniquement l'ancre de l'image de signature pour qu'elle reste alignée
// avec la case VISA SALARIE quel que soit le nombre de lignes de trajets.
function ikBuildDrawingXml(templateDrawingXml, delta){
  if(delta === 0) return templateDrawingXml;
  return templateDrawingXml.replace(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g, (block)=>{
    if(block.indexOf('<xdr:row>20</xdr:row>') === -1) return block;
    return block.replace(/<xdr:row>(\d+)<\/xdr:row>/g, (m,num)=>`<xdr:row>${parseInt(num,10)+delta}</xdr:row>`);
  });
}

function ikBuildWorkbookXml(sheetNamesWithLastRow){
  const sheetsXml = sheetNamesWithLastRow.map((s,i)=>
    `<sheet name="${ikEscapeXml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`
  ).join('');
  const definedNamesXml = sheetNamesWithLastRow.map((s,i)=>
    `<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${s.name}'!$A$1:$N$${s.lastRow}</definedName>`
  ).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'+
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '+
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<workbookPr defaultThemeVersion="124226"/>'+
    '<bookViews><workbookView xWindow="-120" yWindow="-120" windowWidth="29040" windowHeight="15840"/></bookViews>'+
    `<sheets>${sheetsXml}</sheets>`+
    `<definedNames>${definedNamesXml}</definedNames>`+
    '<calcPr calcId="191028" fullCalcOnLoad="1"/>'+
    '</workbook>';
}

function ikBuildWorkbookRels(nSheets){
  let rels = '';
  for(let i=0;i<nSheets;i++){
    rels += `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`;
  }
  const nextId = nSheets+1;
  rels += `<Relationship Id="rId${nextId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`;
  rels += `<Relationship Id="rId${nextId+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  rels += `<Relationship Id="rId${nextId+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels+'</Relationships>';
}

function ikBuildContentTypes(nSheets){
  let overrides = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
  for(let i=0;i<nSheets;i++){
    overrides += `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    overrides += `<Override PartName="/xl/drawings/drawing${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
  }
  overrides += '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>';
  overrides += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  overrides += '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>';
  overrides += '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>';
  overrides += '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="jpeg" ContentType="image/jpeg"/>'+
    '<Default Extension="jpg" ContentType="image/jpeg"/>'+
    '<Default Extension="png" ContentType="image/png"/>'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    overrides+'</Types>';
}

function ikBuildSheetRels(drawingIndex){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingIndex}.xml"/>`+
    '</Relationships>';
}

// Construit le classeur .xlsx complet (Blob) avec un onglet FDEPvi par groupe.
// groupsData: [{name, rows}], chaque rows: [{date, trajet, nbr, km}]
async function ikBuildWorkbookBlob(groupsData, bareme, monthNameCap, firstDate, lastDate, employeeName){
  const zip = await JSZip.loadAsync(IK_TEMPLATE_B64, {base64:true});
  const sheetTemplate = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const drawingTemplate = await zip.file('xl/drawings/drawing1.xml').async('string');
  const drawingRelsTemplate = await zip.file('xl/drawings/_rels/drawing1.xml.rels').async('string');

  const out = new JSZip();
  for(const path of ['xl/styles.xml','xl/sharedStrings.xml','xl/theme/theme1.xml',
                      'xl/media/image1.jpeg','xl/media/image2.png','xl/media/image3.jpg',
                      'docProps/core.xml','docProps/app.xml','_rels/.rels']){
    out.file(path, await zip.file(path).async('uint8array'));
  }

  const sheetNamesWithLastRow = [];
  groupsData.forEach((g, i)=>{
    const idx = i+1;
    const {xml, delta, lastRow} = ikBuildSheetXml(sheetTemplate, g.rows, employeeName, monthNameCap, firstDate, lastDate, bareme);
    const drawingXml = ikBuildDrawingXml(drawingTemplate, delta);
    out.file(`xl/worksheets/sheet${idx}.xml`, xml);
    out.file(`xl/worksheets/_rels/sheet${idx}.xml.rels`, ikBuildSheetRels(idx));
    out.file(`xl/drawings/drawing${idx}.xml`, drawingXml);
    out.file(`xl/drawings/_rels/drawing${idx}.xml.rels`, drawingRelsTemplate);
    sheetNamesWithLastRow.push({name:g.name, lastRow});
  });

  out.file('xl/workbook.xml', ikBuildWorkbookXml(sheetNamesWithLastRow));
  out.file('xl/_rels/workbook.xml.rels', ikBuildWorkbookRels(groupsData.length));
  out.file('[Content_Types].xml', ikBuildContentTypes(groupsData.length));

  return out.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

async function ikGenerate(){
  const month=document.getElementById('ik-month').value;
  if(!month){alert('Sélectionnez un mois.');return;}
  const active=ikRows.filter(r=>!r.ignored);
  if(!active.length){alert('Aucun trajet à exporter.');return;}
  const matrix=ikGetCurrentMatrix();
  const bareme=parseFloat(document.getElementById('ik-bareme').value)||0.248;
  const[year,monthNum]=month.split('-').map(Number);
  const monthNames=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const monthName=monthNames[monthNum-1];
  const firstDate=new Date(year,monthNum-1,1);
  const lastDate=new Date(year,monthNum,0);

  const sansKm=active.filter(r=>!(ikRowKm(r,matrix)>0));
  const exportables=active.filter(r=>ikRowKm(r,matrix)>0);
  if(sansKm.length&&!confirm(sansKm.length+' ligne(s) n\'ont pas de kilométrage renseigné et seront exclues de l\'export.\n\nContinuer quand même ?'))return;
  if(!exportables.length){alert('Aucun trajet avec kilométrage à exporter.');return;}
  const sheetsData={};
  IK_GROUP_ORDER.forEach(g=>{sheetsData[g]=exportables.filter(r=>ikRowGroup(r)===g);});
  // Un groupe sans aucun trajet ce mois-là n'a pas d'onglet (évite une feuille FDEPvi vide).
  const groupsData=Object.entries(sheetsData).filter(([,rows])=>rows.length>0).map(([name,rows])=>({
    name,
    rows: rows.map(r=>({date:new Date(r.date+'T12:00:00'), trajet:r.trajet||`${r.depart||IK_DEFAULT_DEPART}/${r.lieu||r.creche}`, nbr:r.nbr, km:ikRowKm(r,matrix)}))
  }));
  if(!groupsData.length){alert('Aucun trajet à exporter.');return;}

  const employeeName=ikFormatEmployeeName(ikPersonName());
  const fileSuffix=employeeName.split(' ')[0].replace(/[^A-Za-zÀ-ÿ-]/g,'')||'FCS';

  try{
    showBanner('Génération du fichier Excel…');
    const blob=await ikBuildWorkbookBlob(groupsData, bareme, monthName, firstDate, lastDate, employeeName);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`JUSTIF_IK_MENSUEL_${fileSuffix}_${monthName.toLowerCase()}_${year}.xlsx`;a.click();
    URL.revokeObjectURL(url);
    showBanner(`Fiche IK ${monthName} ${year} générée ✅`);
  }catch(e){
    console.error('[ikGenerate]',e);
    showBanner('Erreur lors de la génération du fichier Excel : '+e.message,'error');
  }
}

// FIN FRAIS IK
// ============================================================

