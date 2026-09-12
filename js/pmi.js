// ══════════════════════════════════════════════════════════════════════════
// EXPORT PLANNING PMI (Excel) — Planning équipe, mise en forme PMI
//
// Génère, pour la crèche et le nombre de semaines sélectionnés dans le module
// « Planning équipe », un classeur Excel au format attendu par la PMI :
// grille 7h→19h par tranches de 1/4h, une couleur par salarié·e, heures
// travaillées et lignes réglementaires (encadrement, effectif) à compléter.
//
// Les données horaires viennent de planning_equipe (déjà importées depuis
// Gertrude / Excel). La qualification de chaque salarié·e n'est en revanche
// pas stockée en base : elle est saisie une fois dans la petite modale ci-
// dessous, puis mémorisée par crèche dans le navigateur (localStorage) pour
// ne plus avoir à la ressaisir la fois suivante.
// ══════════════════════════════════════════════════════════════════════════

// Les deux groupes reprennent tels quels le 1° et le 2° de l'art. R2324-42 du code de la
// santé publique : ils déterminent automatiquement si les heures d'un·e salarié·e comptent
// dans la colonne « personnel diplômé » ou « personnel qualifié » du tableau PMI.
// Diplômes cités au 1° de l'article R2324-42 : ils relèvent du 1° quelle que soit l'ancienneté.
const PMI_QUALIF_DIPLOME=[
  'Puéricultrice DE','Éducateur·trice de jeunes enfants DE','Auxiliaire de puériculture DE',
  'Infirmier·ère DE','Psychomotricien·ne DE'
];
// Qualifications du 2° tant que l'ancienneté requise n'est pas atteinte.
const PMI_QUALIF_QUALIFIE=[
  'CAP AEPE',"Assistant·e maternel·le agréé·e",
  'Alternant·e EJE','Alternant·e CAP AEPE','Autre (certification niveau V petite enfance)'
];
const PMI_QUALIF_OPTIONS=[...PMI_QUALIF_DIPLOME,...PMI_QUALIF_QUALIFIE];

/* Substitution propre aux MICRO-CRÈCHES, prévue par R2324-42 et rappelée en bas du modèle :
   « les professionnels du 1° peuvent être remplacés par des personnes qui justifient d'une
   certification au moins de niveau V […] attestant de compétences dans le champ de l'accueil
   des jeunes enfants et de deux années d'expérience professionnelle, ou d'une expérience
   professionnelle de trois ans comme assistant maternel agréé ».

   Un CAP AEPE (certification de niveau V petite enfance) comptabilisé avec l'ancienneté
   requise bascule donc dans le 1°, c'est-à-dire dans les 40 % de personnel diplômé. Comme
   cela dépend de l'ancienneté de chaque personne — que l'application ne connaît pas — c'est
   une case à cocher dans la modale d'export, mémorisée ensuite par crèche.
   Les alternant·e·s en sont exclus : leur diplôme n'est pas encore acquis. */
const PMI_QUALIF_SANS_SUBSTITUTION=['Alternant·e EJE','Alternant·e CAP AEPE'];
function pmiQualifEligibleSubstitution(q){
  return !!q && !PMI_QUALIF_DIPLOME.includes(q) && !PMI_QUALIF_SANS_SUBSTITUTION.includes(q);
}
function pmiQualifEstDiplome(q,experience){
  if(PMI_QUALIF_DIPLOME.includes(q))return true;
  return !!experience&&pmiQualifEligibleSubstitution(q);
}

// Volume quotidien de repas/entretien et horaires d'accueil des enfants, par crèche.
const PMI_OUVERTURE_DEFAUT='07:30',PMI_FERMETURE_DEFAUT='18:30',PMI_ENTRETIEN_DEFAUT=3.5;

// ── Configuration PMI : une ligne par crèche dans Supabase ───────────────
// Ces réglages (noms de famille, qualifications, ancienneté, temps de bureau, horaires
// d'accueil) ne figurent nulle part ailleurs : planning_equipe ne connaît que les prénoms.
// Ils vivaient dans le localStorage, donc l'export lancé depuis un autre appareil sortait
// avec des colonnes vides — pour un document réglementaire, c'était le défaut à corriger.
// La table pmi_config fait désormais foi ; le localStorage n'est qu'un miroir hors ligne.
//   config = { direction:{prenom,heures}, entretien:{heures,ouverture,fermeture},
//              personnes:{ "<prénom>":{nom,qualif,exp} } }
const PMI_CFG_LS='pmi_config_';
let _pmiCfg={};        // cache mémoire, pour garder des accesseurs synchrones
let pmiSyncOk=true;

function pmiCfgVide(){
  return{direction:{prenom:'',heures:0},
         entretien:{heures:PMI_ENTRETIEN_DEFAUT,ouverture:PMI_OUVERTURE_DEFAUT,fermeture:PMI_FERMETURE_DEFAUT},
         personnes:{}};
}

// Reprise des anciennes clés éparpillées, au premier passage sur un appareil.
// Les prénoms ne sont pas connus d'avance : on balaie le localStorage par préfixe.
function pmiMigrerLocal(crecheId){
  const cfg=pmiCfgVide();
  try{
    const dp=localStorage.getItem('pmiDirPrenom_'+crecheId);
    if(dp!==null)cfg.direction={prenom:dp||'',heures:parseFloat(localStorage.getItem('pmiDirHeures_'+crecheId))||0};
    const h=localStorage.getItem('pmiEntHeures_'+crecheId);
    if(h!==null)cfg.entretien.heures=parseFloat(h)||0;
    const ou=localStorage.getItem('pmiEntOuv_'+crecheId); if(ou)cfg.entretien.ouverture=ou;
    const fe=localStorage.getItem('pmiEntFerm_'+crecheId); if(fe)cfg.entretien.fermeture=fe;
    [['pmiNom_','nom'],['pmiQualif_','qualif'],['pmiExp_','exp']].forEach(([prefixe,champ])=>{
      const base=prefixe+crecheId+'_';
      Object.keys(localStorage).forEach(k=>{
        if(k.indexOf(base)!==0)return;
        const prenom=k.slice(base.length);
        if(!prenom)return;
        if(!cfg.personnes[prenom])cfg.personnes[prenom]={};
        const v=localStorage.getItem(k);
        cfg.personnes[prenom][champ]=(champ==='exp')?(v==='1'):(v||'');
      });
    });
  }catch(e){}
  return cfg;
}

function pmiCfg(crecheId){
  if(_pmiCfg[crecheId])return _pmiCfg[crecheId];
  let c=null;
  try{c=JSON.parse(localStorage.getItem(PMI_CFG_LS+crecheId)||'null');}catch(e){}
  if(!c)c=pmiMigrerLocal(crecheId);
  const base=pmiCfgVide();
  base.direction=Object.assign(base.direction,c.direction||{});
  base.entretien=Object.assign(base.entretien,c.entretien||{});
  base.personnes=c.personnes||{};
  _pmiCfg[crecheId]=base;
  return base;
}

function pmiPersonne(crecheId,prenom){
  const cfg=pmiCfg(crecheId);
  const k=String(prenom||'').trim();
  if(!cfg.personnes[k])cfg.personnes[k]={};
  return cfg.personnes[k];
}

// La modale enregistre personne par personne : on regroupe les écritures pour
// n'envoyer qu'un seul upsert par salve de saisie.
let _pmiPushTimer=null;
function pmiCfgSave(crecheId){
  const cfg=pmiCfg(crecheId);
  try{localStorage.setItem(PMI_CFG_LS+crecheId,JSON.stringify(cfg));}catch(e){}
  clearTimeout(_pmiPushTimer);
  _pmiPushTimer=setTimeout(()=>pmiCfgPush(crecheId,pmiCfg(crecheId)),400);
}

async function pmiCfgPush(crecheId,cfg){
  try{
    const{error}=await sb.from('pmi_config')
      .upsert({creche_id:crecheId,config:cfg,updated_at:new Date().toISOString()},{onConflict:'creche_id'});
    if(error)throw error;
    pmiSyncOk=true;return true;
  }catch(e){pmiSyncOk=false;console.warn('[PMI sync] écriture :',(e&&e.message)||e);return false;}
}

// Lecture avant ouverture de la modale. Fusion plutôt qu'écrasement : au premier
// passage, l'appareil peut détenir des réglages que la base n'a pas encore, et
// l'inverse. La base l'emporte champ par champ quand elle a une valeur renseignée.
async function pmiCfgPull(crecheId){
  try{
    const{data,error}=await sb.from('pmi_config').select('config').eq('creche_id',crecheId).maybeSingle();
    if(error)throw error;
    pmiSyncOk=true;
    if(!data||!data.config){pmiCfgSave(crecheId);return true;} // rien en base : on y dépose le local
    const local=pmiCfg(crecheId), dist=data.config;
    if(dist.direction&&dist.direction.prenom)local.direction=Object.assign({},local.direction,dist.direction);
    if(dist.entretien)local.entretien=Object.assign({},local.entretien,dist.entretien);
    Object.entries(dist.personnes||{}).forEach(([prenom,champs])=>{
      const p=pmiPersonne(crecheId,prenom);
      if(champs.nom)p.nom=champs.nom;
      if(champs.qualif)p.qualif=champs.qualif;
      if(champs.exp!==undefined)p.exp=!!champs.exp;
    });
    pmiCfgSave(crecheId); // les deux versions convergent
    return true;
  }catch(e){pmiSyncOk=false;console.warn('[PMI sync] lecture :',(e&&e.message)||e);return false;}
}

function pmiQualifGet(crecheId,prenom){return pmiPersonne(crecheId,prenom).qualif||'';}
function pmiQualifSet(crecheId,prenom,val){pmiPersonne(crecheId,prenom).qualif=val||'';pmiCfgSave(crecheId);}

function pmiExpGet(crecheId,prenom){return !!pmiPersonne(crecheId,prenom).exp;}
function pmiExpSet(crecheId,prenom,val){pmiPersonne(crecheId,prenom).exp=!!val;pmiCfgSave(crecheId);}

// Noms de famille : planning_equipe ne stocke que le prénom (c'est la clé de l'import
// Gertrude). La PMI attend pourtant un nom complet, saisi une fois dans la modale d'export.
function pmiNomGet(crecheId,prenom){return pmiPersonne(crecheId,prenom).nom||'';}
function pmiNomSet(crecheId,prenom,val){pmiPersonne(crecheId,prenom).nom=val||'';pmiCfgSave(crecheId);}

// Personne assurant la direction / le référent technique, et son volume de bureau
// hebdomadaire : mémorisés par crèche pour ne les saisir qu'une fois.
function pmiDirectionGet(crecheId){
  const d=pmiCfg(crecheId).direction;
  return{prenom:d.prenom||'',heures:parseFloat(d.heures)||0};
}
function pmiDirectionSet(crecheId,prenom,heures){
  pmiCfg(crecheId).direction={prenom:prenom||'',heures:parseFloat(heures)||0};
  pmiCfgSave(crecheId);
}

function pmiEntretienGet(crecheId){
  const e=pmiCfg(crecheId).entretien;
  return{heures:e.heures===undefined?PMI_ENTRETIEN_DEFAUT:(parseFloat(e.heures)||0),
         ouverture:e.ouverture||PMI_OUVERTURE_DEFAUT,
         fermeture:e.fermeture||PMI_FERMETURE_DEFAUT};
}
function pmiEntretienSet(crecheId,heures,ouverture,fermeture){
  pmiCfg(crecheId).entretien={heures:parseFloat(heures)||0,
    ouverture:ouverture||PMI_OUVERTURE_DEFAUT,fermeture:fermeture||PMI_FERMETURE_DEFAUT};
  pmiCfgSave(crecheId);
}

// Pré-remplissage : les référentes ont déjà leur nom complet dans l'annuaire (referents.name).
// On y retrouve le nom de famille quand le prénom correspond, pour éviter une ressaisie.
function pmiNomDepuisAnnuaire(crecheId,prenom){
  const cible=(prenom||'').trim().toLowerCase();
  const r=(cacheReferents||[]).find(x=>{
    if(x.creche_id!==crecheId||!x.name)return false;
    return String(x.name).trim().split(/\s+/)[0].toLowerCase()===cible;
  });
  if(!r)return '';
  return String(r.name).trim().split(/\s+/).slice(1).join(' ');
}

// Nom affiché dans la colonne « NOM/prénom » du tableau PMI.
function pmiNomComplet(prenom,nom){
  const n=(nom||'').trim();
  return n?prenom+' '+n:prenom;
}

// Couleur HSL déterministe par prénom (même principe que peColorForName), convertie
// en hex pour ExcelJS. Calculée sur l'ensemble des prénoms de l'export (toutes
// semaines confondues) pour rester stable d'une semaine à l'autre du même fichier.
function pmiHslToHex(h,s,l){
  s/=100;l/=100;
  const k=n=>(n+h/30)%12;
  const a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  const toHex=x=>Math.round(255*x).toString(16).padStart(2,'0');
  return (toHex(f(0))+toHex(f(8))+toHex(f(4))).toUpperCase();
}
function pmiBuildColorMap(prenoms){
  const sorted=[...new Set(prenoms)].sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
  const map={};
  sorted.forEach((p,i)=>{
    const hue=Math.round(i*360/(sorted.length||1));
    map[p]='FF'+pmiHslToHex(hue,62,32);
  });
  return map;
}

// ── Modale de saisie des qualifications avant export ────────────────────
let _pmiExportCtx=null; // {crecheId, crecheName, weeks:[{semaine,dateDebut,dateFin,rows}], staffList}

function pmiInjecterModale(){
  if(document.getElementById('modal-pmi-export-wrap'))return;
  document.body.insertAdjacentHTML('beforeend',`
<div class="overlay" id="modal-pmi-export-wrap">
  <div class="modal" style="max-width:560px;max-height:86vh;display:flex;flex-direction:column">
    <h3><i class="ti ti-file-spreadsheet"></i> Export planning PMI</h3>
    <!-- .info-box est une flex-row : chaque <strong> deviendrait une colonne et le texte
         s'empilerait sur toute la hauteur de la modale. Le texte est donc regroupé dans un
         seul enfant (un unique élément flex), l'icône restant le second. -->
    <div class="info-box" style="margin-bottom:14px;align-items:flex-start"><i class="ti ti-info-circle" style="font-size:15px;flex:0 0 auto;margin-top:1px"></i>
      <div style="flex:1;min-width:0;line-height:1.5">
        Vérifiez le nom et la qualification de chaque salarié·e (mémorisés pour les prochains exports de
        cette crèche), puis générez le fichier Excel au format PMI.<br>
        En micro-crèche, une certification de niveau V petite enfance (CAP AEPE) compte dans le
        <strong>1°</strong> — le personnel diplômé des 40 % — dès <strong>2 ans d'expérience</strong>
        (3 ans pour un·e assistant·e maternel·le agréé·e) : cochez la case correspondante.
      </div></div>
    <div id="pmi-export-subtitle" style="font-size:12px;color:var(--muted);margin-bottom:10px;font-weight:600"></div>
    <!-- min-height : un élément flex en overflow:auto a min-height:0, il peut donc être
         écrasé à zéro par le reste de la modale et la liste des salariées disparaît. -->
    <div id="pmi-export-list" style="overflow-y:auto;flex:1 1 auto;min-height:140px;margin-bottom:14px"></div>
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">Temps de bureau (hors encadrement)</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <select class="finput" id="pmi-direction-prenom" style="flex:1;min-width:150px;font-size:12px"></select>
        <input class="finput" id="pmi-direction-heures" type="number" min="0" max="35" step="0.25"
               style="flex:0 0 90px;font-size:12px" placeholder="h / semaine">
        <span style="font-size:12px;color:var(--muted)">h par semaine</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">
        Ces heures sont reportées sur la ligne « Direction » et retirées du taux d'encadrement.
        Elles sont placées automatiquement, dans les heures de travail de la personne, au moment
        où son retrait pèse le moins sur l'accueil.</div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">Repas et entretien (hors encadrement)</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input class="finput" id="pmi-entretien-heures" type="number" min="0" max="12" step="0.25"
               style="flex:0 0 90px;font-size:12px" placeholder="h / jour">
        <span style="font-size:12px;color:var(--muted)">h par jour · accueil des enfants de</span>
        <input class="finput" id="pmi-ouverture" type="time" style="flex:0 0 110px;font-size:12px">
        <span style="font-size:12px;color:var(--muted)">à</span>
        <input class="finput" id="pmi-fermeture" type="time" style="flex:0 0 110px;font-size:12px">
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">
        Réparties sur toute l'équipe, en priorité avant l'ouverture et après la fermeture aux
        enfants — les professionnels sont là, les enfants non : ces créneaux ne coûtent rien à
        l'encadrement.</div>
    </div>
    <div class="mactions">
      <button class="btn-cancel" onclick="closeModal('modal-pmi-export-wrap')">Annuler</button>
      <button class="btn-primary" id="pmi-export-btn" onclick="pmiGenerateExcel()"><i class="ti ti-download"></i> Générer le fichier Excel</button>
    </div>
  </div>
</div>`);
}

async function pmiOpenExportModal(){
  const sel=document.getElementById('pe-creche-select');
  const crecheId=isDirection?sel?.value:currentProfile?.creche_id;
  if(!crecheId){alert('Choisissez d\'abord une crèche.');return;}
  const crecheName=cacheCreches.find(c=>c.id===crecheId)?.name||'';
  const nbWeeks=parseInt(document.getElementById('pe-print-weeks')?.value)||1;
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

  const ws0=weekStart();
  const weeks=[];
  for(let w=0;w<nbWeeks;w++){
    const wsW=new Date(ws0);wsW.setDate(ws0.getDate()+7*w);
    const semaine=ipDateToLocalISO(wsW);
    const days5=Array.from({length:5},(_,i)=>{const d=new Date(wsW);d.setDate(wsW.getDate()+i);return d;});
    const rows=await peLoad(crecheId,semaine);
    weeks.push({semaine,dateDebut:fmt(days5[0]),dateFin:fmt(days5[4]),rows,dates:days5.map(ipDateToLocalISO)});
  }
  const withData=weeks.filter(w=>w.rows.length);
  if(!withData.length){alert('Aucune donnée de planning équipe pour cette crèche sur la période choisie.');return;}

  const staffList=[...new Set(weeks.flatMap(w=>w.rows.map(r=>(r.prenom||'').trim())).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));

  // Présences enfants : chargées ici pour que la génération reste immédiate au clic.
  const enfants=await pmiChargerPresencesEnfants(crecheId,weeks);

  _pmiExportCtx={crecheId,crecheName,weeks,staffList,enfantsParDate:enfants.parDate,enfantsSansHoraire:enfants.sansHoraire};

  // Réglages PMI de la crèche : relus en base avant d'afficher la modale, pour que
  // l'export produise le même document depuis l'ordinateur et depuis la tablette.
  await pmiCfgPull(crecheId);
  if(!pmiSyncOk)showBanner('Réglages PMI non synchronisés : vérifiez-les avant de générer le fichier.','error');

  pmiInjecterModale();
  // Direction : par défaut la référente de la crèche si elle figure au planning.
  const selDir=document.getElementById('pmi-direction-prenom');
  const dirEnregistree=pmiDirectionGet(crecheId);
  const refCreche=(cacheReferents||[]).find(r=>r.creche_id===crecheId&&r.name
    &&staffList.some(p=>p.toLowerCase()===String(r.name).trim().split(/\s+/)[0].toLowerCase()));
  const dirDefaut=dirEnregistree.prenom
    ||(refCreche?String(refCreche.name).trim().split(/\s+/)[0]:'');
  selDir.innerHTML='<option value="">— Aucun temps de bureau —</option>'
    +staffList.map(p=>'<option value="'+escHtml(p)+'"'+(p===dirDefaut?' selected':'')+'>'+escHtml(p)+'</option>').join('');
  document.getElementById('pmi-direction-heures').value=dirEnregistree.heures||'';

  const entEnregistre=pmiEntretienGet(crecheId);
  document.getElementById('pmi-entretien-heures').value=entEnregistre.heures||'';
  document.getElementById('pmi-ouverture').value=entEnregistre.ouverture;
  document.getElementById('pmi-fermeture').value=entEnregistre.fermeture;

  document.getElementById('pmi-export-subtitle').textContent=
    crecheName+' — '+(nbWeeks>1?nbWeeks+' semaines à partir du ':'semaine du ')+weeks[0].dateDebut;
  const list=document.getElementById('pmi-export-list');
  list.innerHTML=staffList.map(p=>{
    const saved=pmiQualifGet(crecheId,p);
    const opts='<option value="">— Choisir —</option>'
      +PMI_QUALIF_OPTIONS.map(o=>'<option value="'+escHtml(o)+'"'+(o===saved?' selected':'')+'>'+escHtml(o)+'</option>').join('')
      +'<option value="__autre__"'+(saved&&!PMI_QUALIF_OPTIONS.includes(saved)?' selected':'')+'>Autre (saisir)…</option>';
    const autreVal=(saved&&!PMI_QUALIF_OPTIONS.includes(saved))?saved:'';
    const nom=pmiNomGet(crecheId,p)||pmiNomDepuisAnnuaire(crecheId,p);
    const exp=pmiExpGet(crecheId,p);
    const qualifCourante=(saved&&!PMI_QUALIF_OPTIONS.includes(saved))?saved:saved;
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
      +'<div style="flex:0 0 90px;font-size:13px;font-weight:600">'+escHtml(p)+'</div>'
      +'<input class="finput pmi-nom" data-prenom="'+escHtml(p)+'" placeholder="Nom de famille" value="'+escHtml(nom)+'" style="flex:0 0 130px;font-size:12px">'
      +'<select class="finput pmi-qualif-sel" data-prenom="'+escHtml(p)+'" style="flex:1;min-width:140px;font-size:12px" onchange="pmiOnQualifChange(this)">'+opts+'</select>'
      +'<input class="finput pmi-qualif-autre" data-prenom="'+escHtml(p)+'" placeholder="Qualification…" value="'+escHtml(autreVal)+'" style="flex:1;min-width:140px;font-size:12px;display:'+(autreVal?'':'none')+'">'
      +'<label class="pmi-exp-wrap" data-prenom="'+escHtml(p)+'" style="flex:0 0 100%;font-size:12px;color:var(--muted);display:'
        +(pmiQualifEligibleSubstitution(qualifCourante)?'flex':'none')+';align-items:center;gap:6px;margin-left:98px" '
        +'title="R2324-42 : en micro-crèche, une certification de niveau V petite enfance vaut personnel du 1° à partir de 2 ans d’expérience (3 ans pour un·e assistant·e maternel·le agréé·e).">'
      +'<input type="checkbox" class="pmi-exp" data-prenom="'+escHtml(p)+'"'+(exp?' checked':'')+'> '
      +'Ancienneté requise atteinte — compte dans le 1° (personnel diplômé)</label>'
      +'</div>';
  }).join('');
  document.getElementById('modal-pmi-export-wrap').classList.add('open');
}
window.pmiOpenExportModal=pmiOpenExportModal;

function pmiOnQualifChange(sel){
  const prenom=sel.dataset.prenom.replace(/"/g,'\\"');
  const autre=document.querySelector('.pmi-qualif-autre[data-prenom="'+prenom+'"]');
  if(autre)autre.style.display=sel.value==='__autre__'?'':'none';
  // La case d'ancienneté n'a de sens que pour les qualifications éligibles à la
  // substitution micro-crèche : inutile pour un diplôme du 1°, exclue pour un·e alternant·e.
  const exp=document.querySelector('.pmi-exp-wrap[data-prenom="'+prenom+'"]');
  if(exp){
    const q=sel.value==='__autre__'?(autre?autre.value.trim():''):sel.value;
    const visible=sel.value==='__autre__'||pmiQualifEligibleSubstitution(q);
    exp.style.display=visible?'flex':'none';
    if(!visible){
      const c=document.querySelector('.pmi-exp[data-prenom="'+prenom+'"]');
      if(c)c.checked=false;
    }
  }
}
window.pmiOnQualifChange=pmiOnQualifChange;

function pmiCollectQualifs(){
  const ctx=_pmiExportCtx;
  const map={};
  ctx.staffList.forEach(p=>{
    const sel=document.querySelector('.pmi-qualif-sel[data-prenom="'+p.replace(/"/g,'\\"')+'"]');
    const autre=document.querySelector('.pmi-qualif-autre[data-prenom="'+p.replace(/"/g,'\\"')+'"]');
    const val=(sel&&sel.value==='__autre__')?(autre?autre.value.trim():''):(sel?sel.value:'');
    map[p]=val;
    if(val)pmiQualifSet(ctx.crecheId,p,val);
  });
  return map;
}

function pmiCollectExperience(){
  const ctx=_pmiExportCtx;
  const map={};
  ctx.staffList.forEach(p=>{
    const c=document.querySelector('.pmi-exp[data-prenom="'+p.replace(/"/g,'\\"')+'"]');
    const val=!!(c&&c.checked);
    map[p]=val;
    pmiExpSet(ctx.crecheId,p,val);
  });
  return map;
}

function pmiCollectNoms(){
  const ctx=_pmiExportCtx;
  const map={};
  ctx.staffList.forEach(p=>{
    const inp=document.querySelector('.pmi-nom[data-prenom="'+p.replace(/"/g,'\\"')+'"]');
    const val=inp?inp.value.trim():'';
    map[p]=val;
    if(val)pmiNomSet(ctx.crecheId,p,val);
  });
  return map;
}


// ── Modèle PMI officiel embarqué ─────────────────────────────────────────
// Le classeur « PLANNING équipe PMI.xlsx » fourni par la PMI est embarqué tel quel (base64)
// et sert de gabarit : l'export ne redessine plus la grille, il ouvre ce fichier et se
// contente d'y écrire les noms, les couleurs et les heures. La présentation, les bordures,
// les largeurs de colonnes et les textes réglementaires restent donc rigoureusement
// identiques à l'original. Même principe que le modèle Excel des frais kilométriques.
const PMI_TEMPLATE_B64="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";


// Convertit un horaire (creneau_label, ou à défaut hdebut/hfin/pause) en liste de
// colonnes 1/4h (0=07h00 … 47=18h45) réellement travaillées, pause déduite.
function pmiSlotsForRow(row){
  let segs=(typeof peCreneauSegments==='function')?peCreneauSegments(row.creneau_label):null;
  if(!segs&&row.hdebut&&row.hfin){
    const toMin=s=>{const[h,m]=String(s).split(':').map(Number);return h*60+(m||0);};
    segs=[[toMin(row.hdebut),toMin(row.hfin)]];
    if(row.pause){
      const[p1,p2]=String(row.pause).split('-').map(toMin);
      if(!isNaN(p1)&&!isNaN(p2)&&p2>p1){
        const out=[];
        segs.forEach(([s,e])=>{
          if(p1>s&&p2<e){out.push([s,p1],[p2,e]);}else out.push([s,e]);
        });
        segs=out;
      }
    }
  }
  if(!segs)return{cols:[],minutes:0};
  const cols=[];let minutes=0;
  segs.forEach(([s,e])=>{
    minutes+=Math.max(0,e-s);
    for(let cur=s;cur<e;cur+=15){
      if(cur>=7*60&&cur<19*60)cols.push(4+Math.floor((cur-7*60)/15)); // colonne 1-based (D=4)
    }
  });
  return{cols,minutes};
}

// ── Structure du modèle PMI officiel (feuille « Feuil1 » du classeur embarqué) ──
// Le classeur PMI n'est pas régulier : les blocs de jours ne sont pas espacés de la même
// façon et lundi/mardi n'ont pas la ligne « Nombre d'enfants accueillis » des autres jours.
// On ne redessine donc rien : on remplit les lignes existantes, repérées ici une fois pour
// toutes. `nom` = ligne d'en-tête NOM/prénom, `staff` = première/dernière ligne utilisable
// pour les salarié·e·s, `total` = ligne « Hors encadrement » qui porte les totaux.
// `enfants` = ligne « Nombre d'enfants accueillis ». Elle existe pour les cinq jours, mais
// le modèle a oublié d'en écrire le libellé pour lundi et mardi : on le rétablit au
// remplissage (la mise en forme, elle, est bien présente dans le gabarit).
const PMI_TPL_DAYS=[
  {jour:0, nom:8,  staffFirst:9,  staffLast:14, enfants:15, total:16},
  {jour:1, nom:22, staffFirst:23, staffLast:28, enfants:29, total:30},
  {jour:2, nom:41, staffFirst:42, staffLast:47, enfants:48, total:49},
  {jour:3, nom:56, staffFirst:57, staffLast:62, enfants:63, total:64},
  {jour:4, nom:73, staffFirst:74, staffLast:79, enfants:80, total:81}
];
const PMI_LIBELLE_ENFANTS="Nombre d'enfants accueillis";
const PMI_LIBELLE_DIRECTION='Direction';
const PMI_LIBELLE_ENTRETIEN='Entretien/restauration';
const PMI_TPL_COL_FIRST=4;      // D = 07h00-07h15
const PMI_TPL_COL_LAST=51;      // AY = 18h45-19h00
const PMI_TPL_COL_DIPLOME=52;   // AZ « Nbre heures personnel diplômé * »
const PMI_TPL_COL_QUALIFIE=53;  // BA « Nbre heures personnel qualifié ** »
const PMI_TPL_MAX_STAFF=PMI_TPL_DAYS.reduce((n,d)=>Math.min(n,d.staffLast-d.staffFirst+1),99);

// ATTENTION : ne jamais écrire `cell.fill = …` sur une cellule issue du modèle.
// ExcelJS renvoie pour `cell.style` l'objet de style PARTAGÉ par toutes les cellules qui
// utilisent la même mise en forme, et le raccourci `cell.fill = …` modifie cet objet en
// place : colorier un créneau repeignait donc, en silence, toutes les cellules vides de la
// grille (mêmes bordures = même style). On réaffecte donc toujours un style neuf.
function pmiPeindre(cell,argb){
  cell.style=Object.assign({},cell.style,{fill:{type:'pattern',pattern:'solid',fgColor:{argb:argb}}});
}
function pmiEffacerFond(cell){
  const f=cell.fill;
  if(f&&f.pattern&&f.pattern!=='none')cell.style=Object.assign({},cell.style,{fill:{type:'pattern',pattern:'none'}});
}

/* ── Nombre d'enfants accueillis ───────────────────────────────────────────
   La ligne se déduit des présences enfants déjà enregistrées (import Gertrude ou
   pointage), en comptant pour chaque quart d'heure les enfants présents.

   `presences` porte une ligne par demi-journée (slot M / A) avec, lorsque l'import a
   pu les lire, les horaires réels d'arrivée et de départ. On applique le même ordre de
   priorité que la feuille de présence hebdomadaire :
     1. les horaires réellement enregistrés ce jour-là ;
     2. à défaut ceux du contrat d'accueil couvrant cette date, ramenés à la demi-journée
        concernée quand l'enfant n'est présent que le matin ou que l'après-midi (le contrat
        décrit une journée entière, le prendre tel quel gonflerait le comptage) ;
     3. sans horaire ni contrat exploitable, l'enfant ne peut pas être situé sur la grille :
        il n'est pas compté, et l'export le signale plutôt que d'inventer une amplitude.  */
const PMI_FIN_MATIN=12*60+30;
const PMI_DEBUT_APREM=13*60+30;

function pmiHeureEnMinutes(t){
  const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));
  return m?parseInt(m[1],10)*60+parseInt(m[2],10):null;
}

// Contrat d'accueil applicable à un enfant pour une date donnée (le plus récent qui couvre
// à la fois la période et le jour de la semaine).
function pmiContratPour(contrats,enfantId,dateISO){
  const d=new Date(dateISO+'T12:00:00');
  const jourSemaine=d.getDay()===0?7:d.getDay();   // 1 = lundi … 7 = dimanche
  let choisi=null;
  (contrats||[]).forEach(c=>{
    if(c.enfant_id!==enfantId)return;
    if(c.date_debut&&c.date_debut>dateISO)return;
    if(c.date_fin&&c.date_fin<dateISO)return;
    if(ctParseJours(c.jours).indexOf(jourSemaine)<0)return;
    if(!choisi||(c.date_debut||'')>(choisi.date_debut||''))choisi=c;
  });
  return choisi;
}

async function pmiChargerPresencesEnfants(crecheId,weeks){
  const res={parDate:{},sansHoraire:0};
  try{
    let enfants=(typeof cacheEnfants!=='undefined'?cacheEnfants:[]).filter(e=>e.creche_id===crecheId);
    if(!enfants.length){
      const{data}=await sb.from('enfants').select('id,creche_id').eq('creche_id',crecheId);
      enfants=data||[];
    }
    const ids=enfants.map(e=>e.id);
    if(!ids.length)return res;

    const dates=[];
    weeks.forEach(w=>(w.dates||[]).forEach(d=>{if(dates.indexOf(d)<0)dates.push(d);}));
    if(!dates.length)return res;

    const{data:pres}=await sb.from('presences').select('*').in('presence_date',dates).in('enfant_id',ids);
    if(!pres||!pres.length)return res;

    let contrats=[];
    try{
      const{data}=await sb.from('enfants_contrats').select('*').in('enfant_id',ids);
      contrats=data||[];
    }catch(e){/* table absente : on se contente des horaires enregistrés */}

    // Les deux demi-journées d'un même enfant sont fusionnées en une seule plage.
    const parEnfantDate={};
    pres.forEach(p=>{
      if(p.status!=='present'&&p.status!=='partial')return;
      const k=p.enfant_id+'_'+p.presence_date;
      const o=parEnfantDate[k]||(parEnfantDate[k]={enfant:p.enfant_id,date:p.presence_date,matin:false,aprem:false,hd:null,hf:null});
      const slot=String(p.slot||'').toUpperCase();
      if(slot==='M')o.matin=true;
      if(slot==='A')o.aprem=true;
      const hd=pmiHeureEnMinutes(p.heure_debut),hf=pmiHeureEnMinutes(p.heure_fin);
      if(hd!==null&&(o.hd===null||hd<o.hd))o.hd=hd;
      if(hf!==null&&(o.hf===null||hf>o.hf))o.hf=hf;
    });

    Object.keys(parEnfantDate).forEach(k=>{
      const o=parEnfantDate[k];
      let deb=o.hd,fin=o.hf;
      if(deb===null||fin===null){
        const ct=pmiContratPour(contrats,o.enfant,o.date);
        if(ct){
          deb=pmiHeureEnMinutes(ct.heure_debut);
          fin=pmiHeureEnMinutes(ct.heure_fin);
          if(deb!==null&&fin!==null){
            if(o.matin&&!o.aprem)fin=Math.min(fin,PMI_FIN_MATIN);
            if(o.aprem&&!o.matin)deb=Math.max(deb,PMI_DEBUT_APREM);
          }
        }
      }
      if(deb===null||fin===null||fin<=deb){res.sansHoraire++;return;}
      (res.parDate[o.date]||(res.parDate[o.date]=[])).push([deb,fin]);
    });
  }catch(e){
    console.warn('[PMI] présences enfants indisponibles :',e);
  }
  return res;
}

// Nombre d'enfants présents sur chacun des 48 quarts d'heure de 7h à 19h.
function pmiComptesParQuart(intervalles){
  const comptes=[];
  for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
    const debut=7*60+(c-PMI_TPL_COL_FIRST)*15,fin=debut+15;
    let n=0;
    (intervalles||[]).forEach(iv=>{if(iv[0]<fin&&iv[1]>debut)n++;});
    comptes.push(n);
  }
  return comptes;
}

/* ── Bloc récapitulatif et contrôles réglementaires ────────────────────────
   Le bas du tableau PMI est un petit tableau à deux colonnes dont les en-têtes sont
   « Nbre d'heures d'encadrement des enfants » (AL) et « Taux d'encadrement » (AU),
   pour les trois lignes « Personnel diplômé » (92), « Personnel qualifié » (93) et
   « Total hebdomadaire » (94). Tout s'en déduit des heures déjà calculées jour par jour.

   Les contrôles reprennent les deux textes que le modèle cite lui-même :
     · art. R2324-42 : le personnel du 1° (diplômé) doit représenter au moins 40 % de
       l'effectif — donc des heures d'encadrement ;
     · art. R2324-43-1 : en micro-crèche, l'effectif ne peut être inférieur à deux
       professionnels dès la présence de quatre enfants.
   S'y ajoute le dépassement de la capacité d'accueil de la fiche crèche.

   Le taux « un professionnel pour cinq enfants qui ne marchent pas / huit qui marchent »
   n'est volontairement pas contrôlé : l'application ne sait pas quels enfants marchent,
   et l'inventer donnerait une conformité fausse. */
const PMI_MINI_PROS=2;
const PMI_ENFANTS_DECLENCHEUR=4;
const PMI_PART_DIPLOME_MINI=40;
const PMI_NOMS_JOURS=['lundi','mardi','mercredi','jeudi','vendredi'];

function pmiHeureDeQuart(i){
  const m=7*60+i*15;
  return String(Math.floor(m/60)).padStart(2,'0')+'h'+String(m%60).padStart(2,'0');
}

// Parcourt les 48 quarts d'heure d'une journée et regroupe les quarts consécutifs qui
// présentent la même anomalie, pour signaler « mardi 12h30–13h00 » plutôt que 48 lignes.
function pmiControlerJournee(nomJour,comptesEnfants,staffParQuart,capacite,anomalies){
  let debut=null,detail=null;
  const clore=fin=>{
    if(debut!==null)anomalies.push(nomJour+' '+pmiHeureDeQuart(debut)+'–'+pmiHeureDeQuart(fin)+' : '+detail);
    debut=null;detail=null;
  };
  for(let i=0;i<comptesEnfants.length;i++){
    const e=comptesEnfants[i]||0,p=staffParQuart[i]||0;
    let d=null;
    if(capacite&&e>capacite)d=e+' enfants accueillis pour une capacité de '+capacite;
    else if(e>=PMI_ENFANTS_DECLENCHEUR&&p<PMI_MINI_PROS)
      d=p+' professionnel'+(p>1?'s':'')+' pour '+e+' enfants (minimum 2 dès 4 enfants)';
    if(d!==detail){clore(i);if(d){debut=i;detail=d;}}
  }
  clore(comptesEnfants.length);
}

/* ── Temps de bureau de la direction / du référent technique ───────────────
   Ces heures sont travaillées mais ne relèvent pas de l'encadrement : le modèle leur
   réserve la ligne « Direction », sous l'intitulé « Hors encadrement des enfants ». Elles
   sont donc retirées des heures d'encadrement de la personne, du total du jour et du
   décompte servant aux contrôles de taux.

   Placement : on cherche, à l'intérieur des heures réellement travaillées ce jour-là, la
   plage continue où le retrait de la personne pèse le moins sur l'accueil. Sont écartées
   les plages qui laisseraient moins de deux professionnels avec quatre enfants ou plus
   (R2324-43-1), ou plus aucun professionnel alors que des enfants sont présents. Parmi les
   plages restantes, on privilégie celles où le plus de collègues restent sur le terrain,
   puis celles où les enfants sont les moins nombreux — ce qui fait naturellement tomber le
   temps de bureau sur le milieu de journée, quand les équipes du matin et de l'après-midi
   se chevauchent. */
const PMI_PENALITE_INTERDIT=100000;

function pmiSegmentsContigus(cols){
  if(!cols.length)return[];
  const tri=cols.slice().sort((a,b)=>a-b),segs=[];
  let seg=[tri[0]];
  for(let i=1;i<tri.length;i++){
    if(tri[i]===tri[i-1]+1)seg.push(tri[i]);
    else{segs.push(seg);seg=[tri[i]];}
  }
  segs.push(seg);
  return segs;
}

// Répartit le volume hebdomadaire de bureau sur les jours réellement travaillés par la
// personne : 17,5 h sur cinq jours donnent 3,5 h par jour, mais si elle n'est là que quatre
// jours cette semaine-là, le volume se répartit sur ces quatre jours. Le reliquat dû aux
// arrondis au quart d'heure est ajouté aux premiers jours.
function pmiRepartirBureau(weekInfo,prenom,heuresHebdo){
  const quartsParJour=[0,0,0,0,0];
  if(!prenom||!(heuresHebdo>0))return quartsParJour;
  const dispo=[];
  PMI_TPL_DAYS.forEach(day=>{
    const src=weekInfo.rows.find(x=>x.jour===day.jour&&(x.prenom||'').trim()===prenom);
    const res=src?pmiSlotsForRow(src):{cols:[]};
    const n=(res.cols||[]).filter(c=>c>=PMI_TPL_COL_FIRST&&c<=PMI_TPL_COL_LAST).length;
    if(n>0)dispo.push({jour:day.jour,max:n});
  });
  if(!dispo.length)return quartsParJour;
  let restant=Math.round(heuresHebdo*4);
  const base=Math.floor(restant/dispo.length);
  dispo.forEach(d=>{const n=Math.min(base,d.max);quartsParJour[d.jour]=n;restant-=n;});
  // reliquat : on complète jour par jour, sans dépasser les heures travaillées
  for(let tour=0;tour<4&&restant>0;tour++){
    dispo.forEach(d=>{
      if(restant<=0)return;
      if(quartsParJour[d.jour]<d.max){quartsParJour[d.jour]++;restant--;}
    });
  }
  return quartsParJour;
}

// Le retrait de la personne ne doit jamais faire tomber l'accueil sous le minimum légal.
function pmiRetraitInterdit(col,staffParQuart,comptesEnfants){
  const i=col-PMI_TPL_COL_FIRST;
  const enfants=comptesEnfants[i]||0;
  const restants=(staffParQuart[i]||0)-1;
  return(enfants>=PMI_ENFANTS_DECLENCHEUR&&restants<PMI_MINI_PROS)||(enfants>0&&restants<1);
}

/* On ne cherche que des plages SANS infraction : placer du temps de bureau ne doit jamais
   créer un sous-effectif. Si la durée visée n'entre nulle part, on raccourcit la plage
   plutôt que de la caser en force — le volume non placé est signalé à l'utilisateur. */
function pmiChoisirCreneauBureau(colsTravaillees,nbQuarts,staffParQuart,comptesEnfants){
  if(!colsTravaillees.length||nbQuarts<=0)return[];
  const segments=pmiSegmentsContigus(colsTravaillees);
  for(let n=Math.min(nbQuarts,colsTravaillees.length);n>=1;n--){
    let meilleur=null;
    segments.forEach(seg=>{
      if(seg.length<n)return;
      for(let d=0;d+n<=seg.length;d++){
        const fenetre=seg.slice(d,d+n);
        if(fenetre.some(c=>pmiRetraitInterdit(c,staffParQuart,comptesEnfants)))continue;
        let score=0;
        fenetre.forEach(c=>{
          const i=c-PMI_TPL_COL_FIRST;
          score-=((staffParQuart[i]||0)-1)*10;   // laisser le plus de collègues possible
          score+=comptesEnfants[i]||0;           // à équipe égale, les moments les moins chargés
        });
        if(!meilleur||score<meilleur.score)meilleur={score,cols:fenetre};
      }
    });
    if(meilleur)return meilleur.cols;
  }
  return[];
}

/* ── Temps de repas et d'entretien ─────────────────────────────────────────
   Ces heures sont travaillées mais ne relèvent pas non plus de l'encadrement : elles vont
   sur la ligne « Entretien/restauration ». Contrairement au temps de bureau, elles peuvent
   être réparties sur toute l'équipe, et par petits bouts (préparation du repas, service,
   remise en état, ménage du soir).

   Priorité de placement, dans cet ordre :
     1. les quarts d'heure où aucun enfant n'est accueilli — typiquement avant l'ouverture
        aux enfants et après la fermeture, alors que les professionnels sont déjà là : ces
        créneaux ne coûtent rien à l'encadrement ;
     2. à défaut, les moments où le retrait d'une personne laisse le plus de collègues sur
        le terrain, et où les enfants sont les moins nombreux.
   Comme pour le temps de bureau, aucun créneau qui ferait passer sous le minimum légal
   n'est retenu : le volume non plaçable est signalé plutôt que forcé.

   Chaque quart d'heure est confié à une seule personne, celle qui en a le moins assuré
   jusque-là, pour que la charge tourne réellement sur toute l'équipe. */
function pmiColonneDeHeure(hhmm,defaut){
  const m=/^(\d{1,2}):(\d{2})/.exec(String(hhmm||''));
  if(!m)return defaut;
  const min=parseInt(m[1],10)*60+parseInt(m[2],10);
  return PMI_TPL_COL_FIRST+Math.round((min-7*60)/15);
}

function pmiPlacerEntretien(presences,nbQuarts,staffParQuart,comptesEnfants,colOuverture,colFermeture){
  const choix=[];
  if(nbQuarts<=0)return choix;
  const compteur={};
  presences.forEach(x=>{compteur[x.prenom]=0;});

  const candidats=[];
  for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
    const i=c-PMI_TPL_COL_FIRST;
    const enfants=comptesEnfants[i]||0;
    // La priorité se fonde sur les horaires d'accueil DÉCLARÉS, pas sur l'absence d'enfants
    // enregistrés : une semaine dont les présences n'ont pas été importées ne doit pas passer
    // pour une semaine sans enfants. La légalité du retrait, elle, reste évaluée sur les
    // effectifs réels juste en dessous.
    const horsAccueil=(c<colOuverture||c>=colFermeture)?1:0;
    if(!presences.some(x=>x.cols.indexOf(c)>=0))continue;
    const restants=(staffParQuart[i]||0)-1;
    const interdit=!horsAccueil&&((enfants>=PMI_ENFANTS_DECLENCHEUR&&restants<PMI_MINI_PROS)||(enfants>0&&restants<1));
    if(interdit)continue;
    candidats.push({col:c,horsAccueil:horsAccueil,enfants:enfants,restants:restants});
  }
  candidats.sort((a,b)=>(b.horsAccueil-a.horsAccueil)||(b.restants-a.restants)
                       ||(a.enfants-b.enfants)||(a.col-b.col));

  // Les quarts retenus sont regroupés en blocs continus, chacun confié à UNE personne :
  // sans cela l'attribution alternait toutes les 15 minutes et découpait les lignes
  // individuelles en peigne, ce qui ne correspond à aucune organisation réelle.
  const retenus=candidats.slice(0,nbQuarts).map(c=>c.col).sort((a,b)=>a-b);
  pmiSegmentsContigus(retenus).forEach(seg=>{
    let i=0;
    while(i<seg.length){
      const dispo=presences.filter(x=>x.cols.indexOf(seg[i])>=0)
        .sort((a,b)=>compteur[a.prenom]-compteur[b.prenom]);
      if(!dispo.length){i++;continue;}
      const qui=dispo[0];
      let j=i;
      // bloc de 2 h au plus, pour que la charge tourne quand l'équipe le permet
      while(j<seg.length&&j-i<8&&qui.cols.indexOf(seg[j])>=0){
        choix.push({col:seg[j],prenom:qui.prenom});
        compteur[qui.prenom]++;
        j++;
      }
      i=(j>i)?j:i+1;
    }
  });
  return choix;
}

function pmiEcrireRecap(ws,stats,capacite){
  const arrondi=x=>Math.round(x*100)/100;
  const total=stats.heuresDiplome+stats.heuresQualifie;
  if(stats.heuresOuverture)ws.getCell('O92').value=arrondi(stats.heuresOuverture);
  if(capacite)ws.getCell('O93').value=capacite;
  ws.getCell('AL92').value=arrondi(stats.heuresDiplome);
  ws.getCell('AL93').value=arrondi(stats.heuresQualifie);
  ws.getCell('AL94').value=arrondi(total);
  const pourcent=v=>total?(Math.round(v/total*1000)/10)+' %':'';
  ws.getCell('AU92').value=pourcent(stats.heuresDiplome);
  ws.getCell('AU93').value=pourcent(stats.heuresQualifie);
  ws.getCell('AU94').value=total?'100 %':'';
  return total?stats.heuresDiplome/total*100:null;
}

function pmiB64ToArrayBuffer(b64){
  const bin=atob(b64), out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out.buffer;
}

// Duplique une feuille à l'identique (le modèle sert de base à chaque semaine exportée).
// Les fusions doivent être appliquées AVANT les styles : ExcelJS réinitialise le style des
// cellules intérieures d'une plage au moment du merge, ce qui faisait disparaître les
// bordures droite/bas de toutes les cellules fusionnées du modèle.
function pmiCloneSheet(wb,src,name){
  const ws=wb.addWorksheet(name,{pageSetup:JSON.parse(JSON.stringify(src.pageSetup||{}))});
  ws.columns=src.columns.map(c=>({width:c.width}));
  (src.model.merges||[]).forEach(m=>{try{ws.mergeCells(m);}catch(e){}});
  src.eachRow({includeEmpty:true},(row,rn)=>{
    const nr=ws.getRow(rn);
    if(row.height)nr.height=row.height;
    row.eachCell({includeEmpty:true},(cell,cn)=>{
      const nc=nr.getCell(cn);
      if(cell.type!==ExcelJS.ValueType.Merge&&cell.value!==null&&cell.value!==undefined)nc.value=cell.value;
      nc.style=cell.style;
    });
  });
  return ws;
}

// Remplit une feuille (copie vierge du modèle) avec les horaires d'une semaine.
// Les colonnes « NOM/prénom » (B) et « Qualification » (C) du modèle sont étroites et
// n'ont pas le renvoi à la ligne : un intitulé un peu long (« Psychomotricien·ne DE »)
// débordait ou se retrouvait tronqué. On l'active, et on rehausse la ligne juste ce qu'il
// faut — la hauteur du modèle (27) ne tient qu'une seule ligne de texte.
const PMI_LIGNE_PT=15.75;                                   // hauteur d'une ligne en Arial 12
const PMI_CAR_PAR_LIGNE={2:15,3:11};                        // capacité approx. des colonnes B et C
function pmiNbLignes(texte,colonne){
  const max=PMI_CAR_PAR_LIGNE[colonne]||12;
  let lignes=1,courante=0;
  String(texte||'').split(/\s+/).filter(Boolean).forEach(mot=>{
    while(mot.length>max){                                   // mot plus long que la colonne : coupé
      if(courante>0){lignes++;courante=0;}
      lignes++;mot=mot.slice(max);
    }
    if(courante===0)courante=mot.length;
    else if(courante+1+mot.length<=max)courante+=1+mot.length;
    else{lignes++;courante=mot.length;}
  });
  return Math.min(lignes,3);
}
function pmiTexteAvecRenvoi(cell,valeur){
  cell.value=valeur;
  if(!cell.alignment||!cell.alignment.wrapText)
    cell.style=Object.assign({},cell.style,{alignment:Object.assign({},cell.alignment,{wrapText:true})});
}

function pmiFillSheet(ws,weekInfo,crecheName,staffList,qualifMap,nomMap,colorMap,enfantsParDate,capacite,expMap,direction,entretien){
  ws.getCell('B2').value=crecheName;
  ws.getCell('AZ1').value=weekInfo.dateDebut+' - '+weekInfo.dateFin;

  const stats={heuresDiplome:0,heuresQualifie:0,heuresOuverture:0,heuresBureau:0,bureau:[],
                heuresEntretien:0,entretien:[],parPersonne:{},anomalies:[]};
  // Suivi des heures de chacun : le temps de bureau et l'entretien sont PRÉLEVÉS sur les
  // heures déjà planifiées, jamais ajoutés — ce récapitulatif permet de le vérifier et de
  // comparer le total hebdomadaire de chacun à son contrat.
  const compter=(prenom,champ,heures)=>{
    const o=stats.parPersonne[prenom]||(stats.parPersonne[prenom]={planifie:0,encadrement:0,direction:0,entretien:0});
    o[champ]+=heures;
  };

  PMI_TPL_DAYS.forEach(day=>{
    // 1) remise à zéro : le modèle fourni contient encore quelques valeurs d'un remplissage
    //    manuel antérieur (des totaux en AZ notamment) qu'il ne faut pas laisser passer.
    for(let r=day.staffFirst;r<=day.staffLast;r++){
      ws.getCell(r,2).value=null;
      ws.getCell(r,3).value=null;
      ws.getCell(r,PMI_TPL_COL_DIPLOME).value=null;
      ws.getCell(r,PMI_TPL_COL_QUALIFIE).value=null;
      for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
        const cell=ws.getCell(r,c);
        cell.value=null;
        pmiEffacerFond(cell);
      }
    }
    ws.getCell(day.total,PMI_TPL_COL_DIPLOME).value=null;
    ws.getCell(day.total,PMI_TPL_COL_QUALIFIE).value=null;

    // 2) créneaux de chacun, AVANT toute écriture : le placement du temps de bureau a
    //    besoin de connaître l'équipe présente et l'effectif enfants de la journée.
    const dayRows=weekInfo.rows.filter(x=>x.jour===day.jour);
    const staffParQuart=new Array(PMI_TPL_COL_LAST-PMI_TPL_COL_FIRST+1).fill(0);
    let colMin=null,colMax=null;
    const presences=staffList.slice(0,PMI_TPL_MAX_STAFF).map((p,i)=>{
      const src=dayRows.find(x=>(x.prenom||'').trim()===p);
      const res=src?pmiSlotsForRow(src):{cols:[],minutes:0};
      const cols=(res.cols||[]).filter(c=>c>=PMI_TPL_COL_FIRST&&c<=PMI_TPL_COL_LAST);
      compter(p,'planifie',cols.length*0.25);
      cols.forEach(c=>{
        // Un créneau travaillé = un professionnel présent auprès des enfants
        // (la pause, absente de res.cols, ne compte donc pas dans l'encadrement).
        staffParQuart[c-PMI_TPL_COL_FIRST]++;
        if(colMin===null||c<colMin)colMin=c;
        if(colMax===null||c>colMax)colMax=c;
      });
      return{prenom:p,ligne:day.staffFirst+i,cols:cols};
    });

    const dateISO=(weekInfo.dates||[])[day.jour];
    const comptes=pmiComptesParQuart(enfantsParDate&&dateISO?enfantsParDate[dateISO]:null);

    // 3) temps de bureau de la direction : retiré de l'encadrement, reporté ligne « Direction »
    let colsBureau=[];
    if(direction&&direction.quartsParJour[day.jour]>0){
      const cible=presences.find(x=>x.prenom===direction.prenom);
      if(cible&&cible.cols.length){
        colsBureau=pmiChoisirCreneauBureau(cible.cols,direction.quartsParJour[day.jour],staffParQuart,comptes);
        const retire=new Set(colsBureau);
        cible.cols=cible.cols.filter(c=>!retire.has(c));
        colsBureau.forEach(c=>{staffParQuart[c-PMI_TPL_COL_FIRST]--;});
        compter(direction.prenom,'direction',colsBureau.length*0.25);
      }
    }

    // 3 bis) repas et entretien : répartis sur toute l'équipe, hors encadrement
    let choixEntretien=[];
    if(entretien&&entretien.quarts>0){
      choixEntretien=pmiPlacerEntretien(presences,entretien.quarts,staffParQuart,comptes,
        entretien.colOuverture,entretien.colFermeture);
      choixEntretien.forEach(ch=>{
        const cible=presences.find(x=>x.prenom===ch.prenom);
        if(cible)cible.cols=cible.cols.filter(c=>c!==ch.col);
        staffParQuart[ch.col-PMI_TPL_COL_FIRST]--;
        compter(ch.prenom,'entretien',0.25);
      });
    }

    // 4) écriture des lignes salarié·e·s
    let totalDiplome=0,totalQualifie=0;
    presences.forEach(x=>{
      const p=x.prenom,r=x.ligne;
      const nomAffiche=pmiNomComplet(p,nomMap&&nomMap[p]);
      const qualif=qualifMap[p]||'';
      pmiTexteAvecRenvoi(ws.getCell(r,2),nomAffiche);
      pmiTexteAvecRenvoi(ws.getCell(r,3),qualif);
      const lignes=Math.max(pmiNbLignes(nomAffiche,2),pmiNbLignes(qualif,3));
      const ligne=ws.getRow(r);
      const besoin=lignes*PMI_LIGNE_PT;
      if(besoin>(ligne.height||0))ligne.height=besoin;
      if(!x.cols.length)return;
      const argb=colorMap[p]||'FF3D3580';
      x.cols.forEach(c=>pmiPeindre(ws.getCell(r,c),argb));
      const h=Math.round(x.cols.length*0.25*100)/100;
      compter(p,'encadrement',h);
      const diplome=pmiQualifEstDiplome(qualif,expMap&&expMap[p]);
      ws.getCell(r,diplome?PMI_TPL_COL_DIPLOME:PMI_TPL_COL_QUALIFIE).value=h;
      if(diplome)totalDiplome+=h;else totalQualifie+=h;
    });

    // 5) totaux du jour, sur la ligne « Hors encadrement » comme dans le modèle
    if(totalDiplome)ws.getCell(day.total,PMI_TPL_COL_DIPLOME).value=Math.round(totalDiplome*100)/100;
    if(totalQualifie)ws.getCell(day.total,PMI_TPL_COL_QUALIFIE).value=Math.round(totalQualifie*100)/100;

    // 6) lignes « Direction » et « Entretien/restauration » : le modèle n'en porte le
    //    libellé que le lundi, on le rétablit comme pour la ligne des enfants.
    const rDirection=day.total+1,rEntretien=day.total+2;
    if(!ws.getCell(rDirection,2).value)ws.getCell(rDirection,2).value=PMI_LIBELLE_DIRECTION;
    if(!ws.getCell(rEntretien,2).value)ws.getCell(rEntretien,2).value=PMI_LIBELLE_ENTRETIEN;
    for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
      pmiEffacerFond(ws.getCell(rDirection,c));
      pmiEffacerFond(ws.getCell(rEntretien,c));
    }
    // Bout de ligne : le volume horaire hors encadrement de la journée. Il est écrit dans la
    // seule colonne AZ — la colonne BA reste vide — pour qu'il se lise comme un total de
    // ligne et non comme des heures d'encadrement ventilées diplômé / qualifié.
    ws.getCell(rDirection,PMI_TPL_COL_DIPLOME).value=null;
    ws.getCell(rDirection,PMI_TPL_COL_QUALIFIE).value=null;
    ws.getCell(rEntretien,PMI_TPL_COL_DIPLOME).value=null;
    ws.getCell(rEntretien,PMI_TPL_COL_QUALIFIE).value=null;

    if(colsBureau.length){
      const argb=(direction&&colorMap[direction.prenom])||'FF3D3580';
      colsBureau.forEach(c=>pmiPeindre(ws.getCell(rDirection,c),argb));
      const segs=pmiSegmentsContigus(colsBureau)
        .map(s=>pmiHeureDeQuart(s[0]-PMI_TPL_COL_FIRST)+'–'+pmiHeureDeQuart(s[s.length-1]-PMI_TPL_COL_FIRST+1));
      const hBureau=Math.round(colsBureau.length*0.25*100)/100;
      ws.getCell(rDirection,PMI_TPL_COL_DIPLOME).value=hBureau;
      stats.bureau.push(PMI_NOMS_JOURS[day.jour]+' '+segs.join(' et ')
        +' ('+hBureau+' h)');
      stats.heuresBureau+=colsBureau.length*0.25;
    }

    if(choixEntretien.length){
      choixEntretien.forEach(ch=>pmiPeindre(ws.getCell(rEntretien,ch.col),colorMap[ch.prenom]||'FF3D3580'));
      const segs=pmiSegmentsContigus(choixEntretien.map(ch=>ch.col))
        .map(sg=>pmiHeureDeQuart(sg[0]-PMI_TPL_COL_FIRST)+'–'+pmiHeureDeQuart(sg[sg.length-1]-PMI_TPL_COL_FIRST+1));
      const hEntretien=Math.round(choixEntretien.length*0.25*100)/100;
      ws.getCell(rEntretien,PMI_TPL_COL_DIPLOME).value=hEntretien;
      stats.entretien.push(PMI_NOMS_JOURS[day.jour]+' '+segs.join(', ')
        +' ('+hEntretien+' h)');
      stats.heuresEntretien+=choixEntretien.length*0.25;
    }

    // 7) nombre d'enfants accueillis, quart d'heure par quart d'heure
    if(!ws.getCell(day.enfants,2).value)ws.getCell(day.enfants,2).value=PMI_LIBELLE_ENFANTS;
    for(let c=PMI_TPL_COL_FIRST;c<=PMI_TPL_COL_LAST;c++){
      const n=comptes[c-PMI_TPL_COL_FIRST];
      ws.getCell(day.enfants,c).value=n>0?n:null;   // hors accueil : case laissée vide
    }

    // 8) cumuls de la semaine et contrôles réglementaires du jour
    stats.heuresDiplome+=totalDiplome;
    stats.heuresQualifie+=totalQualifie;
    // Amplitude d'ouverture : de la première arrivée au dernier départ, pauses incluses.
    if(colMin!==null)stats.heuresOuverture+=(colMax-colMin+1)*0.25;
    pmiControlerJournee(PMI_NOMS_JOURS[day.jour],comptes,staffParQuart,capacite,stats.anomalies);
  });

  const partDiplome=pmiEcrireRecap(ws,stats,capacite);
  if(partDiplome!==null&&partDiplome<PMI_PART_DIPLOME_MINI)
    stats.anomalies.unshift('sur la semaine, '+(Math.round(partDiplome*10)/10)
      +' % des heures d\'encadrement sont assurées par du personnel diplômé (minimum 40 % — art. R2324-42)');

  // Rien d'autre n'est touché : le bloc du lundi n'a pas le libellé « Total des heures
  // d'encadrement » des quatre autres jours, mais l'ajouter obligerait à fusionner AN16:AY16
  // et ferait disparaître le quadrillage de ces cellules. Le modèle reste tel qu'il est.
  return stats;
}

// ExcelJS réécrit la police par défaut du classeur (police n°0) en Calibri 11, alors que le
// modèle PMI utilise Calibri 10. Ce détail n'est pas cosmétique : Excel exprime la largeur
// des colonnes en nombre de caractères de CETTE police, si bien qu'à valeur de largeur
// identique la grille des quarts d'heure sortait sensiblement plus large que sur l'original.
// On rétablit donc la police d'origine dans styles.xml, une fois le classeur écrit.
const PMI_POLICE_DEFAUT='<font><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/><scheme val="minor"/></font>';
async function pmiRestaurerPoliceParDefaut(buffer){
  if(typeof JSZip==='undefined')return buffer;
  try{
    const zip=await JSZip.loadAsync(buffer);
    const f=zip.file('xl/styles.xml');
    if(!f)return buffer;
    const xml=await f.async('string');
    const patched=xml.replace(/(<fonts[^>]*>)<font>[\s\S]*?<\/font>/,'$1'+PMI_POLICE_DEFAUT);
    if(patched===xml)return buffer;
    zip.file('xl/styles.xml',patched);
    // DEFLATE explicite : sans lui JSZip réécrit le classeur sans compression, ce qui fait
    // passer le fichier d'une cinquantaine de Ko à plusieurs centaines.
    return await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE',compressionOptions:{level:6}});
  }catch(e){
    console.warn('[PMI] police par défaut non rétablie :',e);
    return buffer;
  }
}

// Les anomalies restent dans l'application : le fichier remis à la PMI n'est jamais annoté.
function pmiAfficherControles(controles,reserves,capacite){
  const total=controles.reduce((n,c)=>n+c.stats.anomalies.length,0);
  if(!total&&!reserves.length)return;
  if(!document.getElementById('modal-pmi-controles-wrap')){
    document.body.insertAdjacentHTML('beforeend',`
<div class="overlay" id="modal-pmi-controles-wrap">
  <div class="modal" style="max-width:640px;max-height:86vh;display:flex;flex-direction:column">
    <h3><i class="ti ti-alert-triangle"></i> Points de vigilance</h3>
    <div id="pmi-controles-corps" style="overflow-y:auto;flex:1;font-size:13px;line-height:1.7"></div>
    <div class="mactions"><button class="btn-primary" onclick="closeModal('modal-pmi-controles-wrap')">Fermer</button></div>
  </div>
</div>`);
  }
  let html='<div class="info-box" style="margin-bottom:14px"><i class="ti ti-info-circle" style="font-size:15px"></i> '
    +'Ces contrôles portent sur les données du planning et des présences. Le fichier Excel, lui, n\'est pas annoté.</div>';
  controles.forEach(c=>{
    const s=c.stats,tot=s.heuresDiplome+s.heuresQualifie;
    const part=tot?Math.round(s.heuresDiplome/tot*1000)/10:0;
    html+='<div style="margin-bottom:14px">'
      +'<div style="font-weight:700;color:var(--koala);margin-bottom:4px">Semaine du '+escHtml(c.semaine)+'</div>'
      +'<div style="color:var(--muted);font-size:12px;margin-bottom:6px">'
      +'Heures d\'encadrement : '+(Math.round(tot*100)/100)+' h — dont '+part+' % de personnel diplômé'
      +(capacite?' · capacité : '+capacite+' enfants':'')+'</div>';
    const gens=Object.keys(s.parPersonne||{}).filter(k=>s.parPersonne[k].planifie>0);
    if(gens.length){
      const r2=v=>Math.round(v*100)/100;
      html+='<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px">'
        +'<tr style="color:var(--muted)"><th style="text-align:left;font-weight:600">&nbsp;</th>'
        +'<th style="text-align:right;font-weight:600">Planifié</th>'
        +'<th style="text-align:right;font-weight:600">Encadrement</th>'
        +'<th style="text-align:right;font-weight:600">Bureau</th>'
        +'<th style="text-align:right;font-weight:600">Repas/entretien</th></tr>';
      gens.forEach(k=>{
        const o=s.parPersonne[k];
        // Contrôle : rien n'est ajouté aux heures planifiées, la somme doit retomber dessus.
        const ecart=Math.abs(o.planifie-(o.encadrement+o.direction+o.entretien))>0.01;
        html+='<tr><td>'+escHtml(k)+'</td>'
          +'<td style="text-align:right'+(ecart?';color:var(--red);font-weight:700':'')+'">'+r2(o.planifie)+' h</td>'
          +'<td style="text-align:right">'+r2(o.encadrement)+' h</td>'
          +'<td style="text-align:right">'+(o.direction?r2(o.direction)+' h':'—')+'</td>'
          +'<td style="text-align:right">'+(o.entretien?r2(o.entretien)+' h':'—')+'</td></tr>';
      });
      html+='</table>'
        +'<div style="font-size:11px;color:var(--muted);margin-bottom:8px">'
        +'Le temps de bureau et l\'entretien sont prélevés sur les heures déjà planifiées : la colonne '
        +'« Planifié » est inchangée et reste à comparer au contrat de chacun — aucune heure supplémentaire '
        +'n\'est générée par cet export.</div>';
    }
    if(s.entretien.length)
      html+='<div style="font-size:12px;margin-bottom:6px">'
        +'<span style="font-weight:600">Repas / entretien placés :</span> '
        +escHtml(s.entretien.join(' · '))+'</div>';
    if(s.bureau.length)
      html+='<div style="font-size:12px;margin-bottom:6px">'
        +'<span style="font-weight:600">Temps de bureau placé :</span> '
        +escHtml(s.bureau.join(' · '))+'</div>';
    html+=s.anomalies.length
      ? '<ul style="margin:0 0 0 18px;padding:0">'+s.anomalies.map(a=>'<li>'+escHtml(a)+'</li>').join('')+'</ul>'
      : '<div style="color:var(--koala)">✅ Aucune anomalie détectée.</div>';
    html+='</div>';
  });
  if(reserves.length)
    html+='<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">'
      +'<div style="font-weight:700;margin-bottom:4px">Limites de ce contrôle</div>'
      +'<ul style="margin:0 0 0 18px;padding:0">'+reserves.map(r=>'<li>'+escHtml(r)+'</li>').join('')+'</ul></div>';
  document.getElementById('pmi-controles-corps').innerHTML=html;
  document.getElementById('modal-pmi-controles-wrap').classList.add('open');
}

async function pmiGenerateExcel(){
  const ctx=_pmiExportCtx;
  if(!ctx)return;
  if(typeof ExcelJS==='undefined'){alert('La bibliothèque Excel (ExcelJS) n\'a pas pu être chargée. Réessayez dans un instant.');return;}
  const btn=document.getElementById('pmi-export-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Génération…';}
  try{
    const qualifMap=pmiCollectQualifs();
    const expMap=pmiCollectExperience();
    const nomMap=pmiCollectNoms();
    const colorMap=pmiBuildColorMap(ctx.staffList);
    const withData=ctx.weeks.filter(w=>w.rows.length);

    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(pmiB64ToArrayBuffer(PMI_TEMPLATE_B64));
    const tpl=wb.worksheets[0];

    // Les feuilles supplémentaires sont clonées AVANT tout remplissage, pour partir
    // à chaque fois du modèle vierge et non de la semaine précédente.
    const noms=withData.map(w=>('Semaine '+w.dateDebut.replace(/\//g,'-')).slice(0,31));
    const feuilles=[tpl];
    for(let i=1;i<withData.length;i++)feuilles.push(pmiCloneSheet(wb,tpl,noms[i]));
    tpl.name=noms[0];

    // Feuil2 / Feuil3 : feuilles vides du classeur d'origine, inutiles dans l'export.
    wb.worksheets.slice().forEach(w=>{if(/^Feuil[23]$/.test(w.name))wb.removeWorksheet(w.id);});

    const capacite=(cacheCreches||[]).find(c=>c.id===ctx.crecheId)?.capacity||null;

    // Temps de bureau de la direction : la répartition dépend des jours réellement
    // travaillés, elle est donc recalculée pour chaque semaine exportée.
    const dirPrenom=(document.getElementById('pmi-direction-prenom')||{}).value||'';
    const dirHeures=parseFloat((document.getElementById('pmi-direction-heures')||{}).value)||0;
    pmiDirectionSet(ctx.crecheId,dirPrenom,dirHeures);

    const entHeures=parseFloat((document.getElementById('pmi-entretien-heures')||{}).value)||0;
    const entOuv=(document.getElementById('pmi-ouverture')||{}).value||PMI_OUVERTURE_DEFAUT;
    const entFerm=(document.getElementById('pmi-fermeture')||{}).value||PMI_FERMETURE_DEFAUT;
    pmiEntretienSet(ctx.crecheId,entHeures,entOuv,entFerm);
    const entretien=entHeures>0?{
      quarts:Math.round(entHeures*4),
      colOuverture:pmiColonneDeHeure(entOuv,PMI_TPL_COL_FIRST),
      colFermeture:pmiColonneDeHeure(entFerm,PMI_TPL_COL_LAST+1)
    }:null;
    const controles=withData.map((w,i)=>({
      semaine:w.dateDebut,
      stats:pmiFillSheet(feuilles[i],w,ctx.crecheName,ctx.staffList,qualifMap,nomMap,colorMap,ctx.enfantsParDate,capacite,expMap,
        (dirPrenom&&dirHeures>0)?{prenom:dirPrenom,quartsParJour:pmiRepartirBureau(w,dirPrenom,dirHeures)}:null,
        entretien)
    }));

    const buf=await pmiRestaurerPoliceParDefaut(await wb.xlsx.writeBuffer());
    const slug=(ctx.crecheName||'creche').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
    const fileName='Planning_PMI_'+slug+'_'+withData[0].dateDebut.replace(/\//g,'-')+'.xlsx';
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    closeModal('modal-pmi-export-wrap');
    const trop=ctx.staffList.length-PMI_TPL_MAX_STAFF;
    const reserves=[];
    if(trop>0)reserves.push('Le modèle ne comporte que '+PMI_TPL_MAX_STAFF+' lignes par jour : '+trop+' personne(s) ne figurent pas dans le fichier.');
    if(ctx.enfantsSansHoraire)reserves.push(ctx.enfantsSansHoraire+' présence(s) enfant sans horaire ni contrat n\'ont pas pu être comptées dans la ligne « Nombre d\'enfants accueillis ».');
    if(!capacite)reserves.push('Aucune capacité d\'accueil n\'est renseignée sur la fiche de la crèche : la case correspondante reste vide et le dépassement de capacité n\'a pas pu être vérifié.');
    if(entretien){
      const place=controles.reduce((n,c)=>n+c.stats.heuresEntretien,0);
      const attendu=entHeures*5*controles.length;
      if(attendu-place>0.25)
        reserves.push('Repas et entretien : '+(Math.round(place*100)/100)+' h ont pu être placées sur '
          +(Math.round(attendu*100)/100)+' h attendues — les créneaux restants dégraderaient le taux d\'encadrement.');
    }
    if(dirPrenom&&dirHeures>0){
      const place=controles.reduce((n,c)=>n+c.stats.heuresBureau,0);
      const attendu=dirHeures*controles.length;
      if(Math.abs(place-attendu)>0.25)
        reserves.push('Temps de bureau : '+(Math.round(place*100)/100)+' h ont pu être placées sur '
          +(Math.round(attendu*100)/100)+' h attendues — les heures de travail de '+dirPrenom
          +' ne suffisent pas à les absorber sur certaines semaines.');
    }

    const nbAnomalies=controles.reduce((n,c)=>n+c.stats.anomalies.length,0);
    if(typeof window!=='undefined')window.controlesGlobaux=controles;   // exposé pour les vérifications
    pmiAfficherControles(controles,reserves,capacite);
    showBanner(nbAnomalies||reserves.length
      ? 'Planning PMI généré — '+(nbAnomalies||'aucun')+' point'+(nbAnomalies>1?'s':'')+' de vigilance à vérifier.'
      : 'Planning PMI généré ✅', (nbAnomalies||reserves.length)?'error':undefined);
  }catch(e){
    console.error('[pmiGenerateExcel]',e);
    showBanner('Erreur lors de la génération du fichier : '+e.message,'error');
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-download"></i> Générer le fichier Excel';}
  }
}
window.pmiGenerateExcel=pmiGenerateExcel;

// 3) Planning équipe (toutes les salariées de la crèche affichée) — 1, 2 ou 3 semaines sur la même page
async function peBuildPrintHTML(){
  const sel=document.getElementById('pe-creche-select');
  const crecheId=isDirection?sel?.value:currentProfile?.creche_id;
  if(!crecheId){alert('Choisissez d\'abord une crèche.');return null;}
  const crecheName=cacheCreches.find(c=>c.id===crecheId)?.name||'';
  const nbWeeks=parseInt(document.getElementById('pe-print-weeks')?.value)||1;
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

  const ws0=weekStart();
  let bodyHTML='';
  let nbWithData=0;
  for(let w=0;w<nbWeeks;w++){
    const wsW=new Date(ws0);wsW.setDate(ws0.getDate()+7*w);
    const semaineW=ipDateToLocalISO(wsW);
    const days5=Array.from({length:5},(_,i)=>{const d=new Date(wsW);d.setDate(wsW.getDate()+i);return d;});
    const rows=await peLoad(crecheId,semaineW);
    bodyHTML+='<div style="margin-top:'+(w>0?'18px':'0')+'">'+
      '<div style="font-weight:700;font-size:13px;color:#3D3580;margin-bottom:4px">Semaine du '+fmt(days5[0])+' au '+fmt(days5[4])+'</div>'+
      (rows.length?getPlanningEquipeTable(rows,semaineW,crecheName,crecheId,false,true,nbWeeks):'<div style="font-size:11px;color:#999;padding:6px 0">Aucune donnée pour cette semaine.</div>')+
      '</div>';
    if(rows.length)nbWithData++;
  }
  if(!nbWithData){alert('Aucune donnée pour cette crèche sur la période choisie.');return null;}

  const days5First=Array.from({length:5},(_,i)=>{const d=new Date(ws0);d.setDate(ws0.getDate()+i);return d;});
  const subtitle='Planning équipe — '+crecheName+' — '+nbWeeks+' semaine(s) à partir du '+fmt(days5First[0]);
  return{crecheId,crecheName,subtitle,bodyHTML,dateDebut:fmt(days5First[0]),nbWeeks};
}

async function printPlanningEquipe(){
  const d=await peBuildPrintHTML();
  if(!d)return;
  printPlanningDoc('Planning équipe',d.subtitle,d.bodyHTML,'portrait');
}
