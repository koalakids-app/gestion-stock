/* Collaborateurs/trices — fiche unique dans Demandes (ex-module « Équipe »).
   Onglets ajoutés à la fiche : Documents, Formation, Suivi, Compte (compte Mon espace, accès terrain,
   archivage). Les fonctions qu'ils appellent sont dans 23-collaborateurs-equipe.js. */
let ACCES_TERRAIN=new Set();
/* user_id des comptes réellement activés (au moins une connexion). null tant que la fonction n'a pas
   répondu : on n'affiche alors pas de statut trompeur. */
let COMPTES_ACTIFS=null;
let EQ_VOIR_ARCHIVES=false;

async function eqChargerStatuts(){
  ACCES_TERRAIN=new Set();
  const ids=cacheEmployes.map(x=>x.id);
  if(ids.length){
    try{
      const{data}=await sb.from('referents').select('employe_id').in('employe_id',ids);
      (data||[]).forEach(r=>ACCES_TERRAIN.add(r.employe_id));
    }catch(e){console.warn('eqChargerStatuts referents',e);}
  }
  COMPTES_ACTIFS=null;
  const creches=[...new Set(cacheEmployes.filter(x=>x.user_id).map(x=>x.creche_id).filter(Boolean))];
  if(!creches.length)return;
  const actifs=new Set();
  for(const cid of creches){
    const{ok,data}=await eqCallFn('statut-comptes-collaborateurs',{creche_id:cid});
    if(!ok||!Array.isArray(data.actifs))return;   // échec silencieux : pas de statut plutôt qu'un statut faux
    data.actifs.forEach(u=>actifs.add(u));
  }
  COMPTES_ACTIFS=actifs;
}
/* Ouverture de l'onglet Collaborateurs/trices : statuts de compte et visites médicales (badges des cartes). */
async function eqInitOnglet(){
  await eqChargerStatuts();
  renderEmployes();
  vmChargerListe();
}
function eqBasculerArchives(){
  EQ_VOIR_ARCHIVES=!EQ_VOIR_ARCHIVES;
  const b=document.getElementById('emp-archives-toggle');
  if(b){b.style.borderColor=EQ_VOIR_ARCHIVES?'var(--orange)':'';b.style.color=EQ_VOIR_ARCHIVES?'var(--orange)':'';}
  renderEmployes();
}
/* Badges d'une carte : archivé/sorti, compte, accès terrain, visite médicale. */
function eqBadgesCarte(e){
  const statut=estArchive(e)
    ?'<span class="badge off" style="background:var(--violet-l);color:var(--violet)">Archivé</span>'
    :(estSorti(e)?'<span class="badge off" style="background:var(--orange-l);color:var(--orange)">Sorti</span>':'');
  const compte=!e.user_id
    ?'<span class="badge off">Pas de compte</span>'
    :(estArchive(e)
      ?'<span class="badge off" style="color:var(--red)"><i class="ti ti-lock"></i> Compte bloqué</span>'
      :(COMPTES_ACTIFS&&!COMPTES_ACTIFS.has(e.user_id)
        ?'<span class="badge off" style="background:var(--orange-l);color:var(--orange)"><i class="ti ti-mail"></i> Invitation envoyée</span>'
        :'<span class="badge on"><i class="ti ti-lock-open"></i> Compte actif</span>'));
  const terrain=ACCES_TERRAIN.has(e.id)?'<span class="badge on"><i class="ti ti-walk"></i> Accès terrain</span>':'';
  return'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">'+statut+compte+terrain+vmBadgeListe(e)+'</div>';
}
/* Onglet « Compte » : compte Mon espace, accès terrain, archivage. */
function eqRenderCompte(e){
  const box=document.getElementById('emp-compte-box');
  if(!box)return;
  const invitationEnAttente=e.user_id&&!estArchive(e)&&COMPTES_ACTIFS&&!COMPTES_ACTIFS.has(e.user_id);
  const mailOk=!!e.email;
  const nonMail=mailOk?'':' disabled title="Renseignez un e-mail (onglet Identité) avant de continuer"';
  const partage=PartageLien.disponible();
  const btnCompte=e.user_id
    ?(invitationEnAttente&&partage
      ?'<button type="button" class="btn btn-g btn-sm" onclick="renvoyerInvitation(\''+e.id+'\')" title="Générer un nouveau lien de connexion à partager"><i class="ti ti-share"></i> Renvoyer le lien</button>':'')
    :'<button type="button" class="btn btn-s btn-sm" onclick="creerCompte(\''+e.id+'\')"'+nonMail+'><i class="ti ti-mail-forward"></i> Créer le compte</button>'
      +(partage?' <button type="button" class="btn btn-g btn-sm" onclick="creerCompte(\''+e.id+'\',true)"'+nonMail+'><i class="ti ti-share"></i> Partager…</button>':'');
  const btnTerrain=ACCES_TERRAIN.has(e.id)?'':'<button type="button" class="btn btn-g btn-sm" onclick="accorderAccesTerrain(\''+e.id+'\')"'+nonMail+'><i class="ti ti-walk"></i> Accès terrain</button>'
    +(partage?' <button type="button" class="btn btn-g btn-sm" onclick="accorderAccesTerrain(\''+e.id+'\',true)"'+nonMail+'><i class="ti ti-share"></i> Partager l\'accès terrain</button>':'');
  box.innerHTML=eqBadgesCarte(e)
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">'+(btnCompte||'')+(btnTerrain||'')+'</div>'
    +((btnCompte||btnTerrain)?'':'<p class="hint" style="margin-top:8px">Rien à faire : le compte'+(ACCES_TERRAIN.has(e.id)?' et l\'accès terrain sont':' est')+' en place.</p>');
}
/* Les onglets liés à une fiche déjà enregistrée n'existent pas à la création. */
function eqOngletsEdition(edition){
  ['docs','form','suivi','compte'].forEach(p=>{const b=document.querySelector('#emp-onglets [data-pane="'+p+'"]');if(b)b.hidden=!edition;});
}
function eqOuvrirFiche(e){
  EQ_CRECHE_FICHE=e.creche_id;
  eqOngletsEdition(true);
  document.getElementById('ficheFormationWrap').style.display='';loadFicheFormation(e);
  empDocsCache=[];empPiecesCache=[];empPiecesPret=false;
  document.getElementById('fiche-docs-dossier-box').innerHTML='';
  empLoadDocs(e.id);empLoadPieces(e.id);
  loadFicheHeures(e);
  renderArchivageBox(e);
  document.getElementById('ficheVisitesZone').innerHTML='';
  empFicheId=e.id;vmCharger(e.id);
  empDocExtCache=[];document.getElementById('ficheDocExtZone').innerHTML='';empLoadDocExt(e.id);
  eqRenderCompte(e);
}
function eqNouvelleFiche(){EQ_CRECHE_FICHE=null;eqOngletsEdition(false);}
