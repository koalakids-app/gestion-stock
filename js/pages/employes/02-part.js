async function empAnnulerPieces(id){
  const d=empPiecesCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Annuler ce dossier ?\n\nLe lien déjà envoyé cessera immédiatement de fonctionner. Les pièces déjà déposées sont conservées.'))return;
  const{error}=await sb.from('dossiers_pieces_employe').update({statut:'annule'}).eq('id',id);
  if(error){toast('Annulation impossible : '+error.message,true);return;}
  d.statut='annule';
  empRenderPiecesDossier();
  toast('Dossier annulé — le lien ne fonctionne plus.');
}

/* ---------- DOCUMENTS SUR SUPPORT EXTERNE (registre papier/coffre-fort) ----------
   Table documents_externes (voir sql/documents_externes.sql) : ne stocke
   aucun fichier, juste la trace qu'une pièce existe et où elle est
   physiquement conservée — utile pour les pièces qu'on ne numérise pas (ex.
   extrait de casier judiciaire, à ne pas conserver après vérification). Le
   délai de conservation est calculé côté base, selon la catégorie choisie.
   Même module que côté enfant (js/enfants.js), adapté au style de cette page. */
const DOC_EXT_SUPPORTS={papier:'Papier','coffre-fort':'Coffre-fort',classeur:'Classeur',autre:'Autre'};
const DOC_EXT_CATEGORIES={identite:'Identité',sante:'Santé',comptable:'Comptable',rh:'RH',autre:'Autre'};

let empDocExtCache=[];
async function empLoadDocExt(employeId){
  try{
    const{data,error}=await sb.from('documents_externes')
      .select('*')
      .eq('entite_type','employe')
      .eq('entite_id',employeId)
      .order('created_at',{ascending:false});
    if(error)throw error;
    empDocExtCache=data||[];
  }catch(err){
    console.warn('empLoadDocExt',err);
    empDocExtCache=[];
  }
  if(String(empFicheId)!==String(employeId))return;
  empRenderDocExt();
}
function empRenderDocExt(){
  const zone=document.getElementById('ficheDocExtZone');
  if(!zone)return;
  const ligne=d=>{
    const detruit=d.detruit_le
      ?'<span style="background:var(--violet-l);color:var(--violet);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Détruit le '+new Date(d.detruit_le).toLocaleDateString('fr-FR')+'</span>'
      :'<button type="button" class="btn btn-g btn-sm" onclick="empDocExtDetruire(\''+d.id+'\')" title="Marquer cette pièce comme détruite/restituée"><i class="ti ti-flame"></i> Marquer détruit</button>';
    return '<div style="border-bottom:1px solid var(--line);padding:9px 2px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<div>'
      +'<span style="font-size:12.5px;font-weight:600;color:#2B2740">'+esc(d.libelle)+'</span> '
      +'<span style="font-size:11px;color:var(--muted)">'+(DOC_EXT_SUPPORTS[d.support]||d.support)+' · '+(DOC_EXT_CATEGORIES[d.categorie]||d.categorie)+(d.lieu_conservation?' · '+esc(d.lieu_conservation):'')+'</span>'
      +(d.date_destruction_prevue&&!d.detruit_le?'<div style="font-size:11px;color:var(--muted)">Conservation jusqu\'au '+new Date(d.date_destruction_prevue).toLocaleDateString('fr-FR')+'</div>':'')
      +'</div>'
      +'<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+detruit
      +'<button onclick="empDocExtDelete(\''+d.id+'\')" title="Supprimer cette entrée du registre" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px"><i class="ti ti-trash"></i></button>'
      +'</span></div></div>';
  };
  zone.innerHTML=
      (empDocExtCache.length
        ? empDocExtCache.map(ligne).join('')
        : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucune pièce enregistrée sur support externe.</div>')
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">'
      + '<input id="docExtLibelle" placeholder="Libellé (ex. extrait de casier judiciaire)" style="flex:2;min-width:180px;font-size:12px;padding:6px 8px">'
      + '<select id="docExtSupport" style="flex:1;min-width:110px;font-size:12px;padding:6px 8px">'
        + Object.keys(DOC_EXT_SUPPORTS).map(k=>'<option value="'+k+'">'+DOC_EXT_SUPPORTS[k]+'</option>').join('')
      + '</select>'
      + '<select id="docExtCategorie" style="flex:1;min-width:110px;font-size:12px;padding:6px 8px">'
        + Object.keys(DOC_EXT_CATEGORIES).map(k=>'<option value="'+k+'">'+DOC_EXT_CATEGORIES[k]+'</option>').join('')
      + '</select>'
      + '<input id="docExtLieu" placeholder="Lieu de conservation (ex. classeur RH, tiroir 2)" style="flex:2;min-width:180px;font-size:12px;padding:6px 8px">'
      + '<button type="button" class="btn btn-s btn-sm" onclick="empDocExtAdd()"><i class="ti ti-plus"></i> Ajouter</button>'
    + '</div>';
}
async function empDocExtAdd(){
  const eid=empFicheId;
  const libelle=(document.getElementById('docExtLibelle').value||'').trim();
  if(!libelle){document.getElementById('docExtLibelle').focus();return;}
  const row={
    entite_type:'employe',
    entite_id:eid,
    libelle,
    support:document.getElementById('docExtSupport').value||'papier',
    categorie:document.getElementById('docExtCategorie').value||'autre',
    lieu_conservation:(document.getElementById('docExtLieu').value||'').trim()||null,
    created_by:ME?ME.id:null
  };
  const{data,error}=await sb.from('documents_externes').insert(row).select().single();
  if(error){toast('Erreur lors de l\'ajout : '+error.message,true);return;}
  empDocExtCache.unshift(data);
  empRenderDocExt();
  toast('Pièce ajoutée au registre.');
}
async function empDocExtDetruire(id){
  if(!confirm('Marquer cette pièce comme détruite / restituée aujourd\'hui ?'))return;
  const row={detruit_le:todayISO(),detruit_par:ME?ME.id:null};
  const{error}=await sb.from('documents_externes').update(row).eq('id',id);
  if(error){toast('Erreur : '+error.message,true);return;}
  const d=empDocExtCache.find(x=>String(x.id)===String(id));
  if(d)Object.assign(d,row);
  empRenderDocExt();
  toast('Pièce marquée détruite.');
}
async function empDocExtDelete(id){
  if(!confirm('Supprimer cette entrée du registre ? (la pièce physique elle-même n\'est pas concernée, seule la trace ici disparaît)'))return;
  const{error}=await sb.from('documents_externes').delete().eq('id',id);
  if(error){toast('Erreur : '+error.message,true);return;}
  empDocExtCache=empDocExtCache.filter(x=>String(x.id)!==String(id));
  empRenderDocExt();
  toast('Entrée supprimée.');
}

boot();
