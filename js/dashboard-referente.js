// ── ENVOI DU PLANNING ÉQUIPE PAR MAIL ────────────────────────────────────
let _peMailData=null;

async function peOpenMail(){
  const d=await peBuildPrintHTML();
  if(!d)return;
  _peMailData=d;
  document.getElementById('pe-mail-sub').textContent=d.subtitle;
  document.getElementById('pe-mail-to').value='';
  document.getElementById('pe-mail-msg').value='Bonjour,\n\nVeuillez trouver ci-joint le planning de la semaine du '+d.dateDebut+' pour la crèche '+d.crecheName+'.\n\nBonne réception,\nKoala Kids';
  const btn=document.getElementById('pe-mail-send');
  btn.disabled=false;btn.innerHTML='<i class="ti ti-send"></i> Envoyer';
  document.getElementById('modal-pe-mail-wrap').classList.add('open');
}
window.peOpenMail=peOpenMail;

async function peBuildPdfBase64(d){
  const html='<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>'+
    '*{margin:0;padding:0;box-sizing:border-box}'+
    'body{font-family:Arial,sans-serif;color:#111;padding:24px;width:800px;background:#fff}'+
    'h1{font-size:1.5rem;font-weight:bold;margin-bottom:.2rem;color:#3D3580}'+
    '.sub{font-size:.85rem;color:#666;margin-bottom:1rem}'+
    'table{width:100%;border-collapse:collapse;margin-top:.5rem}'+
    'thead tr{background:#3D3580;color:#fff}'+
    'th{padding:8px 10px;font-size:11px;text-align:left}'+
    'td{padding:8px 10px;border-bottom:1px solid #E7E5E0;font-size:11px;vertical-align:top}'+
    'tr:nth-child(even) td{background:#F9F9F8}'+
    '.footer{margin-top:1.5rem;font-size:10px;color:#888;border-top:1px solid #E7E5E0;padding-top:10px}'+
    '</style></head><body><h1>Planning équipe</h1><div class="sub">'+d.subtitle+'</div>'+d.bodyHTML+
    '<div class="footer">Document généré le '+new Date().toLocaleDateString('fr-FR')+' — Koala Kids</div></body></html>';

  const old=document.getElementById('_pdf-frame-planning');
  if(old)old.remove();
  const iframe=document.createElement('iframe');
  iframe.id='_pdf-frame-planning';
  iframe.style.cssText='position:fixed;top:0;left:-10000px;width:850px;height:1200px;border:none;background:#fff';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument;
  doc.open();doc.write(html);doc.close();
  await new Promise(r=>setTimeout(r,500));

  const canvas=await html2canvas(doc.body,{scale:2,backgroundColor:'#ffffff',windowWidth:850});
  iframe.remove();

  const{jsPDF}=window.jspdf;
  const pdf=new jsPDF('p','mm','a4');
  const pw=210,ph=297,margin=8;
  const iw=pw-margin*2;
  const ih=canvas.height*iw/canvas.width;
  const img=canvas.toDataURL('image/jpeg',0.92);
  const usable=ph-margin*2;
  let left=ih,pos=margin;
  pdf.addImage(img,'JPEG',margin,pos,iw,ih);
  left-=usable;
  while(left>0){
    pos=margin-(ih-left);
    pdf.addPage();
    pdf.addImage(img,'JPEG',margin,pos,iw,ih);
    left-=usable;
  }
  return pdf.output('datauristring').split(',')[1];
}

async function peSendMail(){
  if(!_peMailData)return;
  const raw=document.getElementById('pe-mail-to').value.trim();
  const to=raw.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
  if(!to.length){alert('Saisissez au moins une adresse mail.');return;}
  const bad=to.filter(x=>!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if(bad.length){alert('Adresse(s) invalide(s) :\n'+bad.join('\n'));return;}

  const btn=document.getElementById('pe-mail-send');
  btn.disabled=true;btn.innerHTML='Génération du PDF…';
  try{
    const b64=await peBuildPdfBase64(_peMailData);
    btn.innerHTML='Envoi en cours…';
    const ok=await callFn('send-planning',{
      to:to,
      subject:'Planning équipe — '+_peMailData.crecheName+' — semaine du '+_peMailData.dateDebut,
      message:document.getElementById('pe-mail-msg').value,
      filename:'planning-'+_peMailData.crecheName.replace(/[^a-zA-Z0-9]/g,'-')+'-'+_peMailData.dateDebut.replace(/\//g,'-')+'.pdf',
      pdf_base64:b64
    });
    if(ok){
      closeModal('modal-pe-mail-wrap');_peMailData=null;
      showBanner('Planning envoyé à '+to.length+' destinataire'+(to.length>1?'s':'')+' ✅');
    }else{
      showBanner("Échec de l'envoi du mail.",'error');
      btn.disabled=false;btn.innerHTML='<i class="ti ti-send"></i> Envoyer';
    }
  }catch(err){
    console.error('[peSendMail]',err);
    showBanner('Erreur lors de la génération du PDF.','error');
    btn.disabled=false;btn.innerHTML='<i class="ti ti-send"></i> Envoyer';
  }
}
window.peSendMail=peSendMail;

// ── DASHBOARD RÉFÉRENTE ──────────────────────────────────────────────────
let refDashSelectedDate=null;
function refDashChangeDay(delta){const d=new Date(refDashSelectedDate||todayStr());d.setDate(d.getDate()+delta);refDashSelectedDate=ipDateToLocalISO(d);renderRefDashboard();}
function refDashGoToday(){refDashSelectedDate=todayStr();renderRefDashboard();}
function refDashSetDate(v){if(v){refDashSelectedDate=v;renderRefDashboard();}}

/* Vaccinations en retard et dossiers famille à relancer, scopés à la crèche
   de la référente — mêmes fonctions que celles utilisées par « Ma journée »
   et le tableau de bord réseau (cf. vaccinationsEnRetard/dossiersFamilleARelancer
   plus bas dans le fichier), pour ne pas réécrire le calcul une troisième
   fois. Pas de notion de réseau ici : la crèche est implicite, donc pas de
   brSuffixeCreche à reprendre. */
async function loadRefDashAlertesExtra(crecheId,urgentesHtml){
  try{
    const[vacc,dossiers]=await Promise.all([
      vaccinationsEnRetard(crecheId).catch(e=>{console.warn('[RefDash] vaccinations',e);return[];}),
      dossiersFamilleARelancer(crecheId).catch(e=>{console.warn('[RefDash] dossiers familles',e);return[];})
    ]);
    const box=document.getElementById('ref-dash-alerts');if(!box)return;
    let html=urgentesHtml;
    if(vacc.length)html+='<div class="alert-item warning" style="cursor:pointer" onclick="showMain(\'vaccinations\')"><i class="ti ti-vaccine" style="font-size:16px;flex-shrink:0"></i> <strong>'+vacc.length+' vaccination(s) en retard</strong></div>';
    if(dossiers.length)html+='<div class="alert-item warning"><i class="ti ti-mail-forward" style="font-size:16px;flex-shrink:0"></i> <strong>'+dossiers.length+' dossier(s) famille</strong> à relancer</div>';
    box.innerHTML=html;
  }catch(e){console.warn('[RefDash] alertes',e);}
}

function renderRefDashboard(){
  if(isDirection)return;
  const crecheId=currentProfile?.creche_id;
  const t=refDashSelectedDate||(refDashSelectedDate=todayStr());
  const isToday=t===todayStr();

  // Barre de date
  const dateInput=document.getElementById('ref-dash-date-input');
  if(dateInput)dateInput.value=t;
  const lbl=document.getElementById('ref-dash-label');
  if(lbl)lbl.textContent=new Date(t+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'})+(isToday?' — Aujourd\'hui':'');

  // Alertes : demandes urgentes non traitées qui me concernent
  const urgentes=cacheDemandes.filter(d=>d.creche_id===crecheId&&d.priority==='urgent'&&d.status==='attente');
  if(typeof adRenderRefDashBloc==='function'){try{adRenderRefDashBloc();}catch(e){}}
  const urgentesHtml=urgentes.length
    ?urgentes.map(d=>'<div class="alert-item" style="cursor:pointer" onclick="showMain(\'demands\')"><i class="ti ti-alert-triangle" style="font-size:16px;flex-shrink:0"></i> <strong>Demande urgente</strong> — '+escHtml(d.subject||'—')+'</div>').join('')
    :'';
  const alerts=document.getElementById('ref-dash-alerts');
  if(alerts)alerts.innerHTML=urgentesHtml;
  // Vaccinations en retard et dossiers famille à relancer : indépendantes de
  // la date consultée plus bas, chargées à part et ajoutées après coup (même
  // motif que le tableau de bord réseau) pour ne pas retarder le reste de
  // l'écran. Remplace tout le contenu (pas de +=) pour rester correct quand
  // la référente navigue vite d'un jour à l'autre et relance l'appel.
  loadRefDashAlertesExtra(crecheId,urgentesHtml);

  // ── Carte 1 : Événements du jour (scopés crèche + réseau)
  const evts=cacheEvenements.filter(e=>{
    const s=e.date_debut,f=e.date_fin||e.date_debut;
    return s&&t>=s&&t<=f&&(e.creche_id===crecheId||!e.creche_id);
  }).sort((a,b)=>(a.heure_debut||'').localeCompare(b.heure_debut||''));
  const evtsHtml=evts.length?evts.map(e=>{
    const info=CAL_TYPE_INFO[e.type]||CAL_TYPE_INFO.autre;
    const h=e.heure_debut?e.heure_debut+(e.heure_fin?'–'+e.heure_fin:''):'';
    return'<div class="dash-list-item"><span>'+info.emoji+' '+escHtml(e.titre)+'</span><span style="font-weight:700;color:var(--koala);font-size:11px;white-space:nowrap">'+h+'</span></div>';
  }).join(''):'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucun événement</div>';

  // ── Carte 2 : Demandes en attente me concernant
  const demandesAttenteRaw=cacheDemandes.filter(d=>d.creche_id===crecheId&&d.status==='attente');
  const demandesHtml=demandesAttenteRaw.length?demandesAttenteRaw.slice(0,8).map(d=>{
    const age=Math.floor((new Date()-new Date(d.created_at))/(1000*86400));
    return'<div class="dash-list-item" style="cursor:pointer" onclick="showMain(\'demands\')"><span>'+(d.priority==='urgent'?'🔴':'⏳')+' '+escHtml(d.subject||d.theme||'Demande')+'</span><span style="font-size:11px;font-weight:700;color:'+(d.priority==='urgent'?'var(--red)':'var(--muted)')+'">'+age+' j</span></div>';
  }).join('')+(demandesAttenteRaw.length>8?'<div style="font-size:11px;color:var(--muted);text-align:center;padding:4px">+ '+(demandesAttenteRaw.length-8)+' autres</div>':'')
  :'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">✅ Aucune demande en attente</div>';

  // ── Carte 3 : Anniversaires enfants de la crèche
  const md=t.slice(5);
  const bdays=cacheEnfants.filter(e=>e.creche_id===crecheId&&e.dob&&e.dob.slice(5)===md);
  const bdaysHtml=bdays.length?bdays.map(e=>{
    const age=Number(t.slice(0,4))-Number(e.dob.slice(0,4));
    return'<div class="dash-list-item"><span>🎂 '+escHtml((e.prenom||'')+' '+(e.nom||'').trim())+'</span><span style="font-weight:700;color:var(--koala);font-size:11px">'+age+' an'+(age>1?'s':'')+'</span></div>';
  }).join(''):'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucun anniversaire</div>';

  document.getElementById('ref-dash-grid').innerHTML=
    '<div class="dash-card"><div class="dash-card-title"><i class="ti ti-calendar-event"></i> Événements du jour</div>'+evtsHtml+'</div>'+
    '<div class="dash-card"><div class="dash-card-title"><i class="ti ti-message-circle"></i> Demandes en attente <span style="background:#eee;color:#555;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">'+demandesAttenteRaw.length+'</span></div>'+demandesHtml+'</div>'+
    '<div class="dash-card"><div class="dash-card-title"><i class="ti ti-cake"></i> Anniversaires</div>'+bdaysHtml+'</div>';

  // Cartes async (présences enfants, planning équipe, remplaçantes) chargées après
  document.getElementById('ref-dash-async-grid').innerHTML=
    '<div class="dash-card" id="rdb-presences"><div class="dash-card-title"><i class="ti ti-users-group"></i> Présences du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>'+
    '<div class="dash-card" id="rdb-equipe"><div class="dash-card-title"><i class="ti ti-calendar-week"></i> Planning équipe du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>'+
    '<div class="dash-card" id="rdb-remplacantes"><div class="dash-card-title"><i class="ti ti-user-plus"></i> Remplaçantes du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>';

  loadRefDashAsync(crecheId,t);
}

async function loadRefDashAsync(crecheId,t){
  const titlePresences='<div class="dash-card-title"><i class="ti ti-users-group"></i> Présences du jour</div>';
  const titleEquipe='<div class="dash-card-title"><i class="ti ti-calendar-week"></i> Planning équipe du jour</div>';
  const titleRmp='<div class="dash-card-title"><i class="ti ti-user-plus"></i> Remplaçantes du jour</div>';
  const empty=msg=>'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">'+msg+'</div>';

  // Présences enfants — filtrage via enfants (presences n'a pas creche_id)
  try{
    let allEnf=cacheEnfants.filter(e=>e.creche_id===crecheId);
    if(!allEnf.length){const{data:fresh}=await sb.from('enfants').select('*').eq('creche_id',crecheId);allEnf=fresh||[];}
    const enfCreche=allEnf;
    const box=document.getElementById('rdb-presences');if(!box)return;
    if(!enfCreche.length){box.innerHTML=titlePresences+empty('Aucun enfant enregistré');return;}
    const ids=enfCreche.map(e=>e.id);
    const{data:pres}=await sb.from('presences').select('enfant_id,slot,status').eq('presence_date',t).in('enfant_id',ids).eq('status','present');
    if(!pres||!pres.length){box.innerHTML=titlePresences+empty('Aucune présence enregistrée');
    }else{
      const allIds=[...new Set(pres.map(p=>p.enfant_id))];
      const enfMap=Object.fromEntries(enfCreche.map(e=>[e.id,e]));
      const noms=allIds.map(id=>{const e=enfMap[id];return e?e.prenom+' '+e.nom:'—';}).sort((a,b)=>a.localeCompare(b,'fr'));
      box.innerHTML=titlePresences+
        '<div style="font-size:12px;font-weight:600;color:var(--koala);margin-bottom:6px;padding:0 4px">'+allIds.length+' enfant'+(allIds.length>1?'s':'')+'</div>'+
        '<div style="font-size:12px;color:var(--text);padding:0 4px;line-height:1.8">'+noms.join(', ')+'</div>';
    }
  }catch(e){const b=document.getElementById('rdb-presences');if(b)b.innerHTML=titlePresences+empty('Indisponible');}

  // Planning équipe
  try{
    const ws=mondayOfISO(t);
    // On cherche les lignes de planning_equipe pour cette crèche et cette semaine (lundi de la semaine)
    const{data:rows}=await sb.from('planning_equipe').select('*').eq('creche_id',crecheId).eq('semaine',ws);
    const box=document.getElementById('rdb-equipe');if(!box)return;
    if(!rows||!rows.length){box.innerHTML=titleEquipe+empty('Aucun planning pour cette semaine');
    }else{
      // planning_equipe : jour (0=lundi…4=vendredi), prenom, type, hdebut, hfin
      const d=new Date(t+'T00:00:00');
      const jourIdx=d.getDay()===0?6:d.getDay()-1;
      const presents=rows.filter(r=>r.jour===jourIdx&&r.type!=='absent'&&r.type!=='conge');
      box.innerHTML=titleEquipe+
        (presents.length?presents.map(r=>{
          const horaire=(r.hdebut&&r.hfin)?r.hdebut+'–'+r.hfin:'';
          return'<div class="dash-list-item"><span>👤 '+escHtml(r.prenom||'—')+'</span><span style="font-size:11px;color:var(--muted)">'+escHtml(horaire)+'</span></div>';
        }).join('')
        :empty('Aucun staff présent ce jour'));
    }
  }catch(e){const b=document.getElementById('rdb-equipe');if(b)b.innerHTML=titleEquipe+empty('Indisponible');}

  // Remplaçantes
  try{
    const{data:rmps}=await sb.from('remplacantes').select('*').eq('creche_id',crecheId).eq('date',t);
    const box=document.getElementById('rdb-remplacantes');if(!box)return;
    if(!rmps||!rmps.length){box.innerHTML=titleRmp+empty('Aucune remplaçante prévue');
    }else{
      box.innerHTML=titleRmp+rmps.map(r=>{
        const h=r.heure_debut?r.heure_debut+'–'+(r.heure_fin||''):'';
        return'<div class="dash-list-item"><span>👤 '+escHtml(r.nom)+'</span><span style="font-weight:700;color:var(--koala);font-size:11px">'+h+'</span></div>';
      }).join('');
    }
  }catch(e){const b=document.getElementById('rdb-remplacantes');if(b)b.innerHTML=titleRmp+empty('Indisponible');}
}

// delEvent remplacé par delPlanningEvent

// DASHBOARD
function renderDashboard(){
  document.getElementById('dash-date').textContent='Mis à jour le '+new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const totalD=cacheDemandes.length,urgentD=cacheDemandes.filter(d=>d.priority==='urgent'&&d.status==='attente').length,incNT=cacheIncidents.filter(i=>!i.treated).length,incGrave=cacheIncidents.filter(i=>i.severity==='grave').length;
  let alerts='';
  if(urgentD>0)alerts+='<div class="alert-item" style="cursor:pointer" onclick="showMain(\'demands\')"><i class="ti ti-alert-triangle" style="font-size:16px;flex-shrink:0"></i> <strong>'+urgentD+' demande(s) urgente(s)</strong> en attente</div>';
  if(incGrave>0)alerts+='<div class="alert-item" style="cursor:pointer" onclick="showMain(\'incidents\')"><i class="ti ti-stethoscope" style="font-size:16px;flex-shrink:0"></i> <strong>'+incGrave+' incident(s) grave(s)</strong></div>';
  if(incNT>0)alerts+='<div class="alert-item warning" style="cursor:pointer" onclick="showMain(\'incidents\')"><i class="ti ti-clipboard-list" style="font-size:16px;flex-shrink:0"></i> <strong>'+incNT+' incident(s)</strong> non traité(s)</div>';
  document.getElementById('dash-alerts').innerHTML=alerts;
  loadDashboardVaccAlertes();
  loadDashboardDossiersAlertes();
  loadDashboardStgDocsAlertes();
  loadDashboardDevisAlertes();
  document.getElementById('dash-stats').innerHTML='<div class="stat-card"><div class="stat-label">Crèches</div><div class="stat-val cv">'+cacheCreches.length+'</div><div class="stat-sub">'+cacheEnfants.length+' enfants</div></div><div class="stat-card" style="border-top-color:var(--orange)"><div class="stat-label">Demandes</div><div class="stat-val co">'+totalD+'</div><div class="stat-sub">'+cacheDemandes.filter(d=>d.status==='attente').length+' en attente</div></div><div class="stat-card" style="border-top-color:var(--red)"><div class="stat-label">Incidents</div><div class="stat-val cr">'+cacheIncidents.length+'</div><div class="stat-sub">'+incNT+' non traités</div></div><div class="stat-card" style="border-top-color:var(--green)"><div class="stat-label">Référents</div><div class="stat-val cg">'+cacheReferents.filter(r=>r.role==='referent').length+'</div><div class="stat-sub">actifs</div></div>';
  const byCrecheRows=cacheCreches.map(c=>{const n=cacheDemandes.filter(d=>d.creche_id===c.id).length;const pct=totalD>0?Math.round(n/totalD*100):0;return'<div class="dash-list-item"><strong>'+c.name+'</strong><span style="font-weight:700;color:var(--koala)">'+n+'</span></div><div class="dash-bar"><div class="dash-bar-fill" style="width:'+pct+'%"></div></div>';}).join('')||'<div style="font-size:12px;color:var(--muted);text-align:center;padding:1rem">Aucune crèche</div>';
  const themes={};cacheDemandes.forEach(d=>{if(d.theme)themes[d.theme]=(themes[d.theme]||0)+1;});
  const themeRows=Object.keys(themes).length?Object.entries(themes).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div class="dash-list-item"><span>'+k+'</span><span style="font-weight:700;color:var(--koala)">'+v+'</span></div>').join(''):'<div style="font-size:12px;color:var(--muted);text-align:center;padding:1rem">Aucune donnée</div>';
  document.getElementById('dash-grid').innerHTML='<div class="dash-card"><div class="dash-card-title"><i class="ti ti-building"></i> Demandes par crèche</div>'+byCrecheRows+'</div><div class="dash-card"><div class="dash-card-title"><i class="ti ti-chart-pie"></i> Thèmes</div>'+themeRows+'</div>';
  renderDashboardToday();
}
// Vue direction : aucun filtre de crèche — le réseau entier. Chargée à part
// et ajoutée après coup à #dash-alerts, la cache vaccination pouvant ne pas
// être encore en mémoire (lazy-load comme dans brRender()).
async function loadDashboardVaccAlertes(){
  try{
    const n=(await vaccinationsEnRetard(null)).length;
    if(n>0){
      const box=document.getElementById('dash-alerts');if(!box)return;
      box.innerHTML+='<div class="alert-item warning" style="cursor:pointer" onclick="showMain(\'vaccinations\')"><i class="ti ti-vaccine" style="font-size:16px;flex-shrink:0"></i> <strong>'+n+' vaccination(s) en retard</strong></div>';
    }
  }catch(e){console.warn('[Dashboard] vaccinations',e);}
}
// Même logique que loadDashboardVaccAlertes : requête directe, pas de cache
// globale pour dossiers_familles, réseau entier (aucun filtre crèche).
async function loadDashboardDossiersAlertes(){
  try{
    const n=(await dossiersFamilleARelancer(null)).length;
    if(n>0){
      const box=document.getElementById('dash-alerts');if(!box)return;
      box.innerHTML+='<div class="alert-item warning"><i class="ti ti-mail-forward" style="font-size:16px;flex-shrink:0"></i> <strong>'+n+' dossier(s) famille</strong> à relancer</div>';
    }
  }catch(e){console.warn('[Dashboard] dossiers familles',e);}
}
// Seul le cas refusé est remonté ici : c'est le plus actionnable (une pièce
// manquante peut encore attendre, une pièce refusée attend une réponse).
async function loadDashboardStgDocsAlertes(){
  try{
    if(typeof stgLoad==='function'&&!stgCache.length)await stgLoad();
    if(typeof stgEnSuivi!=='function'||typeof stgDocsDe!=='function')return;
    const n=stgCache.filter(s=>stgEnSuivi(s)&&stgDocsDe(s.id).some(d=>d.statut==='refuse')).length;
    if(n>0){
      const box=document.getElementById('dash-alerts');if(!box)return;
      box.innerHTML+='<div class="alert-item warning" style="cursor:pointer" onclick="showMain(\'stagiaires\')"><i class="ti ti-file-x" style="font-size:16px;flex-shrink:0"></i> <strong>'+n+' document(s) stagiaire refusé(s)</strong> à corriger</div>';
    }
  }catch(e){console.warn('[Dashboard] documents stagiaires',e);}
}
async function loadDashboardDevisAlertes(){
  try{
    const n=(await devisARelancer(null)).length;
    if(n>0){
      const box=document.getElementById('dash-alerts');if(!box)return;
      // showMain() ne gère que les onglets internes à demandes.html : les devis
      // vivent dans inscriptions.html, on y renvoie donc par un vrai lien.
      box.innerHTML+='<a class="alert-item warning" href="inscriptions.html" style="text-decoration:none;color:inherit"><i class="ti ti-file-invoice" style="font-size:16px;flex-shrink:0"></i> <strong>'+n+' devis</strong> en attente de signature</a>';
    }
  }catch(e){console.warn('[Dashboard] devis',e);}
}

// AUJOURD'HUI — widget temps réel du tableau de bord
let dashSelectedDate=null;
function dashChangeDay(delta){
  const d=new Date(dashSelectedDate||todayStr());
  d.setDate(d.getDate()+delta);
  dashSelectedDate=ipDateToLocalISO(d);
  renderDashboardToday();
}
function dashGoToday(){dashSelectedDate=todayStr();renderDashboardToday();}
function dashSetDate(v){if(v){dashSelectedDate=v;renderDashboardToday();}}
function dashTodayEvents(t){
  return cacheEvenements.filter(e=>{
    const start=e.date_debut,end=e.date_fin||e.date_debut;
    return start&&t>=start&&t<=end;
  }).sort((a,b)=>(a.heure_debut||'').localeCompare(b.heure_debut||''));
}
function dashTodayBirthdays(t){
  const md=t.slice(5);
  return cacheEnfants.filter(e=>e.dob&&e.dob.slice(5)===md);
}
function renderDashboardToday(){
  // Capturé avant la réécriture de #dash-today-grid : une fois le innerHTML
  // remplacé, le select est recréé vide et sa valeur ne peut plus être lue.
  const planSelPrev=document.getElementById('dash-planning-creche-select')?.value||'';
  const t=dashSelectedDate||(dashSelectedDate=todayStr());
  const isToday=t===todayStr();
  const dateInput=document.getElementById('dash-date-input');
  if(dateInput)dateInput.value=t;
  const titleEl=document.getElementById('dash-today-title');
  if(titleEl)titleEl.textContent=isToday?"Aujourd'hui":'Le '+new Date(t+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  const lbl=document.getElementById('dash-today-label');
  if(lbl)lbl.textContent=new Date(t+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'})+(isToday?'':' (passé/à venir)');

  const evts=dashTodayEvents(t);
  const evtsHtml=evts.length?evts.map(e=>{
    const info=CAL_TYPE_INFO[e.type]||CAL_TYPE_INFO.autre;
    const creche=cacheCreches.find(c=>c.id===e.creche_id);
    const horaire=e.heure_debut?e.heure_debut+(e.heure_fin?'–'+e.heure_fin:''):'';
    return'<div class="dash-list-item"><span>'+info.emoji+' '+escHtml(e.titre)+(creche?' <span style="color:var(--muted);font-size:11px">('+escHtml(creche.name)+')</span>':' <span style="color:var(--muted);font-size:11px">(réseau)</span>')+'</span><span style="font-weight:700;color:var(--koala);font-size:11px;white-space:nowrap">'+horaire+'</span></div>';
  }).join(''):'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucun événement aujourd\'hui</div>';

  const bdays=dashTodayBirthdays(t);
  const bdaysHtml=bdays.length?bdays.map(e=>{
    const creche=cacheCreches.find(c=>c.id===e.creche_id);
    const age=Number(t.slice(0,4))-Number(e.dob.slice(0,4));
    return'<div class="dash-list-item"><span>🎂 '+escHtml((e.prenom||'')+' '+(e.nom||''))+'</span><span style="font-weight:700;color:var(--koala);font-size:11px;white-space:nowrap">'+age+' an'+(age>1?'s':'')+(creche?' · '+escHtml(creche.name):'')+'</span></div>';
  }).join(''):'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucun anniversaire aujourd\'hui</div>';

  const demT=cacheDemandes.filter(d=>(d.created_at||'').slice(0,10)===t);
  const incT=cacheIncidents.filter(i=>i.incident_date===t);
  let actHtml='';
  if(!demT.length&&!incT.length){
    actHtml='<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucune activité aujourd\'hui</div>';
  }else{
    actHtml+=demT.map(d=>{
      const creche=cacheCreches.find(c=>c.id===d.creche_id);
      return'<div class="dash-list-item"><span>'+(d.type==='consigne'?'📌':'✉️')+' '+escHtml(d.subject||d.theme||'Demande')+(creche?' <span style="color:var(--muted);font-size:11px">('+escHtml(creche.name)+')</span>':'')+'</span><span style="font-size:11px;font-weight:700;color:'+(d.priority==='urgent'?'var(--red)':'var(--muted)')+'">'+(d.priority==='urgent'?'Urgent':(d.status==='traite'?'Traité':'En attente'))+'</span></div>';
    }).join('');
    actHtml+=incT.map(i=>{
      const creche=cacheCreches.find(c=>c.id===i.creche_id);
      return'<div class="dash-list-item"><span>🚨 '+escHtml(i.child_name||'Incident')+(creche?' <span style="color:var(--muted);font-size:11px">('+escHtml(creche.name)+')</span>':'')+'</span><span style="font-size:11px;font-weight:700;color:'+(i.severity==='grave'?'var(--red)':'var(--muted)')+'">'+(i.treated?'Traité':'Non traité')+'</span></div>';
    }).join('');
  }

  document.getElementById('dash-today-grid').innerHTML=
    '<div class="dash-card"><div class="dash-card-title"><i class="ti ti-calendar-event"></i> Événements du jour</div>'+evtsHtml+'</div>'+
    '<div class="dash-card"><div class="dash-card-title"><i class="ti ti-cake"></i> Anniversaires</div>'+bdaysHtml+'</div>'+
    '<div class="dash-card"><div class="dash-card-title"><i class="ti ti-bolt"></i> Activité du jour</div>'+actHtml+'</div>'+
    '<div class="dash-card" id="dash-today-presence"><div class="dash-card-title"><i class="ti ti-users"></i> Présences du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>'+
    '<div class="dash-card" id="dash-today-planning"><div class="dash-card-title" style="display:flex;align-items:center;justify-content:space-between"><span><i class="ti ti-calendar-week"></i> Planning équipe du jour</span><select id="dash-planning-creche-select" class="finput" style="font-size:11px;padding:2px 6px;height:auto;width:auto" onchange="loadDashboardPlanning()"><option value="">-- Crèche --</option></select></div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Sélectionnez une crèche</div></div>'+
    '<div class="dash-card" id="dash-today-autres"><div class="dash-card-title"><i class="ti ti-user-off"></i> Absences et congés du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>'+
    '<div class="dash-card" id="dash-today-remplacantes"><div class="dash-card-title"><i class="ti ti-user-plus"></i> Remplaçantes du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>'+
    '<div class="dash-card" id="dash-today-mapresence"><div class="dash-card-title"><i class="ti ti-map-pin"></i> Ma présence du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>'+
    '<div class="dash-card" id="dash-today-afaire"><div class="dash-card-title"><i class="ti ti-checklist"></i> À faire du jour</div><div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Chargement…</div></div>';

  loadDashboardAfaire(t);
  loadDashboardMaPresence(t);
  loadDashboardPresences(t);
  loadDashboardRemplacantes(t);
  loadDashboardAutres(t);
  // Peupler le sélecteur crèche du planning et charger si une crèche déjà choisie
  const planSel=document.getElementById('dash-planning-creche-select');
  if(planSel){
    planSel.innerHTML='<option value="">-- Crèche --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'"'+(c.id===planSelPrev?' selected':'')+'>'+escHtml(c.name)+'</option>').join('');
    if(planSel.value)loadDashboardPlanning();
  }
}
// À faire du jour (direction) — tâches personnelles issues de `taches_afaire`
async function loadDashboardAfaire(dateStr){
  const box=document.getElementById('dash-today-afaire');if(!box)return;
  const title='<div class="dash-card-title" style="display:flex;align-items:center;justify-content:space-between"><span><i class="ti ti-checklist"></i> À faire du jour</span><button class="btn-sm" onclick="showMain(\'afaire\')" style="font-size:11px;padding:2px 8px">Ouvrir</button></div>';
  let rows=[];
  try{
    const{data,error}=await sb.from('taches_afaire').select('*').eq('date_jour',dateStr);
    if(error)throw error;
    rows=data||[];
  }catch(e){
    console.warn('[AfaireDash]',e.message);
    box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Erreur de chargement</div>';return;
  }
  // synchroniser le cache du module À faire
  rows.forEach(r=>{const i=afCache.findIndex(x=>x.id===r.id);if(i>=0)afCache[i]=r;else afCache.push(r);});
  if(!rows.length){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucune tâche ce jour</div>';return;}
  const sorted=afSortTasks(rows);
  const restants=rows.filter(t=>!t.fait).length;
  let html=title;
  html+='<div style="font-size:11px;color:var(--muted);padding:0 0 6px 2px">'+restants+' restante(s) sur '+rows.length+'</div>';
  html+=sorted.map(t=>{
    const meta=afTypeMeta(t.type);
    const cr=afCrecheName(t.creche_id);
    const urgent=t.priorite==='urgente'&&!t.fait;
    const style=t.fait?'text-decoration:line-through;color:var(--muted)':'';
    return'<div class="dash-list-item" style="cursor:pointer" onclick="dashAfaireToggle(\''+t.id+'\')">'
      +'<span style="display:flex;align-items:center;gap:7px;'+style+'"><i class="ti ti-'+(t.fait?'square-check-filled':'square')+'" style="font-size:16px;color:'+(t.fait?'var(--koala)':'var(--muted)')+'"></i>'+(urgent?'🔴 ':'')+meta.icon+' '+escHtml(t.titre)+'</span>'
      +(cr?'<span style="font-size:11px;color:var(--muted)">'+escHtml(cr)+'</span>':'')
    +'</div>';
  }).join('');
  box.innerHTML=html;
}
async function dashAfaireToggle(id){
  const t=afCache.find(x=>x.id===id);if(!t)return;
  const nv=!t.fait;
  const{error}=await sb.from('taches_afaire').update({fait:nv}).eq('id',id);
  if(error){showBanner('Erreur mise à jour.','error');return;}
  t.fait=nv;
  loadDashboardAfaire(dashSelectedDate||todayStr());
}

// Ma présence du jour (direction) — lue depuis le planning coordinateur (table `planning`)
const DASH_MP_TYPE={presence:{emoji:'🏫',lbl:'Présence crèche'},absent:{emoji:'🚫',lbl:'Absent'},conge:{emoji:'🌴',lbl:'Congé'},formation:{emoji:'🎓',lbl:'Formation'},reunion:{emoji:'🗣️',lbl:'Réunion'},detachement:{emoji:'🔄',lbl:'Détachement'}};
async function loadDashboardMaPresence(dateStr){
  const box=document.getElementById('dash-today-mapresence');if(!box)return;
  const title='<div class="dash-card-title"><i class="ti ti-map-pin"></i> Ma présence du jour</div>';
  const myId=currentProfile?.id;
  if(!myId){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Profil non chargé</div>';return;}
  const d=new Date(dateStr+'T00:00:00');
  const dow=d.getDay();
  if(dow===0||dow===6){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Week-end</div>';return;}
  const jour=dow-1;
  const semaine=mondayOfISO(dateStr);
  let rows=[];
  try{
    const{data,error}=await sb.from('planning').select('*').eq('referent_id',myId).eq('semaine',semaine).eq('jour',jour);
    if(error)throw error;
    rows=data||[];
  }catch(e){
    console.warn('[MaPresence]',e.message);
    box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Erreur de chargement</div>';return;
  }
  if(!rows.length){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Rien de planifié ce jour</div>';return;}
  const bySlot=[{n:'Matin',v:0},{n:'Après-midi',v:1}];
  let html='';
  bySlot.forEach(sl=>{
    const evs=rows.filter(r=>r.slot===sl.v||(r.slot===null&&sl.v===0));
    if(!evs.length){
      html+='<div class="dash-list-item"><span style="color:var(--muted)">'+sl.n+'</span><span style="font-size:11px;color:var(--muted)">—</span></div>';
      return;
    }
    evs.forEach(r=>{
      const info=DASH_MP_TYPE[r.type]||{emoji:'📍',lbl:r.type||''};
      const lieu=r.lieu||r.label||info.lbl;
      const horaire=r.hdebut?(r.hdebut+(r.hfin?'–'+r.hfin:'')):'';
      html+='<div class="dash-list-item"><span>'+info.emoji+' <strong>'+escHtml(lieu)+'</strong> '+
        '<span style="color:var(--muted);font-size:11px">('+sl.n+')</span></span>'+
        '<span style="font-size:11px;font-weight:700;color:var(--koala);white-space:nowrap">'+escHtml(horaire||info.lbl)+'</span></div>';
    });
  });
  box.innerHTML=title+html;
}
async function loadDashboardPlanning(){
  const box=document.getElementById('dash-today-planning');if(!box)return;
  const dateStr=document.getElementById('dash-date-input')?.value||todayStr();
  const crecheId=document.getElementById('dash-planning-creche-select')?.value;
  const titleBase='<div class="dash-card-title" style="display:flex;align-items:center;justify-content:space-between"><span><i class="ti ti-calendar-week"></i> Planning équipe du jour</span>';
  const selHtml='<select id="dash-planning-creche-select" class="finput" style="font-size:11px;padding:2px 6px;height:auto;width:auto" onchange="loadDashboardPlanning()"><option value="">-- Crèche --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'"'+(c.id===crecheId?' selected':'')+'>'+escHtml(c.name)+'</option>').join('')+'</select></div>';
  const title=titleBase+selHtml;
  if(!crecheId){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Sélectionnez une crèche</div>';return;}
  try{
    const d=new Date(dateStr+'T00:00:00');
    const jourIdx=d.getDay()===0?6:d.getDay()-1; // 0=lundi…6=dimanche
    const ws=mondayOfISO(dateStr);
    const{data:rows}=await sb.from('planning_equipe').select('*').eq('creche_id',crecheId).eq('semaine',ws).eq('jour',jourIdx);
    if(!rows||!rows.length){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucun planning saisi pour ce jour</div>';return;}
    const presents=rows.filter(r=>r.type!=='absent'&&r.type!=='conge');
    const absents=rows.filter(r=>r.type==='absent'||r.type==='conge');
    let html='';
    if(presents.length){
      html+=presents.map(r=>{
        const horaire=(r.hdebut&&r.hfin)?r.hdebut+'–'+r.hfin:'';
        const typeLabel={present:'✅ Présent',formation:'📚 Formation',reunion:'🤝 Réunion'}[r.type]||r.type;
        return'<div class="dash-list-item"><span>👤 '+escHtml(r.prenom||'—')+' <span style="font-size:10.5px;color:var(--muted)">'+typeLabel+'</span></span><span style="font-size:11px;font-weight:700;color:var(--koala)">'+escHtml(horaire)+'</span></div>';
      }).join('');
    }
    if(absents.length){
      html+='<div style="font-size:11px;color:var(--muted);margin-top:6px;padding:0 4px">Absent(e)s : '+absents.map(r=>escHtml(r.prenom||'—')).join(', ')+'</div>';
    }
    box.innerHTML=title+html;
  }catch(e){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Indisponible</div>';}
}
// Absences et conges du jour (direction).
// Critere METIER et non technique : on remonte les types conge/absent, plus les
// journees combinees (deux activites le meme jour, label « A + B », que l'import
// Excel enregistre sans creneau_label). L'ancien critere « pas de creneau_label »
// ne voulait rien dire : il attrapait les residus d'import et laissait passer
// les conges portes par une ligne de creneau.
// Toutes creches confondues, comme la carte Remplacantes.
function peEstCombinee(r){
  return !r.creneau_label && /\s\+\s/.test(String(r.label||''));
}
async function loadDashboardAutres(dateStr){
  const box=document.getElementById('dash-today-autres');
  if(!box)return;
  const title='<div class="dash-card-title"><i class="ti ti-user-off"></i> Absences et cong\u00e9s du jour</div>';
  const vide='<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Personne d\u2019absent</div>';
  try{
    const d=new Date(dateStr+'T00:00:00');
    const jourIdx=d.getDay()===0?6:d.getDay()-1;
    if(jourIdx>4){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Week-end</div>';return;}
    const ws=mondayOfISO(dateStr);
    const{data,error}=await sb.from('planning_equipe').select('*').eq('semaine',ws).eq('jour',jourIdx);
    if(error)throw error;
    const list=(data||[]).filter(r=>r.type==='conge'||r.type==='absent'||peEstCombinee(r));
    if(!list.length){box.innerHTML=title+vide;return;}
    // Absences d'abord, puis conges, puis journees combinees ; alphabetique dans chaque groupe
    const rang=r=>(r.type==='absent'?0:r.type==='conge'?1:2);
    list.sort((a,b)=>rang(a)-rang(b)||String(a.prenom||'').localeCompare(String(b.prenom||''),'fr'));
    box.innerHTML=title+list.map(r=>{
      const creche=cacheCreches.find(c=>c.id===r.creche_id);
      const combi=peEstCombinee(r);
      const motif=r.type==='absent'?'\u26a0\ufe0f Absence'
        :r.type==='conge'?'\ud83c\udfd6\ufe0f Cong\u00e9'
        :'\ud83d\udd00 Journ\u00e9e combin\u00e9e';
      const couleur=r.type==='absent'?'var(--red)':r.type==='conge'?'var(--koala)':'var(--muted)';
      // Une journee combinee porte toute son information dans le label : 2e ligne
      const detail=combi?'<div style="font-size:10.5px;color:var(--muted);padding:2px 0 0 22px;line-height:1.35;flex-basis:100%">'+escHtml(r.label)+'</div>':'';
      return'<div class="dash-list-item" style="flex-wrap:wrap"><span>\ud83d\udc64 '+escHtml(r.prenom||'\u2014')
        +(creche?' <span style="color:var(--muted);font-size:11px">('+escHtml(creche.name)+')</span>':'')
        +'</span><span style="font-size:11px;font-weight:700;color:'+couleur+';white-space:nowrap">'+motif+'</span>'
        +detail+'</div>';
    }).join('');
  }catch(e){
    box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Indisponible</div>';
  }
}
async function loadDashboardRemplacantes(dateStr){
  const box=document.getElementById('dash-today-remplacantes');
  if(!box)return;
  const title='<div class="dash-card-title"><i class="ti ti-user-plus"></i> Remplaçantes du jour</div>';
  try{
    const{data,error}=await sb.from('remplacantes').select('*').eq('date',dateStr).order('creche_id',{ascending:true});
    if(error)throw error;
    const list=data||[];
    if(!list.length){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucune remplaçante prévue</div>';return;}
    const rows=list.map(ev=>{
      const creche=cacheCreches.find(c=>c.id===ev.creche_id);
      const horaire=ev.heure_debut?ev.heure_debut+'–'+ev.heure_fin:'';
      return'<div class="dash-list-item"><span>👤 '+escHtml(ev.nom)+(creche?' <span style="color:var(--muted);font-size:11px">('+escHtml(creche.name)+')</span>':'')+'</span><span style="font-weight:700;color:var(--koala);font-size:11px;white-space:nowrap">'+horaire+'</span></div>';
    }).join('');
    box.innerHTML=title+rows;
  }catch(e){
    box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Indisponible</div>';
  }
}
async function loadDashboardPresences(dateStr){
  const box=document.getElementById('dash-today-presence');
  if(!box)return;
  const title='<div class="dash-card-title"><i class="ti ti-users"></i> Présences du jour</div>';
  try{
    // Recharger les enfants si cache vide
    if(!cacheEnfants.length){const{data:fe}=await sb.from('enfants').select('*');if(fe&&fe.length)cacheEnfants.push(...fe);}
    const{data,error}=await sb.from('presences').select('enfant_id,status').eq('presence_date',dateStr);
    if(error)throw error;
    const presentIds=new Set((data||[]).filter(p=>p.status==='present'||p.status==='partial').map(p=>p.enfant_id));
    const crechesWithEnfants=cacheCreches.filter(c=>cacheEnfants.some(e=>e.creche_id===c.id));
    if(!crechesWithEnfants.length){box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Aucun enfant enregistré</div>';return;}
    let html='';
    let totalPresent=0,totalEnfants=0;
    crechesWithEnfants.forEach(c=>{
      const enf=cacheEnfants.filter(e=>e.creche_id===c.id);
      const presents=enf.filter(e=>presentIds.has(e.id));
      totalPresent+=presents.length;totalEnfants+=enf.length;
      html+='<div style="margin-bottom:8px">';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">';
      html+='<span style="font-size:11px;font-weight:700;color:var(--koala)">'+escHtml(c.name)+'</span>';
      html+='<span style="font-size:11px;font-weight:700;color:'+(presents.length?'var(--green)':'var(--muted)')+'">'+presents.length+' / '+enf.length+'</span>';
      html+='</div>';
      if(presents.length){
        html+='<div style="display:flex;flex-wrap:wrap;gap:3px">';
        presents.forEach(e=>{
          html+='<span style="background:var(--koala);color:#fff;border-radius:4px;padding:1px 6px;font-size:10.5px;white-space:nowrap">'+escHtml(e.prenom)+'</span>';
        });
        html+='</div>';
      }else{
        html+='<div style="font-size:11px;color:var(--muted);font-style:italic">Pointage non saisi</div>';
      }
      html+='</div>';
    });
    const recap='<div style="font-size:11px;font-weight:700;color:var(--koala);border-top:1px solid var(--border);padding-top:6px;margin-top:2px">Total : '+totalPresent+' / '+totalEnfants+' enfants présents</div>';
    box.innerHTML=title+html+recap;
  }catch(e){
    box.innerHTML=title+'<div style="font-size:12px;color:var(--muted);text-align:center;padding:0.75rem">Pointage non saisi aujourd\'hui</div>';
  }
}

// EDGE FUNCTIONS
async function exportBackup(){
  try{
    showBanner('Préparation de la sauvegarde…');
    const[creches,demandes,referents,incidents,enfants,messages]=await Promise.all([
      dbSelect('creches'),dbSelect('demandes'),dbSelect('referents'),dbSelect('incidents'),dbSelect('enfants'),dbSelect('messages')
    ]);
    const backup={version:'2.1',date:new Date().toISOString(),creches,demandes,referents,incidents,enfants,messages};
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='koalakids_backup_'+ipDateToLocalISO(new Date())+'.json';
    a.click();
    URL.revokeObjectURL(url);
    showBanner('Sauvegarde téléchargée ✅');
  }catch(e){showBanner('Erreur lors de l\'export.','error');}
}

async function importBackup(event){
  const file=event.target.files[0];
  if(!file)return;
  if(!confirm('⚠️ La restauration va écraser toutes les données actuelles. Continuer ?'))return;
  try{
    const text=await file.text();
    const backup=JSON.parse(text);
    if(!backup.version||!backup.creches){showBanner('Fichier de sauvegarde invalide.','error');return;}
    showBanner('Restauration en cours…');
    // Vider et réinsérer chaque table
    for(const table of ['messages','presences','replies','demandes','incidents','enfants','referents','creches']){
      await sb.from(table).delete().neq('id','00000000-0000-0000-0000-000000000000');
    }
    if(backup.creches?.length)await sb.from('creches').insert(backup.creches);
    if(backup.referents?.length){
      const refs=backup.referents.filter(r=>r.role!=='direction');
      if(refs.length)await sb.from('referents').insert(refs);
    }
    if(backup.demandes?.length)await sb.from('demandes').insert(backup.demandes);
    if(backup.messages?.length)await sb.from('messages').insert(backup.messages);
    if(backup.incidents?.length)await sb.from('incidents').insert(backup.incidents);
    if(backup.enfants?.length)await sb.from('enfants').insert(backup.enfants);
    await loadAllData();
    renderDashboard();
    showBanner('Restauration réussie ✅ — '+backup.creches?.length+' crèches, '+backup.demandes?.length+' demandes importées.');
  }catch(e){showBanner('Erreur lors de la restauration : '+e.message,'error');}
  event.target.value='';
}

