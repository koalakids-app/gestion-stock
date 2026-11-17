/* ---------- CALCUL DES ETP ET DE L'ENCADREMENT ----------
   Modèle « à remplir » (document d'établissement, une réponse par crèche, cf. TPL_ETABLISSEMENT).
   La directrice ou la direction saisit le nombre de professionnel·les (directrice comprise), leurs heures
   et leur qualification, l'amplitude d'ouverture et les temps de repas / entretien ; l'écran calcule en direct :
   1. les heures disponibles auprès des enfants, comparées aux heures à couvrir (taux d'encadrement) ;
   2. la même chose jour par jour (la directrice a ses jours d'absence) ;
   3. le minimum d'ETP de catégorie 1 (places ÷ 10, arrondi au demi-ETP), avant et après le 01/09/2027.
   Tout l'état tient dans un seul champ (etp_json) ; écran et PDF lisent le même calcul (etpCalc).
   Règles reprises du classeur de calcul validé avec la direction :
   - 0,5 ETP de direction = 17 h 30 / semaine (0,5 × 35 h), prises sur le temps de la directrice, hors enfants ;
   - le soutien de l'EJE (appui obligatoire à une directrice sans le diplôme requis) n'est compté ni en direction
     ni en encadrement par la PMI : simple information ;
   - avant le 01/09/2027 : EJE, auxiliaire de puériculture, IDE / puériculteur·trice et CAP AEPE de plus de
     2 ans d'expérience comptent en catégorie 1 ; ensuite seuls les diplômés d'État, ou une personne dont la
     VAE est engagée. À valider auprès de la PMI : l'outil est indicatif. */

const ETP_FIELDS=['creche','etp_date','etp_json'];
const ETP_JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
/* av = compte en catégorie 1 avant le 01/09/2027 ; ap = dès cette date (sans VAE) */
const ETP_QUAL=[
  {k:'cap2',l:'CAP AEPE, plus de 2 ans d’expérience',av:1,ap:0},
  {k:'cap',l:'CAP AEPE',av:0,ap:0},
  {k:'eje',l:'Éducateur·trice de jeunes enfants (EJE)',av:1,ap:1},
  {k:'ap',l:'Auxiliaire de puériculture',av:1,ap:1},
  {k:'ide',l:'Infirmier·ère ou puériculteur·trice',av:1,ap:1},
  {k:'autre',l:'Autre qualification',av:0,ap:0}
];
const ETP_MAX=9;
let ETP_ST=null;

function etpDefaut(cap){
  const pros=[];
  for(let i=0;i<ETP_MAX;i++)pros.push({q:'cap2',h:i===0?28:35,vae:0});
  return{nb:4,places:cap||12,ft:35,amp:11,jours:5,a2:11,ratio:6,dir:0.5,repas:2,eje:5,pres:[1,1,0,1,1],pros:pros};
}
function etpCharger(txt){
  const d=etpDefaut(0);
  let o=null;
  try{o=txt?JSON.parse(txt):null;}catch(e){o=null;}
  if(!o||typeof o!=='object')return d;
  const s=Object.assign({},d,o);
  s.pros=d.pros.map((p,i)=>Object.assign({},p,(o.pros&&o.pros[i])||{}));
  s.pres=d.pres.map((p,i)=>(o.pres&&o.pres[i]!=null)?(o.pres[i]?1:0):p);
  return s;
}

/* ----- Calcul : une seule fonction, utilisée par l'écran et par le PDF ----- */
function etpCalc(s){
  const n=Math.max(2,Math.min(ETP_MAX,Math.round(+s.nb||4)));
  const ft=+s.ft>0?+s.ft:35, jours=+s.jours>0?+s.jours:5;
  const places=+s.places>0?+s.places:0, ratio=+s.ratio>0?+s.ratio:6;
  const amp=+s.amp>0?+s.amp:0, a2=Math.min(+s.a2>=0?+s.a2:amp,amp);
  const eq=s.pros.slice(0,n);
  const qual=p=>ETP_QUAL.find(x=>x.k===p.q)||ETP_QUAL[0];
  const h0=Math.max(0,+eq[0].h||0);
  const dirH=Math.min(h0,Math.max(0,(+s.dir||0)*ft));   /* direction : prise sur la directrice */
  const rows=eq.map((p,i)=>{
    const h=Math.max(0,+p.h||0), q=qual(p);
    const dh=i===0?dirH:0;
    return{poste:i===0?'Directrice':'Professionnel·le '+i,qual:q.l,h:h,etp:h/ft,dir:dh,enf:h-dh,
           av:q.av?1:0,ap:(q.ap||p.vae)?1:0,vae:p.vae?1:0};
  });
  const hTot=rows.reduce((a,r)=>a+r.h,0);
  const repasH=Math.max(0,+s.repas||0)*jours;
  const dispo=hTot-dirH-repasH;
  const adultes=Math.ceil(places/ratio);
  const need=adultes*a2*jours+Math.max(0,amp-a2)*jours;
  const ecart=dispo-need;
  /* jour par jour : les autres professionnel·les se répartissent sur les jours d'ouverture ;
     la directrice n'est là que ses jours de présence, avec son temps hors direction */
  const pres=(s.pres||[]).slice(0,5).map(x=>x?1:0);
  while(pres.length<5)pres.push(1);
  const nbPres=pres.reduce((a,b)=>a+b,0);
  const autres=(hTot-h0)/jours;
  const dirEnf=nbPres?rows[0].enf/nbPres:0;
  const besoinJ=need/jours;
  const jour=pres.map(p=>{
    const a=autres, d=p?dirEnf:0, d2=a+d-(+s.repas||0);
    return{pres:p,autres:a,dirEnf:d,repas:+s.repas||0,dispo:d2,besoin:besoinJ,ecart:d2-besoinJ};
  });
  /* catégorie 1 */
  const min=Math.round(places/10*2)/2;
  const repasEtp=repasH/ft;
  const brutAv=rows.reduce((a,r)=>a+r.enf*r.av,0)/ft;
  const brutAp=rows.reduce((a,r)=>a+r.enf*r.ap,0)/ft;
  const netAv=Math.max(0,brutAv-repasEtp), netAp=Math.max(0,brutAp-repasEtp);
  return{n:n,ft:ft,jours:jours,rows:rows,hTot:hTot,dirH:dirH,repasH:repasH,dispo:dispo,adultes:adultes,need:need,
         ecart:ecart,jour:jour,min:min,repasEtp:repasEtp,brutAv:brutAv,brutAp:brutAp,netAv:netAv,netAp:netAp,
         ecartAv:netAv-min,ecartAp:netAp-min,etpTot:hTot/ft,dirEtp:dirH/ft};
}

/* ----- Formats ----- */
function etpNb(x,d){return(Math.round(x*Math.pow(10,d))/Math.pow(10,d)).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});}
function etpH(x){return etpNb(x,1)+' h';}
function etpSigne(x,d,u){const v=Math.abs(x)<0.05*(d?1:10)?0:x;return(v>0?'+':v<0?'−':'')+etpNb(Math.abs(v),d)+(u||'');}
function etpStatutH(e){return e>=-0.05?'Couvert':'Manque '+etpNb(-e,1)+' h';}
function etpStatutEtp(e){return e>=-0.005?'Conforme':'Manque '+etpNb(-e,1)+' ETP';}
function etpBadge(ok,txt){
  return`<span class="etp-b ${ok?'ok':'ko'}">${esc(txt)}</span>`;
}

/* ----- Lecture des champs de l'écran ----- */
function etpNum(id,def){
  const el=document.getElementById(id);if(!el)return def;
  const x=parseFloat(String(el.value).replace(',','.'));
  return isFinite(x)?x:def;
}
function etpLire(){
  const s=etpDefaut(0);
  s.nb=Math.max(2,Math.min(ETP_MAX,Math.round(etpNum('etp-nb',4))));
  s.places=etpNum('etp-places',12);s.ft=etpNum('etp-ft',35);s.amp=etpNum('etp-amp',11);
  s.jours=etpNum('etp-jours',5);s.a2=etpNum('etp-a2',s.amp);s.ratio=etpNum('etp-ratio',6);
  s.dir=etpNum('etp-dir',0.5);s.repas=etpNum('etp-repas',2);s.eje=etpNum('etp-eje',0);
  s.pres=ETP_JOURS.map((j,i)=>{const e=document.getElementById('etp-pres-'+i);return e&&e.checked?1:0;});
  s.pros=s.pros.map((p,i)=>{
    const q=document.getElementById('etp-q-'+i),h=document.getElementById('etp-h-'+i),v=document.getElementById('etp-vae-'+i);
    return{q:q?q.value:p.q,h:etpNum('etp-h-'+i,p.h),vae:v&&v.checked?1:0};
  });
  return s;
}

/* ----- Écran ----- */
const ETP_CSS=`<style>
.tpl.etp .etp-b{display:inline-block;padding:2px 9px;border-radius:999px;font-weight:700;font-size:12px}
.tpl.etp .etp-b.ok{background:#E3F4E8;color:#1F7A3D}
.tpl.etp .etp-b.ko{background:#FBE7E4;color:#B03A2E}
.tpl.etp table.ft td.n,.tpl.etp table.ft th.n{text-align:center}
.tpl.etp table.ft td.etp-ko{color:#B03A2E;font-weight:700}
.tpl.etp table.ft td.etp-ok{color:#1F7A3D;font-weight:700}
.tpl.etp table.ft input[type=number]{width:84px;text-align:center}
.tpl.etp .etp-pres{display:flex;flex-wrap:wrap;gap:4px 16px;margin:4px 0 12px}
.tpl.etp .etp-pres label{display:inline-flex;align-items:center;gap:5px;font-weight:500;cursor:pointer;margin:0}
.tpl.etp .etp-pres input{width:auto;margin:0}
</style>`;

function etpHypHtml(id,lab,val,step,hint){
  return`<div class="f"><label>${esc(lab)}</label><input type="number" step="${step||'any'}" min="0" id="${id}" value="${esc(val)}" oninput="etpSaisie()">`
    +(hint?`<p class="hint" style="font-size:12px;margin:3px 0 0">${esc(hint)}</p>`:'')+`</div>`;
}

TPL.calcul_etp={
 fields:ETP_FIELDS,
 large:true,
 html:v=>{
  ETP_ST=etpCharger(v.etp_json);
  const s=ETP_ST;
  const noms=(CRECHES||[]).map(c=>c.name);
  let nom=v.creche||(typeof PMS_CRECHE_FORCEE!=='undefined'?PMS_CRECHE_FORCEE:'')||'';
  if(!nom&&typeof PROF!=='undefined'&&PROF&&PROF.creche_id){
    const mine=(CRECHES||[]).find(c=>String(c.id)===String(PROF.creche_id));if(mine)nom=mine.name;
  }
  const lignes=ETP_ST.pros.map((p,i)=>`<tr id="etp-row-${i}"${i>=s.nb?' style="display:none"':''}>
    <td class="lab">${i===0?'Directrice':'Professionnel·le '+i}</td>
    <td><select id="etp-q-${i}" onchange="etpSaisie()">${ETP_QUAL.map(q=>`<option value="${q.k}"${p.q===q.k?' selected':''}>${esc(q.l)}</option>`).join('')}</select></td>
    <td class="n"><input type="number" step="any" min="0" id="etp-h-${i}" value="${esc(p.h)}" oninput="etpSaisie()"></td>
    <td class="n" id="etp-etp-${i}"></td>
    <td class="n"><input type="checkbox" id="etp-vae-${i}"${p.vae?' checked':''} style="width:auto" onchange="etpSaisie()"></td>
  </tr>`).join('');
  return`<div class="tpl etp">${FT_CSS}${ETP_CSS}
  <h3>Calcul des ETP et de l’encadrement</h3>
  <input type="hidden" id="ff_etp_json" value="${esc(v.etp_json)}">
  <div class="grid2">
    <div class="f"><label>Crèche</label><select id="ff_creche" onchange="etpCrecheChanged()"><option value=""></option>${noms.map(n=>`<option${nom===n?' selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="f"><label>Date</label>${inHtml('etp_date',v.etp_date||new Date().toISOString().slice(0,10),'date')}</div>
  </div>
  <p class="hint" style="font-size:13px;font-style:normal">Outil indicatif : à valider auprès de la PMI avant toute décision. Les cases se modifient ; les résultats se recalculent à chaque saisie.</p>

  <h3>1. L’équipe</h3>
  <div class="f"><label>Nombre de professionnel·les, directrice comprise</label>
    <select id="etp-nb" onchange="etpSaisie()" style="max-width:120px">${[2,3,4,5,6,7,8,9].map(n=>`<option${n===s.nb?' selected':''}>${n}</option>`).join('')}</select>
    <p class="hint" style="font-size:12px;margin:3px 0 0">4 = la directrice et 3 autres ; 5 = la directrice et 4 autres.</p></div>
  <div class="ftw"><table class="ft"><thead><tr><th>Poste</th><th>Qualification</th><th class="n">Heures par semaine</th><th class="n">ETP</th><th class="n">VAE engagée</th></tr></thead><tbody>${lignes}</tbody></table></div>
  <p class="hint" style="font-size:12.5px;margin:-6px 0 12px">Directrice : 28 h = 80 %, 35 h = temps plein. « VAE engagée » : la personne compte en catégorie 1 après le 01/09/2027 même sans le diplôme (à confirmer avec la PMI).</p>

  <h3>2. Fonctionnement de la crèche</h3>
  <div class="grid2">
    ${etpHypHtml('etp-places','Capacité autorisée (places)',s.places,1)}
    ${etpHypHtml('etp-amp','Amplitude d’ouverture (heures par jour)',s.amp,0.5,'Par exemple 7h30 à 18h30 = 11 h')}
  </div>
  <div class="grid2">
    ${etpHypHtml('etp-jours','Jours d’ouverture par semaine',s.jours,1)}
    ${etpHypHtml('etp-a2','Heures par jour avec 2 adultes nécessaires',s.a2,0.5,'Prudent : toute l’amplitude. À réduire si peu d’enfants en début et en fin de journée')}
  </div>
  <div class="grid2">
    ${etpHypHtml('etp-ratio','Nombre d’enfants par adulte',s.ratio,1,'Règle alternative : 1 adulte pour 6 enfants (1 pour 5 non-marcheurs, 1 pour 8 marcheurs)')}
    ${etpHypHtml('etp-repas','Repas + entretien (heures par jour)',s.repas,0.5,'Temps qui ne compte pas dans l’encadrement : à remplacer par les temps réels')}
  </div>
  <div class="grid2">
    ${etpHypHtml('etp-ft','Heures d’un temps plein par semaine',s.ft,0.5)}
    ${etpHypHtml('etp-dir','Temps de direction minimum (ETP)',s.dir,0.05,'0,5 ETP = 17 h 30 par semaine, hors enfants')}
  </div>
  <div class="f"><label>Jours de présence de la directrice</label>
    <div class="etp-pres">${ETP_JOURS.map((j,i)=>`<label><input type="checkbox" id="etp-pres-${i}"${s.pres[i]?' checked':''} onchange="etpSaisie()">${j}</label>`).join('')}</div></div>
  ${etpHypHtml('etp-eje','Soutien de l’EJE à la directrice (heures par semaine), pour information',s.eje,0.5,'Appui obligatoire pour une directrice sans le diplôme requis (au moins 20 h par an). Non compté par la PMI en direction ni en encadrement.')}

  <h3>3. Heures auprès des enfants (par semaine)</h3>
  <div id="etp-res-sem"></div>
  <h3>4. Jour par jour</h3>
  <div id="etp-res-jour"></div>
  <h3>5. Catégorie 1 (diplômés d’État ou assimilés)</h3>
  <div id="etp-res-cat"></div>
  <div class="txtbox" id="etp-notes"></div>
 </div>`;
 },
 mount:()=>{
  /* la capacité est reprise de la fiche de la crèche tant qu'elle n'a pas été retouchée à la main */
  const pl=document.getElementById('etp-places');
  if(pl){
    pl.dataset.auto=(ETP_ST&&ETP_ST.places&&ETP_ST.places!==12)?'':'1';
    pl.addEventListener('input',()=>{pl.dataset.auto='';});
  }
  etpCrecheChanged();
 },
 pdf:doc=>{
  const s=etpLire(), c=etpCalc(s);
  const g=id=>{const e=document.getElementById('ff_'+id);return e?String(e.value||'').trim():'';};
  const nom=g('creche');
  const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
  const W=182,M=14;let y=pdfLogo(doc,20);
  const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
  /* le signe moins typographique (U+2212) n'existe pas dans les polices standard du PDF */
  const mn=t=>String(t).replace(/\u2212/g,'-');
  const grid=(w,rows,o)=>pdfGrid(doc,M,y,w,rows.map(r=>({head:!!r.head,cells:r.cells.map(mn)})),o);
  const P=(t,size,bold,col)=>{
    doc.setFontSize(size||10);doc.setFont(undefined,bold?'bold':'normal');
    if(col)doc.setTextColor(col[0],col[1],col[2]);else doc.setTextColor(30);
    const L=doc.splitTextToSize(pdfSafe(mn(t)),W);need(L.length*4.8+3);
    doc.text(L,M,y+4);y+=L.length*4.8+3;doc.setTextColor(30);
  };
  const H=t=>{y+=2;P(t,11.5,true,[61,53,128]);};
  const wf=['Poste','Qualification','Heures / sem.','ETP','Cat. 1 avant / après 01/09/2027'];

  P('Calcul des ETP et de l’encadrement',15,true);
  P((nom?nom+' · ':'')+'Date : '+dfr(g('etp_date'))+' · '+c.n+' professionnel·les (directrice comprise) · '+etpNb(s.places,0)+' places',9.5);
  P('Outil indicatif, à valider auprès de la PMI.',8.5,false,[110,110,110]);

  H('1. L’équipe');
  y=grid([30,62,24,16,50],[{head:true,cells:wf}].concat(c.rows.map(r=>({cells:[
    r.poste,r.qual+(r.vae?' (VAE engagée)':''),etpNb(r.h,1),etpNb(r.etp,2),(r.av?'Oui':'Non')+' / '+(r.ap?'Oui':'Non')]})))
    .concat([{cells:['Total','',etpNb(c.hTot,1),etpNb(c.etpTot,2),'']}]),{fs:8.5,minH:7})+4;

  H('2. Fonctionnement retenu');
  P('Amplitude '+etpNb(s.amp,1)+' h par jour, '+etpNb(c.jours,0)+' jours par semaine ; 2 adultes nécessaires pendant '+etpNb(Math.min(s.a2,s.amp),1)
    +' h par jour (1 enfant par adulte : 1 pour '+etpNb(s.ratio,0)+') ; repas + entretien '+etpNb(s.repas,1)+' h par jour ; direction '
    +etpNb(s.dir,2)+' ETP ('+etpNb(c.dirH,1)+' h par semaine, prises sur la directrice) ; jours de présence de la directrice : '
    +(ETP_JOURS.filter((j,i)=>s.pres[i]).join(', ')||'aucun')+'.',9);

  H('3. Heures auprès des enfants (par semaine)');
  y=grid([120,62],[
    {head:true,cells:['Calcul','Heures par semaine']},
    {cells:['Heures de l’équipe',etpNb(c.hTot,1)]},
    {cells:['Moins : temps de direction','− '+etpNb(c.dirH,1)]},
    {cells:['Moins : repas + entretien','− '+etpNb(c.repasH,1)]},
    {cells:['Heures disponibles auprès des enfants',etpNb(c.dispo,1)]},
    {cells:['Heures à couvrir ('+c.adultes+' adulte'+(c.adultes>1?'s':'')+' en continu)',etpNb(c.need,1)]},
    {cells:['Écart : '+etpStatutH(c.ecart),etpSigne(c.ecart,1)]}
  ],{fs:8.5,minH:7})+4;

  H('4. Jour par jour');
  y=grid([62,24,24,24,24,24],[
    {head:true,cells:[''].concat(ETP_JOURS)},
    {cells:['Directrice présente'].concat(c.jour.map(j=>j.pres?'Oui':'Non'))},
    {cells:['Autres professionnel·les (h)'].concat(c.jour.map(j=>etpNb(j.autres,1)))},
    {cells:['Directrice auprès des enfants (h)'].concat(c.jour.map(j=>etpNb(j.dirEnf,1)))},
    {cells:['Moins : repas + entretien (h)'].concat(c.jour.map(j=>'− '+etpNb(j.repas,1)))},
    {cells:['Heures disponibles'].concat(c.jour.map(j=>etpNb(j.dispo,1)))},
    {cells:['Heures à couvrir'].concat(c.jour.map(j=>etpNb(j.besoin,1)))},
    {cells:['Écart'].concat(c.jour.map(j=>etpSigne(j.ecart,1)))}
  ],{fs:8,minH:7})+4;

  H('5. Catégorie 1 (diplômés d’État ou assimilés)');
  y=grid([90,46,46],[
    {head:true,cells:['','Avant le 01/09/2027','Dès le 01/09/2027']},
    {cells:['Minimum exigé (places ÷ 10, arrondi au 0,5), en ETP',etpNb(c.min,1),etpNb(c.min,1)]},
    {cells:['ETP de catégorie 1 auprès des enfants',etpNb(c.brutAv,2),etpNb(c.brutAp,2)]},
    {cells:['Moins : repas + entretien (ETP)','− '+etpNb(c.repasEtp,2),'− '+etpNb(c.repasEtp,2)]},
    {cells:['ETP de catégorie 1 nets',etpNb(c.netAv,2),etpNb(c.netAp,2)]},
    {cells:['Écart',etpSigne(c.ecartAv,2)+' ETP : '+etpStatutEtp(c.ecartAv),etpSigne(c.ecartAp,2)+' ETP : '+etpStatutEtp(c.ecartAp)]}
  ],{fs:8.5,minH:7})+4;

  H('À savoir');
  etpNotesTexte(s,c).forEach(t=>P('• '+t,8.5));
  pdfSortie(doc,slug(fillDoc.titre)+(nom?'_'+slug(nom):'')+'.pdf');
  return true;
 }
};
TPL_LABELS.calcul_etp='Calcul des ETP et de l’encadrement (établissement)';

function etpNotesTexte(s,c){
  return[
    'Direction : '+etpNb(s.dir,2)+' ETP = '+etpNb(s.dir*c.ft,1)+' h par semaine, quel que soit le temps de travail de la directrice. Le reste de son temps est auprès des enfants.',
    'Soutien de l’EJE ('+etpNb(s.eje,1)+' h par semaine) : appui obligatoire à une directrice sans le diplôme requis (au moins 20 h par an, dont 4 h par trimestre, en poste avant le 01/09/2026). La PMI ne le compte ni en direction ni en encadrement. Source : mcconsultcreche.fr, à vérifier sur Légifrance et auprès de la PMI.',
    'Catégorie 1 avant le 01/09/2027 : EJE, auxiliaires de puériculture, IDE et CAP AEPE de plus de 2 ans d’expérience. Après : seules les personnes diplômées d’État, ou dont la VAE est engagée (conditions à confirmer avec la PMI).',
    'Minimum de catégorie 1 : places ÷ 10 arrondi au demi-ETP (décret n° 2026-731 du 01/08/2026, application annoncée au 01/01/2027 par les sources consultées).',
    'Heures à couvrir : par prudence, 2 adultes pendant toute l’amplitude. Pauses, réunions et congés ne sont pas déduits.'
  ];
}

/* ----- Recalcul et affichage des résultats ----- */
function etpRender(){
  const s=etpLire(), c=etpCalc(s);
  ETP_ST=s;
  const hid=document.getElementById('ff_etp_json');
  if(hid)hid.value=JSON.stringify(s);
  /* lignes de l'équipe */
  for(let i=0;i<ETP_MAX;i++){
    const tr=document.getElementById('etp-row-'+i);
    if(tr)tr.style.display=i<c.n?'':'none';
    const e=document.getElementById('etp-etp-'+i);
    if(e)e.textContent=i<c.n?etpNb(c.rows[i].etp,2):'';
  }
  const ligne=(lab,val,cls)=>`<tr><td class="lab">${esc(lab)}</td><td class="n${cls?' '+cls:''}">${val}</td></tr>`;
  const sem=document.getElementById('etp-res-sem');
  if(sem)sem.innerHTML=`<div class="ftw"><table class="ft"><tbody>
    ${ligne('Heures de l’équipe ('+etpNb(c.etpTot,2)+' ETP)',etpH(c.hTot))}
    ${ligne('Moins : temps de direction','− '+etpH(c.dirH))}
    ${ligne('Moins : repas + entretien','− '+etpH(c.repasH))}
    ${ligne('Heures disponibles auprès des enfants','<b>'+etpH(c.dispo)+'</b>')}
    ${ligne('Heures à couvrir ('+c.adultes+' adulte'+(c.adultes>1?'s':'')+' en continu)',etpH(c.need))}
    ${ligne('Écart',etpSigne(c.ecart,1,' h')+' '+etpBadge(c.ecart>=-0.05,etpStatutH(c.ecart)))}
  </tbody></table></div>`;
  const jr=document.getElementById('etp-res-jour');
  if(jr)jr.innerHTML=`<div class="ftw"><table class="ft"><thead><tr><th></th>${ETP_JOURS.map(j=>`<th class="n">${j}</th>`).join('')}</tr></thead><tbody>
    <tr><td class="lab">Directrice présente</td>${c.jour.map(j=>`<td class="n">${j.pres?'Oui':'Non'}</td>`).join('')}</tr>
    <tr><td class="lab">Autres professionnel·les (h)</td>${c.jour.map(j=>`<td class="n">${etpNb(j.autres,1)}</td>`).join('')}</tr>
    <tr><td class="lab">Directrice auprès des enfants (h)</td>${c.jour.map(j=>`<td class="n">${etpNb(j.dirEnf,1)}</td>`).join('')}</tr>
    <tr><td class="lab">Moins : repas + entretien (h)</td>${c.jour.map(j=>`<td class="n">− ${etpNb(j.repas,1)}</td>`).join('')}</tr>
    <tr><td class="lab">Heures disponibles</td>${c.jour.map(j=>`<td class="n"><b>${etpNb(j.dispo,1)}</b></td>`).join('')}</tr>
    <tr><td class="lab">Heures à couvrir</td>${c.jour.map(j=>`<td class="n">${etpNb(j.besoin,1)}</td>`).join('')}</tr>
    <tr><td class="lab">Écart</td>${c.jour.map(j=>`<td class="n ${j.ecart>=-0.05?'etp-ok':'etp-ko'}">${etpSigne(j.ecart,1)}</td>`).join('')}</tr>
  </tbody></table></div>`;
  const ct=document.getElementById('etp-res-cat');
  if(ct)ct.innerHTML=`<div class="ftw"><table class="ft"><thead><tr><th></th><th class="n">Avant le 01/09/2027</th><th class="n">Dès le 01/09/2027</th></tr></thead><tbody>
    <tr><td class="lab">Minimum exigé (places ÷ 10, arrondi au 0,5), en ETP</td><td class="n">${etpNb(c.min,1)}</td><td class="n">${etpNb(c.min,1)}</td></tr>
    <tr><td class="lab">ETP de catégorie 1 auprès des enfants</td><td class="n">${etpNb(c.brutAv,2)}</td><td class="n">${etpNb(c.brutAp,2)}</td></tr>
    <tr><td class="lab">Moins : repas + entretien (ETP)</td><td class="n">− ${etpNb(c.repasEtp,2)}</td><td class="n">− ${etpNb(c.repasEtp,2)}</td></tr>
    <tr><td class="lab">ETP de catégorie 1 nets</td><td class="n"><b>${etpNb(c.netAv,2)}</b></td><td class="n"><b>${etpNb(c.netAp,2)}</b></td></tr>
    <tr><td class="lab">Écart</td><td class="n">${etpSigne(c.ecartAv,2)} ${etpBadge(c.ecartAv>=-0.005,etpStatutEtp(c.ecartAv))}</td><td class="n">${etpSigne(c.ecartAp,2)} ${etpBadge(c.ecartAp>=-0.005,etpStatutEtp(c.ecartAp))}</td></tr>
  </tbody></table></div>`;
  const nt=document.getElementById('etp-notes');
  if(nt)nt.innerHTML='<b>À savoir et à confirmer auprès de la PMI</b><ul>'+etpNotesTexte(s,c).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
}
/* appelée à chaque saisie : lecture des champs puis recalcul */
function etpSaisie(){etpRender();}

/* changement de crèche : reprend la capacité de la fiche tant qu'elle n'a pas été corrigée à la main */
function etpCrecheChanged(){
  const sel=document.getElementById('ff_creche'),pl=document.getElementById('etp-places');
  const c=sel&&sel.value?(CRECHES||[]).find(x=>x.name===sel.value):null;
  if(pl&&c&&c.capacity&&pl.dataset.auto==='1')pl.value=c.capacity;
  etpRender();
}
