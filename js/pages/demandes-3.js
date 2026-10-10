// ══════════════════════════════════════════════════════════════════════════
// BRIEFING DU JOUR — « Ce que j'ai à faire aujourd'hui »
//
// S'ouvre tout seul à la première connexion de la journée sur ce poste, juste
// après le tableau de bord. Il ne calcule rien de neuf : il rassemble au même
// endroit ce que les modules savent déjà (demandes, incidents, actions de
// direction, tâches À faire, événements, anniversaires), scopé à la crèche de
// la directrice technique connectée, ouvert au réseau entier pour la direction.
//
// La mémoire est locale au poste (localStorage, une clé par utilisateur et par
// jour) : rien n'est écrit en base, et un poste partagé ne prive pas la
// personne suivante de son briefing.
// ══════════════════════════════════════════════════════════════════════════

function brCleJour(){
  return 'kk-brief-'+((currentUser&&currentUser.id)||'anon')+'-'+todayStr();
}
function brBriefingAuto(){
  try{ if(localStorage.getItem(brCleJour()))return; }catch(e){}
  try{ localStorage.setItem(brCleJour(),'1'); }catch(e){}
  brBriefingOuvrir();
}
function brBriefingManuel(){ brBriefingOuvrir(); }
function brBriefingFermer(){ closeModal('modal-brief-wrap'); }
/* Bouton « Me le rappeler » : efface la marque « vu aujourd'hui » pour que le
   briefing s'ouvre de nouveau tout seul à la prochaine connexion, même le même
   jour — utile pour ne pas perdre de vue ce qui reste à faire. */
function brRappelProchaineFois(btn){
  try{ localStorage.removeItem(brCleJour()); }catch(e){}
  if(btn){btn.innerHTML='<i class="ti ti-check"></i> Rappel programmé';btn.disabled=true;}
  setTimeout(brBriefingFermer,900);
}
/* Aller sur un module depuis le briefing : on ferme d'abord, sinon l'écran
   ouvert reste caché derrière la fenêtre. */
function brAller(tab){ brBriefingFermer(); showMain(tab); }
/* Idem, mais pour ouvrir directement la fiche d'un enfant (dossier de
   familiarisation à relancer) : pas d'onglet dédié, le bouton vit dans la
   fiche elle-même. */
function brAllerEnfant(id){
  brBriefingFermer();
  showMain('enfants');
  if(typeof enfOpenFiche==='function')enfOpenFiche(id);
}
/* Les devis vivent dans inscriptions.html, une autre page : pas d'onglet à
   activer ici, on quitte carrément demandes.html. */
function brAllerInscriptions(){
  brBriefingFermer();
  location.href='inscriptions.html';
}

function brBriefingOuvrir(){
  const w=document.getElementById('modal-brief-wrap');if(!w)return;
  const t=todayStr();
  const d=new Date(t+'T12:00:00');
  const lbl=document.getElementById('br-date');
  if(lbl)lbl.textContent=d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const bonjour=document.getElementById('br-bonjour');
  const prenom=((currentProfile&&currentProfile.name)||'').split(' ')[0];
  if(bonjour)bonjour.textContent='Bonjour'+(prenom?' '+prenom:'');
  w.classList.add('open');
  brRender();
}

function brVide(msg){return '<div class="br-vide">'+msg+'</div>';}
function brSection(icone,titre,n,corps,accent){
  return '<div class="br-sec'+(accent?' br-'+accent:'')+'">'
    +'<div class="br-sec-t"><i class="ti ti-'+icone+'"></i> <span>'+titre+'</span>'
    +(n?'<span class="br-n">'+n+'</span>':'')+'</div>'+corps+'</div>';
}
function brLigne(txt,meta,tab,rouge){
  return '<div class="br-l'+(tab?' br-clic':'')+'"'+(tab?' onclick="brAller(\''+tab+'\')"':'')+'>'
    +'<span>'+txt+'</span>'
    +(meta?'<span class="br-meta'+(rouge?' br-rouge':'')+'">'+meta+'</span>':'')+'</div>';
}
/* Variante pour un clic personnalisé (ex. ouvrir directement une fiche
   plutôt qu'un onglet) : `onclickJs` est un appel JS déjà formé. */
function brLigneClic(txt,meta,onclickJs,rouge){
  return '<div class="br-l br-clic" onclick="'+onclickJs+'">'
    +'<span>'+txt+'</span>'
    +(meta?'<span class="br-meta'+(rouge?' br-rouge':'')+'">'+meta+'</span>':'')+'</div>';
}
function brNomCreche(id){const c=cacheCreches.find(x=>x.id===id);return c?c.name:'';}
function brSuffixeCreche(id){
  if(!isDirection)return'';
  const n=brNomCreche(id);
  return n?' <span class="br-cr">('+escHtml(n)+')</span>':' <span class="br-cr">(réseau)</span>';
}

// ── Alertes réutilisées par « Ma journée », le Tableau de bord réseau et
//    « Mon tableau de bord » (directrices techniques) : un seul calcul par famille
//    d'alerte, paramétré par crèche (null = réseau entier), pour ne pas
//    réécrire trois fois la même requête. ─────────────────────────────────

/* Vaccinations en retard. Charge cacheVaccinations si besoin — lazy-load
   partagé par les trois écrans, la cache une fois en mémoire pour la
   session. */
async function vaccinationsEnRetard(crecheId){
  if(typeof vacLoadData==='function'&&!cacheVaccinations.length)await vacLoadData();
  if(typeof vacAlertesRetard!=='function')return[];
  const enfants=crecheId?cacheEnfants.filter(e=>String(e.creche_id)===String(crecheId)):cacheEnfants;
  return vacAlertesRetard(enfants);
}

/* Dossiers de familiarisation envoyés depuis ≥ 5 jours, non expirés, et pas
   déjà relancés aujourd'hui (derniere_relance nulle ou antérieure à minuit) —
   inutile de stresser sur un dossier encore dans les temps ou déjà relancé. */
async function dossiersFamilleARelancer(crecheId){
  const seuil=new Date(Date.now()-5*86400000).toISOString();
  const debutJour=new Date();debutJour.setHours(0,0,0,0);
  const{data,error}=await sb.from('dossiers_familles')
    .select('*, enfants(prenom,nom,creche_id)')
    .in('statut',['envoye','en_cours'])
    .lte('envoye_le',seuil)
    .gt('expire_le',new Date().toISOString())
    .or('derniere_relance.is.null,derniere_relance.lt.'+debutJour.toISOString());
  if(error)throw error;
  return(data||[])
    .filter(d=>d.enfants&&(!crecheId||String(d.enfants.creche_id)===String(crecheId)))
    .sort((a,b)=>new Date(a.envoye_le)-new Date(b.envoye_le));
}

/* Devis envoyés depuis ≥ 5 jours, non expirés, pas déjà relancés aujourd'hui —
   même logique que les dossiers famille ci-dessus. devis a son propre
   creche_id : filtre serveur direct, pas besoin de passer par la
   préinscription. */
/* Préinscriptions dont la date « À relancer le » (module Inscriptions) est
   atteinte ou dépassée, dossier pas déjà clos — même règle que estARelancer()
   dans inscriptions.html. Le filtre crèche se fait côté client : une demande
   peut n'avoir qu'une liste de crèches souhaitées (creches_souhaitees), pas
   encore de crèche retenue (creche_id). */
async function demandesARelancer(crecheId){
  const t=todayStr();
  const{data,error}=await sb.from('preinscriptions')
    .select('id,prenom,nom,creche_id,creches_souhaitees,date_rappel,statut')
    .not('date_rappel','is',null)
    .lte('date_rappel',t)
    .not('statut','in','(inscrit,refuse,sans_suite)');
  if(error)throw error;
  return(data||[])
    .filter(p=>{
      if(!crecheId)return true;
      if(String(p.creche_id)===String(crecheId))return true;
      const souh=Array.isArray(p.creches_souhaitees)?p.creches_souhaitees:[];
      return souh.map(String).indexOf(String(crecheId))>=0;
    })
    .sort((a,b)=>String(a.date_rappel).localeCompare(String(b.date_rappel)));
}

/* Visites de crèche (module Devis) prévues dans les 7 prochains jours, pas
   encore effectuées, dossier ouvert. Même filtre crèche que ci-dessus. */
async function visitesAVenir(crecheId){
  const t=todayStr();
  const f=new Date();f.setDate(f.getDate()+7);
  const fin=f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0');
  const{data,error}=await sb.from('preinscriptions')
    .select('id,prenom,nom,creche_id,creches_souhaitees,date_visite,heure_visite,statut')
    .gte('date_visite',t).lte('date_visite',fin)
    .eq('visite_effectuee',false)
    .not('statut','in','(inscrit,refuse,sans_suite)');
  if(error)throw error;
  return(data||[])
    .filter(p=>{
      if(!crecheId)return true;
      if(String(p.creche_id)===String(crecheId))return true;
      const souh=Array.isArray(p.creches_souhaitees)?p.creches_souhaitees:[];
      return souh.map(String).indexOf(String(crecheId))>=0;
    })
    .sort((a,b)=>(String(a.date_visite)+(a.heure_visite||'')).localeCompare(String(b.date_visite)+(b.heure_visite||'')));
}

async function devisARelancer(crecheId){
  const seuil=new Date(Date.now()-5*86400000).toISOString();
  const debutJour=new Date();debutJour.setHours(0,0,0,0);
  let q=sb.from('devis')
    .select('*, preinscriptions(prenom,nom)')
    .eq('statut','envoye')
    .lte('envoye_le',seuil)
    .gt('expire_le',new Date().toISOString())
    .or('derniere_relance.is.null,derniere_relance.lt.'+debutJour.toISOString());
  if(crecheId)q=q.eq('creche_id',crecheId);
  const{data,error}=await q;
  if(error)throw error;
  return(data||[]).sort((a,b)=>new Date(a.envoye_le)-new Date(b.envoye_le));
}

/* Périodes d'essai (fiches Collaborateurs/trices) arrivant à échéance dans
   les 15 jours, ou déjà dépassées et pas encore actées — même fenêtre que
   les autres relances ci-dessus, mais calcul entièrement client (cacheEmployes
   est déjà chargée par loadAllData, pas besoin de requête dédiée). */
function periodesEssaiARelancer(crecheId){
  const seuil=ipDateToLocalISO(new Date(Date.now()+15*86400000));
  return cacheEmployes
    .filter(e=>e.date_debut&&!e.periode_essai_actee&&(!crecheId||String(e.creche_id)===String(crecheId)))
    .map(e=>Object.assign({},e,{_essaiFin:empPeriodeEssaiFin(e.date_debut,e.periode_essai_renouvelee,e.creche_id,e.type_contrat,e.date_fin)}))
    .filter(e=>e._essaiFin&&e._essaiFin<=seuil)
    .sort((a,b)=>a._essaiFin.localeCompare(b._essaiFin));
}

async function brRender(){
  const box=document.getElementById('br-body');if(!box)return;
  box.innerHTML=brVide('Chargement…');
  const t=todayStr();
  const maCreche=isDirection?null:((currentProfile&&currentProfile.creche_id)||null);
  const aMoi=id=>isDirection||id===maCreche;

  // ── Ce qui attend une réponse ──────────────────────────────────────────
  const dem=cacheDemandes.filter(d=>d.status==='attente'&&d.type!=='consigne'&&aMoi(d.creche_id));
  const urg=dem.filter(d=>d.priority==='urgent');
  const inc=cacheIncidents.filter(i=>!i.treated&&aMoi(i.creche_id));
  const graves=inc.filter(i=>i.severity==='grave');

  // ── Actions de direction échues (la RLS limite déjà les directrices techniques aux
  //    actions dont elles sont responsables) ────────────────────────────────
  let actEch=[];
  try{
    if(typeof adEnsureCharge==='function')await adEnsureCharge();
    const ouvertes=isDirection
      ?adCache.filter(a=>!adEstClos(a.statut))
      :(typeof adMesActions==='function'?adMesActions():[]);
    actEch=ouvertes.filter(a=>a.echeance&&a.echeance<=t).sort(adTriEcheance);
  }catch(e){console.warn('[briefing] actions',e);}

  // ── Tâches « À faire » du jour (module personnel de la direction) ──────
  let taches=[];
  if(isDirection){
    try{
      const{data,error}=await sb.from('taches_afaire').select('*').eq('date_jour',t);
      if(!error)taches=(data||[]).filter(x=>!x.fait);
    }catch(e){console.warn('[briefing] taches',e);}
  }

  // ── Le contexte du jour ────────────────────────────────────────────────
  const evts=cacheEvenements.filter(e=>{
    const s=e.date_debut,f=e.date_fin||e.date_debut;
    return s&&t>=s&&t<=f&&(isDirection||e.creche_id===maCreche||!e.creche_id);
  }).sort((a,b)=>(a.heure_debut||'').localeCompare(b.heure_debut||''));
  const md=t.slice(5);
  const bdays=cacheEnfants.filter(e=>e.dob&&e.dob.slice(5)===md&&aMoi(e.creche_id));

  // ── Stagiaires : les liens de dépôt qu'il est temps d'envoyer ──────────
  //
  // C'est la directrice technique qui suit sa stagiaire, pas seulement la direction : le
  // rappel doit donc arriver là où elle regarde le matin, et non dans un écran
  // qu'elle n'ouvre qu'une fois par mois. La RLS ne lui montre que sa crèche,
  // le filtre ci-dessous ne fait que le redire côté écran.
  //
  // Le module n'a pas forcément été ouvert aujourd'hui : on charge nous-mêmes
  // plutôt que d'afficher un zéro qui voudrait dire « pas encore lu ».
  let stgLiens=[];
  try{
    if(typeof stgLoad==='function'&&!stgCache.length)await stgLoad();
    if(typeof stgLienAEnvoyer==='function'){
      stgLiens=stgCache.filter(x=>
        (isDirection||String(x.creche_id||'')===String(maCreche||''))&&stgLienAEnvoyer(x));
    }
  }catch(e){console.warn('[briefing] stagiaires',e);}

  // ── Stagiaires : documents refusés ou manquants proche du début ────────
  // Deux cas distincts sur les fiches déjà suivies (lien envoyé ou stage
  // commencé, cf. stgEnSuivi) : une pièce refusée est toujours urgente,
  // une pièce obligatoire manquante ne l'est que si le début approche —
  // même fenêtre de 7 jours que le surlignage rouge des liens ci-dessus.
  let stgRefuses=[], stgManquants=[];
  try{
    if(typeof stgLoad==='function'&&!stgCache.length)await stgLoad();
    if(typeof stgEnSuivi==='function'&&typeof stgDocsDe==='function'&&typeof stgAvancement==='function'){
      const enSuivi=stgCache.filter(s=>
        (isDirection||String(s.creche_id||'')===String(maCreche||''))&&stgEnSuivi(s));
      enSuivi.forEach(s=>{
        if(stgDocsDe(s.id).some(d=>d.statut==='refuse')){
          stgRefuses.push(s);
        }else if(s.date_debut){
          const av=stgAvancement(s.id);
          const j=Math.round((new Date(String(s.date_debut).slice(0,10)+'T12:00:00')-new Date(t+'T12:00:00'))/86400000);
          if(av.total>av.faits&&j<=7)stgManquants.push({s,j});
        }
      });
    }
  }catch(e){console.warn('[briefing] documents stagiaires',e);}

  // ── Vaccinations en retard, dossiers famille et devis à relancer ───────
  // Les quatre requêtes sont indépendantes : parallélisées pour ne pas
  // allonger le temps d'ouverture perçu de la modale.
  const criblage=isDirection?null:maCreche;
  const[vaccRetard,dossiersRelance,devisRelance,demandesRelance]=await Promise.all([
    vaccinationsEnRetard(criblage).catch(e=>{console.warn('[briefing] vaccinations',e);return[];}),
    dossiersFamilleARelancer(criblage).catch(e=>{console.warn('[briefing] dossiers familles',e);return[];}),
    devisARelancer(criblage).catch(e=>{console.warn('[briefing] devis',e);return[];}),
    demandesARelancer(criblage).catch(e=>{console.warn('[briefing] demandes à relancer',e);return[];})
  ]);

  // ── En-tête : le compte de ce qui demande une action ───────────────────
  const nAction=urg.length+inc.length+actEch.length+taches.length+stgLiens.length
    +stgRefuses.length+stgManquants.length+vaccRetard.length+dossiersRelance.length+devisRelance.length
    +demandesRelance.length;
  const res=document.getElementById('br-resume');
  if(res){
    res.className='br-resume'+(nAction?' br-chaud':'');
    res.innerHTML=nAction
      ?'<i class="ti ti-alert-circle"></i> <strong>'+nAction+'</strong> point'+(nAction>1?'s':'')+' à traiter aujourd\'hui'
      :'<i class="ti ti-circle-check"></i> Rien d\'urgent aujourd\'hui — bonne journée !';
  }
  const badge=document.getElementById('btn-brief-n');
  if(badge){badge.textContent=nAction;badge.style.display=nAction?'':'none';}

  let h='';

  // 1. Tâches personnelles du jour
  if(isDirection){
    h+=brSection('checklist','Mes tâches du jour',taches.length,
      taches.length
        ?(typeof afSortTasks==='function'?afSortTasks(taches):taches).map(x=>{
            const meta=(typeof afTypeMeta==='function')?afTypeMeta(x.type):{icon:'✔️'};
            const cr=brNomCreche(x.creche_id);
            return brLigne((x.priorite==='urgente'?'🔴 ':'')+meta.icon+' '+escHtml(x.titre),escHtml(cr),'afaire');
          }).join('')
        :brVide('Aucune tâche notée pour aujourd\'hui'),
      taches.length?'accent':'');
  }

  // 2. Actions de direction arrivées à échéance
  h+=brSection('target-arrow','Actions à échéance',actEch.length,
    actEch.length
      ?actEch.slice(0,8).map(a=>{
          const r=(typeof adRetard==='function')?adRetard(a):0;
          return brLigne(escHtml(a.action||a.titre||'Action')+brSuffixeCreche(a.creche_id),
            r>0?'en retard de '+r+' j':'pour aujourd\'hui','actions',r>0);
        }).join('')+(actEch.length>8?'<div class="br-plus">+ '+(actEch.length-8)+' autres</div>':'')
      :brVide('Aucune action à échéance'),
    actEch.length?'accent':'');

  // 3. Demandes en attente
  h+=brSection('message-circle','Demandes en attente',dem.length,
    dem.length
      ?dem.slice(0,8).map(d=>{
          const age=Math.floor((new Date()-new Date(d.created_at))/86400000);
          return brLigne((d.priority==='urgent'?'🔴 ':'⏳ ')+escHtml(d.subject||d.theme||'Demande')+brSuffixeCreche(d.creche_id),
            age+' j','demands',d.priority==='urgent');
        }).join('')+(dem.length>8?'<div class="br-plus">+ '+(dem.length-8)+' autres</div>':'')
      :brVide('✅ Aucune demande en attente'),
    urg.length?'accent':'');

  // 4. Incidents non traités
  h+=brSection('alert-triangle','Incidents non traités',inc.length,
    inc.length
      ?inc.slice(0,8).map(i=>brLigne('🚨 '+escHtml(i.child_name||'Incident')+brSuffixeCreche(i.creche_id),
          i.severity==='grave'?'grave':(i.incident_date||''),'incidents',i.severity==='grave')).join('')
        +(inc.length>8?'<div class="br-plus">+ '+(inc.length-8)+' autres</div>':'')
      :brVide('✅ Aucun incident en attente'),
    graves.length?'accent':'');

  // 5. Stagiaires dont le lien de dépôt attend d'être envoyé
  h+=brSection('send','Stagiaires — liens à envoyer',stgLiens.length,
    stgLiens.length
      ?stgLiens.slice(0,8).map(x=>{
          const debut=(typeof stgDateFr==='function')?stgDateFr(x.date_debut):(x.date_debut||'');
          const j=x.date_debut
            ? Math.round((new Date(String(x.date_debut).slice(0,10)+'T12:00:00')-new Date(t+'T12:00:00'))/86400000)
            : null;
          const meta=(j===null)?debut
                    :(j>0?'arrive dans '+j+' j':(j===0?'arrive aujourd\'hui':'commencé depuis '+(-j)+' j'));
          const nom=(typeof stgNomComplet==='function')?stgNomComplet(x):((x.prenom||'')+' '+(x.nom||'')).trim();
          return brLigne('📨 '+escHtml(nom)+brSuffixeCreche(x.creche_id),meta,'stagiaires',j!==null&&j<=7);
        }).join('')+(stgLiens.length>8?'<div class="br-plus">+ '+(stgLiens.length-8)+' autres</div>':'')
      :brVide('✅ Aucun lien à envoyer'),
    stgLiens.length?'accent':'');

  // 5bis. Stagiaires : documents refusés ou manquants proche du début
  const stgDocsIssues=[
    ...stgRefuses.map(s=>({icon:'🚫',s,meta:'à corriger',rouge:true})),
    ...stgManquants.map(({s,j})=>({icon:'📎',s,
      meta:j<=0?'stage commencé':'dans '+j+' j',rouge:true}))
  ];
  h+=brSection('file-alert','Stagiaires — documents à traiter',stgDocsIssues.length,
    stgDocsIssues.length
      ?stgDocsIssues.slice(0,8).map(x=>
          brLigne(x.icon+' '+escHtml(stgNomComplet(x.s))+brSuffixeCreche(x.s.creche_id),x.meta,'stagiaires',x.rouge)
        ).join('')+(stgDocsIssues.length>8?'<div class="br-plus">+ '+(stgDocsIssues.length-8)+' autres</div>':'')
      :brVide('✅ Aucun document à traiter'),
    stgDocsIssues.length?'accent':'');

  // 5ter. Vaccinations en retard
  h+=brSection('vaccine','Vaccinations en retard',vaccRetard.length,
    vaccRetard.length
      ?vaccRetard.slice(0,8).map(({enfant,vacc,dose,s})=>{
          const nom=((enfant.prenom||'')+' '+(enfant.nom||'')).trim();
          return brLigne('💉 '+escHtml(nom)+' — '+escHtml(vacc.label)+' ('+dose.label+')'+brSuffixeCreche(enfant.creche_id),
            'retard de '+(-s.daysLeft)+' j','vaccinations',true);
        }).join('')+(vaccRetard.length>8?'<div class="br-plus">+ '+(vaccRetard.length-8)+' autres</div>':'')
      :brVide('✅ Aucune vaccination en retard'),
    vaccRetard.length?'accent':'');

  // 5quater. Dossiers de familiarisation à relancer
  h+=brSection('mail-forward','Dossiers familles à relancer',dossiersRelance.length,
    dossiersRelance.length
      ?dossiersRelance.slice(0,8).map(d=>{
          const nom=((d.enfants.prenom||'')+' '+(d.enfants.nom||'')).trim();
          const j=Math.floor((new Date()-new Date(d.envoye_le))/86400000);
          return brLigneClic('📎 '+escHtml(nom)+brSuffixeCreche(d.enfants.creche_id),
            'envoyé le '+j+' j'+(d.relances?', '+d.relances+' relance'+(d.relances>1?'s':''):''),
            'brAllerEnfant(\''+d.enfant_id+'\')',true);
        }).join('')+(dossiersRelance.length>8?'<div class="br-plus">+ '+(dossiersRelance.length-8)+' autres</div>':'')
      :brVide('✅ Aucun dossier à relancer'),
    dossiersRelance.length?'accent':'');

  // 5quinquies. Devis en attente de signature
  h+=brSection('file-invoice','Devis en attente de signature',devisRelance.length,
    devisRelance.length
      ?devisRelance.slice(0,8).map(d=>{
          const pre=d.preinscriptions||{};
          const nom=((pre.prenom||'')+' '+(pre.nom||'')).trim()||'Sans nom';
          const j=Math.floor((new Date()-new Date(d.envoye_le))/86400000);
          return brLigneClic('📄 '+escHtml(nom)+brSuffixeCreche(d.creche_id),
            'envoyé le '+j+' j'+(d.relances?', '+d.relances+' relance'+(d.relances>1?'s':''):''),
            'brAllerInscriptions()',true);
        }).join('')+(devisRelance.length>8?'<div class="br-plus">+ '+(devisRelance.length-8)+' autres</div>':'')
      :brVide('✅ Aucun devis à relancer'),
    devisRelance.length?'accent':'');

  // 5sexies. Préinscriptions à relancer (date « À relancer le » atteinte)
  h+=brSection('bell','Préinscriptions à relancer',demandesRelance.length,
    demandesRelance.length
      ?demandesRelance.slice(0,8).map(p=>{
          const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom';
          const j=Math.floor((new Date(t+'T12:00:00')-new Date(String(p.date_rappel).slice(0,10)+'T12:00:00'))/86400000);
          return brLigneClic('🔔 '+escHtml(nom)+brSuffixeCreche(p.creche_id),
            j>0?'depuis '+j+' j':'aujourd\'hui','brAllerInscriptions()',true);
        }).join('')+(demandesRelance.length>8?'<div class="br-plus">+ '+(demandesRelance.length-8)+' autres</div>':'')
      :brVide('✅ Aucune préinscription à relancer'),
    demandesRelance.length?'accent':'');

  // 6. Événements du jour
  h+=brSection('calendar-event','Événements du jour',evts.length,
    evts.length
      ?evts.map(e=>{
          const info=(typeof CAL_TYPE_INFO!=='undefined'&&CAL_TYPE_INFO[e.type])||{emoji:'📌'};
          const heure=e.heure_debut?e.heure_debut+(e.heure_fin?'–'+e.heure_fin:''):'';
          return brLigne(info.emoji+' '+escHtml(e.titre)+brSuffixeCreche(e.creche_id),heure,'evenements');
        }).join('')
      :brVide('Aucun événement'));

  // 7. Anniversaires
  h+=brSection('cake','Anniversaires',bdays.length,
    bdays.length
      ?bdays.map(e=>{
          const age=Number(t.slice(0,4))-Number(e.dob.slice(0,4));
          return brLigne('🎂 '+escHtml(((e.prenom||'')+' '+(e.nom||'')).trim())+brSuffixeCreche(e.creche_id),
            age+' an'+(age>1?'s':''),'enfants');
        }).join('')
      :brVide('Aucun anniversaire'));

  box.innerHTML=h;
}

window.brBriefingAuto=brBriefingAuto;
window.brBriefingManuel=brBriefingManuel;
window.brBriefingOuvrir=brBriefingOuvrir;
window.brBriefingFermer=brBriefingFermer;
window.brAller=brAller;
window.brAllerEnfant=brAllerEnfant;
window.brAllerInscriptions=brAllerInscriptions;
window.brRappelProchaineFois=brRappelProchaineFois;

