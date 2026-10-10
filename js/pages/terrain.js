/* ================================================================
   ACCES TERRAIN — Koala Kids
   Point d'entree simplifie pour les auxiliaires de terrain :
   suivi quotidien (kiosque) + registre d'infirmerie.
   Page dediee, autonome. Auth Supabase, RLS cote serveur.
   ================================================================ */
const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let ME=null,PROF=null,IS_DIRECTION=false,IS_EMPLOYE=false;

function toast(m,err){const t=document.getElementById('toast');t.textContent=m;t.className='toast on'+(err?' err':'');setTimeout(()=>t.className='toast',3000);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* Même token que le pointage (tablette.html) : la tablette de suivi utilise
   la même URL de base, juste une autre page. Voir parametres.html. */
function suiviLinkFor(token){
  try{return new URL('suivi.html?k='+token,location.href).href;}
  catch(e){return location.href.replace(/[^/]*$/,'')+'suivi.html?k='+token;}
}

/* Mémorisation de l'appareil : évite de redemander le code à chaque
   reconnexion sur le même navigateur, en le limitant à 24h glissantes.
   Stocké en localStorage (propre à ce navigateur/appareil), pas en base :
   ne dispense donc jamais du mot de passe, seulement du code à 6 chiffres.
   Même mécanique que collaborateur.html/contrats.html/suivi.html. */
const MFA_TRUST_MS=24*60*60*1000;
function mfaTrustKey(){return 'kk_mfa_trust_'+(ME&&ME.id||'');}
function mfaIsTrusted(){
  try{
    const t=Number(localStorage.getItem(mfaTrustKey())||0);
    return t>0&&(Date.now()-t)<MFA_TRUST_MS;
  }catch(e){return false;}
}
function mfaMarkTrusted(){
  try{localStorage.setItem(mfaTrustKey(),String(Date.now()));}catch(e){}
}

/* ================= AUTH ================= */
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){showLoginView();return;}
  ME=session.user;
  const {data:p}=await sb.from('referents').select('*').eq('user_id',ME.id).maybeSingle();
  if(!p){toast("Profil introuvable. Contactez la direction.",true);await sb.auth.signOut();location.reload();return;}
  PROF=p; IS_DIRECTION=(p.role==='direction'); IS_EMPLOYE=(p.role==='employe');
  if(window.KKBranding)KKBranding.applyBranding(sb);
  // MFA obligatoire à la connexion, même portail que infirmerie.html/demandes.html.
  await mfaGateCheckAndProceed();
}
function showLoginView(msg){
  document.getElementById('appView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='block';
  document.getElementById('mfaGateBox').style.display='none';
  if(msg)document.getElementById('liErr').textContent=msg;
}
async function terrainGrantAccess(){
  if(typeof kkLoginAlertCheck==='function')kkLoginAlertCheck(sb);
  document.getElementById('loginView').style.display='none';
  document.getElementById('appView').style.display='block';
  document.getElementById('whoAmI').textContent=(PROF.name||'')+(IS_DIRECTION?' · Direction':'');
  document.getElementById('hello').innerHTML='Bonjour '+esc(PROF.name||'')+' <small>Suivi de l\'enfant, registre d\'infirmerie et signalement d\'incident, en un tap.</small>';
}
// --- Portail MFA obligatoire (identique à infirmerie.html) ---
function mfaGateSwitchView(id){
  document.getElementById('appView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='none';
  document.getElementById('mfaGateBox').style.display='block';
  ['mfaGateChallengeView','mfaGateEnrollView'].forEach(v=>{
    document.getElementById(v).style.display=(v===id)?'block':'none';
  });
}
async function mfaGateCheckAndProceed(){
  try{
    const{data,error}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error)throw error;
    if(data.currentLevel==='aal2'){await terrainGrantAccess();return;}
    if(data.nextLevel==='aal2'){
      if(mfaIsTrusted()){await terrainGrantAccess();return;}
      mfaGateShowChallenge();return;
    }
    await mfaGateShowEnroll();
  }catch(e){
    console.error('[MFA Gate]',e);
    try{await sb.auth.signOut();}catch(_e){}
    showLoginView('Erreur de vérification de la double authentification. Réessayez.');
  }
}
function mfaGateShowChallenge(){
  document.getElementById('mfaGateCode').value='';
  document.getElementById('mfaGateChallengeErr').style.display='none';
  mfaGateSwitchView('mfaGateChallengeView');
  setTimeout(()=>{const el=document.getElementById('mfaGateCode');if(el)el.focus();},100);
}
let mfaGateFactorId=null;
async function mfaGateShowEnroll(){
  mfaGateSwitchView('mfaGateEnrollView');
  const err=document.getElementById('mfaGateEnrollErr');
  err.style.display='none';
  try{
    const{data:existing,error:listError}=await sb.auth.mfa.listFactors();
    if(listError)throw listError;
    const stale=(existing.all||[]).filter(f=>f.factor_type==='totp'&&f.status!=='verified');
    for(const f of stale){
      try{await sb.auth.mfa.unenroll({factorId:f.id});}catch(e){console.warn('Nettoyage facteur MFA périmé échoué :',e.message);}
    }
    const{data,error}=await sb.auth.mfa.enroll({factorType:'totp'});
    if(error)throw error;
    mfaGateFactorId=data.id;
    const qrEl=document.getElementById('mfaGateQr');
    qrEl.innerHTML='';
    const qr=data.totp.qr_code||'';
    const svgMatch=qr.match(/<svg[\s\S]*<\/svg>/i);
    if(svgMatch){
      qrEl.innerHTML=svgMatch[0];
      const svg=qrEl.querySelector('svg');
      if(svg){svg.style.width='180px';svg.style.height='180px';}
    }else{
      const img=document.createElement('img');
      img.alt='QR code MFA';
      img.style.cssText='display:block;width:180px;height:180px;object-fit:contain';
      img.src=qr;
      qrEl.appendChild(img);
    }
    document.getElementById('mfaGateSecret').textContent=data.totp.secret;
    document.getElementById('mfaGateEnrollCode').value='';
  }catch(e){
    console.error('[MFA Gate enroll]',e);
    err.textContent="Erreur lors de la préparation de l'enrôlement : "+e.message;err.style.display='block';
  }
}
async function mfaGateVerifyChallenge(){
  const code=document.getElementById('mfaGateCode').value.trim();
  const err=document.getElementById('mfaGateChallengeErr');
  err.style.display='none';
  if(!/^\d{6}$/.test(code)){err.textContent='Le code doit contenir 6 chiffres.';err.style.display='block';return;}
  try{
    const{data:factors,error:listError}=await sb.auth.mfa.listFactors();
    if(listError)throw listError;
    const verified=(factors.totp||[])[0];
    if(!verified)throw new Error('Aucun facteur MFA vérifié trouvé sur ce compte.');
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:verified.id});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:verified.id,challengeId:ch.id,code});
    if(vErr)throw vErr;
    mfaMarkTrusted();
    await terrainGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateConfirmEnroll(){
  const code=document.getElementById('mfaGateEnrollCode').value.trim();
  const err=document.getElementById('mfaGateEnrollErr');
  err.style.display='none';
  if(!/^\d{6}$/.test(code)){err.textContent='Le code doit contenir 6 chiffres.';err.style.display='block';return;}
  if(!mfaGateFactorId){err.textContent="Session d'enrôlement expirée, réessayez.";err.style.display='block';return;}
  try{
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:mfaGateFactorId});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:mfaGateFactorId,challengeId:ch.id,code});
    if(vErr)throw vErr;
    mfaGateFactorId=null;
    await terrainGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateCancel(){
  if(mfaGateFactorId){try{await sb.auth.mfa.unenroll({factorId:mfaGateFactorId});}catch(e){console.warn('Nettoyage annulation MFA gate échoué :',e.message);}}
  mfaGateFactorId=null;
  try{await sb.auth.signOut();}catch(e){}
  showLoginView();
}
async function doLogin(){
  const e=document.getElementById('liMail').value.trim(),p=document.getElementById('liPwd').value;
  const {error}=await sb.auth.signInWithPassword({email:e,password:p});
  if(error){document.getElementById('liErr').textContent='Identifiants incorrects';return;}
  location.reload();
}

/* ================= SUIVI DE L'ENFANT (kiosque) ================= */
async function openSuivi(){
  const box=document.getElementById('suiviResult');
  box.innerHTML='';
  if(!PROF.creche_id){
    // Direction : rattachée à aucune crèche en particulier (accès à toutes),
    // donc pas de redirection automatique possible sans ambiguïté.
    box.innerHTML='<div class="msg warn"><i class="ti ti-info-circle"></i> La direction gère plusieurs crèches : ouvrez le suivi depuis Paramètres.</div>';
    return;
  }
  try{
    const{data,error}=await sb.from('kiosk_devices').select('*').eq('creche_id',PROF.creche_id).eq('active',true);
    if(error)throw error;
    const devices=data||[];
    if(!devices.length){
      box.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> Aucune tablette configurée pour votre crèche. Contactez la direction.</div>';
      return;
    }
    if(devices.length===1){
      location.href=suiviLinkFor(devices[0].token);
      return;
    }
    // Plusieurs tablettes actives pour cette crèche : on laisse choisir.
    box.innerHTML='<div class="devlist">'+devices.map(d=>
      '<div class="devrow" onclick="location.href=\''+esc(suiviLinkFor(d.token))+'\'"><b>'+esc(d.label||'Tablette sans nom')+'</b><i class="ti ti-chevron-right"></i></div>'
    ).join('')+'</div>';
  }catch(e){
    console.error('[openSuivi]',e);
    const msg=e.code==='42P01'
      ? 'Fonction indisponible pour le moment (contactez la direction).' : (e.message||'erreur inconnue');
    box.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> Impossible de charger les tablettes : '+esc(msg)+'</div>';
  }
}

/* ================= SIGNALER UN INCIDENT =================
   Formulaire de déclaration + liste des derniers incidents de SA crèche,
   sur la table Supabase `incidents` déjà utilisée par demandes.html
   (mêmes colonnes, même edge function notify-infirmerie pour les incidents
   graves). Pas de duplication du module complet : on ne reprend que ce
   dont un auxiliaire de terrain a besoin. */
const INC_TYPE_LABELS_T={comportement:'Incident comportemental',materiel:'Incident matériel',securite:'Sécurité des locaux',famille:'Relation avec une famille',repas_corps_etranger:'Repas MCM – Corps étranger (arête, os...)',repas_grammage:'Repas MCM – Grammage insuffisant',repas_livraison:'Repas MCM – Livraison (retard, livreur inadapté...)',autre:'Autre'};
const INC_TYPE_OPTS_ENFANT_T=[['comportement','Incident comportemental'],['materiel','Incident matériel'],['securite','Sécurité des locaux'],['famille','Relation avec une famille'],['autre','Autre']];
const INC_TYPE_OPTS_REPAS_T=[['repas_corps_etranger',"Repas MCM – Corps étranger (arête, os...)"],['repas_grammage','Repas MCM – Grammage insuffisant'],['repas_livraison','Repas MCM – Livraison (retard, livreur inadapté...)'],['repas_libre','Repas MCM – Autre (à préciser)']];
function incTypeSelectHtmlT(cat){
  const opts=cat==='repas'?INC_TYPE_OPTS_REPAS_T:INC_TYPE_OPTS_ENFANT_T;
  return opts.map(o=>'<option value="'+o[0]+'">'+esc(o[1])+'</option>').join('');
}
function toggleIncTypeLibreT(){
  const libre=document.getElementById('incType').value==='repas_libre';
  document.getElementById('incTypeLibreWrap').style.display=libre?'':'none';
}
async function dbInsertT(table,row){
  const{data,error}=await sb.from(table).insert(row).select().single();
  if(error){console.error('[dbInsertT]',table,error);return null;}
  return data;
}
async function callFnT(fn,body){
  try{
    const r=await fetch(SUPABASE_URL+'/functions/v1/'+fn,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON_KEY},body:JSON.stringify(body)});
    return r.ok;
  }catch(e){console.error('[callFnT]',fn,e);return false;}
}
let activeIncCategoryT='enfant',LAST_INCIDENTS_T=[];
function setIncCategoryT(cat,btn){
  activeIncCategoryT=cat;
  document.querySelectorAll('.inc-cat-t').forEach(function(b){b.classList.remove('on');b.classList.remove('btn-s');b.classList.add('btn-g');});
  btn.classList.add('on');btn.classList.remove('btn-g');btn.classList.add('btn-s');
  const sel=document.getElementById('incType');
  sel.innerHTML=incTypeSelectHtmlT(cat);
  sel.value=cat==='repas'?'repas_corps_etranger':'comportement';
  toggleIncTypeLibreT();
  document.getElementById('incSeverityWrap').style.display=cat==='repas'?'none':'';
  renderIncidentsTerrain(LAST_INCIDENTS_T);
}
async function openIncidentPanel(){
  if(!PROF.creche_id){
    // Direction sans crèche unique rattachée : pas de cloisonnement évident,
    // même logique que openSuivi() ci-dessus -> on renvoie vers demandes.html.
    document.getElementById('suiviResult').innerHTML='<div class="msg warn"><i class="ti ti-info-circle"></i> La direction gère plusieurs crèches : déclarez l\'incident depuis demandes.html (module Incidents).</div>';
    return;
  }
  document.getElementById('incDate').value=new Date().toISOString().slice(0,10);
  document.getElementById('incTime').value=new Date().toTimeString().slice(0,5);
  ['incChild','incDesc','incActions','incTypeLibre'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('incReporter').value=PROF.name||'';
  document.getElementById('incSeverity').value='info';
  document.getElementById('ovIncident').classList.add('on');
  setIncCategoryT('enfant',document.getElementById('incCatEnfantBtn'));
  loadIncidentsTerrain();
}
function closeIncidentPanel(){document.getElementById('ovIncident').classList.remove('on');}
function isIncRepasT(i){return /^repas/i.test(i.type||'')||/^Repas MCM/i.test(i.type||'');}
async function loadIncidentsTerrain(){
  const box=document.getElementById('incidentListT');
  box.innerHTML='<div style="color:var(--muted);font-size:13px">Chargement…</div>';
  try{
    const{data,error}=await sb.from('incidents').select('*').eq('creche_id',PROF.creche_id).order('incident_date',{ascending:false}).order('incident_time',{ascending:false}).limit(20);
    if(error)throw error;
    LAST_INCIDENTS_T=data||[];
    renderIncidentsTerrain(LAST_INCIDENTS_T);
  }catch(e){
    console.error('[loadIncidentsTerrain]',e);
    box.innerHTML='<div class="msg warn" style="font-size:12.5px"><i class="ti ti-alert-triangle"></i> Impossible de charger les incidents.</div>';
  }
}
function renderIncidentsTerrain(fullList){
  const box=document.getElementById('incidentListT');
  const list=(fullList||[]).filter(function(i){return activeIncCategoryT==='repas'?isIncRepasT(i):!isIncRepasT(i);});
  if(!list.length){box.innerHTML='<div style="color:var(--muted);font-size:13px">Aucun incident déclaré pour l\'instant.</div>';return;}
  const si={grave:'🔴',leger:'🟠',info:'ℹ️'};
  const showSev=activeIncCategoryT!=='repas';
  box.innerHTML=list.map(function(i){
    const sev=i.severity||'info';
    const label=INC_TYPE_LABELS_T[i.type]||i.type||'';
    const childHtml=i.child_name?('<div style="font-size:12px;color:var(--violet);font-weight:600;margin-top:2px"><i class="ti ti-user" style="font-size:11px"></i> '+esc(i.child_name)+'</div>'):'';
    const statusHtml=i.treated?'<span style="font-size:11px;background:var(--green-l);color:var(--green);padding:2px 8px;border-radius:8px;font-weight:700">✅ Traité</span>':'<span style="font-size:11px;background:#FFF3D6;color:#8A6100;padding:2px 8px;border-radius:8px;font-weight:700">⏳ En cours</span>';
    return '<div class="inc-card '+esc(sev)+'">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">'
        +'<b style="font-size:13.5px">'+(showSev?(si[sev]||'ℹ️')+' ':'')+esc(label)+'</b>'
        +'<span style="font-size:11px;color:var(--muted);white-space:nowrap">'+esc(i.incident_date||'')+(i.incident_time?(' à '+esc(i.incident_time)):'')+'</span>'
      +'</div>'
      +childHtml
      +'<div style="font-size:13px;color:#555;margin-top:4px;line-height:1.4">'+esc(i.description||'—')+'</div>'
      +'<div style="margin-top:6px">'+statusHtml+'</div>'
    +'</div>';
  }).join('');
}
async function saveIncidentTerrain(){
  const desc=document.getElementById('incDesc').value.trim();
  if(!desc){toast('Description requise.',true);return;}
  let type=document.getElementById('incType').value;
  if(type==='repas_libre'){
    const libre=document.getElementById('incTypeLibre').value.trim();
    if(!libre){toast("Précisez le type d'incident repas MCM.",true);return;}
    type='Repas MCM – '+libre;
  }
  const row={
    creche_id:PROF.creche_id,
    child_name:document.getElementById('incChild').value.trim(),
    incident_date:document.getElementById('incDate').value,
    incident_time:document.getElementById('incTime').value,
    type:type,
    severity:activeIncCategoryT==='repas'?'info':document.getElementById('incSeverity').value,
    description:desc,
    actions:document.getElementById('incActions').value.trim(),
    reporter:document.getElementById('incReporter').value.trim(),
    treated:false
  };
  const saved=await dbInsertT('incidents',row);
  if(!saved){toast('Erreur lors de l\'enregistrement.',true);return;}
  // Alerte immediate a la direction et a la referente si l'incident est grave
  // (meme edge function que demandes.html, aucun detail/nom transmis par courriel).
  if(saved.severity==='grave'){
    await callFnT('notify-infirmerie',{creche_id:saved.creche_id,motif:'grave',date:saved.incident_date,heure:saved.incident_time,source:'incident'});
    toast('Incident enregistré. Direction et directeur/trice technique alertées.');
  }else{
    toast('Incident enregistré.');
  }
  closeIncidentPanel();
}

/* ================= EVENEMENTS ================= */
document.getElementById('btnLogin').onclick=doLogin;
document.getElementById('liPwd').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('btnLogout').onclick=async()=>{await sb.auth.signOut();location.reload();};
document.getElementById('qSuivi').onclick=openSuivi;
document.getElementById('qIncident').onclick=openIncidentPanel;

boot();
