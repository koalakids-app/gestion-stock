
// ── GÉNÉRATION AUTOMATIQUE DU PLANNING PAR IA ──
// L'IA (edge function generer-planning-ia) reçoit le planning déjà réalisé sur
// N semaines et propose les semaines suivantes en respectant la rotation
// observée. Rien n'est écrit en base avant validation explicite (aperçu).
let _peIAProposal=null,_peIATargetWeeks=[]; // [{semaine, decalage}]

function peOpenIA(){
  if(!_peCurCrecheId||!_peCurEditable)return;
  document.getElementById('pe-ia-step-preview').style.display='none';
  document.getElementById('pe-ia-step-form').style.display='';
  document.getElementById('pe-ia-nb-source').value='4';
  document.getElementById('pe-ia-nb-target').value='4';
  // Par défaut : les 4 semaines qui précèdent celle affichée.
  const defStart=new Date(_peCurSemaine+'T00:00:00');defStart.setDate(defStart.getDate()-28);
  document.getElementById('pe-ia-source-start').value=ipDateToLocalISO(defStart);
  peIAUpdateSub();
  document.getElementById('modal-pe-ia-wrap').classList.add('open');
}

function peIAUpdateSub(){
  const startVal=document.getElementById('pe-ia-source-start').value;
  const nbSource=Math.max(1,Math.min(12,parseInt(document.getElementById('pe-ia-nb-source').value,10)||1));
  const nbTarget=Math.max(1,Math.min(12,parseInt(document.getElementById('pe-ia-nb-target').value,10)||1));
  const sub=document.getElementById('pe-ia-target-sub');
  if(!startVal||!sub){if(sub)sub.textContent='';return;}
  const start=new Date(startVal+'T00:00:00');
  const firstTarget=new Date(start);firstTarget.setDate(start.getDate()+7*nbSource);
  const lastTarget=new Date(firstTarget);lastTarget.setDate(firstTarget.getDate()+7*(nbTarget-1));
  sub.textContent='Semaines générées : du '+firstTarget.toLocaleDateString('fr-FR')+' au '+lastTarget.toLocaleDateString('fr-FR')+'.';
}

async function peLoadWeeksRange(crecheId,startSemaineISO,nbWeeks){
  const start=new Date(startSemaineISO+'T00:00:00');
  const out=[];
  for(let i=0;i<nbWeeks;i++){
    const d=new Date(start);d.setDate(start.getDate()+7*i);
    const semaine=ipDateToLocalISO(d);
    const rows=await peLoad(crecheId,semaine);
    out.push({semaine,rows});
  }
  return out;
}

async function peRunIA(){
  if(!_peCurCrecheId)return;
  const startVal=document.getElementById('pe-ia-source-start').value;
  if(!startVal){alert('Choisissez la semaine de départ des données à analyser.');return;}
  const nbSource=Math.max(1,Math.min(12,parseInt(document.getElementById('pe-ia-nb-source').value,10)||1));
  const nbTarget=Math.max(1,Math.min(12,parseInt(document.getElementById('pe-ia-nb-target').value,10)||1));

  const btn=document.querySelector('#pe-ia-step-form .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Analyse en cours…';}

  try{
    const weeks=await peLoadWeeksRange(_peCurCrecheId,startVal,nbSource);
    const sourceRows=[];
    weeks.forEach((w,semaineIndex)=>{
      w.rows.filter(r=>r.creneau_label).forEach(r=>{
        sourceRows.push({semaineIndex,jour:r.jour,prenom:r.prenom,heureDebut:r.hdebut||null,heureFin:r.hfin||null,pause:r.pause||null});
      });
    });
    if(!sourceRows.length){
      showBanner('Aucun créneau dans les semaines sélectionnées : rien à analyser.','error');
      return;
    }

    const lastSourceDate=new Date(startVal+'T00:00:00');lastSourceDate.setDate(lastSourceDate.getDate()+7*nbSource);
    _peIATargetWeeks=Array.from({length:nbTarget},(_,i)=>{
      const d=new Date(lastSourceDate);d.setDate(lastSourceDate.getDate()+7*i);
      return{decalage:i,semaine:ipDateToLocalISO(d)};
    });

    const r=await fetch(SUPABASE_URL+'/functions/v1/generer-planning-ia',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON_KEY},
      body:JSON.stringify({crecheName:_peCurCrecheName,nbSemainesSource:nbSource,nbSemainesAGenerer:nbTarget,sourceRows})
    });
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data||!Array.isArray(data.semaines)){
      showBanner((data&&data.error)?data.error:'Erreur lors de la génération IA.','error');
      return;
    }

    _peIAProposal=data;
    peRenderIAPreview(data);
    document.getElementById('pe-ia-step-form').style.display='none';
    document.getElementById('pe-ia-step-preview').style.display='';
  }catch(err){
    console.error('[PlanningEquipe IA]',err);
    showBanner('Erreur réseau lors de la génération IA.','error');
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-sparkles"></i> Analyser et générer';}
  }
}

function peRenderIAPreview(data){
  document.getElementById('pe-ia-remarques').textContent=data.remarques||'';
  const body=document.getElementById('pe-ia-preview-body');
  const bySemaine=[...(_peIATargetWeeks||[])].sort((a,b)=>a.decalage-b.decalage);
  body.innerHTML=bySemaine.map(tw=>{
    const semObj=(data.semaines||[]).find(s=>s.decalageSemaines===tw.decalage);
    const creneaux=semObj?.creneaux||[];
    const wsDate=new Date(tw.semaine+'T00:00:00');
    const parJour=DAYS.map((d,i)=>({jour:d,items:creneaux.filter(c=>c.jour===i)}));
    return '<div style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;padding:8px 10px">'
      +'<div style="font-size:12.5px;font-weight:700;color:var(--koala);margin-bottom:6px">Semaine du '+wsDate.toLocaleDateString('fr-FR')+'</div>'
      +(creneaux.length?parJour.map(pj=>pj.items.length?
        '<div style="font-size:12px;margin-bottom:3px"><strong>'+pj.jour+' :</strong> '+pj.items.map(c=>escHtml(c.prenom)+' ('+(c.heureDebut||'?')+'-'+(c.heureFin||'?')+')').join(', ')+'</div>'
        :'').join('')
        :'<div style="font-size:12px;color:#bbb">Aucun créneau proposé.</div>')
      +'</div>';
  }).join('');
}

function peIABackToForm(){
  document.getElementById('pe-ia-step-preview').style.display='none';
  document.getElementById('pe-ia-step-form').style.display='';
}

async function peValidateIA(){
  if(!_peIAProposal||!_peCurCrecheId)return;
  const replace=document.getElementById('pe-ia-replace').checked;
  const btn=document.querySelector('#pe-ia-step-preview .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Écriture…';}

  for(const tw of _peIATargetWeeks){
    const semObj=(_peIAProposal.semaines||[]).find(s=>s.decalageSemaines===tw.decalage);
    const creneaux=semObj?.creneaux||[];
    if(!creneaux.length)continue;
    if(replace){
      const oldTargetRows=await peLoad(_peCurCrecheId,tw.semaine);
      const{error:errDel}=await sb.from('planning_equipe').delete().eq('creche_id',_peCurCrecheId).eq('semaine',tw.semaine);
      if(errDel){console.error('[PlanningEquipe IA] del:',errDel.message);continue;}
      for(const r of oldTargetRows)await peUnsyncReferentPlanning(_peCurCrecheId,tw.semaine,r.jour,r.prenom);
    }
    const rowsToInsert=creneaux.map(c=>{
      const avecPause=c.pauseDebut&&c.pauseFin;
      const creneauLabel=avecPause
        ?peTimeToLabel(c.heureDebut)+'-'+peTimeToLabel(c.pauseDebut)+'/'+peTimeToLabel(c.pauseFin)+'-'+peTimeToLabel(c.heureFin)
        :peTimeToLabel(c.heureDebut)+'-'+peTimeToLabel(c.heureFin);
      return{
        creche_id:_peCurCrecheId,prenom:c.prenom,semaine:tw.semaine,jour:c.jour,type:'presence',label:c.prenom,
        lieu:null,hdebut:c.heureDebut||null,hfin:c.heureFin||null,pause:avecPause?(c.pauseDebut+'-'+c.pauseFin):null,creneau_label:creneauLabel
      };
    });
    const{error}=await sb.from('planning_equipe').insert(rowsToInsert);
    if(error)console.error('[PlanningEquipe IA] insert:',error.message);
    for(const c of creneaux){
      const avecPause=c.pauseDebut&&c.pauseFin;
      await peSyncReferentPlanning(_peCurCrecheId,tw.semaine,c.jour,c.prenom,{
        type:'presence',label:c.prenom,lieu:null,hdebut:c.heureDebut||null,hfin:c.heureFin||null,
        pause:avecPause?(c.pauseDebut+'-'+c.pauseFin):null
      });
    }
    peInvalidate(_peCurCrecheId,tw.semaine);
  }

  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Écrire dans le planning';}
  closeModal('modal-pe-ia-wrap');
  await renderPlanning();
  showBanner('Planning généré par IA ✅');
}

let _peCurCrecheId=null,_peCurSemaine=null,_peCurEditable=false,_peCurCrecheName='';
async function renderPlanningEquipe(){
  const sel=document.getElementById('pe-creche-select');
  const wrap=document.getElementById('pe-grid-wrap');
  if(!sel||!wrap)return;

  let crecheId;
  if(isDirection){
    sel.style.display='';
    if(sel.options.length<=1){
      sel.innerHTML='<option value="">-- Choisir une crèche --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
    }
    crecheId=sel.value;
  }else{
    sel.style.display='none';
    crecheId=currentProfile?.creche_id;
  }

  if(!crecheId){
    wrap.innerHTML='<div style="text-align:center;padding:2rem;color:#bbb;font-size:13px">Sélectionnez une crèche</div>';
    const ncBtn0=document.getElementById('pe-new-creneau-btn'),dwBtn0=document.getElementById('pe-dup-week-btn'),iaBtn0=document.getElementById('pe-ia-btn'),rsBtn0=document.getElementById('pe-resync-btn');
    if(ncBtn0)ncBtn0.style.display='none';
    if(dwBtn0)dwBtn0.style.display='none';
    if(iaBtn0)iaBtn0.style.display='none';
    if(rsBtn0)rsBtn0.style.display='none';
    return;
  }

  const ws=weekStart();const semaine=ipDateToLocalISO(ws);
  if(!_syncSilencieuse)wrap.innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement…</div>';
  const rows=await peLoad(crecheId,semaine);
  await peLoadRemplacantes(crecheId,semaine);
  const crecheName=cacheCreches.find(c=>c.id===crecheId)?.name||'';
  // Éditable pour : la direction, OU la directrice technique dont la propre crèche correspond à celle affichée
  const editable=isDirection||(currentProfile?.creche_id===crecheId);
  _peCurCrecheId=crecheId;_peCurSemaine=semaine;_peCurEditable=editable;_peCurCrecheName=crecheName;
  const peBadge=document.getElementById('pe-badge');
  if(peBadge){
    if(editable){peBadge.textContent='✏️ Modifiable';peBadge.style.background='var(--koala-light)';peBadge.style.color='var(--koala)';}
    else{peBadge.textContent='👁 Lecture seule';peBadge.style.background='#f0f0f5';peBadge.style.color='#888';}
  }
  const ncBtn=document.getElementById('pe-new-creneau-btn'),dwBtn=document.getElementById('pe-dup-week-btn'),iaBtn=document.getElementById('pe-ia-btn'),rsBtn=document.getElementById('pe-resync-btn');
  if(ncBtn)ncBtn.style.display=editable?'':'none';
  if(dwBtn)dwBtn.style.display=(editable&&rows.length)?'':'none';
  if(iaBtn)iaBtn.style.display=editable?'':'none';
  if(rsBtn)rsBtn.style.display=(editable&&rows.length)?'':'none';
  peRenderRefNomRow(crecheId,editable);
  const _peFermBanner=(function(){
    const jrs=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;})
      .map(function(d){return fermetureAt(crecheId,ipDateToLocalISO(d));})
      .filter(Boolean);
    if(!jrs.length)return'';
    const uniq=[...new Set(jrs.map(fermetureLabel))];
    return '<div class="warn" style="background:var(--red-l,#FDE8E8);color:var(--red,#C62828);border-radius:12px;padding:9px 13px;font-size:12.5px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px"><i class="ti ti-door-off"></i> Crèche fermée cette semaine — '+escHtml(uniq.join(', '))+'</div>';
  })();
  wrap.innerHTML=_peFermBanner+getPlanningEquipeTable(rows,semaine,crecheName,crecheId,editable);

  const info=document.getElementById('pe-import-info');
  if(info){
    info.innerHTML='';
    ipDateDernierImportPlanning(crecheId).then(function(d){
      // La crèche affichée a pu changer pendant la requête.
      if(document.getElementById('pe-creche-select')&&getPlanningEquipeCrecheId()!==crecheId)return;
      info.innerHTML=d?ipLibelleFraicheur('Importé le',d)
                      :'<span style="color:var(--muted)">Aucun import enregistré</span>';
    });
  }
}
function getPlanningEquipeCrecheId(){
  const sel=document.getElementById('pe-creche-select');
  return isDirection?(sel?sel.value:''):currentProfile?.creche_id;
}

function getPlanningEquipeTable(rows,semaine,crecheName,crecheId,editable,forPrint,nbWeeksOnPage){
  if(!rows.length){
    if(editable&&!forPrint){
      return '<div style="text-align:center;padding:2rem;color:#999;font-size:13px">Aucun créneau pour cette semaine.<br><span style="font-size:12px">Importez un fichier Excel/PDF, ou construisez le planning à la main.</span>'
        +'<div style="margin-top:12px"><button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="peOpenNewCreneau()"><i class="ti ti-plus"></i> Ajouter un créneau</button></div></div>';
    }
    return '<div style="text-align:center;padding:2rem;color:#bbb;font-size:13px">Aucune donnée pour cette semaine — importez un fichier Excel pour cette crèche.</div>';
  }

  const ws=new Date(semaine+'T00:00:00');
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});

  // Couleur fixe et distincte par professionnelle : les prénoms présents dans cette crèche sont
  // triés alphabétiquement puis répartis à intervalle parfaitement régulier sur le cercle des
  // teintes (360°/n). Stable par prénom (même prénom = toujours la même position alphabétique =
  // toujours la même couleur), et garantit l'écart maximal possible entre toutes les personnes
  // affichées ensemble — pas de collision même avec une équipe nombreuse.
  const _peNamesSorted=[...new Set(rows.map(r=>(r.prenom||'').trim()))].sort((a,b)=>a.localeCompare(b,'fr'));
  const _peColorCache={};
  function peColorForName(prenom){
    const key=(prenom||'').trim();
    if(_peColorCache[key])return _peColorCache[key];
    const idx=_peNamesSorted.indexOf(key);
    const n=_peNamesSorted.length||1;
    const hue=Math.round((idx<0?0:idx)*360/n);
    const color='hsl('+hue+',62%,28%)';
    _peColorCache[key]=color;
    return color;
  }

  // Sépare les événements qui ont un créneau horaire identifiable (ligne classique du fichier)
  // de ceux qui n'en ont pas (fusion de 2 activités, congé, absence) — affichés à part.
  const withCreneau=rows.filter(r=>r.creneau_label);
  const withoutCreneau=rows.filter(r=>!r.creneau_label);

  // Lignes = créneaux distincts, triés par heure de début (déduite du premier événement de ce créneau)
  //
  // La clé de regroupement est le créneau NORMALISÉ (ses plages en minutes), pas
  // le libellé brut : deux sources écrivent le même horaire différemment
  // (« 10H30-13H00 / 14H00-18H30 » venant de l'Excel, « 10h30-13h00/14h00-18h30 »
  // venant de l'import PDF). Regrouper sur le texte brut créait deux lignes
  // visuellement identiques dans le planning, avec les salariés répartis entre
  // les deux. On garde le premier libellé rencontré pour l'affichage et l'édition.
  const creneauOrder=[];
  const byCreneau={};
  const labelOf={};
  const peCreneauKey=lbl=>{
    const segs=peCreneauSegments(lbl);
    return segs?segs.map(s=>s[0]+'-'+s[1]).join('|'):'brut:'+String(lbl||'').toUpperCase().replace(/\s+/g,'');
  };
  withCreneau.forEach(r=>{
    const k=peCreneauKey(r.creneau_label);
    if(!byCreneau[k]){byCreneau[k]=[];labelOf[k]=r.creneau_label;creneauOrder.push(k);}
    byCreneau[k].push(r);
  });
  creneauOrder.sort((a,b)=>{
    const ha=byCreneau[a][0].hdebut||'99:99',hb=byCreneau[b][0].hdebut||'99:99';
    return ha.localeCompare(hb);
  });

  function renderCell(ev,crecheName){
    if(!ev)return '<span style="color:#ddd">—</span>';
    const color=peColorForName(ev.prenom);
    const ailleurs=ev.lieu&&ev.lieu!==crecheName;
    const clickAttr=editable?'onclick="peOpenCellEdit(\''+ev.id+'\',\''+ev.creneau_label.replace(/'/g,"\\'")+'\',\''+ev.jour+'\',\''+crecheId+'\',\''+semaine+'\')" style="cursor:pointer;'+'background:'+color+';color:#fff;border-radius:4px;padding:'+_peBadgePad+';font-size:'+_peFSCell+';text-align:center"':'style="background:'+color+';color:#fff;border-radius:4px;padding:'+_peBadgePad+';font-size:'+_peFSCell+';text-align:center"';
    return '<div '+clickAttr+'>'+
      '<strong>'+ev.prenom+'</strong>'+(ailleurs?' <span style="opacity:0.85">('+ev.lieu+')</span>':'')+
      '</div>';
  }

  // Tailles adaptées selon contexte écran/impression. Quand plusieurs semaines partagent la même
  // page (impression portrait compacte), les cases sont plus resserrées pour que tout tienne.
  nbWeeksOnPage=nbWeeksOnPage||1;
  const _peTier=!forPrint?'screen':(nbWeeksOnPage>=4?'p4':nbWeeksOnPage===3?'p3':nbWeeksOnPage===2?'p2':'p1');
  const _peSizes={
    screen:{fs:'12px',fsCell:'11px',fsDay:'10px',pad:'8px',padCell:'6px',horW:'150px',lh:'1.3',minW:'700px',badgePad:'4px 6px'},
    p1:    {fs:'15px',fsCell:'14px',fsDay:'13px',pad:'16px 14px',padCell:'14px 10px',horW:'230px',lh:'1.6',minW:'1100px',badgePad:'9px 12px'},
    p2:    {fs:'13px',fsCell:'12px',fsDay:'11px',pad:'8px 7px',padCell:'7px 6px',horW:'105px',lh:'1.35',minW:'560px',badgePad:'5px 7px'},
    p3:    {fs:'11px',fsCell:'10px',fsDay:'9px',pad:'6px 5px',padCell:'5px 4px',horW:'88px',lh:'1.25',minW:'490px',badgePad:'4px 6px'},
    p4:    {fs:'10px',fsCell:'9px',fsDay:'8px',pad:'4px 4px',padCell:'4px 3px',horW:'75px',lh:'1.15',minW:'440px',badgePad:'3px 5px'}
  };
  const _peS=_peSizes[_peTier];
  const _peFS=_peS.fs,_peFSCell=_peS.fsCell,_peFSDay=_peS.fsDay,_pePad=_peS.pad,_pePadCell=_peS.padCell,
        _peHoraireW=_peS.horW,_peRowLH=_peS.lh,_peMinW=_peS.minW,_peBadgePad=_peS.badgePad;
  // Chaque plage du créneau est rendue sur sa propre ligne (jamais de césure au milieu d'une heure).
  const _peCreneauLabel=c=>peRenderCreneau(c,_peFSCell,_peFSDay);

  let html='<table style="width:100%;border-collapse:collapse;font-size:'+_peFS+';'+(forPrint?'':'min-width:'+_peMinW+';')+'table-layout:fixed;line-height:'+_peRowLH+'">';
  const _peHorPct=16;
  html+='<colgroup><col style="width:'+_peHorPct+'%">'+DAYS.map(()=>'<col style="width:'+((100-_peHorPct)/5)+'%">').join('')+'</colgroup>';
  html+='<thead><tr><th style="position:sticky;left:0;z-index:2;padding:'+_pePad+';border-bottom:2px solid var(--border);text-align:left;background:#fafafa;color:#333;white-space:nowrap">Horaire</th>';
  DAYS.forEach((d,i)=>{
    const dupIcon=(editable&&!forPrint)?' <i class="ti ti-copy" style="cursor:pointer;opacity:0.55;font-size:'+_peFSDay+'" title="Dupliquer ce jour vers d\'autres jours" onclick="event.stopPropagation();peOpenDuplicateDay('+i+')"></i>':'';
    const _fermD=fermetureAt(crecheId,ipDateToLocalISO(days5[i]));
    html+='<th style="padding:'+_pePad+';border-bottom:2px solid var(--border);text-align:center;background:'+(_fermD?'var(--red-l,#FDE8E8)':'#fafafa')+';color:'+(_fermD?'var(--red,#C62828)':'#333')+'" title="'+(_fermD?escHtml(fermetureLabel(_fermD)):'')+'">'+d+dupIcon+'<br><span style="font-size:'+_peFSDay+';font-weight:400;opacity:0.7">'+fmt(days5[i])+'</span>'+(_fermD?'<br><span style="font-size:'+_peFSDay+';font-weight:800"><i class="ti ti-door-off"></i> Fermé</span>':'')+'</th>';
  });
  html+='</tr></thead><tbody>';

  creneauOrder.forEach(cleCreneau=>{
    const evsThisCreneau=byCreneau[cleCreneau];
    const creneau=labelOf[cleCreneau];
    const creneauEsc=String(creneau||'').replace(/'/g,"\\'");
    html+='<tr><td style="position:sticky;left:0;z-index:1;padding:'+_pePad+';border-bottom:1px solid var(--border);background:#FBFBFD;vertical-align:middle">'+_peCreneauLabel(creneau)+'</td>';
    for(let d=0;d<5;d++){
      // Plusieurs personnes peuvent partager le même créneau le même jour
      const evs=evsThisCreneau.filter(e=>e.jour===d);
      html+='<td style="padding:'+_pePadCell+';border-bottom:1px solid var(--border);word-wrap:break-word;overflow-wrap:break-word">';
      if(evs.length){
        html+=evs.map(e=>renderCell(e,crecheName)).join('<div style="height:4px"></div>');
        if(editable)html+='<div class="pe-add-more" onclick="peOpenCellEdit(null,\''+creneauEsc+'\',\''+d+'\',\''+crecheId+'\',\''+semaine+'\')" title="Ajouter quelqu\'un d\'autre sur ce créneau"><i class="ti ti-plus"></i></div>';
      }else if(editable){
        html+='<div class="pe-add-empty" onclick="peOpenCellEdit(null,\''+creneauEsc+'\',\''+d+'\',\''+crecheId+'\',\''+semaine+'\')">+ ajouter</div>';
      }else{
        html+='<div style="text-align:center"><span style="color:#ddd">—</span></div>';
      }
      html+='</td>';
    }
    html+='</tr>';
  });

  // Les lignes sans créneau (congé, absence, journées combinées) ne sont plus
  // rendues ici : elles alourdissaient le planning à l'écran comme à l'impression
  // sans porter d'horaire. Elles sont désormais remontées sur le dashboard
  // direction (carte « Autres activités du jour », loadDashboardAutres).
  // `withoutCreneau` reste calculé : il sert de compteur pour le pied de tableau.
  if(withoutCreneau.length){
    html+='<tr><td colspan="6" style="padding:'+_pePad+';font-size:'+_peFSDay+';color:var(--muted);font-style:italic;background:#FBFBFD">'
      +withoutCreneau.length+' activité(s) sans horaire (congé, absence, journée combinée) — voir « Absences et congés du jour » sur le dashboard</td></tr>';
  }

  // Continuité de direction : en l'absence de la directrice, la pro qui termine à 18h30
  // (directrice du matin) ou qui commence le plus tôt (directrice du soir) fait office de directeur.
  const _peCont=peContinuiteDirection(withCreneau,crecheId,semaine);
  if(_peCont.some(x=>x.length)){
    html+='<tr><td style="position:sticky;left:0;z-index:1;padding:'+_pePad+';border-top:2px solid var(--border);background:#FBFBFD;vertical-align:middle;font-weight:700;font-size:'+_peFSCell+';color:#3D3580"><i class="ti ti-shield-check"></i> Continuité de direction</td>';
    _peCont.forEach(x=>{
      html+='<td style="padding:'+_pePadCell+';border-top:2px solid var(--border);text-align:center;font-size:'+_peFSCell+';font-weight:700;color:#3D3580;background:#F4F3FB">'+(x.length?x.map(l=>escHtml(l)).join('<br>'):'<span style="color:#ddd;font-weight:400">—</span>')+'</td>';
    });
    html+='</tr>';
  }

  html+='</tbody></table>';
  return html;
}

const _peRemplCache={};
// Charge les noms de l'onglet Remplaçants/tes présents dans la crèche sur la semaine affichée.
async function peLoadRemplacantes(crecheId,semaine){
  const k=crecheId+'_'+semaine;
  const fin=new Date(semaine+'T00:00:00');fin.setDate(fin.getDate()+6);
  const{data,error}=await sb.from('remplacantes').select('nom').eq('creche_id',crecheId).gte('date',semaine).lte('date',ipDateToLocalISO(fin));
  if(error){console.warn('[PlanningEquipe] remplaçantes',error.message);return;}
  _peRemplCache[k]=new Set((data||[]).map(r=>ipNormStr(r.nom)));
}
// Une remplaçante ne peut pas être en continuité de direction : c'est l'autre pro qui prend le
// rôle. Elle est repérée par l'onglet Remplaçants/tes (prénom = nom saisi ou son premier mot),
// ou par une fiche employé de même prénom dont le poste / type de contrat contient « remplaçant/e ».
function peEstRemplacante(prenom,crecheId,semaine){
  const t=ipNormStr(prenom);
  if(!t)return false;
  const noms=_peRemplCache[crecheId+'_'+semaine];
  if(noms&&[...noms].some(n=>n===t||n.split(/\s+/)[0]===t))return true;
  return (cacheEmployes||[]).some(e=>ipNormStr(e.prenom)===t
    &&(!e.creche_id||e.creche_id===crecheId)
    &&ipNormStr((e.poste||'')+' '+(e.type_contrat||'')).includes('remplac'));
}

// Pour chaque jour (0-4), liste de lignes de texte de la continuité de direction.
// - Directrice présente, du matin (début avant 9h30) → la pro qui termine à 18h30.
// - Directrice présente, du soir → la pro qui commence à 7h30.
// - Directrice absente → la pro du matin (7h30) puis la pro du soir (18h30).
// Si un horaire n'a aucune pro éligible (remplaçante écartée), la pro de l'autre horaire la remplace.
function peContinuiteDirection(rows,crecheId,semaine){
  const out=[];
  for(let d=0;d<5;d++){
    const jour=rows.filter(r=>r.jour===d).map(r=>({r,segs:peCreneauSegments(r.creneau_label)})).filter(x=>x.segs);
    if(!jour.length){out.push([]);continue;}
    const noms=l=>[...new Set(l.map(x=>x.r.prenom))].join(', ');
    const dir=jour.filter(x=>peFindReferentIdForPrenom(crecheId,x.r.prenom,true));
    const dirNoms=new Set(dir.map(x=>ipNormStr(x.r.prenom)));
    const autres=jour.filter(x=>!dirNoms.has(ipNormStr(x.r.prenom))&&!peEstRemplacante(x.r.prenom,crecheId,semaine));
    // Ouverture = celle qui commence le plus tôt, fermeture = celle qui termine le plus tard
    // (hors directrice et remplaçantes) : les horaires ne tombent pas toujours pile à 7h30 / 18h30.
    const debutMin=autres.length?Math.min(...autres.map(x=>x.segs[0][0])):null;
    const finMax=autres.length?Math.max(...autres.map(x=>x.segs[x.segs.length-1][1])):null;
    let ouv=autres.filter(x=>x.segs[0][0]===debutMin);
    let fer=autres.filter(x=>x.segs[x.segs.length-1][1]===finMax);
    // Personne d'éligible sur un horaire (ex. remplaçante écartée) : la pro de l'autre horaire prend le rôle.
    if(!ouv.length)ouv=fer;
    if(!fer.length)fer=ouv;
    const lignes=[];
    if(!dir.length){
      if(ouv.length)lignes.push('Matin : '+noms(ouv));
      if(fer.length)lignes.push('Soir : '+noms(fer));
    }else{
      const matin=Math.min(...dir.map(x=>x.segs[0][0]))<570;
      const cand=matin?fer:ouv;
      if(cand.length)lignes.push(noms(cand));
    }
    out.push(lignes);
  }
  return out;
}

// ════════════════════════════════════════════════════════════
// IMPRESSION / EXPORT PDF DES PLANNINGS
// ════════════════════════════════════════════════════════════

// Construit un document HTML imprimable et lance l'impression (iframe caché, compatible mobile/tablette)
function printPlanningDoc(title, subtitle, bodyHTML, orientation){
  orientation=orientation||'landscape';
  const html='<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">'+
    '<title>'+title+'</title>'+
    '<style>'+
      '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:Arial,sans-serif;color:#111;padding:24px;max-width:'+(orientation==='portrait'?'800px':'1400px')+';margin:0 auto}'+
      'h1{font-size:1.5rem;font-weight:bold;margin-bottom:0.2rem;color:#3D3580}'+
      '.sub{font-size:0.85rem;color:#666;margin-bottom:1rem}'+
      'table{width:100%;border-collapse:collapse;margin-top:0.5rem}'+
      'thead tr{background:#3D3580;color:#fff}'+
      'th{padding:8px 10px;font-size:11px;text-align:left}'+
      'td{padding:8px 10px;border-bottom:1px solid #E7E5E0;font-size:11px;vertical-align:top}'+
      'tr:nth-child(even) td{background:#F9F9F8}'+
      '.footer{margin-top:1.5rem;font-size:10px;color:#888;border-top:1px solid #E7E5E0;padding-top:10px}'+
      '@media print{@page{margin:1.2cm;size:'+orientation+'}body{padding:0}}'+
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}'+
    '</style></head><body>'+
    '<h1>'+title+'</h1>'+
    '<div class="sub">'+subtitle+'</div>'+
    bodyHTML+
    '<div class="footer">Document généré le '+new Date().toLocaleDateString('fr-FR')+' à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' — Koala Kids</div>'+
    '</body></html>';

  const existing=document.getElementById('_print-frame-planning');
  if(existing)existing.remove();
  const iframe=document.createElement('iframe');
  iframe.id='_print-frame-planning';
  iframe.style.cssText='position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document;
  doc.open();doc.write(html);doc.close();
  iframe.onload=()=>{
    try{iframe.contentWindow.focus();iframe.contentWindow.print();}
    catch(e){showBanner('Erreur impression : '+e.message,'error');}
  };
}

// Convertit une grille planning-grid (directeur technique ou coordinateur) en tableau imprimable simple
function planningGridToPrintTable(events,semaine){
  const ws=new Date(semaine+'T00:00:00');
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  const labels={presence:'Présence',absent:'Absent',conge:'Congé',formation:'Formation',reunion:'Réunion',detachement:'Détachement',ferie:'Férié',vacances:'Vacances'};
  let html='<table><thead><tr><th>Jour</th><th>Détail</th></tr></thead><tbody>';
  days5.forEach((d,i)=>{
    const evs=events.filter(e=>(e.jour===i||e.day===i));
    let cell;
    if(!evs.length){cell='—';}
    else{
      cell=evs.map(ev=>{
        let t=ev.label||labels[ev.type]||ev.type;
        if(ev.lieu&&ev.lieu!==t)t+=' — '+ev.lieu;
        if(ev.hdebut&&ev.hfin)t+=' ('+formatHeure(ev.hdebut)+'–'+formatHeure(ev.hfin)+')';
        if(ev.pause)t+=' — pause '+ev.pause;
        if(ev.detach_desc||ev.detachDesc)t+=' : '+(ev.detach_desc||ev.detachDesc);
        return t;
      }).join('<br>');
    }
    html+='<tr><td style="font-weight:600;white-space:nowrap">'+DAYS[i]+' '+fmt(d)+'</td><td>'+cell+'</td></tr>';
  });
  html+='</tbody></table>';
  return html;
}

// 1) Planning individuel (directeur technique sélectionné en haut de l'onglet)
async function printPlanningMine(){
  const ws=weekStart();const semaine=ipDateToLocalISO(ws);
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  let personId,personName;
  if(isDirection){
    const sel=document.getElementById('planning-ref-select');
    personId=sel?.value;
    personName=personId?cacheReferents.find(r=>r.id===personId)?.name:'';
    if(!personId){alert('Choisissez d\'abord un/une directeur/trice technique dans la liste avant d\'imprimer.');return;}
  }else{
    personId=currentProfile?.id||currentUser?.id;
    personName=currentProfile?.name||'';
  }
  const evs=await planningLoad(personId,semaine);
  const subtitle=(personName||'Planning')+' — semaine du '+fmt(days5[0])+' au '+fmt(days5[4]);
  printPlanningDoc('Planning individuel',subtitle,planningGridToPrintTable(evs,semaine));
}

// 2) Planning du coordinateur
async function printPlanningCoord(){
  const ws=weekStart();const semaine=ipDateToLocalISO(ws);
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  const coord=getCoordRef();
  if(!coord){alert('Coordinateur non disponible.');return;}
  const evs=await planningLoad(coord.id,semaine);
  const subtitle='Planning du coordinateur — semaine du '+fmt(days5[0])+' au '+fmt(days5[4]);
  printPlanningDoc('Planning du coordinateur',subtitle,planningGridToPrintTable(evs,semaine));
}

