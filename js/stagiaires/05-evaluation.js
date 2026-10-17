// ── Évaluation du stagiaire ───────────────────────────────────────────────
/* Grille « Suivi du stagiaire » (stagiaires AEPE, IEPE, stage découverte).
   Enregistrée à part du reste de la fiche : si le script
   sql/stagiaires_evaluation.sql n'est pas appliqué, le reste de la fiche
   continue de s'enregistrer normalement. */

const STG_EVAL_NIVEAUX=[['tb','Très bien'],['b','Bien'],['a','À améliorer']];
const STG_EVAL_PROFILS={aepe:'AEPE',iepe:'IEPE',eje_stage:'EJE — stage',eje:'EJE — apprentissage',decouverte:'Stage découverte'};
/* Les profils EJE n'utilisent pas la grille Très bien / Bien / À améliorer mais le
   référentiel de compétences STG_EVAL_EJE (06-evaluation-eje-data.js) :
   - « EJE — apprentissage » : chaque indicateur est noté, sur toute la durée du contrat ;
   - « EJE — stage » (quelques semaines) : une note par compétence, limitée aux
     compétences visées par le stage ; les indicateurs se déplient pour détailler.
   « Non observé » distingue ce qui n'a pas été vu de ce qui a été oublié. */
const STG_EVAL_EJE_NIV=[['a','Acquis'],['b',"Besoin d'approfondir"],['n','Non observé']];
const stgEvalEstEje=p=>p==='eje'||p==='eje_stage';
const STG_EVAL_GRILLE=[
  {id:'comportement',titre:'Comportement général',crit:[
    ['presentation','Présentation'],['ponctualite','Ponctualité et assiduité'],
    ['communication','Communication'],['integration',"Volonté de s'intégrer dans l'équipe de travail"],
    ['execution','Exécution du travail demandé'],['hygiene',"Respect des règles d'hygiène et de sécurité"],
    ['fatigue','Résistance à la fatigue'],['motivation','Intérêt, motivation']]},
  {id:'aptitude',titre:'Aptitude professionnelle',crit:[
    ['observation',"Sens de l'observation"],['organisation',"Sens de l'organisation"],
    ['qualite','Qualité du travail fourni'],['rapidite',"Rapidité d'exécution"]]},
  {id:'acquis',titre:'Acquisition pendant la période en entreprise',crit:[
    ['autonomie',"Acquisition d'une certaine autonomie"],['progression','Progression des compétences'],
    ['initiative',"Développement de la prise d'initiative"],['consignes','Meilleure compréhension des consignes']]},
  {id:'activites',titre:'Activités effectuées par le stagiaire',crit:[
    ['accueil',"Accueil de l'enfant et de sa famille"],['quotidien',"Accompagnement de l'enfant dans le quotidien"],
    ['jeu',"Accompagnement de l'enfant dans le jeu"],['locaux','Entretien des locaux']]}
];
/* Critères propres à un profil, ajoutés à la grille « Activités ». */
const STG_EVAL_EXTRA={
  aepe:[['soins',"Soins d'hygiène, repas et sieste"]],
  iepe:[['projet',"Participation au projet pédagogique et aux activités d'éveil"]]
};

function stgEvalProfilDefaut(s){
  const f=((s&&s.formation)||'').toLowerCase();
  if(/\beje\b|[ée]ducateur.*jeunes enfants/.test(f))return stgType(s)==='alternant'?'eje':'eje_stage';
  if(/iepe/.test(f))return 'iepe';
  if(/aepe|accompagnant/.test(f))return 'aepe';
  return stgType(s)==='alternant'?'eje':'decouverte';
}
const stgEvalDe=s=>(s&&s.evaluation&&typeof s.evaluation==='object')?s.evaluation:{};

function stgEvalGrille(profil){
  return STG_EVAL_GRILLE.map(g=>g.id==='activites'?Object.assign({},g,{crit:g.crit.concat(STG_EVAL_EXTRA[profil]||[])}):g);
}

/* Clés stables : indicateur = domaine + rang dans le domaine (dc1_0, dc1_1…),
   compétence = domaine + rang (dc1_c0…). Ne pas réordonner une liste déjà
   utilisée : ajouter à la fin. */
function stgEvalEjeCles(){
  const out=[];
  STG_EVAL_EJE.forEach(d=>{let i=0;d.comps.forEach((c,ci)=>out.push({dc:d,comp:c,ck:d.id+'_c'+ci,inds:c.ind.map(lib=>({k:d.id+'_'+(i++),lib}))}));});
  return out;
}

const stgEvalRadios=(name,attr,cle,val)=>STG_EVAL_EJE_NIV.map(([v,l])=>
  '<td style="text-align:center;padding:4px 2px"><label title="'+escHtml(l)+'" style="cursor:pointer">'
  +'<input type="radio" name="'+name+'" value="'+v+'" '+attr+'="'+cle+'"'+(val===v?' checked':'')+'></label></td>').join('');
const stgEvalEnteteNiv=()=>STG_EVAL_EJE_NIV.map(([,l])=>'<th style="width:64px;padding:5px 2px;font-size:10px;text-transform:uppercase">'+escHtml(l)+'</th>').join('');

/* Choix des compétences visées (format stage) : sans choix, tout est proposé. */
function stgEvalHtmlCibles(cibles,cles){
  return '<details style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;padding:6px 10px"><summary style="cursor:pointer;font-weight:700;font-size:12.5px">'
    +'Compétences visées par ce stage <span style="font-weight:400;color:#777">('+(cibles.length?cibles.length+' choisies':'aucune choisie : toutes affichées')+')</span></summary>'
    +'<p style="font-size:11.5px;color:#777;margin:6px 0">Cochez les compétences attendues pour ce stage (souvent fixées par l\'école) : seules celles-ci seront à évaluer.</p>'
    +STG_EVAL_EJE.map(d=>'<div style="font-weight:700;font-size:12px;margin-top:6px">'+escHtml(d.titre)+'</div>'
      +cles.filter(x=>x.dc===d).map(x=>'<label style="display:block;font-size:12px;padding:2px 0;cursor:pointer"><input type="checkbox" data-kv="'+x.ck+'"'
        +(cibles.indexOf(x.ck)>=0?' checked':'')+' onchange="stgEvalProfilChange()"> '+escHtml(x.comp.lib)+'</label>').join('')).join('')
    +'</details>';
}

/* Référentiel EJE : un domaine par bloc repliable, avec le décompte des éléments notés. */
function stgEvalHtmlEje(ev,stage){
  const notes=ev.eje||{}, comp=ev.eje_comp||{}, comm=ev.eje_comm||{}, cibles=ev.eje_cibles||[];
  const mi=(ev.mi&&ev.mi.eje_comp)||{};
  const miLib=ck=>{const n=(mi[ck]||{}).n, l=STG_EVAL_EJE_NIV.find(x=>x[0]===n);return l?'<div style="font-weight:400;font-size:10.5px;color:#777">À mi-parcours : '+escHtml(l[1])+'</div>':'';};
  const cles=stgEvalEjeCles();
  const html=STG_EVAL_EJE.map(d=>{
    const liste=cles.filter(x=>x.dc===d&&(!stage||!cibles.length||cibles.indexOf(x.ck)>=0));
    if(!liste.length)return '';
    let total=0, faits=0;
    const comps=liste.map(x=>{
      if(stage){total++; if(comp[x.ck]&&comp[x.ck].n)faits++;}
      const rows=x.inds.map(it=>{
        const n=notes[it.k]||''; if(!stage){total++; if(n)faits++;}
        return '<tr><td style="padding:4px 6px;font-size:12px">'+escHtml(it.lib)+'</td>'+stgEvalRadios('stg-eje-'+it.k,'data-ke',it.k,n)+'</tr>';
      }).join('');
      const entete='<tr style="background:var(--koala-light,#EEEDF8)"><th style="text-align:left;padding:5px 6px;font-size:12px">'+escHtml(x.comp.lib)+(stage?miLib(x.ck):'')+'</th>'
        +(stage?stgEvalRadios('stg-comp-'+x.ck,'data-kp',x.ck,(comp[x.ck]||{}).n||''):stgEvalEnteteNiv())+'</tr>';
      if(!stage)return entete+rows;
      const c=(comp[x.ck]||{}).c||'';
      return entete
        +'<tr><td colspan="4" style="padding:2px 6px"><input class="finput" data-kpc="'+x.ck+'" value="'+escHtml(c)+'" style="font-size:12px;padding:4px 7px" placeholder="Commentaire"></td></tr>'
        +'<tr><td colspan="4" style="padding:0 6px 6px"><details><summary style="cursor:pointer;font-size:11.5px;color:#777">Détailler les indicateurs ('+x.inds.length+')</summary>'
        +'<table style="width:100%;border-collapse:collapse"><tr><th></th>'+stgEvalEnteteNiv()+'</tr>'+rows+'</table></details></td></tr>';
    }).join('');
    return '<details'+(stage?' open':'')+' style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;padding:6px 0">'+escHtml(d.titre)
      +' <span style="font-weight:400;color:#777">('+faits+'/'+total+' notés)</span></summary>'
      +(stage?'<table style="width:100%;border-collapse:collapse;margin:6px 0"><tr><th></th>'+stgEvalEnteteNiv()+'</tr>'+comps+'</table>'
             :'<table style="width:100%;border-collapse:collapse;margin:6px 0">'+comps+'</table>')
      +'<label class="flabel">Commentaires généraux '+escHtml(d.titre.split(' ')[0])+'</label>'
      +'<textarea class="finput" data-kd="'+d.id+'" rows="2" style="resize:vertical">'+escHtml(comm[d.id]||'')+'</textarea></details>';
  }).join('');
  return (stage?stgEvalHtmlCibles(cibles,cles):'')+html;
}

function stgEvalHtmlGrille(profil,ev){
  const notes=ev.notes||{};
  const rows=g=>g.crit.map(([k,lib])=>{
    const n=(notes[k]||{}).n||'', c=(notes[k]||{}).c||'';
    return '<tr><td style="padding:5px 6px;font-size:12.5px">'+escHtml(lib)+'</td>'
      +STG_EVAL_NIVEAUX.map(([v,l])=>'<td style="text-align:center;padding:5px 2px"><label title="'+l+'" style="cursor:pointer">'
        +'<input type="radio" name="stg-ev-'+k+'" value="'+v+'" data-k="'+k+'"'+(n===v?' checked':'')+'></label></td>').join('')
      +'<td style="padding:5px 4px"><input class="finput" data-kc="'+k+'" value="'+escHtml(c)+'" style="font-size:12px;padding:4px 7px" placeholder="Commentaire"></td></tr>';
  }).join('');
  return stgEvalGrille(profil).map(g=>'<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead>'
    +'<tr style="background:var(--koala-light,#EEEDF8);font-size:11px;text-transform:uppercase"><th style="text-align:left;padding:5px 6px">'+escHtml(g.titre)+'</th>'
    +STG_EVAL_NIVEAUX.map(([,l])=>'<th style="width:58px;padding:5px 2px">'+l+'</th>').join('')
    +'<th style="width:34%;text-align:left;padding:5px 4px">Commentaire</th></tr></thead><tbody>'+rows(g)+'</tbody></table>').join('');
}

/* Bilan à mi-parcours (stage EJE) : un point d'étape daté, avec les objectifs pour la seconde
   moitié du stage. « Figer » garde une copie des notes par compétence à cet instant, pour
   voir ensuite la progression à côté des notes finales. */
function stgEvalHtmlMi(ev){
  const mi=ev.mi||{}, nb=Object.keys(mi.eje_comp||{}).length;
  return '<details style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;padding:6px 10px"'+(mi.le||mi.bilan||mi.objectifs?' open':'')+'>'
    +'<summary style="cursor:pointer;font-weight:700;font-size:12.5px">Bilan à mi-parcours <span style="font-weight:400;color:#777">('
    +(mi.eje_comp?'figé le '+escHtml(stgDateFr(mi.le))+', '+nb+' compétence'+(nb>1?'s':'')+' notée'+(nb>1?'s':''):'pas encore figé')+')</span></summary>'
    +'<div class="fg" style="margin-top:8px"><label class="flabel">Bilan de la première moitié du stage</label>'
    +'<textarea class="finput" id="stg-mi-bilan" rows="3" style="resize:vertical" placeholder="Points forts, difficultés rencontrées">'+escHtml(mi.bilan||'')+'</textarea></div>'
    +'<div class="fg"><label class="flabel">Objectifs d\'ici la fin du stage</label>'
    +'<textarea class="finput" id="stg-mi-obj" rows="3" style="resize:vertical" placeholder="Sur quoi progresser, compétences à travailler">'+escHtml(mi.objectifs||'')+'</textarea></div>'
    +'<div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">'
    +'<div class="fg" style="max-width:200px;margin:0"><label class="flabel">Bilan du</label><input class="finput" type="date" id="stg-mi-date" value="'+escHtml(mi.le||todayStr())+'"></div>'
    +'<button class="btn-primary" type="button" onclick="stgEvalMiFiger()"><i class="ti ti-flag"></i> '+(mi.eje_comp?'Mettre à jour':'Figer')+' le bilan à mi-parcours</button></div>'
    +'<p style="font-size:11.5px;color:#777;margin:6px 0 0">Les notes par compétence saisies ci-dessous sont copiées à cette date ; vous pouvez ensuite continuer à les modifier pour l\'évaluation finale.</p>'
    +'</details>';
}

function stgRenderEval(){
  const zone=document.getElementById('stg-eval-zone');
  if(!zone)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s){zone.innerHTML='';return;}
  const ev=stgEvalDe(s);
  const profil=(document.getElementById('stg-eval-profil')||{}).value||ev.profil||stgEvalProfilDefaut(s);
  zone.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-clipboard-check" style="color:var(--koala)"></i> Évaluation '+(profil==='eje'?"de l'apprenti·e":'du stagiaire')+'</div>'
    +'<select class="finput" id="stg-eval-profil" onchange="stgEvalProfilChange()" style="width:auto;font-size:12px;padding:4px 8px">'
    +Object.keys(STG_EVAL_PROFILS).map(k=>'<option value="'+k+'"'+(k===profil?' selected':'')+'>'+STG_EVAL_PROFILS[k]+'</option>').join('')
    +'</select></div>'
    +(profil==='eje_stage'?stgEvalHtmlMi(ev):'')
    +(stgEvalEstEje(profil)?stgEvalHtmlEje(ev,profil==='eje_stage'):stgEvalHtmlGrille(profil,ev))
    +'<div class="fg"><label class="flabel">Appréciation générale</label>'
    +'<textarea class="finput" id="stg-eval-appr" rows="3" style="resize:vertical">'+escHtml(ev.appreciation||'')+'</textarea></div>'
    +'<div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">'
    +'<div class="fg" style="max-width:200px;margin:0"><label class="flabel">Évaluation du</label><input class="finput" type="date" id="stg-eval-date" value="'+escHtml(s.evaluation_le||todayStr())+'"></div>'
    +'<button class="btn-primary" type="button" onclick="stgEvalSave()"><i class="ti ti-check"></i> Enregistrer l\'évaluation</button>'
    +'<button class="btn-cancel" type="button" onclick="stgEvalImprimer()"><i class="ti ti-printer"></i> Imprimer</button></div>';
}

/* Relit la grille affichée. Ce qui n'est pas à l'écran (autre profil, compétence non visée)
   est conservé tel quel : on ne met à jour que les éléments réellement affichés. */
function stgEvalLire(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const base=stgEvalDe(s);
  const profil=(document.getElementById('stg-eval-profil')||{}).value||'decouverte';
  const zone=document.getElementById('stg-eval-zone');
  const q=sel=>Array.from(zone.querySelectorAll(sel));
  const copie=o=>JSON.parse(JSON.stringify(o||{}));
  let notes=copie(base.notes), eje=copie(base.eje), eje_comp=copie(base.eje_comp), eje_comm=copie(base.eje_comm);
  let eje_cibles=Array.isArray(base.eje_cibles)?base.eje_cibles.slice():[];
  const mi=copie(base.mi), miBilan=document.getElementById('stg-mi-bilan');
  if(miBilan){
    mi.bilan=miBilan.value.trim(); mi.objectifs=((document.getElementById('stg-mi-obj')||{}).value||'').trim();
    const d=(document.getElementById('stg-mi-date')||{}).value; if(d&&mi.eje_comp)mi.le=d;
  }
  if(stgEvalEstEje(profil)){
    q('input[data-ke]').forEach(r=>{delete eje[r.dataset.ke];});
    q('input[data-ke]:checked').forEach(r=>{eje[r.dataset.ke]=r.value;});
    q('input[data-kp]').forEach(r=>{delete eje_comp[r.dataset.kp];});
    q('input[data-kp]:checked').forEach(r=>{eje_comp[r.dataset.kp]={n:r.value};});
    q('input[data-kpc]').forEach(i=>{
      const c=i.value.trim();
      if(c)eje_comp[i.dataset.kpc]=Object.assign(eje_comp[i.dataset.kpc]||{},{c});
    });
    q('textarea[data-kd]').forEach(a=>{const c=a.value.trim();if(c)eje_comm[a.dataset.kd]=c;else delete eje_comm[a.dataset.kd];});
    if(q('input[data-kv]').length)eje_cibles=q('input[data-kv]:checked').map(c=>c.dataset.kv);
  }else{
    notes={};
    q('input[type=radio][data-k]:checked').forEach(r=>{notes[r.dataset.k]={n:r.value};});
    q('input[data-kc]').forEach(i=>{
      const c=i.value.trim();
      if(c)notes[i.dataset.kc]=Object.assign(notes[i.dataset.kc]||{},{c});
    });
  }
  const res={profil,notes,eje,eje_comp,eje_comm,eje_cibles,appreciation:((document.getElementById('stg-eval-appr')||{}).value||'').trim()};
  if(mi.bilan||mi.objectifs||mi.eje_comp)res.mi=mi;
  return res;
}

/* Changer de profil ajoute ou retire un critère : on garde ce qui est saisi. */
function stgEvalProfilChange(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  const lu=stgEvalLire(), d=(document.getElementById('stg-eval-date')||{}).value;
  s.evaluation=lu; if(d)s.evaluation_le=d;
  stgRenderEval();
}

async function stgEvalSave(evFixe){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  const ev=evFixe&&evFixe.profil?evFixe:stgEvalLire();
  const le=(document.getElementById('stg-eval-date')||{}).value||null;
  const ok=await dbUpdate('stagiaires',s.id,{evaluation:ev,evaluation_le:le});
  if(!ok){
    return showBanner(/evaluation/i.test(window._lastDbError||'')
      ?"Enregistrement impossible : le script sql/stagiaires_evaluation.sql n'a pas encore été exécuté sur Supabase."
      :'Enregistrement impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  }
  s.evaluation=ev; s.evaluation_le=le;
  showBanner('Évaluation enregistrée ✅');
  return true;
}

async function stgEvalMiFiger(){
  const ev=stgEvalLire();
  const mi=ev.mi||{};
  mi.eje_comp=JSON.parse(JSON.stringify(ev.eje_comp||{}));
  mi.le=(document.getElementById('stg-mi-date')||{}).value||todayStr();
  ev.mi=mi;
  if(await stgEvalSave(ev)){
    const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
    if(s)s.evaluation=ev;
    stgRenderEval();
  }
}

/* Version papier, à signer : même présentation que le document de suivi. */
function stgEvalImprimer(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  const ev=stgEvalLire(), crecheNom=stgCrecheName(s.creche_id)||'';
  const d=(document.getElementById('stg-eval-date')||{}).value;
  const croix=(n,v)=>n===v?'✔':'';
  const NIV=STG_EVAL_EJE_NIV, stage=ev.profil==='eje_stage';
  const tabEje=()=>{
    const cles=stgEvalEjeCles(), cib=ev.eje_cibles||[];
    return STG_EVAL_EJE.map(d=>{
      const liste=cles.filter(x=>x.dc===d&&(!stage||!cib.length||cib.indexOf(x.ck)>=0));
      if(!liste.length)return '';
      const miC=(ev.mi&&ev.mi.eje_comp)||{};
      const miL=ck=>{const l=NIV.find(x=>x[0]===(miC[ck]||{}).n);return l?l[1]:'';};
      const ligne=(lib,n,c,ind,ck)=>'<tr><td'+(ind?' style="padding-left:18px"':'')+'>'+escHtml(lib)+'</td>'+NIV.map(([v])=>'<td class="c">'+croix(n,v)+'</td>').join('')+'<td>'+escHtml(c||'')+'</td>'+(stage?'<td class="c">'+escHtml(ck?miL(ck):'')+'</td>':'')+'</tr>';
      const corps=liste.map(x=>{
        if(!stage)return '<tr><th colspan="5" style="text-align:left">'+escHtml(x.comp.lib)+'</th></tr>'+x.inds.map(it=>ligne(it.lib,ev.eje[it.k],'',true)).join('');
        const cp=ev.eje_comp[x.ck]||{};
        /* Format stage : la compétence, puis seulement les indicateurs détaillés. */
        return ligne(x.comp.lib,cp.n,cp.c,false,x.ck)+x.inds.filter(it=>ev.eje[it.k]).map(it=>ligne(it.lib,ev.eje[it.k],'',true)).join('');
      }).join('');
      return '<h2>'+escHtml(d.titre)+'</h2><table><tr><th style="text-align:left">'+(stage?'Compétences':'Compétences / indicateurs')+'</th>'
        +NIV.map(([,l])=>'<th>'+escHtml(l)+'</th>').join('')+'<th>Commentaire</th>'+(stage?'<th>Mi-parcours</th>':'')+'</tr>'+corps
        +'</table><p><b>Commentaires :</b> '+escHtml((ev.eje_comm||{})[d.id]||'')+'</p>';
    }).join('');
  };
  const tab=g=>'<table><tr><th style="text-align:left">'+escHtml(g.titre)+'</th>'+STG_EVAL_NIVEAUX.map(([,l])=>'<th>'+l+'</th>').join('')+'<th>Commentaire</th></tr>'
    +g.crit.map(([k,lib])=>{const x=ev.notes[k]||{};
      return '<tr><td>'+escHtml(lib)+'</td>'+STG_EVAL_NIVEAUX.map(([v])=>'<td class="c">'+croix(x.n,v)+'</td>').join('')+'<td>'+escHtml(x.c||'')+'</td></tr>';}).join('')+'</table>';
  const w=window.open('','_blank');
  if(!w)return showBanner("Autorisez l'ouverture de fenêtres pour imprimer.",'error');
  w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Suivi du stagiaire</title><style>'
    +'body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{font-size:18px}h2{font-size:14px;margin:14px 0 6px;page-break-before:auto}table{width:100%;border-collapse:collapse;margin-bottom:12px}'
    +'th,td{border:1px solid #444;padding:4px 6px}th{background:#eee;font-size:11px}td.c{text-align:center;width:60px}.sig{height:70px}</style></head><body>'
    +'<h1>'+(stgEvalEstEje(ev.profil)?"ÉVALUATION DES COMPÉTENCES — EJE":'SUIVI DU STAGIAIRE')+'</h1>'
    +'<p><b>'+(ev.profil==='eje'?'Apprenti·e':'Stagiaire')+' :</b> '+escHtml(stgNomComplet(s))+'<br><b>Formation :</b> '+escHtml(STG_EVAL_PROFILS[ev.profil]||'')+(s.formation?' — '+escHtml(s.formation):'')
    +'<br><b>Période d\'accueil :</b> du '+escHtml(stgDateFr(s.date_debut))+' au '+escHtml(stgDateFr(s.date_fin))
    +'<br><b>Structure :</b> '+escHtml(crecheNom)+'</p>'
    +(stage&&ev.mi&&(ev.mi.bilan||ev.mi.objectifs||ev.mi.eje_comp)?'<h2>Bilan à mi-parcours'+(ev.mi.le?' ('+escHtml(stgDateFr(ev.mi.le))+')':'')+'</h2><p><b>Bilan :</b><br>'+escHtml(ev.mi.bilan||'').replace(/\n/g,'<br>')+'</p><p><b>Objectifs d\'ici la fin du stage :</b><br>'+escHtml(ev.mi.objectifs||'').replace(/\n/g,'<br>')+'</p>':'')
    +(stgEvalEstEje(ev.profil)?tabEje():stgEvalGrille(ev.profil).map(tab).join(''))
    +'<p><b>Appréciation générale :</b><br>'+escHtml(ev.appreciation).replace(/\n/g,'<br>')+'</p>'
    +'<p>Le '+escHtml(stgDateFr(d))+'</p><table><tr><th>Noms + signatures</th></tr><tr><td class="sig"></td></tr></table>'
    +'<script>window.onload=function(){window.print()}<\/script></body></html>');
  w.document.close();
}
