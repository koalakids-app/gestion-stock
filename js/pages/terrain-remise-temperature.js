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
  html+='<div class="nt-titre">Fiche de la semaine</div>'
    +'<div class="f" style="display:flex;gap:8px;align-items:flex-end"><div style="flex:1"><label>Semaine contenant le</label><input type="date" id="rtSemaine" max="'+rtJour()+'" value="'+rtJour()+'"></div>'
    +'<button class="btn btn-g" onclick="rtExporter()"><i class="ti ti-printer"></i> Imprimer / PDF</button></div>';
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

/* ===== Export hebdomadaire : même présentation que la fiche papier (lundi → vendredi) ===== */
function rtLundi(iso){
  const d=new Date(iso+'T12:00:00');
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  return d;
}
function rtNumSemaine(lundi){
  const j=new Date(Date.UTC(lundi.getFullYear(),lundi.getMonth(),lundi.getDate()+3));
  const d1=new Date(Date.UTC(j.getUTCFullYear(),0,4));
  return 1+Math.round(((j-d1)/864e5-3+((d1.getUTCDay()+6)%7))/7);
}
function rtT(v){return v==null?'':String(v).replace('.',',')+' °C';}
async function rtExporter(){
  const iso=(document.getElementById('rtSemaine')||{}).value||rtJour();
  const lundi=rtLundi(iso),dim=new Date(lundi);dim.setDate(dim.getDate()+6);
  const vendredi=new Date(lundi);vendredi.setDate(vendredi.getDate()+4);
  const w=window.open('','_blank');
  if(!w){toast('Autorisez l’ouverture de fenêtres pour imprimer la fiche.',true);return;}
  w.document.write('<p style="font-family:sans-serif">Préparation de la fiche…</p>');
  try{
    const{data,error}=await sb.from('remise_temperature_journal')
      .select('fait_le,plat,temp_chauffe,heure_chauffe,temp_fin,heure_fin,temp_mixage,conforme,observation,fait_par,created_at')
      .eq('creche',RT_CRECHE).gte('fait_le',rtJour(lundi)).lte('fait_le',rtJour(dim))
      .order('fait_le').order('created_at').limit(500);
    if(error)throw error;
    const jours=[];
    for(let i=0;i<7;i++){const d=new Date(lundi);d.setDate(d.getDate()+i);jours.push(rtJour(d));}
    /* samedi et dimanche ne s'impriment que s'il y a des relevés */
    const affiches=jours.filter((j,i)=>i<5||(data||[]).some(r=>r.fait_le===j));
    let corps='';
    affiches.forEach(j=>{
      const l=(data||[]).filter(r=>r.fait_le===j),n=Math.max(5,l.length);
      for(let i=0;i<n;i++){
        const r=l[i]||{};
        corps+='<tr>'+(i===0?'<td rowspan="'+n+'" class="jour">'+esc(rtJourNom(j))+'<br><small>'+esc(rtDateFr(j))+'</small></td>':'')
          +'<td class="plat">'+esc(r.plat||'')+'</td>'
          +'<td>'+esc(rtT(r.temp_chauffe))+'</td><td>'+esc(rtHeure(r.heure_chauffe))+'</td>'
          +'<td'+(r.conforme===false?' class="nc"':'')+'>'+esc(rtT(r.temp_fin))+'</td><td>'+esc(rtHeure(r.heure_fin))+'</td>'
          +'<td>'+esc(rtT(r.temp_mixage))+'</td>'
          +'<td class="obs">'+esc((r.conforme===false?'Non conforme. ':'')+(r.observation||''))+'</td>'
          +'<td>'+esc(r.fait_par||'')+'</td></tr>';
      }
    });
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Remise en température — semaine du '+esc(rtDateFr(rtJour(lundi)))+'</title>'
      +'<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;color:#000}h1{text-align:center;font-size:16px;margin:0 0 8px}'
      +'.ent{display:flex;justify-content:space-between;margin:4px 0;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:8px}'
      +'th,td{border:1px solid #000;padding:4px;text-align:center;vertical-align:middle;height:22px}th{background:#eee;font-size:10.5px}'
      +'td.jour{font-weight:bold;background:#f6f6f6;width:70px}td.plat,td.obs{text-align:left}td.nc{font-weight:bold;color:#b00}small{font-weight:normal}'
      +'tr{page-break-inside:avoid}</style></head><body>'
      +'<h1>FICHE DE CONTRÔLE DE LA REMISE EN TEMPÉRATURES</h1>'
      +'<div class="ent"><span>SEMAINE DU '+esc(rtDateFr(rtJour(lundi)))+' AU '+esc(rtDateFr(rtJour(vendredi)))+'</span><span>SEM : '+rtNumSemaine(lundi)+'</span></div>'
      +'<div class="ent"><span>CRÈCHE : '+esc(RT_CRECHE)+'</span></div>'
      +'<table><tr><th>Jour</th><th>Nature des plats</th><th>Température mise en chauffe</th><th>Heure de mise en chauffe</th><th>Température de fin de réchauffe</th><th>Heure de fin de réchauffe</th><th>Température après mixage</th><th>Observations</th><th>Visa</th></tr>'+corps+'</table>'
      +'<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>');
    w.document.close();
  }catch(e){
    console.error('[rtExporter]',e);
    try{w.close();}catch(_e){}
    toast('Export impossible : '+((e&&e.message)||'erreur'),true);
  }
}

document.getElementById('qRemise').onclick=rtOuvrir;
