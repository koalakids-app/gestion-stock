/* Livres cadeaux — Demandes › Enfants & suivi › « Livres cadeaux » (préfixe lc).
   Liste par crèche et par tranche d'âge (0-12, 12-24, 24-36, plus de 36 mois), âge calculé à une
   date de référence (par défaut le 25 décembre). Prénom + initiale du nom seulement (minimisation RGPD).
   Enfants non archivés, y compris ceux qui ne sont pas encore entrés ; sont écartés ceux dont le contrat a pris fin
   avant la date de référence (`lcContratFini`). Lecture seule, pas de SQL. */
const LC_TRANCHES=[
  {k:'t0',lib:'0-12 mois',min:0,max:12},
  {k:'t1',lib:'12-24 mois',min:12,max:24},
  {k:'t2',lib:'24-36 mois',min:24,max:36},
  {k:'t3',lib:'Plus de 36 mois',min:36,max:Infinity}
];
const lcEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let lcDonnees=null;
let lcFins={};
let lcAVenir={};
let lcChoix={};
const lcEuro=n=>(Math.round(n*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const lcPrix=k=>{const p=lcChoix[k]&&lcChoix[k].prix;return p==null||p===''?0:Number(p)||0;};
// Choix du livre par tranche (sql/livres_cadeaux_choix.sql) ; sans la table, les prix restent vides.
async function lcChargerChoix(){
  try{
    const r=await sb.from('livres_cadeaux_choix').select('tranche,titre,prix,image');
    if(r.error)throw r.error;
    const c={};(r.data||[]).forEach(x=>{c[x.tranche]=x;});
    lcChoix=c;
  }catch(err){console.warn('lcChargerChoix',err);}
  lcRender();
}
async function lcChoixSauver(k,champ,val){
  const cur=lcChoix[k]||{tranche:k};
  if(champ==='prix')val=String(val).trim()===''?null:Math.max(0,parseFloat(String(val).replace(',','.')));
  if(champ==='prix'&&val!==null&&isNaN(val))val=null;
  const ligne={tranche:k,titre:cur.titre||null,prix:cur.prix==null?null:cur.prix,image:cur.image||null,maj_le:new Date().toISOString()};
  ligne[champ]=val;
  const r=await sb.from('livres_cadeaux_choix').upsert(ligne,{onConflict:'org_id,tranche'});
  if(r.error){showBanner('Enregistrement impossible (script SQL livres_cadeaux_choix appliqué ?).','error');return;}
  lcChoix[k]=Object.assign({},cur,ligne);
  lcRender();
}
// Image de couverture : réduite à 500 px, JPEG, stockée dans la table.
function lcChoixImage(k,input){
  const f=input.files&&input.files[0];input.value='';
  if(!f)return;
  const img=new Image(),u=URL.createObjectURL(f);
  img.onload=()=>{
    const t=500,sc=Math.min(1,t/Math.max(img.width,img.height));
    const c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(u);
    lcChoixSauver(k,'image',c.toDataURL('image/jpeg',0.8));
  };
  img.onerror=()=>{URL.revokeObjectURL(u);showBanner('Image illisible.','error');};
  img.src=u;
}
// Date de fin la plus tardive connue (anciens contrats + contrats signés), comme enfChargerContratsFin.
async function lcChargerFins(){
  try{
    const[{data:ec},{data:c}]=await Promise.all([
      sb.from('enfants_contrats').select('enfant_id,date_fin'),
      sb.from('contrats').select('enfant_id,date_fin').in('statut',['signe','contresigne'])
    ]);
    const f={};
    (ec||[]).concat(c||[]).forEach(r=>{
      if(!r.enfant_id||!r.date_fin)return;
      if(!f[r.enfant_id]||r.date_fin>f[r.enfant_id])f[r.enfant_id]=r.date_fin;
    });
    lcFins=f;
  }catch(err){console.warn('lcChargerFins',err);}
  // Entrées à venir (même source que la tuile du même nom) : jamais écartées, même si un ancien contrat est terminé.
  try{
    const r=await sb.rpc('entrees_a_venir_referent');
    const a={};
    (Array.isArray(r.data)?r.data:[]).forEach(x=>{if(x&&x.id)a[x.id]=String(x.entree||'').slice(0,10);});
    lcAVenir=a;
  }catch(err){console.warn('lcChargerFins avenir',err);}
  lcRender();
}
// Contrat terminé avant la date de référence : date de sortie ou fin de contrat la plus tardive.
function lcContratFini(e,ref){
  if(lcAVenir[e.id])return false; // inscrit, accueil à venir : à compter
  let fin=e.date_sortie||'';
  const c=lcFins[e.id];
  if(c&&c>fin)fin=c;
  return !!fin&&fin<ref;
}

function lcDateParDefaut(){
  const n=new Date();let a=n.getFullYear();
  if(n.getMonth()===11&&n.getDate()>25)a++;
  return a+'-12-25';
}
function lcCrecheId(){
  if(!isDirection)return currentProfile?.creche_id||'';
  return document.getElementById('lc-creche')?.value||'';
}
function lcInit(){
  const sel=document.getElementById('lc-creche');
  if(sel&&!sel.options.length){
    sel.innerHTML=cacheCreches.map(c=>`<option value="${c.id}">${lcEsc(c.name)}</option>`).join('');
    if(currentProfile?.creche_id)sel.value=currentProfile.creche_id;
  }
  const d=document.getElementById('lc-date');
  if(d&&!d.value)d.value=lcDateParDefaut();
  lcRender();
  lcChargerFins();
  lcChargerChoix();
}
// Mois complets entre la naissance et la date de référence (négatif = pas encore né).
function lcAgeMois(dob,ref){
  const n=new Date(dob+'T12:00:00'),r=new Date(ref+'T12:00:00');
  if(isNaN(n)||isNaN(r))return null;
  let m=(r.getFullYear()-n.getFullYear())*12+(r.getMonth()-n.getMonth());
  if(r.getDate()<n.getDate())m--;
  return m;
}
function lcAgeTexte(m){
  if(m<24)return m+' mois';
  const a=Math.floor(m/12),r=m%12;
  return a+' an'+(a>1?'s':'')+(r?' '+r+' mois':'');
}
function lcPrenomInitiale(e){
  const p=String(e.prenom||'').trim(),n=String(e.nom||'').trim();
  return p+(n?' '+n.charAt(0).toUpperCase()+'.':'');
}
function lcCalculer(crecheId){
  const ref=document.getElementById('lc-date').value||lcDateParDefaut();
  const creche=crecheId||lcCrecheId();
  const g={t0:[],t1:[],t2:[],t3:[],sans:[]};
  cacheEnfants.filter(e=>String(e.creche_id)===String(creche)&&!enfIsArchived(e)&&!lcContratFini(e,ref)).forEach(e=>{
    if(!e.dob){g.sans.push({e,m:null});return;}
    const m=lcAgeMois(e.dob,ref);
    if(m===null||m<0){g.sans.push({e,m:null,anaitre:m!==null});return;}
    const t=LC_TRANCHES.find(t=>m>=t.min&&m<t.max);
    g[t.k].push({e,m});
  });
  Object.keys(g).forEach(k=>g[k].sort((a,b)=>lcPrenomInitiale(a.e).localeCompare(lcPrenomInitiale(b.e),'fr')));
  const cr=cacheCreches.find(c=>String(c.id)===String(creche));
  return{ref,creche:cr?cr.name:'',g};
}
function lcDateFr(iso){
  const d=new Date(iso+'T12:00:00');
  return isNaN(d)?iso:d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
}
function lcChoixHtml(){
  const ed=!!isDirection;
  const carte=t=>{const c=lcChoix[t.k]||{};
    const img=c.image?`<img src="${c.image}" alt="" style="width:100%;height:120px;object-fit:contain;background:#faf9fd;border-radius:8px">`
      :'<div style="height:120px;display:flex;align-items:center;justify-content:center;background:#faf9fd;border-radius:8px;color:var(--muted);font-size:12px">Pas d’image</div>';
    return`<div style="background:#fff;border:1.5px solid #E6E3F3;border-radius:12px;padding:10px 12px">
      <b style="color:var(--koala);font-size:13px">${t.lib}</b>${img}
      ${ed?`<label style="display:inline-block;margin:6px 0;font-size:12px;color:var(--koala);cursor:pointer"><i class="ti ti-photo-up"></i> ${c.image?'Changer':'Importer'} l’image<input type="file" accept="image/*" style="display:none" onchange="lcChoixImage('${t.k}',this)"></label>
        <input class="finput" placeholder="Titre du livre" value="${lcEsc(c.titre||'')}" onchange="lcChoixSauver('${t.k}','titre',this.value)" style="width:100%;font-size:12px;padding:4px 8px;margin-bottom:4px">
        <label style="font-size:12px;color:var(--muted)">Prix <input class="finput" inputmode="decimal" value="${c.prix==null?'':lcEsc(c.prix)}" onchange="lcChoixSauver('${t.k}','prix',this.value)" style="width:80px;font-size:12px;padding:4px 8px"> €</label>`
      :`<div style="font-size:13px;margin-top:6px">${lcEsc(c.titre||'Livre non choisi')}</div><div style="font-size:12px;color:var(--muted)">${c.prix!=null?lcEuro(Number(c.prix)):'Prix non renseigné'}</div>`}
    </div>`;};
  return`<div style="max-width:1000px;margin-bottom:16px"><div style="font-weight:700;color:var(--koala);margin-bottom:6px">Livre choisi par tranche d’âge${ed?'':' <span style="font-weight:400;font-size:12px;color:var(--muted)">(défini par la direction)</span>'}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px">${LC_TRANCHES.map(carte).join('')}</div></div>`;
}
function lcRender(){
  const z=document.getElementById('lc-contenu');if(!z)return;
  if(!lcCrecheId()){z.innerHTML='<div style="color:var(--muted);padding:20px">Aucune crèche sélectionnée.</div>';return;}
  lcDonnees=lcCalculer();
  const g=lcDonnees.g,total=LC_TRANCHES.reduce((a,t)=>a+g[t.k].length,0);
  const carte=t=>`<div style="background:#fff;border:1.5px solid #E6E3F3;border-radius:12px;padding:12px 14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <b style="color:var(--koala)">${t.lib}</b><span style="font-size:20px;font-weight:800;color:var(--orange,#F47920)">${g[t.k].length}</span></div>
    ${lcPrix(t.k)?`<div style="font-size:12px;color:var(--muted);margin-bottom:4px">${lcEuro(lcPrix(t.k))} × ${g[t.k].length} = <b>${lcEuro(lcPrix(t.k)*g[t.k].length)}</b></div>`:''}
    ${g[t.k].length?g[t.k].map(x=>`<div style="font-size:13px;padding:3px 0;border-top:1px solid #F1EFF7;display:flex;justify-content:space-between;gap:8px"><span>${lcEsc(lcPrenomInitiale(x.e))}${(lcAVenir[x.e.id]||x.e.date_entree||'')>lcDonnees.ref?' <span style="font-size:11px;color:var(--muted)">(entrée le '+lcEsc(lcDateFr(lcAVenir[x.e.id]||x.e.date_entree))+')</span>':''}</span><span style="color:var(--muted)">${lcAgeTexte(x.m)}</span></div>`).join(''):'<div style="font-size:12px;color:var(--muted)">Aucun enfant</div>'}
  </div>`;
  const budget=LC_TRANCHES.reduce((a,t)=>a+g[t.k].length*lcPrix(t.k),0);
  z.innerHTML=lcChoixHtml()+`<div style="font-weight:700;color:var(--koala);margin-bottom:10px">${total} livre${total>1?'s':''} à prévoir${budget?' · budget '+lcEuro(budget):''} · âges au ${lcDateFr(lcDonnees.ref)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;max-width:1000px">${LC_TRANCHES.map(carte).join('')}</div>`
    +(g.sans.length?`<div style="margin-top:14px;max-width:1000px;background:#FFF3DC;border-radius:10px;padding:10px 14px;font-size:13px;color:#6B4300">
      <b>À vérifier (${g.sans.length})</b> : date de naissance manquante ou postérieure à la date choisie, enfant non compté.<br>${g.sans.map(x=>lcEsc(lcPrenomInitiale(x.e))).join(', ')}</div>`:'');
  if(isDirection&&cacheCreches.length>1){
    z.insertAdjacentHTML('beforeend','<div style="margin-top:22px;max-width:1000px"><div style="font-weight:700;color:var(--koala);margin-bottom:6px">Toutes les crèches</div><style>#lc-contenu .rec{width:100%;border-collapse:collapse;font-size:13px}#lc-contenu .rec th,#lc-contenu .rec td{border:1px solid #E6E3F3;padding:6px 10px;text-align:right}#lc-contenu .rec th:first-child,#lc-contenu .rec td:first-child{text-align:left}#lc-contenu .rec th{background:#EEEDF8;color:var(--koala)}#lc-contenu .rec tfoot td{font-weight:800;background:#FDE8D6}#lc-contenu .sv{margin-top:8px;font-size:12px;color:#6B4300}</style>'+lcRecapTableau(lcRecap())+'</div>');
  }
}
function lcFicheHtml(d,base){
  const g=d.g,total=LC_TRANCHES.reduce((a,t)=>a+g[t.k].length,0);
  const bloc=LC_TRANCHES.map(t=>`<section><h2>${t.lib} <span class="n">${g[t.k].length}</span></h2>`
    +(g[t.k].length?'<ul>'+g[t.k].map(x=>'<li>'+lcEsc(lcPrenomInitiale(x.e))+' <span class="a">'+lcAgeTexte(x.m)+'</span></li>').join('')+'</ul>':'<div class="a">Aucun enfant</div>')+'</section>').join('');
  return'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Livres cadeaux</title>'
    +'<style>@page{size:A4;margin:14mm}*{box-sizing:border-box}'
    +'body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#2B2740;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.hd{background:#4A3F9F;color:#fff;padding:12px 16px;border-radius:10px;display:flex;align-items:center;gap:14px}'
    +'.hd img{height:42px;background:#fff;border-radius:8px;padding:4px 10px}.hd h1{margin:0;font-size:22px}.hd small{opacity:.85}'
    +'.rec{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}.rec th,.rec td{border:1px solid #D9D5EE;padding:6px 10px;text-align:left}'
    +'.rec th{background:#EEEDF8;color:#4A3F9F}.rec th:last-child,.rec td:last-child{text-align:right;width:140px}.rec tfoot td{font-weight:800;background:#FDE8D6}'
    +'section{border:2px solid #F47920;border-radius:12px;padding:10px 16px;margin:10px 0;break-inside:avoid}'
    +'h2{margin:0 0 4px;color:#4A3F9F;font-size:17px}.n{float:right;color:#F47920}'
    +'ul{margin:0;padding-left:20px;font-size:14px;columns:2}li{margin:2px 0}.a{font-size:12px;color:#777}'
    +'.sv{font-size:12px;background:#FFF3DC;color:#6B4300;border-radius:8px;padding:6px 10px;margin-top:10px}'
    +'.pied{text-align:center;font-size:9px;color:#999;margin-top:14px}</style></head><body>'
    +'<div class="hd"><img src="'+base+'logo-koalakids.png" alt="Koala Kids"><div><h1>Livres cadeaux</h1><small>'+lcEsc(d.creche)+' · âges au '+lcDateFr(d.ref)+'</small></div></div>'
    +'<table class="rec"><thead><tr><th>Tranche d’âge</th><th>Livres à prévoir</th></tr></thead><tbody>'
      +LC_TRANCHES.map(t=>'<tr><td>'+t.lib+'</td><td>'+g[t.k].length+'</td></tr>').join('')
      +'</tbody><tfoot><tr><td>Total</td><td>'+total+'</td></tr></tfoot></table>'+bloc
    +(g.sans.length?'<div class="sv"><b>À vérifier :</b> '+g.sans.map(x=>lcEsc(lcPrenomInitiale(x.e))).join(', ')+' (date de naissance manquante)</div>':'')
    +'<div class="pied">Application créée par David Bucari</div></body></html>';
}
function lcImprimer(){
  if(!lcDonnees)lcRender();
  if(!lcDonnees)return;
  const w=window.open('','_blank');if(!w){showBanner('Autorisez les fenêtres pop-up pour imprimer.','error');return;}
  const base=location.href.replace(/[^/]*([?#].*)?$/,'');
  w.document.write(lcFicheHtml(lcDonnees,base).replace('</body>','<script>window.onload=function(){window.print();}<\/script></body>'));
  w.document.close();
}
function lcCsv(){
  if(!lcDonnees)lcRender();
  if(!lcDonnees)return;
  const q=s=>'"'+String(s==null?'':s).replace(/"/g,'""')+'"';
  const lignes=[['Crèche','Tranche','Prénom et initiale','Âge (mois)','Prix du livre (€)'].map(q).join(';')];
  LC_TRANCHES.forEach(t=>lcDonnees.g[t.k].forEach(x=>lignes.push([lcDonnees.creche,t.lib,lcPrenomInitiale(x.e),x.m,lcPrix(t.k)?String(lcPrix(t.k)).replace('.',','):''].map(q).join(';'))));
  const blob=new Blob(['﻿'+lignes.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='livres-cadeaux-'+lcDonnees.ref+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

/* Récapitulatif toutes crèches (direction) : une ligne par crèche, une colonne par tranche. */
function lcRecap(){
  const lignes=cacheCreches.map(c=>{
    const d=lcCalculer(c.id),n=LC_TRANCHES.map(t=>d.g[t.k].length);
    return{nom:c.name,n,sans:d.g.sans.length,total:n.reduce((a,b)=>a+b,0),budget:n.reduce((a,x,i)=>a+x*lcPrix(LC_TRANCHES[i].k),0)};
  });
  const tot=LC_TRANCHES.map((t,i)=>lignes.reduce((a,l)=>a+l.n[i],0));
  return{ref:document.getElementById('lc-date').value||lcDateParDefaut(),lignes,tot,
    sans:lignes.reduce((a,l)=>a+l.sans,0),total:tot.reduce((a,b)=>a+b,0),budget:lignes.reduce((a,l)=>a+l.budget,0)};
}
function lcRecapTableau(r){
  const th=LC_TRANCHES.map(t=>'<th>'+t.lib+'</th>').join('');
  return'<table class="rec"><thead><tr><th>Crèche</th>'+th+'<th>Total</th>'+(r.budget?'<th>Budget</th>':'')+'</tr></thead><tbody>'
    +r.lignes.map(l=>'<tr><td>'+lcEsc(l.nom)+'</td>'+l.n.map(x=>'<td>'+x+'</td>').join('')+'<td><b>'+l.total+'</b></td>'+(r.budget?'<td><b>'+lcEuro(l.budget)+'</b></td>':'')+'</tr>').join('')
    +'</tbody><tfoot><tr><td>Toutes les crèches</td>'+r.tot.map(x=>'<td>'+x+'</td>').join('')+'<td>'+r.total+'</td>'+(r.budget?'<td>'+lcEuro(r.budget)+'</td>':'')+'</tr></tfoot></table>'
    +(r.sans?'<div class="sv">'+r.sans+' enfant'+(r.sans>1?'s':'')+' non compté'+(r.sans>1?'s':'')+' (date de naissance manquante ou postérieure à la date choisie).</div>':'');
}
function lcRecapHtml(r,base){
  return'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Livres cadeaux — toutes les crèches</title>'
    +'<style>@page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}'
    +'body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#2B2740;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.hd{background:#4A3F9F;color:#fff;padding:12px 16px;border-radius:10px;display:flex;align-items:center;gap:14px}'
    +'.hd img{height:42px;background:#fff;border-radius:8px;padding:4px 10px}.hd h1{margin:0;font-size:22px}.hd small{opacity:.85}'
    +'.rec{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}.rec th,.rec td{border:1px solid #D9D5EE;padding:7px 10px;text-align:right}'
    +'.rec th:first-child,.rec td:first-child{text-align:left}.rec th{background:#EEEDF8;color:#4A3F9F}.rec tfoot td{font-weight:800;background:#FDE8D6}'
    +'.sv{font-size:12px;background:#FFF3DC;color:#6B4300;border-radius:8px;padding:6px 10px}'
    +'.pied{text-align:center;font-size:9px;color:#999;margin-top:14px}</style></head><body>'
    +'<div class="hd"><img src="'+base+'logo-koalakids.png" alt="Koala Kids"><div><h1>Livres cadeaux — toutes les crèches</h1><small>Âges au '+lcDateFr(r.ref)+' · '+r.total+' livres à prévoir</small></div></div>'
    +lcRecapTableau(r)+'<div class="pied">Application créée par David Bucari</div></body></html>';
}
function lcImprimerRecap(){
  const w=window.open('','_blank');if(!w){showBanner('Autorisez les fenêtres pop-up pour imprimer.','error');return;}
  const base=location.href.replace(/[^/]*([?#].*)?$/,'');
  w.document.write(lcRecapHtml(lcRecap(),base).replace('</body>','<script>window.onload=function(){window.print();}<\/script></body>'));
  w.document.close();
}

/* Budget par crèche : une page par crèche (livre choisi, prix, nombre, montant) ; direction : toutes les crèches + synthèse. */
function lcBudgetPage(d){
  const g=d.g;let tot=0,nb=0;
  const lignes=LC_TRANCHES.map(t=>{const c=lcChoix[t.k]||{},n=g[t.k].length,m=n*lcPrix(t.k);tot+=m;nb+=n;
    return'<tr><td>'+t.lib+'</td><td class="l">'+(c.image?'<img src="'+c.image+'" alt="">':'')+'<span>'+lcEsc(c.titre||'Livre non choisi')+'</span></td><td>'+(c.prix!=null?lcEuro(Number(c.prix)):'—')+'</td><td>'+n+'</td><td><b>'+lcEuro(m)+'</b></td></tr>';}).join('');
  return'<section class="pg"><h2>'+lcEsc(d.creche)+'</h2><table class="rec"><thead><tr><th>Tranche d’âge</th><th>Livre choisi</th><th>Prix unitaire</th><th>Nombre</th><th>Montant</th></tr></thead><tbody>'
    +lignes+'</tbody><tfoot><tr><td colspan="3">Total</td><td>'+nb+'</td><td>'+lcEuro(tot)+'</td></tr></tfoot></table>'
    +(g.sans.length?'<div class="sv">Non comptés (date de naissance manquante) : '+g.sans.map(x=>lcEsc(lcPrenomInitiale(x.e))).join(', ')+'</div>':'')+'</section>';
}
function lcBudgetHtml(pages,r,base){
  const ref=r.ref;
  return'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Livres cadeaux — budget</title>'
    +'<style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#2B2740;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.hd{background:#4A3F9F;color:#fff;padding:12px 16px;border-radius:10px;display:flex;align-items:center;gap:14px;margin-bottom:10px}.hd img{height:42px;background:#fff;border-radius:8px;padding:4px 10px}.hd h1{margin:0;font-size:22px}.hd small{opacity:.85}'
    +'.pg{break-after:page}.pg:last-of-type{break-after:auto}h2{color:#4A3F9F;margin:8px 0}'
    +'.rec{width:100%;border-collapse:collapse;margin:10px 0;font-size:14px}.rec th,.rec td{border:1px solid #D9D5EE;padding:6px 10px;text-align:right}.rec th:first-child,.rec td:first-child,.rec td.l,.rec th:nth-child(2){text-align:left}'
    +'.rec th{background:#EEEDF8;color:#4A3F9F}.rec tfoot td{font-weight:800;background:#FDE8D6}.rec td.l img{height:56px;vertical-align:middle;margin-right:10px;border-radius:4px}'
    +'.sv{font-size:12px;background:#FFF3DC;color:#6B4300;border-radius:8px;padding:6px 10px}.pied{text-align:center;font-size:9px;color:#999;margin-top:14px}</style></head><body>'
    +'<div class="hd"><img src="'+base+'logo-koalakids.png" alt="Koala Kids"><div><h1>Livres cadeaux — budget</h1><small>Âges au '+lcDateFr(ref)+'</small></div></div>'
    +(r.synthese?'<section class="pg"><h2>Synthèse</h2>'+lcRecapTableau(r.synthese)+'</section>':'')
    +pages.join('')+'<div class="pied">Application créée par David Bucari</div></body></html>';
}
function lcBudget(toutes){
  if(!Object.keys(lcChoix).length)showBanner('Aucun livre ni prix renseigné : le budget sera à 0 €.','error');
  const creches=toutes&&isDirection?cacheCreches:[{id:lcCrecheId()}];
  const pages=creches.map(c=>lcBudgetPage(lcCalculer(c.id)));
  const ref=document.getElementById('lc-date').value||lcDateParDefaut();
  const w=window.open('','_blank');if(!w){showBanner('Autorisez les fenêtres pop-up pour imprimer.','error');return;}
  const base=location.href.replace(/[^/]*([?#].*)?$/,'');
  w.document.write(lcBudgetHtml(pages,{ref,synthese:toutes&&isDirection?lcRecap():null},base).replace('</body>','<script>window.onload=function(){window.print();}<\/script></body>'));
  w.document.close();
}
