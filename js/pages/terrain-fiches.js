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
/* Intitulé de la pièce : les parents nomment mal leurs fichiers, on affiche donc le type de pièce
   (recopié de PIECES_ADMIN, js/enfants/02-part.js : à garder en phase) au-dessus du nom du fichier. */
const FE_PIECES={livret_famille:'Copie du livret de famille',piece_identite_parents:"Pièce d'identité des parents",
  justificatif_domicile:'Justificatif de domicile',acte_naissance:"Acte de naissance de l'enfant",
  attestation_vitale:'Attestation de la carte vitale',caf_allocataire:'Attestation CAF (n° allocataire)',
  attestation_rc:'Attestation de responsabilité civile',autorite_parentale:"Justificatif de l'autorité parentale",
  avis_imposition:"Avis d'imposition",bulletin_salaire:'Bulletin de salaire / attestation Pôle Emploi',
  rib:"Relevé d'identité bancaire",droit_image:"Droit à l'image",sante_autre:'Document de santé'};
function feIntitule(r){
  const k=String(r.piece_key||'');
  if(FE_PIECES[k])return FE_PIECES[k];
  if(k.startsWith('espace_famille:'))return k.slice(15).trim()||'Dépôt de la famille';
  if(k.startsWith('papier_')||k.startsWith('enligne_'))return 'Document rempli par la famille';
  return r.intitule||'';
}
function feFichiers(lib,rows,aff){
  if(!rows||!rows.length)return '';
  return '<div class="nt-titre">'+lib+'</div>'+rows.map(r=>{
    const nomF=r.filename||r.path.split('/').pop(),int=feIntitule(r);
    return '<button type="button" class="fe-doc" data-b="'+esc(r.bucket)+'" data-p="'+esc(r.path)+'" data-n="'+esc(r.filename||'')+'"><i class="ti ti-file"></i> '
      +(int?'<b>'+esc(int)+'</b><small style="display:block;word-break:break-all">'+esc(nomF)+'</small>':esc(nomF))
      +'<small>'+FE_JOURS_VUS(r.created_at)+'</small></button>';
  }).join('');
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
    +feFichiers('Documents du dossier (pièces déposées, droit à l\'image, ordonnances…)',(f.documents||[]).filter(d=>d.piece_key!=='photo_enfant'));
}
let FE_BLOB=null;
let FE_DOC_ID=0;   // identifie l'ouverture en cours : un PDF dessiné après la fermeture de la fenêtre est abandonné
/* PDF : dessiné avec pdf.js (cdnjs, comme les supports pédagogiques). Les tablettes Android n'ont pas de lecteur PDF
   dans une <iframe> : Chrome y affiche une page avec un bouton « Ouvrir » qui ne fait rien pour une adresse blob:. */
const FE_PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let fePdfPret=null;
function feScript(src){
  return new Promise((ok,ko)=>{
    const sc=document.createElement('script');
    sc.src=src;sc.onload=ok;sc.onerror=()=>ko(new Error('lecteur PDF inaccessible'));
    document.head.appendChild(sc);
  });
}
function feChargerPdfJs(){
  if(window.pdfjsLib&&window.pdfjsWorker)return Promise.resolve();
  if(!fePdfPret)fePdfPret=feScript(FE_PDFJS+'pdf.min.js').then(()=>feScript(FE_PDFJS+'pdf.worker.min.js')).catch(e=>{fePdfPret=null;throw e;});
  return fePdfPret;
}
async function feRendrePdf(corps,blob,jeton){
  await feChargerPdfJs();
  const buf=new Uint8Array(await blob.arrayBuffer());
  const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
  if(jeton!==FE_DOC_ID){pdf.destroy();return;}
  const total=pdf.numPages,max=Math.min(total,40);
  corps.innerHTML='<div id="fePdfPages" style="max-height:70vh;overflow:auto;-webkit-overflow-scrolling:touch;background:#e9e7f2;border-radius:10px;padding:8px"></div>';
  const zone=corps.querySelector('#fePdfPages');
  for(let n=1;n<=max;n++){
    if(jeton!==FE_DOC_ID){pdf.destroy();return;}
    const page=await pdf.getPage(n);
    const largeur=Math.max(300,zone.clientWidth-16);
    const base=page.getViewport({scale:1});
    const vp=page.getViewport({scale:Math.min(2200,largeur*Math.min(window.devicePixelRatio||1,2))/base.width});
    const c=document.createElement('canvas');
    c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
    c.style.cssText='width:100%;height:auto;display:block;margin:0 auto 8px;background:#fff;border-radius:6px';
    zone.appendChild(c);
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
  }
  if(total>max)zone.insertAdjacentHTML('beforeend','<div class="msg">'+(total-max)+' page(s) non affichée(s) : utilisez « Télécharger ».</div>');
}
function feFermerDoc(){
  FE_DOC_ID++;
  document.getElementById('ovFicheDoc').classList.remove('on');
  document.getElementById('feDocCorps').innerHTML='';
  if(FE_BLOB){URL.revokeObjectURL(FE_BLOB);FE_BLOB=null;}
}
/* Le fichier est téléchargé puis affiché dans la page (pas d'onglet à ouvrir :
   les tablettes et l'application installée bloquent souvent les fenêtres ouvertes
   après un appel réseau). */
async function feOuvrirFichier(bucket,path,nom){
  const ov=document.getElementById('ovFicheDoc'),corps=document.getElementById('feDocCorps');
  const jeton=++FE_DOC_ID;
  ov.classList.add('on');
  corps.innerHTML='<div class="msg">Chargement du document…</div>';
  document.getElementById('feDocLien').style.display='none';
  const{data,error}=await sb.storage.from(bucket).download(path);
  if(error||!data){corps.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> Ouverture impossible'+(error&&error.message?' : '+esc(error.message):'')+'</div>';return;}
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(bucket,path,{entite_type:'enfant',entite_id:FE_FICHE&&FE_FICHE.enfant.id,libelle:'Fiche enfant (accès terrain)'});
  const ext=(path.split('.').pop()||'').toLowerCase();
  const types={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic'};
  const type=data.type&&data.type!=='application/octet-stream'?data.type:(types[ext]||'application/octet-stream');
  const blob=new Blob([data],{type:type});
  if(FE_BLOB)URL.revokeObjectURL(FE_BLOB);
  FE_BLOB=URL.createObjectURL(blob);
  const lien=document.getElementById('feDocLien');
  lien.href=FE_BLOB;lien.download=nom||path.split('/').pop();lien.style.display='';
  if(type.indexOf('image/')===0)corps.innerHTML='<img src="'+FE_BLOB+'" style="max-width:100%;border-radius:10px">';
  else if(type==='application/pdf'){
    corps.innerHTML='<div class="msg">Préparation du document…</div>';
    feRendrePdf(corps,blob,jeton).catch(function(e){
      console.warn('[fiches] PDF',e);
      if(jeton===FE_DOC_ID)corps.innerHTML='<div class="msg warn"><i class="ti ti-alert-triangle"></i> Le document ne peut pas s’afficher ici : utilisez « Télécharger ».</div>';
    });
  }
  else corps.innerHTML='<div class="msg">Ce type de fichier ne s’affiche pas ici : utilisez « Télécharger ».</div>';
}
document.getElementById('qFiches').onclick=feOuvrir;

document.getElementById('feContenu').addEventListener('click',function(ev){
  const b=ev.target.closest('.fe-doc');if(b)feOuvrirFichier(b.dataset.b,b.dataset.p,b.dataset.n);
});
