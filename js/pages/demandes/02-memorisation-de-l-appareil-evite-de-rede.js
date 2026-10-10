// --- Mémorisation de l'appareil : évite de redemander le code à chaque
// reconnexion (déconnexion systématique à chaque ouverture, cf. plus haut) sur
// le même navigateur, en le limitant à 24h glissantes. Stocké en localStorage
// (propre à ce navigateur/appareil), pas en base : ne dispense donc jamais du
// mot de passe, seulement du code à 6 chiffres.
const MFA_TRUST_MS=24*60*60*1000;
function mfaTrustKey(){return 'kk_mfa_trust_'+(currentUser&&currentUser.id||'');}
function mfaIsTrusted(){
  try{
    const t=Number(localStorage.getItem(mfaTrustKey())||0);
    return t>0&&(Date.now()-t)<MFA_TRUST_MS;
  }catch(e){return false;}
}
function mfaMarkTrusted(){
  try{localStorage.setItem(mfaTrustKey(),String(Date.now()));}catch(e){}
}
function mfaClearTrusted(){
  try{localStorage.removeItem(mfaTrustKey());}catch(e){}
}
// --- Portail MFA obligatoire à la connexion ---
// S'intercale entre l'authentification par mot de passe (AAL1) et l'entrée dans
// l'app : impose la vérification du second facteur si un facteur est déjà
// enrôlé, ou impose l'enrôlement immédiat si le compte n'en a pas encore.
async function mfaGateCheckAndProceed(){
  try{
    const{data,error}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error)throw error;
    if(data.currentLevel==='aal2'){await finishLoginAfterAuth();return;}
    if(data.nextLevel==='aal2'){
      if(mfaIsTrusted()){await finishLoginAfterAuth();return;}
      mfaGateShowChallenge();return;
    }
    await mfaGateShowEnroll();
  }catch(e){
    console.error('[MFA Gate]',e);
    await sb.auth.signOut();
    showLogin();
    const err=document.getElementById('login-err');
    err.textContent='Erreur de vérification de la double authentification. Réessayez.';err.style.display='block';
  }
}
function mfaGateSwitchView(id){
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('login-wrap').style.display='block';
  document.getElementById('app-wrap').style.display='none';
  document.getElementById('login-form').style.display='none';
  document.getElementById('reset-form').style.display='none';
  document.getElementById('mfa-gate-form').style.display='block';
  ['mfa-gate-challenge-view','mfa-gate-enroll-view'].forEach(v=>{
    document.getElementById(v).style.display=(v===id?'block':'none');
  });
}
function mfaGateShowChallenge(){
  document.getElementById('mfa-gate-code').value='';
  document.getElementById('mfa-gate-challenge-err').style.display='none';
  mfaGateSwitchView('mfa-gate-challenge-view');
  setTimeout(()=>{const el=document.getElementById('mfa-gate-code');if(el)el.focus();},100);
}
let mfaGateFactorId=null;
async function mfaGateShowEnroll(){
  mfaGateSwitchView('mfa-gate-enroll-view');
  const err=document.getElementById('mfa-gate-enroll-err');
  err.style.display='none';
  try{
    // Nettoyage des facteurs non vérifiés laissés par une tentative précédente,
    // sinon enroll() échoue avec "friendly name already exists" (même correctif
    // que secMfaStartEnroll dans le module Sécurité).
    const{data:existing,error:listError}=await sb.auth.mfa.listFactors();
    if(listError)throw listError;
    const stale=(existing.all||[]).filter(f=>f.factor_type==='totp'&&f.status!=='verified');
    for(const f of stale){
      try{await sb.auth.mfa.unenroll({factorId:f.id});}catch(e){console.warn('Nettoyage facteur MFA périmé échoué :',e.message);}
    }
    const{data,error}=await sb.auth.mfa.enroll({factorType:'totp'});
    if(error)throw error;
    mfaGateFactorId=data.id;
    const qrEl=document.getElementById('mfa-gate-qr');
    qrEl.innerHTML='';
    // data.totp.qr_code est une data-URL directement utilisable comme src
    // d'<img> (c'est ce que fait l'exemple officiel Supabase) : on évite
    // toute extraction/réinjection du SVG, qui peut le corrompre.
    const img=document.createElement('img');
    img.alt='QR code MFA';
    img.style.cssText='display:block;width:232px;height:232px;object-fit:contain';
    img.src=data.totp.qr_code||'';
    qrEl.appendChild(img);
    document.getElementById('mfa-gate-secret').textContent=data.totp.secret;
    document.getElementById('mfa-gate-enroll-code').value='';
  }catch(e){
    console.error('[MFA Gate enroll]',e);
    err.textContent="Erreur lors de la préparation de l'enrôlement : "+e.message;err.style.display='block';
  }
}
async function mfaGateVerifyChallenge(){
  const code=document.getElementById('mfa-gate-code').value.trim();
  const err=document.getElementById('mfa-gate-challenge-err');
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
    await finishLoginAfterAuth();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateConfirmEnroll(){
  const code=document.getElementById('mfa-gate-enroll-code').value.trim();
  const err=document.getElementById('mfa-gate-enroll-err');
  err.style.display='none';
  if(!/^\d{6}$/.test(code)){err.textContent='Le code doit contenir 6 chiffres.';err.style.display='block';return;}
  if(!mfaGateFactorId){err.textContent='Session d\'enrôlement expirée, réessayez.';err.style.display='block';return;}
  try{
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:mfaGateFactorId});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:mfaGateFactorId,challengeId:ch.id,code});
    if(vErr)throw vErr;
    mfaGateFactorId=null;
    mfaMarkTrusted();
    await finishLoginAfterAuth();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateCancel(){
  if(mfaGateFactorId){try{await sb.auth.mfa.unenroll({factorId:mfaGateFactorId});}catch(e){console.warn('Nettoyage annulation MFA gate échoué :',e.message);}}
  mfaGateFactorId=null;
  await sb.auth.signOut();
  currentUser=null;
  const pwdEl=document.getElementById('login-pwd');if(pwdEl)pwdEl.value='';
  showLogin();
}
async function doLogout(){if(!confirm('Se déconnecter ?'))return;await sb.auth.signOut();window.location.reload();}
const VAPID_PUBLIC_KEY='BAYWoYbzpxn-poxeKn-7CPccnX-aGN5y8kXLVCgcgC8a025oz8HMdNj7E36VLgtiD-oV71KhgCECdQGL85kidOk';
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const rawData=atob(base64);return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));}
if('serviceWorker'in navigator&&location.protocol==='https:'&&!location.hostname.includes('claudeusercontent')){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').then(r=>console.log('SW registered:',r.scope)).catch(e=>console.log('SW error:',e));});}
function updateNotifIcon(subscribed){const btn=document.getElementById('btn-notif');if(!btn)return;const icon=btn.querySelector('i');if(subscribed){if(icon)icon.className='ti ti-bell';btn.style.color='var(--koala)';btn.title='Désactiver les notifications';}else{if(icon)icon.className='ti ti-bell-off';btn.style.color='#9ca3af';btn.title='Activer les notifications';}}
async function checkNotifSubscription(){if(!('serviceWorker'in navigator)||!('PushManager'in window))return;try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();updateNotifIcon(!!sub);
  if(sub){
    // Abonnement déjà présent dans le navigateur : on le (ré)enregistre pour ce compte
    // (poste partagé, ou ligne supprimée côté base) — sans effet s'il existe déjà.
    // RPC plutôt qu'un upsert direct : sur un poste partagé, l'endpoint (propre au
    // navigateur) peut encore appartenir à la personne précédente, et un upsert direct
    // se heurte alors à la policy RLS "own" en update (cf. sql/push_subscriptions_reassign_rpc.sql).
    if(currentProfile?.id){const j=sub.toJSON();if(j.endpoint&&j.keys)sb.rpc('upsert_push_subscription',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth_key:j.keys.auth,p_user_agent:navigator.userAgent}).then(function(r){if(r.error)console.warn('[Notif] resync abonnement',r.error);});}
    return;
  }
  proposerActivationNotifs();
}catch(e){console.warn('[Notif] check subscription',e);}}
/* Invitation à activer les notifications : le navigateur exige un clic pour afficher
   sa demande d'autorisation, on propose donc un bandeau avec un bouton « Activer ».
   « Plus tard » la masque 7 jours sur cet appareil ; non proposée si déjà refusée. */
function proposerActivationNotifs(){
  if(typeof Notification==='undefined'||Notification.permission==='denied'||!currentProfile?.id)return;
  const cle='koala_notif_invite_'+currentProfile.id;
  try{const t=parseInt(localStorage.getItem(cle)||'0',10);if(t&&Date.now()-t<7*86400000)return;}catch(e){}
  if(document.getElementById('notif-invite'))return;
  const box=document.createElement('div');
  box.id='notif-invite';
  box.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:99998;background:#3D3580;color:#fff;border-radius:12px;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,.3);font-size:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:min(92vw,520px)';
  box.innerHTML='<span style="flex:1;min-width:180px">🔔 Activer les notifications pour être prévenu·e des consignes, demandes et messages ?</span>';
  const ok=document.createElement('button');
  ok.textContent='Activer';
  ok.style.cssText='background:#F47920;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer';
  ok.onclick=async function(){box.remove();await toggleNotificationsPush();};
  const later=document.createElement('button');
  later.textContent='Plus tard';
  later.style.cssText='background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:7px 12px;cursor:pointer';
  later.onclick=function(){try{localStorage.setItem(cle,String(Date.now()));}catch(e){}box.remove();};
  box.appendChild(ok);box.appendChild(later);
  document.body.appendChild(box);
}
async function toggleNotificationsPush(){
  if(!('serviceWorker'in navigator)||!('PushManager'in window)){alert('Les notifications push ne sont pas supportées sur cet appareil/navigateur.');return;}
  const reg=await navigator.serviceWorker.ready;
  const existingSub=await reg.pushManager.getSubscription();
  if(existingSub){
    try{
      await existingSub.unsubscribe();
      if(currentProfile?.id){const{error}=await sb.from('push_subscriptions').delete().eq('referent_id',currentProfile.id);if(error)console.error(error);}
      updateNotifIcon(false);
      if(typeof showBanner==='function')showBanner('Notifications désactivées.');else alert('Notifications désactivées.');
    }catch(e){console.error(e);alert('Erreur lors de la désactivation des notifications.');}
    return;
  }
  const permission=await Notification.requestPermission();if(permission!=='granted'){alert('Notifications refusées. Tu peux les réactiver dans les réglages du navigateur.');return;}
  let sub=await reg.pushManager.getSubscription();if(sub){await sub.unsubscribe();}
  sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
  const subJson=sub.toJSON();
  const{error}=await sb.rpc('upsert_push_subscription',{p_endpoint:subJson.endpoint,p_p256dh:subJson.keys.p256dh,p_auth_key:subJson.keys.auth,p_user_agent:navigator.userAgent});
  if(error){console.error(error);alert("Erreur lors de l'activation des notifications.");return;}
  updateNotifIcon(true);
  if(typeof showBanner==='function')showBanner('Notifications activées !');else alert('Notifications activées !');
}
const activerNotificationsPush=toggleNotificationsPush;
function showLogin(){
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('login-wrap').style.display='block';
  document.getElementById('app-wrap').style.display='none';
  document.getElementById('login-form').style.display='block';
  document.getElementById('reset-form').style.display='none';
  document.getElementById('mfa-gate-form').style.display='none';
  const btn=document.getElementById('login-btn');
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-login"></i> Se connecter';}
}

function showPasswordResetForm(){
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('login-wrap').style.display='block';
  document.getElementById('app-wrap').style.display='none';
  document.getElementById('login-form').style.display='none';
  document.getElementById('reset-form').style.display='block';
  document.getElementById('login-sub').textContent='Réinitialisation du mot de passe';
}

async function saveNewPassword(){
  const pwd=document.getElementById('new-pwd').value;
  const confirm=document.getElementById('new-pwd-confirm').value;
  const err=document.getElementById('login-err');
  err.style.display='none';
  if(pwd.length<6){err.textContent='Le mot de passe doit faire au moins 6 caractères.';err.style.display='block';return;}
  if(pwd!==confirm){err.textContent='Les mots de passe ne correspondent pas.';err.style.display='block';return;}
  const{error}=await sb.auth.updateUser({password:pwd});
  if(error){err.textContent='Erreur : '+error.message;err.style.display='block';}
  else{showBanner('Mot de passe mis à jour ✅ — vous pouvez vous connecter.');document.getElementById('login-form').style.display='block';document.getElementById('reset-form').style.display='none';document.getElementById('login-sub').textContent='Suite de gestion pédagogique';}
}
function showApp(){
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('login-wrap').style.display='none';
  document.getElementById('app-wrap').style.display='block';
  document.querySelectorAll('.direction-only').forEach(el=>el.style.display=isDirection?'':'none');
  document.querySelectorAll('.referent-only').forEach(el=>el.style.display=(!isDirection)?'':'none');
  const isDavid=currentProfile?.role==='direction'||currentProfile?.role==='referent'||(currentUser?.email||'').toLowerCase()==='cp1.koalakids@outlook.fr';
  document.querySelectorAll('.david-only').forEach(el=>el.style.display=isDavid?'':'none');
  document.getElementById('user-name').textContent=currentProfile?.name||currentUser?.email||'';
  updateBadges();renderCrecheTabs();
  checkNotifSubscription();
  notifBellCharger();notifBellRender();
  /* Ouverture sur l'accueil « Modules » (tuiles par theme), direction comme
     referentes. Le tableau de bord reste a un clic (tuile Pilotage) et le
     briefing « Ma journée » s'ouvre toujours a la premiere connexion du jour. */
  showMain('accueil');
  enfMaybeOpenFromUrl();
  empMaybeOpenFromUrl();
  demandeMaybeOpenFromUrl();
  syncDemarrer();
  /* Briefing du jour : une fois par jour et par poste. Il part apres le dessin
     de l'ecran, le temps que les caches soient en place. Retour depuis l'outil
     Documents (?enfant=) : on ne l'interrompt pas avec une fenetre. */
  if(!_ouvertureDemandeUrl&&!new URLSearchParams(location.search).get('enfant')&&!new URLSearchParams(location.search).get('employe')){
    setTimeout(function(){try{brBriefingAuto();}catch(e){console.warn('[briefing]',e);}},500);
  }
}

/* Ouverture automatique de la fiche enfant sur l'onglet Documents,
   après un retour depuis l'outil Documents (?enfant=<id>&tab=documents). */
function enfMaybeOpenFromUrl(){
  try{
    const q=new URLSearchParams(location.search);
    const enfId=q.get('enfant');
    if(!enfId)return;
    // nettoyer l'URL pour éviter une réouverture au rechargement
    history.replaceState(null,'',location.pathname);
    showMain('enfants');
    // laisser le module s'initialiser puis ouvrir la fiche sur l'onglet Documents
    setTimeout(()=>{
      enfOpenFiche(enfId);
      setTimeout(()=>{
        enfFicheTab('documents');
      },150);
    },200);
  }catch(e){console.warn('enfMaybeOpenFromUrl',e);}
}

/* Ouverture directe d'une demande depuis le lien d'un e-mail de notification
   (?demande=<id>) : on garde le paramètre pendant la connexion, puis, une fois
   les données chargées, on ouvre l'onglet Demandes et le fil de la demande.
   Si elle n'est plus visible (supprimée, autre organisation), on reste sur la
   liste des demandes. */
let _ouvertureDemandeUrl=false;
function demandeMaybeOpenFromUrl(){
  try{
    const id=new URLSearchParams(location.search).get('demande');
    if(!id)return;
    _ouvertureDemandeUrl=true;
    history.replaceState(null,'',location.pathname);
    showMain('demands');
    setTimeout(()=>{ if(cacheDemandes.some(d=>d.id===id))openThread(id); },300);
  }catch(e){console.warn('demandeMaybeOpenFromUrl',e);}
}

/* Même principe qu'enfMaybeOpenFromUrl(), pour le retour depuis le contrat
   de travail ouvert dans documents.html (bouton « Revenir à la fiche
   collaborateur/trice », qui renvoie ici via ?employe=<id>). */
function empMaybeOpenFromUrl(){
  try{
    const q=new URLSearchParams(location.search);
    const empId=q.get('employe');
    if(!empId)return;
    history.replaceState(null,'',location.pathname);
    showMain('employes');
    setTimeout(()=>editEmploye(empId),200);
  }catch(e){console.warn('empMaybeOpenFromUrl',e);}
}

function todayStr(){return ipDateToLocalISO(new Date());}
function weekStart(){const n=new Date();const day=n.getDay();const diff=n.getDate()-(day===0?6:day-1);const m=new Date(n.getFullYear(),n.getMonth(),diff+weekOffset*7);m.setHours(0,0,0,0);return m;}
function showBanner(msg,type='success'){const b=document.getElementById('notif-banner');b.style.display='';b.className='notif-banner '+type;b.innerHTML='<i class="ti ti-'+(type==='success'?'circle-check':'alert-circle')+'"></i> '+msg;setTimeout(()=>{b.style.display='none';b.className='notif-banner';},5000);}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  // Une synchro reportée pendant la saisie repartira d'elle-même : le rappel
  // court de syncDemarrer() reprend la demande en attente dès que l'écran est calme.
}

// --- MFA (TOTP) — Sécurité du compte ---
let secMfaFactorId=null;
function secMfaShowOnly(id){
  ['sec-mfa-loading','sec-mfa-not-enrolled','sec-mfa-enroll-step','sec-mfa-enrolled'].forEach(x=>{
    const el=document.getElementById(x); if(el) el.style.display = (x===id?'block':'none');
  });
}
function openSecuriteModal(){
  document.getElementById('modal-securite-wrap').classList.add('open');
  secMfaRefreshStatus();
}
async function secMfaRefreshStatus(){
  secMfaShowOnly('sec-mfa-loading');
  document.getElementById('sec-mfa-err-generic').textContent='';
  try{
    const{data,error}=await sb.auth.mfa.listFactors();
    if(error)throw error;
    const verified=(data.totp||[]).find(f=>f.status==='verified');
    if(verified){secMfaFactorId=verified.id;secMfaShowOnly('sec-mfa-enrolled');}
    else{secMfaShowOnly('sec-mfa-not-enrolled');}
  }catch(err){
    document.getElementById('sec-mfa-err-generic').textContent='Erreur lors de la vérification du statut MFA : '+err.message;
    secMfaShowOnly('sec-mfa-not-enrolled');
  }
}
async function secMfaStartEnroll(){
  document.getElementById('sec-mfa-err-generic').textContent='';
  document.getElementById('sec-mfa-err-enroll').textContent='';
  try{
    // Un enrôlement précédent annulé ou interrompu (fermeture de la modale, code expiré...)
    // peut laisser un facteur TOTP non vérifié enregistré sous le même nom, ce qui fait
    // échouer un nouvel enroll() avec "A factor with the friendly name ... already exists".
    const{data:existing,error:listError}=await sb.auth.mfa.listFactors();
    if(listError)throw listError;
    // Le SDK filtre déjà existing.totp aux facteurs "verified" uniquement — un facteur
    // non vérifié n'y apparaît jamais. Il faut chercher dans existing.all (liste brute,
    // tous statuts confondus) pour trouver les facteurs périmés à nettoyer.
    const stale=(existing.all||[]).filter(f=>f.factor_type==='totp'&&f.status!=='verified');
    for(const f of stale){
      try{await sb.auth.mfa.unenroll({factorId:f.id});}catch(err){console.warn('Nettoyage facteur MFA périmé échoué :',err.message);}
    }
    const{data,error}=await sb.auth.mfa.enroll({factorType:'totp'});
    if(error)throw error;
    secMfaFactorId=data.id;
    const qrEl=document.getElementById('sec-mfa-qr');
    qrEl.innerHTML='';
    // data.totp.qr_code est une data-URL directement utilisable comme src
    // d'<img> (c'est ce que fait l'exemple officiel Supabase) : on évite
    // toute extraction/réinjection du SVG, qui peut le corrompre.
    const img=document.createElement('img');
    img.alt='QR code MFA';
    img.style.cssText='display:block;width:232px;height:232px;object-fit:contain';
    img.src=data.totp.qr_code||'';
    qrEl.appendChild(img);
    document.getElementById('sec-mfa-secret').textContent=data.totp.secret;
    document.getElementById('sec-mfa-code').value='';
    secMfaShowOnly('sec-mfa-enroll-step');
  }catch(err){
    document.getElementById('sec-mfa-err-generic').textContent="Erreur lors du démarrage de l'enrôlement : "+err.message;
  }
}
async function secMfaConfirmEnroll(){
  const code=document.getElementById('sec-mfa-code').value.trim();
  document.getElementById('sec-mfa-err-enroll').textContent='';
  if(!/^\d{6}$/.test(code)){document.getElementById('sec-mfa-err-enroll').textContent='Le code doit contenir 6 chiffres.';return;}
  try{
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:secMfaFactorId});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:secMfaFactorId,challengeId:ch.id,code});
    if(vErr)throw vErr;
    await secMfaRefreshStatus();
  }catch(err){
    document.getElementById('sec-mfa-err-enroll').textContent='Code invalide ou expiré : '+err.message;
  }
}
async function secMfaCancelEnroll(){
  if(secMfaFactorId){try{await sb.auth.mfa.unenroll({factorId:secMfaFactorId});}catch(err){console.warn('Nettoyage annulation MFA échoué :',err.message);}}
  secMfaFactorId=null;
  await secMfaRefreshStatus();
}
async function secMfaUnenroll(){
  if(!secMfaFactorId)return;
  if(!confirm('Désactiver le MFA sur ce compte ?'))return;
  document.getElementById('sec-mfa-err-generic').textContent='';
  try{
    const{error}=await sb.auth.mfa.unenroll({factorId:secMfaFactorId});
    if(error)throw error;
    secMfaFactorId=null;
    mfaClearTrusted();
    await secMfaRefreshStatus();
  }catch(err){
    document.getElementById('sec-mfa-err-generic').textContent='Erreur lors de la désactivation : '+err.message;
  }
}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',function(e){
  if(e.target===this)this.classList.remove('open');
}));
// HUB (menu "Plus" regroupant les fonctionnalités secondaires)
function toggleHub(e){
  e.stopPropagation();
  document.getElementById('mnav-hub-panel').classList.toggle('open');
  document.getElementById('mnav-hub-btn').classList.toggle('hub-open');
}
function closeHub(){
  const p=document.getElementById('mnav-hub-panel'),b=document.getElementById('mnav-hub-btn');
  if(p)p.classList.remove('open');
  if(b)b.classList.remove('hub-open');
}
document.addEventListener('click',function(e){
  const wrap=document.getElementById('mnav-hub-wrap');
  if(wrap&&!wrap.contains(e.target))closeHub();
});
function updateHubBadge(){
  const n=(parseInt(document.getElementById('badge-incidents')?.textContent,10)||0)
    +(parseInt(document.getElementById('badge-mcm')?.textContent,10)||0)
    +(parseInt(document.getElementById('badge-stagiaires')?.textContent,10)||0);
  const b=document.getElementById('badge-hub');
  if(b){b.textContent=n;b.style.display=n>0?'':'none';}
}
function updateBadges(){
  const myCrecheId=isDirection?null:currentProfile?.creche_id;
  const inc=cacheIncidents.filter(i=>(!myCrecheId||i.creche_id===myCrecheId)&&!isIncRepas(i)&&!i.treated).length;
  const incRepas=cacheIncidents.filter(i=>(!myCrecheId||i.creche_id===myCrecheId)&&isIncRepas(i)&&!i.treated).length;
  const b=document.getElementById('badge-incidents');if(b){b.textContent=inc;b.style.display=inc>0?'':'none';}
  const bm=document.getElementById('badge-mcm');if(bm){bm.textContent=incRepas;bm.style.display=incRepas>0?'':'none';}
  updateConsigneBadge();
  updateHubBadge();
}
// Consignes non lues par la directrice technique connectée (la direction émet les consignes, donc pas de badge pour elle)
function unreadConsignesCount(){
  if(isDirection||!currentProfile?.id)return 0;
  const luIds=new Set(cacheConsignesLues.filter(x=>x.referent_id===currentProfile.id).map(x=>x.consigne_id));
  return cacheDemandes.filter(d=>d.type==='consigne'&&!luIds.has(d.id)).length;
}
function updateConsigneBadge(){
  const n=unreadConsignesCount();
  const b=document.getElementById('badge-demands');
  if(b){b.textContent=n;b.style.display=n>0?'':'none';}
}
// Marque toutes les consignes comme lues pour la directrice technique connectée
async function markConsignesRead(){
  if(isDirection||!currentProfile?.id)return;
  const luIds=new Set(cacheConsignesLues.filter(x=>x.referent_id===currentProfile.id).map(x=>x.consigne_id));
  const aMarquer=cacheDemandes.filter(d=>d.type==='consigne'&&!luIds.has(d.id));
  if(!aMarquer.length)return;
  for(const d of aMarquer){
    const saved=await dbInsert('consignes_lues',{consigne_id:d.id,referent_id:currentProfile.id});
    if(saved)cacheConsignesLues.push(saved);
    else cacheConsignesLues.push({consigne_id:d.id,referent_id:currentProfile.id}); // fallback local
  }
  updateConsigneBadge();
}

/* ACCUEIL PAR THEMES : bonjour + recopie des pastilles du menu sur les tuiles */
function accMirrorBadges(){
  ['demands','incidents','mcm','stagiaires'].forEach(function(k){
    var src=document.getElementById('badge-'+k);
    if(!src)return;
    var n=parseInt(src.textContent,10)||0;
    var visible=(n>0&&src.style.display!=='none');
    ['acc-badge-','acc-bb-'].forEach(function(pre){
      var dst=document.getElementById(pre+k);
      if(!dst)return;
      dst.textContent=n;
      dst.style.display=visible?'':'none';
    });
  });
}
/* Barre du bas : met en évidence l'écran courant (Modules pour tous les autres écrans) */
function accBottomMaj(tab){
  var cible=(['demands','planning','presence'].indexOf(tab)>=0)?tab:'accueil';
  ['accueil','demands','planning','presence'].forEach(function(k){
    var b=document.getElementById('acc-b-'+k);
    if(b)b.classList.toggle('active',k===cible);
  });
}
function accRender(){
  var el=document.getElementById('acc-hello');
  if(el){
    var pre=((currentProfile&&currentProfile.name)||'').split(' ')[0];
    el.textContent=pre?('Bonjour '+pre):'Bonjour';
  }
  accMirrorBadges();
}
function accObserveBadges(){
  if(typeof MutationObserver==='undefined')return;
  var mo=new MutationObserver(accMirrorBadges);
  ['demands','incidents','mcm','stagiaires'].forEach(function(k){
    var src=document.getElementById('badge-'+k);
    if(src)mo.observe(src,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['style']});
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',accObserveBadges);
else accObserveBadges();

function showMain(tab){
  _mainCourant=tab;
  ['accueil','demands','incidents','mcm','presence','referents','employes','planning','evenements','dashboard','fraisik','fraispro','remplacantes','ref-dashboard','vaccinations','enfants','afaire','notes','actions','reunions-equipe','stagiaires','partenaires'].forEach(t=>{
    const cont=document.getElementById('main-'+t),btn=document.getElementById('mnav-'+t);
    if(cont)cont.classList.toggle('active',t===tab);
    if(btn)btn.classList.toggle('active',t===tab);
  });
  accBottomMaj(tab);
  if(tab==='accueil')accRender();
  if(tab==='planning')renderPlanning();
  if(tab==='demands'){renderCrecheTabs();setTimeout(markConsignesRead,600);notifBellMarquerSectionLue('demands');}
  if(tab==='referents')renderReferents();
  if(tab==='employes'){renderEmployes();empChargerHeuresSemaine();}
  if(tab==='incidents')renderIncidents();
  if(tab==='mcm')mcmInit();
  if(tab==='presence'){initPresenceDate();presMajBarre();renderPresence();}
  if(tab==='evenements'){renderCalendar();notifBellMarquerSectionLue('evenements');}
  if(tab==='dashboard')renderDashboard();
  if(tab==='ref-dashboard'){
    renderRefDashboard();
    // Les actions dont la directrice technique est responsable arrivent avec un aller-
    // retour serveur : on dessine d'abord, on complète ensuite.
    if(typeof adEnsureCharge==='function')adEnsureCharge().then(()=>{try{adRenderRefDashBloc();}catch(e){}});
  }
  if(tab==='fraisik'){if(isDirection)ikInit();else showMain('ref-dashboard');}
  if(tab==='fraispro')fpInit();
  if(tab==='remplacantes')rmpInit();
  if(tab==='vaccinations')vacInit();
  if(tab==='enfants')enfInit();
  if(tab==='afaire')afInit();
  if(tab==='notes')noteInit();
  if(tab==='actions'){if(isDirection)adInit();else showMain('ref-dashboard');}
  if(tab==='reunions-equipe')reqInit();
  if(tab==='stagiaires')stgInit();
  if(tab==='partenaires')renderPartenaires();
}

// FULLSCREEN DEMANDES
function toggleDemandsFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen().catch(()=>{});
  }
}
document.addEventListener('fullscreenchange',function(){
  const isFS=!!document.fullscreenElement;
  const icon=document.getElementById('fs-icon-demands');
  if(icon){icon.className=isFS?'ti ti-arrows-minimize':'ti ti-arrows-maximize';}
  const btn=document.getElementById('btn-fs-demands');
  if(btn){btn.title=isFS?'Quitter le plein écran':'Plein écran';}
});

// DEMANDES
function demandesMasqueesIds(){
  const myId=currentUser?.id;
  return new Set(cacheDemandesMasquees.filter(m=>m.masque_par===myId).map(m=>m.demande_id));
}
function demandesTraiteesIds(){
  const myId=currentUser?.id;
  return new Set(cacheDemandesTraitees.filter(t=>t.traite_par===myId).map(t=>t.demande_id));
}
function demandesVisibles(){
  const hidden=demandesMasqueesIds();
  return hidden.size?cacheDemandes.filter(d=>!hidden.has(d.id)):cacheDemandes;
}
function renderCrecheTabs(){
  const bar=document.getElementById('creche-tabs-bar');if(!bar)return;
  if(!isDirection){activeCrecheId=currentProfile?.creche_id||null;bar.style.display='none';renderCrechePanel();return;}
  if(!cacheCreches.length){activeCrecheId=null;}
  else if(activeCrecheId!=='all'&&(!activeCrecheId||!cacheCreches.find(c=>c.id===activeCrecheId))){activeCrecheId='all';}
  let html='';
  const demandesVis=demandesVisibles();
  if(cacheCreches.length)html+='<button class="creche-tab'+(activeCrecheId==='all'?' active':'')+'" onclick="selectCreche(\'all\')"><i class="ti ti-building-community" style="font-size:13px"></i> Toutes<span class="tab-count">'+demandesVis.length+'</span></button>';
  cacheCreches.forEach(c=>{const count=demandesVis.filter(d=>d.creche_id===c.id).length;html+='<button class="creche-tab'+(activeCrecheId===c.id?' active':'')+'" onclick="selectCreche(\''+c.id+'\')"><i class="ti ti-building" style="font-size:13px"></i> '+c.name+'<span class="tab-count">'+count+'</span></button>';});
  bar.innerHTML=html;renderCrechePanel();
}
function selectCreche(id){activeCrecheId=id;activeFilter='all';searchTerm='';renderCrecheTabs();}

function renderCrechePanel(){
  const panel=document.getElementById('creche-panel');if(!panel)return;
  if(!isDirection&&!currentProfile?.creche_id){panel.innerHTML='<div class="empty-state"><i class="ti ti-building-off"></i><p>Aucune crèche associée.</p></div>';return;}
  if(isDirection&&!cacheCreches.length){panel.innerHTML='<div class="empty-state"><i class="ti ti-building-off"></i><p>Aucune crèche. Ajoutez votre première crèche.</p></div>';return;}
  const isAll=isDirection&&activeCrecheId==='all';
  const crecheId=isAll?null:(isDirection?activeCrecheId:currentProfile?.creche_id);
  const creche=crecheId?cacheCreches.find(c=>c.id===crecheId):null;
  const myId=currentProfile?.id;
  // Inclut aussi les demandes adressées personnellement (admin-à-admin ou vers un directeur technique précis), même sans crèche.
  const demandesVis0=demandesVisibles();
  const allD=isAll?demandesVis0:demandesVis0.filter(d=>d.creche_id===crecheId||(!d.creche_id&&d.to_referent_id===myId)||(d.type==='consigne'&&!d.creche_id));
  const mesTraitees=demandesTraiteesIds();
  const total=allD.length,attente=allD.filter(d=>d.status==='attente'&&!mesTraitees.has(d.id)).length,urgent=allD.filter(d=>d.priority==='urgent').length,traite=allD.filter(d=>mesTraitees.has(d.id)).length,consigneN=allD.filter(d=>d.type==='consigne').length,enCours=allD.filter(d=>!mesTraitees.has(d.id)).length,brouillonsN=cacheDemandeBrouillons.length,corbeilleN=demandesMasqueesIds().size;
  let html='';
  if(isAll){html+='<div class="creche-header-box"><div class="creche-header-name"><i class="ti ti-building-community" style="font-size:20px"></i> Toutes les crèches <span>'+cacheCreches.length+' établissements</span></div><div class="section-actions"><button class="btn-orange" onclick="openConsigneModal()"><i class="ti ti-send"></i> Envoyer une consigne</button><button class="btn-cancel" onclick="openConsigneBrouillons()" title="Consignes préparées, à envoyer plus tard" style="background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.7);font-weight:600"><i class="ti ti-file-pencil"></i> Brouillons ('+cacheConsigneBrouillons.length+')</button></div></div>';}
  else if(creche){html+='<div class="creche-header-box"><div class="creche-header-name"><i class="ti ti-building" style="font-size:20px"></i> '+creche.name+(creche.addr?'<span>'+creche.addr+'</span>':'')+(creche.capacity?'<span>Capacité : '+creche.capacity+' enfants</span>':'')+'</div><div class="section-actions">'+(isDirection?'<button class="btn-orange" onclick="openConsigneModal()"><i class="ti ti-send"></i> Envoyer une consigne</button><button class="btn-cancel" onclick="openConsigneBrouillons()" title="Consignes préparées, à envoyer plus tard" style="background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.7);font-weight:600"><i class="ti ti-file-pencil"></i> Brouillons ('+cacheConsigneBrouillons.length+')</button>':'')+'</div></div>';}
  html+='<div class="stats-row tiles">'
   +'<div class="stat-card clickable'+(activeFilter==='all'?' active':'')+'" data-filter="all" onclick="setFilter(\'all\',this)"><div class="stat-label">En cours</div><div class="stat-val cv">'+enCours+'</div></div>'
   +'<div class="stat-card clickable'+(activeFilter==='attente'?' active':'')+'" data-filter="attente" style="border-top-color:var(--orange)" onclick="setFilter(\'attente\',this)"><div class="stat-label">En attente</div><div class="stat-val co">'+attente+'</div></div>'
   +'<div class="stat-card clickable'+(activeFilter==='urgent'?' active':'')+'" data-filter="urgent" style="border-top-color:var(--red)" onclick="setFilter(\'urgent\',this)"><div class="stat-label">Urgentes</div><div class="stat-val cr">'+urgent+'</div></div>'
   +'<div class="stat-card clickable'+(activeFilter==='traite'?' active':'')+'" data-filter="traite" style="border-top-color:var(--green)" onclick="setFilter(\'traite\',this)"><div class="stat-label">Traitées</div><div class="stat-val cg">'+traite+'</div></div>'
   +'<div class="stat-card clickable'+(activeFilter==='consigne'?' active':'')+'" data-filter="consigne" style="border-top-color:var(--koala)" onclick="setFilter(\'consigne\',this)"><div class="stat-label">Consignes</div><div class="stat-val cv">'+consigneN+'</div></div>'
   +'<div class="stat-card clickable" style="border-top-color:#999" onclick="openDemandeBrouillons()" title="Demandes préparées, à envoyer plus tard"><div class="stat-label">Brouillons</div><div class="stat-val" style="color:#666">'+brouillonsN+'</div></div>'
   +(currentUser?'<div class="stat-card clickable" style="border-top-color:#999" onclick="openCorbeille()" title="Demandes que vous avez supprimées de votre liste"><div class="stat-label">Corbeille</div><div class="stat-val" style="color:#666">'+corbeilleN+'</div></div>':'')
   +'</div>';
  html+='<div class="section-header"><div class="section-left"><span class="section-title">Demandes & consignes</span><div style="position:relative"><input class="search-inp" id="search-d" type="text" placeholder="🔍 Rechercher…" value="'+searchTerm.replace(/"/g,'&quot;')+'" oninput="searchTerm=this.value;renderDemandsOnly()" autocomplete="off" style="width:240px"><span id="search-clear" style="position:absolute;right:9px;top:50%;transform:translateY(-50%);color:#bbb;font-size:13px;cursor:pointer;'+(searchTerm?'':'display:none')+'" onclick="searchTerm=\'\';document.getElementById(\'search-d\').value=\'\';renderDemandsOnly()">✕</span></div></div><div style="display:flex;gap:8px;align-items:center"><button class="ibtn-fs" id="btn-fs-demands" onclick="toggleDemandsFullscreen()" title="Plein écran"><i class="ti ti-arrows-maximize" id="fs-icon-demands"></i></button><button class="btn-primary" onclick="openDemandModal()"><i class="ti ti-plus"></i> Nouvelle demande</button></div></div>';
  html+='<div id="demands-list-inner"></div>';
  panel.innerHTML=html;renderDemandsOnly();
}

function renderDemandsOnly(){
  const inner=document.getElementById('demands-list-inner');if(!inner)return;
  const isAll=isDirection&&activeCrecheId==='all';
  const crecheId=isAll?null:(isDirection?activeCrecheId:currentProfile?.creche_id);
  const myId=currentProfile?.id;
  const term=searchTerm.toLowerCase().trim();
  const demandesVis=demandesVisibles();
  const base=term?demandesVis:(isAll?demandesVis:demandesVis.filter(d=>d.creche_id===crecheId||(!d.creche_id&&d.to_referent_id===myId)||(d.type==='consigne'&&!d.creche_id)));
  const mesTraitees=demandesTraiteesIds();
  const filtered=base.filter(d=>{
    if(!term){if(activeFilter==='all'&&mesTraitees.has(d.id))return false;if(activeFilter==='urgent'&&d.priority!=='urgent')return false;if(activeFilter==='attente'&&(d.status!=='attente'||mesTraitees.has(d.id)))return false;if(activeFilter==='traite'&&!mesTraitees.has(d.id))return false;if(activeFilter==='consigne'&&d.type!=='consigne')return false;}
    if(term){const cn=(cacheCreches.find(c=>c.id===d.creche_id)?.name||'').toLowerCase();if(!(d.subject||'').toLowerCase().includes(term)&&!(d.referent_name||'').toLowerCase().includes(term)&&!(d.description||'').toLowerCase().includes(term)&&!cn.includes(term)&&!(d.theme||'').toLowerCase().includes(term))return false;}
    return true;
  });
  const hl=str=>{if(!term||!str)return str||'';const re=new RegExp('('+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');return str.replace(re,'<mark style="background:#FFF3B0;border-radius:2px;padding:0 1px">$1</mark>');};
  let html='';
  if(!filtered.length){html=term?'<div class="empty-state"><i class="ti ti-zoom-cancel"></i><p>Aucun résultat pour "'+term+'"</p></div>':'<div class="empty-state"><i class="ti ti-inbox"></i><p>Aucune demande.</p></div>';}
  else{
    if(term)html+='<div class="info-box" style="margin-bottom:10px"><i class="ti ti-search" style="font-size:15px"></i> <strong>'+filtered.length+'</strong> demande(s) trouvée(s)</div>';
    // Regroupe les lignes issues d'un même envoi multi-destinataires en une seule carte.
    const seenG=new Set(),items=[];
    filtered.forEach(x=>{
      if(x.groupe_envoi){if(seenG.has(x.groupe_envoi))return;seenG.add(x.groupe_envoi);items.push(filtered.filter(y=>y.groupe_envoi===x.groupe_envoi));}
      else items.push([x]);
    });
    items.forEach(g=>{
      const d=g[0],grouped=g.length>1;
      const isC=d.type==='consigne';
      const crecheLabel=(cacheCreches.find(c=>c.id===d.creche_id)?.name||'');
      const dateLabel=new Date(d.created_at).toLocaleDateString('fr-FR');
      const crecheBadge=crecheLabel?'<span class="badge" style="background:#f0f0ff;color:var(--koala)"><i class="ti ti-building" style="font-size:10px"></i> '+hl(crecheLabel)+'</span>':(d.to_referent_id?'<span class="badge" style="background:#F0EDE8;color:#666"><i class="ti ti-arrow-right" style="font-size:10px"></i> Message direct</span>':'');
      const canToggle=isDirection||(d.to_referent_id&&d.to_referent_id===currentProfile?.id);
      const allTraite=g.every(x=>mesTraitees.has(x.id));
      const nbTraite=g.filter(x=>mesTraitees.has(x.id)).length;
      const idsJs=g.map(x=>"'"+x.id+"'").join(',');
      const msgCount=cacheMessages.filter(m=>m.demande_id===d.id).length;
      const peutTous=isDirection||d.referent_id===currentProfile?.id;
      const bloc=(x,nom)=>{const n=cacheMessages.filter(m=>m.demande_id===x.id).length;const bd=cacheMessageBrouillons.some(b=>b.demande_id===x.id);return '<div class="tblock" onclick="openThread(\''+x.id+'\')" title="Ouvrir le fil de discussion"><div class="tb-name"><i class="ti ti-message-2" style="font-size:12px"></i> '+escHtml(nom)+'</div><div class="tb-sub">'+(x.status==='traite'?'✅ Traitée':'⏳ En attente')+' · '+(n>0?n+' réponse'+(n>1?'s':''):'Discuter')+(bd?' · 📝 Brouillon':'')+'</div></div>';};
      const blocs='<div class="tblocks">'+(grouped?g.map(x=>bloc(x,x.referent_name||'—')).join(''):bloc(d,'Discussion'))+(grouped&&peutTous?'<button class="tball" onclick="openThread(\''+d.id+'\',true)" title="Répondre à tous les destinataires"><i class="ti ti-messages"></i> Répondre à tous</button>':'')+'</div>';
      const deNom=demandeDeNom(d)||'—';
      const aNom=grouped?g.map(x=>x.referent_name).filter(Boolean).join(', '):demandeANom(d);
      const ligneDeA='<div class="dline"><span class="dl-lbl">De</span><b>'+hl(deNom)+'</b><span class="dl-arrow">→</span><span class="dl-lbl">À</span><b>'+hl(aNom||'—')+'</b><span class="dl-date">'+dateLabel+'</span></div>';
      const statut=(isC||grouped)?'':'<div class="dfoot"><span class="badge b-'+(d.status||'attente')+'">'+(d.status==='traite'?'✅ Traitée'+(d.treated_at?' <span style="font-weight:400;opacity:0.85">le '+new Date(d.treated_at).toLocaleDateString('fr-FR')+'</span>':''):'⏳ En attente')+'</span></div>';
      html+='<div class="dcard '+(isC?'consigne':d.priority)+'"><div class="dmeta"><div class="dtop"><span class="dsubject">'+hl(d.subject)+'</span>'+(isC?'<span class="badge b-consigne"><i class="ti ti-send" style="font-size:10px"></i> Consigne</span>':'<span class="badge b-'+d.priority+'">'+(d.priority==='urgent'?'🔴 Urgent':d.priority==='info'?'ℹ️ Info':'Normal')+'</span>')+(d.theme&&!isC?'<span class="badge b-ref">'+d.theme+'</span>':'')+crecheBadge+'</div>'+ligneDeA+'<div class="dbody">'+hl(d.description||'—')+msgAttachmentHtml(msgAttList(d))+'</div>'+statut+blocs+'</div><div class="dactions">'+((!isC&&canToggle)?'<button class="ibtn" onclick="'+(grouped?'toggleStatusGroup(['+idsJs+'],'+(allTraite?'false':'true')+')':'toggleStatus(\''+d.id+'\')')+'" title="'+(grouped?(allTraite?'Remettre tout en cours dans ma liste':'Marquer traitée dans ma liste ('+nbTraite+'/'+g.length+' traitée(s))'):'')+'"><i class="ti ti-'+((grouped?allTraite:mesTraitees.has(d.id))?'rotate-clockwise':'check')+'"></i></button>':'')+(currentUser?'<button class="ibtn del" onclick="deleteDemand(\''+d.id+'\')" title="Retirer de ma liste (déplacé dans ma corbeille, reste visible des autres)"><i class="ti ti-trash"></i></button>':'')+'</div></div>';
    });
  }
  inner.innerHTML=html;
  const clr=document.getElementById('search-clear');if(clr)clr.style.display=term?'':'none';
}
function setFilter(f,el){activeFilter=f;document.querySelectorAll('.stats-row.tiles .stat-card[data-filter]').forEach(b=>b.classList.remove('active'));if(el)el.classList.add('active');renderDemandsOnly();}

/* ---------- PIÈCES JOINTES (demandes, consignes, fil de discussion) ----------
   Même bucket `assets` que Frais pro/Stagiaires : jamais de base64 en base. */
/* Plusieurs pièces jointes par message : colonne jsonb `attachments` ([{url,name}]),
   voir sql/messagerie_plusieurs_pieces_jointes.sql. attachment_url/attachment_name
   gardent la première pièce (anciennes lignes, et compatibilité). */
function msgAttList(row){
  if(!row)return[];
  if(Array.isArray(row.attachments)&&row.attachments.length)return row.attachments.filter(a=>a&&a.url);
  return row.attachment_url?[{url:row.attachment_url,name:row.attachment_name}]:[];
}
function msgAttCols(list){
  const l=list||[];
  return{attachment_url:l[0]?.url||null,attachment_name:l[0]?.name||null,attachments:l};
}
function msgAttachmentHtml(list){
  if(!list||!list.length)return'';
  return '<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">'+list.map(a=>'<a href="'+escHtml(a.url)+'" target="_blank" rel="noopener" style="font-size:12px;color:var(--koala);text-decoration:none;display:inline-flex;align-items:center;gap:4px"><i class="ti ti-paperclip"></i> '+escHtml(a.name||'Pièce jointe')+'</a>').join('')+'</div>';
}
async function msgUploadFile(file){
  try{
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    const path='messagerie/'+Date.now()+'_'+Math.random().toString(36).slice(2)+(ext?'.'+ext:'');
    const{error}=await sb.storage.from('assets').upload(path,file);
    if(error)throw error;
    const{data}=sb.storage.from('assets').getPublicUrl(path);
    return{url:data.publicUrl,name:file.name};
  }catch(e){
    console.error('[msgUploadFile]',e);
    window._lastUploadError=e.message||'inconnue';
    return null;
  }
}
/* Liste des pièces en attente d'envoi, par zone (d / c / thread), avec retrait au clic. */
const msgPending={d:[],c:[],thread:[]};
const msgPendingZone={d:'d-attach-status',c:'c-attach-status',thread:'thread-attach-status'};
function msgRenderPending(k){
  const el=document.getElementById(msgPendingZone[k]);if(!el)return;
  el.innerHTML=msgPending[k].map((a,i)=>'<div style="display:flex;align-items:center;gap:6px;margin-top:2px">📎 <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(a.name||'Pièce jointe')+'</span><button type="button" class="btn-cancel" style="padding:0 6px" title="Retirer" onclick="msgRemovePending(\''+k+'\','+i+')">✕</button></div>').join('');
}
function msgRemovePending(k,i){msgPending[k].splice(i,1);msgRenderPending(k);}
window.msgRemovePending=msgRemovePending;
function msgSetPending(k,list){msgPending[k]=(list||[]).slice();const inp=document.getElementById({d:'d-attach-input',c:'c-attach-input',thread:'thread-attach-input'}[k]);if(inp)inp.value='';msgRenderPending(k);}
async function msgHandleFiles(k,event){
  const files=[...(event.target.files||[])];event.target.value='';
  if(!files.length)return;
  const el=document.getElementById(msgPendingZone[k]);
  let echecs=0;
  for(let i=0;i<files.length;i++){
    if(el)el.insertAdjacentHTML('beforeend','<div class="msg-uploading" style="margin-top:2px">⏳ Envoi '+(i+1)+'/'+files.length+' : '+escHtml(files[i].name)+'</div>');
    const up=await msgUploadFile(files[i]);
    if(up)msgPending[k].push(up);else echecs++;
    el?.querySelectorAll('.msg-uploading').forEach(n=>n.remove());
  }
  msgRenderPending(k);
  if(echecs&&el)el.insertAdjacentHTML('beforeend','<div style="margin-top:2px">⚠ '+echecs+' fichier(s) non envoyé(s) : '+escHtml(window._lastUploadError||'erreur')+'</div>');
}
function dHandleAttachment(event){return msgHandleFiles('d',event);}
function cHandleAttachment(event){return msgHandleFiles('c',event);}
function threadHandleAttachment(event){return msgHandleFiles('thread',event);}
window.dHandleAttachment=dHandleAttachment;window.cHandleAttachment=cHandleAttachment;window.threadHandleAttachment=threadHandleAttachment;

let cacheDemandeBrouillons=[],dDraftId=null;
async function openDemandModal(draft){
  dDraftId=draft?draft.id:null;
  document.getElementById('modal-d-title').textContent=draft?'Brouillon de demande':'Nouvelle demande';
  const isAll=isDirection&&activeCrecheId==='all';
  // La crèche est toujours affichée pour la direction (utile pour les demandes liées à un directeur technique terrain),
  // mais devient optionnelle si au moins un destinataire choisi est admin (voir saveDemand()).
  const fg=document.getElementById('d-creche-fg');if(fg)fg.style.display=isDirection?'block':'none';
  if(isDirection){const sel=document.getElementById('d-creche-select');if(sel){sel.innerHTML='<option value="">-- Aucune / non liée à une crèche --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');if(!isAll&&activeCrecheId)sel.value=activeCrecheId;}}
  // Destinataires : tous les directeurs techniques ET tous les admins (direction), tout le monde mélangé dans la même liste,
  // sélectionnables un ou plusieurs à la fois (voir saveDemand() qui enregistre une demande par destinataire coché).
  const myId=currentProfile?.id;
  const dests=cacheReferents.filter(r=>r.id!==myId);
  const dList=document.getElementById('d-ref-list');
  if(dList)dList.innerHTML=dests.map(r=>{
    const isAdmin=r.role==='direction';
    const creche=cacheCreches.find(c=>c.id===r.creche_id);
    const tag=isAdmin?' — 🔑 Admin':(creche?' ('+creche.name+')':'');
    return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:3px 2px">'
      +'<input type="checkbox" class="ckDestDemand" value="'+r.id+'" data-email="'+(r.email||'')+'" data-name="'+r.name+'" data-admin="'+(isAdmin?'1':'0')+'" data-creche="'+(r.creche_id||'')+'" onchange="dRefSelectionChanged()"/>'
      +escHtml(r.name)+tag+'</label>';
  }).join('');
  document.getElementById('d-email-fg').style.display='none';
  ['d-email','d-subj','d-desc'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('d-prio').value='normal';
  msgSetPending('d',[]);
  if(draft){
    // Reprise d'un brouillon : on remet chaque champ tel qu'il a été laissé.
    const sel=document.getElementById('d-creche-select');
    if(isDirection&&sel)sel.value=draft.creche_id||'';
    const ids=new Set(Array.isArray(draft.destinataires)?draft.destinataires:[]);
    document.querySelectorAll('.ckDestDemand').forEach(ck=>{ck.checked=ids.has(ck.value);});
    dRefSelectionChanged();
    if(draft.email&&document.querySelectorAll('.ckDestDemand:checked').length===1)document.getElementById('d-email').value=draft.email;
    document.getElementById('d-subj').value=draft.subject||'';
    document.getElementById('d-desc').value=draft.description||'';
    document.getElementById('d-prio').value=draft.priority||'normal';
    if(draft.theme)document.getElementById('d-theme').value=draft.theme;
    msgSetPending('d',msgAttList(draft));
  }
  document.getElementById('modal-demand-wrap').classList.add('open');
}
/* L'e-mail ne peut être ajusté à la main que pour un seul destinataire à la
   fois (sinon on ne saurait pas à qui l'appliquer) : le champ n'apparaît que
   lorsqu'une seule case est cochée, pré-rempli avec l'e-mail connu. */
function dRefSelectionChanged(){
  const checked=[...document.querySelectorAll('.ckDestDemand:checked')];
  const fg=document.getElementById('d-email-fg');
  if(checked.length===1){
    fg.style.display='block';
    document.getElementById('d-email').value=checked[0].getAttribute('data-email')||'';
  }else{
    fg.style.display='none';
  }
}
async function saveDemand(){
  const subj=document.getElementById('d-subj').value.trim();if(!subj){alert('Sujet requis.');return;}
  const isAll=isDirection&&activeCrecheId==='all';
  const checked=[...document.querySelectorAll('.ckDestDemand:checked')];
  if(!checked.length){alert('Veuillez sélectionner au moins un destinataire.');return;}
  let crecheId=isDirection?(document.getElementById('d-creche-select')?.value||null):(isAll?null:currentProfile?.creche_id);
  if(!isDirection)crecheId=currentProfile?.creche_id||null;
  // Sans crèche choisie, chaque ligne prend la crèche de son destinataire ; on ne bloque que
  // si un destinataire non-admin n'en a aucune.
  if(!crecheId&&checked.some(c=>c.getAttribute('data-admin')!=='1'&&!c.getAttribute('data-creche'))){alert('Veuillez sélectionner une crèche, ou choisir uniquement des destinataires admin ou rattachés à une crèche.');return;}
  const btn=document.getElementById('btn-save-demand');btn.disabled=true;
  const desc=document.getElementById('d-desc').value.trim();
  const prio=document.getElementById('d-prio').value;
  const theme=document.getElementById('d-theme').value;
  const manualEmail=checked.length===1?document.getElementById('d-email').value.trim():'';
  let okCount=0;
  // Une demande à plusieurs destinataires = une ligne par personne (statut et fil propres),
  // regroupées à l'affichage via groupe_envoi (cf. sql/demandes_envoi_groupe.sql).
  const groupeEnvoi=checked.length>1?(crypto.randomUUID?crypto.randomUUID():null):null;
  const destNoms=checked.map(c=>c.getAttribute('data-name')||'').filter(Boolean).join(', ');
  for(const c of checked){
    // referent_id garde l'ÉMETTEUR de la demande (colonne jusqu'ici jamais renseignée) :
    // sans elle, une réponse du destinataire ne pouvait pas savoir à qui répondre tant
    // qu'aucun message n'existait encore dans le fil (cf. sendThreadMessage).
    const row={creche_id:crecheId||c.getAttribute('data-creche')||null,referent_id:currentProfile?.id||null,to_referent_id:c.value,referent_name:c.getAttribute('data-name')||'',referent_email:manualEmail||c.getAttribute('data-email')||'',subject:subj,description:desc,priority:prio,theme:theme,status:'attente',type:'demande',};
    Object.assign(row,msgAttCols(msgPending.d));
    if(groupeEnvoi){row.groupe_envoi=groupeEnvoi;row.destinataires_noms=destNoms;}
    const saved=await dbInsert('demandes',row);
    if(saved){
      okCount++;
      cacheDemandes.unshift(saved);
      await callFn('notify-push',{referent_ids:[row.to_referent_id],title:'Nouvelle demande',body:subj,url:'./demandes.html',tag:'demande-'+saved.id});
    }
  }
  if(okCount){
    // Le brouillon d'origine a rempli son rôle : on le retire.
    if(dDraftId){
      await dbDelete('demandes_brouillons',dDraftId);
      cacheDemandeBrouillons=cacheDemandeBrouillons.filter(b=>b.id!==dDraftId);
      dDraftId=null;
    }
    showBanner(okCount>1?'Demande envoyée à '+okCount+' destinataires !':'Demande enregistrée !');closeModal('modal-demand-wrap');renderCrecheTabs();
  }
  if(okCount<checked.length)showBanner('Certains envois ont échoué.','error');
  btn.disabled=false;
}
/* Brouillons de demandes : préparées ici, envoyées plus tard. Table à part
   (sql/demandes_brouillons.sql), lisible par son seul auteur. Les destinataires
   cochés sont gardés (ids) ; à l'envoi, saveDemand() crée une demande par destinataire. */
async function saveDemandeBrouillon(){
  const subj=document.getElementById('d-subj').value.trim(),desc=document.getElementById('d-desc').value.trim();
  const ids=[...document.querySelectorAll('.ckDestDemand:checked')].map(c=>c.value);
  if(!subj&&!desc&&!ids.length){alert("Renseignez au moins un destinataire, un sujet ou une description avant d'enregistrer le brouillon.");return;}
  const btn=document.getElementById('btn-draft-demand');btn.disabled=true;
  const row={
    creche_id:isDirection?(document.getElementById('d-creche-select')?.value||null):null,
    destinataires:ids,
    email:ids.length===1?(document.getElementById('d-email').value.trim()||null):null,
    subject:subj||null,description:desc||null,
    priority:document.getElementById('d-prio').value,
    theme:document.getElementById('d-theme').value,
    ...msgAttCols(msgPending.d),
    updated_at:new Date().toISOString()
  };
  let ok=false;
  if(dDraftId){
    ok=await dbUpdate('demandes_brouillons',dDraftId,row);
    if(ok)cacheDemandeBrouillons=cacheDemandeBrouillons.map(b=>b.id===dDraftId?Object.assign({},b,row):b);
  }else{
    const saved=await dbInsert('demandes_brouillons',Object.assign({created_by:currentUser.id},row));
    if(saved){ok=true;cacheDemandeBrouillons.unshift(saved);}
  }
  btn.disabled=false;
  if(!ok){showBanner('Brouillon non enregistré'+(window._lastDbError?' : '+window._lastDbError:'')+'. La table demandes_brouillons existe-t-elle ?','error');return;}
  dDraftId=null;
  cacheDemandeBrouillons.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  closeModal('modal-demand-wrap');
  showBanner('Brouillon enregistré');
  renderCrecheTabs();
}
function openDemandeBrouillons(){
  let ov=document.getElementById('modal-dbrouillons-wrap');
  if(!ov){
    ov=document.createElement('div');
    ov.className='overlay';ov.id='modal-dbrouillons-wrap';
    ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-dbrouillons-wrap');};
    ov.innerHTML='<div class="modal" style="max-width:520px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">'
      +'<h3 style="margin:0"><i class="ti ti-file-pencil"></i> Brouillons de demandes</h3>'
      +'<button class="btn-cancel" onclick="closeModal(\'modal-dbrouillons-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
      +'<div id="dbrouillons-liste"></div></div>';
    document.body.appendChild(ov);
  }
  renderDemandeBrouillons();
  ov.classList.add('open');
}
function renderDemandeBrouillons(){
  const box=document.getElementById('dbrouillons-liste');
  if(!box)return;
  if(!cacheDemandeBrouillons.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-file-pencil"></i><p>Aucun brouillon.<br><span style="font-size:12px">Dans « Nouvelle demande », le bouton « Enregistrer en brouillon » garde une demande à envoyer plus tard.</span></p></div>';
    return;
  }
  box.innerHTML=cacheDemandeBrouillons.map(function(b){
    const quand=b.updated_at?new Date(b.updated_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    const ids=Array.isArray(b.destinataires)?b.destinataires:[];
    const noms=ids.map(id=>(cacheReferents.find(r=>r.id===id)||{}).name).filter(Boolean);
    const dest=noms.length?('À '+noms.slice(0,3).join(', ')+(noms.length>3?' +'+(noms.length-3):'')):'Sans destinataire';
    const apercu=String(b.description||'').slice(0,100);
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:8px"><b style="flex:1;font-size:13.5px">'+escHtml(b.subject||'(sans sujet)')+'</b>'
      +(b.priority==='urgent'?'<span class="badge b-consigne">Urgente</span>':'')+'</div>'
      +'<div style="font-size:12px;color:var(--muted);margin:3px 0 0">'+escHtml(dest)+'</div>'
      +'<div style="font-size:12px;color:var(--muted);margin:2px 0 8px">'+escHtml(apercu)+(String(b.description||'').length>100?'…':'')+(msgAttList(b).length?' · 📎 '+msgAttList(b).map(a=>escHtml(a.name||'Pièce jointe')).join(', '):'')+'</div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--muted);flex:1">Modifié le '+escHtml(quand)+'</span>'
      +'<button class="btn-cancel" data-id="'+b.id+'" onclick="deleteDemandeBrouillon(this.dataset.id)"><i class="ti ti-trash"></i> Supprimer</button>'
      +'<button class="btn-primary" data-id="'+b.id+'" onclick="reprendreDemandeBrouillon(this.dataset.id)"><i class="ti ti-edit"></i> Reprendre</button></div></div>';
  }).join('');
}
async function reprendreDemandeBrouillon(id){
  const b=cacheDemandeBrouillons.find(x=>x.id===id);
  if(!b)return;
  closeModal('modal-dbrouillons-wrap');
  await openDemandModal(b);
}
async function deleteDemandeBrouillon(id){
  if(!confirm('Supprimer ce brouillon ?'))return;
  if(!await dbDeleteStrict('demandes_brouillons',id)){showBanner('Suppression impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
  cacheDemandeBrouillons=cacheDemandeBrouillons.filter(b=>b.id!==id);
  renderDemandeBrouillons();
  renderCrecheTabs();
}
async function toggleStatus(id){
  const myId=currentUser?.id;if(!myId)return;
  const d=cacheDemandes.find(x=>x.id===id);
  const ligne=cacheDemandesTraitees.find(t=>t.demande_id===id&&t.traite_par===myId);
  const traiter=!ligne;
  // 1) Mon état personnel : seul lui décide si la carte quitte MA liste « En cours ».
  if(traiter){
    const row=await dbInsert('demandes_traitees',{demande_id:id,traite_par:myId});
    if(!row){showBanner('Mise à jour impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
    cacheDemandesTraitees.push(row);
  }else{
    if(!await dbDeleteStrict('demandes_traitees',ligne.id)){showBanner('Mise à jour impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
    cacheDemandesTraitees=cacheDemandesTraitees.filter(t=>t.id!==ligne.id);
  }
  // 2) État partagé vu de l'expéditeur (badge « Traitée », notifications) : mis à jour
  //    uniquement quand c'est le destinataire (ou la direction) qui agit, et seulement s'il change.
  const newStatus=traiter?'traite':'attente';
  if(d&&d.status!==newStatus){
    const updates={status:newStatus,treated_at:traiter?new Date().toISOString():null};
    if(await dbUpdate('demandes',id,updates)){
      Object.assign(d,updates);
      if(d.to_referent_id){await callFn('notify-push',{referent_ids:[d.to_referent_id],title:traiter?'Demande traitée':'Demande remise en attente',body:d.subject||'',url:'./demandes.html',tag:'statut-'+id});}
    }
  }
  showBanner('Statut mis à jour !');renderDemandsOnly();renderCrecheTabs();
}
async function toggleStatusGroup(ids,traiter){
  const mes=demandesTraiteesIds();
  for(const id of ids){
    if(mes.has(id)!==traiter)await toggleStatus(id);
  }
}
async function deleteDemand(id){
  if(!confirm('Retirer cette demande de votre liste ? Elle restera visible des autres et vous pourrez la restaurer depuis la corbeille.'))return;
  const myId=currentUser?.id;if(!myId)return;
  // Une demande envoyée à plusieurs destinataires est retirée en un bloc.
  const d0=cacheDemandes.find(x=>x.id===id);
  const ids=d0?.groupe_envoi?cacheDemandes.filter(x=>x.groupe_envoi===d0.groupe_envoi).map(x=>x.id):[id];
  for(const did of ids){
    if(cacheDemandesMasquees.some(m=>m.demande_id===did&&m.masque_par===myId))continue;
    const row=await dbInsert('demandes_masquees',{demande_id:did,masque_par:myId});
    if(!row){showBanner('Suppression impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
    cacheDemandesMasquees.push(row);
  }
  renderDemandsOnly();renderCrecheTabs();
}
async function restoreDemand(id){
  const myId=currentUser?.id;if(!myId)return;
  const row=cacheDemandesMasquees.find(m=>m.demande_id===id&&m.masque_par===myId);
  if(!row)return;
  if(!await dbDeleteStrict('demandes_masquees',row.id)){showBanner('Restauration impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
  cacheDemandesMasquees=cacheDemandesMasquees.filter(m=>m.id!==row.id);
  renderDemandsOnly();renderCrecheTabs();renderCorbeille();
}
async function permanentlyDeleteDemand(id){
  if(!isDirection)return;
  if(!confirm('Supprimer définitivement cette demande pour tout le monde ? Cette action est irréversible.'))return;
  if(!await dbDeleteStrict('demandes',id)){showBanner('Suppression impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
  cacheDemandes=cacheDemandes.filter(d=>d.id!==id);
  cacheDemandesMasquees=cacheDemandesMasquees.filter(m=>m.demande_id!==id);
  cacheMessages=cacheMessages.filter(m=>m.demande_id!==id);
  renderDemandsOnly();renderCrecheTabs();renderCorbeille();
}
function openCorbeille(){
  let ov=document.getElementById('modal-corbeille-wrap');
  if(!ov){
    ov=document.createElement('div');
    ov.className='overlay';ov.id='modal-corbeille-wrap';
    ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-corbeille-wrap');};
    ov.innerHTML='<div class="modal" style="max-width:520px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">'
      +'<h3 style="margin:0"><i class="ti ti-trash"></i> Corbeille</h3>'
      +'<button class="btn-cancel" onclick="closeModal(\'modal-corbeille-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
      +'<div id="corbeille-liste"></div></div>';
    document.body.appendChild(ov);
  }
  renderCorbeille();
  ov.classList.add('open');
}
function renderCorbeille(){
  const box=document.getElementById('corbeille-liste');
  if(!box)return;
  const myId=currentUser?.id;
  const mesMasquees=cacheDemandesMasquees.filter(m=>m.masque_par===myId).sort((a,b)=>new Date(b.masque_at)-new Date(a.masque_at));
  if(!mesMasquees.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-trash"></i><p>Corbeille vide.<br><span style="font-size:12px">Les demandes que vous supprimez de votre liste apparaissent ici, sans être effacées pour les autres.</span></p></div>';
    return;
  }
  box.innerHTML=mesMasquees.map(function(m){
    const d=cacheDemandes.find(x=>x.id===m.demande_id);
    if(!d)return '';
    const quand=m.masque_at?new Date(m.masque_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    const apercu=String(d.description||'').slice(0,100);
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:8px"><b style="flex:1;font-size:13.5px">'+escHtml(d.subject||'(sans sujet)')+'</b></div>'
      +'<div style="font-size:12px;color:var(--muted);margin:2px 0 8px">'+escHtml(apercu)+(String(d.description||'').length>100?'…':'')+'</div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--muted);flex:1">Retirée de votre liste le '+escHtml(quand)+'</span>'
      +(isDirection?'<button class="btn-cancel" data-id="'+d.id+'" onclick="permanentlyDeleteDemand(this.dataset.id)"><i class="ti ti-trash-x"></i> Supprimer définitivement</button>':'')
      +'<button class="btn-primary" data-id="'+d.id+'" onclick="restoreDemand(this.dataset.id)"><i class="ti ti-arrow-back-up"></i> Restaurer</button></div></div>';
  }).join('');
}

// Expéditeur / destinataire d'une demande (referent_id = émetteur, to_referent_id = destinataire).
function demandeDeNom(d){return(cacheReferents.find(r=>r.id===d.referent_id)||{}).name||'';}
function demandeANom(d){return d.destinataires_noms||d.referent_name||(cacheReferents.find(r=>r.id===d.to_referent_id)||{}).name||'';}
// Pour un message du fil : l'autre partie de la conversation.
function messageANom(m,d){
  if(m.author_id&&d.referent_id&&m.author_id===d.referent_id){
    // L'expéditeur écrit dans ce fil : il s'adresse à ce destinataire seulement…
    const noms=[d.referent_name||(cacheReferents.find(r=>r.id===d.to_referent_id)||{}).name||''];
    // …sauf « Répondre à tous » : même texte posté au même moment dans les fils frères.
    const t=new Date(m.created_at).getTime();
    demandesDuGroupe(d).forEach(x=>{
      if(x.id===d.id)return;
      const jumeau=cacheMessages.some(y=>y.demande_id===x.id&&y.author_id===m.author_id&&(y.body||'')===(m.body||'')&&Math.abs(new Date(y.created_at).getTime()-t)<60000);
      if(jumeau)noms.push(x.referent_name||'');
    });
    return noms.filter(Boolean).join(', ');
  }
  return demandeDeNom(d);
}
function deAHtml(de,a){return '<div class="tdea" style="font-size:11px;font-weight:400;color:#777;margin-bottom:2px"><b>De :</b> '+escHtml(de||'—')+' &nbsp; <b>À :</b> '+escHtml(a||'—')+'</div>';}
// Autres lignes issues du même envoi multi-destinataires (une ligne par destinataire).
function demandesDuGroupe(d){return d&&d.groupe_envoi?cacheDemandes.filter(x=>x.groupe_envoi===d.groupe_envoi):(d?[d]:[]);}
function majRepondreATous(d,coche){
  const grp=demandesDuGroupe(d);
  const wrap=document.getElementById('thread-all-wrap');
  // Proposé à l'émetteur (ou à la direction) d'un envoi à plusieurs destinataires.
  const ok=grp.length>1&&(d.referent_id===currentProfile?.id||isDirection);
  wrap.style.display=ok?'flex':'none';
  document.getElementById('thread-all').checked=!!(ok&&coche);
  if(ok)document.getElementById('thread-all-label').textContent='Répondre à tous ('+grp.map(x=>x.referent_name).filter(Boolean).join(', ')+')';
}
// FIL DE DISCUSSION
let currentThreadId=null;
function openThread(demandId,repondreATous){
  const d=cacheDemandes.find(x=>x.id===demandId);if(!d)return;
  currentThreadId=demandId;
  document.getElementById('thread-subject').textContent=d.subject||'Discussion';
  const crecheLabel=cacheCreches.find(c=>c.id===d.creche_id)?.name||'';
  const ctx=[crecheLabel,d.referent_name?'À '+d.referent_name:''].filter(Boolean).join(' · ');
  document.getElementById('thread-context').textContent=ctx;
  const origAuthor=d.referent_name||'Demande initiale';
  document.getElementById('thread-orig').innerHTML='<div class="torig"><div style="font-weight:700;font-size:11px;color:#B08900;margin-bottom:4px">📌 '+escHtml(d.subject)+'</div>'+deAHtml(demandeDeNom(d),demandeANom(d))+escHtml(d.description||'—')+'<div style="font-size:10.5px;color:#aaa;margin-top:6px">'+new Date(d.created_at).toLocaleString('fr-FR')+'</div></div>';
  document.getElementById('thread-input').value='';
  msgSetPending('thread',[]);
  // Réponse préparée plus tôt pour ce fil : on la remet dans la zone de saisie.
  const bd=msgBrouillonDe(demandId);
  document.getElementById('thread-draft-note').style.display=bd?'block':'none';
  if(bd){
    document.getElementById('thread-input').value=bd.body||'';
    msgSetPending('thread',msgAttList(bd));
  }
  majRepondreATous(d,repondreATous);
  renderThread();
  document.getElementById('modal-thread-wrap').classList.add('open');
  setTimeout(()=>document.getElementById('thread-input').focus(),100);
}
function renderThread(){
  const box=document.getElementById('thread-messages');
  const msgs=cacheMessages.filter(m=>m.demande_id===currentThreadId).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  if(!msgs.length){box.innerHTML='<div style="text-align:center;color:#bbb;font-size:12.5px;padding:14px 0">Aucune réponse pour l\'instant. Lancez la discussion 👇</div>';return;}
  const myId=currentProfile?.id;
  const dd=cacheDemandes.find(x=>x.id===currentThreadId)||{};
  box.innerHTML=msgs.map(m=>{
    const mine=m.author_id===myId;
    return '<div class="tmsg'+(mine?' mine':'')+'"><div class="tauthor">'+deAHtml(m.author_name,messageANom(m,dd))+'</div><div class="tbubble">'+linkify(escHtml(m.body||''))+msgAttachmentHtml(msgAttList(m))+'</div><div class="ttime">'+new Date(m.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div></div>';
  }).join('');
  box.scrollTop=box.scrollHeight;
}
/* Brouillons de messages : une réponse préparée par fil et par personne, gardée dans
   `messages_brouillons` (sql/messages_brouillons.sql), lisible par son seul auteur.
   Reprise automatique à la réouverture du fil ; pastille « Brouillon » sur la demande. */
let cacheMessageBrouillons=[];
function msgBrouillonDe(demandeId){return cacheMessageBrouillons.find(b=>b.demande_id===demandeId)||null;}
async function saveMessageBrouillon(){
  const body=document.getElementById('thread-input').value.trim();
  if((!body&&!msgPending.thread.length)||!currentThreadId){alert("Écrivez d'abord un message à garder en brouillon.");return;}
  const btn=document.getElementById('btn-draft-msg');btn.disabled=true;
  const row={body:body||null,...msgAttCols(msgPending.thread),updated_at:new Date().toISOString()};
  const existant=msgBrouillonDe(currentThreadId);
  let ok=false;
  if(existant){
    ok=await dbUpdate('messages_brouillons',existant.id,row);
    if(ok)cacheMessageBrouillons=cacheMessageBrouillons.map(b=>b.id===existant.id?Object.assign({},b,row):b);
  }else{
    const saved=await dbInsert('messages_brouillons',Object.assign({demande_id:currentThreadId,created_by:currentUser.id},row));
    if(saved){ok=true;cacheMessageBrouillons.push(saved);}
  }
  btn.disabled=false;
  if(!ok){showBanner('Brouillon non enregistré'+(window._lastDbError?' : '+window._lastDbError:'')+'. La table messages_brouillons existe-t-elle ?','error');return;}
  closeModal('modal-thread-wrap');
  showBanner('Brouillon enregistré');
  renderDemandsOnly();
}
