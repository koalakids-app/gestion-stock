const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
/* Appels RPC directs vers l'API REST de Supabase (aucune librairie externe à
   télécharger : cette page doit s'afficher même sur un réseau lent ou filtré). */
const sb={
  async rpc(name,args){
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),15000);
    try{
      const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',signal:ctl.signal,
        headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},
        body:JSON.stringify(args||{})});
      const txt=await r.text();
      let data=null;try{data=txt?JSON.parse(txt):null;}catch(e){}
      if(!r.ok)return{data:null,error:data||{message:'HTTP '+r.status}};
      return{data,error:null};
    }catch(e){return{data:null,error:{message:String(e&&e.message||e)}};}
    finally{clearTimeout(t);}
  }
};

const TOKEN=new URLSearchParams(location.search).get('t')||'';
const card=document.getElementById('card');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let REQ=null,ctx=null,hasDrawn=false,DOC=null;

function state(cls,title,msg){
  card.innerHTML=`<div class="state ${cls}"><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>`;
}

let OTP_CTX=null;

async function callOtp(body){
  try{
    const r=await fetch(SUPABASE_URL+'/functions/v1/signature-otp',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON_KEY},
      body:JSON.stringify(body)});
    return await r.json().catch(()=>null);
  }catch(e){return null;}
}

async function boot(){
  if(!TOKEN||TOKEN.length<20)return state('err','Lien invalide','Aucun jeton de signature valide dans ce lien.');
  const{data,error}=await sb.rpc('kk_sig_get',{p_token:TOKEN});
  if(error){
    console.error('sig get',error);
    return state('err','Erreur',"Impossible de charger cette demande de signature.");
  }
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return state('err','Lien expiré','Ce lien de signature n’est plus valable ou la signature a déjà été déposée. Demandez-en un nouveau.');
  REQ=row;
  /* Le builder supabase-js n'a pas de .catch() (seulement .then()) : l'appeler
     directement levait une TypeError avant renderPad() et laissait la page sur
     « Chargement… ». Best-effort : un echec ici ne bloque jamais la signature. */
  Promise.resolve(sb.rpc('kk_sig_marquer_ouvert',{p_token:TOKEN})).then(()=>{},()=>{});

  // Contrat de travail avec vérification par code activée : le/la salarié(e)
  // doit d'abord confirmer son identité avant que le cadre de signature ne
  // s'affiche. Pour tout autre document (ou si le code n'est pas exigé), rien
  // ne change : on passe directement au tracé, comme avant.
  const otp=await callOtp({action:'statut_token',token:TOKEN});
  if(otp&&otp.ok&&otp.otp_required&&!otp.otp_verified){
    OTP_CTX=otp;
    return renderCode();
  }
  DOC=await avecDelai(chargerDocument(),4000);
  renderPad();
}

/* Protocole à lire avant de signer (liens envoyés depuis la bibliothèque de
   documents). Aucun document rattaché -> null, la page reste celle d'avant. */
async function chargerDocument(){
  try{
    const{data,error}=await sb.rpc('kk_sig_document',{p_token:TOKEN});
    if(error)return null;
    const row=Array.isArray(data)?data[0]:data;
    return(row&&row.fichier_url)?row:null;
  }catch(e){return null;}
}
function avecDelai(p,ms){return Promise.race([p,new Promise(r=>setTimeout(()=>r(null),ms))]);}
/* Le signataire lit le document ORIGINAL (mise en page d'origine) : un Word est
   affiché par la visionneuse Office en ligne (fichier public du stockage), un PDF
   directement. Aucune conversion de notre côté. Le lien « Ouvrir le document
   d'origine » reste disponible si la visionneuse ne s'affiche pas. */
/* Lien « Ouvrir » : un Word ouvert directement se télécharge sur téléphone ; on l'ouvre
   donc dans la visionneuse Office en plein écran. Un PDF s'ouvre directement. */
function urlOuverture(){
  const ext=(String(DOC.fichier_url).split('?')[0].split('.').pop()||'').toLowerCase();
  return(ext==='docx'||ext==='doc')
    ?'https://view.officeapps.live.com/op/view.aspx?src='+encodeURIComponent(DOC.fichier_url)
    :DOC.fichier_url;
}
function afficherDocument(){
  const box=document.getElementById('docbox');
  if(!box||!DOC)return;
  const ext=(String(DOC.fichier_url).split('?')[0].split('.').pop()||'').toLowerCase();
  let src=null;
  if(ext==='docx'||ext==='doc')src='https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(DOC.fichier_url);
  else if(ext==='pdf')src=DOC.fichier_url;
  if(!src){
    box.textContent='Aperçu indisponible pour ce format : utilisez le lien « Ouvrir le document d’origine en plein écran » ci-dessus.';
    return;
  }
  box.style.padding='0';box.style.maxHeight='none';box.style.overflow='hidden';
  box.innerHTML='<iframe title="Document à signer" src="'+esc(src)+'" style="width:100%;height:62vh;min-height:360px;border:0;border-radius:14px;background:#fff"></iframe>';
}

function renderCode(){
  card.innerHTML=`
    <h1>Vérification d'identité</h1>
    <div class="ctx">${esc(REQ.contexte||'')}</div>
    <div class="who">${esc(REQ.signataire||'Signataire')}</div>
    <p class="tip" id="codeHint" style="margin:8px 0 14px;text-align:left">
      Avant de signer, confirmez votre identité avec un code envoyé par e-mail${
        OTP_CTX.destination_masquee?(' à '+esc(OTP_CTX.destination_masquee)):''}.</p>
    <div class="acts" id="codeActs">
      <button class="p" id="benv">Recevoir mon code</button>
    </div>`;
  document.getElementById('benv').onclick=envoyerCode;
}

async function envoyerCode(){
  const b=document.getElementById('benv');b.disabled=true;b.textContent='Envoi…';
  const r=await callOtp({action:'envoyer',reponse_id:OTP_CTX.reponse_id,employe_id:OTP_CTX.employe_id,canal:'email'});
  if(!r||!r.ok){
    b.disabled=false;b.textContent='Recevoir mon code';
    return alert((r&&r.erreur)||'Le code n’a pas pu être envoyé. Réessayez dans un instant.');
  }
  document.getElementById('codeHint').textContent='Code envoyé'
    +(r.destination_masquee?(' à '+r.destination_masquee):'')+' — valable 10 minutes.';
  document.getElementById('codeActs').innerHTML=`
    <input id="ffCode" maxlength="6" inputmode="numeric" placeholder="Code à 6 chiffres"
      style="flex:1;border:1px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px;text-align:center;letter-spacing:3px">
    <button class="p" id="bver">Vérifier</button>`;
  document.getElementById('bver').onclick=verifierCode;
}

async function verifierCode(){
  const code=(document.getElementById('ffCode')||{}).value||'';
  if(!/^[0-9]{6}$/.test(code))return alert('Saisissez le code à 6 chiffres reçu par e-mail.');
  const b=document.getElementById('bver');b.disabled=true;b.textContent='Vérification…';
  const r=await callOtp({action:'verifier',reponse_id:OTP_CTX.reponse_id,code});
  if(!r||!r.ok){
    b.disabled=false;b.textContent='Vérifier';
    return alert((r&&r.erreur)||'Code incorrect ou expiré.');
  }
  renderPad();
}

function renderPad(){
  const lecture=DOC?`
    <a class="dl" href="${esc(urlOuverture())}" target="_blank" rel="noopener">📄 Ouvrir le document d’origine en plein écran</a>
    <div class="docbox" id="docbox">Chargement du document…</div>
    <p class="tip" style="margin:-4px 0 10px;text-align:left">Le document s’affiche ci-dessus. S’il reste vide, touchez « Ouvrir le document d’origine en plein écran ».</p>
    <label class="lu"><input type="checkbox" id="lu"> J’ai pris connaissance de ce document et je le signe.</label>`:'';
  card.innerHTML=`
    <h1>Signature</h1>
    <div class="ctx">${esc(REQ.contexte||'')}</div>
    <div class="who">${esc(REQ.signataire||'Signataire')}</div>
    ${lecture}
    <canvas id="c"></canvas>
    <div class="tip">Signez avec le doigt dans le cadre ci-dessus</div>
    <div class="acts">
      <button class="g" id="bc">Effacer</button>
      <button class="p" id="bv">Valider</button>
    </div>`;
  initPad();
  document.getElementById('bc').onclick=clear;
  document.getElementById('bv').onclick=send;
  afficherDocument();
  afficherQrMobile();
  surveillerStatut();
}

/* Page restée ouverte pendant que la signature est faite ailleurs (téléphone après
   scan du QR code) : on interroge régulièrement le statut du lien et on affiche
   « Signature enregistrée » dès qu'elle est reçue. Arrêt dès qu'un état final est
   affiché ; une erreur réseau est ignorée (nouvel essai au prochain tour). */
let surveillance=null;
function arreterSurveillance(){if(surveillance){clearInterval(surveillance);surveillance=null;}}
function surveillerStatut(){
  arreterSurveillance();
  let enCours=false;
  const verifier=async()=>{
    if(enCours||!document.getElementById('c'))return;     // cadre plus affiché : rien à surveiller
    enCours=true;
    try{
      const{data,error}=await sb.rpc('kk_sig_statut',{p_token:TOKEN});
      if(error)return;
      if(data==='signe'){arreterSurveillance();state('ok','Signature enregistrée','Ce document a été signé (depuis un autre appareil). Vous pouvez refermer cette page.');}
      else if(data==='expire'||data==='inconnu'){arreterSurveillance();state('err','Lien expiré','Ce lien n\u2019est plus valable. Demandez-en un nouveau.');}
    }finally{enCours=false;}
  };
  surveillance=setInterval(verifier,4000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)verifier();});
}

/* Sur ordinateur : QR code de cette même page, à scanner pour signer au doigt sur
   le téléphone (le lien reste valable sur les deux appareils jusqu'à la signature).
   Librairie chargée après l'affichage, avec délai maximal : sans elle, pas de QR. */
function chargerQr(){
  if(typeof QRCode==='function')return Promise.resolve(true);
  return new Promise(res=>{
    const sc=document.createElement('script');
    const fin=ok=>{clearTimeout(t);res(ok);};
    const t=setTimeout(()=>res(false),8000);
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.onload=()=>fin(typeof QRCode==='function');sc.onerror=()=>fin(false);
    document.head.appendChild(sc);
  });
}
async function afficherQrMobile(){
  try{
    // seulement avec souris + grand écran : sur téléphone ce QR serait inutile
    if(!(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches&&innerWidth>=700))return;
    if(!await chargerQr()||!document.getElementById('c'))return;
    const bloc=document.createElement('div');
    bloc.id='qrMobile';
    bloc.style.cssText='display:flex;align-items:center;gap:14px;margin:0 0 14px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:#FBFAFE';
    bloc.innerHTML='<div id="qrMobileImg" style="flex:none;line-height:0"></div>'
      +'<div><div class="who" style="margin-bottom:2px">📱 Signer depuis votre téléphone</div>'
      +'<div class="tip" style="margin:0;text-align:left">Scannez ce QR code avec l’appareil photo de votre téléphone pour signer au doigt. Sinon, signez ici avec la souris.</div></div>';
    const qui=card.querySelector('.who');          // juste sous le nom du signataire
    if(qui&&qui.nextSibling)card.insertBefore(bloc,qui.nextSibling);else card.appendChild(bloc);
    new QRCode(document.getElementById('qrMobileImg'),{text:location.href,width:110,height:110,correctLevel:QRCode.CorrectLevel.M});
  }catch(e){console.warn('QR mobile',e);}
}

function initPad(){
  const c=document.getElementById('c');
  const r=c.getBoundingClientRect();
  c.width=r.width*2;c.height=r.height*2;
  ctx=c.getContext('2d');ctx.scale(2,2);
  ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#2B2740';
  let on=false;
  const pt=e=>{const b=c.getBoundingClientRect();const p=e.touches?e.touches[0]:e;
    return[p.clientX-b.left,p.clientY-b.top];};
  const dn=e=>{e.preventDefault();on=true;hasDrawn=true;ctx.beginPath();ctx.moveTo(...pt(e));};
  const mv=e=>{if(!on)return;e.preventDefault();ctx.lineTo(...pt(e));ctx.stroke();};
  const up=()=>{on=false;};
  c.addEventListener('touchstart',dn,{passive:false});
  c.addEventListener('touchmove',mv,{passive:false});
  c.addEventListener('touchend',up);
  c.addEventListener('mousedown',dn);c.addEventListener('mousemove',mv);
  window.addEventListener('mouseup',up);
}
function clear(){const c=document.getElementById('c');ctx.clearRect(0,0,c.width,c.height);hasDrawn=false;}

async function send(){
  if(DOC&&!document.getElementById('lu').checked)return alert('Merci de cocher « J’ai pris connaissance » avant de valider.');
  if(!hasDrawn)return alert('Merci de signer avant de valider.');
  const b=document.getElementById('bv');b.disabled=true;b.textContent='Envoi…';
  const png=document.getElementById('c').toDataURL('image/png');
  const{data,error}=await sb.rpc('kk_sig_sign',{p_token:TOKEN,p_png:png});
  if(error){
    b.disabled=false;b.textContent='Valider';
    console.error('sig sign',error);
    return alert('La signature n\u2019a pas pu \u00eatre envoy\u00e9e. V\u00e9rifiez votre connexion et r\u00e9essayez.');
  }
  if(data!==true){
    return state('err','Lien expiré','Ce lien n\u2019est plus valable ou une signature a déjà été déposée. Demandez-en un nouveau.');
  }
  arreterSurveillance();
  state('ok','Signature enregistrée','Vous pouvez refermer cette page.');
}

/* Filet de securite : toute erreur inattendue au demarrage doit s'afficher,
   jamais laisser la page figee sur « Chargement… ». */
boot().catch(e=>{
  console.error('boot',e);
  state('err','Erreur','Impossible de charger cette demande de signature. Rechargez la page ou demandez un nouveau lien.');
});
