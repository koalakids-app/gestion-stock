/* ---------- PROTOCOLE URGENCE ET CONFINEMENT ----------
   Modèle « à remplir » : texte du protocole (urgence / confinement), annexe 1
   (sac rouge), annexe 2 (sac bleu), localisation, numéros utiles et fiche de
   contrôle périodique. Les mentions entre crochets du document d'origine sont
   des champs à saisir ; les quantités et la présence de chaque article se
   renseignent en ligne. Signatures : direction et référent(e) en pied de
   protocole, plus une signature par ligne de contrôle (repliée).
   Formulaire d'établissement (cf. TPL_ETABLISSEMENT) : une réponse par crèche.
   Le même jeu de champs alimente l'écran et le PDF. */

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
  ['Couches et lingettes','Quelques unités par tranche d’âge','']]}
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
  ['Livres, jeux calmes et silencieux','Pour apaiser et occuper','']]}
];
const PU_NB_CTRL=8;
const PU_NB_SPEC=2;
const PU_NUMS=[['SAMU','15'],['Pompiers','18'],['Police / Gendarmerie','17'],['Numéro d’urgence européen','112'],['Urgence par SMS (sourds et malentendants)','114']];

/* Identifiants des champs d'une annexe : p = 'r' (rouge) ou 'b' (bleu) */
function puIds(p){
  const S=p==='r'?PU_ROUGE:PU_BLEU;let n=0;const o=[];
  S.forEach(s=>s.items.forEach(()=>{n++;o.push({q:'pu_'+p+n+'_q',c:'pu_'+p+n+'_p'});}));
  return o;
}
const PU_FIELDS=(function(){
  const f=['creche','pu_date','pu_version','pu_nb_enf','pu_nb_pro','pu_alarme','pu_evac_support','pu_signal_interne',
           'pu_confin_support','pu_r_lieu','pu_b_lieu','pu_r_ref','pu_b_ref','pu_tel_dir','pu_tel_mairie','pu_tel_pmi','pu_freq'];
  ['r','b'].forEach(p=>{
    puIds(p).forEach(o=>f.push(o.q,o.c));
    for(let i=1;i<=PU_NB_SPEC;i++)f.push('pu_'+p+'_s'+i+'_l','pu_'+p+'_s'+i+'_q','pu_'+p+'_s'+i+'_c');
  });
  for(let i=1;i<=PU_NB_CTRL;i++)f.push('pu_k'+i+'_date','pu_k'+i+'_sac','pu_k'+i+'_prod','pu_k'+i+'_par');
  return f;
})();

const PU_CSS=`<style>
.tpl.pu .pu-in{display:inline-block;width:auto;min-width:200px;max-width:100%;margin:2px 0;height:32px;font-size:13px}
.tpl.pu .pu-bar{border-radius:10px 10px 0 0;color:#fff;padding:9px 14px;font-weight:700;font-size:14px;margin-top:6px}
.tpl.pu .pu-bar.r{background:#C0392B}.tpl.pu .pu-bar.b{background:#2E6DB4}
.tpl.pu .pu-bar small{display:block;font-weight:500;opacity:.92;font-size:12px}
.tpl.pu table.ft td.cat{background:#EEEDF8;color:var(--violet);font-weight:700;font-size:12px}
.tpl.pu table.ft td.q{width:92px}.tpl.pu table.ft td.c{width:64px;text-align:center}
.tpl.pu table.ft td.c input{width:20px;height:20px;margin:0}
.tpl.pu table.ft td.q input{width:100%}
.tpl.pu .pu-sig summary{cursor:pointer;color:var(--violet);font-size:12.5px;font-weight:600}
.tpl.pu .pu-sig{margin:2px 0}
.tpl.pu .pu-arrow{font-weight:700;color:var(--violet)}
</style>`;

function puIn(id,v,ph,w){
  return `<input class="pu-in" id="ff_${id}" value="${esc(v)}" placeholder="${esc(ph||'')}"${w?` style="min-width:${w}px"`:''}>`;
}
function puAnnexeHtml(p,v){
  const S=p==='r'?PU_ROUGE:PU_BLEU;let n=0;
  let h=`<div class="ftw"><table class="ft"><tr><th>Matériel</th><th>Précisions</th><th>Quantité</th><th>Présent</th></tr>`;
  S.forEach(s=>{
    h+=`<tr><td class="cat" colspan="4">${esc(s.t)}</td></tr>`;
    s.items.forEach(it=>{
      n++;const q='pu_'+p+n+'_q',c='pu_'+p+n+'_p';
      const qv=(v[q]===''||v[q]==null)?it[2]:v[q];
      h+=`<tr><td class="lab">${esc(it[0])}</td><td>${esc(it[1])}</td>`
        +`<td class="q"><input id="ff_${q}" value="${esc(qv)}"></td>`
        +`<td class="c"><input type="checkbox" id="ff_${c}"${v[c]?' checked':''}></td></tr>`;
    });
  });
  h+=`<tr><td class="cat" colspan="4">Spécifique à la structure</td></tr>`;
  for(let i=1;i<=PU_NB_SPEC;i++){
    const l='pu_'+p+'_s'+i+'_l',q='pu_'+p+'_s'+i+'_q',c='pu_'+p+'_s'+i+'_c';
    h+=`<tr><td colspan="2"><input id="ff_${l}" value="${esc(v[l])}" placeholder="À compléter"></td>`
      +`<td class="q"><input id="ff_${q}" value="${esc(v[q])}"></td>`
      +`<td class="c"><input type="checkbox" id="ff_${c}"${v[c]?' checked':''}></td></tr>`;
  }
  return h+'</table></div>';
}
function puCtlToggle(i){
  const d=document.getElementById('pu-sig-'+i);
  if(d&&d.open)requestAnimationFrame(()=>mountSig('ctl'+i));
}

TPL.protocole_urgence={
 fields:PU_FIELDS,
 large:true,
 html:v=>`<div class="tpl pu">${FT_CSS}${PU_CSS}
  <h3>Protocole : Urgence et Confinement</h3>
  <div class="grid2">
    <div class="f"><label>Crèche</label>${selHtml('creche',['',...CRECHE_NOMS_COURTS],v.creche)}</div>
    <div class="f"><label>Date</label>${inHtml('pu_date',v.pu_date,'date')}</div>
  </div>
  <div class="grid2">
    <div class="f"><label>Protocole — N° / version</label>${inHtml('pu_version',v.pu_version)}</div>
    <div class="f"><label>Capacité d’accueil (enfants / professionnels)</label>
      <div style="display:flex;gap:8px"><input id="ff_pu_nb_enf" value="${esc(v.pu_nb_enf)}" placeholder="Enfants"><input id="ff_pu_nb_pro" value="${esc(v.pu_nb_pro)}" placeholder="Professionnels"></div></div>
  </div>

  <h3>Qu’est-ce que l’urgence ?</h3>
  <div class="txtbox">
    Le sac « Urgence » répond aux besoins de sortie immédiate, rapide et sécuritaire. La sortie hors de l’enceinte de la structure implique nécessairement la prise de contact avec l’extérieur (cf. Fiche annexe 1 – ROUGE).<br>
    <span class="pu-arrow">→ On sort vite, de manière sécuritaire, en regroupant et en alertant</span><br><br>
    Le signal sonore est spécifique : l’alarme incendie — ${puIn('pu_alarme',v.pu_alarme,'boîtiers de déclenchement, emplacement…',260)}<br>
    Le protocole d’évacuation propre à la structure est consultable : ${puIn('pu_evac_support',v.pu_evac_support,'lieu ou support (classeur sécurité, affichage, espace partagé)',300)}
  </div>

  <h3>Qu’est-ce que le confinement ?</h3>
  <div class="txtbox">
    Le confinement est le fait de rester dans l’enceinte de la structure, dans la plus grande discrétion possible, en assurant une survie pendant un temps non défini.<br>
    Le confinement s’anticipe par du matériel sécuritaire permettant de répondre aux besoins fondamentaux (cf. Fiche annexe 2 – BLEU).<br>
    <span class="pu-arrow">→ On se cache et on tient dans le temps</span><br><br>
    <b>Le signal sonore peut être de deux ordres :</b>
    <ul>
      <li>En interne : ${puIn('pu_signal_interne',v.pu_signal_interne,'signal défini par la structure, ex. sifflet',240)} signifiant un risque d’intrusion imminent.</li>
      <li>En externe : une demande des forces de l’ordre par voie orale et/ou par SMS FR-ALERT.</li>
    </ul>
    Le protocole de confinement propre à la structure est consultable : ${puIn('pu_confin_support',v.pu_confin_support,'lieu ou support',260)}
  </div>

  <h3>Conclusion</h3>
  <div class="txtbox">
    Les deux contenants ne servent pas à gérer les mêmes temporalités : leur contenu est donc pensé différemment.<br>
    Afin de gérer au mieux ces situations « imprévues », la structure doit disposer des deux contenants <b>DISTINCTS</b>, chacun dans son lieu défini.<br>
    Ils doivent être contrôlés : DLC* et DLU*, contenance et présence sur la structure.<br>
    Chaque professionnel se doit d’être vigilant sur la connaissance du lieu des contenants.<br>
    <i style="font-size:12px">* DLC : Date Limite de Consommation · DLU : Date Limite d’Utilisation</i>
  </div>

  <div class="pu-bar r">Annexe 1 – Sac URGENCE<small>Contenant ROUGE · Sortie immédiate</small></div>
  <div class="txtbox" style="border-radius:0 0 10px 10px">
    Contenu léger et transportable, pensé pour une sortie rapide et la prise de contact avec l’extérieur. Quantités à ajuster selon la capacité d’accueil.<br>
    Lieu : ${puIn('pu_r_lieu',v.pu_r_lieu,'à préciser',240)}
  </div>
  ${puAnnexeHtml('r',v)}

  <div class="pu-bar b">Annexe 2 – Sac CONFINEMENT<small>Contenant BLEU · Durée indéterminée</small></div>
  <div class="txtbox" style="border-radius:0 0 10px 10px">
    Contenu pensé pour tenir dans le temps, dans le calme et la discrétion, en répondant aux besoins fondamentaux des enfants et des adultes. Quantités à calculer selon la capacité d’accueil.<br>
    Lieu : ${puIn('pu_b_lieu',v.pu_b_lieu,'à préciser',240)}
  </div>
  ${puAnnexeHtml('b',v)}

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
  <div class="ftw"><table class="ft">
    <tr><th style="width:130px">Date</th><th style="width:110px">Sac</th><th>Produits à renouveler (DLC / DLU)</th><th style="width:170px">Contrôlé par</th><th style="width:200px">Signature</th></tr>
    ${Array.from({length:PU_NB_CTRL},(_,k)=>{const i=k+1;return `<tr>
      <td><input type="date" id="ff_pu_k${i}_date" value="${esc(v['pu_k'+i+'_date'])}"></td>
      <td>${selHtml('pu_k'+i+'_sac',['','U — Urgence','C — Confinement','U et C'],v['pu_k'+i+'_sac'])}</td>
      <td><input id="ff_pu_k${i}_prod" value="${esc(v['pu_k'+i+'_prod'])}"></td>
      <td><input id="ff_pu_k${i}_par" value="${esc(v['pu_k'+i+'_par'])}"></td>
      <td><details class="pu-sig" id="pu-sig-${i}"${SIGS['ctl'+i]?' open':''} ontoggle="puCtlToggle(${i})"><summary>${SIGS['ctl'+i]?'Signé ✓':'Signer'}</summary>${sigBoxHtml('ctl'+i,'Signature — ligne '+i)}</details></td>
    </tr>`;}).join('')}
  </table></div>

  <h3>Validation du protocole</h3>
  <div class="grid2">
    ${sigBoxHtml('direction','Direction')}
    ${sigBoxHtml('referent','Référent(e) sécurité')}
  </div>
 </div>`,
 mount:()=>{
  ['direction','referent'].forEach(mountSig);
  /* le lieu de rangement est saisi à deux endroits : on garde les deux alignés */
  ['r','b'].forEach(p=>{
    const a=document.getElementById('ff_pu_'+p+'_lieu'),b=document.getElementById('ff_pu_'+p+'_lieu2');
    if(a&&b)a.addEventListener('input',()=>{b.value=a.value;});
  });
  for(let i=1;i<=PU_NB_CTRL;i++)if(SIGS['ctl'+i])mountSig('ctl'+i);
 },
 pdf:doc=>{
  const g=id=>{const e=document.getElementById('ff_'+id);return e?String(e.value||'').trim():'';};
  const ck=id=>{const e=document.getElementById('ff_'+id);return !!(e&&e.checked);};
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
  const ligne=(cells,opt)=>{ /* cells: [mat,prec,qte,present(bool|null)] */
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
  const annexe=(p,S)=>{
    ligne(['Matériel','Précisions','Quantité'],{head:true});
    let n=0;
    S.forEach(s=>{
      need(18);
      doc.setFillColor(246,246,251);doc.setDrawColor(150);doc.rect(M,y,W,7,'FD');
      doc.setFont(undefined,'bold');doc.setFontSize(9);doc.setTextColor(74,63,159);doc.text(pdfSafe(s.t),M+2,y+4.8);doc.setTextColor(30);y+=7;
      s.items.forEach(it=>{n++;ligne([it[0],it[1],g('pu_'+p+n+'_q'),ck('pu_'+p+n+'_p')]);});
    });
    need(16);
    doc.setFillColor(246,246,251);doc.setDrawColor(150);doc.rect(M,y,W,7,'FD');
    doc.setFont(undefined,'bold');doc.setFontSize(9);doc.setTextColor(74,63,159);doc.text('Spécifique à la structure',M+2,y+4.8);doc.setTextColor(30);y+=7;
    for(let i=1;i<=PU_NB_SPEC;i++){
      const pre='pu_'+p+'_s'+i;
      ligne([g(pre+'_l'),'',g(pre+'_q'),ck(pre+'_c')]);
    }
  };

  /* ---------- Protocole ---------- */
  doc.setFontSize(16);doc.setFont(undefined,'bold');
  doc.text('Protocole : Urgence et Confinement',M,y+2);y+=10;
  enTete();
  if(g('pu_nb_enf')||g('pu_nb_pro')){
    P('Capacité d’accueil : '+(g('pu_nb_enf')||dots(4))+' enfants / '+(g('pu_nb_pro')||dots(4))+' professionnels',9.5,false);
  }
  H('QU’EST-CE QUE L’URGENCE ?');
  P('Le sac « Urgence » répond aux besoins de sortie immédiate, rapide et sécuritaire. La sortie hors de l’enceinte de la structure implique nécessairement la prise de contact avec l’extérieur (cf. Fiche annexe 1 – ROUGE).');
  P('→ On sort vite, de manière sécuritaire, en regroupant et en alertant',10,true);
  P('Le signal sonore est spécifique : l’alarme incendie — '+val(g('pu_alarme'),40));
  P('Le protocole d’évacuation propre à la structure est consultable : '+val(g('pu_evac_support'),40));
  H('QU’EST-CE QUE LE CONFINEMENT ?');
  P('Le confinement est le fait de rester dans l’enceinte de la structure, dans la plus grande discrétion possible, en assurant une survie pendant un temps non défini.');
  P('Le confinement s’anticipe par du matériel sécuritaire permettant de répondre aux besoins fondamentaux (cf. Fiche annexe 2 – BLEU).');
  P('→ On se cache et on tient dans le temps',10,true);
  P('Le signal sonore peut être de deux ordres :',10,true);
  P('- En interne : '+val(g('pu_signal_interne'),25)+' signifiant un risque d’intrusion imminent.',10,false,M+4);
  P('- En externe : une demande des forces de l’ordre par voie orale et/ou par SMS FR-ALERT.',10,false,M+4);
  P('Le protocole de confinement propre à la structure est consultable : '+val(g('pu_confin_support'),40));
  H('CONCLUSION');
  P('Les deux contenants ne servent pas à gérer les mêmes temporalités : leur contenu est donc pensé différemment.');
  P('Afin de gérer au mieux ces situations « imprévues », la structure doit disposer des deux contenants DISTINCTS, chacun dans son lieu défini.');
  P('Ils doivent être contrôlés : DLC* et DLU*, contenance et présence sur la structure.');
  P('Chaque professionnel se doit d’être vigilant sur la connaissance du lieu des contenants.');
  P('* DLC : Date Limite de Consommation  ·  DLU : Date Limite d’Utilisation',8.5,false,M,[110,110,110]);

  /* ---------- Annexe 1 ---------- */
  doc.addPage();y=pdfLogo(doc,20);
  bar('Annexe 1 – Sac URGENCE','Contenant ROUGE · Sortie immédiate · Lieu : '+val(g('pu_r_lieu'),25),[192,57,43]);
  enTete();
  P('Contenu léger et transportable, pensé pour une sortie rapide et la prise de contact avec l’extérieur. Quantités à ajuster selon la capacité d’accueil'+(g('pu_nb_enf')||g('pu_nb_pro')?' ('+(g('pu_nb_enf')||'…')+' enfants / '+(g('pu_nb_pro')||'…')+' professionnels).':'.'),9.5);
  y+=1;annexe('r',PU_ROUGE);

  /* ---------- Annexe 2 ---------- */
  doc.addPage();y=pdfLogo(doc,20);
  bar('Annexe 2 – Sac CONFINEMENT','Contenant BLEU · Durée indéterminée · Lieu : '+val(g('pu_b_lieu'),25),[46,109,180]);
  enTete();
  P('Contenu pensé pour tenir dans le temps, dans le calme et la discrétion, en répondant aux besoins fondamentaux des enfants et des adultes. Quantités à calculer selon la capacité d’accueil'+(g('pu_nb_enf')||g('pu_nb_pro')?' ('+(g('pu_nb_enf')||'…')+' enfants / '+(g('pu_nb_pro')||'…')+' professionnels).':'.'),9.5);
  y+=1;annexe('b',PU_BLEU);

  /* ---------- Localisation et contrôle ---------- */
  doc.addPage();y=pdfLogo(doc,20);
  doc.setFontSize(14);doc.setFont(undefined,'bold');doc.text('Localisation et contrôle des sacs',M,y+2);y+=10;
  enTete();
  H('LOCALISATION ET RÉFÉRENTS');
  const gr=(rows)=>{y=pdfGrid(doc,M,y,[56,70,56],rows,{minH:9});y+=4;};
  gr([{head:true,cells:['Contenant','Lieu de rangement','Référent(s)']},
      ['Sac URGENCE (rouge)',g('pu_r_lieu'),g('pu_r_ref')],
      ['Sac CONFINEMENT (bleu)',g('pu_b_lieu'),g('pu_b_ref')]]);
  H('NUMÉROS UTILES');
  PU_NUMS.forEach(n=>P(n[0]+' : '+n[1],10));
  P('Direction : '+val(g('pu_tel_dir'),20));
  P('Mairie / gestionnaire : '+val(g('pu_tel_mairie'),20));
  P('PMI / référent santé : '+val(g('pu_tel_pmi'),20));
  H('FICHE DE CONTRÔLE');
  P('Fréquence de contrôle : '+val(g('pu_freq'),20)+'. Vérifier la présence du sac à son emplacement, sa contenance, les DLC et DLU.',9.5);
  y+=1;
  /* tableau de contrôle : signature dessinée dans la dernière colonne */
  const cw=[24,26,60,34,38];
  const hd=['Date','Sac','Produits à renouveler (DLC / DLU)','Contrôlé par','Signature'];
  need(14);
  let x=M;doc.setFontSize(9);doc.setFont(undefined,'bold');
  hd.forEach((t,i)=>{doc.setFillColor(238,237,248);doc.rect(x,y,cw[i],8,'FD');doc.text(pdfSafe(t),x+cw[i]/2,y+5.3,{align:'center',maxWidth:cw[i]-2});x+=cw[i];});
  y+=8;
  for(let i=1;i<=PU_NB_CTRL;i++){
    need(16);
    const cells=[dfr(g('pu_k'+i+'_date')),g('pu_k'+i+'_sac').split(' ')[0],g('pu_k'+i+'_prod'),g('pu_k'+i+'_par')];
    x=M;doc.setFont(undefined,'normal');doc.setFontSize(9);doc.setDrawColor(150);
    for(let c=0;c<5;c++){
      doc.rect(x,y,cw[c],14);
      if(c<4&&cells[c])doc.text(doc.splitTextToSize(pdfSafe(cells[c]),cw[c]-3).slice(0,3),x+1.5,y+4.6);
      if(c===4&&SIGS['ctl'+i]){try{doc.addImage(SIGS['ctl'+i],'PNG',x+1,y+1,cw[c]-2,12);}catch(e){}}
      x+=cw[c];
    }
    y+=14;
  }
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
