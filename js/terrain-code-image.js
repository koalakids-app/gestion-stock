/* ================================================================
   ACCÈS TERRAIN PAR CODE IMAGE (option par crèche)
   Voir sql/terrain_code_image.sql et supabase/functions/terrain-code-image.
   Sur la tablette d'une crèche qui a activé l'option (lien terrain.html?k=<jeton>,
   le même jeton que le pointage), la personne tape ses 4 images : le serveur
   ouvre SA session (droits, crèche et journaux inchangés). La session est
   marquée localement (FLAG) ; elle dispense du code à 6 chiffres, se verrouille
   après 5 minutes d'inactivité et ne déconnecte jamais les autres appareils.
   Chargé avant terrain.js et infirmerie.js (utilisé par leur portail MFA).
   ================================================================ */
const KK_TCI_FLAG='kk_terrain_code_session';
const KK_TCI_TOKEN='kk_terrain_k';
const KK_TCI_IDLE_MS=5*60*1000;
/* Même pool, même ordre que kk_pictos_pool() et js/pages/tablette.js. */
const KK_TCI_PICTOS=['ours','arc_en_ciel','zebre','hochet','baleine','cubes_alphabet','camionnette_rouge','pingouin'];
const KK_TCI_BASE='https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/';

/* Le jeton vient du lien ; gardé sur la tablette pour l'application installée (qui s'ouvre sans ?k=). */
function kkTciToken(){
  let k=new URLSearchParams(location.search).get('k')||'';
  try{
    if(k.length>=20){localStorage.setItem(KK_TCI_TOKEN,k);}
    else k=localStorage.getItem(KK_TCI_TOKEN)||'';
  }catch(e){}
  return k.length>=20?k:'';
}

/* Session ouverte par code image : repère local + aucune trace de mot de passe ni de TOTP dans le jeton. */
async function kkTciSessionActive(sb){
  try{
    if(localStorage.getItem(KK_TCI_FLAG)!=='1')return false;
    const{data:{session}}=await sb.auth.getSession();
    if(!session)return false;
    const p=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    const m=(p.amr||[]).map(a=>a.method);
    return !m.includes('password')&&!m.includes('totp');
  }catch(e){return false;}
}

async function kkTciVerrouiller(sb){
  try{localStorage.removeItem(KK_TCI_FLAG);}catch(e){}
  try{await sb.auth.signOut({scope:'local'});}catch(e){}
  location.href='terrain.html';
}
let _kkTciIdle=null;
function kkTciVerrouillageAuto(sb){
  if(_kkTciIdle!==null)return;
  const arme=()=>{clearTimeout(_kkTciIdle);_kkTciIdle=setTimeout(()=>kkTciVerrouiller(sb),KK_TCI_IDLE_MS);};
  ['pointerdown','keydown','touchstart','scroll'].forEach(ev=>addEventListener(ev,arme,{passive:true}));
  arme();
}

/* Déconnexion : une session par code image repart sur l'écran des images ; les autres, comme avant. */
async function kkTciDeconnecter(sb){
  const parCode=await kkTciSessionActive(sb);
  try{localStorage.removeItem(KK_TCI_FLAG);}catch(e){}
  await sb.auth.signOut(parCode?{scope:'local'}:undefined);
  if(parCode)location.href='terrain.html'; else location.reload();
}

/* ---------- Écran des 4 images (terrain.html) ---------- */
let _tciCode=[],_tciBusy=false;
function tciRendre(){
  const sl=document.getElementById('tciSlots'),gr=document.getElementById('tciGrid');
  if(!sl||!gr)return;
  sl.innerHTML=[0,1,2,3].map(i=>{
    const id=_tciCode[i];
    return '<div class="tci-slot'+(id?' on':'')+'">'+(id?'<img src="'+KK_TCI_BASE+id+'.png" alt="">':'')+'</div>';
  }).join('');
  gr.innerHTML=KK_TCI_PICTOS.map(id=>
    '<button type="button" class="tci-key'+(_tciCode.includes(id)?' used':'')+'" data-p="'+id+'" aria-label="image">'
    +'<img src="'+KK_TCI_BASE+id+'.png" alt=""></button>').join('');
}
function tciMessage(t){
  const e=document.getElementById('tciErr');
  if(e)e.textContent=t||'';
}
function tciRecommencer(){_tciCode=[];tciMessage('');tciRendre();}
async function tciEnvoyer(sb,url,cle){
  if(_tciBusy)return;
  _tciBusy=true;
  try{
    const r=await fetch(url+'/functions/v1/terrain-code-image',{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:cle,Authorization:'Bearer '+cle},
      body:JSON.stringify({token:kkTciToken(),code:_tciCode})
    });
    const d=await r.json().catch(()=>({}));
    if(!d.ok){
      tciMessage(d.error||'Code refusé.');
      setTimeout(()=>{_tciCode=[];tciRendre();},1200);
      return;
    }
    let{error}=await sb.auth.verifyOtp({token_hash:d.token_hash,type:'magiclink'});
    if(error)({error}=await sb.auth.verifyOtp({token_hash:d.token_hash,type:'email'}));
    if(error){tciMessage("Ouverture de session impossible. Réessayez.");_tciCode=[];tciRendre();return;}
    try{localStorage.setItem(KK_TCI_FLAG,'1');}catch(e){}
    location.reload();
  }catch(e){
    tciMessage('Connexion impossible. Vérifiez le réseau.');
    setTimeout(()=>{_tciCode=[];tciRendre();},1200);
  }finally{_tciBusy=false;}
}

/* Affiche l'écran des images si la tablette est reliée à une crèche qui a activé l'option.
   Renvoie true si c'est le cas ; sinon l'appelant garde le formulaire e-mail. */
async function kkTciAfficher(sb,url,cle){
  const k=kkTciToken();
  if(!k)return false;
  try{
    const{data,error}=await sb.rpc('kk_terrain_mode',{p_token:k});
    if(error||data!==true)return false;
  }catch(e){return false;}
  const box=document.getElementById('tciBox');
  if(!box)return false;
  box.style.display='block';
  document.getElementById('liFormBox').style.display='none';
  tciRecommencer();
  if(!box.dataset.pret){
    box.dataset.pret='1';
    document.getElementById('tciGrid').addEventListener('click',e=>{
      const b=e.target.closest('.tci-key');
      if(!b||_tciBusy||_tciCode.length>=4)return;
      const id=b.dataset.p;
      if(_tciCode.includes(id))return;
      _tciCode.push(id);
      tciMessage('');
      tciRendre();
      if(_tciCode.length===4)tciEnvoyer(sb,url,cle);
    });
    document.getElementById('tciReset').onclick=tciRecommencer;
    document.getElementById('tciMail').onclick=()=>{
      box.style.display='none';
      document.getElementById('liFormBox').style.display='block';
    };
  }
  return true;
}
