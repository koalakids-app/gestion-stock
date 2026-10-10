
/* ---------- LE PDF DU CONTRAT ---------- */
/* Le document est REDESSINÉ en texte, pas photographié. html2canvas aurait été
   plus court à écrire, mais il produit une image : fichier lourd, texte ni
   sélectionnable ni cherchable, et rendu dépendant de la largeur de l'écran
   depuis lequel on imprime — le même contrat n'aurait pas sorti pareil depuis
   la tablette et depuis le poste du bureau.

   Deuxième parti pris, repris du devis : le PDF lit `contrats_lignes` EN BASE,
   jamais le calcul à l'écran. Ce qui s'imprime est donc ce qui a été figé à
   l'établissement du contrat, même si la grille tarifaire a bougé depuis.

   C'est CE document qui répond à la question « où voit-on le contrat signé ».
   Il porte les deux tracés — celui de la famille et celui de la crèche — avec
   leurs dates. Tant qu'il n'est pas signé, il porte les deux cadres vides,
   pour être imprimé et signé à la main : la voie papier reste ouverte. */
const JSPDF_URL='https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
/* Même logo que la page publique devis.html et le PDF interne d'inscriptions.html
   (data URI identique), pour que l'en-tête du contrat corresponde partout. */
const LOGO_KOALA_PNG='data:image/png;base64,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';


/* jsPDF n'est chargé qu'au premier clic : 300 ko qu'il serait absurde de faire
   payer à l'ouverture du module à quelqu'un qui vient consulter une liste. */
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
   milliers par une espace insécable étroite (U+202F) que les polices standard
   de jsPDF ne savent pas dessiner : le chiffre sortait troué. Ici l'espace est
   une espace ordinaire. */
function eurPdf(n){
  const v=Math.round(Number(n||0)*100)/100;
  const s=Math.abs(v).toFixed(2).replace('.',',');
  const pt=s.split(',');
  return (v<0?'- ':'')+pt[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+pt[1]+' €';
}
function adrCreche(id){const c=CRECHES.find(x=>String(x.id)===String(id));return (c&&c.addr)||'';}
function joursTxt(v){
  const j=toArr(v).map(Number);
  return JOURS.filter(x=>j.indexOf(x[0])>=0).map(x=>x[1].toLowerCase()).join(', ');
}
function dureeMin(hd,hf){
  if(!hd||!hf)return 0;
  const a=String(hd).slice(0,5).split(':').map(Number),b=String(hf).slice(0,5).split(':').map(Number);
  const mins=(b[0]*60+b[1])-(a[0]*60+a[1]);
  return mins>0?mins:0;
}
function fmtDuree(mins){return Math.floor(mins/60)+'h'+String(mins%60).padStart(2,'0');}

async function pdfContrat(id){
  const c=CONTRATS.find(x=>String(x.id)===String(id));
  if(!c){toast('Enregistrez le contrat avant de l\'imprimer.',true);return;}
  toast('Préparation du PDF…');
  try{
    await Promise.all([chargeJsPdf(),loadReseau()]);
    // Le sujet et les parents : la fiche du dossier est ouverte, mais le PDF
    // peut aussi être demandé depuis la liste. On s'assure du contexte.
    if(!CSUJ||String(CSUJ.id)!==String(c.enfant_id||c.preinscription_id)){
      const kind=c.enfant_id?'enfant':'pre';
      CSUJ=normaliser(kind,c.enfant_id||c.preinscription_id);
      if(CSUJ)await loadContexte();
    }
    const{data,error}=await sb.from('contrats_lignes').select('*')
      .eq('contrat_id',c.id).order('ordre');
    if(error)throw error;
    dessineContrat(c,data||[]);
  }catch(e){
    console.error('[pdfContrat]',e);
    toast('PDF impossible : '+(e.message||'erreur inconnue'),true);
  }
}

function dessineContrat(c,lignes,telecharger){
  if(telecharger===undefined)telecharger=true;
  const jsPDF=window.jspdf.jsPDF;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const G=16, D=194, L=D-G, BAS=281;   // marges et bas de page utile
  let y=0;

  const e=etabDe(c.creche_id);
  const cr=nomCreche(c.creche_id);
  const suj=CSUJ||{};
  const VIOLET=[74,63,159], ORANGE=[244,121,32], GRIS=[142,138,168],
        NOIR=[43,39,64], VERT=[46,158,107], TRAIT=[228,222,240];
  const avenant=c.type==='avenant';

  function police(t,s,k){doc.setFontSize(t);doc.setFont('helvetica',s||'normal');
    const q=k||NOIR;doc.setTextColor(q[0],q[1],q[2]);}
  function trait(k){const q=k||TRAIT;doc.setDrawColor(q[0],q[1],q[2]);doc.setLineWidth(.3);doc.line(G,y,D,y);}
  function place(h){if(y+h>BAS){doc.addPage();y=20;}}
  function ecrire(s,t,st,k,x,al){
    police(t,st,k);
    doc.text(String(s==null?'':s),x==null?G:x,y,al?{align:al}:undefined);
  }
  /* Un paragraphe qui se coupe tout seul et sait changer de page en cours de
     route : les clauses d'un contrat peuvent faire quinze lignes comme trois. */
  function para(s,t,st,k,larg,inter){
    if(s==null||String(s).trim()==='')return;
    police(t||9.5,st,k);
    doc.splitTextToSize(String(s),larg||L).forEach(l=>{
      place(inter||4.4);
      doc.text(l,G,y);y+=(inter||4.4);
    });
  }
  /* Les interlignes sont resserrés au strict lisible : chaque millimètre gagné
     ici est un millimètre qui rapproche les signatures du contrat, et une page
     de signatures détachée est une faiblesse juridique. */
  function titreSection(s){
    place(5.5);y+=1.5;
    ecrire(s.toUpperCase(),9,'bold',ORANGE);
    y+=1;trait();y+=2.2;
  }
  function kv(k,v){
    place(3.8);
    police(9.5,'normal',GRIS);doc.text(String(k),G,y);
    police(9.5,'bold',NOIR);doc.text(String(v==null?'—':v),G+56,y);
    y+=3.8;
  }

  /* ---- En-tête : qui édite le contrat ---- */
  y=15;
  const logoH=8.2,logoW=logoH*(365/138);
  let yNom;
  try{doc.addImage(LOGO_KOALA_PNG,'PNG',G,9,logoW,logoH);yNom=9+logoH+4.5;}
  catch(err){ecrire(e.raison_sociale||'Koala Kids',15,'bold',VIOLET);yNom=y+5.2;}
  y=yNom;
  [e.forme_juridique,
   e.adresse_siege,
   [e.siret?'SIRET '+e.siret:'',e.code_ape?'APE '+e.code_ape:''].filter(Boolean).join('  ·  '),
   [e.telephone,e.email].filter(Boolean).join('  ·  ')
  ].filter(Boolean).forEach(t=>{ecrire(t,8.5,'normal',GRIS);y+=3.6;});

  let yd=15;
  const dr=(s,t,st,k)=>{if(!s)return;police(t,st,k);doc.text(String(s),D,yd,{align:'right'});yd+=t<=8.5?3.6:5;};
  dr(cr||'',11,'bold',NOIR);
  dr(adrCreche(c.creche_id),8.5,'normal',GRIS);
  dr(e.pmi_numero?'Agrément PMI '+e.pmi_numero:'',8.5,'normal',GRIS);
  dr(e.pmi_date?'délivré le '+dfr(e.pmi_date):'',8.5,'normal',GRIS);

  y=Math.max(y,yd)+3;
  trait(VIOLET);y+=7;

  /* ---- Le titre ---- */
  const titre=(avenant?'AVENANT ':'CONTRAT D\'ACCUEIL ')+(c.numero||'');
  ecrire(titre,15,'bold',VIOLET);
  // La largeur se mesure AVEC la police du titre, avant d'en changer : mesurée
  // en 9,5 pt elle vaut deux tiers de la vraie, et la mention venait se poser
  // au milieu du numéro.
  const apres=G+doc.getTextWidth(titre)+5;
  if(c.type==='renouvellement'){police(9.5,'normal',GRIS);doc.text('renouvellement',apres,y);}
  // Un brouillon imprimé doit se voir comme tel : rien n'empêche de le tendre
  // à une famille par mégarde, et il n'engage personne.
  if(c.statut==='brouillon'){
    police(9,'bold',ORANGE);doc.text('BROUILLON',D,y,{align:'right'});
  }else if(c.statut==='contresigne'){
    police(9,'bold',VERT);doc.text('SIGNÉ DES DEUX PARTS',D,y,{align:'right'});
  }else if(c.statut==='signe'){
    police(9,'bold',ORANGE);doc.text('EN ATTENTE DE CONTRESIGNATURE',D,y,{align:'right'});
  }else if(c.statut==='resilie'){
    police(9,'bold',[198,40,40]);doc.text('RÉSILIÉ',D,y,{align:'right'});
  }
  y+=5;
  ecrire('Établi le '+dfr(String(c.created_at||auj()).slice(0,10))
    +(avenant&&c.date_effet?'  ·  prend effet le '+dfr(c.date_effet):''),9,'normal',GRIS);
  y+=6;

  /* ---- Les parties ---- */
  /* Un contrat nomme ceux qu'il engage. C'est la différence de fond avec un
     devis, qui ne faisait que chiffrer une proposition. */
  titreSection('Entre les soussignés');
  para('D\'une part, '+(e.raison_sociale||'la crèche')
    +(e.forme_juridique?', '+e.forme_juridique:'')
    +(e.siret?', SIRET '+e.siret:'')
    +(e.adresse_siege?', dont le siège est situé '+e.adresse_siege:'')
    +(e.representant_nom?', représentée par '+e.representant_nom
      +(e.representant_qualite?', '+e.representant_qualite:''):'')
    +(cr?', pour son établissement '+cr:'')+'.',9.5,'normal',NOIR,L,3.8);
  y+=0.8;
  const foyer=[c.famille_adresse,
    [c.famille_code_postal,c.famille_ville].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const signataires=(CPARENTS||[]).filter(p=>p.destinataire)
    .map(p=>((p.prenom||'')+' '+(p.nom||'')).trim()+(p.lien?' ('+(LIENS[p.lien]||'').toLowerCase()+')':''))
    .filter(Boolean);
  para('D\'autre part, '+(signataires.length?signataires.join(' et '):'le ou les responsables légaux')
    +(foyer?', demeurant '+foyer:'')
    +(c.num_allocataire?', n° allocataire '+c.num_allocataire:'')+'.',9.5,'normal',NOIR,L,3.8);
  y+=0.8;
  para('Il a été convenu ce qui suit pour l\'accueil de '
    +(((suj.prenom||'')+' '+(suj.nom||'')).trim()||'l\'enfant')
    +(suj.dob?', né(e) le '+dfr(suj.dob):'')+'.',9.5,'normal',NOIR,L,3.8);

  /* ---- L'accueil ---- */
  titreSection(avenant?'Ce que l\'avenant modifie':'L\'accueil convenu');
  const avecTerme=!!c.date_fin;
  kv('Crèche',cr||'—');
  kv('Début de l\'accueil',c.date_debut?dfr(c.date_debut):'à convenir');
  kv('Fin de l\'accueil',avecTerme?dfr(c.date_fin):'sans terme prévu');
  if(avenant&&c.date_effet)kv('Date d\'effet',dfr(c.date_effet));
  if(avecTerme){
    kv('Jours facturés',(c.jours_accueil!=null?c.jours_accueil+' jours':'—')
      +(c.mois_factures?' sur '+nbFr(c.mois_factures)+' mois':''));
  }else{
    kv('Semaines facturées',c.semaines_an+' semaines par an');
  }
  y+=0.4;

  /* Le récap semaine, en tableau, pour visualiser la semaine d'un coup d'œil
     plutôt que de déduire les horaires du volume hebdomadaire — même
     présentation que le devis (devis.html, inscriptions.html). */
  const jset=toArr(c.jours).map(Number);
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
  ligneSemaine(['Jours de la semaine','Heure d\'arrivée','Heure de départ','Nombre heures de présences'],4,true,6.8);
  let totalMinSem=0;
  JOURS.forEach(([num,nom])=>{
    const actif=jset.indexOf(num)>=0;
    const mins=actif?dureeMin(c.heure_debut,c.heure_fin):0;
    totalMinSem+=mins;
    ligneSemaine([nom,actif?(String(c.heure_debut||'').slice(0,5)):'',actif?(String(c.heure_fin||'').slice(0,5)):'',fmtDuree(mins)],3.5,false);
  });
  ligneSemaine(['Total','','',fmtDuree(totalMinSem)],4,true);
  y+=0.5;
  para(avecTerme
    ? 'La mensualité répartit les '+(c.jours_accueil!=null?c.jours_accueil:'—')+' jours d\'accueil de '
      +'la période sur '+nbFr(c.mois_factures||0)+' mensualités égales. Elle est identique chaque mois, '
      +'y compris pendant les périodes de fermeture, déjà déduites du nombre de jours facturés.'
    : 'La mensualité est lissée sur douze mois : elle est identique chaque mois, y compris '
      +'pendant les semaines de fermeture, déjà déduites du nombre de semaines facturées.',
    8,'italic',GRIS,L,3.2);

  /* ---- Le détail chiffré ---- */
  titreSection('La mensualité');
  const RECUR=['accueil','mensuel','unitaire'];
  function unite(l){
    if(l.type==='accueil')return c.tarif_mode==='horaire'?'h':(c.tarif_mode==='journee'?'j':'mois');
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
    y+=h+1.2;
    trait();y+=2;
  }

  const recu=lignes.filter(l=>RECUR.indexOf(l.type)>=0);
  const hors=lignes.filter(l=>RECUR.indexOf(l.type)<0);
  if(!recu.length)para('Aucune ligne récurrente.',9.5,'italic',GRIS);
  recu.forEach(ligne);

  place(8);y+=0.3;
  police(11,'bold',VIOLET);
  doc.text('TOTAL MENSUEL',G,y);
  doc.setFontSize(14);
  doc.text(eurPdf(c.total_mensuel),D,y,{align:'right'});
  y+=2.2;trait(VIOLET);y+=2.6;

  if(c.total_annuel){
    place(3.6);
    police(9,'normal',GRIS);
    doc.text(avecTerme
      ? 'Soit '+eurPdf(c.total_annuel)+' sur la durée du contrat ('+nbFr(c.mois_factures||0)+' mensualités).'
      : 'Soit '+eurPdf(c.total_annuel)+' sur douze mois.',G,y);
    y+=3.2;
  }

  if(hors.length){
    titreSection('Hors mensualité');
    hors.forEach(ligne);
    para('Ces montants sont facturés en une seule fois ou une fois par an, en sus de la mensualité.',
      8,'italic',GRIS,L,3.6);
  }

  /* ---- Le CMG ---- */
  if(c.cmg_estime!=null){
    titreSection('Estimation du complément de libre choix du mode de garde');
    [['Coût mensuel',eurPdf(c.total_mensuel),NOIR],
     ['CMG estimé, versé par la CAF','- '+eurPdf(c.cmg_estime),VERT]].forEach(([k,v,q])=>{
      place(4);
      police(9.5,'normal',GRIS);doc.text(k,G,y);
      police(9.5,'bold',q);doc.text(v,D,y,{align:'right'});
      y+=4;
    });
    y+=0.3;trait();y+=2.8;
    police(11,'bold',VIOLET);doc.text('RESTE À CHARGE MENSUEL',G,y);
    doc.setFontSize(14);doc.text(eurPdf(c.reste_a_charge),D,y,{align:'right'});
    y+=3;
    para('Estimation indicative, calculée à partir des revenus communiqués par la famille et du '
      +'barème CAF en vigueur. Seule la CAF détermine le montant réellement versé. La crèche ne '
      +'perçoit pas le CMG : elle facture la mensualité ci-dessus.',8,'italic',GRIS,L,3.2);
  }

  /* ---- La résiliation ---- */
  /* Un contrat résilié reste un contrat : il a existé, il a été facturé, et
     c'est lui qu'on ressort en cas de litige. La résiliation s'y inscrit donc
     comme une mention datée, et non en remplacement du document. */
  if(c.statut==='resilie'||c.resilie_le){
    titreSection('Résiliation');
    kv('Notifiée le',dfr(c.resilie_le));
    kv('À l\'initiative de',c.resilie_origine==='creche'?'la crèche':'la famille');
    kv('Dernier jour d\'accueil',dfr(c.resilie_fin_preavis));
    if(c.resilie_par)kv('Notifiée par',c.resilie_par);
    if(c.resilie_motif&&String(c.resilie_motif).trim()){
      y+=1;
      para('Motif : '+c.resilie_motif,9,'normal',NOIR,L,4.2);
    }
  }

  /* ---- Le mot de la crèche ---- */
  if(c.commentaire&&String(c.commentaire).trim()){
    titreSection('Précisions');
    para(c.commentaire,9.5,'normal',NOIR);
  }

  /* ---- Les clauses, telles qu'elles ont été figées à l'envoi ---- */
  const clauses=[
    ['Résiliation et préavis',c.preavis_texte],
    ['Conditions de résiliation',c.conditions_resiliation],
    ['Mentions légales',c.mentions_legales]
  ].filter(x=>x[1]&&String(x[1]).trim());
  if(clauses.length){
    titreSection('Les conditions du contrat');
    clauses.forEach(x=>{
      place(5.5);
      ecrire(x[0],9,'bold',NOIR);y+=3;
      para(x[1],8.5,'normal',NOIR,L,3.3);
      y+=0.5;
    });
  }

  /* ---- Les signatures ---- */
  /* Deux cadres côte à côte : la famille à gauche, la crèche à droite. Chacun
     porte son tracé et sa date s'il existe, et reste vide sinon — un contrat
     non signé s'imprime ainsi pour être signé à la main, ce qui garde la voie
     papier ouverte pour une famille sans smartphone. */
  /* La réservation doit couvrir TOUT le bloc, sinon il se coupe : 4 mm de
     respiration, 12 pour le titre de section, la hauteur des cadres, 4 après,
     et 8 pour la mention eIDAS. Réserver moins — c'était le cas — faisait
     basculer les deux cadres sur une page vide alors qu'il restait la place
     juste au-dessus. */
  const H_CADRE=34;
  const BESOIN=H_CADRE+21;
  if(y+BESOIN>BAS){
    doc.addPage();y=20;
    /* Une page de signatures détachée du contrat ne prouve pas grand-chose :
       rien ne dit ce qu'on a signé. Quand le saut est inévitable, la page
       s'ouvre donc sur un rappel qui la rattache au document — numéro, enfant,
       période, mensualité. C'est ce qu'un contrôle ou un avocat cherche en
       premier. */
    police(9,'bold',VIOLET);
    doc.text((avenant?'Avenant ':'Contrat d\'accueil ')+(c.numero||''),G,y);
    y+=4.6;
    police(8.5,'normal',GRIS);
    doc.text([((suj.prenom||'')+' '+(suj.nom||'')).trim(),
              cr,
              (c.date_debut?'du '+dfr(c.date_debut):'')+(c.date_fin?' au '+dfr(c.date_fin):''),
              eurPdf(c.total_mensuel)+' par mois'
             ].filter(Boolean).join('  ·  '),G,y);
    y+=3;trait();y+=6;
  }else{
    y+=3;
  }
  // Le titre est écrit sans place() : la réservation vient d'être faite en
  // bloc, et un second saut ici séparerait le titre de ses cadres.
  ecrire('SIGNATURES',9,'bold',ORANGE);
  y+=1.5;trait();y+=4;
  const yc=y;
  const larg=(L-6)/2;
  doc.setDrawColor(TRAIT[0],TRAIT[1],TRAIT[2]);doc.setLineWidth(.4);
  doc.roundedRect(G,yc-2,larg,H_CADRE,3,3);
  doc.roundedRect(G+larg+6,yc-2,larg,H_CADRE,3,3);

  function cadre(x,titre,sousTitre,png,quand,qui){
    police(8.5,'bold',VIOLET);doc.text(titre,x+4,yc+3);
    police(7.5,'normal',GRIS);doc.text(sousTitre,x+4,yc+7);
    if(png){
      // Une signature tracée au doigt est plus large que haute. La hauteur est
      // bornée, la largeur suit : déformer un tracé le rend méconnaissable.
      try{doc.addImage(png,'PNG',x+4,yc+9,larg-10,15);}
      catch(err){console.warn('[pdf signature]',err);
        police(8,'italic',GRIS);doc.text('(signature illisible)',x+4,yc+16);}
      police(7.5,'normal',GRIS);
      doc.text('Le '+dfr(quand),x+4,yc+27);
      if(qui)doc.splitTextToSize(String(qui),larg-8).slice(0,1)
        .forEach((t,i)=>doc.text(t,x+4,yc+30.5+i*3.4));
    }else{
      doc.setDrawColor(210,204,230);doc.setLineWidth(.3);
      doc.line(x+4,yc+25,x+larg-4,yc+25);
      police(7.5,'normal',GRIS);doc.text('Date et signature',x+4,yc+29);
    }
  }
  const signeFamille=!!(c.signature_png&&c.repondu_le
    &&['signe','contresigne','resilie'].indexOf(c.statut)>=0);
  cadre(G,'LA FAMILLE',
    signeFamille?'Signé en ligne':'Faire précéder de « Lu et approuvé »',
    signeFamille?c.signature_png:null,c.repondu_le,c.repondu_par);
  cadre(G+larg+6,'LA CRÈCHE',
    c.contresignature_png?'Contresigné':'Pour l\'établissement',
    c.contresignature_png||null,c.contresigne_le,c.contresigne_par);
  y=yc+H_CADRE+3;

  if(signeFamille||c.contresignature_png){
    place(6.5);
    para('Signature électronique simple au sens du règlement eIDAS, recueillie sur la page de '
      +'signature du contrat après vérification du signataire par un code envoyé à son adresse '
      +'e-mail. Elle vaut preuve de l\'accord des parties.',7,'italic',GRIS,L,3.2);
  }

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

  const enf=((suj.prenom||'')+'-'+(suj.nom||'')).replace(/[^A-Za-zÀ-ÿ0-9-]/g,'')
    .replace(/-+/g,'-').replace(/^-|-$/g,'');
  const nomFichier=(avenant?'avenant-':'contrat-')+(c.numero||auj())+(enf?'-'+enf:'')+'.pdf';
  if(telecharger){
    doc.save(nomFichier);
    toast('PDF téléchargé ✅');
  }
  return{doc,nomFichier};
}

/* ---------- ENVOI DU CONTRAT SIGNÉ PAR MAIL ---------- */
/* Déclenché juste après la contresignature (voir contresigner()) : le contrat
   est alors complet des deux côtés, c'est le document que la famille doit
   recevoir. Le PDF est redessiné ici plutôt que réutilisé depuis un éventuel
   téléchargement précédent, pour la même raison qu'ailleurs dans ce fichier —
   ce qui part par mail doit être ce qui est en base à l'instant de l'envoi,
   pas un instantané pris plus tôt. Un échec d'envoi ne fait pas échouer la
   contresignature : celle-ci est déjà actée, on prévient juste que le mail
   n'est pas parti et le bouton « Le PDF » reste disponible pour l'envoyer à
   la main. */
async function envoyerContratSigneParMail(c){
  try{
    await Promise.all([chargeJsPdf(),loadReseau()]);
    if(!CSUJ||String(CSUJ.id)!==String(c.enfant_id||c.preinscription_id)){
      const kind=c.enfant_id?'enfant':'pre';
      CSUJ=normaliser(kind,c.enfant_id||c.preinscription_id);
      if(CSUJ)await loadContexte();
    }
    const{data,error}=await sb.from('contrats_lignes').select('*')
      .eq('contrat_id',c.id).order('ordre');
    if(error)throw error;
    const{doc,nomFichier}=dessineContrat(c,data||[],false);
    const pdfBase64=doc.output('datauristring').split(',')[1];

    const{error:eFn}=await sb.functions.invoke('envoyer-contrat-signe',
      {body:{contrat_id:c.id,pdf_base64:pdfBase64,nom_fichier:nomFichier,expediteur:(PROF&&PROF.name)||undefined}});
    if(eFn)throw new Error(await detailFn(eFn));
    toast('Contrat signé envoyé à la famille par e-mail ✅');
  }catch(e){
    console.error('[envoyerContratSigneParMail]',e);
    toast('L\'envoi du mail a échoué : '
      +(e.message||'erreur inconnue')+' — le PDF reste disponible via « Le PDF ».',true);
  }
}

/* Renvoi manuel depuis la fiche du contrat : couvre les contrats déjà
   contresignés avant la mise en place de l'envoi automatique, et le cas où
   la famille redemande simplement une copie. Même fonction d'envoi que
   celle déclenchée après la contresignature. */
async function renvoyerContratSigne(){
  const c=CONTRATS.find(x=>String(x.id)===String(contratId));
  if(!c){toast('Contrat introuvable.',true);return;}
  const adresses=String(c.destinataires||'').split(',').map(x=>x.trim()).filter(x=>x.includes('@'));
  if(!adresses.length){toast('Aucune adresse e-mail enregistrée sur ce contrat.',true);return;}
  if(!confirm('Envoyer le contrat signé à '+adresses.join(', ')+' ?'))return;

  const b=document.getElementById('btnMailCt');
  b.disabled=true;b.innerHTML='<i class="ti ti-mail"></i> Envoi…';
  await envoyerContratSigneParMail(c);
  b.disabled=false;b.innerHTML='<i class="ti ti-mail"></i> Envoyer par mail';
}

/* ---------- NOTICE ---------- */
const NOTICE=`
<p><b>Le parcours, dans l'ordre.</b> Préinscription → devis envoyé → devis accepté et signé → <b>contrat</b> établi, envoyé, signé par la famille → <b>contresigné</b> par la crèche → <b>alors seulement</b> la fiche enfant se crée, dans le module Devis. Un enfant n'entre dans les effectifs, les présences et les commandes de repas qu'une fois son contrat complet des deux côtés.</p>
<p style="margin-top:10px"><b>Deux files, un même travail.</b> En haut, les <b>demandes en attente de contrat</b> : devis accepté, fiche enfant pas encore créée. En dessous, les <b>enfants inscrits</b>, pour les renouvellements et les avenants. Une demande quitte la première file le jour où sa fiche enfant est créée.</p>
<p style="margin-top:10px"><b>D'où viennent les chiffres.</b> Un contrat initial reprend le <b>devis accepté</b> — l'accord de la famille — et les recalcule sur la grille du jour. Si le total diffère de celui du devis, l'écran le dit : la famille a accepté un montant, et le contrat ne doit pas en engager un autre sans qu'on le sache.</p>
<p style="margin-top:10px"><b>Le renouvellement</b> repart du contrat de l'année écoulée, décale les dates d'une année scolaire et applique la <b>grille en vigueur</b> : le tarif peut donc changer d'une année à l'autre.</p>
<p style="margin-top:10px"><b>Un contrat envoyé ne se modifie plus.</b> Un changement en cours d'année — un jour ajouté, des horaires décalés — se porte par <b>avenant</b> : un document daté, rattaché au contrat d'origine, qui se signe comme lui. Le contrat initial reste intact. La PMI l'exige en contrôle, et c'est le seul moyen de justifier en juin ce qui était facturé en mars.</p>
<p style="margin-top:10px"><b>Une demande ne porte qu'un seul contrat initial.</b> La base le refuse au second : deux contrats initiaux sur la même demande seraient deux engagements concurrents pour le même accueil.</p>
<p style="margin-top:10px"><b>Les coordonnées sont recopiées, pas liées.</b> L'adresse et le n° allocataire portés au contrat sont ceux du jour de la signature. Les corriger ailleurs ne réécrit aucun contrat déjà signé — c'est voulu.</p>
<p style="margin-top:10px"><b>La résiliation.</b> Un contrat d'accueil se termine rarement à sa date de fin : une famille déménage, change de mode de garde, ou la crèche met fin à l'accueil. Le bouton <b>Résilier</b> apparaît sur un contrat contresigné. Il demande de quel côté vient la décision, la date de notification et la fin du préavis — proposée à partir de la durée réglée dans Paramètres, et modifiable pour un départ négocié ou une dispense.</p>
<p style="margin-top:10px">La résiliation <b>clôt la ligne d'accueil</b> à la fin du préavis : les feuilles de présence, la vue Gantt et les commandes de repas s'arrêtent à cette date. Elle ne touche <b>pas</b> à la date de sortie de la fiche enfant, qui marque un départ effectif — vous la poserez le jour venu. Le contrat résilié reste consultable et imprimable : il a existé, il a été facturé, et c'est lui qu'on ressort en cas de litige.</p>
<p style="margin-top:10px"><b>Réserve juridique.</b> Une signature tracée à l'écran est une signature électronique <b>simple</b> au sens d'eIDAS : elle prouve un accord, sans la force probante d'une signature qualifiée. Même niveau que le dossier de familiarisation, déjà en usage dans le réseau.</p>
`;
function openNotice(){document.getElementById('noticeBody').innerHTML=NOTICE;openOv('ovNotice');}

document.querySelectorAll('.ov').forEach(o=>{
  o.addEventListener('click',ev=>{if(ev.target===o)o.classList.remove('on');});
});

boot().catch(e=>{console.error('[boot]',e);showLogin('Démarrage impossible — réessayez.');});
