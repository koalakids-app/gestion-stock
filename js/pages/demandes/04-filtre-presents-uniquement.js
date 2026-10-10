function getPresenceCrecheId(){
  if(isDirection){const sel=document.getElementById('presence-creche-select');return sel?.value||null;}
  return currentProfile?.creche_id||null;
}
function initPresenceDate(){
  const input=document.getElementById('presence-date');if(!input.value)input.value=todayStr();
  const sel=document.getElementById('presence-creche-select');
  if(sel&&isDirection){
    sel.style.display='';
    if(!sel.options.length||sel.options.length<=1)
      sel.innerHTML='<option value="">-- Crèche --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
    if(activeCrecheId&&activeCrecheId!=='all'&&!sel.value)sel.value=activeCrecheId;
  }
}
function showPresenceTab(tab,btn){document.querySelectorAll('#main-presence .module-tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#main-presence .module-tab-content').forEach(c=>c.classList.remove('active'));btn.classList.add('active');document.getElementById('presence-'+tab).classList.add('active');currentPresenceSlot=tab;presMajBarre();renderPresence();}

/* ══════════════════════════════════════════════════════════════════════════
   MCM — PRESTATAIRE REPAS (onglet Plus > MCM)
   Regroupe ce qui concerne le traiteur : les incidents repas (retirés du
   registre Incidents enfants), l'import/consultation des menus des semaines
   à venir (table `menus_semaine`, déjà utilisée par Présences > Semaine) et
   les avis des enfants sur les plats (table `mcm_avis_repas`).
   ═════════════════════════════════════════════════════════════════════════ */
function mcmInit(){
  renderMcmIncidents();
  if(!mcmMenusCache.length)mcmLoadMenusList();else mcmRenderMenusList();
  mcmRenderAvis();
}
function showMcmTab(tab,btn){
  document.querySelectorAll('#main-mcm .module-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#main-mcm .module-tab-content').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mcm-'+tab).classList.add('active');
  mcmActiveTab=tab;
  if(tab==='incidents')renderMcmIncidents();
  if(tab==='menus'){if(!mcmMenusCache.length)mcmLoadMenusList();else mcmRenderMenusList();}
  if(tab==='avis')mcmRenderAvis();
}

/* --- Menus des semaines à venir (import + liste) --- */
async function mcmLoadMenusList(){
  const zone=document.getElementById('mcm-menus-list');
  if(zone)zone.innerHTML='<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
  try{
    const{data,error}=await sb.from('menus_semaine').select('*').order('date_debut',{ascending:true}).order('jour');
    if(error)throw error;
    mcmMenusCache=data||[];
  }catch(err){console.warn('[MCM menus] lecture',err);mcmMenusCache=[];}
  mcmRenderMenusList();
}
function mcmRenderMenusList(){
  const zone=document.getElementById('mcm-menus-list');
  if(!zone)return;
  const todayMonday=menusMondayOf(todayStr());
  const weeks={};
  mcmMenusCache.forEach(function(m){(weeks[m.date_debut]=weeks[m.date_debut]||[]).push(m);});
  const dates=Object.keys(weeks).sort();
  if(!dates.length){zone.innerHTML='<div class="empty-state"><i class="ti ti-tools-kitchen-2"></i><p>Aucun menu importé pour le moment.</p></div>';return;}
  zone.innerHTML=dates.map(function(d){
    const jours=weeks[d].sort(function(a,b){return a.jour-b.jour;});
    const parJour={};jours.forEach(function(j){parJour[j.jour]=j;});
    const semaineNum=jours[0].semaine_num;
    const isPast=d<todayMonday;
    function carte(titre,champ,gouterChamp){
      let html='<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">'
        +'<div style="font-weight:800;color:var(--koala);font-size:12px;margin-bottom:6px">'+escHtml(titre)+'</div>'
        +'<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px">';
      for(let j=1;j<=5;j++){
        const m=parJour[j];
        html+='<div style="font-size:11px"><div style="font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:2px">'+MENU_JOURS[j-1]+'</div>'
          +menusLigneListe(m?m[champ]:null)
          +(gouterChamp&&m&&m[gouterChamp]?'<div style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--border);color:var(--koala-dark)"><i class="ti ti-cookie" style="font-size:11px"></i> '+escHtml(m[gouterChamp])+'</div>':'')
          +'</div>';
      }
      html+='</div></div>';
      return html;
    }
    const fichierPath=jours[0].fichier_path;
    return'<details'+(isPast?'':' open')+' style="border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin-bottom:10px;background:'+(isPast?'#fafafa':'var(--koala-lightest,#F7F6FC)')+'">'
      +'<summary style="cursor:pointer;font-weight:800;color:var(--koala-dark);font-size:13px;display:flex;align-items:center;gap:8px">'
      +'<span style="flex:1">'+(isPast?'':'🟢 ')+'Semaine du '+escHtml(d)+(semaineNum?' (S'+semaineNum+')':'')+(isPast?' — passée':'')+'</span>'
      +(fichierPath?'<a class="ibtn" href="'+escHtml(menusFichierUrl(fichierPath))+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Ouvrir et imprimer le menu original ('+escHtml(jours[0].fichier_nom||'')+')"><i class="ti ti-printer"></i></a>':'')
      +(isDirection?'<button class="ibtn del" onclick="event.preventDefault();event.stopPropagation();mcmDeleteMenuWeek(\''+d+'\')" title="Supprimer ce menu"><i class="ti ti-trash"></i></button>':'')
      +'</summary>'
      +'<div style="margin-top:10px">'
      +carte('Bébés − de 6 mois','bb6',null)
      +carte('Bébés 6-18 mois','bb18','bb18_gouter')
      +carte('Grands 18 mois-3 ans','grand','grand_gouter')
      +'</div></details>';
  }).join('');
}
async function mcmDeleteMenuWeek(dateDebut){
  if(!confirm('Supprimer le menu de la semaine du '+dateDebut+' ?'))return;
  const{error}=await sb.from('menus_semaine').delete().eq('date_debut',dateDebut);
  if(error){showBanner('Erreur lors de la suppression.','error');return;}
  mcmMenusCache=mcmMenusCache.filter(function(m){return m.date_debut!==dateDebut;});
  mcmRenderMenusList();
  showBanner('Menu supprimé.');
}
window.mcmDeleteMenuWeek=mcmDeleteMenuWeek;

/* --- Avis des enfants sur les plats --- */
let mcmAvisMenuRows=[],mcmAvisMapCurrent={},mcmAvisRowsIndex=[];
function mcmWeekStart(){const n=new Date();const day=n.getDay();const diff=n.getDate()-(day===0?6:day-1);const m=new Date(n.getFullYear(),n.getMonth(),diff+mcmWeekOffset*7);m.setHours(0,0,0,0);return m;}
function mcmAvisMoveWeek(delta){if(delta==='today')mcmWeekOffset=0;else mcmWeekOffset+=delta;mcmRenderAvis();}
function mcmInitAvisCrecheSelect(){
  const sel=document.getElementById('mcm-avis-creche-select');
  if(!sel||!isDirection)return;
  sel.style.display='';
  if(!sel.options.length||sel.options.length<=1)
    sel.innerHTML='<option value="">-- Crèche --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  if(activeCrecheId&&activeCrecheId!=='all'&&!sel.value)sel.value=activeCrecheId;
}
function mcmGetAvisCrecheId(){
  if(isDirection){const sel=document.getElementById('mcm-avis-creche-select');return sel?.value||null;}
  return currentProfile?.creche_id||null;
}
async function mcmRenderAvis(){
  const zone=document.getElementById('mcm-avis-zone');
  if(!zone)return;
  const label=document.getElementById('mcm-avis-week-label');
  const ws=mcmWeekStart();
  const dateDebut=ipDateToLocalISO(ws);
  const we=new Date(ws);we.setDate(we.getDate()+4);
  if(label)label.textContent='Semaine du '+ws.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})+' au '+we.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
  mcmInitAvisCrecheSelect();
  const crecheId=mcmGetAvisCrecheId();
  if(!crecheId){zone.innerHTML='<div class="empty-state"><i class="ti ti-building-community"></i><p>Choisissez une crèche.</p></div>';return;}
  zone.innerHTML='<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
  try{
    const[mRes,aRes]=await Promise.all([
      sb.from('menus_semaine').select('*').eq('date_debut',dateDebut).order('jour'),
      sb.from('mcm_avis_repas').select('*').eq('date_debut',dateDebut).eq('creche_id',crecheId)
    ]);
    if(mRes.error)throw mRes.error;
    if(aRes.error)throw aRes.error;
    mcmAvisMenuRows=mRes.data||[];
    mcmAvisMapCurrent={};
    (aRes.data||[]).forEach(function(a){mcmAvisMapCurrent[a.jour+'|'+a.profil+'|'+a.plat]=a;});
  }catch(err){console.warn('[MCM avis] lecture',err);zone.innerHTML='<div class="empty-state"><i class="ti ti-alert-triangle"></i><p>Erreur de chargement.</p></div>';return;}
  mcmRenderAvisBody();
}
function mcmAvisBtn(idx,value,emoji,current){
  const active=current===value;
  const titres={aime:'Aime',neutre:'Neutre',naime_pas:"N'aime pas"};
  return'<button class="ibtn" onclick="mcmSetAvis('+idx+',\''+value+'\')" title="'+titres[value]+'" style="font-size:15px;padding:3px 7px'+(active?';background:var(--koala);color:#fff;border-radius:6px':'')+'">'+emoji+'</button>';
}
function mcmRenderAvisBody(){
  const zone=document.getElementById('mcm-avis-zone');
  if(!zone)return;
  mcmAvisRowsIndex=[];
  if(!mcmAvisMenuRows.length){zone.innerHTML='<div class="empty-state"><i class="ti ti-tools-kitchen-2"></i><p>Aucun menu importé pour cette semaine.</p></div>';return;}
  const parJour={};mcmAvisMenuRows.forEach(function(m){parJour[m.jour]=m;});
  let html='';
  for(let j=1;j<=5;j++){
    const m=parJour[j];
    if(!m)continue;
    let jourHtml='';
    [['bb18','Bébés 6-18 mois'],['grand','Grands 18 mois-3 ans']].forEach(function(pr){
      const profil=pr[0],titre=pr[1];
      const plats=m[profil]||[];
      if(!plats.length)return;
      jourHtml+='<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:6px 0 4px">'+titre+'</div>';
      plats.forEach(function(plat){
        const a=mcmAvisMapCurrent[j+'|'+profil+'|'+plat];
        const app=a?a.appreciation:null;
        const idx=mcmAvisRowsIndex.length;
        mcmAvisRowsIndex.push({jour:j,profil:profil,plat:plat});
        jourHtml+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 0;border-top:1px dashed var(--border)">'
          +'<div style="flex:1;min-width:160px;font-size:12.5px">'+escHtml(plat)+'</div>'
          +'<div style="display:flex;gap:2px">'
          +mcmAvisBtn(idx,'aime','😍',app)
          +mcmAvisBtn(idx,'neutre','😐',app)
          +mcmAvisBtn(idx,'naime_pas','😖',app)
          +'</div>'
          +'<input type="text" class="finput" placeholder="Commentaire (optionnel)" value="'+escHtml(a&&a.commentaire||'')+'" style="width:200px;font-size:12px;padding:4px 8px" onchange="mcmSetAvisComment('+idx+',this.value)">'
          +'</div>';
      });
    });
    if(!jourHtml)continue;
    html+='<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff">'
      +'<div style="font-weight:800;color:var(--koala-dark);font-size:13px;margin-bottom:4px">'+MENU_JOURS[j-1]+(m.theme?' — <span style="font-style:italic;color:var(--orange-dark)">'+escHtml(m.theme)+'</span>':'')+'</div>'
      +jourHtml+'</div>';
  }
  zone.innerHTML=html||'<div class="empty-state"><i class="ti ti-tools-kitchen-2"></i><p>Aucun plat évaluable (bébés 6-18 mois / grands) cette semaine.</p></div>';
}
async function mcmUpsertAvis(jour,profil,plat,patch){
  const crecheId=mcmGetAvisCrecheId();
  if(!crecheId){showBanner('Choisissez une crèche.','error');return;}
  const dateDebut=ipDateToLocalISO(mcmWeekStart());
  const existing=mcmAvisMapCurrent[jour+'|'+profil+'|'+plat];
  const row=Object.assign({
    date_debut:dateDebut,jour:jour,creche_id:crecheId,profil:profil,plat:plat,
    appreciation:(existing&&existing.appreciation)||'neutre',
    commentaire:(existing&&existing.commentaire)||null,
    referent_id:currentProfile?.id||null,
    updated_at:new Date().toISOString()
  },patch);
  try{
    const{data,error}=await sb.from('mcm_avis_repas').upsert(row,{onConflict:'date_debut,jour,creche_id,profil,plat'}).select().single();
    if(error)throw error;
    mcmAvisMapCurrent[jour+'|'+profil+'|'+plat]=data;
    mcmRenderAvisBody();
  }catch(err){console.error('[MCM avis] upsert',err);showBanner('Erreur lors de l\'enregistrement de l\'avis.','error');}
}
function mcmSetAvis(idx,appreciation){
  const r=mcmAvisRowsIndex[idx];if(!r)return;
  mcmUpsertAvis(r.jour,r.profil,r.plat,{appreciation:appreciation});
}
function mcmSetAvisComment(idx,commentaire){
  const r=mcmAvisRowsIndex[idx];if(!r)return;
  mcmUpsertAvis(r.jour,r.profil,r.plat,{commentaire:commentaire.trim()||null});
}
window.mcmSetAvis=mcmSetAvis;
window.mcmSetAvisComment=mcmSetAvisComment;

/* --- Synthèse (tous plats confondus, toutes semaines) --- */
async function mcmToggleSynthese(){
  mcmSyntheseOpen=!mcmSyntheseOpen;
  const chip=document.getElementById('mcm-synthese-chip');
  if(chip)chip.classList.toggle('active',mcmSyntheseOpen);
  const zone=document.getElementById('mcm-synthese-zone');
  if(!zone)return;
  zone.style.display=mcmSyntheseOpen?'':'none';
  if(!mcmSyntheseOpen)return;
  zone.innerHTML='<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
  try{
    const{data,error}=await sb.from('mcm_avis_repas').select('plat,appreciation');
    if(error)throw error;
    mcmRenderSynthese(data||[]);
  }catch(err){console.warn('[MCM synthèse]',err);zone.innerHTML='<div class="empty-state"><i class="ti ti-alert-triangle"></i><p>Erreur de chargement.</p></div>';}
}
function mcmRenderSynthese(rows){
  const zone=document.getElementById('mcm-synthese-zone');
  if(!zone)return;
  const stats={};
  rows.forEach(function(r){
    const s=stats[r.plat]=stats[r.plat]||{aime:0,neutre:0,naime_pas:0};
    s[r.appreciation]=(s[r.appreciation]||0)+1;
  });
  const entries=Object.keys(stats).map(function(plat){const s=stats[plat];return{plat:plat,aime:s.aime,neutre:s.neutre,naime_pas:s.naime_pas,total:s.aime+s.neutre+s.naime_pas};});
  const aimes=entries.slice().sort(function(a,b){return b.aime-a.aime||b.total-a.total;}).filter(function(e){return e.aime>0;}).slice(0,8);
  const naimes=entries.slice().sort(function(a,b){return b.naime_pas-a.naime_pas||b.total-a.total;}).filter(function(e){return e.naime_pas>0;}).slice(0,8);
  function liste(titre,icon,arr,champ){
    if(!arr.length)return'<div style="flex:1;min-width:220px"><div style="font-weight:800;font-size:12.5px;color:var(--koala-dark);margin-bottom:6px">'+icon+' '+titre+'</div><div style="font-size:12px;color:var(--muted)">Pas encore assez de données.</div></div>';
    return'<div style="flex:1;min-width:220px"><div style="font-weight:800;font-size:12.5px;color:var(--koala-dark);margin-bottom:6px">'+icon+' '+titre+'</div><ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.9">'+arr.map(function(e){return'<li>'+escHtml(e.plat)+' <span style="color:var(--muted)">('+e[champ]+'/'+e.total+')</span></li>';}).join('')+'</ul></div>';
  }
  zone.innerHTML='<div style="border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--koala-lightest,#F7F6FC);display:flex;gap:20px;flex-wrap:wrap">'
    +liste('Plats les plus appréciés','😍',aimes,'aime')
    +liste('Plats les moins appréciés','😖',naimes,'naime_pas')
    +'</div>';
}
window.mcmToggleSynthese=mcmToggleSynthese;

// N'affiche que les commandes utiles à l'onglet courant.
function presMajBarre(){
  const jour=currentPresenceSlot==='gantt';
  document.querySelectorAll('#main-presence .pres-jour-only')
    .forEach(el=>el.classList.toggle('pres-masque',!jour));
}
function presUpdateDateWeekLabel(){
  const input=document.getElementById('presence-date'),lbl=document.getElementById('presence-date-week');
  if(!lbl)return;
  lbl.textContent=input?.value?('S'+hebdoNumSemaine(new Date(input.value+'T00:00:00'))):'';
}
async function renderPresence(){
  presUpdateDateWeekLabel();
  if(currentPresenceSlot==='hebdo'){await renderPresenceHebdo();prRenderSemaine();renderMenuSemaine();return;}
  if(currentPresenceSlot==='mois'){await renderPresenceMois();return;}
  await renderPresenceGantt();
  renderMenuJour();
}
async function setPresence(enfantId,slot,dateStr,status){
  const{data:ex}=await sb.from('presences').select('id,status').eq('enfant_id',enfantId).eq('presence_date',dateStr).eq('slot',slot).maybeSingle();
  if(ex){if(ex.status===status)await sb.from('presences').delete().eq('id',ex.id);else await sb.from('presences').update({status}).eq('id',ex.id);}
  else await sb.from('presences').insert({enfant_id:enfantId,presence_date:dateStr,slot,status});
  renderPresence();
}
// Bascule présent/absent pour la journée entière (micro-crèche : pas de distinction matin/après-midi)
async function togglePresence(enfantId,dateStr){
  const{data:rows}=await sb.from('presences').select('id,status').eq('enfant_id',enfantId).eq('presence_date',dateStr);
  const isPresent=(rows||[]).some(r=>r.status==='present'||r.status==='partial');
  if(isPresent){
    // Actuellement présent -> marquer absent : supprimer tous les créneaux du jour
    if((rows||[]).length)await sb.from('presences').delete().eq('enfant_id',enfantId).eq('presence_date',dateStr);
  }else{
    // Actuellement absent -> marquer présent sur toute la journée (créneaux M et A)
    const ids=(rows||[]).map(r=>r.id);
    if(ids.length)await sb.from('presences').delete().eq('enfant_id',enfantId).eq('presence_date',dateStr);
    /* Marquage manuel : on applique l'horaire du contrat (celui qui couvre la date,
       de préférence ce jour de la semaine) et non une journée entière — y compris
       pour un enfant qui ne vient pas d'habitude ce jour-là. Gantt : l'horaire est
       lu sur presences.heure_debut / heure_fin. Sans contrat horaire : journée entière. */
    let hd=null,hf=null;
    try{
      const{data:cts}=await sb.from('enfants_contrats').select('*').eq('enfant_id',enfantId);
      const dow=((new Date(dateStr+'T00:00:00').getDay()+6)%7)+1;
      const couvrants=(cts||[]).filter(function(c){
        return c.heure_debut&&c.heure_fin&&(!c.date_debut||c.date_debut<=dateStr)&&(!c.date_fin||c.date_fin>=dateStr);
      }).sort(function(a,b){return String(b.date_debut||'').localeCompare(String(a.date_debut||''));});
      const ct=couvrants.find(function(c){return ctParseJours(c.jours).indexOf(dow)>=0;})||couvrants[0]||null;
      if(ct){hd=String(ct.heure_debut).slice(0,5);hf=String(ct.heure_fin).slice(0,5);}
    }catch(err){console.warn('[Presence] lecture contrat',err);}
    const toMin=function(t){const m=/^(\d{1,2}):(\d{2})/.exec(t||'');return m?parseInt(m[1],10)*60+parseInt(m[2],10):null;};
    const nouv=[];
    if(hd&&hf){
      if(toMin(hd)<13*60)nouv.push({enfant_id:enfantId,presence_date:dateStr,slot:'M',status:'present',heure_debut:hd,heure_fin:hf});
      if(toMin(hf)>13*60)nouv.push({enfant_id:enfantId,presence_date:dateStr,slot:'A',status:'present',heure_debut:hd,heure_fin:hf});
    }
    if(!nouv.length){
      nouv.push({enfant_id:enfantId,presence_date:dateStr,slot:'M',status:'present'},
                {enfant_id:enfantId,presence_date:dateStr,slot:'A',status:'present'});
    }
    const{error:insErr}=await sb.from('presences').insert(nouv);
    if(insErr){showBanner('Ajout impossible : '+insErr.message,'error');}
  }
  renderPresence();
}
// ── FILTRE « présents uniquement » ──
let presOnlyPresents=(localStorage.getItem('presOnlyPresents')!=='0');
function presSyncFilterChip(){
  const c=document.getElementById('pres-filter-chip');
  if(c)c.classList.toggle('active',presOnlyPresents);
}
function presToggleFilterPresents(){
  presOnlyPresents=!presOnlyPresents;
  localStorage.setItem('presOnlyPresents',presOnlyPresents?'1':'0');
  presSyncFilterChip();
  renderPresence();
}
window.presToggleFilterPresents=presToggleFilterPresents;

/* Affiche ou masque les enfants point\u00e9s alors qu\u2019aucun contrat ne couvre la date. */
let presShowHorsContrat=false;
function presToggleHorsContrat(){ presShowHorsContrat=!presShowHorsContrat; renderPresence(); }
window.presToggleHorsContrat=presToggleHorsContrat;

/* Dates proches reellement pointees pour la creche : affichees sous l'etat vide de la
   feuille de presence. Un planning Gertrude importe sur une autre semaine (ou des enfants
   rattaches a une autre creche) se repere ainsi immediatement, au lieu d'une page vide. */
async function presAfficherDatesProches(crecheId,dateStr){
  const box=document.getElementById('pres-dates-proches');
  if(!box)return;
  const ids=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):cacheEnfants).map(e=>e.id);
  if(!ids.length)return;
  const d0=new Date(dateStr+'T00:00:00'),d1=new Date(dateStr+'T00:00:00');
  d0.setDate(d0.getDate()-120);d1.setDate(d1.getDate()+120);
  try{
    const{data,error}=await sb.from('presences').select('presence_date')
      .gte('presence_date',ipDateToLocalISO(d0)).lte('presence_date',ipDateToLocalISO(d1))
      .in('enfant_id',ids);
    if(error)throw error;
    const dates=[...new Set((data||[]).map(p=>p.presence_date))].sort();
    if(!dates.length){
      box.innerHTML='Aucune présence enregistrée pour cette crèche à quatre mois près — le planning importé ne portait pas sur cette période, ou les enfants ont été rattachés à une autre crèche.';
      return;
    }
    box.innerHTML='Présences enregistrées autour de cette date : '+dates.map(function(x){
      return '<a href="#" onclick="presGoToDate(\''+x+'\');return false;" style="color:var(--koala);font-weight:600">'
        +x.split('-').reverse().slice(0,2).join('/')+'</a>';
    }).join(' · ');
  }catch(e){console.warn('[Gantt] dates proches',e);}
}
function presGoToDate(iso){
  const i=document.getElementById('presence-date');
  if(i){i.value=iso;renderPresence();}
}
window.presGoToDate=presGoToDate;

async function renderPresenceGantt(){
  const dateStr=document.getElementById('presence-date')?.value||todayStr();
  const view=document.getElementById('presence-gantt-view');
  if(!view)return;
  const crecheId=getPresenceCrecheId();
  if(isDirection&&!crecheId){view.innerHTML='<div class="empty-state"><i class="ti ti-building"></i><p>Sélectionnez une crèche.</p></div>';return;}
  presSyncFilterChip();
  let allEnfants=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):[...cacheEnfants]).sort((a,b)=>(a.prenom||'').localeCompare((b.prenom||''),'fr',{sensitivity:'base'})||((a.nom||'').localeCompare((b.nom||''),'fr',{sensitivity:'base'})));
  if(!allEnfants.length){view.innerHTML='<div class="empty-state"><i class="ti ti-users"></i><p>Aucun enfant enregistr\u00e9.</p></div>';return;}
  // Synchro silencieuse : on garde l'ancien affichage jusqu'à ce que le nouveau soit prêt
  // (sinon la page se vide et se redessine toutes les 20 s, avec saut de défilement).
  if(!_syncSilencieuse)view.innerHTML='<div style="font-size:12px;color:var(--muted);padding:0.5rem 0">Chargement\u2026</div>';
  const{data:presData}=await sb.from('presences').select('*').eq('presence_date',dateStr).in('enfant_id',allEnfants.map(e=>e.id));
  // presMap: enfant_id -> {M, A}
  const presMap={};
  // hd/hf : amplitude horaire réelle du jour, quand elle a été lue sur le planning PDF importé.
  (presData||[]).forEach(p=>{
    if(!presMap[p.enfant_id])presMap[p.enfant_id]={};
    presMap[p.enfant_id][p.slot]=p.status;
    if(p.heure_debut&&(!presMap[p.enfant_id].hd||p.heure_debut<presMap[p.enfant_id].hd))presMap[p.enfant_id].hd=p.heure_debut;
    if(p.heure_fin&&(!presMap[p.enfant_id].hf||p.heure_fin>presMap[p.enfant_id].hf))presMap[p.enfant_id].hf=p.heure_fin;
    // Un seul créneau pointé via tablette suffit à considérer la journée « pointée ».
    if(p.source==='pointage')presMap[p.enfant_id].pointe=true;
  });
  /* Horaire RÉELLEMENT pointé (tablette/kiosque) ce jour-là, lu directement sur
     `pointages.horodatage` — la table `presences` ne porte volontairement pas ces
     heures (cf. sql/lien_pointage_presence.sql). Sert à afficher, au premier plan
     du Gantt, l'heure d'arrivée/départ réelle par-dessus l'horaire de contrat
     (laissé en arrière-plan, cf. rendu des barres plus bas). */
  const ptMap={};
  try{
    const _dNext=new Date(dateStr+'T00:00:00');_dNext.setDate(_dNext.getDate()+1);
    const dateStrNext=ipDateToLocalISO(_dNext);
    const{data:ptData,error:ptErr}=await sb.from('pointages').select('enfant_id,action,horodatage')
      .not('enfant_id','is',null).in('enfant_id',allEnfants.map(e=>e.id))
      .gte('horodatage',dateStr+'T00:00:00').lt('horodatage',dateStrNext+'T00:00:00');
    if(ptErr) throw ptErr;
    (ptData||[]).forEach(function(pt){
      const k=String(pt.enfant_id);
      if(!ptMap[k])ptMap[k]={};
      const d=new Date(pt.horodatage);
      const hhmm=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      if(pt.action==='arrivee'){
        if(!ptMap[k].debut||hhmm<ptMap[k].debut)ptMap[k].debut=hhmm;
      }else if(pt.action==='depart'){
        if(!ptMap[k].fin||hhmm>ptMap[k].fin)ptMap[k].fin=hhmm;
      }
    });
  }catch(err){ console.warn('[Gantt] lecture pointages',err); }
  /* \u2500\u2500 Contrats d\u2019accueil \u2500\u2500
     ctPeriode : contrat dont la p\u00e9riode couvre la date, quel que soit le jour
                 \u2192 d\u00e9finit QUI figure sur la feuille (inscrits en cours de contrat).
     ctMap     : contrat couvrant la date ET le jour de la semaine
                 \u2192 d\u00e9finit les horaires de la barre et le d\u00e9compte \u00ab sous contrat \u00bb.
     ctTout    : l'enfant a-t-il au moins un contrat, toutes p\u00e9riodes confondues ?

     QUI FIGURE SUR LA FEUILLE. Un enfant n'est masqu\u00e9 que s'il a des contrats
     mais qu'aucun ne couvre la date : contrat termin\u00e9 ou pas encore commenc\u00e9.
     Un enfant SANS aucun contrat reste affich\u00e9 \u2014 l'absence de contrat veut dire
     \u00ab information inconnue \u00bb, pas \u00ab non inscrit \u00bb. Sans cette nuance, un import
     partiel (une seule semaine de planning, qui ne cr\u00e9e de contrat que pour les
     enfants pr\u00e9sents cette semaine-l\u00e0) ferait dispara\u00eetre tout le reste de la
     cr\u00e8che de la feuille de pr\u00e9sence.
     Un enfant point\u00e9 ce jour-l\u00e0 est toujours affich\u00e9, contrat ou pas. */
  const _dj=new Date(dateStr+'T00:00:00').getDay();
  const jourSem=(_dj===0)?7:_dj;
  const ctMap={}, ctPeriode={}, ctTout={};
  let ctLus=0;
  try{
    const{data:ctData,error:ctErr}=await sb.from('enfants_contrats').select('*').in('enfant_id',allEnfants.map(e=>e.id));
    if(ctErr) throw ctErr;
    ctLus=(ctData||[]).length;
    (ctData||[]).forEach(function(c){
      const k=String(c.enfant_id);
      ctTout[k]=true;
      if(c.date_debut&&c.date_debut>dateStr) return;
      if(c.date_fin&&c.date_fin<dateStr) return;
      // en cas de contrats qui se chevauchent, on garde le plus r\u00e9cent
      if(!ctPeriode[k]||(c.date_debut||'')>(ctPeriode[k].date_debut||'')) ctPeriode[k]=c;
      if(ctParseJours(c.jours).indexOf(jourSem)<0) return;
      if(!ctMap[k]||(c.date_debut||'')>(ctMap[k].date_debut||'')) ctMap[k]=c;
    });
  }catch(err){ console.warn('[Gantt] lecture contrats',err); }
  const _nbSousContrat=Object.keys(ctMap).length;
  const _nbPeriode=Object.keys(ctPeriode).length;
  // Masquables = contrat(s) existants mais aucun ne couvre la date, et enfant non pointé.
  const _estMasquable=e=>{
    const k=String(e.id);
    return ctTout[k]&&!ctPeriode[k]&&!presMap[e.id];
  };
  let _nbHorsContrat=allEnfants.filter(_estMasquable).length;
  if(_nbHorsContrat&&!presShowHorsContrat){
    allEnfants=allEnfants.filter(e=>!_estMasquable(e));
  }
  // Gantt: heures 7h\u201319h, 1 colonne = 30min = 24 colonnes
  const H_START=7,H_END=19,COLS=(H_END-H_START)*2; // 24 demi-heures
  // Sur smartphone (écran étroit), les colonnes de 30 min et la colonne nom
  // sont resserrées pour réduire le défilement horizontal — les barres et
  // noms restent lisibles (le nom garde sa troncature avec « … » déjà en
  // place), juste plus compacts qu'en tablette.
  const _isPhone=window.innerWidth<=680;
  const COL_W=_isPhone?18:28; // px par demi-heure
  const NAME_W=_isPhone?96:160;
  const d=new Date(dateStr+'T00:00:00');
  const dateLabel=d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const _ferm=fermetureAt(crecheId,dateStr);
  const fermBanner=_ferm?'<div class="warn" style="background:var(--red-l,#FDE8E8);color:var(--red,#C62828);border-radius:12px;padding:9px 13px;font-size:12.5px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:7px"><i class="ti ti-door-off"></i> Crèche fermée ce jour — '+escHtml(fermetureLabel(_ferm))+'</div>':'';
  // Compter pr\u00e9sents
  const presents=allEnfants.filter(e=>{const p=presMap[e.id]||{};return p.M==='present'||p.A==='present'||p.M==='partial'||p.A==='partial';});
  const enfants=presOnlyPresents?presents:allEnfants;
  _presAbsentsDuJour=allEnfants.filter(e=>!presents.includes(e));
  if(!enfants.length){
    /* Journee vide : dire POURQUOI. Trois causes se ressemblent a l'ecran - le filtre
       "Presents uniquement" qui masque des inscrits, des contrats qui ne couvrent pas
       la date, et surtout un planning importe sur une AUTRE semaine. On affiche donc
       l'effectif de la creche, les enfants masques, et les dates proches reellement
       pointees (cliquables) plutot qu'un simple "aucun enfant present". */
    const _crecheLbl0=(cacheCreches.find(c=>c.id===crecheId)||{}).name||'';
    const _tousCreche=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):cacheEnfants);
    let _aide='';
    if(presOnlyPresents&&_tousCreche.length)
      _aide+='<div style="font-size:12px;margin-top:8px">'+_tousCreche.length+' enfant(s) inscrit(s) dans cette cr\u00e8che, aucun point\u00e9 ce jour. <a href="#" onclick="presToggleFilterPresents();return false;" style="color:var(--koala);font-weight:600">Afficher la liste compl\u00e8te</a></div>';
    if(_nbHorsContrat&&!presShowHorsContrat)
      _aide+='<div style="font-size:12px;margin-top:6px"><a href="#" onclick="presToggleHorsContrat();return false;" style="color:var(--koala);font-weight:600">Afficher '+_nbHorsContrat+' enfant(s) hors p\u00e9riode de contrat</a></div>';
    view.innerHTML=fermBanner+'<div style="font-size:13px;font-weight:600;color:var(--koala);text-transform:capitalize;margin-bottom:8px">'+escHtml(dateLabel)+(_crecheLbl0?' <span style="color:var(--muted);font-weight:500;text-transform:none">\u2014 '+escHtml(_crecheLbl0)+'</span>':'')+'</div><div class="empty-state"><i class="ti ti-user-off"></i><p>Aucun enfant pr\u00e9sent ce jour.<br><span style="font-size:12px">Utilisez <strong>Ajouter \u00e0 la journ\u00e9e</strong> en haut de la page.</span></p>'+_aide+'<div id="pres-dates-proches" style="font-size:12px;color:var(--muted);margin-top:10px"></div></div>';
    presAfficherDatesProches(crecheId,dateStr);
    return;
  }
  // Dur\u00e9e r\u00e9elle / forfait \u00ab non point\u00e9 \u00bb (js/presences-reel.js)
  const pr=await prCharger(enfants,dateStr,dateStr);
  const DUR_W=112;
  // En-t\u00eate heures
  let hdrHtml='<div style="display:flex;align-items:center;border-bottom:2px solid var(--koala);margin-bottom:4px">';
  hdrHtml+='<div style="position:sticky;left:0;z-index:3;background:#fff;width:'+(NAME_W+30)+'px;flex-shrink:0;font-size:11px;font-weight:700;color:var(--koala);padding-right:8px;text-align:right">'+presents.length+'\u00a0/\u00a0'+enfants.length+'</div>';
  for(let h=H_START;h<H_END;h++){
    hdrHtml+='<div style="width:'+(COL_W*2)+'px;flex-shrink:0;font-size:10px;font-weight:600;color:var(--muted);text-align:left;border-left:1px solid #e0dff0;padding-left:2px">'+h+'h</div>';
  }
  hdrHtml+='<div style="width:'+DUR_W+'px;flex-shrink:0;font-size:10px;font-weight:600;color:var(--muted);text-align:right;padding-right:8px">Durée réelle</div>';
  hdrHtml+='</div>';
  // Lignes enfants
  let rowsHtml='';
  const occ=new Array(COLS*2).fill(0); // enfants présents par quart d'heure

  enfants.forEach((e,idx)=>{
    const p=presMap[e.id]||{};
    const hasM=p.M==='present'||p.M==='partial';
    const hasA=p.A==='present'||p.A==='partial';
    const absent=!hasM&&!hasA;
    // Calcul segments (en demi-heures depuis H_START)
    // Matin: 7h\u201313h = cols 0\u201311, Apr\u00e8s-midi: 13h\u201319h = cols 12\u201323
    // Horaires du contrat si renseign\u00e9s, sinon retour au d\u00e9coupage matin / apr\u00e8s-midi
    const ct=ctMap[String(e.id)];
    const _col=function(t,fin){
      const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));
      if(!m) return null;
      const mn=(parseInt(m[1],10)-H_START)*60+parseInt(m[2],10);
      const v=fin?Math.ceil(mn/30):Math.floor(mn/30);
      return Math.max(0,Math.min(COLS,v));
    };
    // L'horaire réellement pointé ce jour-là (lu sur le planning PDF, colonnes presences.heure_*)
    // prime sur le contrat pour le repli « ancien style » (une seule barre).
    const srcDeb=p.hd||(ct?ct.heure_debut:null);
    const srcFin=p.hf||(ct?ct.heure_fin:null);
    const cA=_col(srcDeb,false);
    const cB=_col(srcFin,true);
    // Vert = pointé réellement (tablette/kiosque), violet = présence cochée à la main.
    const pointe=!!p.pointe;
    const barColor=pointe?'var(--green)':'var(--koala)';
    // Barres plus douces : fond pastel + fine bordure + texte foncé (le rond garde la couleur pleine).
    const _soft=pointe?{bg:'#c5ead6',bd:'#9fd6bb',tx:'#1f5c42'}:{bg:'#d6d2f5',bd:'#b9b3ec',tx:'#3a3380'};
    const _hm=function(t){const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));return m?(parseInt(m[1],10)+'h'+(m[2]==='00'?'':m[2])):'';};
    // Minutes depuis H_START (précision au quart d'heure pour l'effectif sous le Gantt)
    const _mn=function(t){const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));return m?(parseInt(m[1],10)-H_START)*60+parseInt(m[2],10):null;};
    const segments=[];
    if(cA!==null&&cB!==null&&cB>cA)segments.push({m0:_mn(srcDeb),m1:_mn(srcFin),start:cA,end:cB,color:barColor,soft:_soft,lbl:(_hm(srcDeb)&&_hm(srcFin))?[_hm(srcDeb),_hm(srcFin)]:null});
    else if(hasM&&hasA)segments.push({start:0,end:COLS,color:barColor,soft:_soft});
    else if(hasM)segments.push({start:0,end:12,color:barColor,soft:_soft});
    else if(hasA)segments.push({start:12,end:COLS,color:barColor,soft:_soft});
    /* Quand un pointage réel (tablette) existe pour ce jour, on affiche DEUX barres :
       - au premier plan, l'horaire réellement pointé (pointages.horodatage) ;
       - en arrière-plan (plus fine, teintée), l'horaire du contrat, pour comparer
         d'un coup d'œil l'heure d'arrivée/départ réelle à l'horaire prévu. */
    const pt=ptMap[String(e.id)];
    const pointeReel=pointe&&!!(pt&&pt.debut);
    const bgCtSegments=[];
    if(pointeReel){
      const ctA=_col(ct?ct.heure_debut:null,false);
      const ctB=_col(ct?ct.heure_fin:null,true);
      if(ctA!==null&&ctB!==null&&ctB>ctA)bgCtSegments.push({start:ctA,end:ctB});
      const ptA=_col(pt.debut,false);
      const enCours=!pt.fin;
      const ptBcol=pt.fin?_col(pt.fin,true):(dateStr===todayStr()?(function(){const now=new Date();const mn=(now.getHours()-H_START)*60+now.getMinutes();return Math.max(0,Math.min(COLS,Math.round(mn/30)));})():COLS);
      segments.length=0; // le pointage réel remplace le repli « ancien style »
      if(ptA!==null&&ptBcol>ptA)segments.push({m0:_mn(pt.debut),m1:pt.fin?_mn(pt.fin):null,start:ptA,end:ptBcol,color:'var(--green)',ouvert:enCours,soft:{bg:'#c5ead6',bd:'#9fd6bb',tx:'#1f5c42'},lbl:[_hm(pt.debut),pt.fin?_hm(pt.fin):'en cours']});
    }
    /* Forfait : une barre « non pointé » orange remplace la barre cochée à la main
       (le contrat en fond garde l'horaire prévu) ; un départ oublié colore la barre pointée. */
    const rr=pr.calc.get(e.id+'|'+dateStr);
    const _orange={bg:'#fbd9bd',bd:'#f3bb8f',tx:'#7a3d0c'};
    if(rr&&(rr.statut==='non_pointe'||rr.statut==='absence_carence')&&!absent){
      const oA=cA!==null?cA:0,oB=(cB!==null&&cB>oA)?cB:COLS;
      segments.length=0;
      segments.push({m0:cA!==null?_mn(srcDeb):null,m1:(cB!==null&&cB>oA)?_mn(srcFin):null,start:oA,end:oB,color:'var(--orange)',soft:_orange,lbl:['Non pointé','forfait']});
    }else if(rr&&rr.statut==='depart_manquant'&&segments.length){
      segments.forEach(function(sg){sg.soft=_orange;sg.ouvert=false;sg.lbl=[_hm(pt&&pt.debut),'départ oublié'];});
    }
    if(!absent)segments.forEach(function(sg){
      const a0=(sg.m0!=null)?sg.m0:sg.start*30,a1=(sg.m1!=null)?sg.m1:sg.end*30;
      for(let q=0;q<occ.length;q++){if(a0<(q+1)*15&&a1>q*15)occ[q]++;}
    });
    const horsJour=!ctMap[String(e.id)];
    // Une ligne « hors contrat » se voit sans avoir à chercher : fond teinté,
    // pas juste un petit repère à côté du prénom (trop discret dans un groupe).
    const bg=horsJour?'var(--orange-light)':(idx%2===0?'#fff':'#f7f6fb');
    rowsHtml+='<div style="display:flex;align-items:center;padding:3px 0;background:'+bg+';border-radius:4px'+(horsJour?';box-shadow:inset 3px 0 0 var(--orange)':'')+'">';
    // Bouton + nom regroupés dans un bloc "sticky" : sur un écran étroit (tablette/
    // Android en portrait), on doit faire défiler horizontalement pour voir les
    // heures, mais on ne doit jamais perdre de vue à quel enfant correspond la ligne.
    rowsHtml+='<div style="position:sticky;left:0;z-index:2;display:flex;align-items:center;background:'+bg+'">';
    rowsHtml+='<button onclick="togglePresence(\''+e.id+'\',\''+dateStr+'\')" title="'+(absent?'Marquer présent':'Marquer absent')+'" style="flex-shrink:0;width:24px;height:24px;margin-right:6px;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;background:'+(absent?'#f0eef8':barColor)+';color:'+(absent?'var(--muted)':'#fff')+'"><i class="ti ti-'+(absent?'user-x':pointe?'device-tablet':'user-check')+'"></i></button>';
    rowsHtml+='<div onclick="enfOpenFiche(\''+e.id+'\')" style="width:'+NAME_W+'px;flex-shrink:0;font-size:12px;font-weight:'+(absent?'400':'600')+';color:'+(absent?'var(--muted)':'var(--koala)')+';padding-right:8px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" title="Ouvrir le dossier de '+escHtml(e.prenom+' '+e.nom)+(e.dob?'':' (date de naissance manquante)')+'">'+escHtml(e.prenom+' '+e.nom)+(horsJour?' <span style="display:inline-flex;align-items:center;gap:2px;background:var(--orange);color:#fff;font-size:9.5px;font-weight:800;border-radius:8px;padding:1.5px 6px;margin-left:4px;vertical-align:middle" title="Aucun contrat ce jour de la semaine"><i class="ti ti-alert-triangle" style="font-size:10px"></i> Hors contrat</span>':'')+(e.dob?'':' <span style=\"color:var(--red);font-size:10px\">⚠</span>')+'</div>';
    rowsHtml+='</div>';
    // Barre Gantt
    rowsHtml+='<div style="position:relative;width:'+(COLS*COL_W)+'px;flex-shrink:0;height:44px;border-left:1px solid #e0dff0">';
    // Lignes verticales des heures
    for(let c=0;c<COLS;c+=2){
      rowsHtml+='<div style="position:absolute;left:'+(c*COL_W)+'px;top:0;bottom:0;border-left:1px solid '+(c===0?'transparent':'#ece9f5')+';pointer-events:none"></div>';
    }
    // Bande 12h (s\u00e9parateur matin/apm)
    rowsHtml+='<div style="position:absolute;left:'+(12*COL_W)+'px;top:0;bottom:0;border-left:1px dashed #b0a8d8;pointer-events:none"></div>';
    if(absent){
      rowsHtml+='<div style="position:absolute;left:4px;right:4px;top:17px;height:10px;background:#f0eef8;border-radius:5px"></div>';
    }else{
      // Arrière-plan : horaire de contrat, seulement quand une barre de pointage réel est affichée par-dessus.
      bgCtSegments.forEach(seg=>{
        const left=seg.start*COL_W;const width=(seg.end-seg.start)*COL_W-2;
        rowsHtml+='<div title="Horaire de contrat : '+escHtml((ct&&ct.heure_debut)||'')+'–'+escHtml((ct&&ct.heure_fin)||'')+'" style="position:absolute;left:'+left+'px;width:'+width+'px;top:12px;height:20px;background:#e8e6ef;border:1px solid #d3d0e0;border-radius:7px"></div>';
      });
      segments.forEach(seg=>{
        const left=seg.start*COL_W;const width=(seg.end-seg.start)*COL_W-2;
        // Horaires écrits dans la barre seulement si elle est assez large (sinon ils se chevauchent).
        const _lbl=(seg.lbl&&width>=110)?'<span>'+seg.lbl[0]+'</span><span style="font-weight:400;opacity:.85">'+seg.lbl[1]+'</span>':(pointe?'<i class="ti ti-device-tablet" style="font-size:13px"></i>':'');
        rowsHtml+='<div title="'+(pointeReel?'Pointé : '+escHtml(pt.debut||'')+(pt.fin?'–'+escHtml(pt.fin):' (en cours)'):(seg.lbl?escHtml(seg.lbl[0]+' – '+seg.lbl[1]):''))+'" style="position:absolute;left:'+left+'px;width:'+width+'px;top:6px;height:32px;box-sizing:border-box;background:'+seg.soft.bg+';border:1px solid '+seg.soft.bd+';color:'+seg.soft.tx+';border-radius:9px;display:flex;align-items:center;justify-content:space-between;padding:0 9px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden'+(seg.ouvert?';border-right:2px dashed '+seg.soft.tx:'')+'">'+_lbl+'</div>';
      });
    }
    rowsHtml+='</div>';
    rowsHtml+='<div style="width:'+DUR_W+'px;flex-shrink:0;text-align:right;padding-right:8px;font-size:12px;font-variant-numeric:tabular-nums;line-height:1.25">'+prCelluleGantt(rr,e.id,dateStr)+'</div>';
    rowsHtml+='</div>';
  });
  // Effectif présent par demi-heure, sous le Gantt (lecture des arrivées / départs échelonnés)
  const _occMax=Math.max.apply(null,occ.concat([1]));
  rowsHtml+='<div style="display:flex;align-items:center;padding:4px 0;border-top:2px solid var(--koala);margin-top:4px">';
  rowsHtml+='<div style="position:sticky;left:0;z-index:2;background:#fff;width:'+(NAME_W+30)+'px;flex-shrink:0;font-size:11px;font-weight:700;color:var(--koala);padding-right:8px;text-align:right;box-sizing:border-box">Enfants pr\u00e9sents</div>';
  rowsHtml+='<div style="display:flex;width:'+(COLS*COL_W)+'px;flex-shrink:0;border-left:1px solid #e0dff0">';
  occ.forEach(function(n,q){
    const a=n?(0.12+0.5*n/_occMax):0;
    const _mm=q*15;
    rowsHtml+='<div title="'+n+' enfant(s) de '+(H_START+Math.floor(_mm/60))+'h'+String(_mm%60).padStart(2,'0')+' \u00e0 '+(H_START+Math.floor((_mm+15)/60))+'h'+String((_mm+15)%60).padStart(2,'0')+'" style="width:'+(COL_W/2)+'px;flex-shrink:0;box-sizing:border-box;text-align:center;font-size:'+(COL_W<24?8:10)+'px;font-weight:700;line-height:24px;color:'+(n?'#3a3380':'#c9c5e0')+';background:rgba(107,92,200,'+a.toFixed(2)+')">'+n+'</div>';
  });
  rowsHtml+='</div><div style="width:'+DUR_W+'px;flex-shrink:0"></div></div>';
  // Professionnelles présentes par quart d'heure (planning équipe de la crèche, jour courant)
  if(crecheId&&jourSem<=5){
    const occPro=new Array(COLS*2).fill(0);
    const proSeule=new Array(COLS*2).fill(false); // true si la seule pro présente peut rester seule avec 3 enfants
    const _isQualif=function(prenom){
      const t=ipNormStr(prenom);
      let emp=(cacheEmployes||[]).find(function(x){return x.creche_id===crecheId&&ipNormStr(x.planning_nom||x.prenom)===t;});
      if(!emp){const rid=peFindReferentIdForPrenom(crecheId,prenom,true);const rf=rid?(cacheReferents||[]).find(function(x){return x.id===rid;}):null;if(rf&&rf.employe_id)emp=(cacheEmployes||[]).find(function(x){return x.id===rf.employe_id;});}
      if(!emp)return false;
      const q=ipNormStr((emp.qualification||'')+' '+(emp.poste||''));
      // EJE et psychomotricien(ne) : seuls d\u00e8s le dipl\u00f4me ; auxiliaire de pu\u00e9riculture : 3 ans d'exp\u00e9rience requis
      if(/(^|[^a-z])eje([^a-z]|$)|educateur.*jeunes? enfants?|psychomot/.test(q))return true;
      return /auxiliaire.*puericultur/.test(q)&&Number(emp.experience_annees)>=3;
    };
    let _pros=[];
    try{_pros=await peLoad(crecheId,mondayOfISO(dateStr));}catch(err){console.warn('[Gantt] planning équipe',err);}
    _pros.filter(function(r){return r.jour===jourSem-1&&r.type==='presence';}).forEach(function(r){
      let segs=peCreneauSegments(r.creneau_label);
      if(!segs){
        const hm=function(t){const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));return m?parseInt(m[1],10)*60+parseInt(m[2],10):null;};
        const d0=hm(r.hdebut),d1=hm(r.hfin);
        if(d0===null||d1===null||d1<=d0)return;
        const pz=String(r.pause||'').split('-'),p0=hm(pz[0]),p1=hm(pz[1]);
        segs=(p0!==null&&p1!==null&&p0>d0&&p1<d1&&p1>p0)?[[d0,p0],[p1,d1]]:[[d0,d1]];
      }
      const qual=_isQualif(r.prenom);
      segs.forEach(function(sg){
        const a0=sg[0]-H_START*60,a1=sg[1]-H_START*60;
        for(let q=0;q<occPro.length;q++){if(a0<(q+1)*15&&a1>q*15){occPro[q]++;proSeule[q]=qual;}}
      });
    });
    const _proMax=Math.max.apply(null,occPro.concat([1]));
    rowsHtml+='<div style="display:flex;align-items:center;padding:4px 0">';
    rowsHtml+='<div style="position:sticky;left:0;z-index:2;background:#fff;width:'+(NAME_W+30)+'px;flex-shrink:0;font-size:11px;font-weight:700;color:#0F6B5E;padding-right:8px;text-align:right;box-sizing:border-box">Professionnelles</div>';
    rowsHtml+='<div style="display:flex;width:'+(COLS*COL_W)+'px;flex-shrink:0;border-left:1px solid #e0dff0">';
    occPro.forEach(function(n,q){
      const al=n?(0.12+0.5*n/_proMax):0;
      const _mm=q*15;
      rowsHtml+='<div title="'+n+' professionnelle(s) de '+(H_START+Math.floor(_mm/60))+'h'+String(_mm%60).padStart(2,'0')+' \u00e0 '+(H_START+Math.floor((_mm+15)/60))+'h'+String((_mm+15)%60).padStart(2,'0')+'" style="width:'+(COL_W/2)+'px;flex-shrink:0;box-sizing:border-box;text-align:center;font-size:'+(COL_W<24?8:10)+'px;font-weight:700;line-height:24px;color:'+(n?'#0F6B5E':'#c5ddd8')+';background:rgba(15,107,94,'+al.toFixed(2)+')">'+n+'</div>';
    });
    rowsHtml+='</div><div style="width:'+DUR_W+'px;flex-shrink:0"></div></div>';
    // Taux d'encadrement : enfants présents / professionnelles présentes, par quart d'heure
    rowsHtml+='<div style="display:flex;align-items:center;padding:4px 0">';
    rowsHtml+='<div style="position:sticky;left:0;z-index:2;background:#fff;width:'+(NAME_W+30)+'px;flex-shrink:0;font-size:11px;font-weight:700;color:var(--ink2,#5b5775);padding-right:8px;text-align:right;box-sizing:border-box" title="Nombre d\u2019enfants pr\u00e9sents par professionnelle pr\u00e9sente">Enfants / pro</div>';
    rowsHtml+='<div style="display:flex;width:'+(COLS*COL_W)+'px;flex-shrink:0;border-left:1px solid #e0dff0">';
    occ.forEach(function(nE,q){
      const nP=occPro[q];
      let txt='',col='#3a3380',bg='transparent',tip='Aucun enfant';
      /* Règles d'encadrement : 6 enfants maximum par professionnelle ; le matin (avant 9h) et le soir
         (à partir de 17h), 2 professionnelles dès le premier enfant — sauf une seule professionnelle
         EJE / psychomotricienne, ou auxiliaire de puériculture avec 3 ans d'expérience, pour 3 enfants maximum. */
      const _deb=H_START*60+q*15;
      const _bord=_deb<9*60||_deb>=17*60;
      const _seuleOk=nP===1&&proSeule[q]&&nE<=3;
      const _min=Math.max(Math.ceil(nE/6),(_bord&&!_seuleOk)?2:1);
      if(nE>0&&nP===0){txt='!';col='#fff';bg='var(--red,#C62828)';tip=nE+' enfant(s) sans professionnelle';}
      else if(nE>0){
        const r=nE/nP;
        const rs=(Math.round(r*10)/10).toString().replace('.',',');
        txt=_isPhone?String(Math.round(r)):rs;
        tip=nE+' enfant(s) pour '+nP+' professionnelle(s) = '+rs+' par pro';
        if(nP<_min){
          bg='#fbd9bd';col='#7a3d0c';
          tip+=' \u2014 il faut au moins '+_min+' professionnelle(s)'+((_bord&&r<=6)?' (2 d\u00e8s le premier enfant le matin et le soir)':' (6 enfants maximum par professionnelle)');
        }else if(_bord&&nP===1)tip+=' \u2014 autoris\u00e9 : professionnelle qualifi\u00e9e (EJE, psychomotricien(ne), ou aux. de pu\u00e9riculture avec 3 ans d\u2019exp\u00e9rience) avec 3 enfants maximum';
      }
      rowsHtml+='<div title="'+tip+'" style="width:'+(COL_W/2)+'px;flex-shrink:0;box-sizing:border-box;text-align:center;overflow:hidden;white-space:nowrap;letter-spacing:-.4px;font-size:'+(COL_W<24?8:9)+'px;font-weight:700;line-height:24px;color:'+col+';background:'+bg+'">'+txt+'</div>';
    });
    rowsHtml+='</div><div style="width:'+DUR_W+'px;flex-shrink:0"></div></div>';
  }
  // Ligne de d\u00e9marcation 12h (l\u00e9gende)
  let legendHtml='<div style="display:flex;align-items:center;gap:16px;margin-top:10px;font-size:11px;color:var(--muted);flex-wrap:wrap">';
  legendHtml+='<span><i class="ti ti-user-check" style="color:var(--koala);vertical-align:middle;margin-right:2px"></i>Cliquez le rond pour '+(presOnlyPresents?'retirer l\u2019enfant de la journ\u00e9e':'basculer pr\u00e9sent / absent')+'</span>';
  legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px"><span style="display:inline-block;width:10px;height:10px;background:#c5ead6;border:1px solid #9fd6bb;border-radius:3px;vertical-align:middle;margin-right:4px"></span>Point\u00e9 sur tablette <span style="display:inline-block;width:10px;height:10px;background:#d6d2f5;border:1px solid #b9b3ec;border-radius:3px;vertical-align:middle;margin:0 4px 0 8px"></span>Pr\u00e9sence coch\u00e9e manuellement</span>';
  legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px"><span style="display:inline-block;width:10px;height:8px;background:#e8e6ef;border:1px solid #d3d0e0;border-radius:3px;vertical-align:middle;margin-right:3px"></span>Horaire de contrat (fond) sous l\u2019horaire r\u00e9ellement point\u00e9</span>';
  legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px"><span style="display:inline-block;width:8px;height:8px;background:var(--orange);border-radius:2px;vertical-align:middle;margin-right:3px"></span>Hors jour de contrat</span>';
  legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px"><span style="display:inline-block;width:10px;height:10px;background:#fbd9bd;border:1px solid #f3bb8f;border-radius:3px;vertical-align:middle;margin-right:4px"></span>Encadrement insuffisant : 6 enfants max par pro, 2 pros d\u00e8s le 1er enfant avant 9h et apr\u00e8s 17h (sauf EJE, psychomotricien(ne), ou aux. de pu\u00e9riculture avec 3 ans d\u2019exp\u00e9rience : seul(e) avec 3 enfants max)</span>';
  legendHtml+='<span style="border-left:1px dashed #b0a8d8;padding-left:8px">Trait pointill\u00e9 = 13h (pause m\u00e9ridienne)</span>';
  if(_nbPeriode) legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px">'+_nbSousContrat+' enfant(s) sous contrat le '+((CT_JOURS.find(x=>x[0]===jourSem)||[jourSem,'ce jour'])[1].toLowerCase())+' \u00b7 '+_nbPeriode+' inscrit(s) en cours de contrat</span>';
  else if(ctLus) legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px;color:var(--orange)">Aucun contrat en cours \u00e0 cette date \u2014 liste compl\u00e8te affich\u00e9e</span>';
  const _nbSansContrat=allEnfants.filter(e=>!ctTout[String(e.id)]).length;
  if(_nbPeriode&&_nbSansContrat) legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px">'+_nbSansContrat+' enfant(s) sans contrat enregistr\u00e9 \u2014 affich\u00e9(s) malgr\u00e9 tout</span>';
  if(_nbHorsContrat) legendHtml+='<span style="border-left:1px solid var(--border);padding-left:8px"><a href="#" onclick="presToggleHorsContrat();return false;" style="color:var(--koala);font-weight:600">'+(presShowHorsContrat?'Masquer':'Afficher')+' '+_nbHorsContrat+' enfant(s) hors p\u00e9riode de contrat</a></span>';
  legendHtml+='</div>';
  const crecheLbl=(cacheCreches.find(c=>c.id===crecheId)||{}).name||'';
  const dateTitle='<div style="font-size:13px;font-weight:600;color:var(--koala);text-transform:capitalize;margin-bottom:8px">'+escHtml(dateLabel)+(crecheLbl?' <span style="color:var(--muted);font-weight:500;text-transform:none">\u2014 '+escHtml(crecheLbl)+'</span>':'')+'</div>';
  const _scrollX=(view.querySelector('[data-gantt-scroll]')||{}).scrollLeft||0;
  view.innerHTML=fermBanner+dateTitle+'<div data-gantt-scroll style="overflow-x:auto"><div style="min-width:'+(NAME_W+30+COLS*COL_W+20+DUR_W)+'px">'+hdrHtml+rowsHtml+'</div></div>'+legendHtml;
  if(_scrollX){const _sc=view.querySelector('[data-gantt-scroll]');if(_sc)_sc.scrollLeft=_scrollX;}
}
