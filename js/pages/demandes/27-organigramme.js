/* Organigramme — Demandes › Équipe › « Organigramme » (préfixe og).
   Lecture seule, pas de SQL : construit à partir de `cacheReferents` (direction, référent·e·s) et de
   `cacheEmployes` (fiches non archivées). Deux présentations :
   - « Par crèche » : direction → crèches → référent·e → équipe ;
   - « Par fonction » : direction → fonctions (poste) → personnes, avec la crèche de chacun·e.
   Les comptes d'accès terrain (rôle `employe`) ne sont pas listés (ce sont des collègues déjà présents
   via leur fiche) ; une fiche liée à un·e référent·e n'est pas comptée deux fois. Direction = toutes les
   crèches, référent·e = la sienne. Impression / PDF par la fenêtre d'impression du navigateur. */
let ogMode='creche';
const ogEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function ogInit(){
  const sel=document.getElementById('og-creche');
  if(sel){
    const v=sel.value;
    sel.innerHTML='<option value="all">Toutes les crèches</option>'+cacheCreches.map(c=>`<option value="${c.id}">${ogEsc(c.name)}</option>`).join('');
    sel.value=isDirection?(v||'all'):(currentProfile?.creche_id||'all');
  }
  ogMajBoutons();
  ogRender();
}
function ogMode_(m){ogMode=m;ogMajBoutons();ogRender();}
function ogMajBoutons(){
  [['creche','og-b-creche'],['fonction','og-b-fonction']].forEach(([m,id])=>{
    const b=document.getElementById(id);if(b)b.classList.toggle('active',ogMode===m);
  });
}
function ogInitiales(nom){
  return String(nom||'').trim().split(/\s+/).filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?';
}
function ogCarte(p,cls){
  return '<div class="og-node '+(cls||'')+'"><div class="og-av">'+ogEsc(ogInitiales(p.nom))+'</div>'
    +'<div class="og-nom">'+ogEsc(p.nom)+'</div><div class="og-poste">'+ogEsc(p.poste)+'</div>'
    +(p.creche?'<div class="og-creche"><i class="ti ti-building" style="font-size:11px"></i> '+ogEsc(p.creche)+'</div>':'')+'</div>';
}
// Personnes du réseau, déjà normalisées (nom, poste, rôle, crèche).
function ogPersonnes(crecheId){
  const nomCreche=id=>cacheCreches.find(c=>c.id===id)?.name||'';
  const refs=cacheReferents.filter(r=>r.role==='direction'||r.role==='referent');
  const liees=new Set(refs.map(r=>r.employe_id).filter(Boolean));
  const dir=refs.filter(r=>r.role==='direction').map(r=>({id:r.id,nom:r.name,poste:r.poste||'Direction',creche_id:r.creche_id,creche:nomCreche(r.creche_id)}));
  const ref=refs.filter(r=>r.role==='referent').map(r=>({id:r.id,nom:r.name,poste:r.poste||'Référent·e',creche_id:r.creche_id,creche:nomCreche(r.creche_id)}));
  const emp=cacheEmployes.filter(e=>!e.archive_le&&!liees.has(e.id)).map(e=>({
    id:e.id,nom:((e.prenom||'')+' '+(e.nom||'')).trim()||'—',poste:e.poste||'Collaborateur·trice',creche_id:e.creche_id,creche:nomCreche(e.creche_id)
  }));
  const filtre=l=>crecheId==='all'?l:l.filter(p=>p.creche_id===crecheId);
  return{dir,ref:filtre(ref),emp:filtre(emp)};
}
function ogRender(){
  const zone=document.getElementById('og-contenu');if(!zone)return;
  let crecheId=document.getElementById('og-creche')?.value||'all';
  if(!isDirection)crecheId=currentProfile?.creche_id||'all';
  const{dir,ref,emp}=ogPersonnes(crecheId);
  const haut=dir.length
    ?'<div class="og-row">'+dir.map(p=>ogCarte(p,'og-dir')).join('')+'</div>'
    :'<div class="og-row"><div class="og-node og-vide">Direction à renseigner</div></div>';
  let corps='';
  if(ogMode==='creche'){
    const creches=cacheCreches.filter(c=>crecheId==='all'||c.id===crecheId);
    corps='<div class="og-branches">'+creches.map(c=>{
      const r=ref.filter(p=>p.creche_id===c.id),e=emp.filter(p=>p.creche_id===c.id);
      return '<div class="og-branche"><div class="og-titre"><i class="ti ti-building"></i> '+ogEsc(c.name)+' <span class="og-nb">'+(r.length+e.length)+'</span></div>'
        +'<div class="og-liste">'+(r.map(p=>ogCarte(p,'og-ref')).join('')||'<div class="og-node og-vide">Référent·e à renseigner</div>')+'</div>'
        +'<div class="og-liste og-equipe">'+(e.map(p=>ogCarte(Object.assign({},p,{creche:''}),'')).join('')||'<div class="og-vide-txt">Aucun·e collaborateur·trice</div>')+'</div></div>';
    }).join('')+'</div>';
  }else{
    const groupes={};
    ref.concat(emp).forEach(p=>{const k=p.poste.trim()||'Autre';(groupes[k]=groupes[k]||[]).push(p);});
    const cles=Object.keys(groupes).sort((a,b)=>a.localeCompare(b,'fr'));
    corps='<div class="og-branches">'+cles.map(k=>
      '<div class="og-branche"><div class="og-titre"><i class="ti ti-briefcase"></i> '+ogEsc(k)+' <span class="og-nb">'+groupes[k].length+'</span></div>'
      +'<div class="og-liste og-equipe">'+groupes[k].sort((a,b)=>a.nom.localeCompare(b.nom,'fr')).map(p=>ogCarte(p,'')).join('')+'</div></div>'
    ).join('')+'</div>';
    if(!cles.length)corps='<div class="empty-state"><i class="ti ti-sitemap"></i><p>Aucune personne à afficher.</p></div>';
  }
  zone.innerHTML='<div class="og-arbre">'+haut+'<div class="og-trait"></div>'+corps+'</div>';
}
const OG_CSS_PRINT='.og-arbre{display:flex;flex-direction:column;align-items:center}.og-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.og-trait{width:2px;height:18px;background:#bbb}'
  +'.og-branches{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;align-items:flex-start;border-top:2px solid #bbb;padding-top:14px}.og-branche{width:190px;display:flex;flex-direction:column;gap:6px}'
  +'.og-titre{background:#3D3580;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.og-nb{margin-left:4px;font-size:10px}'
  +'.og-liste{display:flex;flex-direction:column;gap:6px}.og-equipe{border-left:2px solid #bbb;padding-left:8px;margin-left:10px}'
  +'.og-node{border:1px solid #bbb;border-radius:8px;padding:6px 8px;text-align:center;break-inside:avoid}.og-dir{border-color:#F59E0B;background:#FFF4E0}.og-ref{border-color:#3D3580}'
  +'.og-av{display:none}.og-nom{font-weight:700;font-size:12px}.og-poste,.og-creche{font-size:10.5px;color:#666}.og-vide,.og-vide-txt{color:#999;font-size:11px}.og-vide{border-style:dashed}';
function ogImprimer(){
  const zone=document.getElementById('og-contenu');if(!zone)return;
  const w=window.open('','_blank');if(!w){alert('Autorisez les fenêtres pop-up pour imprimer.');return;}
  const css=OG_CSS_PRINT;
  w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Organigramme Koala Kids</title><style>'
    +'body{font-family:Arial,sans-serif;margin:18px;color:#222}h1{font-size:18px}'+css+'</style></head><body><h1>Organigramme — Koala Kids</h1>'
    +zone.innerHTML+'<div style="margin-top:18px;font-size:10px;color:#888;text-align:center">Application créée par David Bucari</div></body></html>');
  w.document.close();w.focus();setTimeout(()=>w.print(),300);
}
