/* ================================================================
   ACCÈS TERRAIN — Décompte des couches
   Même saisie que « Couches du jour » (Demandes) : fonctions serveur
   kk_couches_ordi_enfants / kk_couches_ordi_saisir (sql/stock_couches_jour.sql),
   qui ajustent le stock de couches de la crèche. Chargé après terrain.js.
   ================================================================ */
let TC_LISTE=[],TC_REQ=0;
function tcJour(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
async function tcOuvrir(){
  if(!PROF.creche_id){
    document.getElementById('suiviResult').innerHTML='<div class="msg warn"><i class="ti ti-info-circle"></i> La direction gère plusieurs crèches : saisissez les couches dans Demandes › Couches du jour.</div>';
    return;
  }
  const j=document.getElementById('tcJour');
  j.max=tcJour();if(!j.value)j.value=tcJour();
  document.getElementById('ovCouches').classList.add('on');
  await tcCharger();
}
function tcFermer(){document.getElementById('ovCouches').classList.remove('on');}
async function tcCharger(){
  const req=++TC_REQ,box=document.getElementById('tcListe');
  box.innerHTML='<div class="msg">Chargement…</div>';
  const{data,error}=await sb.rpc('kk_couches_ordi_enfants',{p_creche_id:PROF.creche_id,p_jour:document.getElementById('tcJour').value});
  if(req!==TC_REQ)return;
  if(error){box.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> Chargement impossible.</div>';return;}
  TC_LISTE=data||[];tcRender();
}
function tcRender(){
  const box=document.getElementById('tcListe');
  if(!TC_LISTE.length){box.innerHTML='<div class="msg">Aucun enfant.</div>';return;}
  const total=TC_LISTE.reduce((a,c)=>a+c.nb,0);
  box.innerHTML='<div class="nt-resume ok">'+total+' couche'+(total>1?'s':'')+' utilisée'+(total>1?'s':'')+' ce jour</div>'
    +TC_LISTE.map(c=>'<div class="tc-ligne" style="'+(c.present||c.nb?'':'opacity:.55')+'"><div class="tc-nom">'+esc(c.prenom)+' '+esc(c.nom)
      +'<small>'+(c.taille_couche?(c.type_couche==='culotte'?'Culotte':'Couche')+' T'+esc(c.taille_couche):'taille non renseignée (fiche enfant)')+(c.present?'':' · non pointé')+'</small></div>'
      +(c.taille_couche?'<div class="tc-cpt"><button onclick="tcMaj(\''+c.id+'\',-1)">−</button><span>'+c.nb+'</span><button onclick="tcMaj(\''+c.id+'\',1)">+</button></div>':'')
      +'</div>').join('');
}
async function tcMaj(id,d){
  const c=TC_LISTE.find(x=>x.id===id);if(!c)return;
  const nb=Math.max(0,Math.min(30,c.nb+d));
  if(nb===c.nb)return;
  const{data,error}=await sb.rpc('kk_couches_ordi_saisir',{p_enfant_id:id,p_jour:document.getElementById('tcJour').value,p_nb:nb});
  const r=data&&data[0];
  if(error||!r||!r.ok){toast(r&&r.error==='taille_inconnue'?'Taille de couche non renseignée sur la fiche enfant.':'Échec de l’enregistrement, réessayez.',true);return;}
  c.nb=r.nb;tcRender();
}
document.getElementById('qCouches').onclick=tcOuvrir;
