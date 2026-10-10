
// ── Export direct ────────────────────────────────────────────────────────────
/* Plus de prévisualisation : au moment où l'on clique, la feuille hebdomadaire
   est déjà à l'écran, et le classeur reproduit fidèlement la feuille papier du
   réseau. Seul garde-fou conservé : une confirmation quand la semaine repose
   sur une PRÉVISION et non sur le planning réel — c'est le cas où l'on risque
   de commander des repas sur des présences supposées. */
async function exportPresenceHebdoExcel(){
  const ctx=_hebdoExportCtx;
  if(!ctx||!ctx.rows.length){showBanner('Rien à exporter pour cette semaine.','error');return;}
  if(ctx.source==='prevision'
     && !confirm('Cette semaine repose sur une PRÉVISION : le planning n’est pas encore importé.\n\n'
        +'Les présences exportées sont déduites des semaines précédentes, pas réelles.\n\nExporter quand même ?'))return;
  const sheets=hebdoBuildSheets(ctx);
  const nomFichier=hebdoFileName(ctx);
  if(typeof ExcelJS!=='undefined'){
    try{
      const wb=new ExcelJS.Workbook();
      wb.creator='Koala Kids';
      hebdoRemplirClasseur(wb,sheets);
      const buf=await wb.xlsx.writeBuffer();
      const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a=document.createElement('a');a.href=url;a.download=nomFichier;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},4000);
      showBanner('Export Excel téléchargé !');
      return;
    }catch(e){console.error('[Export hebdo] ExcelJS',e);}
  }
  // Repli sans mise en forme si ExcelJS n'a pas pu être chargé.
  const wb=XLSX.utils.book_new();
  sheets.forEach(function(s){XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(s.aoa),s.nom);});
  XLSX.writeFile(wb,nomFichier);
  showBanner('Export Excel téléchargé (sans mise en forme).');
}
window.exportPresenceHebdoExcel=exportPresenceHebdoExcel;

/* ══════════════════════════════════════════════════════════════════════════
   MENU DE LA SEMAINE (traiteur) — bandeau affiché sur Présences > Semaine

   Importé depuis le tableau Excel hebdomadaire du traiteur (un onglet par
   semaine, mise en page fixe repérée sur « TABLEAUX DES MENUS ») dans la
   table `menus_semaine`. Un seul menu pour tout le réseau (pas de colonne
   crèche), avec les 3 profils du traiteur — pas les 5 tranches d'âge de la
   fiche enfant : « Bébés − de 6 mois » (bb6), « Bébés 6-18 mois » (bb18),
   « Grands 18 mois-3 ans » (grand), mêmes catégories que le bon de commande
   (voir mcmLigne() plus bas).
   ═════════════════════════════════════════════════════════════════════════ */

const MENU_JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

/* Nettoie une cellule du tableau traiteur : espace superflu, et les
   placeholders en étoiles ("*******", utilisés par le traiteur pour dire
   « pas de plat alternatif ce jour-là ») deviennent une chaîne vide. */
function menusCell(v){
  const s=(v==null?'':String(v)).replace(/\s+/g,' ').trim();
  if(!s||/^\*+$/.test(s))return'';
  return s;
}
/* La conversion `cellDates:true` de SheetJS (numéro de série Excel -> objet
   Date JS) passe par le fuseau horaire de la machine qui lit le fichier, et
   souffre d'un bug d'arrondi connu de la librairie qui peut la faire
   retomber sur la veille selon ce fuseau (constaté avec Europe/Paris) — le
   lundi de la semaine retombait alors un dimanche, créant une semaine
   « fantôme » décalée d'un jour à côté de la bonne (doublons dans MCM >
   Menus). Un numéro de série Excel n'a lui-même aucun fuseau horaire : on
   lit donc le fichier SANS cellDates (menusParseWorkbook reçoit la cellule
   brute, valeur numérique + format) et on décode nous-mêmes le quantième
   avec XLSX.SSF.parse_date_code, qui fait une conversion arithmétique pure,
   fiable quel que soit le fuseau horaire du navigateur. */
function menusDateISO(cell){
  if(!cell)return null;
  if(cell.t==='n'&&typeof cell.v==='number'){
    const dc=XLSX.SSF.parse_date_code(cell.v);
    if(!dc)return null;
    return dc.y+'-'+String(dc.m).padStart(2,'0')+'-'+String(dc.d).padStart(2,'0');
  }
  // Filet de sécurité si la cellule arrive déjà convertie en Date (ne devrait
  // pas se produire, le classeur étant lu sans cellDates).
  const d=cell instanceof Date?cell:cell.v;
  if(!(d instanceof Date)||isNaN(d))return null;
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
}
/* Lit un classeur (un onglet = une semaine) et renvoie les lignes prêtes pour
   `menus_semaine`. Positions de cellules fixes, repérées sur le fichier
   traiteur (lignes Excel 1-indexées, ici en index 0 via header:1) :
     ligne 1 (idx0)  : numéro de semaine en G
     ligne 2 (idx1)  : date du lundi en F
     lignes 6-7 (idx5-6)   : Bébés -6 mois (légume, fruit)
     lignes 9-12 (idx8-11) : Bébés 6-18 mois (protéine, protéine alt, légume, fruit)
     ligne 13 (idx12)      : goûter Bébés 6-18 mois
     ligne 14 (idx13)      : thème du jour (facultatif, ex. « HALLOWEEN »)
     lignes 15-20 (idx14-19) : Grands (entrée, plat, plat alt, garniture, laitage, dessert)
     ligne 21 (idx20)      : goûter Grands
   Colonnes C à G (idx2 à idx6) = Lundi à Vendredi. */
function menusParseWorkbook(wb){
  const weeks=[];
  wb.SheetNames.forEach(function(sheetName){
    const sheet=wb.Sheets[sheetName];
    const aoa=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
    const row=function(i){return aoa[i]||[];};
    const dateDebut=menusDateISO(sheet[XLSX.utils.encode_cell({r:1,c:5})]);
    if(!dateDebut)return; // onglet illisible (pas la mise en page attendue) : ignoré silencieusement
    const semaineNum=parseInt(row(0)[6],10)||null;
    const jours=[];
    for(let j=0;j<5;j++){
      const col=2+j; // C..G
      jours.push({
        jour:j+1,
        theme:menusCell(row(13)[col]),
        bb6:[menusCell(row(5)[col]),menusCell(row(6)[col])].filter(Boolean),
        bb18:[menusCell(row(8)[col]),menusCell(row(9)[col]),menusCell(row(10)[col]),menusCell(row(11)[col])].filter(Boolean),
        bb18_gouter:menusCell(row(12)[col]),
        grand:[menusCell(row(14)[col]),menusCell(row(15)[col]),menusCell(row(16)[col]),menusCell(row(17)[col]),menusCell(row(18)[col]),menusCell(row(19)[col])].filter(Boolean),
        grand_gouter:menusCell(row(20)[col])
      });
    }
    weeks.push({date_debut:dateDebut,semaine_num:semaineNum,jours:jours});
  });
  return weeks;
}
async function handleImportMenusFile(event){
  const file=event.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      const data=new Uint8Array(e.target.result);
      const wb=XLSX.read(data,{type:'array'}); // pas de cellDates : voir menusDateISO
      const weeks=menusParseWorkbook(wb);
      if(!weeks.length){alert('Aucune semaine reconnue dans ce fichier — vérifiez qu\'il suit la mise en page habituelle du traiteur.');return;}
      const periodes=weeks.map(w=>'S'+(w.semaine_num||'?')+' ('+w.date_debut+')').join(', ');
      if(!confirm('Importer '+weeks.length+' semaine(s) de menu ? '+periodes+'\n\nLes menus déjà enregistrés pour ces semaines seront remplacés.'))return;
      /* Le fichier original (mise en page du traiteur) est conservé tel quel dans
         le bucket public `menus-repas`, pour pouvoir le rouvrir et l'imprimer plus
         tard (affichage aux familles) — indépendamment des données extraites
         ci-dessous, qui elles alimentent les bandeaux menu de l'appli. */
      let fichierPath=null,fichierNom=null;
      try{
        fichierNom=file.name;
        fichierPath=Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        const{error:upErr}=await sb.storage.from('menus-repas').upload(fichierPath,file,{contentType:file.type||undefined});
        if(upErr)throw upErr;
      }catch(err){
        console.warn('[Import menus] envoi du fichier original',err);
        fichierPath=null;fichierNom=null;
        showBanner('Menu importé, mais l\'original n\'a pas pu être conservé pour impression.','error');
      }
      const rows=[];
      weeks.forEach(function(w){
        w.jours.forEach(function(j){
          rows.push({
            date_debut:w.date_debut,semaine_num:w.semaine_num,jour:j.jour,theme:j.theme||null,
            bb6:j.bb6,bb18:j.bb18,bb18_gouter:j.bb18_gouter||null,
            grand:j.grand,grand_gouter:j.grand_gouter||null,
            fichier_path:fichierPath,fichier_nom:fichierNom,
            updated_at:new Date().toISOString()
          });
        });
      });
      const{error}=await sb.from('menus_semaine').upsert(rows,{onConflict:'date_debut,jour'});
      if(error)throw error;
      showBanner(weeks.length+' semaine(s) de menu importée(s) ✅');
      if(currentPresenceSlot==='hebdo')renderMenuSemaine();
      if(typeof mcmLoadMenusList==='function')mcmLoadMenusList();
      if(typeof mcmRenderAvis==='function'&&mcmActiveTab==='avis')mcmRenderAvis();
    }catch(err){console.error('[Import menus]',err);alert('Erreur pendant l\'import : '+(err.message||err));}
    finally{event.target.value='';}
  };
  reader.readAsArrayBuffer(file);
}
window.handleImportMenusFile=handleImportMenusFile;

/* Liste à puces des lignes d'un profil traiteur pour un jour donné (ou tiret si
   vide) — partagée entre le bandeau de la semaine et celui du jour. */
function menusLigneListe(arr){return(arr&&arr.length)?'<ul style="margin:2px 0 0;padding-left:16px">'+arr.map(function(t){return'<li>'+escHtml(t)+'</li>';}).join('')+'</ul>':'<span style="color:var(--muted)">—</span>';}
/* Lundi (date_debut de `menus_semaine`) de la semaine contenant `dateStr`
   (YYYY-MM-DD), pour retrouver la ligne du jour depuis n'importe quelle date
   sélectionnée dans l'onglet Jour (pas seulement le lundi affiché par
   weekStart(), qui suit la navigation de l'onglet Semaine). */
/* URL publique du fichier original (Excel/PDF) du traiteur, conservé dans le
   bucket `menus-repas` lors de l'import — permet de rouvrir et d'imprimer le
   menu tel qu'affiché aux familles, indépendamment des données extraites. */
function menusFichierUrl(path){return sb.storage.from('menus-repas').getPublicUrl(path).data.publicUrl;}
function menusMondayOf(dateStr){
  const d=new Date(dateStr+'T00:00:00');
  const day=d.getDay();
  const diff=d.getDate()-(day===0?6:day-1);
  return ipDateToLocalISO(new Date(d.getFullYear(),d.getMonth(),diff));
}

/* Bandeau menu de la semaine affichée, au-dessus de la grille de présence.
   Une carte par profil traiteur (Bébés -6 mois / Bébés 6-18 mois + goûter /
   Grands + goûter), une colonne par jour ouvré de la semaine en cours. */
async function renderMenuSemaine(){
  const zone=document.getElementById('menu-semaine-zone');
  if(!zone)return;
  const ws=weekStart();
  const dateDebut=ipDateToLocalISO(ws);
  let menu=null;
  try{
    const{data,error}=await sb.from('menus_semaine').select('*').eq('date_debut',dateDebut).order('jour');
    if(error)throw error;
    menu=(data&&data.length)?data:null;
  }catch(err){console.warn('[Menu semaine] lecture',err);}
  if(!menu){zone.innerHTML='';return;}
  const parJour={};menu.forEach(function(m){parJour[m.jour]=m;});
  function carte(titre,champ,gouterChamp){
    let html='<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 12px">'
      +'<div style="font-weight:800;color:var(--koala);font-size:12px;margin-bottom:6px">'+escHtml(titre)+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px">';
    for(let j=1;j<=5;j++){
      const m=parJour[j];
      html+='<div style="font-size:11px"><div style="font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:2px">'+MENU_JOURS[j-1]+'</div>'
        +menusLigneListe(m?m[champ]:null)
        +(gouterChamp&&m&&m[gouterChamp]?'<div style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--border);color:var(--koala-dark)"><i class="ti ti-cookie" style="font-size:11px"></i> '+escHtml(m[gouterChamp])+'</div>':'')
        +(m&&m.theme&&champ==='grand'?'<div style="margin-top:2px;font-style:italic;color:var(--orange-dark)">'+escHtml(m.theme)+'</div>':'')
        +'</div>';
    }
    html+='</div></div>';
    return html;
  }
  zone.innerHTML='<details style="border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:var(--koala-lightest,#F7F6FC)">'
    +'<summary style="cursor:pointer;font-weight:800;color:var(--koala-dark);font-size:13px"><i class="ti ti-tools-kitchen-2"></i> Menu de la semaine</summary>'
    +'<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">'
    +carte('Bébés − de 6 mois','bb6',null)
    +carte('Bébés 6-18 mois','bb18','bb18_gouter')
    +carte('Grands 18 mois-3 ans','grand','grand_gouter')
    +'</div></details>';
}
window.renderMenuSemaine=renderMenuSemaine;

/* Bandeau menu DU JOUR, au-dessus de la grille de présence journalière
   (onglet Jour). Même source (`menus_semaine`) que le bandeau de la semaine,
   mais une seule ligne (date_debut + jour déduits de la date sélectionnée
   dans #presence-date), affichée en 3 blocs côte à côte plutôt qu'en grille
   de 5 jours. Rien le week-end (le traiteur ne fournit pas de menu). */
async function renderMenuJour(){
  const zone=document.getElementById('menu-jour-zone');
  if(!zone)return;
  const dateStr=document.getElementById('presence-date')?.value||todayStr();
  const dow=new Date(dateStr+'T00:00:00').getDay(); // 0=dimanche … 6=samedi
  if(dow<1||dow>5){zone.innerHTML='';return;}
  let m=null;
  try{
    const{data,error}=await sb.from('menus_semaine').select('*').eq('date_debut',menusMondayOf(dateStr)).eq('jour',dow).maybeSingle();
    if(error)throw error;
    m=data||null;
  }catch(err){console.warn('[Menu jour] lecture',err);}
  if(!m){zone.innerHTML='';return;}
  function bloc(titre,champ,gouterChamp){
    return'<div style="flex:1;min-width:180px">'
      +'<div style="font-weight:800;color:var(--koala);font-size:11.5px;margin-bottom:4px">'+escHtml(titre)+'</div>'
      +menusLigneListe(m[champ])
      +(gouterChamp&&m[gouterChamp]?'<div style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--border);color:var(--koala-dark)"><i class="ti ti-cookie" style="font-size:11px"></i> '+escHtml(m[gouterChamp])+'</div>':'')
      +'</div>';
  }
  zone.innerHTML='<details open style="border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:var(--koala-lightest,#F7F6FC)">'
    +'<summary style="cursor:pointer;font-weight:800;color:var(--koala-dark);font-size:13px"><i class="ti ti-tools-kitchen-2"></i> Menu du jour'
    +(m.theme?' — <span style="color:var(--orange-dark)">'+escHtml(m.theme)+'</span>':'')+'</summary>'
    +'<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:11px">'
    +bloc('Bébés − de 6 mois','bb6',null)
    +bloc('Bébés 6-18 mois','bb18','bb18_gouter')
    +bloc('Grands 18 mois-3 ans','grand','grand_gouter')
    +'</div></details>';
}
window.renderMenuJour=renderMenuJour;

/* ══════════════════════════════════════════════════════════════════════════
   COMMANDE REPAS TRAITEUR (bon « Les mamans cuisinières du Monde »)

   Les lignes du bon ne sont pas les tranches d'âge de l'application (0-6 / 6-12 /
   12-18 / 18-24 / 24-36 mois) mais celles du traiteur : − 6 mois, 6-18 mois,
   + 18 mois, périscolaire 4/5 ans.
   Le remplissage part du CODE REPAS de l'enfant (BB / M / G), le même que la
   feuille de présence hebdomadaire et l'export Excel, pour que les deux documents
   ne puissent jamais s'écarter ; l'âge au jour de la livraison ne tranche que
   « − 6 mois » vs « 6-18 mois » et « + 18 mois » vs « périscolaire ».
   Les contrats étant gérés dans Gertrude, tout part des présences importées.
   ═════════════════════════════════════════════════════════════════════════ */

/* Bandeau de partenaires du pied de page du bon MCM (logos + mention du document),
   embarque en data-URI : le PDF doit rester autonome, sans appel reseau. */
/* En-tete officiel du bon (logo du traiteur), egalement embarque en data-URI. */
const MCM_ENTETE="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAxoAAAA5CAMAAACGTq1lAAADAFBMVEX////+//////7//5z//v///v7//v3//vz//fv//fr//Pn//Pj+/v3+/Pn+/Pj9/f37/Pz/+/f++/f++/X++vX/+vP++vT++vP6+/v++fP++fL++fH++PH++PD++O/+9+74+Pj1+Pvz9ffx8fHt8vbr7vPj6vL+9+3+9+z+9uz99uz+9ur99uv+9en99ej+9ef99Of99Ob98+T98uP98uL98uH88uL58OPp6er98d/98N798N3979z979v87tr87tn97dj87dj87df87db87NX869P86tH76tH86c/86c376Mz758v758r36Yr75sj75cb75MP748H74r/64b364bz64Lv64Ln637j63rb63bT63LL63LH527D52q752q352av52Kn52Kj516f51qT51aLf5e3Y4+3h4eD41qP41KDX2NXP3OnM1t3H0NjDxMWpwdj41J/4057405340pz40Zr40Jfr1Jj4z5X3zpL3zZH3zI/OzpP3zI73y4z2y4v3yovxzXP1yYf2yIX2x4P2xoHDxkv2xX/2xH32w3v2w3n2wnj1w3r1wnr1wnn1wnj1wXfCwZn1wHT1v3L1v3H1vnD1vW31vGv0vWz0u2nDwhb0umb0uWX0uGL0t2D0tl7ztVvztFnzs1jzs1bzslXzsVPzsFDyr0/zr03yrkzyrUryrEjyq0XyqkPyqUHxqD/xpz3xpzzxpjrxpTjxpDbxozTwojLwoTDwoS7woC3wnyvwninwnSfwnCTvnCTvmiDvmR7vmBzvlxrvlhfulhbulRXvlBPulBPukxHukg7ukQzukArtjwjtjgbtjgXtjQTtjQPtjQLtjALtjAHtjACgttCNqMl4nsFtlryvr7CoqGZnj7WVlHTtiwDtigDsigDtiQDsiQDtiADsiADthwDshwDshgBdibV9iIzshQDshADsgwDsggDrgwDrggBkg6fsgQDrgQDrgADrfwDrfgCSfVJbe5VHeqs8cqVnZ2U2bJ8rZp4gXpk3UoYNUJAoLnAADLsC2BjrAAAeOklEQVR42u18CVQVV7b2lvULggOINiIGkEExTeAhYi9A1NYAIYTFGESRCAGFCAEagR+woVkMjSR5xocCkUlABgcEZAzzFIIIOHCvAr+vygv1V0HV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";
const MCM_LOGOS="data:image/png;base64,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";
const MCM_ROWS=[
  {k:'bb6',  lbl:'Bébés - de 6 mois',    sub:'(sans lait, sans sel, sans féculent)', bg:'#FFFECF'},
  {k:'bb18', lbl:'Bébés (6 à 18 mois)',  sub:'',                                     bg:'#FFFECF'},
  {k:'grand',lbl:'Grands (+ de 18 mois)',sub:'',                                     bg:'#DEEAF6'},
  {k:'peri', lbl:'Périscolaire 4/5 ans', sub:'',                                     bg:'#E2EFDA'},
  {k:'temoin',lbl:'REPAS TEMOIN',        sub:'',                                     bg:'#D9D9D9'},
  {k:'gbb',  lbl:'Goûters Bébés',        sub:'(6 à 18 mois)',                        bg:'#FCE4D6'},
  {k:'ggr',  lbl:'Goûters Grands',       sub:'(+ de 18 mois & périscol)',            bg:'#FCE4D6'},
  {k:'bag',  lbl:'BAGUETTES TRADITION',  sub:'(crèche livrée le matin uniquement)',  bg:'#FFFFFF'}
];

/* Âge exact en mois révolus au jour donné (null si la date de naissance manque). */
function mcmAgeMois(dob,dateStr){
  if(!dob)return null;
  const d0=new Date(String(dob).slice(0,10)+'T00:00:00'),d1=new Date(dateStr+'T00:00:00');
  if(isNaN(d0)||isNaN(d1))return null;
  let m=(d1.getFullYear()-d0.getFullYear())*12+(d1.getMonth()-d0.getMonth());
  if(d1.getDate()<d0.getDate())m--;
  return m<0?null:m;
}
/* Ligne du bon traiteur pour un enfant, au jour de la livraison.

   C'est le CODE REPAS (BB / M / G) qui fait foi, pas l'âge brut : c'est lui qui
   s'affiche sur la feuille de présence et dans l'export Excel, et il est
   modifiable enfant par enfant sur sa fiche (`repas_base`). Faire dépendre le bon
   de commande du seul âge remettait un enfant « repas grand » dans la ligne
   « Bébés 6-18 mois » dès que son code avait été forcé — l'écran et le bon se
   contredisaient.

   L'âge ne sert plus qu'à départager les deux lignes que le code ne distingue
   pas : « − 6 mois » / « 6-18 mois » pour BB, et « + 18 mois » / « périscolaire
   4/5 ans » pour G. Sans date de naissance, on retient la ligne la plus courante
   (6-18 mois pour BB, + 18 mois pour G) plutôt que d'écarter l'enfant du bon. */
function mcmLigne(enf,dateStr){
  const code=enfRepasCode(enf);
  if(!code||code==='BIB')return null;
  const base=code.replace(/(SV|SPV|SPA)$/,'');
  const m=mcmAgeMois(enf.dob,dateStr);
  if(base==='BB')return(m!==null&&m<6)?'bb6':'bb18';
  if(base==='M')return'bb18';
  if(base==='G')return(m!==null&&m>=48)?'peri':'grand';
  return null;
}
/* « 6+1SV » : effectif standard, puis chaque régime particulier. */
function crFmtCell(c){
  const std=c['']||0;
  const spe=Object.keys(REGIMES).filter(function(r){return c[r];}).map(function(r){return c[r]+r;});
  if(!std&&!spe.length)return'';
  return spe.length?[String(std)].concat(spe).join('+'):String(std);
}
function crInfoKey(cid){return'cr_info_'+cid;}

/* ── TARIFS REPAS (direction) ─────────────────────────────────────────────────
   Grille de prix unitaires, commune aux 6 crèches, saisie une seule fois.
   Même principe que la config des frais IK : une ligne unique en base
   (`tarifs_repas_config`), doublée dans localStorage pour que l'écran reste
   chiffré même hors ligne ou si la table n'existe pas encore.
   Ces montants ne sortent JAMAIS sur le bon transmis au traiteur : le document
   MCM doit rester conforme à l'original. */
const TARIF_CFG_ID='00000000-0000-0000-0000-000000000001';
const TARIF_LS_KEY='tarifs_repas';
const TARIF_DEFAUT={bb6:0,bb18:0,grand:0,peri:0,temoin:0,gbb:0,ggr:0,bag:0,forfait_non_pointe:0};
let crTarifs=Object.assign({},TARIF_DEFAUT);

function crTarifsLocal(){
  try{return Object.assign({},TARIF_DEFAUT,JSON.parse(localStorage.getItem(TARIF_LS_KEY)||'{}'));}
  catch(e){return Object.assign({},TARIF_DEFAUT);}
}
async function crLoadTarifs(){
  crTarifs=crTarifsLocal();
  try{
    const{data,error}=await sb.from('tarifs_repas_config').select('config').eq('id',TARIF_CFG_ID).maybeSingle();
    if(error)throw error;
    if(data&&data.config){
      crTarifs=Object.assign({},TARIF_DEFAUT,data.config);
      try{localStorage.setItem(TARIF_LS_KEY,JSON.stringify(crTarifs));}catch(e){}
    }
  }catch(err){console.warn('[CommandeRepas] tarifs',err);}
  return crTarifs;
}
async function crSaveTarifs(){
  const cfg={};
  MCM_ROWS.forEach(function(r){
    const el=document.getElementById('cr-t-'+r.k);
    cfg[r.k]=el?(parseFloat(String(el.value).replace(',','.'))||0):0;
  });
  // Forfait « journée non pointée » (module Présences) : même config, montant unique.
  const fEl=document.getElementById('cr-t-forfait');
  cfg.forfait_non_pointe=fEl?(parseFloat(String(fEl.value).replace(',','.'))||0):(crTarifs.forfait_non_pointe||0);
  crTarifs=cfg;
  if(typeof prForfaitVal!=='undefined')prForfaitVal=cfg.forfait_non_pointe||0;
  try{localStorage.setItem(TARIF_LS_KEY,JSON.stringify(cfg));}catch(e){}
  crRenderCouts();
  try{
    const{error}=await sb.from('tarifs_repas_config')
      .upsert({id:TARIF_CFG_ID,config:cfg,updated_at:new Date().toISOString()},{onConflict:'id'});
    if(error)throw error;
    showBanner('Tarifs enregistrés ✅');
  }catch(err){
    console.warn('[CommandeRepas] tarifs',err);
    showBanner('Tarifs conservés sur cet appareil, mais non synchronisés.','error');
  }
}
function crToggleTarifs(){
  const p=document.getElementById('cr-tarifs-panel');
  if(!p)return;
  const ouvert=p.style.display==='none';
  p.style.display=ouvert?'':'none';
  document.getElementById('cr-tarifs-toggle-lbl').textContent=ouvert?'Masquer les tarifs':'Modifier les tarifs';
}
function crRenderTarifsGrid(){
  const g=document.getElementById('cr-tarifs-grid');
  if(!g)return;
  g.innerHTML=MCM_ROWS.map(function(r){
    return '<div class="fg" style="margin:0"><label class="flabel" style="font-size:11px">'+escHtml(r.lbl)+'</label>'
      +'<div style="display:flex;align-items:center;gap:6px">'
      +'<input class="finput" id="cr-t-'+r.k+'" type="number" min="0" step="0.01" value="'+(crTarifs[r.k]||0)+'" '
      +'style="text-align:right" oninput="crRenderCouts(true)"/><span style="font-size:12px;color:var(--muted)">€</span></div></div>';
  }).join('')
  +'<div class="fg" style="margin:0;grid-column:1/-1;border-top:1px solid var(--border);padding-top:8px"><label class="flabel" style="font-size:11px">Forfait journée non pointée (facturé aux familles, hors repas)</label>'
  +'<div style="display:flex;align-items:center;gap:6px;max-width:190px"><input class="finput" id="cr-t-forfait" type="number" min="0" step="0.01" value="'+(crTarifs.forfait_non_pointe||0)+'" style="text-align:right"/><span style="font-size:12px;color:var(--muted)">€ / jour</span></div>'
  +'<div style="font-size:11px;color:var(--muted);margin-top:3px">Jour de contrat sans pointage d’arrivée ou de départ. Un montant unique pour les 6 crèches.</div></div>';
}

/* Quantité facturable d'une case du bon.
   « 6+1SV » = 7 prestations (le régime ne change pas le nombre de repas),
   « OUI » du repas témoin = 1 prestation, case vide = 0. */
function crCellQty(v){
  const s=String(v||'').trim();
  if(!s)return 0;
  if(/^oui$/i.test(s))return 1;
  const nums=s.match(/\d+(?:[.,]\d+)?/g);
  if(!nums)return 0;
  return nums.reduce(function(a,n){return a+parseFloat(n.replace(',','.'));},0);
}
function crEuro(n){return (Math.round(n*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}

/* Récapitulatif chiffré : quantités de la semaine × prix unitaire.
   depuisTarifs=true quand l'appel vient de la saisie d'un prix (on ne relit pas la grille). */
function crRenderCouts(depuisTarifs){
  const wrap=document.getElementById('cr-cout-wrap');
  if(!wrap||!_hebdoExportCtx)return;
  if(depuisTarifs){
    MCM_ROWS.forEach(function(r){
      const el=document.getElementById('cr-t-'+r.k);
      if(el)crTarifs[r.k]=parseFloat(String(el.value).replace(',','.'))||0;
    });
  }
  const ctx=_hebdoExportCtx,vals=crReadVals();
  const JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
  const parJour=[0,0,0,0,0];
  let total=0,lignes='';
  MCM_ROWS.forEach(function(r){
    const pu=crTarifs[r.k]||0;
    const q=[0,1,2,3,4].map(function(i){return crCellQty(vals[r.k]&&vals[r.k][i]);});
    const qTot=q.reduce(function(a,b){return a+b;},0);
    if(!qTot&&!pu)return;                       // ligne sans quantité ni prix : inutile de l'afficher
    q.forEach(function(n,i){parJour[i]+=n*pu;});
    const sous=qTot*pu;total+=sous;
    lignes+='<tr><td style="padding:5px 8px;border-bottom:1px solid var(--line,#eee)">'+escHtml(r.lbl)+'</td>'
      +q.map(function(n){return '<td style="padding:5px 4px;text-align:center;border-bottom:1px solid var(--line,#eee);color:var(--muted)">'+(n||'—')+'</td>';}).join('')
      +'<td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--line,#eee);font-weight:600">'+qTot+'</td>'
      +'<td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--line,#eee);color:var(--muted)">'+(pu?crEuro(pu):'—')+'</td>'
      +'<td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--line,#eee);font-weight:700">'+crEuro(sous)+'</td></tr>';
  });
  const sansPrix=MCM_ROWS.some(function(r){
    return !(crTarifs[r.k]>0)&&[0,1,2,3,4].some(function(i){return crCellQty(vals[r.k]&&vals[r.k][i])>0;});
  });
  let h='<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:720px">'
    +'<thead><tr><th style="text-align:left;padding:5px 8px;font-size:11px;color:var(--muted)">Prestation</th>'
    +JOURS.map(function(j,i){return '<th style="padding:5px 4px;font-size:11px;color:var(--muted)">'+j+'<br><span style="font-weight:400">'+ctx.days5[i].toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+'</span></th>';}).join('')
    +'<th style="padding:5px 8px;text-align:right;font-size:11px;color:var(--muted)">Qté</th>'
    +'<th style="padding:5px 8px;text-align:right;font-size:11px;color:var(--muted)">P.U.</th>'
    +'<th style="padding:5px 8px;text-align:right;font-size:11px;color:var(--muted)">Total</th></tr></thead><tbody>';
  h+=lignes||'<tr><td colspan="9" style="padding:8px;color:var(--muted)">Aucune prestation chiffrable sur cette semaine.</td></tr>';
  h+='<tr><td style="padding:7px 8px;font-weight:700">Coût par jour</td>'
    +parJour.map(function(v){return '<td style="padding:7px 4px;text-align:center;font-weight:600">'+crEuro(v)+'</td>';}).join('')
    +'<td colspan="2"></td><td style="padding:7px 8px;text-align:right;font-weight:800;font-size:13.5px;color:var(--koala)">'+crEuro(total)+'</td></tr>';
  h+='</tbody></table>';
  if(sansPrix)h+='<div style="font-size:11.5px;color:var(--orange-dark);margin-top:8px"><i class="ti ti-alert-triangle"></i> Des prestations commandées n\'ont pas de tarif renseigné — le total est incomplet.</div>';
  wrap.innerHTML=h;
}
function isoWeekNum(d){
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7;
  t.setUTCDate(t.getUTCDate()+4-day);
  return Math.ceil(((t-new Date(Date.UTC(t.getUTCFullYear(),0,1)))/86400000+1)/7);
}

/* Commande déjà enregistrée pour cette crèche et cette semaine, s'il y en a une. */
let _crSaved=null;
let _crBaseKo=false;   // la base n'a pas répondu : l'écran doit le dire, pas faire comme si de rien n'était
let _crSaveErr='';     // dernier message d'erreur d'enregistrement, affiché tel quel

/* Trace locale de l'envoi. Filet de sécurité : si la table `commandes_repas`
   n'existe pas encore, ou si la base est injoignable au moment de l'envoi, la
   personne qui a transmis doit malgré tout revoir l'alerte en rouvrant la
   semaine sur le même appareil. */
function crEnvoiKey(cid,sem){return'cr_envoi_'+cid+'_'+sem;}
function crEnvoiLocal(cid,sem){
  try{return JSON.parse(localStorage.getItem(crEnvoiKey(cid,sem))||'null');}catch(e){return null;}
}

async function crLoadSaved(crecheId,semaineISO){
  _crBaseKo=false;
  let row=null;
  try{
    const{data,error}=await sb.from('commandes_repas').select('*')
      .eq('creche_id',crecheId).eq('semaine',semaineISO).maybeSingle();
    if(error)throw error;
    row=data||null;
  }catch(err){console.warn('[CommandeRepas] lecture',err);_crBaseKo=true;}

  /* Rien en base (table absente, enregistrement échoué, hors ligne) mais un envoi
     tracé ici : on reconstruit le minimum pour que l'alerte s'affiche quand même. */
  const loc=crEnvoiLocal(crecheId,semaineISO);
  if(loc&&loc.envoyee_le&&!(row&&row.envoyee_le)){
    row=Object.assign({},row||{},{
      envoyee_le:loc.envoyee_le,
      nb_envois:loc.nb_envois||1,
      infos:Object.assign({},(row&&row.infos)||{},{envoi_par:loc.envoi_par||'',envoi_at:loc.envoi_at||''}),
      _local:true
    });
  }
  return row;
}

async function crOpen(){
  if(!_hebdoExportCtx||!_hebdoExportCtx.rows.length){
    showBanner('Aucune présence ni prévision sur cette semaine — rien à commander.','error');return;
  }
  const ctx=_hebdoExportCtx;
  document.getElementById('cr-creche-name').textContent=ctx.crecheLbl;
  const creche=cacheCreches.find(function(c){return c.id===ctx.crecheId;})||{};
  _crSaved=await crLoadSaved(ctx.crecheId,ctx.dateStrs[0]);

  /* Coordonnées par défaut : celles enregistrées une fois pour toutes sur la
     fiche crèche (onglet Crèches). Une commande déjà brouillonnée sur cet
     appareil (localStorage) ou déjà enregistrée en base (_crSaved.infos)
     reste prioritaire, pour ne pas écraser une correction ponctuelle. */
  const nonEmpty=function(o){const r={};Object.keys(o||{}).forEach(function(k){if(o[k])r[k]=o[k];});return r;};
  const etab=(typeof cacheEtablissements!=='undefined'&&cacheEtablissements.find(function(x){return x.creche_id===ctx.crecheId;}))||{};
  let info={adresse:creche.addr||'',tel:etab.telephone||creche.repas_tel||'',mail:etab.email||creche.repas_mail||'',contact:creche.repas_contact||'',responsable:creche.repas_responsable||''};
  try{info=Object.assign(info,nonEmpty(JSON.parse(localStorage.getItem(crInfoKey(ctx.crecheId))||'{}')));}catch(e){}
  if(_crSaved&&_crSaved.infos)info=Object.assign(info,nonEmpty(_crSaved.infos));
  document.getElementById('cr-adresse').value=info.adresse||'';
  document.getElementById('cr-tel').value=info.tel||'';
  document.getElementById('cr-mail').value=info.mail||'';
  document.getElementById('cr-contact').value=info.contact||'';
  document.getElementById('cr-responsable').value=info.responsable||'';
  document.getElementById('cr-valid-date').value=todayStr();

  /* Une commande déjà transmise : on repart de ses chiffres, et le bon réédité
     coche « annule et remplace » avec la date du dernier envoi. */
  const dejaEnvoyee=!!(_crSaved&&_crSaved.envoyee_le);
  document.getElementById('cr-annule').checked=dejaEnvoyee;
  document.getElementById('cr-annule-date').style.display=dejaEnvoyee?'':'none';
  document.getElementById('cr-annule-date').value=dejaEnvoyee?_crSaved.envoyee_le:'';

  /* Le chiffrage est réservé à la direction : les directrices techniques gardent l'écran actuel. */
  const coutBloc=document.getElementById('cr-cout-bloc');
  if(coutBloc)coutBloc.style.display=isDirection?'':'none';
  if(isDirection){
    await crLoadTarifs();
    crRenderTarifsGrid();
  }

  if(_crSaved&&_crSaved.valeurs)crRenderTable(_crSaved.valeurs);
  else crCompute(false);
  crRenderSource();
  document.getElementById('modal-commande-wrap').classList.add('open');
}

/* Bandeau d'origine des chiffres : c'est ce qui dit à l'utilisateur s'il regarde
   du réel, une prévision, ou une commande déjà transmise. */
function crRenderSource(){
  const ctx=_hebdoExportCtx,box=document.getElementById('cr-source');
  if(!box||!ctx)return;
  const sem='Semaine du '+ctx.days5[0].toLocaleDateString('fr-FR')+' au '+ctx.days5[4].toLocaleDateString('fr-FR');
  const passee=ctx.dateStrs[4]<todayStr();
  let h='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px">';
  h+='<strong style="color:var(--koala)">'+sem+'</strong>';
  if(_crSaved){
    /* Deux informations de nature differente portaient le meme badge orange.
       « Deja transmise » appelle une verification avant de renvoyer : il reste
       en orange. « Brouillon enregistre » ne dit qu'une chose rassurante — la
       saisie est sauvegardee, rien n'est parti chez le traiteur — et n'a donc
       aucune raison d'alerter. */
    const transmise=!!_crSaved.envoyee_le;
    h+='<span style="border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;'
      +(transmise?'background:var(--orange-light);color:var(--orange-dark)':'background:#EEEDF8;color:#3D3580')+'">'
      +(transmise?'Déjà transmise le '+new Date(_crSaved.envoyee_le+'T00:00:00').toLocaleDateString('fr-FR')
        +(_crSaved.nb_envois>1?' · '+_crSaved.nb_envois+' envois':''):'Brouillon enregistré — rien n’est parti')+'</span>';
  }
  h+='<span style="border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;'
    +(ctx.source==='prevision'?'background:var(--orange-light);color:var(--orange-dark)':'background:var(--green-light);color:var(--green)')+'">'
    +(ctx.source==='prevision'?'Prévision d’après l’historique':'D’après le planning importé')+'</span>';
  if(passee)h+='<span style="border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;background:var(--red-light);color:var(--red)">Semaine déjà passée</span>';
  /* Une lecture en base qui échoue passait jusqu'ici totalement inaperçue : l'écran
     affichait « aucune commande » alors qu'il n'en savait rien. */
  if(_crBaseKo)h+='<span title="Table commandes_repas absente ou injoignable" style="border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;background:var(--red-light);color:var(--red)">⚠ Historique des commandes illisible</span>';
  h+='</div>';
  box.innerHTML=h;
  crRenderAlerte();
}

/* Date et heure de transmission, telles qu'enregistrées à l'envoi.
   `envoi_at` (horodatage précis) n'existe que sur les commandes envoyées depuis
   cette version ; sur les plus anciennes, on se rabat sur la seule date connue. */
function crEnvoiLabel(){
  const s=_crSaved;if(!s||!s.envoyee_le)return'';
  const at=s.infos&&s.infos.envoi_at?new Date(s.infos.envoi_at):null;
  if(at&&!isNaN(at)){
    return at.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
      +' à '+at.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  }
  return new Date(s.envoyee_le+'T00:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
}

/* Bandeau d'alerte en tête de la fenêtre : la commande de cette semaine est déjà
   partie. C'est l'information qui manque le plus souvent quand deux personnes
   travaillent sur la même semaine — d'où la date, l'heure, l'auteur et le nombre
   d'envois, plutôt qu'un simple « déjà transmise ». */
function crRenderAlerte(){
  const box=document.getElementById('cr-alerte');
  if(!box)return;
  const s=_crSaved;
  if(!s||!s.envoyee_le){box.style.display='none';box.innerHTML='';return;}
  const par=(s.infos&&s.infos.envoi_par)||'';
  const nb=s.nb_envois||1;
  box.style.display='';
  box.innerHTML='<div style="display:flex;gap:10px;align-items:flex-start;background:var(--orange-light);'
    +'border:1px solid var(--orange);color:var(--orange-dark);border-radius:10px;padding:11px 13px">'
    +'<i class="ti ti-bell-ringing" style="font-size:18px;flex-shrink:0;margin-top:1px"></i><div style="font-size:12.5px;line-height:1.55">'
    +'<strong>Commande déjà transmise au traiteur</strong> — le '+escHtml(crEnvoiLabel())
    +(par?' par '+escHtml(par):'')
    +(nb>1?' · '+nb+' envois pour cette semaine':'')+'.<br>'
    +'Un nouvel envoi ne s’ajoute pas : il <strong>annule et remplace</strong> le précédent. '
    +'Vérifiez les chiffres avant de renvoyer, et prévenez la direction si la modification est tardive.'
    +(s._local?'<br><span style="font-size:11.5px;opacity:0.85">Information lue sur cet appareil : l’envoi n’a pas pu être enregistré en base, les autres postes ne le verront pas.</span>':'')
    +'</div></div>';
}

/* Recalcule les cases depuis les présences. Repas du midi = enfant présent le matin
   (journée ou matin seul) ; goûter = enfant présent l'après-midi (journée ou aprèm seul).
   Les enfants au biberon (code repas BIB) sont exclus du bon : ni repas, ni goûter
   ne sont commandés pour eux, même s'ils sont bien présents ce jour-là. */
function crCompute(notify){
  const ctx=_hebdoExportCtx;
  if(!ctx)return;
  const vals={};
  MCM_ROWS.forEach(function(r){vals[r.k]=['','','','',''];});
  ctx.days5.forEach(function(d,i){
    const repas={bb6:{},bb18:{},grand:{},peri:{}},gouter={gbb:{},ggr:{}};
    ctx.rows.forEach(function(r){
      const cell=r.cells[i];
      if(!cell.present)return;
      if(cell.repas==='BIB')return;            // au biberon : rien à commander
      const t=mcmLigne(r.enfant,ctx.dateStrs[i]);
      if(!t)return;
      const reg=r.enfant.regime_repas||'';
      if(cell.slot==='j'||cell.slot==='m')repas[t][reg]=(repas[t][reg]||0)+1;
      if(cell.slot==='j'||cell.slot==='a'){
        /* Goûter forcé sur la fiche, sinon même ligne que le repas du même jour :
           l'âge est celui du jour de livraison (et non celui d'aujourd'hui) et la
           lettre forcée du repas est respectée, sans quoi un enfant pouvait être
           « Grand » au repas et « Bébé » au goûter. Aucun goûter avant 6 mois. */
        /* L'âge prime sur tout : un enfant de moins de 6 mois à la date de livraison
           n'a jamais de goûter, même avec un repas forcé (M, G) ou un goûter forcé
           sur la fiche. */
        const mois=mcmAgeMois(r.enfant.dob,ctx.dateStrs[i]);
        const g=(mois!==null&&mois<6)?null
          :(r.enfant.gouter_base||(t==='bb6'?null:(t==='bb18'?'gbb':'ggr')));
        /* Un goûter ne contient jamais de viande : la mention « SV » n'a pas de
           sens sur ces deux lignes et faisait apparaître un régime particulier
           là où le traiteur sert le goûter standard. L'enfant est donc compté
           dans l'effectif normal. SPV et SPA restent signalés : le lait et les
           produits laitiers, eux, sont bien présents au goûter. */
        const gReg=reg==='SV'?'':reg;
        if(g)gouter[g][gReg]=(gouter[g][gReg]||0)+1;
      }
    });
    ['bb6','bb18','grand','peri'].forEach(function(k){vals[k][i]=crFmtCell(repas[k]);});
    vals.gbb[i]=crFmtCell(gouter.gbb);
    vals.ggr[i]=crFmtCell(gouter.ggr);
    vals.temoin[i]='OUI';   // un plat témoin est prélevé chaque jour
    vals.bag[i]='';
  });
  crRenderTable(vals);
  // Les enfants au biberon sont volontairement hors du bon : les signaler comme
  // « manquants » serait un faux avertissement. Ne manquent vraiment que les
  // enfants sans aucun code repas (ni date de naissance, ni type forcé sur la fiche).
  const auBiberon=ctx.rows.filter(function(r){return enfRepasCode(r.enfant)==='BIB';});
  const sansCode=ctx.rows.filter(function(r){return !enfRepasCode(r.enfant);});
  const mentionBib=auBiberon.length?' · '+auBiberon.length+' enfant(s) au biberon exclu(s) du bon':'';
  if(sansCode.length){
    showBanner(sansCode.length+' enfant(s) sans code repas ne sont pas comptés — renseignez leur date de naissance ou leur type de repas.'+mentionBib,'error');
  }else if(notify){showBanner('Chiffres recalculés depuis les présences.'+mentionBib);}
}

function crRenderTable(vals){
  const ctx=_hebdoExportCtx;
  const JOURS=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI'];
  let h='<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:720px">';
  h+='<thead><tr><th style="width:210px"></th>';
  JOURS.forEach(function(j,i){
    h+='<th style="border:1px solid #999;padding:6px 4px;background:#fff;font-size:11px;font-weight:700;text-align:center">'+j
      +'<br><span style="font-weight:400;font-size:10px;color:var(--muted)">'+ctx.days5[i].toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+'</span></th>';
  });
  h+='</tr></thead><tbody>';
  MCM_ROWS.forEach(function(r){
    if(r.k==='gbb')h+='<tr><td colspan="6" style="height:10px;border:none"></td></tr>';
    if(r.k==='bag')h+='<tr><td colspan="6" style="height:10px;border:none"></td></tr>';
    h+='<tr><td style="border:1px solid #999;padding:6px 8px;background:'+r.bg+';font-size:11.5px;font-weight:600">'+escHtml(r.lbl)
      +(r.sub?'<br><span style="font-size:9.5px;font-weight:400;font-style:italic">'+escHtml(r.sub)+'</span>':'')+'</td>';
    for(let i=0;i<5;i++){
      h+='<td style="border:1px solid #999;padding:0;background:'+r.bg+'">'
        +'<input id="cr-c-'+r.k+'-'+i+'" value="'+escHtml((vals&&vals[r.k]&&vals[r.k][i])||'')+'" '
        +'style="width:100%;border:none;background:transparent;text-align:center;padding:9px 2px;font-size:13px;font-weight:700;color:#111;font-family:inherit;outline:none" oninput="crRenderCouts()"/></td>';
    }
    h+='</tr>';
  });
  h+='</tbody></table>';
  document.getElementById('cr-table-wrap').innerHTML=h;
  crRenderCouts();
}

function crReadVals(){
  const vals={};
  MCM_ROWS.forEach(function(r){
    vals[r.k]=[0,1,2,3,4].map(function(i){
      const el=document.getElementById('cr-c-'+r.k+'-'+i);
      return el?el.value.trim():'';
    });
  });
  return vals;
}

/* Construit le bon de commande au format du document MCM (fonction pure : aucun accès au DOM,
   ce qui permet de la tester et de la faire évoluer sans toucher à la génération du PDF).
   ctx  : contexte de la semaine (crecheLbl, days5)
   vals : { cle_de_ligne: [lundi..vendredi] } tels que saisis à l'écran
   info : { adresse, tel, mail, contact, responsable }
   opts : { annule, annuleDate, validDate, semNum, periode } */
function crBuildFormHtml(ctx,vals,info,opts){
  const fmtFr=function(s){return s?new Date(s+'T00:00:00').toLocaleDateString('fr-FR'):'';};
  const annule=opts.annule,annuleDate=opts.annuleDate,validDate=opts.validDate;
  const semNum=opts.semNum,per=opts.periode;
  const JOURS=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI'];
  const bd='1px solid #000';
  const rowsHtml=function(keys){
    return keys.map(function(k){
      const r=MCM_ROWS.find(function(x){return x.k===k;});
      return '<tr><td style="border:'+bd+';padding:17px 9px;background:'+r.bg+';font-size:11px;font-weight:bold;width:29%">'+escHtml(r.lbl)
        +(r.sub?'<br><span style="font-size:8.5px;font-weight:normal;font-style:italic">'+escHtml(r.sub)+'</span>':'')+'</td>'
        +[0,1,2,3,4].map(function(i){
          return '<td style="border:'+bd+';padding:17px 4px;background:'+r.bg+';text-align:center;font-size:13px;font-weight:bold">'+escHtml(vals[k][i]||'')+'</td>';
        }).join('')+'</tr>';
    }).join('');
  };
  /* Espace élastique : absorbe le vide restant pour que le bon occupe toute la
     hauteur de l'A4 comme l'original, et se réduit à zéro si le contenu déborde. */
  const gap='<div style="flex:1 1 auto;min-height:10px;max-height:40px"></div>';
  const headRow='<tr><td style="border:none"></td>'+JOURS.map(function(j){
    return '<td style="border:'+bd+';padding:5px 3px;text-align:center;font-size:10.5px;font-weight:bold;width:14.2%">'+j+'</td>';
  }).join('')+'</tr>';

  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>'
    +'*{margin:0;padding:0;box-sizing:border-box}'
    /* Page composée aux dimensions EXACTES d'une A4 à 96 dpi (794 × 1123 px).
       Le rapport largeur/hauteur est alors identique à celui du PDF, ce qui permet
       de poser l'image bord à bord sans marge ni déformation. */
    +'body{font-family:Arial,Helvetica,sans-serif;color:#000;width:794px;height:1123px;'
      +'padding:26px 30px;background:#fff;display:flex;flex-direction:column}'
    +'table{width:100%;border-collapse:collapse}'
    +'</style></head><body>'
    +'<img src="'+MCM_ENTETE+'" alt="" style="display:block;width:100%;margin-bottom:8px">'
    +'<div style="border:'+bd+';padding:9px;text-align:center;font-size:16px;margin-bottom:12px">COMMANDE REPAS CRECHE</div>'
    /* Proportions relevées sur le bon d'origine : cadre à 73,4 % de la largeur et
       centré, nom de la crèche démarrant à 37 % du cadre, MAIL à 55,7 %, et des
       interlignes larges (~32 px entre chaque ligne). */
    +'<div style="border:'+bd+';border-radius:14px;padding:20px 18px 12px;width:73.4%;margin:0 auto 12px">'
      +'<div style="font-size:15px;font-weight:bold;margin-bottom:13px">'
        +'<span style="display:inline-block;width:36.9%">CRECHE</span>'
        /* Le traiteur livre six sites qui portent tous un nom différent : le réseau
           est rappelé devant le nom de la crèche pour que le bon soit identifiable
           d'un coup d'œil, côté MCM comme dans nos propres archives. */
        +'<span style="color:#F47920;font-size:17px;letter-spacing:0.5px">KOALAKIDS</span>'
        +'<span style="color:#1F3864;font-size:17px;font-variant:small-caps"> '+escHtml(ctx.crecheLbl)+'</span></div>'
      +'<div style="font-size:10.5px;margin-bottom:19px">ADRESSE : '+escHtml(info.adresse)+'</div>'
      +'<div style="font-size:10.5px;margin-bottom:19px">'
        +'<span style="display:inline-block;width:55.7%">TEL : '+escHtml(info.tel)+'</span>'
        +'<span>MAIL : '+escHtml(info.mail)+'</span></div>'
      +'<div style="font-size:10.5px">Contact : '+escHtml(info.contact)+'</div>'
    +'</div>'
    +'<div style="font-size:10.5px;margin-bottom:7px">La commande des repas est à transmettre le <b>MARDI <u>avant 10h</u></b> de la semaine précédente de la livraison</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">'
      +'<span style="display:inline-block;width:17px;height:17px;border:1px solid #C00000">'+(annule?'<span style="font-size:13px;line-height:15px;padding-left:2px">✕</span>':'')+'</span>'
      +'<span style="font-size:10.5px">Annule et remplace la commande envoyée le : '+escHtml(fmtFr(annuleDate))+'</span>'
    +'</div>'
    +'<div style="border:'+bd+';background:#FDF2E9;padding:8px 12px;margin-bottom:12px">'
      +'<div style="font-size:10.5px;color:#C55A11;font-weight:bold;margin-bottom:4px">MCM ne produit pas de repas liés à une <span style="color:#C00000">allergie alimentaire</span> (œufs, lactose, fruits à coque, huile d’arachide…)</div>'
      /* Les deux colonnes de sigles sont indentées comme sur l'original : la 1re à
         44 px du bord du cadre, la 2de à 47 % de la largeur. L'indentation passe par
         une marge et non un padding : avec border-collapse, le padding d'un tableau
         est ignoré. */
      +'<table style="font-size:10px;margin:4px 0 0 32px;width:calc(100% - 32px)">'
        +'<tr>'
          +'<td style="width:44.2%;padding:2px 0;vertical-align:top"><b style="color:#C00000">SV</b> : <b>Sans Viande</b></td>'
          +'<td style="padding:2px 0;vertical-align:top"><b style="color:#C00000">SPV</b> : <b>Sans Protéine de Vache</b> <i style="font-size:8.5px">(intolérance uniquement)</i></td>'
        +'</tr><tr>'
          +'<td style="width:44.2%;padding:2px 0;vertical-align:top"><b style="color:#C00000">PN</b> : <b>Pique-nique</b></td>'
          +'<td style="padding:2px 0;vertical-align:top"><b style="color:#C00000">SPA</b> : <b>Sans Protéine Animale</b> <i style="font-size:8.5px">(intolérance uniquement)</i></td>'
        +'</tr></table>'
    +'</div>'
    +'<div style="text-align:center;font-size:14px;margin-bottom:9px">Semaine n°'+semNum+' du '+per+'</div>'
    +'<table>'+headRow+rowsHtml(['bb6','bb18','grand','peri','temoin'])+'</table>'
    +gap
    +'<table>'+rowsHtml(['gbb','ggr'])+'</table>'
    +gap
    +'<table>'+rowsHtml(['bag'])+'</table>'
    +gap
    +'<table><tr>'
      +'<td style="border:'+bd+';background:#EDEDE3;padding:12px 10px;width:42%;vertical-align:top">'
        +'<div style="text-align:center;font-size:11px;font-weight:bold;font-style:italic;margin-bottom:12px">Cadre réservé à MCM</div>'
        +'<div style="font-size:10.5px">DATE et HEURE DE RECEPTION :</div></td>'
      +'<td style="border:'+bd+';padding:12px 10px;vertical-align:top">'
        +'<div style="text-align:center;font-size:11px;font-weight:bold">VALIDATION DE LA CRECHE</div>'
        +'<div style="text-align:center;font-size:9.5px;font-style:italic;margin-bottom:10px">Tampon, Signature</div>'
        +'<div style="font-size:10.5px;margin-bottom:16px"><i>Date : </i>'+escHtml(fmtFr(validDate))+'</div>'
        +'<div style="font-size:10.5px"><i>Nom de la Responsable : </i>'+escHtml(info.responsable)+'</div></td>'
    +'</tr></table>'
    +'<img src="'+MCM_LOGOS+'" alt="" style="display:block;width:100%;margin-top:8px">'
    +'</body></html>';
}

/* Enregistre la commande (une ligne par crèche et par semaine livrée).
   envoi=true marque une transmission : c'est cette date que le bon réédité
   reprendra dans « Annule et remplace la commande envoyée le … ». */
async function crSave(envoi){
  const ctx=_hebdoExportCtx;
  if(!ctx)return false;
  const infos={
    adresse:document.getElementById('cr-adresse').value.trim(),
    tel:document.getElementById('cr-tel').value.trim(),
    mail:document.getElementById('cr-mail').value.trim(),
    contact:document.getElementById('cr-contact').value.trim(),
    responsable:document.getElementById('cr-responsable').value.trim()
  };
  try{localStorage.setItem(crInfoKey(ctx.crecheId),JSON.stringify(infos));}catch(e){}
  /* Coordonnées saisies ici et absentes de la fiche crèche : on les y mémorise,
     pour qu'elles soient pré-remplies la prochaine fois sur tous les postes.
     Une valeur déjà présente sur la fiche n'est jamais écrasée. */
  try{
    const cr=cacheCreches.find(function(c){return c.id===ctx.crecheId;});
    if(cr){
      const maj={};
      [['repas_tel','tel'],['repas_mail','mail'],['repas_contact','contact'],['repas_responsable','responsable']].forEach(function(p){
        if(!cr[p[0]]&&infos[p[1]])maj[p[0]]=infos[p[1]];
      });
      if(Object.keys(maj).length){await dbUpdate('creches',cr.id,maj);Object.assign(cr,maj);}
    }
  }catch(e){console.warn('[CommandeRepas] fiche crèche',e);}
  const row={
    creche_id:ctx.crecheId,
    semaine:ctx.dateStrs[0],
    valeurs:crReadVals(),
    infos:infos,
    updated_at:new Date().toISOString()
  };
  if(envoi){
    row.envoyee_le=todayStr();
    row.nb_envois=((_crSaved&&_crSaved.nb_envois)||0)+1;
    /* Qui a transmis, et quand exactement. Rangé dans `infos` (jsonb déjà existant)
       pour ne pas dépendre d'une migration de la table : l'envoi ne doit jamais
       échouer parce qu'une colonne manque. */
    infos.envoi_par=(currentProfile&&currentProfile.name)||(currentUser&&currentUser.email)||'';
    infos.envoi_at=new Date().toISOString();
    row.infos=infos;
    /* Tracé localement AVANT l'écriture en base : c'est justement quand la base
       échoue que cette trace sert. */
    try{localStorage.setItem(crEnvoiKey(ctx.crecheId,ctx.dateStrs[0]),JSON.stringify({
      envoyee_le:row.envoyee_le,nb_envois:row.nb_envois,envoi_par:infos.envoi_par,envoi_at:infos.envoi_at
    }));}catch(e){}
  }
  try{
    const{data,error}=await sb.from('commandes_repas')
      .upsert(row,{onConflict:'creche_id,semaine'}).select().single();
    if(error)throw error;
    _crSaved=data;
    return true;
  }catch(err){
    console.warn('[CommandeRepas] enregistrement',err);
    /* Le message de Postgres est conservé et affiché : un refus de RLS et une
       colonne manquante se soignent différemment, et personne ne va lire la
       console d'une tablette. */
    _crSaveErr=(err&&(err.message||err.hint||err.details))||'erreur inconnue';
    return false;
  }
}

async function crSaveOnly(){
  const ok=await crSave(false);
  showBanner(ok?'Commande enregistrée ✅':'Enregistrement impossible — '+_crSaveErr+'. Le PDF reste générable.',ok?'':'error');
  crRenderSource();
}

/* Lit l'écran : valeurs saisies, coordonnées et options du bon. */
function crCollect(){
  const ctx=_hebdoExportCtx;
  const semNum=isoWeekNum(ctx.days5[0]);
  return {
    vals:crReadVals(),
    info:{
      adresse:document.getElementById('cr-adresse').value.trim(),
      tel:document.getElementById('cr-tel').value.trim(),
      mail:document.getElementById('cr-mail').value.trim(),
      contact:document.getElementById('cr-contact').value.trim(),
      responsable:document.getElementById('cr-responsable').value.trim()
    },
    opts:{
      annule:document.getElementById('cr-annule').checked,
      annuleDate:document.getElementById('cr-annule-date').value,
      validDate:document.getElementById('cr-valid-date').value,
      semNum:semNum,
      periode:ctx.days5[0].toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'})
        +' au '+ctx.days5[4].toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'})
    }
  };
}

/* Produit le document jsPDF du bon. Partagé par le téléchargement et l'envoi par
   mail : les deux chemins produisent donc rigoureusement le même fichier. */
async function crMakePdf(c){
  const ctx=_hebdoExportCtx;
  const html=crBuildFormHtml(ctx,c.vals,c.info,c.opts);
  const old=document.getElementById('_pdf-frame-commande');
  if(old)old.remove();
  /* A4 à 96 dpi. L'iframe fait exactement cette taille et la capture est cadrée
     dessus explicitement : sans ces dimensions, html2canvas retient la hauteur de
     la fenêtre et le bon se retrouve tassé dans le haut de la page. */
  const A4W=794,A4H=1123;
  const iframe=document.createElement('iframe');
  iframe.id='_pdf-frame-commande';
  iframe.style.cssText='position:fixed;top:0;left:-10000px;width:'+A4W+'px;height:'+A4H+'px;border:none;background:#fff';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument;
  doc.open();doc.write(html);doc.close();
  await new Promise(function(r){setTimeout(r,450);});
  /* Garde-fou : si un texte inhabituellement long (nom de crèche, adresse) fait
     déborder la page, on capture la hauteur réelle plutôt que de couper le bas
     du bon — l'image sera simplement réduite pour tenir sur la feuille. */
  const capH=Math.max(A4H,doc.body.scrollHeight);
  const canvas=await html2canvas(doc.body,{
    scale:2,backgroundColor:'#ffffff',
    width:A4W,height:capH,windowWidth:A4W,windowHeight:capH,
    x:0,y:0,scrollX:0,scrollY:0
  });
  iframe.remove();

  const{jsPDF}=window.jspdf;
  const pdf=new jsPDF('p','mm','a4');
  /* Cas normal : la capture a le rapport exact d'une A4 et se pose bord à bord,
     le bon occupant toute la page comme le document d'origine. En cas de
     débordement, elle est réduite proportionnellement et centrée. */
  let pw=210,ph=210*(canvas.height/canvas.width);
  if(ph>297){pw=210*(297/ph);ph=297;}
  pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',(210-pw)/2,(297-ph)/2,pw,ph);
  return pdf;
}

function crPdfName(semNum){
  const slug=(_hebdoExportCtx.crecheLbl||'creche').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
  return 'commande_repas_'+slug+'_sem'+semNum+'.pdf';
}

async function crExportPdf(){
  const ctx=_hebdoExportCtx;
  if(!ctx)return;
  const btn=document.getElementById('cr-btn-pdf');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Génération…';
  try{
    const c=crCollect();
    /* On enregistre AVANT de produire le bon : si le stockage échoue, l'utilisateur
       est prévenu mais repart quand même avec son PDF.
       Enregistrement en BROUILLON (crSave(false)) : télécharger le bon n'est pas
       le transmettre. Seul « Envoyer au traiteur » marque la commande comme
       envoyée — sans quoi une simple édition du PDF cochait « annule et remplace »
       à la réouverture de la semaine, pour une commande jamais partie. */
    const saved=await crSave(false);
    const pdf=await crMakePdf(c);
    pdf.save(crPdfName(c.opts.semNum));
    closeModal('modal-commande-wrap');
    showBanner(saved?'Bon de commande généré et enregistré (brouillon) ✅'
                    :'Bon généré ✅ — mais l’enregistrement a échoué (table commandes_repas absente ?).',
               saved?'':'error');
  }catch(err){
    console.error('[CommandeRepas] PDF',err);
    showBanner('Impossible de générer le PDF.','error');
  }finally{
    btn.disabled=false;btn.innerHTML='<i class="ti ti-file-download"></i> Générer le PDF';
  }
}

/* ── Envoi du bon au traiteur ─────────────────────────────────────────────
   La commande est à transmettre le mardi avant 10h de la semaine précédant la
   livraison : on calcule cette échéance pour signaler un envoi hors délai. */
const MCM_MAIL='secretariat.mcm@cedis.fr';

function crDeadline(lundiLivraison){
  const d=new Date(lundiLivraison);
  d.setDate(d.getDate()-6);       // mardi de la semaine précédente
  d.setHours(10,0,0,0);
  return d;
}

function crOpenMail(){
  const ctx=_hebdoExportCtx;
  if(!ctx)return;
  const c=crCollect();
  document.getElementById('crm-to').value=MCM_MAIL;
  const copie=document.getElementById('crm-copie');
  const lblCopie=document.getElementById('crm-copie-label');
  if(c.info.mail){
    copie.checked=true;copie.disabled=false;
    lblCopie.textContent='Recevoir une copie sur '+c.info.mail;
    lblCopie.parentNode.style.display='';
  }else{
    copie.checked=false;copie.disabled=true;
    lblCopie.parentNode.style.display='none';
  }
  document.getElementById('crm-subject').value=
    'Commande repas — '+ctx.crecheLbl+' — semaine n°'+c.opts.semNum+' du '+c.opts.periode;
  document.getElementById('crm-msg').value=
    'Bonjour,\n\nVeuillez trouver ci-joint la commande de repas de la crèche '+ctx.crecheLbl
    +' pour la semaine n°'+c.opts.semNum+' du '+c.opts.periode+'.'
    +(c.opts.annule?'\n\nCette commande annule et remplace celle envoyée précédemment.':'')
    +'\n\nBonne réception,\n'+(c.info.responsable||'Koala Kids');

  /* Rappel dans la fenêtre d'envoi elle-même : c'est le dernier moment utile
     pour se rendre compte qu'une commande est déjà partie. */
  const deja=document.getElementById('crm-deja');
  if(_crSaved&&_crSaved.envoyee_le){
    const par=(_crSaved.infos&&_crSaved.infos.envoi_par)||'';
    deja.style.display='';
    deja.style.background='var(--orange-light)';
    deja.style.borderColor='var(--orange)';
    deja.style.color='var(--orange-dark)';
    deja.innerHTML='<i class="ti ti-bell-ringing" style="font-size:15px"></i> <strong>Déjà transmise</strong> le '
      +escHtml(crEnvoiLabel())+(par?' par '+escHtml(par):'')
      +' — ce nouvel envoi annulera et remplacera la commande précédente.';
  }else{deja.style.display='none';}

  const dl=crDeadline(ctx.days5[0]);
  const retard=new Date()>dl;
  const box=document.getElementById('crm-deadline');
  box.style.display='';
  box.className='info-box';
  box.style.background=retard?'var(--orange-light)':'var(--green-light)';
  box.style.borderColor=retard?'var(--orange)':'var(--green)';
  box.style.color=retard?'var(--orange-dark)':'var(--green)';
  box.innerHTML='<i class="ti ti-clock" style="font-size:15px"></i> '
    +(retard?'<strong>Hors délai</strong> — la commande était à transmettre avant le '
      :'Dans les délais — à transmettre avant le ')
    +dl.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'})+' à 10h.';

  const btn=document.getElementById('crm-send');
  btn.disabled=false;btn.innerHTML='<i class="ti ti-send"></i> Envoyer';
  document.getElementById('modal-cr-mail-wrap').classList.add('open');
}

async function crSendMail(){
  const ctx=_hebdoExportCtx;
  if(!ctx)return;
  const raw=document.getElementById('crm-to').value.trim();
  const to=raw.split(/[,;\s]+/).map(function(x){return x.trim();}).filter(Boolean);
  if(!to.length){showBanner('Saisissez au moins une adresse mail.','error');return;}
  const bad=to.filter(function(x){return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);});
  if(bad.length){showBanner('Adresse(s) invalide(s) : '+bad.join(', '),'error');return;}
  const c=crCollect();
  if(document.getElementById('crm-copie').checked&&c.info.mail&&to.indexOf(c.info.mail)<0)to.push(c.info.mail);

  const btn=document.getElementById('crm-send');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Génération du PDF…';
  try{
    const saved=await crSave(true);
    const pdf=await crMakePdf(c);
    const b64=pdf.output('datauristring').split(',')[1];
    btn.innerHTML='<i class="ti ti-loader"></i> Envoi en cours…';
    const ok=await callFn('send-planning',{
      to:to,
      subject:document.getElementById('crm-subject').value,
      message:document.getElementById('crm-msg').value,
      filename:crPdfName(c.opts.semNum),
      pdf_base64:b64
    });
    if(ok){
      closeModal('modal-cr-mail-wrap');
      closeModal('modal-commande-wrap');
      showBanner(saved
        ?'Commande envoyée à '+to.join(', ')+' ✅'
        :'Commande envoyée à '+to.join(', ')+' ✅ — mais NON enregistrée en base ('+_crSaveErr+') : les autres postes ne verront pas qu’elle est partie.',
        saved?'success':'error');
    }else{
      showBanner('Échec de l’envoi'+(_lastFnErr?' — '+_lastFnErr:'')+'. Vous pouvez générer le PDF et l’envoyer manuellement.','error');
      btn.disabled=false;btn.innerHTML='<i class="ti ti-send"></i> Envoyer';
    }
  }catch(err){
    console.error('[CommandeRepas] mail',err);
    showBanner('Erreur lors de la préparation du mail.','error');
    btn.disabled=false;btn.innerHTML='<i class="ti ti-send"></i> Envoyer';
  }
}
window.crOpen=crOpen;window.crCompute=crCompute;window.crExportPdf=crExportPdf;
