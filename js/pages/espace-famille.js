/* ===========================================================================
   ESPACE-FAMILLE.HTML — espace d'une famille (code d'accès personnel)
   ---------------------------------------------------------------------------
   Aucune session Supabase : la famille n'a pas de compte. Elle saisit le code à
   8 caractères reçu de la crèche (ou ouvre le lien qui le contient). Tout passe par
   l'edge function `espace-famille` (service_role) : informations de la crèche,
   dépôt de documents, accès au suivi de l'enfant. Voir sql/espace_famille.sql.
   =========================================================================== */

const SUPABASE_URL = "https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const FN_URL = SUPABASE_URL + '/functions/v1/espace-famille';

const TOKEN = SessionLien.init({url:FN_URL,anonKey:SUPABASE_ANON_KEY});
const wrap = document.getElementById('wrap');
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const appel = (a,p) => SessionLien.appel(a,p);
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});

const TYPES_EXT={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',pdf:'application/pdf'};
const MAX_BYTES=8*1024*1024;
let DONNEES=null;

function etat(titre,msg,icone){
  wrap.innerHTML='<div class="state"><i class="ti ti-'+(icone||'alert-circle')+'"></i><h2>'+esc(titre)+'</h2><p>'+esc(msg)+'</p></div>';
}

/* Pas de code dans l'adresse : saisie du code reçu. Recharger la page avec ?t=… ouvre la session. */
function formulaireCode(message){
  wrap.innerHTML='<div class="card"><h2><i class="ti ti-key"></i> Votre code d\'accès</h2>'
    +'<p class="vide" style="margin-top:0">Saisissez le code à 8 caractères que la crèche vous a remis.</p>'
    +'<input type="text" id="code" class="code" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="ABCD2345"/>'
    +(message?'<div class="err">'+esc(message)+'</div>':'')
    +'<div style="margin-top:14px"><button class="btn" id="btnCode"><i class="ti ti-login"></i> Entrer</button></div></div>';
  const champ=document.getElementById('code');
  const aller=()=>{
    const c=champ.value.trim();
    if(c.length<6){champ.focus();return;}
    location.href=location.pathname+'?t='+encodeURIComponent(c);
  };
  document.getElementById('btnCode').addEventListener('click',aller);
  champ.addEventListener('keydown',e=>{if(e.key==='Enter')aller();});
  champ.focus();
}

function messageErreur(e){
  const m=(e&&e.message||'').toLowerCase();
  if(m.includes('trop_d_essais')||m.includes('429'))return 'Trop d\'essais. Patientez un quart d\'heure puis réessayez.';
  if(m.includes('format'))return 'Format non accepté : envoyez une photo (JPG, PNG) ou un PDF.';
  if(m.includes('trop_volumineux'))return 'Fichier trop volumineux (8 Mo max). Reprenez la photo.';
  if(m.includes('libelle'))return 'Indiquez de quel document il s\'agit.';
  if(m.includes('session'))return 'Session terminée : saisissez de nouveau votre code.';
  return 'Envoi impossible. Vérifiez votre connexion et réessayez.';
}

async function boot(){
  if(!TOKEN)return formulaireCode('');
  try{
    DONNEES=await appel('get');
    document.getElementById('sousTitre').textContent=
      (DONNEES.enfant.prenom?DONNEES.enfant.prenom+' · ':'')+(DONNEES.creche_nom||'Koala Kids');
    rendre();
  }catch(e){
    const m=(e.message||'').toLowerCase();
    if(m.includes('revoque'))etat('Accès désactivé','Cet accès n\'est plus valable. Contactez la crèche pour en obtenir un nouveau.','link-off');
    else if(m.includes('introuvable'))formulaireCode('Ce code ne correspond à aucun accès. Vérifiez-le (8 caractères, sans O ni 0).');
    else if(m.includes('trop_d_essais')||m.includes('429'))etat('Trop d\'essais','Patientez un quart d\'heure puis réessayez.','clock');
    else if(m.includes('session'))formulaireCode('Session terminée : saisissez de nouveau votre code.');
    else etat('Erreur','L\'espace n\'a pas pu être chargé. Réessayez dans un instant.','alert-triangle');
  }
}

function rendre(){
  const d=DONNEES;
  const msgs=d.messages.length
    ?d.messages.map(m=>'<div class="msg"><h3>'+esc(m.titre)+(m.nouveau?' <span class="nouveau">Nouveau</span>':'')
      +'</h3><div class="date">'+esc(fmtDate(m.created_at))+(m.auteur_nom?' · '+esc(m.auteur_nom):'')+'</div><p>'+esc(m.corps)+'</p></div>').join('')
    :'<p class="vide">Aucune information pour le moment.</p>';
  const deps=d.depots.length
    ?'<div style="margin-top:14px"><strong style="font-size:13px">Déjà envoyés</strong>'
      +d.depots.map(x=>'<div class="dep"><span>'+esc(x.nom)+'</span><span style="color:var(--muted)">'+esc(fmtDate(x.date))+'</span></div>').join('')+'</div>':'';
  wrap.innerHTML=
    '<div class="card"><h2><i class="ti ti-bell"></i> Informations de la crèche</h2>'+msgs+'</div>'
    +(d.suivi_token?'<div class="card"><h2><i class="ti ti-heart-handshake"></i> Suivi de '+esc(d.enfant.prenom||'votre enfant')+'</h2>'
      +'<p class="vide" style="margin-top:0">Les synthèses publiées par l\'équipe.</p>'
      +'<a class="btn btn-g" href="famille-suivi.html?t='+encodeURIComponent(d.suivi_token)+'"><i class="ti ti-external-link"></i> Ouvrir le suivi</a></div>':'')
    +'<div class="card"><h2><i class="ti ti-cloud-upload"></i> Envoyer un document</h2>'
    +'<p class="vide" style="margin-top:0">Certificat, attestation, ordonnance… (photo ou PDF, 8 Mo max). La crèche est prévenue.</p>'
    +'<label for="libelle">De quel document s\'agit-il ?</label>'
    +'<input type="text" id="libelle" maxlength="120" placeholder="Ex. : Attestation d\'assurance"/>'
    +'<label for="fichier">Fichier</label>'
    +'<input type="file" id="fichier" accept="image/*,application/pdf"/>'
    +'<div style="margin-top:14px"><button class="btn" id="btnEnvoi"><i class="ti ti-send"></i> Envoyer</button></div>'
    +'<div id="statut"></div>'+deps+'</div>';
  document.getElementById('btnEnvoi').addEventListener('click',envoyer);
}

function lireBase64(blob){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(new Error('lecture'));r.readAsDataURL(blob);});
}
/* Réduit les grosses photos avant l'envoi (réseau mobile). */
async function reduire(file,type){
  if(!/^image\/(jpeg|png|webp)$/.test(type)||file.size<600*1024)return{blob:file,type};
  try{
    const bmp=await createImageBitmap(file);
    const k=Math.min(1,2200/Math.max(bmp.width,bmp.height));
    const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.85));
    if(blob&&blob.size<file.size)return{blob,type:'image/jpeg'};
  }catch(e){}
  return{blob:file,type};
}

async function envoyer(){
  const st=document.getElementById('statut'),btn=document.getElementById('btnEnvoi');
  const libelle=document.getElementById('libelle').value.trim();
  const file=document.getElementById('fichier').files[0];
  const echec=t=>{st.className='err';st.textContent=t;};
  if(!libelle)return echec('Indiquez de quel document il s\'agit.');
  if(!file)return echec('Choisissez un fichier.');
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  let type=TYPES_EXT[ext]||(file.type||'').toLowerCase().replace('image/jpg','image/jpeg');
  if(!Object.values(TYPES_EXT).includes(type))return echec('Format non accepté : envoyez une photo (JPG, PNG) ou un PDF.');
  btn.disabled=true;st.className='vide';st.textContent='Envoi en cours…';
  try{
    const r=await reduire(file,type);
    if(r.blob.size>MAX_BYTES)throw new Error('trop_volumineux');
    await appel('upload',{libelle,filename:file.name,content_type:r.type,content_base64:await lireBase64(r.blob)});
    DONNEES.depots.unshift({nom:libelle+' — '+file.name,date:new Date().toISOString()});
    rendre();
    const s2=document.getElementById('statut');s2.className='ok';s2.textContent='Document envoyé ✅ La crèche est prévenue.';
  }catch(e){btn.disabled=false;echec(messageErreur(e));}
}

boot();
