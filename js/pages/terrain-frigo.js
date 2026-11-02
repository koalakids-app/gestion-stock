/* ================================================================
   ACCÈS TERRAIN — Température du réfrigérateur (dans la tuile « Remise en température »)
   Trois relevés par jour : le matin, avant la mise des plats au four, en fin de
   journée (fiche 2 du PMS). Table frigo_temperature_journal
   (sql/frigo_temperature.sql, à appliquer à la main).
   Repère : 4 °C maximum ; au-delà, observation obligatoire.
   Chargé après terrain-remise-temperature.js (utilise sb, PROF, esc, toast,
   RT_CRECHE, rtJour, rtNum, rtHeure, rtHeureStr).
   ================================================================ */
const FR_SEUIL=4;
const FR_MOMENTS=[['matin','Matin','ti-sun'],['avant_four','Avant la mise au four','ti-flame'],['soir','Fin de journée','ti-moon']];
let FR_JOURNAL=[],FR_MOMENT='',FR_ENVOI=false,FR_REQ=0,FR_ABSENT=false;

const frNom=m=>(FR_MOMENTS.find(x=>x[0]===m)||[m,m])[1];

async function frCharger(){
  const req=++FR_REQ,box=document.getElementById('frBloc');
  if(!box)return;
  try{
    const{data,error}=await sb.from('frigo_temperature_journal')
      .select('id,fait_le,moment,temperature,heure,conforme,observation,fait_par,created_at')
      .eq('creche',RT_CRECHE).gte('fait_le',rtJour(new Date(Date.now()-7*864e5)))
      .order('fait_le',{ascending:false}).order('created_at',{ascending:false}).limit(60);
    if(req!==FR_REQ)return;
    if(error)throw error;
    FR_ABSENT=false;FR_JOURNAL=data||[];
  }catch(e){
    if(req!==FR_REQ)return;
    console.error('[frCharger]',e);
    FR_JOURNAL=[];
    FR_ABSENT=/PGRST205|42P01/.test(String(e&&(e.code||e.message)));
    box.innerHTML='<div class="nt-titre">Température du réfrigérateur</div><div class="msg warn"><i class="ti ti-alert-triangle"></i> '
      +(FR_ABSENT?'Le registre des températures du réfrigérateur n’est pas encore installé (contactez la direction).':'Impossible de charger les relevés : '+esc(e.message||'erreur inconnue'))+'</div>';
    return;
  }
  frRender();
}
function frDernier(iso,m){return FR_JOURNAL.find(j=>j.fait_le===iso&&j.moment===m)||null;}
function frRender(){
  const box=document.getElementById('frBloc');if(!box)return;
  const auj=rtJour(),faits=FR_MOMENTS.filter(x=>frDernier(auj,x[0])).length;
  let html='<div class="nt-titre">Température du réfrigérateur</div>'
    +'<div class="nt-resume '+(faits===3?'ok':'todo')+'">'+(faits===3?'✅ 3 relevés faits aujourd’hui':'⏳ '+faits+' relevé'+(faits>1?'s':'')+' sur 3 aujourd’hui')+'</div>';
  html+=FR_MOMENTS.map(function(x){
    const r=frDernier(auj,x[0]);
    return '<div class="nt-hist" style="display:flex;gap:10px;align-items:center;justify-content:space-between">'
      +'<div><b><i class="ti '+x[2]+'"></i> '+esc(x[1])+'</b>'
      +(r?'<small>'+esc(String(r.temperature).replace('.',',')+' °C'+(r.heure?' à '+rtHeure(r.heure):'')+' · visa : '+(r.fait_par||'non renseigné')+(r.observation?' · '+r.observation:''))+'</small>':'<small>Pas encore relevé</small>')+'</div>'
      +(r?'<span class="nt-b '+(r.conforme?'ok':'todo')+'">'+(r.conforme?'✓ '+String(r.temperature).replace('.',',')+' °C':'⚠ '+String(r.temperature).replace('.',',')+' °C')+'</span>'
          :'<button type="button" class="btn btn-p" onclick="frOuvrir(\''+x[0]+'\')">Relever</button>')
      +'</div>';
  }).join('');
  /* jours précédents (7 derniers jours) */
  const avant=FR_JOURNAL.filter(j=>j.fait_le!==auj);
  if(avant.length){
    const jours=[...new Set(avant.map(j=>j.fait_le))];
    html+='<details style="margin-top:8px"><summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--violet)">Jours précédents</summary>'
      +jours.map(function(d){
        const l=FR_MOMENTS.map(function(x){const r=frDernier(d,x[0]);return r?x[1]+' '+String(r.temperature).replace('.',',')+' °C'+(r.conforme?'':' ⚠'):null;}).filter(Boolean);
        return '<div class="nt-hist"><b>'+esc(rtJourNom(d)+' '+rtDateFr(d))+'</b><small>'+esc(l.join(' · '))+'</small></div>';
      }).join('')+'</details>';
  }
  box.innerHTML=html;
}

/* ===== Saisie d'un relevé ===== */
function frOuvrir(m){
  FR_MOMENT=m;
  document.getElementById('frTitre').textContent='Réfrigérateur — '+frNom(m);
  document.getElementById('frT').value='';
  document.getElementById('frO').value='';
  document.getElementById('frPar').value=PROF.name||'';
  document.getElementById('frH').value=rtHeureStr(new Date().getHours()*60+new Date().getMinutes());
  frAlerte('');frMaj();
  document.getElementById('ovFrigo').classList.add('on');
}
function frFermer(){document.getElementById('ovFrigo').classList.remove('on');}
function frAlerte(m){
  const e=document.getElementById('frErr');
  if(e){e.textContent=m||'';e.style.display=m?'':'none';}
  if(m)toast(m,true);
}
function frTempSet(v){document.getElementById('frT').value=String(v).replace('.',',');frMaj();}
/* départ du − / + : 4 °C */
function frPas(d){
  const v=rtNum(document.getElementById('frT').value);
  frTempSet(v==null?FR_SEUIL:Math.round((v+d)*10)/10);
}
function frMaintenant(){document.getElementById('frH').value=rtHeureStr(new Date().getHours()*60+new Date().getMinutes());}
function frMaj(){
  const t=rtNum(document.getElementById('frT').value),box=document.getElementById('frV');
  if(t==null){box.textContent='';box.className='rt-verdict';return;}
  const ok=t<=FR_SEUIL;
  box.className='rt-verdict '+(ok?'ok':'nc');
  box.textContent=ok?'✓ Conforme':'⚠ Au-dessus de '+FR_SEUIL+' °C — indiquez l’observation (action menée)';
}
async function frValider(){
  if(FR_ENVOI)return;
  frAlerte('');
  const t=rtNum(document.getElementById('frT').value),par=document.getElementById('frPar').value.trim(),
    obs=document.getElementById('frO').value.trim(),h=document.getElementById('frH').value||null;
  if(t==null){frAlerte('Saisissez la température.');return;}
  if(t<-30||t>30){frAlerte('Vérifiez la température.');return;}
  if(!par){frAlerte('Indiquez le visa (qui a fait le relevé).');return;}
  const conforme=t<=FR_SEUIL;
  if(!conforme&&!obs){document.getElementById('frO').focus();frAlerte('Température trop haute : indiquez l’observation.');return;}
  FR_ENVOI=true;
  try{
    const{data,error}=await sb.from('frigo_temperature_journal').insert({creche:RT_CRECHE,fait_le:rtJour(),moment:FR_MOMENT,temperature:t,heure:h,conforme:conforme,observation:obs||null,fait_par:par}).select();
    if(error||!data||!data.length)throw error||new Error('refusé');
    toast('Relevé du réfrigérateur enregistré.');
    frFermer();
    await frCharger();
  }catch(err){
    console.error('[frValider]',err);
    frAlerte('Enregistrement impossible : '+((err&&err.message)||'droits insuffisants'));
  }finally{FR_ENVOI=false;}
}
