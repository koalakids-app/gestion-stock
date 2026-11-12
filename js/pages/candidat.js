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
   projet : un quiz du projet quiz-protocoles, ouvert avec l'identité de la
   personne et la référence de sa fiche (comme pour les stagiaires). Les
   réponses sont enregistrées côté quiz ; ici, seule la case « J'ai répondu »
   est suivie. Aucun dépôt de fichier.
   =========================================================================== */

const SUPABASE_URL = "https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const FN_URL = SUPABASE_URL + '/functions/v1/dossier-candidat';

const TOKEN = SessionLien.init({url:FN_URL,anonKey:SUPABASE_ANON_KEY});
const wrap  = document.getElementById('wrap');

let CAND = null;   // {prenom, nom, ref, rdv_confirme_le, creche_nom, poste, date_debut, date_fin, entretien_date, entretien_heure, expire_le}
let PROJET = null; // {ouvert_le} ou null
let DOCS = [];     // pièces jointes
let QUEST = null;  // {url, statut, ouvert_le, confirme_le} ou null

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

function render(){
  const periode=CAND.date_debut
    ? ' du <b>'+esc(dfr(CAND.date_debut))+'</b>'+(CAND.date_fin?' au <b>'+esc(dfr(CAND.date_fin))+'</b>':'')
    : '';
  let h='<div class="intro">Bonjour '+esc(CAND.prenom||'')+' ! Merci pour votre candidature'
    +(CAND.poste?' au poste de <b>'+esc(CAND.poste)+'</b>':'')
    +(CAND.creche_nom?' à la crèche <b>'+esc(CAND.creche_nom)+'</b>':'')
    +(periode?' (remplacement'+periode+')':'')+'.'
    +'<br><br>Pour préparer notre échange, voici ce que nous vous transmettons.'
    +'<br><br>Ce lien est personnel et valable jusqu’au <b>'+esc(dfr(CAND.expire_le))+'</b>.</div>';

  h+=htmlRdv();

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

  if(QUEST){
    const fait=!!QUEST.confirme_le;
    h+='<h3 class="sec"><i class="ti ti-pencil"></i> À faire</h3>'
      +'<div class="ress'+(fait?' fait':'')+'"><div class="rtop">'
      +'<span class="ic"><i class="ti ti-'+(fait?'check':'list-check')+'"></i></span>'
      +'<span class="tx"><b>Questionnaire sur le projet</b>'
      +'<span class="desc">À remplir après la lecture du projet pédagogique, une dizaine de minutes. Il n’y a pas de piège : c’est une base pour notre échange.</span>'
      +'<span style="display:block;margin-top:6px"><span class="badge '
      +(fait?'b-ok">Répondu le '+esc(dfr(QUEST.confirme_le)):(QUEST.ouvert_le?'b-att">Ouvert le '+esc(dfr(QUEST.ouvert_le)):'b-att">À faire'))+'</span></span>'
      +'</span></div><div style="margin-top:10px">'
      +'<button class="btn btn-'+(fait?'g':'p')+' btn-s" onclick="ouvrirQuestionnaire()"><i class="ti ti-external-link"></i> Ouvrir le questionnaire</button>'
      +'</div>'
      +'<label class="accuse"><input type="checkbox" '+(fait?'checked':'')+' onchange="confirmerQuestionnaire(this.checked)"> J’ai répondu au questionnaire</label>'
      +'</div>';
  }

  if(!PROJET&&!DOCS.length&&!QUEST)
    h+='<p class="hint">Rien à lire pour le moment : nous vous donnons rendez-vous pour l’entretien.</p>';

  h+='<p class="pied">Vos réponses ne sont lues que par la direction et les responsables de la crèche. '
    +'<a href="confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a></p>';
  wrap.innerHTML=h;
}

/* Le rendez-vous : un bouton le confirme (la crèche est prévenue), un autre retire la
   confirmation. Une fois la date passée, plus de bouton. */
function htmlRdv(){
  if(!CAND.entretien_date)return '';
  const n=new Date(),auj=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
  const passe=String(CAND.entretien_date)<auj;
  const ok=!!CAND.rdv_confirme_le;
  return '<h3 class="sec"><i class="ti ti-calendar-event"></i> Rendez-vous</h3>'
    +'<div class="ress'+(ok?' fait':'')+'"><div class="rtop">'
    +'<span class="ic"><i class="ti ti-'+(ok?'check':'calendar-event')+'"></i></span>'
    +'<span class="tx"><b>Entretien le '+esc(dfr(CAND.entretien_date))+(CAND.entretien_heure?' à '+esc(String(CAND.entretien_heure).replace(':','h')):'')+'</b>'
    +(CAND.creche_nom?'<span class="desc">'+esc(CAND.creche_nom)+'</span>':'')
    +(passe?'':'<span style="display:block;margin-top:6px"><span class="badge '+(ok?'b-ok">Confirmé le '+esc(dfr(CAND.rdv_confirme_le)):'b-att">À confirmer')+'</span></span>')
    +'</span></div>'
    +(passe?'':'<div style="margin-top:10px">'
      +(ok?'<button class="btn btn-g btn-s" onclick="confirmerRdv(false)"><i class="ti ti-calendar-off"></i> Retirer ma confirmation</button>'
          :'<button class="btn btn-p btn-s" onclick="confirmerRdv(true)"><i class="ti ti-calendar-check"></i> Confirmer le rendez-vous</button>')
      +'</div>')
    +'</div>';
}
async function confirmerRdv(confirme){
  if(!confirme&&!confirm('Retirer votre confirmation ? La crèche en sera informée.'))return;
  try{
    await appel('rdv_confirme',{confirme:!!confirme});
    await recharger();
    toast(confirme?'Merci, votre présence est confirmée ✔':'Confirmation retirée.');
  }catch(err){
    const m=(err.message||'').toLowerCase();
    toast(m.includes('expir')?'Ce lien a expiré. Contactez la crèche.':'Enregistrement impossible. Réessayez dans un instant.');
  }
}

/* La fenêtre s'ouvre AVANT l'appel réseau : ouverte depuis le retour d'une
   promesse, elle serait bloquée par le navigateur. */
async function ouvrirProjet(){
  window.open('projet-pedagogique.html','_blank','noopener');
  try{
    await appel('projet_ouvert');
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
    await recharger();
  }catch(err){
    if(w)w.close();
    const m=(err.message||'').toLowerCase();
    toast(m.includes('expir')?'Ce lien a expiré. Contactez la crèche.':'Ouverture impossible. Réessayez dans un instant.');
  }
}

/* L'adresse du quiz, complétée de ce que la crèche sait déjà : la personne n'a
   rien à ressaisir et son résultat est rattaché à sa fiche (`ref`, qui n'ouvre
   rien : le jeton, lui, ne quitte jamais cette page). */
function urlQuestionnaire(){
  try{
    const u=new URL(QUEST.url,location.href);
    const mettre=(k,v)=>{ if(v)u.searchParams.set(k,v); };
    mettre('prenom',CAND.prenom);
    mettre('nom',CAND.nom);
    mettre('statut',QUEST.statut);
    mettre('creche',CAND.creche_nom);
    mettre('ref',CAND.ref);
    return u.toString();
  }catch(e){return QUEST.url;}
}

async function ouvrirQuestionnaire(){
  if(!QUEST||!QUEST.url)return toast('Ce questionnaire n’est pas encore disponible.');
  window.open(urlQuestionnaire(),'_blank','noopener');
  try{
    await appel('questionnaire_ouvert');
    await recharger();
  }catch(e){/* le questionnaire est ouvert, le suivi peut attendre */}
}

async function confirmerQuestionnaire(fait){
  try{
    await appel('questionnaire_confirme',{fait:!!fait});
    await recharger();
    if(fait)toast('Merci, c’est noté ✔');
  }catch(err){
    const m=(err.message||'').toLowerCase();
    toast(m.includes('expir')?'Ce lien a expiré. Contactez la crèche.':'Enregistrement impossible. Réessayez dans un instant.');
    render();
  }
}

boot();
