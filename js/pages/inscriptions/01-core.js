const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let ME=null,PROF=null,IS_DIRECTION=false;
let PRE=[],CRECHES=[],PARENTS=[];
let ficheId=null,parentId=null;
let filtreStatut='',filtreRappels=false,filtreVisites=false,filtreVisitesFaites=false,filtreRelancesAVenir=false,crecheStrict=null;

/* Statuts : libellé, couleur de fond, couleur de texte. L'ordre est celui du
   cycle de vie, pas alphabétique — la liste déroulante doit se lire comme une
   progression. */
const STATUTS={
  nouvelle:    {l:'Nouvelle',       bg:'#EEECFA', fg:'#4A3F9F'},
  en_contact:  {l:'En contact',     bg:'#FFF6DC', fg:'#B8860B'},
  devis_envoye:{l:'Devis envoyé',   bg:'#FFF1E3', fg:'#F47920'},
  accepte:     {l:'Devis accepté',  bg:'#E6F5EE', fg:'#2E9E6B'},
  inscrit:     {l:'Inscrit',        bg:'#E6F5EE', fg:'#1B6B47'},
  refuse:      {l:'Refusé',         bg:'#FDE8E8', fg:'#C62828'},
  sans_suite:  {l:'Sans suite',     bg:'#F1EFF7', fg:'#8E8AA8'}
};
const ORDRE_STATUTS=['nouvelle','en_contact','devis_envoye','accepte','inscrit','refuse','sans_suite'];
/* Dossiers « en cours » : ni inscrits (le devis signé est devenu une
   inscription), ni clos. */
const STATUTS_EN_COURS=['nouvelle','en_contact','devis_envoye','accepte'];
const STATUTS_CLOS=['inscrit','refuse','sans_suite'];
/* Motifs de refus — liste fermée (contrainte preinscriptions_motif_refus_ck)
   pour que le reporting regroupe les réponses. */
const MOTIFS_REFUS={
  trop_cher:'Trop cher',
  creche_municipale:'Crèche municipale',
  concurrent_micro_creche:'Concurrent micro-crèche',
  ne_repond_plus:'Ne répond plus',
  autre:'Autre'
};
const LIENS={mere:'Mère',pere:'Père',tuteur:'Tuteur / tutrice',autre:'Responsable légal'};
const JOURS=[[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi']];

function toast(m,err){const t=document.getElementById('toast');t.textContent=m;t.className='toast on'+(err?' err':'');setTimeout(()=>t.className='toast',2800);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
/* La ligne d'accueil garde en base le libellé de la tranche tarifaire
   ("Plus de 40 heures par semaine", "Entre 24 et 40 heures par semaine"…) :
   c'est ce qui dit à la direction quelle tranche s'est appliquée. Mais ce
   jargon interne n'a rien à faire sous les yeux d'une famille — on affiche
   donc « Frais de garde » à sa place, sur tous les documents qui la voient. */
function libelleLigne(l){return l.type==='accueil'?'Frais de garde':l.libelle;}
function closeOv(id){document.getElementById(id).classList.remove('on');}
function openOv(id){document.getElementById(id).classList.add('on');}
function val(id){const e=document.getElementById(id);return e?e.value.trim():'';}
function chk(id){const e=document.getElementById(id);return !!(e&&e.checked);}
function setVal(id,v){const e=document.getElementById(id);if(e)e.value=(v==null?'':v);}
function setChk(id,v){const e=document.getElementById(id);if(e)e.checked=!!v;}

/* ---------- IMPORT D'UNE LISTE DE PRÉINSCRIPTIONS (PDF) ----------
   Le PDF exporté ("Liste inscriptions/préinscriptions") est un tableau de 10
   colonnes fixes, une ligne par demande, numérotée en premier colonne. Les
   bordures du tableau ne sont pas lisibles depuis le texte seul : on repère
   donc chaque colonne par sa position horizontale (en points PDF), mesurée
   une fois sur un export de référence. Le format est celui d'un rapport
   système régulier — ces repères ne bougent pas d'un export à l'autre.
   Chaque ligne du tableau peut s'étaler sur plusieurs lignes physiques
   (retour à la ligne dans une cellule) : on les regroupe tant qu'on n'a pas
   revu, dans la colonne « Ordre », un nombre seul qui ouvre la ligne suivante.
   Rien n'est jamais écrit tant que la direction n'a pas validé l'aperçu. */
if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const PDFIMPORT_COLS=[
  {key:'ordre',        x0:40,  x1:68 },
  {key:'parents',      x0:68,  x1:145},
  {key:'email',        x0:145, x1:223},
  {key:'tel',          x0:223, x1:280},
  {key:'adresse',      x0:280, x1:382},
  {key:'enfant',       x0:382, x1:478},
  {key:'dob',          x0:478, x1:543},
  {key:'jours',        x0:543, x1:614},
  {key:'debut',        x0:614, x1:684},
  {key:'commentaires', x0:684, x1:2000}
];
const PDFIMPORT_ENTETES=['Ordre','arrivée','Nom des parents','Email','Téléphone','Adresse',
  "Nom/prénom de l'enfant",'date naissance','Jours de présence','Date de début souhaité','Commentaires'];
const PDFIMPORT_JOURS={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6,dimanche:7};

let PDFIMPORT_LIGNES=[];

/* ---------- LIEN DE PRÉINSCRIPTION ----------
   Le formulaire public (preinscription.html) se trouve à côté de cette page.
   Sans paramètre, la famille choisit sa crèche ; avec ?c=<id>, elle est
   présélectionnée. L'identifiant d'une crèche n'est pas un secret : il ne
   donne accès à rien d'autre qu'à ce formulaire. */
function urlLienPrein(){
  const u=new URL('preinscription.html',location.href);
  const c=document.getElementById('lpCreche').value;
  if(c)u.searchParams.set('c',c);
  return u.toString();
}
function openLienPrein(){
  document.getElementById('lpCreche').innerHTML='<option value="">Toutes les crèches (la famille choisit)</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  document.getElementById('lpPartager').style.display=PartageLien.disponible()?'':'none';
  majLienPrein();openOv('ovLienPrein');
}
function majLienPrein(){
  const u=urlLienPrein();
  document.getElementById('lpUrl').value=u;
  document.getElementById('lpOuvrir').href=u;
  document.getElementById('lpMail').href='mailto:?subject='+encodeURIComponent('Préinscription en crèche')
    +'&body='+encodeURIComponent('Bonjour,\n\nVoici le lien pour préinscrire votre enfant (environ 5 minutes) :\n'+u+'\n\nÀ très vite.');
}
async function copierLienPrein(){
  const u=document.getElementById('lpUrl').value;
  try{await navigator.clipboard.writeText(u);toast('Lien copié ✅');}
  catch(e){document.getElementById('lpUrl').select();toast('Sélectionné : copiez-le avec Ctrl+C.');}
}
async function partagerLienPrein(){
  await PartageLien.partager(document.getElementById('lpUrl').value,
    {titre:'Préinscription en crèche',texte:'Voici le lien pour préinscrire votre enfant :'});
}

function openImportPdf(){
  PDFIMPORT_LIGNES=[];
  document.getElementById('fPdfImportCreche').innerHTML='<option value="">— choisir une crèche —</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  setVal('fPdfImportDateMin','');
  setChk('fPdfImportMasquer',false);
  setVal('fPdfImportMode','prein');pdfImportChangerMode(true);
  document.getElementById('pdfImportNomFichier').textContent='';
  document.getElementById('pdfImportStatut').textContent='';
  document.getElementById('pdfImportBar').style.display='none';
  document.getElementById('pdfImportListe').innerHTML='';
  document.getElementById('btnPdfImportGo').style.display='none';
  document.getElementById('fPdfImport').value='';
  openOv('ovImportPdf');
}

function pdfImportColonneDe(x){
  for(const c of PDFIMPORT_COLS)if(x>=c.x0-3&&x<c.x1)return c.key;
  return 'commentaires';
}

async function choisirPdfImport(ev){
  const f=ev.target.files&&ev.target.files[0];
  if(!f)return;
  if(!val('fPdfImportCreche')){
    toast('Choisissez d\'abord la crèche visée par ce PDF.',true);
    ev.target.value='';
    return;
  }
  document.getElementById('pdfImportNomFichier').textContent=f.name;
  const statut=document.getElementById('pdfImportStatut');
  statut.textContent='Analyse du PDF en cours…';
  document.getElementById('pdfImportListe').innerHTML='';
  document.getElementById('pdfImportBar').style.display='none';
  document.getElementById('btnPdfImportGo').style.display='none';
  try{
    const lignes=await pdfImportExtraire(f);
    try{const r=await sb.from('enfants').select('prenom,nom,dob');PDFIMPORT_ENFANTS=r.data||[];}catch(e){PDFIMPORT_ENFANTS=[];}
    PDFIMPORT_LIGNES=lignes.map(pdfImportInterpreter);
    pdfImportMarquerDoublons();
    if(!PDFIMPORT_LIGNES.length){
      statut.textContent="Aucune ligne n'a pu être reconnue dans ce PDF. Vérifiez qu'il s'agit bien d'un export « Liste inscriptions/préinscriptions ».";
      return;
    }
    statut.textContent=PDFIMPORT_LIGNES.length+' ligne(s) détectée(s). Relisez avant d’importer.'+(PDFIMPORT_LIGNES.some(r=>r.doublon)?' Les doublons sont décochés.':'');
    document.getElementById('pdfImportBar').style.display='';
    document.getElementById('btnPdfImportGo').style.display='';
    renderPdfImportListe();
  }catch(e){
    console.error('[choisirPdfImport]',e);
    statut.textContent='Lecture du PDF impossible : '+(e.message||'erreur inconnue');
  }
}

/* Extraction brute : une entrée par ligne du tableau, colonnes assemblées à
   partir des positions x. Le générateur de ce PDF dessine chaque page en deux
   passes : d'abord toutes les cellules qui tiennent sur une seule ligne
   (numéro, dates…), ligne par ligne ; puis, à la suite, les cellules qui
   débordent sur plusieurs lignes (parents, adresse, commentaires longs…) —
   toujours dans l'ordre des lignes du tableau, mais bien après la première
   passe. Résultat : la position verticale seule ne suffit pas à savoir à
   quelle demande appartient un commentaire un peu long, car son texte peut
   chevaucher plusieurs lignes suivantes du tableau à l'écran.
   On repère donc les cellules débordantes par leur ordre d'apparition dans le
   flux du PDF, qui reste toujours celui des lignes du tableau : on les
   rattache l'une après l'autre à la ligne courante, et on passe à la ligne
   suivante dès qu'une colonne déjà remplie pour cette ligne (par la première
   passe ou par un bloc débordant précédent) réapparaît — signe qu'on est
   passé à la demande suivante — ou dès qu'on retombe sur une colonne plus à
   gauche que la précédente. */
const PDFIMPORT_COL_ORDRE=PDFIMPORT_COLS.map(c=>c.key);

/* Second format d'export Gertrude (« Liste inscriptions active / future ») :
   pas de colonne « Ordre », l'enfant en première colonne, et une colonne
   « Contrat » qui porte une période (« 01/09/2026 - 31/08/2027 ») au lieu
   d'une date de début souhaitée. Les bornes sont des x de début de texte,
   mesurées sur des exports réels (les cellules sont centrées : le texte ne
   commence pas au bord de sa colonne). */
const PDFIMPORT2_COLS=[
  {key:'enfant',x0:0},{key:'parents',x0:155},{key:'email',x0:230},{key:'tel',x0:311},
  {key:'adresse',x0:368},{key:'dob',x0:470},{key:'jours',x0:535},{key:'debut',x0:605},
  {key:'commentaires',x0:665}
];
function pdfImportColonne2(x){
  let k='enfant';
  for(const c of PDFIMPORT2_COLS)if(x>=c.x0)k=c.key;
  return k;
}
/* Pas de numéro de ligne dans ce format : l'enfant, toujours sur sa propre
   ligne et centré verticalement dans la cellule, sert d'ancre. Chaque autre
   morceau de texte se rattache à l'ancre la plus proche en hauteur — ce qui
   tient même quand un commentaire ou une adresse occupe plusieurs lignes. */
async function pdfImportExtraireListe(pdf){
  const sortie=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    let items=tc.items.filter(it=>it.str&&it.str.trim()!=='')
      .map(it=>({x:it.transform[4],y:it.transform[5],s:it.str.trim()}));
    const ent=items.find(it=>it.x<200&&/^Nom\/pr[ée]nom/i.test(it.s));
    if(ent)items=items.filter(it=>Math.abs(it.y-ent.y)>4);   // ligne d'en-têtes
    const enf=items.filter(it=>pdfImportColonne2(it.x)==='enfant').sort((a,b)=>b.y-a.y);
    // Un nom d'enfant qui passe sur deux lignes ne doit faire qu'une ancre.
    const ancres=[];
    enf.forEach(it=>{
      const a=ancres[ancres.length-1];
      if(a&&a.y-it.y<12){a.items.push(it);a.y=a.items.reduce((s,i)=>s+i.y,0)/a.items.length;}
      else ancres.push({y:it.y,items:[it],cols:{}});
    });
    if(!ancres.length)continue;
    items.forEach(it=>{
      let best=ancres[0];
      ancres.forEach(a=>{if(Math.abs(a.y-it.y)<Math.abs(best.y-it.y))best=a;});
      const c=pdfImportColonne2(it.x);
      (best.cols[c]=best.cols[c]||[]).push(it);
    });
    ancres.forEach(a=>{
      const j=k=>(a.cols[k]||[]).sort((u,v)=>(v.y-u.y)||(u.x-v.x)).map(i=>i.s).join(' ')
        .replace(/\s+/g,' ').trim();
      const dates=(j('debut').match(/\d{2}\/\d{2}\/\d{4}/g)||[]);
      sortie.push({ordre:String(sortie.length+1),parents:j('parents'),email:j('email'),tel:j('tel'),
        adresse:j('adresse'),enfant:j('enfant'),
        dob:(j('dob').match(/\d{2}\/\d{2}\/\d{4}/)||[''])[0],
        jours:j('jours'),debut:dates[0]||'',fin:dates[1]||'',commentaires:j('commentaires')});
    });
  }
  return sortie;
}

async function pdfImportExtraire(file){
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const p1=await (await pdf.getPage(1)).getTextContent();
  if(p1.items.some(it=>it.str&&it.transform[4]<200&&/^Nom\/pr[ée]nom/i.test(it.str.trim())))
    return pdfImportExtraireListe(pdf);
  const entetes=PDFIMPORT_ENTETES.map(s=>s.trim());
  const parNumero=new Map();
  const ordreVu=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const items=tc.items
      .map(it=>({x:it.transform[4],s:it.str}))
      .filter(it=>it.s&&it.s.trim()!==''&&entetes.indexOf(it.s.trim())<0);

    // Passe 1 : les cellules à une ligne, dans l'ordre du flux. Chaque
    // numéro d'ordre rencontré ouvre sa propre ligne de tableau ; on bascule
    // en « débordement » dès qu'une colonne revient en arrière par rapport à
    // la précédente — signe qu'on a quitté la première passe.
    const lignesPage=[];
    let rowPtr=-1,dernierIdx=-1,debordement=false;
    const enAttente=[];
    for(const it of items){
      const c=pdfImportColonneDe(it.x);
      if(c==='ordre'){
        if(/^\d+$/.test(it.s.trim())){
          const num=it.s.trim();
          let ligne=parNumero.get(num);
          if(!ligne){ligne={ordre:num,cols:{}};parNumero.set(num,ligne);ordreVu.push(num);}
          if(lignesPage.indexOf(ligne)<0)lignesPage.push(ligne);
          rowPtr=lignesPage.indexOf(ligne);
          dernierIdx=0;debordement=false;
        }
        continue;
      }
      const idx=PDFIMPORT_COL_ORDRE.indexOf(c);
      if(debordement||idx<dernierIdx){debordement=true;enAttente.push({s:it.s,c,idx});continue;}
      if(rowPtr>=0)(lignesPage[rowPtr].cols[c]=lignesPage[rowPtr].cols[c]||[]).push(it.s);
      dernierIdx=idx;
    }
    if(!lignesPage.length)continue;

    // Passe 2 : les cellules débordantes reprennent leur place derrière leur
    // propre ligne, dans le même ordre.
    let rowPtr2=0,dernierIdx2=-1;
    for(const it of enAttente){
      if(it.idx!==dernierIdx2){
        while(rowPtr2<lignesPage.length-1
          &&(it.idx<=dernierIdx2||(lignesPage[rowPtr2].cols[it.c]&&lignesPage[rowPtr2].cols[it.c].length))){
          rowPtr2++;dernierIdx2=-1;
        }
      }
      (lignesPage[rowPtr2].cols[it.c]=lignesPage[rowPtr2].cols[it.c]||[]).push(it.s);
      dernierIdx2=it.idx;
    }
  }
  return ordreVu.map(num=>{
    const l=parNumero.get(num);
    const j=k=>((l.cols[k]||[]).join(' ').replace(/\s+/g,' ').trim());
    return {ordre:l.ordre,parents:j('parents'),email:j('email'),tel:j('tel'),adresse:j('adresse'),
      enfant:j('enfant'),dob:j('dob'),jours:j('jours'),debut:j('debut'),commentaires:j('commentaires')};
  });
}

/* Nom d'enfant → { nom, prenom, aNaitre } : les familles surnommées "à
   naître" n'ont simplement pas encore de prénom. Sinon, on prend les
   éventuels mots en MAJUSCULES de tête comme nom de famille — c'est la
   convention la plus fréquente dans cet export — sinon le premier mot. */
function pdfImportSplitEnfant(txt){
  const clean=(txt||'').replace(/\s+/g,' ').trim();
  if(/à\s*na[iî]tre|a\s*naitre/i.test(clean)){
    return {nom:clean.replace(/à?\s*na[iî]tre/i,'').trim(),prenom:'',aNaitre:true};
  }
  const toks=clean.split(' ').filter(Boolean);
  if(!toks.length)return {nom:'',prenom:'',aNaitre:false};
  const estMaj=t=>t===t.toUpperCase()&&/[A-ZÀ-Ý]/.test(t);
  let i=0;
  while(i<toks.length-1&&estMaj(toks[i]))i++;
  if(i===0){
    i=1;
    // « Cormaille de Valbray Melchior » : une particule après le premier mot
    // fait partie du nom, le prénom est alors le dernier mot.
    if(toks.length>2&&/^(de|du|des|d'|la|le|van|von|di|da)$/i.test(toks[1]))i=toks.length-1;
  }
  return {nom:toks.slice(0,i).join(' '),prenom:toks.slice(i).join(' '),aNaitre:false};
}

/* Nom de parent → { prenom, nom } : ici la convention est presque inverse —
   le nom de famille en MAJUSCULES se trouve le plus souvent en fin, parfois
   en tête. Best-effort ; la direction corrige à l'écran si besoin. */
function pdfImportSplitParent(txt){
  const toks=(txt||'').trim().split(/\s+/).filter(Boolean);
  if(!toks.length)return {prenom:'',nom:''};
  const estMaj=t=>t===t.toUpperCase()&&/[A-ZÀ-Ý]/.test(t);
  let j=toks.length;
  while(j>1&&estMaj(toks[j-1]))j--;
  if(j<toks.length)return {prenom:toks.slice(0,j).join(' '),nom:toks.slice(j).join(' ')};
  let i=0;
  while(i<toks.length-1&&estMaj(toks[i]))i++;
  if(i>0)return {nom:toks.slice(0,i).join(' '),prenom:toks.slice(i).join(' ')};
  return {prenom:toks.join(' '),nom:''};
}

function pdfImportDateISO(txt){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec((txt||'').trim());
  return m?(m[3]+'-'+m[2]+'-'+m[1]):'';
}

/* Ligne brute → objet préinscription pré-rempli, éditable dans l'aperçu. */
function pdfImportInterpreter(l){
  const enf=pdfImportSplitEnfant(l.enfant);
  const adrM=/^(.*?)\s*-\s*(\d{5})\s+(.+)$/.exec((l.adresse||'').trim());
  const jours=(l.jours||'').split(',').map(s=>PDFIMPORT_JOURS[s.trim().toLowerCase()])
    .filter(n=>n>=1&&n<=5);
  const nomsParents=(l.parents||'').split(/\bet\b/i).map(s=>s.trim()).filter(Boolean);
  const emails=(l.email||'').split(',').map(s=>s.trim()).filter(Boolean);
  const tels=(l.tel||'').split(',').map(s=>s.trim()).filter(Boolean);
  const parents=nomsParents.length?nomsParents.map((n,i)=>{
    const sp=pdfImportSplitParent(n);
    return {prenom:sp.prenom,nom:sp.nom,email:emails[i]||'',telephone:tels[i]||''};
  }):(l.email||l.tel?[{prenom:'',nom:'',email:emails[0]||'',telephone:tels[0]||''}]:[]);
  /* « Paul et Albane EMPTAZ » : le nom de famille n'est écrit qu'une fois, à la
     fin. Le parent sans nom (un seul mot) le partage avec l'autre. */
  if(parents.length===2){
    const [u,v]=parents;
    if(!u.nom&&v.nom&&u.prenom&&u.prenom.indexOf(' ')<0)u.nom=v.nom;
  }
  const suspect=/ne pas traiter|lskaizen\.fr|test-integration|test technique|verification automatis/i
    .test((l.commentaires||'')+' '+(l.email||'')+' '+l.enfant);
  return {
    ordre:l.ordre,
    inclus:!suspect,
    suspect:suspect,
    horsFiltre:false,
    prenom:enf.prenom,nom:enf.nom,aNaitre:enf.aNaitre,
    dob:pdfImportDateISO(l.dob),
    adresse:adrM?adrM[1].trim():(l.adresse||''),
    code_postal:adrM?adrM[2]:'',
    ville:adrM?adrM[3].trim():'',
    jours:jours,
    date_entree_souhaitee:pdfImportDateISO(l.debut),
    date_fin:pdfImportDateISO(l.fin||''),
    incomplet:enf.prenom.replace(/[^A-Za-zÀ-ÿ]/g,'').length<2&&!enf.aNaitre,
    commentaires:l.commentaires||'',
    parents:parents
  };
}

/* Détection de doublons : une ligne est un doublon si un enfant de même nom,
   prénom (ordre et accents ignorés) et même date de naissance existe déjà dans
   les demandes, ou plus haut dans le même PDF. Elle est signalée et décochée,
   jamais retirée : on peut la recocher si c'est volontaire (vrai homonyme). */
function pdfImportCle(prenom,nom,dob){
  const mots=(String(prenom||'')+' '+String(nom||'')).normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');
  return mots?mots+'|'+(dob||''):'';
}
let PDFIMPORT_ENFANTS=[];
function pdfImportMarquerDoublons(){
  const vus={};
  PRE.concat(PDFIMPORT_ENFANTS).forEach(p=>{const k=pdfImportCle(p.prenom,p.nom,p.dob);if(k)vus[k]='base';});
  PDFIMPORT_LIGNES.forEach(r=>{
    const k=pdfImportCle(r.prenom,r.nom,r.dob);
    r.doublon=k&&vus[k]?vus[k]:'';
    if(k&&!vus[k])vus[k]='pdf';
    if(r.doublon)r.inclus=false;
  });
}
function pdfImportLibelleDoublon(r){
  return r.doublon==='base'?'déjà présent dans les demandes ou les fiches enfants':r.doublon==='pdf'?'déjà présent plus haut dans ce PDF':'';
}

/* Le filtre de date ne retire jamais une ligne de la liste : il la décoche et,
   si la case « masquer » est cochée, l'efface simplement de l'affichage. Une
   ligne sans date d'entrée renseignée reste visible et cochable — impossible
   de savoir si elle est concernée sans cette information. */
function pdfImportAppliquerFiltreDate(){
  const min=val('fPdfImportDateMin');
  PDFIMPORT_LIGNES.forEach(r=>{
    r.horsFiltre=!!(min&&r.date_entree_souhaitee&&r.date_entree_souhaitee<min);
    if(r.horsFiltre)r.inclus=false;
  });
  renderPdfImportListe();
}

function renderPdfImportListe(){
  const box=document.getElementById('pdfImportListe');
  const masquer=chk('fPdfImportMasquer');
  box.innerHTML=PDFIMPORT_LIGNES.map((r,i)=>{
    if(masquer&&r.horsFiltre)return '';
    const jrsHtml=JOURS.map(j=>'<label style="display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;margin-right:6px">'
      +'<input type="checkbox" data-i="'+i+'" data-f="jour" value="'+j[0]+'"'+(r.jours.indexOf(j[0])>=0?' checked':'')+' onchange="pdfImportMajJour(this)">'+j[1].slice(0,3)+'</label>').join('');
    const par=r.parents[0]||{prenom:'',nom:'',email:'',telephone:''};
    return '<div class="pdfrow'+(r.inclus?'':' off')+'" id="pdfrow'+i+'">'
      +'<div class="hd"><input type="checkbox" '+(r.inclus?'checked':'')+' onchange="pdfImportToggle('+i+',this.checked)">'
      +'<b>Ligne n°'+esc(r.ordre)+'</b>'+(r.suspect?'<span class="flag">ressemble à une ligne de test</span>':'')
      +(r.incomplet?'<span class="flag">prénom à compléter</span>':'')
      +(r.doublon?'<span class="flag" id="pdfdup'+i+'">doublon : '+pdfImportLibelleDoublon(r)+'</span>':'')
      +(r.horsFiltre?'<span class="flag" style="color:var(--muted);background:#F1EFF7">avant le filtre de date</span>':'')+'</div>'
      +'<div class="g">'
      +'<div><label>Prénom enfant</label><input value="'+esc(r.prenom)+'" oninput="pdfImportMaj('+i+',\'prenom\',this.value)"></div>'
      +'<div><label>Nom enfant</label><input value="'+esc(r.nom)+'" oninput="pdfImportMaj('+i+',\'nom\',this.value)"></div>'
      +'<div><label>'+(r.aNaitre?'Terme prévu':'Naissance')+'</label><input type="date" value="'+esc(r.dob)+'" oninput="pdfImportMaj('+i+',\'dob\',this.value)"></div>'
      +'<div><label>Adresse</label><input value="'+esc(r.adresse)+'" oninput="pdfImportMaj('+i+',\'adresse\',this.value)"></div>'
      +'<div><label>CP</label><input value="'+esc(r.code_postal)+'" oninput="pdfImportMaj('+i+',\'code_postal\',this.value)"></div>'
      +'<div><label>Ville</label><input value="'+esc(r.ville)+'" oninput="pdfImportMaj('+i+',\'ville\',this.value)"></div>'
      +'<div><label>'+(pdfImportModeActif()?'Début du contrat':'Date d’entrée souhaitée')+'</label><input type="date" value="'+esc(r.date_entree_souhaitee)+'" oninput="pdfImportMaj('+i+',\'date_entree_souhaitee\',this.value)"></div>'
      +(pdfImportModeActif()?'<div><label>Fin du contrat</label><input type="date" value="'+esc(r.date_fin)+'" oninput="pdfImportMaj('+i+',\'date_fin\',this.value)"></div>':'')
      +'<div><label>Parent — prénom</label><input value="'+esc(par.prenom)+'" oninput="pdfImportMajParent('+i+',\'prenom\',this.value)"></div>'
      +'<div><label>Parent — nom</label><input value="'+esc(par.nom)+'" oninput="pdfImportMajParent('+i+',\'nom\',this.value)"></div>'
      +'<div><label>E-mail</label><input value="'+esc(par.email)+'" oninput="pdfImportMajParent('+i+',\'email\',this.value)"></div>'
      +'<div><label>Téléphone</label><input value="'+esc(par.telephone)+'" oninput="pdfImportMajParent('+i+',\'telephone\',this.value)"></div>'
      +'</div>'
      +'<label style="display:block;margin-top:7px">Jours souhaités</label>'+jrsHtml
      +'<div style="margin-top:7px"><label>Commentaires</label><textarea oninput="pdfImportMaj('+i+',\'commentaires\',this.value)">'+esc(r.commentaires)+'</textarea></div>'
      +'</div>';
  }).join('');
  pdfImportMajCompte();
}

function pdfImportModeActif(){return val('fPdfImportMode')==='active';}
function pdfImportChangerMode(init){
  document.getElementById('pdfImportAideMode').textContent=pdfImportModeActif()
    ?'Crée directement une fiche enfant, ses parents et son contrat d\'accueil (jours + période) pour chaque ligne cochée. L\'adresse et le commentaire du PDF ne sont pas repris : la fiche enfant n\'a pas de champ pour eux. Horaires et montants sont à compléter ensuite.'
    :'Crée une demande (statut « nouvelle ») par ligne cochée ; elle suivra ensuite le circuit devis → contrat → bascule.';
  if(init===true)return;
  if(PDFIMPORT_LIGNES.length){pdfImportAppliquerFiltreDate();}
}
function pdfImportMaj(i,champ,v){
  PDFIMPORT_LIGNES[i][champ]=v;
  if(champ==='prenom'||champ==='nom'||champ==='dob'){
    // Re-vérifie sans toucher aux cases cochées à la main ni re-dessiner la
    // liste (la saisie en cours perdrait le focus) : seul le badge est mis à jour.
    const cochees=PDFIMPORT_LIGNES.map(r=>r.inclus);
    pdfImportMarquerDoublons();
    PDFIMPORT_LIGNES.forEach((r,k)=>{
      r.inclus=cochees[k];
      const hd=document.querySelector('#pdfrow'+k+' .hd');
      if(!hd)return;
      let b=document.getElementById('pdfdup'+k);
      if(r.doublon){
        if(!b){b=document.createElement('span');b.className='flag';b.id='pdfdup'+k;hd.appendChild(b);}
        b.textContent='doublon : '+pdfImportLibelleDoublon(r);
      }else if(b)b.remove();
    });
  }
}
function pdfImportMajParent(i,champ,v){
  const r=PDFIMPORT_LIGNES[i];
  if(!r.parents.length)r.parents.push({prenom:'',nom:'',email:'',telephone:''});
  r.parents[0][champ]=v;
}
function pdfImportMajJour(el){
  const i=Number(el.getAttribute('data-i')),v=Number(el.value);
  const r=PDFIMPORT_LIGNES[i];
  r.jours=el.checked?r.jours.concat(v).filter((x,idx,a)=>a.indexOf(x)===idx):r.jours.filter(x=>x!==v);
}
function pdfImportToggle(i,v){
  PDFIMPORT_LIGNES[i].inclus=v;
  document.getElementById('pdfrow'+i).classList.toggle('off',!v);
  pdfImportMajCompte();
}
function pdfImportToutCocher(v){
  PDFIMPORT_LIGNES.forEach((r,i)=>{r.inclus=v;});
  renderPdfImportListe();
}
function pdfImportMajCompte(){
  const n=PDFIMPORT_LIGNES.filter(r=>r.inclus).length;
  const hors=PDFIMPORT_LIGNES.filter(r=>r.horsFiltre).length;
  document.getElementById('pdfImportCompte').textContent=n+' / '+PDFIMPORT_LIGNES.length+' ligne(s) sélectionnée(s)'
    +(hors?' — '+hors+' avant le filtre de date':'');
}

async function importerPdfSelection(){
  const crecheId=val('fPdfImportCreche');
  if(!crecheId){toast('Choisissez la crèche visée par ce PDF avant d\'importer.',true);return;}
  const aFaire=PDFIMPORT_LIGNES.filter(r=>r.inclus&&!r.horsFiltre);
  if(!aFaire.length){toast('Aucune ligne sélectionnée.',true);return;}
  const btn=document.getElementById('btnPdfImportGo');
  btn.disabled=true;
  let ok=0,ko=0;
  const actif=pdfImportModeActif();
  for(const r of aFaire){
    if(actif){
      /* Enfant déjà accueilli : fiche + parents + ligne de contrat d'accueil,
         comme la bascule les crée, mais sans demande ni contrat à signer —
         le contrat existe déjà, dans Gertrude. */
      let enfantId=null;
      try{
        const ins=await sb.from('enfants').insert({
          prenom:r.prenom||'',nom:r.nom||'',dob:r.dob||null,
          naissance_provisoire:!!r.aNaitre,
          creche_id:crecheId,date_entree:r.date_entree_souhaitee||null,
          allergies:'',regime_repas:null
        }).select().single();
        if(ins.error)throw ins.error;
        enfantId=ins.data.id;
        const parents=r.parents.filter(p=>p.prenom||p.nom||p.email||p.telephone).map(p=>({
          enfant_id:enfantId,lien:'autre',prenom:p.prenom,nom:p.nom,
          telephone:p.telephone,email:p.email,destinataire:!!p.email}));
        if(parents.length){const e=await sb.from('enfants_parents').insert(parents);if(e.error)throw e.error;}
        if(r.date_entree_souhaitee){
          const e=await sb.from('enfants_contrats').insert({
            enfant_id:enfantId,date_debut:r.date_entree_souhaitee,date_fin:r.date_fin||null,
            jours:r.jours,heure_debut:null,heure_fin:null,
            notes:'Repris de l\'export Gertrude (horaires et montants à compléter).'
              +(r.commentaires?' Commentaire : '+r.commentaires:'')});
          if(e.error)throw e.error;
        }
        ok++;
      }catch(e){
        console.error('[importerPdfSelection/actif]',e);ko++;
        // Pas de fiche à moitié créée : on défait ce qui a été écrit.
        if(enfantId){try{await sb.from('enfants').delete().eq('id',enfantId);}catch(_){}}
      }
      continue;
    }
    try{
      const row={
        statut:'nouvelle',
        prenom:r.prenom,nom:r.nom,
        ne_ou_a_naitre:r.aNaitre?'a_naitre':'ne',
        dob:r.dob||null,
        adresse:r.adresse,code_postal:r.code_postal,ville:r.ville,
        creches_souhaitees:[crecheId],
        // creche_id ("crèche retenue") doit être posé dès l'import : la RLS
        // n'affiche que les préinscriptions dont la crèche appartient au
        // réseau, et creches_souhaitees seul ne suffit pas à les rendre
        // visibles. Sans ce champ, tout un import disparaît silencieusement.
        creche_id:crecheId,
        date_entree_souhaitee:r.date_entree_souhaitee||null,
        jours:r.jours,
        notes_internes:r.commentaires,
        created_by:ME?ME.id:null
      };
      const{data,error}=await sb.from('preinscriptions').insert(row).select().single();
      if(error)throw error;
      PRE.unshift(data);
      for(const p of r.parents){
        if(!p.prenom&&!p.nom&&!p.email&&!p.telephone)continue;
        await sb.from('preinscriptions_parents').insert({
          preinscription_id:data.id,lien:'autre',
          prenom:p.prenom,nom:p.nom,email:p.email,telephone:p.telephone,destinataire:!!p.email
        });
      }
      ok++;
    }catch(e){
      console.error('[importerPdfSelection]',e);ko++;
    }
  }
  btn.disabled=false;
  render();
  toast(ok+(actif?' fiche(s) enfant créée(s)':' demande(s) importée(s)')+(ko?', '+ko+' échec(s)':'')+' ✅',!!ko&&!ok);
  if(!ko)closeOv('ovImportPdf');
}

/* ---------- SUPPRESSION GROUPÉE (annuler un import) ----------
   Un import ne laisse aucune trace de lot à lui seul : on retrouve donc les
   demandes créées via les mêmes repères que l'import lui-même, à la relecture
   — crèche souhaitée et date de création — plutôt qu'un identifiant de lot
   qui n'existe pas. Rien n'est jamais supprimé sans être d'abord listé et
   coché un par un, comme pour l'import. */
let SG_RESULTATS=[];

function openSupprGroupe(){
  document.getElementById('sgCreche').innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  setVal('sgDepuis',auj());setVal('sgJusqua','');
  document.getElementById('sgStatut').textContent='';
  document.getElementById('sgBar').style.display='none';
  document.getElementById('sgListe').innerHTML='';
  document.getElementById('btnSgGo').style.display='none';
  SG_RESULTATS=[];
  openOv('ovSupprGroupe');
}

function rechercherSupprGroupe(){
  const cre=val('sgCreche'),depuis=val('sgDepuis'),jusqua=val('sgJusqua');
  SG_RESULTATS=PRE.filter(p=>{
    if(p.enfant_id)return false; // basculée en fiche enfant : jamais proposée ici
    if(cre&&toArr(p.creches_souhaitees).map(String).indexOf(cre)<0)return false;
    const d=String(p.created_at||'').slice(0,10);
    if(depuis&&d<depuis)return false;
    if(jusqua&&d>jusqua)return false;
    return true;
  }).map(p=>({p,inclus:true}));
  const statut=document.getElementById('sgStatut');
  if(!SG_RESULTATS.length){
    statut.textContent='Aucune demande ne correspond à ces critères.';
    document.getElementById('sgBar').style.display='none';
    document.getElementById('sgListe').innerHTML='';
    document.getElementById('btnSgGo').style.display='none';
    return;
  }
  statut.textContent=SG_RESULTATS.length+' demande(s) trouvée(s).';
  document.getElementById('sgBar').style.display='';
  document.getElementById('btnSgGo').style.display='';
  renderSgListe();
}

function renderSgListe(){
  const box=document.getElementById('sgListe');
  box.innerHTML=SG_RESULTATS.map((r,i)=>{
    const p=r.p;
    const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom';
    const naiss=p.dob?(p.ne_ou_a_naitre==='a_naitre'?'terme le '+dfr(p.dob):'né(e) le '+dfr(p.dob)):'naissance non renseignée';
    const cr=toArr(p.creches_souhaitees).map(nomCreche).filter(Boolean).join(' · ')||'crèche non précisée';
    return '<div class="hl"><div class="t">'
      +'<input type="checkbox" '+(r.inclus?'checked':'')+' onchange="sgToggle('+i+',this.checked)">'
      +'<span class="n">'+esc(nom)+'</span><span class="c">'+esc(naiss)+' · '+esc(cr)
      +' · créée le '+dfr(String(p.created_at||'').slice(0,10))+'</span></div></div>';
  }).join('');
  sgMajCompte();
}
function sgToggle(i,v){SG_RESULTATS[i].inclus=v;sgMajCompte();}
function sgToutCocher(v){SG_RESULTATS.forEach(r=>r.inclus=v);renderSgListe();}
function sgMajCompte(){
  const n=SG_RESULTATS.filter(r=>r.inclus).length;
  document.getElementById('sgCompte').textContent=n+' / '+SG_RESULTATS.length+' sélectionnée(s)';
}

async function supprimerSelectionGroupee(){
  const aSupprimer=SG_RESULTATS.filter(r=>r.inclus);
  if(!aSupprimer.length){toast('Aucune demande sélectionnée.',true);return;}
  if(!confirm('Supprimer définitivement '+aSupprimer.length+' demande(s) ? Les parents saisis seront supprimés avec elles. Cette action est irréversible.'))return;
  const btn=document.getElementById('btnSgGo');
  btn.disabled=true;
  let ok=0,ko=0;
  for(const r of aSupprimer){
    try{
      const{error}=await sb.from('preinscriptions').delete().eq('id',r.p.id);
      if(error)throw error;
      PRE=PRE.filter(x=>String(x.id)!==String(r.p.id));
      ok++;
    }catch(e){
      console.error('[supprimerSelectionGroupee]',e);ko++;
    }
  }
  btn.disabled=false;
  render();
  toast(ok+' demande(s) supprimée(s)'+(ko?', '+ko+' échec(s)':''),!!ko&&!ok);
  rechercherSupprGroupe();
}

/* ---------- CLÔTURE DES DEMANDES PÉRIMÉES ----------
   Une demande dont la date d'entrée souhaitée est passée n'a plus lieu d'être
   suivie, mais la supprimer effacerait aussi ses devis et l'historique de la
   famille. On la passe donc en « Sans suite » : réversible, et elle reste
   comptée. Seules les demandes encore ouvertes et sans devis ni contrat sont
   proposées : un dossier en cours ne se clôture pas en bloc sur une date. */
let CL_RESULTATS=[];
const CL_STATUTS_OUVERTS=['nouvelle','en_contact'];

function openCloture(){
  document.getElementById('clCreche').innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  document.getElementById('clMotif').innerHTML=Object.keys(MOTIFS_REFUS).map(k=>
    '<option value="'+k+'"'+(k==='ne_repond_plus'?' selected':'')+'>'+esc(MOTIFS_REFUS[k])+'</option>').join('');
  setVal('clAvant',auj());
  document.getElementById('clStatut').textContent='';
  document.getElementById('clBar').style.display='none';
  document.getElementById('clListe').innerHTML='';
  document.getElementById('btnClGo').style.display='none';
  CL_RESULTATS=[];
  openOv('ovCloture');
}

async function rechercherCloture(){
  const cre=val('clCreche'),avant=val('clAvant');
  const statut=document.getElementById('clStatut');
  if(!avant){toast('Choisissez la date limite.',true);return;}
  statut.textContent='Recherche…';
  /* Les demandes qui portent un devis ou un contrat sont écartées : on les lit
     en base plutôt que de se fier à la liste chargée, qui ne les contient pas. */
  const occupees={};
  try{
    const[d,c]=await Promise.all([
      sb.from('devis').select('preinscription_id'),
      sb.from('contrats').select('preinscription_id')
    ]);
    if(d.error)throw d.error;
    if(c.error)throw c.error;
    (d.data||[]).concat(c.data||[]).forEach(x=>{if(x.preinscription_id)occupees[String(x.preinscription_id)]=1;});
  }catch(e){
    console.error('[rechercherCloture]',e);
    statut.textContent='Impossible de vérifier les devis et contrats : '+(e.message||'erreur inconnue');
    return;
  }
  CL_RESULTATS=PRE.filter(p=>{
    if(p.enfant_id)return false;
    if(CL_STATUTS_OUVERTS.indexOf(p.statut)<0)return false;
    if(occupees[String(p.id)])return false;
    if(!p.date_entree_souhaitee)return false;       // sans date : rien ne dit qu'elle est périmée
    if(String(p.date_entree_souhaitee).slice(0,10)>=avant)return false;
    if(cre&&toArr(p.creches_souhaitees).map(String).indexOf(cre)<0&&String(p.creche_id)!==cre)return false;
    return true;
  }).sort((a,b)=>String(a.date_entree_souhaitee).localeCompare(String(b.date_entree_souhaitee)))
    .map(p=>({p,inclus:true}));
  if(!CL_RESULTATS.length){
    statut.textContent='Aucune demande périmée ne correspond à ces critères.';
    document.getElementById('clBar').style.display='none';
    document.getElementById('clListe').innerHTML='';
    document.getElementById('btnClGo').style.display='none';
    return;
  }
  statut.textContent=CL_RESULTATS.length+' demande(s) périmée(s) trouvée(s). Décochez celles à garder ouvertes.';
  document.getElementById('clBar').style.display='';
  document.getElementById('btnClGo').style.display='';
  renderClListe();
}

function renderClListe(){
  document.getElementById('clListe').innerHTML=CL_RESULTATS.map((r,i)=>{
    const p=r.p;
    const nom=((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom';
    const cr=toArr(p.creches_souhaitees).map(nomCreche).filter(Boolean).join(' · ')||'crèche non précisée';
    return '<div class="hl"><div class="t">'
      +'<input type="checkbox" '+(r.inclus?'checked':'')+' onchange="clToggle('+i+',this.checked)">'
      +'<span class="n">'+esc(nom)+'</span><span class="c">entrée souhaitée le '+dfr(p.date_entree_souhaitee)
      +' · '+esc(STATUTS[p.statut]?STATUTS[p.statut].l:p.statut)+' · '+esc(cr)+'</span></div></div>';
  }).join('');
  clMajCompte();
}
function clToggle(i,v){CL_RESULTATS[i].inclus=v;clMajCompte();}
function clToutCocher(v){CL_RESULTATS.forEach(r=>r.inclus=v);renderClListe();}
function clMajCompte(){
  const n=CL_RESULTATS.filter(r=>r.inclus).length;
  document.getElementById('clCompte').textContent=n+' / '+CL_RESULTATS.length+' sélectionnée(s)';
}

async function cloturerSelection(){
  const aFaire=CL_RESULTATS.filter(r=>r.inclus);
  if(!aFaire.length){toast('Aucune demande sélectionnée.',true);return;}
  const motif=val('clMotif')||'ne_repond_plus';
  if(!confirm('Passer '+aFaire.length+' demande(s) en « Sans suite » (motif : '+(MOTIFS_REFUS[motif]||motif)+') ? '
    +'Elles sortent de la file active mais restent consultables.'))return;
  const btn=document.getElementById('btnClGo');
  btn.disabled=true;
  const trace='Clôturée le '+dfr(auj())+' : date d\'entrée souhaitée dépassée.';
  let ok=0,ko=0;
  for(const r of aFaire){
    try{
      const notes=(r.p.notes_internes?r.p.notes_internes+'\n':'')+trace;
      /* `.in('statut', …)` : si quelqu'un a fait avancer la demande entre-temps
         (devis, contact), on ne la clôture pas par-dessus. */
      const{data,error}=await sb.from('preinscriptions')
        .update({statut:'sans_suite',motif_refus:motif,notes_internes:notes})
        .eq('id',r.p.id).in('statut',CL_STATUTS_OUVERTS).is('enfant_id',null).select();
      if(error)throw error;
      if(!data||!data.length)throw new Error('demande modifiée entre-temps');
      Object.assign(r.p,data[0]);
      ok++;
    }catch(e){
      console.error('[cloturerSelection]',e);ko++;
    }
  }
  btn.disabled=false;
  render();
  toast(ok+' demande(s) passée(s) en « Sans suite »'+(ko?', '+ko+' non modifiée(s)':'')+' ✅',!!ko&&!ok);
  rechercherCloture();
}

/* ---------- RECHERCHE ----------
   Insensible aux accents et aux majuscules, tolérante aux fautes de frappe
   (« aliénore » trouve « aléinore »), et qui cherche aussi dans les parents et
   dans les fiches enfants — pas seulement dans le nom de la demande. */
function normRech(s){
  return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim();
}
/* Distance de Damerau-Levenshtein (substitution, insertion, suppression,
   inversion de deux lettres voisines), plafonnée : au-delà de `max` on s'arrête. */
function distRech(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  const d=[];
  for(let i=0;i<=a.length;i++){d[i]=[i];}
  for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++){
    for(let j=1;j<=b.length;j++){
      const c=a[i-1]===b[j-1]?0:1;
      d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
    }
  }
  return d[a.length][b.length];
}
/* Chaque mot cherché doit se retrouver dans le texte : tel quel, ou à une
   ou deux lettres près (selon sa longueur), y compris en début de mot pour
   qu'une saisie en cours de frappe fonctionne déjà. */
function correspondRech(requete,texte){
  const qs=normRech(requete).split(' ').filter(Boolean);
  if(!qs.length)return true;
  const brut=normRech(texte);
  const mots=brut.split(' ').filter(Boolean);
  return qs.every(q=>{
    if(brut.indexOf(q)>=0)return true;
    if(q.length<5)return false;   // un mot court se cherche tel quel : « lina » ne doit pas ramener « lana »
    const tol=q.length>=8?2:1;
    return mots.some(m=>distRech(q,m,tol)<=tol||(m.length>q.length&&distRech(q,m.slice(0,q.length),1)<=1));
  });
}

/* ---------- ENTRÉES À VENIR ----------
   Un enfant « à venir » n'est pas une préinscription : la famille a signé, la
   fiche existe, seul l'accueil n'a pas commencé. La date d'entrée de la fiche
   enfant est trop souvent vide (ou fausse) pour s'y fier : on lit le début de
   la ligne d'accueil, qui est ce que les présences et la facturation utilisent. */
let ENTREES=[],ENTREES_CHARGEES=false;
let PARENTS_PRE={},ENFANTS_REC=[];   // texte des parents par demande ; fiches enfants pour la recherche

async function chargerEntrees(){
  try{
    const[en,li,ct,pp,ep]=await Promise.all([
      sb.from('enfants').select('id,prenom,nom,dob,creche_id,date_entree'),
      sb.from('enfants_contrats').select('enfant_id,date_debut,date_fin'),
      sb.from('contrats').select('enfant_id,statut,origine,type,date_debut'),
      sb.from('preinscriptions_parents').select('preinscription_id,prenom,nom,email,telephone'),
      sb.from('enfants_parents').select('enfant_id,prenom,nom,email,telephone')
    ]);
    if(en.error)throw en.error;
    if(li.error)throw li.error;
    /* La recherche sur les parents est un confort : si leur lecture échoue, on
       cherche quand même sur les enfants et les demandes. */
    const txtParent=x=>[x.prenom,x.nom,x.email,x.telephone,String(x.telephone||'').replace(/\D/g,'')].join(' ');
    PARENTS_PRE={};
    ((pp&&pp.data)||[]).forEach(x=>{PARENTS_PRE[x.preinscription_id]=(PARENTS_PRE[x.preinscription_id]||'')+' '+txtParent(x);});
    const parentsEnf={};
    ((ep&&ep.data)||[]).forEach(x=>{parentsEnf[x.enfant_id]=(parentsEnf[x.enfant_id]||'')+' '+txtParent(x);});
    const aujourdhui=auj();
    const lignes={},contrats={};
    (li.data||[]).forEach(l=>{(lignes[l.enfant_id]=lignes[l.enfant_id]||[]).push(l);});
    ((ct&&ct.data)||[]).forEach(c=>{if(c.enfant_id)(contrats[c.enfant_id]=contrats[c.enfant_id]||[]).push(c);});
    ENFANTS_REC=(en.data||[]).map(e=>{
      const ls=lignes[e.id]||[];
      const enCours=ls.find(l=>String(l.date_debut).slice(0,10)<=aujourdhui&&(!l.date_fin||String(l.date_fin).slice(0,10)>=aujourdhui));
      const futur=ls.map(l=>String(l.date_debut).slice(0,10)).filter(d=>d>aujourdhui).sort()[0];
      return {e,parents:parentsEnf[e.id]||'',
        accueil:enCours?'accueil en cours depuis le '+dfr(enCours.date_debut)
          :(futur?'entrée à venir le '+dfr(futur):(ls.length?'accueil terminé':'aucune ligne d\'accueil'))};
    });
    ENTREES=(en.data||[]).map(e=>{
      const ls=lignes[e.id]||[];
      const enCours=ls.some(l=>String(l.date_debut).slice(0,10)<=aujourdhui
        &&(!l.date_fin||String(l.date_fin).slice(0,10)>=aujourdhui));
      if(enCours)return null;
      const futures=ls.map(l=>String(l.date_debut).slice(0,10)).filter(d=>d>aujourdhui).sort();
      let entree=futures[0]||'';
      // Sans ligne d'accueil : la date de la fiche, si elle est plausible.
      if(!entree&&/^\d{4}-\d{2}-\d{2}$/.test(String(e.date_entree||''))&&String(e.date_entree)>aujourdhui)entree=String(e.date_entree);
      if(!entree)return null;
      const cts=(contrats[e.id]||[]).filter(c=>c.type!=='avenant');
      const complet=cts.find(c=>c.statut==='contresigne');
      const etat=complet?(complet.origine==='reprise'?'Contrat repris':'Contrat contresigné')
        :(cts.find(c=>['signe','envoye','brouillon'].indexOf(c.statut)>=0)?'Contrat en cours de signature':'Pas de contrat dans l\'appli');
      return {e,entree,etat,ok:!!complet};
    }).filter(Boolean).sort((a,b)=>a.entree.localeCompare(b.entree));
    ENTREES_CHARGEES=true;
  }catch(err){
    console.warn('[chargerEntrees]',err);
    ENTREES=[];ENTREES_CHARGEES=false;
  }
  render();
}

function tuileEntrees(cre){
  if(!ENTREES_CHARGEES)return '';
  const n=ENTREES.length;
  const ici=cre?ENTREES.filter(x=>String(x.e.creche_id)===String(cre)).length:0;
  return '<div class="stat av" onclick="openEntrees()" title="Enfants déjà inscrits (fiche et ligne d\'accueil) dont l\'accueil n\'a pas encore commencé — toutes crèches. Ce ne sont pas des préinscriptions.">'
    +'<div class="n">'+n+'</div><div class="l">Entrées à venir</div>'
    +'<div class="d">déjà inscrits, pas encore arrivés</div>'+(cre?'<div class="s">dont '+ici+' ici</div>':'')+'</div>';
}

function openEntrees(){
  document.getElementById('enCreche').innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  setVal('enCreche',val('fCreche'));
  renderEntrees();
  openOv('ovEntrees');
}
function renderEntrees(){
  const cre=val('enCreche');
  const L=ENTREES.filter(x=>!cre||String(x.e.creche_id)===String(cre));
  document.getElementById('enCompte').textContent=L.length+' enfant'+(L.length>1?'s':'')+' à venir';
  document.getElementById('enListe').innerHTML=L.length?L.map(x=>{
    const e=x.e;
    const nom=((e.prenom||'')+' '+(e.nom||'')).trim()||'Sans nom';
    const naiss=e.dob?'né(e) le '+dfr(e.dob):'naissance non renseignée';
    return '<div class="hl"><div class="t">'
      +'<span class="n">'+esc(nom)+'</span><span class="c">'+esc(naiss)+' · '+esc(nomCreche(e.creche_id)||'crèche non précisée')
      +' · <b>entrée le '+dfr(x.entree)+'</b></span>'
      +'<span class="tag" style="background:'+(x.ok?'var(--green-l)':'var(--amber-l)')+';color:'+(x.ok?'var(--green)':'var(--amber)')+'">'+esc(x.etat)+'</span>'
      +'<a class="btn btn-s btn-sm" href="contrats.html?enfant='+esc(e.id)+'">Dossier contrat</a>'
      +'</div></div>';
  }).join(''):'<p class="hint">Aucune entrée à venir pour cette sélection.</p>';
}

/* Date locale, jamais toISOString() : en UTC+2 celui-ci renvoie la veille pour
   tout ce qui est saisi avant 2h du matin. */
function auj(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dfr(d){if(!d)return'';const p=String(d).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'';}

/* Un tableau JSON peut revenir en tableau ou en chaîne selon la façon dont la
   ligne a été écrite. On accepte les deux plutôt que de planter à l'affichage. */
function toArr(v){
  if(Array.isArray(v))return v;
  if(typeof v==='string'){try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch(e){return[];}}
  return [];
}

/* ---------- AUTH ---------- */
/* Même règle que documents.html : arrivée depuis le hub index.html, qui
   n'authentifie personne, donc déconnexion systématique et saisie obligatoire.
   Sans elle, ouvrir ce module depuis le hub sur un poste partagé donnerait
   accès aux coordonnées et aux revenus des familles avec la session laissée
   par la personne précédente. */
let JUSTE_CONNECTE=false;
function showLogin(msg){
  document.getElementById('appView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('liFormBox').style.display='block';
  document.getElementById('mfaGateBox').style.display='none';
  document.getElementById('liErr').textContent=msg||'';
}
async function boot(){
  if(!JUSTE_CONNECTE){
    try{await sb.auth.signOut();}catch(e){console.warn('[boot] signOut',e);}
    showLogin();return;
  }
  let session=null;
  try{
    const r=await sb.auth.getSession();
    session=(r&&r.data&&r.data.session)||null;
    if(session&&session.expires_at&&session.expires_at*1000<Date.now()+10000){
      const{data:rd}=await sb.auth.refreshSession();
      session=(rd&&rd.session)||null;
    }
  }catch(e){console.warn('[boot] session',e);session=null;}
  if(!session||!session.user){showLogin();return;}
  ME=session.user;
  let p=null;
  try{
    const{data,error}=await sb.from('referents').select('*').eq('user_id',ME.id).maybeSingle();
    if(error)throw error;
    p=data;
  }catch(e){
    console.error('[boot] profil',e);
    showLogin('Session expirée ou profil inaccessible — merci de vous reconnecter.');
    return;
  }
  if(!p){
    try{await sb.auth.signOut();}catch(e){}
    showLogin('Compte non reconnu — contactez la direction.');
    return;
  }
  PROF=p;
  IS_DIRECTION=(p.role==='direction');
  if(window.KKBranding)KKBranding.applyBranding(sb);
  /* Le module est réservé à la direction. Le verrou réel est côté Supabase
     (policies de 24d) : sans lui, cacher l'écran ne protégerait rien. Ce test
     ne fait qu'éviter d'afficher une page vide et inexplicable. */
  if(!IS_DIRECTION){
    try{await sb.auth.signOut();}catch(e){}
    showLogin('Ce module est réservé à la direction.');
    return;
  }
  // MFA obligatoire à la connexion, même portail que demandes.html/documents.html.
  await mfaGateCheckAndProceed();
}
