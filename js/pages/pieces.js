/* ===========================================================================
   PIECES.HTML — page publique de dépôt des documents administratifs
   ---------------------------------------------------------------------------
   Aucune session Supabase ici : la famille n'a pas de compte. Tout passe par
   l'edge function `dossier-pieces`, qui s'exécute en service_role et ne
   renvoie/n'écrit que ce qui correspond au jeton de l'URL. Aucune table n'est
   interrogée directement — voir sql/dossiers_pieces.sql.

   Pipeline distincte de famille.html (dossier de familiarisation) : même
   principe (jeton, lien à durée limitée), mais un dépôt de fichiers plutôt
   que des formulaires à remplir/signer.

   La liste des pièces (PIECES) est RECOPIÉE de demandes.html (constante
   PIECES_ADMIN) : si vous la modifiez là-bas, reportez-la ici — les deux
   versions ne se synchronisent pas (même choix assumé que pour les modèles
   de famille.html/documents.html).
   =========================================================================== */

const SUPABASE_URL = "https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const FN_URL = SUPABASE_URL + '/functions/v1/dossier-pieces';

/* Le lien n'ouvre qu'une session courte (js/session-lien.js) : jeton retiré de l'adresse,
   fermeture après inactivité, avertissement avant la fin. */
const TOKEN = SessionLien.init({url:FN_URL,anonKey:SUPABASE_ANON_KEY});
const wrap  = document.getElementById('wrap');

const PIECES = [
  {key:'livret_famille',        label:'Copie du livret de famille'},
  {key:'piece_identite_parents',label:"Copie de la pièce d'identité des parents"},
  {key:'justificatif_domicile', label:'Justificatif de domicile de moins de trois mois'},
  {key:'acte_naissance',        label:"Copie intégrale de l'acte de naissance de l'enfant"},
  {key:'attestation_vitale',    label:'Attestation de la carte vitale'},
  {key:'attestation_rc',        label:'Attestation de responsabilité civile pour l’année en cours',renouveler:true},
  {key:'autorite_parentale',    label:"Justificatif de l'autorité parentale (couples séparés/divorcés)",optionnel:true},
  {key:'avis_imposition',       label:"Copie du dernier avis d'imposition"},
  {key:'bulletin_salaire',      label:'Dernier bulletin de salaire ou attestation Pôle Emploi'},
  {key:'rib',                   label:"Relevé d'identité bancaire"}
];
const MAX_BYTES = 8*1024*1024;
const UN_AN_MS  = 365*86400000;

let DOSSIER=null, ENFANT=null, PIECES_DEPOSEES=[];

const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dfr = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';

let toastT=null;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('on');
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600);
}

function etat(cls,titre,msg,icone){
  wrap.innerHTML='<div class="state '+cls+'"><i class="ti ti-'+(icone||'alert-circle')+'"></i>'
    +'<h2>'+esc(titre)+'</h2><p>'+esc(msg)+'</p></div>';
}

function appel(action,payload){
  return SessionLien.appel(action,payload);
}

async function boot(){
  if(!TOKEN)return etat('err','Lien incomplet','Ce lien ne contient pas de jeton. Utilisez celui reçu par e-mail.','link-off');
  try{
    const d=await appel('get');
    DOSSIER=d.dossier;ENFANT=d.enfant;PIECES_DEPOSEES=d.pieces||[];
    // Branding cosmétique : nom de l'organisation, jamais utilisé pour une
    // décision de sécurité (l'edge function a déjà tout vérifié).
    if(d.organisation?.nom)document.title=document.title.replace(/Koala ?Kids/i,d.organisation.nom);
    document.getElementById('sousTitre').textContent=
      (ENFANT.prenom||'')+(ENFANT.creche_nom?' · '+ENFANT.creche_nom:'');
    render();
  }catch(e){
    const m=(e.message||'').toLowerCase();
    if(m.includes('expir'))
      etat('err','Lien expiré','Ce lien n’est plus valable. Contactez la crèche, elle vous en enverra un nouveau.','clock-off');
    else if(m.includes('introuvable')||m.includes('annule'))
      etat('err','Lien invalide','Ce lien ne correspond à aucun dossier actif. Vérifiez que vous l’avez copié en entier.','link-off');
    else
      etat('err','Erreur','Le dossier n’a pas pu être chargé. Réessayez dans un instant.','alert-triangle');
  }
}

function piecesPour(key){
  return PIECES_DEPOSEES.filter(p=>p.piece_key===key);
}

function render(){
  const requis=PIECES.filter(p=>!p.optionnel);
  const recus=requis.filter(p=>piecesPour(p.key).length).length;
  const pct=requis.length?Math.round(recus/requis.length*100):100;

  let h='<div class="intro">Merci de déposer ici les documents administratifs demandés pour le dossier de '
    +esc(ENFANT.prenom||'votre enfant')+'. Vous pouvez les envoyer en plusieurs fois, depuis votre téléphone : '
    +'une photo lisible suffit.'
    +'<br><br>Ce lien est valable jusqu’au <b>'+esc(dfr(DOSSIER.expire_le))+'</b>.</div>';

  h+='<div class="card"><div style="font-weight:700;font-size:14px">Votre avancement</div>'
    +'<div class="prog"><i style="width:'+pct+'%"></i></div>'
    +'<div class="progtxt">'+recus+' pièce'+(recus>1?'s':'')+' déposée'+(recus>1?'s':'')
    +' sur '+requis.length+' demandées (hors pièces qui ne vous concernent peut-être pas)</div></div>';

  PIECES.forEach(p=>{
    const fichiers=piecesPour(p.key);
    const dernier=fichiers[0];
    let ic='ic', badge, sousTexte;
    if(!dernier){
      badge=p.optionnel
        ? '<span class="badge b-att">Si concerné(e)</span>'
        : '<span class="badge b-att">À déposer</span>';
      sousTexte=p.optionnel?'Ne s’applique pas à toutes les familles.':'Pas encore reçu.';
    }else{
      ic='ic ok';
      const perime=p.renouveler && (Date.now()-new Date(dernier.created_at).getTime())>UN_AN_MS;
      badge='<span class="badge b-ok">✓ Déposé</span>'+(perime?'<span class="badge b-renew">À renouveler</span>':'');
      sousTexte='Reçu le '+dfr(dernier.created_at)+(fichiers.length>1?' ('+fichiers.length+' fichiers)':'');
    }
    const inputId='f-'+p.key;
    h+='<div class="piece"><div class="row">'
      +'<span class="'+ic+'"><i class="ti ti-'+(dernier?'circle-check':'file-upload')+'"></i></span>'
      +'<span class="tx"><b>'+esc(p.label)+'</b><span>'+badge+' &nbsp;'+sousTexte+'</span></span>'
      +'<button class="btn '+(dernier?'btn-g':'btn-p')+'" onclick="document.getElementById(\''+inputId+'\').click()">'
      +'<i class="ti ti-upload"></i> '+(dernier?'Ajouter':'Déposer')+'</button>'
      +'</div>'
      +'<input type="file" id="'+inputId+'" accept="image/*,application/pdf" style="display:none" '
      +'onchange="deposer(\''+p.key+'\',this)">'
      +'<span id="st-'+p.key+'" style="display:block;margin-top:8px;font-size:12px;color:var(--muted)"></span>'
      +'</div>';
  });

  if(recus===requis.length){
    h+='<div class="card" style="background:var(--green-bg);border-color:#BFE3CB;color:var(--green);font-weight:600">'
      +'<i class="ti ti-circle-check"></i> Merci ! Tous les documents demandés ont été déposés.</div>';
  }
  wrap.innerHTML=h;
  window.scrollTo(0,0);
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
    reader.onerror=()=>reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

/* Types acceptés par le bucket (voir sql/documents_admin_carnets_bucket_hardening.sql).
   Certains téléphones envoient un type vide ou « image/jpg » : on le déduit de l'extension. */
const TYPES_EXT={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
  heic:'image/heic',heif:'image/heif',pdf:'application/pdf'};
function typeFichier(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(TYPES_EXT[ext])return TYPES_EXT[ext];
  const t=(file.type||'').toLowerCase();
  return t==='image/jpg'?'image/jpeg':t;
}

/* Réduit les grosses photos (JPEG/PNG/WebP) avant l'envoi : une photo de téléphone
   fait souvent plus de 8 Mo en base64 et l'envoi échouait sur réseau mobile. */
async function reduireImage(file,type){
  if(!/^image\/(jpeg|png|webp)$/.test(type)||file.size<600*1024)return {blob:file,type};
  try{
    const bmp=await createImageBitmap(file);
    const max=2200,k=Math.min(1,max/Math.max(bmp.width,bmp.height));
    const c=document.createElement('canvas');
    c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.85));
    if(blob&&blob.size<file.size)return {blob,type:'image/jpeg'};
  }catch(e){}
  return {blob:file,type};
}

function messageErreur(e){
  const m=(e&&e.message||'').toLowerCase();
  if(m.includes('expir'))return 'Ce lien a expiré. Contactez la crèche.';
  if(m.includes('fichier_trop_volumineux'))return 'Fichier trop volumineux (8 Mo max). Reprenez la photo.';
  if(m.includes('format'))return 'Format non accepté : envoyez une photo (JPG, PNG) ou un PDF.';
  if(m.includes('session'))return 'Session terminée : rouvrez le lien reçu.';
  if(m.includes('upload_impossible')||m.includes('enregistrement_impossible')||/erreur 5/.test(m))
    return 'Le serveur n’a pas pu enregistrer ce fichier. Réessayez dans un instant ou avec un autre format.';
  return 'Envoi impossible. Vérifiez votre connexion et réessayez.';
}

async function deposer(key,input){
  const file=input.files&&input.files[0];
  if(!file)return;
  const status=document.getElementById('st-'+key);
  if(file.size>MAX_BYTES*3){
    if(status){status.textContent='⚠ Fichier trop volumineux (8 Mo max). Compressez-le ou reprenez la photo.';status.style.color='var(--red)';}
    input.value='';
    return;
  }
  if(status){status.textContent='⏳ Envoi en cours…';status.style.color='var(--muted)';}
  try{
    const r=await reduireImage(file,typeFichier(file));
    if(!Object.values(TYPES_EXT).includes(r.type))throw new Error('format');
    if(r.blob.size>MAX_BYTES)throw new Error('fichier_trop_volumineux');
    const b64=await fileToBase64(r.blob);
    await appel('upload',{piece_key:key,filename:file.name,content_type:r.type,content_base64:b64});
    PIECES_DEPOSEES.unshift({piece_key:key,filename:file.name,created_at:new Date().toISOString()});
    toast('Document envoyé ✅');
    render();
  }catch(e){
    if(status){status.textContent='⚠ '+messageErreur(e);status.style.color='var(--red)';}
  }
  input.value='';
}
window.deposer=deposer;

boot();
