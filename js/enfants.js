

/* ===================== MODULE ENFANTS (dossier central) ===================== */
/* Liste des enfants (référente = sa crèche, direction = toutes), fiche à onglets
   Identité + Documents. Les documents proviennent de documents_reponses filtrées
   par enfant_id. Le RLS garantit que la référente ne voit que sa crèche. */

let enfFicheId = null;
let enfDocsCache = [];
let enfShowIncompleteOnly = false;

// Une fiche est "incomplète" quand la date de naissance ou les allergies n'ont jamais
// été renseignées (allergies===null/undefined = jamais touché ; '' = vérifié, rien à signaler).
// C'est le cas par défaut des enfants créés automatiquement lors de l'import du planning PDF
// (Gertrude n'exporte que le planning, jamais la fiche d'identité complète).
function enfIsIncomplete(e){
  return !e.dob || e.allergies===null || e.allergies===undefined;
}

// Fiches fantômes créées par le bug d'import PDF corrigé ci-dessus (la ligne « Totaux »
// du récapitulatif quotidien était lue comme un prénom suivi de ses chiffres).
function enfIsBogusTotaux(e){
  return /^totaux$/i.test((e.prenom||'').trim());
}

async function enfCleanupTotauxFaux(){
  const bogus = cacheEnfants.filter(enfIsBogusTotaux);
  if(!bogus.length){showBanner('Aucune fiche « Totaux » à nettoyer.');return;}
  if(!confirm('Supprimer '+bogus.length+' fiche(s) enfant erronée(s), créée(s) par un bug de l’import PDF (ex. « '+(bogus[0].prenom||'')+' ») ? Les présences liées seront aussi supprimées.\n\nCette action est irréversible.'))return;
  for(const e of bogus){
    await sb.from('presences').delete().eq('enfant_id',e.id);
    await dbDelete('enfants',e.id);
  }
  const bogusIds=new Set(bogus.map(e=>e.id));
  cacheEnfants=cacheEnfants.filter(e=>!bogusIds.has(e.id));
  showBanner(bogus.length+' fiche(s) supprimée(s) ✅');
  renderPresence();
  if(typeof enfRender==='function')enfRender();
}

function enfToggleIncomplete(){
  enfShowIncompleteOnly = !enfShowIncompleteOnly;
  const btn=document.getElementById('enf-incomplete-toggle');
  if(btn){btn.style.background = enfShowIncompleteOnly ? '#fdf1de' : '';btn.style.borderColor = enfShowIncompleteOnly ? '#e8a33d' : '';}
  enfRender();
}

function enfInit(){
  // remplir le sélecteur crèche (direction)
  const sel = document.getElementById('enf-creche-select');
  if(sel && sel.options.length <= 1){
    sel.innerHTML = '<option value="">Toutes les crèches</option>' +
      cacheCreches.map(c=>'<option value="'+c.id+'">'+escHtml(c.name)+'</option>').join('');
  }
  enfRender();
}

function enfGetListe(opts){
  opts = opts || {};
  let list = cacheEnfants.slice();
  // référente : sa crèche uniquement
  if(!isDirection && currentProfile && currentProfile.creche_id){
    list = list.filter(e=>e.creche_id===currentProfile.creche_id);
  } else {
    // direction : filtre optionnel du sélecteur
    const cid = (document.getElementById('enf-creche-select')||{}).value || '';
    if(cid) list = list.filter(e=>e.creche_id===cid);
  }
  if(!opts.skipIncompleteFilter && enfShowIncompleteOnly){
    list = list.filter(enfIsIncomplete);
  }
  const q = ((document.getElementById('enf-search')||{}).value || '').trim().toLowerCase();
  if(q){
    list = list.filter(e=>((e.prenom||'')+' '+(e.nom||'')).toLowerCase().includes(q));
  }
  return list.sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr',{sensitivity:'base'})
    ||(a.nom||'').localeCompare(b.nom||'','fr',{sensitivity:'base'}));
}

function enfRender(){
  const el = document.getElementById('enf-list');
  if(!el) return;
  const enfants = enfGetListe();
  // Badge de comptage sur le bouton, calculé sur le périmètre crèche mais avant filtre incomplet/recherche.
  const countBadge = document.getElementById('enf-incomplete-count');
  if(countBadge){
    const n = enfGetListe({skipIncompleteFilter:true}).filter(enfIsIncomplete).length;
    countBadge.textContent = n;
    countBadge.style.display = n>0 ? '' : 'none';
  }
  // Bouton de nettoyage des fausses fiches « Totaux » (toutes crèches confondues, direction only).
  const cleanupBtn = document.getElementById('enf-cleanup-totaux-btn');
  if(cleanupBtn){
    const nBogus = cacheEnfants.filter(enfIsBogusTotaux).length;
    cleanupBtn.style.display = (isDirection && nBogus>0) ? 'flex' : 'none';
    const cleanupCount = document.getElementById('enf-cleanup-totaux-count');
    if(cleanupCount){cleanupCount.textContent = nBogus;cleanupCount.style.display = nBogus>0 ? '' : 'none';}
  }
  if(!enfants.length){
    el.innerHTML = '<div class="empty-state"><i class="ti ti-mood-kid"></i><p>'+(enfShowIncompleteOnly?'Aucune fiche incomplète 🎉':'Aucun enfant.')+'</p></div>';
    return;
  }
  el.innerHTML = enfants.map(e=>{
    const creche = cacheCreches.find(c=>c.id===e.creche_id);
    const grp = e.dob ? groupeFromDob(e.dob) : (e.groupe||'');
    const incomplete = enfIsIncomplete(e);
    const warn = incomplete ? '<span title="Fiche incomplète : date de naissance ou allergies non renseignées" style="color:#e8a33d;font-size:15px;flex-shrink:0"><i class="ti ti-alert-triangle"></i></span>' : '';
    return '<button onclick="enfOpenFiche(\''+e.id+'\')" style="width:100%;text-align:left;background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;box-shadow:0 1px 4px rgba(61,53,128,0.07)">'
      + '<div style="display:flex;align-items:center;gap:12px;min-width:0">'
      + '<span style="width:36px;height:36px;flex-shrink:0;border-radius:50%;background:var(--koala-light);color:var(--koala);display:inline-flex;align-items:center;justify-content:center;font-size:18px"><i class="ti ti-mood-kid"></i></span>'
      + '<div style="min-width:0">'
      + '<div style="font-weight:700;color:var(--koala-dark);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml((e.prenom||'')+' '+(e.nom||''))+'</div>'
      + '<div style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(creche?escHtml(creche.name):'—')+(grp?' · '+escHtml(grp):'')+'</div>'
      + '</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'+warn+'<i class="ti ti-chevron-right" style="color:var(--muted);font-size:18px"></i></div>'
      + '</button>';
  }).join('');
}

/* Relit une fiche enfant directement en base et met le cache à jour.

   Le cache est rempli à la connexion puis rafraîchi périodiquement : entre deux
   rafraîchissements, ouvrir une fiche pouvait afficher — et surtout réenregistrer —
   des valeurs vieilles de plusieurs minutes, écrasant la modification faite depuis
   un autre poste. Une fiche qu'on ouvre est donc toujours relue au serveur : c'est
   une seule ligne, le coût est négligeable. */
async function enfRelire(id){
  try{
    const{data,error}=await sb.from('enfants').select('*').eq('id',id).maybeSingle();
    if(error||!data)return null;
    const e=cacheEnfants.find(function(x){return String(x.id)===String(id);});
    if(e){Object.assign(e,data);return e;}
    cacheEnfants.push(data);
    return data;
  }catch(err){console.warn('[Enfants] relecture',err);return null;}
}

async function enfOpenFiche(id){
  await enfRelire(id);
  const e = cacheEnfants.find(x=>String(x.id)===String(id));
  if(!e) return;
  enfFicheId = e.id;
  enfParentsCache = [];
  enfDossiersCache = [];
  enfDossierPret = false;
  enfAdminDocsCache = [];
  enfPiecesCache = [];
  enfPiecesPret = false;
  document.getElementById('enf-fiche-title').innerHTML = '<i class="ti ti-mood-kid"></i> '+escHtml((e.prenom||'')+' '+(e.nom||''));
  // onglet identité par défaut
  document.querySelectorAll('#modal-enf-fiche-wrap .module-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('enf-fiche-identite').classList.add('active');
  document.getElementById('enf-fiche-contrat').classList.remove('active');
  document.getElementById('enf-fiche-documents').classList.remove('active');
  enfRenderIdentite();
  document.getElementById('enf-fiche-parents').innerHTML = '<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
  enfLoadParents(e.id);
  document.getElementById('enf-fiche-contrat').innerHTML = '<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
  enfLoadContrats(e.id);
  document.getElementById('enf-docs-list').innerHTML = '<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
  document.getElementById('enf-dossier-box').innerHTML = '';
  document.getElementById('enf-pieces-dossier-box').innerHTML = '';
  document.getElementById('enf-admin-docs-zone').innerHTML = '';
  document.getElementById('enf-fiche-sanitaire-zone').innerHTML = '';
  document.getElementById('enf-carnet-zone').innerHTML = '';
  document.getElementById('modal-enf-fiche-wrap').classList.add('open');
  // charger les documents et le dossier famille en arrière-plan
  enfLoadDocs(e.id);
  enfLoadDossier(e.id);
  enfLoadAdminDocs(e.id);
  enfLoadPieces(e.id);
  enfLoadCarnet(e.id);
}

const ENF_FICHE_TABS = ['identite','parents','contrat','documents'];

/* btn est facultatif : sans lui, on retrouve l'onglet par son data-enftab.
   Se reperer a l'index dans la liste des boutons casse des qu'on en ajoute un. */
function enfFicheTab(tab, btn){
  document.querySelectorAll('#modal-enf-fiche-wrap .module-tab').forEach(b=>b.classList.remove('active'));
  const cible = btn || document.querySelector('#modal-enf-fiche-wrap .module-tab[data-enftab="'+tab+'"]');
  if(cible) cible.classList.add('active');
  ENF_FICHE_TABS.forEach(t=>{
    const el=document.getElementById('enf-fiche-'+t);
    if(el) el.classList.toggle('active',t===tab);
  });
}


/* Ligne « Repas » de l'onglet Identité : le code tel qu'il partira sur la feuille
   hebdomadaire et le bon traiteur, en précisant s'il est forcé ou déduit de l'âge. */
function enfRepasFicheLigne(e){
  const code=enfRepasCode(e);
  if(!code)return'<span style="color:var(--red)">— date de naissance manquante</span>';
  const auto=enfRepasBaseAuto(e);
  const forcee=e.repas_base||'';
  let s='<span style="display:inline-block;background:'+(e.regime_repas?'var(--orange-light)':'var(--koala-light)')
    +';color:'+(e.regime_repas?'var(--orange-dark)':'var(--koala)')
    +';border-radius:6px;padding:1px 7px;font-weight:800;margin-right:6px">'+escHtml(code)+'</span>'+escHtml(repasLabel(code)||'');
  if(forcee&&auto&&forcee!==auto)s+='<div style="font-size:11px;color:var(--orange-dark);font-weight:400">forcé — l’âge donnerait '+escHtml(auto)+'</div>';
  else if(!forcee)s+='<div style="font-size:11px;color:var(--muted);font-weight:400">suit l’âge</div>';
  return s;
}

/* Ligne « Goûter » de l'onglet Identité. Elle est toujours affichée, même quand le
   goûter suit le repas : c'est une information que la référente doit pouvoir lire
   sans ouvrir le formulaire de modification. */
function enfGouterFicheLigne(e){
  const base=e.repas_base||enfRepasBaseAuto(e);
  if(!base)return'<span style="color:var(--muted)">—</span>';
  if(base==='BIB')return'<span style="color:var(--muted)">aucun (biberon)</span>';
  const g=enfGouterLigne(e);
  if(!g)return'<span style="color:var(--muted)">aucun (repas légumes sans protéines)</span>';
  const forcee=e.gouter_base||'';
  const auto=enfGouterAuto(e);
  const lbl=function(v){return v==='gbb'?'bébé':'grand';};
  let s='<span style="display:inline-block;background:'+(forcee?'var(--orange-light)':'var(--koala-light)')
    +';color:'+(forcee?'var(--orange-dark)':'var(--koala)')
    +';border-radius:6px;padding:1px 7px;font-weight:800">Goûter '+lbl(g)+'</span>';
  if(forcee&&auto&&forcee!==auto)s+='<div style="font-size:11px;color:var(--orange-dark);font-weight:400">forcé — le repas donnerait '+lbl(auto)+'</div>';
  else if(forcee)s+='<div style="font-size:11px;color:var(--orange-dark);font-weight:400">forcé</div>';
  else s+='<div style="font-size:11px;color:var(--muted);font-weight:400">suit le repas</div>';
  return s;
}

function enfRenderIdentite(){
  const e = cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  const box = document.getElementById('enf-fiche-identite');
  if(!e || !box) return;
  const creche = cacheCreches.find(c=>c.id===e.creche_id);
  const grp = e.dob ? groupeFromDob(e.dob) : (e.groupe||'');
  const row = (lab,val)=>'<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 2px;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:13px">'+lab+'</span><span style="font-weight:600;font-size:13px;text-align:right">'+(val||'—')+'</span></div>';
  box.innerHTML =
      row('Prénom', escHtml(e.prenom||''))
    + row('Nom', escHtml(e.nom||''))
    + row('Date de naissance', e.dob ? escHtml(vacFmtDate(e.dob)) : '')
    + row('Groupe', escHtml(grp))
    + row('Crèche', creche?escHtml(creche.name):'')
    + row('Allergies', escHtml(e.allergies||''))
    + row('Repas', enfRepasFicheLigne(e))
    + row('Goûter', enfGouterFicheLigne(e))
    + row('Code image (kiosque)', kkPictosLigne(e.code_pictos))
    + '<div style="display:flex;gap:6px;justify-content:flex-end;margin:-4px 0 10px;flex-wrap:wrap">'+kkPictosActions(e.id,e.creche_id,e.code_pictos)+'</div>'
    + '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn-primary" onclick="editEnfant(\''+e.id+'\')"><i class="ti ti-edit"></i> Modifier la fiche</button></div>';
}

/* ===================== CODE DE POINTAGE (tablette sans compte) =====================
   Le code lui-même (4 chiffres, colonne enfants.code_pointage / referents.code_pointage)
   est généré côté base par kk_gen_code_pointage() — voir sql/kiosque_code_pointage.sql.
   Ici on ne fait que l'afficher, le régénérer (même RPC, appelable par un utilisateur
   authentifié) et proposer son envoi par e-mail via l'edge function
   envoyer-code-pointage. Le code n'est jamais listé nulle part ailleurs : seule la
   fiche de la personne concernée le montre, à la direction et à la référente de sa
   crèche — la portée normale des policies RLS sur enfants/referents. */
function kkCodeLigne(code){
  return code
    ? '<span style="font-family:monospace;font-weight:800;font-size:15px;letter-spacing:3px">'+escHtml(code)+'</span>'
    : '<span style="color:var(--muted)">Non généré</span>';
}
function kkCodeActions(type,id,crecheId,code){
  if(!crecheId)return '<span style="font-size:11.5px;color:var(--muted)">Sans crèche assignée — pas de code possible</span>';
  const copyBtn=code?'<button class="btn-sm" onclick="kkCopyCode(\''+code+'\')"><i class="ti ti-copy"></i> Copier</button>':'';
  const sendBtn=code?'<button class="btn-sm" onclick="kkSendCode(\''+type+'\',\''+id+'\')"><i class="ti ti-mail"></i> Envoyer le code par e-mail</button>':'';
  const regenBtn='<button class="btn-sm" onclick="kkRegenCode(\''+type+'\',\''+id+'\',\''+crecheId+'\')"><i class="ti ti-refresh"></i> '+(code?'Régénérer':'Générer')+'</button>';
  return copyBtn+sendBtn+regenBtn;
}
async function kkCopyCode(code){
  try{await navigator.clipboard.writeText(code);showBanner('Code copié dans le presse-papiers.');}
  catch(e){console.warn('[kkCopyCode]',e);showBanner('Copie impossible — notez le code manuellement.','error');}
}
window.kkCopyCode=kkCopyCode;
async function kkRegenCode(type,id,crecheId){
  if(!confirm('Générer un nouveau code ? L\'ancien cessera de fonctionner immédiatement sur la tablette.'))return;
  const table=type==='enfant'?'enfants':(type==='employe'?'employes':'referents');
  try{
    const{data,error}=await sb.rpc('kk_gen_code_pointage',{p_creche_id:crecheId});
    if(error)throw error;
    const ok=await dbUpdateStrict(table,id,{code_pointage:data});
    if(!ok)throw new Error(window._lastDbError||'écriture refusée');
    if(type==='enfant'){const e=cacheEnfants.find(x=>String(x.id)===String(id));if(e)e.code_pointage=data;enfRenderIdentite();}
    else if(type==='employe'){const e=cacheEmployes.find(x=>String(x.id)===String(id));if(e)e.code_pointage=data;renderEmployes();}
    else{const r=cacheReferents.find(x=>String(x.id)===String(id));if(r)r.code_pointage=data;renderReferents();}
    showBanner('Nouveau code généré : '+data);
  }catch(e){
    console.error('[kkRegenCode]',e);
    const msg=e.code==='42883'?'Fonction absente — exécutez sql/kiosque_code_pointage.sql.':(e.message||'erreur inconnue');
    showBanner('Génération impossible : '+msg,'error');
  }
}
window.kkRegenCode=kkRegenCode;
async function kkSendCode(type,id){
  if(!confirm('Envoyer ce code de pointage par e-mail ?'))return;
  const ok=await callFn('envoyer-code-pointage',{type,id});
  if(ok)showBanner('Code envoyé par e-mail !');
  else showBanner('Envoi impossible'+(_lastFnErr?' — '+_lastFnErr:'')+'. Vous pouvez copier le code et le transmettre vous-même.','error');
}
window.kkSendCode=kkSendCode;

/* ===================== CODE IMAGE (kiosque, enfants uniquement) ============
   Depuis claude_37-kiosque-code-images.sql : les enfants pointent au kiosque
   avec une séquence de 4 pictogrammes (au lieu du code à 4 chiffres, gardé
   pour le personnel). Le tirage se fait côté base (generer_code_pictos),
   pris parmi le même pool que côté tablette (tablette.html) — toute
   divergence entre les deux listes casserait l'affichage ici (pas la
   validité du code lui-même, qui reste comparé en base). */
const KK_PICTOS={
  ours:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/ours.png',
  arc_en_ciel:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/arc_en_ciel.png',
  zebre:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/zebre.png',
  hochet:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/hochet.png',
  baleine:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/baleine.png',
  cubes_alphabet:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/cubes_alphabet.png',
  camionnette_rouge:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/camionnette_rouge.png',
  pingouin:'https://juyrceadazrovlitxceb.supabase.co/storage/v1/object/public/assets/pictos-kiosque/pingouin.png'
};
function kkPictosLigne(codePictos){
  if(!Array.isArray(codePictos)||codePictos.length!==4)return '<span style="color:var(--muted)">Non généré</span>';
  return '<div style="display:flex;gap:4px;justify-content:flex-end">'
    +codePictos.map(id=>'<img src="'+(KK_PICTOS[id]||'')+'" alt="'+escHtml(id)+'" title="'+escHtml(id)+'" style="width:26px;height:26px;border-radius:7px;object-fit:cover">').join('')
    +'</div>';
}
function kkPictosActions(id,crecheId,codePictos){
  if(!crecheId)return '<span style="font-size:11.5px;color:var(--muted)">Sans crèche assignée — pas de code possible</span>';
  const peutEnvoyer=Array.isArray(codePictos)&&codePictos.length===4;
  return '<button class="btn-sm" onclick="kkRegenPictos(\''+id+'\',\''+crecheId+'\')"><i class="ti ti-refresh"></i> Générer un code image</button>'
    +(peutEnvoyer?' <button class="btn-sm" onclick="kkSendPictos(\''+id+'\')"><i class="ti ti-mail"></i> Envoyer par e-mail</button>':'');
}
async function kkSendPictos(id){
  if(!confirm('Envoyer le code image par e-mail aux parents ?'))return;
  const ok=await callFn('envoyer-code-pictos',{enfant_id:id});
  if(ok)showBanner('Code image envoyé.');
  else showBanner('Échec de l\'envoi'+(_lastFnErr?' : '+_lastFnErr:''),'error');
}
window.kkSendPictos=kkSendPictos;
async function kkRegenPictos(id,crecheId){
  if(!confirm('Générer un nouveau code image ? L\'ancien cessera de fonctionner immédiatement sur la tablette.'))return;
  try{
    const{data,error}=await sb.rpc('generer_code_pictos',{p_creche_id:crecheId});
    if(error)throw error;
    const ok=await dbUpdateStrict('enfants',id,{code_pictos:data});
    if(!ok)throw new Error(window._lastDbError||'écriture refusée');
    const e=cacheEnfants.find(x=>String(x.id)===String(id));
    if(e)e.code_pictos=data;
    enfRenderIdentite();
    showBanner('Nouveau code image généré.');
  }catch(e){
    console.error('[kkRegenPictos]',e);
    const msg=e.code==='42883'?'Fonction absente — exécutez sql/claude_37-kiosque-code-images.sql.':(e.message||'erreur inconnue');
    showBanner('Génération impossible : '+msg,'error');
  }
}
window.kkRegenPictos=kkRegenPictos;

/* ===================== PARENTS / RESPONSABLES LEGAUX ======================= */
/* Table Supabase `enfants_parents` : une ligne par responsable legal.
   Une table plutot que des colonnes sur `enfants` — une famille peut compter
   deux parents separes, un tuteur, un contact de secours, et la liste sert de
   carnet d'adresses pour l'envoi du dossier de familiarisation. */

let enfParentsCache = [];      // parents de l'enfant actuellement ouvert
let editingParentId = null;

const PAR_LIENS = {mere:'Mère', pere:'Père', tuteur:'Tuteur / tutrice', autre:'Responsable légal'};

async function enfLoadParents(enfantId){
  const box = document.getElementById('enf-fiche-parents');
  try{
    const{data,error}=await sb.from('enfants_parents')
      .select('*')
      .eq('enfant_id',enfantId)
      .order('created_at',{ascending:true});
    if(error) throw error;
    enfParentsCache = data||[];
  }catch(err){
    console.warn('enfLoadParents',err);
    if(box) box.innerHTML='<div class="empty-state"><i class="ti ti-alert-triangle"></i><p>Impossible de charger les parents.</p></div>';
    return;
  }
  // ne rendre que si on est toujours sur le meme enfant
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderParents();
  /* Ces deux encadrés dépendent des mêmes adresses (enfDestinataires) : si
     les parents arrivent après eux, c'est ici qu'il faut les redessiner.
     Le second (dépôt de pièces) manquait à l'appel et reproduisait le même
     faux « Aucun parent avec une adresse e-mail » déjà corrigé une fois
     pour le premier. */
  enfRenderDossier();
  enfRenderPiecesDossier();
}

function enfRenderParents(){
  const box = document.getElementById('enf-fiche-parents');
  if(!box) return;
  const bouton = '<div style="margin-top:12px"><button class="btn-primary" onclick="openParentModal()"><i class="ti ti-user-plus"></i> Ajouter un parent</button></div>';
  if(!enfParentsCache.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-users"></i><p>Aucun parent enregistré pour cet enfant.</p></div>'+bouton;
    return;
  }
  box.innerHTML = enfParentsCache.map(p=>{
    const nomComplet = ((p.prenom||'')+' '+(p.nom||'')).trim() || '—';
    const lien = PAR_LIENS[p.lien]||'Responsable légal';
    const ligne = (icone,val,href)=>{
      if(!val) return '';
      const contenu = href
        ? '<a href="'+href+encodeURIComponent(val)+'" style="color:var(--koala);text-decoration:none">'+escHtml(val)+'</a>'
        : escHtml(val);
      return '<div style="font-size:12.5px;color:#555;display:flex;align-items:center;gap:6px;margin-top:3px"><i class="ti ti-'+icone+'" style="color:var(--muted)"></i>'+contenu+'</div>';
    };
    const badgeDest = p.destinataire
      ? '<span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✉️ Destinataire</span>'
      : '';
    const manqueMail = !p.email
      ? '<div style="font-size:11.5px;color:var(--orange-dark,#B25F00);margin-top:5px"><i class="ti ti-alert-circle"></i> Sans e-mail : cette famille ne pourra pas recevoir de dossier en ligne.</div>'
      : '';
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">'
      + '<div style="min-width:0">'
      + '<div style="font-weight:700;color:var(--koala-dark);font-size:13.5px">'+escHtml(nomComplet)+'</div>'
      + '<div style="font-size:11.5px;color:var(--muted)">'+escHtml(lien)+'</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
      + badgeDest
      + '<button type="button" class="btn-sm" onclick="editParent(\''+p.id+'\')" title="Modifier"><i class="ti ti-edit"></i></button>'
      + '</div>'
      + '</div>'
      + ligne('phone', p.telephone, 'tel:')
      + ligne('mail', p.email, 'mailto:')
      + manqueMail
      + '</div>';
  }).join('') + bouton;
}

function openParentModal(){
  if(!enfFicheId){alert('Ouvrez d\'abord la fiche d\'un enfant.');return;}
  editingParentId=null;
  document.getElementById('modal-parent-title').textContent='Ajouter un parent';
  document.getElementById('par-btn-save').innerHTML='<i class="ti ti-check"></i> Ajouter';
  document.getElementById('par-btn-delete').style.display='none';
  document.getElementById('par-lien').value='mere';
  ['par-prenom','par-nom','par-tel','par-email'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('par-destinataire').checked=true;
  document.getElementById('modal-parent-wrap').classList.add('open');
}

function editParent(id){
  const p=enfParentsCache.find(x=>String(x.id)===String(id));
  if(!p)return;
  editingParentId=p.id;
  document.getElementById('modal-parent-title').textContent='Modifier '+((p.prenom||'')+' '+(p.nom||'')).trim();
  document.getElementById('par-btn-save').innerHTML='<i class="ti ti-check"></i> Enregistrer';
  document.getElementById('par-btn-delete').style.display='';
  document.getElementById('par-lien').value=p.lien||'autre';
  document.getElementById('par-prenom').value=p.prenom||'';
  document.getElementById('par-nom').value=p.nom||'';
  document.getElementById('par-tel').value=p.telephone||'';
  document.getElementById('par-email').value=p.email||'';
  document.getElementById('par-destinataire').checked=p.destinataire!==false;
  document.getElementById('modal-parent-wrap').classList.add('open');
}

async function saveParent(){
  const prenom=document.getElementById('par-prenom').value.trim();
  const nom=document.getElementById('par-nom').value.trim();
  if(!prenom&&!nom){alert('Indiquez au moins un nom ou un prénom.');return;}
  const email=document.getElementById('par-email').value.trim();
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){alert('Adresse e-mail invalide.');return;}
  const row={
    enfant_id:enfFicheId,
    lien:document.getElementById('par-lien').value,
    prenom,nom,
    telephone:document.getElementById('par-tel').value.trim(),
    email,
    destinataire:document.getElementById('par-destinataire').checked
  };
  const btn=document.getElementById('par-btn-save');btn.disabled=true;
  if(editingParentId){
    const ok=await dbUpdate('enfants_parents',editingParentId,row);
    btn.disabled=false;
    if(!ok){showBanner('Erreur lors de la modification.','error');return;}
    const p=enfParentsCache.find(x=>String(x.id)===String(editingParentId));
    if(p)Object.assign(p,row);
    showBanner('Parent modifié ✅');
  }else{
    const saved=await dbInsert('enfants_parents',row);
    btn.disabled=false;
    if(!saved){showBanner('Erreur lors de l\'ajout.','error');return;}
    enfParentsCache.push(saved);
    showBanner('Parent ajouté ✅');
  }
  closeModal('modal-parent-wrap');
  enfRenderParents();
  enfRenderDossier();
  enfRenderPiecesDossier();
}

async function deleteParent(){
  if(!editingParentId)return;
  const p=enfParentsCache.find(x=>String(x.id)===String(editingParentId));
  if(!confirm('Supprimer '+(((p?.prenom||'')+' '+(p?.nom||'')).trim()||'ce parent')+' ?'))return;
  const ok=await dbDelete('enfants_parents',editingParentId);
  if(!ok){showBanner('Suppression impossible.','error');return;}
  enfParentsCache=enfParentsCache.filter(x=>String(x.id)!==String(editingParentId));
  closeModal('modal-parent-wrap');
  enfRenderParents();
  enfRenderDossier();
  enfRenderPiecesDossier();
  showBanner('Parent supprimé.');
}

/* ============ IMPORT PDF DES COORDONNÉES DES PARENTS ======================
   La direction tient la liste des coordonnées des familles dans un document
   « Coordonnées parents » : une ligne par enfant, avec les parents, leurs
   téléphones et leurs adresses. Jusqu'ici il fallait la recopier à la main
   dans l'onglet Parents, fiche par fiche. Cet import la lit et propose les
   responsables légaux à créer.

   Le PDF n'a aucune structure : ce sont des mots posés à des coordonnées. On
   reconstitue les lignes par leur ordonnée, puis les colonnes — celle de
   l'enfant par sa position, les autres par leur contenu (un « @ » = une
   adresse, huit chiffres = un téléphone). Se fier aux seules abscisses ferait
   basculer « DI FRANCESCO », qui déborde sur la colonne des téléphones, du
   côté des numéros.

   Rien n'est écrit sans relecture : l'import propose, on corrige à l'écran,
   et seules les lignes cochées partent en base. Un enfant qui a déjà des
   parents enregistrés est signalé et laissé de côté — l'import ne remplace
   jamais une saisie existante. */

let ICP_BLOCS = [];     // blocs lus dans le PDF, enrichis à la relecture

function icpNorm(s){
  return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9]+/g,' ').trim().toLowerCase();
}
function icpEstMaj(t){
  const l=String(t).normalize('NFD').replace(/[^A-Za-z]/g,'');
  return l.length>1 && l===l.toUpperCase();
}
function icpChiffres(t){ return String(t).replace(/[^\d]/g,''); }
function icpCap(mot){
  if(!mot) return '';
  if(icpEstMaj(mot)) return mot;                 // DI FRANCESCO reste tel quel
  return mot.charAt(0).toLocaleUpperCase('fr')+mot.slice(1);
}

/* Regroupe les mots en lignes visuelles (tolérance de 3 points). */
function icpLignes(items){
  const tri=items.slice().sort((a,b)=> b.y-a.y || a.x-b.x);
  const lignes=[];
  let cur=null;
  tri.forEach(it=>{
    if(!cur || Math.abs(cur.y-it.y)>3){ cur={y:it.y,toks:[]}; lignes.push(cur); }
    cur.toks.push(it);
  });
  lignes.forEach(l=>l.toks.sort((a,b)=>a.x-b.x));
  return lignes;
}

/* Colonne « Enfant » : tout ce qui est à gauche du milieu entre l'en-tête
   « Enfant » et l'en-tête « Parents ». Si l'en-tête est illisible, on retombe
   sur 110 points, valeur observée sur les listes de la direction. */
function icpBornEnfant(lignes){
  for(let i=0;i<lignes.length;i++){
    const e=lignes[i].toks.find(t=>/^enfants?\b/i.test(t.str));
    const p=lignes[i].toks.find(t=>/^parents?\b/i.test(t.str));
    if(e&&p) return {x:(e.x+p.x)/2, i:i};
  }
  return {x:110, i:-1};
}

function icpParseItems(items){
  const lignes=icpLignes(items);
  const b=icpBornEnfant(lignes);
  const blocs=[];
  let cur=null;
  for(let i=b.i+1;i<lignes.length;i++){
    const toks=lignes[i].toks;
    const gauche=toks.filter(t=>t.x<b.x);
    const droite=toks.filter(t=>t.x>=b.x);
    if(gauche.length){
      cur={enfant:gauche.map(t=>t.str).join(' ').trim(), parents:[], tels:[], mails:[]};
      blocs.push(cur);
    }
    if(!cur) continue;
    /* pdf.js ne découpe pas en mots : un fragment vaut souvent une cellule
       entière (« 0676193773 (S travail) », « Beaufils Cédric et Morgane DI »).
       On classe donc par le contenu du fragment, pas mot à mot. */
    droite.forEach(t=>{
      let s=(t.str||'').trim();
      if(!s) return;

      const mails=s.match(/[^\s,;:<>()]+@[^\s,;:<>()]+\.[A-Za-z]{2,}/g);
      if(mails){
        mails.forEach(m=>cur.mails.push(m.replace(/[.,;]+$/,'')));
        s=mails.reduce((acc,m)=>acc.split(m).join(' '),s).trim();
        if(!/[A-Za-zÀ-ÿ]{3,}/.test(s)) return;
      }

      /* Un numéro, éventuellement suivi de l'initiale du parent : « (M) ». */
      const re=/(\d[\d .]{6,}\d)\s*(?:\(\s*([A-Za-zÀ-ÿ])[^)]*\)?)?/g;
      let m, trouve=false;
      while((m=re.exec(s))){
        if(icpChiffres(m[1]).length<8) continue;
        cur.tels.push({num:icpChiffres(m[1]), init:m[2]||''});
        trouve=true;
      }
      if(trouve){
        s=s.replace(/(\d[\d .]{6,}\d)\s*(?:\([^)]*\)?)?/g,' ').trim();
        if(!/[A-Za-zÀ-ÿ]{3,}/.test(s)) return;
      }

      /* Une initiale seule, sur sa propre ligne, complète le dernier numéro. */
      if(/^\(?\s*[A-Za-zÀ-ÿ][^)]*\)$/.test(s) && cur.tels.length){
        const i=s.match(/\(?\s*([A-Za-zÀ-ÿ])/);
        const dernier=cur.tels[cur.tels.length-1];
        if(i && !dernier.init) dernier.init=i[1];
        return;
      }
      cur.parents.push(s);
    });
  }
  return blocs.filter(x=>x.enfant && !/^enfants?$/i.test(x.enfant)
                       && (x.parents.length||x.mails.length||x.tels.length));
}

/* Découpage « Untel et Unetelle » en personnes. Deux conventions cohabitent
   dans les listes : « Prénom NOM » et, plus rarement, « Nom Prénom ». Les
   initiales notées à côté des numéros — « 0770185899 (B) » — désignent des
   prénoms : c'est le meilleur indice quand les deux mots sont écrits de la
   même façon (« Bryan Leoty », où l'adresse Leoty.bryan@ induirait en erreur).
   À défaut, l'ordre des mots dans l'adresse départage. */
function icpPersonnes(bloc){
  const texte=bloc.parents.join(' ').replace(/\s+/g,' ').trim();
  if(!texte) return [];
  const parts=texte.split(/\s+(?:et|&|\/|,)\s+/i).map(s=>s.trim()).filter(Boolean);
  const locaux=bloc.mails.map(m=>icpNorm(m.split('@')[0]).replace(/ /g,''));
  const inits=bloc.tels.map(t=>icpNorm(t.init).charAt(0)).filter(Boolean);

  const gens=parts.map(part=>{
    const toks=part.split(/\s+/).filter(Boolean);
    if(!toks.length) return null;
    if(toks.length===1) return {prenom:icpCap(toks[0]), nom:''};

    const maj=toks.filter(icpEstMaj), min=toks.filter(t=>!icpEstMaj(t));
    if(maj.length && min.length) return {prenom:min.map(icpCap).join(' '), nom:maj.join(' ')};

    const a=icpNorm(toks[0]).replace(/ /g,''), b=icpNorm(toks[1]).replace(/ /g,'');
    const direct =()=>({prenom:icpCap(toks[0]), nom:toks.slice(1).map(icpCap).join(' ')});
    const inverse=()=>({prenom:icpCap(toks[1]),
                        nom:[toks[0]].concat(toks.slice(2)).map(icpCap).join(' ')});

    const ma=inits.indexOf(a.charAt(0))>=0, mb=inits.indexOf(b.charAt(0))>=0;
    if(ma&&!mb) return direct();
    if(mb&&!ma) return inverse();
    for(let k=0;k<locaux.length;k++){
      const ia=locaux[k].indexOf(a), ib=locaux[k].indexOf(b);
      if(ia>=0 && ib>=0 && ia!==ib) return ia<ib ? direct() : inverse();
    }
    return direct();
  }).filter(Boolean);

  /* « Ablah et Rachid JENNANI » : le premier parent porte le nom du second. */
  const avecNom=gens.find(g=>g.nom);
  if(avecNom) gens.forEach(g=>{ if(!g.nom) g.nom=avecNom.nom; });

  /* Téléphones et adresses : d'abord par l'initiale notée sur le PDF, puis par
     le prénom lisible dans l'adresse, enfin par l'ordre des lignes. */
  const tels=bloc.tels.slice(), mails=bloc.mails.slice();
  const prisT={}, prisM={};
  const libreT=()=>{for(let k=0;k<tels.length;k++)if(!prisT[k])return k;return -1;};
  const libreM=()=>{for(let k=0;k<mails.length;k++)if(!prisM[k])return k;return -1;};

  gens.forEach(g=>{
    const p=icpNorm(g.prenom).replace(/ /g,''), n=icpNorm(g.nom).replace(/ /g,'');
    let i=-1;
    for(let k=0;k<tels.length;k++)
      if(!prisT[k] && tels[k].init && icpNorm(tels[k].init)===p.charAt(0)){i=k;break;}
    if(i>=0){ g.telephone=tels[i].num; prisT[i]=1; }
    let j=-1;
    for(let k=0;k<mails.length;k++){
      if(prisM[k]) continue;
      const l=icpNorm(mails[k].split('@')[0]).replace(/ /g,'');
      if(p.length>2 && l.indexOf(p)>=0){ j=k; break; }
    }
    if(j<0 && n.length>2) for(let k=0;k<mails.length;k++){
      if(prisM[k]) continue;
      const l=icpNorm(mails[k].split('@')[0]).replace(/ /g,'');
      if(l.indexOf(n)>=0){ j=k; break; }
    }
    if(j>=0){ g.email=mails[j]; prisM[j]=1; }
  });
  gens.forEach(g=>{
    if(!g.telephone){ const i=libreT(); if(i>=0){ g.telephone=tels[i].num; prisT[i]=1; } }
    if(!g.email){     const j=libreM(); if(j>=0){ g.email=mails[j];       prisM[j]=1; } }
    if(!g.lien) g.lien='autre';
  });
  return gens;
}

/* ── Lecture du fichier ─────────────────────────────────────────────────── */

async function icpLirePdf(file){
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  let blocs=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const items=tc.items
      .filter(it=>(it.str||'').trim())
      .map(it=>({str:it.str.trim(), x:it.transform[4], y:it.transform[5]}));
    blocs=blocs.concat(icpParseItems(items));   // page par page : les y se répètent
  }
  return blocs;
}

/* Rapprochement avec les fiches enfants déjà en base. Le PDF ne donne que le
   prénom : on cherche d'abord une correspondance exacte, puis un prénom
   contenu dans l'autre (« THÉO » / « Théo B. »). Plusieurs candidats = aucun
   choix automatique, c'est à l'utilisateur de trancher. */
function icpCandidats(nomPdf){
  const cible=icpNorm(nomPdf);
  if(!cible) return [];
  const exacts=cacheEnfants.filter(e=>icpNorm(e.prenom)===cible);
  if(exacts.length) return exacts;
  return cacheEnfants.filter(e=>{
    const p=icpNorm(e.prenom);
    return p && (cible.indexOf(p)>=0 || p.indexOf(cible)>=0);
  });
}

function icpOuvrir(){
  ICP_BLOCS=[];
  document.getElementById('icp-file').value='';
  document.getElementById('icp-revue').innerHTML='';
  document.getElementById('icp-revue').style.display='none';
  document.getElementById('icp-etape-fichier').style.display='';
  document.getElementById('icp-btn-import').style.display='none';
  document.getElementById('icp-resume').innerHTML='';
  document.getElementById('modal-import-coord-wrap').classList.add('open');
}

async function icpLire(){
  const f=document.getElementById('icp-file').files[0];
  if(!f){ showBanner('Choisissez d\'abord un fichier PDF.','error'); return; }
  const btn=document.getElementById('icp-btn-lire');
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader"></i> Lecture…';
  try{
    ICP_BLOCS=await icpLirePdf(f);
  }catch(err){
    console.warn('icpLire',err);
    btn.disabled=false; btn.innerHTML='<i class="ti ti-file-search"></i> Lire le PDF';
    showBanner('PDF illisible. Vérifiez qu\'il s\'agit bien de la liste des coordonnées.','error');
    return;
  }
  btn.disabled=false; btn.innerHTML='<i class="ti ti-file-search"></i> Lire le PDF';
  if(!ICP_BLOCS.length){
    showBanner('Aucun enfant trouvé dans ce PDF.','error');
    return;
  }
  ICP_BLOCS.forEach(b=>{
    b.personnes=icpPersonnes(b);
    const c=icpCandidats(b.enfant);
    b.candidats=c;
    b.enfantId=(c.length===1)?c[0].id:'';
    b.deja=false;
  });

  /* Qui a déjà des parents en base ? Une seule requête pour tout le lot. */
  const ids=ICP_BLOCS.map(b=>b.enfantId).filter(Boolean);
  if(ids.length){
    try{
      const{data,error}=await sb.from('enfants_parents').select('enfant_id').in('enfant_id',ids);
      if(error) throw error;
      const avec={};
      (data||[]).forEach(r=>avec[String(r.enfant_id)]=1);
      ICP_BLOCS.forEach(b=>{ b.deja=!!(b.enfantId&&avec[String(b.enfantId)]); });
    }catch(err){ console.warn('icpDeja',err); }
  }
  ICP_BLOCS.forEach(b=>b.personnes.forEach(p=>{ p.coche=!!(b.enfantId&&!b.deja); }));
  icpRenderRevue();
}

/* L'écran de relecture est reconstruit à chaque changement de fiche enfant :
   on récupère d'abord les corrections déjà saisies, sinon elles seraient
   effacées par le rendu suivant. */
function icpCollecter(){
  ICP_BLOCS.forEach((b,i)=>{
    const sel=document.getElementById('icp_'+i+'_enfant');
    if(sel) b.enfantId=sel.value||'';
    b.personnes.forEach((p,j)=>{
      const id='icp_'+i+'_'+j+'_';
      const g=k=>document.getElementById(id+k);
      if(!g('prenom')) return;
      p.prenom=g('prenom').value.trim();
      p.nom=g('nom').value.trim();
      p.telephone=g('tel').value.trim();
      p.email=g('mail').value.trim();
      p.lien=g('lien').value;
      p.coche=g('ok').checked;
    });
  });
}

/* Choix manuel d'une fiche : l'enfant retenu peut lui aussi avoir déjà des
   parents. On revérifie, plutôt que de créer des doublons en silence. */
async function icpMajBloc(i){
  icpCollecter();
  const b=ICP_BLOCS[i];
  b.deja=false;
  if(b.enfantId){
    try{
      const{data,error}=await sb.from('enfants_parents').select('id').eq('enfant_id',b.enfantId).limit(1);
      if(!error) b.deja=!!(data&&data.length);
    }catch(err){ console.warn('icpMajBloc',err); }
  }
  b.personnes.forEach(p=>{ p.coche=!!(b.enfantId&&!b.deja); });
  icpRenderRevue();
}

function icpRenderRevue(){
  const box=document.getElementById('icp-revue');
  const opts=(sel)=>{
    let h='<option value="">— Ne pas importer —</option>';
    cacheEnfants.slice().sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr')).forEach(e=>{
      const cre=cacheCreches.find(c=>String(c.id)===String(e.creche_id));
      h+='<option value="'+e.id+'"'+(String(sel)===String(e.id)?' selected':'')+'>'
        +escHtml(((e.prenom||'')+' '+(e.nom||'')).trim())
        +(cre?' — '+escHtml(cre.name):'')+'</option>';
    });
    return h;
  };

  box.innerHTML=ICP_BLOCS.map((b,i)=>{
    const alerte=b.deja
      ? '<span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">Déjà renseigné — laissé de côté</span>'
      : (!b.enfantId
          ? '<span style="background:#FDEBD8;color:#B25F00;border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">'
            +(b.candidats.length>1?'Plusieurs fiches possibles':'Aucune fiche trouvée')+'</span>'
          : '');

    const lignes=b.personnes.map((p,j)=>{
      const id='icp_'+i+'_'+j+'_';
      const sel=(v)=>['mere','pere','tuteur','autre'].map(o=>'<option value="'+o+'"'+(v===o?' selected':'')
        +'>'+({mere:'Mère',pere:'Père',tuteur:'Tuteur / tutrice',autre:'Responsable légal'})[o]+'</option>').join('');
      return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">'
        +'<input type="checkbox" id="'+id+'ok"'+(p.coche?' checked':'')+'>'
        +'<select class="finput" id="'+id+'lien" style="width:auto;font-size:12px;padding:4px 6px">'+sel(p.lien)+'</select>'
        +'<input class="finput" id="'+id+'prenom" value="'+escHtml(p.prenom||'')+'" placeholder="Prénom" style="width:120px;font-size:12px;padding:4px 6px">'
        +'<input class="finput" id="'+id+'nom" value="'+escHtml(p.nom||'')+'" placeholder="Nom" style="width:150px;font-size:12px;padding:4px 6px">'
        +'<input class="finput" id="'+id+'tel" value="'+escHtml(p.telephone||'')+'" placeholder="Téléphone" style="width:120px;font-size:12px;padding:4px 6px">'
        +'<input class="finput" id="'+id+'mail" value="'+escHtml(p.email||'')+'" placeholder="e-mail" style="flex:1;min-width:190px;font-size:12px;padding:4px 6px">'
        +'</div>';
    }).join('');

    /* Le PDF ne dit jamais qui est la mère et qui est le père, et l'ordre des
       deux parents change d'une ligne à l'autre : aucune règle automatique ne
       tiendrait. Ces deux boutons remplissent les rôles dans un sens ou dans
       l'autre en un clic — c'est le seul raccourci honnête. */
    const raccourci = b.personnes.length===2
      ? '<span style="display:flex;gap:5px;align-items:center;margin-left:auto">'
        +'<span style="font-size:11px;color:var(--muted)">Rôles :</span>'
        +'<button type="button" class="btn-sm" style="font-size:11px;padding:3px 8px" onclick="icpOrdre('+i+',\'mp\')">Mère puis Père</button>'
        +'<button type="button" class="btn-sm" style="font-size:11px;padding:3px 8px" onclick="icpOrdre('+i+',\'pm\')">Père puis Mère</button>'
        +'</span>'
      : '';

    return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:10px'
      +(b.deja?';opacity:.65':'')+'">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
      +'<strong style="color:var(--koala-dark);font-size:13.5px">'+escHtml(b.enfant)+'</strong>'
      +'<i class="ti ti-arrow-right" style="color:var(--muted)"></i>'
      +'<select class="finput" id="icp_'+i+'_enfant" onchange="icpMajBloc('+i+')" style="width:auto;min-width:210px;font-size:12px;padding:4px 6px">'
      +opts(b.enfantId)+'</select>'+alerte+raccourci+'</div>'
      +(lignes||'<div style="font-size:12px;color:var(--muted)">Aucun parent lisible sur cette ligne.</div>')
      +'</div>';
  }).join('');

  box.style.display='';
  document.getElementById('icp-etape-fichier').style.display='none';
  document.getElementById('icp-btn-import').style.display='';
  const aImporter=ICP_BLOCS.filter(b=>b.enfantId&&!b.deja).length;
  document.getElementById('icp-resume').innerHTML=
    ICP_BLOCS.length+' enfant(s) lus dans le PDF · '+aImporter+' prêt(s) à être importés. '
    +'Vérifiez chaque ligne : le PDF ne dit pas qui est la mère et qui est le père.';
}

/* Attribue les deux rôles dans l'ordre indiqué, sans toucher au reste de la
   saisie déjà corrigée à l'écran. */
function icpOrdre(i,sens){
  icpCollecter();
  const roles = sens==='pm' ? ['pere','mere'] : ['mere','pere'];
  ICP_BLOCS[i].personnes.forEach((p,j)=>{ if(j<2) p.lien=roles[j]; });
  icpRenderRevue();
}

async function icpImporter(){
  icpCollecter();
  const btn=document.getElementById('icp-btn-import');
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader"></i> Import…';
  let crees=0, echecs=0;
  const ignores=[];

  for(let i=0;i<ICP_BLOCS.length;i++){
    const b=ICP_BLOCS[i];
    if(!b.enfantId){ ignores.push(b.enfant+' : aucune fiche choisie'); continue; }
    if(b.deja){ ignores.push(b.enfant+' : parents déjà enregistrés'); continue; }
    let n=0;
    for(let j=0;j<b.personnes.length;j++){
      const p=b.personnes[j];
      if(!p.coche) continue;
      if(!p.prenom && !p.nom) continue;
      const saved=await dbInsert('enfants_parents',{
        enfant_id:b.enfantId,
        lien:p.lien||'autre',
        prenom:p.prenom||'', nom:p.nom||'',
        telephone:p.telephone||'',
        email:p.email||'',
        destinataire:!!p.email      // sans adresse, rien ne peut lui être envoyé
      });
      if(saved){ crees++; n++; } else echecs++;
    }
    if(!n) ignores.push(b.enfant+' : aucune ligne cochée');
  }

  /* Bouton neutralisé : relancer l'import créerait les mêmes parents en double. */
  btn.innerHTML='<i class="ti ti-check"></i> Import terminé';
  document.getElementById('icp-resume').innerHTML=
    '<strong>'+crees+' parent(s) créé(s).</strong>'
    +(echecs?' <span style="color:var(--red)">'+echecs+' échec(s) d\'enregistrement.</span>':'')
    +(ignores.length?'<br>Laissés de côté : '+escHtml(ignores.join(' · ')):'');
  showBanner(crees+' parent(s) importé(s) ✅');

  /* La fiche ouverte, si elle fait partie du lot, doit refléter l'import. */
  if(enfFicheId) enfLoadParents(enfFicheId);
}

/* ================= DOSSIER DE FAMILIARISATION (envoi aux familles) ========= */
/* Table `dossiers_familles` : un envoi = un jeton = un lien famille.
   Le lien ouvre famille.html, qui ne touche à aucune table directement mais
   passe par l'edge function `dossier-famille`. Ici on se contente de créer la
   ligne (sous RLS, donc par quelqu'un qui en a le droit) et de demander
   l'envoi du mail. */

let enfDossiersCache = [];      // dossiers de l'enfant ouvert, plus récent d'abord
let enfDossierPret = false;     // les dossiers sont-ils chargés ? (évite d'afficher
                                 // un état faux tant que la requête n'est pas revenue)

const DOSSIER_JOURS = 15;

function dossierLien(token){
  return location.origin + location.pathname.replace(/[^/]*$/,'') + 'famille.html?t=' + token;
}

function dossierToken(){
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,32);
}

async function enfLoadDossier(enfantId){
  try{
    const{data,error}=await sb.from('dossiers_familles')
      .select('*')
      .eq('enfant_id',enfantId)
      .order('envoye_le',{ascending:false});
    if(error) throw error;
    enfDossiersCache = data||[];
  }catch(err){
    console.warn('enfLoadDossier',err);
    enfDossiersCache = [];
  }
  await chargerPack();
  if(String(enfFicheId)!==String(enfantId)) return;
  enfDossierPret = true;
  enfRenderDossier();
  /* La zone Fiche sanitaire (section Documents sanitaires) dépend elle aussi
     de cachePack (chargé ci-dessus) : la redessiner ici couvre le cas où
     enfLoadAdminDocs() a déjà rendu une première fois sans cachePack. */
  enfRenderFicheSanitaireZone();
}

/* Les destinataires possibles : tout parent avec une adresse mail. Ceux qui
   sont cochés « destinataire » dans l'onglet Parents sont présélectionnés,
   mais on peut ajouter ou retirer une adresse au moment de l'envoi. */
function enfDestinataires(){
  return enfParentsCache.filter(p=>(p.email||'').trim());
}
function enfDestinatairesParDefaut(){
  const avecEmail=enfDestinataires();
  const coches=avecEmail.filter(p=>p.destinataire!==false);
  return coches.length?coches:avecEmail;
}
function enfNomParent(p){
  return ((p.prenom||'')+' '+(p.nom||'')).trim()||p.email;
}

function enfRenderDossier(){
  const box=document.getElementById('enf-dossier-box');
  if(!box)return;
  /* Tant que les dossiers ne sont pas revenus, on n'affiche rien : dessiner ici
     annoncerait « aucun dossier » pour un enfant qui en a un. */
  if(!enfDossierPret){ box.innerHTML=''; return; }
  const actif=enfDossiersCache.find(d=>d.statut!=='annule' && new Date(d.expire_le)>new Date());
  const possibles=enfDestinataires();

  if(!actif){
    if(!possibles.length){
      box.innerHTML='<p style="background:#FFF8F0;border:1px solid #F3DEC2;border-radius:8px;padding:8px 10px;font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.6">'
        +'Aucun parent avec une adresse e-mail. Renseignez-en un dans l\'onglet '
        +'<strong>Parents</strong> pour pouvoir envoyer le dossier.</p>';
      return;
    }
    box.innerHTML='<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.6">'
      +'Envoie aux parents un lien personnel vers les documents à remplir et signer en ligne. '
      +'Valable '+DOSSIER_JOURS+' jours.</p>'
      +'<button class="btn-primary" onclick="enfOuvrirEnvoi()"><i class="ti ti-send"></i> Envoyer le dossier</button>';
    return;
  }

  const enf=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  const attendusDocs=packEnLigne(enf);
  const attendus=attendusDocs.length;
  const rendus=enfDocsCache.filter(d=>d.dossier_id===actif.id&&d.statut==='signe').length;
  const badge=actif.statut==='complet'
    ? '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">✅ Complet</span>'
    : '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">🕓 En attente</span>';
  const adresses=(actif.email||'').split(',').map(x=>x.trim()).filter(Boolean);

  box.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'+badge
    +'<span style="font-size:12px;color:var(--muted)">envoyé le '+new Date(actif.envoye_le).toLocaleDateString('fr-FR')
    +' · expire le '+new Date(actif.expire_le).toLocaleDateString('fr-FR')
    +(actif.relances?' · '+actif.relances+' relance'+(actif.relances>1?'s':''):'')+'</span></div>'
    +'<div style="font-size:12px;color:var(--muted);margin-bottom:9px">'
    +'<i class="ti ti-mail"></i> '+escHtml(adresses.join(' · '))+'</div>'
    +(attendus?'<div style="font-size:12.5px;color:var(--muted);margin-bottom:9px">'
      +rendus+' document'+(rendus>1?'s':'')+' signé'+(rendus>1?'s':'')+' sur '+attendus+' attendus en ligne</div>':'')
    +enfPapierHtml(enf)
    +'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px">'
    +'<button class="btn-sm" onclick="enfCopierLien(\''+actif.id+'\')"><i class="ti ti-link"></i> Copier le lien</button>'
    +'<button class="btn-sm" onclick="enfRelancerDossier(\''+actif.id+'\')"><i class="ti ti-bell"></i> Relancer</button>'
    +'<button class="btn-sm" style="color:var(--red);border-color:var(--red)" onclick="enfAnnulerDossier(\''+actif.id+'\')"><i class="ti ti-x"></i> Annuler</button>'
    +'</div>';
}

/* Le pack complet, chargé une fois par session. Deux sous-ensembles :
   ce qui se remplit en ligne (barre d'avancement) et ce qui se rapporte en
   papier (suivi manuel de réception). */
let cachePack=null;
async function chargerPack(){
  if(cachePack)return cachePack;
  const{data}=await sb.from('documents_koala')
    .select('id,titre,creche_id,type,pack_imprimer,pack_ordre')
    .eq('actif',true).eq('pack_familiarisation',true)
    .order('pack_ordre');
  cachePack=data||[];
  return cachePack;
}
function packEnLigne(e){
  return (cachePack||[]).filter(d=>d.type==='remplissable'&&!d.pack_imprimer
    &&(!d.creche_id||String(d.creche_id)===String(e&&e.creche_id)));
}
function packPapier(e){
  return (cachePack||[]).filter(d=>d.pack_imprimer
    &&(!d.creche_id||String(d.creche_id)===String(e&&e.creche_id)));
}
/* La fiche sanitaire est une donnée de santé : elle vit dans la section
   Documents sanitaires plutôt qu'avec le reste du dossier de familiarisation
   « à rapporter en papier » (ex. autorisation droit à l'image). Repérée par
   son template_key quand le document utilise le modèle prédéfini du même
   nom (voir documents.html, registre TPL), ou par son titre sinon — dans la
   pratique, une « Fiche sanitaire » est le plus souvent configurée en type
   « À télécharger » (PDF vierge à faire remplir par le médecin), sans
   template_key du tout. */
function estFicheSanitaire(d){
  return d.template_key==='fiche_sanitaire' || /fiche\s+sanitaire/i.test(d.titre||'');
}
function packPapierSanitaire(e){
  return packPapier(e).filter(estFicheSanitaire);
}
function packPapierAdmin(e){
  return packPapier(e).filter(d=>!estFicheSanitaire(d));
}

/* Une ligne pour un document « à rapporter en papier » : case à cocher pour
   le suivi de réception (déclaratif, sans fichier), et un import du scan/
   de la photo une fois le papier rendu. Les deux sont indépendants —
   importer un fichier coche automatiquement la case (voir
   enfHandleAdminDocUpload), mais cocher sans importer reste possible pour
   qui n'a pas de scanner sous la main. */
function enfPapierDocRowHtml(d){
  const recu=enfDocsCache.find(r=>r.document_id===d.id&&r.statut==='remis');
  const fichiers=enfPiecesPourCle('papier_'+d.id);
  const listeFichiers=fichiers.length ? '<div style="margin:4px 0 0 26px">'+fichiers.map(f=>
    '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
    +'<i class="ti ti-paperclip" style="color:var(--koala);flex-shrink:0;font-size:13px"></i>'
    +'<button type="button" onclick="enfAdminDocOpen(\''+f.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(f.filename||'Document')+'</button>'
    +'<button onclick="enfAdminDocDelete(\''+f.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:13px;flex-shrink:0"><i class="ti ti-trash"></i></button>'
    +'</div>'
  ).join('')+'</div>' : '';
  return '<div style="padding:4px 0">'
    +'<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px">'
    +'<input type="checkbox"'+(recu?' checked':'')
    +' onchange="enfMarquerRecu(\''+d.id+'\',this.checked,this)">'
    +'<span style="flex:1">'+escHtml(d.titre)+' — '
    +(recu
      ? '<span style="color:var(--green);font-weight:700">reçu en main propre</span>'
      : '<span style="color:var(--orange);font-weight:700">non rendu</span>')
    +'</span>'
    +'<button type="button" onclick="enfOpenPieceUpload(\'papier_'+d.id+'\')" title="Importer le document rendu" style="border:1px solid var(--border);background:#fff;border-radius:7px;padding:3px 8px;font-size:11px;cursor:pointer;color:var(--koala);display:inline-flex;align-items:center;gap:4px;flex-shrink:0"><i class="ti ti-upload"></i> Importer</button>'
    +'</label>'
    +listeFichiers
    +'</div>';
}

function enfPapierHtml(e){
  const papier=packPapierAdmin(e);
  if(!papier.length)return '';
  return '<div style="border-top:1px solid var(--border);margin:10px 0 9px;padding-top:9px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:6px">'
    +'À rapporter en papier</div>'
    + papier.map(enfPapierDocRowHtml).join('')
    +'</div>';
}

/* Section Documents sanitaires : même case à cocher + import que les autres
   documents « à rapporter en papier », mais pour la seule fiche sanitaire —
   voir packPapierSanitaire. */
function enfRenderFicheSanitaireZone(){
  const zone=document.getElementById('enf-fiche-sanitaire-zone');
  if(!zone) return;
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  const docs=packPapierSanitaire(e);
  if(!docs.length){ zone.innerHTML=''; return; }
  zone.innerHTML='<div style="background:var(--koala-light);border:1px solid var(--border);border-radius:12px;padding:13px 15px">'
    +'<div style="font-weight:700;font-size:13.5px;color:var(--koala-dark);margin-bottom:7px">'
    +'<i class="ti ti-file-heart"></i> Fiche sanitaire</div>'
    + docs.map(enfPapierDocRowHtml).join('')
    +'</div>';
}

async function enfMarquerRecu(docId,recu,input){
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e)return;
  input.disabled=true;
  const existant=enfDocsCache.find(r=>r.document_id===docId&&r.statut==='remis');
  let message=null, erreur=false;
  if(recu&&!existant){
    const actif=enfDossiersCache.find(d=>d.statut!=='annule');
    const saved=await dbInsert('documents_reponses',{
      document_id:docId, enfant_id:e.id, creche_id:e.creche_id,
      dossier_id:actif?actif.id:null,
      statut:'remis', donnees:{}, rempli_par:currentUser?currentUser.id:null,
      rempli_par_nom:(currentProfile&&currentProfile.name)||'Crèche'
    });
    if(saved){enfDocsCache.unshift(saved);message='Document noté comme reçu ✅';}
    else{message='Enregistrement impossible'+(window._lastDbError?' : '+window._lastDbError:'.');erreur=true;}
  }else if(!recu&&existant){
    const ok=await dbDelete('documents_reponses',existant.id);
    if(ok){enfDocsCache=enfDocsCache.filter(r=>String(r.id)!==String(existant.id));message='Document repassé en « non rendu ».';}
    else{message='Modification impossible.';erreur=true;}
  }
  input.disabled=false;
  /* Toujours redessiner, y compris en cas d'échec : la case a été cochée par
     le navigateur dès le clic, indépendamment de notre code — sans ce
     rafraîchissement elle resterait affichée cochée alors que rien n'a été
     enregistré. */
  enfRenderDossier();
  enfRenderFicheSanitaireZone();
  enfRenderDocs();
  if(message)showBanner(message,erreur?'error':undefined);
}

/* Variante silencieuse en cas de succès (pas de bannière « reçu ✅ » en plus
   de celle de l'import) : utilisée quand l'import d'un scan vaut de facto
   confirmation de réception (voir enfHandleAdminDocUpload). N'écrase rien si
   déjà marqué reçu. Renvoie false en cas d'échec, pour que l'appelant
   prévienne l'utilisateur — un import qui « prend » sans marquer le document
   reçu serait sinon indétectable. */
async function enfMarquerRecuSilencieux(docId){
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e)return true;
  if(enfDocsCache.find(r=>r.document_id===docId&&r.statut==='remis'))return true;
  const actif=enfDossiersCache.find(d=>d.statut!=='annule');
  const saved=await dbInsert('documents_reponses',{
    document_id:docId, enfant_id:e.id, creche_id:e.creche_id,
    dossier_id:actif?actif.id:null,
    statut:'remis', donnees:{}, rempli_par:currentUser?currentUser.id:null,
    rempli_par_nom:(currentProfile&&currentProfile.name)||'Crèche'
  });
  if(saved){enfDocsCache.unshift(saved);return true;}
  console.warn('[enfMarquerRecuSilencieux]',window._lastDbError);
  return false;
}

function enfOuvrirEnvoi(){
  const possibles=enfDestinataires();
  if(!possibles.length)return showBanner('Aucun parent avec une adresse e-mail.','error');
  const defaut=new Set(enfDestinatairesParDefaut().map(p=>p.id));
  document.getElementById('envoi-liste').innerHTML=possibles.map(p=>
    '<label style="display:flex;align-items:flex-start;gap:9px;padding:9px 2px;border-bottom:1px solid var(--border);cursor:pointer">'
    +'<input type="checkbox" class="envoi-dest" value="'+escHtml(p.email)+'"'+(defaut.has(p.id)?' checked':'')+' style="margin-top:3px">'
    +'<span><span style="font-weight:700;font-size:13px">'+escHtml(enfNomParent(p))+'</span>'
    +'<span style="display:block;font-size:12px;color:var(--muted)">'+escHtml(p.email)
    +(p.lien&&PAR_LIENS[p.lien]?' · '+escHtml(PAR_LIENS[p.lien]):'')+'</span></span></label>'
  ).join('');
  document.getElementById('envoi-vide').style.display='none';
  document.getElementById('envoi-btn').disabled=false;
  document.getElementById('modal-envoi-wrap').classList.add('open');
}

async function enfConfirmerEnvoi(){
  const emails=[...document.querySelectorAll('.envoi-dest:checked')].map(c=>c.value);
  const err=document.getElementById('envoi-vide');
  if(!emails.length){
    err.textContent='Cochez au moins une adresse.';err.style.display='block';return;
  }
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e)return;
  await chargerPack();
  if(!cachePack.length&&!confirm('Aucun document n\'est coché « Dossier de familiarisation » dans l\'outil Documents.\n\nEnvoyer quand même ?'))return;

  const btn=document.getElementById('envoi-btn');btn.disabled=true;
  showBanner('Envoi en cours…');
  const token=dossierToken();
  const expire=new Date(Date.now()+DOSSIER_JOURS*86400000).toISOString();
  const saved=await dbInsert('dossiers_familles',{
    enfant_id:e.id,token,email:emails.join(', '),statut:'envoye',
    expire_le:expire,created_by:currentUser?currentUser.id:null
  });
  if(!saved){btn.disabled=false;return showBanner('Impossible de créer le dossier.','error');}

  /* La fonction ne reçoit qu'un identifiant : elle relit elle-même les adresses,
     l'enfant et l'échéance en base, et compose le lien depuis APP_URL. Rien
     d'expédiable ne transite par le navigateur. */
  const ok=await callFn('envoyer-dossier-famille',{dossier_id:saved.id,relance:false});
  enfDossiersCache.unshift(saved);
  closeModal('modal-envoi-wrap');
  enfRenderDossier();
  if(ok)showBanner('Dossier envoyé à '+emails.length+' adresse'+(emails.length>1?'s':'')+' ✅');
  else showBanner('Dossier créé, mais l\'e-mail n\'est pas parti — utilisez « Copier le lien ».','error');
}

async function enfRelancerDossier(id){
  const d=enfDossiersCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Renvoyer le lien à '+d.email+' ?'))return;
  showBanner('Relance en cours…');
  const ok=await callFn('envoyer-dossier-famille',{dossier_id:d.id,relance:true});
  if(!ok)return showBanner('La relance n\'est pas partie.','error');
  /* Le compteur est incrémenté par la fonction, une fois l'envoi accepté :
     on se contente de relire. */
  d.relances=(d.relances||0)+1;
  enfRenderDossier();
  showBanner('Relance envoyée ✅');
}

function enfCopierLien(id){
  const d=enfDossiersCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  const url=dossierLien(d.token);
  navigator.clipboard.writeText(url).then(
    ()=>showBanner('Lien copié — à transmettre par SMS si besoin.'),
    ()=>prompt('Copiez ce lien :',url)
  );
}

async function enfAnnulerDossier(id){
  const d=enfDossiersCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Annuler ce dossier ?\n\nLe lien déjà envoyé cessera immédiatement de fonctionner. Les documents déjà rendus par la famille sont conservés.'))return;
  const ok=await dbUpdate('dossiers_familles',d.id,{statut:'annule'});
  if(!ok)return showBanner('Annulation impossible.','error');
  d.statut='annule';
  enfRenderDossier();
  showBanner('Dossier annulé — le lien ne fonctionne plus.');
}

window.enfLoadDossier = enfLoadDossier;
window.enfOuvrirEnvoi = enfOuvrirEnvoi;
window.enfConfirmerEnvoi = enfConfirmerEnvoi;
window.enfRelancerDossier = enfRelancerDossier;
window.enfCopierLien = enfCopierLien;
window.enfMarquerRecu = enfMarquerRecu;
window.enfAnnulerDossier = enfAnnulerDossier;

window.enfLoadParents = enfLoadParents;
window.openParentModal = openParentModal;
window.editParent = editParent;
window.saveParent = saveParent;
window.deleteParent = deleteParent;

let enfDocTitres = {};  // documentId -> titre

async function enfLoadDocs(enfantId){
  const box = document.getElementById('enf-docs-list');
  try{
    const{data,error}=await sb.from('documents_reponses')
      .select('id,document_id,statut,rempli_par_nom,updated_at,created_at,dossier_id')
      .eq('enfant_id',enfantId)
      .order('updated_at',{ascending:false});
    if(error) throw error;
    enfDocsCache = data||[];
    // charger les titres des documents concernés (une seule requête)
    const ids = [...new Set(enfDocsCache.map(d=>d.document_id).filter(Boolean))]
      .filter(id=>!(id in enfDocTitres));
    if(ids.length){
      const{data:docs}=await sb.from('documents_koala').select('id,titre').in('id',ids);
      (docs||[]).forEach(d=>{enfDocTitres[d.id]=d.titre;});
    }
  }catch(err){
    console.warn('enfLoadDocs',err);
    if(box) box.innerHTML='<div class="empty-state"><i class="ti ti-alert-triangle"></i><p>Impossible de charger les documents.</p></div>';
    return;
  }
  // ne rendre que si on est toujours sur le même enfant
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderDocs();
}

function enfDocTitre(docId){
  return enfDocTitres[docId] || 'Document rempli';
}

function enfRenderDocs(){
  const box = document.getElementById('enf-docs-list');
  if(!box) return;
  if(!enfDocsCache.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-file-off"></i><p>Aucun document rattaché à cet enfant pour le moment.</p></div>';
    return;
  }
  const statutBadge = st => st==='signe'
    ? '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✅ Signé</span>'
    : (st==='remis'
      ? '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">📥 Reçu en main propre</span>'
      : '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">🕓 Préparé</span>');
  box.innerHTML = enfDocsCache.map(d=>{
    const dt = new Date(d.updated_at||d.created_at).toLocaleDateString('fr-FR');
    const titre = escHtml(enfDocTitre(d.document_id));
    const href = 'documents.html?doc='+encodeURIComponent(d.document_id)+'&rep='+encodeURIComponent(d.id)+'&enf='+encodeURIComponent(enfFicheId);
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">'
      + '<div style="min-width:0">'
      + '<div style="font-weight:700;color:var(--koala-dark);font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+titre+'</div>'
      + '<div style="font-size:11.5px;color:var(--muted)">'+dt+(d.rempli_par_nom?' · '+escHtml(d.rempli_par_nom):'')+'</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">'
      + statutBadge(d.statut)
      + '<a href="'+href+'" class="btn-primary" style="text-decoration:none;padding:6px 12px;font-size:12px"><i class="ti ti-signature"></i> Ouvrir / signer</a>'
      + '<button type="button" onclick="enfDeleteDoc(\''+d.id+'\')" title="Supprimer ce document" style="background:var(--red-light,#FDE8E8);color:var(--red);border:none;border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;min-height:36px"><i class="ti ti-trash" style="pointer-events:none"></i><span style="pointer-events:none">Suppr.</span></button>'
      + '</div>'
      + '</div>';
  }).join('');
  // note d'aide sous la liste
  box.innerHTML += '<p style="font-size:11.5px;color:var(--muted);margin-top:6px">« Ouvrir / signer » bascule vers l\u2019outil Documents : on y remplit, génère le PDF et fait signer. Un bouton « Revenir aux documents de l\u2019enfant » ramène ensuite ici pour enchaîner les signatures.</p>';
}

async function enfDeleteDoc(repId){
  showBanner('Suppression du document…');   // retour visuel immédiat (confirme l'appel)
  const d=enfDocsCache.find(x=>String(x.id)===String(repId));
  const titre=d?enfDocTitre(d.document_id):'Document';
  if(!confirm('Supprimer définitivement ce document ?\n\n« '+titre+' »\n\nCette action est irréversible.')){
    showBanner('Suppression annulée.');
    return;
  }
  try{
    const{error}=await sb.from('documents_reponses').delete().eq('id',repId);
    if(error) throw error;
    // retirer de la liste locale et re-render
    enfDocsCache = enfDocsCache.filter(x=>String(x.id)!==String(repId));
    enfRenderDocs();
    showBanner('Document supprimé.');
  }catch(err){
    console.warn('enfDeleteDoc',err);
    showBanner('Suppression impossible : '+((err&&err.message)||'droits insuffisants'),'error');
  }
}

/* ===== Documents administratifs importés (fiche enfant) =====================
   Pièces d'un enfant, distinctes des formulaires remplis/signés via l'outil
   Documents (enf-docs-list) et du carnet de vaccination (table vaccins_pj,
   données de santé). Deux façons d'en obtenir une copie :
   - une référente l'importe directement (remise en main propre, pièce jointe
     reçue par mail) ;
   - la famille la dépose elle-même en ligne, via un lien envoyé par mail
     (voir plus bas « dossier de pièces »), sur le même principe que le
     dossier de familiarisation.
   Les deux passent par la même table et le même bucket : seule la colonne
   piece_key (quelle pièce de la liste ci-dessous) et dossier_id (par quel
   envoi la famille l'a déposée, absent pour un import fait par une référente)
   distinguent leur origine.

   Même schéma de stockage que les photocopies du carnet de vaccination : bucket
   PRIVÉ, aucune URL publique enregistrée — seuls bucket et chemin sont gardés en
   base, une URL signée est générée à chaque ouverture. */
const ENF_ADMIN_DOCS_BUCKET = 'documents-admin';
const ENF_ADMIN_DOCS_TTL    = 300;   // durée de vie d'une URL signée, en secondes

/* Liste figée des pièces demandées à l'inscription. `optionnel` = ne compte
   pas dans la progression (ne concerne que certaines familles). `renouveler`
   = à redéposer chaque année (assurance) ; un exemplaire déposé il y a plus
   de 365 jours est signalé mais ne compte pas comme manquant pour autant —
   la référente juge si un rappel est nécessaire.
   Recopiée dans pieces.html pour la vue famille : si vous modifiez cette
   liste ici, reportez-la là-bas — les deux versions ne se synchronisent pas
   (même choix assumé que pour les modèles de famille.html/documents.html). */
const PIECES_ADMIN = [
  {key:'livret_famille',        label:'Copie du livret de famille'},
  {key:'piece_identite_parents',label:"Copie de la pièce d'identité des parents"},
  {key:'justificatif_domicile', label:'Justificatif de domicile de moins de trois mois'},
  {key:'acte_naissance',        label:"Copie intégrale de l'acte de naissance de l'enfant"},
  {key:'attestation_vitale',    label:'Attestation de la carte vitale'},
  {key:'attestation_rc',        label:'Attestation de responsabilité civile pour l’année en cours',renouveler:true},
  {key:'autorite_parentale',    label:"Justificatif de l'autorité parentale (couples séparés/divorcés)",optionnel:true},
  {key:'avis_imposition',       label:"Copie du dernier avis d'imposition"},
  {key:'bulletin_salaire',      label:'Dernier bulletin de salaire ou attestation Pôle Emploi'},
  {key:'rib',                   label:"Relevé d'identité bancaire"}
];

let enfAdminDocsCache = [];
async function enfLoadAdminDocs(enfantId){
  try{
    const{data,error}=await sb.from('enfants_documents_admin')
      .select('*')
      .eq('enfant_id',enfantId)
      .order('created_at',{ascending:false});
    if(error) throw error;
    enfAdminDocsCache = data||[];
  }catch(err){
    console.warn('enfLoadAdminDocs',err);
    enfAdminDocsCache = [];
  }
  // ne rendre que si on est toujours sur le même enfant
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderAdminDocs();
  /* Ces zones affichent aussi des fichiers de enfAdminDocsCache
     (piece_key='papier_<id>' ou le compteur de pièces reçues) : à redessiner
     si elles ont déjà rendu sans ce cache (course entre requêtes, même
     logique que pour les parents). */
  enfRenderDossier();
  enfRenderFicheSanitaireZone();
  enfRenderPiecesDossier();
}

/* Fichiers déposés pour une pièce donnée, le plus récent d'abord (le cache
   est déjà trié ainsi par enfLoadAdminDocs). */
function enfPiecesPourCle(key){
  return enfAdminDocsCache.filter(d=>d.piece_key===key);
}

const UN_AN_MS = 365*86400000;

function enfRenderAdminDocs(){
  const zone=document.getElementById('enf-admin-docs-zone');
  if(!zone) return;

  const ligneFichier=d=>
    '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
    +'<i class="ti ti-paperclip" style="color:var(--koala);flex-shrink:0"></i>'
    +'<button type="button" onclick="enfAdminDocOpen(\''+d.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(d.filename||'Document')+'</button>'
    +'<span style="font-size:11px;color:var(--muted);white-space:nowrap">'+new Date(d.created_at).toLocaleDateString('fr-FR')+'</span>'
    +'<button onclick="enfAdminDocDelete(\''+d.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px;flex-shrink:0"><i class="ti ti-trash"></i></button>'
    +'</div>';

  const checklist=PIECES_ADMIN.map(p=>{
    const fichiers=enfPiecesPourCle(p.key);
    const dernier=fichiers[0];
    let badge;
    if(!dernier){
      badge=p.optionnel
        ? '<span style="background:var(--koala-light);color:var(--muted);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">— Non concerné / à voir</span>'
        : '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">⚠ Manquant</span>';
    }else{
      const perime=p.renouveler && (Date.now()-new Date(dernier.created_at).getTime())>UN_AN_MS;
      badge='<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✅ Reçu le '+new Date(dernier.created_at).toLocaleDateString('fr-FR')+'</span>'
        +(perime?' <span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">🔄 À renouveler</span>':'');
    }
    return '<div style="border-bottom:1px solid var(--border);padding:9px 2px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<span style="font-size:12.5px;font-weight:600;color:var(--koala-dark)">'+escHtml(p.label)+'</span>'
      +'<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+badge
      +'<button type="button" onclick="enfOpenPieceUpload(\''+p.key+'\')" title="Importer" style="border:1px solid var(--border);background:#fff;border-radius:7px;padding:4px 9px;font-size:11.5px;cursor:pointer;color:var(--koala);display:inline-flex;align-items:center;gap:4px"><i class="ti ti-upload"></i> Importer</button>'
      +'</span></div>'
      +(fichiers.length?'<div style="margin-top:4px">'+fichiers.map(ligneFichier).join('')+'</div>':'')
      +'</div>';
  }).join('');

  const autres=enfAdminDocsCache.filter(d=>!d.piece_key);
  const autresHtml='<div style="margin-top:14px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:6px">Autres documents importés</div>'
    +(autres.length?autres.map(ligneFichier).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucun autre document.</div>')
    +'<button class="btn-sm" style="margin-top:6px" onclick="enfOpenPieceUpload(\'\')"><i class="ti ti-upload"></i> Importer un document hors liste</button>'
    +'</div>';

  zone.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:2px">Pièces demandées à l\'inscription</div>'
    + checklist + autresHtml
    +'<span id="enf-admin-docs-input-status" style="display:block;margin-top:8px;font-size:12px;color:var(--muted)"></span>'
    +'<input type="file" id="enf-admin-docs-input" accept="image/*,application/pdf" multiple style="display:none" onchange="enfHandleAdminDocUpload(event)"/>';
}

/* La pièce ciblée est mémorisée ici le temps du choix de fichier : un seul
   input caché sert toutes les lignes de la checklist plutôt que d'en dupliquer
   un par pièce. */
let enfPieceKeyEnCours='';
function enfOpenPieceUpload(key){
  enfPieceKeyEnCours=key||'';
  const input=document.getElementById('enf-admin-docs-input');
  if(input)input.click();
}

async function enfHandleAdminDocUpload(event){
  const input=event.target;
  const files=Array.from(input.files||[]);
  if(!files.length) return;
  const eid=enfFicheId;
  const pieceKey=enfPieceKeyEnCours||null;
  const status=document.getElementById('enf-admin-docs-input-status');
  let recuKo=false;
  for(const file of files){
    if(status) status.textContent='⏳ Envoi de '+file.name+'…';
    try{
      const ext=(file.name.split('.').pop()||'bin');
      const path=eid+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
      /* Client authentifie et non le client anonyme : le bucket est prive et
         ses policies exigent un compte referent. */
      const{error}=await sb.storage.from(ENF_ADMIN_DOCS_BUCKET).upload(path,file);
      if(error) throw error;
      const{data:ins,error:insErr}=await sb.from('enfants_documents_admin')
        .insert({enfant_id:eid,bucket:ENF_ADMIN_DOCS_BUCKET,path:path,filename:file.name,piece_key:pieceKey}).select().single();
      if(insErr) throw insErr;
      if(ins) enfAdminDocsCache.unshift(ins);
      enfRenderAdminDocs();
      /* Un document « à rapporter en papier » (droit à l'image, fiche
         sanitaire...) dont on importe le scan : l'import vaut confirmation
         de réception, pas besoin de cocher la case à part. */
      if(pieceKey && pieceKey.startsWith('papier_')){
        const ok=await enfMarquerRecuSilencieux(pieceKey.slice('papier_'.length));
        if(!ok)recuKo=true;
        enfRenderDossier();
        enfRenderFicheSanitaireZone();
        enfRenderDocs();
      }
    }catch(e){
      console.error('[enfAdminDocs]',e.message);
      if(status) status.textContent='⚠ Erreur : '+e.message;
      return;
    }
  }
  if(status) status.textContent='✅ Ajouté';
  input.value='';
  if(recuKo)showBanner('Document importé, mais le marquage « reçu » a échoué'+(window._lastDbError?' : '+window._lastDbError:'.'),'error');
  else showBanner('Document(s) importé(s) ✅');
}

async function enfAdminDocOpen(id){
  const d=enfAdminDocsCache.find(x=>String(x.id)===String(id));
  if(!d){alert('Fichier introuvable.');return;}
  const{data,error}=await sb.storage.from(d.bucket||ENF_ADMIN_DOCS_BUCKET).createSignedUrl(d.path,ENF_ADMIN_DOCS_TTL);
  if(error||!data){alert('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'));return;}
  window.open(data.signedUrl,'_blank','noopener');
}

async function enfAdminDocDelete(id){
  if(!confirm('Supprimer ce document ?')) return;
  const d=enfAdminDocsCache.find(x=>String(x.id)===String(id));
  const{error}=await sb.from('enfants_documents_admin').delete().eq('id',id);
  if(error){alert('Erreur : '+error.message);return;}
  /* Le fichier lui-meme est retire du stockage : sans cela il resterait
     indefiniment dans le bucket, hors de toute fiche. */
  if(d){
    const{error:rmErr}=await sb.storage.from(d.bucket||ENF_ADMIN_DOCS_BUCKET).remove([d.path]);
    if(rmErr) console.warn('[enfAdminDocs] fichier non supprime du stockage',rmErr.message);
  }
  enfAdminDocsCache=enfAdminDocsCache.filter(x=>String(x.id)!==String(id));
  enfRenderAdminDocs();
  if(d&&d.piece_key&&d.piece_key.startsWith('papier_')){
    enfRenderDossier();
    enfRenderFicheSanitaireZone();
  }
  showBanner('Document supprimé.');
}
window.enfAdminDocOpen = enfAdminDocOpen;
window.enfAdminDocDelete = enfAdminDocDelete;
window.enfHandleAdminDocUpload = enfHandleAdminDocUpload;
window.enfOpenPieceUpload = enfOpenPieceUpload;

/* ===== Dossier de pièces (envoi d'un lien de dépôt aux parents) ============
   Même principe que le dossier de familiarisation (dossiers_familles /
   famille.html), en parallèle : un envoi = un jeton = un lien public
   (pieces.html), valable PIECES_JOURS jours. La page publique ne touche à
   aucune table directement, tout passe par l'edge function `dossier-pieces`
   en service_role — voir sql/dossiers_pieces.sql. */
let enfPiecesCache = [];   // dossiers de pièces de l'enfant ouvert, plus récent d'abord
let enfPiecesPret  = false;

const PIECES_JOURS = 15;

function piecesLien(token){
  return location.origin + location.pathname.replace(/[^/]*$/,'') + 'pieces.html?t=' + token;
}

async function enfLoadPieces(enfantId){
  try{
    const{data,error}=await sb.from('dossiers_pieces')
      .select('*')
      .eq('enfant_id',enfantId)
      .order('envoye_le',{ascending:false});
    if(error) throw error;
    enfPiecesCache = data||[];
  }catch(err){
    console.warn('enfLoadPieces',err);
    enfPiecesCache = [];
  }
  if(String(enfFicheId)!==String(enfantId)) return;
  enfPiecesPret = true;
  enfRenderPiecesDossier();
}

function enfRenderPiecesDossier(){
  const box=document.getElementById('enf-pieces-dossier-box');
  if(!box) return;
  if(!enfPiecesPret){ box.innerHTML=''; return; }
  const actif=enfPiecesCache.find(d=>d.statut!=='annule' && new Date(d.expire_le)>new Date());
  const possibles=enfDestinataires();

  const cadre=(contenu,fond,bord)=>'<div style="background:'+fond+';border:1px solid '+bord
    +';border-radius:12px;padding:13px 15px">'
    +'<div style="font-weight:700;font-size:13.5px;color:var(--koala-dark);margin-bottom:7px">'
    +'<i class="ti ti-cloud-upload"></i> Dépôt en ligne des documents administratifs</div>'+contenu+'</div>';

  if(!actif){
    if(!possibles.length){
      box.innerHTML=cadre(
        '<p style="font-size:12.5px;color:var(--muted);margin:0;line-height:1.6">'
        +'Aucun parent avec une adresse e-mail. Renseignez-en un dans l\'onglet '
        +'<strong>Parents</strong> pour pouvoir envoyer le lien.</p>','#FFF8F0','#F3DEC2');
      return;
    }
    box.innerHTML=cadre(
      '<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.6">'
      +'Envoie aux parents un lien personnel pour déposer en ligne les pièces demandées ci-dessous. '
      +'Valable '+PIECES_JOURS+' jours.</p>'
      +'<button class="btn-primary" onclick="enfOuvrirEnvoiPieces()"><i class="ti ti-send"></i> Envoyer le lien de dépôt</button>',
      'var(--koala-light)','var(--border)');
    return;
  }

  const requis=PIECES_ADMIN.filter(p=>!p.optionnel);
  const recus=requis.filter(p=>enfPiecesPourCle(p.key).length).length;
  const badge=recus===requis.length
    ? '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">✅ Complet</span>'
    : '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">🕓 En attente</span>';
  const adresses=(actif.email||'').split(',').map(x=>x.trim()).filter(Boolean);

  box.innerHTML=cadre(
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'+badge
    +'<span style="font-size:12px;color:var(--muted)">envoyé le '+new Date(actif.envoye_le).toLocaleDateString('fr-FR')
    +' · expire le '+new Date(actif.expire_le).toLocaleDateString('fr-FR')
    +(actif.relances?' · '+actif.relances+' relance'+(actif.relances>1?'s':''):'')+'</span></div>'
    +'<div style="font-size:12px;color:var(--muted);margin-bottom:9px">'
    +'<i class="ti ti-mail"></i> '+escHtml(adresses.join(' · '))+'</div>'
    +'<div style="font-size:12.5px;color:var(--muted);margin-bottom:9px">'
    +recus+' pièce'+(recus>1?'s':'')+' reçue'+(recus>1?'s':'')+' sur '+requis.length+' demandées (hors pièces non concernées)</div>'
    +'<div style="display:flex;gap:7px;flex-wrap:wrap">'
    +'<button class="btn-sm" onclick="enfCopierLienPieces(\''+actif.id+'\')"><i class="ti ti-link"></i> Copier le lien</button>'
    +'<button class="btn-sm" onclick="enfRelancerPieces(\''+actif.id+'\')"><i class="ti ti-bell"></i> Relancer</button>'
    +'<button class="btn-sm" style="color:var(--red);border-color:var(--red)" onclick="enfAnnulerPieces(\''+actif.id+'\')"><i class="ti ti-x"></i> Annuler</button>'
    +'</div>','var(--koala-light)','var(--border)');
}

function enfOuvrirEnvoiPieces(){
  const possibles=enfDestinataires();
  if(!possibles.length)return showBanner('Aucun parent avec une adresse e-mail.','error');
  const defaut=new Set(enfDestinatairesParDefaut().map(p=>p.id));
  document.getElementById('envoi-pieces-liste').innerHTML=possibles.map(p=>
    '<label style="display:flex;align-items:flex-start;gap:9px;padding:9px 2px;border-bottom:1px solid var(--border);cursor:pointer">'
    +'<input type="checkbox" class="envoi-pieces-dest" value="'+escHtml(p.email)+'"'+(defaut.has(p.id)?' checked':'')+' style="margin-top:3px">'
    +'<span><span style="font-weight:700;font-size:13px">'+escHtml(enfNomParent(p))+'</span>'
    +'<span style="display:block;font-size:12px;color:var(--muted)">'+escHtml(p.email)
    +(p.lien&&PAR_LIENS[p.lien]?' · '+escHtml(PAR_LIENS[p.lien]):'')+'</span></span></label>'
  ).join('');
  document.getElementById('envoi-pieces-vide').style.display='none';
  document.getElementById('envoi-pieces-btn').disabled=false;
  document.getElementById('modal-envoi-pieces-wrap').classList.add('open');
}

async function enfConfirmerEnvoiPieces(){
  const emails=[...document.querySelectorAll('.envoi-pieces-dest:checked')].map(c=>c.value);
  const err=document.getElementById('envoi-pieces-vide');
  if(!emails.length){
    err.textContent='Cochez au moins une adresse.';err.style.display='block';return;
  }
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e)return;

  const btn=document.getElementById('envoi-pieces-btn');btn.disabled=true;
  showBanner('Envoi en cours…');
  const token=dossierToken();
  const expire=new Date(Date.now()+PIECES_JOURS*86400000).toISOString();
  const saved=await dbInsert('dossiers_pieces',{
    enfant_id:e.id,token,email:emails.join(', '),statut:'envoye',
    expire_le:expire,created_by:currentUser?currentUser.id:null
  });
  if(!saved){btn.disabled=false;return showBanner('Impossible de créer le dossier.','error');}

  /* La fonction ne reçoit que l'identifiant du dossier et le lien déjà
     composé côté client : elle n'a besoin de connaître ni l'origine de
     l'app, ni aucun secret supplémentaire. */
  const ok=await callFn('envoyer-dossier-pieces',{dossier_id:saved.id,relance:false,lien:piecesLien(token)});
  enfPiecesCache.unshift(saved);
  closeModal('modal-envoi-pieces-wrap');
  enfRenderPiecesDossier();
  if(ok)showBanner('Lien envoyé à '+emails.length+' adresse'+(emails.length>1?'s':'')+' ✅');
  else showBanner('Dossier créé, mais l\'e-mail n\'est pas parti — utilisez « Copier le lien ».','error');
}

async function enfRelancerPieces(id){
  const d=enfPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Renvoyer le lien à '+d.email+' ?'))return;
  showBanner('Relance en cours…');
  const ok=await callFn('envoyer-dossier-pieces',{dossier_id:d.id,relance:true,lien:piecesLien(d.token)});
  if(!ok)return showBanner('La relance n\'est pas partie.','error');
  d.relances=(d.relances||0)+1;
  enfRenderPiecesDossier();
  showBanner('Relance envoyée ✅');
}

function enfCopierLienPieces(id){
  const d=enfPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  const url=piecesLien(d.token);
  navigator.clipboard.writeText(url).then(
    ()=>showBanner('Lien copié — à transmettre par SMS si besoin.'),
    ()=>prompt('Copiez ce lien :',url)
  );
}

async function enfAnnulerPieces(id){
  const d=enfPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Annuler ce dossier ?\n\nLe lien déjà envoyé cessera immédiatement de fonctionner. Les pièces déjà déposées par la famille sont conservées.'))return;
  const ok=await dbUpdate('dossiers_pieces',d.id,{statut:'annule'});
  if(!ok)return showBanner('Annulation impossible.','error');
  d.statut='annule';
  enfRenderPiecesDossier();
  showBanner('Dossier annulé — le lien ne fonctionne plus.');
}

window.enfLoadPieces = enfLoadPieces;
window.enfOuvrirEnvoiPieces = enfOuvrirEnvoiPieces;
window.enfConfirmerEnvoiPieces = enfConfirmerEnvoiPieces;
window.enfRelancerPieces = enfRelancerPieces;
window.enfCopierLienPieces = enfCopierLienPieces;
window.enfAnnulerPieces = enfAnnulerPieces;

window.enfInit = enfInit;
window.enfRender = enfRender;
window.enfOpenFiche = enfOpenFiche;
window.enfFicheTab = enfFicheTab;
window.enfDeleteDoc = enfDeleteDoc;

/* ===================== CONTRATS D’ACCUEIL (fiche enfant) ===================== */
/* Table Supabase `enfants_contrats` : historique de contrats par enfant.
   jours = tableau JSON [1..5] (1 = lundi). Sert de base au bouton
   « Appliquer les contrats » du module Présences. */

const CT_JOURS=[[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi']];
/* Codes repas utilisés sur la feuille de présence hebdomadaire (transmise au traiteur / à l'administratif).
   BB = repas légumes sans protéines, M = repas moyen, G = repas grand. La lettre est proposée
   d'après la tranche d'âge puis modifiable sur la fiche enfant (voir enfRepasCode) ; le suffixe
   vient du régime particulier de la fiche. Ajouter un code ici l'ajoute automatiquement aux
   totaux de l'export Excel. */
const REPAS_TYPES={
  BIB:'Biberon (pas de repas traiteur)',
  BB:'Repas légumes sans protéines',
  M:'Repas moyen',
  G:'Repas grand',
  MSV:'Repas moyen — sans viande',
  GSV:'Repas grand — sans viande',
  MSPV:'Repas moyen — sans protéine de vache',
  GSPV:'Repas grand — sans protéine de vache',
  MSPA:'Repas moyen — sans protéine animale',
  GSPA:'Repas grand — sans protéine animale',
  BBSV:'Repas légumes sans protéines — sans viande',
  BBSPV:'Repas légumes sans protéines — sans protéine de vache',
  BBSPA:'Repas légumes sans protéines — sans protéine animale'
};
/* Régimes particuliers — mêmes sigles que la légende du bon de commande MCM. */
const REGIMES={SV:'Sans viande',SPV:'Sans protéine de vache',SPA:'Sans protéine animale'};
function repasLabel(code){ return code?(REPAS_TYPES[code]||code):''; }
/* Code repas = lettre de base + suffixe de régime particulier.

   BB (repas légumes sans protéines), M (moyen) et G (grand) sont les trois
   préparations du traiteur. La lettre est proposée d'après la tranche d'âge,
   mais l'âge ne décide pas de ce que l'enfant mange : le champ `repas_base` de
   la fiche permet de la forcer. Laissé vide, il reste déduit de l'âge et suit
   automatiquement les anniversaires.

   Le suffixe (`regime_repas` : '' | 'SV' | 'SPV' | 'SPA') se combine à la
   lettre, y compris sur BB — un enfant intolérant aux protéines de vache doit
   rester repérable partout, sans quoi l'écran contredirait le bon de commande. */
function enfRepasBaseAuto(e){
  if(!e)return'';
  const groupe=e.dob?groupeFromDob(e.dob):(e.groupe||'');
  if(groupe.indexOf('Bébé')>=0)return'BB';
  if(groupe.indexOf('Moyen')>=0)return'M';
  if(groupe.indexOf('Grand')>=0)return'G';
  return'';
}
function enfRepasCode(e){
  if(!e)return'';
  const base=e.repas_base||enfRepasBaseAuto(e);
  if(!base)return'';
  // Un enfant au biberon ne reçoit pas de plat : lui accoler un régime n'aurait aucun sens.
  if(base==='BIB')return'BIB';
  return e.regime_repas?base+e.regime_repas:base;
}

/* ── GOÛTER ────────────────────────────────────────────────────────────────
   Le bon MCM n'a que deux lignes de goûter : « bébé » et « grand ». Par défaut
   elles découlent du code repas — M en goûter bébé, G et périscolaire en goûter
   grand, BB sans goûter. Mais manger un repas moyen n'empêche pas de prendre le
   goûter des grands : le champ `gouter_base` de la fiche ('' | 'gbb' | 'ggr')
   permet de dissocier les deux. Laissé vide, le goûter continue de suivre le repas
   et donc les anniversaires. */
function enfGouterAuto(e){
  if(!e)return null;
  const base=e.repas_base||enfRepasBaseAuto(e);
  if(!base||base==='BIB'||base==='BB')return null;
  return base==='M'?'gbb':'ggr';
}
function enfGouterLigne(e){
  if(!e)return null;
  const base=e.repas_base||enfRepasBaseAuto(e);
  if(base==='BIB')return null;              // au biberon : ni repas ni goûter
  return e.gouter_base||enfGouterAuto(e);
}
let enfContratsCache=[], editingContratId=null, ctJoursSel=[];

function ctFmtDate(s){ if(!s) return ''; const d=new Date(s+'T00:00:00'); return isNaN(d)?'':d.toLocaleDateString('fr-FR'); }
function ctFmtHeure(s){ return s?String(s).slice(0,5).replace(':','h'):''; }
/* `jours` peut revenir en tableau (jsonb), en chaîne JSON "[1,2]" ou en "1,2"
   selon la façon dont la ligne a été créée : on normalise dans tous les cas. */
function ctParseJours(j){
  if(j==null) return [];
  let v=j;
  if(typeof v==='string'){
    const t=v.trim();
    try{ v=JSON.parse(t); }catch(e){ v=t.replace(/[{}\[\]"']/g,'').split(','); }
  }
  if(!Array.isArray(v)) v=[v];
  return v.map(x=>parseInt(x,10)).filter(n=>n>=1&&n<=7);
}
function ctJoursLabel(j){
  const arr=ctParseJours(j).sort((a,b)=>a-b);
  if(!arr.length) return '—';
  return arr.map(n=>(CT_JOURS.find(x=>x[0]===n)||[n,'?'])[1]).join(', ');
}
/* 'encours' | 'avenir' | 'termine' pour la date du jour */
function ctStatut(c,ref){
  const t=ref||todayStr();
  if(c.date_debut&&c.date_debut>t) return 'avenir';
  if(c.date_fin&&c.date_fin<t) return 'termine';
  return 'encours';
}
function ctBadge(st){
  if(st==='encours') return '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">En cours</span>';
  if(st==='avenir')  return '<span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">À venir</span>';
  return '<span style="background:#eee;color:var(--muted);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Terminé</span>';
}

async function enfLoadContrats(enfantId){
  const box=document.getElementById('enf-fiche-contrat');
  try{
    const{data,error}=await sb.from('enfants_contrats').select('*')
      .eq('enfant_id',enfantId).order('date_debut',{ascending:false});
    if(error) throw error;
    enfContratsCache=data||[];
  }catch(err){
    console.warn('enfLoadContrats',err);
    if(box) box.innerHTML='<div class="empty-state"><i class="ti ti-alert-triangle"></i><p>Impossible de charger les contrats.</p></div>';
    return;
  }
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderContrat();
}

function enfRenderContrat(){
  const box=document.getElementById('enf-fiche-contrat');
  if(!box) return;
  const btnNew='<div style="margin-bottom:12px"><button class="btn-primary" onclick="ctOpen()"><i class="ti ti-plus"></i> Nouveau contrat</button></div>';
  if(!enfContratsCache.length){
    box.innerHTML=btnNew+'<div class="empty-state"><i class="ti ti-file-off"></i><p>Aucun contrat enregistré pour cet enfant.</p></div>';
    return;
  }
  box.innerHTML=btnNew+enfContratsCache.map(c=>{
    const st=ctStatut(c);
    const periode=ctFmtDate(c.date_debut)+' → '+(c.date_fin?ctFmtDate(c.date_fin):'sans terme');
    const horaires=(c.heure_debut||c.heure_fin)?(ctFmtHeure(c.heure_debut)||'?')+' – '+(ctFmtHeure(c.heure_fin)||'?'):'horaires non renseignés';
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
      + '<div style="font-weight:700;color:var(--koala-dark);font-size:13.5px">'+escHtml(periode)+'</div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'+ctBadge(st)
      + '<button type="button" class="btn-sm" onclick="ctOpen(\''+c.id+'\')"><i class="ti ti-edit"></i> Modifier</button>'
      + '</div></div>'
      + '<div style="font-size:12px;color:var(--muted);margin-top:6px"><i class="ti ti-clock"></i> '+escHtml(horaires)+'</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-top:2px"><i class="ti ti-calendar"></i> '+escHtml(ctJoursLabel(c.jours))+'</div>'
      + (c.notes?'<div style="font-size:12px;color:var(--muted);margin-top:6px;white-space:pre-wrap">'+escHtml(c.notes)+'</div>':'')
      + '</div>';
  }).join('')
  + '<p style="font-size:11.5px;color:var(--muted);margin-top:6px">Le bouton « Appliquer les contrats » du module Présences marque présents, pour la date affichée, tous les enfants dont un contrat couvre ce jour.</p>';
}

function ctRenderJours(){
  const box=document.getElementById('ct-jours');
  if(!box) return;
  box.innerHTML=CT_JOURS.map(function(j){
    return '<button type="button" class="fchip'+(ctJoursSel.indexOf(j[0])>=0?' active':'')+'" onclick="ctToggleJour('+j[0]+')">'+j[1]+'</button>';
  }).join('');
}
function ctToggleJour(n){
  const i=ctJoursSel.indexOf(n);
  if(i>=0) ctJoursSel.splice(i,1); else ctJoursSel.push(n);
  ctRenderJours();
}

function ctOpen(id){
  if(!enfFicheId) return;
  const c=id?enfContratsCache.find(x=>String(x.id)===String(id)):null;
  editingContratId=c?c.id:null;
  document.getElementById('contrat-modal-title').innerHTML='<i class="ti ti-file-certificate"></i> '+(c?'Modifier le contrat':'Nouveau contrat');
  document.getElementById('ct-debut').value=c&&c.date_debut?c.date_debut:'';
  document.getElementById('ct-fin').value=c&&c.date_fin?c.date_fin:'';
  document.getElementById('ct-h1').value=c&&c.heure_debut?String(c.heure_debut).slice(0,5):'';
  document.getElementById('ct-h2').value=c&&c.heure_fin?String(c.heure_fin).slice(0,5):'';
  document.getElementById('ct-notes').value=c&&c.notes?c.notes:'';
  ctJoursSel=c?ctParseJours(c.jours):[1,2,3,4,5];
  ctRenderJours();
  document.getElementById('ct-btn-delete').style.display=c?'':'none';
  document.getElementById('modal-contrat-wrap').classList.add('open');
}

async function ctSave(){
  if(!enfFicheId) return;
  const debut=document.getElementById('ct-debut').value;
  if(!debut){ showBanner('La date de d\u00e9but du contrat est obligatoire.','error'); return; }
  const fin=document.getElementById('ct-fin').value||null;
  if(fin&&fin<debut){ showBanner('La date de fin doit \u00eatre post\u00e9rieure \u00e0 la date de d\u00e9but.','error'); return; }
  const row={
    enfant_id:enfFicheId,
    date_debut:debut,
    date_fin:fin,
    heure_debut:document.getElementById('ct-h1').value||null,
    heure_fin:document.getElementById('ct-h2').value||null,
    jours:ctJoursSel.slice().sort(function(a,b){return a-b;}),
    notes:(document.getElementById('ct-notes').value||'').trim()||null
  };
  let ok;
  if(editingContratId){
    row.updated_at=new Date().toISOString();
    ok=await dbUpdate('enfants_contrats',editingContratId,row);
  }else{
    ok=!!(await dbInsert('enfants_contrats',row));
  }
  if(!ok){ showBanner('Enregistrement impossible : '+((window._lastDbError)||'droits insuffisants'),'error'); return; }
  closeModal('modal-contrat-wrap');
  showBanner(editingContratId?'Contrat modifi\u00e9 \u2705':'Contrat ajout\u00e9 \u2705');
  await enfLoadContrats(enfFicheId);
}

async function ctDelete(){
  if(!editingContratId) return;
  if(!confirm('Supprimer d\u00e9finitivement ce contrat ?')) return;
  const ok=await dbDelete('enfants_contrats',editingContratId);
  if(!ok){ showBanner('Suppression impossible.','error'); return; }
  closeModal('modal-contrat-wrap');
  showBanner('Contrat supprim\u00e9.');
  await enfLoadContrats(enfFicheId);
}

window.enfLoadContrats=enfLoadContrats;
window.enfRenderContrat=enfRenderContrat;
window.ctOpen=ctOpen;
window.ctToggleJour=ctToggleJour;
window.ctSave=ctSave;
window.ctDelete=ctDelete;

/* --- Lien avec le module Présences ------------------------------------- */
/* Marque présents (matin + après-midi) les enfants de la crèche affichée dont
   un contrat couvre la date affichée et inclut le jour de la semaine. */
async function presApplyContrats(){
  const dateStr=document.getElementById('presence-date')?.value||todayStr();
  const crecheId=getPresenceCrecheId();
  if(isDirection&&!crecheId){ showBanner('S\u00e9lectionnez d\u2019abord une cr\u00e8che.','error'); return; }
  const d=new Date(dateStr+'T00:00:00');
  const jour=(d.getDay()===0)?7:d.getDay();          // 1 = lundi … 7 = dimanche
  const enfants=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):cacheEnfants.slice());
  const ids=enfants.map(e=>e.id);
  if(!ids.length){ showBanner('Aucun enfant dans cette cr\u00e8che.','error'); return; }
  let contrats=[];
  try{
    const{data,error}=await sb.from('enfants_contrats').select('*').in('enfant_id',ids);
    if(error) throw error;
    contrats=data||[];
  }catch(err){
    console.warn('presApplyContrats lecture',err);
    showBanner('Lecture des contrats impossible : '+((err&&err.message)||'droits insuffisants'),'error');
    return;
  }
  console.log('[Contrats] date='+dateStr+' jour='+jour+' enfants='+ids.length+' contrats lus='+contrats.length);
  if(!contrats.length){
    showBanner('Aucun contrat enregistr\u00e9 pour les enfants de cette cr\u00e8che. Cr\u00e9ez-les dans l\u2019onglet Contrat de la fiche enfant.','error');
    return;
  }
  // Diagnostic ligne \u00e0 ligne : on trace la raison du rejet de chaque contrat
  const rejets={avant:0,apres:0,jour:0};
  const diag=[];
  const concernes=contrats.filter(function(c){
    const j=ctParseJours(c.jours);
    let motif='OK';
    if(c.date_debut&&c.date_debut>dateStr) motif='contrat pas encore commenc\u00e9';
    else if(c.date_fin&&c.date_fin<dateStr) motif='contrat termin\u00e9';
    else if(j.indexOf(jour)<0) motif='jour non coch\u00e9';
    const e=cacheEnfants.find(x=>String(x.id)===String(c.enfant_id));
    diag.push({enfant:e?((e.prenom||'')+' '+(e.nom||'')).trim():String(c.enfant_id),
      debut:c.date_debut,fin:c.date_fin,jours_bruts:JSON.stringify(c.jours),jours_lus:j.join('/'),motif:motif});
    if(motif!=='OK'){
      if(motif.indexOf('commenc')>=0)rejets.avant++;
      else if(motif.indexOf('termin')>=0)rejets.apres++;
      else rejets.jour++;
      return false;
    }
    return true;
  }).map(c=>String(c.enfant_id));
  if(console.table) console.table(diag); else console.log(diag);
  const uniques=[...new Set(concernes)];
  if(!uniques.length){
    const nomJour=(CT_JOURS.find(x=>x[0]===jour)||[jour,'ce jour'])[1].toLowerCase();
    showBanner('Aucun des '+contrats.length+' contrat(s) ne couvre le '+nomJour+' '+ctFmtDate(dateStr)+' : '
      +rejets.avant+' pas encore commenc\u00e9(s), '+rejets.apres+' termin\u00e9(s), '+rejets.jour+' sans ce jour coch\u00e9. D\u00e9tail dans la console (F12).','error');
    return;
  }
  // Enfants déjà marqués présents ce jour : on ne les retouche pas
  const{data:dejaPres}=await sb.from('presences').select('enfant_id')
    .eq('presence_date',dateStr).in('enfant_id',uniques);
  const deja=new Set((dejaPres||[]).map(p=>String(p.enfant_id)));
  const aAjouter=uniques.filter(id=>!deja.has(id));
  if(!aAjouter.length){ showBanner('Tous les enfants sous contrat sont d\u00e9j\u00e0 pointer\u00e9s ce jour.'); return; }
  const noms=aAjouter.map(function(id){
    const e=cacheEnfants.find(x=>String(x.id)===String(id));
    return e?((e.prenom||'')+' '+(e.nom||'')).trim():'?';
  }).sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
  const label=d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});
  if(!confirm('Marquer pr\u00e9sents ('+label+') :\n\n\u2022 '+noms.join('\n\u2022 ')+'\n\nSoit '+noms.length+' enfant(s).')) return;
  const rows=[];
  aAjouter.forEach(function(id){
    rows.push({enfant_id:id,presence_date:dateStr,slot:'M',status:'present'});
    rows.push({enfant_id:id,presence_date:dateStr,slot:'A',status:'present'});
  });
  const{error}=await sb.from('presences').insert(rows);
  if(error){ console.warn('presApplyContrats insert',error); showBanner('Enregistrement impossible : '+(error.message||''),'error'); return; }
  // On bascule sur \u00ab Pr\u00e9sents uniquement \u00bb : les enfants sans contrat ce jour
  // n\u2019encombrent plus la feuille de pr\u00e9sence (le chip permet de les r\u00e9afficher).
  presOnlyPresents=true;
  localStorage.setItem('presOnlyPresents','1');
  presSyncFilterChip();
  showBanner(noms.length+' enfant(s) marqu\u00e9(s) pr\u00e9sent(s) d\u2019apr\u00e8s les contrats.');
  renderPresence();
}
window.presApplyContrats=presApplyContrats;


