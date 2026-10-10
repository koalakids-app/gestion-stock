
async function restaurerGrille(){
  if(!PLAN||!PLAN.length)return;
  const b=document.getElementById('btnResto');
  b.disabled=true;b.textContent='Restauration…';
  const h=document.getElementById('hSauv');
  let n=0;
  try{
    for(const p of PLAN){
      if(p.op==='insert'){
        const{error}=await sb.from(p.table).insert(p.row);
        if(error)throw error;
      }else{
        const row=Object.assign({},p.row,{updated_at:new Date().toISOString()});
        const{error}=await sb.from(p.table).update(row).eq('id',p.id);
        if(error)throw error;
      }
      n++;
    }
    closeOv('ovSauv');
    PLAN=null;
    await openTarifs(); // recharge la grille depuis la base
    h.style.color='var(--green)';
    h.textContent=n+' ligne'+(n>1?'s':'')+' restaurée'+(n>1?'s':'')+' à '
      +new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'.';
    toast('Grille restaurée ✅');
  }catch(e){
    console.error('[restaurerGrille]',e);
    b.disabled=false;b.innerHTML='<i class="ti ti-history"></i> Appliquer';
    const msg=e.code==='42501'?'Droits insuffisants sur la grille.':(e.message||'erreur inconnue');
    toast('Restauration interrompue après '+n+' ligne'+(n>1?'s':'')+' : '+msg,true);
  }
}

/* Liste de creches commune aux deux modales : une ligne peut valoir pour tout
   le reseau (creche_id null) ou pour un seul site. */
function optCreches(sel){
  document.getElementById(sel).innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
}

function openTarif(id){
  tarifId=id;
  const t=id?TARIFS.find(x=>String(x.id)===String(id)):null;
  document.getElementById('tarTitle').textContent=t?'Modifier le tarif':'Ajouter un tarif';
  document.getElementById('btnDelTar').style.display=t?'':'none';
  optCreches('tCreche');
  setVal('tLib',t?t.libelle:'');setVal('tDesc',t?t.description:'');
  setVal('tCreche',t?(t.creche_id||''):'');setVal('tMode',t?t.mode:'horaire');
  setVal('tMontant',t?t.montant:'');
  setVal('tMin',t&&t.heures_min!=null?t.heures_min:'');
  setVal('tMax',t&&t.heures_max!=null?t.heures_max:'');
  setVal('tOrdre',t?t.ordre:(TARIFS.length?Math.max(...TARIFS.map(x=>x.ordre))+10:10));
  setChk('tActif',t?t.actif:true);
  ['tMin','tMax','tMode'].forEach(i=>{document.getElementById(i).oninput=syncTar;document.getElementById(i).onchange=syncTar;});
  syncTar();
  openOv('ovTarif');
}
function syncTar(){
  const h=document.getElementById('tHint');
  if(val('tMode')!=='horaire'){h.textContent='Les fourchettes horaires ne s\'appliquent qu\'au mode « à l\'heure ».';return;}
  const a=num('tMin'),b=num('tMax');
  if(a!=null&&b!=null&&a>b){h.textContent='La borne basse dépasse la borne haute : la base refusera la ligne.';return;}
  h.textContent='S\'applique '+fourchette({heures_min:a,heures_max:b})+'. Laisser vide pour ne pas borner.';
}

async function saveTarif(){
  const lib=val('tLib');
  if(!lib){toast('Indiquez un libellé.',true);return;}
  const m=num('tMontant');
  if(m==null||isNaN(m)||m<0){toast('Le montant doit être un nombre positif.',true);return;}
  const a=num('tMin'),b=num('tMax');
  if(a!=null&&b!=null&&a>b){toast('La borne basse ne peut pas dépasser la borne haute.',true);return;}
  const horaire=val('tMode')==='horaire';
  const row={
    libelle:lib,description:val('tDesc'),
    creche_id:val('tCreche')||null,
    mode:val('tMode'),montant:m,
    // Une fourchette n'a de sens qu'au tarif horaire : la garder sur un forfait
    // mensuel laisserait une borne fantome qui fausserait la selection.
    heures_min:horaire?a:null,heures_max:horaire?b:null,
    actif:chk('tActif'),ordre:Number(val('tOrdre')||0)
  };
  const btn=document.getElementById('btnSaveTar');
  btn.disabled=true;
  try{
    if(tarifId){
      row.updated_at=new Date().toISOString();
      const{error}=await sb.from('tarifs').update(row).eq('id',tarifId);
      if(error)throw error;
      const i=TARIFS.findIndex(x=>String(x.id)===String(tarifId));
      if(i>=0)TARIFS[i]=Object.assign({},TARIFS[i],row);
      toast('Tarif enregistré ✅');
    }else{
      const{data,error}=await sb.from('tarifs').insert(row).select().single();
      if(error)throw error;
      TARIFS.push(data);
    toast('Tarif ajouté ✅');
    }
    TARIFS.sort((x,y)=>x.ordre-y.ordre);
    closeOv('ovTarif');renderTarifs();
  }catch(e){
    console.error('[saveTarif]',e);
    toast('Enregistrement impossible : '+(e.message||'erreur inconnue'),true);
  }finally{btn.disabled=false;}
}

async function delTarif(){
  if(!tarifId)return;
  const t=TARIFS.find(x=>String(x.id)===String(tarifId));
  if(!confirm('Supprimer « '+((t&&t.libelle)||'ce tarif')+' » ?\n\nLes devis déjà établis ne sont pas touchés : ils ont recopié leur montant.'))return;
  try{
    const{error}=await sb.from('tarifs').delete().eq('id',tarifId);
    if(error)throw error;
    TARIFS=TARIFS.filter(x=>String(x.id)!==String(tarifId));
    closeOv('ovTarif');renderTarifs();
    toast('Tarif supprimé.');
  }catch(e){
    console.error('[delTarif]',e);
    toast('Suppression impossible : '+(e.message||'erreur inconnue'),true);
  }
}

function openFrais(id){
  fraisId=id;
  const f=id?FRAIS.find(x=>String(x.id)===String(id)):null;
  document.getElementById('fraTitle').textContent=f?'Modifier le frais':'Ajouter un frais';
  document.getElementById('btnDelFra').style.display=f?'':'none';
  optCreches('xCreche');
  setVal('xLib',f?f.libelle:'');setVal('xDesc',f?f.description:'');
  // Par defaut la premiere option du menu, pour que ce qui est affiche soit ce
  // qui sera enregistre : « une seule fois » en valeur muette avait deja fait
  // sortir les frais d'entretien de la mensualite.
  setVal('xCreche',f?(f.creche_id||''):'');setVal('xType',f?f.type:'unitaire');
  setVal('xMontant',f?f.montant:'');
  setChk('xDeductible',f&&f.deductible_absence);
  setChk('xRed',f&&f.est_reduction);setChk('xDef',f&&f.par_defaut);
  setChk('xActif',f?f.actif:true);
  setVal('xOrdre',f?f.ordre:(FRAIS.length?Math.max(...FRAIS.map(x=>x.ordre))+10:10));
  syncRed();
  openOv('ovFrais');
}
/* Deux pieges a la saisie, expliques ici plutot que decouverts sur un devis :
   — le montant reste positif en base (contrainte frais_annexes_montant_ck),
     c'est est_reduction qui porte le signe ; « −100 » serait refuse ;
   — la periodicite decide si la ligne entre dans la mensualite ou non. Un
     frais journalier saisi en « une seule fois » sort du total mensuel et
     s'affiche pour son montant brut, ce qui ne se voit qu'au devis. */
const AIDE_TYPE={
  unitaire:'Multiplié par le nombre de jours d\'accueil, puis mensualisé sur les semaines facturées. Entre dans la mensualité.',
  mensuel:'Montant fixe ajouté à chaque mensualité.',
  annuel:'Facturé une fois par an, présenté hors mensualité.',
  unique:'Facturé une seule fois, à l\'inscription, présenté hors mensualité.'
};
function syncRed(){
  const t=val('xType')||'unitaire';
  document.getElementById('xHint').textContent=AIDE_TYPE[t]
    +(chk('xRed')?' Saisissez le montant en positif : il se soustraira du total.':'');
  // La déduction sur absence n'a de sens que sur un frais facturé par jour
  // d'accueil, et jamais sur une réduction : il n'y a rien à en déduire une
  // seconde fois.
  document.getElementById('wrapDeductible').style.display=(t==='unitaire'&&!chk('xRed'))?'':'none';
}

async function saveFrais(){
  const lib=val('xLib');
  if(!lib){toast('Indiquez un libellé.',true);return;}
  const m=num('xMontant');
  if(m==null||isNaN(m)||m<0){toast('Le montant se saisit en positif, même pour une réduction.',true);return;}
  const deductibleVisible=val('xType')==='unitaire'&&!chk('xRed');
  const row={
    libelle:lib,description:val('xDesc'),
    creche_id:val('xCreche')||null,
    type:val('xType'),montant:m,deductible_absence:deductibleVisible&&chk('xDeductible'),
    est_reduction:chk('xRed'),par_defaut:chk('xDef'),
    actif:chk('xActif'),ordre:Number(val('xOrdre')||0)
  };
  const btn=document.getElementById('btnSaveFra');
  btn.disabled=true;
  try{
    if(fraisId){
      row.updated_at=new Date().toISOString();
      const{error}=await sb.from('frais_annexes').update(row).eq('id',fraisId);
      if(error)throw error;
      const i=FRAIS.findIndex(x=>String(x.id)===String(fraisId));
      if(i>=0)FRAIS[i]=Object.assign({},FRAIS[i],row);
      toast('Frais enregistré ✅');
    }else{
      const{data,error}=await sb.from('frais_annexes').insert(row).select().single();
      if(error)throw error;
      FRAIS.push(data);
      toast('Frais ajouté ✅');
    }
    FRAIS.sort((x,y)=>x.ordre-y.ordre);
    closeOv('ovFrais');renderFrais();
  }catch(e){
    console.error('[saveFrais]',e);
    const msg=(e.code==='42703')
      ? 'Colonne est_reduction absente — exécutez la partie 1 du script 24f.'
      : (e.message||'erreur inconnue');
    toast('Enregistrement impossible : '+msg,true);
  }finally{btn.disabled=false;}
}

async function delFrais(){
  if(!fraisId)return;
  const f=FRAIS.find(x=>String(x.id)===String(fraisId));
  if(!confirm('Supprimer « '+((f&&f.libelle)||'ce frais')+' » ?\n\nLes devis déjà établis ne sont pas touchés : ils ont recopié leur montant.'))return;
  try{
    const{error}=await sb.from('frais_annexes').delete().eq('id',fraisId);
    if(error)throw error;
    FRAIS=FRAIS.filter(x=>String(x.id)!==String(fraisId));
    closeOv('ovFrais');renderFrais();
    toast('Frais supprimé.');
  }catch(e){
    console.error('[delFrais]',e);
    toast('Suppression impossible : '+(e.message||'erreur inconnue'),true);
  }
}

/* ---------- NOTICE ---------- */
const NOTICE_INS=`
<p><b>À quoi sert ce module.</b> Il recueille les demandes de place avant que l'enfant n'existe dans l'application. Une demande peut concerner un enfant à naître, viser plusieurs crèches, et rester sans suite : la créer directement en fiche enfant fausserait les présences, les commandes de repas et les effectifs PMI.</p>
<p style="margin-top:10px"><b>Le cycle d'une demande.</b> Nouvelle → En contact → Devis envoyé → Devis accepté → Inscrit. Les statuts Refusé et Sans suite ferment le dossier sans le supprimer : l'historique des demandes reste consultable.</p>
<p style="margin-top:10px"><b>Le statut « Inscrit »</b> ne se pose pas à la main. Il s'appliquera automatiquement au moment de la bascule en fiche enfant, une fois le contrat signé — c'est ce qui garantit qu'une demande marquée traitée est bien rattachée à un enfant réel.</p>
<p style="margin-top:10px"><b>Crèches souhaitées et crèche retenue.</b> La famille peut en viser plusieurs ; la crèche retenue ne se renseigne qu'une fois la place attribuée. Les autres choix sont conservés : si une place se libère ailleurs, l'information est encore là.</p>
<p style="margin-top:10px"><b>Les relances.</b> Renseignez une date de rappel : la demande remonte dans « À relancer » le jour venu (et se trouve dans « Relances programmées » d'ici là). Les dossiers clos en sont exclus.</p>
<p style="margin-top:10px"><b>Les revenus.</b> Ils ne servent qu'à estimer le CMG. Une fois le dossier clos, ils peuvent être effacés en base — l'estimation, elle, est conservée.</p>
<p style="margin-top:10px"><b>Les tarifs et les frais.</b> Le bouton « Tarifs » de la barre du haut ouvre la grille. Un tarif d'accueil s'applique sur une fourchette horaire — borne basse incluse, borne haute exclue, de sorte qu'un contrat de 40 h pile ne puisse jamais relever de deux lignes à la fois. Les frais et les réductions se saisissent tous en montant positif : c'est la case « réduction » qui fait qu'une ligne se soustrait.</p>
<p style="margin-top:10px"><b>Sauvegarder la grille.</b> En bas de cette même fenêtre, « Exporter » télécharge un fichier .json daté contenant tous les tarifs et tous les frais. Conservez-le hors de l'application : il permet de retrouver la grille si une ligne est écrasée ou supprimée par erreur. « Restaurer » relit ce fichier et présente les écarts avant d'écrire quoi que ce soit ; les lignes créées depuis l'export ne sont jamais supprimées.</p>
<p style="margin-top:10px"><b>Modifier la grille ne réécrit aucun devis.</b> Un devis recopie libellé et montant au moment de son établissement, puis ne les relit plus. Une hausse de tarif s'applique aux devis suivants, jamais à ceux déjà envoyés. Supprimer une ligne de la grille est donc sans effet sur l'historique — restaurer une sauvegarde non plus.</p>
<p style="margin-top:10px"><b>Le PDF du devis.</b> Le bouton <b>PDF</b> posé sur chaque devis produit le document à remettre à la famille, sans ouvrir le devis. Il est imprimé <b>depuis la base</b>, pas depuis l'écran : ce qui en sort est ce qui a été figé à l'établissement, même si la grille a bougé depuis. L'en-tête (raison sociale, SIRET, agrément PMI), la durée de validité et les mentions légales viennent du module <b>Paramètres</b> : ce qui n'y est pas renseigné laisse simplement un blanc sur le document. Un brouillon imprimé porte la mention « BROUILLON » — il n'engage personne tant qu'il n'est pas envoyé.</p>
<p style="margin-top:10px"><b>La signature.</b> Tant que le devis n'est pas signé, le PDF porte un cadre « Bon pour accord » à remplir à la main. La signature en ligne, à venir, remplira ce même cadre avec le tracé de la famille et sa date : le document restera le même, seul le cadre changera.</p>
<p style="margin-top:10px"><b>L'historique.</b> Le bouton <b>Historique</b> de la barre du haut ouvre toutes les demandes, transformées ou non — la file d'attente, elle, ne montre que ce qui est vivant. On y filtre par année scolaire (septembre à août, l'unité dans laquelle une crèche pense ses effectifs), par crèche et par statut. Chaque ligne montre le parcours du dossier : demande, devis envoyé, accepté ou refusé, inscrit — les étapes non franchies restent visibles en grisé, car c'est là que le dossier s'est arrêté. Le <b>taux de transformation</b> ne porte que sur les dossiers clos : y inclure les demandes en cours le ferait chuter en début d'année sans qu'aucune ne soit perdue. Le bouton <b>Exporter</b> produit un fichier .csv pour le gestionnaire.</p>
<p style="margin-top:10px"><b>Le contrat d'accueil.</b> Une fois le devis accepté, le bouton <b>Établir le contrat</b> apparaît sous les devis et ouvre le module <b>Contrats</b> sur ce dossier. Le contrat s'y rédige, s'y envoie à la famille, s'y signe et s'y contresigne. Il n'y a pas de second formulaire ici : le contrat ne s'écrit qu'à un seul endroit. La ligne sous les devis vous dit en permanence où il en est — brouillon, chez la famille, signé, contresigné.</p>
<p style="margin-top:10px"><b>La bascule en fiche enfant.</b> Le bouton <b>Basculer en fiche enfant</b> n'apparaît qu'une fois le contrat <b>contresigné</b>, c'est-à-dire signé des deux parts. Un devis accepté ne suffit plus : faire entrer un enfant dans les effectifs PMI, les présences et les commandes de repas sur la foi d'une proposition acceptée, c'était anticiper un accord qui n'était pas conclu.</p>
<p style="margin-top:10px">La bascule ouvre un écran de vérification : le contrat qui la fonde, ce qui va être créé — l'enfant, les parents, la ligne d'accueil <b>tirée du contrat signé</b> — et ce qui ne suivra pas, faute de champ dans la fiche enfant : le PAI, le médecin, l'adresse, le n° allocataire, la profession des parents. Ces informations restent sur la demande, qui demeure consultable. L'écran signale aussi les enfants du réseau portant déjà ce nom de famille : fratrie ou doublon, c'est à vous de trancher avant d'écrire. La demande passe alors en <b>Inscrit</b> et sort de la file active ; on la retrouve en cliquant sur le compteur « Inscrit ».</p>
<p style="margin-top:10px"><b>Accès.</b> Ce module est réservé à la direction : il contient des coordonnées et des revenus de familles qui ne seront peut-être jamais accueillies.</p>
`;
function openNotice(){document.getElementById('noticeBody').innerHTML=NOTICE_INS;openOv('ovNotice');}

/* Fermeture au clic sur le fond, mais pas sur la fenêtre elle-même. */
document.querySelectorAll('.ov').forEach(o=>{
  o.addEventListener('click',ev=>{if(ev.target===o)o.classList.remove('on');});
});

boot().catch(e=>{console.error('[boot]',e);showLogin('Démarrage impossible — réessayez.');});
