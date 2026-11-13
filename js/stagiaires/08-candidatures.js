/* ===== LE MUR DES CANDIDATURES (le « Padlet » dans l'application) ============
   Même principe que le Padlet « Recrutement des stagiaires » : un tableau en
   colonnes. « Demandes reçues » à gauche, puis UNE COLONNE PAR CRÈCHE. La
   direction publie une carte par candidature reçue par e-mail (ou elle arrive
   du lien de candidature) avec le CV et la lettre de motivation, visibles dans
   la carte. Un·e référent·e SE POSITIONNE en déplaçant la carte dans la colonne
   de sa crèche ; la direction peut la déplacer n'importe où. Chacun commente.
   « Créer la fiche » transforme la carte en fiche stagiaire de la crèche.
   Tables, droits, déplacement : sql/stagiaires_candidatures.sql et
   sql/stagiaires_candidatures_mur.sql. Fichiers dans le bucket privé
   `stagiaires-vivier` (liens signés de courte durée, jamais d'URL stockée). */
const STGC_BUCKET='stagiaires-vivier';
const STGC_SIGN_TTL=600;
let stgcListe=[], stgcComms=[], stgcCreches=[], stgcOk=true, stgcCommsOk=true;
let stgcUrls={}, stgcUrlsLe=0, stgcThumbs={}, stgcOuverts={}, stgcTexteOuvert={}, stgcVoirClassees=false;

function stgcMaCreche(){return currentProfile&&currentProfile.creche_id?String(currentProfile.creche_id):'';}
function stgcCrecheNom(id){
  const c=stgcCreches.find(x=>String(x.id)===String(id));
  return c?c.name:'Crèche';
}
function stgcFr(d){return d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR'):'';}
function stgcIlYa(d){
  const m=(Date.now()-new Date(d).getTime())/60000;
  if(m<2)return 'à l\'instant';
  if(m<60)return 'il y a '+Math.round(m)+' min';
  if(m<1440)return 'il y a '+Math.round(m/60)+' h';
  const j=Math.round(m/1440);
  if(j<45)return 'il y a '+j+' jour'+(j>1?'s':'');
  return 'il y a '+Math.round(j/30)+' mois';
}
function stgcCommsDe(id){return stgcComms.filter(c=>String(c.candidature_id)===String(id));}

async function stgcCharger(){
  const r1=await sb.from('stagiaires_candidatures').select('*').order('created_at',{ascending:false});
  const r2=await sb.from('stagiaires_candidatures_commentaires').select('*').order('created_at',{ascending:true});
  const r3=await sb.from('creches').select('id,name').order('name');
  stgcOk=!r1.error;stgcCommsOk=!r2.error;
  stgcListe=r1.data||[];stgcComms=r2.data||[];
  const vus=(r3.data&&r3.data.length)?r3.data:cacheCreches;
  stgcCreches=vus.slice();
  stgcListe.forEach(c=>{if(c.attribuee_creche&&!stgcCreches.some(x=>String(x.id)===String(c.attribuee_creche)))stgcCreches.push({id:c.attribuee_creche,name:'Crèche'});});
  stgcBadge();
  stgcRender();
}

/* Pastille sur l'onglet : les demandes encore dans la colonne « Demandes reçues ». */
function stgcBadge(){
  const b=document.getElementById('stg-badge-cand');
  if(!b)return;
  const n=stgcListe.filter(c=>c.statut==='ouverte').length;
  b.textContent=n;b.style.display=n?'inline-block':'none';
}

// ── Liens signés et miniatures ────────────────────────────────────────────
async function stgcSigner(){
  if(Date.now()-stgcUrlsLe<(STGC_SIGN_TTL-120)*1000)return;
  const chemins=[];
  stgcListe.forEach(c=>{if(c.cv_path)chemins.push(c.cv_path);if(c.lettre_path)chemins.push(c.lettre_path);});
  if(!chemins.length){stgcUrlsLe=Date.now();return;}
  const {data,error}=await sb.storage.from(STGC_BUCKET).createSignedUrls(chemins,STGC_SIGN_TTL);
  if(error||!data)return;
  data.forEach(d=>{if(d.signedUrl)stgcUrls[d.path]=d.signedUrl;});
  stgcUrlsLe=Date.now();
}

/* Première page d'un PDF (ou l'image) dessinée en miniature, mise en cache. */
async function stgcMiniature(path,mime,el){
  const poser=src=>{document.querySelectorAll('[data-stgc-thumb="'+path+'"]').forEach(n=>{n.innerHTML='<img src="'+src+'" style="width:100%;display:block">';});};
  if(stgcThumbs[path])return poser(stgcThumbs[path]);
  const url=stgcUrls[path];
  if(!url)return;
  try{
    if(mime&&mime.indexOf('image/')===0){stgcThumbs[path]=url;return poser(url);}
    if(mime!=='application/pdf'||typeof pdfjsLib==='undefined')throw new Error('pas d\'aperçu');
    const pdf=await pdfjsLib.getDocument({url:url}).promise;
    const page=await pdf.getPage(1);
    const base=page.getViewport({scale:1});
    const vp=page.getViewport({scale:(380/base.width)});
    const cv=document.createElement('canvas');
    cv.width=vp.width;cv.height=vp.height;
    await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    stgcThumbs[path]=cv.toDataURL('image/jpeg',0.8);
    poser(stgcThumbs[path]);
  }catch(e){
    document.querySelectorAll('[data-stgc-thumb="'+path+'"]').forEach(n=>{n.innerHTML='<div style="padding:30px 6px;text-align:center;font-size:11.5px;color:var(--muted)"><i class="ti ti-file" style="font-size:26px;display:block"></i>Ouvrir</div>';});
  }
}

// ── Affichage du tableau ──────────────────────────────────────────────────
function stgcRender(){
  const zone=document.getElementById('stg-view-cand');
  if(!zone)return;
  if(!stgcOk){
    zone.innerHTML='<div style="background:var(--red-light);color:#c0392b;border:1.5px solid var(--red);border-radius:8px;padding:9px 12px;font-size:12.5px">'
      +'Indisponible : le script <code>sql/stagiaires_candidatures.sql</code> n\'a pas encore été appliqué sur Supabase.</div>';
    return;
  }
  const colonnes=[{id:'',nom:'Demandes de stage reçues',cartes:stgcListe.filter(c=>c.statut==='ouverte')}]
    .concat(stgcCreches.map(cr=>({id:String(cr.id),nom:cr.name,cartes:stgcListe.filter(c=>c.statut==='attribuee'&&String(c.attribuee_creche)===String(cr.id))})));
  /* Les classées juste après « Demandes reçues » : tout à droite elles seraient hors de vue derrière les colonnes de crèches. */
  if(isDirection&&stgcVoirClassees)colonnes.splice(1,0,{id:'classee',nom:'Classées (archivées)',cartes:stgcListe.filter(c=>c.statut==='classee')});
  const nbClassees=stgcListe.filter(c=>c.statut==='classee').length;
  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
    +'<p style="margin:0;font-size:12.5px;color:var(--muted);flex:1;min-width:220px">'
    +(isDirection
      ?'Publiez ici les candidatures reçues. Les référent·e·s se positionnent en déplaçant la carte dans la colonne de leur crèche ; vous pouvez aussi la déplacer vous-même.'
      :'Candidatures de stage et d\'alternance. Ouvrez le CV et la lettre, puis cliquez sur <b>Je me positionne</b> pour mettre la carte dans la colonne de votre crèche et prendre contact.')
    +'</p><div style="display:flex;gap:6px;flex-wrap:wrap">'
    +(isDirection&&nbClassees?'<button class="btn-sm" onclick="stgcBasculerClassees()"><i class="ti ti-archive"></i> '+(stgcVoirClassees?'Masquer':'Voir')+' les classées ('+nbClassees+')</button>':'')
    +(isDirection?'<button class="btn-primary" onclick="stgcOuvrirForm()"><i class="ti ti-plus"></i> Publier une candidature</button>':'')
    +'</div></div>'
    +'<div style="display:flex;gap:14px;overflow-x:auto;align-items:flex-start;padding-bottom:12px">'
    +colonnes.map(col=>
      '<div'+(col.id==='classee'?' id="stgc-col-classee"':'')+' style="flex:0 0 330px;max-width:90vw">'
      +'<div style="background:#4B3FC0;color:#fff;border-radius:10px;padding:10px 14px;font-weight:700;font-size:15px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      +'<span>'+escHtml(col.nom)+'</span><span style="font-size:12px;background:rgba(255,255,255,.22);border-radius:99px;padding:1px 9px">'+col.cartes.length+'</span></div>'
      +'<div style="display:flex;flex-direction:column;gap:12px;max-height:72vh;overflow-y:auto;padding-right:2px">'
      +(col.cartes.length?col.cartes.map(stgcCarte).join(''):'<div style="color:var(--muted);font-size:12.5px;text-align:center;padding:18px 6px;border:1.5px dashed var(--border);border-radius:10px">'+(col.id===''?'Aucune demande à prendre.':'Aucune carte.')+'</div>')
      +'</div></div>').join('')
    +'</div>';
  zone.innerHTML=h;
  stgcSigner().then(()=>{
    document.querySelectorAll('[data-stgc-thumb]').forEach(n=>{
      if(n.dataset.stgcFait)return;n.dataset.stgcFait='1';
      stgcMiniature(n.getAttribute('data-stgc-thumb'),n.getAttribute('data-stgc-mime'));
    });
  });
}

function stgcBasculerTexte(id){stgcTexteOuvert[id]=!stgcTexteOuvert[id];stgcRender();}
function stgcBasculerClassees(){
  stgcVoirClassees=!stgcVoirClassees;stgcRender();
  if(stgcVoirClassees){
    const col=document.getElementById('stgc-col-classee');
    if(col)col.scrollIntoView({behavior:'smooth',inline:'start',block:'nearest'});
  }
}

function stgcVignette(c,type){
  const path=c[type+'_path'],mime=c[type+'_mime']||'';
  const lib=type==='cv'?'CV':'Lettre de motivation';
  if(!path)return '';
  const badge=mime==='application/pdf'?'PDF':mime.indexOf('image/')===0?'IMG':'DOC';
  return '<div style="flex:1;min-width:0;cursor:pointer" onclick="stgcApercu(\''+c.id+'\',\''+type+'\')" title="Agrandir : '+escHtml(c[type+'_nom']||lib)+'">'
    +'<div style="position:relative;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fafafa;height:170px">'
    +'<div data-stgc-thumb="'+escHtml(path)+'" data-stgc-mime="'+escHtml(mime)+'" style="width:100%"><div style="padding:60px 0;text-align:center;color:var(--muted);font-size:11px">…</div></div>'
    +'<span style="position:absolute;left:0;bottom:0;background:#222;color:#fff;font-size:10.5px;font-weight:700;padding:2px 8px;border-top-right-radius:8px">'+badge+'</span></div>'
    +'<div style="font-size:11.5px;margin-top:3px;text-align:center;color:var(--muted)">'+lib+'</div></div>';
}

function stgcCarte(c){
  const mienne=String(c.attribuee_creche||'')===stgcMaCreche()&&stgcMaCreche()!=='';
  const periode=c.date_debut||c.date_fin?(c.date_debut?'du '+stgcFr(c.date_debut):'')+(c.date_fin?' au '+stgcFr(c.date_fin):''):'';
  const comms=stgcCommsDe(c.id);
  const ouvert=!!stgcOuverts[c.id];
  let h='<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 13px;display:flex;flex-direction:column;gap:8px">'
    +'<div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:50%;background:var(--koala);color:#fff;display:grid;place-items:center;font-size:13px;font-weight:700">'+escHtml((c.created_by||'K').charAt(0).toUpperCase())+'</div>'
    +'<div style="font-size:11.5px;line-height:1.3"><b>'+escHtml(c.created_by||'Koala Kids')+'</b><br><span style="color:var(--muted)">'+stgcIlYa(c.created_at)+'</span></div></div>'
    +'<div><div style="font-weight:700;font-size:15px">'+escHtml(c.prenom)+' '+escHtml(c.nom||'')+'</div>'
    +'<div style="font-size:12px;color:var(--muted)">'+(c.type_contrat==='alternant'?'Alternance':'Stage')
    +(c.formation?' · '+escHtml(c.formation):'')+(c.niveau?' ('+escHtml(c.niveau)+')':'')+(c.ecole?' · '+escHtml(c.ecole):'')+'</div></div>'
    +(c.cv_path||c.lettre_path?'<div style="display:flex;gap:8px">'+stgcVignette(c,'cv')+stgcVignette(c,'lettre')+'</div>':'');
  if(periode)h+='<div style="font-size:12.5px"><i class="ti ti-calendar" style="color:var(--koala)"></i> Souhaité : '+periode+'</div>';
  /* Le texte de la demande : le corps du mail quand il n'y a pas de lettre de motivation jointe.
     Replié au-delà de 6 lignes pour ne pas allonger la colonne. */
  if(c.notes){
    const long=c.notes.length>320,plie=long&&!stgcTexteOuvert[c.id];
    h+='<div style="background:#F6F5FB;border-left:3px solid #4B3FC0;border-radius:0 8px 8px 0;padding:8px 10px;font-size:12.5px;color:#333;line-height:1.5">'
      +'<div style="white-space:pre-line;'+(plie?'display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden':'')+'">'+escHtml(c.notes)+'</div>'
      +(long?'<button class="btn-sm" style="margin-top:5px;font-size:11.5px" onclick="stgcBasculerTexte(\''+c.id+'\')">'+(plie?'Lire la suite':'Réduire')+'</button>':'')
      +'</div>';
  }
  if(c.email||c.telephone)h+='<div style="font-size:12px;color:var(--muted)">'
    +(c.email?'<i class="ti ti-mail"></i> '+escHtml(c.email)+' ':'')+(c.telephone?'<i class="ti ti-phone"></i> '+escHtml(c.telephone):'')+'</div>';

  // Actions : se positionner / déplacer / fiche
  h+='<div style="border-top:1px solid var(--border);padding-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
  if(c.statut==='ouverte'&&!isDirection&&stgcMaCreche())
    h+='<button class="btn-primary" style="padding:6px 12px;font-size:12.5px" onclick="stgcDeplacer(\''+c.id+'\',\''+stgcMaCreche()+'\')"><i class="ti ti-hand-finger"></i> Je me positionne</button>';
  if(c.statut==='attribuee'&&(mienne||isDirection)){
    h+=c.stagiaire_id?'<span style="font-size:12px;color:var(--green)"><i class="ti ti-circle-check"></i> Fiche créée</span>'
      :'<button class="btn-primary" style="padding:6px 12px;font-size:12.5px" onclick="stgcCreerFiche(\''+c.id+'\')"><i class="ti ti-user-plus"></i> Créer la fiche</button>';
    h+='<button class="btn-sm" onclick="stgcDeplacer(\''+c.id+'\',null)"><i class="ti ti-arrow-back-up"></i> Remettre dans les demandes</button>';
  }
  if(isDirection){
    h+='<select class="finput" style="width:auto;font-size:12px;padding:4px 8px" onchange="if(this.value!==\'-\'){stgcDeplacer(\''+c.id+'\',this.value||null)}this.value=\'-\'">'
      +'<option value="-">Déplacer vers…</option><option value="">Demandes reçues</option>'
      +stgcCreches.map(cr=>'<option value="'+escHtml(String(cr.id))+'">'+escHtml(cr.name)+'</option>').join('')+'</select>';
  }
  h+='</div>';

  // Commentaires
  h+='<div><button class="btn-sm" style="width:100%;text-align:left" onclick="stgcBasculerComms(\''+c.id+'\')"><i class="ti ti-message"></i> '
    +(comms.length?comms.length+' commentaire'+(comms.length>1?'s':''):'Ajouter un commentaire')+'</button>';
  if(ouvert){
    h+='<div style="margin-top:6px;display:flex;flex-direction:column;gap:5px">'
      +comms.map(m=>'<div style="background:#F6F5FB;border-radius:8px;padding:6px 9px;font-size:12px"><b>'+escHtml(m.auteur_nom||'?')+'</b> <span style="color:var(--muted);font-size:11px">'+stgcIlYa(m.created_at)+'</span>'
        +((isDirection||(currentProfile&&String(m.auteur_id)===String(currentProfile.id)))?' <button class="ibtn" style="width:20px;height:20px;font-size:11px;color:var(--red);float:right" title="Supprimer" onclick="stgcSupprimerComm(\''+m.id+'\')"><i class="ti ti-x"></i></button>':'')
        +'<div style="white-space:pre-line;margin-top:2px">'+escHtml(m.texte)+'</div></div>').join('')
      +(stgcCommsOk?'<div style="display:flex;gap:6px"><input class="finput" id="stgc-c-'+c.id+'" maxlength="1000" placeholder="Votre commentaire…" style="font-size:12.5px" onkeydown="if(event.key===\'Enter\')stgcCommenter(\''+c.id+'\')">'
        +'<button class="btn-primary" style="padding:6px 10px" onclick="stgcCommenter(\''+c.id+'\')"><i class="ti ti-send"></i></button></div>'
        :'<div style="font-size:11.5px;color:var(--red)">Commentaires indisponibles : appliquez <code>sql/stagiaires_candidatures_mur.sql</code>.</div>')
      +'</div>';
  }
  h+='</div>';

  if(isDirection){
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +'<button class="btn-sm" onclick="stgcOuvrirForm(\''+c.id+'\')"><i class="ti ti-pencil"></i> Modifier</button>'
      +(c.statut!=='classee'?'<button class="btn-sm" onclick="stgcClasser(\''+c.id+'\')"><i class="ti ti-archive"></i> Classer</button>':'')
      +'<button class="btn-sm" style="color:var(--red)" onclick="stgcSupprimer(\''+c.id+'\')"><i class="ti ti-trash"></i> Supprimer</button></div>';
  }
  return h+'</div>';
}

// ── Aperçu agrandi du CV / de la lettre ───────────────────────────────────
async function stgcApercu(id,type){
  const c=stgcListe.find(x=>String(x.id)===String(id));
  if(!c||!c[type+'_path'])return;
  const path=c[type+'_path'],mime=c[type+'_mime']||'';
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(STGC_BUCKET,path,{libelle:(type==='cv'?'CV':'Lettre')+' — candidature '+c.prenom});
  const {data,error}=await sb.storage.from(STGC_BUCKET).createSignedUrl(path,STG_URL_TTL);
  if(error||!data)return showBanner('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'),'error');
  const url=data.signedUrl;
  let ov=document.getElementById('modal-stgc-apercu');
  if(ov)ov.remove();
  ov=document.createElement('div');
  ov.className='overlay';ov.id='modal-stgc-apercu';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-stgc-apercu');};
  const titre=(type==='cv'?'CV':'Lettre de motivation')+' — '+escHtml(c.prenom)+' '+escHtml(c.nom||'');
  ov.innerHTML='<div class="modal" style="max-width:860px;width:100%;max-height:92vh;overflow:auto;text-align:center">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem"><h3 style="margin:0;font-size:15px">'+titre+'</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-stgc-apercu\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<div id="stgc-apercu-corps" style="font-size:13px;color:var(--muted)">⏳ Chargement…</div>'
    +'<div style="margin-top:10px"><a class="btn-cancel" href="'+escHtml(url)+'" target="_blank" rel="noopener" style="text-decoration:none"><i class="ti ti-external-link"></i> Ouvrir / télécharger</a></div></div>';
  document.body.appendChild(ov);
  ov.classList.add('open');
  const corps=document.getElementById('stgc-apercu-corps');
  try{
    if(mime.indexOf('image/')===0){corps.innerHTML='<img src="'+escHtml(url)+'" style="max-width:100%;border-radius:8px">';return;}
    if(mime!=='application/pdf'||typeof pdfjsLib==='undefined')throw new Error('format');
    const pdf=await pdfjsLib.getDocument({url:url}).promise;
    corps.innerHTML='';
    const largeur=Math.min(780,(ov.querySelector('.modal').clientWidth||800)-40);
    for(let n=1;n<=Math.min(pdf.numPages,6);n++){
      const page=await pdf.getPage(n);
      const base=page.getViewport({scale:1});
      const vp=page.getViewport({scale:(largeur/base.width)*(window.devicePixelRatio>1?1.5:1)});
      const cv=document.createElement('canvas');
      cv.width=vp.width;cv.height=vp.height;cv.style.cssText='width:100%;max-width:'+largeur+'px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px';
      corps.appendChild(cv);
      await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    }
  }catch(e){
    corps.innerHTML='<p style="padding:24px 10px">Aperçu indisponible pour ce fichier (Word…). Utilisez « Ouvrir / télécharger ».</p>';
  }
}

// ── Déplacer une carte (se positionner) ───────────────────────────────────
async function stgcDeplacer(id,creche){
  const {error}=await sb.rpc('kk_vivier_deplacer',{p_id:id,p_creche:creche||null});
  if(error)return showBanner('Déplacement impossible : '+error.message,'error');
  const c=stgcListe.find(x=>String(x.id)===String(id));
  if(c){
    c.statut=creche?'attribuee':'ouverte';c.attribuee_creche=creche||null;
    c.attribuee_referent=creche&&currentProfile?currentProfile.id:null;
  }
  stgcBadge();stgcRender();
  if(creche){
    showBanner('Carte déplacée dans « '+stgcCrecheNom(creche)+' » ✅');
    if(!isDirection)stgcPrevenirDirection(c);
  }
}

/* Notification push à la direction quand un·e référent·e se positionne ; jamais bloquante. */
async function stgcPrevenirDirection(c){
  try{
    if(!c)return;
    const ids=cacheReferents.filter(r=>r.role==='direction').map(r=>r.id);
    if(!ids.length)return;
    await sb.functions.invoke('notify-push',{body:{referent_ids:ids,
      title:'Candidature : un·e référent·e se positionne',
      body:((currentProfile&&currentProfile.name)||'Quelqu\'un')+' → '+c.prenom+' '+(c.nom||''),
      url:'./demandes.html',tag:'candidature-'+c.id}});
  }catch(e){console.warn('[Candidatures] notification',e.message);}
}

/* Nouvelle candidature publiée : push aux référent·e·s. */
async function stgcPrevenirReferents(id){
  try{
    const c=stgcListe.find(x=>String(x.id)===String(id));
    if(!c)return;
    const ids=cacheReferents.filter(r=>r.role==='referent'&&r.user_id!==(currentUser&&currentUser.id)).map(r=>r.id);
    if(!ids.length)return;
    await sb.functions.invoke('notify-push',{body:{referent_ids:ids,title:'Nouvelle candidature de stage',
      body:c.prenom+' '+(c.nom||'')+(c.formation?' · '+c.formation:''),url:'./demandes.html',tag:'candidature-'+id}});
  }catch(e){console.warn('[Candidatures] notification',e.message);}
}

// ── Créer la fiche stagiaire depuis la carte ──────────────────────────────
async function stgcCreerFiche(id){
  const c=stgcListe.find(x=>String(x.id)===String(id));
  if(!c||!c.attribuee_creche)return;
  if(!confirm('Créer la fiche stagiaire de '+c.prenom+' '+(c.nom||'')+' dans « '+stgcCrecheNom(c.attribuee_creche)+' » ?'))return;
  const notes=['Candidature reçue par le mur des candidatures.',
    c.date_debut||c.date_fin?'Période souhaitée : '+(c.date_debut?'du '+stgcFr(c.date_debut):'')+(c.date_fin?' au '+stgcFr(c.date_fin):'')+'.':'',
    c.notes||''].filter(Boolean).join('\n');
  const fiche=await dbInsert('stagiaires',{
    type_contrat:c.type_contrat,prenom:c.prenom,nom:c.nom,email:c.email,telephone:c.telephone,
    ecole:c.ecole,formation:c.formation,niveau:c.niveau,creche_id:c.attribuee_creche,
    referent_id:c.attribuee_referent||null,statut:'contact',demande_le:c.created_at.slice(0,10),
    date_debut:c.date_debut,date_fin:c.date_fin,notes:notes});
  if(!fiche)return showBanner('Création de la fiche impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  const {error}=await sb.rpc('kk_vivier_lier_fiche',{p_id:id,p_fiche:fiche.id});
  if(error)console.warn('[Candidatures] lien fiche',error.message);
  c.stagiaire_id=fiche.id;
  if(typeof stgLoad==='function')await stgLoad();
  stgcRender();
  showBanner('Fiche créée dans « '+stgcCrecheNom(c.attribuee_creche)+' » ✅');
}

// ── Commentaires ──────────────────────────────────────────────────────────
function stgcBasculerComms(id){stgcOuverts[id]=!stgcOuverts[id];stgcRender();}

async function stgcCommenter(id){
  const inp=document.getElementById('stgc-c-'+id);
  const texte=inp?inp.value.trim():'';
  if(!texte||!currentProfile)return;
  const {data,error}=await sb.from('stagiaires_candidatures_commentaires').insert({
    candidature_id:id,auteur_id:currentProfile.id,auteur_nom:currentProfile.name||null,texte:texte}).select().single();
  if(error)return showBanner('Commentaire impossible : '+error.message,'error');
  stgcComms.push(data);
  stgcOuverts[id]=true;
  stgcRender();
}

async function stgcSupprimerComm(id){
  const {error}=await sb.from('stagiaires_candidatures_commentaires').delete().eq('id',id);
  if(error)return showBanner('Suppression impossible : '+error.message,'error');
  stgcComms=stgcComms.filter(m=>String(m.id)!==String(id));
  stgcRender();
}

// ── Publication / modification (direction) ────────────────────────────────
function stgcOuvrirForm(id){
  const c=id?stgcListe.find(x=>String(x.id)===String(id)):null;
  let ov=document.getElementById('modal-stgc-form');
  if(ov)ov.remove();
  ov=document.createElement('div');
  ov.className='overlay';ov.id='modal-stgc-form';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-stgc-form');};
  const v=k=>escHtml((c&&c[k])||'');
  const fich=(type,lib)=>'<div class="fg"><label class="flabel">'+lib+(c&&c[type+'_nom']?' <span style="font-weight:400;color:var(--muted)">(actuel : '+escHtml(c[type+'_nom'])+')</span>':'')+'</label>'
    +'<input class="finput" type="file" id="stgc-f-'+type+'" accept="application/pdf,image/*,.doc,.docx"></div>';
  ov.innerHTML='<div class="modal" style="max-width:520px;width:100%;max-height:90vh;overflow:auto">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem"><h3 style="margin:0">'+(c?'Modifier la candidature':'Publier une candidature')+'</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-stgc-form\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<div class="frow"><div class="fg"><label class="flabel">Prénom *</label><input class="finput" id="stgc-f-prenom" value="'+v('prenom')+'"></div>'
    +'<div class="fg"><label class="flabel">Nom</label><input class="finput" id="stgc-f-nom" value="'+v('nom')+'"></div></div>'
    +'<div class="frow"><div class="fg"><label class="flabel">E-mail</label><input class="finput" type="email" id="stgc-f-email" value="'+v('email')+'"></div>'
    +'<div class="fg"><label class="flabel">Téléphone</label><input class="finput" type="tel" id="stgc-f-tel" value="'+v('telephone')+'"></div></div>'
    +'<div class="frow"><div class="fg"><label class="flabel">Type</label><select class="finput" id="stgc-f-type">'
    +'<option value="stagiaire"'+(c&&c.type_contrat==='alternant'?'':' selected')+'>Stage</option><option value="alternant"'+(c&&c.type_contrat==='alternant'?' selected':'')+'>Alternance</option></select></div>'
    +'<div class="fg"><label class="flabel">Niveau / année</label><input class="finput" id="stgc-f-niveau" value="'+v('niveau')+'"></div></div>'
    +'<div class="frow"><div class="fg"><label class="flabel">École / organisme</label><input class="finput" id="stgc-f-ecole" value="'+v('ecole')+'"></div>'
    +'<div class="fg"><label class="flabel">Formation</label><input class="finput" id="stgc-f-formation" value="'+v('formation')+'" placeholder="CAP AEPE, EJE…"></div></div>'
    +'<div class="frow"><div class="fg"><label class="flabel">Début souhaité</label><input class="finput" type="date" id="stgc-f-debut" value="'+v('date_debut')+'"></div>'
    +'<div class="fg"><label class="flabel">Fin souhaitée</label><input class="finput" type="date" id="stgc-f-fin" value="'+v('date_fin')+'"></div></div>'
    +'<div class="fg"><label class="flabel">Texte de la demande</label><textarea class="finput" id="stgc-f-notes" rows="6" style="resize:vertical" placeholder="Collez ici le corps du mail quand il n\'y a pas de lettre de motivation jointe, ou ajoutez une note pour les référent·e·s (secteur, disponibilités…)">'+v('notes')+'</textarea></div>'
    +fich('cv','CV')+fich('lettre','Lettre de motivation')
    +'<p style="font-size:11.5px;color:var(--muted);margin:0 0 8px">PDF, image ou Word, 12 Mo maximum. Visibles de toutes les crèches : supprimez la candidature une fois traitée.</p>'
    +'<div class="mactions"><span id="stgc-f-st" style="font-size:12px;color:var(--muted);margin-right:auto"></span>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-stgc-form\')">Annuler</button>'
    +'<button class="btn-primary" id="stgc-f-ok" onclick="stgcEnregistrer('+(c?'\''+c.id+'\'':'null')+')"><i class="ti ti-check"></i> '+(c?'Enregistrer':'Publier')+'</button></div></div>';
  document.body.appendChild(ov);
  ov.classList.add('open');
}

async function stgcEnvoyerFichier(candId,type,file){
  const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,5)||'bin';
  const path=candId+'/'+type+'-'+Date.now()+'.'+ext;
  const {error}=await sb.storage.from(STGC_BUCKET).upload(path,file,{contentType:file.type||undefined});
  if(error)throw error;
  return {path:path,nom:file.name,mime:file.type||null};
}

async function stgcEnregistrer(id){
  const val=k=>((document.getElementById('stgc-f-'+k)||{}).value||'').trim();
  const st=document.getElementById('stgc-f-st'),btn=document.getElementById('stgc-f-ok');
  if(!val('prenom'))return showBanner('Le prénom est obligatoire.','error');
  if(val('debut')&&val('fin')&&val('fin')<val('debut'))return showBanner('La fin souhaitée est avant le début.','error');
  const files={cv:(document.getElementById('stgc-f-cv').files||[])[0],lettre:(document.getElementById('stgc-f-lettre').files||[])[0]};
  for(const k in files)if(files[k]&&files[k].size>12*1024*1024)return showBanner('Fichier trop lourd (12 Mo maximum).','error');
  const orgId=currentProfile&&currentProfile.org_id;
  if(!orgId)return showBanner('Organisation introuvable sur votre profil.','error');
  const row={prenom:val('prenom'),nom:val('nom')||null,email:val('email')||null,telephone:val('tel')||null,
    type_contrat:val('type')==='alternant'?'alternant':'stagiaire',niveau:val('niveau')||null,ecole:val('ecole')||null,
    formation:val('formation')||null,date_debut:val('debut')||null,date_fin:val('fin')||null,notes:val('notes')||null};
  btn.disabled=true;if(st)st.textContent='⏳ Enregistrement…';
  let candId=id,cree=false,nouveaux=[];
  try{
    if(id){
      const {error}=await sb.from('stagiaires_candidatures').update(row).eq('id',id);
      if(error)throw error;
    }else{
      const {data,error}=await sb.from('stagiaires_candidatures').insert(Object.assign({org_id:orgId,created_by:(currentProfile&&currentProfile.name)||null},row)).select().single();
      if(error)throw error;
      candId=data.id;cree=true;
    }
    const maj={};
    for(const type of ['cv','lettre']){
      if(!files[type])continue;
      if(st)st.textContent='⏳ Envoi du fichier ('+(type==='cv'?'CV':'lettre')+')…';
      const f=await stgcEnvoyerFichier(candId,type,files[type]);
      const ancien=(stgcListe.find(x=>String(x.id)===String(candId))||{})[type+'_path'];
      maj[type+'_path']=f.path;maj[type+'_nom']=f.nom;maj[type+'_mime']=f.mime;
      if(ancien)nouveaux.push(ancien);
    }
    if(Object.keys(maj).length){
      const {error}=await sb.from('stagiaires_candidatures').update(maj).eq('id',candId);
      if(error)throw error;
      if(nouveaux.length)await sb.storage.from(STGC_BUCKET).remove(nouveaux);
    }
  }catch(e){
    console.error('[Candidatures]',e.message||e);
    btn.disabled=false;if(st)st.textContent='';
    return showBanner('Enregistrement impossible : '+(e.message||e),'error');
  }
  closeModal('modal-stgc-form');
  await stgcCharger();
  showBanner(cree?'Candidature publiée ✅':'Candidature enregistrée ✅');
  if(cree)stgcPrevenirReferents(candId);
}

async function stgcClasser(id){
  if(!confirm('Classer cette candidature ? Elle disparaît de la liste « À prendre ».'))return;
  const {error}=await sb.from('stagiaires_candidatures').update({statut:'classee'}).eq('id',id);
  if(error)return showBanner('Impossible : '+error.message,'error');
  await stgcCharger();
}

async function stgcSupprimer(id){
  const c=stgcListe.find(x=>String(x.id)===String(id));
  if(!c)return;
  if(!confirm('Supprimer la candidature de '+c.prenom+' '+(c.nom||'')+' ?\n\nLe CV et la lettre sont effacés définitivement.'))return;
  const chemins=[c.cv_path,c.lettre_path].filter(Boolean);
  if(chemins.length){
    const {error:e1}=await sb.storage.from(STGC_BUCKET).remove(chemins);
    if(e1)return showBanner('Suppression des fichiers impossible : '+e1.message,'error');
  }
  const {error}=await sb.from('stagiaires_candidatures').delete().eq('id',id);
  if(error)return showBanner('Suppression impossible : '+error.message,'error');
  await stgcCharger();
  showBanner('Candidature supprimée.');
}
