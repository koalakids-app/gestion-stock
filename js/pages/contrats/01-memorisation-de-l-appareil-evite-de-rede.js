const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let ME=null,PROF=null,IS_DIRECTION=false;
let ENFANTS=[],CRECHES=[],ETABS=[],CONTRATS=[],TARIFS=[],FRAIS=[];
let DEMANDES=[],DEVIS_OK=[];
let CMG_BAREME=[],CMG_CFG={taux_max:0.85,ratio_3_6:0.5,plafond_horaire:10};
const CMG_CFG_ID='00000000-0000-0000-0000-000000000002';
let RESEAU={contrat_validite_jours:30,devis_validite_jours:30,
            preavis_resiliation:'',conditions_resiliation:'',contrat_mentions:'',pied_page:''};
let reseauCharge=false;

let filtreEtat='',anneeFiltre='';
let contratId=null;
let CCUR=null,CCALC=null,CTYPE='initial',CPARENT=null,CBROUILLON=true;
let CTX=null;      // {kind:'pre'|'enfant', id} — le dossier ouvert
let CSUJ=null;     // le sujet normalisé : d'où qu'il vienne, mêmes champs
let CPRE=null,CPARENTS=[],semManuel=false;

const JOURS=[[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi']];
const LIENS={mere:'Mère',pere:'Père',tuteur:'Tuteur / tutrice',autre:'Responsable légal'};
const TYPES={unique:'une seule fois',annuel:'chaque année',mensuel:'chaque mois',unitaire:"par jour d'accueil"};

const C_STATUTS={
  brouillon:  {l:'Brouillon',   bg:'#F1EFF7',fg:'#8E8AA8'},
  envoye:     {l:'Envoyé',      bg:'#FFF1E3',fg:'#F47920'},
  signe:      {l:'Signé',       bg:'#E6F5EE',fg:'#2E9E6B'},
  contresigne:{l:'Contresigné', bg:'#E6F5EE',fg:'#1B6B47'},
  refuse:     {l:'Refusé',      bg:'#FDE8E8',fg:'#C62828'},
  expire:     {l:'Expiré',      bg:'#FFF6DC',fg:'#B8860B'},
  annule:     {l:'Annulé',      bg:'#F1EFF7',fg:'#8E8AA8'},
  resilie:    {l:'Résilié',     bg:'#FDE8E8',fg:'#C62828'}
};
const C_TYPES={initial:'Contrat initial',avenant:'Avenant',renouvellement:'Renouvellement'};

/* Les états du parcours, du point de vue de la direction : ce qu'il reste à
   faire. Ils valent pour les deux files — une demande sans contrat et un
   enfant sans contrat posent le même problème, à deux moments différents. */
const ETATS=[
  ['sans',       'À contractualiser'],
  ['brouillon',  'Brouillon'],
  ['envoye',     'Chez la famille'],
  ['signe',      'À contresigner'],
  ['contresigne','Complet']
];

function toast(m,err){const t=document.getElementById('toast');t.textContent=m;t.className='toast on'+(err?' err':'');setTimeout(()=>t.className='toast',3200);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
/* Même règle que côté devis (inscriptions.html) : le libellé de la tranche
   tarifaire reste en base pour la direction, mais une famille ne voit que
   « Frais de garde » sur ses documents. */
function libelleLigne(l){return l.type==='accueil'?'Frais de garde':l.libelle;}
function closeOv(id){document.getElementById(id).classList.remove('on');}
function openOv(id){document.getElementById(id).classList.add('on');}
function val(id){const e=document.getElementById(id);return e?String(e.value).trim():'';}
function setVal(id,v){const e=document.getElementById(id);if(e)e.value=(v==null?'':v);}
function num(id){const v=val(id);return v===''?null:Number(String(v).replace(',','.'));}

function auj(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dfr(d){if(!d)return'';const p=String(d).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'';}
function toArr(v){
  if(Array.isArray(v))return v;
  if(typeof v==='string'){try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch(e){return[];}}
  return [];
}
function euro(n){return (Math.round(Number(n)*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function nbFr(n){const v=Math.round(Number(n||0)*100)/100;return String(v).replace('.',',');}

/* ---------- L'ANNÉE SCOLAIRE ---------- */
function anneeScolaireDe(d){
  if(!d)return null;
  const p=String(d).slice(0,10).split('-').map(Number);
  if(p.length!==3)return null;
  return p[1]>=9?p[0]:p[0]-1;
}
function libelleAnnee(a){return a+' – '+(a+1);}
function debutAnnee(a){return a+'-09-01';}
function finAnnee(a){return (a+1)+'-08-31';}
function contratDansAnnee(c,a){
  if(a==='')return true;
  const d0=String(c.date_debut||'').slice(0,10);
  const d1=String(c.date_fin||'9999-12-31').slice(0,10);
  return d0<=finAnnee(Number(a))&&d1>=debutAnnee(Number(a));
}

/* ---------- AUTH ---------- */
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
  IS_DIRECTION=(p.role==='direction');
  if(window.KKBranding)KKBranding.applyBranding(sb);
  if(!IS_DIRECTION){
    try{await sb.auth.signOut();}catch(e){}
    showLogin('Ce module est réservé à la direction.');
    return;
  }
  // MFA obligatoire à la connexion, même portail que demandes.html/documents.html.
  await mfaGateCheckAndProceed();
}
// --- Mémorisation de l'appareil : évite de redemander le code à chaque
// reconnexion sur le même navigateur, en le limitant à 24h glissantes.
// Stocké en localStorage (propre à ce navigateur/appareil), pas en base : ne
// dispense donc jamais du mot de passe, seulement du code à 6 chiffres.
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
    if(data.currentLevel==='aal2'){await contratsGrantAccess();return;}
    if(data.nextLevel==='aal2'){
      if(mfaIsTrusted()){await contratsGrantAccess();return;}
      mfaGateShowChallenge();return;
    }
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
    mfaMarkTrusted();
    await contratsGrantAccess();
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
    await contratsGrantAccess();
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
async function contratsGrantAccess(){
  if(typeof kkLoginAlertCheck==='function')kkLoginAlertCheck(sb);
  document.getElementById('loginView').style.display='none';
  document.getElementById('appView').style.display='block';
  document.getElementById('whoAmI').textContent=(PROF.name||'')+' · Direction';
  await loadAll();
  ouvrirDepuisUrl();
}
async function doLogin(){
  const e=val('liMail'),p=document.getElementById('liPwd').value;
  const{error}=await sb.auth.signInWithPassword({email:e,password:p});
  if(error){document.getElementById('liErr').textContent='Identifiants incorrects';return;}
  JUSTE_CONNECTE=true;
  document.getElementById('liPwd').value='';
  boot().catch(err=>{console.error('[boot]',err);showLogin('Connexion impossible — réessayez.');});
}
async function doLogout(){await sb.auth.signOut();location.reload();}

/* `contrats.html?pre=<id>` ouvre directement le dossier d'une demande. C'est
   le lien posé par inscriptions.html sous un devis accepté : la direction
   enchaîne sans avoir à retrouver le dossier dans la liste. Le paramètre est
   retiré de la barre d'adresse ensuite, pour qu'un rechargement ne rouvre pas
   la modale indéfiniment. */
function ouvrirDepuisUrl(){
  const p=new URLSearchParams(location.search);
  const pre=p.get('pre'),enf=p.get('enfant');
  if(!pre&&!enf)return;
  try{history.replaceState({},'',location.pathname);}catch(e){}
  if(pre)openDossier('pre',pre);
  else openDossier('enfant',enf);
}

/* ---------- CHARGEMENT ---------- */
async function loadAll(){
  try{
    const[en,cr,ct,et,pr,dv]=await Promise.all([
      sb.from('enfants').select('id,prenom,nom,dob,creche_id,date_entree,date_sortie,allergies,regime_repas,repas_base').order('nom'),
      sb.from('creches').select('id,name,addr,capacity,capacity_surnombre').order('name'),
      sb.from('contrats').select('*').order('created_at',{ascending:false}),
      sb.from('etablissements').select('*'),
      /* Les demandes encore ouvertes : pas encore basculées. Une demande
         basculée a un enfant, et c'est l'enfant qui la représente ensuite. */
      sb.from('preinscriptions').select('*').is('enfant_id',null),
      sb.from('devis').select('*').eq('statut','accepte')
    ]);
    if(en.error)throw en.error;
    if(ct.error)throw ct.error;
    ENFANTS=en.data||[];CRECHES=cr.data||[];CONTRATS=ct.data||[];ETABS=et.data||[];
    DEVIS_OK=dv.data||[];
    /* La file d'attente de contrat : une demande dont la famille a accepté le
       devis. Sans devis accepté il n'y a pas d'accord à contractualiser — et
       la file se remplirait de dossiers sur lesquels rien n'a été convenu. */
    const avecDevis={};
    DEVIS_OK.forEach(d=>{avecDevis[String(d.preinscription_id)]=1;});
    DEMANDES=(pr.data||[]).filter(p=>avecDevis[String(p.id)]);
  }catch(e){
    console.error('[loadAll]',e);
    const msg=(e.code==='42P01')
      ? 'La table des contrats n\'existe pas — exécutez le script 31.'
      : (e.message||'erreur inconnue');
    toast('Chargement impossible : '+msg,true);
    return;
  }
  document.getElementById('fCreche').innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');

  const a0=anneeScolaireDe(auj());
  const annees=[a0+1,a0,a0-1,a0-2];
  anneeFiltre=String(a0);
  document.getElementById('fAnnee').innerHTML=
    annees.map(a=>'<option value="'+a+'"'+(a===a0?' selected':'')+'>Année '+libelleAnnee(a)+'</option>').join('')
    +'<option value="">Toutes les années</option>';
  render();
  if(window.statsInvalider)statsInvalider();
}

function nomCreche(id){const c=CRECHES.find(x=>String(x.id)===String(id));return c?c.name:'';}
function etabDe(id){return ETABS.find(x=>String(x.creche_id)===String(id))||{};}
function semainesDe(id){
  const e=etabDe(id);
  return e&&e.semaines_facturees!=null?Number(e.semaines_facturees):null;
}
/* Le devis accepté d'une demande, le plus récemment répondu. C'est l'accord
   sur lequel le contrat se fonde. */
function devisDe(preId){
  return DEVIS_OK.filter(d=>String(d.preinscription_id)===String(preId))
    .sort((a,b)=>String(b.repondu_le||b.updated_at||'').localeCompare(String(a.repondu_le||a.updated_at||'')))[0]||null;
}

/* ---------- LES CONTRATS D'UN DOSSIER ---------- */
/* Un contrat se rattache à la demande AVANT la bascule, à l'enfant après —
   et souvent aux deux, la bascule ajoutant l'enfant sans effacer la demande.
   Chercher sur les deux clés est donc la seule lecture juste : ne regarder
   que `enfant_id` perdrait les contrats en cours de signature, ne regarder
   que `preinscription_id` perdrait les renouvellements. */
function contratsDe(kind,id){
  const cle=kind==='pre'?'preinscription_id':'enfant_id';
  return CONTRATS.filter(c=>String(c[cle])===String(id))
    .sort((a,b)=>String(b.date_debut||'').localeCompare(String(a.date_debut||''))
              ||String(b.created_at||'').localeCompare(String(a.created_at||'')));
}
const RANG={contresigne:5,signe:4,envoye:3,brouillon:2,expire:1,resilie:1,refuse:0,annule:0};
function contratCourant(kind,id,annee){
  const l=contratsDe(kind,id).filter(c=>c.type!=='avenant')
    .filter(c=>kind==='pre'?true:contratDansAnnee(c,annee));
  if(!l.length)return null;
  return l.slice().sort((a,b)=>(RANG[b.statut]||0)-(RANG[a.statut]||0)
    ||String(b.date_debut||'').localeCompare(String(a.date_debut||'')))[0];
}
function etatDossier(kind,id,annee){
  const c=contratCourant(kind,id,annee);
  if(!c)return 'sans';
  if(['contresigne','signe','envoye','brouillon'].indexOf(c.statut)>=0)return c.statut;
  return 'sans';
}

function enfantDansAnnee(e,a){
  if(a==='')return !e.date_sortie||String(e.date_sortie)>=auj();
  const d0=debutAnnee(Number(a)),d1=finAnnee(Number(a));
  if(e.date_entree&&String(e.date_entree).slice(0,10)>d1)return false;
  if(e.date_sortie&&String(e.date_sortie).slice(0,10)<d0)return false;
  return true;
}

/* ---------- AFFICHAGE ---------- */
function render(){
  const q=val('fSearch').toLowerCase();
  const cre=val('fCreche');
  anneeFiltre=val('fAnnee');

  /* Les demandes ne sont PAS filtrées par année scolaire. Une demande en
     attente de contrat est une chose à faire maintenant, quelle que soit la
     date d'entrée prévue : la ranger dans une année la ferait disparaître de
     l'écran de celui qui doit s'en occuper. */
  let dem=DEMANDES.slice();
  if(cre)dem=dem.filter(p=>{
    const d=devisDe(p.id);
    return String((d&&d.creche_id)||p.creche_id)===cre;
  });
  if(q)dem=dem.filter(p=>((p.prenom||'')+' '+(p.nom||'')).toLowerCase().indexOf(q)>=0);

  let enf=ENFANTS.filter(e=>enfantDansAnnee(e,anneeFiltre));
  if(cre)enf=enf.filter(e=>String(e.creche_id)===cre);
  if(q)enf=enf.filter(e=>((e.prenom||'')+' '+(e.nom||'')).toLowerCase().indexOf(q)>=0);

  // Les compteurs couvrent les deux files : c'est le même travail, à deux
  // moments du parcours.
  const box=document.getElementById('stats');
  box.innerHTML=ETATS.map(([k,l])=>{
    const n=dem.filter(p=>etatDossier('pre',p.id,anneeFiltre)===k).length
           +enf.filter(e=>etatDossier('enfant',e.id,anneeFiltre)===k).length;
    return '<div class="stat'+(filtreEtat===k?' on':'')+'" onclick="setEtat(\''+k+'\')">'
      +'<div class="n">'+n+'</div><div class="l">'+esc(l)+'</div></div>';
  }).join('');

  if(filtreEtat){
    dem=dem.filter(p=>etatDossier('pre',p.id,anneeFiltre)===filtreEtat);
    enf=enf.filter(e=>etatDossier('enfant',e.id,anneeFiltre)===filtreEtat);
  }

  let h='';

  if(dem.length){
    h+='<div class="grp"><h4>En attente de contrat</h4>'
      +'<span>'+dem.length+' demande'+(dem.length>1?'s':'')+' · devis accepté, fiche enfant pas encore créée</span></div>';
    h+=dem.map(p=>carteDemande(p)).join('');
  }

  if(enf.length){
    h+='<div class="grp"><h4>Enfants inscrits</h4>'
      +'<span>année '+(anneeFiltre?libelleAnnee(Number(anneeFiltre)):'toutes années')+'</span></div>';
    h+=enf.map(e=>carteEnfant(e)).join('');
  }

  const el=document.getElementById('list');
  if(!h){
    let pq;
    if(!ENFANTS.length&&!DEMANDES.length){
      pq='Rien à contractualiser. Les demandes arrivent ici dès qu\'un devis est accepté, '
        +'dans le module Devis.';
    }else if(filtreEtat){
      pq='Aucun dossier dans cet état. Recliquez le compteur pour tout revoir.';
    }else if(anneeFiltre){
      pq='Aucun dossier sur l\'année '+libelleAnnee(Number(anneeFiltre))
        +'. Choisissez une autre année, ou « Toutes les années ».';
    }else{
      pq='Aucun dossier ne correspond à ces filtres.';
    }
    el.innerHTML='<div class="empty"><i class="ti ti-file-off"></i><p>'+esc(pq)+'</p></div>';
    return;
  }
  el.innerHTML=h;
}
function setEtat(k){filtreEtat=(filtreEtat===k?'':k);render();}

function carteDemande(p){
  const c=contratCourant('pre',p.id,'');
  const d=devisDe(p.id);
  const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom';
  const cre=nomCreche((d&&d.creche_id)||p.creche_id)||'crèche à définir';
  let tag,sub,act;
  if(!c){
    tag='<span class="tag" style="background:var(--orange-l);color:var(--orange)">'
      +'<i class="ti ti-file-plus"></i> contrat à établir</span>';
    sub='Devis '+esc((d&&d.numero)||'')+' accepté'+(d&&d.repondu_le?' le '+dfr(d.repondu_le):'')
      +(d?' · '+euro(d.total_mensuel)+' par mois':'');
    act='<button class="pdf neuf" onclick="event.stopPropagation();nouveauContrat(\'pre\',\''+p.id+'\')">'
      +'<i class="ti ti-file-plus"></i> Établir le contrat</button>';
  }else{
    const st=C_STATUTS[c.statut]||C_STATUTS.brouillon;
    tag='<span class="tag" style="background:'+st.bg+';color:'+st.fg+'">'+esc(st.l)+'</span>';
    sub=esc(c.numero||'sans numéro')+' · '+euro(c.total_mensuel)+' par mois'
      +' · du '+dfr(c.date_debut)+(c.date_fin?' au '+dfr(c.date_fin):' sans terme');
    /* Contresigné mais pas encore basculé : c'est LE moment d'agir, et le
       bouton part vers la bascule, qui vit dans inscriptions.html. */
    act=(c.statut==='contresigne')
      ? '<a class="pdf go" href="inscriptions.html" onclick="event.stopPropagation()">'
        +'<i class="ti ti-user-check"></i> Créer la fiche enfant</a>'
      : '<button class="pdf" onclick="event.stopPropagation();openDossier(\'pre\',\''+p.id+'\')">'
        +'<i class="ti ti-file-search"></i> Ouvrir</button>';
  }
  const pret=(c&&c.statut==='contresigne')
    ? '<span class="tag" style="background:var(--green-l);color:var(--green)">prêt à basculer</span>':'';
  return '<div class="card dem" onclick="openDossier(\'pre\',\''+p.id+'\')">'
    +'<div class="av"><i class="ti ti-clipboard-list"></i></div><div class="bd">'
    +'<div class="nm">'+esc(nom)+'</div>'
    +'<div class="sub">'+esc(cre)+(p.dob?' · né(e) le '+dfr(p.dob):'')
    +(p.date_entree_souhaitee?' · entrée souhaitée le '+dfr(p.date_entree_souhaitee):'')
    +'<br>'+sub+'</div>'
    +'<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
    +tag+pret+act+'</div></div></div>';
}

function carteEnfant(e){
  const c=contratCourant('enfant',e.id,anneeFiltre);
  const nom=((e.prenom||'')+' '+(e.nom||'')).trim()||'Sans nom';
  const av=contratsDe('enfant',e.id).filter(x=>x.type==='avenant'&&contratDansAnnee(x,anneeFiltre)).length;
  let tag,sub,act;
  if(!c){
    tag='<span class="tag" style="background:var(--red-l);color:var(--red)">'
      +'<i class="ti ti-alert-triangle"></i> sans contrat</span>';
    sub='Aucun contrat pour l\'année retenue.';
    act='<button class="pdf neuf" onclick="event.stopPropagation();nouveauContrat(\'enfant\',\''+e.id+'\')">'
      +'<i class="ti ti-file-plus"></i> Établir le contrat</button>';
  }else{
    const st=C_STATUTS[c.statut]||C_STATUTS.brouillon;
    tag='<span class="tag" style="background:'+st.bg+';color:'+st.fg+'">'+esc(st.l)+'</span>';
    sub=esc(c.numero||'sans numéro')+' · '+euro(c.total_mensuel)+' par mois'
      +' · du '+dfr(c.date_debut)+(c.date_fin?' au '+dfr(c.date_fin):' sans terme');
    act='<button class="pdf" onclick="event.stopPropagation();openDossier(\'enfant\',\''+e.id+'\')">'
      +'<i class="ti ti-file-search"></i> Ouvrir</button>';
  }
  const avt=av?'<span class="tag" style="background:var(--violet-l);color:var(--violet)">'
    +av+' avenant'+(av>1?'s':'')+'</span>':'';
  const prov=e.naissance_provisoire?'<span class="tag" style="background:var(--amber-l);color:var(--amber)">'
    +'<i class="ti ti-alert-triangle"></i> terme prévu, pas encore né(e)</span>':'';
  return '<div class="card" onclick="openDossier(\'enfant\',\''+e.id+'\')">'
    +'<div class="av"><i class="ti ti-mood-kid"></i></div><div class="bd">'
    +'<div class="nm">'+esc(nom)+'</div>'
    +'<div class="sub">'+esc(nomCreche(e.creche_id)||'crèche non renseignée')
    +(e.dob?' · né(e) le '+dfr(e.dob)+(e.naissance_provisoire?' (terme prévu)':''):'')+'<br>'+sub+'</div>'
    +'<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
    +tag+prov+avt+act+'</div></div></div>';
}

/* ---------- LE SUJET DU CONTRAT ---------- */
/* Un contrat porte sur un accueil, pas sur une ligne de base. Avant la
   bascule, ce que l'on connaît de l'enfant vient de la demande ; après, de la
   fiche enfant. Le formulaire ne doit pas avoir à savoir lequel des deux :
   on normalise ici, une fois, et tout le reste lit les mêmes champs. */
function normaliser(kind,id){
  if(kind==='enfant'){
    const e=ENFANTS.find(x=>String(x.id)===String(id));
    if(!e)return null;
    return{kind:'enfant',id:e.id,enfant_id:e.id,pre_id:null,
      prenom:e.prenom,nom:e.nom,dob:e.dob,naissance_provisoire:!!e.naissance_provisoire,creche_id:e.creche_id,
      date_ref:e.date_entree,repas:e.repas_base||null,source:e};
  }
  const p=DEMANDES.find(x=>String(x.id)===String(id));
  if(!p)return null;
  return{kind:'pre',id:p.id,enfant_id:null,pre_id:p.id,
    prenom:p.prenom,nom:p.nom,dob:p.dob,creche_id:p.creche_id,
    date_ref:p.date_entree_souhaitee,repas:null,source:p};
}

/* La demande d'origine et les parents. Les deux tables diffèrent selon le
   moment du parcours, les champs utiles sont les mêmes : c'est pourquoi on les
   ramène à une seule forme plutôt que de tester le cas partout. */
async function loadContexte(){
  CPRE=null;CPARENTS=[];
  if(!CSUJ)return;
  try{
    if(CSUJ.kind==='pre'){
      CPRE=CSUJ.source;
      const{data}=await sb.from('preinscriptions_parents').select('*')
        .eq('preinscription_id',CSUJ.id).order('created_at');
      CPARENTS=data||[];
    }else{
      const[pr,pa]=await Promise.all([
        sb.from('preinscriptions').select('*').eq('enfant_id',CSUJ.id).maybeSingle(),
        sb.from('enfants_parents').select('*').eq('enfant_id',CSUJ.id).order('created_at')
      ]);
      CPRE=(pr&&pr.data)||null;
      CPARENTS=(pa&&pa.data)||[];
    }
  }catch(e){console.warn('[loadContexte]',e);}
}
function destinatairesDe(){
  return CPARENTS.filter(p=>p.destinataire&&p.email&&p.email.indexOf('@')>0)
    .map(p=>p.email.trim());
}

/* ---------- LA FICHE D'UN DOSSIER ---------- */
async function openDossier(kind,id){
  CTX={kind:kind,id:id};
  CSUJ=normaliser(kind,id);
  if(!CSUJ){toast('Dossier introuvable — rechargez la page.',true);return;}
  /* Les contrats sont RELUS à chaque ouverture de dossier. Ils vivent en
     mémoire depuis le chargement de la page, et une famille qui signe le fait
     ailleurs — sur son téléphone, pendant que cet écran est resté ouvert.
     Sans cette relecture, la direction voyait « Envoyé » sur un contrat déjà
     signé et concluait que rien n'avait bougé. C'est précisément dans ce
     moment-là qu'on attend l'information. */
  await Promise.all([loadContexte(),recharger()]);
  rendreDossier();
  openOv('ovDossier');
}

/* Le fil du parcours. Quatre étapes, dans l'ordre réel :
     devis accepté → contrat signé par la famille → contresigné → fiche enfant.
   C'est la question à laquelle la direction doit pouvoir répondre d'un coup
   d'œil : où en est ce dossier, et qu'est-ce qui bloque. */
function filParcours(){
  if(CSUJ.kind!=='pre')return '';
  const d=devisDe(CSUJ.id);
  const c=contratCourant('pre',CSUJ.id,'');
  const et=[
    ['Devis', d?('accepté le '+dfr(d.repondu_le)):'en attente', !!d],
    ['Contrat', !c?'à établir':(c.statut==='brouillon'?'brouillon':
       (c.statut==='envoye'?'chez la famille':
       /* repondu_le est posé aussi bien à la signature qu'au refus : c'est
          le statut qui dit laquelle des deux, pas la date. */
       (c.statut==='refuse'?'refusé'+(c.repondu_le?' le '+dfr(c.repondu_le):''):
       (['signe','contresigne'].indexOf(c.statut)>=0&&c.repondu_le?'signé le '+dfr(c.repondu_le):C_STATUTS[c.statut].l)))),
       !!(c&&['signe','contresigne'].indexOf(c.statut)>=0)],
    ['Contresignature', (c&&c.contresigne_le)?('le '+dfr(c.contresigne_le)):'à faire',
       !!(c&&c.statut==='contresigne')],
    ['Fiche enfant', 'pas encore créée', false]
  ];
  // La première étape non franchie est celle en cours.
  let encours=et.findIndex(x=>!x[2]);
  return '<div class="fil">'+et.map((x,i)=>
    '<div class="'+(x[2]?'ok':(i===encours?'on':''))+'">'
    +'<div class="e">'+esc(x[0])+'</div><div class="v">'+esc(x[1])+'</div></div>').join('')+'</div>';
}

function rendreDossier(){
  const nom=((CSUJ.prenom||'')+' '+(CSUJ.nom||'')).trim()||'Dossier';
  document.getElementById('dTitle').textContent=nom
    +(CSUJ.kind==='pre'?' — demande en cours':'');

  const l=contratsDe(CSUJ.kind,CSUJ.id);
  const courant=contratCourant(CSUJ.kind,CSUJ.id,CSUJ.kind==='pre'?'':anneeFiltre);
  const amendable=l.find(c=>c.type!=='avenant'&&['signe','contresigne'].indexOf(c.statut)>=0);
  CPARENT=amendable||null;

  let h=filParcours();

  /* Un avenant porte sur un accueil en cours : la base l'exige (contrainte
     contrats_type_rattachement_ck), et le bon sens aussi — amender un contrat
     qui n'a pas encore produit de fiche enfant, c'est corriger le contrat. */
  const peutAmender=!!amendable&&CSUJ.kind==='enfant';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">';
  if(!courant||CSUJ.kind==='enfant'){
    h+='<button class="btn btn-p" onclick="openContrat(null,null)">'
      +(courant?'<i class="ti ti-refresh"></i> Renouveler le contrat'
               :'<i class="ti ti-file-plus"></i> Établir le contrat')+'</button>';
  }
  if(CSUJ.kind==='enfant')h+='<button class="btn btn-s" onclick="openReprise()" title="Contrat déjà signé hors application">'
    +'<i class="ti ti-file-import"></i> Reprendre un contrat existant</button>';
  if(peutAmender)h+='<button class="btn btn-s" onclick="openContrat(null,\'avenant\')">'
    +'<i class="ti ti-file-diff"></i> Établir un avenant</button>';
  if(courant&&courant.statut==='contresigne'&&CSUJ.kind==='pre'){
    h+='<a class="btn btn-p" href="inscriptions.html"><i class="ti ti-user-check"></i> Créer la fiche enfant</a>';
  }
  h+='</div>';

  if(CSUJ.naissance_provisoire){
    h+='<div style="background:var(--amber-l);border-left:4px solid var(--amber);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--amber)">'
      +'<i class="ti ti-alert-triangle"></i> La date de naissance ci-dessous est un <b>terme prévu</b> : l\'enfant '
      +'n\'était pas encore né au moment de la bascule. Corrigez-la sur sa fiche enfant dès la naissance connue — '
      +'un contrat établi avant la correction affichera cette date provisoire.</div>';
  }
  h+='<div class="kvb"><span>Crèche</span><b>'+esc(nomCreche(CSUJ.creche_id)||'—')+'</b></div>'
   +'<div class="kvb"><span>'+(CSUJ.naissance_provisoire?'Date de naissance (terme prévu)':'Date de naissance')+'</span><b>'+(CSUJ.dob?dfr(CSUJ.dob):'—')+'</b></div>'
   +'<div class="kvb"><span>'+(CSUJ.kind==='pre'?'Entrée souhaitée':'Date d\'entrée')+'</span><b>'
   +(CSUJ.date_ref?dfr(CSUJ.date_ref):'—')+'</b></div>';

  if(CPARENTS.length){
    h+='<div class="sec" style="margin-top:16px">Les parents</div>'
      +CPARENTS.map(x=>'<div class="kvb"><span>'+esc(LIENS[x.lien]||'Responsable légal')+'</span><b>'
      +esc(((x.prenom||'')+' '+(x.nom||'')).trim()||'—')
      +(x.email?' · '+esc(x.email):'')+'</b></div>').join('');
    if(!destinatairesDe().length){
      h+='<div class="warn"><i class="ti ti-mail-off"></i><span>'
        +'Aucun parent destinataire avec une adresse e-mail : le contrat ne pourra pas être envoyé. '
        +'Cochez « destinataire » sur au moins un parent, dans le module Devis.</span></div>';
    }
  }

  if(!l.length){
    h+='<div class="warn" style="margin-top:12px"><i class="ti ti-alert-triangle"></i><span>'
      +(CSUJ.kind==='pre'
        ? '<b>Le devis est accepté, le contrat reste à établir.</b> La fiche enfant ne se crée qu\'une fois '
          +'le contrat signé par la famille et contresigné par la crèche.'
        : '<b>Aucun contrat d\'accueil.</b> L\'enfant est accueilli sans document signé : '
          +'c\'est ce que la PMI relève en premier lors d\'un contrôle.')
      +'</span></div>';
  }else{
    h+='<div class="sec" style="margin-top:16px">Les contrats</div>';
    h+=l.map(c=>{
      const st=C_STATUTS[c.statut]||C_STATUTS.brouillon;
      const per=dfr(c.date_debut)+(c.date_fin?' au '+dfr(c.date_fin):' — sans terme');
      /* Le PDF s'imprime sans ouvrir le contrat : c'est le geste le plus
         fréquent une fois le contrat signé. stopPropagation empêche la carte
         de s'ouvrir derrière la boîte de téléchargement. */
      return '<div class="par" onclick="openContrat(\''+c.id+'\',null)" style="cursor:pointer">'
        +'<div class="h"><b>'+esc(c.numero||'Sans numéro')+'</b>'
        +'<span class="tag" style="background:var(--violet-l);color:var(--violet)">'+esc(C_TYPES[c.type]||c.type)+'</span>'
        +'<span class="tag" style="background:'+st.bg+';color:'+st.fg+'">'+esc(st.l)+'</span>'
        +(c.origine==='reprise'?'<span class="tag" style="background:var(--amber-l);color:var(--amber)">Repris</span>':'')
        +(c.origine==='reprise'?'':'<button class="pdf" style="border:none;background:var(--violet-l);color:var(--violet);'
        +'border-radius:10px;min-height:34px;padding:0 11px;font-family:Nunito;font-weight:800;'
        +'font-size:12px;cursor:pointer" onclick="event.stopPropagation();pdfContrat(\''+c.id+'\')" '
        +'title="Télécharger le PDF"><i class="ti ti-file-type-pdf"></i> PDF</button>')
        /* Résilier est posé ICI, sur la carte, et non plus seulement au fond de
           la modale du contrat : cette barre d'actions passe sous le pli dès
           que le contrat a quelques clauses, et un bouton qu'on ne voit pas
           n'existe pas. Même correction que pour le PDF et la création. */
        +(c.statut==='contresigne'
          ? '<button class="pdf" style="border:none;background:var(--red-l);color:var(--red);'
            +'border-radius:10px;min-height:34px;padding:0 11px;font-family:Nunito;font-weight:800;'
            +'font-size:12px;cursor:pointer" onclick="event.stopPropagation();resilierDepuisFiche(\''+c.id+'\')" '
            +'title="Résilier le contrat"><i class="ti ti-file-x"></i> Résilier</button>'
          : '')
        +'</div>'
        +'<div class="li" style="color:var(--muted)">Du '+esc(per)+'</div>'
        +'<div class="li" style="color:var(--muted)">'+euro(c.total_mensuel)+' par mois'
        +(c.reste_a_charge!=null?' · reste à charge '+euro(c.reste_a_charge):'')+'</div>'
        +(c.envoye_le?'<div class="li"><i class="ti ti-send" style="color:var(--muted)"></i>Envoyé le '+dfr(c.envoye_le)+'</div>':'')
        +(c.repondu_le?'<div class="li"><i class="ti ti-writing-sign" style="color:'
          +(c.statut==='refuse'?'var(--red)':'var(--green)')+'"></i>'
          +(c.statut==='refuse'?'Refusé':'Signé par la famille')+' le '+dfr(c.repondu_le)+'</div>':'')
        +(c.contresigne_le?'<div class="li"><i class="ti ti-stamp" style="color:var(--green)"></i>Contresigné le '
          +dfr(c.contresigne_le)+(c.contresigne_par?' par '+esc(c.contresigne_par):'')+'</div>':'')
        +(c.resilie_le?'<div class="li"><i class="ti ti-file-x" style="color:var(--red)"></i>'
          +'Résilié le '+dfr(c.resilie_le)
          +(c.resilie_origine==='creche'?' par la crèche':' par la famille')
          +(c.resilie_fin_preavis?' — dernier jour d\'accueil le '+dfr(c.resilie_fin_preavis):'')
          +'</div>':'')
        +'</div>';
    }).join('');
  }

  document.getElementById('dBody').innerHTML=h;
}

/* Entrée directe depuis la liste : on ouvre le formulaire sans passer par la
   fiche, puisque la carte annonce déjà qu'il n'y a pas de contrat. */
async function nouveauContrat(kind,id){
  CTX={kind:kind,id:id};
  CSUJ=normaliser(kind,id);
  if(!CSUJ){toast('Dossier introuvable — rechargez la page.',true);return;}
  await loadContexte();
  CPARENT=null;
  await openContrat(null,null);
}

/* ---------- LES DONNÉES DE CONTEXTE ---------- */
async function loadGrille(){
  if(TARIFS.length||FRAIS.length)return;
  try{
    const[t,f]=await Promise.all([
      sb.from('tarifs').select('*').order('ordre'),
      sb.from('frais_annexes').select('*').order('ordre')
    ]);
    if(t.error)throw t.error;
    if(f.error)throw f.error;
    TARIFS=t.data||[];FRAIS=f.data||[];
  }catch(e){console.error('[loadGrille]',e);toast('Grille tarifaire inaccessible.',true);}
}
async function loadCmg(){
  if(CMG_BAREME.length)return;
  try{
    const[b,c]=await Promise.all([
      sb.from('cmg_bareme').select('*').eq('actif',true).order('ordre'),
      sb.from('cmg_config').select('config').eq('id',CMG_CFG_ID).maybeSingle()
    ]);
    if(b.error)throw b.error;
    CMG_BAREME=b.data||[];
    if(c&&c.data&&c.data.config)CMG_CFG=Object.assign({},CMG_CFG,c.data.config);
  }catch(e){console.warn('[loadCmg]',e);CMG_BAREME=[];}
}
async function loadReseau(){
  if(reseauCharge)return;
  try{
    const{data,error}=await sb.from('reseau_config').select('config').maybeSingle();
    if(error)throw error;
    if(data&&data.config)RESEAU=Object.assign({},RESEAU,data.config);
  }catch(e){console.warn('[loadReseau]',e);}
  reseauCharge=true;
}

/* ---------- LA NUMÉROTATION ---------- */
function prochainNumero(annee){
  const prefixe='C-'+annee+'-';
  const n=CONTRATS.filter(c=>String(c.numero||'').indexOf(prefixe)===0)
    .map(c=>Number(String(c.numero).slice(prefixe.length).split('-')[0]))
    .filter(x=>!isNaN(x));
  const max=n.length?Math.max.apply(null,n):0;
  return prefixe+String(max+1).padStart(4,'0');
}
function numeroAvenant(parent){
  const n=CONTRATS.filter(c=>String(c.parent_contrat_id)===String(parent.id)).length;
  return (parent.numero||'C')+'-A'+(n+1);
}

/* ---------- LE CALCUL ---------- */
/* Repris du devis, à l'identique et volontairement : le contrat doit produire
   le même montant que le devis que la famille a accepté. Toute divergence
   entre les deux calculs serait une divergence entre ce qui a été promis et ce
   qui sera facturé. */
function cHeuresHebdo(){
  const m=t=>{const r=/^(\d{1,2}):(\d{2})/.exec(t||'');return r?(+r[1])*60+(+r[2]):null;};
  const a=m(val('cHd')),b=m(val('cHf'));
  const n=document.querySelectorAll('.ckCJour:checked').length;
  if(a==null||b==null||b<=a||!n)return null;
  return Math.round((b-a)/60*n*100)/100;
}
function joursAccueilEntre(deb,fin,jours){
  if(!deb||!fin||!jours||!jours.length)return null;
  const d0=new Date(String(deb).slice(0,10)+'T12:00:00');
  const d1=new Date(String(fin).slice(0,10)+'T12:00:00');
  if(isNaN(d0)||isNaN(d1)||d1<d0)return null;
  if((d1-d0)/86400000>1830)return null;
  const set={};jours.forEach(j=>{set[Number(j)]=1;});
  let n=0;
  for(const d=new Date(d0);d<=d1;d.setDate(d.getDate()+1)){
    const js=d.getDay()===0?7:d.getDay();
    if(set[js])n++;
  }
  return n;
}
function moisEntre(deb,fin){
  if(!deb||!fin)return null;
  const a=String(deb).slice(0,10).split('-').map(Number);
  const b=String(fin).slice(0,10).split('-').map(Number);
  if(a.length!==3||b.length!==3)return null;
  const n=(b[0]-a[0])*12+(b[1]-a[1])+1;
  return n>0?n:null;
}
function fermetureEstimee(crecheId,nbJoursSemaine,mois){
  const e=etabDe(crecheId);
  const sem=e&&e.semaines_fermeture!=null?Number(e.semaines_fermeture):5;
  if(!nbJoursSemaine||!mois)return 0;
  return Math.round(sem*nbJoursSemaine*(mois/12));
}
function fourchette(t){
  const a=t.heures_min,b=t.heures_max;
  if(a==null&&b==null)return'tout volume horaire';
  if(a==null)return'moins de '+b+' h par semaine';
  if(b==null)return'à partir de '+a+' h par semaine';
  return'de '+a+' h à moins de '+b+' h par semaine';
}
function tarifPour(h,crecheId){
  const bornes=t=>(t.heures_min==null?0:1)+(t.heures_max==null?0:1);
  const largeur=t=>{
    const a=t.heures_min==null?0:Number(t.heures_min);
    const b=t.heures_max==null?Infinity:Number(t.heures_max);
    return b-a;
  };
  return TARIFS.filter(t=>t.actif)
    .filter(t=>!t.creche_id||!crecheId||String(t.creche_id)===String(crecheId))
    .filter(t=>(t.heures_min==null||h>=Number(t.heures_min))
             &&(t.heures_max==null||h<Number(t.heures_max)))
    .sort((a,b)=>(a.creche_id?0:1)-(b.creche_id?0:1)
              ||bornes(b)-bornes(a)
              ||largeur(a)-largeur(b)
              ||a.ordre-b.ordre)[0]||null;
}
function ageAns(dob,dateRef){
  if(!dob||!dateRef)return null;
  const d0=new Date(String(dob).slice(0,10)+'T00:00:00');
  const d1=new Date(String(dateRef).slice(0,10)+'T00:00:00');
  if(isNaN(d0)||isNaN(d1))return null;
  let a=d1.getFullYear()-d0.getFullYear();
  const m=d1.getMonth()-d0.getMonth();
  if(m<0||(m===0&&d1.getDate()<d0.getDate()))a--;
  return a;
}

function cCalcule(){
  const h=cHeuresHebdo();
  const nj=document.querySelectorAll('.ckCJour:checked').length;
  const sem=Number(val('cSem'))||47;
  const creche=val('cCreche')||null;

  const avecTerme=!!val('cFin');
  const moisP=avecTerme?(Number(val('cMois'))||moisEntre(val('cDebut'),val('cFin'))||12):12;
  const joursP=avecTerme?(val('cJours')===''?null:Number(val('cJours'))):null;
  const jparmois=avecTerme?(joursP==null?null:joursP/moisP):nj*sem/12;
  const hparjour=(nj&&h!=null)?h/nj:null;

  let tarif=null;
  const forc=val('cTarif');
  if(forc)tarif=TARIFS.find(t=>String(t.id)===String(forc))||null;
  else if(h!=null)tarif=tarifPour(h,creche);

  const lignes=[];
  if(tarif&&h!=null&&jparmois!=null){
    let q,pu,tot;
    if(tarif.mode==='horaire'){q=jparmois*(hparjour||0);pu=Number(tarif.montant);tot=q*pu;}
    else if(tarif.mode==='journee'){q=jparmois;pu=Number(tarif.montant);tot=q*pu;}
    else{q=1;pu=Number(tarif.montant);tot=pu;}
    lignes.push({libelle:tarif.libelle,description:tarif.description||'',type:'accueil',
      quantite:Math.round(q*1000)/1000,montant_unitaire:pu,total:Math.round(tot*100)/100,
      unite:tarif.mode==='horaire'?'h':(tarif.mode==='journee'?'j':'mois')});
  }

  [...document.querySelectorAll('.ckCFrais:checked')].forEach(c=>{
    const f=FRAIS.find(x=>String(x.id)===String(c.value));
    if(!f)return;
    const signe=f.est_reduction?-1:1;
    let q=1,unite='';
    if(f.type==='unitaire'){q=jparmois==null?0:jparmois;unite='j';}
    lignes.push({libelle:f.libelle,description:f.description||'',type:f.type,
      quantite:Math.round(q*1000)/1000,montant_unitaire:signe*Number(f.montant),
      total:Math.round(signe*Number(f.montant)*q*100)/100,unite:unite});
  });

  const recur=['accueil','mensuel','unitaire'];
  const mensuel=lignes.filter(l=>recur.indexOf(l.type)>=0).reduce((s,l)=>s+l.total,0);
  const uniques=lignes.filter(l=>l.type==='unique').reduce((s,l)=>s+l.total,0);
  const annuels=lignes.filter(l=>l.type==='annuel').reduce((s,l)=>s+l.total,0);

  return{h:h,nj:nj,sem:sem,tarif:tarif,lignes:lignes,
    avecTerme:avecTerme,mois:moisP,joursPeriode:joursP,jparmois:jparmois,
    mensuel:Math.round(mensuel*100)/100,
    uniques:Math.round(uniques*100)/100,
    annuel:Math.round((mensuel*moisP+annuels)*100)/100};
}

function cCmgCalcule(mensuel){
  const rev=val('cRev')===''?null:Number(val('cRev'));
  const sit=val('cSit')||'couple';
  const age=ageAns(CSUJ&&CSUJ.dob,val('cDebut'));
  if(!CMG_BAREME.length)return{err:'Barème CMG non renseigné en base.'};
  if(rev==null)return{err:'Renseignez les revenus du foyer pour estimer le CMG.'};
  if(age==null)return{err:'Renseignez la date de naissance et la date de début pour estimer le CMG.'};
  if(age>=6)return{err:'Le CMG s\'éteint aux 6 ans de l\'enfant.'};
  const tr=CMG_BAREME.filter(b=>b.situation===sit)
    .sort((a,b)=>(a.revenu_max==null?1:0)-(b.revenu_max==null?1:0)||Number(a.revenu_max)-Number(b.revenu_max))
    .find(b=>b.revenu_max==null||rev<=Number(b.revenu_max));
  if(!tr)return{err:'Aucune tranche de barème ne correspond à cette situation.'};
  const ratio=age>=3?Number(CMG_CFG.ratio_3_6||0.5):1;
  const plafondBareme=Math.round(Number(tr.montant)*ratio*100)/100;
  const plafondCout=Math.round(mensuel*Number(CMG_CFG.taux_max||0.85)*100)/100;
  const cmg=Math.min(plafondBareme,plafondCout);
  return{age:age,bareme:plafondBareme,cout:plafondCout,
    cmg:Math.round(cmg*100)/100,reste:Math.round((mensuel-cmg)*100)/100,
    limite:plafondCout<plafondBareme?'cout':'bareme'};
}

/* ---------- LA MODALE DU CONTRAT ---------- */
async function openContrat(id,type){
  if(!CSUJ){toast('Ouvrez d\'abord un dossier.',true);return;}
  await Promise.all([loadGrille(),loadCmg(),loadReseau()]);

  contratId=id;
  CCUR=id?CONTRATS.find(x=>String(x.id)===String(id)):null;
  const brouillon=!CCUR||CCUR.statut==='brouillon';
  CBROUILLON=brouillon;

  if(CCUR){
    CTYPE=CCUR.type;
    CPARENT=CCUR.parent_contrat_id
      ? CONTRATS.find(x=>String(x.id)===String(CCUR.parent_contrat_id))||null : null;
  }else if(type==='avenant'){
    CTYPE='avenant';
    if(!CPARENT){toast('Aucun contrat signé à amender.',true);return;}
  }else{
    /* Un dossier de demande ne peut produire qu'un contrat INITIAL : l'accueil
       n'a pas commencé, il n'y a rien à renouveler. Un enfant qui a déjà eu un
       contrat mené à son terme est en revanche en renouvellement. */
    const precedent=CSUJ.kind==='enfant'
      ? contratsDe('enfant',CSUJ.id).find(c=>c.type!=='avenant'
          &&['signe','contresigne','resilie'].indexOf(c.statut)>=0)
      : null;
    CTYPE=precedent?'renouvellement':'initial';
    CPARENT=null;
  }

  document.getElementById('cTitle').textContent=CCUR
    ? (CCUR.numero||'Contrat') : ('Nouveau — '+(C_TYPES[CTYPE]||'contrat').toLowerCase());
  const st=CCUR?(C_STATUTS[CCUR.statut]||C_STATUTS.brouillon):null;
  document.getElementById('cStatut').innerHTML=st
    ? '<span class="tag" style="background:'+st.bg+';color:'+st.fg+'">'+esc(st.l)+'</span>':'';
  document.getElementById('btnDelCt').style.display=(CCUR&&brouillon)?'':'none';
  document.getElementById('btnSaveCt').style.display=brouillon?'':'none';

  /* Envoi, lien, contresignature — les trois boutons qui font avancer le
     contrat, affichés seulement quand ils ont un sens.

     Un contrat CLOS ne s'envoie plus : le lien serait mort à l'arrivée, et
     relancer une famille qui a déjà répondu est le genre de maladresse qu'une
     application ne doit pas rendre possible. */
  const clos=!!(CCUR&&(CCUR.repondu_le
    ||['signe','contresigne','refuse','annule','expire','resilie'].indexOf(CCUR.statut)>=0));
  const bEnv=document.getElementById('btnEnvoiCt');
  bEnv.style.display=(CCUR&&!clos)?'':'none';
  bEnv.innerHTML=(CCUR&&CCUR.statut==='envoye')
    ? '<i class="ti ti-bell"></i> Relancer la famille'
    : '<i class="ti ti-send"></i> Envoyer à la famille';
  /* Le lien s'obtient sur tout contrat enregistré et non clos, qu'il ait déjà
     été envoyé ou non : c'est la voie manuelle, et elle ne doit jamais dépendre
     du bon fonctionnement du mail automatique. */
  const bLien=document.getElementById('btnLienCt');
  bLien.style.display=(CCUR&&!clos)?'':'none';
  document.getElementById('btnPartagerCt').style.display=(CCUR&&!clos&&PartageLien.disponible())?'':'none';
  bLien.innerHTML=(CCUR&&CCUR.token)
    ? '<i class="ti ti-link"></i> Le lien'
    : '<i class="ti ti-link"></i> Créer le lien';
  // La contresignature n'a de sens qu'entre la signature de la famille et rien
  // d'autre : ni avant, ni deux fois.
  document.getElementById('btnSignerCt').style.display=
    (CCUR&&CCUR.statut==='signe')?'':'none';
  /* On ne résilie que ce qui engage. Un brouillon se supprime, un contrat
     parti chez la famille s'annule — la résiliation, elle, met fin à un
     accueil en cours, et suppose donc un contrat complet des deux parts. */
  document.getElementById('btnResilCt').style.display=
    (CCUR&&CCUR.statut==='contresigne')?'':'none';
  // Le PDF ne s'imprime que depuis la base : un contrat jamais enregistré n'a
  // ni numéro ni lignes, et sortirait un document sans identité.
  const reprise=!!(CCUR&&CCUR.origine==='reprise');
  document.getElementById('btnPdfCt').style.display=(CCUR&&!reprise)?'':'none';
  // Renvoi manuel : pour un contrat déjà contresigné avant la mise en place de
  // l'envoi automatique, ou simplement si la famille redemande une copie.
  document.getElementById('btnMailCt').style.display=
    (CCUR&&CCUR.statut==='contresigne'&&!reprise)?'':'none';

  const lock=document.getElementById('cLock');
  lock.style.display=brouillon?'none':'';
  lock.innerHTML=brouillon?'':etatContrat(CCUR);

  document.getElementById('cEffetBox').style.display=(CTYPE==='avenant')?'':'none';

  /* D'où viennent les valeurs proposées :
       un contrat existant  → ses propres chiffres, figés ;
       un avenant neuf      → le contrat qu'il amende ;
       un renouvellement    → le contrat de l'année écoulée, dates décalées ;
       un contrat initial   → LE DEVIS ACCEPTÉ, qui est l'accord de la famille.
     Le devis n'est jamais relu pour un renouvellement : il chiffrait l'année
     passée, à la grille de l'année passée. */
  let src=null,origine='';
  const devis=(!CCUR&&CTYPE==='initial')?devisDe(CPRE?CPRE.id:CSUJ.pre_id):null;
  if(CCUR){src=CCUR;}
  else if(CTYPE==='avenant'&&CPARENT){src=CPARENT;origine='avenant';}
  else if(CTYPE==='renouvellement'){
    src=contratsDe('enfant',CSUJ.id).find(c=>c.type!=='avenant'
      &&['signe','contresigne','resilie'].indexOf(c.statut)>=0)||null;
    origine='renouvellement';
  }
  else if(devis){src=devis;origine='devis';}

  const ob=document.getElementById('cOrigine');
  if(CCUR){ob.innerHTML='';}
  else if(origine==='devis'){
    ob.innerHTML='<div class="warn" style="background:var(--violet-l);color:var(--violet)">'
      +'<i class="ti ti-file-euro"></i><span>Repris du <b>devis '+esc(devis.numero||'')+'</b>, accepté le '
      +dfr(devis.repondu_le)+' — '+euro(devis.total_mensuel)+' par mois. Les montants ci-dessous sont '
      +'recalculés sur la grille du jour : <b>vérifiez qu\'ils correspondent bien à ce que la famille a '
      +'accepté</b>, sans quoi le contrat engagerait sur un autre montant que le devis.</span></div>';
  }else if(origine==='renouvellement'&&src){
    ob.innerHTML='<div class="warn" style="background:var(--violet-l);color:var(--violet)">'
      +'<i class="ti ti-refresh"></i><span>Renouvellement du contrat <b>'+esc(src.numero||'')+'</b>. '
      +'Les dates sont décalées d\'une année scolaire et le tarif suit la <b>grille en vigueur</b> — '
      +'il peut donc différer de celui de l\'an passé.</span></div>';
  }else if(origine==='avenant'&&src){
    ob.innerHTML='<div class="warn" style="background:var(--violet-l);color:var(--violet)">'
      +'<i class="ti ti-file-diff"></i><span>Avenant au contrat <b>'+esc(src.numero||'')+'</b>. '
      +'Le contrat d\'origine reste intact : modifiez ici ce qui change, et posez la date d\'effet.</span></div>';
  }else if(!CCUR&&!src){
    ob.innerHTML='<div class="warn"><i class="ti ti-info-circle"></i><span>'
      +'Aucun devis accepté ni contrat antérieur retrouvé pour ce dossier. '
      +'Le contrat part de ce qui est connu de l\'accueil : vérifiez chaque ligne.</span></div>';
  }

  document.getElementById('cCreche').innerHTML='<option value="">— à définir —</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  setVal('cCreche',(src&&src.creche_id)||CSUJ.creche_id||'');

  if(!CCUR&&CTYPE==='renouvellement'){
    const a=anneeScolaireDe(auj());
    setVal('cDebut',debutAnnee(a));
    setVal('cFin',finAnnee(a));
  }else{
    setVal('cDebut',(src&&src.date_debut)||CSUJ.date_ref||'');
    setVal('cFin',(src&&src.date_fin)||'');
  }
  setVal('cEffet',(CCUR&&CCUR.date_effet)||'');
  setVal('cHd',(src&&src.heure_debut?String(src.heure_debut).slice(0,5):'')||'07:30');
  setVal('cHf',(src&&src.heure_fin?String(src.heure_fin).slice(0,5):'')||'18:00');
  semManuel=false;
  setVal('cSem',(src&&src.semaines_an)||semainesDe(val('cCreche'))||47);
  setVal('cRepas',(src&&src.repas)||CSUJ.repas||'');

  const jrs=toArr(src&&src.jours).map(Number);
  document.getElementById('cJoursBox').innerHTML=JOURS.map(j=>
    '<label><input type="checkbox" class="ckCJour" value="'+j[0]+'"'
    +((jrs.length?jrs:[1,2,3,4,5]).indexOf(j[0])>=0?' checked':'')+'><span>'+j[1]+'</span></label>').join('');
  document.querySelectorAll('.ckCJour').forEach(c=>c.addEventListener('change',
    ()=>{ if(val('cFin')&&!CCUR)cPeriodeChange(); else cSync(); }));

  setVal('cSit',(CPRE&&CPRE.majoration_paje)?'isole':'couple');
  setVal('cRev',(CPRE&&CPRE.revenus_foyer!=null)?CPRE.revenus_foyer:'');
  setVal('cCom',(CCUR&&CCUR.commentaire)||'');
  setVal('cNotes',(CCUR&&CCUR.notes_internes)||'');

  setVal('cAdresse',CCUR?CCUR.famille_adresse:((CPRE&&CPRE.adresse)||''));
  setVal('cCp',CCUR?CCUR.famille_code_postal:((CPRE&&CPRE.code_postal)||''));
  setVal('cVille',CCUR?CCUR.famille_ville:((CPRE&&CPRE.ville)||''));
  setVal('cAlloc',CCUR?CCUR.num_allocataire:((CPRE&&CPRE.num_allocataire)||''));
  setVal('cDest',CCUR?CCUR.destinataires:destinatairesDe().join(', '));

  document.getElementById('cTarif').innerHTML='<option value="">— choix automatique —</option>'
    +TARIFS.filter(t=>t.actif).map(t=>'<option value="'+t.id+'">'+esc(t.libelle)+' · '+euro(t.montant)
      +(t.mode==='horaire'?' · '+esc(fourchette(t)):'')+'</option>').join('');
  let forcage='';
  if(CCUR&&CCUR.tarif_id){
    const h0=cHeuresHebdo();
    const auto=h0==null?null:tarifPour(h0,val('cCreche'));
    if(!auto||String(auto.id)!==String(CCUR.tarif_id))forcage=CCUR.tarif_id;
  }
  setVal('cTarif',forcage);

  let coches=null;
  if(CCUR){
    try{
      const{data}=await sb.from('contrats_lignes').select('libelle').eq('contrat_id',CCUR.id);
      coches=(data||[]).map(x=>x.libelle);
    }catch(e){console.warn('[contrats_lignes]',e);}
  }else if(devis){
    try{
      const{data}=await sb.from('devis_lignes').select('libelle').eq('devis_id',devis.id);
      coches=(data||[]).map(x=>x.libelle);
    }catch(e){console.warn('[devis_lignes]',e);}
  }
  document.getElementById('cFraisBox').innerHTML=FRAIS.filter(f=>f.actif).map(f=>{
    const on=coches?coches.indexOf(f.libelle)>=0:f.par_defaut;
    return '<label class="ck"><input type="checkbox" class="ckCFrais" value="'+f.id+'"'+(on?' checked':'')+'> '
      +esc(f.libelle)+' <span style="color:'+(f.est_reduction?'var(--green)':'var(--muted)')+'">('
      +(f.est_reduction?'− ':'')+euro(f.montant)+' '+esc(TYPES[f.type]||f.type)+')</span></label>';
  }).join('')||'<p class="hint">Aucun frais paramétré.</p>';
  document.querySelectorAll('.ckCFrais').forEach(c=>c.addEventListener('change',cSync));

  ['cCreche','cDebut','cFin','cEffet','cHd','cHf','cSem','cRepas','cTarif','cSit','cRev',
   'cAdresse','cCp','cVille','cAlloc','cDest','cCom','cNotes','cJours','cFerm','cMois'].forEach(i=>{
    const e=document.getElementById(i);if(e)e.disabled=!brouillon;
  });
  document.querySelectorAll('.ckCJour,.ckCFrais').forEach(c=>c.disabled=!brouillon);

  document.getElementById('cPeriodeBox').style.display=val('cFin')?'':'none';
  if(CCUR&&CCUR.date_fin){
    setVal('cJours',CCUR.jours_accueil!=null?CCUR.jours_accueil:'');
    setVal('cMois',CCUR.mois_factures!=null?CCUR.mois_factures:'');
    setVal('cFerm','');
    cSync();
  }else if(val('cFin')){
    cPeriodeChange();
  }else{
    cSync();
  }
  openOv('ovContrat');
}
