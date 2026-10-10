
function etatContrat(c){
  if(!c)return '';
  if(c.origine==='reprise'){
    return '<b style="color:var(--amber)">Contrat repris d\'un ancien logiciel</b>'
      +(c.reprise_reference?' (réf. '+esc(c.reprise_reference)+')':'')
      +(c.reprise_signe_le?', signé par la famille le '+dfr(c.reprise_signe_le):'')
      +', saisi le '+dfr(c.contresigne_le)+'. L\'original signé reste celui d\'origine : à conserver au dossier.'
      +(c.statut==='resilie'?' Résilié le '+dfr(c.resilie_le)+'.':'');
  }
  if(c.statut==='contresigne'){
    return '<b style="color:var(--green)">Contrat complet.</b> Signé par la famille le '+dfr(c.repondu_le)
      +(c.repondu_par?' au nom de '+esc(c.repondu_par):'')+', contresigné le '+dfr(c.contresigne_le)
      +(c.contresigne_par?' par '+esc(c.contresigne_par):'')+'.';
  }
  if(c.statut==='signe'){
    return '<b style="color:var(--green)">Signé par la famille le '+dfr(c.repondu_le)+'.</b> '
      +'Il reste à le contresigner : tant que la crèche ne l\'a pas fait, le contrat n\'engage qu\'un côté, '
      +'et la fiche enfant ne peut pas être créée.';
  }
  if(c.statut==='refuse'){
    return '<b style="color:var(--red)">Refusé par la famille le '+dfr(c.repondu_le)+'.</b>'
      +(c.motif_refus?' Motif : '+esc(c.motif_refus):' Aucun motif indiqué.');
  }
  if(c.statut==='resilie'){
    const encours=c.resilie_fin_preavis&&String(c.resilie_fin_preavis).slice(0,10)>=auj();
    return '<b style="color:var(--red)">Résilié le '+dfr(c.resilie_le)
      +(c.resilie_origine==='creche'?' à l\'initiative de la crèche':' à l\'initiative de la famille')
      +'.</b>'
      +(c.resilie_fin_preavis
        ? ' Dernier jour d\'accueil le <b>'+dfr(c.resilie_fin_preavis)+'</b>'
          +(encours?' — préavis en cours.':'.')
        : '')
      +(c.resilie_par?' Notifié par '+esc(c.resilie_par)+'.':'')
      +(c.resilie_motif?'<br>Motif : '+esc(c.resilie_motif):'');
  }
  const b=[];
  if(c.envoye_le)b.push('Envoyé le '+dfr(c.envoye_le)+(c.destinataires?' à '+esc(c.destinataires):''));
  if(c.vu_le)b.push('ouvert par la famille le '+dfr(c.vu_le));
  else if(c.envoye_le)b.push('<b>pas encore ouvert</b>');
  if(c.expire_le)b.push('lien valable jusqu\'au '+dfr(c.expire_le));
  return (b.join(' · ')||'Ce contrat a quitté le brouillon.')
    +' Il n\'est plus modifiable : un changement se porte par avenant.';
}

function cCrecheChange(){
  if(!semManuel){
    const n=semainesDe(val('cCreche'));
    if(n!=null)setVal('cSem',n);
  }
  cSync();
}
function cSemManuel(){semManuel=true;cSync();}

function cPeriodeChange(){
  const fin=val('cFin'),deb=val('cDebut');
  const box=document.getElementById('cPeriodeBox');
  if(!fin){box.style.display='none';cSync();return;}
  box.style.display='';
  const jours=[...document.querySelectorAll('.ckCJour:checked')].map(c=>Number(c.value));
  const bruts=joursAccueilEntre(deb,fin,jours);
  const mois=moisEntre(deb,fin);
  const ferm=fermetureEstimee(val('cCreche'),jours.length,mois);
  setVal('cMois',mois||'');
  setVal('cFerm',ferm);
  setVal('cJours',bruts==null?'':Math.max(0,bruts-ferm));
  cSync();
}
function cFermChange(){
  const jours=[...document.querySelectorAll('.ckCJour:checked')].map(c=>Number(c.value));
  const bruts=joursAccueilEntre(val('cDebut'),val('cFin'),jours);
  if(bruts!=null)setVal('cJours',Math.max(0,bruts-(Number(val('cFerm'))||0)));
  cSync();
}

function cSync(){
  const c=cCalcule();
  CCALC=c;

  const ref=semainesDe(val('cCreche'));
  const origine=ref==null
    ? ' Aucune crèche retenue : valeur par défaut.'
    : (Number(c.sem)===ref ? ' Nombre repris des paramètres de la crèche.'
                           : ' Corrigé à la main — les paramètres de la crèche indiquent '+ref+' semaines.');
  /* Les semaines facturées par an ne servent QU'AUX accueils sans terme : dès
     qu'une fin est posée, le calcul part des jours réellement comptés sur la
     période, et ce champ n'a plus aucun effet. Le laisser actif donnait un
     chiffre qu'on pouvait corriger sans que rien ne bouge — on le grise, et on
     dit pourquoi. */
  const eSem=document.getElementById('cSem');
  if(eSem)eSem.disabled=!CBROUILLON||c.avecTerme;

  const vol=document.getElementById('cVol');
  if(c.h==null){
    vol.textContent='Renseignez les jours et les horaires pour calculer le volume hebdomadaire.';
  }else if(c.avecTerme){
    vol.textContent=c.h+' h par semaine sur '+c.nj+' jour'+(c.nj>1?'s':'')+'. '
      +(c.joursPeriode==null
        ? 'Renseignez les jours d\'accueil de la période.'
        : c.joursPeriode+' jour'+(c.joursPeriode>1?'s':'')+' d\'accueil facturés du '
          +dfr(val('cDebut'))+' au '+dfr(val('cFin'))+', répartis sur '+nbFr(c.mois)+' mois — soit '
          +nbFr(Math.round(c.jparmois*100)/100)+' jour'+(c.jparmois>1?'s':'')+' par mois. ')
      +'Une fin d\'accueil étant posée, les semaines facturées par an n\'entrent pas dans le calcul : '
      +'la mensualité se déduit des jours réellement comptés sur la période. Le champ est donc grisé.';
  }else{
    vol.textContent=c.h+' h par semaine sur '+c.nj+' jour'+(c.nj>1?'s':'')+', soit '
      +(Math.round(c.h*c.sem*100)/100)+' h sur '+c.sem+' semaines.'+origine
      +' Accueil sans terme : lissage sur douze mois.';
  }

  const th=document.getElementById('cTarifHint');
  if(!c.tarif){
    th.textContent=c.h==null?'Le tarif se déduit du volume hebdomadaire.'
      :'Aucune ligne de la grille ne couvre '+nbFr(c.h)+' h par semaine.';
  }else{
    const forceId=val('cTarif');
    const auto=c.h==null?null:tarifPour(c.h,val('cCreche')||null);
    let base=(forceId?'Tarif forcé : ':'Retenu automatiquement : ')
      +esc(c.tarif.libelle)+' — '+euro(c.tarif.montant)+' '
      +(c.tarif.mode==='horaire'?'de l\'heure':(c.tarif.mode==='journee'?'la journée':'par mois'))+'.';
    let alerte='';
    if(c.tarif.mode==='horaire'&&c.tarif.heures_min==null&&c.tarif.heures_max==null){
      alerte+='<div class="warn"><i class="ti ti-alert-triangle"></i><span>'
        +'Cette ligne ne porte <b>aucune borne horaire</b> : elle s\'applique à tout volume. '
        +'Complétez sa fourchette dans l\'écran Tarifs du module Devis.</span></div>';
    }
    if(forceId&&auto&&String(auto.id)!==String(c.tarif.id)){
      alerte+='<div class="warn"><i class="ti ti-alert-triangle"></i><span>'
        +'Ce tarif ne correspond pas au volume saisi. Pour '+esc(nbFr(c.h))
        +' h par semaine, la grille retient <b>'+esc(auto.libelle)+'</b> à '+euro(auto.montant)
        +'. Repassez sur « choix automatique » pour la suivre.</span></div>';
    }
    th.innerHTML=base+alerte;
  }

  /* Le contrat doit chiffrer comme le devis accepté. S'ils divergent, le
     signaler ICI — au moment où le contrat s'établit — et non le découvrir à
     la première facture : la famille a accepté un montant, pas un autre. */
  const dv=(!CCUR&&CTYPE==='initial')?devisDe(CPRE?CPRE.id:(CSUJ&&CSUJ.pre_id)):null;
  if(dv&&c.mensuel&&Math.abs(Number(dv.total_mensuel)-c.mensuel)>=0.01){
    document.getElementById('cTarifHint').insertAdjacentHTML('beforeend',
      '<div class="warn"><i class="ti ti-alert-triangle"></i><span>'
      +'<b>Écart avec le devis accepté.</b> Le devis '+esc(dv.numero||'')+' porte '
      +euro(dv.total_mensuel)+' par mois, ce contrat '+euro(c.mensuel)+'. '
      +'Soit la grille a changé depuis, soit un paramètre diffère — reprenez-les avant d\'envoyer, '
      +'ou expliquez l\'écart à la famille.</span></div>');
  }

  const box=document.getElementById('cLignes');
  if(!c.lignes.length){box.innerHTML='<p class="hint">Rien à chiffrer pour l\'instant.</p>';}
  else{
    const recur=['accueil','mensuel','unitaire'];
    const q=l=>l.unite?(Math.round(l.quantite*100)/100).toLocaleString('fr-FR')+' '+l.unite+' × '+euro(Math.abs(l.montant_unitaire)):'';
    const tr=l=>'<tr'+(l.total<0?' class="neg"':'')+'><td>'+esc(libelleLigne(l))
      +(l.description?'<div class="q">'+esc(l.description)+'</div>':'')+'</td>'
      +'<td class="q">'+q(l)+'</td><td class="m">'+(l.total<0?'− ':'')+euro(Math.abs(l.total))+'</td></tr>';
    let html='<table class="lg">'+c.lignes.filter(l=>recur.indexOf(l.type)>=0).map(tr).join('')
      +'<tr class="tot"><td colspan="2">Total mensuel</td><td class="m">'+euro(c.mensuel)+'</td></tr></table>';
    const hors=c.lignes.filter(l=>recur.indexOf(l.type)<0);
    if(hors.length)html+='<div style="margin-top:12px"><table class="lg">'+hors.map(tr).join('')+'</table>'
      +'<p class="hint" style="margin-top:6px">Facturés en une fois ou à l\'année, hors mensualité.</p></div>';
    html+='<p class="hint" style="margin-top:8px">'
      +(c.avecTerme
        ? '<b>'+euro(c.annuel)+'</b> sur la durée du contrat — '+nbFr(c.mois)+' mensualités.'
        : '<b>'+euro(c.annuel)+'</b> sur douze mois, accueil sans terme.')+'</p>';
    box.innerHTML=html;
  }

  const age=ageAns(CSUJ&&CSUJ.dob,val('cDebut'));
  setVal('cAge',age==null?'—':(age+' an'+(age>1?'s':'')
    +(age<3?' · plein tarif CMG':(age<6?' · CMG divisé par deux':' · plus de droit'))));

  const cm=cCmgCalcule(c.mensuel);
  const cbox=document.getElementById('cCmg');
  if(cm.err){cbox.innerHTML='<p class="hint">'+esc(cm.err)+'</p>';}
  else{
    const pourquoi=cm.limite==='cout'
      ? 'Plafonné à '+Math.round((CMG_CFG.taux_max||0.85)*100)+' % du coût : le barème autoriserait '+euro(cm.bareme)+'.'
      : 'Montant du barème. Le plafond des '+Math.round((CMG_CFG.taux_max||0.85)*100)+' % autoriserait jusqu\'à '+euro(cm.cout)+'.';
    cbox.innerHTML='<div class="box">'
      +'<div style="display:flex;justify-content:space-between"><span>Coût mensuel</span><b>'+euro(c.mensuel)+'</b></div>'
      +'<div style="display:flex;justify-content:space-between;color:var(--green);margin-top:4px"><span>CMG estimé</span><b>− '+euro(cm.cmg)+'</b></div>'
      +'<div class="rac"><span>Reste à charge</span><b>'+euro(cm.reste)+'</b></div>'
      +'<p class="hint" style="margin:8px 0 0">'+esc(pourquoi)+' Estimation indicative : seule la CAF fait foi.</p></div>';
  }
  const plaf=Number(CMG_CFG.plafond_horaire||10);
  if(c.tarif&&c.tarif.mode==='horaire'&&Number(c.tarif.montant)>plaf){
    cbox.insertAdjacentHTML('afterbegin',
      '<div class="warn"><i class="ti ti-alert-triangle"></i><span>Le tarif retenu dépasse '+plaf
      +' € de l\'heure : au-delà de ce seuil, la famille perd <b>la totalité</b> du CMG.</span></div>');
  }
}

/* ---------- ENREGISTREMENT ---------- */
async function saveContrat(){
  if(!CSUJ){toast('Ouvrez d\'abord un dossier.',true);return;}
  const c=CCALC||cCalcule();
  if(!c.lignes.length){toast('Rien à chiffrer : vérifiez les jours, les horaires et le tarif.',true);return;}
  if(!val('cDebut')){toast('La date de début est obligatoire : le contrat en dépend.',true);return;}
  if(val('cFin')&&val('cFin')<=val('cDebut')){
    toast('La fin de l\'accueil doit être postérieure au début.',true);return;
  }
  if(CTYPE==='avenant'){
    if(!CPARENT){toast('Cet avenant n\'a plus de contrat d\'origine.',true);return;}
    if(!val('cEffet')){toast('Un avenant doit porter une date d\'effet.',true);return;}
  }
  /* La contrainte contrats_rattachement_ck l'exigerait de toute façon, mais
     une erreur Postgres n'apprend rien à la direction. */
  const preId=(CPRE&&CPRE.id)||CSUJ.pre_id||null;
  if(!CSUJ.enfant_id&&!preId){
    toast('Ce contrat ne se rattache ni à une demande ni à un enfant : rechargez la page.',true);
    return;
  }

  const cm=cCmgCalcule(c.mensuel);
  const row={
    enfant_id:CSUJ.enfant_id,
    preinscription_id:preId,
    type:CTYPE,
    parent_contrat_id:CTYPE==='avenant'?CPARENT.id:null,
    creche_id:val('cCreche')||null,
    statut:'brouillon',
    date_debut:val('cDebut'),
    date_fin:val('cFin')||null,
    date_effet:CTYPE==='avenant'?(val('cEffet')||null):null,
    jours:[...document.querySelectorAll('.ckCJour:checked')].map(x=>Number(x.value)),
    heure_debut:val('cHd'),heure_fin:val('cHf'),
    heures_hebdo:c.h||0,semaines_an:Number(val('cSem'))||47,
    jours_accueil:c.avecTerme&&c.joursPeriode!=null?Math.round(c.joursPeriode):null,
    mois_factures:c.avecTerme?c.mois:null,
    repas:val('cRepas')||null,
    tarif_id:c.tarif?c.tarif.id:null,
    tarif_libelle:c.tarif?c.tarif.libelle:'',
    tarif_mode:c.tarif?c.tarif.mode:'horaire',
    tarif_montant:c.tarif?Number(c.tarif.montant):0,
    total_mensuel:c.mensuel,total_annuel:c.annuel,frais_uniques:c.uniques,
    cmg_estime:cm.err?null:cm.cmg,
    reste_a_charge:cm.err?null:cm.reste,
    famille_adresse:val('cAdresse'),famille_code_postal:val('cCp'),
    famille_ville:val('cVille'),num_allocataire:val('cAlloc'),
    destinataires:val('cDest'),
    commentaire:val('cCom'),notes_internes:val('cNotes')
  };

  const btn=document.getElementById('btnSaveCt');
  btn.disabled=true;
  try{
    let id=contratId;
    if(id){
      const{error}=await sb.from('contrats').update(row).eq('id',id);
      if(error)throw error;
      const i=CONTRATS.findIndex(x=>String(x.id)===String(id));
      if(i>=0)CONTRATS[i]=Object.assign({},CONTRATS[i],row);
    }else{
      if(CTYPE==='initial'){
        const d=devisDe(preId);
        if(d)row.devis_id=d.id;
      }
      row.created_by=ME?ME.id:null;
      const annee=anneeScolaireDe(row.date_debut)||new Date().getFullYear();
      let ins=null;
      for(let essai=0;essai<5;essai++){
        row.numero=CTYPE==='avenant'?numeroAvenant(CPARENT):prochainNumero(annee);
        ins=await sb.from('contrats').insert(row).select().single();
        if(!ins.error)break;
        if(ins.error.code!=='23505')throw ins.error;
        /* 23505 sur cet insert a deux causes possibles, et elles ne se
           traitent pas pareil : le numéro déjà pris (on recalcule), ou
           contrats_pre_initial_uk — un contrat initial existe déjà pour cette
           demande. Le second n'est pas une collision à réessayer : c'est un
           doublon qu'il faut refuser. */
        if(String(ins.error.message||'').indexOf('contrats_pre_initial_uk')>=0){
          throw new Error('Un contrat initial existe déjà pour cette demande. '
            +'Ouvrez-le plutôt que d\'en créer un second, ou annulez-le d\'abord.');
        }
        const{data}=await sb.from('contrats').select('id,numero,parent_contrat_id');
        if(data)CONTRATS=data.map(x=>Object.assign(
          CONTRATS.find(y=>String(y.id)===String(x.id))||{},x));
      }
      if(ins.error)throw ins.error;
      id=ins.data.id;contratId=id;
      CONTRATS.unshift(ins.data);
    }

    await sb.from('contrats_lignes').delete().eq('contrat_id',id);
    const lignes=c.lignes.map((l,i)=>({contrat_id:id,libelle:l.libelle,description:l.description,
      type:l.type,quantite:l.quantite,montant_unitaire:l.montant_unitaire,total:l.total,ordre:(i+1)*10}));
    if(lignes.length){
      const{error}=await sb.from('contrats_lignes').insert(lignes);
      if(error)throw error;
    }

    toast('Contrat enregistré ✅');
    closeOv('ovContrat');
    await recharger();
    rendreDossier();
  }catch(e){
    console.error('[saveContrat]',e);
    const msg=(e.code==='42P01')
      ? 'La table des contrats n\'existe pas — exécutez le script 31.'
      : (e.code==='23514'
        ? 'Une contrainte de la base refuse cette combinaison : '+(e.message||'')
        : (e.message||'erreur inconnue'));
    toast('Enregistrement impossible : '+msg,true);
  }finally{btn.disabled=false;}
}

async function delContrat(){
  if(!contratId)return;
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(c&&c.statut!=='brouillon'){
    toast('Seul un brouillon peut être supprimé. Un contrat parti chez la famille s\'annule.',true);
    return;
  }
  if(!confirm('Supprimer ce brouillon de contrat ? Ses lignes seront supprimées avec lui.'))return;
  try{
    await sb.from('contrats_lignes').delete().eq('contrat_id',contratId);
    const{error}=await sb.from('contrats').delete().eq('id',contratId);
    if(error)throw error;
    closeOv('ovContrat');
    await recharger();
    rendreDossier();
    toast('Brouillon supprimé.');
  }catch(e){
    console.error('[delContrat]',e);
    toast('Suppression impossible : '+(e.message||'erreur inconnue'),true);
  }
}

/* ---------- ENVOI ET SIGNATURE EN LIGNE ---------- */
/* La famille reçoit un mail, ouvre signature-contrat.html avec son jeton, lit le contrat
   et le signe du doigt. Même dispositif que le devis : jeton porté par la
   ligne, edge function en service_role, AUCUNE policy anon sur `contrats`.

   Le jeton est fabriqué ICI, sous RLS, par quelqu'un qui a le droit d'envoyer
   le contrat — et non par l'edge function, qui ne doit jamais pouvoir créer un
   accès de sa propre initiative. La fonction d'envoi ne reçoit qu'un
   identifiant et relit tout le reste en base. */

/* crypto.getRandomValues et non Math.random : ce jeton est la seule chose qui
   sépare le contrat d'une famille de celui d'une autre. 32 octets, 64
   caractères hexadécimaux — indevinable. */
function nouveauJeton(){
  const a=new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
}
/* La page famille s'appelle `signature-contrat.html`, et non `contrat.html` :
   une seule lettre d'écart avec `contrats.html` — l'écran de la direction —
   aurait fini par produire un lien qui envoie une famille sur la liste de tous
   les dossiers du réseau. Ce nom-là doit rester stable : il part dans les mails
   et vit dans les boîtes des familles pendant des semaines. */
function lienContrat(jeton){
  const racine=location.href.replace(/[^/]*\.html?(\?.*)?(#.*)?$/i,'');
  return racine+'signature-contrat.html?t='+jeton;
}

/* supabase-js masque le corps de la réponse d'une edge function derrière un
   message unique — « Edge Function returned a non-2xx status code » — quelle
   que soit la cause. Le vrai motif (clé Resend absente, domaine non vérifié,
   APP_URL manquante, adresse invalide) est dans le corps JSON, sous `erreur`.
   Sans cette fonction, toutes les pannes d'envoi se ressemblent. */
async function detailFn(e){
  try{
    if(e&&e.context&&typeof e.context.json==='function'){
      const j=await e.context.json();
      if(j&&j.erreur)return j.erreur;
      if(j&&j.error)return String(j.error);
    }
  }catch(x){}
  try{
    if(e&&e.context&&typeof e.context.text==='function'){
      const t=await e.context.text();
      if(t)return t.slice(0,300);
    }
  }catch(x){}
  return (e&&e.message)||'erreur inconnue';
}

/* Les clauses sont RECOPIÉES sur le contrat au moment où il part, pas lues à
   l'affichage. Un contrat garde les conditions sous lesquelles il a été signé,
   même si le réseau réécrit ses textes le lendemain — c'est la même règle que
   pour le tarif, et pour la même raison. */
function clausesFigees(){
  return {
    preavis_texte:String(RESEAU.preavis_resiliation||''),
    conditions_resiliation:String(RESEAU.conditions_resiliation||''),
    mentions_legales:String(RESEAU.contrat_mentions||RESEAU.devis_mentions||'')
  };
}

/* Le lien vit indépendamment de l'envoi. On peut donc le créer et le
   transmettre à la main — SMS, mail écrit soi-même — sans passer par Resend.
   C'est la porte de sortie quand le mail automatique échoue, quand la famille
   n'a pas d'adresse, ou quand on veut simplement vérifier la page avant de
   l'envoyer à qui que ce soit.

   Le jeton n'est fabriqué qu'une fois : rappeler ce bouton recopie le même
   lien, et n'invalide pas celui qui est déjà parti. Il n'est renouvelé que
   s'il a expiré. */
async function copierLienContrat(partager){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(!c){toast('Enregistrez d\'abord le contrat.',true);return;}
  if(c.repondu_le){toast('Ce contrat a déjà reçu une réponse.',true);return;}

  let jeton=c.token;
  const expire=c.expire_le?new Date(c.expire_le).getTime():0;
  if(!jeton||expire<Date.now()){
    await loadReseau();
    const jours=Number(RESEAU.contrat_validite_jours||RESEAU.devis_validite_jours||30);
    const fin=new Date();fin.setDate(fin.getDate()+jours);
    const maj=Object.assign({
      token:nouveauJeton(),expire_le:fin.toISOString(),
      updated_at:new Date().toISOString()
    },clausesFigees());
    const adr=destinatairesDe();
    if(adr.length)maj.destinataires=adr.join(', ');

    /* Créer un lien pour le donner à une famille, c'est envoyer le contrat. Le
       statut suit donc, et pour deux raisons qui vont ensemble :

       — la signature en ligne n'est acceptée que sur un contrat « envoyé ». Un
         lien créé sur un brouillon laissait la famille tout lire, tout signer,
         et se faire refuser au dernier clic ;
       — la contrainte contrats_envoi_ck exige `token` ET `envoye_le` dès qu'un
         contrat quitte le brouillon. Les poser séparément est impossible.

       On le dit avant, parce que le contrat cesse alors d'être modifiable. */
    if(c.statut==='brouillon'){
      if(!confirm('Créer le lien de signature ?\n\n'
        +'Le contrat passera en « Envoyé » et ne sera plus modifiable — c\'est ce qui '
        +'autorise la famille à le signer en ligne.\n'
        +'Un changement ultérieur se portera par avenant.\n\n'
        +'Lien valable '+jours+' jours, jusqu\'au '+dfr(fin.toISOString())+'.'))return;
      maj.statut='envoye';
      maj.envoye_le=new Date().toISOString();
    }

    const{error}=await sb.from('contrats').update(maj).eq('id',c.id);
    if(error){
      console.error('[copierLienContrat]',error);
      toast('Création du lien impossible : '+(error.message||'erreur inconnue'),true);
      return;
    }
    Object.assign(c,maj);
    jeton=maj.token;
    document.getElementById('btnLienCt').innerHTML='<i class="ti ti-link"></i> Le lien';
    if(maj.statut==='envoye'){render();rendreDossier();}
  }

  const url=lienContrat(jeton);
  if(partager===true){
    const r=await PartageLien.partager(url,{titre:"Contrat d'accueil",
      texte:'Bonjour, voici le lien pour consulter et signer votre contrat d\'accueil :'});
    if(r==='copie')toast('Partage indisponible — lien copié.');
    return;
  }
  try{
    await navigator.clipboard.writeText(url);
    toast('Lien copié — collez-le dans votre mail ou un SMS.');
  }catch(e){
    // Le presse-papier est refusé hors HTTPS et dans certains navigateurs :
    // plutôt que d'échouer, on montre le lien pour qu'il soit copié à la main.
    prompt('Copiez ce lien :',url);
  }
}

async function envoyerContrat(){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(!c){toast('Enregistrez d\'abord le contrat.',true);return;}
  if(c.repondu_le){toast('Ce contrat a déjà reçu une réponse.',true);return;}

  const relance=(c.statut==='envoye');
  const adresses=String(val('cDest')||c.destinataires||'')
    .split(',').map(x=>x.trim()).filter(x=>x.indexOf('@')>0);
  if(!adresses.length){
    toast('Aucun destinataire avec une adresse e-mail : cochez « destinataire » sur au moins un parent, dans le module Devis.',true);
    return;
  }
  if(!c.total_mensuel){
    toast('Ce contrat ne chiffre rien — vérifiez-le avant de l\'envoyer.',true);
    return;
  }

  await loadReseau();
  const jours=Number(RESEAU.contrat_validite_jours||RESEAU.devis_validite_jours||30);
  const fin=new Date();fin.setDate(fin.getDate()+jours);

  const quoi=relance
    ? 'Relancer '+adresses.join(', ')+' ?'
    : 'Envoyer ce contrat à '+adresses.join(', ')+' ?\n\n'
      +'Le contrat passera en « Envoyé » et ne sera plus modifiable.\n'
      +'Un changement ultérieur se portera par avenant.\n'
      +'Le lien sera valable '+jours+' jours, jusqu\'au '+dfr(fin.toISOString())+'.';
  if(!confirm(quoi))return;

  const b=document.getElementById('btnEnvoiCt');
  b.disabled=true;b.textContent=relance?'Relance…':'Envoi…';
  try{
    /* Un jeton n'est fabriqué qu'au premier envoi. Une relance réutilise le
       même lien : en poser un nouveau invaliderait celui que la famille a déjà
       dans sa boîte, et c'est souvent celui-là qu'elle rouvrira. On ne le
       renouvelle que s'il a expiré entre-temps. */
    const expire=c.expire_le?new Date(c.expire_le).getTime():0;
    const besoinJeton=!c.token||expire<Date.now();
    const maj={destinataires:adresses.join(', '),updated_at:new Date().toISOString()};
    if(besoinJeton){maj.token=nouveauJeton();maj.expire_le=fin.toISOString();}
    if(!relance){
      maj.statut='envoye';
      maj.envoye_le=new Date().toISOString();
      Object.assign(maj,clausesFigees());
    }

    const{error}=await sb.from('contrats').update(maj).eq('id',c.id);
    if(error)throw error;
    Object.assign(c,maj);

    /* Le mail part APRÈS l'écriture : si l'envoi échoue, le lien existe déjà et
       le bouton « Le lien » permet de le transmettre à la main. L'inverse —
       mailer d'abord — aurait pu expédier un lien que la base n'a pas gardé. */
    const{error:eFn}=await sb.functions.invoke('envoyer-contrat',
      {body:{contrat_id:c.id,relance:relance,expediteur:(PROF&&PROF.name)||undefined}});
    if(eFn)throw new Error(await detailFn(eFn));

    if(relance){
      c.relances=(c.relances||0)+1;
      c.derniere_relance=new Date().toISOString();
      toast('Relance envoyée ✅');
    }else{
      toast('Contrat envoyé ✅');
    }
    closeOv('ovContrat');
    await recharger();
    rendreDossier();
  }catch(e){
    console.error('[envoyerContrat]',e);
    toast('Envoi impossible : '+(e.message||'erreur inconnue')
      +' — le lien reste disponible par le bouton « Le lien ».',true);
  }finally{
    b.disabled=false;
    b.innerHTML=relance?'<i class="ti ti-bell"></i> Relancer la famille'
                       :'<i class="ti ti-send"></i> Envoyer à la famille';
  }
}

/* ---------- LA REPRISE D'UN CONTRAT EXISTANT ---------- */
/* Un contrat signé ailleurs ne peut pas repasser par l'envoi, la signature de
   la famille et la contresignature : ce serait refaire signer ce qui l'est
   déjà, ou fabriquer une signature. On l'enregistre donc tel quel, au statut
   « contresigné » et avec origine = 'reprise' (script sql/contrats_reprise.sql).
   Sans cette marque, un contrôle PMI ne distinguerait pas un contrat signé dans
   l'application d'un contrat recopié. */
const RPR_TYPES=[['accueil','Accueil (mensualité)'],['unitaire','Frais par jour d\'accueil'],
  ['mensuel','Frais mensuel'],['annuel','Frais annuel'],['unique','Frais unique']];
let RPR_LIGNES=[];

async function openReprise(){
  if(!CSUJ||CSUJ.kind!=='enfant'){toast('La reprise concerne un enfant déjà accueilli.',true);return;}
  await loadGrille();
  document.getElementById('rprNom').textContent=((CSUJ.prenom||'')+' '+(CSUJ.nom||'')).trim();
  document.getElementById('rprCreche').innerHTML=CRECHES.map(c=>
    '<option value="'+c.id+'"'+(String(c.id)===String(CSUJ.creche_id)?' selected':'')+'>'+esc(c.name)+'</option>').join('');
  setVal('rprDebut',CSUJ.date_ref?String(CSUJ.date_ref).slice(0,10):'');
  setVal('rprFin','');setVal('rprHd','');setVal('rprHf','');
  setVal('rprSem',semainesDe(CSUJ.creche_id)||47);
  setVal('rprRepas',CSUJ.repas||'');setVal('rprTarif','');setVal('rprAlloc','');
  setVal('rprRef','');setVal('rprSigneLe','');setVal('rprNotes','');
  document.getElementById('rprJoursBox').innerHTML=JOURS.map(j=>
    '<label><input type="checkbox" class="ckRJour" value="'+j[0]+'" onchange="rprRecalcul()"><span>'+j[1]+'</span></label>').join('');
  document.getElementById('rprFraisGrille').innerHTML='<option value="">+ Ajouter un frais de la grille…</option>'
    +FRAIS.map(f=>'<option value="'+f.id+'">'+esc(f.libelle)+'</option>').join('');
  RPR_LIGNES=[{libelle:'Accueil',type:'accueil',quantite:'',pu:''}];
  rprRendreLignes();rprRecalcul();
  openOv('ovReprise');
}

function rprJours(){return [...document.querySelectorAll('.ckRJour:checked')].map(x=>Number(x.value));}
function rprHeuresHebdo(){
  const m=t=>{const a=String(t||'').split(':');return a.length>=2?Number(a[0])*60+Number(a[1]):null;};
  const a=m(val('rprHd')),b=m(val('rprHf'));
  const n=rprJours().length;
  if(a==null||b==null||b<=a||!n)return null;
  return Math.round((b-a)/60*n*100)/100;
}
/* Jours d'accueil par mois : sur la durée du contrat s'il a un terme (comme le
   module Contrat), sinon lissé sur l'année. */
function rprJoursParMois(){
  const nj=rprJours().length,sem=Number(val('rprSem'))||47;
  if(val('rprDebut')&&val('rprFin')){
    const j=joursAccueilEntre(val('rprDebut'),val('rprFin'),rprJours()),m=moisEntre(val('rprDebut'),val('rprFin'));
    if(j!=null&&m)return j/m;
  }
  return nj*sem/12;
}
function rprRendreLignes(){
  document.getElementById('rprLignes').innerHTML='<table class="lg">'+RPR_LIGNES.map((l,i)=>
    '<tr><td><input value="'+esc(l.libelle)+'" placeholder="Libellé" oninput="RPR_LIGNES['+i+'].libelle=this.value"></td>'
    +'<td><select onchange="RPR_LIGNES['+i+'].type=this.value;rprRecalcul()">'
    +RPR_TYPES.map(t=>'<option value="'+t[0]+'"'+(t[0]===l.type?' selected':'')+'>'+esc(t[1])+'</option>').join('')+'</select></td>'
    +'<td><input type="number" step="any" style="width:84px" placeholder="Qté" value="'+esc(l.quantite)+'" oninput="RPR_LIGNES['+i+'].quantite=this.value;rprRecalcul(true)"></td>'
    +'<td><input type="number" step="any" style="width:96px" placeholder="€ unit." value="'+esc(l.pu)+'" oninput="RPR_LIGNES['+i+'].pu=this.value;rprRecalcul(true)"></td>'
    +'<td class="m" id="rprTot'+i+'"></td>'
    +'<td><button class="btn btn-g btn-sm" type="button" onclick="RPR_LIGNES.splice('+i+',1);rprRendreLignes();rprRecalcul()" title="Retirer"><i class="ti ti-x"></i></button></td></tr>'
  ).join('')+'</table>';
}
function rprAjouterLigne(){RPR_LIGNES.push({libelle:'',type:'mensuel',quantite:1,pu:''});rprRendreLignes();rprRecalcul();}
function rprAjouterFrais(id){
  const f=FRAIS.find(x=>String(x.id)===String(id));
  if(!f)return;
  const signe=f.est_reduction?-1:1;
  RPR_LIGNES.push({libelle:f.libelle,type:f.type,
    quantite:f.type==='unitaire'?Math.round(rprJoursParMois()*1000)/1000:1,
    pu:signe*Number(f.montant)});
  rprRendreLignes();rprRecalcul();
}
function rprTotalLigne(l){return Math.round((Number(l.quantite)||0)*(Number(l.pu)||0)*100)/100;}
/* `saisie` : on vient de taper dans une ligne — on ne re-dessine pas la table
   (le curseur sauterait), on ne met à jour que les totaux. */
function rprRecalcul(saisie){
  const h=rprHeuresHebdo(),sem=Number(val('rprSem'))||47,tarif=Number(val('rprTarif'))||0;
  const vol=document.getElementById('rprVol');
  if(h==null)vol.textContent='';
  else{
    const hMois=Math.round(h*sem/12*100)/100;
    vol.innerHTML='Volume : <b>'+h+' h</b> par semaine, soit environ <b>'+hMois+' h</b> par mois'
      +(tarif?' — accueil théorique '+euro(hMois*tarif)+' ; <button class="btn btn-g btn-sm" type="button" onclick="rprPreremplirAccueil()">préremplir la ligne d\'accueil</button>':'')+'.';
  }
  RPR_LIGNES.forEach((l,i)=>{const e=document.getElementById('rprTot'+i);if(e)e.textContent=euro(rprTotalLigne(l));});
  const recur=['accueil','mensuel','unitaire'];
  const mensuel=RPR_LIGNES.filter(l=>recur.indexOf(l.type)>=0).reduce((s,l)=>s+rprTotalLigne(l),0);
  const uniques=RPR_LIGNES.filter(l=>l.type==='unique').reduce((s,l)=>s+rprTotalLigne(l),0);
  document.getElementById('rprTotaux').innerHTML='<div class="box"><div style="display:flex;justify-content:space-between">'
    +'<span>Total mensuel</span><b>'+euro(mensuel)+'</b></div>'
    +(uniques?'<div style="display:flex;justify-content:space-between;margin-top:4px"><span>Frais uniques</span><b>'+euro(uniques)+'</b></div>':'')+'</div>';
  if(!saisie&&!document.getElementById('rprLignes').children.length)rprRendreLignes();
}
function rprPreremplirAccueil(){
  const h=rprHeuresHebdo(),sem=Number(val('rprSem'))||47,tarif=Number(val('rprTarif'))||0;
  if(h==null||!tarif)return;
  const l=RPR_LIGNES.find(x=>x.type==='accueil');
  if(!l)return;
  l.quantite=Math.round(h*sem/12*100)/100;l.pu=tarif;
  rprRendreLignes();rprRecalcul();
}

async function rprEnregistrer(){
  const jours=rprJours(),deb=val('rprDebut'),fin=val('rprFin')||null;
  const lignes=RPR_LIGNES.filter(l=>(l.libelle||'').trim()||rprTotalLigne(l)).map((l,i)=>({
    libelle:(l.libelle||'').trim()||'Ligne '+(i+1),description:'',type:l.type,
    quantite:Number(l.quantite)||0,montant_unitaire:Number(l.pu)||0,total:rprTotalLigne(l),ordre:(i+1)*10}));
  if(!deb){toast('La date de début est obligatoire.',true);return;}
  if(fin&&fin<=deb){toast('La fin de l\'accueil doit être postérieure au début.',true);return;}
  if(!jours.length){toast('Cochez au moins un jour d\'accueil.',true);return;}
  const h=rprHeuresHebdo();
  if(h==null){toast('Renseignez des horaires d\'arrivée et de départ cohérents.',true);return;}
  if(!lignes.some(l=>l.type==='accueil'&&l.total)){toast('Saisissez la ligne d\'accueil avec son montant : c\'est elle que la facturation lit.',true);return;}
  const recur=['accueil','mensuel','unitaire'];
  const mensuel=Math.round(lignes.filter(l=>recur.indexOf(l.type)>=0).reduce((s,l)=>s+l.total,0)*100)/100;
  const uniques=Math.round(lignes.filter(l=>l.type==='unique').reduce((s,l)=>s+l.total,0)*100)/100;
  const annuels=lignes.filter(l=>l.type==='annuel').reduce((s,l)=>s+l.total,0);
  const mois=fin?(moisEntre(deb,fin)||12):12;
  const tarif=Number(val('rprTarif'))||0;
  const precedent=contratsDe('enfant',CSUJ.id).find(c=>c.type!=='avenant'
    &&['signe','contresigne','resilie'].indexOf(c.statut)>=0);
  const maintenant=new Date().toISOString();
  const row={
    enfant_id:CSUJ.enfant_id,preinscription_id:null,
    type:precedent?'renouvellement':'initial',
    creche_id:val('rprCreche')||null,
    statut:'contresigne',origine:'reprise',
    contresigne_le:maintenant,contresigne_par:'Repris de l\'ancien logiciel',
    reprise_reference:val('rprRef')||null,reprise_signe_le:val('rprSigneLe')||null,
    date_debut:deb,date_fin:fin,jours:jours,
    heure_debut:val('rprHd'),heure_fin:val('rprHf'),
    heures_hebdo:h,semaines_an:Number(val('rprSem'))||47,
    jours_accueil:fin?joursAccueilEntre(deb,fin,jours):null,mois_factures:fin?mois:null,
    repas:val('rprRepas')||null,
    tarif_id:null,tarif_libelle:'Repris du contrat d\'origine',
    tarif_mode:tarif?'horaire':'mensuel',tarif_montant:tarif||mensuel,
    total_mensuel:mensuel,total_annuel:Math.round((mensuel*mois+annuels)*100)/100,frais_uniques:uniques,
    num_allocataire:val('rprAlloc'),
    notes_internes:val('rprNotes'),created_by:ME?ME.id:null
  };
  const btn=document.getElementById('btnRprGo');
  btn.disabled=true;
  try{
    const annee=anneeScolaireDe(deb)||new Date().getFullYear();
    let ins=null;
    for(let essai=0;essai<5;essai++){
      row.numero=prochainNumero(annee);
      ins=await sb.from('contrats').insert(row).select().single();
      if(!ins.error)break;
      if(ins.error.code!=='23505')throw ins.error;
      const{data}=await sb.from('contrats').select('id,numero,parent_contrat_id');
      if(data)CONTRATS=data.map(x=>Object.assign(CONTRATS.find(y=>String(y.id)===String(x.id))||{},x));
    }
    if(ins.error)throw ins.error;
    const id=ins.data.id;
    const el=await sb.from('contrats_lignes').insert(lignes.map(l=>Object.assign({contrat_id:id},l)));
    if(el.error){
      await sb.from('contrats').delete().eq('id',id);   // pas de contrat sans détail chiffré
      throw el.error;
    }
    /* La ligne d'accueil technique (présences, repas, effectifs) : on complète
       celle que l'import des présences a pu créer plutôt que d'en poser une
       seconde qui ferait doublon. */
    let lien='';
    try{
      const ex=await sb.from('enfants_contrats').select('id,date_debut').eq('enfant_id',CSUJ.enfant_id);
      const l=ex.data||[];
      const cible=l.find(x=>String(x.date_debut).slice(0,10)===deb)||(l.length===1?l[0]:null);
      const champs={date_debut:deb,date_fin:fin,jours:jours,heure_debut:row.heure_debut,heure_fin:row.heure_fin,
        repas:row.repas,updated_at:maintenant};
      if(cible){
        const u=await sb.from('enfants_contrats').update(champs).eq('id',cible.id);
        if(u.error)throw u.error;
        lien=cible.id;
      }else{
        const i2=await sb.from('enfants_contrats').insert(Object.assign({enfant_id:CSUJ.enfant_id,
          notes:'Repris du contrat '+ins.data.numero},champs)).select().single();
        if(i2.error)throw i2.error;
        lien=i2.data.id;
      }
      await sb.from('contrats').update({enfants_contrat_id:lien}).eq('id',id);
    }catch(e){
      console.warn('[reprise/ligne d\'accueil]',e);
      toast('Contrat repris, mais la ligne d\'accueil des présences n\'a pas pu être mise à jour : '+(e.message||e),true);
    }
    closeOv('ovReprise');
    await recharger();
    rendreDossier();
    toast('Contrat '+ins.data.numero+' repris ✅');
  }catch(e){
    console.error('[rprEnregistrer]',e);
    const msg=(/origine|reprise_/.test(e.message||'')||e.code==='PGRST204'||e.code==='42703')
      ? 'la base n\'est pas à jour — exécutez d\'abord sql/contrats_reprise.sql.'
      : (e.code==='23514'?'une contrainte de la base refuse cette combinaison : ':'')+(e.message||'erreur inconnue');
    toast('Reprise impossible : '+msg,true);
  }finally{btn.disabled=false;}
}

/* ---------- LA CONTRESIGNATURE ---------- */
/* Tracée à chaque contrat, jamais stockée une fois pour toutes en paramètres :
   une signature réapposée automatiquement prouve seulement que l'application
   sait la recopier. Celle-ci est horodatée, nominative, et propre à ce
   contrat — c'est ce qu'un contrôle PMI attend de voir. */
let csCtx=null,csDessine=false,csTrace=false;

function openContresignature(){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(!c){toast('Contrat introuvable.',true);return;}
  if(c.statut!=='signe'){
    toast('Seul un contrat signé par la famille peut être contresigné.',true);return;
  }
  document.getElementById('csInfo').innerHTML=
    '<div class="warn" style="background:var(--green-l);color:var(--green)">'
    +'<i class="ti ti-writing-sign"></i><span>Contrat <b>'+esc(c.numero||'')+'</b>, signé par la famille le '
    +dfr(c.repondu_le)+(c.repondu_par?' au nom de <b>'+esc(c.repondu_par)+'</b>':'')+'.</span></div>';
  setVal('csNom',(PROF&&PROF.name)?PROF.name:'');
  csTrace=false;
  const hint=document.getElementById('csHint');
  if(hint)hint.style.display='';
  openOv('ovContresign');
  // Le canvas doit être dimensionné APRÈS l'affichage de la modale : mesuré
  // pendant qu'elle est masquée, il fait zéro pixel de large et le tracé
  // n'apparaît nulle part.
  setTimeout(csInit,60);
}

function csInit(){
  const cv=document.getElementById('csSig');
  if(!cv)return;
  const dpr=Math.min(window.devicePixelRatio||1,3);
  const r=cv.getBoundingClientRect();
  if(!r.width)return;
  cv.width=Math.round(r.width*dpr);
  cv.height=Math.round(r.height*dpr);
  csCtx=cv.getContext('2d');
  csCtx.scale(dpr,dpr);
  csCtx.lineWidth=2.4;csCtx.lineCap='round';csCtx.lineJoin='round';csCtx.strokeStyle='#2B2740';
  const pos=ev=>{const b=cv.getBoundingClientRect();return{x:ev.clientX-b.left,y:ev.clientY-b.top};};
  cv.onpointerdown=ev=>{
    ev.preventDefault();cv.setPointerCapture(ev.pointerId);
    csDessine=true;csTrace=true;
    document.getElementById('csHint').style.display='none';
    const p=pos(ev);csCtx.beginPath();csCtx.moveTo(p.x,p.y);
  };
  cv.onpointermove=ev=>{
    if(!csDessine)return;ev.preventDefault();
    const p=pos(ev);csCtx.lineTo(p.x,p.y);csCtx.stroke();
  };
  cv.onpointerup=cv.onpointercancel=cv.onpointerleave=()=>{csDessine=false;};
}
function csEffacer(){
  const cv=document.getElementById('csSig');
  if(!cv||!csCtx)return;
  csCtx.clearRect(0,0,cv.width,cv.height);
  csTrace=false;
  document.getElementById('csHint').style.display='';
}

async function contresigner(){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(!c)return;
  const nom=val('csNom');
  if(nom.length<3){toast('Indiquez le nom et la qualité du signataire.',true);return;}
  if(!csTrace){toast('Tracez la signature dans le cadre.',true);return;}
  const png=document.getElementById('csSig').toDataURL('image/png');
  // Même seuil que côté famille : un cadre effleuré n'est pas une signature.
  if(png.length<1500){toast('Signature trop brève — retracez-la plus largement.',true);return;}

  const b=document.getElementById('btnCsGo');
  b.disabled=true;b.textContent='Enregistrement…';
  try{
    const maintenant=new Date().toISOString();
    /* `.eq('statut','signe')` protège du double clic et d'une contresignature
       menée en parallèle depuis un autre poste : la seconde ne trouve plus de
       ligne à modifier. */
    const{data,error}=await sb.from('contrats').update({
      statut:'contresigne',
      contresigne_le:maintenant,
      contresigne_par:nom,
      contresignature_png:png,
      updated_at:maintenant
    }).eq('id',c.id).eq('statut','signe').select();
    if(error)throw error;
    if(!data||!data.length)throw new Error('Ce contrat vient d\'être contresigné ailleurs.');

    Object.assign(c,data[0]);
    closeOv('ovContresign');closeOv('ovContrat');
    await recharger();
    rendreDossier();
    toast('Contrat contresigné ✅ — il est complet des deux côtés.');
    // Ne bloque pas l'écran : la contresignature est déjà enregistrée, l'envoi
    // du mail se fait en tâche de fond et prévient lui-même en cas d'échec.
    envoyerContratSigneParMail(c);
  }catch(e){
    console.error('[contresigner]',e);
    const msg=(e.code==='23514')
      ? 'Une contrainte de la base refuse cet état : '+(e.message||'')
      : (e.message||'erreur inconnue');
    toast('Contresignature impossible : '+msg,true);
    b.disabled=false;b.innerHTML='<i class="ti ti-check"></i> Contresigner';
  }
}

async function recharger(){
  try{
    const{data,error}=await sb.from('contrats').select('*').order('created_at',{ascending:false});
    if(error)throw error;
    CONTRATS=data||[];
  }catch(e){console.warn('[recharger]',e);}
  render();
}

/* ---------- LA RÉSILIATION ---------- */
/* Un contrat d'accueil se termine rarement à sa date de fin : une famille
   déménage, change de mode de garde, ou la crèche met fin à l'accueil. La
   résiliation n'est donc pas un cas d'exception, c'est le second mode de fin
   d'un contrat — et le seul qui laisse une trace utile en cas de litige.

   TROIS CHOSES SONT ENREGISTRÉES, et chacune répond à une question qui se pose
   plus tard :
     · de quel côté vient la décision  → qui doit quoi à qui ;
     · quand elle a été notifiée       → d'où court le préavis ;
     · quand le préavis s'achève       → jusqu'à quand on facture et on accueille.

   CE QUE LA RÉSILIATION FAIT, ET CE QU'ELLE NE FAIT PAS. Elle borne la ligne
   `enfants_contrats` à la fin du préavis : les présences s'arrêtent là. Elle ne
   touche PAS à `enfants.date_sortie`, qui marque un départ EFFECTIF — la poser
   d'avance ferait disparaître l'enfant des listes, des effectifs PMI et des
   commandes de repas avant qu'il ne soit parti. C'est la règle posée à la
   bascule, et elle vaut ici pour la même raison. */

function moisPlus(dateISO,mois){
  if(!dateISO)return '';
  const p=String(dateISO).slice(0,10).split('-').map(Number);
  if(p.length!==3)return '';
  const entiers=Math.floor(mois);
  const demi=(mois-entiers)>=0.5;
  const d=new Date(p[0],p[1]-1,p[2]);
  /* setMonth gère seul les fins de mois : le 31 janvier + 1 mois donne le
     3 mars, pas le 31 février. On ramène donc au dernier jour du mois visé
     quand le jour d'origine n'existe pas — un préavis d'un mois notifié le 31
     doit finir le 28 ou le 29, pas déborder sur le mois suivant. */
  const jour=d.getDate();
  d.setMonth(d.getMonth()+entiers);
  if(d.getDate()!==jour)d.setDate(0);
  if(demi)d.setDate(d.getDate()+15);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

/* Entrée directe depuis la carte du dossier : on pose le contrat courant, puis
   on ouvre la modale de résiliation sans passer par celle du contrat. */
function resilierDepuisFiche(id){
  contratId=id;
  CCUR=CONTRATS.find(x=>String(x.id)===String(id))||null;
  openResiliation();
}

function openResiliation(){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(!c){toast('Contrat introuvable.',true);return;}
  if(c.statut!=='contresigne'){
    toast('Seul un contrat contresigné peut être résilié.',true);return;
  }
  document.getElementById('rsInfo').innerHTML=
    '<div class="warn" style="background:var(--violet-l);color:var(--violet)">'
    +'<i class="ti ti-file-certificate"></i><span>Contrat <b>'+esc(c.numero||'')+'</b>, '
    +'du '+dfr(c.date_debut)+(c.date_fin?' au '+dfr(c.date_fin):' sans terme')
    +' · '+euro(c.total_mensuel)+' par mois.</span></div>';
  setVal('rsOrigine','famille');
  setVal('rsLe',auj());
  // La durée standard vient des Paramètres. Un mois est l'usage en crèche,
  // mais rien ne remplace ce que porte le règlement de fonctionnement.
  const mois=Number(RESEAU.preavis_mois!=null?RESEAU.preavis_mois:1);
  setVal('rsMois',isNaN(mois)?1:mois);
  setVal('rsMotif','');
  setVal('rsPar','');
  rsCalcule();
  const b=document.getElementById('btnRsGo');
  b.disabled=false;b.innerHTML='<i class="ti ti-file-x"></i> Résilier le contrat';
  openOv('ovResil');
}

/* La date de fin est PROPOSÉE, jamais imposée : un départ négocié, une
   dispense de préavis ou un préavis courant jusqu'à la fin du mois civil sont
   des cas réels que la règle générale ne couvre pas. Recalculer par-dessus une
   saisie manuelle effacerait la décision de la direction — on ne recalcule
   donc qu'au changement de la date de notification ou de la durée. */
function rsCalcule(){
  const le=val('rsLe');
  const mois=Number(val('rsMois'));
  if(le&&!isNaN(mois))setVal('rsFin',moisPlus(le,mois));
  rsSync();
}

function rsSync(){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  const orig=val('rsOrigine');
  document.getElementById('rsQuiHint').textContent=orig==='creche'
    ? 'Rupture à l\'initiative de la crèche : le motif sera opposable, rédigez-le précisément et '
      +'assurez-vous qu\'il correspond à un cas prévu par le règlement de fonctionnement.'
    : 'Départ à l\'initiative de la famille — le cas le plus courant. Le motif reste utile pour '
      +'le suivi du réseau, sans être opposable.';

  const fin=val('rsFin'),le=val('rsLe');
  const debut=c&&c.date_debut?String(c.date_debut).slice(0,10):'';
  /* DÉSISTEMENT AVANT ENTRÉE. Un contrat signé et contresigné en septembre pour
     une entrée en novembre peut être rompu entre les deux : la famille trouve
     une place ailleurs, déménage, renonce. La fin du préavis tombe alors AVANT
     le début de l'accueil — ce n'est pas une erreur de dates, c'est un accueil
     qui n'aura jamais lieu, et il fallait le traiter au lieu de le refuser. */
  const desistement=!!(debut&&fin&&fin<debut);
  const h=document.getElementById('rsFinHint');
  if(!fin){h.textContent='Renseignez la fin du préavis : elle détermine le dernier jour d\'accueil.';}
  else if(le&&fin<le){h.innerHTML='<b style="color:var(--red)">La fin du préavis précède sa notification.</b>';}
  else if(desistement){
    h.innerHTML='<b>L\'accueil n\'aura pas commencé</b> : le préavis s\'achève le '+dfr(fin)
      +', avant le début prévu au '+dfr(debut)+'.';
  }
  else{
    const auTerme=c&&c.date_fin&&fin>=String(c.date_fin).slice(0,10);
    h.innerHTML='Dernier jour d\'accueil : <b>'+dfr(fin)+'</b>. '
      +(auTerme
        ? 'Cette date atteint ou dépasse le terme prévu au contrat — l\'accueil irait donc à son terme normal.'
        : 'Modifiable : un départ négocié, une dispense de préavis ou un préavis courant jusqu\'à la fin '
          +'du mois civil ne suivent pas la règle générale.');
  }

  /* Ce que le bouton va réellement écrire, dit avant de cliquer. La ligne
     d'accueil pilote les présences : la borner n'est pas un détail
     administratif. */
  const box=document.getElementById('rsEffet');
  if(!c){box.innerHTML='';return;}
  if(desistement){
    /* La ligne d'accueil ne peut pas être close avant d'avoir commencé : une
       date de fin antérieure à sa date de début n'a aucun sens pour les
       présences. On la borne donc à son propre début — elle existe, mais ne
       couvre plus aucun jour — et on dit que la fiche enfant est à revoir,
       parce qu'un enfant jamais accueilli n'a rien à faire dans les effectifs. */
    box.innerHTML='<div class="warn"><i class="ti ti-alert-triangle"></i><span>'
      +'<b>Désistement avant l\'entrée.</b> L\'accueil devait commencer le '+dfr(debut)
      +' et n\'aura pas lieu.<br>'
      +'· le contrat passe en <b>Résilié</b>, avec la trace de qui a renoncé et quand ;<br>'
      +'· la ligne d\'accueil est ramenée au '+dfr(debut)+' — elle ne couvre plus aucun jour ;<br>'
      +'· <b>la fiche enfant reste en place.</b> Comme l\'enfant n\'aura jamais été accueilli, '
      +'elle est à revoir depuis le module Gestion : la laisser telle quelle la ferait compter '
      +'dans les effectifs.</span></div>';
    return;
  }
  box.innerHTML='<div class="warn"><i class="ti ti-info-circle"></i><span>'
    +'<b>Ce qui sera écrit :</b><br>'
    +'· le contrat passe en <b>Résilié</b> et n\'est plus modifiable ;<br>'
    +'· la ligne d\'accueil est close au <b>'+(fin?dfr(fin):'—')+'</b> — les feuilles de présence, '
    +'la vue Gantt et les commandes de repas s\'arrêtent à cette date ;<br>'
    +'· <b>la fiche enfant n\'est pas touchée.</b> Sa date de sortie marque un départ effectif : '
    +'vous la poserez le jour venu, depuis la fiche enfant.</span></div>';
}

async function resilier(){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(!c)return;
  const orig=val('rsOrigine');
  const le=val('rsLe'),fin=val('rsFin');
  const motif=val('rsMotif'),par=val('rsPar');

  if(!le){toast('Indiquez la date de notification.',true);return;}
  if(!fin){toast('Indiquez la fin du préavis.',true);return;}
  if(fin<le){toast('La fin du préavis ne peut pas précéder sa notification.',true);return;}
  /* Une fin de préavis antérieure au début de l'accueil n'est PAS une erreur :
     c'est un désistement avant l'entrée. Ce qui suit s'y adapte au lieu de le
     refuser — mais la ligne d'accueil, elle, ne peut pas se clore avant d'avoir
     commencé : on la borne à sa propre date de début. */
  const debutCt=c.date_debut?String(c.date_debut).slice(0,10):'';
  const desistement=!!(debutCt&&fin<debutCt);
  const finLigne=desistement?debutCt:fin;
  // Un motif de rupture à l'initiative de la crèche sera lu par un tiers.
  if(orig==='creche'&&motif.length<10){
    toast('Une rupture à l\'initiative de la crèche demande un motif écrit et précis.',true);return;
  }
  if(par.length<3){toast('Indiquez le nom de la personne qui notifie ou qui saisit.',true);return;}

  if(!confirm(desistement
    ? 'Résilier le contrat '+(c.numero||'')+' avant l\'entrée ?\n\n'
      +'L\'accueil devait commencer le '+dfr(debutCt)+' et n\'aura pas lieu.\n'
      +'La ligne d\'accueil sera ramenée à cette date et le contrat ne sera plus modifiable.\n\n'
      +'Pensez à revoir la fiche enfant : sans cela, l\'enfant continuera de compter dans les effectifs.'
    : 'Résilier le contrat '+(c.numero||'')+' ?\n\n'
      +'Dernier jour d\'accueil : '+dfr(fin)+'.\n'
      +'La ligne d\'accueil sera close à cette date et le contrat ne sera plus modifiable.'))return;

  const b=document.getElementById('btnRsGo');
  b.disabled=true;b.textContent='Enregistrement…';
  try{
    /* `.eq('statut','contresigne')` protège du double clic et d'une
       résiliation menée en parallèle depuis un autre poste. */
    const{data,error}=await sb.from('contrats').update({
      statut:'resilie',
      resilie_le:le,
      resilie_origine:orig,
      resilie_fin_preavis:fin,
      resilie_motif:motif,
      resilie_par:par,
      updated_at:new Date().toISOString()
    }).eq('id',c.id).eq('statut','contresigne').select();
    if(error)throw error;
    if(!data||!data.length)throw new Error('Ce contrat vient d\'être modifié ailleurs.');
    Object.assign(c,data[0]);

    /* La ligne d'accueil suit. Elle vient APRÈS l'écriture du contrat et dans
       son propre try : si elle échoue, la résiliation est enregistrée — c'est
       elle qui fait foi — et il reste à borner la ligne à la main. L'inverse
       aurait laissé une ligne close sans résiliation, c'est-à-dire un enfant
       sorti des présences sans qu'aucun document ne l'explique. */
    let ligneId=c.enfants_contrat_id;
    try{
      /* Les contrats nés avant que le rattachement existe — les dossiers de
         transition du 5 septembre — n'ont pas d'`enfants_contrat_id`. On
         retrouve alors la ligne d'accueil ouverte de l'enfant. */
      if(!ligneId&&c.enfant_id){
        const{data:l}=await sb.from('enfants_contrats')
          .select('id,date_debut,date_fin').eq('enfant_id',c.enfant_id)
          .order('date_debut',{ascending:false});
        const ouverte=(l||[]).find(x=>!x.date_fin||String(x.date_fin).slice(0,10)>=finLigne)
          ||(l||[])[0];
        ligneId=ouverte&&ouverte.id;
      }
      if(ligneId){
        const{error:eL}=await sb.from('enfants_contrats')
          .update({date_fin:finLigne,updated_at:new Date().toISOString()})
          .eq('id',ligneId);
        if(eL)throw eL;
      }else{
        throw new Error('aucune ligne d\'accueil rattachée');
      }
    }catch(x){
      console.error('[resiliation ligne accueil]',x);
      toast('Contrat résilié, mais la ligne d\'accueil n\'a pas pu être close au '+dfr(finLigne)
        +'. Posez la fin de contrat à la main depuis la fiche enfant, sinon les présences '
        +'continueront après le départ.',true);
    }

    closeOv('ovResil');closeOv('ovContrat');
    await recharger();
    rendreDossier();
    toast(desistement
      ? 'Contrat résilié avant l\'entrée — l\'accueil n\'aura pas lieu.'
      : 'Contrat résilié — dernier jour d\'accueil le '+dfr(fin)+'.');
  }catch(e){
    console.error('[resilier]',e);
    const msg=(e.code==='42703')
      ? 'Colonne resilie_origine absente — exécutez la partie 1 du script 34.'
      : (e.code==='23514'
        ? 'Une contrainte de la base refuse cette résiliation : '+(e.message||'')
        : (e.message||'erreur inconnue'));
    toast('Résiliation impossible : '+msg,true);
    b.disabled=false;b.innerHTML='<i class="ti ti-file-x"></i> Résilier le contrat';
  }
}
