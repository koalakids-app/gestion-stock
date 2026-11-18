/* Organigramme — Demandes › Équipe › « Organigramme » (préfixe og).
   Organigramme composé à la main, un par crèche : cartes (`organigramme_cartes`, sql/organigramme.sql, à appliquer
   à la main) reliées en arbre par `parent_id`. Chaque carte : nom, fonction, diplôme, temps de travail (heures/semaine),
   ETP (calculé heures / 35, ou saisi), note libre (expérience, alternance…) et badge RSAI. Une carte peut être liée à une
   fiche (collaborateur·trice ou référent·e) pour pré-remplir, sinon saisie libre (gestionnaire, alternant·e…).
   Cartes sans crèche = niveau « réseau » (gestionnaires…) affiché au-dessus. Écriture : direction et référent·e·s de la
   crèche (réseau : direction seule). Impression / PDF par la fenêtre d'impression. */
let ogCartes=[],ogErreur='';
const ogEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const OG_HEURES_ETP=35;

function ogCrecheCourante(){
  if(!isDirection)return currentProfile?.creche_id||'';
  return document.getElementById('og-creche')?.value||'';
}
function ogPeutEditer(c){
  if(isDirection)return true;
  return !!c&&currentProfile?.role==='referent'&&currentProfile.creche_id===c.creche_id;
}
function ogStyle(){
  if(document.getElementById('og-style'))return;
  const st=document.createElement('style');st.id='og-style';st.textContent=OG_CSS;document.head.appendChild(st);
}
async function ogInit(){
  ogStyle();
  const sel=document.getElementById('og-creche');
  if(sel){
    const v=sel.value;
    sel.innerHTML=cacheCreches.map(c=>`<option value="${c.id}">${ogEsc(c.name)}</option>`).join('');
    sel.value=(v&&cacheCreches.some(c=>c.id===v))?v:(currentProfile?.creche_id||cacheCreches[0]?.id||'');
  }
  await ogCharger();
}
async function ogCharger(){
  ogErreur='';
  try{
    const{data,error}=await sb.from('organigramme_cartes').select('*').order('ordre',{ascending:true}).order('created_at',{ascending:true});
    if(error)throw error;
    ogCartes=data||[];
  }catch(err){
    ogCartes=[];
    ogErreur=/organigramme_cartes/.test(String(err?.message||err))
      ?'La table de l’organigramme n’existe pas encore : appliquer sql/organigramme.sql sur Supabase.'
      :'Chargement impossible : '+(err?.message||err);
  }
  ogRender();
}

// ---------- temps de travail et ETP ----------
// « 35 », « 8,75 », « 8h45 », « 8H45 » → nombre d'heures ; vide → null.
function ogParseHeures(t){
  const s=String(t==null?'':t).trim().toLowerCase().replace(',','.');
  if(!s)return null;
  const m=s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d{1,2})?$/);
  if(m)return Math.round((parseFloat(m[1])+(m[2]?parseInt(m[2],10)/60:0))*100)/100;
  const n=parseFloat(s);
  return isFinite(n)?n:NaN;
}
function ogFmtHeures(v){
  if(v==null||v==='')return'';
  const h=Math.floor(Number(v)),m=Math.round((Number(v)-h)*60);
  return h+'H'+(m?String(m).padStart(2,'0'):'')+'/SEM';
}
function ogEtpDe(c){
  if(c.etp!=null&&c.etp!=='')return Number(c.etp);
  if(c.heures_hebdo!=null&&c.heures_hebdo!=='')return Number(c.heures_hebdo)/OG_HEURES_ETP;
  return null;
}
const ogNbFr=v=>(Math.round(v*100)/100).toLocaleString('fr-FR');
// Tableau de synthèse des ETP de la crèche (écran et PDF) : direction, entretien / repas, encadrement des enfants.
function ogSynthese(tot,dir,ent,enf,alt){
  if(!(tot>0))return'';
  const h=v=>ogFmtHeures(Math.round(v*OG_HEURES_ETP*100)/100).replace('/SEM','');
  const l=(lib,v,cls)=>'<tr'+(cls?' class="'+cls+'"':'')+'><td>'+lib+'</td><td>'+ogNbFr(v)+' ETP</td><td>'+h(v)+' / sem</td></tr>';
  return '<table class="og-synth"><caption>Synthèse des ETP</caption><thead><tr><th></th><th>ETP</th><th>Heures</th></tr></thead><tbody>'
    +(dir>0?l('ETP direction',dir):'')+(ent>0?l('ETP entretien / repas',ent):'')+l('ETP encadrement enfants',enf)+(alt>0?l('Alternant·e (hors taux d’encadrement)',alt):'')+l('Total',tot,'og-tot')+'</tbody></table>';
}
// Répartition de l'ETP d'une carte : direction, entretien / repas, encadrement des enfants (= le reste).
// Alternant·e / apprenti·e : hors taux d'encadrement (même règle que l'export PMI, `pmiEstAlternant`).
const ogEstAlternant=c=>/alternan|apprenti/i.test(ogNorm([c.poste,c.diplome,c.note].filter(Boolean).join(' ')));
function ogParts(c){
  const tot=ogEtpDe(c)||0,dir=Number(c.etp_direction)||0,ent=Number(c.etp_entretien)||0,reste=Math.max(0,tot-dir-ent);
  return ogEstAlternant(c)?{tot,dir,ent,enf:0,alt:reste}:{tot,dir,ent,enf:reste,alt:0};
}
function ogRepartition(c){
  const{tot,dir,ent,enf,alt}=ogParts(c);
  if(!(dir>0||ent>0||alt>0)||!(tot>0))return'';
  const l=(lib,v)=>'<div class="og-part"><span>'+lib+'</span><span>'+ogFmtEtp(v)+'</span></div>';
  return '<div class="og-parts">'+(dir>0?l('Direction',dir):'')+(ent>0?l('Entretien / repas',ent):'')+(alt>0?l('Alternant·e : hors taux d’encadrement',alt):l('Encadrement enfants',enf))+'</div>';
}
const ogFmtEtp=v=>v==null?'':(Math.round(v*100)/100).toLocaleString('fr-FR')+' ETP';

// ---------- dessin ----------
// Arrêts et remplacements : `ogAbsentes` (ids des personnes en arrêt ou remplacées) est recalculé par ogArbre().
const OG_MOTIFS={arret:'EN ARRÊT',mutation:'MUTÉ·E',conge:'EN CONGÉ'};
let ogAbsentes=new Set();
const ogAbsente=c=>!!c&&(!!c.en_arret||ogAbsentes.has(c.id));
function ogCarte(c){
  const etp=ogEtpDe(c),h=ogFmtHeures(c.heures_hebdo);
  const peut=ogPeutEditer(c);
  const abs=ogAbsente(c),cible=c.remplace_id?ogCartes.find(x=>x.id===c.remplace_id):null;
  const badges=(c.rsai?'<span class="og-badge">RSAI</span>':'')+(abs?'<span class="og-badge og-b-'+(OG_MOTIFS[c.absence_motif]?c.absence_motif:'arret')+'">'+OG_MOTIFS[OG_MOTIFS[c.absence_motif]?c.absence_motif:'arret']+'</span>':'')
    +(cible?'<span class="og-badge og-b-remp">Remplace '+ogEsc(cible.nom)+'</span>':'');
  return '<div class="og-node'+(c.rsai?' og-rsai':'')+(abs?' og-absente':'')+(peut?' og-edit':'')+'"'+(peut?' onclick="ogEditer(\''+c.id+'\')" title="Modifier"':'')+'>'
    +(badges?'<span class="og-badges">'+badges+'</span>':'')
    +'<div class="og-nom">'+ogEsc(c.nom)+'</div>'
    +(c.poste?'<div class="og-poste">'+ogEsc(c.poste)+'</div>':'')
    +(c.diplome?'<div class="og-dip">Dip : '+ogEsc(c.diplome)+'</div>':'')
    +(c.note?'<div class="og-note">'+ogEsc(c.note).replace(/\n/g,'<br>')+'</div>':'')
    +((h||etp!=null)?'<div class="og-temps">'+[h,ogFmtEtp(etp)].filter(Boolean).join(' · ')+'</div>':'')
    +ogRepartition(c)
    +'</div>';
}
// Une remplaçante s'affiche dans le même bloc que la personne remplacée (même poste, mêmes liens).
function ogBranche(c,enfants,remps){
  const fils=enfants[c.id]||[],rem=remps[c.id]||[];
  const tete=rem.length?'<div class="og-remp">'+ogCarte(c)+rem.map(ogCarte).join('')+'</div>':ogCarte(c);
  return '<li>'+tete+(fils.length?'<ul>'+fils.map(f=>ogBranche(f,enfants,remps)).join('')+'</ul>':'')+'</li>';
}
function ogArbre(crecheId){
  const reseau=ogCartes.filter(c=>!c.creche_id);
  const cartes=ogCartes.filter(c=>c.creche_id===crecheId);
  const par={};cartes.forEach(c=>{par[c.id]=c;});
  // cible effective d'un remplacement (suit les remplacements en chaîne, sans boucle)
  const poste=c=>{let x=c,n=0;while(x&&x.remplace_id&&par[x.remplace_id]&&x.remplace_id!==x.id&&n++<10)x=par[x.remplace_id];return x;};
  const remps={},estRemp=new Set();ogAbsentes=new Set();
  cartes.forEach(c=>{
    if(!c.remplace_id||!par[c.remplace_id]||c.remplace_id===c.id)return;
    const t=poste(c);if(!t||t.id===c.id)return;
    (remps[t.id]=remps[t.id]||[]).push(c);estRemp.add(c.id);ogAbsentes.add(c.remplace_id);
  });
  const enfants={};
  cartes.forEach(c=>{
    if(estRemp.has(c.id)||!c.parent_id||!par[c.parent_id])return;
    const k=poste(par[c.parent_id]).id;(enfants[k]=enfants[k]||[]).push(c);
  });
  const racines=cartes.filter(c=>!estRemp.has(c.id)&&(!c.parent_id||!par[c.parent_id]));
  const racinesHtml=racines.map(r=>ogBranche(r,enfants,remps)).join('');
  if(reseau.length){
    return '<ul class="og-t"><li><div class="og-groupe">'+reseau.map(ogCarte).join('')+'</div>'
      +(racines.length?'<ul>'+racinesHtml+'</ul>':'')+'</li></ul>';
  }
  return racines.length?'<ul class="og-t">'+racinesHtml+'</ul>':'';
}
// Réduit l'organigramme (zoom) quand il est plus large que la page, au lieu d'un défilement horizontal.
function ogAjuster(){
  const arbre=document.querySelector('#og-contenu .og-arbre');if(!arbre)return;
  arbre.style.zoom='';arbre.style.width='max-content';
  const need=arbre.getBoundingClientRect().width;
  arbre.style.width='';
  arbre.dataset.largeur=String(Math.round(need));
  const dispo=(arbre.parentElement?.clientWidth||0)-36;
  if(need>0&&dispo>0&&need>dispo)arbre.style.zoom=String(Math.max(0.4,dispo/need));
}
let ogResizeT=null;
if(typeof window!=='undefined')window.addEventListener('resize',()=>{clearTimeout(ogResizeT);ogResizeT=setTimeout(ogAjuster,150);});
function ogRender(){
  const zone=document.getElementById('og-contenu');if(!zone)return;
  const barre=document.getElementById('og-actions');
  const crecheId=ogCrecheCourante();
  const creche=cacheCreches.find(c=>c.id===crecheId);
  const peutCreche=ogPeutEditer({creche_id:crecheId});
  if(barre)barre.style.display=peutCreche?'':'none';
  if(ogErreur){zone.innerHTML='<div class="empty-state"><i class="ti ti-alert-triangle"></i><p>'+ogEsc(ogErreur)+'</p></div>';return;}
  if(!creche){zone.innerHTML='<div class="empty-state"><i class="ti ti-sitemap"></i><p>Choisissez une crèche.</p></div>';return;}
  const cartes=ogCartes.filter(c=>c.creche_id===crecheId);
  const arbre=ogArbre(crecheId);
  if(!cartes.length&&!ogCartes.some(c=>!c.creche_id)){
    zone.innerHTML='<div class="empty-state"><i class="ti ti-sitemap"></i><p>Aucun organigramme pour cette crèche.</p>'
      +(peutCreche?'<p style="font-size:12.5px">Cliquez sur <strong>Ajouter une personne</strong>, ou sur <strong>Pré-remplir depuis les fiches</strong> pour partir de l’équipe existante.</p>':'')+'</div>';
    return;
  }
  const maj=ogCartes.filter(c=>c.creche_id===crecheId||!c.creche_id).map(c=>c.maj_le||c.created_at).sort().pop();
  const majTxt=maj?new Date(maj).toLocaleDateString('fr-FR'):'';
  const actives=cartes.filter(c=>!ogAbsente(c)),nbArret=cartes.length-actives.length;
  const heures=actives.reduce((s,c)=>s+(Number(c.heures_hebdo)||0),0);
  const etp=actives.reduce((s,c)=>s+(ogEtpDe(c)||0),0);
  const etpDir=actives.reduce((a,c)=>a+(Number(c.etp_direction)||0),0),etpEnt=actives.reduce((a,c)=>a+(Number(c.etp_entretien)||0),0);
  const etpEnf=actives.reduce((a,c)=>a+ogParts(c).enf,0),etpAlt=actives.reduce((a,c)=>a+ogParts(c).alt,0);
  const rsai=cartes.concat(ogCartes.filter(c=>!c.creche_id)).filter(c=>c.rsai).map(c=>c.nom);
  zone.innerHTML='<div class="og-page"><div class="og-entete"><img src="logo-koalakids.png" alt="" class="og-logo"><div><div class="og-titre">'+ogEsc(creche.name)+'</div>'
    +'<div class="og-sous">Organigramme'+(majTxt?' (maj : '+majTxt+')':'')+'</div></div></div>'
    +'<div class="og-arbre">'+arbre+'</div>'
    +'<div class="og-pied"><span><strong>'+actives.length+'</strong> personne'+(actives.length>1?'s':'')+(nbArret?' (+ '+nbArret+' absent'+(nbArret>1?'·e·s':'·e')+')':'')+'</span>'
    +'<span>Total : <strong>'+(Math.round(heures*100)/100).toLocaleString('fr-FR')+' h/sem</strong> · <strong>'+(Math.round(etp*100)/100).toLocaleString('fr-FR')+' ETP</strong></span>'
    +'<span>RSAI : <strong>'+(rsai.length?ogEsc(rsai.join(', ')):'à désigner')+'</strong></span></div>'
    +ogSynthese(etp,etpDir,etpEnt,etpEnf,etpAlt)+'</div>';
  ogAjuster();
}

// ---------- édition d'une carte ----------
function ogFermer(){document.getElementById('og-modal')?.remove();}
function ogDescendants(id){
  const r=new Set([id]);let ajout=true;
  while(ajout){ajout=false;ogCartes.forEach(c=>{if(c.parent_id&&r.has(c.parent_id)&&!r.has(c.id)){r.add(c.id);ajout=true;}});}
  return r;
}
// ---------- liste « Remplace » : cartes de la crèche + personnes de la crèche qui n'ont pas encore de carte ----------
const ogNorm=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function ogSansCarte(crecheId,c){
  const cartes=ogCartes.filter(x=>x.creche_id===(crecheId||null));
  const idsE=new Set(cartes.map(x=>x.employe_id).filter(Boolean)),idsR=new Set(cartes.map(x=>x.referent_id).filter(Boolean));
  const noms=new Set(cartes.map(x=>ogNorm(x.nom)));
  if(c){if(c.employe_id)idsE.add(c.employe_id);if(c.referent_id)idsR.add(c.referent_id);noms.add(ogNorm(c.nom));}
  const refs=cacheReferents.filter(r=>r.role==='referent'&&r.creche_id===crecheId&&!idsR.has(r.id)&&!noms.has(ogNorm(r.name)));
  const dejaVuE=new Set(refs.map(r=>r.employe_id).filter(Boolean));
  const emps=cacheEmployes.filter(e=>!e.archive_le&&e.creche_id===crecheId&&!idsE.has(e.id)&&!dejaVuE.has(e.id)
    &&!noms.has(ogNorm(((e.prenom||'')+' '+(e.nom||'')).trim())));
  return{refs,emps};
}
function ogRemplaceChange(){
  const l=document.getElementById('og-f-remplace-libre');
  if(l)l.style.display=document.getElementById('og-f-remplace')?.value==='__libre'?'':'none';
}
function ogOptionsRemplace(crecheId,c){
  const cartes=ogCartes.filter(x=>x.creche_id===(crecheId||null)&&(!c||x.id!==c.id));
  const{refs,emps}=ogSansCarte(crecheId,c);
  let h='<option value="">— Ne remplace personne —</option>';
  if(cartes.length)h+='<optgroup label="Dans l’organigramme">'+cartes.map(x=>`<option value="${x.id}"${c?.remplace_id===x.id?' selected':''}>${ogEsc(x.nom)}${x.poste?' — '+ogEsc(x.poste):''}</option>`).join('')+'</optgroup>';
  const autres=refs.map(r=>`<option value="r:${r.id}">${ogEsc(r.name)}${r.poste?' — '+ogEsc(r.poste):''}</option>`)
    .concat(emps.map(e=>`<option value="e:${e.id}">${ogEsc(((e.prenom||'')+' '+(e.nom||'')).trim())}${(e.poste||e.qualification)?' — '+ogEsc(e.poste||e.qualification):''}</option>`));
  if(autres.length)h+='<optgroup label="Autres personnes de la crèche (ajoutées à l’organigramme, en arrêt)">'+autres.join('')+'</optgroup>';
  h+='<option value="__libre">— Autre personne (saisir son nom)… —</option>';
  return h;
}
// Crée la carte (en arrêt) d'une personne qui n'était pas encore dans l'organigramme, et renvoie son id.
async function ogCreerCarteArret(val,creche_id,parent_id){
  const[type,...reste]=val.split(':'),pid=reste.join(':');
  let nom='',poste='',diplome='',heures=null,employe_id=null,referent_id=null;
  if(type==='l'){
    nom=pid;
  }else if(type==='e'){
    const e=cacheEmployes.find(x=>x.id===pid);if(!e)throw new Error('collaborateur introuvable');
    nom=((e.prenom||'')+' '+(e.nom||'')).trim();poste=e.poste||e.qualification||'';diplome=e.qualification||'';heures=e.heures_hebdo;employe_id=e.id;
  }else{
    const r=cacheReferents.find(x=>x.id===pid);if(!r)throw new Error('référent·e introuvable');
    const e=r.employe_id?cacheEmployes.find(x=>x.id===r.employe_id):null;
    nom=r.name||'';poste=r.poste||e?.poste||'';diplome=e?.qualification||'';heures=e?.heures_hebdo;referent_id=r.id;
  }
  const freres=ogCartes.filter(x=>x.creche_id===creche_id&&(x.parent_id||null)===(parent_id||null));
  const ordre=freres.reduce((m,x)=>Math.max(m,x.ordre||0),0)+1;
  const{data,error}=await sb.from('organigramme_cartes').insert({creche_id,nom,poste:poste||null,diplome:diplome||null,heures_hebdo:heures!=null?heures:null,en_arret:true,parent_id:parent_id||null,ordre,employe_id,referent_id}).select('id').single();
  if(error)throw error;
  return data.id;
}
function ogOptionsPersonnes(crecheId,courant){
  const refs=cacheReferents.filter(r=>(r.role==='referent'||r.role==='direction')&&(!crecheId||r.creche_id===crecheId||!r.creche_id));
  const emps=cacheEmployes.filter(e=>!e.archive_le&&(!crecheId||e.creche_id===crecheId));
  let h='<option value="">— Saisie libre —</option>';
  if(refs.length)h+='<optgroup label="Direction / référent·e·s">'+refs.map(r=>`<option value="r:${r.id}"${courant===('r:'+r.id)?' selected':''}>${ogEsc(r.name)}</option>`).join('')+'</optgroup>';
  const parts=(typeof cachePartenaires!=='undefined'?cachePartenaires:[]).filter(p=>!p.creche_ids?.length||!crecheId||p.creche_ids.includes(crecheId))
    .sort((a,b)=>(/rsai/i.test(b.categorie||'')-/rsai/i.test(a.categorie||''))||String(a.nom).localeCompare(String(b.nom),'fr'));
  if(parts.length)h+='<optgroup label="Partenaires (RSAI, intervenants…)">'+parts.map(p=>`<option value="p:${p.id}"${courant===('p:'+p.id)?' selected':''}>${ogEsc((p.contact_nom||p.nom)+(p.categorie?' — '+p.categorie:''))}</option>`).join('')+'</optgroup>';
  if(emps.length)h+='<optgroup label="Collaborateurs / trices">'+emps.map(e=>`<option value="e:${e.id}"${courant===('e:'+e.id)?' selected':''}>${ogEsc(((e.prenom||'')+' '+(e.nom||'')).trim())}</option>`).join('')+'</optgroup>';
  return h;
}
function ogChoisirPersonne(){
  const v=document.getElementById('og-f-pers').value;if(!v)return;
  const[type,id]=v.split(':');
  let nom='',poste='',diplome='',heures=null;
  if(type==='p'){
    const p=cachePartenaires.find(x=>x.id===id);if(!p)return;
    const rsai=/rsai/i.test(p.categorie||'');
    nom=p.contact_nom||p.nom;poste=rsai?'RSAI':(p.categorie||'');
    const n=document.getElementById('og-f-note');
    if(n&&!n.value&&p.contact_nom&&p.nom&&p.nom!==p.contact_nom)n.value=p.nom;
    if(rsai){const c=document.getElementById('og-f-rsai');if(c)c.checked=true;}
  }else if(type==='e'){
    const e=cacheEmployes.find(x=>x.id===id);if(!e)return;
    nom=((e.prenom||'')+' '+(e.nom||'')).trim();poste=e.poste||e.qualification||'';diplome=e.qualification||'';heures=e.heures_hebdo;
  }else{
    const r=cacheReferents.find(x=>x.id===id);if(!r)return;
    nom=r.name||'';poste=r.poste||'';
    const e=r.employe_id?cacheEmployes.find(x=>x.id===r.employe_id):null;
    if(e){diplome=e.qualification||'';heures=e.heures_hebdo;if(!poste)poste=e.poste||'';}
  }
  const set=(i,val)=>{const el=document.getElementById(i);if(el&&val!==''&&val!=null)el.value=val;};
  set('og-f-nom',nom);set('og-f-poste',poste);set('og-f-diplome',diplome);
  if(heures!=null)set('og-f-heures',String(heures).replace('.',','));
}
// Aide du formulaire : « Gestionnaire » => niveau réseau (en haut, sur la même ligne que les autres gestionnaires).
// Une carte RSAI sans « Rattaché à » se place sur la même ligne que la directrice technique (cartes de tête sous les gestionnaires).
function ogPosteChange(){
  const r=document.getElementById('og-f-reseau');
  if(!r||r.type==='hidden'||r.dataset.touche)return;
  r.checked=/gestionnaire/i.test(document.getElementById('og-f-poste')?.value||'');
}
function ogAjouterGestionnaire(){ogEditer(null,true);}
function ogEditer(id,reseauInit){
  const c=id?ogCartes.find(x=>x.id===id):null;
  const crecheId=c?c.creche_id:ogCrecheCourante();
  const reseau=c?!c.creche_id:false;
  const nouveauReseau=!c&&!!reseauInit;
  const exclus=c?ogDescendants(c.id):new Set();
  const autres=ogCartes.filter(x=>!exclus.has(x.id)&&x.creche_id===(crecheId||null)&&!reseau);
  const lie=c?(c.employe_id?'e:'+c.employe_id:c.referent_id?'r:'+c.referent_id:''):'';
  const m=document.createElement('div');m.id='og-modal';m.className='og-overlay';
  m.innerHTML='<div class="og-dlg" role="dialog" aria-modal="true"><h3>'+(c?'Modifier la carte':(nouveauReseau?'Ajouter un gestionnaire':'Ajouter une personne'))+'</h3>'
    +'<label class="flabel">Personne (fiche existante)</label><select class="finput" id="og-f-pers" onchange="ogChoisirPersonne()">'+ogOptionsPersonnes(crecheId,lie)+'</select>'
    +'<label class="flabel">Nom *</label><input class="finput" id="og-f-nom" value="'+ogEsc(c?.nom||'')+'" placeholder="Ex. : Sophie CHANCEY">'
    +'<label class="flabel">Fonction</label><input class="finput" id="og-f-poste" oninput="ogPosteChange()" value="'+ogEsc(c?.poste||(nouveauReseau?'Gestionnaire':''))+'" placeholder="Ex. : Gestionnaire, Référent technique, Auxiliaire de puériculture">'
    +'<label class="flabel">Diplôme</label><input class="finput" id="og-f-diplome" value="'+ogEsc(c?.diplome||'')+'" placeholder="Ex. : D.E. AP, CAP AEPE, Infirmière puéricultrice">'
    +'<div class="og-2c"><div><label class="flabel">Temps de travail (h / semaine)</label><input class="finput" id="og-f-heures" value="'+ogEsc(c?.heures_hebdo!=null?String(c.heures_hebdo).replace('.',','):'')+'" placeholder="35 ou 8h45"></div>'
    +'<div><label class="flabel">ETP (auto si vide)</label><input class="finput" id="og-f-etp" value="'+ogEsc(c?.etp!=null?String(c.etp).replace('.',','):'')+'" placeholder="= heures / 35"></div></div>'
    +'<div class="og-2c"><div><label class="flabel">dont ETP direction</label><input class="finput" id="og-f-etpdir" value="'+ogEsc(c?.etp_direction!=null?String(c.etp_direction).replace('.',','):'')+'" placeholder="Ex. : 0,5"></div>'
    +'<div><label class="flabel">dont ETP entretien / repas</label><input class="finput" id="og-f-etpent" value="'+ogEsc(c?.etp_entretien!=null?String(c.etp_entretien).replace('.',','):'')+'" placeholder="Ex. : 0,29"></div></div>'
    +'<label class="flabel">Note (expérience, alternance…)</label><textarea class="finput" id="og-f-note" rows="2" placeholder="Ex. : + 2 ans d’expérience">'+ogEsc(c?.note||'')+'</textarea>'
    +'<label class="og-chk"><input type="checkbox" id="og-f-rsai"'+(c?.rsai?' checked':'')+'> Référent·e Santé et Accueil Inclusif (RSAI)</label>'
    +(reseau?'':'<label class="og-chk"><input type="checkbox" id="og-f-arret"'+(c?.en_arret?' checked':'')+'> Absent·e de cette crèche (carte grisée, hors totaux)</label>'
      +'<label class="flabel">Motif de l’absence</label><select class="finput" id="og-f-motif">'
      +[['arret','En arrêt'],['mutation','Mutation : affecté·e dans une autre crèche'],['conge','Congé']].map(([k,l])=>`<option value="${k}"${((c?.absence_motif)||'arret')===k?' selected':''}>${l}</option>`).join('')+'</select>'
      +'<label class="flabel">Remplace <span style="font-weight:400;color:var(--muted)">(la personne remplacée passe en arrêt ; la remplaçante prend sa place dans l’organigramme)</span></label><select class="finput" id="og-f-remplace" onchange="ogRemplaceChange()">'+ogOptionsRemplace(crecheId,c)+'</select><input class="finput" id="og-f-remplace-libre" placeholder="Nom de la personne remplacée" style="display:none;margin-top:6px">')
    +(reseau?'':'<label class="flabel">Rattaché à <span style="font-weight:400;color:var(--muted)">(vide = sur la même ligne que la directrice technique, sous les gestionnaires)</span></label><select class="finput" id="og-f-parent"><option value="">— Aucun (en haut de l’organigramme) —</option>'
      +autres.map(x=>`<option value="${x.id}"${c?.parent_id===x.id?' selected':''}>${ogEsc(x.nom)}${x.poste?' — '+ogEsc(x.poste):''}</option>`).join('')+'</select>')
    +(isDirection&&!reseau?'<label class="og-chk"><input type="checkbox" id="og-f-reseau" onchange="this.dataset.touche=1"'+(nouveauReseau?' checked':'')+(c?' data-touche="1"':'')+'> Niveau réseau : en haut, au-dessus de toutes les crèches (gestionnaires…)</label>':'')
    +(isDirection&&reseau?'<input type="hidden" id="og-f-reseau" value="1">':'')
    +'<div class="og-btns">'
    +(c?'<button type="button" class="btn-sm" onclick="ogDeplacer(\''+c.id+'\',-1)" title="Avant ses voisines"><i class="ti ti-arrow-left"></i></button><button type="button" class="btn-sm" onclick="ogDeplacer(\''+c.id+'\',1)" title="Après ses voisines"><i class="ti ti-arrow-right"></i></button><button type="button" class="btn-sm" style="color:var(--red)" onclick="ogSupprimer(\''+c.id+'\')"><i class="ti ti-trash"></i> Supprimer</button>':'')
    +'<span style="flex:1"></span><button type="button" class="btn-sm" onclick="ogFermer()">Annuler</button><button type="button" class="btn-primary" onclick="ogEnregistrer('+(c?'\''+c.id+'\'':'null')+')">Enregistrer</button></div></div>';
  m.addEventListener('click',e=>{if(e.target===m)ogFermer();});
  document.body.appendChild(m);
  document.getElementById('og-f-nom').focus();
}
async function ogEnregistrer(id){
  const v=i=>(document.getElementById(i)?.value||'').trim();
  const nom=v('og-f-nom');if(!nom){alert('Le nom est obligatoire.');return;}
  const heures=ogParseHeures(v('og-f-heures'));
  if(Number.isNaN(heures)||(heures!=null&&(heures<0||heures>60))){alert('Temps de travail : indiquez un nombre d’heures (ex. 35 ou 8h45).');return;}
  const etpTxt=v('og-f-etp').replace(',','.');
  const etp=etpTxt===''?null:parseFloat(etpTxt);
  if(etp!=null&&(!isFinite(etp)||etp<0||etp>2)){alert('ETP : indiquez un nombre entre 0 et 2.');return;}
  const nbOuNull=(id,lib)=>{const t=v(id).replace(',','.');if(t==='')return null;const x=parseFloat(t);return(isFinite(x)&&x>=0&&x<=2)?x:NaN;};
  const etpDir=nbOuNull('og-f-etpdir'),etpEnt=nbOuNull('og-f-etpent');
  if(Number.isNaN(etpDir)||Number.isNaN(etpEnt)){alert('ETP direction / entretien : indiquez un nombre entre 0 et 2 (ex. 0,5).');return;}
  const pers=v('og-f-pers');
  const reseau=!!document.getElementById('og-f-reseau')&&(document.getElementById('og-f-reseau').type==='hidden'||document.getElementById('og-f-reseau').checked);
  const existante=id?ogCartes.find(x=>x.id===id):null;
  const creche_id=reseau?null:(existante?existante.creche_id:ogCrecheCourante())||null;
  if(!reseau&&!creche_id){alert('Choisissez d’abord une crèche.');return;}
  const row={
    nom,poste:v('og-f-poste')||null,diplome:v('og-f-diplome')||null,heures_hebdo:heures,etp,etp_direction:etpDir,etp_entretien:etpEnt,note:v('og-f-note')||null,
    rsai:!!document.getElementById('og-f-rsai')?.checked,creche_id,
    parent_id:reseau?null:(v('og-f-parent')||null),
    en_arret:!reseau&&!!document.getElementById('og-f-arret')?.checked,
    absence_motif:(!reseau&&document.getElementById('og-f-arret')?.checked)?(v('og-f-motif')||'arret'):null,remplace_id:reseau?null:(v('og-f-remplace')||null),
    employe_id:pers.startsWith('e:')?pers.slice(2):null,referent_id:pers.startsWith('r:')?pers.slice(2):null
  };
  if(row.remplace_id==='__libre'){
    const n=v('og-f-remplace-libre');
    if(!n){alert('Saisissez le nom de la personne remplacée.');return;}
    row.remplace_id='l:'+n;
  }
  if(row.remplace_id&&/^[erl]:/.test(row.remplace_id)){
    // une personne ne peut pas se remplacer elle-même (même fiche ou même nom)
    const[t,...r]=row.remplace_id.split(':'),k=r.join(':');
    const memeFiche=(t==='e'&&row.employe_id===k)||(t==='r'&&row.referent_id===k);
    const nomCible=t==='l'?k:(t==='e'?(()=>{const e=cacheEmployes.find(x=>x.id===k);return e?((e.prenom||'')+' '+(e.nom||'')).trim():'';})():(cacheReferents.find(x=>x.id===k)?.name||''));
    if(memeFiche||ogNorm(nomCible)===ogNorm(nom)){alert('Une personne ne peut pas se remplacer elle-même.');return;}
  }
  if(row.remplace_id&&/^[erl]:/.test(row.remplace_id)){
    try{row.remplace_id=await ogCreerCarteArret(row.remplace_id,creche_id,row.parent_id);}
    catch(err){alert('Impossible d’ajouter la personne remplacée : '+(err?.message||err));return;}
  }
  if(row.remplace_id){
    const cible=ogCartes.find(x=>x.id===row.remplace_id);
    if(cible&&(ogNorm(cible.nom)===ogNorm(nom)||(row.employe_id&&cible.employe_id===row.employe_id))){alert('Une personne ne peut pas se remplacer elle-même.');return;}
    if(id&&(row.remplace_id===id||cible?.remplace_id===id)){alert('Une personne ne peut pas se remplacer elle-même (ni remplacer quelqu’un qui la remplace).');return;}
  }
  if(!id){
    const freres=ogCartes.filter(x=>x.creche_id===creche_id&&x.parent_id===row.parent_id);
    row.ordre=freres.reduce((m,x)=>Math.max(m,x.ordre||0),0)+1;
  }
  try{
    const r=id?await sb.from('organigramme_cartes').update(row).eq('id',id):await sb.from('organigramme_cartes').insert(row);
    if(r.error)throw r.error;
  }catch(err){alert('Enregistrement impossible : '+(err?.message||err));return;}
  ogFermer();await ogCharger();
}
async function ogSupprimer(id){
  const c=ogCartes.find(x=>x.id===id);if(!c)return;
  const nb=ogCartes.filter(x=>x.parent_id===id).length;
  if(!confirm('Retirer « '+c.nom+' » de l’organigramme ?'+(nb?'\n\nLes '+nb+' carte(s) rattachée(s) passeront en haut de l’organigramme (à rattacher de nouveau). La fiche de la personne n’est pas supprimée.':'\n\nLa fiche de la personne n’est pas supprimée.')))return;
  const{error}=await sb.from('organigramme_cartes').delete().eq('id',id);
  if(error){alert('Suppression impossible : '+error.message);return;}
  ogFermer();await ogCharger();
}
// Décale une carte avant / après ses voisines (même parent, même crèche).
async function ogDeplacer(id,sens){
  const c=ogCartes.find(x=>x.id===id);if(!c)return;
  const freres=ogCartes.filter(x=>x.creche_id===c.creche_id&&(x.parent_id||null)===(c.parent_id||null))
    .sort((a,b)=>(a.ordre-b.ordre)||String(a.created_at).localeCompare(String(b.created_at)));
  const i=freres.findIndex(x=>x.id===id),j=i+sens;
  if(j<0||j>=freres.length)return;
  [freres[i],freres[j]]=[freres[j],freres[i]];
  try{
    await Promise.all(freres.map((x,k)=>x.ordre===k+1?null:sb.from('organigramme_cartes').update({ordre:k+1}).eq('id',x.id)));
  }catch(err){alert('Déplacement impossible : '+(err?.message||err));return;}
  ogFermer();await ogCharger();ogEditer(id);
}
// Part de l'équipe existante : référent·e·s en haut, collaborateur·trice·s rattaché·e·s au premier référent.
async function ogPrerempli(){
  const crecheId=ogCrecheCourante();if(!crecheId)return;
  if(ogCartes.some(c=>c.creche_id===crecheId)&&!confirm('Cette crèche a déjà un organigramme : ajouter quand même les personnes manquantes ?'))return;
  const deja=new Set(ogCartes.filter(c=>c.creche_id===crecheId).flatMap(c=>[c.employe_id,c.referent_id]).filter(Boolean));
  const refs=cacheReferents.filter(r=>r.role==='referent'&&r.creche_id===crecheId&&!deja.has(r.id));
  const liees=new Set(cacheReferents.filter(r=>r.creche_id===crecheId).map(r=>r.employe_id).filter(Boolean));
  const emps=cacheEmployes.filter(e=>!e.archive_le&&e.creche_id===crecheId&&!deja.has(e.id)&&!liees.has(e.id));
  if(!refs.length&&!emps.length){alert('Rien à ajouter : toutes les personnes de la crèche sont déjà dans l’organigramme.');return;}
  let ordre=ogCartes.filter(c=>c.creche_id===crecheId).reduce((m,c)=>Math.max(m,c.ordre||0),0);
  const base=(nom,poste,diplome,h)=>({creche_id:crecheId,nom,poste:poste||null,diplome:diplome||null,heures_hebdo:h!=null?h:null,ordre:++ordre});
  try{
    const lignes=refs.map(r=>{
      const e=r.employe_id?cacheEmployes.find(x=>x.id===r.employe_id):null;
      return Object.assign(base(r.name,r.poste||e?.poste,e?.qualification,e?.heures_hebdo),{referent_id:r.id,employe_id:null});
    });
    let ids=[];
    if(lignes.length){
      const{data,error}=await sb.from('organigramme_cartes').insert(lignes).select('id');
      if(error)throw error;ids=(data||[]).map(x=>x.id);
    }
    const parent=ids[0]||ogCartes.find(c=>c.creche_id===crecheId&&!c.parent_id)?.id||null;
    if(emps.length){
      const{error}=await sb.from('organigramme_cartes').insert(emps.map(e=>Object.assign(
        base(((e.prenom||'')+' '+(e.nom||'')).trim()||'—',e.poste||e.qualification,e.qualification,e.heures_hebdo),{employe_id:e.id,parent_id:parent})));
      if(error)throw error;
    }
  }catch(err){alert('Pré-remplissage impossible : '+(err?.message||err));return;}
  await ogCharger();
}


// ---------- reprise du calcul des ETP (Documents › Calcul des ETP et de l'encadrement) ----------
/* Le calcul de Documents (`09-calcul-etp.js`, réponse `documents_reponses.donnees.etp_json`, une par crèche) donne pour
   chaque poste (« Directrice », « Professionnel·le 1 »…, sans nom) une qualification `q` et des heures `h` ; base `ft`
   (35 h). Les postes sont anonymes : l'écran propose de les relier aux cartes avant d'écrire. Libellés ci-dessous = ETP_QUAL
   de documents/09-calcul-etp.js (à garder en phase). */
const OG_QUAL={cap2:{dip:'CAP AEPE',note:'+ 2 ans d’expérience',mot:/cap|aepe/i},cap:{dip:'CAP AEPE',mot:/cap|aepe/i},eje:{dip:'EJE',mot:/eje|éducat/i},
  ap:{dip:'Auxiliaire de puériculture',mot:/aux|\bap\b/i},ide:{dip:'Infirmier·ère / puériculteur·trice',mot:/infirm|puéricult|ide/i},autre:{dip:'',mot:/^$/}};
let ogEtpDoc=null;
async function ogEtpReprendre(){
  const crecheId=ogCrecheCourante();if(!crecheId)return;
  const cartes=ogCartes.filter(c=>c.creche_id===crecheId);
  if(!cartes.length){alert('Ajoutez d’abord les personnes à l’organigramme (ou « Pré-remplir depuis les fiches »).');return;}
  let rep;
  try{
    const{data:doc,error:e1}=await sb.from('documents_koala').select('id').eq('template_key','calcul_etp').eq('actif',true).limit(1);
    if(e1)throw e1;
    if(!doc||!doc.length){alert('Le modèle « Calcul des ETP et de l’encadrement » n’existe pas dans Documents › Administratifs.');return;}
    const{data,error}=await sb.from('documents_reponses').select('donnees,updated_at').eq('document_id',doc[0].id).eq('creche_id',crecheId).order('updated_at',{ascending:false}).limit(1);
    if(error)throw error;
    rep=data&&data[0];
  }catch(err){alert('Lecture impossible : '+(err?.message||err));return;}
  let st=null;
  try{st=rep?.donnees?.etp_json?JSON.parse(rep.donnees.etp_json):null;}catch(e){st=null;}
  if(!st||!Array.isArray(st.pros)){alert('Aucun calcul des ETP enregistré pour cette crèche : ouvrez Documents › « Calcul des ETP et de l’encadrement », renseignez l’équipe, puis revenez ici.');return;}
  const nb=Math.max(2,Math.min(st.pros.length,Math.round(+st.nb||4)));
  const ft=+st.ft>0?+st.ft:OG_HEURES_ETP;
  const postes=st.pros.slice(0,nb).map((p,i)=>({i,label:i===0?'Directrice':'Professionnel·le '+i,q:p.q||'autre',h:Math.max(0,+p.h||0)}));
  // Proposition : poste 0 → référent·e / direction ; ensuite même qualification, sinon ordre.
  const pris=new Set(),choix={};
  const premier=cartes.find(c=>/direct|référent|referent/i.test(c.poste||'')&&!c.rsai)||cartes.find(c=>!c.parent_id&&!c.rsai);
  postes.forEach(po=>{
    let c=po.i===0?premier:cartes.find(x=>!pris.has(x.id)&&!x.rsai&&(OG_QUAL[po.q]?.mot.test((x.diplome||'')+' '+(x.poste||''))));
    if(!c)c=cartes.find(x=>!pris.has(x.id)&&!x.rsai&&x!==premier);
    if(c){pris.add(c.id);choix[po.i]=c.id;}
  });
  // Mêmes règles que etpCalc (documents/09-calcul-etp.js) : direction prise sur la directrice, repas = h/jour × jours.
  const h0=postes[0]?postes[0].h:0,dirH=Math.min(h0,Math.max(0,(+st.dir||0)*ft));
  const repasH=Math.max(0,+st.repas||0)*(+st.jours>0?+st.jours:5);
  ogEtpDoc={postes,ft,choix,date:rep.updated_at,cartes,dirH,repasH,repasChoix:repasH>0?'*':''};
  ogEtpAfficher();
}
function ogEtpAfficher(){
  ogFermer();
  const d=ogEtpDoc;
  const m=document.createElement('div');m.id='og-modal';m.className='og-overlay';
  const dateTxt=d.date?new Date(d.date).toLocaleDateString('fr-FR'):'';
  m.innerHTML='<div class="og-dlg" role="dialog" aria-modal="true"><h3>Reprendre les ETP de Documents</h3>'
    +'<p style="font-size:12.5px;color:var(--muted);margin:0 0 6px">Calcul du '+ogEsc(dateTxt)+' (base '+ogEsc(String(d.ft).replace('.',','))+' h = 1 ETP). Les postes y sont anonymes : indiquez à quelle carte correspond chacun. Les heures et l’ETP de la carte sont remplacés ; le diplôme n’est complété que s’il est vide.</p>'
    +d.postes.map(po=>'<div class="og-2c" style="align-items:center"><div style="font-size:12.5px"><strong>'+ogEsc(po.label)+'</strong><br>'+ogEsc(OG_QUAL[po.q]?.dip||'Autre qualification')+(po.q==='cap2'?' (+ 2 ans)':'')+' · '+ogEsc(ogFmtHeures(po.h))+' · '+ogEsc(ogFmtEtp(po.h/d.ft))+'</div>'
      +'<select class="finput" id="og-ep-'+po.i+'"><option value="">— Ne pas reprendre —</option>'+d.cartes.map(c=>`<option value="${c.id}"${d.choix[po.i]===c.id?' selected':''}>${ogEsc(c.nom)}</option>`).join('')+'</select></div>').join('')
    +(d.dirH>0?'<div class="og-2c" style="align-items:center"><div style="font-size:12.5px"><strong>ETP direction</strong><br>'+ogEsc(ogFmtEtp(d.dirH/d.ft))+' ('+ogEsc(ogFmtHeures(d.dirH).replace('/SEM',''))+' par semaine)</div><div style="font-size:12px;color:var(--muted)">Inscrit sur la carte reliée à « Directrice ».</div></div>':'')
    +(d.repasH>0?'<div class="og-2c" style="align-items:center"><div style="font-size:12.5px"><strong>ETP entretien / repas</strong><br>'+ogEsc(ogFmtEtp(d.repasH/d.ft))+' ('+ogEsc(ogFmtHeures(d.repasH).replace('/SEM',''))+' par semaine)</div>'
      +'<select class="finput" id="og-ep-repas"><option value="">— Ne pas reprendre —</option><option value="*" selected>Répartir entre les professionnel·les reliés</option>'+d.cartes.map(c=>`<option value="${c.id}">${ogEsc(c.nom)} uniquement</option>`).join('')+'</select></div>':'')
    +'<div class="og-btns"><span style="flex:1"></span><button type="button" class="btn-sm" onclick="ogFermer()">Annuler</button><button type="button" class="btn-primary" onclick="ogEtpAppliquer()">Appliquer</button></div></div>';
  m.addEventListener('click',e=>{if(e.target===m)ogFermer();});
  document.body.appendChild(m);
}
async function ogEtpAppliquer(){
  const d=ogEtpDoc;if(!d)return;
  const vus={},lignes=[];
  for(const po of d.postes){
    const id=document.getElementById('og-ep-'+po.i)?.value;if(!id)continue;
    if(vus[id]){alert('La carte « '+d.cartes.find(c=>c.id===id)?.nom+' » est choisie pour deux postes.');return;}
    vus[id]=1;lignes.push({po,c:d.cartes.find(c=>c.id===id)});
  }
  const repasSel=document.getElementById('og-ep-repas')?.value||'';
  if(!lignes.length&&!repasSel){ogFermer();return;}
  // Entretien / repas : réparti à parts égales entre les professionnel·les reliés (hors directrice), ou une seule carte.
  const repasPar={};
  if(repasSel&&d.repasH>0){
    const cibles=repasSel==='*'?(lignes.filter(l=>l.po.i!==0).length?lignes.filter(l=>l.po.i!==0):lignes).map(l=>l.c.id):[repasSel];
    cibles.forEach(id=>{repasPar[id]=Math.round(d.repasH/d.ft/cibles.length*1000)/1000;});
  }
  d.cartes.forEach(c=>{if(repasPar[c.id]!=null&&!lignes.some(l=>l.c.id===c.id))lignes.push({po:null,c});});
  try{
    for(const{po,c}of lignes){
      const maj={};
      if(po){
        const q=OG_QUAL[po.q]||OG_QUAL.autre;
        maj.heures_hebdo=po.h;maj.etp=d.ft===OG_HEURES_ETP?null:Math.round(po.h/d.ft*1000)/1000;
        if(!c.diplome&&q.dip)maj.diplome=q.dip;
        if(!c.note&&q.note)maj.note=q.note;
        if(po.i===0)maj.etp_direction=d.dirH>0?Math.round(d.dirH/d.ft*1000)/1000:null;
      }
      if(repasPar[c.id]!=null)maj.etp_entretien=repasPar[c.id];
      const{error}=await sb.from('organigramme_cartes').update(maj).eq('id',c.id);
      if(error)throw error;
    }
  }catch(err){alert('Mise à jour impossible : '+(err?.message||err));return;}
  ogEtpDoc=null;ogFermer();await ogCharger();
}

// ---------- impression ----------
const OG_CSS='.og-entete{display:flex;align-items:center;gap:12px;margin-bottom:8px}.og-logo{height:46px}.og-titre{font-size:20px;font-weight:800;color:#3D3580}.og-sous{font-size:12px;color:#666}'
  +'.og-arbre{overflow:visible}.og-t,.og-t ul{padding-top:14px;position:relative;display:flex;justify-content:center;margin:0;padding-left:0;list-style:none}.og-t li{position:relative;padding:14px 3px 0;text-align:center;list-style:none;display:flex;flex-direction:column;align-items:center}'
  +'.og-t li::before,.og-t li::after{content:"";position:absolute;top:0;right:50%;border-top:2px solid #b9b5d6;width:50%;height:14px}.og-t li::after{right:auto;left:50%;border-left:2px solid #b9b5d6}'
  +'.og-t li:only-child::before,.og-t li:only-child::after{display:none}.og-t li:only-child{padding-top:0}.og-t li:first-child::before,.og-t li:last-child::after{border:0}.og-t li:last-child::before{border-right:2px solid #b9b5d6;border-radius:0 6px 0 0}.og-t li:first-child::after{border-radius:6px 0 0 0}'
  +'.og-t ul::before{content:"";position:absolute;top:0;left:50%;border-left:2px solid #b9b5d6;height:14px}.og-t>li{padding-top:0}.og-t>li::before,.og-t>li::after{display:none}'
  +'.og-groupe{position:relative;display:flex;gap:0;justify-content:center;align-items:stretch;flex-wrap:nowrap}.og-groupe .og-node{width:158px;max-width:158px;min-width:158px;box-sizing:border-box;z-index:1}.og-groupe .og-node+.og-node{margin-left:26px}.og-groupe::after{content:"";position:absolute;left:50%;top:50%;bottom:0;border-left:2px solid #3D3580;margin-left:-1px}.og-groupe .og-node+.og-node::before{content:"";position:absolute;left:-26px;top:50%;width:26px;border-top:2px solid #3D3580}'
  +'.og-node{position:relative;min-width:128px;max-width:176px;border:1.5px solid #3D3580;border-radius:9px;padding:6px 7px;background:#fff;break-inside:avoid}.og-rsai{border-color:#0E9F6E;background:#ECFDF5}'
  +'.og-badges{position:absolute;top:-9px;right:8px;display:flex;gap:4px;max-width:96%;justify-content:flex-end}.og-badge{background:#0E9F6E;color:#fff;font-size:10px;font-weight:800;border-radius:8px;padding:1px 7px;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}.og-b-arret{background:#B45309}.og-b-mutation{background:#7C3AED}.og-b-conge{background:#0E7490}.og-b-remp{background:#2563EB}.og-absente{border-style:dashed;border-color:#9a98b5;background:#f1f0f6;color:#777}.og-absente .og-poste{color:#888}.og-remp{position:relative;display:flex;justify-content:center;align-items:stretch;flex-wrap:nowrap}.og-remp .og-node{width:158px;max-width:158px;min-width:158px;box-sizing:border-box;z-index:1}.og-remp .og-node+.og-node{margin-left:26px}.og-remp .og-node+.og-node::before{content:"";position:absolute;left:-26px;top:50%;width:26px;border-top:2px dashed #B45309}.og-remp::after{content:"";position:absolute;left:50%;top:50%;bottom:0;border-left:2px dashed #B45309;margin-left:-1px}'
  +'.og-nom{font-weight:800;font-size:12px}.og-poste{font-size:11px;font-weight:700;color:#3D3580}.og-dip,.og-note{font-size:10.5px;color:#555}.og-temps{font-size:10.5px;font-weight:700;margin-top:3px}.og-synth{margin:14px auto 0;border-collapse:collapse;font-size:12px;min-width:340px}.og-synth caption{font-weight:800;color:#3D3580;text-align:left;padding-bottom:4px;font-size:13px}.og-synth th{font-size:11px;color:#666;text-align:right;padding:3px 10px;border-bottom:2px solid #3D3580}.og-synth td{padding:4px 10px;border-bottom:1px solid #e3e1f0;text-align:right}.og-synth td:first-child{text-align:left;font-weight:600}.og-synth .og-tot td{font-weight:800;border-top:2px solid #3D3580;border-bottom:0}.og-parts{margin-top:5px;border-top:1px dashed #cfcce6;padding-top:4px;text-align:left}.og-part{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#444}.og-part span:last-child{font-weight:700;white-space:nowrap}'
  +'.og-pied{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:12px;font-size:11px;color:#555;border-top:1px solid #ddd;padding-top:8px}';
function ogImprimer(){
  const zone=document.getElementById('og-contenu');if(!zone)return;
  const w=window.open('','_blank');if(!w){alert('Autorisez les fenêtres pop-up pour imprimer.');return;}
  const need=parseInt(zone.querySelector('.og-arbre')?.dataset.largeur||'0',10);
  const z=need>1000?Math.max(0.4,1000/need):1;
  w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Organigramme Koala Kids</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;margin:16px;color:#222}'+OG_CSS+'.og-arbre{zoom:'+z+'}</style></head><body>'
    +zone.innerHTML.replace(/ style="zoom:[^"]*"/g,'').replace(/ onclick="[^"]*"/g,'').replace(/ title="Modifier"/g,'')
    +'<div style="margin-top:14px;font-size:10px;color:#888;text-align:center">Application créée par David Bucari</div></body></html>');
  w.document.close();w.focus();setTimeout(()=>w.print(),400);
}
