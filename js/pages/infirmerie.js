/* ================================================================
   REGISTRE D'INFIRMERIE — Koala Kids
   Page dediee, autonome. Auth Supabase, RLS cote serveur.
   ================================================================ */
const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const LOGO_KK="data:image/png;base64,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";

let ME=null,PROF=null,IS_DIRECTION=false,IS_EMPLOYE=false;
let CRECHES=[],ENFANTS=[],PAIS=[],ENTRIES=[],RESEAU={};
let curNature='soin', rectifSource=null, editPaiId=null, detailId=null;
/* Piece jointe du PAI en cours d'edition : fichier choisi mais pas encore
   envoye (pjFile), et chemin deja stocke en base (pjPath). */
let pjFile=null, pjPath=null, pjNom=null;

/* ---------- Listes de valeurs ---------- */
const L_TYPE  =['Chute','Morsure','Griffure','Choc / collision','Plaie / coupure','Brûlure','Malaise','Fièvre','Corps étranger','Réaction allergique','Autre'];
const L_LIEU  =['Salle de vie','Dortoir','Sanitaires / change','Jardin / extérieur','Entrée / vestiaire','Réfectoire','Sortie extérieure'];
const L_LOC   =['Tête','Visage','Bouche / dent','Œil','Bras','Main','Dos','Ventre','Jambe','Genou','Pied'];
const L_SOINS =['Lavage / nettoyage','Glace','Désinfection','Pansement','Mise au calme','Surveillance','Aucun soin nécessaire'];
const L_VOIE  =['Orale','Cutanée','Nasale','Oculaire','Auriculaire','Rectale','Inhalée','Auto-injecteur'];
const L_ACTION=['Administration','Application','Inhalation','Instillation','Injection'];
const L_MOYEN =['Téléphone','SMS','À la récupération'];

/* Appel d'une Edge Function, sur le meme modele que demandes.html.
   Volontairement silencieux : une notification qui echoue ne doit jamais
   empecher l'enregistrement d'une entree de registre. */
async function callFn(fn,body){
  try{
    const r=await fetch(SUPABASE_URL+'/functions/v1/'+fn,{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON_KEY},
      body:JSON.stringify(body)});
    return r.ok;
  }catch(e){return false;}
}

/* ---------- Utilitaires ---------- */
function toast(m,err){const t=document.getElementById('toast');t.textContent=m;t.className='toast on'+(err?' err':'');setTimeout(()=>t.className='toast',3000);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function openOv(id){document.getElementById(id).classList.add('on');}
function closeOv(id){document.getElementById(id).classList.remove('on');}
/* Date locale — jamais toISOString().slice(0,10) : decalage UTC+2 */
function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function nowHM(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function monthISO(){return todayISO().slice(0,7);}
function frDate(iso){if(!iso)return'';const[y,m,d]=iso.split('-');return d+'/'+m+'/'+y;}
function frLong(iso){if(!iso)return'';const d=new Date(iso+'T12:00:00');
  return d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
function hm(t){return t?String(t).slice(0,5):'';}
function crecheName(id){const c=CRECHES.find(x=>x.id===id);return c?c.name:'';}

/* Rendu d'un groupe de chips. multi=true -> plusieurs valeurs cumulables */
function renderChips(elId,list,multi,orange){
  const el=document.getElementById(elId);
  el.innerHTML=list.map(v=>`<button type="button" class="chip${orange?' o':''}" data-v="${esc(v)}">${esc(v)}</button>`).join('');
  el.dataset.multi=multi?'1':'';
}
function chipValues(elId){
  return [...document.querySelectorAll('#'+elId+' .chip.on')].map(b=>b.dataset.v);
}
function chipClear(elId){document.querySelectorAll('#'+elId+' .chip.on').forEach(b=>b.classList.remove('on'));}
function chipSet(elId,val){
  chipClear(elId);
  if(!val)return;
  const vals=String(val).split(', ');
  document.querySelectorAll('#'+elId+' .chip').forEach(b=>{if(vals.includes(b.dataset.v))b.classList.add('on');});
}
/* Delegation : une seule ecoute pour tous les chips de la page */
document.addEventListener('click',e=>{
  const chip=e.target.closest('.chip');
  if(chip){
    const box=chip.parentElement;
    if(box.dataset.multi){chip.classList.toggle('on');}
    else{const was=chip.classList.contains('on');box.querySelectorAll('.chip').forEach(b=>b.classList.remove('on'));if(!was)chip.classList.add('on');}
    return;
  }
  const cl=e.target.closest('[data-close]');
  if(cl){closeOv(cl.dataset.close);}
});

/* ================= AUTH ================= */
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){showLoginView();return;}
  ME=session.user;
  const {data:p}=await sb.from('referents').select('*').eq('user_id',ME.id).maybeSingle();
  if(!p){toast("Profil introuvable. Contactez la direction.",true);await sb.auth.signOut();location.reload();return;}
  PROF=p; IS_DIRECTION=(p.role==='direction'); IS_EMPLOYE=(p.role==='employe');
  if(window.KKBranding)KKBranding.applyBranding(sb);
  // MFA obligatoire \u00e0 la connexion, m\u00eame portail que demandes.html/documents.html.
  await mfaGateCheckAndProceed();
}
function showLoginView(msg){
  document.getElementById('appView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='block';
  document.getElementById('mfaGateBox').style.display='none';
  if(msg)document.getElementById('liErr').textContent=msg;
}
async function infirmerieGrantAccess(){
  if(typeof kkLoginAlertCheck==='function')kkLoginAlertCheck(sb);
  document.getElementById('loginView').style.display='none';
  document.getElementById('appView').style.display='block';
  document.getElementById('whoAmI').textContent=(PROF.name||'')+(IS_DIRECTION?' \u00b7 Direction':'');
  document.querySelectorAll('.adminonly').forEach(e=>e.style.display=(PROF.role==='direction'||PROF.role==='referent')?'':'none');
  /* Un employe ne voit que les PAI actifs (policy pai_select) : la case n'a plus d'objet. */
  if(IS_EMPLOYE)document.getElementById('pInactifs').closest('.ck').style.display='none';
  if(IS_DIRECTION){
    document.getElementById('fCreche').style.display='';
    document.getElementById('pCreche').style.display='';
    document.getElementById('fCrecheWrap').style.display='';
    document.getElementById('paiCrecheWrap').style.display='';
  }
  document.getElementById('fMois').value=monthISO();
  buildChips();
  await loadAll();
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
    if(data.currentLevel==='aal2'){await infirmerieGrantAccess();return;}
    if(data.nextLevel==='aal2'){mfaGateShowChallenge();return;}
    await mfaGateShowEnroll();
  }catch(e){
    console.error('[MFA Gate]',e);
    try{await sb.auth.signOut();}catch(_e){}
    showLoginView('Erreur de v\u00e9rification de la double authentification. R\u00e9essayez.');
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
      try{await sb.auth.mfa.unenroll({factorId:f.id});}catch(e){console.warn('Nettoyage facteur MFA p\u00e9rim\u00e9 \u00e9chou\u00e9 :',e.message);}
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
    err.textContent="Erreur lors de la pr\u00e9paration de l'enr\u00f4lement : "+e.message;err.style.display='block';
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
    if(!verified)throw new Error('Aucun facteur MFA v\u00e9rifi\u00e9 trouv\u00e9 sur ce compte.');
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:verified.id});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:verified.id,challengeId:ch.id,code});
    if(vErr)throw vErr;
    await infirmerieGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expir\u00e9 : '+e.message;err.style.display='block';
  }
}
async function mfaGateConfirmEnroll(){
  const code=document.getElementById('mfaGateEnrollCode').value.trim();
  const err=document.getElementById('mfaGateEnrollErr');
  err.style.display='none';
  if(!/^\d{6}$/.test(code)){err.textContent='Le code doit contenir 6 chiffres.';err.style.display='block';return;}
  if(!mfaGateFactorId){err.textContent="Session d'enr\u00f4lement expir\u00e9e, r\u00e9essayez.";err.style.display='block';return;}
  try{
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:mfaGateFactorId});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:mfaGateFactorId,challengeId:ch.id,code});
    if(vErr)throw vErr;
    mfaGateFactorId=null;
    await infirmerieGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expir\u00e9 : '+e.message;err.style.display='block';
  }
}
async function mfaGateCancel(){
  if(mfaGateFactorId){try{await sb.auth.mfa.unenroll({factorId:mfaGateFactorId});}catch(e){console.warn('Nettoyage annulation MFA gate \u00e9chou\u00e9 :',e.message);}}
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

function buildChips(){
  renderChips('chType',L_TYPE,false,true);
  renderChips('chLieu',L_LIEU,false,true);
  renderChips('chLoc',L_LOC,false,true);
  renderChips('chSoins',L_SOINS,true,true);
  renderChips('chVoie',L_VOIE,false);
  renderChips('chAction',L_ACTION,false);
  renderChips('chMoyen',L_MOYEN,false);
}

/* ================= CHARGEMENT ================= */
async function loadAll(){
  const [cr,en,pa,rz]=await Promise.all([
    sb.from('creches').select('id,name').order('name'),
    sb.from('enfants').select('id,prenom,nom,creche_id').order('prenom'),
    sb.from('pai').select('*').order('enfant_nom'),
    sb.from('reseau_config').select('config').maybeSingle()
  ]);
  CRECHES=cr.data||[]; ENFANTS=en.data||[]; PAIS=pa.data||[];
  RESEAU=(rz&&rz.data&&rz.data.config)||{};
  ['fCreche','pCreche','eCreche','iCreche'].forEach(id=>{
    const s=document.getElementById(id);
    const all=(id==='fCreche'||id==='pCreche');
    s.innerHTML=(all?'<option value="all">Toutes les cr\u00e8ches</option>':'')
      +CRECHES.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if(!IS_DIRECTION&&PROF.creche_id)s.value=PROF.creche_id;
  });
  await loadEntries();
  await autoLock();
  renderPai();
}

async function loadEntries(){
  const mois=document.getElementById('fMois').value||monthISO();
  const [y,m]=mois.split('-').map(Number);
  const debut=mois+'-01';
  const fin=(m===12? (y+1)+'-01-01' : y+'-'+String(m+1).padStart(2,'0')+'-01');
  let q=sb.from('registre_infirmerie').select('*')
        .gte('date_acte',debut).lt('date_acte',fin)
        .order('date_acte',{ascending:false}).order('heure_acte',{ascending:false});
  const cf=document.getElementById('fCreche').value;
  if(IS_DIRECTION&&cf&&cf!=='all')q=q.eq('creche_id',cf);
  const {data,error}=await q;
  if(error){toast('Erreur de chargement : '+error.message,true);return;}
  ENTRIES=data||[];
  renderRegistre();
}

/* Verrouillage automatique : toute entree d'un jour anterieur qui n'a pas
   ete verrouillee l'est au premier chargement de page. L'equipe garde donc
   la journee en cours pour corriger une faute de frappe, et le registre se
   fige au plus tard le lendemain. */
async function autoLock(){
  const hier=ENTRIES.filter(e=>!e.locked_at && e.date_acte<todayISO());
  if(!hier.length)return;
  const now=new Date().toISOString();
  /* Un seul UPDATE filtre, pas une requete par ligne. */
  const {error}=await sb.from('registre_infirmerie')
    .update({locked_at:now},{returning:'minimal'})
    .is('locked_at',null).lt('date_acte',todayISO());
  if(error){console.warn('autoLock',error.message);return;}
  hier.forEach(e=>e.locked_at=now);
  renderRegistre();
}

/* Debut de la fenetre de lecture d'un employe : 3 mois glissants.
   Doit rester aligne sur la policy reg_select cote Supabase. */
function limiteLecture(){
  const d=new Date(); d.setMonth(d.getMonth()-3);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function moisHorsFenetre(){
  if(!IS_EMPLOYE)return false;
  const mois=document.getElementById('fMois').value||monthISO();
  /* Le mois est hors fenetre si son dernier jour precede la limite. */
  const [y,m]=mois.split('-').map(Number);
  const dernier=new Date(y,m,0);
  const fin=dernier.getFullYear()+'-'+String(dernier.getMonth()+1).padStart(2,'0')+'-'+String(dernier.getDate()).padStart(2,'0');
  return fin<limiteLecture();
}

/* ================= RENDU REGISTRE ================= */
function renderRegistre(){
  const nat=document.getElementById('fNature').value;
  const q=document.getElementById('fSearch').value.trim().toLowerCase();
  let rows=ENTRIES.slice();
  if(nat!=='all')rows=rows.filter(e=>e.nature===nat);
  if(q)rows=rows.filter(e=>[e.enfant_nom,e.medicament,e.type_soin,e.auteur_nom,e.circonstances]
        .filter(Boolean).join(' ').toLowerCase().includes(q));

  const el=document.getElementById('regList');
  if(!rows.length){
    if(moisHorsFenetre()){
      el.innerHTML='<div class="empty"><i class="ti ti-lock" style="font-size:38px;display:block;margin-bottom:10px;opacity:.4"></i>'
        +'<b>P\u00e9riode hors de votre acc\u00e8s.</b><br>Le registre reste consultable sur les trois derniers mois.<br>'
        +'Pour une p\u00e9riode plus ancienne, adressez-vous \u00e0 votre r\u00e9f\u00e9rente ou \u00e0 la direction.</div>';
      return;
    }
    el.innerHTML='<div class="empty"><i class="ti ti-notebook" style="font-size:38px;display:block;margin-bottom:10px;opacity:.4"></i>'
      +'Aucune entr\u00e9e pour cette p\u00e9riode.</div>';
    return;
  }
  const rectifiees=new Set(rows.map(e=>e.rectifie_id).filter(Boolean));
  const groups={};
  rows.forEach(e=>{(groups[e.date_acte]=groups[e.date_acte]||[]).push(e);});

  el.innerHTML=Object.keys(groups).sort().reverse().map(d=>{
    const items=groups[d].map(e=>{
      const soin=e.nature==='soin';
      const ann=rectifiees.has(e.id);
      const titre=soin?(e.type_soin||'Soin'):(e.medicament||'Traitement');
      const detail=soin
        ? [e.localisation,e.lieu_survenue].filter(Boolean).join(' \u00b7 ')
        : [e.dosage,e.voie].filter(Boolean).join(' \u00b7 ');
      let tags='';
      if(ann)tags+='<span class="tag rect">rectifi\u00e9e</span>';
      else if(e.rectifie_id)tags+='<span class="tag rect">rectification</span>';
      if(e.appel_secours)tags+='<span class="tag urg">secours</span>';
      tags+=e.locked_at?'<span class="tag lock"><i class="ti ti-lock"></i></span>'
                       :'<span class="tag open">modifiable</span>';
      return `<div class="entry${ann?' annulee':''}" data-id="${e.id}">
        <div class="e-i ${soin?'soin':'trait'}"><i class="ti ti-${soin?'bandage':'vaccine'}"></i></div>
        <div class="e-t">
          <b>${esc(e.enfant_nom)} \u2014 ${esc(titre)}${tags}</b>
          <div class="sub">${hm(e.heure_acte)}${detail?' \u00b7 '+esc(detail):''}</div>
        </div>
        <div class="e-meta">${esc(e.auteur_nom)}<br>${esc(crecheName(e.creche_id))}</div>
      </div>`;
    }).join('');
    return `<div class="daygroup"><div class="dayhead">${frLong(d)}</div>${items}</div>`;
  }).join('');
}

/* ================= SAISIE ================= */
/* ---------- Recherche d'enfant ----------
   Remplace l'ancien menu deroulant : on tape les premieres lettres.
   L'input porte le NOM affiche, le champ cache porte l'ID s'il y a
   correspondance en base. Un nom tape sans correspondance reste valide :
   c'est la saisie libre, sans manipulation supplementaire. */
function normalise(t){
  return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
function enfantsDe(crecheId){
  return ENFANTS.filter(e=>!crecheId||e.creche_id===crecheId);
}
function nomEnfant(e){return ((e.prenom||'')+' '+(e.nom||'')).trim();}

function setupEnfantPicker(searchId,idFieldId,listId,crecheId){
  const inp=document.getElementById(searchId);
  const hid=document.getElementById(idFieldId);
  const box=document.getElementById(listId);
  inp.value=''; hid.value=''; box.classList.remove('on');
  inp.dataset.creche=crecheId||'';

  const dessine=()=>{
    const q=normalise(inp.value);
    const list=enfantsDe(inp.dataset.creche)
      .filter(e=>!q||normalise(nomEnfant(e)).includes(q))
      .slice(0,8);
    let html=list.map(e=>`<div data-eid="${e.id}">${esc(nomEnfant(e))}</div>`).join('');
    if(!list.length){
      html = inp.value.trim()
        ? `<div class="libre" data-eid="">Utiliser « ${esc(inp.value.trim())} » (enfant hors liste)</div>`
        : '<div class="vide">Aucun enfant enregistré pour cette crèche.</div>';
    }
    box.innerHTML=html; box.classList.add('on');
  };

  inp.oninput=()=>{hid.value='';dessine();};
  inp.onfocus=dessine;
  box.onclick=ev=>{
    const d=ev.target.closest('[data-eid]'); if(!d)return;
    hid.value=d.dataset.eid||'';
    if(d.dataset.eid){
      const e=ENFANTS.find(x=>x.id===d.dataset.eid);
      if(e)inp.value=nomEnfant(e);
    }
    box.classList.remove('on');
  };
}
/* Fermeture au clic exterieur, sans casser le clic sur un resultat */
document.addEventListener('mousedown',ev=>{
  if(!ev.target.closest('.cbx'))document.querySelectorAll('.cbx-list.on').forEach(b=>b.classList.remove('on'));
});
/* Renseigne le picker a partir d'une entree existante */
function setEnfantPicker(searchId,idFieldId,enfantId,enfantNom){
  document.getElementById(searchId).value=enfantNom||'';
  document.getElementById(idFieldId).value=enfantId||'';
}
/* Lit le picker : {id, nom} */
function readEnfantPicker(searchId,idFieldId){
  const nom=document.getElementById(searchId).value.trim();
  const id=document.getElementById(idFieldId).value||null;
  return {id:id||null, nom:nom};
}

function openEntry(nature,source){
  curNature=nature; rectifSource=source||null;
  document.getElementById('entryTitle').textContent=
    (source?'Rectification \u2014 ':'')+(nature==='soin'?'Soin / incident':'Administration de m\u00e9dicament');
  document.getElementById('secSoin').style.display =nature==='soin'?'':'none';
  document.getElementById('secTrait').style.display=nature==='soin'?'none':'';
  const cid=IS_DIRECTION?document.getElementById('eCreche').value:PROF.creche_id;
  setupEnfantPicker('eEnfantSearch','eEnfantId','eEnfantList',cid);
  fillPaiSelect(cid);

  /* reinitialisation */
  ['eLocalisation','eCirconstances','eCirconstances2','eSoins','eObservations',
   'eMedicament','eDosage','eAction','eDuree','eOrdRef','eOrdDate','eSecoursDetail','eTemoin']
   .forEach(id=>document.getElementById(id).value='');
  ['chType','chLieu','chLoc','chSoins','chVoie','chAction','chMoyen'].forEach(chipClear);
  ['eAutorisation','eParents','eSecours','eEviction'].forEach(id=>{
    const c=document.getElementById(id);c.checked=false;c.closest('.ck').classList.remove('on');});
  document.getElementById('parentsDetail').style.display='none';
  document.getElementById('secoursDetail').style.display='none';
  document.getElementById('eDate').value=todayISO();
  document.getElementById('eHeure').value=nowHM();
  document.getElementById('ePai').value='';

  /* pre-remplissage si rectification */
  if(source){
    const e=source;
    document.getElementById('eDate').value=e.date_acte;
    document.getElementById('eHeure').value=hm(e.heure_acte);
    setEnfantPicker('eEnfantSearch','eEnfantId',e.enfant_id,e.enfant_nom);
    chipSet('chType',e.type_soin); chipSet('chLieu',e.lieu_survenue);
    chipSet('chSoins',e.soins_realises); chipSet('chVoie',e.voie);
    chipSet('chAction',e.action); chipSet('chMoyen',e.parents_informes_moyen);
    document.getElementById('eLocalisation').value=e.localisation||'';
    document.getElementById('eCirconstances').value=e.circonstances||'';
    document.getElementById('eCirconstances2').value=e.circonstances||'';
    document.getElementById('eObservations').value=e.observations||'';
    document.getElementById('eMedicament').value=e.medicament||'';
    document.getElementById('eDosage').value=e.dosage||'';
    document.getElementById('eDuree').value=e.duree_traitement||'';
    document.getElementById('eOrdRef').value=e.ordonnance_ref||'';
    document.getElementById('eOrdDate').value=e.ordonnance_date||'';
    document.getElementById('eTemoin').value=e.temoin_nom||'';
    if(e.pai_id)document.getElementById('ePai').value=e.pai_id;
    [['eAutorisation',e.autorisation_parentale],['eParents',e.parents_informes],
     ['eSecours',e.appel_secours],['eEviction',e.eviction]].forEach(([id,v])=>{
      const c=document.getElementById(id);c.checked=!!v;c.closest('.ck').classList.toggle('on',!!v);});
    document.getElementById('eSecoursDetail').value=e.secours_detail||'';
    if(e.parents_informes)document.getElementById('parentsDetail').style.display='';
    if(e.appel_secours)document.getElementById('secoursDetail').style.display='';
  }
  document.getElementById('entryWarn').innerHTML=source
    ? "Cette rectification remplacera l\u2019entr\u00e9e d\u2019origine, qui restera visible dans le registre, barr\u00e9e."
    : "Une fois valid\u00e9e, cette entr\u00e9e ne pourra plus \u00eatre modifi\u00e9e apr\u00e8s la fin de la journ\u00e9e. Une erreur se corrige alors par une rectification.";
  openOv('ovEntry');
}

function fillPaiSelect(crecheId){
  const s=document.getElementById('ePai');
  const list=PAIS.filter(p=>p.actif&&(!crecheId||p.creche_id===crecheId));
  s.innerHTML='<option value="">\u2014 Hors PAI (traitement ponctuel) \u2014</option>'
    +list.map(p=>`<option value="${p.id}">${esc(p.enfant_nom)} \u2014 ${esc(p.motif)}</option>`).join('');
}

async function saveEntry(){
  const btn=document.getElementById('btnSaveEntry');
  const crecheId=IS_DIRECTION?document.getElementById('eCreche').value:PROF.creche_id;
  if(!crecheId){toast('Cr\u00e8che manquante.',true);return;}

  const enf=readEnfantPicker('eEnfantSearch','eEnfantId');
  const enfantId=enf.id, enfantNom=enf.nom;
  if(!enfantNom){toast("Le nom de l\u2019enfant est obligatoire.",true);return;}

  const heure=document.getElementById('eHeure').value;
  if(!heure){toast("L\u2019heure est obligatoire.",true);return;}

  const soin=(curNature==='soin');
  const row={
    creche_id:crecheId, nature:curNature,
    enfant_id:enfantId, enfant_nom:enfantNom,
    date_acte:document.getElementById('eDate').value||todayISO(),
    heure_acte:heure,
    observations:document.getElementById('eObservations').value.trim()||null,
    appel_secours:document.getElementById('eSecours').checked,
    secours_detail:document.getElementById('eSecoursDetail').value.trim()||null,
    eviction:document.getElementById('eEviction').checked,
    parents_informes:document.getElementById('eParents').checked,
    parents_informes_moyen:chipValues('chMoyen')[0]||null,
    parents_informes_a:document.getElementById('eParents').checked?new Date().toISOString():null,
    temoin_nom:document.getElementById('eTemoin').value.trim()||null,
    auteur_ref_id:PROF.id, auteur_nom:PROF.name||'',
    rectifie_id:rectifSource?rectifSource.id:null,
    motif_rectification:rectifSource?(document.getElementById('rMotif').value.trim()||null):null
  };
  if(soin){
    row.type_soin=chipValues('chType')[0]||null;
    row.lieu_survenue=chipValues('chLieu')[0]||null;
    const loc=[chipValues('chLoc')[0],document.getElementById('eLocalisation').value.trim()].filter(Boolean).join(' \u2014 ');
    row.localisation=loc||null;
    row.circonstances=document.getElementById('eCirconstances').value.trim()||null;
    const s1=chipValues('chSoins').join(', '), s2=document.getElementById('eSoins').value.trim();
    row.soins_realises=[s1,s2].filter(Boolean).join(' \u2014 ')||null;
    if(!row.type_soin){toast('Choisissez un type de soin.',true);return;}
  }else{
    row.pai_id=document.getElementById('ePai').value||null;
    row.medicament=document.getElementById('eMedicament').value.trim()||null;
    row.dosage=document.getElementById('eDosage').value.trim()||null;
    row.voie=chipValues('chVoie')[0]||null;
    const a1=chipValues('chAction')[0], a2=document.getElementById('eAction').value.trim();
    row.action=[a1,a2].filter(Boolean).join(' \u2014 ')||null;
    row.duree_traitement=document.getElementById('eDuree').value.trim()||null;
    row.ordonnance_ref=document.getElementById('eOrdRef').value.trim()||null;
    row.ordonnance_date=document.getElementById('eOrdDate').value||null;
    row.autorisation_parentale=document.getElementById('eAutorisation').checked;
    row.circonstances=document.getElementById('eCirconstances2').value.trim()||null;
    if(!row.medicament){toast('Le nom du m\u00e9dicament est obligatoire.',true);return;}
    if(!row.autorisation_parentale && !row.pai_id){
      if(!confirm("Aucune autorisation parentale coch\u00e9e et aucun PAI s\u00e9lectionn\u00e9.\n\nEnregistrer quand m\u00eame ?"))return;
    }
  }

  btn.disabled=true;
  const {data,error}=await sb.from('registre_infirmerie').insert(row).select().single();
  btn.disabled=false;
  if(error){toast('Erreur : '+error.message,true);return;}
  ENTRIES.unshift(data);
  ENTRIES.sort((a,b)=>(b.date_acte+b.heure_acte).localeCompare(a.date_acte+a.heure_acte));
  rectifSource=null;
  document.getElementById('rMotif').value='';
  closeOv('ovEntry');
  renderRegistre();

  /* Alerte immediate : secours ou eviction uniquement.
     Aucun detail medical ni nom d'enfant n'est transmis (cf. notify-infirmerie). */
  const motif=data.appel_secours?'secours':(data.eviction?'eviction':null);
  if(motif){
    callFn('notify-infirmerie',{creche_id:data.creche_id,motif:motif,
      date:frDate(data.date_acte),heure:hm(data.heure_acte),source:'registre'});
    toast('Entr\u00e9e enregistr\u00e9e. Direction et r\u00e9f\u00e9rente alert\u00e9es.');
  }else{
    toast('Entr\u00e9e enregistr\u00e9e.');
  }
}

/* ================= DETAIL ================= */
function openDetail(id){
  const e=ENTRIES.find(x=>x.id===id); if(!e)return;
  detailId=id;
  const rectifiee=ENTRIES.some(x=>x.rectifie_id===id);
  const L=[];
  const add=(k,v)=>{if(v)L.push(`<div><span>${k}</span><p>${esc(v)}</p></div>`);};
  add('Enfant',e.enfant_nom);
  add('Cr\u00e8che',crecheName(e.creche_id));
  add('Date et heure',frDate(e.date_acte)+' \u00e0 '+hm(e.heure_acte));
  if(e.nature==='soin'){
    add('Type',e.type_soin); add('Lieu',e.lieu_survenue); add('Partie du corps',e.localisation);
    add('Circonstances',e.circonstances); add('Soins r\u00e9alis\u00e9s',e.soins_realises);
  }else{
    const p=PAIS.find(x=>x.id===e.pai_id);
    add('PAI',p?p.motif:null);
    add('M\u00e9dicament',e.medicament); add('Posologie',e.dosage); add('Voie',e.voie);
    add('Action',e.action); add('Dur\u00e9e du traitement',e.duree_traitement);
    add('Ordonnance',[e.ordonnance_ref,e.ordonnance_date?frDate(e.ordonnance_date):''].filter(Boolean).join(' \u00b7 '));
    add('Autorisation parentale',e.autorisation_parentale?'Oui, au dossier':'Non renseign\u00e9e');
    add('Motif',e.circonstances);
  }
  add('Observations',e.observations);
  add('Parents inform\u00e9s',e.parents_informes?('Oui'+(e.parents_informes_moyen?' \u2014 '+e.parents_informes_moyen:'')):'Non');
  add('Secours',e.appel_secours?(e.secours_detail||'Oui'):null);
  add('\u00c9viction',e.eviction?'Oui':null);
  add('T\u00e9moin',e.temoin_nom);
  add('Renseign\u00e9 par',e.auteur_nom);
  if(e.motif_rectification)add('Motif de rectification',e.motif_rectification);

  let head='';
  if(rectifiee)head='<div class="warn">Cette entr\u00e9e a \u00e9t\u00e9 rectifi\u00e9e. Elle est conserv\u00e9e telle quelle \u2014 voir l\u2019entr\u00e9e de rectification.</div>';
  else if(e.locked_at)head='<div class="info"><i class="ti ti-lock"></i> Entr\u00e9e verrouill\u00e9e le '+frDate(e.locked_at.slice(0,10))+'. Elle ne peut plus \u00eatre modifi\u00e9e.</div>';
  else head='<div class="info">Entr\u00e9e du jour, encore modifiable. Elle sera verrouill\u00e9e automatiquement demain.</div>';

  document.getElementById('detailBody').innerHTML=head+'<div class="dl">'+L.join('')+'</div>';
  document.getElementById('btnRectif').style.display=rectifiee?'none':'';
  document.getElementById('btnIncident').style.display=(e.nature==='soin'&&!e.incident_id)?'':'none';
  openOv('ovDetail');
}

/* Passerelle vers le module Incidents de demandes.html */
async function toIncident(){
  const e=ENTRIES.find(x=>x.id===detailId); if(!e)return;
  /* Le module Incidents attend des valeurs techniques precises :
     type    -> chute | morsure | malaise | allergie | comportement | materiel | autre
     severity-> info | leger | grave                                              */
  const MAP_TYPE={'Chute':'chute','Morsure':'morsure','Griffure':'autre',
    'Choc / collision':'autre','Plaie / coupure':'autre','Br\u00fblure':'autre',
    'Malaise':'malaise','Fi\u00e8vre':'malaise','Corps \u00e9tranger':'autre',
    'R\u00e9action allergique':'allergie','Autre':'autre'};
  const row={creche_id:e.creche_id, child_name:e.enfant_nom,
    incident_date:e.date_acte, incident_time:e.heure_acte,
    type:MAP_TYPE[e.type_soin]||'autre',
    severity:e.appel_secours?'grave':(e.eviction?'leger':'info'),
    description:[e.circonstances,e.observations].filter(Boolean).join('\n'),
    actions:e.soins_realises||'', reporter:e.auteur_nom, treated:false};
  const {data,error}=await sb.from('incidents').insert(row).select().single();
  if(error){toast('Erreur : '+error.message,true);return;}
  await sb.from('registre_infirmerie').update({incident_id:data.id},{returning:'minimal'}).eq('id',e.id);
  e.incident_id=data.id;
  closeOv('ovDetail');
  toast('Signal\u00e9 \u00e0 la direction.');
}

/* ================= PAI ================= */
function renderPai(){
  const cf=document.getElementById('pCreche').value;
  const showInactifs=document.getElementById('pInactifs').checked;
  let list=PAIS.slice();
  if(IS_DIRECTION&&cf&&cf!=='all')list=list.filter(p=>p.creche_id===cf);
  if(!showInactifs)list=list.filter(p=>p.actif);
  const el=document.getElementById('paiList');
  if(!list.length){el.innerHTML='<div class="empty">Aucun PAI enregistr\u00e9.</div>';return;}
  const admin=(PROF.role==='direction'||PROF.role==='referent');
  el.innerHTML=list.map(p=>{
    const revision=p.date_revision&&p.date_revision<todayISO();
    return `<div class="paicard${p.actif?'':' inactif'}">
      <h4>${esc(p.enfant_nom)} \u2014 ${esc(p.motif)}</h4>
      <div class="m">${esc(crecheName(p.creche_id))}${p.medecin_nom?' \u00b7 Dr '+esc(p.medecin_nom):''}${p.medecin_tel?' \u00b7 '+esc(p.medecin_tel):''}</div>
      ${p.traitement_habituel?`<div class="m"><b>Traitement :</b> ${esc(p.traitement_habituel)}</div>`:''}
      ${p.piece_jointe?`<div class="m"><i class="ti ti-paperclip"></i> <a href="#" data-pjview="${p.id}" style="color:var(--violet);font-weight:700;text-decoration:underline">${esc(p.piece_jointe_nom||'PAI signé')}</a></div>`:''}
      ${p.protocole?`<div class="m" style="white-space:pre-wrap;margin-top:6px">${esc(p.protocole)}</div>`:''}
      ${p.date_revision?`<div class="m" style="color:${revision?'var(--red)':'var(--muted)'}">
        ${revision?'\u26a0\ufe0f \u00c0 r\u00e9viser depuis le ':'\u00c0 r\u00e9viser le '}${frDate(p.date_revision)}</div>`:''}
      ${admin?`<div class="acts">
        <button class="btn btn-s" data-pai="${p.id}"><i class="ti ti-edit"></i> Modifier</button>
        <button class="btn btn-g" data-paitoggle="${p.id}">${p.actif?'Cl\u00f4turer':'R\u00e9activer'}</button>
      </div>`:''}
    </div>`;
  }).join('');
}

function openPai(id){
  editPaiId=id||null;
  const p=id?PAIS.find(x=>x.id===id):null;
  document.getElementById('paiTitle').textContent=p?'Modifier le PAI':'Nouveau PAI';
  const cid=IS_DIRECTION?(p?p.creche_id:document.getElementById('iCreche').value):PROF.creche_id;
  if(IS_DIRECTION&&p)document.getElementById('iCreche').value=p.creche_id;
  setupEnfantPicker('iEnfantSearch','iEnfantId','iEnfantList',cid);
  const v=(id,val)=>document.getElementById(id).value=val||'';
  if(p)setEnfantPicker('iEnfantSearch','iEnfantId',p.enfant_id,p.enfant_nom);
  v('iMotif',p&&p.motif); v('iMedecin',p&&p.medecin_nom); v('iTel',p&&p.medecin_tel);
  v('iTraitement',p&&p.traitement_habituel); v('iProtocole',p&&p.protocole);
  v('iSignature',p&&p.date_signature); v('iRevision',p&&p.date_revision);
  pjPath   = p&&p.piece_jointe     ? p.piece_jointe     : null;
  pjNom    = p&&p.piece_jointe_nom ? p.piece_jointe_nom : null;
  pjFile   = null;
  renderPj();
  openOv('ovPai');
}

function renderPj(){
  const box=document.getElementById('iPjBox');
  const lbl=document.getElementById('iPjNom');
  const has=!!(pjFile||pjPath);
  box.classList.toggle('has',has);
  lbl.textContent = pjFile ? pjFile.name+' (à envoyer)' : (pjNom || (pjPath?'Document joint':'Aucun document joint'));
  document.getElementById('btnPjOpen').style.display=(pjPath&&!pjFile)?'':'none';
  document.getElementById('btnPjDel').style.display=has?'':'none';
  document.getElementById('btnPjPick').textContent=has?'Remplacer':'Choisir';
}

/* Le bucket "sante" est prive : on ouvre par URL signee a duree courte,
   jamais par une URL publique. */
async function ouvrirPj(){
  if(!pjPath)return;
  const {data,error}=await sb.storage.from('sante').createSignedUrl(pjPath,300);
  if(error||!data){toast('Ouverture impossible : '+(error?error.message:'lien indisponible'),true);return;}
  window.open(data.signedUrl,'_blank','noopener');
}

async function retirerPj(){
  if(pjFile){pjFile=null;renderPj();return;}
  if(!pjPath)return;
  if(!confirm('Retirer le document joint ?'))return;
  const ancien=pjPath;
  pjPath=null; pjNom=null; renderPj();
  if(editPaiId){
    await sb.from('pai').update({piece_jointe:null,piece_jointe_nom:null},{returning:'minimal'}).eq('id',editPaiId);
    const p=PAIS.find(x=>x.id===editPaiId);
    if(p){p.piece_jointe=null;p.piece_jointe_nom=null;}
    /* Suppression du fichier reservee a la direction (policy sante_delete) */
    if(IS_DIRECTION)await sb.storage.from('sante').remove([ancien]);
  }
  toast('Document retiré.');
}

async function savePai(){
  const crecheId=IS_DIRECTION?document.getElementById('iCreche').value:PROF.creche_id;
  const enf=readEnfantPicker('iEnfantSearch','iEnfantId');
  const enfantId=enf.id, enfantNom=enf.nom;
  const motif=document.getElementById('iMotif').value.trim();
  if(!enfantNom||!motif){toast("Enfant et motif sont obligatoires.",true);return;}
  const row={creche_id:crecheId, enfant_id:enfantId, enfant_nom:enfantNom, motif:motif,
    medecin_nom:document.getElementById('iMedecin').value.trim()||null,
    medecin_tel:document.getElementById('iTel').value.trim()||null,
    traitement_habituel:document.getElementById('iTraitement').value.trim()||null,
    protocole:document.getElementById('iProtocole').value.trim()||null,
    date_signature:document.getElementById('iSignature').value||null,
    date_revision:document.getElementById('iRevision').value||null,
    piece_jointe:pjPath, piece_jointe_nom:pjNom};

  /* Televersement avant l'enregistrement : si le depot echoue, on n'ecrit
     pas une reference vers un fichier inexistant. */
  if(pjFile){
    const btn=document.getElementById('btnSavePai'); btn.disabled=true;
    document.getElementById('iPjNom').textContent='Envoi en cours…';
    const ext=(pjFile.name.split('.').pop()||'bin').toLowerCase();
    const chemin='pai/'+(editPaiId||'nouveau')+'_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
    const {error:upErr}=await sb.storage.from('sante').upload(chemin,pjFile,{upsert:false});
    btn.disabled=false;
    if(upErr){toast('Envoi du document impossible : '+upErr.message,true);renderPj();return;}
    row.piece_jointe=chemin; row.piece_jointe_nom=pjFile.name;
    pjPath=chemin; pjNom=pjFile.name; pjFile=null; renderPj();
  }
  let res;
  if(editPaiId){res=await sb.from('pai').update({...row,updated_at:new Date().toISOString()}).eq('id',editPaiId).select().single();}
  else{res=await sb.from('pai').insert({...row,cree_par:PROF.id}).select().single();}
  if(res.error){toast('Erreur : '+res.error.message,true);return;}
  if(editPaiId){const i=PAIS.findIndex(x=>x.id===editPaiId);if(i>=0)PAIS[i]=res.data;}
  else PAIS.push(res.data);
  closeOv('ovPai'); renderPai(); toast('PAI enregistr\u00e9.');
}

async function togglePai(id){
  const p=PAIS.find(x=>x.id===id); if(!p)return;
  if(!confirm(p.actif?'Cl\u00f4turer ce PAI ?':'R\u00e9activer ce PAI ?'))return;
  const {error}=await sb.from('pai').update({actif:!p.actif},{returning:'minimal'}).eq('id',id);
  if(error){toast('Erreur : '+error.message,true);return;}
  p.actif=!p.actif; renderPai();
}

/* ================= EXPORT PDF ================= */
async function exportPdf(){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const mois=document.getElementById('fMois').value||monthISO();
  const nat=document.getElementById('fNature').value;
  let rows=ENTRIES.slice().sort((a,b)=>(a.date_acte+a.heure_acte).localeCompare(b.date_acte+b.heure_acte));
  if(nat!=='all')rows=rows.filter(e=>e.nature===nat);
  if(!rows.length){toast('Rien \u00e0 exporter sur cette p\u00e9riode.',true);return;}

  const cf=document.getElementById('fCreche').value;
  const lieu=(IS_DIRECTION&&(!cf||cf==='all'))?'Toutes les cr\u00e8ches':crecheName(IS_DIRECTION?cf:PROF.creche_id);
  const [y,m]=mois.split('-');
  const titreMois=new Date(y,m-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});

  let py=0;
  const header=()=>{
    try{doc.addImage(LOGO_KK,'PNG',14,10,26,12);}catch(err){}
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text("Registre d'infirmerie",46,16);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(lieu+'  \u2014  '+titreMois,46,21);
    doc.setDrawColor(200); doc.line(14,26,196,26);
    py=33;
  };
  const foot=()=>{
    const n=doc.internal.getNumberOfPages();
    for(let i=1;i<=n;i++){
      doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130);
      if(RESEAU.pied_page)doc.text(doc.splitTextToSize(RESEAU.pied_page,182)[0],14,284);
      doc.text('\u00c9dit\u00e9 le '+frDate(todayISO())+' par '+(PROF.name||'')+'  \u2014  Document \u00e0 conserver',14,289);
      doc.text('Page '+i+'/'+n,196,289,{align:'right'});
      doc.setTextColor(0);
    }
  };
  const need=h=>{if(py+h>282){doc.addPage();header();}};
  const wrap=(txt,w)=>doc.splitTextToSize(String(txt),w);

  header();
  let lastDay='';
  const rectifiees=new Set(rows.map(e=>e.rectifie_id).filter(Boolean));

  rows.forEach(e=>{
    if(e.date_acte!==lastDay){
      need(12); lastDay=e.date_acte;
      doc.setFillColor(238,236,250); doc.rect(14,py-4,182,7,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(74,63,159);
      doc.text(frLong(e.date_acte),16,py+1); doc.setTextColor(0); py+=11;
    }
    const soin=e.nature==='soin';
    const lignes=[];
    const push=(k,v)=>{if(v)lignes.push([k,String(v)]);};
    if(soin){
      push('Type',e.type_soin); push('Lieu',e.lieu_survenue); push('Localisation',e.localisation);
      push('Circonstances',e.circonstances); push('Soins',e.soins_realises);
    }else{
      push('M\u00e9dicament',e.medicament); push('Posologie',e.dosage); push('Voie',e.voie);
      push('Action',e.action); push('Dur\u00e9e',e.duree_traitement);
      push('Ordonnance',[e.ordonnance_ref,e.ordonnance_date?frDate(e.ordonnance_date):''].filter(Boolean).join(' \u00b7 '));
      push('Autorisation',e.autorisation_parentale?'Oui':'Non renseign\u00e9e');
    }
    push('Observations',e.observations);
    push('Parents',e.parents_informes?('Inform\u00e9s'+(e.parents_informes_moyen?' \u2014 '+e.parents_informes_moyen:'')):'Non inform\u00e9s');
    if(e.appel_secours)push('Secours',e.secours_detail||'Oui');
    if(e.eviction)push('\u00c9viction','Oui');
    if(e.temoin_nom)push('T\u00e9moin',e.temoin_nom);
    if(e.motif_rectification)push('Rectification',e.motif_rectification);

    let h=8; lignes.forEach(([k,v])=>{h+=wrap(v,140).length*4;});
    need(h+4);
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
    let entete=hm(e.heure_acte)+'  \u2014  '+e.enfant_nom+'  ('+(soin?'soin':'m\u00e9dicament')+')';
    if(rectifiees.has(e.id))entete+='   [RECTIFI\u00c9E]';
    doc.text(entete,16,py); py+=4.5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    lignes.forEach(([k,v])=>{
      const L=wrap(v,140);
      doc.setTextColor(120); doc.text(k,18,py);
      doc.setTextColor(0); doc.text(L,52,py);
      py+=L.length*4;
    });
    doc.setTextColor(120); doc.setFontSize(8);
    doc.text('Renseign\u00e9 par '+(e.auteur_nom||''),18,py); doc.setTextColor(0);
    py+=3;
    doc.setDrawColor(235); doc.line(16,py,196,py); py+=5;
  });

  foot();
  doc.save('registre-infirmerie-'+mois+'.pdf');
}

/* ================= NOTICE ================= */
const NOTICE=`
<p><b>\u00c0 quoi sert cette page ?</b><br>
Elle remplace les cahiers papier d\u2019infirmerie. Elle trace deux choses distinctes :
les <b>soins li\u00e9s \u00e0 un incident</b> (chute, morsure, plaie\u2026) et l\u2019<b>administration
d\u2019un m\u00e9dicament</b>, avec ou sans PAI.</p>

<p style="margin-top:12px"><b>Comment saisir</b><br>
Les deux gros boutons en haut ouvrent directement le bon formulaire. La date et l\u2019heure
sont d\u00e9j\u00e0 remplies. Les pastilles color\u00e9es se cliquent : pas besoin de taper.
Comptez moins d\u2019une minute par entr\u00e9e.</p>

<p style="margin-top:12px"><b>Pourquoi je ne peux plus modifier ?</b><br>
Un registre n\u2019a de valeur que s\u2019il ne peut pas \u00eatre r\u00e9\u00e9crit apr\u00e8s coup.
Vous pouvez corriger une entr\u00e9e toute la journ\u00e9e o\u00f9 vous l\u2019avez saisie.
Le lendemain, elle se verrouille. Ensuite, une erreur se corrige par une
<b>rectification</b> : l\u2019entr\u00e9e d\u2019origine reste visible, barr\u00e9e, et la nouvelle
version appara\u00eet \u00e0 c\u00f4t\u00e9. Rien n\u2019est jamais supprim\u00e9, par personne.</p>

<p style="margin-top:12px"><b>Les PAI</b><br>
Un PAI se saisit <b>une seule fois</b> dans l\u2019onglet PAI. Ensuite, \u00e0 chaque
administration, il suffit de le s\u00e9lectionner dans la liste. \u00c7a \u00e9vite de
retaper le protocole et les erreurs de posologie.<br>
Le <b>PAI sign\u00e9</b> peut y \u00eatre joint en PDF ou en photo. Il est conserv\u00e9 dans
un espace priv\u00e9, distinct des autres documents, et n\u2019est consultable que par
les r\u00e9f\u00e9rentes et la direction. Un PAI \u00e9tant valable un an \u00e0 dater de la
signature, la date de r\u00e9vision se calcule seule.</p>

<p style="margin-top:12px"><b>Signaler \u00e0 la direction</b><br>
Depuis le d\u00e9tail d\u2019un soin, le bouton \u00ab Signaler \u00e0 la direction \u00bb cr\u00e9e un
incident dans l\u2019application Demandes. Le registre reste la trace de l\u2019acte,
l\u2019incident sert au suivi. Pas de double saisie.</p>

<p style="margin-top:12px"><b>Export</b><br>
Le bouton Export g\u00e9n\u00e8re le registre du mois affich\u00e9 en PDF, chronologique,
pr\u00eat \u00e0 imprimer ou \u00e0 pr\u00e9senter lors d\u2019un contr\u00f4le PMI.</p>

<p style="margin-top:12px"><b>Qui voit quoi</b><br>
Chaque professionnel remplit le registre de sa cr\u00e8che, sans restriction.
Pour la <b>consultation</b>, l\u2019acc\u00e8s est volontairement limit\u00e9 : les membres
de l\u2019\u00e9quipe consultent les <b>trois derniers mois</b> de leur cr\u00e8che, les
r\u00e9f\u00e9rentes et la direction acc\u00e8dent \u00e0 l\u2019historique complet. Ce n\u2019est pas
un manque de confiance : ce sont des donn\u00e9es de sant\u00e9 d\u2019enfants, et le RGPD
impose de n\u2019y donner acc\u00e8s que dans la mesure o\u00f9 le travail l\u2019exige.
Chaque entr\u00e9e est sign\u00e9e automatiquement au nom de la personne connect\u00e9e :
ne pr\u00eatez pas votre session.</p>
`;

/* ================= EVENEMENTS ================= */
document.getElementById('btnLogin').onclick=doLogin;
document.getElementById('liPwd').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('btnLogout').onclick=async()=>{await sb.auth.signOut();location.reload();};
document.getElementById('btnNotice').onclick=()=>{document.getElementById('noticeBody').innerHTML=NOTICE;openOv('ovNotice');};
document.getElementById('qSoin').onclick=()=>openEntry('soin');
document.getElementById('qTrait').onclick=()=>openEntry('traitement');
document.getElementById('btnSaveEntry').onclick=saveEntry;
document.getElementById('btnSavePai').onclick=savePai;
document.getElementById('btnNewPai').onclick=()=>openPai(null);
document.getElementById('btnPdf').onclick=exportPdf;
document.getElementById('btnIncident').onclick=toIncident;
document.getElementById('fNature').onchange=renderRegistre;
document.getElementById('fSearch').oninput=renderRegistre;
document.getElementById('fMois').onchange=loadEntries;
document.getElementById('fCreche').onchange=loadEntries;
document.getElementById('pCreche').onchange=renderPai;
document.getElementById('pInactifs').onchange=renderPai;
document.getElementById('eCreche').onchange=()=>{
  const cid=document.getElementById('eCreche').value;
  setupEnfantPicker('eEnfantSearch','eEnfantId','eEnfantList',cid); fillPaiSelect(cid);};
document.getElementById('iCreche').onchange=()=>setupEnfantPicker('iEnfantSearch','iEnfantId','iEnfantList',document.getElementById('iCreche').value);

/* Piece jointe */
document.getElementById('btnPjPick').onclick=()=>document.getElementById('iPjInput').click();
document.getElementById('btnPjOpen').onclick=ouvrirPj;
document.getElementById('btnPjDel').onclick=retirerPj;
document.getElementById('iPjInput').onchange=ev=>{
  const f=ev.target.files&&ev.target.files[0]; ev.target.value='';
  if(!f)return;
  if(f.size>10*1024*1024){toast('Document trop volumineux (10 Mo maximum).',true);return;}
  pjFile=f; renderPj();
};

/* Le PAI est valable un an a dater de la signature : on propose la date
   de revision, sans l'imposer. */
document.getElementById('iSignature').onchange=ev=>{
  const rev=document.getElementById('iRevision');
  if(!ev.target.value||rev.value)return;
  const d=new Date(ev.target.value+'T12:00:00');
  d.setFullYear(d.getFullYear()+1);
  rev.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};

document.getElementById('ePai').onchange=e=>{
  const p=PAIS.find(x=>x.id===e.target.value);
  if(p&&p.traitement_habituel&&!document.getElementById('eMedicament').value){
    document.getElementById('eMedicament').value=p.traitement_habituel;
  }};

/* Cases a cocher : etat visuel + sections conditionnelles */
[['eParents','parentsDetail'],['eSecours','secoursDetail'],['eEviction',null],['eAutorisation',null]]
.forEach(([id,detail])=>{
  const c=document.getElementById(id);
  c.onchange=()=>{
    c.closest('.ck').classList.toggle('on',c.checked);
    if(detail)document.getElementById(detail).style.display=c.checked?'':'none';
  };
});

/* Rectification */
document.getElementById('btnRectif').onclick=()=>{closeOv('ovDetail');openOv('ovRectif');};
document.getElementById('btnDoRectif').onclick=()=>{
  const motif=document.getElementById('rMotif').value.trim();
  if(!motif){toast('Indiquez le motif de la rectification.',true);return;}
  const src=ENTRIES.find(x=>x.id===detailId);
  closeOv('ovRectif');
  openEntry(src.nature,src);
};

/* Delegation : clic sur une entree ou une action PAI */
document.addEventListener('click',e=>{
  const en=e.target.closest('.entry');
  if(en){openDetail(en.dataset.id);return;}
  const ed=e.target.closest('[data-pai]');
  if(ed){openPai(ed.dataset.pai);return;}
  const tg=e.target.closest('[data-paitoggle]');
  if(tg){togglePai(tg.dataset.paitoggle);return;}
  const pv=e.target.closest('[data-pjview]');
  if(pv){e.preventDefault();
    const p=PAIS.find(x=>x.id===pv.dataset.pjview);
    if(p&&p.piece_jointe){pjPath=p.piece_jointe;ouvrirPj();}
    return;}
});

/* Onglets */
document.querySelectorAll('.tabs .tab').forEach(t=>{
  t.onclick=()=>{
    document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('on'));
    document.querySelectorAll('.pane').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    document.getElementById('pane-'+t.dataset.pane).classList.add('on');
  };
});

boot();

