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
const FN_RENVOI = SUPABASE_URL + '/functions/v1/renvoyer-lien-famille';

/* Code mémorisé sur l'appareil (accord explicite de la famille : case à cocher ou bouton « Garder l'accès »).
   Le code n'est jamais stocké sans ce choix ; il est effacé si l'accès est révoqué ou si la famille l'oublie.
   Il sert à rouvrir une session courte (SessionLien) quand la page est ouverte sans ?t=. */
const CLE_CODE='kk_famille_code';
const lireCode=()=>{try{return localStorage.getItem(CLE_CODE)||'';}catch(e){return '';}};
const garderCode=c=>{try{localStorage.setItem(CLE_CODE,c);}catch(e){}};
const oublierCode=()=>{try{localStorage.removeItem(CLE_CODE);}catch(e){}};
const CODE_LIEN=(new URLSearchParams(location.search).get('t')||'').trim();
const CODE_MEMO=lireCode();
const CODE=CODE_LIEN||CODE_MEMO;
if(!CODE_LIEN&&CODE_MEMO){
  /* ouverture sans lien (icône de l'écran d'accueil, favori) : on rouvre avec le code mémorisé */
  try{history.replaceState(null,'',location.pathname+'?t='+encodeURIComponent(CODE_MEMO));}catch(e){}
}
if(CODE_LIEN&&CODE_MEMO&&CODE_LIEN!==CODE_MEMO)garderCode(CODE_LIEN);   // nouveau code reçu : on met à jour le code gardé
const TOKEN = SessionLien.init({url:FN_URL,anonKey:SUPABASE_ANON_KEY});
const wrap = document.getElementById('wrap');
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const appel = (a,p) => SessionLien.appel(a,p);
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});

const TYPES_EXT={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',pdf:'application/pdf'};
const MAX_BYTES=8*1024*1024;
let DONNEES=null;

/* Règlement « produits d'hygiène et médicaments » : même texte que le modèle de Documents
   (reglement_medicaments, js/pages/documents/03-part.js) et que le dossier de familiarisation
   (js/pages/famille.js). Garder les trois en phase si le règlement change. */
const RM_TABLE=[
 ['Savon liquide','Sirop antibiotique'],
 ['Crème pour le change','Collyre'],
 ['Liniment oléo-calcaire','Médicaments pour les reflux (gaviscon…)'],
 ['Huile d’amande douce','Médicaments pour le transit (smecta, débridat, tiorfan…)'],
 ['Les produits anti-moustiques : lotions, crèmes, sprays et bracelets… Si besoin, les parents en mettent à leur enfant AVANT de le déposer à la crèche, ou dans un contexte médical particulier, avec l’accord de l’équipe.','Les boîtes de lait'],
 ['Les crèmes solaires : les parents apportent la crème solaire pour leur(s) enfant(s) ET signent l’autorisation','Gouttes et pipettes pour les poussées dentaires…']
];
const TYPE_FERM={vacances:'Vacances',ferie:'Jour férié',pedagogique:'Journée pédagogique'};
function dateCourte(d){return new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'long',year:'numeric'});}
function periodeFermeture(f){return f.fin&&f.fin!==f.debut?'du '+dateCourte(f.debut)+' au '+dateCourte(f.fin):dateCourte(f.debut);}

/* Pictogrammes du code de pointage (mêmes images que la tablette et l'e-mail « code image »). */
const PICTOS_URL='https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/';
const PICTOS_NOM={ours:'Ours',arc_en_ciel:'Arc-en-ciel',zebre:'Zèbre',hochet:'Hochet',baleine:'Baleine',cubes_alphabet:'Cubes alphabet',camionnette_rouge:'Camionnette rouge',pingouin:'Pingouin'};

function etat(titre,msg,icone){
  wrap.innerHTML='<div class="state"><i class="ti ti-'+(icone||'alert-circle')+'"></i><h2>'+esc(titre)+'</h2><p>'+esc(msg)+'</p></div>';
}

/* Pas de code dans l'adresse : saisie du code reçu. Recharger la page avec ?t=… ouvre la session. */
function formulaireCode(message){
  wrap.innerHTML='<div class="card"><h2><i class="ti ti-key"></i> Votre code d\'accès</h2>'
    +'<p class="vide" style="margin-top:0">Saisissez le code à 8 caractères que la crèche vous a remis.</p>'
    +'<input type="text" id="code" class="code" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="ABCD2345"/>'
    +(message?'<div class="err">'+esc(message)+'</div>':'')
    +'<label class="souvenir"><input type="checkbox" id="souvenir" checked/> <span>Garder mon accès sur cet appareil (à ne pas cocher sur un appareil partagé)</span></label>'
    +'<div style="margin-top:14px"><button class="btn" id="btnCode"><i class="ti ti-login"></i> Entrer</button></div></div>'
    +'<div class="card" id="carteRenvoi"><h2><i class="ti ti-mail"></i> Code ou lien perdu ?</h2>'
    +'<p class="vide" style="margin-top:0">Saisissez l\'adresse e-mail que vous avez donnée à la crèche : nous vous renvoyons votre lien.</p>'
    +'<input type="email" id="mailRenvoi" autocomplete="email" inputmode="email" placeholder="prenom.nom@exemple.fr" style="font:inherit;width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 13px"/>'
    +'<div id="retourRenvoi" class="vide" role="status" style="margin-top:8px"></div>'
    +'<div style="margin-top:10px"><button class="btn btn-g" id="btnRenvoi"><i class="ti ti-send"></i> Recevoir mon lien par e-mail</button></div></div>';
  const champ=document.getElementById('code');
  const aller=()=>{
    const c=champ.value.trim();
    if(c.length<6){champ.focus();return;}
    if(document.getElementById('souvenir').checked)garderCode(c);else oublierCode();
    location.href=location.pathname+'?t='+encodeURIComponent(c);
  };
  document.getElementById('btnCode').addEventListener('click',aller);
  champ.addEventListener('keydown',e=>{if(e.key==='Enter')aller();});
  champ.focus();
  document.getElementById('btnRenvoi').addEventListener('click',renvoyerLien);
}

/* Renvoi du lien par e-mail : la réponse est toujours neutre (adresse connue ou non). */
async function renvoyerLien(){
  const champ=document.getElementById('mailRenvoi'),ret=document.getElementById('retourRenvoi'),btn=document.getElementById('btnRenvoi');
  const mail=champ.value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){ret.textContent='Saisissez une adresse e-mail valide.';champ.focus();return;}
  btn.disabled=true;ret.textContent='Envoi…';
  try{
    const r=await fetch(FN_RENVOI,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},body:JSON.stringify({email:mail})});
    if(r.status===429)ret.textContent='Trop de demandes. Réessayez dans une heure.';
    else if(!r.ok)ret.textContent='Envoi impossible. Vérifiez l\'adresse et réessayez.';
    else{ret.textContent='Si cette adresse est connue de la crèche, un e-mail avec votre lien vient de vous être envoyé. Pensez à regarder vos courriers indésirables.';return;}
  }catch(e){ret.textContent='Envoi impossible. Vérifiez votre connexion et réessayez.';}
  btn.disabled=false;
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
    if(m.includes('revoque')||m.includes('introuvable'))oublierCode();   // code mémorisé devenu inutile
    if(m.includes('revoque'))etat('Accès désactivé','Cet accès n\'est plus valable. Contactez la crèche pour en obtenir un nouveau.','link-off');
    else if(m.includes('introuvable'))formulaireCode('Ce code ne correspond à aucun accès. Vérifiez-le (8 caractères, sans O ni 0).');
    else if(m.includes('trop_d_essais')||m.includes('429'))etat('Trop d\'essais','Patientez un quart d\'heure puis réessayez.','clock');
    else if(m.includes('session'))formulaireCode('Session terminée : saisissez de nouveau votre code.');
    else etat('Erreur','L\'espace n\'a pas pu être chargé. Réessayez dans un instant.','alert-triangle');
  }
}

function carteDocuments(d){
  const docs=d.documents||[];
  if(!docs.length)return '';
  const ICO={devis:'file-euro',contrat:'file-certificate'};
  return '<div class="card"><h2><i class="ti ti-files"></i> Vos documents</h2>'
    +docs.map(x=>'<div class="dep"><span><i class="ti ti-'+(ICO[x.type]||'file')+'"></i> '+esc(x.titre)
      +'<br><small style="color:var(--muted)">au '+esc(fmtDate(x.date))+'</small></span>'
      +'<button class="btn btn-g" data-doc="'+esc(x.id)+'"><i class="ti ti-download"></i> Ouvrir</button></div>').join('')
    +'<div id="docStatut"></div></div>';
}

function carteFermetures(d){
  const f=d.fermetures||[];
  return '<div class="card"><h2><i class="ti ti-calendar-off"></i> Fermetures de la crèche</h2>'
    +(f.length?f.map(x=>'<div class="dep"><span><b>'+esc(x.label||TYPE_FERM[x.type]||'Fermeture')+'</b>'
      +(x.label&&TYPE_FERM[x.type]?' <small style="color:var(--muted)">· '+esc(TYPE_FERM[x.type])+'</small>':'')
      +'<br><small>'+esc(periodeFermeture(x))+'</small></span></div>').join('')
      :'<p class="vide" style="margin:0">Aucune fermeture annoncée pour le moment.</p>')+'</div>';
}

function carteReglement(){
  return '<div class="card"><h2><i class="ti ti-gavel"></i> Règlement intérieur</h2>'
    +'<p class="vide" style="margin-top:0">Produits d’hygiène, médicaments et appareillages.</p>'
    +'<details><summary class="btn btn-g" style="list-style:none">Lire le règlement</summary>'
    +'<div class="reglement"><b>Réglementation concernant les ordonnances</b>'
    +'<ul><li>Les parents sont responsables de la surveillance médicale de leur enfant et de l’administration des médicaments prescrits par le médecin.</li>'
    +'<li>L’administration des médicaments en crèche est faite par le personnel, sur délégation écrite du (des) parent(s) et sous condition de fournir l’ordonnance en lien avec le traitement.</li></ul>'
    +'L’ordonnance doit comporter de manière précise et lisible : nom ET prénom de l’enfant, date de prescription, nom complet du médicament (mention et nom lisible du générique le cas échéant), posologie précise (quantité, nombre de prises…), durée du traitement.<br><br>'
    +'<b>Réglementation concernant les appareillages</b><br>Dans l’intérêt de l’enfant, tout appareillage médical ou paramédical (attelle, casque, plâtre…) doit faire l’objet d’une prescription médicale précise et détaillée, réévaluée par le médecin si besoin.<br><br>'
    +'<b>Les bijoux sont INTERDITS (collier d’ambre inclus).</b>'
    +'<table><tr><th>Produits d’hygiène — produits neufs et fermés, avec date limite d’utilisation optimale</th><th>Médicaments avec ordonnance — même ceux obtenus sans prescription médicale, et autorisation parentale d’administrer</th></tr>'
    +RM_TABLE.map(r=>'<tr><td>'+esc(r[0])+'</td><td>'+esc(r[1])+'</td></tr>').join('')+'</table></div></details></div>';
}

/* Ouvre un PDF (devis, contrat) : la fenêtre est ouverte tout de suite, pour que le navigateur du
   téléphone ne la bloque pas, puis dirigée vers le lien signé (valable 2 minutes). */
async function ouvrirDocument(id,btn){
  const st=document.getElementById('docStatut');
  const w=window.open('','_blank');
  btn.disabled=true;
  try{
    const r=await appel('document',{doc_id:id});
    if(w)w.location.href=r.url;else location.href=r.url;
    if(st){st.className='';st.textContent='';}
  }catch(e){
    if(w)w.close();
    if(st){st.className='err';st.textContent='Ce document n’a pas pu être ouvert. Réessayez dans un instant.';}
  }finally{btn.disabled=false;}
}

/* ------------------------------------------------------------------ navigation par onglets
   Accueil (le dernier message, le code de pointage, la prochaine fermeture), Infos (tous les
   messages, repliés sauf le plus récent), Documents (PDF + dépôt), Crèche (contacts, fermetures,
   menu, règlement). Plus besoin de tout dérouler pour trouver la dernière information. */
const ONGLETS=[['accueil','home','Accueil'],['infos','bell','Infos'],['docs','files','Documents'],['creche','building-community','Crèche']];
let ONGLET='accueil',MSG_OUVERT=null;

function allerA(onglet,msgId){
  ONGLET=onglet;MSG_OUVERT=msgId||null;
  rendre();
  window.scrollTo({top:0,behavior:'smooth'});
}

const ROLES_CONTACT={directeur:'Directeur / directrice',coordinateur:'Coordinateur',gestionnaire:'Gestionnaire',autre:'Contact'};
const heureCourte=h=>String(h||'').slice(0,5).replace(':','h');
const tel=t=>String(t||'').replace(/[^\d+]/g,'');

function extrait(t,n){t=String(t||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n).trimEnd()+'…':t;}

function carteMessage(m,ouvert){
  return '<details class="msg-d"'+(ouvert?' open':'')+'><summary><span class="msg-t">'+esc(m.titre)
    +(m.nouveau?' <span class="nouveau">Nouveau</span>':'')+'</span>'
    +'<span class="date">'+esc(fmtDate(m.created_at))+'</span></summary>'
    +'<p>'+esc(m.corps)+'</p>'+(m.auteur_nom?'<div class="date">'+esc(m.auteur_nom)+'</div>':'')+'</details>';
}

function carteContacts(d){
  const c=d.contacts||{creche:{},personnes:[]},cr=c.creche||{};
  const horaires=cr.ouverture&&cr.fermeture?'Ouvert de '+heureCourte(cr.ouverture)+' à '+heureCourte(cr.fermeture):'';
  const lignes=(t,m)=>(t?'<a class="btn btn-g" href="tel:'+esc(tel(t))+'"><i class="ti ti-phone"></i> '+esc(t)+'</a> ':'')
    +(m?'<a class="btn btn-g" href="mailto:'+esc(m)+'"><i class="ti ti-mail"></i> Écrire</a>':'');
  let h='<div class="card"><h2><i class="ti ti-address-book"></i> Nous contacter</h2>'
    +'<div class="ctc"><b>'+esc(cr.nom||d.creche_nom||'La crèche')+'</b>'
    +(cr.adresse?'<div class="vide"><a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(cr.adresse)+'" target="_blank" rel="noopener" style="color:inherit"><i class="ti ti-map-pin"></i> '+esc(cr.adresse)+'</a></div>':'')
    +(horaires?'<div class="vide"><i class="ti ti-clock"></i> '+esc(horaires)+'</div>':'')
    +'<div class="ctc-btn">'+(lignes(cr.telephone,cr.email)||'<span class="vide">Coordonnées non renseignées.</span>')+'</div></div>';
  (c.personnes||[]).forEach(p=>{
    h+='<div class="ctc"><b>'+esc(p.nom)+'</b> <span class="role">'+esc(ROLES_CONTACT[p.role]||'Contact')+'</span>'
      +(p.fonction?'<div class="vide">'+esc(p.fonction)+'</div>':'')
      +'<div class="ctc-btn">'+lignes(p.telephone,p.email)+'</div></div>';
  });
  return h+'</div>';
}

function cartePointage(d){
  const pr=esc(d.enfant.prenom||'votre enfant');
  return d.enfant.code_pictos
    ?'<div class="card"><h2><i class="ti ti-photo"></i> Code de pointage de '+pr+'</h2>'
      +'<p class="vide" style="margin-top:0">À l\'arrivée et au départ, touchez ces 4 images <strong>dans cet ordre</strong> sur la tablette de la crèche.</p>'
      +'<div class="pictos">'+d.enfant.code_pictos.map((id,i)=>'<div class="picto"><span class="rang">'+(i+1)+'</span><img src="'+esc(PICTOS_URL+encodeURIComponent(id)+'.png')+'" alt="'+esc(PICTOS_NOM[id]||id)+'" width="72" height="72"><small>'+esc(PICTOS_NOM[id]||id)+'</small></div>').join('')+'</div>'
      +'<p class="vide" style="margin-bottom:0">Ce code est personnel : ne le partagez qu\'avec les personnes qui déposent ou récupèrent votre enfant.</p></div>'
    :'<div class="card"><h2><i class="ti ti-photo"></i> Code de pointage</h2><p class="vide" style="margin:0">Le code image de '+pr+' n\'est pas encore attribué. Demandez-le à la crèche.</p></div>';
}

/* Carte « Garder l'accès » : installation sur l'écran d'accueil + code gardé sur l'appareil. */
const EN_APPLI=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
const EST_IOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function carteAppareil(){
  const garde=!!lireCode();
  let h='<div class="card appareil" id="carteAppareil"><h2><i class="ti ti-device-mobile"></i> Retrouver cet espace facilement</h2>';
  if(!EN_APPLI()){
    if(window.kkInstall){
      h+='<p>Ajoutez l\'espace famille à l\'écran d\'accueil de votre téléphone : une icône, un seul geste pour l\'ouvrir.</p>'
        +'<button class="btn" id="btnInstall"><i class="ti ti-download"></i> Installer l\'application</button>';
    }else if(EST_IOS()){
      h+='<p>Pour avoir une icône sur votre iPhone / iPad :</p><ol><li>Ouvrez cette page dans <b>Safari</b></li>'
        +'<li>Touchez <b>Partager</b> <i class="ti ti-share-2"></i></li><li>Choisissez <b>Sur l\'écran d\'accueil</b></li></ol>'
        +'<p>À la première ouverture de l\'icône, saisissez votre code'+(CODE?' : <b style="letter-spacing:.15em">'+esc(CODE.toUpperCase())+'</b>':'')+' (une seule fois).</p>';
    }else{
      h+='<p>Pour avoir une icône sur votre téléphone : ouvrez le menu du navigateur (<b>⋮</b>) puis <b>Installer l\'application</b> ou <b>Ajouter à l\'écran d\'accueil</b>.</p>';
    }
  }
  h+=garde
    ?'<div class="ok" style="margin-top:10px"><i class="ti ti-circle-check"></i> Votre accès est gardé sur cet appareil.</div>'
      +'<p style="margin:4px 0 0"><button class="lien" id="btnOublier">Ne plus garder l\'accès sur cet appareil</button></p>'
    :'<p style="margin-top:12px">Pas besoin de ressaisir votre code à chaque visite sur cet appareil.</p>'
      +'<button class="btn btn-g" id="btnGarder"><i class="ti ti-lock-open"></i> Garder mon accès sur cet appareil</button>'
      +'<p class="vide" style="margin:6px 0 0">À éviter sur un appareil partagé.</p>';
  return h+'</div>';
}
window.kkRendreInstall=()=>{const c=document.getElementById('carteAppareil');if(c){c.outerHTML=carteAppareil();liaisonsAppareil();}};
function liaisonsAppareil(){
  const i=document.getElementById('btnInstall');
  if(i)i.addEventListener('click',async()=>{const e=window.kkInstall;if(!e)return;e.prompt();try{await e.userChoice;}catch(x){}window.kkInstall=null;window.kkRendreInstall();});
  const g=document.getElementById('btnGarder');
  if(g)g.addEventListener('click',()=>{if(CODE)garderCode(CODE);window.kkRendreInstall();});
  const o=document.getElementById('btnOublier');
  if(o)o.addEventListener('click',()=>{oublierCode();window.kkRendreInstall();});
}
window.addEventListener('appinstalled',()=>{window.kkInstall=null;window.kkRendreInstall();});

function vueAccueil(d){
  const dernier=d.messages[0];
  const une=dernier
    ?'<div class="card une"><h2><i class="ti ti-bell-ringing"></i> À la une'+(dernier.nouveau?' <span class="nouveau">Nouveau</span>':'')+'</h2>'
      +'<h3 class="une-t">'+esc(dernier.titre)+'</h3><div class="date">'+esc(fmtDate(dernier.created_at))+'</div>'
      +'<p class="une-p">'+esc(extrait(dernier.corps,180))+'</p>'
      +'<button class="btn btn-g" data-aller="infos" data-msg="'+esc(dernier.id)+'"><i class="ti ti-book-2"></i> Lire la suite</button></div>'
    :'<div class="card"><h2><i class="ti ti-bell"></i> À la une</h2><p class="vide" style="margin:0">Aucune information pour le moment.</p></div>';
  const f=(d.fermetures||[])[0];
  const prochaine=f?'<div class="card"><h2><i class="ti ti-calendar-off"></i> Prochaine fermeture</h2><div class="dep"><span><b>'
    +esc(f.label||TYPE_FERM[f.type]||'Fermeture')+'</b><br><small>'+esc(periodeFermeture(f))+'</small></span>'
    +'<button class="btn btn-g" data-aller="creche">Tout voir</button></div></div>':'';
  const nbDocs=(d.documents||[]).length;
  const tuiles='<div class="tuiles">'
    +'<button class="tuile" data-aller="docs"><i class="ti ti-files"></i><b>Documents</b><small>'+(nbDocs?nbDocs+' à consulter':'Envoyer un document')+'</small></button>'
    +(d.creche_id?'<a class="tuile" href="menu.html?c='+encodeURIComponent(d.creche_id)+'" target="_blank" rel="noopener"><i class="ti ti-tools-kitchen-2"></i><b>Menu</b><small>de la semaine</small></a>':'')
    +'<button class="tuile" data-aller="creche"><i class="ti ti-address-book"></i><b>Contacts</b><small>et fermetures</small></button>'
    +(d.suivi_token?'<a class="tuile" href="famille-suivi.html?t='+encodeURIComponent(d.suivi_token)+'"><i class="ti ti-heart-handshake"></i><b>Suivi</b><small>de '+esc(d.enfant.prenom||'l\'enfant')+'</small></a>':'')
    +'</div>';
  return une+cartePointage(d)+prochaine+tuiles+carteAppareil();
}

function vueInfos(d){
  if(!d.messages.length)return '<div class="card"><p class="vide" style="margin:0">Aucune information pour le moment.</p></div>';
  const cible=MSG_OUVERT||d.messages[0].id;
  return '<div class="card"><h2><i class="ti ti-bell"></i> Informations de la crèche</h2>'
    +d.messages.map(m=>carteMessage(m,String(m.id)===String(cible))).join('')+'</div>';
}

function vueDocs(d){
  const deps=d.depots.length
    ?'<div style="margin-top:14px"><strong style="font-size:13px">Déjà envoyés</strong>'
      +d.depots.map(x=>'<div class="dep"><span>'+esc(x.nom)+'</span><span style="color:var(--muted)">'+esc(fmtDate(x.date))+'</span></div>').join('')+'</div>':'';
  return (carteDocuments(d)||'<div class="card"><h2><i class="ti ti-files"></i> Vos documents</h2><p class="vide" style="margin:0">Le devis et le contrat signé apparaîtront ici.</p></div>')
    +carteReglement()
    +'<div class="card"><h2><i class="ti ti-cloud-upload"></i> Envoyer un document</h2>'
    +'<p class="vide" style="margin-top:0">Certificat, attestation, ordonnance… (photo ou PDF, 8 Mo max). La crèche est prévenue.</p>'
    +'<label for="libelle">De quel document s\'agit-il ?</label>'
    +'<input type="text" id="libelle" maxlength="120" placeholder="Ex. : Attestation d\'assurance"/>'
    +'<label for="fichier">Fichier</label>'
    +'<input type="file" id="fichier" accept="image/*,application/pdf"/>'
    +'<div style="margin-top:14px"><button class="btn" id="btnEnvoi"><i class="ti ti-send"></i> Envoyer</button></div>'
    +'<div id="statut"></div>'+deps+'</div>';
}

function vueCreche(d){
  return carteContacts(d)+carteFermetures(d)
    +(d.suivi_token?'<div class="card"><h2><i class="ti ti-heart-handshake"></i> Suivi de '+esc(d.enfant.prenom||'votre enfant')+'</h2>'
      +'<p class="vide" style="margin-top:0">Les synthèses publiées par l\'équipe.</p>'
      +'<a class="btn btn-g" href="famille-suivi.html?t='+encodeURIComponent(d.suivi_token)+'"><i class="ti ti-external-link"></i> Ouvrir le suivi</a></div>':'');
}

function rendre(){
  const d=DONNEES;
  const nonLus=d.messages.filter(m=>m.nouveau).length;
  const barre='<nav class="onglets" role="tablist">'+ONGLETS.map(o=>
    '<button role="tab" class="onglet'+(o[0]===ONGLET?' actif':'')+'" aria-selected="'+(o[0]===ONGLET)+'" data-aller="'+o[0]+'">'
    +'<i class="ti ti-'+o[1]+'"></i><span>'+o[2]+'</span>'
    +(o[0]==='infos'&&nonLus?'<em class="pastille">'+nonLus+'</em>':'')+'</button>').join('')+'</nav>';
  const vues={accueil:vueAccueil,infos:vueInfos,docs:vueDocs,creche:vueCreche};
  wrap.innerHTML=barre+'<div class="vue">'+(vues[ONGLET]||vueAccueil)(d)+'</div>';
  wrap.querySelectorAll('[data-aller]').forEach(b=>b.addEventListener('click',()=>allerA(b.dataset.aller,b.dataset.msg)));
  liaisonsAppareil();
  const envoi=document.getElementById('btnEnvoi');
  if(envoi)envoi.addEventListener('click',envoyer);
  wrap.querySelectorAll('[data-doc]').forEach(b=>b.addEventListener('click',()=>ouvrirDocument(b.dataset.doc,b)));
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
