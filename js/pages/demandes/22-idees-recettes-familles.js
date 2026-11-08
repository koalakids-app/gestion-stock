/* ══════════════════════════════════════════════════════════════════════════
   IDÉES DE RECETTES POUR LES PARENTS (MCM › Menus › « Idées recettes »)

   Reprend la bibliothèque de recettes commune (tables `recettes` / `recettes_ingredients`,
   voir 14-recettes-gouters.js) : le référent coche une ou plusieurs recettes, choisit le
   nombre de portions (quantités recalculées pour une famille), puis :
     • Imprime / enregistre en PDF une fiche A4 « Idée recette » à remettre aux parents ;
     • Copie le texte (à coller dans un e-mail ou une messagerie) ;
     • Publie l'idée dans l'Espace famille (table `famille_messages`, comme « Information aux
       familles », avec notification push) — toutes les familles de la crèche.
   Aucune table ni SQL nouveau. Les allergènes de chaque recette sont toujours mentionnés.
   ═════════════════════════════════════════════════════════════════════════ */

/* Recette mise à l'échelle de `portions` portions : [{nom, qte}] (qte déjà formatée). */
function irfIngredients(r,portions){
  const f=portions/(r.nb||10);
  return r.ings.map(function(i){const b=rcUniteBase(i.q*f,i.u);return{nom:i.nom,qte:b.q?rcFmtQte(b.q,b.u):''};});
}
function irfAllergenes(r){return rcAllergenesRecette(r).map(rcLibelleAllergene);}

/* Plats du menu MCM (table `menus_semaine`) : lien de recherche de recette sur Marmiton. Aucun contenu
   n'est recopié depuis internet : le parent suit le lien vers la recette de son choix. */
function irfLienRecette(plat){return'https://www.marmiton.org/recettes/recherche.aspx?aqt='+encodeURIComponent(String(plat||'')+' enfant');}
/* Plats d'une semaine : liste dédoublonnée des plats « grands » (sans entrées ni laitages évidents ignorés : le référent coche). */
function irfPlatsSemaine(lignes){
  const vus={},out=[];
  (lignes||[]).forEach(function(m){(m.grand||[]).concat(m.bb18||[]).forEach(function(t){
    const nom=String(t||'').trim(),k=rcNorm(nom);
    if(nom&&!vus[k]){vus[k]=1;out.push(nom);}
  });});
  return out;
}

/* Texte brut (Espace famille, copier-coller). */
function irfTexte(recettes,portions,intro,plats){
  const bloc=recettes.map(function(r){
    const al=irfAllergenes(r);
    return'🍽️ '+r.nom+' (pour '+portions+' portion'+(portions>1?'s':'')+')\n\n'
      +'Ingrédients :\n'+irfIngredients(r,portions).map(function(i){return'• '+i.nom+(i.qte?' : '+i.qte:'');}).join('\n')
      +(r.etapes?'\n\nPréparation :\n'+r.etapes:'')
      +'\n\nAllergènes : '+(al.length?al.join(', '):'aucun déclaré');
  }).join('\n\n────────────\n\n');
  const pl=(plats||[]).length
    ?(recettes.length?'\n\n────────────\n\n':'')+'🔎 Les plats de la semaine à refaire à la maison (recettes à retrouver en ligne) :\n'
      +plats.map(function(n){return'• '+n+'\n   '+irfLienRecette(n);}).join('\n')
    :'';
  return(intro?intro.trim()+'\n\n':'')+bloc+pl;
}

/* Fiche A4 imprimable. Tout ce qui est saisi est échappé. */
function irfFicheHtml(recettes,portions,intro,creche,plats){
  const base=location.origin+location.pathname.replace(/[^/]*$/,'');
  const e=escHtml;
  const bloc=recettes.map(function(r){
    const al=irfAllergenes(r);
    return'<section><h2>'+e(r.nom)+'</h2><div class="p">Pour '+portions+' portion'+(portions>1?'s':'')+'</div>'
      +'<h3>Ingrédients</h3><ul>'+irfIngredients(r,portions).map(function(i){return'<li>'+e(i.nom)+(i.qte?' <b>'+e(i.qte)+'</b>':'')+'</li>';}).join('')+'</ul>'
      +(r.etapes?'<h3>Préparation</h3><div class="et">'+e(r.etapes)+'</div>':'')
      +'<div class="al"><b>Allergènes :</b> '+(al.length?e(al.join(', ')):'aucun déclaré')+'</div></section>';
  }).join('');
  return'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Idées recettes</title>'
    +'<style>@page{size:A4;margin:14mm}*{box-sizing:border-box}'
    +'body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#2B2740;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.hd{background:#4A3F9F;color:#fff;padding:12px 16px;border-radius:10px;display:flex;align-items:center;gap:14px}'
    +'.hd img{height:42px;background:#fff;border-radius:8px;padding:4px 10px}.hd h1{margin:0;font-size:22px}.hd small{opacity:.85}'
    +'.intro{margin:12px 0;font-size:14px;white-space:pre-wrap}'
    +'section{border:2px solid #F47920;border-radius:12px;padding:12px 16px;margin:12px 0;break-inside:avoid}'
    +'h2{margin:0;color:#4A3F9F;font-size:19px}.p{font-size:12px;color:#777;margin-bottom:4px}h3{font-size:13px;margin:10px 0 3px;color:#F47920;text-transform:uppercase}'
    +'ul{margin:0;padding-left:20px;font-size:14px}.et{font-size:14px;white-space:pre-wrap}'
    +'.al{margin-top:10px;font-size:12px;background:#FDE8D6;color:#A8480B;border-radius:8px;padding:5px 10px}'
    +'.pied{text-align:center;font-size:9px;color:#999;margin-top:14px}</style></head><body>'
    +'<div class="hd"><img src="'+base+'logo-koalakids.png" alt="Koala Kids"><div><h1>Idées recettes pour les petits</h1>'+(creche?'<small>'+e(creche)+'</small>':'')+'</div></div>'
    +(intro?'<div class="intro">'+e(intro)+'</div>':'')+bloc
    +((plats||[]).length?'<section><h2>Les plats de la semaine, à refaire à la maison</h2><div class="p">Recettes à retrouver en ligne</div><ul>'
      +plats.map(function(n){return'<li>'+e(n)+' — <a href="'+e(irfLienRecette(n))+'">chercher une recette</a></li>';}).join('')+'</ul></section>':'')
    +'<div class="pied">Application créée par David Bucari</div></body></html>';
}

async function irfOuvrir(){
  const recettes=await rcCharger(true);
  let semaines={};
  try{
    const lundi=menusMondayOf(ipDateToLocalISO(new Date()));
    const{data}=await sb.from('menus_semaine').select('date_debut,jour,bb18,grand').gte('date_debut',lundi).order('date_debut').order('jour').limit(15);
    (data||[]).forEach(function(m){(semaines[m.date_debut]=semaines[m.date_debut]||[]).push(m);});
  }catch(err){console.warn('[Idées recettes] menus',err);}
  const dates=Object.keys(semaines).slice(0,2);
  const liste=Object.keys(recettes).map(function(k){return recettes[k];}).sort(function(a,b){return a.nom.localeCompare(b.nom,'fr');});
  let ov=document.getElementById('modal-idees-recettes-wrap');if(ov)ov.remove();
  ov=document.createElement('div');ov.className='overlay';ov.id='modal-idees-recettes-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-idees-recettes-wrap');};
  const crOpts=isDirection
    ?cacheCreches.map(function(c){return'<option value="'+c.id+'"'+(c.id===activeCrecheId?' selected':'')+'>'+escHtml(c.name||'')+'</option>';}).join('')
    :(function(){const c=cacheCreches.find(function(x){return x.id===currentProfile?.creche_id;});return'<option value="'+(currentProfile?.creche_id||'')+'">'+escHtml(c?c.name:'Ma crèche')+'</option>';})();
  ov.innerHTML='<div class="modal" style="max-width:600px;width:100%">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem"><h3 style="margin:0"><i class="ti ti-chef-hat"></i> Idées recettes pour les parents</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-idees-recettes-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<p style="font-size:12px;color:var(--muted);margin:0 0 8px">Choisissez une ou plusieurs recettes de la bibliothèque (Goûters de la crèche › Recettes), puis transmettez-les aux familles, comme le plat du jour.</p>'
    +(liste.length
      ?'<div style="max-height:200px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:6px 10px;margin-bottom:8px">'
        +liste.map(function(r){return'<label style="display:flex;gap:8px;align-items:center;padding:3px 0;cursor:pointer"><input type="checkbox" class="irf-r" value="'+escHtml(r.id)+'"/> <span><strong>'+escHtml(r.nom)+'</strong> '+rcAllergenesHtml(rcAllergenesRecette(r))+'</span></label>';}).join('')+'</div>'
      :'<div class="empty-state"><i class="ti ti-book"></i><p>Aucune recette dans la bibliothèque : créez-en depuis « Goûters de la crèche ».</p></div>')
    +(dates.length?'<div class="fg"><label class="flabel">Plats proposés par le traiteur (MCM) — à proposer aux parents avec un lien de recherche de recette</label>'
      +'<select class="finput" id="irf-sem" style="margin-bottom:6px">'+dates.map(function(d){return'<option value="'+d+'">Semaine du '+new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+'</option>';}).join('')+'</select>'
      +'<div id="irf-plats" style="max-height:150px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:6px 10px"></div></div>':'')
    +'<div style="display:flex;gap:10px;flex-wrap:wrap">'
    +'<div class="fg" style="flex:0 0 120px"><label class="flabel">Portions</label><input class="finput" type="number" id="irf-portions" min="1" max="20" value="2"/></div>'
    +'<div class="fg" style="flex:1;min-width:180px"><label class="flabel">Crèche</label><select class="finput" id="irf-creche"'+(isDirection?'':' disabled')+'>'+crOpts+'</select></div></div>'
    +'<div class="fg"><label class="flabel">Petit mot pour les parents (facultatif)</label><textarea class="finput" id="irf-intro" rows="2" maxlength="300" placeholder="Ex. Une idée facile à refaire à la maison ce week-end !"></textarea></div>'
    +'<div class="fg"><label class="flabel">Aperçu du message</label><textarea class="finput" id="irf-apercu" rows="9" readonly style="font-size:12px"></textarea></div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px">'
    +'<button class="btn-cancel" id="irf-copy"><i class="ti ti-copy"></i> Copier</button>'
    +'<button class="btn-cancel" id="irf-print"><i class="ti ti-printer"></i> Imprimer / PDF</button>'
    +'<button class="btn-primary" id="irf-pub"><i class="ti ti-send"></i> Publier aux familles</button></div></div>';
  document.body.appendChild(ov);
  const q=function(id){return document.getElementById(id);};
  function choix(){return Array.prototype.filter.call(ov.querySelectorAll('.irf-r:checked'),function(c){return recettes[c.value];}).map(function(c){return recettes[c.value];});}
  function portions(){return Math.max(1,Math.min(20,parseInt(q('irf-portions').value,10)||2));}
  function plats(){return Array.prototype.map.call(ov.querySelectorAll('.irf-p:checked'),function(c){return c.value;});}
  function rendrePlats(){
    const z=q('irf-plats'),sel=q('irf-sem');if(!z||!sel)return;
    const ps=irfPlatsSemaine(semaines[sel.value]);
    z.innerHTML=ps.length?ps.map(function(n){return'<label style="display:flex;gap:8px;align-items:center;padding:2px 0;cursor:pointer"><input type="checkbox" class="irf-p" value="'+escHtml(n)+'"/> '+escHtml(n)+'</label>';}).join(''):'<span style="font-size:12px;color:var(--muted)">Aucun plat cette semaine.</span>';
  }
  function maj(){const c=choix(),p=plats();q('irf-apercu').value=(c.length||p.length)?irfTexte(c,portions(),q('irf-intro').value,p):'Cochez au moins une recette ou un plat.';}
  function nomCreche(){const c=cacheCreches.find(function(x){return x.id===q('irf-creche').value;});return c?c.name:'';}
  ov.addEventListener('input',maj);ov.addEventListener('change',function(ev){if(ev.target.id==='irf-sem')rendrePlats();maj();});
  rendrePlats();
  q('irf-copy').onclick=function(){
    const c=choix(),p=plats();if(!c.length&&!p.length){showBanner('Cochez au moins une recette ou un plat.','error');return;}
    (navigator.clipboard?navigator.clipboard.writeText(irfTexte(c,portions(),q('irf-intro').value,p)):Promise.reject()).then(function(){showBanner('Texte copié ✅');},function(){showBanner('Copie impossible.','error');});
  };
  q('irf-print').onclick=function(){
    const c=choix(),p=plats();if(!c.length&&!p.length){showBanner('Cochez au moins une recette ou un plat.','error');return;}
    const w=window.open('','_blank');if(!w){showBanner('Autorisez les fenêtres pop-up pour imprimer.','error');return;}
    w.document.write(irfFicheHtml(c,portions(),q('irf-intro').value,nomCreche(),p).replace('</body>','<script>window.onload=function(){window.print();}<\/script></body>'));
    w.document.close();
  };
  let enCours=false;
  q('irf-pub').onclick=async function(){
    if(enCours)return;
    const c=choix(),p=plats(),creche=q('irf-creche').value;
    if(!c.length&&!p.length){showBanner('Cochez au moins une recette ou un plat.','error');return;}
    if(!creche){showBanner('Choisissez une crèche.','error');return;}
    if(!currentProfile?.id){showBanner('Profil introuvable, reconnectez-vous.','error');return;}
    if(!confirm('Publier cette idée recette dans l’Espace famille de '+(nomCreche()||'la crèche')+' ?'))return;
    enCours=true;q('irf-pub').disabled=true;
    try{
      const titre='Idée recette : '+c.concat(c.length?[]:p.map(function(n){return{nom:n};})).map(function(r){return r.nom;}).join(', ');
      const saved=await dbInsert('famille_messages',{creche_id:creche,enfant_id:null,auteur_id:currentProfile.id,auteur_nom:currentProfile.name||'',titre:titre.slice(0,150),corps:irfTexte(c,portions(),q('irf-intro').value,p)});
      if(!saved){showBanner('Erreur'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');return;}
      const nb=await mfPrevenir(creche,null,titre.slice(0,150));
      showBanner('Idée recette publiée dans l’Espace famille !'+(nb>0?' '+nb+' notification'+(nb>1?'s':'')+' envoyée'+(nb>1?'s':'')+'.':''));
      closeModal('modal-idees-recettes-wrap');
    }finally{enCours=false;const b=q('irf-pub');if(b)b.disabled=false;}
  };
  maj();
  ov.classList.add('open');
}
window.irfOuvrir=irfOuvrir;
