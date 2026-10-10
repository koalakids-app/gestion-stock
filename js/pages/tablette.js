const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

const TOKEN=new URLSearchParams(location.search).get('k')||'';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const main=document.getElementById('main');
const stateBox=document.getElementById('stateBox');
let busy=false;
let resetTimer=null;
let mode='enfant';

// Pool de pictogrammes — DOIT rester identique, dans le même ordre, à
// kk_pictos_pool() dans sql/claude_37-kiosque-code-images.sql.
const PICTOS=[
  {id:'ours',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/ours.png'},
  {id:'arc_en_ciel',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/arc_en_ciel.png'},
  {id:'zebre',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/zebre.png'},
  {id:'hochet',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/hochet.png'},
  {id:'baleine',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/baleine.png'},
  {id:'cubes_alphabet',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/cubes_alphabet.png'},
  {id:'camionnette_rouge',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/camionnette_rouge.png'},
  {id:'pingouin',url:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/pingouin.png'}
];
const pictoById=Object.fromEntries(PICTOS.map(p=>[p.id,p]));
let pictoCode=[];
let crecheId=null;

const pictoSlotsEl=document.getElementById('pictoSlots');
const pictoGridEl=document.getElementById('pictoGrid');

function renderPictoSlots(){
  pictoSlotsEl.innerHTML=[0,1,2,3].map(i=>{
    const p=pictoCode[i]?pictoById[pictoCode[i]]:null;
    return '<div class="picto-slot'+(p?' filled':'')+'">'+(p?'<img src="'+p.url+'" alt="">':'')+'</div>';
  }).join('');
}
function renderPictoGrid(){
  pictoGridEl.innerHTML=PICTOS.map(p=>
    '<button class="picto-key'+(pictoCode.includes(p.id)?' used':'')+'" data-p="'+p.id+'">'
    +'<img src="'+p.url+'" alt=""></button>'
  ).join('');
}
function shakePictoSlots(){
  pictoSlotsEl.classList.remove('shake');
  void pictoSlotsEl.offsetWidth;
  pictoSlotsEl.classList.add('shake');
}
function resetPictos(){
  pictoCode=[];
  renderPictoSlots();
  renderPictoGrid();
  clearTimeout(resetTimer);
  showMain();
}
window.resetPictos=resetPictos;

pictoGridEl.addEventListener('click',e=>{
  const btn=e.target.closest('.picto-key');
  if(!btn||busy||pictoCode.length>=4)return;
  const id=btn.dataset.p;
  if(pictoCode.includes(id))return;
  pictoCode.push(id);
  renderPictoSlots();
  renderPictoGrid();
  if(pictoCode.length===4)submitPictoCode();
});

function setMode(m){
  mode=m;
  document.querySelectorAll('#modeSwitch button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  document.getElementById('modeEnfant').classList.toggle('hidden',m!=='enfant');
  document.getElementById('modePerso').classList.toggle('hidden',m!=='perso');
  resetPictos();
  resetPictosPerso();
}
window.setMode=setMode;

function showMain(){
  stateBox.classList.add('hidden');
  main.classList.remove('hidden');
}
function showState(html){
  main.classList.add('hidden');
  stateBox.innerHTML=html;
  stateBox.classList.remove('hidden');
}

async function submitPictoCode(){
  if(busy)return;
  busy=true;
  showState(`<div class="state busy"><i>⏳</i><h2>Vérification…</h2></div>`);
  if(!crecheId){
    busy=false;
    showErrorPictosThenReset('Tablette non configurée','Contactez la direction pour reconfigurer cet appareil.',0);
    return;
  }
  const{data,error}=await sb.rpc('verifier_code_pointage',{p_creche_id:crecheId,p_code:pictoCode});
  busy=false;
  const row=Array.isArray(data)?data[0]:data;
  if(error||!row){
    console.error('verifier_code_pointage',error);
    showErrorPictosThenReset('Connexion impossible','Vérifiez le Wi-Fi de la tablette et réessayez.',3000);
    return;
  }
  if(!row.ok){
    handlePictoError(row.error);
    return;
  }
  const verbe=row.action==='arrivee'?'Arrivée enregistrée':'Départ enregistré';
  const heure=row.horodatage?new Date(row.horodatage).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
  showState(`
    <div class="state ok">
      <i>✓</i>
      <h2>${esc(verbe)}</h2>
      <p>${esc(row.prenom||'')}${row.nom?' '+esc(row.nom):''} — ${esc(heure)}</p>
    </div>`);
  clearTimeout(resetTimer);
  resetTimer=setTimeout(resetPictos,6000);
}

function handlePictoError(err){
  const messages={
    creche_invalide:['Tablette non configurée','Contactez la direction pour reconfigurer cet appareil.',0],
    trop_de_tentatives:['Trop de tentatives','Merci de patienter quelques minutes avant de réessayer.',4000],
    code_invalide:['Code invalide','Choisissez 4 images distinctes.',2000],
    code_inconnu:['Code inconnu','Vérifiez les images et réessayez.',2000]
  };
  const[title,msg,delay]=messages[err]||['Erreur','Une erreur inattendue est survenue.',3000];
  showErrorPictosThenReset(title,msg,delay);
}

function showErrorPictosThenReset(title,msg,delay){
  showState(`<div class="state err"><i>✕</i><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>`);
  shakePictoSlots();
  pictoCode=[];
  renderPictoSlots();
  renderPictoGrid();
  clearTimeout(resetTimer);
  if(delay>0)resetTimer=setTimeout(resetPictos,delay);
}

/* ===================== Mode personnel : code image ==========================
   Depuis sql/kiosque_code_pictos_personnel.sql, le personnel pointe aussi par
   séquence de 4 pictogrammes (à la place du code à 4 chiffres). Grille et
   emplacements dédiés (pictoGridPerso/pictoSlotsPerso), distincts de ceux du
   mode enfant : kk_kiosk_pointer_pictos(token, code_pictos[]) exige le token de la
   tablette en plus du code (contrairement à verifier_code_pointage, réservé
   aux enfants), donc un chemin de vérification séparé. */
let pictoCodePerso=[];
const pictoSlotsPersoEl=document.getElementById('pictoSlotsPerso');
const pictoGridPersoEl=document.getElementById('pictoGridPerso');

function renderPictoSlotsPerso(){
  pictoSlotsPersoEl.innerHTML=[0,1,2,3].map(i=>{
    const p=pictoCodePerso[i]?pictoById[pictoCodePerso[i]]:null;
    return '<div class="picto-slot'+(p?' filled':'')+'">'+(p?'<img src="'+p.url+'" alt="">':'')+'</div>';
  }).join('');
}
function renderPictoGridPerso(){
  pictoGridPersoEl.innerHTML=PICTOS.map(p=>
    '<button class="picto-key'+(pictoCodePerso.includes(p.id)?' used':'')+'" data-p="'+p.id+'">'
    +'<img src="'+p.url+'" alt=""></button>'
  ).join('');
}
function shakePictoSlotsPerso(){
  pictoSlotsPersoEl.classList.remove('shake');
  void pictoSlotsPersoEl.offsetWidth;
  pictoSlotsPersoEl.classList.add('shake');
}
function resetPictosPerso(){
  pictoCodePerso=[];
  renderPictoSlotsPerso();
  renderPictoGridPerso();
  clearTimeout(resetTimer);
  showMain();
}
window.resetPictosPerso=resetPictosPerso;

pictoGridPersoEl.addEventListener('click',e=>{
  const btn=e.target.closest('.picto-key');
  if(!btn||busy||pictoCodePerso.length>=4)return;
  const id=btn.dataset.p;
  if(pictoCodePerso.includes(id))return;
  pictoCodePerso.push(id);
  renderPictoSlotsPerso();
  renderPictoGridPerso();
  if(pictoCodePerso.length===4)submitPictoCodePerso();
});

async function submitPictoCodePerso(){
  if(busy)return;
  busy=true;
  showState(`<div class="state busy"><i>⏳</i><h2>Vérification…</h2></div>`);
  const{data,error}=await sb.rpc('kk_kiosk_pointer_pictos',{p_token:TOKEN,p_code:pictoCodePerso});
  busy=false;
  const row=Array.isArray(data)?data[0]:data;
  if(error||!row){
    console.error('kiosk pointer (perso)',error);
    showErrorPictosPersoThenReset('Connexion impossible','Vérifiez le Wi-Fi de la tablette et réessayez.',3000);
    return;
  }
  if(!row.ok){
    handleErrorPerso(row.error);
    return;
  }
  const verbe=row.action==='arrivee'?'Arrivée enregistrée':'Départ enregistré';
  const heure=row.horodatage?new Date(row.horodatage).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
  showState(`
    <div class="state ok">
      <i>✓</i>
      <h2>${esc(verbe)}</h2>
      <p>${esc(row.label||'')}${row.sub?' · '+esc(row.sub):''} — ${esc(heure)}</p>
    </div>`);
  clearTimeout(resetTimer);
  resetTimer=setTimeout(resetPictosPerso,6000);
}

function handleErrorPerso(err){
  const messages={
    token_invalide:['Tablette non configurée','Contactez la direction pour reconfigurer cet appareil.',0],
    trop_de_tentatives:['Trop de tentatives','Merci de patienter quelques minutes avant de réessayer.',4000],
    code_invalide:['Code invalide','Choisissez 4 images distinctes.',2000],
    code_inconnu:['Code inconnu','Vérifiez les images et réessayez.',2000]
  };
  const[title,msg,delay]=messages[err]||['Erreur','Une erreur inattendue est survenue.',3000];
  showErrorPictosPersoThenReset(title,msg,delay);
}

function showErrorPictosPersoThenReset(title,msg,delay){
  showState(`<div class="state err"><i>✕</i><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>`);
  shakePictoSlotsPerso();
  pictoCodePerso=[];
  renderPictoSlotsPerso();
  renderPictoGridPerso();
  clearTimeout(resetTimer);
  if(delay>0)resetTimer=setTimeout(resetPictosPerso,delay);
}

function tickClock(){
  const n=new Date();
  document.getElementById('clock').textContent=n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  document.getElementById('date').textContent=n.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
}
tickClock();
setInterval(tickClock,1000);

renderPictoSlots();
renderPictoGrid();

if(!TOKEN||TOKEN.length<20){
  showState('<div class="state err"><i>✕</i><h2>Lien invalide</h2><p>Cette tablette n’a pas de jeton de configuration valide dans son URL.</p></div>');
}else{
  sb.rpc('kk_resolve_creche_id',{p_token:TOKEN}).then(({data,error})=>{
    if(error)console.error('kk_resolve_creche_id',error);
    crecheId=data||null;
  });
}
