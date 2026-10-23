/* ================================================================
   ACCÈS TERRAIN — Nettoyage des jeux et des espaces
   Saisie du registre par l'équipe de la crèche (qui, quand, quel produit).
   Mêmes tables que Stock › Nettoyages : nettoyage_plan (lecture) et
   nettoyage_journal (ajout). Le plan se gère dans Stock (direction et
   référent·e·s) ; le PMS (documents.html) reprend plan et registre.
   Chargé après terrain.js (utilise sb, PROF, esc, toast).
   ================================================================ */
const NT_FREQ={apres_usage:'Après chaque usage',quotidien:'Chaque jour',hebdomadaire:'Chaque semaine',mensuel:'Chaque mois'};
const NT_TYPES={jeux:'Jeux et jouets',espace:'Espaces et mobilier'};
const NT_PERIODE={apres_usage:'aujourd’hui',quotidien:'aujourd’hui',hebdomadaire:'cette semaine',mensuel:'ce mois-ci'};
let NT_CRECHE='',NT_PLAN=[],NT_JOURNAL=[],NT_FAIT_ID=null,NT_ENVOI=false,NT_REQ=0;

function ntJour(d){
  d=d||new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function ntDateFr(iso){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(iso||'');}
/* même règle que shortCrecheName() et kk_stock_couches_nom_court() */
function ntNomCourt(nom){
  return String(nom||'').replace(/^Koalakids\s+/i,'').replace(/^Toulon\s+/i,'').trim()||nom;
}
function ntDebut(freq){
  const n=new Date(),d=new Date(n.getFullYear(),n.getMonth(),n.getDate());
  if(freq==='hebdomadaire')d.setDate(d.getDate()-((d.getDay()+6)%7));
  else if(freq==='mensuel')d.setDate(1);
  return ntJour(d);
}
function ntStatut(p){
  const faits=NT_JOURNAL.filter(j=>j.plan_id===p.id&&j.fait_le>=ntDebut(p.frequence));
  const dernier=faits[0]||null;
  if(p.frequence==='apres_usage')return{code:'libre',n:faits.length,dernier};
  if(faits.length)return{code:'ok',n:faits.length,dernier};
  const j=new Date().getDay();
  if(p.frequence==='quotidien'&&(j===0||j===6))return{code:'repos',n:0,dernier:null};
  return{code:'afaire',n:0,dernier:null};
}
function ntBadge(p,s){
  const per=NT_PERIODE[p.frequence];
  if(s.code==='ok')return '<span class="nt-b ok">✓ Fait'+(s.dernier&&s.dernier.fait_par?' · '+esc(s.dernier.fait_par):'')+'</span>';
  if(s.code==='libre')return '<span class="nt-b">'+(s.n?s.n+' fois '+per:'Aucun '+per)+'</span>';
  if(s.code==='repos')return '<span class="nt-b">Week-end</span>';
  return '<span class="nt-b todo">À faire '+(p.frequence==='quotidien'?'aujourd’hui':per)+'</span>';
}

async function ntCrecheCourt(){
  const{data,error}=await sb.from('creches').select('name').eq('id',PROF.creche_id).maybeSingle();
  if(error||!data||!data.name)throw new Error('Crèche introuvable');
  return ntNomCourt(data.name);
}
async function ntCharger(){
  const req=++NT_REQ,box=document.getElementById('ntContenu');
  box.innerHTML='<div class="msg">Chargement du registre…</div>';
  try{
    NT_CRECHE=await ntCrecheCourt();
    const depuis=ntJour(new Date(Date.now()-35*864e5));
    const[p,j]=await Promise.all([
      sb.from('nettoyage_plan').select('id,creche,type,libelle,frequence,methode,ordre').eq('creche',NT_CRECHE).eq('actif',true).order('type').order('ordre').order('libelle'),
      sb.from('nettoyage_journal').select('id,plan_id,fait_le,fait_par,produit,observation,created_at,libelle').eq('creche',NT_CRECHE).gte('fait_le',depuis).order('fait_le',{ascending:false}).order('created_at',{ascending:false}).limit(500)
    ]);
    if(req!==NT_REQ)return;
    if(p.error)throw p.error;
    if(j.error)throw j.error;
    NT_PLAN=p.data||[];NT_JOURNAL=j.data||[];
    ntRender();
  }catch(e){
    if(req!==NT_REQ)return;
    console.error('[ntCharger]',e);
    const absent=/PGRST205|42P01/.test(String(e&&(e.code||e.message)));
    box.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> '+(absent
      ?'Le registre des nettoyages n’est pas encore installé (contactez la direction).'
      :'Impossible de charger le registre : '+esc(e.message||'erreur inconnue'))+'</div>';
  }
}
function ntRender(){
  const box=document.getElementById('ntContenu');
  if(!NT_PLAN.length){
    box.innerHTML='<div class="msg">Aucun plan de nettoyage défini pour <b>'+esc(NT_CRECHE)+'</b>. La direction ou la référente le crée dans <b>Stock › Nettoyages</b>.</div>';
    return;
  }
  const aFaire=NT_PLAN.filter(p=>ntStatut(p).code==='afaire').length;
  let html='<div class="nt-resume '+(aFaire?'todo':'ok')+'">'+(aFaire?'⏳ '+aFaire+' nettoyage'+(aFaire>1?'s':'')+' à faire':'✅ Tout est à jour')+' · '+esc(NT_CRECHE)+'</div>';
  Object.keys(NT_TYPES).forEach(t=>{
    const l=NT_PLAN.filter(p=>p.type===t);
    if(!l.length)return;
    html+='<div class="nt-titre">'+NT_TYPES[t]+'</div>'+l.map(p=>{
      const s=ntStatut(p);
      return '<div class="nt-ligne"><div class="nt-nom"><b>'+esc(p.libelle)+'</b>'
        +'<small>'+esc(NT_FREQ[p.frequence]||'')+(p.methode?' · '+esc(p.methode):'')+'</small>'
        +ntBadge(p,s)+'</div>'
        +'<button class="btn btn-p" onclick="ntOuvrirFait(\''+p.id+'\')"><i class="ti ti-check"></i> Noter</button></div>';
    }).join('');
  });
  const rec=NT_JOURNAL.slice(0,12);
  html+='<div class="nt-titre">Derniers nettoyages</div>'+(rec.length?rec.map(j=>
    '<div class="nt-hist"><b>'+esc(ntDateFr(j.fait_le))+'</b> · '+esc(j.libelle||'')
    +'<small>par '+esc(j.fait_par||'non renseigné')+(j.produit?' · '+esc(j.produit):'')+(j.observation?' · '+esc(j.observation):'')+'</small></div>').join('')
    :'<div class="nt-hist"><small>Aucun nettoyage enregistré pour le moment.</small></div>');
  box.innerHTML=html;
}

async function ntOuvrir(){
  if(!PROF.creche_id){
    document.getElementById('suiviResult').innerHTML='<div class="msg warn"><i class="ti ti-info-circle"></i> La direction gère plusieurs crèches : consultez les nettoyages dans Stock › Nettoyages.</div>';
    return;
  }
  document.getElementById('ovNett').classList.add('on');
  await ntCharger();
}
function ntFermer(){document.getElementById('ovNett').classList.remove('on');}

async function ntOuvrirFait(id){
  const p=NT_PLAN.find(x=>x.id===id);if(!p)return;
  NT_FAIT_ID=id;
  document.getElementById('ntFaitTitre').textContent=p.libelle;
  const d=document.getElementById('ntDate');
  d.max=ntJour();d.min=ntJour(new Date(Date.now()-7*864e5));d.value=ntJour();
  document.getElementById('ntPar').value=PROF.name||'';
  document.getElementById('ntProduit').value='';
  document.getElementById('ntObs').value='';
  document.getElementById('ovNettFait').classList.add('on');
  /* produits d'entretien du stock de la crèche (facultatif : si la lecture est refusée, saisie libre) */
  try{
    const{data}=await sb.from('articles').select('nom').eq('creche',NT_CRECHE).eq('cat','Entretien').order('nom');
    const noms=[...new Set((data||[]).map(a=>a.nom).filter(Boolean))];
    document.getElementById('ntProduits').innerHTML=noms.map(n=>'<option value="'+esc(n)+'">').join('');
  }catch(e){}
}
function ntFermerFait(){document.getElementById('ovNettFait').classList.remove('on');}

async function ntValiderFait(){
  const p=NT_PLAN.find(x=>x.id===NT_FAIT_ID);if(!p||NT_ENVOI)return;
  const date=document.getElementById('ntDate').value;
  const par=document.getElementById('ntPar').value.trim();
  if(!date||date>ntJour()){toast('Choisissez une date qui n’est pas dans le futur.',true);return;}
  if(!par){toast('Indiquez qui a fait le nettoyage.',true);return;}
  const deja=ntStatut(p).code==='ok'&&date>=ntDebut(p.frequence);
  if(deja&&!confirm('Déjà noté '+NT_PERIODE[p.frequence]+'. Ajouter un nouveau nettoyage ?'))return;
  NT_ENVOI=true;
  try{
    const{data,error}=await sb.from('nettoyage_journal').insert({
      plan_id:p.id,creche:p.creche,type:p.type,libelle:p.libelle,frequence:p.frequence,
      fait_le:date,fait_par:par,
      produit:document.getElementById('ntProduit').value.trim()||null,
      observation:document.getElementById('ntObs').value.trim()||null
    }).select();
    if(error||!data||!data.length)throw error||new Error('refusé');
    toast('Nettoyage enregistré.');
    ntFermerFait();
    await ntCharger();
  }catch(e){
    console.error('[ntValiderFait]',e);
    toast('Enregistrement impossible : '+((e&&e.message)||'droits insuffisants'),true);
  }finally{NT_ENVOI=false;}
}

document.getElementById('qNett').onclick=ntOuvrir;
