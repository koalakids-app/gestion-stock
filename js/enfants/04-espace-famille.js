/* ===== Espace famille (fiche enfant › Parents) ==============================
   Un accès par parent : code à 8 caractères (ou lien) pour espace-famille.html,
   où la famille lit les informations de la crèche et dépose des documents.
   Table famille_acces (sql/espace_famille.sql) ; la page publique passe par l'edge
   function `espace-famille`. Un accès révoqué n'est jamais supprimé. */
let enfEspaceCache = [];   // accès de l'enfant ouvert (actifs et révoqués)
let enfEspaceEnfant = null; // enfant auquel appartient le cache

function espaceLien(a){
  return location.origin + location.pathname.replace(/[^/]*$/,'') + 'espace-famille.html?t=' + a.code;
}
function espacePageUrl(){
  return location.origin + location.pathname.replace(/[^/]*$/,'') + 'espace-famille.html';
}

async function enfEspaceCharger(enfantId){
  enfEspaceEnfant=enfantId;
  try{
    const{data,error}=await sb.from('famille_acces').select('*').eq('enfant_id',enfantId).order('created_at',{ascending:false});
    if(error) throw error;
    enfEspaceCache=data||[];
  }catch(err){
    console.warn('enfEspaceCharger',err);
    enfEspaceCache=[];
  }
  if(String(enfFicheId)!==String(enfantId)) return;
  enfEspaceRender();
}

function enfEspaceRender(){
  const parent=document.getElementById('enf-fiche-parents');
  if(!parent) return;
  let box=document.getElementById('enf-espace-box');
  if(!box){ box=document.createElement('div'); box.id='enf-espace-box'; parent.appendChild(box); }
  if(!enfParentsCache.length){ box.innerHTML=''; return; }
  const lignes=enfParentsCache.map(p=>{
    const a=enfEspaceCache.find(x=>x.parent_id===p.id && x.actif);
    const nom=escHtml(enfNomParent(p));
    if(!a) return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--border)">'
      +'<span style="font-size:13px">'+nom+'</span>'
      +'<button class="btn-sm" onclick="enfEspaceCreer(\''+p.id+'\')"><i class="ti ti-key"></i> Créer l\'accès</button></div>';
    const vu=a.derniere_connexion?'dernière visite le '+new Date(a.derniere_connexion).toLocaleDateString('fr-FR'):'pas encore connecté';
    return '<div style="padding:8px 0;border-top:1px solid var(--border)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'
      +'<span style="font-size:13px">'+nom+' <small style="color:var(--muted)">· '+vu+'</small></span>'
      +'<span style="font-family:monospace;font-weight:700;letter-spacing:.15em;background:var(--koala-light);color:var(--koala-dark);border-radius:8px;padding:3px 10px">'+escHtml(a.code)+'</span></div>'
      +'<div style="font-size:11.5px;margin-top:6px;word-break:break-all"><a href="'+escHtml(espaceLien(a))+'" target="_blank" rel="noopener" style="color:var(--koala)">'+escHtml(espaceLien(a))+'</a></div>'
      +'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px">'
      +'<button class="btn-sm" onclick="enfEspaceCopier(\''+a.id+'\')"><i class="ti ti-link"></i> Copier le lien</button>'
      +(PartageLien.disponible()?'<button class="btn-sm" onclick="enfEspacePartager(\''+a.id+'\')"><i class="ti ti-share"></i> Partager…</button>':'')
      +'<button class="btn-sm" style="color:var(--red);border-color:var(--red)" onclick="enfEspaceRevoquer(\''+a.id+'\')"><i class="ti ti-ban"></i> Révoquer</button></div></div>';
  }).join('');
  box.innerHTML='<div style="background:var(--koala-light);border:1px solid var(--border);border-radius:12px;padding:13px 15px;margin-top:12px">'
    +'<div style="font-weight:700;font-size:13.5px;color:var(--koala-dark);margin-bottom:4px"><i class="ti ti-home-heart"></i> Espace famille</div>'
    +'<p style="font-size:12.5px;color:var(--muted);margin:0 0 6px;line-height:1.6">Chaque parent a son code personnel : il lit vos informations et peut déposer des documents sur <strong>espace-famille.html</strong>. Le lien contient déjà le code.</p>'
    +lignes
    +'<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:10px"><button class="btn-sm" onclick="openMsgFamilles(\''+enfEspaceEnfant+'\')"><i class="ti ti-message-2"></i> Envoyer un message aux parents</button>'
    +'<div style="font-size:11.5px;color:var(--muted);margin-top:5px">Lu dans l\'Espace famille (onglet Infos) avec une notification ; reçu par les parents de cet enfant qui ont un accès actif.</div></div></div>';
}

async function enfEspaceCreer(parentId){
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e) return;
  const saved=await dbInsert('famille_acces',{enfant_id:e.id,creche_id:e.creche_id,parent_id:parentId,cree_par:currentProfile?currentProfile.id:null});
  if(!saved) return showBanner('Création impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  enfEspaceCache.unshift(saved);
  enfEspaceRender();
  showBanner('Accès créé : code '+saved.code+'.');
}

function enfEspaceCopier(id){
  const a=enfEspaceCache.find(x=>x.id===id); if(!a) return;
  const url=espaceLien(a);
  navigator.clipboard.writeText(url).then(()=>{showBanner('Lien copié — à transmettre à la famille.');alert('Lien copié :\n'+url);},()=>prompt('Copiez ce lien :',url));
}

function enfEspacePartager(id){
  const a=enfEspaceCache.find(x=>x.id===id); if(!a) return;
  PartageLien.partager(espaceLien(a),{titre:'Espace famille',
    texte:'Bonjour, voici votre espace famille Koala Kids (informations de la crèche et dépôt de documents). Votre code personnel : '+a.code+'.'})
    .then(r=>{if(r==='copie')showBanner('Partage indisponible — lien copié.');});
}

async function enfEspaceRevoquer(id){
  const a=enfEspaceCache.find(x=>x.id===id); if(!a) return;
  if(!confirm('Révoquer cet accès ?\n\nLe code et le lien cesseront immédiatement de fonctionner. Vous pourrez en créer un nouveau ensuite.')) return;
  const maj={actif:false,revoque_le:new Date().toISOString()};
  const ok=await dbUpdate('famille_acces',id,maj);
  if(!ok) return showBanner('Révocation impossible.','error');
  Object.assign(a,maj);
  enfEspaceRender();
  showBanner('Accès révoqué.');
}

/* Les parents sont (re)dessinés par enfRenderParents : on y raccroche l'encadré. */
(function(){
  const rendreParents=window.enfRenderParents;
  window.enfRenderParents=function(){
    rendreParents.apply(this,arguments);
    if(enfFicheId && String(enfEspaceEnfant)!==String(enfFicheId)){ enfEspaceCache=[]; enfEspaceCharger(enfFicheId); }
    else enfEspaceRender();
  };
})();

window.enfEspaceCreer=enfEspaceCreer;
window.enfEspaceCopier=enfEspaceCopier;
window.enfEspacePartager=enfEspacePartager;
window.enfEspaceRevoquer=enfEspaceRevoquer;
