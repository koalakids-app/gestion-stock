/* ===========================================================================
   PIECES-EMPLOYE.HTML — page publique de dépôt des documents d'embauche
   ---------------------------------------------------------------------------
   Aucune session Supabase ici : le/la salarié(e) n'a pas forcément de
   compte. Tout passe par l'edge function `dossier-pieces-employe`, qui
   s'exécute en service_role et ne renvoie/n'écrit que ce qui correspond au
   jeton de l'URL. Aucune table n'est interrogée directement — voir
   sql/dossiers_pieces_employe.sql.

   Même principe que pieces.html côté famille (jeton, lien à durée limitée),
   pipeline entièrement distincte.

   La liste des pièces (PIECES) est RECOPIÉE de employes.html (constante
   PIECES_EMBAUCHE) : si vous la modifiez là-bas, reportez-la ici — les deux
   versions ne se synchronisent pas (même choix assumé que pour pieces.html /
   demandes.html).
   =========================================================================== */

const SUPABASE_URL = "https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const FN_URL = SUPABASE_URL + '/functions/v1/dossier-pieces-employe';

/* Le lien n'ouvre qu'une session courte (js/session-lien.js) : jeton retiré de l'adresse,
   fermeture après inactivité, avertissement avant la fin. */
const TOKEN = SessionLien.init({url:FN_URL,anonKey:SUPABASE_ANON_KEY});
const wrap  = document.getElementById('wrap');

const PIECES = [
  {key:'cv',                     label:'CV'},
  {key:'piece_identite',         label:"Carte d'identité recto/verso"},
  {key:'carte_vitale',           label:'Carte vitale'},
  {key:'justificatif_domicile',  label:'Justificatif de domicile (facture téléphone / EDF)'},
  {key:'diplomes',                label:'Copie des derniers diplômes'},
  {key:'certificat_formation',    label:'Certificat de formation',optionnel:true},
  {key:'certificat_medical',      label:"Certificat médical d'aptitude"},
  {key:'attestation_honorabilite',label:"Attestation d'honorabilité"},
  {key:'casier_judiciaire',       label:'Extrait de casier judiciaire (bulletin n°3)'},
  {key:'carnet_sante_vaccins',    label:'Extrait du carnet de santé (partie vaccins)'},
  {key:'rib',                     label:"Relevé d'identité bancaire"}
];
const MAX_BYTES = 8*1024*1024;

let DOSSIER=null, EMPLOYE=null, PIECES_DEPOSEES=[];

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
    DOSSIER=d.dossier;EMPLOYE=d.employe;PIECES_DEPOSEES=d.pieces||[];
    // Branding cosmétique : nom de l'organisation, jamais utilisé pour une
    // décision de sécurité (l'edge function a déjà tout vérifié).
    if(d.organisation?.nom)document.title=document.title.replace(/Koala ?Kids/i,d.organisation.nom);
    document.getElementById('sousTitre').textContent=
      (EMPLOYE.prenom||'')+(EMPLOYE.creche_nom?' · '+EMPLOYE.creche_nom:'');
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

  let h='<div class="intro">Merci de déposer ici les documents demandés pour votre dossier d’embauche'
    +(EMPLOYE.prenom?(', '+esc(EMPLOYE.prenom)):'')+'. Vous pouvez les envoyer en plusieurs fois, depuis votre '
    +'téléphone : une photo lisible suffit.'
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
        ? '<span class="badge b-att">Le cas échéant</span>'
        : '<span class="badge b-att">À déposer</span>';
      sousTexte=p.optionnel?'Ne s’applique pas à tout le monde.':'Pas encore reçu.';
    }else{
      ic='ic ok';
      badge='<span class="badge b-ok">✓ Déposé</span>';
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

async function deposer(key,input){
  const file=input.files&&input.files[0];
  if(!file)return;
  const status=document.getElementById('st-'+key);
  if(file.size>MAX_BYTES){
    if(status){status.textContent='⚠ Fichier trop volumineux (8 Mo max). Compressez-le ou reprenez la photo.';status.style.color='var(--red)';}
    input.value='';
    return;
  }
  if(status){status.textContent='⏳ Envoi en cours…';status.style.color='var(--muted)';}
  try{
    const b64=await fileToBase64(file);
    await appel('upload',{piece_key:key,filename:file.name,content_type:file.type||'application/octet-stream',content_base64:b64});
    PIECES_DEPOSEES.unshift({piece_key:key,filename:file.name,created_at:new Date().toISOString()});
    toast('Document envoyé ✅');
    render();
  }catch(e){
    if(status){status.textContent='⚠ Erreur : '+e.message;status.style.color='var(--red)';}
  }
  input.value='';
}
window.deposer=deposer;

boot();
