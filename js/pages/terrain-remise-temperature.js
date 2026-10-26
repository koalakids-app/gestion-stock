/* ================================================================
   ACCÈS TERRAIN — Remise en température
   « Fiche de contrôle de la remise en températures » (version 2023) remplie en
   ligne par la personne qui s'occupe de la cuisine : nature du plat, T° et
   heure de mise en chauffe, T° et heure de fin de réchauffe, T° après mixage,
   observations, visa. Table remise_temperature_journal
   (sql/remise_temperature.sql, à appliquer à la main).
   Repères du PMS : 63 °C à cœur en moins d'1 heure.
   Chargé après terrain.js (utilise sb, PROF, esc, toast).
   ================================================================ */
const RT_SEUIL=63,RT_DUREE_MAX=60;
const RT_JOURS=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
let RT_CRECHE='',RT_JOURNAL=[],RT_ENVOI=false,RT_REQ=0;

function rtJour(d){
  d=d||new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function rtDateFr(iso){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(iso||'');}
function rtJourNom(iso){return RT_JOURS[new Date(iso+'T12:00:00').getDay()]||'';}
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
      .select('id,fait_le,plat,temp_chauffe,heure_chauffe,temp_fin,heure_fin,temp_mixage,conforme,observation,fait_par,created_at')
      .eq('creche',RT_CRECHE).order('fait_le',{ascending:false}).order('created_at',{ascending:false}).limit(60);
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
  let html='<div class="nt-resume '+(auj.length?'ok':'todo')+'">'+(auj.length?'✅ '+auj.length+' plat'+(auj.length>1?'s':'')+' contrôlé'+(auj.length>1?'s':'')+' aujourd’hui':'⏳ Aucun plat contrôlé aujourd’hui')+' · '+esc(RT_CRECHE)+'</div>';
  html+='<button class="btn btn-p" style="width:100%;justify-content:center" onclick="rtOuvrirSaisie()"><i class="ti ti-plus"></i> Ajouter un plat</button>';
  let jour='';
  html+='<div class="nt-titre">Derniers relevés</div>'+(RT_JOURNAL.length?RT_JOURNAL.map(j=>{
    let tete='';
    if(j.fait_le!==jour){jour=j.fait_le;tete='<div class="nt-titre" style="margin:10px 0 2px;font-size:13.5px">'+esc(rtJourNom(j.fait_le)+' '+rtDateFr(j.fait_le))+'</div>';}
    const det=[];
    if(j.temp_chauffe!=null||j.heure_chauffe)det.push('chauffe '+(j.temp_chauffe!=null?j.temp_chauffe+' °C':'')+(j.heure_chauffe?' à '+rtHeure(j.heure_chauffe):''));
    if(j.temp_fin!=null||j.heure_fin)det.push('fin '+(j.temp_fin!=null?j.temp_fin+' °C':'')+(j.heure_fin?' à '+rtHeure(j.heure_fin):''));
    if(j.temp_mixage!=null)det.push('après mixage '+j.temp_mixage+' °C');
    return tete+'<div class="nt-hist"><b>'+esc(j.plat)+'</b> '
      +'<span class="nt-b '+(j.conforme?'ok':'todo')+'">'+(j.conforme?'✓ Conforme':'⚠ Non conforme')+'</span>'
      +'<small>'+esc(det.join(' · '))+'</small>'
      +'<small>visa : '+esc(j.fait_par||'non renseigné')+(j.observation?' · '+esc(j.observation):'')+'</small></div>';
  }).join(''):'<div class="nt-hist"><small>Aucun relevé enregistré pour le moment.</small></div>');
  box.innerHTML=html;
}

async function rtOuvrir(){
  if(!PROF.creche_id){
    document.getElementById('suiviResult').innerHTML='<div class="msg warn"><i class="ti ti-info-circle"></i> La direction gère plusieurs crèches : la remise en température se saisit depuis le compte d’une crèche.</div>';
    return;
  }
  document.getElementById('ovRemise').classList.add('on');
  await rtCharger();
}
function rtFermer(){document.getElementById('ovRemise').classList.remove('on');}

function rtOuvrirSaisie(){
  const d=document.getElementById('rtDate');
  d.max=rtJour();d.min=rtJour(new Date(Date.now()-7*864e5));d.value=rtJour();
  ['rtPlat','rtChauffe','rtHChauffe','rtFinT','rtHFin','rtMixage','rtAction'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('rtPar').value=PROF.name||'';
  rtVerifier();
  document.getElementById('ovRemiseSaisie').classList.add('on');
}
function rtFermerSaisie(){document.getElementById('ovRemiseSaisie').classList.remove('on');}

/* conformité sur les repères du PMS : 63 °C en fin de réchauffe, en moins d'1 h ; observation obligatoire sinon */
function rtEvaluer(){
  const fin=rtNum(document.getElementById('rtFinT').value);
  const d=rtMin(document.getElementById('rtHChauffe').value),f=rtMin(document.getElementById('rtHFin').value);
  const pb=[];
  if(fin!=null&&fin<RT_SEUIL)pb.push('T° de fin de réchauffe inférieure à '+RT_SEUIL+' °C');
  if(d!=null&&f!=null&&f>=d&&f-d>RT_DUREE_MAX)pb.push('réchauffe de plus d’1 heure');
  return{fin:fin,pb:pb,conforme:!pb.length};
}
function rtVerifier(){
  const e=rtEvaluer(),box=document.getElementById('rtVerdict');
  box.className='nt-resume '+(e.fin==null?'':(e.conforme?'ok':'todo'));
  box.textContent=e.fin==null?'Saisissez la température de fin de réchauffe relevée à la sonde.':(e.conforme?'✅ Conforme (63 °C en moins d’1 heure)':'⚠ Non conforme : '+e.pb.join(', ')+'. Indiquez l’observation.');
  document.getElementById('rtActionLabel').textContent=e.conforme?'Observations (facultatif)':'Observations / action corrective (obligatoire)';
}

async function rtValiderSaisie(){
  if(RT_ENVOI)return;
  const date=document.getElementById('rtDate').value;
  const plat=document.getElementById('rtPlat').value.trim();
  const par=document.getElementById('rtPar').value.trim();
  const obs=document.getElementById('rtAction').value.trim();
  const chauffe=rtNum(document.getElementById('rtChauffe').value),mixage=rtNum(document.getElementById('rtMixage').value);
  const e=rtEvaluer();
  if(!date||date>rtJour()){toast('Choisissez une date qui n’est pas dans le futur.',true);return;}
  if(!plat){toast('Indiquez la nature du plat.',true);return;}
  if(e.fin==null){toast('Indiquez la température de fin de réchauffe.',true);return;}
  if([chauffe,e.fin,mixage].some(t=>t!=null&&(t<-30||t>150))){toast('Vérifiez les températures saisies.',true);return;}
  if(!par){toast('Indiquez le visa (qui a fait le relevé).',true);return;}
  if(!e.conforme&&!obs){toast('Non conforme : indiquez l’observation.',true);return;}
  const h=id=>document.getElementById(id).value||null;
  RT_ENVOI=true;
  try{
    const{data,error}=await sb.from('remise_temperature_journal').insert({
      creche:RT_CRECHE,fait_le:date,plat:plat,
      temp_chauffe:chauffe,heure_chauffe:h('rtHChauffe'),temp_fin:e.fin,heure_fin:h('rtHFin'),
      temp_mixage:mixage,conforme:e.conforme,observation:obs||null,fait_par:par
    }).select();
    if(error||!data||!data.length)throw error||new Error('refusé');
    toast('Plat enregistré.');
    rtFermerSaisie();
    await rtCharger();
  }catch(err){
    console.error('[rtValiderSaisie]',err);
    toast('Enregistrement impossible : '+((err&&err.message)||'droits insuffisants'),true);
  }finally{RT_ENVOI=false;}
}

document.getElementById('qRemise').onclick=rtOuvrir;
