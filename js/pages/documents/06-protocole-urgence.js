/* ---------- PROTOCOLE URGENCE ET CONFINEMENT ----------
   Modèle « à remplir » : textes du protocole (urgence / confinement /
   conclusion), annexe 1 (sac rouge), annexe 2 (sac bleu), localisation,
   numéros utiles et fiche de contrôle périodique.
   Chaque crèche adapte son exemplaire : les trois textes, les introductions
   d'annexes, les rubriques et articles des sacs (ajout, suppression, nouveau
   libellé) et les lignes de contrôle sont modifiables. Toute la partie
   modifiable vit dans PU_ST, enregistrée en un seul champ (pu_json) ; un
   bouton « Revenir au modèle » restaure le contenu type.
   Formulaire d'établissement (cf. TPL_ETABLISSEMENT) : une réponse par crèche.
   Signatures : direction et référent(e) en pied de protocole + une signature
   par ligne de contrôle (repliée). Écran et PDF lisent le même état. */

/* [matériel, précisions, quantité par défaut] — une rubrique = {t, items} */
const PU_ROUGE=[
 {t:'Regroupement et sécurité',items:[
  ['Pochette de consignes','Protocole, plan, numéros utiles',''],
  ['Liste de présence du jour','À prendre sur la structure au départ','1'],
  ['Téléphone portable chargé','À prendre sur la structure au départ','1'],
  ['Stylo(s)','','']]},
 {t:'Visibilité et évacuation',items:[
  ['Gilets haute visibilité','Adultes',''],
  ['Corde d’évacuation','Avec poignées',''],
  ['Lampe torche + piles de rechange','Vérifier les DLU des piles',''],
  ['Sifflet','','']]},
 {t:'Premiers soins',items:[
  ['Trousse de premiers secours','Compresses, antiseptique, pansements, ciseaux, sparadrap, bandes','1'],
  ['Gants à usage unique','',''],
  ['Couvertures de survie','',''],
  ['Mouchoirs','',''],
  ['Traitements / PAI','Selon les enfants concernés','']]},
 {t:'Subsistance',items:[
  ['Bouteilles d’eau','Contrôle DLC',''],
  ['Gobelets','',''],
  ['Couches et lingettes','Quelques unités par tranche d’âge','']]},
 {t:'Spécifique à la structure',items:[['','',''],['','','']]}
];
const PU_BLEU=[
 {t:'Communication et information',items:[
  ['Liste de présence + fiches contacts familles','À prendre sur la structure','1'],
  ['Téléphone chargé + batterie externe','Mode silencieux',''],
  ['Radio à piles + piles de rechange','Écoute des consignes officielles','1'],
  ['Pochette de consignes + numéros utiles','','1']]},
 {t:'Mise en sécurité du lieu',items:[
  ['Ruban adhésif large','Calfeutrage si nécessaire',''],
  ['Ciseaux','','1'],
  ['Lampe torche + piles','Lumière discrète','']]},
 {t:'Alimentation et hydratation',items:[
  ['Eau en bouteilles','Contrôle DLC',''],
  ['Gobelets / biberons','',''],
  ['Lait infantile adapté','Selon l’âge des enfants – DLC',''],
  ['Collations longue conservation','Compotes, biscuits… sans allergènes ciblés – DLC','']]},
 {t:'Hygiène',items:[
  ['Couches (toutes tailles accueillies)','',''],
  ['Lingettes / gel hydroalcoolique','DLU',''],
  ['Sacs poubelle','',''],
  ['Pot / seau avec couvercle','Besoins des adultes et des plus grands','']]},
 {t:'Soins et confort',items:[
  ['Trousse de premiers secours','Contrôle DLU','1'],
  ['Traitements / PAI','Selon les enfants concernés',''],
  ['Couvertures de survie / plaids','',''],
  ['Livres, jeux calmes et silencieux','Pour apaiser et occuper','']]},
 {t:'Spécifique à la structure',items:[['','',''],['','','']]}
];
/* Textes types : une ligne par paragraphe ; « → » = consigne en gras,
   « - » = puce, « * » = note en petit. Les [crochets] sont à remplacer. */
const PU_TXT_DEF={
 u:[
  'Le sac « Urgence » répond aux besoins de sortie immédiate, rapide et sécuritaire. La sortie hors de l’enceinte de la structure implique nécessairement la prise de contact avec l’extérieur (cf. Fiche annexe 1 – ROUGE).',
  '→ On sort vite, de manière sécuritaire, en regroupant et en alertant',
  'Le signal sonore est spécifique : l’alarme incendie [préciser : boîtiers de déclenchement, emplacement…].',
  'Le protocole d’évacuation propre à la structure est consultable : [lieu ou support – ex. classeur sécurité, affichage, espace partagé].'].join('\n'),
 c:[
  'Le confinement est le fait de rester dans l’enceinte de la structure, dans la plus grande discrétion possible, en assurant une survie pendant un temps non défini.',
  'Le confinement s’anticipe par du matériel sécuritaire permettant de répondre aux besoins fondamentaux (cf. Fiche annexe 2 – BLEU).',
  '→ On se cache et on tient dans le temps',
  'Le signal sonore peut être de deux ordres :',
  '- En interne : [signal défini par la structure – ex. sifflet], signifiant un risque d’intrusion imminent.',
  '- En externe : une demande des forces de l’ordre par voie orale et/ou par SMS FR-ALERT.',
  'Le protocole de confinement propre à la structure est consultable : [lieu ou support].'].join('\n'),
 f:[
  'Les deux contenants ne servent pas à gérer les mêmes temporalités : leur contenu est donc pensé différemment.',
  'Afin de gérer au mieux ces situations « imprévues », la structure doit disposer des deux contenants DISTINCTS, chacun dans son lieu défini.',
  'Ils doivent être contrôlés : DLC* et DLU*, contenance et présence sur la structure.',
  'Chaque professionnel se doit d’être vigilant sur la connaissance du lieu des contenants.',
  '* DLC : Date Limite de Consommation  ·  DLU : Date Limite d’Utilisation'].join('\n'),
 ri:'Contenu léger et transportable, pensé pour une sortie rapide et la prise de contact avec l’extérieur. Quantités à ajuster selon la capacité d’accueil.',
 bi:'Contenu pensé pour tenir dans le temps, dans le calme et la discrétion, en répondant aux besoins fondamentaux des enfants et des adultes. Quantités à calculer selon la capacité d’accueil.'
};
const PU_TXT_LABELS={u:'Qu’est-ce que l’urgence ?',c:'Qu’est-ce que le confinement ?',f:'Conclusion'};
const PU_NB_CTRL=8;
const PU_NUMS=[['SAMU','15'],['Pompiers','18'],['Police / Gendarmerie','17'],['Numéro d’urgence européen','112'],['Urgence par SMS (sourds et malentendants)','114']];

const PU_FIELDS=['creche','pu_date','pu_version','pu_nb_enf','pu_nb_pro','pu_r_lieu','pu_b_lieu','pu_r_ref','pu_b_ref',
                 'pu_tel_dir','pu_tel_mairie','pu_tel_pmi','pu_freq','pu_json'];

/* ---------- état modifiable ---------- */
let PU_ST=null;
function puAnnexeDef(S){
  return S.map(s=>({t:s.t,items:s.items.map(i=>({m:i[0],p:i[1],q:i[2],c:false}))}));
}
function puDefaut(){
  const k=[];for(let i=1;i<=PU_NB_CTRL;i++)k.push({id:i,date:'',sac:'',prod:'',par:''});
  return {r:puAnnexeDef(PU_ROUGE),b:puAnnexeDef(PU_BLEU),k:k,txt:Object.assign({},PU_TXT_DEF)};
}
/* Les données enregistrées complètent le modèle : une clé absente reprend le texte type. */
function puCharger(json){
  const d=puDefaut();let s=null;
  try{s=json?JSON.parse(json):null;}catch(e){s=null;}
  if(s&&typeof s==='object'){
    if(Array.isArray(s.r))d.r=s.r;
    if(Array.isArray(s.b))d.b=s.b;
    if(Array.isArray(s.k)&&s.k.length)d.k=s.k;
    if(s.txt&&typeof s.txt==='object')Object.keys(PU_TXT_DEF).forEach(c=>{if(typeof s.txt[c]==='string')d.txt[c]=s.txt[c];});
  }
  return d;
}
/* Vide tant que rien n'a été touché : un formulaire intact reste « sans contenu ». */
function puSync(){
  const e=document.getElementById('ff_pu_json');if(!e||!PU_ST)return;
  const j=JSON.stringify(PU_ST);
  e.value=(j===JSON.stringify(puDefaut()))?'':j;
}
const puAn=p=>PU_ST[p];

/* ---------- annexes ---------- */
function puAnnexeHtml(p){
  const S=puAn(p);
  let h=`<div class="ftw"><table class="ft"><tr><th>Matériel</th><th>Précisions</th><th>Quantité</th><th>Présent</th><th></th></tr>`;
  S.forEach((s,si)=>{
    h+=`<tr><td class="cat" colspan="4"><input class="pu-sec" value="${esc(s.t)}" placeholder="Nom de la rubrique" oninput="puSetSec('${p}',${si},this.value)"></td>`
      +`<td class="cat x"><button type="button" class="pu-b" title="Supprimer la rubrique" onclick="puDelSec('${p}',${si})"><i class="ti ti-trash"></i></button></td></tr>`;
    s.items.forEach((it,ii)=>{
      h+=`<tr><td><input value="${esc(it.m)}" placeholder="Article" oninput="puSetItem('${p}',${si},${ii},'m',this.value)"></td>`
        +`<td><input value="${esc(it.p)}" oninput="puSetItem('${p}',${si},${ii},'p',this.value)"></td>`
        +`<td class="q"><input value="${esc(it.q)}" oninput="puSetItem('${p}',${si},${ii},'q',this.value)"></td>`
        +`<td class="c"><input type="checkbox"${it.c?' checked':''} onchange="puSetItem('${p}',${si},${ii},'c',this.checked)"></td>`
        +`<td class="x"><button type="button" class="pu-b" title="Supprimer l’article" onclick="puDelItem('${p}',${si},${ii})"><i class="ti ti-x"></i></button></td></tr>`;
    });
    h+=`<tr><td colspan="5"><button type="button" class="btn btn-g" onclick="puAddItem('${p}',${si})"><i class="ti ti-plus"></i> Ajouter un article</button></td></tr>`;
  });
  return h+`</table></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">
    <button type="button" class="btn btn-s" onclick="puAddSec('${p}')"><i class="ti ti-plus"></i> Ajouter une rubrique</button>
    <button type="button" class="btn btn-g" onclick="puResetAnnexe('${p}')"><i class="ti ti-restore"></i> Revenir au modèle</button>
   </div>`;
}
function puRenderAnnexe(p){
  const e=document.getElementById('pu-an-'+p);if(e)e.innerHTML=puAnnexeHtml(p);
  puSync();
}
function puSetSec(p,si,v){puAn(p)[si].t=v;puSync();}
function puSetItem(p,si,ii,k,v){puAn(p)[si].items[ii][k]=v;puSync();}
function puAddItem(p,si){puAn(p)[si].items.push({m:'',p:'',q:'',c:false});puRenderAnnexe(p);}
function puDelItem(p,si,ii){puAn(p)[si].items.splice(ii,1);puRenderAnnexe(p);}
function puAddSec(p){puAn(p).push({t:'',items:[{m:'',p:'',q:'',c:false}]});puRenderAnnexe(p);}
function puDelSec(p,si){
  if(!confirm('Supprimer cette rubrique et ses articles ?'))return;
  puAn(p).splice(si,1);puRenderAnnexe(p);
}
function puResetAnnexe(p){
  if(!confirm('Revenir à la liste type ? Les articles, quantités et coches saisis pour ce sac seront perdus.'))return;
  PU_ST[p]=puAnnexeDef(p==='r'?PU_ROUGE:PU_BLEU);puRenderAnnexe(p);
}

/* ---------- textes ---------- */
function puSetTxt(c,v){PU_ST.txt[c]=v;puSync();}
function puResetTxt(c){
  const e=document.getElementById('pu-t-'+c);
  PU_ST.txt[c]=PU_TXT_DEF[c];if(e)e.value=PU_TXT_DEF[c];puSync();
}
function puTxtHtml(c,rows){
  return `<textarea id="pu-t-${c}" rows="${rows}" oninput="puSetTxt('${c}',this.value)">${esc(PU_ST.txt[c])}</textarea>
   <button type="button" class="btn btn-g" style="margin:6px 0 14px" onclick="puResetTxt('${c}')"><i class="ti ti-restore"></i> Revenir au texte type</button>`;
}

/* ---------- fiche de contrôle ---------- */
function puCtlHtml(){
  return `<div class="ftw"><table class="ft">
    <tr><th style="width:130px">Date</th><th style="width:130px">Sac</th><th>Produits à renouveler (DLC / DLU)</th><th style="width:170px">Contrôlé par</th><th style="width:200px">Signature</th><th></th></tr>
    ${PU_ST.k.map(r=>`<tr>
      <td><input type="date" value="${esc(r.date)}" oninput="puSetCtl(${r.id},'date',this.value)"></td>
      <td><select onchange="puSetCtl(${r.id},'sac',this.value)">${['','U — Urgence','C — Confinement','U et C'].map(o=>`<option${r.sac===o?' selected':''}>${esc(o)}</option>`).join('')}</select></td>
      <td><input value="${esc(r.prod)}" oninput="puSetCtl(${r.id},'prod',this.value)"></td>
      <td><input value="${esc(r.par)}" oninput="puSetCtl(${r.id},'par',this.value)"></td>
      <td><details class="pu-sig" id="pu-sig-${r.id}"${SIGS['ctl'+r.id]?' open':''} ontoggle="puCtlToggle(${r.id})"><summary>${SIGS['ctl'+r.id]?'Signé ✓':'Signer'}</summary>${sigBoxHtml('ctl'+r.id,'Signature du contrôle')}</details></td>
      <td class="x"><button type="button" class="pu-b" title="Supprimer la ligne" onclick="puDelCtl(${r.id})"><i class="ti ti-x"></i></button></td>
    </tr>`).join('')}
  </table></div>
  <button type="button" class="btn btn-s" style="margin:0 0 14px" onclick="puAddCtl()"><i class="ti ti-plus"></i> Ajouter une ligne de contrôle</button>`;
}
function puRenderCtl(){
  const e=document.getElementById('pu-ctl');if(!e)return;
  e.innerHTML=puCtlHtml();puSync();
  requestAnimationFrame(()=>PU_ST.k.forEach(r=>{if(SIGS['ctl'+r.id])mountSig('ctl'+r.id);}));
}
function puSetCtl(id,k,v){const r=PU_ST.k.find(x=>x.id===id);if(r){r[k]=v;puSync();}}
function puAddCtl(){
  const id=PU_ST.k.reduce((m,r)=>Math.max(m,r.id),0)+1;
  PU_ST.k.push({id:id,date:'',sac:'',prod:'',par:''});puRenderCtl();
}
function puDelCtl(id){
  const r=PU_ST.k.find(x=>x.id===id);if(!r)return;
  if((r.date||r.prod||r.par||SIGS['ctl'+id])&&!confirm('Supprimer cette ligne de contrôle (et sa signature) ?'))return;
  PU_ST.k=PU_ST.k.filter(x=>x.id!==id);delete SIGS['ctl'+id];
  puRenderCtl();
}
function puCtlToggle(id){
  const d=document.getElementById('pu-sig-'+id);
  if(d&&d.open)requestAnimationFrame(()=>mountSig('ctl'+id));
}

const PU_CSS=`<style>
.tpl.pu .pu-bar{border-radius:10px 10px 0 0;color:#fff;padding:9px 14px;font-weight:700;font-size:14px;margin-top:6px}
.tpl.pu .pu-bar.r{background:#C0392B}.tpl.pu .pu-bar.b{background:#2E6DB4}
.tpl.pu .pu-bar small{display:block;font-weight:500;opacity:.92;font-size:12px}
.tpl.pu table.ft td.cat{background:#EEEDF8;color:var(--violet);font-weight:700;font-size:12px}
.tpl.pu table.ft td.q{width:92px}.tpl.pu table.ft td.c{width:64px;text-align:center}
.tpl.pu table.ft td.x{width:40px;text-align:center}
.tpl.pu table.ft td.c input{width:20px;height:20px;margin:0}
.tpl.pu table.ft td.q input,.tpl.pu table.ft input.pu-sec{width:100%}
.tpl.pu table.ft input.pu-sec{font-weight:700;background:transparent}
.tpl.pu .pu-b{border:0;background:transparent;color:#B03A2E;cursor:pointer;font-size:16px;padding:4px}
.tpl.pu textarea{width:100%;font-size:13px;line-height:1.55}
.tpl.pu .pu-sig summary{cursor:pointer;color:var(--violet);font-size:12.5px;font-weight:600}
</style>`;

TPL.protocole_urgence={
 fields:PU_FIELDS,
 large:true,
 html:v=>{
  PU_ST=puCharger(v.pu_json);
  return `<div class="tpl pu">${FT_CSS}${PU_CSS}
  <h3>Protocole : Urgence et Confinement</h3>
  <input type="hidden" id="ff_pu_json" value="${esc(v.pu_json)}">
  <div class="grid2">
    <div class="f"><label>Crèche</label>${selHtml('creche',['',...CRECHE_NOMS_COURTS],v.creche)}</div>
    <div class="f"><label>Date</label>${inHtml('pu_date',v.pu_date,'date')}</div>
  </div>
  <div class="grid2">
    <div class="f"><label>Protocole — N° / version</label>${inHtml('pu_version',v.pu_version)}</div>
    <div class="f"><label>Capacité d’accueil (enfants / professionnels)</label>
      <div style="display:flex;gap:8px"><input id="ff_pu_nb_enf" value="${esc(v.pu_nb_enf)}" placeholder="Enfants"><input id="ff_pu_nb_pro" value="${esc(v.pu_nb_pro)}" placeholder="Professionnels"></div></div>
  </div>
  <p class="hint" style="font-size:13px;font-style:normal">Tout le contenu ci-dessous est modifiable pour l’adapter à votre structure (textes, rubriques et articles des sacs, lignes de contrôle). Remplacez les passages entre [crochets]. Chaque bouton « Revenir au modèle » restaure le contenu type.</p>

  <h3>${esc(PU_TXT_LABELS.u)}</h3>
  ${puTxtHtml('u',8)}
  <h3>${esc(PU_TXT_LABELS.c)}</h3>
  ${puTxtHtml('c',11)}
  <h3>${esc(PU_TXT_LABELS.f)}</h3>
  ${puTxtHtml('f',8)}

  <div class="pu-bar r">Annexe 1 – Sac URGENCE<small>Contenant ROUGE · Sortie immédiate</small></div>
  <div class="txtbox" style="border-radius:0 0 10px 10px">
    ${puTxtHtml('ri',3)}
    <div class="f"><label>Lieu</label>${inHtml('pu_r_lieu',v.pu_r_lieu)}</div>
  </div>
  <div id="pu-an-r">${puAnnexeHtml('r')}</div>

  <div class="pu-bar b">Annexe 2 – Sac CONFINEMENT<small>Contenant BLEU · Durée indéterminée</small></div>
  <div class="txtbox" style="border-radius:0 0 10px 10px">
    ${puTxtHtml('bi',3)}
    <div class="f"><label>Lieu</label>${inHtml('pu_b_lieu',v.pu_b_lieu)}</div>
  </div>
  <div id="pu-an-b">${puAnnexeHtml('b')}</div>

  <h3>Localisation et contrôle des sacs</h3>
  <div class="ftw"><table class="ft">
    <tr><th>Contenant</th><th>Lieu de rangement</th><th>Référent(s)</th></tr>
    <tr><td class="lab">Sac URGENCE (rouge)</td><td><input id="ff_pu_r_lieu2" value="${esc(v.pu_r_lieu)}" placeholder="à préciser" oninput="document.getElementById('ff_pu_r_lieu').value=this.value"></td><td>${inHtml('pu_r_ref',v.pu_r_ref)}</td></tr>
    <tr><td class="lab">Sac CONFINEMENT (bleu)</td><td><input id="ff_pu_b_lieu2" value="${esc(v.pu_b_lieu)}" placeholder="à préciser" oninput="document.getElementById('ff_pu_b_lieu').value=this.value"></td><td>${inHtml('pu_b_ref',v.pu_b_ref)}</td></tr>
  </table></div>

  <h3>Numéros utiles</h3>
  <div class="txtbox">
    ${PU_NUMS.map(n=>`<b>${esc(n[0])} :</b> ${esc(n[1])}`).join('<br>')}
  </div>
  <div class="grid2">
    <div class="f"><label>Direction</label>${inHtml('pu_tel_dir',v.pu_tel_dir,'tel')}</div>
    <div class="f"><label>Mairie / gestionnaire</label>${inHtml('pu_tel_mairie',v.pu_tel_mairie,'tel')}</div>
  </div>
  <div class="f"><label>PMI / référent santé</label>${inHtml('pu_tel_pmi',v.pu_tel_pmi,'tel')}</div>

  <h3>Fiche de contrôle</h3>
  <div class="f"><label>Fréquence de contrôle</label>${selHtml('pu_freq',['','Mensuelle','Trimestrielle','Semestrielle','Annuelle'],v.pu_freq)}</div>
  <p class="hint" style="font-size:13px;font-style:normal">Vérifier la présence du sac à son emplacement, sa contenance, les DLC et DLU. U = sac Urgence · C = sac Confinement.</p>
  <div id="pu-ctl">${puCtlHtml()}</div>

  <h3>Validation du protocole</h3>
  <div class="grid2">
    ${sigBoxHtml('direction','Direction')}
    ${sigBoxHtml('referent','Référent(e) sécurité')}
  </div>
 </div>`;
 },
 mount:()=>{
  ['direction','referent'].forEach(mountSig);
  /* le lieu de rangement est saisi à deux endroits : on garde les deux alignés */
  ['r','b'].forEach(p=>{
    const a=document.getElementById('ff_pu_'+p+'_lieu'),b=document.getElementById('ff_pu_'+p+'_lieu2');
    if(a&&b)a.addEventListener('input',()=>{b.value=a.value;});
  });
  PU_ST.k.forEach(r=>{if(SIGS['ctl'+r.id])mountSig('ctl'+r.id);});
 },
 pdf:doc=>{
  const g=id=>{const e=document.getElementById('ff_'+id);return e?String(e.value||'').trim():'';};
  const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
  const dots=n=>'.'.repeat(n);
  const W=182,M=14;let y=pdfLogo(doc,20);
  const nom=g('creche');
  const enTete=()=>{ /* Date / Protocole en tête de chaque partie, comme dans l'original */
    doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(90);
    doc.text(pdfSafe('Date : '+(dfr(g('pu_date'))||dots(10))+'     Protocole N° / version : '+(g('pu_version')||dots(10))+(nom?'     Koala Kids '+nom:'')),M,y);
    doc.setTextColor(30);y+=7;
  };
  const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
  const P=(t,size,bold,x,col)=>{
    doc.setFontSize(size||10);doc.setFont(undefined,bold?'bold':'normal');
    if(col)doc.setTextColor(col[0],col[1],col[2]);
    const L=doc.splitTextToSize(pdfSafe(t),W-((x||M)-M));need(L.length*4.8+3);
    doc.text(L,x||M,y);y+=L.length*4.8+2.5;doc.setTextColor(30);
  };
  /* texte libre : une ligne saisie = un paragraphe ; → en gras, - en puce, * en petit */
  const bloc=txt=>String(txt||'').split(/\r?\n/).forEach(l=>{
    const t=l.trim();if(!t)return;
    if(t[0]==='→')P(t,10,true);
    else if(t[0]==='-')P(t,10,false,M+4);
    else if(t[0]==='*')P(t,8.5,false,M,[110,110,110]);
    else P(t,10);
  });
  const H=t=>{need(14);y+=2;P(t,11.5,true,M,[74,63,159]);};
  const val=(v,n)=>v||dots(n||30);
  const bar=(txt,sous,rgb)=>{
    need(30);
    doc.setFillColor(rgb[0],rgb[1],rgb[2]);doc.rect(M,y,W,12,'F');
    doc.setTextColor(255);doc.setFont(undefined,'bold');doc.setFontSize(13);doc.text(pdfSafe(txt),M+3,y+5.2);
    doc.setFont(undefined,'normal');doc.setFontSize(9);doc.text(pdfSafe(sous),M+3,y+10);
    doc.setTextColor(30);y+=16;
  };
  const box=(x,yy,on)=>{
    doc.setDrawColor(60);doc.setLineWidth(0.25);doc.rect(x,yy-3.2,3.6,3.6);
    if(on){doc.setLineWidth(0.5);doc.line(x+0.7,yy-2.5,x+2.9,yy-0.3);doc.line(x+2.9,yy-2.5,x+0.7,yy-0.3);doc.setLineWidth(0.25);}
  };
  const ligne=(cells,opt)=>{ /* cells: [mat,prec,qte,present(bool)] */
    const w=[58,68,28,28];
    doc.setFontSize(9);doc.setFont(undefined,opt&&opt.head?'bold':'normal');
    const wr=[0,1,2].map(i=>doc.splitTextToSize(pdfSafe(cells[i]||''),w[i]-4));
    const h=Math.max(8,Math.max(wr[0].length,wr[1].length,wr[2].length)*4.1+3.6);
    need(h);
    let x=M;
    for(let i=0;i<4;i++){
      if(opt&&opt.head){doc.setFillColor(238,237,248);doc.rect(x,y,w[i],h,'FD');}
      else{doc.setDrawColor(150);doc.rect(x,y,w[i],h);}
      if(i<3)doc.text(wr[i],x+2,y+5.2);
      x+=w[i];
    }
    if(opt&&opt.head)doc.text('Présent',M+W-14,y+5.2,{align:'center'});
    else box(M+W-14-1.8,y+h/2+1.6,!!cells[3]);
    y+=h;
  };
  const annexe=S=>{
    ligne(['Matériel','Précisions','Quantité'],{head:true});
    S.forEach(s=>{
      const items=s.items.filter(it=>String(it.m||'').trim());
      if(!items.length&&!String(s.t||'').trim())return;
      need(18);
      doc.setFillColor(246,246,251);doc.setDrawColor(150);doc.rect(M,y,W,7,'FD');
      doc.setFont(undefined,'bold');doc.setFontSize(9);doc.setTextColor(74,63,159);doc.text(pdfSafe(s.t||''),M+2,y+4.8);doc.setTextColor(30);y+=7;
      items.forEach(it=>ligne([it.m,it.p,it.q,it.c]));
    });
  };

  /* ---------- Protocole ---------- */
  doc.setFontSize(16);doc.setFont(undefined,'bold');
  doc.text('Protocole : Urgence et Confinement',M,y+2);y+=10;
  enTete();
  if(g('pu_nb_enf')||g('pu_nb_pro')){
    P('Capacité d’accueil : '+(g('pu_nb_enf')||dots(4))+' enfants / '+(g('pu_nb_pro')||dots(4))+' professionnels',9.5,false);
  }
  H('QU’EST-CE QUE L’URGENCE ?');bloc(PU_ST.txt.u);
  H('QU’EST-CE QUE LE CONFINEMENT ?');bloc(PU_ST.txt.c);
  H('CONCLUSION');bloc(PU_ST.txt.f);

  /* ---------- Annexe 1 ---------- */
  doc.addPage();y=pdfLogo(doc,20);
  bar('Annexe 1 – Sac URGENCE','Contenant ROUGE · Sortie immédiate · Lieu : '+val(g('pu_r_lieu'),25),[192,57,43]);
  enTete();
  P(PU_ST.txt.ri,9.5);
  y+=1;annexe(PU_ST.r);

  /* ---------- Annexe 2 ---------- */
  doc.addPage();y=pdfLogo(doc,20);
  bar('Annexe 2 – Sac CONFINEMENT','Contenant BLEU · Durée indéterminée · Lieu : '+val(g('pu_b_lieu'),25),[46,109,180]);
  enTete();
  P(PU_ST.txt.bi,9.5);
  y+=1;annexe(PU_ST.b);

  /* ---------- Localisation et contrôle ---------- */
  doc.addPage();y=pdfLogo(doc,20);
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text('Localisation et contrôle des sacs',M,y+2);y+=10;
  enTete();
  H('LOCALISATION ET RÉFÉRENTS');
  y=pdfGrid(doc,M,y,[56,70,56],[{head:true,cells:['Contenant','Lieu de rangement','Référent(s)']},
      ['Sac URGENCE (rouge)',g('pu_r_lieu'),g('pu_r_ref')],
      ['Sac CONFINEMENT (bleu)',g('pu_b_lieu'),g('pu_b_ref')]],{minH:9});
  y+=4;
  H('NUMÉROS UTILES');
  PU_NUMS.forEach(n=>P(n[0]+' : '+n[1],10));
  P('Direction : '+val(g('pu_tel_dir'),20));
  P('Mairie / gestionnaire : '+val(g('pu_tel_mairie'),20));
  P('PMI / référent santé : '+val(g('pu_tel_pmi'),20));
  H('FICHE DE CONTRÔLE');
  P('Fréquence de contrôle : '+val(g('pu_freq'),20)+'. Vérifier la présence du sac à son emplacement, sa contenance, les DLC et DLU.',9.5);
  y+=1;
  const cw=[24,26,60,34,38];
  const hd=['Date','Sac','Produits à renouveler (DLC / DLU)','Contrôlé par','Signature'];
  const enteteCtl=()=>{
    need(22);let x=M;doc.setFontSize(9);doc.setFont(undefined,'bold');
    hd.forEach((t,i)=>{doc.setFillColor(238,237,248);doc.rect(x,y,cw[i],8,'FD');doc.text(pdfSafe(t),x+cw[i]/2,y+5.3,{align:'center',maxWidth:cw[i]-2});x+=cw[i];});
    y+=8;
  };
  enteteCtl();
  PU_ST.k.forEach(r=>{
    if(y+14>278){doc.addPage();y=pdfLogo(doc,20);enteteCtl();}
    const cells=[dfr(r.date),String(r.sac||'').split(' ')[0],r.prod,r.par];
    let x=M;doc.setFont(undefined,'normal');doc.setFontSize(9);doc.setDrawColor(150);
    for(let c=0;c<5;c++){
      doc.rect(x,y,cw[c],14);
      if(c<4&&cells[c])doc.text(doc.splitTextToSize(pdfSafe(cells[c]),cw[c]-3).slice(0,3),x+1.5,y+4.6);
      if(c===4&&SIGS['ctl'+r.id]){try{doc.addImage(SIGS['ctl'+r.id],'PNG',x+1,y+1,cw[c]-2,12);}catch(e){}}
      x+=cw[c];
    }
    y+=14;
  });
  y+=6;
  need(52);
  doc.setFontSize(10);doc.setFont(undefined,'bold');doc.text('Validation du protocole',M,y);y+=5;
  [['direction','Direction',M],['referent','Référent(e) sécurité',M+96]].forEach(([role,lab,px])=>{
    doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(lab+' :',px,y+2);
    doc.setDrawColor(200);doc.rect(px,y+4,86,32);
    if(SIGS[role]){try{doc.addImage(SIGS[role],'PNG',px+2,y+6,82,28);}catch(e){}}
  });
  y+=40;
  pdfSortie(doc,slug(fillDoc.titre)+(nom?'_'+slug(nom):'')+'.pdf');
  return true;
 }
};
TPL_LABELS.protocole_urgence='Protocole urgence et confinement (établissement)';
