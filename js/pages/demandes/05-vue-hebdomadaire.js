
// ── VUE HEBDOMADAIRE ──
/* Deux présentations d'un même jeu de données :
   'grille'   → une ligne par enfant, une colonne par jour (contrôle des présences) ;
   'synthese' → les totaux repas par jour d'abord, le détail enfant replié dessous
                (c'est la vue qui prépare le bon de commande du traiteur). */
let _hebdoExportCtx=null,_hebdoView='grille',_hebdoSource='planning';
function hebdoMoveWeek(delta){
  if(delta==='today')weekOffset=0; else weekOffset+=delta;
  renderPresence();
}

/* ── Prévision d'une semaine non encore saisie ──────────────────────────────
   La commande traiteur part 1 à 2 semaines à l'avance : si le planning de la
   semaine visée n'est pas encore importé, on déduit la semaine type de chaque
   enfant de ses 4 semaines précédentes. Un jour est prévu présent si l'enfant
   y était au moins une fois sur deux parmi les semaines RÉELLEMENT saisies
   (une semaine sans aucun import ne compte pas et ne fait donc pas baisser la
   fréquence). Les enfants sans aucune présence sur la période sont ignorés :
   ce sont, le plus souvent, des départs. */
async function hebdoPrevision(allEnfants,days5){
  const ids=allEnfants.map(function(e){return e.id;});
  const ref=[];
  for(let w=1;w<=4;w++)for(let d=0;d<5;d++){
    const x=new Date(days5[0]);x.setDate(x.getDate()-w*7+d);
    ref.push({iso:ipDateToLocalISO(x),jour:d,sem:w});
  }
  let data=[];
  try{
    const r=await sb.from('presences').select('*').in('presence_date',ref.map(function(x){return x.iso;})).in('enfant_id',ids);
    if(r.error)throw r.error;
    data=r.data||[];
  }catch(err){console.warn('[Prévision] lecture historique',err);return null;}
  if(!data.length)return null;
  const st={};
  data.forEach(function(p){
    if(p.status!=='present'&&p.status!=='partial')return;
    st[p.enfant_id+'_'+p.presence_date]=st[p.enfant_id+'_'+p.presence_date]||{};
    st[p.enfant_id+'_'+p.presence_date][p.slot]=true;
  });
  /* Un import de planning couvre une semaine entière : c'est donc au niveau de la
     SEMAINE qu'on décide si la période a été saisie. Compter jour par jour serait
     trompeur — un mardi peu fréquenté ferait passer pour « habituel » un enfant vu
     une seule fois. Les semaines sans aucune donnée ne comptent pas et ne font donc
     pas baisser artificiellement la fréquence. */
  const semSaisies=[1,2,3,4].filter(function(w){
    return ref.some(function(x){
      return x.sem===w&&data.some(function(p){return p.presence_date===x.iso;});
    });
  });
  const nbSem=semSaisies.length;
  if(!nbSem)return null;
  const prev={};
  allEnfants.forEach(function(e){
    let vus=0;
    const parJour=[0,1,2,3,4].map(function(d){
      const occ=ref.filter(function(x){return x.jour===d&&semSaisies.indexOf(x.sem)>=0;})
                   .map(function(x){return st[e.id+'_'+x.iso];}).filter(Boolean);
      vus+=occ.length;
      if(!occ.length)return null;
      if(occ.length*2<nbSem)return null;             // moins d'une semaine sur deux
      /* Créneau prévu : journée dès que l'enfant a été vu sur les deux demi-journées,
         sinon la demi-journée observée. */
      const nbM=occ.filter(function(o){return o.M;}).length,nbA=occ.filter(function(o){return o.A;}).length;
      if(nbM&&nbA)return'j';
      return nbM?'m':'a';
    });
    if(vus)prev[e.id]=parJour;
  });
  return Object.keys(prev).length?prev:null;
}
function hebdoSetView(v){
  _hebdoView=v;
  const g=document.getElementById('hebdo-chip-grille'),s=document.getElementById('hebdo-chip-synthese');
  if(g)g.classList.toggle('active',v==='grille');
  if(s)s.classList.toggle('active',v==='synthese');
  renderPresence();
}
window.hebdoMoveWeek=hebdoMoveWeek;
window.hebdoSetView=hebdoSetView;

async function renderPresenceHebdo(){
  const ws=weekStart(),view=document.getElementById('presence-hebdo-view');
  if(!view)return;
  const crecheId=getPresenceCrecheId();
  const lblEl=document.getElementById('hebdo-week-label');
  if(isDirection&&!crecheId){view.innerHTML='<div class="empty-state"><i class="ti ti-building"></i><p>Sélectionnez une crèche.</p></div>';_hebdoExportCtx=null;if(lblEl)lblEl.textContent='';return;}
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  const dateStrs=days5.map(d=>ipDateToLocalISO(d));
  // Libellé compact : les dates jour par jour figurent déjà sur les cartes en dessous.
  if(lblEl){
    const memeMois=days5[0].getMonth()===days5[4].getMonth();
    lblEl.textContent=days5[0].getDate()
      +(memeMois?'':' '+days5[0].toLocaleDateString('fr-FR',{month:'long'}))
      +' au '+days5[4].toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})
      +' (S'+hebdoNumSemaine(days5[0])+')';
  }
  const allEnfants=(crecheId?cacheEnfants.filter(e=>e.creche_id===crecheId):[...cacheEnfants]).sort((a,b)=>(a.prenom||'').localeCompare((b.prenom||''),'fr',{sensitivity:'base'})||((a.nom||'').localeCompare((b.nom||''),'fr',{sensitivity:'base'})));
  if(!allEnfants.length){view.innerHTML='<div class="empty-state"><i class="ti ti-users"></i><p>Aucun enfant enregistré.</p></div>';_hebdoExportCtx=null;return;}
  if(!_syncSilencieuse)view.innerHTML='<div style="font-size:12px;color:var(--muted);padding:0.5rem 0">Chargement…</div>';
  let presData=[];
  try{
    const{data,error}=await sb.from('presences').select('*').in('presence_date',dateStrs).in('enfant_id',allEnfants.map(e=>e.id));
    if(error)throw error;
    presData=data||[];
  }catch(err){console.warn('[Hebdo] lecture présences',err);}
  const pm={};
  presData.forEach(function(p){pm[p.enfant_id+'_'+p.presence_date+'_'+p.slot]=p.status;});
  /* slot : 'j' journée · 'm' matin seul · 'a' après-midi seul · null absent */
  function statutJour(enfantId,dateStr){
    const m=pm[enfantId+'_'+dateStr+'_M'],a=pm[enfantId+'_'+dateStr+'_A'];
    const mOk=m==='present'||m==='partial',aOk=a==='present'||a==='partial';
    if(mOk&&aOk)return{present:true,slot:'j',label:'Journée'};
    if(mOk)return{present:true,slot:'m',label:'Matin'};
    if(aOk)return{present:true,slot:'a',label:'Après-midi'};
    return{present:false,slot:null,label:''};
  }
  /* ── Horaires affichés dans les cases ──────────────────────────────────────
     La case porte les horaires plutôt que le mot « Journée ». Trois sources,
     de la plus fiable à la plus théorique :
       1. l'horaire réellement enregistré ce jour-là (lu sur le planning PDF) ;
       2. à défaut, l'horaire du contrat d'accueil qui couvre cette date ET ce
          jour de la semaine ;
       3. à défaut, le libellé Journée / Matin / Après-midi comme avant.
     Une demi-journée sans horaire enregistré garde son libellé : le contrat
     décrit une journée entière et l'afficher tel quel serait faux. */
  const phm={};
  presData.forEach(function(p){
    if(!p.heure_debut&&!p.heure_fin)return;
    const k=p.enfant_id+'_'+p.presence_date;
    const o=phm[k]||(phm[k]={});
    if(p.heure_debut&&(!o.hd||p.heure_debut<o.hd))o.hd=p.heure_debut;
    if(p.heure_fin&&(!o.hf||p.heure_fin>o.hf))o.hf=p.heure_fin;
  });
  const ctHebdo={};
  try{
    const{data:ctData}=await sb.from('enfants_contrats').select('*').in('enfant_id',allEnfants.map(e=>e.id));
    (ctData||[]).forEach(function(c){
      const jours=ctParseJours(c.jours);
      dateStrs.forEach(function(ds,i){
        if(c.date_debut&&c.date_debut>ds)return;
        if(c.date_fin&&c.date_fin<ds)return;
        if(jours.indexOf(i+1)<0)return;
        const kk=String(c.enfant_id)+'_'+i;
        if(!ctHebdo[kk]||(c.date_debut||'')>(ctHebdo[kk].date_debut||''))ctHebdo[kk]=c;
      });
    });
  }catch(err){console.warn('[Hebdo] lecture contrats',err);}
  /* Format compact de la feuille d'origine : « 8h-18h », « 7h45-17h45 ». */
  function hCompact(t){
    const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));
    if(!m)return'';
    return parseInt(m[1],10)+'h'+(m[2]==='00'?'':m[2]);
  }
  function hebdoHoraires(enfantId,i,slot){
    const rec=phm[enfantId+'_'+dateStrs[i]];
    if(rec&&rec.hd&&rec.hf)return hCompact(rec.hd)+'-'+hCompact(rec.hf);
    const ct=ctHebdo[String(enfantId)+'_'+i];
    if(ct&&slot==='j'&&ct.heure_debut&&ct.heure_fin)return hCompact(ct.heure_debut)+'-'+hCompact(ct.heure_fin);
    return SLOT_LBL[slot]||'';
  }
  /* Semaine encore vierge (commande passée à l'avance) → on bascule sur la
     semaine type déduite de l'historique, en le signalant clairement. */
  let prevision=null;
  _hebdoSource='planning';
  if(!presData.length){
    prevision=await hebdoPrevision(allEnfants,days5);
    if(prevision)_hebdoSource='prevision';
  }
  const SLOT_LBL={j:'Journée',m:'Matin',a:'Après-midi'};
  const rows=[];
  allEnfants.forEach(function(e){
    const repas=enfRepasCode(e);
    const cells=days5.map(function(d,i){
      if(prevision){
        const s=(prevision[e.id]||[])[i];
        return s?{present:true,slot:s,horaires:hebdoHoraires(e.id,i,s),repas:repas}:{present:false,slot:null,horaires:'',repas:''};
      }
      const st=statutJour(e.id,dateStrs[i]);
      return st.present?{present:true,slot:st.slot,horaires:hebdoHoraires(e.id,i,st.slot),repas:repas}:{present:false,slot:null,horaires:'',repas:''};
    });
    if(cells.some(function(c){return c.present;})){
      e._repasCode=repas;
      rows.push({enfant:e,cells:cells});
    }
  });
  if(!rows.length){
    view.innerHTML='<div class="empty-state"><i class="ti ti-user-off"></i><p>Aucune présence enregistrée cette semaine'+(crecheId?'':' — sélectionnez une crèche')+'.<br><span style="font-size:12px">Importez le planning (PDF), pointez les présences dans l’onglet « Jour »,<br>ou attendez d’avoir quelques semaines d’historique pour que la prévision fonctionne.</span></p></div>';
    _hebdoExportCtx=null;
    return;
  }
  const totalParJour=days5.map(function(d,i){return rows.filter(function(r){return r.cells[i].present;}).length;});
  const codesUtilises=Object.keys(REPAS_TYPES).filter(function(code){return rows.some(function(r){return r.cells.some(function(c){return c.repas===code;});});});
  const totauxRepas=codesUtilises.map(function(code){return{code:code,parJour:days5.map(function(d,i){return rows.filter(function(r){return r.cells[i].present&&r.cells[i].repas===code;}).length;})};});
  const nbSansRepas=days5.map(function(d,i){return rows.filter(function(r){return r.cells[i].present&&!r.cells[i].repas;}).length;});
  // Les enfants au biberon sont présents mais ne comptent pas dans les repas commandés.
  const totalRepasParJour=days5.map(function(d,i){return rows.filter(function(r){return r.cells[i].present&&r.cells[i].repas!=='BIB';}).length;});
  const crecheLbl=(cacheCreches.find(function(c){return c.id===crecheId;})||{}).name||'Toutes crèches';
  _hebdoExportCtx={crecheLbl:crecheLbl,days5:days5,dateStrs:dateStrs,rows:rows,totalParJour:totalParJour,totalRepasParJour:totalRepasParJour,totauxRepas:totauxRepas,nbSansRepas:nbSansRepas,crecheId:crecheId,source:_hebdoSource};

  const JOURS_LBL=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
  const dFr=function(d){return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});};
  const isSpe=function(code){return code&&code!=='M'&&code!=='G'&&code!=='BB';};

  /* ── Bandeau de synthèse : une carte par jour (effectif + détail repas) ── */
  let stripHtml='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">';
  days5.forEach(function(d,i){
    const chips=totauxRepas.filter(function(t){return t.parJour[i];}).map(function(t){
      return '<span title="'+escHtml(repasLabel(t.code))+'" style="background:#fff;border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:700;color:'+(isSpe(t.code)?'var(--orange-dark)':'var(--koala)')+'">'+t.parJour[i]+'&nbsp;'+escHtml(t.code)+'</span>';
    }).join('');
    const manque=nbSansRepas[i]?'<span title="Date de naissance manquante" style="background:#fff;border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:700;color:var(--red)">'+nbSansRepas[i]+'&nbsp;?</span>':'';
    const _fermJ=fermetureAt(crecheId,dateStrs[i]);
    stripHtml+='<div style="background:'+(_fermJ?'var(--red-l,#FDE8E8)':'var(--koala-light)')+';border-radius:12px;padding:11px 12px 12px" title="'+(_fermJ?escHtml(fermetureLabel(_fermJ)):'')+'">'
      +'<div style="font-size:10.5px;font-weight:700;color:'+(_fermJ?'var(--red,#C62828)':'var(--koala)')+';text-transform:uppercase;letter-spacing:.04em">'+JOURS_LBL[i]+(_fermJ?' · <i class="ti ti-door-off"></i> Fermé':'')+'</div>'
      +'<div style="font-size:10px;color:var(--muted);margin-bottom:6px">'+dFr(d)+'</div>'
      +'<div style="font-size:26px;font-weight:800;color:var(--koala-dark);line-height:1">'+totalParJour[i]+'</div>'
      +'<div style="font-size:10.5px;color:var(--muted);margin-bottom:8px">enfant'+(totalParJour[i]>1?'s':'')+'</div>'
      +'<div style="display:flex;gap:5px;flex-wrap:wrap">'+chips+manque+'</div></div>';
  });
  stripHtml+='</div>';

  /* ── Vue A : grille allégée (1 colonne par jour, repas en pastille près du prénom) ── */
  /* Lisibilité : la journée complète est la norme, elle s'écrit donc sobrement, sans pastille.
     Seules les DEMI-JOURNÉES sont mises en couleur — un enfant présent une seule demi-journée
     change l'effectif de l'autre, c'est la seule information qui mérite d'attirer l'œil ici. */
  const DEMI={m:'Matin',a:'Aprèm'};
  const ajd=ipDateToLocalISO(new Date());
  const _crecheEff=cacheCreches.find(function(c){return c.id===crecheId;})||{};
  const capacite=_crecheEff.capacity||null;
  const capaciteSurnombre=_crecheEff.capacity_surnombre||null;
  const FOND_PAIR='#FAFAFC';
  const jourCourant=function(i){return dateStrs[i]===ajd;};
  const fondCol=function(i,pair){return jourCourant(i)?'#F7F5FF':(pair?FOND_PAIR:'#fff');};

  let grille='<div style="overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:#fff"><table class="hebdo-grille" style="width:100%;border-collapse:separate;border-spacing:0;font-size:13px;min-width:640px">';
  grille+='<thead><tr>';
  // Colonne des noms figée : sur tablette, la grille défile horizontalement.
  grille+='<th style="position:sticky;left:0;z-index:2;background:#fff;text-align:left;padding:11px 8px 11px 16px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap">Enfant</th>';
  days5.forEach(function(d,i){
    const _fermI=fermetureAt(crecheId,dateStrs[i]);
    grille+='<th style="background:'+(_fermI?'var(--red-l,#FDE8E8)':jourCourant(i)?'#F7F5FF':'#fff')+';text-align:center;padding:11px 8px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:'+(_fermI?'var(--red,#C62828)':jourCourant(i)?'var(--koala)':'var(--muted)')+';border-bottom:1px solid var(--border);white-space:nowrap" title="'+(_fermI?escHtml(fermetureLabel(_fermI)):'')+'">'+JOURS_LBL[i]+'<br><span style="font-weight:400;text-transform:none;font-size:10px">'+dFr(d)+'</span>'+(_fermI?'<br><span style="font-size:9.5px;font-weight:800"><i class="ti ti-door-off"></i> Fermé</span>':'')+'</th>';
  });
  grille+='</tr></thead><tbody>';
  rows.forEach(function(r,idxLigne){
    const code=r.enfant._repasCode||'';
    const badge=code
      ?'<span title="'+escHtml(repasLabel(code))+'" style="display:inline-block;background:'+(isSpe(code)?'var(--orange-light)':'var(--koala-light)')+';color:'+(isSpe(code)?'var(--orange-dark)':'var(--koala)')+';border-radius:6px;padding:1px 7px;font-size:10.5px;font-weight:800;margin-left:7px;vertical-align:1px">'+escHtml(code)+'</span>'
      :'<span title="Date de naissance manquante — repas non calculé" style="display:inline-block;background:#FDE8E8;color:var(--red);border-radius:6px;padding:1px 7px;font-size:10.5px;font-weight:800;margin-left:7px;vertical-align:1px">?</span>';
    const pair=idxLigne%2===1;
    grille+='<tr><td style="position:sticky;left:0;z-index:1;background:'+(pair?FOND_PAIR:'#fff')+';padding:9px 8px 9px 16px;white-space:nowrap"><span onclick="enfOpenFiche(\''+r.enfant.id+'\')" style="font-weight:600;color:var(--koala-dark);cursor:pointer">'+escHtml(r.enfant.prenom+' '+(r.enfant.nom||''))+'</span>'+badge+'</td>';
    r.cells.forEach(function(c,i){
      const fond=fondCol(i,pair);
      if(c.present){
        const demi=DEMI[c.slot];
        const txt=c.horaires||demi||'Journée';
        grille+='<td style="text-align:center;padding:8px 6px;background:'+fond+'">'
          +'<span'+(demi?' title="Présent'+(c.slot==='m'?' le matin uniquement':' l\'après-midi uniquement')+'"':'')
          +' style="font-size:12px;font-weight:'+(demi?'700':'600')+';white-space:nowrap;color:'+(demi?'var(--orange-dark)':'var(--koala)')+'">'
          +escHtml(txt)+'</span></td>';
      }else{
        grille+='<td style="text-align:center;padding:8px 6px;background:'+fond+';color:#DAD8E5;font-size:15px">·</td>';
      }
    });
    grille+='</tr>';
  });
  grille+='<tr><td style="position:sticky;left:0;z-index:1;background:var(--koala-light);padding:10px 8px 10px 16px;font-size:12px;font-weight:700;color:var(--koala)">Effectif</td>';
  totalParJour.forEach(function(n,i){
    /* Le seuil d'alerte rouge est l'effectif max en cas de surnombre quand la
       crèche a cette autorisation (accueil exceptionnel à 115%), sinon la
       capacité agréée elle-même — voir sql/creches_capacite_surnombre.sql. */
    const depasse=capacite&&n>(capaciteSurnombre||capacite);
    grille+='<td style="text-align:center;padding:10px 8px;font-size:12px;background:'+(jourCourant(i)?'#E4E0F5':'var(--koala-light)')+'">'
      +'<span style="font-weight:700;color:'+(depasse?'var(--red)':'var(--koala)')+'">'+n+'</span>'
      +(capacite?'<span style="font-weight:500;color:var(--muted);font-size:11px"> / '+capacite+'</span>':'')+'</td>';
  });
  grille+='</tr></tbody></table></div>';
  grille+='<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:11.5px;color:var(--muted);align-items:center">'
    +'<span><span style="font-size:11px;font-weight:600;color:var(--koala)">8h–17h</span> journée entière (horaire enregistré, sinon contrat)</span>'
    +'<span><span style="font-size:11px;font-weight:700;color:var(--orange-dark)">Matin</span> / <span style="font-size:11px;font-weight:700;color:var(--orange-dark)">Aprèm</span> demi-journée&nbsp;: l\'enfant n\'est là qu\'une partie du jour</span>'
    +'<span><span style="display:inline-block;background:var(--koala-light);color:var(--koala);border-radius:6px;padding:1px 7px;font-size:10px;font-weight:800">G</span> repas déduit de l’âge</span>'
    +'<span><span style="display:inline-block;background:var(--orange-light);color:var(--orange-dark);border-radius:6px;padding:1px 7px;font-size:10px;font-weight:800">GSV</span> régime particulier</span>'
    +'</div>';

  /* ── Vue C : synthèse repas d'abord, détail replié en dessous ── */
  let synth='<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:14px"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  synth+='<thead><tr style="background:var(--koala);color:#fff"><th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Type de repas</th>';
  days5.forEach(function(d,i){synth+='<th style="text-align:center;padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase">'+JOURS_LBL[i]+'<br><span style="font-weight:400;font-size:10px;opacity:.75;text-transform:none">'+dFr(d)+'</span></th>';});
  synth+='<th style="text-align:center;padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase">Semaine</th></tr></thead><tbody>';
  totauxRepas.forEach(function(t){
    const sem=t.parJour.reduce(function(s,n){return s+n;},0);
    synth+='<tr style="border-bottom:1px solid #F1F0F7"><td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:'+(isSpe(t.code)?'var(--orange-dark)':'var(--ink2,#2B2A35)')+'">'+escHtml(t.code)+'<span style="display:block;font-size:10.5px;color:var(--muted);font-weight:400">'+escHtml(repasLabel(t.code))+'</span></td>';
    t.parJour.forEach(function(n){synth+='<td style="text-align:center;padding:9px 8px;font-size:14px;font-weight:700;color:'+(n?'var(--koala-dark)':'#DAD8E5')+'">'+(n||'—')+'</td>';});
    synth+='<td style="text-align:center;padding:9px 8px;font-size:14px;font-weight:700;color:var(--koala-dark)">'+sem+'</td></tr>';
  });
  if(nbSansRepas.some(function(n){return n>0;})){
    synth+='<tr style="border-bottom:1px solid #F1F0F7"><td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:var(--red)">?<span style="display:block;font-size:10.5px;color:var(--muted);font-weight:400">date de naissance manquante</span></td>';
    nbSansRepas.forEach(function(n){synth+='<td style="text-align:center;padding:9px 8px;font-size:14px;font-weight:700;color:'+(n?'var(--red)':'#DAD8E5')+'">'+(n||'—')+'</td>';});
    synth+='<td style="text-align:center;padding:9px 8px;font-size:14px;font-weight:700;color:var(--red)">'+nbSansRepas.reduce(function(s,n){return s+n;},0)+'</td></tr>';
  }
  const _nbBib=days5.map(function(d,i){return totalParJour[i]-totalRepasParJour[i];});
  if(_nbBib.some(function(n){return n>0;})){
    synth+='<tr style="border-bottom:1px solid #F1F0F7"><td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:var(--muted)">BIB<span style="display:block;font-size:10.5px;color:var(--muted);font-weight:400">biberon — non compté dans les repas</span></td>';
    _nbBib.forEach(function(n){synth+='<td style="text-align:center;padding:9px 8px;font-size:14px;font-weight:700;color:'+(n?'var(--muted)':'#DAD8E5')+'">'+(n||'—')+'</td>';});
    synth+='<td style="text-align:center;padding:9px 8px;font-size:14px;font-weight:700;color:var(--muted)">'+_nbBib.reduce(function(s,n){return s+n;},0)+'</td></tr>';
  }
  synth+='<tr style="background:var(--koala-light)"><td style="padding:10px 16px;font-size:13px;font-weight:700;color:var(--koala)">Total repas</td>';
  totalRepasParJour.forEach(function(n){synth+='<td style="text-align:center;padding:10px 8px;font-size:15px;font-weight:800;color:var(--koala)">'+n+'</td>';});
  synth+='<td style="text-align:center;padding:10px 8px;font-size:15px;font-weight:800;color:var(--koala)">'+totalRepasParJour.reduce(function(s,n){return s+n;},0)+'</td></tr>';
  synth+='</tbody></table></div>';
  synth+='<details style="border:1px solid var(--border);border-radius:12px;background:#fff"><summary style="padding:11px 16px;cursor:pointer;font-size:12.5px;font-weight:700;color:var(--koala)">Détail par enfant ('+rows.length+' enfant'+(rows.length>1?'s':'')+')</summary><div style="padding:0 14px 14px">'+grille+'</div></details>';

  const bandeauPrev=_hebdoSource==='prevision'
    ?'<div class="info-box" style="background:var(--orange-light);border-color:var(--orange);color:var(--orange-dark);margin-bottom:10px">'
      +'<i class="ti ti-chart-dots" style="font-size:15px"></i> <strong>Prévision</strong> — le planning de cette semaine n’est pas encore importé. '
      +'Les jours affichés sont la semaine type de chaque enfant, déduite des 4 semaines précédentes. '
      +'Vérifiez-les avant de commander : ils seront remplacés dès l’import du vrai planning.</div>'
    :'';
  const entete='<div style="font-size:12px;color:var(--muted);margin-bottom:10px">'
    +'<span>'+rows.length+' enfant(s) présent(s) au moins un jour</span>'
    +(_hebdoSource==='prevision'?' · <span style="color:var(--orange-dark);font-weight:600">prévision</span>':'')
    +'<span id="hebdo-import-info"></span></div>';
  /* Les tuiles par jour redisent, en plus petit, ce que le tableau de synthese
     affiche deja colonne par colonne : on ne les garde donc que sur la grille. */
  view.innerHTML=bandeauPrev+entete+(_hebdoView==='synthese'?synth:stripHtml+grille);

  // Fraîcheur des présences de la semaine affichée, chargée sans retarder le rendu.
  const infoPres=document.getElementById('hebdo-import-info');
  if(infoPres&&_hebdoSource!=='prevision'){
    ipDateDernierePresence(crecheId,dateStrs).then(function(d){
      if(!d||!document.body.contains(infoPres))return;
      infoPres.innerHTML=' · '+ipLibelleFraicheur('saisies le',d);
    });
  }
}
window.renderPresenceHebdo=renderPresenceHebdo;

/* Construit les trois feuilles du classeur — fonction pure, sans accès au DOM.
   `kinds` donne la nature de chaque case (en-tête, bande, total…) : c'est elle
   qui pilote la mise en forme appliquée au fichier. */
/* Prénom seul, comme sur la feuille d'origine — avec l'initiale du nom en
   renfort quand deux enfants partagent le même prénom (« Philomène B »). */
function hebdoPrenoms(rows) {
  const compte = {};
  rows.forEach(function (r) {
    const p = (r.enfant.prenom || '').trim();
    compte[p.toLowerCase()] = (compte[p.toLowerCase()] || 0) + 1;
  });
  const out = {};
  rows.forEach(function (r) {
    const p = (r.enfant.prenom || '').trim();
    const n = (r.enfant.nom || '').trim();
    out[r.enfant.id] = (compte[p.toLowerCase()] > 1 && n) ? p + ' ' + n.charAt(0).toUpperCase() : p;
  });
  return out;
}

function hebdoNumSemaine(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const debut = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - debut) / 86400000 + 1) / 7);
}

function hebdoBuildSheets(ctx) {
  const JOURS_LBL = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'];
  const prenoms = hebdoPrenoms(ctx.rows);
  const semaine = ctx.days5[0].toLocaleDateString('fr-FR') + '\nSemaine ' + hebdoNumSemaine(ctx.days5[0]);
  const titre = 'Présence hebdomadaire enfant — ' + ctx.crecheLbl
    + (ctx.source === 'prevision' ? ' (PRÉVISION)' : '');

  /* Construit une feuille « un bloc par jour ».
     colonnes : liste des champs du bloc, ex. ['nom','horaires','repas'] */
  function feuille(nom, champs, entetes, largeurs, avecRepasTotaux) {
    const bloc = champs.length;
    const total = 2 + bloc * 5;                       // A + B (index) + 5 jours
    const vide = function () { return new Array(total).fill(''); };
    const aoa = [], kinds = [], merges = [];
    const pousse = function (ligne, nature) { aoa.push(ligne); kinds.push(nature); };

    // Lignes 1-2 : titre fusionné + date/semaine
    const l1 = vide(), k1 = vide();
    l1[5] = titre; k1[5] = 't';
    pousse(l1, k1);
    const l2 = vide(), k2 = vide();
    l2[2] = semaine; k2[2] = 'w';
    pousse(l2, k2);
    merges.push({ top: 1, left: 6, bottom: 2, right: 12 });   // F1:L2  (titre)
    merges.push({ top: 2, left: 3, bottom: 2, right: 4 });    // C2:D2  (semaine)
    pousse(vide(), vide());
    pousse(vide(), vide());

    // Ligne 5 : en-têtes, un bloc par jour
    const lh = vide(), kh = vide();
    for (let j = 0; j < 5; j++) {
      for (let c = 0; c < bloc; c++) {
        lh[2 + j * bloc + c] = c === 0 ? JOURS_LBL[j] : entetes[c];
        kh[2 + j * bloc + c] = (entetes[c] === 'REPAS' && c > 0) ? 'hr' : 'h';
      }
    }
    pousse(lh, kh);

    // Lignes enfants
    ctx.rows.forEach(function (r, idx) {
      const l = vide(), k = vide();
      l[1] = idx + 1; k[1] = 'i';
      const bande = idx % 2 === 0;
      for (let j = 0; j < 5; j++) {
        const cell = r.cells[j];
        for (let c = 0; c < bloc; c++) {
          const p = 2 + j * bloc + c;
          if (!cell.present) { l[p] = 'X'; k[p] = bande ? 'xb' : 'x'; continue; }
          const champ = champs[c];
          l[p] = champ === 'nom' ? prenoms[r.enfant.id]
               : champ === 'horaires' ? (cell.horaires || '')
               : (cell.repas || '');
          k[p] = bande ? 'db' : 'd';
        }
      }
      if (bande) k[1] = 'ib';
      pousse(l, k);
    });

    pousse(vide(), vide());

    // Effectif du jour, dans la première colonne de chaque bloc
    const le = vide(), ke = vide();
    le[0] = ''; le[1] = '';
    for (let j = 0; j < 5; j++) { le[2 + j * bloc] = ctx.totalParJour[j]; ke[2 + j * bloc] = 'e'; }
    pousse(le, ke);

    // Détail par code repas : code dans la 1re colonne du bloc, effectif dans la dernière
    if (avecRepasTotaux) {
      ctx.totauxRepas.forEach(function (t) {
        const l = vide(), k = vide();
        for (let j = 0; j < 5; j++) {
          l[2 + j * bloc] = t.code; k[2 + j * bloc] = 'rl';
          l[2 + j * bloc + (bloc - 1)] = t.parJour[j]; k[2 + j * bloc + (bloc - 1)] = 'rc';
        }
        pousse(l, k);
      });
      if (ctx.nbSansRepas.some(function (n) { return n > 0; })) {
        const l = vide(), k = vide();
        for (let j = 0; j < 5; j++) {
          l[2 + j * bloc] = '?'; k[2 + j * bloc] = 'rl';
          l[2 + j * bloc + (bloc - 1)] = ctx.nbSansRepas[j]; k[2 + j * bloc + (bloc - 1)] = 'rc';
        }
        pousse(l, k);
      }
    }

    const cols = [1.2, 4.5];
    for (let j = 0; j < 5; j++) largeurs.forEach(function (w) { cols.push(w); });
    return { nom: nom, aoa: aoa, kinds: kinds, merges: merges, cols: cols, headerRow: 5 };
  }

  return [
    feuille('Présence hebdomadaire', ['nom', 'horaires', 'repas'], ['', 'Horaires', 'REPAS'], [13, 11.7, 7.2], true),
    feuille('Effectifs repas', ['nom', 'repas'], ['', 'REPAS'], [18.5, 7.5], true),
    feuille('Effectifs enfants', ['nom', 'horaires'], ['', 'Horaires'], [17, 11.7], false)
  ];
}

/* ── Mise en forme du fichier Excel (ExcelJS) ─────────────────────────────────
   SheetJS, déjà chargé pour les autres exports, ne sait pas écrire couleurs,
   gras ni bordures dans sa version gratuite : ce classeur-ci passe donc par
   ExcelJS. Si la bibliothèque n'a pas pu être chargée, l'export retombe sur
   SheetJS — le fichier reste correct, seulement sans mise en forme. */
const HEBDO_ROSE='FFFFA8A8';           // bande alternée de la feuille d'origine
const HEBDO_ROUGE='FFC9211E';          // numéro de ligne
const HEBDO_BORD={style:'thin',color:{argb:'FF000000'}};

function hebdoStyleCase(cell,nature){
  if(nature==='')return;
  cell.border={top:HEBDO_BORD,left:HEBDO_BORD,bottom:HEBDO_BORD,right:HEBDO_BORD};
  cell.alignment={horizontal:'center',vertical:'middle'};
  if(nature.slice(-1)==='b')cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:HEBDO_ROSE}};
  switch(nature){
    case 't':  cell.font={name:'Calibri',size:14,bold:true};cell.border=undefined;break;
    case 'w':  cell.font={name:'Calibri',size:11,bold:true};
               cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};break;
    case 'h':  cell.font={name:'Calibri',size:14,bold:true};break;
    case 'hr': cell.font={name:'Calibri',size:10,bold:true};break;
    case 'i': case 'ib':
               cell.font={name:'Calibri',size:12,color:{argb:HEBDO_ROUGE}};break;
    case 'e':  cell.font={name:'Calibri',size:14,bold:true};break;
    case 'rl': cell.font={name:'Calibri',size:14};
               cell.alignment={horizontal:'right',vertical:'middle'};break;
    case 'rc': cell.font={name:'Calibri',size:14};break;
    default:   cell.font={name:'Calibri',size:12};
  }
}

function hebdoRemplirClasseur(wb,sheets){
  sheets.forEach(function(s){
    const ws=wb.addWorksheet(s.nom,{
      views:[{state:'frozen',ySplit:s.headerRow}],
      pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}
    });
    ws.columns=s.cols.map(function(w){return{width:w};});
    s.aoa.forEach(function(ligne,r){
      const row=ws.getRow(r+1);
      ligne.forEach(function(v,c){
        if(v!==''&&v!==null&&v!==undefined)row.getCell(c+1).value=v;
        hebdoStyleCase(row.getCell(c+1),(s.kinds[r]||[])[c]||'');
      });
      row.height=r===0?18:(r===1?24:15.75);
    });
    s.merges.forEach(function(m){ws.mergeCells(m.top,m.left,m.bottom,m.right);});
  });
  return wb;
}

function hebdoFileName(ctx){
  const slug=(ctx.crecheLbl||'creche').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
  return 'presence_hebdo_'+slug+'_'+ctx.dateStrs[0]+'.xlsx';
}
