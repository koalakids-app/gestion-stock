
/* En-tête de la fiche : ces deux champs sont enregistrés comme les autres. */
const EAJE_META=[
  {id:'ctrl_creche', l:'Crèche',            t:'creche'},
  {id:'ctrl_date',   l:'Date de la visite', t:'date'}
];
let eajeTimer=null;

function eajeToday(){
  const d=new Date();
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function eajeItems(){
  const o=[];CTRL_SCHEMA.forEach(s=>(s.items||[]).forEach(it=>{if(it.t!=='sep')o.push(it);}));return o;
}
function eajeFields(){
  return EAJE_META.map(m=>m.id).concat(eajeItems().map(it=>it.id));
}
function eajeGet(id){const e=document.getElementById('ff_'+id);return e?e.value:'';}

function eajeStats(){
  let total=0,filled=0;
  eajeItems().forEach(it=>{total++;if(eajeGet(it.id)!=='')filled++;});
  return {total:total,filled:filled,pct:total?Math.round(filled/total*100):0};
}
/* Barre de progression globale + compteur x/y de chaque section. */
function eajeRefresh(){
  const st=eajeStats();
  const lbl=document.getElementById('eaje-pct');if(lbl)lbl.textContent=st.pct+' %';
  const bar=document.getElementById('eaje-bar');if(bar)bar.style.width=st.pct+'%';
  CTRL_SCHEMA.forEach((sec,si)=>{
    const c=document.getElementById('eaje-c'+si);if(!c)return;
    const its=(sec.items||[]).filter(it=>it.t!=='sep');
    c.textContent=its.filter(it=>eajeGet(it.id)!=='').length+'/'+its.length;
  });
}
/* Repli / dépli par simple bascule d’affichage : les champs restent dans le DOM,
   sinon saveFill() perdrait les sections fermées. */
function eajeToggle(si){
  const body=document.getElementById('eaje-b'+si),head=document.getElementById('eaje-h'+si);
  if(!body||!head)return;
  const open=(body.style.display==='none');
  body.style.display=open?'':'none';
  head.classList.toggle('on',open);
  const chev=head.querySelector('.eaje-chev');
  if(chev)chev.className='ti ti-chevron-'+(open?'up':'down')+' eaje-chev';
}
function eajeYN(id,val){
  const el=document.getElementById('ff_'+id);if(!el)return;
  el.value=(el.value===val)?'':val;
  ['oui','non'].forEach(v=>{
    const b=document.getElementById('ffb_'+id+'_'+v);
    if(b)b.classList.toggle('on',el.value===v);
  });
  eajeTouch();
}
/* Sauvegarde automatique, comme dans l’ancien module : 1,5 s après la dernière saisie. */
function eajeTouch(){
  eajeRefresh();
  clearTimeout(eajeTimer);
  eajeTimer=setTimeout(async()=>{
    const ov=document.getElementById('ovFill');
    if(!ov||!ov.classList.contains('on'))return;
    if(!fillDoc||fillDoc.template_key!=='eaje')return;
    await saveFill(true);
    const st=document.getElementById('fillState');
    if(!st)return;
    /* Ne jamais annoncer un enregistrement qui n'a pas eu lieu : un refus RLS
       est silencieux cote base, c'est a l'ecran de le dire. */
    if(SAVE_KO){
      st.textContent='⚠ NON ENREGISTRÉ — '+SAVE_KO;
      st.style.color='#C62828';
      st.style.fontWeight='700';
      return;
    }
    st.style.color='';
    st.style.fontWeight='';
    st.textContent='Enregistré automatiquement à '+
      new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  },1500);
}

function eajeMetaHtml(f,v){
  let val=v[f.id]||'';
  if(f.t==='creche'){
    const list=(typeof CRECHES!=='undefined'&&CRECHES.length)
      ?CRECHES.map(c=>c.name)
      :CRECHE_NOMS_COURTS;
    if(!val&&PROF&&PROF.role==='referent'&&PROF.creche_id){
      const mine=(CRECHES||[]).find(c=>c.id===PROF.creche_id);
      if(mine)val=mine.name;
    }
    return '<div class="f" style="margin:0;min-width:170px"><label>'+esc(f.l)+'</label>'
      +'<select id="ff_'+f.id+'" onchange="eajeTouch()"><option value=""></option>'
      +list.map(n=>'<option'+(val===n?' selected':'')+'>'+esc(n)+'</option>').join('')
      +'</select></div>';
  }
  if(!val)val=eajeToday();
  return '<div class="f" style="margin:0;min-width:160px"><label>'+esc(f.l)+'</label>'
    +'<input type="date" id="ff_'+f.id+'" value="'+esc(val)+'" onchange="eajeTouch()"></div>';
}

function eajeItemHtml(it,v){
  if(it.t==='sep')return '<div class="eaje-sep">'+esc(it.l)+'</div>';
  const star=it.reg?' <span class="eaje-star">(*)</span>':'';
  const aide=it.aide?'<div class="eaje-aide">'+esc(it.aide)+'</div>':'';
  const lab='<div class="eaje-lab">'+esc(it.l)+star+aide+'</div>';
  const val=v[it.id]||'';
  if(it.t==='oui_non'){
    return '<div class="eaje-row">'+lab+'<div class="eaje-yn">'
      +'<input type="hidden" id="ff_'+it.id+'" value="'+esc(val)+'">'
      +'<button type="button" class="eaje-b oui'+(val==='oui'?' on':'')+'" id="ffb_'+it.id+'_oui" onclick="eajeYN(\''+it.id+'\',\'oui\')">Oui</button>'
      +'<button type="button" class="eaje-b non'+(val==='non'?' on':'')+'" id="ffb_'+it.id+'_non" onclick="eajeYN(\''+it.id+'\',\'non\')">Non</button>'
      +'</div></div>';
  }
  if(it.t==='textarea'){
    return '<div class="eaje-row col">'+lab
      +'<textarea id="ff_'+it.id+'" rows="3" oninput="eajeTouch()">'+esc(val)+'</textarea></div>';
  }
  const t=(it.t==='num')?'number':((it.t==='date')?'date':'text');
  return '<div class="eaje-row">'+lab
    +'<input type="'+t+'" id="ff_'+it.id+'" class="eaje-in" value="'+esc(val)+'" oninput="eajeTouch()"></div>';
}

const EAJE_CSS=`<style>
.eaje .eaje-head{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;background:#F4F3FB;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px}
.eaje .eaje-prog{flex:1;min-width:180px;display:flex;align-items:center;gap:8px}
.eaje .eaje-track{flex:1;height:7px;background:#E7E4F0;border-radius:4px;overflow:hidden}
.eaje .eaje-track i{display:block;height:100%;width:0;background:var(--violet,#4A3F9F);transition:width .2s}
.eaje .eaje-pct{font-size:12px;font-weight:700;color:var(--violet,#4A3F9F);min-width:38px;text-align:right}
.eaje .eaje-leg{font-size:11.5px;color:var(--muted,#8E8AA8);margin:0 0 12px}
.eaje .eaje-star{color:#C62828;font-weight:700}
.eaje .eaje-sec{border:1px solid var(--border,#E7E4F0);border-radius:10px;margin-bottom:9px;overflow:hidden}
.eaje .eaje-sh{cursor:pointer;padding:11px 13px;background:#F6F4FB;color:var(--violet,#4A3F9F);display:flex;align-items:center;gap:9px;font-weight:700;font-size:13px}
.eaje .eaje-sh.on{background:var(--violet,#4A3F9F);color:#fff}
.eaje .eaje-sh span.t{flex:1}
.eaje .eaje-sh b{font-size:11px;font-weight:700;opacity:.85}
.eaje .eaje-sb{padding:11px 13px;display:grid;gap:9px}
.eaje .eaje-sep{font-weight:700;color:var(--violet,#4A3F9F);font-size:12.5px;margin-top:5px;border-bottom:1px solid var(--border,#E7E4F0);padding-bottom:4px}
.eaje .eaje-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.eaje .eaje-row.col{display:block}
.eaje .eaje-lab{font-size:12.5px;line-height:1.35;color:#333;flex:1;min-width:150px}
.eaje .eaje-aide{font-size:11px;line-height:1.3;color:var(--muted,#8E8AA8);font-style:italic;margin-top:2px}
.eaje .eaje-in{max-width:200px;margin:0}
.eaje .eaje-row.col textarea{margin-top:5px;width:100%}
.eaje .eaje-yn{display:flex;gap:6px;flex-shrink:0}
.eaje .eaje-b{border:1.5px solid #ccc;background:#fff;color:#666;border-radius:7px;padding:5px 15px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}
.eaje .eaje-b.oui.on{border-color:#1A9E5E;background:#1A9E5E;color:#fff}
.eaje .eaje-b.non.on{border-color:#D33;background:#D33;color:#fff}
@media(max-width:700px){
  .eaje .eaje-in{max-width:none;width:100%}
  .eaje .eaje-row{align-items:flex-start}
}
</style>`;

/* ================= SUIVI DES VACCINATIONS OBLIGATOIRES =================
   Reprise fidele de la trame Excel « Suivi vaccinations obligatoires »
   (mise a jour 01/01/2025) : une ligne par maladie, les noms commerciaux
   des vaccins correspondants, et jusqu'a trois doses (Date + Recu).
   Les dates theoriques sont calculees a partir de la date de naissance
   avec les memes decalages en jours que les formules du classeur. */
const VAC_CSS=`<style>
.tpl .vacw{overflow-x:auto;margin:0 0 12px;border:1px solid var(--border);border-radius:10px}
.tpl table.vac{width:100%;border-collapse:collapse;font-size:12px;min-width:700px}
.tpl table.vac th,.tpl table.vac td{border:1px solid var(--border);padding:4px 6px;vertical-align:middle}
.tpl table.vac th{background:#EEEDF8;color:var(--violet);font-weight:700;font-size:11.5px;text-align:center}
.tpl table.vac th.lab{text-align:left}
.tpl table.vac th.lab,.tpl table.vac td.mal{width:31%}
.tpl table.vac td.mal{background:#FAFAFD;min-width:215px}
.tpl .vac-mal{display:block;font-weight:700;color:var(--violet);font-size:12px;line-height:1.35}
.tpl .vac-marq{display:block;font-size:11px;color:var(--muted);line-height:1.45}
.tpl table.vac td.dose{text-align:center;min-width:118px;width:16%}
.tpl table.vac td.recu{width:7%;min-width:52px;text-align:center}
.tpl table.vac td.vide{background:#F5F5F8}
.tpl .vac-age{display:block;font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px}
.tpl table.vac input[type=date]{margin:0;height:32px;font-size:12px;text-align:center;padding:2px 4px}
.tpl table.vac input[type=date].calc{color:#8E8AA8;font-style:italic}
.tpl table.vac input[type=checkbox]{width:20px;height:20px;margin:0;accent-color:#57B894}
.tpl tr.vac-retard td.mal{background:#FDECEC}
.tpl tr.vac-retard td.dose.due{background:#FDECEC}
.tpl .vac-head{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;background:#F4F3FB;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px}
.tpl .vac-head .f{margin:0;min-width:170px}
.tpl .vac-prog{flex:1;min-width:190px;display:flex;align-items:center;gap:8px}
.tpl .vac-track{flex:1;height:7px;background:#E7E4F0;border-radius:4px;overflow:hidden}
.tpl .vac-track i{display:block;height:100%;width:0;background:#57B894;transition:width .2s}
.tpl .vac-pct{font-size:12px;font-weight:700;color:var(--violet);min-width:74px;text-align:right}
.tpl .vac-leg{font-size:11.5px;color:var(--muted);margin:0 0 12px;line-height:1.6}
.tpl .vac-leg b{color:#C62828}
</style>`;

/* j = nombre de jours ajoutes a la date de naissance (identique au classeur) */
const VAC_DOC=[
 {m:'Antidiphtérique',v:['Infanrix Tétra','Infanrix Quinta ou Pentavac','Infanrix Hexa ou Hexyon ou Vaxelis'],d:[{a:'2 mois',j:61},{a:'4 mois',j:123},{a:'11 mois',j:335}]},
 {m:'Antitétanique',v:['Infanrix Tétra','Infanrix Quinta ou Pentavac','Infanrix Hexa ou Hexyon ou Vaxelis'],d:[{a:'2 mois',j:61},{a:'4 mois',j:123},{a:'11 mois',j:335}]},
 {m:'Antipoliomyélite',v:['Infanrix Tétra','Infanrix Quinta ou Pentavac','Infanrix Hexa ou Hexyon ou Vaxelis'],d:[{a:'2 mois',j:61},{a:'4 mois',j:123},{a:'11 mois',j:335}]},
 {m:'Contre la coqueluche',v:['Infanrix Tétra','Infanrix Quinta ou Pentavac','Infanrix Hexa ou Hexyon ou Vaxelis'],d:[{a:'2 mois',j:61},{a:'4 mois',j:123},{a:'11 mois',j:335}]},
 {m:'Contre les infections à Haemophilus influenzae b',v:['Infanrix Quinta ou Pentavac','Infanrix Hexa ou Hexyon ou Vaxelis'],d:[{a:'2 mois',j:61},{a:'4 mois',j:123},{a:'11 mois',j:335}]},
 {m:'Contre virus Hépatite B',v:['Infanrix Hexa ou Hexyon ou Vaxelis','EngerixB ou Hbvaxpro'],d:[{a:'2 mois',j:61},{a:'4 mois',j:123},{a:'11 mois',j:335}]},
 {m:'Contre infections pneumocoque',v:['Prevenar ou Pneumovax'],d:[{a:'2 mois',j:61},{a:'4 mois',j:123},{a:'11 mois',j:335}]},
 {m:'Contre le méningocoque B',v:['Bexsero'],d:[{a:'3 mois',j:91},{a:'5 mois',j:152},{a:'12 mois',j:365}]},
 {m:'Contre Méningocoques ACWY',v:['Nimenrix ou Menquadfi'],d:[{a:'6 mois',j:182},{a:'12 mois',j:365}]},
 {m:'Contre la rougeole',v:['M-M-Rvaxpro ou Priorix'],d:[{a:'12 mois',j:365},{a:'18 mois',j:548}]},
 {m:'Contre les oreillons',v:['M-M-Rvaxpro ou Priorix'],d:[{a:'12 mois',j:365},{a:'18 mois',j:548}]},
 {m:'Contre la rubéole',v:['M-M-Rvaxpro ou Priorix'],d:[{a:'12 mois',j:365},{a:'18 mois',j:548}]}
];
const VAC_MAJ='Mise à jour 01/01/2025';
const VAC_NBCOL=3;
const VAC_FIELDS=(function(){
  const f=['vac_enfant','vac_naissance','vac_creche','vac_obs','vac_verif_nom','vac_verif_date'];
  VAC_DOC.forEach((g,gi)=>g.d.forEach((_,di)=>{f.push('vac_'+gi+'_'+di+'_d','vac_'+gi+'_'+di+'_r');}));
  return f;
})();

/* ── Synchronisation vers le module Vaccinations (demandes.html) ──────────
   Cette fiche (VAC_DOC, une ligne par maladie comme le Cerfa) et le module
   Vaccinations (VAC_SCHEMA dans js/vaccinations.js, non chargé sur cette
   page) décrivent le même calendrier sous deux formes : un vaccin combiné
   (DTCaP, ROR) y occupe plusieurs lignes ici mais un seul enregistrement
   là-bas. Cette page ne charge pas vaccinations.js (application autonome),
   d'où cette copie minimale de la correspondance plutôt qu'un import.
   `canon:true` marque la ligne qui fait foi pour le groupe : les lignes
   d'un même vaccin combiné partagent la même injection, donc la même date —
   inutile d'exiger une cohérence stricte entre elles. */
const VAC_GI_VACCIN=[
  {id:'dtp_coque',canon:true},{id:'dtp_coque',canon:false},{id:'dtp_coque',canon:false},{id:'dtp_coque',canon:false},
  {id:'hib',canon:true},{id:'hepb',canon:true},{id:'pneumo',canon:true},{id:'menb',canon:true},
  {id:'menacwy',canon:true},{id:'ror',canon:true},{id:'ror',canon:false},{id:'ror',canon:false}
];

/* Répercute cette fiche sur la table `vaccinations` (celle qu'utilisent les
   pastilles et les alertes de retard du module) : une dose datée et cochée
   « Reçu » crée ou met à jour son enregistrement. Volontairement additive
   uniquement — jamais de suppression ici. Cette fiche peut être rouverte et
   réenregistrée (ajout d'une observation, etc.) sans que toutes ses lignes
   aient été retouchées : une ligne restée décochée dans CE formulaire ne
   veut pas dire « annuler ce vaccin », qui a pu être marqué fait entre-temps
   depuis le module lui-même — une suppression ici l'aurait silencieusement
   effacé (dose « qui ne tient pas » après l'enregistrement de la fiche).
   Pour annuler une dose, on repasse par le module (vacToggleDose). Best-
   effort — un souci ici ne doit jamais faire échouer l'enregistrement de la
   fiche elle-même. */
async function vacSyncModuleDepuisFiche(enfantId,donnees){
  try{
    const{data:existants,error}=await sb.from('vaccinations').select('id,vaccin_id,dose_index,date_fait').eq('enfant_id',enfantId);
    if(error){console.warn('[vacSyncModule] lecture',error);return;}
    const parCle={};
    (existants||[]).forEach(r=>{parCle[r.vaccin_id+'_'+r.dose_index]=r;});
    for(let gi=0;gi<VAC_DOC.length;gi++){
      const info=VAC_GI_VACCIN[gi];
      if(!info||!info.canon)continue;
      const doses=VAC_DOC[gi].d;
      for(let di=0;di<doses.length;di++){
        const date=donnees['vac_'+gi+'_'+di+'_d']||'';
        const recu=!!donnees['vac_'+gi+'_'+di+'_r'];
        if(!(recu&&date))continue;
        const existant=parCle[info.id+'_'+di];
        if(existant){
          if(existant.date_fait!==date)await sb.from('vaccinations').update({date_fait:date}).eq('id',existant.id);
        }else{
          await sb.from('vaccinations').insert({enfant_id:enfantId,vaccin_id:info.id,dose_index:di,date_fait:date});
        }
      }
    }
  }catch(err){console.warn('[vacSyncModule]',err);}
}

/* Conversion locale : jamais toISOString() sur une date construite a minuit,
   qui recule d'un jour en UTC+2 (cf. notes techniques du projet). */
function vacIso(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function vacPlus(iso,j){
  if(!iso)return '';
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if(!m)return '';
  const d=new Date(+m[1],+m[2]-1,+m[3]);
  if(isNaN(d.getTime()))return '';
  d.setDate(d.getDate()+j);
  return vacIso(d);
}
function vacCrecheHtml(v){
  const list=(typeof CRECHES!=='undefined'&&CRECHES.length)?CRECHES.map(c=>c.name):[];
  let val=v.vac_creche||'';
  if(!val&&typeof PROF!=='undefined'&&PROF&&PROF.creche_id){
    const mine=(CRECHES||[]).find(c=>c.id===PROF.creche_id);
    if(mine)val=mine.name;
  }
  return '<div class="f"><label>Crèche</label><select id="ff_vac_creche"><option value=""></option>'
    +list.map(n=>'<option'+(val===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></div>';
}
function vacTableHtml(v){
  let h='<div class="vacw"><table class="vac"><thead><tr><th class="lab">Vaccins</th>';
  for(let i=0;i<VAC_NBCOL;i++)h+='<th>Date</th><th>Reçu</th>';
  h+='</tr></thead><tbody>';
  VAC_DOC.forEach((g,gi)=>{
    h+='<tr id="vac-tr'+gi+'"><td class="mal"><span class="vac-mal">'+esc(g.m)+'</span>'
      +g.v.map(n=>'<span class="vac-marq">'+esc(n)+'</span>').join('')+'</td>';
    for(let di=0;di<VAC_NBCOL;di++){
      const dd=g.d[di];
      if(!dd){h+='<td class="dose vide"></td><td class="recu vide"></td>';continue;}
      const kd='vac_'+gi+'_'+di+'_d',kr='vac_'+gi+'_'+di+'_r';
      h+='<td class="dose" id="vac-td'+gi+'_'+di+'"><span class="vac-age">'+esc(dd.a)+'</span>'
        +'<input type="date" id="ff_'+kd+'" value="'+esc(v[kd]||'')+'" onchange="vacMaj()"></td>'
        +'<td class="recu"><input type="checkbox" id="ff_'+kr+'"'+(v[kr]?' checked':'')+' onchange="vacMaj()"></td>';
    }
    h+='</tr>';
  });
  return h+'</tbody></table></div>';
}
/* Renseigne les dates theoriques. force=true ecrase les dates deja saisies. */
function vacRecalc(force){
  const dob=((document.getElementById('ff_vac_naissance')||{}).value)||'';
  VAC_DOC.forEach((g,gi)=>g.d.forEach((dd,di)=>{
    const el=document.getElementById('ff_vac_'+gi+'_'+di+'_d');
    if(!el)return;
    const th=vacPlus(dob,dd.j);
    if(!th)return;
    if(force||!el.value){el.value=th;el.classList.add('calc');}
  }));
  vacMaj();
}
/* Compteur de doses recues + mise en evidence des doses echues non recues. */
function vacMaj(){
  const auj=vacIso(new Date());
  let total=0,fait=0;
  VAC_DOC.forEach((g,gi)=>{
    let retard=false;
    g.d.forEach((dd,di)=>{
      total++;
      const d=document.getElementById('ff_vac_'+gi+'_'+di+'_d');
      const r=document.getElementById('ff_vac_'+gi+'_'+di+'_r');
      const td=document.getElementById('vac-td'+gi+'_'+di);
      const recu=!!(r&&r.checked);
      if(recu)fait++;
      const due=!!(d&&d.value&&d.value<=auj&&!recu);
      if(td)td.classList.toggle('due',due);
      if(due)retard=true;
      if(d&&d.value&&recu)d.classList.remove('calc');
    });
    const tr=document.getElementById('vac-tr'+gi);
    if(tr)tr.classList.toggle('vac-retard',retard);
  });
  const bar=document.getElementById('vac-bar'),pct=document.getElementById('vac-pct');
  const p=total?Math.round(fait*100/total):0;
  if(bar)bar.style.width=p+'%';
  if(pct)pct.textContent=fait+'/'+total+' — '+p+' %';
}
/* Reprend le nom, la date de naissance et la crèche de l'enfant sélectionné
   dans l'en-tête de la modale. */
function vacFromEnfant(){
  if(!fillDoc||fillDoc.template_key!=='vaccinations')return;
  const id=((document.getElementById('fillEnfant')||{}).value)||'';
  const e=(typeof ENFANTS!=='undefined'?ENFANTS:[]).find(x=>x.id===id);
  if(!e)return;
  const n=document.getElementById('ff_vac_enfant');
  if(n)n.value=((e.prenom||'')+' '+(e.nom||'')).trim();
  const c=document.getElementById('ff_vac_creche');
  if(c&&e.creche_id){
    const cr=(typeof CRECHES!=='undefined'?CRECHES:[]).find(x=>x.id===e.creche_id);
    if(cr)c.value=cr.name;
  }
  const d=document.getElementById('ff_vac_naissance');
  if(d&&e.dob){d.value=e.dob;vacRecalc(false);}
  else vacMaj();
  if(e.naissance_provisoire)toast('⚠ Date de naissance provisoire (terme prévu, enfant pas encore né) — l\'échéancier vaccinal ci-dessous est à recalculer après la naissance.');
}
function vacHookEnfant(){
  const se=document.getElementById('fillEnfant');
  if(se&&!se._vacHook){se.addEventListener('change',vacFromEnfant);se._vacHook=1;}
}

/* ---------- PREREMPLISSAGE DEPUIS L'ENFANT ET LA CRECHE CHOISIS ----------
   Les modeles lies a un enfant reprennent le prenom/nom, la date de naissance,
   l'age, le regime et la creche de l'enfant selectionne dans l'en-tete de la
   modale (ou, a defaut, la creche filtree / celle de la directrice technique).
   Une valeur saisie a la main n'est jamais ecrasee : seules les valeurs posees
   par ce prérempli sont remplacees quand on change d'enfant. Les noms des
   parents ne sont pas en base : ils restent a saisir. */
function ageTexte(dob){
  if(!dob)return '';
  const n=new Date(dob),t=new Date();
  if(isNaN(n))return '';
  let m=(t.getFullYear()-n.getFullYear())*12+t.getMonth()-n.getMonth();
  if(t.getDate()<n.getDate())m--;
  if(m<0)return '';
  if(m<24)return m+' mois';
  const a=Math.floor(m/12),r=m%12;
  return a+' ans'+(r?' '+r+' mois':'');
}
function prefillContexte(){
  const eid=((document.getElementById('fillEnfant')||{}).value)||'';
  const enfant=ENFANTS.find(e=>e.id===eid)||null;
  const cid=(enfant&&enfant.creche_id)||((document.getElementById('fillCreche')||{}).value)||(PROF&&PROF.creche_id)||'';
  const creche=CRECHES.find(c=>c.id===cid)||null;
  const parents=(enfant&&PARENTS_CACHE[enfant.id])||[];
  return {enfant,creche,parents,p1:parents[0]||null,p2:parents[1]||null,jour:new Date().toISOString().slice(0,10)};
}
/* Responsables legaux de la fiche enfant (table enfants_parents), tries mere,
   pere, tuteur puis autre. Charges une fois par enfant ; un echec de lecture
   (droits, reseau) laisse simplement les champs parents a saisir. */
const PARENTS_CACHE={};
const PARENT_ORDRE={mere:0,pere:1,tuteur:2,autre:3};
const PARENT_CIV={mere:'Madame',pere:'Monsieur'};
const PARENT_QUAL={mere:'mère',pere:'père',tuteur:'tuteur',autre:'responsable légal'};
async function chargerParents(enfantId){
  if(PARENTS_CACHE[enfantId])return;
  try{
    const{data,error}=await sb.from('enfants_parents').select('*').eq('enfant_id',enfantId).order('created_at');
    if(error)throw error;
    PARENTS_CACHE[enfantId]=(data||[]).slice().sort((a,b)=>(PARENT_ORDRE[a.lien]??9)-(PARENT_ORDRE[b.lien]??9));
  }catch(e){console.warn('chargerParents',e);PARENTS_CACHE[enfantId]=[];}
}
const pNom=p=>p?((p.prenom||'')+' '+(p.nom||'')).trim():'';
const pCiv=p=>p&&PARENT_CIV[p.lien]||'';
const pQual=p=>p?(PARENT_QUAL[p.lien]||''):'';
const sousParents=(x,c)=>({[x+'_civ1']:pCiv(c.p1),[x+'_parent1']:pNom(c.p1),[x+'_qual1']:pQual(c.p1),
  [x+'_civ2']:pCiv(c.p2),[x+'_parent2']:pNom(c.p2),[x+'_qual2']:pQual(c.p2)});
const nomComplet=e=>e?((e.prenom||'')+' '+(e.nom||'')).trim():'';
const PREFILL_ENFANT={
  antipyretique:c=>Object.assign({ap_enfant:c.enfant&&c.enfant.prenom,ap_date:c.jour},sousParents('ap',c)),
  creme_solaire:c=>Object.assign({cs_enfant:c.enfant&&c.enfant.prenom,cs_date:c.jour},sousParents('cs',c)),
  medicament_ponctuel:c=>Object.assign({mp_enfant:c.enfant&&c.enfant.prenom,mp_date:c.jour},sousParents('mp',c)),
  reglement_medicaments:c=>({rm_creche:c.creche&&c.creche.name,rm_nom:pNom(c.p1),rm_enfant:nomComplet(c.enfant),rm_date:c.jour}),
  fiche_liaison:c=>({fl_creche:c.creche&&c.creche.name,fl_enfant:nomComplet(c.enfant),
    fl_naiss:c.enfant&&c.enfant.dob,fl_date:c.jour,
    fl_parents:c.parents.slice(0,2).map(pNom).filter(Boolean).join(' et '),
    fl_tel1:c.p1&&c.p1.telephone,fl_tel2:c.p2&&c.p2.telephone}),
  fiche_renseignements:c=>({fr_nom:c.enfant&&c.enfant.nom,fr_prenom:c.enfant&&c.enfant.prenom,
    fr_naiss:c.enfant&&c.enfant.dob,fr_age:c.enfant&&ageTexte(c.enfant.dob),fr_date:c.jour}),
  fiche_sanitaire:c=>({fs_nom:c.enfant&&c.enfant.nom,fs_prenom:c.enfant&&c.enfant.prenom,
    fs_naiss:c.enfant&&c.enfant.dob,fs_regime:c.enfant&&c.enfant.regime_repas,
    fs_doc_enfant:nomComplet(c.enfant)})
};
function prefillSet(id,val){
  const el=document.getElementById('ff_'+id);
  if(!el||val==null||val==='')return;
  if(el.value&&el.dataset.auto!=='1')return;          // saisie manuelle conservee
  if(el.tagName==='SELECT'){
    /* Les listes de creches portent le nom court (« Brunet »), la base le nom
       complet : on retient l'option qui correspond a l'un ou a l'autre. */
    const v=String(val),court=shortCrecheName(v);
    const opt=[...el.options].find(o=>o.value===v)||[...el.options].find(o=>o.value===court);
    if(!opt)return;
    el.value=opt.value;
  }else el.value=val;
  el.dataset.auto='1';
  if(!el._autoHook){
    el._autoHook=1;
    ['input','change'].forEach(ev=>el.addEventListener(ev,()=>{delete el.dataset.auto;}));
  }
}
function prefillEnfant(){
  const k=fillDoc&&fillDoc.template_key,fn=k&&PREFILL_ENFANT[k];
  if(!fn)return;
  const c=prefillContexte();
  const vals=fn(c);
  Object.keys(vals).forEach(id=>prefillSet(id,vals[id]));
  /* Les parents arrivent apres : on rejoue le prerempli, sauf si l'enfant
     choisi ou le document ouvert ont change entre-temps. */
  if(c.enfant&&!PARENTS_CACHE[c.enfant.id]){
    const eid=c.enfant.id,doc=fillDoc;
    chargerParents(eid).then(()=>{
      const cur=((document.getElementById('fillEnfant')||{}).value)||'';
      if(cur===eid&&fillDoc===doc)prefillEnfant();
    });
  }
}

/* ---------- ORDONNANCE JOINTE (autorisation de medicament ponctuelle) ----------
   Piece medicale : bucket PRIVE « carnets » (PDF / images, 8 Mo, referents),
   lue ensuite par URL signee de courte duree, jamais par lien public. Le
   formulaire ne garde que le chemin et le nom d'origine (champs caches). */
const MP_ORD_BUCKET='carnets',MP_ORD_MAX=8*1024*1024,MP_ORD_TYPES=['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'];
function mpOrdRender(){
  const box=document.getElementById('mpOrdEtat');if(!box)return;
  const path=(document.getElementById('ff_mp_ord_path')||{}).value||'';
  const nom=(document.getElementById('ff_mp_ord_nom')||{}).value||'';
  box.innerHTML=path
    ?'<i class="ti ti-paperclip"></i> <b>'+esc(nom||'Ordonnance')+'</b> '
      +'<button type="button" class="btn btn-s" onclick="mpOrdVoir()">Voir</button> '
      +'<button type="button" class="btn btn-g" onclick="mpOrdRetirer()">Retirer</button>'
    :'<span style="color:var(--muted)">Aucune ordonnance jointe.</span>';
}
async function mpOrdChoisir(input){
  const f=input.files&&input.files[0];input.value='';
  if(!f)return;
  if(MP_ORD_TYPES.indexOf(f.type)<0)return toast('Format non accepté : PDF ou image (JPG, PNG, WEBP, HEIC).');
  if(f.size>MP_ORD_MAX)return toast('Fichier trop volumineux (8 Mo maximum).');
  const eid=((document.getElementById('fillEnfant')||{}).value)||'sans-enfant';
  const path='ordonnances/'+eid+'/'+Date.now()+'_'+slug(f.name);
  const{error}=await sb.storage.from(MP_ORD_BUCKET).upload(path,f,{contentType:f.type});
  if(error){console.warn('mpOrdChoisir',error);return toast('Import impossible : '+(error.message||'erreur'));}
  mpOrdLiberer();
  document.getElementById('ff_mp_ord_path').value=path;
  document.getElementById('ff_mp_ord_nom').value=f.name;
  mpOrdRender();
  toast('Ordonnance importée. Pensez à enregistrer le document.');
}
/* Retire du stockage un fichier remplace/retire, sauf s'il est deja reference par la reponse enregistree. */
function mpOrdLiberer(){
  const cur=(document.getElementById('ff_mp_ord_path')||{}).value||'';
  const saved=(fillRep&&fillRep.donnees&&fillRep.donnees.mp_ord_path)||'';
  if(cur&&cur!==saved)sb.storage.from(MP_ORD_BUCKET).remove([cur]).catch(()=>{});
}
async function mpOrdVoir(){
  const path=(document.getElementById('ff_mp_ord_path')||{}).value||'';
  if(!path)return;
  const w=window.open('','_blank');
  const{data,error}=await sb.storage.from(MP_ORD_BUCKET).createSignedUrl(path,300);
  if(error||!data){if(w)w.close();return toast('Ordonnance introuvable ou accès refusé.');}
  if(w)w.location=data.signedUrl;else location.href=data.signedUrl;
}
function mpOrdRetirer(){
  if(!confirm('Retirer l’ordonnance jointe ?'))return;
  mpOrdLiberer();
  document.getElementById('ff_mp_ord_path').value='';
  document.getElementById('ff_mp_ord_nom').value='';
  mpOrdRender();
}

const TPL={
 eaje:{
  get fields(){return eajeFields();},
  html:v=>`<div class="tpl eaje">${EAJE_CSS}
   <div class="eaje-head">
    ${EAJE_META.map(f=>eajeMetaHtml(f,v)).join('')}
    <div class="eaje-prog">
      <div class="eaje-track"><i id="eaje-bar"></i></div>
      <span class="eaje-pct" id="eaje-pct">0 %</span>
    </div>
   </div>
   <p class="eaje-leg"><span class="eaje-star">(*)</span> = item à caractère réglementaire. Sauvegarde automatique pendant la saisie.</p>
   ${CTRL_SCHEMA.map((sec,si)=>`
   <div class="eaje-sec">
    <div class="eaje-sh" id="eaje-h${si}" onclick="eajeToggle(${si})">
     <i class="ti ti-${esc(sec.icon||'clipboard-check')}"></i>
     <span class="t">${esc(sec.titre||'')}</span>
     <b id="eaje-c${si}">0/0</b>
     <i class="ti ti-chevron-down eaje-chev"></i>
    </div>
    <div class="eaje-sb" id="eaje-b${si}" style="display:none">
     ${(sec.items||[]).map(it=>eajeItemHtml(it,v)).join('')}
    </div>
   </div>`).join('')}
  </div>`,
  mount:()=>{eajeToggle(0);eajeRefresh();},
  /* Rendu calque sur le formulaire officiel du Departement du Var :
     Times New Roman, fleches, cases a cocher vectorielles, lignes pointillees,
     (*) en rouge. Les polices standard PDF n'ont ni ☐ ni ➔ : ils sont dessines. */
  pdf:(doc,mode)=>{
    const g=id=>eajeGet(id);
    const M=14, R=196, BOT=272;
    let y=0, page=0;

    const foot=()=>{
      doc.setFont('times','normal');doc.setFontSize(9);doc.setTextColor(120);
      doc.text(String(page),R,286,{align:'right'});doc.setTextColor(30);
    };
    const nextPage=first=>{
      if(!first){foot();doc.addPage();}
      page++;
      y=first?pdfLogo(doc,20):24;   /* marge haute classique sur les pages interieures */
      if(first)pdfLogoVar(doc,11);
      doc.setFont('times','normal');doc.setFontSize(10);doc.setTextColor(30);
    };
    const need=h=>{if(y+h>BOT)nextPage(false);};

    /* petite fleche pleine, a la place du caractere ➔ */
    const arrow=(x,yy)=>{
      doc.setFillColor(30);
      doc.triangle(x,yy-2.2,x,yy-0.2,x+2.2,yy-1.2,'F');
      doc.rect(x-1.6,yy-1.5,1.8,0.6,'F');
    };
    /* case a cocher : carre vide, croix si repondu */
    const box=(x,yy,checked,lab)=>{
      doc.setDrawColor(60);doc.setLineWidth(0.25);
      doc.rect(x,yy-2.7,3,3);
      if(checked){
        doc.setLineWidth(0.45);
        doc.line(x+0.6,yy-2.1,x+2.4,yy-0.3);
        doc.line(x+2.4,yy-2.1,x+0.6,yy-0.3);
        doc.setLineWidth(0.25);
      }
      doc.setFont('times','normal');doc.setFontSize(10);
      doc.text(lab,x+4,yy);
      return x+4+doc.getTextWidth(lab)+3.5;
    };
    const YN_W=27;
    const yesNo=(x,yy,v)=>{box(box(x,yy,v==='oui','Oui'),yy,v==='non','Non');};
    /* ligne pointillee, valeur posee dessus */
    const dotted=(x,yy,w,val)=>{
      if(val){
        doc.setFont('times','normal');doc.setFontSize(10);
        doc.text(pdfSafe(String(val)),x+1,yy-0.7,{maxWidth:w-2});
      }
      doc.setDrawColor(110);doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.4,0.8],0);
      doc.line(x,yy+0.7,x+w,yy+0.7);
      doc.setLineDashPattern([],0);
    };
    const aideOf=it=>{
      if(!it.aide)return;
      doc.setFont('times','italic');doc.setFontSize(8.2);doc.setTextColor(105);
      const ls=doc.splitTextToSize(pdfSafe(it.aide),R-M-10);
      ls.forEach(l=>{need(4);doc.text(l,M+10,y);y+=3.4;});
      doc.setTextColor(30);doc.setFont('times','normal');doc.setFontSize(10);
      y+=0.8;
    };

    /* ---------- page 1 : bandeau et titre ---------- */
    nextPage(true);
    y+=2;
    doc.setDrawColor(30);doc.setLineWidth(0.6);
    doc.rect(M,y,R-M,12);
    doc.setFont('times','bold');doc.setFontSize(15);
    doc.text('Compte rendu de visite de contr\u00f4le EAJE',(M+R)/2,y+8.2,{align:'center'});
    doc.setLineWidth(0.25);
    y+=19;
    doc.setFont('times','bold');doc.setFontSize(11);
    doc.text('\u00c9tablissement :',M,y);
    dotted(M+30,y,64,g('ctrl_creche'));
    doc.text('Date de la visite :',M+102,y);
    const dv=g('ctrl_date');
    dotted(M+137,y,45,dv?new Date(dv).toLocaleDateString('fr-FR'):'');
    y+=7;
    const st=eajeStats();
    doc.setFont('times','italic');doc.setFontSize(9);doc.setTextColor(110);
    doc.text('Micro-cr\u00e8che \u2014 section unique. Fiche renseign\u00e9e \u00e0 '+st.pct+' % ('+st.filled+'/'+st.total+' items).',M,y);
    doc.setTextColor(30);y+=6;
    doc.setFont('times','bold');doc.setFontSize(10);doc.setTextColor(200,0,0);
    doc.text('(*) = caract\u00e8re r\u00e9glementaire',M,y);
    doc.setTextColor(30);y+=8;

    /* ---------- sections ---------- */
    /* titre de section souligne ; certaines sections portent leur propre chapeau */
    const secTitle=txt=>{
      need(16);
      doc.setFont('times','bold');doc.setFontSize(12);
      const t=pdfSafe(txt)+' :';
      doc.text(t,M,y);
      doc.setLineWidth(0.4);doc.setDrawColor(30);
      doc.line(M,y+1.2,M+doc.getTextWidth(t),y+1.2);
      doc.setLineWidth(0.25);
      y+=7;
      doc.setFont('times','normal');doc.setFontSize(10);
    };
    CTRL_SCHEMA.forEach(sec=>{
      if(!sec.notitre)secTitle(String(sec.titre||''));

      (sec.items||[]).forEach(it=>{
        /* sous-titre interne */
        if(it.t==='sep'){
          need(9);y+=2;
          doc.setFont('times','bolditalic');doc.setFontSize(10.5);
          doc.text(pdfSafe(it.l),M+2,y);
          doc.setFont('times','normal');doc.setFontSize(10);
          y+=5.5;return;
        }
        if(it.saut)nextPage(false);                    /* item demarrant une nouvelle page */
        if(it.chapeau)secTitle(it.chapeau);
        const sub=it.l.indexOf('\u2026 ')===0;          /* sous-question du formulaire */
        const bloc=!!sec.bloc;                          /* bloc de redaction : pas de fleche */
        const x=M+(sub?8:0);
        const v=g(it.id);

        /* On mesure d'abord, on saute la page si besoin, puis seulement on trace :
           sinon une fleche ou un (*) resterait orphelin en bas de page. */
        let cx=x+4;
        if(it.reg){
          doc.setFont('times','bold');cx+=doc.getTextWidth('(*)')+1.6;
          doc.setFont('times','normal');
        }
        const lab=pdfSafe(sub?it.l.slice(2):it.l);
        const head=()=>{
          if(!sub&&!bloc)arrow(x+1.2,y);
          if(it.reg){
            doc.setFont('times','bold');doc.setTextColor(200,0,0);
            doc.text('(*)',x+4,y);
            doc.setTextColor(30);doc.setFont('times','normal');
          }
        };

        if(it.t==='oui_non'){
          const wrap=doc.splitTextToSize(lab,R-cx);
          const lastW=doc.getTextWidth(wrap[wrap.length-1]);
          const inline=(cx+lastW+2+YN_W)<=R;
          need(wrap.length*4.4+(inline?0:5)+2);
          head();
          wrap.forEach((l,k)=>{doc.text(l,cx,y);if(k<wrap.length-1)y+=4.4;});
          if(inline)yesNo(cx+lastW+3,y,v);
          else{y+=5;yesNo(cx,y,v);}
          y+=5.4;
        }else if(it.t==='textarea'){
          if(bloc){doc.setFont('times','bold');doc.setFontSize(11);}
          const wrap=doc.splitTextToSize(lab+(bloc?' :':''),R-cx);
          need(wrap.length*4.6+(bloc?10:16));
          head();
          wrap.forEach((l,k)=>{doc.text(l,cx,y);if(k<wrap.length-1)y+=4.6;});
          doc.setFont('times','normal');doc.setFontSize(10);
          y+=bloc?7:5;
          const val=doc.splitTextToSize(pdfSafe(String(v||'')),R-M-4);
          if(it.libre){
            /* page laissee libre pour une redaction manuscrite, comme l'original */
            val.forEach(l=>{if(y<BOT){doc.text(l,M+3,y);y+=5;}});
            y=BOT+1;
          }else{
            const nl=Math.max(it.lignes||3,val.length);
            for(let k=0;k<nl;k++){
              need(6);
              if(val[k]){doc.text(val[k],M+3,y-0.7);}
              doc.setDrawColor(110);doc.setLineDashPattern([0.4,0.8],0);
              doc.line(M+2,y+0.7,R,y+0.7);doc.setLineDashPattern([],0);
              y+=5.2;
            }
          }
          y+=1.5;
        }else{
          const wrap=doc.splitTextToSize(lab+' :',R-cx-46);
          need(wrap.length*4.4+3);
          head();
          wrap.forEach((l,k)=>{doc.text(l,cx,y);if(k<wrap.length-1)y+=4.4;});
          const dx=cx+doc.getTextWidth(wrap[wrap.length-1])+2;
          const val=(it.t==='date'&&v)?new Date(v).toLocaleDateString('fr-FR'):v;
          dotted(dx,y,Math.max(24,R-dx),val);
          y+=5.6;
        }
        aideOf(it);
      });
      y+=3;
    });
    foot();
    pdfSortie(doc,'controle_eaje_'+slug(g('ctrl_creche')||'creche')+'_'+slug(g('ctrl_date')||'')+'.pdf');
    return true;
  }
 },
 grille:{
  get fields(){return grKeys();},
  html:v=>{
   const sc=grSchema();
   return `<div class="tpl gr">${GR_CSS}
   <h3>Identification</h3>
   ${sc.identite.map(f=>grIdentField(f,v)).join('')}
   ${sc.legende?`<div class="gr-leg">${esc(sc.legende)}</div>`:''}
   ${sc.sections.length?sc.sections.map((sec,si)=>{
     const nc=sc.colonnes.length,ne=sc.echelle.length;
     const span=nc*ne+(sc.accompagnement?1:0);
     const labPct=Math.max(34,64-span*4);
     const cw=((100-labPct)/span).toFixed(2);
     return `
     <div class="gr-sec">${esc(sec.titre||'')}</div>
     <div class="gr-wrap">
     <table class="gr-t">
      <colgroup><col style="width:${labPct}%">${
        Array.from({length:span}).map(()=>`<col style="width:${cw}%">`).join('')}</colgroup>
      <thead>
       <tr>
        <th class="gr-h1" rowspan="2">Items</th>
        ${sc.colonnes.map(c=>`<th colspan="${ne}">${esc(c.label||c.key)}</th>`).join('')}
        ${sc.accompagnement?'<th rowspan="2">Besoin d\'accomp.</th>':''}
       </tr>
       <tr class="gr-r2">
        ${sc.colonnes.map((c,ci)=>sc.echelle.map((o,oi)=>
          `<th${(ci>0&&oi===0)?' class="gr-grpsep"':''}>${esc(o)}</th>`).join('')).join('')}
       </tr>
      </thead>
      <tbody>
       ${(sec.items||[]).map((it,ii)=>{
         const acc='g'+si+'_'+ii+'_acc';
         return `<tr>
          <td class="gr-lab">${esc(it)}</td>
          ${sc.colonnes.map((c,ci)=>{
            const k='g'+si+'_'+ii+'_'+c.key;
            return sc.echelle.map((o,oi)=>
              `<td class="gr-c${(ci>0&&oi===0)?' gr-grpsep':''}"><label title="${esc(o)}"><input type="radio" name="ff_${k}" value="${esc(o)}"${v[k]===o?' checked':''}></label></td>`
            ).join('');
          }).join('')}
          ${sc.accompagnement?`<td class="gr-c"><label><input type="checkbox" id="ff_${acc}"${v[acc]?' checked':''}></label></td>`:''}
         </tr>`;
       }).join('')}
      </tbody>
     </table>
     ${(sec.items||[]).map((it,ii)=>{
       const acc='g'+si+'_'+ii+'_acc';
       return `<div class="gr-card">
        <div class="gr-cl">${esc(it)}</div>
        ${sc.colonnes.map(c=>{
          const k='g'+si+'_'+ii+'_'+c.key;
          return `<div class="gr-cg"><b>${esc(c.label||c.key)}</b>${sc.echelle.map(o=>grRadio(k+'_m',o,v[k])).join('')}</div>`;
        }).join('')}
        ${sc.accompagnement?`<label class="gr-acc"><input type="checkbox" id="ff_${acc}_m"${v[acc]?' checked':''}>Besoin d'accompagnement</label>`:''}
       </div>`;
     }).join('')}
     </div>`;}).join('')
   :'<div class="gr-empty">Aucune section définie pour cette grille.</div>'}
   ${sc.synthese!==''?`<h3>Synthèse</h3>
   <div class="f"><label>${esc(sc.synthese)}</label><textarea id="ff_gr_synthese" rows="5">${esc(v.gr_synthese)}</textarea></div>`:''}
   <div class="f"><label>Date</label><input type="date" id="ff_gr_date" value="${esc(v.gr_date)}"></div>
   ${sc.signatures.length?`<h3>Signatures</h3><div class="grid2">
     ${sc.signatures.map(x=>sigBoxHtml(x.role,x.label||x.role)).join('')}
   </div>`:''}
  </div>`;},
  mount:()=>{grSchema().signatures.forEach(x=>mountSig(x.role));},
  pdf:(doc,mode)=>{
    const sc=grSchema();
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const rad=n=>grPick(n);
    const chk=id=>{const a=document.getElementById('ff_'+id),b=document.getElementById('ff_'+id+'_m');
      const e=grVisible(a)?a:(grVisible(b)?b:(a||b));return !!(e&&e.checked);};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'—';
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    doc.setFontSize(15);doc.setFont(undefined,'bold');
    doc.text(String(fillDoc.titre||'').toUpperCase(),14,y,{maxWidth:W});y+=9;
    doc.setFontSize(9.5);doc.setFont(undefined,'normal');
    sc.identite.forEach(f=>{
      const val=(f.type==='date')?dfr(g('id_'+f.key)):(g('id_'+f.key)||'—');
      need(6);doc.text(f.label+' : '+val,14,y);y+=5;
    });
    y+=2;
    if(sc.legende){
      doc.setFontSize(8);doc.setTextColor(120);
      doc.splitTextToSize(sc.legende+(sc.accompagnement?"   ·   X = besoin d'accompagnement":''),W)
        .forEach(l=>{need(5);doc.text(l,14,y);y+=4;});
      doc.setTextColor(30);y+=3;
    }
    /* colonnes de notation calees a droite */
    const nCol=sc.colonnes.length+(sc.accompagnement?1:0);
    const colX=[];for(let i=0;i<nCol;i++)colX.push(196-(nCol-i)*16);
    const labW=colX[0]-16;
    sc.sections.forEach((sec,si)=>{
      need(18);
      doc.setFillColor(74,63,159);doc.rect(14,y-5,W,8,'F');
      doc.setTextColor(255);doc.setFontSize(9.5);doc.setFont(undefined,'bold');
      doc.text(String(sec.titre||'').toUpperCase(),16,y,{maxWidth:W-4});doc.setTextColor(30);y+=9;
      doc.setFontSize(8);doc.setFont(undefined,'bold');
      sc.colonnes.forEach((c,i)=>doc.text(c.court||c.key,colX[i],y));
      if(sc.accompagnement)doc.text('Acc.',colX[nCol-1],y);
      y+=4;doc.setFont(undefined,'normal');
      (sec.items||[]).forEach((it,ii)=>{
        const lines=doc.splitTextToSize(it,labW);
        need(lines.length*4+4);
        doc.setFontSize(8);doc.text(lines,14,y);
        sc.colonnes.forEach((c,i)=>doc.text(rad('g'+si+'_'+ii+'_'+c.key)||'—',colX[i],y));
        if(sc.accompagnement)doc.text(chk('g'+si+'_'+ii+'_acc')?'X':'',colX[nCol-1],y);
        y+=Math.max(lines.length*4,5)+1.5;
        doc.setDrawColor(232,229,240);doc.line(14,y-1,14+W,y-1);
      });
      y+=4;
    });
    if(sc.synthese!==''){
      need(20);
      doc.setFillColor(74,63,159);doc.rect(14,y-5,W,8,'F');
      doc.setTextColor(255);doc.setFontSize(9.5);doc.setFont(undefined,'bold');
      doc.text('SYNTHÈSE',16,y);doc.setTextColor(30);y+=10;
      doc.setFontSize(9);doc.setFont(undefined,'normal');
      const sl=doc.splitTextToSize(g('gr_synthese')||'—',W);
      need(sl.length*5+6);doc.text(sl,14,y);y+=sl.length*5+6;
    }
    doc.setFontSize(9);doc.text('Date : '+dfr(g('gr_date')),14,y);y+=6;
    if(sc.signatures.length){
      need(46);
      sc.signatures.slice(0,2).forEach((x,i)=>{
        const px=14+i*96;
        doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(x.label||x.role,px,y);
        doc.setDrawColor(200);doc.rect(px,y+3,84,32);
        if(SIGS[x.role]){try{doc.addImage(SIGS[x.role],'PNG',px+2,y+5,80,28);}catch(e){}}
      });
      y+=40;
    }
    const who=sc.identite.length?g('id_'+sc.identite[0].key):'';
    pdfSortie(doc,slug(fillDoc.titre)+(who?'_'+slug(who):'')+'.pdf');
    return true;
  }
 },
 entretien_annuel:{
  fields:['rh_nom','rh_fonction','rh_date','sal_nom','sal_creche','fonction','fonction_autre',
          'b_positif','b_negatif','b_attentes','a_projets','a_objectifs','synthese','sig_date'],
  html:v=>`<div class="tpl">
   <h3>Personne en charge de l'entretien</h3>
   <div class="grid2">
     <div class="f"><label>Nom</label><input id="ff_rh_nom" value="${esc(v.rh_nom)}"></div>
     <div class="f"><label>Date de l'entretien</label><input type="date" id="ff_rh_date" value="${esc(v.rh_date)}"></div>
   </div>
   <div class="f"><label>Fonction</label><input id="ff_rh_fonction" value="${esc(v.rh_fonction)}"></div>

   <h3>Salarié(e)</h3>
   <div class="grid2">
     <div class="f"><label>Nom / Prénom</label><input id="ff_sal_nom" value="${esc(v.sal_nom)}"></div>
     <div class="f"><label>Crèche</label><select id="ff_sal_creche">${
       ['',...CRECHE_NOMS_COURTS]
       .map(c=>`<option${v.sal_creche===c?' selected':''}>${esc(c)}</option>`).join('')}</select></div>
   </div>
   <div class="f"><label>Fonction</label><div class="radios">${
     ['Auxiliaire de puériculture','Educatrice de jeunes enfants','Accompagnante éducative petite enfance','Directeur/trice technique','Autre']
     .map(o=>`<label><input type="radio" name="ff_fonction" value="${esc(o)}"${v.fonction===o?' checked':''}> ${esc(o)}</label>`).join('')}</div>
     <input id="ff_fonction_autre" placeholder="Si autre, préciser…" style="margin-top:8px" value="${esc(v.fonction_autre)}"></div>

   <h3>Bilan de l'année</h3>
   <div class="f"><label>Aspects positifs : réussites, missions privilégiées</label><textarea id="ff_b_positif">${esc(v.b_positif)}</textarea></div>
   <div class="f"><label>Aspects négatifs : difficultés, manques</label><textarea id="ff_b_negatif">${esc(v.b_negatif)}</textarea></div>
   <div class="f"><label>Le poste a-t-il répondu à vos attentes ?</label><textarea id="ff_b_attentes">${esc(v.b_attentes)}</textarea></div>

   <h3>Année en cours</h3>
   <div class="f"><label>Projets professionnels</label><textarea id="ff_a_projets">${esc(v.a_projets)}</textarea></div>
   <div class="f"><label>Objectifs et attentes</label><textarea id="ff_a_objectifs">${esc(v.a_objectifs)}</textarea></div>

   <h3>Synthèse et objectifs de l'année</h3>
   <p class="hint">Décisions, objectifs, orientations pour l'année.</p>
   <div class="f"><textarea id="ff_synthese" style="min-height:130px">${esc(v.synthese)}</textarea></div>

   <h3>Signatures</h3>
   <div class="f"><label>Date</label><input type="date" id="ff_sig_date" value="${esc(v.sig_date)}"></div>
   <div class="grid2">
     ${sigBoxHtml('responsable',"Personne en charge de l'entretien")}
     ${sigBoxHtml('salarie','Salarié(e)')}
   </div>
  </div>`
 },
 contrat_travail:{
  fields:['raison_sociale','forme_juridique','capital','rcs_ville','siret','adresse_siege','representant_nom','representant_qualite',
          'site_nom','site_adresse',
          'salarie_employe_id','salarie_nom','salarie_naissance_date','salarie_naissance_lieu','salarie_nationalite','salarie_adresse','salarie_ss',
          'poste_intitule','statut','qualification',
          'nature_contrat',
          'type_contrat','cdd_debut','cdd_fin','cdd_terme_imprecis','cdd_evenement_terme','cdd_motif','cdd_remplace','date_embauche',
          'diplome_vise','organisme_formation','duree_formation_heures','date_debut_formation','date_fin_formation',
          'tuteur_nom','tuteur_qualite','opco',
          'temps_travail','heures_hebdo','repartition_horaires',
          'remuneration_brute','heures_mensuelles','date_versement','primes',
          'fermeture_dates','preavis_demission',
          'ville_signature','date_signature'],
  html:v=>`<div class="tpl">
   <h3>L'employeur <span class="hint" style="font-weight:400">(pré-rempli depuis Paramètres selon la crèche choisie)</span></h3>
   <div class="f"><label>Crèche concernée</label><select id="ff_site_nom" onchange="ctPrefillFromEtab()"><option value=""></option>${
     (typeof CRECHES!=='undefined'?CRECHES:[]).map(c=>`<option${v.site_nom===c.name?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
   <div class="grid2">
     <div class="f"><label>Raison sociale</label><input id="ff_raison_sociale" value="${esc(v.raison_sociale)}"></div>
     <div class="f"><label>Forme juridique</label><input id="ff_forme_juridique" value="${esc(v.forme_juridique)}"></div>
   </div>
   <div class="grid2">
     <div class="f"><label>Capital social (€)</label><input id="ff_capital" value="${esc(v.capital)}"></div>
     <div class="f"><label>RCS — ville</label><input id="ff_rcs_ville" value="${esc(v.rcs_ville)}"></div>
   </div>
   <div class="f"><label>SIRET</label><input id="ff_siret" value="${esc(v.siret)}"></div>
   <div class="f"><label>Adresse du siège social</label><input id="ff_adresse_siege" value="${esc(v.adresse_siege)}"></div>
   <div class="grid2">
     <div class="f"><label>Représentant légal</label><input id="ff_representant_nom" value="${esc(v.representant_nom)}"></div>
     <div class="f"><label>Qualité</label><input id="ff_representant_qualite" value="${esc(v.representant_qualite)}" placeholder="Président, gérante…"></div>
   </div>
   <div class="f"><label>Adresse du site d'affectation</label><input id="ff_site_adresse" value="${esc(v.site_adresse)}"></div>

   <h3>Le/la salarié(e)</h3>
   <div class="f"><label>Fiche collaborateur/trice <span class="hint" style="font-weight:400">(pré-remplit ce qui est connu et sert d'adresse pour le code de vérification)</span></label>
     <select id="ff_salarie_employe_id" onchange="ctFillFromEmploye()"><option value="">Chargement…</option></select>
   </div>
   <div class="grid2">
     <div class="f"><label>Nom / Prénom</label><input id="ff_salarie_nom" value="${esc(v.salarie_nom)}" oninput="ctUpdateConsent()"></div>
     <div class="f"><label>Nationalité</label><input id="ff_salarie_nationalite" value="${esc(v.salarie_nationalite)}"></div>
   </div>
   <div class="grid2">
     <div class="f"><label>Né(e) le</label><input type="date" id="ff_salarie_naissance_date" value="${esc(v.salarie_naissance_date)}"></div>
     <div class="f"><label>Lieu de naissance</label><input id="ff_salarie_naissance_lieu" value="${esc(v.salarie_naissance_lieu)}"></div>
   </div>
   <div class="f"><label>Adresse</label><input id="ff_salarie_adresse" value="${esc(v.salarie_adresse)}"></div>
   <div class="f"><label>N° de sécurité sociale</label><input id="ff_salarie_ss" value="${esc(v.salarie_ss)}"></div>

   <h3>Poste et qualification</h3>
   <div class="grid2">
     <div class="f"><label>Intitulé du poste</label><input id="ff_poste_intitule" value="${esc(v.poste_intitule)}" placeholder="EJE, auxiliaire de puériculture, animateur/trice petite enfance…"></div>
     <div class="f"><label>Statut</label><select id="ff_statut">${
       ['','Employé','Agent de maîtrise','Cadre'].map(o=>`<option${v.statut===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
   </div>
   <div class="f"><label>Qualification déclarée</label><input id="ff_qualification" value="${esc(v.qualification)}"></div>
   <p class="hint">Le coefficient de la convention collective (IDCC 3127) n'est volontairement pas calculé automatiquement — sa grille vise nativement les interventions à domicile, pas un établissement collectif.</p>

   <h3>Nature du contrat</h3>
   <div class="f"><label>Nature</label><select id="ff_nature_contrat" onchange="ctToggleNature()">${
     [['standard','Contrat de travail classique'],['apprentissage',"Contrat d'apprentissage"],
      ['professionnalisation','Contrat de professionnalisation']]
       .map(([val,lab])=>`<option value="${val}"${(v.nature_contrat||'standard')===val?' selected':''}>${esc(lab)}</option>`).join('')}</select></div>
   <p class="hint" id="ctNatureHint"></p>

   <h3>Type de contrat</h3>
   <div class="grid2">
     <div class="f"><label>CDI / CDD</label><select id="ff_type_contrat" onchange="ctToggleCdd()">${
       ['','CDI','CDD'].map(o=>`<option${v.type_contrat===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Date d'embauche (prise d'effet)</label><input type="date" id="ff_date_embauche" value="${esc(v.date_embauche)}"></div>
   </div>
   <div id="ctCddWrap" class="grid2" style="${v.type_contrat==='CDD'?'':'display:none'}">
     <div class="f"><label>Début du CDD</label><input type="date" id="ff_cdd_debut" value="${esc(v.cdd_debut)}"></div>
     <div class="f">
       <label>Fin du CDD</label>
       <input type="date" id="ff_cdd_fin" value="${esc(v.cdd_fin)}" style="${v.cdd_terme_imprecis?'display:none':''}">
       <input id="ff_cdd_evenement_terme" placeholder="ex. retour de Mme X, congé maternité, de son congé"
         value="${esc(v.cdd_evenement_terme)}" style="${v.cdd_terme_imprecis?'':'display:none'}">
       <label style="font-weight:400;display:flex;align-items:center;gap:6px;margin-top:4px">
         <input type="checkbox" id="ff_cdd_terme_imprecis" style="width:auto" ${v.cdd_terme_imprecis?'checked':''} onchange="ctToggleCddTerme()">
         Terme imprécis (date de fin non connue à l'avance — durée minimale requise)
       </label>
     </div>
   </div>
   <div id="ctCddWrap2" style="${v.type_contrat==='CDD'?'':'display:none'}">
     <div class="f"><label>Motif du CDD</label><select id="ff_cdd_motif_select" onchange="ctCddMotifChange()">${
       ['','Remplacement d\'un(e) salarié(e) en congé de maternité','Remplacement d\'un(e) salarié(e) en congé de paternité et d\'accueil de l\'enfant',
        'Remplacement d\'un(e) salarié(e) en congé parental d\'éducation','Remplacement d\'un(e) salarié(e) en arrêt maladie',
        'Remplacement d\'un(e) salarié(e) absent(e) (autre motif)','Accroissement temporaire d\'activité','Autre motif (à préciser)']
        .map(o=>`<option${v.cdd_motif===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f" id="ctCddMotifAutreWrap" style="${v.cdd_motif&&!['','Remplacement d\'un(e) salarié(e) en congé de maternité','Remplacement d\'un(e) salarié(e) en congé de paternité et d\'accueil de l\'enfant','Remplacement d\'un(e) salarié(e) en congé parental d\'éducation','Remplacement d\'un(e) salarié(e) en arrêt maladie','Remplacement d\'un(e) salarié(e) absent(e) (autre motif)','Accroissement temporaire d\'activité'].includes(v.cdd_motif)?'':'display:none'}">
       <label>Motif détaillé</label><input id="ff_cdd_motif" value="${esc(v.cdd_motif)}"></div>
     <div class="f"><label>Salarié(e) remplacé(e) (le cas échéant)</label><input id="ff_cdd_remplace" value="${esc(v.cdd_remplace)}"></div>
   </div>

   <div id="ctNatureFormationWrap" style="${(v.nature_contrat||'standard')==='standard'?'display:none':''}">
     <h3 id="ctNatureFormationTitre">Formation</h3>
     <p class="hint">
       ⚠️ La rémunération d'un(e) apprenti(e) ou d'un(e) salarié(e) en contrat de professionnalisation est fixée en
       pourcentage du SMIC (ou du minimum conventionnel CCN SAP, IDCC 3127) selon l'âge et l'année du contrat ou le
       niveau de qualification — ce pourcentage n'est pas calculé automatiquement ici : à vérifier auprès de l'OPCO
       ou d'un professionnel avant de fixer le montant en « Rémunération » ci-dessous.
     </p>
     <div class="grid2">
       <div class="f"><label id="ctLabelDiplome">Diplôme ou titre visé</label><input id="ff_diplome_vise" value="${esc(v.diplome_vise)}" placeholder="CAP AEPE, titre pro AEPE, titre IEPE…"></div>
       <div class="f"><label id="ctLabelOrganisme">Organisme de formation</label><input id="ff_organisme_formation" value="${esc(v.organisme_formation)}" placeholder="CFA, organisme de formation…"></div>
     </div>
     <div class="grid2">
       <div class="f"><label>Début de la formation</label><input type="date" id="ff_date_debut_formation" value="${esc(v.date_debut_formation)}"></div>
       <div class="f"><label>Fin de la formation</label><input type="date" id="ff_date_fin_formation" value="${esc(v.date_fin_formation)}"></div>
     </div>
     <div class="f"><label>Durée de la formation (heures)</label><input id="ff_duree_formation_heures" value="${esc(v.duree_formation_heures)}"></div>
     <div class="grid2">
       <div class="f"><label id="ctLabelTuteur">Maître d'apprentissage / tuteur</label><input id="ff_tuteur_nom" value="${esc(v.tuteur_nom)}"></div>
       <div class="f"><label>Qualité / fonction du tuteur</label><input id="ff_tuteur_qualite" value="${esc(v.tuteur_qualite)}"></div>
     </div>
     <div class="f"><label>OPCO en charge du financement</label><input id="ff_opco" value="${esc(v.opco)}" placeholder="ex. AKTO, OPCO EP…"></div>
   </div>

   <h3>Durée et horaires de travail</h3>
   <div class="grid2">
     <div class="f"><label>Temps plein / partiel</label><select id="ff_temps_travail">${
       ['','Temps plein','Temps partiel'].map(o=>`<option${v.temps_travail===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Heures hebdomadaires</label><input id="ff_heures_hebdo" value="${esc(v.heures_hebdo)}"></div>
   </div>
   <div class="f"><label>Répartition indicative des horaires (si temps partiel)</label><textarea id="ff_repartition_horaires">${esc(v.repartition_horaires)}</textarea></div>

   <h3>Rémunération</h3>
   <div class="grid2">
     <div class="f"><label>Rémunération mensuelle brute (€)</label><input id="ff_remuneration_brute" value="${esc(v.remuneration_brute)}"></div>
     <div class="f"><label>Heures mensuelles</label><input id="ff_heures_mensuelles" value="${esc(v.heures_mensuelles)}"></div>
   </div>
   <div class="f"><label>Date de versement</label><input id="ff_date_versement" value="${esc(v.date_versement)}" placeholder="ex. le 5 de chaque mois"></div>
   <div class="f"><label>Primes et accessoires éventuels</label><textarea id="ff_primes">${esc(v.primes)}</textarea></div>

   <h3>Congés et rupture</h3>
   <div class="f"><label>Dates de fermeture de l'établissement</label><input id="ff_fermeture_dates" value="${esc(v.fermeture_dates)}"></div>
   <div class="f"><label>Préavis de démission</label><input id="ff_preavis_demission" value="${esc(v.preavis_demission)}" placeholder="ex. 1 mois"></div>

   <h3>Signatures</h3>
   <div class="grid2">
     <div class="f"><label>Ville</label><input id="ff_ville_signature" value="${esc(v.ville_signature)}"></div>
     <div class="f"><label>Date</label><input type="date" id="ff_date_signature" value="${esc(v.date_signature)}"></div>
   </div>
   <div class="f" id="ctOtpWrap">
     <label>Vérification d'identité avant signature (code à usage unique)</label>
     <p class="hint" id="ctOtpHint">Chargement…</p>
     <div id="ctOtpActions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px"></div>
   </div>
   <p class="hint" id="ctConsent" style="font-weight:600;color:var(--ink,#2B2740)"></p>
   <div class="grid2">
     ${sigBoxHtml('responsable','Pour l’Employeur')}
     ${sigBoxHtml('salarie','Le/la Salarié(e) — « Lu et approuvé »')}
   </div>
  </div>`,
  mount:()=>{
    CT_OVERRIDE=false;CT_QR_AUDIT=null;
    const prevAudit=(fillRep&&fillRep.donnees&&fillRep.donnees._audit)||{};
    CT_OTP_VERIFIED=!!(fillRep&&fillRep.otp_verifie_le);
    CT_OTP_VERIFIED_AT=(fillRep&&fillRep.otp_verifie_le)||null;
    CT_OTP_SENT_AT=null;
    CT_PDF_HASH=(fillRep&&fillRep.signature_empreinte)||prevAudit.pdf_sha256||null;
    ctPrefillFromEtab();ctToggleCdd();ctToggleCddTerme();ctToggleNature();
    (()=>{
      const sel=document.getElementById('ff_cdd_motif_select'),hidden=document.getElementById('ff_cdd_motif');
      if(sel&&hidden&&hidden.value){
        const connu=Array.from(sel.options).some(o=>o.value===hidden.value);
        sel.value=connu?hidden.value:'Autre motif (à préciser)';
      }
    })();
    ctCddMotifChange();
    ctLoadEmployes();ctUpdateConsent();ctRenderOtp();ctApplyLock();
    ['responsable','salarie'].forEach(mountSig);
  },
  pdf:async doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'……';
    const bl=s=>s||'……';
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    // Mise en page resserrée : interligne et espacements réduits pour que le
    // contrat tienne sur moins de pages sans perdre de texte ni de lisibilité.
    const LH=4.6,PARA_GAP=2.2,H2_GAP=5.5;
    const para=(t,bold)=>{
      doc.setFont(undefined,bold?'bold':'normal');doc.setFontSize(bold?11:10);
      const lines=doc.splitTextToSize(pdfSafe(t),W);
      need(lines.length*LH+PARA_GAP);
      doc.text(lines,14,y);y+=lines.length*LH+PARA_GAP;
    };
    const h2=t=>{
      need(10);doc.setFont(undefined,'bold');doc.setFontSize(11);
      doc.text(pdfSafe(t),14,y);y+=H2_GAP;doc.setFont(undefined,'normal');doc.setFontSize(10);
    };

    doc.setFont(undefined,'bold');doc.setFontSize(15);
    doc.text('CONTRAT DE TRAVAIL',14+W/2,y,{align:'center'});y+=6;
    doc.setFontSize(10.5);doc.setFont(undefined,'normal');
    doc.text('PERSONNEL DE CRÈCHE',14+W/2,y,{align:'center'});y+=8;

    para('Entre les soussignés',true);

    h2("L'EMPLOYEUR");
    para(`${bl(g('raison_sociale'))}, ${bl(g('forme_juridique'))}, au capital de ${bl(g('capital'))} €, `+
      `immatriculée au RCS de ${bl(g('rcs_ville'))} sous le n° ${bl(g('siret'))}, dont le siège social est situé `+
      `${bl(g('adresse_siege'))}, représentée par ${bl(g('representant_nom'))}, en qualité de ${bl(g('representant_qualite'))}, `+
      `ci-après dénommée « l'Employeur », d'une part,`);

    h2('ET');
    para(`${bl(g('salarie_nom'))}, né(e) le ${dfr(g('salarie_naissance_date'))} à ${bl(g('salarie_naissance_lieu'))}, `+
      `de nationalité ${bl(g('salarie_nationalite'))}, demeurant ${bl(g('salarie_adresse'))}, `+
      `n° de sécurité sociale ${bl(g('salarie_ss'))}, ci-après dénommé(e) « le/la Salarié(e) », d'autre part,`);

    para('Il a été convenu et arrêté ce qui suit :',true);

    h2('ARTICLE 1 — OBJET, POSTE ET QUALIFICATION');
    para(`Le/la Salarié(e) est engagé(e) en qualité de ${bl(g('poste_intitule'))}, statut ${bl(g('statut'))}.`);
    // La pédagogie citée ici est propre à Koala Kids ; paramétrable via
    // reseau_config.pedagogie_texte pour qu'un autre réseau puisse décrire
    // la sienne sans toucher au code (pas encore de champ dédié dans
    // Paramètres — à ajouter si un futur réseau en a besoin).
    const pedagogie=(RESEAU&&RESEAU.pedagogie_texte)||"la pédagogie de libre exploration éducative en vigueur dans le réseau";
    para(`Missions : accueil et accompagnement des enfants et des familles dans le respect du projet pédagogique `+
      `de la micro-crèche ; mise en œuvre des activités d'éveil et de ${pedagogie} ; `+
      `participation aux transmissions, réunions d'équipe et temps de formation ; `+
      `application des protocoles de santé, d'hygiène et de sécurité en vigueur dans l'établissement.`);
    para(`Le/la Salarié(e) déclare posséder la qualification suivante : ${bl(g('qualification'))}, conforme aux `+
      `exigences réglementaires des établissements d'accueil du jeune enfant.`);

    const nature=g('nature_contrat')||'standard';
    const libNature={apprentissage:"CONTRAT D'APPRENTISSAGE",professionnalisation:'CONTRAT DE PROFESSIONNALISATION'}[nature];
    h2("ARTICLE 2 — TYPE DE CONTRAT, PRISE D'EFFET ET PÉRIODE D'ESSAI");
    if(libNature){
      para(`Le présent contrat est conclu sous la forme d'un ${libNature}, à durée : ${bl(g('type_contrat'))}, `+
        (nature==='apprentissage'
          ?"conformément aux articles L.6221-1 et suivants du Code du travail."
          :"conformément aux articles L.6325-1 et suivants du Code du travail."));
    }else{
      para(`Contrat conclu pour une durée : ${bl(g('type_contrat'))}.`);
    }
    if(g('type_contrat')==='CDD'){
      const termeImprecis=!!document.getElementById('ff_cdd_terme_imprecis')&&document.getElementById('ff_cdd_terme_imprecis').checked;
      if(termeImprecis){
        para(`À compter du ${dfr(g('cdd_debut'))}, à terme imprécis : le contrat prendra fin à l'événement `+
          `suivant : ${bl(g('cdd_evenement_terme'))}, conformément à l'article L.1242-7 du Code du travail. `+
          `Motif : ${bl(g('cdd_motif'))} (salarié(e) remplacé(e) le cas échéant : ${bl(g('cdd_remplace'))}).`);
      }else{
        para(`Du ${dfr(g('cdd_debut'))} au ${dfr(g('cdd_fin'))}, motif : ${bl(g('cdd_motif'))} `+
          `(salarié(e) remplacé(e) le cas échéant : ${bl(g('cdd_remplace'))}).`);
      }
    }
    para(`Prise d'effet le ${dfr(g('date_embauche'))}.`);
    if(nature==='apprentissage'){
      para(`Période d'essai : les deux premiers mois d'exécution du contrat, décomptés en jours travaillés effectifs `+
        `dans l'entreprise (article L.6222-18 du Code du travail). Pendant cette période, le contrat peut être rompu `+
        `unilatéralement par l'une ou l'autre des parties.`);
    }else{
      para(`Période d'essai : 2 mois pour les employés / 3 mois pour les agents de maîtrise / 4 mois pour les cadres `+
        `selon la catégorie retenue ci-dessus, renouvelable une fois pour une durée maximale de 2 mois (soit une durée `+
        `totale maximale de 4, 5 ou 6 mois selon la catégorie), sous réserve d'un accord exprès entre les parties `+
        `formalisé par écrit avant le terme de la période initiale. Pendant la période d'essai, chacune des parties `+
        `peut rompre librement le contrat, sous réserve des délais de prévenance légaux (art. L.1221-25 et `+
        `L.1221-26 du Code du travail).`);
    }

    h2('ARTICLE 3 — LIEU DE TRAVAIL');
    para(`Le/la Salarié(e) exercera ses fonctions au sein de la micro-crèche de ${bl(g('site_nom'))}, `+
      `sise ${bl(g('site_adresse'))}.`);
    para(`Compte tenu de l'organisation du réseau en plusieurs sites, le/la Salarié(e) pourra être amené(e), de `+
      `façon temporaire ou ponctuelle, à exercer ses fonctions sur l'un des autres établissements du réseau `+
      `Koala Kids, dans un rayon géographique raisonnable, notamment pour assurer la continuité d'accueil des `+
      `enfants. Cette clause de mobilité n'entraîne pas de modification du contrat de travail.`);

    h2('ARTICLE 4 — DURÉE ET HORAIRES DE TRAVAIL');
    para(`Le/la Salarié(e) est engagé(e) à ${bl(g('temps_travail'))}, pour une durée hebdomadaire de `+
      `${bl(g('heures_hebdo'))} heures, réparties selon le planning établi par la direction. Si temps partiel, `+
      `répartition indicative : ${bl(g('repartition_horaires'))}. Toute modification de cette répartition sera `+
      `notifiée dans le respect du délai de prévenance légal ou conventionnel.`);

    h2('ARTICLE 5 — RÉMUNÉRATION');
    para(`Rémunération mensuelle brute de ${bl(g('remuneration_brute'))} €, pour ${bl(g('heures_mensuelles'))} `+
      `heures mensuelles, versée le ${bl(g('date_versement'))} de chaque mois par virement bancaire.`);
    para(`Primes et accessoires éventuels : ${bl(g('primes'))}.`);
    if(nature==='apprentissage'){
      para(`⚠️ Rémunération d'apprenti(e) : exprimée en pourcentage du SMIC (ou du salaire minimum conventionnel si `+
        `plus favorable), variable selon l'âge du/de la Salarié(e) et l'année d'exécution du contrat (articles `+
        `D.6222-26 et suivants du Code du travail). Le montant ci-dessus doit être vérifié avant signature.`);
    }else if(nature==='professionnalisation'){
      para(`⚠️ Rémunération en contrat de professionnalisation : exprimée en pourcentage du SMIC (ou du salaire `+
        `minimum conventionnel si plus favorable), variable selon l'âge du/de la Salarié(e) et son niveau de `+
        `formation (articles L.6325-1-1 et D.6325-14 et suivants du Code du travail). Le montant ci-dessus doit `+
        `être vérifié avant signature.`);
    }else{
      para(`Révision conforme aux dispositions légales et conventionnelles applicables (SMIC, minima `+
        `conventionnels).`);
    }

    if(nature!=='standard'){
      h2('ARTICLE 5 BIS — ACTION DE FORMATION');
      para(`Diplôme, titre ou certification visé(e) : ${bl(g('diplome_vise'))}.`);
      para(`${nature==='apprentissage'?'CFA (centre de formation d’apprentis)':'Organisme de formation'} : `+
        `${bl(g('organisme_formation'))}, du ${dfr(g('date_debut_formation'))} au ${dfr(g('date_fin_formation'))}, `+
        `pour une durée de ${bl(g('duree_formation_heures'))} heures.`);
      para(`${nature==='apprentissage'?"Maître d'apprentissage" : 'Tuteur'} désigné(e) : ${bl(g('tuteur_nom'))}`+
        (g('tuteur_qualite')?`, ${bl(g('tuteur_qualite'))}`:'')+
        `, chargé(e) d'accompagner le/la Salarié(e) dans l'acquisition des compétences visées par la formation.`);
      para(`OPCO en charge du financement : ${bl(g('opco'))}.`);
      if(nature==='professionnalisation'){
        para(`Lorsque la formation prépare le titre IEPE (Intervenant Éducatif Petite Enfance), la voie de `+
          `reconversion instaurée par le décret n°2025-1207 est applicable dans les conditions qu'il fixe.`);
      }
    }

    h2('ARTICLE 6 — CONGÉS PAYÉS ET FERMETURES DE L’ÉTABLISSEMENT');
    para(`2,5 jours ouvrables de congés payés par mois de travail effectif, sauf disposition conventionnelle plus `+
      `favorable. Congés pris en tenant compte des périodes de fermeture annuelle : ${bl(g('fermeture_dates'))}, `+
      `et des nécessités de continuité d'accueil des enfants.`);

    h2("ARTICLE 7 — OBLIGATIONS PROPRES À L'ACCUEIL DU JEUNE ENFANT");
    para(`Le/la Salarié(e) s'engage à : fournir un extrait de casier judiciaire (bulletin n° 3) conforme à `+
      `l'article L.133-6 du CASF ; justifier d'un certificat médical d'aptitude et des vaccinations obligatoires `+
      `prévues pour les EAJE ; respecter les protocoles d'hygiène, de sécurité et de santé de l'établissement ; `+
      `se soumettre à la visite d'information et de prévention du service de santé au travail ; suivre les `+
      `formations obligatoires ou recommandées par l'Employeur ; signaler sans délai à la direction toute `+
      `situation de danger ou de suspicion de maltraitance concernant un enfant accueilli.`);

    h2('ARTICLE 8 — CONFIDENTIALITÉ ET PROTECTION DES DONNÉES');
    para(`Obligation de discrétion et de confidentialité absolue concernant les informations relatives aux `+
      `enfants accueillis et à leur famille, y compris après la cessation du contrat de travail, dans le respect `+
      `du RGPD. Obligation de confidentialité étendue à l'organisation, aux outils internes et à la gestion de `+
      `l'Employeur et du réseau Koala Kids.`);

    h2('ARTICLE 9 — RUPTURE DU CONTRAT');
    para(`Hors période d'essai, rupture dans les conditions prévues par le Code du travail et la convention `+
      `collective applicable. En cas de démission, préavis de ${bl(g('preavis_demission'))}, sauf dispense `+
      `accordée par l'Employeur. Si CDD : cessation de plein droit à son terme, indemnité de fin de contrat et `+
      `indemnité compensatrice de congés payés selon la loi, sauf cas de rupture anticipée légalement prévus.`);
    if(nature==='apprentissage'){
      para(`Au-delà de la période d'essai, le contrat d'apprentissage ne peut être rompu que par accord écrit `+
        `signé des deux parties, ou, à défaut, par décision du conseil de prud'hommes en cas de faute grave, `+
        `d'inaptitude constatée par le médecin du travail, de force majeure, d'exclusion définitive du CFA, ou de `+
        `rupture à l'initiative de l'apprenti(e) après respect de la procédure de médiation prévue à l'article `+
        `L.6222-18 du Code du travail.`);
    }

    h2('ARTICLE 10 — CONVENTION COLLECTIVE ET DISPOSITIONS DIVERSES');
    para(`Contrat régi par le Code du travail et la convention collective nationale des services à la personne `+
      `du 20 septembre 2012 (IDCC 3127), dont un exemplaire est tenu à disposition au siège de l'établissement. `+
      `Le/la Salarié(e) déclare avoir pris connaissance du règlement intérieur et du projet pédagogique et `+
      `s'engage à s'y conformer. Toute modification fera l'objet d'un avenant signé des deux parties.`);

    // Bloc de clôture (date de signature, consentement, mention de
    // vérification, cadres de signature) traité comme un tout indivisible :
    // un seul need() global évite qu'il ne se scinde entre deux pages (le
    // "Fait à…" restant seul en bas d'une page pendant que les cadres de
    // signature démarrent, orphelins, la suivante).
    doc.setFont(undefined,'bold');doc.setFontSize(11);
    const ligneFait=doc.splitTextToSize(pdfSafe(
      `Fait à ${bl(g('ville_signature'))}, le ${dfr(g('date_signature'))}, en deux exemplaires originaux.`),W);
    doc.setFont(undefined,'italic');doc.setFontSize(9);
    const lignesConsent=doc.splitTextToSize(pdfSafe(ctConsentText(g('salarie_nom'))),W);
    doc.setFontSize(8.2);
    const verifTxt=CT_OTP_VERIFIED
      ?('Identité vérifiée par code le '+new Date(CT_OTP_VERIFIED_AT).toLocaleString('fr-FR')+'.')
      :'Identité non vérifiée par code (mode dégradé) — ce document ne constitue pas une signature électronique qualifiée au sens eIDAS.';
    const lignesVerif=doc.splitTextToSize(verifTxt,W);
    const hFait=ligneFait.length*LH+PARA_GAP, hConsent=lignesConsent.length*4.2+1.5,
      hVerif=lignesVerif.length*3.8+2.5, hSig=40;
    need(hFait+hConsent+hVerif+hSig);

    doc.setFont(undefined,'bold');doc.setFontSize(11);
    doc.text(ligneFait,14,y);y+=hFait;
    doc.setFont(undefined,'italic');doc.setFontSize(9);
    doc.text(lignesConsent,14,y);y+=hConsent;
    doc.setFontSize(8.2);doc.setTextColor(120);
    doc.text(lignesVerif,14,y);y+=hVerif;
    doc.setTextColor(30);doc.setFont(undefined,'normal');doc.setFontSize(10);

    const put=(role,lab,x)=>{
      doc.setFontSize(9);doc.setFont(undefined,'bold');
      const ls=doc.splitTextToSize(lab,84);
      doc.text(ls,x,y);
      doc.setDrawColor(200);doc.rect(x,y+3+(ls.length-1)*4,84,32);
      if(SIGS[role]){try{doc.addImage(SIGS[role],'PNG',x+2,y+5+(ls.length-1)*4,80,28);}catch(e){}}
    };
    put('responsable',`Pour l'Employeur : ${bl(g('representant_nom'))}, ${bl(g('representant_qualite'))}`,14);
    put('salarie',"Le/la Salarié(e) — « Lu et approuvé »",110);
    y+=hSig;

    // Empreinte du PDF exact généré — calculée côté client (jsPDF ne tourne
    // pas côté serveur ici), conservée avec la réponse pour le dossier de
    // preuve (cf. sql/documents_reponses_signature_renforcee.sql). Une panne
    // de hachage ne doit jamais empêcher l'export du contrat.
    try{
      const bytes=doc.output('arraybuffer');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      CT_PDF_HASH=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(e){console.warn('empreinte PDF',e);}

    pdfSortie(doc,slug(fillDoc.titre)+(g('salarie_nom')?'_'+slug(g('salarie_nom')):'')+'.pdf');
    return true;
  }
 },
 antipyretique:{
  fields:['ap_civ1','ap_parent1','ap_qual1','ap_civ2','ap_parent2','ap_qual2','ap_enfant','ap_date',
          'ci_medicament','ci_date'],
  html:v=>`<div class="tpl">
   <h3>Autorisation d’administrer un antipyrétique (type Doliprane)</h3>
   <p class="hint">Autorise le personnel de la structure à administrer à l’enfant un antipyrétique selon la prescription établie par le médecin de l’enfant, puis à prévenir les parents dans les plus brefs délais.</p>
   <div class="grid2">
     <div class="f"><label>Parent 1 — civilité</label><select id="ff_ap_civ1">${
       ['','Monsieur','Madame'].map(o=>`<option${v.ap_civ1===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Parent 1 — nom</label><input id="ff_ap_parent1" value="${esc(v.ap_parent1)}"></div>
   </div>
   <div class="f"><label>Parent 1 — en qualité de</label><input id="ff_ap_qual1" value="${esc(v.ap_qual1)}"></div>
   <div class="grid2">
     <div class="f"><label>Parent 2 — civilité</label><select id="ff_ap_civ2">${
       ['','Monsieur','Madame'].map(o=>`<option${v.ap_civ2===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Parent 2 — nom</label><input id="ff_ap_parent2" value="${esc(v.ap_parent2)}"></div>
   </div>
   <div class="f"><label>Parent 2 — en qualité de</label><input id="ff_ap_qual2" value="${esc(v.ap_qual2)}"></div>
   <div class="grid2">
     <div class="f"><label>Prénom de l’enfant</label><input id="ff_ap_enfant" value="${esc(v.ap_enfant)}"></div>
     <div class="f"><label>Date</label><input type="date" id="ff_ap_date" value="${esc(v.ap_date)}"></div>
   </div>
   <div class="grid2">
     ${sigBoxHtml('parent1','Signature du parent')}
     ${sigBoxHtml('parent2','Signature du parent')}
   </div>

   <h3>Contre-indication à un antipyrétique</h3>
   <div class="f"><label>Nom du médicament (contre-indiqué)</label><input id="ff_ci_medicament" value="${esc(v.ci_medicament)}"></div>
   <div class="f"><label>Date</label><input type="date" id="ff_ci_date" value="${esc(v.ci_date)}"></div>
   <div class="grid2">
     ${sigBoxHtml('ci_parent','Signature du parent')}
   </div>
  </div>`,
  mount:()=>{['parent1','parent2','ci_parent'].forEach(mountSig);},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'—';
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    // Titre encadré
    doc.setFontSize(12);doc.setFont(undefined,'bold');
    doc.setDrawColor(120);doc.rect(14,y-5,W,10);
    doc.text("AUTORISATION D'ADMINISTRER UN ANTIPYRETIQUE (Type Doliprane)",14+W/2,y+1,{align:'center',maxWidth:W-6});
    y+=16;
    doc.setFontSize(10.5);doc.setFont(undefined,'normal');
    const soussPhrase=(civ,nom,qual)=>{
      const e=(civ||'').toLowerCase()==='madame'?'e':'';
      const civTxt=(civ||'……').toLowerCase();
      return 'Je soussigné'+e+', '+civTxt+' '+(nom||'……')+' en ma qualité de '+(qual||'……');};
    const para=[
      soussPhrase(g('ap_civ1'),g('ap_parent1'),g('ap_qual1')),
      soussPhrase(g('ap_civ2'),g('ap_parent2'),g('ap_qual2')),
      'Autorise (autorisons) le personnel de la structure à administrer à mon (notre) enfant '+(g('ap_enfant')||'……')+' un antipyrétique selon la prescription établie par le médecin de mon (notre) enfant, puis à me (nous) prévenir dans les plus brefs délais.'
    ];
    para.forEach(t=>{const L=doc.splitTextToSize(t,W);need(L.length*5+2);doc.text(L,14,y);y+=L.length*5+2;});
    y+=3;
    doc.text('Date : '+dfr(g('ap_date')),14,y);y+=12;
    // 2 signatures autorisation
    need(46);
    [['parent1','Signature du parent',14],['parent2','Signature du parent',110]].forEach(([role,lab,px])=>{
      doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(lab+' :',px,y);
      doc.setDrawColor(200);doc.rect(px,y+3,84,32);
      if(SIGS[role]){try{doc.addImage(SIGS[role],'PNG',px+2,y+5,80,28);}catch(e){}}
    });
    y+=42;
    // Bloc contre-indication
    need(52);
    doc.setDrawColor(120);
    const boxTop=y-5;
    doc.setFontSize(10.5);doc.setFont(undefined,'bold');
    const ciLab='Contre-indication à un antipyrétique : ';
    doc.text(ciLab,16,y);
    doc.setFont(undefined,'normal');
    doc.text('(citer le nom du médicament) '+(g('ci_medicament')||'……………'),16+doc.getTextWidth(ciLab),y);
    y+=10;
    doc.setFontSize(10.5);doc.text('Date : '+dfr(g('ci_date')),16,y);y+=10;
    doc.setFont(undefined,'bold');doc.text('Signature du parent :',16,y);
    doc.setDrawColor(200);doc.rect(16,y+3,84,30);
    if(SIGS['ci_parent']){try{doc.addImage(SIGS['ci_parent'],'PNG',18,y+5,80,26);}catch(e){}}
    y+=34;
    doc.setDrawColor(120);doc.rect(14,boxTop,W,y-boxTop);
    y+=6;
    pdfSortie(doc,slug(fillDoc.titre)+(g('ap_enfant')?'_'+slug(g('ap_enfant')):'')+'.pdf');
    return true;
  }
 },
 creme_solaire:{
  fields:['cs_civ1','cs_parent1','cs_qual1','cs_civ2','cs_parent2','cs_qual2','cs_enfant','cs_date'],
  html:v=>`<div class="tpl">
   <h3>Autorisation parentale — application de la crème solaire</h3>
   <p class="hint" style="font-size:14.5px;line-height:1.6;font-style:normal">Durant la période estivale, la crème solaire (indice 50+ minimum, flacon neuf, péremption après ouverture de 12 mois) est fournie par la famille. Sans crème personnelle, l’enfant ne peut pas profiter des sorties extérieures.</p>
   <div class="grid2">
     <div class="f"><label>Parent 1 — civilité</label><select id="ff_cs_civ1">${
       ['','Monsieur','Madame'].map(o=>`<option${v.cs_civ1===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Parent 1 — nom</label><input id="ff_cs_parent1" value="${esc(v.cs_parent1)}"></div>
   </div>
   <div class="f"><label>Parent 1 — en qualité de</label><input id="ff_cs_qual1" value="${esc(v.cs_qual1)}"></div>
   <div class="grid2">
     <div class="f"><label>Parent 2 — civilité</label><select id="ff_cs_civ2">${
       ['','Monsieur','Madame'].map(o=>`<option${v.cs_civ2===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Parent 2 — nom</label><input id="ff_cs_parent2" value="${esc(v.cs_parent2)}"></div>
   </div>
   <div class="f"><label>Parent 2 — en qualité de</label><input id="ff_cs_qual2" value="${esc(v.cs_qual2)}"></div>
   <div class="grid2">
     <div class="f"><label>Prénom de l’enfant</label><input id="ff_cs_enfant" value="${esc(v.cs_enfant)}"></div>
     <div class="f"><label>Date</label><input type="date" id="ff_cs_date" value="${esc(v.cs_date)}"></div>
   </div>
   <div class="grid2">
     ${sigBoxHtml('parent1','Signature du parent')}
     ${sigBoxHtml('parent2','Signature du parent')}
   </div>
  </div>`,
  mount:()=>{['parent1','parent2'].forEach(mountSig);},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'—';
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    doc.setFontSize(10.5);doc.setFont(undefined,'normal');
    doc.text('Chers parents,',14,y);y+=10;
    const intro=[
      'Durant la période estivale, pour la protection de votre enfant, outre le port d’un chapeau, il est recommandé de protéger la peau de votre enfant contre les rayons du soleil. C’est pourquoi, nous vous demandons de bien vouloir nous fournir une crème solaire d’un indice minimum de 50+, non ouverte et dont la date de péremption après ouverture est de 12 mois (voir logo sur le flacon).',
      'Dans l’éventualité où votre enfant n’aurait pas de crème solaire personnelle, il ne pourrait pas profiter des sorties que ce soit dans le jardin privatif de la crèche ou tout autre espace extérieur. Il est donc important pour lui d’avoir une crème de protection.',
      'Veuillez remplir cette autorisation pour l’application de la crème solaire.'
    ];
    intro.forEach(t=>{const L=doc.splitTextToSize(t,W);need(L.length*5+4);doc.text(L,14,y);y+=L.length*5+4;});
    y+=2;
    doc.text('L’équipe des Koala Kids',14,y);y+=14;
    need(70);
    doc.setDrawColor(90,140,200);doc.line(45,y,165,y);y+=9;
    doc.setFontSize(12);doc.setFont(undefined,'bold');
    doc.text('Autorisation parentale',14+W/2,y,{align:'center'});y+=12;
    doc.setFontSize(10.5);doc.setFont(undefined,'normal');
    const dots=n=>'.'.repeat(n);
    const soussPhrase=(civ,nom,qual)=>{
      const e=(civ||'').toLowerCase()==='madame'?'e':'';
      const civTxt=(civ||'').toLowerCase();
      return 'Je soussigné'+e+', '+(civTxt?civTxt+' ':'')+(nom||dots(55))+' en qualité de '+(qual||dots(32));};
    const para=[
      soussPhrase(g('cs_civ1'),g('cs_parent1'),g('cs_qual1')),
      soussPhrase(g('cs_civ2'),g('cs_parent2'),g('cs_qual2')),
      'De l’enfant '+(g('cs_enfant')||dots(55)),
      'autorise (autorisons) le personnel de la structure à appliquer à mon (notre) enfant la crème solaire fournie par mes (nos) soins.'
    ];
    para.forEach(t=>{const L=doc.splitTextToSize(t,W);need(L.length*5+8);doc.text(L,14,y);y+=L.length*5+8;});
    y+=4;
    doc.text('Date : '+dfr(g('cs_date')),14,y);y+=14;
    need(46);
    [['parent1','Signature du parent',14],['parent2','Signature du parent',110]].forEach(([role,lab,px])=>{
      doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(lab+' :',px,y);
      doc.setDrawColor(200);doc.rect(px,y+3,84,32);
      if(SIGS[role]){try{doc.addImage(SIGS[role],'PNG',px+2,y+5,80,28);}catch(e){}}
    });
    y+=42;
    pdfSortie(doc,slug(fillDoc.titre)+(g('cs_enfant')?'_'+slug(g('cs_enfant')):'')+'.pdf');
    return true;
  }
 },
 medicament_ponctuel:{
  fields:['mp_civ1','mp_parent1','mp_qual1','mp_civ2','mp_parent2','mp_qual2','mp_enfant','mp_medicament','mp_posologie','mp_duree','mp_ord_path','mp_ord_nom','mp_date'],
  html:v=>`<div class="tpl">
   <h3>Autorisation famille — prise de médicament ponctuelle</h3>
   <p class="hint">Autorise le référent technique ou le personnel de la structure à administrer à l’enfant le(s) médicament(s) indiqué(s), selon le protocole établi par son médecin (ordonnance transmise à la structure).</p>
   <div class="grid2">
     <div class="f"><label>Parent 1 — civilité</label><select id="ff_mp_civ1">${
       ['','Monsieur','Madame'].map(o=>`<option${v.mp_civ1===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Parent 1 — nom</label><input id="ff_mp_parent1" value="${esc(v.mp_parent1)}"></div>
   </div>
   <div class="f"><label>Parent 1 — en qualité de (père, mère…)</label><input id="ff_mp_qual1" value="${esc(v.mp_qual1)}"></div>
   <div class="grid2">
     <div class="f"><label>Parent 2 — civilité</label><select id="ff_mp_civ2">${
       ['','Monsieur','Madame'].map(o=>`<option${v.mp_civ2===o?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
     <div class="f"><label>Parent 2 — nom</label><input id="ff_mp_parent2" value="${esc(v.mp_parent2)}"></div>
   </div>
   <div class="f"><label>Parent 2 — en qualité de (père, mère…)</label><input id="ff_mp_qual2" value="${esc(v.mp_qual2)}"></div>
   <div class="grid2">
     <div class="f"><label>Prénom de l’enfant</label><input id="ff_mp_enfant" value="${esc(v.mp_enfant)}"></div>
     <div class="f"><label>Date</label><input type="date" id="ff_mp_date" value="${esc(v.mp_date)}"></div>
   </div>
   <h3>Médicament à administrer</h3>
   <div class="f"><label>Nom du médicament</label><input id="ff_mp_medicament" value="${esc(v.mp_medicament)}"></div>
   <div class="grid2">
     <div class="f"><label>Posologie</label><input id="ff_mp_posologie" value="${esc(v.mp_posologie)}" placeholder="ex. 1 dose-poids toutes les 6 h"></div>
     <div class="f"><label>Durée du traitement</label><input id="ff_mp_duree" value="${esc(v.mp_duree)}" placeholder="ex. 5 jours, du 02/10 au 06/10"></div>
   </div>
   <div class="f"><label>Ordonnance du médecin (pièce jointe)</label>
     <input type="hidden" id="ff_mp_ord_path" value="${esc(v.mp_ord_path)}">
     <input type="hidden" id="ff_mp_ord_nom" value="${esc(v.mp_ord_nom)}">
     <input type="file" id="mpOrdFile" accept="application/pdf,image/*" style="display:none" onchange="mpOrdChoisir(this)">
     <button type="button" class="btn btn-s" onclick="document.getElementById('mpOrdFile').click()"><i class="ti ti-upload"></i> Importer l’ordonnance</button>
     <p id="mpOrdEtat" style="font-size:13px;margin-top:8px"></p>
     <p class="hint">PDF ou photo, 8 Mo maximum. Visible uniquement par l’équipe de la crèche.</p>
   </div>
   <div class="grid2">
     ${sigBoxHtml('parent1','Signature du parent 1')}
     ${sigBoxHtml('parent2','Signature du parent 2')}
   </div>
  </div>`,
  mount:()=>{['parent1','parent2'].forEach(mountSig);mpOrdRender();},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'—';
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    doc.setFontSize(12);doc.setFont(undefined,'bold');
    doc.setDrawColor(120);doc.rect(14,y-5,W,10);
    doc.text('AUTORISATION ADMINISTRATION MEDICAMENT',14+W/2,y+1,{align:'center'});
    y+=18;
    doc.setFontSize(10.5);doc.setFont(undefined,'normal');
    const dots=n=>'.'.repeat(n);
    const soussPhrase=(civ,nom,qual)=>{
      const e=(civ||'').toLowerCase()==='madame'?'e':'';
      const civTxt=(civ||'').toLowerCase();
      return 'Je soussigné'+e+', '+(civTxt?civTxt+' ':'')+(nom||dots(55))+' en qualité de '+(qual||dots(32));};
    const para=[
      soussPhrase(g('mp_civ1'),g('mp_parent1'),g('mp_qual1')),
      soussPhrase(g('mp_civ2'),g('mp_parent2'),g('mp_qual2')),
      'de l’enfant '+(g('mp_enfant')||dots(55)),
      'autorise (autorisons) le référent technique ou le personnel de la structure à administrer à mon (notre) enfant le médicament suivant :'
    ];
    para.forEach(t=>{const L=doc.splitTextToSize(t,W);need(L.length*5+4);doc.text(L,14,y);y+=L.length*5+4;});
    [['Médicament',g('mp_medicament')],['Posologie',g('mp_posologie')],['Durée du traitement',g('mp_duree')]].forEach(([lab,val])=>{
      need(9);doc.setFont(undefined,'bold');doc.text(lab+' : ',17,y);
      const lw=doc.getTextWidth(lab+' : ');
      doc.setFont(undefined,'normal');
      const L=doc.splitTextToSize((val||'').trim()||'.'.repeat(60),W-6-lw);
      doc.text(L,17+lw,y);y+=L.length*5+3;
    });
    if(g('mp_ord_nom')){need(8);doc.setFont(undefined,'italic');doc.text('Ordonnance du médecin jointe au dossier : '+g('mp_ord_nom'),17,y);doc.setFont(undefined,'normal');y+=7;}
    y+=3;
    ['Selon le protocole établi par le médecin de mon (notre) enfant, l’ordonnance a d’ailleurs été transmise au personnel de la structure.'
    ].forEach(t=>{const L=doc.splitTextToSize(t,W);need(L.length*5+4);doc.text(L,14,y);y+=L.length*5+4;});
    y+=4;
    doc.text('Date : '+dfr(g('mp_date')),14,y);y+=12;
    need(46);
    [['parent1','Signature du parent 1',14],['parent2','Signature du parent 2',110]].forEach(([role,lab,px])=>{
      doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(lab+' :',px,y);
      doc.setDrawColor(200);doc.rect(px,y+3,84,32);
      if(SIGS[role]){try{doc.addImage(SIGS[role],'PNG',px+2,y+5,80,28);}catch(e){}}
    });
    y+=42;
    pdfSortie(doc,slug(fillDoc.titre)+(g('mp_enfant')?'_'+slug(g('mp_enfant')):'')+'.pdf');
    return true;
  }
 },
 fiche_sanitaire:{
  fields:(()=>{
    const f=['fs_nom','fs_prenom','fs_naiss','fs_ville','fs_nationalite','fs_sexe','fs_v7_lib',
             'fs_regime','fs_regime_com','fs_med_nom','fs_med_adr','fs_med_tel',
             'fs_ped_nom','fs_ped_adr','fs_ped_tel','fs_notes',
             'fs_doc_nom','fs_doc_enfant','fs_doc_temp','fs_doc_date'];
    FS_VACCINS.forEach((_,i)=>{f.push('fs_v'+(i+1)+'_d','fs_v'+(i+1)+'_p');});
    FS_ALLERGIES.forEach((_,i)=>{f.push('fs_a'+(i+1)+'_r','fs_a'+(i+1)+'_c');});
    return f;
  })(),
  html:v=>`<div class="tpl">${FT_CSS}
   <h3>Enfant</h3>
   <div class="grid2">
     <div class="f"><label>Nom</label>${inHtml('fs_nom',v.fs_nom)}</div>
     <div class="f"><label>Prénom</label>${inHtml('fs_prenom',v.fs_prenom)}</div>
   </div>
   <div class="grid2">
     <div class="f"><label>Né(e) le</label>${inHtml('fs_naiss',v.fs_naiss,'date')}</div>
     <div class="f"><label>À (ville)</label>${inHtml('fs_ville',v.fs_ville)}</div>
   </div>
   <div class="grid2">
     <div class="f"><label>Nationalité</label>${inHtml('fs_nationalite',v.fs_nationalite)}</div>
     <div class="f"><label>Sexe</label>${selHtml('fs_sexe',['','M','F'],v.fs_sexe)}</div>
   </div>
   <p class="hint" style="font-size:14px;font-style:normal">Joindre les photocopies du carnet de santé.</p>

   <h3>Vaccins</h3>
   <div class="ftw"><table class="ft">
    <tr><th style="width:44%">Vaccins</th><th>Date de vaccination</th><th>Prochaine vaccination</th></tr>
    ${FS_VACCINS.map((lab,i)=>`<tr>
      <td class="lab">${esc(lab)}</td>
      <td>${inHtml('fs_v'+(i+1)+'_d',v['fs_v'+(i+1)+'_d'])}</td>
      <td>${inHtml('fs_v'+(i+1)+'_p',v['fs_v'+(i+1)+'_p'])}</td></tr>`).join('')}
   </table></div>
   <div class="f"><label>Autres vaccins — préciser lesquels</label>${inHtml('fs_v7_lib',v.fs_v7_lib)}</div>

   <h3>Allergies</h3>
   <div class="ftw"><table class="ft">
    <tr><th style="width:32%">Allergies</th><th style="width:16%">Oui / Non</th><th>Commentaires et conduites à tenir</th></tr>
    ${FS_ALLERGIES.map((lab,i)=>`<tr>
      <td class="lab">${esc(lab)}</td>
      <td>${selHtml('fs_a'+(i+1)+'_r',ON_OPTS,v['fs_a'+(i+1)+'_r'])}</td>
      <td>${inHtml('fs_a'+(i+1)+'_c',v['fs_a'+(i+1)+'_c'])}</td></tr>`).join('')}
   </table></div>

   <h3>Régime alimentaire</h3>
   <div class="grid2">
     <div class="f"><label>Régime</label>${inHtml('fs_regime',v.fs_regime)}</div>
     <div class="f"><label>Commentaires</label>${inHtml('fs_regime_com',v.fs_regime_com)}</div>
   </div>

   <h3>Médecin traitant</h3>
   <div class="grid2">
     <div class="f"><label>Nom</label>${inHtml('fs_med_nom',v.fs_med_nom)}</div>
     <div class="f"><label>Téléphone</label>${inHtml('fs_med_tel',v.fs_med_tel,'tel')}</div>
   </div>
   <div class="f"><label>Adresse</label>${inHtml('fs_med_adr',v.fs_med_adr)}</div>

   <h3>Pédiatre</h3>
   <div class="grid2">
     <div class="f"><label>Nom</label>${inHtml('fs_ped_nom',v.fs_ped_nom)}</div>
     <div class="f"><label>Téléphone</label>${inHtml('fs_ped_tel',v.fs_ped_tel,'tel')}</div>
   </div>
   <div class="f"><label>Adresse</label>${inHtml('fs_ped_adr',v.fs_ped_adr)}</div>

   <h3>Notes particulières</h3>
   <div class="f"><textarea id="ff_fs_notes">${esc(v.fs_notes)}</textarea></div>

   <h3>Certificat médical</h3>
   <p class="hint" style="font-size:14px;font-style:normal">Partie réservée au médecin : atteste que l'enfant est apte à la vie en collectivité, ne présente aucun signe apparent de maladie contagieuse et est à jour de ses vaccinations.</p>
   <div class="grid2">
     <div class="f"><label>Je soussigné, Docteur</label>${inHtml('fs_doc_nom',v.fs_doc_nom)}</div>
     <div class="f"><label>certifie avoir examiné l'enfant</label>${inHtml('fs_doc_enfant',v.fs_doc_enfant)}</div>
   </div>
   <div class="grid2">
     <div class="f"><label>Température à partir de laquelle le Doliprane est préconisé (°C)</label>${inHtml('fs_doc_temp',v.fs_doc_temp)}</div>
     <div class="f"><label>Date</label>${inHtml('fs_doc_date',v.fs_doc_date,'date')}</div>
   </div>
   <div class="grid2">
     ${sigBoxHtml('medecin','Signature et tampon du docteur')}
   </div>
  </div>`,
  mount:()=>{['medecin'].forEach(mountSig);},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    const H=t=>{need(16);doc.setFillColor(74,63,159);doc.rect(14,y-5,W,8,'F');
      doc.setTextColor(255);doc.setFontSize(10);doc.setFont(undefined,'bold');
      doc.text(t.toUpperCase(),16,y);doc.setTextColor(30);y+=12;};

    doc.setFontSize(16);doc.setFont(undefined,'bold');doc.text('FICHE SANITAIRE',14,y);y+=12;

    H('Enfant');
    y=pdfGrid(doc,14,y,[30,61,30,61],[
      ['Nom',g('fs_nom'),'Prénom',g('fs_prenom')],
      ['Né(e) le',dfr(g('fs_naiss')),'À (ville)',g('fs_ville')],
      ['Nationalité',g('fs_nationalite'),'Sexe',g('fs_sexe')]
    ],{minH:9});
    y+=8;
    doc.setFontSize(10);doc.setFont(undefined,'bold');
    doc.text('Joindre les photocopies du carnet de santé',14,y);y+=10;

    H('Vaccins');
    y=pdfGrid(doc,14,y,[92,45,45],[{head:true,cells:['Vaccins','Date de vaccination','Prochaine vaccination']}]
      .concat(FS_VACCINS.map((lab,i)=>[
        (i===FS_VACCINS.length-1&&g('fs_v7_lib'))?lab+' : '+g('fs_v7_lib'):lab,
        g('fs_v'+(i+1)+'_d'),g('fs_v'+(i+1)+'_p')])),{minH:10});
    y+=10;

    H('Allergies');
    y=pdfGrid(doc,14,y,[62,25,95],[{head:true,cells:['Allergies','Oui / Non','Commentaires et conduites à tenir']}]
      .concat(FS_ALLERGIES.map((lab,i)=>[lab,g('fs_a'+(i+1)+'_r'),g('fs_a'+(i+1)+'_c')])),{minH:10});
    y+=10;

    H('Régime alimentaire');
    y=pdfGrid(doc,14,y,[62,120],[{head:true,cells:['Régime alimentaire','Commentaires']},
      [g('fs_regime'),g('fs_regime_com')]],{minH:11});
    y+=10;

    H('Médecins');
    y=pdfGrid(doc,14,y,[62,85,35],[{head:true,cells:['Nom du médecin traitant','Adresse','Téléphone']},
      [g('fs_med_nom'),g('fs_med_adr'),g('fs_med_tel')]],{minH:11});
    y+=4;
    y=pdfGrid(doc,14,y,[62,85,35],[{head:true,cells:['Nom du pédiatre','Adresse','Téléphone']},
      [g('fs_ped_nom'),g('fs_ped_adr'),g('fs_ped_tel')]],{minH:11});
    y+=10;

    if(g('fs_notes')){
      H('Notes particulières');
      const L=doc.splitTextToSize(g('fs_notes'),W-4);
      need(L.length*5+6);
      doc.setFontSize(10);doc.setFont(undefined,'normal');doc.text(L,14,y);y+=L.length*5+8;
    }

    H('Certificat médical');
    doc.setFontSize(10);doc.setFont(undefined,'normal');
    const dots=n=>'.'.repeat(n);
    const cert=[
      'Je, soussigné, Docteur '+(g('fs_doc_nom')||dots(40))+' certifie avoir examiné l\u2019enfant '+(g('fs_doc_enfant')||dots(40)),
      'Ce patient est apte à la vie en collectivité, ne présente aucun signe apparent de maladie contagieuse et est à jour de ses vaccinations.',
      'En cas de température supérieure à '+(g('fs_doc_temp')||dots(10))+', je préconise, sur autorisation écrite des parents, l\u2019administration de DOLIPRANE à raison d\u20191 dose/poids de l\u2019enfant toutes les 6 heures.'
    ];
    cert.forEach(t=>{const L=doc.splitTextToSize(t,W);need(L.length*5+5);doc.text(L,14,y);y+=L.length*5+5;});
    y+=4;
    doc.text('Date : '+(dfr(g('fs_doc_date'))||dots(20)),14,y);y+=12;
    need(46);
    doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text('Signature et tampon du docteur :',14,y);
    doc.setDrawColor(200);doc.rect(14,y+3,90,34);
    if(SIGS['medecin']){try{doc.addImage(SIGS['medecin'],'PNG',16,y+5,86,30);}catch(e){}}
    y+=42;
    pdfSortie(doc,slug(fillDoc.titre)+(g('fs_nom')?'_'+slug(g('fs_nom')):'')+'.pdf');
    return true;
  }
 },
 /* Fiche de renseignements — reprise de la trame Word de la crèche.
    Beaucoup de cases à cocher : elles se lisent d'un coup d'oeil sur le PDF,
    là où des listes Oui/Non obligeraient à comparer ligne à ligne. */
 fiche_renseignements:{
  fields:['fr_nom','fr_prenom','fr_naiss','fr_age','fr_j1','fr_j2','fr_j3','fr_j4','fr_j5',
          'fr_horaires','fr_grossesse','fr_antecedents',
          'fr_lait','fr_lait_recup','fr_quantites','fr_diversification','fr_morceaux','fr_regime',
          'fr_sieste','fr_tetine','fr_turbulette','fr_doudou','fr_sommeil_autre',
          'fr_couche_jour','fr_couche_sieste','fr_pot','fr_wc','fr_change','fr_change_autre',
          'fr_date'],
  html:v=>`<div class="tpl">${FT_CSS}
   <h3>Fiche de renseignements sur l’enfant</h3>
   <div class="grid2">
     <div class="f"><label>Nom</label>${inHtml('fr_nom',v.fr_nom)}</div>
     <div class="f"><label>Prénom</label>${inHtml('fr_prenom',v.fr_prenom)}</div>
   </div>
   <div class="grid2">
     <div class="f"><label>Date de naissance</label>${inHtml('fr_naiss',v.fr_naiss,'date')}</div>
     <div class="f"><label>Âge</label>${inHtml('fr_age',v.fr_age)}</div>
   </div>
   <div class="f"><label>Jours de présence</label>
     ${['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].map((j,i)=>ckHtml('fr_j'+(i+1),j,v['fr_j'+(i+1)])).join('')}
   </div>
   <div class="f"><label>Horaires</label>${inHtml('fr_horaires',v.fr_horaires)}</div>

   <h3>Avant la crèche</h3>
   <div class="f"><label>Comment s’est passée la grossesse, la naissance de l’enfant ?</label>
     <textarea id="ff_fr_grossesse">${esc(v.fr_grossesse)}</textarea></div>
   <div class="f"><label>Antécédents (hospitalisation, maladies, difficultés, kiné…)</label>
     <textarea id="ff_fr_antecedents">${esc(v.fr_antecedents)}</textarea></div>

   <h3>À la maison — repas</h3>
   <div class="grid2">
     <div class="f"><label>Lait</label>${selHtml('fr_lait',['','Maternel','Artificiel','Mixte'],v.fr_lait)}</div>
     <div class="f"><label>Récupérer le lait non consommé en fin de journée ?</label>${selHtml('fr_lait_recup',ON_OPTS,v.fr_lait_recup)}</div>
   </div>
   <div class="f"><label>Quantités des biberons</label>${inHtml('fr_quantites',v.fr_quantites)}</div>
   <div class="grid2">
     <div class="f"><label>Diversification</label>${selHtml('fr_diversification',ON_OPTS,v.fr_diversification)}</div>
     <div class="f"><label>Morceaux</label>${selHtml('fr_morceaux',ON_OPTS,v.fr_morceaux)}</div>
   </div>
   <div class="f"><label>Régime particulier</label>${inHtml('fr_regime',v.fr_regime)}</div>

   <h3>Sommeil</h3>
   <div class="f"><label>Sieste (rythme, habitudes)</label>
     <textarea id="ff_fr_sieste">${esc(v.fr_sieste)}</textarea></div>
   <div class="f"><label>Pour s’endormir</label>
     ${ckHtml('fr_tetine','Tétine',v.fr_tetine)}${ckHtml('fr_turbulette','Turbulette',v.fr_turbulette)}${ckHtml('fr_doudou','Doudou',v.fr_doudou)}
   </div>
   <div class="f"><label>Autre</label>${inHtml('fr_sommeil_autre',v.fr_sommeil_autre)}</div>

   <h3>Acquisition de la continence</h3>
   <div class="f"><label>Couche</label>
     ${ckHtml('fr_couche_jour','Journée',v.fr_couche_jour)}${ckHtml('fr_couche_sieste','Sieste',v.fr_couche_sieste)}
     ${ckHtml('fr_pot','Pot',v.fr_pot)}${ckHtml('fr_wc','WC',v.fr_wc)}
   </div>
   <div class="f"><label>Change</label>${selHtml('fr_change',['','Protocole crèche (eau et savon)','Produits personnels (liniment, coton…)'],v.fr_change)}</div>
   <div class="f"><label>Autre</label>${inHtml('fr_change_autre',v.fr_change_autre)}</div>

   <h3>Signature</h3>
   <div class="f"><label>Date</label>${inHtml('fr_date',v.fr_date,'date')}</div>
   <div class="grid2">
     ${sigBoxHtml('parent1','Signature du parent')}
   </div>
  </div>`,
  mount:()=>{['parent1'].forEach(mountSig);},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const c=id=>{const e=document.getElementById('ff_'+id);return !!(e&&e.checked);};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
    const oui=v=>v||'—';
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    const titre=t=>{need(14);doc.setFontSize(11);doc.setFont(undefined,'bold');
      doc.text(t,14,y);doc.setDrawColor(150);doc.line(14,y+1.5,14+W,y+1.5);y+=9;
      doc.setFontSize(10);doc.setFont(undefined,'normal');};
    const bloc=t=>{const L=doc.splitTextToSize(t||'—',W-4);need(L.length*5+4);
      doc.text(L,16,y);y+=L.length*5+4;};
    const cases=(lab,items)=>{need(9);doc.setFont(undefined,'bold');doc.text(lab,14,y);
      doc.setFont(undefined,'normal');
      let x=14+doc.getTextWidth(lab)+4;
      items.forEach(([l,on])=>{
        doc.setDrawColor(90);doc.rect(x,y-3.2,3.6,3.6);
        if(on){doc.setLineWidth(.5);doc.line(x+.5,y-1.4,x+1.5,y-.4);doc.line(x+1.5,y-.4,x+3.2,y-2.9);doc.setLineWidth(.2);}
        doc.text(l,x+5.2,y);x+=5.2+doc.getTextWidth(l)+6;
      });y+=8;};

    doc.setFontSize(15);doc.setFont(undefined,'bold');
    doc.text('FICHE DE RENSEIGNEMENTS SUR L’ENFANT',14+W/2,y,{align:'center'});y+=13;
    doc.setFontSize(10);doc.setFont(undefined,'normal');
    doc.setFont(undefined,'bold');doc.text('NOM : ',14,y);
    doc.setFont(undefined,'normal');doc.text(oui(g('fr_nom')),30,y);
    doc.setFont(undefined,'bold');doc.text('PRÉNOM : ',110,y);
    doc.setFont(undefined,'normal');doc.text(oui(g('fr_prenom')),133,y);y+=8;
    doc.setFont(undefined,'bold');doc.text('Date de naissance : ',14,y);
    doc.setFont(undefined,'normal');doc.text(dfr(g('fr_naiss'))||'—',56,y);
    doc.setFont(undefined,'bold');doc.text('Âge : ',110,y);
    doc.setFont(undefined,'normal');doc.text(oui(g('fr_age')),122,y);y+=9;
    cases('Jours de présence :',[['Lundi',c('fr_j1')],['Mardi',c('fr_j2')],['Mercredi',c('fr_j3')],
      ['Jeudi',c('fr_j4')],['Vendredi',c('fr_j5')]]);
    doc.setFont(undefined,'bold');doc.text('Horaires : ',14,y);
    doc.setFont(undefined,'normal');doc.text(oui(g('fr_horaires')),36,y);y+=11;

    titre('AVANT LA CRÈCHE');
    doc.setFont(undefined,'bold');bloc('Grossesse et naissance :');
    doc.setFont(undefined,'normal');bloc(g('fr_grossesse'));
    doc.setFont(undefined,'bold');bloc('Antécédents (hospitalisation, maladies, difficultés, kiné…) :');
    doc.setFont(undefined,'normal');bloc(g('fr_antecedents'));

    titre('À LA MAISON — REPAS');
    y=pdfGrid(doc,14,y,[70,112],[
      ['Lait',oui(g('fr_lait'))],
      ['Récupérer le lait non consommé',oui(g('fr_lait_recup'))],
      ['Quantités des biberons',oui(g('fr_quantites'))],
      ['Diversification',oui(g('fr_diversification'))],
      ['Morceaux',oui(g('fr_morceaux'))],
      ['Régime particulier',oui(g('fr_regime'))]
    ],{minH:9});y+=10;

    titre('SOMMEIL');
    bloc(g('fr_sieste'));
    cases('Pour s’endormir :',[['Tétine',c('fr_tetine')],['Turbulette',c('fr_turbulette')],['Doudou',c('fr_doudou')]]);
    if(g('fr_sommeil_autre')){doc.text('Autre : '+g('fr_sommeil_autre'),14,y);y+=8;}
    y+=3;

    titre('ACQUISITION DE LA CONTINENCE');
    cases('Couche :',[['Journée',c('fr_couche_jour')],['Sieste',c('fr_couche_sieste')],
      ['Pot',c('fr_pot')],['WC',c('fr_wc')]]);
    doc.setFont(undefined,'bold');doc.text('Change : ',14,y);
    doc.setFont(undefined,'normal');doc.text(oui(g('fr_change')),33,y);y+=8;
    if(g('fr_change_autre')){doc.text('Autre : '+g('fr_change_autre'),14,y);y+=8;}
    y+=6;

    need(50);
    doc.setFont(undefined,'bold');doc.text('Date : ',14,y);
    doc.setFont(undefined,'normal');doc.text(dfr(g('fr_date'))||'—',28,y);y+=8;
    doc.setFont(undefined,'bold');doc.setFontSize(9);doc.text('Signature du parent :',14,y);
    doc.setDrawColor(200);doc.rect(14,y+3,90,32);
    if(SIGS['parent1']){try{doc.addImage(SIGS['parent1'],'PNG',16,y+5,86,28);}catch(e){}}
    pdfSortie(doc,slug(fillDoc.titre)+(g('fr_nom')?'_'+slug(g('fr_nom')):'')+'.pdf');
    return true;
  }
 },
 fiche_liaison:{
  fields:['fl_creche','fl_enfant','fl_naiss','fl_parents','fl_tel1','fl_tel2','fl_autorisees',
          'fl_p1','fl_p2','fl_p3','fl_p4','fl_p5','fl_p6','fl_date'],
  html:v=>`<div class="tpl">${FT_CSS}
   <h3>Fiche de liaison</h3>
   <div class="grid2">
     <div class="f"><label>Crèche</label>${selHtml('fl_creche',['',...CRECHE_NOMS_COURTS],v.fl_creche)}</div>
     <div class="f"><label>Date</label>${inHtml('fl_date',v.fl_date,'date')}</div>
   </div>
   <div class="grid2">
     <div class="f"><label>Nom / Prénom de l'enfant</label>${inHtml('fl_enfant',v.fl_enfant)}</div>
     <div class="f"><label>Date de naissance</label>${inHtml('fl_naiss',v.fl_naiss,'date')}</div>
   </div>
   <div class="f"><label>Nom / Prénom des parents</label>${inHtml('fl_parents',v.fl_parents)}</div>
   <div class="grid2">
     <div class="f"><label>Téléphone parent 1</label>${inHtml('fl_tel1',v.fl_tel1,'tel')}</div>
     <div class="f"><label>Téléphone parent 2</label>${inHtml('fl_tel2',v.fl_tel2,'tel')}</div>
   </div>

   <h3>Personnes autorisées à venir le chercher</h3>
   <p class="hint" style="font-size:14px;font-style:normal">Une personne par ligne : nom, prénom, lien avec l'enfant, téléphone.</p>
   <div class="f"><textarea id="ff_fl_autorisees" style="min-height:130px">${esc(v.fl_autorisees)}</textarea></div>

   <h3>Autorisation de prises de photos et de diffusion</h3>
   <p class="hint" style="font-size:14px;font-style:normal">Dans le cadre de la crèche, nous sommes amenés à utiliser des photos des enfants pour :</p>
   <div class="ftw"><table class="ft">
    <tr><th style="width:70%">Utilisation</th><th>Autorisation</th></tr>
    ${FL_PHOTOS.map((lab,i)=>`<tr><td class="lab">${esc(lab)}</td><td>${selHtml('fl_p'+(i+1),ON_OPTS,v['fl_p'+(i+1)])}</td></tr>`).join('')}
   </table></div>
   <div class="txtbox">
     Il ne s'agit pas de photographies individuelles d'identité mais de photos de groupe ou bien de vues montrant les enfants en activité.<br><br>
     En application de la loi informatique et libertés et des règles de protection des mineurs, les légendes accompagnant les photos ne communiqueront aucune information susceptible d'identifier directement ou indirectement les enfants ou leur famille. La loi nous fait obligation d'avoir l'autorisation écrite des parents pour cette utilisation.
   </div>

   <h3>Signature des parents</h3>
   <div class="grid2">
     ${sigBoxHtml('parent1','Signature du parent')}
     ${sigBoxHtml('parent2','Signature du parent')}
   </div>
  </div>`,
  mount:()=>{['parent1','parent2'].forEach(mountSig);},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
    const dots=n=>'.'.repeat(n);
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};

    doc.setFontSize(16);doc.setFont(undefined,'bold');
    doc.text('FICHE DE LIAISON',14+W/2,y,{align:'center'});y+=14;

    doc.setFontSize(10.5);doc.setFont(undefined,'bold');
    doc.text('NOM / PRÉNOM DE L\u2019ENFANT : ',14,y);
    doc.setFont(undefined,'normal');doc.text(g('fl_enfant')||dots(30),75,y);
    doc.setFont(undefined,'bold');doc.text('NÉ(E) LE : ',132,y);
    doc.setFont(undefined,'normal');doc.text(dfr(g('fl_naiss'))||dots(12),155,y);
    y+=9;
    doc.setFont(undefined,'bold');doc.text('NOM / PRÉNOM DES PARENTS : ',14,y);
    doc.setFont(undefined,'normal');doc.text(g('fl_parents')||dots(40),82,y);
    y+=12;

    y=pdfGrid(doc,14,y,[62,60,60],[{head:true,cells:['','Parent 1','Parent 2']},
      ['Numéros de téléphone',g('fl_tel1'),g('fl_tel2')]],{minH:11});
    y+=12;

    need(60);
    doc.setFontSize(10.5);doc.setFont(undefined,'bold');
    doc.text('Personnes autorisées à venir le chercher :',14,y);y+=8;
    doc.setFont(undefined,'normal');doc.setFontSize(10);
    const pers=(g('fl_autorisees')||'').split(/\r?\n/).filter(t=>t.trim());
    const nLignes=Math.max(6,pers.length);
    for(let i=0;i<nLignes;i++){
      need(9);
      if(pers[i])doc.text(doc.splitTextToSize(pers[i],W-2)[0],15,y);
      doc.setDrawColor(190);doc.line(14,y+1.5,14+W,y+1.5);
      y+=8;
    }
    y+=10;

    need(70);
    doc.setFontSize(10.5);doc.setFont(undefined,'bold');
    doc.text('Autorisation de prises de photos et de diffusion des photos',14+W/2,y,{align:'center'});y+=8;
    doc.setFont(undefined,'normal');doc.setFontSize(10);
    const intro=doc.splitTextToSize('Dans le cadre de la crèche, nous sommes amenés à utiliser des photos des enfants pour :',W);
    doc.text(intro,14,y);y+=intro.length*5+4;
    y=pdfGrid(doc,14,y,[132,50],[{head:true,cells:['Utilisation','Autorisation']}]
      .concat(FL_PHOTOS.map((lab,i)=>[lab,g('fl_p'+(i+1))||'—'])),{minH:9});
    y+=8;
    const legal=[
      'Il ne s\u2019agit pas de photographies individuelles d\u2019identité mais de photos de groupe ou bien de vues montrant les enfants en activité.',
      'En application de la loi informatique et libertés et des règles de protection des mineurs, les légendes accompagnant les photos ne communiqueront aucune information susceptible d\u2019identifier directement ou indirectement les enfants ou leur famille. La loi nous fait obligation d\u2019avoir l\u2019autorisation écrite des parents pour cette utilisation.'
    ];
    doc.setFontSize(9.5);
    legal.forEach(t=>{const L=doc.splitTextToSize(t,W);need(L.length*4.6+4);doc.text(L,14,y);y+=L.length*4.6+4;});
    y+=8;

    need(50);
    doc.setFontSize(10);doc.setFont(undefined,'bold');
    doc.text('Date : ',14,y);doc.setFont(undefined,'normal');
    doc.text(dfr(g('fl_date'))||dots(20),27,y);y+=8;
    [['parent1','Signature du parent',14],['parent2','Signature du parent',110]].forEach(([role,lab,px])=>{
      doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text(lab+' :',px,y);
      doc.setDrawColor(200);doc.rect(px,y+3,84,32);
      if(SIGS[role]){try{doc.addImage(SIGS[role],'PNG',px+2,y+5,80,28);}catch(e){}}
    });
    y+=40;
    if(g('fl_creche')){
      doc.setFontSize(8.5);doc.setFont(undefined,'normal');doc.setTextColor(120);
      doc.text('Koala Kids '+g('fl_creche'),14,285);doc.setTextColor(30);
    }
    pdfSortie(doc,slug(fillDoc.titre)+(g('fl_enfant')?'_'+slug(g('fl_enfant')):'')+'.pdf');
    return true;
  }
 },
 reglement_medicaments:{
  fields:['rm_creche','rm_nom','rm_enfant','rm_date'],
  html:v=>`<div class="tpl">${FT_CSS}
   <h3>Règlement — produits d'hygiène et médicaments</h3>
   <div class="txtbox">
     <b>Réglementation concernant les ordonnances</b>
     <ul>
       <li>Les parents sont responsables de la surveillance médicale de leur enfant et de l'administration des médicaments prescrits par le médecin.</li>
       <li>L'administration des médicaments en crèche est faite par le personnel, sur délégation écrite du (des) parent(s) et sous condition de fournir l'ordonnance en lien avec le traitement.</li>
     </ul>
     L'ordonnance doit comporter de manière précise et lisible : nom ET prénom de l'enfant, date de prescription, nom complet du médicament (mention et nom lisible du générique le cas échéant), posologie précise (quantité, nombre de prises…), durée du traitement.
     <br><br>
     <b>Réglementation concernant les appareillages</b><br>
     Dans l'intérêt de l'enfant, tout appareillage médical ou paramédical (attelle, casque, plâtre…) doit faire l'objet d'une prescription médicale précise et détaillée, réévaluée par le médecin si besoin.
     <br><br>
     <b>Les bijoux sont INTERDITS (collier d'ambre inclus).</b>
   </div>
   <div class="ftw"><table class="ft">
    <tr><th style="width:50%">Produits d'hygiène — produits neufs et fermés, avec date limite d'utilisation optimale</th><th>Médicaments avec ordonnance — même ceux obtenus sans prescription médicale, et autorisation parentale d'administrer</th></tr>
    ${RM_TABLE.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}
   </table></div>

   <h3>Engagement</h3>
   <div class="grid2">
     <div class="f"><label>Crèche</label>${selHtml('rm_creche',['',...CRECHE_NOMS_COURTS],v.rm_creche)}</div>
     <div class="f"><label>Date</label>${inHtml('rm_date',v.rm_date,'date')}</div>
   </div>
   <div class="grid2">
     <div class="f"><label>Je soussigné(e)</label>${inHtml('rm_nom',v.rm_nom)}</div>
     <div class="f"><label>Parent de l'enfant</label>${inHtml('rm_enfant',v.rm_enfant)}</div>
   </div>
   <p class="hint" style="font-size:14px;font-style:normal">Déclare avoir pris connaissance du règlement de fonctionnement et m'engage à en respecter les règles.</p>
   <div class="grid2">
     ${sigBoxHtml('parent1','Signature du parent')}
   </div>
  </div>`,
  mount:()=>{['parent1'].forEach(mountSig);},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?e.value:'';};
    const dfr=d=>d?new Date(d).toLocaleDateString('fr-FR'):'';
    const dots=n=>'.'.repeat(n);
    const W=182;let y=pdfLogo(doc,20);
    const need=h=>{if(y+h>278){doc.addPage();y=pdfLogo(doc,20);}};
    const P=(t,size,bold)=>{doc.setFontSize(size||10);doc.setFont(undefined,bold?'bold':'normal');
      const L=doc.splitTextToSize(t,W);need(L.length*4.8+4);doc.text(L,14,y);y+=L.length*4.8+4;};

    doc.setFontSize(13);doc.setFont(undefined,'bold');
    const ti=doc.splitTextToSize('RÈGLEMENT CONCERNANT LES PRODUITS D\u2019HYGIÈNE ET LES MÉDICAMENTS',W);
    doc.text(ti,14+W/2,y,{align:'center'});y+=ti.length*6+8;

    P('Réglementation concernant les ordonnances :',10.5,true);
    P('- Les parents sont responsables de la surveillance médicale de leur enfant et de l\u2019administration des médicaments prescrits par le médecin.');
    P('- L\u2019administration des médicaments en crèche est faite par le personnel, sur délégation écrite du (des) parent(s) et sous condition de fournir l\u2019ordonnance en lien avec le traitement.');
    P('Cette ordonnance doit comporter de manière précise et lisible les informations suivantes :');
    ['Nom ET prénom de l\u2019enfant',
     'La date de prescription',
     'Le nom complet du médicament (si le pharmacien délivre un générique, il devra en faire la mention et préciser le nom du produit de manière lisible)',
     'La posologie précise (quantité, nombre de prises…)',
     'La durée du traitement'].forEach(t=>P('- '+t));
    y+=2;
    P('Réglementation concernant les appareillages :',10.5,true);
    P('Dans l\u2019intérêt de l\u2019enfant, tout appareillage médical ou paramédical (attelle, casque, plâtre…) doit faire l\u2019objet d\u2019une prescription médicale précise et détaillée, et réévaluée par le médecin si besoin.');
    y+=2;
    P('Les bijoux sont INTERDITS (collier d\u2019ambre inclus)',11,true);
    y+=6;

    y=pdfGrid(doc,14,y,[91,91],[{head:true,cells:[
      'PRODUITS d\u2019HYGIÈNE : produits neufs et fermés avec date limite d\u2019utilisation optimale.',
      'MÉDICAMENTS avec ordonnances. Même ceux obtenus SANS prescription médicale et autorisation parentale d\u2019administrer le médicament.']}]
      .concat(RM_TABLE.map(r=>[r[0],r[1]])),{minH:9});
    y+=12;

    need(60);
    doc.setFontSize(10.5);doc.setFont(undefined,'normal');
    const eng='Je soussigné(e) '+(g('rm_nom')||dots(40))+(g('rm_enfant')?', parent de l\u2019enfant '+g('rm_enfant'):'')+
      ' déclare avoir pris connaissance du règlement de fonctionnement et m\u2019engage à en respecter les règles.';
    const LE=doc.splitTextToSize(eng,W);doc.text(LE,14,y);y+=LE.length*5+10;
    doc.text('Le '+(dfr(g('rm_date'))||dots(20)),14,y);y+=10;
    need(44);
    doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text('Signature :',14,y);
    doc.setDrawColor(200);doc.rect(14,y+3,90,32);
    if(SIGS['parent1']){try{doc.addImage(SIGS['parent1'],'PNG',16,y+5,86,28);}catch(e){}}
    y+=40;
    if(g('rm_creche')){
      doc.setFontSize(8.5);doc.setFont(undefined,'normal');doc.setTextColor(120);
      doc.text('Koala Kids '+g('rm_creche'),14,285);doc.setTextColor(30);
    }
    pdfSortie(doc,slug(fillDoc.titre)+(g('rm_nom')?'_'+slug(g('rm_nom')):'')+'.pdf');
    return true;
  }
 },
 vaccinations:{
  large:true,
  get fields(){return VAC_FIELDS;},
  html:v=>`<div class="tpl">${VAC_CSS}
   <h3>Suivi des vaccinations obligatoires</h3>
   <div class="vac-head">
     <div class="f" style="flex:1;min-width:220px"><label>Nom - prénom de l'enfant</label>
       <input id="ff_vac_enfant" value="${esc(v.vac_enfant)}"></div>
     <div class="f"><label>Date de naissance</label>
       <input type="date" id="ff_vac_naissance" value="${esc(v.vac_naissance)}" onchange="vacRecalc(false)"></div>
     ${vacCrecheHtml(v)}
     <div class="vac-prog">
       <div class="vac-track"><i id="vac-bar"></i></div>
       <span class="vac-pct" id="vac-pct">0/0 — 0 %</span>
     </div>
   </div>
   <p class="vac-leg">Les dates sont calculées automatiquement à partir de la date de naissance (calendrier vaccinal français, mise à jour 01/01/2025) et restent modifiables : saisir la date réelle du carnet de santé puis cocher « Reçu ». <b>Une ligne en rouge signale une dose échue non reçue.</b></p>
   <div style="margin:0 0 12px">
     <button type="button" class="btn btn-s" onclick="vacRecalc(true)"><i class="ti ti-refresh"></i> Recalculer toutes les dates prévues</button>
   </div>
   ${vacTableHtml(v)}
   <div class="f"><label>Observations</label><textarea id="ff_vac_obs" rows="3">${esc(v.vac_obs)}</textarea></div>
   <div class="grid2">
     <div class="f"><label>Document vérifié par</label><input id="ff_vac_verif_nom" value="${esc(v.vac_verif_nom)}"></div>
     <div class="f"><label>Le</label><input type="date" id="ff_vac_verif_date" value="${esc(v.vac_verif_date)}"></div>
   </div>
   <div class="grid2">${sigBoxHtml('responsable','Signature')}</div>
  </div>`,
  mount:()=>{vacHookEnfant();mountSig('responsable');vacRecalc(false);},
  pdf:doc=>{
    const g=id=>{const e=document.getElementById('ff_'+id);return e?(e.type==='checkbox'?e.checked:e.value):'';};
    const dfr=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d||'');return m?m[3]+'/'+m[2]+'/'+m[1]:'';};
    const X=14,W=182,CV=64,CD=(W-64)/3,CDATE=CD-14,CRECU=14;
    let y=pdfLogo(doc,20);
    doc.setFontSize(13.5);doc.setFont(undefined,'bold');doc.setTextColor(74,63,159);
    doc.text('Suivi des vaccinations obligatoires',X+W/2,y,{align:'center'});
    doc.setTextColor(30);y+=8;
    doc.setFontSize(10);doc.setFont(undefined,'normal');
    doc.text("Nom - prénom de l'enfant : "+(g('vac_enfant')||'…………………………'),X,y);
    doc.text('Né(e) le : '+(dfr(g('vac_naissance'))||'……………'),X+124,y);
    y+=5.5;
    if(g('vac_creche')){doc.text('Crèche : '+g('vac_creche'),X,y);y+=5.5;}
    y+=2;
    const entete=()=>{
      doc.setFillColor(238,237,248);doc.setDrawColor(120,120,140);doc.setLineWidth(0.2);
      doc.rect(X,y,W,7,'FD');
      doc.setFontSize(8.5);doc.setFont(undefined,'bold');doc.setTextColor(74,63,159);
      doc.text('Vaccins',X+2,y+4.7);
      for(let i=0;i<3;i++){
        const bx=X+CV+i*CD;
        doc.line(bx,y,bx,y+7);
        doc.text('Date',bx+CDATE/2,y+4.7,{align:'center'});
        doc.line(bx+CDATE,y,bx+CDATE,y+7);
        doc.text('Reçu',bx+CDATE+CRECU/2,y+4.7,{align:'center'});
      }
      doc.setTextColor(30);y+=7;
    };
    entete();
    VAC_DOC.forEach((grp,gi)=>{
      doc.setFontSize(8.4);doc.setFont(undefined,'bold');
      const lab=doc.splitTextToSize(grp.m,CV-4);
      doc.setFontSize(7.6);doc.setFont(undefined,'normal');
      let marq=[];grp.v.forEach(n=>{marq=marq.concat(doc.splitTextToSize(n,CV-4));});
      const h=Math.max(10,2.5+lab.length*3.6+marq.length*3+1.5);
      if(y+h>283){doc.addPage();y=pdfLogo(doc,20);entete();}
      doc.setDrawColor(150,150,165);doc.setLineWidth(0.2);
      doc.rect(X,y,W,h);
      let ly=y+3.7;
      doc.setFontSize(8.4);doc.setFont(undefined,'bold');doc.setTextColor(74,63,159);
      doc.text(lab,X+2,ly);ly+=lab.length*3.6;
      doc.setFontSize(7.6);doc.setFont(undefined,'normal');doc.setTextColor(120,120,140);
      if(marq.length){doc.text(marq,X+2,ly+0.4);}
      doc.setTextColor(30);
      for(let di=0;di<3;di++){
        const bx=X+CV+di*CD;
        doc.line(bx,y,bx,y+h);
        const dd=grp.d[di];
        if(!dd){doc.setFillColor(243,243,246);doc.rect(bx,y,CD,h,'F');doc.line(bx,y,bx,y+h);continue;}
        doc.line(bx+CDATE,y,bx+CDATE,y+h);
        doc.setFontSize(7);doc.setTextColor(120,120,140);
        doc.text(dd.a,bx+CDATE/2,y+4,{align:'center'});
        doc.setTextColor(30);doc.setFontSize(9);
        const dv=dfr(g('vac_'+gi+'_'+di+'_d'));
        if(dv)doc.text(dv,bx+CDATE/2,y+h-2.6,{align:'center'});
        if(g('vac_'+gi+'_'+di+'_r')){
          doc.setFont(undefined,'bold');doc.setTextColor(40,130,90);
          doc.text('X',bx+CDATE+CRECU/2,y+h/2+1.4,{align:'center'});
          doc.setFont(undefined,'normal');doc.setTextColor(30);
        }
      }
      y+=h;
    });
    y+=5;
    const obs=g('vac_obs');
    if(obs){
      const L=doc.splitTextToSize(obs,W-4);
      if(y+L.length*4.4+10>283){doc.addPage();y=pdfLogo(doc,20);}
      doc.setFontSize(9);doc.setFont(undefined,'bold');doc.text('Observations :',X,y);y+=5;
      doc.setFont(undefined,'normal');doc.text(L,X,y);y+=L.length*4.4+4;
    }
    if(y+34>285){doc.addPage();y=pdfLogo(doc,20);}
    doc.setFontSize(9);doc.setFont(undefined,'normal');
    doc.text('Document vérifié par : '+(g('vac_verif_nom')||'……………………')
      +'      Le '+(dfr(g('vac_verif_date'))||'……………'),X,y);
    y+=5;
    doc.setFont(undefined,'bold');doc.text('Signature :',X,y);
    doc.setDrawColor(200);doc.rect(X,y+2,84,24);
    if(SIGS['responsable']){try{doc.addImage(SIGS['responsable'],'PNG',X+2,y+4,80,20);}catch(e){}}
    y+=31;
    doc.setFontSize(8);doc.setFont(undefined,'normal');doc.setTextColor(120,120,140);
    doc.text(VAC_MAJ,X,Math.min(y,290));doc.setTextColor(30);
    pdfSortie(doc,slug(fillDoc.titre)+(g('vac_enfant')?'_'+slug(g('vac_enfant')):'')+'.pdf');
    return true;
  }
 }

};
