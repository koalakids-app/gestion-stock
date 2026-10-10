

/* ===================== MODULE ENFANTS (dossier central) ===================== */
/* Liste des enfants (directrice technique = sa crèche, direction = toutes), fiche à onglets
   Identité + Documents. Les documents proviennent de documents_reponses filtrées
   par enfant_id. Le RLS garantit que la directrice technique ne voit que sa crèche. */

let enfFicheId = null;
let enfDocsCache = [];
let enfShowIncompleteOnly = false;
let enfShowArchivedOnly = false;

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

/* ===================== ARCHIVAGE (enfants sortis) =====================
   Un dossier est « archivé » quand archive_le est renseigné — toujours à la
   main, depuis la fiche, jamais automatiquement (voir sql/archivage_dossiers.sql).
   La liste principale exclut les dossiers archivés par défaut ; ce bouton
   bascule vers la vue inverse, comme pour les fiches incomplètes. */
function enfIsArchived(e){
  return !!e.archive_le;
}
// « Sorti » : date de sortie passée, mais pas encore archivé — c'est ce qui
// déclenche l'affichage du bouton « Archiver ce dossier » sur la fiche.
// date_sortie n'est pas toujours remise à jour à chaque renouvellement de
// contrat (elle peut dater d'une année scolaire précédente) : avant de
// conclure qu'un enfant est sorti, on vérifie qu'aucun contrat (ancien
// enfants_contrats ou nouveau contrats signé/contresigné) ne couvre encore
// une date future — voir enfChargerContratsFin().
function enfIsSorti(e){
  if(enfIsArchived(e) || !e.date_sortie || e.date_sortie > todayStr()) return false;
  const finContrat = enfContratsFinCache[e.id];
  if(finContrat && finContrat > e.date_sortie) return false;
  return true;
}

// Date de fin la plus tardive connue, tous contrats confondus (les deux
// tables coexistent : enfants_contrats est l'ancien système, contrats le
// nouveau avec signature). Chargé une fois à l'ouverture du module,
// suffisant pour un indicateur — pas besoin de le retenir à jour à la
// seconde près.
let enfContratsFinCache = {};
async function enfChargerContratsFin(){
  try{
    const[{data:ec},{data:c}]=await Promise.all([
      sb.from('enfants_contrats').select('enfant_id,date_fin'),
      sb.from('contrats').select('enfant_id,date_fin').in('statut',['signe','contresigne'])
    ]);
    const cache={};
    (ec||[]).concat(c||[]).forEach(row=>{
      if(!row.enfant_id||!row.date_fin)return;
      if(!cache[row.enfant_id]||row.date_fin>cache[row.enfant_id])cache[row.enfant_id]=row.date_fin;
    });
    enfContratsFinCache=cache;
  }catch(err){
    console.warn('enfChargerContratsFin',err);
  }
  enfRender();
  if(enfFicheId)enfRenderIdentite();
}
function enfToggleArchived(){
  enfShowArchivedOnly = !enfShowArchivedOnly;
  const btn=document.getElementById('enf-archived-toggle');
  if(btn){btn.style.background = enfShowArchivedOnly ? '#EEEDF8' : '';btn.style.borderColor = enfShowArchivedOnly ? 'var(--koala)' : '';}
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
  enfChargerContratsFin();
}

function enfGetListe(opts){
  opts = opts || {};
  let list = cacheEnfants.slice();
  // directrice technique : sa crèche uniquement
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
  // Les dossiers archivés sont exclus de la vue par défaut : ils ne sortent
  // que via le bouton « Voir les archives », qui inverse le filtre.
  if(!opts.skipArchivedFilter){
    list = list.filter(e=>enfIsArchived(e)===enfShowArchivedOnly);
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
    const n = enfGetListe({skipIncompleteFilter:true,skipArchivedFilter:true}).filter(e=>!enfIsArchived(e)).filter(enfIsIncomplete).length;
    countBadge.textContent = n;
    countBadge.style.display = n>0 ? '' : 'none';
  }
  const archivedBadge = document.getElementById('enf-archived-count');
  if(archivedBadge){
    const n = enfGetListe({skipArchivedFilter:true}).filter(enfIsArchived).length;
    archivedBadge.textContent = n;
    archivedBadge.style.display = n>0 ? '' : 'none';
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
    el.innerHTML = '<div class="empty-state"><i class="ti ti-mood-kid"></i><p>'+(enfShowArchivedOnly?'Aucun dossier archivé.':(enfShowIncompleteOnly?'Aucune fiche incomplète 🎉':'Aucun enfant.'))+'</p></div>';
    return;
  }
  el.innerHTML = enfants.map(e=>{
    const creche = cacheCreches.find(c=>c.id===e.creche_id);
    const grp = e.dob ? groupeFromDob(e.dob) : (e.groupe||'');
    const incomplete = enfIsIncomplete(e);
    let warn = incomplete ? '<span title="Fiche incomplète : date de naissance ou allergies non renseignées" style="color:#e8a33d;font-size:15px;flex-shrink:0"><i class="ti ti-alert-triangle"></i></span>' : '';
    if(enfIsArchived(e)) warn = '<span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Archivé</span>';
    else if(enfIsSorti(e)) warn += '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Sorti</span>';
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
  enfContratsCache = [];
  enfAbsencesCache = []; enfAbsencesPret = false;
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
  enfLoadAbsences(e.id);
  enfEnsureFermetures();
  document.getElementById('enf-docs-list').innerHTML = '<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
  document.getElementById('enf-dossier-box').innerHTML = '';
  document.getElementById('enf-pieces-dossier-box').innerHTML = '';
  document.getElementById('enf-admin-docs-zone').innerHTML = '';
  document.getElementById('enf-doc-ext-zone').innerHTML = '';
  document.getElementById('enf-fiche-sanitaire-zone').innerHTML = '';
  document.getElementById('enf-pai-zone').innerHTML = '';
  enfRenderSuiviZone(e.id);
  document.getElementById('enf-carnet-zone').innerHTML = '';
  document.getElementById('enf-vaccins-zone').innerHTML = '';
  document.getElementById('modal-enf-fiche-wrap').classList.add('open');
  // charger les documents et le dossier famille en arrière-plan
  enfLoadDocs(e.id);
  enfLoadDossier(e.id);
  enfLoadAdminDocs(e.id);
  enfLoadPieces(e.id);
  enfLoadCarnet(e.id);
  enfLoadPai(e.id);
  enfLoadVaccinsStatus(e.id);
  enfLoadDocExt(e.id);
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
   goûter suit le repas : c'est une information que la directrice technique doit pouvoir lire
   sans ouvrir le formulaire de modification. */
function enfGouterFicheLigne(e){
  const base=e.repas_base||enfRepasBaseAuto(e);
  if(!base)return'<span style="color:var(--muted)">—</span>';
  if(base==='BIB')return'<span style="color:var(--muted)">aucun (biberon)</span>';
  const g=enfGouterLigne(e);
  if(!g)return'<span style="color:var(--muted)">aucun (avant 6 mois)</span>';
  const forcee=e.gouter_base||'';
  const auto=enfGouterAuto(e);
  const lbl=function(v){return v==='gbb'?'bébé':'grand';};
  let s='<span style="display:inline-block;background:'+(forcee?'var(--orange-light)':'var(--koala-light)')
    +';color:'+(forcee?'var(--orange-dark)':'var(--koala)')
    +';border-radius:6px;padding:1px 7px;font-weight:800">Goûter '+lbl(g)+'</span>';
  if(forcee&&auto&&forcee!==auto)s+='<div style="font-size:11px;color:var(--orange-dark);font-weight:400">forcé — l’âge donnerait '+lbl(auto)+'</div>';
  else if(forcee)s+='<div style="font-size:11px;color:var(--orange-dark);font-weight:400">forcé</div>';
  else s+='<div style="font-size:11px;color:var(--muted);font-weight:400">suit l’âge</div>';
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
      (e.naissance_provisoire
        ? '<div style="background:#FFF6DC;border-left:4px solid #B8860B;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#B8860B">'
          +'<i class="ti ti-alert-triangle"></i> Date de naissance <b>provisoire</b> (terme prévu, enfant pas encore né) — '
          +'corrigez-la ci-dessous dès la naissance connue.</div>'
        : '')
    + row('Prénom', escHtml(e.prenom||''))
    + row('Nom', escHtml(e.nom||''))
    + row(e.naissance_provisoire?'Date de naissance (terme prévu)':'Date de naissance',
        e.dob ? escHtml(vacFmtDate(e.dob)) : '')
    + row('Groupe', escHtml(grp))
    + row('Crèche', creche?escHtml(creche.name):'')
    + row('Date de sortie', e.date_sortie ? escHtml(vacFmtDate(e.date_sortie)) : '')
    + row('Statut du dossier', enfStatutBadge(e))
    + row('Allergies', escHtml(e.allergies||''))
    + row('Protection', e.taille_couche ? escHtml((e.type_couche==='culotte'?'Couche-culotte':'Couche classique')+' — taille '+e.taille_couche) : '')
    + (e.taille_couche ? row('Besoin mensuel de couches', enfBesoinCoucheLigne(e)) : '')
    + row('Repas', enfRepasFicheLigne(e))
    + row('Goûter', enfGouterFicheLigne(e))
    + row('Code image (kiosque)', kkPictosLigne(e.code_pictos))
    + '<div style="display:flex;gap:6px;justify-content:flex-end;margin:-4px 0 10px;flex-wrap:wrap">'+kkPictosActions(e.id,e.creche_id,e.code_pictos)+'</div>'
    + enfArchivageBox(e)
    + '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn-primary" onclick="editEnfant(\''+e.id+'\')"><i class="ti ti-edit"></i> Modifier la fiche</button></div>';
}

/* ===================== ARCHIVAGE (suite) : badge de statut + bloc d'action
   sur la fiche. Le délai de conservation (5 ans après la sortie, prescription
   contractuelle — voir la proposition d'archivage) n'est affiché qu'à titre
   indicatif ici : rien n'est purgé automatiquement, c'est à la direction de
   s'en charger le moment venu. */
function enfDatePlusAns(iso,ans){
  const d=new Date(iso+'T00:00:00');
  d.setFullYear(d.getFullYear()+ans);
  return d.toISOString().slice(0,10);
}
function enfStatutBadge(e){
  if(enfIsArchived(e)){
    return '<span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">Archivé le '+escHtml(vacFmtDate(e.archive_le.slice(0,10)))+'</span>';
  }
  if(enfIsSorti(e)){
    return '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">Sorti</span>';
  }
  return '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">Actif</span>';
}
function enfArchivageBox(e){
  if(enfIsArchived(e)){
    const purge=e.date_sortie?enfDatePlusAns(e.date_sortie,5):null;
    return '<div style="background:var(--koala-light);border-left:4px solid var(--koala);border-radius:0 8px 8px 0;padding:10px 14px;margin-top:10px;font-size:12.5px;color:var(--koala-dark)">'
      +'<i class="ti ti-archive"></i> Dossier archivé le '+escHtml(vacFmtDate(e.archive_le.slice(0,10)))+'.'
      +(purge?' Conservation légale recommandée jusqu\'au '+escHtml(vacFmtDate(purge))+' (5 ans après la sortie), au-delà duquel le dossier peut être purgé/anonymisé.':'')
      +'<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'
      +'<button class="btn-sm" onclick="enfDesarchiverDossier(\''+e.id+'\')"><i class="ti ti-archive-off"></i> Réactiver ce dossier</button>'
      +'<button class="btn-sm" onclick="enfExporterDocuments(\''+e.id+'\')" title="Télécharge un .zip de tous les documents du dossier, à conserver hors ligne (disque externe), puis les retire du stockage en ligne"><i class="ti ti-cloud-download"></i> Exporter les documents et libérer l\'espace</button>'
      +'</div>'
      +'</div>';
  }
  if(enfIsSorti(e)){
    return '<div style="background:var(--orange-light,#FDEBD8);border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:10px 14px;margin-top:10px;font-size:12.5px;color:var(--orange-dark,#a15a12)">'
      +'<i class="ti ti-alert-triangle"></i> Ce dossier est sorti depuis le '+escHtml(vacFmtDate(e.date_sortie))+'. '
      +'Une fois les documents à jour, il peut être archivé pour sortir des listes actives.'
      +'<div style="margin-top:8px"><button class="btn-sm" onclick="enfArchiverDossier(\''+e.id+'\')"><i class="ti ti-archive"></i> Archiver ce dossier</button></div>'
      +'</div>';
  }
  return '';
}
async function enfArchiverDossier(id){
  const e=cacheEnfants.find(x=>String(x.id)===String(id));
  if(!e)return;
  if(!confirm('Archiver le dossier de '+(e.prenom||'')+' '+(e.nom||'')+' ?\n\nLe dossier sortira des listes actives (planning, présences…) mais reste consultable dans les archives. Cette action est réversible.'))return;
  const row={archive_le:new Date().toISOString(),archive_par:currentUser?currentUser.id:null};
  const ok=await dbUpdateStrict('enfants',id,row);
  if(!ok){showBanner('Erreur lors de l\'archivage'+(window._lastDbError?' : '+window._lastDbError:'.'),'error');return;}
  Object.assign(e,row);
  enfRenderIdentite();
  enfRender();
  showBanner('Dossier archivé.');
}
window.enfArchiverDossier=enfArchiverDossier;
async function enfDesarchiverDossier(id){
  if(!confirm('Réactiver ce dossier et le remettre dans les listes actives ?'))return;
  const row={archive_le:null,archive_par:null};
  const ok=await dbUpdateStrict('enfants',id,row);
  if(!ok){showBanner('Erreur.','error');return;}
  const e=cacheEnfants.find(x=>String(x.id)===String(id));
  if(e)Object.assign(e,row);
  enfRenderIdentite();
  enfRender();
  showBanner('Dossier réactivé.');
}
window.enfDesarchiverDossier=enfDesarchiverDossier;

/* ===================== EXPORT DES DOCUMENTS PUIS PURGE DU STOCKAGE =========
   Réservé aux dossiers archivés (voir enfArchivageBox). Télécharge un .zip de
   tous les fichiers du dossier (pièces administratives, PAI, photocopies du
   carnet de vaccination), puis — seulement après confirmation explicite que
   le fichier a bien été sauvegardé — supprime ces fichiers de Supabase
   Storage et les lignes correspondantes en base. Une trace permanente est
   gardée dans archivage_purges (voir sql/archivage_purges.sql), qui survit
   même une fois les documents supprimés.
   Irréversible : aucun "annuler" possible passé ce point, d'où la
   confirmation à deux temps (avant le zip, puis après le téléchargement). */
async function enfExporterDocuments(id){
  const e=cacheEnfants.find(x=>String(x.id)===String(id));
  if(!e||!enfIsArchived(e))return;
  if(!confirm('Préparer un fichier .zip de tous les documents de '+(e.prenom||'')+' '+(e.nom||'')+' ?\n\nUne fois le fichier téléchargé et sa sauvegarde confirmée, ces documents seront supprimés du stockage en ligne (Supabase) — à vous de les conserver ensuite hors ligne (disque externe) pour le reste du délai légal.'))return;

  showBanner('Préparation du fichier .zip…');
  let admin=[],pai=[],vaccins=[];
  try{
    [{data:admin=[]},{data:pai=[]},{data:vaccins=[]}]=await Promise.all([
      sb.from('enfants_documents_admin').select('*').eq('enfant_id',id),
      sb.from('enfants_pai').select('*').eq('enfant_id',id),
      sb.from('vaccins_pj').select('*').eq('enfant_id',id)
    ]);
  }catch(err){
    showBanner('Erreur lors de la lecture des documents : '+err.message,'error');
    return;
  }
  const tous=[
    ...admin.map(d=>({...d,dossier:'administratif'})),
    ...pai.map(d=>({...d,dossier:'pai'})),
    ...vaccins.map(d=>({...d,dossier:'vaccinations'}))
  ];
  if(!tous.length){showBanner('Aucun document à exporter pour ce dossier.');return;}

  const zip=new JSZip();
  const reussis=[];
  let nEchec=0;
  for(const d of tous){
    try{
      let blob;
      if(d.bucket&&d.path){
        const{data,error}=await sb.storage.from(d.bucket).download(d.path);
        if(error)throw error;
        blob=data;
      }else if(d.url){
        const resp=await fetch(d.url);
        if(!resp.ok)throw new Error('HTTP '+resp.status);
        blob=await resp.blob();
      }else{
        throw new Error('ni bucket/path ni url');
      }
      const nom=(d.filename||d.id)+((d.filename||'').includes('.')?'':'');
      zip.file(d.dossier+'/'+nom,blob);
      reussis.push(d);
    }catch(err){
      console.warn('[enfExporterDocuments] échec sur',d.id,err);
      nEchec++;
    }
  }
  if(!reussis.length){showBanner('Aucun document n\'a pu être téléchargé — export annulé, rien n\'a été supprimé.','error');return;}

  const contenu=await zip.generateAsync({type:'blob'});
  const nomZip='documents_'+(e.prenom||'')+'_'+(e.nom||'')+'_'+todayStr()+'.zip';
  const url=URL.createObjectURL(contenu);
  const a=document.createElement('a');a.href=url;a.download=nomZip;document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);

  if(nEchec)showBanner(nEchec+' document(s) n\'ont pas pu être inclus dans le zip (ignorés, non supprimés) — '+reussis.length+' inclus.','error');

  if(!confirm('Le fichier "'+nomZip+'" a été téléchargé.\n\nAvez-vous bien enregistré ce fichier sur un support externe (disque dur, coffre-fort numérique) ?\n\nEn confirmant, les '+reussis.length+' document(s) effectivement exportés seront DÉFINITIVEMENT supprimés du stockage en ligne'+(nEchec?' ('+nEchec+' document(s) en échec resteront en ligne, à retenter plus tard)':'')+'. Cette action est IRRÉVERSIBLE.'))return;

  let suppOk=0,suppKo=0;
  for(const d of reussis){
    try{
      if(d.bucket&&d.path){
        const{error:rmErr}=await sb.storage.from(d.bucket).remove([d.path]);
        if(rmErr)console.warn('[enfExporterDocuments] fichier non supprimé du stockage',d.id,rmErr.message);
      }
      const table=d.dossier==='administratif'?'enfants_documents_admin':(d.dossier==='pai'?'enfants_pai':'vaccins_pj');
      const{error:delErr}=await sb.from(table).delete().eq('id',d.id);
      if(delErr)throw delErr;
      suppOk++;
    }catch(err){
      console.warn('[enfExporterDocuments] suppression échouée',d.id,err);
      suppKo++;
    }
  }

  await sb.from('archivage_purges').insert({
    entite_type:'enfant',
    entite_id:id,
    creche_id:e.creche_id||null,
    annee_sortie:e.date_sortie?Number(String(e.date_sortie).slice(0,4)):null,
    motif:suppOk+' document(s) exportés en .zip puis supprimés du stockage en ligne'+(suppKo?' ('+suppKo+' échec(s) de suppression)':''),
    purge_par:currentUser?currentUser.id:null
  });

  enfAdminDocsCache=[];enfPiecesCache=[];enfPaiCache=[];
  document.getElementById('enf-admin-docs-zone').innerHTML='';
  document.getElementById('enf-pai-zone').innerHTML='';
  document.getElementById('enf-carnet-zone').innerHTML='';
  if(String(enfFicheId)===String(id)){
    enfLoadAdminDocs(id);enfLoadPieces(id);enfLoadPai(id);enfLoadCarnet(id);
  }
  showBanner(suppOk+' document(s) supprimé(s) du stockage en ligne.'+(suppKo?' '+suppKo+' suppression(s) ont échoué.':''));
}
window.enfExporterDocuments=enfExporterDocuments;

/* ===================== CODE DE POINTAGE (tablette sans compte) =====================
   Le code lui-même (4 chiffres, colonne enfants.code_pointage / referents.code_pointage)
   est généré côté base par kk_gen_code_pointage() — voir sql/kiosque_code_pointage.sql.
   Ici on ne fait que l'afficher, le régénérer (même RPC, appelable par un utilisateur
   authentifié) et proposer son envoi par e-mail via l'edge function
   envoyer-code-pointage. Le code n'est jamais listé nulle part ailleurs : seule la
   fiche de la personne concernée le montre, à la direction et à la directrice technique de sa
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

/* ===================== CODE IMAGE (kiosque) =================================
   Depuis claude_37-kiosque-code-images.sql : les enfants pointent au kiosque
   avec une séquence de 4 pictogrammes. Depuis kiosque_code_pictos_personnel.sql,
   le personnel (referents) pointe aussi par code image, à la place du code à
   4 chiffres. Le tirage se fait côté base (generer_code_pictos /
   generer_code_pictos_referent), pris parmi le même pool que côté tablette
   (tablette.html) — toute divergence entre les deux listes casserait
   l'affichage ici (pas la validité du code lui-même, qui reste comparé en
   base). */
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
function kkPictosActions(id,crecheId,codePictos,type){
  type=type||'enfant';
  if(!crecheId)return '<span style="font-size:11.5px;color:var(--muted)">Sans crèche assignée — pas de code possible</span>';
  const peutEnvoyer=Array.isArray(codePictos)&&codePictos.length===4;
  return '<button class="btn-sm" onclick="kkRegenPictos(\''+id+'\',\''+crecheId+'\',\''+type+'\')"><i class="ti ti-refresh"></i> '+(peutEnvoyer?'Régénérer':'Générer')+' un code image</button>'
    +(peutEnvoyer?' <button class="btn-sm" onclick="kkSendPictos(\''+id+'\',\''+type+'\')"><i class="ti ti-mail"></i> Envoyer par e-mail</button>':'');
}
async function kkSendPictos(id,type){
  type=type||'enfant';
  const dest=type==='referent'?'à ce directeur/trice technique':(type==='employe'?'à ce/cette collaborateur/trice':'aux parents');
  if(!confirm('Envoyer le code image par e-mail '+dest+' ?'))return;
  const fn=type==='referent'?'envoyer-code-pictos-referent':(type==='employe'?'envoyer-code-pictos-employe':'envoyer-code-pictos');
  const param=type==='referent'?{referent_id:id}:(type==='employe'?{employe_id:id}:{enfant_id:id});
  const ok=await callFn(fn,param);
  if(ok)showBanner('Code image envoyé.');
  else showBanner('Échec de l\'envoi'+(_lastFnErr?' : '+_lastFnErr:''),'error');
}
window.kkSendPictos=kkSendPictos;
async function kkRegenPictos(id,crecheId,type){
  type=type||'enfant';
  if(!confirm('Générer un nouveau code image ? L\'ancien cessera de fonctionner immédiatement sur la tablette.'))return;
  const table=type==='referent'?'referents':(type==='employe'?'employes':'enfants');
  const rpcName=type==='referent'?'generer_code_pictos_referent':(type==='employe'?'generer_code_pictos_employe':'generer_code_pictos');
  try{
    const{data,error}=await sb.rpc(rpcName,{p_creche_id:crecheId});
    if(error)throw error;
    const ok=await dbUpdateStrict(table,id,{code_pictos:data});
    if(!ok)throw new Error(window._lastDbError||'écriture refusée');
    /* Un directeur/trice lié·e à sa fiche collaborateur (referents.employe_id) n'a
       qu'un seul code : le trigger SQL (kiosque_code_pictos_lien_employe.sql) le
       recopie sur l'autre fiche, on aligne ici les caches. */
    if(type==='referent'){
      const r=cacheReferents.find(x=>String(x.id)===String(id));
      if(r){
        r.code_pictos=data;
        const lie=r.employe_id&&cacheEmployes.find(x=>String(x.id)===String(r.employe_id));
        if(lie)lie.code_pictos=data;
      }
      renderReferents();
      if(typeof renderEmployes==='function')renderEmployes();
    }else if(type==='employe'){
      const e=cacheEmployes.find(x=>String(x.id)===String(id));
      if(e)e.code_pictos=data;
      cacheReferents.filter(x=>x.employe_id&&String(x.employe_id)===String(id)).forEach(x=>{x.code_pictos=data;});
      renderEmployes();
      if(typeof renderReferents==='function')renderReferents();
    }else{
      const e=cacheEnfants.find(x=>String(x.id)===String(id));
      if(e)e.code_pictos=data;
      enfRenderIdentite();
    }
    showBanner('Nouveau code image généré.');
  }catch(e){
    console.error('[kkRegenPictos]',e);
    const msg=e.code==='42883'?'Fonction absente — exécutez sql/claude_37-kiosque-code-images.sql, sql/kiosque_code_pictos_personnel.sql, sql/kiosque_code_pictos_employes.sql et sql/kiosque_code_pictos_lien_employe.sql.':(e.message||'erreur inconnue');
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
