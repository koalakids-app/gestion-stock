const SUPABASE_URL="https://phbcqxjzobzwuzetgbem.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoYmNxeGp6b2J6d3V6ZXRnYmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Mjg3ODMsImV4cCI6MjEwMDEwNDc4M30.Cz7_0WN_pWoXeamk484hJr2iCVdKZEatR-m_f0bKj3w";
const _sb=window.supabase||window.Supabase;
if(!_sb||!_sb.createClient){document.getElementById('app').innerHTML='<div class="center-msg"><div style="font-size:38px;margin-bottom:8px">\u26a0</div>La biblioth\u00e8que Supabase n\'a pas pu \u00eatre charg\u00e9e.<br>V\u00e9rifiez votre connexion internet.</div>';throw new Error('supabase-js non charge');}
const db=_sb.createClient(SUPABASE_URL,SUPABASE_KEY);
const letters=['A','B','C','D','E','F'];
const app=()=>document.getElementById('app');
const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let view='login',quizzes=[],curQuiz=null,curQuestions=[],results=[],filterCreche='',filterStatut='';
let themes=[],curTheme=null,curModules=[];

async function boot(){
  const{data}=await db.auth.getSession();
  if(data.session){view='list';await loadQuizzes();}
  else{view='login';render();}
}
function render(){
  document.getElementById('logout-btn').style.display=view==='login'?'none':'inline-flex';
  if(view==='login')renderLogin();
  else if(view==='list')renderList();
  else if(view==='edit')renderEdit();
  else if(view==='results')renderResults();
  else if(view==='themes')renderThemes();
  else if(view==='modules')renderModules();
  else if(view==='blocs')renderBlocs();
  else if(view==='envoi')renderEnvoi();
}

/* ===== ENVOI DIRECT PAR MAIL (quiz et modules) ===== */
const STATUT_RECRUT='Salarié(e) en recrutement';
let ENV=null;

async function appelFn(nom,body){
  const{data,error}=await db.functions.invoke(nom,{body});
  if(error){
    let msg=error.message||'Erreur';
    try{const j=await error.context.json();if(j&&j.erreur)msg=j.erreur;}catch(e){}
    throw new Error(msg);
  }
  if(data&&data.erreur)throw new Error(data.erreur);
  return data;
}
const dfrCourt=d=>{try{return new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});}catch(e){return'';}};
const memeMail=s=>String(s||'').trim().toLowerCase();

function modeleMessage(kind,titre){
  return `Bonjour {prenom},\n\nVous trouverez ci-dessous le lien à suivre pour réaliser ${kind==='quiz'?'le quiz':'la formation'} « ${titre} » :\n\n{lien}\n\nMerci de le faire dans les meilleurs délais.\n\nCordialement,\nL'équipe Koalakids`;
}
const MODELE_CANDIDAT=[
 "Bonjour {civilite} {nom},","",
 "Je fais suite à votre candidature au poste de [intitulé du poste] au sein de notre micro-crèche Koalakids [crèche]. Je vous propose d'échanger lors d'un entretien le [jour] [date] à [heure], sur notre micro-crèche située au [adresse].","",
 "Afin de préparer cet entretien, vous trouverez ci-joint la fiche de poste ainsi que le projet éducatif et pédagogique. Merci d'en prendre connaissance, puis de répondre au questionnaire qui s'y rattache :","",
 "{lien}","",
 "Sur la première page, merci d'indiquer votre prénom, votre nom, puis de sélectionner « Salarié(e) en recrutement ». Comptez une dizaine de minutes ; les réponses sont corrigées au fur et à mesure. Il ne s'agit pas d'une épreuve éliminatoire : ce questionnaire servira simplement de base à nos échanges.","",
 "Merci de me confirmer le rendez-vous par retour de mail.","",
 "En l'attente,","","Cordialement,","",
 "David Bucari",
 "Éducateur de jeunes enfants",
 "Référent pédagogique et familial — Koalakids Ollioules, St Jean du Var et Cuers Peireguins",
 "06 59 73 80 14","",
 "Élue meilleure enseigne 2026 pour la qualité de service (magazine Capital)"
].join('\n');

async function openEnvoi(kind,id){
  const item=kind==='quiz'?quizzes.find(x=>x.id===id):curModules.find(x=>x.id===id);
  if(!item)return alert('Élément introuvable.');
  if(!item.publie)return alert('Publiez-le d’abord : le lien envoyé ne fonctionnerait pas tant qu’il est en brouillon.');
  let exp='';try{exp=localStorage.getItem('kk_envoi_exp')||'';}catch(e){}
  ENV={kind,id,titre:item.titre,reseau:[],creches:[],envois:{},manuels:[],sel:new Set(),portee:null,
    fCreche:'',fStatut:'',fContact:'',objet:'',message:modeleMessage(kind,item.titre),exp,resultats:null,busy:false};
  ENV.objet=kind==='quiz'?'Votre questionnaire - Koalakids':'Votre formation - Koalakids';
  view='envoi';
  app().innerHTML=`${tabs(kind==='quiz'?'quiz':'formations')}<div class="center-msg"><div class="spinner"></div>Chargement des personnes…</div>`;
  try{await chargerEnvoi();}
  catch(e){
    app().innerHTML=`${tabs(kind==='quiz'?'quiz':'formations')}<div class="center-msg">⚠ ${esc(e.message)}<br><br><button class="btn" onclick="quitterEnvoi()">← Retour</button></div>`;
    return;
  }
  renderEnvoi();
}
async function chargerEnvoi(){
  const d=await appelFn('liste-destinataires',{kind:ENV.kind,item_id:ENV.id});
  ENV.creches=d.creches||[];ENV.reseau=d.destinataires||[];ENV.portee=d.portee||null;
  ENV.envois={};
  (d.envois||[]).forEach(e=>{const k=memeMail(e.email);if(!ENV.envois[k])ENV.envois[k]=e;});
  if(ENV.portee)ENV.fCreche=ENV.portee;
}
function quitterEnvoi(){retourEnvoi();}
function retourEnvoi(){
  const kind=ENV?ENV.kind:'quiz';ENV=null;
  if(kind==='module'){view='modules';render();}else{view='list';loadQuizzes();}
}
const personnes=()=>[...ENV.reseau.map(d=>({...d,email:memeMail(d.email),source:'reseau'})),...ENV.manuels];
const dejaContacte=p=>{const e=ENV.envois[p.email];return !!e&&e.etat==='envoye';};
function visibles(){
  return personnes().filter(p=>
    (!ENV.fCreche||p.creche===ENV.fCreche)&&
    (!ENV.fStatut||p.statut===ENV.fStatut)&&
    (!ENV.fContact||(ENV.fContact==='oui'?dejaContacte(p):!dejaContacte(p))));
}

function renderEnvoi(){
  if(!ENV)return;
  if(ENV.resultats)return renderRecapEnvoi();
  const tab=ENV.kind==='quiz'?'quiz':'formations';
  const statuts=[...new Set([...personnes().map(p=>p.statut).filter(Boolean),STATUT_RECRUT])].sort();
  app().innerHTML=`
    ${tabs(tab)}
    <button class="btn" style="margin-bottom:1rem" onclick="retourEnvoi()">← Retour</button>
    <h2 style="font-size:20px;color:var(--purple);margin-bottom:.25rem">Envoyer par mail</h2>
    <p style="font-size:14px;color:var(--text-muted);margin-bottom:1.25rem"><b>${esc(ENV.titre)}</b> · ${ENV.kind==='quiz'?'quiz':'module de formation'}</p>

    <div class="question-card">
      <h3 style="font-size:15px;margin-bottom:10px">1. Choisir les personnes</h3>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin:0"><label class="form-label">Crèche</label>
          <select class="form-select" id="env-creche" onchange="envFiltre()" ${ENV.portee?'disabled':''}>
            ${ENV.portee?'':'<option value="">Toutes les crèches</option>'}
            ${ENV.creches.map(c=>`<option value="${esc(c.name)}" ${c.name===ENV.fCreche?'selected':''}>${esc(c.name)}</option>`).join('')}
          </select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Statut</label>
          <select class="form-select" id="env-statut" onchange="envFiltre()">
            <option value="">Tous les statuts</option>
            ${statuts.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group" style="margin-bottom:10px"><label class="form-label">Déjà contactés pour ce ${ENV.kind==='quiz'?'quiz':'module'}</label>
        <select class="form-select" id="env-contact" onchange="envFiltre()">
          <option value="">Tout le monde</option>
          <option value="non">Pas encore contactés</option>
          <option value="oui">Déjà contactés (pour relancer)</option>
        </select></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;margin:6px 0;cursor:pointer">
        <input type="checkbox" id="env-all" onchange="envToutCocher(this.checked)"> Tout cocher</label>
      <div id="env-list" style="max-height:340px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius)"></div>
    </div>

    <div class="question-card">
      <h3 style="font-size:15px;margin-bottom:4px">2. Ajouter un candidat</h3>
      <p style="font-size:12px;color:var(--text-light);margin-bottom:10px">Un candidat en recrutement n’existe dans aucune base : il est ajouté à la liste pour cet envoi.</p>
      <div class="form-row" style="margin-bottom:8px">
        <div class="form-group" style="margin:0"><label class="form-label">Civilité</label>
          <select class="form-select" id="man-civ"><option>Mme</option><option>M.</option></select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Crèche</label>
          <select class="form-select" id="man-creche">
            ${ENV.creches.map(c=>`<option value="${esc(c.name)}" ${c.name===ENV.fCreche?'selected':''}>${esc(c.name)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row" style="margin-bottom:8px">
        <div class="form-group" style="margin:0"><label class="form-label">Prénom</label><input class="form-input" id="man-prenom"></div>
        <div class="form-group" style="margin:0"><label class="form-label">Nom</label><input class="form-input" id="man-nom"></div>
      </div>
      <div class="form-group" style="margin-bottom:10px"><label class="form-label">Adresse mail</label><input class="form-input" id="man-mail" type="email"></div>
      <button class="btn" onclick="envAjouterCandidat()">+ Ajouter à la liste</button>
    </div>

    <div class="question-card">
      <h3 style="font-size:15px;margin-bottom:4px">3. Rédiger le message</h3>
      <p style="font-size:12px;color:var(--text-light);margin-bottom:10px">Un seul message pour tous. <code>{prenom}</code>, <code>{nom}</code> et <code>{civilite}</code> sont remplacés pour chaque personne ; <code>{lien}</code> devient un lien cliquable (s’il est absent, un bouton est ajouté en bas du mail).</p>
      <div class="form-group"><label class="form-label">Objet</label><input class="form-input" id="env-objet" value="${esc(ENV.objet)}" oninput="ENV.objet=this.value;envApercu()"></div>
      <div class="form-group"><label class="form-label">Message</label>
        <textarea class="form-input" id="env-message" rows="12" oninput="ENV.message=this.value;envApercu()">${esc(ENV.message)}</textarea></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn" style="padding:6px 12px;font-size:12px" onclick="envModele('std')">Modèle standard</button>
        <button class="btn" style="padding:6px 12px;font-size:12px" onclick="envModele('candidat')">Modèle candidat (recrutement)</button>
      </div>
      <div class="form-group"><label class="form-label">Prénom affiché comme expéditeur</label>
        <input class="form-input" id="env-exp" placeholder="Ex : David" value="${esc(ENV.exp)}" oninput="ENV.exp=this.value;try{localStorage.setItem('kk_envoi_exp',this.value)}catch(e){}"></div>
      <label class="form-label">Aperçu</label>
      <div id="env-apercu" style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;font-size:14px;white-space:normal"></div>
    </div>

    <div class="question-card" style="text-align:center">
      <div id="env-actions"></div>
      <div id="env-etat" class="save-status"></div>
    </div>`;
  envMajListe();
}

function envFiltre(){
  ENV.fCreche=document.getElementById('env-creche').value;
  ENV.fStatut=document.getElementById('env-statut').value;
  ENV.fContact=document.getElementById('env-contact').value;
  const vis=new Set(visibles().map(p=>p.email));
  ENV.sel=new Set([...ENV.sel].filter(k=>vis.has(k)));   // on ne garde pas cochée une personne qu'on ne voit plus
  envMajListe();
}
function envToutCocher(oui){
  visibles().forEach(p=>{if(oui)ENV.sel.add(p.email);else ENV.sel.delete(p.email);});
  envMajListe();
}
function envBascule(i){
  const p=visibles()[i];if(!p)return;
  if(ENV.sel.has(p.email))ENV.sel.delete(p.email);else ENV.sel.add(p.email);
  envMajListe();
}
function envBadge(p){
  const e=ENV.envois[p.email];if(!e)return'';
  if(e.etat==='envoye'){
    const rel=e.nb_relances?` · relancé ${e.nb_relances}×`:'';
    return `<span style="font-size:11px;font-weight:700;color:var(--success-text);background:var(--success-bg);border-radius:20px;padding:2px 8px;white-space:nowrap">✔ Envoyé le ${esc(dfrCourt(e.envoye_le))}${rel}</span>`;
  }
  return `<span style="font-size:11px;font-weight:700;color:var(--danger-text);background:var(--danger-bg);border-radius:20px;padding:2px 8px;white-space:nowrap" title="${esc(e.erreur||'')}">✗ Échec</span>`;
}
function envMajListe(){
  const vis=visibles();
  const box=document.getElementById('env-list');
  box.innerHTML=vis.length?vis.map((p,i)=>`
    <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" ${ENV.sel.has(p.email)?'checked':''} onchange="envBascule(${i})">
      <span style="flex:1;min-width:0">
        <b style="font-size:14px">${esc(p.prenom)} ${esc(p.nom)}</b>${p.source==='manuel'?' <span style="font-size:11px;color:var(--purple)">(candidat ajouté)</span>':''}<br>
        <span style="font-size:12px;color:var(--text-muted)">${esc(p.email)} · ${esc(p.creche||'—')} · ${esc(p.statut||'—')}</span>
      </span>${envBadge(p)}
    </label>`).join(''):'<div style="padding:16px;text-align:center;font-size:13px;color:var(--text-muted)">Personne ne correspond à ce filtre.</div>';
  document.getElementById('env-all').checked=vis.length>0&&vis.every(p=>ENV.sel.has(p.email));
  envMajActions();envApercu();
}
function envMajActions(){
  const pers=personnes().filter(p=>ENV.sel.has(p.email));
  const nNeuf=pers.filter(p=>!dejaContacte(p)).length;
  const nRel=pers.length-nNeuf;
  const b=(txt,fn,cls,dis)=>`<button class="btn ${cls}" style="padding:12px 22px;margin:4px" onclick="${fn}" ${dis||ENV.busy?'disabled':''}>${txt}</button>`;
  document.getElementById('env-actions').innerHTML=
    b(`✉ Envoyer à ${nNeuf} personne${nNeuf>1?'s':''}`,'envLancer(false)','primary',nNeuf===0)+
    (nRel?b(`↻ Relancer ${nRel} personne${nRel>1?'s':''} déjà contactée${nRel>1?'s':''}`,'envLancer(true)','purple',false):'');
}
function envRemplacer(t,p){
  return String(t).replace(/\{prenom\}/gi,p.prenom||'').replace(/\{nom\}/gi,p.nom||'').replace(/\{civilite\}/gi,p.civilite||'');
}
function envApercu(){
  const el=document.getElementById('env-apercu');if(!el)return;
  const p=personnes().find(x=>ENV.sel.has(x.email))||{prenom:'Prénom',nom:'Nom',civilite:'Mme'};
  const lien='<a href="#" onclick="return false" style="color:var(--purple);font-weight:700">[lien personnel de '+esc(p.prenom)+']</a>';
  const txt=esc(envRemplacer(ENV.message,p)).replace(/\{lien\}/gi,lien).replace(/\n/g,'<br>');
  const bouton=/\{lien\}/i.test(ENV.message)?'':'<p style="text-align:center;margin-top:14px"><span style="display:inline-block;background:var(--orange);color:#fff;font-weight:700;padding:9px 20px;border-radius:10px">Accéder au questionnaire</span></p>';
  el.innerHTML='<div style="font-size:12px;color:var(--text-light);margin-bottom:8px">Objet : '+esc(envRemplacer(ENV.objet,p))+' · pour '+esc(p.prenom)+' '+esc(p.nom)+'</div>'+txt+bouton;
}
function envModele(type){
  if(!confirm('Remplacer le message actuel par ce modèle ?'))return;
  if(type==='candidat'){ENV.message=MODELE_CANDIDAT;ENV.objet='Votre candidature — entretien et questionnaire préparatoire';}
  else{ENV.message=modeleMessage(ENV.kind,ENV.titre);ENV.objet=ENV.kind==='quiz'?'Votre questionnaire - Koalakids':'Votre formation - Koalakids';}
  document.getElementById('env-message').value=ENV.message;
  document.getElementById('env-objet').value=ENV.objet;
  envApercu();
}
function envAjouterCandidat(){
  const g=id=>document.getElementById(id).value.trim();
  const prenom=g('man-prenom'),nom=g('man-nom'),email=memeMail(g('man-mail')),creche=g('man-creche'),civilite=g('man-civ');
  if(!prenom||!email)return alert('Indiquez au moins le prénom et l’adresse mail.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return alert('Cette adresse mail ne semble pas valide.');
  if(!creche)return alert('Choisissez une crèche.');
  if(personnes().some(p=>p.email===email))return alert('Cette adresse est déjà dans la liste.');
  ENV.manuels.push({source:'manuel',civilite,prenom,nom,email,creche,statut:STATUT_RECRUT});
  ENV.sel.add(email);
  ['man-prenom','man-nom','man-mail'].forEach(id=>document.getElementById(id).value='');
  // Le filtre en cours ne doit pas masquer le candidat qu'on vient d'ajouter.
  if(ENV.fCreche&&ENV.fCreche!==creche){ENV.fCreche=creche;document.getElementById('env-creche').value=creche;}
  if(ENV.fStatut&&ENV.fStatut!==STATUT_RECRUT){ENV.fStatut='';document.getElementById('env-statut').value='';}
  if(ENV.fContact==='oui'){ENV.fContact='';document.getElementById('env-contact').value='';}
  envMajListe();
}

async function envLancer(relance){
  if(ENV.busy)return;
  const pers=personnes().filter(p=>ENV.sel.has(p.email));
  const cibles=pers.filter(p=>relance?dejaContacte(p):!dejaContacte(p));
  if(!cibles.length)return;
  const message=ENV.message.trim();
  if(!message)return alert('Le message est vide.');
  if(/\[[^\]]+\]/.test(message)&&!confirm('Le message contient encore des passages entre crochets (par ex. [jour], [heure]) à compléter.\n\nL’envoyer tel quel ?'))return;
  let objet=ENV.objet.trim();
  if(relance&&!/^rappel/i.test(objet))objet='Rappel - '+objet;
  if(!confirm((relance?'Relancer ':'Envoyer à ')+cibles.length+' personne'+(cibles.length>1?'s':'')+' ?\n\nObjet : '+objet))return;
  ENV.busy=true;envMajActions();
  const etat=document.getElementById('env-etat');
  const tous=[];
  try{
    for(let i=0;i<cibles.length;i+=40){
      etat.className='save-status';
      etat.textContent='Envoi en cours… '+Math.min(i,cibles.length)+' / '+cibles.length;
      const lot=cibles.slice(i,i+40).map(p=>({ref:p.ref,civilite:p.civilite,prenom:p.prenom,nom:p.nom,email:p.email,creche:p.creche,statut:p.statut,source:p.source}));
      const r=await appelFn('envoyer-quiz',{kind:ENV.kind,item_id:ENV.id,objet,message,expediteur:ENV.exp,relance,destinataires:lot});
      tous.push(...(r.resultats||[]));
    }
  }catch(e){
    // Les lots d'avant sont partis : on les montre quand même, avec l'erreur du lot interrompu.
    const faits=new Set(tous.map(x=>x.email));
    cibles.filter(p=>!faits.has(p.email)).forEach(p=>tous.push({email:p.email,prenom:p.prenom,nom:p.nom,etat:'echec',erreur:'Non envoyé : '+e.message}));
  }
  ENV.busy=false;
  ENV.resultats=tous;
  try{await chargerEnvoi();}catch(e){}
  renderEnvoi();
}
function renderRecapEnvoi(){
  const r=ENV.resultats;
  const n=k=>r.filter(x=>x.etat===k).length;
  const lib={envoye:'✔ Envoyé',echec:'✗ Échec',deja_envoye:'Déjà contacté (ignoré)',doublon:'Doublon (ignoré)'};
  const col={envoye:'var(--success-text)',echec:'var(--danger-text)'};
  app().innerHTML=`
    ${tabs(ENV.kind==='quiz'?'quiz':'formations')}
    <h2 style="font-size:20px;color:var(--purple);margin-bottom:.25rem">Récapitulatif</h2>
    <p style="font-size:14px;color:var(--text-muted);margin-bottom:1rem"><b>${esc(ENV.titre)}</b> · ${n('envoye')} envoyé${n('envoye')>1?'s':''}${n('echec')?' · <span style="color:var(--danger-text);font-weight:700">'+n('echec')+' échec'+(n('echec')>1?'s':'')+'</span>':''}</p>
    <div class="question-card" style="padding:0;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${r.map(x=>`<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:9px 12px"><b>${esc(x.prenom)} ${esc(x.nom)}</b><br><span style="color:var(--text-muted);font-size:12px">${esc(x.email)}</span></td>
          <td style="padding:9px 12px;font-weight:700;color:${col[x.etat]||'var(--text-muted)'}">${esc(lib[x.etat]||x.etat)}${x.erreur?'<br><span style="font-weight:400;font-size:12px">'+esc(x.erreur)+'</span>':''}</td></tr>`).join('')}
      </table>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:1rem">
      ${n('echec')?'<button class="btn primary" onclick="envReessayer()">↻ Revenir pour réessayer les échecs</button>':''}
      <button class="btn" onclick="envRevenir()">Revenir à la liste</button>
      <button class="btn purple" onclick="retourEnvoi()">Terminer</button>
    </div>`;
}
function envReessayer(){
  const ko=new Set(ENV.resultats.filter(x=>x.etat==='echec').map(x=>x.email));
  ENV.resultats=null;ENV.sel=new Set([...ko]);renderEnvoi();
}
function envRevenir(){ENV.resultats=null;ENV.sel=new Set();renderEnvoi();}

/* ===== NAVIGATION ONGLETS ===== */
function tabs(active){
  const t=(id,label)=>`<button class="tab ${active===id?'on':''}" onclick="goTab('${id}')">${label}</button>`;
  return `<div class="tabs">${t('quiz','Quiz')}${t('formations','Formations')}</div>`;
}
function goTab(id){
  if(id==='quiz'){view='list';loadQuizzes();}
  else{view='themes';loadThemes();}
}

function renderLogin(){
  app().innerHTML=`
  <div class="start-screen" style="max-width:420px;margin:2rem auto">
    <div class="start-logo-wrap"><img src="${document.getElementById('logo').src}" alt="Koalakids"></div>
    <h2>Espace administrateur</h2>
    <p class="subtitle">Connectez-vous pour gérer les quiz.</p>
    <div class="form-group"><label class="form-label">E-mail</label>
      <input class="form-input" id="log-mail" type="email" autocomplete="username"></div>
    <div class="form-group"><label class="form-label">Mot de passe</label>
      <input class="form-input" id="log-pass" type="password" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')login()"></div>
    <div style="margin-top:1.25rem"><button class="btn purple" style="width:100%;padding:12px" onclick="login()">Se connecter</button></div>
    <div id="log-err" class="save-status err" style="margin-top:.75rem"></div>
  </div>`;
}
async function login(){
  const email=document.getElementById('log-mail').value.trim();
  const password=document.getElementById('log-pass').value;
  const err=document.getElementById('log-err');
  err.textContent='Connexion…';
  const{error}=await db.auth.signInWithPassword({email,password});
  if(error){err.textContent='⚠ '+error.message;return;}
  view='list';await loadQuizzes();
}
async function logout(){await db.auth.signOut();view='login';render();}

async function loadQuizzes(){
  const{data,error}=await db.from('quiz').select('*').order('cree_le',{ascending:false});
  if(error){app().innerHTML=`<div class="center-msg">⚠ ${esc(error.message)}</div>`;return;}
  quizzes=data||[];
  const counts={};
  for(const q of quizzes){
    const{count}=await db.from('questions').select('*',{count:'exact',head:true}).eq('quiz_id',q.id);
    const{count:rc}=await db.from('resultats').select('*',{count:'exact',head:true}).eq('quiz_id',q.id);
    counts[q.id]={q:count||0,r:rc||0};
  }
  quizzes.forEach(q=>{q._c=counts[q.id]});
  render();
}

function renderList(){
  const base=quizBase();
  const items=quizzes.length?quizzes.map(q=>`
    <div class="question-card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <h3 style="font-size:16px;font-weight:700">${esc(q.titre)}</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-top:2px">${esc(q.description)}</p>
          <p style="font-size:12px;color:var(--text-light);margin-top:6px">
            ${q._c.q} question${q._c.q>1?'s':''} · ${q._c.r} résultat${q._c.r>1?'s':''} ·
            <span style="color:${q.publie?'var(--success-text)':'var(--text-light)'}">${q.publie?'● Publié':'○ Brouillon'}</span>
          </p>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="openQuiz('${q.id}')">Modifier</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="openResults('${q.id}')">Résultats (${q._c.r})</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="togglePublish('${q.id}',${q.publie})">${q.publie?'Dépublier':'Publier'}</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="copyLink('${q.id}')">Copier le lien</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="openEnvoi('quiz','${q.id}')">✉ Envoyer par mail</button>
        <button class="btn" style="padding:7px 14px;font-size:13px;color:var(--danger-text)" onclick="deleteQuiz('${q.id}')">Supprimer</button>
      </div>
    </div>`).join(''):`<div class="center-msg">Aucun quiz. Créez le premier.</div>`;
  app().innerHTML=`
    ${tabs('quiz')}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;gap:12px;flex-wrap:wrap">
      <h2 style="font-size:20px;color:var(--purple)">Mes quiz</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="file" accept="application/json" id="import-json-input" style="display:none" onchange="importQuizJSON(this)">
        <button class="btn" onclick="document.getElementById('import-json-input').click()">⇪ Importer JSON</button>
        <button class="btn purple" onclick="newQuiz()">+ Nouveau quiz</button>
      </div>
    </div>
    <p style="font-size:12px;color:var(--text-light);margin:-1rem 0 1.25rem">
      Format JSON attendu : un quiz — <code>{"titre","description","questions":[{"enonce","options":[...],"reponses":[0],"multi":false}]}</code>
      — ou un tableau de plusieurs quiz. <code>reponses</code> contient les index (à partir de 0) des bonnes options.
    </p>${items}
    <p style="font-size:12px;color:var(--text-light);margin-top:1rem">Lien salariées : ${esc(base)}?quiz=IDENTIFIANT</p>`;
}

function quizBase(){
  let u=location.href.split('?')[0].split('#')[0];
  u=u.replace(/\/admin(\.html)?\/?$/i,'/index.html');
  if(!/index\.html$/i.test(u))u=u.replace(/\/?$/,'/index.html');
  return u;
}
function copyLink(id){
  const base=quizBase();
  const url=base+'?quiz='+id;
  navigator.clipboard.writeText(url).then(()=>alert('Lien copié :\n'+url),()=>prompt('Copiez ce lien :',url));
}
function mailCandidat(id){
  const url=quizBase()+'?quiz='+id;
  const nom=(prompt("Nom de la candidate ou du candidat (facultatif) :","")||'[Nom]').trim()||'[Nom]';
  const civ=(prompt("Civilit\u00e9 : tapez M ou Mme","Mme")||'Mme').trim();
  const objet="Votre candidature \u2014 entretien et questionnaire pr\u00e9paratoire";
  const corps=[
    `Bonjour ${civ} ${nom},`,'',
    "Je fais suite \u00e0 votre candidature au poste de [intitul\u00e9 du poste] au sein de notre micro-cr\u00e8che Koalakids [cr\u00e8che]. Je vous propose d'\u00e9changer lors d'un entretien le [jour] [date] \u00e0 [heure], sur notre micro-cr\u00e8che situ\u00e9e au [adresse].",'',
    "Afin de pr\u00e9parer cet entretien, vous trouverez ci-joint la fiche de poste ainsi que le projet \u00e9ducatif et p\u00e9dagogique. Merci d'en prendre connaissance, puis de r\u00e9pondre au questionnaire qui s'y rattache :",'',
    url,'',
    "Sur la premi\u00e8re page, merci d'indiquer votre pr\u00e9nom, votre nom, puis de s\u00e9lectionner \u00ab Salari\u00e9(e) en recrutement \u00bb. Comptez une dizaine de minutes ; les r\u00e9ponses sont corrig\u00e9es au fur et \u00e0 mesure. Il ne s'agit pas d'une \u00e9preuve \u00e9liminatoire : ce questionnaire servira simplement de base \u00e0 nos \u00e9changes.",'',
    "Merci de me confirmer le rendez-vous par retour de mail.",'',
    "En l'attente,",'',"Cordialement,",'',
    "David Bucari",
    "\u00c9ducateur de jeunes enfants",
    "R\u00e9f\u00e9rent p\u00e9dagogique et familial \u2014 Koalakids Ollioules, St Jean du Var et Cuers Peireguins",
    "06 59 73 80 14",'',
    "\u00c9lue meilleure enseigne 2026 pour la qualit\u00e9 de service (magazine Capital)"
  ].join('\r\n');
  /* Outlook (client lourd) plante silencieusement ou boucle indéfiniment sur un lien
     mailto: dès que le sujet+corps encodés approchent ~2000 caractères (limite connue
     de sa gestion des liens mailto:, cf. tickets Microsoft) — largement dépassé par ce
     courrier type. On copie donc le corps dans le presse-papiers et on n'ouvre qu'un
     mailto: minimal (sujet seul), pour que le message s'ouvre de façon fiable ; il ne
     reste plus qu'à coller (Ctrl+V) le texte déjà copié. */
  const href='mailto:?subject='+encodeURIComponent(objet);
  const ouvrir=()=>{const a=document.createElement('a');a.href=href;a.click();};
  navigator.clipboard.writeText(corps).then(()=>{
    alert('Le texte du mail a été copié dans le presse-papiers.\nOutlook va s\'ouvrir : collez-le (Ctrl+V) dans le corps du message.');
    ouvrir();
  },()=>{
    prompt('Copiez ce texte (Ctrl+C), puis collez-le dans le mail qui va s\'ouvrir :',corps);
    ouvrir();
  });
}
async function togglePublish(id,cur){
  const{error}=await db.from('quiz').update({publie:!cur}).eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  await loadQuizzes();
}
async function deleteQuiz(id){
  const q=quizzes.find(x=>x.id===id);
  if(!confirm(`Supprimer « ${q.titre} » ?\nLes questions ET les résultats associés seront définitivement effacés.`))return;
  const{error}=await db.from('quiz').delete().eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  await loadQuizzes();
}
function importQuizJSON(input){
  const f=input.files[0];
  if(!f)return;
  const reader=new FileReader();
  reader.onload=async(e)=>{
    let data;
    try{data=JSON.parse(e.target.result);}
    catch(err){alert('⚠ Fichier JSON invalide : '+err.message);input.value='';return;}
    const quizList=Array.isArray(data)?data:[data];
    for(const q of quizList){
      if(!q||typeof q.titre!=='string'||!q.titre.trim()){
        alert('⚠ Chaque quiz doit avoir un "titre" (texte non vide).');input.value='';return;
      }
      if(!Array.isArray(q.questions)||!q.questions.length){
        alert(`⚠ Le quiz "${q.titre}" doit contenir un tableau "questions" non vide.`);input.value='';return;
      }
      for(let i=0;i<q.questions.length;i++){
        const qq=q.questions[i];
        if(!qq||typeof qq.enonce!=='string'||!qq.enonce.trim()){
          alert(`⚠ Question ${i+1} du quiz "${q.titre}" : "enonce" manquant.`);input.value='';return;
        }
        if(!Array.isArray(qq.options)||qq.options.length<2){
          alert(`⚠ Question ${i+1} du quiz "${q.titre}" : au moins 2 "options" sont requises.`);input.value='';return;
        }
        if(!Array.isArray(qq.reponses)||!qq.reponses.length||qq.reponses.some(r=>!Number.isInteger(r)||r<0||r>=qq.options.length)){
          alert(`⚠ Question ${i+1} du quiz "${q.titre}" : "reponses" doit lister les index (0-based) des bonnes options.`);input.value='';return;
        }
      }
    }
    const nbQ=quizList.reduce((a,q)=>a+q.questions.length,0);
    if(!confirm(`Importer ${quizList.length} quiz (${nbQ} question${nbQ>1?'s':''}) ?`)){input.value='';return;}
    try{
      for(const q of quizList){
        const{data:qrow,error:qerr}=await db.from('quiz').insert({
          titre:q.titre.trim(),description:(q.description||'').trim(),publie:!!q.publie
        }).select().single();
        if(qerr)throw qerr;
        const payload=q.questions.map((qq,i)=>({
          quiz_id:qrow.id,
          enonce:qq.enonce.trim(),
          options:qq.options.map(o=>String(o)),
          reponses:qq.reponses,
          multi:!!qq.multi,
          ordre:i,
          image_url:qq.image_url||null,
          image_alt:qq.image_alt||null
        }));
        const{error:qsErr}=await db.from('questions').insert(payload);
        if(qsErr)throw qsErr;
      }
      alert('✓ Import terminé.');
      await loadQuizzes();
    }catch(err){
      alert('⚠ Erreur pendant l\'import : '+err.message);
    }
    input.value='';
  };
  reader.readAsText(f);
}
async function newQuiz(){
  const titre=prompt('Titre du nouveau quiz :');
  if(!titre)return;
  const{data,error}=await db.from('quiz').insert({titre:titre,description:'',publie:false}).select().single();
  if(error)return alert('Erreur : '+error.message);
  openQuiz(data.id);
}

async function openQuiz(id){
  curQuiz=quizzes.find(q=>q.id===id)||null;
  if(!curQuiz){const{data}=await db.from('quiz').select('*').eq('id',id).single();curQuiz=data;}
  const{data,error}=await db.from('questions').select('*').eq('quiz_id',id).order('ordre');
  if(error)return alert('Erreur : '+error.message);
  curQuestions=data||[];
  view='edit';render();
}

function renderEdit(){
  const qs=curQuestions.map((q,i)=>{
    const opts=q.options.map((o,j)=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <input type="${q.multi?'checkbox':'radio'}" name="ans-${i}" ${q.reponses.includes(j)?'checked':''}
          onchange="setAnswer(${i},${j},this.checked)" style="width:16px;height:16px;accent-color:var(--orange);flex-shrink:0">
        <span style="font-size:12px;font-weight:700;color:var(--text-muted);width:14px">${letters[j]}</span>
        <input class="form-input" style="padding:6px 10px;font-size:13px" value="${esc(o)}"
          onchange="setOption(${i},${j},this.value)">
        ${q.options.length>2?`<button class="btn" style="padding:4px 8px;font-size:12px" onclick="delOption(${i},${j})">×</button>`:''}
      </div>`).join('');
    return `<div class="question-card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
        <span class="q-badge" style="margin:0">Question ${i+1}</span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <label style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px">
            <input type="checkbox" ${q.multi?'checked':''} onchange="setMulti(${i},this.checked)"
              style="accent-color:var(--purple)"> Plusieurs réponses</label>
          <button class="btn" style="padding:4px 9px;font-size:12px" onclick="moveQ(${i},-1)" ${i===0?'disabled':''}>↑</button>
          <button class="btn" style="padding:4px 9px;font-size:12px" onclick="moveQ(${i},1)" ${i===curQuestions.length-1?'disabled':''}>↓</button>
          <button class="btn" style="padding:4px 9px;font-size:12px;color:var(--danger-text)" onclick="delQ(${i})">Suppr.</button>
        </div>
      </div>
      <textarea class="form-input" rows="2" style="font-size:14px;margin-bottom:10px;resize:vertical"
        onchange="setEnonce(${i},this.value)">${esc(q.enonce)}</textarea>
      <div style="margin-bottom:12px">
        ${q.image_url?`<img src="${esc(q.image_url)}" alt="" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border);display:block;margin-bottom:6px">`:''}
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="file" accept="image/*" id="qfile-${i}" style="display:none" onchange="uploadQImg(${i},this)">
          <button class="btn" style="padding:5px 12px;font-size:12px" onclick="document.getElementById('qfile-${i}').click()">
            ${q.image_url?"Remplacer l'image":'+ Image (facultatif)'}</button>
          ${q.image_url?`<button class="btn" style="padding:5px 12px;font-size:12px;color:var(--danger-text)" onclick="removeQImg(${i})">Retirer</button>`:''}
          <span id="qup-${i}" style="font-size:12px;color:var(--text-muted)"></span>
        </div>
        ${q.image_url?`<input class="form-input" style="padding:6px 10px;font-size:12px;margin-top:6px" placeholder="Texte alternatif (decrit l'image)" value="${esc(q.image_alt)}" onchange="setQAlt(${i},this.value)">`:''}
      </div>
      ${opts}
      ${q.options.length<6?`<button class="btn" style="padding:5px 12px;font-size:12px;margin-top:4px" onclick="addOption(${i})">+ Option</button>`:''}
    </div>`;
  }).join('');
  app().innerHTML=`
    <button class="btn" style="margin-bottom:1rem" onclick="backToList()">← Retour</button>
    <div class="question-card" style="margin-bottom:1.25rem">
      <div class="form-group"><label class="form-label">Titre du quiz</label>
        <input class="form-input" id="qz-titre" value="${esc(curQuiz.titre)}"></div>
      <div class="form-group" style="margin-bottom:0"><label class="form-label">Description</label>
        <input class="form-input" id="qz-desc" value="${esc(curQuiz.description)}"></div>
    </div>
    ${qs||'<div class="center-msg">Aucune question. Ajoutez la première.</div>'}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:1rem">
      <button class="btn" onclick="addQ()">+ Ajouter une question</button>
      <button class="btn primary" onclick="saveAll()">Enregistrer les modifications</button>
    </div>
    <div id="save-msg" class="save-status" style="margin-top:.75rem"></div>`;
}

function setEnonce(i,v){curQuestions[i].enonce=v}
function setQAlt(i,v){curQuestions[i].image_alt=v}
function removeQImg(i){curQuestions[i].image_url=null;curQuestions[i].image_alt=null;renderEdit()}
async function uploadQImg(i,input){
  const f=input.files[0];if(!f)return;
  const st=document.getElementById('qup-'+i);
  if(f.size>5*1024*1024){st.textContent='\u26a0 Image trop lourde (max 5 Mo)';st.style.color='var(--danger-text)';return;}
  st.style.color='var(--text-muted)';st.textContent='Envoi en cours\u2026';
  const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace('jfif','jpg');
  const path=`quiz/${curQuiz.id}/${Date.now()}.${ext}`;
  const{error}=await db.storage.from('images-formations').upload(path,f,{cacheControl:'3600',upsert:false});
  if(error){st.textContent='\u26a0 '+error.message;st.style.color='var(--danger-text)';return;}
  const{data}=db.storage.from('images-formations').getPublicUrl(path);
  curQuestions[i].image_url=data.publicUrl;
  if(!curQuestions[i].image_alt)curQuestions[i].image_alt=f.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
  renderEdit();
}
function setOption(i,j,v){curQuestions[i].options[j]=v}
function setMulti(i,v){
  const q=curQuestions[i];q.multi=v;
  if(!v&&q.reponses.length>1)q.reponses=[q.reponses[0]];
  renderEdit();
}
function setAnswer(i,j,checked){
  const q=curQuestions[i];
  if(q.multi){
    q.reponses=checked?[...new Set([...q.reponses,j])].sort((a,b)=>a-b):q.reponses.filter(x=>x!==j);
  }else q.reponses=[j];
}
function addOption(i){curQuestions[i].options.push('');renderEdit()}
function delOption(i,j){
  const q=curQuestions[i];
  q.options.splice(j,1);
  q.reponses=q.reponses.filter(x=>x!==j).map(x=>x>j?x-1:x);
  if(!q.reponses.length)q.reponses=[0];
  renderEdit();
}
function addQ(){
  curQuestions.push({quiz_id:curQuiz.id,enonce:'Nouvelle question',options:['','','',''],reponses:[0],multi:false,image_url:null,image_alt:null,ordre:curQuestions.length,_new:true});
  renderEdit();
}
function delQ(i){
  if(!confirm('Supprimer cette question ?'))return;
  const q=curQuestions[i];
  if(q.id)(curQuestions._del=curQuestions._del||[]).push(q.id);
  curQuestions.splice(i,1);renderEdit();
}
function moveQ(i,d){
  const j=i+d;if(j<0||j>=curQuestions.length)return;
  const del=curQuestions._del;
  [curQuestions[i],curQuestions[j]]=[curQuestions[j],curQuestions[i]];
  curQuestions._del=del;renderEdit();
}
function backToList(){
  if(confirm('Quitter sans enregistrer les modifications non sauvegardées ?')){view='list';loadQuizzes();}
}

async function saveAll(){
  const msg=document.getElementById('save-msg');
  msg.className='save-status';msg.textContent='Enregistrement…';
  try{
    const u=await db.from('quiz').update({
      titre:document.getElementById('qz-titre').value.trim(),
      description:document.getElementById('qz-desc').value.trim()
    }).eq('id',curQuiz.id);
    if(u.error)throw u.error;
    if(curQuestions._del&&curQuestions._del.length){
      const d=await db.from('questions').delete().in('id',curQuestions._del);
      if(d.error)throw d.error;
      curQuestions._del=[];
    }
    for(let i=0;i<curQuestions.length;i++){
      const q=curQuestions[i];
      const payload={quiz_id:curQuiz.id,enonce:q.enonce,options:q.options,reponses:q.reponses,multi:q.multi,ordre:i,image_url:q.image_url||null,image_alt:q.image_alt||null};
      if(q.id){
        const r=await db.from('questions').update(payload).eq('id',q.id);
        if(r.error)throw r.error;
      }else{
        const r=await db.from('questions').insert(payload).select().single();
        if(r.error)throw r.error;
        q.id=r.data.id;delete q._new;
      }
      q.ordre=i;
    }
    msg.className='save-status ok';msg.textContent='✓ Modifications enregistrées';
  }catch(e){
    msg.className='save-status err';msg.textContent='⚠ '+e.message;
  }
}

async function openResults(id){
  curQuiz=quizzes.find(q=>q.id===id);
  const{data,error}=await db.from('resultats').select('*').eq('quiz_id',id).order('passe_le',{ascending:false});
  if(error)return alert('Erreur : '+error.message);
  results=data||[];filterCreche='';filterStatut='';view='results';render();
}

function filtered(){
  return results.filter(r=>
    (!filterCreche||r.creche===filterCreche)&&
    (!filterStatut||(r.statut||'')===filterStatut));
}
function renderResults(){
  const list=filtered();
  const creches=[...new Set(results.map(r=>r.creche).filter(Boolean))].sort();
  const statuts=[...new Set(results.map(r=>r.statut).filter(Boolean))].sort();
  const moy=list.length?Math.round(list.reduce((a,r)=>a+r.pourcentage,0)/list.length):0;

  let byQ='';
  if(list.length&&list[0].detail){
    const stats={};
    list.forEach(r=>(r.detail||[]).forEach(d=>{
      if(!stats[d.ordre])stats[d.ordre]={e:d.enonce,ok:0,n:0};
      stats[d.ordre].n++;if(d.correct)stats[d.ordre].ok++;
    }));
    const rows=Object.entries(stats).sort((a,b)=>a[0]-b[0]).map(([o,s])=>{
      const p=Math.round(s.ok/s.n*100);
      const col=p>=70?'var(--success-text)':p>=40?'var(--orange)':'var(--danger-text)';
      return `<tr><td style="padding:6px 8px;font-size:12px;color:var(--text-muted)">Q${+o+1}</td>
        <td style="padding:6px 8px;font-size:12px">${esc(s.e).slice(0,90)}</td>
        <td style="padding:6px 8px;font-size:13px;font-weight:700;color:${col};text-align:right;white-space:nowrap">${p}%</td></tr>`;
    }).join('');
    byQ=`<h3 style="font-size:15px;color:var(--purple);margin:1.5rem 0 .5rem">Taux de réussite par question</h3>
      <div class="question-card" style="padding:8px;overflow-x:auto"><table style="width:100%;border-collapse:collapse">${rows}</table></div>`;
  }

  const rows=list.map(r=>`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px;font-size:13px"><strong>${esc(r.prenom)} ${esc(r.nom)}</strong></td>
      <td style="padding:8px;font-size:12px;color:var(--text-muted)">${esc(r.statut||'—')}</td>
      <td style="padding:8px;font-size:12px;color:var(--text-muted)">${esc(r.creche||'—')}</td>
      <td style="padding:8px;font-size:12px;color:var(--text-muted);white-space:nowrap">${new Date(r.passe_le).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
      <td style="padding:8px;font-size:13px;text-align:right;white-space:nowrap">${r.score}/${r.total}</td>
      <td style="padding:8px;font-size:13px;font-weight:700;text-align:right;color:${r.pourcentage>=80?'var(--success-text)':r.pourcentage>=60?'var(--purple)':'var(--danger-text)'}">${r.pourcentage}%</td>
      <td style="padding:8px;text-align:right"><button class="btn" style="padding:3px 8px;font-size:11px" onclick="showDetail('${r.id}')">Détail</button></td>
    </tr>`).join('');

  app().innerHTML=`
    <button class="btn" style="margin-bottom:1rem" onclick="view='list';loadQuizzes()">← Retour</button>
    <h2 style="font-size:19px;color:var(--purple);margin-bottom:.25rem">${esc(curQuiz.titre)}</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:1rem">${list.length} résultat${list.length>1?'s':''} · moyenne ${moy}%</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div class="form-group" style="flex:1;min-width:220px;max-width:320px">
        <label class="form-label">Filtrer par statut</label>
        <select class="form-select" onchange="filterStatut=this.value;renderResults()">
          <option value="">Tous les statuts</option>
          ${statuts.map(c=>`<option value="${esc(c)}" ${c===filterStatut?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="flex:1;min-width:220px;max-width:320px">
        <label class="form-label">Filtrer par crèche</label>
        <select class="form-select" onchange="filterCreche=this.value;renderResults()">
          <option value="">Toutes les crèches</option>
          ${creches.map(c=>`<option value="${esc(c)}" ${c===filterCreche?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:1rem"><button class="btn" onclick="exportCSV()">Exporter en CSV</button></div>
    ${list.length?`<div class="question-card" style="padding:8px;overflow-x:auto"><table style="width:100%;border-collapse:collapse">${rows}</table></div>`:'<div class="center-msg">Aucun résultat pour ce filtre.</div>'}
    ${byQ}`;
}

function showDetail(id){
  const r=results.find(x=>x.id===id);
  if(!r||!r.detail)return alert('Aucun détail enregistré pour ce résultat.');
  const ko=r.detail.filter(d=>!d.correct);
  const txt=ko.length?ko.map(d=>`Q${d.ordre+1} — ${d.enonce}`).join('\n\n'):'Aucune erreur.';
  alert(`${r.prenom} ${r.nom} — ${r.score}/${r.total}\n\nQuestions ratées :\n\n${txt}`);
}

function exportCSV(){
  const list=filtered();
  const head=['Prénom','Nom','Statut','Crèche','Date','Score','Total','Pourcentage','Questions ratées'];
  const lines=[head.join(';')];
  list.forEach(r=>{
    const ko=(r.detail||[]).filter(d=>!d.correct).map(d=>'Q'+(d.ordre+1)).join(' ');
    lines.push([r.prenom,r.nom,r.statut||'',r.creche||'',new Date(r.passe_le).toLocaleString('fr-FR'),r.score,r.total,r.pourcentage+'%',ko]
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';'));
  });
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='resultats-'+curQuiz.titre.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.csv';
  a.click();
}

/* ==========================================================
   FORMATIONS — Thèmes & Modules
   ========================================================== */

async function loadThemes(){
  const{data,error}=await db.from('theme').select('*').order('ordre');
  if(error){app().innerHTML=`${tabs('formations')}<div class="center-msg">⚠ ${esc(error.message)}</div>`;return;}
  themes=data||[];
  for(const t of themes){
    const{count}=await db.from('module').select('*',{count:'exact',head:true}).eq('theme_id',t.id);
    t._n=count||0;
  }
  view='themes';render();
}

function renderThemes(){
  const items=themes.length?themes.map((t,i)=>`
    <div class="question-card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <h3 style="font-size:16px;font-weight:700">${esc(t.nom)}</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-top:2px">${esc(t.description)||'<em style="color:var(--text-light)">Aucune description</em>'}</p>
          <p style="font-size:12px;color:var(--text-light);margin-top:6px">${t._n} module${t._n>1?'s':''}</p>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" style="padding:4px 9px;font-size:12px" onclick="moveTheme(${i},-1)" ${i===0?'disabled':''}>↑</button>
          <button class="btn" style="padding:4px 9px;font-size:12px" onclick="moveTheme(${i},1)" ${i===themes.length-1?'disabled':''}>↓</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn primary" style="padding:7px 14px;font-size:13px" onclick="openTheme('${t.id}')">Ouvrir (${t._n})</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="editTheme('${t.id}')">Renommer</button>
        <button class="btn" style="padding:7px 14px;font-size:13px;color:var(--danger-text)" onclick="deleteTheme('${t.id}')">Supprimer</button>
      </div>
    </div>`).join(''):`<div class="center-msg">Aucun thème pour l'instant. Créez le premier.</div>`;
  app().innerHTML=`
    ${tabs('formations')}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;gap:12px;flex-wrap:wrap">
      <h2 style="font-size:20px;color:var(--purple)">Thèmes de formation</h2>
      <button class="btn purple" onclick="newTheme()">+ Nouveau thème</button>
    </div>${items}`;
}

async function newTheme(){
  const nom=prompt('Nom du thème (ex : L\'attachement) :');
  if(!nom||!nom.trim())return;
  const description=prompt('Description courte (facultative) :')||'';
  const ordre=themes.length;
  const{error}=await db.from('theme').insert({nom:nom.trim(),description:description.trim(),ordre});
  if(error)return alert('Erreur : '+error.message);
  loadThemes();
}
async function editTheme(id){
  const t=themes.find(x=>x.id===id);
  const nom=prompt('Nom du thème :',t.nom);
  if(nom===null||!nom.trim())return;
  const description=prompt('Description :',t.description||'');
  if(description===null)return;
  const{error}=await db.from('theme').update({nom:nom.trim(),description:description.trim()}).eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  loadThemes();
}
async function deleteTheme(id){
  const t=themes.find(x=>x.id===id);
  if(t._n>0){
    if(!confirm(`« ${t.nom} » contient ${t._n} module${t._n>1?'s':''}.\nLes supprimer également, avec tout leur contenu ?\n\nCette action est définitive.`))return;
  }else if(!confirm(`Supprimer le thème « ${t.nom} » ?`))return;
  const{error}=await db.from('theme').delete().eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  loadThemes();
}
async function moveTheme(i,d){
  const j=i+d;if(j<0||j>=themes.length)return;
  const a=themes[i],b=themes[j];
  const e1=await db.from('theme').update({ordre:j}).eq('id',a.id);
  const e2=await db.from('theme').update({ordre:i}).eq('id',b.id);
  if(e1.error||e2.error)return alert('Erreur : '+((e1.error||e2.error).message));
  loadThemes();
}

/* ----- MODULES D'UN THÈME ----- */

async function openTheme(id){
  curTheme=themes.find(t=>t.id===id)||null;
  if(!curTheme){const{data}=await db.from('theme').select('*').eq('id',id).single();curTheme=data;}
  await loadModules();
}
async function loadModules(){
  const{data,error}=await db.from('module').select('*').eq('theme_id',curTheme.id).order('ordre');
  if(error)return alert('Erreur : '+error.message);
  curModules=data||[];
  for(const m of curModules){
    const{count}=await db.from('bloc').select('*',{count:'exact',head:true}).eq('module_id',m.id);
    m._b=count||0;
  }
  view='modules';render();
}

function renderModules(){
  const items=curModules.length?curModules.map((m,i)=>`
    <div class="question-card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <h3 style="font-size:16px;font-weight:700">${esc(m.titre)}</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-top:2px">${esc(m.accroche)||'<em style="color:var(--text-light)">Aucune accroche</em>'}</p>
          <p style="font-size:12px;color:var(--text-light);margin-top:6px">
            ${m._b} bloc${m._b>1?'s':''} ·
            <span style="color:${m.publie?'var(--success-text)':'var(--text-light)'}">${m.publie?'● Publié':'○ Brouillon'}</span>
          </p>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" style="padding:4px 9px;font-size:12px" onclick="moveModule(${i},-1)" ${i===0?'disabled':''}>↑</button>
          <button class="btn" style="padding:4px 9px;font-size:12px" onclick="moveModule(${i},1)" ${i===curModules.length-1?'disabled':''}>↓</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn primary" style="padding:7px 14px;font-size:13px" onclick="editContent('${m.id}')">Modifier le contenu</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="editModule('${m.id}')">Renommer</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="copyModuleLink('${m.id}')">Copier le lien</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="openEnvoi('module','${m.id}')">✉ Envoyer par mail</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="toggleModule('${m.id}',${m.publie})">${m.publie?'Dépublier':'Publier'}</button>
        <button class="btn" style="padding:7px 14px;font-size:13px;color:var(--danger-text)" onclick="deleteModule('${m.id}')">Supprimer</button>
      </div>
    </div>`).join(''):`<div class="center-msg">Aucun module dans ce thème. Créez le premier.</div>`;
  app().innerHTML=`
    ${tabs('formations')}
    <button class="btn" style="margin-bottom:1rem" onclick="loadThemes()">← Tous les thèmes</button>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;gap:12px;flex-wrap:wrap">
      <h2 style="font-size:20px;color:var(--purple)">${esc(curTheme.nom)}</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="importModuleJSON()">⇩ Importer (JSON IA)</button>
        <button class="btn purple" onclick="newModule()">+ Nouveau module</button>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:1.25rem">${esc(curTheme.description)}</p>
    ${items}`;
}

async function newModule(){
  const titre=prompt('Titre du module (ex : Les pleurs de la séparation) :');
  if(!titre||!titre.trim())return;
  const accroche=prompt('Accroche courte (facultative) :')||'';
  const{error}=await db.from('module').insert({
    theme_id:curTheme.id,titre:titre.trim(),accroche:accroche.trim(),
    publie:false,ordre:curModules.length
  });
  if(error)return alert('Erreur : '+error.message);
  loadModules();
}
async function importModuleJSON(){
  const raw=prompt('Collez le JSON du module généré par l\u2019IA :\n\n{ "module": { "titre": "\u2026", "accroche": "\u2026" }, "blocs": [ { "type": "texte", "contenu": {\u2026} } ] }');
  if(raw===null||!raw.trim())return;
  let data;
  try{ data=JSON.parse(raw); }
  catch(e){ return alert('JSON invalide : '+e.message); }
  const mod=data.module||data;
  const blocs=data.blocs||[];
  const titre=(mod.titre||'').trim();
  if(!titre)return alert('Le JSON doit contenir un titre de module (module.titre).');
  if(!Array.isArray(blocs)||!blocs.length)return alert('Le JSON doit contenir une liste « blocs » non vide.');
  // Validation des types
  const okTypes=Object.keys(TYPES);
  const bad=blocs.map((b,i)=>({i,t:b&&b.type})).filter(x=>!okTypes.includes(x.t));
  if(bad.length)return alert('Type de bloc inconnu :\n'+bad.map(x=>`bloc #${x.i+1} : « ${x.t} »`).join('\n')+'\n\nTypes valides : '+okTypes.join(', '));
  if(!confirm(`Créer le module « ${titre} » avec ${blocs.length} bloc${blocs.length>1?'s':''} ?`))return;
  // Création du module
  const{data:mrow,error:merr}=await db.from('module').insert({
    theme_id:curTheme.id,titre:titre,accroche:(mod.accroche||'').trim(),
    publie:false,ordre:curModules.length
  }).select().single();
  if(merr)return alert('Erreur création module : '+merr.message);
  // Insertion des blocs (contenu fusionné avec les valeurs par défaut du type)
  const payload=blocs.map((b,i)=>({
    module_id:mrow.id,type:b.type,
    contenu:Object.assign(blocVide(b.type),b.contenu||{}),
    ordre:i
  }));
  const{error:berr}=await db.from('bloc').insert(payload);
  if(berr){
    await db.from('module').delete().eq('id',mrow.id);
    return alert('Erreur insertion des blocs (module annulé) : '+berr.message);
  }
  alert(`Module « ${titre} » importé : ${blocs.length} bloc${blocs.length>1?'s':''}.\nIl est en brouillon — vérifiez le contenu puis publiez-le.`);
  loadModules();
}
async function editModule(id){
  const m=curModules.find(x=>x.id===id);
  const titre=prompt('Titre du module :',m.titre);
  if(titre===null||!titre.trim())return;
  const accroche=prompt('Accroche :',m.accroche||'');
  if(accroche===null)return;
  const{error}=await db.from('module').update({titre:titre.trim(),accroche:accroche.trim()}).eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  loadModules();
}
async function toggleModule(id,cur){
  const{error}=await db.from('module').update({publie:!cur}).eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  loadModules();
}
async function deleteModule(id){
  const m=curModules.find(x=>x.id===id);
  if(!confirm(`Supprimer « ${m.titre} » ?\n${m._b} bloc${m._b>1?'s':''} de contenu ${m._b>1?'seront effacés':'sera effacé'} définitivement.`))return;
  const{error}=await db.from('module').delete().eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  loadModules();
}
async function moveModule(i,d){
  const j=i+d;if(j<0||j>=curModules.length)return;
  const a=curModules[i],b=curModules[j];
  const e1=await db.from('module').update({ordre:j}).eq('id',a.id);
  const e2=await db.from('module').update({ordre:i}).eq('id',b.id);
  if(e1.error||e2.error)return alert('Erreur : '+((e1.error||e2.error).message));
  loadModules();
}

const MOD_CSS=`.readbar{position:sticky;top:68px;z-index:99;height:3px;background:transparent}
.readbar-fill{height:100%;width:0;background:linear-gradient(90deg,var(--orange),#F5963A);transition:width .1s linear}
.m-hero{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:2rem 1.75rem;margin-bottom:1.25rem}
.m-tag{display:inline-block;background:var(--purple-light);color:var(--purple);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:4px 12px;border-radius:20px;margin-bottom:14px}
.m-hero h2{font-size:24px;font-weight:800;color:var(--purple);line-height:1.25;margin-bottom:14px;letter-spacing:-.3px}
.m-hero p{font-size:15px;color:var(--text-muted);margin-bottom:10px}
.m-block{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.75rem;margin-bottom:1.25rem}
.m-block h3{font-size:19px;font-weight:700;color:var(--text);margin-bottom:12px;letter-spacing:-.2px}
.m-block p{font-size:15px;color:var(--text-muted);margin-bottom:12px}
.m-block strong{color:var(--text);font-weight:600}
.m-quote{background:var(--orange-light);border-left:3px solid var(--orange);border-radius:0 var(--radius) var(--radius) 0;padding:16px 20px;font-size:16px;font-weight:600;color:var(--orange-dark);line-height:1.5;margin-top:18px}
.m-scene{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;margin-top:14px}
.m-scene-h{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.m-scene-n{width:26px;height:26px;border-radius:50%;background:var(--purple);color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.m-scene-h h4{font-size:15px;font-weight:700;color:var(--text);line-height:1.3}
.m-scene p{font-size:14px;margin-bottom:10px}
.m-scene-r{border-left:2px solid var(--border-strong);padding-left:12px;margin-bottom:0!important}
.m-pause{background:var(--purple-light);border:1px solid rgba(74,63,159,.2);border-radius:14px;padding:1.5rem;margin-bottom:1.25rem}
.m-pause-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--purple);margin-bottom:10px}
.m-pause-q{font-size:16px;font-weight:600;color:var(--text);line-height:1.5;margin-bottom:8px}
.m-pause-sub{font-size:13px;color:var(--purple);opacity:.85;margin-bottom:14px;line-height:1.5}
.m-input{width:100%;padding:12px 14px;border:1.5px solid rgba(74,63,159,.25);border-radius:var(--radius);font-size:14px;font-family:inherit;color:var(--text);background:white;outline:none;resize:vertical;line-height:1.5}
.m-input:focus{border-color:var(--purple);box-shadow:0 0 0 3px rgba(74,63,159,.1)}
.m-pause-note{font-size:12px;color:var(--purple);opacity:.7;margin-top:8px}
.m-do{display:grid;grid-template-columns:1fr;gap:12px;margin-top:16px}
.m-do-col{border-radius:var(--radius);padding:16px 18px;border:1px solid}
.m-do-col.ok{background:var(--success-bg);border-color:var(--success-border)}
.m-do-col.ko{background:var(--danger-bg);border-color:var(--danger-border)}
.m-do-col h5{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.m-do-col.ok h5{color:var(--success-text)}
.m-do-col.ko h5{color:var(--danger-text)}
.m-do-col ul{list-style:none;display:flex;flex-direction:column;gap:9px}
.m-do-col li{font-size:14px;line-height:1.45;padding-left:17px;position:relative;color:var(--text)}
.m-do-col.ok li::before{content:'\\2713';position:absolute;left:0;color:var(--success-border);font-weight:700}
.m-do-col.ko li::before{content:'\\00d7';position:absolute;left:0;color:var(--danger-border);font-weight:700}
.m-list{list-style:none;display:flex;flex-direction:column;gap:12px;margin-top:6px}
.m-list li{font-size:15px;line-height:1.55;color:var(--text-muted);padding-left:18px;position:relative}
.m-list li::before{content:'';position:absolute;left:0;top:9px;width:6px;height:6px;border-radius:50%;background:var(--purple)}
.m-list strong{color:var(--text)}
.m-key{background:var(--surface);border:2px solid var(--orange);border-radius:14px;padding:1.75rem;margin-bottom:1.25rem}
.m-key h3{font-size:17px;font-weight:700;color:var(--orange);margin-bottom:14px;text-transform:uppercase;letter-spacing:.5px}
.m-key ul{list-style:none;display:flex;flex-direction:column;gap:10px}
.m-key li{font-size:15px;line-height:1.5;padding-left:22px;position:relative;color:var(--text)}
.m-key li::before{content:'';position:absolute;left:0;top:9px;width:7px;height:7px;border-radius:50%;background:var(--orange)}
.m-try{background:var(--purple);color:white;border-radius:14px;padding:1.75rem;margin-bottom:1.25rem}
.m-try-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;opacity:.75;margin-bottom:8px}
.m-try h3{font-size:19px;font-weight:700;margin-bottom:16px;letter-spacing:-.2px}
.m-try-list{list-style:none;counter-reset:t;display:flex;flex-direction:column;gap:14px}
.m-try-list li{font-size:15px;line-height:1.55;padding-left:34px;position:relative;opacity:.95}
.m-try-list li::before{counter-increment:t;content:counter(t);position:absolute;left:0;top:1px;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.m-try-note{font-size:13px;opacity:.75;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2);line-height:1.5}
.m-end{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:2rem 1.5rem;text-align:center;margin-bottom:1rem}
.m-end p{font-size:16px;font-weight:600;color:var(--purple);margin-bottom:1.25rem}
.m-end-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.m-foot{text-align:center;font-size:12px;color:var(--text-light);padding-bottom:2rem}
  .m-hero,.m-block,.m-key,.m-try{padding:1.35rem 1.15rem}
  .m-hero h2{font-size:20px}
  .m-block h3,.m-try h3{font-size:17px}
.m-fig{margin:1.25rem 0}
.m-fig img{width:100%;border-radius:12px;border:1px solid var(--border);display:block}
.m-fig figcaption{font-size:12px;color:var(--text-light);text-align:center;margin-top:6px;font-style:italic}
`;

/* ==========================================================
   ÉDITEUR DE BLOCS — 8 types
   ========================================================== */
const BUCKET='images-formations';
let curBlocs=[],curModule=null,delBlocs=[];

const TYPES={
  texte:{label:'Texte',icon:'¶',desc:'Titre et paragraphes'},
  scenes:{label:'Scènes',icon:'A',desc:'Situations numérotées'},
  reflexion:{label:'Réflexion',icon:'?',desc:'Question et zone de saisie'},
  retenir:{label:'À retenir',icon:'★',desc:'Liste de points clés'},
  citation:{label:'Citation',icon:'“',desc:'Phrase mise en exergue'},
  comparaison:{label:'Plutôt / À éviter',icon:'⇄',desc:'Deux colonnes'},
  essayer:{label:'À essayer',icon:'✓',desc:'Étapes à mettre en pratique'},
  image:{label:'Image',icon:'▣',desc:'Illustration et légende'}
};

function blocVide(type){
  const c={
    texte:{titre:'',paragraphes:['']},
    scenes:{titre:'',items:[{lettre:'A',titre:'',texte:'',analyse:''}]},
    reflexion:{question:'',sous_titre:'',placeholder:'Écrivez ce qui vous vient. Personne ne lira cette réponse.'},
    retenir:{titre:'À retenir',points:['']},
    citation:{texte:''},
    comparaison:{intro:'',plutot:[''],eviter:['']},
    essayer:{label:'À essayer cette semaine',titre:'',etapes:[{titre:'',texte:''}],note:''},
    image:{url:'',alt:'',legende:''}
  };
  return JSON.parse(JSON.stringify(c[type]));
}

function moduleBase(){
  let u=location.href.split('?')[0].split('#')[0];
  u=u.replace(/\/admin(\.html)?\/?$/i,'/formations.html');
  if(!/formations\.html$/i.test(u))u=u.replace(/\/?$/,'/formations.html');
  return u;
}
