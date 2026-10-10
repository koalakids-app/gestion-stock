// --- Mémorisation de l'appareil : évite de redemander le code à chaque
// reconnexion sur le même navigateur, en le limitant à 24h glissantes.
// Stocké en localStorage (propre à ce navigateur/appareil), pas en base : ne
// dispense donc jamais du mot de passe, seulement du code à 6 chiffres.
const MFA_TRUST_MS=24*60*60*1000;
function mfaTrustKey(){return 'kk_mfa_trust_'+(ME&&ME.id||'');}
function mfaIsTrusted(){
  try{
    const t=Number(localStorage.getItem(mfaTrustKey())||0);
    return t>0&&(Date.now()-t)<MFA_TRUST_MS;
  }catch(e){return false;}
}
function mfaMarkTrusted(){
  try{localStorage.setItem(mfaTrustKey(),String(Date.now()));}catch(e){}
}
// --- Portail MFA obligatoire ---
function mfaGateSwitchView(id){
  document.getElementById('appView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='none';
  document.getElementById('mfaGateBox').style.display='block';
  ['mfaGateChallengeView','mfaGateEnrollView'].forEach(v=>{
    document.getElementById(v).style.display=(v===id?'block':'none');
  });
}
async function mfaGateCheckAndProceed(){
  try{
    const{data,error}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error)throw error;
    if(data.currentLevel==='aal2'){await inscriptionsGrantAccess();return;}
    if(data.nextLevel==='aal2'){
      if(mfaIsTrusted()){await inscriptionsGrantAccess();return;}
      mfaGateShowChallenge();return;
    }
    await mfaGateShowEnroll();
  }catch(e){
    console.error('[MFA Gate]',e);
    try{await sb.auth.signOut();}catch(_e){}
    showLogin('Erreur de vérification de la double authentification. Réessayez.');
  }
}
function mfaGateShowChallenge(){
  document.getElementById('mfaGateCode').value='';
  document.getElementById('mfaGateChallengeErr').style.display='none';
  mfaGateSwitchView('mfaGateChallengeView');
  setTimeout(()=>{const el=document.getElementById('mfaGateCode');if(el)el.focus();},100);
}
let mfaGateFactorId=null;
async function mfaGateShowEnroll(){
  mfaGateSwitchView('mfaGateEnrollView');
  const err=document.getElementById('mfaGateEnrollErr');
  err.style.display='none';
  try{
    const{data:existing,error:listError}=await sb.auth.mfa.listFactors();
    if(listError)throw listError;
    const stale=(existing.all||[]).filter(f=>f.factor_type==='totp'&&f.status!=='verified');
    for(const f of stale){
      try{await sb.auth.mfa.unenroll({factorId:f.id});}catch(e){console.warn('Nettoyage facteur MFA périmé échoué :',e.message);}
    }
    const{data,error}=await sb.auth.mfa.enroll({factorType:'totp'});
    if(error)throw error;
    mfaGateFactorId=data.id;
    const qrEl=document.getElementById('mfaGateQr');
    qrEl.innerHTML='';
    const qr=data.totp.qr_code||'';
    const svgMatch=qr.match(/<svg[\s\S]*<\/svg>/i);
    if(svgMatch){
      qrEl.innerHTML=svgMatch[0];
      const svg=qrEl.querySelector('svg');
      if(svg){svg.style.width='180px';svg.style.height='180px';}
    }else{
      const img=document.createElement('img');
      img.alt='QR code MFA';
      img.style.cssText='display:block;width:180px;height:180px;object-fit:contain';
      img.src=qr;
      qrEl.appendChild(img);
    }
    document.getElementById('mfaGateSecret').textContent=data.totp.secret;
    document.getElementById('mfaGateEnrollCode').value='';
  }catch(e){
    console.error('[MFA Gate enroll]',e);
    err.textContent="Erreur lors de la préparation de l'enrôlement : "+e.message;err.style.display='block';
  }
}
async function mfaGateVerifyChallenge(){
  const code=document.getElementById('mfaGateCode').value.trim();
  const err=document.getElementById('mfaGateChallengeErr');
  err.style.display='none';
  if(!/^\d{6}$/.test(code)){err.textContent='Le code doit contenir 6 chiffres.';err.style.display='block';return;}
  try{
    const{data:factors,error:listError}=await sb.auth.mfa.listFactors();
    if(listError)throw listError;
    const verified=(factors.totp||[])[0];
    if(!verified)throw new Error('Aucun facteur MFA vérifié trouvé sur ce compte.');
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:verified.id});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:verified.id,challengeId:ch.id,code});
    if(vErr)throw vErr;
    mfaMarkTrusted();
    await inscriptionsGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateConfirmEnroll(){
  const code=document.getElementById('mfaGateEnrollCode').value.trim();
  const err=document.getElementById('mfaGateEnrollErr');
  err.style.display='none';
  if(!/^\d{6}$/.test(code)){err.textContent='Le code doit contenir 6 chiffres.';err.style.display='block';return;}
  if(!mfaGateFactorId){err.textContent="Session d'enrôlement expirée, réessayez.";err.style.display='block';return;}
  try{
    const{data:ch,error:chErr}=await sb.auth.mfa.challenge({factorId:mfaGateFactorId});
    if(chErr)throw chErr;
    const{error:vErr}=await sb.auth.mfa.verify({factorId:mfaGateFactorId,challengeId:ch.id,code});
    if(vErr)throw vErr;
    mfaGateFactorId=null;
    mfaMarkTrusted();
    await inscriptionsGrantAccess();
  }catch(e){
    err.textContent='Code invalide ou expiré : '+e.message;err.style.display='block';
  }
}
async function mfaGateCancel(){
  if(mfaGateFactorId){try{await sb.auth.mfa.unenroll({factorId:mfaGateFactorId});}catch(e){console.warn('Nettoyage annulation MFA gate échoué :',e.message);}}
  mfaGateFactorId=null;
  try{await sb.auth.signOut();}catch(e){}
  JUSTE_CONNECTE=false;
  showLogin();
}
async function inscriptionsGrantAccess(){
  if(typeof kkLoginAlertCheck==='function')kkLoginAlertCheck(sb);
  document.getElementById('loginView').style.display='none';
  document.getElementById('appView').style.display='block';
  document.getElementById('whoAmI').textContent=(PROF.name||'')+' · Direction';
  await loadAll();
}
async function doLogin(){
  const e=val('liMail'),p=document.getElementById('liPwd').value;
  const{error}=await sb.auth.signInWithPassword({email:e,password:p});
  if(error){document.getElementById('liErr').textContent='Identifiants incorrects';return;}
  JUSTE_CONNECTE=true;
  document.getElementById('liPwd').value='';
  boot().catch(err=>{console.error('[boot]',err);showLogin('Connexion impossible — réessayez.');});
}
async function doLogout(){await sb.auth.signOut();location.reload();}

/* ---------- CHARGEMENT ---------- */
/* creches.addr est lue ici parce que l'en-tête du PDF la porte : la faire
   chercher au moment de l'impression obligerait à une requête de plus pendant
   que la boîte de téléchargement s'ouvre. */
async function loadAll(){
  try{
    const[pr,cr]=await Promise.all([
      sb.from('preinscriptions').select('*').order('created_at',{ascending:false}),
      sb.from('creches').select('id,name,addr').order('name')
    ]);
    if(pr.error)throw pr.error;
    PRE=pr.data||[];CRECHES=cr.data||[];
  }catch(e){
    console.error('[loadAll]',e);
    toast('Chargement impossible — vérifiez votre connexion.',true);
    return;
  }
  const sel=document.getElementById('fCreche');
  sel.innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  render();
  chargerEntrees();
  ouvrirDepuisUrl();
}

/* ---------- ACTUALISATION ----------
   La liste n'était chargée qu'à l'ouverture de la page : une demande arrivée
   depuis le formulaire en ligne (ou saisie par une collègue) n'apparaissait
   qu'après une reconnexion. On recharge donc :
     - quand l'onglet redevient visible ou reprend le focus ;
     - toutes les 60 s tant que la page est visible ;
     - à la demande, avec le bouton « Actualiser ».
   Les rechargements automatiques sont silencieux et se mettent en pause
   quand une fenêtre (fiche, devis…) est ouverte, pour ne jamais perturber une
   saisie en cours. */
let ACTU_EN_COURS=false,ACTU_DERNIERE=0;
async function actualiser(auto){
  if(ACTU_EN_COURS)return;
  if(document.getElementById('appView').style.display!=='block')return;
  if(auto){
    if(document.hidden||document.querySelector('.ov.on'))return;
    if(Date.now()-ACTU_DERNIERE<15000)return;
  }
  ACTU_EN_COURS=true;
  const ic=document.querySelector('#btnActualiser i');
  if(!auto&&ic)ic.classList.add('tourne');
  try{
    const{data,error}=await sb.from('preinscriptions').select('*').order('created_at',{ascending:false});
    if(error)throw error;
    const connus=new Set(PRE.map(p=>String(p.id)));
    const nouvelles=(data||[]).filter(p=>!connus.has(String(p.id))).length;
    PRE=data||[];
    ACTU_DERNIERE=Date.now();
    render();
    chargerEntrees();
    if(nouvelles)toast(nouvelles+' nouvelle'+(nouvelles>1?'s':'')+' demande'+(nouvelles>1?'s':'')+' 🔔');
    else if(!auto)toast('Liste à jour ✅');
  }catch(e){
    console.warn('[actualiser]',e);
    if(!auto)toast('Actualisation impossible — vérifiez votre connexion.',true);
  }finally{
    ACTU_EN_COURS=false;
    if(ic)ic.classList.remove('tourne');
  }
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)actualiser(true);});
window.addEventListener('focus',()=>actualiser(true));
setInterval(()=>actualiser(true),60000);

/* Arrivée depuis une alerte du tableau de bord (« devis en attente », dossier
   à relancer…) : ?open=<preinscriptionId> ouvre directement la bonne fiche
   plutôt que de laisser deviner laquelle dans la liste. Paramètre retiré de
   l'URL ensuite pour ne pas rouvrir la fiche à chaque rafraîchissement. */
function ouvrirDepuisUrl(){
  const qs=new URLSearchParams(location.search);
  // ?vue=rappels / ?vue=visites : liens du tableau de bord général.
  const vue=qs.get('vue');
  if(vue==='rappels'||vue==='visites'){
    history.replaceState(null,'',location.pathname);
    if(vue==='rappels')toggleRappels();else toggleVisites();
    return;
  }
  const id=qs.get('open');
  if(!id)return;
  history.replaceState(null,'',location.pathname);
  if(PRE.some(p=>String(p.id)===String(id)))openFiche(id);
}

function nomCreche(id){const c=CRECHES.find(x=>String(x.id)===String(id));return c?c.name:'';}
function adrCreche(id){const c=CRECHES.find(x=>String(x.id)===String(id));return (c&&c.addr)||'';}

/* ---------- AFFICHAGE ---------- */
function render(){
  const q=val('fSearch').toLowerCase();
  const cre=val('fCreche');

  // Les compteurs portent sur l'ensemble, indépendamment des filtres en cours :
  // sinon cliquer un statut ferait tomber tous les autres à zéro.
  renderDash();
  const box=document.getElementById('stats');
  /* Ce que dit chaque compteur, en clair : un chiffre seul ne dit ni de quel
     statut il parle, ni sur quelles crèches il porte. */
  const AIDE_STATUT={
    nouvelle:'sans devis envoyé',en_contact:'famille contactée',devis_envoye:'réponse attendue',
    accepte:'contrat à établir',inscrit:'contrat signé, fiche créée',refuse:'refusée par la famille',
    sans_suite:'clôturées, plus de suite'};
  const dansCreche=p=>crecheDe(p)===cre||toArr(p.creches_souhaitees).map(String).indexOf(cre)>=0;
  const sousLigne=n=>cre?'<div class="s">dont '+n+' ici</div>':'';
  const nomCre=cre?(nomCreche(cre)||'cette crèche'):'';
  document.getElementById('statsCap').innerHTML='<b>Nombre de demandes par statut, toutes crèches confondues.</b> '
    +'Cliquez sur un statut pour filtrer la liste. La tuile en pointillés « Entrées à venir » compte des enfants déjà inscrits, pas des préinscriptions.'
    +(cre?' <span style="color:var(--orange);font-weight:700">« dont N ici » = '+esc(nomCre)+', la crèche choisie dans le filtre.</span>':'');
  box.innerHTML=
    '<div class="stat'+(filtreStatut==='__tous__'?' on':'')+'" onclick="setStatut(\'__tous__\')" title="Toutes les demandes, tous statuts et toutes crèches">'
    +'<div class="n">'+PRE.length+'</div><div class="l">Toutes les demandes</div>'
    +'<div class="d">tous statuts</div>'+sousLigne(cre?PRE.filter(dansCreche).length:0)+'</div>'
    +ORDRE_STATUTS.map(s=>{
      const n=PRE.filter(p=>p.statut===s).length;
      if(!n&&s!=='nouvelle'&&filtreStatut!==s)return '';
      return '<div class="stat'+(filtreStatut===s?' on':'')+'" onclick="setStatut(\''+s+'\')" title="'+esc(STATUTS[s].l+' — '+AIDE_STATUT[s]+' (toutes crèches)')+'">'
        +'<div class="n">'+n+'</div><div class="l">'+esc(STATUTS[s].l)+'</div>'
        +'<div class="d">'+esc(AIDE_STATUT[s]||'')+'</div>'
        +sousLigne(cre?PRE.filter(p=>p.statut===s&&dansCreche(p)).length:0)+'</div>';
    }).join('')+tuileEntrees(cre);

  /* Ces trois boutons filtrent la liste, qui suit la crèche choisie : leurs
     chiffres comptent donc la même chose — ce que la liste montrera au clic.
     Compter toutes les crèches ici affichait « (1) » devant une liste vide. */
  const portee=cre?nomCre:'toutes les crèches';
  const dansPortee=p=>!cre||dansCreche(p);
  const nR=PRE.filter(p=>dansPortee(p)&&estARelancer(p)).length;
  document.getElementById('nRappels').textContent=nR?'('+nR+')':'';
  document.getElementById('btnRappels').className='btn btn-sm '+(filtreRappels?'btn-p':'btn-s');
  document.getElementById('btnRappels').title='Demandes ouvertes dont la date de rappel est atteinte ou dépassée : la famille est à rappeler — '+portee;
  const nA=PRE.filter(p=>dansPortee(p)&&aRelanceAvenir(p)).length;
  document.getElementById('nRelancesAVenir').textContent=nA?'('+nA+')':'';
  document.getElementById('btnRelancesAVenir').className='btn btn-sm '+(filtreRelancesAVenir?'btn-p':'btn-s');
  document.getElementById('btnRelancesAVenir').title='Demandes ouvertes avec un rappel programmé à une date future — '+portee;
  const nV=PRE.filter(p=>dansPortee(p)&&aVisitePrevue(p)).length;
  document.getElementById('nVisites').textContent=nV?'('+nV+')':'';
  document.getElementById('btnVisites').className='btn btn-sm '+(filtreVisites?'btn-p':'btn-s');
  document.getElementById('btnVisites').title='Demandes ouvertes avec une visite planifiée, pas encore effectuée — '+portee;

  let l=PRE.slice();
  /* Une demande basculée sort de la file active : le dossier est traité, et le
     laisser là remplirait la liste de dossiers clos au fil de l'année. Elle
     reste entière — devis, dates, origine — et se retrouve en cliquant sur le
     compteur « Inscrit ». */
  if(!filtreStatut){if(!filtreRappels&&!filtreRelancesAVenir&&!filtreVisites&&!filtreVisitesFaites)l=l.filter(p=>p.statut!=='inscrit');}
  else if(filtreStatut==='__perdus__')l=l.filter(p=>p.statut==='refuse'||p.statut==='sans_suite');
  else if(filtreStatut==='__encours__')l=l.filter(p=>STATUTS_EN_COURS.indexOf(p.statut)>=0);
  else if(filtreStatut!=='__tous__')l=l.filter(p=>p.statut===filtreStatut);
  /* Clic sur un chiffre du tableau « Par crèche » : le tableau rattache chaque
     dossier à une seule crèche (crecheDe), la liste doit donc faire pareil pour
     montrer exactement autant de lignes que le chiffre cliqué. */
  if(cre&&crecheStrict===cre)l=l.filter(p=>crecheDe(p)===cre);
  else if(cre)l=l.filter(p=>String(p.creche_id)===cre||toArr(p.creches_souhaitees).map(String).indexOf(cre)>=0);
  /* Le filtre doit montrer exactement ce que compte la tuile « relances en
     retard » (estARelancer) : lister aussi les relances à venir donnait une
     liste non vide sous un compteur à 0, ce qui semblait contradictoire. Les
     relances à venir ont leur propre bouton, avec le même principe. */
  if(filtreRappels){
    l=l.filter(estARelancer);
    l.sort((a,b)=>String(a.date_rappel).localeCompare(String(b.date_rappel)));
  }
  if(filtreRelancesAVenir){
    l=l.filter(aRelanceAvenir);
    l.sort((a,b)=>String(a.date_rappel).localeCompare(String(b.date_rappel)));
  }
  if(filtreVisites){
    l=l.filter(aVisitePrevue);
    l.sort((a,b)=>(String(a.date_visite)+(a.heure_visite||'')).localeCompare(String(b.date_visite)+(b.heure_visite||'')));
  }
  if(filtreVisitesFaites){
    l=l.filter(aVisiteFaite);
    l.sort((a,b)=>(String(b.date_visite)+(b.heure_visite||'')).localeCompare(String(a.date_visite)+(a.heure_visite||'')));
  }
  if(q)l=l.filter(p=>correspondRech(q,(p.prenom||'')+' '+(p.nom||'')+' '+(p.ville||'')+' '+(p.notes_internes||'')+' '+(PARENTS_PRE[p.id]||'')));
  const blocEnfants=q?blocEnfantsRecherche(q,cre):'';

  /* Par date d'ajout (l'ordre déjà chargé, le plus récent en tête) ou par
     date de début souhaitée — la plus proche en tête, les demandes sans date
     renseignée reléguées en bas plutôt qu'éparpillées par un tri « vide en
     premier ». */
  if(val('fTri')==='debut'&&!filtreRappels&&!filtreRelancesAVenir&&!filtreVisites&&!filtreVisitesFaites){
    l.sort((a,b)=>{
      const da=a.date_entree_souhaitee||'9999',db=b.date_entree_souhaitee||'9999';
      return da<db?-1:da>db?1:0;
    });
  }

  const el=document.getElementById('list');
  if(!l.length){
    el.innerHTML='<div class="empty"><i class="ti ti-inbox"></i><p>'
      +(PRE.length?'Aucune demande ne correspond à ces filtres.':'Aucune demande enregistrée pour le moment.')+'</p></div>'+blocEnfants;
    return;
  }
  el.innerHTML=l.map(p=>{
    const st=STATUTS[p.statut]||STATUTS.nouvelle;
    const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom';
    const cr=nomCreche(p.creche_id)||toArr(p.creches_souhaitees).map(nomCreche).filter(Boolean).join(' · ')||'crèche à définir';
    const jrs=toArr(p.jours).map(j=>(JOURS.find(x=>x[0]===Number(j))||[0,''])[1].slice(0,3)).filter(Boolean).join(' ');
    const naiss=p.dob?(p.ne_ou_a_naitre==='a_naitre'?'terme le '+dfr(p.dob):'né(e) le '+dfr(p.dob)):'naissance non renseignée';
    const rel=estARelancer(p)
      ? '<span class="tag" style="background:var(--amber-l);color:var(--amber)"><i class="ti ti-bell"></i> à relancer'+(String(p.date_rappel).slice(0,10)<auj()?' (depuis le '+dfr(p.date_rappel)+')':' aujourd\'hui')+'</span>'
      : aRelancePrevue(p)
      ? '<span class="tag" style="background:var(--violet-l);color:var(--violet)"><i class="ti ti-bell"></i> relance le '+dfr(p.date_rappel)+'</span>' : '';
    const vis=p.date_visite
      ? (p.visite_effectuee
        ? '<span class="tag" style="background:var(--green-l);color:var(--green)"><i class="ti ti-door-enter"></i> visite faite le '+dfr(p.date_visite)+'</span>'
        : '<span class="tag" style="background:'+(String(p.date_visite)<auj()?'var(--red-l);color:var(--red)':'var(--orange-l);color:var(--orange)')+'"><i class="ti ti-door-enter"></i> visite '+dfr(p.date_visite)+(p.heure_visite?' à '+esc(p.heure_visite):'')+'</span>')
      : '';
    const mot=(p.statut==='refuse'||p.statut==='sans_suite')&&p.motif_refus
      ? '<span class="tag" style="background:var(--red-l);color:var(--red)">'+esc(MOTIFS_REFUS[p.motif_refus]||p.motif_refus)+'</span>'
      : p.statut==='refuse'
      ? '<span class="tag" style="background:var(--amber-l);color:var(--amber)"><i class="ti ti-alert-triangle"></i> motif à préciser</span>' : '';
    return '<div class="card" onclick="openFiche(\''+p.id+'\')">'
      +'<div class="av"><i class="ti ti-mood-kid"></i></div><div class="bd">'
      +'<div class="nm">'+esc(nom)+'</div>'
      +'<div class="sub">'+esc(naiss)+' · '+esc(cr)+(jrs?' · '+esc(jrs):'')
      +(p.date_entree_souhaitee?'<br>Entrée souhaitée le '+dfr(p.date_entree_souhaitee):'')+'</div>'
      +'<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'
      +'<span class="tag" style="background:'+st.bg+';color:'+st.fg+'">'+esc(st.l)+'</span>'+rel+vis+mot+'</div>'
      +'</div></div>';
  }).join('')+blocEnfants;
}

/* Les fiches enfants qui correspondent à la recherche : un enfant importé ou
   déjà accueilli n'a pas de demande, il serait sinon introuvable ici. */
function blocEnfantsRecherche(q,cre){
  const L=ENFANTS_REC.filter(x=>(!cre||String(x.e.creche_id)===String(cre))
    &&correspondRech(q,(x.e.prenom||'')+' '+(x.e.nom||'')+' '+x.parents));
  if(!L.length)return '';
  return '<div class="statscap" style="margin-top:16px"><b>Fiches enfants correspondantes ('+L.length+')</b> — déjà inscrits, '
    +'sans demande dans cette liste. Cliquez pour ouvrir leur dossier contrat.</div>'
    +L.slice(0,30).map(x=>{
      const e=x.e;
      const nom=((e.prenom||'')+' '+(e.nom||'')).trim()||'Sans nom';
      const naiss=e.dob?'né(e) le '+dfr(e.dob):'naissance non renseignée';
      return '<div class="card" onclick="location.href=\'contrats.html?enfant='+esc(e.id)+'\'">'
        +'<div class="av"><i class="ti ti-user-check"></i></div><div class="bd">'
        +'<div class="nm">'+esc(nom)+'</div>'
        +'<div class="sub">'+esc(naiss)+' · '+esc(nomCreche(e.creche_id)||'crèche non précisée')+'</div>'
        +'<div style="margin-top:6px"><span class="tag" style="background:var(--green-l);color:var(--green)">Fiche enfant · '+esc(x.accueil)+'</span></div>'
        +'</div></div>';
    }).join('')+(L.length>30?'<p class="hint">… et '+(L.length-30)+' autres : affinez la recherche.</p>':'');
}

/* Une demande est à relancer si sa date de rappel est passée ou tombe
   aujourd'hui, et que le dossier n'est pas clos. Relancer un dossier refusé
   n'aurait aucun sens et polluerait le compteur. */
function estARelancer(p){
  if(!p.date_rappel)return false;
  if(['inscrit','refuse','sans_suite'].indexOf(p.statut)>=0)return false;
  return String(p.date_rappel).slice(0,10)<=auj();
}
/* Relance programmée (passée ou à venir) sur un dossier encore ouvert. */
function aRelancePrevue(p){
  return !!p.date_rappel&&STATUTS_CLOS.indexOf(p.statut)<0;
}
/* Relance programmée pour une date future (pas encore en retard) sur un
   dossier ouvert — le pendant complémentaire d'estARelancer, pour le
   bouton « Relances à venir ». */
function aRelanceAvenir(p){
  return !!p.date_rappel&&STATUTS_CLOS.indexOf(p.statut)<0&&String(p.date_rappel).slice(0,10)>auj();
}
/* Visite fixée, pas encore faite, dossier ouvert. Une visite dont la date est
   passée sans être cochée « effectuée » reste listée (en rouge) : soit elle a
   eu lieu et il faut la cocher, soit la famille n'est pas venue. */
function aVisitePrevue(p){
  return !!p.date_visite&&!p.visite_effectuee&&STATUTS_CLOS.indexOf(p.statut)<0;
}
/* Visite réalisée : date fixée et cochée « effectuée », quel que soit le statut du dossier. */
function aVisiteFaite(p){
  return !!p.date_visite&&!!p.visite_effectuee;
}
function setStatut(s){filtreStatut=(filtreStatut===s?'':s);crecheStrict=null;filtreRappels=filtreRelancesAVenir=filtreVisites=filtreVisitesFaites=false;render();}
function toggleRappels(){crecheStrict=null;filtreRappels=!filtreRappels;filtreRelancesAVenir=filtreVisites=filtreVisitesFaites=false;if(filtreRappels)filtreStatut='';render();}
function toggleRelancesAVenir(){crecheStrict=null;filtreRelancesAVenir=!filtreRelancesAVenir;filtreRappels=filtreVisites=filtreVisitesFaites=false;if(filtreRelancesAVenir)filtreStatut='';render();}
function toggleVisites(){crecheStrict=null;filtreVisites=!filtreVisites;filtreRappels=filtreRelancesAVenir=filtreVisitesFaites=false;if(filtreVisites)filtreStatut='';render();}
function toggleVisitesFaites(){crecheStrict=null;filtreVisitesFaites=!filtreVisitesFaites;filtreRappels=filtreRelancesAVenir=filtreVisites=false;if(filtreVisitesFaites)filtreStatut='';render();}
function filtrerCreche(id){
  crecheStrict=null;
  const sel=document.getElementById('fCreche');
  sel.value=(sel.value===String(id)?'':String(id));
  render();
}

/* ---------- TABLEAU DE BORD ---------- */
/* Crèche de rattachement d'un dossier pour les compteurs : la crèche retenue,
   sinon la première souhaitée — un dossier ne compte qu'une fois. */
function crecheDe(p){
  return p.creche_id?String(p.creche_id):(toArr(p.creches_souhaitees).map(String)[0]||'');
}
/* Clic sur un chiffre du tableau « Par crèche » : sélectionne la crèche et applique
   le filtre de la colonne. Un second clic sur le même chiffre retire le filtre. */
function clicCellule(id,col){
  const sel=document.getElementById('fCreche');
  const actif=sel.value===String(id)&&crecheStrict===String(id)&&(
    col==='encours'?filtreStatut==='__encours__':col==='relances'?filtreRappels:col==='prevues'?filtreVisites:
    col==='faites'?filtreVisitesFaites:col==='inscrits'?filtreStatut==='inscrit':filtreStatut==='__perdus__');
  filtreStatut='';filtreRappels=filtreRelancesAVenir=filtreVisites=filtreVisitesFaites=false;crecheStrict=null;
  if(!actif){
    sel.value=String(id);crecheStrict=String(id);
    if(col==='encours')filtreStatut='__encours__';
    else if(col==='relances')filtreRappels=true;
    else if(col==='prevues')filtreVisites=true;
    else if(col==='faites')filtreVisitesFaites=true;
    else if(col==='inscrits')filtreStatut='inscrit';
    else filtreStatut='__perdus__';
  }
  render();
}
function renderDash(){
  const el=document.getElementById('dash');
  const cre=val('fCreche');
  const L=cre?PRE.filter(p=>crecheDe(p)===cre||toArr(p.creches_souhaitees).map(String).indexOf(cre)>=0):PRE;
  const enCours=L.filter(p=>STATUTS_EN_COURS.indexOf(p.statut)>=0);
  const nRel=L.filter(estARelancer).length;
  const nVis=L.filter(aVisitePrevue).length;
  const nVisF=L.filter(aVisiteFaite).length;
  const nIns=L.filter(p=>p.statut==='inscrit').length;
  const refus=L.filter(p=>p.statut==='refuse'||p.statut==='sans_suite');
  const clos=nIns+refus.length;
  const taux=clos?Math.round(nIns*100/clos):null;

  const kpi=(n,l,bg,fg,on,click)=>'<div class="kpi'+(on?' on':'')+'" style="background:'+bg+';color:'+fg+'" onclick="'+click+'">'
    +'<div class="n">'+n+'</div><div class="l">'+l+'</div></div>';
  let h='<div class="dash"><h2><i class="ti ti-layout-dashboard"></i> Tableau de bord'
    +(cre?' — '+esc(nomCreche(cre)):'')+'<span class="sub2">'+(cre?'cliquez à nouveau sur la crèche pour tout voir':'cliquez sur une crèche pour filtrer')+'</span></h2>'
    +'<div class="kpis">'
    +kpi(enCours.length,'devis en cours','var(--orange-l)','var(--orange)',filtreStatut==='__encours__',"setStatut('__encours__')")
    +kpi(nRel,'relance'+(nRel>1?'s':'')+' en retard','var(--amber-l)','var(--amber)',filtreRappels,'toggleRappels()')
    +kpi(nVis,'visite'+(nVis>1?'s':'')+' prévue'+(nVis>1?'s':''),'var(--violet-l)','var(--violet)',filtreVisites,'toggleVisites()')
    +kpi(nVisF,'visite'+(nVisF>1?'s':'')+' réalisée'+(nVisF>1?'s':''),'var(--green-l)','var(--green)',filtreVisitesFaites,'toggleVisitesFaites()')
    +kpi(nIns,'inscrit'+(nIns>1?'s':'')+' (devis signés)','var(--green-l)','var(--green)',filtreStatut==='inscrit',"setStatut('inscrit')")
    +kpi(refus.length,'refus / sans suite','var(--red-l)','var(--red)',filtreStatut==='__perdus__',"setStatut('__perdus__')")
    +(taux!=null?kpi(taux+' %','taux de transformation','#F1EFF7','#4a4560',false,''):'')
    +'</div><div class="dgrid"><div>';

  // Par crèche
  const ids=CRECHES.map(c=>String(c.id));
  if(PRE.some(p=>!crecheDe(p)))ids.push('');
  const cell=(n,bg,fg,id,col)=>n?'<span class="pill"'+(id?' style="cursor:pointer;background:'+bg+';color:'+fg+'" onclick="event.stopPropagation();clicCellule(\''+id+'\',\''+col+'\')" title="Voir ces dossiers"':' style="background:'+bg+';color:'+fg+'"')+'>'+n+'</span>':'<span class="z">0</span>';
  h+='<div class="dsec">Par crèche</div><table class="dtab"><tr><th>Crèche</th><th>Devis en cours</th><th>Relances en retard</th><th>Visites prévues</th><th>Visites réalisées</th><th>Inscrits</th><th>Refus</th></tr>'
    +ids.map(id=>{
      const l=PRE.filter(p=>crecheDe(p)===id);
      const a=l.filter(p=>STATUTS_EN_COURS.indexOf(p.statut)>=0).length,
            b=l.filter(estARelancer).length,c=l.filter(aVisitePrevue).length,vf=l.filter(aVisiteFaite).length,
            d=l.filter(p=>p.statut==='inscrit').length,
            e=l.filter(p=>p.statut==='refuse'||p.statut==='sans_suite').length;
      if(!id&&!(a+b+c+vf+d+e))return '';
      return '<tr class="'+(id?'cl':'')+(id&&cre===id?' on':'')+'"'+(id?' onclick="filtrerCreche(\''+id+'\')"':'')+'>'
        +'<td>'+(id?esc(nomCreche(id)):'<i style="color:var(--muted)">Crèche à définir</i>')+'</td>'
        +'<td>'+cell(a,'var(--orange-l)','var(--orange)',id,'encours')+'</td><td>'+cell(b,'var(--amber-l)','var(--amber)',id,'relances')+'</td>'
        +'<td>'+cell(c,'var(--violet-l)','var(--violet)',id,'prevues')+'</td><td>'+cell(vf,'var(--green-l)','var(--green)',id,'faites')+'</td><td>'+cell(d,'var(--green-l)','var(--green)',id,'inscrits')+'</td>'
        +'<td>'+cell(e,'var(--red-l)','var(--red)',id,'refus')+'</td></tr>';
    }).join('')+'</table>';

  // Agenda : prochaines visites et relances
  const ag=[];
  L.filter(aVisitePrevue).forEach(p=>ag.push({d:String(p.date_visite).slice(0,10),h:p.heure_visite||'',t:'Visite',p:p}));
  L.filter(aRelancePrevue).forEach(p=>ag.push({d:String(p.date_rappel).slice(0,10),h:'',t:'Relance',p:p}));
  ag.sort((a,b)=>(a.d+a.h).localeCompare(b.d+b.h));
  h+='<div class="dsec" style="margin-top:14px">À venir — visites et relances</div><div class="agenda">'
    +(ag.length?ag.slice(0,8).map(x=>{
      const late=x.d<auj();
      return '<div onclick="openFiche(\''+x.p.id+'\')"><b style="'+(late?'color:var(--red)':'')+'">'+(x.d===auj()?'Aujourd\'hui':dfr(x.d))+(x.h?' '+esc(x.h):'')+'</b>'
        +'<span><i class="ti '+(x.t==='Visite'?'ti-door-enter':'ti-bell')+'"></i> '+x.t+' — '+esc(((x.p.prenom||'')+' '+(x.p.nom||'')).trim())
        +'<span style="color:var(--muted)"> · '+esc(nomCreche(crecheDe(x.p))||'')+'</span></span></div>';
    }).join('')+(ag.length>8?'<div style="color:var(--muted);cursor:default">… et '+(ag.length-8)+' autre(s)</div>':'')
    :'<div style="color:var(--muted);cursor:default">Rien de programmé.</div>')+'</div>';

  // Motifs de refus
  h+='</div><div><div class="dsec">Motifs des refus</div>';
  if(!refus.length)h+='<div style="font-size:12.5px;color:var(--muted)">Aucun refus enregistré.</div>';
  else{
    const cpt={};refus.forEach(p=>{const k=p.motif_refus||'_';cpt[k]=(cpt[k]||0)+1;});
    const max=Math.max.apply(null,Object.values(cpt));
    h+=Object.keys(cpt).sort((a,b)=>cpt[b]-cpt[a]).map(k=>
      '<div class="bar2"><div class="t"><span>'+esc(k==='_'?'Motif non renseigné':MOTIFS_REFUS[k]||k)+'</span><span>'+cpt[k]+' · '+Math.round(cpt[k]*100/refus.length)+' %</span></div>'
      +'<div class="g"><i style="width:'+Math.round(cpt[k]*100/max)+'%'+(k==='_'?';background:#D4D0E4':'')+'"></i></div></div>').join('');
  }
  h+='</div></div></div>';
  el.innerHTML=h;
}
function syncMotif(){
  const s=val('fStatut');
  document.getElementById('wrapMotif').style.display=(s==='refuse'||s==='sans_suite')?'':'none';
}

/* ---------- FICHE ---------- */
function syncNe(){
  const aNaitre=val('fNe')==='a_naitre';
  document.getElementById('lbDob').textContent=aNaitre?'Terme prévu':'Date de naissance';
}
function syncPai(){document.getElementById('wrapPai').style.display=chk('fPai')?'':'none';}

function openFiche(id){
  ficheId=id;
  const p=id?PRE.find(x=>String(x.id)===String(id)):null;

  document.getElementById('ficheTitle').textContent=p
    ? (((p.prenom||'')+' '+(p.nom||'')).trim()||'Demande')
    : 'Nouvelle demande';
  document.getElementById('btnDel').style.display=(p?'':'none');

  document.getElementById('fStatut').innerHTML=ORDRE_STATUTS
    .map(s=>'<option value="'+s+'">'+esc(STATUTS[s].l)+'</option>').join('');

  const opts='<option value="">— à définir —</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  document.getElementById('fCrecheRetenue').innerHTML=opts;

  const souhaitees=p?toArr(p.creches_souhaitees).map(String):[];
  document.getElementById('fCrechesBox').innerHTML=CRECHES.map(c=>
    '<label><input type="checkbox" class="ckCreche" value="'+c.id+'"'
    +(souhaitees.indexOf(String(c.id))>=0?' checked':'')+'><span>'+esc(c.name)+'</span></label>').join('');

  const jrs=p?toArr(p.jours).map(Number):[1,2,3,4,5];
  document.getElementById('fJoursBox').innerHTML=JOURS.map(j=>
    '<label><input type="checkbox" class="ckJour" value="'+j[0]+'"'
    +(jrs.indexOf(j[0])>=0?' checked':'')+'><span>'+j[1]+'</span></label>').join('');
  document.querySelectorAll('.ckJour').forEach(c=>c.addEventListener('change',syncHeures));

  setVal('fPrenom',p?p.prenom:'');setVal('fNom',p?p.nom:'');
  setVal('fSexe',p?(p.sexe||''):'');setVal('fNe',p?p.ne_ou_a_naitre:'ne');
  setVal('fDob',p?(p.dob||''):'');
  setVal('fAllergies',p?p.allergies:'');setVal('fRegime',p?(p.regime_repas||''):'');
  setChk('fPai',p&&p.pai);setVal('fPaiDetail',p?p.pai_detail:'');
  setChk('fFratrie',p&&p.fratrie_reseau);setVal('fMedecin',p?p.medecin:'');
  setVal('fAdresse',p?p.adresse:'');setVal('fCp',p?p.code_postal:'');setVal('fVille',p?p.ville:'');
  setVal('fAlloc',p?p.num_allocataire:'');
  setVal('fRevenus',p&&p.revenus_foyer!=null?p.revenus_foyer:'');
  setChk('fSepares',p&&p.parents_separes);setChk('fAlternee',p&&p.garde_alternee);
  setChk('fMajo',p&&p.majoration_paje);
  setVal('fCrecheRetenue',p?(p.creche_id||''):'');
  setVal('fDateEntree',p?(p.date_entree_souhaitee||''):'');
  setVal('fHd',p?p.heure_debut:'07:30');setVal('fHf',p?p.heure_fin:'18:00');
  setVal('fStatut',p?p.statut:'nouvelle');
  setVal('fSource',p?p.source:'');setVal('fRappel',p?(p.date_rappel||''):'');
  setVal('fNotes',p?p.notes_internes:'');
  setVal('fVisite',p?(p.date_visite||''):'');setVal('fVisiteH',p?(p.heure_visite||''):'');
  setChk('fVisiteFaite',p&&p.visite_effectuee);
  document.getElementById('fMotif').innerHTML='<option value="">— choisir —</option>'
    +Object.keys(MOTIFS_REFUS).map(k=>'<option value="'+k+'">'+esc(MOTIFS_REFUS[k])+'</option>').join('');
  setVal('fMotif',p?(p.motif_refus||''):'');
  syncMotif();

  syncNe();syncPai();syncHeures();
  document.getElementById('fHd').onchange=syncHeures;
  document.getElementById('fHf').onchange=syncHeures;

  // Les parents ne peuvent être rattachés qu'à une demande déjà enregistrée :
  // sans identifiant, il n'y a rien à quoi les rattacher.
  const neuf=!p;
  document.getElementById('btnAddPar').style.display=neuf?'none':'';
  document.getElementById('hintPar').textContent=neuf
    ? 'Enregistrez d\'abord la demande, puis ajoutez les parents.' : '';
  PARENTS=[];renderParents();
  document.getElementById('btnAddDev').style.display=neuf?'none':'';
  document.getElementById('hintDev').textContent=neuf
    ? 'Enregistrez d\'abord la demande, puis établissez le devis.'
    : 'Un devis fige les montants qu\'il facture : modifier la grille ensuite ne le réécrit pas.';
  DEVIS=[];CONTRATS_PRE=[];renderDevisList();
  document.getElementById('btnBascule').style.display='none';
  document.getElementById('btnContrat').style.display='none';
  // Les contrats sont relus en même temps que les devis : c'est leur état qui
  // décide désormais si la bascule est ouverte.
  if(p){loadParents(p.id);loadDevis(p.id);loadContrats(p.id);}

  openOv('ovFiche');
}

/* Volume hebdomadaire : ce que le devis facturera. Affiché dès la saisie pour
   qu'une erreur d'horaire se voie tout de suite, et non à l'établissement du
   devis. */
function heuresHebdo(){
  const hd=val('fHd'),hf=val('fHf');
  const n=document.querySelectorAll('.ckJour:checked').length;
  const m=t=>{const r=/^(\d{1,2}):(\d{2})/.exec(t||'');return r?(+r[1])*60+(+r[2]):null;};
  const a=m(hd),b=m(hf);
  if(a==null||b==null||b<=a||!n)return null;
  return Math.round((b-a)/60*n*100)/100;
}
function syncHeures(){
  const h=heuresHebdo();
  const n=document.querySelectorAll('.ckJour:checked').length;
  document.getElementById('hintHeures').textContent=h==null
    ? 'Renseignez les jours et les horaires pour connaître le volume hebdomadaire.'
    : h+' h par semaine sur '+n+' jour'+(n>1?'s':'')+'.';
}

async function saveFiche(){
  const prenom=val('fPrenom'),nom=val('fNom');
  if(!prenom&&!nom){toast('Indiquez au moins un prénom ou un nom.',true);return;}

  const statut=val('fStatut');
  const p=ficheId?PRE.find(x=>String(x.id)===String(ficheId)):null;
  // La contrainte preinscriptions_bascule_ck refuse « inscrit » sans enfant_id.
  // Mieux vaut l'expliquer ici que laisser remonter une erreur Postgres.
  if(statut==='inscrit'&&!(p&&p.enfant_id)){
    toast('Le statut « Inscrit » se pose automatiquement lors de la bascule en fiche enfant.',true);
    return;
  }
  const clos=statut==='refuse'||statut==='sans_suite';
  if(statut==='refuse'&&!val('fMotif')){
    toast('Indiquez le motif du refus.',true);
    document.getElementById('fMotif').focus();
    return;
  }

  const row={
    statut:statut,
    source:val('fSource'),
    date_rappel:val('fRappel')||null,
    date_visite:val('fVisite')||null,
    heure_visite:val('fVisite')?(val('fVisiteH')||null):null,
    visite_effectuee:!!val('fVisite')&&chk('fVisiteFaite'),
    motif_refus:clos?(val('fMotif')||null):null,
    notes_internes:val('fNotes'),
    prenom:prenom,nom:nom,
    sexe:val('fSexe')||null,
    ne_ou_a_naitre:val('fNe')||'ne',
    dob:val('fDob')||null,
    allergies:val('fAllergies'),
    regime_repas:val('fRegime')||null,
    pai:chk('fPai'),
    pai_detail:chk('fPai')?val('fPaiDetail'):'',
    medecin:val('fMedecin'),
    fratrie_reseau:chk('fFratrie'),
    adresse:val('fAdresse'),code_postal:val('fCp'),ville:val('fVille'),
    num_allocataire:val('fAlloc'),
    parents_separes:chk('fSepares'),garde_alternee:chk('fAlternee'),
    revenus_foyer:val('fRevenus')?Number(val('fRevenus')):null,
    majoration_paje:chk('fMajo'),
    creches_souhaitees:[...document.querySelectorAll('.ckCreche:checked')].map(c=>c.value),
    creche_id:val('fCrecheRetenue')||null,
    date_entree_souhaitee:val('fDateEntree')||null,
    jours:[...document.querySelectorAll('.ckJour:checked')].map(c=>Number(c.value)),
    heure_debut:val('fHd'),heure_fin:val('fHf')
  };

  // Une visite est « planifiée » quand sa date apparaît ou change — pas quand
  // on coche juste « Visite effectuée » après coup, qui ne doit rien envoyer.
  const visitePlanifiee=!!row.date_visite
    &&(!p||p.date_visite!==row.date_visite||p.heure_visite!==row.heure_visite);

  const btn=document.getElementById('btnSave');
  btn.disabled=true;
  try{
    if(ficheId){
      const{error}=await sb.from('preinscriptions').update(row).eq('id',ficheId);
      if(error)throw error;
      const i=PRE.findIndex(x=>String(x.id)===String(ficheId));
      if(i>=0)PRE[i]=Object.assign({},PRE[i],row);
      toast('Demande enregistrée ✅');
      closeOv('ovFiche');
    }else{
      row.created_by=ME?ME.id:null;
      const{data,error}=await sb.from('preinscriptions').insert(row).select().single();
      if(error)throw error;
      PRE.unshift(data);
      ficheId=data.id;
      // On garde la fiche ouverte : les parents restent à saisir, et refermer
      // ici obligerait à la rouvrir dans la foulée.
      document.getElementById('btnDel').style.display='';
      document.getElementById('btnAddPar').style.display='';
      document.getElementById('hintPar').textContent='';
      document.getElementById('btnAddDev').style.display='';
      document.getElementById('hintDev').textContent='Un devis fige les montants qu\'il facture : modifier la grille ensuite ne le réécrit pas.';
      toast('Demande créée — vous pouvez ajouter les parents.');
    }
    // La fiche est déjà enregistrée : on propose seulement d'envoyer la
    // confirmation, dont le texte reste modifiable. Rien si la fiche n'a pas
    // encore de parent destinataire (cas fréquent à la création).
    await syncEvenementVisite(ficheId,row);
    if(visitePlanifiee)ouvrirEnvoiVisite(row);
    render();
  }catch(e){
    console.error('[saveFiche]',e);
    toast('Enregistrement impossible : '+(e.message||'erreur inconnue'),true);
  }finally{
    btn.disabled=false;
  }
}

async function delFiche(){
  if(!ficheId)return;
  const p=PRE.find(x=>String(x.id)===String(ficheId));
  const nom=((p&&p.prenom||'')+' '+(p&&p.nom||'')).trim()||'cette demande';
  if(p&&p.enfant_id){
    toast('Cette demande a été basculée en fiche enfant : elle ne peut plus être supprimée.',true);
    return;
  }
  if(!confirm('Supprimer la demande de '+nom+' ? Les parents saisis seront supprimés avec elle.'))return;
  try{
    const{error}=await sb.from('preinscriptions').delete().eq('id',ficheId);
    if(error)throw error;
    PRE=PRE.filter(x=>String(x.id)!==String(ficheId));
    closeOv('ovFiche');render();
    toast('Demande supprimée.');
  }catch(e){
    console.error('[delFiche]',e);
    toast('Suppression impossible.',true);
  }
}

/* ---------- PARENTS ---------- */
async function loadParents(preId){
  try{
    const{data,error}=await sb.from('preinscriptions_parents')
      .select('*').eq('preinscription_id',preId).order('created_at');
    if(error)throw error;
    // La fiche a pu changer pendant la requête : ne rien peindre à côté.
    if(String(ficheId)!==String(preId))return;
    PARENTS=data||[];
  }catch(e){
    console.warn('[loadParents]',e);PARENTS=[];
  }
  renderParents();
}

function renderParents(){
  const box=document.getElementById('parList');
  document.getElementById('parCount').textContent=PARENTS.length?'('+PARENTS.length+')':'';
  if(!PARENTS.length){box.innerHTML='';return;}
  box.innerHTML=PARENTS.map(p=>{
    const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'—';
    const li=(ic,v)=>v?'<div class="li"><i class="ti ti-'+ic+'" style="color:var(--muted)"></i>'+esc(v)+'</div>':'';
    const dest=p.destinataire
      ? '<span class="tag" style="background:var(--violet-l);color:var(--violet)">✉️ destinataire</span>':'';
    const sansMail=!p.email
      ? '<span class="tag" style="background:var(--amber-l);color:var(--amber)">sans e-mail</span>':'';
    return '<div class="par" onclick="openParent(\''+p.id+'\')" style="cursor:pointer">'
      +'<div class="h"><b>'+esc(nom)+'</b>'+dest+sansMail+'</div>'
      +'<div class="li" style="color:var(--muted)">'+esc(LIENS[p.lien]||'Responsable légal')
      +(p.profession?' · '+esc(p.profession):'')+'</div>'
      +li('mail',p.email)+li('phone',p.telephone)+li('briefcase',p.telephone_pro)
      +'</div>';
  }).join('');
}

function openParent(id){
  parentId=id;
  const p=id?PARENTS.find(x=>String(x.id)===String(id)):null;
  document.getElementById('parTitle').textContent=p?'Modifier le parent':'Ajouter un parent';
  document.getElementById('btnDelPar').style.display=p?'':'none';
  setVal('pLien',p?p.lien:'mere');
  setVal('pPrenom',p?p.prenom:'');setVal('pNom',p?p.nom:'');
  setVal('pEmail',p?p.email:'');setVal('pTel',p?p.telephone:'');
  setVal('pTelPro',p?p.telephone_pro:'');setVal('pProf',p?p.profession:'');
  setChk('pDest',p?p.destinataire:true);
  openOv('ovParent');
}

async function saveParent(){
  if(!ficheId){toast('Enregistrez d\'abord la demande.',true);return;}
  const email=val('pEmail');
  if(email&&email.indexOf('@')<0){toast('Adresse e-mail invalide.',true);return;}
  if(!val('pPrenom')&&!val('pNom')){toast('Indiquez au moins un prénom ou un nom.',true);return;}
  const row={
    preinscription_id:ficheId,
    lien:val('pLien')||'mere',
    prenom:val('pPrenom'),nom:val('pNom'),
    email:email,telephone:val('pTel'),telephone_pro:val('pTelPro'),
    profession:val('pProf'),destinataire:chk('pDest')
  };
  try{
    if(parentId){
      const{error}=await sb.from('preinscriptions_parents').update(row).eq('id',parentId);
      if(error)throw error;
      const i=PARENTS.findIndex(x=>String(x.id)===String(parentId));
      if(i>=0)PARENTS[i]=Object.assign({},PARENTS[i],row);
      toast('Parent enregistré ✅');
    }else{
      const{data,error}=await sb.from('preinscriptions_parents').insert(row).select().single();
      if(error)throw error;
      PARENTS.push(data);
      toast('Parent ajouté ✅');
    }
    closeOv('ovParent');renderParents();
  }catch(e){
    console.error('[saveParent]',e);
    toast('Enregistrement impossible : '+(e.message||'erreur inconnue'),true);
  }
}

async function delParent(){
  if(!parentId)return;
  const p=PARENTS.find(x=>String(x.id)===String(parentId));
  if(!confirm('Supprimer '+(((p&&p.prenom||'')+' '+(p&&p.nom||'')).trim()||'ce parent')+' ?'))return;
  try{
    const{error}=await sb.from('preinscriptions_parents').delete().eq('id',parentId);
    if(error)throw error;
    PARENTS=PARENTS.filter(x=>String(x.id)!==String(parentId));
    closeOv('ovParent');renderParents();
    toast('Parent supprimé.');
  }catch(e){
    console.error('[delParent]',e);
    toast('Suppression impossible.',true);
  }
}

/* ---------- DEVIS ---------- */
/* Un devis fige ce qu'il facture. Les lignes recopient libelle et montant
   depuis la grille au moment de l'enregistrement ; modifier la grille ensuite
   ne les touche plus. C'est la raison d'etre de devis_lignes : sans elle, une
   hausse de tarif reecrirait retroactivement des devis deja envoyes. */
let DEVIS=[],devisId=null,DCUR=null,DCALC=null;
/* Remises libres du devis en cours : {libelle,sens:'remise'|'majoration',mode:'eur'|'pct',valeur}. */
let AJUST=[];
/* Les semaines facturées vivent désormais sur la crèche (module Paramètres) :
   le devis les lit au lieu de proposer 47 en dur. semManuel retient que la
   direction a corrigé le nombre à la main, pour qu'un changement de crèche
   n'écrase pas sa saisie. */
let ETABS=[],semManuel=false;
let CMG_BAREME=[],CMG_CFG={taux_max:0.85,ratio_3_6:0.5,plafond_horaire:10};
const CMG_CFG_ID='00000000-0000-0000-0000-000000000002';

const D_STATUTS={
  brouillon:{l:'Brouillon',bg:'#F1EFF7',fg:'#8E8AA8'},
  envoye:   {l:'Envoyé',   bg:'#FFF1E3',fg:'#F47920'},
  accepte:  {l:'Accepté',  bg:'#E6F5EE',fg:'#2E9E6B'},
  refuse:   {l:'Refusé',   bg:'#FDE8E8',fg:'#C62828'},
  expire:   {l:'Expiré',   bg:'#FFF6DC',fg:'#B8860B'},
  annule:   {l:'Annulé',   bg:'#F1EFF7',fg:'#8E8AA8'}
};

async function loadCmg(){
  if(CMG_BAREME.length)return;
  try{
    const[b,c]=await Promise.all([
      sb.from('cmg_bareme').select('*').eq('actif',true).order('ordre'),
      sb.from('cmg_config').select('config').eq('id',CMG_CFG_ID).maybeSingle()
    ]);
    if(b.error)throw b.error;
    CMG_BAREME=b.data||[];
    if(c&&c.data&&c.data.config)CMG_CFG=Object.assign({},CMG_CFG,c.data.config);
  }catch(e){
    // Le devis reste calculable sans barème : seule l'estimation CMG manquera.
    console.warn('[loadCmg]',e);CMG_BAREME=[];
  }
}

/* Table du module Paramètres. Son absence n'est pas bloquante : on retombe
   sur 47, la valeur par défaut de devis.semaines_an.
   La ligne entière est chargée, et non les seules semaines facturées :
   l'en-tête du PDF y lit la raison sociale, le SIRET et l'agrément PMI. */
async function loadEtabs(){
  if(ETABS.length)return;
  try{
    const{data,error}=await sb.from('etablissements').select('*');
    if(error)throw error;
    ETABS=data||[];
  }catch(e){console.warn('[loadEtabs]',e);ETABS=[];}
}
function semainesDe(crecheId){
  const e=ETABS.find(x=>String(x.creche_id)===String(crecheId));
  return e&&e.semaines_facturees!=null?Number(e.semaines_facturees):null;
}
function etabDe(crecheId){
  return ETABS.find(x=>String(x.creche_id)===String(crecheId))||{};
}

async function loadDevis(preId){
  try{
    const{data,error}=await sb.from('devis').select('*')
      .eq('preinscription_id',preId).order('created_at',{ascending:false});
    if(error)throw error;
    if(String(ficheId)!==String(preId))return;
    DEVIS=data||[];
  }catch(e){console.warn('[loadDevis]',e);DEVIS=[];}
  renderDevisList();
}

/* Le devis qui vaut engagement : accepté, et le plus récemment répondu. C'est
   lui qui a servi de base au contrat — jamais la préinscription, dont les
   souhaits initiaux ont pu changer en cours de négociation. */
function devisAccepte(){
  // Le statut suffit : une acceptation peut aussi venir d'un accord écrit remis
  // en main propre et saisi par la direction, sans signature à l'écran ni
  // `repondu_le`. Exiger la signature en ligne fermerait la porte à ces
  // dossiers-là, qui sont pourtant les plus classiques hors saison.
  return DEVIS.filter(d=>d.statut==='accepte')
    .sort((a,b)=>String(b.repondu_le||b.updated_at||b.created_at||'')
      .localeCompare(String(a.repondu_le||a.updated_at||a.created_at||'')))[0]||null;
}

/* ---------- LES CONTRATS D'ACCUEIL ---------- */
/* Le contrat vit dans son propre module (contrats.html) : il s'y établit, s'y
   envoie, s'y signe et s'y contresigne. Cet écran ne fait que deux choses avec
   lui — dire où il en est, et attendre qu'il soit complet pour ouvrir la
   bascule. On ne charge donc que le strict nécessaire. */
let CONTRATS_PRE=[];

async function loadContrats(preId){
  try{
    const{data,error}=await sb.from('contrats').select('*')
      .eq('preinscription_id',preId).order('created_at',{ascending:false});
    if(error)throw error;
    if(String(ficheId)!==String(preId))return;
    CONTRATS_PRE=data||[];
  }catch(e){
    // La table peut ne pas exister sur une base où le script 31 n'est pas
    // passé : le module Inscriptions doit continuer de fonctionner sans elle.
    console.warn('[loadContrats]',e);CONTRATS_PRE=[];
  }
  majBoutonBascule();
}

/* Le contrat qui autorise la bascule : un contrat INITIAL contresigné.
   Contresigné, et pas seulement signé : un contrat signé d'un seul côté
   n'engage qu'un seul côté, et faire entrer un enfant dans les effectifs PMI,
   les présences et les commandes de repas sur cette base reviendrait à
   anticiper un accord qui n'est pas conclu. */
function contratComplet(){
  return CONTRATS_PRE.filter(c=>c.type==='initial'&&c.statut==='contresigne')
    .sort((a,b)=>String(b.contresigne_le||'').localeCompare(String(a.contresigne_le||'')))[0]||null;
}
/* Le contrat en cours, quel que soit son état — pour dire à la direction où en
   est le dossier plutôt que de lui laisser un bouton absent sans explication. */
function contratEnCours(){
  const RANG={contresigne:5,signe:4,envoye:3,brouillon:2,expire:1,refuse:0,annule:0};
  return CONTRATS_PRE.filter(c=>c.type==='initial')
    .sort((a,b)=>(RANG[b.statut]||0)-(RANG[a.statut]||0))[0]||null;
}

function majBoutonBascule(){
  const b=document.getElementById('btnBascule');
  const bc=document.getElementById('btnContrat');
  const p=ficheId?PRE.find(x=>String(x.id)===String(ficheId)):null;
  const dev=devisAccepte();
  const ct=contratEnCours();

  /* Le bouton « Établir le contrat » apparaît dès qu'un devis est accepté, et
     ouvre le module Contrats sur ce dossier. Il n'y a pas de second formulaire
     ici : le contrat ne s'écrit qu'à un seul endroit. */
  if(bc){
    bc.style.display=(p&&!p.enfant_id&&dev)?'':'none';
    bc.innerHTML=ct
      ? '<i class="ti ti-file-certificate"></i> Voir le contrat'
      : '<i class="ti ti-file-plus"></i> Établir le contrat';
  }

  if(!b)return;
  /* La bascule attend le contrat contresigné — plus le devis accepté.
     C'est le changement de fond du module Contrat : la fiche enfant naît du
     document signé des deux parts, pas de la proposition acceptée. */
  b.style.display=(p&&!p.enfant_id&&contratComplet())?'':'none';

  // Dire pourquoi le bouton n'est pas là vaut mieux que de laisser chercher.
  const hint=document.getElementById('hintDev');
  if(hint&&p&&!p.enfant_id){
    if(!dev){
      hint.textContent='Un devis fige les montants qu\'il facture : modifier la grille ensuite ne le réécrit pas.';
    }else if(!ct){
      hint.innerHTML='<b>Devis accepté.</b> Établissez maintenant le contrat d\'accueil : '
        +'la fiche enfant ne se crée qu\'une fois ce contrat signé par la famille et contresigné par la crèche.';
    }else if(ct.statut==='brouillon'){
      hint.innerHTML='Le contrat <b>'+esc(ct.numero||'')+'</b> est à l\'état de brouillon — il reste à l\'envoyer à la famille.';
    }else if(ct.statut==='envoye'){
      hint.innerHTML='Le contrat <b>'+esc(ct.numero||'')+'</b> est chez la famille depuis le '
        +dfr(ct.envoye_le)+(ct.vu_le?', ouvert le '+dfr(ct.vu_le):', pas encore ouvert')+'.';
    }else if(ct.statut==='signe'){
      hint.innerHTML='Le contrat <b>'+esc(ct.numero||'')+'</b> a été signé par la famille le '
        +dfr(ct.repondu_le)+'. <b>Il reste à le contresigner</b>, dans le module Contrats — '
        +'c\'est ce qui ouvrira la création de la fiche enfant.';
    }else if(ct.statut==='contresigne'){
      hint.innerHTML='Contrat <b>'+esc(ct.numero||'')+'</b> complet des deux parts. '
        +'La fiche enfant peut être créée.';
    }else if(ct.statut==='refuse'){
      hint.innerHTML='Le contrat <b>'+esc(ct.numero||'')+'</b> a été refusé par la famille le '
        +dfr(ct.repondu_le)+(ct.motif_refus?' — '+esc(ct.motif_refus):'')+'.';
    }
  }
}

/* Ouvre le module Contrats sur CE dossier. Le paramètre `pre` est lu par
   contrats.html au démarrage, qui ouvre directement la bonne fiche : la
   direction enchaîne sans avoir à retrouver le dossier dans une liste. */
function ouvrirContrat(){
  const p=ficheId?PRE.find(x=>String(x.id)===String(ficheId)):null;
  if(!p){toast('Enregistrez d\'abord la demande.',true);return;}
  location.href='contrats.html?pre='+encodeURIComponent(p.id);
}

function renderDevisList(){
  const box=document.getElementById('devList');
  document.getElementById('devCount').textContent=DEVIS.length?'('+DEVIS.length+')':'';
  majBoutonBascule();
  if(!DEVIS.length){box.innerHTML='';return;}
  box.innerHTML=DEVIS.map(d=>{
    const st=D_STATUTS[d.statut]||D_STATUTS.brouillon;
    const rev=d.revision>1?' · révision '+d.revision:'';
    // Le PDF s'imprime sans ouvrir le devis : c'est le geste le plus fréquent
    // une fois le devis établi. stopPropagation empêche la carte de s'ouvrir
    // derrière la boîte de téléchargement.
    return '<div class="par" onclick="openDevis(\''+d.id+'\')" style="cursor:pointer">'
      +'<div class="h"><b>'+esc(d.numero||'Sans numéro')+'</b>'
      +'<span class="tag" style="background:'+st.bg+';color:'+st.fg+'">'+esc(st.l)+'</span>'
      +((d.statut==='brouillon'||d.statut==='envoye')&&!d.repondu_le
        ? '<button class="pdf" style="color:var(--red)" onclick="event.stopPropagation();repondreDevis(\''+d.id+'\',\'refuse\')" title="Marquer ce devis comme refusé">'
          +'<i class="ti ti-x"></i> Refuser</button>'
          +'<button class="pdf" style="color:var(--green)" onclick="event.stopPropagation();repondreDevis(\''+d.id+'\',\'accepte\')" title="Marquer ce devis comme accepté">'
          +'<i class="ti ti-check"></i> Accepter</button>':'')
      +'<button class="pdf" onclick="event.stopPropagation();pdfDevis(\''+d.id+'\')" title="Télécharger le PDF">'
      +'<i class="ti ti-file-type-pdf"></i> PDF</button></div>'
      +'<div class="li" style="color:var(--muted)">'+euro(d.total_mensuel)+' par mois'
      +(d.reste_a_charge!=null?' · reste à charge '+euro(d.reste_a_charge):'')+esc(rev)+'</div>'
      +(d.envoye_le?'<div class="li"><i class="ti ti-send" style="color:var(--muted)"></i>Envoyé le '+dfr(d.envoye_le)+'</div>':'')
      +(d.repondu_le?'<div class="li"><i class="ti ti-writing-sign" style="color:'
        +(d.statut==='accepte'?'var(--green)':'var(--red)')+'"></i>'
        +(d.statut==='accepte'?'Accepté':'Réponse')+' le '+dfr(d.repondu_le)+'</div>':'')
      +'</div>';
  }).join('');
}

/* Age en annees revolues a la date d'entree : le CMG est divise par deux a
   partir de 3 ans, et s'eteint a 6 ans. */
function ageAns(dob,dateRef){
  if(!dob||!dateRef)return null;
  const d0=new Date(String(dob).slice(0,10)+'T00:00:00');
  const d1=new Date(String(dateRef).slice(0,10)+'T00:00:00');
  if(isNaN(d0)||isNaN(d1))return null;
  let a=d1.getFullYear()-d0.getFullYear();
  const m=d1.getMonth()-d0.getMonth();
  if(m<0||(m===0&&d1.getDate()<d0.getDate()))a--;
  return a;
}

async function openDevis(id){
  const p=ficheId?PRE.find(x=>String(x.id)===String(ficheId)):null;
  if(!p){toast('Enregistrez d\'abord la demande.',true);return;}
  await Promise.all([loadCmg(),loadEtabs(),loadReseau(),TARIFS.length?Promise.resolve():chargeGrille()]);

  devisId=id;
  DCUR=id?DEVIS.find(x=>String(x.id)===String(id)):null;
  const brouillon=!DCUR||DCUR.statut==='brouillon';

  document.getElementById('dTitle').textContent=DCUR?(DCUR.numero||'Devis'):'Nouveau devis';
  const st=DCUR?(D_STATUTS[DCUR.statut]||D_STATUTS.brouillon):null;
  document.getElementById('dStatut').innerHTML=st
    ? '<span class="tag" style="background:'+st.bg+';color:'+st.fg+'">'+esc(st.l)+'</span>':'';
  // Un devis se supprime quel que soit son statut : chaque devis a ses propres
  // lignes (devis_lignes.devis_id) et rien d'autre ne le référence, donc en
  // effacer un ne touche jamais les autres devis de la même famille.
  document.getElementById('btnDelDev').style.display=DCUR?'':'none';
  document.getElementById('btnSaveDev').style.display=brouillon?'':'none';
  /* Le refus (ou l'acceptation) se pose sur le devis lui-même : une famille peut
     recevoir plusieurs devis, en refuser trois et retenir le quatrième. Seul un
     devis encore vivant peut être tranché ; un devis clos se supprime. */
  const vivant=!!(DCUR&&['brouillon','envoye'].indexOf(DCUR.statut)>=0&&!DCUR.repondu_le);
  document.getElementById('btnRefusDev').style.display=vivant?'':'none';
  document.getElementById('btnAccepteDev').style.display=vivant?'':'none';
  // Le PDF ne s'imprime que depuis la base : un devis jamais enregistré n'a ni
  // numéro ni lignes, et sortirait un document sans identité.
  document.getElementById('btnPdfDev').style.display=DCUR?'':'none';

  // Un devis envoyé est un engagement : il ne se modifie plus. Le corriger
  // supposerait une révision, qui est un nouveau devis remplaçant le premier.
  const lock=document.getElementById('dLock');
  lock.style.display=brouillon?'none':'';
  lock.innerHTML=brouillon?'':etatEnvoi(DCUR);

  /* Envoi et relance. Un devis clos — signé, refusé, annulé — ne s'envoie plus :
     le lien serait mort à l'arrivée, et relancer une famille qui a déjà répondu
     est le genre de maladresse qu'une application ne doit pas rendre possible. */
  const clos=!!(DCUR&&(DCUR.repondu_le
    ||['accepte','refuse','annule','expire'].indexOf(DCUR.statut)>=0));
  const bEnv=document.getElementById('btnEnvoiDev');
  bEnv.style.display=(DCUR&&!clos)?'':'none';
  bEnv.innerHTML=(DCUR&&DCUR.statut==='envoye')
    ? '<i class="ti ti-bell"></i> Relancer la famille'
    : '<i class="ti ti-send"></i> Envoyer à la famille';
  /* Le lien s'obtient sur tout devis enregistré et non clos, qu'il ait déjà été
     envoyé ou non : c'est la voie manuelle, et elle ne doit jamais dépendre du
     bon fonctionnement du mail automatique. */
  const bLien=document.getElementById('btnLienDev');
  bLien.style.display=(DCUR&&!clos)?'':'none';
  document.getElementById('btnPartagerDev').style.display=(DCUR&&!clos&&PartageLien.disponible())?'':'none';
  bLien.innerHTML=(DCUR&&DCUR.token)
    ? '<i class="ti ti-link"></i> Le lien'
    : '<i class="ti ti-link"></i> Créer le lien';

  const src=DCUR||p;
  document.getElementById('dCreche').innerHTML='<option value="">— à définir —</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  setVal('dCreche',src.creche_id||'');
  setVal('dDebut',(DCUR?DCUR.date_debut:p.date_entree_souhaitee)||'');
  setVal('dFin',DCUR?(DCUR.date_fin||''):'');
  setVal('dHd',src.heure_debut||'07:30');setVal('dHf',src.heure_fin||'18:00');
  semManuel=false;
  setVal('dSem',DCUR?DCUR.semaines_an:(semainesDe(src.creche_id)||47));

  const jrs=toArr(src.jours).map(Number);
  document.getElementById('dJoursBox').innerHTML=JOURS.map(j=>
    '<label><input type="checkbox" class="ckDJour" value="'+j[0]+'"'
    +((jrs.length?jrs:[1,2,3,4,5]).indexOf(j[0])>=0?' checked':'')+'><span>'+j[1]+'</span></label>').join('');
  /* Cocher un jour change le nombre de jours d'accueil de la période : le
     comptage se rejoue. dPeriodeChange retombe sur dSync quand aucune fin n'est
     posée, il n'y a donc qu'un seul chemin à retenir.
     Un devis verrouillé n'émet aucun de ces événements — ses cases sont
     désactivées — ses chiffres figés ne risquent rien. */
  document.querySelectorAll('.ckDJour').forEach(c=>c.addEventListener('change',dPeriodeChange));

  // Parent isolé : la majoration PAJE cochée sur la fiche est le meilleur
  // indice dont on dispose, mais elle couvre aussi le handicap. Modifiable.
  setVal('dSit',p.majoration_paje?'isole':'couple');
  setVal('dRev',p.revenus_foyer!=null?p.revenus_foyer:'');
  setVal('dCom',DCUR?DCUR.commentaire:'');
  setVal('dNotes',DCUR?DCUR.notes_internes:'');

  /* La fourchette figure dans la liste : c'est ici que le choix se fait, et une
     ligne « Moins de 24 h » qui couvre en réalité tout volume horaire doit se
     voir à l'endroit où elle est retenue, pas seulement dans l'écran Tarifs. */
  document.getElementById('dTarif').innerHTML='<option value="">— choix automatique —</option>'
    +TARIFS.filter(t=>t.actif).map(t=>'<option value="'+t.id+'">'+esc(t.libelle)+' · '+euro(t.montant)
      +(t.mode==='horaire'?' · '+esc(fourchette(t)):'')+'</option>').join('');
  /* Un devis enregistre TOUJOURS son tarif_id, y compris quand la grille l'a
     choisi toute seule — c'est ce qui fige le montant facturé. Mais le relire
     tel quel à la réouverture transformait chaque choix automatique en « tarif
     forcé » : le tarif cessait alors de suivre le volume horaire, et un contrat
     rallongé après coup gardait le tarif de l'ancien. Un accueil passé de 20 h
     à 52,5 h restait ainsi facturé 9,90 € au lieu de 9,00 €, sans que rien ne
     le signale.

     On ne pré-sélectionne donc la ligne que si elle diffère de ce que la grille
     retiendrait aujourd'hui. Un forçage qui coïncide avec l'automatique se
     comporte exactement pareil : l'indistinction est sans conséquence.
     Volume incalculable (jours ou horaires manquants) : on garde la valeur
     enregistrée, faute de quoi la comparer reviendrait à deviner. */
  let forcage='';
  if(DCUR&&DCUR.tarif_id){
    const h0=dHeuresHebdo();
    const auto=h0==null?null:tarifPour(h0,val('dCreche')||null);
    if(!auto||String(auto.id)!==String(DCUR.tarif_id))forcage=DCUR.tarif_id;
  }
  setVal('dTarif',forcage);

  // Les frais cochés : ceux du devis s'il existe, sinon les « par défaut ».
  let coches=null;
  AJUST=[];
  if(DCUR){
    try{
      const{data}=await sb.from('devis_lignes').select('libelle,description,type,montant_unitaire,total').eq('devis_id',DCUR.id).order('ordre');
      coches=(data||[]).map(x=>x.libelle);
      /* Tout ce qui n'est ni l'accueil ni un frais de la grille est une ligne
         saisie à la main : on la remet dans l'éditeur. Un pourcentage se relit
         dans sa description (« 10 % de la mensualité »), sinon c'est un montant. */
      const connus=FRAIS.map(f=>f.libelle);
      AJUST=(data||[]).filter(x=>x.type!=='accueil'&&connus.indexOf(x.libelle)<0).map(x=>{
        const m=/^(\d+(?:[.,]\d+)?) % de la mensualité/.exec(x.description||'');
        const neg=Number(x.total)<0;
        return{libelle:x.libelle,sens:neg?'remise':'majoration',
          mode:m?'pct':'eur',valeur:m?Number(m[1].replace(',','.')):Math.abs(Number(x.montant_unitaire))};
      });
    }catch(e){console.warn('[devis lignes]',e);}
  }
  document.getElementById('dFraisBox').innerHTML=FRAIS.filter(f=>f.actif).map(f=>{
    const on=coches?coches.indexOf(f.libelle)>=0:f.par_defaut;
    return '<label class="ck"><input type="checkbox" class="ckFrais" value="'+f.id+'"'+(on?' checked':'')+'> '
      +esc(f.libelle)+' <span style="color:'+(f.est_reduction?'var(--green)':'var(--muted)')+'">('
      +(f.est_reduction?'− ':'')+euro(f.montant)+' '+esc(TYPES[f.type])+')</span></label>';
  }).join('')||'<p class="hint">Aucun frais paramétré.</p>';
  document.querySelectorAll('.ckFrais').forEach(c=>c.addEventListener('change',dSync));

  // Verrouillage visuel d'un devis non modifiable.
  ['dCreche','dDebut','dHd','dHf','dSem','dTarif','dSit','dRev','dCom','dNotes'].forEach(i=>{
    const e=document.getElementById(i);if(e)e.disabled=!brouillon;
  });
  document.querySelectorAll('.ckDJour,.ckFrais').forEach(c=>c.disabled=!brouillon);
  ajustRend(brouillon);
  document.getElementById('btnAddAjust').style.display=brouillon?'':'none';

  /* Un devis enregistré relit ses propres chiffres de période plutôt que de les
     recalculer : ils sont figés, comme ses libellés et ses montants. Un devis
     neuf les déduit des dates. */
  dAfficheRegime();
  if(DCUR&&DCUR.date_fin){
    setVal('dJours',DCUR.jours_accueil!=null?DCUR.jours_accueil:'');
    setVal('dMois',DCUR.mois_factures!=null?DCUR.mois_factures:'');
    setVal('dFerm','');
    dMajFermWarn(false);
    dSync();
  }else if(val('dFin')){
    dPeriodeChange();
  }else{
    dSync();
  }
  ['dFin','dJours','dFerm','dMois'].forEach(i=>{
    const e=document.getElementById(i);if(e)e.disabled=!brouillon;
  });
  openOv('ovDevis');
}
