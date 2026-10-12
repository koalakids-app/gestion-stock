/* ============================================================================
   Relances de devis : historique d'un devis + tableau récapitulatif.
   Source : devis_relances_log (sql/devis_relances_auto.sql), alimentée par
   relances-devis-auto (robot) et envoyer-devis (relances manuelles). Lecture
   réservée à la direction par la RLS.
   ============================================================================ */

/* Libellé, icône et couleur de chaque type d'événement du journal. */
const REL_TYPES={
  relance:  {l:'Relance envoyée',            i:'ti-mail-fast',    bg:'var(--violet-l)',fg:'var(--violet)'},
  finale:   {l:'Dernier rappel envoyé',      i:'ti-bell-ringing', bg:'var(--amber-l)', fg:'var(--amber)'},
  a_valider:{l:'Relance proposée',           i:'ti-hourglass',    bg:'var(--cream)',   fg:'var(--muted)'},
  alerte:   {l:'Équipe prévenue — à appeler',i:'ti-phone-call',   bg:'var(--amber-l)', fg:'var(--amber)'},
  echec:    {l:'Échec d\'envoi',             i:'ti-alert-triangle',bg:'var(--red-l)',  fg:'var(--red)'}
};

function libelleRelance(r){
  const t=REL_TYPES[r.type]||{l:r.type};
  if(r.type==='relance')return 'Relance n°'+(r.numero||'?')+' envoyée';
  if(r.type==='a_valider')return r.detail==='finale'?'Dernier rappel proposé à la direction':'Relance n°'+(r.numero||'?')+' proposée à la direction';
  if(r.type==='echec')return 'Échec d\'envoi'+(r.numero?' (relance n°'+r.numero+')':'');
  return t.l;
}
/* Le détail brut « finale » / « relance » d'une proposition n'est pas un texte. */
function detailRelance(r){
  if(r.type==='a_valider')return 'Validée ou reportée depuis la fiche du devis.';
  return r.detail||'';
}
function heureFr(iso){
  if(!iso)return '';
  try{return new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  catch(e){return dfr(iso);}
}

/* ---------- Historique dans la fiche du devis ---------- */
async function chargerHistoRelances(d){
  const box=document.getElementById('dRelHisto');
  if(!box)return;
  box.innerHTML='';
  if(!d||d.statut==='brouillon'||!d.envoye_le)return;
  const id=d.id;
  let logs=[];
  try{
    const{data,error}=await sb.from('devis_relances_log').select('*').eq('devis_id',id).order('created_at');
    if(error)throw error;
    logs=data||[];
  }catch(e){
    console.warn('[historique relances]',e);
    box.innerHTML='<div class="sec">Historique des relances</div><p class="hint">Historique indisponible.</p>';
    return;
  }
  /* L'utilisateur a pu ouvrir un autre devis pendant le chargement. */
  if(String(devisId)!==String(id))return;
  const ev=[{quand:d.envoye_le,ic:'ti-send',coul:'var(--muted)',t:'Devis envoyé à la famille',det:d.destinataires||''}];
  logs.forEach(r=>{
    const ty=REL_TYPES[r.type]||{i:'ti-point',fg:'var(--muted)'};
    ev.push({quand:r.created_at,ic:ty.i,coul:ty.fg,t:libelleRelance(r),det:detailRelance(r)});
  });
  if(d.repondu_le){
    ev.push({quand:d.repondu_le,ic:'ti-writing-sign',coul:d.statut==='accepte'?'var(--green)':'var(--red)',
      t:d.statut==='accepte'?'Devis accepté':'Devis refusé',det:''});
  }
  ev.sort((a,b)=>String(a.quand).localeCompare(String(b.quand)));
  box.innerHTML='<div class="sec">Historique des relances</div>'
    +'<div class="rhist">'+ev.map(e=>'<div class="rh"><i class="ti '+e.ic+'" style="color:'+e.coul+'"></i>'
      +'<div><b>'+esc(e.t)+'</b> <span class="d">'+esc(heureFr(e.quand))+'</span>'
      +(e.det?'<div class="x">'+esc(e.det)+'</div>':'')+'</div></div>').join('')+'</div>'
    +(logs.length?'':'<p class="hint">Aucune relance pour l\'instant.</p>');
}

/* ---------- Tableau récapitulatif ---------- */
let RLOGS=null,RDEVIS={};

async function openRelances(){
  openOv('ovRelances');
  document.getElementById('rlListe').innerHTML='<p class="hint">Chargement…</p>';
  document.getElementById('rlCreche').innerHTML='<option value="">Toutes les crèches</option>'
    +CRECHES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  await chargerRelances();
  renderRelances();
}

async function chargerRelances(){
  try{
    const{data,error}=await sb.from('devis_relances_log').select('*')
      .order('created_at',{ascending:false}).limit(2000);
    if(error)throw error;
    RLOGS=data||[];
    /* Les devis concernés, par paquets : 100 identifiants tiennent dans une URL. */
    const ids=[...new Set(RLOGS.map(r=>r.devis_id))];
    RDEVIS={};
    for(let i=0;i<ids.length;i+=100){
      const{data:dv,error:e2}=await sb.from('devis')
        .select('id,numero,creche_id,statut,envoye_le,repondu_le,relance_a_valider_le,relances')
        .in('id',ids.slice(i,i+100));
      if(e2)throw e2;
      (dv||[]).forEach(x=>{RDEVIS[x.id]=x;});
    }
  }catch(e){
    console.error('[chargerRelances]',e);
    RLOGS=[];
    toast('Relances inaccessibles : '+(e.message||'erreur inconnue'),true);
  }
}

function relancesFiltre(){
  const per=val('rlPeriode'),ty=val('rlType'),cre=val('rlCreche'),q=val('rlSearch').toLowerCase();
  const limite=per?Date.now()-Number(per)*86400000:0;
  const byId={};PRE.forEach(p=>{byId[p.id]=p;});
  return(RLOGS||[]).filter(r=>{
    if(limite&&new Date(r.created_at).getTime()<limite)return false;
    if(ty&&r.type!==ty)return false;
    const d=RDEVIS[r.devis_id];
    if(cre&&!(d&&String(d.creche_id)===cre))return false;
    if(q){
      const p=byId[r.preinscription_id];
      const nom=p?((p.prenom||'')+' '+(p.nom||'')).toLowerCase():'';
      if(nom.indexOf(q)<0&&((d&&d.numero)||'').toLowerCase().indexOf(q)<0)return false;
    }
    return true;
  });
}

function renderRelances(){
  const l=relancesFiltre();
  const byId={};PRE.forEach(p=>{byId[p.id]=p;});
  const envoyees=l.filter(r=>r.type==='relance'||r.type==='finale');
  const devisRelances=[...new Set(envoyees.map(r=>r.devis_id))];
  /* « Répondu après relance » : le devis a reçu sa réponse APRÈS la première
     relance de la période — le seul cas où l'on peut dire que la relance a servi. */
  const premiere={};
  envoyees.forEach(r=>{const t=new Date(r.created_at).getTime();if(!premiere[r.devis_id]||t<premiere[r.devis_id])premiere[r.devis_id]=t;});
  const repondus=devisRelances.filter(id=>{
    const d=RDEVIS[id];return d&&d.repondu_le&&new Date(d.repondu_le).getTime()>premiere[id];
  }).length;
  const enAttente=Object.values(RDEVIS).filter(d=>d.relance_a_valider_le&&d.statut==='envoye').length;
  const st=(v,lib)=>'<div class="hs"><div class="n">'+v+'</div><div class="l">'+esc(lib)+'</div></div>';
  document.getElementById('rlStats').innerHTML=
    st(envoyees.length,'relances envoyées')
    +st(devisRelances.length,'devis relancés')
    +st(devisRelances.length?repondus+' / '+devisRelances.length:'—','répondus après relance')
    +st(enAttente,'à valider')
    +st(l.filter(r=>r.type==='alerte').length,'à appeler')
    +st(l.filter(r=>r.type==='echec').length,'échecs');

  const box=document.getElementById('rlListe');
  if(!l.length){
    box.innerHTML='<div class="empty"><i class="ti ti-inbox"></i><p>Aucune relance ne correspond à ces filtres.</p></div>';
    document.getElementById('rlNote').textContent='';
    return;
  }
  box.innerHTML='<div style="overflow-x:auto"><table class="dtab rt"><tr><th>Date</th><th>Enfant</th><th>Devis</th><th>Crèche</th><th>Événement</th><th>Détail</th></tr>'
    +l.map(r=>{
      const p=byId[r.preinscription_id],d=RDEVIS[r.devis_id];
      const nom=p?(((p.prenom||'')+' '+(p.nom||'')).trim()||'Sans nom'):'—';
      const ty=REL_TYPES[r.type]||{bg:'var(--cream)',fg:'var(--muted)',i:'ti-point'};
      return '<tr'+(p?' class="cl" onclick="closeOv(\'ovRelances\');openFiche(\''+p.id+'\')"':'')+'>'
        +'<td>'+esc(heureFr(r.created_at))+'</td>'
        +'<td>'+esc(nom)+'</td>'
        +'<td>'+esc((d&&d.numero)||'')+'</td>'
        +'<td>'+esc((d&&nomCreche(d.creche_id))||'')+'</td>'
        +'<td><span class="tag" style="background:'+ty.bg+';color:'+ty.fg+'"><i class="ti '+ty.i+'"></i> '+esc(libelleRelance(r))+'</span></td>'
        +'<td class="x">'+esc(detailRelance(r))+'</td></tr>';
    }).join('')+'</table></div>';
  document.getElementById('rlNote').textContent=l.length+' événement'+(l.length>1?'s':'')
    +(RLOGS.length>=2000?' — affichage limité aux 2000 plus récents.':'.');
}

/* Export pour le gestionnaire. Point-virgule et BOM : Excel en français ouvre
   sinon tout dans une seule colonne. */
function exporterRelances(){
  const l=relancesFiltre();
  if(!l.length){toast('Rien à exporter avec ces filtres.',true);return;}
  const byId={};PRE.forEach(p=>{byId[p.id]=p;});
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const col=['Date','Enfant','Devis','Crèche','Événement','Détail'];
  const lignes=l.map(r=>{
    const p=byId[r.preinscription_id],d=RDEVIS[r.devis_id];
    return [heureFr(r.created_at),p?((p.prenom||'')+' '+(p.nom||'')).trim():'',(d&&d.numero)||'',
      (d&&nomCreche(d.creche_id))||'',libelleRelance(r),detailRelance(r)].map(q).join(';');
  });
  const txt='﻿'+col.map(q).join(';')+'\n'+lignes.join('\n');
  const url=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download='koalakids-relances-devis-'+auj()+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast(l.length+' ligne'+(l.length>1?'s':'')+' exportée'+(l.length>1?'s':'')+' ✅');
}
