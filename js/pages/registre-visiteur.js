/* Saisie publique d'un contrôle du registre de sécurité (lien / QR de la crèche).
   Appels RPC directs, sans librairie : la page doit s'afficher sur un réseau lent. */
const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
async function rpc(name,args){
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),15000);
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',signal:ctl.signal,
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},
      body:JSON.stringify(args||{})});
    const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null;}catch(e){}
    if(!r.ok)return{data:null,error:data||{message:'HTTP '+r.status}};
    return{data,error:null};
  }catch(e){return{data:null,error:{message:String(e&&e.message||e)}};}
  finally{clearTimeout(t);}
}

const TOKEN=new URLSearchParams(location.search).get('t')||'';
const card=document.getElementById('card');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ctx=null,traits=0;

function state(cls,title,msg){card.innerHTML=`<div class="state ${cls}"><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>`;}
function aujourdhui(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

async function boot(){
  if(TOKEN.length<20)return state('err','Lien invalide','Ce lien ne contient pas de code valide.');
  const{data,error}=await rpc('rs_visiteur_info',{p_token:TOKEN});
  if(error)return state('err','Erreur','Impossible de charger ce formulaire.');
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return state('err','Lien désactivé','Ce lien n’est plus valable. Demandez-en un nouveau à la direction.');
  card.innerHTML=`
    <h1>Consigner un contrôle</h1>
    <div class="ctx">Registre de sécurité — ${esc(row.creche_nom||'')}</div>
    <div class="f"><label>Contrôle effectué *</label><input id="iInt" maxlength="200" placeholder="Ex. : contrôle de l’eau du robinet"></div>
    <div class="f"><label>Date *</label><input type="date" id="iDate" value="${aujourdhui()}"></div>
    <div class="f"><label>Votre nom *</label><input id="iNom" maxlength="200" autocomplete="name"></div>
    <div class="f"><label>Votre qualité / société</label><input id="iQual" maxlength="200" placeholder="Ex. : plombier, société X"></div>
    <div class="f"><label>Résultat *</label><select id="iRes">
      <option value="conforme">Conforme</option>
      <option value="conforme_reserves">Conforme avec réserves</option>
      <option value="non_conforme">Non conforme</option></select></div>
    <div class="f"><label>Observations</label><textarea id="iObs" maxlength="2000"></textarea></div>
    <div class="f"><label>Signature</label><canvas id="c"></canvas>
      <div class="tip">Signez avec le doigt dans le cadre.</div></div>
    <div class="acts"><button class="g" id="bc">Effacer</button><button class="p" id="bv">Enregistrer</button></div>`;
  initPad();
  document.getElementById('bc').onclick=clear;
  document.getElementById('bv').onclick=send;
}

function initPad(){
  const c=document.getElementById('c'),r=c.getBoundingClientRect();
  c.width=r.width*2;c.height=r.height*2;
  ctx=c.getContext('2d');ctx.scale(2,2);
  ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#2B2740';
  let on=false,last=null;
  const pt=e=>{const b=c.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return[p.clientX-b.left,p.clientY-b.top];};
  const dn=e=>{e.preventDefault();on=true;last=pt(e);ctx.beginPath();ctx.moveTo(...last);};
  const mv=e=>{if(!on)return;e.preventDefault();const p=pt(e);traits+=Math.hypot(p[0]-last[0],p[1]-last[1]);last=p;ctx.lineTo(...p);ctx.stroke();};
  const up=()=>{on=false;};
  c.addEventListener('touchstart',dn,{passive:false});c.addEventListener('touchmove',mv,{passive:false});
  c.addEventListener('touchend',up);c.addEventListener('mousedown',dn);c.addEventListener('mousemove',mv);
  window.addEventListener('mouseup',up);
}
function clear(){const c=document.getElementById('c');ctx.clearRect(0,0,c.width,c.height);traits=0;}

async function send(){
  const v=id=>(document.getElementById(id).value||'').trim();
  if(!v('iInt'))return alert('Indiquez le contrôle effectué.');
  if(!v('iNom'))return alert('Indiquez votre nom.');
  if(!v('iDate'))return alert('Indiquez la date.');
  const b=document.getElementById('bv');b.disabled=true;b.textContent='Envoi…';
  const png=traits>=24?document.getElementById('c').toDataURL('image/png'):null;
  const{data,error}=await rpc('rs_visiteur_soumettre',{p_token:TOKEN,p_intitule:v('iInt'),p_date:v('iDate'),
    p_nom:v('iNom'),p_qualite:v('iQual'),p_resultat:v('iRes'),p_observations:v('iObs'),p_png:png});
  if(error||data!==true){
    b.disabled=false;b.textContent='Enregistrer';
    return alert(error?'Envoi impossible. Vérifiez votre connexion et réessayez.'
      :'Enregistrement refusé : vérifiez les champs (date récente) ou demandez un nouveau lien.');
  }
  state('ok','Contrôle enregistré','Merci ! Il figure désormais dans le registre de sécurité. Vous pouvez refermer cette page.');
}

boot().catch(e=>{console.error(e);state('err','Erreur','Impossible de charger ce formulaire. Rechargez la page.');});
