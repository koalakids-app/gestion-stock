
function icpRenderRevue(){
  const box=document.getElementById('icp-revue');
  const opts=(sel)=>{
    let h='<option value="">— Ne pas importer —</option>';
    cacheEnfants.slice().sort((a,b)=>(a.prenom||'').localeCompare(b.prenom||'','fr')).forEach(e=>{
      const cre=cacheCreches.find(c=>String(c.id)===String(e.creche_id));
      h+='<option value="'+e.id+'"'+(String(sel)===String(e.id)?' selected':'')+'>'
        +escHtml(((e.prenom||'')+' '+(e.nom||'')).trim())
        +(cre?' — '+escHtml(cre.name):'')+'</option>';
    });
    return h;
  };

  box.innerHTML=ICP_BLOCS.map((b,i)=>{
    const alerte=b.deja
      ? '<span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">Déjà renseigné — laissé de côté</span>'
      : (!b.enfantId
          ? '<span style="background:#FDEBD8;color:#B25F00;border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">'
            +(b.candidats.length>1?'Plusieurs fiches possibles':'Aucune fiche trouvée')+'</span>'
          : '');

    const lignes=b.personnes.map((p,j)=>{
      const id='icp_'+i+'_'+j+'_';
      const sel=(v)=>['mere','pere','tuteur','autre'].map(o=>'<option value="'+o+'"'+(v===o?' selected':'')
        +'>'+({mere:'Mère',pere:'Père',tuteur:'Tuteur / tutrice',autre:'Responsable légal'})[o]+'</option>').join('');
      return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">'
        +'<input type="checkbox" id="'+id+'ok"'+(p.coche?' checked':'')+'>'
        +'<select class="finput" id="'+id+'lien" style="width:auto;font-size:12px;padding:4px 6px">'+sel(p.lien)+'</select>'
        +'<input class="finput" id="'+id+'prenom" value="'+escHtml(p.prenom||'')+'" placeholder="Prénom" style="width:120px;font-size:12px;padding:4px 6px">'
        +'<input class="finput" id="'+id+'nom" value="'+escHtml(p.nom||'')+'" placeholder="Nom" style="width:150px;font-size:12px;padding:4px 6px">'
        +'<input class="finput" id="'+id+'tel" value="'+escHtml(p.telephone||'')+'" placeholder="Téléphone" style="width:120px;font-size:12px;padding:4px 6px">'
        +'<input class="finput" id="'+id+'mail" value="'+escHtml(p.email||'')+'" placeholder="e-mail" style="flex:1;min-width:190px;font-size:12px;padding:4px 6px">'
        +'</div>';
    }).join('');

    /* Le PDF ne dit jamais qui est la mère et qui est le père, et l'ordre des
       deux parents change d'une ligne à l'autre : aucune règle automatique ne
       tiendrait. Ces deux boutons remplissent les rôles dans un sens ou dans
       l'autre en un clic — c'est le seul raccourci honnête. */
    const raccourci = b.personnes.length===2
      ? '<span style="display:flex;gap:5px;align-items:center;margin-left:auto">'
        +'<span style="font-size:11px;color:var(--muted)">Rôles :</span>'
        +'<button type="button" class="btn-sm" style="font-size:11px;padding:3px 8px" onclick="icpOrdre('+i+',\'mp\')">Mère puis Père</button>'
        +'<button type="button" class="btn-sm" style="font-size:11px;padding:3px 8px" onclick="icpOrdre('+i+',\'pm\')">Père puis Mère</button>'
        +'</span>'
      : '';

    return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:10px'
      +(b.deja?';opacity:.65':'')+'">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
      +'<strong style="color:var(--koala-dark);font-size:13.5px">'+escHtml(b.enfant)+'</strong>'
      +'<i class="ti ti-arrow-right" style="color:var(--muted)"></i>'
      +'<select class="finput" id="icp_'+i+'_enfant" onchange="icpMajBloc('+i+')" style="width:auto;min-width:210px;font-size:12px;padding:4px 6px">'
      +opts(b.enfantId)+'</select>'+alerte+raccourci+'</div>'
      +(lignes||'<div style="font-size:12px;color:var(--muted)">Aucun parent lisible sur cette ligne.</div>')
      +'</div>';
  }).join('');

  box.style.display='';
  document.getElementById('icp-etape-fichier').style.display='none';
  document.getElementById('icp-btn-import').style.display='';
  const aImporter=ICP_BLOCS.filter(b=>b.enfantId&&!b.deja).length;
  document.getElementById('icp-resume').innerHTML=
    ICP_BLOCS.length+' enfant(s) lus dans le PDF · '+aImporter+' prêt(s) à être importés. '
    +'Vérifiez chaque ligne : le PDF ne dit pas qui est la mère et qui est le père.';
}

/* Attribue les deux rôles dans l'ordre indiqué, sans toucher au reste de la
   saisie déjà corrigée à l'écran. */
function icpOrdre(i,sens){
  icpCollecter();
  const roles = sens==='pm' ? ['pere','mere'] : ['mere','pere'];
  ICP_BLOCS[i].personnes.forEach((p,j)=>{ if(j<2) p.lien=roles[j]; });
  icpRenderRevue();
}

async function icpImporter(){
  icpCollecter();
  const btn=document.getElementById('icp-btn-import');
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader"></i> Import…';
  let crees=0, echecs=0;
  const ignores=[];

  for(let i=0;i<ICP_BLOCS.length;i++){
    const b=ICP_BLOCS[i];
    if(!b.enfantId){ ignores.push(b.enfant+' : aucune fiche choisie'); continue; }
    if(b.deja){ ignores.push(b.enfant+' : parents déjà enregistrés'); continue; }
    let n=0;
    for(let j=0;j<b.personnes.length;j++){
      const p=b.personnes[j];
      if(!p.coche) continue;
      if(!p.prenom && !p.nom) continue;
      const saved=await dbInsert('enfants_parents',{
        enfant_id:b.enfantId,
        lien:p.lien||'autre',
        prenom:p.prenom||'', nom:p.nom||'',
        telephone:p.telephone||'',
        email:p.email||'',
        destinataire:!!p.email      // sans adresse, rien ne peut lui être envoyé
      });
      if(saved){ crees++; n++; } else echecs++;
    }
    if(!n) ignores.push(b.enfant+' : aucune ligne cochée');
  }

  /* Bouton neutralisé : relancer l'import créerait les mêmes parents en double. */
  btn.innerHTML='<i class="ti ti-check"></i> Import terminé';
  document.getElementById('icp-resume').innerHTML=
    '<strong>'+crees+' parent(s) créé(s).</strong>'
    +(echecs?' <span style="color:var(--red)">'+echecs+' échec(s) d\'enregistrement.</span>':'')
    +(ignores.length?'<br>Laissés de côté : '+escHtml(ignores.join(' · ')):'');
  showBanner(crees+' parent(s) importé(s) ✅');

  /* La fiche ouverte, si elle fait partie du lot, doit refléter l'import. */
  if(enfFicheId) enfLoadParents(enfFicheId);
}

/* ================= DOSSIER DE FAMILIARISATION (envoi aux familles) ========= */
/* Table `dossiers_familles` : un envoi = un jeton = un lien famille.
   Le lien ouvre famille.html, qui ne touche à aucune table directement mais
   passe par l'edge function `dossier-famille`. Ici on se contente de créer la
   ligne (sous RLS, donc par quelqu'un qui en a le droit) et de demander
   l'envoi du mail. */

let enfDossiersCache = [];      // dossiers de l'enfant ouvert, plus récent d'abord
let enfDossierPret = false;     // les dossiers sont-ils chargés ? (évite d'afficher
                                 // un état faux tant que la requête n'est pas revenue)

const DOSSIER_JOURS = 15;

function dossierLien(token){
  return location.origin + location.pathname.replace(/[^/]*$/,'') + 'famille.html?t=' + token;
}

function dossierToken(){
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,32);
}

async function enfLoadDossier(enfantId){
  try{
    const{data,error}=await sb.from('dossiers_familles')
      .select('*')
      .eq('enfant_id',enfantId)
      .order('envoye_le',{ascending:false});
    if(error) throw error;
    enfDossiersCache = data||[];
  }catch(err){
    console.warn('enfLoadDossier',err);
    enfDossiersCache = [];
  }
  await chargerPack();
  if(String(enfFicheId)!==String(enfantId)) return;
  enfDossierPret = true;
  enfRenderDossier();
  /* La zone Fiche sanitaire (section Documents sanitaires) dépend elle aussi
     de cachePack (chargé ci-dessus) : la redessiner ici couvre le cas où
     enfLoadAdminDocs() a déjà rendu une première fois sans cachePack. */
  enfRenderFicheSanitaireZone();
}

/* Les destinataires possibles : tout parent avec une adresse mail. Ceux qui
   sont cochés « destinataire » dans l'onglet Parents sont présélectionnés,
   mais on peut ajouter ou retirer une adresse au moment de l'envoi. */
function enfDestinataires(){
  return enfParentsCache.filter(p=>(p.email||'').trim());
}
function enfDestinatairesParDefaut(){
  const avecEmail=enfDestinataires();
  const coches=avecEmail.filter(p=>p.destinataire!==false);
  return coches.length?coches:avecEmail;
}
function enfNomParent(p){
  return ((p.prenom||'')+' '+(p.nom||'')).trim()||p.email;
}

function enfRenderDossier(){
  const box=document.getElementById('enf-dossier-box');
  if(!box)return;
  /* Tant que les dossiers ne sont pas revenus, on n'affiche rien : dessiner ici
     annoncerait « aucun dossier » pour un enfant qui en a un. */
  if(!enfDossierPret){ box.innerHTML=''; return; }
  const actif=enfDossiersCache.find(d=>d.statut!=='annule' && new Date(d.expire_le)>new Date());
  const possibles=enfDestinataires();
  const enf=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));

  if(!actif){
    /* Pas de lien actif — toutes les familles ne sont pas encore équipées de
       l'appli : l'import manuel (voir enfEnLigneHtml) reste possible même
       sans avoir envoyé de lien. */
    const intro=!possibles.length
      ? '<p style="background:#FFF8F0;border:1px solid #F3DEC2;border-radius:8px;padding:8px 10px;font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.6">'
        +'Aucun parent avec une adresse e-mail. Renseignez-en un dans l\'onglet '
        +'<strong>Parents</strong> pour pouvoir envoyer le dossier.</p>'
      : '<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.6">'
        +'Envoie aux parents un lien personnel vers les documents à remplir et signer en ligne. '
        +'Valable '+DOSSIER_JOURS+' jours.</p>'
        +'<button class="btn-primary" onclick="enfOuvrirEnvoi()"><i class="ti ti-send"></i> Envoyer le dossier</button>';
    box.innerHTML=intro+enfEnLigneHtml(enf)+enfAutresSanteHtml();
    return;
  }

  const attendusDocs=packEnLigne(enf);
  const attendus=attendusDocs.length;
  const rendus=enfDocsCache.filter(d=>d.dossier_id===actif.id&&d.statut==='signe').length;
  const badge=actif.statut==='complet'
    ? '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">✅ Complet</span>'
    : '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">🕓 En attente</span>';
  const adresses=(actif.email||'').split(',').map(x=>x.trim()).filter(Boolean);

  box.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'+badge
    +'<span style="font-size:12px;color:var(--muted)">envoyé le '+new Date(actif.envoye_le).toLocaleDateString('fr-FR')
    +' · expire le '+new Date(actif.expire_le).toLocaleDateString('fr-FR')
    +(actif.relances?' · '+actif.relances+' relance'+(actif.relances>1?'s':''):'')+'</span></div>'
    +'<div style="font-size:12px;color:var(--muted);margin-bottom:9px">'
    +'<i class="ti ti-mail"></i> '+escHtml(adresses.join(' · '))+'</div>'
    +(attendus?'<div style="font-size:12.5px;color:var(--muted);margin-bottom:9px">'
      +rendus+' document'+(rendus>1?'s':'')+' signé'+(rendus>1?'s':'')+' sur '+attendus+' attendus en ligne</div>':'')
    +enfPapierHtml(enf)
    +'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px">'
    +'<button class="btn-sm" onclick="enfCopierLien(\''+actif.id+'\')"><i class="ti ti-link"></i> Copier le lien</button>'
    +(PartageLien.disponible()?'<button class="btn-sm" onclick="enfPartagerLien(\''+actif.id+'\')"><i class="ti ti-share"></i> Partager…</button>':'')
    +'<button class="btn-sm" onclick="enfRelancerDossier(\''+actif.id+'\')"><i class="ti ti-bell"></i> Relancer</button>'
    +'<button class="btn-sm" style="color:var(--red);border-color:var(--red)" onclick="enfAnnulerDossier(\''+actif.id+'\')"><i class="ti ti-x"></i> Annuler</button>'
    +'</div>'
    +enfEnLigneHtml(enf)
    +enfAutresSanteHtml();
}

/* Le pack complet, chargé une fois par session. Deux sous-ensembles :
   ce qui se remplit en ligne (barre d'avancement) et ce qui se rapporte en
   papier (suivi manuel de réception). */
let cachePack=null;
async function chargerPack(){
  if(cachePack)return cachePack;
  const{data}=await sb.from('documents_koala')
    .select('id,titre,creche_id,type,pack_imprimer,pack_ordre')
    .eq('actif',true).eq('pack_familiarisation',true)
    .order('pack_ordre');
  cachePack=data||[];
  return cachePack;
}
function packEnLigne(e){
  return (cachePack||[]).filter(d=>d.type==='remplissable'&&!d.pack_imprimer
    &&(!d.creche_id||String(d.creche_id)===String(e&&e.creche_id)));
}
function packPapier(e){
  return (cachePack||[]).filter(d=>d.pack_imprimer
    &&(!d.creche_id||String(d.creche_id)===String(e&&e.creche_id)));
}
/* La fiche sanitaire est une donnée de santé : elle vit dans la section
   Documents sanitaires plutôt qu'avec le reste du dossier de familiarisation
   « à rapporter en papier » (ex. autorisation droit à l'image). Repérée par
   son template_key quand le document utilise le modèle prédéfini du même
   nom (voir documents.html, registre TPL), ou par son titre sinon — dans la
   pratique, une « Fiche sanitaire » est le plus souvent configurée en type
   « À télécharger » (PDF vierge à faire remplir par le médecin), sans
   template_key du tout. */
function estFicheSanitaire(d){
  return d.template_key==='fiche_sanitaire' || /fiche\s+sanitaire/i.test(d.titre||'');
}
function packPapierSanitaire(e){
  return packPapier(e).filter(estFicheSanitaire);
}
function packPapierAdmin(e){
  return packPapier(e).filter(d=>!estFicheSanitaire(d));
}

/* Une ligne pour un document « à rapporter en papier » : case à cocher pour
   le suivi de réception (déclaratif, sans fichier), et un import du scan/
   de la photo une fois le papier rendu. Les deux sont indépendants —
   importer un fichier coche automatiquement la case (voir
   enfHandleAdminDocUpload), mais cocher sans importer reste possible pour
   qui n'a pas de scanner sous la main. */
function enfPapierDocRowHtml(d){
  const recu=enfDocsCache.find(r=>r.document_id===d.id&&r.statut==='remis');
  const fichiers=enfPiecesPourCle('papier_'+d.id);
  const listeFichiers=fichiers.length ? '<div style="margin:4px 0 0 26px">'+fichiers.map(f=>
    '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
    +'<i class="ti ti-paperclip" style="color:var(--koala);flex-shrink:0;font-size:13px"></i>'
    +'<button type="button" onclick="enfAdminDocOpen(\''+f.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(f.filename||'Document')+'</button>'
    +'<button onclick="enfAdminDocDelete(\''+f.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:13px;flex-shrink:0"><i class="ti ti-trash"></i></button>'
    +'</div>'
  ).join('')+'</div>' : '';
  return '<div style="padding:4px 0">'
    +'<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px">'
    +'<input type="checkbox"'+(recu?' checked':'')
    +' onchange="enfMarquerRecu(\''+d.id+'\',this.checked,this)">'
    +'<span style="flex:1">'+escHtml(d.titre)+' — '
    +(recu
      ? '<span style="color:var(--green);font-weight:700">reçu en main propre</span>'
      : '<span style="color:var(--orange);font-weight:700">non rendu</span>')
    +'</span>'
    +'<button type="button" onclick="enfOpenPieceUpload(\'papier_'+d.id+'\')" title="Importer le document rendu" style="border:1px solid var(--border);background:#fff;border-radius:7px;padding:3px 8px;font-size:11px;cursor:pointer;color:var(--koala);display:inline-flex;align-items:center;gap:4px;flex-shrink:0"><i class="ti ti-upload"></i> Importer</button>'
    +'</label>'
    +listeFichiers
    +'</div>';
}

function enfPapierHtml(e){
  const papier=packPapierAdmin(e);
  if(!papier.length)return '';
  return '<div style="border-top:1px solid var(--border);margin:10px 0 9px;padding-top:9px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:6px">'
    +'À rapporter en papier</div>'
    + papier.map(enfPapierDocRowHtml).join('')
    +'</div>';
}

/* Une ligne pour un document normalement rempli/signé en ligne par la famille
   (packEnLigne) : statut réel (signé en ligne / importé manuellement / non
   reçu) + bouton d'import. Toutes les familles n'ont pas encore l'appli —
   ce bouton permet de rattacher le scan/la photo du document rempli à la
   main, sans dépendre de l'envoi ni de l'usage du lien famille.html. Même
   mécanique que enfPapierDocRowHtml (bucket documents-admin, table
   enfants_documents_admin), avec le préfixe piece_key 'enligne_' — voir
   enfHandleAdminDocUpload, qui marque alors le document « remis ». */
function enfEnLigneDocRowHtml(d){
  const rep=enfDocsCache.find(r=>r.document_id===d.id&&(r.statut==='signe'||r.statut==='remis'));
  const fichiers=enfPiecesPourCle('enligne_'+d.id);
  const listeFichiers=fichiers.length ? '<div style="margin:4px 0 0 0">'+fichiers.map(f=>
    '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
    +'<i class="ti ti-paperclip" style="color:var(--koala);flex-shrink:0;font-size:13px"></i>'
    +'<button type="button" onclick="enfAdminDocOpen(\''+f.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(f.filename||'Document')+'</button>'
    +'<button onclick="enfAdminDocDelete(\''+f.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:13px;flex-shrink:0"><i class="ti ti-trash"></i></button>'
    +'</div>'
  ).join('')+'</div>' : '';
  let statutTxt;
  if(rep&&rep.statut==='signe') statutTxt='<span style="color:var(--green);font-weight:700">signé en ligne</span>';
  else if(rep&&rep.statut==='remis') statutTxt='<span style="color:var(--green);font-weight:700">importé manuellement</span>';
  else statutTxt='<span style="color:var(--orange);font-weight:700">non reçu</span>';
  return '<div style="padding:4px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    +'<span style="flex:1;font-size:12.5px">'+escHtml(d.titre)+' — '+statutTxt+'</span>'
    +'<button type="button" onclick="enfOpenPieceUpload(\'enligne_'+d.id+'\')" title="Importer le document rempli, si le lien n\'a pas été utilisé" style="border:1px solid var(--border);background:#fff;border-radius:7px;padding:3px 8px;font-size:11px;cursor:pointer;color:var(--koala);display:inline-flex;align-items:center;gap:4px;flex-shrink:0"><i class="ti ti-upload"></i> Importer</button>'
    +listeFichiers
    +'</div>';
}

function enfEnLigneHtml(e){
  const docs=packEnLigne(e);
  if(!docs.length)return '';
  return '<div style="border-top:1px solid var(--border);margin:10px 0 9px;padding-top:9px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:2px">'
    +'Documents à remplir en ligne</div>'
    +'<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Si une famille n\'utilise pas encore l\'appli, importez ici la version papier du document une fois rempli.</div>'
    + docs.map(enfEnLigneDocRowHtml).join('')
    +'</div>';
}

/* Documents sanitaires hors liste : tout ce que le médecin fournit sans que
   ce soit un document Koala configuré (ordonnance d'aptitude, certificat,
   protocole ponctuel...). Même mécanique que « Autres documents importés »
   du dossier administratif (piece_key null), mais avec une clé dédiée pour
   rester dans la section santé plutôt que dans le dossier administratif —
   voir enfRenderAdminDocs. */
const SANTE_AUTRE_KEY='sante_autre';
function enfAutresSanteHtml(){
  const fichiers=enfPiecesPourCle(SANTE_AUTRE_KEY);
  const listeFichiers=fichiers.length ? '<div style="margin:6px 0 0 0">'+fichiers.map(f=>
    '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
    +'<i class="ti ti-paperclip" style="color:var(--koala);flex-shrink:0;font-size:13px"></i>'
    +'<button type="button" onclick="enfAdminDocOpen(\''+f.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(f.filename||'Document')+'</button>'
    +'<span style="font-size:11px;color:var(--muted);white-space:nowrap">'+new Date(f.created_at).toLocaleDateString('fr-FR')+'</span>'
    +'<button onclick="enfAdminDocDelete(\''+f.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:13px;flex-shrink:0"><i class="ti ti-trash"></i></button>'
    +'</div>'
  ).join('')+'</div>' : '';
  return '<div style="border-top:1px solid var(--border);margin:10px 0 9px;padding-top:9px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:2px">'
    +'Autres documents sanitaires</div>'
    +'<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Ordonnance d\'aptitude, certificat ponctuel... tout document du médecin sans case dédiée.</div>'
    + listeFichiers
    +'<button type="button" class="btn-sm" onclick="enfOpenPieceUpload(\''+SANTE_AUTRE_KEY+'\')" style="margin-top:'+(fichiers.length?'6px':'0')+'"><i class="ti ti-upload"></i> Importer un document hors liste</button>'
    +'</div>';
}

/* Section Documents sanitaires : même case à cocher + import que les autres
   documents « à rapporter en papier », mais pour la seule fiche sanitaire —
   voir packPapierSanitaire. */
function enfRenderFicheSanitaireZone(){
  const zone=document.getElementById('enf-fiche-sanitaire-zone');
  if(!zone) return;
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  const docs=packPapierSanitaire(e);
  if(!docs.length){
    zone.innerHTML='<div style="font-size:12px;color:var(--muted)">Aucun document configuré (voir l\'outil Documents, type « À télécharger »).</div>';
    return;
  }
  zone.innerHTML=docs.map(enfPapierDocRowHtml).join('');
}

/* Lien direct vers la synthèse du jour de cet enfant dans suivi.html — mode
   ordinateur, pas le lien tablette (?k=) qui suit le token de l'appareil. */
function enfRenderSuiviZone(enfantId){
  const zone=document.getElementById('enf-suivi-zone');
  if(!zone) return;
  zone.innerHTML='<a class="btn" href="suivi.html?enfant='+encodeURIComponent(enfantId)+'" target="_blank" rel="noopener" '
    +'style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">'
    +'<i class="ti ti-heart-handshake"></i> Ouvrir la synthèse du jour</a>';
}

async function enfMarquerRecu(docId,recu,input){
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e)return;
  input.disabled=true;
  const existant=enfDocsCache.find(r=>r.document_id===docId&&r.statut==='remis');
  let message=null, erreur=false;
  if(recu&&!existant){
    const actif=enfDossiersCache.find(d=>d.statut!=='annule');
    const saved=await dbInsert('documents_reponses',{
      document_id:docId, enfant_id:e.id, creche_id:e.creche_id,
      dossier_id:actif?actif.id:null,
      statut:'remis', donnees:{}, rempli_par:currentUser?currentUser.id:null,
      rempli_par_nom:(currentProfile&&currentProfile.name)||'Crèche'
    });
    if(saved){enfDocsCache.unshift(saved);message='Document noté comme reçu ✅';}
    else{message='Enregistrement impossible'+(window._lastDbError?' : '+window._lastDbError:'.');erreur=true;}
  }else if(!recu&&existant){
    const ok=await dbDelete('documents_reponses',existant.id);
    if(ok){enfDocsCache=enfDocsCache.filter(r=>String(r.id)!==String(existant.id));message='Document repassé en « non rendu ».';}
    else{message='Modification impossible.';erreur=true;}
  }
  input.disabled=false;
  /* Toujours redessiner, y compris en cas d'échec : la case a été cochée par
     le navigateur dès le clic, indépendamment de notre code — sans ce
     rafraîchissement elle resterait affichée cochée alors que rien n'a été
     enregistré. */
  enfRenderDossier();
  enfRenderFicheSanitaireZone();
  enfRenderDocs();
  if(message)showBanner(message,erreur?'error':undefined);
}

/* Variante silencieuse en cas de succès (pas de bannière « reçu ✅ » en plus
   de celle de l'import) : utilisée quand l'import d'un scan vaut de facto
   confirmation de réception (voir enfHandleAdminDocUpload). N'écrase rien si
   déjà marqué reçu. Renvoie false en cas d'échec, pour que l'appelant
   prévienne l'utilisateur — un import qui « prend » sans marquer le document
   reçu serait sinon indétectable. */
async function enfMarquerRecuSilencieux(docId){
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e)return true;
  if(enfDocsCache.find(r=>r.document_id===docId&&r.statut==='remis'))return true;
  const actif=enfDossiersCache.find(d=>d.statut!=='annule');
  const saved=await dbInsert('documents_reponses',{
    document_id:docId, enfant_id:e.id, creche_id:e.creche_id,
    dossier_id:actif?actif.id:null,
    statut:'remis', donnees:{}, rempli_par:currentUser?currentUser.id:null,
    rempli_par_nom:(currentProfile&&currentProfile.name)||'Crèche'
  });
  if(saved){enfDocsCache.unshift(saved);return true;}
  console.warn('[enfMarquerRecuSilencieux]',window._lastDbError);
  return false;
}

function enfOuvrirEnvoi(){
  const possibles=enfDestinataires();
  if(!possibles.length)return showBanner('Aucun parent avec une adresse e-mail.','error');
  const defaut=new Set(enfDestinatairesParDefaut().map(p=>p.id));
  document.getElementById('envoi-liste').innerHTML=possibles.map(p=>
    '<label style="display:flex;align-items:flex-start;gap:9px;padding:9px 2px;border-bottom:1px solid var(--border);cursor:pointer">'
    +'<input type="checkbox" class="envoi-dest" value="'+escHtml(p.email)+'"'+(defaut.has(p.id)?' checked':'')+' style="margin-top:3px">'
    +'<span><span style="font-weight:700;font-size:13px">'+escHtml(enfNomParent(p))+'</span>'
    +'<span style="display:block;font-size:12px;color:var(--muted)">'+escHtml(p.email)
    +(p.lien&&PAR_LIENS[p.lien]?' · '+escHtml(PAR_LIENS[p.lien]):'')+'</span></span></label>'
  ).join('');
  document.getElementById('envoi-vide').style.display='none';
  document.getElementById('envoi-btn').disabled=false;
  document.getElementById('modal-envoi-wrap').classList.add('open');
}

async function enfConfirmerEnvoi(){
  const emails=[...document.querySelectorAll('.envoi-dest:checked')].map(c=>c.value);
  const err=document.getElementById('envoi-vide');
  if(!emails.length){
    err.textContent='Cochez au moins une adresse.';err.style.display='block';return;
  }
  const e=cacheEnfants.find(x=>String(x.id)===String(enfFicheId));
  if(!e)return;
  await chargerPack();
  if(!cachePack.length&&!confirm('Aucun document n\'est coché « Dossier de familiarisation » dans l\'outil Documents.\n\nEnvoyer quand même ?'))return;

  const btn=document.getElementById('envoi-btn');btn.disabled=true;
  showBanner('Envoi en cours…');
  const token=dossierToken();
  const expire=new Date(Date.now()+DOSSIER_JOURS*86400000).toISOString();
  const saved=await dbInsert('dossiers_familles',{
    enfant_id:e.id,token,email:emails.join(', '),statut:'envoye',
    expire_le:expire,created_by:currentUser?currentUser.id:null
  });
  if(!saved){btn.disabled=false;return showBanner('Impossible de créer le dossier.','error');}

  /* La fonction ne reçoit qu'un identifiant : elle relit elle-même les adresses,
     l'enfant et l'échéance en base, et compose le lien depuis APP_URL. Rien
     d'expédiable ne transite par le navigateur. */
  const ok=await callFn('envoyer-dossier-famille',{dossier_id:saved.id,relance:false,expediteur:currentProfile?.name});
  enfDossiersCache.unshift(saved);
  closeModal('modal-envoi-wrap');
  enfRenderDossier();
  if(ok)showBanner('Dossier envoyé à '+emails.length+' adresse'+(emails.length>1?'s':'')+' ✅');
  else showBanner('Dossier créé, mais l\'e-mail n\'est pas parti — utilisez « Copier le lien ».','error');
}

async function enfRelancerDossier(id){
  const d=enfDossiersCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Renvoyer le lien à '+d.email+' ?'))return;
  showBanner('Relance en cours…');
  const ok=await callFn('envoyer-dossier-famille',{dossier_id:d.id,relance:true,expediteur:currentProfile?.name});
  if(!ok)return showBanner('La relance n\'est pas partie.','error');
  /* Le compteur est incrémenté par la fonction, une fois l'envoi accepté :
     on se contente de relire. */
  d.relances=(d.relances||0)+1;
  enfRenderDossier();
  showBanner('Relance envoyée ✅');
}

function enfCopierLien(id){
  const d=enfDossiersCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  const url=dossierLien(d.token);
  navigator.clipboard.writeText(url).then(
    ()=>showBanner('Lien copié — à transmettre par SMS si besoin.'),
    ()=>prompt('Copiez ce lien :',url)
  );
}

function enfPartagerLien(id){
  const d=enfDossiersCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  PartageLien.partager(dossierLien(d.token),{titre:"Dossier d'inscription",
    texte:'Bonjour, voici le lien pour compléter le dossier de votre enfant :'})
    .then(r=>{if(r==='copie')showBanner('Partage indisponible — lien copié.');});
}

async function enfAnnulerDossier(id){
  const d=enfDossiersCache.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm('Annuler ce dossier ?\n\nLe lien déjà envoyé cessera immédiatement de fonctionner. Les documents déjà rendus par la famille sont conservés.'))return;
  const ok=await dbUpdate('dossiers_familles',d.id,{statut:'annule'});
  if(!ok)return showBanner('Annulation impossible.','error');
  d.statut='annule';
  enfRenderDossier();
  showBanner('Dossier annulé — le lien ne fonctionne plus.');
}

window.enfLoadDossier = enfLoadDossier;
window.enfOuvrirEnvoi = enfOuvrirEnvoi;
window.enfConfirmerEnvoi = enfConfirmerEnvoi;
window.enfRelancerDossier = enfRelancerDossier;
window.enfCopierLien = enfCopierLien;
window.enfMarquerRecu = enfMarquerRecu;
window.enfAnnulerDossier = enfAnnulerDossier;

window.enfLoadParents = enfLoadParents;
window.openParentModal = openParentModal;
window.editParent = editParent;
window.saveParent = saveParent;
window.deleteParent = deleteParent;

let enfDocTitres = {};  // documentId -> titre

async function enfLoadDocs(enfantId){
  const box = document.getElementById('enf-docs-list');
  try{
    const{data,error}=await sb.from('documents_reponses')
      .select('id,document_id,statut,rempli_par_nom,updated_at,created_at,dossier_id')
      .eq('enfant_id',enfantId)
      .order('updated_at',{ascending:false});
    if(error) throw error;
    enfDocsCache = data||[];
    // charger les titres des documents concernés (une seule requête)
    const ids = [...new Set(enfDocsCache.map(d=>d.document_id).filter(Boolean))]
      .filter(id=>!(id in enfDocTitres));
    if(ids.length){
      const{data:docs}=await sb.from('documents_koala').select('id,titre').in('id',ids);
      (docs||[]).forEach(d=>{enfDocTitres[d.id]=d.titre;});
    }
  }catch(err){
    console.warn('enfLoadDocs',err);
    if(box) box.innerHTML='<div class="empty-state"><i class="ti ti-alert-triangle"></i><p>Impossible de charger les documents.</p></div>';
    return;
  }
  // ne rendre que si on est toujours sur le même enfant
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderDocs();
}

function enfDocTitre(docId){
  return enfDocTitres[docId] || 'Document rempli';
}

function enfRenderDocs(){
  const box = document.getElementById('enf-docs-list');
  if(!box) return;
  if(!enfDocsCache.length){
    box.innerHTML='<div class="empty-state"><i class="ti ti-file-off"></i><p>Aucun document rattaché à cet enfant pour le moment.</p></div>';
    return;
  }
  const statutBadge = st => st==='signe'
    ? '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✅ Signé</span>'
    : (st==='remis'
      ? '<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">📥 Reçu en main propre</span>'
      : '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">🕓 Préparé</span>');
  box.innerHTML = enfDocsCache.map(d=>{
    const dt = new Date(d.updated_at||d.created_at).toLocaleDateString('fr-FR');
    const titre = escHtml(enfDocTitre(d.document_id));
    const href = 'documents.html?doc='+encodeURIComponent(d.document_id)+'&rep='+encodeURIComponent(d.id)+'&enf='+encodeURIComponent(enfFicheId);
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">'
      + '<div style="min-width:0">'
      + '<div style="font-weight:700;color:var(--koala-dark);font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+titre+'</div>'
      + '<div style="font-size:11.5px;color:var(--muted)">'+dt+(d.rempli_par_nom?' · '+escHtml(d.rempli_par_nom):'')+'</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">'
      + statutBadge(d.statut)
      + '<a href="'+href+'" class="btn-primary" style="text-decoration:none;padding:6px 12px;font-size:12px"><i class="ti ti-signature"></i> Ouvrir / signer</a>'
      + '<button type="button" onclick="enfDeleteDoc(\''+d.id+'\')" title="Supprimer ce document" style="background:var(--red-light,#FDE8E8);color:var(--red);border:none;border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;min-height:36px"><i class="ti ti-trash" style="pointer-events:none"></i><span style="pointer-events:none">Suppr.</span></button>'
      + '</div>'
      + '</div>';
  }).join('');
  // note d'aide sous la liste
  box.innerHTML += '<p style="font-size:11.5px;color:var(--muted);margin-top:6px">« Ouvrir / signer » bascule vers l\u2019outil Documents : on y remplit, génère le PDF et fait signer. Un bouton « Revenir aux documents de l\u2019enfant » ramène ensuite ici pour enchaîner les signatures.</p>';
}

async function enfDeleteDoc(repId){
  showBanner('Suppression du document…');   // retour visuel immédiat (confirme l'appel)
  const d=enfDocsCache.find(x=>String(x.id)===String(repId));
  const titre=d?enfDocTitre(d.document_id):'Document';
  if(!confirm('Supprimer définitivement ce document ?\n\n« '+titre+' »\n\nCette action est irréversible.')){
    showBanner('Suppression annulée.');
    return;
  }
  try{
    const{error}=await sb.from('documents_reponses').delete().eq('id',repId);
    if(error) throw error;
    // retirer de la liste locale et re-render
    enfDocsCache = enfDocsCache.filter(x=>String(x.id)!==String(repId));
    enfRenderDocs();
    showBanner('Document supprimé.');
  }catch(err){
    console.warn('enfDeleteDoc',err);
    showBanner('Suppression impossible : '+((err&&err.message)||'droits insuffisants'),'error');
  }
}

/* ===== Documents administratifs importés (fiche enfant) =====================
   Pièces d'un enfant, distinctes des formulaires remplis/signés via l'outil
   Documents (enf-docs-list) et du carnet de vaccination (table vaccins_pj,
   données de santé). Deux façons d'en obtenir une copie :
   - une directrice technique l'importe directement (remise en main propre, pièce jointe
     reçue par mail) ;
   - la famille la dépose elle-même en ligne, via un lien envoyé par mail
     (voir plus bas « dossier de pièces »), sur le même principe que le
     dossier de familiarisation.
   Les deux passent par la même table et le même bucket : seule la colonne
   piece_key (quelle pièce de la liste ci-dessous) et dossier_id (par quel
   envoi la famille l'a déposée, absent pour un import fait par une directrice technique)
   distinguent leur origine.

   Même schéma de stockage que les photocopies du carnet de vaccination : bucket
   PRIVÉ, aucune URL publique enregistrée — seuls bucket et chemin sont gardés en
   base, une URL signée est générée à chaque ouverture. */
const ENF_ADMIN_DOCS_BUCKET = 'documents-admin';
const ENF_ADMIN_DOCS_TTL    = 300;   // durée de vie d'une URL signée, en secondes

/* Liste figée des pièces demandées à l'inscription. `optionnel` = ne compte
   pas dans la progression (ne concerne que certaines familles). `renouveler`
   = à redéposer chaque année (assurance) ; un exemplaire déposé il y a plus
   de 365 jours est signalé mais ne compte pas comme manquant pour autant —
   la directrice technique juge si un rappel est nécessaire.
   Recopiée dans pieces.html pour la vue famille : si vous modifiez cette
   liste ici, reportez-la là-bas — les deux versions ne se synchronisent pas
   (même choix assumé que pour les modèles de famille.html/documents.html). */
const PIECES_ADMIN = [
  {key:'livret_famille',        label:'Copie du livret de famille'},
  {key:'piece_identite_parents',label:"Copie de la pièce d'identité des parents"},
  {key:'justificatif_domicile', label:'Justificatif de domicile de moins de trois mois'},
  {key:'acte_naissance',        label:"Copie intégrale de l'acte de naissance de l'enfant"},
  {key:'attestation_vitale',    label:'Attestation de la carte vitale'},
  {key:'attestation_rc',        label:'Attestation de responsabilité civile pour l’année en cours',renouveler:true},
  {key:'autorite_parentale',    label:"Justificatif de l'autorité parentale (couples séparés/divorcés)",optionnel:true},
  {key:'avis_imposition',       label:"Copie du dernier avis d'imposition"},
  {key:'bulletin_salaire',      label:'Dernier bulletin de salaire ou attestation Pôle Emploi'},
  {key:'rib',                   label:"Relevé d'identité bancaire"}
];

let enfAdminDocsCache = [];
async function enfLoadAdminDocs(enfantId){
  try{
    const{data,error}=await sb.from('enfants_documents_admin')
      .select('*')
      .eq('enfant_id',enfantId)
      .order('created_at',{ascending:false});
    if(error) throw error;
    enfAdminDocsCache = data||[];
  }catch(err){
    console.warn('enfLoadAdminDocs',err);
    enfAdminDocsCache = [];
  }
  // ne rendre que si on est toujours sur le même enfant
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderAdminDocs();
  /* Ces zones affichent aussi des fichiers de enfAdminDocsCache
     (piece_key='papier_<id>' ou le compteur de pièces reçues) : à redessiner
     si elles ont déjà rendu sans ce cache (course entre requêtes, même
     logique que pour les parents). */
  enfRenderDossier();
  enfRenderFicheSanitaireZone();
  enfRenderPiecesDossier();
}

/* Fichiers déposés pour une pièce donnée, le plus récent d'abord (le cache
   est déjà trié ainsi par enfLoadAdminDocs). */
function enfPiecesPourCle(key){
  return enfAdminDocsCache.filter(d=>d.piece_key===key);
}

const UN_AN_MS = 365*86400000;

function enfRenderAdminDocs(){
  const zone=document.getElementById('enf-admin-docs-zone');
  if(!zone) return;

  const ligneFichier=d=>
    '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
    +'<i class="ti ti-paperclip" style="color:var(--koala);flex-shrink:0"></i>'
    +'<button type="button" onclick="enfAdminDocOpen(\''+d.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(d.filename||'Document')+'</button>'
    +'<span style="font-size:11px;color:var(--muted);white-space:nowrap">'+new Date(d.created_at).toLocaleDateString('fr-FR')+'</span>'
    +'<button onclick="enfAdminDocDelete(\''+d.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px;flex-shrink:0"><i class="ti ti-trash"></i></button>'
    +'</div>';

  const checklist=PIECES_ADMIN.map(p=>{
    const fichiers=enfPiecesPourCle(p.key);
    const dernier=fichiers[0];
    let badge;
    if(!dernier){
      badge=p.optionnel
        ? '<span style="background:var(--koala-light);color:var(--muted);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">— Non concerné / à voir</span>'
        : '<span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">⚠ Manquant</span>';
    }else{
      const perime=p.renouveler && (Date.now()-new Date(dernier.created_at).getTime())>UN_AN_MS;
      badge='<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">✅ Reçu le '+new Date(dernier.created_at).toLocaleDateString('fr-FR')+'</span>'
        +(perime?' <span style="background:var(--orange-light,#FDEBD8);color:var(--orange);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">🔄 À renouveler</span>':'');
    }
    return '<div style="border-bottom:1px solid var(--border);padding:9px 2px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<span style="font-size:12.5px;font-weight:600;color:var(--koala-dark)">'+escHtml(p.label)+'</span>'
      +'<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+badge
      +'<button type="button" onclick="enfOpenPieceUpload(\''+p.key+'\')" title="Importer" style="border:1px solid var(--border);background:#fff;border-radius:7px;padding:4px 9px;font-size:11.5px;cursor:pointer;color:var(--koala);display:inline-flex;align-items:center;gap:4px"><i class="ti ti-upload"></i> Importer</button>'
      +'</span></div>'
      +(fichiers.length?'<div style="margin-top:4px">'+fichiers.map(ligneFichier).join('')+'</div>':'')
      +'</div>';
  }).join('');

  const autres=enfAdminDocsCache.filter(d=>!d.piece_key);
  const autresHtml='<div style="margin-top:14px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:6px">Autres documents importés</div>'
    +(autres.length?autres.map(ligneFichier).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucun autre document.</div>')
    +'<button class="btn-sm" style="margin-top:6px" onclick="enfOpenPieceUpload(\'\')"><i class="ti ti-upload"></i> Importer un document hors liste</button>'
    +'</div>';

  zone.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--koala-dark);margin-bottom:2px">Pièces demandées à l\'inscription</div>'
    + checklist + autresHtml
    +'<span id="enf-admin-docs-input-status" style="display:block;margin-top:8px;font-size:12px;color:var(--muted)"></span>'
    +'<input type="file" id="enf-admin-docs-input" accept="image/*,application/pdf" multiple style="display:none" onchange="enfHandleAdminDocUpload(event)"/>';
}

/* La pièce ciblée est mémorisée ici le temps du choix de fichier : un seul
   input caché sert toutes les lignes de la checklist plutôt que d'en dupliquer
   un par pièce. */
let enfPieceKeyEnCours='';
function enfOpenPieceUpload(key){
  enfPieceKeyEnCours=key||'';
  const input=document.getElementById('enf-admin-docs-input');
  if(input)input.click();
}

async function enfHandleAdminDocUpload(event){
  const input=event.target;
  const files=Array.from(input.files||[]);
  if(!files.length) return;
  const eid=enfFicheId;
  const pieceKey=enfPieceKeyEnCours||null;
  const status=document.getElementById('enf-admin-docs-input-status');
  let recuKo=false;
  for(const file of files){
    if(status) status.textContent='⏳ Envoi de '+file.name+'…';
    try{
      const ext=(file.name.split('.').pop()||'bin');
      const path=eid+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
      /* Client authentifie et non le client anonyme : le bucket est prive et
         ses policies exigent un compte referent. */
      const{error}=await sb.storage.from(ENF_ADMIN_DOCS_BUCKET).upload(path,file);
      if(error) throw error;
      const{data:ins,error:insErr}=await sb.from('enfants_documents_admin')
        .insert({enfant_id:eid,bucket:ENF_ADMIN_DOCS_BUCKET,path:path,filename:file.name,piece_key:pieceKey}).select().single();
      if(insErr) throw insErr;
      if(ins) enfAdminDocsCache.unshift(ins);
      enfRenderAdminDocs();
      /* Un document « à rapporter en papier » (droit à l'image, fiche
         sanitaire...) dont on importe le scan : l'import vaut confirmation
         de réception, pas besoin de cocher la case à part. Même principe
         pour un document normalement rempli en ligne (packEnLigne) : la
         famille n'a pas encore l'appli, on importe la version papier à sa
         place — l'import vaut « remis », sans attendre le lien. */
      if(pieceKey && (pieceKey.startsWith('papier_')||pieceKey.startsWith('enligne_'))){
        const prefixe=pieceKey.startsWith('papier_')?'papier_':'enligne_';
        const ok=await enfMarquerRecuSilencieux(pieceKey.slice(prefixe.length));
        if(!ok)recuKo=true;
        enfRenderDossier();
        enfRenderFicheSanitaireZone();
        enfRenderDocs();
      }else if(pieceKey===SANTE_AUTRE_KEY){
        /* Document sanitaire hors liste (ordonnance d'aptitude, certificat...) :
           rien à marquer « remis », juste à afficher dans la section santé. */
        enfRenderDossier();
      }
    }catch(e){
      console.error('[enfAdminDocs]',e.message);
      if(status) status.textContent='⚠ Erreur : '+e.message;
      return;
    }
  }
  if(status) status.textContent='✅ Ajouté';
  input.value='';
  if(recuKo)showBanner('Document importé, mais le marquage « reçu » a échoué'+(window._lastDbError?' : '+window._lastDbError:'.'),'error');
  else showBanner('Document(s) importé(s) ✅');
}

async function enfAdminDocOpen(id){
  const d=enfAdminDocsCache.find(x=>String(x.id)===String(id));
  if(!d){alert('Fichier introuvable.');return;}
  const{data,error}=await sb.storage.from(d.bucket||ENF_ADMIN_DOCS_BUCKET).createSignedUrl(d.path,ENF_ADMIN_DOCS_TTL);
  if(error||!data){alert('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'));return;}
  window.open(data.signedUrl,'_blank','noopener');
}

async function enfAdminDocDelete(id){
  if(!confirm('Supprimer ce document ?')) return;
  const d=enfAdminDocsCache.find(x=>String(x.id)===String(id));
  const{error}=await sb.from('enfants_documents_admin').delete().eq('id',id);
  if(error){alert('Erreur : '+error.message);return;}
  /* Le fichier lui-meme est retire du stockage : sans cela il resterait
     indefiniment dans le bucket, hors de toute fiche. */
  if(d){
    const{error:rmErr}=await sb.storage.from(d.bucket||ENF_ADMIN_DOCS_BUCKET).remove([d.path]);
    if(rmErr) console.warn('[enfAdminDocs] fichier non supprime du stockage',rmErr.message);
  }
  enfAdminDocsCache=enfAdminDocsCache.filter(x=>String(x.id)!==String(id));
  enfRenderAdminDocs();
  if(d&&d.piece_key&&(d.piece_key.startsWith('papier_')||d.piece_key.startsWith('enligne_')||d.piece_key===SANTE_AUTRE_KEY)){
    enfRenderDossier();
    enfRenderFicheSanitaireZone();
  }
  showBanner('Document supprimé.');
}
window.enfAdminDocOpen = enfAdminDocOpen;
window.enfAdminDocDelete = enfAdminDocDelete;
window.enfHandleAdminDocUpload = enfHandleAdminDocUpload;
window.enfOpenPieceUpload = enfOpenPieceUpload;

/* ===== DOCUMENTS SUR SUPPORT EXTERNE (registre papier/coffre-fort) =========
   Table documents_externes (voir sql/documents_externes.sql) : ne stocke
   aucun fichier, juste la trace qu'une pièce existe et où elle est
   physiquement conservée — utile pour les pièces qu'on ne numérise pas (ex.
   extrait de casier judiciaire, à ne pas conserver après vérification). Le
   délai de conservation est calculé côté base, selon la catégorie choisie. */
const ENF_DOC_EXT_SUPPORTS = {papier:'Papier','coffre-fort':'Coffre-fort',classeur:'Classeur',autre:'Autre'};
const ENF_DOC_EXT_CATEGORIES = {identite:'Identité',sante:'Santé',comptable:'Comptable',rh:'RH',autre:'Autre'};

let enfDocExtCache = [];
async function enfLoadDocExt(enfantId){
  try{
    const{data,error}=await sb.from('documents_externes')
      .select('*')
      .eq('entite_type','enfant')
      .eq('entite_id',enfantId)
      .order('created_at',{ascending:false});
    if(error) throw error;
    enfDocExtCache = data||[];
  }catch(err){
    console.warn('enfLoadDocExt',err);
    enfDocExtCache = [];
  }
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderDocExt();
}

function enfRenderDocExt(){
  const zone=document.getElementById('enf-doc-ext-zone');
  if(!zone) return;
  const ligne=d=>{
    const detruit = d.detruit_le
      ? '<span style="background:var(--koala-light);color:var(--koala);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">Détruit le '+new Date(d.detruit_le).toLocaleDateString('fr-FR')+'</span>'
      : '<button class="btn-sm" onclick="enfDocExtDetruire(\''+d.id+'\')" title="Marquer cette pièce comme détruite/restituée" style="font-size:11px;padding:3px 8px"><i class="ti ti-flame"></i> Marquer détruit</button>';
    return '<div style="border-bottom:1px solid var(--border);padding:9px 2px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<div>'
      +'<span style="font-size:12.5px;font-weight:600;color:var(--koala-dark)">'+escHtml(d.libelle)+'</span> '
      +'<span style="font-size:11px;color:var(--muted)">'+(ENF_DOC_EXT_SUPPORTS[d.support]||d.support)+' · '+(ENF_DOC_EXT_CATEGORIES[d.categorie]||d.categorie)+(d.lieu_conservation?' · '+escHtml(d.lieu_conservation):'')+'</span>'
      +(d.date_destruction_prevue&&!d.detruit_le?'<div style="font-size:11px;color:var(--muted)">Conservation jusqu\'au '+new Date(d.date_destruction_prevue).toLocaleDateString('fr-FR')+'</div>':'')
      +(d.notes?'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+escHtml(d.notes)+'</div>':'')
      +'</div>'
      +'<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+detruit
      +'<button onclick="enfDocExtDelete(\''+d.id+'\')" title="Supprimer cette entrée du registre" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px"><i class="ti ti-trash"></i></button>'
      +'</span></div></div>';
  };
  zone.innerHTML =
      (enfDocExtCache.length
        ? enfDocExtCache.map(ligne).join('')
        : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Aucune pièce enregistrée sur support externe.</div>')
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">'
      + '<input class="finput" id="enf-doc-ext-libelle" placeholder="Libellé (ex. extrait de casier judiciaire)" style="flex:2;min-width:180px;font-size:12px;padding:5px 8px">'
      + '<select class="finput" id="enf-doc-ext-support" style="flex:1;min-width:110px;font-size:12px;padding:5px 8px">'
        + Object.keys(ENF_DOC_EXT_SUPPORTS).map(k=>'<option value="'+k+'">'+ENF_DOC_EXT_SUPPORTS[k]+'</option>').join('')
      + '</select>'
      + '<select class="finput" id="enf-doc-ext-categorie" style="flex:1;min-width:110px;font-size:12px;padding:5px 8px">'
        + Object.keys(ENF_DOC_EXT_CATEGORIES).map(k=>'<option value="'+k+'">'+ENF_DOC_EXT_CATEGORIES[k]+'</option>').join('')
      + '</select>'
      + '<input class="finput" id="enf-doc-ext-lieu" placeholder="Lieu de conservation (ex. classeur crèche, tiroir 2)" style="flex:2;min-width:180px;font-size:12px;padding:5px 8px">'
      + '<button class="btn-sm" onclick="enfDocExtAdd()"><i class="ti ti-plus"></i> Ajouter</button>'
    + '</div>';
}

async function enfDocExtAdd(){
  const eid=enfFicheId;
  const libelle=(document.getElementById('enf-doc-ext-libelle').value||'').trim();
  if(!libelle){document.getElementById('enf-doc-ext-libelle').focus();return;}
  const row={
    entite_type:'enfant',
    entite_id:eid,
    libelle,
    support:document.getElementById('enf-doc-ext-support').value||'papier',
    categorie:document.getElementById('enf-doc-ext-categorie').value||'autre',
    lieu_conservation:(document.getElementById('enf-doc-ext-lieu').value||'').trim()||null,
    created_by:currentUser?currentUser.id:null
  };
  const{data,error}=await sb.from('documents_externes').insert(row).select().single();
  if(error){showBanner('Erreur lors de l\'ajout : '+error.message,'error');return;}
  enfDocExtCache.unshift(data);
  enfRenderDocExt();
  showBanner('Pièce ajoutée au registre.');
}
window.enfDocExtAdd=enfDocExtAdd;

async function enfDocExtDetruire(id){
  if(!confirm('Marquer cette pièce comme détruite / restituée aujourd\'hui ?'))return;
  const row={detruit_le:todayStr(),detruit_par:currentUser?currentUser.id:null};
  const{error}=await sb.from('documents_externes').update(row).eq('id',id);
  if(error){showBanner('Erreur : '+error.message,'error');return;}
  const d=enfDocExtCache.find(x=>String(x.id)===String(id));
  if(d)Object.assign(d,row);
  enfRenderDocExt();
  showBanner('Pièce marquée détruite.');
}
window.enfDocExtDetruire=enfDocExtDetruire;

async function enfDocExtDelete(id){
  if(!confirm('Supprimer cette entrée du registre ? (la pièce physique elle-même n\'est pas concernée, seule la trace ici disparaît)'))return;
  const{error}=await sb.from('documents_externes').delete().eq('id',id);
  if(error){showBanner('Erreur : '+error.message,'error');return;}
  enfDocExtCache=enfDocExtCache.filter(x=>String(x.id)!==String(id));
  enfRenderDocExt();
  showBanner('Entrée supprimée.');
}
window.enfDocExtDelete=enfDocExtDelete;

/* ===== PAI — Projet d'Accueil Individualisé (fiche enfant) =================
   Documents liés au PAI d'un enfant (protocole, ordonnances associées...) :
   donnée de santé, au même titre que le carnet de vaccination. Même schéma de
   stockage que `vaccins_pj` : bucket PRIVÉ `carnets` (déjà créé, déjà doté de
   policies pour les données de santé enfant), aucune URL publique enregistrée —
   seuls bucket et chemin sont gardés en base, une URL signée est générée à
   chaque ouverture. Voir sql/enfants_pai.sql. */
const ENF_PAI_BUCKET = 'carnets';
const ENF_PAI_TTL    = 300;   // durée de vie d'une URL signée, en secondes

let enfPaiCache = [];
async function enfLoadPai(enfantId){
  try{
    const{data,error}=await sb.from('enfants_pai')
      .select('*')
      .eq('enfant_id',enfantId)
      .order('created_at',{ascending:false});
    if(error) throw error;
    enfPaiCache = data||[];
  }catch(err){
    console.warn('enfLoadPai',err);
    enfPaiCache = [];
  }
  // ne rendre que si on est toujours sur le même enfant
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderPai();
}

function enfRenderPai(){
  const zone=document.getElementById('enf-pai-zone');
  if(!zone) return;
  const list = enfPaiCache.length ? enfPaiCache.map(d=>
    '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:#fff">'
    +'<i class="ti ti-paperclip" style="color:var(--koala)"></i>'
    +'<button type="button" onclick="enfPaiOpen(\''+d.id+'\')" title="Ouvrir" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12.5px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(d.filename||'Document')+'</button>'
    +'<span style="font-size:11px;color:var(--muted);white-space:nowrap">'+new Date(d.created_at).toLocaleDateString('fr-FR')+'</span>'
    +'<button onclick="enfPaiDelete(\''+d.id+'\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:15px"><i class="ti ti-trash"></i></button>'
    +'</div>'
  ).join('') : '<div style="font-size:12px;color:var(--muted)">Aucun document PAI pour le moment.</div>';
  zone.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">'+list+'</div>'
    + '<button class="btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;font-size:12.5px" onclick="document.getElementById(\'enf-pai-input\').click()"><i class="ti ti-upload"></i> Importer un document PAI</button>'
    + '<span id="enf-pai-input-status" style="margin-left:10px;font-size:12px;color:var(--muted)"></span>'
    + '<input type="file" id="enf-pai-input" accept="image/*,application/pdf" multiple style="display:none" onchange="enfHandlePaiUpload(event)"/>';
}

async function enfHandlePaiUpload(event){
  const input=event.target;
  const files=Array.from(input.files||[]);
  if(!files.length) return;
  const eid=enfFicheId;
  const status=document.getElementById('enf-pai-input-status');
  for(const file of files){
    if(status) status.textContent='⏳ Envoi de '+file.name+'…';
    try{
      const ext=(file.name.split('.').pop()||'bin');
      const path=eid+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
      /* Client authentifie et non le client anonyme : le bucket est prive et
         ses policies exigent un compte referent. */
      const{error}=await sb.storage.from(ENF_PAI_BUCKET).upload(path,file);
      if(error) throw error;
      const{data:ins,error:insErr}=await sb.from('enfants_pai')
        .insert({enfant_id:eid,bucket:ENF_PAI_BUCKET,path:path,filename:file.name}).select().single();
      if(insErr) throw insErr;
      if(ins) enfPaiCache.unshift(ins);
      enfRenderPai();
    }catch(e){
      console.error('[enfPai]',e.message);
      if(status) status.textContent='⚠ Erreur : '+e.message;
      return;
    }
  }
  if(status) status.textContent='✅ Ajouté';
  input.value='';
  showBanner('Document(s) PAI importé(s) ✅');
}

async function enfPaiOpen(id){
  const d=enfPaiCache.find(x=>String(x.id)===String(id));
  if(!d){alert('Fichier introuvable.');return;}
  const{data,error}=await sb.storage.from(d.bucket||ENF_PAI_BUCKET).createSignedUrl(d.path,ENF_PAI_TTL);
  if(error||!data){alert('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'));return;}
  window.open(data.signedUrl,'_blank','noopener');
}

async function enfPaiDelete(id){
  if(!confirm('Supprimer ce document ?')) return;
  const d=enfPaiCache.find(x=>String(x.id)===String(id));
  const{error}=await sb.from('enfants_pai').delete().eq('id',id);
  if(error){alert('Erreur : '+error.message);return;}
  /* Le fichier lui-meme est retire du stockage : sans cela il resterait
     indefiniment dans le bucket, hors de toute fiche. */
  if(d){
    const{error:rmErr}=await sb.storage.from(d.bucket||ENF_PAI_BUCKET).remove([d.path]);
    if(rmErr) console.warn('[enfPai] fichier non supprime du stockage',rmErr.message);
  }
  enfPaiCache=enfPaiCache.filter(x=>String(x.id)!==String(id));
  enfRenderPai();
  showBanner('Document supprimé.');
}
window.enfPaiOpen = enfPaiOpen;
window.enfPaiDelete = enfPaiDelete;
window.enfHandlePaiUpload = enfHandlePaiUpload;

/* ===== Statut vaccinal (fiche enfant) =======================================
   Reprend la logique de la fiche vaccins du module Vaccinations (VAC_SCHEMA +
   vacDoseStatus, js/vaccinations.js), mais rendue dans sa propre zone du
   dossier santé plutôt que dans la modale dédiée. Même source de données —
   table `vaccinations`, cache partagé `cacheVaccinations` — donc une dose
   marquée faite d'un côté apparaît aussitôt de l'autre (voir vacToggleDose,
   qui rafraîchit cette zone quand la fiche enfant est ouverte sur le même
   enfant). */
async function enfLoadVaccinsStatus(enfantId){
  await vacEnsureDataLoaded();
  if(String(enfFicheId)!==String(enfantId)) return;
  enfRenderVaccins(enfantId);
}

function enfRenderVaccins(enfantId){
  const zone=document.getElementById('enf-vaccins-zone');
  if(!zone) return;
  const e=cacheEnfants.find(x=>String(x.id)===String(enfantId));
  if(!e){zone.innerHTML='';return;}
  const titre='';   // le titre « Vaccinations » est désormais porté par la sous-carte HTML (voir demandes.html)
  if(!e.dob){
    zone.innerHTML=titre+'<div style="font-size:12px;color:var(--muted)">Date de naissance manquante : impossible de calculer les échéances vaccinales.</div>';
    return;
  }
  // Les vaccins n'ont pas tous le meme calendrier (ex. ACWY : 6/12 mois,
  // ROR : 12/18 mois) : les colonnes s'alignent sur l'age de la dose (en
  // mois), pas sur sa position dans le tableau `doses` de chaque vaccin —
  // meme principe que vacRenderFicheBody (js/vaccinations.js).
  const allMonths=[...new Set(VAC_SCHEMA.flatMap(function(v){return v.doses.map(function(d){return d.months;});}))].sort(function(a,b){return a-b;});
  const rows=VAC_SCHEMA.map(function(v){
    const cells=allMonths.map(function(months){
      const di=v.doses.findIndex(function(d){return d.months===months;});
      if(di===-1){
        return '<td style="padding:4px 6px;text-align:center;vertical-align:middle"><span aria-hidden="true" style="display:inline-flex;width:30px;height:30px;border:2px dashed var(--muted);border-radius:50%;opacity:0.6"></span></td>';
      }
      const s=vacDoseStatus(e,v,di);
      let cell;
      if(s.state==='fait'){
        cell='<button type="button" onclick="vacToggleDose(\''+e.id+'\',\''+v.id+'\','+di+')" title="Fait — cliquer pour annuler" style="width:30px;height:30px;border:none;border-radius:50%;background:var(--green);color:#fff;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center">✓</button>';
      }else{
        const border=s.state==='retard'?'3px solid var(--red)':s.state==='proche'?'2px solid var(--orange)':'2px dashed var(--border)';
        const bg=s.state==='retard'?'var(--red-light)':s.state==='proche'?'var(--orange-light)':'#fff';
        const glyphe=s.state==='retard'?'⚠':s.state==='proche'?'!':'·';
        const couleur=s.state==='retard'?'var(--red)':s.state==='proche'?'var(--orange-dark)':'var(--muted)';
        const infobulle=s.state==='retard'?'En retard — cliquer si fait':s.state==='proche'?'À faire bientôt — cliquer si fait':'Pas encore dû — cliquer si fait';
        cell='<button type="button" onclick="vacToggleDose(\''+e.id+'\',\''+v.id+'\','+di+')" aria-label="'+infobulle+'" title="'+infobulle+'" style="width:30px;height:30px;border:'+border+';border-radius:50%;background:'+bg+';color:'+couleur+';font-size:13px;font-weight:800;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center">'+glyphe+'</button>';
      }
      return '<td style="padding:4px 6px;text-align:center;vertical-align:middle">'+cell+'</td>';
    }).join('');
    return '<tr><td style="padding:4px 6px;font-size:11.5px;font-weight:600;color:var(--koala-dark);white-space:nowrap">'+escHtml(v.label)+'</td>'+cells+'</tr>';
  }).join('');
  // Le redessin remplace tout le tableau : sans cela le defilement horizontal
  // de l'utilisateur est remis a zero (le tableau « revient » a gauche).
  const oldScroller=zone.querySelector('[data-vac-scroll]');
  const prevScroll=oldScroller?oldScroller.scrollLeft:0;
  zone.innerHTML=titre
    +'<div data-vac-scroll style="overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;border:1px solid var(--border);border-radius:10px">'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<thead><tr style="background:var(--koala-light)">'
    +'<th style="padding:5px 6px;font-size:10.5px;font-weight:700;color:var(--koala);text-align:left;min-width:150px">Vaccin</th>'
    +allMonths.map(function(m){return '<th style="padding:5px 6px;font-size:10.5px;font-weight:700;color:var(--koala);text-align:center;white-space:nowrap">'+m+' mois</th>';}).join('')
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>'
    +'<div style="margin-top:8px;font-size:11px;color:var(--muted)">Cliquez une pastille pour la marquer faite (ou l\'annuler).</div>';
  const newScroller=zone.querySelector('[data-vac-scroll]');
  if(newScroller&&prevScroll) newScroller.scrollLeft=prevScroll;
}
