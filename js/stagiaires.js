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

/* Une référente ne peut affecter une stagiaire qu'à sa propre crèche : lui
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
  /* Proposer « toutes les crèches » à une référente serait lui promettre une
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
  stgRenderTypes();
  stgRenderRess();
  stgMajBadge();
}

function stgShowView(v,btn){
  ['fiches','cal','types','ress'].forEach(x=>{
    const el=document.getElementById('stg-view-'+x);
    if(el)el.classList.toggle('active',x===v);
  });
  document.querySelectorAll('#main-stagiaires .module-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  if(v==='cal')stgRenderCal();
  if(v==='types')stgRenderTypes();
  if(v==='ress')stgRenderRess();
}

function stgSetFilter(f){
  stgFilter=f;
  ['actives','demandes','terminees','toutes'].forEach(x=>{
    const c=document.getElementById('stg-chip-'+x);
    if(c)c.classList.toggle('active',x===f);
  });
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
   la fiche a besoin d'être vue, et le statut sous lequel une référente
   enregistre souvent sa première saisie. */
function stgATraiter(s){return s.statut==='demande'||s.statut==='contact';}

/* La règle de chaque puce, écrite une seule fois : les compteurs affichés et
   la liste affichée ne peuvent donc pas se contredire. */
function stgDansPuce(s,puce){
  if(puce==='demandes')return stgATraiter(s);
  if(puce==='actives')return s.statut==='accepte'||s.statut==='en_cours';
  if(puce==='terminees')return stgClos(s.statut);
  return true;
}

/* Le nombre de fiches derrière chaque puce, crèche et type courants compris :
   une fiche rangée ailleurs reste visible depuis la puce ouverte. */
function stgMajCompteurs(){
  const creche=(document.getElementById('stg-f-creche-liste')||{}).value||'';
  const type=(document.getElementById('stg-f-type-liste')||{}).value||'';
  const base=stgCache.filter(s=>{
    if(creche&&String(s.creche_id||'')!==String(creche))return false;
    if(type&&stgType(s)!==type)return false;
    return true;
  });
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

function stgStatCard(label,val,icon,color){
  return '<div class="stat-card"><div class="stat-val" style="color:'+color+'">'+val+'</div>'
    +'<div class="stat-label"><i class="ti '+icon+'" style="color:'+color+'"></i> '+label+'</div></div>';
}

/* Une liste vide a trois causes très différentes : rien en base, un filtre trop
   étroit, ou des fiches rangées sous une autre puce. Les confondre, c'est
   chercher un bug là où il n'y en a pas. */
function stgMessageVide(){
  if(!stgCache.length)
    return 'Aucune fiche enregistrée. Commencez par « Nouvelle fiche ».';
  const ailleurs=['demandes','actives','terminees']
    .filter(p=>p!==stgFilter&&stgCache.some(s=>stgDansPuce(s,p)));
  const nom={demandes:'Demandes à traiter',actives:'En cours et à venir',terminees:'Terminées'};
  if(!ailleurs.length)
    return 'Aucune fiche ne correspond à ce filtre.';
  return 'Aucune fiche sous ce filtre.<br><span style="font-size:12px">'
    +'Il y en a sous : '+ailleurs.map(p=>'<strong>'+nom[p]+'</strong>').join(', ')
    +' — ou cliquez sur <strong>Toutes</strong>.</span>';
}

function stgRender(){
  const stats=document.getElementById('stg-stats');
  if(stats){
    const aTraiter=stgCache.filter(s=>stgATraiter(s)).length;
    const enCours=stgCache.filter(s=>s.statut==='en_cours').length;
    const aVenir=stgCache.filter(s=>s.statut==='accepte').length;
    const alt=stgCache.filter(s=>stgType(s)==='alternant'&&!stgClos(s.statut)).length;
    const incomplets=stgCache.filter(s=>!stgClos(s.statut)&&!stgAvancement(s.id).complet).length;
    const aEnvoyer=stgCache.filter(stgLienAEnvoyer).length;
    stats.innerHTML=
       stgStatCard('Demandes à traiter',aTraiter,'ti-inbox',aTraiter?'var(--blue)':'var(--muted)')
      +stgStatCard('En cours',enCours,'ti-run','var(--green)')
      +stgStatCard('Acceptés, à venir',aVenir,'ti-calendar-plus','var(--koala)')
      +stgStatCard('Alternants en cours et à venir',alt,'ti-briefcase',alt?'var(--orange-dark)':'var(--muted)')
      +stgStatCard('Dossiers incomplets',incomplets,'ti-file-alert',incomplets?'var(--orange-dark)':'var(--muted)')
      +stgStatCard('Liens à envoyer',aEnvoyer,'ti-send',aEnvoyer?'var(--orange-dark)':'var(--muted)');
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

// ── La fiche ──────────────────────────────────────────────────────────────

function stgOpenFiche(id,typeDefaut){
  stgFicheId=id||null;
  const s=id?stgCache.find(x=>String(x.id)===String(id)):null;
  const v=(el,val)=>{const e=document.getElementById(el);if(e)e.value=val==null?'':val;};
  const type=s?stgType(s):(typeDefaut==='alternant'?'alternant':'stagiaire');

  document.getElementById('stg-modal-title').textContent=
    s?stgNomComplet(s):'Nouvelle fiche';
  v('stg-f-type',type);

  const selC=document.getElementById('stg-f-creche');
  if(selC)selC.innerHTML=stgOptionsCreches('— Pas encore orientée —');
  stgRemplirReferents(s?s.creche_id:null);

  v('stg-f-prenom',s&&s.prenom);       v('stg-f-nom',s&&s.nom);
  v('stg-f-email',s&&s.email);         v('stg-f-tel',s&&s.telephone);
  v('stg-f-ecole',s&&s.ecole);         v('stg-f-formation',s&&s.formation);
  v('stg-f-niveau',s&&s.niveau);       v('stg-f-creche',s?(s.creche_id||''):(isDirection?'':(currentProfile&&currentProfile.creche_id)||''));
  v('stg-f-referent',s&&s.referent_id);
  v('stg-f-statut',s?s.statut:'demande');
  v('stg-f-demande',s?s.demande_le:todayStr());
  v('stg-f-padlet',s&&s.padlet_url);
  v('stg-f-debut',s&&s.date_debut);    v('stg-f-fin',s&&s.date_fin);
  v('stg-f-conv',s?s.convention_statut:'a_demander');
  v('stg-f-conv-date',s&&s.convention_le);
  v('stg-f-notes',s&&s.notes);
  v('stg-f-bilan',s&&s.bilan);         v('stg-f-bilan-date',s&&s.bilan_le);

  const apres=document.getElementById('stg-apres-creation');
  if(apres)apres.style.display=s?'':'none';
  const del=document.getElementById('stg-f-del');
  if(del)del.style.display=(s&&isDirection)?'':'none';

  stgTypeChange();
  if(s){stgRenderLien();stgRenderRessFiche();stgRenderDocs();stgRenderJours();stgRenderCollabZone();}
  document.getElementById('modal-stagiaire-wrap').classList.add('open');
}

/* Changer le type ne change aucune donnée : il change le vocabulaire de la
   fiche et la liste des pièces demandées. Un alternant à qui on réclame une
   convention de stage rappelle la crèche pour demander ce qu'il doit envoyer —
   c'est exactement ce qu'on veut éviter. */
function stgTypeChange(){
  const type=(document.getElementById('stg-f-type')||{}).value==='alternant'?'alternant':'stagiaire';
  const p=STG_PROFILS[type];
  const txt=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  txt('stg-lbl-debut','Début '+(type==='alternant'?"de l'alternance":'du stage'));
  txt('stg-lbl-fin','Fin '+(type==='alternant'?"de l'alternance":'du stage'));
  txt('stg-lbl-conv',p.contrat);
  txt('stg-lbl-conv-date',p.contratCourt+' — date');
  txt('stg-lbl-bilan','Bilan de fin '+(type==='alternant'?"d'alternance":'de stage'));
  txt('stg-opt-encours',type==='alternant'?'Alternance en cours':'Stage en cours');
  txt('stg-opt-termine',type==='alternant'?'Alternance terminée':'Stage terminé');
  /* Les pièces demandées ne sont pas les mêmes : on redessine le bloc si la
     fiche est déjà enregistrée. */
  if(stgFicheId){stgRenderDocs(type);stgRenderRessFiche(type);stgRenderCollabZone();}
}

/* Les référentes proposées sont celles de la crèche choisie : offrir celles des
   autres sites n'aurait aucun sens sur une fiche de stage.
   La direction et la coordination, elles, apparaissent toujours et quelle que
   soit la crèche — accompagner un stagiaire ou un alternant fait partie du
   travail de coordination, et il fallait pouvoir s'y inscrire soi-même. */
function stgRemplirReferents(crecheId){
  const sel=document.getElementById('stg-f-referent');
  if(!sel)return;
  const cid=crecheId||((document.getElementById('stg-f-creche')||{}).value||'');
  const refs=cacheReferents.filter(r=>r.role==='referent'&&(!cid||String(r.creche_id)===String(cid)));
  const dirs=cacheReferents.filter(r=>r.role==='direction');
  const opt=r=>'<option value="'+escHtml(String(r.id))+'">'+escHtml(r.name||'—')
    +(r.poste?' — '+escHtml(r.poste):'')+'</option>';
  const val=sel.value;
  sel.innerHTML='<option value="">— Non désignée —</option>'
    +(refs.length?'<optgroup label="Référentes de la crèche">'+refs.map(opt).join('')+'</optgroup>':'')
    +(dirs.length?'<optgroup label="Direction et coordination">'+dirs.map(opt).join('')+'</optgroup>':'');
  /* Une personne enregistrée sur la fiche mais absente des deux groupes (elle a
     changé de crèche depuis) resterait perdue en silence : on la remet. */
  if(val){
    sel.value=val;
    if(sel.value!==val){
      const r=cacheReferents.find(x=>String(x.id)===String(val));
      if(r){sel.insertAdjacentHTML('beforeend','<optgroup label="Déjà enregistrée">'+opt(r)+'</optgroup>');sel.value=val;}
    }
  }
}

/* Passer une stagiaire en « terminé » sans bilan, c'est perdre le bilan :
   personne ne rouvre une fiche close. On le rappelle au moment où ça se joue. */
function stgStatutChange(){
  const st=(document.getElementById('stg-f-statut')||{}).value;
  const bilan=(document.getElementById('stg-f-bilan')||{}).value;
  if(st==='termine'&&!bilan&&stgFicheId){
    showBanner('Stage terminé : pensez au bilan, plus bas dans la fiche.','error');
  }
}

async function stgSave(){
  const val=id=>{const e=document.getElementById(id);return e?e.value.trim():'';};
  const prenom=val('stg-f-prenom');
  if(!prenom)return showBanner('Le prénom est obligatoire.','error');

  const row={
    type_contrat:val('stg-f-type')==='alternant'?'alternant':'stagiaire',
    prenom:prenom,
    nom:val('stg-f-nom')||null,
    email:val('stg-f-email')||null,
    telephone:val('stg-f-tel')||null,
    ecole:val('stg-f-ecole')||null,
    formation:val('stg-f-formation')||null,
    niveau:val('stg-f-niveau')||null,
    creche_id:val('stg-f-creche')||null,
    referent_id:val('stg-f-referent')||null,
    statut:val('stg-f-statut')||'demande',
    demande_le:val('stg-f-demande')||null,
    padlet_url:val('stg-f-padlet')||null,
    date_debut:val('stg-f-debut')||null,
    date_fin:val('stg-f-fin')||null,
    convention_statut:val('stg-f-conv')||'a_demander',
    convention_le:val('stg-f-conv-date')||null,
    notes:val('stg-f-notes')||null
  };
  /* Les champs de bilan n'existent dans le DOM qu'après création : les lire
     sur une nouvelle fiche écraserait la valeur par une chaîne vide. */
  if(stgFicheId){
    row.bilan=val('stg-f-bilan')||null;
    row.bilan_le=val('stg-f-bilan-date')||null;
  }
  if(row.date_debut&&row.date_fin&&row.date_fin<row.date_debut)
    return showBanner('La fin du stage est avant son début.','error');

  const btn=document.getElementById('stg-f-save');
  if(btn)btn.disabled=true;
  const creation=!stgFicheId;
  let ok=false;
  if(stgFicheId){
    ok=await dbUpdate('stagiaires',stgFicheId,row);
  }else{
    const saved=await dbInsert('stagiaires',row);
    ok=!!saved;
    if(saved)stgFicheId=saved.id;
  }
  /* Si le script 31 n'a pas encore été exécuté, la colonne type_contrat
     n'existe pas : plutôt que de perdre la saisie, on réenregistre sans elle
     et on dit pourquoi le type n'a pas été retenu. */
  if(!ok&&/type_contrat/i.test(window._lastDbError||'')){
    delete row.type_contrat;
    ok=stgFicheId?await dbUpdate('stagiaires',stgFicheId,row)
                 :!!(await dbInsert('stagiaires',row).then(r=>{if(r)stgFicheId=r.id;return r;}));
    if(ok)showBanner('Fiche enregistrée, mais le type (stagiaire / alternant) n\'a pas pu l\'être : le script 31 n\'a pas encore été exécuté sur Supabase.','error');
  }
  if(btn)btn.disabled=false;
  if(!ok){
    return showBanner('Enregistrement impossible'
      +(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  }
  await stgLoad();
  /* À la création, la fiche reste ouverte : le lien de dépôt, les documents et
     les jours n'existent qu'une fois la personne enregistrée, et c'est là qu'on
     enchaîne. Sur une fiche déjà connue, « Enregistrer » veut dire « j'ai
     fini » : on ferme. */
  if(creation){
    showBanner('Fiche créée — vous pouvez maintenant créer le lien de dépôt et saisir les jours ✅');
    stgOpenFiche(stgFicheId);
  }else{
    closeModal('modal-stagiaire-wrap');
    showBanner('Fiche enregistrée ✅');
  }
}

async function stgSupprimer(){
  if(!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const docs=stgDocsDe(stgFicheId);
  if(!confirm('Supprimer définitivement la fiche de '+stgNomComplet(s||{})+' ?\n\n'
    +(docs.length?docs.length+' document(s) déposé(s) et ':'')
    +'tous ses jours de présence seront effacés.'))return;
  /* Les fichiers d'abord : la ligne supprimée, on n'aurait plus leur chemin et
     ils resteraient dans le bucket pour toujours. */
  const chemins=docs.map(d=>d.path).filter(Boolean);
  if(chemins.length){
    const {error}=await sb.storage.from(STG_BUCKET).remove(chemins);
    if(error)console.warn('[Stagiaires] fichiers non supprimés',error.message);
  }
  const ok=await dbDelete('stagiaires',stgFicheId);
  if(!ok)return showBanner('Suppression impossible.','error');
  closeModal('modal-stagiaire-wrap');
  stgFicheId=null;
  await stgLoad();
  showBanner('Fiche supprimée.');
}

// ── Le lien de dépôt ──────────────────────────────────────────────────────

function stgToken(){
  const a=new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,32);
}
function stgLienUrl(token){
  return location.origin+location.pathname.replace(/[^/]*$/,'')+'stagiaire.html?t='+token;
}

function stgRenderLien(){
  const zone=document.getElementById('stg-lien-zone');
  if(!zone)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s){zone.innerHTML='';return;}
  const actif=s.token&&s.token_expire_le&&new Date(s.token_expire_le).getTime()>Date.now();

  let h='<div style="font-weight:700;font-size:13px;margin-bottom:8px">'
    +'<i class="ti ti-link" style="color:var(--koala)"></i> Lien de dépôt des documents</div>';

  if(!s.token){
    const rappel=stgLienDateRappel(s);
    const tard=stgLienAEnvoyer(s);
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.5">'
      +'La personne dépose ses pièces elle-même depuis son téléphone, sans compte ni application. '
      +'Le lien restera valable jusqu\'au <b>'+escHtml(stgDateFr(stgLienExpiration(s)))+'</b>'
      +(s.date_fin?' — soit '+STG_LIEN_APRES+' jours après la fin '
        +(stgType(s)==='alternant'?"de l'alternance":'du stage'):'')+'.</p>';
    /* Une demande arrivée six mois à l'avance n'a pas besoin de son lien tout
       de suite : il se perdrait, et la personne aurait tout oublié le jour du
       stage. On dit quand ce sera le moment, sans l'empêcher de le créer. */
    if(tard){
      h+='<div style="background:var(--orange-light);border-left:4px solid var(--orange-dark);border-radius:0 8px 8px 0;'
        +'padding:9px 12px;font-size:12.5px;color:#8a4b00;margin-bottom:10px">'
        +'<i class="ti ti-send"></i> <strong>C\'est le moment de lui envoyer son lien</strong> — '
        +(stgType(s)==='alternant'?"l'alternance commence":'le stage commence')+' le '
        +escHtml(stgDateFr(s.date_debut))+'.</div>';
    }else if(rappel){
      h+='<div style="background:var(--koala-light);border-left:4px solid var(--koala);border-radius:0 8px 8px 0;'
        +'padding:9px 12px;font-size:12.5px;color:var(--koala-dark);margin-bottom:10px">'
        +'<i class="ti ti-clock"></i> Rien ne presse : '
        +(stgType(s)==='alternant'?"l'alternance commence":'le stage commence')+' le <b>'
        +escHtml(stgDateFr(s.date_debut))+'</b>. La fiche passera en '
        +'<strong>« lien à envoyer »</strong> le <b>'+escHtml(stgDateFr(rappel))+'</b>'
        +' — vous pouvez aussi le créer dès maintenant si elle le demande.</div>';
    }
    h+='<button class="btn-primary" onclick="stgCreerLien()"><i class="ti ti-link-plus"></i> Créer le lien</button>';
  }else{
    h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">'
      +'<input class="finput" id="stg-lien-url" readonly value="'+escHtml(stgLienUrl(s.token))+'" style="flex:1;min-width:220px;font-size:12px">'
      +'<button class="btn-sm" onclick="stgCopierLien()"><i class="ti ti-copy"></i> Copier</button>'
      +(s.email?'<a class="btn-sm" style="text-decoration:none" href="'+stgMailto(s)+'"><i class="ti ti-mail"></i> Envoyer par mail</a>':'')
      +'<button class="btn-sm" onclick="stgCreerLien(true)"><i class="ti ti-refresh"></i> Renouveler</button>'
      +'</div>'
      +'<div style="font-size:12px;color:'+(actif?'var(--muted)':'var(--red)')+'">'
      +(actif?'<i class="ti ti-clock"></i> Valable jusqu\'au '+escHtml(stgDateFr(s.token_expire_le))
             :'<i class="ti ti-clock-off"></i> Lien expiré le '+escHtml(stgDateFr(s.token_expire_le))
              +' — « Renouveler » en crée un nouveau')
      +'</div>';
  }
  zone.innerHTML=h;
}

/* Ce que la personne trouvera EN PLUS sur son lien. La phrase n'est écrite
   que s'il y a effectivement quelque chose à lire ou à remplir : annoncer un
   projet pédagogique qui n'est pas en ligne ferait plus de mal que de bien.
   Le PDF n'est pas joint au mail — il vit sur le lien, où il reste à jour et
   où l'on sait qui l'a ouvert. */
function stgMailtoRess(s){
  const liste=stgRessPour(s);
  if(!liste.length)return '';
  const docs=liste.filter(r=>stgRessNature(r)!=='lien').map(r=>r.libelle);
  const liens=liste.filter(r=>stgRessNature(r)==='lien').map(r=>r.libelle);
  let t='Vous y trouverez aussi, en haut de la page :\n';
  docs.forEach(l=>{t+='  · '+l+' (à lire)\n';});
  liens.forEach(l=>{t+='  · '+l+' (à remplir en ligne)\n';});
  return t+'\n';
}

/* Le mail est composé dans le client de messagerie du poste : rien ne part
   d'ici, et il n'y a donc pas d'adresse d'expédition à configurer. */
function stgMailto(s){
  const p=stgProfil(s);
  const sujet='Vos documents '+(stgType(s)==='alternant'?"d'alternance":'de stage')+' — Koala Kids';
  const corps='Bonjour '+(s.prenom||'')+',\n\n'
    +'Voici le lien pour nous transmettre les documents nécessaires à votre '+p.periode
    +(s.creche_id?' à la crèche '+stgCrecheName(s.creche_id):'')+' :\n\n'
    +stgLienUrl(s.token)+'\n\n'
    +stgMailtoRess(s)
    +'Vous pouvez photographier vos pièces directement avec votre téléphone, en plusieurs fois.\n'
    +'Ce lien est valable jusqu\'au '+stgDateFr(s.token_expire_le)+'.\n\n'
    +'À bientôt,\nL\'équipe Koala Kids';
  return 'mailto:'+encodeURIComponent(s.email||'')
    +'?subject='+encodeURIComponent(sujet)+'&body='+encodeURIComponent(corps);
}

async function stgCreerLien(renouveler){
  if(!stgFicheId)return;
  if(renouveler&&!confirm('Créer un nouveau lien ?\n\nL\'ancien cessera immédiatement de fonctionner.'))return;
  const token=stgToken();
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const expire=stgLienExpiration(s);
  const ok=await dbUpdate('stagiaires',stgFicheId,{
    token:token,token_expire_le:expire,lien_envoye_le:new Date().toISOString()
  });
  if(!ok)return showBanner('Création du lien impossible.','error');
  await stgLoad();
  stgRenderLien();
  showBanner(renouveler?'Nouveau lien créé — l\'ancien ne fonctionne plus.':'Lien créé ✅');
}

function stgCopierLien(){
  const el=document.getElementById('stg-lien-url');
  if(!el)return;
  el.select();
  navigator.clipboard.writeText(el.value)
    .then(()=>showBanner('Lien copié — collez-le dans un SMS ou un mail ✅'))
    .catch(()=>{try{document.execCommand('copy');showBanner('Lien copié ✅');}
                catch(e){showBanner('Copie impossible — sélectionnez le lien à la main.','error');}});
}

// ── Les documents ─────────────────────────────────────────────────────────

/* `typeForce` vient de stgTypeChange() : la fiche en cours d'édition peut avoir
   changé de type sans être encore enregistrée. */
function stgRenderDocs(typeForce){
  const zone=document.getElementById('stg-docs-zone');
  if(!zone||!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const type=typeForce||stgType(s);
  const docs=stgDocsDe(stgFicheId);
  const oblig=stgTypesPour(type).filter(t=>t.actif&&t.obligatoire);
  const couverts=new Set(docs.filter(d=>d.statut!=='refuse').map(d=>String(d.type_id)));
  const faitsN=oblig.filter(t=>couverts.has(String(t.id))).length;
  const av={faits:faitsN,total:oblig.length,complet:oblig.length>0&&faitsN===oblig.length};
  const actifs=stgTypesPour(type).filter(t=>t.actif);

  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-paperclip" style="color:var(--koala)"></i> Documents</div>'
    +'<span style="font-size:12px;color:'+(av.complet?'var(--green)':'var(--muted)')+';font-weight:600">'
    +av.faits+' / '+av.total+' pièce'+(av.total>1?'s':'')+' obligatoire'+(av.total>1?'s':'')+'</span></div>';

  h+=actifs.map(t=>{
    const fs=docs.filter(d=>String(d.type_id)===String(t.id));
    const ok=fs.some(d=>d.statut!=='refuse');
    return '<div style="border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:7px;background:'+(ok?'#FCFEFC':'#fff')+'">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      +'<i class="ti ti-'+(ok?'circle-check':'circle-dashed')+'" style="color:'+(ok?'var(--green)':'var(--muted)')+'"></i>'
      +'<span style="font-weight:600;font-size:12.5px;flex:1;min-width:120px">'+escHtml(t.libelle)
      +(t.obligatoire?'':'<span style="color:var(--muted);font-weight:400"> (facultatif)</span>')+'</span>'
      +'<button class="btn-sm" onclick="document.getElementById(\'stg-up-'+t.id+'\').click()">'
      +'<i class="ti ti-upload"></i> Téléverser</button>'
      +'<input type="file" id="stg-up-'+t.id+'" data-type="'+t.id+'" accept="image/*,application/pdf" '
      +'style="display:none" onchange="stgUpload(event)">'
      +'</div>'
      +(fs.length?'<div style="display:flex;flex-direction:column;gap:5px;margin-top:7px">'
        +fs.map(stgLigneDoc).join('')+'</div>':'')
      +'<span id="stg-upst-'+t.id+'" style="font-size:11.5px;color:var(--muted)"></span>'
      +'</div>';
  }).join('');

  /* Une pièce dont le type a été supprimé du catalogue ne doit pas disparaître
     de la fiche : le document existe, il a été reçu, il se voit. */
  const orphelins=docs.filter(d=>!actifs.find(t=>String(t.id)===String(d.type_id)));
  if(orphelins.length){
    h+='<div style="border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:7px">'
      +'<div style="font-weight:600;font-size:12.5px;margin-bottom:6px">Autres documents reçus</div>'
      +'<div style="display:flex;flex-direction:column;gap:5px">'+orphelins.map(stgLigneDoc).join('')+'</div></div>';
  }
  if(!actifs.length){
    h+='<p style="font-size:12.5px;color:var(--muted)">Aucune pièce n\'est demandée pour le moment '
      +'— la liste se règle dans l\'onglet « Pièces demandées ».</p>';
  }
  zone.innerHTML=h;
}

function stgLigneDoc(d){
  const st=d.statut==='valide'?{t:'Validé',c:'var(--green)',b:'var(--green-light)'}
          :d.statut==='refuse'?{t:'Refusé',c:'var(--red)',b:'var(--red-light)'}
          :{t:'Reçu',c:'var(--orange-dark)',b:'var(--orange-light)'};
  return '<div style="display:flex;align-items:center;gap:7px;background:#FAFAFD;border:1px solid var(--border);border-radius:7px;padding:6px 9px;flex-wrap:wrap">'
    +'<button type="button" onclick="stgOuvrirDoc(\''+d.id+'\')" title="Ouvrir" '
    +'style="flex:1;min-width:110px;text-align:left;border:none;background:none;padding:0;cursor:pointer;'
    +'font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;'
    +'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    +escHtml(d.filename||'Document')+'</button>'
    +'<span style="background:'+st.b+';color:'+st.c+';border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">'+st.t+'</span>'
    +'<span style="font-size:10.5px;color:var(--muted)">'+escHtml(d.depose_par==='stagiaire'?'déposé via le lien':(d.depose_par||''))+'</span>'
    +(d.statut!=='valide'?'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--green)" title="Valider" onclick="stgStatutDoc(\''+d.id+'\',\'valide\')"><i class="ti ti-check"></i></button>':'')
    +(d.statut!=='refuse'?'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--orange-dark)" title="Refuser" onclick="stgStatutDoc(\''+d.id+'\',\'refuse\')"><i class="ti ti-x"></i></button>':'')
    +'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--red)" title="Supprimer" onclick="stgSupprimerDoc(\''+d.id+'\')"><i class="ti ti-trash"></i></button>'
    +(d.statut==='refuse'&&d.commentaire
      ? '<div style="flex:0 0 100%;font-size:11px;color:var(--red)">Motif : '+escHtml(d.commentaire)+'</div>':'')
    +'</div>';
}

/* Le bucket est privé : l'URL est signée au moment du clic et expire. Rien
   n'est stocké, rien ne se transfère. */
async function stgOuvrirDoc(id){
  const d=stgDocsCache.find(x=>String(x.id)===String(id));
  if(!d||!d.path)return alert('Fichier introuvable.');
  const {data,error}=await sb.storage.from(d.bucket||STG_BUCKET).createSignedUrl(d.path,STG_URL_TTL);
  if(error||!data)return alert('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'));
  window.open(data.signedUrl,'_blank','noopener');
}

async function stgUpload(ev){
  const input=ev.target;
  const file=(input.files||[])[0];
  const typeId=input.dataset.type;
  input.value='';
  if(!file||!stgFicheId)return;
  const st=document.getElementById('stg-upst-'+typeId);
  if(file.size>12*1024*1024){
    if(st)st.textContent='⚠ Fichier trop lourd (12 Mo maximum).';
    return;
  }
  const type=stgTypes.find(t=>String(t.id)===String(typeId));
  if(st)st.textContent='⏳ Envoi de '+file.name+'…';
  try{
    const ext=(file.name.split('.').pop()||'bin');
    const path=stgFicheId+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
    /* Client authentifié (sb) : le bucket est privé et ses policies exigent un
       compte présent dans referents. */
    const {error}=await sb.storage.from(STG_BUCKET).upload(path,file);
    if(error)throw error;
    const {data:ins,error:insErr}=await sb.from('stagiaires_documents').insert({
      stagiaire_id:stgFicheId,type_id:typeId,
      libelle:(type&&type.libelle)||'Document',
      bucket:STG_BUCKET,path:path,filename:file.name,
      mime:file.type||null,taille:file.size,statut:'recu',
      depose_par:(currentProfile&&currentProfile.name)||(currentUser&&currentUser.email)||'la crèche'
    }).select().single();
    if(insErr){
      /* Sans sa ligne, le fichier serait orphelin dans le bucket. */
      await sb.storage.from(STG_BUCKET).remove([path]);
      throw insErr;
    }
    stgDocsCache.push(ins);
    if(st)st.textContent='';
    stgRenderDocs();stgRender();
    showBanner('Document ajouté ✅');
  }catch(e){
    console.error('[Stagiaires] upload',e.message);
    if(st)st.textContent='⚠ Erreur : '+e.message;
  }
}

async function stgStatutDoc(id,statut){
  const d=stgDocsCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  let motif=d.commentaire||null;
  if(statut==='refuse'){
    /* Un refus sans motif oblige la stagiaire à deviner ce qui ne va pas —
       elle renverra la même photo floue. */
    motif=prompt('Pourquoi ce document est-il refusé ?\n(la stagiaire verra ce motif)',
                 motif||'Document illisible, merci de le renvoyer');
    if(motif===null)return;
  }
  const ok=await dbUpdate('stagiaires_documents',id,{statut:statut,commentaire:statut==='refuse'?motif:null});
  if(!ok)return showBanner('Modification impossible.','error');
  d.statut=statut;d.commentaire=statut==='refuse'?motif:null;
  stgRenderDocs();stgRender();
  showBanner(statut==='valide'?'Document validé ✅':'Document refusé — la stagiaire en est informée sur son lien.');
}

async function stgSupprimerDoc(id){
  const d=stgDocsCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Supprimer « '+(d.filename||'ce document')+' » ?'))return;
  const ok=await dbDelete('stagiaires_documents',id);
  if(!ok)return showBanner('Suppression impossible.','error');
  const {error}=await sb.storage.from(d.bucket||STG_BUCKET).remove([d.path]);
  if(error)console.warn('[Stagiaires] fichier non supprimé du stockage',error.message);
  stgDocsCache=stgDocsCache.filter(x=>String(x.id)!==String(id));
  stgRenderDocs();stgRender();
  showBanner('Document supprimé.');
}

// ── Les jours de présence ─────────────────────────────────────────────────

const STG_JOURS_FR=['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];

function stgRenderJours(){
  const zone=document.getElementById('stg-jours-zone');
  if(!zone||!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const jours=stgJoursDe(stgFicheId);
  const presents=jours.filter(j=>!j.absent).length;

  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-calendar-week" style="color:var(--koala)"></i> Jours de présence</div>'
    +'<div style="display:flex;gap:7px;flex-wrap:wrap">'
    +'<button class="btn-sm" onclick="stgGenererJours()"><i class="ti ti-wand"></i> Générer les jours ouvrés</button>'
    /* Un <label> et non un bouton avec .click() : l'ouverture du sélecteur de
       fichier est alors native, sans JavaScript à exécuter — c'est ce qui
       marche partout, tablette comprise. */
    +'<label class="btn-sm" for="stg-imp-file" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px">'
    +'<i class="ti ti-calendar-up"></i> Importer un calendrier (PDF)</label>'
    +'<input type="file" id="stg-imp-file" accept="application/pdf,.pdf" '
    +'style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden" onchange="stgImportPdf(event)">'
    +'<button class="btn-sm" onclick="stgOuvrirSemaine()"><i class="ti ti-calendar-plus"></i> Ajouter une semaine</button>'
    +'<button class="btn-sm" onclick="stgAjouterJour()"><i class="ti ti-plus"></i> Ajouter un jour</button>'
    +'</div></div>';

  if(!jours.length){
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0;line-height:1.5">'
      +(s&&s.date_debut
        ? 'Aucun jour saisi. « Générer les jours ouvrés » remplit la période du lundi au vendredi — '
          +'vous retirez ensuite ce qui ne colle pas.'
        : 'Renseignez d\'abord les dates de début et de fin du stage, plus haut.')+'</p>';
  }else{
    h+='<div style="font-size:12px;color:var(--muted);margin-bottom:7px">'
      +presents+' jour'+(presents>1?'s':'')+' de présence'
      +(jours.length-presents?' · '+(jours.length-presents)+' absence'+((jours.length-presents)>1?'s':''):'')
      +' — cliquer sur un jour pour le modifier</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
      +jours.map(j=>{
        const d=new Date(String(j.jour)+'T12:00:00');
        const lib=STG_JOURS_FR[d.getDay()]+' '+d.getDate()+'/'+(d.getMonth()+1);
        const hr=j.absent?(j.motif||'absente'):[j.debut,j.fin].filter(Boolean).join('–');
        return '<button class="btn-sm" onclick="stgOuvrirJour(\''+j.jour+'\')" style="'
          +(j.absent?'border-color:var(--red);color:var(--red);background:var(--red-light)'
                    :'border-color:var(--koala);color:var(--koala-dark);background:var(--koala-light)')
          +'"><i class="ti ti-'+(j.absent?'user-off':'clock')+'"></i> '+escHtml(lib)
          +(hr?'<span style="opacity:.75;font-weight:400"> '+escHtml(hr)+'</span>':'')+'</button>';
      }).join('')
      +'</div>';
  }
  zone.innerHTML=h;
}

/* Les jours ouvrés de la période, sans écraser ce qui existe déjà : régénérer
   après avoir retiré un mercredi ne doit pas le faire revenir. */
async function stgGenererJours(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  if(!s.date_debut||!s.date_fin)
    return showBanner('Renseignez les dates de début et de fin, puis enregistrez.','error');

  const existants=new Set(stgJoursDe(stgFicheId).map(j=>String(j.jour)));
  const d=new Date(s.date_debut+'T12:00:00');
  const fin=new Date(s.date_fin+'T12:00:00');
  const aCreer=[];
  while(d<=fin){
    const jour=d.getDay();
    if(jour>=1&&jour<=5){
      const iso=ipDateToLocalISO(d);
      if(!existants.has(iso))aCreer.push({stagiaire_id:stgFicheId,jour:iso,debut:'08h00',fin:'16h00'});
    }
    d.setDate(d.getDate()+1);
    if(aCreer.length>200)break;   // garde-fou : une date de fin mal saisie
  }
  if(!aCreer.length)return showBanner('Tous les jours ouvrés de la période sont déjà saisis.');
  const {data,error}=await sb.from('stagiaires_jours').insert(aCreer).select();
  if(error)return showBanner('Génération impossible : '+error.message,'error');
  stgJoursCache=stgJoursCache.concat(data||[]);
  stgRenderJours();stgRender();stgRenderCal();
  showBanner(aCreer.length+' jour'+(aCreer.length>1?'s':'')+' ajouté'+(aCreer.length>1?'s':'')+' ✅');
}

/* ══ Import d'un calendrier de centre de formation ══════════════════════════
   Les écoles envoient toutes le même genre de document : douze colonnes de
   mois, une ligne par quantième, et une lettre qui dit où la personne se
   trouve ce jour-là (ici « E » chez l'employeur, « C » au centre). Le saisir à
   la main, c'est 150 clics et autant d'occasions de se tromper.

   Ce qui est lu : la position des textes dans le PDF, pas sa mise en page.
   Les colonnes ne sont pas devinées depuis l'en-tête (une lettre de code peut
   déborder sous le mois suivant) mais depuis la position des numéros de jour,
   qui est la seule vraiment régulière.

   Ce qui n'est PAS deviné : le sens des lettres. « C » veut dire cours ici,
   crèche ailleurs. L'écran de contrôle les liste avec leur nombre de jours et
   c'est vous qui tranchez, avant toute écriture.

   Un calendrier scanné (image) ne donne aucun texte : il n'est pas lisible,
   et le message le dit plutôt que d'importer zéro jour en silence. */

let stgImp=null;   // {nom, jours:{iso:code}, codes:{code:n}, roles:{code:role}}

const STG_IMP_MOIS={janv:0,jan:0,janvier:0,fevr:1,fev:1,fevrier:1,mars:2,avr:3,avril:3,
  mai:4,juin:5,juil:6,juillet:6,aout:7,sept:8,sep:8,septembre:8,oct:9,octobre:9,
  nov:10,novembre:10,dec:11,dece:11,decembre:11};
const STG_IMP_JOURS='DLMMJVS';    // getDay() → initiale française
const stgImpNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

/* Les lettres les plus courantes, pour proposer un choix par défaut. Il reste
   toujours modifiable : c'est une suggestion, pas une règle. */
function stgImpRoleDefaut(code){
  const c=stgImpNorm(code);
  if(['e','ent','emp','s','st','a','stage'].includes(c))return 'presence';
  if(['c','f','cf','ifts','cfa','ecole','cours'].includes(c))return 'formation';
  return 'ignore';
}

async function stgImportPdf(ev){
  const f=(ev.target.files||[])[0];
  ev.target.value='';
  if(!f)return;
  if(typeof pdfjsLib==='undefined')return showBanner('Bibliothèque PDF non chargée — rechargez la page.','error');
  showBanner('Lecture du calendrier…');
  try{
    const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
    let items=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const tc=await page.getTextContent();
      /* Le décalage par page évite que la ligne « 3 » de la page 2 se mélange
         à celle de la page 1 : les y repartent de zéro à chaque page. */
      items=items.concat(tc.items.filter(i=>(i.str||'').trim()).map(i=>({
        s:i.str.trim(), x:i.transform[4], y:i.transform[5]-(p-1)*100000
      })));
    }
    const r=stgImpParse(items);
    if(r.erreur)return showBanner(r.erreur,'error');
    stgImp={nom:f.name,jours:r.jours,codes:r.codes,roles:{},anomalies:r.anomalies,mois:r.mois};
    Object.keys(r.codes).forEach(c=>{stgImp.roles[c]=stgImpRoleDefaut(c);});
    stgImportRendu();
    document.getElementById('modal-stg-import-wrap').classList.add('open');
  }catch(e){
    console.error('[Stagiaires] import calendrier',e);
    showBanner('Ce PDF n\'a pas pu être lu'+(e&&e.message?' : '+e.message:'')+'.','error');
  }
}

function stgImpParse(items){
  const parY={};
  items.forEach(i=>{const k=Math.round(i.y);(parY[k]=parY[k]||[]).push(i);});

  /* 1. La ligne des mois — « sept-26 », « janv-27 », « Septembre 2026 ». */
  let entete=null;
  Object.keys(parY).forEach(k=>{
    const cols=parY[k].map(i=>{
      const m=stgImpNorm(i.s).match(/^([a-z]{3,9})\.?\s*[-\/ ]\s*(\d{2,4})$/);
      if(!m||!(m[1] in STG_IMP_MOIS))return null;
      return {mois:STG_IMP_MOIS[m[1]],an:+m[2]<100?2000+ +m[2]:+m[2],x:i.x};
    }).filter(Boolean);
    if(cols.length>=3&&(!entete||cols.length>entete.length))entete=cols.sort((a,b)=>a.x-b.x);
  });
  if(!entete)return {erreur:'Aucune ligne de mois n\'a été trouvée : ce PDF n\'a pas la forme d\'un calendrier annuel, ou il s\'agit d\'une image scannée.'};

  /* 2. Les colonnes réelles : là où se trouvent les quantièmes suivis d'une
        initiale de jour. Les totaux du bas n'ont pas d'initiale : ils sont
        écartés d'eux-mêmes. */
  const xs=[];
  Object.keys(parY).forEach(k=>{
    const l=parY[k].slice().sort((a,b)=>a.x-b.x);
    l.forEach((it,i)=>{
      if(!/^\d{1,2}$/.test(it.s)||+it.s<1||+it.s>31)return;
      const suiv=l[i+1];
      if(suiv&&suiv.x-it.x<30&&/^[lmjvsd]$/.test(stgImpNorm(suiv.s)))xs.push(it.x);
    });
  });
  if(xs.length<20)return {erreur:'Aucun jour n\'a pu être lu : ce calendrier est probablement une image scannée, qui ne contient pas de texte.'};
  xs.sort((a,b)=>a-b);
  const colX=[];
  xs.forEach(x=>{if(!colX.length||x-colX[colX.length-1]>14)colX.push(x);});

  /* 3. Chaque colonne reçoit son mois : dans l'ordre si les comptes tombent
        juste, au plus proche sinon. */
  const moisDe=colX.map((x,i)=>(colX.length===entete.length)?entete[i]
    :entete.reduce((best,c)=>Math.abs(c.x-x)<Math.abs(best.x-x)?c:best,entete[0]));

  /* 4. Les jours. La colonne va d'un numéro au numéro suivant : la lettre de
        code, alignée à droite, reste ainsi dans SA colonne. */
  const jours={},codes={};
  let anomalies=0;
  Object.keys(parY).forEach(k=>{
    const l=parY[k].slice().sort((a,b)=>a.x-b.x);
    colX.forEach((x0,ci)=>{
      const x1=ci+1<colX.length?colX[ci+1]:1e9;
      const dedans=l.filter(i=>i.x>=x0-6&&i.x<x1-6);
      const num=dedans.find(i=>/^\d{1,2}$/.test(i.s)&&+i.s>=1&&+i.s<=31);
      if(!num)return;
      const suite=dedans.filter(i=>i.x>num.x&&/^[A-Za-zÀ-ÿ]{1,4}$/.test(i.s));
      if(!suite.length)return;
      const c=moisDe[ci];
      const d=new Date(c.an,c.mois,+num.s,12);
      if(d.getMonth()!==c.mois)return;                       // 31 février
      /* L'initiale du jour DOIT correspondre à la date reconstituée : c'est le
         seul contrôle qui protège d'une colonne mal appariée. */
      if(STG_IMP_JOURS[d.getDay()]!==stgImpNorm(suite[0].s).toUpperCase()[0]){anomalies++;return;}
      const code=suite[1]?suite[1].s.trim().toUpperCase():'';
      if(!code)return;
      jours[ipDateToLocalISO(d)]=code;
      codes[code]=(codes[code]||0)+1;
    });
  });
  if(!Object.keys(jours).length)
    return {erreur:'Le calendrier a été lu, mais aucun jour ne porte de code (lettre) : il n\'y a rien à importer.'};
  return {jours,codes,anomalies,mois:moisDe};
}

const STG_IMP_ROLES={presence:'Présence à la crèche',formation:'Centre de formation (absence)',ignore:'Ne pas importer'};

function stgImportRendu(){
  if(!stgImp)return;
  const dates=Object.keys(stgImp.jours).sort();
  const res=document.getElementById('stg-imp-resume');
  if(res)res.innerHTML='<strong>'+escHtml(stgImp.nom)+'</strong><br>'
    +dates.length+' jours codés, du '+stgDateFr(dates[0])+' au '+stgDateFr(dates[dates.length-1])+'.'
    +(stgImp.anomalies?'<br><span style="color:var(--orange-dark)">'+stgImp.anomalies
      +' ligne(s) ignorée(s) : le jour de la semaine ne correspondait pas à la date.</span>':'')
    +'<br>Dites ce que signifie chaque code — rien n\'est enregistré avant « Importer ».';

  const box=document.getElementById('stg-imp-codes');
  if(box){
    box.innerHTML=Object.keys(stgImp.codes).sort((a,b)=>stgImp.codes[b]-stgImp.codes[a]).map(c=>
      '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--border);border-radius:9px;padding:8px 11px">'
      +'<span style="font-weight:700;font-size:14px;background:var(--koala-light);color:var(--koala-dark);border-radius:7px;padding:3px 10px;min-width:38px;text-align:center">'+escHtml(c)+'</span>'
      +'<span style="font-size:12.5px;color:var(--muted);flex:1">'+stgImp.codes[c]+' jour'+(stgImp.codes[c]>1?'s':'')+'</span>'
      +'<select class="finput" style="width:auto;font-size:12.5px;padding:5px 8px" onchange="stgImportRole(\''+escHtml(c)+'\',this.value)">'
      +Object.keys(STG_IMP_ROLES).map(r=>'<option value="'+r+'"'+(stgImp.roles[c]===r?' selected':'')+'>'+STG_IMP_ROLES[r]+'</option>').join('')
      +'</select></div>').join('');
  }
  stgImportApercu();
}

function stgImportRole(code,val){
  if(!stgImp)return;
  stgImp.roles[code]=val;
  stgImportApercu();
}

/* Les lignes qui seront réellement écrites. Un jour déjà saisi n'est jamais
   modifié : l'import complète, il n'écrase pas ce que la référente a corrigé
   à la main. */
function stgImportLignes(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId))||{};
  const dansPeriode=(document.getElementById('stg-imp-periode')||{}).checked;
  const debut=((document.getElementById('stg-imp-debut')||{}).value||'08h00').trim();
  const fin=((document.getElementById('stg-imp-fin')||{}).value||'16h00').trim();
  const existants=new Set(stgJoursDe(stgFicheId).map(j=>String(j.jour)));
  const rows=[];let deja=0,horsPeriode=0;
  Object.keys(stgImp.jours).sort().forEach(iso=>{
    const role=stgImp.roles[stgImp.jours[iso]];
    if(!role||role==='ignore')return;
    if(dansPeriode&&((s.date_debut&&iso<s.date_debut)||(s.date_fin&&iso>s.date_fin))){horsPeriode++;return;}
    if(existants.has(iso)){deja++;return;}
    /* Toutes les lignes portent EXACTEMENT les mêmes colonnes : PostgREST
       refuse un envoi groupé dont les objets n'ont pas les mêmes clés
       (« All object keys must match »), et un import mêlant présences et jours
       de formation partirait alors entièrement en erreur. */
    rows.push(role==='presence'
      ? {stagiaire_id:stgFicheId,jour:iso,debut:debut,fin:fin,absent:false,motif:null}
      : {stagiaire_id:stgFicheId,jour:iso,debut:null,fin:null,absent:true,motif:'Centre de formation'});
  });
  return {rows,deja,horsPeriode,
    presences:rows.filter(r=>!r.absent).length,
    formations:rows.filter(r=>r.absent).length};
}

function stgImportApercu(){
  if(!stgImp)return;
  const z=document.getElementById('stg-imp-apercu');
  if(!z)return;
  const r=stgImportLignes();
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId))||{};
  z.innerHTML=r.rows.length
    ? '<strong>'+r.rows.length+' jour'+(r.rows.length>1?'s':'')+' à ajouter</strong> : '
      +r.presences+' de présence'+(r.formations?', '+r.formations+' en centre de formation (comptés comme absences)':'')+'.'
      +(r.deja?'<br>'+r.deja+' jour(s) déjà saisi(s) — laissés tels quels.':'')
      +(r.horsPeriode?'<br>'+r.horsPeriode+' jour(s) hors des dates de la fiche — non repris.':'')
    : 'Rien à importer avec ces réglages.'
      +(r.horsPeriode?' '+r.horsPeriode+' jour(s) sont hors des dates de la fiche ('
        +stgDateFr(s.date_debut)+' → '+stgDateFr(s.date_fin)+') : décochez la limite ci-dessus, ou corrigez les dates.':'')
      +(r.deja?' '+r.deja+' jour(s) sont déjà saisis.':'');
}

async function stgImportValider(){
  if(!stgImp)return showBanner('Aucun calendrier chargé — reprenez depuis « Importer un calendrier ».','error');
  if(!stgFicheId)return showBanner('Enregistrez d\'abord la fiche.','error');
  const {rows}=stgImportLignes();
  if(!rows.length)return showBanner('Aucun jour à importer avec ces réglages.','error');
  if(rows.length>400&&!confirm(rows.length+' jours vont être ajoutés. Continuer ?'))return;

  const btn=document.getElementById('stg-imp-ok');
  if(btn)btn.disabled=true;
  let ajoutes=[];
  /* Par paquets : une seule requête de 300 lignes passe mal sur une connexion
     de crèche, et une erreur au milieu ne dirait pas où. */
  for(let i=0;i<rows.length;i+=100){
    const {data,error}=await sb.from('stagiaires_jours').insert(rows.slice(i,i+100)).select();
    if(error){
      if(btn)btn.disabled=false;
      stgJoursCache=stgJoursCache.concat(ajoutes);
      stgRenderJours();stgRenderCal();
      return showBanner('Import interrompu après '+ajoutes.length+' jour(s) : '+error.message,'error');
    }
    ajoutes=ajoutes.concat(data||[]);
  }
  stgJoursCache=stgJoursCache.concat(ajoutes);

  /* Les dates de la fiche, si on l'a demandé : elles servent au calendrier
     mensuel et à la carte de la liste. */
  if((document.getElementById('stg-imp-dates')||{}).checked){
    const isos=Object.keys(stgImp.jours).filter(iso=>{
      const r=stgImp.roles[stgImp.jours[iso]];
      return r&&r!=='ignore';
    }).sort();
    if(isos.length){
      const maj={date_debut:isos[0],date_fin:isos[isos.length-1]};
      if(await dbUpdate('stagiaires',stgFicheId,maj)){
        const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
        if(s)Object.assign(s,maj);
        const e1=document.getElementById('stg-f-debut'),e2=document.getElementById('stg-f-fin');
        if(e1)e1.value=maj.date_debut;
        if(e2)e2.value=maj.date_fin;
      }
    }
  }

  if(btn)btn.disabled=false;
  closeModal('modal-stg-import-wrap');
  stgImp=null;
  stgRenderJours();stgRender();stgRenderCal();
  showBanner(ajoutes.length+' jour'+(ajoutes.length>1?'s':'')+' importé'+(ajoutes.length>1?'s':'')+' ✅');
}

/* ══ Ajouter une semaine ═══════════════════════════════════════════════════
   Saisir quinze jours un par un, c'est quinze fenêtres. La semaine type couvre
   l'essentiel des stages ; le jour par jour garde sa place pour ce qui sort de
   la règle (un mercredi retiré, un horaire différent).

   Les jours déjà saisis ne sont jamais touchés : ajouter une semaine par-dessus
   une autre ne défait pas un horaire corrigé à la main. */

const STG_SEM_JOURS=[{n:1,lib:'Lundi'},{n:2,lib:'Mardi'},{n:3,lib:'Mercredi'},
  {n:4,lib:'Jeudi'},{n:5,lib:'Vendredi'},{n:6,lib:'Samedi'},{n:0,lib:'Dimanche'}];
let stgSemChoix={1:true,2:true,3:true,4:true,5:true,6:false,0:false};

function stgOuvrirSemaine(){
  if(!stgFicheId)return showBanner('Enregistrez d\'abord la fiche.','error');
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  /* Par défaut : la semaine du début du stage si elle est connue, sinon celle
     en cours. On se cale toujours sur le lundi. */
  const dep=new Date(((s&&s.date_debut)||todayStr())+'T12:00:00');
  const el=document.getElementById('stg-sem-date');
  if(el)el.value=ipDateToLocalISO(stgLundiDe(dep));
  stgSemaineBoutons();
  stgSemaineApercu();
  document.getElementById('modal-stg-semaine-wrap').classList.add('open');
}

function stgLundiDe(d){
  const x=new Date(d.getTime());
  const dec=(x.getDay()+6)%7;          // lundi = 0
  x.setDate(x.getDate()-dec);
  return x;
}

function stgSemaineBoutons(){
  const box=document.getElementById('stg-sem-jours');
  if(!box)return;
  box.innerHTML=STG_SEM_JOURS.map(j=>{
    const on=!!stgSemChoix[j.n];
    return '<button type="button" class="btn-sm" onclick="stgSemaineBascule('+j.n+')" style="'
      +(on?'border-color:var(--koala);color:#fff;background:var(--koala)'
          :'border-color:var(--border);color:var(--muted);background:#fff')+'">'
      +escHtml(j.lib)+'</button>';
  }).join('');
}

function stgSemaineBascule(n){
  stgSemChoix[n]=!stgSemChoix[n];
  stgSemaineBoutons();
  stgSemaineApercu();
}

/* Les lignes à écrire. Mêmes colonnes partout — un envoi groupé dont les objets
   n'ont pas les mêmes clés est refusé en bloc par PostgREST. */
function stgSemaineLignes(){
  const iso=((document.getElementById('stg-sem-date')||{}).value||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return {rows:[],deja:0,iso:''};
  const debut=((document.getElementById('stg-sem-debut')||{}).value||'08h00').trim();
  const fin=((document.getElementById('stg-sem-fin')||{}).value||'16h00').trim();
  const semaines=+((document.getElementById('stg-sem-repeter')||{}).value||1);
  const lundi=stgLundiDe(new Date(iso+'T12:00:00'));
  const existants=new Set(stgJoursDe(stgFicheId).map(j=>String(j.jour)));
  const rows=[];let deja=0;
  for(let w=0;w<semaines;w++){
    for(let d=0;d<7;d++){
      const jour=new Date(lundi.getTime());
      jour.setDate(jour.getDate()+w*7+d);
      if(!stgSemChoix[jour.getDay()])continue;
      const j=ipDateToLocalISO(jour);
      if(existants.has(j)){deja++;continue;}
      rows.push({stagiaire_id:stgFicheId,jour:j,debut:debut,fin:fin,absent:false,motif:null});
    }
  }
  return {rows,deja,iso:ipDateToLocalISO(lundi),semaines};
}

function stgSemaineApercu(){
  const z=document.getElementById('stg-sem-apercu');
  if(!z)return;
  const r=stgSemaineLignes();
  if(!r.iso){z.innerHTML='Choisissez la semaine.';return;}
  const fin=new Date(r.iso+'T12:00:00');
  fin.setDate(fin.getDate()+r.semaines*7-1);
  z.innerHTML='Du <strong>'+stgDateFr(r.iso)+'</strong> au <strong>'+stgDateFr(ipDateToLocalISO(fin))+'</strong> — '
    +(r.rows.length?'<strong>'+r.rows.length+' jour'+(r.rows.length>1?'s':'')+'</strong> à ajouter.'
                   :'aucun jour à ajouter avec ces réglages.')
    +(r.deja?'<br>'+r.deja+' jour(s) déjà saisi(s) — laissés tels quels.':'')
    +'<br><span style="opacity:.8">La semaine est calée sur le lundi, quelle que soit la date choisie.</span>';
}

async function stgSemaineAjouter(){
  if(!stgFicheId)return;
  const {rows}=stgSemaineLignes();
  if(!rows.length)return showBanner('Aucun jour à ajouter : tous sont déjà saisis, ou aucun jour n\'est retenu.','error');
  const btn=document.getElementById('stg-sem-ok');
  if(btn)btn.disabled=true;
  const {data,error}=await sb.from('stagiaires_jours').insert(rows).select();
  if(btn)btn.disabled=false;
  if(error)return showBanner('Ajout impossible : '+error.message,'error');
  stgJoursCache=stgJoursCache.concat(data||[]);
  closeModal('modal-stg-semaine-wrap');
  stgRenderJours();stgRender();stgRenderCal();
  showBanner(rows.length+' jour'+(rows.length>1?'s':'')+' ajouté'+(rows.length>1?'s':'')+' ✅');
}

function stgAjouterJour(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const def=(s&&s.date_debut)||todayStr();
  const iso=prompt('Date du jour à ajouter (AAAA-MM-JJ) :',def);
  if(!iso)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return showBanner('Date attendue au format AAAA-MM-JJ.','error');
  if(stgJoursDe(stgFicheId).some(j=>String(j.jour)===iso))return stgOuvrirJour(iso);
  stgJourCourant={stagiaire_id:stgFicheId,jour:iso,nouveau:true};
  stgOuvrirModalJour(null,iso);
}

function stgOuvrirJour(iso){
  const j=stgJoursDe(stgFicheId).find(x=>String(x.jour)===String(iso));
  stgJourCourant={stagiaire_id:stgFicheId,jour:iso,nouveau:!j};
  stgOuvrirModalJour(j,iso);
}

function stgOuvrirModalJour(j,iso){
  const d=new Date(String(iso)+'T12:00:00');
  document.getElementById('stg-j-title').textContent=
    d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('stg-j-debut').value=(j&&j.debut)||'08h00';
  document.getElementById('stg-j-fin').value=(j&&j.fin)||'16h00';
  document.getElementById('stg-j-absent').checked=!!(j&&j.absent);
  document.getElementById('stg-j-motif').value=(j&&j.motif)||'';
  document.getElementById('stg-j-note').value=(j&&j.note)||'';
  stgJourAbsentChange();
  document.getElementById('modal-stg-jour-wrap').classList.add('open');
}

function stgJourAbsentChange(){
  const abs=document.getElementById('stg-j-absent').checked;
  const w=document.getElementById('stg-j-motif-wrap');
  if(w)w.style.display=abs?'':'none';
}

async function stgJourEnregistrer(){
  if(!stgJourCourant)return;
  const row={
    stagiaire_id:stgJourCourant.stagiaire_id,
    jour:stgJourCourant.jour,
    debut:document.getElementById('stg-j-debut').value.trim()||null,
    fin:document.getElementById('stg-j-fin').value.trim()||null,
    absent:document.getElementById('stg-j-absent').checked,
    motif:document.getElementById('stg-j-motif').value.trim()||null,
    note:document.getElementById('stg-j-note').value.trim()||null
  };
  /* upsert sur (stagiaire_id, jour) : la contrainte d'unicité de 23a fait que
     rouvrir un jour existant le met à jour au lieu d'en créer un second. */
  const {data,error}=await sb.from('stagiaires_jours')
    .upsert(row,{onConflict:'stagiaire_id,jour'}).select();
  if(error)return showBanner('Enregistrement impossible : '+error.message,'error');
  stgJoursCache=stgJoursCache.filter(j=>!(String(j.stagiaire_id)===String(row.stagiaire_id)&&String(j.jour)===String(row.jour)))
    .concat(data||[]);
  closeModal('modal-stg-jour-wrap');
  stgRenderJours();stgRenderCal();stgRender();
  showBanner('Jour enregistré ✅');
}

async function stgJourSupprimer(){
  if(!stgJourCourant)return;
  const j=stgJoursCache.find(x=>String(x.stagiaire_id)===String(stgJourCourant.stagiaire_id)
                              &&String(x.jour)===String(stgJourCourant.jour));
  if(!j){closeModal('modal-stg-jour-wrap');return;}
  if(!confirm('Retirer ce jour du calendrier ?\n\nPour garder la trace d\'une journée manquée, '
    +'préférez la marquer « absente ».'))return;
  const ok=await dbDelete('stagiaires_jours',j.id);
  if(!ok)return showBanner('Suppression impossible.','error');
  stgJoursCache=stgJoursCache.filter(x=>String(x.id)!==String(j.id));
  closeModal('modal-stg-jour-wrap');
  stgRenderJours();stgRenderCal();stgRender();
  showBanner('Jour retiré.');
}

// ── Vue 2 : le calendrier ─────────────────────────────────────────────────

function stgCalMois(delta){
  if(!stgCalRef){const n=new Date();stgCalRef=new Date(n.getFullYear(),n.getMonth(),1);}
  if(delta===0){const n=new Date();stgCalRef=new Date(n.getFullYear(),n.getMonth(),1);}
  else stgCalRef=new Date(stgCalRef.getFullYear(),stgCalRef.getMonth()+delta,1);
  stgRenderCal();
}

function stgRenderCal(){
  const box=document.getElementById('stg-cal');
  if(!box)return;
  if(!stgCalRef){const n=new Date();stgCalRef=new Date(n.getFullYear(),n.getMonth(),1);}

  const an=stgCalRef.getFullYear(),mois=stgCalRef.getMonth();
  const nb=new Date(an,mois+1,0).getDate();
  const titre=document.getElementById('stg-cal-titre');
  if(titre)titre.textContent=stgCalRef.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});

  const premier=ipDateToLocalISO(new Date(an,mois,1));
  const dernier=ipDateToLocalISO(new Date(an,mois,nb));
  const creche=(document.getElementById('stg-f-creche-cal')||{}).value||'';

  /* On affiche une stagiaire si son stage touche le mois, OU si elle a un jour
     saisi dedans — une journée isolée hors période reste visible. */
  const lignes=stgCache.filter(s=>{
    if(creche&&String(s.creche_id||'')!==String(creche))return false;
    if(s.statut==='refuse'||s.statut==='annule')return false;
    const chevauche=s.date_debut&&s.date_fin&&s.date_debut<=dernier&&s.date_fin>=premier;
    const aDesJours=stgJoursDe(s.id).some(j=>String(j.jour)>=premier&&String(j.jour)<=dernier);
    return chevauche||aDesJours;
  }).sort((a,b)=>String(stgCrecheName(a.creche_id)+stgNomComplet(a))
    .localeCompare(String(stgCrecheName(b.creche_id)+stgNomComplet(b)),'fr'));

  if(!lignes.length){
    /* Un écran vide ne dit pas POURQUOI il est vide : filtre de crèche, fiche
       pas encore orientée, ou jours saisis sur d'autres mois. Chacune de ces
       trois raisons se répare différemment, alors on les nomme. */
    const vivantes=stgCache.filter(s=>s.statut!=='refuse'&&s.statut!=='annule');
    const pistes=[];
    if(creche){
      const ailleurs=vivantes.filter(s=>s.creche_id&&String(s.creche_id)!==String(creche)).length;
      const orphelines=vivantes.filter(s=>!s.creche_id).length;
      if(ailleurs)pistes.push(ailleurs+' fiche'+(ailleurs>1?'s':'')+' sur une autre crèche — choisissez « Toutes les crèches ».');
      if(orphelines)pistes.push(orphelines+' fiche'+(orphelines>1?'s':'')+' pas encore orientée'+(orphelines>1?'s':'')
        +' vers une crèche : tant qu\'aucune crèche n\'est choisie sur la fiche, un filtre par crèche l\'écarte.');
    }
    const muettes=vivantes.filter(s=>!stgJoursDe(s.id).length&&!(s.date_debut&&s.date_fin)).length;
    if(muettes)pistes.push(muettes+' fiche'+(muettes>1?'s':'')+' sans dates ni jours saisis : une fiche n\'apparaît ici '
      +'qu\'avec des dates de début et de fin, ou des jours de présence.');
    /* Les mois où il se passe quelque chose : le plus utile est souvent
       simplement d'aller voir ailleurs. */
    const tousJours=vivantes.flatMap(s=>stgJoursDe(s.id).map(j=>String(j.jour))).sort();
    if(tousJours.length&&(tousJours[tousJours.length-1]<premier||tousJours[0]>dernier))
      pistes.push('Les jours saisis vont du '+stgDateFr(tousJours[0])+' au '+stgDateFr(tousJours[tousJours.length-1])
        +' : utilisez les flèches pour changer de mois.');
    box.innerHTML='<div style="text-align:center;padding:34px 20px;color:var(--muted);font-size:13px;line-height:1.6">'
      +'Aucun stage ni alternance sur ce mois.'
      +(pistes.length?'<div style="margin-top:10px;font-size:12.5px;color:var(--orange-dark);max-width:620px;margin-left:auto;margin-right:auto">'
        +pistes.map(p=>'<div style="margin-top:5px">'+p+'</div>').join('')+'</div>':'')
      +'</div>';
    return;
  }

  const auj=todayStr();
  let h='<table style="border-collapse:collapse;font-size:11.5px;min-width:'+(200+nb*26)+'px">'
    +'<tr><th style="position:sticky;left:0;background:var(--koala-light);z-index:2;text-align:left;'
    +'padding:6px 9px;border:1px solid var(--border);min-width:190px">Stagiaire / alternant</th>';
  for(let d=1;d<=nb;d++){
    const dt=new Date(an,mois,d);
    const we=dt.getDay()===0||dt.getDay()===6;
    const iso=ipDateToLocalISO(dt);
    h+='<th style="width:26px;padding:4px 0;border:1px solid var(--border);font-weight:600;'
      +'background:'+(iso===auj?'var(--orange-light)':we?'#F4F4F6':'var(--koala-light)')+';'
      +'color:'+(we?'var(--muted)':'var(--koala-dark)')+'">'
      +'<div style="font-size:9.5px;opacity:.8">'+STG_JOURS_FR[dt.getDay()].slice(0,1).toUpperCase()+'</div>'
      +d+'</th>';
  }
  h+='</tr>';

  lignes.forEach(s=>{
    const prof=stgProfil(s);
    const jours={};
    stgJoursDe(s.id).forEach(j=>{jours[String(j.jour)]=j;});
    h+='<tr>'
      +'<td onclick="stgOpenFiche(\''+s.id+'\')" style="position:sticky;left:0;background:#fff;z-index:1;'
      +'cursor:pointer;padding:5px 9px;border:1px solid var(--border);white-space:nowrap;'
      +'overflow:hidden;text-overflow:ellipsis;max-width:230px">'
      +'<i class="ti '+prof.ic+'" style="color:'+prof.couleur+'" title="'+prof.lib+'"></i> '
      +'<span style="font-weight:600">'+escHtml(stgNomComplet(s))+'</span>'
      +'<span style="color:var(--muted)"> · '+escHtml(stgCrecheName(s.creche_id)||'—')+'</span></td>';
    for(let d=1;d<=nb;d++){
      const iso=ipDateToLocalISO(new Date(an,mois,d));
      const j=jours[iso];
      const dansPeriode=s.date_debut&&s.date_fin&&iso>=s.date_debut&&iso<=s.date_fin;
      let fond='#fff',txt='',titre2='';
      if(j&&j.absent){fond='var(--red-light)';txt='<span style="color:var(--red);font-weight:700">×</span>';
        titre2=(j.motif||'absente');}
      else if(j){fond=prof.couleur;titre2=[j.debut,j.fin].filter(Boolean).join(' – ');}
      else if(dansPeriode){fond='var(--koala-light)';titre2='période prévue, jour non saisi';}
      h+='<td onclick="stgCalClic(\''+s.id+'\',\''+iso+'\')" title="'+escHtml(titre2)+'" '
        +'style="cursor:pointer;border:1px solid var(--border);background:'+fond+';height:26px;text-align:center">'
        +txt+'</td>';
    }
    h+='</tr>';
  });
  h+='</table>';
  box.innerHTML=h;
}

/* Cliquer une case du calendrier ouvre le jour dans la fiche : c'est le même
   écran que depuis la fiche, donc une seule façon de saisir un horaire. */
function stgCalClic(id,iso){
  stgFicheId=id;
  stgJourCourant={stagiaire_id:id,jour:iso};
  const j=stgJoursDe(id).find(x=>String(x.jour)===String(iso));
  stgJourCourant.nouveau=!j;
  stgOuvrirModalJour(j,iso);
}

// ── Vue 3 : les pièces demandées ──────────────────────────────────────────

function stgRenderTypes(){
  const box=document.getElementById('stg-types-list');
  if(!box)return;
  if(!stgTypes.length){
    box.innerHTML='<div style="color:var(--muted);font-size:13px">Aucune pièce définie.</div>';
    return;
  }
  const POUR={tous:{lib:'Stagiaires et alternants',c:'var(--muted)'},
              stagiaire:{lib:'Stagiaires',c:'var(--koala)'},
              alternant:{lib:'Alternants',c:'var(--orange-dark)'}};
  box.innerHTML=stgTypes.map(t=>{
   const pr=POUR[t.pour_type]||POUR.tous;
   return '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--border);'
    +'border-radius:9px;padding:9px 12px;'+(t.actif?'':'opacity:.55')+'">'
    +'<i class="ti ti-'+(t.obligatoire?'asterisk':'circle-dashed')+'" style="color:'+(t.obligatoire?'var(--koala)':'var(--muted)')+'"></i>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-weight:600;font-size:13px">'+escHtml(t.libelle)
    +' <span style="background:'+pr.c+';color:#fff;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700;white-space:nowrap">'+pr.lib+'</span>'
    +(t.obligatoire?'':'<span style="color:var(--muted);font-weight:400"> — facultatif</span>')
    +(t.actif?'':'<span style="color:var(--red);font-weight:400"> — désactivée</span>')+'</div>'
    +(t.aide?'<div style="font-size:11.5px;color:var(--muted)">'+escHtml(t.aide)+'</div>':'')
    +(t.lien?'<a href="'+escHtml(t.lien)+'" target="_blank" rel="noopener" style="font-size:11.5px">'
      +'<i class="ti ti-external-link"></i> '+escHtml(t.lien)+'</a>':'')
    +'</div>'
    +'<button class="ibtn" title="Monter" onclick="stgDeplacerType(\''+t.id+'\',-1)"><i class="ti ti-chevron-up"></i></button>'
    +'<button class="ibtn" title="Descendre" onclick="stgDeplacerType(\''+t.id+'\',1)"><i class="ti ti-chevron-down"></i></button>'
    +'<button class="ibtn" title="Obligatoire / facultatif" onclick="stgBasculerType(\''+t.id+'\',\'obligatoire\')"><i class="ti ti-asterisk"></i></button>'
    +'<button class="ibtn" title="Demandée à : tous, stagiaires, alternants" onclick="stgCyclerPour(\''+t.id+'\')"><i class="ti ti-users-group"></i></button>'
    +'<button class="ibtn" title="'+(t.actif?'Désactiver':'Réactiver')+'" onclick="stgBasculerType(\''+t.id+'\',\'actif\')">'
    +'<i class="ti ti-'+(t.actif?'eye-off':'eye')+'"></i></button>'
    +'</div>';}).join('');
}

/* Trois valeurs seulement : le bouton tourne plutôt que d'ouvrir un menu pour
   un choix à trois branches. */
async function stgCyclerPour(id){
  const t=stgTypes.find(x=>String(x.id)===String(id));
  if(!t)return;
  const suite={tous:'stagiaire',stagiaire:'alternant',alternant:'tous'};
  const val=suite[t.pour_type||'tous']||'stagiaire';
  const ok=await dbUpdate('stagiaires_docs_types',id,{pour_type:val});
  if(!ok)return showBanner('Modification impossible'
    +(window._lastDbError?' : '+window._lastDbError:' (réservée à la direction, ou script 31 non exécuté)')+'.','error');
  t.pour_type=val;
  stgRenderTypes();stgRender();
}

async function stgAjouterType(){
  const lib=(document.getElementById('stg-t-libelle')||{}).value.trim();
  if(!lib)return showBanner('Indiquez le nom de la pièce.','error');
  const base={
    libelle:lib,
    aide:(document.getElementById('stg-t-aide')||{}).value.trim()||null,
    lien:(document.getElementById('stg-t-lien')||{}).value.trim()||null,
    obligatoire:(document.getElementById('stg-t-oblig')||{}).checked,
    pour_type:(document.getElementById('stg-t-pour')||{}).value||'tous',
    ordre:stgTypes.reduce((m,t)=>Math.max(m,t.ordre||0),0)+10,
    actif:true
  };
  let saved=await dbInsert('stagiaires_docs_types',base);
  /* Colonne absente = script 31 non exécuté : on ajoute quand même la pièce,
     elle vaudra pour tout le monde. */
  if(!saved&&/pour_type/i.test(window._lastDbError||'')){
    delete base.pour_type;
    saved=await dbInsert('stagiaires_docs_types',base);
    if(saved)showBanner('Pièce ajoutée, mais demandée à tout le monde : le script 31 n\'a pas encore été exécuté sur Supabase.','error');
  }
  if(!saved)return showBanner('Ajout impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  ['stg-t-libelle','stg-t-aide','stg-t-lien'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  stgTypes.push(saved);
  stgTypes.sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  stgRenderTypes();stgRender();
  showBanner('Pièce ajoutée ✅');
}

async function stgBasculerType(id,champ){
  const t=stgTypes.find(x=>String(x.id)===String(id));
  if(!t)return;
  const ok=await dbUpdate('stagiaires_docs_types',id,{[champ]:!t[champ]});
  if(!ok)return showBanner('Modification impossible (réservée à la direction).','error');
  t[champ]=!t[champ];
  stgRenderTypes();stgRender();
}

/* L'ordre est celui de la liste que voit la stagiaire : on échange les valeurs
   de `ordre` avec la voisine plutôt que de renuméroter toute la table. */
async function stgDeplacerType(id,sens){
  const i=stgTypes.findIndex(x=>String(x.id)===String(id));
  const j=i+sens;
  if(i<0||j<0||j>=stgTypes.length)return;
  const a=stgTypes[i],b=stgTypes[j];
  const oa=a.ordre||0,ob=b.ordre||0;
  const ok1=await dbUpdate('stagiaires_docs_types',a.id,{ordre:ob});
  const ok2=await dbUpdate('stagiaires_docs_types',b.id,{ordre:oa});
  if(!ok1||!ok2)return showBanner('Déplacement impossible (réservé à la direction).','error');
  a.ordre=ob;b.ordre=oa;
  stgTypes.sort((x,y)=>(x.ordre||0)-(y.ordre||0));
  stgRenderTypes();
}


// ── Vue 4 : les documents à transmettre (direction) ───────────────────────

/* Le pendant exact des pièces demandées, dans l'autre sens. Deux natures
   seulement :
     'fichier' — déposé dans le bucket PRIVÉ, sous le préfixe `_ressources/`.
                 La personne n'en reçoit jamais l'emplacement : la page lui
                 demande une URL signée de 5 minutes au moment du clic. Un PDF
                 envoyé en pièce jointe d'un mail, lui, circule ensuite sans
                 nous et reste à jamais la version de ce jour-là.
     'lien'    — une adresse externe (questionnaire), publique par nature.

   Un préfixe qui commence par un souligné ne peut pas entrer en collision avec
   un dossier de stagiaire, dont le nom est toujours un uuid. */

const STG_RESS_PREFIXE = '_ressources/';

const stgRessNature = r => (r&&r.nature==='lien')?'lien':'fichier';

/* Qui peut modifier quoi (script 36c) : la direction, tout ; une référente,
   uniquement ce qui est rattaché à sa crèche. Une ressource « toutes les
   crèches » engage le réseau et lui reste fermée. Le même calcul est refait en
   base — ici, c'est pour ne pas proposer un bouton qui échouera. */
function stgRessModifiable(r){
  if(isDirection)return true;
  if(!r||!r.creche_id)return false;
  const mien=currentProfile&&currentProfile.creche_id;
  return String(r.creche_id)===String(mien||'');
}

/* Les ressources destinées à CETTE fiche : actives, prévues pour son profil,
   et valables soit pour tout le réseau, soit pour sa crèche. Le même filtre
   est refait côté edge function — ici c'est de l'affichage, là-bas c'est la
   règle. */
function stgRessPour(s,typeForce){
  const type=typeForce||stgType(s);
  return stgRess.filter(r=>r.actif
    && (!r.pour_type||r.pour_type==='tous'||r.pour_type===type)
    && (!r.creche_id||String(r.creche_id)===String(s.creche_id||'')));
}

function stgRessVue(stagiaireId,ressourceId){
  return stgRessVues.find(v=>String(v.stagiaire_id)===String(stagiaireId)
                          && String(v.ressource_id)===String(ressourceId));
}

/* ── Dans la fiche : qui a lu quoi ──────────────────────────────────────── */

function stgRenderRessFiche(typeForce){
  const zone=document.getElementById('stg-ressources-zone');
  if(!zone||!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s){zone.innerHTML='';return;}
  const liste=stgRessPour(s,typeForce);

  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-send" style="color:var(--orange-dark)"></i> '
    +'Ce qu\'elle reçoit sur son lien</div>';
  const aConfirmer=liste.filter(r=>r.accuse);
  const confirmes=aConfirmer.filter(r=>{const v=stgRessVue(s.id,r.id);return v&&v.accuse_le;}).length;
  if(aConfirmer.length){
    h+='<span style="font-size:12px;font-weight:600;color:'
      +(confirmes===aConfirmer.length?'var(--green)':'var(--muted)')+'">'
      +confirmes+' / '+aConfirmer.length+' confirmé'+(aConfirmer.length>1?'s':'')+'</span>';
  }
  h+='</div>';

  if(!stgRessOk){
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0">Le script <code>36a</code> n\'a pas '
      +'encore été exécuté sur Supabase : rien n\'est transmis pour le moment.</p>';
    zone.innerHTML=h;return;
  }
  if(!liste.length){
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0">Rien à transmettre pour ce profil '
      +'— le projet pédagogique et le questionnaire se règlent dans l\'onglet '
      +'« Documents à transmettre ».</p>';
    zone.innerHTML=h;return;
  }

  h+=liste.map(r=>{
    const v=stgRessVue(s.id,r.id);
    const lien=stgRessNature(r)==='lien';
    const fait=r.accuse?!!(v&&v.accuse_le):!!(v&&v.ouvert_le);
    let etat;
    if(v&&v.accuse_le)      etat='<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">Confirmé le '+escHtml(stgDateFr(v.accuse_le))+'</span>';
    else if(v&&v.ouvert_le) etat='<span style="background:var(--orange-light);color:var(--orange-dark);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">'+(lien?'Ouvert':'Consulté')+' le '+escHtml(stgDateFr(v.ouvert_le))+'</span>';
    else                    etat='<span style="background:#EFEEF6;color:var(--muted);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">Pas encore ouvert</span>';
    return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:9px;'
      +'padding:9px 11px;margin-bottom:7px;flex-wrap:wrap;background:'+(fait?'#FCFEFC':'#fff')+'">'
      +'<i class="ti ti-'+(lien?'clipboard-list':'file-text')+'" style="color:'+(fait?'var(--green)':'var(--muted)')+'"></i>'
      +'<span style="font-weight:600;font-size:12.5px;flex:1;min-width:120px">'+escHtml(r.libelle)
      +(r.accuse?'':'<span style="color:var(--muted);font-weight:400"> (sans confirmation)</span>')+'</span>'
      +etat
      +'<button class="ibtn" style="width:26px;height:26px;font-size:13px" title="Ouvrir" '
      +'onclick="stgOuvrirRess(\''+r.id+'\')"><i class="ti ti-external-link"></i></button>'
      +'</div>';
  }).join('');

  h+='<p style="font-size:11.5px;color:var(--muted);margin:2px 0 0">Ces documents s\'affichent en haut '
    +'de son lien de dépôt. La confirmation est déclarative : elle dit que la personne a coché la case, '
    +'pas qu\'elle a tout lu.</p>';
  zone.innerHTML=h;
}

/* ── L'écran de réglage ─────────────────────────────────────────────────── */

function stgRessNatureChange(){
  const lien=(document.getElementById('stg-r-nature')||{}).value==='lien';
  const f=document.getElementById('stg-r-fichier-wrap');
  const u=document.getElementById('stg-r-url-wrap');
  if(f)f.style.display=lien?'none':'';
  if(u)u.style.display=lien?'':'none';
  /* Un document n'a pas d'adresse : rien à lui transmettre. */
  const id=document.getElementById('stg-r-identite');
  if(id){id.disabled=!lien;if(!lien)id.checked=false;
         if(id.parentElement)id.parentElement.style.opacity=lien?'':'.5';}
}

function stgRenderRess(){
  const box=document.getElementById('stg-ress-list');
  if(!box)return;
  if(!stgRessOk){
    box.innerHTML='<div style="color:var(--red);font-size:13px">Les scripts <code>36a</code> et '
      +'<code>36b</code> n\'ont pas encore été exécutés sur Supabase.</div>';
    return;
  }
  if(!stgRess.length){
    box.innerHTML='<div style="color:var(--muted);font-size:13px">Rien à transmettre pour le moment.</div>';
    return;
  }
  const POUR={tous:{lib:'Stagiaires et alternants',c:'var(--muted)'},
              stagiaire:{lib:'Stagiaires',c:'var(--koala)'},
              alternant:{lib:'Alternants',c:'var(--orange-dark)'}};
  box.innerHTML=stgRess.map(r=>{
    const pr=POUR[r.pour_type]||POUR.tous;
    const lien=stgRessNature(r)==='lien';
    const vide=lien?!r.url:!r.path;
    const vues=stgRessVues.filter(v=>String(v.ressource_id)===String(r.id));
    const lus=vues.filter(v=>v.ouvert_le).length;
    const confirmes=vues.filter(v=>v.accuse_le).length;
    return '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--border);'
      +'border-radius:9px;padding:9px 12px;flex-wrap:wrap;'+(r.actif?'':'opacity:.55')+'">'
      +'<i class="ti ti-'+(lien?'clipboard-list':'file-text')+'" style="color:'+(lien?'var(--orange-dark)':'var(--koala)')+'"></i>'
      +'<div style="flex:1;min-width:180px">'
      +'<div style="font-weight:600;font-size:13px">'+escHtml(r.libelle)
      +' <span style="background:'+pr.c+';color:#fff;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700;white-space:nowrap">'+pr.lib+'</span>'
      +(r.creche_id?' <span style="background:var(--koala-light);color:var(--koala-dark);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">'+escHtml(stgCrecheName(r.creche_id))+'</span>':'')
      +(r.accuse?'':'<span style="color:var(--muted);font-weight:400"> — sans confirmation</span>')
      +(r.transmet_identite?' <span style="background:var(--koala);color:#fff;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">identité transmise</span>':'')
      +(r.actif?'':'<span style="color:var(--red);font-weight:400"> — désactivé</span>')
      +(vide?'<span style="color:var(--red);font-weight:400"> — '+(lien?'adresse manquante':'fichier manquant')+'</span>':'')
      +'</div>'
      +(r.description?'<div style="font-size:11.5px;color:var(--muted)">'+escHtml(r.description)+'</div>':'')
      +(lien&&r.url?'<a href="'+escHtml(r.url)+'" target="_blank" rel="noopener" style="font-size:11.5px">'
        +'<i class="ti ti-external-link"></i> '+escHtml(r.url)+'</a>'
        :(!lien&&r.filename?'<div style="font-size:11.5px;color:var(--muted)"><i class="ti ti-paperclip"></i> '+escHtml(r.filename)+'</div>':''))
      +'<div style="font-size:11px;color:var(--muted);margin-top:2px">'
      +lus+' ouverture'+(lus>1?'s':'')+(r.accuse?' · '+confirmes+' confirmation'+(confirmes>1?'s':''):'')+'</div>'
      +'</div>'
      +(vide?'':'<button class="ibtn" title="Ouvrir" onclick="stgOuvrirRess(\''+r.id+'\')"><i class="ti ti-eye"></i></button>')
      +(stgRessModifiable(r)
        ? '<button class="ibtn" title="Monter" onclick="stgDeplacerRess(\''+r.id+'\',-1)"><i class="ti ti-chevron-up"></i></button>'
          +'<button class="ibtn" title="Descendre" onclick="stgDeplacerRess(\''+r.id+'\',1)"><i class="ti ti-chevron-down"></i></button>'
          +'<button class="ibtn" title="'+(lien?'Remplacer l\'adresse':'Remplacer le fichier')+'" onclick="stgRemplacerRess(\''+r.id+'\')"><i class="ti ti-refresh"></i></button>'
          +'<button class="ibtn" title="Demander ou non une confirmation" onclick="stgBasculerRess(\''+r.id+'\',\'accuse\')"><i class="ti ti-checkbox"></i></button>'
          +(lien?'<button class="ibtn" title="Transmettre ou non l\'identité au lien" onclick="stgBasculerRess(\''+r.id+'\',\'transmet_identite\')"><i class="ti ti-user-check"></i></button>':'')
          +'<button class="ibtn" title="'+(r.actif?'Désactiver':'Réactiver')+'" onclick="stgBasculerRess(\''+r.id+'\',\'actif\')">'
          +'<i class="ti ti-'+(r.actif?'eye-off':'eye')+'"></i></button>'
          +'<button class="ibtn" style="color:var(--red)" title="Supprimer" onclick="stgSupprimerRess(\''+r.id+'\')"><i class="ti ti-trash"></i></button>'
        /* Ni bouton grisé ni message d'erreur au clic : on dit simplement d'où
           vient la ligne. */
        : '<span style="font-size:11px;color:var(--muted);white-space:nowrap">'
          +'<i class="ti ti-lock"></i> '+(r.creche_id?'autre crèche':'réseau')+'</span>')
      +'</div>';
  }).join('');
}

/* Le fichier part dans le bucket privé avant l'écriture de la ligne : sans
   chemin, la ligne ne servirait à rien. L'inverse — une ligne perdue et un
   fichier orphelin — est rattrapé en supprimant le fichier. */
async function stgRessUpload(file){
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
  const path=STG_RESS_PREFIXE+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
  const {error}=await sb.storage.from(STG_BUCKET).upload(path,file,
    {contentType:file.type||'application/octet-stream',upsert:false});
  if(error)throw new Error(error.message||'Envoi impossible');
  return {bucket:STG_BUCKET,path,filename:file.name.slice(0,180),
          mime:file.type||null,taille:file.size};
}

async function stgAjouterRess(){
  const lib=((document.getElementById('stg-r-libelle')||{}).value||'').trim();
  const st=document.getElementById('stg-r-status');
  const dire=m=>{if(st)st.textContent=m||'';};
  if(!lib)return showBanner('Indiquez un titre.','error');

  const nature=(document.getElementById('stg-r-nature')||{}).value==='lien'?'lien':'fichier';
  const creche=(document.getElementById('stg-r-creche')||{}).value
              ||(isDirection?'':((currentProfile&&currentProfile.creche_id)||''));
  /* La policy le refuserait de toute façon (36c) ; autant le dire ici, avec la
     raison plutôt qu'un code d'erreur. */
  if(!isDirection&&!creche)
    return showBanner('Un document valable pour toutes les crèches est ajouté par la direction. '
      +'Le vôtre sera rattaché à votre crèche.','error');
  const base={
    libelle:lib,
    description:((document.getElementById('stg-r-desc')||{}).value||'').trim()||null,
    nature:nature,
    pour_type:(document.getElementById('stg-r-pour')||{}).value||'tous',
    creche_id:creche||null,
    accuse:(document.getElementById('stg-r-accuse')||{}).checked,
    /* Réservé à nos propres outils : un formulaire hébergé ailleurs recevrait
       sinon le nom d'une stagiaire dans son adresse. Ignoré pour un fichier. */
    transmet_identite:nature==='lien'&&(document.getElementById('stg-r-identite')||{}).checked,
    ordre:stgRess.reduce((m,r)=>Math.max(m,r.ordre||0),0)+10,
    actif:true
  };

  let depose=null;
  if(nature==='lien'){
    const url=((document.getElementById('stg-r-url')||{}).value||'').trim();
    if(!/^https?:\/\//i.test(url))
      return showBanner('L\'adresse doit commencer par http:// ou https://.','error');
    base.url=url;
  }else{
    const file=((document.getElementById('stg-r-fichier')||{}).files||[])[0];
    if(!file)return showBanner('Choisissez le fichier à transmettre.','error');
    if(file.size>12*1024*1024)return showBanner('Fichier trop lourd (12 Mo maximum).','error');
    dire('⏳ Envoi de '+file.name+'…');
    try{depose=await stgRessUpload(file);}
    catch(e){dire('');return showBanner('Envoi du fichier impossible : '+e.message,'error');}
    Object.assign(base,depose);
  }

  let saved=await dbInsert('stagiaires_ressources',base);
  /* Colonne absente = script 36d non exécuté : on ajoute quand même, sans la
     transmission d'identité. */
  if(!saved&&/transmet_identite/i.test(window._lastDbError||'')){
    delete base.transmet_identite;
    saved=await dbInsert('stagiaires_ressources',base);
    if(saved)showBanner('Ajouté, mais sans transmettre l\'identité : le script 36d n\'a pas encore été exécuté sur Supabase.','error');
  }
  if(!saved){
    /* La ligne n'existe pas : le fichier serait invisible et impossible à
       retrouver. On le retire. */
    if(depose)await sb.storage.from(STG_BUCKET).remove([depose.path]);
    dire('');
    return showBanner('Ajout impossible'
      +(window._lastDbError?' : '+window._lastDbError
        :(isDirection?'.':' — une référente ne peut ajouter que pour sa crèche (script 36c).'))+'','error');
  }
  dire('');
  ['stg-r-libelle','stg-r-desc','stg-r-url'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const f=document.getElementById('stg-r-fichier');if(f)f.value='';
  stgRess.push(saved);
  stgRess.sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  stgRenderRess();
  showBanner('Ajouté — visible sur les liens de dépôt ✅');
}

/* Remplacer, plutôt que supprimer puis recréer : la ligne garde son suivi de
   lecture, et l'ordre d'affichage ne bouge pas. */
async function stgRemplacerRess(id){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  if(stgRessNature(r)==='lien'){
    const url=prompt('Nouvelle adresse du lien :',r.url||'https://');
    if(url===null)return;
    if(!/^https?:\/\//i.test(url.trim()))return showBanner('L\'adresse doit commencer par http:// ou https://.','error');
    const ok=await dbUpdate('stagiaires_ressources',id,{url:url.trim()});
    if(!ok)return showBanner('Modification impossible (réservée à la direction).','error');
    r.url=url.trim();
    stgRenderRess();
    return showBanner('Adresse mise à jour ✅');
  }
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*,application/pdf';
  inp.onchange=async()=>{
    const file=(inp.files||[])[0];
    if(!file)return;
    if(file.size>12*1024*1024)return showBanner('Fichier trop lourd (12 Mo maximum).','error');
    let depose=null;
    try{depose=await stgRessUpload(file);}
    catch(e){return showBanner('Envoi impossible : '+e.message,'error');}
    const ancien=r.path;
    const ok=await dbUpdate('stagiaires_ressources',id,depose);
    if(!ok){
      await sb.storage.from(STG_BUCKET).remove([depose.path]);
      return showBanner('Modification impossible (réservée à la direction).','error');
    }
    Object.assign(r,depose);
    /* L'ancien fichier ne sert plus à rien : plus aucune ligne ne le désigne. */
    if(ancien)await sb.storage.from(STG_BUCKET).remove([ancien]);
    stgRenderRess();
    showBanner('Document remplacé — la nouvelle version est en ligne ✅');
  };
  inp.click();
}

async function stgBasculerRess(id,champ){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  const ok=await dbUpdate('stagiaires_ressources',id,{[champ]:!r[champ]});
  if(!ok)return showBanner('Modification impossible (réservée à la direction).','error');
  r[champ]=!r[champ];
  stgRenderRess();
  stgRenderRessFiche();
}

async function stgDeplacerRess(id,sens){
  const i=stgRess.findIndex(x=>String(x.id)===String(id));
  const j=i+sens;
  if(i<0||j<0||j>=stgRess.length)return;
  const a=stgRess[i],b=stgRess[j];
  const oa=a.ordre||0,ob=b.ordre||0;
  const ok1=await dbUpdate('stagiaires_ressources',a.id,{ordre:ob});
  const ok2=await dbUpdate('stagiaires_ressources',b.id,{ordre:oa});
  if(!ok1||!ok2)return showBanner('Déplacement impossible (réservé à la direction).','error');
  a.ordre=ob;b.ordre=oa;
  stgRess.sort((x,y)=>(x.ordre||0)-(y.ordre||0));
  stgRenderRess();
}

async function stgSupprimerRess(id){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  const vues=stgRessVues.filter(v=>String(v.ressource_id)===String(r.id)).length;
  if(!confirm('Supprimer « '+r.libelle+' » ?\n\n'
    +(vues?'Le suivi de lecture de '+vues+' personne(s) sera effacé.\n':'')
    +'Pour le retirer des nouveaux dossiers sans rien effacer, désactivez-le plutôt.'))return;
  const ok=await dbDelete('stagiaires_ressources',id);
  if(!ok)return showBanner('Suppression impossible (réservée à la direction).','error');
  if(r.path){
    const {error}=await sb.storage.from(r.bucket||STG_BUCKET).remove([r.path]);
    if(error)console.warn('[Stagiaires] fichier non supprimé',error.message);
  }
  stgRess=stgRess.filter(x=>String(x.id)!==String(id));
  stgRessVues=stgRessVues.filter(v=>String(v.ressource_id)!==String(id));
  stgRenderRess();
  showBanner('Supprimé.');
}

/* Côté application, on ouvre le fichier comme n'importe quelle pièce : URL
   signée de 5 minutes. Ouvrir depuis ici ne compte pas comme une lecture de la
   stagiaire — seul son propre lien écrit dans le suivi. */
async function stgOuvrirRess(id){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  if(stgRessNature(r)==='lien'){
    if(!r.url)return showBanner('Aucune adresse enregistrée.','error');
    return window.open(r.url,'_blank','noopener');
  }
  if(!r.path)return showBanner('Aucun fichier enregistré.','error');
  const {data,error}=await sb.storage.from(r.bucket||STG_BUCKET).createSignedUrl(r.path,STG_URL_TTL);
  if(error||!data)return showBanner('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'),'error');
  window.open(data.signedUrl,'_blank','noopener');
}

// ── Export ────────────────────────────────────────────────────────────────

function stgExportExcel(){
  if(!stgCache.length)return showBanner('Rien à exporter.','error');
  const aoa=[['Type','Prénom','Nom','Crèche','Statut','École','Formation','Niveau',
              'Début','Fin','Jours prévus','Absences','Pièces reçues','Pièces attendues',
              'Convention / contrat','E-mail','Téléphone','Bilan rédigé le']];
  stgFiltrees().forEach(s=>{
    const av=stgAvancement(s.id);
    const js=stgJoursDe(s.id);
    aoa.push([
      stgProfil(s).lib,
      s.prenom||'', s.nom||'', stgCrecheName(s.creche_id)||'', stgMeta(s.statut).lib,
      s.ecole||'', s.formation||'', s.niveau||'',
      stgDateFr(s.date_debut), stgDateFr(s.date_fin),
      js.filter(j=>!j.absent).length, js.filter(j=>j.absent).length,
      av.faits, av.total,
      STG_CONV[s.convention_statut]||'',
      s.email||'', s.telephone||'', stgDateFr(s.bilan_le)
    ]);
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:11},{wch:14},{wch:16},{wch:12},{wch:18},{wch:24},{wch:18},{wch:12},
               {wch:11},{wch:11},{wch:12},{wch:10},{wch:13},{wch:15},{wch:12},
               {wch:26},{wch:14},{wch:14}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Stagiaires et alternants');
  XLSX.writeFile(wb,'stagiaires-alternants-'+todayStr()+'.xlsx');
  showBanner('Export Excel généré ✅');
}

// ── Exposition (les onclick du HTML passent par window) ───────────────────

window.stgInit=stgInit;window.stgShowView=stgShowView;window.stgSetFilter=stgSetFilter;
window.stgRender=stgRender;window.stgRenderCal=stgRenderCal;window.stgOpenFiche=stgOpenFiche;
window.stgSave=stgSave;window.stgSupprimer=stgSupprimer;window.stgStatutChange=stgStatutChange;
window.stgCreerLien=stgCreerLien;window.stgCopierLien=stgCopierLien;
window.stgUpload=stgUpload;window.stgOuvrirDoc=stgOuvrirDoc;window.stgStatutDoc=stgStatutDoc;
window.stgSupprimerDoc=stgSupprimerDoc;window.stgGenererJours=stgGenererJours;
window.stgAjouterJour=stgAjouterJour;window.stgOuvrirJour=stgOuvrirJour;
window.stgJourAbsentChange=stgJourAbsentChange;window.stgJourEnregistrer=stgJourEnregistrer;
window.stgJourSupprimer=stgJourSupprimer;window.stgCalMois=stgCalMois;window.stgCalClic=stgCalClic;
window.stgAjouterType=stgAjouterType;window.stgBasculerType=stgBasculerType;
window.stgTypeChange=stgTypeChange;window.stgCyclerPour=stgCyclerPour;
window.stgImportPdf=stgImportPdf;window.stgImportRole=stgImportRole;
window.stgImportApercu=stgImportApercu;window.stgImportValider=stgImportValider;
window.stgOuvrirSemaine=stgOuvrirSemaine;window.stgSemaineBascule=stgSemaineBascule;
window.stgSemaineApercu=stgSemaineApercu;window.stgSemaineAjouter=stgSemaineAjouter;
window.stgDeplacerType=stgDeplacerType;window.stgExportExcel=stgExportExcel;
window.stgAjouterRess=stgAjouterRess;window.stgBasculerRess=stgBasculerRess;
window.stgDeplacerRess=stgDeplacerRess;window.stgSupprimerRess=stgSupprimerRess;
window.stgOuvrirRess=stgOuvrirRess;window.stgRemplacerRess=stgRemplacerRess;
window.stgRessNatureChange=stgRessNatureChange;
window.stgRemplirReferents=stgRemplirReferents;

/* ── Compte collaborateur (alternant·e) ──────────────────────────────────
   Un·e alternant·e est aussi salarié·e : plutôt que ressaisir prénom/nom/
   e-mail/crèche une seconde fois dans employes, on relie la fiche stagiaires
   à sa fiche employes via stagiaires.employe_id (cf.
   sql/stagiaires_lien_employe.sql). Une fois liée, ces informations sont
   gérées depuis employes, source de vérité — la fiche alternant ne fait plus
   que refléter la liaison.
   Ouvrir « Mon espace » (planning, pointages, compteur d'heures) à
   l'alternant·e ne demande alors plus rien de neuf : c'est l'infrastructure
   déjà en place pour les collaborateurs/trices (bouton « Créer le compte de
   connexion », identique à l'onglet Collaborateurs). */
function stgEmployeLie(s){
  return (s&&s.employe_id)?cacheEmployes.find(e=>String(e.id)===String(s.employe_id)):null;
}
function stgRenderCollabZone(){
  const zone=document.getElementById('stg-collab-zone');
  if(!zone)return;
  const s=stgFicheId?stgCache.find(x=>String(x.id)===String(stgFicheId)):null;
  const type=(document.getElementById('stg-f-type')||{}).value==='alternant'?'alternant':'stagiaire';
  if(!s||type!=='alternant'){zone.innerHTML='';return;}
  const emp=stgEmployeLie(s);
  const div='<div style="border-top:1.5px solid var(--border);margin:16px 0 14px"></div>';
  if(!emp){
    zone.innerHTML=div+'<div class="fg"><label class="flabel">Compte collaborateur</label>'
      +'<p style="font-size:0.85em;color:#666;margin:2px 0 8px">Un·e alternant·e est aussi salarié·e : créez sa fiche '
      +'collaborateur pour lui ouvrir Mon espace (planning, pointages, compteur d\'heures) sans ressaisir ses informations.</p>'
      +'<button type="button" class="btn-primary" onclick="stgCreerFicheCollab()"><i class="ti ti-user-plus"></i> Créer la fiche collaborateur</button>'
      +'</div>';
    return;
  }
  const compteBadge=emp.user_id
    ?'<span class="badge" style="background:var(--green-light);color:var(--green)"><i class="ti ti-lock-open"></i> Compte actif</span>'
    :'<span class="badge" style="background:#f0f0f5;color:#888">Pas de compte</span>';
  const btnCompte=emp.user_id?'':'<button type="button" class="btn-primary" onclick="stgCreerCompteCollab()" '
    +(emp.email?'':'disabled title="Renseignez un e-mail sur la fiche collaborateur avant de créer le compte"')
    +'><i class="ti ti-mail-forward"></i> Créer le compte de connexion</button>';
  zone.innerHTML=div+'<div class="fg"><label class="flabel">Compte collaborateur</label>'
    +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#f8f8fb;border-radius:10px">'
    +'<div style="flex:1;min-width:160px"><b>'+escHtml(emp.prenom||'')+' '+escHtml(emp.nom||'')+'</b>'
    +(emp.poste?' — '+escHtml(emp.poste):'')
    +(emp.email?'<br><span style="color:#888;font-size:0.85em">'+escHtml(emp.email)+'</span>':'')
    +'</div>'+compteBadge+btnCompte
    +'<button type="button" class="btn-cancel" onclick="stgDelierCollab()" title="Délier la fiche collaborateur"><i class="ti ti-unlink"></i></button>'
    +'</div>'
    +'<p style="font-size:0.8em;color:#888;margin-top:6px">Prénom, nom, e-mail et crèche sont désormais gérés depuis la '
    +'fiche collaborateur — modifiez-les dans l\'onglet Collaborateurs.</p></div>';
}
async function stgCreerFicheCollab(){
  const s=stgFicheId?stgCache.find(x=>String(x.id)===String(stgFicheId)):null;
  if(!s)return;
  if(!s.creche_id)return showBanner('Orientez d\'abord cette personne vers une crèche avant de créer sa fiche collaborateur.','error');
  const row={prenom:s.prenom,nom:s.nom||null,email:s.email||null,creche_id:s.creche_id};
  const saved=await dbInsert('employes',row);
  if(!saved)return showBanner('Création de la fiche collaborateur impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  cacheEmployes.push(saved);
  const ok=await dbUpdate('stagiaires',stgFicheId,{employe_id:saved.id});
  if(!ok){
    showBanner('Fiche collaborateur créée, mais le lien avec la fiche alternant a échoué'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
    return;
  }
  s.employe_id=saved.id;
  showBanner('Fiche collaborateur créée et liée ✅');
  stgRenderCollabZone();
}
async function stgCreerCompteCollab(){
  const s=stgFicheId?stgCache.find(x=>String(x.id)===String(stgFicheId)):null;
  const emp=stgEmployeLie(s);
  if(!emp||!emp.email)return;
  if(!confirm('Envoyer à '+emp.email+' un e-mail d\'invitation pour créer son compte de connexion ?'))return;
  const redirect=location.href.replace(/demandes\.html.*$/,'collaborateur.html');
  const{ok,data}=await callFn('creer-compte-collaborateur',{employe_id:emp.id,redirect_to:redirect});
  if(!ok)return showBanner('Échec : '+(data.error||'erreur inconnue'),'error');
  showBanner('Invitation envoyée à '+emp.email+'.');
  /* Le vrai user_id n'est posé côté base qu'après acceptation de
     l'invitation — pas de mise à jour optimiste ici, juste un rechargement
     pour refléter l'état réel au prochain passage sur la fiche. */
  await stgLoad();
  stgRenderCollabZone();
}
async function stgDelierCollab(){
  if(!stgFicheId)return;
  if(!confirm('Délier cette fiche alternant de sa fiche collaborateur ?\n\nLa fiche collaborateur elle-même n\'est pas supprimée.'))return;
  const ok=await dbUpdate('stagiaires',stgFicheId,{employe_id:null});
  if(!ok)return showBanner('Échec du déliage.','error');
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(s)s.employe_id=null;
  showBanner('Fiche déliée.');
  stgRenderCollabZone();
}
window.stgRenderCollabZone=stgRenderCollabZone;
window.stgCreerFicheCollab=stgCreerFicheCollab;
window.stgCreerCompteCollab=stgCreerCompteCollab;
window.stgDelierCollab=stgDelierCollab;
