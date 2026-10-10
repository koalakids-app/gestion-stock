
// ── La fiche ──────────────────────────────────────────────────────────────

function stgOpenFiche(id,typeDefaut){
  stgFicheId=id||null;
  const s=id?stgCache.find(x=>String(x.id)===String(id)):null;
  const v=(el,val)=>{const e=document.getElementById(el);if(e)e.value=val==null?'':val;};
  const type=s?stgType(s):(typeDefaut==='alternant'?'alternant':'stagiaire');

  document.getElementById('stg-modal-title').textContent=
    s?stgNomComplet(s):'Nouvelle fiche';
  v('stg-f-type',type);

  const selC=document.getElementById('stg-f-creche');
  if(selC)selC.innerHTML=stgOptionsCreches('— Choisir la crèche —');
  stgRemplirReferents(s?s.creche_id:null);

  v('stg-f-prenom',s&&s.prenom);       v('stg-f-nom',s&&s.nom);
  v('stg-f-email',s&&s.email);         v('stg-f-tel',s&&s.telephone);
  v('stg-f-ecole',s&&s.ecole);         v('stg-f-formation',s&&s.formation);
  v('stg-f-niveau',s&&s.niveau);       v('stg-f-creche',s?(s.creche_id||''):(isDirection?'':(currentProfile&&currentProfile.creche_id)||''));
  v('stg-f-referent',s?(s.accompagnant_employe_id?'e:'+s.accompagnant_employe_id:(s.referent_id?'r:'+s.referent_id:'')):'');
  v('stg-f-statut',s?s.statut:'demande');
  v('stg-f-demande',s?s.demande_le:todayStr());
  v('stg-f-padlet',s&&s.padlet_url);
  v('stg-f-debut',s&&s.date_debut);    v('stg-f-fin',s&&s.date_fin);
  v('stg-f-conv',s?s.convention_statut:'a_demander');
  v('stg-f-conv-date',s&&s.convention_le);
  v('stg-f-notes',s&&s.notes);
  v('stg-f-bilan',s&&s.bilan);         v('stg-f-bilan-date',s&&s.bilan_le);

  const apres=document.getElementById('stg-apres-creation');
  if(apres)apres.style.display=s?'':'none';
  const del=document.getElementById('stg-f-del');
  if(del)del.style.display=s?'':'none';

  stgTypeChange();
  stgDocExtCache=[];
  const docExtZone=document.getElementById('stg-doc-ext-zone');
  if(docExtZone)docExtZone.innerHTML='';
  if(s){stgRenderLien();stgRenderRessFiche();stgRenderExportZone(s);stgRenderDocs();stgRenderJours();stgRenderCollabZone();stgLoadDocExt(s.id);}
  else{const ez=document.getElementById('stg-export-zone');if(ez)ez.innerHTML='';}
  document.getElementById('modal-stagiaire-wrap').classList.add('open');
}

/* Changer le type ne change aucune donnée : il change le vocabulaire de la
   fiche et la liste des pièces demandées. Un alternant à qui on réclame une
   convention de stage rappelle la crèche pour demander ce qu'il doit envoyer —
   c'est exactement ce qu'on veut éviter. */
function stgTypeChange(){
  const type=(document.getElementById('stg-f-type')||{}).value==='alternant'?'alternant':'stagiaire';
  const p=STG_PROFILS[type];
  const txt=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  txt('stg-lbl-debut','Début '+(type==='alternant'?"de l'alternance":'du stage'));
  txt('stg-lbl-fin','Fin '+(type==='alternant'?"de l'alternance":'du stage'));
  txt('stg-lbl-conv',p.contrat);
  txt('stg-lbl-conv-date',p.contratCourt+' — date');
  txt('stg-lbl-bilan','Bilan de fin '+(type==='alternant'?"d'alternance":'de stage'));
  txt('stg-opt-encours',type==='alternant'?'Alternance en cours':'Stage en cours');
  txt('stg-opt-termine',type==='alternant'?'Alternance terminée':'Stage terminé');
  /* Les pièces demandées ne sont pas les mêmes : on redessine le bloc si la
     fiche est déjà enregistrée. */
  if(stgFicheId){stgRenderDocs(type);stgRenderRessFiche(type);stgRenderCollabZone();}
}

/* Les directrices techniques proposées sont celles de la crèche choisie : offrir celles des
   autres sites n'aurait aucun sens sur une fiche de stage.
   La direction et la coordination, elles, apparaissent toujours et quelle que
   soit la crèche — accompagner un stagiaire ou un alternant fait partie du
   travail de coordination, et il fallait pouvoir s'y inscrire soi-même. */
function stgRemplirReferents(crecheId){
  const sel=document.getElementById('stg-f-referent');
  if(!sel)return;
  const cid=crecheId||((document.getElementById('stg-f-creche')||{}).value||'');
  const refs=cacheReferents.filter(r=>r.role==='referent'&&(!cid||String(r.creche_id)===String(cid)));
  const dirs=cacheReferents.filter(r=>r.role==='direction');
  const opt=r=>'<option value="r:'+escHtml(String(r.id))+'">'+escHtml(r.name||'—')
    +(r.poste?' — '+escHtml(r.poste):'')+'</option>';
  const nomEmp=e=>((e.prenom||'')+' '+(e.nom||'')).trim()||'—';
  const optEmp=e=>'<option value="e:'+escHtml(String(e.id))+'">'+escHtml(nomEmp(e))
    +(e.poste?' — '+escHtml(e.poste):'')+'</option>';
  /* Tous les salariés de la crèche peuvent accompagner, pas seulement les
     comptes referents : on évite de se proposer soi-même un·e alternant·e. */
  const fiche=stgFicheId?stgCache.find(x=>String(x.id)===String(stgFicheId)):null;
  const emps=(typeof cacheEmployes!=='undefined'?cacheEmployes:[])
    .filter(e=>(!cid||String(e.creche_id)===String(cid))&&!(fiche&&fiche.employe_id&&String(fiche.employe_id)===String(e.id)))
    .sort((a,b)=>nomEmp(a).localeCompare(nomEmp(b),'fr'));
  const val=sel.value;
  sel.innerHTML='<option value="">— Non désignée —</option>'
    +(refs.length?'<optgroup label="Directeurs/trices techniques de la crèche">'+refs.map(opt).join('')+'</optgroup>':'')
    +(dirs.length?'<optgroup label="Direction et coordination">'+dirs.map(opt).join('')+'</optgroup>':'')
    +(emps.length?'<optgroup label="Salariés de la structure">'+emps.map(optEmp).join('')+'</optgroup>':'');
  /* Une personne enregistrée sur la fiche mais absente des groupes (elle a
     changé de crèche depuis) resterait perdue en silence : on la remet. */
  if(val){
    sel.value=val;
    if(sel.value!==val){
      const id=val.slice(2);
      const r=val.startsWith('e:')?cacheEmployes.find(x=>String(x.id)===id):cacheReferents.find(x=>String(x.id)===id);
      if(r){sel.insertAdjacentHTML('beforeend','<optgroup label="Déjà enregistrée">'+(val.startsWith('e:')?optEmp(r):opt(r))+'</optgroup>');sel.value=val;}
    }
  }
}

/* Passer une stagiaire en « terminé » sans bilan, c'est perdre le bilan :
   personne ne rouvre une fiche close. On le rappelle au moment où ça se joue. */
function stgStatutChange(){
  const st=(document.getElementById('stg-f-statut')||{}).value;
  const bilan=(document.getElementById('stg-f-bilan')||{}).value;
  if(st==='termine'&&!bilan&&stgFicheId){
    showBanner('Stage terminé : pensez au bilan, plus bas dans la fiche.','error');
  }
}

async function stgSave(){
  const val=id=>{const e=document.getElementById(id);return e?e.value.trim():'';};
  const prenom=val('stg-f-prenom');
  if(!prenom)return showBanner('Le prénom est obligatoire.','error');
  /* La règle de sécurité de la table n'admet que les fiches rattachées à une
     crèche (de son organisation, ou de la référente qui saisit) : sans crèche,
     Supabase refuse l'enregistrement avec un message incompréhensible. */
  if(!val('stg-f-creche'))return showBanner('Choisissez la crèche : une fiche sans crèche ne peut pas être enregistrée.','error');

  const row={
    type_contrat:val('stg-f-type')==='alternant'?'alternant':'stagiaire',
    prenom:prenom,
    nom:val('stg-f-nom')||null,
    email:val('stg-f-email')||null,
    telephone:val('stg-f-tel')||null,
    ecole:val('stg-f-ecole')||null,
    formation:val('stg-f-formation')||null,
    niveau:val('stg-f-niveau')||null,
    creche_id:val('stg-f-creche')||null,
    referent_id:(val('stg-f-referent')||'').startsWith('r:')?val('stg-f-referent').slice(2):null,
    accompagnant_employe_id:(val('stg-f-referent')||'').startsWith('e:')?val('stg-f-referent').slice(2):null,
    statut:val('stg-f-statut')||'demande',
    demande_le:val('stg-f-demande')||null,
    padlet_url:val('stg-f-padlet')||null,
    date_debut:val('stg-f-debut')||null,
    date_fin:val('stg-f-fin')||null,
    convention_statut:val('stg-f-conv')||'a_demander',
    convention_le:val('stg-f-conv-date')||null,
    notes:val('stg-f-notes')||null
  };
  /* Les champs de bilan n'existent dans le DOM qu'après création : les lire
     sur une nouvelle fiche écraserait la valeur par une chaîne vide. */
  if(stgFicheId){
    row.bilan=val('stg-f-bilan')||null;
    row.bilan_le=val('stg-f-bilan-date')||null;
  }
  if(row.date_debut&&row.date_fin&&row.date_fin<row.date_debut)
    return showBanner('La fin du stage est avant son début.','error');

  const btn=document.getElementById('stg-f-save');
  if(btn)btn.disabled=true;
  const creation=!stgFicheId;
  let ok=false;
  if(stgFicheId){
    ok=await dbUpdate('stagiaires',stgFicheId,row);
  }else{
    const saved=await dbInsert('stagiaires',row);
    ok=!!saved;
    if(saved)stgFicheId=saved.id;
  }
  /* Si le script 31 n'a pas encore été exécuté, la colonne type_contrat
     n'existe pas : plutôt que de perdre la saisie, on réenregistre sans elle
     et on dit pourquoi le type n'a pas été retenu. */
  if(!ok&&/type_contrat/i.test(window._lastDbError||'')){
    delete row.type_contrat;
    ok=stgFicheId?await dbUpdate('stagiaires',stgFicheId,row)
                 :!!(await dbInsert('stagiaires',row).then(r=>{if(r)stgFicheId=r.id;return r;}));
    if(ok)showBanner('Fiche enregistrée, mais le type (stagiaire / alternant) n\'a pas pu l\'être : le script 31 n\'a pas encore été exécuté sur Supabase.','error');
  }
  if(btn)btn.disabled=false;
  if(!ok){
    return showBanner('Enregistrement impossible'
      +(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  }
  await stgLoad();
  /* À la création, la fiche reste ouverte : le lien de dépôt, les documents et
     les jours n'existent qu'une fois la personne enregistrée, et c'est là qu'on
     enchaîne. Sur une fiche déjà connue, « Enregistrer » veut dire « j'ai
     fini » : on ferme. */
  if(creation){
    showBanner('Fiche créée — vous pouvez maintenant créer le lien de dépôt et saisir les jours ✅');
    stgOpenFiche(stgFicheId);
  }else{
    closeModal('modal-stagiaire-wrap');
    showBanner('Fiche enregistrée ✅');
  }
}

async function stgSupprimer(){
  if(!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const docs=stgDocsDe(stgFicheId);
  if(!confirm('Supprimer définitivement la fiche de '+stgNomComplet(s||{})+' ?\n\n'
    +(docs.length?docs.length+' document(s) déposé(s) et ':'')
    +'tous ses jours de présence seront effacés.'))return;
  /* Les fichiers d'abord : la ligne supprimée, on n'aurait plus leur chemin et
     ils resteraient dans le bucket pour toujours. */
  const chemins=docs.map(d=>d.path).filter(Boolean);
  if(chemins.length){
    const {error}=await sb.storage.from(STG_BUCKET).remove(chemins);
    if(error)console.warn('[Stagiaires] fichiers non supprimés',error.message);
  }
  const ok=await dbDelete('stagiaires',stgFicheId);
  if(!ok)return showBanner('Suppression impossible.','error');
  closeModal('modal-stagiaire-wrap');
  stgFicheId=null;
  await stgLoad();
  showBanner('Fiche supprimée.');
}

// ── Le lien de dépôt ──────────────────────────────────────────────────────

function stgToken(){
  const a=new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,32);
}
function stgLienUrl(token){
  return location.origin+location.pathname.replace(/[^/]*$/,'')+'stagiaire.html?t='+token;
}

function stgRenderLien(){
  const zone=document.getElementById('stg-lien-zone');
  if(!zone)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s){zone.innerHTML='';return;}
  const actif=s.token&&s.token_expire_le&&new Date(s.token_expire_le).getTime()>Date.now();

  let h='<div style="font-weight:700;font-size:13px;margin-bottom:8px">'
    +'<i class="ti ti-link" style="color:var(--koala)"></i> Lien de dépôt des documents</div>';

  if(!s.token){
    const rappel=stgLienDateRappel(s);
    const tard=stgLienAEnvoyer(s);
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.5">'
      +'La personne dépose ses pièces elle-même depuis son téléphone, sans compte ni application. '
      +'Le lien restera valable jusqu\'au <b>'+escHtml(stgDateFr(stgLienExpiration(s)))+'</b>'
      +(s.date_fin?' — soit '+STG_LIEN_APRES+' jours après la fin '
        +(stgType(s)==='alternant'?"de l'alternance":'du stage'):'')+'.</p>';
    /* Une demande arrivée six mois à l'avance n'a pas besoin de son lien tout
       de suite : il se perdrait, et la personne aurait tout oublié le jour du
       stage. On dit quand ce sera le moment, sans l'empêcher de le créer. */
    if(tard){
      h+='<div style="background:var(--orange-light);border-left:4px solid var(--orange-dark);border-radius:0 8px 8px 0;'
        +'padding:9px 12px;font-size:12.5px;color:#8a4b00;margin-bottom:10px">'
        +'<i class="ti ti-send"></i> <strong>C\'est le moment de lui envoyer son lien</strong> — '
        +(stgType(s)==='alternant'?"l'alternance commence":'le stage commence')+' le '
        +escHtml(stgDateFr(s.date_debut))+'.</div>';
    }else if(rappel){
      h+='<div style="background:var(--koala-light);border-left:4px solid var(--koala);border-radius:0 8px 8px 0;'
        +'padding:9px 12px;font-size:12.5px;color:var(--koala-dark);margin-bottom:10px">'
        +'<i class="ti ti-clock"></i> Rien ne presse : '
        +(stgType(s)==='alternant'?"l'alternance commence":'le stage commence')+' le <b>'
        +escHtml(stgDateFr(s.date_debut))+'</b>. La fiche passera en '
        +'<strong>« lien à envoyer »</strong> le <b>'+escHtml(stgDateFr(rappel))+'</b>'
        +' — vous pouvez aussi le créer dès maintenant si elle le demande.</div>';
    }
    h+='<button class="btn-primary" onclick="stgCreerLien()"><i class="ti ti-link-plus"></i> Créer le lien</button>';
  }else{
    h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">'
      +'<input class="finput" id="stg-lien-url" readonly value="'+escHtml(stgLienUrl(s.token))+'" style="flex:1;min-width:220px;font-size:12px">'
      +'<button class="btn-sm" onclick="stgCopierLien()"><i class="ti ti-copy"></i> Copier</button>'
      +(s.email?'<a class="btn-sm" style="text-decoration:none" href="'+stgMailto(s)+'"><i class="ti ti-mail"></i> Envoyer par mail</a>':'')
      +(stgTelIntl(s.telephone)?'<a class="btn-sm" style="text-decoration:none" href="'+stgSmsUrl(s)+'"><i class="ti ti-message"></i> SMS</a>'
        +'<a class="btn-sm" style="text-decoration:none" target="_blank" rel="noopener" href="'+stgWhatsAppUrl(s)+'"><i class="ti ti-brand-whatsapp"></i> WhatsApp</a>':'')
      +(navigator.share?'<button class="btn-sm" onclick="stgPartagerLien()"><i class="ti ti-share"></i> Partager…</button>':'')
      +'<button class="btn-sm" onclick="stgAfficherQr()"><i class="ti ti-qrcode"></i> QR code</button>'
      +'<button class="btn-sm" onclick="stgCreerLien(true)"><i class="ti ti-refresh"></i> Renouveler</button>'
      +'</div>'
      +'<div style="font-size:12px;color:'+(actif?'var(--muted)':'var(--red)')+'">'
      +(actif?'<i class="ti ti-clock"></i> Valable jusqu\'au '+escHtml(stgDateFr(s.token_expire_le))
             :'<i class="ti ti-clock-off"></i> Lien expiré le '+escHtml(stgDateFr(s.token_expire_le))
              +' — « Renouveler » en crée un nouveau')
      +'</div>';
  }
  zone.innerHTML=h;
}

/* Ce que la personne trouvera EN PLUS sur son lien. La phrase n'est écrite
   que s'il y a effectivement quelque chose à lire ou à remplir : annoncer un
   projet pédagogique qui n'est pas en ligne ferait plus de mal que de bien.
   Le PDF n'est pas joint au mail — il vit sur le lien, où il reste à jour et
   où l'on sait qui l'a ouvert. */
function stgMailtoRess(s){
  const liste=stgRessPour(s);
  if(!liste.length)return '';
  const docs=liste.filter(r=>stgRessNature(r)!=='lien').map(r=>r.libelle);
  const liens=liste.filter(r=>stgRessNature(r)==='lien').map(r=>r.libelle);
  let t='Vous y trouverez aussi, en haut de la page :\n';
  docs.forEach(l=>{t+='  · '+l+' (à lire)\n';});
  liens.forEach(l=>{t+='  · '+l+' (à remplir en ligne)\n';});
  return t+'\n';
}

/* Le message qui accompagne le lien, quel que soit le canal (mail, SMS,
   WhatsApp, partage) : un seul texte, donc un seul endroit à corriger. */
function stgMessageLien(s){
  const p=stgProfil(s);
  const orgNom=(window.KK_ORG&&window.KK_ORG.nom)||'Koala Kids';
  return 'Bonjour '+(s.prenom||'')+',\n\n'
    +'Voici le lien pour nous transmettre les documents nécessaires à votre '+p.periode
    +(s.creche_id?' à la crèche '+stgCrecheName(s.creche_id):'')+' :\n\n'
    +stgLienUrl(s.token)+'\n\n'
    +stgMailtoRess(s)
    +'Vous pouvez photographier vos pièces directement avec votre téléphone, en plusieurs fois.\n'
    +'Ce lien est valable jusqu\'au '+stgDateFr(s.token_expire_le)+'.\n\n'
    +'À bientôt,\nL\'équipe '+orgNom;
}

/* Le mail est composé dans le client de messagerie du poste : rien ne part
   d'ici, et il n'y a donc pas d'adresse d'expédition à configurer. */
function stgMailto(s){
  const orgNom=(window.KK_ORG&&window.KK_ORG.nom)||'Koala Kids';
  const sujet='Vos documents '+(stgType(s)==='alternant'?"d'alternance":'de stage')+' — '+orgNom;
  return 'mailto:'+encodeURIComponent(s.email||'')
    +'?subject='+encodeURIComponent(sujet)+'&body='+encodeURIComponent(stgMessageLien(s));
}

/* Numéro au format international sans « + » (06 12 34 56 78 -> 33612345678),
   ou '' si ce n'est pas un numéro exploitable. Un numéro à 10 chiffres sans
   indicatif est pris pour un numéro français. */
function stgTelIntl(tel){
  let t=String(tel||'').trim();
  if(!t)return '';
  const plus=t.startsWith('+');
  t=t.replace(/\D/g,'');
  if(!plus&&t.startsWith('00'))t=t.slice(2);
  else if(!plus&&/^0\d{9}$/.test(t))t='33'+t.slice(1);
  return /^\d{9,15}$/.test(t)?t:'';
}
/* SMS et WhatsApp s'ouvrent sur le téléphone / l'application de la personne qui
   envoie : rien ne transite par nos serveurs, et aucun compte n'est à configurer. */
function stgSmsUrl(s){
  return 'sms:+'+stgTelIntl(s.telephone)+'?&body='+encodeURIComponent(stgMessageLien(s));
}
function stgWhatsAppUrl(s){
  return 'https://wa.me/'+stgTelIntl(s.telephone)+'?text='+encodeURIComponent(stgMessageLien(s));
}
/* Feuille de partage du téléphone ou de l'ordinateur (Messenger, Signal, AirDrop…). */
function stgPartagerLien(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s||!s.token||!navigator.share)return;
  navigator.share({title:'Vos documents de '+(stgType(s)==='alternant'?'alternance':'stage'),text:stgMessageLien(s)})
    .catch(()=>{});   // fermeture de la feuille par l'utilisateur : pas une erreur
}
/* QR code à scanner avec le téléphone de la personne, quand elle est là en face
   (visite, entretien) : aucune saisie de numéro ni d'adresse. Généré dans le
   navigateur, le lien ne part vers aucun service tiers. */
function stgAfficherQr(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s||!s.token)return;
  const box=document.getElementById('stg-qr-box');
  box.innerHTML='';
  if(typeof QRCode==='function'){
    new QRCode(box,{text:stgLienUrl(s.token),width:240,height:240,correctLevel:QRCode.CorrectLevel.M});
  }else{
    return showBanner('QR code indisponible — copiez le lien à la place.','error');
  }
  document.getElementById('stg-qr-nom').textContent=((s.prenom||'')+' '+(s.nom||'')).trim();
  document.getElementById('modal-stg-qr-wrap').classList.add('open');
}

/* Premier contact après une demande de stage, AVANT toute fiche : on propose un
   entretien et on demande les disponibilités (sans signature : Outlook ajoute la sienne), pour savoir si l'on enclenche le
   recrutement. Composé dans le client de messagerie — rien ne part d'ici.
   `s` n'est pas une fiche : {prenom, nom, email, type, creche_id}. */
function stgMailtoInfos(s){
  const orgNom=(window.KK_ORG&&window.KK_ORG.nom)||'Koala Kids';
  const alt=s.type==='alternant';
  const crNom=stgCrecheName(s.creche_id);
  const sujet='Votre demande '+(alt?"d'alternance":'de stage')+' — '+orgNom;
  const corps='Bonjour '+((s.prenom+' '+s.nom).trim())+',\n\n'
    +'Je vous écris suite à votre demande '+(alt?"d'alternance":'de stage')+' au sein du groupe '+orgNom
    +', je souhaiterais vous rencontrer afin de discuter de votre projet professionnel, et de voir ensemble si nous pouvons convenir de dates pour votre '
    +(alt?'alternance':'stage')+'. '
    +'Donnez-moi vos disponibilités afin que je vous propose un rendez-vous pour un entretien'
    +(crNom?' sur la crèche '+crNom:'')+'.\n\n'
    +'Je vous souhaite une bonne fin de journée.\n\n';
  return 'mailto:'+encodeURIComponent(s.email||'')
    +'?subject='+encodeURIComponent(sujet)+'&body='+encodeURIComponent(corps);
}

function stgOuvrirInfos(){
  const sel=document.getElementById('stg-i-creche');
  sel.innerHTML=stgOptionsCreches('— Choisir la crèche —');
  if(!isDirection&&currentProfile&&currentProfile.creche_id)sel.value=currentProfile.creche_id;
  ['stg-i-prenom','stg-i-nom','stg-i-email'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('stg-i-type').value='stagiaire';
  document.getElementById('modal-stg-infos-wrap').classList.add('open');
}

function stgEnvoyerInfos(){
  const v=id=>document.getElementById(id).value.trim();
  if(!v('stg-i-email'))return showBanner("Renseignez l'e-mail de la personne.",'error');
  if(!v('stg-i-creche'))return showBanner('Choisissez la crèche.','error');
  closeModal('modal-stg-infos-wrap');
  location.href=stgMailtoInfos({prenom:v('stg-i-prenom'),nom:v('stg-i-nom'),email:v('stg-i-email'),
    type:v('stg-i-type'),creche_id:v('stg-i-creche')});
}

async function stgCreerLien(renouveler){
  if(!stgFicheId)return;
  if(renouveler&&!confirm('Créer un nouveau lien ?\n\nL\'ancien cessera immédiatement de fonctionner.'))return;
  const token=stgToken();
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const expire=stgLienExpiration(s);
  const ok=await dbUpdate('stagiaires',stgFicheId,{
    token:token,token_expire_le:expire,lien_envoye_le:new Date().toISOString()
  });
  if(!ok)return showBanner('Création du lien impossible.','error');
  await stgLoad();
  stgRenderLien();
  showBanner(renouveler?'Nouveau lien créé — l\'ancien ne fonctionne plus.':'Lien créé ✅');
}

function stgCopierLien(){
  const el=document.getElementById('stg-lien-url');
  if(!el)return;
  el.select();
  navigator.clipboard.writeText(el.value)
    .then(()=>showBanner('Lien copié — collez-le dans un SMS ou un mail ✅'))
    .catch(()=>{try{document.execCommand('copy');showBanner('Lien copié ✅');}
                catch(e){showBanner('Copie impossible — sélectionnez le lien à la main.','error');}});
}

// ── Les documents ─────────────────────────────────────────────────────────

/* `typeForce` vient de stgTypeChange() : la fiche en cours d'édition peut avoir
   changé de type sans être encore enregistrée. */
function stgRenderDocs(typeForce){
  const zone=document.getElementById('stg-docs-zone');
  if(!zone||!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const type=typeForce||stgType(s);
  const docs=stgDocsDe(stgFicheId);
  const oblig=stgTypesPour(type).filter(t=>t.actif&&t.obligatoire);
  const couverts=new Set(docs.filter(d=>d.statut!=='refuse').map(d=>String(d.type_id)));
  const faitsN=oblig.filter(t=>couverts.has(String(t.id))).length;
  const av={faits:faitsN,total:oblig.length,complet:oblig.length>0&&faitsN===oblig.length};
  const actifs=stgTypesPour(type).filter(t=>t.actif);

  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-paperclip" style="color:var(--koala)"></i> Documents</div>'
    +'<span style="font-size:12px;color:'+(av.complet?'var(--green)':'var(--muted)')+';font-weight:600">'
    +av.faits+' / '+av.total+' pièce'+(av.total>1?'s':'')+' obligatoire'+(av.total>1?'s':'')+'</span></div>';

  h+=actifs.map(t=>{
    const fs=docs.filter(d=>String(d.type_id)===String(t.id));
    const ok=fs.some(d=>d.statut!=='refuse');
    return '<div style="border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:7px;background:'+(ok?'#FCFEFC':'#fff')+'">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      +'<i class="ti ti-'+(ok?'circle-check':'circle-dashed')+'" style="color:'+(ok?'var(--green)':'var(--muted)')+'"></i>'
      +'<span style="font-weight:600;font-size:12.5px;flex:1;min-width:120px">'+escHtml(t.libelle)
      +(t.obligatoire?'':'<span style="color:var(--muted);font-weight:400"> (facultatif)</span>')+'</span>'
      +'<button class="btn-sm" onclick="document.getElementById(\'stg-up-'+t.id+'\').click()">'
      +'<i class="ti ti-upload"></i> Téléverser</button>'
      +'<input type="file" id="stg-up-'+t.id+'" data-type="'+t.id+'" accept="image/*,application/pdf" '
      +'style="display:none" onchange="stgUpload(event)">'
      +'</div>'
      +(fs.length?'<div style="display:flex;flex-direction:column;gap:5px;margin-top:7px">'
        +fs.map(stgLigneDoc).join('')+'</div>':'')
      +'<span id="stg-upst-'+t.id+'" style="font-size:11.5px;color:var(--muted)"></span>'
      +'</div>';
  }).join('');

  /* Une pièce dont le type a été supprimé du catalogue ne doit pas disparaître
     de la fiche : le document existe, il a été reçu, il se voit. */
  const orphelins=docs.filter(d=>!actifs.find(t=>String(t.id)===String(d.type_id)));
  if(orphelins.length){
    h+='<div style="border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:7px">'
      +'<div style="font-weight:600;font-size:12.5px;margin-bottom:6px">Autres documents reçus</div>'
      +'<div style="display:flex;flex-direction:column;gap:5px">'+orphelins.map(stgLigneDoc).join('')+'</div></div>';
  }
  if(!actifs.length){
    h+='<p style="font-size:12.5px;color:var(--muted)">Aucune pièce n\'est demandée pour le moment '
      +'— la liste se règle dans l\'onglet « Pièces demandées ».</p>';
  }
  zone.innerHTML=h;
}

function stgLigneDoc(d){
  const st=d.statut==='valide'?{t:'Validé',c:'var(--green)',b:'var(--green-light)'}
          :d.statut==='refuse'?{t:'Refusé',c:'var(--red)',b:'var(--red-light)'}
          :{t:'Reçu',c:'var(--orange-dark)',b:'var(--orange-light)'};
  return '<div style="display:flex;align-items:center;gap:7px;background:#FAFAFD;border:1px solid var(--border);border-radius:7px;padding:6px 9px;flex-wrap:wrap">'
    +'<button type="button" onclick="stgOuvrirDoc(\''+d.id+'\')" title="Ouvrir" '
    +'style="flex:1;min-width:110px;text-align:left;border:none;background:none;padding:0;cursor:pointer;'
    +'font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;'
    +'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    +escHtml(d.filename||'Document')+'</button>'
    +'<span style="background:'+st.b+';color:'+st.c+';border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">'+st.t+'</span>'
    +'<span style="font-size:10.5px;color:var(--muted)">'+escHtml(d.depose_par==='stagiaire'?'déposé via le lien':(d.depose_par||''))+'</span>'
    +(d.statut!=='valide'?'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--green)" title="Valider" onclick="stgStatutDoc(\''+d.id+'\',\'valide\')"><i class="ti ti-check"></i></button>':'')
    +(d.statut!=='refuse'?'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--orange-dark)" title="Refuser" onclick="stgStatutDoc(\''+d.id+'\',\'refuse\')"><i class="ti ti-x"></i></button>':'')
    +'<button class="ibtn" style="width:26px;height:26px;font-size:13px;color:var(--red)" title="Supprimer" onclick="stgSupprimerDoc(\''+d.id+'\')"><i class="ti ti-trash"></i></button>'
    +(d.statut==='refuse'&&d.commentaire
      ? '<div style="flex:0 0 100%;font-size:11px;color:var(--red)">Motif : '+escHtml(d.commentaire)+'</div>':'')
    +'</div>';
}

/* Le bucket est privé : l'URL est signée au moment du clic et expire. Rien
   n'est stocké, rien ne se transfère. */
async function stgOuvrirDoc(id){
  const d=stgDocsCache.find(x=>String(x.id)===String(id));
  if(!d||!d.path)return alert('Fichier introuvable.');
  const {data,error}=await sb.storage.from(d.bucket||STG_BUCKET).createSignedUrl(d.path,STG_URL_TTL);
  if(error||!data)return alert('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'));
  window.open(data.signedUrl,'_blank','noopener');
}

async function stgUpload(ev){
  const input=ev.target;
  const file=(input.files||[])[0];
  const typeId=input.dataset.type;
  input.value='';
  if(!file||!stgFicheId)return;
  const st=document.getElementById('stg-upst-'+typeId);
  if(file.size>12*1024*1024){
    if(st)st.textContent='⚠ Fichier trop lourd (12 Mo maximum).';
    return;
  }
  const type=stgTypes.find(t=>String(t.id)===String(typeId));
  if(st)st.textContent='⏳ Envoi de '+file.name+'…';
  try{
    const ext=(file.name.split('.').pop()||'bin');
    const path=stgFicheId+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
    /* Client authentifié (sb) : le bucket est privé et ses policies exigent un
       compte présent dans referents. */
    const {error}=await sb.storage.from(STG_BUCKET).upload(path,file);
    if(error)throw error;
    const {data:ins,error:insErr}=await sb.from('stagiaires_documents').insert({
      stagiaire_id:stgFicheId,type_id:typeId,
      libelle:(type&&type.libelle)||'Document',
      bucket:STG_BUCKET,path:path,filename:file.name,
      mime:file.type||null,taille:file.size,statut:'recu',
      depose_par:(currentProfile&&currentProfile.name)||(currentUser&&currentUser.email)||'la crèche'
    }).select().single();
    if(insErr){
      /* Sans sa ligne, le fichier serait orphelin dans le bucket. */
      await sb.storage.from(STG_BUCKET).remove([path]);
      throw insErr;
    }
    stgDocsCache.push(ins);
    if(st)st.textContent='';
    stgRenderDocs();stgRender();
    showBanner('Document ajouté ✅');
  }catch(e){
    console.error('[Stagiaires] upload',e.message);
    if(st)st.textContent='⚠ Erreur : '+e.message;
  }
}

async function stgStatutDoc(id,statut){
  const d=stgDocsCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  let motif=d.commentaire||null;
  if(statut==='refuse'){
    /* Un refus sans motif oblige la stagiaire à deviner ce qui ne va pas —
       elle renverra la même photo floue. */
    motif=prompt('Pourquoi ce document est-il refusé ?\n(la stagiaire verra ce motif)',
                 motif||'Document illisible, merci de le renvoyer');
    if(motif===null)return;
  }
  const ok=await dbUpdate('stagiaires_documents',id,{statut:statut,commentaire:statut==='refuse'?motif:null});
  if(!ok)return showBanner('Modification impossible.','error');
  d.statut=statut;d.commentaire=statut==='refuse'?motif:null;
  stgRenderDocs();stgRender();
  showBanner(statut==='valide'?'Document validé ✅':'Document refusé — la stagiaire en est informée sur son lien.');
}

async function stgSupprimerDoc(id){
  const d=stgDocsCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Supprimer « '+(d.filename||'ce document')+' » ?'))return;
  const ok=await dbDelete('stagiaires_documents',id);
  if(!ok)return showBanner('Suppression impossible.','error');
  const {error}=await sb.storage.from(d.bucket||STG_BUCKET).remove([d.path]);
  if(error)console.warn('[Stagiaires] fichier non supprimé du stockage',error.message);
  stgDocsCache=stgDocsCache.filter(x=>String(x.id)!==String(id));
  stgRenderDocs();stgRender();
  showBanner('Document supprimé.');
}

/* ===== DOCUMENTS SUR SUPPORT EXTERNE (registre papier/coffre-fort) =========
   Table documents_externes (voir sql/documents_externes.sql et
   sql/documents_externes_stagiaires.sql) : ne stocke aucun fichier, juste la
   trace qu'une pièce existe et où elle est physiquement conservée. Même
   module que côté enfants (js/enfants.js) et employés (employes.html),
   entite_type='stagiaire' ici. Pas d'archivage propre à ajouter : le statut
   du dossier (demande/en_cours/termine/refuse/annule) joue déjà ce rôle et
   masque déjà les dossiers clos de la vue « actives » par défaut. */
const STG_DOC_EXT_SUPPORTS={papier:'Papier','coffre-fort':'Coffre-fort',classeur:'Classeur',autre:'Autre'};
const STG_DOC_EXT_CATEGORIES={identite:'Identité',sante:'Santé',comptable:'Comptable',rh:'RH',autre:'Autre'};

let stgDocExtCache=[];
async function stgLoadDocExt(stagiaireId){
  try{
    const{data,error}=await sb.from('documents_externes')
      .select('*')
      .eq('entite_type','stagiaire')
      .eq('entite_id',stagiaireId)
      .order('created_at',{ascending:false});
    if(error)throw error;
    stgDocExtCache=data||[];
  }catch(err){
    console.warn('stgLoadDocExt',err);
    stgDocExtCache=[];
  }
  if(String(stgFicheId)!==String(stagiaireId))return;
  stgRenderDocExt();
}
function stgRenderDocExt(){
  const zone=document.getElementById('stg-doc-ext-zone');
  if(!zone)return;
  const ligne=d=>{
    const detruit=d.detruit_le
      ?'<span style="background:var(--koala-light,#EEEDF8);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Détruit le '+new Date(d.detruit_le).toLocaleDateString('fr-FR')+'</span>'
      :'<button type="button" class="btn-sm" onclick="stgDocExtDetruire(\''+d.id+'\')" title="Marquer cette pièce comme détruite/restituée"><i class="ti ti-flame"></i> Marquer détruit</button>';
    return '<div style="border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:7px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<div>'
      +'<span style="font-weight:600;font-size:12.5px">'+escHtml(d.libelle)+'</span> '
      +'<span style="font-size:11px;color:var(--muted)">'+(STG_DOC_EXT_SUPPORTS[d.support]||d.support)+' · '+(STG_DOC_EXT_CATEGORIES[d.categorie]||d.categorie)+(d.lieu_conservation?' · '+escHtml(d.lieu_conservation):'')+'</span>'
      +(d.date_destruction_prevue&&!d.detruit_le?'<div style="font-size:11px;color:var(--muted)">Conservation jusqu\'au '+new Date(d.date_destruction_prevue).toLocaleDateString('fr-FR')+'</div>':'')
      +'</div>'
      +'<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+detruit
      +'<button onclick="stgDocExtDelete(\''+d.id+'\')" title="Supprimer cette entrée du registre" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px"><i class="ti ti-trash"></i></button>'
      +'</span></div></div>';
  };
  zone.innerHTML=
      (stgDocExtCache.length
        ? stgDocExtCache.map(ligne).join('')
        : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucune pièce enregistrée sur support externe.</div>')
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'
      + '<input class="finput" id="stg-doc-ext-libelle" placeholder="Libellé (ex. carte d\'identité)" style="flex:2;min-width:180px;font-size:12px;padding:6px 8px">'
      + '<select class="finput" id="stg-doc-ext-support" style="flex:1;min-width:110px;font-size:12px;padding:6px 8px">'
        + Object.keys(STG_DOC_EXT_SUPPORTS).map(k=>'<option value="'+k+'">'+STG_DOC_EXT_SUPPORTS[k]+'</option>').join('')
      + '</select>'
      + '<select class="finput" id="stg-doc-ext-categorie" style="flex:1;min-width:110px;font-size:12px;padding:6px 8px">'
        + Object.keys(STG_DOC_EXT_CATEGORIES).map(k=>'<option value="'+k+'">'+STG_DOC_EXT_CATEGORIES[k]+'</option>').join('')
      + '</select>'
      + '<input class="finput" id="stg-doc-ext-lieu" placeholder="Lieu de conservation" style="flex:2;min-width:180px;font-size:12px;padding:6px 8px">'
      + '<button type="button" class="btn-sm" onclick="stgDocExtAdd()"><i class="ti ti-plus"></i> Ajouter</button>'
    + '</div>';
}
async function stgDocExtAdd(){
  const sid=stgFicheId;
  const libelle=(document.getElementById('stg-doc-ext-libelle').value||'').trim();
  if(!libelle){document.getElementById('stg-doc-ext-libelle').focus();return;}
  const row={
    entite_type:'stagiaire',
    entite_id:sid,
    libelle,
    support:document.getElementById('stg-doc-ext-support').value||'papier',
    categorie:document.getElementById('stg-doc-ext-categorie').value||'autre',
    lieu_conservation:(document.getElementById('stg-doc-ext-lieu').value||'').trim()||null,
    created_by:currentUser?currentUser.id:null
  };
  const{data,error}=await sb.from('documents_externes').insert(row).select().single();
  if(error){showBanner('Erreur lors de l\'ajout : '+error.message,'error');return;}
  stgDocExtCache.unshift(data);
  stgRenderDocExt();
  showBanner('Pièce ajoutée au registre.');
}
window.stgDocExtAdd=stgDocExtAdd;
async function stgDocExtDetruire(id){
  if(!confirm('Marquer cette pièce comme détruite / restituée aujourd\'hui ?'))return;
  const row={detruit_le:todayStr(),detruit_par:currentUser?currentUser.id:null};
  const{error}=await sb.from('documents_externes').update(row).eq('id',id);
  if(error){showBanner('Erreur : '+error.message,'error');return;}
  const d=stgDocExtCache.find(x=>String(x.id)===String(id));
  if(d)Object.assign(d,row);
  stgRenderDocExt();
  showBanner('Pièce marquée détruite.');
}
window.stgDocExtDetruire=stgDocExtDetruire;
async function stgDocExtDelete(id){
  if(!confirm('Supprimer cette entrée du registre ? (la pièce physique elle-même n\'est pas concernée, seule la trace ici disparaît)'))return;
  const{error}=await sb.from('documents_externes').delete().eq('id',id);
  if(error){showBanner('Erreur : '+error.message,'error');return;}
  stgDocExtCache=stgDocExtCache.filter(x=>String(x.id)!==String(id));
  stgRenderDocExt();
  showBanner('Entrée supprimée.');
}
window.stgDocExtDelete=stgDocExtDelete;

/* ---------- EXPORT DES DOCUMENTS PUIS PURGE DU STOCKAGE ----------
   Réservé aux dossiers clos (statut termine/refuse/annule — stgClos) :
   contrairement aux enfants/employés, la fiche stagiaire n'a pas de colonne
   archive_le dédiée, son statut sert déjà cet office. Télécharge un .zip des
   documents (stagiaires_documents), puis — seulement après confirmation
   explicite — supprime ces fichiers de Supabase Storage et les lignes
   correspondantes en base. Trace permanente dans archivage_purges.
   Irréversible : d'où la confirmation à deux temps. */
function stgRenderExportZone(s){
  const zone=document.getElementById('stg-export-zone');
  if(!zone)return;
  if(!s||!stgClos(s.statut)){zone.innerHTML='';return;}
  zone.innerHTML='<div style="background:#F1EFF7;border-left:4px solid var(--muted);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#555">'
    +'<i class="ti ti-archive"></i> Dossier clos.'
    +'<div style="margin-top:8px"><button class="btn-sm" onclick="stgExporterDocuments(\''+s.id+'\')" title="Télécharge un .zip des documents du dossier, à conserver hors ligne (disque externe), puis les retire du stockage en ligne"><i class="ti ti-cloud-download"></i> Exporter les documents et libérer l\'espace</button></div>'
    +'</div>';
}
async function stgExporterDocuments(id){
  const s=stgCache.find(x=>String(x.id)===String(id));
  if(!s||!stgClos(s.statut))return;
  if(!confirm('Préparer un fichier .zip de tous les documents de '+stgNomComplet(s)+' ?\n\nUne fois le fichier téléchargé et sa sauvegarde confirmée, ces documents seront supprimés du stockage en ligne (Supabase) — à vous de les conserver ensuite hors ligne (disque externe) pour le reste du délai légal.'))return;

  showBanner('Préparation du fichier .zip…');
  const docs=stgDocsDe(id);
  if(!docs.length){showBanner('Aucun document à exporter pour ce dossier.');return;}

  const zip=new JSZip();
  const reussis=[];
  let nEchec=0;
  for(const d of docs){
    try{
      const{data,error}=await sb.storage.from(d.bucket||STG_BUCKET).download(d.path);
      if(error)throw error;
      zip.file(d.filename||d.id,data);
      reussis.push(d);
    }catch(err){
      console.warn('[stgExporterDocuments] échec sur',d.id,err);
      nEchec++;
    }
  }
  if(!reussis.length){showBanner('Aucun document n\'a pu être téléchargé — export annulé, rien n\'a été supprimé.','error');return;}

  const contenu=await zip.generateAsync({type:'blob'});
  const nomZip='documents_'+stgNomComplet(s).replace(/\s+/g,'_')+'_'+todayStr()+'.zip';
  const url=URL.createObjectURL(contenu);
  const a=document.createElement('a');a.href=url;a.download=nomZip;document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);

  if(nEchec)showBanner(nEchec+' document(s) n\'ont pas pu être inclus dans le zip (ignorés, non supprimés) — '+reussis.length+' inclus.','error');

  if(!confirm('Le fichier "'+nomZip+'" a été téléchargé.\n\nAvez-vous bien enregistré ce fichier sur un support externe (disque dur, coffre-fort numérique) ?\n\nEn confirmant, les '+reussis.length+' document(s) effectivement exportés seront DÉFINITIVEMENT supprimés du stockage en ligne'+(nEchec?' ('+nEchec+' document(s) en échec resteront en ligne, à retenter plus tard)':'')+'. Cette action est IRRÉVERSIBLE.'))return;

  let suppOk=0,suppKo=0;
  for(const d of reussis){
    try{
      const{error:rmErr}=await sb.storage.from(d.bucket||STG_BUCKET).remove([d.path]);
      if(rmErr)console.warn('[stgExporterDocuments] fichier non supprimé du stockage',d.id,rmErr.message);
      const{error:delErr}=await sb.from('stagiaires_documents').delete().eq('id',d.id);
      if(delErr)throw delErr;
      suppOk++;
    }catch(err){
      console.warn('[stgExporterDocuments] suppression échouée',d.id,err);
      suppKo++;
    }
  }

  await sb.from('archivage_purges').insert({
    entite_type:'stagiaire',
    entite_id:id,
    creche_id:s.creche_id||null,
    annee_sortie:s.date_fin?Number(String(s.date_fin).slice(0,4)):null,
    motif:suppOk+' document(s) exportés en .zip puis supprimés du stockage en ligne'+(suppKo?' ('+suppKo+' échec(s) de suppression)':''),
    purge_par:currentUser?currentUser.id:null
  });

  stgDocsCache=stgDocsCache.filter(x=>String(x.stagiaire_id)!==String(id)||!reussis.find(r=>String(r.id)===String(x.id)));
  if(String(stgFicheId)===String(id)){stgRenderDocs();}
  showBanner(suppOk+' document(s) supprimé(s) du stockage en ligne.'+(suppKo?' '+suppKo+' suppression(s) ont échoué.':''));
}
window.stgExporterDocuments=stgExporterDocuments;
