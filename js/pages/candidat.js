/* ===========================================================================
   CANDIDAT.HTML — page publique d'un·e candidat·e (recrutement en remplacement)
   ---------------------------------------------------------------------------
   Aucune session Supabase : la personne n'a pas de compte. Tout passe par
   l'edge function `dossier-candidat` (service_role), qui ne traite que la
   fiche correspondant au jeton du lien. Le lien n'ouvre qu'une session courte
   (js/session-lien.js).

   La page ne fait que recevoir : le projet pédagogique à lire (page publique
   projet-pedagogique.html), les pièces jointes choisies par la crèche (fiche
   de poste… ouvertes par URL signée de 5 minutes) et le questionnaire sur le
   projet, dont les questions viennent du serveur. Aucun dépôt de fichier.
   =========================================================================== */

const SUPABASE_URL = "https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const FN_URL = SUPABASE_URL + '/functions/v1/dossier-candidat';

const TOKEN = SessionLien.init({url:FN_URL,anonKey:SUPABASE_ANON_KEY});
const wrap  = document.getElementById('wrap');

let CAND = null;   // {prenom, creche_nom, poste, date_debut, date_fin, entretien_date, entretien_heure, expire_le}
let PROJET = null; // {ouvert_le} ou null
let DOCS = [];     // pièces jointes
let QUEST = null;  // {questions:[{q,r}], le} ou null
let brouillon = null; // réponses en cours de saisie (gardées si la page se redessine)

const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dfr = d => d ? new Date(String(d).length===10?d+'T12:00:00':d).toLocaleDateString('fr-FR') : '';

let toastT=null;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('on');
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),3200);
}

function etat(cls,titre,msg,icone){
  wrap.innerHTML='<div class="state '+cls+'"><i class="ti ti-'+(icone||'alert-circle')+'"></i>'
    +'<h2>'+esc(titre)+'</h2><p>'+esc(msg)+'</p></div>';
}

const appel = (action,payload) => SessionLien.appel(action,payload);

async function boot(){
  if(!TOKEN)return etat('err','Lien incomplet','Ce lien ne contient pas de jeton. Utilisez celui reçu de la crèche.','link-off');
  try{
    await recharger();
  }catch(e){
    const m=(e.message||'').toLowerCase();
    if(m.includes('expir'))
      etat('err','Lien expiré','Ce lien n’est plus valable. Contactez la crèche, elle vous en enverra un nouveau.','clock-off');
    else if(m.includes('introuvable'))
      etat('err','Lien invalide','Ce lien ne correspond à aucune candidature. Vérifiez que vous l’avez copié en entier.','link-off');
    else
      etat('err','Erreur','Votre dossier n’a pas pu être chargé. Réessayez dans un instant.','alert-triangle');
  }
}

async function recharger(){
  const d=await appel('get');
  CAND=d.candidat;PROJET=d.projet||null;DOCS=d.documents||[];QUEST=d.questionnaire||null;
  document.getElementById('sousTitre').textContent=
    (CAND.prenom||'')+(CAND.creche_nom?' · '+CAND.creche_nom:'');
  render();
}

function lireBrouillon(){
  if(!QUEST)return;
  const zones=document.querySelectorAll('.qz textarea');
  if(zones.length)brouillon=[...zones].map(z=>z.value);
}

function render(){
  const periode=CAND.date_debut
    ? ' du <b>'+esc(dfr(CAND.date_debut))+'</b>'+(CAND.date_fin?' au <b>'+esc(dfr(CAND.date_fin))+'</b>':'')
    : '';
  let h='<div class="intro">Bonjour '+esc(CAND.prenom||'')+' ! Merci pour votre candidature'
    +(CAND.poste?' au poste de <b>'+esc(CAND.poste)+'</b>':'')
    +(CAND.creche_nom?' à la crèche <b>'+esc(CAND.creche_nom)+'</b>':'')
    +(periode?' (remplacement'+periode+')':'')+'.'
    +(CAND.entretien_date?'<br><br><i class="ti ti-calendar-event"></i> Notre entretien est prévu le <b>'+esc(dfr(CAND.entretien_date))+'</b>'
      +(CAND.entretien_heure?' à <b>'+esc(CAND.entretien_heure)+'</b>':'')+'.':'')
    +'<br><br>Pour préparer notre échange, voici ce que nous vous transmettons.'
    +'<br><br>Ce lien est personnel et valable jusqu’au <b>'+esc(dfr(CAND.expire_le))+'</b>.</div>';

  if(PROJET||DOCS.length){
    h+='<h3 class="sec"><i class="ti ti-mail-opened"></i> À lire</h3>';
    if(PROJET){
      h+='<div class="ress'+(PROJET.ouvert_le?' fait':'')+'"><div class="rtop">'
        +'<span class="ic"><i class="ti ti-'+(PROJET.ouvert_le?'check':'book')+'"></i></span>'
        +'<span class="tx"><b>Notre projet pédagogique</b>'
        +'<span class="desc">Il présente la façon dont nous accueillons les enfants et leurs familles. Le questionnaire ci-dessous s’appuie dessus.</span>'
        +'<span style="display:block;margin-top:6px"><span class="badge '+(PROJET.ouvert_le?'b-ok">Ouvert le '+esc(dfr(PROJET.ouvert_le)):'b-att">À lire')+'</span></span>'
        +'</span></div><div style="margin-top:10px">'
        +'<button class="btn btn-g btn-s" onclick="ouvrirProjet()"><i class="ti ti-book-2"></i> Lire le projet pédagogique</button>'
        +'</div></div>';
    }
    DOCS.forEach((e,i)=>{
      h+='<div class="ress'+(e.ouvert_le?' fait':'')+'"><div class="rtop">'
        +'<span class="ic"><i class="ti ti-'+(e.ouvert_le?'check':'file-text')+'"></i></span>'
        +'<span class="tx"><b>'+esc(e.libelle||e.filename||'Document')+'</b>'
        +(e.message?'<span class="desc">'+esc(e.message)+'</span>':'')
        +'<span style="display:block;margin-top:6px"><span class="badge '+(e.ouvert_le?'b-ok">Ouvert le '+esc(dfr(e.ouvert_le)):'b-att">À lire')+'</span></span>'
        +'</span></div><div style="margin-top:10px">'
        +'<button class="btn btn-g btn-s" onclick="ouvrirDoc('+i+')"><i class="ti ti-download"></i> Ouvrir le document</button>'
        +'</div></div>';
    });
  }

  if(QUEST&&QUEST.questions.length){
    h+='<h3 class="sec"><i class="ti ti-pencil"></i> Questionnaire sur le projet</h3>'
      +'<p class="hint">'+(QUEST.le
        ? 'Merci, vos réponses ont été envoyées le '+esc(dfr(QUEST.le))+' ✔ Vous pouvez encore les modifier et les renvoyer.'
        : 'Quelques lignes par question suffisent. Il n’y a pas de bonne ou de mauvaise réponse : c’est une base pour notre échange.')+'</p>'
      +'<div class="card">'
      +QUEST.questions.map((x,i)=>
        '<div class="qz"><label for="q'+i+'">'+(i+1)+'. '+esc(x.q)+'</label>'
        +'<textarea id="q'+i+'" maxlength="3000" placeholder="Votre réponse">'+esc(brouillon&&brouillon[i]!=null?brouillon[i]:x.r)+'</textarea></div>').join('')
      +'<button class="btn btn-p" id="btnEnvoi" style="width:100%;margin-top:6px" onclick="envoyerReponses()">'
      +'<i class="ti ti-send"></i> '+(QUEST.le?'Renvoyer mes réponses':'Envoyer mes réponses')+'</button>'
      +'</div>';
  }

  if(!PROJET&&!DOCS.length&&!QUEST)
    h+='<p class="hint">Rien à lire pour le moment : nous vous donnons rendez-vous pour l’entretien.</p>';

  h+='<p class="pied">Vos réponses ne sont lues que par la direction de la crèche. '
    +'<a href="confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a></p>';
  wrap.innerHTML=h;
}

/* La fenêtre s'ouvre AVANT l'appel réseau : ouverte depuis le retour d'une
   promesse, elle serait bloquée par le navigateur. */
async function ouvrirProjet(){
  window.open('projet-pedagogique.html','_blank','noopener');
  try{
    await appel('projet_ouvert');
    lireBrouillon();
    await recharger();
  }catch(e){/* le projet est ouvert, le suivi peut attendre */}
}

async function ouvrirDoc(i){
  const e=DOCS[i];
  if(!e)return;
  /* Fenêtre ouverte tout de suite (clic), adresse posée dès que l'URL signée arrive. */
  const w=window.open('about:blank','_blank');
  try{
    const d=await appel('document_url',{document_id:e.id});
    if(w)w.location.href=d.url;else location.href=d.url;
    lireBrouillon();
    await recharger();
  }catch(err){
    if(w)w.close();
    const m=(err.message||'').toLowerCase();
    toast(m.includes('expir')?'Ce lien a expiré. Contactez la crèche.':'Ouverture impossible. Réessayez dans un instant.');
  }
}

async function envoyerReponses(){
  lireBrouillon();
  const rep=(brouillon||[]).map(x=>String(x||'').trim());
  if(!rep.some(Boolean))return toast('Écrivez au moins une réponse avant d’envoyer.');
  const vides=rep.filter(x=>!x).length;
  if(vides&&!confirm(vides+' question'+(vides>1?'s':'')+' sans réponse. Envoyer quand même ?'))return;
  const b=document.getElementById('btnEnvoi');
  if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader"></i> Envoi…';}
  try{
    await appel('questionnaire',{reponses:rep});
    brouillon=null;
    await recharger();
    toast('Merci, vos réponses sont bien envoyées ✔');
  }catch(err){
    if(b){b.disabled=false;b.innerHTML='<i class="ti ti-send"></i> Envoyer mes réponses';}
    const m=(err.message||'').toLowerCase();
    toast(m.includes('expir')?'Ce lien a expiré. Contactez la crèche.':'Envoi impossible. Réessayez dans un instant.');
  }
}

boot();
