/* Recrutement d'un·e salarié·e en remplacement — Demandes › Équipe › Remplaçants/tes › onglet
   « Recrutement » (préfixe rc). Une fiche par candidat·e et un lien personnel (candidat.html?t=<jeton>)
   qui lui transmet : le projet pédagogique (page publique projet-pedagogique.html), des pièces jointes
   (fiche de poste… tirées de la bibliothèque ou propres à la fiche) et le questionnaire sur le projet :
   un quiz du projet quiz-protocoles (RC_QUESTIONNAIRE_URL), ouvert avec `ref` = id de la fiche ; son
   résultat est relu ici par `sbQuiz.rpc('kk_resultats_par_ref')`. Tables recrutement_* et bucket privé `recrutement`
   (sql/recrutement.sql, à appliquer à la main) ; page publique servie par l'edge function
   `dossier-candidat` ; e-mail du lien par `envoyer-lien-candidat`.
   Direction = toutes les crèches, référent·e = la sienne. Conservation : 2 ans après le dernier contact. */
const RC_BUCKET='recrutement';
const RC_LIEN_JOURS=21;
const RC_TAILLE_MAX=12*1024*1024;
const RC_CONSERVATION_JOURS=730;
const RC_STATUTS={
  candidature:{lib:'Candidature reçue',bg:'#EEEDF8',fg:'#3D3580'},
  entretien:{lib:'Entretien prévu',bg:'#FDF0E3',fg:'#B25F00'},
  retenu:{lib:'Retenu·e',bg:'#E8F5EC',fg:'#1B7A3E'},
  refuse:{lib:'Non retenu·e',bg:'#FDECEC',fg:'#C62828'},
  desiste:{lib:'S’est désisté·e',bg:'#EFEEF6',fg:'#78748C'}
};
/* À garder en phase avec QUESTIONNAIRE_URL de supabase/functions/_shared/recrutement-questionnaire.ts. */
const RC_QUESTIONNAIRE_URL='https://koalakids-app.github.io/quiz-protocoles/index.html?quiz=a1137575-4960-44a6-b11f-afa245f26687';
const RC_QUIZ_ADMIN_URL='https://koalakids-app.github.io/quiz-protocoles/admin.html';

let rcCands=[],rcDocs=[],rcEnvois=[];
let rcQuiz={};   // résultats du quiz par fiche : {<id>: [lignes de kk_resultats_par_ref] | 'erreur'}
let rcVue='liste',rcFicheId=null,rcOk=true,rcFiltre='cours',rcRetour='liste';
/* Planning des entretiens : remplissage automatique à partir des fiches (entretien_date / entretien_heure),
   créneaux de RC_RDV_DUREE min entre RC_RDV_DEBUT et RC_RDV_FIN, hors pause de midi. */
const RC_RDV_DUREE=45,RC_RDV_PAS=15,RC_RDV_PLAGES=[[9*60,12*60],[14*60,17*60]];
let rcSemaine=null,rcMinuteur=null;

const rcEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const rcDate=d=>d?new Date(String(d).length===10?d+'T12:00:00':d).toLocaleDateString('fr-FR'):'';
const rcVal=id=>((document.getElementById(id)||{}).value||'').trim();
const rcCrecheNom=id=>((cacheCreches.find(c=>String(c.id)===String(id))||{}).name)||'';
const rcFiche=()=>rcCands.find(c=>String(c.id)===String(rcFicheId))||null;
const rcLienValide=c=>!!(c&&c.token&&c.token_expire_le&&new Date(c.token_expire_le)>new Date()&&c.statut!=='refuse'&&c.statut!=='desiste');
const rcLienUrl=t=>location.origin+location.pathname.replace(/[^/]*$/,'')+'candidat.html?t='+t;
function rcToken(){
  const a=new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,32);
}
function rcExpiration(){const d=new Date();d.setDate(d.getDate()+RC_LIEN_JOURS);d.setHours(23,59,0,0);return d.toISOString();}
// Fiche close (non retenu·e, désisté·e) sans changement depuis 2 ans : à supprimer.
function rcASupprimer(c){
  if(c.statut!=='refuse'&&c.statut!=='desiste')return false;
  return (Date.now()-new Date(c.updated_at||c.created_at).getTime())/86400000>RC_CONSERVATION_JOURS;
}

async function rcInit(){
  rcVue='liste';rcFicheId=null;
  const z=document.getElementById('rc-contenu');
  if(z&&!rcCands.length)z.innerHTML='<p style="color:var(--muted);font-size:13px">Chargement…</p>';
  await rcCharger();
  rcRender();
  rcSurveiller();
}

async function rcCharger(){
  const [c,d,e]=await Promise.all([
    sb.from('recrutement_candidats').select('*').order('created_at',{ascending:false}),
    sb.from('recrutement_documents').select('*').order('libelle'),
    sb.from('recrutement_envois').select('*').order('created_at')
  ]);
  rcOk=!c.error;
  if(c.error)console.warn('[Recrutement]',c.error.message);
  rcCands=c.data||[];rcDocs=d.data||[];rcEnvois=e.data||[];
  rcNotifierConfirmations(false);
}

/* ------------------------------------------- NOTIFICATIONS DE CONFIRMATION */
/* Le push part déjà de l'edge function au moment de la confirmation (dossier-candidat). Ici : la bannière à
   l'écran — à l'ouverture (confirmations depuis la dernière visite) et pendant que l'onglet reste ouvert
   (relecture toutes les 60 s). Mémoire des confirmations déjà signalées : localStorage kk_rc_rdv_vus. */
function rcVus(){try{return JSON.parse(localStorage.getItem('kk_rc_rdv_vus')||'null');}catch(e){return null;}}
function rcVusEcrire(o){try{localStorage.setItem('kk_rc_rdv_vus',JSON.stringify(o));}catch(e){}}
function rcQuand(c){return rcDate(c.entretien_date)+(c.entretien_heure?' à '+String(c.entretien_heure).slice(0,5).replace(':','h'):'');}
function rcNotifierConfirmations(){
  const vus=rcVus(),maintenant={};
  const conf=rcCands.filter(c=>c.entretien_date&&c.rdv_confirme_le&&c.statut!=='refuse'&&c.statut!=='desiste');
  conf.forEach(c=>{maintenant[c.id]=c.rdv_confirme_le;});
  if(vus){
    const neufs=conf.filter(c=>vus[c.id]!==c.rdv_confirme_le);
    if(neufs.length)showBanner('✅ Rendez-vous confirmé : '+neufs.map(c=>rcEsc(c.prenom+' '+(c.nom||'')).trim()+' ('+rcQuand(c)+')').join(', '));
  }
  rcVusEcrire(maintenant);
}
function rcSurveiller(){
  if(rcMinuteur)return;
  rcMinuteur=setInterval(async()=>{
    const z=document.getElementById('rc-contenu');
    if(!z||z.offsetParent===null||document.hidden)return;
    const {data,error}=await sb.from('recrutement_candidats').select('*').order('created_at',{ascending:false});
    if(error||!data)return;
    const avant=JSON.stringify(rcCands.map(c=>[c.id,c.entretien_date,c.entretien_heure,c.rdv_confirme_le,c.statut]));
    rcCands=data;
    rcNotifierConfirmations();
    if(avant!==JSON.stringify(rcCands.map(c=>[c.id,c.entretien_date,c.entretien_heure,c.rdv_confirme_le,c.statut]))&&rcVue!=='fiche')rcRender();
  },60000);
}

function rcRender(){
  const z=document.getElementById('rc-contenu');
  if(!z)return;
  if(!rcOk){
    z.innerHTML='<p style="font-size:13px;color:var(--red)">Indisponible : le script <code>sql/recrutement.sql</code> n\'a pas encore été appliqué sur Supabase.</p>';
    return;
  }
  if(rcVue==='fiche')z.innerHTML=rcFicheHtml();
  else if(rcVue==='planning')z.innerHTML=rcPlanningHtml();
  else if(rcVue==='biblio')z.innerHTML=rcBiblioHtml();
  else z.innerHTML=rcListeHtml();
}
// La bibliothèque s'ouvre aussi depuis une fiche : on la garde pour le retour.
function rcAller(vue,id){if(vue==='fiche'&&(rcVue==='liste'||rcVue==='planning'))rcRetour=rcVue;rcVue=vue;if(vue==='fiche'||vue==='liste')rcFicheId=id||null;rcRender();const z=document.getElementById('rc-contenu');if(z&&z.scrollIntoView)z.scrollIntoView({block:'start'});}

/* ------------------------------------------------------------------ LISTE */
function rcBadge(c){
  const s=RC_STATUTS[c.statut]||RC_STATUTS.candidature;
  return '<span style="background:'+s.bg+';color:'+s.fg+';border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">'+s.lib+'</span>';
}
function rcPuce(ok,txt,icone){
  return '<span style="font-size:11px;color:'+(ok?'var(--green)':'var(--muted)')+';white-space:nowrap"><i class="ti ti-'+(ok?'circle-check':icone)+'"></i> '+txt+'</span>';
}
function rcSuiviHtml(c){
  const env=rcEnvois.filter(e=>String(e.candidat_id)===String(c.id));
  const lus=env.filter(e=>e.ouvert_le).length;
  let h='';
  h+=rcPuce(!!c.cv_path,c.cv_path?'CV':'CV manquant','id')+rcPuce(!!c.lettre_path,c.lettre_path?'Lettre':'Lettre manquante','mail-opened');
  if(!c.token)return h+rcPuce(false,'Lien pas encore créé','link-off');
  if(c.entretien_date)h+=rcPuce(!!c.rdv_confirme_le,c.rdv_confirme_le?'Rendez-vous confirmé le '+rcDate(c.rdv_confirme_le):'Rendez-vous pas encore confirmé','calendar-event');
  h+=rcPuce(!!c.lien_ouvert_le,c.lien_ouvert_le?'Lien ouvert le '+rcDate(c.lien_ouvert_le):(c.lien_envoye_le?'Lien envoyé le '+rcDate(c.lien_envoye_le)+', pas encore ouvert':'Lien créé, pas encore ouvert'),'link');
  if(c.avec_projet)h+=rcPuce(!!c.projet_ouvert_le,c.projet_ouvert_le?'Projet ouvert':'Projet pas encore ouvert','book');
  if(env.length)h+=rcPuce(lus===env.length,lus+'/'+env.length+' pièce'+(env.length>1?'s':'')+' ouverte'+(lus>1?'s':''),'paperclip');
  if(c.avec_questionnaire){
    const o=rcQuizSuivi(c).ouvert_le;
    h+=rcPuce(!!c.reponses_le,c.reponses_le?'Questionnaire rempli le '+rcDate(c.reponses_le):(o?'Questionnaire ouvert, pas encore confirmé':'Questionnaire en attente'),'pencil');
  }
  return h;
}
function rcListeHtml(){
  const sel=rcVal('rc-creche');
  let liste=rcCands.filter(c=>!sel||String(c.creche_id)===sel);
  const nbClos=liste.filter(c=>c.statut==='refuse'||c.statut==='desiste').length;
  if(rcFiltre==='cours')liste=liste.filter(c=>c.statut!=='refuse'&&c.statut!=='desiste');
  const perimes=rcCands.filter(rcASupprimer);
  let h='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'
    +(isDirection?'<select class="finput" id="rc-creche" style="width:auto;min-width:160px;font-size:12px;padding:4px 8px" onchange="rcRender()">'
      +'<option value="">Toutes les crèches</option>'+cacheCreches.map(c=>'<option value="'+c.id+'"'+(String(c.id)===sel?' selected':'')+'>'+rcEsc(c.name)+'</option>').join('')+'</select>':'')
    +'<select class="finput" style="width:auto;font-size:12px;padding:4px 8px" onchange="rcFiltre=this.value;rcRender()">'
    +'<option value="cours"'+(rcFiltre==='cours'?' selected':'')+'>Candidatures en cours</option>'
    +'<option value="tout"'+(rcFiltre==='tout'?' selected':'')+'>Toutes ('+nbClos+' close'+(nbClos>1?'s':'')+')</option></select>'
    +'<span style="flex:1"></span>'
    +'<button class="btn-sm" onclick="rcAller(\'planning\')"><i class="ti ti-calendar-week"></i> Planning des entretiens</button>'
    +'<a class="btn-sm" style="text-decoration:none" href="'+RC_QUESTIONNAIRE_URL+'" target="_blank" rel="noopener"><i class="ti ti-pencil"></i> Voir le questionnaire</a>'
    +'<button class="btn-sm" onclick="rcAller(\'biblio\')"><i class="ti ti-folder"></i> Documents à joindre ('+rcDocs.length+')</button>'
    +'<button class="btn-primary" onclick="rcNouveau()"><i class="ti ti-plus"></i> Nouvelle candidature</button>'
    +'</div>';
  if(perimes.length){
    h+='<div style="background:#FDF0E3;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#7A4300">'
      +'<i class="ti ti-clock-exclamation"></i> '+perimes.length+' candidature'+(perimes.length>1?'s closes':' close')+' depuis plus de 2 ans : '
      +perimes.map(c=>'<a href="#" onclick="rcAller(\'fiche\',\''+c.id+'\');return false" style="color:inherit;font-weight:700">'+rcEsc(c.prenom+' '+(c.nom||''))+'</a>').join(', ')
      +'. À supprimer (durée de conservation dépassée).</div>';
  }
  if(!liste.length){
    return h+'<div style="text-align:center;padding:34px 12px;color:var(--muted);font-size:13px"><i class="ti ti-user-search" style="font-size:34px;display:block;margin-bottom:8px"></i>'
      +'Aucune candidature'+(rcFiltre==='cours'?' en cours':'')+'.<br>Créez une fiche, joignez le projet pédagogique, la fiche de poste et le questionnaire, puis envoyez le lien.</div>';
  }
  h+='<div style="display:flex;flex-direction:column;gap:8px">'+liste.map(c=>
    '<div onclick="rcAller(\'fiche\',\''+c.id+'\')" style="cursor:pointer;background:#fff;border:1px solid var(--border);border-radius:10px;padding:11px 14px">'
    +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
    +'<b style="font-size:14px">'+rcEsc(c.prenom+' '+(c.nom||''))+'</b>'+rcBadge(c)
    +'<span style="font-size:12px;color:var(--muted)">'+rcEsc([c.poste,rcCrecheNom(c.creche_id)].filter(Boolean).join(' · '))+'</span>'
    +(c.entretien_date?'<span style="font-size:12px;color:var(--koala-dark)"><i class="ti ti-calendar-event"></i> Entretien le '+rcDate(c.entretien_date)+(c.entretien_heure?' à '+rcEsc(c.entretien_heure):'')+'</span>':'')
    +'</div>'
    +(c.remplace||c.date_debut?'<div style="font-size:12px;color:var(--muted);margin-top:3px">Remplacement'+(c.remplace?' de '+rcEsc(c.remplace):'')
      +(c.date_debut?' du '+rcDate(c.date_debut)+(c.date_fin?' au '+rcDate(c.date_fin):''):'')+'</div>':'')
    +'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px">'+rcSuiviHtml(c)+'</div>'
    +'</div>').join('')+'</div>';
  return h;
}

/* --------------------------------------------------------------- PLANNING */
const rcMin=h=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(h||''));return m?+m[1]*60+ +m[2]:null;};
const rcHeure=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const rcIso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function rcLundi(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
const rcActif=c=>c.statut!=='refuse'&&c.statut!=='desiste';
// Entretien déjà prévu sur la même crèche, qui chevauche [heure, heure + durée[.
function rcConflit(idExclu,creche,date,heure){
  const m=rcMin(heure);
  if(m==null)return null;
  return rcCands.find(x=>x.id!==idExclu&&rcActif(x)&&String(x.creche_id)===String(creche)&&x.entretien_date===date
    &&rcMin(x.entretien_heure)!=null&&Math.abs(rcMin(x.entretien_heure)-m)<RC_RDV_DUREE)||null;
}
// Premier créneau libre (jours ouvrés à partir de demain) de la crèche, sans chevaucher un autre entretien.
function rcCreneauLibre(idExclu,creche){
  const d=new Date();d.setHours(12,0,0,0);
  for(let j=0;j<90;j++){
    d.setDate(d.getDate()+1);
    if(d.getDay()===0||d.getDay()===6)continue;
    const iso=rcIso(d);
    for(const pl of RC_RDV_PLAGES)for(let m=pl[0];m+RC_RDV_DUREE<=pl[1];m+=RC_RDV_PAS){
      if(!rcConflit(idExclu,creche,iso,rcHeure(m)))return {date:iso,heure:rcHeure(m)};
    }
  }
  return null;
}
function rcRemplirCreneau(){
  const c=rcFiche(),creche=rcVal('rc-creche-f')||(c&&c.creche_id)||'';
  if(!creche)return showBanner('Choisissez d’abord la crèche.','error');
  const r=rcCreneauLibre(c&&c.id,creche);
  if(!r)return showBanner('Aucun créneau libre dans les 3 prochains mois.','error');
  document.getElementById('rc-ent-date').value=r.date;
  document.getElementById('rc-ent-heure').value=r.heure;
  showBanner('Créneau proposé : '+rcDate(r.date)+' à '+r.heure.replace(':','h')+' — pensez à enregistrer.');
}
// Planifie sans passer par la fiche : le statut passe à « Entretien prévu ».
async function rcPlanifierAuto(id){
  const c=rcCands.find(x=>String(x.id)===String(id));
  if(!c)return;
  const r=rcCreneauLibre(c.id,c.creche_id);
  if(!r)return showBanner('Aucun créneau libre dans les 3 prochains mois.','error');
  const maj={entretien_date:r.date,entretien_heure:r.heure,rdv_confirme_le:null,updated_at:new Date().toISOString()};
  if(c.statut==='candidature')maj.statut='entretien';
  const {data,error}=await sb.from('recrutement_candidats').update(maj).eq('id',c.id).select().single();
  if(error)return showBanner('Planification impossible : '+rcEsc(error.message),'error');
  Object.assign(c,data);
  await rcSyncEvenement(c);
  showBanner('Entretien de '+rcEsc(c.prenom)+' placé le '+rcDate(r.date)+' à '+r.heure.replace(':','h')+' ✅ — envoyez-lui le lien pour qu’il le confirme.');
  rcRender();
}
function rcSemaineAller(n){
  if(n===0)rcSemaine=rcLundi(new Date());
  else{rcSemaine=new Date(rcSemaine||rcLundi(new Date()));rcSemaine.setDate(rcSemaine.getDate()+7*n);}
  rcRender();
}
function rcPlanningHtml(){
  const lundi=rcSemaine||(rcSemaine=rcLundi(new Date()));
  const sel=rcVal('rc-creche');
  const liste=rcCands.filter(c=>rcActif(c)&&(!sel||String(c.creche_id)===sel));
  const jours=[0,1,2,3,4].map(i=>{const d=new Date(lundi);d.setDate(d.getDate()+i);return d;});
  const fin=new Date(lundi);fin.setDate(fin.getDate()+4);
  const aujourdhui=rcIso(new Date());
  const suivants=liste.filter(c=>c.entretien_date&&c.entretien_date>=aujourdhui);
  const nbConf=suivants.filter(c=>c.rdv_confirme_le).length;
  const aPlanifier=liste.filter(c=>!c.entretien_date&&c.statut!=='retenu');
  let h='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'
    +'<button class="btn-sm" onclick="rcAller(\'liste\')"><i class="ti ti-arrow-left"></i> Candidatures</button>'
    +(isDirection?'<select class="finput" id="rc-creche" style="width:auto;min-width:160px;font-size:12px;padding:4px 8px" onchange="rcRender()">'
      +'<option value="">Toutes les crèches</option>'+cacheCreches.map(c=>'<option value="'+c.id+'"'+(String(c.id)===sel?' selected':'')+'>'+rcEsc(c.name)+'</option>').join('')+'</select>':'')
    +'<span style="flex:1"></span>'
    +'<button class="btn-sm" onclick="rcSemaineAller(-1)" aria-label="Semaine précédente"><i class="ti ti-chevron-left"></i></button>'
    +'<b style="font-size:13px">'+jours[0].toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+' – '+fin.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})+'</b>'
    +'<button class="btn-sm" onclick="rcSemaineAller(1)" aria-label="Semaine suivante"><i class="ti ti-chevron-right"></i></button>'
    +'<button class="btn-sm" onclick="rcSemaineAller(0)">Cette semaine</button></div>';
  h+='<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Rempli automatiquement à partir des fiches : '+suivants.length+' entretien'+(suivants.length>1?'s':'')+' à venir, dont '
    +nbConf+' confirmé'+(nbConf>1?'s':'')+' par la personne. Vous êtes prévenu·e (notification et bannière) dès qu’un rendez-vous est confirmé.</p>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">'+jours.map(d=>{
    const iso=rcIso(d);
    const rdvs=liste.filter(c=>c.entretien_date===iso).sort((a,b)=>String(a.entretien_heure||'99').localeCompare(String(b.entretien_heure||'99')));
    return '<div style="background:'+(iso===aujourdhui?'#FFF8F0':'#fff')+';border:1px solid '+(iso===aujourdhui?'var(--koala)':'var(--border)')+';border-radius:10px;padding:8px;min-height:90px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:6px;text-transform:capitalize">'+d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})+'</div>'
      +(rdvs.length?rdvs.map(c=>{
        const ok=!!c.rdv_confirme_le;
        return '<div onclick="rcAller(\'fiche\',\''+c.id+'\')" style="cursor:pointer;border-left:4px solid '+(ok?'var(--green)':'#F47920')+';background:'+(ok?'#E8F5EC':'#FDF0E3')+';border-radius:6px;padding:5px 7px;margin-bottom:5px;font-size:12px">'
          +'<b>'+(c.entretien_heure?rcEsc(String(c.entretien_heure).slice(0,5).replace(':','h')):'heure ?')+'</b> '+rcEsc(c.prenom+' '+(c.nom||'').slice(0,1)+(c.nom?'.':''))
          +'<div style="font-size:11px;color:var(--muted)">'+rcEsc([c.poste,sel?'':rcCrecheNom(c.creche_id)].filter(Boolean).join(' · '))+'</div>'
          +'<div style="font-size:11px;font-weight:700;color:'+(ok?'var(--green)':'#B25F00')+'"><i class="ti ti-'+(ok?'circle-check':'clock')+'"></i> '+(ok?'Confirmé':'À confirmer')+'</div></div>';
      }).join(''):'<div style="font-size:11.5px;color:var(--muted)">Libre</div>')+'</div>';
  }).join('')+'</div>';
  const horsSemaine=suivants.filter(c=>c.entretien_date>rcIso(fin));
  if(horsSemaine.length)h+=rcBloc('Entretiens des semaines suivantes','calendar-event',horsSemaine.sort((a,b)=>(a.entretien_date+(a.entretien_heure||'')).localeCompare(b.entretien_date+(b.entretien_heure||''))).slice(0,15).map(c=>
    '<div onclick="rcAller(\'fiche\',\''+c.id+'\')" style="cursor:pointer;font-size:12.5px;padding:3px 0"><b>'+rcEsc(rcQuand(c))+'</b> · '+rcEsc(c.prenom+' '+(c.nom||''))+' '
    +'<span style="color:'+(c.rdv_confirme_le?'var(--green)':'#B25F00')+';font-size:11.5px">'+(c.rdv_confirme_le?'confirmé':'à confirmer')+'</span></div>').join(''));
  h+=rcBloc('Candidatures à planifier','wand',aPlanifier.length?'<p style="font-size:12px;color:var(--muted);margin:0 0 8px">« Planifier » place l’entretien au premier créneau libre de la crèche ('+RC_RDV_DUREE+' min, du lundi au vendredi, 9h–12h et 14h–17h) ; vous pouvez ensuite le déplacer dans la fiche.</p>'
    +aPlanifier.map(c=>'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 0"><b style="font-size:13px">'+rcEsc(c.prenom+' '+(c.nom||''))+'</b>'
      +'<span style="font-size:12px;color:var(--muted);flex:1">'+rcEsc([c.poste,rcCrecheNom(c.creche_id)].filter(Boolean).join(' · '))+'</span>'
      +'<button class="btn-sm" onclick="rcPlanifierAuto(\''+c.id+'\')"><i class="ti ti-wand"></i> Planifier</button></div>').join('')
    :'<p style="font-size:12.5px;color:var(--muted);margin:0">Toutes les candidatures en cours ont un entretien.</p>');
  return h;
}

/* ------------------------------------------------------------------ FICHE */
function rcNouveau(){rcAller('fiche',null);}
function rcChamp(lib,html,large){
  return '<label style="display:block;font-size:11.5px;font-weight:700;color:var(--muted)'+(large?';grid-column:1/-1':'')+'">'+lib+html+'</label>';
}
function rcInput(id,val,type,extra){
  return '<input class="finput" id="'+id+'" type="'+(type||'text')+'" value="'+rcEsc(val||'')+'" style="width:100%;margin-top:3px" '+(extra||'')+'>';
}
function rcBloc(titre,icone,contenu){
  return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-top:12px">'
    +'<div style="font-weight:700;font-size:13.5px;margin-bottom:8px"><i class="ti ti-'+icone+'" style="color:var(--koala)"></i> '+titre+'</div>'+contenu+'</div>';
}
function rcFicheHtml(){
  const c=rcFiche()||{statut:'candidature',creche_id:(currentProfile&&currentProfile.creche_id)||''};
  const neuf=!c.id;
  let h='<button class="btn-sm" onclick="rcAller(rcRetour)"><i class="ti ti-arrow-left"></i> Retour '+(rcRetour==='planning'?'au planning':'à la liste')+'</button>';
  h+=rcBloc(neuf?'Nouvelle candidature':rcEsc(c.prenom+' '+(c.nom||''))+' '+rcBadge(c),'user-search',
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">'
    +rcChamp('Civilité','<select class="finput" id="rc-civilite" style="width:100%;margin-top:3px">'
      +[['Mme','Mme'],['M.','M.'],['','Aucune (prénom et nom)']].map(o=>'<option value="'+o[0]+'"'+((c.civilite==null?'Mme':c.civilite)===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
    +rcChamp('Prénom *',rcInput('rc-prenom',c.prenom,'text','maxlength="80"'))
    +rcChamp('Nom',rcInput('rc-nom',c.nom,'text','maxlength="80"'))
    +rcChamp('E-mail',rcInput('rc-email',c.email,'email','maxlength="160"'))
    +rcChamp('Téléphone',rcInput('rc-tel',c.telephone,'tel','maxlength="30"'))
    +rcChamp('Crèche *','<select class="finput" id="rc-creche-f" style="width:100%;margin-top:3px"'+(isDirection?'':' disabled')+'>'
      +(isDirection?'<option value="">-- Choisir --</option>':'')
      +cacheCreches.filter(x=>isDirection||String(x.id)===String(c.creche_id)).map(x=>'<option value="'+x.id+'"'+(String(x.id)===String(c.creche_id)?' selected':'')+'>'+rcEsc(x.name)+'</option>').join('')+'</select>')
    +rcChamp('Type de candidature',rcInput('rc-type',c.type_candidature,'text','maxlength="120" list="rc-types" placeholder="candidature spontanée"')
      +'<datalist id="rc-types"><option value="candidature spontanée"><option value="candidature à notre annonce"><option value="candidature transmise par France Travail"><option value="candidature recommandée"></datalist>')
    +rcChamp('Poste proposé',rcInput('rc-poste',c.poste,'text','maxlength="120" placeholder="ex. Auxiliaire de puériculture"'))
    +rcChamp('Personne remplacée / motif',rcInput('rc-remplace',c.remplace,'text','maxlength="160" placeholder="ex. Julie M. (congé maternité)"'))
    +rcChamp('Statut','<select class="finput" id="rc-statut" style="width:100%;margin-top:3px">'
      +Object.keys(RC_STATUTS).map(k=>'<option value="'+k+'"'+(k===c.statut?' selected':'')+'>'+RC_STATUTS[k].lib+'</option>').join('')+'</select>')
    +rcChamp('Début du remplacement',rcInput('rc-debut',c.date_debut,'date'))
    +rcChamp('Fin prévue',rcInput('rc-fin',c.date_fin,'date'))
    +rcChamp('Entretien le',rcInput('rc-ent-date',c.entretien_date,'date'))
    +rcChamp('à',rcInput('rc-ent-heure',c.entretien_heure,'time'))
    +'<div style="display:flex;align-items:flex-end"><button type="button" class="btn-sm" onclick="rcRemplirCreneau()" title="Choisit le premier créneau libre du planning de la crèche"><i class="ti ti-wand"></i> Premier créneau libre</button></div>'
    +rcChamp('Notes internes (jamais visibles par la personne)','<textarea class="finput" id="rc-notes" rows="3" maxlength="4000" style="width:100%;margin-top:3px;resize:vertical">'+rcEsc(c.notes||'')+'</textarea>',true)
    +'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">'
    +'<button class="btn-primary" onclick="rcEnregistrer()"><i class="ti ti-device-floppy"></i> '+(neuf?'Créer la fiche':'Enregistrer')+'</button>'
    +(neuf?'<span style="font-size:11.5px;color:var(--muted)">Le lien et les pièces jointes se préparent une fois la fiche créée.</span>'
      :'<span style="flex:1"></span><button class="btn-sm" style="color:var(--red)" onclick="rcSupprimer()"><i class="ti ti-trash"></i> Supprimer la fiche</button>')
    +'</div>'
    +(c.statut==='retenu'?'<p style="font-size:12px;color:var(--green);margin:10px 0 0"><i class="ti ti-circle-check"></i> Candidature retenue : créez sa fiche dans <b>Collaborateurs/trices</b>, puis ses créneaux dans le planning des remplaçants/tes.</p>':'')
    +(!neuf&&rcASupprimer(c)?'<p style="font-size:12px;color:#B25F00;margin:10px 0 0"><i class="ti ti-clock-exclamation"></i> Fiche close depuis plus de 2 ans : à supprimer.</p>':''));
  if(neuf)return h;
  h+=rcBloc('CV et lettre de motivation','file-description',rcCandidatureHtml(c));
  h+=rcBloc('Ce que contient le lien','paperclip',rcContenuHtml(c));
  h+=rcBloc('Lien à envoyer','link',rcLienHtml(c));
  if(c.avec_questionnaire||c.reponses_le)h+=rcBloc('Questionnaire sur le projet','message-2','<div id="rc-quiz">'+rcQuizHtml(c)+'</div>');
  return h;
}

async function rcEnregistrer(){
  const c=rcFiche();
  const prenom=rcVal('rc-prenom'),creche=rcVal('rc-creche-f')||(c&&c.creche_id)||'';
  if(!prenom)return showBanner('Le prénom est obligatoire.','error');
  if(!creche)return showBanner('Choisissez la crèche.','error');
  const email=rcVal('rc-email');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return showBanner('Adresse e-mail incorrecte.','error');
  const row={
    civilite:rcVal('rc-civilite'),type_candidature:rcVal('rc-type')||null,
    prenom,nom:rcVal('rc-nom')||null,email:email||null,telephone:rcVal('rc-tel')||null,creche_id:creche,
    poste:rcVal('rc-poste')||null,remplace:rcVal('rc-remplace')||null,statut:rcVal('rc-statut')||'candidature',
    date_debut:rcVal('rc-debut')||null,date_fin:rcVal('rc-fin')||null,
    entretien_date:rcVal('rc-ent-date')||null,entretien_heure:rcVal('rc-ent-heure')||null,
    notes:rcVal('rc-notes')||null,updated_at:new Date().toISOString()
  };
  if(row.entretien_date&&row.entretien_heure&&row.statut!=='refuse'&&row.statut!=='desiste'){
    const pris=rcConflit(c&&c.id,creche,row.entretien_date,row.entretien_heure);
    if(pris&&!confirm('Ce créneau chevauche l\'entretien de '+pris.prenom+' '+(pris.nom||'')+' ('+rcQuand(pris)+').\n\nEnregistrer quand même ?'))return;
  }
  // Un rendez-vous déplacé n'est plus confirmé.
  if(c&&(String(c.entretien_date||'')!==String(row.entretien_date||'')||String(c.entretien_heure||'')!==String(row.entretien_heure||'')))row.rdv_confirme_le=null;
  if(c){
    const {data,error}=await sb.from('recrutement_candidats').update(row).eq('id',c.id).select().single();
    if(error)return showBanner('Enregistrement impossible : '+rcEsc(error.message),'error');
    Object.assign(c,data);
    await rcSyncEvenement(c);
    showBanner('Fiche enregistrée ✅');
  }else{
    row.created_by=(currentProfile&&currentProfile.name)||null;
    const {data,error}=await sb.from('recrutement_candidats').insert(row).select().single();
    if(error)return showBanner('Création impossible : '+rcEsc(error.message),'error');
    rcCands.unshift(data);rcFicheId=data.id;
    await rcSyncEvenement(data);
    showBanner('Fiche créée ✅ — préparez maintenant le lien.');
  }
  rcRender();
}

async function rcSupprimer(){
  const c=rcFiche();
  if(!c)return;
  if(!confirm('Supprimer la candidature de '+c.prenom+' '+(c.nom||'')+' ?\n\nLa fiche, ses réponses au questionnaire et ses pièces jointes propres sont effacées. Son lien cesse de fonctionner. Action définitive.'))return;
  const propres=rcEnvois.filter(e=>String(e.candidat_id)===String(c.id)&&!e.document_id).map(e=>e.path);
  const {error}=await sb.from('recrutement_candidats').delete().eq('id',c.id);
  if(error)return showBanner('Suppression impossible : '+rcEsc(error.message),'error');
  if(propres.length)await sb.storage.from(RC_BUCKET).remove(propres);
  const pj=[c.cv_path,c.lettre_path].filter(Boolean);
  if(pj.length)await sb.storage.from(RC_BUCKET).remove(pj);
  if(typeof cacheEvenements!=='undefined'){cacheEvenements=cacheEvenements.filter(e=>String(e.candidat_id)!==String(c.id));if(typeof renderCalendar==='function')renderCalendar();}
  rcCands=rcCands.filter(x=>x.id!==c.id);
  rcEnvois=rcEnvois.filter(e=>String(e.candidat_id)!==String(c.id));
  showBanner('Candidature supprimée.');
  rcAller('liste');
}

/* ------------------------------------------- ENTRETIEN → CALENDRIER / PLANNING */
/* L'entretien est reporté dans `evenements` (type « recrutement », evenements.candidat_id) : il apparaît dans
   le calendrier du réseau et dans la ligne « Entretiens de recrutement » du planning du coordinateur
   (pgEntretiensRecrutDuJour). Titre « ✅ » une fois confirmé par la personne (aussi mis à jour par l'edge function
   dossier-candidat). Best-effort : la fiche est déjà enregistrée. sql/recrutement_planning_cv.sql. */
async function rcSyncEvenement(c){
  if(!c||!c.id)return;
  try{
    const {data:ex,error:eEx}=await sb.from('evenements').select('id').eq('candidat_id',c.id).maybeSingle();
    if(eEx)throw eEx;
    if(!c.entretien_date||!rcActif(c)){
      if(ex){
        const {error}=await sb.from('evenements').delete().eq('id',ex.id);if(error)throw error;
        if(typeof cacheEvenements!=='undefined')cacheEvenements=cacheEvenements.filter(e=>e.id!==ex.id);
        rcRafraichirAgendas();
      }
      return;
    }
    const m=rcMin(c.entretien_heure);
    const cr=cacheCreches.find(x=>String(x.id)===String(c.creche_id));
    const ev={
      titre:(c.rdv_confirme_le?'✅ ':'')+'Entretien recrutement — '+((c.prenom||'')+' '+(c.nom||'')).trim(),
      type:'recrutement',creche_id:c.creche_id,date_debut:c.entretien_date,date_fin:null,
      heure_debut:m!=null?rcHeure(m):null,heure_fin:m!=null?rcHeure(m+RC_RDV_DUREE):null,
      lieu:(cr&&(cr.addr||cr.adresse))||'',
      description:'Entretien de recrutement'+(c.poste?' — '+c.poste:'')+(c.rdv_confirme_le?' (confirmé par la personne le '+rcDate(c.rdv_confirme_le)+')':' (pas encore confirmé)')+'. Fiche : Demandes › Remplaçants/tes › Recrutement.',
      auteur:(currentProfile&&currentProfile.name)||'',candidat_id:c.id
    };
    let saved;
    if(ex){
      const {data,error}=await sb.from('evenements').update(ev).eq('id',ex.id).select().single();
      if(error)throw error;saved=data;
    }else{
      ev.created_by=(typeof currentUser!=='undefined'&&currentUser)?currentUser.id:null;
      const {data,error}=await sb.from('evenements').insert(ev).select().single();
      if(error)throw error;saved=data;
      const dest=cacheReferents.filter(r=>r.id!==(currentProfile&&currentProfile.id)&&(r.role==='referent'||r.role==='direction')&&(!saved.creche_id||r.creche_id===saved.creche_id)).map(r=>r.id);
      if(dest.length&&typeof callFn==='function')callFn('notify-push',{referent_ids:dest,title:'Entretien de recrutement',body:ev.titre+' — '+rcQuand(c),url:'./demandes.html?section=recrutement',tag:'evenement-'+saved.id});
    }
    if(saved&&typeof cacheEvenements!=='undefined'){cacheEvenements=cacheEvenements.filter(e=>e.id!==saved.id);cacheEvenements.push(saved);}
    rcRafraichirAgendas();
  }catch(e){
    console.warn('[Recrutement] calendrier',e);
    showBanner('Entretien non reporté dans le calendrier'+(/candidat_id/i.test(e.message||'')?' : le script sql/recrutement_planning_cv.sql n’est pas appliqué.':'.'),'error');
  }
}
function rcRafraichirAgendas(){
  try{if(typeof renderCalendar==='function')renderCalendar();}catch(e){}
  try{if(typeof renderPlanning==='function')renderPlanning();}catch(e){}
}

/* ----------------------------------------------- CV ET LETTRE DE MOTIVATION */
/* Importés par l'équipe sur la fiche (la personne ne dépose rien). Fichiers : bucket privé `recrutement`,
   <id fiche>/candidature/…, ouverture par URL signée journalisée. Supprimés avec la fiche. */
const RC_PJ={cv:{lib:'CV',icone:'id'},lettre:{lib:'Lettre de motivation',icone:'mail-opened'}};
function rcCandidatureHtml(c){
  return '<p style="font-size:12px;color:var(--muted);margin:0 0 8px">Pièces reçues de la personne (PDF ou photo, 12 Mo maximum). Elles restent en interne : elles ne figurent pas dans son lien. Conservées avec la fiche (2 ans après le dernier contact).</p>'
    +['cv','lettre'].map(k=>{
      const path=c[k+'_path'];
      return '<div style="display:flex;align-items:center;gap:8px;background:#FAFAFD;border:1px solid var(--border);border-radius:8px;padding:7px 10px;margin-bottom:5px;flex-wrap:wrap">'
        +'<i class="ti ti-'+RC_PJ[k].icone+'" style="color:var(--koala)"></i><b style="font-size:12.5px;min-width:130px">'+RC_PJ[k].lib+'</b>'
        +(path?'<button type="button" onclick="rcPjOuvrir(\''+k+'\')" style="flex:1;min-width:120px;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12.5px;color:var(--koala-dark);text-decoration:underline">'+rcEsc(c[k+'_filename']||'Ouvrir')+'</button>'
            +'<span style="font-size:11px;color:var(--muted)">ajouté le '+rcDate(c[k+'_ajoute_le'])+'</span>'
          :'<span style="flex:1;font-size:12px;color:var(--muted)">Pas encore importé</span>')
        +'<button class="btn-sm" onclick="document.getElementById(\'rc-pj-'+k+'\').click()"><i class="ti ti-upload"></i> '+(path?'Remplacer':'Importer')+'</button>'
        +'<input type="file" id="rc-pj-'+k+'" accept="image/*,application/pdf" style="display:none" onchange="rcPjUpload(event,\''+k+'\')">'
        +(path?'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--red)" title="Supprimer" onclick="rcPjSupprimer(\''+k+'\')"><i class="ti ti-trash"></i></button>':'')
        +'</div>';
    }).join('')+'<span id="rc-pj-st" style="font-size:11.5px;color:var(--muted)"></span>';
}
async function rcPjUpload(ev,k){
  const input=ev.target,file=(input.files||[])[0];
  input.value='';
  const c=rcFiche();
  if(!file||!c||!RC_PJ[k])return;
  const st=document.getElementById('rc-pj-st');
  if(!rcFichierOk(file,st))return;
  if(st)st.textContent='⏳ Envoi de '+file.name+'…';
  const path=rcCheminFichier(c.id+'/candidature',file);
  try{
    const {error}=await sb.storage.from(RC_BUCKET).upload(path,file,{contentType:file.type});
    if(error)throw error;
    const maj={[k+'_path']:path,[k+'_filename']:file.name,[k+'_ajoute_le']:new Date().toISOString()};
    const {data,error:ie}=await sb.from('recrutement_candidats').update(maj).eq('id',c.id).select().single();
    if(ie){await sb.storage.from(RC_BUCKET).remove([path]);throw ie;}
    const ancien=c[k+'_path'];
    if(ancien)await sb.storage.from(RC_BUCKET).remove([ancien]);
    Object.assign(c,data);rcRender();
    showBanner(RC_PJ[k].lib+' importé ✅');
  }catch(e){
    console.error('[Recrutement] CV/lettre',e.message);
    if(st)st.textContent='⚠ Erreur : '+e.message+(/cv_path|lettre_path/.test(e.message||'')?' (script sql/recrutement_planning_cv.sql à appliquer)':'');
  }
}
function rcPjOuvrir(k){
  const c=rcFiche();
  if(c&&c[k+'_path'])rcOuvrirFichier(c[k+'_path'],c.id);
}
async function rcPjSupprimer(k){
  const c=rcFiche();
  if(!c||!c[k+'_path']||!confirm('Supprimer '+RC_PJ[k].lib.toLowerCase()+' de '+c.prenom+' ?\n\nLe fichier est effacé définitivement.'))return;
  const path=c[k+'_path'];
  const maj={[k+'_path']:null,[k+'_filename']:null,[k+'_ajoute_le']:null};
  const {error}=await sb.from('recrutement_candidats').update(maj).eq('id',c.id);
  if(error)return showBanner('Suppression impossible.','error');
  await sb.storage.from(RC_BUCKET).remove([path]);
  Object.assign(c,maj);rcRender();
  showBanner(RC_PJ[k].lib+' supprimé.');
}

/* ----------------------------------------------- CONTENU DU LIEN (pièces) */
function rcContenuHtml(c){
  const env=rcEnvois.filter(e=>String(e.candidat_id)===String(c.id));
  const dispo=rcDocs.filter(d=>(!d.creche_id||String(d.creche_id)===String(c.creche_id))&&!env.some(e=>String(e.document_id)===String(d.id)));
  const ligne=(coche,id,titre,detail,etat)=>
    '<label style="display:flex;align-items:flex-start;gap:9px;background:#FAFAFD;border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer">'
    +'<input type="checkbox" '+(coche?'checked':'')+' onchange="rcBasculer(\''+id+'\',this.checked)" style="width:17px;height:17px;margin-top:2px">'
    +'<span style="flex:1;font-size:12.5px"><b>'+titre+'</b><br><span style="color:var(--muted);font-size:11.5px">'+detail+'</span></span>'
    +'<span style="font-size:11px;color:var(--muted);white-space:nowrap">'+etat+'</span></label>';
  let h=ligne(c.avec_projet,'avec_projet','Projet pédagogique','Le livre à feuilleter de l’application (toujours la dernière version), ouvert depuis le lien.',
      c.avec_projet?(c.projet_ouvert_le?'ouvert le '+rcDate(c.projet_ouvert_le):'pas encore ouvert'):'')
    +ligne(c.avec_questionnaire,'avec_questionnaire','Questionnaire sur le projet','Le quiz en ligne, ouvert au nom de la personne ; son résultat s’affiche dans cette fiche.',
      c.avec_questionnaire?(c.reponses_le?'rempli le '+rcDate(c.reponses_le):'en attente'):'');
  h+='<div style="font-size:12px;font-weight:700;margin:12px 0 6px">Pièces jointes (fiche de poste, organigramme, planning type…)</div>';
  h+=env.length?env.map(e=>
    '<div style="display:flex;align-items:center;gap:7px;background:#FAFAFD;border:1px solid var(--border);border-radius:8px;padding:6px 10px;margin-bottom:5px;flex-wrap:wrap">'
    +'<i class="ti ti-file-text" style="color:var(--koala)"></i>'
    +'<button type="button" onclick="rcOuvrirFichier(\''+rcEsc(e.path)+'\',\''+c.id+'\')" style="flex:1;min-width:120px;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12.5px;color:var(--koala-dark);text-decoration:underline">'+rcEsc(e.libelle)+'</button>'
    +'<span style="font-size:11px;color:'+(e.ouvert_le?'var(--green)':'var(--muted)')+'">'+(e.ouvert_le?'ouvert le '+rcDate(e.ouvert_le):'pas encore ouvert')+'</span>'
    +'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--red)" title="Retirer du lien" onclick="rcRetirerEnvoi(\''+e.id+'\')"><i class="ti ti-x"></i></button>'
    +'</div>').join(''):'<p style="font-size:12px;color:var(--muted);margin:0 0 6px">Aucune pièce jointe pour l’instant.</p>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">'
    +(dispo.length?'<select class="finput" id="rc-doc-choix" style="width:auto;max-width:260px;font-size:12px;padding:4px 8px">'
      +dispo.map(d=>'<option value="'+d.id+'">'+rcEsc(d.libelle)+'</option>').join('')+'</select>'
      +'<button class="btn-sm" onclick="rcJoindreDoc()"><i class="ti ti-plus"></i> Joindre</button>'
      :'<span style="font-size:11.5px;color:var(--muted)">'+(rcDocs.length?'Tous les documents de la bibliothèque sont déjà joints.':'Bibliothèque vide : ajoutez-y la fiche de poste pour la réutiliser.')+'</span>')
    +'<button class="btn-sm" onclick="rcAller(\'biblio\')"><i class="ti ti-folder"></i> Bibliothèque</button>'
    +'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">'
    +'<input id="rc-envoi-titre" class="finput" placeholder="Ou un fichier pour cette personne seulement : son titre" maxlength="120" style="flex:1;min-width:200px;font-size:12px">'
    +'<button class="btn-sm" onclick="document.getElementById(\'rc-envoi-fichier\').click()"><i class="ti ti-upload"></i> Choisir un fichier</button>'
    +'<input type="file" id="rc-envoi-fichier" accept="image/*,application/pdf" style="display:none" onchange="rcEnvoiUpload(event)">'
    +'<span id="rc-envoi-st" style="font-size:11.5px;color:var(--muted)"></span></div>';
  return h;
}

async function rcBasculer(champ,val){
  const c=rcFiche();
  if(!c||(champ!=='avec_projet'&&champ!=='avec_questionnaire'))return;
  const {error}=await sb.from('recrutement_candidats').update({[champ]:!!val}).eq('id',c.id);
  if(error){showBanner('Modification impossible.','error');}else c[champ]=!!val;
  rcRender();
}

async function rcJoindreDoc(){
  const c=rcFiche(),d=rcDocs.find(x=>String(x.id)===rcVal('rc-doc-choix'));
  if(!c||!d)return;
  const {data,error}=await sb.from('recrutement_envois').insert({
    candidat_id:c.id,document_id:d.id,libelle:d.libelle,bucket:d.bucket||RC_BUCKET,path:d.path,
    filename:d.filename,mime:d.mime,taille:d.taille,envoye_par:(currentProfile&&currentProfile.name)||null
  }).select().single();
  if(error)return showBanner('Ajout impossible : '+rcEsc(error.message),'error');
  rcEnvois.push(data);rcRender();
  showBanner('« '+rcEsc(d.libelle)+' » joint au lien ✅');
}

function rcCheminFichier(dossier,file){
  const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,5).toLowerCase()||'bin';
  return dossier+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
}
function rcFichierOk(file,st){
  if(file.size>RC_TAILLE_MAX){if(st)st.textContent='⚠ Fichier trop lourd (12 Mo maximum).';return false;}
  if(!/^image\/|^application\/pdf$/.test(file.type||'')){if(st)st.textContent='⚠ Photo ou PDF uniquement.';return false;}
  return true;
}

async function rcEnvoiUpload(ev){
  const input=ev.target,file=(input.files||[])[0];
  input.value='';
  const c=rcFiche();
  if(!file||!c)return;
  const st=document.getElementById('rc-envoi-st');
  if(!rcFichierOk(file,st))return;
  const titre=rcVal('rc-envoi-titre')||file.name.replace(/\.[^.]+$/,'');
  if(st)st.textContent='⏳ Envoi de '+file.name+'…';
  const path=rcCheminFichier(c.id,file);
  try{
    const {error}=await sb.storage.from(RC_BUCKET).upload(path,file,{contentType:file.type});
    if(error)throw error;
    const {data,error:ie}=await sb.from('recrutement_envois').insert({
      candidat_id:c.id,libelle:titre,bucket:RC_BUCKET,path,filename:file.name,mime:file.type||null,taille:file.size,
      envoye_par:(currentProfile&&currentProfile.name)||null
    }).select().single();
    if(ie){await sb.storage.from(RC_BUCKET).remove([path]);throw ie;}
    rcEnvois.push(data);rcRender();
    showBanner('Pièce jointe ajoutée au lien ✅');
  }catch(e){
    console.error('[Recrutement] pièce jointe',e.message);
    if(st)st.textContent='⚠ Erreur : '+e.message;
  }
}

async function rcRetirerEnvoi(id){
  const e=rcEnvois.find(x=>String(x.id)===String(id));
  if(!e)return;
  if(!confirm('Retirer « '+e.libelle+' » du lien ?\n\nLa personne ne le verra plus.'))return;
  const {error}=await sb.from('recrutement_envois').delete().eq('id',e.id);
  if(error)return showBanner('Retrait impossible.','error');
  // Un fichier de la bibliothèque est partagé : on ne supprime que les fichiers propres à la fiche.
  if(!e.document_id)await sb.storage.from(e.bucket||RC_BUCKET).remove([e.path]);
  rcEnvois=rcEnvois.filter(x=>x.id!==e.id);
  rcRender();
  showBanner('Pièce retirée du lien.');
}

async function rcOuvrirFichier(path,candidatId){
  if(typeof kkJournaliserAcces==='function'&&candidatId)kkJournaliserAcces(RC_BUCKET,path,{entite_type:'candidat',entite_id:candidatId});
  const w=window.open('about:blank','_blank');
  const {data,error}=await sb.storage.from(RC_BUCKET).createSignedUrl(path,300);
  if(error||!data){if(w)w.close();return showBanner('Ouverture impossible : '+rcEsc((error&&error.message)||'erreur inconnue'),'error');}
  if(w)w.location.href=data.signedUrl;else window.open(data.signedUrl,'_blank','noopener');
}

/* ------------------------------------------------------------------- LIEN */
function rcLienHtml(c){
  if(c.statut==='refuse'||c.statut==='desiste')
    return '<p style="font-size:12.5px;color:var(--muted);margin:0">Candidature close : le lien ne fonctionne plus. Repassez le statut à « Candidature reçue » pour le rouvrir.</p>';
  if(!c.token)
    return '<p style="font-size:12.5px;color:var(--muted);margin:0 0 9px">Cochez ci-dessus ce que la personne doit recevoir, puis créez son lien personnel (valable '+RC_LIEN_JOURS+' jours).</p>'
      +'<button class="btn-primary" onclick="rcCreerLien(false)"><i class="ti ti-link-plus"></i> Créer le lien</button>';
  const expire=!rcLienValide(c);
  let h='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
    +'<input class="finput" id="rc-lien-url" readonly value="'+rcEsc(rcLienUrl(c.token))+'" style="flex:1;min-width:220px;font-size:12px" onclick="this.select()">'
    +'<button class="btn-sm" onclick="rcCopierLien()"><i class="ti ti-copy"></i> Copier</button>'
    +(typeof PartageLien!=='undefined'?'<button class="btn-sm" onclick="rcPartagerLien()"><i class="ti ti-share"></i> Partager…</button>':'')
    +'<button class="btn-primary" onclick="rcEnvoyerMail()" id="rc-btn-mail"'+(expire?' disabled':'')+'><i class="ti ti-mail"></i> Envoyer par e-mail</button>'
    +'</div>'
    +'<p style="font-size:11.5px;margin:8px 0 0;color:'+(expire?'var(--red)':'var(--muted)')+'">'
    +(expire?'Lien expiré le '+rcDate(c.token_expire_le)+'.':'Valable jusqu’au '+rcDate(c.token_expire_le)+'.')
    +(c.lien_envoye_le?' Envoyé par e-mail le '+rcDate(c.lien_envoye_le)+'.':'')
    +(c.lien_ouvert_le?' Ouvert le '+rcDate(c.lien_ouvert_le)+'.':' Pas encore ouvert.')
    +' <a href="#" onclick="rcProlongerLien();return false">Prolonger de '+RC_LIEN_JOURS+' jours</a> · '
    +'<a href="#" onclick="rcCreerLien(true);return false">Créer un nouveau lien</a></p>'
    +'<p style="font-size:11.5px;color:var(--muted);margin:6px 0 0">L’e-mail reprend votre message habituel (rendez-vous, adresse de la crèche, contenu du lien) et s’affiche en aperçu avant l’envoi. Il ne contient aucun fichier ; la personne confirme le rendez-vous par un bouton sur la page du lien (vous êtes prévenu·e) et ses réponses éventuelles arrivent sur recrutement.toulon@koalakids.fr. Les pièces ajoutées ensuite apparaissent sur le même lien.</p>';
  return h;
}
async function rcCreerLien(renouveler){
  const c=rcFiche();
  if(!c)return;
  if(renouveler&&!confirm('Créer un nouveau lien ?\n\nL\'ancien cessera immédiatement de fonctionner.'))return;
  const maj={token:rcToken(),token_expire_le:rcExpiration(),lien_envoye_le:null,lien_ouvert_le:null};
  const {error}=await sb.from('recrutement_candidats').update(maj).eq('id',c.id);
  if(error)return showBanner('Création du lien impossible.','error');
  Object.assign(c,maj);rcRender();
  showBanner(renouveler?'Nouveau lien créé — l\'ancien ne fonctionne plus.':'Lien créé ✅ — envoyez-le par e-mail ou partagez-le.');
}
async function rcProlongerLien(){
  const c=rcFiche();
  if(!c||!c.token)return;
  const maj={token_expire_le:rcExpiration()};
  const {error}=await sb.from('recrutement_candidats').update(maj).eq('id',c.id);
  if(error)return showBanner('Prolongation impossible.','error');
  Object.assign(c,maj);rcRender();
  showBanner('Lien valable jusqu’au '+rcDate(c.token_expire_le)+' ✅');
}
function rcCopierLien(){
  const el=document.getElementById('rc-lien-url');
  if(!el)return;
  el.select();
  navigator.clipboard.writeText(el.value)
    .then(()=>showBanner('Lien copié — collez-le dans un SMS ou un mail ✅'))
    .catch(()=>{try{document.execCommand('copy');showBanner('Lien copié ✅');}catch(e){showBanner('Copie impossible — sélectionnez le lien à la main.','error');}});
}
function rcPartagerLien(){
  const c=rcFiche();
  if(!c||!c.token)return;
  PartageLien.partager(rcLienUrl(c.token),{titre:'Votre candidature — Koala Kids',
    texte:'Bonjour '+c.prenom+', voici le lien pour préparer notre entretien (projet pédagogique, fiche de poste, questionnaire) :'});
}
/* L'e-mail est rédigé côté serveur (edge function envoyer-lien-candidat) : on demande d'abord son
   aperçu, affiché tel qu'il partira, puis on envoie. */
async function rcAppelMail(id,apercu){
  const {data,error}=await sb.functions.invoke('envoyer-lien-candidat',{body:{candidat_id:id,apercu:!!apercu}});
  if(error||!data||!data.ok){
    let code=(data&&data.error)||'';
    if(!code&&error&&error.context&&typeof error.context.json==='function'){try{code=((await error.context.json())||{}).error||'';}catch(e){}}
    throw new Error({aucun_email:'pas d’e-mail sur la fiche',lien_expire:'lien expiré',creche_non_autorisee:'crèche non autorisée',non_autorise:'compte non autorisé'}[code]||code||(error&&error.message)||'erreur');
  }
  return data;
}
async function rcEnvoyerMail(){
  const c=rcFiche();
  if(!c)return;
  if(!c.email)return showBanner('Pas d’e-mail sur la fiche : enregistrez-le, ou utilisez « Partager… ».','error');
  if(!rcLienValide(c))return showBanner('Lien expiré : prolongez-le d’abord.','error');
  const b=document.getElementById('rc-btn-mail');
  if(b)b.disabled=true;
  try{
    rcApercuOuvrir(c.id,await rcAppelMail(c.id,true));
  }catch(e){
    console.warn('[Recrutement] aperçu e-mail',e.message);
    showBanner('Aperçu de l’e-mail impossible ('+rcEsc(e.message)+'). Utilisez « Copier » ou « Partager… ».','error');
  }
  if(b)b.disabled=false;
}
function rcApercuFermer(){const f=document.getElementById('rc-apercu');if(f)f.remove();}
function rcApercuOuvrir(id,a){
  rcApercuFermer();
  const p=t=>'<p style="margin:0 0 11px">'+rcEsc(t)+'</p>';
  const f=document.createElement('div');
  f.id='rc-apercu';
  f.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:14px';
  f.innerHTML='<div role="dialog" aria-label="Aperçu de l’e-mail" style="background:#fff;border-radius:14px;max-width:600px;width:100%;max-height:92vh;overflow:auto;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.25)">'
    +'<div style="font-weight:700;font-size:15px;margin-bottom:8px"><i class="ti ti-mail" style="color:var(--koala)"></i> Aperçu de l’e-mail</div>'
    +'<div style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:10px">À : <b>'+rcEsc(a.destinataire)+'</b><br>Objet : '+rcEsc(a.objet)+'<br>Réponse envoyée à : '+rcEsc(a.repondre_a)+'</div>'
    +'<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;font-size:13.5px;line-height:1.6;background:#FAFAFD">'
    +(a.avant||[]).map(p).join('')
    +'<p style="margin:14px 0 4px;text-align:center"><span style="display:inline-block;background:#F47920;color:#fff;font-weight:700;padding:9px 22px;border-radius:9px">Ouvrir le lien</span></p>'
    +'<p style="margin:0 0 14px;text-align:center;font-size:11.5px;color:var(--muted)">'+rcEsc(a.valable||'')+'</p>'
    +(a.apres||[]).map(p).join('')
    +'<p style="margin:0">'+(a.signature||[]).map(rcEsc).join('<br>')+'</p></div>'
    +'<p style="font-size:11.5px;color:var(--muted);margin:10px 0 0">Pour changer la civilité, le type de candidature, le rendez-vous ou les pièces : fermez, modifiez la fiche, enregistrez. L’adresse de la crèche se règle dans Paramètres.</p>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">'
    +'<button class="btn-sm" onclick="rcApercuFermer()">Fermer</button>'
    +'<button class="btn-primary" id="rc-apercu-envoi" onclick="rcConfirmerMail(\''+id+'\')"><i class="ti ti-send"></i> Envoyer l’e-mail</button></div></div>';
  f.addEventListener('click',e=>{if(e.target===f)rcApercuFermer();});
  document.body.appendChild(f);
}
async function rcConfirmerMail(id){
  const c=rcCands.find(x=>String(x.id)===String(id));
  if(!c)return rcApercuFermer();
  const b=document.getElementById('rc-apercu-envoi');
  if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader"></i> Envoi…';}
  try{
    const d=await rcAppelMail(id,false);
    c.lien_envoye_le=d.le||new Date().toISOString();
    rcApercuFermer();
    showBanner('E-mail envoyé à '+rcEsc(c.email)+' ✅');
  }catch(e){
    console.warn('[Recrutement] e-mail',e.message);
    rcApercuFermer();
    showBanner('E-mail non parti ('+rcEsc(e.message)+'). Utilisez « Copier » ou « Partager… ».','error');
  }
  rcRender();
}

/* ---------------------------------------------------------- QUESTIONNAIRE */
/* recrutement_candidats.reponses = { ouvert_le } (suivi du clic) ; reponses_le = case « J'ai répondu ».
   Le résultat lui-même vit dans le projet quiz (resultats.ref = id de la fiche). */
function rcQuizSuivi(c){return (c.reponses&&typeof c.reponses==='object'&&!Array.isArray(c.reponses))?c.reponses:{};}
function rcQuizHtml(c){
  const o=rcQuizSuivi(c).ouvert_le,res=rcQuiz[c.id];
  let h='<p style="font-size:12.5px;margin:0 0 8px;color:var(--muted)">'
    +(c.reponses_le?'<span style="color:var(--green)"><i class="ti ti-circle-check"></i> La personne indique avoir répondu le '+rcDate(c.reponses_le)+'.</span>'
      :o?'Questionnaire ouvert le '+rcDate(o)+', pas encore confirmé.'
      :'Pas encore ouvert. Vous recevrez une notification quand la personne aura coché « J’ai répondu ».')+'</p>';
  if(res===undefined){rcQuizCharger(c.id);return h+'<p style="font-size:12px;color:var(--muted);margin:0">Recherche du résultat…</p>';}
  if(res==='erreur')return h+'<p style="font-size:12px;color:var(--red);margin:0">Résultat du quiz indisponible pour l’instant. <a href="#" onclick="rcQuizCharger(\''+c.id+'\',true);return false">Réessayer</a></p>';
  if(!res.length)return h+'<p style="font-size:12px;color:var(--muted);margin:0">Aucun résultat enregistré côté quiz pour cette fiche. <a href="#" onclick="rcQuizCharger(\''+c.id+'\',true);return false">Actualiser</a></p>';
  h+=res.map(r=>'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#FAFAFD;border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:5px;font-size:12.5px">'
    +'<i class="ti ti-list-check" style="color:var(--koala)"></i><b style="flex:1;min-width:140px">'+rcEsc(r.quiz_titre||'Questionnaire')+'</b>'
    +'<span style="color:var(--muted)">passé le '+rcDate(r.passe_le)+'</span>'
    +(r.mode==='profil'?'':'<span style="font-weight:700;color:var(--koala-dark)">'+r.score+' / '+r.total+(r.pourcentage!=null?' ('+r.pourcentage+' %)':'')+'</span>')
    +'</div>').join('');
  return h+'<p style="font-size:11.5px;color:var(--muted);margin:6px 0 0">Le détail des réponses se lit dans <a href="'+RC_QUIZ_ADMIN_URL+'" target="_blank" rel="noopener">l’administration des quiz</a> (résultats au nom de la personne). '
    +'<a href="#" onclick="rcQuizCharger(\''+c.id+'\',true);return false">Actualiser</a></p>';
}
async function rcQuizCharger(id,forcer){
  if(!forcer&&rcQuiz[id]!==undefined)return;
  rcQuiz[id]='erreur';
  try{
    if(typeof sbQuiz==='undefined')throw new Error('client quiz absent');
    const {data,error}=await sbQuiz.rpc('kk_resultats_par_ref',{p_ref:String(id)});
    if(error)throw error;
    rcQuiz[id]=data||[];
  }catch(e){console.warn('[Recrutement] quiz',e.message);}
  const z=document.getElementById('rc-quiz'),c=rcFiche();
  if(z&&c&&String(c.id)===String(id))z.innerHTML=rcQuizHtml(c);
}

/* ----------------------------------------------------------- BIBLIOTHÈQUE */
function rcBiblioHtml(){
  const maCreche=(currentProfile&&currentProfile.creche_id)||'';
  let h='<button class="btn-sm" onclick="rcAller(\''+(rcFicheId?'fiche':'liste')+'\',rcFicheId)"><i class="ti ti-arrow-left"></i> Retour</button>';
  let corps='<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Les documents que vous joignez souvent : <b>fiche de poste</b> par métier, organigramme, planning type, règlement de fonctionnement… '
    +'Déposez-les une fois ici, puis joignez-les à chaque candidature d’un clic. Le projet pédagogique n’a pas besoin d’y figurer : il est proposé d’office.</p>';
  corps+=rcDocs.length?rcDocs.map(d=>{
    const nb=rcEnvois.filter(e=>String(e.document_id)===String(d.id)).length;
    const peut=isDirection||(d.creche_id&&String(d.creche_id)===String(maCreche));
    return '<div style="display:flex;align-items:center;gap:8px;background:#FAFAFD;border:1px solid var(--border);border-radius:8px;padding:7px 10px;margin-bottom:5px;flex-wrap:wrap">'
      +'<i class="ti ti-file-text" style="color:var(--koala)"></i>'
      +'<button type="button" onclick="rcOuvrirFichier(\''+rcEsc(d.path)+'\')" style="flex:1;min-width:120px;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12.5px;color:var(--koala-dark);text-decoration:underline">'+rcEsc(d.libelle)+'</button>'
      +'<span style="font-size:11px;color:var(--muted)">'+(d.creche_id?rcEsc(rcCrecheNom(d.creche_id)):'Toutes les crèches')+' · joint à '+nb+' candidature'+(nb>1?'s':'')+'</span>'
      +(peut?'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--red)" title="Supprimer" onclick="rcSupprimerDoc(\''+d.id+'\')"><i class="ti ti-trash"></i></button>':'')
      +'</div>';
  }).join(''):'<p style="font-size:12.5px;color:var(--muted)">Aucun document pour l’instant.</p>';
  corps+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">'
    +'<input id="rc-doc-titre" class="finput" placeholder="Titre vu par la personne (ex. Fiche de poste — Auxiliaire de puériculture)" maxlength="120" style="flex:1;min-width:220px;font-size:12px">'
    +(isDirection?'<select class="finput" id="rc-doc-creche" style="width:auto;font-size:12px;padding:4px 8px"><option value="">Toutes les crèches</option>'
      +cacheCreches.map(c=>'<option value="'+c.id+'">'+rcEsc(c.name)+'</option>').join('')+'</select>':'')
    +'<button class="btn-primary" onclick="document.getElementById(\'rc-doc-fichier\').click()"><i class="ti ti-upload"></i> Ajouter un document</button>'
    +'<input type="file" id="rc-doc-fichier" accept="image/*,application/pdf" style="display:none" onchange="rcDocUpload(event)">'
    +'<span id="rc-doc-st" style="font-size:11.5px;color:var(--muted);flex-basis:100%"></span></div>';
  return h+rcBloc('Documents à joindre aux candidatures','folder',corps);
}

async function rcDocUpload(ev){
  const input=ev.target,file=(input.files||[])[0];
  input.value='';
  if(!file)return;
  const st=document.getElementById('rc-doc-st');
  if(!rcFichierOk(file,st))return;
  const org=currentProfile&&currentProfile.org_id;
  if(!org){if(st)st.textContent='⚠ Organisation introuvable sur votre compte.';return;}
  const creche=isDirection?(rcVal('rc-doc-creche')||null):((currentProfile&&currentProfile.creche_id)||null);
  if(!isDirection&&!creche){if(st)st.textContent='⚠ Votre compte n’est rattaché à aucune crèche.';return;}
  const titre=rcVal('rc-doc-titre')||file.name.replace(/\.[^.]+$/,'');
  if(st)st.textContent='⏳ Envoi de '+file.name+'…';
  const path=rcCheminFichier('bibliotheque/'+org,file);
  try{
    const {error}=await sb.storage.from(RC_BUCKET).upload(path,file,{contentType:file.type});
    if(error)throw error;
    const {data,error:ie}=await sb.from('recrutement_documents').insert({
      org_id:org,creche_id:creche,libelle:titre,bucket:RC_BUCKET,path,filename:file.name,mime:file.type||null,taille:file.size
    }).select().single();
    if(ie){await sb.storage.from(RC_BUCKET).remove([path]);throw ie;}
    rcDocs.push(data);rcDocs.sort((a,b)=>String(a.libelle).localeCompare(String(b.libelle),'fr'));
    rcRender();
    showBanner('Document ajouté à la bibliothèque ✅');
  }catch(e){
    console.error('[Recrutement] bibliothèque',e.message);
    if(st)st.textContent='⚠ Erreur : '+e.message;
  }
}

async function rcSupprimerDoc(id){
  const d=rcDocs.find(x=>String(x.id)===String(id));
  if(!d)return;
  const nb=rcEnvois.filter(e=>String(e.document_id)===String(d.id)).length;
  if(!confirm('Supprimer « '+d.libelle+' » de la bibliothèque ?'+(nb?'\n\nIl est joint à '+nb+' candidature'+(nb>1?'s':'')+' : il disparaîtra aussi de ces liens.':'')))return;
  const {error}=await sb.from('recrutement_documents').delete().eq('id',d.id);
  if(error)return showBanner('Suppression impossible : '+rcEsc(error.message),'error');
  await sb.storage.from(d.bucket||RC_BUCKET).remove([d.path]);
  rcDocs=rcDocs.filter(x=>x.id!==d.id);
  rcEnvois=rcEnvois.filter(e=>String(e.document_id)!==String(d.id));
  rcRender();
  showBanner('Document supprimé.');
}
