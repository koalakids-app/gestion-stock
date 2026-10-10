window.enfLoadVaccinsStatus = enfLoadVaccinsStatus;
window.enfRenderVaccins = enfRenderVaccins;

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
  /* Un dossier "complet" (toutes les pièces obligatoires reçues, jeton
     auto-invalidé côté serveur — cf. dossier-pieces) n'est plus actif non
     plus : on propose d'envoyer un nouveau lien si besoin, sans reprendre
     l'ancien qui ne fonctionne plus. */
  const actif=enfPiecesCache.find(d=>d.statut!=='annule' && d.statut!=='complet' && new Date(d.expire_le)>new Date());
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
    +(PartageLien.disponible()?'<button class="btn-sm" onclick="enfPartagerLienPieces(\''+actif.id+'\')"><i class="ti ti-share"></i> Partager…</button>':'')
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
  const ok=await callFn('envoyer-dossier-pieces',{dossier_id:saved.id,relance:false,lien:piecesLien(token),expediteur:currentProfile?.name});
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
  const ok=await callFn('envoyer-dossier-pieces',{dossier_id:d.id,relance:true,lien:piecesLien(d.token),expediteur:currentProfile?.name});
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

function enfPartagerLienPieces(id){
  const d=enfPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  PartageLien.partager(piecesLien(d.token),{titre:'Pièces à fournir',
    texte:'Bonjour, voici le lien pour déposer les pièces demandées pour votre enfant :'})
    .then(r=>{if(r==='copie')showBanner('Partage indisponible — lien copié.');});
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

   BIB (biberon), BB (repas légumes sans protéines), M (moyen) et G (grand) sont
   les préparations du traiteur. La lettre est proposée d'après la tranche d'âge,
   mais l'âge ne décide pas de ce que l'enfant mange : le champ `repas_base` de
   la fiche permet de la forcer — en particulier pour suivre la diversification
   réelle de l'enfant, qui ne tombe jamais pile sur un anniversaire de mois.
   Laissé vide, il reste déduit de l'âge et suit automatiquement les anniversaires.

   Seuils alignés sur les structures de repas du GEM-RCN 2015 (recommandations
   nutritionnelles pour la restauration collective en petite enfance, relayées
   par l'ARS) et sur le calendrier de diversification alimentaire du PNNS
   (Programme National Nutrition Santé / Santé publique France, tableau 0-3 ans) :
   BIB avant 6 mois (lait exclusif ; le PNNS situe la fenêtre d'introduction de la
   diversification entre 4 et 6 mois révolus selon la maturité de l'enfant — forcer
   `repas_base` sur BB dès qu'elle démarre avant 6 mois), BB de 6 à 12 mois (les
   légumes sont introduits en premier puis les protéines environ un mois plus tard,
   textures lisses puis un peu plus épaisses — encore dans cette même tranche,
   l'appli n'ayant pas de code plus fin), M de 12 à 18 mois (groupe « Moyens »), G
   à partir de 18 mois (groupe « Grands », qui démarre entre 15 et 18 mois selon le
   GEM-RCN, pas à 24). Les tranches affichées sur la fiche (0-6 / 6-12 / 12-18 /
   18-24 / 24-36 mois, voir groupeFromDob() dans demandes.html) sont plus fines que
   ces quatre préparations, qui restent celles du traiteur.

   Le suffixe (`regime_repas` : '' | 'SV' | 'SPV' | 'SPA') se combine à la
   lettre, y compris sur BB — un enfant intolérant aux protéines de vache doit
   rester repérable partout, sans quoi l'écran contredirait le bon de commande. */
function enfRepasBaseAuto(e){
  if(!e)return'';
  if(!e.dob){
    // Pas de date de naissance : on retombe sur le libellé de groupe stocké, à défaut de mieux.
    const groupe=e.groupe||'';
    if(groupe.indexOf('Bébé')>=0)return'BB';
    if(groupe.indexOf('Moyen')>=0)return'M';
    if(groupe.indexOf('Grand')>=0)return'G';
    return'';
  }
  const m=window.ageMoisFromDob(e.dob);
  if(m<6)return'BIB';
  if(m<12)return'BB';
  if(m<18)return'M';
  return'G';
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
   Le bon MCM n'a que deux lignes de goûter, « bébé (6 à 18 mois) » et
   « grand (+ de 18 mois & périscolaire) » — ce sont ses propres bornes d'âge,
   pas les codes repas. Le GEM-RCN (recommandations ARS) prévoit un goûter dès le
   groupe « Bébés » (lait infantile, céréales infantiles, fruit), avant quoi
   l'enfant reste au lait exclusif : donc aucun goûter avant 6 mois, goûter bébé
   de 6 à 18 mois, goûter grand à partir de 18 mois (et en périscolaire). Un
   enfant au biberon (BIB) n'a ni repas ni goûter. Manger un repas moyen ou
   légumes n'empêche pas de prendre le goûter des grands : le champ `gouter_base`
   de la fiche ('' | 'gbb' | 'ggr') permet de dissocier les deux. Laissé vide, le
   goûter continue de suivre l'âge (ou, à défaut de date de naissance, le code
   repas). */
function enfGouterAuto(e){
  if(!e)return null;
  const base=e.repas_base||enfRepasBaseAuto(e);
  if(!base||base==='BIB')return null;
  if(!e.dob)return base==='BB'?null:(base==='M'?'gbb':'ggr');
  const m=window.ageMoisFromDob(e.dob);
  if(m<6)return null;
  return m<18?'gbb':'ggr';
}
function enfGouterLigne(e){
  if(!e)return null;
  const base=e.repas_base||enfRepasBaseAuto(e);
  if(base==='BIB')return null;              // au biberon : ni repas ni goûter
  // Moins de 6 mois : jamais de goûter, même si un goûter est forcé sur la fiche.
  if(e.dob&&window.ageMoisFromDob(e.dob)<6)return null;
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

/* Besoin de couches du mois en cours = 4 couches/jour × nombre de jours de
   présence RÉELS du mois : jours du contrat qui tombent sur un jour de la
   semaine travaillé, moins les jours fériés, les fermetures de la crèche/du
   réseau (vacances, journées pédagogiques — même source que le forfait
   « journée non pointée » du module Présences, js/presences-reel.js) et les
   absences déjà programmées (justifiées ou non : un enfant annoncé absent
   ne sera pas changé, quel qu'en soit le motif). Fermetures et absences se
   chargent en tâche de fond (enfEnsureFermetures / enfLoadAbsences) : tant
   qu'elles ne sont pas là, la ligne affiche « calcul… » plutôt qu'un
   nombre approximatif. */
const COUCHE_BESOIN_PAR_JOUR_FICHE = 4;
let enfAbsencesCache = [], enfAbsencesPret = false;
function enfJoursPresenceMois(e, an, moisIndex){
  const dernierJour = new Date(an, moisIndex+1, 0).getDate();
  let jours = 0;
  for(let j=1; j<=dernierJour; j++){
    const d = new Date(an, moisIndex, j);
    const iso = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const contrat = enfContratsCache.find(c=>(!c.date_debut||c.date_debut<=iso)&&(!c.date_fin||c.date_fin>=iso));
    if(!contrat) continue;
    if(!ctParseJours(contrat.jours).includes(d.getDay())) continue;
    if(typeof prEstFerie==='function' && prEstFerie(iso)) continue;
    if(typeof prEstFerme==='function' && prEstFerme(e.creche_id, iso)) continue;
    if(enfAbsencesCache.some(a=>a.date_debut<=iso && a.date_fin>=iso)) continue;
    jours++;
  }
  return jours;
}
function enfBesoinMensuelCouches(e){
  if(!enfContratsCache.some(c=>ctStatut(c)==='encours')) return null;
  if(typeof _prFerm==='undefined' || !_prFerm || !enfAbsencesPret) return undefined; // encore en cours de chargement
  const now = new Date();
  const jours = enfJoursPresenceMois(e, now.getFullYear(), now.getMonth());
  return { jours, besoin: jours*COUCHE_BESOIN_PAR_JOUR_FICHE };
}
function enfBesoinCoucheLigne(e){
  const r = enfBesoinMensuelCouches(e);
  if(r===null) return '<span style="color:var(--muted);font-weight:400">contrat en cours requis pour l’estimer</span>';
  if(r===undefined) return '<span style="color:var(--muted);font-weight:400">calcul…</span>';
  return r.besoin+' couches <span style="color:var(--muted);font-weight:400">('+r.jours+' j de présence ce mois-ci)</span>';
}
// Absences déclarées (justifiées ou non) de l'enfant — table enfants_absences,
// voir sql/absences_forfait.sql. Chargées à l'ouverture de la fiche, comme
// les contrats, pour affiner le besoin mensuel de couches ci-dessus.
async function enfLoadAbsences(enfantId){
  enfAbsencesPret = false;
  try{
    const{data,error}=await sb.from('enfants_absences').select('date_debut,date_fin').eq('enfant_id',enfantId);
    if(error) throw error;
    enfAbsencesCache = data||[];
  }catch(err){
    console.warn('enfLoadAbsences',err);
    enfAbsencesCache = [];
  }
  enfAbsencesPret = true;
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderIdentite();
}
// Fermetures crèche/réseau (prChargerFermetures, js/presences-reel.js) : une
// donnée globale, pas propre à un enfant, chargée une seule fois puis
// réutilisée. stock.html a sa propre copie de ce calcul (n'inclut pas ce
// fichier) ; ici on réutilise directement presences-reel.js, déjà chargé
// par demandes.html.
let _enfFermeturesEnCours = false;
async function enfEnsureFermetures(){
  if(typeof _prFerm==='undefined' || typeof prChargerFermetures!=='function') return; // fichier non chargé sur cette page
  if(_prFerm || _enfFermeturesEnCours) return;
  _enfFermeturesEnCours = true;
  try{ await prChargerFermetures(); }
  catch(err){ console.warn('enfEnsureFermetures',err); }
  _enfFermeturesEnCours = false;
  enfRenderIdentite();
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
  enfRenderIdentite(); // le besoin mensuel de couches dépend du contrat, chargé après l'identité
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
    const horaires=ctHorairesLabel(c);
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
  + '<p style="font-size:11.5px;color:var(--muted);margin-top:6px">Le bouton « Appliquer les contrats » du module Présences marque présents tous les enfants sur toute la durée de leurs contrats (de la date de début à la date de fin). Un contrat sans date de fin est ignoré.</p>';
}

/* Horaires propres à un jour : {"1":{"debut":"08:00","fin":"17:00"}}. Absent = horaires par défaut du contrat. */
function ctParseHoraires(h){
  let v=h;
  if(typeof v==='string'){try{v=JSON.parse(v);}catch(e){v=null;}}
  return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};
}
function ctHorairesJour(c,wd){
  const o=ctParseHoraires(c&&c.horaires_jours)[wd]||{};
  return {debut:o.debut||c.heure_debut||null,fin:o.fin||c.heure_fin||null};
}
function ctHorairesLabel(c){
  const h=ctParseHoraires(c.horaires_jours);
  const jours=ctParseJours(c.jours).filter(function(n){return h[n]&&(h[n].debut||h[n].fin);});
  if(!jours.length) return (c.heure_debut||c.heure_fin)?(ctFmtHeure(c.heure_debut)||'?')+' \u2013 '+(ctFmtHeure(c.heure_fin)||'?'):'horaires non renseign\u00e9s';
  return ctParseJours(c.jours).map(function(n){
    const x=ctHorairesJour(c,n),j=CT_JOURS.filter(function(k){return k[0]===n;})[0];
    return (j?j[1].slice(0,3):n)+' '+(ctFmtHeure(x.debut)||'?')+'\u2013'+(ctFmtHeure(x.fin)||'?');
  }).join(' \u00b7 ');
}
/* Une ligne d'horaires par jour coch\u00e9 ; vide = horaires par d\u00e9faut. */
function ctRenderHorairesJours(h){
  const box=document.getElementById('ct-horaires-jours');
  if(!box) return;
  if(!h) h=ctLireHorairesJours();
  const jours=ctJoursSel.slice().sort(function(a,b){return a-b;});
  box.innerHTML=jours.length?('<div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">Horaires par jour \u2014 laissez vide pour reprendre les horaires par d\u00e9faut ci-dessus.</div>'
    +jours.map(function(n){
      const j=CT_JOURS.filter(function(k){return k[0]===n;})[0],o=h[n]||{};
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:78px;font-size:12.5px;font-weight:600">'+(j?j[1]:n)+'</span>'
        +'<input type="time" class="finput" data-ct-jour="'+n+'" data-k="debut" value="'+escHtml(String(o.debut||'').slice(0,5))+'" style="flex:1">'
        +'<input type="time" class="finput" data-ct-jour="'+n+'" data-k="fin" value="'+escHtml(String(o.fin||'').slice(0,5))+'" style="flex:1"></div>';
    }).join('')):'';
}
function ctLireHorairesJours(){
  const h={};
  document.querySelectorAll('#ct-horaires-jours input[data-ct-jour]').forEach(function(i){
    if(!i.value) return;
    const n=i.getAttribute('data-ct-jour');
    (h[n]=h[n]||{})[i.getAttribute('data-k')]=i.value;
  });
  return h;
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
  ctRenderHorairesJours();
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
  ctRenderHorairesJours(c?ctParseHoraires(c.horaires_jours):{});
  document.getElementById('ct-btn-delete').style.display=c?'':'none';
  document.getElementById('modal-contrat-wrap').classList.add('open');
}

/* Seuls les jours cochés sont conservés ; null si aucun horaire particulier. */
function ctHorairesJoursSaisis(){
  const h=ctLireHorairesJours(),r={};
  ctJoursSel.forEach(function(n){if(h[n]) r[n]=h[n];});
  return Object.keys(r).length?r:null;
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
    horaires_jours:ctHorairesJoursSaisis(),
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
window.ctRenderHorairesJours=ctRenderHorairesJours;

/* --- Lien avec le module Présences ------------------------------------- */
/* Marque présents (matin + après-midi) les enfants de la crèche affichée pour
   TOUTE la durée de chacun de leurs contrats (de la date de début à la date
   de fin), sur les jours de la semaine cochés dans le contrat — et non plus
   jour par jour pour la seule date affichée dans l'onglet Jour.
   Un contrat « sans terme » (pas de date de fin) ne peut pas être développé
   sur une durée : il est signalé et ignoré, en attendant qu'une date de fin
   lui soit renseignée dans l'onglet Contrat de la fiche enfant. */
async function presApplyContrats(){
  const crecheId=getPresenceCrecheId();
  if(isDirection&&!crecheId){ showBanner('Sélectionnez d’abord une crèche.','error'); return; }
  const enfants=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):cacheEnfants.slice());
  const ids=enfants.map(e=>e.id);
  if(!ids.length){ showBanner('Aucun enfant dans cette crèche.','error'); return; }
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
  if(!contrats.length){
    showBanner('Aucun contrat enregistré pour les enfants de cette crèche. Créez-les dans l’onglet Contrat de la fiche enfant.','error');
    return;
  }
  const sansTerme=contrats.filter(c=>!c.date_fin);
  const avecTerme=contrats.filter(c=>c.date_fin);
  if(!avecTerme.length){
    showBanner('Tous les contrats trouvés sont « sans terme » (pas de date de fin) : renseignez une date de fin dans l’onglet Contrat de la fiche enfant pour pouvoir les appliquer.','error');
    return;
  }
  // Pour chaque contrat avec une date de fin, toutes les dates comprises entre
  // date_debut et date_fin dont le jour de semaine est coché dans le contrat.
  const datesParEnfant=new Map();   // enfant_id -> Set(presence_date ISO)
  avecTerme.forEach(function(c){
    const jours=ctParseJours(c.jours);
    if(!jours.length||!c.date_debut||c.date_fin<c.date_debut) return;
    const set=datesParEnfant.get(c.enfant_id)||new Set();
    const fin=new Date(c.date_fin+'T00:00:00');
    for(let d=new Date(c.date_debut+'T00:00:00'); d<=fin; d.setDate(d.getDate()+1)){
      const jour=(d.getDay()===0)?7:d.getDay();      // 1 = lundi … 7 = dimanche
      if(jours.indexOf(jour)>=0) set.add(ipDateToLocalISO(d));
    }
    datesParEnfant.set(c.enfant_id,set);
  });
  const enfantsConcernes=[...datesParEnfant.keys()].filter(id=>datesParEnfant.get(id).size);
  // Tous les enfants ayant un contrat avec terme : même ceux dont le contrat édité
  // ne couvre plus aucun jour (toutes les cases décochées) doivent être nettoyés
  // ci-dessous, pas seulement ceux qui ont encore des dates à pointer.
  const enfantsAvecTerme=[...new Set(avecTerme.map(c=>c.enfant_id))];
  if(!enfantsConcernes.length&&!enfantsAvecTerme.length){
    showBanner('Aucune date ne correspond aux jours cochés des contrats.','error');
    return;
  }
  // Présences existantes (pointées ou non) pour ces enfants : on ne retouche pas
  // les dates déjà pointées, et on s'en sert aussi pour repérer les présences
  // laissées par un précédent « Appliquer les contrats » sur un jour retiré
  // depuis du contrat (cf. nettoyage plus bas).
  // Lecture paginée : PostgREST plafonne à 1000 lignes par requête, et un
  // historique de présences dépasse vite ce seuil — une lecture tronquée
  // ferait croire à tort que certaines dates ne sont pas encore pointées,
  // et l'insertion qui suit percuterait alors la contrainte d'unicité.
  let dejaPres=[];
  try{
    const PAGE=1000;
    for(let from=0;;from+=PAGE){
      const{data,error}=await sb.from('presences').select('enfant_id,presence_date,status,source,heure_debut,heure_fin')
        .in('enfant_id',enfantsAvecTerme).range(from,from+PAGE-1);
      if(error) throw error;
      dejaPres=dejaPres.concat(data||[]);
      if(!data||data.length<PAGE) break;
    }
  }catch(err){
    console.warn('presApplyContrats lecture presences',err);
    showBanner('Lecture des présences existantes impossible : '+((err&&err.message)||'droits insuffisants'),'error');
    return;
  }
  const dejaSet=new Set(dejaPres.map(p=>p.enfant_id+'_'+p.presence_date));
  // Présences « auto-générées » par un Appliquer les contrats précédent : sans
  // horaire ni source particulière. Seules celles-là peuvent être retirées sans
  // risque si le jour n'est plus coché dans le contrat — un pointage tablette
  // (source:'pointage') ou un horaire issu du planning importé reflètent du réel
  // et ne doivent jamais être effacés automatiquement.
  const autoGenerees=new Set(dejaPres.filter(function(p){
    return p.status==='present'&&p.source!=='pointage'&&!p.heure_debut&&!p.heure_fin;
  }).map(function(p){return p.enfant_id+'_'+p.presence_date;}));
  const rows=[];
  let nbEnfants=0;
  enfantsConcernes.forEach(function(id){
    let ajouts=0;
    datesParEnfant.get(id).forEach(function(dateStr){
      if(dejaSet.has(id+'_'+dateStr)) return;
      rows.push({enfant_id:id,presence_date:dateStr,slot:'M',status:'present'});
      rows.push({enfant_id:id,presence_date:dateStr,slot:'A',status:'present'});
      ajouts++;
    });
    if(ajouts) nbEnfants++;
  });
  // Nettoyage : dates couvertes par la période d'un contrat mais dont le jour de
  // semaine n'est PLUS coché (ex. lundi/mardi décochés après modification) — sans
  // ça elles restent affichées comme présentes sur le Gantt malgré le contrat à jour.
  const aSupprimerParEnfant=new Map(); // enfant_id -> Set(presence_date ISO)
  let nbSuppr=0;
  avecTerme.forEach(function(c){
    const jours=ctParseJours(c.jours);
    if(!c.date_debut||c.date_fin<c.date_debut) return;
    const fin=new Date(c.date_fin+'T00:00:00');
    for(let d=new Date(c.date_debut+'T00:00:00'); d<=fin; d.setDate(d.getDate()+1)){
      const jour=(d.getDay()===0)?7:d.getDay();
      if(jours.indexOf(jour)>=0) continue;
      const iso=ipDateToLocalISO(d);
      const key=c.enfant_id+'_'+iso;
      if(!autoGenerees.has(key)) continue;
      const set=aSupprimerParEnfant.get(c.enfant_id)||new Set();
      if(!set.has(iso)){ set.add(iso); nbSuppr++; }
      aSupprimerParEnfant.set(c.enfant_id,set);
    }
  });
  const avertSansTerme=sansTerme.length
    ? '\n\n⚠ '+sansTerme.length+' contrat(s) sans date de fin ignoré(s) : renseignez une date de fin pour les inclure.'
    : '';
  if(!rows.length&&!nbSuppr){
    showBanner('Toutes les dates des contrats sont déjà à jour.'+avertSansTerme);
    return;
  }
  const nbJours=rows.length/2;
  const msgAjout=nbJours?('• '+nbEnfants+' enfant(s), '+nbJours+' jour(s) marqué(s) présent(s)\n'):'';
  const msgSuppr=nbSuppr?('• '+nbSuppr+' jour(s) retiré(s) (plus dans le contrat)\n'):'';
  if(!confirm('Appliquer les contrats :\n\n'+msgAjout+msgSuppr+avertSansTerme+'\n\nContinuer ?')) return;
  // Insertion par lots : un contrat de plusieurs mois peut représenter des
  // centaines de lignes, mieux vaut ne pas tout envoyer en un seul appel.
  // upsert + ignoreDuplicates plutôt qu'un simple insert : si une ligne a
  // malgré tout déjà été pointée entre la lecture ci-dessus et l'écriture
  // (ou par un autre appareil), la contrainte d'unicité ne fait plus
  // échouer tout le lot — elle est silencieusement ignorée, comme voulu.
  const CHUNK=500;
  for(let i=0;i<rows.length;i+=CHUNK){
    const{error}=await sb.from('presences').upsert(rows.slice(i,i+CHUNK),
      {onConflict:'enfant_id,presence_date,slot',ignoreDuplicates:true});
    if(error){ console.warn('presApplyContrats insert',error); showBanner('Enregistrement impossible : '+(error.message||''),'error'); return; }
  }
  for(const[id,dates]of aSupprimerParEnfant){
    const{error}=await sb.from('presences').delete().eq('enfant_id',id).in('presence_date',[...dates]);
    if(error){ console.warn('presApplyContrats suppression',error); showBanner('Nettoyage des présences impossible : '+(error.message||''),'error'); return; }
  }
  // On bascule sur « Présents uniquement » : les enfants sans contrat ce jour
  // n’encombrent plus la feuille de présence (le chip permet de les réafficher).
  presOnlyPresents=true;
  localStorage.setItem('presOnlyPresents','1');
  presSyncFilterChip();
  showBanner((nbJours?nbEnfants+' enfant(s) marqué(s) présent(s) sur '+nbJours+' jour(s)':'')
    +(nbJours&&nbSuppr?' — ':'')+(nbSuppr?nbSuppr+' jour(s) retiré(s) du planning':'')
    +' d’après la durée des contrats.'+avertSansTerme);
  renderPresence();
}
window.presApplyContrats=presApplyContrats;


