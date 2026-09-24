/* ══════════════════════════════════════════════════════════════════════════
   RÉUNIONS D'ÉQUIPE                                    (table reunions_equipe)

   Comptes rendus rédigés par les directeurs/trices techniques pour leur
   propre crèche (réunion d'équipe, famille, partenaire, PMI…). Distinct du
   suivi des réunions de direction (js/reunions-direction.js, tables
   actions_direction / reunions_direction) : on n'y touche pas ici.

   Un compte rendu est un brouillon modifiable jusqu'à sa validation. Une
   fois validé, il est figé côté base (trigger + RLS, voir
   sql/reunions_equipe_*.sql) : seule la direction peut le rouvrir, et cette
   réouverture est tracée (reouvert_le / reouvert_par), sans effacer la trace
   de la validation d'origine (valide_le / valide_par).
   ═════════════════════════════════════════════════════════════════════════ */

const REQ_TYPES={equipe:'Réunion d\'équipe',autre:'Autre'};

let reqCache=[],reqEditId=null,reqSchemaOk=true,reqFilterStatut='toutes',reqPhotos=[],reqCrVueId=null;

function reqEstMaCreche(r){return !isDirection&&currentProfile&&String(r.creche_id||'')===String(currentProfile.creche_id||'');}
function reqPeutModifier(r){
  if(!r)return true; // création
  if(r.statut==='valide')return isDirection; // seule la direction peut toucher un CR validé (le rouvrir)
  return isDirection||reqEstMaCreche(r);
}
function reqCrecheName(id){if(!id)return null;const c=(cacheCreches||[]).find(x=>String(x.id)===String(id));return c?c.name:null;}
function reqReferentName(id){if(!id)return null;const r=(cacheReferents||[]).find(x=>String(x.id)===String(id));return r?r.name:null;}
function reqTypeLabel(r){return r.type==='autre'?(r.type_autre||'Autre'):REQ_TYPES.equipe;}
function reqFmtDate(iso){if(!iso)return'';const d=new Date(iso+'T12:00:00');return isNaN(d)?'':d.toLocaleDateString('fr-FR');}
function reqFmtDateLongue(iso){
  if(!iso)return'';
  const d=new Date(iso+'T12:00:00');if(isNaN(d))return'';
  const j=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const m=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return j[d.getDay()]+' '+d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();
}
function reqFmtHoraire(iso){
  if(!iso)return'';
  const d=new Date(iso);if(isNaN(d))return'';
  return d.toLocaleDateString('fr-FR')+' à '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}

// ── Chargement ────────────────────────────────────────────────────────────

async function reqInit(){
  const selFC=document.getElementById('req-filter-creche');
  if(selFC){
    if(isDirection){
      selFC.style.display='';
      selFC.innerHTML='<option value="">Toutes les crèches</option>'+(cacheCreches||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr')).map(c=>'<option value="'+c.id+'">'+escHtml(c.name)+'</option>').join('');
    }else{
      selFC.style.display='none';selFC.value='';
    }
  }
  const selC=document.getElementById('req-f-creche');
  if(selC)selC.innerHTML=(cacheCreches||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr')).map(c=>'<option value="'+c.id+'">'+escHtml(c.name)+'</option>').join('');
  await reqLoad();
}

async function reqLoad(){
  const{data,error}=await sb.from('reunions_equipe').select('*').order('date_reunion',{ascending:false}).order('heure',{ascending:false});
  const warn=document.getElementById('req-schema-warn');
  reqSchemaOk=!error;
  if(!reqSchemaOk){
    if(warn){
      warn.style.display='block';
      warn.innerHTML='<strong><i class="ti ti-alert-triangle"></i> Réunions d\'équipe indisponibles.</strong> '
        +'Les scripts <code>sql/reunions_equipe_1_table.sql</code> à <code>_5_reouverture.sql</code> n\'ont peut-être pas '
        +'tous été exécutés sur Supabase, ou votre compte n\'a pas de fiche directeur/trice technique.<br>'
        +'<span style="opacity:.85">Détail : '+escHtml((error||{}).message||'')+'</span>';
    }
  }else if(warn){warn.style.display='none';}
  reqCache=data||[];
  reqRender();
}

// ── Liste / archive ──────────────────────────────────────────────────────

function reqSetFilterStatut(f){
  reqFilterStatut=f;
  ['toutes','brouillon','valide'].forEach(x=>{
    const c=document.getElementById('req-chip-'+x);
    if(c)c.classList.toggle('active',x===f);
  });
  reqRender();
}

function reqFiltered(){
  let l=reqCache.slice();
  if(reqFilterStatut!=='toutes')l=l.filter(r=>r.statut===reqFilterStatut);
  const c=(document.getElementById('req-filter-creche')||{}).value||'';
  const t=(document.getElementById('req-filter-type')||{}).value||'';
  const du=(document.getElementById('req-filter-du')||{}).value||'';
  const au=(document.getElementById('req-filter-au')||{}).value||'';
  const q=((document.getElementById('req-search')||{}).value||'').trim().toLowerCase();
  if(c)l=l.filter(r=>String(r.creche_id)===String(c));
  if(t)l=l.filter(r=>r.type===t);
  if(du)l=l.filter(r=>r.date_reunion>=du);
  if(au)l=l.filter(r=>r.date_reunion<=au);
  if(q)l=l.filter(r=>((r.contenu||'')+' '+(r.decisions||'')+' '+(r.participants||'')+' '+(r.excuses||'')+' '+(r.type_autre||'')).toLowerCase().includes(q));
  return l.sort((a,b)=>{
    if(a.date_reunion!==b.date_reunion)return a.date_reunion<b.date_reunion?1:-1;
    return String(b.heure||'').localeCompare(String(a.heure||''));
  });
}

function reqRender(){
  const box=document.getElementById('req-list');if(!box)return;
  const l=reqFiltered();
  if(!l.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-notebook"></i><p>'
      +(reqCache.length?'Aucun compte rendu ne correspond à ce filtre.':'Aucun compte rendu pour l\'instant. Cliquez sur « Nouveau compte rendu ».')
      +'</p></div>';
    return;
  }
  box.innerHTML=l.map(reqCardHtml).join('');
}

function reqCardHtml(r){
  const clos=r.statut==='valide';
  const creche=reqCrecheName(r.creche_id);
  const extrait=(r.contenu||'').trim().slice(0,180);
  return '<div class="dcard" style="border-left:4px solid '+(clos?'var(--green)':'var(--orange)')+'">'
    +'<div class="dmeta">'
      +'<div class="dtop">'
        +'<span class="dsubject">'+reqFmtDateLongue(r.date_reunion)+(r.heure?' — '+escHtml(r.heure):'')+'</span>'
        +'<span class="badge" style="background:'+(clos?'var(--green-light)':'var(--orange-light)')+';color:'+(clos?'var(--green)':'var(--orange-dark)')+'">'+(clos?'🔒 Validé':'✏️ Brouillon')+'</span>'
        +'<span class="badge b-ref">'+escHtml(reqTypeLabel(r))+'</span>'
        +(creche?'<span class="badge b-ref"><i class="ti ti-building" style="font-size:11px"></i> '+escHtml(creche)+'</span>':'')
      +'</div>'
      +(extrait?'<div class="dbody">'+escHtml(extrait)+((r.contenu||'').length>180?'…':'')+'</div>':'')
      +'<div class="dfoot">'
        +(r.participants?'<span class="meta-txt">Présents : '+escHtml(r.participants)+'</span>':'')
        +(clos&&r.valide_le?'<span class="meta-txt">validé le '+reqFmtDate(r.valide_le.slice(0,10))+(reqReferentName(r.valide_par)?' par '+escHtml(reqReferentName(r.valide_par)):'')+'</span>':'')
      +'</div>'
    +'</div>'
    +'<div class="dactions">'
      +'<button class="ibtn" title="Lire" onclick="reqOuvrirCR(\''+r.id+'\')"><i class="ti ti-eye"></i></button>'
      +(reqPeutModifier(r)?'<button class="ibtn" title="Modifier" onclick="reqOpenModal(\''+r.id+'\')"><i class="ti ti-edit"></i></button>':'')
      +(!clos&&(isDirection||reqEstMaCreche(r))?'<button class="ibtn del" title="Supprimer" onclick="reqSupprimer(\''+r.id+'\')"><i class="ti ti-trash"></i></button>':'')
    +'</div></div>';
}

async function reqSupprimer(id){
  const r=reqCache.find(x=>String(x.id)===String(id));if(!r)return;
  if(r.statut==='valide'){showBanner('Un compte rendu validé ne peut pas être supprimé.','error');return;}
  if(!confirm('Supprimer définitivement ce compte rendu du '+reqFmtDate(r.date_reunion)+' ?'))return;
  const{error}=await sb.from('reunions_equipe').delete().eq('id',id);
  if(error){showBanner('Suppression refusée : '+error.message,'error');return;}
  reqCache=reqCache.filter(x=>String(x.id)!==String(id));
  reqRender();
  showBanner('Compte rendu supprimé.');
}

// ── Création / modification ──────────────────────────────────────────────

function reqOpenModal(id){
  reqEditId=id||null;
  const r=id?reqCache.find(x=>String(x.id)===String(id)):null;
  const verrouille=r&&r.statut==='valide'&&!isDirection;

  document.getElementById('modal-req-title').textContent=r?('Compte rendu du '+reqFmtDate(r.date_reunion)):'Nouveau compte rendu';
  document.getElementById('req-f-locked-warn').style.display=verrouille?'':'none';

  document.getElementById('req-f-date').value=r?(r.date_reunion||''):todayStr();
  document.getElementById('req-f-heure').value=r?(r.heure||''):'';
  document.getElementById('req-f-type').value=r?(r.type||'equipe'):'equipe';
  document.getElementById('req-f-type-autre').value=r?(r.type_autre||''):'';
  document.getElementById('req-f-participants').value=r?(r.participants||''):'';
  document.getElementById('req-f-excuses').value=r?(r.excuses||''):'';
  document.getElementById('req-f-contenu').value=r?(r.contenu||''):'';
  document.getElementById('req-f-decisions').value=r?(r.decisions||''):'';
  document.getElementById('req-f-prochaine').value=r?(r.prochaine_reunion||''):'';
  reqTypeChange();

  const wrapC=document.getElementById('req-f-creche-wrap');
  if(wrapC){
    wrapC.style.display=isDirection?'':'none';
    if(isDirection)document.getElementById('req-f-creche').value=r&&r.creche_id?r.creche_id:(currentProfile?.creche_id||'');
  }

  // Formulaire verrouillé : lecture seule tant qu'on n'est pas direction.
  ['req-f-date','req-f-heure','req-f-type','req-f-type-autre','req-f-creche','req-f-participants','req-f-excuses','req-f-contenu','req-f-decisions','req-f-prochaine']
    .forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=verrouille;});
  document.getElementById('req-f-save-brouillon').style.display=verrouille?'none':'';
  document.getElementById('req-f-save-valide').style.display=verrouille?'none':'';

  reqPhotos=[];
  reqRenderPhotos();
  reqAnnulerTranscription();
  document.getElementById('req-photo-actions').style.display='none';

  document.getElementById('modal-req-wrap').classList.add('open');
}

function reqTypeChange(){
  const t=document.getElementById('req-f-type').value;
  document.getElementById('req-f-type-autre-wrap').style.display=t==='autre'?'':'none';
}

async function reqSave(statutCible){
  const dateR=document.getElementById('req-f-date').value;
  if(!dateR){showBanner('Indiquez la date de la réunion.','error');return;}
  const contenu=(document.getElementById('req-f-contenu').value||'').trim();
  const decisions=(document.getElementById('req-f-decisions').value||'').trim();
  if(statutCible==='valide'&&!contenu&&!decisions){
    showBanner('Ajoutez au moins un compte rendu ou des décisions avant de valider.','error');
    return;
  }
  const crecheId=isDirection?(document.getElementById('req-f-creche').value||null):(currentProfile?.creche_id||null);
  if(!crecheId){showBanner('Crèche introuvable pour ce compte.','error');return;}

  const ancien=reqEditId?reqCache.find(x=>String(x.id)===String(reqEditId)):null;
  const row={
    creche_id:crecheId,
    date_reunion:dateR,
    heure:(document.getElementById('req-f-heure').value||'').trim()||null,
    type:document.getElementById('req-f-type').value||'equipe',
    type_autre:document.getElementById('req-f-type').value==='autre'?((document.getElementById('req-f-type-autre').value||'').trim()||null):null,
    participants:(document.getElementById('req-f-participants').value||'').trim()||null,
    excuses:(document.getElementById('req-f-excuses').value||'').trim()||null,
    contenu:contenu||null,
    decisions:decisions||null,
    prochaine_reunion:document.getElementById('req-f-prochaine').value||null,
    statut:statutCible
  };
  if(!ancien)row.auteur_id=currentProfile?.id||null;
  if(statutCible==='valide'){
    row.valide_le=new Date().toISOString();
    row.valide_par=currentProfile?.id||null;
  }

  const btnB=document.getElementById('req-f-save-brouillon'),btnV=document.getElementById('req-f-save-valide');
  btnB.disabled=true;btnV.disabled=true;
  try{
    if(reqEditId){
      const{error}=await sb.from('reunions_equipe').update(row).eq('id',reqEditId);
      if(error)throw error;
      Object.assign(ancien,row);
      showBanner(statutCible==='valide'?'Compte rendu validé et archivé ✅':'Brouillon enregistré ✅');
    }else{
      const{data,error}=await sb.from('reunions_equipe').insert(row).select().single();
      if(error)throw error;
      reqCache.unshift(data);
      showBanner(statutCible==='valide'?'Compte rendu validé et archivé ✅':'Brouillon enregistré ✅');
    }
    closeModal('modal-req-wrap');
    reqEditId=null;
    reqRender();
  }catch(err){
    console.error('[reqSave]',err);
    showBanner('Enregistrement refusé : '+(err.message||'erreur inconnue'),'error');
  }finally{
    btnB.disabled=false;btnV.disabled=false;
  }
}

async function reqRouvrir(){
  if(!reqCrVueId)return;
  const r=reqCache.find(x=>String(x.id)===String(reqCrVueId));if(!r)return;
  if(!confirm('Rouvrir ce compte rendu validé ? Il redeviendra modifiable par la crèche concernée.'))return;
  const maj={statut:'brouillon',reouvert_le:new Date().toISOString(),reouvert_par:currentProfile?.id||null};
  const{error}=await sb.from('reunions_equipe').update(maj).eq('id',reqCrVueId);
  if(error){showBanner('Réouverture refusée : '+error.message,'error');return;}
  Object.assign(r,maj);
  closeModal('modal-req-cr-wrap');
  reqRender();
  showBanner('Compte rendu rouvert — il est de nouveau modifiable.');
}

// ── Photographier mes notes / transcription ──────────────────────────────

const REQ_PHOTO_MAX_COTE=1600;
const REQ_PHOTO_QUALITE=0.82;
const REQ_PHOTO_MAX=5;

function reqPhotoChange(ev){
  const files=Array.from(ev.target.files||[]);
  ev.target.value=''; // permet de reprendre la même photo juste après
  if(!files.length)return;
  if(reqPhotos.length+files.length>REQ_PHOTO_MAX){
    showBanner('Maximum '+REQ_PHOTO_MAX+' pages par transcription.','error');
    return;
  }
  files.forEach(f=>{
    reqRedimensionnerImage(f).then(dataUrl=>{
      reqPhotos.push(dataUrl);
      reqRenderPhotos();
    }).catch(err=>{
      console.error('[reqPhotoChange]',err);
      showBanner('Photo illisible, réessayez.','error');
    });
  });
}

function reqRedimensionnerImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error);
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('image invalide'));
      img.onload=()=>{
        let{width,height}=img;
        if(width>height&&width>REQ_PHOTO_MAX_COTE){height=Math.round(height*REQ_PHOTO_MAX_COTE/width);width=REQ_PHOTO_MAX_COTE;}
        else if(height>=width&&height>REQ_PHOTO_MAX_COTE){width=Math.round(width*REQ_PHOTO_MAX_COTE/height);height=REQ_PHOTO_MAX_COTE;}
        const canvas=document.createElement('canvas');
        canvas.width=width;canvas.height=height;
        canvas.getContext('2d').drawImage(img,0,0,width,height);
        resolve(canvas.toDataURL('image/jpeg',REQ_PHOTO_QUALITE));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function reqRenderPhotos(){
  const box=document.getElementById('req-photos-list');if(!box)return;
  box.innerHTML=reqPhotos.map((src,i)=>
    '<div style="position:relative;width:72px;height:72px">'
    +'<img src="'+src+'" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--border)">'
    +'<button type="button" class="ibtn del" style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;padding:0" onclick="reqRemovePhoto('+i+')"><i class="ti ti-x" style="font-size:12px"></i></button>'
    +'</div>'
  ).join('');
  document.getElementById('req-photo-actions').style.display=reqPhotos.length?'':'none';
}

function reqRemovePhoto(i){
  reqPhotos.splice(i,1);
  reqRenderPhotos();
}

async function reqTranscrire(){
  if(!reqPhotos.length)return;
  const btn=document.getElementById('req-btn-transcrire');
  btn.disabled=true;
  const texteOrig=btn.innerHTML;
  btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Transcription en cours…';
  try{
    const{data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)throw new Error('Session expirée, reconnectez-vous.');
    const r=await fetch(SUPABASE_URL+'/functions/v1/transcrire-notes',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':SUPABASE_ANON_KEY},
      body:JSON.stringify({images:reqPhotos})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));
    document.getElementById('req-transcription-zone').value=j.texte||'';
    document.getElementById('req-transcription-wrap').style.display='';
  }catch(err){
    console.error('[reqTranscrire]',err);
    showBanner('Transcription impossible : '+(err.message||'erreur inconnue'),'error');
  }finally{
    btn.disabled=false;
    btn.innerHTML=texteOrig;
  }
}

/* Jamais d'enregistrement automatique : la personne relit et choisit
   d'insérer — ou pas — le texte proposé. */
function reqInsererTranscription(){
  const zone=document.getElementById('req-transcription-zone');
  const texte=(zone.value||'').trim();
  if(!texte)return;
  const cible=document.getElementById('req-f-contenu');
  cible.value=(cible.value?cible.value.replace(/\s+$/,'')+'\n\n':'')+texte;
  reqAnnulerTranscription();
  reqPhotos=[];
  reqRenderPhotos();
}

function reqAnnulerTranscription(){
  const zone=document.getElementById('req-transcription-zone');
  if(zone)zone.value='';
  const wrap=document.getElementById('req-transcription-wrap');
  if(wrap)wrap.style.display='none';
}

// ── Lecture / export PDF ─────────────────────────────────────────────────

function reqOuvrirCR(id){
  const r=reqCache.find(x=>String(x.id)===String(id));if(!r)return;
  reqCrVueId=id;
  document.getElementById('req-cr-title').textContent='Réunion du '+reqFmtDateLongue(r.date_reunion);
  document.getElementById('req-cr-body').innerHTML=reqCRHtml(r);
  document.getElementById('req-cr-reouvrir-wrap').style.display=(isDirection&&r.statut==='valide')?'':'none';
  document.getElementById('modal-req-cr-wrap').classList.add('open');
}

function reqCRHtml(r){
  const h2=t=>'<h2 style="font-size:14px;color:#3D3580;margin:16px 0 6px">'+t+'</h2>';
  const vide=t=>'<p style="color:#888;font-style:italic;font-size:12px">'+t+'</p>';
  const texte=t=>'<div style="white-space:pre-wrap;font-size:12.5px;line-height:1.55">'+escHtml(t)+'</div>';
  const creche=reqCrecheName(r.creche_id);

  let etat;
  if(r.statut==='valide')etat='Validé le '+reqFmtDate((r.valide_le||'').slice(0,10))+(reqReferentName(r.valide_par)?' par '+escHtml(reqReferentName(r.valide_par)):'')+'.';
  else if(r.reouvert_le)etat='Brouillon — rouvert le '+reqFmtDate((r.reouvert_le||'').slice(0,10))+(reqReferentName(r.reouvert_par)?' par '+escHtml(reqReferentName(r.reouvert_par)):'')+(r.valide_le?' (validé une première fois le '+reqFmtDate((r.valide_le||'').slice(0,10))+')':'')+'.';
  else etat='Brouillon — non validé.';

  return '<div style="font-size:12.5px">'
    +'<table style="font-size:12.5px;margin-bottom:6px"><tbody>'
      +'<tr><td style="padding:2px 10px 2px 0;color:#888">Date</td><td><strong>'+reqFmtDateLongue(r.date_reunion)+(r.heure?' — '+escHtml(r.heure):'')+'</strong></td></tr>'
      +(creche?'<tr><td style="padding:2px 10px 2px 0;color:#888">Crèche</td><td>'+escHtml(creche)+'</td></tr>':'')
      +'<tr><td style="padding:2px 10px 2px 0;color:#888">Type</td><td>'+escHtml(reqTypeLabel(r))+'</td></tr>'
      +'<tr><td style="padding:2px 10px 2px 0;color:#888">Présents</td><td>'+escHtml(r.participants||'—')+'</td></tr>'
      +'<tr><td style="padding:2px 10px 2px 0;color:#888">Excusés</td><td>'+escHtml(r.excuses||'—')+'</td></tr>'
    +'</tbody></table>'
    +'<p style="font-size:11px;color:#888;font-style:italic;margin:2px 0 10px">'+etat+'</p>'
    +h2('Compte rendu')+((r.contenu||'').trim()?texte(r.contenu):vide('—'))
    +h2('Décisions')+((r.decisions||'').trim()?texte(r.decisions):vide('—'))
    +h2('Prochaine réunion')+'<p style="font-size:12.5px">'+(r.prochaine_reunion?reqFmtDateLongue(r.prochaine_reunion):'à fixer')+'</p>'
    +'</div>';
}

/* Impression via une iframe cachée : même mécanique que reunions-direction
   (adExportCR) — fonctionne sur tablette là où window.open est bloqué. */
function reqExportCR(){
  if(!reqCrVueId)return;
  const r=reqCache.find(x=>String(x.id)===String(reqCrVueId));if(!r)return;
  const html='<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">'
    +'<title>CR réunion — '+reqFmtDate(r.date_reunion)+'</title><style>'
    +'*{margin:0;padding:0;box-sizing:border-box}'
    +'body{font-family:Arial,sans-serif;color:#111;padding:24px;max-width:800px;margin:0 auto}'
    +'h1{font-size:1.35rem;color:#3D3580;margin-bottom:2px}'
    +'.sub{font-size:.8rem;color:#666;margin-bottom:12px}'
    +'.footer{margin-top:22px;font-size:10px;color:#888;border-top:1px solid #E7E5E0;padding-top:8px}'
    +'@media print{@page{margin:1.4cm;size:portrait}body{padding:0}h2{page-break-after:avoid}}'
    +'*{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}'
    +'</style></head><body>'
    +'<h1>Compte rendu de réunion</h1>'
    +'<div class="sub">Koala Kids · '+escHtml(reqCrecheName(r.creche_id)||'')+' · '+reqFmtDateLongue(r.date_reunion)+'</div>'
    +reqCRHtml(r)
    +'<div class="footer">Document généré le '+new Date().toLocaleDateString('fr-FR')+' à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' — Koala Kids</div>'
    +'</body></html>';
  const old=document.getElementById('_print-frame-req');if(old)old.remove();
  const iframe=document.createElement('iframe');
  iframe.id='_print-frame-req';
  iframe.style.cssText='position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  doc.open();doc.write(html);doc.close();
  iframe.onload=()=>{try{iframe.contentWindow.focus();iframe.contentWindow.print();}catch(e){showBanner('Erreur impression : '+e.message,'error');}};
}
