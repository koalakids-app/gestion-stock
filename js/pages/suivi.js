/* Hauteur réelle en JS plutôt que vh/dvh : sur certains Android/Chrome,
   avec body en overflow:hidden (pas de scroll de page), la hauteur
   calculée par ces unités CSS peut ne pas correspondre à la zone
   réellement visible (barre d'adresse comprise), ce qui bloque le
   scroll des listes internes sans qu'aucune règle CSS ne le révèle. */
let derniereHauteurVp=0;
function ajusterHauteurViewport(){
  const h=Math.round(window.visualViewport?window.visualViewport.height:window.innerHeight);
  if(h===derniereHauteurVp)return; // évite de forcer un reflow pendant un scroll interne
  derniereHauteurVp=h;
  document.documentElement.style.setProperty('--vh-px',h+'px');
}
ajusterHauteurViewport();
window.addEventListener('resize',ajusterHauteurViewport);
window.addEventListener('orientationchange',ajusterHauteurViewport);
if(window.visualViewport)window.visualViewport.addEventListener('resize',ajusterHauteurViewport);

const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const TOKEN=new URLSearchParams(location.search).get('k')||'';
const ENFANT_PARAM=new URLSearchParams(location.search).get('enfant')||'';

/* Deux clients distincts, jamais mélangés :
   - mode tablette (TOKEN présent) : strictement anonyme, sans persistance —
     une tablette qui aurait aussi servi une fois à se connecter en mode
     ordinateur ne doit jamais réutiliser cette session pour les appels
     kiosque (sinon un jeton de session périmé peut faire échouer même les
     appels anonymes, ex. "Tablette non configurée" à tort).
   - mode ordinateur (pas de TOKEN) : session persistée, nécessaire pour que
     la connexion et la double authentification survivent au rechargement
     de page.
   Le rôle et les droits sont les mêmes (anon key) ; seule la persistance
   diffère. */
const sb = (TOKEN && TOKEN.length>=20)
  ? supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
  : supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Dates locales, jamais toISOString().slice(0,10) */
function ipDateToLocalISO(d){
  d=d||new Date();
  const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}

const app=document.getElementById('app');
const btnAuteur=document.getElementById('btnAuteur');

/* Identification : une fois par session tablette (pas à chaque geste, sinon
   impossible de tenir les <10s/3 touchers). On choisit son nom dans la liste
   du personnel déjà pointé arrivé — pas de code à taper. Stockée en mémoire
   seulement (jamais en localStorage : redémarrage de la tablette =
   ré-identification). Chaque écriture revérifie côté serveur que la
   personne est bien présente, indépendamment de ce que montre cette liste. */
let AUTEUR_TYPE=null;
let AUTEUR_ID=null;
let AUTEUR_LABEL='';

let ENFANTS=[];
let JALONS=[];
let selection=new Set();
let ecran='grille';
let enfantJalons=null;
let lastBatch=null; // {table, ids:[...]}
let toastTimer=null;

/* File d'attente hors-ligne : un item par action qui a échoué faute de
   réseau. Rejouée dès que le navigateur repasse en ligne. */
const QUEUE_KEY='suivi_queue_'+TOKEN;
function queueLire(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');}catch(e){return [];}}
function queueEcrire(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q));}catch(e){}}
function queueAjouter(item){const q=queueLire();q.push(item);queueEcrire(q);}
async function queueRejouer(){
  const q=queueLire();
  if(!q.length)return;
  const restants=[];
  for(const item of q){
    const{error}=await sb.rpc(item.fn,item.args);
    if(error)restants.push(item);
  }
  queueEcrire(restants);
  if(restants.length!==q.length)chargerEnfants();
}
window.addEventListener('online',queueRejouer);

/* ---- horloge ---- */
function tickClock(){
  const d=new Date();
  document.getElementById('clock').textContent=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  document.getElementById('date').textContent=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
}
tickClock();setInterval(tickClock,1000);

/* ---- démarrage ---- */
(async function init(){
  if(TOKEN&&TOKEN.length>=20){
    const{data:crecheId,error}=await sb.rpc('kk_resolve_creche_id',{p_token:TOKEN});
    if(error||!crecheId){
      /* Détail technique affiché temporairement (diagnostic) : le message
         générique seul ne dit pas si c'est un token introuvable, une
         erreur réseau, ou une erreur d'API — on en a besoin pour
         diagnostiquer un cas où tout est pourtant correct en base. */
      const detail=error?(error.message||JSON.stringify(error)):'crecheId vide (token introuvable ou inactif)';
      app.innerHTML='<i class="ti ti-alert-triangle"></i><h2>Tablette non configurée</h2><p style="color:var(--muted);font-size:13px">Contactez la direction pour reconfigurer cet appareil.</p>'
        +'<p style="color:var(--err);font-size:11px;margin-top:10px;word-break:break-all;max-width:320px">'+esc(detail)+'</p>';
      return;
    }
    afficherIdentification();
    return;
  }
  /* Pas de token = poste ordinateur, mode direction/référente authentifié. */
  app.classList.add('hidden');
  bootOrdinateur();
})();

/* ============================================================================
   MODE ORDINATEUR (direction / référente) — connexion, MFA, synthèse du jour
   ============================================================================ */
let ME=null, PROF=null, IS_DIRECTION=false;
let CRECHES_ORDI=[];
let dateChoisie=ipDateToLocalISO();
let enfantChoisiId=null;

async function bootOrdinateur(){
  const{data:{session}}=await sb.auth.getSession();
  if(!session){showLoginView();return;}
  ME=session.user;
  const{data:p}=await sb.from('referents').select('*').eq('user_id',ME.id).maybeSingle();
  if(!p){alert('Profil introuvable. Contactez la direction.');await sb.auth.signOut();location.reload();return;}
  PROF=p;IS_DIRECTION=(p.role==='direction');
  if(window.KKBranding)KKBranding.applyBranding(sb);
  await mfaGateCheckAndProceed();
}
function showLoginView(msg){
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='block';
  document.getElementById('mfaGateBox').style.display='none';
  if(msg)document.getElementById('liErr').textContent=msg;
}
async function doLogin(){
  const e=document.getElementById('liMail').value.trim(),p=document.getElementById('liPwd').value;
  const{error}=await sb.auth.signInWithPassword({email:e,password:p});
  if(error){document.getElementById('liErr').textContent='Identifiants incorrects';return;}
  location.reload();
}
window.doLogin=doLogin;

/* Mémorisation de l'appareil : évite de redemander le code à chaque
   reconnexion sur le même navigateur, en le limitant à 24h glissantes.
   Stocké en localStorage (propre à ce navigateur/appareil), pas en base :
   ne dispense donc jamais du mot de passe, seulement du code à 6 chiffres.
   Même mécanique que collaborateur.html/contrats.html/inscriptions.html. */
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

/* ---- MFA gate (repris à l'identique d'infirmerie.html, + mémorisation 24h) ---- */
function mfaGateSwitchView(id){
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='none';
  document.getElementById('mfaGateBox').style.display='block';
  ['mfaGateChallengeView','mfaGateEnrollView'].forEach(v=>{
    document.getElementById(v).style.display=(v===id?'block':'none');
  });
}
async function mfaGateCheckAndProceed(){
  try{
    const{data,error}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error)throw error;
    if(data.currentLevel==='aal2'){await ordinateurGrantAccess();return;}
    if(data.nextLevel==='aal2'){
      if(mfaIsTrusted()){await ordinateurGrantAccess();return;}
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
    for(const f of stale){try{await sb.auth.mfa.unenroll({factorId:f.id});}catch(e){}}
    const{data,error}=await sb.auth.mfa.enroll({factorType:'totp'});
    if(error)throw error;
    mfaGateFactorId=data.id;
    const qrEl=document.getElementById('mfaGateQr');
    qrEl.innerHTML='';
    const qr=data.totp.qr_code||'';
    const svgMatch=qr.match(/<svg[\s\S]*<\/svg>/i);
    if(svgMatch){qrEl.innerHTML=svgMatch[0];const svg=qrEl.querySelector('svg');if(svg){svg.style.width='180px';svg.style.height='180px';}}
    else{const img=document.createElement('img');img.alt='QR code MFA';img.style.cssText='display:block;width:180px;height:180px;object-fit:contain';img.src=qr;qrEl.appendChild(img);}
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
    await ordinateurGrantAccess();
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
    mfaMarkTrusted();
    await ordinateurGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateCancel(){
  if(mfaGateFactorId){try{await sb.auth.mfa.unenroll({factorId:mfaGateFactorId});}catch(e){}}
  mfaGateFactorId=null;
  try{await sb.auth.signOut();}catch(e){}
  showLoginView();
}
window.mfaGateVerifyChallenge=mfaGateVerifyChallenge;
window.mfaGateConfirmEnroll=mfaGateConfirmEnroll;
window.mfaGateCancel=mfaGateCancel;

let crecheCibleParam=null;
async function ordinateurGrantAccess(){
  if(typeof kkLoginAlertCheck==='function')kkLoginAlertCheck(sb);
  document.getElementById('loginView').style.display='none';
  document.getElementById('appOrdi').classList.remove('hidden');
  const{data:cr}=await sb.from('creches').select('id,name').order('name');
  CRECHES_ORDI=cr||[];
  await chargerJalonsRef();
  /* Lien direct depuis la fiche enfant (?enfant=<id>) : on retrouve sa
     crèche pour présélectionner le bon onglet avant de charger la liste. */
  if(ENFANT_PARAM){
    const{data:cible}=await sb.from('enfants').select('id,creche_id').eq('id',ENFANT_PARAM).maybeSingle();
    if(cible){enfantChoisiId=cible.id;crecheCibleParam=cible.creche_id;}
  }
  renderOrdiShell();
}

/* ============================================================================
   ÉCRAN : synthèses (jour / semaine / mois / année)
   ============================================================================ */
let PERIODE_TYPE='jour';
let valeurPeriode={jour:dateChoisie,semaine:isoWeekValue(new Date()),mois:dateChoisie.slice(0,7),annee:String(anneeRentreeCourante())};

function anneeRentreeCourante(){
  const d=new Date();
  return d.getMonth()>=8 ? d.getFullYear() : d.getFullYear()-1; // rentrée de septembre
}
/* Numéro de semaine ISO 8601 (lundi-dimanche), format <input type="week">. */
function isoWeekValue(d){
  const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=(date.getUTCDay()+6)%7;
  date.setUTCDate(date.getUTCDate()-dayNum+3);
  const firstThursday=new Date(Date.UTC(date.getUTCFullYear(),0,4));
  const diffDays=Math.round((date-firstThursday)/86400000-3+((firstThursday.getUTCDay()+6)%7));
  const week=1+Math.round(diffDays/7);
  return date.getUTCFullYear()+'-W'+String(week).padStart(2,'0');
}
function fmtLocale(d){return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
function semaineBornes(v){
  if(!v)return null;
  const[yStr,wStr]=v.split('-W');
  const year=+yStr,week=+wStr;
  const simple=new Date(Date.UTC(year,0,1+(week-1)*7));
  const dow=simple.getUTCDay()||7;
  const monday=new Date(simple);monday.setUTCDate(simple.getUTCDate()+1-dow);
  const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);
  return{debut:fmtLocale(monday),fin:fmtLocale(sunday)};
}
function moisBornes(v){
  if(!v)return null;
  const[y,m]=v.split('-').map(Number);
  const debut=y+'-'+String(m).padStart(2,'0')+'-01';
  const dernierJour=new Date(y,m,0).getDate();
  return{debut,fin:y+'-'+String(m).padStart(2,'0')+'-'+String(dernierJour).padStart(2,'0')};
}
function anneeBornes(v){
  const y=parseInt(v,10);
  return{debut:y+'-09-01',fin:(y+1)+'-08-31'};
}
function periodeBornes(){
  if(PERIODE_TYPE==='jour')return{debut:valeurPeriode.jour,fin:valeurPeriode.jour};
  if(PERIODE_TYPE==='semaine')return semaineBornes(valeurPeriode.semaine);
  if(PERIODE_TYPE==='mois')return moisBornes(valeurPeriode.mois);
  return anneeBornes(valeurPeriode.annee);
}
function libellePeriode(debut,fin){
  const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  if(PERIODE_TYPE==='jour')return new Date(debut+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  if(PERIODE_TYPE==='semaine'){const w=(valeurPeriode.semaine||'').split('-W')[1];return 'Semaine du '+fmt(debut)+' au '+fmt(fin)+(w?' (S'+parseInt(w,10)+')':'');}
  if(PERIODE_TYPE==='mois')return new Date(debut+'T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  return 'Année '+debut.slice(0,4)+'-'+fin.slice(0,4);
}

let ordiVue='syntheses';

function renderOrdiShell(){
  const wrap=document.getElementById('appOrdi');
  wrap.innerHTML=`
    <div class="ordi-top">
      <span class="title"><i class="ti ti-heart-handshake"></i> Suivi</span>
      ${IS_DIRECTION?`
        <div class="ordi-nav">
          <button class="ordi-nav-btn${ordiVue==='syntheses'?' on':''}" id="navSyntheses">Synthèses</button>
          <button class="ordi-nav-btn${ordiVue==='referentiel'?' on':''}" id="navReferentiel">Référentiel</button>
        </div>`:''}
      <span id="ordiOutils"></span>
      <button class="btn btn-g" style="background:#F1EFF7;color:var(--muted);margin-left:auto" onclick="sb.auth.signOut().then(()=>location.reload())"><i class="ti ti-logout"></i> Déconnexion</button>
    </div>
    <div id="ordiContenu"></div>`;
  if(IS_DIRECTION){
    document.getElementById('navSyntheses').addEventListener('click',()=>{ordiVue='syntheses';renderOrdiShell();});
    document.getElementById('navReferentiel').addEventListener('click',()=>{ordiVue='referentiel';renderOrdiShell();});
  }
  if(ordiVue==='referentiel'&&IS_DIRECTION){renderOrdiReferentiel();return;}
  renderOrdiSyntheses();
}

function renderOrdiSyntheses(){
  const outils=document.getElementById('ordiOutils');
  outils.innerHTML=`
    ${IS_DIRECTION?`<select id="ordiCreche"></select>`:''}
    <select id="ordiPeriodeType">
      <option value="jour">Jour</option>
      <option value="semaine">Semaine</option>
      <option value="mois">Mois</option>
      <option value="annee">Année</option>
    </select>
    <span id="ordiPeriodeValeurWrap"></span>`;
  document.getElementById('ordiContenu').innerHTML=`
    <div class="ordi-body">
      <div class="ordi-liste" id="ordiListe"></div>
      <div class="ordi-detail" id="ordiDetail"><div class="ordi-empty">Sélectionnez un enfant.</div></div>
    </div>`;
  if(IS_DIRECTION){
    const sel=document.getElementById('ordiCreche');
    sel.innerHTML=CRECHES_ORDI.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value=crecheCibleParam||PROF.creche_id||CRECHES_ORDI[0]?.id||'';
    sel.addEventListener('change',chargerListeOrdi);
  }
  document.getElementById('ordiPeriodeType').value=PERIODE_TYPE;
  document.getElementById('ordiPeriodeType').addEventListener('change',e=>{PERIODE_TYPE=e.target.value;renderPeriodeValeur();chargerListeOrdi();});
  renderPeriodeValeur();
  chargerListeOrdi();
}

function renderPeriodeValeur(){
  const wrap=document.getElementById('ordiPeriodeValeurWrap');
  if(PERIODE_TYPE==='jour'){
    wrap.innerHTML=`<input type="date" id="ordiValeur" value="${valeurPeriode.jour}" max="${ipDateToLocalISO()}">`;
  }else if(PERIODE_TYPE==='semaine'){
    wrap.innerHTML=`<input type="week" id="ordiValeur" value="${valeurPeriode.semaine}">`;
  }else if(PERIODE_TYPE==='mois'){
    wrap.innerHTML=`<input type="month" id="ordiValeur" value="${valeurPeriode.mois}">`;
  }else{
    const courante=anneeRentreeCourante();
    const options=[];
    for(let y=courante;y>=courante-4;y--)options.push(y);
    wrap.innerHTML=`<select id="ordiValeur">${options.map(y=>`<option value="${y}"${String(y)===valeurPeriode.annee?' selected':''}>${y}-${y+1}</option>`).join('')}</select>`;
  }
  document.getElementById('ordiValeur').addEventListener('change',e=>{valeurPeriode[PERIODE_TYPE]=e.target.value;chargerListeOrdi();});
}

function crecheCouranteOrdi(){
  return IS_DIRECTION ? (document.getElementById('ordiCreche')?.value||PROF.creche_id) : PROF.creche_id;
}

/* ============================================================================
   ÉCRAN : référentiel des repères de développement (direction uniquement)
   ============================================================================ */
const REF_TRANCHES_ORDRE=['0-6 mois','6-12 mois','1-2 ans','2-3 ans','3-4 ans'];
let refImportPreview=null;

async function renderOrdiReferentiel(){
  const zone=document.getElementById('ordiContenu');
  zone.innerHTML='<div class="ordi-empty">Chargement…</div>';
  await chargerJalonsTous();
  zone.innerHTML=`
    <div class="ref-wrap">
      <div class="ref-top">
        <button class="btn btn-p" id="btnRefAjouter"><i class="ti ti-plus"></i> Ajouter un repère</button>
        <button class="btn btn-s" style="background:#F1EFF7;color:var(--violet)" id="btnRefExporter"><i class="ti ti-download"></i> Exporter en CSV</button>
        <label class="btn btn-s" style="background:#F1EFF7;color:var(--violet);cursor:pointer">
          <i class="ti ti-upload"></i> Importer un CSV
          <input type="file" accept=".csv,text/csv" id="refFichier" style="display:none">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);margin-left:auto">
          <input type="checkbox" id="refVoirInactifs" style="width:auto"> Voir les repères désactivés
        </label>
      </div>
      <div id="refImportZone"></div>
      <div id="refListe"></div>
      <div class="mention2">Repères élaborés par l'équipe Koala Kids, inspirés des travaux de Francine Ferland. Un repère déjà utilisé n'est jamais supprimé, seulement désactivé.</div>
    </div>`;
  document.getElementById('btnRefAjouter').addEventListener('click',()=>ouvrirFormulaireJalon());
  document.getElementById('btnRefExporter').addEventListener('click',exporterJalonsCsv);
  document.getElementById('refFichier').addEventListener('change',e=>{
    const f=e.target.files[0];if(f)importerJalonsCsv(f);e.target.value='';
  });
  document.getElementById('refVoirInactifs').addEventListener('change',renderRefListe);
  renderRefListe();
}

async function chargerJalonsTous(){
  const{data,error}=await sb.from('suivi_jalons').select('*').order('domaine').order('tranche').order('ordre');
  if(!error)JALONS=data||[];
}

let refDomainesOuverts=new Set();
let refTranchesOuvertes=new Set();
const refTrancheCle=(dom,tr)=>dom+'||'+tr;

function renderRefListe(){
  const listeEl=document.getElementById('refListe');
  const voirInactifs=document.getElementById('refVoirInactifs')?.checked;
  const jalons=JALONS.filter(j=>voirInactifs||j.actif);
  if(!jalons.length){listeEl.innerHTML='<div class="ordi-empty">Aucun repère. Importez le référentiel en CSV ou ajoutez-en un.</div>';return;}
  const domaines=[...new Set(jalons.map(j=>j.domaine))];
  listeEl.innerHTML=domaines.map(dom=>{
    const parDomaine=jalons.filter(j=>j.domaine===dom);
    const ouvert=refDomainesOuverts.has(dom);
    const tranches=[...new Set(parDomaine.map(j=>j.tranche))]
      .sort((a,b)=>REF_TRANCHES_ORDRE.indexOf(a)-REF_TRANCHES_ORDRE.indexOf(b));
    const blocs=tranches.map(tr=>{
      const parTranche=parDomaine.filter(j=>j.tranche===tr);
      const cle=refTrancheCle(dom,tr);
      const trOuvert=refTranchesOuvertes.has(cle);
      const lignes=parTranche.map(j=>`
        <div class="ref-row${j.actif?'':' inactif'}" data-id="${j.id}">
          <input class="ord" type="number" value="${j.ordre}" data-champ="ordre">
          <span class="lib">${esc(j.libelle)}</span>
          <button class="btn btn-g" style="background:#F1EFF7;color:var(--muted)" data-action="editer" title="Modifier"><i class="ti ti-edit"></i></button>
          <button class="btn ${j.actif?'btn-g':'btn-p'}" style="${j.actif?'background:#FBE9E7;color:var(--err)':''}" data-action="toggle">${j.actif?'Désactiver':'Réactiver'}</button>
        </div>`).join('');
      return `
        <button class="ref-tranche-head${trOuvert?' on':''}" data-tranche-domaine="${esc(dom)}" data-tranche="${esc(tr)}">
          <i class="ti ti-chevron-right chevron"></i>
          <span class="ref-tranche">${esc(tr)}</span>
          <span class="ref-tranche-nb">${parTranche.length}</span>
        </button>
        <div class="ref-tranche-body"${trOuvert?'':' style="display:none"'}>${lignes}</div>`;
    }).join('');
    return `
      <div class="ref-domaine-bloc">
        <div class="ref-domaine-row">
          <button class="ref-domaine-head${ouvert?' on':''}" data-domaine="${esc(dom)}">
            <i class="ti ti-chevron-right chevron"></i>
            <span class="ref-domaine">${esc(dom)}</span>
            <span class="ref-domaine-nb">${parDomaine.length}</span>
          </button>
          <button class="ref-domaine-plus" data-domaine-add="${esc(dom)}" title="Ajouter un repère dans ${esc(dom)}"><i class="ti ti-plus"></i></button>
        </div>
        <div class="ref-domaine-body"${ouvert?'':' style="display:none"'}>${blocs}</div>
      </div>`;
  }).join('');
  listeEl.querySelectorAll('.ref-domaine-head').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const dom=btn.dataset.domaine;
      if(refDomainesOuverts.has(dom))refDomainesOuverts.delete(dom);else refDomainesOuverts.add(dom);
      renderRefListe();
    });
  });
  listeEl.querySelectorAll('[data-domaine-add]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const dom=btn.dataset.domaineAdd;
      refDomainesOuverts.add(dom);
      ouvrirFormulaireJalon(null,dom);
    });
  });
  listeEl.querySelectorAll('.ref-tranche-head').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const cle=refTrancheCle(btn.dataset.trancheDomaine,btn.dataset.tranche);
      if(refTranchesOuvertes.has(cle))refTranchesOuvertes.delete(cle);else refTranchesOuvertes.add(cle);
      renderRefListe();
    });
  });
  listeEl.querySelectorAll('.ref-row').forEach(row=>{
    const id=row.dataset.id;
    const j=JALONS.find(x=>x.id===id);
    row.querySelector('[data-action="toggle"]').addEventListener('click',()=>toggleJalonActif(j));
    row.querySelector('[data-action="editer"]').addEventListener('click',()=>ouvrirFormulaireJalon(j));
    row.querySelector('.ord').addEventListener('change',e=>majOrdreJalon(j,parseInt(e.target.value,10)||0));
  });
}

async function toggleJalonActif(j){
  const{error}=await sb.from('suivi_jalons').update({actif:!j.actif,updated_at:new Date().toISOString()}).eq('id',j.id);
  if(error){alert('Erreur : '+error.message);return;}
  j.actif=!j.actif;
  renderRefListe();
}

async function majOrdreJalon(j,ordre){
  const{error}=await sb.from('suivi_jalons').update({ordre,updated_at:new Date().toISOString()}).eq('id',j.id);
  if(error){alert('Erreur : '+error.message);return;}
  j.ordre=ordre;
}

function ouvrirFormulaireJalon(j,domainePrefill){
  const domainesExistants=[...new Set(JALONS.map(x=>x.domaine))];
  const w=document.createElement('div');w.className='ov-wrap';
  w.innerHTML=`<div class="ov">
    <h2><i class="ti ti-chart-line"></i> ${j?'Modifier le repère':'Ajouter un repère'}</h2>
    <div class="f"><label>Domaine</label><input id="jfDomaine" list="jfDomaines" value="${esc(j?j.domaine:(domainePrefill||''))}"></div>
    <datalist id="jfDomaines">${domainesExistants.map(d=>`<option value="${esc(d)}">`).join('')}</datalist>
    <div class="f"><label>Tranche d'âge</label><select id="jfTranche">${REF_TRANCHES_ORDRE.map(t=>`<option value="${t}"${j&&j.tranche===t?' selected':''}>${t}</option>`).join('')}</select></div>
    <div class="f"><label>Libellé</label><textarea id="jfLibelle" rows="2">${esc(j?j.libelle:'')}</textarea></div>
    <div class="f"><label>Ordre</label><input type="number" id="jfOrdre" value="${j?j.ordre:0}"></div>
    <p id="jfErr" style="color:var(--err);font-size:12.5px;display:none"></p>
    <div class="row"><button class="btn-annule" id="jfAnnule">Annuler</button><button class="btn-valide" id="jfValide">${j?'Enregistrer':'Ajouter'}</button></div>
  </div>`;
  document.body.appendChild(w);
  w.querySelector('#jfAnnule').addEventListener('click',()=>w.remove());
  w.querySelector('#jfValide').addEventListener('click',async()=>{
    const domaine=document.getElementById('jfDomaine').value.trim();
    const tranche=document.getElementById('jfTranche').value;
    const libelle=document.getElementById('jfLibelle').value.trim();
    const ordre=parseInt(document.getElementById('jfOrdre').value,10)||0;
    const err=document.getElementById('jfErr');
    if(!domaine||!libelle){err.textContent='Domaine et libellé sont obligatoires.';err.style.display='block';return;}
    if(j){
      const{error}=await sb.from('suivi_jalons').update({domaine,tranche,libelle,ordre,updated_at:new Date().toISOString()}).eq('id',j.id);
      if(error){err.textContent='Erreur : '+error.message;err.style.display='block';return;}
      Object.assign(j,{domaine,tranche,libelle,ordre});
    }else{
      const{data,error}=await sb.from('suivi_jalons').insert({domaine,tranche,libelle,ordre}).select().single();
      if(error){err.textContent='Erreur : '+error.message;err.style.display='block';return;}
      JALONS.push(data);
    }
    refDomainesOuverts.add(domaine);
    refTranchesOuvertes.add(refTrancheCle(domaine,tranche));
    w.remove();
    renderRefListe();
  });
}

/* ---- Export CSV ---- */
function csvEchapper(v){
  v=String(v==null?'':v);
  return /[;"\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
}
function exporterJalonsCsv(){
  const lignes=['domaine;tranche;ordre;libelle;actif'];
  JALONS.forEach(j=>lignes.push([j.domaine,j.tranche,j.ordre,j.libelle,j.actif?'oui':'non'].map(csvEchapper).join(';')));
  const contenu='﻿'+lignes.join('\r\n');
  const blob=new Blob([contenu],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='reperes-developpement-koalakids.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---- Import CSV : parsing minimal (séparateur ; champs éventuellement entre
   guillemets), aperçu avant enregistrement — rien n'est écrit tant que la
   direction n'a pas cliqué "Enregistrer". ---- */
function parserCsv(texte){
  const t=texte.replace(/^﻿/,'').replace(/\r\n/g,'\n');
  const lignes=[];
  let ligne=[],champ='',dansGuillemets=false;
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(dansGuillemets){
      if(c==='"'){
        if(t[i+1]==='"'){champ+='"';i++;}else dansGuillemets=false;
      }else champ+=c;
    }else if(c==='"'){dansGuillemets=true;}
    else if(c===';'){ligne.push(champ);champ='';}
    else if(c==='\n'){ligne.push(champ);lignes.push(ligne);ligne=[];champ='';}
    else champ+=c;
  }
  if(champ.length||ligne.length){ligne.push(champ);lignes.push(ligne);}
  return lignes.filter(l=>l.some(c=>c.trim()!==''));
}

function importerJalonsCsv(fichier){
  const lecteur=new FileReader();
  lecteur.onload=()=>{
    const lignes=parserCsv(lecteur.result);
    if(!lignes.length){alert('Fichier vide.');return;}
    const entete=lignes[0].map(c=>c.trim().toLowerCase());
    const idx={domaine:entete.indexOf('domaine'),tranche:entete.indexOf('tranche'),ordre:entete.indexOf('ordre'),libelle:entete.indexOf('libelle'),actif:entete.indexOf('actif')};
    if(idx.domaine<0||idx.tranche<0||idx.libelle<0){
      alert('Colonnes attendues : domaine;tranche;ordre;libelle;actif. Colonne manquante.');return;
    }
    const existants=new Set(JALONS.map(j=>(j.domaine+'|'+j.tranche+'|'+j.libelle).toLowerCase()));
    const vuDansLeFichier=new Set();
    const valides=[],rejetees=[],doublons=[];
    lignes.slice(1).forEach((l,i)=>{
      const numero=i+2;
      const domaine=(l[idx.domaine]||'').trim();
      const tranche=(l[idx.tranche]||'').trim();
      const libelle=(l[idx.libelle]||'').trim();
      const ordre=idx.ordre>=0?(parseInt(l[idx.ordre],10)||0):0;
      const actifTxt=idx.actif>=0?(l[idx.actif]||'').trim().toLowerCase():'oui';
      const actif=actifTxt!=='non'&&actifTxt!=='false'&&actifTxt!=='0';
      if(!domaine||!tranche||!libelle){rejetees.push({numero,domaine,tranche,libelle,motif:'domaine, tranche et libellé sont obligatoires'});return;}
      const cle=(domaine+'|'+tranche+'|'+libelle).toLowerCase();
      if(existants.has(cle)){doublons.push({numero,domaine,tranche,libelle,motif:'existe déjà en base'});return;}
      if(vuDansLeFichier.has(cle)){doublons.push({numero,domaine,tranche,libelle,motif:'doublon dans le fichier'});return;}
      vuDansLeFichier.add(cle);
      valides.push({domaine,tranche,ordre,libelle,actif});
    });
    refImportPreview=valides;
    const zone=document.getElementById('refImportZone');
    zone.innerHTML=`
      <div class="ref-preview">
        <div><span class="ok">${valides.length} ligne${valides.length>1?'s':''} valide${valides.length>1?'s':''}</span>
          · <span class="dup">${doublons.length} doublon${doublons.length>1?'s':''} ignoré${doublons.length>1?'s':''}</span>
          · <span class="rej">${rejetees.length} ligne${rejetees.length>1?'s':''} rejetée${rejetees.length>1?'s':''}</span></div>
        ${rejetees.length?`<table><tr><th>Ligne</th><th>Domaine</th><th>Tranche</th><th>Libellé</th><th>Motif</th></tr>
          ${rejetees.map(r=>`<tr><td>${r.numero}</td><td>${esc(r.domaine)}</td><td>${esc(r.tranche)}</td><td>${esc(r.libelle)}</td><td>${esc(r.motif)}</td></tr>`).join('')}
          </table>`:''}
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn btn-g" style="background:#F1EFF7;color:var(--muted)" id="btnRefAnnulerImport">Annuler</button>
          <button class="btn btn-p" id="btnRefConfirmerImport" ${valides.length?'':'disabled'}><i class="ti ti-check"></i> Enregistrer ${valides.length} repère${valides.length>1?'s':''}</button>
        </div>
      </div>`;
    document.getElementById('btnRefAnnulerImport').addEventListener('click',()=>{refImportPreview=null;zone.innerHTML='';});
    document.getElementById('btnRefConfirmerImport').addEventListener('click',confirmerImportJalons);
  };
  lecteur.readAsText(fichier,'utf-8');
}

async function confirmerImportJalons(){
  if(!refImportPreview||!refImportPreview.length)return;
  const btn=document.getElementById('btnRefConfirmerImport');
  btn.disabled=true;btn.textContent='Enregistrement…';
  const{data,error}=await sb.from('suivi_jalons').insert(refImportPreview).select();
  if(error){alert('Erreur : '+error.message);btn.disabled=false;return;}
  JALONS.push(...(data||[]));
  refImportPreview=null;
  document.getElementById('refImportZone').innerHTML='';
  renderRefListe();
}

let ENFANTS_ORDI=[],SYNTHESES_PERIODE={},DEPARTS_PERIODE=new Set();

/* "Départ pointé" côté interface (juste pour l'affichage/activer le bouton —
   la règle qui compte vraiment est le trigger serveur kk_suivi_verifier_
   publication) : pour jour, un départ ce jour-là ; pour semaine/mois/année,
   un départ le dernier jour où l'enfant était effectivement présent dans la
   période, même logique que kk_suivi_dernier_jour_accueil côté SQL. */
async function calculerDepartsPeriode(crecheId,debut,fin){
  if(PERIODE_TYPE==='jour'){
    const{data}=await sb.from('pointages').select('enfant_id').eq('creche_id',crecheId).eq('action','depart')
      .gte('horodatage',debut+'T00:00:00').lt('horodatage',debut+'T23:59:59.999');
    return new Set((data||[]).map(d=>d.enfant_id));
  }
  const[{data:pres},{data:departs}]=await Promise.all([
    sb.from('presences').select('enfant_id,presence_date').eq('status','present').gte('presence_date',debut).lte('presence_date',fin),
    sb.from('pointages').select('enfant_id,horodatage').eq('creche_id',crecheId).eq('action','depart')
      .gte('horodatage',debut+'T00:00:00').lt('horodatage',fin+'T23:59:59.999')
  ]);
  const dernierJour={};
  (pres||[]).forEach(p=>{if(!dernierJour[p.enfant_id]||p.presence_date>dernierJour[p.enfant_id])dernierJour[p.enfant_id]=p.presence_date;});
  const departsParJour={};
  (departs||[]).forEach(d=>{const jour=String(d.horodatage).slice(0,10);(departsParJour[d.enfant_id]=departsParJour[d.enfant_id]||new Set()).add(jour);});
  const ok=new Set();
  Object.keys(dernierJour).forEach(eid=>{if(departsParJour[eid]&&departsParJour[eid].has(dernierJour[eid]))ok.add(eid);});
  return ok;
}

function pillHtml(s,depart){
  if(s&&s.statut==='publiee')return '<span class="pill publiee">Publiée</span>';
  if(s&&s.statut==='validee')return depart?'<span class="pill publiee">Validée — à publier</span>':'<span class="pill bloque">Validée — départ non pointé</span>';
  if(!depart)return '<span class="pill bloque">Départ non pointé</span>';
  return '<span class="pill brouillon">Brouillon</span>';
}

async function chargerListeOrdi(){
  const crecheId=crecheCouranteOrdi();
  const bornes=periodeBornes();
  if(!bornes)return;
  const{debut,fin}=bornes;
  const liste=document.getElementById('ordiListe');
  liste.innerHTML='<div class="ordi-empty">Chargement…</div>';
  const[{data:enfants},{data:syntheses}]=await Promise.all([
    sb.from('enfants').select('id,prenom,nom,dob').eq('creche_id',crecheId)
      .or('date_sortie.is.null,date_sortie.gte.'+debut).order('prenom'),
    sb.from('suivi_syntheses').select('*').eq('creche_id',crecheId)
      .eq('periode_type',PERIODE_TYPE).eq('periode_debut',debut)
  ]);
  ENFANTS_ORDI=enfants||[];
  SYNTHESES_PERIODE=Object.fromEntries((syntheses||[]).map(s=>[s.enfant_id,s]));
  DEPARTS_PERIODE=await calculerDepartsPeriode(crecheId,debut,fin);
  if(!ENFANTS_ORDI.length){liste.innerHTML='<div class="ordi-empty">Aucun enfant pour cette crèche.</div>';return;}
  liste.innerHTML=ENFANTS_ORDI.map(e=>{
    const s=SYNTHESES_PERIODE[e.id];
    const depart=DEPARTS_PERIODE.has(e.id);
    return `<div class="ordi-item${e.id===enfantChoisiId?' on':''}" data-id="${e.id}">
      <div class="av">${esc((e.prenom?e.prenom[0]:'')+(e.nom?e.nom[0]:''))}</div>
      <div class="nom">${esc(e.prenom)}</div>${pillHtml(s,depart)}
    </div>`;
  }).join('');
  liste.querySelectorAll('.ordi-item').forEach(it=>it.addEventListener('click',()=>{
    enfantChoisiId=it.dataset.id;
    liste.querySelectorAll('.ordi-item').forEach(x=>x.classList.remove('on'));
    it.classList.add('on');
    afficherDetailOrdi();
  }));
  if(enfantChoisiId&&ENFANTS_ORDI.some(e=>e.id===enfantChoisiId))afficherDetailOrdi();
  else document.getElementById('ordiDetail').innerHTML='<div class="ordi-empty">Sélectionnez un enfant.</div>';
}

/* Construit un contenu de synthèse jour — en langage descriptif et
   bienveillant, sans comparaison à une norme. Seuls repas/sieste/change/
   humeur alimentent le texte destiné à la famille : soin, température,
   incident et note restent affichés à l'équipe uniquement (une inquiétude
   se dit en entretien, jamais dans la synthèse). Les jalons ne remontent
   que s'ils sont explicitement marqués "famille". */
function genererContenuJour(saisies,observations){
  const heure=iso=>new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const repasLabels={tout:'a tout mangé',bien:'a bien mangé',peu:'a mangé un peu',refus:'a refusé de manger'};
  const humeurLabels={content:'de bonne humeur',neutre:'calme',difficile:'un peu difficile par moments'};
  const famille=[];
  const interne=[];

  const repas=saisies.filter(s=>s.type==='repas');
  repas.forEach(s=>famille.push(`À ${heure(s.horodatage)}, ${repasLabels[s.valeur?.niveau]||'a mangé'}.`));

  const debuts=saisies.filter(s=>s.type==='sieste_debut'),fins=saisies.filter(s=>s.type==='sieste_fin');
  debuts.forEach((d,i)=>{
    const f=fins[i];
    famille.push(f?`Sieste de ${heure(d.horodatage)} à ${heure(f.horodatage)}.`:`Sieste débutée à ${heure(d.horodatage)}.`);
  });

  const changes=saisies.filter(s=>s.type==='change');
  if(changes.length)famille.push(`${changes.length} change${changes.length>1?'s':''} dans la journée.`);

  const humeurs=saisies.filter(s=>s.type==='humeur');
  if(humeurs.length){
    const compte={};humeurs.forEach(h=>{compte[h.valeur?.niveau]=(compte[h.valeur?.niveau]||0)+1;});
    const dominant=Object.entries(compte).sort((a,b)=>b[1]-a[1])[0][0];
    famille.push(`Aujourd'hui, ${humeurLabels[dominant]||'a passé une journée tranquille'}.`);
  }

  observations.filter(o=>o.partage==='famille').forEach(o=>{
    const j=JALONS.find(x=>x.id===o.jalon_id);
    if(j)famille.push((o.statut==='observe'?'A montré : ':'En cours d\'acquisition : ')+j.libelle+(o.note?' — '+o.note:''));
    else if(o.note)famille.push(o.note);
  });

  saisies.filter(s=>['temperature','soin','incident','note'].includes(s.type)).forEach(s=>{
    const txt=s.type==='temperature'?`Température : ${s.valeur?.celsius} °C`:(s.valeur?.texte||s.type);
    interne.push(`À ${heure(s.horodatage)} — ${txt}`);
  });
  observations.filter(o=>o.partage==='interne').forEach(o=>{
    const j=JALONS.find(x=>x.id===o.jalon_id);
    interne.push((j?j.libelle+' : '+(o.statut==='observe'?'observé':'en émergence'):'')+(o.note?' — '+o.note:''));
  });

  return{famille,interne};
}

/* Semaine/mois/année : mêmes règles de partage que le jour (repas/sieste/
   change/humeur agrégés en tendances, jalons "famille" uniquement),
   regroupées par domaine pour montrer l'évolution du développement — sans
   jamais utiliser le mot "retard" ni comparer à une norme. */
function genererContenuPeriode(saisies,observations){
  const repasLabels={tout:'tout mangé',bien:'bien mangé',peu:'mangé un peu',refus:'refusé de manger'};
  const humeurLabels={content:'de bonne humeur',neutre:'calme',difficile:'plus difficile par moments'};
  const famille=[];
  const interne=[];

  const repas=saisies.filter(s=>s.type==='repas');
  if(repas.length){
    const compte={};repas.forEach(r=>{const n=r.valeur?.niveau;compte[n]=(compte[n]||0)+1;});
    const parts=Object.entries(compte).map(([n,c])=>`${c} fois ${repasLabels[n]||n}`);
    famille.push(`Repas : sur ${repas.length} repas enregistrés, ${parts.join(', ')}.`);
  }

  const debuts=saisies.filter(s=>s.type==='sieste_debut'),fins=saisies.filter(s=>s.type==='sieste_fin');
  if(debuts.length){
    const durees=[];
    debuts.forEach((d,i)=>{const f=fins[i];if(f)durees.push((new Date(f.horodatage)-new Date(d.horodatage))/60000);});
    if(durees.length){
      const moy=Math.round(durees.reduce((a,b)=>a+b,0)/durees.length);
      famille.push(`Sieste : ${debuts.length} sieste${debuts.length>1?'s':''} enregistrée${debuts.length>1?'s':''}, durée moyenne d'environ ${Math.floor(moy/60)} h ${String(moy%60).padStart(2,'0')}.`);
    }else{
      famille.push(`Sieste : ${debuts.length} sieste${debuts.length>1?'s':''} enregistrée${debuts.length>1?'s':''}.`);
    }
  }

  const changes=saisies.filter(s=>s.type==='change');
  if(changes.length)famille.push(`${changes.length} change${changes.length>1?'s':''} sur la période.`);

  const humeurs=saisies.filter(s=>s.type==='humeur');
  if(humeurs.length){
    const compte={};humeurs.forEach(h=>{compte[h.valeur?.niveau]=(compte[h.valeur?.niveau]||0)+1;});
    const dominant=Object.entries(compte).sort((a,b)=>b[1]-a[1])[0][0];
    famille.push(`Humeur : globalement ${humeurLabels[dominant]||'variable'} sur la période.`);
  }

  const domaines={};
  observations.filter(o=>o.partage==='famille'&&o.jalon_id).forEach(o=>{
    const j=JALONS.find(x=>x.id===o.jalon_id);
    if(!j)return;
    (domaines[j.domaine]=domaines[j.domaine]||[]).push({libelle:j.libelle,statut:o.statut});
  });
  observations.filter(o=>o.partage==='famille'&&!o.jalon_id&&o.note).forEach(o=>famille.push(o.note));

  saisies.filter(s=>['temperature','soin','incident','note'].includes(s.type)).forEach(s=>{
    const d=new Date(s.horodatage);
    const heure=d.toLocaleDateString('fr-FR')+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const txt=s.type==='temperature'?`Température : ${s.valeur?.celsius} °C`:(s.valeur?.texte||s.type);
    interne.push(`${heure} — ${txt}`);
  });
  observations.filter(o=>o.partage==='interne').forEach(o=>{
    const j=JALONS.find(x=>x.id===o.jalon_id);
    interne.push((j?j.libelle+' : '+(o.statut==='observe'?'observé':'en émergence'):'')+(o.note?' — '+o.note:''));
  });

  return{famille,domaines,interne};
}

async function afficherDetailOrdi(){
  const detail=document.getElementById('ordiDetail');
  detail.innerHTML='<div class="ordi-empty">Chargement…</div>';
  const e=ENFANTS_ORDI.find(x=>x.id===enfantChoisiId);
  const{debut,fin}=periodeBornes();
  const bDebut=debut+'T00:00:00',bFin=fin+'T23:59:59.999';
  const[{data:saisies},{data:observations}]=await Promise.all([
    sb.from('suivi_saisies').select('*').eq('enfant_id',enfantChoisiId).gte('horodatage',bDebut).lte('horodatage',bFin).order('horodatage'),
    sb.from('suivi_observations').select('*').eq('enfant_id',enfantChoisiId).gte('horodatage',bDebut).lte('horodatage',bFin).order('horodatage')
  ]);
  const synthese=SYNTHESES_PERIODE[e.id];
  const depart=DEPARTS_PERIODE.has(e.id);
  const noteExistante=(synthese&&synthese.contenu&&synthese.contenu.note_referente)||'';

  let famille,interne,domaines={};
  if(PERIODE_TYPE==='jour'){
    ({famille,interne}=genererContenuJour(saisies||[],observations||[]));
  }else{
    ({famille,domaines,interne}=genererContenuPeriode(saisies||[],observations||[]));
  }

  const requiertValidation=(PERIODE_TYPE==='mois'||PERIODE_TYPE==='annee');
  const requiertDirection=(PERIODE_TYPE==='annee');
  const valideRef=!!(synthese&&synthese.valide_referente_le);
  const valideDir=!!(synthese&&synthese.valide_direction_le);
  const estValidee=synthese&&synthese.statut==='validee';
  const estPubliee=synthese&&synthese.statut==='publiee';

  detail.innerHTML=`
    <h2 style="font-family:'Baloo 2',cursive;color:var(--violet);margin-bottom:4px">${esc(e.prenom)} ${esc(e.nom||'')}</h2>
    <div style="color:var(--muted);font-size:13px;margin-bottom:10px">${esc(libellePeriode(debut,fin))}</div>

    <div class="section-titre">Ce qui sera transmis à la famille</div>
    ${famille.length?`<ul class="bullet-list">${famille.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<div class="ordi-empty" style="padding:14px 0">Rien de saisi pour l\'instant.</div>'}

    ${Object.keys(domaines).length?Object.entries(domaines).map(([dom,items])=>`
      <div class="section-titre">${esc(dom)}</div>
      <ul class="bullet-list">${items.map(it=>`<li>${it.statut==='observe'?'Observé':'En émergence'} : ${esc(it.libelle)}</li>`).join('')}</ul>
    `).join(''):''}

    ${requiertValidation?`
    <div class="section-titre">Mot de la référente${PERIODE_TYPE==='annee'?' — bilan, préparation à la transition':' (facultatif)'}</div>
    <textarea id="ordiNoteReferente" rows="4" placeholder="Note libre, éditable jusqu'à validation…">${esc(noteExistante)}</textarea>
    `:''}

    ${interne.length?`<div class="section-titre">Usage interne — jamais transmis à la famille</div>
    <ul class="bullet-list interne">${interne.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}

    <div style="margin-top:22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${estPubliee
        ?`<span class="pill publiee" style="font-size:13px;padding:8px 14px">Publiée le ${new Date(synthese.publiee_le).toLocaleString('fr-FR')}</span>`
        :requiertValidation
          ?(estValidee
            ?`<span style="color:var(--muted);font-size:12.5px">Publication à la famille désactivée — le suivi est désormais un outil interne à l'équipe.</span>`
            :`<button class="btn btn-s" id="btnEnregistrer" style="background:#F1EFF7;color:var(--violet)"><i class="ti ti-device-floppy"></i> Enregistrer le brouillon</button>
              <button class="btn btn-p" id="btnValiderRef" ${valideRef?'disabled':''}><i class="ti ti-check"></i> ${valideRef?'Validé par la référente':'Valider (référente)'}</button>
              ${requiertDirection?`<button class="btn btn-p" id="btnValiderDir" ${(!IS_DIRECTION||valideDir)?'disabled':''}><i class="ti ti-check"></i> ${valideDir?'Validé par la direction':'Valider (direction)'}</button>`:''}`
          )
          :`<span style="color:var(--muted);font-size:12.5px">Publication à la famille désactivée — le suivi est désormais un outil interne à l'équipe.</span>`
      }
    </div>
    <div class="mention2">Repères élaborés par l'équipe Koala Kids, inspirés des travaux de Francine Ferland.</div>
    <div id="accesFamilleZone" style="margin-top:26px"></div>
  `;
  renderAccesFamille(e.id);

  const contenuBase={famille,domaines,interne};
  const noteEl=document.getElementById('ordiNoteReferente');
  const lireNote=()=>noteEl?noteEl.value.trim():noteExistante;

  const btnPub=document.getElementById('btnPublier');
  if(btnPub)btnPub.addEventListener('click',()=>publierSynthese(e,Object.assign({},contenuBase,{note_referente:lireNote()}),debut,fin));
  const btnEnr=document.getElementById('btnEnregistrer');
  if(btnEnr)btnEnr.addEventListener('click',()=>enregistrerBrouillon(e,Object.assign({},contenuBase,{note_referente:lireNote()}),debut,fin));
  const btnVRef=document.getElementById('btnValiderRef');
  if(btnVRef)btnVRef.addEventListener('click',()=>validerSynthese(e,Object.assign({},contenuBase,{note_referente:lireNote()}),debut,fin,'referente'));
  const btnVDir=document.getElementById('btnValiderDir');
  if(btnVDir)btnVDir.addEventListener('click',()=>validerSynthese(e,Object.assign({},contenuBase,{note_referente:lireNote()}),debut,fin,'direction'));
}

/* ============================================================================
   ACCÈS FAMILLE — jetons révocables, un par parent destinataire
   ============================================================================ */
function suiviFamilleLienFor(token){
  try{return new URL('famille-suivi.html?t='+token,location.href).href;}
  catch(e){return location.href.replace(/[^/]*$/,'')+'famille-suivi.html?t='+token;}
}

/* Accès famille désactivé : le suivi de l'enfant est désormais un outil
   interne à l'équipe, plus rien n'est transmis aux parents. On laisse la
   table suivi_acces_famille et l'edge function suivi-famille en place
   (au cas où la fonctionnalité serait réactivée plus tard), on coupe
   juste la création/consultation de nouveaux accès depuis l'UI. */
async function renderAccesFamille(enfantId){
  const zone=document.getElementById('accesFamilleZone');
  if(!zone)return;
  zone.innerHTML='<div class="section-titre">Accès famille</div><div class="ordi-empty" style="padding:10px 0">Fonctionnalité désactivée : le suivi n\'est plus transmis aux familles, il reste un outil interne à l\'équipe.</div>';
}

function afficherQrAcces(url){
  const w=document.createElement('div');w.className='ov-wrap';
  w.innerHTML=`<div class="ov" style="text-align:center">
    <h2 style="justify-content:center"><i class="ti ti-qrcode"></i> Lien pour la famille</h2>
    <div id="qrBox" style="display:flex;align-items:center;justify-content:center;margin:14px 0;min-height:220px"></div>
    <p style="font-size:12px;color:var(--muted);word-break:break-all">${esc(url)}</p>
    <div class="row"><button class="btn-valide" id="qrFermer" style="width:100%">Fermer</button></div>
  </div>`;
  document.body.appendChild(w);
  const box=document.getElementById('qrBox');
  let ok=false;
  if(typeof QRCode==='function'){
    try{new QRCode(box,{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});ok=true;}
    catch(e){console.warn('QRCode lib KO',e);}
  }
  if(!ok){
    const img=document.createElement('img');
    img.width=220;img.height=220;img.alt='QR code';
    img.src='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(url);
    box.appendChild(img);
  }
  w.querySelector('#qrFermer').addEventListener('click',()=>w.remove());
}

async function upsertSynthese(e,contenu,debut,fin,extraPatch){
  const crecheId=crecheCouranteOrdi();
  let row=SYNTHESES_PERIODE[e.id];
  if(!row){
    const{data,error}=await sb.from('suivi_syntheses').insert(Object.assign({
      enfant_id:e.id,creche_id:crecheId,periode_type:PERIODE_TYPE,
      periode_debut:debut,periode_fin:fin,contenu,statut:'brouillon'
    },extraPatch||{})).select().single();
    if(error)throw error;
    row=data;
  }else{
    const patch=Object.assign({contenu,updated_at:new Date().toISOString()},extraPatch||{});
    const{data,error}=await sb.from('suivi_syntheses').update(patch).eq('id',row.id).select().single();
    if(error)throw error;
    row=data;
  }
  SYNTHESES_PERIODE[e.id]=row;
  return row;
}

async function enregistrerBrouillon(e,contenu,debut,fin){
  try{
    await upsertSynthese(e,contenu,debut,fin);
    afficherDetailOrdi();
  }catch(err){alert('Erreur : '+err.message);}
}

async function validerSynthese(e,contenu,debut,fin,role){
  try{
    const row=await upsertSynthese(e,contenu,debut,fin);
    const patch={};
    if(role==='referente'){patch.valide_referente_id=PROF.id;patch.valide_referente_le=new Date().toISOString();}
    if(role==='direction'){patch.valide_direction_id=PROF.id;patch.valide_direction_le=new Date().toISOString();}
    const refOk=patch.valide_referente_le||row.valide_referente_le;
    const dirOk=PERIODE_TYPE!=='annee'||patch.valide_direction_le||row.valide_direction_le;
    if(refOk&&dirOk)patch.statut='validee';
    const{error}=await sb.from('suivi_syntheses').update(patch).eq('id',row.id);
    if(error)throw error;
    await chargerListeOrdi();
  }catch(err){alert('Erreur de validation : '+err.message);}
}

async function publierSynthese(e,contenu,debut,fin){
  const btn=document.getElementById('btnPublier');
  if(btn)btn.disabled=true;
  try{
    const row=await upsertSynthese(e,contenu,debut,fin);
    const{error}=await sb.from('suivi_syntheses').update({statut:'publiee'}).eq('id',row.id);
    if(error)throw error;
    await chargerListeOrdi();
  }catch(err){
    alert('Publication refusée : '+err.message);
    if(btn)btn.disabled=false;
  }
}

/* ============================= IDENTIFICATION ============================= */
async function afficherIdentification(){
  retirerBarre();
  AUTEUR_TYPE=null;AUTEUR_ID=null;AUTEUR_LABEL='';btnAuteur.classList.add('hidden');
  app.className='state';
  app.innerHTML='<i class="ti ti-loader-2"></i><h2>Chargement…</h2>';
  const{data,error}=await sb.rpc('kk_suivi_kiosk_personnel_present',{p_token:TOKEN});
  if(error){
    app.innerHTML='<i class="ti ti-wifi-off"></i><h2>Connexion impossible</h2><p style="color:var(--muted);font-size:13px">Vérifiez le Wi-Fi et réessayez.</p><button class="chip orange" style="margin-top:14px" onclick="afficherIdentification()">Réessayer</button>';
    return;
  }
  const personnel=data||[];
  app.className='';
  if(!personnel.length){
    app.innerHTML='<div class="ident"><div><div class="prompt">Personne n\'est pointé arrivé</div><div class="subprompt">Pointez d\'abord votre arrivée sur l\'écran de pointage, puis revenez ici.</div></div>'
      +'<button class="chip orange" onclick="afficherIdentification()"><i class="ti ti-refresh"></i> Actualiser</button></div>';
    return;
  }
  app.innerHTML=`
    <div class="ident">
      <div><div class="prompt">Qui êtes-vous ?</div><div class="subprompt">Touchez votre nom dans la liste</div></div>
      <div class="pers-list" id="persList"></div>
    </div>`;
  const list=document.getElementById('persList');
  list.innerHTML=personnel.map(p=>`
    <button class="pers-item" data-type="${p.type}" data-id="${p.id}">
      <span class="av2">${esc(p.label?p.label[0]:'?')}</span>
      <span><span>${esc(p.label)}</span><br><span class="sub2">${esc(p.sub||'')}</span></span>
    </button>`).join('');
  list.querySelectorAll('.pers-item').forEach(btn=>btn.addEventListener('click',()=>{
    AUTEUR_TYPE=btn.dataset.type;AUTEUR_ID=btn.dataset.id;
    AUTEUR_LABEL=btn.querySelector('span > span').textContent;
    btnAuteur.classList.remove('hidden');
    btnAuteur.innerHTML='<i class="ti ti-user-check"></i> '+esc(AUTEUR_LABEL||'Changer');
    chargerEnfants();
  }));
}
function changerAuteur(){afficherIdentification();}
window.changerAuteur=changerAuteur;

/* ============================= GRILLE ENFANTS ============================= */
async function chargerJalonsRef(){
  if(JALONS.length)return;
  const{data,error}=await sb.from('suivi_jalons').select('*').eq('actif',true).order('domaine').order('tranche').order('ordre');
  if(!error)JALONS=data||[];
}

async function chargerEnfants(){
  ecran='grille';selection.clear();
  const{data,error}=await sb.rpc('kk_suivi_kiosk_enfants_presents',{p_token:TOKEN});
  chargerJalonsRef();
  if(error){
    app.innerHTML='<i class="ti ti-wifi-off"></i><h2>Connexion impossible</h2><p style="color:var(--muted);font-size:13px">Vérifiez le Wi-Fi et réessayez.</p><button class="chip orange" style="margin-top:14px" onclick="chargerEnfants()">Réessayer</button>';
    return;
  }
  ENFANTS=data||[];
  renderGrille();
}

function initiales(prenom,nom){
  return (prenom?prenom[0]:'')+(nom?nom[0]:'');
}

function renderGrille(){
  if(!ENFANTS.length){
    app.innerHTML=`<div class="empty-grille"><i class="ti ti-mood-kid"></i><div>Aucun enfant pointé présent pour le moment.</div>
      <button class="chip orange" onclick="chargerEnfants()"><i class="ti ti-refresh"></i> Actualiser</button></div>`;
    return;
  }
  app.innerHTML=`
    <div class="grille-wrap">
      <div class="grille" id="grille"></div>
    </div>`;
  const g=document.getElementById('grille');
  g.innerHTML=ENFANTS.map(e=>`
    <div class="tile${selection.has(e.id)?' sel':''}" data-id="${e.id}">
      <div class="badges">
        ${e.allergies?'<span class="badge allergie" title="Allergie / régime"><i class="ti ti-alert-triangle"></i></span>':''}
        ${e.pai_actif?'<span class="badge pai" title="PAI actif"><i class="ti ti-clipboard-heart"></i></span>':''}
      </div>
      <div class="av">${esc(initiales(e.prenom,e.nom))}</div>
      <div class="nom">${esc(e.prenom)}</div>
      <button class="btn-jalons" data-jalons="${e.id}"><i class="ti ti-chart-line"></i> Repères</button>
    </div>`).join('');
  g.querySelectorAll('.tile').forEach(t=>t.addEventListener('click',ev=>{
    if(ev.target.closest('.btn-jalons'))return;
    const id=t.dataset.id;
    if(selection.has(id))selection.delete(id);else selection.add(id);
    renderGrille();
  }));
  g.querySelectorAll('[data-jalons]').forEach(b=>b.addEventListener('click',ev=>{
    ev.stopPropagation();
    ouvrirJalons(b.dataset.jalons);
  }));
  renderBarre();
}

function retirerBarre(){
  const anc=document.querySelector('.barre');if(anc)anc.remove();
}

function renderBarre(){
  retirerBarre();
  if(!selection.size)return;
  const barre=document.createElement('div');
  barre.className='barre';
  barre.innerHTML=`
    <span class="compte">${selection.size} sélectionné${selection.size>1?'s':''}</span>
    <button class="chip" data-action="repas"><i class="ti ti-tools-kitchen-2"></i> Repas</button>
    <button class="chip" data-action="sieste_debut"><i class="ti ti-moon"></i> Sieste début</button>
    <button class="chip" data-action="sieste_fin"><i class="ti ti-sun"></i> Sieste fin</button>
    <button class="chip" data-action="change"><i class="ti ti-droplet"></i> Change</button>
    <button class="chip" data-action="humeur"><i class="ti ti-mood-smile"></i> Humeur</button>
    <button class="chip" data-action="temperature"><i class="ti ti-thermometer"></i> Température</button>
    <button class="chip" data-action="soin"><i class="ti ti-first-aid-kit"></i> Soin</button>
    <button class="chip" data-action="note"><i class="ti ti-microphone"></i> Note</button>
    ${selection.size===1?'<button class="chip" id="barreJalons"><i class="ti ti-chart-line"></i> Repères</button>':''}
  `;
  document.body.appendChild(barre);
  barre.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>lancerAction(b.dataset.action)));
  const btnJalons=document.getElementById('barreJalons');
  if(btnJalons)btnJalons.addEventListener('click',()=>ouvrirJalons([...selection][0]));
}

/* ============================= ACTIONS GROUPÉES ============================= */
function lancerAction(type){
  if(type==='sieste_debut'||type==='sieste_fin')return envoyerSaisie(type,{});
  if(type==='repas')return ouvrirChoix('Repas',[
    {v:'tout',l:'Tout mangé'},{v:'bien',l:'Bien mangé'},{v:'peu',l:'Un peu mangé'},{v:'refus',l:'A refusé'}
  ],v=>envoyerSaisie('repas',{niveau:v}));
  if(type==='change')return ouvrirChoix('Change',[
    {v:'urine',l:'Urine'},{v:'selles',l:'Selles'},{v:'urine_selles',l:'Les deux'}
  ],v=>envoyerSaisie('change',{nature:v}));
  if(type==='humeur')return ouvrirChoix('Humeur',[
    {v:'content',l:'😊 Content'},{v:'neutre',l:'😐 Neutre'},{v:'difficile',l:'😢 Difficile'}
  ],v=>envoyerSaisie('humeur',{niveau:v}));
  if(type==='temperature')return ouvrirTemperature(c=>envoyerSaisie('temperature',{celsius:c}));
  if(type==='soin')return ouvrirNote('Soin',t=>envoyerSaisie('soin',{texte:t}));
  if(type==='note')return ouvrirNote('Note libre',t=>envoyerSaisie('note',{texte:t}));
}

function ouvrirChoix(titre,options,onChoix){
  const w=document.createElement('div');w.className='ov-wrap';
  w.innerHTML=`<div class="ov"><h2>${esc(titre)}</h2><div class="ov-choix">${
    options.map(o=>`<button data-v="${o.v}">${esc(o.l)}</button>`).join('')
  }</div><div class="row"><button class="btn-annule" id="ovAnnule">Annuler</button></div></div>`;
  document.body.appendChild(w);
  w.querySelectorAll('[data-v]').forEach(b=>b.addEventListener('click',()=>{w.remove();onChoix(b.dataset.v);}));
  w.querySelector('#ovAnnule').addEventListener('click',()=>w.remove());
}

function ouvrirTemperature(onValide){
  let val=37.0;
  const w=document.createElement('div');w.className='ov-wrap';
  w.innerHTML=`<div class="ov"><h2><i class="ti ti-thermometer"></i> Température</h2>
    <div class="temp-val" id="tVal">${val.toFixed(1)} °C</div>
    <div class="temp-pad">
      <button id="tMoins">−0,1</button><button id="tMoinsGros">−1</button>
      <button id="tPlusGros">+1</button><button id="tPlus">+0,1</button>
    </div>
    <div class="row"><button class="btn-annule" id="ovAnnule">Annuler</button><button class="btn-valide" id="ovValide">Enregistrer</button></div>
    </div>`;
  document.body.appendChild(w);
  const maj=()=>{document.getElementById('tVal').textContent=val.toFixed(1)+' °C';};
  document.getElementById('tMoins').onclick=()=>{val=Math.max(34,val-0.1);maj();};
  document.getElementById('tPlus').onclick=()=>{val=Math.min(42,val+0.1);maj();};
  document.getElementById('tMoinsGros').onclick=()=>{val=Math.max(34,val-1);maj();};
  document.getElementById('tPlusGros').onclick=()=>{val=Math.min(42,val+1);maj();};
  w.querySelector('#ovAnnule').addEventListener('click',()=>w.remove());
  w.querySelector('#ovValide').addEventListener('click',()=>{w.remove();onValide(Math.round(val*10)/10);});
}

/* Dictée vocale : Web Speech API (Chrome Android). Facultative — si absente,
   le champ texte reste utilisable normalement. */
function ouvrirNote(titre,onValide){
  const w=document.createElement('div');w.className='ov-wrap';
  w.innerHTML=`<div class="ov"><h2><i class="ti ti-notes"></i> ${esc(titre)}</h2>
    <textarea id="ovTexte" placeholder="Note facultative…"></textarea>
    <button class="mic-btn" id="ovMic" title="Dicter"><i class="ti ti-microphone"></i></button>
    <div class="row"><button class="btn-annule" id="ovAnnule">Annuler</button><button class="btn-valide" id="ovValide">Enregistrer</button></div>
    </div>`;
  document.body.appendChild(w);
  const ta=document.getElementById('ovTexte');
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){
    const reco=new SR();reco.lang='fr-FR';reco.interimResults=false;reco.continuous=false;
    const micBtn=document.getElementById('ovMic');
    let on=false;
    micBtn.addEventListener('click',()=>{
      if(on){reco.stop();return;}
      reco.start();on=true;micBtn.classList.add('on');
    });
    reco.onresult=ev=>{
      const t=ev.results[0][0].transcript;
      ta.value=(ta.value?ta.value+' ':'')+t;
    };
    reco.onend=()=>{on=false;micBtn.classList.remove('on');};
    reco.onerror=()=>{on=false;micBtn.classList.remove('on');};
  }else{
    document.getElementById('ovMic').style.display='none';
  }
  w.querySelector('#ovAnnule').addEventListener('click',()=>w.remove());
  w.querySelector('#ovValide').addEventListener('click',()=>{const t=ta.value.trim();w.remove();onValide(t);});
}

async function envoyerSaisie(type,valeur){
  const enfantIds=[...selection];
  const args={p_token:TOKEN,p_auteur_type:AUTEUR_TYPE,p_auteur_id:AUTEUR_ID,p_enfant_ids:enfantIds,p_type:type,p_valeur:valeur};
  selection.clear();renderGrille();
  if(!navigator.onLine){
    queueAjouter({fn:'kk_suivi_kiosk_saisir',args});
    toast('Enregistré (hors ligne, sera envoyé au retour du réseau).',null);
    return;
  }
  const{data,error}=await sb.rpc('kk_suivi_kiosk_saisir',args);
  if(error){
    queueAjouter({fn:'kk_suivi_kiosk_saisir',args});
    toast('Réseau indisponible : mis en attente.',null);
    return;
  }
  const rows=data||[];
  const echecs=rows.filter(r=>!r.ok);
  const okIds=rows.filter(r=>r.ok).map(r=>r.saisie_id);
  if(echecs.length&&echecs[0].error==='auteur_absent'){
    afficherIdentification();
    alert('Identification perdue (départ pointé entre-temps ?). Merci de vous identifier à nouveau.');
    return;
  }
  if(okIds.length){
    lastBatch={table:'suivi_saisies',ids:okIds};
    toast(okIds.length>1?okIds.length+' saisies enregistrées.':'Saisie enregistrée.',annulerDernier);
  }
  if(echecs.length)console.warn('saisies en échec',echecs);
}

function toast(msg,onAnnuler){
  const anc=document.querySelector('.toast');if(anc)anc.remove();
  clearTimeout(toastTimer);
  const t=document.createElement('div');t.className='toast';
  t.innerHTML=`<span>${esc(msg)}</span>`+(onAnnuler?'<button id="tAnnule">Annuler</button>':'');
  document.body.appendChild(t);
  if(onAnnuler)t.querySelector('#tAnnule').addEventListener('click',()=>{t.remove();onAnnuler();});
  toastTimer=setTimeout(()=>t.remove(),10000);
}

async function annulerDernier(){
  if(!lastBatch)return;
  const{table,ids}=lastBatch;
  lastBatch=null;
  for(const id of ids){
    await sb.rpc('kk_suivi_kiosk_annuler',{p_token:TOKEN,p_auteur_type:AUTEUR_TYPE,p_auteur_id:AUTEUR_ID,p_id:id,p_table:table});
  }
  chargerEnfants();
}

/* ============================= JALONS (un enfant) ============================= */
const TRANCHES=['0-6 mois','6-12 mois','1-2 ans','2-3 ans','3-4 ans'];
function trancheDepuisDob(dob){
  if(!dob)return null;
  const naissance=new Date(dob+'T00:00:00');
  const moisAge=(new Date().getFullYear()-naissance.getFullYear())*12+(new Date().getMonth()-naissance.getMonth());
  if(moisAge<6)return 0;
  if(moisAge<12)return 1;
  if(moisAge<24)return 2;
  if(moisAge<36)return 3;
  return 4;
}

let jalonsDomOuverts=new Set();

function ouvrirJalons(enfantId){
  const e=ENFANTS.find(x=>x.id===enfantId);
  if(!e)return;
  retirerBarre();
  enfantJalons=e;
  ecran='jalons';
  jalonsDomOuverts=new Set();

  app.innerHTML=`
    <div class="jalons-wrap">
      <div class="jalons-head">
        <button class="retour" onclick="chargerEnfants()"><i class="ti ti-arrow-left"></i></button>
        <span class="qui">${esc(e.prenom)} — repères de développement</span>
      </div>
      ${e.naissance_provisoire?'<div style="background:#FFF6DC;border-left:4px solid #B8860B;border-radius:0 8px 8px 0;padding:10px 14px;margin:10px 14px 0;font-size:12.5px;color:#B8860B">'
        +'<i class="ti ti-alert-triangle"></i> Date de naissance provisoire (terme prévu, enfant pas encore né) — la tranche d\'âge affichée sera à revoir après la naissance.</div>':''}
      <div class="jalons-list" id="jList"></div>
    </div>`;
  renderJalonsListe();
}

function renderJalonsListe(){
  const e=enfantJalons;
  const list=document.getElementById('jList');
  const idx=trancheDepuisDob(e.dob);
  const tranchesAffichees=idx===null?[]:[TRANCHES[idx],TRANCHES[idx+1]].filter(Boolean);
  const jalons=JALONS.filter(j=>tranchesAffichees.includes(j.tranche));
  const domaines=[...new Set(jalons.map(j=>j.domaine))];

  if(!jalons.length){
    list.innerHTML='<div class="mention">Aucun repère actif pour la tranche d\'âge de cet enfant.</div>';
    return;
  }
  list.innerHTML=domaines.map(dom=>{
    const parDomaine=jalons.filter(j=>j.domaine===dom);
    const ouvert=jalonsDomOuverts.has(dom);
    return `
      <button class="domaine-head${ouvert?' on':''}" data-domaine="${esc(dom)}">
        <i class="ti ti-chevron-right chevron"></i>
        <span class="domaine-titre">${esc(dom)}</span>
        <span class="domaine-nb">${parDomaine.length}</span>
      </button>
      <div class="domaine-body"${ouvert?'':' style="display:none"'}>
        ${parDomaine.map(j=>`
          <div class="jalon" data-jalon="${j.id}">
            <span class="lib">${esc(j.libelle)}</span>
            <div class="btns">
              <button data-statut="emergence" class="emergence">En émergence</button>
              <button data-statut="observe" class="observe">Observé</button>
            </div>
          </div>`).join('')}
      </div>`;
  }).join('')+`<div class="mention">Repères élaborés par l'équipe Koala Kids, inspirés des travaux de Francine Ferland.</div>`;

  list.querySelectorAll('.domaine-head').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const dom=btn.dataset.domaine;
      if(jalonsDomOuverts.has(dom))jalonsDomOuverts.delete(dom);else jalonsDomOuverts.add(dom);
      renderJalonsListe();
    });
  });
  list.querySelectorAll('.jalon').forEach(row=>{
    row.querySelectorAll('button[data-statut]').forEach(btn=>{
      btn.addEventListener('click',()=>marquerJalon(e.id,row.dataset.jalon,btn.dataset.statut,row,btn));
    });
  });
}

async function marquerJalon(enfantId,jalonId,statut,row,btn){
  row.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  const args={p_token:TOKEN,p_auteur_type:AUTEUR_TYPE,p_auteur_id:AUTEUR_ID,p_enfant_id:enfantId,p_jalon_id:jalonId,
    p_statut:statut,p_note:null,p_posture:null,p_partage:'interne'};
  if(!navigator.onLine){queueAjouter({fn:'kk_suivi_kiosk_observer',args});return;}
  const{data,error}=await sb.rpc('kk_suivi_kiosk_observer',args);
  if(error){queueAjouter({fn:'kk_suivi_kiosk_observer',args});return;}
  const row0=Array.isArray(data)?data[0]:data;
  if(row0&&!row0.ok&&row0.error==='auteur_absent'){
    afficherIdentification();
    alert('Identification perdue (départ pointé entre-temps ?). Merci de vous identifier à nouveau.');
  }
}
