/* ===== LE MUR DES CANDIDATURES (le « Padlet » dans l'application) ============
   La direction reçoit des candidatures de stage / d'alternance par e-mail : elle
   les PUBLIE ici avec le CV et la lettre de motivation. Les référent·e·s des
   crèches les voient, ouvrent CV et lettre à l'écran et SE POSITIONNENT pour
   prendre contact (« ils font leur marché »). La direction voit qui s'est
   positionné et ATTRIBUE la candidature à une crèche : la fiche stagiaire est
   alors créée. Tables et bucket : sql/stagiaires_candidatures.sql.
   Fichiers dans le bucket privé `stagiaires-vivier`, ouverts par lien signé de
   5 minutes (journalisé), jamais d'URL stockée. */
const STGC_BUCKET='stagiaires-vivier';
let stgcListe=[], stgcInterets=[], stgcOk=true, stgcFiltre='ouvertes';

function stgcMonId(){return currentProfile&&currentProfile.id;}
function stgcCrecheNom(id){
  const c=cacheCreches.find(x=>String(x.id)===String(id));
  return c?c.name:'';
}
function stgcInteretsDe(id){return stgcInterets.filter(i=>String(i.candidature_id)===String(id));}
function stgcJeMePositionne(id){return stgcInteretsDe(id).some(i=>String(i.referent_id)===String(stgcMonId()));}
function stgcFr(d){return d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR'):'';}

async function stgcCharger(){
  const r1=await sb.from('stagiaires_candidatures').select('*').order('created_at',{ascending:false});
  const r2=await sb.from('stagiaires_candidatures_interets').select('*');
  stgcOk=!r1.error&&!r2.error;
  stgcListe=r1.data||[];stgcInterets=r2.data||[];
  stgcBadge();
  stgcRender();
}

/* Pastille sur l'onglet : candidatures ouvertes où je ne me suis pas encore positionné·e. */
function stgcBadge(){
  const b=document.getElementById('stg-badge-cand');
  if(!b)return;
  const n=isDirection?stgcListe.filter(c=>c.statut==='ouverte').length
    :stgcListe.filter(c=>c.statut==='ouverte'&&!stgcJeMePositionne(c.id)).length;
  b.textContent=n;b.style.display=n?'inline-block':'none';
}

function stgcSetFiltre(f){stgcFiltre=f;stgcRender();}

function stgcRender(){
  const zone=document.getElementById('stg-view-cand');
  if(!zone)return;
  if(!stgcOk){
    zone.innerHTML='<div style="background:var(--red-light);color:#c0392b;border:1.5px solid var(--red);border-radius:8px;padding:9px 12px;font-size:12.5px">'
      +'Indisponible : le script <code>sql/stagiaires_candidatures.sql</code> n\'a pas encore été appliqué sur Supabase.</div>';
    return;
  }
  const filtres=[['ouvertes','À prendre'],['attribuees','Prises en charge'],['toutes','Toutes']];
  const liste=stgcListe.filter(c=>stgcFiltre==='toutes'||(stgcFiltre==='ouvertes'?c.statut==='ouverte':c.statut!=='ouverte'));
  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
    +'<p style="margin:0;font-size:12.5px;color:var(--muted);flex:1;min-width:220px">'
    +(isDirection
      ?'Publiez ici les candidatures reçues par e-mail, avec le CV et la lettre. Les référent·e·s les voient et se positionnent pour prendre contact ; vous attribuez ensuite la candidature à une crèche.'
      :'Candidatures de stage et d\'alternance mises à disposition par la direction. Ouvrez le CV et la lettre, puis <b>positionnez-vous</b> si vous souhaitez prendre contact : la direction attribue ensuite la candidature.')
    +'</p>'
    +(isDirection?'<button class="btn-primary" onclick="stgcOuvrirForm()"><i class="ti ti-plus"></i> Publier une candidature</button>':'')
    +'</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">'
    +filtres.map(f=>'<button class="btn-sm" style="'+(stgcFiltre===f[0]?'background:var(--koala);color:#fff;border-color:var(--koala)':'')+'" onclick="stgcSetFiltre(\''+f[0]+'\')">'+f[1]+'</button>').join('')
    +'</div>';
  if(!liste.length){
    h+='<div style="text-align:center;color:var(--muted);padding:30px 10px;font-size:13px">'
      +(stgcFiltre==='ouvertes'?'Aucune candidature à prendre pour le moment.':'Rien à afficher.')+'</div>';
  }else{
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px">'+liste.map(stgcCarte).join('')+'</div>';
  }
  zone.innerHTML=h;
}

function stgcFichierBtn(c,type){
  const nom=c[type+'_nom'],path=c[type+'_path'];
  const lib=type==='cv'?'CV':'Lettre de motivation';
  if(!path)return '<span style="font-size:11.5px;color:var(--muted)">'+lib+' : non jointe</span>';
  return '<button class="btn-sm" onclick="stgcApercu(\''+c.id+'\',\''+type+'\')" title="'+escHtml(nom||lib)+'"><i class="ti ti-'+(type==='cv'?'file-cv':'mail-opened')+'"></i> '+lib+'</button>';
}

function stgcCarte(c){
  const ints=stgcInteretsDe(c.id);
  const moi=stgcJeMePositionne(c.id);
  const prisePar=c.statut==='attribuee'?stgcCrecheNom(c.attribuee_creche):'';
  const periode=c.date_debut||c.date_fin
    ?(c.date_debut?'du '+stgcFr(c.date_debut):'')+(c.date_fin?' au '+stgcFr(c.date_fin):''):'';
  let h='<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:13px 14px;display:flex;flex-direction:column;gap:8px">'
    +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">'
    +'<div><div style="font-weight:700;font-size:14.5px">'+escHtml(c.prenom)+' '+escHtml(c.nom||'')+'</div>'
    +'<div style="font-size:12px;color:var(--muted)">'+(c.type_contrat==='alternant'?'Alternance':'Stage')
    +(c.formation?' · '+escHtml(c.formation):'')+(c.niveau?' ('+escHtml(c.niveau)+')':'')+'</div>'
    +(c.ecole?'<div style="font-size:12px;color:var(--muted)">'+escHtml(c.ecole)+'</div>':'')+'</div>'
    +(c.statut==='attribuee'?'<span style="background:var(--green-light,#E8F5EC);color:var(--green);border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Prise en charge'+(prisePar?' · '+escHtml(prisePar):'')+'</span>'
      :c.statut==='classee'?'<span style="background:#EFEEF6;color:var(--muted);border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700">Classée</span>':'')
    +'</div>';
  if(periode)h+='<div style="font-size:12px"><i class="ti ti-calendar" style="color:var(--koala)"></i> Souhaité : '+periode+'</div>';
  if(c.notes)h+='<div style="font-size:12px;color:#555;line-height:1.5;white-space:pre-line">'+escHtml(c.notes)+'</div>';
  if(c.email||c.telephone)h+='<div style="font-size:12px;color:var(--muted)">'
    +(c.email?'<i class="ti ti-mail"></i> '+escHtml(c.email)+' ':'')+(c.telephone?'<i class="ti ti-phone"></i> '+escHtml(c.telephone):'')+'</div>';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap">'+stgcFichierBtn(c,'cv')+stgcFichierBtn(c,'lettre')+'</div>';
  h+='<div style="border-top:1px solid var(--border);padding-top:8px;font-size:12px">'
    +(ints.length
      ?'<div style="margin-bottom:6px"><b>Positionné·e·s :</b> '+ints.map(i=>escHtml(i.referent_nom||'?')+(i.creche_id?' <span style="color:var(--muted)">('+escHtml(stgcCrecheNom(i.creche_id))+')</span>':'')).join(', ')+'</div>'
      :'<div style="color:var(--muted);margin-bottom:6px">Personne ne s\'est encore positionné·e.</div>');
  if(c.statut==='ouverte'){
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
      +(moi?'<button class="btn-sm" onclick="stgcPositionner(\''+c.id+'\',false)"><i class="ti ti-x"></i> Retirer mon positionnement</button>'
           :'<button class="btn-primary" style="padding:6px 12px;font-size:12.5px" onclick="stgcPositionner(\''+c.id+'\',true)"><i class="ti ti-hand-finger"></i> Je me positionne</button>');
    if(isDirection)h+='<button class="btn-sm" onclick="stgcAttribuer(\''+c.id+'\')"><i class="ti ti-user-check"></i> Attribuer…</button>';
    h+='</div>';
  }
  if(isDirection){
    h+='<div style="display:flex;gap:6px;margin-top:6px">'
      +'<button class="btn-sm" onclick="stgcOuvrirForm(\''+c.id+'\')"><i class="ti ti-pencil"></i> Modifier</button>'
      +(c.statut!=='classee'&&c.statut!=='attribuee'?'<button class="btn-sm" onclick="stgcClasser(\''+c.id+'\')"><i class="ti ti-archive"></i> Classer</button>':'')
      +'<button class="btn-sm" style="color:var(--red)" onclick="stgcSupprimer(\''+c.id+'\')"><i class="ti ti-trash"></i> Supprimer</button></div>';
  }
  return h+'</div></div>';
}

// ── Aperçu du CV / de la lettre à l'écran ─────────────────────────────────
async function stgcApercu(id,type){
  const c=stgcListe.find(x=>String(x.id)===String(id));
  if(!c||!c[type+'_path'])return;
  const path=c[type+'_path'];
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(STGC_BUCKET,path,{libelle:(type==='cv'?'CV':'Lettre')+' — candidature '+c.prenom});
  const {data,error}=await sb.storage.from(STGC_BUCKET).createSignedUrl(path,STG_URL_TTL);
  if(error||!data)return showBanner('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'),'error');
  const url=data.signedUrl,mime=c[type+'_mime']||'';
  let ov=document.getElementById('modal-stgc-apercu');
  if(ov)ov.remove();
  ov=document.createElement('div');
  ov.className='overlay';ov.id='modal-stgc-apercu';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-stgc-apercu');};
  const titre=(type==='cv'?'CV':'Lettre de motivation')+' — '+escHtml(c.prenom)+' '+escHtml(c.nom||'');
  const corps=mime==='application/pdf'?'<iframe src="'+escHtml(url)+'" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:8px"></iframe>'
    :mime.indexOf('image/')===0?'<img src="'+escHtml(url)+'" style="max-width:100%;max-height:70vh;border-radius:8px">'
    :'<p style="font-size:13px;color:var(--muted);padding:30px 10px">Aperçu indisponible pour ce type de fichier (Word…). Utilisez « Ouvrir / télécharger ».</p>';
  ov.innerHTML='<div class="modal" style="max-width:820px;width:100%;text-align:center">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem"><h3 style="margin:0;font-size:15px">'+titre+'</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-stgc-apercu\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +corps
    +'<div style="margin-top:10px"><a class="btn-cancel" href="'+escHtml(url)+'" target="_blank" rel="noopener" style="text-decoration:none"><i class="ti ti-external-link"></i> Ouvrir / télécharger</a></div></div>';
  document.body.appendChild(ov);
  ov.classList.add('open');
}

// ── Se positionner ────────────────────────────────────────────────────────
async function stgcPositionner(id,oui){
  const moi=currentProfile;
  if(!moi)return showBanner('Profil introuvable.','error');
  if(oui){
    const {data,error}=await sb.from('stagiaires_candidatures_interets').insert({
      candidature_id:id,referent_id:moi.id,creche_id:moi.creche_id||null,referent_nom:moi.name||null
    }).select().single();
    if(error&&!/duplicate|unique/i.test(error.message))return showBanner('Impossible de se positionner : '+error.message,'error');
    if(data)stgcInterets.push(data);
    showBanner('Vous êtes positionné·e : la direction est prévenue ✅');
    stgcPrevenir('direction',id);
  }else{
    const {error}=await sb.from('stagiaires_candidatures_interets').delete().eq('candidature_id',id).eq('referent_id',moi.id);
    if(error)return showBanner('Impossible : '+error.message,'error');
    stgcInterets=stgcInterets.filter(i=>!(String(i.candidature_id)===String(id)&&String(i.referent_id)===String(moi.id)));
  }
  stgcBadge();stgcRender();
}

/* Notification push, jamais bloquante. 'referents' = nouvelle candidature publiée ;
   'direction' = quelqu'un s'est positionné. */
async function stgcPrevenir(cible,id){
  try{
    const c=stgcListe.find(x=>String(x.id)===String(id));
    if(!c)return;
    const ids=cacheReferents.filter(r=>cible==='direction'?r.role==='direction':(r.role==='referent'&&r.user_id!==(currentUser&&currentUser.id))).map(r=>r.id);
    if(!ids.length)return;
    await sb.functions.invoke('notify-push',{body:{
      referent_ids:ids,
      title:cible==='direction'?'Candidature : un·e référent·e se positionne':'Nouvelle candidature de stage',
      body:cible==='direction'?((currentProfile&&currentProfile.name)||'Quelqu\'un')+' → '+c.prenom+' '+(c.nom||''):c.prenom+' '+(c.nom||'')+(c.formation?' · '+c.formation:''),
      url:'./demandes.html',tag:'candidature-'+id}});
  }catch(e){console.warn('[Candidatures] notification',e.message);}
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
    +'<div class="fg"><label class="flabel">Note pour les référent·e·s</label><textarea class="finput" id="stgc-f-notes" rows="2" style="resize:vertical" placeholder="Secteur géographique, disponibilités…">'+v('notes')+'</textarea></div>'
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
  if(cree)stgcPrevenir('referents',candId);
}

// ── Attribuer, classer, supprimer (direction) ─────────────────────────────
async function stgcAttribuer(id){
  const c=stgcListe.find(x=>String(x.id)===String(id));
  if(!c)return;
  const ints=stgcInteretsDe(id);
  let ov=document.getElementById('modal-stgc-attrib');
  if(ov)ov.remove();
  ov=document.createElement('div');
  ov.className='overlay';ov.id='modal-stgc-attrib';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-stgc-attrib');};
  const opts=ints.length
    ?ints.map(i=>'<option value="'+escHtml(String(i.referent_id))+'|'+escHtml(String(i.creche_id||''))+'">'+escHtml(i.referent_nom||'?')+(i.creche_id?' — '+escHtml(stgcCrecheNom(i.creche_id)):'')+'</option>').join('')
    :'';
  const crecheOpts=cacheCreches.map(cr=>'<option value="'+escHtml(String(cr.id))+'">'+escHtml(cr.name)+'</option>').join('');
  ov.innerHTML='<div class="modal" style="max-width:420px;width:100%">'
    +'<h3 style="margin:0 0 .5rem">Attribuer la candidature de '+escHtml(c.prenom)+' '+escHtml(c.nom||'')+'</h3>'
    +'<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px">La fiche stagiaire est créée dans la crèche choisie (statut « Demande reçue »), avec les coordonnées et la période souhaitée. Le CV et la lettre restent consultables ici.</p>'
    +(ints.length?'<div class="fg"><label class="flabel">Référent·e positionné·e</label><select class="finput" id="stgc-a-ref">'+opts+'</select></div>'
      :'<div class="fg"><label class="flabel">Crèche</label><select class="finput" id="stgc-a-creche">'+crecheOpts+'</select></div>')
    +'<div class="mactions"><button class="btn-cancel" onclick="closeModal(\'modal-stgc-attrib\')">Annuler</button>'
    +'<button class="btn-primary" onclick="stgcConfirmerAttrib(\''+id+'\')"><i class="ti ti-check"></i> Attribuer</button></div></div>';
  document.body.appendChild(ov);
  ov.classList.add('open');
}

async function stgcConfirmerAttrib(id){
  const c=stgcListe.find(x=>String(x.id)===String(id));
  if(!c)return;
  let referent=null,creche=null;
  const sr=document.getElementById('stgc-a-ref');
  if(sr){const p=sr.value.split('|');referent=p[0]||null;creche=p[1]||null;}
  else creche=(document.getElementById('stgc-a-creche')||{}).value||null;
  if(!creche)return showBanner('Cette personne n\'a pas de crèche : choisissez-en une autre.','error');
  const notes=['Candidature reçue par le mur des candidatures.',
    c.date_debut||c.date_fin?'Période souhaitée : '+(c.date_debut?'du '+stgcFr(c.date_debut):'')+(c.date_fin?' au '+stgcFr(c.date_fin):'')+'.':'',
    c.notes||''].filter(Boolean).join('\n');
  const fiche=await dbInsert('stagiaires',{
    type_contrat:c.type_contrat,prenom:c.prenom,nom:c.nom,email:c.email,telephone:c.telephone,
    ecole:c.ecole,formation:c.formation,niveau:c.niveau,creche_id:creche,referent_id:referent,
    statut:'demande',demande_le:new Date().toISOString().slice(0,10),
    date_debut:c.date_debut,date_fin:c.date_fin,notes:notes});
  if(!fiche)return showBanner('Création de la fiche impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  const {error}=await sb.from('stagiaires_candidatures').update({statut:'attribuee',attribuee_creche:creche,attribuee_referent:referent,stagiaire_id:fiche.id}).eq('id',id);
  if(error)console.warn('[Candidatures] statut',error.message);
  closeModal('modal-stgc-attrib');
  if(typeof stgLoad==='function')await stgLoad();
  await stgcCharger();
  showBanner('Candidature attribuée : la fiche est créée dans « '+stgcCrecheNom(creche)+' » ✅');
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
