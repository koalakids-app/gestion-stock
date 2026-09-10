// =============================================
// VACCINATIONS OBLIGATOIRES
// =============================================

// Définition des vaccins obligatoires selon calendrier vaccinal français 2025
const VAC_SCHEMA = [
  {id:'dtp_coque',label:'DTCaP (Diphtérie, Tétanos, Coqueluche, Polio)',doses:[{label:'2 mois',months:2},{label:'4 mois',months:4},{label:'11 mois',months:11}]},
  {id:'hib',label:'Haemophilus influenzae b',doses:[{label:'2 mois',months:2},{label:'4 mois',months:4},{label:'11 mois',months:11}]},
  {id:'hepb',label:'Hépatite B',doses:[{label:'2 mois',months:2},{label:'4 mois',months:4},{label:'11 mois',months:11}]},
  {id:'pneumo',label:'Pneumocoque',doses:[{label:'2 mois',months:2},{label:'4 mois',months:4},{label:'11 mois',months:11}]},
  {id:'menb',label:'Méningocoque B',doses:[{label:'3 mois',months:3},{label:'5 mois',months:5},{label:'12 mois',months:12}]},
  {id:'menacwy',label:'Méningocoques ACWY',doses:[{label:'6 mois',months:6},{label:'12 mois',months:12}]},
  {id:'menc',label:'Méningocoque C',doses:[{label:'5 mois',months:5},{label:'12 mois',months:12}]},
  {id:'ror',label:'ROR (Rougeole, Oreillons, Rubéole)',doses:[{label:'12 mois',months:12},{label:'18 mois',months:18}]},
];

let cacheVaccinations = [];
let vacCurrentEnfantId = null;

function vacAddMonths(date, months){
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function vacFmtDate(d){
  if(!d) return '—';
  const dd = new Date(d);
  return dd.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function vacLocalISO(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function vacDaysUntil(isoDate){
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(isoDate); target.setHours(0,0,0,0);
  return Math.round((target-today)/(1000*60*60*24));
}

async function vacInit(){
  // Populate crèche select
  const sel = document.getElementById('vac-creche-select');
  if(sel){
    const opts = cacheCreches.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    sel.innerHTML = '<option value="">Toutes les crèches</option>' + opts;
    if(!isDirection && currentProfile?.creche_id){
      sel.value = currentProfile.creche_id;
      sel.style.display = 'none';
    }
  }
  await vacLoadData();
  vacRender();
}

async function vacLoadData(){
  const {data, error} = await sb.from('vaccinations').select('*');
  if(error){console.warn('vaccinations load',error);cacheVaccinations=[];return;}
  cacheVaccinations = data || [];
  await vacLoadPJ();
}

// ── Pièces jointes vaccinales (photocopies du carnet) ──
let cacheVacPJ = [];
let vacPJLoaded = false;   // le cache peut etre demande par la fiche enfant avant l'ouverture du module Vaccinations
async function vacLoadPJ(){
  const {data, error} = await sb.from('vaccins_pj').select('*').order('created_at',{ascending:true});
  if(error){console.warn('vaccins_pj load',error);cacheVacPJ=[];return;}
  cacheVacPJ = data || [];
  vacPJLoaded = true;
}

function vacShowView(view, btn){
  ['liste','alertes','calendrier'].forEach(v=>{
    const el = document.getElementById('vac-view-'+v);
    if(el) el.classList.toggle('active', v===view);
  });
  document.querySelectorAll('#main-vaccinations .module-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(view==='liste') vacRenderListe();
  if(view==='alertes') vacRenderAlertes();
  if(view==='calendrier') vacRenderCalendrier();
}

function vacRender(){
  const activeTab = document.querySelector('#main-vaccinations .module-tab.active');
  const activeView = activeTab ? (activeTab.textContent.includes('Liste')?'liste':activeTab.textContent.includes('Alertes')?'alertes':'calendrier') : 'liste';
  if(activeView==='liste') vacRenderListe();
  if(activeView==='alertes') vacRenderAlertes();
  if(activeView==='calendrier') vacRenderCalendrier();
}

function vacGetEnfantsFiltres(){
  const crecheId = document.getElementById('vac-creche-select')?.value || '';
  return (crecheId ? cacheEnfants.filter(e=>e.creche_id===crecheId) : [...cacheEnfants])
    .filter(e=>e.dob) // only enfants with DOB
    .sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr'));
}

function vacGetDoseKey(enfantId, vaccId, doseIdx){ return enfantId+'_'+vaccId+'_'+doseIdx; }

function vacGetRecord(enfantId, vaccId, doseIdx){
  return cacheVaccinations.find(v=>v.enfant_id===enfantId && v.vaccin_id===vaccId && v.dose_index===doseIdx);
}

function vacDoseStatus(enfant, vacc, doseIdx){
  const dose = vacc.doses[doseIdx];
  const rec = vacGetRecord(enfant.id, vacc.id, doseIdx);
  if(rec && rec.date_fait) return {state:'fait', date: rec.date_fait, rec};
  const due = vacAddMonths(new Date(enfant.dob), dose.months);
  const daysLeft = vacDaysUntil(vacLocalISO(due));
  if(daysLeft < 0) return {state:'retard', due, daysLeft, rec};
  if(daysLeft <= 30) return {state:'proche', due, daysLeft, rec};
  return {state:'ok', due, daysLeft, rec};
}

function vacRenderListe(){
  const el = document.getElementById('vac-enfant-list');
  if(!el) return;
  const enfants = vacGetEnfantsFiltres();
  if(!enfants.length){el.innerHTML='<div class="empty-state"><i class="ti ti-users"></i><p>Aucun enfant avec date de naissance. Ajoutez-en via le bouton ci-dessus.</p></div>';return;}
  el.innerHTML = enfants.map(e=>{
    const creche = cacheCreches.find(c=>c.id===e.creche_id);
    let alertCount = 0;
    VAC_SCHEMA.forEach(v=>v.doses.forEach((d,di)=>{const s=vacDoseStatus(e,v,di);if(s.state==='retard'||s.state==='proche')alertCount++;}));
    const ageMs = Date.now() - new Date(e.dob).getTime();
    const ageMois = Math.floor(ageMs/(1000*60*60*24*30.44));
    const ageStr = ageMois < 24 ? ageMois+' mois' : Math.floor(ageMois/12)+' ans '+(ageMois%12)+' mois';
    const alertBadge = alertCount > 0
      ? `<span style="background:var(--red-light);color:var(--red);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">⚠️ ${alertCount} à vérifier</span>`
      : `<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✅ À jour</span>`;
    return `<button onclick="vacOpenFiche('${e.id}')" style="width:100%;text-align:left;background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;box-shadow:0 1px 4px rgba(61,53,128,0.07)">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <span style="width:36px;height:36px;flex-shrink:0;border-radius:50%;background:var(--koala-light);color:var(--koala);display:inline-flex;align-items:center;justify-content:center;font-size:18px"><i class="ti ti-user"></i></span>
        <div style="min-width:0">
          <div style="font-weight:700;color:var(--koala-dark);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(e.prenom+' '+e.nom)}</div>
          <div style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">né(e) le ${vacFmtDate(e.dob)} · ${ageStr}${creche?' · '+escHtml(creche.name):''}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">${alertBadge}<i class="ti ti-chevron-right" style="color:var(--muted);font-size:18px"></i></div>
    </button>`;
  }).join('');
}

// Fiche vaccins d'un enfant (tableau de doses) affichée en modal
let vacFicheEnfantId = null;
function vacOpenFiche(enfantId){
  const e = cacheEnfants.find(x=>String(x.id)===String(enfantId));
  if(!e) return;
  vacFicheEnfantId = e.id;
  document.getElementById('vac-fiche-title').innerHTML = '<i class="ti ti-vaccine"></i> '+escHtml(e.prenom+' '+e.nom);
  vacRenderFicheBody();
  document.getElementById('modal-vac-fiche-wrap').classList.add('open');
}
function vacRenderFicheBody(){
  const e = cacheEnfants.find(x=>String(x.id)===String(vacFicheEnfantId));
  const body = document.getElementById('vac-fiche-body');
  if(!e || !body) return;
  const creche = cacheCreches.find(c=>c.id===e.creche_id);
  const ageMs = Date.now() - new Date(e.dob).getTime();
  const ageMois = Math.floor(ageMs/(1000*60*60*24*30.44));
  const ageStr = ageMois < 24 ? ageMois+' mois' : Math.floor(ageMois/12)+' ans '+(ageMois%12)+' mois';
  const rows = VAC_SCHEMA.map(v=>{
    const doses = v.doses.map((dose,di)=>{
      const s = vacDoseStatus(e,v,di);
      let cell;
      if(s.state==='fait'){
        cell='<button onclick="vacToggleDose(\''+e.id+'\',\''+v.id+'\','+di+')" title="Fait — cliquer pour annuler" style="width:34px;height:34px;border:none;border-radius:50%;background:var(--green);color:#fff;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center">✓</button>';
      }else{
        /* La couleur ne doit jamais porter seule l'information : les pastilles
           non faites etaient vides et ne differaient que par la teinte de leur
           bordure. Chacune porte desormais un symbole, et l'epaisseur du trait
           distingue aussi les trois etats sans recours a la couleur.
             ⚠  en retard   ·  !  a faire bientot  ·  ·  pas encore du */
        const border = s.state==='retard'?'3px solid var(--red)':s.state==='proche'?'2px solid var(--orange)':'2px dashed var(--border)';
        const bg = s.state==='retard'?'var(--red-light)':s.state==='proche'?'var(--orange-light)':'#fff';
        const glyphe = s.state==='retard'?'⚠':s.state==='proche'?'!':'·';
        const couleur = s.state==='retard'?'var(--red)':s.state==='proche'?'var(--orange-dark)':'var(--muted)';
        const infobulle = s.state==='retard'?'En retard — cliquer si fait':s.state==='proche'?'À faire bientôt — cliquer si fait':'Pas encore dû — cliquer si fait';
        cell='<button onclick="vacToggleDose(\''+e.id+'\',\''+v.id+'\','+di+')" aria-label="'+infobulle+'" title="'+infobulle+'" style="width:34px;height:34px;border:'+border+';border-radius:50%;background:'+bg+';color:'+couleur+';font-size:15px;font-weight:800;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center">'+glyphe+'</button>';
      }
      return `<td style="padding:5px 8px;text-align:center;vertical-align:middle">${cell}</td>`;
    }).join('');
    return `<tr><td style="padding:5px 8px;font-size:12px;font-weight:600;color:var(--koala-dark);white-space:nowrap">${v.label}</td>${doses}</tr>`;
  }).join('');
  body.innerHTML = `
    <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">né(e) le ${vacFmtDate(e.dob)} · ${ageStr}${creche?' · '+escHtml(creche.name):''}</div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--koala-light)">
            <th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--koala);text-align:left;min-width:180px">Vaccin</th>
            ${VAC_SCHEMA[0].doses.map(d=>`<th style="padding:6px 8px;font-size:11px;font-weight:700;color:var(--koala);text-align:center;white-space:nowrap">${d.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;font-size:11.5px;color:var(--muted);line-height:1.6">
      <span style="color:var(--green);font-weight:700">✓</span> fait ·
      <span style="color:var(--red);font-weight:800">⚠</span> en retard ·
      <span style="color:var(--orange-dark);font-weight:800">!</span> à faire bientôt ·
      <span style="color:var(--muted);font-weight:800">·</span> pas encore dû.
      Cliquez une pastille pour la marquer faite (ou l'annuler).
    </div>
    <div id="vac-pj-zone" style="margin-top:16px"></div>`;
  vacRenderPJ();
}

/* ── Photocopies du carnet de vaccination ─────────────────────────────────
   Le meme bloc est affiche a deux endroits : la fiche vaccins du module
   Vaccinations (#vac-pj-zone) et l'onglet Documents de la fiche enfant
   (#enf-carnet-zone). Une seule source de donnees : la table `vaccins_pj`,
   donc une piece ajoutee d'un cote apparait de l'autre.

   Stockage : bucket PRIVE `carnets`. On n'enregistre plus d'URL publique —
   il s'agit de donnees de sante d'enfants, et une URL publique reste lisible
   par quiconque la possede, sans authentification. On ne garde que le bucket
   et le chemin de l'objet, et chaque ouverture demande a Supabase une URL
   signee valable quelques minutes. Les lignes creees avant ce changement
   pointent vers l'ancien bucket public `assets` : elles restent lisibles
   (colonnes bucket/path renseignees par la migration), mais tant que ces
   fichiers-la n'ont pas ete redeposes ils demeurent publics. */
const VACPJ_BUCKET = 'carnets';
const VACPJ_TTL    = 300;   // duree de vie d'une URL signee, en secondes

/* Bucket et chemin d'une piece jointe, y compris pour les lignes
   historiques ou seule l'URL publique a ete enregistree. */
function vacPJLoc(p){
  if(p && p.bucket && p.path) return {bucket:p.bucket, path:p.path};
  const m = String((p&&p.url)||'').match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  return m ? {bucket:m[1], path:decodeURIComponent(m[2])} : null;
}

/* Ouverture : l'URL est generee au moment du clic et expire ensuite. */
async function vacPJOpen(id){
  const p = cacheVacPJ.find(x=>String(x.id)===String(id));
  const loc = p && vacPJLoc(p);
  if(!loc){alert('Fichier introuvable.');return;}
  const {data,error} = await sb.storage.from(loc.bucket).createSignedUrl(loc.path, VACPJ_TTL);
  if(error||!data){alert('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'));return;}
  window.open(data.signedUrl,'_blank','noopener');
}

/* Rendu generique : zoneId = conteneur, eid = enfant, inputId = champ fichier
   (chaque zone a le sien pour que les deux emplacements coexistent). */
function vacPJRenderZone(zoneId, eid, inputId){
  const zone = document.getElementById(zoneId);
  if(!zone) return;
  if(!eid){zone.innerHTML='';return;}
  const items = cacheVacPJ.filter(p=>String(p.enfant_id)===String(eid));
  const list = items.length ? items.map(p=>
    '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:#fff">'
    + '<i class="ti ti-paperclip" style="color:var(--koala)"></i>'
    + '<button type="button" onclick="vacPJOpen(\''+p.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12.5px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(p.filename||'Document')+'</button>'
    + '<button onclick="vacDeletePJ(\''+p.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:15px"><i class="ti ti-trash"></i></button>'
    + '</div>'
  ).join('') : '<div style="font-size:12px;color:var(--muted)">Aucune photocopie jointe pour le moment.</div>';
  zone.innerHTML =
    '<div style="font-weight:700;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:6px"><i class="ti ti-camera" style="color:var(--koala)"></i> Photocopies du carnet de vaccination</div>'
    + '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">'+list+'</div>'
    + '<button class="btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;font-size:12.5px" onclick="document.getElementById(\''+inputId+'\').click()"><i class="ti ti-upload"></i> Ajouter une photocopie</button>'
    + '<span id="'+inputId+'-status" style="margin-left:10px;font-size:12px;color:var(--muted)"></span>'
    + '<input type="file" id="'+inputId+'" data-eid="'+escHtml(String(eid))+'" accept="image/*,application/pdf" multiple style="display:none" onchange="vacHandlePJ(event)"/>';
}

/* Les deux emplacements sont rafraichis ensemble : celui qui n'est pas
   affiche sort immediatement de vacPJRenderZone. */
function vacPJRefresh(){
  vacPJRenderZone('vac-pj-zone', vacFicheEnfantId, 'vac-pj-input');
  vacPJRenderZone('enf-carnet-zone', enfFicheId, 'enf-carnet-input');
}
function vacRenderPJ(){ vacPJRenderZone('vac-pj-zone', vacFicheEnfantId, 'vac-pj-input'); }

/* Appele a l'ouverture de la fiche enfant : le cache peut ne jamais avoir
   ete charge si le module Vaccinations n'a pas ete ouvert. */
async function enfLoadCarnet(enfantId){
  if(!vacPJLoaded) await vacLoadPJ();
  if(String(enfFicheId)!==String(enfantId)) return;   // fiche deja refermee ou changee
  vacPJRenderZone('enf-carnet-zone', enfantId, 'enf-carnet-input');
}

async function vacHandlePJ(event){
  const input = event.target;
  const files = Array.from(input.files||[]);
  if(!files.length) return;
  const eid = input.dataset.eid;
  const status = document.getElementById(input.id+'-status');
  for(const file of files){
    if(status) status.textContent = '⏳ Envoi de '+file.name+'…';
    try{
      const ext = (file.name.split('.').pop()||'bin');
      const path = eid+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
      /* Client authentifie (sb) et non le client anonyme : le bucket est prive
         et ses policies exigent un compte referent. */
      const {error} = await sb.storage.from(VACPJ_BUCKET).upload(path,file);
      if(error) throw error;
      const {data:ins, error:insErr} = await sb.from('vaccins_pj')
        .insert({enfant_id:eid, bucket:VACPJ_BUCKET, path:path, filename:file.name}).select().single();
      if(insErr) throw insErr;
      if(ins) cacheVacPJ.push(ins);
      vacPJRefresh();
    }catch(e){
      console.error('[VacPJ]',e.message);
      if(status) status.textContent = '⚠ Erreur : '+e.message;
      return;
    }
  }
  if(status) status.textContent = '✅ Ajouté';
  showBanner('Photocopie(s) jointe(s) ✅');
}

async function vacDeletePJ(id){
  if(!confirm('Supprimer cette photocopie ?')) return;
  const p = cacheVacPJ.find(x=>String(x.id)===String(id));
  const {error} = await sb.from('vaccins_pj').delete().eq('id',id);
  if(error){alert('Erreur : '+error.message);return;}
  /* Le fichier lui-meme est retire du stockage : sans cela il resterait
     indefiniment dans le bucket, hors de toute fiche. */
  const loc = p && vacPJLoc(p);
  if(loc){
    const {error:rmErr} = await sb.storage.from(loc.bucket).remove([loc.path]);
    if(rmErr) console.warn('[VacPJ] fichier non supprime du stockage',rmErr.message);
  }
  cacheVacPJ = cacheVacPJ.filter(p=>p.id!==id);
  vacPJRefresh();
  showBanner('Photocopie supprimée.');
}
window.vacHandlePJ = vacHandlePJ;
window.vacDeletePJ = vacDeletePJ;
window.vacPJOpen   = vacPJOpen;

function vacRenderAlertes(){
  const el = document.getElementById('vac-alert-list');
  const badge = document.getElementById('vac-alert-badge');
  if(!el) return;
  const enfants = vacGetEnfantsFiltres();
  const alertes = [];
  enfants.forEach(e=>{
    const creche = cacheCreches.find(c=>c.id===e.creche_id);
    VAC_SCHEMA.forEach(v=>{
      v.doses.forEach((dose,di)=>{
        const s = vacDoseStatus(e,v,di);
        if(s.state==='retard'||s.state==='proche'){
          alertes.push({enfant:e, creche, vacc:v, doseIdx:di, dose, s});
        }
      });
    });
  });
  if(badge){
    badge.textContent = alertes.length;
    badge.style.display = alertes.length ? 'inline' : 'none';
  }
  if(!alertes.length){el.innerHTML='<div class="empty-state"><i class="ti ti-circle-check" style="color:var(--green)"></i><p>Aucune alerte ! Toutes les vaccinations sont à jour.</p></div>';return;}
  alertes.sort((a,b)=>a.s.daysLeft-b.s.daysLeft);
  el.innerHTML = alertes.map(({enfant,creche,vacc,doseIdx,dose,s})=>{
    const urgency = s.state==='retard' ? {bg:'var(--red-light)',col:'var(--red)',icon:'⚠️',label:'En retard'} : {bg:'var(--orange-light)',col:'var(--orange-dark)',icon:'⏰',label:'Dans '+s.daysLeft+' jour(s)'};
    return `<div style="background:${urgency.bg};border-left:4px solid ${urgency.col};border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-weight:700;color:${urgency.col}">${urgency.icon} ${escHtml(enfant.prenom+' '+enfant.nom)} ${creche?'— '+escHtml(creche.name):''}</div>
        <div style="font-size:12px;margin-top:2px;color:var(--text)">${escHtml(vacc.label)} · ${dose.label} · Prévu le ${vacFmtDate(vacLocalISO(s.due))}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:12px;font-weight:700;color:${urgency.col}">${urgency.label}</span>
        <button onclick="vacToggleDose('${enfant.id}','${vacc.id}',${doseIdx})" style="padding:5px 12px;border:2px solid ${urgency.col};border-radius:7px;background:#fff;cursor:pointer;font-weight:600;color:${urgency.col};font-size:12px">✔ Marquer fait</button>
      </div>
    </div>`;
  }).join('');
}

function vacRenderCalendrier(){
  const el = document.getElementById('vac-cal-list');
  if(!el) return;
  const enfants = vacGetEnfantsFiltres();
  const upcoming = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const in90 = new Date(today); in90.setDate(in90.getDate()+90);
  enfants.forEach(e=>{
    const creche = cacheCreches.find(c=>c.id===e.creche_id);
    VAC_SCHEMA.forEach(v=>{
      v.doses.forEach((dose,di)=>{
        const s = vacDoseStatus(e,v,di);
        if(s.state==='fait') return;
        if(s.due && s.due <= in90){
          upcoming.push({enfant:e,creche,vacc:v,doseIdx:di,dose,s});
        }
      });
    });
  });
  upcoming.sort((a,b)=>a.s.due-b.s.due);
  if(!upcoming.length){el.innerHTML='<div class="empty-state"><i class="ti ti-calendar-check"></i><p>Aucun vaccin prévu dans les 90 prochains jours.</p></div>';return;}
  // Group by month
  const byMonth = {};
  upcoming.forEach(item=>{
    const key = item.s.due.getFullYear()+'-'+String(item.s.due.getMonth()+1).padStart(2,'0');
    if(!byMonth[key]) byMonth[key]=[];
    byMonth[key].push(item);
  });
  el.innerHTML = Object.entries(byMonth).map(([key,items])=>{
    const [y,m] = key.split('-');
    const monthLabel = new Date(+y,+m-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    const rows = items.map(({enfant,creche,vacc,doseIdx,dose,s})=>{
      const col = s.state==='retard'?'var(--red)':s.state==='proche'?'var(--orange)':'var(--koala)';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:6px">
        <div>
          <span style="font-weight:600;color:var(--text)">${escHtml(enfant.prenom+' '+enfant.nom)}</span>
          ${creche?`<span style="font-size:11px;color:var(--muted);margin-left:6px">${escHtml(creche.name)}</span>`:''}
          <div style="font-size:12px;color:var(--muted);margin-top:1px">${escHtml(vacc.label)} · ${dose.label}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:700;color:${col}">${vacFmtDate(vacLocalISO(s.due))}</span>
          <button onclick="vacToggleDose('${enfant.id}','${vacc.id}',${doseIdx})" style="padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:11px;color:var(--koala)">✔ Marquer fait</button>
        </div>
      </div>`;
    }).join('');
    return `<div style="background:#fff;border-radius:10px;border:1px solid var(--border);overflow:hidden;margin-bottom:8px">
      <div style="background:var(--koala-light);padding:8px 12px;font-weight:700;color:var(--koala);font-size:13px;text-transform:capitalize">${monthLabel}</div>
      ${rows}
    </div>`;
  }).join('');
}

function vacOpenDose(enfantId, vaccId, doseIdx){
  vacCurrentEnfantId = enfantId;
  const vacc = VAC_SCHEMA.find(v=>v.id===vaccId);
  const dose = vacc?.doses[doseIdx];
  const enfant = cacheEnfants.find(e=>e.id===enfantId);
  const rec = vacGetRecord(enfantId, vaccId, doseIdx);
  document.getElementById('vac-dose-title').textContent = (enfant?enfant.prenom+' '+enfant.nom:'') + ' — ' + (vacc?.label||'') + ' — ' + (dose?.label||'');
  document.getElementById('vac-dose-vaccin-id').value = vaccId;
  document.getElementById('vac-dose-index').value = doseIdx;
  document.getElementById('vac-dose-enfant-id').value = enfantId;
  document.getElementById('vac-dose-date').value = rec?.date_fait || '';
  document.getElementById('vac-dose-vaccin-name').value = rec?.vaccin_nom || '';
  document.getElementById('vac-dose-lot').value = rec?.lot || '';
  document.getElementById('vac-dose-note').value = rec?.note || '';
  document.getElementById('vac-dose-delete-btn').style.display = rec ? 'inline-flex' : 'none';
  document.getElementById('modal-vac-dose-wrap').classList.add('open');
}

async function vacSaveDose(){
  const enfantId = document.getElementById('vac-dose-enfant-id').value;
  const vaccId = document.getElementById('vac-dose-vaccin-id').value;
  const doseIdx = parseInt(document.getElementById('vac-dose-index').value);
  const dateFait = document.getElementById('vac-dose-date').value;
  if(!dateFait){alert('Veuillez saisir la date de vaccination.');return;}
  const row = {
    enfant_id: enfantId,
    vaccin_id: vaccId,
    dose_index: doseIdx,
    date_fait: dateFait,
    vaccin_nom: document.getElementById('vac-dose-vaccin-name').value.trim()||null,
    lot: document.getElementById('vac-dose-lot').value.trim()||null,
    note: document.getElementById('vac-dose-note').value.trim()||null
  };
  const existing = vacGetRecord(enfantId, vaccId, doseIdx);
  if(existing){
    const {error} = await sb.from('vaccinations').update(row).eq('id',existing.id);
    if(error){alert('Erreur mise à jour: '+error.message);return;}
    const idx = cacheVaccinations.findIndex(v=>v.id===existing.id);
    if(idx>=0) cacheVaccinations[idx] = {...existing,...row};
  } else {
    const {data, error} = await sb.from('vaccinations').insert(row).select().single();
    if(error){alert('Erreur enregistrement: '+error.message);return;}
    if(data) cacheVaccinations.push(data);
  }
  closeModal('modal-vac-dose-wrap');
  vacRender();
  showBanner('Vaccination enregistrée ✅');
}

async function vacDeleteDose(){
  const enfantId = document.getElementById('vac-dose-enfant-id').value;
  const vaccId = document.getElementById('vac-dose-vaccin-id').value;
  const doseIdx = parseInt(document.getElementById('vac-dose-index').value);
  const existing = vacGetRecord(enfantId, vaccId, doseIdx);
  if(!existing) return;
  if(!confirm('Supprimer cet enregistrement de vaccination ?')) return;
  const {error} = await sb.from('vaccinations').delete().eq('id',existing.id);
  if(error){alert('Erreur suppression: '+error.message);return;}
  cacheVaccinations = cacheVaccinations.filter(v=>v.id!==existing.id);
  closeModal('modal-vac-dose-wrap');
  vacRender();
  showBanner('Vaccination supprimée.');
}

function vacOpenEnfantModal(){
  // Re-use existing openEnfantModal if exists
  openEnfantModal();
}
// Clic simple : bascule fait / non-fait sans saisie de date (date du jour enregistrée automatiquement)
async function vacToggleDose(enfantId, vaccId, doseIdx){
  const existing = vacGetRecord(enfantId, vaccId, doseIdx);
  if(existing){
    // Déjà fait -> annuler
    const {error} = await sb.from('vaccinations').delete().eq('id',existing.id);
    if(error){alert('Erreur : '+error.message);return;}
    cacheVaccinations = cacheVaccinations.filter(v=>v.id!==existing.id);
    vacRender();
    if(document.getElementById('modal-vac-fiche-wrap')?.classList.contains('open')) vacRenderFicheBody();
    showBanner('Vaccin annulé.');
  }else{
    // Pas encore fait -> marquer fait avec la date du jour
    const row = {enfant_id:enfantId, vaccin_id:vaccId, dose_index:doseIdx, date_fait:todayStr()};
    const {data, error} = await sb.from('vaccinations').insert(row).select().single();
    if(error){alert('Erreur : '+error.message);return;}
    if(data) cacheVaccinations.push(data);
    vacRender();
    if(document.getElementById('modal-vac-fiche-wrap')?.classList.contains('open')) vacRenderFicheBody();
    showBanner('Vaccin marqué comme fait ✅');
  }
}
window.vacToggleDose = vacToggleDose;
window.vacOpenDose = vacOpenDose;
window.vacSaveDose = vacSaveDose;
window.vacDeleteDose = vacDeleteDose;
window.vacShowView = vacShowView;
window.vacOpenFiche = vacOpenFiche;
window.vacRender = vacRender;
window.vacOpenEnfantModal = vacOpenEnfantModal;
