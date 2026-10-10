/* ═══════════════════════════════════════════════════════════════════════════
   REGISTRE DE SÉCURITÉ NUMÉRIQUE — art. R.143-44 CCH (ERP type R, 5e cat.)
   Onglet autonome de documents.html. Tables rs_* sur Supabase.
   ═══════════════════════════════════════════════════════════════════════════ */

let RS_LOADED=false, RS_CRECHE=null, RS_MOD='synthese';
let RS_TYPES=[], RS_ETAB=null, RS_DATA={}, RS_EDIT=null, RS_MODAL_MOD=null;

/* Date locale au format ISO — jamais toISOString() (décalage UTC+2). */
function rsToday(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function rsAddMonths(iso,m){
  if(!iso||m==null)return null;
  const p=String(iso).slice(0,10).split('-');
  const d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));
  const j=d.getDate();
  d.setDate(1); d.setMonth(d.getMonth()+Number(m));
  d.setDate(Math.min(j,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function rsJours(iso){
  if(!iso)return null;
  const a=new Date(rsToday()+'T00:00:00'), b=new Date(String(iso).slice(0,10)+'T00:00:00');
  return Math.round((b-a)/86400000);
}
function rsFr(iso){
  if(!iso)return '—';
  const p=String(iso).slice(0,10).split('-');
  return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):iso;
}

/* ---------- Schémas des modules ---------- */
const RS_MODULES={
  synthese:{titre:'Synthèse',icon:'gauge'},
  etab:{titre:'Identité ERP',icon:'building-community'},
  controles:{
    titre:'Vérifications',icon:'checkup-list',table:'rs_controles',
    tri:['date_controle',false],
    champs:[
      {k:'type_id',l:'Contrôle',t:'select',req:true,opts:()=>RS_TYPES.map(t=>({v:t.id,l:t.libelle}))},
      {k:'libelle_libre',l:'Intitulé libre (si hors référentiel)',t:'text'},
      {k:'date_controle',l:'Date du contrôle',t:'date',req:true},
      {k:'organisme',l:'Organisme vérificateur',t:'text'},
      {k:'intervenant',l:'Intervenant',t:'text'},
      {k:'resultat',l:'Résultat',t:'select',req:true,opts:()=>[
        {v:'conforme',l:'Conforme'},{v:'conforme_reserves',l:'Conforme avec réserves'},{v:'non_conforme',l:'Non conforme'}]},
      {k:'cout_ht',l:'Coût HT (€)',t:'num'},
      {k:'observations',l:'Observations',t:'textarea'},
      {k:'rapport_url',l:'Rapport de contrôle (PDF)',t:'file'}
    ]},
  exercices:{
    titre:'Exercices',icon:'run',table:'rs_exercices',
    tri:['date_exercice',false],
    champs:[
      {k:'type',l:'Type d’exercice',t:'select',req:true,opts:()=>[
        {v:'evacuation',l:'Évacuation incendie'},{v:'confinement',l:'Confinement / PPMS'},
        {v:'attentat_intrusion',l:'Attentat-intrusion'},{v:'autre',l:'Autre'}]},
      {k:'date_exercice',l:'Date',t:'date',req:true},
      {k:'heure',l:'Heure',t:'text'},
      {k:'inopine',l:'Exercice inopiné',t:'bool'},
      {k:'scenario',l:'Scénario retenu',t:'text'},
      {k:'nb_enfants',l:'Enfants présents',t:'num'},
      {k:'nb_adultes',l:'Adultes présents',t:'num'},
      {k:'duree_secondes',l:'Durée d’évacuation (secondes)',t:'num'},
      {k:'point_rassemblement',l:'Point de rassemblement',t:'text'},
      {k:'participants',l:'Participants',t:'textarea'},
      {k:'deroulement',l:'Déroulement',t:'textarea'},
      {k:'difficultes',l:'Difficultés rencontrées',t:'textarea'},
      {k:'actions_correctives',l:'Actions correctives décidées',t:'textarea'},
      {k:'pj_url',l:'Pièce jointe',t:'file'}
    ]},
  formations:{
    titre:'Formations',icon:'certificate',table:'rs_formations',
    tri:['date_recyclage',true],
    champs:[
      {k:'personne',l:'Personne',t:'text',req:true},
      {k:'fonction',l:'Fonction',t:'text'},
      {k:'type_formation',l:'Type',t:'select',req:true,opts:()=>[
        {v:'sst',l:'SST — sauveteur secouriste du travail'},{v:'psc1',l:'PSC1'},
        {v:'extincteurs',l:'Manipulation des extincteurs'},{v:'evacuation',l:'Guide / serre-file évacuation'},
        {v:'gestes_urgence',l:'Gestes d’urgence pédiatriques'},{v:'autre',l:'Autre'}]},
      {k:'intitule',l:'Intitulé exact',t:'text'},
      {k:'organisme',l:'Organisme formateur',t:'text'},
      {k:'date_obtention',l:'Date d’obtention',t:'date',req:true},
      {k:'validite_mois',l:'Validité (mois) — 24 pour le SST',t:'num'},
      {k:'observations',l:'Observations',t:'textarea'},
      {k:'attestation_url',l:'Attestation',t:'file'}
    ]},
  travaux:{
    titre:'Travaux',icon:'tools',table:'rs_travaux',
    tri:['date_debut',false],
    champs:[
      {k:'intitule',l:'Intitulé',t:'text',req:true},
      {k:'nature',l:'Nature',t:'select',opts:()=>[
        {v:'amenagement',l:'Aménagement'},{v:'transformation',l:'Transformation'},
        {v:'entretien',l:'Entretien'},{v:'mise_conformite',l:'Mise en conformité'}]},
      {k:'description',l:'Description',t:'textarea'},
      {k:'entreprise',l:'Entreprise',t:'text'},
      {k:'entreprise_contact',l:'Contact entreprise',t:'text'},
      {k:'date_debut',l:'Début',t:'date',req:true},
      {k:'date_fin',l:'Fin',t:'date'},
      {k:'incidence_erp',l:'Modifie l’ERP (déclaration requise)',t:'bool'},
      {k:'autorisation_ref',l:'Référence autorisation (AT / DP / avis)',t:'text'},
      {k:'pj_url',l:'Pièce jointe',t:'file'}
    ]},
  reserves:{
    titre:'Réserves',icon:'alert-triangle',table:'rs_reserves',
    tri:['echeance',true],
    champs:[
      {k:'intitule',l:'Intitulé de la prescription',t:'text',req:true},
      {k:'origine',l:'Origine',t:'select',req:true,opts:()=>[
        {v:'commission_securite',l:'Commission de sécurité'},{v:'pmi',l:'PMI'},
        {v:'assureur',l:'Assureur'},{v:'verificateur',l:'Organisme vérificateur'},
        {v:'interne',l:'Constat interne'}]},
      {k:'date_constat',l:'Date du constat',t:'date',req:true},
      {k:'reference',l:'Référence du rapport',t:'text'},
      {k:'gravite',l:'Gravité',t:'select',opts:()=>[
        {v:'majeure',l:'Majeure'},{v:'moyenne',l:'Moyenne'},{v:'mineure',l:'Mineure'}]},
      {k:'echeance',l:'Échéance de levée',t:'date'},
      {k:'description',l:'Description',t:'textarea'},
      {k:'statut',l:'Statut',t:'select',opts:()=>[
        {v:'ouverte',l:'Ouverte'},{v:'en_cours',l:'En cours'},{v:'levee',l:'Levée'}]},
      {k:'action_menee',l:'Action menée',t:'textarea'},
      {k:'date_levee',l:'Date de levée',t:'date'},
      {k:'preuve_url',l:'Justificatif de levée',t:'file'}
    ]},
  journal:{titre:'Journal',icon:'history',table:'rs_journal'}
};

/* ---------- Navigation entre les deux onglets de la page ---------- */
function goTab(t){
  document.getElementById('viewDocs').style.display=t==='docs'?'':'none';
  document.getElementById('viewRS').style.display=t==='rs'?'':'none';
  document.getElementById('viewGuides').style.display=t==='guides'?'':'none';
  document.getElementById('tabDocs').classList.toggle('on',t==='docs');
  document.getElementById('tabRS').classList.toggle('on',t==='rs');
  document.getElementById('tabGuides').classList.toggle('on',t==='guides');
  if(t==='rs'&&!RS_LOADED)rsInit();
  if(t==='guides'&&!window.GP_LOADED){window.GP_LOADED=true;gp_init();}
}

/* ---------- Chargement ---------- */
async function rsInit(){
  RS_LOADED=true;
  const sel=document.getElementById('rsCreche');
  sel.innerHTML=(CRECHES||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if(PROF&&PROF.role!=='direction'&&PROF.creche_id){sel.value=PROF.creche_id;sel.disabled=true;}
  RS_CRECHE=sel.value||null;
  const{data:t}=await sb.from('rs_types_controle').select('*').eq('actif',true).order('ordre');
  RS_TYPES=t||[];
  await rsLoad();
}
function rsChangeCreche(){RS_CRECHE=document.getElementById('rsCreche').value;rsLoad();}

async function rsLoad(){
  if(!RS_CRECHE){document.getElementById('rsBody').innerHTML='<div class="empty"><i class="ti ti-building"></i>Aucune crèche sélectionnée.</div>';return;}
  document.getElementById('rsBody').innerHTML='<div class="empty"><i class="ti ti-loader"></i>Chargement…</div>';
  const q=n=>sb.from(n).select('*').eq('creche_id',RS_CRECHE);
  try{
    const[e,c,x,f,tv,r,j]=await Promise.all([
      sb.from('rs_etablissement').select('*').eq('creche_id',RS_CRECHE).maybeSingle(),
      q('rs_controles'),q('rs_exercices'),q('rs_formations'),q('rs_travaux'),q('rs_reserves'),
      sb.from('rs_journal').select('*').eq('creche_id',RS_CRECHE).order('horodatage',{ascending:false}).limit(300)
    ]);
    RS_ETAB=e.data||null;
    RS_DATA={controles:c.data||[],exercices:x.data||[],formations:f.data||[],
             travaux:tv.data||[],reserves:r.data||[],journal:j.data||[]};
  }catch(err){
    console.error('rsLoad',err);
    document.getElementById('rsBody').innerHTML='<div class="empty"><i class="ti ti-plug-off"></i>Chargement impossible. Session expirée ? Se déconnecter puis se reconnecter.</div>';
    return;
  }
  rsRender();
}

function rsGo(m){RS_MOD=m;rsRender();}
function rsEcrit(){return !!PROF&&(PROF.role==='direction'||(PROF.role==='referent'&&PROF.creche_id===RS_CRECHE));}

/* ---------- Échéancier : dernier contrôle par type + prochaine échéance ---------- */
function rsEcheancier(){
  const out=[];
  RS_TYPES.forEach(t=>{
    const faits=(RS_DATA.controles||[]).filter(c=>c.type_id===t.id)
      .sort((a,b)=>String(b.date_controle).localeCompare(String(a.date_controle)));
    const last=faits[0]||null;
    const due=last&&t.periodicite_mois?rsAddMonths(last.date_controle,t.periodicite_mois):null;
    const j=due?rsJours(due):null;
    let etat='jamais';
    if(last&&!t.periodicite_mois)etat='ok';
    else if(j!=null)etat=j<0?'retard':(j<=30?'proche':'ok');
    out.push({type:t,last:last,due:due,jours:j,etat:etat});
  });
  const rang={retard:0,jamais:1,proche:2,ok:3};
  return out.sort((a,b)=>(rang[a.etat]-rang[b.etat])||(a.type.ordre-b.type.ordre));
}
function rsBadge(e){
  if(e.etat==='retard')return `<span class="rs-b rs-r">Échu depuis ${Math.abs(e.jours)} j</span>`;
  if(e.etat==='jamais')return '<span class="rs-b rs-g">Jamais réalisé</span>';
  if(e.etat==='proche')return `<span class="rs-b rs-o">Dans ${e.jours} j</span>`;
  return '<span class="rs-b rs-v">À jour</span>';
}

/* ---------- Rendu ---------- */
function rsRender(){
  const nav=Object.keys(RS_MODULES).map(k=>{
    const m=RS_MODULES[k];
    let n='';
    if(k==='controles'){const r=rsEcheancier().filter(e=>e.etat==='retard'||e.etat==='jamais').length;if(r)n=`<b>${r}</b>`;}
    if(k==='reserves'){const r=(RS_DATA.reserves||[]).filter(x=>x.statut!=='levee').length;if(r)n=`<b>${r}</b>`;}
    return `<button class="rs-t${RS_MOD===k?' on':''}" onclick="rsGo('${k}')"><i class="ti ti-${m.icon}"></i> ${m.titre}${n}</button>`;
  }).join('');
  document.getElementById('rsNav').innerHTML=nav;
  const f={synthese:rsVueSynthese,etab:rsVueEtab,controles:rsVueControles,exercices:rsVueListe,
           formations:rsVueFormations,travaux:rsVueListe,reserves:rsVueReserves,journal:rsVueJournal};
  document.getElementById('rsBody').innerHTML=(f[RS_MOD]||rsVueListe)();
}

function rsVueSynthese(){
  const ech=rsEcheancier();
  const retard=ech.filter(e=>e.etat==='retard'||e.etat==='jamais');
  const proche=ech.filter(e=>e.etat==='proche');
  const res=(RS_DATA.reserves||[]).filter(r=>r.statut!=='levee');
  const evac=(RS_DATA.exercices||[]).filter(x=>x.type==='evacuation');
  const an=String(new Date().getFullYear());
  const evacAn=evac.filter(x=>String(x.date_exercice).slice(0,4)===an).length;
  const ppms=(RS_DATA.exercices||[]).filter(x=>(x.type==='confinement'||x.type==='attentat_intrusion')&&String(x.date_exercice).slice(0,4)===an).length;
  const forExp=(RS_DATA.formations||[]).filter(f=>{
    const d=f.date_recyclage||(f.validite_mois?rsAddMonths(f.date_obtention,f.validite_mois):null);
    return d&&rsJours(d)<60;});
  const k=(t,v,s,cls)=>`<div class="rs-k ${cls||''}"><div class="rs-kv">${v}</div><div class="rs-kt">${t}</div><div class="rs-ks">${s||''}</div></div>`;
  let h='<div class="rs-kpi">';
  h+=k('Contrôles en retard',retard.length,retard.length?'action requise':'aucun',retard.length?'bad':'good');
  h+=k('Échéances < 30 j',proche.length,'à planifier',proche.length?'warn':'good');
  h+=k('Réserves non levées',res.length,'toutes origines',res.length?'warn':'good');
  h+=k('Évacuations '+an,evacAn+' / 2',evacAn>=2?'obligation remplie':'2 par an requis',evacAn>=2?'good':'warn');
  h+=k('Mise en sûreté '+an,ppms+' / 1',ppms>=1?'obligation remplie':'1 par an requis',ppms>=1?'good':'warn');
  h+=k('Formations à recycler',forExp.length,'sous 60 jours',forExp.length?'warn':'good');
  h+='</div>';
  if(retard.length){
    h+='<h3 class="rs-h">À traiter en priorité</h3><div class="rs-list">';
    retard.slice(0,12).forEach(e=>{
      h+=`<div class="rs-i"><div class="rs-i-m"><b>${esc(e.type.libelle)}</b>
        <span class="rs-s">${esc(e.type.reference||'')}</span></div>${rsBadge(e)}</div>`;});
    h+='</div>';
  }
  if(res.length){
    h+='<h3 class="rs-h">Réserves ouvertes</h3><div class="rs-list">';
    res.slice(0,12).forEach(r=>{
      h+=`<div class="rs-i"><div class="rs-i-m"><b>${esc(r.intitule)}</b>
        <span class="rs-s">${esc(rsLib('origine',r.origine))} · constat du ${rsFr(r.date_constat)}</span></div>
        <span class="rs-b ${r.gravite==='majeure'?'rs-r':'rs-o'}">${esc(r.gravite||'')}</span></div>`;});
    h+='</div>';
  }
  h+='<p class="rs-note">Registre de sécurité tenu au titre de l’article R.143-44 du code de la construction et de l’habitation. '
    +'Toutes les écritures sont horodatées et nominatives ; elles ne peuvent être ni modifiées ni supprimées a posteriori (onglet Journal).</p>';
  return h;
}

function rsVueEtab(){
  const e=RS_ETAB||{};
  const w=rsEcrit();
  const l=(lab,val)=>`<div class="rs-f"><span>${lab}</span><b>${val==null||val===''?'—':esc(String(val))}</b></div>`;
  let h='<div class="rs-bar">';
  if(w)h+='<button class="btn btn-p" onclick="rsOpenEtab()"><i class="ti ti-edit"></i> Modifier la fiche</button>';
  h+='</div><div class="rs-card">';
  h+=l('Type ERP',e.erp_type)+l('Catégorie',e.erp_categorie)
   +l('Effectif public autorisé',e.effectif_public)+l('Effectif personnel',e.effectif_personnel)
   +l('Locaux à sommeil',e.locaux_sommeil===false?'Non':'Oui')+l('Niveaux',e.etages)
   +l('Date d’ouverture',e.date_ouverture?rsFr(e.date_ouverture):null)
   +l('Avis commission de sécurité',e.avis_commission)
   +l('Date de l’avis',e.avis_commission_le?rsFr(e.avis_commission_le):null)
   +l('Prochaine visite',e.prochaine_visite?rsFr(e.prochaine_visite):null)
   +l('Chargé de sécurité',e.charge_securite)+l('Téléphone',e.charge_securite_tel)
   +l('Contact SDIS',e.sdis_contact)+l('Contact mairie',e.mairie_contact)
   +l('Assureur',e.assureur)+l('N° de police',e.police_assurance)
   +l('Observations',e.observations);
  h+='</div>';
  return h;
}

function rsVueControles(){
  const w=rsEcrit();
  let h='<div class="rs-bar">';
  if(w)h+='<button class="btn btn-p" onclick="rsOpen(\'controles\')"><i class="ti ti-plus"></i> Consigner un contrôle</button>';
  h+='</div><h3 class="rs-h">Échéancier réglementaire</h3><div class="rs-list">';
  rsEcheancier().forEach(e=>{
    h+=`<div class="rs-i"><div class="rs-i-m"><b>${esc(e.type.libelle)}</b>
      <span class="rs-s">${esc(e.type.reference||'')}${e.type.periodicite_mois?' · tous les '+e.type.periodicite_mois+' mois':' · ponctuel'}</span>
      <span class="rs-s">Dernier : ${rsFr(e.last&&e.last.date_controle)}${e.due?' — prochain : '+rsFr(e.due):''}</span>
      </div>${rsBadge(e)}</div>`;});
  h+='</div><h3 class="rs-h">Contrôles consignés</h3>';
  const rows=(RS_DATA.controles||[]).slice().sort((a,b)=>String(b.date_controle).localeCompare(String(a.date_controle)));
  if(!rows.length)return h+'<div class="empty"><i class="ti ti-checkup-list"></i>Aucun contrôle enregistré.</div>';
  h+='<div class="rs-list">';
  rows.forEach(r=>{
    const t=RS_TYPES.find(x=>x.id===r.type_id);
    const cl=r.resultat==='non_conforme'?'rs-r':(r.resultat==='conforme_reserves'?'rs-o':'rs-v');
    h+=`<div class="rs-i"><div class="rs-i-m"><b>${esc(t?t.libelle:(r.libelle_libre||'Contrôle'))}</b>
      <span class="rs-s">${rsFr(r.date_controle)}${r.organisme?' · '+esc(r.organisme):''}${r.cout_ht?' · '+r.cout_ht+' € HT':''}</span>
      ${r.observations?'<span class="rs-s">'+esc(r.observations)+'</span>':''}
      ${r.rapport_url?'<a class="rs-a" target="_blank" href="'+esc(r.rapport_url)+'"><i class="ti ti-paperclip"></i> Rapport</a>':''}
      ${rsSigLigne(r)}
      </div><span class="rs-b ${cl}">${esc(rsLib('resultat',r.resultat))}</span>${rsActions('controles',r)}</div>`;});
  return h+'</div>';
}

function rsVueFormations(){
  const w=rsEcrit();
  let h='<div class="rs-bar">';
  if(w)h+='<button class="btn btn-p" onclick="rsOpen(\'formations\')"><i class="ti ti-plus"></i> Ajouter une formation</button>';
  h+='</div>';
  const rows=(RS_DATA.formations||[]).slice();
  if(!rows.length)return h+'<div class="empty"><i class="ti ti-certificate"></i>Aucune formation enregistrée.</div>';
  rows.forEach(f=>{f._due=f.date_recyclage||(f.validite_mois?rsAddMonths(f.date_obtention,f.validite_mois):null);});
  rows.sort((a,b)=>String(a._due||'9999').localeCompare(String(b._due||'9999')));
  h+='<div class="rs-list">';
  rows.forEach(f=>{
    const j=f._due?rsJours(f._due):null;
    const b=j==null?'<span class="rs-b rs-v">Sans échéance</span>'
      :(j<0?`<span class="rs-b rs-r">Périmée depuis ${Math.abs(j)} j</span>`
      :(j<=60?`<span class="rs-b rs-o">Recyclage dans ${j} j</span>`:'<span class="rs-b rs-v">Valide</span>'));
    h+=`<div class="rs-i"><div class="rs-i-m"><b>${esc(f.personne)} — ${esc(rsLib('type_formation',f.type_formation))}</b>
      <span class="rs-s">${esc(f.fonction||'')}${f.organisme?' · '+esc(f.organisme):''}</span>
      <span class="rs-s">Obtenue le ${rsFr(f.date_obtention)}${f._due?' — à recycler avant le '+rsFr(f._due):''}</span>
      ${f.attestation_url?'<a class="rs-a" target="_blank" href="'+esc(f.attestation_url)+'"><i class="ti ti-paperclip"></i> Attestation</a>':''}
      </div>${b}${rsActions('formations',f)}</div>`;});
  return h+'</div>';
}

function rsVueReserves(){
  const w=rsEcrit();
  let h='<div class="rs-bar">';
  if(w)h+='<button class="btn btn-p" onclick="rsOpen(\'reserves\')"><i class="ti ti-plus"></i> Ajouter une réserve</button>';
  h+='</div>';
  const rows=(RS_DATA.reserves||[]).slice().sort((a,b)=>{
    if((a.statut==='levee')!==(b.statut==='levee'))return a.statut==='levee'?1:-1;
    return String(a.echeance||'9999').localeCompare(String(b.echeance||'9999'));});
  if(!rows.length)return h+'<div class="empty"><i class="ti ti-alert-triangle"></i>Aucune réserve enregistrée.</div>';
  h+='<div class="rs-list">';
  rows.forEach(r=>{
    const j=r.echeance?rsJours(r.echeance):null;
    const b=r.statut==='levee'?'<span class="rs-b rs-v">Levée le '+rsFr(r.date_levee)+'</span>'
      :(j!=null&&j<0?`<span class="rs-b rs-r">En retard de ${Math.abs(j)} j</span>`
      :'<span class="rs-b rs-o">'+esc(rsLib('statut',r.statut))+'</span>');
    h+=`<div class="rs-i"><div class="rs-i-m"><b>${esc(r.intitule)}</b>
      <span class="rs-s">${esc(rsLib('origine',r.origine))} · constat du ${rsFr(r.date_constat)}${r.reference?' · '+esc(r.reference):''}</span>
      ${r.description?'<span class="rs-s">'+esc(r.description)+'</span>':''}
      ${r.action_menee?'<span class="rs-s"><i class="ti ti-arrow-right"></i> '+esc(r.action_menee)+'</span>':''}
      ${r.preuve_url?'<a class="rs-a" target="_blank" href="'+esc(r.preuve_url)+'"><i class="ti ti-paperclip"></i> Justificatif</a>':''}
      ${rsSigLigne(r)}
      </div>${b}${rsActions('reserves',r)}</div>`;});
  return h+'</div>';
}

function rsVueListe(){
  const mod=RS_MOD, M=RS_MODULES[mod], w=rsEcrit();
  let h='<div class="rs-bar">';
  if(w)h+=`<button class="btn btn-p" onclick="rsOpen('${mod}')"><i class="ti ti-plus"></i> Ajouter</button>`;
  h+='</div>';
  const rows=(RS_DATA[mod]||[]).slice().sort((a,b)=>String(b[M.tri[0]]||'').localeCompare(String(a[M.tri[0]]||'')));
  if(!rows.length)return h+`<div class="empty"><i class="ti ti-${M.icon}"></i>Aucune donnée.</div>`;
  h+='<div class="rs-list">';
  rows.forEach(r=>{
    let titre,sous='',extra='';
    if(mod==='exercices'){
      titre=rsLib('type',r.type)+' — '+rsFr(r.date_exercice);
      sous=(r.inopine?'Inopiné · ':'')+(r.scenario?esc(r.scenario)+' · ':'')
        +(r.nb_enfants!=null?r.nb_enfants+' enfants · ':'')
        +(r.duree_secondes?'évacuation en '+r.duree_secondes+' s':'');
      extra=(r.difficultes?'<span class="rs-s"><b>Difficultés :</b> '+esc(r.difficultes)+'</span>':'')
        +(r.actions_correctives?'<span class="rs-s"><b>Actions :</b> '+esc(r.actions_correctives)+'</span>':'');
    }else{
      titre=esc(r.intitule||'');
      sous=(r.entreprise?esc(r.entreprise)+' · ':'')+rsFr(r.date_debut)+(r.date_fin?' → '+rsFr(r.date_fin):'')
        +(r.incidence_erp?' · <b>incidence ERP</b>':'');
      extra=r.description?'<span class="rs-s">'+esc(r.description)+'</span>':'';
    }
    const pj=r.pj_url?'<a class="rs-a" target="_blank" href="'+esc(r.pj_url)+'"><i class="ti ti-paperclip"></i> Pièce jointe</a>':'';
    h+=`<div class="rs-i"><div class="rs-i-m"><b>${titre}</b><span class="rs-s">${sous}</span>${extra}${pj}${rsSigLigne(r)}</div>${rsActions(mod,r)}</div>`;});
  return h+'</div>';
}

function rsVueJournal(){
  const rows=RS_DATA.journal||[];
  let h='<p class="rs-note">Journal des écritures — horodatage serveur, auteur identifié. '
   +'Aucune modification ni suppression n’est possible : c’est ce qui rend le registre numérique opposable lors d’un contrôle.</p>';
  if(!rows.length)return h+'<div class="empty"><i class="ti ti-history"></i>Aucune écriture.</div>';
  h+='<div class="rs-list">';
  rows.forEach(j=>{
    const d=new Date(j.horodatage);
    const q=d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const act={INSERT:'Création',UPDATE:'Modification',DELETE:'Suppression'}[j.action]||j.action;
    const tab=(RS_MODULES[String(j.table_cible).replace('rs_','')]||{}).titre||j.table_cible;
    h+=`<div class="rs-i"><div class="rs-i-m"><b>${esc(act)} · ${esc(tab)}</b>
      <span class="rs-s">${esc(q)} — ${esc(j.auteur_nom||'inconnu')}</span></div></div>`;});
  return h+'</div>';
}

function rsActions(mod,r){
  if(!rsEcrit())return '';
  let h='<div class="rs-act">';
  h+=`<button class="iconbtn" title="Modifier" onclick="rsOpen('${mod}','${r.id}')"><i class="ti ti-edit"></i></button>`;
  if(PROF&&PROF.role==='direction')
    h+=`<button class="iconbtn d" title="Supprimer" onclick="rsDel('${mod}','${r.id}')"><i class="ti ti-trash"></i></button>`;
  return h+'</div>';
}

/* ---------- Libellés lisibles ---------- */
const RS_LIB={
  resultat:{conforme:'Conforme',conforme_reserves:'Avec réserves',non_conforme:'Non conforme'},
  origine:{commission_securite:'Commission de sécurité',pmi:'PMI',assureur:'Assureur',
           verificateur:'Organisme vérificateur',interne:'Constat interne'},
  statut:{ouverte:'Ouverte',en_cours:'En cours',levee:'Levée'},
  type:{evacuation:'Évacuation incendie',confinement:'Confinement / PPMS',
        attentat_intrusion:'Attentat-intrusion',autre:'Autre exercice'},
  type_formation:{sst:'SST',psc1:'PSC1',extincteurs:'Manipulation extincteurs',
        evacuation:'Guide / serre-file',gestes_urgence:'Gestes d’urgence',autre:'Autre'}
};
function rsLib(champ,v){return (RS_LIB[champ]&&RS_LIB[champ][v])||v||'';}

/* ---------- Modale générique ---------- */
function rsOpen(mod,id){
  const M=RS_MODULES[mod];
  RS_MODAL_MOD=mod;
  RS_EDIT=id?(RS_DATA[mod]||[]).find(x=>x.id===id)||null:null;
  document.getElementById('rsModTitre').textContent=(RS_EDIT?'Modifier — ':'Nouveau — ')+M.titre;
  const verrou=!!(RS_EDIT&&RS_EDIT.signature_url&&PROF&&PROF.role!=='direction');
  let html=verrou?'<div class="rs-lock"><i class="ti ti-lock"></i> Cette écriture est signée : '
    +'elle ne peut plus être modifiée. Une correction se fait en ajoutant une nouvelle '
    +'écriture, jamais en effaçant la précédente.</div>':'';
  html+=M.champs.map(c=>rsChamp(c,RS_EDIT?RS_EDIT[c.k]:null)).join('');
  RS_SIG=null;
  if(RS_SIGNABLE.indexOf(mod)>=0)html+=rsSigBloc(mod);
  document.getElementById('rsForm').innerHTML=html;
  if(RS_SIGNABLE.indexOf(mod)>=0)rsMountSig();
  if(verrou){
    document.querySelectorAll('#rsForm input,#rsForm select,#rsForm textarea,#rsForm .acts button')
      .forEach(e=>e.disabled=true);
  }
  document.getElementById('rsSaveBtn').style.display=verrou?'none':'';
  document.getElementById('rsDel').style.display=(RS_EDIT&&PROF&&PROF.role==='direction')?'':'none';
  document.getElementById('ovRS').classList.add('on');
}
function rsOpenEtab(){
  RS_MODAL_MOD='etab';RS_EDIT=RS_ETAB;
  const ch=[
    {k:'erp_type',l:'Type ERP',t:'text'},{k:'erp_categorie',l:'Catégorie',t:'text'},
    {k:'effectif_public',l:'Effectif public autorisé',t:'num'},
    {k:'effectif_personnel',l:'Effectif personnel',t:'num'},
    {k:'locaux_sommeil',l:'Locaux à sommeil',t:'bool'},
    {k:'etages',l:'Niveaux occupés',t:'text'},
    {k:'date_ouverture',l:'Date d’ouverture',t:'date'},
    {k:'avis_commission',l:'Avis commission de sécurité',t:'text'},
    {k:'avis_commission_le',l:'Date de l’avis',t:'date'},
    {k:'prochaine_visite',l:'Prochaine visite',t:'date'},
    {k:'charge_securite',l:'Chargé de sécurité désigné',t:'text'},
    {k:'charge_securite_tel',l:'Téléphone',t:'text'},
    {k:'sdis_contact',l:'Contact SDIS',t:'text'},
    {k:'mairie_contact',l:'Contact mairie',t:'text'},
    {k:'assureur',l:'Assureur',t:'text'},
    {k:'police_assurance',l:'N° de police',t:'text'},
    {k:'observations',l:'Observations',t:'textarea'}
  ];
  RS_MODULES.etab.champs=ch;
  document.getElementById('rsModTitre').textContent='Identité ERP de l’établissement';
  document.getElementById('rsForm').innerHTML=ch.map(c=>rsChamp(c,RS_ETAB?RS_ETAB[c.k]:null)).join('');
  document.getElementById('rsSaveBtn').style.display='';
  document.getElementById('rsDel').style.display='none';
  document.getElementById('ovRS').classList.add('on');
}
function rsChamp(c,v){
  const id='rsc_'+c.k;
  let inp='';
  if(c.t==='textarea')inp=`<textarea id="${id}">${esc(v||'')}</textarea>`;
  else if(c.t==='select'){
    const o=(c.opts?c.opts():[]).map(x=>`<option value="${esc(x.v)}"${String(v)===String(x.v)?' selected':''}>${esc(x.l)}</option>`).join('');
    inp=`<select id="${id}"><option value=""></option>${o}</select>`;
  }
  else if(c.t==='bool')inp=`<label class="rs-sw"><input type="checkbox" id="${id}"${v?' checked':''}> Oui</label>`;
  else if(c.t==='file')inp=`<input type="file" id="${id}">`+(v?`<a class="rs-a" target="_blank" href="${esc(v)}"><i class="ti ti-paperclip"></i> Fichier actuel</a>`:'');
  else if(c.t==='num')inp=`<input type="number" step="any" id="${id}" value="${v==null?'':esc(v)}">`;
  else if(c.t==='date')inp=`<input type="date" id="${id}" value="${v?String(v).slice(0,10):''}">`;
  else inp=`<input id="${id}" value="${esc(v||'')}">`;
  return `<div class="f"><label>${esc(c.l)}${c.req?' *':''}</label>${inp}</div>`;
}

async function rsUpload(file,mod){
  const path='registre-securite/'+RS_CRECHE+'/'+mod+'/'+Date.now()+'_'+slug(file.name);
  const{error}=await sb.storage.from('assets').upload(path,file,{upsert:true});
  if(error)throw error;
  return sb.storage.from('assets').getPublicUrl(path).data.publicUrl;
}

async function rsSave(){
  const mod=RS_MODAL_MOD, M=RS_MODULES[mod];
  const row={creche_id:RS_CRECHE};
  for(const c of M.champs){
    const el=document.getElementById('rsc_'+c.k);
    if(!el)continue;
    if(c.t==='file'){
      if(el.files&&el.files[0]){
        try{row[c.k]=await rsUpload(el.files[0],mod);}
        catch(e){console.error(e);toast('Envoi du fichier impossible');return;}
      }
      continue;
    }
    let v;
    if(c.t==='bool')v=el.checked;
    else{v=el.value;if(v==='')v=null;}
    if(c.req&&(v===null||v===''))
      {toast('Champ obligatoire : '+c.l);return;}
    if(c.t==='num'&&v!=null)v=Number(v);
    row[c.k]=v;
  }
  /* Signature : obligatoire sur les exercices et sur la levee d'une reserve. */
  if(RS_SIGNABLE.indexOf(mod)>=0){
    const nom=(document.getElementById('rsc_signataire_nom')||{}).value||'';
    const qual=(document.getElementById('rsc_signataire_qualite')||{}).value||'';
    const deja=RS_EDIT&&RS_EDIT.signature_url;
    if(rsSigObligatoire(mod,row.statut)&&!RS_SIG&&!deja){
      toast(mod==='exercices'?'Signature obligatoire pour consigner un exercice'
                             :'Signature obligatoire pour attester la levée');
      return;
    }
    if((RS_SIG||deja)&&!nom.trim()){toast('Indiquer le nom du signataire');return;}
    row.signataire_nom=nom||null;
    row.signataire_qualite=qual||null;
    if(RS_SIG){
      try{row.signature_url=await rsUploadSig(RS_SIG);}
      catch(e){console.error(e);toast('Envoi de la signature impossible');return;}
      row.signe_le=new Date().toISOString();
    }else if(RS_EDIT&&!deja){
      row.signature_url=null;row.signe_le=null;
    }
  }
  if(mod!=='etab'&&PROF)row.saisi_par=PROF.id;
  /* Échéance stockée pour le tri et les alertes serveur */
  if(mod==='controles'&&row.date_controle){
    const t=RS_TYPES.find(x=>x.id===row.type_id);
    row.date_echeance=(t&&t.periodicite_mois)?rsAddMonths(row.date_controle,t.periodicite_mois):null;
  }
  if(mod==='formations'&&!row.date_recyclage&&row.validite_mois&&row.date_obtention)
    row.date_recyclage=rsAddMonths(row.date_obtention,row.validite_mois);

  let error;
  if(mod==='etab'){
    ({error}=await sb.from('rs_etablissement').upsert(row,{onConflict:'creche_id'}));
  }else if(RS_EDIT){
    ({error}=await sb.from(M.table).update(row).eq('id',RS_EDIT.id));
  }else{
    ({error}=await sb.from(M.table).insert(row));
  }
  if(error){
    console.error('rsSave',error);
    toast(error.code==='42501'?'Droits insuffisants sur cette crèche':'Enregistrement impossible');
    return;
  }
  close_('ovRS');
  toast('Enregistré');
  await rsLoad();
}

async function rsDelCourant(){
  if(!RS_EDIT)return;
  await rsDel(RS_MODAL_MOD,RS_EDIT.id,true);
}
async function rsDel(mod,id,depuisModale){
  if(!confirm('Supprimer définitivement cette écriture ? La suppression sera tracée dans le journal.'))return;
  const{error}=await sb.from(RS_MODULES[mod].table).delete().eq('id',id);
  if(error){console.error(error);toast('Suppression impossible');return;}
  if(depuisModale)close_('ovRS');
  toast('Supprimé');
  await rsLoad();
}

/* ---------- Signature de l'intervenant ---------- */
/* Modules concernes. La signature est obligatoire sur un exercice (aucune autre
   preuve n'existe : pas de rapport externe) et sur la levee d'une reserve (elle
   engage celui qui atteste la correction). Ailleurs elle reste proposee. */
const RS_SIGNABLE=['controles','exercices','reserves'];
let RS_SIG=null;                 /* dataURL de la signature saisie dans la modale */
const RS_SIG_MIN=24;             /* trace minimale en px : sous ce seuil, simple appui */

function rsSigObligatoire(mod,statut){
  if(mod==='exercices')return true;
  if(mod==='reserves')return statut==='levee';
  return false;
}
function rsSigBloc(mod){
  const dejaSigne=RS_EDIT&&RS_EDIT.signature_url;
  const obl=mod==='exercices'
    ? '<span class="req">Signature obligatoire — de la personne ayant conduit l’exercice.</span>'
    : (mod==='reserves'
      ? '<span class="req">Signature obligatoire dès que le statut passe à « Levée ».</span>'
      : '<span class="opt">Signature facultative — utile pour les contrôles sans rapport écrit (aire de jeux, purge du réseau, trousse de secours).</span>');
  return '<div class="rs-sig"><h4>Signature de l’intervenant</h4>'+obl
    +'<div class="f"><label>Nom du signataire</label><input id="rsc_signataire_nom" value="'
      +esc((RS_EDIT&&RS_EDIT.signataire_nom)||'')+'"></div>'
    +'<div class="f"><label>Qualité (technicien, directeur/trice technique, entreprise…)</label><input id="rsc_signataire_qualite" value="'
      +esc((RS_EDIT&&RS_EDIT.signataire_qualite)||'')+'"></div>'
    +'<div id="rsSigHost"></div>'
    +'<div class="acts">'
    +'<button type="button" class="btn btn-g" onclick="rsSigClear()"><i class="ti ti-eraser"></i> Effacer</button>'
    +'<button type="button" class="btn btn-s" onclick="rsSigQr()"><i class="ti ti-qrcode"></i> Faire signer par QR</button>'
    +'</div>'
    +(dejaSigne?'<p class="rs-sg"><i class="ti ti-writing-sign"></i> Signée le '
      +rsFr(String(RS_EDIT.signe_le||'').slice(0,10))+'</p>':'')
    +'</div>';
}
/* Canevas de signature — meme logique que les documents : on cumule la longueur
   de trace sur l'ensemble des traits, pour qu'une signature en plusieurs levers
   de stylo reste valide alors qu'un simple appui ne l'est pas. */
function rsMountSig(){
  const host=document.getElementById('rsSigHost');
  if(!host)return;
  if(host._up){window.removeEventListener('mouseup',host._up);host._up=null;}
  const src=RS_SIG||((RS_EDIT&&RS_EDIT.signature_url)||null);
  if(src){host.innerHTML='<img src="'+esc(src)+'" alt="signature">';return;}
  host.innerHTML='<canvas></canvas>';
  const c=host.querySelector('canvas');
  const r=c.getBoundingClientRect();
  c.width=Math.max(300,r.width)*2;c.height=120*2;
  const ctx=c.getContext('2d');ctx.scale(2,2);
  ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#2B2740';
  let on=false,ink=0,last=null;
  const pt=e=>{const b=c.getBoundingClientRect();const p=e.touches?e.touches[0]:e;
    return[(p.clientX-b.left)*(c.width/2/b.width),(p.clientY-b.top)*(c.height/2/b.height)];};
  const dn=e=>{e.preventDefault();on=true;last=pt(e);ctx.beginPath();ctx.moveTo(last[0],last[1]);};
  const mv=e=>{if(!on)return;e.preventDefault();const p=pt(e);
    if(last)ink+=Math.hypot(p[0]-last[0],p[1]-last[1]);
    last=p;ctx.lineTo(p[0],p[1]);ctx.stroke();};
  const up=()=>{if(!on)return;on=false;
    if(ink<RS_SIG_MIN){ctx.clearRect(0,0,c.width,c.height);RS_SIG=null;ink=0;last=null;return;}
    RS_SIG=c.toDataURL('image/png');};
  c.addEventListener('mousedown',dn);c.addEventListener('mousemove',mv);
  window.addEventListener('mouseup',up);host._up=up;
  c.addEventListener('touchstart',dn,{passive:false});
  c.addEventListener('touchmove',mv,{passive:false});
  c.addEventListener('touchend',up);c.addEventListener('touchcancel',up);
}
function rsSigClear(){
  if(RS_EDIT&&RS_EDIT.signature_url&&PROF&&PROF.role!=='direction')
    return toast('Une écriture signée ne peut plus être modifiée');
  RS_SIG=null;
  if(RS_EDIT)RS_EDIT=Object.assign({},RS_EDIT,{signature_url:null});
  rsMountSig();
}
/* Signature a distance : le QR ouvre signature.html sur le telephone de
   l'intervenant. Lien valable 30 min, releve toutes les 3 s. */
async function rsSigQr(){
  const nom=(document.getElementById('rsc_signataire_nom')||{}).value||'';
  const M=RS_MODULES[RS_MODAL_MOD];
  qrToken=mkToken();
  const{error}=await sb.from('signatures_pending').insert({
    token:qrToken,role_sign:'intervenant',
    signataire:nom||'Intervenant',
    contexte:'Registre de sécurité — '+M.titre+(nom?' — '+nom:''),
    source:'registre',cible_table:M.table,cible_id:RS_EDIT?RS_EDIT.id:null,
    created_by:ME.id
  });
  if(error){qrToken=null;return toast('Erreur : '+error.message);}
  const url=location.origin+location.pathname.replace(/[^/]*$/,'')+'signature.html?t='+qrToken;
  document.getElementById('qrTitle').textContent='Signature de l’intervenant';
  const box=document.getElementById('qrBox');box.innerHTML='';
  QR_URL=url;
  let fait=false;
  if(typeof QRCode==='function'){
    try{new QRCode(box,{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});fait=true;}
    catch(e){console.warn('QRCode lib KO',e);}
  }
  if(!fait){
    const img=document.createElement('img');img.width=220;img.height=220;img.alt='QR';
    img.src='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(url);
    box.appendChild(img);
  }
  const lien=document.createElement('div');
  lien.style.cssText='margin-top:12px;font-size:11px;word-break:break-all;color:var(--muted);line-height:1.4';
  lien.textContent=url;box.appendChild(lien);
  const cp=document.createElement('button');
  cp.className='btn btn-s';cp.style.marginTop='8px';
  cp.innerHTML='<i class="ti ti-copy"></i> Copier le lien';
  cp.onclick=()=>{navigator.clipboard.writeText(QR_URL).then(()=>toast('Lien copié'),()=>toast('Copie impossible'));};
  box.appendChild(cp);
  if(PartageLien.disponible()){
    const pt=document.createElement('button');
    pt.className='btn btn-s';pt.style.cssText='margin-top:8px;margin-left:6px';
    pt.innerHTML='<i class="ti ti-share"></i> Partager…';
    pt.onclick=()=>{PartageLien.partager(QR_URL,{titre:'Signature',texte:'Voici le lien pour signer :'})
      .then(r=>{if(r==='copie')toast('Partage indisponible — lien copié.');});};
    box.appendChild(pt);
  }
  document.getElementById('qrWait').textContent='En attente de la signature… (lien valable 30 min)';
  document.getElementById('ovQr').classList.add('on');
  qrTimer=setInterval(rsPollSig,3000);
}
async function rsPollSig(){
  if(!qrToken)return;
  const{data}=await sb.from('signatures_pending').select('signature_data,signed_at')
    .eq('token',qrToken).maybeSingle();
  if(data&&data.signature_data){
    RS_SIG=data.signature_data;
    stopQr();rsMountSig();toast('Signature reçue');
  }
}
/* Le trace part dans le bucket : une signature en base gonflerait chaque
   chargement du registre de toutes les signatures deja enregistrees. */
async function rsUploadSig(dataUrl){
  const blob=await (await fetch(dataUrl)).blob();
  const path='registre-securite/'+RS_CRECHE+'/signatures/'+Date.now()+'.png';
  const{error}=await sb.storage.from('assets').upload(path,blob,{upsert:true,contentType:'image/png'});
  if(error)throw error;
  return sb.storage.from('assets').getPublicUrl(path).data.publicUrl;
}
/* Mention de signature affichee dans les listes */
function rsSigLigne(r){
  if(!r.signature_url)return '';
  return '<span class="rs-sg"><i class="ti ti-writing-sign"></i> Signé par '
    +esc(r.signataire_nom||'intervenant')
    +(r.signataire_qualite?' ('+esc(r.signataire_qualite)+')':'')
    +(r.signe_le?' le '+rsFr(String(r.signe_le).slice(0,10)):'')+'</span>';
}

/* ---------- Export PDF du registre complet ---------- */
/* Les polices integrees de jsPDF (helvetica) sont encodees en WinAnsi : tout
   caractere hors de cette table sort en charabia et fausse le calcul de
   largeur de splitTextToSize. On remplace donc les symboles courants par un
   equivalent lisible et on ecarte le reste avant impression. */
const RS_WA_MAP={'\u2264':'<=','\u2265':'>=','\u2260':'!=','\u2248':'~',
  '\u2192':'->','\u2190':'<-','\u2191':'^','\u2193':'v','\u21d2':'=>',
  '\u00b1':'+/-','\u2044':'/','\u2032':"'",'\u2033':'"','\u00a0':' ','\u202f':' '};
const RS_WA_OK='\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039'
  +'\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161'
  +'\u203a\u0153\u017e\u0178';
function rsWA(t){
  let o='';
  for(const c of String(t==null?'':t)){
    if(RS_WA_MAP[c]){o+=RS_WA_MAP[c];continue;}
    if(c.codePointAt(0)<256||RS_WA_OK.indexOf(c)>=0){o+=c;continue;}
    /* lettre accentuee exotique : on retombe sur sa forme de base */
    const d=c.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    o+=(d.codePointAt(0)<256)?d:'';
  }
  return o;
}
/* Recupere une signature du bucket sous forme de dataURL pour jsPDF. */
async function rsSigImg(url){
  try{
    const b=await (await fetch(url)).blob();
    return await new Promise((res,rej)=>{
      const f=new FileReader();f.onload=()=>res(f.result);f.onerror=rej;f.readAsDataURL(b);});
  }catch(e){console.warn('signature PDF',e);return null;}
}
async function rsPdf(){
  if(!window.jspdf){toast('Librairie PDF non chargée');return;}
  /* Prechargement : jsPDF ne sait pas embarquer une image distante a la volee. */
  const SIG={};
  const aCharger=[].concat(RS_DATA.controles||[],RS_DATA.exercices||[],RS_DATA.reserves||[])
    .filter(r=>r.signature_url);
  for(const r of aCharger){if(!SIG[r.signature_url])SIG[r.signature_url]=await rsSigImg(r.signature_url);}
  const sig=(r)=>{
    if(!r.signature_url)return;
    ligne('   Signé par '+(r.signataire_nom||'intervenant')
      +(r.signataire_qualite?' ('+r.signataire_qualite+')':'')
      +(r.signe_le?' le '+rsFr(String(r.signe_le).slice(0,10)):''));
    const d=SIG[r.signature_url];
    if(!d)return;
    need(18);
    try{doc.addImage(d,'PNG',18,y,34,13);y+=15;}catch(e){console.warn('addImage signature',e);}
  };
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const W=182;
  let y=pdfLogo(doc,20);
  const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
  const cr=(CRECHES||[]).find(c=>c.id===RS_CRECHE)||{};
  const et=etabDe(RS_CRECHE);
  const titre=(t)=>{need(14);doc.setFillColor(74,63,159);doc.rect(14,y-4,W,8,'F');
    doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(11);
    doc.text(rsWA(t),16,y+1.5);doc.setTextColor(40);y+=11;};
  const ligne=(t,gras)=>{doc.setFont('helvetica',gras?'bold':'normal');doc.setFontSize(9.5);
    const ls=doc.splitTextToSize(rsWA(t),W-4);need(ls.length*4.6+2);
    doc.text(ls,16,y);y+=ls.length*4.6+1.5;};

  doc.setFont('helvetica','bold');doc.setFontSize(17);doc.setTextColor(74,63,159);
  doc.text(rsWA('Registre de sécurité'),14,y);y+=8;
  doc.setFontSize(12);doc.setTextColor(40);
  doc.text(rsWA(et.raison_sociale||cr.name||''),14,y);y+=6;
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(120);
  const coord=[cr.addr,et.siret?'SIRET '+et.siret:null,et.pmi_numero?'Agrément PMI '+et.pmi_numero:null]
    .filter(Boolean).join(' — ');
  if(coord){doc.text(rsWA(coord),14,y);y+=5;}
  doc.text(rsWA('Article R.143-44 du code de la construction et de l’habitation — ERP type '
    +((RS_ETAB&&RS_ETAB.erp_type)||'R')+', '+((RS_ETAB&&RS_ETAB.erp_categorie)||'5e')+' catégorie'),14,y);y+=5;
  doc.text(rsWA('Édité le '+rsFr(rsToday())+' par '+((PROF&&PROF.name)||'')),14,y);y+=9;
  doc.setTextColor(40);

  const e=RS_ETAB||{};
  titre('1 — Identité de l’établissement');
  ligne('Effectif public autorisé : '+(e.effectif_public||'—')+'   |   Personnel : '+(e.effectif_personnel||'—'));
  ligne('Locaux à sommeil : '+(e.locaux_sommeil===false?'non':'oui')+'   |   Niveaux : '+(e.etages||'—'));
  ligne('Avis de la commission de sécurité : '+(e.avis_commission||'—')+(e.avis_commission_le?' du '+rsFr(e.avis_commission_le):''));
  ligne('Prochaine visite : '+(e.prochaine_visite?rsFr(e.prochaine_visite):'—'));
  ligne('Chargé de sécurité : '+(e.charge_securite||'—')+(e.charge_securite_tel?' — '+e.charge_securite_tel:''));
  ligne('Assurance : '+(e.assureur||'—')+(e.police_assurance?' — police '+e.police_assurance:''));
  y+=3;

  titre('2 — État des vérifications périodiques');
  rsEcheancier().forEach(x=>{
    const st=x.etat==='retard'?'ÉCHU':(x.etat==='jamais'?'JAMAIS RÉALISÉ':(x.etat==='proche'?'à échéance':'à jour'));
    ligne(x.type.libelle+' — dernier : '+rsFr(x.last&&x.last.date_controle)
      +(x.due?' / prochain : '+rsFr(x.due):'')+'  ['+st+']');
  });
  y+=3;

  titre('3 — Contrôles consignés');
  const cs=(RS_DATA.controles||[]).slice().sort((a,b)=>String(b.date_controle).localeCompare(String(a.date_controle)));
  if(!cs.length)ligne('Aucun contrôle consigné.');
  cs.forEach(r=>{
    const t=RS_TYPES.find(x=>x.id===r.type_id);
    ligne(rsFr(r.date_controle)+' — '+(t?t.libelle:(r.libelle_libre||'Contrôle'))
      +' — '+(r.organisme||'organisme non précisé')+' — '+rsLib('resultat',r.resultat),true);
    if(r.observations)ligne('   '+r.observations);
    sig(r);
  });
  y+=3;

  titre('4 — Exercices d’évacuation et de mise en sûreté');
  const xs=(RS_DATA.exercices||[]).slice().sort((a,b)=>String(b.date_exercice).localeCompare(String(a.date_exercice)));
  if(!xs.length)ligne('Aucun exercice consigné.');
  xs.forEach(x=>{
    ligne(rsFr(x.date_exercice)+' — '+rsLib('type',x.type)+(x.inopine?' (inopiné)':'')
      +(x.duree_secondes?' — évacuation en '+x.duree_secondes+' s':'')
      +(x.nb_enfants!=null?' — '+x.nb_enfants+' enfants':''),true);
    if(x.difficultes)ligne('   Difficultés : '+x.difficultes);
    if(x.actions_correctives)ligne('   Actions correctives : '+x.actions_correctives);
    sig(x);
  });
  y+=3;

  titre('5 — Personnel formé à la sécurité');
  const fs=(RS_DATA.formations||[]).slice();
  if(!fs.length)ligne('Aucune formation consignée.');
  fs.forEach(f=>{
    const d=f.date_recyclage||(f.validite_mois?rsAddMonths(f.date_obtention,f.validite_mois):null);
    ligne(f.personne+' — '+rsLib('type_formation',f.type_formation)
      +' — obtenue le '+rsFr(f.date_obtention)+(d?' — valide jusqu’au '+rsFr(d):''));
  });
  y+=3;

  titre('6 — Travaux et aménagements');
  const ts=(RS_DATA.travaux||[]).slice().sort((a,b)=>String(b.date_debut).localeCompare(String(a.date_debut)));
  if(!ts.length)ligne('Aucun travaux consigné.');
  ts.forEach(t=>{
    ligne(rsFr(t.date_debut)+(t.date_fin?' → '+rsFr(t.date_fin):'')+' — '+t.intitule
      +(t.entreprise?' — '+t.entreprise:'')+(t.incidence_erp?' — INCIDENCE ERP':''),true);
    if(t.description)ligne('   '+t.description);
    if(t.autorisation_ref)ligne('   Autorisation : '+t.autorisation_ref);
  });
  y+=3;

  titre('7 — Réserves et prescriptions');
  const rs=(RS_DATA.reserves||[]).slice();
  if(!rs.length)ligne('Aucune réserve consignée.');
  rs.forEach(r=>{
    ligne(rsFr(r.date_constat)+' — '+r.intitule+' — '+rsLib('origine',r.origine)
      +' — '+rsLib('statut',r.statut)+(r.date_levee?' le '+rsFr(r.date_levee):''),true);
    if(r.action_menee)ligne('   Action : '+r.action_menee);
    sig(r);
  });

  need(20);y+=6;
  doc.setFont('helvetica','italic');doc.setFontSize(8);doc.setTextColor(120);
  doc.text(doc.splitTextToSize(rsWA('Extrait certifié conforme du registre de sécurité numérique. '
    +'Les écritures sont horodatées et nominatives, conservées de façon inaltérable dans le journal de la structure.'),W),14,y);
  if(RESEAU.pied_page){
    y+=6;need(10);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120);
    doc.text(doc.splitTextToSize(rsWA(RESEAU.pied_page),W),14,y);
  }

  pdfSortie(doc,'Registre_securite_'+slug(et.raison_sociale||cr.name||'creche')+'_'+rsToday()+'.pdf');
}
async function rsApercu(){PDF_APERCU=true;try{await rsPdf();}finally{PDF_APERCU=false;}}

