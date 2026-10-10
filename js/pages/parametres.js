const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let ME=null,PROF=null;
let CRECHES=[],ETABS=[],RCFG={},RCFG_ID=null,KIOSK_DEVICES=[];
let crecheId=null;
const JOURS=[[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi'],[6,'Samedi']];
const FERM_TYPES={vacances:'Vacances',ferie:'Jour férié',pedagogique:'Journée pédagogique'};
let FERMETURES=[],FERMETURES_RESEAU=[];

function toast(m,err){const t=document.getElementById('toast');t.textContent=m;t.className='toast on'+(err?' err':'');setTimeout(()=>t.className='toast',2800);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function val(id){const e=document.getElementById(id);return e?e.value.trim():'';}
function setVal(id,v){const e=document.getElementById(id);if(e)e.value=(v==null?'':v);}
function num(id){const v=val(id);return v===''?null:Number(String(v).replace(',','.'));}
function dfr(d){if(!d)return'';const p=String(d).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'';}
/* Champs stockes en integer cote base. Un decimal y est refuse par Postgres
   avec un message brut ("invalid input syntax for type integer") que personne
   ne devrait avoir a lire : on le rattrape ici, en nommant le champ. */
function entier(id,label){
  const v=val(id);
  if(v==='')return null;
  const n=Number(String(v).replace(',','.'));
  if(!isFinite(n))throw new Error(label+' : valeur illisible.');
  if(!Number.isInteger(n))throw new Error(label+' : un nombre entier est attendu, pas '+v+'.');
  return n;
}
function auj(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function toArr(v){
  if(Array.isArray(v))return v;
  if(typeof v==='string'){try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch(e){return[];}}
  return [];
}

/* ---------- AUTH ---------- */
/* Même règle que les autres modules : arrivée depuis le hub index.html, qui
   n'authentifie personne, donc déconnexion systématique et saisie obligatoire.
   Ce module porte le SIRET et les agréments : sur un poste partagé, hériter de
   la session précédente n'est pas acceptable. */
let JUSTE_CONNECTE=false;
function showLogin(msg){
  document.getElementById('appView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='block';
  document.getElementById('mfaGateBox').style.display='none';
  document.getElementById('liErr').textContent=msg||'';
}
async function boot(){
  if(!JUSTE_CONNECTE){
    try{await sb.auth.signOut();}catch(e){console.warn('[boot] signOut',e);}
    showLogin();return;
  }
  let session=null;
  try{
    const r=await sb.auth.getSession();
    session=(r&&r.data&&r.data.session)||null;
    if(session&&session.expires_at&&session.expires_at*1000<Date.now()+10000){
      const{data:rd}=await sb.auth.refreshSession();
      session=(rd&&rd.session)||null;
    }
  }catch(e){console.warn('[boot] session',e);session=null;}
  if(!session||!session.user){showLogin();return;}
  ME=session.user;
  let p=null;
  try{
    const{data,error}=await sb.from('referents').select('*').eq('user_id',ME.id).maybeSingle();
    if(error)throw error;
    p=data;
  }catch(e){
    console.error('[boot] profil',e);
    showLogin('Session expirée ou profil inaccessible — merci de vous reconnecter.');
    return;
  }
  if(!p){
    try{await sb.auth.signOut();}catch(e){}
    showLogin('Compte non reconnu — contactez la direction.');
    return;
  }
  PROF=p;
  if(window.KKBranding)KKBranding.applyBranding(sb);
  /* Le verrou réel est côté Supabase (policies de 25a) : cacher l'écran ne
     protégerait rien. Ce test évite une page vide et inexplicable. */
  if(p.role!=='direction'){
    try{await sb.auth.signOut();}catch(e){}
    showLogin('Ce module est réservé à la direction.');
    return;
  }
  // MFA obligatoire à la connexion, même portail que demandes.html/documents.html.
  await mfaGateCheckAndProceed();
}
// --- Portail MFA obligatoire ---
function mfaGateSwitchView(id){
  document.getElementById('appView').style.display='none';
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
    if(data.currentLevel==='aal2'){await parametresGrantAccess();return;}
    if(data.nextLevel==='aal2'){mfaGateShowChallenge();return;}
    await mfaGateShowEnroll();
  }catch(e){
    console.error('[MFA Gate]',e);
    try{await sb.auth.signOut();}catch(_e){}
    showLogin('Erreur de vérification de la double authentification. Réessayez.');
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
    await parametresGrantAccess();
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
    await parametresGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateCancel(){
  if(mfaGateFactorId){try{await sb.auth.mfa.unenroll({factorId:mfaGateFactorId});}catch(e){console.warn('Nettoyage annulation MFA gate échoué :',e.message);}}
  mfaGateFactorId=null;
  try{await sb.auth.signOut();}catch(e){}
  JUSTE_CONNECTE=false;
  showLogin();
}
async function parametresGrantAccess(){
  if(typeof kkLoginAlertCheck==='function')kkLoginAlertCheck(sb);
  document.getElementById('loginView').style.display='none';
  document.getElementById('appView').style.display='block';
  document.getElementById('whoAmI').textContent=(PROF.name||'')+' · Direction';
  await loadAll();
}
async function doLogin(){
  const e=val('liMail'),p=document.getElementById('liPwd').value;
  const{error}=await sb.auth.signInWithPassword({email:e,password:p});
  if(error){document.getElementById('liErr').textContent='Identifiants incorrects';return;}
  JUSTE_CONNECTE=true;
  document.getElementById('liPwd').value='';
  boot().catch(err=>{console.error('[boot]',err);showLogin('Connexion impossible — réessayez.');});
}
async function doLogout(){await sb.auth.signOut();location.href='index.html';}

/* ---------- CHARGEMENT ---------- */
async function loadAll(){
  try{
    const[c,e,r]=await Promise.all([
      sb.from('creches').select('*').order('name'),
      sb.from('etablissements').select('*'),
      sb.from('reseau_config').select('id,config').maybeSingle()
    ]);
    if(c.error)throw c.error;
    if(e.error)throw e.error;
    CRECHES=c.data||[];ETABS=e.data||[];
    RCFG=(r&&r.data&&r.data.config)||{};
    RCFG_ID=(r&&r.data&&r.data.id)||null;
    FERMETURES_RESEAU=toArr(RCFG.jours_fermeture_reseau).slice();
  }catch(err){
    console.error('[loadAll]',err);
    const msg=err.code==='42P01'
      ? 'Table absente — exécutez le script 25a.' : (err.message||'erreur inconnue');
    toast('Chargement impossible : '+msg,true);
    return;
  }
  if(!CRECHES.length){toast('Aucune crèche enregistrée.',true);return;}
  crecheId=CRECHES[0].id;
  // Table posée par le script kiosque_code_pointage.sql : peut ne pas encore
  // exister sur une base où l'étape 1 n'a pas été exécutée. Ne doit jamais
  // bloquer le reste de l'écran.
  try{
    const{data,error}=await sb.from('kiosk_devices').select('*').order('created_at');
    if(error)throw error;
    KIOSK_DEVICES=data||[];
  }catch(err){
    console.warn('[loadAll] kiosk_devices',err);
    KIOSK_DEVICES=[];
  }
  renderChips();renderEtab();renderReseau();
}

function renderChips(){
  document.getElementById('chips').innerHTML=CRECHES.map(c=>
    '<button class="chip'+(String(c.id)===String(crecheId)?' on':'')+'" onclick="pick(\''+c.id+'\')">'
    +esc(c.name)+'</button>').join('')
    +'<button class="chip" onclick="ajouterCreche()" title="Ajouter une crèche"><i class="ti ti-plus"></i> Ajouter une crèche</button>';
}

async function ajouterCreche(){
  if(dirty()&&!confirm('Les modifications non enregistrées seront perdues. Continuer ?'))return;
  const name=(prompt('Nom de la nouvelle crèche :')||'').trim();
  if(!name)return;
  const{data,error}=await sb.from('creches').insert({name:name}).select().single();
  if(error||!data){toast('Ajout impossible : '+((error&&error.message)||'droits insuffisants'),true);return;}
  CRECHES.push(data);
  crecheId=data.id;renderChips();renderEtab();
  toast('Crèche ajoutée — complétez sa fiche puis enregistrez.');
}

async function supprimerCreche(){
  const c=crecheDe(crecheId);if(!c)return;
  if(CRECHES.length<2){toast('Impossible de supprimer la seule crèche.',true);return;}
  const saisie=prompt('Supprimer définitivement « '+c.name+' » et ses données ?\nPour confirmer, recopiez exactement son nom :');
  if(saisie===null)return;
  if(saisie.trim()!==c.name){toast('Le nom ne correspond pas : suppression annulée.',true);return;}
  const{data,error}=await sb.from('creches').delete().eq('id',c.id).select('id');
  if(error||!data||!data.length){toast('Suppression impossible : '+((error&&error.message)||'droits insuffisants ou données liées'),true);return;}
  CRECHES=CRECHES.filter(x=>String(x.id)!==String(c.id));
  crecheId=CRECHES[0].id;renderChips();renderEtab();
  toast('Crèche supprimée.');
}
function pick(id){
  // Changer de crèche abandonne la saisie en cours : mieux vaut le dire que
  // de laisser croire qu'elle a été gardée.
  if(dirty()&&!confirm('Les modifications non enregistrées seront perdues. Continuer ?'))return;
  crecheId=id;renderChips();renderEtab();
}

function etabDe(id){return ETABS.find(x=>String(x.creche_id)===String(id))||null;}
function crecheDe(id){return CRECHES.find(x=>String(x.id)===String(id))||null;}

/* Empreinte du formulaire, pour détecter une saisie non enregistrée. */
let SNAP='';
function snapshot(){
  return ['cName','cAddr','cCap','cStgCap','cStgChev','rpContact','rpResp','eRaison','eForme','eSiret','eApe','eSiege','eCapital','eRcsVille','eRepNom','eRepQual',
    'eTel','eMail','ePmiNum','ePmiDate','ePmiEch','eAgeMin','eAgeMax','eHo','eHf',
    'eSemFerm','eSemFact','eObs'].map(val).join('|')
    +'|'+[...document.querySelectorAll('.ckJour:checked')].map(x=>x.value).join(',')
    +'|'+JSON.stringify(FERMETURES)+'|'+JSON.stringify(FERMETURES_RESEAU);
}
function dirty(){return SNAP!==''&&SNAP!==snapshot();}

function renderEtab(){
  const c=crecheDe(crecheId),e=etabDe(crecheId)||{};
  if(!c)return;
  setVal('cName',c.name);setVal('cAddr',c.addr);setVal('cCap',c.capacity);setVal('cCapSurnombre',c.capacity_surnombre);
  setVal('cStgCap',c.stagiaires_capacite);setVal('cStgChev',c.stagiaires_chevauchement_semaines);
  setVal('rpContact',c.repas_contact);setVal('rpResp',c.repas_responsable);
  setVal('eRaison',e.raison_sociale);setVal('eForme',e.forme_juridique);
  setVal('eSiret',e.siret);setVal('eApe',e.code_ape);setVal('eSiege',e.adresse_siege);
  setVal('eCapital',e.capital_social);setVal('eRcsVille',e.rcs_ville);
  setVal('eRepNom',e.representant_nom);setVal('eRepQual',e.representant_qualite);
  setVal('eTel',e.telephone);setVal('eMail',e.email);
  setVal('ePmiNum',e.pmi_numero);setVal('ePmiDate',e.pmi_date);setVal('ePmiEch',e.pmi_echeance);
  setVal('eAgeMin',e.age_min_mois);setVal('eAgeMax',e.age_max_mois);
  setVal('eHo',e.heure_ouverture);setVal('eHf',e.heure_fermeture);
  setVal('eSemFerm',e.semaines_fermeture!=null?e.semaines_fermeture:5);
  setVal('eSemFact',e.semaines_facturees!=null?e.semaines_facturees:47);
  setVal('eObs',e.observations);

  const jrs=e.jours_ouverture?toArr(e.jours_ouverture).map(Number):[1,2,3,4,5];
  document.getElementById('eJours').innerHTML=JOURS.map(j=>
    '<label><input type="checkbox" class="ckJour" value="'+j[0]+'" onchange="majFermCalHint()"'
    +(jrs.indexOf(j[0])>=0?' checked':'')+'><span>'+j[1]+'</span></label>').join('');

  FERMETURES=toArr(e.jours_fermeture).slice();
  renderFermetures();

  syncSiret();syncCap();syncPmi();syncSem();syncIdentite();
  document.getElementById('statut').textContent=etabDe(crecheId)
    ? '' : 'Aucune ligne en base pour cette crèche — elle sera créée à l\'enregistrement.';
  SNAP=snapshot();
  renderKiosk();
}

/* ---------- TABLETTES DE POINTAGE PAR CODE ---------- */
function kioskLinkFor(token){
  try{return new URL('tablette.html?k='+token,location.href).href;}
  catch(e){return location.href.replace(/[^/]*$/,'')+'tablette.html?k='+token;}
}
/* Même token que le pointage : la tablette pointe et fait le suivi santé/
   développement avec le même lien de base, juste une autre page. */
function suiviLinkFor(token){
  try{return new URL('suivi.html?k='+token,location.href).href;}
  catch(e){return location.href.replace(/[^/]*$/,'')+'suivi.html?k='+token;}
}
function renderKiosk(){
  const box=document.getElementById('kioskDevices');
  const h=document.getElementById('hKiosk');
  if(!box)return;
  const devices=KIOSK_DEVICES.filter(d=>String(d.creche_id)===String(crecheId));
  if(!devices.length){
    box.innerHTML='<p class="hint" style="margin:4px 0 0">Aucune tablette enregistrée pour cette crèche.</p>';
  }else{
    box.innerHTML=devices.map(d=>{
      const link=kioskLinkFor(d.token);
      const created=d.created_at?new Date(d.created_at).toLocaleDateString('fr-FR'):'';
      return '<div class="kiosk-row">'
        +'<div class="kiosk-info">'
          +'<div class="kiosk-label">'+esc(d.label||'Tablette sans nom')+'</div>'
          +'<div class="kiosk-meta">Créée le '+esc(created)+'</div>'
          +'<div class="kiosk-link">'+esc(link)+'</div>'
        +'</div>'
        +'<span class="kiosk-badge '+(d.active?'on':'off')+'">'+(d.active?'Active':'Désactivée')+'</span>'
        +'<div class="kiosk-acts">'
          +'<button class="btn btn-g btn-sm" onclick="kioskCopyLink(\''+esc(link)+'\')"><i class="ti ti-copy"></i> Copier le lien pointage</button>'
          +'<button class="btn btn-s btn-sm" onclick="kioskShowQr(\''+esc(link)+'\',\''+esc(d.label||'Tablette')+'\')"><i class="ti ti-qrcode"></i> QR code</button>'
          +'<button class="btn btn-g btn-sm" onclick="kioskCopyLink(\''+esc(suiviLinkFor(d.token))+'\')"><i class="ti ti-heart-handshake"></i> Copier le lien suivi</button>'
          +'<button class="btn btn-s btn-sm" onclick="window.open(\''+esc(suiviLinkFor(d.token))+'\',\'_blank\')"><i class="ti ti-external-link"></i> Ouvrir le suivi</button>'
          +'<button class="btn btn-g btn-sm" onclick="kioskToggleActive(\''+d.id+'\','+(!d.active)+')"><i class="ti ti-power"></i> '+(d.active?'Désactiver':'Réactiver')+'</button>'
          +'<button class="btn btn-g btn-sm" onclick="kioskRegen(\''+d.id+'\')"><i class="ti ti-refresh"></i> Régénérer le lien</button>'
        +'</div>'
      +'</div>';
    }).join('');
  }
  if(h)h.textContent='Le lien ouvre '+location.origin.replace(/^https?:\/\//,'')+'… — scannez le QR code avec l\'appareil photo de la tablette (ou ouvrez le lien copié), une seule fois, puis ajoutez la page à l\'écran d\'accueil.';
}

async function kioskNewDevice(){
  const label=prompt('Nom de cette tablette (ex. "Accueil", "Salle bleue")');
  if(label===null)return;
  try{
    const{data,error}=await sb.from('kiosk_devices')
      .insert({creche_id:crecheId,label:label.trim()||null})
      .select().single();
    if(error)throw error;
    KIOSK_DEVICES.push(data);
    renderKiosk();
    toast('Tablette créée ✅');
  }catch(e){
    console.error('[kioskNewDevice]',e);
    const msg=e.code==='42P01'
      ? 'Table absente — exécutez d\'abord sql/kiosque_code_pointage.sql.' : (e.message||'erreur inconnue');
    toast('Création impossible : '+msg,true);
  }
}
window.kioskNewDevice=kioskNewDevice;

async function kioskToggleActive(id,active){
  try{
    const{error}=await sb.from('kiosk_devices').update({active}).eq('id',id);
    if(error)throw error;
    const d=KIOSK_DEVICES.find(x=>String(x.id)===String(id));
    if(d)d.active=active;
    renderKiosk();
    toast(active?'Tablette réactivée ✅':'Tablette désactivée — son lien ne pointera plus.');
  }catch(e){
    console.error('[kioskToggleActive]',e);
    toast('Modification impossible : '+(e.message||'erreur inconnue'),true);
  }
}
window.kioskToggleActive=kioskToggleActive;

async function kioskRegen(id){
  if(!confirm('L\'ancien lien cessera de fonctionner immédiatement. Continuer ?'))return;
  const newToken=crypto.randomUUID();
  try{
    const{error}=await sb.from('kiosk_devices').update({token:newToken}).eq('id',id);
    if(error)throw error;
    const d=KIOSK_DEVICES.find(x=>String(x.id)===String(id));
    if(d)d.token=newToken;
    renderKiosk();
    toast('Nouveau lien généré — pensez à le recharger sur la tablette.');
  }catch(e){
    console.error('[kioskRegen]',e);
    toast('Régénération impossible : '+(e.message||'erreur inconnue'),true);
  }
}
window.kioskRegen=kioskRegen;

async function kioskCopyLink(link){
  try{
    await navigator.clipboard.writeText(link);
    toast('Lien copié dans le presse-papiers.');
  }catch(e){
    console.warn('[kioskCopyLink]',e);
    toast('Copie impossible — sélectionnez le lien manuellement.',true);
  }
}
window.kioskCopyLink=kioskCopyLink;

/* Scanner ce QR avec l'appareil photo de la tablette ouvre directement le
   lien de pointage dans Chrome : plus rapide et plus sûr que de retaper ou
   copier/coller une longue URL sur un appareil qu'on configure une fois. */
let QR_LINK='';
function kioskShowQr(link,label){
  document.getElementById('qrTitle').textContent='Tablette « '+label+' »';
  const box=document.getElementById('qrBox');
  box.innerHTML='';
  QR_LINK=link;
  let ok=false;
  if(typeof QRCode==='function'){
    try{new QRCode(box,{text:link,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});ok=true;}
    catch(e){console.warn('QRCode lib KO',e);}
  }
  if(!ok){
    const img=document.createElement('img');
    img.width=220;img.height=220;img.alt='QR code';
    img.src='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(link);
    box.appendChild(img);
  }
  const p=document.createElement('p');
  p.className='qr-link';
  p.textContent=link;
  box.appendChild(p);
  const cp=document.createElement('button');
  cp.className='btn btn-s btn-sm';
  cp.style.marginTop='10px';
  cp.innerHTML='<i class="ti ti-copy"></i> Copier le lien';
  cp.onclick=()=>kioskCopyLink(QR_LINK);
  box.appendChild(cp);
  document.getElementById('ovQr').classList.add('on');
}
window.kioskShowQr=kioskShowQr;
function closeQr(){document.getElementById('ovQr').classList.remove('on');}
window.closeQr=closeQr;

function renderReseau(){
  setVal('rValid',RCFG.devis_validite_jours!=null?RCFG.devis_validite_jours:30);
  setVal('rMentions',RCFG.devis_mentions);
  /* Le contrat retombe sur la validité du devis tant qu'il n'a pas la sienne :
     une valeur par défaut vaut mieux qu'un champ vide sur un écran qu'on
     ouvrira peut-être une seule fois. */
  setVal('rCtValid',RCFG.contrat_validite_jours!=null?RCFG.contrat_validite_jours
    :(RCFG.devis_validite_jours!=null?RCFG.devis_validite_jours:30));
  setVal('rPreavisMois',RCFG.preavis_mois!=null?RCFG.preavis_mois:1);
  setVal('rPreavis',RCFG.preavis_resiliation);
  setVal('rCondResil',RCFG.conditions_resiliation);
  setVal('rCtMentions',RCFG.contrat_mentions);
  setVal('rFacJourEnvoi',RCFG.facturation_jour_envoi!=null?RCFG.facturation_jour_envoi:10);
  setVal('rFacJourEch',RCFG.facturation_jour_echeance!=null?RCFG.facturation_jour_echeance:20);
  setVal('rFacFraisImpaye',RCFG.frais_dossier_impaye!=null?RCFG.frais_dossier_impaye:40);
  setVal('rModesReglement',RCFG.modes_reglement);
  setVal('rFacMentions',RCFG.facture_mentions);
  setVal('rFacDeductions',RCFG.facture_deductions);
  setVal('rPied',RCFG.pied_page);
  document.getElementById('rOtpSignature').checked=RCFG.otp_signature_active===true;
  setVal('rNotifDebut',RCFG.notif_silence_debut||'19:00');
  setVal('rNotifFin',RCFG.notif_silence_fin||'08:00');
  document.getElementById('rNotifSamedi').checked=RCFG.notif_silence_samedi!==false;
  document.getElementById('rNotifDimanche').checked=RCFG.notif_silence_dimanche!==false;
  document.getElementById('rNotifFeries').checked=RCFG.notif_silence_feries!==false;
  syncPreavis();
}

function showTab(t){
  document.getElementById('paneEtab').style.display=t==='etab'?'':'none';
  document.getElementById('paneReseau').style.display=t==='reseau'?'':'none';
  document.getElementById('tabEtab').className='tab'+(t==='etab'?' on':'');
  document.getElementById('tabReseau').className='tab'+(t==='reseau'?' on':'');
}

/* ---------- CONTRÔLES DE SAISIE ---------- */
/* Un SIRET est un SIREN (9 chiffres) suivi d'un NIC (5). La clé de Luhn se
   vérifie sans réseau : autant signaler une coquille ici plutôt que de la
   retrouver sur un devis parti chez une famille. */
function luhnOk(s){
  let t=0;
  for(let i=0;i<s.length;i++){
    let d=+s[s.length-1-i];
    if(i%2===1){d*=2;if(d>9)d-=9;}
    t+=d;
  }
  return t%10===0;
}
function syncSiret(){
  const s=val('eSiret').replace(/\s/g,'');
  const h=document.getElementById('hSiret');
  if(!s){h.textContent='14 chiffres : les 9 du SIREN, puis les 5 du NIC de l\'établissement.';h.style.color='';return;}
  if(!/^\d+$/.test(s)){h.textContent='Le SIRET ne contient que des chiffres.';h.style.color='var(--red)';return;}
  if(s.length!==14){h.textContent='SIRET incomplet : '+s.length+' chiffres sur 14.';h.style.color='var(--amber)';return;}
  if(!luhnOk(s)){h.textContent='Ces 14 chiffres ne forment pas un SIRET valide — vérifiez la saisie.';h.style.color='var(--red)';return;}
  h.textContent='SIRET valide. SIREN '+s.slice(0,9)+', établissement '+s.slice(9)+'.';h.style.color='var(--green)';
  syncIdentite();
}
/* Ces quatre champs ne servaient qu'à l'en-tête du devis, où leur absence
   laissait un simple blanc. Ils nomment désormais la personne morale qui
   s'engage dans le contrat d'accueil : un contrat qui ne dit pas qui contracte
   est attaquable, et c'est le premier point qu'un contrôle regarde. On le
   signale ici plutôt que de le laisser découvrir sur un contrat signé. */
function syncIdentite(){
  const h=document.getElementById('hIdent');
  if(!h)return;
  const manque=[];
  if(!val('eRaison'))manque.push('la raison sociale');
  if(!val('eSiret'))manque.push('le SIRET');
  if(!val('eSiege'))manque.push('l\'adresse du siège');
  if(!val('eRepNom'))manque.push('le représentant légal');
  if(!manque.length){
    h.textContent='Ces informations nomment la crèche dans la clause « Entre les soussignés » du contrat d\'accueil.';
    h.style.color='';
    return;
  }
  h.innerHTML='<b>Le contrat d\'accueil de cette crèche sortira incomplet</b> : il manque '
    +esc(manque.join(', '))+'. Ce sont les informations qui nomment la partie qui s\'engage, '
    +'dans la clause « Entre les soussignés ».';
  h.style.color='var(--red)';
}
function syncCap(){
  const n=num('cCap');
  const h=document.getElementById('hCap');
  if(n!=null&&n>12){
    h.textContent='Au-delà de 12 berceaux, la structure n\'est plus une micro-crèche : le régime PAJE et le CMG structure ne s\'appliquent plus.';
    h.style.color='var(--red)';
  }else{
    h.textContent='La capacité agréée est le nombre de berceaux autorisés par la PMI — 12 au maximum pour une micro-crèche. À ne pas confondre avec l\'effectif public du registre de sécurité, qui compte aussi les adultes.';
    h.style.color='';
  }
}
function syncPmi(){
  const d=val('ePmiDate'),e=val('ePmiEch');
  const h=document.getElementById('hPmi');
  if(!e){h.textContent='L\'autorisation PMI est délivrée pour 5 ans renouvelables.';h.style.color='';return;}
  if(d&&e<d){h.textContent='L\'échéance précède la date d\'autorisation.';h.style.color='var(--red)';return;}
  const j=Math.round((new Date(e+'T00:00:00')-new Date(auj()+'T00:00:00'))/86400000);
  if(j<0){h.textContent='Autorisation échue depuis le '+dfr(e)+'.';h.style.color='var(--red)';}
  else if(j<180){h.textContent='Autorisation à renouveler dans '+j+' jours (échéance le '+dfr(e)+').';h.style.color='var(--amber)';}
  else{h.textContent='Valable jusqu\'au '+dfr(e)+'.';h.style.color='';}
}
/* La durée du préavis n'est qu'une PROPOSITION : l'écran de résiliation la
   calcule puis laisse corriger la date, parce qu'un départ négocié ou une
   dispense ne suivent pas la règle générale. Le dire ici évite de croire que
   ce nombre s'impose. */
function syncPreavis(){
  const m=num('rPreavisMois');
  const h=document.getElementById('hPreavis');
  if(!h)return;
  if(m==null||!isFinite(m)){
    h.textContent='En l\'absence de valeur, le module Contrats proposera un mois.';h.style.color='';return;
  }
  if(m<0){h.textContent='Une durée de préavis ne peut pas être négative.';h.style.color='var(--red)';return;}
  h.style.color='';
  h.textContent=m===0
    ? 'Sans préavis : la résiliation proposera le jour même comme dernier jour d\'accueil.'
    : 'À la résiliation, l\'application proposera un dernier jour d\'accueil à '+String(m).replace('.',',')
      +' mois de la notification. La date reste corrigeable au cas par cas — départ négocié, '
      +'dispense de préavis, ou préavis courant jusqu\'à la fin du mois civil.';
}
/* Les deux nombres sont liés : 52 semaines moins les fermetures. On propage
   dans le sens de la dernière saisie plutôt que d'imposer une direction — la
   direction connaît parfois son nombre de semaines facturées avant son
   calendrier de fermeture. */
function syncSem(depuisFact){
  const ferm=num('eSemFerm'),fact=num('eSemFact');
  if(!depuisFact&&ferm!=null)setVal('eSemFact',52-ferm);
  else if(depuisFact&&fact!=null)setVal('eSemFerm',52-fact);
  const f=num('eSemFact');
  const h=document.getElementById('hSem');
  if(f==null){h.textContent='';h.style.color='';return;}
  if(!Number.isInteger(f)){
    // La base stocke ces deux champs en integer : autant le dire avant
    // l'enregistrement plutot que de laisser Postgres refuser la ligne.
    h.textContent='Ces deux champs se comptent en semaines entières. Pour une fermeture qui ne tombe pas juste, arrondissez au plus proche.';
    h.style.color='var(--red)';return;
  }
  h.style.color='';
  h.textContent='Les devis de cette crèche mensualiseront sur '+f+' semaines : montant hebdomadaire × '+f+' ÷ 12.';
  majFermCalHint();
}

/* Estime, à partir du calendrier de fermeture réellement saisi (établissement
   + réseau) plutôt que de la seule déclaration ci-dessus, le nombre de
   semaines fermées sur l'année scolaire en cours (1er septembre → 31 août) —
   jour par jour, sur les seuls jours d'ouverture de la crèche. Une fenêtre
   glissante de 365 jours depuis aujourd'hui exclurait à tort les fermetures
   d'été déjà passées quand on regarde ça à la rentrée ; l'année scolaire est
   le repère que suit le calendrier de fermeture saisi dans Paramètres.
   Sert uniquement à repérer un écart : on ne réécrit jamais "Semaines de
   fermeture par an" tout seul, car c'est ce chiffre qui mensualise les
   contrats sans terme, et le changer sans validation reviendrait à modifier
   des montants facturés dans le dos de la direction. */
function fermetureCalendrierSemaines(){
  const jrsOuverture=[...document.querySelectorAll('.ckJour:checked')].map(c=>Number(c.value));
  if(!jrsOuverture.length)return null;
  const set={};jrsOuverture.forEach(j=>{set[j]=1;});
  const auj=new Date();auj.setHours(12,0,0,0);
  const anneeDebut=auj.getMonth()>=8?auj.getFullYear():auj.getFullYear()-1;   // 8 = septembre
  const d0=new Date(anneeDebut,8,1,12,0,0);
  const d1=new Date(anneeDebut+1,7,31,12,0,0);
  const fermees=new Set();
  FERMETURES.concat(FERMETURES_RESEAU).forEach(f=>{
    if(!f||!f.debut)return;
    const a=new Date(String(f.debut).slice(0,10)+'T12:00:00');
    const b=f.fin?new Date(String(f.fin).slice(0,10)+'T12:00:00'):a;
    if(isNaN(a)||isNaN(b)||b<a)return;
    for(const d=new Date(a);d<=b;d.setDate(d.getDate()+1)){
      if(d>=d0&&d<=d1)fermees.add(d.toISOString().slice(0,10));
    }
  });
  if(!fermees.size)return null;
  let joursFermes=0;
  fermees.forEach(iso=>{
    const d=new Date(iso+'T12:00:00');
    const js=d.getDay()===0?7:d.getDay();
    if(set[js])joursFermes++;
  });
  return Math.round(joursFermes/jrsOuverture.length*10)/10;
}
function majFermCalHint(){
  const h=document.getElementById('hFermCal');
  if(!h)return;
  const calc=fermetureCalendrierSemaines();
  if(calc==null){h.textContent='';return;}
  const manuel=num('eSemFerm');
  const calcTxt=String(calc).replace('.',',');
  if(manuel!=null&&Math.abs(calc-manuel)>=1){
    h.innerHTML='<i class="ti ti-alert-triangle"></i> Le calendrier de fermeture ci-dessus indique environ <b>'
      +calcTxt+' semaines</b> fermées sur l\'année scolaire en cours, contre <b>'+manuel
      +'</b> saisies dans « Semaines de fermeture par an ». Ajustez ce champ si le calendrier est à jour — '
      +'les contrats sans terme se mensualisent dessus.';
    h.style.color='var(--amber)';
  }else{
    h.innerHTML='Cohérent avec le calendrier de fermeture ci-dessus : environ '+calcTxt
      +' semaines sur l\'année scolaire en cours.';
    h.style.color='';
  }
}

/* ---------- JOURS DE FERMETURE ---------- */
/* Une fermeture réseau vit dans reseau_config (une seule saisie pour les 6
   crèches) ; une fermeture propre à l'établissement vit dans
   etablissements.jours_fermeture. Les deux s'affichent fondues dans la même
   liste, pour que la direction n'ait pas à se souvenir d'où vient quoi. */
function fermDfr(d){return dfr(d);}
function renderFermetures(){
  const box=document.getElementById('fermList');
  const tous=FERMETURES.map((f,i)=>({f,i,scope:'creche'}))
    .concat(FERMETURES_RESEAU.map((f,i)=>({f,i,scope:'reseau'})));
  if(!tous.length){box.innerHTML='<p class="ferm-empty">Aucune fermeture particulière enregistrée.</p>';majFermCalHint();return;}
  tous.sort((a,b)=>String(a.f.debut||'').localeCompare(String(b.f.debut||'')));
  box.innerHTML=tous.map(({f,i,scope})=>{
    const dates=f.fin&&f.fin!==f.debut?(fermDfr(f.debut)+' → '+fermDfr(f.fin)):fermDfr(f.debut);
    const type=FERM_TYPES[f.type]||f.type||'';
    return '<div class="ferm-row">'
      +'<span class="ferm-badge '+esc(f.type||'')+'">'+esc(type)+'</span>'
      +'<div class="ferm-info"><div class="ferm-dates">'+esc(dates)+'</div>'
      +(scope==='reseau'?'<div class="ferm-scope"><i class="ti ti-network"></i> Toutes les crèches</div>':'')
      +(f.label?'<div class="ferm-label">'+esc(f.label)+'</div>':'')+'</div>'
      +'<button type="button" class="btn btn-g btn-sm" onclick="fermRemove(\''+scope+'\','+i+')"><i class="ti ti-trash"></i></button>'
      +'</div>';
  }).join('');
  majFermCalHint();
}
function fermAdd(){
  const debut=val('fermDebut');
  if(!debut){toast('Indiquez au moins une date de début.',true);return;}
  let fin=val('fermFin')||debut;
  if(fin<debut){toast('La date de fin ne peut pas précéder la date de début.',true);return;}
  const entry={type:val('fermType')||'vacances',debut,fin,label:val('fermLabel')};
  if(document.getElementById('fermReseau').checked)FERMETURES_RESEAU.push(entry);
  else FERMETURES.push(entry);
  setVal('fermDebut','');setVal('fermFin','');setVal('fermLabel','');
  document.getElementById('fermReseau').checked=false;
  renderFermetures();
}
function fermRemove(scope,i){
  (scope==='reseau'?FERMETURES_RESEAU:FERMETURES).splice(i,1);
  renderFermetures();
}

/* ---------- ENREGISTREMENT ---------- */
async function save(){
  const btn=document.getElementById('btnSave');
  const st=document.getElementById('statut');
  const s=val('eSiret').replace(/\s/g,'');
  if(s&&(s.length!==14||!/^\d+$/.test(s)||!luhnOk(s))
     &&!confirm('Le SIRET saisi ne paraît pas valide. L\'enregistrer quand même ?'))return;
  // Les ages s'expriment en mois et acceptent le demi-mois : un accueil
  // demarre couramment a 2,5 mois. Les semaines et la capacite, elles, sont
  // des entiers en base.
  const amin=num('eAgeMin'),amax=num('eAgeMax');
  if((amin!=null&&!isFinite(amin))||(amax!=null&&!isFinite(amax))){
    toast('Âge illisible : indiquez un nombre de mois, 2,5 pour deux mois et demi.',true);return;}
  let stgCap,stgChev,cap,capSurnombre,semFerm,semFact,valid,ctValid,facJourEnvoi,facJourEch;
  try{
    cap    =entier('cCap','La capacité agréée');
    stgCap =entier('cStgCap','La capacité stagiaires');
    stgChev=entier('cStgChev','Le chevauchement toléré');
    capSurnombre=entier('cCapSurnombre','L\'effectif max en cas de surnombre');
    semFerm=entier('eSemFerm','Les semaines de fermeture');
    semFact=entier('eSemFact','Les semaines facturées');
    valid  =entier('rValid','La validité du devis');
    ctValid=entier('rCtValid','La validité du lien de signature');
    facJourEnvoi=entier('rFacJourEnvoi','Le jour d\'envoi des factures');
    facJourEch  =entier('rFacJourEch','Le jour d\'échéance des factures');
  }catch(e){toast(e.message,true);return;}
  if(facJourEnvoi!=null&&(facJourEnvoi<1||facJourEnvoi>28)){toast('Le jour d\'envoi des factures doit être compris entre 1 et 28.',true);return;}
  if(facJourEch!=null&&(facJourEch<1||facJourEch>28)){toast('Le jour d\'échéance des factures doit être compris entre 1 et 28.',true);return;}
  const fraisImpaye=num('rFacFraisImpaye');
  if(fraisImpaye!=null&&(!isFinite(fraisImpaye)||fraisImpaye<0)){toast('Les frais de dossier impayé doivent être un montant positif.',true);return;}
  if(amin!=null&&amax!=null&&amin>amax){toast('L\'âge minimum dépasse l\'âge maximum.',true);return;}
  if((stgCap!=null&&(stgCap<1||stgCap>20))||(stgChev!=null&&(stgChev<0||stgChev>8))){
    toast('Stagiaires : entre 1 et 20 places, et un chevauchement de 0 à 8 semaines.',true);return;}
  if(capSurnombre!=null&&cap!=null&&capSurnombre<cap){toast('L\'effectif max en cas de surnombre ne peut pas être inférieur à la capacité agréée.',true);return;}
  /* Le préavis accepte le demi-mois — quinze jours est une durée courante —
     mais pas le négatif, qui ferait proposer une fin de préavis antérieure à
     sa notification et se ferait refuser par contrats_preavis_ck. */
  const preavisMois=num('rPreavisMois');
  if(preavisMois!=null&&(!isFinite(preavisMois)||preavisMois<0)){
    toast('La durée du préavis doit être un nombre de mois positif — 0,5 pour quinze jours.',true);return;}

  btn.disabled=true;st.textContent='Enregistrement…';
  try{
    // 1. Les champs qui vivent déjà dans creches, modifiés sur place.
    const cr={name:val('cName'),addr:val('cAddr'),capacity:cap,capacity_surnombre:capSurnombre,
      stagiaires_capacite:stgCap,stagiaires_chevauchement_semaines:stgChev,
      repas_contact:val('rpContact')||null,repas_responsable:val('rpResp')||null};
    const{error:ec}=await sb.from('creches').update(cr).eq('id',crecheId);
    if(ec)throw ec;
    Object.assign(crecheDe(crecheId),cr);

    // 2. L'identité, en upsert sur creche_id.
    const row={
      creche_id:crecheId,
      raison_sociale:val('eRaison'),forme_juridique:val('eForme'),
      siret:s,code_ape:val('eApe'),adresse_siege:val('eSiege'),
      capital_social:val('eCapital'),rcs_ville:val('eRcsVille'),
      representant_nom:val('eRepNom'),representant_qualite:val('eRepQual'),
      telephone:val('eTel'),email:val('eMail'),
      pmi_numero:val('ePmiNum'),
      pmi_date:val('ePmiDate')||null,pmi_echeance:val('ePmiEch')||null,
      age_min_mois:amin,age_max_mois:amax,
      jours_ouverture:[...document.querySelectorAll('.ckJour:checked')].map(x=>Number(x.value)),
      heure_ouverture:val('eHo'),heure_fermeture:val('eHf'),
      semaines_fermeture:semFerm!=null?semFerm:5,
      semaines_facturees:semFact!=null?semFact:47,
      jours_fermeture:FERMETURES,
      observations:val('eObs'),
      updated_at:new Date().toISOString()
    };
    const{data,error:ee}=await sb.from('etablissements')
      .upsert(row,{onConflict:'creche_id'}).select().single();
    if(ee)throw ee;
    const i=ETABS.findIndex(x=>String(x.creche_id)===String(crecheId));
    if(i>=0)ETABS[i]=data;else ETABS.push(data);

    /* 3. Les paramètres réseau. On repart de RCFG plutôt que de reconstruire
       l'objet de zéro : une clé posée par un autre module — ou par une version
       plus récente de cet écran — serait sinon effacée à chaque enregistrement
       depuis un onglet qui ne la connaît pas. `config` est un jsonb libre,
       c'est justement ce qui rend cette précaution nécessaire. */
    const cfg=Object.assign({},RCFG,{
      devis_validite_jours:valid!=null?valid:30,
      devis_mentions:val('rMentions'),
      contrat_validite_jours:ctValid!=null?ctValid:(valid!=null?valid:30),
      preavis_mois:preavisMois!=null?preavisMois:1,
      preavis_resiliation:val('rPreavis'),
      conditions_resiliation:val('rCondResil'),
      contrat_mentions:val('rCtMentions'),
      facturation_jour_envoi:facJourEnvoi!=null?facJourEnvoi:10,
      facturation_jour_echeance:facJourEch!=null?facJourEch:20,
      frais_dossier_impaye:fraisImpaye!=null?fraisImpaye:40,
      modes_reglement:val('rModesReglement'),
      facture_mentions:val('rFacMentions'),
      facture_deductions:val('rFacDeductions'),
      pied_page:val('rPied'),
      otp_signature_active:document.getElementById('rOtpSignature').checked,
      notif_silence_debut:val('rNotifDebut')||'19:00', notif_silence_fin:val('rNotifFin')||'08:00',
      notif_silence_samedi:document.getElementById('rNotifSamedi').checked,
      notif_silence_dimanche:document.getElementById('rNotifDimanche').checked,
      notif_silence_feries:document.getElementById('rNotifFeries').checked,
      jours_fermeture_reseau:FERMETURES_RESEAU});
    /* La base refuse un UPDATE sans WHERE : on cible la ligne chargée. */
    if(!RCFG_ID)throw new Error('Configuration réseau introuvable : rechargez la page.');
    const{error:er}=await sb.from('reseau_config')
      .update({config:cfg,updated_at:new Date().toISOString()}).eq('id',RCFG_ID);
    if(er)throw er;
    RCFG=cfg;

    renderChips();syncIdentite();
    SNAP=snapshot();
    st.textContent='Enregistré à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'.';
    toast('Paramètres enregistrés ✅');
  }catch(e){
    console.error('[save]',e);
    st.textContent='';
    const msg=e.code==='42501'
      ? 'Droits insuffisants sur la table creches — voir la partie 6 du script 25a.'
      : (e.code==='42P01' ? 'Table absente — exécutez le script 25a.' : (e.message||'erreur inconnue'));
    toast('Enregistrement impossible : '+msg,true);
  }finally{btn.disabled=false;}
}

/* Sortie accidentelle avec une saisie en cours. */
window.addEventListener('beforeunload',ev=>{
  if(dirty()){ev.preventDefault();ev.returnValue='';}
});

boot().catch(e=>{console.error('[boot]',e);showLogin('Démarrage impossible — réessayez.');});
