// ── Évaluation du stagiaire ───────────────────────────────────────────────
/* Grille « Suivi du stagiaire » (stagiaires AEPE, IEPE, stage découverte).
   Enregistrée à part du reste de la fiche : si le script
   sql/stagiaires_evaluation.sql n'est pas appliqué, le reste de la fiche
   continue de s'enregistrer normalement. */

const STG_EVAL_NIVEAUX=[['tb','Très bien'],['b','Bien'],['a','À améliorer']];
const STG_EVAL_PROFILS={aepe:'AEPE',iepe:'IEPE',decouverte:'Stage découverte'};
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
  if(/iepe|éducateur.*jeunes enfants|educateur.*jeunes enfants/.test(f))return 'iepe';
  if(/aepe|accompagnant/.test(f))return 'aepe';
  return 'decouverte';
}
const stgEvalDe=s=>(s&&s.evaluation&&typeof s.evaluation==='object')?s.evaluation:{};

function stgEvalGrille(profil){
  return STG_EVAL_GRILLE.map(g=>g.id==='activites'?Object.assign({},g,{crit:g.crit.concat(STG_EVAL_EXTRA[profil]||[])}):g);
}

function stgRenderEval(){
  const zone=document.getElementById('stg-eval-zone');
  if(!zone)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  const type=(document.getElementById('stg-f-type')||{}).value;
  if(!s||type==='alternant'){zone.innerHTML='';return;}
  const ev=stgEvalDe(s);
  const profil=(document.getElementById('stg-eval-profil')||{}).value||ev.profil||stgEvalProfilDefaut(s);
  const notes=ev.notes||{};
  const rows=g=>g.crit.map(([k,lib])=>{
    const n=(notes[k]||{}).n||'', c=(notes[k]||{}).c||'';
    return '<tr><td style="padding:5px 6px;font-size:12.5px">'+escHtml(lib)+'</td>'
      +STG_EVAL_NIVEAUX.map(([v,l])=>'<td style="text-align:center;padding:5px 2px"><label title="'+l+'" style="cursor:pointer">'
        +'<input type="radio" name="stg-ev-'+k+'" value="'+v+'" data-k="'+k+'"'+(n===v?' checked':'')+'></label></td>').join('')
      +'<td style="padding:5px 4px"><input class="finput" data-kc="'+k+'" value="'+escHtml(c)+'" style="font-size:12px;padding:4px 7px" placeholder="Commentaire"></td></tr>';
  }).join('');
  zone.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-clipboard-check" style="color:var(--koala)"></i> Évaluation du stagiaire</div>'
    +'<select class="finput" id="stg-eval-profil" onchange="stgEvalProfilChange()" style="width:auto;font-size:12px;padding:4px 8px">'
    +Object.keys(STG_EVAL_PROFILS).map(k=>'<option value="'+k+'"'+(k===profil?' selected':'')+'>'+STG_EVAL_PROFILS[k]+'</option>').join('')
    +'</select></div>'
    +stgEvalGrille(profil).map(g=>'<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead>'
      +'<tr style="background:var(--koala-light,#EEEDF8);font-size:11px;text-transform:uppercase"><th style="text-align:left;padding:5px 6px">'+escHtml(g.titre)+'</th>'
      +STG_EVAL_NIVEAUX.map(([,l])=>'<th style="width:58px;padding:5px 2px">'+l+'</th>').join('')
      +'<th style="width:34%;text-align:left;padding:5px 4px">Commentaire</th></tr></thead><tbody>'+rows(g)+'</tbody></table>').join('')
    +'<div class="fg"><label class="flabel">Appréciation générale</label>'
    +'<textarea class="finput" id="stg-eval-appr" rows="3" style="resize:vertical">'+escHtml(ev.appreciation||'')+'</textarea></div>'
    +'<div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">'
    +'<div class="fg" style="max-width:200px;margin:0"><label class="flabel">Évaluation du</label><input class="finput" type="date" id="stg-eval-date" value="'+escHtml(s.evaluation_le||todayStr())+'"></div>'
    +'<button class="btn-primary" type="button" onclick="stgEvalSave()"><i class="ti ti-check"></i> Enregistrer l\'évaluation</button>'
    +'<button class="btn-cancel" type="button" onclick="stgEvalImprimer()"><i class="ti ti-printer"></i> Imprimer</button></div>';
}

/* Relit la grille affichée. */
function stgEvalLire(){
  const notes={};
  document.querySelectorAll('#stg-eval-zone input[type=radio]:checked').forEach(r=>{notes[r.dataset.k]={n:r.value};});
  document.querySelectorAll('#stg-eval-zone input[data-kc]').forEach(i=>{
    const c=i.value.trim();
    if(c)notes[i.dataset.kc]=Object.assign(notes[i.dataset.kc]||{},{c});
  });
  return {profil:(document.getElementById('stg-eval-profil')||{}).value||'decouverte',
          notes,appreciation:((document.getElementById('stg-eval-appr')||{}).value||'').trim()};
}

/* Changer de profil ajoute ou retire un critère : on garde ce qui est saisi. */
function stgEvalProfilChange(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  const lu=stgEvalLire(), d=(document.getElementById('stg-eval-date')||{}).value;
  s.evaluation=lu; if(d)s.evaluation_le=d;
  stgRenderEval();
}

async function stgEvalSave(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  const ev=stgEvalLire();
  const le=(document.getElementById('stg-eval-date')||{}).value||null;
  const ok=await dbUpdate('stagiaires',s.id,{evaluation:ev,evaluation_le:le});
  if(!ok){
    return showBanner(/evaluation/i.test(window._lastDbError||'')
      ?"Enregistrement impossible : le script sql/stagiaires_evaluation.sql n'a pas encore été exécuté sur Supabase."
      :'Enregistrement impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  }
  s.evaluation=ev; s.evaluation_le=le;
  showBanner('Évaluation enregistrée ✅');
}

/* Version papier, à signer : même présentation que le document de suivi. */
function stgEvalImprimer(){
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s)return;
  const ev=stgEvalLire(), crecheNom=stgCrecheName(s.creche_id)||'';
  const d=(document.getElementById('stg-eval-date')||{}).value;
  const croix=(n,v)=>n===v?'✔':'';
  const tab=g=>'<table><tr><th style="text-align:left">'+escHtml(g.titre)+'</th>'+STG_EVAL_NIVEAUX.map(([,l])=>'<th>'+l+'</th>').join('')+'<th>Commentaire</th></tr>'
    +g.crit.map(([k,lib])=>{const x=ev.notes[k]||{};
      return '<tr><td>'+escHtml(lib)+'</td>'+STG_EVAL_NIVEAUX.map(([v])=>'<td class="c">'+croix(x.n,v)+'</td>').join('')+'<td>'+escHtml(x.c||'')+'</td></tr>';}).join('')+'</table>';
  const w=window.open('','_blank');
  if(!w)return showBanner("Autorisez l'ouverture de fenêtres pour imprimer.",'error');
  w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Suivi du stagiaire</title><style>'
    +'body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-bottom:12px}'
    +'th,td{border:1px solid #444;padding:4px 6px}th{background:#eee;font-size:11px}td.c{text-align:center;width:60px}.sig{height:70px}</style></head><body>'
    +'<h1>SUIVI DU STAGIAIRE</h1>'
    +'<p><b>Stagiaire :</b> '+escHtml(stgNomComplet(s))+'<br><b>Formation :</b> '+escHtml(STG_EVAL_PROFILS[ev.profil]||'')+(s.formation?' — '+escHtml(s.formation):'')
    +'<br><b>Période d\'accueil :</b> du '+escHtml(stgDateFr(s.date_debut))+' au '+escHtml(stgDateFr(s.date_fin))
    +'<br><b>Structure :</b> '+escHtml(crecheNom)+'</p>'
    +stgEvalGrille(ev.profil).map(tab).join('')
    +'<p><b>Appréciation générale :</b><br>'+escHtml(ev.appreciation).replace(/\n/g,'<br>')+'</p>'
    +'<p>Le '+escHtml(stgDateFr(d))+'</p><table><tr><th>Noms + signatures</th></tr><tr><td class="sig"></td></tr></table>'
    +'<script>window.onload=function(){window.print()}<\/script></body></html>');
  w.document.close();
}
