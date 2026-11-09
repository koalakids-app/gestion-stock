/* Informations aux familles — lues dans l'Espace famille (espace-famille.html).
   Table famille_messages (sql/espace_famille.sql, à appliquer à la main). Destinataires : toutes
   les familles d'une crèche, ou une famille précise (enfant_id). Seuls les parents qui ont un
   code d'accès (famille_acces actif) la lisent. */
let mfPending=false;

function openMsgFamilles(enfantId){
  document.getElementById('mf-titre').value='';
  document.getElementById('mf-corps').value='';
  const sel=document.getElementById('mf-creche');
  if(isDirection){
    sel.innerHTML=cacheCreches.map(c=>'<option value="'+c.id+'">'+escHtml(c.name||'')+'</option>').join('');
    const courante=activeCrecheId||null;
    if(courante&&cacheCreches.some(c=>c.id===courante))sel.value=courante;
    sel.disabled=false;
  }else{
    const c=cacheCreches.find(x=>x.id===currentProfile?.creche_id);
    sel.innerHTML='<option value="'+(currentProfile?.creche_id||'')+'">'+escHtml(c?c.name:'Ma crèche')+'</option>';
    sel.disabled=true;
  }
  if(enfantId){
    // Depuis la fiche enfant › Parents : crèche de l'enfant, message destiné à sa famille seulement.
    const e=(cacheEnfants||[]).find(x=>String(x.id)===String(enfantId));
    if(e&&!sel.querySelector('option[value="'+e.creche_id+'"]'))sel.innerHTML+='<option value="'+e.creche_id+'"></option>';
    if(e)sel.value=e.creche_id;
  }
  mfMajEnfants();
  if(enfantId)document.getElementById('mf-enfant').value=enfantId;
  document.getElementById('modal-msg-familles-wrap').classList.add('open');
}

function mfMajEnfants(){
  const cr=document.getElementById('mf-creche').value;
  const enfants=(cacheEnfants||[]).filter(e=>e.creche_id===cr&&!(typeof enfIsArchived==='function'&&enfIsArchived(e)))
    .sort((a,b)=>((a.prenom||'')+(a.nom||'')).localeCompare((b.prenom||'')+(b.nom||''),'fr'));
  document.getElementById('mf-enfant').innerHTML='<option value="">Toutes les familles de la crèche</option>'
    +enfants.map(e=>'<option value="'+e.id+'">'+escHtml(((e.prenom||'')+' '+(e.nom||'')).trim())+'</option>').join('');
  document.getElementById('mf-info').innerHTML='<i class="ti ti-users"></i> Visible par les parents ayant un code d\'accès Espace famille.';
}

/* Prévient par notification push les familles abonnées (une seule par accès actif). Ne bloque jamais la
   publication : l'information reste lisible dans l'Espace famille. Silence (soir, week-end, férié) :
   rien n'est envoyé ni retenu. Renvoie le nombre de notifications envoyées, ou null en cas d'erreur. */
async function mfPrevenir(creche,enfant,titre){
  try{
    let q=sb.from('famille_acces').select('id').eq('creche_id',creche).eq('actif',true);
    if(enfant)q=q.eq('enfant_id',enfant);
    const{data}=await q;
    const ids=(data||[]).map(a=>a.id);
    if(!ids.length)return 0;
    const c=cacheCreches.find(x=>x.id===creche);
    const{data:r,error}=await sb.functions.invoke('notify-push',{body:{acces_ids:ids,title:'Nouvelle information'+(c&&c.name?' — '+c.name:''),body:titre,url:'./espace-famille.html',tag:'famille-info'}});
    if(error)throw error;
    return (r&&r.envoyes)||0;
  }catch(e){console.warn('[Info familles] push',e);return null;}
}

async function saveMsgFamilles(){
  if(mfPending)return;
  const titre=document.getElementById('mf-titre').value.trim(),corps=document.getElementById('mf-corps').value.trim();
  const creche=document.getElementById('mf-creche').value,enfant=document.getElementById('mf-enfant').value||null;
  if(!titre||!corps){alert('Le titre et le message sont requis.');return;}
  if(!creche){alert('Choisissez une crèche.');return;}
  if(!currentProfile?.id){alert('Profil introuvable, reconnectez-vous.');return;}
  const btn=document.getElementById('btn-save-msg-familles');mfPending=true;btn.disabled=true;
  try{
    const saved=await dbInsert('famille_messages',{creche_id:creche,enfant_id:enfant,auteur_id:currentProfile.id,auteur_nom:currentProfile.name||'',titre:titre,corps:corps});
    if(!saved){showBanner('Erreur'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
    const nb=await mfPrevenir(creche,enfant,titre);
    showBanner('Information publiée dans l\'Espace famille !'+(nb==null?'':nb>0?' '+nb+' notification'+(nb>1?'s':'')+' envoyée'+(nb>1?'s':'')+'.':' Aucune notification envoyée (familles non abonnées, ou plage de silence).'));
    closeModal('modal-msg-familles-wrap');
  }finally{mfPending=false;btn.disabled=false;}
}
