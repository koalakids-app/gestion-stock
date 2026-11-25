
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
