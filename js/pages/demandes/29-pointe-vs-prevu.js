
// ── POINTÉ / PRÉVU : comparaison des pointages avec les heures théoriques du planning équipe ──
// Panneau sous la grille du planning équipe (bouton « Pointé / prévu »). Pour chaque personne et
// chaque jour de la semaine affichée : heures prévues (lignes de planning_equipe de type présence,
// heures supplémentaires comprises) contre heures pointées (paires arrivée → départ de la table
// pointages, par employe_id ou salarie_id). Informatif : jamais de blocage, pas de SQL.
// Préfixe ptp ; réservé aux comptes qui peuvent modifier le planning de la crèche affichée.
let _ptpOuvert=false;
const PTP_TOLERANCE=10;   // minutes d'écart acceptées sans signalement
const PTP_ALERTE=30;      // au-delà : rouge

function ptpToggle(){
  _ptpOuvert=!_ptpOuvert;
  const btn=document.getElementById('pe-ptp-btn');
  if(btn)btn.classList.toggle('active',_ptpOuvert);
  ptpRendre();
}

function ptpMinutes(ms){return Math.round(ms/60000);}
function ptpEcartTxt(m){const a=Math.abs(m);return(m>0?'+':m<0?'−':'±')+(a>=60?Math.floor(a/60)+'h'+String(a%60).padStart(2,'0'):a+' min');}
function ptpHeure(d){return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}

// Pointages d'une journée → {min, premiere, derniere, ouvert}
function ptpJournee(evs){
  let debut=null,min=0,premiere=null,derniere=null;
  evs.forEach(e=>{
    const t=new Date(e.horodatage);
    if(e.action==='arrivee'){if(debut===null)debut=t;if(!premiere)premiere=t;}
    else if(e.action==='depart'&&debut!==null){min+=ptpMinutes(t-debut);derniere=t;debut=null;}
  });
  return{min,premiere,derniere,ouvert:debut!==null,n:evs.length};
}

// Identifiants (employes / referents) correspondant à un prénom du planning
function ptpCles(crecheId,prenom){
  const t=ipNormStr(prenom),cles=new Set();
  (cacheEmployes||[]).forEach(e=>{
    if(e.archive_le||(e.creche_id&&e.creche_id!==crecheId))return;
    if(ipNormStr(e.planning_nom||e.prenom)===t)cles.add('e:'+e.id);
  });
  const rid=peFindReferentIdForPrenom(crecheId,prenom,true);
  if(rid){
    cles.add('s:'+rid);
    const rf=(cacheReferents||[]).find(r=>r.id===rid);
    if(rf&&rf.employe_id)cles.add('e:'+rf.employe_id);
  }
  return cles;
}

async function ptpRendre(){
  const box=document.getElementById('pe-ptp-wrap');
  if(!box)return;
  if(!_ptpOuvert||!_peCurCrecheId||!_peCurEditable){box.style.display='none';box.innerHTML='';return;}
  const crecheId=_peCurCrecheId,semaine=_peCurSemaine;
  box.style.display='';
  box.innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement des pointages…</div>';

  const debut=new Date(semaine+'T00:00:00'),fin=new Date(debut);fin.setDate(fin.getDate()+7);
  const jours=Array.from({length:5},(_,i)=>{const d=new Date(debut);d.setDate(d.getDate()+i);return ipDateToLocalISO(d);});
  const{data,error}=await sb.from('pointages').select('employe_id,salarie_id,action,horodatage')
    .eq('creche_id',crecheId).or('employe_id.not.is.null,salarie_id.not.is.null')
    .gte('horodatage',debut.toISOString()).lt('horodatage',fin.toISOString())
    .order('horodatage',{ascending:true});
  if(_peCurCrecheId!==crecheId||_peCurSemaine!==semaine||!_ptpOuvert)return;
  if(error){box.innerHTML='<div style="padding:1rem;color:var(--red);font-size:12px">Pointages indisponibles : '+escHtml(error.message)+'</div>';return;}

  const rows=await peLoad(crecheId,semaine);
  const parCle={};
  (data||[]).forEach(p=>{const k=p.employe_id?'e:'+p.employe_id:'s:'+p.salarie_id;(parCle[k]=parCle[k]||[]).push(p);});

  // Personnes : celles du planning, puis celles qui ont pointé sans figurer au planning.
  const personnes=[];const clesVues=new Set();
  [...new Set(rows.map(r=>r.prenom).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}))
    .forEach(prenom=>{const cles=ptpCles(crecheId,prenom);cles.forEach(c=>clesVues.add(c));personnes.push({prenom,cles});});
  Object.keys(parCle).filter(k=>!clesVues.has(k)).forEach(k=>{
    let nom='?';
    if(k[0]==='e'){const e=(cacheEmployes||[]).find(x=>x.id===k.slice(2));if(e)nom=e.planning_nom||e.prenom||'?';}
    else{const r=(cacheReferents||[]).find(x=>x.id===k.slice(2));if(r)nom=String(r.name||'?').trim().split(/\s+/)[0];}
    personnes.push({prenom:nom,cles:new Set([k]),horsPlanning:true});
  });

  const auj=ipDateToLocalISO(new Date()),maintenant=new Date();
  let totalPointe=0,totalPrevu=0,nbEcarts=0;
  const lignes=personnes.map(pers=>{
    const evs=[];pers.cles.forEach(k=>{(parCle[k]||[]).forEach(e=>evs.push(e));});
    evs.sort((a,b)=>new Date(a.horodatage)-new Date(b.horodatage));
    let sPointe=0,sPrevu=0;
    const cells=jours.map((jour,i)=>{
      const fermee=typeof fermetureAt==='function'&&fermetureAt(crecheId,jour);
      const prevRows=rows.filter(r=>r.jour===i&&ipNormStr(r.prenom)===ipNormStr(pers.prenom));
      const presence=prevRows.filter(r=>!r.type||r.type==='presence');
      const absent=prevRows.find(r=>r.type==='absent'||r.type==='conge');
      let prevu=0,hPrevu='';
      presence.forEach(r=>{const sg=peRowSegs(r);if(sg){prevu+=peSegsTotal(sg);hPrevu=peFmtHeure(sg[0][0])+' → '+peFmtHeure(sg[sg.length-1][1]);}});
      const j=ptpJournee(evs.filter(e=>ipDateToLocalISO(new Date(e.horodatage))===jour));
      const passe=jour<auj,estAuj=jour===auj,futur=jour>auj;
      const vide='<td style="padding:6px;border-bottom:1px solid var(--border);text-align:center;color:#ddd">—</td>';
      if(fermee)return'<td style="padding:6px;border-bottom:1px solid var(--border);text-align:center;color:var(--red);font-size:10.5px"><i class="ti ti-door-off"></i></td>';
      if(!prevu&&!j.n&&!absent)return vide;

      let couleur='var(--green,#2E7D32)',fond='transparent',ligne1,ligne2='',titre='';
      const detailPointe=j.premiere?('Pointé '+ptpHeure(j.premiere)+(j.derniere?' → '+ptpHeure(j.derniere):' → …')):'Aucun pointage';
      titre=detailPointe+(hPrevu?' · prévu '+hPrevu.replace(/ → /,' → '):'');
      if(absent&&!prevu){
        if(j.n){couleur='var(--red,#C62828)';fond='#FDE8E8';ligne1='Pointé·e';ligne2='alors qu\'absent·e';nbEcarts++;}
        else{couleur='#9C9AA8';ligne1='Absent·e';ligne2=PE_ABS_MOTIFS[absent.absence_motif||(absent.type==='conge'?'conge':'autre')];}
      }else if(futur){
        couleur='#9C9AA8';ligne1=peFmtDuree(prevu);ligne2='prévu';
      }else if(!j.n){
        if(estAuj){couleur='#9C9AA8';ligne1='—';ligne2='prévu '+peFmtDuree(prevu);}
        else{couleur='var(--red,#C62828)';fond='#FDE8E8';ligne1='Non pointé';ligne2='prévu '+peFmtDuree(prevu);if(prevu){sPrevu+=prevu;nbEcarts++;}}
      }else if(j.ouvert&&estAuj){
        couleur='#3D3580';fond='#F4F3FB';ligne1='En cours';ligne2='depuis '+ptpHeure(j.premiere);
      }else if(j.ouvert){
        couleur='var(--red,#C62828)';fond='#FDE8E8';ligne1='Départ non pointé';ligne2='prévu '+peFmtDuree(prevu);
        sPrevu+=prevu;nbEcarts++;
      }else{
        const ecart=j.min-prevu;
        sPointe+=j.min;sPrevu+=prevu;
        const a=Math.abs(ecart);
        if(!prevu){couleur='var(--orange-dark,#C95F0A)';fond='#FFF7ED';}
        else if(a>PTP_ALERTE){couleur='var(--red,#C62828)';fond='#FDE8E8';}
        else if(a>PTP_TOLERANCE){couleur='var(--orange-dark,#C95F0A)';fond='#FFF7ED';}
        if(a>PTP_TOLERANCE||!prevu)nbEcarts++;
        ligne1=peFmtDuree(j.min)+' <span style="font-weight:400;color:#9C9AA8">/ '+peFmtDuree(prevu)+'</span>';
        ligne2=prevu?ptpEcartTxt(ecart):'hors planning';
        if(j.premiere&&presence.length&&hPrevu){
          const sg=peRowSegs(presence[0]);
          if(sg){const dm=j.premiere.getHours()*60+j.premiere.getMinutes()-sg[0][0];if(dm>PTP_TOLERANCE)titre+=' · arrivée en retard de '+dm+' min';else if(dm<-PTP_TOLERANCE)titre+=' · arrivée en avance de '+(-dm)+' min';}
        }
      }
      return'<td title="'+escHtml(titre)+'" style="padding:6px;border-bottom:1px solid var(--border);text-align:center;font-size:11.5px;background:'+fond+'"><div style="font-weight:700;color:'+couleur+'">'+ligne1+'</div><div style="font-size:10.5px;color:'+couleur+'">'+ligne2+'</div></td>';
    });
    totalPointe+=sPointe;totalPrevu+=sPrevu;
    const ecartS=sPointe-sPrevu;
    const col=Math.abs(ecartS)<=PTP_TOLERANCE?'var(--green,#2E7D32)':Math.abs(ecartS)<=PTP_ALERTE?'var(--orange-dark,#C95F0A)':'var(--red,#C62828)';
    return'<tr><td style="padding:6px 8px;border-bottom:1px solid var(--border);font-weight:700;white-space:nowrap">'+escHtml(pers.prenom)+(pers.horsPlanning?' <span style="font-weight:400;font-size:10px;color:var(--orange-dark,#C95F0A)">hors planning</span>':'')+'</td>'
      +cells.join('')
      +'<td style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:center;font-size:11.5px;background:#FBFBFD"><div style="font-weight:700">'+peFmtDuree(sPointe)+' <span style="font-weight:400;color:#9C9AA8">/ '+peFmtDuree(sPrevu)+'</span></div><div style="font-size:10.5px;color:'+col+'">'+(sPrevu||sPointe?ptpEcartTxt(sPointe-sPrevu):'—')+'</div></td></tr>';
  });

  const fmt=d=>new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  let html='<div style="padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border)">'
    +'<strong style="font-size:13px;color:#3D3580"><i class="ti ti-clock-check"></i> Pointé / prévu</strong>'
    +'<span style="font-size:11.5px;color:var(--ink2)">'+(nbEcarts?'<strong style="color:var(--orange-dark,#C95F0A)">'+nbEcarts+' écart(s) à vérifier</strong>':'<strong style="color:var(--green,#2E7D32)">Aucun écart</strong>')
    +' · total semaine (jours écoulés) : '+peFmtDuree(totalPointe)+' pointées pour '+peFmtDuree(totalPrevu)+' prévues ('+ptpEcartTxt(totalPointe-totalPrevu)+')</span>'
    +'<button class="btn-sm" style="margin-left:auto;font-size:11px;padding:4px 10px" onclick="ptpCsv()"><i class="ti ti-download"></i> CSV</button></div>';
  if(!personnes.length){
    html+='<div style="padding:1.5rem;text-align:center;color:#bbb;font-size:12.5px">Aucune ligne de planning ni pointage cette semaine.</div>';
  }else{
    html+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px"><thead><tr><th style="padding:6px 8px;text-align:left;background:#fafafa;border-bottom:2px solid var(--border)">Personne</th>'
      +jours.map((j,i)=>'<th style="padding:6px;text-align:center;background:#fafafa;border-bottom:2px solid var(--border)">'+DAYS[i]+'<br><span style="font-size:10px;font-weight:400;opacity:.7">'+fmt(j)+'</span></th>').join('')
      +'<th style="padding:6px 8px;text-align:center;background:#fafafa;border-bottom:2px solid var(--border)">Semaine</th></tr></thead><tbody>'+lignes.join('')+'</tbody></table></div>'
      +'<div style="padding:8px 12px;font-size:10.5px;color:var(--muted)">Prévu = horaires du planning équipe (heures supplémentaires comprises, pauses déduites). Pointé = arrivées / départs de la tablette. Tolérance '+PTP_TOLERANCE+' min ; rouge au-delà de '+PTP_ALERTE+' min. Les jours à venir et le jour en cours ne comptent pas dans le total. Indicatif : un oubli de pointage se corrige dans la fiche du collaborateur.</div>';
  }
  box.innerHTML=html;
  _ptpDernier={personnes:personnes.map(p=>p.prenom),html};
}
let _ptpDernier=null;

// Export CSV de ce qui est affiché (lit le tableau rendu : une ligne par personne, une colonne par jour)
function ptpCsv(){
  const t=document.querySelector('#pe-ptp-wrap table');
  if(!t)return;
  const txt=el=>el.innerText.replace(/\s+/g,' ').trim().replace(/"/g,'""');
  const lignes=[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>'"'+txt(c)+'"').join(';'));
  const blob=new Blob(['﻿'+lignes.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='pointe-vs-prevu-'+(_peCurSemaine||'')+'.csv';document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}

// ── ÉQUIPE SOUS LE GANTT DES ENFANTS (Présences › Jour) ──
// Appelée par renderPresenceGantt (04-filtre-presents-uniquement.js) sous les lignes « Professionnelles »
// et « Enfants / pro ». Une ligne par professionnel·le : prévu du planning équipe (barre grise fine,
// heures supplémentaires et remplacements compris) et pointé (barre verte, repères d'arrivée / départ
// teintés selon l'écart : ≤ 10 min vert, ≤ 30 orange, au-delà rouge). Puis « Pros pointé·es » (orange si
// moins que prévu) et « Enfants / pro (réel) » calculé sur les pointages. Lecture seule, pas de SQL.
async function ptpGanttEquipe(o){
  const{crecheId,dateStr,rows,occ,H_START,COLS,COL_W,NAME_W,DUR_W,isPhone}=o;
  if(!rows||!rows.length)return '';
  const auj=dateStr===todayStr(),futur=dateStr>todayStr();
  const nowM=auj?new Date().getHours()*60+new Date().getMinutes():null;
  let pts=[];
  if(!futur){
    const d0=new Date(dateStr+'T00:00:00'),d1=new Date(d0);d1.setDate(d1.getDate()+1);
    try{
      const{data,error}=await sb.from('pointages').select('employe_id,salarie_id,action,horodatage')
        .eq('creche_id',crecheId).or('employe_id.not.is.null,salarie_id.not.is.null')
        .gte('horodatage',d0.toISOString()).lt('horodatage',d1.toISOString()).order('horodatage',{ascending:true});
      if(error)throw error;pts=data||[];
    }catch(e){console.warn('[Gantt équipe] pointages',e);}
  }
  const parCle={};
  pts.forEach(p=>{const k=p.employe_id?'e:'+p.employe_id:'s:'+p.salarie_id;(parCle[k]=parCle[k]||[]).push(p);});

  const lab=m=>Math.floor(m/60)+'h'+(m%60?String(m%60).padStart(2,'0'):'');
  const px=m=>Math.max(0,Math.min(COLS*COL_W,Math.round((m-H_START*60)/30*COL_W)));
  const teinte=ec=>{
    if(ec===null)return{c:'#1f5c42',bg:'#fff',bd:'#9fd6bb'};
    const a=Math.abs(ec);
    return a>30?{c:'#c62828',bg:'#fff',bd:'#c62828'}:a>10?{c:'#7a3d0c',bg:'#fbd9bd',bd:'#f3bb8f'}:{c:'#1f5c42',bg:'#fff',bd:'#9fd6bb'};
  };
  const signe=n=>(n>0?'+':n<0?'−':'±')+Math.abs(n)+' min';
  const colEcart=a=>a>30?'#c62828':a>10?'#c95f0a':'#1f5c42';

  // Personnes, par heure de début prévue
  const tri=rows.slice().sort((a,b)=>{const sA=peRowSegs(a),sB=peRowSegs(b);return((sA?sA[0][0]:9999)-(sB?sB[0][0]:9999))||String(a.prenom).localeCompare(String(b.prenom),'fr');});
  const noms=[],vus=new Set();
  tri.forEach(r=>{const k=ipNormStr(r.prenom);if(k&&!vus.has(k)){vus.add(k);noms.push(r.prenom);}});

  const nQ=COLS*2,prevQ=new Array(nQ).fill(0),ptQ=new Array(nQ).fill(0);
  const cover=(segs,q)=>{const mid=H_START*60+q*15+7.5;return segs.some(s=>s[0]<=mid&&mid<s[1]);};
  const pieces=[];

  noms.forEach(prenom=>{
    const prows=rows.filter(r=>ipNormStr(r.prenom)===ipNormStr(prenom));
    const pres=prows.filter(r=>!r.type||r.type==='presence');
    const abs=prows.find(r=>r.type==='absent'||r.type==='conge');
    let pv=[];pres.forEach(r=>{const sg=peRowSegs(r);if(sg)pv=pv.concat(sg);});
    pv.sort((a,b)=>a[0]-b[0]);
    const meta=pres.find(r=>r.remplace_prenom||r.heures_sup_min)||{};
    const evs=[];ptpCles(crecheId,prenom).forEach(k=>(parCle[k]||[]).forEach(e=>evs.push(e)));
    evs.sort((a,b)=>new Date(a.horodatage)-new Date(b.horodatage));
    // Paires arrivée → départ ; [début, fin, état] avec état : ferme / cours / oubli
    const pt=[];let deb=null;
    evs.forEach(e=>{
      const d=new Date(e.horodatage),m=d.getHours()*60+d.getMinutes();
      if(e.action==='arrivee'){if(deb===null)deb=m;}
      else if(e.action==='depart'&&deb!==null){pt.push([deb,m,'ferme']);deb=null;}
    });
    if(deb!==null){
      if(auj)pt.push([deb,Math.max(deb,nowM),'cours']);
      else{const fin=pv.find(s=>s[1]>deb);pt.push([deb,fin?fin[1]:deb+30,'oubli']);}
    }
    if(!abs||pv.length){prevQ.forEach((_,q)=>{if(pv.length&&cover(pv,q))prevQ[q]++;});}
    const ptOk=pt.filter(s=>s[2]!=='oubli');
    ptQ.forEach((_,q)=>{if(cover(ptOk,q))ptQ[q]++;});

    const pvTot=pv.reduce((s,x)=>s+x[1]-x[0],0);
    const ptTot=ptOk.reduce((s,x)=>s+x[1]-x[0],0);
    let inner='',tip=prenom+(pv.length?' — prévu '+pv.map(s=>lab(s[0])+' → '+lab(s[1])).join(' / '):''),tot='',sub='',subCol='var(--muted)';
    for(let c=0;c<COLS;c+=2)inner+='<div style="position:absolute;left:'+(c*COL_W)+'px;top:0;bottom:0;border-left:1px solid '+(c===0?'transparent':'#ece9f5')+';pointer-events:none"></div>';
    inner+='<div style="position:absolute;left:'+(12*COL_W)+'px;top:0;bottom:0;border-left:1px dashed #b0a8d8;pointer-events:none"></div>';

    if(abs&&!pv.length){
      const mot=PE_ABS_MOTIFS[abs.absence_motif||(abs.type==='conge'?'conge':'autre')];
      const sg=peRowSegs(abs);
      if(sg)sg.forEach(s=>{inner+='<div style="position:absolute;left:'+px(s[0])+'px;width:'+(px(s[1])-px(s[0]))+'px;top:14px;height:28px;box-sizing:border-box;border:1px dashed #d3d0e0;border-radius:9px;background:repeating-linear-gradient(135deg,#ece9f5 0 6px,transparent 6px 12px);color:var(--muted);font-size:11px;font-weight:600;display:flex;align-items:center;padding:0 9px;white-space:nowrap;overflow:hidden">'+escHtml(mot)+'</div>';});
      tot='—';sub='absent·e';tip+=' — '+mot;
      if(pt.length){inner+=pt.map(s=>'<div style="position:absolute;left:'+px(s[0])+'px;width:'+Math.max(4,px(s[1])-px(s[0]))+'px;top:12px;height:32px;border-radius:9px;background:#fdecea;border:1px solid #c62828"></div>').join('');sub='pointé·e alors qu’absent·e';subCol='#c62828';}
    }else{
      // Prévu : barre fine sous la barre pointée
      pv.forEach(s=>{inner+='<div style="position:absolute;left:'+px(s[0])+'px;width:'+(px(s[1])-px(s[0]))+'px;top:34px;height:7px;border-radius:4px;background:#e8e6ef;border:1px solid #d3d0e0;box-sizing:border-box"></div>';});
      const premier=pt[0],dernier=pt[pt.length-1];
      if(!pt.length){
        const du=pv.length&&!futur&&(!auj||pv[0][0]<=nowM);
        if(du){
          const fin=auj?Math.min(nowM,pv[0][1]):pv[0][1];
          inner+='<div style="position:absolute;left:'+px(pv[0][0])+'px;width:'+Math.max(6,px(fin)-px(pv[0][0]))+'px;top:14px;height:22px;box-sizing:border-box;border-radius:7px;background:#fbd9bd;border:1px solid #f3bb8f;color:#7a3d0c;font-size:10.5px;font-weight:700;display:flex;align-items:center;padding:0 7px;white-space:nowrap;overflow:hidden">'+(px(fin)-px(pv[0][0])>120?'Non pointé':'')+'</div>';
          tot='0h';sub='attendu·e depuis '+lab(pv[0][0]);subCol='#c62828';tip+=' — aucune arrivée pointée';
        }else{tot=futur||pv.length?'':'—';sub=pv.length?'prévu '+peFmtDuree(pvTot):'—';}
      }else{
        pt.forEach((s,k)=>{
          const oubli=s[2]==='oubli',cours=s[2]==='cours';
          const w=Math.max(4,px(s[1])-px(s[0])-2);
          const txt=w>=110?lab(s[0])+(cours?' · en cours':oubli?' · départ oublié':' – '+lab(s[1])):'';
          inner+='<div style="position:absolute;left:'+px(s[0])+'px;width:'+w+'px;top:14px;height:22px;box-sizing:border-box;border-radius:7px;background:'+(oubli?'#fbd9bd':'#c5ead6')+';border:1px solid '+(oubli?'#f3bb8f':'#9fd6bb')+';color:'+(oubli?'#7a3d0c':'#1f5c42')+';font-size:10.5px;font-weight:700;display:flex;align-items:center;padding:0 7px;white-space:nowrap;overflow:hidden'+(cours?';border-right:2px dashed #1f5c42':'')+'">'+txt+'</div>';
        });
        // Repères : première arrivée (au-dessus), départ final (en dessous)
        const rep=(m,ec,dep)=>{
          const t=teinte(ec);
          return '<div style="position:absolute;left:'+px(m)+'px;top:10px;height:34px;width:2px;margin-left:-1px;background:'+t.c+';border-radius:2px;z-index:3;pointer-events:none"></div>'
            +'<div style="position:absolute;left:'+px(m)+'px;top:'+(dep?44:0)+'px;transform:translateX(-50%);font-size:'+(isPhone?9:10)+'px;font-weight:800;line-height:12px;padding:0 4px;border:1px solid '+t.bd+';background:'+t.bg+';color:'+t.c+';border-radius:6px;white-space:nowrap;z-index:4;pointer-events:none">'+lab(m)+'</div>';
        };
        const ecA=pv.length?premier[0]-pv[0][0]:null;
        inner+=rep(premier[0],ecA,false);
        tip+=' — arrivée '+lab(premier[0])+(ecA!==null?' ('+signe(ecA)+')':'');
        const final=dernier[2]==='ferme'&&pt.length>=Math.max(1,pv.length);
        if(final){
          const ecD=pv.length?dernier[1]-pv[pv.length-1][1]:null;
          inner+=rep(dernier[1],ecD,true);
          tip+=' · départ '+lab(dernier[1])+(ecD!==null?' ('+signe(ecD)+')':'');
        }
        // Colonne de droite
        if(dernier[2]==='oubli'){tot='?';sub='départ non pointé';subCol='#c62828';}
        else if(dernier[2]==='cours'){tot=peFmtDuree(ptTot);sub='en cours';}
        else if(auj&&pt.length<pv.length){
          const reprise=pv[pt.length][0];
          tot=peFmtDuree(ptTot);
          if(nowM<reprise+10){sub='pause · reprise '+lab(reprise)+' prévue';}
          else{sub='reprise attendue depuis '+lab(reprise);subCol='#c95f0a';}
        }else{
          tot=peFmtDuree(ptTot);
          if(pv.length){const d=ptTot-pvTot;sub=signe(d)+' vs prévu';subCol=colEcart(Math.abs(d));tip+=' — '+peFmtDuree(ptTot)+' pour '+peFmtDuree(pvTot)+' prévues';}
          else{sub='hors planning';subCol='#c95f0a';}
        }
      }
    }
    if(auj&&nowM>=H_START*60&&nowM<=(H_START*60+COLS*30))inner+='<div style="position:absolute;left:'+px(nowM)+'px;top:0;bottom:0;border-left:2px solid #c62828;opacity:.5;pointer-events:none;z-index:1"></div>';
    const pill=(meta.heures_sup_min>0?' <span style="display:inline-block;font-size:9.5px;font-weight:800;padding:0 6px;border-radius:999px;background:#fbd9bd;color:#7a3d0c;border:1px solid #f3bb8f">+'+peFmtDuree(meta.heures_sup_min)+' sup.</span>':'')
      +(meta.remplace_prenom?' <span style="display:inline-block;font-size:9.5px;font-weight:800;padding:0 6px;border-radius:999px;background:#d6d2f5;color:#3a3380;border:1px solid #b9b3ec">remplace '+escHtml(meta.remplace_prenom)+'</span>':'');
    const horaire=pv.length?lab(pv[0][0])+' – '+lab(pv[pv.length-1][1]):'';
    pieces.push('<div style="display:flex;align-items:center;padding:3px 0;border-top:1px solid #f0eef8">'
      +'<div style="position:sticky;left:0;z-index:2;background:#fff;width:'+(NAME_W+30)+'px;flex-shrink:0;padding-right:8px;text-align:right;box-sizing:border-box;line-height:1.25"><div style="font-size:12px;font-weight:700;color:#0F6B5E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(prenom)+'</div>'+(pill?'<div>'+pill+'</div>':'')+(horaire?'<div style="font-size:10.5px;color:var(--muted)">'+horaire+'</div>':'')+'</div>'
      +'<div title="'+escHtml(tip)+'" style="position:relative;width:'+(COLS*COL_W)+'px;flex-shrink:0;height:56px;border-left:1px solid #e0dff0">'+inner+'</div>'
      +'<div style="width:'+DUR_W+'px;flex-shrink:0;text-align:right;padding-right:8px;font-size:12px;font-variant-numeric:tabular-nums;line-height:1.25"><b>'+tot+'</b><div style="font-size:10.5px;font-weight:600;color:'+subCol+'">'+sub+'</div></div></div>');
  });

  // Lignes de synthèse au quart d'heure, comme « Professionnelles » et « Enfants / pro »
  const cellW=COL_W/2,fs=COL_W<24?8:10;
  const passe=q=>futur?false:(!auj||(H_START*60+q*15+7.5)<=nowM);
  const ligne=(titre,cells,col)=>'<div style="display:flex;align-items:center;padding:4px 0">'
    +'<div style="position:sticky;left:0;z-index:2;background:#fff;width:'+(NAME_W+30)+'px;flex-shrink:0;font-size:11px;font-weight:700;color:'+col+';padding-right:8px;text-align:right;box-sizing:border-box">'+titre+'</div>'
    +'<div style="display:flex;width:'+(COLS*COL_W)+'px;flex-shrink:0;border-left:1px solid #e0dff0">'+cells+'</div><div style="width:'+DUR_W+'px;flex-shrink:0"></div></div>';
  const cell=(txt,bg,col,tip)=>'<div title="'+escHtml(tip||'')+'" style="width:'+cellW+'px;flex-shrink:0;box-sizing:border-box;text-align:center;overflow:hidden;white-space:nowrap;letter-spacing:-.4px;font-size:'+fs+'px;font-weight:700;line-height:24px;color:'+col+';background:'+bg+'">'+txt+'</div>';
  // Échelle des heures, comme en tête du Gantt des enfants (colonnes identiques)
  let echelle='<div style="display:flex;align-items:center;border-bottom:1px solid #e0dff0;margin-bottom:2px"><div style="position:sticky;left:0;z-index:3;background:#fff;width:'+(NAME_W+30)+'px;flex-shrink:0;height:16px"></div>';
  for(let h=H_START;h<H_START+COLS/2;h++)echelle+='<div style="width:'+(COL_W*2)+'px;flex-shrink:0;font-size:10px;font-weight:600;color:var(--muted);text-align:left;border-left:1px solid #e0dff0;padding-left:2px">'+h+'h</div>';
  echelle+='<div style="width:'+DUR_W+'px;flex-shrink:0;font-size:10px;font-weight:600;color:var(--muted);text-align:right;padding-right:8px">Pointé / prévu</div></div>';
  let html='<div style="display:flex;align-items:center;border-top:2px solid var(--koala);margin-top:6px;padding:6px 0 2px"><div style="font-size:12px;font-weight:800;color:var(--koala)">Équipe — pointé / prévu</div></div>'+echelle+pieces.join('');
  if(!futur){
    let c1='',c2='';
    for(let q=0;q<nQ;q++){
      const n=ptQ[q],pvn=prevQ[q];
      if(!passe(q)){c1+=cell('','transparent','#c9c5e0','');c2+=cell('','transparent','#c9c5e0','');continue;}
      c1+=(n||pvn)?cell(n,n<pvn?'#fbd9bd':'#c5ead6',n<pvn?'#7a3d0c':'#1f5c42',n+' pointé·e(s) pour '+pvn+' prévu·e(s)'+(n<pvn?' — '+(pvn-n)+' de moins que le planning':'')):cell('','transparent','#c9c5e0','');
      const nE=occ[q]||0;
      if(!nE){c2+=cell('','transparent','#c9c5e0','');continue;}
      if(!n){c2+=cell('!','var(--red,#C62828)','#fff',nE+' enfant(s) sans professionnelle pointée');continue;}
      const r=nE/n,rs=(Math.round(r*10)/10).toString().replace('.',',');
      c2+=cell(isPhone?String(Math.round(r)):rs,r>6?'var(--red,#C62828)':'#e4f5ec',r>6?'#fff':'#1f5c42',nE+' enfant(s) pour '+n+' pro(s) pointé·e(s) = '+rs+' par pro');
    }
    html+=ligne('Pros pointé·es',c1,'#0F6B5E')+ligne('Enfants / pro (réel)',c2,'var(--ink2,#5b5775)');
  }
  return html;
}
