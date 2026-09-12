/* ══════════════════════════════════════════════════════════════════════════
   SUIVI DES ACTIONS DE DIRECTION                    (tables actions_direction
                                                      et reunions_direction)

   Reprend le classeur « Suivi_actions_reunion_direction.xlsx ». Trois écrans :

     Actions        la liste, filtrée par défaut sur les points NON CLOS —
                    c'est cette liste-là qu'on relit en début de réunion, et
                    la voir d'emblée épargne le clic qu'on oublie de faire.
     Mode réunion   l'en-tête (présents, excusés), la revue guidée une action
                    à la fois, les notes de séance, les nouvelles actions.
     Comptes rendus les réunions passées, relisibles dans l'application et
                    réimprimables.

   Deux principes tenus partout :
   · le RETARD ne se stocke pas, il se recalcule (aujourd'hui − échéance, tant
     que l'action n'est pas close) — une valeur stockée serait fausse dès le
     lendemain ;
   · un statut CLOS (fait / abandonné) date la clôture et sort l'action de la
     revue, sans jamais la supprimer : l'historique est ce qui permet de dire
     « on en avait parlé le 3 septembre ».
   ═════════════════════════════════════════════════════════════════════════ */

const AD_STATUTS={
  a_faire  :{label:'À faire',    court:'À faire',  icon:'⬜', bg:'var(--blue-light)',   fg:'var(--blue)'},
  en_cours :{label:'En cours',   court:'En cours', icon:'🔄', bg:'var(--orange-light)', fg:'var(--orange-dark)'},
  reporte  :{label:'Reportée',   court:'Reportée', icon:'📅', bg:'#f0f0f5',             fg:'#666'},
  fait     :{label:'Faite',      court:'Faite',    icon:'✅', bg:'var(--green-light)',  fg:'var(--green)'},
  abandonne:{label:'Abandonnée', court:'Abandon',  icon:'🚫', bg:'#f0f0f5',             fg:'#888'}
};
const AD_CLOS=['fait','abandonne'];
const AD_THEMES=['Recrutement','Ressources humaines','Pédagogie','Formation','Travaux / Locaux','Sécurité / PMI','Budget','Familles','Réseau','Organisation','Autre'];

let adCache=[],adReunions=[],adFilter='ouvertes',adEditId=null,
    adReunionDate=null,adReunionCourante=null,adRevueIdx=0,adRevueTout=false,
    adProjection=false,adSchemaOk=true,_adCrVue=null,_adDirty=false,_adPointsCreches={};

function adEstClos(s){return AD_CLOS.indexOf(s)>=0;}
function adStatutMeta(s){return AD_STATUTS[s]||AD_STATUTS.a_faire;}
function adFmtDate(iso){if(!iso)return'';const d=new Date(iso+'T12:00:00');return isNaN(d)?'':d.toLocaleDateString('fr-FR');}
function adFmtDateLongue(iso){
  if(!iso)return'';
  const d=new Date(iso+'T12:00:00');if(isNaN(d))return'';
  const j=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const m=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return j[d.getDay()]+' '+d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();
}
function adCrecheName(id){if(!id)return null;const c=cacheCreches.find(x=>String(x.id)===String(id));return c?c.name:null;}

/* ── L'ordre de la réunion ──────────────────────────────────────────────────
   On traite les sujets crèche par crèche, puis les transverses. Tout le module
   suit cet ordre : la revue, l'ordre du jour, le compte rendu, la liste.

   Les crèches sont triées par nom plutôt que dans l'ordre de la table (qui est
   celui de leur création, invisible et instable). L'ordre est ainsi le même à
   chaque réunion — c'est ce qui permet de savoir où on en est sans compter. */
function adCrechesOrdonnees(){
  return (cacheCreches||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr'));
}
/* Rang d'une action dans cet ordre ; le transverse ferme la marche. */
function adRangCreche(id){
  if(!id)return 9999;
  const i=adCrechesOrdonnees().findIndex(c=>String(c.id)===String(id));
  return i<0?9998:i;   // une crèche supprimée passe juste avant le transverse
}
/* Découpe une liste d'actions en groupes, dans l'ordre de la réunion. */
function adGrouperParCreche(liste){
  const groupes=[];
  adCrechesOrdonnees().forEach(c=>{
    const items=liste.filter(a=>String(a.creche_id||'')===String(c.id));
    if(items.length)groupes.push({id:c.id,nom:c.name,icone:'ti-building',items:items});
  });
  // Une crèche supprimée depuis, ou une ligne figée dans un compte rendu :
  // le nom photographié à l'époque vaut mieux que « crèche supprimée ».
  const orphelines=liste.filter(a=>a.creche_id&&!cacheCreches.find(c=>String(c.id)===String(a.creche_id)));
  const parNom={};
  orphelines.forEach(a=>{const n=a.creche_nom||'Crèche supprimée';(parNom[n]=parNom[n]||[]).push(a);});
  Object.keys(parNom).forEach(n=>groupes.push({id:null,nom:n,icone:'ti-building-off',items:parNom[n]}));
  const transverse=liste.filter(a=>!a.creche_id);
  if(transverse.length)groupes.push({id:'',nom:'Sujets transverses / réseau',icone:'ti-link',items:transverse});
  return groupes;
}

/* Retard en jours, ou 0. Une action close n'est jamais en retard — c'est la
   formule de la colonne H du classeur, à l'identique. */
function adRetard(a){
  if(!a.echeance||adEstClos(a.statut))return 0;
  const ech=new Date(a.echeance+'T12:00:00');
  const auj=new Date(todayStr()+'T12:00:00');
  const j=Math.round((auj-ech)/86400000);
  return j>0?j:0;
}
/* Jours restants avant l'échéance (négatif = dépassée). */
function adRestant(a){
  if(!a.echeance)return null;
  const ech=new Date(a.echeance+'T12:00:00');
  const auj=new Date(todayStr()+'T12:00:00');
  return Math.round((ech-auj)/86400000);
}
function adNumeroSuivant(){
  return adCache.reduce((m,a)=>Math.max(m,a.numero||0),0)+1;
}

// ── Chargement ────────────────────────────────────────────────────────────

async function adInit(){
  const opt=t=>'<option value="'+escHtml(t)+'">'+escHtml(t)+'</option>';
  const themes=AD_THEMES.map(opt).join('');
  ['ad-f-theme','ad-new-theme'].forEach(id=>{const s=document.getElementById(id);if(s)s.innerHTML=themes;});
  const optsC=adCrechesOrdonnees().map(c=>'<option value="'+c.id+'">'+escHtml(c.name)+'</option>').join('');
  const selC=document.getElementById('ad-f-creche');
  if(selC)selC.innerHTML='<option value="">— Transverse / réseau —</option>'+optsC;
  const selN=document.getElementById('ad-new-creche');
  if(selN)selN.innerHTML='<option value="">— Transverse / réseau —</option>'+optsC;
  adFillRespSelects();
  // Le vidéoprojecteur de la salle ne change pas d'une réunion à l'autre :
  // le réglage se retrouve tel qu'on l'avait laissé.
  try{adProjection=localStorage.getItem('adProjection')==='1';}catch(e){}
  adAppliqueProjection();
  if(!adReunionDate)adReunionDate=todayStr();
  const dr=document.getElementById('ad-r-date');if(dr)dr.value=adReunionDate;
  await adLoad();
}

async function adLoad(){
  const r1=await sb.from('actions_direction').select('*').order('numero',{ascending:true});
  const r2=await sb.from('reunions_direction').select('*').order('date_reunion',{ascending:false});
  const warn=document.getElementById('ad-schema-warn');
  adSchemaOk=!r1.error&&!r2.error;
  if(!adSchemaOk){
    // Un écran vide ne dit pas si la table manque ou si personne n'a rien saisi.
    const manque=(r1.error||r2.error||{}).message||'';
    if(warn){
      warn.style.display='block';
      warn.innerHTML='<strong><i class="ti ti-alert-triangle"></i> Suivi des actions indisponible.</strong> '
        +'Le script <code>17-actions-direction.sql</code> n\'a pas encore été exécuté sur Supabase, '
        +'ou votre compte n\'a pas le rôle « direction ».<br><span style="opacity:.85">Détail : '+escHtml(manque)+'</span>';
    }
  }else if(warn){warn.style.display='none';}
  adCache=r1.data||[];
  adReunions=r2.data||[];
  adRenderTout();
}

function adRenderTout(){
  adRenderFiltres();
  adRender();
  adRenderReunion();
  adRenderCRList();
  // Le miroir dans « À faire » lit le même cache : le laisser périmé
  // afficherait comme à traiter une action qu'on vient de clore.
  const af=document.getElementById('main-afaire');
  if(af&&af.classList.contains('active')&&typeof afRender==='function'){try{afRender();}catch(e){}}
}

function adShowView(v,btn){
  ['liste','reunion','cr'].forEach(x=>{
    const el=document.getElementById('ad-view-'+x);
    if(el)el.classList.toggle('active',x===v);
  });
  document.querySelectorAll('#main-actions .module-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  if(v==='reunion')adRenderReunion();
  if(v==='cr')adRenderCRList();
}

// ── Vue 1 : la liste ──────────────────────────────────────────────────────

function adSetFilter(f){
  adFilter=f;
  ['ouvertes','retard','closes','toutes'].forEach(x=>{
    const c=document.getElementById('ad-chip-'+x);
    if(c)c.classList.toggle('active',x===f);
  });
  adRender();
}

/* Les listes déroulantes se remplissent des valeurs réellement présentes :
   un filtre qui propose des responsables inexistants ne sert à rien. */
function adRenderFiltres(){
  const resp=[...new Set(adCache.map(a=>(a.responsable||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const themes=[...new Set(adCache.map(a=>(a.theme||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const sR=document.getElementById('ad-filter-resp');
  if(sR){const v=sR.value;sR.innerHTML='<option value="">Tous les responsables</option>'+resp.map(r=>'<option value="'+escHtml(r)+'">'+escHtml(r)+'</option>').join('');sR.value=v;}
  const sT=document.getElementById('ad-filter-theme');
  if(sT){const v=sT.value;sT.innerHTML='<option value="">Tous les thèmes</option>'+themes.map(t=>'<option value="'+escHtml(t)+'">'+escHtml(t)+'</option>').join('');sT.value=v;}
  const sC=document.getElementById('ad-filter-creche');
  if(sC){const v=sC.value;sC.innerHTML='<option value="">Toutes les crèches</option><option value="__reseau">— Réseau / transverse —</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+escHtml(c.name)+'</option>').join('');sC.value=v;}
  // Datalist des responsables : direction, référentes, et les noms déjà saisis.
  const dl=document.getElementById('ad-resp-list');
  if(dl){
    const noms=[...new Set([...resp,...(cacheReferents||[]).map(r=>r.name).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'fr'));
    dl.innerHTML=noms.map(n=>'<option value="'+escHtml(n)+'">').join('');
  }
  adFillRespSelects();
}

/* ── Le responsable ─────────────────────────────────────────────────────────
   Un nom tapé à la main ne permet pas de dire « cette action me concerne » :
   « David », « David M. » et « david » désignent la même personne sans que
   l'application puisse le savoir. Le responsable se choisit donc parmi les
   comptes, et la colonne responsable_referent_id porte le lien.

   Le champ texte reste disponible pour qui n'a pas de compte — un artisan, la
   PMI, le réseau — et c'est lui qui s'imprime dans le CR et l'export Excel :
   quand le responsable est un compte, on écrit les deux. */
function adFillRespSelects(){
  const gens=(cacheReferents||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr'));
  const opts='<option value="">— À désigner —</option>'
    +gens.map(r=>'<option value="'+r.id+'">'+escHtml(r.name||'(sans nom)')+(r.role==='direction'?' — direction':'')+'</option>').join('')
    +'<option value="__autre">Autre personne (hors application)…</option>';
  ['ad-f-resp-sel','ad-new-resp-sel'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const v=el.value;
    el.innerHTML=opts;
    if(v&&(v==='__autre'||gens.some(r=>String(r.id)===String(v))))el.value=v;
  });
}

function adRespSelChange(prefixe){
  const sel=document.getElementById(prefixe+'-resp-sel'),txt=document.getElementById(prefixe+'-resp');
  if(!sel||!txt)return;
  const autre=sel.value==='__autre';
  txt.style.display=autre?'':'none';
  if(autre)setTimeout(()=>txt.focus(),50); else txt.value='';
}

/* Ce que les deux champs valent ensemble, prêt à écrire en base. */
function adRespDuFormulaire(prefixe){
  const sel=document.getElementById(prefixe+'-resp-sel'),txt=document.getElementById(prefixe+'-resp');
  const v=sel?sel.value:'';
  if(v==='__autre')return{responsable_referent_id:null,responsable:((txt&&txt.value)||'').trim()||null};
  if(v){
    const r=(cacheReferents||[]).find(x=>String(x.id)===String(v));
    return{responsable_referent_id:v,responsable:(r&&r.name)||null};
  }
  return{responsable_referent_id:null,responsable:null};
}

/* L'inverse : positionner les deux champs sur une action existante. Un compte
   supprimé depuis retombe sur « Autre personne », le nom restant lisible. */
function adRespVersFormulaire(prefixe,a){
  const sel=document.getElementById(prefixe+'-resp-sel'),txt=document.getElementById(prefixe+'-resp');
  if(!sel||!txt)return;
  const lie=a&&a.responsable_referent_id&&(cacheReferents||[]).some(r=>String(r.id)===String(a.responsable_referent_id));
  if(lie){sel.value=a.responsable_referent_id;txt.value='';txt.style.display='none';}
  else if(a&&a.responsable){sel.value='__autre';txt.value=a.responsable;txt.style.display='';}
  else{sel.value='';txt.value='';txt.style.display='none';}
}

/* Par échéance : c'est l'ordre de l'urgence, celui du miroir « À faire ». */
function adOuvertes(){
  return adCache.filter(a=>!adEstClos(a.statut)).sort(adTriEcheance);
}
function adTriEcheance(a,b){
  if(!a.echeance&&!b.echeance)return (a.numero||0)-(b.numero||0);
  if(!a.echeance)return 1;
  if(!b.echeance)return -1;
  return a.echeance<b.echeance?-1:a.echeance>b.echeance?1:(a.numero||0)-(b.numero||0);
}

/* Par crèche puis par échéance : c'est l'ordre de la RÉUNION, celui de la
   revue et du compte rendu. On ne saute pas d'un site à l'autre pour revenir
   au premier trois lignes plus loin. */
function adOuvertesReunion(){
  return adCache.filter(a=>!adEstClos(a.statut)).sort((a,b)=>{
    const ra=adRangCreche(a.creche_id),rb=adRangCreche(b.creche_id);
    if(ra!==rb)return ra-rb;
    return adTriEcheance(a,b);
  });
}

function adFiltered(){
  let l=adCache.slice();
  if(adFilter==='ouvertes')l=l.filter(a=>!adEstClos(a.statut));
  else if(adFilter==='retard')l=l.filter(a=>adRetard(a)>0);
  else if(adFilter==='closes')l=l.filter(a=>adEstClos(a.statut));
  const r=(document.getElementById('ad-filter-resp')||{}).value||'';
  const t=(document.getElementById('ad-filter-theme')||{}).value||'';
  const c=(document.getElementById('ad-filter-creche')||{}).value||'';
  const q=((document.getElementById('ad-search')||{}).value||'').trim().toLowerCase();
  if(r)l=l.filter(a=>(a.responsable||'').trim()===r);
  if(t)l=l.filter(a=>(a.theme||'').trim()===t);
  if(c==='__reseau')l=l.filter(a=>!a.creche_id);
  else if(c)l=l.filter(a=>String(a.creche_id)===String(c));
  if(q)l=l.filter(a=>((a.action||'')+' '+(a.suivi||'')+' '+(a.responsable||'')+' '+(a.theme||'')).toLowerCase().includes(q));
  // Non closes : par urgence. Closes : la clôture la plus récente d'abord.
  if(adFilter==='closes')return l.sort((a,b)=>String(b.cloture_le||'').localeCompare(String(a.cloture_le||'')));
  return l.sort((a,b)=>{
    const ra=adRetard(a),rb=adRetard(b);
    if(ra!==rb)return rb-ra;
    if(!a.echeance&&!b.echeance)return (a.numero||0)-(b.numero||0);
    if(!a.echeance)return 1;
    if(!b.echeance)return -1;
    return a.echeance<b.echeance?-1:1;
  });
}

function adRender(){
  const box=document.getElementById('ad-list');if(!box)return;
  const ouvertes=adOuvertes();
  const enRetard=ouvertes.filter(a=>adRetard(a)>0);
  const semaine=ouvertes.filter(a=>{const r=adRestant(a);return r!==null&&r>=0&&r<=7;});
  const moisIso=todayStr().slice(0,7);
  const closesMois=adCache.filter(a=>adEstClos(a.statut)&&(a.cloture_le||'').slice(0,7)===moisIso);

  const stats=document.getElementById('ad-stats');
  if(stats)stats.innerHTML=
     adStatCard('Actions ouvertes',ouvertes.length,'ti-hourglass','var(--koala)')
    +adStatCard('En retard',enRetard.length,'ti-alert-triangle',enRetard.length?'var(--red)':'var(--muted)')
    +adStatCard('À échéance sous 7 j',semaine.length,'ti-clock','var(--orange-dark)')
    +adStatCard('Closes ce mois-ci',closesMois.length,'ti-check','var(--green)');

  const badge=document.getElementById('ad-badge-ouvertes');
  if(badge){badge.textContent=ouvertes.length;badge.style.display=ouvertes.length?'':'none';}

  const l=adFiltered();
  if(!l.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-target-arrow"></i><p>'
      +(adCache.length?'Aucune action ne correspond à ce filtre.':'Aucune action pour l\'instant. Cliquez sur « Nouvelle action », ou passez par le mode réunion.')
      +'</p></div>';
    return;
  }
  // Groupée par site, dans l'ordre de la réunion : c'est ainsi qu'on la
  // parcourt à l'oral. Un filtre sur une seule crèche rend le groupage inutile.
  const filtreCreche=(document.getElementById('ad-filter-creche')||{}).value||'';
  if(filtreCreche){box.innerHTML=l.map(a=>adCardHtml(a)).join('');return;}
  box.innerHTML=adGrouperParCreche(l).map(g=>
    '<div style="margin-bottom:6px">'+adIntertitre(g,g.items.length)
    +'<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">'+g.items.map(a=>adCardHtml(a)).join('')+'</div></div>'
  ).join('');
}

function adStatCard(label,val,icon,color){
  return '<div class="stat-card"><div class="stat-val" style="color:'+color+'">'+val+'</div>'
    +'<div class="stat-label"><i class="ti '+icon+'" style="color:'+color+'"></i> '+label+'</div></div>';
}

function adCardHtml(a){
  const st=adStatutMeta(a.statut),ret=adRetard(a),clos=adEstClos(a.statut),rest=adRestant(a);
  const bord=clos?'var(--border)':ret>0?'var(--red)':(rest!==null&&rest<=7)?'var(--orange)':'var(--koala)';
  const creche=adCrecheName(a.creche_id);
  let ech='';
  if(a.echeance){
    if(clos)ech='<span class="meta-txt">échéance '+adFmtDate(a.echeance)+'</span>';
    else if(ret>0)ech='<span class="badge" style="background:var(--red-light);color:#c0392b"><i class="ti ti-alert-triangle" style="font-size:11px"></i> '+ret+' j de retard</span>';
    else if(rest===0)ech='<span class="badge" style="background:var(--orange-light);color:var(--orange-dark)">échéance aujourd\'hui</span>';
    else ech='<span class="badge" style="background:'+(rest<=7?'var(--orange-light)':'#f0f0f5')+';color:'+(rest<=7?'var(--orange-dark)':'#666')+'">pour le '+adFmtDate(a.echeance)+'</span>';
  }else if(!clos){
    ech='<span class="meta-txt" style="font-style:italic">sans échéance</span>';
  }
  return '<div class="dcard" style="border-left:4px solid '+bord+';opacity:'+(clos?'0.72':'1')+'">'
    +'<div class="dmeta">'
      +'<div class="dtop">'
        +'<span class="dsubject">'+(a.numero?'<span style="color:var(--muted);font-weight:700">N°'+a.numero+'</span> ':'')+escHtml(a.action||'')+'</span>'
        +'<span class="badge" style="background:'+st.bg+';color:'+st.fg+'">'+st.icon+' '+st.label+'</span>'
        +(a.theme?'<span class="badge b-ref">'+escHtml(a.theme)+'</span>':'')
        +(creche?'<span class="badge b-ref"><i class="ti ti-building" style="font-size:11px"></i> '+escHtml(creche)+'</span>':'')
      +'</div>'
      +(a.suivi?'<div class="dbody">'+escHtml(a.suivi)+'</div>':'')
      +'<div class="dfoot">'
        +(a.responsable?'<span class="badge b-ref"><i class="ti ti-user" style="font-size:11px"></i> '+escHtml(a.responsable)+'</span>':'<span class="meta-txt" style="font-style:italic">responsable à désigner</span>')
        +ech
        +(a.reunion_date?'<span class="meta-txt">décidée le '+adFmtDate(a.reunion_date)+'</span>':'')
        +(clos&&a.cloture_le?'<span class="meta-txt">close le '+adFmtDate(a.cloture_le)+'</span>':'')
      +'</div>'
    +'</div>'
    +'<div class="dactions">'
      +(clos
        ? '<button class="ibtn" title="Rouvrir" onclick="adSetStatut(\''+a.id+'\',\'en_cours\')"><i class="ti ti-rotate-clockwise"></i></button>'
        : '<button class="ibtn" title="Marquer faite" onclick="adSetStatut(\''+a.id+'\',\'fait\')"><i class="ti ti-check"></i></button>')
      +'<button class="ibtn" title="Modifier" onclick="adOpenActionModal(\''+a.id+'\')"><i class="ti ti-edit"></i></button>'
      +'<button class="ibtn del" title="Supprimer" onclick="adDelete(\''+a.id+'\')"><i class="ti ti-trash"></i></button>'
    +'</div></div>';
}

// ── Création / modification ───────────────────────────────────────────────

function adOpenActionModal(id){
  adEditId=id||null;
  const a=id?adCache.find(x=>String(x.id)===String(id)):null;
  document.getElementById('modal-ad-title').textContent=a?('Action n°'+(a.numero||'')):'Nouvelle action';
  document.getElementById('ad-f-action').value=a?(a.action||''):'';
  document.getElementById('ad-f-theme').value=a&&a.theme?a.theme:'Organisation';
  adRespVersFormulaire('ad-f',a);
  document.getElementById('ad-f-reunion').value=a?(a.reunion_date||''):(adReunionDate||todayStr());
  document.getElementById('ad-f-echeance').value=a?(a.echeance||''):adEcheanceParDefaut();
  document.getElementById('ad-f-statut').value=a?(a.statut||'a_faire'):'a_faire';
  document.getElementById('ad-f-creche').value=a&&a.creche_id?a.creche_id:'';
  document.getElementById('ad-f-suivi').value=a?(a.suivi||''):'';
  document.getElementById('modal-action-wrap').classList.add('open');
  setTimeout(()=>document.getElementById('ad-f-action').focus(),80);
}

/* Les réunions ont lieu tous les quinze jours : une action sans échéance
   explicite est due pour la suivante. */
function adEcheanceParDefaut(){
  const d=new Date((adReunionDate||todayStr())+'T12:00:00');
  d.setDate(d.getDate()+14);
  return ipDateToLocalISO(d);
}

async function adSaveAction(){
  const action=(document.getElementById('ad-f-action').value||'').trim();
  if(!action){showBanner('Décrivez l\'action en une phrase.','error');document.getElementById('ad-f-action').focus();return;}
  const statut=document.getElementById('ad-f-statut').value||'a_faire';
  const ancienne=adEditId?adCache.find(x=>String(x.id)===String(adEditId)):null;
  const row={
    action:action,
    theme:document.getElementById('ad-f-theme').value||null,
    responsable:null,responsable_referent_id:null,   // remplacés juste après
    reunion_date:document.getElementById('ad-f-reunion').value||null,
    echeance:document.getElementById('ad-f-echeance').value||null,
    statut:statut,
    creche_id:document.getElementById('ad-f-creche').value||null,
    suivi:(document.getElementById('ad-f-suivi').value||'').trim()||null,
    // On ne réécrit pas une date de clôture déjà posée : elle dit quand la
    // décision a été prise, pas quand la fiche a été retouchée.
    cloture_le:adEstClos(statut)?((ancienne&&ancienne.cloture_le)||todayStr()):null
  };
  Object.assign(row,adRespDuFormulaire('ad-f'));
  const btn=document.getElementById('ad-f-save');btn.disabled=true;
  try{
    if(adEditId){
      const ancienResponsableId=ancienne?.responsable_referent_id;
      const{error}=await sb.from('actions_direction').update(row).eq('id',adEditId);
      if(error)throw error;
      Object.assign(ancienne,row);
      showBanner('Action mise à jour ✅');
      if(row.responsable_referent_id&&row.responsable_referent_id!==ancienResponsableId){
        await callFn('notify-push',{referent_ids:[row.responsable_referent_id],title:'Action qui vous est assignée',body:action,url:'./demandes.html',tag:'action-'+adEditId});
      }
    }else{
      row.numero=adNumeroSuivant();
      const{data,error}=await sb.from('actions_direction').insert(row).select().single();
      if(error)throw error;
      adCache.push(data);
      showBanner('Action n°'+data.numero+' créée ✅');
      if(row.responsable_referent_id){
        await callFn('notify-push',{referent_ids:[row.responsable_referent_id],title:'Action qui vous est assignée',body:action,url:'./demandes.html',tag:'action-'+data.id});
      }
    }
    closeModal('modal-action-wrap');
    adEditId=null;
    adRenderTout();
  }catch(err){
    console.error('[adSaveAction]',err);
    showBanner('Enregistrement refusé : '+(err.message||'erreur inconnue'),'error');
  }finally{btn.disabled=false;}
}

async function adSetStatut(id,statut,silencieux){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  const maj={statut:statut,cloture_le:adEstClos(statut)?(a.cloture_le||todayStr()):null};
  const{error}=await sb.from('actions_direction').update(maj).eq('id',id);
  if(error){showBanner('Mise à jour refusée : '+error.message,'error');return;}
  Object.assign(a,maj);
  if(!silencieux)showBanner('Action n°'+(a.numero||'')+' — '+adStatutMeta(statut).label.toLowerCase()+' ✅');
  adRenderTout();
}

async function adDelete(id){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  if(!confirm('Supprimer définitivement l\'action n°'+(a.numero||'')+' ?\n\n« '+(a.action||'')+' »\n\nPour la sortir de la revue sans perdre la trace, préférez le statut « Abandonnée ».'))return;
  const{error}=await sb.from('actions_direction').delete().eq('id',id);
  if(error){showBanner('Suppression refusée : '+error.message,'error');return;}
  adCache=adCache.filter(x=>String(x.id)!==String(id));
  adRenderTout();
  showBanner('Action supprimée.');
}

// ── Vue 2 : le mode réunion ───────────────────────────────────────────────

function adReunionDirty(){_adDirty=true;adMajEtat();}
function adMajEtat(){
  const e=document.getElementById('ad-r-etat');if(!e)return;
  if(_adDirty){e.innerHTML='<i class="ti ti-point-filled" style="color:var(--orange)"></i> modifications non enregistrées';e.style.color='var(--orange-dark)';}
  else if(adReunionCourante){e.innerHTML='<i class="ti ti-circle-check" style="color:var(--green)"></i> enregistrée'+(adReunionCourante.cloturee?' et clôturée':'');e.style.color='var(--muted)';}
  else{e.textContent='nouvelle réunion — rien d\'enregistré pour cette date';e.style.color='var(--muted)';}
}

function adReunionCharger(date){
  if(_adDirty&&!confirm('Des modifications ne sont pas enregistrées. Changer de date les perdra. Continuer ?')){
    document.getElementById('ad-r-date').value=adReunionDate;return;
  }
  adReunionDate=date||todayStr();
  adRevueIdx=0;_adDirty=false;
  adRenderReunion();
}

function adRenderReunion(){
  const r=adReunions.find(x=>x.date_reunion===adReunionDate)||null;
  adReunionCourante=r;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||'';};
  const dr=document.getElementById('ad-r-date');if(dr)dr.value=adReunionDate||todayStr();
  if(!_adDirty){
    _adPointsCreches=Object.assign({},(r&&r.points_creches)||{});
    set('ad-r-heure',r&&r.heure);
    set('ad-r-presents',r&&r.presents);
    set('ad-r-excuses',r&&r.excuses);
    set('ad-r-prochaine',r&&r.prochaine_reunion);
    set('ad-r-points',r&&r.points);
    set('ad-r-divers',r&&r.divers);
  }
  const bc=document.getElementById('ad-r-cloturer');
  if(bc)bc.innerHTML=r&&r.cloturee?'<i class="ti ti-lock-open"></i> Rouvrir':'<i class="ti ti-lock"></i> Clôturer';
  const ne=document.getElementById('ad-new-echeance');
  if(ne&&!ne.value)ne.value=adEcheanceParDefaut();
  adMajEtat();
  adRenderRevue();
  /* On ne reprend la saisie en cours que s'il y a vraiment une saisie en cours.
     Sinon, en changeant de date, les zones de notes de la reunion precedente
     etaient relues dans le DOM et recopiees dans la nouvelle seance. */
  adRenderPointsCreches(_adDirty);
  adRenderNouvelles();
}

/* ── L'ordre du jour, site par site ─────────────────────────────────────────
   Un bloc de notes par crèche, dans l'ordre de la réunion, chacun rappelant
   ses actions ouvertes et permettant d'en ouvrir une nouvelle sans quitter le
   bloc — c'est au moment où la décision est prise qu'on la saisit, pas dix
   minutes plus tard quand on ne se souvient plus du site concerné.

   Les notes vivent dans _adPointsCreches, pas dans le DOM : un redessin (une
   action cochée pendant la séance) ne doit pas effacer ce qui vient d'être
   tapé. */
function adCapturePointsCreches(){
  document.querySelectorAll('#ad-r-points-creches textarea[data-creche]').forEach(t=>{
    _adPointsCreches[t.getAttribute('data-creche')]=t.value;
  });
}
function adPointsCrecheChange(id,val){_adPointsCreches[id]=val;adReunionDirty();}

/* Derniere note ecrite pour ce site lors d'une seance ANTERIEURE a celle
   affichee. Sert au bouton « Reprendre » : recopier le passe est parfois utile,
   mais c'est une decision, pas un effet de bord. */
function adNotesPrecedentes(crecheId){
  const l=(adReunions||[])
    .filter(r=>r.date_reunion<adReunionDate&&r.points_creches&&String(r.points_creches[crecheId]||'').trim())
    .sort((a,b)=>a.date_reunion<b.date_reunion?1:-1);
  return l.length?{date:l[0].date_reunion,texte:String(l[0].points_creches[crecheId])}:null;
}
function adReprendreNotes(crecheId){
  const p=adNotesPrecedentes(crecheId);if(!p)return;
  const actuel=String(_adPointsCreches[crecheId]||'').trim();
  if(actuel&&!confirm('Remplacer les notes deja saisies pour ce site par celles du '+adFmtDate(p.date)+' ?'))return;
  _adPointsCreches[crecheId]=p.texte;
  adReunionDirty();
  adRenderPointsCreches(false);
}

function adRenderPointsCreches(reprendreSaisie){
  const box=document.getElementById('ad-r-points-creches');if(!box)return;
  /* Par defaut on conserve ce qui est en train d'etre tape : un redessin
     (une action cochee en seance) ne doit pas effacer la saisie. */
  if(reprendreSaisie!==false)adCapturePointsCreches();
  const creches=adCrechesOrdonnees();
  if(!creches.length){box.innerHTML='<div class="meta-txt" style="font-style:italic">Aucune crèche enregistrée.</div>';return;}
  const ouvertes=adCache.filter(a=>!adEstClos(a.statut));
  box.innerHTML=creches.map((c,i)=>{
    const ouv=ouvertes.filter(a=>String(a.creche_id||'')===String(c.id));
    const enRetard=ouv.filter(a=>adRetard(a)>0).length;
    const nouv=adCache.filter(a=>a.reunion_date===adReunionDate&&String(a.creche_id||'')===String(c.id));
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--bg)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
        +'<span style="font-size:13px;font-weight:700;color:var(--koala)"><i class="ti ti-building"></i> '+(i+1)+'. '+escHtml(c.name)+'</span>'
        +'<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
          +(ouv.length?'<span class="badge b-ref">'+ouv.length+' action'+(ouv.length>1?'s':'')+' ouverte'+(ouv.length>1?'s':'')+'</span>':'')
          +(enRetard?'<span class="badge" style="background:var(--red-light);color:#c0392b">'+enRetard+' en retard</span>':'')
          +(nouv.length?'<span class="badge" style="background:var(--green-light);color:var(--green)">'+nouv.length+' décidée'+(nouv.length>1?'s':'')+' ce jour</span>':'')
          +(adNotesPrecedentes(c.id)?'<button class="btn-sm" style="font-size:11px;padding:4px 9px" title="Recopier ici les notes de ce site lors de la derniere seance ('+adFmtDate(adNotesPrecedentes(c.id).date)+')" onclick="adReprendreNotes(\''+c.id+'\')"><i class="ti ti-history"></i> Reprendre</button>':'')
          +'<button class="btn-sm" style="font-size:11px;padding:4px 9px" onclick="adAjoutDepuisBloc(\''+c.id+'\')"><i class="ti ti-plus"></i> Action</button>'
        +'</div>'
      +'</div>'
      +'<textarea class="finput" data-creche="'+c.id+'" rows="3" style="resize:vertical" placeholder="Sujets, échanges et décisions pour '+escHtml(c.name)+'…" '
        +'onchange="adPointsCrecheChange(\''+c.id+'\',this.value)">'+escHtml(_adPointsCreches[c.id]||'')+'</textarea>'
    +'</div>';
  }).join('');
}

/* Ouvre la fiche action pré-remplie sur le site du bloc et la réunion du jour. */
function adAjoutDepuisBloc(crecheId){
  adCapturePointsCreches();
  adOpenActionModal(null);
  const sel=document.getElementById('ad-f-creche');if(sel)sel.value=crecheId||'';
  const dr=document.getElementById('ad-f-reunion');if(dr)dr.value=adReunionDate||todayStr();
}

function adRevueStep(d){
  const l=adOuvertesReunion();if(!l.length)return;
  adRevueIdx=Math.min(Math.max(adRevueIdx+d,0),l.length-1);
  adRenderRevue();
}
function adRevueToggleMode(){
  adRevueTout=!adRevueTout;
  const b=document.getElementById('ad-revue-mode');
  if(b)b.innerHTML=adRevueTout?'<i class="ti ti-focus-2"></i> Une à une':'<i class="ti ti-layout-list"></i> Tout voir';
  adRenderRevue();
}
/* La bascule pose une classe sur l'écran entier ; la feuille de style fait le
   reste. La version précédente se contentait d'agrandir la police du
   conteneur — sans effet, les tailles en ligne l'emportant : le bouton ne
   faisait donc rien de visible. */
function adToggleProjection(force){
  adProjection=(typeof force==='boolean')?force:!adProjection;
  adAppliqueProjection();
  try{localStorage.setItem('adProjection',adProjection?'1':'0');}catch(e){}
  adRenderRevue();
}
function adAppliqueProjection(){
  const ecran=document.getElementById('main-actions');
  if(ecran)ecran.classList.toggle('ad-projection',adProjection);
  const b=document.getElementById('ad-r-projection');
  if(b){
    b.classList.toggle('on',adProjection);
    b.innerHTML='<i class="ti ti-device-tv'+(adProjection?'-off':'')+'"></i> '+(adProjection?'Quitter la projection':'Projection');
    b.title=adProjection?'Revenir à l\'affichage normal':'Gros caractères pour la vidéoprojection';
  }
}

function adRenderRevue(){
  const zone=document.getElementById('ad-revue-zone');if(!zone)return;
  const l=adOuvertesReunion();
  const cpt=document.getElementById('ad-revue-compteur');
  if(!l.length){
    if(cpt)cpt.textContent='';
    zone.innerHTML='<div class="empty-state" style="padding:20px"><i class="ti ti-circle-check" style="color:var(--green)"></i><p>Aucune action ouverte. La revue est faite — on peut passer aux sujets du jour.</p></div>';
    return;
  }
  if(adRevueIdx>=l.length)adRevueIdx=l.length-1;
  const groupes=adGrouperParCreche(l);
  if(adRevueTout){
    if(cpt)cpt.textContent=l.length+' action'+(l.length>1?'s':'')+' ouverte'+(l.length>1?'s':'');
    zone.innerHTML=groupes.map(g=>
      '<div style="margin-bottom:14px">'+adIntertitre(g,g.items.length)
      +'<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">'+g.items.map(a=>adRevueCardHtml(a,false)).join('')+'</div></div>'
    ).join('');
  }else{
    const a=l[adRevueIdx];
    // Où en est-on dans la traversée des sites : sans ce repère, on ne sait
    // pas si la crèche est finie ou s'il reste trois lignes derrière.
    const g=groupes.find(x=>x.items.indexOf(a)>=0)||{nom:'—',icone:'ti-building',items:[a]};
    const posG=g.items.indexOf(a)+1,iG=groupes.indexOf(g)+1;
    if(cpt)cpt.textContent='Action '+(adRevueIdx+1)+' / '+l.length;
    zone.innerHTML=adIntertitre(g,g.items.length,'Bloc '+iG+' / '+groupes.length+' · action '+posG+' sur '+g.items.length)
      +'<div style="margin-top:6px">'+adRevueCardHtml(a,true)+'</div>';
  }
}

function adIntertitre(g,n,detail){
  return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;font-weight:700;color:var(--koala);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1.5px solid var(--border);padding-bottom:5px">'
    +'<i class="ti '+g.icone+'"></i> '+escHtml(g.nom)
    +' <span style="color:var(--muted);font-weight:600;text-transform:none;letter-spacing:0">('+n+')</span>'
    +(detail?'<span style="margin-left:auto;color:var(--muted);font-weight:600;text-transform:none;letter-spacing:0">'+escHtml(detail)+'</span>':'')
    +'</div>';
}

function adRevueCardHtml(a,grand){
  const ret=adRetard(a),rest=adRestant(a),st=adStatutMeta(a.statut);
  const bord=ret>0?'var(--red)':(rest!==null&&rest<=7)?'var(--orange)':'var(--koala)';

  const btn=(s,lib,ico,couleur)=>'<button class="btn-sm" style="border-color:'+couleur+';color:'+couleur+'" onclick="adRevueStatut(\''+a.id+'\',\''+s+'\')"><i class="ti '+ico+'"></i> '+lib+'</button>';
  return '<div style="border:1.5px solid var(--border);border-left:4px solid '+bord+';border-radius:10px;padding:'+(grand?'16px':'12px')+';background:#fff">'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">'
      +'<span class="ad-num" style="font-weight:800;color:var(--muted)">N°'+(a.numero||'—')+'</span>'
      +'<span class="badge" style="background:'+st.bg+';color:'+st.fg+'">'+st.icon+' '+st.label+'</span>'
      +(a.theme?'<span class="badge b-ref">'+escHtml(a.theme)+'</span>':'')
      +(a.responsable?'<span class="badge b-ref"><i class="ti ti-user" style="font-size:11px"></i> '+escHtml(a.responsable)+'</span>':'')
      +(a.echeance?'<span class="badge" style="background:'+(ret>0?'var(--red-light)':'#f0f0f5')+';color:'+(ret>0?'#c0392b':'#666')+'">'
        +(ret>0?'⚠ '+ret+' j de retard — échéance '+adFmtDate(a.echeance):'échéance '+adFmtDate(a.echeance))+'</span>':'')
      +(a.reunion_date?'<span class="meta-txt">décidée le '+adFmtDate(a.reunion_date)+'</span>':'')
    +'</div>'
    +'<div class="ad-action-txt'+(grand?' grand':'')+'">'+escHtml(a.action||'')+'</div>'
    +'<label class="flabel">Suivi / commentaire</label>'
    +'<textarea class="finput" rows="2" style="resize:vertical" placeholder="Où en est-on ?" '
      +'onchange="adRevueSuivi(\''+a.id+'\',this.value)">'+escHtml(a.suivi||'')+'</textarea>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">'
      +btn('en_cours','En cours','ti-progress','var(--orange-dark)')
      +'<button class="btn-sm" onclick="adRevueReporter(\''+a.id+'\')"><i class="ti ti-calendar-plus"></i> Reporter</button>'
      +btn('fait','Faite','ti-check','var(--green)')
      +btn('abandonne','Abandonnée','ti-x','#888')
      +'<button class="btn-sm" onclick="adOpenActionModal(\''+a.id+'\')"><i class="ti ti-edit"></i> Modifier</button>'
    +'</div></div>';
}

/* Le commentaire part en base à la sortie du champ : en réunion, personne ne
   pense à cliquer sur « enregistrer » avant de passer à la ligne suivante. */
async function adRevueSuivi(id,val){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  const v=(val||'').trim()||null;
  if(v===(a.suivi||null))return;
  const{error}=await sb.from('actions_direction').update({suivi:v}).eq('id',id);
  if(error){showBanner('Commentaire non enregistré : '+error.message,'error');return;}
  a.suivi=v;
}

/* Après un changement de statut, la revue reste sur la même position : l'action
   close disparaît de la liste, donc l'index pointe déjà sur la suivante. */
async function adRevueStatut(id,statut){
  const l=adOuvertesReunion(),pos=l.findIndex(x=>String(x.id)===String(id));
  await adSetStatut(id,statut,true);
  const reste=adOuvertesReunion();
  if(adEstClos(statut))adRevueIdx=Math.min(pos<0?0:pos,Math.max(reste.length-1,0));
  else adRevueIdx=Math.min(pos<0?0:pos+1,Math.max(reste.length-1,0));
  adRenderReunion();
  showBanner('Action n°'+((adCache.find(x=>String(x.id)===String(id))||{}).numero||'')+' — '+adStatutMeta(statut).label.toLowerCase());
}

async function adRevueReporter(id){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  const base=a.echeance||adReunionDate||todayStr();
  const prop=(()=>{const d=new Date(base+'T12:00:00');d.setDate(d.getDate()+14);return ipDateToLocalISO(d);})();
  const saisie=prompt('Nouvelle échéance pour l\'action n°'+(a.numero||'')+' (AAAA-MM-JJ) :',prop);
  if(!saisie)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(saisie.trim())){showBanner('Date attendue au format AAAA-MM-JJ.','error');return;}
  const{error}=await sb.from('actions_direction').update({echeance:saisie.trim(),statut:'reporte',cloture_le:null}).eq('id',id);
  if(error){showBanner('Report refusé : '+error.message,'error');return;}
  a.echeance=saisie.trim();a.statut='reporte';a.cloture_le=null;
  adRenderTout();
  showBanner('Action n°'+(a.numero||'')+' reportée au '+adFmtDate(a.echeance)+'.');
}

// Les actions décidées pendant la réunion en cours
function adRenderNouvelles(){
  const box=document.getElementById('ad-new-list');if(!box)return;
  const l=adCache.filter(a=>a.reunion_date===adReunionDate).sort((a,b)=>(a.numero||0)-(b.numero||0));
  if(!l.length){box.innerHTML='<div class="meta-txt" style="font-style:italic">Aucune nouvelle action pour cette réunion.</div>';return;}
  // L'état de chaque action est visible ICI aussi : une ligne cochée ailleurs
  // (revue, tableau de bord d'une référente) doit se voir dans le
  // récapitulatif, sans quoi on relit en fin de séance une liste qui donne
  // tout pour à faire.
  box.innerHTML=adGrouperParCreche(l).map(g=>
    '<div>'+adIntertitre(g,g.items.length)+'<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">'+g.items.map(a=>{
    const st=adStatutMeta(a.statut),clos=adEstClos(a.statut);
    return '<div style="display:flex;gap:8px;align-items:center;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:'+(clos?'var(--bg)':'transparent')+'">'
    +'<div onclick="adRecapBascule(\''+a.id+'\')" style="cursor:pointer;flex-shrink:0" title="'+(clos?'Rouvrir cette action':'Marquer cette action faite')+'">'
      +'<i class="ti ti-'+(clos?'square-check-filled':'square')+'" style="font-size:19px;color:'+(clos?'var(--koala)':'var(--muted)')+'"></i></div>'
    +'<span style="font-weight:800;color:var(--muted);font-size:12px">N°'+(a.numero||'')+'</span>'
    +'<span style="flex:1;font-size:13px'+(clos?';text-decoration:line-through;color:var(--muted)':'')+'">'+escHtml(a.action||'')+'</span>'
    +'<span class="badge" style="background:'+st.bg+';color:'+st.fg+'">'+st.icon+' '+st.label+'</span>'
    +(a.responsable?'<span class="badge b-ref">'+escHtml(a.responsable)+'</span>':'')
    +(clos&&a.cloture_le?'<span class="meta-txt">close le '+adFmtDate(a.cloture_le)+'</span>'
       :(a.echeance?'<span class="meta-txt">'+adFmtDate(a.echeance)+'</span>':''))
    +'<button class="ibtn" onclick="adOpenActionModal(\''+a.id+'\')"><i class="ti ti-edit"></i></button>'
    +'</div>';}).join('')+'</div></div>').join('');
}

/* Cocher depuis le récapitulatif : même effet qu'ailleurs, l'action est close
   dans le suivi et sort de la revue. */
async function adRecapBascule(id){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  await adSetStatut(id,adEstClos(a.statut)?'en_cours':'fait');
}

async function adAjoutRapide(){
  const action=(document.getElementById('ad-new-action').value||'').trim();
  if(!action){document.getElementById('ad-new-action').focus();return;}
  const row={
    numero:adNumeroSuivant(),
    action:action,
    theme:document.getElementById('ad-new-theme').value||null,
    echeance:document.getElementById('ad-new-echeance').value||null,
    creche_id:(document.getElementById('ad-new-creche')||{}).value||null,
    reunion_date:adReunionDate||todayStr(),
    statut:'a_faire'
  };
  Object.assign(row,adRespDuFormulaire('ad-new'));
  const{data,error}=await sb.from('actions_direction').insert(row).select().single();
  if(error){showBanner('Ajout refusé : '+error.message,'error');return;}
  adCache.push(data);
  document.getElementById('ad-new-action').value='';
  adRenderFiltres();adRender();adRenderNouvelles();
  showBanner('Action n°'+data.numero+' ajoutée ✅');
}

async function adReunionEnregistrer(silencieux){
  adCapturePointsCreches();
  // On ne stocke que les sites réellement documentés : garder les blocs vides
  // gonflerait le jsonb d'une clé par crèche et par réunion, sans rien dire.
  const notes={};
  Object.keys(_adPointsCreches).forEach(k=>{const v=(_adPointsCreches[k]||'').trim();if(v)notes[k]=v;});
  const row={
    points_creches:notes,
    date_reunion:adReunionDate||todayStr(),
    heure:(document.getElementById('ad-r-heure').value||'').trim()||null,
    presents:(document.getElementById('ad-r-presents').value||'').trim()||null,
    excuses:(document.getElementById('ad-r-excuses').value||'').trim()||null,
    points:(document.getElementById('ad-r-points').value||'').trim()||null,
    divers:(document.getElementById('ad-r-divers').value||'').trim()||null,
    prochaine_reunion:document.getElementById('ad-r-prochaine').value||null
  };
  if(adReunionCourante)row.cloturee=adReunionCourante.cloturee;
  const{data,error}=await sb.from('reunions_direction').upsert(row,{onConflict:'date_reunion'}).select().single();
  if(error){showBanner('Enregistrement refusé : '+error.message,'error');return false;}
  adReunions=adReunions.filter(x=>x.date_reunion!==row.date_reunion);
  adReunions.push(data);
  adReunions.sort((a,b)=>String(b.date_reunion).localeCompare(String(a.date_reunion)));
  adReunionCourante=data;_adDirty=false;
  adMajEtat();adRenderCRList();
  if(!silencieux)showBanner('Réunion du '+adFmtDate(row.date_reunion)+' enregistrée ✅');
  return true;
}

async function adReunionCloturer(){
  if(!await adReunionEnregistrer(true))return;
  const nv=!adReunionCourante.cloturee;
  // On fige à la clôture, on efface à la réouverture : tant que la réunion est
  // rouverte, la revue peut encore changer, une photo serait un mensonge.
  const maj={cloturee:nv,actions_gel:nv?adSnapshot(adReunionCourante):null};
  const{error}=await sb.from('reunions_direction').update(maj).eq('id',adReunionCourante.id);
  if(error){showBanner('Opération refusée : '+error.message,'error');return;}
  Object.assign(adReunionCourante,maj);
  adRenderReunion();adRenderCRList();
  showBanner(nv?'Réunion clôturée — le compte rendu est consultable dans l\'onglet « Comptes rendus ».':'Réunion rouverte.');
}

// ── Vue 3 : les comptes rendus ────────────────────────────────────────────

function adRenderCRList(){
  const box=document.getElementById('ad-cr-list');if(!box)return;
  if(!adReunions.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-file-text"></i><p>Aucune réunion enregistrée. Le compte rendu se remplit depuis l\'onglet « Mode réunion ».</p></div>';
    return;
  }
  box.innerHTML=adReunions.map(r=>{
    const decidees=adCache.filter(a=>a.reunion_date===r.date_reunion);
    const closes=decidees.filter(a=>adEstClos(a.statut)).length;
    return '<div class="dcard" style="border-left:4px solid '+(r.cloturee?'var(--green)':'var(--orange)')+'">'
      +'<div class="dmeta">'
        +'<div class="dtop"><span class="dsubject">Réunion du '+adFmtDateLongue(r.date_reunion)+(r.heure?' — '+escHtml(r.heure):'')+'</span>'
        +'<span class="badge" style="background:'+(r.cloturee?'var(--green-light)':'var(--orange-light)')+';color:'+(r.cloturee?'var(--green)':'var(--orange-dark)')+'">'+(r.cloturee?'✅ Clôturée':'✏️ En cours')+'</span></div>'
        +(r.presents?'<div class="dbody"><strong>Présents :</strong> '+escHtml(r.presents)+(r.excuses?' · <em>Excusés : '+escHtml(r.excuses)+'</em>':'')+'</div>':'')
        +'<div class="dfoot">'
          +'<span class="badge b-ref">'+decidees.length+' action'+(decidees.length>1?'s':'')+' décidée'+(decidees.length>1?'s':'')+(decidees.length?' · '+closes+' close'+(closes>1?'s':''):'')+'</span>'
          +(r.prochaine_reunion?'<span class="meta-txt">prochaine réunion : '+adFmtDate(r.prochaine_reunion)+'</span>':'')
        +'</div>'
      +'</div>'
      +'<div class="dactions">'
        +'<button class="ibtn" title="Lire le compte rendu" onclick="adOpenCR(\''+r.date_reunion+'\')"><i class="ti ti-eye"></i></button>'
        +'<button class="ibtn" title="Imprimer / PDF" onclick="adExportCR(\''+r.date_reunion+'\')"><i class="ti ti-printer"></i></button>'
      +'</div></div>';
  }).join('');
}

function adOpenCR(date){
  const r=adReunions.find(x=>x.date_reunion===date);if(!r)return;
  _adCrVue=date;
  document.getElementById('ad-cr-title').textContent='Réunion du '+adFmtDateLongue(date);
  document.getElementById('ad-cr-body').innerHTML=adCRHtml(r,false);
  document.getElementById('modal-cr-wrap').classList.add('open');
}

function adCrRouvrir(){
  if(!_adCrVue)return;
  closeModal('modal-cr-wrap');
  adReunionDate=_adCrVue;_adDirty=false;adRevueIdx=0;
  adShowView('reunion',document.getElementById('ad-tab-reunion'));
}

/* Le corps du compte rendu, utilisé tel quel à l'écran et à l'impression.

   Il suit l'ordre réel de la séance : la revue des actions, puis les sujets
   crèche par crèche, puis les transverses. Chaque site porte ses notes ET les
   actions décidées pour lui — c'est ce qui permet, un mois plus tard,
   d'envoyer à une référente le seul passage qui la concerne. */
/* Quelles actions figurent dans le compte rendu d'une réunion : celles
   décidées ce jour-là, et la revue — ce qui était ouvert à ce moment, donc
   né avant et pas déjà clos avant. */
function adCRSelection(r){
  return{
    decidees:adCache.filter(a=>a.reunion_date===r.date_reunion)
      .sort((a,b)=>(a.numero||0)-(b.numero||0)),
    revue:adCache.filter(a=>
      a.reunion_date!==r.date_reunion
      && (!a.reunion_date||a.reunion_date<r.date_reunion)                    // pas née après
      && (!adEstClos(a.statut)||!a.cloture_le||a.cloture_le>=r.date_reunion)  // pas close avant
    ).sort((a,b)=>(a.numero||0)-(b.numero||0))
  };
}

/* La photographie prise à la clôture. Le retard y est figé lui aussi : c'est
   le seul moyen qu'il reste vrai, puisqu'il se recalcule partout ailleurs. */
function adPhoto(a){
  return{id:a.id,numero:a.numero,action:a.action,theme:a.theme,responsable:a.responsable,
    echeance:a.echeance,statut:a.statut,suivi:a.suivi,creche_id:a.creche_id,
    creche_nom:adCrecheName(a.creche_id)||null,reunion_date:a.reunion_date,retard_j:adRetard(a)};
}
function adSnapshot(r){
  const sel=adCRSelection(r);
  return{revue:sel.revue.map(adPhoto),decidees:sel.decidees.map(adPhoto),fige_le:todayStr()};
}

function adCRHtml(r,pourImpression){
  // Une réunion clôturée montre l'état photographié ce jour-là. Sans ça, un
  // compte rendu relu six mois plus tard racontait une réunion où tout était
  // déjà fait — le contraire de ce qui s'y était dit.
  const gel=(r.actions_gel&&r.actions_gel.revue)?r.actions_gel:null;
  const sel=gel?{revue:gel.revue,decidees:gel.decidees||[]}:adCRSelection(r);
  const decidees=sel.decidees,revue=sel.revue;
  const notes=r.points_creches||{};

  const h2=t=>'<h2 style="font-size:14px;color:#3D3580;margin:18px 0 6px">'+t+'</h2>';
  const h3=t=>'<h3 style="font-size:12.5px;color:#3D3580;margin:14px 0 4px">'+t+'</h3>';
  const vide=t=>'<p style="color:#888;font-style:italic;font-size:12px">'+t+'</p>';
  const texte=t=>'<div style="white-space:pre-wrap;font-size:12.5px;line-height:1.55">'+escHtml(t)+'</div>';

  const ligne=a=>{
    const st=adStatutMeta(a.statut),ret=(a.retard_j!==undefined&&a.retard_j!==null)?a.retard_j:adRetard(a);
    return '<tr>'
      +'<td style="white-space:nowrap">'+(a.numero||'')+'</td>'
      +'<td>'+escHtml(a.action||'')+(a.theme?'<br><span style="color:#888;font-size:.9em">'+escHtml(a.theme)+'</span>':'')+'</td>'
      +'<td style="white-space:nowrap">'+escHtml(a.responsable||'—')+'</td>'
      +'<td style="white-space:nowrap">'+(a.echeance?adFmtDate(a.echeance):'—')+(ret>0?'<br><span style="color:#c0392b;font-size:.9em">'+ret+' j de retard</span>':'')+'</td>'
      +'<td style="white-space:nowrap">'+st.label+'</td>'
      +'<td>'+escHtml(a.suivi||'')+'</td>'
    +'</tr>';
  };
  const table=liste=>
    '<table style="width:100%;border-collapse:collapse;margin-top:4px"><thead><tr style="background:#3D3580;color:#fff">'
    +['N°','Action / décision','Responsable','Échéance','Statut','Suivi'].map(x=>'<th style="padding:6px 8px;font-size:11px;text-align:left">'+x+'</th>').join('')
    +'</tr></thead><tbody>'+liste.map(ligne).join('')+'</tbody></table>';

  // 1. La revue, groupée comme on l'a menée.
  let s1=h2('1. Revue des actions en cours');
  if(!revue.length)s1+=vide('Aucune action n\'était ouverte au moment de cette réunion.');
  else adGrouperParCreche(revue).forEach(g=>{s1+=h3(escHtml(g.nom)+' <span style="color:#888;font-weight:400">('+g.items.length+')</span>')+table(g.items);});

  // 2. Les sites, un par un — y compris ceux sans rien à signaler : leur
  // silence est une information, et l'absence de ligne laisserait croire à un
  // oubli.
  let s2=h2('2. Sujets par crèche');
  const creches=adCrechesOrdonnees();
  if(!creches.length)s2+=vide('Aucune crèche enregistrée.');
  else creches.forEach((c,i)=>{
    const n=(notes[c.id]||'').trim();
    const acts=decidees.filter(a=>String(a.creche_id||'')===String(c.id));
    s2+=h3((i+1)+'. '+escHtml(c.name));
    s2+=n?texte(n):vide('Rien à signaler.');
    if(acts.length)s2+='<p style="font-size:11.5px;color:#888;margin-top:6px">Actions décidées pour ce site :</p>'+table(acts);
  });

  // 3 et 4. Le transverse, puis les divers.
  const transverses=decidees.filter(a=>!a.creche_id);
  let s3=h2('3. Sujets transverses');
  s3+=(r.points||'').trim()?texte(r.points):vide('Rien à signaler.');
  if(transverses.length)s3+='<p style="font-size:11.5px;color:#888;margin-top:6px">Actions transverses décidées :</p>'+table(transverses);

  let s4=h2('4. Points divers')+((r.divers||'').trim()?texte(r.divers):vide('—'));

  // 5. Le récapitulatif : la même matière qu'aux points 2 et 3, mais d'un seul
  // tenant — c'est la liste qu'on relit en fin de séance à voix haute.
  let s5=h2('5. Récapitulatif des nouvelles actions');
  s5+=decidees.length?table(decidees):vide('Aucune nouvelle action.');

  return '<div style="font-size:12.5px">'
    +'<table style="font-size:12.5px;margin-bottom:6px"><tbody>'
      +'<tr><td style="padding:2px 10px 2px 0;color:#888">Date</td><td><strong>'+adFmtDateLongue(r.date_reunion)+(r.heure?' — '+escHtml(r.heure):'')+'</strong></td></tr>'
      +'<tr><td style="padding:2px 10px 2px 0;color:#888">Présents</td><td>'+escHtml(r.presents||'—')+'</td></tr>'
      +'<tr><td style="padding:2px 10px 2px 0;color:#888">Excusés</td><td>'+escHtml(r.excuses||'—')+'</td></tr>'
    +'</tbody></table>'
    +adCRMentionEtat(r,gel)
    +s1+s2+s3+s4+s5
    +h2('Prochaine réunion')
    +'<p style="font-size:12.5px">'+(r.prochaine_reunion?adFmtDateLongue(r.prochaine_reunion):'à fixer')+'</p>'
    +'</div>';
}

/* Dire de quand date ce qu'on lit : sans cette ligne, impossible de
   distinguer un compte rendu figé d'un état recalculé ce matin. */
function adCRMentionEtat(r,gel){
  let t;
  if(gel)t='État des actions figé à la clôture de la réunion'+(gel.fige_le?', le '+adFmtDate(gel.fige_le):'')+'.';
  else if(r.cloturee)t='État des actions au jour de la relecture — cette réunion a été clôturée avant la mise en place du figeage.';
  else t='Réunion non clôturée : l\'état des actions est celui d\'aujourd\'hui et bougera encore.';
  return '<p style="font-size:11px;color:#888;font-style:italic;margin:2px 0 4px">'+t+'</p>';
}

/* Impression via une iframe cachée : même mécanique que les plannings, elle
   fonctionne sur tablette là où window.open est bloqué. */
async function adExportCR(date){
  let d=date||adReunionDate;
  // Depuis le mode réunion, on enregistre d'abord : imprimer un CR qui ne
  // contient pas les notes qu'on vient de taper serait le pire des pièges.
  if(!date){
    if(_adDirty&&!await adReunionEnregistrer(true))return;
    if(!adReunionCourante&&!await adReunionEnregistrer(true))return;
  }
  const r=adReunions.find(x=>x.date_reunion===d);
  if(!r){showBanner('Enregistrez d\'abord la réunion.','error');return;}
  const html='<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">'
    +'<title>CR réunion de direction — '+adFmtDate(d)+'</title><style>'
    +'*{margin:0;padding:0;box-sizing:border-box}'
    +'body{font-family:Arial,sans-serif;color:#111;padding:24px;max-width:800px;margin:0 auto}'
    +'h1{font-size:1.35rem;color:#3D3580;margin-bottom:2px}'
    +'.sub{font-size:.8rem;color:#666;margin-bottom:12px}'
    +'td{padding:6px 8px;border-bottom:1px solid #E7E5E0;font-size:11px;vertical-align:top}'
    +'tbody tr:nth-child(even) td{background:#F9F9F8}'
    +'.footer{margin-top:22px;font-size:10px;color:#888;border-top:1px solid #E7E5E0;padding-top:8px}'
    +'@media print{@page{margin:1.4cm;size:portrait}body{padding:0}h2{page-break-after:avoid}tr{page-break-inside:avoid}}'
    +'*{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}'
    +'</style></head><body>'
    +'<h1>Compte rendu — réunion de direction</h1>'
    +'<div class="sub">Koala Kids · '+adFmtDateLongue(d)+'</div>'
    +adCRHtml(r,true)
    +'<div class="footer">Document généré le '+new Date().toLocaleDateString('fr-FR')+' à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' — Koala Kids</div>'
    +'</body></html>';
  const old=document.getElementById('_print-frame-cr');if(old)old.remove();
  const iframe=document.createElement('iframe');
  iframe.id='_print-frame-cr';
  iframe.style.cssText='position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  doc.open();doc.write(html);doc.close();
  iframe.onload=()=>{try{iframe.contentWindow.focus();iframe.contentWindow.print();}catch(e){showBanner('Erreur impression : '+e.message,'error');}};
}

/* Export Excel : mêmes colonnes que le classeur d'origine, pour que le fichier
   reste échangeable avec le réseau. Le retard est une valeur calculée au jour
   de l'export, pas une formule — un tableur ouvert dans six mois afficherait
   sinon des retards inventés. */
function adExportExcel(){
  if(typeof XLSX==='undefined'){showBanner('Bibliothèque Excel non chargée.','error');return;}
  const l=adFiltered();
  if(!l.length){showBanner('Rien à exporter avec ce filtre.','error');return;}
  const aoa=[
    ['SUIVI DES ACTIONS — RÉUNIONS DE DIRECTION'],
    ['Koala Kids — export du '+new Date().toLocaleDateString('fr-FR')
      +' — '+({ouvertes:'actions non closes',retard:'actions en retard',closes:'actions closes',toutes:'toutes les actions'}[adFilter])],
    [],
    ['N°','Réunion du','Thème','Action / décision','Responsable','Échéance','Statut','Retard (j)','Suivi / commentaire','Date de clôture','Crèche']
  ];
  l.forEach(a=>aoa.push([
    a.numero||'',
    a.reunion_date?adFmtDate(a.reunion_date):'',
    a.theme||'',
    a.action||'',
    a.responsable||'',
    a.echeance?adFmtDate(a.echeance):'',
    adStatutMeta(a.statut).label,
    adRetard(a)||'',
    a.suivi||'',
    a.cloture_le?adFmtDate(a.cloture_le):'',
    adCrecheName(a.creche_id)||''
  ]));
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:5},{wch:12},{wch:18},{wch:52},{wch:18},{wch:12},{wch:12},{wch:10},{wch:44},{wch:14},{wch:18}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Suivi actions');
  XLSX.writeFile(wb,'suivi-actions-direction-'+todayStr()+'.xlsx');
  showBanner('Export Excel généré ✅');
}

/* ══════════════════════════════════════════════════════════════════════════
   LE PONT AVEC « À FAIRE »

   Une action décidée en réunion et dont je suis responsable doit se retrouver
   dans ma journée sans que j'aie à la recopier. Le choix fait ici est le
   MIROIR, pas la copie : l'écran « À faire » affiche les lignes de
   actions_direction telles quelles, et cocher la case écrit dans cette
   table-là. Une seule vérité, donc rien qui puisse diverger — l'inverse
   (dupliquer l'action en tâche) aurait créé deux lignes à clore, et la
   certitude qu'un jour l'une des deux mentirait.

   Ce qui remonte : mes actions ouvertes dont l'échéance est arrivée (celles du
   jour affiché et tout ce qui traîne derrière). Les échéances à venir restent
   dans l'écran Actions — l'À faire est la journée, pas le mois.
   ═════════════════════════════════════════════════════════════════════════ */

/* L'écran « À faire » s'ouvre souvent sans être passé par Actions : sans ce
   chargement paresseux, le bloc resterait vide jusqu'à la visite de l'onglet. */
async function adEnsureCharge(){
  // Ouvert aux référentes depuis 20-actions-referentes.sql : la RLS ne leur
  // renvoie que les actions dont elles sont responsables, la requête est donc
  // la même des deux côtés.
  if(!currentProfile||adCache.length||!adSchemaOk)return;
  const{data,error}=await sb.from('actions_direction').select('*').order('numero',{ascending:true});
  if(error){adSchemaOk=false;return;}
  adCache=data||[];
}

function adMesActions(){
  const moi=currentProfile&&currentProfile.id;
  if(!moi)return[];
  return adCache.filter(a=>!adEstClos(a.statut)&&String(a.responsable_referent_id||'')===String(moi));
}

function adRenderAfaireBloc(iso){
  const box=document.getElementById('af-actions-dir');if(!box)return;
  if(!isDirection||!adSchemaOk){box.innerHTML='';return;}
  const mine=adMesActions();
  const dues=mine.filter(a=>a.echeance&&a.echeance<=iso)
    .sort((a,b)=>String(a.echeance).localeCompare(String(b.echeance)));
  const sansEcheance=mine.filter(a=>!a.echeance).length;
  const aVenir=mine.filter(a=>a.echeance&&a.echeance>iso).length;
  if(!dues.length&&!sansEcheance&&!aVenir){box.innerHTML='';return;}

  const enRetard=dues.filter(a=>adRetard(a)>0).length;
  const pied=[];
  if(aVenir)pied.push(aVenir+' à venir');
  if(sansEcheance)pied.push(sansEcheance+' sans échéance');

  box.innerHTML='<div style="background:var(--card);border:1.5px solid '+(enRetard?'var(--red)':'var(--koala)')+';border-radius:10px;padding:10px 12px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:'+(dues.length?'8px':'0')+'">'
      +'<div style="font-size:11px;font-weight:700;color:var(--koala);text-transform:uppercase;letter-spacing:0.5px">'
        +'<i class="ti ti-target-arrow"></i> Mes actions de direction'
        +(enRetard?' <span style="color:var(--red)">· '+enRetard+' en retard</span>':'')+'</div>'
      +'<button class="btn-sm" style="font-size:11px;padding:4px 9px" onclick="showMain(\'actions\')"><i class="ti ti-external-link"></i> Voir le suivi</button>'
    +'</div>'
    +(dues.length
      ? '<div style="display:flex;flex-direction:column;gap:7px">'+dues.map(a=>adAfaireLigne(a)).join('')+'</div>'
      : '<div style="font-size:12px;color:var(--muted);font-style:italic">Rien à traiter aujourd\'hui.</div>')
    +(pied.length?'<div style="font-size:11px;color:var(--muted);margin-top:7px">'+pied.join(' · ')+'</div>':'')
  +'</div>';
}

function adAfaireLigne(a){
  const ret=adRetard(a),creche=adCrecheName(a.creche_id);
  return '<div style="display:flex;align-items:flex-start;gap:9px;background:var(--bg);border:1px solid '+(ret>0?'var(--red)':'var(--border)')+';border-radius:8px;padding:8px 10px">'
    +'<div onclick="adAfaireCocher(\''+a.id+'\')" style="cursor:pointer;flex-shrink:0;margin-top:1px" title="Marquer cette action faite">'
      +'<i class="ti ti-square" style="font-size:20px;color:var(--muted)"></i></div>'
    +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13.5px;font-weight:600">'+escHtml(a.action||'')+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;align-items:center">'
        +'<span class="meta-txt">N°'+(a.numero||'')+'</span>'
        +(a.theme?'<span class="badge b-ref">'+escHtml(a.theme)+'</span>':'')
        +(creche?'<span class="badge b-ref"><i class="ti ti-building" style="font-size:10px"></i> '+escHtml(creche)+'</span>':'')
        +(ret>0
          ? '<span class="badge" style="background:var(--red-light);color:#c0392b">⚠ '+ret+' j de retard</span>'
          : '<span class="badge" style="background:var(--orange-light);color:var(--orange-dark)">échéance ce jour</span>')
        +(a.reunion_date?'<span class="meta-txt">réunion du '+adFmtDate(a.reunion_date)+'</span>':'')
      +'</div>'
      +(a.suivi?'<div style="font-size:12px;color:var(--muted);margin-top:4px;white-space:pre-wrap">'+escHtml(a.suivi)+'</div>':'')
    +'</div>'
    +'<div style="display:flex;gap:2px;flex-shrink:0">'
      +'<button class="ibtn" title="Reporter l\'échéance" onclick="adAfaireReporter(\''+a.id+'\')"><i class="ti ti-calendar-plus"></i></button>'
      +'<button class="ibtn" title="Ouvrir l\'action" onclick="adOpenActionModal(\''+a.id+'\')"><i class="ti ti-edit"></i></button>'
    +'</div></div>';
}

/* Cocher ici clôt l'action dans le suivi : c'est tout l'intérêt du miroir.
   Le message le dit explicitement — sans quoi on croirait n'avoir rayé qu'une
   ligne de sa propre liste. */
async function adAfaireCocher(id){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  await adSetStatut(id,'fait',true);
  if(typeof afRender==='function')afRender();
  showBanner('Action n°'+(a.numero||'')+' marquée faite dans le suivi de direction ✅');
}

async function adAfaireReporter(id){
  await adRevueReporter(id);
  if(typeof afRender==='function')afRender();
}


/* ══════════════════════════════════════════════════════════════════════════
   CÔTÉ RÉFÉRENTE — « c'est fait »

   Une action attribuée à une référente ne pouvait être close que par la
   direction, sur ce qu'elle en disait en réunion : le tableau était donc
   toujours en retard d'une quinzaine sur la réalité. Elle voit maintenant ses
   propres actions dans son tableau de bord, et les coche elle-même.

   Ce qu'elle peut : passer une action en cours ou faite, et écrire le
   commentaire de suivi. Rien d'autre — ni l'intitulé, ni l'échéance, ni le
   rattachement. La restriction ne tient pas à l'écran (qui ne propose rien de
   plus) mais au trigger actions_direction_garde en base : une interface n'est
   jamais une sécurité.

   Reporter et abandonner restent à la direction : ce sont des arbitrages, pas
   un état constaté sur le terrain. */

function adRefMesActions(){
  const moi=currentProfile&&currentProfile.id;
  if(!moi)return[];
  return adCache.filter(a=>String(a.responsable_referent_id||'')===String(moi));
}

function adRenderRefDashBloc(){
  const box=document.getElementById('ref-dash-actions');if(!box)return;
  if(isDirection||!currentProfile){box.innerHTML='';return;}
  const toutes=adRefMesActions();
  const ouvertes=toutes.filter(a=>!adEstClos(a.statut)).sort(adTriEcheance);
  // Les actions closes récemment restent visibles quelques jours : sans ça,
  // cocher fait disparaître la ligne et on doute d'avoir bien cliqué.
  const recentes=toutes.filter(a=>adEstClos(a.statut)&&a.cloture_le&&adJoursDepuis(a.cloture_le)<=7)
    .sort((a,b)=>String(b.cloture_le).localeCompare(String(a.cloture_le)));
  if(!ouvertes.length&&!recentes.length){box.innerHTML='';return;}
  const enRetard=ouvertes.filter(a=>adRetard(a)>0).length;
  box.innerHTML='<div style="background:var(--card);border:1.5px solid '+(enRetard?'var(--red)':'var(--koala)')+';border-radius:10px;padding:11px 13px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--koala);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">'
      +'<i class="ti ti-target-arrow"></i> Actions qui me concernent'
      +(ouvertes.length?' <span style="color:var(--muted);font-weight:600;text-transform:none;letter-spacing:0">('+ouvertes.length+')</span>':'')
      +(enRetard?' <span style="color:var(--red)">· '+enRetard+' en retard</span>':'')+'</div>'
    +(ouvertes.length
      ? '<div style="display:flex;flex-direction:column;gap:8px">'+ouvertes.map(a=>adRefLigne(a,false)).join('')+'</div>'
      : '<div style="font-size:12px;color:var(--muted);font-style:italic">Rien en cours.</div>')
    +(recentes.length
      ? '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 6px">Terminées récemment</div>'
        +'<div style="display:flex;flex-direction:column;gap:8px">'+recentes.map(a=>adRefLigne(a,true)).join('')+'</div>'
      : '')
  +'</div>';
}

function adJoursDepuis(iso){
  const d=new Date(iso+'T12:00:00'),auj=new Date(todayStr()+'T12:00:00');
  return Math.round((auj-d)/86400000);
}

function adRefLigne(a,close){
  const ret=adRetard(a),rest=adRestant(a),creche=adCrecheName(a.creche_id);
  let ech='';
  if(close)ech='<span class="badge" style="background:var(--green-light);color:var(--green)">✅ faite le '+adFmtDate(a.cloture_le)+'</span>';
  else if(ret>0)ech='<span class="badge" style="background:var(--red-light);color:#c0392b">⚠ '+ret+' j de retard</span>';
  else if(a.echeance)ech='<span class="badge" style="background:'+(rest<=7?'var(--orange-light)':'#f0f0f5')+';color:'+(rest<=7?'var(--orange-dark)':'#666')+'">pour le '+adFmtDate(a.echeance)+'</span>';
  else ech='<span class="meta-txt" style="font-style:italic">sans échéance</span>';
  return '<div style="display:flex;align-items:flex-start;gap:9px;background:var(--bg);border:1px solid '+(!close&&ret>0?'var(--red)':'var(--border)')+';border-radius:8px;padding:9px 11px;opacity:'+(close?'0.72':'1')+'">'
    +'<div onclick="adRefBascule(\''+a.id+'\')" style="cursor:pointer;flex-shrink:0;margin-top:1px" title="'+(close?'Rouvrir cette action':'Marquer cette action faite')+'">'
      +'<i class="ti ti-'+(close?'square-check-filled':'square')+'" style="font-size:21px;color:'+(close?'var(--koala)':'var(--muted)')+'"></i></div>'
    +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13.5px;font-weight:600;'+(close?'text-decoration:line-through;color:var(--muted)':'')+'">'+escHtml(a.action||'')+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;align-items:center">'
        +'<span class="meta-txt">N°'+(a.numero||'')+'</span>'
        +(a.theme?'<span class="badge b-ref">'+escHtml(a.theme)+'</span>':'')
        +(creche?'<span class="badge b-ref"><i class="ti ti-building" style="font-size:10px"></i> '+escHtml(creche)+'</span>':'')
        +ech
        +(a.reunion_date?'<span class="meta-txt">décidée en réunion du '+adFmtDate(a.reunion_date)+'</span>':'')
      +'</div>'
      +(close?'':'<textarea class="finput" rows="1" style="resize:vertical;margin-top:6px;font-size:12.5px" '
        +'placeholder="Où en êtes-vous ? (visible par la direction)" '
        +'onchange="adRefSuivi(\''+a.id+'\',this.value)">'+escHtml(a.suivi||'')+'</textarea>')
      +(close&&a.suivi?'<div style="font-size:12px;color:var(--muted);margin-top:4px;white-space:pre-wrap">'+escHtml(a.suivi)+'</div>':'')
    +'</div></div>';
}

async function adRefBascule(id){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  const clos=adEstClos(a.statut);
  const maj=clos?{statut:'en_cours'}:{statut:'fait'};
  const{error}=await sb.from('actions_direction').update(maj).eq('id',id);
  if(error){showBanner('Mise à jour refusée : '+error.message,'error');return;}
  // La date de clôture est posée par la base (trigger), pas ici : on la
  // reflète pour l'affichage sans prétendre l'avoir décidée.
  a.statut=maj.statut;a.cloture_le=clos?null:(a.cloture_le||todayStr());
  adRenderRefDashBloc();
  showBanner(clos?'Action n°'+(a.numero||'')+' rouverte.':'Action n°'+(a.numero||'')+' signalée faite à la direction ✅');
}

async function adRefSuivi(id,val){
  const a=adCache.find(x=>String(x.id)===String(id));if(!a)return;
  const v=(val||'').trim()||null;
  if(v===(a.suivi||null))return;
  // Le statut accompagne le commentaire : une action commentée est une action
  // engagée, et la référente ne peut de toute façon pas la laisser « à faire ».
  const maj={suivi:v};
  if(a.statut==='a_faire'||a.statut==='reporte')maj.statut='en_cours';
  const{error}=await sb.from('actions_direction').update(maj).eq('id',id);
  if(error){showBanner('Commentaire non enregistré : '+error.message,'error');return;}
  Object.assign(a,maj);
  showBanner('Suivi transmis à la direction ✅');
  adRenderRefDashBloc();
}

window.adRecapBascule=adRecapBascule;window.adRenderRefDashBloc=adRenderRefDashBloc;window.adRefBascule=adRefBascule;window.adRefSuivi=adRefSuivi;

window.adPointsCrecheChange=adPointsCrecheChange;window.adAjoutDepuisBloc=adAjoutDepuisBloc;
window.adEnsureCharge=adEnsureCharge;window.adAfaireCocher=adAfaireCocher;window.adAfaireReporter=adAfaireReporter;
window.adRespSelChange=adRespSelChange;
window.adInit=adInit;window.adShowView=adShowView;window.adSetFilter=adSetFilter;window.adRender=adRender;
window.adOpenActionModal=adOpenActionModal;window.adSaveAction=adSaveAction;window.adSetStatut=adSetStatut;window.adDelete=adDelete;
window.adReunionCharger=adReunionCharger;window.adReunionDirty=adReunionDirty;window.adReunionEnregistrer=adReunionEnregistrer;
window.adReunionCloturer=adReunionCloturer;window.adRevueStep=adRevueStep;window.adRevueToggleMode=adRevueToggleMode;
window.adRevueStatut=adRevueStatut;window.adRevueSuivi=adRevueSuivi;window.adRevueReporter=adRevueReporter;
window.adAjoutRapide=adAjoutRapide;window.adOpenCR=adOpenCR;window.adCrRouvrir=adCrRouvrir;
window.adAppliqueProjection=adAppliqueProjection;window.adExportCR=adExportCR;window.adExportExcel=adExportExcel;window.adToggleProjection=adToggleProjection;


