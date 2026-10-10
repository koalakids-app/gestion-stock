const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
document.getElementById('gcss').textContent=KKGuide.css;

let ME=null,PROF=null,IS_ADMIN=false,IS_DIRECTION=false;
let CATS=[],DOCS=[],CRECHES=[],ETABS=[],RESEAU={};
let editDocId=null,fillDoc=null,fillRep=null,ENFANTS=[];

// creches.name porte la raison sociale complète ("Koalakids Toulon Brunet") ;
// plusieurs formulaires stockent le libellé court ("Brunet") depuis toujours.
// On le dérive en retirant les préfixes d'enseigne/ville — ce qui reproduit
// exactement les libellés historiques Koala Kids. Repli sur le nom complet
// si une organisation ne suit pas ce schéma.
function shortCrecheName(nom){
  return String(nom||'').replace(/^Koalakids\s+/i,'').replace(/^Toulon\s+/i,'').trim()||nom;
}
let CRECHE_NOMS_COURTS=['Brunet','Cuers','Ollioules','Picot 1','Picot 2','St Jean'];

/* Fiche d'identité (SIRET, PMI, coordonnées) posée par parametres.html :
   la même donnée que le devis et le contrat, pour que l'en-tête du registre
   de sécurité ne diverge jamais de celle des autres documents sortants. */
function etabDe(id){return ETABS.find(x=>String(x.creche_id)===String(id))||{};}

function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2600);}
function close_(id){document.getElementById(id).classList.remove('on');}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function slug(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9.\-_]/g,'_');}

/* ---------- AUTH ---------- */
/* Ecran de connexion : il doit s'afficher dans TOUS les cas ou l'application ne
   peut pas demarrer. Auparavant, la moindre erreur pendant boot() (session
   expiree, jeton non rafraichi, reseau coupe, lecture de `referents` refusee)
   interrompait la fonction avant la ligne qui affiche une vue : la page restait
   entierement blanche, sans application ni formulaire de connexion. C'est ce qui
   se produisait en arrivant ici depuis demandes.html. */
/* Passe a true juste apres une saisie reussie d'identifiants : autorise boot()
   a demarrer l'application sans redeclencher la deconnexion obligatoire. */
let JUSTE_CONNECTE=false;
function showLoginView(msg){
  document.getElementById('appView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='block';
  document.getElementById('mfaGateBox').style.display='none';
  document.getElementById('liErr').textContent=msg||'';
}
async function boot(){
  let session=null;
  /* Regle d'acces, alignee sur demandes.html (postes partages) :
     - arrivee depuis demandes.html (parametres ?doc= / ?rep= / ?enf=) :
       la session en cours est conservee, pas de seconde saisie ;
     - arrivee directe, notamment depuis le hub index.html qui n'authentifie
       personne : deconnexion systematique puis ecran de connexion obligatoire.
     Sans cette regle, ouvrir Documents depuis le hub donnait acces au fonds
     documentaire sans aucune identification, avec la session laissee par
     l'utilisateur precedent. */
  const _q=new URLSearchParams(location.search);
  const VENANT_DE_DEMANDES=_q.has('doc')||_q.has('rep')||_q.has('enf');
  if(!VENANT_DE_DEMANDES&&!JUSTE_CONNECTE){
    try{await sb.auth.signOut();}catch(e){console.warn('[boot] signOut',e);}
    showLoginView();
    return;
  }
  try{
    const r=await sb.auth.getSession();
    session=(r&&r.data&&r.data.session)||null;
    /* Session heritee de demandes.html mais jeton arrive a expiration :
       on tente un rafraichissement avant de conclure a une deconnexion. */
    if(session&&session.expires_at&&session.expires_at*1000<Date.now()+10000){
      const{data:rd}=await sb.auth.refreshSession();
      session=(rd&&rd.session)||null;
    }
  }catch(e){console.warn('[boot] session',e);session=null;}
  if(!session||!session.user){showLoginView();return;}
  ME=session.user;
  let p=null;
  try{
    const{data,error}=await sb.from('referents').select('*').eq('user_id',ME.id).maybeSingle();
    if(error)throw error;
    p=data;
  }catch(e){
    console.error('[boot] profil',e);
    showLoginView('Session expirée ou profil inaccessible — merci de vous reconnecter.');
    return;
  }
  /* Un compte authentifie mais absent de la table `referents` n'a rien a faire
     dans le fonds documentaire : on refuse l'entree au lieu de l'ouvrir en
     lecture seule anonyme. */
  if(!p){
    try{await sb.auth.signOut();}catch(e){}
    showLoginView('Compte non reconnu — contactez la direction.');
    return;
  }
  PROF=p;
  if(window.KKBranding)KKBranding.applyBranding(sb);
  IS_ADMIN=!!p&&(p.role==='direction'||p.role==='referent');
  /* Seule la direction cree, modifie ou supprime des documents et des categories.
     Les referentes consultent, remplissent en ligne et telechargent (lecture seule
     sur le fonds documentaire). Verrouillage reel assure par les policies RLS
     restrictives cote Supabase ; ce drapeau ne fait que masquer l’interface. */
  IS_DIRECTION=!!p&&p.role==='direction';
  // Même obligation MFA qu'après le login classique de demandes.html : une session
  // héritée (arrivée via ?doc=/?rep=/?enf=) ou tout juste authentifiée par mot de
  // passe ne donne pas accès à l'app tant que l'AAL2 (second facteur) n'est pas
  // acquis pour cette session précise.
  await mfaGateCheckAndProceed();
}
// --- Mémorisation de l'appareil : évite de redemander le code à chaque
// reconnexion (déconnexion systématique à chaque ouverture, cf. plus haut) sur
// le même navigateur, en le limitant à 24h glissantes. Stocké en localStorage
// (propre à ce navigateur/appareil), pas en base : ne dispense donc jamais du
// mot de passe, seulement du code à 6 chiffres.
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
function mfaClearTrusted(){
  try{localStorage.removeItem(mfaTrustKey());}catch(e){}
}
// --- Portail MFA obligatoire (même logique que demandes.html, adaptée à cette page) ---
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
    if(data.currentLevel==='aal2'){await documentsGrantAccess();return;}
    if(data.nextLevel==='aal2'){
      if(mfaIsTrusted()){await documentsGrantAccess();return;}
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
    // Nettoyage des facteurs non vérifiés laissés par une tentative précédente,
    // sinon enroll() échoue avec "friendly name already exists".
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
    // qr_code peut être du SVG brut ou une data-URI dont le payload SVG n'est pas
    // encodé : concaténer dans une chaîne HTML casserait l'attribut src="" au
    // premier guillemet. On extrait le SVG s'il y en a un, sinon on assigne l'URL
    // via la propriété DOM .src (jamais interprétée comme du HTML).
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
    await documentsGrantAccess();
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
    await documentsGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateCancel(){
  if(mfaGateFactorId){try{await sb.auth.mfa.unenroll({factorId:mfaGateFactorId});}catch(e){console.warn('Nettoyage annulation MFA gate échoué :',e.message);}}
  mfaGateFactorId=null;
  try{await sb.auth.signOut();}catch(e){}
  JUSTE_CONNECTE=false;
  showLoginView();
}
async function documentsGrantAccess(){
  if(typeof kkLoginAlertCheck==='function')kkLoginAlertCheck(sb);
  document.getElementById('loginView').style.display='none';
  document.getElementById('appView').style.display='block';
  document.getElementById('whoAmI').textContent=PROF?(PROF.name||'')+(PROF.role==='direction'?' · Direction':''):'';
  document.querySelectorAll('.adminonly').forEach(e=>e.style.display=IS_DIRECTION?'':'none');
  await loadAll();
}
async function doLogin(){
  const e=document.getElementById('liMail').value.trim(),p=document.getElementById('liPwd').value;
  const{error}=await sb.auth.signInWithPassword({email:e,password:p});
  if(error){document.getElementById('liErr').textContent='Identifiants incorrects';return;}
  /* Pas de location.reload() : un rechargement sans parametres d'URL
     redeclencherait la deconnexion obligatoire et bouclerait sur l'ecran de
     connexion. On enchaine directement sur boot(). */
  JUSTE_CONNECTE=true;
  document.getElementById('liPwd').value='';
  boot().catch(err=>{console.error('[boot]',err);showLoginView('Connexion impossible — réessayez.');});
}
async function doLogout(){await sb.auth.signOut();location.reload();}

/* ---------- LOAD ---------- */
async function loadAll(){
  const[c,d,cr,en,et,rz,sg]=await Promise.all([
    sb.from('doc_categories').select('*').order('ordre'),
    sb.from('documents_koala').select('*').eq('actif',true).order('titre'),
    sb.from('creches').select('id,name,addr').order('name'),
    sb.from('enfants').select('id,prenom,nom,creche_id,dob,regime_repas').order('prenom'),
    sb.from('etablissements').select('*'),
    sb.from('reseau_config').select('config').maybeSingle(),
    sb.from('doc_signataires').select('*').eq('actif',true).order('ordre')
  ]);
  SIGNATAIRES=(sg&&sg.data)||[];
  CATS=c.data||[];DOCS=d.data||[];CRECHES=cr.data||[];ENFANTS=en.data||[];
  if(CRECHES.length)CRECHE_NOMS_COURTS=CRECHES.map(x=>shortCrecheName(x.name));
  // Absence de ligne (script 25a pas exécuté) : le registre de sécurité et les
  // autres documents retombent alors sur les seules données de `creches`.
  ETABS=et.data||[];
  RESEAU=(rz&&rz.data&&rz.data.config)||{};
  const sel=document.getElementById('fCreche');
  sel.innerHTML='<option value="all">Toutes les crèches</option>'+CRECHES.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  if(PROF&&PROF.role==='referent'&&PROF.creche_id)sel.value=PROF.creche_id;
  await sdChargerEtats();
  render();
  openFromUrl();
}

/* Ouverture automatique d'un document (et éventuellement d'une réponse précise)
   via les paramètres d'URL : ?doc=<documentId>&rep=<reponseId>
   Utilisé par le module Enfants de demandes.html pour rebondir sur un document. */
let RETURN_ENFANT_ID=null;   // si ouvert depuis la fiche d'un enfant, on mémorise son id pour le retour
let RETURN_EMPLOYE_ID=null;  // si ouvert depuis la fiche d'un(e) collaborateur/trice (contrat de travail)
let RETURN_EMPLOYE_SRC=null; // 'demandes' (par défaut) ou 'employes' : quelle page a ouvert le contrat

function openFromUrl(){
  try{
    const q=new URLSearchParams(location.search);
    const docId=q.get('doc');
    if(!docId)return;
    const repId=q.get('rep')||null;
    RETURN_ENFANT_ID=q.get('enf')||null;
    if(RETURN_ENFANT_ID)installerRetourEnfant();
    RETURN_EMPLOYE_ID=q.get('emp')||null;
    RETURN_EMPLOYE_SRC=q.get('empSrc')||'demandes';
    if(RETURN_EMPLOYE_ID)installerRetourEmploye();
    const doc=DOCS.find(d=>d.id===docId);
    if(!doc){toast('Document introuvable ou inaccessible');return;}
    // nettoyer l'URL pour éviter une réouverture au rechargement
    history.replaceState(null,'',location.pathname);
    openFill(docId,repId,false);
  }catch(e){console.warn('openFromUrl',e);}
}

/* Venu du dossier d'un enfant : le chemin du retour doit rester visible en
   permanence. Jusqu'ici il n'apparaissait qu'apres un enregistrement — celui
   qui consultait sans rien saisir devait repasser par le portail, et se
   reconnecter. */
function installerRetourEnfant(){
  const barre=document.createElement('div');
  barre.id='retourEnfantTop';
  barre.style.cssText='background:#EEEDF8;border-bottom:1px solid #D6D3EA;padding:9px 14px;'
    +'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap';
  barre.innerHTML='<span style="font-size:12.5px;color:#3D3580;font-weight:600">'
    +'Vous venez du dossier d\u2019un enfant.</span>'
    +'<button class="btn btn-p" style="padding:7px 13px;font-size:13px" onclick="returnToEnfant()">'
    +'<i class="ti ti-arrow-back-up"></i> Revenir au dossier de l\u2019enfant</button>';
  const top=document.querySelector('.topbar');
  if(top&&top.parentNode)top.parentNode.insertBefore(barre,top.nextSibling);
  /* La fleche de la barre de titre ramene au dossier, pas au portail. */
  const fleche=document.querySelector('.topbar a.iconbtn[href="index.html"]');
  if(fleche){
    fleche.removeAttribute('href');
    fleche.style.cursor='pointer';
    fleche.title='Revenir au dossier de l\u2019enfant';
    fleche.onclick=returnToEnfant;
  }
}

/* Renvoie vers la fiche de l'enfant (onglet Documents) dans demandes.html */
function returnToEnfant(){
  if(!RETURN_ENFANT_ID)return;
  location.href='demandes.html?enfant='+encodeURIComponent(RETURN_ENFANT_ID);
}

/* Même principe que installerRetourEnfant(), pour le contrat de travail
   ouvert depuis la fiche collaborateur/trice (demandes.html ou employes.html
   selon RETURN_EMPLOYE_SRC — cf. le lien « Ouvrir » de chacune). */
function installerRetourEmploye(){
  const barre=document.createElement('div');
  barre.id='retourEmployeTop';
  barre.style.cssText='background:#EEEDF8;border-bottom:1px solid #D6D3EA;padding:9px 14px;'
    +'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap';
  barre.innerHTML='<span style="font-size:12.5px;color:#3D3580;font-weight:600">'
    +'Vous venez de la fiche d’un(e) collaborateur/trice.</span>'
    +'<button class="btn btn-p" style="padding:7px 13px;font-size:13px" onclick="returnToEmploye()">'
    +'<i class="ti ti-arrow-back-up"></i> Revenir à la fiche collaborateur/trice</button>';
  const top=document.querySelector('.topbar');
  if(top&&top.parentNode)top.parentNode.insertBefore(barre,top.nextSibling);
  const fleche=document.querySelector('.topbar a.iconbtn[href="index.html"]');
  if(fleche){
    fleche.removeAttribute('href');
    fleche.style.cursor='pointer';
    fleche.title='Revenir à la fiche collaborateur/trice';
    fleche.onclick=returnToEmploye;
  }
}
function returnToEmploye(){
  if(!RETURN_EMPLOYE_ID)return;
  const page=RETURN_EMPLOYE_SRC==='employes'?'employes.html':'demandes.html';
  location.href=page+'?employe='+encodeURIComponent(RETURN_EMPLOYE_ID);
}

/* Garde-fou commun a toutes les actions d’ecriture sur le fonds documentaire.
   Renvoie true si l’action doit etre interrompue. */
function blocDirection(){
  if(IS_DIRECTION)return false;
  toast('Action réservée à la direction');
  return true;
}

/* ---------- RENDER ---------- */
const OPEN_CATS=new Set();
function toggleCat(h,key){
  const c=h.parentElement;
  c.classList.toggle('closed');
  if(c.classList.contains('closed'))OPEN_CATS.delete(key);else OPEN_CATS.add(key);
}
function render(){
  const q=document.getElementById('q').value.toLowerCase().trim();
  const ft=document.getElementById('fType').value;
  const fc=document.getElementById('fCreche').value;
  let docs=DOCS.filter(d=>{
    if(ft!=='all'&&d.type!==ft)return false;
    if(fc!=='all'&&d.creche_id&&d.creche_id!==fc)return false;
    if(q&&!((d.titre||'')+' '+(d.description||'')).toLowerCase().includes(q))return false;
    return true;
  });
  const el=document.getElementById('list');
  if(!docs.length){el.innerHTML='<div class="empty"><i class="ti ti-folder-off"></i>Aucun document</div>';return;}
  let html='';
  const roots=CATS.filter(c=>!c.parent_id).sort(CAT_ALPHA);
  roots.push({id:null,nom:'Sans catégorie',couleur:'#A8A29E'});
  roots.forEach(cat=>{html+=catNodeHtml(cat,docs,1,!!q).html;});
  el.innerHTML=html;
}

/* Comparateurs partagés */
const CAT_ALPHA=(a,b)=>(a.nom||'').localeCompare(b.nom||'','fr',{sensitivity:'base'});
const DOC_ALPHA=(a,b)=>(a.titre||'').localeCompare(b.titre||'','fr',{sensitivity:'base'});

/* Rendu récursif d'une catégorie et de ses descendants (jusqu'à MAX_CAT_DEPTH niveaux).
   Retourne {html,total} ; total = documents de la catégorie + ceux de toute sa descendance.
   Une branche sans aucun document n'est pas affichée. */
function catNodeHtml(cat,docs,depth,qActive){
  if(depth>MAX_CAT_DEPTH+1)return{html:'',total:0};
  const kids=cat.id?CATS.filter(c=>c.parent_id===cat.id).sort(CAT_ALPHA):[];
  const own=docs.filter(d=>(d.categorie_id||null)===(cat.id||null)).sort(DOC_ALPHA);
  let inner='',subTotal=0;
  kids.forEach(k=>{
    const r=catNodeHtml(k,docs,depth+1,qActive);
    if(r.total){inner+=r.html;subTotal+=r.total;}
  });
  const total=own.length+subTotal;
  if(!total)return{html:'',total:0};
  const key=(depth>1?'sub_':'')+String(cat.id||'none');
  const open=qActive?true:OPEN_CATS.has(key);
  const body=own.map(docRowHtml).join('')+inner;
  let html;
  if(depth===1){
    html=`<div class="cat${open?'':' closed'}"><div class="cat-h" onclick="toggleCat(this,'${key}')">
      <span class="cat-dot" style="background:${esc(cat.couleur||'#4A3F9F')}"></span>
      <h2>${esc(cat.nom)}</h2><span class="cat-n">${total}</span>
      <i class="ti ti-chevron-down" style="color:var(--muted)"></i></div><div class="cat-b">${body}</div></div>`;
  }else{
    const dot=depth===2?'9px':'8px';
    html=`<div class="sub${depth>=3?' sub3':''}${open?'':' closed'}"><div class="sub-h" onclick="event.stopPropagation();toggleSub(this,'${key}')">
      <span class="cat-dot" style="width:${dot};height:${dot};background:${esc(cat.couleur||'#8E8AA8')}"></span>
      <h3>${esc(cat.nom)}</h3><span class="cat-n">${total}</span>
      <i class="ti ti-chevron-down" style="color:var(--muted)"></i></div><div class="sub-b">${body}</div></div>`;
  }
  return{html,total};
}

function docRowHtml(d){
  const fill=d.type==='remplissable';
  const crName=d.creche_id?(CRECHES.find(c=>c.id===d.creche_id)||{}).name:null;
  return `<div class="doc">
    <div class="doc-i ${fill?'fill':'dl'}"><i class="ti ti-${fill?'forms':'file-download'}"></i></div>
    <div class="doc-t"><h3>${esc(d.titre)}</h3>
      <p>${esc(d.description||'')}${sdTag(d)}${crName?' <span class="tag">'+esc(crName)+'</span>':' <span class="tag">Tous sites</span>'}${d.pack_familiarisation?' <span class="tag" style="background:#EEEDF8;color:#3D3580;font-weight:700">👪 Familiarisation'+(d.pack_ordre?' · '+d.pack_ordre:'')+(d.pack_imprimer?' · à imprimer':'')+'</span>':''}</p></div>
    <div class="doc-a">
      ${fill?`<button class="iconbtn" title="Remplir" onclick="openFill('${d.id}')"><i class="ti ti-pencil"></i></button>
              <button class="iconbtn" title="Réponses" onclick="openReps('${d.id}')"><i class="ti ti-list"></i></button>`
            :(d.fichier_url?`<button class="iconbtn" title="Aperçu" onclick="apercuFichier('${d.id}')"><i class="ti ti-eye"></i></button>
              <a class="iconbtn" title="Télécharger" href="${esc(d.fichier_url)}" target="_blank" rel="noopener"><i class="ti ti-download"></i></a>`:'')}
      ${sdEligible(d)&&/\.docx(\?|$)/i.test(d.fichier_url)&&sdSignes(d).length?`<button class="iconbtn" title="Télécharger le Word signé" onclick="sdTelechargerDocx('${d.id}')"><i class="ti ti-file-type-doc"></i></button>`:''}
      ${sdEligible(d)?`<button class="iconbtn" title="Envoyer pour signature" onclick="sdEnvoyer('${d.id}')"><i class="ti ti-signature"></i></button>`:''}
      ${IS_DIRECTION?`<button class="iconbtn" title="Modifier" onclick="openDoc('${d.id}')"><i class="ti ti-edit"></i></button>
      <button class="iconbtn d" title="Supprimer" onclick="delDoc('${d.id}')"><i class="ti ti-trash"></i></button>`:''}
    </div></div>`;
}
function toggleSub(h,key){
  const c=h.parentNode;c.classList.toggle('closed');
  if(c.classList.contains('closed'))OPEN_CATS.delete(key);else OPEN_CATS.add(key);
}
function catOptionsHtml(){
  let o='';
  const walk=(list,depth)=>{
    if(depth>=MAX_CAT_DEPTH+1)return;
    list.sort(CAT_ALPHA).forEach(c=>{
      const pad='\u00A0'.repeat(depth*3);
      o+=`<option value="${c.id}">${pad}${depth?'— ':''}${esc(c.nom)}</option>`;
      walk(CATS.filter(k=>k.parent_id===c.id),depth+1);
    });
  };
  walk(CATS.filter(c=>!c.parent_id),0);
  return o;
}

/* ---------- HIERARCHIE DES CATEGORIES ---------- */
const MAX_CAT_DEPTH=3;                 // profondeur maximale autorisée
function catDepth(id){                 // 1 = catégorie racine
  let d=1,cur=CATS.find(c=>c.id===id),g=0;
  while(cur&&cur.parent_id&&g++<20){d++;cur=CATS.find(c=>c.id===cur.parent_id);}
  return d;
}
function catHeight(id){                // 1 = aucune sous-catégorie
  const kids=CATS.filter(c=>c.parent_id===id);
  if(!kids.length)return 1;
  return 1+Math.max.apply(null,kids.map(k=>catHeight(k.id)));
}
function catIsDescendant(id,ancestorId){
  let cur=CATS.find(c=>c.id===id),g=0;
  while(cur&&cur.parent_id&&g++<20){
    if(cur.parent_id===ancestorId)return true;
    cur=CATS.find(c=>c.id===cur.parent_id);
  }
  return false;
}
function catPath(id){                  // « Protocoles › Médicaux »
  const names=[];let cur=CATS.find(c=>c.id===id),g=0;
  while(cur&&g++<20){names.unshift(cur.nom||'');cur=cur.parent_id?CATS.find(c=>c.id===cur.parent_id):null;}
  return names.join(' › ');
}

/* ---------- CATEGORIE ---------- */
let editCatId=null;
function openCat(id){
  if(blocDirection())return;
  editCatId=id||null;
  const cur=id?CATS.find(c=>c.id===id):null;
  document.getElementById('catTitle').textContent=cur?'Modifier la catégorie':'Nouvelle catégorie';
  document.getElementById('cNom').value=cur?(cur.nom||''):'';
  document.getElementById('cCoul').value=cur?(cur.couleur||'#4A3F9F'):'#4A3F9F';
  /* Parents possibles : toute catégorie qui n'est ni elle-même ni un de ses descendants,
     et dont la profondeur additionnée à la hauteur du sous-arbre déplacé reste <= MAX_CAT_DEPTH. */
  const h=cur?catHeight(cur.id):1;
  let opts='<option value="">— Aucune (catégorie principale) —</option>';
  const cands=CATS.filter(c=>c.id!==editCatId
      &&!(editCatId&&catIsDescendant(c.id,editCatId))
      &&catDepth(c.id)+h<=MAX_CAT_DEPTH)
    .sort((a,b)=>catPath(a.id).localeCompare(catPath(b.id),'fr',{sensitivity:'base'}));
  cands.forEach(c=>{opts+=`<option value="${c.id}">${esc(catPath(c.id))}</option>`;});
  const sel=document.getElementById('cParent');
  sel.innerHTML=opts;
  sel.disabled=false;
  if(cur&&cur.parent_id)sel.value=cur.parent_id;
  const hint=document.getElementById('cParentHint');
  if(hint){
    hint.textContent=cands.length?'':(h>1
      ?'Cette catégorie contient déjà '+(h-1)+' niveau(x) de sous-catégories : elle ne peut pas descendre plus bas ('+MAX_CAT_DEPTH+' niveaux maximum).'
      :'Aucune catégorie parente disponible.');
    hint.style.display=hint.textContent?'':'none';
  }
  const ov=document.getElementById('ovCat');
  ov.style.zIndex=document.getElementById('ovCatMgr').classList.contains('on')?'160':'';
  ov.classList.add('on');
}
async function saveCat(){
  if(blocDirection())return;
  const nom=document.getElementById('cNom').value.trim();
  if(!nom)return toast('Nom requis');
  const parent=document.getElementById('cParent').value||null;
  if(parent){
    if(editCatId&&(parent===editCatId||catIsDescendant(parent,editCatId)))
      return toast('Déplacement impossible : la cible est une sous-catégorie de celle-ci');
    const hh=editCatId?catHeight(editCatId):1;
    if(catDepth(parent)+hh>MAX_CAT_DEPTH)
      return toast('Profondeur maximale de '+MAX_CAT_DEPTH+' niveaux atteinte');
  }
  const coul=document.getElementById('cCoul').value;
  let error;
  if(editCatId){
    ({error}=await sb.from('doc_categories').update({nom,parent_id:parent,couleur:coul}).eq('id',editCatId));
  }else{
    ({error}=await sb.from('doc_categories').insert({nom,parent_id:parent,couleur:coul,ordre:CATS.length+1}));
  }
  if(error)return toast('Erreur : '+error.message);
  close_('ovCat');document.getElementById('ovCat').style.zIndex='';
  toast(editCatId?'Catégorie modifiée':'Catégorie créée');
  editCatId=null;
  await loadAll();
  if(document.getElementById('ovCatMgr').classList.contains('on'))renderCatMgr();
}

/* ---------- GESTION DES CATEGORIES ---------- */
function openCatMgr(){if(blocDirection())return;renderCatMgr();document.getElementById('ovCatMgr').classList.add('on');}
function renderCatMgr(){
  const roots=CATS.filter(c=>!c.parent_id).sort(CAT_ALPHA);
  if(!roots.length&&!CATS.length){
    document.getElementById('catMgrList').innerHTML='<div class="empty"><i class="ti ti-folder-off"></i>Aucune catégorie</div>';return;
  }
  const row=(c,depth)=>{
    const n=DOCS.filter(d=>d.categorie_id===c.id).length;
    const dot=depth===0?'11px':(depth===1?'9px':'8px');
    return `<div class="chip" style="margin-left:${depth*18}px">
      <span class="cat-dot" style="width:${dot};height:${dot};background:${esc(c.couleur||'#4A3F9F')}"></span>
      <span style="flex:1">${esc(c.nom)} <span style="color:var(--muted)">(${n})</span></span>
      <button class="iconbtn" title="Modifier" onclick="openCat('${c.id}')"><i class="ti ti-edit"></i></button>
      <button class="iconbtn d" title="Supprimer" onclick="delCat('${c.id}')"><i class="ti ti-trash"></i></button>
    </div>`;
  };
  let h='';
  const walk=(list,depth)=>{
    if(depth>MAX_CAT_DEPTH)return;
    list.sort(CAT_ALPHA).forEach(c=>{
      h+=row(c,depth);
      walk(CATS.filter(k=>k.parent_id===c.id),depth+1);
    });
  };
  walk(roots,0);
  document.getElementById('catMgrList').innerHTML=h;
}
async function delCat(id){
  if(blocDirection())return;
  const c=CATS.find(x=>x.id===id);if(!c)return;
  if(CATS.some(x=>x.parent_id===id))return toast('Supprimer d\'abord les sous-catégories');
  const n=DOCS.filter(d=>d.categorie_id===id).length;
  if(!confirm(`Supprimer la catégorie « ${c.nom} » ?`+(n?`\n\n${n} document(s) passeront en « Sans catégorie ».`:'')))return;
  if(n){
    const{error:e1}=await sb.from('documents_koala').update({categorie_id:null}).eq('categorie_id',id);
    if(e1)return toast('Erreur : '+e1.message);
  }
  const{error}=await sb.from('doc_categories').delete().eq('id',id);
  if(error)return toast('Erreur : '+error.message);
  toast('Catégorie supprimée');await loadAll();renderCatMgr();
}

/* ---------- DOCUMENT ---------- */
/* Le numero d'ordre n'a de sens que si le document fait partie du pack. */
function togglePack(){
  const on=document.getElementById('dPack').checked;
  document.getElementById('fPackOrdre').style.display=on?'':'none';
}

function toggleType(){
  const t=document.getElementById('dType').value;
  const tpl=(document.getElementById('dTpl')||{}).value||'';
  document.getElementById('fFile').style.display=t==='telechargeable'?'':'none';
  document.getElementById('fTpl').style.display=t==='remplissable'?'':'none';
  /* Un modele predefini apporte sa propre mise en page : le constructeur de
     champs libres n’a plus lieu d’etre. */
  document.getElementById('fSchema').style.display=(t==='remplissable'&&!tpl)?'':'none';
  const hint=document.getElementById('dTplHint');
  if(hint)hint.textContent=tpl
    ? 'Formulaire complet fourni par l’application : les champs ci-dessous sont ignorés.'
    : 'Laisser sur « Formulaire libre » pour définir vous-même les champs.';
}
/* Remplit le selecteur de modeles a partir des cles reellement presentes dans
   TPL, pour qu’un nouveau modele apparaisse sans retoucher cette fonction. */
function tplOptionsHtml(sel){
  const cles=Object.keys(typeof TPL!=='undefined'?TPL:{});
  cles.sort((a,b)=>(TPL_LABELS[a]||a).localeCompare(TPL_LABELS[b]||b,'fr',{sensitivity:'base'}));
  return '<option value="">— Formulaire libre (champs personnalisés) —</option>'
    +cles.map(k=>`<option value="${esc(k)}"${sel===k?' selected':''}>${esc(TPL_LABELS[k]||k)}</option>`).join('');
}
function addChamp(lab,typ){
  const d=document.createElement('div');d.className='chip';
  d.innerHTML=`<input placeholder="Libellé du champ" value="${esc(lab||'')}">
    <select><option value="text">Texte</option><option value="textarea">Zone de texte</option>
    <option value="number">Nombre</option><option value="date">Date</option><option value="checkbox">Case à cocher</option></select>
    <button class="iconbtn d" onclick="this.parentNode.remove()"><i class="ti ti-x"></i></button>`;
  if(typ)d.querySelector('select').value=typ;
  document.getElementById('champs').appendChild(d);
}
function openDoc(id){
  if(blocDirection())return;
  editDocId=id||null;
  document.getElementById('docTitle').textContent=id?'Modifier le document':'Nouveau document';
  document.getElementById('dCat').innerHTML='<option value="">— Aucune —</option>'+catOptionsHtml();
  const allowAll=!PROF||PROF.role==='direction';
  document.getElementById('dCreche').innerHTML=(allowAll?'<option value="">Toutes les crèches</option>':'')+CRECHES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  document.getElementById('champs').innerHTML='';
  document.getElementById('dTpl').innerHTML=tplOptionsHtml(id?(DOCS.find(x=>x.id===id)||{}).template_key||'':'');
  document.getElementById('dFile').value='';
  document.getElementById('dFileCur').textContent='';
  if(id){
    const d=DOCS.find(x=>x.id===id);
    document.getElementById('dTitre').value=d.titre||'';
    document.getElementById('dDesc').value=d.description||'';
    document.getElementById('dCat').value=d.categorie_id||'';
    document.getElementById('dCreche').value=d.creche_id||'';
    document.getElementById('dType').value=d.type;
    if(d.fichier_nom)document.getElementById('dFileCur').textContent='Fichier actuel : '+d.fichier_nom;
    (d.schema_champs||[]).forEach(c=>addChamp(c.label,c.type));
    document.getElementById('dPack').checked=!!d.pack_familiarisation;
    document.getElementById('dPackOrdre').value=d.pack_ordre||0;
    document.getElementById('dPackImprimer').checked=!!d.pack_imprimer;
  }else{
    document.getElementById('dTitre').value='';
    document.getElementById('dDesc').value='';
    document.getElementById('dType').value='telechargeable';
    if(PROF&&PROF.role==='referent'&&PROF.creche_id)document.getElementById('dCreche').value=PROF.creche_id;
    document.getElementById('dPack').checked=false;
    document.getElementById('dPackOrdre').value=0;
    document.getElementById('dPackImprimer').checked=false;
  }
  togglePack();
  toggleType();
  document.getElementById('ovDoc').classList.add('on');
}
async function saveDoc(){
  if(blocDirection())return;
  const titre=document.getElementById('dTitre').value.trim();
  if(!titre)return toast('Titre requis');
  const btn=document.getElementById('dSave');btn.disabled=true;btn.textContent='Enregistrement…';
  try{
    const type=document.getElementById('dType').value;
    const row={
      titre,
      description:document.getElementById('dDesc').value.trim()||null,
      categorie_id:document.getElementById('dCat').value||null,
      creche_id:document.getElementById('dCreche').value||null,
      type,
      pack_familiarisation:document.getElementById('dPack').checked,
      pack_ordre:parseInt(document.getElementById('dPackOrdre').value,10)||0,
      pack_imprimer:document.getElementById('dPack').checked&&document.getElementById('dPackImprimer').checked
    };
    if(type==='remplissable'){
      const tplKey=document.getElementById('dTpl').value||null;
      row.template_key=tplKey;
      row.schema_champs=tplKey?[]:[...document.querySelectorAll('#champs .chip')].map((c,i)=>({
        key:'f'+i,label:c.querySelector('input').value.trim()||('Champ '+(i+1)),type:c.querySelector('select').value
      }));
    }else{
      row.template_key=null;
      const f=document.getElementById('dFile').files[0];
      if(f){
        const path='documents/'+Date.now()+'_'+slug(f.name);
        const{error:ue}=await sb.storage.from('assets').upload(path,f,{upsert:true});
        if(ue)throw ue;
        row.fichier_url=sb.storage.from('assets').getPublicUrl(path).data.publicUrl;
        row.fichier_nom=f.name;
      }
    }
    let error;
    if(editDocId){({error}=await sb.from('documents_koala').update(row).eq('id',editDocId));}
    else{row.created_by=ME.id;({error}=await sb.from('documents_koala').insert(row));}
    if(error)throw error;
    close_('ovDoc');toast('Document enregistré');await loadAll();
  }catch(e){toast('Erreur : '+(e.message||e));}
  btn.disabled=false;btn.textContent='Enregistrer';
}
/* ---------- IMPORT EN MASSE DEPUIS UN DOSSIER ---------- */
async function bulkImport(input){
  if(blocDirection()){input.value='';return;}
  const files=[...input.files].filter(f=>f.size>0 && !/^\./.test(f.name) && f.name!=='Thumbs.db');
  input.value='';
  if(!files.length)return;
  if(!confirm(files.length+' fichier(s) détecté(s). Lancer l\'import ?'))return;
  const prog=document.getElementById('bulkProg');
  const crecheId=(PROF&&PROF.role==='referent'&&PROF.creche_id)?PROF.creche_id:null;
  let ok=0,ko=0;
  const catMap={};
  CATS.forEach(c=>catMap[(c.parent_id||'root')+'/'+c.nom.toLowerCase()]=c.id);

  async function ensureCat(nom,parentId){
    const k=(parentId||'root')+'/'+nom.toLowerCase();
    if(catMap[k])return catMap[k];
    const{data,error}=await sb.from('doc_categories')
      .insert({nom,parent_id:parentId,couleur:parentId?'#8E8AA8':'#4A3F9F',ordre:Object.keys(catMap).length+1})
      .select().maybeSingle();
    if(error)throw error;
    catMap[k]=data.id;
    return data.id;
  }

  for(let i=0;i<files.length;i++){
    const f=files[i];
    prog.textContent='Import '+(i+1)+'/'+files.length+'\u2026';
    try{
      const parts=(f.webkitRelativePath||f.name).split('/');
      let catId=null;
      if(parts.length>=2){
        const rootId=await ensureCat(parts[0],null);
        catId=rootId;
        if(parts.length>=3)catId=await ensureCat(parts[parts.length-2],rootId);
      }
      const path='documents/'+Date.now()+'_'+i+'_'+slug(f.name);
      const{error:ue}=await sb.storage.from('assets').upload(path,f,{upsert:true});
      if(ue)throw ue;
      const{error:ie}=await sb.from('documents_koala').insert({
        titre:f.name.replace(/\.[^.]+$/,''),
        description:null,
        categorie_id:catId,
        creche_id:crecheId,
        type:'telechargeable',
        fichier_url:sb.storage.from('assets').getPublicUrl(path).data.publicUrl,
        fichier_nom:f.name,
        created_by:ME.id
      });
      if(ie)throw ie;
      ok++;
    }catch(e){ko++;console.warn('Import KO',f.name,e);}
  }
  prog.textContent='';
  toast(ok+' importé(s)'+(ko?' — '+ko+' échec(s)':''));
  await loadAll();
}

async function delDoc(id){
  if(blocDirection())return;
  if(!confirm('Supprimer ce document ?'))return;
  const{error}=await sb.from('documents_koala').update({actif:false}).eq('id',id);
  if(error)return toast('Erreur : '+error.message);
  toast('Supprimé');loadAll();
}

/* ---------- REMPLISSAGE ---------- */
/* Vrai uniquement si l’utilisateur a lui-meme touche au selecteur de statut
   pendant cette saisie. Un « signe » herite d’un chargement ou repercute
   automatiquement apres un enregistrement ne compte pas : sans cela le statut
   s’auto-entretient et le document reste marque signe apres effacement. */
let fillStatutManuel=false;

/* Documents RH : la personne concernee est le salarie, pas un enfant.
   Le selecteur « Enfant concerne » (et le filtre creche qui ne sert qu’a
   raccourcir la liste d’enfants) sont masques pour ces modeles. */
/* Libelles affiches dans le selecteur « Modele predefini » de la fenetre
   Nouveau document. La cle est celle de l’objet TPL ; un modele ajoute a TPL
   sans entree ici reste selectionnable, affiche sous sa cle technique. */
const TPL_LABELS={
  vaccinations:'Suivi des vaccinations obligatoires (enfant)',
  fiche_sanitaire:'Fiche sanitaire de liaison (enfant)',
  fiche_liaison:'Fiche de liaison (enfant)',
  fiche_renseignements:'Fiche de renseignements sur l’enfant (enfant)',
  antipyretique:'Autorisation d’administrer un antipyrétique (enfant)',
  creme_solaire:'Autorisation d’application de crème solaire (enfant)',
  medicament_ponctuel:'Autorisation famille — prise de médicament ponctuelle (enfant)',
  reglement_medicaments:'Règlement produits d’hygiène et médicaments (enfant)',
  entretien_annuel:'Entretien annuel professionnel (salarié)',
  grille:'Grille d’évaluation (salarié)',
  eaje:'Contrôle EAJE — grille d’auto-contrôle (établissement)',
  cerfa_17580:'CERFA n° 17580*01 — autorisation EAJE (établissement)',
  contrat_travail:'Contrat de travail (salarié)'
};
const TPL_SALARIE=['entretien_annuel','grille'];
/* Documents d’etablissement (contrôle EAJE…) : ils ne concernent ni un enfant
   ni un salarie, la crec̀he est saisie dans le formulaire lui-même.
   contrat_travail est un hybride : salarie (pas d'enfant a choisir) ET site
   choisi dans le formulaire pour pre-remplir l'employeur depuis Parametres
   — cf. crecheIdDuFormulaire(). */
const TPL_ETABLISSEMENT=['eaje','cerfa_17580','contrat_travail','livret_stagiaire'];
function docConcerneSalarie(){
  const k=fillDoc&&fillDoc.template_key;
  return !!(k&&(TPL_SALARIE.indexOf(k)>=0||TPL_ETABLISSEMENT.indexOf(k)>=0));
}
/* Le document en cours est-il un document d'etablissement ? */
function docEstEtablissement(){
  const k=fillDoc&&fillDoc.template_key;
  return !!(k&&TPL_ETABLISSEMENT.indexOf(k)>=0);
}
/* Crec̀he portee par le formulaire lui-meme (selecteur « Crèche » de la grille
   EAJE / du CERFA). Le formulaire stocke le NOM ; la base attend l'identifiant.
   Sans cette resolution, la reponse part avec la creche du PROFIL — donc null
   pour un compte direction, et la fiche devient invisible aux referentes. */
function crecheIdDuFormulaire(){
  const ids=['ff_ctrl_creche','ff_site_nom','ff_creche'];
  for(let i=0;i<ids.length;i++){
    const el=document.getElementById(ids[i]);
    const nom=el&&el.value?String(el.value).trim():'';
    if(!nom)continue;
    const c=(typeof CRECHES!=='undefined'?CRECHES:[]).find(x=>(x.name||'').trim()===nom);
    if(c)return c.id;
  }
  return null;
}

function fillMetaOptions(selEnfant,selStatut){
  const selC=document.getElementById('fillCreche');
  const wrap=document.getElementById('fillCrecheWrap');
  const wrapE=document.getElementById('fillEnfantWrap');
  const isRef=!!(PROF&&PROF.role==='referent'&&PROF.creche_id);

  if(docConcerneSalarie()){
    if(wrapE)wrapE.style.display='none';
    if(wrap)wrap.style.display='none';
    const selE=document.getElementById('fillEnfant');
    if(selE){selE.innerHTML='<option value=""></option>';selE.value='';}
    if(selC)selC.innerHTML='';
    fillUpdatePdfBtnLabel();
    const st0=document.getElementById('fillStatut');
    st0.value=(selStatut==='signe')?'signe':'prepare';
    fillStatutManuel=false;
    st0.onchange=()=>{fillStatutManuel=true;};
    return;
  }
  if(wrapE)wrapE.style.display='';
  /* Directrice technique : la liste est déjà limitée à sa crèche, le filtre n’a pas lieu d’être.
     Direction : filtre crèche pour raccourcir la liste d’enfants. */
  if(isRef){
    if(wrap)wrap.style.display='none';
    if(selC)selC.innerHTML='';
  }else if(selC){
    if(wrap)wrap.style.display='';
    const enf0=selEnfant?ENFANTS.find(e=>e.id===selEnfant):null;
    selC.innerHTML='<option value="">— Toutes les crèches —</option>'+
      CRECHES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    selC.value=(enf0&&enf0.creche_id)?enf0.creche_id:'';
    selC.onchange=()=>fillEnfantOptions((document.getElementById('fillEnfant')||{}).value||'');
  }
  fillEnfantOptions(selEnfant||'');
  const st=document.getElementById('fillStatut');
  st.value=(selStatut==='signe')?'signe':'prepare';
  fillStatutManuel=false;
  st.onchange=()=>{fillStatutManuel=true;};
}

/* Liste des enfants, filtrée par la crèche choisie (direction) ou par la crèche
   de la directrice technique. Conserve l’enfant sélectionné s’il reste dans la liste. */
function fillEnfantOptions(selEnfant){
  const sel=document.getElementById('fillEnfant');
  if(!sel)return;
  let list=ENFANTS.slice();
  if(PROF&&PROF.role==='referent'&&PROF.creche_id){
    list=list.filter(e=>e.creche_id===PROF.creche_id);
  }else{
    const cid=(document.getElementById('fillCreche')||{}).value||'';
    if(cid)list=list.filter(e=>e.creche_id===cid);
  }
  list.sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr',{sensitivity:'base'})
    ||(a.nom||'').localeCompare(b.nom||'','fr',{sensitivity:'base'}));
  sel.innerHTML='<option value="">— Aucun enfant —</option>'+
    list.map(e=>`<option value="${e.id}">${esc((e.prenom||'')+' '+(e.nom||''))}</option>`).join('');
  sel.value=(selEnfant&&list.some(e=>e.id===selEnfant))?selEnfant:'';
  // libellé du bouton PDF selon le contexte, et mise à jour si l’enfant change
  sel.onchange=()=>{fillUpdatePdfBtnLabel();prefillEnfant();};
  fillUpdatePdfBtnLabel();
  prefillEnfant();
}

/* « Générer le PDF » (conserve) si un enfant est rattaché ou si on vient de la fiche enfant ;
   « Éditer le PDF » (comportement effacement) sinon. */
function fillUpdatePdfBtnLabel(){
  const btn=document.getElementById('btnPdfReset');
  if(!btn)return;
  /* Document de reference (annuaire, tableau de bord…) : une seule reponse,
     mise a jour en continu. L'export ne doit jamais vider le formulaire. */
  const btnNew=document.getElementById('btnNewRep');
  if(fillDoc&&fillDoc.doc_reference){
    btn.innerHTML='<i class="ti ti-file-type-pdf"></i> Exporter en PDF';
    if(btnNew)btnNew.style.display='none';
    return;
  }
  if(btnNew)btnNew.style.display='';
  /* Document d'etablissement (controle EAJE, CERFA) : piece d'archive, jamais
     un brouillon jetable. L'export conserve la fiche. Le bouton « Nouveau »
     reste visible : une creche remplit legitimement plusieurs grilles par an. */
  if(docEstEtablissement()){
    btn.innerHTML='<i class="ti ti-file-type-pdf"></i> Exporter en PDF';
    return;
  }
  const enfantSel=(document.getElementById('fillEnfant')||{}).value||'';
  const contexteEnfant=(!!enfantSel || !!RETURN_ENFANT_ID) && !docConcerneSalarie();
  btn.innerHTML=contexteEnfant
    ? '<i class="ti ti-file-type-pdf"></i> Générer le PDF'
    : '<i class="ti ti-file-type-pdf"></i> Éditer le PDF';
}

async function openFill(id,repId,forceNew){
  const _rb=document.getElementById('returnEnfantBar');if(_rb)_rb.style.display='none';
  fillDoc=DOCS.find(d=>d.id===id);fillRep=null;
  let vals={};
  if(repId){
    const{data}=await sb.from('documents_reponses').select('*').eq('id',repId).maybeSingle();
    if(data){fillRep=data;vals=data.donnees||{};}
  }else if(!forceNew){
    /* Reprend la derniere saisie EN COURS de l’utilisateur pour ce document.
       Une reponse rattachee a un enfant a quitte cette page : elle vit dans le
       dossier de l’enfant et ne doit plus etre rechargee ici, sinon le document
       resterait « occupe » dans la liste au lieu de redevenir vierge. */
    const{data}=await sb.from('documents_reponses').select('*')
      .eq('document_id',id).eq('rempli_par',ME.id).is('enfant_id',null)
      .order('updated_at',{ascending:false}).limit(1);
    if(data&&data.length){fillRep=data[0];vals=data[0].donnees||{};}
  }
  document.getElementById('fillTitle').textContent=fillDoc.titre;

  /* --- Template dédié --- */
  const tpl=TPL[fillDoc.template_key];
  const modFill=document.querySelector('#ovFill .modal');
  if(modFill)modFill.classList.toggle('lg',!!(tpl&&tpl.large));
  if(tpl){
    Object.keys(SIGS).forEach(k=>delete SIGS[k]);
    if(vals._sigs)Object.assign(SIGS,vals._sigs);
    const v={};tpl.fields.forEach(f=>v[f]=vals[f]!=null?vals[f]:'');
    document.getElementById('fillArea').innerHTML=tpl.html(v);
    document.getElementById('fillState').textContent=fillRep
      ? 'Reprise de la saisie du '+new Date(fillRep.updated_at||fillRep.created_at).toLocaleString('fr-FR')
      : 'Nouvelle saisie';
    // 1) remplir les métadonnées (enfant/statut) et 2) afficher la modale AVANT
    //    de monter les canvas de signature, pour que getBoundingClientRect() soit fiable.
    fillMetaOptions(fillRep?fillRep.enfant_id:(RETURN_ENFANT_ID||''),fillRep?fillRep.statut:'prepare');
    close_('ovReps');
    document.getElementById('ovFill').classList.add('on');
    // 3) monter les signatures une fois le layout stabilisé (double rAF)
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(tpl.mount)tpl.mount();else ['responsable','salarie'].forEach(mountSig);
    }));
    return;
  }

  document.getElementById('fillArea').innerHTML=(fillDoc.schema_champs||[]).map(c=>{
    const v=vals[c.key]!=null?vals[c.key]:'';
    let inp;
    if(c.type==='textarea')inp=`<textarea id="ff_${c.key}" rows="3">${esc(v)}</textarea>`;
    else if(c.type==='checkbox')inp=`<input type="checkbox" id="ff_${c.key}" ${v?'checked':''} style="width:auto">`;
    else inp=`<input type="${c.type}" id="ff_${c.key}" value="${esc(v)}">`;
    return `<div class="f"><label>${esc(c.label)}</label>${inp}</div>`;
  }).join('')||'<p style="color:var(--muted);font-size:13px">Ce document n\'a pas encore de champs configurés.</p>';
  fillMetaOptions(fillRep?fillRep.enfant_id:(RETURN_ENFANT_ID||''),fillRep?fillRep.statut:'prepare');
  close_('ovReps');
  document.getElementById('ovFill').classList.add('on');
}
function showReturnEnfantBar(){
  let bar=document.getElementById('returnEnfantBar');
  if(!bar){
    const area=document.getElementById('fillArea');
    bar=document.createElement('div');
    bar.id='returnEnfantBar';
    bar.style.cssText='margin:14px 0 4px;padding:12px 14px;background:#E8F5E9;border:1px solid #57B894;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
    bar.innerHTML='<span style="font-size:13px;color:#2E7D52;font-weight:600">✅ Enregistré. Revenir au dossier de l\u2019enfant pour le prochain document ?</span>'
      +'<button class="btn btn-p" onclick="returnToEnfant()" style="white-space:nowrap"><i class="ti ti-arrow-back-up"></i> Revenir aux documents de l\u2019enfant</button>';
    area.parentNode.insertBefore(bar, area);
  }
  bar.style.display='flex';
  bar.scrollIntoView({behavior:'smooth',block:'center'});
}

/* silent=true : enregistrement en arrière-plan (autosave du contrôle EAJE) —
   ni toast de succès, ni fermeture de la modale. Les erreurs restent affichees. */
/* Motif du dernier echec d'enregistrement, ou null si la derniere tentative a
   reussi. Lu par l'autosave du controle EAJE : sans ca, le bandeau annonce
   « Enregistre automatiquement a 14:32 » meme quand rien n'a ete ecrit. */
let SAVE_KO=null;

async function saveFill(silent){
 SAVE_KO=null;
 try{
  /* Contrat de travail signé : verrouillé, sauf override direction explicite
     (bouton « Modifier quand même », tracé plus bas). Voir ctApplyLock(). */
  if(fillDoc&&fillDoc.template_key==='contrat_travail'&&fillRep&&fillRep.statut==='signe'&&!CT_OVERRIDE){
    SAVE_KO='Ce contrat est signé et verrouillé.';
    if(silent)return;
    return toast(SAVE_KO+' Utilisez « Modifier quand même » (direction) pour le corriger.');
  }
  const donnees={};
  const tpl=TPL[fillDoc.template_key];
  if(tpl){
    tpl.fields.forEach(f=>{
      if(f==='fonction'){
        const r=document.querySelector('input[name=ff_fonction]:checked');
        donnees.fonction=r?r.value:'';return;
      }
      if(/^g\d+_\d+_/.test(f)&&!/_acc$/.test(f)){
        donnees[f]=grPick(f);return;
      }
      if(/_acc$/.test(f)){
        const a=document.getElementById('ff_'+f),b=document.getElementById('ff_'+f+'_m');
        const vis=e=>e&&e.offsetParent!==null;
        const src=vis(a)?a:(vis(b)?b:(a||b));
        donnees[f]=!!(src&&src.checked);return;
      }
      if(f==='lv_stagiaire_id'){
        donnees[f]=(document.getElementById('ff_lv_stagiaire_id')||{}).value||(document.getElementById('ff_lv_stagiaire_val')||{}).value||'';return;
      }
      const el=document.getElementById('ff_'+f);
      if(!el)return;
      donnees[f]=(el.type==='checkbox')?el.checked:el.value;
    });
    donnees._sigs=Object.assign({},SIGS);
  }
  (tpl?[]:(fillDoc.schema_champs||[])).forEach(c=>{
    const el=document.getElementById('ff_'+c.key);
    if(!el)return;
    donnees[c.key]=c.type==='checkbox'?el.checked:el.value;
  });
  const enfantId=(document.getElementById('fillEnfant')||{}).value||null;
  // Statut : « signe » si le sélecteur l'indique OU si au moins une signature a été tracée.
  // « Je signe, donc c'est signé » — sans avoir à régler le sélecteur manuellement.
  // Filet de securite : une image de signature quasi vide (cadre effleure, ou
  // heritee d’une ancienne saisie) ne doit pas basculer le statut en « signe ».
  // Un PNG uniforme se compresse en quelques centaines de caracteres ; un trace
  // reel en depasse largement plusieurs milliers.
  const sigReelle=v=>typeof v==='string'&&v.indexOf('data:image')===0&&v.length>1500;
  /* Livret du stagiaire : seul le stagiaire rend le document « signé » ; la
     signature du tuteur seule laisse le livret en attente. */
  const aUneSignature=fillDoc.template_key==='livret_stagiaire'
    ?sigReelle(SIGS.salarie)
    :Object.keys(SIGS||{}).some(k=>sigReelle(SIGS[k]));
  /* Renforcement contrat de travail : si l'OTP est exigé sur ce réseau, une
     signature du/de la salarié(e) non vérifiée par code n'est pas acceptée.
     ctGateSalarieSig() désactive déjà le cadre côté interface ; ce contrôle
     serveur-side (ici, côté client mais indépendant du DOM désactivé) évite
     qu'un tracé déjà présent en mémoire (SIGS) ne se glisse par un autre
     chemin (bouton Entrée, saveFill(true) automatique…). */
  if(fillDoc.template_key==='contrat_travail'&&RESEAU&&RESEAU.otp_signature_active
     &&sigReelle(SIGS.salarie)&&!CT_OTP_VERIFIED){
    SAVE_KO='Identité du/de la salarié(e) non vérifiée par code.';
    if(silent)return;
    return toast('Vérifiez l’identité du/de la salarié(e) par code avant d’enregistrer la signature.');
  }
  /* Garde-fou : apres un enregistrement rattache a un enfant, le formulaire est
     remis a blanc et fillRep detache. Un second clic sur « Enregistrer » creerait
     alors une ligne vide dans le dossier de l’enfant. On refuse donc toute
     creation sans le moindre contenu. */
  const aDuContenu=Object.keys(donnees).some(k=>{
    if(k==='_sigs')return false;
    const v=donnees[k];
    return v!==''&&v!==false&&v!=null;
  })||aUneSignature;
  if(!fillRep&&!aDuContenu){
    SAVE_KO='Formulaire vide \u2014 rien \u00e0 enregistrer';
    if(silent)return;
    return toast(SAVE_KO);
  }
  const statutChoisi=((document.getElementById('fillStatut')||{}).value)==='signe';
  /* « signe » dans deux cas seulement :
     - une signature reelle a ete tracee ou recue par QR ;
     - l’utilisateur a explicitement bascule le selecteur pendant cette saisie
       (document signe sur papier).
     Dans tous les autres cas on retombe sur « prepare » : plus d’heritage. */
  let statut=(aUneSignature||(statutChoisi&&fillStatutManuel))?'signe':'prepare';
  // refléter la bascule dans le sélecteur pour cohérence visuelle
  const _st=document.getElementById('fillStatut');if(_st)_st.value=statut;
  /* Piste d'audit du contrat de travail (donnees._audit — distinct des
     champs du formulaire, jamais affiché dans le rendu normal du document).
     ctDevientSigne capture la transition AVANT d'écraser fillRep plus bas. */
  let ctDevientSigne=false;
  if(fillDoc.template_key==='contrat_travail'){
    const prevAudit=(fillRep&&fillRep.donnees&&fillRep.donnees._audit)||{};
    const audit=Object.assign({},prevAudit);
    if(CT_OVERRIDE){
      const log=(audit.modifications_direction||[]).slice();
      log.push({date:new Date().toISOString(),par:PROF?PROF.name:null});
      audit.modifications_direction=log;
    }
    ctDevientSigne=statut==='signe'&&(!fillRep||fillRep.statut!=='signe');
    if(ctDevientSigne){
      audit.signature_datetime=new Date().toISOString();
      audit.user_agent=navigator.userAgent;
      audit.otp_verifie=!!CT_OTP_VERIFIED;
      if(!RESEAU||!RESEAU.otp_signature_active)audit.mode='degrade_sans_otp';
      if(CT_QR_AUDIT)audit.qr=CT_QR_AUDIT;
    }
    donnees._audit=audit;
  }
  // creche_id aligné sur la crèche de l'enfant si un enfant est choisi,
  // pour que la directrice technique de cette crèche retrouve le document dans le dossier enfant
  let crecheId=fillDoc.creche_id||(PROF?PROF.creche_id:null);
  /* Document d'etablissement : c'est la crec̀he saisie DANS la fiche qui fait
     foi, pas celle du profil. Sans ca, une fiche remplie par la direction part
     avec creche_id null et n'est plus lisible par aucune referente (RLS). */
  if(docEstEtablissement()){
    const cf=crecheIdDuFormulaire();
    if(cf)crecheId=cf;
  }
  if(enfantId){
    const enf=ENFANTS.find(e=>e.id===enfantId);
    if(enf&&enf.creche_id)crecheId=enf.creche_id;
  }
  const row={
    document_id:fillDoc.id,
    creche_id:crecheId,
    enfant_id:enfantId,
    statut,
    donnees,rempli_par:ME.id,
    rempli_par_nom:PROF?PROF.name:null,
    updated_at:new Date().toISOString()
  };
  let error;
  if(fillRep){
    /* .select('id') OBLIGATOIRE : un update refuse par la RLS ne leve pas
       d'erreur, il ne touche simplement aucune ligne et PostgREST repond 204.
       Sans cette clause, l'ecran affiche « enregistre » alors que rien n'a ete
       ecrit — et la saisie disparait au premier rafraichissement. */
    const{data:up,error:ue}=await sb.from('documents_reponses')
      .update(row).eq('id',fillRep.id).select('id');
    error=ue;
    if(!error&&(!up||!up.length)){
      SAVE_KO='Modification refusée (droits insuffisants) — rien n’a été enregistré.';
      return toast(SAVE_KO);
    }
  }
  else{
    const{data,error:ie}=await sb.from('documents_reponses').insert(row).select().maybeSingle();
    error=ie;
    if(data)fillRep=data;          /* evite les doublons aux enregistrements suivants */
  }
  if(error){
    SAVE_KO='Erreur : '+(error.message||'enregistrement impossible');
    return toast(SAVE_KO);
  }
  SAVE_KO=null;
  if(fillDoc.template_key==='contrat_travail'){
    // fillRep peut être resté sur l'ancien statut (chemin update, cf. plus haut) :
    // on le resynchronise pour que ctApplyLock() verrouille immédiatement.
    fillRep.statut=statut;fillRep.donnees=donnees;
    if(CT_PDF_HASH&&fillRep.signature_empreinte!==CT_PDF_HASH){
      fillRep.signature_empreinte=CT_PDF_HASH;
      sb.from('documents_reponses').update({signature_empreinte:CT_PDF_HASH}).eq('id',fillRep.id).then(()=>{});
    }
    if(ctDevientSigne){
      callFn('signature-otp',{action:'signature',reponse_id:fillRep.id,empreinte:CT_PDF_HASH}).catch(()=>{});
    }else if(CT_OVERRIDE){
      callFn('signature-otp',{action:'modification_direction',reponse_id:fillRep.id,par:PROF?PROF.name:null}).catch(()=>{});
    }
    CT_OVERRIDE=false;
    ctApplyLock();
  }
  if(enfantId&&fillDoc.template_key==='vaccinations')vacSyncModuleDepuisFiche(enfantId,donnees);
  if(!silent)toast(enfantId?'Enregistré dans le dossier de l\u2019enfant':'Enregistré');
  if(enfantId){
    /* Le document est parti dans le dossier de l’enfant : on detache la reponse
       de la saisie courante et on remet le formulaire a blanc, pour que la page
       Documents reparte d’un modele vierge au prochain remplissage. */
    fillRep=null;
    resetFillForm();
  }
  if(!silent){
    if(RETURN_ENFANT_ID){
      showReturnEnfantBar();
    }else{
      close_('ovFill');
    }
  }
 }catch(e){
  console.error('saveFill',e);
  SAVE_KO='Erreur : '+(e&&e.message?e.message:'inattendue');
  toast(SAVE_KO);
 }
}
