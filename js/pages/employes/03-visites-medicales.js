/* ---------- VISITES MÉDICALES OBLIGATOIRES (médecine du travail — Odalia) ----------
   Table employes_visites_medicales (sql/employes_visites_medicales.sql), calcul
   d'échéance dans js/visites-medicales.js. On ne garde que la date, l'avis et
   la prochaine échéance, jamais d'information médicale. */
let VISITES_PAR_EMP={},VISITES_CHARGEES=false;   // employe_id -> visites (pour les badges de la liste)
let vmCache=[],vmEditId='';

async function vmChargerListe(){
  VISITES_PAR_EMP={};VISITES_CHARGEES=false;
  if(!EMPLOYES.length)return;
  const{data,error}=await sb.from('employes_visites_medicales').select('*').in('employe_id',EMPLOYES.map(x=>x.id));
  if(error){console.warn('vmChargerListe',error);return;}   // table pas encore créée : pas de badge
  VISITES_CHARGEES=true;
  (data||[]).forEach(v=>{(VISITES_PAR_EMP[v.employe_id]=VISITES_PAR_EMP[v.employe_id]||[]).push(v);});
  renderListe();
}
const VM_COULEURS={retard:['var(--red)','#FDECEC'],bientot:['var(--orange)','var(--orange-l)'],rdv:['var(--violet)','var(--violet-l)'],ok:['var(--green)','var(--green-bg,#E6F4EA)'],inconnu:['var(--muted)','#F1F0F5']};
function vmBadgeListe(e){
  if(estArchive(e)||estSorti(e)||!VISITES_CHARGEES)return'';
  const s=vismedEtat(e,VISITES_PAR_EMP[e.id]||[]);
  if(s.niveau==='ok'||s.niveau==='inconnu')return'';
  const c=VM_COULEURS[s.niveau];
  return'<span class="badge off" style="background:'+c[1]+';color:'+c[0]+'" title="'+esc(s.label)+'"><i class="ti ti-stethoscope"></i> Visite médicale'+(s.niveau==='retard'?' en retard':(s.niveau==='rdv'?' : RDV':' à planifier'))+'</span>';
}

async function vmCharger(employeId){
  vmEditId='';
  const{data,error}=await sb.from('employes_visites_medicales').select('*').eq('employe_id',employeId)
    .order('date_visite',{ascending:false,nullsFirst:true});
  vmCache=error?[]:(data||[]);
  if(error)console.warn('vmCharger',error);
  if(String(empFicheId)!==String(employeId)){return;}
  vmRendre(error);
}
function vmRendre(erreurTable){
  const zone=document.getElementById('ficheVisitesZone');
  if(!zone)return;
  const e=EMPLOYES.find(x=>String(x.id)===String(empFicheId));
  const s=vismedEtat(e,vmCache);
  const c=VM_COULEURS[s.niveau];
  const bandeau='<div style="background:'+c[1]+';border-left:4px solid '+c[0]+';border-radius:0 10px 10px 0;padding:9px 13px;font-size:12.5px;color:'+c[0]+';font-weight:600;margin-bottom:8px"><i class="ti ti-stethoscope"></i> '+esc(s.label)+'</div>';
  const ligne=v=>{
    const fait=!!v.date_visite;
    return'<div style="border-bottom:1px solid var(--line);padding:8px 2px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">'
      +'<div style="font-size:12.5px"><strong>'+esc(VISMED_TYPES[v.type]||v.type)+'</strong> · '+esc(v.organisme||VISMED_ORGANISME)
      +'<div style="font-size:11.5px;color:var(--muted)">'
      +(fait?'Effectuée le '+vismedDateFr(v.date_visite):'RDV le '+vismedDateFr(v.rdv_le))
      +(v.avis?' · '+esc(VISMED_AVIS[v.avis]):'')
      +(fait&&v.prochaine_le?' · prochaine avant le '+vismedDateFr(v.prochaine_le):'')
      +(v.observations?' · '+esc(v.observations):'')+'</div></div>'
      +'<span style="display:flex;gap:6px">'
      +(v.piece_path?'<button type="button" class="btn btn-g btn-sm" onclick="vmOuvrirPiece(\''+v.id+'\')" title="'+esc(v.piece_nom||'Compte rendu')+'"><i class="ti ti-file-text"></i> Compte rendu</button>':'')
      +'<button type="button" class="btn btn-g btn-sm" onclick="vmModifier(\''+v.id+'\')">'+(fait?'<i class="ti ti-edit"></i>':'<i class="ti ti-check"></i> Renseigner la visite')+'</button>'
      +'<button type="button" onclick="vmSupprimer(\''+v.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px"><i class="ti ti-trash"></i></button>'
      +'</span></div>';
  };
  const st='font-size:12px;padding:6px 8px';
  const edit=vmCache.find(v=>v.id===vmEditId)||{};
  zone.innerHTML=(erreurTable?'<div style="color:var(--red);font-size:12px">Table non disponible : appliquer sql/employes_visites_medicales.sql sur Supabase.</div>':bandeau)
    +(vmCache.length?vmCache.map(ligne).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucune visite enregistrée.</div>')
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;align-items:flex-end">'
    +'<label style="flex:2;min-width:160px;font-size:11px;color:var(--muted)">Type<select id="vmType" style="width:100%;'+st+'">'+Object.keys(VISMED_TYPES).map(k=>'<option value="'+k+'"'+((edit.type||(vmCache.some(v=>v.date_visite)?'periodique':'embauche'))===k?' selected':'')+'>'+esc(VISMED_TYPES[k])+'</option>').join('')+'</select></label>'
    +'<label style="flex:1;min-width:120px;font-size:11px;color:var(--muted)">Date de la visite<input id="vmDate" type="date" value="'+esc(edit.date_visite||'')+'" onchange="vmProposerProchaine()" style="width:100%;'+st+'"></label>'
    +'<label style="flex:1;min-width:120px;font-size:11px;color:var(--muted)">RDV prévu le<input id="vmRdv" type="date" value="'+esc(edit.rdv_le||'')+'" style="width:100%;'+st+'"></label>'
    +'<label style="flex:1;min-width:120px;font-size:11px;color:var(--muted)">Prochaine avant le<input id="vmProchaine" type="date" value="'+esc(edit.prochaine_le||'')+'" style="width:100%;'+st+'"></label>'
    +'<label style="flex:1;min-width:140px;font-size:11px;color:var(--muted)">Avis<select id="vmAvis" style="width:100%;'+st+'"><option value="">—</option>'+Object.keys(VISMED_AVIS).map(k=>'<option value="'+k+'"'+(edit.avis===k?' selected':'')+'>'+esc(VISMED_AVIS[k])+'</option>').join('')+'</select></label>'
    +'<input id="vmObs" placeholder="Observation (facultatif, sans donnée médicale)" value="'+esc(edit.observations||'')+'" style="flex:3;min-width:180px;'+st+'">'
    +'<label style="flex:3;min-width:200px;font-size:11px;color:var(--muted)">Compte rendu d\'Odalia (PDF ou photo)'+(edit.piece_path?' — déjà joint : '+esc(edit.piece_nom||'fichier')+', un nouveau fichier le remplace':'')+'<input id="vmFichier" type="file" accept=".pdf,image/*" style="width:100%;'+st+'"></label>'
    +'<button type="button" class="btn btn-s btn-sm" onclick="vmEnregistrer()"><i class="ti ti-'+(vmEditId?'device-floppy':'plus')+'"></i> '+(vmEditId?'Enregistrer':'Ajouter')+'</button>'
    +(vmEditId?'<button type="button" class="btn btn-g btn-sm" onclick="vmEditId=\'\';vmRendre()">Annuler</button>':'')
    +'</div>';
}
function vmProposerProchaine(){
  const d=val('vmDate'),p=document.getElementById('vmProchaine');
  if(d&&p&&!p.value)p.value=vismedAjout(d,VISMED_PERIODE_ANS);
}
function vmModifier(id){vmEditId=id;vmRendre();const el=document.getElementById('vmDate');if(el)el.focus();}
async function vmEnregistrer(){
  const eid=empFicheId;
  const date=val('vmDate')||null,rdv=val('vmRdv')||null;
  if(!date&&!rdv){toast('Renseignez la date de la visite ou la date du RDV.',true);return;}
  const row={
    employe_id:eid,type:val('vmType')||'periodique',organisme:VISMED_ORGANISME,
    date_visite:date,rdv_le:date?null:rdv,
    prochaine_le:date?(val('vmProchaine')||vismedAjout(date,VISMED_PERIODE_ANS)):null,
    avis:date?(val('vmAvis')||null):null,observations:val('vmObs')||null
  };
  const fichier=(document.getElementById('vmFichier')||{}).files&&document.getElementById('vmFichier').files[0];
  const ancien=vmEditId?vmCache.find(v=>v.id===vmEditId):null;
  let nouveauChemin=null;
  if(fichier){
    const ext=(fichier.name.split('.').pop()||'bin').toLowerCase();
    nouveauChemin=eid+'/visites-medicales/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
    const{error:upErr}=await sb.storage.from(EMP_DOCS_BUCKET).upload(nouveauChemin,fichier);
    if(upErr){toast('Envoi du fichier impossible : '+upErr.message,true);return;}
    row.piece_bucket=EMP_DOCS_BUCKET;row.piece_path=nouveauChemin;row.piece_nom=fichier.name;
  }
  const{error}=vmEditId
    ?await sb.from('employes_visites_medicales').update(row).eq('id',vmEditId)
    :await sb.from('employes_visites_medicales').insert(row);
  if(error){
    if(nouveauChemin)sb.storage.from(EMP_DOCS_BUCKET).remove([nouveauChemin]);
    toast('Enregistrement impossible : '+error.message,true);return;
  }
  if(nouveauChemin&&ancien&&ancien.piece_path)sb.storage.from(ancien.piece_bucket||EMP_DOCS_BUCKET).remove([ancien.piece_path]);
  toast('Visite médicale enregistrée.');
  await vmCharger(eid);
  VISITES_PAR_EMP[eid]=vmCache;renderListe();
}
async function vmSupprimer(id){
  if(!confirm('Supprimer cette visite du suivi (et son compte rendu joint) ?'))return;
  const v=vmCache.find(x=>x.id===id);
  const{error}=await sb.from('employes_visites_medicales').delete().eq('id',id);
  if(error){toast('Suppression impossible : '+error.message,true);return;}
  if(v&&v.piece_path)sb.storage.from(v.piece_bucket||EMP_DOCS_BUCKET).remove([v.piece_path]);
  await vmCharger(empFicheId);
  VISITES_PAR_EMP[empFicheId]=vmCache;renderListe();
}
async function vmOuvrirPiece(id){
  const v=vmCache.find(x=>x.id===id);
  if(!v||!v.piece_path){toast('Fichier introuvable.',true);return;}
  if(typeof kkJournaliserAcces==='function')kkJournaliserAcces(v.piece_bucket||EMP_DOCS_BUCKET,v.piece_path,{entite_type:'employe',entite_id:v.employe_id,libelle:v.piece_nom||'Compte rendu de visite médicale'});
  const{data,error}=await sb.storage.from(v.piece_bucket||EMP_DOCS_BUCKET).createSignedUrl(v.piece_path,EMP_DOCS_TTL);
  if(error||!data){toast('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'),true);return;}
  window.open(data.signedUrl,'_blank','noopener');
}
