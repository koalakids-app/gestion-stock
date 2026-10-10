
/* ---------- ENVOI ET SIGNATURE EN LIGNE ---------- */
/* La famille reçoit un mail, ouvre devis.html avec son jeton, lit le devis et
   le signe du doigt. Même dispositif que le dossier de familiarisation et le
   dépôt des pièces de stage : jeton porté par la ligne, edge function en
   service_role, AUCUNE policy anon sur `devis`.

   Le jeton est fabriqué ICI, sous RLS, par quelqu'un qui a le droit d'envoyer
   le devis — et non par l'edge function, qui ne doit jamais pouvoir créer un
   accès de sa propre initiative. La fonction d'envoi ne reçoit qu'un
   identifiant de devis et relit tout le reste en base : connaître son URL ne
   permet donc pas d'écrire à une adresse arbitraire. */

/* crypto.getRandomValues et non Math.random : ce jeton est la seule chose qui
   sépare le devis d'une famille de celui d'une autre. 32 octets, 64 caractères
   hexadécimaux — indevinable. */
function nouveauJeton(){
  const a=new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
}

function lienDevis(jeton){
  const racine=location.href.replace(/[^/]*\.html?(\?.*)?(#.*)?$/i,'');
  return racine+'devis.html?t='+jeton;
}

/* Ce que la modale affiche à la place du formulaire, une fois le devis parti.
   L'état d'un envoi se lit en trois temps — parti, ouvert, signé — et c'est ce
   qui permet de choisir entre relancer et téléphoner. */
function etatEnvoi(d){
  if(!d)return '';
  if(d.repondu_le&&d.statut==='accepte'){
    return '<b style="color:var(--green)">Accepté par la famille le '+dfr(d.repondu_le)
      +(d.repondu_par?', au nom de '+esc(d.repondu_par):'')+'.</b>'
      +(d.signature_png?' Le PDF porte la signature.':' Sans signature en ligne.');
  }
  if(d.repondu_le&&d.statut==='refuse'){
    return '<b style="color:var(--red)">Refusé par la famille le '+dfr(d.repondu_le)+'.</b>'
      +(d.motif_refus?' Motif : '+esc(d.motif_refus):' Aucun motif indiqué.');
  }
  const bouts=[];
  if(d.envoye_le)bouts.push('Envoyé le '+dfr(d.envoye_le)+(d.destinataires?' à '+esc(d.destinataires):''));
  if(d.vu_le)bouts.push('ouvert par la famille le '+dfr(d.vu_le));
  else if(d.envoye_le)bouts.push('<b>pas encore ouvert</b>');
  if(d.relances)bouts.push(d.relances+' relance'+(d.relances>1?'s':'')
    +(d.derniere_relance?', la dernière le '+dfr(d.derniere_relance):''));
  if(d.expire_le)bouts.push('lien valable jusqu\'au '+dfr(d.expire_le));
  return (bouts.join(' · ')||'Ce devis a quitté le brouillon.')
    +' Il n\'est plus modifiable : établissez-en un nouveau pour le remplacer.';
}

/* Les destinataires : les parents cochés « destinataire du devis » qui ont une
   adresse. Deux parents, deux boîtes, un seul et même lien. */
function destinatairesDevis(){
  return PARENTS.filter(p=>p.destinataire&&p.email&&p.email.indexOf('@')>0)
    .map(p=>p.email.trim());
}

/* Le lien vit indépendamment de l'envoi. On peut donc le créer et le
   transmettre à la main — SMS, mail écrit soi-même, message sur le Padlet —
   sans passer par Resend. C'est la porte de sortie quand le mail automatique
   échoue, quand la famille n'a pas d'adresse, ou quand on veut simplement
   vérifier la page avant de l'envoyer à qui que ce soit.

   Le jeton n'est fabriqué qu'une fois : rappeler ce bouton recopie le même
   lien, et n'invalide pas celui qui est déjà parti. Il n'est renouvelé que
   s'il a expiré. */
async function copierLienDevis(partager){
  const d=DEVIS.find(x=>String(x.id)===String(devisId));
  if(!d){toast('Enregistrez d\'abord le devis.',true);return;}
  if(d.repondu_le){toast('Ce devis a déjà reçu une réponse.',true);return;}

  let jeton=d.token;
  const expire=d.expire_le?new Date(d.expire_le).getTime():0;
  if(!jeton||expire<Date.now()){
    await loadReseau();
    const jours=Number(RESEAU.devis_validite_jours||30);
    const fin=new Date();fin.setDate(fin.getDate()+jours);
    const maj={token:nouveauJeton(),expire_le:fin.toISOString(),
               updated_at:new Date().toISOString()};
    const adr=destinatairesDevis();
    if(adr.length)maj.destinataires=adr.join(', ');

    /* Créer un lien pour le donner à une famille, c'est envoyer le devis. Le
       statut suit donc, et pour deux raisons qui vont ensemble :

       — la signature en ligne n'est acceptée que sur un devis « envoyé ». Un
         lien créé sur un brouillon laissait la famille tout lire, tout signer,
         et se faire refuser au dernier clic ;
       — la contrainte devis_envoi_ck exige `token` ET `envoye_le` dès qu'un
         devis quitte le brouillon. Les poser séparément était impossible.

       On le dit avant, parce que le devis cesse alors d'être modifiable. */
    if(d.statut==='brouillon'){
      if(!confirm('Créer le lien de signature ?\n\n'
        +'Le devis passera en « Envoyé » et ne sera plus modifiable — c\'est ce qui '
        +'autorise la famille à le signer en ligne.\n'
        +'Lien valable '+jours+' jours, jusqu\'au '+dfr(fin.toISOString())+'.'))return;
      maj.statut='envoye';
      maj.envoye_le=new Date().toISOString();
    }

    const{error}=await sb.from('devis').update(maj).eq('id',d.id);
    if(error){
      console.error('[copierLienDevis]',error);
      toast('Création du lien impossible : '+(error.message||'erreur inconnue'),true);
      return;
    }
    Object.assign(d,maj);
    jeton=maj.token;
    document.getElementById('btnLienDev').innerHTML='<i class="ti ti-link"></i> Le lien';
    if(maj.statut==='envoye'){
      // Même suivi que l'envoi par mail : la file d'attente doit montrer
      // « Devis envoyé » sans qu'on ait à rouvrir la fiche.
      const p=PRE.find(x=>String(x.id)===String(ficheId));
      if(p&&['nouvelle','en_contact'].indexOf(p.statut)>=0){
        await sb.from('preinscriptions').update({statut:'devis_envoye'}).eq('id',p.id);
        p.statut='devis_envoye';setVal('fStatut','devis_envoye');render();
      }
      renderDevisList();
    }
  }

  const url=lienDevis(jeton);
  if(partager===true){
    const r=await PartageLien.partager(url,{titre:'Devis',
      texte:'Bonjour, voici le lien pour consulter et signer votre devis :'});
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

/* Le devis par défaut à personnaliser : les variables (prénom, crèche, jours)
   sont substituées une fois pour toutes dans le texte qui s'affiche dans
   l'overlay — la direction édite un texte final, pas une syntaxe à apprendre. */
function texteEnvoiDevisParDefaut(d,relance){
  const p=PRE.find(x=>String(x.id)===String(ficheId));
  const prenom=(p&&p.prenom)||'votre enfant';
  const creche=nomCreche(d.creche_id||val('dCreche'));
  const joursTexte=joursTxt(d.jours)||'';
  if(relance){
    return{
      objet:'Rappel — le devis d\'accueil de '+prenom,
      message:'Nous n\'avons pas encore reçu votre réponse au devis d\'accueil de '+prenom
        +'. Voici à nouveau votre lien personnel.',
    };
  }
  return{
    objet:'Le devis d\'accueil de '+prenom,
    message:'Voici le devis d\'accueil de '+prenom
      +(creche?' à notre micro-crèche de '+creche:'')
      +(joursTexte?', pour un accueil les '+joursTexte:'')
      +'. Le détail complet et le lien pour l\'accepter et le signer se trouvent ci-dessous.',
  };
}

let ENVOI_DEVIS_CTX=null;

/* Ouvre l'overlay d'envoi : rien n'est encore écrit en base, rien n'est
   encore parti. Les vérifications qui bloquaient l'ancien confirm() restent
   ici, avant même de montrer un texte à personnaliser. */
async function ouvrirEnvoiDevis(){
  const d=DEVIS.find(x=>String(x.id)===String(devisId));
  if(!d){toast('Enregistrez d\'abord le devis.',true);return;}
  if(d.repondu_le){toast('Ce devis a déjà reçu une réponse.',true);return;}

  const relance=(d.statut==='envoye');
  const adresses=destinatairesDevis();
  if(!adresses.length){
    toast('Aucun parent destinataire avec une adresse e-mail : cochez « destinataire » sur au moins un parent.',true);
    return;
  }
  if(!d.total_mensuel){
    toast('Ce devis ne chiffre rien — vérifiez le contrat avant de l\'envoyer.',true);
    return;
  }

  await loadReseau();
  const jours=Number(RESEAU.devis_validite_jours||30);
  const fin=new Date();fin.setDate(fin.getDate()+jours);
  ENVOI_DEVIS_CTX={relance:relance,fin:fin};

  document.getElementById('ieTitle').textContent=relance?'Relancer la famille':'Envoyer le devis';
  document.getElementById('ieDest').textContent=adresses.join(', ');
  const defaut=texteEnvoiDevisParDefaut(d,relance);
  setVal('ieObjet',defaut.objet);
  setVal('ieMessage',defaut.message);
  document.getElementById('ieInfo').textContent=relance
    ? ''
    : 'Le devis passera en « Envoyé » et ne sera plus modifiable. Le lien sera valable '
      +jours+' jours, jusqu\'au '+dfr(fin.toISOString())+'.';
  document.getElementById('btnEnvoiDevisOk').innerHTML=relance
    ? '<i class="ti ti-bell"></i> Relancer'
    : '<i class="ti ti-send"></i> Envoyer';
  openOv('ovEnvoiDevis');
}

async function confirmerEnvoiDevis(){
  const d=DEVIS.find(x=>String(x.id)===String(devisId));
  if(!d||!ENVOI_DEVIS_CTX){toast('Rouvrez l\'envoi du devis.',true);return;}
  const objet=val('ieObjet').trim(),message=val('ieMessage').trim();
  if(!objet||!message){toast('L\'objet et le message ne peuvent pas être vides.',true);return;}

  const{relance,fin}=ENVOI_DEVIS_CTX;
  const adresses=destinatairesDevis();
  if(!adresses.length){
    toast('Aucun parent destinataire avec une adresse e-mail : cochez « destinataire » sur au moins un parent.',true);
    return;
  }

  const b=document.getElementById('btnEnvoiDevisOk');
  b.disabled=true;b.textContent=relance?'Relance…':'Envoi…';
  try{
    /* Un jeton n'est fabriqué qu'au premier envoi. Une relance réutilise le
       même lien : en poser un nouveau invaliderait celui que la famille a déjà
       dans sa boîte, et c'est souvent celui-là qu'elle rouvrira. On ne le
       renouvelle que s'il a expiré entre-temps. */
    const expire=d.expire_le?new Date(d.expire_le).getTime():0;
    const besoinJeton=!d.token||expire<Date.now();
    const maj={destinataires:adresses.join(', '),updated_at:new Date().toISOString()};
    if(besoinJeton){maj.token=nouveauJeton();maj.expire_le=fin.toISOString();}
    if(!relance){maj.statut='envoye';maj.envoye_le=new Date().toISOString();}

    const{error}=await sb.from('devis').update(maj).eq('id',d.id);
    if(error)throw error;
    Object.assign(d,maj);

    /* Le mail part APRÈS l'écriture : si l'envoi échoue, le lien existe déjà et
       le bouton « Le lien » permet de le transmettre à la main. L'inverse —
       mailer d'abord — aurait pu expédier un lien que la base n'a pas gardé. */
    /* Le PDF est tiré de devis_lignes comme le bouton « Le PDF ». S'il échoue,
       le mail part quand même : le lien suffit à la famille pour répondre. */
    let pdf;
    try{
      await Promise.all([chargeJsPdf(),loadEtabs(),loadReseau()]);
      const{data:lg,error:eLg}=await sb.from('devis_lignes').select('*').eq('devis_id',d.id).order('ordre');
      if(eLg)throw eLg;
      pdf=dessineDevis(d,lg||[],true);
    }catch(ePdf){console.warn('[devis pdf joint]',ePdf);toast('PDF non joint : le mail part avec le lien seul.',true);}

    const{error:eFn}=await sb.functions.invoke('envoyer-devis',
      {body:{devis_id:d.id,relance:relance,objet:objet,message:message,expediteur:(PROF&&PROF.name)||undefined,pdf:pdf}});
    if(eFn)throw new Error(await detailFn(eFn));

    if(relance){
      d.relances=(d.relances||0)+1;
      d.derniere_relance=new Date().toISOString();
      toast('Relance envoyée ✅');
    }else{
      // La file d'attente doit suivre : « Devis envoyé » se voit depuis la liste.
      const p=PRE.find(x=>String(x.id)===String(ficheId));
      if(p&&['nouvelle','en_contact'].indexOf(p.statut)>=0){
        await sb.from('preinscriptions').update({statut:'devis_envoye'}).eq('id',p.id);
        p.statut='devis_envoye';setVal('fStatut','devis_envoye');render();
      }
      toast('Devis envoyé ✅');
    }
    closeOv('ovEnvoiDevis');
    closeOv('ovDevis');
    await loadDevis(ficheId);
  }catch(e){
    console.error('[confirmerEnvoiDevis]',e);
    toast('Envoi impossible : '+(e.message||'erreur inconnue')
      +' — le lien reste disponible par le bouton « Le lien ».',true);
  }finally{
    b.disabled=false;
    b.innerHTML=relance?'<i class="ti ti-bell"></i> Relancer':'<i class="ti ti-send"></i> Envoyer';
    document.getElementById('btnEnvoiDev').innerHTML=relance
      ?'<i class="ti ti-bell"></i> Relancer la famille'
      :'<i class="ti ti-send"></i> Envoyer à la famille';
  }
}

/* ---------- VISITE → ÉVÉNEMENTS ---------- */
/* La date de visite est reportée dans le calendrier des événements (demandes.html),
   en type « Visite ». evenements.preinscription_id relie les deux : une visite
   déplacée met à jour son événement au lieu d'en créer un second, une visite
   retirée le supprime. Best-effort : la fiche est déjà enregistrée. */
async function syncEvenementVisite(preId,row){
  try{
    const{data:ex,error:eEx}=await sb.from('evenements').select('id').eq('preinscription_id',preId).maybeSingle();
    if(eEx)throw eEx;
    if(!row.date_visite){
      if(ex){const{error}=await sb.from('evenements').delete().eq('id',ex.id);if(error)throw error;}
      return;
    }
    const cr=CRECHES.find(c=>String(c.id)===String(row.creche_id));
    const nom=((row.prenom||'')+' '+(row.nom||'')).trim();
    const ev={
      titre:'Visite — '+(nom||'famille'),
      type:'visite',
      creche_id:row.creche_id||null,
      date_debut:row.date_visite,
      date_fin:null,
      heure_debut:row.heure_visite||null,
      heure_fin:null,
      lieu:(cr&&cr.addr)||'',
      description:'Visite de la crèche (préinscription).',
      auteur:(PROF&&PROF.name)||'',
      preinscription_id:preId
    };
    if(ex){
      const{error}=await sb.from('evenements').update(ev).eq('id',ex.id);
      if(error)throw error;
    }else{
      ev.created_by=ME?ME.id:null;
      const{error}=await sb.from('evenements').insert(ev);
      if(error)throw error;
    }
  }catch(e){
    console.warn('[syncEvenementVisite]',e);
    toast('La visite n\'a pas pu être reportée dans les événements.',true);
  }
}

/* ---------- CONFIRMATION DE VISITE ---------- */
let ENVOI_VISITE_ID=null;

function ouvrirEnvoiVisite(row){
  const adresses=destinatairesDevis();
  if(!adresses.length)return;
  const p=PRE.find(x=>String(x.id)===String(ficheId));
  const prenom=((p&&p.prenom)||'').trim()||'votre enfant';
  const creche=nomCreche(row.creche_id||(p&&p.creche_id));
  ENVOI_VISITE_ID=ficheId;
  document.getElementById('ivDest').textContent=adresses.join(', ');
  setVal('ivObjet','Confirmation de votre visite — '+prenom);
  setVal('ivMessage','Nous avons le plaisir de vous confirmer la visite de notre micro-crèche'
    +(creche?' '+creche:'')+' pour '+prenom+', le '+dfr(row.date_visite)
    +(row.heure_visite?' à '+String(row.heure_visite).slice(0,5):'')+'.');
  openOv('ovEnvoiVisite');
}

async function confirmerEnvoiVisite(){
  const objet=val('ivObjet').trim(),message=val('ivMessage').trim();
  if(!ENVOI_VISITE_ID){closeOv('ovEnvoiVisite');return;}
  if(!objet||!message){toast('L\'objet et le message ne peuvent pas être vides.',true);return;}
  const b=document.getElementById('btnEnvoiVisiteOk');
  b.disabled=true;b.textContent='Envoi…';
  try{
    const{error}=await sb.functions.invoke('envoyer-confirmation-visite',
      {body:{preinscription_id:ENVOI_VISITE_ID,objet:objet,message:message,expediteur:(PROF&&PROF.name)||undefined}});
    if(error)throw new Error(await detailFn(error));
    toast('Confirmation de visite envoyée ✅');
    closeOv('ovEnvoiVisite');
  }catch(e){
    console.error('[confirmerEnvoiVisite]',e);
    toast('Envoi impossible : '+(e.message||'erreur inconnue'),true);
  }finally{
    b.disabled=false;b.innerHTML='<i class="ti ti-send"></i> Envoyer';
  }
}

/* ---------- LE PDF DU DEVIS ---------- */
/* Le document est REDESSINE en texte, pas photographie. html2canvas aurait été
   plus court à écrire, mais il produit une image : fichier lourd, texte ni
   sélectionnable ni cherchable, et rendu dépendant de la largeur de l'écran
   depuis lequel on imprime — le même devis n'aurait pas sorti pareil depuis la
   tablette et depuis le poste du bureau.

   Deuxième parti pris : le PDF lit devis_lignes EN BASE, jamais le calcul à
   l'écran. Ce qui s'imprime est donc ce qui a été figé à l'établissement du
   devis, même si la grille tarifaire a bougé depuis, et même si la modale est
   ouverte sur des cases décochées.

   Ce que le PDF va chercher ailleurs :
     etablissements  → raison sociale, SIRET, agrément PMI, représentant
     reseau_config   → durée de validité, mentions, préavis, pied de page
     creches.addr    → l'adresse du site d'accueil
   Aucune de ces sources n'est bloquante : ce qui manque laisse un blanc, le
   devis sort quand même. Un écran de paramètres vide ne doit pas empêcher
   d'imprimer. */
const JSPDF_URL='https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
/* Même logo que la page publique devis.html (data URI identique), pour que
   l'en-tête du PDF imprimé en interne corresponde à celui envoyé aux familles. */
const LOGO_KOALA_PNG='data:image/png;base64,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';
let RESEAU={devis_validite_jours:30,devis_mentions:'',preavis_resiliation:'',pied_page:''};
let reseauCharge=false;

async function loadReseau(){
  if(reseauCharge)return;
  try{
    const{data,error}=await sb.from('reseau_config').select('config').maybeSingle();
    if(error)throw error;
    if(data&&data.config)RESEAU=Object.assign({},RESEAU,data.config);
  }catch(e){console.warn('[loadReseau]',e);}
  reseauCharge=true;
}

/* jsPDF n'est chargé qu'au premier clic : 300 ko qu'il serait absurde de faire
   payer à l'ouverture du module à quelqu'un qui vient consulter une file
   d'attente. */
function chargeJsPdf(){
  if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();
  return new Promise((ok,ko)=>{
    const s=document.createElement('script');
    s.src=JSPDF_URL;
    s.onload=()=>(window.jspdf&&window.jspdf.jsPDF)?ok():ko(new Error('jsPDF chargé mais introuvable.'));
    s.onerror=()=>ko(new Error('jsPDF n\'a pas pu être téléchargé — vérifiez la connexion.'));
    document.head.appendChild(s);
  });
}

/* Montant pour le PDF. euro() passe par toLocaleString, qui sépare les
   milliers par une espace insécable étroite (U+202F) que les polices
   standard de jsPDF ne savent pas dessiner : le chiffre sortait troué.
   Ici l'espace est une espace ordinaire. */
function eurPdf(n){
  const v=Math.round(Number(n||0)*100)/100;
  const s=Math.abs(v).toFixed(2).replace('.',',');
  const pt=s.split(',');
  return (v<0?'- ':'')+pt[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+pt[1]+' €';
}
function nbFr(n){
  const v=Math.round(Number(n||0)*100)/100;
  return String(v).replace('.',',');
}
function joursTxt(v){
  const j=toArr(v).map(Number);
  return JOURS.filter(x=>j.indexOf(x[0])>=0).map(x=>x[1].toLowerCase()).join(', ');
}
function dureeMin(hd,hf){
  if(!hd||!hf)return 0;
  const a=hd.split(':').map(Number),b=hf.split(':').map(Number);
  const mins=(b[0]*60+b[1])-(a[0]*60+a[1]);
  return mins>0?mins:0;
}
function fmtDuree(mins){return Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0');}
/* Date d'échéance = point de départ + durée de validité du réseau. On part de
   l'envoi s'il a eu lieu, sinon de l'établissement : un devis daté du 2 et
   envoyé le 20 court à partir du 20, sinon la famille reçoit un document déjà
   à moitié périmé. */
function echeanceDevis(d){
  // expire_le fait foi quand le lien a été créé : c'est la date que la famille
  // a effectivement reçue dans son mail. Sinon on la déduit de la durée réseau.
  if(d.expire_le)return String(d.expire_le).slice(0,10);
  const base=String(d.envoye_le||d.created_at||auj()).slice(0,10);
  const dt=new Date(base+'T00:00:00');
  if(isNaN(dt))return '';
  dt.setDate(dt.getDate()+Number(RESEAU.devis_validite_jours||30));
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}

async function pdfDevis(id){
  const d=DEVIS.find(x=>String(x.id)===String(id));
  if(!d){toast('Enregistrez le devis avant de l\'imprimer.',true);return;}
  toast('Préparation du PDF…');
  try{
    await Promise.all([chargeJsPdf(),loadEtabs(),loadReseau()]);
    const{data,error}=await sb.from('devis_lignes').select('*').eq('devis_id',d.id).order('ordre');
    if(error)throw error;
    dessineDevis(d,data||[]);
  }catch(e){
    console.error('[pdfDevis]',e);
    toast('PDF impossible : '+(e.message||'erreur inconnue'),true);
  }
}

/* envoi=true : le PDF n'est pas téléchargé mais rendu en base64, pour être joint
   au mail de la famille. Même dessin, mêmes lignes lues en base. */
function dessineDevis(d,lignes,envoi){
  const jsPDF=window.jspdf.jsPDF;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const G=16, D=194, L=D-G, BAS=278;   // marges et bas de page utile
  let y=0;

  const p=PRE.find(x=>String(x.id)===String(d.preinscription_id))||{};
  const e=etabDe(d.creche_id);
  const cr=nomCreche(d.creche_id);
  const VIOLET=[74,63,159], ORANGE=[244,121,32], GRIS=[142,138,168],
        NOIR=[43,39,64], VERT=[46,158,107], TRAIT=[228,222,240];

  function police(t,s,c){doc.setFontSize(t);doc.setFont('helvetica',s||'normal');
    const k=c||NOIR;doc.setTextColor(k[0],k[1],k[2]);}
  function trait(c){const k=c||TRAIT;doc.setDrawColor(k[0],k[1],k[2]);doc.setLineWidth(.3);doc.line(G,y,D,y);}
  function place(h){if(y+h>BAS){doc.addPage();y=20;}}
  function ecrire(s,t,st,c,x,al){
    police(t,st,c);
    doc.text(String(s==null?'':s),x==null?G:x,y,al?{align:al}:undefined);
  }
  /* Un paragraphe qui se coupe tout seul et sait changer de page en cours de
     route : les mentions du réseau peuvent faire dix lignes comme trois. */
  function para(s,t,st,c,larg,inter){
    if(s==null||String(s).trim()==='')return;
    police(t||9.5,st,c);
    doc.splitTextToSize(String(s),larg||L).forEach(l=>{
      place(inter||4.4);
      doc.text(l,G,y);y+=(inter||4.4);
    });
  }
  function titreSection(s){
    place(7);y+=2;
    ecrire(s.toUpperCase(),9,'bold',ORANGE);
    y+=1;trait();y+=2;
  }

  /* ---- En-tête : qui édite le devis ---- */
  y=18;
  const logoH=8.2,logoW=logoH*(365/138);
  let yNom;
  try{doc.addImage(LOGO_KOALA_PNG,'PNG',G,12,logoW,logoH);yNom=12+logoH+4.5;}
  catch(err){ecrire(e.raison_sociale||'Koala Kids',15,'bold',VIOLET);yNom=y+4.8;}
  y=yNom;
  [e.forme_juridique,
   e.adresse_siege,
   [e.siret?'SIRET '+e.siret:'',e.code_ape?'APE '+e.code_ape:''].filter(Boolean).join('  ·  '),
   [e.telephone,e.email].filter(Boolean).join('  ·  ')
  ].filter(Boolean).forEach(t=>{ecrire(t,8.5,'normal',GRIS);y+=3.6;});

  // Colonne de droite : le site d'accueil et son agrément.
  let yd=18;
  const dr=(s,t,st,c)=>{if(!s)return;police(t,st,c);doc.text(String(s),D,yd,{align:'right'});yd+=t<=8.5?3.6:4.8;};
  dr(cr||'',11,'bold',NOIR);
  dr(adrCreche(d.creche_id),8.5,'normal',GRIS);
  dr(e.pmi_numero?'Agrément PMI '+e.pmi_numero:'',8.5,'normal',GRIS);
  dr(e.pmi_date?'délivré le '+dfr(e.pmi_date):'',8.5,'normal',GRIS);

  y=Math.max(y,yd)+2;
  trait(VIOLET);y+=6;

  /* ---- Le titre ---- */
  const titre='DEVIS '+(d.numero||'');
  ecrire(titre,16,'bold',VIOLET);
  // La largeur se mesure AVEC la police du titre, avant d'en changer : mesurée
  // en 9,5 pt elle vaut deux tiers de la vraie, et « révision 2 » venait se
  // poser au milieu du numéro.
  const apresTitre=G+doc.getTextWidth(titre)+5;
  if(d.revision>1){police(9.5,'normal',GRIS);doc.text('révision '+d.revision,apresTitre,y);}
  // Un brouillon imprimé doit se voir comme tel : rien n'empêche de le tendre
  // à une famille par mégarde, et il n'engage personne.
  if(d.statut==='brouillon'){
    police(9,'bold',ORANGE);
    doc.text('BROUILLON',D,y,{align:'right'});
  }else if(d.statut==='accepte'){
    police(9,'bold',VERT);
    doc.text('ACCEPTÉ',D,y,{align:'right'});
  }
  y+=4;
  const ech=echeanceDevis(d);
  ecrire('Établi le '+dfr(String(d.created_at||auj()).slice(0,10))
    +(ech?'  ·  valable jusqu\'au '+dfr(ech):''),9,'normal',GRIS);
  y+=4.5;

  /* ---- La famille et l'enfant, côte à côte ---- */
  const mid=G+L/2+4;
  const yb=y;
  police(9,'bold',ORANGE);doc.text('LA FAMILLE',G,y);doc.text('L\'ENFANT',mid,y);
  y+=3.6;
  const dest=PARENTS.filter(x=>x.destinataire);
  const gauche=[];
  (dest.length?dest:PARENTS).forEach(x=>{
    gauche.push(((x.prenom||'')+' '+(x.nom||'')).trim()+(x.lien?' ('+(LIENS[x.lien]||'').toLowerCase()+')':''));
    if(x.email)gauche.push(x.email);
    if(x.telephone)gauche.push(x.telephone);
  });
  if(p.adresse)gauche.push(p.adresse);
  if(p.code_postal||p.ville)gauche.push(((p.code_postal||'')+' '+(p.ville||'')).trim());

  const droite=[];
  droite.push(((p.prenom||'')+' '+(p.nom||'')).trim()||'—');
  if(p.dob)droite.push(p.ne_ou_a_naitre==='a_naitre'?'terme prévu le '+dfr(p.dob):'né(e) le '+dfr(p.dob));
  if(p.num_allocataire)droite.push('N° allocataire '+p.num_allocataire);

  police(9.5,'normal',NOIR);
  const n=Math.max(gauche.length,droite.length);
  for(let i=0;i<n;i++){
    place(3.6);
    if(gauche[i])doc.text(doc.splitTextToSize(gauche[i],L/2-6)[0],G,y);
    if(droite[i])doc.text(doc.splitTextToSize(droite[i],L/2-6)[0],mid,y);
    y+=3.6;
  }
  y=Math.max(y,yb+9);

  /* ---- Le contrat proposé ---- */
  titreSection('L\'accueil proposé');
  const avecTerme=!!d.date_fin;
  const contrat=[
    ['Crèche',cr||'—'],
    ['Début de l\'accueil',d.date_debut?dfr(d.date_debut):'à convenir'],
    ['Fin de l\'accueil',avecTerme?dfr(d.date_fin):'sans terme prévu'],
    avecTerme
      ? ['Jours facturés',(d.jours_accueil!=null?d.jours_accueil+' jours':'—')
          +(d.mois_factures?' sur '+nbFr(d.mois_factures)+' mois':'')]
      : ['Semaines facturées',d.semaines_an+' semaines par an']
  ];
  police(9.5,'normal');
  contrat.forEach(([k,v])=>{
    place(3.8);
    police(9,'normal',GRIS);doc.text(k,G,y);
    police(9,'bold',NOIR);doc.text(String(v),G+52,y);
    y+=3.8;
  });
  y+=1;

  /* Le récap semaine, en tableau, pour visualiser la semaine d'un coup d'œil
     plutôt que de déduire les horaires du volume hebdomadaire — même
     présentation que le devis envoyé à la famille (devis.html). */
  const jset=toArr(d.jours).map(Number);
  const colsSem=[46,42,42,48];
  const xsSem=[G,G+colsSem[0],G+colsSem[0]+colsSem[1],G+colsSem[0]+colsSem[1]+colsSem[2]];
  function ligneSemaine(cells,h,gras,taille){
    place(h);
    const top=y;
    doc.setDrawColor(TRAIT[0],TRAIT[1],TRAIT[2]);doc.setLineWidth(.25);
    let xc=G;
    colsSem.forEach(w=>{doc.rect(xc,top,w,h);xc+=w;});
    police(taille||8,gras?'bold':'normal',NOIR);
    const baseline=top+h-1.6;
    cells.forEach((t,i)=>{
      const align=i===colsSem.length-1?'right':'left';
      const px=align==='right'?xsSem[i]+colsSem[i]-2:xsSem[i]+2;
      doc.text(String(t),px,baseline,{align});
    });
    y=top+h;
  }
  ligneSemaine(['Jours de la semaine','Heure d\'arrivée','Heure de départ','Nombre heures de présences'],5,true,6.8);
  let totalMinSem=0;
  JOURS.forEach(([num,nom])=>{
    const actif=jset.indexOf(num)>=0;
    const mins=actif?dureeMin(d.heure_debut,d.heure_fin):0;
    totalMinSem+=mins;
    ligneSemaine([nom,actif?(d.heure_debut||''):'',actif?(d.heure_fin||''):'',fmtDuree(mins)],4.2,false);
  });
  ligneSemaine(['Total','','',fmtDuree(totalMinSem)],4.8,true);
  y+=1.8;
  para(avecTerme
    ? 'La mensualité répartit les '+(d.jours_accueil!=null?d.jours_accueil:'—')+' jours d\'accueil de '
      +'la période sur '+nbFr(d.mois_factures||0)+' mensualités égales. Elle est identique chaque mois, '
      +'y compris pendant les périodes de fermeture, déjà déduites du nombre de jours facturés.'
    : 'La mensualité est lissée sur douze mois : elle est identique chaque mois, y compris '
      +'pendant les semaines de fermeture, qui sont déjà déduites du nombre de semaines facturées.',
    8.5,'italic',GRIS,L,4);

  /* ---- Le détail chiffré ---- */
  titreSection('Le détail de la mensualité');
  const RECUR=['accueil','mensuel','unitaire'];
  function unite(l){
    if(l.type==='accueil')return d.tarif_mode==='horaire'?'h':(d.tarif_mode==='journee'?'j':'mois');
    if(l.type==='unitaire')return 'j';
    return '';
  }
  function detail(l){
    const q=Number(l.quantite);
    if(!q||q===1)return '';
    const u=unite(l);
    return nbFr(Math.round(q*100)/100)+(u?' '+u:'')+' × '+eurPdf(Math.abs(l.montant_unitaire));
  }
  function ligne(l){
    const neg=Number(l.total)<0;
    police(9.5,'normal',NOIR);
    const nom=doc.splitTextToSize(String(libelleLigne(l)||''),82);
    const des=l.description?doc.splitTextToSize(String(l.description),82):[];
    const h=nom.length*4.3+des.length*3.6;
    place(h+3);
    nom.forEach((t,i)=>doc.text(t,G,y+i*4.3));
    if(des.length){
      police(8,'italic',GRIS);
      des.forEach((t,i)=>doc.text(t,G,y+nom.length*4.3+i*3.6));
    }
    police(8.5,'normal',GRIS);
    doc.text(detail(l),G+86,y);
    police(10,'bold',neg?VERT:NOIR);
    doc.text((neg?'- ':'')+eurPdf(Math.abs(l.total)),D,y,{align:'right'});
    y+=h+1.8;
    trait();y+=2.4;
  }

  const recu=lignes.filter(l=>RECUR.indexOf(l.type)>=0);
  const hors=lignes.filter(l=>RECUR.indexOf(l.type)<0);
  if(!recu.length)para('Aucune ligne récurrente.',9.5,'italic',GRIS);
  recu.forEach(ligne);

  place(10);
  y+=0.7;
  police(11,'bold',VIOLET);
  doc.text('TOTAL MENSUEL',G,y);
  doc.setFontSize(14);
  doc.text(eurPdf(d.total_mensuel),D,y,{align:'right'});
  y+=3;trait(VIOLET);y+=3;

  /* Le total sur la durée. Il ne figurait pas jusqu'ici, et c'est pourtant le
     chiffre qu'une famille veut connaître avant de s'engager. */
  if(d.total_annuel){
    place(5);
    police(9,'normal',GRIS);
    doc.text(avecTerme
      ? 'Soit '+eurPdf(d.total_annuel)+' sur la durée du contrat ('+nbFr(d.mois_factures||0)+' mensualités).'
      : 'Soit '+eurPdf(d.total_annuel)+' sur douze mois.',G,y);
    y+=5;
  }

  if(hors.length){
    titreSection('Hors mensualité');
    hors.forEach(ligne);
    para('Ces montants sont facturés en une seule fois ou une fois par an, en sus de la mensualité.',
      8.5,'italic',GRIS,L,4);
  }

  /* ---- Le CMG ---- */
  /* Il est versé aux parents par la CAF, pas à la crèche. Le porter au devis
     rend le reste à charge lisible, mais la mention qui suit n'est pas une
     précaution de style : c'est ce qui empêche qu'une estimation faite sur des
     revenus déclarés soit lue comme un engagement de la crèche. */
  if(d.cmg_estime!=null){
    titreSection('Estimation du complément de libre choix du mode de garde');
    const bl=[['Coût mensuel',eurPdf(d.total_mensuel),NOIR],
              ['CMG estimé, versé par la CAF','- '+eurPdf(d.cmg_estime),VERT]];
    bl.forEach(([k,v,c])=>{
      place(4.8);
      police(9.5,'normal',GRIS);doc.text(k,G,y);
      police(9.5,'bold',c);doc.text(v,D,y,{align:'right'});
      y+=4.8;
    });
    y+=0.7;trait();y+=4.2;
    police(11,'bold',VIOLET);doc.text('RESTE À CHARGE MENSUEL',G,y);
    doc.setFontSize(14);doc.text(eurPdf(d.reste_a_charge),D,y,{align:'right'});
    y+=4.5;
    para('Estimation indicative, calculée à partir des revenus communiqués par la famille et du '
      +'barème CAF en vigueur. Seule la CAF détermine le montant réellement versé. La crèche ne '
      +'perçoit pas le CMG : elle facture la mensualité ci-dessus.',8.5,'italic',GRIS,L,4);
  }

  /* ---- Le mot de la crèche ---- */
  if(d.commentaire&&String(d.commentaire).trim()){
    titreSection('Précisions');
    para(d.commentaire,9.5,'normal',NOIR);
  }

  /* ---- Les mentions du réseau ---- */
  const mentions=[RESEAU.devis_mentions,RESEAU.preavis_resiliation].filter(x=>x&&String(x).trim());
  if(mentions.length||ech){
    titreSection('Conditions');
    if(ech)para('Ce devis est valable jusqu\'au '+dfr(ech)+'. Passé cette date, il devient caduc '
      +'et un nouveau devis doit être établi.',9,'normal',NOIR,L,4);
    mentions.forEach(m=>{y+=1;para(m,9,'normal',NOIR,L,4);});
  }

  /* ---- L'acceptation ---- */
  /* Deux états pour un même cadre. Tant que le devis n'est pas signé, il porte
     une zone à remplir à la main. Une fois signé en ligne, la même zone porte
     le tracé et son horodatage : le document remis à la famille et celui
     conservé par la crèche sont alors le même. */
  /* Signé en ligne = accepté ET tracé recueilli. `repondu_le` seul ne suffit
     pas : il porte aussi les refus, et une acceptation saisie à la main par la
     direction, sans signature à l'écran. */
  const signeEnLigne=!!(d.repondu_le&&d.statut==='accepte'&&d.signature_png);
  const H_CADRE=signeEnLigne?36:28;
  place(H_CADRE+8);
  y+=2;
  titreSection('Acceptation');
  const yc=y;
  doc.setDrawColor(TRAIT[0],TRAIT[1],TRAIT[2]);doc.setLineWidth(.4);
  doc.roundedRect(G,yc-2,L,H_CADRE,3,3);
  y=yc+4;
  if(signeEnLigne){
    police(9,'normal',GRIS);
    doc.text('Devis accepté et signé en ligne le '+dfr(d.repondu_le)
      +(d.repondu_par?' par '+d.repondu_par:''),G+5,y);
    y+=4;
    if(d.signature_png){
      // Une signature tracée au doigt est plus large que haute. La hauteur est
      // bornée, la largeur suit : déformer un tracé le rend méconnaissable.
      try{doc.addImage(d.signature_png,'PNG',G+5,y,52,18);}
      catch(err){console.warn('[pdf signature]',err);
        police(9,'italic',GRIS);doc.text('(signature illisible)',G+5,y+8);}
    }
    police(8,'italic',GRIS);
    doc.text('Signature électronique simple, recueillie sur la page d\'acceptation du devis.',G+5,yc+30);
  }else{
    police(9,'normal',GRIS);
    doc.text('Écrire « Bon pour accord », dater et signer :',G+5,y);
    y+=6;
    doc.setDrawColor(210,204,230);doc.setLineWidth(.3);
    doc.line(G+5,y+8,G+62,y+8);   // date
    doc.line(G+72,y+8,D-5,y+8);   // signature
    police(8,'normal',GRIS);
    doc.text('Date',G+5,y+12);
    doc.text('Signature du responsable légal',G+72,y+12);
  }
  y=yc+H_CADRE+4;

  /* ---- Pieds de page, une fois toutes les pages connues ---- */
  const np=doc.getNumberOfPages();
  const pied=[e.raison_sociale||'Koala Kids',
              e.siret?'SIRET '+e.siret:'',
              RESEAU.pied_page||''].filter(Boolean).join('  ·  ');
  for(let i=1;i<=np;i++){
    doc.setPage(i);
    doc.setDrawColor(TRAIT[0],TRAIT[1],TRAIT[2]);doc.setLineWidth(.3);
    doc.line(G,285,D,285);
    doc.setFontSize(7.5);doc.setFont('helvetica','normal');
    doc.setTextColor(GRIS[0],GRIS[1],GRIS[2]);
    doc.text(doc.splitTextToSize(pied,L-24)[0]||'',G,289);
    doc.text(i+' / '+np,D,289,{align:'right'});
  }

  const enf=((p.prenom||'')+'-'+(p.nom||'')).replace(/[^A-Za-zÀ-ÿ0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'');
  const nomPdf='devis-'+(d.numero||auj())+(enf?'-'+enf:'')+'.pdf';
  if(envoi)return{nom:nomPdf,base64:doc.output('datauristring').split(',')[1]};
  doc.save(nomPdf);
  toast('PDF téléchargé ✅');
}

/* ---------- TARIFS ET FRAIS ---------- */
/* La grille vit en donnees, jamais en dur : un devis recopiera libelle et
   montant au moment de son etablissement, puis ne les relira plus. Modifier
   une ligne ici ne reecrit donc aucun devis deja emis. */
let TARIFS=[],FRAIS=[],tarifId=null,fraisId=null;

const MODES={horaire:'à l\'heure',mensuel:'par mois',journee:'par journée'};
const TYPES={unique:'une seule fois',annuel:'chaque année',mensuel:'chaque mois',unitaire:'par jour d\'accueil'};

function euro(n){return (Math.round(Number(n)*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function num(id){const v=val(id);return v===''?null:Number(String(v).replace(',','.'));}

/* Fourchette d'un tarif, en toutes lettres. Borne basse incluse, borne haute
   exclue : c'est ce qui rend le chevauchement impossible par construction, la
   ou deux conditions ecrites a la main (« <=40 » et « >=40 ») se disputaient
   le contrat de 40 h pile. */
function fourchette(t){
  const a=t.heures_min,b=t.heures_max;
  if(a==null&&b==null)return'tout volume horaire';
  if(a==null)return'moins de '+b+' h par semaine';
  if(b==null)return'à partir de '+a+' h par semaine';
  return'de '+a+' h à moins de '+b+' h par semaine';
}
/* Deux lignes se chevauchent si elles visent la meme creche (ou l'une les
   toutes) et que leurs fourchettes se recouvrent. On le signale plutot que de
   l'arbitrer en silence : c'est une erreur de saisie, pas un cas a gerer. */
function chevauche(a,b){
  if(a.creche_id&&b.creche_id&&String(a.creche_id)!==String(b.creche_id))return false;
  const a0=a.heures_min==null?-Infinity:Number(a.heures_min);
  const a1=a.heures_max==null?Infinity:Number(a.heures_max);
  const b0=b.heures_min==null?-Infinity:Number(b.heures_min);
  const b1=b.heures_max==null?Infinity:Number(b.heures_max);
  return a0<b1&&b0<a1;
}
function tarifsEnConflit(){
  const act=TARIFS.filter(t=>t.actif);
  const ids={};
  for(let i=0;i<act.length;i++)for(let j=i+1;j<act.length;j++)
    if(chevauche(act[i],act[j])){ids[act[i].id]=1;ids[act[j].id]=1;}
  return ids;
}
/* Tarif applicable a un volume hebdomadaire.
   On retient d'abord toutes les lignes qui couvrent le volume, puis on tranche —
   au lieu de prendre la premiere venue dans l'ordre d'affichage.

   Ce qui l'imposait : une borne laissee vide ne veut pas dire zero, elle veut
   dire « pas de limite ». Une ligne « Moins de 24 h » enregistree sans borne
   haute couvre donc TOUT volume horaire, et, premiere dans l'ordre, elle raflait
   les contrats de 31,5 h comme de 52,5 h — factures 9,90 € au lieu de 9,50 € ou
   9,00 €, sans que rien ne le signale. Un ecart de l'ordre de 185 € par mois sur
   un temps plein.

   La regle de depart, dans cet ordre :
     1. une ligne propre a la creche l'emporte sur une ligne du reseau ;
     2. la ligne la plus PRECISE l'emporte : deux bornes battent une, une borne
        bat aucune. Une ligne sans borne redevient ainsi ce qu'elle devrait
        etre — un filet de securite, jamais un vainqueur ;
     3. a precision egale, la fourchette la plus ETROITE ;
     4. a egalite encore, l'ordre d'affichage tranche.

   La precision se compte avant la largeur, et non l'inverse : « a partir de
   40 h » et une ligne sans borne sont toutes deux larges a l'infini, et les
   comparer par la largeur les laissait a egalite — un contrat de 52,5 h
   retombait alors sur la premiere dans l'ordre, c'est-a-dire la mauvaise.

   Cela repare le symptome, pas la saisie : si AUCUNE ligne n'est bornee, elles
   sont toutes aussi larges et la premiere gagne encore. La fourchette est donc
   desormais ecrite dans la liste deroulante du devis, la ou le choix se voit. */
function tarifPour(h,crecheId){
  const bornes=t=>(t.heures_min==null?0:1)+(t.heures_max==null?0:1);
  /* Pour MESURER une fourchette, une borne basse absente vaut zero et non moins
     l'infini : un volume horaire ne peut pas etre negatif. Sans cela, « moins de
     24 h » et « moins de 40 h » — deux lignes ouvertes a gauche, comme la grille
     Koala Kids les ecrit — etaient toutes deux larges a l'infini, donc a
     egalite, et 21 h partait sur la mauvaise.
     Cette lecture ne vaut que pour la mesure : la SELECTION, elle, continue de
     traiter une borne absente comme absente. */
  const largeur=t=>{
    const a=t.heures_min==null?0:Number(t.heures_min);
    const b=t.heures_max==null?Infinity:Number(t.heures_max);
    return b-a;
  };
  return TARIFS.filter(t=>t.actif)
    .filter(t=>!t.creche_id||!crecheId||String(t.creche_id)===String(crecheId))
    .filter(t=>(t.heures_min==null||h>=Number(t.heures_min))
             &&(t.heures_max==null||h<Number(t.heures_max)))
    .sort((a,b)=>(a.creche_id?0:1)-(b.creche_id?0:1)
              ||bornes(b)-bornes(a)
              ||largeur(a)-largeur(b)
              ||a.ordre-b.ordre)[0]||null;
}

async function openTarifs(){
  openOv('ovTarifs');
  document.getElementById('tarList').innerHTML='<p class="hint">Chargement…</p>';
  document.getElementById('fraList').innerHTML='';
  try{
    const[t,f]=await Promise.all([
      sb.from('tarifs').select('*').order('ordre').order('created_at'),
      sb.from('frais_annexes').select('*').order('ordre').order('created_at')
    ]);
    if(t.error)throw t.error;
    if(f.error)throw f.error;
    TARIFS=t.data||[];FRAIS=f.data||[];
  }catch(e){
    console.error('[openTarifs]',e);
    document.getElementById('tarList').innerHTML='<p class="hint">Chargement impossible.</p>';
    toast('Grille tarifaire inaccessible : '+(e.message||'erreur inconnue'),true);
    return;
  }
  renderTarifs();renderFrais();
}

function renderTarifs(){
  const box=document.getElementById('tarList');
  if(!TARIFS.length){box.innerHTML='<p class="hint">Aucun tarif enregistré.</p>';return;}
  const conflits=tarifsEnConflit();
  box.innerHTML=TARIFS.map(t=>{
    const cr=t.creche_id?nomCreche(t.creche_id):'toutes les crèches';
    const gene=t.mode==='horaire'?fourchette(t):MODES[t.mode]||t.mode;
    const warn=conflits[t.id]
      ? '<div class="td" style="color:var(--amber);font-weight:700"><i class="ti ti-alert-triangle"></i> Fourchette en conflit avec une autre ligne active.</div>' : '';
    return '<div class="tr'+(t.actif?'':' off')+'" onclick="openTarif(\''+t.id+'\')">'
      +'<div class="tb"><div class="tn">'+esc(t.libelle)+(t.actif?'':' · inactive')+'</div>'
      +'<div class="td">'+esc(gene)+' · '+esc(cr)+'</div>'+warn+'</div>'
      +'<div class="tm">'+euro(t.montant)+'<span style="font-size:12px;font-family:Nunito;color:var(--muted)"> '
      +esc(t.mode==='horaire'?'/ h':(t.mode==='journee'?'/ jour':'/ mois'))+'</span></div></div>';
  }).join('');
}

function renderFrais(){
  const box=document.getElementById('fraList');
  if(!FRAIS.length){box.innerHTML='<p class="hint">Aucun frais enregistré.</p>';return;}
  box.innerHTML=FRAIS.map(f=>{
    const cr=f.creche_id?nomCreche(f.creche_id):'toutes les crèches';
    const def=f.par_defaut?' · proposée par défaut':'';
    return '<div class="tr'+(f.actif?'':' off')+'" onclick="openFrais(\''+f.id+'\')">'
      +'<div class="tb"><div class="tn">'+esc(f.libelle)+(f.actif?'':' · inactive')+'</div>'
      +'<div class="td">'+esc(TYPES[f.type]||f.type)+' · '+esc(cr)+esc(def)+'</div></div>'
      +'<div class="tm'+(f.est_reduction?' red':'')+'">'+(f.est_reduction?'− ':'')+euro(f.montant)+'</div></div>';
  }).join('');
}

/* ---------- SAUVEGARDE EXTERNE DE LA GRILLE ---------- */
/* Un fichier .json tenu hors de Supabase. Il ne contient que la grille — aucun
   nom de famille, aucun revenu — et se relit sur une base reconstruite : les
   crèches y sont désignées par leur nom autant que par leur identifiant. Le
   format est versionné pour qu'une relecture dans deux ans sache ce qu'elle lit. */
const SAUV_FORMAT='koalakids-grille-tarifaire';
const SAUV_VERSION=1;
const CH_TARIF={libelle:'Libellé',description:'Description',mode:'Mode',montant:'Montant',
  heures_min:'À partir de (h/sem.)',heures_max:'Jusqu\'à, exclu (h/sem.)',
  actif:'Ligne active',ordre:'Ordre d\'affichage',creche_id:'Crèche'};
const CH_FRAIS={libelle:'Libellé',description:'Description',type:'Périodicité',montant:'Montant',
  est_reduction:'Réduction',par_defaut:'Proposée par défaut',
  actif:'Ligne active',ordre:'Ordre d\'affichage',creche_id:'Crèche'};

/* Comparaison indulgente : null, undefined et chaîne vide décrivent la même
   absence de valeur, et 12 vaut 12.00. Sans cela la liste des écarts se
   remplirait de différences qui n'en sont pas. */
function nrm(v){
  if(v==null||v==='')return '';
  if(typeof v==='boolean')return v?'oui':'non';
  if(typeof v==='number')return String(Math.round(v*1000)/1000);
  const s=String(v).trim();
  if(s!==''&&!isNaN(Number(s.replace(',','.'))))return String(Math.round(Number(s.replace(',','.'))*1000)/1000);
  return s;
}
function affV(champ,v){
  if(champ==='creche_id')return v?(nomCreche(v)||'crèche inconnue'):'toutes les crèches';
  const n=nrm(v);
  return n===''?'(vide)':n;
}
/* Clé d'appariement : le libellé et la crèche. Les identifiants ne survivent
   pas à une reconstruction de base, les libellés si. */
function cle(x){return nrm(x.libelle).toLowerCase()+'|'+nrm(x.creche_id);}

function exporterGrille(){
  if(!TARIFS.length&&!FRAIS.length){toast('Rien à exporter : la grille est vide.',true);return;}
  const proj=(o,champs)=>{
    const r={};
    Object.keys(champs).forEach(k=>{r[k]=o[k]==null?null:o[k];});
    r.creche_nom=o.creche_id?nomCreche(o.creche_id):null;
    return r;
  };
  const payload={
    format:SAUV_FORMAT,version:SAUV_VERSION,
    exporte_le:new Date().toISOString(),
    exporte_par:(PROF&&PROF.name)||'',
    creches:CRECHES.map(c=>({id:c.id,name:c.name})),
    tarifs:TARIFS.map(t=>proj(t,CH_TARIF)),
    frais:FRAIS.map(f=>proj(f,CH_FRAIS))
  };
  const txt=JSON.stringify(payload,null,2);
  const url=URL.createObjectURL(new Blob([txt],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download='koalakids-grille-'+auj()+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  const h=document.getElementById('hSauv');
  h.style.color='var(--green)';
  h.textContent='Sauvegarde du '+dfr(auj())+' exportée : '+TARIFS.length+' tarif'+(TARIFS.length>1?'s':'')
    +' et '+FRAIS.length+' frais. Rangez-la hors de l\'application.';
}

let PLAN=null;

function lireSauvegarde(ev){
  const f=ev.target.files&&ev.target.files[0];
  ev.target.value=''; // pour pouvoir rouvrir deux fois le même fichier
  if(!f)return;
  const h=document.getElementById('hSauv');
  const r=new FileReader();
  r.onerror=()=>{h.style.color='var(--red)';h.textContent='Fichier illisible.';};
  r.onload=()=>{
    let d;
    try{d=JSON.parse(r.result);}
    catch(e){h.style.color='var(--red)';h.textContent='Ce fichier n\'est pas un JSON valide.';return;}
    if(!d||d.format!==SAUV_FORMAT){
      h.style.color='var(--red)';
      h.textContent='Ce fichier ne provient pas de l\'export de la grille tarifaire.';return;
    }
    if(Number(d.version)>SAUV_VERSION){
      h.style.color='var(--red)';
      h.textContent='Sauvegarde écrite par une version plus récente de l\'application (format '+d.version+').';return;
    }
    h.style.color='';
    h.textContent='Fichier du '+(d.exporte_le?dfr(d.exporte_le.slice(0,10)):'date inconnue')
      +(d.exporte_par?' — export de '+d.exporte_par:'')+'.';
    comparerSauvegarde(d);
  };
  r.readAsText(f);
}

/* Une crèche du fichier se retrouve par son identifiant, puis par son nom.
   Une crèche disparue laisse la ligne sur « toutes les crèches » plutôt que
   de pointer vers un identifiant qui n'existe plus. */
function resoudreCreche(id,nom){
  if(id&&CRECHES.some(c=>String(c.id)===String(id)))return id;
  if(nom){
    const c=CRECHES.find(x=>nrm(x.name).toLowerCase()===nrm(nom).toLowerCase());
    if(c)return c.id;
  }
  return null;
}

function comparerSauvegarde(d){
  const plan=[];
  const passe=(fichier,base,champs,table,titre)=>{
    (Array.isArray(fichier)?fichier:[]).forEach(fx=>{
      const row={};
      Object.keys(champs).forEach(k=>{if(k in fx)row[k]=fx[k];});
      row.creche_id=resoudreCreche(fx.creche_id,fx.creche_nom);
      const ex=base.find(b=>cle(b)===cle(row));
      if(!ex){
        plan.push({table:table,op:'insert',titre:titre+' · '+(row.libelle||'sans libellé'),row:row,diffs:[]});
        return;
      }
      const diffs=[];
      Object.keys(row).forEach(k=>{
        if(nrm(row[k])!==nrm(ex[k]))diffs.push({label:champs[k]||k,de:ex[k],vers:row[k],champ:k});
      });
      if(diffs.length)plan.push({table:table,op:'update',id:ex.id,
        titre:titre+' · '+(ex.libelle||'sans libellé'),row:row,diffs:diffs});
    });
  };
  passe(d.tarifs,TARIFS,CH_TARIF,'tarifs','Tarif');
  passe(d.frais,FRAIS,CH_FRAIS,'frais_annexes',"Frais");

  // Ce qui existe en base sans figurer dans le fichier n'est jamais supprimé :
  // une restauration ne doit pas effacer une ligne créée depuis l'export.
  const enTrop=[]
    .concat(TARIFS.filter(t=>!(d.tarifs||[]).some(f=>cle(Object.assign({},f,{creche_id:resoudreCreche(f.creche_id,f.creche_nom)}))===cle(t))).map(t=>'Tarif · '+t.libelle))
    .concat(FRAIS.filter(x=>!(d.frais||[]).some(f=>cle(Object.assign({},f,{creche_id:resoudreCreche(f.creche_id,f.creche_nom)}))===cle(x))).map(x=>'Frais · '+x.libelle));

  PLAN=plan;
  const n=plan.length;
  document.getElementById('sTitle').textContent=n
    ? n+' ligne'+(n>1?'s':'')+' à restaurer' : 'Aucune différence';
  let corps=n
    ? plan.map(p=>'<div class="gr">'+esc(p.titre)
        +(p.op==='insert'?' <span class="neuf">(à créer)</span>':'')+'</div>'
        +(p.op==='insert'
          ? '<div class="ln">Ligne absente de la base : elle sera ajoutée telle que le fichier la décrit.</div>'
          : p.diffs.map(x=>'<div class="ln"><span class="k">'+esc(x.label)+'</span> : '
              +'<span class="old">'+esc(affV(x.champ,x.de))+'</span> → '
              +'<span class="new">'+esc(affV(x.champ,x.vers))+'</span></div>').join(''))
      ).join('')
    : '<p class="hint">Le fichier est identique à la grille en base : rien à restaurer.</p>';
  if(enTrop.length)corps+='<div class="gr" style="color:var(--muted)">Conservées telles quelles</div>'
    +'<div class="ln" style="color:var(--muted)">'+esc(enTrop.join(', '))
    +' — absentes du fichier, elles ne sont pas supprimées.</div>';
  document.getElementById('sBody').innerHTML=corps;
  const b=document.getElementById('btnResto');
  b.style.display=n?'':'none';
  b.disabled=false;b.innerHTML='<i class="ti ti-history"></i> Appliquer';
  openOv('ovSauv');
}
