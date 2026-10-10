
// ── Les jours de présence ─────────────────────────────────────────────────

const STG_JOURS_FR=['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];

function stgRenderJours(){
  const zone=document.getElementById('stg-jours-zone');
  if(!zone||!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const jours=stgJoursDe(stgFicheId);
  const presents=jours.filter(j=>!j.absent).length;

  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-calendar-week" style="color:var(--koala)"></i> Jours de présence</div>'
    +'<div style="display:flex;gap:7px;flex-wrap:wrap">'
    +'<button class="btn-sm" onclick="stgGenererJours()"><i class="ti ti-wand"></i> Générer les jours ouvrés</button>'
    /* Un <label> et non un bouton avec .click() : l'ouverture du sélecteur de
       fichier est alors native, sans JavaScript à exécuter — c'est ce qui
       marche partout, tablette comprise. */
    +'<label class="btn-sm" for="stg-imp-file" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px">'
    +'<i class="ti ti-calendar-up"></i> Importer un calendrier (PDF)</label>'
    +'<input type="file" id="stg-imp-file" accept="application/pdf,.pdf" '
    +'style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden" onchange="stgImportPdf(event)">'
    +'<button class="btn-sm" onclick="stgOuvrirSemaine()"><i class="ti ti-calendar-plus"></i> Ajouter une semaine</button>'
    +'<button class="btn-sm" onclick="stgAjouterJour()"><i class="ti ti-plus"></i> Ajouter un jour</button>'
    +'</div></div>';

  if(!jours.length){
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0;line-height:1.5">'
      +(s&&s.date_debut
        ? 'Aucun jour saisi. « Générer les jours ouvrés » remplit la période du lundi au vendredi — '
          +'vous retirez ensuite ce qui ne colle pas.'
        : 'Renseignez d\'abord les dates de début et de fin du stage, plus haut.')+'</p>';
  }else{
    h+='<div style="font-size:12px;color:var(--muted);margin-bottom:7px">'
      +presents+' jour'+(presents>1?'s':'')+' de présence'
      +(jours.length-presents?' · '+(jours.length-presents)+' absence'+((jours.length-presents)>1?'s':''):'')
      +' — cliquer sur un jour pour le modifier</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
      +jours.map(j=>{
        const d=new Date(String(j.jour)+'T12:00:00');
        const lib=STG_JOURS_FR[d.getDay()]+' '+d.getDate()+'/'+(d.getMonth()+1);
        const hr=j.absent?(j.motif||'absente'):[j.debut,j.fin].filter(Boolean).join('–');
        return '<button class="btn-sm" onclick="stgOuvrirJour(\''+j.jour+'\')" style="'
          +(j.absent?'border-color:var(--red);color:var(--red);background:var(--red-light)'
                    :'border-color:var(--koala);color:var(--koala-dark);background:var(--koala-light)')
          +'"><i class="ti ti-'+(j.absent?'user-off':'clock')+'"></i> '+escHtml(lib)
          +(hr?'<span style="opacity:.75;font-weight:400"> '+escHtml(hr)+'</span>':'')+'</button>';
      }).join('')
      +'</div>';
  }
  zone.innerHTML=h;
}

/* Les jours ouvrés de la période, sans écraser ce qui existe déjà : régénérer
   après avoir retiré un mercredi ne doit pas le faire revenir. */
async function stgGenererJours(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  if(!s.date_debut||!s.date_fin)
    return showBanner('Renseignez les dates de début et de fin, puis enregistrez.','error');

  const existants=new Set(stgJoursDe(stgFicheId).map(j=>String(j.jour)));
  const d=new Date(s.date_debut+'T12:00:00');
  const fin=new Date(s.date_fin+'T12:00:00');
  const aCreer=[];
  while(d<=fin){
    const jour=d.getDay();
    if(jour>=1&&jour<=5){
      const iso=ipDateToLocalISO(d);
      if(!existants.has(iso))aCreer.push({stagiaire_id:stgFicheId,jour:iso,debut:'08h00',fin:'16h00'});
    }
    d.setDate(d.getDate()+1);
    if(aCreer.length>200)break;   // garde-fou : une date de fin mal saisie
  }
  if(!aCreer.length)return showBanner('Tous les jours ouvrés de la période sont déjà saisis.');
  const {data,error}=await sb.from('stagiaires_jours').insert(aCreer).select();
  if(error)return showBanner('Génération impossible : '+error.message,'error');
  stgJoursCache=stgJoursCache.concat(data||[]);
  stgRenderJours();stgRender();stgRenderCal();
  showBanner(aCreer.length+' jour'+(aCreer.length>1?'s':'')+' ajouté'+(aCreer.length>1?'s':'')+' ✅');
}

/* ══ Import d'un calendrier de centre de formation ══════════════════════════
   Les écoles envoient toutes le même genre de document : douze colonnes de
   mois, une ligne par quantième, et une lettre qui dit où la personne se
   trouve ce jour-là (ici « E » chez l'employeur, « C » au centre). Le saisir à
   la main, c'est 150 clics et autant d'occasions de se tromper.

   Ce qui est lu : la position des textes dans le PDF, pas sa mise en page.
   Les colonnes ne sont pas devinées depuis l'en-tête (une lettre de code peut
   déborder sous le mois suivant) mais depuis la position des numéros de jour,
   qui est la seule vraiment régulière.

   Ce qui n'est PAS deviné : le sens des lettres. « C » veut dire cours ici,
   crèche ailleurs. L'écran de contrôle les liste avec leur nombre de jours et
   c'est vous qui tranchez, avant toute écriture.

   Un calendrier scanné (image) ne donne aucun texte : il n'est pas lisible,
   et le message le dit plutôt que d'importer zéro jour en silence. */

let stgImp=null;   // {nom, jours:{iso:code}, codes:{code:n}, roles:{code:role}}

const STG_IMP_MOIS={janv:0,jan:0,janvier:0,fevr:1,fev:1,fevrier:1,mars:2,avr:3,avril:3,
  mai:4,juin:5,juil:6,juillet:6,aout:7,sept:8,sep:8,septembre:8,oct:9,octobre:9,
  nov:10,novembre:10,dec:11,dece:11,decembre:11};
const STG_IMP_JOURS='DLMMJVS';    // getDay() → initiale française
const stgImpNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

/* Les lettres les plus courantes, pour proposer un choix par défaut. Il reste
   toujours modifiable : c'est une suggestion, pas une règle. */
function stgImpRoleDefaut(code){
  const c=stgImpNorm(code);
  if(['e','ent','emp','s','st','a','stage'].includes(c))return 'presence';
  if(['c','f','cf','ifts','cfa','ecole','cours'].includes(c))return 'formation';
  return 'ignore';
}

async function stgImportPdf(ev){
  const f=(ev.target.files||[])[0];
  ev.target.value='';
  if(!f)return;
  if(typeof pdfjsLib==='undefined')return showBanner('Bibliothèque PDF non chargée — rechargez la page.','error');
  showBanner('Lecture du calendrier…');
  try{
    const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
    let items=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const tc=await page.getTextContent();
      /* Le décalage par page évite que la ligne « 3 » de la page 2 se mélange
         à celle de la page 1 : les y repartent de zéro à chaque page. */
      items=items.concat(tc.items.filter(i=>(i.str||'').trim()).map(i=>({
        s:i.str.trim(), x:i.transform[4], y:i.transform[5]-(p-1)*100000
      })));
    }
    const r=stgImpParse(items);
    if(r.erreur)return showBanner(r.erreur,'error');
    stgImp={nom:f.name,jours:r.jours,codes:r.codes,roles:{},anomalies:r.anomalies,mois:r.mois};
    Object.keys(r.codes).forEach(c=>{stgImp.roles[c]=stgImpRoleDefaut(c);});
    stgImportRendu();
    document.getElementById('modal-stg-import-wrap').classList.add('open');
  }catch(e){
    console.error('[Stagiaires] import calendrier',e);
    showBanner('Ce PDF n\'a pas pu être lu'+(e&&e.message?' : '+e.message:'')+'.','error');
  }
}

function stgImpParse(items){
  const parY={};
  items.forEach(i=>{const k=Math.round(i.y);(parY[k]=parY[k]||[]).push(i);});

  /* 1. La ligne des mois — « sept-26 », « janv-27 », « Septembre 2026 ». */
  let entete=null;
  Object.keys(parY).forEach(k=>{
    const cols=parY[k].map(i=>{
      const m=stgImpNorm(i.s).match(/^([a-z]{3,9})\.?\s*[-\/ ]\s*(\d{2,4})$/);
      if(!m||!(m[1] in STG_IMP_MOIS))return null;
      return {mois:STG_IMP_MOIS[m[1]],an:+m[2]<100?2000+ +m[2]:+m[2],x:i.x};
    }).filter(Boolean);
    if(cols.length>=3&&(!entete||cols.length>entete.length))entete=cols.sort((a,b)=>a.x-b.x);
  });
  if(!entete)return {erreur:'Aucune ligne de mois n\'a été trouvée : ce PDF n\'a pas la forme d\'un calendrier annuel, ou il s\'agit d\'une image scannée.'};

  /* 2. Les colonnes réelles : là où se trouvent les quantièmes suivis d'une
        initiale de jour. Les totaux du bas n'ont pas d'initiale : ils sont
        écartés d'eux-mêmes. */
  const xs=[];
  Object.keys(parY).forEach(k=>{
    const l=parY[k].slice().sort((a,b)=>a.x-b.x);
    l.forEach((it,i)=>{
      if(!/^\d{1,2}$/.test(it.s)||+it.s<1||+it.s>31)return;
      const suiv=l[i+1];
      if(suiv&&suiv.x-it.x<30&&/^[lmjvsd]$/.test(stgImpNorm(suiv.s)))xs.push(it.x);
    });
  });
  if(xs.length<20)return {erreur:'Aucun jour n\'a pu être lu : ce calendrier est probablement une image scannée, qui ne contient pas de texte.'};
  xs.sort((a,b)=>a-b);
  const colX=[];
  xs.forEach(x=>{if(!colX.length||x-colX[colX.length-1]>14)colX.push(x);});

  /* 3. Chaque colonne reçoit son mois : dans l'ordre si les comptes tombent
        juste, au plus proche sinon. */
  const moisDe=colX.map((x,i)=>(colX.length===entete.length)?entete[i]
    :entete.reduce((best,c)=>Math.abs(c.x-x)<Math.abs(best.x-x)?c:best,entete[0]));

  /* 4. Les jours. La colonne va d'un numéro au numéro suivant : la lettre de
        code, alignée à droite, reste ainsi dans SA colonne. */
  const jours={},codes={};
  let anomalies=0;
  Object.keys(parY).forEach(k=>{
    const l=parY[k].slice().sort((a,b)=>a.x-b.x);
    colX.forEach((x0,ci)=>{
      const x1=ci+1<colX.length?colX[ci+1]:1e9;
      const dedans=l.filter(i=>i.x>=x0-6&&i.x<x1-6);
      const num=dedans.find(i=>/^\d{1,2}$/.test(i.s)&&+i.s>=1&&+i.s<=31);
      if(!num)return;
      const suite=dedans.filter(i=>i.x>num.x&&/^[A-Za-zÀ-ÿ]{1,4}$/.test(i.s));
      if(!suite.length)return;
      const c=moisDe[ci];
      const d=new Date(c.an,c.mois,+num.s,12);
      if(d.getMonth()!==c.mois)return;                       // 31 février
      /* L'initiale du jour DOIT correspondre à la date reconstituée : c'est le
         seul contrôle qui protège d'une colonne mal appariée. */
      if(STG_IMP_JOURS[d.getDay()]!==stgImpNorm(suite[0].s).toUpperCase()[0]){anomalies++;return;}
      const code=suite[1]?suite[1].s.trim().toUpperCase():'';
      if(!code)return;
      jours[ipDateToLocalISO(d)]=code;
      codes[code]=(codes[code]||0)+1;
    });
  });
  if(!Object.keys(jours).length)
    return {erreur:'Le calendrier a été lu, mais aucun jour ne porte de code (lettre) : il n\'y a rien à importer.'};
  return {jours,codes,anomalies,mois:moisDe};
}

const STG_IMP_ROLES={presence:'Présence à la crèche',formation:'Centre de formation (absence)',ignore:'Ne pas importer'};

function stgImportRendu(){
  if(!stgImp)return;
  const dates=Object.keys(stgImp.jours).sort();
  const res=document.getElementById('stg-imp-resume');
  if(res)res.innerHTML='<strong>'+escHtml(stgImp.nom)+'</strong><br>'
    +dates.length+' jours codés, du '+stgDateFr(dates[0])+' au '+stgDateFr(dates[dates.length-1])+'.'
    +(stgImp.anomalies?'<br><span style="color:var(--orange-dark)">'+stgImp.anomalies
      +' ligne(s) ignorée(s) : le jour de la semaine ne correspondait pas à la date.</span>':'')
    +'<br>Dites ce que signifie chaque code — rien n\'est enregistré avant « Importer ».';

  const box=document.getElementById('stg-imp-codes');
  if(box){
    box.innerHTML=Object.keys(stgImp.codes).sort((a,b)=>stgImp.codes[b]-stgImp.codes[a]).map(c=>
      '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--border);border-radius:9px;padding:8px 11px">'
      +'<span style="font-weight:700;font-size:14px;background:var(--koala-light);color:var(--koala-dark);border-radius:7px;padding:3px 10px;min-width:38px;text-align:center">'+escHtml(c)+'</span>'
      +'<span style="font-size:12.5px;color:var(--muted);flex:1">'+stgImp.codes[c]+' jour'+(stgImp.codes[c]>1?'s':'')+'</span>'
      +'<select class="finput" style="width:auto;font-size:12.5px;padding:5px 8px" onchange="stgImportRole(\''+escHtml(c)+'\',this.value)">'
      +Object.keys(STG_IMP_ROLES).map(r=>'<option value="'+r+'"'+(stgImp.roles[c]===r?' selected':'')+'>'+STG_IMP_ROLES[r]+'</option>').join('')
      +'</select></div>').join('');
  }
  stgImportApercu();
}

function stgImportRole(code,val){
  if(!stgImp)return;
  stgImp.roles[code]=val;
  stgImportApercu();
}

/* Les lignes qui seront réellement écrites. Un jour déjà saisi n'est jamais
   modifié : l'import complète, il n'écrase pas ce que la directrice technique a corrigé
   à la main. */
function stgImportLignes(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId))||{};
  const dansPeriode=(document.getElementById('stg-imp-periode')||{}).checked;
  const debut=((document.getElementById('stg-imp-debut')||{}).value||'08h00').trim();
  const fin=((document.getElementById('stg-imp-fin')||{}).value||'16h00').trim();
  const existants=new Set(stgJoursDe(stgFicheId).map(j=>String(j.jour)));
  const rows=[];let deja=0,horsPeriode=0;
  Object.keys(stgImp.jours).sort().forEach(iso=>{
    const role=stgImp.roles[stgImp.jours[iso]];
    if(!role||role==='ignore')return;
    if(dansPeriode&&((s.date_debut&&iso<s.date_debut)||(s.date_fin&&iso>s.date_fin))){horsPeriode++;return;}
    if(existants.has(iso)){deja++;return;}
    /* Toutes les lignes portent EXACTEMENT les mêmes colonnes : PostgREST
       refuse un envoi groupé dont les objets n'ont pas les mêmes clés
       (« All object keys must match »), et un import mêlant présences et jours
       de formation partirait alors entièrement en erreur. */
    rows.push(role==='presence'
      ? {stagiaire_id:stgFicheId,jour:iso,debut:debut,fin:fin,absent:false,motif:null}
      : {stagiaire_id:stgFicheId,jour:iso,debut:null,fin:null,absent:true,motif:'Centre de formation'});
  });
  return {rows,deja,horsPeriode,
    presences:rows.filter(r=>!r.absent).length,
    formations:rows.filter(r=>r.absent).length};
}

function stgImportApercu(){
  if(!stgImp)return;
  const z=document.getElementById('stg-imp-apercu');
  if(!z)return;
  const r=stgImportLignes();
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId))||{};
  z.innerHTML=r.rows.length
    ? '<strong>'+r.rows.length+' jour'+(r.rows.length>1?'s':'')+' à ajouter</strong> : '
      +r.presences+' de présence'+(r.formations?', '+r.formations+' en centre de formation (comptés comme absences)':'')+'.'
      +(r.deja?'<br>'+r.deja+' jour(s) déjà saisi(s) — laissés tels quels.':'')
      +(r.horsPeriode?'<br>'+r.horsPeriode+' jour(s) hors des dates de la fiche — non repris.':'')
    : 'Rien à importer avec ces réglages.'
      +(r.horsPeriode?' '+r.horsPeriode+' jour(s) sont hors des dates de la fiche ('
        +stgDateFr(s.date_debut)+' → '+stgDateFr(s.date_fin)+') : décochez la limite ci-dessus, ou corrigez les dates.':'')
      +(r.deja?' '+r.deja+' jour(s) sont déjà saisis.':'');
}

async function stgImportValider(){
  if(!stgImp)return showBanner('Aucun calendrier chargé — reprenez depuis « Importer un calendrier ».','error');
  if(!stgFicheId)return showBanner('Enregistrez d\'abord la fiche.','error');
  const {rows}=stgImportLignes();
  if(!rows.length)return showBanner('Aucun jour à importer avec ces réglages.','error');
  if(rows.length>400&&!confirm(rows.length+' jours vont être ajoutés. Continuer ?'))return;

  const btn=document.getElementById('stg-imp-ok');
  if(btn)btn.disabled=true;
  let ajoutes=[];
  /* Par paquets : une seule requête de 300 lignes passe mal sur une connexion
     de crèche, et une erreur au milieu ne dirait pas où. */
  for(let i=0;i<rows.length;i+=100){
    const {data,error}=await sb.from('stagiaires_jours').insert(rows.slice(i,i+100)).select();
    if(error){
      if(btn)btn.disabled=false;
      stgJoursCache=stgJoursCache.concat(ajoutes);
      stgRenderJours();stgRenderCal();
      return showBanner('Import interrompu après '+ajoutes.length+' jour(s) : '+error.message,'error');
    }
    ajoutes=ajoutes.concat(data||[]);
  }
  stgJoursCache=stgJoursCache.concat(ajoutes);

  /* Les dates de la fiche, si on l'a demandé : elles servent au calendrier
     mensuel et à la carte de la liste. */
  if((document.getElementById('stg-imp-dates')||{}).checked){
    const isos=Object.keys(stgImp.jours).filter(iso=>{
      const r=stgImp.roles[stgImp.jours[iso]];
      return r&&r!=='ignore';
    }).sort();
    if(isos.length){
      const maj={date_debut:isos[0],date_fin:isos[isos.length-1]};
      if(await dbUpdate('stagiaires',stgFicheId,maj)){
        const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
        if(s)Object.assign(s,maj);
        const e1=document.getElementById('stg-f-debut'),e2=document.getElementById('stg-f-fin');
        if(e1)e1.value=maj.date_debut;
        if(e2)e2.value=maj.date_fin;
      }
    }
  }

  if(btn)btn.disabled=false;
  closeModal('modal-stg-import-wrap');
  stgImp=null;
  stgRenderJours();stgRender();stgRenderCal();
  showBanner(ajoutes.length+' jour'+(ajoutes.length>1?'s':'')+' importé'+(ajoutes.length>1?'s':'')+' ✅');
}

/* ══ Ajouter une semaine ═══════════════════════════════════════════════════
   Saisir quinze jours un par un, c'est quinze fenêtres. La semaine type couvre
   l'essentiel des stages ; le jour par jour garde sa place pour ce qui sort de
   la règle (un mercredi retiré, un horaire différent).

   Les jours déjà saisis ne sont jamais touchés : ajouter une semaine par-dessus
   une autre ne défait pas un horaire corrigé à la main. */

const STG_SEM_JOURS=[{n:1,lib:'Lundi'},{n:2,lib:'Mardi'},{n:3,lib:'Mercredi'},
  {n:4,lib:'Jeudi'},{n:5,lib:'Vendredi'},{n:6,lib:'Samedi'},{n:0,lib:'Dimanche'}];
let stgSemChoix={1:true,2:true,3:true,4:true,5:true,6:false,0:false};

function stgOuvrirSemaine(){
  if(!stgFicheId)return showBanner('Enregistrez d\'abord la fiche.','error');
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  /* Par défaut : la semaine du début du stage si elle est connue, sinon celle
     en cours. On se cale toujours sur le lundi. */
  const dep=new Date(((s&&s.date_debut)||todayStr())+'T12:00:00');
  const el=document.getElementById('stg-sem-date');
  if(el)el.value=ipDateToLocalISO(stgLundiDe(dep));
  stgSemaineBoutons();
  stgSemaineApercu();
  document.getElementById('modal-stg-semaine-wrap').classList.add('open');
}

function stgLundiDe(d){
  const x=new Date(d.getTime());
  const dec=(x.getDay()+6)%7;          // lundi = 0
  x.setDate(x.getDate()-dec);
  return x;
}

function stgSemaineBoutons(){
  const box=document.getElementById('stg-sem-jours');
  if(!box)return;
  box.innerHTML=STG_SEM_JOURS.map(j=>{
    const on=!!stgSemChoix[j.n];
    return '<button type="button" class="btn-sm" onclick="stgSemaineBascule('+j.n+')" style="'
      +(on?'border-color:var(--koala);color:#fff;background:var(--koala)'
          :'border-color:var(--border);color:var(--muted);background:#fff')+'">'
      +escHtml(j.lib)+'</button>';
  }).join('');
}

function stgSemaineBascule(n){
  stgSemChoix[n]=!stgSemChoix[n];
  stgSemaineBoutons();
  stgSemaineApercu();
}

/* Les lignes à écrire. Mêmes colonnes partout — un envoi groupé dont les objets
   n'ont pas les mêmes clés est refusé en bloc par PostgREST. */
function stgSemaineLignes(){
  const iso=((document.getElementById('stg-sem-date')||{}).value||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return {rows:[],deja:0,iso:''};
  const debut=((document.getElementById('stg-sem-debut')||{}).value||'08h00').trim();
  const fin=((document.getElementById('stg-sem-fin')||{}).value||'16h00').trim();
  const semaines=+((document.getElementById('stg-sem-repeter')||{}).value||1);
  const lundi=stgLundiDe(new Date(iso+'T12:00:00'));
  const existants=new Set(stgJoursDe(stgFicheId).map(j=>String(j.jour)));
  const rows=[];let deja=0;
  for(let w=0;w<semaines;w++){
    for(let d=0;d<7;d++){
      const jour=new Date(lundi.getTime());
      jour.setDate(jour.getDate()+w*7+d);
      if(!stgSemChoix[jour.getDay()])continue;
      const j=ipDateToLocalISO(jour);
      if(existants.has(j)){deja++;continue;}
      rows.push({stagiaire_id:stgFicheId,jour:j,debut:debut,fin:fin,absent:false,motif:null});
    }
  }
  return {rows,deja,iso:ipDateToLocalISO(lundi),semaines};
}

function stgSemaineApercu(){
  const z=document.getElementById('stg-sem-apercu');
  if(!z)return;
  const r=stgSemaineLignes();
  if(!r.iso){z.innerHTML='Choisissez la semaine.';return;}
  const fin=new Date(r.iso+'T12:00:00');
  fin.setDate(fin.getDate()+r.semaines*7-1);
  z.innerHTML='Du <strong>'+stgDateFr(r.iso)+'</strong> au <strong>'+stgDateFr(ipDateToLocalISO(fin))+'</strong> — '
    +(r.rows.length?'<strong>'+r.rows.length+' jour'+(r.rows.length>1?'s':'')+'</strong> à ajouter.'
                   :'aucun jour à ajouter avec ces réglages.')
    +(r.deja?'<br>'+r.deja+' jour(s) déjà saisi(s) — laissés tels quels.':'')
    +'<br><span style="opacity:.8">La semaine est calée sur le lundi, quelle que soit la date choisie.</span>';
}

async function stgSemaineAjouter(){
  if(!stgFicheId)return;
  const {rows}=stgSemaineLignes();
  if(!rows.length)return showBanner('Aucun jour à ajouter : tous sont déjà saisis, ou aucun jour n\'est retenu.','error');
  const btn=document.getElementById('stg-sem-ok');
  if(btn)btn.disabled=true;
  const {data,error}=await sb.from('stagiaires_jours').insert(rows).select();
  if(btn)btn.disabled=false;
  if(error)return showBanner('Ajout impossible : '+error.message,'error');
  stgJoursCache=stgJoursCache.concat(data||[]);
  closeModal('modal-stg-semaine-wrap');
  stgRenderJours();stgRender();stgRenderCal();
  showBanner(rows.length+' jour'+(rows.length>1?'s':'')+' ajouté'+(rows.length>1?'s':'')+' ✅');
}

function stgAjouterJour(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const def=(s&&s.date_debut)||todayStr();
  const iso=prompt('Date du jour à ajouter (AAAA-MM-JJ) :',def);
  if(!iso)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return showBanner('Date attendue au format AAAA-MM-JJ.','error');
  if(stgJoursDe(stgFicheId).some(j=>String(j.jour)===iso))return stgOuvrirJour(iso);
  stgJourCourant={stagiaire_id:stgFicheId,jour:iso,nouveau:true};
  stgOuvrirModalJour(null,iso);
}

function stgOuvrirJour(iso){
  const j=stgJoursDe(stgFicheId).find(x=>String(x.jour)===String(iso));
  stgJourCourant={stagiaire_id:stgFicheId,jour:iso,nouveau:!j};
  stgOuvrirModalJour(j,iso);
}

function stgOuvrirModalJour(j,iso){
  const d=new Date(String(iso)+'T12:00:00');
  document.getElementById('stg-j-title').textContent=
    d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('stg-j-debut').value=(j&&j.debut)||'08h00';
  document.getElementById('stg-j-fin').value=(j&&j.fin)||'16h00';
  document.getElementById('stg-j-absent').checked=!!(j&&j.absent);
  document.getElementById('stg-j-motif').value=(j&&j.motif)||'';
  document.getElementById('stg-j-note').value=(j&&j.note)||'';
  stgJourAbsentChange();
  document.getElementById('modal-stg-jour-wrap').classList.add('open');
}

function stgJourAbsentChange(){
  const abs=document.getElementById('stg-j-absent').checked;
  const w=document.getElementById('stg-j-motif-wrap');
  if(w)w.style.display=abs?'':'none';
}

async function stgJourEnregistrer(){
  if(!stgJourCourant)return;
  const row={
    stagiaire_id:stgJourCourant.stagiaire_id,
    jour:stgJourCourant.jour,
    debut:document.getElementById('stg-j-debut').value.trim()||null,
    fin:document.getElementById('stg-j-fin').value.trim()||null,
    absent:document.getElementById('stg-j-absent').checked,
    motif:document.getElementById('stg-j-motif').value.trim()||null,
    note:document.getElementById('stg-j-note').value.trim()||null
  };
  /* upsert sur (stagiaire_id, jour) : la contrainte d'unicité de 23a fait que
     rouvrir un jour existant le met à jour au lieu d'en créer un second. */
  const {data,error}=await sb.from('stagiaires_jours')
    .upsert(row,{onConflict:'stagiaire_id,jour'}).select();
  if(error)return showBanner('Enregistrement impossible : '+error.message,'error');
  stgJoursCache=stgJoursCache.filter(j=>!(String(j.stagiaire_id)===String(row.stagiaire_id)&&String(j.jour)===String(row.jour)))
    .concat(data||[]);
  closeModal('modal-stg-jour-wrap');
  stgRenderJours();stgRenderCal();stgRender();
  showBanner('Jour enregistré ✅');
}

async function stgJourSupprimer(){
  if(!stgJourCourant)return;
  const j=stgJoursCache.find(x=>String(x.stagiaire_id)===String(stgJourCourant.stagiaire_id)
                              &&String(x.jour)===String(stgJourCourant.jour));
  if(!j){closeModal('modal-stg-jour-wrap');return;}
  if(!confirm('Retirer ce jour du calendrier ?\n\nPour garder la trace d\'une journée manquée, '
    +'préférez la marquer « absente ».'))return;
  const ok=await dbDelete('stagiaires_jours',j.id);
  if(!ok)return showBanner('Suppression impossible.','error');
  stgJoursCache=stgJoursCache.filter(x=>String(x.id)!==String(j.id));
  closeModal('modal-stg-jour-wrap');
  stgRenderJours();stgRenderCal();stgRender();
  showBanner('Jour retiré.');
}
