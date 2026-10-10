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
  const selR=document.getElementById('ad-r-creche');
  if(selR)selR.innerHTML='<option value="">— Siège / non précisé —</option>'+optsC;
  const selRP=document.getElementById('ad-r-prochaine-creche');
  if(selRP)selRP.innerHTML='<option value="">— Siège / non précisé —</option>'+optsC;
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
  // Datalist des responsables : direction, directrices techniques, et les noms déjà saisis.
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
