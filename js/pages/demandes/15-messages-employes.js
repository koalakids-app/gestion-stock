/* Messages à sens unique vers les employé·es — lus dans « Mon espace » (collaborateur.html).
   Tables messages_employes / messages_employes_destinataires (sql/messages_employes.sql, à appliquer
   à la main). Destinataires : toute une crèche (ou toutes pour la direction), ou des personnes précises.
   Seul·es les employé·es qui ont un compte (employes.user_id) peuvent le lire : les autres sont grisé·es. */
let mePending=false;

function meEmployesActifs(){return(cacheEmployes||[]).filter(e=>!e.archive_le);}
function meNom(e){return((e.prenom||'')+' '+(e.nom||'')).trim()||'(sans nom)';}

function openMsgEmployes(){
  document.getElementById('me-titre').value='';
  document.getElementById('me-corps').value='';
  const sel=document.getElementById('me-creche');
  if(isDirection){
    sel.innerHTML='<option value="">Toutes les crèches</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+escHtml(c.name||'')+'</option>').join('');
    sel.disabled=false;
  }else{
    const c=cacheCreches.find(x=>x.id===currentProfile?.creche_id);
    sel.innerHTML='<option value="'+(currentProfile?.creche_id||'')+'">'+escHtml(c?c.name:'Ma crèche')+'</option>';
    sel.disabled=true;
  }
  document.querySelector('input[name="me-mode"][value="creche"]').checked=true;
  meMajChoix();
  document.getElementById('modal-msg-employes-wrap').classList.add('open');
}

function meCrecheChoisie(){return document.getElementById('me-creche').value||null;}
function meModeChoisi(){return document.querySelector('input[name="me-mode"]:checked').value;}

/* Employé·es concerné·es par la crèche choisie (toutes les crèches si vide, direction seulement). */
function meCandidats(){
  const cr=meCrecheChoisie();
  return meEmployesActifs().filter(e=>!cr||e.creche_id===cr);
}

function meMajChoix(){
  const mode=meModeChoisi(),liste=document.getElementById('me-liste'),info=document.getElementById('me-info');
  const cand=meCandidats();
  const avecCompte=cand.filter(e=>e.user_id);
  if(mode==='creche'){
    liste.style.display='none';
    info.innerHTML='<i class="ti ti-users"></i> '+avecCompte.length+' employé(e)(s) recevront ce message'+(cand.length>avecCompte.length?' — '+(cand.length-avecCompte.length)+' sans compte « Mon espace » ne pourront pas le lire':'')+'.';
    return;
  }
  const crNom=id=>(cacheCreches.find(c=>c.id===id)||{}).name||'';
  liste.style.display='';
  liste.innerHTML=cand.length?cand.slice().sort((a,b)=>meNom(a).localeCompare(meNom(b),'fr')).map(e=>
    '<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13px'+(e.user_id?'':';opacity:.5')+'"><input type="checkbox" class="me-pers" value="'+e.id+'"'+(e.user_id?'':' disabled')+' onchange="meMajCompte()"/> <span>'+escHtml(meNom(e))+(isDirection&&!meCrecheChoisie()&&crNom(e.creche_id)?' <small style="color:var(--ink2)">· '+escHtml(crNom(e.creche_id))+'</small>':'')+(e.user_id?'':' <small>(sans compte)</small>')+'</span></label>'
  ).join(''):'<p style="font-size:12.5px;color:var(--ink2)">Aucun(e) employé(e) dans cette crèche.</p>';
  meMajCompte();
}
function meMajCompte(){
  const n=document.querySelectorAll('.me-pers:checked').length;
  document.getElementById('me-info').innerHTML='<i class="ti ti-users"></i> '+n+' personne(s) sélectionnée(s).';
}

async function saveMsgEmployes(){
  if(mePending)return;
  const titre=document.getElementById('me-titre').value.trim(),corps=document.getElementById('me-corps').value.trim();
  if(!titre||!corps){alert('Le titre et le message sont requis.');return;}
  const mode=meModeChoisi();
  let dest=mode==='creche'
    ?meCandidats().filter(e=>e.user_id)
    :meCandidats().filter(e=>e.user_id&&document.querySelector('.me-pers[value="'+e.id+'"]')?.checked);
  if(!dest.length){alert(mode==='creche'?'Aucun(e) employé(e) de cette crèche n\'a de compte « Mon espace ».':'Sélectionnez au moins une personne.');return;}
  if(!currentProfile?.id){alert('Profil introuvable, reconnectez-vous.');return;}
  const btn=document.getElementById('btn-save-msg-employes');mePending=true;btn.disabled=true;
  try{
    /* Crèche visée : celle choisie ; pour des personnes précises d'une seule crèche, cette crèche ; sinon null (direction). */
    let crecheId=meCrecheChoisie();
    if(!crecheId&&mode==='personnes'){const cs=new Set(dest.map(e=>e.creche_id));if(cs.size===1)crecheId=[...cs][0];}
    const saved=await dbInsert('messages_employes',{creche_id:crecheId,auteur_id:currentProfile.id,auteur_nom:currentProfile.name||'',titre:titre,corps:corps});
    if(!saved){showBanner('Erreur envoi'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
    const{error}=await sb.from('messages_employes_destinataires').insert(dest.map(e=>({message_id:saved.id,employe_id:e.id})));
    if(error){console.warn('[messages_employes] destinataires',error);showBanner('Message créé mais destinataires en erreur : '+error.message,'error');return;}
    await callFn('notify-push',{employe_ids:dest.map(e=>e.id),title:'Nouveau message',body:titre,url:'./collaborateur.html',tag:'msg-employe-'+saved.id});
    showBanner('Message envoyé à '+dest.length+' employé(e)(s) !');
    closeModal('modal-msg-employes-wrap');
  }finally{mePending=false;btn.disabled=false;}
}
