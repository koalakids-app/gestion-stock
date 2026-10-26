/* ══════════════════════════════════════════════════════════════════════════
   RECETTES DES GOÛTERS (MCM › Menus › « Goûters de la crèche » › Recettes)

   Bibliothèque de recettes COMMUNE aux crèches (tables `recettes` et
   `recettes_ingredients`, voir sql/recettes_gouters.sql) : la direction les écrit,
   les référents les utilisent. Une recette est écrite pour `nb_enfants_ref`
   enfants ; ses quantités sont recalculées pour l'effectif du jour. Chaque
   ingrédient porte ses allergènes, ceux de la recette en sont la somme.

   Ce fichier contient aussi le calcul des produits à commander (goûters simples
   « laitage / pain / fruit » + ingrédients des recettes) et le récapitulatif de
   commande sur 2 semaines, moyens et grands séparés.
   ═════════════════════════════════════════════════════════════════════════ */
const RC_ALLERGENES=[
  {k:'gluten',l:'Gluten'},{k:'oeuf',l:'Œuf'},{k:'lait',l:'Lait'},{k:'fruits_coque',l:'Fruits à coque'},
  {k:'arachide',l:'Arachide'},{k:'soja',l:'Soja'},{k:'poisson',l:'Poisson'},{k:'crustaces',l:'Crustacés'},
  {k:'mollusques',l:'Mollusques'},{k:'sesame',l:'Sésame'},{k:'moutarde',l:'Moutarde'},
  {k:'celeri',l:'Céleri'},{k:'lupin',l:'Lupin'},{k:'sulfites',l:'Sulfites'}
];
const RC_UNITES=['g','kg','cl','l','pièce','sachet'];
/* Mots qui, dans le champ « allergies » (texte libre) d'une fiche enfant, évoquent un allergène. */
const RC_MOTS={
  lait:/\blait|lactose|\bapl?v|proteines? de vache|laitier|laitage/,
  oeuf:/\boeuf/,
  gluten:/gluten|\bble\b|coeliaq|froment|seigle|\borge\b/,
  fruits_coque:/noisette|amande|noix|pistache|cajou|pecan|fruits? a coque/,
  arachide:/arachide|cacahu/,soja:/soja/,poisson:/poisson/,crustaces:/crustace|crevette/,
  mollusques:/mollusque/,sesame:/sesame/,moutarde:/moutarde/,celeri:/celeri/,lupin:/lupin/,sulfites:/sulfite/
};
let rcCache=null; // id -> {id,nom,nb,etapes,ings:[{nom,q,u,al:[]}]}

function rcNorm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/œ/g,'oe').replace(/\s+/g,' ').trim();}
function rcLibelleAllergene(k){const a=RC_ALLERGENES.filter(function(x){return x.k===k;})[0];return a?a.l:k;}
function rcAllergenesHtml(list){
  return(list||[]).map(function(k){return'<span style="display:inline-block;background:#FDE8D6;color:#A8480B;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;margin:2px 3px 0 0">'+escHtml(rcLibelleAllergene(k))+'</span>';}).join('');
}
function rcAllergenesRecette(r){
  const s={};((r&&r.ings)||[]).forEach(function(i){(i.al||[]).forEach(function(k){s[k]=1;});});
  return RC_ALLERGENES.map(function(a){return a.k;}).filter(function(k){return s[k];});
}
/* Allergènes évoqués par le texte libre d'une fiche enfant. */
function rcAllergenesDeTexte(txt){
  const t=rcNorm(txt);
  return Object.keys(RC_MOTS).filter(function(k){return RC_MOTS[k].test(t);});
}

/* Direction : tout ; référent : créer, et modifier ses propres recettes. */
function rcPeutCreer(){return isDirection||currentProfile?.role==='referent';}
function rcPeutModifier(r){return isDirection||(currentProfile?.role==='referent'&&(!r||!r.id||(!!r.par&&r.par===currentUser?.id)));}

async function rcCharger(force){
  if(rcCache&&!force)return rcCache;
  const map={};
  try{
    const[r1,r2]=await Promise.all([
      sb.from('recettes').select('id,nom,nb_enfants_ref,etapes,created_by').order('nom'),
      sb.from('recettes_ingredients').select('recette_id,ordre,nom,quantite,unite,allergenes').order('ordre')
    ]);
    if(r1.error)throw r1.error;if(r2.error)throw r2.error;
    (r1.data||[]).forEach(function(r){map[r.id]={id:r.id,nom:r.nom,nb:r.nb_enfants_ref||10,etapes:r.etapes||'',par:r.created_by||null,ings:[]};});
    (r2.data||[]).forEach(function(i){if(map[i.recette_id])map[i.recette_id].ings.push({nom:i.nom,q:+i.quantite||0,u:i.unite||'g',al:i.allergenes||[]});});
  }catch(err){console.warn('[Recettes] lecture',err);}
  rcCache=map;
  return map;
}

/* Quantité affichable : pièces arrondies au supérieur, g/cl à l'unité, passage en kg / l au-delà de 1000 g / 100 cl. */
function rcFmtQte(q,u){
  if(u==='pièce'||u==='sachet')return Math.ceil(q-1e-9)+' '+u+(Math.ceil(q-1e-9)>1&&u==='pièce'?'s':'');
  if(u==='g'&&q>=1000)return(Math.round(q/10)/100).toString().replace('.',',')+' kg';
  if(u==='cl'&&q>=100)return(Math.round(q)/100).toString().replace('.',',')+' l';
  return Math.round(q)+' '+u;
}
/* kg → g et l → cl pour pouvoir additionner. */
function rcUniteBase(q,u){return u==='kg'?{q:q*1000,u:'g'}:u==='l'?{q:q*100,u:'cl'}:{q:q,u:u};}

/* ── Calcul des produits à commander ─────────────────────────────────────────
   jours : [{sem:0|1, profil:'moyen'|'grand', n, texte, recettes:[recette]}]
   Retourne [{nom,unite,ing,v:{moyen:[s1,s2],grand:[s1,s2]}}] trié par nom. */
function gcLignes(jours){
  const map={};
  function ajoute(cle,nom,unite,ing,profil,sem,q){
    const e=map[cle]=map[cle]||{nom:nom,unite:unite,ing:ing,v:{moyen:[0,0],grand:[0,0]}};
    e.v[profil][sem]+=q;
  }
  jours.forEach(function(j){
    if(!j.n)return;
    const noms={};(j.recettes||[]).forEach(function(r){noms[rcNorm(r.nom)]=1;});
    if(!/f[ée]ri[ée]/i.test(j.texte||'')){
      String(j.texte||'').split('/').forEach(function(p){
        const nom=p.trim().replace(/\s+/g,' '),cle=rcNorm(nom);
        if(!cle||noms[cle])return; // le nom d'une recette n'est pas un produit à acheter
        ajoute('p|'+cle,nom,'',false,j.profil,j.sem,j.n);
      });
    }
    (j.recettes||[]).forEach(function(r){
      r.ings.forEach(function(i){
        const b=rcUniteBase(i.q*j.n/(r.nb||10),i.u);
        ajoute('i|'+rcNorm(i.nom)+'|'+b.u,i.nom,b.u,true,j.profil,j.sem,b.q);
      });
    });
  });
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.nom.localeCompare(b.nom,'fr');});
}
function gcFmtLigne(e,q){return q?(e.ing?rcFmtQte(q,e.unite):String(Math.round(q))):'—';}
function gcTotalLigne(e,filtre){
  let t=0;['moyen','grand'].forEach(function(p){if(!filtre||filtre===p)t+=e.v[p][0]+e.v[p][1];});
  return t;
}

/* ── Fiche cuisine (impression A4) ────────────────────────────────────────── */
function rcFicheImprimer(r,n){
  const f=n/(r.nb||10);
  const w=window.open('','_blank');
  if(!w){showBanner('Autorisez les fenêtres pop-up pour imprimer la fiche.','error');return;}
  w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>'+escHtml(r.nom)+'</title>'
    +'<style>body{font-family:system-ui,sans-serif;margin:24px;color:#222}h1{margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}'
    +'.al{background:#FDE8D6;color:#A8480B;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:700;margin-right:4px}</style></head><body>'
    +'<h1>'+escHtml(r.nom)+'</h1><div>Pour <b>'+n+'</b> enfant'+(n>1?'s':'')+'</div>'
    +'<table><tr><th>Ingrédient</th><th>Quantité</th><th>Allergènes</th></tr>'
    +r.ings.map(function(i){const b=rcUniteBase(i.q*f,i.u);return'<tr><td>'+escHtml(i.nom)+'</td><td>'+escHtml(rcFmtQte(b.q,b.u))+'</td><td>'+(i.al||[]).map(function(k){return'<span class="al">'+escHtml(rcLibelleAllergene(k))+'</span>';}).join('')+'</td></tr>';}).join('')
    +'</table><p><b>Allergènes de la recette :</b> '+(rcAllergenesRecette(r).map(function(k){return'<span class="al">'+escHtml(rcLibelleAllergene(k))+'</span>';}).join('')||'aucun')+'</p>'
    +(r.etapes?'<h3>Préparation</h3><div style="white-space:pre-wrap">'+escHtml(r.etapes)+'</div>':'')
    +'<script>window.onload=function(){window.print();}<\/script><div style="text-align:center;font-size:9px;color:#999;margin-top:14px">Application créée par David Bucari</div></body></html>');
  w.document.close();
}

/* ── Bibliothèque : liste, édition ────────────────────────────────────────── */
async function rcOuvrirBibliotheque(){
  const recettes=await rcCharger(true);
  let ov=document.getElementById('modal-recettes-wrap');if(ov)ov.remove();
  ov=document.createElement('div');ov.className='overlay';ov.id='modal-recettes-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-recettes-wrap');};
  const liste=Object.keys(recettes).map(function(k){return recettes[k];});
  ov.innerHTML='<div class="modal" style="max-width:520px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">'
    +'<h3 style="margin:0"><i class="ti ti-book"></i> Recettes des goûters</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-recettes-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Recettes communes à toutes les crèches'+(isDirection?'. Vous pouvez les créer et les modifier.':'. Vous pouvez en créer et modifier celles que vous avez créées (les autres sont en lecture seule).')+'</p>'
    +(liste.length?liste.map(function(r){
      return'<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px">'
        +'<div><strong>'+escHtml(r.nom)+'</strong> <span style="font-size:11px;color:var(--muted)">pour '+r.nb+' enfants</span><div>'+rcAllergenesHtml(rcAllergenesRecette(r))+'</div></div>'
        +'<button class="btn-cancel" data-rc="'+escHtml(r.id)+'">'+(rcPeutModifier(r)?'Modifier':'Voir')+'</button></div>';
    }).join(''):'<div class="empty-state"><i class="ti ti-book"></i><p>Aucune recette pour l’instant.</p></div>')
    +(rcPeutCreer()?'<div style="margin-top:10px"><button class="btn-primary" id="rc-nouvelle"><i class="ti ti-plus"></i> Nouvelle recette</button></div>':'')
    +'</div>';
  document.body.appendChild(ov);
  Array.prototype.forEach.call(ov.querySelectorAll('[data-rc]'),function(b){b.onclick=function(){rcEditer(b.dataset.rc);};});
  const nv=document.getElementById('rc-nouvelle');if(nv)nv.onclick=function(){rcEditer(null);};
  ov.classList.add('open');
}

async function rcEditer(id,apres){
  const recettes=await rcCharger();
  const r=id&&recettes[id]?recettes[id]:{id:null,nom:'',nb:10,etapes:'',ings:[]};
  const edit=rcPeutModifier(r);
  let ov=document.getElementById('modal-recette-edit-wrap');if(ov)ov.remove();
  ov=document.createElement('div');ov.className='overlay';ov.id='modal-recette-edit-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-recette-edit-wrap');};
  const dis=edit?'':' disabled';
  ov.innerHTML='<div class="modal" style="max-width:560px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">'
    +'<h3 style="margin:0"><i class="ti ti-chef-hat"></i> '+(r.id?'Recette':'Nouvelle recette')+'</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-recette-edit-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<div class="fg"><label class="flabel">Nom</label><input class="finput" id="rce-nom" maxlength="120" value="'+escHtml(r.nom)+'"'+dis+'/></div>'
    +'<div class="fg"><label class="flabel">Écrite pour (nombre d’enfants)</label><input class="finput" type="number" min="1" max="200" id="rce-nb" value="'+r.nb+'"'+dis+'/></div>'
    +'<div class="flabel">Ingrédients</div><div id="rce-ings"></div>'
    +(edit?'<button class="btn-cancel" id="rce-add" style="margin:6px 0"><i class="ti ti-plus"></i> Ingrédient</button>':'')
    +'<div id="rce-al" style="margin:6px 0"></div>'
    +'<div class="fg"><label class="flabel">Préparation (facultatif)</label><textarea class="finput" id="rce-etapes" rows="4"'+dis+'>'+escHtml(r.etapes)+'</textarea></div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">'
    +(r.id?'<button class="btn-cancel" id="rce-fiche"><i class="ti ti-printer"></i> Fiche cuisine</button>':'')
    +(edit&&r.id?'<button class="btn-cancel" id="rce-suppr" style="color:var(--red)">Supprimer</button>':'')
    +(edit?'<button class="btn-primary" id="rce-save"><i class="ti ti-device-floppy"></i> Enregistrer</button>':'')+'</div></div>';
  document.body.appendChild(ov);
  const zone=document.getElementById('rce-ings');
  function ligne(i){
    const d=document.createElement('div');d.className='rce-ing';d.style.cssText='border:1px solid var(--border);border-radius:8px;padding:6px;margin-bottom:6px';
    d.innerHTML='<div style="display:flex;gap:6px"><input class="finput rce-i-nom" placeholder="Ingrédient" maxlength="120" value="'+escHtml(i.nom)+'"'+dis+'/>'
      +'<input class="finput rce-i-q" type="number" min="0" step="any" style="max-width:80px" value="'+(i.q||'')+'"'+dis+'/>'
      +'<select class="finput rce-i-u" style="max-width:90px"'+dis+'>'+RC_UNITES.map(function(u){return'<option'+(u===i.u?' selected':'')+'>'+u+'</option>';}).join('')+'</select>'
      +(edit?'<button class="btn-cancel rce-i-x" style="padding:4px 8px"><i class="ti ti-trash"></i></button>':'')+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:5px">'+RC_ALLERGENES.map(function(a){
        return'<label style="font-size:11px;cursor:pointer"><input type="checkbox" class="rce-i-al" value="'+a.k+'"'+((i.al||[]).indexOf(a.k)>=0?' checked':'')+dis+'/> '+escHtml(a.l)+'</label>';}).join('')+'</div>';
    const x=d.querySelector('.rce-i-x');if(x)x.onclick=function(){d.remove();majAl();};
    Array.prototype.forEach.call(d.querySelectorAll('.rce-i-al'),function(c){c.onchange=majAl;});
    zone.appendChild(d);
  }
  function lire(){
    return Array.prototype.map.call(zone.querySelectorAll('.rce-ing'),function(d){
      return{nom:d.querySelector('.rce-i-nom').value.trim(),q:parseFloat(d.querySelector('.rce-i-q').value)||0,u:d.querySelector('.rce-i-u').value,
        al:Array.prototype.map.call(d.querySelectorAll('.rce-i-al:checked'),function(c){return c.value;})};
    }).filter(function(i){return i.nom;});
  }
  function majAl(){document.getElementById('rce-al').innerHTML='<span style="font-size:12px;font-weight:700">Allergènes de la recette :</span> '+(rcAllergenesHtml(rcAllergenesRecette({ings:lire()}))||'<span style="font-size:12px;color:var(--muted)">aucun</span>');}
  (r.ings.length?r.ings:(edit?[{nom:'',q:0,u:'g',al:[]}]:[])).forEach(ligne);
  majAl();
  const add=document.getElementById('rce-add');if(add)add.onclick=function(){ligne({nom:'',q:0,u:'g',al:[]});};
  const fiche=document.getElementById('rce-fiche');
  if(fiche)fiche.onclick=function(){
    const n=parseInt(prompt('Fiche cuisine pour combien d’enfants ?',String(r.nb)),10);
    if(n>0)rcFicheImprimer({nom:r.nom,nb:parseInt(document.getElementById('rce-nb').value,10)||r.nb,etapes:document.getElementById('rce-etapes').value,ings:lire()},n);
  };
  const sup=document.getElementById('rce-suppr');
  if(sup)sup.onclick=async function(){
    if(!confirm('Supprimer cette recette ? Elle sera retirée des goûters où elle est choisie.'))return;
    const{error}=await sb.from('recettes').delete().eq('id',r.id);
    if(error){showBanner('Suppression impossible.','error');return;}
    await rcCharger(true);closeModal('modal-recette-edit-wrap');
    if(document.getElementById('modal-recettes-wrap'))rcOuvrirBibliotheque();
    if(apres)apres();
  };
  const save=document.getElementById('rce-save');
  if(save)save.onclick=async function(){
    const nom=document.getElementById('rce-nom').value.trim(),nb=parseInt(document.getElementById('rce-nb').value,10)||0,ings=lire();
    if(!nom){showBanner('Donnez un nom à la recette.','error');return;}
    if(nb<1){showBanner('Indiquez pour combien d’enfants la recette est écrite.','error');return;}
    try{
      const row={nom:nom,nb_enfants_ref:nb,etapes:document.getElementById('rce-etapes').value.trim()||null,updated_at:new Date().toISOString()};
      let rid=r.id;
      if(rid){const{error}=await sb.from('recettes').update(row).eq('id',rid);if(error)throw error;}
      else{const{data,error}=await sb.from('recettes').insert(row).select('id').single();if(error)throw error;rid=data.id;}
      {const{error}=await sb.from('recettes_ingredients').delete().eq('recette_id',rid);if(error)throw error;}
      if(ings.length){
        const{error}=await sb.from('recettes_ingredients').insert(ings.map(function(i,n){return{recette_id:rid,ordre:n,nom:i.nom,quantite:i.q,unite:i.u,allergenes:i.al};}));
        if(error)throw error;
      }
    }catch(err){console.error('[Recettes] enregistrement',err);showBanner('Erreur lors de l’enregistrement de la recette.','error');return;}
    await rcCharger(true);
    showBanner('Recette enregistrée ✅');
    closeModal('modal-recette-edit-wrap');
    if(document.getElementById('modal-recettes-wrap'))rcOuvrirBibliotheque();
    if(apres)apres();
  };
  ov.classList.add('open');
}

/* Choix d'une recette pour un jour : appelle cb(recette). */
async function rcChoisir(cb){
  const recettes=await rcCharger();
  const liste=Object.keys(recettes).map(function(k){return recettes[k];});
  let ov=document.getElementById('modal-recette-choix-wrap');if(ov)ov.remove();
  ov=document.createElement('div');ov.className='overlay';ov.id='modal-recette-choix-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-recette-choix-wrap');};
  ov.innerHTML='<div class="modal" style="max-width:420px;width:100%"><h3 style="margin:0 0 8px"><i class="ti ti-book"></i> Choisir une recette</h3>'
    +(liste.length?liste.map(function(r){return'<button class="btn-cancel" data-rc="'+escHtml(r.id)+'" style="display:block;width:100%;text-align:left;margin-bottom:6px"><strong>'+escHtml(r.nom)+'</strong> '+rcAllergenesHtml(rcAllergenesRecette(r))+'</button>';}).join('')
      :'<p style="font-size:13px;color:var(--muted)">Aucune recette. '+(rcPeutCreer()?'Créez-en une ci-dessous.':'La direction doit d’abord en créer.')+'</p>')
    +(rcPeutCreer()?'<button class="btn-primary" id="rcc-new"><i class="ti ti-plus"></i> Nouvelle recette</button> ':'')
    +'<button class="btn-cancel" onclick="closeModal(\'modal-recette-choix-wrap\')">Annuler</button></div>';
  document.body.appendChild(ov);
  Array.prototype.forEach.call(ov.querySelectorAll('[data-rc]'),function(b){b.onclick=function(){closeModal('modal-recette-choix-wrap');cb(recettes[b.dataset.rc]);};});
  const nv=document.getElementById('rcc-new');
  if(nv)nv.onclick=function(){closeModal('modal-recette-choix-wrap');rcEditer(null,function(){rcChoisir(cb);});};
  ov.classList.add('open');
}

/* ── Récapitulatif de commande sur 2 semaines ─────────────────────────────── */
async function gouterRecapOuvrir(crecheId,semaine){
  const recettes=await rcCharger();
  const sem2=ipDateToLocalISO(new Date(+semaine.slice(0,4),+semaine.slice(5,7)-1,+semaine.slice(8,10)+7)); // pas +7*24 h : le changement d'heure d'octobre/mars décalerait d'un jour
  const semaines=[semaine,sem2];
  const jours=[];
  try{
    const[t,e,rr]=await Promise.all([
      sb.from('menus_gouters_creche').select('date_debut,jour,gouter,gouter_grand').eq('creche_id',crecheId).in('date_debut',semaines),
      sb.from('gouters_creche_effectifs').select('date_debut,jour,moyens,moyens_l1,moyens_l2,grands').eq('creche_id',crecheId).in('date_debut',semaines),
      sb.from('gouters_creche_recettes').select('date_debut,jour,profil,recette_id').eq('creche_id',crecheId).in('date_debut',semaines)
    ]);
    if(t.error)throw t.error;if(e.error)throw e.error;if(rr.error)throw rr.error;
    semaines.forEach(function(sd,si){
      for(let j=1;j<=5;j++){
        const tx=(t.data||[]).filter(function(x){return x.date_debut===sd&&x.jour===j;})[0]||{};
        const ef=(e.data||[]).filter(function(x){return x.date_debut===sd&&x.jour===j;})[0]||{};
        const recDe=function(p){return(rr.data||[]).filter(function(x){return x.date_debut===sd&&x.jour===j&&x.profil===p;}).map(function(x){return recettes[x.recette_id];}).filter(Boolean);};
        // moyens : un effectif par ligne de produit (yaourt, compote…) ; anciennes données : `moyens` pour tous
        const pm=String(tx.gouter||'').split('/'),t1=pm[0]||'',t2=pm.slice(1).join(' / ');
        const n1=ef.moyens_l1==null?(ef.moyens||0):ef.moyens_l1,n2=ef.moyens_l2==null?(ef.moyens||0):ef.moyens_l2;
        jours.push({sem:si,profil:'moyen',n:n1,texte:t1,recettes:[]});
        jours.push({sem:si,profil:'moyen',n:n2,texte:t2,recettes:[]});
        jours.push({sem:si,profil:'moyen',n:Math.max(n1,n2),texte:'',recettes:recDe('moyen')});
        jours.push({sem:si,profil:'grand',n:ef.grands||0,texte:tx.gouter_grand||'',recettes:recDe('grand')});
      }
    });
  }catch(err){console.error('[Goûters crèche] récapitulatif',err);showBanner('Lecture du récapitulatif impossible.','error');return;}
  const lignes=gcLignes(jours);
  const alSet={};jours.forEach(function(j){j.recettes.forEach(function(r){rcAllergenesRecette(r).forEach(function(k){alSet[k]=1;});});});
  let filtre='';
  const fmtSem=function(d){return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});};

  let ov=document.getElementById('modal-recap-wrap');if(ov)ov.remove();
  ov=document.createElement('div');ov.className='overlay';ov.id='modal-recap-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-recap-wrap');};
  document.body.appendChild(ov);
  function donnees(){
    return lignes.map(function(e){
      const p=function(pr){return filtre&&filtre!==pr?0:e.v[pr][0]+e.v[pr][1];};
      const s=function(i){return(filtre&&filtre!=='moyen'?0:e.v.moyen[i])+(filtre&&filtre!=='grand'?0:e.v.grand[i]);};
      return{e:e,m:p('moyen'),g:p('grand'),s1:s(0),s2:s(1),t:gcTotalLigne(e,filtre)};
    }).filter(function(d){return d.t>0;});
  }
  function rendre(){
    const d=donnees(),prod=d.filter(function(x){return!x.e.ing;}),ing=d.filter(function(x){return x.e.ing;});
    const row=function(x){return'<tr><td>'+escHtml(x.e.nom)+'</td><td>'+gcFmtLigne(x.e,x.m)+'</td><td>'+gcFmtLigne(x.e,x.g)+'</td><td>'+gcFmtLigne(x.e,x.s1)+'</td><td>'+gcFmtLigne(x.e,x.s2)+'</td><td><strong>'+gcFmtLigne(x.e,x.t)+'</strong></td></tr>';};
    const bloc=function(titre,l){return l.length?'<tr><td colspan="6" style="font-size:11px;font-weight:700;color:var(--koala);text-transform:uppercase;padding-top:10px">'+titre+'</td></tr>'+l.map(row).join(''):'';};
    ov.innerHTML='<div class="modal" style="max-width:640px;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">'
      +'<h3 style="margin:0"><i class="ti ti-receipt"></i> Récapitulatif de commande — 2 semaines</h3>'
      +'<button class="btn-cancel" onclick="closeModal(\'modal-recap-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
      +'<p style="font-size:12px;color:var(--muted);margin:0 0 8px">Semaines du '+fmtSem(semaine)+' et du '+fmtSem(sem2)+' · goûters moyens (6-18 mois) et grands, à commander en une fois.</p>'
      +'<div style="display:flex;gap:6px;margin-bottom:8px">'+[['','Tous'],['moyen','Moyens'],['grand','Grands']].map(function(f){
        return'<button class="'+(f[0]===filtre?'btn-primary':'btn-cancel')+'" data-f="'+f[0]+'" style="padding:4px 12px;font-size:12px">'+f[1]+'</button>';}).join('')+'</div>'
      +(d.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="font-size:11px;color:var(--muted);text-align:left"><th>Produit</th><th>Moyens</th><th>Grands</th><th>Sem. 1</th><th>Sem. 2</th><th>Total</th></tr></thead><tbody>'
        +bloc('Produits',prod)+bloc('Ingrédients des recettes',ing)+'</tbody></table></div>'
        :'<div class="empty-state"><i class="ti ti-shopping-cart-off"></i><p>Rien à commander : saisissez des goûters et les effectifs de ces deux semaines.</p></div>')
      +(Object.keys(alSet).length?'<div style="margin-top:10px;font-size:12px"><strong>Allergènes sur les 2 semaines :</strong> '+rcAllergenesHtml(Object.keys(alSet))+'</div>':'')
      +'<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">'
      +'<button class="btn-cancel" id="rcp-copy"><i class="ti ti-copy"></i> Copier</button>'
      +'<button class="btn-cancel" id="rcp-print"><i class="ti ti-printer"></i> Imprimer</button>'
      +'<button class="btn-cancel" id="rcp-csv"><i class="ti ti-download"></i> Excel (CSV)</button></div></div>';
    Array.prototype.forEach.call(ov.querySelectorAll('[data-f]'),function(b){b.onclick=function(){filtre=b.dataset.f;rendre();};});
    const tab=function(){return[['Produit','Moyens','Grands','Sem. 1','Sem. 2','Total']].concat(d.map(function(x){return[x.e.nom,gcFmtLigne(x.e,x.m),gcFmtLigne(x.e,x.g),gcFmtLigne(x.e,x.s1),gcFmtLigne(x.e,x.s2),gcFmtLigne(x.e,x.t)];}));};
    document.getElementById('rcp-copy').onclick=function(){
      const txt=tab().map(function(l){return l.join('\t');}).join('\n');
      (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){showBanner('Récapitulatif copié ✅');},function(){showBanner('Copie impossible.','error');});
    };
    document.getElementById('rcp-csv').onclick=function(){
      const csv='﻿'+tab().map(function(l){return l.map(function(c){return'"'+String(c).replace(/"/g,'""')+'"';}).join(';');}).join('\r\n');
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      a.download='commande-gouters-'+semaine+'.csv';document.body.appendChild(a);a.click();a.remove();
    };
    document.getElementById('rcp-print').onclick=function(){
      const w=window.open('','_blank');if(!w){showBanner('Autorisez les fenêtres pop-up pour imprimer.','error');return;}
      w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Commande goûters</title><style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:5px;text-align:left}</style></head><body><h2>Commande de goûters — semaines du '
        +fmtSem(semaine)+' et du '+fmtSem(sem2)+(filtre?' ('+(filtre==='moyen'?'moyens':'grands')+')':'')+'</h2><table>'
        +tab().map(function(l,i){return'<tr>'+l.map(function(c){return'<'+(i?'td':'th')+'>'+escHtml(c)+'</'+(i?'td':'th')+'>';}).join('')+'</tr>';}).join('')
        +'</table>'+(Object.keys(alSet).length?'<p><b>Allergènes :</b> '+Object.keys(alSet).map(rcLibelleAllergene).join(', ')+'</p>':'')
        +'<script>window.onload=function(){window.print();}<\/script><div style="text-align:center;font-size:9px;color:#999;margin-top:14px">Application créée par David Bucari</div></body></html>');
      w.document.close();
    };
  }
  rendre();
  ov.classList.add('open');
}
window.rcOuvrirBibliotheque=rcOuvrirBibliotheque;
window.gouterRecapOuvrir=gouterRecapOuvrir;
