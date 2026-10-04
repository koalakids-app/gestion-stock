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

