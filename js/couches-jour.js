/* Couches du jour — nombre de couches utilisées par enfant et par jour.
   Le total saisi fixe la consommation du jour ; le serveur (kk_couches_ordi_saisir,
   sql/stock_couches_jour.sql) ajuste le stock de la taille/type de la fiche enfant. */
let coucheListe=[];
const coucheEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function coucheAujourdhui(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function coucheCrecheId(){
  if(!isDirection)return currentProfile?.creche_id||'';
  return document.getElementById('couches-creche-select')?.value||'';
}
function coucheInit(){
  const sel=document.getElementById('couches-creche-select');
  if(sel&&!sel.options.length){
    sel.innerHTML=cacheCreches.map(c=>`<option value="${c.id}">${coucheEsc(c.name)}</option>`).join('');
    if(currentProfile?.creche_id)sel.value=currentProfile.creche_id;
  }
  const j=document.getElementById('couches-jour');
  j.max=coucheAujourdhui();
  if(!j.value)j.value=coucheAujourdhui();
  coucheCharger();
}
async function coucheCharger(){
  const l=document.getElementById('couches-liste');
  const crecheId=coucheCrecheId();
  if(!crecheId){l.innerHTML='<div style="color:var(--muted);padding:20px">Aucune crèche sélectionnée.</div>';return;}
  l.innerHTML='<div style="color:var(--muted);padding:20px">Chargement…</div>';
  const{data,error}=await sb.rpc('kk_couches_ordi_enfants',{p_creche_id:crecheId,p_jour:document.getElementById('couches-jour').value});
  if(error){l.innerHTML='<div style="color:var(--red);padding:20px">Chargement impossible.</div>';return;}
  coucheListe=data||[];
  coucheRender();
}
function coucheRender(){
  const l=document.getElementById('couches-liste');
  if(!coucheListe.length){l.innerHTML='<div style="color:var(--muted);padding:20px">Aucun enfant.</div>';return;}
  const total=coucheListe.reduce((a,c)=>a+c.nb,0);
  const btn='width:42px;height:42px;border-radius:50%;border:none;background:#F1EFF7;color:var(--koala);font-size:22px;font-weight:700;cursor:pointer';
  l.innerHTML=`<div style="font-weight:700;color:var(--koala);margin-bottom:6px">${total} couche${total>1?'s':''} utilisée${total>1?'s':''} ce jour</div>`
    +coucheListe.map(c=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border,#eee);${c.present||c.nb?'':'opacity:.55'}">
      <div style="flex:1;font-weight:600">${coucheEsc(c.prenom)} ${coucheEsc(c.nom)}
        <div style="font-size:12px;font-weight:500;color:var(--muted)">${c.taille_couche?(c.type_couche==='culotte'?'Culotte':'Couche')+' T'+coucheEsc(c.taille_couche):'taille non renseignée (fiche enfant)'}${c.present?'':' · non pointé'}</div></div>
      ${c.taille_couche?`<div style="display:flex;align-items:center;gap:12px">
        <button style="${btn}" onclick="coucheMaj('${c.id}',-1)">−</button>
        <span style="min-width:28px;text-align:center;font-size:22px;font-weight:700">${c.nb}</span>
        <button style="${btn}" onclick="coucheMaj('${c.id}',1)">+</button></div>`:''}
    </div>`).join('');
}
async function coucheMaj(id,d){
  const c=coucheListe.find(x=>x.id===id);if(!c)return;
  const nb=Math.max(0,Math.min(30,c.nb+d));
  if(nb===c.nb)return;
  const{data,error}=await sb.rpc('kk_couches_ordi_saisir',{p_enfant_id:id,p_jour:document.getElementById('couches-jour').value,p_nb:nb});
  const r=data&&data[0];
  if(error||!r||!r.ok){alert(r&&r.error==='taille_inconnue'?'Taille de couche non renseignée sur la fiche enfant.':'Échec de l\'enregistrement, réessayez.');return;}
  c.nb=r.nb;coucheRender();
}
