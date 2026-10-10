/* ══════════════════════════════════════════════════════════════════════════
   MODULE STAGIAIRES

   Une fiche par stagiaire et par crèche, de la demande déposée sur le Padlet
   jusqu'au bilan. Trois choses cohabitent dans la fiche, et une seule sort de
   l'application : les DOCUMENTS, que la stagiaire dépose elle-même depuis son
   téléphone via stagiaire.html — un lien à durée limitée, sans compte.

   Ce qui est en base : 23a-stagiaires-tables.sql (tables), 23b (policies),
   23c (bucket privé). La fonction `dossier-stagiaire` est la seule porte
   d'entrée de la page publique.

   Trois partis pris :
   - le CALENDRIER n'est pas déduit des dates de début et de fin. Un stage de
     trois semaines n'est presque jamais cinq jours sur cinq. On propose la
     génération des jours ouvrés, puis on corrige à la main ;
   - une stagiaire SANS CRÈCHE n'est visible que par la direction. C'est la
     règle RLS, et c'est voulu : la demande Padlet appartient au coordinateur
     tant qu'il ne l'a pas orientée ;
   - les fichiers vivent dans un bucket PRIVÉ. Aucune URL n'est stockée : on
     signe un lien de 5 minutes au moment du clic. Une URL en base serait soit
     périmée le lendemain, soit permanente — les deux sont mauvais ici, il
     s'agit de pièces d'identité et de certificats médicaux.
   ══════════════════════════════════════════════════════════════════════════ */

const STG_BUCKET     = 'stagiaires';
const STG_LIEN_JOURS = 30;    // durée de vie du lien de dépôt
const STG_URL_TTL    = 300;   // 5 min pour un lien de lecture signé
const STG_LIEN_AVANT = 30;    // on prévient qu'il est temps d'envoyer le lien, J-30
const STG_LIEN_APRES = 30;    // et il reste valable 30 jours après la fin du stage

let stgCache=[], stgTypes=[], stgJoursCache=[], stgDocsCache=[];
/* Script 36 — ce que la crèche transmet, et qui l'a ouvert. Tables absentes
   (script non encore exécuté) : les deux listes restent vides et le module se
   comporte exactement comme avant. */
let stgRess=[], stgRessVues=[], stgRessOk=true;
let stgFilter='actives', stgFicheId=null, stgSchemaOk=true;
let stgCalRef=null;           // 1er du mois affiché dans le calendrier
let stgJourCourant=null;      // {stagiaire_id, jour} du jour en cours d'édition

const STG_STATUTS={
  demande :{lib:'Demande reçue', cls:'var(--blue)',        ic:'ti-inbox'},
  contact :{lib:'Contact pris',  cls:'var(--orange-dark)', ic:'ti-phone'},
  accepte :{lib:'Accepté',       cls:'var(--koala)',       ic:'ti-thumb-up'},
  en_cours:{lib:'Stage en cours',cls:'var(--green)',       ic:'ti-run'},
  termine :{lib:'Terminé',       cls:'var(--muted)',       ic:'ti-check'},
  refuse  :{lib:'Refusé',        cls:'var(--red)',         ic:'ti-x'},
  annule  :{lib:'Annulé',        cls:'var(--red)',         ic:'ti-ban'}
};
const STG_CONV={a_demander:'À demander',demandee:'Demandée',recue:'Reçue',signee:'Signée'};

/* ── Stagiaires et alternants ───────────────────────────────────────────────
   Le même dossier, le même calendrier, les mêmes pièces à quelques exceptions
   près : un alternant n'a pas de convention de stage mais un contrat
   d'apprentissage ou de professionnalisation. Plutôt qu'un second module qui
   dupliquerait tout, une colonne `type_contrat` sur la fiche et un champ
   `pour_type` sur chaque pièce demandée. Une fiche sans type est une fiche
   d'avant le script 31 : c'est une stagiaire. */
const STG_PROFILS={
  stagiaire:{lib:'Stagiaire', pluriel:'stagiaires', periode:'stage',
             periodeArt:'le stage', contrat:'Convention de stage',
             contratCourt:'Convention', couleur:'var(--koala)', ic:'ti-school'},
  alternant:{lib:'Alternant',  pluriel:'alternants', periode:'alternance',
             periodeArt:"l'alternance", contrat:"Contrat d'alternance",
             contratCourt:'Contrat', couleur:'var(--orange-dark)', ic:'ti-briefcase'}
};
const stgType    = s => (s&&s.type_contrat==='alternant')?'alternant':'stagiaire';
const stgProfil  = s => STG_PROFILS[stgType(s)];

const stgMeta   = s => STG_STATUTS[s] || STG_STATUTS.demande;
const stgClos   = s => s==='termine'||s==='refuse'||s==='annule';
const stgNomComplet = s => ((s.prenom||'')+' '+(s.nom||'')).trim()||'Sans nom';
/* Le lien a déjà été (ou aurait déjà dû être) envoyé : ni une simple demande
   Padlet, ni un premier contact, ni un dossier clos. */
const stgEnSuivi = s => s&&!stgClos(s.statut)&&s.statut!=='demande'&&s.statut!=='contact';

function stgCrecheName(id){
  if(!id)return '';
  const c=cacheCreches.find(c=>String(c.id)===String(id));
  return c?c.name:'Crèche supprimée';
}

/* Une directrice technique ne peut affecter une stagiaire qu'à sa propre crèche : lui
   proposer les cinq autres l'exposerait à un refus d'écriture incompréhensible
   côté serveur. */
function stgCrechesVisibles(){
  if(isDirection)return cacheCreches;
  const mien=currentProfile&&currentProfile.creche_id;
  return cacheCreches.filter(c=>String(c.id)===String(mien));
}

function stgOptionsCreches(vide){
  return (vide?'<option value="">'+vide+'</option>':'')
    +stgCrechesVisibles().map(c=>'<option value="'+escHtml(String(c.id))+'">'+escHtml(c.name)+'</option>').join('');
}

// ── Chargement ────────────────────────────────────────────────────────────

async function stgInit(){
  const sel1=document.getElementById('stg-f-creche-liste');
  if(sel1)sel1.innerHTML=stgOptionsCreches('Toutes les crèches');
  const sel2=document.getElementById('stg-f-creche-cal');
  if(sel2)sel2.innerHTML=stgOptionsCreches('Toutes les crèches');
  /* Proposer « toutes les crèches » à une directrice technique serait lui promettre une
     écriture que la policy refusera (script 36c) : elle ne voit que la sienne,
     déjà choisie. */
  const sel3=document.getElementById('stg-r-creche');
  if(sel3){
    sel3.innerHTML=stgOptionsCreches(isDirection?'— Toutes les crèches —':'');
    sel3.disabled=!isDirection;
  }
  /* Le formulaire s'ouvre sur « Document » : la case d'identité n'a pas de sens
     tant qu'il n'y a pas d'adresse. */
  if(typeof stgRessNatureChange==='function')stgRessNatureChange();
  if(!stgCalRef){const n=new Date();stgCalRef=new Date(n.getFullYear(),n.getMonth(),1);}
  await stgLoad();
}

async function stgLoad(){
  const r1=await sb.from('stagiaires').select('*').order('date_debut',{ascending:false,nullsFirst:false});
  const r2=await sb.from('stagiaires_docs_types').select('*').order('ordre');
  const warn=document.getElementById('stg-schema-warn');
  stgSchemaOk=!r1.error&&!r2.error;
  if(!stgSchemaOk){
    /* Un écran vide ne dit pas si les tables manquent ou si personne n'a rien
       saisi. On préfère le dire. */
    const msg=((r1.error||r2.error||{}).message)||'';
    if(warn){
      warn.style.display='block';
      warn.innerHTML='<strong><i class="ti ti-alert-triangle"></i> Module Stagiaires indisponible.</strong> '
        +'Les scripts <code>23a</code> à <code>23c</code> n\'ont pas encore été exécutés sur Supabase.'
        +'<br><span style="opacity:.85">Détail : '+escHtml(msg)+'</span>';
    }
    stgCache=[];stgTypes=[];stgJoursCache=[];stgDocsCache=[];
    stgRenderTout();
    return;
  }
  if(warn)warn.style.display='none';
  stgCache=r1.data||[];
  stgTypes=r2.data||[];

  const ids=stgCache.map(s=>s.id);
  if(ids.length){
    const rj=await sb.from('stagiaires_jours').select('*').in('stagiaire_id',ids);
    const rd=await sb.from('stagiaires_documents').select('*').in('stagiaire_id',ids);
    stgJoursCache=rj.data||[];
    stgDocsCache=rd.data||[];
  }else{
    stgJoursCache=[];stgDocsCache=[];
  }

  /* Les ressources transmises (script 36). Leur absence n'est pas une erreur
     du module : tant que 36a n'a pas été exécuté, il n'y a simplement rien à
     transmettre, et l'écran le dit à sa façon. */
  const rr=await sb.from('stagiaires_ressources').select('*').order('ordre');
  stgRessOk=!rr.error;
  stgRess=stgRessOk?(rr.data||[]):[];
  if(stgRessOk&&ids.length){
    const rv=await sb.from('stagiaires_ressources_vues').select('*').in('stagiaire_id',ids);
    stgRessVues=rv.data||[];
  }else{
    stgRessVues=[];
  }

  stgRenderTout();
}

function stgRenderTout(){
  stgRender();
  stgRenderCal();
  stgRenderDispo();
  stgRenderTypes();
  stgRenderRess();
  stgMajBadge();
}

function stgShowView(v,btn){
  ['fiches','cal','dispo','types','ress'].forEach(x=>{
    const el=document.getElementById('stg-view-'+x);
    if(el)el.classList.toggle('active',x===v);
  });
  document.querySelectorAll('#main-stagiaires .module-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  if(v==='cal')stgRenderCal();
  if(v==='dispo')stgRenderDispo();
  if(v==='types')stgRenderTypes();
  if(v==='ress')stgRenderRess();
}

function stgSetFilter(f){
  stgFilter=f;
  stgRender();
}

// ── Avancement du dossier ─────────────────────────────────────────────────

/* Les pièces d'une stagiaire, groupées par type. Une pièce refusée ne compte
   pas comme reçue : c'est tout l'intérêt du refus. */
function stgDocsDe(id){return stgDocsCache.filter(d=>String(d.stagiaire_id)===String(id));}

/* Les pièces qui concernent ce profil. `pour_type` absent = base d'avant le
   script 31 : la pièce vaut alors pour tout le monde, comme avant. */
function stgTypesPour(type){
  const t=type==='alternant'?'alternant':'stagiaire';
  return stgTypes.filter(x=>!x.pour_type||x.pour_type==='tous'||x.pour_type===t);
}

function stgAvancement(id){
  const s=stgCache.find(x=>String(x.id)===String(id));
  const oblig=stgTypesPour(stgType(s)).filter(t=>t.actif&&t.obligatoire);
  const docs=stgDocsDe(id).filter(d=>d.statut!=='refuse');
  const couverts=new Set(docs.map(d=>String(d.type_id)));
  const faits=oblig.filter(t=>couverts.has(String(t.id))).length;
  return {faits:faits,total:oblig.length,complet:oblig.length>0&&faits===oblig.length};
}

function stgJoursDe(id){
  return stgJoursCache.filter(j=>String(j.stagiaire_id)===String(id))
    .sort((a,b)=>String(a.jour).localeCompare(String(b.jour)));
}

// ── Vue 1 : les fiches ────────────────────────────────────────────────────

/* « À traiter » veut dire : personne n'a encore tranché. Un premier contact
   pris compte donc autant qu'une demande brute — c'est exactement le moment où
   la fiche a besoin d'être vue, et le statut sous lequel une directrice technique
   enregistre souvent sa première saisie. */
function stgATraiter(s){return s.statut==='demande'||s.statut==='contact';}

/* La règle de chaque puce, écrite une seule fois : les compteurs affichés et
   la liste affichée ne peuvent donc pas se contredire. */
function stgDansPuce(s,puce){
  if(puce==='demandes')return stgATraiter(s);
  if(puce==='actives')return s.statut==='accepte'||s.statut==='en_cours';
  if(puce==='encours')return s.statut==='en_cours';
  if(puce==='avenir')return s.statut==='accepte';
  if(puce==='terminees')return stgClos(s.statut);
  if(puce==='alternants')return stgType(s)==='alternant'&&!stgClos(s.statut);
  if(puce==='incomplets')return !stgClos(s.statut)&&!stgAvancement(s.id).complet;
  if(puce==='aenvoyer')return stgLienAEnvoyer(s);
  return true;
}

/* Le nombre de fiches derrière chaque puce, crèche et type courants compris :
   une fiche rangée ailleurs reste visible depuis la puce ouverte. */
function stgBaseFiltre(){
  const creche=(document.getElementById('stg-f-creche-liste')||{}).value||'';
  const type=(document.getElementById('stg-f-type-liste')||{}).value||'';
  return stgCache.filter(s=>{
    if(creche&&String(s.creche_id||'')!==String(creche))return false;
    if(type&&stgType(s)!==type)return false;
    return true;
  });
}
function stgMajCompteurs(){
  const base=stgBaseFiltre();
  ['actives','demandes','terminees','toutes'].forEach(p=>{
    const el=document.getElementById('stg-n-'+p);
    if(!el)return;
    const n=base.filter(s=>stgDansPuce(s,p)).length;
    el.textContent=n;
    el.classList.toggle('vide',!n);
  });
}

/* ── Quand envoyer le lien, et jusqu'à quand il vaut ──────────────────────
   Une demande de stage arrive souvent des mois avant le stage lui-même. Deux
   conséquences, longtemps mal traitées :

   1. Envoyer le lien tout de suite n'a pas de sens — la personne le perdra, et
      il aura expiré le jour où elle en aura besoin. L'application ne l'envoie
      donc jamais toute seule : elle signale, à J-30 du début, que c'est le
      moment. Rien n'empêche de le créer plus tôt si la stagiaire le réclame.

   2. Une durée fixe de 30 jours à partir de la création tombe au milieu du
      stage. L'expiration se cale donc sur les DATES DE LA FICHE : 30 jours
      après la fin, ce qui laisse aussi le temps de réclamer une pièce
      manquante pendant le stage. Sans dates, on retombe sur les 30 jours. */

function stgLienExpiration(s){
  const plancher=Date.now()+STG_LIEN_JOURS*86400000;
  const apres=d=>new Date(String(d).slice(0,10)+'T12:00:00').getTime()+STG_LIEN_APRES*86400000;
  let cible=plancher;
  if(s&&s.date_fin)        cible=Math.max(cible,apres(s.date_fin));
  else if(s&&s.date_debut) cible=Math.max(cible,apres(s.date_debut)+30*86400000);
  return new Date(cible).toISOString();
}

/* « Il est temps » : le stage commence dans moins de 30 jours (ou a commencé),
   et il n'y a pas de lien utilisable. Une fiche refusée, annulée ou terminée
   ne réclame rien. */
function stgLienAEnvoyer(s){
  if(!s||stgClos(s.statut)||s.statut==='demande')return false;
  if(!s.date_debut)return false;
  const debut=new Date(String(s.date_debut).slice(0,10)+'T12:00:00').getTime();
  if(debut-Date.now()>STG_LIEN_AVANT*86400000)return false;
  if(!s.token)return true;
  return !s.token_expire_le||new Date(s.token_expire_le).getTime()<Date.now();
}

/* La date à partir de laquelle le rappel s'allumera. */
function stgLienDateRappel(s){
  if(!s||!s.date_debut)return '';
  const d=new Date(String(s.date_debut).slice(0,10)+'T12:00:00');
  d.setDate(d.getDate()-STG_LIEN_AVANT);
  return d.toISOString().slice(0,10);
}

function stgFiltrees(){
  const creche=(document.getElementById('stg-f-creche-liste')||{}).value||'';
  const type=(document.getElementById('stg-f-type-liste')||{}).value||'';
  const q=((document.getElementById('stg-search')||{}).value||'').trim().toLowerCase();
  return stgCache.filter(s=>{
    if(creche&&String(s.creche_id||'')!==String(creche))return false;
    if(type&&stgType(s)!==type)return false;
    if(!stgDansPuce(s,stgFilter))return false;
    if(q){
      const foin=[s.prenom,s.nom,s.ecole,s.formation,s.niveau,stgCrecheName(s.creche_id)]
        .join(' ').toLowerCase();
      if(!foin.includes(q))return false;
    }
    return true;
  }).sort((a,b)=>{
    /* Ce qui demande une action d'abord, le reste ensuite : une demande non
       traitée ne doit jamais se retrouver sous six stages terminés. */
    const rang=s=>s.statut==='demande'?0:s.statut==='contact'?1:s.statut==='en_cours'?2:
                  s.statut==='accepte'?3:8;
    const d=rang(a)-rang(b);
    if(d)return d;
    return String(b.date_debut||'').localeCompare(String(a.date_debut||''));
  });
}

function stgStatCard(label,val,icon,color,filter){
  const actif=filter&&stgFilter===filter;
  return '<div class="stat-card clickable'+(actif?' active':'')+'" data-filter="'+filter+'" onclick="stgSetFilter(\''+filter+'\')">'
    +'<div class="stat-val" style="color:'+color+'">'+val+'</div>'
    +'<div class="stat-label"><i class="ti '+icon+'" style="color:'+color+'"></i> '+label+'</div></div>';
}

/* Une liste vide a trois causes très différentes : rien en base, un filtre trop
   étroit, ou des fiches rangées sous une autre puce. Les confondre, c'est
   chercher un bug là où il n'y en a pas. */
function stgMessageVide(){
  if(!stgCache.length)
    return 'Aucune fiche enregistrée. Commencez par « Nouvelle fiche ».';
  const ailleurs=['demandes','encours','avenir','terminees']
    .filter(p=>p!==stgFilter&&stgCache.some(s=>stgDansPuce(s,p)));
  const nom={demandes:'Demandes à traiter',encours:'En cours',avenir:'Acceptés, à venir',terminees:'Terminées'};
  if(!ailleurs.length)
    return 'Aucune fiche ne correspond à ce filtre.';
  return 'Aucune fiche sous ce filtre.<br><span style="font-size:12px">'
    +'Il y en a sous : '+ailleurs.map(p=>'<strong>'+nom[p]+'</strong>').join(', ')
    +' — ou cliquez sur <strong>Toutes</strong>.</span>';
}

function stgRender(){
  const stats=document.getElementById('stg-stats');
  if(stats){
    const base=stgBaseFiltre();
    const aTraiter=base.filter(s=>stgATraiter(s)).length;
    const enCours=base.filter(s=>s.statut==='en_cours').length;
    const aVenir=base.filter(s=>s.statut==='accepte').length;
    const alt=base.filter(s=>stgType(s)==='alternant'&&!stgClos(s.statut)).length;
    const incomplets=base.filter(s=>!stgClos(s.statut)&&!stgAvancement(s.id).complet).length;
    const aEnvoyer=base.filter(stgLienAEnvoyer).length;
    const terminees=base.filter(s=>stgClos(s.statut)).length;
    const toutes=base.length;
    stats.innerHTML=
       stgStatCard('Demandes à traiter',aTraiter,'ti-inbox',aTraiter?'var(--blue)':'var(--muted)','demandes')
      +stgStatCard('En cours',enCours,'ti-run','var(--green)','encours')
      +stgStatCard('Acceptés, à venir',aVenir,'ti-calendar-plus','var(--koala)','avenir')
      +stgStatCard('Alternants en cours et à venir',alt,'ti-briefcase',alt?'var(--orange-dark)':'var(--muted)','alternants')
      +stgStatCard('Dossiers incomplets',incomplets,'ti-file-alert',incomplets?'var(--orange-dark)':'var(--muted)','incomplets')
      +stgStatCard('Liens à envoyer',aEnvoyer,'ti-send',aEnvoyer?'var(--orange-dark)':'var(--muted)','aenvoyer')
      +stgStatCard('Terminées',terminees,'ti-check','var(--muted)','terminees')
      +stgStatCard('Toutes',toutes,'ti-list','var(--muted)','toutes');
  }
  const badge=document.getElementById('stg-badge-encours');
  if(badge){
    const n=stgCache.filter(s=>stgATraiter(s)).length;
    badge.textContent=n;badge.style.display=n?'':'none';
  }
  stgMajCompteurs();

  const box=document.getElementById('stg-list');
  if(!box)return;
  const liste=stgFiltrees();
  if(!liste.length){
    box.innerHTML='<div style="text-align:center;padding:36px 20px;color:var(--muted);font-size:13px">'
      +'<i class="ti ti-school" style="font-size:30px;display:block;margin-bottom:8px;opacity:.5"></i>'
      +stgMessageVide()+'</div>';
    return;
  }
  box.innerHTML=liste.map(stgCarte).join('');
}

function stgCarte(s){
  const m=stgMeta(s.statut);
  const p=stgProfil(s);
  const av=stgAvancement(s.id);
  const jours=stgJoursDe(s.id).filter(j=>!j.absent).length;
  const pct=av.total?Math.round(av.faits/av.total*100):100;
  const bord=stgClos(s.statut)?'var(--border)':m.cls;
  const periode=s.date_debut
    ? stgDateFr(s.date_debut)+(s.date_fin?' → '+stgDateFr(s.date_fin):'')
    : 'dates non posées';
  const libStatut=(s.statut==='en_cours')
    ? (stgType(s)==='alternant'?'Alternance en cours':'Stage en cours') : m.lib;
  const lien = stgLienAEnvoyer(s)
    ? '<span style="background:var(--orange-light);color:var(--orange-dark);border-radius:10px;padding:1px 9px;font-weight:700">'
      +'<i class="ti ti-send"></i> lien à envoyer</span>'
    : !s.token ? ''
    : (new Date(s.token_expire_le).getTime()<Date.now()
        ? '<span style="color:var(--red)"><i class="ti ti-link-off"></i> lien expiré</span>'
        : '<span style="color:var(--green)"><i class="ti ti-link"></i> lien actif</span>');

  return '<div onclick="stgOpenFiche(\''+s.id+'\')" style="cursor:pointer;background:var(--card);border:1.5px solid var(--border);border-left:4px solid '+bord+';border-radius:10px;padding:12px 14px">'
    +'<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">'
    +'<div style="min-width:0;flex:1">'
    +'<div style="font-weight:700;font-size:14px">'
    +'<span style="background:'+p.couleur+';color:#fff;border-radius:6px;padding:1px 7px;font-size:10.5px;font-weight:700;margin-right:6px;vertical-align:1px">'
    +'<i class="ti '+p.ic+'"></i> '+p.lib+'</span>'
    +escHtml(stgNomComplet(s))
    +(s.creche_id?'<span style="font-weight:500;color:var(--muted)"> · '+escHtml(stgCrecheName(s.creche_id))+'</span>'
                 :'<span style="font-weight:500;color:var(--orange-dark)"> · à orienter</span>')+'</div>'
    +'<div style="font-size:12px;color:var(--muted);margin-top:2px">'
    +escHtml([s.formation,s.niveau,s.ecole].filter(Boolean).join(' · ')||'Formation non renseignée')+'</div>'
    +'</div>'
    +'<span style="background:'+m.cls+';color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;white-space:nowrap">'
    +'<i class="ti '+m.ic+'"></i> '+escHtml(libStatut)+'</span>'
    +'</div>'
    +'<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#666;margin-top:9px;align-items:center">'
    +'<span><i class="ti ti-calendar"></i> '+escHtml(periode)+'</span>'
    +(jours?'<span><i class="ti ti-clock"></i> '+jours+' jour'+(jours>1?'s':'')+' prévu'+(jours>1?'s':'')+'</span>':'')
    +'<span><i class="ti ti-file-text"></i> '+p.contratCourt+' : '+escHtml(STG_CONV[s.convention_statut]||'—')+'</span>'
    +(lien?'<span>'+lien+'</span>':'')
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:9px;margin-top:9px">'
    +'<div style="flex:1;height:7px;background:var(--border);border-radius:99px;overflow:hidden">'
    +'<div style="height:100%;width:'+pct+'%;background:'+(av.complet?'var(--green)':'var(--orange)')+';border-radius:99px"></div></div>'
    +'<span style="font-size:11.5px;color:'+(av.complet?'var(--green)':'var(--muted)')+';font-weight:600;white-space:nowrap">'
    +av.faits+'/'+av.total+' pièce'+(av.total>1?'s':'')+'</span>'
    +'</div>'
    +'</div>';
}

function stgDateFr(d){
  if(!d)return '';
  const p=String(d).slice(0,10).split('-');
  return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(d);
}

function stgMajBadge(){
  const b=document.getElementById('badge-stagiaires');
  if(!b)return;
  const n=stgCache.filter(s=>stgATraiter(s)).length;
  b.textContent=n;b.style.display=n?'':'none';
  updateHubBadge();
}
