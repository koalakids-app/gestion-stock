/* Livres cadeaux — Demandes › Enfants & suivi › « Livres cadeaux » (préfixe lc).
   Liste par crèche et par tranche d'âge (0-12, 12-24, 24-36, plus de 36 mois), âge calculé à une
   date de référence (par défaut le 25 décembre). Prénom + initiale du nom seulement (minimisation RGPD).
   Enfants non archivés, y compris ceux qui ne sont pas encore entrés. Lecture seule, pas de SQL. */
const LC_TRANCHES=[
  {k:'t0',lib:'0-12 mois',min:0,max:12},
  {k:'t1',lib:'12-24 mois',min:12,max:24},
  {k:'t2',lib:'24-36 mois',min:24,max:36},
  {k:'t3',lib:'Plus de 36 mois',min:36,max:Infinity}
];
const lcEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let lcDonnees=null;

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
function lcCalculer(){
  const ref=document.getElementById('lc-date').value||lcDateParDefaut();
  const creche=lcCrecheId();
  const g={t0:[],t1:[],t2:[],t3:[],sans:[]};
  cacheEnfants.filter(e=>String(e.creche_id)===String(creche)&&!enfIsArchived(e)).forEach(e=>{
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
function lcRender(){
  const z=document.getElementById('lc-contenu');if(!z)return;
  if(!lcCrecheId()){z.innerHTML='<div style="color:var(--muted);padding:20px">Aucune crèche sélectionnée.</div>';return;}
  lcDonnees=lcCalculer();
  const g=lcDonnees.g,total=LC_TRANCHES.reduce((a,t)=>a+g[t.k].length,0);
  const carte=t=>`<div style="background:#fff;border:1.5px solid #E6E3F3;border-radius:12px;padding:12px 14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <b style="color:var(--koala)">${t.lib}</b><span style="font-size:20px;font-weight:800;color:var(--orange,#F47920)">${g[t.k].length}</span></div>
    ${g[t.k].length?g[t.k].map(x=>`<div style="font-size:13px;padding:3px 0;border-top:1px solid #F1EFF7;display:flex;justify-content:space-between;gap:8px"><span>${lcEsc(lcPrenomInitiale(x.e))}${x.e.date_entree&&x.e.date_entree>lcDonnees.ref?' <span style="font-size:11px;color:var(--muted)">(pas encore entré·e)</span>':''}</span><span style="color:var(--muted)">${lcAgeTexte(x.m)}</span></div>`).join(''):'<div style="font-size:12px;color:var(--muted)">Aucun enfant</div>'}
  </div>`;
  z.innerHTML=`<div style="font-weight:700;color:var(--koala);margin-bottom:10px">${total} livre${total>1?'s':''} à prévoir · âges au ${lcDateFr(lcDonnees.ref)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;max-width:1000px">${LC_TRANCHES.map(carte).join('')}</div>`
    +(g.sans.length?`<div style="margin-top:14px;max-width:1000px;background:#FFF3DC;border-radius:10px;padding:10px 14px;font-size:13px;color:#6B4300">
      <b>À vérifier (${g.sans.length})</b> : date de naissance manquante ou postérieure à la date choisie, enfant non compté.<br>${g.sans.map(x=>lcEsc(lcPrenomInitiale(x.e))).join(', ')}</div>`:'');
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
    +'.tot{margin:12px 0;font-size:14px;font-weight:700}'
    +'section{border:2px solid #F47920;border-radius:12px;padding:10px 16px;margin:10px 0;break-inside:avoid}'
    +'h2{margin:0 0 4px;color:#4A3F9F;font-size:17px}.n{float:right;color:#F47920}'
    +'ul{margin:0;padding-left:20px;font-size:14px;columns:2}li{margin:2px 0}.a{font-size:12px;color:#777}'
    +'.sv{font-size:12px;background:#FFF3DC;color:#6B4300;border-radius:8px;padding:6px 10px;margin-top:10px}'
    +'.pied{text-align:center;font-size:9px;color:#999;margin-top:14px}</style></head><body>'
    +'<div class="hd"><img src="'+base+'logo-koalakids.png" alt="Koala Kids"><div><h1>Livres cadeaux</h1><small>'+lcEsc(d.creche)+' · âges au '+lcDateFr(d.ref)+'</small></div></div>'
    +'<div class="tot">'+total+' livre'+(total>1?'s':'')+' à prévoir</div>'+bloc
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
  const lignes=[['Crèche','Tranche','Prénom et initiale','Âge (mois)'].map(q).join(';')];
  LC_TRANCHES.forEach(t=>lcDonnees.g[t.k].forEach(x=>lignes.push([lcDonnees.creche,t.lib,lcPrenomInitiale(x.e),x.m].map(q).join(';'))));
  const blob=new Blob(['﻿'+lignes.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='livres-cadeaux-'+lcDonnees.ref+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
