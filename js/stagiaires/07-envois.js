/* ===== DOCUMENTS ENVOYÉS À LA PERSONNE (hors pièces demandées) ==============
   Sens crèche → stagiaire, propres à UNE fiche : convention à signer, consignes
   de stage, plan d'accès... Table stagiaires_envois (sql/stagiaires_envois.sql),
   fichiers dans le bucket `stagiaires` sous <id fiche>/envois/. La personne les
   ouvre depuis son lien (edge function dossier-stagiaire, action `envoi_url`). */
let stgEnvoisCache=[];
let stgEnvoisOk=true;

function stgEnvoisDe(id){return stgEnvoisCache.filter(e=>String(e.stagiaire_id)===String(id));}

async function stgRenderEnvois(){
  const zone=document.getElementById('stg-envois-zone');
  if(!zone||!stgFicheId)return;
  const id=stgFicheId;
  if(!zone.dataset.fiche||zone.dataset.fiche!==String(id)){
    zone.innerHTML='';zone.dataset.fiche=String(id);
    const r=await sb.from('stagiaires_envois').select('*').eq('stagiaire_id',id).order('created_at',{ascending:false});
    if(String(stgFicheId)!==String(id))return;
    stgEnvoisOk=!r.error;
    stgEnvoisCache=stgEnvoisCache.filter(e=>String(e.stagiaire_id)!==String(id)).concat(r.data||[]);
  }
  const s=stgCache.find(x=>String(x.id)===String(id));
  const liste=stgEnvoisDe(id);
  let h='<div style="font-weight:700;font-size:13px;margin-bottom:4px"><i class="ti ti-send" style="color:var(--koala)"></i> Documents envoyés à '
    +escHtml((s&&s.prenom)||'la personne')+'</div>'
    +'<p style="font-size:11.5px;color:var(--muted);margin:0 0 9px">Fichiers autres que les pièces demandées ci-dessus, visibles '
    +'<b>uniquement</b> par cette personne dans son lien (photo ou PDF, 12 Mo maximum).</p>';
  if(!stgEnvoisOk){
    zone.innerHTML=h+'<p style="font-size:12.5px;color:var(--red)">Indisponible : le script <code>sql/stagiaires_envois.sql</code> '
      +'n\'a pas encore été appliqué sur Supabase.</p>';
    return;
  }
  h+=liste.map(e=>
    '<div style="display:flex;align-items:center;gap:7px;background:#FAFAFD;border:1px solid var(--border);border-radius:7px;padding:6px 9px;margin-bottom:5px;flex-wrap:wrap">'
    +'<button type="button" onclick="stgOuvrirEnvoi(\''+e.id+'\')" title="Ouvrir" style="flex:1;min-width:110px;text-align:left;border:none;background:none;padding:0;cursor:pointer;'
    +'font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    +escHtml(e.libelle||e.filename||'Document')+'</button>'
    +'<span style="font-size:10.5px;color:'+(e.ouvert_le?'var(--green)':'var(--muted)')+'">'
    +(e.ouvert_le?'ouvert le '+escHtml(new Date(e.ouvert_le).toLocaleDateString('fr-FR')):'pas encore ouvert')+'</span>'
    +'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--red)" title="Retirer" onclick="stgSupprimerEnvoi(\''+e.id+'\')"><i class="ti ti-trash"></i></button>'
    +(e.message?'<div style="flex:0 0 100%;font-size:11px;color:var(--muted)">'+escHtml(e.message)+'</div>':'')
    +'</div>').join('');
  h+='<div style="display:grid;gap:6px;margin-top:6px">'
    +'<input id="stg-envoi-titre" class="input" placeholder="Titre vu par la personne (ex. Convention à signer)" maxlength="120">'
    +'<input id="stg-envoi-msg" class="input" placeholder="Petit mot (facultatif)" maxlength="300">'
    +'<div><button class="btn-sm" onclick="document.getElementById(\'stg-envoi-fichier\').click()"><i class="ti ti-upload"></i> Choisir et envoyer un fichier</button>'
    +'<input type="file" id="stg-envoi-fichier" accept="image/*,application/pdf" style="display:none" onchange="stgEnvoiUpload(event)">'
    +' <span id="stg-envoi-st" style="font-size:11.5px;color:var(--muted)"></span></div></div>';
  zone.innerHTML=h;
}

async function stgEnvoiUpload(ev){
  const input=ev.target,file=(input.files||[])[0];
  input.value='';
  if(!file||!stgFicheId)return;
  const st=document.getElementById('stg-envoi-st');
  if(file.size>12*1024*1024){if(st)st.textContent='⚠ Fichier trop lourd (12 Mo maximum).';return;}
  const titre=((document.getElementById('stg-envoi-titre')||{}).value||'').trim()||file.name;
  const msg=((document.getElementById('stg-envoi-msg')||{}).value||'').trim()||null;
  if(st)st.textContent='⏳ Envoi de '+file.name+'…';
  const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,5)||'bin';
  const path=stgFicheId+'/envois/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
  try{
    const {error}=await sb.storage.from(STG_BUCKET).upload(path,file);
    if(error)throw error;
    const {data,error:ie}=await sb.from('stagiaires_envois').insert({
      stagiaire_id:stgFicheId,libelle:titre,message:msg,bucket:STG_BUCKET,path:path,
      filename:file.name,mime:file.type||null,taille:file.size,
      envoye_par:(currentProfile&&currentProfile.name)||(currentUser&&currentUser.email)||'la crèche'
    }).select().single();
    if(ie){await sb.storage.from(STG_BUCKET).remove([path]);throw ie;}
    stgEnvoisCache.push(data);
    stgRenderEnvois();
    showBanner('Document ajouté au lien de la personne ✅');
  }catch(e){
    console.error('[Stagiaires] envoi',e.message);
    if(st)st.textContent='⚠ Erreur : '+e.message;
  }
}

async function stgOuvrirEnvoi(id){
  const e=stgEnvoisCache.find(x=>String(x.id)===String(id));
  if(!e)return;
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(e.bucket||STG_BUCKET,e.path,{entite_type:'stagiaire',entite_id:e.stagiaire_id,libelle:e.filename});
  const {data,error}=await sb.storage.from(e.bucket||STG_BUCKET).createSignedUrl(e.path,STG_URL_TTL);
  if(error||!data)return alert('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'));
  window.open(data.signedUrl,'_blank','noopener');
}

async function stgSupprimerEnvoi(id){
  const e=stgEnvoisCache.find(x=>String(x.id)===String(id));
  if(!e)return;
  if(!confirm('Retirer « '+(e.libelle||e.filename||'ce document')+' » ?\n\nLa personne ne le verra plus dans son lien.'))return;
  const ok=await dbDelete('stagiaires_envois',id);
  if(!ok)return showBanner('Suppression impossible.','error');
  await sb.storage.from(e.bucket||STG_BUCKET).remove([e.path]);
  stgEnvoisCache=stgEnvoisCache.filter(x=>String(x.id)!==String(id));
  stgRenderEnvois();
  showBanner('Document retiré.');
}
