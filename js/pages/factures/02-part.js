function ecartHeures(){return r2(nb(val('sdHreel'))-nb(val('sdHpaye')));}
function calcSolde(){
  const dh=ecartHeures();
  const e=r2(dh*nb(val('sdTarif')));
  setVal('sdEcart',String(e).replace('.',',')+' €');
  const el=document.getElementById('sdEcart');
  if(el)el.style.color=e<0?'var(--green)':'var(--red)';
  const d=document.getElementById('sdDetail');
  if(d)d.innerHTML=val('sdHreel')+' h réalisées − '+val('sdHpaye')+' h mensualisées = <b>'
    +String(dh).replace('.',',')+' h</b> × '+val('sdTarif')+' € = <b>'+esc(eur(e))+'</b>'
    +(dh>0?' à facturer.':(dh<0?' à restituer à la famille.':' — compteur déjà à zéro.'));
}
async function creerSolde(){
  const dh=ecartHeures();
  const ecart=r2(dh*nb(val('sdTarif')));
  const sup=r2(nb(val('sdSup')));
  const total=r2(ecart+sup);
  if(!confirm('Créer la facture de solde de tout compte ?\n\nRégularisation : '+eur(ecart)
    +(sup?'\nCompléments : '+eur(sup):'')+'\nTotal : '+eur(total)
    +'\n\nElle sera créée EN BROUILLON : rien n\'est numéroté ni envoyé.'))return;
  try{
    const fin=SOLDE_CT.resilie_fin_preavis||champ(SOLDE_CT,C_FIN)||auj();
    const mois=String(fin).slice(0,7);
    const row=Object.assign({
      creche_id:SOLDE_CT.creche_id, contrat_id:SOLDE_CT.id, enfant_id:SOLDE_CT.enfant_id||null,
      type:'solde_tout_compte', statut:'brouillon',
      mois:mois, periode_debut:champ(SOLDE_CT,C_DEBUT), periode_fin:fin,
      date_echeance:plusMois(auj(),1),
      ct_numero:SOLDE_CT.numero||null,
      ct_tarif_horaire:nb(val('sdTarif'))||null,
      heures_facturees:dh>0?dh:null,
      commentaire:'Décompte de fin de contrat — régularisation entre les heures réellement réalisées '
        +'et les heures mensualisées payées (article 8 de la convention d\'accueil). '
        +'Le dépôt de garantie est restitué par virement après règlement de cette facture.',
      created_by:ME?ME.id:null
    },enteteEmetteur(),enteteFamille(SOLDE_CT));
    const{data,error}=await sb.from('factures').insert(row).select().single();
    if(error)throw error;
    const lg=[];
    if(ecart!==0)lg.push({facture_id:data.id,ordre:1,type:'regularisation',
      libelle:ecart>0?'Régularisation d\'heures — complément dû':'Régularisation d\'heures — trop-perçu restitué',
      quantite:dh,prix_unitaire:nb(val('sdTarif')),montant:ecart,
      detail:val('sdHreel')+' h réalisées − '+val('sdHpaye')+' h mensualisées = '
        +String(dh).replace('.',',')+' h, au tarif de '+val('sdTarif')+' €'});
    if(sup!==0)lg.push({facture_id:data.id,ordre:2,type:'supplement',
      libelle:'Compléments de fin de contrat (préavis, semaine entamée, frais)',montant:sup});
    if(lg.length){const{error:e2}=await sb.from('factures_lignes').insert(lg);if(e2)throw e2;}
    fermer('ovSolde');
    await ouvrirFacture(data.id);refresh();
    toast('Facture de solde créée en brouillon.');
  }catch(e){toast('Impossible : '+detail(e),true);}
}

/* ------------------------------------------------------------------- PDF */
/* Texte natif jsPDF, jamais html2canvas : une facture doit rester lisible,
   sélectionnable et légère. jsPDF est chargé au premier clic seulement. */
let JSPDF_OK=false;
function chargerJsPDF(){
  if(JSPDF_OK)return Promise.resolve();
  return new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload=()=>{JSPDF_OK=true;res();};
    s.onerror=()=>rej(new Error('jsPDF n\'a pas pu être chargé (connexion ?).'));
    document.head.appendChild(s);
  });
}
async function pdf(){
  try{await chargerJsPDF();}catch(e){toast(e.message,true);return;}
  const f=FAC;
  const {jsPDF}=window.jspdf;
  const d=new jsPDF({unit:'mm',format:'a4'});
  const L=18,R=192;let y=20;
  const txt=(s,x,yy,o)=>{d.text(String(s==null?'':s),x,yy,o);};
  const ligne=()=>{d.setDrawColor(230,226,240);d.line(L,y,R,y);y+=5;};
  const saut=(besoin)=>{if(y+besoin>282){d.addPage();y=20;}};

  /* En-tête : l'émetteur. Sans raison sociale ni SIRET, on laisse le blanc
     apparent plutôt que d'inventer — c'est la règle de tous les documents. */
  d.setFont('helvetica','bold');d.setFontSize(15);d.setTextColor(74,63,159);
  txt(f.em_raison_sociale||f.em_creche_nom||'',L,y);y+=6;
  d.setFont('helvetica','normal');d.setFontSize(9);d.setTextColor(90,86,110);
  [f.em_forme_juridique,f.em_adresse,
   f.em_siret?('SIRET '+f.em_siret+(f.em_code_ape?' — APE '+f.em_code_ape:'')):null,
   [f.em_telephone,f.em_email].filter(Boolean).join(' — ')||null,
   f.em_creche_nom?('Établissement : '+f.em_creche_nom):null
  ].filter(Boolean).forEach(s=>{txt(s,L,y);y+=4.2;});

  /* Le titre et le numéro, à droite */
  let yt=20;
  d.setFont('helvetica','bold');d.setFontSize(17);d.setTextColor(244,121,32);
  const titre=f.type==='avoir'?'AVOIR':'FACTURE';
  txt(titre,R,yt,{align:'right'});yt+=7;
  d.setFontSize(11);d.setTextColor(43,39,64);
  txt(f.numero||'BROUILLON — SANS VALEUR',R,yt,{align:'right'});yt+=5;
  d.setFont('helvetica','normal');d.setFontSize(9);d.setTextColor(90,86,110);
  if(f.date_emission){txt('Émise le '+dfr(f.date_emission),R,yt,{align:'right'});yt+=4.2;}
  if(f.date_echeance){txt('Échéance le '+dfr(f.date_echeance),R,yt,{align:'right'});yt+=4.2;}
  y=Math.max(y,yt)+6;

  /* Le destinataire */
  d.setFont('helvetica','bold');d.setFontSize(10);d.setTextColor(43,39,64);
  txt('Facturé à',L,y);y+=5;
  d.setFont('helvetica','normal');d.setFontSize(10);
  [f.fa_nom,f.fa_adresse,f.fa_email].filter(Boolean).forEach(s=>{txt(s,L,y);y+=4.6;});
  const enf=[f.en_prenom,f.en_nom].filter(Boolean).join(' ');
  if(enf){d.setTextColor(90,86,110);txt('Pour l\'accueil de '+enf,L,y);y+=4.6;}
  if(f.fa_num_allocataire){txt('N° allocataire : '+f.fa_num_allocataire,L,y);y+=4.6;}
  y+=3;
  d.setTextColor(43,39,64);
  d.setFont('helvetica','bold');
  txt('Période : '+(moisLibelle(f.mois)||(dfr(f.periode_debut)+' au '+dfr(f.periode_fin))),L,y);y+=5;
  /* Les heures facturées, en clair sur le document : c'est la pièce que la
     famille transmet à la CAF, et le CMG se liquide dessus. */
  if(f.heures_facturees){
    txt('Heures facturées : '+String(f.heures_facturees).replace('.',',')+' h',L,y);y+=5;
  }
  y+=2;

  /* Les lignes */
  d.setFillColor(238,236,250);d.rect(L,y-4.5,R-L,7,'F');
  d.setFontSize(9);d.setTextColor(74,63,159);
  txt('Désignation',L+2,y);txt('Qté',R-62,y,{align:'right'});
  txt('P.U.',R-34,y,{align:'right'});txt('Montant',R-2,y,{align:'right'});
  y+=7;
  d.setFont('helvetica','normal');d.setTextColor(43,39,64);d.setFontSize(9.5);
  LIGNES.forEach(l=>{
    saut(12);
    const lib=d.splitTextToSize(String(l.libelle||''),R-L-70);
    txt(lib,L+2,y);
    if(l.quantite!=null)txt(String(l.quantite).replace('.',','),R-62,y,{align:'right'});
    if(l.prix_unitaire!=null)txt(eur(l.prix_unitaire),R-34,y,{align:'right'});
    d.setFont('helvetica','bold');txt(eur(l.montant),R-2,y,{align:'right'});d.setFont('helvetica','normal');
    y+=4.6*lib.length;
    if(l.detail){
      d.setFontSize(8);d.setTextColor(140,136,160);
      const det=d.splitTextToSize(String(l.detail),R-L-70);
      txt(det,L+2,y);y+=3.6*det.length;
      d.setFontSize(9.5);d.setTextColor(43,39,64);
    }
    y+=1.5;ligne();
  });

  /* Les totaux */
  saut(30);y+=2;
  d.setFont('helvetica','bold');d.setFontSize(12);
  txt('Total à payer',R-42,y,{align:'right'});txt(eur(f.total),R-2,y,{align:'right'});y+=6;
  d.setFont('helvetica','normal');d.setFontSize(9.5);d.setTextColor(90,86,110);
  if(Number(f.total_regle||0)!==0){
    txt('Déjà réglé',R-42,y,{align:'right'});txt(eur(f.total_regle),R-2,y,{align:'right'});y+=5;
    d.setFont('helvetica','bold');d.setTextColor(43,39,64);
    txt('Reste dû',R-42,y,{align:'right'});txt(eur(f.solde),R-2,y,{align:'right'});y+=6;
    d.setFont('helvetica','normal');d.setTextColor(90,86,110);
  }
  /* « Acquittée » : la CAF ne liquide le CMG que sur une facture acquittée.
     La mention n'apparaît que si le solde est réellement soldé — elle porte
     la date du dernier encaissement, pas celle du jour. */
  if(Number(f.total||0)!==0&&Number(f.solde||0)<=0&&REGL.length){
    const der=REGL.map(r=>r.date_reglement).sort().pop();
    d.setFont('helvetica','bold');d.setTextColor(46,158,107);d.setFontSize(10);
    txt('Facture acquittée le '+dfr(der),L,y);
    d.setFont('helvetica','normal');d.setTextColor(90,86,110);d.setFontSize(9.5);y+=6;
  }
  y+=2;
  if(f.commentaire){
    saut(20);d.setFontSize(9);
    const c=d.splitTextToSize(String(f.commentaire),R-L);txt(c,L,y);y+=4*c.length+3;
  }

  /* Mentions légales — exonération de TVA en tête, c'est la mention qui ne
     peut pas manquer sur une facture de micro-crèche. */
  const mentions=[RCFG.facture_mentions,RCFG.facture_deductions,
    RCFG.modes_reglement?('Modes de règlement acceptés : '+RCFG.modes_reglement+'.'):null,
    RCFG.pied_page].filter(Boolean);
  if(mentions.length){
    saut(30);
    d.setDrawColor(230,226,240);d.line(L,y,R,y);y+=5;
    d.setFontSize(7.6);d.setTextColor(120,116,140);
    mentions.forEach(m=>{
      const t=d.splitTextToSize(String(m),R-L);
      t.forEach(li=>{saut(6);txt(li,L,y);y+=3.1;});
      y+=2;
    });
  }
  if(!f.numero){
    d.setTextColor(198,40,40);d.setFontSize(30);d.setFont('helvetica','bold');
    d.text('BROUILLON',105,160,{align:'center',angle:35});
  }
  const nom=(f.numero||'brouillon')+' '+enf+'.pdf';
  d.save(nom.replace(/[\\/:*?"<>|]/g,'-'));
}

boot().catch(e=>{showLogin('Démarrage impossible — réessayez.');});
