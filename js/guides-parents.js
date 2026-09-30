/* Onglet « Guides parents » de documents.html — tous les noms sont préfixés gp_ pour ne rien
   heurter dans cette page (elle fournit sb, ME, PROF, esc, toast). */
/* ---------- gp_GUIDES PARENTS : éditeur à blocs ----------
   Un guide = ligne guides_parents + blocs ordonnés (guides_parents_blocs.contenu
   en JSON), cf. sql/guides_parents.sql. Lecture publique : guide.html?id=… */
const gp_BUCKET='guides-parents';
let gp_GUIDES=[],gp_G=null,gp_B=[],gp_DEL=[],gp_DIRTY=false;

const gp_VIDE={
  section:()=>({titre:''}),
  qr:()=>({question:'',auteur:'',accroche:'',texte:'',points:[],reflexe_titre:'Notre petit réflexe',reflexe:'',images:[]}),
  texte:()=>({titre:'',texte:''}),
  citation:()=>({texte:''}),
  image:()=>({url:'',alt:'',legende:''})
};
const gp_TAGS={section:'Titre de section',qr:'Question / réponse',texte:'Texte',citation:'Citation',image:'Image'};

function gp_uuid(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});}
function gp_markDirty(){gp_DIRTY=true;const s=document.getElementById('saveSt');if(s){s.textContent='Modifications non enregistrées';s.className='st dirty';}}
function gp_markSaved(){gp_DIRTY=false;const s=document.getElementById('saveSt');if(s){s.textContent='Enregistré';s.className='st';}}
window.addEventListener('beforeunload',e=>{if(gp_DIRTY){e.preventDefault();e.returnValue='';}});

async function gp_init(){await gp_loadGuides();}

/* ----- liste ----- */
async function gp_loadGuides(){
  const{data,error}=await sb.from('guides_parents').select('id,titre,publie,updated_at').order('updated_at',{ascending:false});
  if(error){toast('Erreur de chargement : '+error.message,true);return;}
  gp_GUIDES=data||[];
  const box=document.getElementById('guidesList');
  document.getElementById('guidesEmpty').style.display=gp_GUIDES.length?'none':'block';
  box.innerHTML=gp_GUIDES.map(g=>'<div class="gl"><div class="gi"><div class="gt">'+esc(g.titre||'Sans titre')+'</div>'
    +'<div class="gm">Modifié le '+new Date(g.updated_at).toLocaleDateString('fr-FR')+'</div></div>'
    +'<span class="badge '+(g.publie?'on':'off')+'">'+(g.publie?'Publié':'Brouillon')+'</span>'
    +'<div class="acts"><button class="btn btn-s btn-sm" onclick="gp_openGuide(\''+g.id+'\')"><i class="ti ti-pencil"></i> Modifier</button>'
    +'<button class="btn btn-g btn-sm" onclick="gp_dupGuide(\''+g.id+'\')" title="Dupliquer"><i class="ti ti-copy"></i></button>'
    +'<button class="btn btn-g btn-sm" style="color:var(--red)" onclick="gp_delGuide(\''+g.id+'\')" title="Supprimer"><i class="ti ti-trash"></i></button></div></div>').join('');
}
async function gp_newGuide(){
  const{data,error}=await sb.from('guides_parents').insert({titre:'Nouveau guide',created_by:ME.id}).select().single();
  if(error){toast('Création impossible : '+error.message,true);return;}
  // Trame de départ : une section et un bloc question/réponse à remplir.
  const blocs=[{guide_id:data.id,ordre:0,type:'section',contenu:gp_VIDE.section()},{guide_id:data.id,ordre:1,type:'qr',contenu:gp_VIDE.qr()}];
  await sb.from('guides_parents_blocs').insert(blocs);
  await gp_openGuide(data.id);
}
async function gp_openGuide(id){
  const{data:g,error}=await sb.from('guides_parents').select('*').eq('id',id).maybeSingle();
  if(error||!g){toast('Guide introuvable',true);return;}
  const{data:bl,error:e2}=await sb.from('guides_parents_blocs').select('*').eq('guide_id',id).order('ordre');
  if(e2){toast('Erreur : '+e2.message,true);return;}
  gp_G=g;gp_DEL=[];
  gp_B=(bl||[]).map(b=>({id:b.id,type:b.type,contenu:Object.assign(gp_VIDE[b.type](),b.contenu||{})}));
  document.getElementById('gTitre').value=gp_G.titre||'';
  document.getElementById('gStructure').value=gp_G.structure||'';
  document.getElementById('gSous').value=gp_G.sous_titre||'';
  document.getElementById('gAccueil').value=gp_G.accueil||'';
  document.getElementById('gIntro').value=gp_G.intro||'';
  document.getElementById('gConclusion').value=gp_G.conclusion||'';
  document.getElementById('gSignature').value=gp_G.signature||'';
  document.getElementById('gpListView').style.display='none';
  document.getElementById('gpEditView').style.display='block';
  gp_renderPub();gp_renderBlocs();gp_markSaved();window.scrollTo(0,0);
}
async function gp_backToList(){
  if(gp_DIRTY&&!confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?'))return;
  gp_DIRTY=false;gp_G=null;
  document.getElementById('gpEditView').style.display='none';
  document.getElementById('gpListView').style.display='block';
  await gp_loadGuides();
}
async function gp_delGuide(id){
  const g=gp_GUIDES.find(x=>x.id===id);
  if(!confirm('Supprimer définitivement « '+(g&&g.titre||'ce guide')+' » et tout son contenu ?'))return;
  const{error}=await sb.from('guides_parents').delete().eq('id',id);
  if(error){toast('Suppression impossible : '+error.message,true);return;}
  toast('Guide supprimé');gp_loadGuides();
}
async function gp_dupGuide(id){
  const{data:g}=await sb.from('guides_parents').select('*').eq('id',id).maybeSingle();
  if(!g)return;
  const{data:bl}=await sb.from('guides_parents_blocs').select('*').eq('guide_id',id).order('ordre');
  const c={...g};['id','org_id','created_at','updated_at'].forEach(k=>delete c[k]);
  c.titre=(g.titre||'Guide')+' (copie)';c.publie=false;c.created_by=ME.id;
  const{data:n,error}=await sb.from('guides_parents').insert(c).select().single();
  if(error){toast('Duplication impossible : '+error.message,true);return;}
  if(bl&&bl.length){
    const{error:e2}=await sb.from('guides_parents_blocs').insert(bl.map((b,i)=>({guide_id:n.id,ordre:i,type:b.type,contenu:b.contenu})));
    if(e2){toast('Blocs non copiés : '+e2.message,true);}
  }
  toast('Guide dupliqué');gp_loadGuides();
}

/* ----- édition ----- */
function gp_setG(k,v){gp_G[k]=v;gp_markDirty();}
function gp_renderPub(){
  const b=document.getElementById('pubBtn');
  b.innerHTML=gp_G.publie?'<i class="ti ti-eye-off"></i> Dépublier':'<i class="ti ti-world-upload"></i> Publier';
}
function gp_togglePublie(){gp_G.publie=!gp_G.publie;gp_renderPub();gp_markDirty();toast(gp_G.publie?'Sera publié à l\'enregistrement':'Repassera en brouillon à l\'enregistrement');}
function gp_guideUrl(){
  const u=location.href.split('?')[0].split('#')[0].replace(/[^/]*$/,'guide.html');
  return u+'?id='+gp_G.id;
}
function gp_copyLink(){
  const url=gp_guideUrl();
  const warn=gp_G.publie?'':'\n\n⚠ Ce guide est en brouillon : le lien ne fonctionnera qu\'une fois publié et enregistré.';
  navigator.clipboard.writeText(url).then(()=>toast('Lien copié'+(gp_G.publie?'':' (guide non publié)')),()=>prompt('Copiez ce lien :',url));
  if(!gp_G.publie)alert('Lien : '+url+warn);
}
function gp_addBloc(type){
  gp_B.push({id:gp_uuid(),type,contenu:gp_VIDE[type]()});
  gp_markDirty();gp_renderBlocs();
  setTimeout(()=>{const els=document.querySelectorAll('.blk');if(els.length)els[els.length-1].scrollIntoView({behavior:'smooth',block:'center'});},50);
}
function gp_delBloc(i){
  if(!confirm('Supprimer ce bloc ?'))return;
  gp_DEL.push(gp_B[i].id);gp_B.splice(i,1);gp_markDirty();gp_renderBlocs();
}
function gp_moveBloc(i,d){
  const j=i+d;if(j<0||j>=gp_B.length)return;
  [gp_B[i],gp_B[j]]=[gp_B[j],gp_B[i]];gp_markDirty();gp_renderBlocs();
}
function gp_setC(i,k,v){gp_B[i].contenu[k]=v;gp_markDirty();}
function gp_pts(i){return gp_B[i].contenu.points;}
function gp_addPoint(i){gp_pts(i).push('');gp_markDirty();gp_renderBlocs();}
function gp_setPoint(i,j,v){gp_pts(i)[j]=v;gp_markDirty();}
function gp_delPoint(i,j){gp_pts(i).splice(j,1);gp_markDirty();gp_renderBlocs();}
function gp_addImg(i){gp_B[i].contenu.images.push({url:'',alt:'',legende:''});gp_markDirty();gp_renderBlocs();}
function gp_setImg(i,j,k,v){gp_B[i].contenu.images[j][k]=v;gp_markDirty();}
function gp_delImg(i,j){gp_B[i].contenu.images.splice(j,1);gp_markDirty();gp_renderBlocs();}

async function gp_uploadImg(i,j,input){
  const f=input.files&&input.files[0];if(!f)return;
  if(!/^image\//.test(f.type)){toast('Choisissez un fichier image.',true);return;}
  if(f.size>8*1024*1024){toast('Image trop lourde (8 Mo maximum).',true);return;}
  const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'jpg';
  const path=gp_G.id+'/'+gp_uuid()+'.'+ext;
  toast('Envoi de l\'image…');
  const{error}=await sb.storage.from(gp_BUCKET).upload(path,f,{contentType:f.type,upsert:false});
  if(error){toast('Envoi impossible : '+error.message,true);return;}
  const url=sb.storage.from(gp_BUCKET).getPublicUrl(path).data.publicUrl;
  const c=gp_B[i].contenu;
  const target=j==null?c:c.images[j];
  target.url=url;
  if(!target.alt)target.alt=f.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
  gp_markDirty();gp_renderBlocs();toast('Image ajoutée');
}

function gp_ta(v,fn,rows,ph){return '<textarea rows="'+(rows||3)+'" placeholder="'+esc(ph||'')+'" oninput="'+fn+'">'+esc(v)+'</textarea>';}
function gp_inp(v,fn,ph){return '<input value="'+esc(v)+'" placeholder="'+esc(ph||'')+'" oninput="'+fn+'">';}
function gp_lbl(t){return '<div class="subl">'+t+'</div>';}
function gp_imgEditor(i,j,im){
  const id='f_'+i+'_'+(j==null?'x':j);
  const S=(k)=>j==null?"gp_setC("+i+",'"+k+"',this.value)":"gp_setImg("+i+","+j+",'"+k+"',this.value)";
  return '<div class="imgrow">'
    +(im.url?'<img src="'+esc(im.url)+'" alt="">':'<div style="width:78px;height:78px;border-radius:10px;background:#EEECFA;display:flex;align-items:center;justify-content:center;color:var(--violet);font-size:26px;flex-shrink:0"><i class="ti ti-photo"></i></div>')
    +'<div class="ff"><div style="display:flex;gap:6px;flex-wrap:wrap">'
    +'<input type="file" accept="image/*" id="'+id+'" style="display:none" onchange="gp_uploadImg('+i+','+(j==null?'null':j)+',this)">'
    +'<button type="button" class="mini" onclick="document.getElementById(\''+id+'\').click()"><i class="ti ti-upload"></i> '+(im.url?'Remplacer':'Choisir une image')+'</button>'
    +(j!=null?'<button type="button" class="mini danger" onclick="gp_delImg('+i+','+j+')">Retirer</button>':'')
    +'</div>'
    +gp_inp(im.alt,S('alt'),'Description (accessibilité)')
    +gp_inp(im.legende,S('legende'),'Légende (facultative)')
    +'</div></div>';
}
function gp_editorFor(b,i){
  const c=b.contenu;
  switch(b.type){
    case 'section':
      return gp_lbl('Titre du thème (ex. Jouer, explorer et grandir)')+gp_inp(c.titre,"gp_setC("+i+",'titre',this.value)",'Le thème de cette partie');
    case 'qr':
      return gp_lbl('La question des parents')+gp_ta(c.question,"gp_setC("+i+",'question',this.value)",2,'Qu’est-ce que la libre circulation ?')
        +'<div class="g2"><div>'+gp_lbl('Prénom de la personne qui répond')+gp_inp(c.auteur,"gp_setC("+i+",'auteur',this.value)",'Valérie, accompagnante éducative petite enfance')+'</div>'
        +'<div>'+gp_lbl('Phrase d\'accroche (en orange)')+gp_inp(c.accroche,"gp_setC("+i+",'accroche',this.value)",'Ce n’est pas une lubie !')+'</div></div>'
        +gp_lbl('La réponse (un retour à la ligne = un nouveau paragraphe ; **gras** avec des doubles étoiles)')
        +gp_ta(c.texte,"gp_setC("+i+",'texte',this.value)",6,'Dans les espaces autorisés, les enfants peuvent circuler librement…')
        +gp_lbl('Points clés (liste à puces, facultatif)')
        +c.points.map((p,j)=>'<div style="display:flex;gap:6px;margin-bottom:6px">'+gp_inp(p,"gp_setPoint("+i+","+j+",this.value)",'Un point')+'<button type="button" class="mini danger" onclick="gp_delPoint('+i+','+j+')">×</button></div>').join('')
        +'<button type="button" class="mini" onclick="gp_addPoint('+i+')">+ Point</button>'
        +gp_lbl('Encadré vert (facultatif)')
        +'<div class="g2">'+gp_inp(c.reflexe_titre,"gp_setC("+i+",'reflexe_titre',this.value)",'Notre petit réflexe')+'</div>'
        +'<div style="margin-top:6px">'+gp_ta(c.reflexe,"gp_setC("+i+",'reflexe',this.value)",2,'Exemple concret, phrase type, conseil pratique…')+'</div>'
        +gp_lbl('Images (facultatif)')
        +c.images.map((im,j)=>gp_imgEditor(i,j,im)).join('')
        +'<button type="button" class="mini" onclick="gp_addImg('+i+')"><i class="ti ti-photo-plus"></i> Ajouter une image</button>';
    case 'texte':
      return gp_lbl('Titre (facultatif)')+gp_inp(c.titre,"gp_setC("+i+",'titre',this.value)",'')
        +gp_lbl('Texte')+gp_ta(c.texte,"gp_setC("+i+",'texte',this.value)",5,'');
    case 'citation':
      return gp_lbl('La phrase mise en avant')+gp_ta(c.texte,"gp_setC("+i+",'texte',this.value)",2,'Accompagner l’enfant pour qu’il puisse progressivement faire lui-même.');
    case 'image':
      return gp_imgEditor(i,null,c);
  }
  return '';
}
function gp_renderBlocs(){
  document.getElementById('blocsBox').innerHTML=gp_B.map((b,i)=>
    '<div class="blk"><div class="blk-h"><span class="tag">'+gp_TAGS[b.type]+'</span><span class="sp"></span>'
    +'<button type="button" class="mini" onclick="gp_moveBloc('+i+',-1)" '+(i===0?'disabled':'')+' title="Monter"><i class="ti ti-arrow-up"></i></button>'
    +'<button type="button" class="mini" onclick="gp_moveBloc('+i+',1)" '+(i===gp_B.length-1?'disabled':'')+' title="Descendre"><i class="ti ti-arrow-down"></i></button>'
    +'<button type="button" class="mini danger" onclick="gp_delBloc('+i+')" title="Supprimer"><i class="ti ti-trash"></i></button></div>'
    +gp_editorFor(b,i)+'</div>').join('')
    ||'<div class="empty">Ajoutez votre premier bloc ci-dessous.</div>';
}

async function gp_saveGuide(){
  if(!gp_G)return;
  if(!(gp_G.titre||'').trim()){toast('Donnez un titre au guide.',true);return;}
  const{error}=await sb.from('guides_parents').update({
    titre:gp_G.titre.trim(),sous_titre:gp_G.sous_titre||null,structure:gp_G.structure||null,accueil:gp_G.accueil||null,
    intro:gp_G.intro||null,conclusion:gp_G.conclusion||null,signature:gp_G.signature||null,publie:!!gp_G.publie
  }).eq('id',gp_G.id);
  if(error){toast('Enregistrement impossible : '+error.message,true);return;}
  if(gp_B.length){
    const{error:e2}=await sb.from('guides_parents_blocs').upsert(gp_B.map((b,i)=>({id:b.id,guide_id:gp_G.id,ordre:i,type:b.type,contenu:b.contenu})),{onConflict:'id'});
    if(e2){toast('Blocs non enregistrés : '+e2.message,true);return;}
  }
  if(gp_DEL.length){
    const{error:e3}=await sb.from('guides_parents_blocs').delete().in('id',gp_DEL);
    if(e3){toast('Suppression de blocs impossible : '+e3.message,true);return;}
    gp_DEL=[];
  }
  gp_markSaved();toast('Guide enregistré');
}

function gp_openPreview(){
  document.getElementById('prevDoc').innerHTML=KKGuide.render(gp_G,gp_B);
  document.getElementById('prevWrap').classList.add('on');
}
function gp_closePreview(){document.getElementById('prevWrap').classList.remove('on');}
