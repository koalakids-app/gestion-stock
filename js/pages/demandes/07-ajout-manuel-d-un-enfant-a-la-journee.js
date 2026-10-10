window.crOpenMail=crOpenMail;window.crSendMail=crSendMail;
window.crSaveOnly=crSaveOnly;
window.crToggleTarifs=crToggleTarifs;window.crSaveTarifs=crSaveTarifs;window.crRenderCouts=crRenderCouts;

// ── AJOUT MANUEL D’UN ENFANT À LA JOURNÉE ──
let _presAbsentsDuJour=[];
function presOpenAddDay(){
  const sel=document.getElementById('pres-add-day-select');
  if(!sel)return;
  if(!_presAbsentsDuJour.length){
    sel.innerHTML='<option value="">Tous les enfants de la cr\u00e8che sont d\u00e9j\u00e0 pr\u00e9sents</option>';
  }else{
    sel.innerHTML='<option value="">-- Choisir un enfant --</option>'+_presAbsentsDuJour.map(e=>'<option value="'+e.id+'">'+escHtml((e.prenom||'')+' '+(e.nom||''))+'</option>').join('');
  }
  document.getElementById('modal-pres-add-day-wrap').classList.add('open');
}
async function presAddDayConfirm(){
  const sel=document.getElementById('pres-add-day-select');
  const id=sel&&sel.value;
  if(!id){showBanner('S\u00e9lectionnez un enfant.','error');return;}
  const dateStr=document.getElementById('presence-date')?.value||todayStr();
  closeModal('modal-pres-add-day-wrap');
  await togglePresence(id,dateStr);
  showBanner('Enfant ajout\u00e9 \u00e0 la journ\u00e9e.');
}
function presAddDayCreate(){closeModal('modal-pres-add-day-wrap');openEnfantModal();}
window.presAddDayCreate=presAddDayCreate;
window.presOpenAddDay=presOpenAddDay;
window.presAddDayConfirm=presAddDayConfirm;

async function exportPresence(){
  const dateStr=document.getElementById('presence-date')?.value||todayStr();
  const{data:presData}=await sb.from('presences').select('*').eq('presence_date',dateStr);
  const pm={};(presData||[]).forEach(p=>pm[p.enfant_id+'_'+p.slot]=p.status);
  let csv='Enfant,Crèche,Groupe,Allergies,Matin,Après-midi\n';
  cacheEnfants.forEach(e=>{const creche=cacheCreches.find(c=>c.id===e.creche_id);csv+='"'+(e.prenom+' '+e.nom)+'","'+(creche?.name||'')+'","'+(e.dob?groupeFromDob(e.dob):(e.groupe||''))+'","'+(e.allergies||'')+'","'+(pm[e.id+'_M']||'non saisi')+'","'+(pm[e.id+'_A']||'non saisi')+'"\n';});
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='presences_'+dateStr+'.csv';a.click();URL.revokeObjectURL(url);showBanner('Export CSV téléchargé !');
}
/* Âge en mois révolus depuis la date de naissance, jusqu'à aujourd'hui. Partagé par
   groupeFromDob() (tranche affichée) et enfRepasBaseAuto()/enfGouterAuto() dans
   js/enfants.js (choix du repas et du goûter), pour que les deux ne divergent jamais. */
function ageMoisFromDob(dob){
  if(!dob) return null;
  return Math.floor((Date.now()-new Date(dob).getTime())/(1000*60*60*24*30.44));
}
window.ageMoisFromDob = ageMoisFromDob;
/* Tranches d'âge affichées sur la fiche enfant, alignées sur le calendrier de
   diversification alimentaire du PNNS (Programme National Nutrition Santé /
   Santé publique France, tableau 0-3 ans) et sur les groupes du GEM-RCN 2015
   (recommandations nutritionnelles pour la restauration collective en petite
   enfance, relayées par l'ARS) : avant/après diversification (6 mois), puis les
   paliers 12-18 mois et 15-18 mois qui bornent les structures de repas « Moyens »
   et « Grands ». Voir enfRepasBaseAuto()/enfGouterAuto() dans js/enfants.js pour la
   déduction du repas et du goûter à partir de ces tranches. */
function groupeFromDob(dob){
  const ageMois = ageMoisFromDob(dob);
  if(ageMois === null) return 'Bébés (0-6 mois)';
  if(ageMois < 6) return 'Bébés (0-6 mois)';
  if(ageMois < 12) return 'Bébés (6-12 mois)';
  if(ageMois < 18) return 'Moyens (12-18 mois)';
  if(ageMois < 24) return 'Moyens (18-24 mois)';
  return 'Grands (24-36 mois)';
}
function enfSyncGroupe(){
  const dob = document.getElementById('enf-dob').value;
  const groupe = groupeFromDob(dob);
  const gsel = document.getElementById('enf-groupe');
  const gi = [...gsel.options].findIndex(o=>o.text===groupe);
  gsel.selectedIndex = gi>=0 ? gi : 0;
  enfSyncRepas();
}
window.enfSyncGroupe = enfSyncGroupe;

// Couche-culotte : uniquement tailles 4/5 (apprentissage de la propreté).
// Couche classique : tailles 3 à 6. On régénère les options de taille à
// chaque changement de type pour ne jamais laisser une combinaison invalide
// (bloquée de toute façon côté base par enfants_type_couche_taille_chk).
function enfSyncTailleCouche(valeurTaille){
  const typeSel = document.getElementById('enf-type-couche');
  const tailleSel = document.getElementById('enf-taille-couche');
  if(!typeSel || !tailleSel) return;
  const tailles = typeSel.value === 'culotte' ? ['4','5'] : ['3','4','5','6'];
  const courante = valeurTaille !== undefined ? valeurTaille : tailleSel.value;
  tailleSel.innerHTML = '<option value="">Non renseignée</option>'
    + tailles.map(t=>'<option value="'+t+'">Taille '+t+'</option>').join('');
  tailleSel.value = tailles.includes(courante) ? courante : '';
}
window.enfSyncTailleCouche = enfSyncTailleCouche;

/* Aperçu en direct du code repas qui sera utilisé partout (feuille hebdomadaire,
   bon de commande traiteur), pour que la conséquence du choix soit visible
   avant d'enregistrer. */
function enfSyncRepas(){
  const box=document.getElementById('enf-repas-apercu');
  if(!box)return;
  const dob=(document.getElementById('enf-dob')||{}).value||'';
  const forcee=(document.getElementById('enf-repas-base')||{}).value||'';
  const regime=(document.getElementById('enf-regime-repas')||{}).value||'';
  const auto=enfRepasBaseAuto({dob:dob});
  const base=forcee||auto;
  // Le régime ne s'applique pas au biberon : on grise le menu pour le dire.
  const selReg=document.getElementById('enf-regime-repas');
  if(selReg){
    selReg.disabled=(forcee==='BIB');
    selReg.style.background=selReg.disabled?'#f4f4f8':'';
    selReg.style.cursor=selReg.disabled?'not-allowed':'';
  }
  if(!base){
    box.innerHTML='<span style="color:var(--red)">Date de naissance manquante — aucun code repas ne peut être calculé.</span>';
    return;
  }
  const code=(base==='BIB')?'BIB':(regime?base+regime:base);
  let txt='Code repas : <strong style="color:var(--koala)">'+escHtml(code)+'</strong> — '+escHtml(repasLabel(code)||'');
  if(base==='BIB')txt+=' <span style="color:var(--orange-dark)">(non compté dans les repas commandés)</span>';
  if(forcee&&auto&&forcee!==auto)txt+=' <span style="color:var(--orange-dark)">(forcé ; l’âge donnerait '+escHtml(auto)+')</span>';
  else if(!forcee)txt+=' <span style="opacity:.8">(suit l’âge)</span>';
  /* Le goûter : sans plat, pas de goûter non plus — le menu est grisé sur BIB.
     Sinon on annonce la ligne du bon traiteur qui sera incrémentée (voir
     enfGouterAuto() dans js/enfants.js pour les seuils d'âge). */
  const selGout=document.getElementById('enf-gouter-base');
  if(selGout){
    selGout.disabled=(forcee==='BIB');
    selGout.style.background=selGout.disabled?'#f4f4f8':'';
    selGout.style.cursor=selGout.disabled?'not-allowed':'';
    if(selGout.disabled)selGout.value='';
    const gForce=selGout.value||'';
    const gAuto=enfGouterAuto({dob:dob,repas_base:forcee});
    const gFinal=gForce||gAuto;
    if(forcee!=='BIB'){
      if(!gFinal)txt+='<div style="margin-top:2px">Goûter : <span style="color:var(--muted)">aucun (avant 6 mois)</span></div>';
      else{
        txt+='<div style="margin-top:2px">Goûter : <strong style="color:var(--koala)">'
          +(gFinal==='gbb'?'bébé':'grand')+'</strong>'
          +(gForce&&gAuto&&gForce!==gAuto?' <span style="color:var(--orange-dark)">(forcé ; le repas donnerait '+(gAuto==='gbb'?'bébé':'grand')+')</span>'
            :(gForce&&!gAuto?' <span style="color:var(--orange-dark)">(forcé)</span>':' <span style="opacity:.8">(suit le repas)</span>'))
          +'</div>';
      }
    }
  }
  box.innerHTML=txt;
}
window.enfSyncRepas = enfSyncRepas;
function enfFillCreches(selectedId){
  const sel=document.getElementById('enf-creche');if(!sel)return;
  const maCreche=currentProfile?.creche_id||null;
  const list=isDirection?cacheCreches:cacheCreches.filter(c=>c.id===maCreche);
  const cible=selectedId||(isDirection?null:maCreche);
  sel.innerHTML=(isDirection?'<option value="">-- Choisir --</option>':'')+list.map(c=>'<option value="'+c.id+'"'+(c.id===cible?' selected':'')+'>'+c.name+'</option>').join('');
  sel.disabled=!isDirection;
  sel.style.background=isDirection?'':'#f4f4f8';
  sel.style.cursor=isDirection?'':'not-allowed';
}
function openEnfantModal(){editingEnfantId=null;document.getElementById('modal-enfant-title').textContent='Ajouter un enfant';document.getElementById('enf-btn-save').innerHTML='<i class="ti ti-check"></i> Ajouter';document.getElementById('enf-btn-delete').style.display='none';document.getElementById('enf-avert-provisoire').style.display='none';enfFillCreches(null);['enf-prenom','enf-nom','enf-dob','enf-allergies','enf-date-sortie'].forEach(id=>document.getElementById(id).value='');document.getElementById('enf-regime-repas').value='';document.getElementById('enf-repas-base').value='';document.getElementById('enf-gouter-base').value='';document.getElementById('enf-type-couche').value='couche';enfSyncTailleCouche('');enfSyncGroupe();document.getElementById('modal-enfant-wrap').classList.add('open');}
async function editEnfant(id){await enfRelire(id);const e=cacheEnfants.find(x=>String(x.id)===String(id));if(!e)return;editingEnfantId=e.id;document.getElementById('modal-enfant-title').textContent='Modifier '+(e.prenom||'')+' '+(e.nom||'');document.getElementById('enf-btn-save').innerHTML='<i class="ti ti-check"></i> Enregistrer';document.getElementById('enf-btn-delete').style.display='';document.getElementById('enf-avert-provisoire').style.display=e.naissance_provisoire?'':'none';enfFillCreches(e.creche_id);document.getElementById('enf-prenom').value=e.prenom||'';document.getElementById('enf-nom').value=e.nom||'';document.getElementById('enf-dob').value=e.dob||'';document.getElementById('enf-date-sortie').value=e.date_sortie||'';document.getElementById('enf-allergies').value=e.allergies||'';document.getElementById('enf-regime-repas').value=e.regime_repas||'';document.getElementById('enf-repas-base').value=e.repas_base||'';document.getElementById('enf-gouter-base').value=e.gouter_base||'';document.getElementById('enf-type-couche').value=e.type_couche||'couche';enfSyncTailleCouche(e.taille_couche||'');enfSyncGroupe();document.getElementById('modal-enfant-wrap').classList.add('open');}
/* Écriture d'une fiche enfant tolérante aux colonnes optionnelles absentes.
   `repas_base` et `gouter_base` sont ajoutées par des migrations SQL distinctes :
   si l'une manque, Postgres nomme la colonne fautive et on la retire du payload
   avant de réessayer, plutôt que de refuser d'enregistrer toute la fiche. On ne
   retire que celle qui est signalée — supprimer les deux ferait perdre en silence
   un réglage pourtant enregistrable. */
async function enfEcritureTolerante(row,id){
  const absentes=[];
  for(let essai=0;essai<3;essai++){
    const r=id?await dbUpdate('enfants',id,row):await dbInsert('enfants',row);
    if(r)return{res:r,absentes:absentes};
    const err=window._lastDbError||'';
    const col=/gouter_base/i.test(err)?'gouter_base':(/repas_base/i.test(err)?'repas_base':(/naissance_provisoire/i.test(err)?'naissance_provisoire':(/type_couche/i.test(err)?'type_couche':(/taille_couche/i.test(err)?'taille_couche':null))));
    if(!col||!(col in row))return{res:null,absentes:absentes};
    delete row[col];absentes.push(col);
  }
  return{res:null,absentes:absentes};
}
function enfAvertirColonnes(absentes){
  if(!absentes.length)return;
  const libelles={repas_base:'type de repas',gouter_base:'choix du goûter',naissance_provisoire:'l\'avertissement de date provisoire',taille_couche:'la taille de couche',type_couche:'le type de couche'};
  const txt=absentes.map(function(c){return libelles[c]||c;}).join(' et ');
  setTimeout(function(){showBanner('Fiche enregistrée, mais le '+txt+' n’a pas pu l’être : colonne absente de la table enfants (migration SQL à exécuter).','error');},2500);
}

async function saveEnfant(){
  const prenom=document.getElementById('enf-prenom').value.trim();
  if(!prenom){alert('Prénom requis.');return;}
  const row={
    prenom,
    nom:document.getElementById('enf-nom').value.trim(),
    dob:document.getElementById('enf-dob').value||null,
    groupe:groupeFromDob(document.getElementById('enf-dob').value),
    creche_id:document.getElementById('enf-creche').value,
    date_sortie:document.getElementById('enf-date-sortie').value||null,
    allergies:document.getElementById('enf-allergies').value.trim(),
    regime_repas:document.getElementById('enf-regime-repas').value||null,
    repas_base:document.getElementById('enf-repas-base').value||null,
    gouter_base:document.getElementById('enf-gouter-base').value||null,
    taille_couche:document.getElementById('enf-taille-couche').value||null,
    type_couche:document.getElementById('enf-type-couche').value||'couche',
    // Enregistrer la fiche vaut confirmation de la date de naissance :
    // l'avertissement « terme prévu » ne doit pas survivre à une correction.
    naissance_provisoire:false
  };
  if(editingEnfantId){
    const out=await enfEcritureTolerante(row,editingEnfantId);
    if(!out.res){showBanner('Erreur lors de la modification.','error');return;}
    enfAvertirColonnes(out.absentes);
    const e=cacheEnfants.find(x=>x.id===editingEnfantId);
    if(e)Object.assign(e,row);
    closeModal('modal-enfant-wrap');
    showBanner(prenom+' modifié(e) ✅');
    renderPresence();
    if(document.getElementById('modal-enf-fiche-wrap')?.classList.contains('open')){
      document.getElementById('enf-fiche-title').innerHTML='<i class="ti ti-mood-kid"></i> '+escHtml((row.prenom||'')+' '+(row.nom||''));
      enfRenderIdentite();
    }
    if(typeof enfRender==='function')enfRender();
    if(typeof vacRender==='function'&&document.getElementById('main-vaccinations')?.classList.contains('active'))vacRender();
    return;
  }
  const out=await enfEcritureTolerante(row,null);
  if(!out.res){showBanner('Erreur lors de l’ajout.','error');return;}
  enfAvertirColonnes(out.absentes);
  cacheEnfants.push(out.res);
  closeModal('modal-enfant-wrap');
  showBanner(prenom+' ajouté(e) !');
  renderPresence();
}

async function deleteEnfant(){if(!editingEnfantId)return;const e=cacheEnfants.find(x=>x.id===editingEnfantId);if(!confirm('Supprimer définitivement '+(e?.prenom||'')+' '+(e?.nom||'')+' ?\n\nAttention : les présences liées ne seront plus rattachées.'))return;const ok=await dbDelete('enfants',editingEnfantId);if(ok){cacheEnfants=cacheEnfants.filter(x=>x.id!==editingEnfantId);closeModal('modal-enfant-wrap');closeModal('modal-enf-fiche-wrap');showBanner('Enfant supprimé.');renderPresence();if(typeof enfRender==='function')enfRender();}else showBanner('Erreur lors de la suppression'+(window._lastDbError?' : '+window._lastDbError:'.'),'error');}

// ── IMPORT PRÉSENCES DEPUIS PLANNING PDF (Gantt) ──
const IP_MONTHS={janvier:1,février:2,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,aout:8,septembre:9,octobre:10,novembre:11,décembre:12,decembre:12};
let _importPresData=null;
/* Journal de lecture du dernier PDF importe : chaque page ecartee (date illisible,
   section Enfants absente) y laisse une ligne, affichee dans l'ecran d'apercu. Sans
   lui, une page ignoree ne se voyait nulle part et la feuille de presence restait
   vide sans explication. */
let _ipDiag=[];
let _ipReplace=true;
let _ipForceCreche=false;
/* Un Gantt liste TOUS les enfants inscrits de la crèche, y compris ceux qui ne
   viennent pas ce jour-là : leur ligne est simplement vide. Sans la règle
   ci-dessous, un enfant sans barre tombait dans le repli « pas d'horaires lus »
   et était enregistré présent matin ET après-midi — une absence transformée en
   journée complète, y compris sur le bon traiteur.

   On ne peut pas pour autant décréter absent tout enfant sans créneau : si la
   lecture des barres échoue en bloc (PDF illisible), personne n'en a, et il faut
   alors conserver l'ancien comportement plutôt que de vider la semaine. D'où le
   critère : la lecture n'est réputée fiable sur une page que si au moins un
   enfant y a un créneau. Dans ce cas seulement, l'absence de barre vaut absence. */
function ipHorairesFiables(pg){
  const cr=pg.creneaux||{};
  return Object.keys(cr).some(function(k){const c=cr[k];return c&&(c.hdebut||c.hfin);});
}
function ipEstAbsentSurPage(pg,nom){
  if(!ipHorairesFiables(pg))return false;
  const c=(pg.creneaux||{})[nom];
  return !(c&&(c.hdebut||c.hfin));
}
window.ipHorairesFiables=ipHorairesFiables;window.ipEstAbsentSurPage=ipEstAbsentSurPage;

function ipNormName(s){return(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s-]/g,'').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').trim();}
function ipCleanName(s){return(s||'').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').trim();}
function ipIsFirstnameToken(tok){return tok&&/^[A-ZÀ-Ÿ]/.test(tok)&&/[a-zà-ÿ]/.test(tok);}

async function handlePresenceImport(input){
  const file=input.files&&input.files[0];input.value='';if(!file)return;
  if(typeof pdfjsLib==='undefined'){alert('Bibliothèque PDF non chargée.');return;}
  const crecheId=getPresenceCrecheId();
  if(!crecheId){alert('Sélectionnez une crèche dans la feuille de présence avant d’importer.');return;}
  showBanner('Lecture du PDF en cours…');
  let pages;
  _ipDiag=[];
  try{pages=ipDedoublonnerPages(await ipParsePdf(file),_ipDiag);}catch(e){console.error('[ImportPresence]',e);showBanner('Impossible de lire ce PDF.','error');return;}
  if(!pages.length){
    console.warn('[ImportPresence] pages ignorées',_ipDiag);
    showBanner(_ipDiag.length?('Aucun planning exploitable : '+_ipDiag[0]):'Aucun planning détecté dans ce PDF.','error');
    return;
  }
  showBanner('Chargement des enfants…');
  const{data:freshEnf,error:enfErr}=await sb.from('enfants').select('*');
  if(enfErr){console.error('[ImportPresence] enfants',enfErr);showBanner('Impossible de charger les enfants.','error');return;}
  const allEnfants=freshEnf||[];
  if(!cacheEnfants.length&&allEnfants.length)cacheEnfants.push(...allEnfants);
  const enfCreche=allEnfants.filter(e=>e.creche_id===crecheId);
  const byFull={},byFirst={};
  enfCreche.forEach(e=>{
    const full=ipNormName((e.prenom||'')+' '+(e.nom||''));byFull[full]=e;
    const f=ipNormName(e.prenom||'');(byFirst[f]=byFirst[f]||[]).push(e);
  });
  const allNamesInPdf=[...new Set(pages.flatMap(pg=>pg.names))];
  const nameMap={};
  allNamesInPdf.forEach(nm=>{
    const norm=ipNormName(nm);
    let e=byFull[norm];
    if(!e){const parts=norm.split(' ');const cand=byFirst[parts[0]];if(cand&&cand.length===1)e=cand[0];}
    if(!e){e=enfCreche.find(x=>{const xn=ipNormName((x.prenom||'')+' '+(x.nom||''));return norm.startsWith(xn)||xn.startsWith(norm);});}
    nameMap[nm]=e?{enfant:e,isNew:false}:{enfant:null,isNew:true};
  });
  pages.forEach(pg=>{
    pg.matched=[];pg.toCreate=[];
    pg.names.forEach(nm=>{const r=nameMap[nm];if(r.enfant)pg.matched.push({name:nm,enfant:r.enfant});else pg.toCreate.push(nm);});
  });
  // Horaires (lecture des barres) — non bloquant : un échec laisse l'import des présences intact.
  showBanner('Lecture des horaires…');
  let epWarn=[];
  try{
    const eh=await epParsePdf(file);
    epWarn=eh.warnings||[];
    pages.forEach(pg=>{
      const parNom=(eh.parDate||{})[pg.date]||{};
      pg.creneaux={};
      pg.names.forEach(nm=>{const cr=parNom[ipNormName(nm)];if(cr)pg.creneaux[nm]=cr;});
    });
  }catch(e){console.warn('[ImportPresence] horaires',e);pages.forEach(pg=>{pg.creneaux={};});}
  const creche=cacheCreches.find(c=>c.id===crecheId);
  const titles=[...new Set(pages.map(pg=>pg.title||'').filter(Boolean))];
  const crecheNorm=ipNormName(creche?creche.name:'');
  const crecheMatch=(!titles.length||!crecheNorm)?true:titles.every(t=>ipNormName(t).indexOf(crecheNorm)>=0);
  _ipForceCreche=false;
  // Contrats déjà enregistrés pour les enfants de la crèche (pour l'écran d'aperçu).
  const contratsParEnfant={};
  try{
    const ids=enfCreche.map(e=>e.id);
    if(ids.length){
      const{data:cts}=await sb.from('enfants_contrats').select('*').in('enfant_id',ids);
      (cts||[]).forEach(c=>{
        const k=String(c.enfant_id);
        if(!contratsParEnfant[k]||(c.date_debut||'')>(contratsParEnfant[k].date_debut||''))contratsParEnfant[k]=c;
      });
    }
  }catch(e){console.warn('[ImportPresence] contrats',e);}
  _ipContratCreer=true;_ipContratMaj=false;
  _importPresData={crecheId,pages,nameMap,crecheEnfantIds:enfCreche.map(e=>e.id),titles,crecheMatch,
    contratsParEnfant,propositions:ipProposerContrats(pages),epWarn,diag:_ipDiag.slice()};
  renderImportPreview();
  document.getElementById('modal-import-presence-wrap').classList.add('open');
}

/* Date d'une page de planning (« Planning du lundi 31 aout 2026 »).
   Deux pieges corriges ici :
   - le libelle peut etre coupe en plusieurs fragments de texte par pdf.js (le titre
     de la creche juste au-dessus, un retour a la ligne) : on cherche donc sur le
     texte aplati, pas ligne par ligne ;
   - le mois etait cherche tel quel dans une table indexee par cle accentuee
     (« aout »). pdf.js renvoie parfois l'accent en forme decomposee (u + accent
     combinant) : la cle ne correspondait pas, la date restait nulle et TOUTE la page
     etait ignoree en silence. On resout desormais le mois sans accent ni casse. */
function ipDateDePage(texte){
  const flat=String(texte||'').normalize('NFC').replace(/\s+/g,' ');
  const m=flat.match(/Planning\s+du\s+\S+\s+(\d{1,2})(?:er)?\s+([^\s\d]+)\s+(\d{4})/i);
  if(!m)return null;
  const jour=parseInt(m[1],10),annee=parseInt(m[3],10);
  const mi=ipResolveAnyMonth(ipNormStr(m[2]).replace(/\.$/,''));
  if(mi===null||isNaN(jour)||isNaN(annee))return null;
  return ipToISO(annee,mi,jour);
}

async function ipParsePdf(file){
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const out=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);const tc=await page.getTextContent();
    const rowsMap={};
    tc.items.forEach(it=>{const str=(it.str||'').trim();if(!str)return;const x=it.transform[4],y=Math.round(it.transform[5]);(rowsMap[y]=rowsMap[y]||[]).push({x,str});});
    const ys=Object.keys(rowsMap).map(Number).sort((a,b)=>b-a);
    const lines=ys.map(y=>({y,toks:rowsMap[y].sort((a,b)=>a.x-b.x).map(o=>o.str),minx:Math.min(...rowsMap[y].map(o=>o.x))}));
    const fullText=lines.map(l=>l.toks.join(' ')).join('\n');
    const date=ipDateDePage(fullText);
    let iEnf=-1,iSal=-1;
    // La section « Enfants » s'arrête soit à « Salariés » (page suivante), soit à une ligne
    // « Totaux » (récapitulatif quotidien des effectifs) : sans ce second cas, « Totaux »
    // ressemble à un prénom (majuscule + minuscules) et les chiffres qui suivent sont lus
    // comme la suite du nom, créant de faux enfants du type « Totaux 1 7 10 9 7 6 1 ».
    for(let i=0;i<lines.length;i++){const f=lines[i].toks[0];if(iEnf<0&&spEstEnfants(f)&&lines[i].minx<70)iEnf=i;else if(iEnf>=0&&iSal<0&&lines[i].minx<70&&(spEstSalaries(f)||spEstTotaux(f))){iSal=i;break;}}
    if(iEnf<0){_ipDiag.push('Page '+p+' : section \u00ab Enfants \u00bb introuvable \u2014 page ignor\u00e9e.');continue;}
    const names=[];let cur=null;
    for(let i=iEnf+1;i<(iSal>=0?iSal:lines.length);i++){const toks=lines[i].toks;if(!toks.length)continue;if(/^totaux$/i.test(toks[0]))continue;if(ipIsFirstnameToken(toks[0])){if(cur)names.push(cur);cur=toks.join(' ');}else if(cur)cur+=' '+toks.join(' ');}
    if(cur)names.push(cur);
    const cleaned=[...new Set(names.map(ipCleanName).filter(Boolean))];
    const tm=fullText.match(/^(.*KOALA\s*KIDS.*)$/im);
    const title=tm?tm[1].trim():'';
    if(date&&cleaned.length)out.push({date,names:cleaned,title});
    else if(!date&&cleaned.length)_ipDiag.push('Page '+p+' : date du planning illisible ('+cleaned.length+' enfant(s) pourtant detecte(s)) - page ignoree.');
    else if(date&&!cleaned.length)_ipDiag.push('Page '+p+' ('+date+') : aucun nom d\u2019enfant lu - section \u00ab Enfants \u00bb introuvable dans ce PDF.');
  }
  return out;
}

function ipFmtDate(iso){const d=new Date(iso+'T00:00:00');return d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});}

/* ══ CONTRATS PROPOSÉS PAR L'IMPORT ════════════════════════════════════════
   Le PDF donne, pour chaque enfant et chaque jour, une amplitude horaire. En
   la cumulant sur toutes les dates importées on obtient un contrat d'accueil
   plausible : jours = jours où l'enfant apparaît, heure_debut = la plus
   précoce observée, heure_fin = la plus tardive. C'est une PROPOSITION : elle
   ne vaut que pour les jours réellement présents dans le PDF, d'où le rappel
   du nombre de dates lues dans l'écran d'aperçu. */
let _ipContratCreer=true,_ipContratMaj=false;

function ipJourSemaine(iso){const d=new Date(iso+'T00:00:00').getDay();return d===0?7:d;}
function ipHhmmVersHeure(s){return s?String(s).slice(0,5):'';}
function ipFmtH(s){return s?String(s).slice(0,5).replace(':','h'):'—';}

/* pages → { nom PDF : {jours:[…], heure_debut, heure_fin, dates:[…]} } */
function ipProposerContrats(pages){
  const acc={};
  (pages||[]).forEach(pg=>{
    const j=ipJourSemaine(pg.date);
    const noms=[...pg.matched.map(m=>m.name),...pg.toCreate];
    noms.forEach(nm=>{
      const cr=(pg.creneaux||{})[nm];
      if(!cr||!cr.hdebut||!cr.hfin)return;
      const e=acc[nm]||(acc[nm]={jours:new Set(),dates:new Set(),deb:null,fin:null});
      e.jours.add(j);e.dates.add(pg.date);
      if(e.deb===null||spMin(cr.hdebut)<spMin(e.deb))e.deb=cr.hdebut;
      if(e.fin===null||spMin(cr.hfin)>spMin(e.fin))e.fin=cr.hfin;
    });
  });
  const out={};
  Object.keys(acc).forEach(nm=>{
    const e=acc[nm];
    out[nm]={jours:[...e.jours].sort((a,b)=>a-b),dates:[...e.dates].sort(),
             heure_debut:e.deb,heure_fin:e.fin};
  });
  return out;
}

/* Un contrat existant diffère-t-il de la proposition ? */
function ipContratDiffere(ct,prop){
  if(!ct)return true;
  const a=ctParseJours(ct.jours).sort((x,y)=>x-y).join(',');
  const b=(prop.jours||[]).join(',');
  return a!==b
    || ipHhmmVersHeure(ct.heure_debut)!==ipHhmmVersHeure(prop.heure_debut)
    || ipHhmmVersHeure(ct.heure_fin)!==ipHhmmVersHeure(prop.heure_fin);
}

/* Une même journée lue deux fois — c'est le cas dès qu'on sélectionne à la fois
   « Planning presences 21 septembre.pdf » et sa copie « … (1).pdf », ou deux
   exports qui se chevauchent — produisait deux lignes identiques dans le lot
   inséré. La contrainte d'unicité (enfant, date, créneau) faisait alors échouer
   l'INSERT ENTIER : import annoncé en erreur, aucune présence enregistrée, alors
   que la lecture du PDF était parfaite. Le lecteur des salariés dédoublonne déjà
   ses journées (`vues`) ; on fait la même chose ici.
   Renvoie les pages conservées et alimente _ipDiag pour que l'aperçu le dise. */
function ipDedoublonnerPages(pages,diag){
  const vues=new Map();const gardees=[];
  (pages||[]).forEach(pg=>{
    if(vues.has(pg.date)){
      const n=vues.get(pg.date)+1;vues.set(pg.date,n);
      if(n===2&&diag)diag.push(ipFmtDate(pg.date)+' figure dans plusieurs fichiers : seule la première lecture est conservée.');
      return;
    }
    vues.set(pg.date,1);gardees.push(pg);
  });
  return gardees;
}

/* Dernier filet : même après dédoublonnage des pages, deux noms du PDF peuvent
   pointer sur la même fiche enfant (nom coupé sur deux lignes, homonyme). On
   n'envoie donc jamais deux fois le même triplet (enfant, date, créneau). */
function ipDedoublonnerLignes(rows){
  const vu=new Set();
  return (rows||[]).filter(r=>{
    const k=r.enfant_id+'_'+r.presence_date+'_'+r.slot;
    if(vu.has(k))return false;
    vu.add(k);return true;
  });
}

/* Les colonnes horaires de `presences` peuvent ne pas exister encore (migration
   SQL non passée) : on retente alors sans elles plutôt que de perdre l'import. */
async function ipInsertPresences(rows){
  let{error}=await sb.from('presences').insert(rows);
  if(error&&/heure_debut|heure_fin|column/i.test(error.message||'')){
    const nus=rows.map(r=>({enfant_id:r.enfant_id,presence_date:r.presence_date,slot:r.slot,status:r.status}));
    const r2=await sb.from('presences').insert(nus);
    return{error:r2.error,degrade:!r2.error};
  }
  return{error,degrade:false};
}

/* Pages du PDF ecartees a la lecture : affichees dans l'apercu des deux imports.
   Une page ignoree (date illisible, section Enfants absente) expliquait jusqu'ici,
   sans le dire, une feuille de presence restee vide apres un import « reussi ». */
function ipHtmlDiag(diag){
  if(!diag||!diag.length)return '';
  return '<div style="background:var(--amber-lt);border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:var(--orange)">'
    +'<strong>⚠ '+diag.length+' page(s) du PDF n’ont pas pu être lues</strong><br>'
    +'<span style="font-size:11.5px">'+diag.map(escHtml).join('<br>')+'</span></div>';
}

/* Bloc « Contrats d'accueil » de l'écran d'aperçu, partagé par les deux imports. */
function ipHtmlContrats(propositions,nameMap,contratsParEnfant,warnings,nbJours){
  const noms=Object.keys(propositions||{}).sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
  let html='<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px">'
    +'<div style="font-weight:700;color:var(--koala);font-size:13px;margin-bottom:8px"><i class="ti ti-file-text"></i> Contrats d’accueil (fiche enfant)</div>';
  if(!noms.length){
    html+='<div style="font-size:12px;color:var(--muted)">Aucune amplitude horaire n’a pu être lue dans ce PDF : les fiches enfant ne seront pas complétées.</div>';
    if((warnings||[]).length)html+='<div style="font-size:11.5px;color:var(--orange);margin-top:6px">'+warnings.map(escHtml).join('<br>')+'</div>';
    return html+'</div>';
  }
  let nbSans=0,nbDiff=0;
  const lignes=noms.map(nm=>{
    const p=propositions[nm];
    const enf=(nameMap[nm]||{}).enfant;
    const ct=enf?(contratsParEnfant||{})[String(enf.id)]:null;
    let etat,couleur;
    if(!ct){nbSans++;etat='nouveau contrat';couleur='#2e7d32';}
    else if(ipContratDiffere(ct,p)){nbDiff++;etat='diffère du contrat existant';couleur='#e65100';}
    else{etat='identique à l’existant';couleur='var(--muted)';}
    const horaires=ipFmtH(p.heure_debut)+' – '+ipFmtH(p.heure_fin);
    const jours=p.jours.map(n=>(CT_JOURS.find(x=>x[0]===n)||[n,'?'])[1].slice(0,3)).join(' ');
    let det='';
    if(ct&&ipContratDiffere(ct,p)){
      det='<div style="font-size:11px;color:var(--muted);margin-left:2px">actuel : '+escHtml(ctJoursLabel(ct.jours))+' · '+escHtml(ipFmtH(ct.heure_debut)+' – '+ipFmtH(ct.heure_fin))+'</div>';
    }
    return '<div style="padding:5px 0;border-top:1px solid #f0eef8">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px">'
      +'<span style="font-weight:600;color:var(--koala-dark)">'+escHtml(nm)+'</span>'
      +'<span style="color:'+couleur+';font-size:11px;font-weight:600">'+etat+'</span></div>'
      +'<div style="font-size:11.5px;color:var(--muted)">'+escHtml(jours)+' · '+escHtml(horaires)+'</div>'+det+'</div>';
  }).join('');
  html+='<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">Amplitudes cumulées sur les <strong>'+(nbJours||0)+' journée(s)</strong> lues dans le PDF. Un contrat bâti sur une seule semaine ne reflète pas forcément l’accueil réel du reste de l’année.</div>';
  html+='<label style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;cursor:pointer;margin-bottom:5px"><input type="checkbox" onchange="_ipContratCreer=this.checked"'+(_ipContratCreer?' checked':'')+' style="margin-top:2px"/><span>Créer le contrat des <strong>'+nbSans+' enfant(s) sans contrat</strong></span></label>';
  html+='<label style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;cursor:pointer"><input type="checkbox" onchange="_ipContratMaj=this.checked"'+(_ipContratMaj?' checked':'')+' style="margin-top:2px"/><span>Mettre à jour les <strong>'+nbDiff+' contrat(s) existant(s)</strong> qui diffèrent du PDF</span></label>';
  html+='<div style="margin-top:8px">'+lignes+'</div>';
  if((warnings||[]).length)html+='<div style="font-size:11.5px;color:var(--orange);margin-top:8px">'+warnings.map(escHtml).join('<br>')+'</div>';
  return html+'</div>';
}

/* Écrit les contrats retenus dans l'écran d'aperçu. Renvoie {crees, majs}. */
async function ipAppliquerContrats(propositions,nameMap,contratsParEnfant){
  let crees=0,majs=0;
  for(const nm of Object.keys(propositions||{})){
    const prop=propositions[nm];
    const enf=(nameMap[nm]||{}).enfant;
    if(!enf||!prop.heure_debut||!prop.heure_fin)continue;
    const ct=(contratsParEnfant||{})[String(enf.id)];
    const row={enfant_id:enf.id,jours:prop.jours,
      heure_debut:prop.heure_debut,heure_fin:prop.heure_fin};
    if(!ct){
      if(!_ipContratCreer)continue;
      row.date_debut=prop.dates[0];
      row.notes='Créé automatiquement depuis l’import du planning PDF ('+prop.dates.length+' jour(s) lu(s) : '+prop.dates.map(d=>d.split('-').reverse().slice(0,2).join('/')).join(', ')+').';
      if(await dbInsert('enfants_contrats',row))crees++;
    }else if(_ipContratMaj&&ipContratDiffere(ct,prop)){
      if(await dbUpdate('enfants_contrats',ct.id,row))majs++;
    }
  }
  return{crees,majs};
}

function renderImportPreview(){
  const body=document.getElementById('import-presence-body');
  if(!_importPresData){body.innerHTML='';return;}
  const creche=cacheCreches.find(c=>c.id===_importPresData.crecheId);
  const toCreateUnique=[...new Set(_importPresData.pages.flatMap(pg=>pg.toCreate))];
  let totalPres=0;const totalNew=toCreateUnique.length;
  let html='<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Crèche : <strong style="color:var(--koala)">'+(creche?creche.name:'—')+'</strong>'+(_importPresData.titles&&_importPresData.titles.length?' — PDF : <strong style="color:var(--koala)">'+escHtml(_importPresData.titles.join(' / '))+'</strong>':'')+'</div>';
  if(!_importPresData.crecheMatch){
    html+='<div style="background:#fdecea;border-left:4px solid var(--red);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#8b1a1a">';
    html+='<strong>⚠ La crèche ne correspond pas.</strong><br>Le PDF concerne <strong>'+escHtml(_importPresData.titles.join(' / '))+'</strong> alors que la feuille de présence est positionnée sur <strong>'+escHtml(creche?creche.name:'—')+'</strong>.<br>';
    html+='<label style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer"><input type="checkbox" id="ip-force-creche" onchange="_ipForceCreche=this.checked;renderImportPreview()"'+(_ipForceCreche?' checked':'')+'/> Importer malgré tout</label></div>';
  }
  html+='<label style="display:flex;align-items:flex-start;gap:8px;background:#EEEDF8;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;color:var(--koala);cursor:pointer"><input type="checkbox" id="ip-replace" onchange="_ipReplace=this.checked"'+(_ipReplace?' checked':'')+' style="margin-top:2px"/><span><strong>Remplacer les présences existantes pour ces dates</strong><br><span style="font-weight:400;font-size:11.5px">Le PDF fait foi : les présences d\u00e9j\u00e0 enregistr\u00e9es pour cette cr\u00e8che aux dates du planning seront effac\u00e9es avant l\u2019import. D\u00e9cochez pour cumuler avec l\u2019existant.</span></span></label>';
  if(totalNew){
    html+='<div style="background:#fff8e1;border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px">';
    html+='<strong>'+totalNew+' nouvel enfant'+(totalNew>1?'s':'')+' seront créés</strong> dans <strong>'+(creche?creche.name:'la crèche')+'</strong><br>';
    html+='<span style="color:var(--muted);font-size:11.5px">'+toCreateUnique.map(escHtml).join(', ')+'</span></div>';
  }
  html+=ipHtmlDiag(_importPresData.diag);
  html+=ipHtmlContrats(_importPresData.propositions,_importPresData.nameMap,_importPresData.contratsParEnfant,_importPresData.epWarn,_importPresData.pages.length);
  _importPresData.pages.forEach(pg=>{
    /* Les enfants listés sans plage horaire sont des absents du jour : ils sont
       affichés en gris, décomptés du total, et n'entreront pas en base. */
    const absentsPg=pg.matched.filter(mt=>ipEstAbsentSurPage(pg,mt.name));
    const presentsPg=pg.matched.filter(mt=>!ipEstAbsentSurPage(pg,mt.name));
    const nb=presentsPg.length+pg.toCreate.length;totalPres+=nb;
    html+='<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px">';
    html+='<div style="font-weight:700;color:var(--koala);text-transform:capitalize;margin-bottom:6px">'+ipFmtDate(pg.date)+' <span style="font-weight:400;color:var(--muted);font-size:11px">'+nb+' enfant'+(nb>1?'s':'')
      +(absentsPg.length?' · '+absentsPg.length+' absent'+(absentsPg.length>1?'s':''):'')+'</span></div>';
    const tags=[
      ...presentsPg.map(mt=>'<span style="background:#e8f5e9;color:#2e7d32;border-radius:6px;padding:2px 8px;font-size:11.5px">✓ '+escHtml(mt.enfant.prenom+' '+mt.enfant.nom)+'</span>'),
      ...pg.toCreate.map(nm=>'<span style="background:#fff3e0;color:#e65100;border-radius:6px;padding:2px 8px;font-size:11.5px">+ '+escHtml(nm)+'</span>'),
      ...absentsPg.map(mt=>'<span style="background:#f1f1f4;color:#777;border-radius:6px;padding:2px 8px;font-size:11.5px" title="Aucune plage horaire sur le planning : non enregistré">— '+escHtml(mt.enfant.prenom+' '+mt.enfant.nom)+'</span>')
    ];
    html+='<div style="display:flex;flex-wrap:wrap;gap:5px">'+tags.join('')+'</div></div>';
  });
  body.innerHTML=html;
  const btn=document.getElementById('btn-confirm-import-presence');
  btn.disabled=!_importPresData.crecheMatch&&!_ipForceCreche;
  btn.innerHTML='<i class="ti ti-check"></i> Confirmer — '+totalPres+' présence'+(totalPres>1?'s':'')+(totalNew?' + '+totalNew+' création'+(totalNew>1?'s':''):'');
}

async function confirmPresenceImport(){
  if(!_importPresData)return;
  const btn=document.getElementById('btn-confirm-import-presence');btn.disabled=true;
  const{crecheId,pages,nameMap,crecheEnfantIds}=_importPresData;
  showBanner('Création des nouveaux enfants…');
  // 1) Créer les enfants manquants
  const toCreateNames=[...new Set(pages.flatMap(pg=>pg.toCreate))];
  for(const nm of toCreateNames){
    const parts=nm.trim().split(' ');
    const prenom=parts[0];const nom=parts.slice(1).join(' ');
    const{data:saved,error}=await sb.from('enfants').insert({prenom,nom,creche_id:crecheId}).select().single();
    if(saved){
      cacheEnfants.push(saved);
      nameMap[nm]={enfant:saved,isNew:false};
      pages.forEach(pg=>{
        const idx=pg.toCreate.indexOf(nm);
        if(idx>=0){pg.toCreate.splice(idx,1);pg.matched.push({name:nm,enfant:saved});}
      });
    }else{console.error('[ImportPresence] create enfant',nm,error);}
  }
  // 2) Enregistrer les présences M + A, avec l'amplitude horaire lue sur la barre.
  //    Quand l'horaire est connu, un enfant parti avant 13h n'est plus marqué
  //    présent l'après-midi (et inversement) : le PDF fait foi jusqu'au créneau.
  showBanner('Enregistrement des présences…');
  const wanted=[];
  const ignores=[];
  pages.forEach(pg=>{
    pg.matched.forEach(mt=>{
      if(ipEstAbsentSurPage(pg,mt.name)){
        ignores.push({date:pg.date,nom:mt.enfant.prenom+' '+mt.enfant.nom});
        return;
      }
      const cr=(pg.creneaux||{})[mt.name];
      const hd=cr&&cr.hdebut?cr.hdebut:null,hf=cr&&cr.hfin?cr.hfin:null;
      const hasM=!cr||!hd||spMin(hd)<13*60;
      const hasA=!cr||!hf||spMin(hf)>13*60;
      if(hasM)wanted.push({enfant_id:mt.enfant.id,presence_date:pg.date,slot:'M',status:'present',heure_debut:hd,heure_fin:hf});
      if(hasA)wanted.push({enfant_id:mt.enfant.id,presence_date:pg.date,slot:'A',status:'present',heure_debut:hd,heure_fin:hf});
    });
  });
  if(!wanted.length){closeModal('modal-import-presence-wrap');_importPresData=null;
    showBanner(ignores.length?('Aucune présence à enregistrer : les '+ignores.length+' enfant(s) lus n’ont aucune plage horaire sur le planning.')
                             :'Aucune présence à enregistrer.','error');return;}
  const dates=[...new Set(wanted.map(w=>w.presence_date))];
  const ids=[...new Set(wanted.map(w=>w.enfant_id))];
  if(_ipReplace){
    showBanner('Nettoyage des pr\u00e9sences existantes\u2026');
    const purgeIds=[...new Set([...(crecheEnfantIds||[]),...ids])];
    const{error:delErr}=await sb.from('presences').delete().in('presence_date',dates).in('enfant_id',purgeIds);
    if(delErr){console.error('[ImportPresence] purge',delErr);showBanner('Impossible d\u2019effacer les pr\u00e9sences existantes.','error');btn.disabled=false;return;}
  }
  const{data:existing}=await sb.from('presences').select('id,enfant_id,presence_date,slot').in('presence_date',dates).in('enfant_id',ids);
  const exSet=new Set((existing||[]).map(e=>e.enfant_id+'_'+e.presence_date+'_'+e.slot));
  const toInsert=ipDedoublonnerLignes(wanted.filter(w=>!exSet.has(w.enfant_id+'_'+w.presence_date+'_'+w.slot)));
  let ok=true,degrade=false;
  let _errMsg='';
  if(toInsert.length){const r=await ipInsertPresences(toInsert);if(r.error){console.error('[ImportPresence] insert presences',r.error);_errMsg=r.error.message||'';ok=false;}degrade=r.degrade;}
  // 3) Contrats d'accueil (fiche enfant) selon les cases cochées dans l'aperçu.
  let ctRes={crees:0,majs:0};
  if(ok&&(_ipContratCreer||_ipContratMaj)){
    showBanner('Mise à jour des fiches enfant…');
    try{ctRes=await ipAppliquerContrats(_importPresData.propositions,nameMap,_importPresData.contratsParEnfant);}
    catch(e){console.warn('[ImportPresence] contrats',e);}
  }
  closeModal('modal-import-presence-wrap');_importPresData=null;
  if(ok){
    const bouts=[];
    if(toCreateNames.length)bouts.push(toCreateNames.length+' enfant'+(toCreateNames.length>1?'s':'')+' créé'+(toCreateNames.length>1?'s':''));
    bouts.push(toInsert.length+' présence'+(toInsert.length>1?'s':'')+' enregistrée'+(toInsert.length>1?'s':''));
    if(ctRes.crees)bouts.push(ctRes.crees+' contrat'+(ctRes.crees>1?'s':'')+' créé'+(ctRes.crees>1?'s':''));
    if(ctRes.majs)bouts.push(ctRes.majs+' contrat'+(ctRes.majs>1?'s':'')+' mis à jour');
    /* Les absences écartées sont annoncées : une ligne vide dans le Gantt est une
       information, pas un oubli, et la directrice technique doit pouvoir la vérifier. */
    if(ignores.length)bouts.push(ignores.length+' absence'+(ignores.length>1?'s':'')+' ignorée'+(ignores.length>1?'s':''));
    showBanner('Import terminé : '+bouts.join(', ')+' ✅');
    if(ignores.length)console.info('[ImportPresence] absents (aucune plage horaire) :',ignores);
    if(degrade)setTimeout(()=>showBanner('Horaires non enregistrés sur les présences : colonnes heure_debut / heure_fin absentes de la table presences.','error'),3500);
    renderPresence();
  }else showBanner('Erreur lors de l\u2019enregistrement des pr\u00e9sences'+(_errMsg?' : '+_errMsg:'')+'.','error');
}

// PLANNING (Supabase — voir renderPlanning plus bas, version active)
function changeWeek(d){weekOffset+=d;renderPlanning();}
function openWeekPicker(){
  const inp=document.getElementById('week-picker-input');
  if(!inp)return;
  inp.value=ipDateToLocalISO(weekStart());
  if(inp.showPicker)inp.showPicker();else inp.focus();
}
function pickWeekFromDate(dateStr){
  if(!dateStr)return;
  const picked=new Date(dateStr+'T00:00:00');
  const pDay=picked.getDay();
  const mondayPicked=new Date(picked);mondayPicked.setDate(picked.getDate()-(pDay===0?6:pDay-1));mondayPicked.setHours(0,0,0,0);
  const now=new Date();const nDay=now.getDay();
  const mondayNow=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(nDay===0?6:nDay-1));mondayNow.setHours(0,0,0,0);
  weekOffset=Math.round((mondayPicked-mondayNow)/(7*24*3600*1000));
  renderPlanning();
}
