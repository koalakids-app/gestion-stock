/* Collaborateurs/trices — fonctions reprises de l'ancien module « Équipe » (employes.html),
   désormais intégrées à la fiche de Demandes › Collaborateurs/trices : compte « Mon espace »,
   accès terrain, archivage, documents, formations/quiz, visites médicales (Odalia).
   Ce fichier (et 24-collaborateurs-fiche.js) fait foi ; l'ancienne page employes.html n'est plus qu'une redirection. */
function eqToast(m,err){showBanner(m,err?'error':'success');}
function eqVal(id){const e=document.getElementById(id);return e?e.value.trim():'';}
function eqNum(id){const v=eqVal(id);return v===''?null:Number(String(v).replace(',','.'));}
async function eqCallFn(fn,body){
  try{
    const{data:{session}}=await sb.auth.getSession();
    const jeton=session?.access_token||SUPABASE_ANON_KEY;
    const r=await fetch(SUPABASE_URL+'/functions/v1/'+fn,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+jeton},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({}));
    return{ok:r.ok,data};
  }catch(err){
    return{ok:false,data:{error:(err&&err.message)||'réseau injoignable'}};
  }
}
/* Crèche de la fiche ouverte (les fonctions reprises d'Équipe travaillaient sur « la crèche affichée »). */
let EQ_CRECHE_FICHE=null;
function eqCrecheCourante(){return EQ_CRECHE_FICHE||(currentProfile&&currentProfile.creche_id)||null;}
function eqRecharger(){return eqChargerStatuts().then(()=>{renderEmployes();if(editingEmployeId){const e=cacheEmployes.find(x=>String(x.id)===String(editingEmployeId));if(e)eqRenderCompte(e);}});}
/* Le module Formation et quiz (koalakids-app/quiz-protocoles) vit sur un
   projet Supabase distinct, sans lien de compte avec celui-ci : on ne peut
   donc pas s'y authentifier, seulement l'interroger avec sa clé anonyme via
   la fonction kk_resultats_par_ref (cf. quiz-protocoles/sql/resultats_par_ref.sql),
   qui ne renvoie que les résultats rattachés au `ref` demandé. */
const QUIZ_SUPABASE_URL="https://phbcqxjzobzwuzetgbem.supabase.co";
const QUIZ_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoYmNxeGp6b2J6d3V6ZXRnYmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Mjg3ODMsImV4cCI6MjEwMDEwNDc4M30.Cz7_0WN_pWoXeamk484hJr2iCVdKZEatR-m_f0bKj3w";
const sbQuiz=supabase.createClient(QUIZ_SUPABASE_URL,QUIZ_SUPABASE_ANON_KEY);
const QUIZ_APP_URL="https://koalakids-app.github.io/quiz-protocoles/index.html";
const FORMATIONS_APP_URL="https://koalakids-app.github.io/quiz-protocoles/formations.html";

function estArchive(e){return !!e.archive_le;}
function estSorti(e){return !estArchive(e)&&!!e.date_fin&&e.date_fin<=todayISO();}
function todayISO(){return new Date().toISOString().slice(0,10);}
function renderArchivageBox(e){
  const box=document.getElementById('ficheArchivageWrap');
  if(!box)return;
  if(estArchive(e)){
    const purge=e.date_fin?datePlusAns(e.date_fin,5):null;
    box.innerHTML='<div style="background:var(--violet-l);border-left:4px solid var(--violet);border-radius:0 10px 10px 0;padding:10px 14px;font-size:12.5px;color:var(--violet)">'
      +'<i class="ti ti-archive"></i> Dossier archivé le '+escHtml(new Date(e.archive_le).toLocaleDateString('fr-FR'))+'.'
      +(purge?' Conservation légale recommandée jusqu\'au '+escHtml(new Date(purge).toLocaleDateString('fr-FR'))+' (5 ans après la fin de contrat), au-delà duquel le dossier peut être purgé/anonymisé.':'')
      +'<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'
      +'<button type="button" class="btn btn-g btn-sm" onclick="desarchiverFiche(\''+e.id+'\')"><i class="ti ti-archive-off"></i> Réactiver ce dossier</button>'
      +(isDirection?'<button type="button" class="btn btn-g btn-sm" onclick="exporterDocuments(\''+e.id+'\')" title="Télécharge un .zip des documents du dossier, à conserver hors ligne (disque externe), puis les retire du stockage en ligne"><i class="ti ti-cloud-download"></i> Exporter les documents et libérer l\'espace</button>':'')
      +'</div>'
      +'</div>';
  }else if(estSorti(e)){
    box.innerHTML='<div style="background:var(--orange-l);border-left:4px solid var(--orange);border-radius:0 10px 10px 0;padding:10px 14px;font-size:12.5px;color:var(--orange)">'
      +'<i class="ti ti-alert-triangle"></i> Ce contrat est terminé depuis le '+escHtml(new Date(e.date_fin).toLocaleDateString('fr-FR'))+'. '
      +'Une fois les documents à jour, la fiche peut être archivée pour sortir des listes actives'+(e.user_id?' ; son compte de connexion sera alors bloqué.':'.')
      +'<div style="margin-top:8px"><button type="button" class="btn btn-g btn-sm" onclick="archiverFiche(\''+e.id+'\')"><i class="ti ti-archive"></i> Archiver ce dossier</button></div>'
      +'</div>';
  }else{
    box.innerHTML='';
  }
}
function datePlusAns(iso,ans){
  const d=new Date(iso+'T00:00:00');
  d.setFullYear(d.getFullYear()+ans);
  return d.toISOString().slice(0,10);
}
async function archiverFiche(id){
  const e=cacheEmployes.find(x=>String(x.id)===String(id));
  if(!e)return;
  if(!confirm('Archiver le dossier de '+(e.prenom||'')+' '+(e.nom||'')+' ?\n\nLa fiche sortira des listes actives mais reste consultable dans les archives.'
    +(e.user_id?' Son compte de connexion (Mon espace, accès terrain) sera bloqué.':'')
    +' Cette action est réversible.'))return;
  // Blocage d'abord : si le compte ne peut pas être bloqué, on n'archive pas
  // (sinon un dossier « fermé » garderait un accès actif sans que ça se voie).
  if(e.user_id){
    const{ok,data}=await eqCallFn('bloquer-compte-collaborateur',{employe_id:id,bloquer:true});
    if(!ok){eqToast('Archivage annulé : le compte de connexion n\'a pas pu être bloqué ('+(data.error||'erreur inconnue')+').',true);return;}
  }
  /* Codes de pointage retirés : la tablette ne reconnaît plus la personne (le code image sera à régénérer à la réactivation). */
  const row={archive_le:new Date().toISOString(),archive_par:currentUser?currentUser.id:null,code_pictos:null,code_pointage:null};
  const{error}=await sb.from('employes').update(row).eq('id',id);
  if(error){
    if(e.user_id)await eqCallFn('bloquer-compte-collaborateur',{employe_id:id,bloquer:false});
    eqToast('Erreur lors de l\'archivage : '+error.message,true);return;
  }
  Object.assign(e,row);
  renderArchivageBox(e);
  renderEmployes();
  eqToast((e.user_id?'Dossier archivé, compte bloqué':'Dossier archivé')+', retiré du planning et du pointage.');
}
async function desarchiverFiche(id){
  if(!confirm('Réactiver ce dossier et le remettre dans les fiches actives ? Son compte de connexion, s\'il en a un, sera rétabli.'))return;
  const e=cacheEmployes.find(x=>String(x.id)===String(id));
  if(e&&e.user_id){
    const{ok,data}=await eqCallFn('bloquer-compte-collaborateur',{employe_id:id,bloquer:false});
    if(!ok){eqToast('Réactivation annulée : le compte n\'a pas pu être rétabli ('+(data.error||'erreur inconnue')+').',true);return;}
  }
  const row={archive_le:null,archive_par:null};
  const{error}=await sb.from('employes').update(row).eq('id',id);
  if(error){eqToast('Erreur : '+error.message,true);return;}
  if(e)Object.assign(e,row);
  if(e)renderArchivageBox(e);
  renderEmployes();
  eqToast('Dossier réactivé. Pensez à régénérer son code image de pointage (carte du collaborateur).');
}

/* ---------- EXPORT DES DOCUMENTS PUIS PURGE DU STOCKAGE ----------
   Réservé aux dossiers archivés (voir renderArchivageBox). Télécharge un
   .zip des documents d'embauche (employes_documents), puis — seulement après
   confirmation explicite que le fichier a bien été sauvegardé — supprime ces
   fichiers de Supabase Storage et les lignes correspondantes en base. Trace
   permanente dans archivage_purges, qui survit même une fois les documents
   supprimés. Irréversible : d'où la confirmation à deux temps. */
async function exporterDocuments(id){
  const e=cacheEmployes.find(x=>String(x.id)===String(id));
  if(!isDirection||!e||!estArchive(e))return;
  if(!confirm('Préparer un fichier .zip de tous les documents de '+(e.prenom||'')+' '+(e.nom||'')+' ?\n\nUne fois le fichier téléchargé et sa sauvegarde confirmée, ces documents seront supprimés du stockage en ligne (Supabase) — à vous de les conserver ensuite hors ligne (disque externe) pour le reste du délai légal.'))return;

  eqToast('Préparation du fichier .zip…');
  let docs=[];
  try{
    const{data,error}=await sb.from('employes_documents').select('*').eq('employe_id',id);
    if(error)throw error;
    docs=data||[];
  }catch(err){
    eqToast('Erreur lors de la lecture des documents : '+err.message,true);
    return;
  }
  let comptesRendus=[];
  try{
    const{data}=await sb.from('employes_visites_medicales').select('*').eq('employe_id',id).not('piece_path','is',null);
    comptesRendus=data||[];
  }catch(err){console.warn('[exporterDocuments] comptes rendus de visite',err);}
  if(!docs.length&&!comptesRendus.length){eqToast('Aucun document à exporter pour ce dossier.');return;}

  const zip=new JSZip();
  const reussis=[];
  const reussisVm=[];
  for(const v of comptesRendus){
    try{
      const{data,error}=await sb.storage.from(v.piece_bucket||EMP_DOCS_BUCKET).download(v.piece_path);
      if(error)throw error;
      zip.file('visites-medicales/'+String(v.id).slice(0,8)+'_'+(v.piece_nom||'compte-rendu'),data);
      reussisVm.push(v);
    }catch(err){console.warn('[exporterDocuments] échec compte rendu',v.id,err);}
  }
  let nEchec=0;
  for(const d of docs){
    try{
      const{data,error}=await sb.storage.from(d.bucket||EMP_DOCS_BUCKET).download(d.path);
      if(error)throw error;
      zip.file('embauche/'+(d.filename||d.id),data);
      reussis.push(d);
    }catch(err){
      console.warn('[exporterDocuments] échec sur',d.id,err);
      nEchec++;
    }
  }
  if(!reussis.length&&!reussisVm.length){eqToast('Aucun document n\'a pu être téléchargé — export annulé, rien n\'a été supprimé.',true);return;}

  const contenu=await zip.generateAsync({type:'blob'});
  const nomZip='documents_'+(e.prenom||'')+'_'+(e.nom||'')+'_'+todayISO()+'.zip';
  const url=URL.createObjectURL(contenu);
  const a=document.createElement('a');a.href=url;a.download=nomZip;document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);

  if(nEchec)eqToast(nEchec+' document(s) n\'ont pas pu être inclus dans le zip (ignorés, non supprimés) — '+reussis.length+' inclus.',true);

  if(!confirm('Le fichier "'+nomZip+'" a été téléchargé.\n\nAvez-vous bien enregistré ce fichier sur un support externe (disque dur, coffre-fort numérique) ?\n\nEn confirmant, les '+reussis.length+' document(s) effectivement exportés seront DÉFINITIVEMENT supprimés du stockage en ligne'+(nEchec?' ('+nEchec+' document(s) en échec resteront en ligne, à retenter plus tard)':'')+'. Cette action est IRRÉVERSIBLE.'))return;

  let suppOk=0,suppKo=0;
  for(const d of reussis){
    try{
      const{error:rmErr}=await sb.storage.from(d.bucket||EMP_DOCS_BUCKET).remove([d.path]);
      if(rmErr)console.warn('[exporterDocuments] fichier non supprimé du stockage',d.id,rmErr.message);
      const{error:delErr}=await sb.from('employes_documents').delete().eq('id',d.id);
      if(delErr)throw delErr;
      suppOk++;
    }catch(err){
      console.warn('[exporterDocuments] suppression échouée',d.id,err);
      suppKo++;
    }
  }

  // comptes rendus de visite : on retire le fichier, la visite (date, avis) reste
  for(const v of reussisVm){
    const{error:rmErr}=await sb.storage.from(v.piece_bucket||EMP_DOCS_BUCKET).remove([v.piece_path]);
    if(rmErr){console.warn('[exporterDocuments] compte rendu non supprimé',v.id,rmErr.message);continue;}
    await sb.from('employes_visites_medicales').update({piece_bucket:null,piece_path:null,piece_nom:null}).eq('id',v.id);
    suppOk++;
  }

  await sb.from('archivage_purges').insert({
    entite_type:'employe',
    entite_id:id,
    creche_id:e.creche_id||null,
    annee_sortie:e.date_fin?Number(String(e.date_fin).slice(0,4)):null,
    motif:suppOk+' document(s) exportés en .zip puis supprimés du stockage en ligne'+(suppKo?' ('+suppKo+' échec(s) de suppression)':''),
    purge_par:currentUser?currentUser.id:null
  });

  empDocsCache=[];
  document.getElementById('ficheDocsZone').innerHTML='';
  if(String(empFicheId)===String(id))empLoadDocs(id);
  eqToast(suppOk+' document(s) supprimé(s) du stockage en ligne.'+(suppKo?' '+suppKo+' suppression(s) ont échoué.':''));
}

/* ---------- VALIDATION MENSUELLE DES HEURES (lecture seule, vue direction) ----------
   Les signatures sont déposées depuis collaborateur.html ("Mon espace") et ne
   peuvent être ni créées ni modifiées ici — cf. sql/validation_heures_mensuelle.sql
   (écriture réservée à la fonction kk_signer_heures_mois, appelée par la
   personne concernée elle-même). */
async function loadFicheHeures(e){
  const box=document.getElementById('ficheHeuresBox');
  box.innerHTML='<p class="hint">Chargement…</p>';
  const{data,error}=await sb.from('heures_validations_mensuelles').select('*')
    .eq('employe_id',e.id).order('annee',{ascending:false}).order('mois',{ascending:false}).limit(12);
  if(error){box.innerHTML='<p class="hint">Validations indisponibles pour le moment.</p>';return;}
  const rows=data||[];
  if(!rows.length){box.innerHTML='<p class="hint">Aucun mois validé pour le moment.</p>';return;}
  box.innerHTML=rows.map(r=>{
    const mois=capitalize(new Date(r.annee,r.mois-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}));
    const d=new Date(r.signe_le).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
    return'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">'
      +'<div><div style="font-weight:700;font-size:13px">'+escHtml(mois)+'</div>'
      +'<div style="font-size:11.5px;color:var(--muted)">Signé par '+escHtml(r.signe_par)+' le '+d+'</div></div>'
      +'<span style="font-weight:800;font-size:14px;color:var(--violet);white-space:nowrap">'
      +Number(r.heures_realisees).toFixed(1)+'h</span></div>';
  }).join('');
}
function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1);}
async function loadFicheFormationOptions(){
  const sel=document.getElementById('ficheFormationSelect');
  try{
    const[qz,md]=await Promise.all([
      sbQuiz.from('quiz').select('id,titre').eq('publie',true).order('titre'),
      sbQuiz.from('module').select('id,titre').eq('publie',true).order('titre')
    ]);
    FICHE_FORMATION_OPTIONS=[
      ...((qz.data||[]).map(q=>({value:'q-'+q.id,id:q.id,kind:'quiz',titre:q.titre}))),
      ...((md.data||[]).map(m=>({value:'m-'+m.id,id:m.id,kind:'module',titre:m.titre})))
    ];
    if(!FICHE_FORMATION_OPTIONS.length){sel.innerHTML='<option value="">Aucun quiz ni formation publié</option>';return;}
    sel.innerHTML='<option value="">— Choisir —</option>'
      +'<optgroup label="Quiz">'+FICHE_FORMATION_OPTIONS.filter(o=>o.kind==='quiz').map(o=>'<option value="'+o.value+'">'+escHtml(o.titre)+'</option>').join('')+'</optgroup>'
      +'<optgroup label="Micro-formations">'+FICHE_FORMATION_OPTIONS.filter(o=>o.kind==='module').map(o=>'<option value="'+o.value+'">'+escHtml(o.titre)+'</option>').join('')+'</optgroup>';
  }catch(e){sel.innerHTML='<option value="">Liste indisponible</option>';}
}
document.addEventListener('DOMContentLoaded',()=>{
  const b=document.getElementById('btnPartagerFormation');
  if(b&&PartageLien.disponible())b.style.display='';
});
let ENVOI_FORMATION_EN_COURS=false;
async function envoyerFormation(partager){
  if(ENVOI_FORMATION_EN_COURS)return;
  ENVOI_FORMATION_EN_COURS=true;
  const btns=[...document.querySelectorAll('button[onclick^="envoyerFormation"],button[onclick^="proposerFormation"]')];
  btns.forEach(b=>{b.disabled=true;});
  try{await envoyerFormationInner(partager);}
  finally{ENVOI_FORMATION_EN_COURS=false;btns.forEach(b=>{b.disabled=false;});}
}
/* Formation conseillée d'après un quiz « À revoir » : même chemin que « Envoyer »
   (enregistrement, anti-doublon, e-mail), sans passer par le sélecteur. */
let FICHE_SUGGESTIONS=[];
async function proposerFormation(moduleId){
  const sg=FICHE_SUGGESTIONS.find(x=>x.module_id===moduleId);
  if(!sg||ENVOI_FORMATION_EN_COURS)return;
  ENVOI_FORMATION_EN_COURS=true;
  const btns=[...document.querySelectorAll('button[onclick^="envoyerFormation"],button[onclick^="proposerFormation"]')];
  btns.forEach(b=>{b.disabled=true;});
  try{await envoyerFormationInner(false,{kind:'module',id:sg.module_id,titre:sg.module_titre});}
  finally{ENVOI_FORMATION_EN_COURS=false;btns.forEach(b=>{b.disabled=false;});}
}
async function envoyerFormationInner(partager,optForce){
  const e=FICHE_FORMATION_EMPLOYE;
  if(!e)return;
  const sel=document.getElementById('ficheFormationSelect');
  const opt=optForce||FICHE_FORMATION_OPTIONS.find(o=>o.value===sel.value);
  if(!opt){eqToast('Choisissez un quiz ou une formation.',true);return;}
  const crecheNom=(cacheCreches.find(c=>c.id===eqCrecheCourante())||{}).name||'';
  const params=new URLSearchParams({ref:e.id,prenom:e.prenom||'',nom:e.nom||'',statut:'Salarié(e) en poste'});
  if(crecheNom)params.set('creche',crecheNom);
  const base=opt.kind==='quiz'?QUIZ_APP_URL:FORMATIONS_APP_URL;
  params.set(opt.kind==='quiz'?'quiz':'module',opt.id);
  const lien=base+'?'+params.toString();
  /* Déjà dans le parcours et pas encore validé : on ne crée pas de doublon,
     on renvoie seulement le lien (e-mail ou partage) pour cette ligne. */
  let saved=null,error=null,dejaLa=false;
  const ex=await sb.from('formations_envois').select('*')
    .eq('employe_id',e.id).eq('kind',opt.kind).eq('item_id',opt.id).is('valide_le',null)
    .order('envoye_le',{ascending:false}).limit(1);
  if(!ex.error&&ex.data&&ex.data.length){saved=ex.data[0];dejaLa=true;}
  else{
    ({data:saved,error}=await sb.from('formations_envois').insert({
      employe_id:e.id,kind:opt.kind,item_id:opt.id,item_titre:opt.titre,lien,envoye_par:currentUser.id
    }).select().single());
  }
  if(error){eqToast('Échec de l\'envoi : '+error.message,true);return;}
  /* Le presse-papiers du navigateur échoue silencieusement dans de nombreux
     contextes (permission refusée, page non sécurisée...) : la personne
     copiait alors un lien vide sans le savoir. On envoie désormais un vrai
     e-mail depuis le serveur (edge function envoyer-formation), qui ne
     dépend pas du navigateur — le presse-papiers ne reste qu'un confort
     silencieux en plus, jamais le seul moyen de transmission. */
  if(partager===true){
    /* Même enregistrement que l'envoi par mail (le lien entre dans le parcours,
       « À faire »), mais le lien part par la feuille de partage de l'appareil. */
    const r=await PartageLien.partager(lien,{titre:opt.titre,
      texte:'Bonjour '+(e.prenom||'')+', voici le lien pour réaliser '
        +(opt.kind==='quiz'?'le quiz':'la formation')+' « '+opt.titre+' » :'});
    eqToast(r==='copie'?'Enregistré — partage indisponible, lien copié.'
      :r==='annule'?'Ajouté au parcours, mais le lien n\'a pas été partagé (feuille de partage fermée).'
      :'Enregistré dans le parcours de '+(e.prenom||'la personne')+'.',r==='annule');
    sel.value='';
    await loadFicheFormation(e);
    return;
  }
  if(e.email){
    const{ok,data}=await eqCallFn('envoyer-formation',{envoi_id:saved.id,expediteur:currentProfile?.name});
    if(ok)eqToast((dejaLa?'Déjà dans le parcours — e-mail renvoyé à ':'E-mail envoyé à ')+e.email+'.');
    else eqToast('Enregistré, mais l\'e-mail n\'a pas pu être envoyé : '+(data.error||'erreur inconnue')+'. Copiez le lien manuellement : '+lien,true);
  }else{
    eqToast('Envoyé — mais aucun e-mail sur cette fiche : copiez le lien manuellement : '+lien,true);
  }
  try{await navigator.clipboard.writeText(lien);}catch(err){}
  sel.value='';
  await loadFicheFormation(e);
}
/* Envois faits depuis l'écran « Envoyer par mail » de l'admin du quiz (table
   envois_quiz, projet quiz), lus par le `ref` de la fiche via kk_envois_par_ref
   (cf. docs/quiz-envoi/envois_par_ref.sql). Même logique que collaborateur.html.
   Si la fonction n'existe pas ou échoue, le parcours s'affiche sans ces envois. */
async function envoisDepuisAdminQuiz(e){
  try{
    const{data,error}=await sbQuiz.rpc('kk_envois_par_ref',{p_ref:e.id});
    if(error)return[];
    return(data||[]).map(x=>{
      const params=new URLSearchParams({ref:e.id,prenom:e.prenom||'',nom:e.nom||'',statut:'Salarié(e) en poste'});
      params.set(x.kind==='quiz'?'quiz':'module',x.item_id);
      return{kind:x.kind,item_id:x.item_id,item_titre:x.item_titre,envoye_le:x.envoye_le,
        lien:(x.kind==='quiz'?QUIZ_APP_URL:FORMATIONS_APP_URL)+'?'+params.toString()};
    });
  }catch(err){return[];}
}
async function loadFicheFormation(e){
  FICHE_FORMATION_EMPLOYE=e;
  await loadFicheFormationOptions();
  const box=document.getElementById('ficheFormationBox');
  box.innerHTML='<p class="hint">Chargement…</p>';
  try{
    const[envois,qz,md,admin]=await Promise.all([
      sb.from('formations_envois').select('*').eq('employe_id',e.id).order('envoye_le',{ascending:false}),
      sbQuiz.rpc('kk_resultats_par_ref',{p_ref:e.id}),
      sbQuiz.rpc('kk_formations_par_ref',{p_ref:e.id}),
      envoisDepuisAdminQuiz(e)
    ]);
    if(envois.error)throw envois.error;
    if(qz.error)throw qz.error;
    if(md.error)throw md.error;
    /* Qui a envoyé : envoye_par est un auth.users.id, on le résout en prénom
       via referents.user_id. Échec silencieux : le parcours s'affiche sans. */
    const parIds=[...new Set((envois.data||[]).map(x=>x.envoye_par).filter(Boolean))];
    if(parIds.length){
      try{
        const{data:refs}=await sb.from('referents').select('user_id,name').in('user_id',parIds);
        const noms=Object.fromEntries((refs||[]).map(r=>[r.user_id,String(r.name||'').split(/\s+/)[0]]));
        (envois.data||[]).forEach(x=>{x.envoye_par_nom=noms[x.envoye_par]||'';});
      }catch(err){}
    }
    const vus=new Set((envois.data||[]).map(x=>x.kind+':'+x.item_id));
    const tous=[...(envois.data||[]),...admin.filter(x=>!vus.has(x.kind+':'+x.item_id))];
    const ids=tous.filter(x=>x.kind==='module').map(x=>x.item_id);
    let mq=null;
    if(ids.length){const r=await sbQuiz.rpc('kk_modules_quiz',{p_ids:ids});if(!r.error)mq=r.data||[];}else mq=[];
    await joindreFreres(mq);
    /* Formations conseillées pour les quiz notés : échec silencieux (fonction
       absente tant que docs/quiz-profil/formations_pour_quiz.sql n'est pas
       appliqué) — le parcours s'affiche alors sans suggestion. */
    let sugg=[];
    const qids=tous.filter(x=>x.kind==='quiz').map(x=>x.item_id);
    if(qids.length){try{const r=await sbQuiz.rpc('kk_formations_pour_quiz',{p_quiz_ids:qids});if(!r.error)sugg=r.data||[];}catch(err){}}
    FICHE_SUGGESTIONS=sugg;
    box.innerHTML=renderParcoursHtml(tous,qz.data||[],md.data||[],mq,sugg,true);
    /* Planning des quiz en lecture seule (pas de lien : le lien est personnel à la personne). */
    PlanningQuiz.charger(document.getElementById('fichePlanningQuizBox'),e.id,null,qz.data||[],{prenom:e.prenom,nom:e.nom});
  }catch(err){
    box.innerHTML='<p class="hint">Parcours de formation indisponible pour le moment.</p>';
  }
}
/* Partagé avec collaborateur.html (logique identique, dupliquée : les deux
   pages n'ont pas de module JS commun) — un envoi non retrouvé dans les
   résultats/lectures reste "à faire", sinon il porte la date et le score
   réels de la réalisation. */
/* Une micro-formation n'est « faite » qu'après : lecture (ou quiz réussi),
   quiz du thème réussi à SEUIL_QUIZ % minimum (s'il y en a un), puis
   attestation « j'ai lu et compris » du/de la collaborateur/trice. Si
   kk_modules_quiz est indisponible, rien n'est validable (on ne dégrade pas
   la preuve). Logique dupliquée entre collaborateur.html et employes.html. */
const SEUIL_QUIZ=80;
/* Le quiz du thème porte sur toute la formation (les 3 parties) : il n'est demandé qu'une
   fois toutes les parties du thème lues. kk_modules_freres (projet quiz, sql/modules_freres.sql)
   renvoie les modules publiés du même thème ; si elle est absente, on garde l'ancien
   comportement (quiz demandé dès la première lecture). */
async function joindreFreres(mq){
  if(!mq||!mq.length)return;
  try{
    const r=await sbQuiz.rpc('kk_modules_freres',{p_ids:mq.map(x=>x.module_id)});
    if(r.error||!r.data)return;
    mq.forEach(m=>{m.freres=r.data.filter(x=>x.module_id===m.module_id).map(x=>x.frere_id);});
  }catch(e){}
}
const NIV_PROFIL={appui:{l:"Point d'appui",c:'var(--green)',bg:'var(--green-bg,#E6F4EA)'},construction:{l:'En construction',c:'var(--violet)',bg:'var(--violet-bg,#EDEAF8)'},accompagner:{l:'À accompagner',c:'var(--orange)',bg:'var(--orange-bg,#FDEBDD)'}};
/* Profil d'un quiz « sans note » (mode profil) : une pastille par axe plutôt qu'un score. */
function profilHtml(axes){
  return'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">'+(axes||[]).map(a=>{
    const v=NIV_PROFIL[a.niveau];if(!v)return'';
    return'<span title="'+escHtml(v.l)+'" style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:'+v.bg+';color:'+v.c+'">'+escHtml(a.libelle||a.code||'')+' : '+v.l+'</span>';
  }).join('')+'</div>';
}
function renderParcoursHtml(envois,resultats,formationsLues,modulesQuiz,suggestions,peutProposer){
  const meilleur=qid=>resultats.filter(x=>x.quiz_id===qid).reduce((m,x)=>Math.max(m,x.pourcentage),-1);
  const lienQuizDe=(env,qid)=>{
    try{const u=new URL(env.lien);const p=new URLSearchParams(u.search);p.delete('module');p.set('quiz',qid);return QUIZ_APP_URL+'?'+p.toString();}
    catch(e){return env.lien;}
  };
  /* Une seule ligne par quiz/formation, même si l'envoi a été enregistré
     plusieurs fois : on garde la ligne validée, sinon la plus récente (la liste
     arrive triée du plus récent au plus ancien). */
  const uniques=new Map();
  envois.forEach(env=>{
    const k=env.kind+':'+env.item_id,deja=uniques.get(k);
    if(!deja||(!deja.valide_le&&env.valide_le))uniques.set(k,env);
  });
  const items=[...uniques.values()].map(env=>{
    if(env.kind==='quiz'){
      const tent=resultats.filter(x=>x.quiz_id===env.item_id);
      const r=tent[0]; /* la plus récente (liste triée par date décroissante) */
      return r?{type:'quiz',titre:env.item_titre,date:r.passe_le,statut:'fait',itemId:env.item_id,tentatives:tent.length,meilleur:tent.reduce((m,x)=>Math.max(m,x.pourcentage),0),profil:r.mode==='profil'?(r.axes||[]):null,score:r.score,total:r.total,pourcentage:r.pourcentage,par:env.envoye_par_nom}
              :{type:'quiz',titre:env.item_titre,date:env.envoye_le,statut:'a_faire',etape:'quiz',lien:env.lien,par:env.envoye_par_nom};
    }
    const lu=formationsLues.find(x=>x.module_id===env.item_id);
    const mq=modulesQuiz?modulesQuiz.find(x=>x.module_id===env.item_id):null;
    const base={type:'formation',titre:env.item_titre,date:env.envoye_le,lien:env.lien,par:env.envoye_par_nom};
    if(!mq)return{...base,statut:'a_faire',etape:lu?'indispo':'lire'};
    const best=mq.quiz_id?meilleur(mq.quiz_id):-1;
    const quizOk=!mq.quiz_id||best>=SEUIL_QUIZ;
    if(quizOk&&env.valide_le)return{...base,statut:'fait',date:env.valide_le,quizPct:mq.quiz_id?best:null};
    if(mq.quiz_id&&!quizOk){
      const reste=(mq.freres||[]).filter(id=>id!==env.item_id&&!formationsLues.some(x=>x.module_id===id));
      if(lu&&best<0&&reste.length){
        let suite=env.lien;
        try{const u=new URL(env.lien);u.searchParams.set('module',reste[0]);u.searchParams.set('parcours','1');suite=u.toString();}catch(e){}
        return{...base,statut:'a_faire',etape:'suite',lien:suite,lues:mq.freres.length-reste.length,parties:mq.freres.length};
      }
      /* Le quiz porte sur tout le thème : un score ancien (autre module, quiz passé avant l'envoi)
         ne dispense pas de lire cette formation. Le quiz n'est proposé qu'une fois la lecture faite. */
      return lu
        ?{...base,statut:'a_faire',etape:'quiz',lien:lienQuizDe(env,mq.quiz_id),best}
        :{...base,statut:'a_faire',etape:'lire'};
    }
    if(!lu&&!mq.quiz_id)return{...base,statut:'a_faire',etape:'lire'};
    return{...base,statut:'a_faire',etape:'attester',quizPct:mq.quiz_id?best:null};
  }).sort((a,b)=>(a.statut==='a_faire')-(b.statut==='a_faire')||new Date(b.date)-new Date(a.date));
  if(!items.length)return'<p class="hint">Rien n\'a encore été envoyé.</p>';
  return items.map(r=>{
    const d=new Date(r.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const icone=r.type==='quiz'?'ti-clipboard-check':'ti-book-2';
    let droite,info='';
    if(r.statut==='a_faire'){
      if(r.etape==='quiz'&&r.type==='formation')info='<div style="font-size:11.5px;color:var(--muted)">Quiz à réussir ('+SEUIL_QUIZ+' % minimum)'+(r.best>=0?' — meilleur score : '+r.best+' %':'')+'</div>'+(r.best>=0?'<div style="font-size:11.5px;font-weight:700;color:var(--orange)"><i class="ti ti-refresh"></i> À revoir : score inférieur à '+SEUIL_QUIZ+' %, la formation est à reprendre puis le quiz à repasser</div>':'');
      if(r.etape==='attester')info='<div style="font-size:11.5px;color:var(--muted)">'+(r.quizPct!=null?'Quiz réussi ('+r.quizPct+' %) — ':'')+'attestation en attente</div>';
      if(r.etape==='suite')info='<div style="font-size:11.5px;color:var(--muted)">Formation en cours : '+r.lues+' partie'+(r.lues>1?'s':'')+' lue'+(r.lues>1?'s':'')+' sur '+r.parties+' — le quiz viendra à la fin</div>';
      if(r.etape==='indispo')info='<div style="font-size:11.5px;color:var(--muted)">Vérification du quiz indisponible pour le moment</div>';
      droite='<a href="'+escHtml(r.lien)+'" target="_blank" rel="noopener" style="font-weight:700;font-size:11.5px;color:var(--orange);white-space:nowrap;text-decoration:none"><i class="ti ti-clock"></i> '+(r.etape==='attester'?'Attestation en attente':r.etape==='quiz'?(r.best>=0?'À revoir':'Quiz à réussir'):r.etape==='suite'?'Formation en cours':'À faire')+'</a>';
    }else if(r.type==='quiz'&&r.profil){
      info=profilHtml(r.profil);
      droite='<span style="font-weight:700;font-size:11.5px;color:var(--green);white-space:nowrap"><i class="ti ti-check"></i> Profil établi</span>';
    }else if(r.type==='quiz'){
      const col=r.pourcentage>=80?'var(--green)':r.pourcentage>=60?'var(--violet)':'var(--red)';
      /* Acquis dès qu'une tentative atteint SEUIL_QUIZ % (même règle que le quiz d'une micro-formation). */
      const acquis=r.meilleur>=SEUIL_QUIZ;
      info='<div style="font-size:11.5px;color:var(--muted)">'+r.tentatives+' tentative'+(r.tentatives>1?'s':'')+(r.tentatives>1?' · meilleure note '+r.meilleur+' %':'')+'</div>';
      /* Formation conseillée : première formation publiée du thème du quiz pas
         encore dans le parcours, tant que le quiz n'est pas acquis. */
      if(!acquis){
        const dejaEnvoyes=new Set(envois.filter(x=>x.kind==='module').map(x=>x.item_id));
        const sg=(suggestions||[]).filter(x=>x.quiz_id===r.itemId&&!dejaEnvoyes.has(x.module_id))[0];
        if(sg)info+='<div style="font-size:11.5px;color:var(--orange);margin-top:2px"><i class="ti ti-bulb"></i> Formation conseillée : '+escHtml(sg.module_titre)
          +(peutProposer?' <button type="button" class="btn btn-s btn-sm" style="font-size:11px;padding:2px 8px;margin-left:4px" onclick="proposerFormation(\''+escHtml(sg.module_id)+'\')">Proposer</button>':'')+'</div>';
      }
      droite='<div style="text-align:right"><div style="font-weight:800;font-size:13px;color:'+col+';white-space:nowrap">'+r.score+'/'+r.total+' · '+r.pourcentage+'%</div>'
        +'<div style="font-weight:700;font-size:11.5px;white-space:nowrap;color:'+(acquis?'var(--green)':'var(--orange)')+'"><i class="ti '+(acquis?'ti-check':'ti-refresh')+'"></i> '+(acquis?'Acquis':'À revoir')+'</div></div>';
    }else{
      info='<div style="font-size:11.5px;color:var(--muted)">Validée le '+d+(r.quizPct!=null?' · quiz '+r.quizPct+' %':'')+'</div>';
      droite='<span style="font-weight:700;font-size:11.5px;color:var(--green);white-space:nowrap"><i class="ti ti-check"></i> Validée</span>';
    }
    return'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">'
      +'<div style="display:flex;align-items:center;gap:8px"><i class="ti '+icone+'" style="color:var(--orange);font-size:16px"></i>'
      +'<div><div style="font-weight:700;font-size:13px">'+escHtml(r.titre)+'</div>'
      +(r.statut==='fait'&&r.type==='formation'?'':'<div style="font-size:11.5px;color:var(--muted)">'+(r.statut==='a_faire'?'Envoyé le ':'')+d+'</div>')
      +info
      +(r.par?'<div style="font-size:11.5px;color:var(--muted)">Envoyé par '+escHtml(r.par)+'</div>':'')
      +'</div></div>'+droite+'</div>';
  }).join('');
}

/* ---------- COMPTE DE CONNEXION ---------- */
async function creerCompte(id,partager){
  const e=cacheEmployes.find(x=>x.id===id);
  if(!e||!e.email)return;
  if(!confirm(partager?'Créer le compte de '+e.prenom+' et partager le lien d\'invitation (aucun e-mail ne sera envoyé) ?'
    :'Envoyer à '+e.email+' un e-mail d\'invitation pour créer son compte de connexion ?'))return;
  const redirect=new URL('collaborateur.html',location.href).href;
  const{ok,data}=await eqCallFn('creer-compte-collaborateur',{employe_id:id,redirect_to:redirect,partager:!!partager});
  if(!ok){eqToast('Échec : '+(data.error||'erreur inconnue'),true);return;}
  if(data.compte_lie){
    eqToast('Fiche reliée au compte existant de '+e.prenom+' : elle/il se connecte avec son identifiant habituel.');
  }else if(partager&&data.lien){
    const r=await PartageLien.partager(data.lien,{titre:'Compte de connexion',
      texte:'Bonjour '+(e.prenom||'')+', voici le lien pour créer ton compte de connexion :'});
    eqToast(r==='copie'?'Compte créé — partage indisponible, lien copié.'
      :r==='annule'?'Compte créé, mais le lien n\'a pas été partagé (feuille de partage fermée).'
      :'Lien d\'invitation partagé.',r==='annule');
  }else eqToast('Invitation envoyée à '+e.email+'.');
  await eqRecharger();
}

/* Renvoie un nouveau lien de connexion (à partager) à une personne dont
   l'invitation n'a pas abouti : aucun e-mail, le compte existant est conservé. */
async function renvoyerInvitation(id){
  const e=cacheEmployes.find(x=>x.id===id);
  if(!e||!e.user_id)return;
  if(!confirm('Générer un nouveau lien de connexion pour '+e.prenom+' et le partager (aucun e-mail ne sera envoyé) ?'))return;
  const redirect=new URL('collaborateur.html',location.href).href;
  const{ok,data}=await eqCallFn('creer-compte-collaborateur',{employe_id:id,redirect_to:redirect,renvoyer:true});
  if(!ok||!data.lien){
    eqToast(data&&data.error==='compte_deja_actif'?e.prenom+' s\'est déjà connecté(e) : elle/il peut utiliser « Mot de passe oublié ? ».'
      :'Échec : '+((data&&data.error)||'erreur inconnue'),true);return;
  }
  const r=await PartageLien.partager(data.lien,{titre:'Lien de connexion',
    texte:'Bonjour '+(e.prenom||'')+', voici ton nouveau lien pour te connecter :'});
  eqToast(r==='copie'?'Partage indisponible, lien copié.'
    :r==='annule'?'Le lien n\'a pas été partagé (feuille de partage fermée).'
    :'Lien de connexion partagé.',r==='annule');
}

/* ---------- ACCÈS TERRAIN ---------- */
/* Pose un profil referents (role 'employe') relié à la fiche. Si la personne a
   déjà un compte de connexion (espace collaborateur), c'est le même identifiant
   qui ouvre aussi terrain.html ; sinon une invitation part par e-mail. */
async function accorderAccesTerrain(id,partager){
  const e=cacheEmployes.find(x=>x.id===id);
  if(!e||!e.email)return;
  const{data:deja}=await sb.from('referents').select('id').ilike('email',e.email).maybeSingle();
  if(deja){eqToast('Cette adresse est déjà utilisée par un compte directeur/référent : utilisez une autre adresse sur la fiche.',true);return;}
  if(!confirm(e.user_id?'Accorder l\'accès terrain à '+e.prenom+' ? Elle/il utilisera le même identifiant que pour Mon espace.'
    :partager?'Accorder l\'accès terrain à '+e.prenom+' et partager le lien d\'invitation (aucun e-mail ne sera envoyé) ?'
    :'Accorder l\'accès terrain à '+e.prenom+' ? Un e-mail d\'invitation sera envoyé à '+e.email+'.'))return;
  const redirect=new URL('terrain.html',location.href).href;
  const nom=((e.prenom||'')+' '+(e.nom||'')).trim();
  const{ok,data}=await eqCallFn('create-referent',{email:e.email,name:nom,creche_id:e.creche_id,poste:e.poste||'',role:'employe',redirect_to:redirect,partager:!!partager});
  if(!ok||!data.user_id){eqToast('Échec : '+((data&&(data.error))||'erreur inconnue'),true);return;}
  const{error}=await sb.from('referents').update({employe_id:id}).eq('user_id',data.user_id);
  if(error){eqToast('Accès créé, mais le lien avec la fiche a échoué : '+error.message,true);}
  else if(partager){
    const pageTerrain=redirect;
    const r=await PartageLien.partager(data.lien||pageTerrain,{titre:'Accès terrain',
      texte:'Bonjour '+(e.prenom||'')+(data.lien?', voici le lien pour créer ton accès terrain :'
        :', ton accès terrain est activé, connecte-toi avec ton e-mail et ton mot de passe habituels :')});
    eqToast(r==='copie'?'Accès accordé — partage indisponible, lien copié.'
      :r==='annule'?'Accès accordé, mais le lien n\'a pas été partagé (feuille de partage fermée).'
      :'Accès terrain accordé, lien partagé.',r==='annule');
  }
  else eqToast(e.user_id?'Accès terrain accordé.':'Invitation envoyée à '+e.email+'.');
  await eqRecharger();
}

/* ---------- SUPPRESSION ---------- */
/* La fiche disparaît, ainsi que l'historique de ses pointages (suppression en
   cascade côté base, cf. sql/module_employes.sql). Le compte de connexion
   auth.users éventuellement créé est supprimé juste avant, via la fonction
   Edge supprimer-compte-collaborateur (service role requis, inaccessible à

/* ---------- DOCUMENTS D'EMBAUCHE (fiche collaborateur/trice) ----------
   Pièces liées à l'embauche, distinctes des champs texte ajoutés par
   employes_contrat_travail.sql (état civil, contrat) : ici, une copie du
   document lui-même. Même schéma de stockage que enfants_documents_admin
   côté fiche enfant (js/enfants.js) : bucket PRIVÉ, aucune URL publique
   enregistrée — seuls bucket et chemin sont gardés en base, une URL signée
   est générée à chaque ouverture. */
const EMP_DOCS_BUCKET='documents-employes';
const EMP_DOCS_TTL=300; // durée de vie d'une URL signée, en secondes

/* Liste figée des pièces habituellement demandées à l'embauche. Une fiche
   incomplète n'est jamais bloquante : c'est un aide-mémoire, pas une
   validation. */
const PIECES_EMBAUCHE=[
  {key:'cv',                     label:'CV'},
  {key:'piece_identite',         label:"Carte d'identité recto/verso"},
  {key:'carte_vitale',           label:'Carte vitale'},
  {key:'justificatif_domicile',  label:'Justificatif de domicile (facture téléphone / EDF)'},
  {key:'diplomes',                label:'Copie des derniers diplômes'},
  {key:'certificat_formation',    label:'Certificat de formation (le cas échéant)',optionnel:true},
  {key:'certificat_medical',      label:"Certificat médical d'aptitude"},
  {key:'attestation_honorabilite',label:"Attestation d'honorabilité"},
  {key:'casier_judiciaire',       label:'Extrait de casier judiciaire (bulletin n°3)'},
  {key:'carnet_sante_vaccins',    label:'Extrait du carnet de santé (partie vaccins)'},
  {key:'rib',                     label:"Relevé d'identité bancaire"}
];

let empDocsCache=[],empFicheId='';
async function empLoadDocs(employeId){
  empFicheId=employeId;
  try{
    const{data,error}=await sb.from('employes_documents')
      .select('*')
      .eq('employe_id',employeId)
      .order('created_at',{ascending:false});
    if(error)throw error;
    empDocsCache=data||[];
  }catch(err){
    console.warn('empLoadDocs',err);
    empDocsCache=[];
  }
  if(String(empFicheId)!==String(employeId))return;
  empRenderDocs();
  /* Le bloc "Dépôt en ligne" (empRenderPiecesDossier) affiche aussi un
     compteur basé sur empDocsCache : à redessiner ici, sans quoi il reste
     figé si son propre chargement (empLoadPieces) a déjà rendu avant que
     celui-ci ne finisse (course entre les deux requêtes). */
  empRenderPiecesDossier();
}
function empPiecesPourCle(key){
  return empDocsCache.filter(d=>d.piece_key===key);
}
function empRenderDocs(){
  const zone=document.getElementById('ficheDocsZone');
  if(!zone)return;

  const ligneFichier=d=>
    '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
    +'<i class="ti ti-paperclip" style="color:var(--orange);flex-shrink:0"></i>'
    +'<button type="button" onclick="empDocOpen(\''+d.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--violet);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(d.filename||'Document')+'</button>'
    +'<span style="font-size:11px;color:var(--muted);white-space:nowrap">'+new Date(d.created_at).toLocaleDateString('fr-FR')+'</span>'
    +'<button onclick="empDocDelete(\''+d.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px;flex-shrink:0"><i class="ti ti-trash"></i></button>'
    +'</div>';

  const checklist=PIECES_EMBAUCHE.map(p=>{
    const fichiers=empPiecesPourCle(p.key);
    const dernier=fichiers[0];
    let badge;
    if(dernier){
      badge='<span style="background:var(--green-l);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✅ Reçu le '+new Date(dernier.created_at).toLocaleDateString('fr-FR')+'</span>';
    }else if(p.optionnel){
      badge='<span style="background:#F1EFF7;color:var(--muted);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">— Le cas échéant</span>';
    }else{
      badge='<span style="background:var(--orange-l);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">⚠ Manquant</span>';
    }
    return '<div style="border-bottom:1px solid var(--line);padding:9px 2px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<span style="font-size:12.5px;font-weight:600;color:#2B2740">'+escHtml(p.label)+'</span>'
      +'<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+badge
      +'<button type="button" onclick="empOpenPieceUpload(\''+p.key+'\')" title="Importer" class="btn btn-g btn-sm"><i class="ti ti-upload"></i> Importer</button>'
      +'</span></div>'
      +(fichiers.length?'<div style="margin-top:4px">'+fichiers.map(ligneFichier).join('')+'</div>':'')
      +'</div>';
  }).join('');

  const autres=empDocsCache.filter(d=>!d.piece_key);
  const autresHtml='<div style="margin-top:14px">'
    +'<div style="font-size:12px;font-weight:700;color:#2B2740;margin-bottom:6px">Autres documents importés</div>'
    +(autres.length?autres.map(ligneFichier).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucun autre document.</div>')
    +'<button class="btn btn-g btn-sm" style="margin-top:6px" onclick="empOpenPieceUpload(\'\')"><i class="ti ti-upload"></i> Importer un document hors liste</button>'
    +'</div>';

  zone.innerHTML=checklist+autresHtml
    +'<span id="fiche-docs-input-status" style="display:block;margin-top:8px;font-size:12px;color:var(--muted)"></span>'
    +'<input type="file" id="fiche-docs-input" accept="image/*,application/pdf" multiple style="display:none" onchange="empHandleDocUpload(event)"/>';
}

let empPieceKeyEnCours='';
function empOpenPieceUpload(key){
  empPieceKeyEnCours=key||'';
  const input=document.getElementById('fiche-docs-input');
  if(input)input.click();
}
async function empHandleDocUpload(event){
  const input=event.target;
  const files=Array.from(input.files||[]);
  if(!files.length)return;
  const eid=empFicheId;
  const pieceKey=empPieceKeyEnCours||null;
  const status=document.getElementById('fiche-docs-input-status');
  for(const file of files){
    if(status)status.textContent='⏳ Envoi de '+file.name+'…';
    try{
      const ext=(file.name.split('.').pop()||'bin');
      const path=eid+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
      /* Client authentifié (référente/direction), pas le client anonyme :
         le bucket est privé et ses policies exigent un compte référent. */
      const{error}=await sb.storage.from(EMP_DOCS_BUCKET).upload(path,file);
      if(error)throw error;
      const{data:ins,error:insErr}=await sb.from('employes_documents')
        .insert({employe_id:eid,bucket:EMP_DOCS_BUCKET,path:path,filename:file.name,piece_key:pieceKey}).select().single();
      if(insErr)throw insErr;
      if(ins)empDocsCache.unshift(ins);
      empRenderDocs();
      empRenderPiecesDossier();
    }catch(e){
      console.error('[empDocs]',e.message);
      if(status)status.textContent='⚠ Erreur : '+e.message;
      return;
    }
  }
  if(status)status.textContent='✅ Ajouté';
  input.value='';
  eqToast('Document(s) importé(s) ✅');
}
async function empDocOpen(id){
  const d=empDocsCache.find(x=>String(x.id)===String(id));
  if(!d){eqToast('Fichier introuvable.',true);return;}
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(d.bucket||EMP_DOCS_BUCKET,d.path,{entite_type:'employe',entite_id:d.employe_id,libelle:d.filename});
  const{data,error}=await sb.storage.from(d.bucket||EMP_DOCS_BUCKET).createSignedUrl(d.path,EMP_DOCS_TTL);
  if(error||!data){eqToast('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'),true);return;}
  window.open(data.signedUrl,'_blank','noopener');
}
async function empDocDelete(id){
  if(!confirm('Supprimer ce document ?'))return;
  const d=empDocsCache.find(x=>String(x.id)===String(id));
  const{error}=await sb.from('employes_documents').delete().eq('id',id);
  if(error){eqToast('Erreur : '+error.message,true);return;}
  /* Le fichier lui-même est retiré du stockage : sans cela il resterait
     indéfiniment dans le bucket, hors de toute fiche. */
  if(d){
    const{error:rmErr}=await sb.storage.from(d.bucket||EMP_DOCS_BUCKET).remove([d.path]);
    if(rmErr)console.warn('[empDocs] fichier non supprimé du stockage',rmErr.message);
  }
  empDocsCache=empDocsCache.filter(x=>String(x.id)!==String(id));
  empRenderDocs();
  empRenderPiecesDossier();
}

/* ---------- DOSSIER DE PIÈCES (envoi d'un lien au/à la salarié(e)) ----------
   Même principe que le dossier de pièces famille (dossiers_pieces /
   pieces.html, cf. js/enfants.js) : un envoi = un jeton = un lien public
   (pieces-employe.html), valable EMP_PIECES_JOURS jours. Simplifié par rapport à
   la version famille : une fiche employé n'a qu'une seule adresse e-mail,
   pas de choix de destinataires. */
const EMP_PIECES_JOURS=5;
function piecesEmployeLien(token){
  return location.origin+location.pathname.replace(/[^/]*$/,'')+'pieces-employe.html?t='+token;
}
function dossierTokenEmploye(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID().replace(/-/g,'');
  return String(Date.now())+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
}

let empPiecesCache=[],empPiecesPret=false;
async function empLoadPieces(employeId){
  try{
    const{data,error}=await sb.from('dossiers_pieces_employe')
      .select('*')
      .eq('employe_id',employeId)
      .order('envoye_le',{ascending:false});
    if(error)throw error;
    empPiecesCache=data||[];
  }catch(err){
    console.warn('empLoadPieces',err);
    empPiecesCache=[];
  }
  if(String(empFicheId)!==String(employeId))return;
  empPiecesPret=true;
  empRenderPiecesDossier();
}
function empRenderPiecesDossier(){
  const box=document.getElementById('fiche-docs-dossier-box');
  if(!box)return;
  if(!empPiecesPret){box.innerHTML='';return;}
  /* Un dossier "complet" (toutes les pièces obligatoires reçues, jeton
     auto-invalidé côté serveur — cf. dossier-pieces-employe) n'est plus actif
     non plus : on propose d'envoyer un nouveau lien si besoin, sans reprendre
     l'ancien qui ne fonctionne plus. */
  const actif=empPiecesCache.find(d=>d.statut!=='annule'&&d.statut!=='complet'&&new Date(d.expire_le)>new Date());
  const e=cacheEmployes.find(x=>String(x.id)===String(empFicheId));
  const email=e&&e.email;

  const cadre=contenu=>'<div style="background:#F7F6FC;border:1px solid var(--line);border-radius:14px;padding:13px 15px;margin-bottom:12px">'
    +'<div style="font-weight:700;font-size:13.5px;color:var(--violet);margin-bottom:7px">'
    +'<i class="ti ti-cloud-upload"></i> Dépôt en ligne par le/la salarié(e)</div>'+contenu+'</div>';

  if(!actif){
    if(!email){
      box.innerHTML=cadre('<p style="font-size:12.5px;color:var(--muted);margin:0;line-height:1.6">'
        +"Aucune adresse e-mail sur cette fiche. Renseignez-en une ci-dessus pour pouvoir envoyer le lien.</p>");
      return;
    }
    box.innerHTML=cadre(
      '<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.6">Envoie à '+escHtml(email)
      +' un lien personnel pour déposer en ligne les pièces ci-dessous. Valable '+EMP_PIECES_JOURS+' jours.</p>'
      +'<button type="button" class="btn btn-s btn-sm" onclick="empConfirmerEnvoiPieces()"><i class="ti ti-send"></i> Envoyer le lien de dépôt</button>'
    );
    return;
  }

  const requis=PIECES_EMBAUCHE.filter(p=>!p.optionnel);
  const recus=requis.filter(p=>empPiecesPourCle(p.key).length).length;
  const badge=recus===requis.length
    ?'<span style="background:var(--green-l);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">✅ Complet</span>'
    :'<span style="background:var(--orange-l);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">🕓 En attente</span>';

  box.innerHTML=cadre(
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'+badge
    +'<span style="font-size:12px;color:var(--muted)">envoyé le '+new Date(actif.envoye_le).toLocaleDateString('fr-FR')
    +' · expire le '+new Date(actif.expire_le).toLocaleDateString('fr-FR')
    +(actif.relances?' · '+actif.relances+' relance'+(actif.relances>1?'s':''):'')+'</span></div>'
    +'<div style="font-size:12px;color:var(--muted);margin-bottom:9px"><i class="ti ti-mail"></i> '+escHtml(actif.email||'')+'</div>'
    +'<div style="font-size:12.5px;color:var(--muted);margin-bottom:9px">'+recus+' pièce'+(recus>1?'s':'')+' reçue'+(recus>1?'s':'')
    +' sur '+requis.length+' demandées (hors pièces non concernées)</div>'
    +'<div style="display:flex;gap:7px;flex-wrap:wrap">'
    +'<button type="button" class="btn btn-g btn-sm" onclick="empCopierLienPieces(\''+actif.id+'\')"><i class="ti ti-link"></i> Copier le lien</button>'
    +(PartageLien.disponible()?'<button type="button" class="btn btn-g btn-sm" onclick="empPartagerLienPieces(\''+actif.id+'\')"><i class="ti ti-share"></i> Partager…</button>':'')
    +'<button type="button" class="btn btn-g btn-sm" onclick="empRelancerPieces(\''+actif.id+'\')"><i class="ti ti-bell"></i> Relancer</button>'
    +'<button type="button" class="btn btn-g btn-sm" style="color:var(--red)" onclick="empAnnulerPieces(\''+actif.id+'\')"><i class="ti ti-x"></i> Annuler</button>'
    +'</div>'
  );
}
async function empConfirmerEnvoiPieces(){
  const e=cacheEmployes.find(x=>String(x.id)===String(empFicheId));
  if(!e||!e.email){eqToast('Aucune adresse e-mail sur cette fiche.',true);return;}
  const token=dossierTokenEmploye();
  const expire=new Date(Date.now()+EMP_PIECES_JOURS*86400000).toISOString();
  const{data:saved,error}=await sb.from('dossiers_pieces_employe').insert({
    employe_id:e.id,token,email:e.email,statut:'envoye',expire_le:expire,created_by:currentUser?currentUser.id:null
  }).select().single();
  if(error){eqToast('Impossible de créer le dossier : '+error.message,true);return;}
  const{ok,data}=await eqCallFn('envoyer-dossier-pieces-employe',{dossier_id:saved.id,relance:false,lien:piecesEmployeLien(token),expediteur:currentProfile?.name});
  empPiecesCache.unshift(saved);
  empRenderPiecesDossier();
  if(ok)eqToast('Lien envoyé à '+e.email+' ✅');
  else eqToast('Dossier créé, mais l\'e-mail n\'est pas parti — utilisez « Copier le lien ».'+(data&&data.error?' ('+data.error+')':''),true);
}
async function empRelancerPieces(id){
  const d=empPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Renvoyer le lien à '+d.email+' ?'))return;
  const{ok,data}=await eqCallFn('envoyer-dossier-pieces-employe',{dossier_id:d.id,relance:true,lien:piecesEmployeLien(d.token),expediteur:currentProfile?.name});
  if(!ok){eqToast('La relance n\'est pas partie.'+(data&&data.error?' ('+data.error+')':''),true);return;}
  d.relances=(d.relances||0)+1;
  empRenderPiecesDossier();
  eqToast('Relance envoyée ✅');
}
function empCopierLienPieces(id){
  const d=empPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  const url=piecesEmployeLien(d.token);
  navigator.clipboard.writeText(url).then(
    ()=>eqToast('Lien copié — à transmettre par SMS si besoin.'),
    ()=>prompt('Copiez ce lien :',url)
  );
}
function empPartagerLienPieces(id){
  const d=empPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  PartageLien.partager(piecesEmployeLien(d.token),{titre:'Pièces à fournir',
    texte:'Bonjour, voici le lien pour déposer vos pièces :'})
    .then(r=>{if(r==='copie')eqToast('Partage indisponible — lien copié.');});
}

async function empAnnulerPieces(id){
  const d=empPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Annuler ce dossier ?\n\nLe lien déjà envoyé cessera immédiatement de fonctionner. Les pièces déjà déposées sont conservées.'))return;
  const{error}=await sb.from('dossiers_pieces_employe').update({statut:'annule'}).eq('id',id);
  if(error){eqToast('Annulation impossible : '+error.message,true);return;}
  d.statut='annule';
  empRenderPiecesDossier();
  eqToast('Dossier annulé — le lien ne fonctionne plus.');
}

/* ---------- DOCUMENTS SUR SUPPORT EXTERNE (registre papier/coffre-fort) ----------
   Table documents_externes (voir sql/documents_externes.sql) : ne stocke
   aucun fichier, juste la trace qu'une pièce existe et où elle est
   physiquement conservée — utile pour les pièces qu'on ne numérise pas (ex.
   extrait de casier judiciaire, à ne pas conserver après vérification). Le
   délai de conservation est calculé côté base, selon la catégorie choisie.
   Même module que côté enfant (js/enfants.js), adapté au style de cette page. */
const DOC_EXT_SUPPORTS={papier:'Papier','coffre-fort':'Coffre-fort',classeur:'Classeur',autre:'Autre'};
const DOC_EXT_CATEGORIES={identite:'Identité',sante:'Santé',comptable:'Comptable',rh:'RH',autre:'Autre'};

let empDocExtCache=[];
async function empLoadDocExt(employeId){
  try{
    const{data,error}=await sb.from('documents_externes')
      .select('*')
      .eq('entite_type','employe')
      .eq('entite_id',employeId)
      .order('created_at',{ascending:false});
    if(error)throw error;
    empDocExtCache=data||[];
  }catch(err){
    console.warn('empLoadDocExt',err);
    empDocExtCache=[];
  }
  if(String(empFicheId)!==String(employeId))return;
  empRenderDocExt();
}
function empRenderDocExt(){
  const zone=document.getElementById('ficheDocExtZone');
  if(!zone)return;
  const ligne=d=>{
    const detruit=d.detruit_le
      ?'<span style="background:var(--violet-l);color:var(--violet);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Détruit le '+new Date(d.detruit_le).toLocaleDateString('fr-FR')+'</span>'
      :'<button type="button" class="btn btn-g btn-sm" onclick="empDocExtDetruire(\''+d.id+'\')" title="Marquer cette pièce comme détruite/restituée"><i class="ti ti-flame"></i> Marquer détruit</button>';
    return '<div style="border-bottom:1px solid var(--line);padding:9px 2px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<div>'
      +'<span style="font-size:12.5px;font-weight:600;color:#2B2740">'+escHtml(d.libelle)+'</span> '
      +'<span style="font-size:11px;color:var(--muted)">'+(DOC_EXT_SUPPORTS[d.support]||d.support)+' · '+(DOC_EXT_CATEGORIES[d.categorie]||d.categorie)+(d.lieu_conservation?' · '+escHtml(d.lieu_conservation):'')+'</span>'
      +(d.date_destruction_prevue&&!d.detruit_le?'<div style="font-size:11px;color:var(--muted)">Conservation jusqu\'au '+new Date(d.date_destruction_prevue).toLocaleDateString('fr-FR')+'</div>':'')
      +'</div>'
      +'<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+detruit
      +'<button onclick="empDocExtDelete(\''+d.id+'\')" title="Supprimer cette entrée du registre" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px"><i class="ti ti-trash"></i></button>'
      +'</span></div></div>';
  };
  zone.innerHTML=
      (empDocExtCache.length
        ? empDocExtCache.map(ligne).join('')
        : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucune pièce enregistrée sur support externe.</div>')
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">'
      + '<input id="docExtLibelle" placeholder="Libellé (ex. extrait de casier judiciaire)" style="flex:2;min-width:180px;font-size:12px;padding:6px 8px">'
      + '<select id="docExtSupport" style="flex:1;min-width:110px;font-size:12px;padding:6px 8px">'
        + Object.keys(DOC_EXT_SUPPORTS).map(k=>'<option value="'+k+'">'+DOC_EXT_SUPPORTS[k]+'</option>').join('')
      + '</select>'
      + '<select id="docExtCategorie" style="flex:1;min-width:110px;font-size:12px;padding:6px 8px">'
        + Object.keys(DOC_EXT_CATEGORIES).map(k=>'<option value="'+k+'">'+DOC_EXT_CATEGORIES[k]+'</option>').join('')
      + '</select>'
      + '<input id="docExtLieu" placeholder="Lieu de conservation (ex. classeur RH, tiroir 2)" style="flex:2;min-width:180px;font-size:12px;padding:6px 8px">'
      + '<button type="button" class="btn btn-s btn-sm" onclick="empDocExtAdd()"><i class="ti ti-plus"></i> Ajouter</button>'
    + '</div>';
}
async function empDocExtAdd(){
  const eid=empFicheId;
  const libelle=(document.getElementById('docExtLibelle').value||'').trim();
  if(!libelle){document.getElementById('docExtLibelle').focus();return;}
  const row={
    entite_type:'employe',
    entite_id:eid,
    libelle,
    support:document.getElementById('docExtSupport').value||'papier',
    categorie:document.getElementById('docExtCategorie').value||'autre',
    lieu_conservation:(document.getElementById('docExtLieu').value||'').trim()||null,
    created_by:currentUser?currentUser.id:null
  };
  const{data,error}=await sb.from('documents_externes').insert(row).select().single();
  if(error){eqToast('Erreur lors de l\'ajout : '+error.message,true);return;}
  empDocExtCache.unshift(data);
  empRenderDocExt();
  eqToast('Pièce ajoutée au registre.');
}
async function empDocExtDetruire(id){
  if(!confirm('Marquer cette pièce comme détruite / restituée aujourd\'hui ?'))return;
  const row={detruit_le:todayISO(),detruit_par:currentUser?currentUser.id:null};
  const{error}=await sb.from('documents_externes').update(row).eq('id',id);
  if(error){eqToast('Erreur : '+error.message,true);return;}
  const d=empDocExtCache.find(x=>String(x.id)===String(id));
  if(d)Object.assign(d,row);
  empRenderDocExt();
  eqToast('Pièce marquée détruite.');
}
async function empDocExtDelete(id){
  if(!confirm('Supprimer cette entrée du registre ? (la pièce physique elle-même n\'est pas concernée, seule la trace ici disparaît)'))return;
  const{error}=await sb.from('documents_externes').delete().eq('id',id);
  if(error){eqToast('Erreur : '+error.message,true);return;}
  empDocExtCache=empDocExtCache.filter(x=>String(x.id)!==String(id));
  empRenderDocExt();
  eqToast('Entrée supprimée.');
}


/* ---------- VISITES MÉDICALES OBLIGATOIRES (médecine du travail — Odalia) ----------
   Table employes_visites_medicales (sql/employes_visites_medicales.sql), calcul
   d'échéance dans js/visites-medicales.js. On ne garde que la date, l'avis et
   la prochaine échéance, jamais d'information médicale. */
let VISITES_PAR_EMP={},VISITES_CHARGEES=false;   // employe_id -> visites (pour les badges de la liste)
let vmCache=[],vmEditId='';

async function vmChargerListe(){
  VISITES_PAR_EMP={};VISITES_CHARGEES=false;
  if(!cacheEmployes.length)return;
  const{data,error}=await sb.from('employes_visites_medicales').select('*').in('employe_id',cacheEmployes.map(x=>x.id));
  if(error){console.warn('vmChargerListe',error);return;}   // table pas encore créée : pas de badge
  VISITES_CHARGEES=true;
  (data||[]).forEach(v=>{(VISITES_PAR_EMP[v.employe_id]=VISITES_PAR_EMP[v.employe_id]||[]).push(v);});
  renderEmployes();
}
const VM_COULEURS={retard:['var(--red)','#FDECEC'],bientot:['var(--orange)','var(--orange-l)'],rdv:['var(--violet)','var(--violet-l)'],ok:['var(--green)','var(--green-bg,#E6F4EA)'],inconnu:['var(--muted)','#F1F0F5']};
function vmBadgeListe(e){
  if(estArchive(e)||estSorti(e)||!VISITES_CHARGEES)return'';
  const s=vismedEtat(e,VISITES_PAR_EMP[e.id]||[]);
  if(s.niveau==='ok'||s.niveau==='inconnu')return'';
  const c=VM_COULEURS[s.niveau];
  return'<span class="badge off" style="background:'+c[1]+';color:'+c[0]+'" title="'+escHtml(s.label)+'"><i class="ti ti-stethoscope"></i> Visite médicale'+(s.niveau==='retard'?' en retard':(s.niveau==='rdv'?' : RDV':' à planifier'))+'</span>';
}

async function vmCharger(employeId){
  vmEditId='';
  const{data,error}=await sb.from('employes_visites_medicales').select('*').eq('employe_id',employeId)
    .order('date_visite',{ascending:false,nullsFirst:true});
  vmCache=error?[]:(data||[]);
  if(error)console.warn('vmCharger',error);
  if(String(empFicheId)!==String(employeId)){return;}
  vmRendre(error);
}
function vmRendre(erreurTable){
  const zone=document.getElementById('ficheVisitesZone');
  if(!zone)return;
  const e=cacheEmployes.find(x=>String(x.id)===String(empFicheId));
  const s=vismedEtat(e,vmCache);
  const c=VM_COULEURS[s.niveau];
  const bandeau='<div style="background:'+c[1]+';border-left:4px solid '+c[0]+';border-radius:0 10px 10px 0;padding:9px 13px;font-size:12.5px;color:'+c[0]+';font-weight:600;margin-bottom:8px"><i class="ti ti-stethoscope"></i> '+escHtml(s.label)+'</div>';
  const ligne=v=>{
    const fait=!!v.date_visite;
    return'<div style="border-bottom:1px solid var(--line);padding:8px 2px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">'
      +'<div style="font-size:12.5px"><strong>'+escHtml(VISMED_TYPES[v.type]||v.type)+'</strong> · '+escHtml(v.organisme||VISMED_ORGANISME)
      +'<div style="font-size:11.5px;color:var(--muted)">'
      +(fait?'Effectuée le '+vismedDateFr(v.date_visite):'RDV le '+vismedDateFr(v.rdv_le)+(v.rdv_heure?' à '+String(v.rdv_heure).slice(0,5).replace(':','h'):''))
      +(v.avis?' · '+escHtml(VISMED_AVIS[v.avis]):'')
      +(fait&&v.prochaine_le?' · prochaine avant le '+vismedDateFr(v.prochaine_le):'')
      +(v.observations?' · '+escHtml(v.observations):'')+'</div></div>'
      +'<span style="display:flex;gap:6px">'
      +(v.piece_path?'<button type="button" class="btn btn-g btn-sm" onclick="vmOuvrirPiece(\''+v.id+'\')" title="'+escHtml(v.piece_nom||'Compte rendu')+'"><i class="ti ti-file-text"></i> Compte rendu</button>':'')
      +'<button type="button" class="btn btn-g btn-sm" onclick="vmModifier(\''+v.id+'\')">'+(fait?'<i class="ti ti-edit"></i>':'<i class="ti ti-check"></i> Renseigner la visite')+'</button>'
      +'<button type="button" onclick="vmSupprimer(\''+v.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px"><i class="ti ti-trash"></i></button>'
      +'</span></div>';
  };
  const st='font-size:12px;padding:6px 8px';
  const edit=vmCache.find(v=>v.id===vmEditId)||{};
  zone.innerHTML=(erreurTable?'<div style="color:var(--red);font-size:12px">Table non disponible : appliquer sql/employes_visites_medicales.sql sur Supabase.</div>':bandeau)
    +(vmCache.length?vmCache.map(ligne).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucune visite enregistrée.</div>')
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;align-items:flex-end">'
    +'<label style="flex:2;min-width:160px;font-size:11px;color:var(--muted)">Type<select id="vmType" style="width:100%;'+st+'">'+Object.keys(VISMED_TYPES).map(k=>'<option value="'+k+'"'+((edit.type||(vmCache.some(v=>v.date_visite)?'periodique':'embauche'))===k?' selected':'')+'>'+escHtml(VISMED_TYPES[k])+'</option>').join('')+'</select></label>'
    +'<label style="flex:1;min-width:120px;font-size:11px;color:var(--muted)">Date de la visite<input id="vmDate" type="date" min="2000-01-01" max="2100-12-31" value="'+escHtml(edit.date_visite||'')+'" onchange="vmProposerProchaine()" style="width:100%;'+st+'"></label>'
    +'<label style="flex:1;min-width:120px;font-size:11px;color:var(--muted)">RDV prévu le<input id="vmRdv" type="date" value="'+escHtml(edit.rdv_le||'')+'" style="width:100%;'+st+'"></label>'
    +'<label style="flex:0 0 100px;font-size:11px;color:var(--muted)">Heure du RDV<input id="vmHeure" type="time" value="'+escHtml(edit.rdv_heure?String(edit.rdv_heure).slice(0,5):'')+'" style="width:100%;'+st+'"></label>'
    +'<label style="flex:1;min-width:120px;font-size:11px;color:var(--muted)">Prochaine avant le<input id="vmProchaine" type="date" min="2000-01-01" max="2100-12-31" oninput="this.dataset.auto=\'\'" value="'+escHtml(edit.prochaine_le||'')+'" style="width:100%;'+st+'"></label>'
    +'<label style="flex:1;min-width:140px;font-size:11px;color:var(--muted)">Avis<select id="vmAvis" style="width:100%;'+st+'"><option value="">—</option>'+Object.keys(VISMED_AVIS).map(k=>'<option value="'+k+'"'+(edit.avis===k?' selected':'')+'>'+escHtml(VISMED_AVIS[k])+'</option>').join('')+'</select></label>'
    +'<input id="vmObs" placeholder="Observation (facultatif, sans donnée médicale)" value="'+escHtml(edit.observations||'')+'" style="flex:3;min-width:180px;'+st+'">'
    +'<label style="flex:3;min-width:200px;font-size:11px;color:var(--muted)">Compte rendu d\'Odalia (PDF ou photo)'+(edit.piece_path?' — déjà joint : '+escHtml(edit.piece_nom||'fichier')+', un nouveau fichier le remplace':'')+'<input id="vmFichier" type="file" accept=".pdf,image/*" style="width:100%;'+st+'"></label>'
    +'<div id="vmErr" style="flex-basis:100%;color:var(--red);font-size:12px;font-weight:600"></div>'
    +'<button type="button" class="btn btn-s btn-sm" onclick="vmEnregistrer()"><i class="ti ti-'+(vmEditId?'device-floppy':'plus')+'"></i> '+(vmEditId?'Enregistrer':'Ajouter')+'</button>'
    +(vmEditId?'<button type="button" class="btn btn-g btn-sm" onclick="vmEditId=\'\';vmRendre()">Annuler</button>':'')
    +'</div>';
}
function vmAnneeOk(iso){const a=parseInt(String(iso||'').slice(0,4),10);return a>=2000&&a<=2100;}
/* La date de prochaine visite est proposée (+5 ans) tant que la personne ne l'a pas
   saisie elle-même ; ignorée tant que l'année tapée au clavier n'est pas plausible
   (sinon « 0002 » donnait « 0007 » et la valeur restait ensuite figée). */
function vmProposerProchaine(){
  const d=eqVal('vmDate'),p=document.getElementById('vmProchaine');
  if(!d||!p||!vmAnneeOk(d))return;
  if(!p.value||p.dataset.auto==='1'){p.value=vismedAjout(d,VISMED_PERIODE_ANS);p.dataset.auto='1';}
}
function vmModifier(id){vmEditId=id;vmRendre();const el=document.getElementById('vmDate');if(el)el.focus();}
function vmErreur(m){
  const el=document.getElementById('vmErr');if(el)el.textContent=m||'';
  if(m)eqToast(m,true);
}
/* Renvoie true si la visite est enregistrée (appelée aussi par saveFiche). */
async function vmEnregistrer(){
  vmErreur('');
  const eid=empFicheId;
  const date=eqVal('vmDate')||null,rdv=eqVal('vmRdv')||null;
  if(!date&&!rdv){vmErreur('Renseignez la date de la visite ou la date du RDV.');return false;}
  const proch=eqVal('vmProchaine')||null;
  if([date,rdv,proch].some(x=>x&&!vmAnneeOk(x))){vmErreur('Une date a une année incorrecte (vérifiez les 4 chiffres de l\'année).');return false;}
  const row={
    employe_id:eid,type:eqVal('vmType')||'periodique',organisme:VISMED_ORGANISME,
    date_visite:date,rdv_le:date?null:rdv,rdv_heure:date?null:(rdv&&eqVal('vmHeure')||null),
    prochaine_le:date?(proch||vismedAjout(date,VISMED_PERIODE_ANS)):null,
    avis:date?(eqVal('vmAvis')||null):null,observations:eqVal('vmObs')||null
  };
  const fichier=(document.getElementById('vmFichier')||{}).files&&document.getElementById('vmFichier').files[0];
  const ancien=vmEditId?vmCache.find(v=>v.id===vmEditId):null;
  let nouveauChemin=null;
  if(fichier){
    const ext=(fichier.name.split('.').pop()||'bin').toLowerCase();
    nouveauChemin=eid+'/visites-medicales/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
    const{error:upErr}=await sb.storage.from(EMP_DOCS_BUCKET).upload(nouveauChemin,fichier);
    if(upErr){vmErreur('Envoi du fichier impossible : '+upErr.message);return false;}
    row.piece_bucket=EMP_DOCS_BUCKET;row.piece_path=nouveauChemin;row.piece_nom=fichier.name;
  }
  const{error}=vmEditId
    ?await sb.from('employes_visites_medicales').update(row).eq('id',vmEditId)
    :await sb.from('employes_visites_medicales').insert(row);
  if(error){
    if(nouveauChemin)sb.storage.from(EMP_DOCS_BUCKET).remove([nouveauChemin]);
    vmErreur('Enregistrement impossible : '+error.message);return false;
  }
  if(nouveauChemin&&ancien&&ancien.piece_path)sb.storage.from(ancien.piece_bucket||EMP_DOCS_BUCKET).remove([ancien.piece_path]);
  eqToast('Visite médicale enregistrée.');
  await vmCharger(eid);
  VISITES_PAR_EMP[eid]=vmCache;renderEmployes();
  return true;
}
async function vmSupprimer(id){
  if(!confirm('Supprimer cette visite du suivi (et son compte rendu joint) ?'))return;
  const v=vmCache.find(x=>x.id===id);
  const{error}=await sb.from('employes_visites_medicales').delete().eq('id',id);
  if(error){eqToast('Suppression impossible : '+error.message,true);return;}
  if(v&&v.piece_path)sb.storage.from(v.piece_bucket||EMP_DOCS_BUCKET).remove([v.piece_path]);
  await vmCharger(empFicheId);
  VISITES_PAR_EMP[empFicheId]=vmCache;renderEmployes();
}
async function vmOuvrirPiece(id){
  const v=vmCache.find(x=>x.id===id);
  if(!v||!v.piece_path){eqToast('Fichier introuvable.',true);return;}
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(v.piece_bucket||EMP_DOCS_BUCKET,v.piece_path,{entite_type:'employe',entite_id:v.employe_id,libelle:v.piece_nom||'Compte rendu de visite médicale'});
  const{data,error}=await sb.storage.from(v.piece_bucket||EMP_DOCS_BUCKET).createSignedUrl(v.piece_path,EMP_DOCS_TTL);
  if(error||!data){eqToast('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'),true);return;}
  window.open(data.signedUrl,'_blank','noopener');
}
