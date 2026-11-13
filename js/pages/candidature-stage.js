/* ===========================================================================
   CANDIDATURE-STAGE.HTML — page publique de demande de stage / d'alternance
   ---------------------------------------------------------------------------
   Le « Padlet » interne : la personne dépose sa demande sans compte, avec son CV
   et sa lettre (5 Mo chacun, envoyés en base64). Elle arrive dans Demandes ›
   Stagiaires › Candidatures, le mur où les référent·e·s se positionnent. Tout
   passe par l'edge function `candidature-stagiaire`, qui revalide chaque champ ;
   les autres pièces se déposent plus tard par le lien personnel de stagiaire.html.
   =========================================================================== */

const SUPABASE_URL = "https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const FN_URL = SUPABASE_URL + '/functions/v1/candidature-stagiaire';
const wrap = document.getElementById('wrap');

const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function appel(action,payload){
  const r = await fetch(FN_URL,{method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON_KEY,'apikey':SUPABASE_ANON_KEY},
    body:JSON.stringify(Object.assign({action:action},payload||{}))});
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.erreur||'Erreur');
  return d;
}

function etat(titre,msg){
  wrap.innerHTML='<div class="state"><h2>'+esc(titre)+'</h2><p>'+esc(msg)+'</p></div>';
}

function formulaire(cfg){
  document.getElementById('sousTitre').textContent = cfg.org.nom;
  const creches = '<option value="">Peu importe / je ne sais pas</option>'
    + cfg.creches.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.nom)+'</option>').join('');
  wrap.innerHTML =
    '<div class="intro">Vous cherchez un stage ou une alternance dans l’une de nos micro-crèches ? '
    +'Déposez votre demande ici : la direction vous répond par e-mail. Joignez votre CV et votre lettre de motivation ; '
    +'les autres documents (convention, pièce d’identité…) vous seront demandés plus tard, une fois la demande acceptée.</div>'
    +'<form id="form" novalidate onsubmit="return false">'
    +'<div class="msg" id="err" style="display:none"></div>'
    +'<div class="pot" aria-hidden="true"><label>Site web <input id="site_web" tabindex="-1" autocomplete="off"></label></div>'
    +'<div class="cases">'
    +'<label><input type="radio" name="type" value="stagiaire" checked><span>Stage</span></label>'
    +'<label><input type="radio" name="type" value="alternant"><span>Alternance</span></label></div>'
    +'<div class="card">'
    +'<div class="g2"><div class="f"><label class="lb" for="prenom">Prénom <i>*</i></label><input id="prenom" autocomplete="given-name"></div>'
    +'<div class="f"><label class="lb" for="nom">Nom <i>*</i></label><input id="nom" autocomplete="family-name"></div></div>'
    +'<div class="g2"><div class="f"><label class="lb" for="email">E-mail <i>*</i></label><input id="email" type="email" autocomplete="email"></div>'
    +'<div class="f"><label class="lb" for="tel">Téléphone</label><input id="tel" type="tel" autocomplete="tel"></div></div>'
    +'</div><div class="card">'
    +'<div class="g2"><div class="f"><label class="lb" for="ecole">École / organisme <i>*</i></label><input id="ecole"></div>'
    +'<div class="f"><label class="lb" for="formation">Formation <i>*</i></label><input id="formation" placeholder="CAP AEPE, BAC ASSP, EJE…"></div></div>'
    +'<div class="f"><label class="lb" for="niveau">Niveau / année</label><input id="niveau" placeholder="1re année…"></div>'
    +'</div><div class="card">'
    +'<div class="f"><label class="lb" for="creche">Crèche souhaitée</label><select id="creche">'+creches+'</select></div>'
    +'<div class="g2"><div class="f"><label class="lb" for="debut">Début souhaité</label><input id="debut" type="date"></div>'
    +'<div class="f"><label class="lb" for="fin">Fin souhaitée</label><input id="fin" type="date"></div></div>'
    +'<div class="f"><label class="lb" for="message">Un mot pour présenter votre demande</label>'
    +'<textarea id="message" rows="4" maxlength="1500" placeholder="Votre projet, vos disponibilités…"></textarea></div>'
    +'<div class="f"><label class="lb" for="cv">Votre CV</label><input id="cv" type="file" accept="application/pdf,image/*,.doc,.docx"></div>'
    +'<div class="f"><label class="lb" for="lettre">Votre lettre de motivation</label><input id="lettre" type="file" accept="application/pdf,image/*,.doc,.docx">'
    +'<div style="font-size:12px;color:var(--muted);margin-top:4px">PDF, photo ou Word, 5 Mo maximum chacun.</div></div>'
    +'</div>'
    +'<label class="accord"><input type="checkbox" id="accord"><span>J’accepte que ces informations soient utilisées pour traiter ma demande '
    +'et transmises, avec mon CV et ma lettre, aux équipes des crèches pendant le traitement de celle-ci. <a href="confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a></span></label>'
    +'<button type="button" class="btn btn-p" id="envoyer" style="width:100%">Envoyer ma demande</button></form>';
  document.getElementById('envoyer').onclick = envoyer;
}

function lireFichier(id){
  const f=(document.getElementById(id).files||[])[0];
  if(!f)return Promise.resolve(null);
  if(f.size>5*1024*1024)return Promise.reject(new Error('Le fichier « '+f.name+' » dépasse 5 Mo.'));
  return new Promise((ok,ko)=>{
    const r=new FileReader();
    r.onload=()=>ok({nom:f.name,mime:f.type,base64:String(r.result).split(',')[1]||''});
    r.onerror=()=>ko(new Error('Fichier illisible : '+f.name));
    r.readAsDataURL(f);
  });
}

async function envoyer(){
  const v = id => document.getElementById(id).value.trim();
  const err = document.getElementById('err');
  const btn = document.getElementById('envoyer');
  err.style.display='none';
  btn.disabled=true;
  try{
    const cv=await lireFichier('cv'),lettre=await lireFichier('lettre');
    await appel('envoyer',{cv:cv,lettre:lettre,
      type: document.querySelector('input[name=type]:checked').value,
      prenom:v('prenom'),nom:v('nom'),email:v('email'),telephone:v('tel'),
      ecole:v('ecole'),formation:v('formation'),niveau:v('niveau'),
      creche_id:v('creche')||null,date_debut:v('debut')||null,date_fin:v('fin')||null,
      message:v('message'),accord:document.getElementById('accord').checked,
      site_web:v('site_web')
    });
    wrap.innerHTML='<div class="state"><h2>Demande envoyée, merci !</h2>'
      +'<p>La direction a bien reçu votre demande et vous répondra par e-mail.</p></div>';
  }catch(e){
    err.textContent=e.message||'Envoi impossible, réessayez dans un instant.';
    err.style.display='block';
    err.scrollIntoView({behavior:'smooth',block:'center'});
    btn.disabled=false;
  }
}

(async function(){
  try{ formulaire(await appel('config')); }
  catch(e){ etat('Formulaire indisponible','Réessayez dans un instant.'); }
})();
