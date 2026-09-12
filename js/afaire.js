// ══════════════ MODULE À FAIRE (David uniquement) ══════════════
let afCache=[];
let afCurrentDate=null;
let afCrecheFilter='all';

const AF_TYPES={
  appel:{label:'Appel',icon:'📞'},
  mail:{label:'Mail',icon:'✉️'},
  travaux:{label:'Travaux',icon:'🔧'},
  administratif:{label:'Administratif',icon:'📋'},
  reseau:{label:'Réseau',icon:'🔗'},
  autre:{label:'Autre',icon:'✔️'}
};
function afTypeMeta(t){return AF_TYPES[t]||AF_TYPES.autre;}
function afCrecheName(id){if(!id)return null;const c=cacheCreches.find(x=>x.id===id);return c?c.name:null;}

async function afInit(){
  if(!afCurrentDate)afCurrentDate=todayStr();
  const navD=document.getElementById('af-nav-date');
  const newD=document.getElementById('af-new-date');
  if(navD)navD.value=afCurrentDate;
  if(newD&&!newD.value)newD.value=afCurrentDate;
  // peupler le select crèche du formulaire
  const sel=document.getElementById('af-new-creche');
  if(sel)sel.innerHTML='<option value="">— Aucune / réseau —</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+escHtml(c.name)+'</option>').join('');
  // Les actions de direction dont je suis responsable remontent dans la
  // journée : elles sont chargées ici, l'onglet Actions n'ayant pas
  // forcément été ouvert.
  if(typeof adEnsureCharge==='function'){try{await adEnsureCharge();}catch(e){console.warn('[afaire] actions de direction',e);}}
  await afLoad();
}

async function afLoad(){
  const{data,error}=await sb.from('taches_afaire').select('*').order('created_at',{ascending:true});
  if(error){showBanner('Erreur chargement tâches.','error');afCache=[];}
  else afCache=data||[];
  afRender();
}

function afShiftDay(delta){
  const d=new Date(afCurrentDate+'T12:00:00');
  d.setDate(d.getDate()+delta);
  afCurrentDate=ipDateToLocalISO(d);
  document.getElementById('af-nav-date').value=afCurrentDate;
  afRender();
}
function afGoToday(){
  afCurrentDate=todayStr();
  document.getElementById('af-nav-date').value=afCurrentDate;
  afRender();
}
function afSetCrecheFilter(id){afCrecheFilter=id;afRender();}

function afFmtDayLabel(iso){
  const d=new Date(iso+'T12:00:00');
  const jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const mois=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return jours[d.getDay()]+' '+d.getDate()+' '+mois[d.getMonth()]+' '+d.getFullYear();
}

async function afAdd(){
  const titre=(document.getElementById('af-new-titre').value||'').trim();
  if(!titre){document.getElementById('af-new-titre').focus();return;}
  const date_jour=document.getElementById('af-new-date').value||todayStr();
  const priorite=document.getElementById('af-new-prio').value||'normale';
  const type=document.getElementById('af-new-type').value||'autre';
  const creche_id=document.getElementById('af-new-creche').value||null;
  const details=(document.getElementById('af-new-details').value||'').trim()||null;
  const row={user_id:currentUser.id,titre:titre,details:details,date_jour:date_jour,priorite:priorite,type:type,creche_id:creche_id,fait:false};
  const{data,error}=await sb.from('taches_afaire').insert(row).select().single();
  if(error){showBanner('Erreur ajout tâche.','error');return;}
  afCache.push(data);
  document.getElementById('af-new-titre').value='';
  document.getElementById('af-new-details').value='';
  document.getElementById('af-new-prio').value='normale';
  document.getElementById('af-new-type').value='autre';
  afCurrentDate=date_jour;
  document.getElementById('af-nav-date').value=afCurrentDate;
  afRender();
  showBanner('Tâche ajoutée !');
}

async function afToggle(id){
  const t=afCache.find(x=>x.id===id);if(!t)return;
  const nv=!t.fait;
  const{error}=await sb.from('taches_afaire').update({fait:nv}).eq('id',id);
  if(error){showBanner('Erreur mise à jour.','error');return;}
  t.fait=nv;afRender();
}
async function afDelete(id){
  if(!confirm('Supprimer cette tâche ?'))return;
  const{error}=await sb.from('taches_afaire').delete().eq('id',id);
  if(error){showBanner('Erreur suppression.','error');return;}
  afCache=afCache.filter(x=>x.id!==id);afRender();
}
async function afMove(id,delta){
  const t=afCache.find(x=>x.id===id);if(!t)return;
  const d=new Date(t.date_jour+'T12:00:00');
  d.setDate(d.getDate()+delta);
  const nd=ipDateToLocalISO(d);
  const{error}=await sb.from('taches_afaire').update({date_jour:nd}).eq('id',id);
  if(error){showBanner('Erreur déplacement.','error');return;}
  t.date_jour=nd;afRender();
}

// Événements du jour (lecture seule, tirés de la table événements)
function afRenderEventsOfDay(iso){
  const box=document.getElementById('af-events-day');
  const evs=(cacheEvenements||[]).filter(e=>{
    const deb=e.date_debut, fin=e.date_fin||e.date_debut;
    return deb&&iso>=deb&&iso<=fin;
  }).sort((a,b)=>(a.heure_debut||'99').localeCompare(b.heure_debut||'99'));
  if(!evs.length){box.innerHTML='';return;}
  box.innerHTML='<div style="background:var(--bg);border:1.5px dashed var(--border);border-radius:10px;padding:10px 12px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px"><i class="ti ti-calendar"></i> Prévu ce jour (agenda)</div>'
    +evs.map(e=>{
      const h=e.heure_debut?('<span style="font-weight:700;color:var(--koala)">'+e.heure_debut.slice(0,5)+'</span> '):'';
      const cr=afCrecheName(e.creche_id);
      const crTag=cr?'<span style="font-size:11px;color:var(--muted)"> · '+escHtml(cr)+'</span>':'';
      const lieu=e.lieu?'<span style="font-size:11px;color:var(--muted)"> · '+escHtml(e.lieu)+'</span>':'';
      return '<div style="font-size:13px;padding:2px 0">'+h+escHtml(e.titre||'Événement')+crTag+lieu+'</div>';
    }).join('')
  +'</div>';
}

// Barre de filtre crèche
function afRenderCrecheFilter(dayItems){
  const bar=document.getElementById('af-creche-filter');
  const counts={all:dayItems.length,none:0};
  cacheCreches.forEach(c=>counts[c.id]=0);
  dayItems.forEach(t=>{const k=t.creche_id||'none';counts[k]=(counts[k]||0)+1;});
  let html='<button class="af-fbtn'+(afCrecheFilter==='all'?' active':'')+'" onclick="afSetCrecheFilter(\'all\')" style="'+afFbtnStyle(afCrecheFilter==='all')+'"><i class="ti ti-building-community" style="font-size:12px"></i> Toutes ('+counts.all+')</button>';
  cacheCreches.forEach(c=>{
    const n=counts[c.id]||0;
    html+='<button class="af-fbtn'+(afCrecheFilter===c.id?' active':'')+'" onclick="afSetCrecheFilter(\''+c.id+'\')" style="'+afFbtnStyle(afCrecheFilter===c.id)+'"><i class="ti ti-building" style="font-size:12px"></i> '+escHtml(c.name)+' ('+n+')</button>';
  });
  if(counts.none>0){
    html+='<button class="af-fbtn'+(afCrecheFilter==='none'?' active':'')+'" onclick="afSetCrecheFilter(\'none\')" style="'+afFbtnStyle(afCrecheFilter==='none')+'"><i class="ti ti-link" style="font-size:12px"></i> Réseau ('+counts.none+')</button>';
  }
  bar.innerHTML=html;
}
function afFbtnStyle(active){
  return 'display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:5px 10px;border-radius:8px;cursor:pointer;border:1.5px solid '+(active?'var(--koala)':'var(--border)')+';background:'+(active?'var(--koala)':'var(--card)')+';color:'+(active?'#fff':'var(--text)')+';font-weight:600';
}

function afTaskCard(t){
  const urgent=t.priorite==='urgente'&&!t.fait;
  const border=urgent?'var(--red)':'var(--border)';
  const bg=t.fait?'var(--bg)':'var(--card)';
  const titreStyle=t.fait?'text-decoration:line-through;color:var(--muted)':'color:var(--text);font-weight:600';
  const tm=afTypeMeta(t.type);
  const typeTag='<span style="font-size:11px;font-weight:600;color:var(--muted);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:1px 7px">'+tm.icon+' '+tm.label+'</span>';
  const cr=afCrecheName(t.creche_id);
  const crTag=cr?'<span style="font-size:11px;font-weight:600;color:var(--koala);background:var(--card);border:1px solid var(--koala);border-radius:6px;padding:1px 7px"><i class="ti ti-building" style="font-size:10px"></i> '+escHtml(cr)+'</span>':'';
  return '<div style="background:'+bg+';border:1.5px solid '+border+';border-left-width:4px;border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px">'
    +'<div onclick="afToggle(\''+t.id+'\')" style="cursor:pointer;flex-shrink:0;margin-top:1px" title="Marquer fait / à faire">'
      +'<i class="ti ti-'+(t.fait?'square-check-filled':'square')+'" style="font-size:22px;color:'+(t.fait?'var(--koala)':'var(--muted)')+'"></i></div>'
    +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:14px;'+titreStyle+'">'+(urgent?'🔴 ':'')+escHtml(t.titre)+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">'+typeTag+crTag+'</div>'
      +(t.details?'<div style="font-size:12px;color:var(--muted);margin-top:5px;white-space:pre-wrap">'+escHtml(t.details)+'</div>':'')
    +'</div>'
    +'<div style="display:flex;gap:2px;flex-shrink:0">'
      +'<button class="ibtn" onclick="afMove(\''+t.id+'\',-1)" title="Reporter à la veille"><i class="ti ti-arrow-left"></i></button>'
      +'<button class="ibtn" onclick="afMove(\''+t.id+'\',1)" title="Reporter au lendemain"><i class="ti ti-arrow-right"></i></button>'
      +'<button class="ibtn del" onclick="afDelete(\''+t.id+'\')" title="Supprimer"><i class="ti ti-trash"></i></button>'
    +'</div>'
  +'</div>';
}

function afSortTasks(arr){
  return arr.slice().sort((a,b)=>{
    if(a.fait!==b.fait)return a.fait?1:-1;
    const pa=a.priorite==='urgente'?0:1, pb=b.priorite==='urgente'?0:1;
    if(pa!==pb)return pa-pb;
    return (a.created_at||'').localeCompare(b.created_at||'');
  });
}

function afRender(){
  afCurrentDate=document.getElementById('af-nav-date').value||afCurrentDate||todayStr();
  document.getElementById('af-title-day').textContent=afFmtDayLabel(afCurrentDate);
  afRenderEventsOfDay(afCurrentDate);
  if(typeof adRenderAfaireBloc==='function'){try{adRenderAfaireBloc(afCurrentDate);}catch(e){console.warn('[afaire] miroir actions',e);}}
  const dayItems=afCache.filter(t=>t.date_jour===afCurrentDate);
  afRenderCrecheFilter(dayItems);
  // s'assurer que le filtre courant est encore valide
  if(afCrecheFilter!=='all'&&afCrecheFilter!=='none'&&!cacheCreches.find(c=>c.id===afCrecheFilter))afCrecheFilter='all';
  let items=dayItems;
  if(afCrecheFilter==='none')items=dayItems.filter(t=>!t.creche_id);
  else if(afCrecheFilter!=='all')items=dayItems.filter(t=>t.creche_id===afCrecheFilter);

  const list=document.getElementById('af-list');
  if(!items.length){
    const bloc=document.getElementById('af-actions-dir');
    const avecActions=bloc&&bloc.innerHTML.trim();
    list.innerHTML='<div style="text-align:center;color:var(--muted);padding:30px;font-size:13px"><i class="ti ti-coffee" style="font-size:28px;display:block;margin-bottom:6px;opacity:0.5"></i>Aucune tâche personnelle pour ce jour'+(afCrecheFilter!=='all'?' (avec ce filtre)':'')+(avecActions?' — seules les actions de direction ci-dessus attendent.':'.')+'</div>';
    return;
  }
  // Si "Toutes" → regrouper par crèche sous des titres. Sinon → liste simple.
  if(afCrecheFilter==='all'){
    const groups=[];
    cacheCreches.forEach(c=>{const g=items.filter(t=>t.creche_id===c.id);if(g.length)groups.push({name:c.name,icon:'ti-building',items:g});});
    const noneG=items.filter(t=>!t.creche_id);
    if(noneG.length)groups.push({name:'Réseau / sans crèche',icon:'ti-link',items:noneG});
    list.innerHTML=groups.map(g=>
      '<div style="margin-bottom:4px">'
      +'<div style="font-size:12px;font-weight:700;color:var(--koala);text-transform:uppercase;letter-spacing:0.5px;padding:4px 2px;display:flex;align-items:center;gap:6px"><i class="ti '+g.icon+'"></i> '+escHtml(g.name)+' <span style="color:var(--muted);font-weight:600">('+g.items.length+')</span></div>'
      +'<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">'+afSortTasks(g.items).map(afTaskCard).join('')+'</div>'
      +'</div>'
    ).join('');
  } else {
    list.innerHTML=afSortTasks(items).map(afTaskCard).join('');
  }
}


