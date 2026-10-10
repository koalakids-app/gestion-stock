TPL.cerfa_17580.pdf=function(doc,mode){
  c17ExportOfficiel().catch(e=>{
    console.warn('Export cerfa officiel indisponible :',e);
    if(typeof toast==='function')toast('PDF officiel indisponible — export de secours');
    TPL.cerfa_17580.pdfDessine(doc,mode);
  });
  return true;
};


/* ---------- LIVRET D'ACCUEIL DU STAGIAIRE ----------
   Le texte est commun à toutes les crèches ; seuls le nom, l'adresse, la
   capacité, les horaires, les âges accueillis, les gestionnaires et la
   composition de l'équipe changent. Ils sont préremplis depuis la crèche
   choisie puis restent modifiables. Le même texte (lvSections) alimente
   l'aperçu à l'écran et le PDF : les deux ne peuvent pas diverger.
   La stagiaire signe sur son téléphone (« Signer sur mobile » -> signature.html),
   le tuteur de stage dans le cadre de gauche. */
function lvCreche(nomCourt){
  return CRECHES.find(c=>shortCrecheName(c.name)===nomCourt)||null;
}
const LV_SUIVI=[['Accueil','Cuisine','Changes','Siestes','Activités'],['Repas','Ménage','Sorties','Transmissions','Aménagement']];
/* Les fiches stagiaires de la crèche choisie (RLS : une référente ne voit que
   les siennes). Chargées à l'ouverture et à chaque changement de crèche. */
let LV_STAG=[];
async function lvChargerStagiaires(){
  const sel=document.getElementById('ff_lv_stagiaire_id');if(!sel)return;
  const cible=(document.getElementById('ff_lv_stagiaire_val')||{}).value||'';
  const c=lvCreche((document.getElementById('ff_lv_creche')||{}).value);
  let q=sb.from('stagiaires').select('id,prenom,nom,ecole,formation,date_debut,date_fin,creche_id,statut').order('nom');
  if(c)q=q.eq('creche_id',String(c.id));
  const{data}=await q;
  LV_STAG=(data||[]).filter(x=>x.statut!=='annule'&&x.statut!=='refuse');
  sel.innerHTML='<option value="">— Choisir —</option>'+LV_STAG.map(x=>`<option value="${esc(x.id)}"${x.id===cible?' selected':''}>${esc((x.prenom||'')+' '+(x.nom||''))}</option>`).join('');
}
function lvChoisirStagiaire(){
  const id=document.getElementById('ff_lv_stagiaire_id').value;
  document.getElementById('ff_lv_stagiaire_val').value=id;
  const x=LV_STAG.find(r=>r.id===id);if(!x)return;
  const set=(k,v)=>{const e=document.getElementById('ff_'+k);if(e&&v)e.value=v;};
  const fr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
  set('sal_nom',((x.prenom||'')+' '+(x.nom||'')).trim());
  set('lv_formation',[x.formation,x.ecole].filter(Boolean).join(' — '));
  if(x.date_debut)set('lv_periode','du '+fr(x.date_debut)+(x.date_fin?' au '+fr(x.date_fin):''));
  lvRefresh();
}
function lvVals(){
  const o={};LV_CHAMPS.forEach(k=>{const e=document.getElementById('ff_'+k);o[k]=e?String(e.value||'').trim():'';});
  return o;
}
function lvRefresh(){
  const el=document.getElementById('lv-apercu');if(!el)return;
  const o=lvVals(),g=k=>o[k]||'';
  el.innerHTML=lvHtmlSections(lvSections(g,o.lv_texte));
}
function lvHtmlSections(S){
  return S.map(s=>(s.t?`<h4>${esc(s.t)}</h4>`:'')+lvHtmlItems(s.items)).join('');
}
function lvHtmlItems(items){
  let h='',ul=false;
  items.forEach(i=>{
    if(i.k==='li'){if(!ul){h+='<ul>';ul=true;}h+=`<li>${esc(i.t)}</li>`;}
    else{if(ul){h+='</ul>';ul=false;}h+=`<p>${esc(i.t)}</p>`;}
  });
  return h+(ul?'</ul>':'');
}
/* Éditeur du texte : une zone par section (titre + contenu, « - » devant une
   ligne pour une puce). Le résultat est gardé dans un champ caché et enregistré
   avec le livret : modifier un livret ne touche ni aux autres ni au texte type. */
function lvEditerTexte(){
  const o=lvVals();
  const S=lvSections(k=>o[k]||'',o.lv_texte);
  const zone=document.getElementById('lv-editeur');
  zone.style.display='block';
  zone.innerHTML=S.map((s,i)=>`<div class="f"><input class="lv-t" data-i="${i}" value="${esc(s.t)}" placeholder="(sans titre)" style="font-weight:700" oninput="lvMajTexte()">
    <textarea class="lv-c" data-i="${i}" rows="${Math.min(10,Math.max(3,s.items.length*2))}" oninput="lvMajTexte()">${esc(lvSectionsEnTexte(s.items))}</textarea></div>`).join('')
    +'<button type="button" class="btn btn-g" onclick="lvRetourTexteType()"><i class="ti ti-restore"></i> Revenir au texte type de la crèche</button>';
  lvMajTexte();
}
function lvMajTexte(){
  const ts=[...document.querySelectorAll('#lv-editeur .lv-t')],cs=[...document.querySelectorAll('#lv-editeur .lv-c')];
  const S=ts.map((t,i)=>({t:t.value.trim(),items:lvTexteEnItems(cs[i].value)}));
  document.getElementById('ff_lv_texte').value=JSON.stringify(S);
  lvRefresh();
}
function lvRetourTexteType(){
  if(!confirm('Effacer vos modifications du texte et revenir au texte type ?'))return;
  document.getElementById('ff_lv_texte').value='';
  const z=document.getElementById('lv-editeur');z.style.display='none';z.innerHTML='';
  lvRefresh();
}
/* Changer de crèche recharge ses coordonnées ; ce qui a déjà été saisi à la
   main pour l'équipe n'est écrasé que s'il vient du texte par défaut. */
function lvChangeCreche(){
  const c=lvCreche(document.getElementById('ff_lv_creche').value);
  const set=(id,v)=>{const e=document.getElementById('ff_'+id);if(e)e.value=v||'';};
  if(c){set('lv_adresse',c.addr);set('lv_capacite',c.capacity);}
  const eq=document.getElementById('ff_lv_equipe');
  const defs=Object.values(LV_EQUIPE_DEFAUT);
  if(eq&&(!eq.value.trim()||defs.includes(eq.value.trim())))eq.value=LV_EQUIPE_DEFAUT[document.getElementById('ff_lv_creche').value]||'';
  lvRefresh();
}
TPL.livret_stagiaire={
  fields:LV_CHAMPS.concat(['lv_stagiaire_id','lv_envoye']),
  large:true,
  html:v=>{
    if(!v.lv_creche&&PROF&&PROF.creche_id){const c=CRECHES.find(x=>x.id===PROF.creche_id);if(c)v.lv_creche=shortCrecheName(c.name);}
    const c=lvCreche(v.lv_creche);
    if(c){if(!v.lv_adresse)v.lv_adresse=c.addr||'';if(!v.lv_capacite)v.lv_capacite=c.capacity||'';}
    if(!v.lv_equipe&&LV_EQUIPE_DEFAUT[v.lv_creche])v.lv_equipe=LV_EQUIPE_DEFAUT[v.lv_creche];
    if(!v.lv_gestionnaires)v.lv_gestionnaires=LV_GESTIONNAIRES;
    if(!v.lv_date)v.lv_date=new Date().toISOString().slice(0,10);
    const inp=(k,lab,ph)=>`<div class="f"><label>${lab}</label><input id="ff_${k}" value="${esc(v[k])}" placeholder="${esc(ph||'')}" oninput="lvRefresh()"></div>`;
    setTimeout(()=>{lvRefresh();if(v.lv_texte)lvEditerTexte();},0);setTimeout(lvChargerStagiaires,0);
    return `<div class="tpl lv">
     <style>.lv .apercu{border:1px solid var(--line,#E3E1EF);border-radius:12px;padding:6px 16px 12px;background:#fff;max-height:340px;overflow:auto;font-size:13px;line-height:1.55}
     .lv .apercu h4{margin:14px 0 4px;color:var(--violet)}.lv .apercu p{margin:4px 0}.lv .apercu ul{margin:4px 0 4px 18px}</style>
     <h3>Crèche qui accueille</h3>
     <div class="grid2">
       <div class="f"><label>Crèche (le livret est établi à son nom)</label><select id="ff_lv_creche" onchange="lvChangeCreche();lvChargerStagiaires()">${
         ['',...CRECHE_NOMS_COURTS].map(n=>`<option${v.lv_creche===n?' selected':''}>${esc(n)}</option>`).join('')}</select></div>
       ${inp('lv_adresse','Adresse')}
       ${inp('lv_capacite','Capacité d’accueil (places)')}
     </div>
     ${inp('lv_gestionnaires','Gérée par')}
     ${inp('lv_ages','Âges accueillis','de 2 mois 1/2 à 4 ans (6 ans pour les enfants porteurs de handicap)')}
     <div class="grid2">
       ${inp('lv_horaires','Horaires de la structure','Les horaires de la structure sont de 7h à 19h')}
       ${inp('lv_accueil','Horaires d’accueil des enfants','avec un accueil de l’enfant de 7h30 à 18h30 (selon les contrats)')}
     </div>
     <div class="f"><label>Composition de l’équipe</label><textarea id="ff_lv_equipe" rows="3" oninput="lvRefresh()">${esc(v.lv_equipe)}</textarea></div>
     <h3>Stagiaire</h3>
     <div class="f"><label>Fiche stagiaire (module Stagiaires &amp; alternants)</label>
       <select id="ff_lv_stagiaire_id" onchange="lvChoisirStagiaire()"><option value="">— Choisir —</option></select></div>
     <input type="hidden" id="ff_lv_stagiaire_val" value="${esc(v.lv_stagiaire_id)}">
     <label class="radios" style="display:block;margin:4px 0 10px"><input type="checkbox" id="ff_lv_envoye"${v.lv_envoye?' checked':''}> Mettre ce livret à signer sur le lien du stagiaire (rubrique « Documents à signer »)</label>
     <div class="grid2">
       ${inp('sal_nom','Nom / Prénom')}
       ${inp('lv_formation','Formation / école')}
       ${inp('lv_periode','Période de stage','du … au …')}
     </div>
     ${inp('lv_tuteur','Tuteur / tutrice de stage (nom et fonction)')}
     <h3>Le livret (aperçu)</h3>
     <input type="hidden" id="ff_lv_texte" value="${esc(v.lv_texte)}">
     <div style="margin-bottom:8px"><button type="button" class="btn btn-g" onclick="lvEditerTexte()"><i class="ti ti-edit"></i> Modifier le texte de ce livret</button></div>
     <div id="lv-editeur" style="display:none;margin-bottom:10px"></div>
     <div class="apercu" id="lv-apercu"></div>
     <h3>Acte d’engagement</h3>
     <p class="hint">Nous nous engageons à vous accompagner au mieux lors de ce stage, nous attendons que vous fassiez de même en signant ce document.</p>
     <div class="grid2">${inp('lv_lieu','Fait à')}<div class="f"><label>Date</label><input type="date" id="ff_lv_date" value="${esc(v.lv_date)}"></div></div>
     <div class="grid2">
       ${sigBoxHtml('responsable','Signature du tuteur de stage')}
       ${sigBoxHtml('salarie','Signature du stagiaire')}
     </div>
     <p class="hint">« Signer sur mobile » affiche un QR code et un lien : le stagiaire signe avec son doigt sur son propre téléphone, sans compte. La fiche de suivi est jointe au PDF.</p>
    </div>`;
  },
  pdf:function(doc){
    const o=lvVals(),g=k=>o[k]||'';
    const nomC=g('lv_creche')?'Koalakids '+g('lv_creche'):'Koala Kids';
    const W=182,dfrl=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
    let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>280){doc.addPage();y=pdfLogo(doc,20);}};
    doc.setTextColor(74,63,159);doc.setFont(undefined,'bold');doc.setFontSize(18);
    doc.text('Livret d’accueil du stagiaire',14,y);y+=8;
    doc.setFontSize(13);doc.text(nomC,14,y);y+=6;
    doc.setFontSize(9.5);doc.setFont(undefined,'normal');doc.setTextColor(90);
    if(g('lv_adresse')){doc.text(g('lv_adresse'),14,y);y+=5;}
    if(g('sal_nom')){doc.text('Stagiaire : '+g('sal_nom')+(g('lv_formation')?' — '+g('lv_formation'):'')+(g('lv_periode')?' — '+g('lv_periode'):''),14,y);y+=5;}
    doc.setTextColor(30);y+=4;
    const para=(txt,x0)=>{const lines=doc.splitTextToSize(txt,W-(x0||0));
      lines.forEach(l=>{need(5);doc.text(l,14+(x0||0),y);y+=4.8;});y+=1.5;};
    doc.setFontSize(10);
    lvSections(k=>g(k),g('lv_texte')).forEach(s=>{
      if(s.t){need(14);y+=2;doc.setFont(undefined,'bold');doc.setFontSize(11.5);doc.setTextColor(74,63,159);
        doc.text(s.t,14,y);y+=6;doc.setTextColor(30);doc.setFontSize(10);doc.setFont(undefined,'normal');}
      s.items.forEach(i=>{
        if(i.k!=='li'){para(i.t);return;}
        doc.splitTextToSize(i.t,W-6).forEach((l,n)=>{need(5);if(n===0)doc.text('•',16,y);doc.text(l,21,y);y+=4.8;});y+=1;
      });
    });
    /* Acte d'engagement : bloc indivisible */
    doc.addPage();y=pdfLogo(doc,20);
    doc.setFont(undefined,'bold');doc.setFontSize(15);doc.setTextColor(74,63,159);
    doc.text('Acte d’engagement',14,y);y+=10;doc.setTextColor(30);doc.setFontSize(10.5);doc.setFont(undefined,'normal');
    para('Nous nous engageons à vous accompagner au mieux lors de ce stage, nous attendons que vous fassiez de même en signant ce document.');
    y+=4;para('Fait à '+(g('lv_lieu')||'……………………')+', le '+(dfrl(g('lv_date'))||'……………………'));y+=4;
    doc.setFont(undefined,'bold');doc.setFontSize(9);
    doc.text('Signature du tuteur de stage'+(g('lv_tuteur')?' ('+g('lv_tuteur')+')':''),14,y);
    doc.text('Signature du stagiaire'+(g('sal_nom')?' ('+g('sal_nom')+')':''),110,y);
    doc.setDrawColor(200);doc.rect(14,y+3,84,34);doc.rect(110,y+3,84,34);
    if(SIGS.responsable){try{doc.addImage(SIGS.responsable,'PNG',16,y+5,80,30);}catch(e){}}
    if(SIGS.salarie){try{doc.addImage(SIGS.salarie,'PNG',112,y+5,80,30);}catch(e){}}
    y+=44;
    doc.setFont(undefined,'normal');doc.setFontSize(8);doc.setTextColor(120);
    doc.text(nomC,14,y);doc.setTextColor(30);
    /* Fiche de suivi (à remplir pendant le stage) */
    doc.addPage();y=pdfLogo(doc,20);
    doc.setFont(undefined,'bold');doc.setFontSize(15);doc.setTextColor(74,63,159);
    doc.text('Fiche de suivi — '+nomC,14,y);y+=9;doc.setTextColor(30);
    LV_SUIVI.forEach(ligne=>{
      const cw=W/5;
      doc.setFontSize(9);
      ligne.forEach((t,i)=>{
        const x=14+i*cw;
        doc.setFillColor(238,236,250);doc.rect(x,y,cw,7,'F');doc.setFont(undefined,'bold');doc.text(t,x+2,y+5);
        doc.setDrawColor(200);doc.rect(x,y,cw,62);
        doc.setFont(undefined,'normal');doc.setFontSize(7.5);
        doc.text('Dates :',x+2,y+12);doc.text('Ce qui a été fait :',x+2,y+30);doc.setFontSize(9);
      });
      y+=68;
    });
    pdfSortie(doc,slug(fillDoc.titre)+(g('lv_creche')?'_'+slug(g('lv_creche')):'')+(g('sal_nom')?'_'+slug(g('sal_nom')):'')+'.pdf');
    return true;
  }
};
TPL_LABELS.livret_stagiaire='Livret d’accueil du stagiaire (crèche)';

function sigBoxHtml(role,label){
  return `<div class="sigbox" id="sb_${role}">
    <div class="lbl">${esc(label)}</div>
    <div id="sbc_${role}"></div>
    <div class="acts">
      <button class="btn btn-g" onclick="clearSig('${role}')"><i class="ti ti-eraser"></i> Effacer</button>
      <button class="btn btn-s" data-role="${esc(role)}" data-label="${esc(label)}" onclick="startQr(this.dataset.role,this.dataset.label)"><i class="ti ti-qrcode"></i> Signer sur mobile</button>
    </div></div>`;
}

/* Longueur minimale de trace (en px CSS) pour qu’un geste compte comme signature.
   En dessous, il s’agit d’un simple appui ou d’un frolement accidentel : le cadre
   est remis a blanc et le document reste au statut « prepare ». */
const SIG_MIN_INK=24;

function mountSig(role){
  const host=document.getElementById('sbc_'+role);
  if(!host)return;
  if(host._sigUp){window.removeEventListener('mouseup',host._sigUp);host._sigUp=null;}
  if(SIGS[role]){host.innerHTML=`<img src="${SIGS[role]}" alt="signature">`;return;}
  host.innerHTML='<canvas></canvas>';
  const c=host.querySelector('canvas');
  const r=c.getBoundingClientRect();
  c.width=Math.max(300,r.width)*2;c.height=120*2;
  const ctx=c.getContext('2d');ctx.scale(2,2);
  ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#2B2740';
  let on=false,ink=0,last=null;
  const pt=e=>{const b=c.getBoundingClientRect();const p=e.touches?e.touches[0]:e;
    return[(p.clientX-b.left)*(c.width/2/b.width),(p.clientY-b.top)*(c.height/2/b.height)];};
  const dn=e=>{e.preventDefault();on=true;last=pt(e);ctx.beginPath();ctx.moveTo(...last);};
  const mv=e=>{if(!on)return;e.preventDefault();
    const p=pt(e);
    if(last)ink+=Math.hypot(p[0]-last[0],p[1]-last[1]);
    last=p;ctx.lineTo(...p);ctx.stroke();};
  const up=()=>{if(!on)return;on=false;
    /* Trace cumulee sur l’ensemble des traits : une signature en plusieurs
       levers de stylo reste valide, un simple clic ne l’est pas. */
    if(ink<SIG_MIN_INK){
      ctx.clearRect(0,0,c.width,c.height);
      delete SIGS[role];
      ink=0;last=null;
      return;
    }
    SIGS[role]=c.toDataURL('image/png');};
  c.addEventListener('mousedown',dn);c.addEventListener('mousemove',mv);
  window.addEventListener('mouseup',up);
  host._sigUp=up;                 /* pour retirer l’ecouteur au prochain montage */
  c.addEventListener('touchstart',dn,{passive:false});
  c.addEventListener('touchmove',mv,{passive:false});
  c.addEventListener('touchend',up);
  c.addEventListener('touchcancel',up);
}
function clearSig(role){
  delete SIGS[role];
  mountSig(role);
  /* Plus aucune signature et statut non choisi manuellement : on redescend
     l’affichage pour que l’ecran corresponde a ce qui sera enregistre. */
  if(!fillStatutManuel&&!Object.keys(SIGS).some(k=>!!SIGS[k])){
    const st=document.getElementById('fillStatut');
    if(st)st.value='prepare';
  }
}

/* ---------- DOCUMENT A SIGNER A DISTANCE (lien envoyé au signataire choisi) ----------
   Éligibles : documents « à télécharger » dont la catégorie (ou une catégorie
   parente) porte doc_categories.signature_distance (Protocoles obligatoires,
   médicaux, règles d'hygiène), ou marqués documents_koala.signature_distance.
   Signataires proposés : table doc_signataires (RSAI par périmètre de crèches).
   Le lien ouvre signature.html (document d'origine + signature, valable 7 jours).
   Un même document peut recevoir une signature par signataire ; l'état est relu
   dans signatures_pending à chaque chargement (sql/documents_signataires.sql). */
let SIGNATAIRES=[];   // doc_signataires actifs, par ordre
let SD_ETATS={};      // document_id -> { 'Nom (Fonction)': {token,signed_at,expire_at,created_at,signataire} }
let sdTimer=null,sdToken=null;
const sdLabel=s=>s.nom+(s.fonction?' ('+s.fonction+')':'');
const sdNomCourt=l=>String(l||'').replace(/\s*\(.*\)\s*$/,'');
function sdCatFlag(catId){
  let id=catId,n=0;
  while(id&&n++<6){
    const c=CATS.find(x=>x.id===id);
    if(!c)return false;
    if(c.signature_distance)return true;
    id=c.parent_id;
  }
  return false;
}
function sdEligible(d){
  return d.type!=='remplissable'&&!!d.fichier_url&&(!!d.signature_distance||sdCatFlag(d.categorie_id));
}
const sdSignes=d=>Object.values(SD_ETATS[d.id]||{}).filter(e=>e.signed_at).sort((a,b)=>a.signed_at<b.signed_at?-1:1);
async function sdChargerEtats(){
  SD_ETATS={};
  const ids=DOCS.filter(sdEligible).map(d=>d.id);
  if(!ids.length)return;
  try{
    const{data}=await sb.from('signatures_pending')
      .select('token,document_id,signed_at,expire_at,created_at,signataire')
      .in('document_id',ids).eq('role_sign','document_distance')
      .order('created_at',{ascending:false});
    (data||[]).forEach(r=>{
      const par=SD_ETATS[r.document_id]=SD_ETATS[r.document_id]||{};
      const cur=par[r.signataire];
      // une demande signée prime sur une demande plus récente restée en attente
      if(!cur||(!cur.signed_at&&r.signed_at))par[r.signataire]=r;
    });
  }catch(e){console.warn('etats signature',e);}
}
function sdTag(d){
  if(!sdEligible(d))return '';
  const par=SD_ETATS[d.id]||{},labels=Object.keys(par);
  const dt=x=>new Date(x).toLocaleDateString('fr-FR');
  if(!labels.length)return ' <span class="tag" style="background:#F1EFF7;color:#8E8AA8;font-weight:700">À faire signer</span>';
  return labels.map(l=>{
    const e=par[l],qui=esc(sdNomCourt(l));
    if(e.signed_at)return ' <span class="tag" style="background:#E6F4EA;color:#2E7D32;font-weight:700;cursor:pointer" data-l="'+esc(l)+'" onclick="sdVoirSignature(\''+d.id+'\',this.dataset.l)">✅ Signé par '+qui+' le '+dt(e.signed_at)+'</span>';
    if(new Date(e.expire_at)>new Date())return ' <span class="tag" style="background:#FFF3E0;color:#B45F06;font-weight:700">⏳ En attente de '+qui+' (envoyé le '+dt(e.created_at)+')</span>';
    return ' <span class="tag" style="background:#F1EFF7;color:#8E8AA8;font-weight:700">Lien expiré — '+qui+'</span>';
  }).join('');
}
function sdUrl(tok){return location.origin+location.pathname.replace(/[^/]*$/,'')+'signature.html?t='+tok;}
/* Signataire présélectionné quand le titre ou la crèche du document désigne un seul périmètre. */
function sdPreselection(d){
  const cr=d.creche_id?((CRECHES.find(c=>c.id===d.creche_id)||{}).name||''):'';
  const txt=((d.titre||'')+' '+cr).toLowerCase();
  const ok=SIGNATAIRES.filter(s=>(s.perimetre||'').split(',').map(x=>x.trim().toLowerCase().replace(/\s*\d+$/,'')).filter(Boolean)
    .some(p=>txt.includes(p)||(p==='ollioules'&&/\boll\b/.test(txt))));
  return ok.length===1?ok[0].id:null;
}
/* Étape 1 : choisir à qui envoyer ; étape 2 (sdCreerLien) : lien à transmettre. */
function sdEnvoyer(id){
  const d=DOCS.find(x=>x.id===id);
  if(!d)return;
  if(!SIGNATAIRES.length)return toast('Aucun signataire configuré (table doc_signataires)');
  const pre=sdPreselection(d),deja=SD_ETATS[id]||{};
  document.getElementById('sdTitle').textContent=d.titre;
  document.getElementById('sdInfo').textContent='À qui envoyer ce document à signer ?';
  const box=document.getElementById('sdBox');
  box.innerHTML='<div style="text-align:left">'+SIGNATAIRES.map(s=>{
    const e=deja[sdLabel(s)],etat=e?(e.signed_at?' — ✅ déjà signé':(new Date(e.expire_at)>new Date()?' — ⏳ en attente':'')):'';
    return '<label style="display:block;border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin:0 0 8px;cursor:pointer">'
      +'<input type="radio" name="sdSig" value="'+esc(s.id)+'"'+(s.id===pre?' checked':'')+' onchange="document.getElementById(\'sdGo\').disabled=false"> '
      +'<b>'+esc(s.nom)+'</b>'+(s.fonction?' <span style="color:var(--muted)">· '+esc(s.fonction)+'</span>':'')+esc(etat)
      +(s.perimetre?'<br><span style="font-size:12px;color:var(--muted);margin-left:22px">'+esc(s.perimetre)+'</span>':'')+'</label>';
  }).join('')+'</div>'
  +'<button class="btn btn-p" id="sdGo" style="margin-top:6px"'+(pre?'':' disabled')+' onclick="sdCreerLien(\''+id+'\')"><i class="ti ti-link"></i> Générer le lien</button>';
  document.getElementById('ovSd').classList.add('on');
}
async function sdCreerLien(id){
  const d=DOCS.find(x=>x.id===id);
  const sel=document.querySelector('input[name="sdSig"]:checked');
  const s=sel&&SIGNATAIRES.find(x=>x.id===sel.value);
  if(!d||!s)return toast('Choisir un signataire');
  const deja=(SD_ETATS[id]||{})[sdLabel(s)];
  if(deja&&deja.signed_at&&!confirm('Ce document a déjà été signé par '+s.nom+'. Envoyer une nouvelle demande de signature ?'))return;
  sdToken=mkToken();
  const exp=new Date(Date.now()+7*864e5).toISOString();
  const{error}=await sb.from('signatures_pending').insert({
    token:sdToken,document_id:d.id,role_sign:'document_distance',
    signataire:sdLabel(s),contexte:d.titre,expire_at:exp,created_by:ME.id
  });
  if(error){sdToken=null;return toast('Erreur : '+error.message);}
  const url=sdUrl(sdToken),prenom=(s.nom||'').trim().split(/\s+/)[0]||'';
  document.getElementById('sdInfo').textContent='Lien de signature pour '+sdLabel(s)+', valable 7 jours. Il ouvre le document, puis le cadre de signature.';
  const box=document.getElementById('sdBox');box.innerHTML='';
  const lien=document.createElement('div');
  lien.style.cssText='margin:6px 0 12px;font-size:11px;word-break:break-all;color:var(--muted);line-height:1.4';
  // QR code : à scanner avec le téléphone du signataire (présent sur place) pour ouvrir la
  // page de signature. Généré localement (qrcodejs) : le lien ne part vers aucun service tiers.
  if(typeof QRCode==='function'){
    const qr=document.createElement('div');
    qr.style.cssText='display:flex;justify-content:center;margin:4px 0 6px';
    box.appendChild(qr);
    try{new QRCode(qr,{text:url,width:200,height:200,correctLevel:QRCode.CorrectLevel.M});}
    catch(e){console.warn('QRCode lib KO',e);qr.remove();}
    const lg=document.createElement('p');
    lg.className='hint';lg.style.margin='0 0 6px';
    lg.textContent='Scanner avec le téléphone de '+prenom+' pour ouvrir la signature.';
    box.appendChild(lg);
  }
  lien.textContent=url;box.appendChild(lien);
  const cp=document.createElement('button');
  cp.className='btn btn-s';cp.innerHTML='<i class="ti ti-copy"></i> Copier le lien';
  cp.onclick=()=>{navigator.clipboard.writeText(url).then(()=>toast('Lien copié'),()=>toast('Copie impossible'));};
  box.appendChild(cp);
  if(PartageLien.disponible()){
    const pt=document.createElement('button');
    pt.className='btn btn-s';pt.style.marginLeft='6px';
    pt.innerHTML='<i class="ti ti-share"></i> Partager…';
    pt.onclick=()=>{PartageLien.partager(url,{titre:'Signature',texte:'Bonjour '+prenom+', voici le lien pour signer « '+d.titre+' » :'})
      .then(r=>{if(r==='copie')toast('Partage indisponible — lien copié.');});};
    box.appendChild(pt);
  }
  // E-mail : mailto ouvre la messagerie (Outlook…) avec objet et texte rédigés ; le corps
  // se place avant la signature automatique, contrairement à la feuille de partage.
  const mail=document.createElement('a');
  mail.className='btn btn-s';mail.style.cssText='margin-left:6px;text-decoration:none';
  mail.href='mailto:'+encodeURIComponent(s.email||'')+'?subject='+encodeURIComponent('Document à signer : '+d.titre)
    +'&body='+encodeURIComponent('Bonjour'+(prenom?' '+prenom:'')+',\r\n\r\nMerci de lire puis signer le document « '+d.titre
      +' » en ouvrant ce lien :\r\n\r\n'+url+'\r\n\r\nCe lien est valable 7 jours.\r\n\r\nCordialement,');
  mail.innerHTML='<i class="ti ti-mail"></i> E-mail';
  box.appendChild(mail);
  const wa=document.createElement('a');
  wa.className='btn btn-s';wa.style.cssText='margin-left:6px;text-decoration:none';
  wa.target='_blank';wa.rel='noopener';
  wa.href='https://wa.me/?text='+encodeURIComponent('Bonjour'+(prenom?' '+prenom:'')+', voici le lien pour signer « '+d.titre+' » : '+url);
  wa.innerHTML='<i class="ti ti-brand-whatsapp"></i> WhatsApp';
  box.appendChild(wa);
  // Relève la signature tant que la fenêtre reste ouverte ; sinon l'état est relu au chargement.
  clearInterval(sdTimer);
  sdTimer=setInterval(async()=>{
    if(!sdToken)return;
    const{data}=await sb.from('signatures_pending').select('signed_at').eq('token',sdToken).maybeSingle();
    if(data&&data.signed_at){toast('Signature reçue');sdFermer();await sdChargerEtats();render();}
  },4000);
  await sdChargerEtats();render();
}
function sdFermer(){
  clearInterval(sdTimer);sdTimer=null;sdToken=null;
  document.getElementById('ovSd').classList.remove('on');
}
async function sdVoirSignature(id,label){
  const e=(SD_ETATS[id]||{})[label],d=DOCS.find(x=>x.id===id);
  if(!e||!d)return;
  const{data}=await sb.from('signatures_pending').select('signature_data,signed_at,signataire').eq('token',e.token).maybeSingle();
  if(!data||!data.signature_data)return toast('Signature introuvable');
  document.getElementById('sdTitle').textContent=d.titre;
  document.getElementById('sdInfo').textContent='Signé par '+(data.signataire||'')+' le '+new Date(data.signed_at).toLocaleString('fr-FR');
  document.getElementById('sdBox').innerHTML='<img alt="signature" style="max-width:100%;border:1px solid var(--line);border-radius:12px" src="'+esc(data.signature_data)+'">';
  document.getElementById('ovSd').classList.add('on');
}

/* Blocs de signature ajoutés en fin d'aperçu des documents signés à distance
   (le fichier Word d'origine n'est pas modifié). Vide si non signé. */
async function sdBlocSignature(d){
  let out='';
  for(const e of sdSignes(d)){
    try{
      const{data}=await sb.from('signatures_pending').select('signature_data,signed_at,signataire').eq('token',e.token).maybeSingle();
      if(!data||!data.signature_data)continue;
      out+='<div style="margin-top:26px;padding-top:12px;border-top:2px solid #DED8EE;page-break-inside:avoid">'
        +'<p style="margin:0 0 4px"><b>Lu et approuvé</b> — signé à distance par <b>'+esc(data.signataire||'')+'</b></p>'
        +'<p style="margin:0 0 8px"><b>Date de signature :</b> '+new Date(data.signed_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})
        +' à '+new Date(data.signed_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'</p>'
        +'<img alt="Signature" style="max-height:110px;width:auto;border:1px solid #DED8EE;border-radius:8px;padding:4px;background:#fff" src="'+esc(data.signature_data)+'"></div>';
    }catch(err){console.warn('bloc signature',err);}
  }
  return out;
}

/* ---------- WORD SIGNÉ ----------
   Les signatures reçues (une par signataire : image, nom, date) sont ajoutées en
   fin du .docx d'origine (même fichier que dans la bibliothèque) : mise en page
   intacte, aucun fichier à rejoindre. Les cachets sont flottants dans la marge
   basse de la dernière page, côte à côte (3 au plus). Le fichier stocké n'est
   pas modifié, on télécharge une copie « … - signé.docx ». */
async function sdDocxSigne(d){
  if(!window.JSZip)throw new Error('JSZip non chargé — recharger la page');
  const lignes=sdSignes(d).slice(0,3);
  if(!lignes.length)throw new Error('aucune signature enregistrée');
  const sigs=[];
  for(const e of lignes){
    const{data}=await sb.from('signatures_pending').select('signature_data,signed_at,signataire').eq('token',e.token).maybeSingle();
    if(data&&data.signature_data)sigs.push(data);
  }
  if(!sigs.length)throw new Error('signature introuvable');
  const r=await fetch(d.fichier_url);
  if(!r.ok)throw new Error('HTTP '+r.status);
  const zip=await JSZip.loadAsync(await r.arrayBuffer());
  const docFile=zip.file('word/document.xml'),relFile=zip.file('word/_rels/document.xml.rels'),ctFile=zip.file('[Content_Types].xml');
  if(!docFile||!relFile||!ctFile)throw new Error('fichier Word illisible');
  let xml=await docFile.async('string');
  const i=xml.lastIndexOf('<w:sectPr');                    // sectPr du corps = celui de la dernière page
  if(i<0)throw new Error('structure Word inattendue');
  const sect=xml.slice(i);
  const num=(re,def)=>{const m=sect.match(re);return m?parseInt(m[1],10):def;};
  const pgW=num(/<w:pgSz[^>]*w:w="(\d+)"/,11906),pgH=num(/<w:pgSz[^>]*w:h="(\d+)"/,16838);
  const mL=num(/<w:pgMar[^>]*w:left="(\d+)"/,1417),mR=num(/<w:pgMar[^>]*w:right="(\d+)"/,1417),mB=num(/<w:pgMar[^>]*w:bottom="(\d+)"/,1417);
  const EMU=635;                                           // 1 twip = 635 EMU
  const n=sigs.length,gap=n>1?72000:0;
  const total=(pgW-mL-mR)*EMU,cellW=Math.floor((total-(n-1)*gap)/n);
  const hauteur=Math.min(Math.round(1.9*360000),Math.max(0,(mB-300)*EMU));
  if(hauteur<600000)throw new Error('marge basse trop petite pour le cachet');
  const y=(pgH-mB)*EMU+Math.round(0.12*360000);
  let rels=await relFile.async('string'),ct=await ctFile.async('string');
  if(!/Extension="png"/i.test(ct))ct=ct.replace('<Override','<Default Extension="png" ContentType="image/png"/><Override');
  let runs='';
  for(let k=0;k<n;k++){
    const data=sigs[k];
    const quand=new Date(data.signed_at);
    const date=quand.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})
      +' à '+quand.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    // Cachet = image (texte + signature) : le texte du protocole n'est jamais déplacé ni recouvert.
    const W=Math.round(1400/n),H=Math.round(W*hauteur/cellW);
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;
    const g=cv.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,W,H);
    g.strokeStyle='#8E8AA8';g.lineWidth=3;g.strokeRect(2,2,W-4,H-4);
    g.fillStyle='#2B2740';g.textBaseline='alphabetic';
    const t=H/100,maxT=W*0.62-28;
    const ligne=(txt,gras,px,yy)=>{
      let f=Math.round(t*px);
      for(;f>8;f-=2){g.font=(gras?'bold ':'')+f+'px Arial,Helvetica,sans-serif';if(g.measureText(txt).width<=maxT)break;}
      g.font=(gras?'bold ':'')+f+'px Arial,Helvetica,sans-serif';g.fillText(txt,28,Math.round(t*yy));
    };
    ligne('Lu et approuvé — signé à distance',true,17,30);
    ligne('Signataire : '+(data.signataire||''),false,15,57);
    ligne('Date de signature : '+date,true,15,82);
    const im=new Image();im.src=data.signature_data;await im.decode();
    const zw=W*0.32,zh=H-24,sc=Math.min(zw/im.width,zh/im.height);
    g.drawImage(im,W-zw-20+(zw-im.width*sc)/2,12+(zh-im.height*sc)/2,im.width*sc,im.height*sc);
    zip.file('word/media/kk_signature_distance_'+k+'.png',Uint8Array.from(atob(cv.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0)));
    rels=rels.replace('</Relationships>','<Relationship Id="rIdKkSigDist'+k+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/kk_signature_distance_'+k+'.png"/></Relationships>');
    const x=mL*EMU+k*(cellW+gap),pid=90901+k;
    runs+='<w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="'+(251659264+k)+'" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
      +'<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>'+x+'</wp:posOffset></wp:positionH>'
      +'<wp:positionV relativeFrom="page"><wp:posOffset>'+y+'</wp:posOffset></wp:positionV>'
      +'<wp:extent cx="'+cellW+'" cy="'+hauteur+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'
      +'<wp:docPr id="'+pid+'" name="Signature à distance '+(k+1)+'" descr="Lu et approuvé — signature et date de signature"/><wp:cNvGraphicFramePr/>'
      +'<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      +'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="'+pid+'" name="signature'+(k+1)+'.png"/><pic:cNvPicPr/></pic:nvPicPr>'
      +'<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdKkSigDist'+k+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      +'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cellW+'" cy="'+hauteur+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
      +'</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  }
  zip.file('word/_rels/document.xml.rels',rels);
  zip.file('[Content_Types].xml',ct);
  // paragraphe d'ancrage quasi invisible (1 pt) : ne décale pas le contenu
  const bloc='<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>'+runs+'</w:p>';
  xml=xml.slice(0,i)+bloc+xml.slice(i);
  zip.file('word/document.xml',xml);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
async function sdTelechargerDocx(id){
  const d=DOCS.find(x=>x.id===id);
  if(!d||!d.fichier_url)return;
  toast('Préparation du Word signé…');
  try{
    const blob=await sdDocxSigne(d);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(d.titre||'document').replace(/[\\/:*?"<>|]+/g,' ').trim()+' - signé.docx';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    toast('Word signé téléchargé');
  }catch(e){console.error('sdTelechargerDocx',e);toast('Word signé impossible : '+(e&&e.message?e.message:e));}
}

/* ---------- QR SIGNATURE A DISTANCE ---------- */
function mkToken(){
  const a=new Uint8Array(24);crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,32);
}
async function startQr(role,label){
  const nom=(document.getElementById('ff_sal_nom')||{}).value||'';
  qrToken=mkToken();
  const{error}=await sb.from('signatures_pending').insert({
    token:qrToken,document_id:fillDoc.id,reponse_id:fillRep?fillRep.id:null,
    role_sign:role,signataire:(role==='salarie'?nom:((PROF&&PROF.name)||''))||'Signataire',
    contexte:fillDoc.titre+(fillDoc.template_key==='livret_stagiaire'&&(document.getElementById('ff_lv_creche')||{}).value?' — Koalakids '+document.getElementById('ff_lv_creche').value:'')+(nom?' — '+nom:''),created_by:ME.id
  });
  if(error){qrToken=null;return toast('Erreur : '+error.message);}
  const url=location.origin+location.pathname.replace(/[^/]*$/,'')+'signature.html?t='+qrToken;
  document.getElementById('qrTitle').textContent=label;
  const box=document.getElementById('qrBox');box.innerHTML='';
  QR_URL=url;
  let done=false;
  if(typeof QRCode==='function'){
    try{new QRCode(box,{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});done=true;}
    catch(e){console.warn('QRCode lib KO',e);}
  }
  if(!done){
    const img=document.createElement('img');
    img.width=220;img.height=220;img.alt='QR';
    img.src='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(url);
    box.appendChild(img);
  }
  const link=document.createElement('div');
  link.style.cssText='margin-top:12px;font-size:11px;word-break:break-all;color:var(--muted);line-height:1.4';
  link.textContent=url;
  box.appendChild(link);
  const cp=document.createElement('button');
  cp.className='btn btn-s';cp.style.marginTop='8px';
  cp.innerHTML='<i class="ti ti-copy"></i> Copier le lien';
  cp.onclick=()=>{navigator.clipboard.writeText(QR_URL).then(()=>toast('Lien copié'),()=>toast('Copie impossible'));};
  box.appendChild(cp);
  if(PartageLien.disponible()){
    const pt=document.createElement('button');
    pt.className='btn btn-s';pt.style.cssText='margin-top:8px;margin-left:6px';
    pt.innerHTML='<i class="ti ti-share"></i> Partager…';
    pt.onclick=()=>{PartageLien.partager(QR_URL,{titre:'Signature',texte:'Voici le lien pour signer :'})
      .then(r=>{if(r==='copie')toast('Partage indisponible — lien copié.');});};
    box.appendChild(pt);
  }
  document.getElementById('qrWait').textContent='En attente de la signature… (lien valable 30 min)';
  document.getElementById('ovQr').classList.add('on');
  qrTimer=setInterval(()=>pollQr(role),3000);
}
async function pollQr(role){
  if(!qrToken)return;
  const{data}=await sb.from('signatures_pending').select('signature_data,signed_at')
    .eq('token',qrToken).maybeSingle();   /* lecture authentifiee : policy sigpend_auth_all */
  if(data&&data.signature_data){
    SIGS[role]=data.signature_data;
    /* Contrat de travail : piste d'audit de la signature à distance (date
       d'envoi/d'ouverture du lien QR), best-effort — une panne ici ne doit
       jamais empêcher la réception de la signature elle-même. */
    if(fillDoc&&fillDoc.template_key==='contrat_travail'&&role==='salarie'){
      const tok=qrToken,signeLe=data.signed_at;
      sb.from('signatures_pending').select('created_at,opened_at').eq('token',tok).maybeSingle()
        .then(({data:aud})=>{if(aud)CT_QR_AUDIT={envoye_le:aud.created_at,ouvert_le:aud.opened_at,signe_le:signeLe};})
        .catch(()=>{});
    }
    stopQr();mountSig(role);toast('Signature reçue');
  }
}
function stopQr(){
  if(qrTimer)clearInterval(qrTimer);
  qrTimer=null;qrToken=null;
  document.getElementById('ovQr').classList.remove('on');
}
function cancelQr(){
  if(qrToken)sb.from('signatures_pending').delete().eq('token',qrToken);
  stopQr();
}

/* ---------- REPONSES ---------- */
async function openReps(id){
  const d=DOCS.find(x=>x.id===id);
  document.getElementById('repsTitle').textContent='Réponses — '+d.titre;
  const{data}=await sb.from('documents_reponses').select('*').eq('document_id',id).order('updated_at',{ascending:false});
  const el=document.getElementById('repsArea');
  if(!data||!data.length){el.innerHTML='<div class="empty"><i class="ti ti-inbox"></i>Aucune réponse</div>';}
  else{
    el.innerHTML=data.map(r=>{
      const enf=r.enfant_id?ENFANTS.find(e=>e.id===r.enfant_id):null;
      // Contrat de travail : le nom qui identifie la réponse dans la liste est
      // celui du/de la salarié(e) concerné(e), pas celui de la direction/
      // référente qui a rempli le formulaire — sinon toutes les réponses d'un
      // même compte se ressemblent et on ne peut plus les distinguer.
      const salarieNom=(d.template_key==='contrat_travail'&&r.donnees&&r.donnees.salarie_nom)?r.donnees.salarie_nom
        :(d.template_key==='livret_stagiaire'&&r.donnees&&r.donnees.sal_nom)?(r.donnees.sal_nom+(r.donnees.lv_creche?' — '+r.donnees.lv_creche:'')):null;
      const crNom=r.creche_id?(CRECHES.find(c=>String(c.id)===String(r.creche_id))||{}).name:null;
      return `<div class="rep">
      <b>${esc(salarieNom||r.rempli_par_nom||'—')}</b>
      ${crNom?`<span class="tag"><i class="ti ti-building"></i> ${esc(crNom)}</span>`:''}
      <span class="tag">${new Date(r.updated_at||r.created_at).toLocaleDateString('fr-FR')}</span>
      ${r.enfant_id?`<span class="tag">Dossier ${esc(enf?((enf.prenom||'')+' '+(enf.nom||'')).trim():'enfant')}</span>`:''}
      <span class="tag">${r.statut==='signe'?'Signé':'Préparé'}</span>
      <button class="iconbtn" onclick="openFill('${id}','${r.id}')"><i class="ti ti-eye"></i></button>
      ${peutSupprimerRep(r)?`<button class="iconbtn d" onclick="delRep('${r.id}','${id}')"><i class="ti ti-trash"></i></button>`:''}
    </div>`;}).join('');
  }
  document.getElementById('ovReps').classList.add('on');
}
/* Une referente ne peut effacer qu’une reponse encore au statut « Prepare »
   ET rattachee a sa propre creche. Une reponse signee, ou celle d’un autre site,
   reste intouchable : seule la direction peut la supprimer. Regle doublee cote
   Supabase par la policy restrictive reps_delete_scoped. */
function peutSupprimerRep(r){
  if(IS_DIRECTION)return true;
  if(!PROF||PROF.role!=='referent'||!PROF.creche_id)return false;
  return r.statut!=='signe' && !!r.creche_id && r.creche_id===PROF.creche_id;
}
async function delRep(rid,did){
  const{data:r0}=await sb.from('documents_reponses').select('statut,creche_id').eq('id',rid).maybeSingle();
  if(r0&&!peutSupprimerRep(r0))return toast('Suppression réservée à la direction');
  if(!confirm('Supprimer cette réponse ?'))return;
  await sb.from('documents_reponses').delete().eq('id',rid);
  openReps(did);
}

/* Modales de saisie : pas de fermeture au clic exterieur.
   Un clic a cote de la carte, ou un glissement de scroll qui se termine sur le
   fond gris, refermait le formulaire et faisait perdre la saisie en cours. */
const OV_SAISIE=['ovFill','ovDoc','ovCat','ovPdf'];
document.querySelectorAll('.ov').forEach(o=>o.addEventListener('click',e=>{if(e.target===o&&OV_SAISIE.indexOf(o.id)===-1)o.classList.remove('on');}));
document.getElementById('liPwd').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
/* Filet de securite : si boot() echoue malgre tout, on montre le formulaire de
   connexion plutot qu'une page blanche. */
boot().catch(e=>{console.error('[boot]',e);showLoginView('Connexion impossible — merci de vous reconnecter.');});
