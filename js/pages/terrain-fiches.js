/* ================================================================
   ACCÈS TERRAIN — Fiches enfants (lecture seule)
   Liste des enfants de la crèche (kk_enfants_noms) puis fiche via
   kk_fiche_enfant_equipe (sql/fiche_enfant_equipe.sql) : identité, parents,
   santé (PAI, vaccinations) et documents. Fichiers ouverts par URL signée,
   ouverture journalisée (kkJournaliserAcces). Aucune modification possible.
   Chargé après terrain.js (utilise sb, PROF, esc, toast, normT).
   ================================================================ */
let FE_LISTE=[],FE_FICHE=null;
const FE_JOURS_VUS=function(d){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(d||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(d||'');};
function feAge(dob){
  if(!dob)return '';
  const n=new Date(),d=new Date(dob);let m=(n.getFullYear()-d.getFullYear())*12+n.getMonth()-d.getMonth();
  if(n.getDate()<d.getDate())m--;
  return m<24?m+' mois':Math.floor(m/12)+' ans'+(m%12?' '+(m%12)+' mois':'');
}
async function feOuvrir(){
  document.getElementById('ovFiches').classList.add('on');
  document.getElementById('feRech').value='';
  FE_FICHE=null;
  const box=document.getElementById('feContenu');
  box.innerHTML='<div class="msg">Chargement…</div>';
  const{data,error}=await sb.rpc('kk_enfants_noms');
  if(error){box.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> Chargement impossible.</div>';return;}
  FE_LISTE=(data||[]).filter(e=>!PROF.creche_id||e.creche_id===PROF.creche_id);
  feListe();
}
function feFermer(){document.getElementById('ovFiches').classList.remove('on');}
function feListe(){
  FE_FICHE=null;
  document.getElementById('feRechWrap').style.display='';
  const q=normT(document.getElementById('feRech').value);
  const l=FE_LISTE.filter(e=>!q||normT((e.prenom||'')+' '+(e.nom||'')).includes(q));
  document.getElementById('feContenu').innerHTML=l.length
    ?l.map(e=>'<button type="button" class="fe-ligne" onclick="feFiche(\''+esc(e.id)+'\')"><i class="ti ti-mood-kid"></i> '+esc(((e.prenom||'')+' '+(e.nom||'')).trim())+'<i class="ti ti-chevron-right" style="margin-left:auto"></i></button>').join('')
    :'<div class="msg">Aucun enfant.</div>';
}
async function feFiche(id){
  document.getElementById('feRechWrap').style.display='none';
  const box=document.getElementById('feContenu');
  box.innerHTML='<div class="msg">Chargement…</div>';
  const{data,error}=await sb.rpc('kk_fiche_enfant_equipe',{p_enfant:id});
  if(error||!data){box.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> Fiche indisponible'+(error&&/function/i.test(error.message||'')?' (mise à jour de la base à appliquer).':'.')+'</div><button class="btn btn-g" onclick="feListe()">← Liste</button>';return;}
  FE_FICHE=data;feRender();
}
function feLigne(lab,val){return val?'<div class="fe-row"><span>'+lab+'</span><b>'+val+'</b></div>':'';}
function feFichiers(lib,rows,aff){
  if(!rows||!rows.length)return '';
  return '<div class="nt-titre">'+lib+'</div>'+rows.map(r=>'<button type="button" class="fe-doc" onclick="feOuvrirFichier(\''+esc(r.bucket)+'\',\''+esc(r.path).replace(/\\/g,'\\\\')+'\')"><i class="ti ti-file"></i> '+esc(r.filename||r.path.split('/').pop())+'<small>'+FE_JOURS_VUS(r.created_at)+'</small></button>').join('');
}
function feRender(){
  const f=FE_FICHE,e=f.enfant,box=document.getElementById('feContenu');
  const repas=[e.regime_repas,e.repas_base].filter(Boolean).join(' · ');
  const gouter=e.gouter_base||'';
  const paiAct=(f.pai||[]).filter(p=>p.actif);
  const parents=(f.parents||[]).map(p=>'<div class="nt-hist"><b>'+esc(((p.prenom||'')+' '+(p.nom||'')).trim()||'Parent')+'</b>'+(p.lien||p.relation?' <small style="display:inline">('+esc(p.lien||p.relation)+')</small>':'')
    +(p.telephone?'<small>📞 <a href="tel:'+esc(p.telephone)+'">'+esc(p.telephone)+'</a></small>':'')+(p.email?'<small>'+esc(p.email)+'</small>':'')+'</div>').join('');
  const vacs=(f.vaccinations||[]);
  const vacTxt=vacs.length?vacs.length+' dose'+(vacs.length>1?'s':'')+' enregistrée'+(vacs.length>1?'s':''):'';
  /* pièces jointes des PAI du registre (bucket sante) */
  const paiPj=(f.pai||[]).filter(p=>p.piece_jointe).map(p=>({bucket:'sante',path:p.piece_jointe,filename:'PAI'+(p.motif?' — '+p.motif:''),created_at:p.created_at}));
  box.innerHTML='<button class="btn btn-g" onclick="feListe()" style="margin-bottom:10px"><i class="ti ti-arrow-left"></i> Liste</button>'
    +'<div class="nt-resume ok" style="background:#F1EFF7;color:var(--violet)">'+esc(((e.prenom||'')+' '+(e.nom||'')).trim())+'</div>'
    +'<div class="msg" style="font-size:12px"><i class="ti ti-eye"></i> Lecture seule — données confidentielles, ne pas diffuser.</div>'
    +feLigne('Naissance',e.dob?esc(FE_JOURS_VUS(e.dob))+' ('+feAge(e.dob)+')':'')
    +feLigne('Date de sortie',e.date_sortie?esc(FE_JOURS_VUS(e.date_sortie)):'')
    +feLigne('Allergies',esc(e.allergies||''))
    +feLigne('Repas',esc(repas))+feLigne('Goûter',esc(gouter))
    +feLigne('Protection',e.taille_couche?esc((e.type_couche==='culotte'?'Couche-culotte':'Couche')+' taille '+e.taille_couche):'')
    +feLigne('PAI en cours',paiAct.length?esc(paiAct.map(p=>p.motif||'PAI').join(', '))+(paiAct.some(p=>p.panier_repas)?' · panier repas':''):'')
    +feLigne('Vaccinations',esc(vacTxt))
    +(parents?'<div class="nt-titre">Parents</div>'+parents:'')
    +feFichiers('PAI et projets d\'accueil',(f.pai_pieces||[]).concat(paiPj))
    +feFichiers('Carnet de santé et vaccins',f.carnet)
    +feFichiers('Autres documents (droit à l\'image, ordonnances…)',(f.documents||[]).filter(d=>d.piece_key!=='photo_enfant'));
}
async function feOuvrirFichier(bucket,path){
  /* fenêtre ouverte tout de suite (anti-bloqueur de popups), adresse renseignée après */
  const w=window.open('','_blank');
  const{data,error}=await sb.storage.from(bucket).createSignedUrl(path,300);
  if(error||!data){if(w)w.close();toast('Ouverture impossible.',true);return;}
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(bucket,path,{entite_type:'enfant',entite_id:FE_FICHE&&FE_FICHE.enfant.id,libelle:'Fiche enfant (accès terrain)'});
  if(w)w.location.href=data.signedUrl;else location.href=data.signedUrl;
}
document.getElementById('qFiches').onclick=feOuvrir;
