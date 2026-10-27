// ============================================================
// FRAIS PRO (colonnes réelles : id, created_at, person_id, person_name,
// expense_date, category, amount, description, receipt_url)
// ============================================================
const FP_CATEGORIES={repas:'🍽️ Repas',peage:'🛣️ Péage',parking:'🅿️ Parking',materiel:'📦 Matériel',formation:'📚 Formation',fourniture:'✏️ Fourniture pédagogique',autre:'Autre'};
let fpRows=[],fpPendingPhotoUrl=null,fpEditingId=null;

// Client Supabase secondaire pour le Storage (clé publishable récente), pour éviter tout conflit
// de session avec le client principal (qui utilise l'ancienne clé JWT anon).
const FP_STORAGE_URL="https://juyrceadazrovlitxceb.supabase.co";
let _fpStorageClient=null;
function fpStorageClient(){
  if(!_fpStorageClient){
    _fpStorageClient=supabase.createClient(FP_STORAGE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  }
  return _fpStorageClient;
}

function fpInit(){
  const now=new Date();
  const month=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  if(!document.getElementById('fp-month').value)document.getElementById('fp-month').value=month;
  const sel=document.getElementById('fp-referent-select');
  if(isDirection){
    sel.style.display='';
    if(sel.options.length<=1){
      const refs=cacheReferents.filter(r=>r.role==='referent'||r.role==='direction');
      sel.innerHTML='<option value="">-- Toutes les personnes --</option>'+refs.map(r=>'<option value="'+r.id+'">'+r.name+'</option>').join('');
    }
  }else{sel.style.display='none';}
  const btnAll=document.getElementById('fp-btn-regler-tout');
  if(btnAll)btnAll.style.display=isDirection?'':'none';
  fpLoad();
}

async function fpLoad(){
  const month=document.getElementById('fp-month').value;
  if(!month)return;
  const [year,monthNum]=month.split('-').map(Number);
  const firstDay=year+'-'+String(monthNum).padStart(2,'0')+'-01';
  const lastDay=ipDateToLocalISO(new Date(year,monthNum,0));
  const targetRefId=isDirection?(document.getElementById('fp-referent-select').value||null):currentProfile?.id;

  let q=sb.from('frais_pro').select('*').gte('expense_date',firstDay).lte('expense_date',lastDay).order('expense_date',{ascending:true});
  if(targetRefId)q=q.eq('person_id',targetRefId);
  const{data,error}=await q;
  if(error){console.warn('[FraisPro]',error.message);fpRows=[];}else{fpRows=data||[];}

  fpRenderTable();
}

function fpRenderTable(){
  const tbody=document.getElementById('fp-tbody');
  if(!fpRows.length){
    tbody.innerHTML='';document.getElementById('fp-empty').style.display='block';
  }else{
    document.getElementById('fp-empty').style.display='none';
    const filt=(document.getElementById('fp-statut-filter')||{}).value||'';
    const rows=fpRows.filter(r=>filt==='regle'?r.regle:(filt==='attente'?!r.regle:true));
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);font-size:12px;padding:14px">Aucune ligne pour ce filtre.</td></tr>';
      fpUpdateTotals();return;
    }
    tbody.innerHTML=rows.map(r=>{
      const dateFr=new Date(r.expense_date+'T12:00:00').toLocaleDateString('fr-FR');
      return '<tr><td>'+dateFr+(isDirection&&r.person_name?'<br><span style="font-size:10px;color:var(--muted)">'+r.person_name+'</span>':'')+'</td>'+
        '<td>'+(FP_CATEGORIES[r.category]||r.category)+'</td>'+
        '<td>'+(r.description||'—')+'</td>'+
        '<td class="ik-val">'+Number(r.amount).toFixed(2).replace('.',',')+' €</td>'+
        '<td>'+(r.receipt_url?'<a href="'+r.receipt_url+'" target="_blank" class="btn-sm" style="display:inline-flex"><i class="ti ti-photo"></i></a>':'<span style="color:#ccc;font-size:11px">—</span>')+'</td>'+
        '<td>'+fpStatutCell(r)+'</td>'+
        '<td>'+(r.regle&&!isDirection?'':'<button class="ik-row-del" onclick="fpEditRow(\''+r.id+'\')" title="Modifier"><i class="ti ti-edit" style="font-size:12px"></i></button> <button class="ik-row-del" onclick="fpDeleteRow(\''+r.id+'\')" title="Supprimer"><i class="ti ti-trash" style="font-size:12px"></i></button>')+'</td></tr>';
    }).join('');
  }
  fpUpdateTotals();
}

function fpStatutCell(r){
  if(r.regle){
    const d=r.regle_le?new Date(r.regle_le+'T12:00:00').toLocaleDateString('fr-FR'):'';
    const lbl='<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#15803d;font-weight:600"><i class="ti ti-circle-check"></i> Réglé'+(d?' le '+d:'')+'</span>';
    return isDirection?'<span style="cursor:pointer" onclick="fpToggleRegle(\''+r.id+'\')" title="Annuler le règlement">'+lbl+'</span>':lbl;
  }
  const lbl='<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)"><i class="ti ti-circle-dashed"></i> En attente</span>';
  return isDirection?'<span style="cursor:pointer" onclick="fpToggleRegle(\''+r.id+'\')" title="Marquer comme réglé">'+lbl+'</span>':lbl;
}

async function fpToggleRegle(id){
  if(!isDirection)return;
  const r=fpRows.find(x=>x.id===id);if(!r)return;
  const next=!r.regle;
  const patch=next
    ?{regle:true,regle_le:ipDateToLocalISO(new Date()),regle_par:currentProfile?.id||null}
    :{regle:false,regle_le:null,regle_par:null};
  const ok=await dbUpdate('frais_pro',id,patch);
  if(ok){Object.assign(r,patch);fpRenderTable();showBanner(next?'Dépense marquée réglée.':'Règlement annulé.');}
  else showBanner('Erreur lors de la mise à jour.','error');
}

async function fpReglerTout(){
  if(!isDirection)return;
  const pend=fpRows.filter(r=>!r.regle);
  if(!pend.length){alert('Aucune dépense en attente sur ce mois.');return;}
  if(!confirm('Marquer '+pend.length+' dépense(s) comme réglée(s) ?'))return;
  const patch={regle:true,regle_le:ipDateToLocalISO(new Date()),regle_par:currentProfile?.id||null};
  const{error}=await sb.from('frais_pro').update(patch).in('id',pend.map(r=>r.id));
  if(error){console.warn('[FraisPro]',error.message);showBanner('Erreur lors du règlement groupé.','error');return;}
  pend.forEach(r=>Object.assign(r,patch));
  fpRenderTable();showBanner(pend.length+' dépense(s) réglée(s).');
}

function fpUpdateTotals(){
  let total=0;const byCat={};
  let totRegle=0,totAtt=0;
  fpRows.forEach(r=>{if(r.regle)totRegle+=Number(r.amount)||0;else totAtt+=Number(r.amount)||0;});
  fpRows.forEach(r=>{const m=Number(r.amount)||0;total+=m;byCat[r.category]=(byCat[r.category]||0)+m;});
  document.getElementById('fp-tot-eur').textContent=total.toFixed(2).replace('.',',');
  const cats=Object.keys(byCat).map(cat=>
    '<span style="font-size:12px;opacity:0.85">'+(FP_CATEGORIES[cat]||cat)+' : '+byCat[cat].toFixed(2).replace('.',',')+' €</span>'
  ).join('')||'<span style="font-size:12px;opacity:0.6">Aucune dépense</span>';
  const statuts=fpRows.length?'<span style="font-size:12px;opacity:0.85">✔ Réglé : '+totRegle.toFixed(2).replace('.',',')+' €</span><span style="font-size:12px;opacity:0.85">⏳ En attente : '+totAtt.toFixed(2).replace('.',',')+' €</span>':'';
  document.getElementById('fp-cat-totals').innerHTML=cats+statuts;
}

function fpOpenModal(){
  fpEditingId=null;fpPendingPhotoUrl=null;
  document.getElementById('modal-fp-title').textContent='Ajouter une dépense';
  document.getElementById('fp-date').value=todayStr();
  document.getElementById('fp-categorie').value='repas';
  document.getElementById('fp-montant').value='';
  document.getElementById('fp-desc').value='';
  document.getElementById('fp-photo-filename').textContent='';
  document.getElementById('fp-photo-input').value='';
  document.getElementById('modal-fraispro-wrap').classList.add('open');
}

function fpEditRow(id){
  const r=fpRows.find(x=>x.id===id);if(!r)return;
  fpEditingId=id;fpPendingPhotoUrl=r.receipt_url||null;
  document.getElementById('modal-fp-title').textContent='Modifier la dépense';
  document.getElementById('fp-date').value=r.expense_date;
  document.getElementById('fp-categorie').value=r.category;
  document.getElementById('fp-montant').value=r.amount;
  document.getElementById('fp-desc').value=r.description||'';
  document.getElementById('fp-photo-filename').textContent=r.receipt_url?'📎 Justificatif déjà joint':'';
  document.getElementById('fp-photo-input').value='';
  document.getElementById('modal-fraispro-wrap').classList.add('open');
}

async function fpHandlePhoto(event){
  const file=event.target.files[0];if(!file)return;
  document.getElementById('fp-photo-filename').textContent='⏳ Envoi en cours…';
  try{
    const ext=file.name.split('.').pop();
    const path='frais-pro-photos/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
    // Client principal (session connectée) : les policies anon du Storage ont été retirées.
    const{error}=await sb.storage.from('assets').upload(path,file);
    if(error)throw error;
    const{data}=sb.storage.from('assets').getPublicUrl(path);
    fpPendingPhotoUrl=data.publicUrl;
    document.getElementById('fp-photo-filename').textContent='✅ '+file.name;
  }catch(e){
    console.error('[FraisPro photo]',e.message);
    document.getElementById('fp-photo-filename').textContent='⚠ Erreur upload : '+e.message;
  }
}

async function fpSave(){
  const date=document.getElementById('fp-date').value;
  const montant=parseFloat(document.getElementById('fp-montant').value);
  if(!date||isNaN(montant)||montant<=0){alert('Date et montant valides requis.');return;}
  const row={
    person_id:currentProfile?.id,
    person_name:currentProfile?.name||'',
    expense_date:date,category:document.getElementById('fp-categorie').value,
    amount:montant,description:document.getElementById('fp-desc').value.trim(),
    receipt_url:fpPendingPhotoUrl
  };
  const btn=document.getElementById('fp-btn-save');btn.disabled=true;
  let ok;
  if(fpEditingId){
    const cur=fpRows.find(x=>x.id===fpEditingId);
    if(cur&&cur.regle&&!isDirection){btn.disabled=false;showBanner('Dépense déjà réglée : modification impossible.','error');return;}
    ok=await dbUpdate('frais_pro',fpEditingId,row);
  }
  else{const saved=await dbInsert('frais_pro',row);ok=!!saved;}
  btn.disabled=false;
  if(ok){showBanner('Dépense enregistrée !');closeModal('modal-fraispro-wrap');fpLoad();}
  else showBanner('Erreur lors de l\'enregistrement.','error');
}

async function fpDeleteRow(id){
  if(!confirm('Supprimer cette dépense ?'))return;
  const ok=await dbDelete('frais_pro',id);
  if(ok){showBanner('Dépense supprimée.');fpLoad();}
  else showBanner('Suppression impossible — dépense déjà réglée ?','error');
}

// ── Export Excel ──
function fpExportExcel(){
  if(!fpRows.length){alert('Aucune dépense à exporter pour ce mois.');return;}
  const month=document.getElementById('fp-month').value;
  const wsData=[['Date','Catégorie','Description','Montant (€)','Statut','Réglé le']];
  fpRows.forEach(r=>{wsData.push([new Date(r.expense_date+'T12:00:00').toLocaleDateString('fr-FR'),FP_CATEGORIES[r.category]||r.category,r.description||'',Number(r.amount),r.regle?'Réglé':'En attente',r.regle_le?new Date(r.regle_le+'T12:00:00').toLocaleDateString('fr-FR'):'']);});
  const total=fpRows.reduce((s,r)=>s+Number(r.amount),0);
  wsData.push(['','','TOTAL',total,'','']);
  const ws=XLSX.utils.aoa_to_sheet(wsData);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Frais pro');
  const slug=fpSelectedPersonName().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
  XLSX.writeFile(wb,'frais_pro_'+(slug?slug+'_':'')+month+'.xlsx');
  showBanner('Export Excel téléchargé !');
}

// Nom de la personne affichée dans Frais pro (une direction peut consulter une autre personne)
function fpSelectedPersonName(){
  const sel=document.getElementById('fp-referent-select');
  if(isDirection&&sel&&sel.value){
    const p=(cacheReferents||[]).find(r=>r.id===sel.value);
    if(p)return p.name;
  }
  if(isDirection&&sel&&!sel.value)return'Toutes les personnes';
  return currentProfile?.name||'';
}

function fpSendEmail(){
  const month=document.getElementById('fp-month').value;
  const name=fpSelectedPersonName();
  let body='Récapitulatif des frais professionnels — '+month+'\nDe : '+name+'\n\n';
  if(fpRows.length){
    fpRows.forEach(r=>{body+='- '+new Date(r.expense_date+'T12:00:00').toLocaleDateString('fr-FR')+' | '+(FP_CATEGORIES[r.category]||r.category)+' | '+(r.description||'')+' | '+Number(r.amount).toFixed(2)+' € | '+(r.regle?('Réglé'+(r.regle_le?' le '+new Date(r.regle_le+'T12:00:00').toLocaleDateString('fr-FR'):'')):'En attente')+'\n';});
    const total=fpRows.reduce((s,r)=>s+Number(r.amount),0);
    body+='\nTOTAL : '+total.toFixed(2)+' €\n';
  }else{body+='(Aucune ligne de dépense saisie ce mois-ci)\n';}
  const subject='Frais pro '+month+' — '+name;
  window.location.href='mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}

/* Dernière erreur d'appel d'edge function, en clair. callFn ne renvoie qu'un
   booléen (13 appels s'appuient dessus) : le détail est déposé ici pour que les
   écrans qui le peuvent affichent la cause réelle au lieu d'un « échec » muet —
   un domaine Resend non vérifié, un secret manquant et un PDF trop lourd ne se
   soignent pas de la même façon. */
let _lastFnErr='';
async function callFn(fn,body){
  _lastFnErr='';
  try{
    // Jeton de la session en cours, et non la clé anon statique : les
    // fonctions à verify_jwt actif (ex. create-referent) doivent pouvoir
    // identifier qui appelle (résolution de son org_id) — la clé anon,
    // elle, ne porte aucune identité d'utilisateur·rice.
    const{data:{session}}=await sb.auth.getSession();
    const jeton=session?.access_token||SUPABASE_ANON_KEY;
    const r=await fetch(SUPABASE_URL+'/functions/v1/'+fn,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+jeton},body:JSON.stringify(body)});
    if(!r.ok){
      let txt='';try{txt=await r.text();}catch(e){}
      let msg=txt;
      try{const j=JSON.parse(txt);if(j&&j.error)msg=j.error;}catch(e){}
      _lastFnErr=msg||('HTTP '+r.status);
      console.error('[callFn] '+fn,'HTTP '+r.status,txt);
    }
    return r.ok;
  }catch(err){
    _lastFnErr=(err&&err.message)||'réseau injoignable';
    console.error('[callFn] '+fn,err);
    return false;
  }
}

// ============================================================
// REMPLAÇANTES
// ============================================================
let rmpWeekOffset=0,rmpMonthOffset=0,rmpCache=[],rmpEditingId=null,rmpEditingDay=null;
const RMP_COLORS=['#3D3580','#F47920','#2a9d4e','#378ADD','#7B68EE','#e03e3e','#C95F0A','#1565c0'];

// Évite le bug de décalage UTC (toISOString() recule d'un jour en UTC+2) : formate toujours en heure locale.
function rmpDateStr(d){return ipDateToLocalISO(d);}

function rmpInit(){
  const sel=document.getElementById('rmp-creche');
  if(sel)sel.innerHTML='<option value="">-- Choisir --</option>'+cacheCreches.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  const addBtn=document.getElementById('rmp-add-btn');
  if(addBtn)addBtn.style.display=isDirection?'':'none';
  rmpShowView('semaine',document.querySelector('#main-remplacantes .module-tab'));
}

function rmpShowView(view,btn){
  document.querySelectorAll('#main-remplacantes .module-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#main-remplacantes .module-tab-content').forEach(c=>c.classList.remove('active'));
  if(btn)btn.classList.add('active');
  document.getElementById('rmp-view-'+view).classList.add('active');
  if(view==='semaine')rmpRenderWeek();
  if(view==='mois')rmpRenderMonth();
  if(view==='intervenante')rmpRenderIntervenanteSelect();
}

function rmpWeekStart(){const n=new Date();const day=n.getDay();const diff=n.getDate()-(day===0?6:day-1);const m=new Date(n.getFullYear(),n.getMonth(),diff+rmpWeekOffset*7);m.setHours(0,0,0,0);return m;}
function rmpChangeWeek(d){rmpWeekOffset+=d;rmpRenderWeek();}
function rmpChangeMonth(d){rmpMonthOffset+=d;rmpRenderMonth();}

async function rmpFetchRange(fromISO,toISO){
  const myCrecheId=isDirection?null:currentProfile?.creche_id;
  let q=sb.from('remplacantes').select('*').gte('date',fromISO).lte('date',toISO).order('date',{ascending:true});
  if(myCrecheId)q=q.eq('creche_id',myCrecheId);
  const{data,error}=await q;
  if(error){console.warn('[Remplacantes]',error.message);return[];}
  rmpCache=data||[];
  return rmpCache;
}

function rmpColorFor(nom){
  const names=[...new Set(rmpCache.map(r=>r.nom))].sort();
  const idx=names.indexOf(nom);
  return RMP_COLORS[idx>=0?idx%RMP_COLORS.length:0];
}

async function rmpRenderWeek(){
  const ws=rmpWeekStart();
  const days5=Array.from({length:5},(_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d;});
  const fmt=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
  document.getElementById('rmp-week-label').textContent=fmt(days5[0])+' – '+fmt(days5[4])+' (S'+hebdoNumSemaine(days5[0])+')';
  const fromISO=rmpDateStr(days5[0]),toISO=rmpDateStr(days5[4]);
  document.getElementById('rmp-grid-semaine').innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement…</div>';
  await rmpFetchRange(fromISO,toISO);

  const crechesToShow=isDirection?cacheCreches:cacheCreches.filter(c=>c.id===currentProfile?.creche_id);
  let html='<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">';
  html+='<thead><tr><th style="position:sticky;left:0;z-index:2;padding:8px;border-bottom:2px solid var(--border);text-align:left;background:#fafafa;color:#333">Crèche</th>';
  DAYS.forEach((d,i)=>{html+='<th style="padding:8px;border-bottom:2px solid var(--border);text-align:center;background:#fafafa;color:#333">'+d+'<br><span style="font-size:10px;font-weight:400;opacity:0.7">'+fmt(days5[i])+'</span></th>';});
  html+='</tr></thead><tbody>';
  crechesToShow.forEach(creche=>{
    html+='<tr><td style="position:sticky;left:0;z-index:1;padding:8px;border-bottom:1px solid var(--border);font-weight:600;color:var(--koala);background:#fff">'+creche.name+'</td>';
    days5.forEach((d,di)=>{
      const dateISO=rmpDateStr(d);
      const evs=rmpCache.filter(r=>r.creche_id===creche.id&&r.date===dateISO);
      html+='<td style="padding:6px;border-bottom:1px solid var(--border);vertical-align:top">';
      evs.forEach(ev=>{
        const color=rmpColorFor(ev.nom);
        const editAttr=isDirection?'onclick="rmpOpenModal(\''+ev.id+'\')" style="cursor:pointer;'+'background:'+color+'1A;border-left:3px solid '+color+';border-radius:4px;padding:4px 6px;font-size:11px;margin-bottom:4px"':'style="background:'+color+'1A;border-left:3px solid '+color+';border-radius:4px;padding:4px 6px;font-size:11px;margin-bottom:4px"';
        const horaire=ev.heure_debut?ev.heure_debut+'–'+ev.heure_fin:'';
        html+='<div '+editAttr+'><strong>'+ev.nom+'</strong>'+(horaire?'<br><span style="opacity:0.75">'+horaire+'</span>':'')+'</div>';
      });
      if(isDirection)html+='<div class="pe-add-empty" style="min-height:22px" onclick="rmpOpenModal(null,\''+creche.id+'\',\''+dateISO+'\')">+ ajouter</div>';
      else if(!evs.length)html+='<div style="text-align:center"><span style="color:#ddd">—</span></div>';
      html+='</td>';
    });
    html+='</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('rmp-grid-semaine').innerHTML=html;
}

async function rmpRenderMonth(){
  const n=new Date();
  const refDate=new Date(n.getFullYear(),n.getMonth()+rmpMonthOffset,1);
  const year=refDate.getFullYear(),month=refDate.getMonth();
  document.getElementById('rmp-month-label').textContent=refDate.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  const firstDay=new Date(year,month,1),lastDay=new Date(year,month+1,0);
  document.getElementById('rmp-grid-mois').innerHTML='<div style="padding:1rem;text-align:center;color:#bbb;font-size:12px">Chargement…</div>';
  await rmpFetchRange(rmpDateStr(firstDay),rmpDateStr(lastDay));

  const startDow=firstDay.getDay()===0?6:firstDay.getDay()-1; // lundi=0
  const totalDays=lastDay.getDate();
  const cells=[];
  for(let i=0;i<startDow;i++)cells.push(null);
  for(let d=1;d<=totalDays;d++)cells.push(new Date(year,month,d));

  let html='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:8px;overflow:hidden">';
  ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach(d=>{html+='<div style="background:var(--koala);color:#fff;padding:6px;text-align:center;font-size:11px;font-weight:700">'+d+'</div>';});
  cells.forEach(d=>{
    if(!d){html+='<div style="background:#fafafa;min-height:70px"></div>';return;}
    const dateISO=rmpDateStr(d);
    const evs=rmpCache.filter(r=>r.date===dateISO);
    html+='<div style="background:#fff;min-height:70px;padding:4px;font-size:10px">';
    html+='<div style="font-weight:700;color:var(--koala);margin-bottom:2px">'+d.getDate()+'</div>';
    evs.slice(0,3).forEach(ev=>{
      const color=rmpColorFor(ev.nom);
      const crecheName=cacheCreches.find(c=>c.id===ev.creche_id)?.name||'';
      html+='<div style="background:'+color+'1A;border-left:2px solid '+color+';border-radius:3px;padding:1px 4px;margin-bottom:2px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+ev.nom+' — '+crecheName+'">'+ev.nom+'</div>';
    });
    if(evs.length>3)html+='<div style="font-size:9px;color:var(--muted)">+'+(evs.length-3)+' autre(s)</div>';
    html+='</div>';
  });
  html+='</div>';
  document.getElementById('rmp-grid-mois').innerHTML=html;
}

async function rmpRenderIntervenanteSelect(){
  const now=new Date();
  const from=new Date(now.getFullYear(),now.getMonth()-2,1),to=new Date(now.getFullYear(),now.getMonth()+2,0);
  await rmpFetchRange(rmpDateStr(from),rmpDateStr(to));
  const names=[...new Set(rmpCache.map(r=>r.nom))].sort();
  const sel=document.getElementById('rmp-intervenante-select');
  const current=sel.value;
  sel.innerHTML='<option value="">-- Choisir une intervenante --</option>'+names.map(n=>'<option value="'+n+'"'+(n===current?' selected':'')+'>'+n+'</option>').join('');
  rmpRenderIntervenante();
}

function rmpRenderIntervenante(){
  const name=document.getElementById('rmp-intervenante-select').value;
  const wrap=document.getElementById('rmp-grid-intervenante');
  if(!name){wrap.innerHTML='<div style="text-align:center;padding:2rem;color:#bbb;font-size:13px">Sélectionnez une intervenante</div>';return;}
  const evs=rmpCache.filter(r=>r.nom===name).sort((a,b)=>a.date.localeCompare(b.date));
  if(!evs.length){wrap.innerHTML='<div style="text-align:center;padding:2rem;color:#bbb;font-size:13px">Aucun créneau trouvé pour '+name+'</div>';return;}
  wrap.innerHTML='<div class="demands-list">'+evs.map(ev=>{
    const creche=cacheCreches.find(c=>c.id===ev.creche_id)?.name||'—';
    const dateFr=new Date(ev.date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    return '<div class="dcard normal"><div class="dmeta"><div class="dtop"><span class="dsubject">'+creche+'</span></div><div class="dbody">'+dateFr+(ev.heure_debut?' · '+ev.heure_debut+'–'+ev.heure_fin:'')+(ev.pause_debut?' (pause '+ev.pause_debut+'–'+ev.pause_fin+')':'')+'</div></div></div>';
  }).join('')+'</div>';
}

function rmpOpenModal(id,crecheId,dateISO){
  rmpEditingId=id||null;
  const names=[...new Set(rmpCache.map(r=>r.nom))].sort();
  document.getElementById('rmp-noms-list').innerHTML=names.map(n=>'<option value="'+n+'">').join('');
  document.getElementById('rmp-btn-delete').style.display=id?'':'none';
  if(id){
    const ev=rmpCache.find(r=>r.id===id);if(!ev)return;
    document.getElementById('modal-rmp-title').textContent='Modifier le créneau';
    document.getElementById('rmp-creche').value=ev.creche_id;
    document.getElementById('rmp-date').value=ev.date;
    document.getElementById('rmp-nom').value=ev.nom;
    document.getElementById('rmp-hdebut').value=ev.heure_debut||'08:00';
    document.getElementById('rmp-hfin').value=ev.heure_fin||'17:00';
    document.getElementById('rmp-pdebut').value=ev.pause_debut||'12:00';
    document.getElementById('rmp-pfin').value=ev.pause_fin||'13:00';
  }else{
    document.getElementById('modal-rmp-title').textContent='Ajouter un créneau';
    document.getElementById('rmp-creche').value=crecheId||'';
    document.getElementById('rmp-date').value=dateISO||todayStr();
    document.getElementById('rmp-nom').value='';
    document.getElementById('rmp-hdebut').value='08:00';
    document.getElementById('rmp-hfin').value='17:00';
    document.getElementById('rmp-pdebut').value='12:00';
    document.getElementById('rmp-pfin').value='13:00';
  }
  document.getElementById('modal-remplacante-wrap').classList.add('open');
}

async function rmpSave(){
  const creche_id=document.getElementById('rmp-creche').value;
  const date=document.getElementById('rmp-date').value;
  const nom=document.getElementById('rmp-nom').value.trim();
  if(!creche_id||!date||!nom){alert('Crèche, date et nom requis.');return;}
  const heure_debut=document.getElementById('rmp-hdebut').value;
  const heure_fin=document.getElementById('rmp-hfin').value;
  if(!heure_debut||!heure_fin){alert('Heure de début et heure de fin requises.');return;}
  // Une pause vide doit etre NULL : '' est refuse par les colonnes time.
  const row={
    creche_id,date,nom,heure_debut,heure_fin,
    pause_debut:document.getElementById('rmp-pdebut').value||null,
    pause_fin:document.getElementById('rmp-pfin').value||null
  };
  let ok;
  if(rmpEditingId)ok=await dbUpdateStrict('remplacantes',rmpEditingId,row);
  else{const saved=await dbInsert('remplacantes',row);ok=!!saved;}
  if(ok){showBanner('Créneau enregistré !');closeModal('modal-remplacante-wrap');rmpRefreshCurrentView();}
  else showBanner('Erreur lors de l\'enregistrement'+(window._lastDbError?' : '+window._lastDbError:'.'),'error');
}

async function rmpDelete(){
  if(!rmpEditingId)return;
  if(!confirm('Supprimer ce créneau ?'))return;
  await dbDelete('remplacantes',rmpEditingId);
  closeModal('modal-remplacante-wrap');
  rmpRefreshCurrentView();
}

function rmpRefreshCurrentView(){
  const activeBtn=document.querySelector('#main-remplacantes .module-tab.active');
  const label=activeBtn?activeBtn.textContent.trim():'';
  if(label.includes('Semaine'))rmpRenderWeek();
  else if(label.includes('Mois'))rmpRenderMonth();
  else rmpRenderIntervenanteSelect();
}

/* Section ouverte dans l'appli -> onglet de la notice qui la décrit */
const NOTICE_ONGLET_SECTION = {
  demands:'demandes', incidents:'incidents', presence:'presences', planning:'planning', evenements:'evenements',
  enfants:'enfants', vaccinations:'vaccinations', stagiaires:'stagiaires', partenaires:'partenaires',
  referents:'referents', dashboard:'dashboards', 'ref-dashboard':'dashboards', actions:'actions', 'reunions-equipe':'reunionsequipe', afaire:'afaire',
  remplacantes:'remplacantes', fraisik:'fraisik', fraispro:'fraispro', mcm:'mcm', couches:'couches'
};
function openNotice() {
  document.getElementById('modal-notice').classList.add('open');
  const tab = NOTICE_ONGLET_SECTION[typeof _mainCourant !== 'undefined' ? _mainCourant : ''] || 'demandes';
  const btn = document.querySelector(`.notice-tab[onclick*="'${tab}'"]`) || document.querySelector('.notice-tab');
  switchNoticeTab(tab, btn);
  if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function switchNoticeTab(tab, btn) {
  document.querySelectorAll('.notice-tab').forEach(b => {
    b.style.borderBottomColor = 'transparent';
    b.style.color = '#aaa';
  });
  if (btn) { btn.style.borderBottomColor = 'var(--koala)'; btn.style.color = 'var(--koala)'; }
  const el = document.getElementById('notice-content-dem');
  if (el) el.innerHTML = NOTICE_DEM[tab] || '';
}

const NOTICE_DEM = {

demandes: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">💬 Demandes et consignes</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Les demandes permettent aux directeurs/trices techniques terrain de remonter des besoins, informations ou consignes à la direction — et aussi d'échanger directement entre admins, ou avec n'importe quel directeur/trice technique, sans passer par une crèche.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📝 Créer une demande</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Cliquez sur <strong>+ Nouveau message</strong></li>
  <li>Cochez <strong>un ou plusieurs destinataires</strong> dans la liste à cases à cocher : elle mélange les directeurs/trices techniques et les admins (repérables avec 🔑). La demande apparaît comme <strong>une seule carte</strong> listant tous les destinataires, avec un fil de discussion et un statut propres à chacun</li>
  <li>Si <strong>au moins un</strong> destinataire coché est admin, la <strong>crèche</strong> devient facultative — laissez-la vide pour un message direct</li>
  <li>Un seul destinataire coché : le champ <strong>E-mail destinataire</strong> apparaît et se pré-remplit, modifiable si besoin. Il disparaît dès que plusieurs cases sont cochées</li>
  <li>Renseignez le <strong>sujet</strong> et la <strong>description</strong> précise</li>
  <li>Choisissez la <strong>priorité</strong> : 🔴 Urgent, Normal ou ℹ️ Info</li>
  <li>Cliquez <strong>Envoyer</strong></li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">✅ Traiter une demande</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Cliquez sur l'icône ✓ à droite de la demande pour la marquer <strong>Traitée</strong></li>
  <li>Une demande traitée peut être réouverte en cliquant sur 🔄</li>
  <li>Le destinataire direct d'un message peut le marquer traité lui-même, même s'il n'est pas admin</li>
  <li>Utilisez les <strong>filtres</strong> (Urgent, En attente, Traitées) pour trier l'affichage</li>
  <li>Filtrez par <strong>crèche</strong> via les onglets en haut de la liste — les messages directs sans crèche apparaissent dans l'onglet <strong>Toutes</strong> (admins) ou dans votre propre liste (directeurs/trices techniques)</li>
</ol>
<div style="background:#FEF0E6;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#C95F0A">
  ⚠ Les demandes <strong>urgentes</strong> apparaissent en tête de liste avec une bordure rouge. Un badge de notification s'affiche dans la navigation. La cloche de l'en-tête garde aussi la trace des <strong>nouveaux documents</strong> ajoutés dans Documents (y compris ceux arrivés quand l'application était fermée) : un clic ouvre Documents.
</div>`,

incidents: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🚨 Incidents</h3>
<div style="background:#FFF1E3;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#B4530F;line-height:1.6">
  <strong>Deux outils, deux usages.</strong> Tout ce qui a donné lieu à un <strong>soin</strong>
  (chute, morsure, malaise, allergie) se consigne dans le <strong>registre d’infirmerie</strong>,
  qui a valeur légale et ne peut pas être modifié après coup. Ce module-ci recueille les
  <strong>événements sans soin</strong> — comportement, matériel, sécurité des locaux,
  relation avec une famille, problème avec un repas livré par le prestataire MCM (corps
  étranger, grammage insuffisant, livraison, ou autre à préciser) — et reçoit les
  signalements remontés depuis le registre.
</div>
<div style="background:#FEF2F2;border-left:4px solid #DC2626;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#991B1B">
  ⚠ Tout événement impliquant un enfant doit être consigné le jour même, même s'il semble bénin — ici ou dans le registre d’infirmerie selon le cas.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📋 Déclarer un incident</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Vérifiez d’abord qu’<strong>aucun soin n’a été donné</strong> : si c’est le cas, passez par le registre d’infirmerie</li>
  <li>Cliquez sur <strong>+ Déclarer un incident</strong></li>
  <li>Indiquez le <strong>prénom de l'enfant</strong> concerné, s’il y a lieu</li>
  <li>Renseignez la <strong>date</strong> exacte de l'incident</li>
  <li>Choisissez la <strong>gravité</strong> : 🔴 Grave, 🟠 Léger ou 🔵 Info</li>
  <li>Décrivez précisément l'incident et les <strong>actions menées</strong></li>
  <li>Cliquez <strong>Enregistrer</strong></li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔴 Niveaux de gravité</div>
<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:18px">
  <div style="background:#FEF2F2;border-radius:8px;padding:10px 14px;font-size:13px"><strong style="color:#DC2626">🔴 Grave</strong> — événement appelant une réaction immédiate de la direction</div>
  <div style="background:#FEF0E6;border-radius:8px;padding:10px 14px;font-size:13px"><strong style="color:#F47920">🟠 Léger</strong> — événement à traiter sans urgence, parents prévenus si concernés</div>
  <div style="background:#EFF6FF;border-radius:8px;padding:10px 14px;font-size:13px"><strong style="color:#2563EB">🔵 Info</strong> — dégradation matérielle, signalement préventif</div>
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">✅ Clôturer un incident</div>
<div style="font-size:13px;color:#555;line-height:1.7">Cliquez sur l'icône ✓ pour marquer un incident comme <strong>Traité</strong>. Les incidents non traités restent en tête de liste avec un badge d'alerte dans la navigation.</div>`,

presences: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">👥 Feuille de présence</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 La feuille de présence s'affiche sous forme de planning (vue Gantt) : une ligne par enfant, avec une barre horaire de 7h à 19h.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">✅ Marquer présent ou absent</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Sélectionnez la <strong>date</strong> et la <strong>crèche</strong> en haut de la page</li>
  <li>Pour chaque enfant, cliquez sur le <strong>rond</strong> à gauche de son nom :<br>
    <strong style="color:#2a9d4e">● (coche verte)</strong> = présent &nbsp;|&nbsp; <strong style="color:#999">○ (croix grise)</strong> = absent</li>
  <li>Un clic bascule d'un état à l'autre pour la <strong>journée entière</strong></li>
  <li>La barre se remplit et le compteur <strong>présents / total</strong> en haut se met à jour automatiquement</li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">👶 Fiche enfant (nom, prénom, date de naissance)</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Cliquez sur le <strong>nom</strong> d'un enfant pour ouvrir son <strong>dossier</strong> (le même que dans le module Dossiers enfants) : onglet <strong>Identité</strong> et onglet <strong>Documents</strong>. Le bouton <strong>Modifier la fiche</strong> permet d'y corriger le prénom, le nom, la date de naissance, le groupe, la crèche ou les allergies. Un enfant sans date de naissance affiche un <strong style="color:#e03e3e">⚠</strong>.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔎 Filtre « Présents uniquement »</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Le bouton <strong>Présents uniquement</strong>, en haut de la page, n’affiche que les enfants présents — à la date choisie dans l’onglet <strong>Jour</strong>, sur l’ensemble de la semaine dans l’onglet <strong>Semaine</strong>. Très pratique juste après un <strong>import PDF</strong>. Le compteur en haut du planning reste <strong>présents / effectif total</strong> de la crèche.<br>
• Pour <strong>retirer</strong> un enfant de la journée : cliquez sur son <strong>rond</strong>, sa ligne disparaît de la liste.<br>
• Pour <strong>ajouter</strong> un enfant : bouton <strong>Ajouter à la journée</strong> en haut à droite, puis choisissez-le dans la liste (il est marqué présent matin et après-midi).<br>
Désactivez le filtre pour retrouver la <strong>liste complète</strong> des inscrits, absents compris. Le choix est mémorisé sur votre appareil.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📆 Appliquer les contrats</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Ce bouton marque présents, en une seule fois, tous les enfants dont un <strong>contrat</strong> (onglet Contrat de la fiche enfant) couvre la période — <strong>de sa date de début à sa date de fin</strong>, sur les jours de semaine cochés dans le contrat. Il ne se limite donc plus à la seule date affichée : un contrat de plusieurs mois est couvert en un clic, sans repasser jour par jour. Les dates déjà pointées ne sont jamais retouchées. Quand un contrat se termine et qu’un nouveau lui succède, les présences <strong>à venir</strong> générées par l’ancien contrat (mêmes horaires que lui) sont nettoyées : jour retiré s’il n’est plus au contrat, ancien horaire remplacé par celui du nouveau contrat sinon. Le planning importé et les pointages ne sont pas touchés. Un contrat <strong>sans date de fin</strong> ne peut pas être appliqué de cette façon : il est signalé, il faut lui renseigner une date de fin dans l'onglet Contrat pour qu'il soit pris en compte.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Créer une nouvelle fiche enfant</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Dans la fenêtre <strong>Ajouter à la journée</strong>, si l’enfant n’apparaît pas dans la liste déroulante, cliquez sur <strong>Créer une fiche enfant</strong> : cela ouvre le formulaire d’inscription (prénom au minimum). Une fois la fiche créée, l’enfant sera disponible dans la liste. Les enfants sont également créés automatiquement lors de l’<strong>import PDF</strong>.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">⏱ Ce que l’import PDF remplit tout seul</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>L’import lit la <strong>barre horaire</strong> de chaque enfant : son heure d’arrivée et son heure de départ sont enregistrées jour par jour et dessinées telles quelles sur le planning Gantt.</li>
  <li>Un enfant parti avant 13h n’est plus marqué présent l’après-midi : le créneau lu sur le PDF fait foi.</li>
  <li>L’écran d’aperçu propose de <strong>remplir l’onglet Contrat</strong> de la fiche enfant à partir des journées lues : jours de la semaine et amplitude horaire. Deux cases à cocher permettent de choisir — créer les contrats manquants, et/ou mettre à jour ceux qui diffèrent du PDF. Les écarts sont affichés avant validation.</li>
  <li>Un contrat déduit d’une seule semaine ne vaut que pour cette semaine : vérifiez-le dans la fiche avant de vous y fier pour l’année.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🗂 Les deux onglets : Jour et Semaine</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:10px">La barre d’outils du haut s’adapte à l’onglet ouvert : elle n’affiche que les commandes qui s’y appliquent.</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Jour</strong> — la vue Gantt décrite ci-dessus. C’est le seul onglet où l’on pointe les présences. On y trouve le sélecteur de date et ses flèches, <strong>Appliquer les contrats</strong> et <strong>Ajouter à la journée</strong>.</li>
  <li><strong>Semaine</strong> — la vue de contrôle et d’export hebdomadaire, avec sa propre navigation de semaine en semaine. Elle remplace l’ancienne vue « Semaine » en carrés matin/après-midi, qui n’apportait rien de plus.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🕒 Depuis quand les données datent-elles&nbsp;?</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">En haut de la grille hebdomadaire, à côté du nombre d’enfants, la date de <strong>dernière saisie</strong> des présences de la semaine affichée. Elle passe en <strong style="color:#C95F0A">orange au-delà de sept jours</strong> : le signe qu’un nouvel import est sans doute à faire. L’information est lue en base, elle est donc la même pour tout le monde, quel que soit l’appareil ayant fait l’import.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📅 L’onglet Semaine en détail</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Grille</strong> : une ligne par enfant, une colonne par jour, avec les horaires réels. En tête, une carte par jour donne l’effectif et sa répartition par tranche d’âge.</li>
  <li><strong>Synthèse repas</strong> : les totaux repas par jour d’abord, le détail enfant replié dessous. C’est la vue qui prépare la commande du traiteur.</li>
  <li><strong>Commande repas</strong> génère le bon du traiteur, <strong>Exporter PDF</strong> produit la feuille de présence hebdomadaire mise en forme (une page par tableau : présence, effectifs repas, effectifs enfants).</li>
  <li>Si la semaine n’est pas encore importée, l’application affiche une <strong>prévision</strong> déduite des semaines précédentes (ou, pour un enfant dont un contrat couvre la semaine — y compris un enfant créé sans import —, des jours et horaires de ce contrat), clairement signalée. Vérifiez-la avant de commander des repas.</li>
  <li>Un enfant ayant un <strong>PAI actif</strong> (registre de soins) porte une pastille rouge <strong>PAI</strong> à côté de son nom, avec « panier » si la famille fournit son repas ; survolez-la pour voir le motif.</li>
</ul>`,

planning: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">📅 Planning des intervenants</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Le planning affiche la semaine courante. Chaque directeur/trice technique peut y noter ses présences, absences, formations et réunions.
  <br>🟣 Les réunions de l'onglet Événements destinées aux directeurs/trices techniques (ex. « Réunion DT », réunion de coordination) apparaissent aussi, en lecture seule, dans une ligne « Réunions » du planning coordinateur. Elles sont aussi comptées dans les IK (bouton « Recharger depuis planning ») : un trajet vers le lieu de la réunion, le matin si elle commence avant 13 h, l'après-midi si elle se poursuit après 13 h (les deux si elle chevauche midi).
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Ajouter un événement</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Cliquez directement sur une <strong>case du planning</strong> ou sur <strong>+ Ajouter</strong></li>
  <li>Le jour et la demi-journée sont <strong>pré-remplis</strong> si vous cliquez sur une case</li>
  <li>Indiquez le <strong>lieu / crèche</strong> concerné</li>
  <li>Choisissez le <strong>type</strong> : Présence, Absent, Formation, Réunion, Férié ou Vacances</li>
  <li>Cliquez <strong>Enregistrer</strong></li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🕑 Deux lieux dans la même demi-journée</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Le choix de la demi-journée propose <strong>Matin</strong>, <strong>Matin (2)</strong>, <strong>Après-midi</strong> et <strong>Après-midi (2)</strong>. Le second créneau sert à noter un deuxième lieu dans la même demi-journée ; il n’apparaît dans le planning (et sur le tableau de bord) que lorsqu’il est renseigné. Pour changer le lieu (ou le type) d’un événement du planning coordinateur, <strong>cliquez dessus</strong> : le formulaire s’ouvre pré-rempli, inutile de le supprimer et de le recréer (la petite croix, elle, supprime). Les frais kilométriques (onglet 🚗 Frais IK) en tiennent compte : les deux lieux s’enchaînent (départ → lieu 1 → lieu 2 → départ), à raison d’un trajet par ligne.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">✋ Déplacer un événement (glisser-déposer)</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Sur ordinateur : saisissez la carte d’un événement à la souris et déposez-la sur un autre jour ou une autre demi-journée.</li>
  <li>Sur tablette ou téléphone : <strong>appui long</strong> (un tiers de seconde environ) sur la carte, puis glissez le doigt. Un mouvement avant la fin de l’appui long reste un simple défilement de la page.</li>
  <li>Fonctionne dans le planning individuel, le planning coordinateur et le planning équipe. Le planning se redessine sans recharger la page, qui garde sa position.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🗓 Navigation</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Utilisez les flèches <strong>← →</strong> pour naviguer d'une semaine à l'autre. La semaine en cours est affichée par défaut.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🎨 Légende des couleurs</div>
<div style="display:flex;flex-direction:column;gap:6px">
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#3D3580;border-radius:3px;flex-shrink:0"></div> Présence</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#DC2626;border-radius:3px;flex-shrink:0"></div> Absent</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#2563EB;border-radius:3px;flex-shrink:0"></div> Formation</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#7C3AED;border-radius:3px;flex-shrink:0"></div> Réunion</div>
</div>
<div style="font-weight:700;font-size:14px;margin:22px 0 10px">👥 Planning équipe</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:10px">Sous le planning individuel, le <strong>planning équipe</strong> regroupe toutes les salariées d’une crèche : une ligne par créneau horaire, une colonne par jour, une couleur par professionnelle.</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Il se remplit par l’<strong>import PDF</strong> (le même que les présences enfants, dans l’onglet Présences) ou par import d’un fichier Excel. Chaque case reste modifiable à la main d’un clic.</li>
  <li><strong>Imprimer / PDF</strong> et <strong>Envoyer par mail</strong> produisent le planning sur 1 à 4 semaines, selon le sélecteur juste à côté.</li>
  <li><strong>Export PMI</strong> génère le tableau réglementaire à transmettre à la PMI — voir l’onglet <strong>📋 Export PMI</strong> de cette notice.</li>
  <li>La date du <strong>dernier import</strong> est rappelée en haut du planning, à côté du badge Modifiable / Lecture seule. Elle passe en <strong style="color:#C95F0A">orange au-delà de sept jours</strong>, pour anticiper le prochain import.</li>
</ul>`,

pmi: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">📋 Export PMI</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Le bouton <strong>Export PMI</strong>, dans le module <strong>Planning équipe</strong>, produit le tableau réglementaire attendu par la PMI à partir des données déjà saisies : planning des salariées et présences des enfants. Il n’y a rien à ressaisir.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🚀 En pratique</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Dans <strong>Planning</strong>, descendez au <strong>Planning équipe</strong> et choisissez la <strong>crèche</strong> ainsi que le <strong>nombre de semaines</strong> (sélecteur à côté des boutons d’impression).</li>
  <li>Cliquez sur <strong>Export PMI</strong>.</li>
  <li>Complétez la fenêtre qui s’ouvre, puis <strong>Générer le fichier Excel</strong> : une feuille par semaine.</li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">✍️ Ce que la fenêtre vous demande</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Nom de famille</strong> de chaque salariée : le planning ne contient que les prénoms. Pré-rempli pour les directeurs/trices techniques depuis l’annuaire, et mémorisé ensuite — à saisir une seule fois par crèche.</li>
  <li><strong>Qualification</strong>, à choisir dans la liste ou à saisir librement. Mémorisée également.</li>
  <li><strong>Ancienneté requise atteinte</strong> : en micro-crèche, une certification de niveau V petite enfance (CAP AEPE) compte dans le <strong>1°</strong> — le personnel diplômé des 40 % — dès <strong>2 ans d’expérience</strong>, 3 ans pour une assistante maternelle agréée. La case n’apparaît que là où elle a un sens ; elle est exclue pour les alternantes, dont le diplôme n’est pas acquis.</li>
  <li><strong>Temps de bureau</strong> : la personne assurant la direction ou la référence technique, et son volume hebdomadaire.</li>
  <li><strong>Repas et entretien</strong> : le volume quotidien, et les horaires d’accueil des enfants (7h30 – 18h30 par défaut).</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🤖 Ce que le fichier calcule tout seul</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Les <strong>horaires de chaque salariée</strong>, en couleur, pauses déduites, et ses heures d’encadrement ventilées en personnel diplômé (1°) ou qualifié (2°).</li>
  <li>Le <strong>nombre d’enfants accueillis</strong> quart d’heure par quart d’heure, à partir des présences enregistrées — horaires réels de l’import en priorité, contrat d’accueil à défaut.</li>
  <li>La ligne <strong>Direction</strong> : le temps de bureau est placé automatiquement dans les heures de travail de la personne, au moment où son retrait pèse le moins sur l’accueil — en pratique le milieu de journée, quand les équipes du matin et de l’après-midi se chevauchent.</li>
  <li>La ligne <strong>Entretien/restauration</strong> : répartie sur toute l’équipe, en priorité avant l’ouverture et après la fermeture aux enfants, puis autour du repas.</li>
  <li>Le <strong>récapitulatif hebdomadaire</strong> : heures d’ouverture, capacité d’accueil, heures et pourcentages diplômé / qualifié / total.</li>
</ul>
<div style="background:#FFF8E1;border-left:4px solid #FFC107;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:18px;font-size:13px;color:#7a5c00">
  ⚠️ Le temps de bureau et l’entretien sont <strong>prélevés sur les heures déjà planifiées</strong>, jamais ajoutés : aucune heure supplémentaire n’est créée. Le total de chacun reste celui de son planning.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔍 La fenêtre « Points de vigilance »</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:10px">Elle s’affiche après la génération. Le fichier remis à la PMI, lui, n’est jamais annoté.</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Un <strong>tableau par personne</strong> : heures planifiées, encadrement, bureau, repas/entretien. La colonne « Planifié » est celle à comparer aux contrats.</li>
  <li>Les <strong>anomalies réglementaires</strong> avec le jour et le créneau : moins de 40 % d’heures diplômées (art. R2324-42), moins de deux professionnels dès quatre enfants (art. R2324-43-1), effectif supérieur à la capacité.</li>
  <li>Les <strong>limites du contrôle</strong> : volume de bureau ou d’entretien qui n’a pas pu être placé sans dégrader l’encadrement, présences enfants inexploitables, capacité non renseignée.</li>
</ul>
<div style="font-size:13px;color:#555;line-height:1.7">Le placement ne retient jamais un créneau qui créerait un sous-effectif : s’il ne trouve pas de plage sûre, il raccourcit et vous signale le volume restant à reporter. Un volume régulièrement non plaçable est le signe que l’équipe est trop juste pour dégager ces temps sans renfort.</div>
<div style="font-size:12px;color:#888;line-height:1.6;margin-top:14px;border-top:1px solid #eee;padding-top:10px">
  Le taux « un professionnel pour cinq enfants qui ne marchent pas, un pour huit qui marchent » n’est pas contrôlé : l’application ne sait pas quels enfants marchent, et l’estimer donnerait une conformité fausse.
</div>`,

evenements: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🗓 Événements et rendez-vous</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Le calendrier centralise tous les rendez-vous du réseau : entretiens de recrutement, formations, réunions, visites… Il est partagé entre la direction et tous les directeurs/trices techniques.
</div>
<div style="background:#FFF7ED;border-left:4px solid #B45309;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400E">📖 Un événement de type <strong>Les contes de Miline</strong> (date et horaires renseignés, dans n\'importe quelle crèche) signale, dans le planning de l\'équipe, que Miline est <strong>absente le temps des contes</strong> : sa case reste en place et affiche en dessous une mention hachurée « absente – contes 09h00–10h00 » (uniquement sur l\'horaire des contes, pas toute la journée).</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Créer un événement</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Cliquez sur <strong>Nouvel événement</strong>, ou directement sur un <strong>jour du calendrier</strong></li>
  <li>Renseignez le <strong>titre</strong>, le <strong>type</strong> et la <strong>crèche</strong> concernée (laissez vide pour un événement réseau)</li>
  <li>Indiquez les <strong>dates</strong> (et heures si besoin) — un événement peut s'étaler sur plusieurs jours</li>
  <li>Cliquez <strong>Enregistrer</strong></li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🗂 Filtrer et consulter</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Utilisez les <strong>filtres par type</strong> en haut du calendrier. Cliquez sur un jour pour voir le détail des événements et les modifier ou les supprimer. Le <strong>filtre par crèche</strong> affiche les événements de la crèche choisie <em>ainsi que</em> ceux marqués « toutes crèches » ; le choix « Réseau » ne montre que ces derniers.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🎨 Légende des types</div>
<div style="display:flex;flex-direction:column;gap:6px">
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#378ADD;border-radius:3px;flex-shrink:0"></div> Recrutement</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#2563EB;border-radius:3px;flex-shrink:0"></div> Formation</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#7C3AED;border-radius:3px;flex-shrink:0"></div> Réunion</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#2a9d4e;border-radius:3px;flex-shrink:0"></div> Visite</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#F47920;border-radius:3px;flex-shrink:0"></div> Entretien</div>
  <div style="display:flex;align-items:center;gap:10px;font-size:13px"><div style="width:14px;height:14px;background:#E0457B;border-radius:3px;flex-shrink:0"></div> Fête</div>
</div>`,


enfants: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">👶 Dossiers enfants</h3><div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Ce module rassemble, enfant par enfant, sa fiche d’identité et l’ensemble des documents remplis pour lui. Les directeurs/trices techniques voient les enfants de leur crèche, la direction voit les six sites.</div><div style="font-weight:700;font-size:14px;margin-bottom:10px">🔎 Trouver un enfant</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>La barre de recherche filtre sur le prénom et le nom au fur et à mesure de la frappe.</li><li>La direction dispose en plus d’un sélecteur de crèche pour restreindre la liste à un site.</li><li>Chaque ligne rappelle la crèche et le groupe d’âge. Cliquer dessus ouvre la fiche.</li><li>La <strong>création</strong> d’un enfant ne se fait pas ici mais depuis le module Présences, bouton <strong>Ajouter enfant</strong>.</li><li>Le bouton <strong>⚠ Fiches à compléter</strong> filtre sur les enfants dont la date de naissance ou les allergies n’ont jamais été renseignées — utile pour repérer les enfants créés automatiquement par l’import du planning PDF (Gertrude n’exportant que le planning, jamais la fiche complète), et pour les compléter à la main.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">🆔 L’onglet Identité</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Reprend la crèche, la date de naissance, le groupe d’âge et les allergies connues.</li><li>La ligne <strong>Repas</strong> affiche le code utilisé sur la feuille hebdomadaire et le bon traiteur, et précise s’il suit l’âge ou s’il a été forcé à la main.</li><li>La ligne <strong>Goûter</strong> indique le goûter commandé (bébé ou grand, selon l’âge ou forcé sur la fiche). Le choix <strong>Goûter crèche</strong> signifie que la crèche prépare elle-même le goûter : l’enfant n’est alors <strong>pas compté</strong> dans les goûters de la commande au traiteur (0), son repas du midi restant commandé normalement.</li><li>Une ligne <strong>PAI</strong> apparaît dès que l’enfant a un PAI actif dans le registre de soins (motif, date de révision). La fiche <strong>lit</strong> le registre, elle ne le modifie pas : on saisit et on clôture le PAI dans l’application Infirmerie. Si le PAI est avec <strong>panier repas</strong>, les lignes Repas et Goûter affichent « Panier repas (PAI) ».</li><li>Le bouton <strong>Modifier la fiche</strong> ouvre la même fenêtre de saisie que le module Présences. On y règle le <strong>type de repas</strong> — laissé sur « Selon l’âge », il suit les anniversaires tout seul ; forcé sur BIB, BB, M ou G, il ne bouge plus — et le <strong>régime particulier</strong> (sans viande, sans protéine de vache ou animale). Le code obtenu s’affiche en direct sous les deux menus. <strong>BIB</strong> désigne un enfant au biberon : il n’est pas compté dans les repas commandés, et le régime ne s’y applique pas.</li><li>La suppression d’un enfant est réservée à la direction.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">📄 L’onglet Documents</div><div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:14px">Cet onglet regroupe deux dossiers distincts, aux destinataires et à la confidentialité différents : le <strong>dossier administratif</strong> (pièces d’inscription) et le <strong>dossier santé</strong>.</div>
<div style="font-weight:700;font-size:13.5px;margin-bottom:8px">📁 Dossier administratif</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Checklist des <strong>pièces demandées à l’inscription</strong> (livret de famille, pièce d’identité, attestation RC…) avec leur statut : <strong style="color:#F47920">⚠ Manquant</strong>, <strong style="color:#2a9d4e">✅ Reçu le …</strong>, ou <strong>🔄 À renouveler</strong> pour les pièces à redéposer chaque année. Le bouton <strong>Importer</strong> dépose directement le scan d’une pièce.</li><li>Les <strong>documents remplis/signés</strong> via l’outil Documents (voir plus bas) apparaissent aussi ici, du plus récent au plus ancien, avec un badge <strong>✅ Signé</strong> ou <strong>🕓 Préparé</strong>. <strong>Ouvrir / signer</strong> bascule vers l’outil Documents ; <strong>Suppr.</strong> retire définitivement le document du dossier.</li></ul>
<div style="font-weight:700;font-size:13.5px;margin-bottom:8px">💚 Dossier santé</div><div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:10px">Regroupé en quatre sous-parties bien distinctes, chacune avec son propre bouton d’import :</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li><strong>💉 Vaccinations</strong> : le même tableau de statut (✓ fait, ⚠ en retard, ! à faire bientôt, · pas encore dû) que le module Vaccinations, cliquable directement depuis la fiche enfant — voir l’onglet <strong>💉 Vaccinations</strong> de cette notice. Les photocopies du carnet importées apparaissent juste en dessous, avec leur propre bouton <strong>Importer</strong>.</li><li><strong>🩹 PAI</strong> (Projet d’Accueil Individualisé) : zone d’import dédiée pour les documents liés — protocole, ordonnances associées. Le PAI lui-même (motif, protocole, panier repas) se saisit dans le registre de soins ; il est rappelé dans l’onglet Identité.</li><li><strong>📄 Documents à télécharger</strong> : la fiche sanitaire (et tout autre document configuré en type « À télécharger » dans l’outil Documents) — un PDF vierge à imprimer, faire remplir par le médecin, puis réimporter une fois scanné. Case à cocher pour le statut de réception, bouton <strong>Importer</strong> pour la copie scannée.</li><li><strong>📤 Dossier sanitaire à envoyer aux parents</strong> : lien personnel envoyé par mail pour remplir/signer en ligne (dossier de familiarisation), avec son statut de réception ; les documents déjà remplis/signés apparaissent juste en dessous.</li></ul>
<div style="background:#e8f5e9;border-left:4px solid #2a9d4e;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#1B7A3E;margin-bottom:18px;line-height:1.6">🔒 Les documents du dossier santé (PAI, carnet, fiche sanitaire) sont stockés dans un espace <strong>privé</strong> : aucune URL publique, un lien de lecture est généré au clic et expire après quelques minutes.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔗 Le lien avec l’outil Documents</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Un document se remplit dans l’outil <strong>Documents</strong>. Il suffit d’y choisir l’enfant concerné dans le sélecteur en haut du formulaire.</li><li>À l’enregistrement, le document quitte la liste des modèles et vient se classer ici, dans le dossier de l’enfant.</li><li>Le modèle redevient vierge côté Documents : il est immédiatement réutilisable pour un autre enfant, sans risque d’écraser le précédent.</li><li>Le dossier de l’enfant devient donc le point d’entrée unique pour retrouver, compléter ou faire signer un document déjà commencé.</li></ul>
<div style="font-weight:700;font-size:14px;margin:18px 0 10px">💾 Archives sur disque dur <span style="font-weight:500;color:#999">(direction)</span></div><div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">L'export de tous les dossiers archivés d'une crèche en un seul fichier .zip se trouve dans <strong>Paramètres › Les établissements › Archives sur disque dur</strong>. Le bouton « Exporter les documents et libérer l'espace » d'une fiche archivée est lui aussi réservé à la direction.<br><br>🔐 <strong>Coffre-fort :</strong> chaque ouverture d'un document sensible (pièces administratives, PAI, carnet de vaccination) est notée dans un journal, consultable par la direction dans <strong>Paramètres › Les établissements › Coffre-fort</strong>.</div>
`,

vaccinations: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">💉 Suivi des vaccinations</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Cette page suit les vaccins obligatoires (calendrier français) pour chaque enfant, en calculant automatiquement les échéances à partir de sa date de naissance.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">✅ Marquer un vaccin comme fait</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Chaque dose est représentée par une <strong>pastille ronde</strong></li>
  <li>Cliquez sur la pastille pour la marquer <strong style="color:#2a9d4e">faite ✓ (verte)</strong></li>
  <li>Un nouveau clic <strong>annule</strong> si vous vous êtes trompé</li>
  <li>Aucune date à saisir : c'est un simple clic</li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🎨 Comprendre les couleurs</div>
<ul style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li><strong style="color:#2a9d4e">Vert ✓</strong> : vaccin fait</li>
  <li><strong style="color:#F47920">Bordure orange</strong> : échéance proche (à faire bientôt)</li>
  <li><strong style="color:#e03e3e">Bordure rouge</strong> : en retard</li>
  <li><strong style="color:#999">Contour gris</strong> : pas encore dû</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔔 Alertes et calendrier</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Les onglets <strong>Alertes</strong> et <strong>Calendrier</strong> : l’onglet Alertes ne liste que les vaccins en retard (plus d’alerte pour les vaccins à venir) ; le Calendrier montre toujours les échéances à venir. Le bouton <strong>Marquer fait</strong> y fonctionne comme les pastilles.</div>
<div style="background:#FEF0E6;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#C95F0A;margin-bottom:18px">
  ⚠ Un enfant n'apparaît ici que si sa <strong>date de naissance</strong> est renseignée. Ajoutez-la en cliquant sur son nom dans la feuille de présence.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">👶 Aussi visible depuis la fiche enfant</div>
<div style="font-size:13px;color:#555;line-height:1.7">Ce même tableau de statut, avec les mêmes pastilles cliquables, apparaît directement dans le <strong>dossier santé</strong> de la fiche enfant (module Dossiers enfants ou Présences), juste au-dessus des photocopies du carnet. Marquer une dose faite d'un côté la met à jour instantanément de l'autre : une seule donnée, deux endroits pour la consulter.</div>`,


stagiaires: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🎓 Stagiaires et alternants</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580;line-height:1.6">
  💡 Une fiche par stagiaire <strong>ou par alternant</strong>, de la demande déposée sur le Padlet jusqu'à l'évaluation de fin de stage ou d'alternance. Les documents demandés sont déposés par la personne elle-même, depuis son téléphone, via un lien à durée limitée.
  <br><br>Le <strong>type de profil</strong> se choisit en haut de la fiche : il change le vocabulaire (convention de stage ou contrat d'alternance, début du stage ou de l'alternance) et surtout la <strong>liste des pièces demandées</strong>. Les deux profils partagent le même calendrier, le même lien de dépôt et le même export.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🗂 Le chemin d'une fiche</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>La demande arrive sur le <strong>Padlet</strong> — vous créez la fiche : prénom, école, formation, et le lien du post. Statut <strong>Demande reçue</strong></li>
  <li>Vous l'orientez vers une <strong>crèche</strong> : à partir de là, le/la directeur/trice technique de cette crèche la voit et peut la suivre</li>
  <li>Le/la directeur/trice technique prend contact → statut <strong>Contact pris</strong></li>
  <li>C'est d'accord : vous posez les <strong>dates</strong> → statut <strong>Accepté</strong></li>
  <li>Avant l'entretien, vous créez et envoyez le <strong>lien</strong> de la fiche : à l'étape <strong>entretien</strong>, il ne montre que le projet pédagogique à lire et le questionnaire à remplir (aucun dépôt de document). Le stage accepté, le bouton <strong>Ouvrir les documents</strong> fait passer <strong>le même lien</strong> à l'étape <strong>documents</strong> (téléversement des pièces en ligne et livret d'accueil à signer), et sa durée repart de zéro — inutile de le faire six mois à l'avance : la fiche passe d'elle-même en <strong>« lien à envoyer »</strong> un mois avant le début, et la vignette <strong>Liens à envoyer</strong> en haut du module compte celles qui attendent. À ce moment-là, la direction et la référente de la crèche reçoivent une <strong>notification</strong> (une seule par fiche) et la fiche apparaît dans <strong>Ma journée › Stagiaires — liens à envoyer</strong> ; un lien resté à l'étape entretien compte aussi</li>
  <li>Le stage commence → <strong>En cours</strong>, puis <strong>Terminé</strong> ; l'<strong>évaluation</strong> se remplit en bas de la fiche</li>
  <li><strong>Évaluation du stagiaire</strong> (stagiaires et alternants) : en bas de la fiche, la grille « Suivi du stagiaire » — comportement général, aptitude professionnelle, acquis et activités, chacun noté <em>Très bien / Bien / À améliorer</em> avec un commentaire, puis l'appréciation générale. Choisissez <strong>AEPE</strong>, <strong>IEPE</strong> ou <strong>Stage découverte</strong> (proposé d'après la formation) : cela ajoute un critère propre au profil. Les profils <strong>EJE</strong> remplacent la grille par le référentiel des quatre domaines de compétences (DC1 à DC4), avec un commentaire général par domaine. Chaque élément est noté <em>Acquis</em>, <em>Besoin d'approfondir</em> ou <em>Non observé</em> (pour ne pas confondre « pas vu » et « oublié »). <strong>EJE — stage</strong> (proposé pour un stagiaire) : une note par compétence, limitée aux <strong>compétences visées</strong> que vous cochez en haut (sans choix, toutes sont affichées), les indicateurs se dépliant au besoin. Un bloc <strong>Bilan à mi-parcours</strong> permet de rédiger le point d'étape, les objectifs pour la seconde moitié et de <strong>figer</strong> les notes par compétence à cette date : elles restent affichées (« À mi-parcours : … ») à côté de la note finale, et sortent dans une colonne de l'impression. <strong>Tout stagiaire reçoit son auto-évaluation dans son lien</strong> (« Votre auto-évaluation », modifiable tant que le lien est valable — pensez à le renouveler si besoin) : les compétences visées pour un stage EJE, la grille Très bien / Bien / À améliorer pour AEPE, IEPE et stage découverte (le profil se déduit de la formation tant que vous n'en avez pas choisi un). Sa réponse arrive ici avec une notification, signalée à côté de vos notes, sans jamais lui montrer vos notes. Les alternants n'ont pas ce bloc. En EJE, vous pouvez aussi le remplir avec lui, avec les mêmes niveaux, sur les compétences visées : un écart avec votre note est signalé en orange dans la grille, et l'impression ajoute une colonne « Auto-évaluation ». <strong>EJE — apprentissage</strong> (proposé pour un alternant) : chaque indicateur est noté. Elle s'enregistre avec son propre bouton, et <strong>Imprimer</strong> sort la version papier à signer. Nécessite le script <code>sql/stagiaires_evaluation.sql</code>. <strong>Rappel</strong> : quand un stage se termine dans la semaine en cours et que son évaluation n'est pas remplie, la référente voit une alerte sur son tableau de bord.</li>
</ol>
<div style="background:#FEF0E6;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#C95F0A;margin-bottom:18px;line-height:1.6">
  ⚠ Tant qu'une stagiaire n'a <strong>pas de crèche</strong>, seule la direction la voit. C'est voulu : une demande Padlet vous appartient tant que vous ne l'avez pas orientée.
</div>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#3D3580;margin-bottom:18px;line-height:1.6">
  ⏳ <strong>Le lien est valable 14 jours</strong> à compter de sa création, quelles que soient les dates du stage (il donne accès à des pièces d'identité). La fiche passe en « lien à envoyer » 14 jours avant l'arrivée. Si une pièce manque ensuite, le bouton <strong>Renouveler</strong> crée un nouveau lien ; l'ancien cesse alors immédiatement de fonctionner.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📎 Les documents</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Dans la fiche, un bloc <strong>Lien à envoyer</strong>. <strong>Créer le lien d'entretien</strong> génère un lien valable <strong>14 jours</strong> ; <strong>Créer directement le lien des documents</strong> sert si le stage est déjà accepté. Le bouton <strong>Ouvrir les documents</strong> n'apparaît qu'à l'étape entretien, et propose aussitôt d'envoyer le message à la stagiaire</li>
  <li><strong>Envoyer le lien…</strong> ouvre WhatsApp, la feuille de partage ou la copie, comme pour les devis et les familles (mail, SMS et QR code restent disponibles) — la stagiaire n'a besoin d'aucun compte</li>
  <li>Elle photographie ses pièces ; elles apparaissent dans la fiche au fur et à mesure</li>
  <li>Vous <strong>validez</strong> ✓ ou <strong>refusez</strong> ✗ chaque pièce (un refus la remet en « à envoyer » chez elle, avec votre motif)</li>
  <li>Vous pouvez aussi <strong>téléverser à sa place</strong> une pièce reçue en papier ou par mail</li>
  <li><strong>Renouveler le lien</strong> en crée un nouveau — l'ancien cesse aussitôt de fonctionner</li>
</ol>
<div style="background:#e8f5e9;border-left:4px solid #2a9d4e;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#1B7A3E;margin-bottom:18px;line-height:1.6">
  🔒 Les pièces sont dans un stockage <strong>privé</strong> : pièces d'identité, casier, certificat médical. Les liens de lecture sont générés au clic et expirent au bout de 5 minutes — inutile de les transférer, ils ne marcheront pas ailleurs.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📅 Le calendrier</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Dans la fiche, <strong>Générer les jours ouvrés</strong> remplit la période du lundi au vendredi</li>
  <li><strong>Importer un calendrier (PDF)</strong> reprend le calendrier envoyé par le centre de formation : l'application lit les douze colonnes de mois et vous demande ce que signifie chaque lettre (présence à la crèche, centre de formation, ou rien). Les jours déjà saisis ne sont jamais écrasés, et rien n'est enregistré avant votre validation. Un calendrier scanné (image) n'est pas lisible : il ne contient pas de texte</li>
  <li><strong>Ajouter une semaine</strong> remplit une semaine type (lundi au vendredi par défaut, jours à cocher, horaires libres) et sait la <strong>répéter</strong> jusqu'à 12 semaines — la semaine est toujours calée sur le lundi</li>
  <li>Cliquez sur un jour pour changer ses <strong>horaires</strong>, le marquer <strong>absent</strong> ou le retirer</li>
  <li><strong>Entretien</strong> : fixez la date et l'heure du rendez-vous dans la fiche ; il apparaît automatiquement dans <strong>Événements</strong> (type Entretien, crèche de la fiche). Le déplacer dans la fiche met l'événement à jour, vider la date le retire. Nécessite le script <code>sql/stagiaires_entretien.sql</code>.</li>
  <li>L'onglet <strong>Calendrier</strong> affiche le mois entier, une ligne par stagiaire, filtrable par crèche</li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">⚙️ Pièces demandées (direction)</div>
<p style="font-size:13px;line-height:1.8;color:#555;margin-bottom:18px">
  L'onglet <strong>Pièces demandées</strong> gère la liste que voit la personne sur son lien. Désactiver une pièce la retire des nouveaux dossiers sans effacer ce qui a déjà été reçu. Seules les pièces <strong>obligatoires</strong> comptent dans l'avancement affiché.
  <br><br>Le bouton 👥 fait tourner le champ <strong>Demandée à</strong> : <em>Stagiaires et alternants</em> → <em>Stagiaires seulement</em> → <em>Alternants seulement</em>. C'est ainsi que la convention de stage ne s'affiche pas dans un dossier d'alternance, et le contrat d'apprentissage pas dans un dossier de stage. Une pièce déjà reçue reste visible dans la fiche même si elle ne concerne plus ce profil.
</p>
<div style="background:#FEF0E6;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#C95F0A;line-height:1.6">
  ⚠ Les délais (casier de moins de 3 mois, honorabilité de moins de 6 mois) courent depuis la <strong>date d'établissement</strong> de la pièce, pas depuis son dépôt : ils ne sont pas calculés par l'application, à vérifier sur le document.
</div>
<div style="font-weight:700;font-size:14px;margin:20px 0 10px">📤 Documents à transmettre (direction)</div>
<p style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px">
  Les <strong>Documents à transmettre</strong> sont ce que la personne trouve à l'étape <strong>entretien</strong> de son lien (à l'étape documents, le lien ne porte plus que les pièces à envoyer et le livret à signer). L'onglet décide de ce qui y figure : un <strong>document</strong> (le projet pédagogique, un livret d'accueil) ou un <strong>lien</strong> (questionnaire en ligne, vidéo).
  <br><br>Le document n'est pas joint au mail : il vit sur le lien. Deux conséquences — la personne a toujours la <strong>dernière version</strong> (le bouton ↻ la remplace sans rien perdre du suivi), et le PDF ne circule pas ensuite hors de la crèche, puisque son lien de lecture est signé pour 5 minutes.
  <br><br><strong>Demander une confirmation</strong> ajoute une case « j'ai lu ce document » ou « j'ai répondu au questionnaire ». La fiche affiche alors, personne par personne, qui a ouvert et qui a confirmé — c'est déclaratif, cela dit que la case a été cochée, pas que tout a été lu.
  <br><br>Comme pour les pièces, <strong>Destinataires</strong> sépare stagiaires et alternants, et <strong>Crèche concernée</strong> reste sur « toutes » dans le cas courant — le projet pédagogique est celui du réseau.
</p>`,

partenaires: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🏢 Partenaires et institutions</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Le carnet d'adresses des organismes avec lesquels le réseau travaille : CAF, PMI, prestataire repas, mairie, et autres contacts institutionnels.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Ajouter un partenaire</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Cliquez sur <strong>Ajouter un partenaire</strong></li>
  <li>Renseignez le nom, le type d'organisme et les coordonnées</li>
  <li>Associez une <strong>crèche</strong> si le contact concerne un site en particulier — laissez le champ vide s'il concerne l'ensemble du réseau</li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔎 Retrouver un contact</div>
<div style="font-size:13px;color:#555;line-height:1.7">Les onglets par crèche en haut de la liste filtrent l'affichage. Un contact sans crèche précisée apparaît dans toutes les vues, puisqu'il concerne le réseau entier.</div>`,

comptes: `
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Chaque membre de l'équipe dispose d'un compte personnel. La direction a accès à toutes les crèches, les directeurs/trices techniques uniquement à la leur.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔑 Se connecter</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Ouvrez l'application depuis le portail d'accueil</li>
  <li>Saisissez votre <strong>email</strong> et <strong>mot de passe</strong></li>
  <li>Cliquez <strong>Se connecter</strong></li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔒 Mot de passe oublié</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Cliquez sur <strong>Mot de passe oublié ?</strong> sur l'écran de connexion. Un lien de réinitialisation sera envoyé à votre adresse email.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🏠 Navigation entre applications</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px">Utilisez le bouton <strong>Portail</strong> pour revenir au portail et accéder à l'application Stock pédagogique.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">👤 Accès des employés</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px">Un compte <strong>employé</strong> n'ouvre que <strong>Mon espace</strong> (planning personnel, pointages, formations), l'<strong>Accès terrain</strong>, les <strong>Documents</strong> ouverts aux employés, le Stock et la Ludothèque de sa crèche. S'il ouvre un module réservé (Gestion crèches, Suivi, Équipe…), un message l'en informe puis il est renvoyé vers Mon espace. Sur l'accueil, ces modules sont masqués après sa première connexion ; le lien <strong>Afficher toutes les applications</strong> (en bas de l'accueil) les réaffiche sur un poste partagé. Les données du personnel, des contrats, des enfants et du suivi sont aussi fermées côté serveur : masquer une carte n'est qu'un confort.</div><div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px"><strong>Écrire aux employé(e)s</strong> : le bouton <strong>Message aux employé(e)s</strong>, en haut de la page Gestion crèches, envoie un message <strong>à sens unique</strong> à toute une crèche (la direction peut aussi choisir « Toutes les crèches ») ou à des <strong>personnes précises</strong>. Seul(e)s les employé(e)s qui ont un compte « Mon espace » peuvent le lire ; les autres sont grisé(e)s dans la liste. Le message apparaît dans <strong>Mon espace › Mes messages</strong> (en orange tant qu'il n'est pas lu). Pour être prévenu(e) sur son téléphone, l'employé(e) active la <strong>cloche</strong> de cette carte (sur iPhone, ajouter d'abord Mon espace à l'écran d'accueil). Comme pour les référent(e)s, aucune notification n'est envoyée pendant la plage de silence, le week-end et les jours fériés : le message reste dans Mon espace. Nécessite le script <code>sql/messages_employes.sql</code>.</div><div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px"><strong>Parcours quiz terminé</strong> (direction) : quand un(e) collaborateur(trice) a réalisé <strong>tous les quiz qui lui ont été envoyés</strong> (admin du quiz), une notification « Parcours quiz terminé » apparaît dans la cloche, une seule fois par personne ; un nouvel envoi la réarme. Les parcours déjà terminés au premier affichage sur un navigateur ne sont pas signalés. Nécessite <code>docs/quiz-envoi/parcours_termines.sql</code> (projet quiz).</div><div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px"><strong>Barre de navigation</strong> : au-dessus du koala, sur chaque module (Demandes, Devis, Contrats, Factures, Stock, Soins, Documents…), elle garde les derniers modules consultés (le plus récent en tête) pour y revenir en un clic sans repasser par le portail ; la grille ouvre la liste de tous les modules, la flèche replie la barre.</div><div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px"><strong>Codes de secours (double authentification)</strong> : dans <strong>Sécurité du compte</strong> (bouclier en haut de Demandes), « Générer mes codes » crée 10 codes à usage unique, affichés une seule fois : téléchargez-les ou notez-les <strong>hors de votre téléphone</strong>. Si vous perdez votre téléphone, sur l'écran du code à 6 chiffres cliquez sur « Téléphone perdu ? Utiliser un code de secours » : le code retire l'ancien appareil, puis vous en enregistrez un nouveau. Régénérer des codes annule les précédents ; un rappel s'affiche quand il en reste deux ou moins. 5 essais ratés bloquent la saisie 15 minutes. Les employé(e)s n'ont pas encore de codes : en cas de perte, la direction doit leur réinitialiser la double authentification. Nécessite <code>sql/mfa_codes_secours.sql</code> et la fonction <code>mfa-codes-secours</code>.</div>
<div style="background:#F0FDF4;border-left:4px solid #16A34A;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#065F46">
  ✅ Votre session reste active pendant 30 jours. Vous n'avez pas besoin de vous reconnecter à chaque visite.
</div>`
,

referents: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🧑‍🏫 Annuaire des directeurs/trices techniques</h3><div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Onglet réservé à la direction. C’est ici que se créent et se gèrent les comptes de connexion des directeurs/trices techniques de chaque crèche.</div><div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Ajouter un/une directeur/trice technique</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Cliquer sur <strong>Ajouter un/une directeur/trice technique</strong> en haut à droite.</li><li>Renseigner le nom, l’email, le poste et la crèche de rattachement.</li><li>Choisir le rôle : <strong>direction</strong> (accès à toutes les crèches), <strong>directeur/trice technique</strong> (accès à sa seule crèche) ou <strong>employé</strong>.</li><li>Un mot de passe temporaire est généré : le transmettre à la personne, elle devra le changer à la première connexion.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">✏️ Modifier ou désactiver</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Cliquer sur la fiche d’un/une directeur/trice technique pour modifier ses informations ou changer sa crèche.</li><li>Changer le rôle met immédiatement à jour ce que la personne voit dans l’application.</li><li>Attention : le rattachement à une crèche conditionne tout le filtrage des données (présences, planning, demandes).</li></ul>
`,

dashboards: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">📊 Tableaux de bord</h3><div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Il existe deux tableaux de bord différents : celui de la direction (vue sur les 6 crèches) et celui du/de la directeur/trice technique (vue sur sa crèche uniquement).</div><div style="font-weight:700;font-size:14px;margin-bottom:10px">📈 Tableau de bord direction</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Vue d’ensemble du jour : demandes en attente, incidents récents, planning et remplaçants/tes prévues.</li><li>Les flèches et le sélecteur de date permettent de consulter n’importe quel jour, passé ou à venir.</li><li>Le bouton <strong>Aujourd’hui</strong> ramène à la date du jour.</li><li>Boutons <strong>Exporter sauvegarde</strong> / <strong>Restaurer</strong> : téléchargent ou réinjectent un fichier JSON de l’ensemble des données. À faire régulièrement.</li><li>Lien direct vers le planning KOALA KIDS (Kidevo).</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">🏠 Mon tableau de bord (directeur/trice technique)</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Affiche uniquement les informations de sa propre crèche.</li><li>Alertes en haut : consignes non lues, demandes sans réponse, échéances proches.</li><li>Même navigation par date que la vue direction.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">☀️ Le bouton « Ma journée »</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Il ne liste que ce qui demande une action : une rubrique vide disparaît, et une ligne « Rien à signaler » rappelle en bas ce qui est à jour. Le chiffre rouge du bouton compte les points à traiter.</li><li><strong>Nouveaux documents déposés</strong> : dès qu’une famille ou une stagiaire dépose un document par son lien, la directrice technique de la crèche reçoit une <strong>notification</strong> (une seule par personne, même pour plusieurs fichiers ; pendant la plage de silence, le week-end et les jours fériés (réglages dans Paramètres) elle est retenue et remise à votre première connexion suivante) et la ligne apparaît ici en tête. Ouvrir la fiche, ou cliquer la ligne, la marque comme vue ; <strong>Tout marquer comme vu</strong> vide la liste.</li><li><strong>Dossiers familles à relancer</strong> (dossier sanitaire / familiarisation) et <strong>Pièces administratives à relancer</strong> (liens de dépôt des pièces d’inscription) : un dossier apparaît quand son lien a été envoyé il y a <strong>5 jours ou plus</strong>, qu’il n’est <strong>ni complet ni expiré</strong> et qu’il n’a <strong>pas été relancé aujourd’hui</strong>. Le bouton <strong>Relancer</strong> de la fiche l’en retire jusqu’au lendemain.</li></ul>
`,

actions: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🎯 Suivi des actions</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Onglet réservé à la direction. Reprend le classeur des réunions de direction (une ligne = une action), pour relire les actions non closes en début de réunion sans ressortir un fichier Excel.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📋 Vue Actions</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Nouvelle action</strong> crée une ligne avec responsable, thème, crèche concernée et échéance.</li>
  <li>Les filtres <strong>Non closes</strong>, <strong>En retard</strong>, <strong>Closes</strong> et <strong>Toutes</strong>, combinés aux sélecteurs responsable/thème/crèche et à la recherche, retrouvent une action rapidement.</li>
  <li><strong>Export Excel</strong> télécharge la liste affichée.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🎙️ Mode réunion</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Ouvre une fiche par date de réunion : heure, présents, excusés et date de la prochaine réunion. C'est depuis cette vue que se pointent au fur et à mesure les actions traitées pendant l'échange.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📄 Comptes rendus</div>
<div style="font-size:13px;color:#555;line-height:1.7">Conserve l'historique des réunions passées, consultable indépendamment de la liste des actions en cours.</div>`,

reunionsequipe: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">📝 Réunions d'équipe</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Les comptes rendus de réunion (équipe, famille, partenaire, PMI…) sont rédigés par chaque directeur/trice technique pour sa crèche. Ils sont distincts du suivi des actions et des réunions de direction.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">✏️ Rédiger un compte rendu</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Nouveau compte rendu</strong> : date, heure, type (réunion d'équipe, réunion des directeurs techniques ou autre, à préciser), participants, excusés, compte rendu, décisions et date de la prochaine réunion.</li>
  <li><strong>Photographier mes notes</strong> : les photos servent uniquement à la transcription du texte, elles ne sont pas enregistrées. Relisez toujours le texte avant de l'insérer.</li>
  <li><strong>Enregistrer en brouillon</strong> garde le compte rendu modifiable ; <strong>Valider</strong> le fige (il faut au moins un compte rendu ou des décisions).</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔒 Brouillon, validé, réouverture</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Un compte rendu validé n'est plus modifiable ni supprimable par le directeur/trice technique. Seule la <strong>direction</strong> peut le rouvrir ; la réouverture est tracée (date et personne), sans effacer la trace de la validation d'origine.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">👀 Qui voit quoi</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Réunion d'équipe</strong> (hebdomadaire) et <strong>Autre</strong> : visibles uniquement par l'équipe de la crèche concernée (son directeur/trice technique) et par la direction.</li>
  <li><strong>Réunion des directeurs techniques</strong> : sans crèche, visible par <strong>tous les directeurs/trices techniques</strong> et par la direction. Un directeur/trice ne modifie, ne valide et ne supprime que ses propres comptes rendus.</li>
  <li>La direction voit et gère toutes les crèches.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔎 Retrouver un compte rendu</div>
<div style="font-size:13px;color:#555;line-height:1.7">Les filtres <strong>Tous / Brouillons / Validés</strong>, le sélecteur de <strong>crèche</strong>, le type, les dates (du / au) et la recherche par mot retrouvent un compte rendu. Le bouton œil ouvre la lecture et l'impression.</div>`,

afaire: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">✅ À faire</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Une liste de tâches personnelle, organisée par jour. Onglet visible seulement sur le compte auquel il est réservé.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Ajouter une tâche</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Renseignez le libellé, le <strong>jour</strong> concerné, un <strong>type</strong> (appel, mail, travaux, administratif, réseau, autre), une <strong>crèche</strong> si la tâche en concerne une en particulier, et la <strong>priorité</strong>.</li>
  <li>Des détails complémentaires peuvent être ajoutés en dessous.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🗓️ Naviguer par jour</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px">Les flèches et le sélecteur de date changent le jour affiché ; le bouton <strong>Aujourd'hui</strong> y ramène directement. Un filtre par crèche permet de ne voir que les tâches liées à un site.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📆 Vue Jour / Vue Semaine</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:12px">Deux boutons permettent de basculer entre la <strong>vue Jour</strong> et la <strong>vue Semaine</strong>. En vue Semaine, les tâches sont groupées par jour, du lundi au dimanche, et les flèches avancent d’une semaine à la fois.</div>`,

remplacantes: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🤝 Planning des remplaçants/tes</h3><div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Ce module sert à suivre les intervenantes ponctuelles qui ne figurent pas dans le planning d’équipe habituel.</div><div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Ajouter un créneau</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Cliquer sur <strong>Ajouter un créneau</strong>, choisir l’intervenante, la crèche, la date et les horaires.</li><li>Une même intervenante peut avoir plusieurs créneaux sur une journée.</li><li>Cliquer sur un créneau existant pour le modifier ou le supprimer.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">👁 Les trois vues</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li><strong>Semaine</strong> : grille classique, une colonne par jour. Navigation par flèches.</li><li><strong>Mois</strong> : vue calendaire pour repérer d’un coup d’œil les périodes chargées.</li><li><strong>Par intervenante</strong> : sélectionner une personne pour voir tous ses créneaux — utile pour vérifier un volume d’heures.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">⚠️ À savoir</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Les directeurs/trices techniques voient les remplaçants/tes de leur crèche ; la direction voit l’ensemble.</li><li>Les créneaux saisis ici remontent automatiquement dans les tableaux de bord du jour.</li></ul>
`,

fraisik: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🚗 Frais kilométriques (IK)</h3><div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Onglet réservé à la direction. Il produit le fichier Excel de justificatif mensuel au format officiel attendu par le réseau.</div><div style="font-weight:700;font-size:14px;margin-bottom:10px">📝 Saisir les trajets</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Sélectionner d’abord le <strong>mois</strong> concerné en haut de page.</li><li>Cliquer sur <strong>Ajouter une ligne</strong> pour chaque trajet : date, motif, trajet, kilomètres.</li><li>La saisie est enregistrée au fur et à mesure : on peut quitter et revenir plus tard.</li><li>Changer de mois recharge automatiquement les trajets déjà saisis pour ce mois.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">📤 Générer le fichier</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Le bouton <strong>Générer Excel</strong> produit un classeur conforme au modèle officiel, avec un onglet par groupe de crèches.</li><li>Le fichier se télécharge directement : il n’y a plus qu’à le transmettre au réseau.</li><li>Vérifier le total kilométrique avant envoi.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">🗓 Trajets issus du planning</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Les déplacements notés dans le planning (lieu de chaque demi-journée) peuvent être repris comme lignes de trajet.</li><li>Quand une demi-journée comporte un <strong>second créneau</strong> sur un autre lieu, les deux lieux s’enchaînent : départ → lieu 1 → lieu 2 → départ, une ligne par trajet. Un lieu identique au départ ou répété n’ajoute pas de ligne.</li></ul>
`,

fraispro: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🧾 Frais professionnels</h3><div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Permet de consigner les dépenses professionnelles du mois et d’en produire un récapitulatif exportable.</div><div style="font-weight:700;font-size:14px;margin-bottom:10px">➕ Saisir une dépense</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Choisir le <strong>mois</strong> en haut de page.</li><li>Cliquer sur <strong>Ajouter une dépense</strong> : date, libellé, montant, catégorie.</li><li>Il est possible de joindre le justificatif (photo ou PDF) à la dépense.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">📤 Export et envoi</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li><strong>Exporter Excel</strong> : télécharge le récapitulatif du mois au format .xlsx.</li><li><strong>Envoyer par email</strong> : transmet directement le récapitulatif au destinataire configuré.</li><li>Toujours vérifier que toutes les dépenses du mois sont saisies avant l’export.</li></ul>
`,

mcm: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🍽 MCM — Commande repas</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Le module <strong>MCM (repas)</strong> regroupe les échanges avec le prestataire : incidents repas, commande de la semaine, menus et avis des enfants. L’onglet <strong>Commande repas</strong> prépare le bon à envoyer au traiteur à partir des présences déjà saisies : rien à ressaisir.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🚀 Préparer la commande</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Ouvrez <strong>MCM (repas)</strong> › <strong>Commande repas</strong>.</li>
  <li>Choisissez la semaine avec les flèches ◀ ▶ ou <strong>Semaine actuelle</strong>. La direction choisit aussi la <strong>crèche</strong> ; la semaine et la crèche sont les mêmes que dans l’onglet Présences › Semaine.</li>
  <li>Vérifiez le <strong>rappel des effectifs</strong> : repas du midi et goûters par jour, par profil (bébés « − de 6 mois » = repas BB quel que soit l’âge, bébés 6 à 18 mois = repas M, grands et périscolaire) et avec les régimes particuliers (SV, SPV, SPA). Les lignes suivent l’ordre du bon MCM (bébés − de 6 mois, bébés 6-18 mois, grands, périscolaire, repas témoin, goûters moyens, goûters grands), puis le total des goûters, les biberons et les PAI. Les <strong>régimes particuliers</strong> (SV, SPV, SPA) s’affichent juste sous la ligne de repas dont ils dépendent (moyen, grand…).</li>
  <li>Complétez le bon qui s’affiche dessous : coordonnées de la crèche, éventuelle mention « annule et remplace », date de validation, nom de la responsable.</li>
  <li><strong>Enregistrer</strong> garde un brouillon, <strong>Générer le PDF</strong> télécharge le bon, <strong>Envoyer au traiteur</strong> le transmet par mail.</li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📏 Règles de comptage</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Les chiffres du rappel et ceux du bon viennent de la même source : ils ne peuvent pas diverger.</li>
  <li>Le <strong>code repas</strong> de l’enfant (BB, M, G) fait foi, calculé à la <strong>date de livraison</strong> et non à la date du jour. Un repas forcé sur la fiche est respecté.</li>
  <li>Le <strong>repas</strong> est compté pour un enfant présent le matin ou la journée ; le <strong>goûter</strong> pour un enfant présent l’après-midi ou la journée.</li>
  <li><strong>Aucun goûter</strong> avant 6 mois, même si un repas ou un goûter est forcé sur la fiche.</li>
  <li>Un enfant en <strong>repas bébé sans protéines (BB)</strong> n’a pas de goûter : il est compris dans le repas, même si un goûter est forcé sur la fiche.</li>
  <li>Les enfants au <strong>biberon (BIB)</strong> sont exclus : ni repas ni goûter.</li>
  <li>Un enfant en <strong>Goûter crèche</strong> (réglé sur sa fiche) n’est pas compté dans les goûters : la crèche fournit le goûter. Son repas du midi reste commandé.</li>
  <li>Un enfant ayant un <strong>PAI actif avec panier repas</strong> (case cochée dans le registre de soins) est exclu du bon : ni repas ni goûter, la famille fournit le panier. Il apparaît dans la ligne <strong>PAI panier repas</strong> du rappel des effectifs, avec son nom sous le tableau. Clôturer le PAI le remet dans la commande.</li>
  <li>Un goûter ne contient pas de viande : le régime « SV » y est compté dans l’effectif standard. SPV et SPA restent signalés.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">⚠️ Enfants non comptés</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Un enfant sans code repas (ni date de naissance, ni type de repas sur la fiche) n’est pas compté : un bandeau le signale. Renseignez sa fiche, puis cliquez sur <strong>Recalculer</strong> pour repartir des présences de la semaine. Si aucune présence ni prévision n’existe pour la semaine, le module indique qu’il n’y a rien à commander : importez d’abord le planning (onglet Présences).</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🗂 Les autres onglets</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Incidents repas</strong> : voir l’onglet 🚨 Incidents de cette notice.</li>
  <li><strong>Menus</strong> : consultation des menus ; la direction peut importer le fichier Excel du menu. Le bouton <strong>QR code</strong> de chaque semaine affiche un QR (à capturer pour l’afficher à l’entrée, ou à partager) qui ouvre le menu sur le téléphone des familles, sans connexion, dans une page lisible (un onglet par profil, le jour en cours en évidence). L’icône <strong>imprimante</strong> d’une semaine génère d’abord un <strong>PDF</strong> (A4 paysage, 3 profils × 5 jours, goûters compris ; une page par semaine : la semaine choisie et la suivante quand son menu est publié) avec le <strong>QR code</strong> du menu en ligne (cette semaine) qui s’ouvre dans un onglet avec la boîte d’impression. Le QR ouvre <strong>deux semaines de menus</strong> (celle de la ligne et la suivante, avec un bouton pour passer de l’une à l’autre dès que la seconde est publiée) : une seule commande de goûters couvre les 2 semaines. Le <strong>QR permanent</strong> affiche toujours la semaine en cours : il suffit de l’imprimer une fois. Le bouton <strong>Affiche QR</strong> (en haut de l’onglet) ouvre l’éditeur d’affiche : modifiez le titre, le message et le pied de page, vérifiez l’aperçu, puis <strong>Imprimer / PDF</strong> pour afficher le QR permanent dans la crèche. Si votre crèche prépare ses propres goûters, le bouton <strong>Goûters de la crèche</strong> (ou le biscuit à côté d’une semaine) permet de saisir les goûters de chaque jour : ils remplacent ceux du traiteur pour votre crèche, dans la liste des menus, dans Présences et sur la page du QR code, avec la mention « crèche ». Comme chez le traiteur, il y a un <strong>goûter moyen</strong> (bébés 6-18 mois) et un <strong>goûter grand</strong> ; la case <strong>Même goûter pour les moyens et les grands</strong> évite de le saisir deux fois. Les QR codes et l’affiche d’un référent pointent vers le menu de sa crèche ; la direction choisit la crèche dans la fenêtre du QR ou de l’affiche. Écrivez chaque goûter en séparant les produits par « / » (ex. yaourt / madeleine / fruit) : la fenêtre calcule la liste des <strong>produits à commander</strong> en multipliant chaque produit par le nombre d’enfants au goûter de chaque jour (repris de Présences › Semaine quand c’est la même semaine, sinon à saisir ; modifiable). <strong>Recettes</strong> : le bouton « Recettes » ouvre la bibliothèque, commune à toutes les crèches (la direction crée et modifie tout ; un référent peut créer une recette avec « Nouvelle recette » et modifier celles qu’il a créées, les autres sont en lecture seule). Une recette est écrite pour un nombre d’enfants, chaque ingrédient porte ses allergènes et la recette les additionne. Le bouton « + recette » sous la case d’un jour (moyens ou grands) l’ajoute au goûter : ses quantités sont recalculées pour l’effectif du jour, ses ingrédients rejoignent la liste des produits à commander, et un encadré rappelle les allergènes du jour avec les enfants dont la fiche évoque l’un d’eux (lecture du texte libre « allergies » de la fiche et du motif des PAI actifs : à vérifier). La <strong>fiche cuisine</strong> d’une recette s’imprime en A4. Pour les <strong>moyens</strong>, chaque jour comporte <strong>deux lignes</strong> (ex. yaourt et compote), chacune avec sa propre case d’<strong>effectif</strong> modifiable (les cases sont préremplies avec « Yaourt » et « Compote », modifiables) ; l’effectif des <strong>grands</strong> se saisit dans la ligne « Enfants au goûter ». Les <strong>effectifs</strong> (par jour) se reprennent de Présences › Semaine quand c’est la même semaine, sinon ils se saisissent ; ils sont enregistrés avec la semaine. Le bouton <strong>Récapitulatif 2 semaines</strong> additionne la semaine choisie et la suivante, moyens et grands, produits puis ingrédients des recettes, avec filtre Moyens / Grands, copie, impression et export CSV. Une case vide garde le goûter du traiteur. Si la crèche prépare <strong>tous</strong> ses goûters, cochez <strong>Cette crèche fait tous ses goûters</strong> : un jour sans goûter saisi n’affiche alors aucun goûter, et le bon de commande traiteur ne compte aucun goûter pour cette crèche.</li>
  <li><strong>Avis des enfants</strong> : avis des enfants sur les plats.</li>
</ul>
`,

couches: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🍼 Couches du jour</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 Cette tuile, dans <strong>Enfants &amp; suivi</strong>, sert à saisir chaque jour le nombre de couches utilisées par enfant. Le stock de couches est décompté automatiquement.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📝 Saisir les couches</div>
<ol style="font-size:13px;line-height:2;color:#555;padding-left:20px;margin-bottom:18px">
  <li>Ouvrez <strong>Couches</strong> (tuile Enfants &amp; suivi). La direction choisit d’abord la <strong>crèche</strong>.</li>
  <li>Le jour affiché est aujourd’hui ; le sélecteur de date permet de corriger un jour passé (pas de date future).</li>
  <li>Pour chaque enfant, utilisez <strong>−</strong> et <strong>+</strong>. L’enregistrement est immédiat.</li>
</ol>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">📦 Ce qu’il faut savoir</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Le chiffre saisi est la <strong>consommation totale du jour</strong> de l’enfant : le stock est ajusté de la différence, dans la taille et le type (couche ou culotte) de la fiche enfant.</li>
  <li>Sous chaque nom figurent le type et la taille (ex. « Couche T4 ») ; la mention « non pointé » signale un enfant sans présence ce jour-là.</li>
  <li>Si la <strong>taille n’est pas renseignée</strong> sur la fiche enfant, les boutons n’apparaissent pas : complétez d’abord la fiche.</li>
  <li>Le total du jour s’affiche en haut de la liste.</li>
  <li>La même saisie existe sur la tablette du suivi de l’enfant.</li>
</ul>
`,

kiosque: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">📱 Mode kiosque</h3>
<div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">
  💡 Un écran plein format pour pointer les arrivées et départs depuis une tablette posée à l'accueil, sans avoir à ouvrir de fiche individuelle.
</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">🚀 Ouvrir le mode kiosque</div>
<div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px">Menu <strong>Plus → Mode kiosque</strong>. L'écran passe en plein écran ; sortir du plein écran (touche Échap) referme automatiquement le mode.</div>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">👶 Deux onglets</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li><strong>Enfants</strong> : une tuile par enfant présent dans la crèche sélectionnée.</li>
  <li><strong>Personnel</strong> : directeurs/trices techniques, direction et collaborateurs/trices de la crèche.</li>
</ul>
<div style="font-weight:700;font-size:14px;margin-bottom:10px">👆 Pointer</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Un clic sur une tuile enregistre une <strong>arrivée</strong> ; un second clic enregistre le <strong>départ</strong>. La tuile indique l'heure du dernier pointage.</li>
  <li>Un bouton <strong>Annuler</strong> reste affiché 8 secondes après chaque pointage, en cas d'erreur.</li>
  <li>La barre de recherche filtre les tuiles par prénom.</li>
  <li>Le compteur en haut affiche le nombre de présents sur le total.</li>
</ul>
<div style="background:#FEF0E6;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#C95F0A">
  ⚠ Pour un enfant, une arrivée pointée ici marque automatiquement sa présence du jour dans le module <strong>Présences</strong> — les horaires de la feuille de présence restent ceux du contrat d'accueil, le pointage ne les modifie pas.
</div>`,

annexes: `
<h3 style="font-family:sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🔗 Les autres outils Koala Kids</h3><div style="background:#EEEDF8;border-left:4px solid #3D3580;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#3D3580">💡 L’application ne se limite pas à cette page. Depuis le portail d’accueil, plusieurs outils complémentaires sont accessibles.</div><div style="font-weight:700;font-size:14px;margin-bottom:10px">📦 Gestion des stocks</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Inventaire (matériel et consommables), commandes, fournisseurs.</li><li>Dispose de sa propre notice, accessible par le bouton <strong>?</strong> en bas à droite de cette page.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">🧸 Ludothèque Koalakids</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Propositions pédagogiques et leurs sous-catégories.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">👶 Suivi de l'enfant</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Suivi quotidien, repères de développement et synthèses partagées avec les familles.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">💶 Familles &amp; contrats</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li><strong>Devis</strong> : tableau de bord, préinscriptions, devis, relances, visites ; un devis signé devient une inscription.</li><li><strong>Contrats d'accueil</strong> : contrats, avenants, renouvellements, signatures.</li><li><strong>Facturation</strong> : factures mensuelles, encaissements, impayés, fin de contrat.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">🎓 Quiz &amp; Formations</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Supports interactifs de formation destinés aux équipes comme aux familles.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">🔗 Liens annexes</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>Accès direct à Genially, aux tableaux Padlet du réseau et au logiciel de gestion Gertrude (Kidevo).</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">📄 Base documentaire</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li><strong>Documents</strong> : bibliothèque de documents à remplir ou télécharger, classés par catégorie, avec signature manuscrite à l'écran ou signature à distance par QR code.</li><li><strong>Base réglementaire</strong> : textes et références réglementaires micro-crèches.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">⚙️ Paramètres, Équipe, Mon espace, Accès terrain</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li><strong>Paramètres</strong> (direction) : établissements, agréments, mentions des documents.</li><li><strong>Équipe</strong> (direction) : fiches, comptes et plannings des collaborateurs/trices.</li><li><strong>Mon espace</strong> : planning et compteur d'heures, accès collaborateur/trice.</li><li><strong>Accès terrain</strong> : suivi de l'enfant, infirmerie, signalement d'incident et autorisation de prise de médicament à faire signer aux parents, accès auxiliaires.</li></ul><div style="font-weight:700;font-size:14px;margin-bottom:10px">📱 Installation sur tablette</div><ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0"><li>L’application peut être installée sur l’écran d’accueil d’une tablette ou d’un téléphone Android : ouvrir le portail dans Chrome, puis menu ⋮ → <strong>Ajouter à l’écran d’accueil</strong>.</li><li>Elle s’ouvre alors comme une application, en plein écran.</li><li><strong>Tablette de pointage</strong> : ouvrir le lien de pointage (Paramètres › Les établissements) dans Chrome, puis menu ⋮ → <strong>Installer l’application</strong> (ou <strong>Ajouter à l’écran d’accueil</strong>). Si l’option n’apparaît pas, mettre Chrome à jour et ouvrir le lien en entier (avec <code>?k=…</code>), pas dans un navigateur intégré (WhatsApp, mail…).</li></ul>
`
};



