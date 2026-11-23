/* Supports pédagogiques : bibliothèque de ressources de formation (ex-Padlet « Supports
   pédagogiques Koalakids »). Lecture : tout compte référent·e / collaborateur·trice ;
   écriture : direction (RLS, sql/supports_pedagogiques.sql).
   - Thématiques : supports_themes ; supports : supports_pedagogiques (lien OU fichier dans le
     bucket privé `supports-pedagogiques`) ; suivi personnel : supports_vus (vu + notes).
   - Import unique depuis le Padlet : supports-pedagogiques-import.json + les fichiers du Padlet
     choisis à la main (rapprochés par leur nom). */
const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const SP_BUCKET='supports-pedagogiques';
const SP_MANIFESTES=['supports-pedagogiques-import.json','supports-pedagogiques-import-2.json'];
const SP_TYPES={video:'Vidéo',pdf:'PDF',document:'Document',image:'Image',lien:'Lien'};
const SP_ICONES={video:'▶',pdf:'📄',document:'📝',image:'🖼️',lien:'🔗'};
const SP_COULEURS=['#ffe3d6','#e0efff','#ffe0ee','#e3f6e8','#eadfff','#fff3c9','#ffe9cf','#dff5f0'];
const SP_DEGRADES=['linear-gradient(135deg,#ffb199,#ff7e5f)','linear-gradient(135deg,#ffd6e8,#d6f0ff)','linear-gradient(135deg,#ffdc73,#e3532e)','linear-gradient(135deg,#bfe3ff,#e8d9ff)','linear-gradient(135deg,#c9f0d6,#9fd8e8)','linear-gradient(135deg,#e8e0ff,#ffd3c2)'];

let SP={themes:[],supports:[],vus:{},direction:false,gestion:false,moi:null,user:null,enfantCible:null};
let spTheme='',spType='Tous',spQ='';

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function $(id){return document.getElementById(id);}
function spEtat(html){const e=$('etat');e.innerHTML=html;e.hidden=!html;}

/* Identifiant YouTube d'un lien youtu.be / youtube.com. */
function spYoutubeId(u){
  const m=String(u||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m?m[1]:'';
}
function spNomSur(nom){
  return String(nom||'fichier').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'fichier';
}
function spTypeDepuisFichier(f){
  const n=(f.name||'').toLowerCase(),t=f.type||'';
  if(t.startsWith('video/'))return 'video';
  if(t.startsWith('image/'))return 'image';
  if(t==='application/pdf'||n.endsWith('.pdf'))return 'pdf';
  return 'document';
}

/* ---------- Chargement ---------- */
async function spCharger(){
  const [t,s]=await Promise.all([
    sb.from('supports_themes').select('*').order('ordre',{ascending:true}),
    sb.from('supports_pedagogiques').select('*').order('ordre',{ascending:true})
  ]);
  if(t.error)throw t.error;
  if(s.error)throw s.error;
  SP.themes=t.data||[];SP.supports=s.data||[];
  const v=await sb.from('supports_vus').select('support_id,notes').eq('user_id',SP.user.id);
  SP.vus={};
  (v.data||[]).forEach(r=>{SP.vus[r.support_id]=r;});
}

/* ---------- Affichage ---------- */
function spThemeDe(s){return SP.themes.find(t=>t.id===s.theme_id)||{nom:'?',icone:'📚',couleur:'#eee'};}
function spFiltres(){
  const q=spQ.trim().toLowerCase();
  const ordreTh=Object.fromEntries(SP.themes.map((t,i)=>[t.id,i]));
  return SP.supports.filter(s=>
    (!spTheme||(spTheme==='__vu'?!!SP.vus[s.id]:s.theme_id===spTheme))&&
    (spType==='Tous'||SP_TYPES[s.type]===spType)&&
    (!q||(s.titre+' '+(s.description||'')).toLowerCase().includes(q))
  ).sort((a,b)=>(ordreTh[a.theme_id]-ordreTh[b.theme_id])||(a.ordre-b.ordre));
}
function spLigneTheme(x){
  return '<div class="th '+(spTheme===x.id?'on':'')+'" data-t="'+esc(x.id)+'"><span class="ic" style="background:'+esc(x.couleur)+'">'+esc(x.icone)+'</span><span>'+esc(x.nom)+'</span><span class="n">'+SP.supports.filter(s=>s.theme_id===x.id).length+'</span>'+
    (SP.direction?'<button class="menu" data-m="'+esc(x.id)+'" title="Modifier la thématique" aria-label="Modifier la thématique">⋮</button>':'')+'</div>';
}
function spDessinerThemes(){
  let corps='',dernier=null;
  SP.themes.forEach(x=>{
    const g=x.groupe||'Thématiques';
    if(g!==dernier){corps+='<h3>'+esc(g)+'</h3>';dernier=g;}
    corps+=spLigneTheme(x);
  });
  $('themes').innerHTML=
    '<div class="th '+(spTheme===''?'on':'')+'" data-t=""><span class="ic" style="background:#eee">📚</span>Tous les supports<span class="n">'+SP.supports.length+'</span></div>'+
    corps+
    (SP.direction?'<div class="th th-new" id="th-nouv">＋ Nouvelle thématique</div>':'')+
    '<h3>Mon suivi</h3><div class="th '+(spTheme==='__vu'?'on':'')+'" data-t="__vu"><span class="ic" style="background:#dff5e6">✅</span>Déjà vus<span class="n">'+Object.keys(SP.vus).filter(id=>SP.supports.some(s=>s.id===id)).length+'</span></div>';
  $('themes').querySelectorAll('.th[data-t]').forEach(e=>e.onclick=ev=>{
    if(ev.target.closest('.menu'))return;
    spTheme=e.dataset.t;spDessiner();
  });
  $('themes').querySelectorAll('.menu').forEach(b=>b.onclick=ev=>{ev.stopPropagation();spThemeForm(b.dataset.m);});
  const nv=$('th-nouv');if(nv)nv.onclick=()=>spThemeForm(null);
}
function spDessinerTypes(){
  const T=['Tous',...Object.values(SP_TYPES)];
  $('types').innerHTML=T.map(x=>'<span class="chip '+(spType===x?'on':'')+'" data-y="'+esc(x)+'">'+esc(x)+'</span>').join('');
  $('types').querySelectorAll('.chip').forEach(e=>e.onclick=()=>{spType=e.dataset.y;spDessiner();});
}
function spDessinerParcours(){
  const P=SP.supports.filter(s=>s.a_voir).sort((a,b)=>a.ordre-b.ordre);
  if(!P.length){$('parcours').innerHTML='';return;}
  const vus=P.filter(s=>SP.vus[s.id]).length;
  $('parcours').innerHTML='<div class="parcours"><div><h2>🎓 Parcours de formation</h2><p>Les supports à voir en priorité, dans l\'ordre. '+vus+' / '+P.length+' vu'+(vus>1?'s':'')+'.</p></div><div class="etapes">'+
    P.slice(0,6).map((s,i)=>'<div class="etape'+(SP.vus[s.id]?' fait':'')+'" data-id="'+esc(s.id)+'"><b>'+(i+1)+(SP.vus[s.id]?' ✓':'')+'</b>'+esc(s.titre.length>46?s.titre.slice(0,44)+'…':s.titre)+'</div>').join('')+
    (P.length>6?'<div class="etape"><b>…</b>+ '+(P.length-6)+' autres</div>':'')+'</div></div>';
  $('parcours').querySelectorAll('.etape[data-id]').forEach(e=>e.onclick=()=>spOuvrir(e.dataset.id));
}
function spVignette(s,i){
  const yt=spYoutubeId(s.url);
  if(yt)return '<div class="v" style="background-image:url(https://i.ytimg.com/vi/'+yt+'/hqdefault.jpg)"><span class="type">Vidéo</span><div class="play">▶</div></div>';
  const fond=SP_DEGRADES[i%SP_DEGRADES.length];
  return '<div class="v" style="background-image:'+fond+'"><span class="type">'+esc(SP_TYPES[s.type])+'</span><span class="big">'+SP_ICONES[s.type]+'</span></div>';
}
function spDessiner(){
  spDessinerThemes();spDessinerTypes();spDessinerParcours();
  const L=spFiltres();
  const T=SP.themes.find(x=>x.id===spTheme);
  $('th-nom').textContent=spTheme==='__vu'?'Déjà vus':T?T.nom:'Toutes les thématiques';
  $('th-nb').textContent=L.length+' support'+(L.length>1?'s':'');
  $('grille').innerHTML=L.map((s,i)=>{
    const t=spThemeDe(s);
    return '<div class="c" data-id="'+esc(s.id)+'" tabindex="0">'+spVignette(s,i)+
      '<div class="b"><h4>'+esc(s.titre)+'</h4>'+(s.description?'<p>'+esc(s.description)+'</p>':'')+
      '<div class="m"><span class="tag">'+esc(t.icone)+' '+esc(t.nom)+'</span>'+(s.a_voir?'<span class="tag">🎓 À voir</span>':'')+(s.famille?'<span class="tag">👪 Familles</span>':'')+(SP.vus[s.id]?'<span class="vu">✓ Vu</span>':'')+'</div></div></div>';
  }).join('')||'<p class="vide">Aucun support ne correspond.</p>';
  $('grille').querySelectorAll('.c').forEach(e=>{
    e.onclick=()=>spOuvrir(e.dataset.id);
    e.onkeydown=ev=>{if(ev.key==='Enter')spOuvrir(e.dataset.id);};
  });
}

/* ---------- Lecteurs intégrés (PDF et Word, sans téléchargement) ---------- */
const SP_PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const SP_MAMMOTH='https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
let spLecteurId=0,spPdfCourant=null,spPdfPret=null;
function spScript(src){
  return new Promise((ok,ko)=>{
    const sc=document.createElement('script');
    sc.src=src;sc.onload=ok;sc.onerror=()=>ko(new Error('bibliothèque de lecture inaccessible'));
    document.head.appendChild(sc);
  });
}
/* Le moteur PDF et son worker sont chargés dans la page (pas de Worker séparé), comme le projet pédagogique. */
function spChargerPdfJs(){
  if(window.pdfjsLib&&window.pdfjsWorker)return Promise.resolve();
  if(!spPdfPret)spPdfPret=spScript(SP_PDFJS+'pdf.min.js').then(()=>spScript(SP_PDFJS+'pdf.worker.min.js')).catch(e=>{spPdfPret=null;throw e;});
  return spPdfPret;
}
function spExtension(s){return String(s.fichier_nom||s.fichier_path||'').split('.').pop().toLowerCase();}
/* Type de lecteur selon le fichier : 'pdf', 'docx' ou '' (téléchargement seul). */
function spLiseuse(s){
  if(s.apercu_path)return 'pdf';
  if(!s.fichier_path)return '';
  const e=spExtension(s);
  if(s.type==='pdf'||e==='pdf')return 'pdf';
  if(e==='docx')return 'docx';
  return '';
}
/* Le HTML produit par mammoth est nettoyé : pas de script, pas de gestionnaire d'événement, liens dans un nouvel onglet. */
function spNettoyerHtml(html){
  const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach(n=>n.remove());
  doc.querySelectorAll('*').forEach(n=>{
    [...n.attributes].forEach(a=>{
      const nom=a.name.toLowerCase(),val=String(a.value).trim().toLowerCase();
      if(nom.startsWith('on')||((nom==='href'||nom==='src'||nom==='xlink:href')&&val.startsWith('javascript:')))n.removeAttribute(a.name);
    });
    if(n.tagName==='A'){n.setAttribute('target','_blank');n.setAttribute('rel','noopener noreferrer');}
  });
  return doc.body.firstChild?doc.body.firstChild.innerHTML:'';
}
function spBarreLecteur(s,gauche,urlOuvrir,urlTelecharger){
  return '<div class="vbarre"><span class="vtitre">'+gauche+'</span>'+
    (urlOuvrir?'<a class="vbtn" href="'+esc(urlOuvrir)+'" target="_blank" rel="noopener noreferrer">Ouvrir</a>':'')+
    '<a class="vbtn" href="'+esc(urlTelecharger)+'">⬇ Télécharger</a></div>';
}
async function spLecteurPdf(zone,s,jeton,urlVue,urlDl){
  await spChargerPdfJs();
  const pdf=await window.pdfjsLib.getDocument({url:urlVue,disableStream:true,isOffscreenCanvasSupported:false}).promise;
  if(jeton!==spLecteurId){pdf.destroy();return;}
  spPdfCourant=pdf;
  const total=pdf.numPages;
  let zoom=1;
  zone.innerHTML='<div class="vbarre"><span class="vtitre" id="v-page">Page 1 / '+total+'</span>'+
    '<button class="vbtn" id="v-moins" aria-label="Zoom arrière">−</button><button class="vbtn" id="v-plus" aria-label="Zoom avant">＋</button>'+
    '<a class="vbtn" href="'+esc(urlVue)+'" target="_blank" rel="noopener noreferrer">Ouvrir</a>'+
    '<a class="vbtn" href="'+esc(urlDl)+'">⬇ Télécharger'+(s.apercu_path?' l\'original':'')+'</a></div><div class="vpages" id="v-pages"></div>';
  const cont=zone.querySelector('#v-pages');
  const p1=await pdf.getPage(1),base=p1.getViewport({scale:1}),ratio=base.height/base.width;
  const pages=[];
  for(let i=0;i<total;i++){
    const d=document.createElement('div');d.className='vp';d.dataset.n=i+1;
    d.style.height='0';d.style.paddingBottom=(ratio*100).toFixed(3)+'%';
    const c=document.createElement('canvas');d.appendChild(c);cont.appendChild(d);
    pages.push({d,c,etat:0});
  }
  async function dessiner(n){
    const P=pages[n-1];
    if(P.etat===1||P.etat===2||jeton!==spLecteurId)return;
    P.etat=1;
    try{
      const page=await pdf.getPage(n);
      const w1=page.getViewport({scale:1}).width;
      /* Safari iOS limite la mémoire des canvas : définition réduite, et nouvel essai plus léger en cas d'échec. */
      const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      const base=P.d.clientWidth*Math.min(window.devicePixelRatio||1,2);
      let ok=false,err=null;
      for(const px of [Math.min(ios?1400:2200,Math.max(500,base)),700]){
        try{
          const vp=page.getViewport({scale:px/w1});
          P.c.width=Math.floor(vp.width);P.c.height=Math.floor(vp.height);
          await page.render({canvasContext:P.c.getContext('2d'),viewport:vp}).promise;
          ok=true;break;
        }catch(e){err=e;}
      }
      if(!ok)throw err||new Error('dessin impossible');
      P.d.querySelector('.vp-err')?.remove();
      P.etat=2;
    }catch(e){
      P.etat=0;console.warn('[supports] page '+n,e);
      if(!P.d.querySelector('.vp-err')){const m=document.createElement('div');m.className='vp-err';m.textContent='Cette page n\'a pas pu s\'afficher. Utilisez « Ouvrir » ou « Télécharger ».';P.d.appendChild(m);}
    }
  }
  const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)dessiner(+e.target.dataset.n);});},{root:cont,rootMargin:'700px 0px'});
  pages.forEach(P=>obs.observe(P.d));
  function majZoom(){
    pages.forEach(P=>{P.d.style.width=(zoom*100)+'%';P.d.style.paddingBottom=(ratio*zoom*100).toFixed(3)+'%';P.etat=0;});
    pages.forEach(P=>{const r=P.d.getBoundingClientRect(),c=cont.getBoundingClientRect();if(r.bottom>c.top-700&&r.top<c.bottom+700)dessiner(+P.d.dataset.n);});
  }
  zone.querySelector('#v-moins').onclick=()=>{zoom=Math.max(.6,+(zoom-.2).toFixed(2));majZoom();};
  zone.querySelector('#v-plus').onclick=()=>{zoom=Math.min(3,+(zoom+.2).toFixed(2));majZoom();};
  cont.addEventListener('scroll',()=>{
    const top=cont.getBoundingClientRect().top+cont.clientHeight/3;
    let n=1;
    for(const P of pages){if(P.d.getBoundingClientRect().top<=top)n=+P.d.dataset.n;else break;}
    const e=zone.querySelector('#v-page');if(e)e.textContent='Page '+n+' / '+total;
  },{passive:true});
  dessiner(1);
}
async function spLecteurWord(zone,s,jeton,urlDl){
  if(!window.mammoth)await spScript(SP_MAMMOTH);
  const r=await fetch(urlDl);
  if(!r.ok)throw new Error('HTTP '+r.status);
  const res=await window.mammoth.convertToHtml({arrayBuffer:await r.arrayBuffer()});
  if(jeton!==spLecteurId)return;
  const html=spNettoyerHtml(res.value||'');
  zone.innerHTML=spBarreLecteur(s,'Aperçu du document Word',null,urlDl)+
    '<div class="vscroll"><div class="vdoc">'+(html||'<p><em>Document vide.</em></p>')+
    '<p class="vnote">Aperçu simplifié : la mise en page d\'origine (colonnes, encadrés) peut différer. Utilisez « Télécharger » pour l\'original.</p></div></div>';
}
/* Ouvre le lecteur intégré ; en cas d'échec, repli sur le téléchargement. */
async function spOuvrirLiseuse(s,type,zone){
  const jeton=++spLecteurId;
  let urlDl='';
  try{
    urlDl=await spUrlFichier(s,true);
    if(type==='pdf')await spLecteurPdf(zone,s,jeton,await spUrlFichier(s,false,s.apercu_path||undefined),urlDl);
    else await spLecteurWord(zone,s,jeton,urlDl);
  }catch(e){
    console.error('[supports] lecteur',e);
    if(jeton!==spLecteurId)return;
    zone.innerHTML='<div class="att">'+SP_ICONES[s.type]+'<br><br>L\'aperçu n\'a pas pu s\'afficher.<br><br>'+(urlDl?'<a class="btn" href="'+esc(urlDl)+'">⬇ Télécharger</a>':'')+'</div>';
  }
}

/* ---------- Fiche d'un support ---------- */
async function spUrlFichier(s,telecharger,chemin){
  const {data,error}=await sb.storage.from(SP_BUCKET).createSignedUrl(chemin||s.fichier_path,3600,telecharger?{download:s.fichier_nom||true}:undefined);
  if(error)throw error;
  return data.signedUrl;
}
function spFermer(){
  spLecteurId++;
  if(spPdfCourant){try{spPdfCourant.destroy();}catch(e){}spPdfCourant=null;}
  $('modal').classList.remove('on');$('fiche').innerHTML='';
}
async function spOuvrir(id){
  const s=SP.supports.find(x=>x.id===id);if(!s)return;
  spLecteurId++;
  if(spPdfCourant){try{spPdfCourant.destroy();}catch(e){}spPdfCourant=null;}
  const t=spThemeDe(s),vu=!!SP.vus[id];
  const yt=spYoutubeId(s.url);
  let lecteur='',liseuse='';
  try{
    if(yt)lecteur='<iframe src="https://www.youtube-nocookie.com/embed/'+yt+'" title="'+esc(s.titre)+'" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    else if(spLiseuse(s)){liseuse=spLiseuse(s);lecteur='<div class="att">Chargement du document…</div>';}
    else if(s.fichier_path&&s.type==='image')lecteur='<img src="'+esc(await spUrlFichier(s))+'" alt="'+esc(s.titre)+'">';
    else if(s.fichier_path)lecteur='<div class="att">'+SP_ICONES[s.type]+'<br><br>Ce document s\'ouvre dans votre application (Word, PowerPoint…) : l\'aperçu intégré n\'est pas disponible pour ce format.<br><br><a class="btn" href="'+esc(await spUrlFichier(s,true))+'">⬇ Télécharger</a></div>';
    else if(s.url)lecteur='<div class="att">🔗<br><br>Ce contenu s\'ouvre sur un site extérieur.<br><br><a class="btn" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Ouvrir le lien</a></div>';
    else lecteur='<div class="att">▶<br><br>Cette vidéo sera disponible prochainement.</div>';
  }catch(e){console.error('[supports]',e);lecteur='<div class="att">Impossible d\'ouvrir ce fichier pour le moment.</div>';}
  $('fiche').className='fiche';
  $('fiche').innerHTML='<div class="lect'+(liseuse?' liseuse':'')+'" id="f-lect">'+lecteur+'</div>'+
    '<div class="inf"><div class="ligne"><span class="tag">'+esc(t.icone)+' '+esc(t.nom)+'</span><button class="x" id="f-x" aria-label="Fermer">✕</button></div>'+
    '<h3>'+esc(s.titre)+'</h3>'+(s.description?'<p style="color:#666;margin:0;font-size:14px;line-height:1.45">'+esc(s.description)+'</p>':'')+
    (s.url&&!yt?'':'')+
    '<button class="vu-btn'+(vu?' on':'')+'" id="f-vu">'+(vu?'✓ Marqué comme vu':'Marquer comme vu')+'</button>'+
    '<div><label for="f-notes">Mes notes (visibles par moi seul·e)</label><textarea class="notes" id="f-notes" placeholder="Ce que j\'en retiens…">'+esc((SP.vus[id]||{}).notes||'')+'</textarea></div>'+
    '<div class="msg" id="f-msg"></div>'+
    (SP.gestion&&s.famille?'<div class="rangee"><button class="btn" id="f-prop">👪 Proposer à des familles</button></div>':'')+
    (SP.direction?'<div class="rangee"><button class="btn btn-sec" id="f-edit">Modifier</button><button class="btn btn-sec" id="f-prio">'+(s.a_voir?'Retirer du parcours':'Ajouter au parcours')+'</button></div>':'')+'</div>';
  $('modal').classList.add('on');
  if(liseuse)spOuvrirLiseuse(s,liseuse,$('f-lect'));
  $('f-x').onclick=spFermer;
  $('f-vu').onclick=()=>spMarquerVu(id,!SP.vus[id]);
  if($('f-prop'))$('f-prop').onclick=()=>spProposer(id);
  $('f-notes').onblur=()=>spEnregistrerNotes(id);
  if(SP.direction){
    $('f-edit').onclick=()=>spSupportForm(id);
    $('f-prio').onclick=async()=>{
      const {error}=await sb.from('supports_pedagogiques').update({a_voir:!s.a_voir}).eq('id',id);
      if(error){$('f-msg').textContent='Erreur : '+error.message;$('f-msg').className='msg ko';return;}
      s.a_voir=!s.a_voir;spDessiner();spOuvrir(id);
    };
  }
}
async function spMarquerVu(id,vu){
  const msg=$('f-msg');
  if(vu){
    const notes=$('f-notes')?$('f-notes').value.trim()||null:null;
    const {error}=await sb.from('supports_vus').upsert({user_id:SP.user.id,support_id:id,vu_le:new Date().toISOString(),notes},{onConflict:'user_id,support_id'});
    if(error){msg.textContent='Erreur : '+error.message;msg.className='msg ko';return;}
    SP.vus[id]={support_id:id,notes};
  }else{
    const {error}=await sb.from('supports_vus').delete().eq('user_id',SP.user.id).eq('support_id',id);
    if(error){msg.textContent='Erreur : '+error.message;msg.className='msg ko';return;}
    delete SP.vus[id];
  }
  spDessiner();
  const b=$('f-vu');if(b){b.className='vu-btn'+(vu?' on':'');b.textContent=vu?'✓ Marqué comme vu':'Marquer comme vu';}
}
async function spEnregistrerNotes(id){
  const notes=$('f-notes').value.trim()||null,msg=$('f-msg');
  if(!SP.vus[id]&&!notes)return;
  if((SP.vus[id]||{}).notes===notes&&SP.vus[id])return;
  const {error}=await sb.from('supports_vus').upsert({user_id:SP.user.id,support_id:id,notes},{onConflict:'user_id,support_id'});
  if(error){msg.textContent='Erreur : '+error.message;msg.className='msg ko';return;}
  SP.vus[id]={support_id:id,notes};msg.textContent='Notes enregistrées.';msg.className='msg';spDessiner();
}

/* ---------- Direction : thématiques ---------- */
function spModaleSimple(html){
  $('fiche').className='fiche simple';
  $('fiche').innerHTML='<div class="inf">'+html+'</div>';
  $('modal').classList.add('on');
}
function spThemeForm(id){
  const t=id?SP.themes.find(x=>x.id===id):null;
  spModaleSimple('<div class="ligne"><h3>'+(t?'Modifier la thématique':'Nouvelle thématique')+'</h3><button class="x" id="t-x" aria-label="Fermer">✕</button></div>'+
    '<div><label for="t-nom">Nom</label><input class="champ" id="t-nom" maxlength="120" value="'+esc(t?t.nom:'')+'"></div>'+
    '<div><label for="t-gr">Groupe (facultatif : regroupe des thématiques dans le menu)</label><input class="champ" id="t-gr" list="t-grl" maxlength="120" value="'+esc(t&&t.groupe?t.groupe:'')+'"><datalist id="t-grl">'+[...new Set(SP.themes.map(x=>x.groupe).filter(Boolean))].map(g=>'<option value="'+esc(g)+'">').join('')+'</datalist></div>'+
    '<div><label for="t-ic">Icône (un emoji)</label><input class="champ" id="t-ic" maxlength="4" value="'+esc(t?t.icone:'📚')+'"></div>'+
    '<div><label for="t-co">Couleur de l\'icône</label><div class="rangee" id="t-co">'+SP_COULEURS.map(c=>'<button type="button" class="chip" data-c="'+c+'" style="background:'+c+';'+((t?t.couleur:SP_COULEURS[0])===c?'outline:2px solid #1d1d1f':'')+'">&nbsp;&nbsp;&nbsp;</button>').join('')+'</div></div>'+
    '<div class="msg" id="t-msg"></div>'+
    '<div class="rangee"><button class="btn" id="t-ok">Enregistrer</button>'+
    (t?'<button class="btn btn-sec" id="t-haut">▲ Monter</button><button class="btn btn-sec" id="t-bas">▼ Descendre</button><button class="btn btn-danger" id="t-sup">Supprimer</button>':'')+'</div>');
  let couleur=t?t.couleur:SP_COULEURS[0];
  $('t-x').onclick=spFermer;
  $('t-co').querySelectorAll('button').forEach(b=>b.onclick=()=>{couleur=b.dataset.c;$('t-co').querySelectorAll('button').forEach(x=>x.style.outline=x===b?'2px solid #1d1d1f':'');});
  $('t-ok').onclick=async()=>{
    const nom=$('t-nom').value.trim(),msg=$('t-msg');
    if(!nom){msg.textContent='Donnez un nom à la thématique.';msg.className='msg ko';return;}
    const row={nom,icone:$('t-ic').value.trim()||'📚',couleur,groupe:$('t-gr').value.trim()||null};
    const r=t?await sb.from('supports_themes').update(row).eq('id',t.id):await sb.from('supports_themes').insert({...row,ordre:(SP.themes.reduce((m,x)=>Math.max(m,x.ordre),0)+1)});
    if(r.error){msg.textContent='Erreur : '+r.error.message;msg.className='msg ko';return;}
    await spCharger();spFermer();spDessiner();
  };
  if(t){
    const bouger=async d=>{
      const i=SP.themes.findIndex(x=>x.id===t.id),j=i+d;
      if(j<0||j>=SP.themes.length)return;
      const a=SP.themes[i],b=SP.themes[j];
      await sb.from('supports_themes').update({ordre:b.ordre}).eq('id',a.id);
      await sb.from('supports_themes').update({ordre:a.ordre}).eq('id',b.id);
      await spCharger();spFermer();spDessiner();
    };
    $('t-haut').onclick=()=>bouger(-1);$('t-bas').onclick=()=>bouger(1);
    $('t-sup').onclick=async()=>{
      const n=SP.supports.filter(s=>s.theme_id===t.id).length;
      if(!confirm('Supprimer la thématique « '+t.nom+' » et ses '+n+' support'+(n>1?'s':'')+' ? Les fichiers copiés seront aussi effacés.'))return;
      const chemins=SP.supports.filter(s=>s.theme_id===t.id).flatMap(s=>[s.fichier_path,s.apercu_path]).filter(Boolean);
      if(chemins.length)await sb.storage.from(SP_BUCKET).remove(chemins);
      const {error}=await sb.from('supports_themes').delete().eq('id',t.id);
      if(error){$('t-msg').textContent='Erreur : '+error.message;$('t-msg').className='msg ko';return;}
      if(spTheme===t.id)spTheme='';
      await spCharger();spFermer();spDessiner();
    };
  }
}


/* ---------- Proposer un soutien à des familles (équipe : direction, coordination, référent·e) ----------
   Une ligne `famille_soutiens` par enfant (sql/famille_soutiens.sql) ; la famille la lit dans l'Espace
   famille. Le mot est obligatoire ; l'origine reste interne. Seuls les supports « proposables aux
   familles » (colonne `famille`, cochée par la direction) peuvent être envoyés. */
const SP_ORIGINES=[['demande','Une demande de la famille'],['observation','Une observation de l\'équipe'],['echange','Un échange avec le parent']];

async function spBandeauEnfant(){
  try{
    const {data}=await sb.from('enfants').select('prenom,nom').eq('id',SP.enfantCible).maybeSingle();
    if(!data)return;
    $('wrap').insertAdjacentHTML('afterbegin','<div style="background:#fff6ee;border:1px solid #fbd3b0;border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:14px">👪 Vous cherchez un soutien pour <b>'+esc((data.prenom||'')+' '+(data.nom||''))+'</b> : ouvrez un support marqué « 👪 Familles », puis <b>Proposer à des familles</b>.</div>');
  }catch(e){console.warn('[supports] bandeau enfant',e);}
}

async function spProposer(id){
  const s=SP.supports.find(x=>x.id===id);if(!s||!s.famille)return;
  let creches=[];
  try{
    const r=await sb.from('creches').select('id,name').order('name');
    creches=(r.data||[]).filter(c=>SP.direction||c.id===SP.moi.creche_id);
  }catch(e){console.warn('[supports] crèches',e);}
  if(!creches.length){alert('Aucune crèche disponible.');return;}
  let cible=null;
  if(SP.enfantCible){
    const r=await sb.from('enfants').select('id,creche_id').eq('id',SP.enfantCible).maybeSingle();
    cible=r.data||null;
  }
  const crecheDef=(cible&&creches.some(c=>c.id===cible.creche_id))?cible.creche_id:(SP.moi.creche_id&&creches.some(c=>c.id===SP.moi.creche_id)?SP.moi.creche_id:creches[0].id);
  spModaleSimple('<div class="ligne"><h3>Proposer un soutien à des familles</h3><button class="x" id="p-x" aria-label="Fermer">✕</button></div>'+
    '<div style="background:#fff6ee;border:1px solid #fbd3b0;border-radius:10px;padding:8px 10px;font-size:13.5px">'+esc(spThemeDe(s).icone)+' <b>'+esc(s.titre)+'</b> — '+esc(SP_TYPES[s.type]||'')+'</div>'+
    '<div><label for="p-cr">Crèche</label><select class="champ" id="p-cr"'+(creches.length===1?' disabled':'')+'>'+creches.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===crecheDef?' selected':'')+'>'+esc(c.name||'')+'</option>').join('')+'</select></div>'+
    '<div><label>Enfant(s)</label><input class="champ" id="p-q" placeholder="Rechercher un prénom…" style="margin-bottom:6px"><div id="p-enf" style="max-height:190px;overflow:auto;border:1px solid #e3e1ef;border-radius:10px;padding:6px 10px;font-size:14px">Chargement…</div></div>'+
    '<div><label>À l\'origine de la proposition <small style="font-weight:400;color:#888">(interne : la famille ne le voit pas)</small></label>'+
    SP_ORIGINES.map((o,i)=>'<label class="check" style="margin:3px 0"><input type="radio" name="p-or" value="'+o[0]+'"'+(i===1?' checked':'')+'> '+esc(o[1])+'</label>').join('')+'</div>'+
    '<div><label for="p-mot">Mot pour les parents (obligatoire)</label><textarea class="champ" id="p-mot" rows="4" maxlength="1500" placeholder="Bonjour, nous avons pensé à cette ressource pour… N\'hésitez pas à nous en parler."></textarea>'+
    '<div style="font-size:12px;color:#888;margin-top:3px">Lu par les parents : écrivez-le comme un message, sans détail interne ni nom d\'un autre enfant.</div></div>'+
    '<label class="check"><input type="checkbox" id="p-push" checked> Prévenir les parents (notification)</label>'+
    '<div class="msg" id="p-msg"></div>'+
    '<div class="rangee"><button class="btn" id="p-ok">Envoyer</button></div>');
  $('p-x').onclick=spFermer;
  let enfants=[],acces=new Set(),deja=new Set();
  const choisis=new Set(cible?[cible.id]:[]);
  const dessiner=()=>{
    const q=$('p-q').value.trim().toLowerCase();
    const L=enfants.filter(e=>!q||((e.prenom||'')+' '+(e.nom||'')).toLowerCase().includes(q));
    $('p-enf').innerHTML=L.map(e=>{
      const ok=acces.has(e.id)&&!deja.has(e.id);
      const note=deja.has(e.id)?' <small style="color:#888">· déjà proposé</small>':!acces.has(e.id)?' <small style="color:#c0392b">· pas d\'accès Espace famille</small>':'';
      return '<label class="check" style="margin:3px 0;'+(ok?'':'opacity:.55')+'"><input type="checkbox" data-e="'+esc(e.id)+'"'+(ok?'':' disabled')+(choisis.has(e.id)&&ok?' checked':'')+'> '+esc((e.prenom||'')+' '+(e.nom||''))+note+'</label>';
    }).join('')||'<span style="color:#888">Aucun enfant.</span>';
    $('p-enf').querySelectorAll('input[data-e]').forEach(c=>c.onchange=()=>{c.checked?choisis.add(c.dataset.e):choisis.delete(c.dataset.e);});
  };
  const charger=async()=>{
    const cr=$('p-cr').value;
    $('p-enf').textContent='Chargement…';
    const [e,a,d]=await Promise.all([
      sb.from('enfants').select('id,prenom,nom,archive_le').eq('creche_id',cr).is('archive_le',null).order('prenom'),
      sb.from('famille_acces').select('enfant_id').eq('creche_id',cr).eq('actif',true),
      sb.from('famille_soutiens').select('enfant_id').eq('creche_id',cr).eq('support_id',id)
    ]);
    enfants=e.data||[];acces=new Set((a.data||[]).map(x=>x.enfant_id));deja=new Set((d.data||[]).map(x=>x.enfant_id));
    [...choisis].forEach(i=>{if(!enfants.some(x=>x.id===i))choisis.delete(i);});
    dessiner();
  };
  $('p-cr').onchange=()=>{choisis.clear();charger();};
  $('p-q').oninput=dessiner;
  try{await charger();}catch(e){console.error('[supports]',e);$('p-enf').textContent='Impossible de charger les enfants.';}
  $('p-ok').onclick=async()=>{
    const msg=$('p-msg'),mot=$('p-mot').value.trim(),cr=$('p-cr').value;
    msg.className='msg';
    if(!choisis.size){msg.textContent='Choisissez au moins un enfant.';msg.className='msg ko';return;}
    if(!mot){msg.textContent='Le mot pour les parents est obligatoire.';msg.className='msg ko';return;}
    $('p-ok').disabled=true;msg.textContent='Envoi…';
    try{
      const origine=(document.querySelector('input[name="p-or"]:checked')||{}).value||'observation';
      const rows=[...choisis].map(eid=>({creche_id:cr,enfant_id:eid,support_id:id,origine,mot,auteur_id:SP.moi.id,auteur_nom:SP.moi.name||''}));
      const r=await sb.from('famille_soutiens').insert(rows);
      if(r.error)throw r.error;
      let info='Proposition envoyée à '+rows.length+' famille'+(rows.length>1?'s':'')+'.';
      if($('p-push').checked){
        try{
          const {data:ac}=await sb.from('famille_acces').select('id').eq('creche_id',cr).eq('actif',true).in('enfant_id',[...choisis]);
          const ids=(ac||[]).map(x=>x.id);
          if(ids.length){
            const {error}=await sb.functions.invoke('notify-push',{body:{acces_ids:ids,title:'Une proposition de la crèche pour votre enfant',body:s.titre,url:'./espace-famille.html',tag:'famille-soutien'}});
            if(error)throw error;
          }
        }catch(e){console.warn('[supports] push',e);info+=' (notification non envoyée)';}
      }
      msg.textContent=info;msg.className='msg';
      setTimeout(spFermer,1400);
    }catch(e){console.error('[supports]',e);msg.textContent='Erreur : '+(e.message||e);msg.className='msg ko';$('p-ok').disabled=false;}
  };
}

/* ---------- Direction : supports ---------- */
function spSupportForm(id){
  const s=id?SP.supports.find(x=>x.id===id):null;
  if(!SP.themes.length){alert('Créez d\'abord une thématique (« ＋ Nouvelle thématique »).');return;}
  spModaleSimple('<div class="ligne"><h3>'+(s?'Modifier le support':'Ajouter un support')+'</h3><button class="x" id="s-x" aria-label="Fermer">✕</button></div>'+
    '<div><label for="s-titre">Titre</label><input class="champ" id="s-titre" maxlength="300" value="'+esc(s?s.titre:'')+'"></div>'+
    '<div><label for="s-desc">Description (facultatif)</label><textarea class="champ" id="s-desc" rows="3">'+esc(s?s.description||'':'')+'</textarea></div>'+
    '<div><label for="s-th">Thématique</label><select class="champ" id="s-th">'+SP.themes.map(t=>'<option value="'+esc(t.id)+'"'+((s?s.theme_id:spTheme)===t.id?' selected':'')+'>'+esc(t.icone+' '+t.nom)+'</option>').join('')+'</select></div>'+
    '<div><label for="s-url">Lien (YouTube, article, podcast…)</label><input class="champ" id="s-url" type="url" placeholder="https://…" value="'+esc(s&&s.url?s.url:'')+'"></div>'+
    '<div><label for="s-file">…ou un fichier (PDF, Word, PowerPoint, image, 50 Mo max)'+(s&&s.fichier_nom?' — actuel : '+esc(s.fichier_nom):'')+'</label><input class="champ" id="s-file" type="file"></div>'+
    '<div><label for="s-apercu">Aperçu PDF d\'un Word / PowerPoint (facultatif : mise en page fidèle dans le lecteur)'+(s&&s.apercu_path?' — un aperçu existe déjà':'')+'</label><input class="champ" id="s-apercu" type="file" accept="application/pdf,.pdf"></div>'+
    '<label class="check"><input type="checkbox" id="s-prio"'+(s&&s.a_voir?' checked':'')+'> À voir en priorité (parcours de formation)</label>'+
    '<label class="check"><input type="checkbox" id="s-fam"'+(s&&s.famille?' checked':'')+'> Proposable aux familles (👪 l\'équipe pourra l\'envoyer à une famille)</label>'+
    '<div style="font-size:12px;color:#888;margin:-4px 0 0 26px">À ne cocher que pour un contenu dont vous pouvez diffuser le lien ou le fichier aux parents (pas de contenu de tiers réservé à la formation).</div>'+
    '<div class="msg" id="s-msg"></div>'+
    '<div class="rangee"><button class="btn" id="s-ok">Enregistrer</button>'+(s?'<button class="btn btn-danger" id="s-sup">Supprimer</button>':'')+'</div>');
  $('s-x').onclick=spFermer;
  $('s-ok').onclick=async()=>{
    const msg=$('s-msg'),titre=$('s-titre').value.trim(),url=$('s-url').value.trim(),f=$('s-file').files[0],ap=$('s-apercu').files[0];
    msg.className='msg';
    if(!titre){msg.textContent='Le titre est obligatoire.';msg.className='msg ko';return;}
    if(url&&!/^https:\/\//i.test(url)){msg.textContent='Le lien doit commencer par https://';msg.className='msg ko';return;}
    if(!url&&!f&&!(s&&s.fichier_path)){msg.textContent='Indiquez un lien ou choisissez un fichier.';msg.className='msg ko';return;}
    if(ap&&ap.size>52428800){msg.textContent='Aperçu trop lourd (50 Mo maximum).';msg.className='msg ko';return;}
    if(f&&f.size>52428800){msg.textContent='Fichier trop lourd (50 Mo maximum). Pour une vidéo, déposez-la sur YouTube et collez le lien.';msg.className='msg ko';return;}
    $('s-ok').disabled=true;msg.textContent='Enregistrement…';
    try{
      const row={titre,description:$('s-desc').value.trim()||null,theme_id:$('s-th').value,a_voir:$('s-prio').checked,famille:$('s-fam').checked};
      if(f){
        const chemin=crypto.randomUUID()+'/'+spNomSur(f.name);
        const up=await sb.storage.from(SP_BUCKET).upload(chemin,f,{contentType:f.type||'application/octet-stream'});
        if(up.error)throw up.error;
        if(s)await sb.storage.from(SP_BUCKET).remove([s.fichier_path,s.apercu_path].filter(Boolean));
        Object.assign(row,{fichier_path:chemin,fichier_nom:f.name,mime:f.type||null,taille:f.size,url:null,type:spTypeDepuisFichier(f),apercu_path:null});
      }else if(url){
        if(s)await sb.storage.from(SP_BUCKET).remove([s.fichier_path,s.apercu_path].filter(Boolean));
        Object.assign(row,{url,fichier_path:null,fichier_nom:null,mime:null,taille:null,type:spYoutubeId(url)?'video':'lien',apercu_path:null});
      }
      if(ap){
        const cheminAp=crypto.randomUUID()+'/'+spNomSur(ap.name);
        const upAp=await sb.storage.from(SP_BUCKET).upload(cheminAp,ap,{contentType:'application/pdf'});
        if(upAp.error)throw upAp.error;
        if(s&&s.apercu_path&&row.apercu_path!==null)await sb.storage.from(SP_BUCKET).remove([s.apercu_path]);
        row.apercu_path=cheminAp;
      }
      const r=s?await sb.from('supports_pedagogiques').update(row).eq('id',s.id):await sb.from('supports_pedagogiques').insert({...row,ordre:SP.supports.reduce((m,x)=>Math.max(m,x.ordre),0)+1,date_source:null});
      if(r.error)throw r.error;
      await spCharger();spFermer();spDessiner();
    }catch(e){console.error('[supports]',e);msg.textContent='Erreur : '+(e.message||e);msg.className='msg ko';$('s-ok').disabled=false;}
  };
  if(s)$('s-sup').onclick=async()=>{
    if(!confirm('Supprimer « '+s.titre+' » ?'))return;
    const aSupprimer=[s.fichier_path,s.apercu_path].filter(Boolean);
    if(aSupprimer.length)await sb.storage.from(SP_BUCKET).remove(aSupprimer);
    const {error}=await sb.from('supports_pedagogiques').delete().eq('id',s.id);
    if(error){$('s-msg').textContent='Erreur : '+error.message;$('s-msg').className='msg ko';return;}
    await spCharger();spFermer();spDessiner();
  };
}

/* ---------- Direction : import unique depuis le Padlet ---------- */
async function spImportForm(){
  const man={themes:[],supports:[]};
  try{
    for(const f of SP_MANIFESTES){
      const r=await fetch(f,{cache:'no-store'});
      if(!r.ok)throw new Error(f+' : HTTP '+r.status);
      const j=await r.json();
      j.themes.forEach(t=>{if(!man.themes.some(x=>x.nom===t.nom))man.themes.push(t);});
      man.supports.push(...j.supports);
    }
  }catch(e){alert('Fichier d\'import introuvable : '+e.message);return;}
  const avecFichier=man.supports.filter(x=>x.fichier).length;
  spModaleSimple('<div class="ligne"><h3>Importer les Padlets</h3><button class="x" id="i-x" aria-label="Fermer">✕</button></div>'+
    '<p style="margin:0;font-size:14px;line-height:1.5">Crée <strong>'+man.themes.length+' thématiques</strong> et <strong>'+man.supports.length+' supports</strong> ('+avecFichier+' fichiers à copier, le reste en liens). Ce qui existe déjà (même thématique et même titre) est ignoré : vous pouvez relancer sans risque.</p>'+
    '<div><label for="i-files">Fichiers des Padlets (sélectionnez-les tous : PDF, Word, PowerPoint, images ; vous pouvez en choisir plusieurs lots)</label><input class="champ" id="i-files" type="file" multiple></div>'+
    '<div class="msg" id="i-msg"></div><div class="rangee"><button class="btn" id="i-ok">Lancer l\'import</button></div>');
  $('i-x').onclick=spFermer;
  $('i-ok').onclick=async()=>{
    const msg=$('i-msg');$('i-ok').disabled=true;
    const fichiers={};[...$('i-files').files].forEach(f=>{fichiers[f.name]=f;});
    const manquants=[];let crees=0,ignores=0;
    try{
      await spCharger();
      const idTh={};
      for(const t of man.themes){
        let ex=SP.themes.find(x=>x.nom===t.nom);
        if(!ex){
          const r=await sb.from('supports_themes').insert({nom:t.nom,icone:t.icone,couleur:t.couleur,ordre:t.ordre,groupe:t.groupe||null}).select().single();
          if(r.error)throw r.error;ex=r.data;
        }else if(t.groupe&&!ex.groupe){
          const r=await sb.from('supports_themes').update({groupe:t.groupe}).eq('id',ex.id);
          if(r.error)throw r.error;
        }
        idTh[t.nom]=ex.id;
      }
      let n=0;
      for(const it of man.supports){
        n++;msg.textContent='Import '+n+' / '+man.supports.length+'…';
        const theme_id=idTh[it.theme];
        if(SP.supports.some(s=>s.theme_id===theme_id&&s.titre===it.titre)){ignores++;continue;}
        const row={theme_id,titre:it.titre,description:it.description||null,type:it.type,url:it.url||null,date_source:it.date||null,ordre:it.ordre,a_voir:false};
        if(it.fichier){
          const f=fichiers[it.fichier];
          if(!f){manquants.push(it.fichier);continue;}
          const chemin=crypto.randomUUID()+'/'+spNomSur(f.name);
          const up=await sb.storage.from(SP_BUCKET).upload(chemin,f,{contentType:f.type||'application/octet-stream'});
          if(up.error)throw up.error;
          Object.assign(row,{fichier_path:chemin,fichier_nom:f.name,mime:f.type||null,taille:f.size});
        }
        const r=await sb.from('supports_pedagogiques').insert(row);
        if(r.error){if(row.fichier_path)await sb.storage.from(SP_BUCKET).remove([row.fichier_path]);throw r.error;}
        crees++;
      }
      await spCharger();spDessiner();
      msg.className='msg';
      msg.innerHTML='Terminé : <strong>'+crees+'</strong> support'+(crees>1?'s':'')+' créé'+(crees>1?'s':'')+', '+ignores+' déjà présent'+(ignores>1?'s':'')+'.'+
        (manquants.length?'<br>Fichiers non fournis (à relancer avec ces fichiers) : '+manquants.map(esc).join(', '):'');
    }catch(e){console.error('[supports]',e);msg.textContent='Erreur : '+(e.message||e)+' — l\'import peut être relancé.';msg.className='msg ko';}
    $('i-ok').disabled=false;
  };
}

/* ---------- Direction : import des aperçus PDF (Word / PowerPoint) ---------- */
function spImportApercusForm(){
  const avecFichier=SP.supports.filter(s=>s.fichier_path&&spLiseuse(Object.assign({},s,{apercu_path:null}))!=='pdf');
  const sans=avecFichier.filter(s=>!s.apercu_path).length;
  spModaleSimple('<div class="ligne"><h3>Importer les aperçus PDF</h3><button class="x" id="a-x" aria-label="Fermer">✕</button></div>'+
    '<p style="margin:0;font-size:14px;line-height:1.5">Chaque PDF est rattaché au support dont le <strong>fichier d\'origine porte le même nom</strong> (par exemple <code>Doudous_et_t_tines.docx.pdf</code> pour <code>Doudous_et_t_tines.docx</code>). Il s\'affiche alors dans le lecteur avec la mise en page d\'origine ; l\'original reste téléchargeable. '+sans+' document'+(sans>1?'s':'')+' Word / PowerPoint sans aperçu PDF.</p>'+
    '<div><label for="a-files">Aperçus PDF (sélectionnez-les tous)</label><input class="champ" id="a-files" type="file" accept="application/pdf,.pdf" multiple></div>'+
    '<div class="msg" id="a-msg"></div><div class="rangee"><button class="btn" id="a-ok">Lancer l\'import</button></div>');
  $('a-x').onclick=spFermer;
  $('a-ok').onclick=async()=>{
    const msg=$('a-msg');$('a-ok').disabled=true;
    const fichiers=[...$('a-files').files];
    if(!fichiers.length){msg.textContent='Sélectionnez au moins un PDF.';msg.className='msg ko';$('a-ok').disabled=false;return;}
    const sansMatch=[];let ok=0,n=0;
    try{
      for(const f of fichiers){
        n++;msg.className='msg';msg.textContent='Import '+n+' / '+fichiers.length+'…';
        const nom=f.name.replace(/\.pdf$/i,'');
        const cible=SP.supports.find(x=>x.fichier_nom&&(x.fichier_nom===nom||x.fichier_nom.replace(/\.[^.]+$/,'')===nom));
        if(!cible){sansMatch.push(f.name);continue;}
        const chemin=crypto.randomUUID()+'/'+spNomSur(f.name);
        const up=await sb.storage.from(SP_BUCKET).upload(chemin,f,{contentType:'application/pdf'});
        if(up.error)throw up.error;
        const r=await sb.from('supports_pedagogiques').update({apercu_path:chemin}).eq('id',cible.id);
        if(r.error){await sb.storage.from(SP_BUCKET).remove([chemin]);throw r.error;}
        if(cible.apercu_path)await sb.storage.from(SP_BUCKET).remove([cible.apercu_path]);
        cible.apercu_path=chemin;ok++;
      }
      await spCharger();spDessiner();
      msg.innerHTML='Terminé : <strong>'+ok+'</strong> aperçu'+(ok>1?'s':'')+' rattaché'+(ok>1?'s':'')+'.'+(sansMatch.length?'<br>Sans support correspondant : '+sansMatch.map(esc).join(', '):'');
    }catch(e){console.error('[supports]',e);msg.textContent='Erreur : '+(e.message||e)+' — l\'import peut être relancé.';msg.className='msg ko';}
    $('a-ok').disabled=false;
  };
}

/* ---------- Démarrage ---------- */
window.addEventListener('DOMContentLoaded',async function(){
  $('modal').onclick=e=>{if(e.target.id==='modal')spFermer();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')spFermer();});
  $('q').oninput=e=>{spQ=e.target.value;if($('wrap').hidden)return;spDessiner();};
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session){spEtat('<strong>Connexion requise</strong><br>Connectez-vous à l\'application pour accéder aux supports pédagogiques.<br><br><a href="demandes.html">Se connecter</a>');return;}
    SP.user=session.user;
    const {data:ref}=await sb.from('referents').select('id,name,role,creche_id').eq('user_id',SP.user.id).maybeSingle();
    SP.direction=!!ref&&ref.role==='direction';
    SP.moi=ref||null;
    SP.gestion=!!ref&&(ref.role==='direction'||ref.role==='referent');   // propose aux familles
    SP.enfantCible=new URLSearchParams(location.search).get('enfant');
    await spCharger();
    $('actions-dir').hidden=!SP.direction;
    $('btn-ajout').onclick=()=>spSupportForm(null);
    $('btn-import').onclick=spImportForm;
    $('btn-apercus').onclick=spImportApercusForm;
    spEtat('');$('wrap').hidden=false;
    if(SP.gestion&&SP.enfantCible)spBandeauEnfant();
    if(!SP.themes.length&&!SP.direction)spEtat('Aucun support disponible pour le moment.');
    spDessiner();
  }catch(e){
    console.error('[supports]',e);
    spEtat('<strong>Impossible de charger les supports.</strong><br>Si c\'est la première utilisation, la direction doit appliquer <code>sql/supports_pedagogiques.sql</code> sur Supabase.');
  }
});
