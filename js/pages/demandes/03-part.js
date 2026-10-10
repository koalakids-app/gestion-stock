async function deleteMessageBrouillon(){
  const bd=msgBrouillonDe(currentThreadId);
  if(!bd)return;
  if(!confirm('Supprimer ce brouillon ?'))return;
  if(!await dbDeleteStrict('messages_brouillons',bd.id)){showBanner('Suppression impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
  cacheMessageBrouillons=cacheMessageBrouillons.filter(b=>b.id!==bd.id);
  document.getElementById('thread-input').value='';
  msgSetPending('thread',[]);
  document.getElementById('thread-draft-note').style.display='none';
  renderDemandsOnly();
}
async function sendThreadMessage(){
  const inp=document.getElementById('thread-input');const body=inp.value.trim();
  if((!body&&!msgPending.thread.length)||!currentThreadId)return;
  const btn=document.getElementById('btn-send-msg');btn.disabled=true;
  const d0=cacheDemandes.find(x=>x.id===currentThreadId);
  const toutes=document.getElementById('thread-all-wrap').style.display!=='none'&&document.getElementById('thread-all').checked;
  const cibles=toutes?demandesDuGroupe(d0):[d0];
  let savedCourant=null,nbErr=0;
  for(const d of cibles){
    const row={demande_id:d.id,author_id:currentProfile?.id||null,author_name:currentProfile?.name||'Moi',body:body,...msgAttCols(msgPending.thread)};
    const saved=await dbInsert('messages',row);
    if(!saved){nbErr++;continue;}
    cacheMessages.push(saved);
    if(d.id===currentThreadId)savedCourant=saved;
    // Destinataire de la notif (push) : l'autre partie de la demande.
    // Si l'auteur du message est le destinataire de la demande, on notifie l'émetteur
    // (d.referent_id, renseigné à la création — cf. sendNewDemand) et inversement.
    // Pour les demandes créées avant l'ajout de cette colonne, on retombe sur
    // l'ancienne heuristique : le dernier message du fil posté par quelqu'un d'autre.
    let pushDestId=null;
    if(currentProfile?.id!==d.to_referent_id){
      pushDestId=d.to_referent_id||null;
    }else if(d.referent_id){
      pushDestId=d.referent_id;
    }else{
      const precedents=cacheMessages.filter(m=>m.demande_id===d.id&&m.id!==saved.id&&m.author_id&&m.author_id!==currentProfile?.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      pushDestId=precedents[0]?.author_id||null;
    }
    // Notification par push uniquement (plus d'e-mail pour les demandes).
    if(pushDestId){await callFn('notify-push',{referent_ids:[pushDestId],title:'Nouveau message',body:body,url:'./demandes.html',tag:'message-'+saved.id});}
  }
  if(savedCourant||cibles.length>nbErr){
    inp.value='';
    // Le brouillon de ce fil a rempli son rôle : on le retire.
    const bd=msgBrouillonDe(currentThreadId);
    if(bd){
      await dbDelete('messages_brouillons',bd.id);
      cacheMessageBrouillons=cacheMessageBrouillons.filter(b=>b.id!==bd.id);
      document.getElementById('thread-draft-note').style.display='none';
    }
    msgSetPending('thread',[]);
    renderThread();renderDemandsOnly();
    if(nbErr)showBanner(nbErr+' envoi(s) en erreur.','error');
  }
  else showBanner('Erreur envoi'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  btn.disabled=false;inp.focus();
}

/* Brouillons de consignes : préparés ici, envoyés plus tard. Stockés dans
   `consignes_brouillons` (sql/consignes_brouillons.sql), jamais dans `demandes` :
   une consigne de `demandes` est lue par tous les directeurs/trices techniques
   dès sa création. cDraftId = brouillon en cours d'édition dans la fenêtre. */
let cacheConsigneBrouillons=[],cDraftId=null;

function openConsigneModal(draft){
  cDraftId=draft?draft.id:null;
  document.getElementById('c-subj').value=draft?(draft.subject||''):'';
  document.getElementById('c-msg').value=draft?(draft.description||''):'';
  document.getElementById('c-prio').value=draft?(draft.priority||'normal'):'normal';
  msgSetPending('c',draft?msgAttList(draft):[]);
  document.getElementById('c-title').textContent=draft?'Brouillon de consigne':'Envoyer une consigne';
  document.getElementById('modal-consigne-wrap').classList.add('open');
}
async function saveConsigne(){
  const subj=document.getElementById('c-subj').value.trim(),msg=document.getElementById('c-msg').value.trim();
  if(!subj||!msg){alert('Le sujet et le message sont requis.');return;}
  const btn=document.getElementById('btn-save-consigne');btn.disabled=true;
  // referent_id = expéditeur (lu par demandeDeNom pour l'affichage « De ») ;
  // destinataires_noms = libellé « À » (une consigne part à tous, sans referent_name).
  const row={creche_id:null,referent_id:currentProfile?.id||null,destinataires_noms:'Tous les directeurs/trices techniques',referent_name:'',referent_email:'',subject:subj,description:msg,priority:document.getElementById('c-prio').value,status:'envoyee',type:'consigne',...msgAttCols(msgPending.c)};
  const saved=await dbInsert('demandes',row);
  if(saved){
    cacheDemandes.unshift(saved);
    // Push + cloche in-app uniquement (plus d'e-mail pour les consignes) ; les comptes
    // direction autres que l'expéditeur sont notifiés aussi.
    const pushIds=cacheReferents.filter(r=>(r.role==='referent'||r.role==='direction')&&r.id!==currentProfile?.id).map(r=>r.id);
    if(pushIds.length){await callFn('notify-push',{referent_ids:pushIds,title:'Nouvelle consigne',body:subj,url:'./demandes.html',tag:'consigne-'+saved.id});}
    // Le brouillon d'origine a rempli son rôle : on le retire.
    if(cDraftId){
      await dbDelete('consignes_brouillons',cDraftId);
      cacheConsigneBrouillons=cacheConsigneBrouillons.filter(b=>b.id!==cDraftId);
      cDraftId=null;
    }
    showBanner('Consigne envoyée à tous les directeurs/trices techniques !');closeModal('modal-consigne-wrap');renderCrecheTabs();}
  else showBanner('Erreur.','error');
  btn.disabled=false;
}
// Enregistre la consigne en cours de rédaction sans l'envoyer (sujet OU message suffit).
async function saveConsigneBrouillon(){
  const subj=document.getElementById('c-subj').value.trim(),msg=document.getElementById('c-msg').value.trim();
  if(!subj&&!msg){alert('Écrivez au moins un sujet ou un message avant d\'enregistrer le brouillon.');return;}
  const btn=document.getElementById('btn-draft-consigne');btn.disabled=true;
  const row={subject:subj||null,description:msg||null,priority:document.getElementById('c-prio').value,
    ...msgAttCols(msgPending.c),updated_at:new Date().toISOString()};
  let ok=false;
  if(cDraftId){
    ok=await dbUpdate('consignes_brouillons',cDraftId,row);
    if(ok)cacheConsigneBrouillons=cacheConsigneBrouillons.map(b=>b.id===cDraftId?Object.assign({},b,row):b);
  }else{
    const saved=await dbInsert('consignes_brouillons',Object.assign({created_by:currentUser.id},row));
    if(saved){ok=true;cacheConsigneBrouillons.unshift(saved);}
  }
  btn.disabled=false;
  if(!ok){showBanner('Brouillon non enregistré'+(window._lastDbError?' : '+window._lastDbError:'')+'. La table consignes_brouillons existe-t-elle ?','error');return;}
  cDraftId=null;
  cacheConsigneBrouillons.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  closeModal('modal-consigne-wrap');
  showBanner('Brouillon enregistré');
  renderCrecheTabs();
}
// Liste des brouillons : reprendre (rouvre la fenêtre pré-remplie) ou supprimer.
function openConsigneBrouillons(){
  let ov=document.getElementById('modal-cbrouillons-wrap');
  if(!ov){
    ov=document.createElement('div');
    ov.className='overlay';ov.id='modal-cbrouillons-wrap';
    ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-cbrouillons-wrap');};
    ov.innerHTML='<div class="modal" style="max-width:520px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">'
      +'<h3 style="margin:0"><i class="ti ti-file-pencil"></i> Brouillons de consignes</h3>'
      +'<button class="btn-cancel" onclick="closeModal(\'modal-cbrouillons-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
      +'<div id="cbrouillons-liste"></div></div>';
    document.body.appendChild(ov);
  }
  renderConsigneBrouillons();
  ov.classList.add('open');
}
function renderConsigneBrouillons(){
  const box=document.getElementById('cbrouillons-liste');
  if(!box)return;
  if(!cacheConsigneBrouillons.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-file-pencil"></i><p>Aucun brouillon.<br><span style="font-size:12px">Dans « Envoyer une consigne », le bouton « Enregistrer en brouillon » garde un message à envoyer plus tard.</span></p></div>';
    return;
  }
  box.innerHTML=cacheConsigneBrouillons.map(function(b){
    const quand=b.updated_at?new Date(b.updated_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    const apercu=String(b.description||'').slice(0,110);
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:8px"><b style="flex:1;font-size:13.5px">'+escHtml(b.subject||'(sans sujet)')+'</b>'
      +(b.priority==='urgent'?'<span class="badge b-consigne">Urgente</span>':'')+'</div>'
      +'<div style="font-size:12px;color:var(--muted);margin:3px 0 8px">'+escHtml(apercu)+(String(b.description||'').length>110?'…':'')+(msgAttList(b).length?' · 📎 '+msgAttList(b).map(a=>escHtml(a.name||'Pièce jointe')).join(', '):'')+'</div>'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--muted);flex:1">Modifié le '+escHtml(quand)+'</span>'
      +'<button class="btn-cancel" data-id="'+b.id+'" onclick="deleteConsigneBrouillon(this.dataset.id)"><i class="ti ti-trash"></i> Supprimer</button>'
      +'<button class="btn-primary" data-id="'+b.id+'" onclick="reprendreConsigneBrouillon(this.dataset.id)"><i class="ti ti-edit"></i> Reprendre</button></div></div>';
  }).join('');
}
function reprendreConsigneBrouillon(id){
  const b=cacheConsigneBrouillons.find(x=>x.id===id);
  if(!b)return;
  closeModal('modal-cbrouillons-wrap');
  openConsigneModal(b);
}
async function deleteConsigneBrouillon(id){
  if(!confirm('Supprimer ce brouillon ?'))return;
  if(!await dbDeleteStrict('consignes_brouillons',id)){showBanner('Suppression impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
  cacheConsigneBrouillons=cacheConsigneBrouillons.filter(b=>b.id!==id);
  renderConsigneBrouillons();
  renderCrecheTabs();
}

// CRECHES

// REFERENTS
async function renderReferents(){
  const grid=document.getElementById('ref-grid');if(!grid)return;
  const refs=cacheReferents.filter(r=>r.role==='referent'||r.role==='direction');
  if(!refs.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-users"></i><p>Aucun/une directeur/trice technique.</p></div>';return;}
  grid.innerHTML=refs.map(r=>{const creche=cacheCreches.find(c=>c.id===r.creche_id);const empLie=r.employe_id?cacheEmployes.find(e=>e.id===r.employe_id):null;const contratTxt=empLie?[empLie.type_contrat,empLie.temps_travail==='temps_partiel'?'Temps partiel':empLie.temps_travail==='temps_plein'?'Temps plein':''].filter(Boolean).join(' · '):'';const initials=r.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);const isDir=r.role==='direction';const avatarBg=isDir?'var(--orange)':'var(--koala)';const roleBadge=isDir?'<span style="display:inline-flex;align-items:center;gap:3px;background:var(--orange-light);color:var(--orange-dark);font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:4px">🔑 Direction</span>':'';return'<div class="ref-card"><div class="ref-card-top"><div class="ref-avatar" style="background:'+avatarBg+'">'+initials+'</div><div style="flex:1;min-width:0"><div class="ref-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">'+r.name+roleBadge+'</div><div class="ref-detail"><i class="ti ti-briefcase" style="font-size:11px"></i> '+(r.poste||'Directeur/trice technique')+'</div><div class="ref-detail"><i class="ti ti-building" style="font-size:11px"></i> '+(creche?.name||'—')+'</div><div class="ref-detail"><i class="ti ti-mail" style="font-size:11px"></i> '+(r.email||'—')+'</div><div class="ref-detail"><i class="ti ti-device-tablet" style="font-size:11px"></i> Pointage : '+kkPictosLigne(r.code_pictos)+'</div>'+heuresValideesLigne(r.id,'referent')+(empLie?'<div class="ref-detail"><i class="ti ti-file-certificate" style="font-size:11px"></i> '+(contratTxt?escHtml(contratTxt):'Contrat non renseigné')+' <button type="button" class="btn-sm" style="margin-left:6px;padding:2px 8px;font-size:10.5px" onclick="editEmploye(\''+empLie.id+'\')"><i class="ti ti-external-link"></i> Voir la fiche Collaborateur/trice</button></div>':'')+'</div></div><div class="ref-actions"><button class="btn-primary" style="font-size:12px" onclick="resetPassword(\''+r.id+'\')" title="Envoie un e-mail avec un lien pour définir ou réinitialiser son mot de passe"><i class="ti ti-key" style="font-size:12px"></i> Envoyer le lien de connexion</button><button class="ibtn" onclick="editRef(\''+r.id+'\')"><i class="ti ti-edit"></i></button><button class="ibtn del" onclick="deleteRef(\''+r.id+'\')"><i class="ti ti-trash"></i></button></div>'+(r.creche_id?'<div style="margin:0 14px 12px;padding-top:10px;border-top:1px dashed var(--border)"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);display:flex;align-items:center;gap:4px;margin-bottom:6px"><i class="ti ti-device-tablet" style="font-size:12px"></i> Code image (tablette) — sans rapport avec la connexion</div><div style="display:flex;gap:6px;flex-wrap:wrap">'+kkPictosActions(r.id,r.creche_id,r.code_pictos,'referent')+'</div></div>':'')+'</div>';}).join('');
}
/* Fiches Employé(e) proposées au lien : pas déjà liées à un autre directeur
   technique (l'index unique referents.employe_id le refuserait de toute
   façon), en gardant celle déjà liée à CE référent en tête de liste même si
   sa crèche a changé entretemps. */
function refFillEmployeSelect(selectedEmployeId){
  const sel=document.getElementById('r-employe');if(!sel)return;
  const dejaLies=new Set(cacheReferents.filter(r=>r.employe_id&&r.id!==editingRefId).map(r=>r.employe_id));
  const options=cacheEmployes.filter(e=>!dejaLies.has(e.id)).map(e=>{
    const creche=cacheCreches.find(c=>c.id===e.creche_id);
    return '<option value="'+e.id+'"'+(e.id===selectedEmployeId?' selected':'')+'>'+escHtml((e.prenom||'')+' '+(e.nom||''))+(creche?' — '+escHtml(creche.name):'')+'</option>';
  }).join('');
  sel.innerHTML='<option value="">-- Aucune --</option>'+options;
}
function openRefModal(){editingRefId=null;['r-name','r-email','r-poste'].forEach(id=>document.getElementById(id).value='');document.getElementById('r-is-direction').checked=false;document.getElementById('r-creche').innerHTML='<option value="">-- Choisir --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');refFillEmployeSelect('');document.getElementById('modal-ref-title').textContent='Ajouter un/une directeur/trice technique';document.getElementById('modal-ref-wrap').classList.add('open');}
function editRef(id){const r=cacheReferents.find(x=>x.id===id);if(!r)return;editingRefId=id;document.getElementById('r-name').value=r.name;document.getElementById('r-email').value=r.email||'';document.getElementById('r-poste').value=r.poste||'';document.getElementById('r-is-direction').checked=(r.role==='direction');document.getElementById('r-creche').innerHTML='<option value="">-- Choisir --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'"'+(c.id===r.creche_id?' selected':'')+'>'+c.name+'</option>').join('');refFillEmployeSelect(r.employe_id||'');document.getElementById('modal-ref-title').textContent='Modifier le/la directeur/trice technique';document.getElementById('modal-ref-wrap').classList.add('open');}
async function saveRef(){
  const name=document.getElementById('r-name').value.trim(),email=document.getElementById('r-email').value.trim();
  if(!name||!email){alert('Nom et email requis.');return;}
  const crecheVal=document.getElementById('r-creche').value;
  const employeVal=document.getElementById('r-employe')?.value||'';
  const row={name,email,poste:document.getElementById('r-poste').value.trim(),creche_id:crecheVal||null,role:document.getElementById('r-is-direction').checked?'direction':'referent',employe_id:employeVal||null};
  if(editingRefId){
    const ok=await dbUpdate('referents',editingRefId,row);
    if(ok){const r=cacheReferents.find(x=>x.id===editingRefId);if(r)Object.assign(r,row);showBanner('Directeur/trice technique modifié ✅');}
    else{showBanner('Erreur modification','error');return;}
  }
  else{
    const redirect=location.href.replace(/demandes\.html.*$/,'demandes.html');
    const ok=await callFn('create-referent',{email,name,creche_id:row.creche_id,poste:row.poste,role:row.role,redirect_to:redirect});
    if(ok){
      await loadAllData();
      /* create-referent ne connaît pas encore le lien employe_id (hors de son
         périmètre) : posé ensuite en une mise à jour séparée si renseigné. */
      if(employeVal){
        const created=cacheReferents.find(r=>r.email===email);
        if(created)await dbUpdate('referents',created.id,{employe_id:employeVal});
      }
      showBanner('Invitation envoyée à '+name+' !');
    }
    else{showBanner('Échec de l\'invitation'+(_lastFnErr?' : '+_lastFnErr:''),'error');return;}
  }
  closeModal('modal-ref-wrap');renderReferents();
}
async function deleteRef(id){if(!confirm('Supprimer ce/cette directeur/trice technique ?'))return;const ok=await callFn('delete-referent',{referent_id:id});if(ok){cacheReferents=cacheReferents.filter(r=>r.id!==id);renderReferents();showBanner('Directeur/trice technique supprimé.');}else showBanner(_lastFnErr||'Erreur lors de la suppression.','error');}

// EMPLOYÉS (personnel sans compte de connexion — table `employes`, cf. sql/module_employes.sql)
let editingEmployeId=null;
let empHeuresSemaine={};   // {employe_id: heures pointées depuis lundi} — cf. empChargerHeuresSemaine()
// Onglets par crèche, même principe que creche-tabs-bar du module Demandes
// (nom de variable/fonctions distinct pour ne pas entrer en collision avec lui).
let activeEmployeCrecheId='all';
function renderEmployeCrecheTabs(){
  const bar=document.getElementById('employe-creche-tabs-bar');if(!bar)return;
  if(!isDirection){bar.style.display='none';return;}
  if(!cacheCreches.length){activeEmployeCrecheId='all';}
  else if(activeEmployeCrecheId!=='all'&&!cacheCreches.find(c=>c.id===activeEmployeCrecheId)){activeEmployeCrecheId='all';}
  let html='<button class="creche-tab'+(activeEmployeCrecheId==='all'?' active':'')+'" onclick="selectEmployeCreche(\'all\')"><i class="ti ti-building-community" style="font-size:13px"></i> Toutes<span class="tab-count">'+cacheEmployes.length+'</span></button>';
  cacheCreches.forEach(c=>{const count=cacheEmployes.filter(e=>e.creche_id===c.id).length;html+='<button class="creche-tab'+(activeEmployeCrecheId===c.id?' active':'')+'" onclick="selectEmployeCreche(\''+c.id+'\')"><i class="ti ti-building" style="font-size:13px"></i> '+c.name+'<span class="tab-count">'+count+'</span></button>';});
  bar.style.display='';bar.innerHTML=html;
}
function selectEmployeCreche(id){activeEmployeCrecheId=id;renderEmployes();}
function renderEmployes(){
  const grid=document.getElementById('employe-grid');if(!grid)return;
  renderEmployeCrecheTabs();
  const list=isDirection
    ?(activeEmployeCrecheId==='all'?cacheEmployes:cacheEmployes.filter(e=>e.creche_id===activeEmployeCrecheId))
    :cacheEmployes.filter(e=>e.creche_id===currentProfile?.creche_id);
  if(!list.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-id-badge-2"></i><p>Aucun(e) collaborateur/trice.</p></div>';return;}
  grid.innerHTML=list.map(e=>{
    const creche=cacheCreches.find(c=>c.id===e.creche_id);
    const initials=((e.prenom||'')+' '+(e.nom||'')).trim().split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?';
    const contratTxt=[e.type_contrat,e.temps_travail==='temps_partiel'?'Temps partiel':e.temps_travail==='temps_plein'?'Temps plein':''].filter(Boolean).join(' · ');
    return '<div class="ref-card"><div class="ref-card-top"><div class="ref-avatar" style="background:var(--muted)">'+initials+'</div><div style="flex:1;min-width:0"><div class="ref-name">'+escHtml((e.prenom||'')+' '+(e.nom||''))+'</div><div class="ref-detail"><i class="ti ti-briefcase" style="font-size:11px"></i> '+escHtml(e.poste||'Collaborateur/trice')+'</div><div class="ref-detail"><i class="ti ti-building" style="font-size:11px"></i> '+(creche?.name||'—')+'</div>'+(e.email?'<div class="ref-detail"><i class="ti ti-mail" style="font-size:11px"></i> '+escHtml(e.email)+'</div>':'')+(contratTxt?'<div class="ref-detail"><i class="ti ti-file-certificate" style="font-size:11px"></i> '+escHtml(contratTxt)+'</div>':'<div class="ref-detail" style="color:var(--red)"><i class="ti ti-alert-triangle" style="font-size:11px"></i> Contrat non renseigné</div>')+'<div class="ref-detail"><i class="ti ti-device-tablet" style="font-size:11px"></i> Pointage : '+kkPictosLigne(e.code_pictos)+'</div>'+empHeuresLigne(e)+heuresValideesLigne(e.id,'employe')+'</div></div><div class="ref-actions"><button class="ibtn" onclick="editEmploye(\''+e.id+'\')"><i class="ti ti-edit"></i></button><button class="ibtn del" onclick="deleteEmploye(\''+e.id+'\')"><i class="ti ti-trash"></i></button></div>'+(e.creche_id?'<div style="margin:0 14px 12px;padding-top:10px;border-top:1px dashed var(--border)"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);display:flex;align-items:center;gap:4px;margin-bottom:6px"><i class="ti ti-device-tablet" style="font-size:12px"></i> Code image (tablette)</div><div style="display:flex;gap:6px;flex-wrap:wrap">'+kkPictosActions(e.id,e.creche_id,e.code_pictos,'employe')+'</div></div>':'')+'</div>';
  }).join('');
}

/* Heures pointées (via `pointages.employe_id`) depuis lundi 00:00, comparées
   à `heures_hebdo` du contrat. Purement informatif — un CDD à temps partiel
   commencé en cours de semaine, une régularisation manuelle des pointages...
   il y a trop de cas légitimes d'écart pour que ce soit autre chose qu'un
   signal, jamais un blocage. */
/* Dernier mois validé par signature électronique (table posée par
   sql/validation_heures_mensuelle.sql) — signé par le/la collaborateur/trice
   ou la directrice technique elle-même depuis "Mon espace" (collaborateur.html),
   jamais saisi ici. */
function heuresValideesLigne(id,type){
  const rows=cacheHeuresValidations.filter(v=>type==='referent'?v.referent_id===id:v.employe_id===id);
  if(!rows.length)return'';
  rows.sort((a,b)=>(b.annee-a.annee)||(b.mois-a.mois));
  const v=rows[0];
  const moisTxt=new Date(v.annee,v.mois-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const moisCap=moisTxt.charAt(0).toUpperCase()+moisTxt.slice(1);
  const d=new Date(v.signe_le).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  return '<div class="ref-detail"><i class="ti ti-file-signature" style="font-size:11px"></i> Heures validées jusqu\'à '
    +moisCap+' ('+Number(v.heures_realisees).toFixed(1)+' h, signé le '+d+')</div>';
}
function empHeuresLigne(e){
  const h=empHeuresSemaine[e.id];
  if(h==null)return'';
  const pointees=Math.round(h*10)/10;
  if(!e.heures_hebdo){
    return '<div class="ref-detail"><i class="ti ti-clock" style="font-size:11px"></i> '+pointees+' h pointées cette semaine</div>';
  }
  const ecart=pointees-e.heures_hebdo;
  const ok=Math.abs(ecart)<=Math.max(1,e.heures_hebdo*0.1);
  const ecartTxt=ok?'':' ('+(ecart>0?'+':'')+(Math.round(ecart*10)/10)+' h)';
  return '<div class="ref-detail" style="color:'+(ok?'var(--green)':'var(--orange-dark)')+'"><i class="ti ti-clock" style="font-size:11px"></i> '
    +pointees+' h / '+e.heures_hebdo+' h contrat cette semaine'+ecartTxt+'</div>';
}

/* Une seule requête pour toutes les crèches visibles, appelée à l'ouverture
   de l'onglet — pas à chaque rendu, pour ne pas interroger `pointages` en
   boucle. Semaine en cours, lundi 00:00 → dimanche 24:00. */
async function empChargerHeuresSemaine(){
  const list=isDirection?cacheEmployes:cacheEmployes.filter(e=>e.creche_id===currentProfile?.creche_id);
  const crecheIds=[...new Set(list.map(e=>e.creche_id).filter(Boolean))];
  if(!crecheIds.length)return;
  const debut=mondayOfISO(todayStr());
  const finD=new Date(debut+'T00:00:00');finD.setDate(finD.getDate()+7);
  const fin=ipDateToLocalISO(finD);
  const{data,error}=await sb.from('pointages').select('employe_id,action,horodatage')
    .in('creche_id',crecheIds).not('employe_id','is',null)
    .gte('horodatage',debut+'T00:00:00').lt('horodatage',fin+'T00:00:00')
    .order('horodatage',{ascending:true});
  if(error){console.warn('[empChargerHeuresSemaine]',error);return;}
  const parEmploye={};
  (data||[]).forEach(p=>{(parEmploye[p.employe_id]=parEmploye[p.employe_id]||[]).push(p);});
  const heures={};
  Object.keys(parEmploye).forEach(id=>{
    let total=0,derniereArrivee=null;
    parEmploye[id].forEach(ev=>{
      if(ev.action==='arrivee')derniereArrivee=new Date(ev.horodatage);
      else if(ev.action==='depart'&&derniereArrivee){
        total+=(new Date(ev.horodatage)-derniereArrivee)/3600000;
        derniereArrivee=null;
      }
    });
    heures[id]=total;
  });
  empHeuresSemaine=heures;
  renderEmployes();
}
window.renderEmployes=renderEmployes;

function empFillCreches(selectedId){
  const sel=document.getElementById('emp-creche');if(!sel)return;
  const maCreche=currentProfile?.creche_id||null;
  const list=isDirection?cacheCreches:cacheCreches.filter(c=>c.id===maCreche);
  const cible=selectedId||(isDirection?null:maCreche);
  sel.innerHTML=(isDirection?'<option value="">-- Choisir --</option>':'')+list.map(c=>'<option value="'+c.id+'"'+(c.id===cible?' selected':'')+'>'+c.name+'</option>').join('');
  sel.disabled=!isDirection;
  sel.style.background=isDirection?'':'#f4f4f8';
  sel.style.cursor=isDirection?'':'not-allowed';
}

/* Champs texte de la fiche employé (état civil + contrat de travail),
   au-delà de prénom/nom/poste/email/crèche gérés à part. */
const EMP_TEXT_FIELDS=[
  ['emp-date-naissance','date_naissance'],['emp-lieu-naissance','lieu_naissance'],
  ['emp-nationalite','nationalite'],['emp-numero-secu','numero_secu'],
  ['emp-adresse','adresse'],['emp-telephone','telephone'],
  ['emp-type-contrat','type_contrat'],['emp-qualification','qualification'],
  ['emp-date-debut','date_debut'],['emp-date-fin','date_fin'],
  ['emp-motif-cdd','motif_cdd'],['emp-periode-essai','periode_essai'],
  ['emp-temps-travail','temps_travail'],
  ['emp-convention','convention_collective'],['emp-coefficient','coefficient'],
  ['emp-lieu-travail','lieu_travail']
];
const EMP_NUM_FIELDS=[['emp-heures-hebdo','heures_hebdo'],['emp-salaire-brut','salaire_brut']];

/* Fin de la période d'essai.
   CDI (ou type non défini) : 2 mois après la date de début, 4 mois si
   renouvelée une fois.
   CDD (art. L1242-10 du Code du travail) : 1 jour par semaine de contrat,
   plafonné à 2 semaines si le contrat dure 6 mois au plus, 1 mois au-delà ;
   pas de renouvellement. Sans date de fin (terme imprécis), la durée minimale
   n'est pas connue : on retient le plafond de 2 semaines.
   Dans les deux cas, la fin est ensuite reportée de la durée des fermetures
   "vacances" (etablissements.jours_fermeture / reseau_config.jours_fermeture_reseau)
   qui tombent dans la période — un congé pendant lequel la crèche est fermée
   suspend l'essai comme n'importe quelle absence. En boucle car repousser la
   fin peut faire entrer une nouvelle fermeture dans la fenêtre (ex : la fin
   recalculée tombe juste avant les vacances de la Toussaint). Même règle
   côté client (affichage immédiat dans la fiche) que côté base (trigger
   kk_trg_set_periode_essai_fin, cf. sql/employes_periode_essai_fin_cdd.sql),
   pour ne pas dépendre d'un aller-retour serveur avant de pouvoir alerter. */
function empPeriodeEssaiFin(dateDebut,renouvelee,crecheId,typeContrat,dateFin){
  if(!dateDebut)return null;
  const d=new Date(dateDebut+'T00:00:00');
  if(typeContrat==='CDD'){
    if(dateFin&&dateFin>=dateDebut){
      const jours=Math.round((new Date(dateFin+'T00:00:00')-d)/86400000)+1;
      const limite=new Date(dateDebut+'T00:00:00');
      limite.setMonth(limite.getMonth()+6);
      if(jours<=Math.round((limite-d)/86400000)){
        d.setDate(d.getDate()+Math.min(Math.floor(jours/7),14));
      }else d.setMonth(d.getMonth()+1);
    }else d.setDate(d.getDate()+14);
  }else d.setMonth(d.getMonth()+(renouvelee?4:2));
  let fin=ipDateToLocalISO(d);
  if(crecheId){
    const vacances=fermeturesDe(crecheId).filter(f=>f&&f.type==='vacances'&&f.debut);
    const comptees=new Set();
    let changed=true;
    while(changed){
      changed=false;
      for(const f of vacances){
        const key=f.debut+'|'+(f.fin||f.debut);
        if(comptees.has(key))continue;
        const fFin=f.fin||f.debut;
        if(f.debut>fin||fFin<dateDebut)continue;
        comptees.add(key);
        const jours=Math.round((new Date(fFin+'T00:00:00')-new Date(f.debut+'T00:00:00'))/86400000)+1;
        const nd=new Date(fin+'T00:00:00');
        nd.setDate(nd.getDate()+jours);
        fin=ipDateToLocalISO(nd);
        changed=true;
      }
    }
  }
  return fin;
}
function empUpdateEssaiFin(){
  const dd=document.getElementById('emp-date-debut').value;
  const renouvelee=document.getElementById('emp-periode-essai-renouvelee').checked;
  const crecheId=document.getElementById('emp-creche').value||(isDirection?null:currentProfile?.creche_id);
  const fin=empPeriodeEssaiFin(dd,renouvelee,crecheId,document.getElementById('emp-type-contrat').value,document.getElementById('emp-date-fin').value);
  const el=document.getElementById('emp-essai-fin-calc');
  el.textContent=fin?new Date(fin+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}):'—';
}
window.empUpdateEssaiFin=empUpdateEssaiFin;

function openEmployeModal(){
  editingEmployeId=null;
  document.getElementById('modal-employe-title').textContent='Ajouter un(e) collaborateur/trice';
  document.getElementById('emp-btn-save').innerHTML='<i class="ti ti-check"></i> Ajouter';
  document.getElementById('emp-btn-delete').style.display='none';
  ['emp-prenom','emp-nom','emp-poste','emp-email'].forEach(id=>document.getElementById(id).value='');
  EMP_TEXT_FIELDS.forEach(([id])=>{const el=document.getElementById(id);if(el)el.value='';});
  EMP_NUM_FIELDS.forEach(([id])=>{const el=document.getElementById(id);if(el)el.value='';});
  {const el=document.getElementById('emp-experience');if(el)el.value='';}
  document.getElementById('emp-periode-essai-renouvelee').checked=false;
  document.getElementById('emp-periode-essai-actee').checked=false;
  empUpdateEssaiFin();
  empFillCreches(null);
  // Un contrat de travail ne peut être rattaché qu'à une fiche déjà créée
  // (le sélecteur du formulaire de contrat a besoin d'un id) : rien à
  // afficher tant que celle-ci n'existe pas encore.
  document.getElementById('emp-contrat-wrap').style.display='none';
  document.getElementById('modal-employe-wrap').classList.add('open');
}
window.openEmployeModal=openEmployeModal;

function editEmploye(id){
  const e=cacheEmployes.find(x=>String(x.id)===String(id));if(!e)return;
  editingEmployeId=e.id;
  document.getElementById('modal-employe-title').textContent='Modifier '+(e.prenom||'')+' '+(e.nom||'');
  document.getElementById('emp-btn-save').innerHTML='<i class="ti ti-check"></i> Enregistrer';
  document.getElementById('emp-btn-delete').style.display='';
  document.getElementById('emp-prenom').value=e.prenom||'';
  document.getElementById('emp-nom').value=e.nom||'';
  document.getElementById('emp-poste').value=e.poste||'';
  document.getElementById('emp-email').value=e.email||'';
  EMP_TEXT_FIELDS.forEach(([id,col])=>{const el=document.getElementById(id);if(el)el.value=e[col]||'';});
  EMP_NUM_FIELDS.forEach(([id,col])=>{const el=document.getElementById(id);if(el)el.value=e[col]==null?'':e[col];});
  {const el=document.getElementById('emp-experience');if(el)el.value=e.experience_annees==null?'':e.experience_annees;}
  document.getElementById('emp-periode-essai-renouvelee').checked=!!e.periode_essai_renouvelee;
  document.getElementById('emp-periode-essai-actee').checked=!!e.periode_essai_actee;
  empUpdateEssaiFin();
  empFillCreches(e.creche_id);
  document.getElementById('emp-contrat-wrap').style.display='';
  empLoadContratTravail(e.id);
  document.getElementById('modal-employe-wrap').classList.add('open');
}
window.editEmploye=editEmploye;

/* ---------- CONTRAT DE TRAVAIL (module Documents) ----------
   Le contrat n'est pas stocké dans `employes` : il vit dans
   documents_reponses (modèle contrat_travail de documents.html), rattaché
   à cette fiche via le sélecteur « Fiche collaborateur/trice » du
   formulaire (donnees.salarie_employe_id). On ne fait ici qu'y donner un
   accès direct, en lecture, depuis la fiche collaborateur/trice — pas de
   duplication des données ni de génération de PDF ici. */
async function empLoadContratTravail(employeId){
  const box=document.getElementById('emp-contrat-box');
  if(box)box.innerHTML='<p class="hint">Chargement…</p>';
  try{
    const{data:docs,error:eDocs}=await sb.from('documents_koala').select('id,titre').eq('template_key','contrat_travail');
    if(eDocs)throw eDocs;
    const docIds=(docs||[]).map(d=>d.id);
    if(!docIds.length){if(box)box.innerHTML='<p class="hint">Aucun modèle « Contrat de travail » configuré dans le module Documents.</p>';return;}
    const{data:reps,error:eReps}=await sb.from('documents_reponses')
      .select('id,document_id,statut,updated_at,created_at,donnees')
      .in('document_id',docIds).order('updated_at',{ascending:false});
    if(eReps)throw eReps;
    const mine=(reps||[]).filter(r=>r.donnees&&r.donnees.salarie_employe_id===employeId);
    if(!mine.length){
      if(box)box.innerHTML='<p class="hint">Aucun contrat de travail rattaché à cette fiche pour l’instant.</p>';
      return;
    }
    if(box)box.innerHTML=mine.map(r=>{
      const doc=(docs||[]).find(d=>d.id===r.document_id)||{};
      // Sans target="_blank" : le même onglet navigue vers documents.html, et
      // la bannière « Revenir à la fiche collaborateur/trice » (installée là-bas
      // via le paramètre emp=) ramène ici — même principe que le retour au
      // dossier d'un enfant depuis un document.
      const url='documents.html?doc='+encodeURIComponent(r.document_id)+'&rep='+encodeURIComponent(r.id)+'&emp='+encodeURIComponent(employeId);
      const badge=r.statut==='signe'
        ?'<span style="background:var(--green-l,#E8F5E9);color:var(--green,#2E7D32);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✅ Signé</span>'
        :'<span style="background:var(--orange-light);color:var(--orange-dark);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">⏳ En préparation</span>';
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">'
        +'<div><div style="font-size:12.5px;font-weight:600">'+escHtml(doc.titre||'Contrat de travail')+'</div>'
        +'<div style="font-size:11px;color:var(--muted)">'+new Date(r.updated_at||r.created_at).toLocaleDateString('fr-FR')+'</div></div>'
        +badge
        +'<a href="'+escHtml(url)+'" class="btn-sm"><i class="ti ti-eye"></i> Ouvrir</a>'
        +'</div>';
    }).join('');
  }catch(err){
    console.warn('empLoadContratTravail',err);
    if(box)box.innerHTML='<p class="hint">Contrat indisponible pour le moment.</p>';
  }
}
window.empLoadContratTravail=empLoadContratTravail;

async function saveEmploye(){
  const prenom=document.getElementById('emp-prenom').value.trim();
  if(!prenom){alert('Le prénom est requis.');return;}
  const crecheId=document.getElementById('emp-creche').value||(isDirection?null:currentProfile?.creche_id);
  if(!crecheId){alert('Veuillez choisir une crèche.');return;}
  const row={
    prenom,
    nom:document.getElementById('emp-nom').value.trim(),
    poste:document.getElementById('emp-poste').value.trim(),
    email:document.getElementById('emp-email').value.trim()||null,
    creche_id:crecheId
  };
  EMP_TEXT_FIELDS.forEach(([id,col])=>{
    const el=document.getElementById(id);
    row[col]=el&&el.value.trim()?el.value.trim():null;
  });
  EMP_NUM_FIELDS.forEach(([id,col])=>{
    const el=document.getElementById(id);
    const v=el?el.value.trim():'';
    row[col]=v===''?null:Number(v);
  });
  /* Colonne ajoutée par sql/employes_experience_annees.sql : n'est envoyée que si renseignée
     (ou déjà renseignée avant), pour ne pas bloquer l'enregistrement tant que le SQL n'est pas passé. */
  {
    const exv=(document.getElementById('emp-experience')||{value:''}).value.trim();
    const prev=editingEmployeId?(cacheEmployes.find(x=>x.id===editingEmployeId)||{}).experience_annees:null;
    if(exv!=='')row.experience_annees=Number(exv);
    else if(prev!=null)row.experience_annees=null;
  }
  row.periode_essai_renouvelee=document.getElementById('emp-periode-essai-renouvelee').checked;
  row.periode_essai_actee=document.getElementById('emp-periode-essai-actee').checked;
  // Recalculée ici aussi (le trigger la refait de son côté) pour que le
  // cache local reste à jour tout de suite : dbUpdate ne relit pas la ligne
  // après écriture, contrairement à dbInsert.
  row.periode_essai_fin=empPeriodeEssaiFin(row.date_debut,row.periode_essai_renouvelee,row.creche_id,row.type_contrat,row.date_fin);
  const btn=document.getElementById('emp-btn-save');btn.disabled=true;
  try{
    if(editingEmployeId){
      const ok=await dbUpdate('employes',editingEmployeId,row);
      if(!ok)throw new Error(window._lastDbError||'échec');
      const e=cacheEmployes.find(x=>String(x.id)===String(editingEmployeId));
      if(e)Object.assign(e,row);
      showBanner('Collaborateur/trice modifié(e) ✅');
    }else{
      const saved=await dbInsert('employes',row);
      if(!saved)throw new Error(window._lastDbError||'échec');
      cacheEmployes.push(saved);
      showBanner('Collaborateur/trice ajouté(e) ✅');
    }
    closeModal('modal-employe-wrap');
    renderEmployes();
  }catch(e){
    console.error('[saveEmploye]',e);
    showBanner('Erreur : '+(e.message||'inconnue'),'error');
  }finally{btn.disabled=false;}
}
window.saveEmploye=saveEmploye;

async function deleteEmploye(id){
  const targetId=id||editingEmployeId;
  if(!targetId)return;
  if(!confirm('Supprimer cette fiche collaborateur/trice ?'))return;
  const ok=await dbDelete('employes',targetId);
  if(ok){
    cacheEmployes=cacheEmployes.filter(e=>e.id!==targetId);
    closeModal('modal-employe-wrap');
    renderEmployes();
    showBanner('Collaborateur/trice supprimé(e).');
  }else showBanner('Erreur lors de la suppression.','error');
}

/* ===== PARTENAIRES ET INSTITUTIONS (CAF, PMI, prestataire repas…) =========
   Annuaire partagé, table `partenaires` (cf. sql/partenaires.sql). Un
   partenaire dont creche_ids est vide concerne tout le réseau ; sinon il
   n'apparaît qu'aux comptes rattachés à l'une des crèches listées (et à la
   direction, qui voit toujours tout) — un même intervenant extérieur (ex.
   le RSAI) peut ne travailler qu'avec une partie du réseau. */
let editingPartenaireId=null,partenairesFiltreCategorie='',activePartenaireCrecheId='all';
function partenairesVisibles(){
  return cachePartenaires.filter(p=>!p.creche_ids?.length||isDirection||p.creche_ids.includes(currentProfile?.creche_id));
}
function renderPartenaireCrecheTabs(){
  const bar=document.getElementById('partenaires-creche-tabs-bar');if(!bar)return;
  if(!isDirection){bar.style.display='none';return;}
  if(!cacheCreches.length){activePartenaireCrecheId='all';}
  else if(activePartenaireCrecheId!=='all'&&!cacheCreches.find(c=>c.id===activePartenaireCrecheId)){activePartenaireCrecheId='all';}
  let html='<button class="creche-tab'+(activePartenaireCrecheId==='all'?' active':'')+'" onclick="selectPartenaireCreche(\'all\')"><i class="ti ti-building-community" style="font-size:13px"></i> Toutes<span class="tab-count">'+cachePartenaires.length+'</span></button>';
  cacheCreches.forEach(c=>{const count=cachePartenaires.filter(p=>!p.creche_ids?.length||p.creche_ids.includes(c.id)).length;html+='<button class="creche-tab'+(activePartenaireCrecheId===c.id?' active':'')+'" onclick="selectPartenaireCreche(\''+c.id+'\')"><i class="ti ti-building" style="font-size:13px"></i> '+c.name+'<span class="tab-count">'+count+'</span></button>';});
  bar.style.display='';bar.innerHTML=html;
}
function selectPartenaireCreche(id){activePartenaireCrecheId=id;renderPartenaires();}
window.selectPartenaireCreche=selectPartenaireCreche;
function renderPartenairesFiltres(){
  const bar=document.getElementById('partenaires-filtre-bar');if(!bar)return;
  const categories=[...new Set(partenairesVisibles().map(p=>p.categorie||'Autre'))].sort((a,b)=>a.localeCompare(b,'fr'));
  if(!categories.length){bar.innerHTML='';return;}
  const chip=(label,value)=>'<button class="fchip'+(partenairesFiltreCategorie===value?' active':'')+'" onclick="partenairesFiltrerCategorie(\''+value+'\')">'+escHtml(label)+'</button>';
  bar.innerHTML=chip('Toutes','')+categories.map(c=>chip(c,c)).join('');
}
function partenairesFiltrerCategorie(cat){partenairesFiltreCategorie=cat;renderPartenaires();}
window.partenairesFiltrerCategorie=partenairesFiltrerCategorie;
function renderPartenaires(){
  const grid=document.getElementById('partenaires-grid');if(!grid)return;
  renderPartenaireCrecheTabs();
  renderPartenairesFiltres();
  let list=partenairesVisibles();
  if(isDirection&&activePartenaireCrecheId!=='all')list=list.filter(p=>!p.creche_ids?.length||p.creche_ids.includes(activePartenaireCrecheId));
  if(partenairesFiltreCategorie)list=list.filter(p=>(p.categorie||'Autre')===partenairesFiltreCategorie);
  list=list.slice().sort((a,b)=>(a.nom||'').localeCompare(b.nom||'','fr',{sensitivity:'base'}));
  if(!list.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-building-community"></i><p>Aucun partenaire enregistré.</p></div>';return;}
  grid.innerHTML=list.map(p=>{
    const noms=(p.creche_ids||[]).map(id=>cacheCreches.find(c=>c.id===id)?.name).filter(Boolean);
    const portee=noms.length?escHtml(noms.join(', ')):'<span style="color:var(--koala)">🌐 Tout le réseau</span>';
    return '<div class="ref-card"><div class="ref-card-top"><div class="ref-avatar" style="background:var(--muted)">'+escHtml((p.categorie||'?').slice(0,2).toUpperCase())+'</div><div style="flex:1;min-width:0">'
      +'<div class="ref-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">'+escHtml(p.nom)+' <span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700">'+escHtml(p.categorie||'Autre')+'</span></div>'
      +'<div class="ref-detail"><i class="ti ti-map-pin" style="font-size:11px"></i> '+portee+'</div>'
      +(p.contact_nom?'<div class="ref-detail"><i class="ti ti-user" style="font-size:11px"></i> '+escHtml(p.contact_nom)+'</div>':'')
      +(p.telephone?'<div class="ref-detail"><i class="ti ti-phone" style="font-size:11px"></i> '+escHtml(p.telephone)+'</div>':'')
      +(p.email?'<div class="ref-detail"><i class="ti ti-mail" style="font-size:11px"></i> '+escHtml(p.email)+'</div>':'')
      +(p.adresse?'<div class="ref-detail"><i class="ti ti-building" style="font-size:11px"></i> '+escHtml(p.adresse)+'</div>':'')
      +(p.notes?'<div class="ref-detail" style="white-space:pre-wrap">'+escHtml(p.notes)+'</div>':'')
      +'</div></div><div class="ref-actions"><button class="ibtn" onclick="editPartenaire(\''+p.id+'\')"><i class="ti ti-edit"></i></button><button class="ibtn del" onclick="deletePartenaire(\''+p.id+'\')"><i class="ti ti-trash"></i></button></div></div>';
  }).join('');
}
window.renderPartenaires=renderPartenaires;
function partenaireFillCrecheChecks(selectedIds){
  const wrap=document.getElementById('part-creches-checks');if(!wrap)return;
  const ids=selectedIds||[];
  wrap.innerHTML=cacheCreches.map(c=>'<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="checkbox" value="'+c.id+'"'+(ids.includes(c.id)?' checked':'')+'/> '+escHtml(c.name)+'</label>').join('')
    ||'<span class="hint" style="font-size:12px;color:var(--muted)">Aucune crèche enregistrée.</span>';
}
function partenaireGetCrecheChecks(){
  return [...document.querySelectorAll('#part-creches-checks input[type=checkbox]:checked')].map(i=>i.value);
}
function openPartenaireModal(){
  editingPartenaireId=null;
  document.getElementById('modal-partenaire-title').textContent='Ajouter un partenaire';
  ['part-nom','part-categorie','part-contact-nom','part-telephone','part-email','part-adresse','part-notes'].forEach(id=>{document.getElementById(id).value='';});
  partenaireFillCrecheChecks([]);
  document.getElementById('part-btn-delete').style.display='none';
  document.getElementById('modal-partenaire-wrap').classList.add('open');
}
window.openPartenaireModal=openPartenaireModal;
function editPartenaire(id){
  const p=cachePartenaires.find(x=>String(x.id)===String(id));if(!p)return;
  editingPartenaireId=id;
  document.getElementById('modal-partenaire-title').textContent='Modifier le partenaire';
  document.getElementById('part-nom').value=p.nom||'';
  document.getElementById('part-categorie').value=p.categorie||'';
  document.getElementById('part-contact-nom').value=p.contact_nom||'';
  document.getElementById('part-telephone').value=p.telephone||'';
  document.getElementById('part-email').value=p.email||'';
  document.getElementById('part-adresse').value=p.adresse||'';
  document.getElementById('part-notes').value=p.notes||'';
  partenaireFillCrecheChecks(p.creche_ids||[]);
  document.getElementById('part-btn-delete').style.display='';
  document.getElementById('modal-partenaire-wrap').classList.add('open');
}
window.editPartenaire=editPartenaire;
async function savePartenaire(){
  const nom=document.getElementById('part-nom').value.trim();
  if(!nom){alert('Le nom du partenaire est requis.');return;}
  const row={
    nom,
    categorie:document.getElementById('part-categorie').value.trim()||'Autre',
    creche_ids:partenaireGetCrecheChecks(),
    contact_nom:document.getElementById('part-contact-nom').value.trim()||null,
    telephone:document.getElementById('part-telephone').value.trim()||null,
    email:document.getElementById('part-email').value.trim()||null,
    adresse:document.getElementById('part-adresse').value.trim()||null,
    notes:document.getElementById('part-notes').value.trim()||null
  };
  let ok;
  if(editingPartenaireId){
    row.updated_at=new Date().toISOString();
    ok=await dbUpdate('partenaires',editingPartenaireId,row);
    if(ok){const p=cachePartenaires.find(x=>String(x.id)===String(editingPartenaireId));if(p)Object.assign(p,row);}
  }else{
    const saved=await dbInsert('partenaires',row);
    ok=!!saved;
    if(saved)cachePartenaires.push(saved);
  }
  if(!ok){showBanner('Enregistrement impossible : '+(window._lastDbError||'droits insuffisants'),'error');return;}
  closeModal('modal-partenaire-wrap');
  showBanner(editingPartenaireId?'Partenaire modifié ✅':'Partenaire ajouté ✅');
  renderPartenaires();
}
window.savePartenaire=savePartenaire;
async function deletePartenaire(id){
  const targetId=id||editingPartenaireId;
  if(!targetId)return;
  if(!confirm('Supprimer ce partenaire ?'))return;
  const ok=await dbDelete('partenaires',targetId);
  if(ok){
    cachePartenaires=cachePartenaires.filter(p=>p.id!==targetId);
    closeModal('modal-partenaire-wrap');
    renderPartenaires();
    showBanner('Partenaire supprimé.');
  }else showBanner('Erreur lors de la suppression.','error');
}
window.deleteEmploye=deleteEmploye;

async function resetPassword(refId){
  const r=cacheReferents.find(x=>x.id===refId);
  if(!r?.email){alert('Ce/cette directeur/trice technique n\'a pas d\'adresse e-mail.');return;}
  if(!confirm('Envoyer un email de réinitialisation du mot de passe à '+r.name+' ('+r.email+') ?'))return;
  const{error}=await sb.auth.resetPasswordForEmail(r.email,{
    redirectTo: window.location.origin+window.location.pathname
  });
  if(error){showBanner('Erreur : '+error.message,'error');}
  else{showBanner('Email de réinitialisation envoyé à '+r.name+' ✅ — il recevra un lien pour choisir son nouveau mot de passe.');}
}

// INCIDENTS
const INC_TYPE_LABELS={comportement:'Incident comportemental',materiel:'Incident matériel',securite:'Sécurité des locaux',famille:'Relation avec une famille',repas_corps_etranger:'Repas MCM – Corps étranger (arête, os...)',repas_grammage:'Repas MCM – Grammage insuffisant',repas_livraison:'Repas MCM – Livraison (retard, livreur inadapté...)',autre:'Autre'};
const INC_TYPE_OPTS_ENFANT=[['comportement','Incident comportemental'],['materiel','Incident matériel'],['securite','Sécurité des locaux'],['famille','Relation avec une famille'],['autre','Autre']];
const INC_TYPE_OPTS_REPAS=[['repas_corps_etranger',"Repas MCM – Corps étranger (arête, os...)"],['repas_grammage','Repas MCM – Grammage insuffisant'],['repas_livraison','Repas MCM – Livraison (retard, livreur inadapté...)'],['repas_libre','Repas MCM – Autre (à préciser)']];
function incTypeOptionsHtml(cat){const opts=cat==='repas'?INC_TYPE_OPTS_REPAS:INC_TYPE_OPTS_ENFANT;return opts.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join('');}
function toggleIncTypeLibre(){const libre=document.getElementById('inc-type').value==='repas_libre';document.getElementById('inc-type-libre-wrap').style.display=libre?'':'none';}
function setIncFilter(f,btn){activeIncFilter=f;document.querySelectorAll('#incident-filters .fchip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderIncidents();}
function setMcmIncFilter(f,btn){activeMcmIncFilter=f;document.querySelectorAll('#mcm-incident-filters .fchip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderMcmIncidents();}
function isIncRepas(i){return /^repas/i.test(i.type||'')||/^Repas MCM/i.test(i.type||'');}
function incidentCardHtml(i,showSev){
  const creche=cacheCreches.find(c=>c.id===i.creche_id);
  const si={grave:'🔴',leger:'🟠',info:'ℹ️'};
  return'<div class="incident-card '+i.severity+'">'+(showSev?'<div style="font-size:22px;flex-shrink:0">'+si[i.severity]+'</div>':'')+'<div class="inc-meta"><div class="inc-child"><i class="ti ti-user" style="font-size:11px"></i> '+(i.child_name||'Enfant non précisé')+(creche?' — '+creche.name:'')+'</div><div class="inc-title">'+(INC_TYPE_LABELS[i.type]||i.type||'')+' · '+(i.incident_date||'')+' '+(i.incident_time?'à '+i.incident_time:'')+'</div><div class="inc-body" style="margin-top:4px">'+(i.description||'—')+'</div>'+(i.actions?'<div style="margin-top:6px;font-size:12px;color:var(--green);background:var(--green-light);border-radius:6px;padding:4px 8px"><strong>Actions :</strong> '+i.actions+'</div>':'')+'<div class="inc-foot">'+(showSev?'<span class="badge" style="background:'+(i.severity==='grave'?'var(--red-light)':i.severity==='leger'?'var(--orange-light)':'var(--blue-light)')+';color:'+(i.severity==='grave'?'#c0392b':i.severity==='leger'?'var(--orange-dark)':'var(--blue)')+'">'+({grave:'Grave',leger:'Léger',info:'Information'}[i.severity]||i.severity)+'</span>':'')+(i.reporter?'<span class="meta-txt">'+i.reporter+'</span>':'')+(i.treated?'<span class="badge b-traite">✅ Traité</span>':'<span class="badge b-attente">⏳ En cours</span>')+'</div></div><div class="dactions"><button class="ibtn" onclick="toggleIncident(\''+i.id+'\','+i.treated+')"><i class="ti ti-'+(i.treated?'rotate-clockwise':'check')+'"></i></button>'+(isDirection?'<button class="ibtn del" onclick="deleteIncident(\''+i.id+'\')"><i class="ti ti-trash"></i></button>':'')+'</div></div>';
}
function renderIncidents(){
  const list=document.getElementById('incidents-list');
  if(!list)return;
  const myCrecheId=isDirection?null:currentProfile?.creche_id;
  const filtered=cacheIncidents.filter(i=>{
    if(myCrecheId&&i.creche_id!==myCrecheId)return false;
    if(isIncRepas(i))return false;
    if(activeIncFilter==='grave'&&i.severity!=='grave')return false;if(activeIncFilter==='leger'&&i.severity!=='leger')return false;if(activeIncFilter==='info'&&i.severity!=='info')return false;if(activeIncFilter==='non-traite'&&i.treated)return false;return true;});
  if(!filtered.length){list.innerHTML='<div class="empty-state"><i class="ti ti-shield-check"></i><p>Aucun incident.</p></div>';return;}
  list.innerHTML=filtered.map(i=>incidentCardHtml(i,true)).join('');
}
function renderMcmIncidents(){
  const list=document.getElementById('mcm-incidents-list');
  if(!list)return;
  const myCrecheId=isDirection?null:currentProfile?.creche_id;
  const filtered=cacheIncidents.filter(i=>{
    if(myCrecheId&&i.creche_id!==myCrecheId)return false;
    if(!isIncRepas(i))return false;
    if(activeMcmIncFilter==='non-traite'&&i.treated)return false;
    return true;
  });
  if(!filtered.length){list.innerHTML='<div class="empty-state"><i class="ti ti-shield-check"></i><p>Aucun incident repas.</p></div>';return;}
  list.innerHTML=filtered.map(i=>incidentCardHtml(i,false)).join('');
}
function openIncidentModal(cat){
  incModalCategory=cat==='repas'?'repas':'enfant';
  document.getElementById('inc-creche').innerHTML='<option value="">-- Choisir --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'"'+((!isDirection&&c.id===currentProfile?.creche_id)?' selected':'')+'>'+c.name+'</option>').join('');
  document.getElementById('inc-date').value=todayStr();document.getElementById('inc-time').value=new Date().toTimeString().slice(0,5);
  ['inc-child','inc-desc','inc-actions','inc-reporter','inc-type-libre'].forEach(id=>document.getElementById(id).value='');
  const isRepas=incModalCategory==='repas';
  document.getElementById('inc-type').innerHTML=incTypeOptionsHtml(incModalCategory);
  document.getElementById('inc-type').value=isRepas?'repas_corps_etranger':'comportement';
  document.getElementById('inc-severity-wrap').style.display=isRepas?'none':'';
  toggleIncTypeLibre();
  document.getElementById('modal-incident-wrap').classList.add('open');
}
async function saveIncident(){const desc=document.getElementById('inc-desc').value.trim();if(!desc){alert('Description requise.');return;}let type=document.getElementById('inc-type').value;if(type==='repas_libre'){const libre=document.getElementById('inc-type-libre').value.trim();if(!libre){alert('Précisez le type d\'incident repas MCM.');return;}type='Repas MCM – '+libre;}const severity=incModalCategory==='repas'?'info':document.getElementById('inc-severity').value;const row={creche_id:document.getElementById('inc-creche').value,child_name:document.getElementById('inc-child').value.trim(),incident_date:document.getElementById('inc-date').value,incident_time:document.getElementById('inc-time').value,type:type,severity:severity,description:desc,actions:document.getElementById('inc-actions').value.trim(),reporter:document.getElementById('inc-reporter').value.trim(),treated:false};const saved=await dbInsert('incidents',row);if(saved){cacheIncidents.unshift(saved);updateBadges();
/* Alerte immediate a la direction et a la referente si l'incident est grave.
   Aucun nom d'enfant ni detail n'est transmis par courriel (cf. notify-infirmerie). */
if(saved.severity==='grave'){callFn('notify-infirmerie',{creche_id:saved.creche_id,motif:'grave',date:saved.incident_date,heure:saved.incident_time,source:'incident'});showBanner('Incident enregistré. Direction et directeur/trice technique alertées.');}else showBanner('Incident enregistré.');
closeModal('modal-incident-wrap');renderIncidents();renderMcmIncidents();}else showBanner('Erreur.','error');}
async function toggleIncident(id,treated){const ok=await dbUpdate('incidents',id,{treated:!treated});if(ok){const i=cacheIncidents.find(x=>x.id===id);if(i)i.treated=!treated;updateBadges();renderIncidents();renderMcmIncidents();}}
async function deleteIncident(id){if(!confirm('Supprimer ?'))return;await dbDelete('incidents',id);cacheIncidents=cacheIncidents.filter(i=>i.id!==id);updateBadges();renderIncidents();renderMcmIncidents();}

// EVENEMENTS / RENDEZ-VOUS (CALENDRIER)
const CAL_TYPE_INFO={
  recrutement:{label:'Recrutement',emoji:'🧑‍💼',color:'#378ADD'},
  formation:{label:'Formation',emoji:'📚',color:'#2563EB'},
  app:{label:'Analyse de la Pratique Pro.',emoji:'🧠',color:'#6D28D9'},
  reunion:{label:'Réunion',emoji:'🗣️',color:'#7C3AED'},
  rsai:{label:'RSAI',emoji:'🩺',color:'#0E9488'},
  pmi:{label:'Visite PMI',emoji:'🏥',color:'#C2185B'},
  visite:{label:'Visite',emoji:'🏠',color:'#2a9d4e'},
  entretien:{label:'Entretien',emoji:'🤝',color:'#F47920'},
  fete:{label:'Fête',emoji:'🎉',color:'#E0457B'},
  ferie:{label:'Férié',emoji:'🎌',color:'#E53935'},
  vacances:{label:'Vacances',emoji:'🏖️',color:'#00ACC1'},
  autre:{label:'Autre',emoji:'⚪',color:'#888'}
};
const CAL_DOW=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
// Couleur stable par crèche (répartie régulièrement sur le cercle des teintes,
// comme les intervenantes du planning équipe) : on repère d'un coup d'œil de
// quelle crèche vient chaque événement, plutôt que son type. Les événements
// réseau (sans crèche) restent en gris neutre.
function calColorForCreche(crecheId){
  if(!crecheId)return '#888';
  const sorted=[...cacheCreches].sort((a,b)=>(a.name||'').localeCompare(b.name||'','fr'));
  const idx=sorted.findIndex(c=>c.id===crecheId);
  if(idx<0)return '#888';
  const hue=Math.round(idx*360/(sorted.length||1));
  return 'hsl('+hue+',60%,42%)';
}
function calRenderLegend(){
  const box=document.getElementById('cal-legend');if(!box)return;
  const sorted=[...cacheCreches].sort((a,b)=>(a.name||'').localeCompare(b.name||'','fr'));
  const item=(key,color,name)=>{
    const on=calFilterCreche===key,dim=calFilterCreche&&!on;
    return '<div class="leg-item" role="button" tabindex="0" title="'+(on?'Cliquer pour tout réafficher':'Cliquer pour ne voir que cette crèche')+'" style="cursor:pointer;user-select:none;'+(on?'font-weight:700;':'')+(dim?'opacity:.4;':'')+'" onclick="calSetCrecheFilter(\''+key+'\')"><div class="leg-dot" style="background:'+color+'"></div>'+escHtml(name)+'</div>';
  };
  box.innerHTML=sorted.map(c=>item(c.id,calColorForCreche(c.id),c.name)).join('')+item('__reseau','#888','Réseau / toutes crèches');
}
function calSetCrecheFilter(key){calFilterCreche=(calFilterCreche===key)?null:key;renderCalendar();}

function calCurrentMonthDate(){const n=new Date();return new Date(n.getFullYear(),n.getMonth()+calMonthOffset,1);}
function calChangeMonth(delta){calMonthOffset+=delta;calSelectedDay=null;renderCalendar();}
function calGoToday(){calMonthOffset=0;calSelectedDay=todayStr();renderCalendar();}
function calSetFilter(f,btn){calFilterType=f;document.querySelectorAll('#cal-filters .fchip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderCalendar();}

// Un evenement concerne le/la referent(e) s'il est reseau (pas de creche_id),
// s'il vise sa propre creche, ou si c'est elle/lui qui l'a cree.
function calEvtConcerneMoi(e){
  if(isDirection)return true;
  if(!e.creche_id)return true;
  if(e.creche_id===currentProfile?.creche_id)return true;
  const uid=currentUser?.id;
  return !!(uid&&e.created_by===uid);
}

function calSyncOnlyMineBtn(){
  const b=document.getElementById('cal-only-mine-btn');if(!b)return;
  b.classList.toggle('active',calOnlyMine);
  b.style.background=calOnlyMine?'var(--koala)':'';
  b.style.color=calOnlyMine?'#fff':'';
  b.innerHTML=calOnlyMine?'<i class="ti ti-eye"></i> Tout afficher':'<i class="ti ti-eye-off"></i> Masquer ce qui ne me concerne pas';
}

function calToggleOnlyMine(){
  calOnlyMine=!calOnlyMine;
  localStorage.setItem('calOnlyMine',calOnlyMine?'1':'0');
  calSyncOnlyMineBtn();
  renderCalendar();
}

// Qui peut toucher a un evenement : son auteur, ou la direction.
// created_by est pose par la base (28-evenements-auteur.sql) ; les evenements
// anterieurs au script n'en ont pas — ils restent a la direction.
function peutModifierEvt(e){
  if(isDirection)return true;
  const uid=currentUser?.id;
  return !!(uid&&e&&e.created_by===uid);
}

// Le calendrier est l'agenda partage du reseau : tout le monde voit tout.
// Le cloisonnement porte sur l'ECRITURE, pas sur la lecture.
function calEventsForDay(dateISO){
  return cacheEvenements.filter(e=>{
    if(calFilterType!=='all'&&e.type!==calFilterType)return false;
    if(calOnlyMine&&!calEvtConcerneMoi(e))return false;
    if(calFilterCreche&&(calFilterCreche==='__reseau'?!!e.creche_id:e.creche_id!==calFilterCreche))return false;
    const start=e.date_debut,end=e.date_fin||e.date_debut;
    return dateISO>=start&&dateISO<=end;
  }).sort((a,b)=>(a.heure_debut||'').localeCompare(b.heure_debut||''));
}

function renderCalendar(){
  const dowRow=document.getElementById('cal-dow-row'),grid=document.getElementById('cal-grid'),label=document.getElementById('cal-month-label');
  if(!grid)return;
  const monthDate=calCurrentMonthDate();
  const year=monthDate.getFullYear(),month=monthDate.getMonth();
  label.textContent=monthDate.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  dowRow.innerHTML=['Lun','Mar','Mer','Jeu','Ven'].map(d=>'<div class="cal-dow">'+d+'</div>').join('');

  const isWeekday=d=>{const dow=(d.getDay()+6)%7;return dow<=4;};
  const daysInMonth=new Date(year,month+1,0).getDate();
  const today=todayStr();

  // Collecter tous les jours ouvrés du mois
  const monthDays=[];
  for(let day=1;day<=daysInMonth;day++){const d=new Date(year,month,day);if(isWeekday(d))monthDays.push(d);}

  // Padding début : jours ouvrés du mois précédent pour que le 1er tombe dans la bonne colonne
  const firstDow5=(new Date(year,month,1).getDay()+6)%7; // 0=Lun…4=Ven
  const padStart=Math.min(firstDow5,5); // max 4 pour un lundi
  const padDays=[];
  let pd=new Date(year,month,0); // dernier jour mois précédent
  while(padDays.length<padStart){if(isWeekday(pd))padDays.unshift(new Date(pd));pd.setDate(pd.getDate()-1);}

  const allDays=[...padDays,...monthDays];

  // Padding fin pour compléter la dernière ligne de 5
  const trailing=(5-(allDays.length%5))%5;
  let nd=new Date(year,month+1,1);let added=0;
  while(added<trailing){if(isWeekday(nd)){allDays.push(new Date(nd));added++;}nd.setDate(nd.getDate()+1);}

  const isPad=d=>d.getMonth()!==month;
  grid.innerHTML=allDays.map(d=>calCellHtml(d,isPad(d),today)).join('');
  renderCalDayDetail();
  calSyncOnlyMineBtn();
  calRenderLegend();
}

// Fermetures (Paramètres/Fonctionnement) couvrant ce jour : la fermeture réseau
// prime et dispense d'énumérer chaque crèche (toutes sont alors fermées) ;
// sinon, une entrée par crèche ayant sa propre fermeture ce jour-là.
function calFermeturesForDay(dateISO){
  if(calFilterCreche)return calFermeturesAll(dateISO).filter(function(x){return calFilterCreche==='__reseau'?!x.crecheId:(!x.crecheId||x.crecheId===calFilterCreche);});
  return calFermeturesAll(dateISO);
}
function calFermeturesAll(dateISO){
  const netw=(cacheReseauFermetures||[]).find(function(f){return f&&f.debut&&dateISO>=f.debut&&dateISO<=(f.fin||f.debut);});
  if(netw)return[{crecheId:null,crecheName:'Réseau / toutes crèches',f:netw}];
  const out=[];
  cacheCreches.forEach(function(c){
    const f=fermetureAt(c.id,dateISO);
    if(f)out.push({crecheId:c.id,crecheName:c.name,f:f});
  });
  return out;
}
function calCellHtml(d,isOut,today){
  const dateISO=ipDateToLocalISO(d);
  const evts=calEventsForDay(dateISO);
  const ferms=calFermeturesForDay(dateISO);
  const isToday=dateISO===today;
  const cls='cal-cell'+(isOut?' out':'')+(isToday?' today':'')+(evts.length?' has-evt':'')+(ferms.length?' ferm':'');
  const EVT_MAX=3;
  let evtHtml='';
  if(ferms.length){
    const titre=ferms.length===1&&ferms[0].crecheId?ferms[0].crecheName:'Toutes crèches';
    const detail=ferms.map(function(x){return x.crecheName+' — '+fermetureLabel(x.f);}).join(' · ');
    evtHtml+='<div class="cal-ferm-tag" title="'+escHtml(detail)+'"><i class="ti ti-door-off"></i> Fermé — '+escHtml(titre)+'</div>';
  }
  evts.slice(0,EVT_MAX).forEach(e=>{
    const info=CAL_TYPE_INFO[e.type]||CAL_TYPE_INFO.autre;
    const creche=cacheCreches.find(c=>c.id===e.creche_id);
    const alreadyInTitle=creche&&e.titre&&e.titre.toLowerCase().includes(creche.name.toLowerCase());
    const crecheLabel=(creche&&!alreadyInTitle)?' · '+escHtml(creche.name):'';
    evtHtml+='<div class="cal-evt" style="background:'+calColorForCreche(e.creche_id)+'" title="'+escHtml(e.titre)+(creche?' — '+creche.name:'')+(e.auteur?' — Créé par '+escHtml(e.auteur):'')+'">'+info.emoji+' '+escHtml(e.titre)+crecheLabel+'</div>';
  });
  if(evts.length>EVT_MAX)evtHtml+='<div class="cal-evt-more">+'+(evts.length-EVT_MAX)+' autre(s)</div>';
  return '<div class="'+cls+'" onclick="calSelectDay(\''+dateISO+'\')"><div class="cal-daynum">'+d.getDate()+'</div>'+evtHtml+'</div>';
}

function calSelectDay(dateISO){calSelectedDay=dateISO;renderCalDayDetail();}

function renderCalDayDetail(){
  const box=document.getElementById('cal-day-detail');if(!box)return;
  if(!calSelectedDay){box.style.display='none';return;}
  const evts=calEventsForDay(calSelectedDay);
  const ferms=calFermeturesForDay(calSelectedDay);
  const d=new Date(calSelectedDay+'T00:00:00');
  const dateLabel=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  box.style.display='block';
  let html='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-size:13.5px;font-weight:700;color:var(--koala);text-transform:capitalize">'+dateLabel+'</span><button class="btn-sm" style="font-size:11.5px;padding:4px 10px" onclick="openEvenementModal(\''+calSelectedDay+'\')"><i class="ti ti-plus"></i> Ajouter</button></div>';
  ferms.forEach(function(x){
    html+='<div class="cal-ferm-row"><div class="cal-evt-dot" style="background:var(--red,#C62828)"></div>'+
      '<div style="flex:1;min-width:0"><div class="cal-evt-title"><i class="ti ti-door-off"></i> '+escHtml(fermetureLabel(x.f))+'</div>'+
      '<div class="cal-evt-meta">'+escHtml(x.crecheName)+'</div></div></div>';
  });
  if(!evts.length&&!ferms.length){
    html+='<div class="empty-state" style="padding:1rem"><i class="ti ti-calendar-off"></i><p>Aucun événement ce jour.</p></div>';
  }else{
    html+=evts.map(e=>{
      const info=CAL_TYPE_INFO[e.type]||CAL_TYPE_INFO.autre;
      const creche=cacheCreches.find(c=>c.id===e.creche_id);
      const horaire=(e.heure_debut?e.heure_debut.slice(0,5):'')+(e.heure_fin?' – '+e.heure_fin.slice(0,5):'');
      const multiJour=e.date_fin&&e.date_fin!==e.date_debut?' · du '+e.date_debut+' au '+e.date_fin:'';
      return '<div class="cal-evt-row" style="cursor:pointer" onclick="openEvenementModal(null,\''+e.id+'\')">'+
        '<div class="cal-evt-dot" style="background:'+calColorForCreche(e.creche_id)+'"></div>'+
        '<div style="flex:1;min-width:0">'+
          '<div class="cal-evt-title">'+info.emoji+' '+escHtml(e.titre)+'</div>'+
          '<div class="cal-evt-meta">'+(horaire?horaire+' · ':'')+(creche?creche.name:'Réseau / toutes crèches')+(e.lieu?' · '+escHtml(e.lieu):'')+multiJour+'</div>'+
          (e.description?'<div class="cal-evt-meta" style="margin-top:3px;color:#666">'+escHtml(e.description)+'</div>':'')+
          (e.auteur?'<div class="cal-evt-meta" style="margin-top:3px;color:#999;font-size:11px"><i class="ti ti-user"></i> Créé par '+escHtml(e.auteur)+'</div>':'')+
        '</div>'+
        (peutModifierEvt(e)
          ? '<button class="ibtn" style="flex-shrink:0" title="Modifier" onclick="event.stopPropagation();openEvenementModal(null,\''+e.id+'\')"><i class="ti ti-edit"></i></button>'
          : '<button class="ibtn" style="flex-shrink:0;opacity:.45" title="Créé par quelqu\'un d\'autre — consultation seule" onclick="event.stopPropagation();openEvenementModal(null,\''+e.id+'\')"><i class="ti ti-eye"></i></button>')+
      '</div>';
    }).join('');
  }
  box.innerHTML=html;
}

function escHtml(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// Transforme les URL http(s) d'un texte déjà échappé (via escHtml) en liens cliquables.
function linkify(escapedHtml){if(!escapedHtml)return'';return escapedHtml.replace(/(https?:\/\/[^\s<]+)/g,url=>'<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+url+'</a>');}

function evtSyncEndDate(){
  const fin=document.getElementById('evt-date-fin');
  if(!fin.value)fin.value=document.getElementById('evt-date-debut').value;
}

const EVT_FIELDS=['evt-titre','evt-type','evt-creche','evt-date-debut','evt-date-fin',
                  'evt-heure-debut','evt-heure-fin','evt-lieu','evt-desc','evt-auteur'];
function evtSetLectureSeule(ro){
  EVT_FIELDS.forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=ro;});
  const save=document.getElementById('evt-btn-save');    if(save)save.style.display=ro?'none':'';
  const note=document.getElementById('evt-lecture-seule');if(note)note.style.display=ro?'':'none';
}

function openEvenementModal(presetDate,evtId){
  editingEvtId=evtId||null;
  document.getElementById('evt-creche').innerHTML='<option value="">— Toutes / réseau —</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  document.getElementById('evt-btn-delete').style.display='none';
  if(evtId){
    const e=cacheEvenements.find(x=>x.id===evtId);if(!e)return;
    const modifiable=peutModifierEvt(e);
    evtSetLectureSeule(!modifiable);
    document.getElementById('evt-btn-delete').style.display=modifiable?'flex':'none';
    document.getElementById('modal-evt-title').textContent=modifiable?'Modifier l\'événement':'Événement';
    document.getElementById('evt-titre').value=e.titre||'';
    document.getElementById('evt-type').value=e.type||'autre';
    document.getElementById('evt-creche').value=e.creche_id||'';
    document.getElementById('evt-date-debut').value=e.date_debut||'';
    document.getElementById('evt-date-fin').value=e.date_fin||'';
    document.getElementById('evt-heure-debut').value=e.heure_debut||'';
    document.getElementById('evt-heure-fin').value=e.heure_fin||'';
    document.getElementById('evt-lieu').value=e.lieu||'';
    document.getElementById('evt-desc').value=e.description||'';
    document.getElementById('evt-auteur').value=e.auteur||'';
  }else{
    document.getElementById('modal-evt-title').textContent='Nouvel événement';
    ['evt-titre','evt-lieu','evt-desc'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('evt-type').value='reunion';
    if(!isDirection&&currentProfile?.creche_id)document.getElementById('evt-creche').value=currentProfile.creche_id;
    const d=presetDate||calSelectedDay||todayStr();
    document.getElementById('evt-date-debut').value=d;
    document.getElementById('evt-date-fin').value=d;
    document.getElementById('evt-heure-debut').value='';
    document.getElementById('evt-heure-fin').value='';
    document.getElementById('evt-auteur').value=currentProfile?.name||'';
    evtSetLectureSeule(false);
  }
  document.getElementById('modal-evenement-wrap').classList.add('open');
}

async function saveEvenement(){
  if(editingEvtId){
    const ex=cacheEvenements.find(x=>x.id===editingEvtId);
    if(ex&&!peutModifierEvt(ex)){
      showBanner('Cet événement a été créé par quelqu\'un d\'autre : vous ne pouvez pas le modifier.','error');
      return;
    }
  }
  const titre=document.getElementById('evt-titre').value.trim();
  const dateDebut=document.getElementById('evt-date-debut').value;
  if(!titre){alert('Le titre est requis.');return;}
  if(!dateDebut){alert('La date de début est requise.');return;}
  let dateFin=document.getElementById('evt-date-fin').value||null;
  if(dateFin&&dateFin<dateDebut)dateFin=dateDebut;
  const row={
    titre,
    type:document.getElementById('evt-type').value,
    creche_id:document.getElementById('evt-creche').value||null,
    date_debut:dateDebut,
    date_fin:(dateFin&&dateFin!==dateDebut)?dateFin:null,
    heure_debut:document.getElementById('evt-heure-debut').value||null,
    heure_fin:document.getElementById('evt-heure-fin').value||null,
    lieu:document.getElementById('evt-lieu').value.trim(),
    description:document.getElementById('evt-desc').value.trim(),
    auteur:document.getElementById('evt-auteur').value.trim()
  };
  if(editingEvtId){
    const ok=await dbUpdateStrict('evenements',editingEvtId,row);
    if(ok){const e=cacheEvenements.find(x=>x.id===editingEvtId);if(e)Object.assign(e,row);showBanner('Événement modifié !');}
    else{showBanner(window._lastDbError||'Erreur lors de la modification.','error');return;}
  }else{
    const saved=await dbInsert('evenements',{...row,created_by:currentUser?.id||null});
    if(saved){cacheEvenements.push(saved);showBanner('Événement créé !');const pushDest=cacheReferents.filter(r=>r.id!==currentProfile?.id&&(!row.creche_id||r.creche_id===row.creche_id)).map(r=>r.id);if(pushDest.length)await callFn('notify-push',{referent_ids:pushDest,title:'Nouvel événement',body:titre,url:'./demandes.html',tag:'evenement-'+saved.id});}
    else{showBanner(window._lastDbError||'Erreur lors de la création.','error');return;}
  }
  closeModal('modal-evenement-wrap');
  renderCalendar();
}

async function deleteEvenement(){
  if(!editingEvtId)return;
  const ex=cacheEvenements.find(x=>x.id===editingEvtId);
  if(ex&&!peutModifierEvt(ex)){
    showBanner('Seul l\'auteur de l\'événement, ou la direction, peut le supprimer.','error');
    return;
  }
  if(!confirm('Supprimer cet événement ?'))return;
  const ok=await dbDeleteStrict('evenements',editingEvtId);
  if(ok){
    cacheEvenements=cacheEvenements.filter(e=>e.id!==editingEvtId);
    closeModal('modal-evenement-wrap');
    renderCalendar();
    showBanner('Événement supprimé.');
const pushDest=cacheReferents.filter(r=>r.id!==currentProfile?.id&&(!ex?.creche_id||r.creche_id===ex.creche_id)).map(r=>r.id);if(pushDest.length)await callFn('notify-push',{referent_ids:pushDest,title:'Événement annulé',body:ex?.titre||'',url:'./demandes.html',tag:'evenement-annule-'+editingEvtId});
  }else showBanner(window._lastDbError||'Erreur lors de la suppression.','error');
}

// PRESENCES
function presenceMoveDate(delta){
  const input=document.getElementById('presence-date');
  if(!input.value)input.value=todayStr();
  const d=new Date(input.value+'T00:00:00');
  d.setDate(d.getDate()+delta);
  // Sauter les week-ends
  while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+delta);
  input.value=ipDateToLocalISO(d);
  renderPresence();
}
