/* ================================================================
   ACCÈS TERRAIN — Remise en température
   Fiche 3 du PMS (Documents › outils de traçabilité) remplie en ligne par la
   personne qui s'occupe de la cuisine : plat, heures, T° à cœur, T° de maintien,
   conforme, action corrective. Table remise_temperature_journal
   (sql/remise_temperature.sql, à appliquer à la main).
   Repères : 63 °C à cœur en moins d'1 heure, maintien à 63 °C minimum (PMS).
   Chargé après terrain.js (utilise sb, PROF, esc, toast).
   ================================================================ */
const RT_SEUIL=63,RT_DUREE_MAX=60;
let RT_CRECHE='',RT_JOURNAL=[],RT_ENVOI=false,RT_REQ=0;

function rtJour(d){
  d=d||new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function rtDateFr(iso){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(iso||'');}
function rtHeure(h){return String(h||'').slice(0,5);}
function rtMin(h){const m=/^(\d{1,2}):(\d{2})/.exec(h||'');return m?(+m[1])*60+(+m[2]):null;}
function rtNum(v){const s=String(v==null?'':v).trim().replace(',','.');return s===''||isNaN(+s)?null:+s;}
/* même règle que shortCrecheName() */
function rtNomCourt(nom){
  return String(nom||'').replace(/^Koalakids\s+/i,'').replace(/^Toulon\s+/i,'').trim()||nom;
}

async function rtCharger(){
  const req=++RT_REQ,box=document.getElementById('rtContenu');
  box.innerHTML='<div class="msg">Chargement du registre…</div>';
  try{
    const{data:c,error:ce}=await sb.from('creches').select('name').eq('id',PROF.creche_id).maybeSingle();
    if(ce||!c||!c.name)throw new Error('Crèche introuvable');
    RT_CRECHE=rtNomCourt(c.name);
    const{data,error}=await sb.from('remise_temperature_journal')
      .select('id,fait_le,plat,heure_debut,temp_coeur,heure_fin,temp_maintien,heure_service,conforme,action,fait_par,created_at')
      .eq('creche',RT_CRECHE).order('fait_le',{ascending:false}).order('created_at',{ascending:false}).limit(30);
    if(req!==RT_REQ)return;
    if(error)throw error;
    RT_JOURNAL=data||[];
    rtRender();
  }catch(e){
    if(req!==RT_REQ)return;
    console.error('[rtCharger]',e);
    const absent=/PGRST205|42P01/.test(String(e&&(e.code||e.message)));
    box.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> '+(absent
      ?'Le registre de remise en température n’est pas encore installé (contactez la direction).'
      :'Impossible de charger le registre : '+esc(e.message||'erreur inconnue'))+'</div>';
  }
}
function rtRender(){
  const box=document.getElementById('rtContenu');
  const auj=RT_JOURNAL.filter(j=>j.fait_le===rtJour());
  let html='<div class="nt-resume '+(auj.length?'ok':'todo')+'">'+(auj.length?'✅ '+auj.length+' relevé'+(auj.length>1?'s':'')+' aujourd’hui':'⏳ Aucun relevé aujourd’hui')+' · '+esc(RT_CRECHE)+'</div>';
  html+='<button class="btn btn-p" style="width:100%;justify-content:center" onclick="rtOuvrirSaisie()"><i class="ti ti-plus"></i> Nouveau relevé</button>';
  html+='<div class="nt-titre">Derniers relevés</div>'+(RT_JOURNAL.length?RT_JOURNAL.map(j=>{
    const det=[];
    if(j.heure_debut)det.push('début '+rtHeure(j.heure_debut));
    if(j.temp_coeur!=null)det.push('à cœur '+j.temp_coeur+' °C');
    if(j.heure_fin)det.push('fin '+rtHeure(j.heure_fin));
    if(j.temp_maintien!=null)det.push('maintien '+j.temp_maintien+' °C');
    if(j.heure_service)det.push('service '+rtHeure(j.heure_service));
    return '<div class="nt-hist"><b>'+esc(rtDateFr(j.fait_le))+'</b> · '+esc(j.plat)+' '
      +'<span class="nt-b '+(j.conforme?'ok':'todo')+'">'+(j.conforme?'✓ Conforme':'⚠ Non conforme')+'</span>'
      +'<small>'+esc(det.join(' · '))+'</small>'
      +'<small>par '+esc(j.fait_par||'non renseigné')+(j.action?' · action : '+esc(j.action):'')+'</small></div>';
  }).join(''):'<div class="nt-hist"><small>Aucun relevé enregistré pour le moment.</small></div>');
  box.innerHTML=html;
}

async function rtOuvrir(){
  if(!PROF.creche_id){
    document.getElementById('suiviResult').innerHTML='<div class="msg warn"><i class="ti ti-info-circle"></i> La direction gère plusieurs crèches : consultez la remise en température dans Documents › Plan de maîtrise sanitaire.</div>';
    return;
  }
  document.getElementById('ovRemise').classList.add('on');
  await rtCharger();
}
function rtFermer(){document.getElementById('ovRemise').classList.remove('on');}

function rtOuvrirSaisie(){
  const d=document.getElementById('rtDate');
  d.max=rtJour();d.min=rtJour(new Date(Date.now()-7*864e5));d.value=rtJour();
  ['rtPlat','rtDebut','rtCoeur','rtFin','rtMaintien','rtService','rtAction'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('rtPar').value=PROF.name||'';
  rtVerifier();
  document.getElementById('ovRemiseSaisie').classList.add('on');
}
function rtFermerSaisie(){document.getElementById('ovRemiseSaisie').classList.remove('on');}

/* conformité calculée sur les repères du PMS : affichée en direct, l'action corrective devient obligatoire si non conforme */
function rtEvaluer(){
  const coeur=rtNum(document.getElementById('rtCoeur').value),maint=rtNum(document.getElementById('rtMaintien').value);
  const d=rtMin(document.getElementById('rtDebut').value),f=rtMin(document.getElementById('rtFin').value);
  const pb=[];
  if(coeur!=null&&coeur<RT_SEUIL)pb.push('T° à cœur inférieure à '+RT_SEUIL+' °C');
  if(maint!=null&&maint<RT_SEUIL)pb.push('T° de maintien inférieure à '+RT_SEUIL+' °C');
  if(d!=null&&f!=null&&f>=d&&f-d>RT_DUREE_MAX)pb.push('remise en température de plus d’1 heure');
  return{coeur,maint,pb,conforme:!pb.length};
}
function rtVerifier(){
  const e=rtEvaluer(),box=document.getElementById('rtVerdict');
  const rempli=e.coeur!=null||e.maint!=null;
  box.className='nt-resume '+(!rempli?'':(e.conforme?'ok':'todo'));
  box.textContent=!rempli?'Saisissez les températures relevées à la sonde.':(e.conforme?'✅ Conforme (63 °C à cœur en moins d’1 heure)':'⚠ Non conforme : '+e.pb.join(', ')+'. Indiquez l’action corrective.');
  document.getElementById('rtActionLabel').textContent=e.conforme?'Action corrective (facultatif)':'Action corrective (obligatoire)';
}

async function rtValiderSaisie(){
  if(RT_ENVOI)return;
  const date=document.getElementById('rtDate').value;
  const plat=document.getElementById('rtPlat').value.trim();
  const par=document.getElementById('rtPar').value.trim();
  const action=document.getElementById('rtAction').value.trim();
  const e=rtEvaluer();
  if(!date||date>rtJour()){toast('Choisissez une date qui n’est pas dans le futur.',true);return;}
  if(!plat){toast('Indiquez le plat.',true);return;}
  if(e.coeur==null){toast('Indiquez la température à cœur.',true);return;}
  if([e.coeur,e.maint].some(t=>t!=null&&(t<-30||t>150))){toast('Vérifiez les températures saisies.',true);return;}
  if(!par){toast('Indiquez qui a fait le relevé.',true);return;}
  if(!e.conforme&&!action){toast('Non conforme : indiquez l’action corrective.',true);return;}
  const h=id=>document.getElementById(id).value||null;
  RT_ENVOI=true;
  try{
    const{data,error}=await sb.from('remise_temperature_journal').insert({
      creche:RT_CRECHE,fait_le:date,plat:plat,
      heure_debut:h('rtDebut'),temp_coeur:e.coeur,heure_fin:h('rtFin'),
      temp_maintien:e.maint,heure_service:h('rtService'),
      conforme:e.conforme,action:action||null,fait_par:par
    }).select();
    if(error||!data||!data.length)throw error||new Error('refusé');
    toast('Relevé enregistré.');
    rtFermerSaisie();
    await rtCharger();
  }catch(err){
    console.error('[rtValiderSaisie]',err);
    toast('Enregistrement impossible : '+((err&&err.message)||'droits insuffisants'),true);
  }finally{RT_ENVOI=false;}
}

document.getElementById('qRemise').onclick=rtOuvrir;
