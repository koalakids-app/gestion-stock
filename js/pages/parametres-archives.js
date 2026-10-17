/* ══════════════════════════════════════════════════════════════════════════
   EXPORT DES DOSSIERS ARCHIVÉS D'UNE CRÈCHE (Paramètres › Établissements ›
   « Archives sur disque dur »)

   Page réservée à la direction. Pour la crèche sélectionnée (crecheId), regroupe
   dans UN seul .zip les documents de tous les dossiers archivés — enfants,
   collaborateurs/trices archivés, stagiaires dont le dossier est clos — à
   copier sur le disque dur (chiffré) de la crèche. Puis, seulement après
   confirmation que le zip est bien sauvegardé, supprime ces fichiers de
   Supabase Storage et les lignes en base. Une ligne par dossier dans
   archivage_purges (voir sql/archivage_purges.sql) garde la preuve.
   Même mécanique que l'export dossier par dossier (enfExporterDocuments,
   exporterDocuments, stgExporterDocuments), en un seul geste.
   Arborescence du zip : <crèche>/enfants|collaborateurs|stagiaires/<Nom>/…
   ═════════════════════════════════════════════════════════════════════════ */
const ARCH_EMP_BUCKET='documents-employes';
function archStatut(m){const e=document.getElementById('archStatut');if(e)e.textContent=m||'';}

function archNomSur(s){
  return String(s||'sans-nom').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.-]+/g,'_').replace(/^_+|_+$/g,'')||'sans-nom';
}
function archNomPersonne(p){return archNomSur(((p.prenom||'')+'_'+(p.nom||'')).trim());}

/* Dossiers archivés de la crèche + leurs documents (rien n'est téléchargé ici). */
async function archCollecter(crecheId){
  const items=[]; // { type, personne, dossier, d, table, bucketDefaut }
  const personnes=[];

  const{data:enfs,error:eEnf}=await sb.from('enfants').select('*').eq('creche_id',crecheId).not('archive_le','is',null);
  if(eEnf)throw eEnf;
  for(const e of enfs||[])personnes.push({type:'enfant',p:e,dossierRacine:'enfants',anneeSortie:e.date_sortie});
  const{data:emps,error:eEmp}=await sb.from('employes').select('*').eq('creche_id',crecheId).not('archive_le','is',null);
  if(eEmp)throw eEmp;
  for(const e of emps||[])personnes.push({type:'employe',p:e,dossierRacine:'collaborateurs',anneeSortie:e.date_fin});
  const{data:stgs,error:eStg}=await sb.from('stagiaires').select('*').eq('creche_id',crecheId).in('statut',['termine','refuse','annule']);
  if(eStg)throw eStg;
  for(const s of stgs||[])personnes.push({type:'stagiaire',p:s,dossierRacine:'stagiaires',anneeSortie:s.date_fin});

  const lire=async(table,col,ids)=>{
    if(!ids.length)return[];
    const{data,error}=await sb.from(table).select('*').in(col,ids);
    if(error)throw error;
    return data||[];
  };
  const idsDe=t=>personnes.filter(x=>x.type===t).map(x=>x.p.id);
  const [adm,pai,vac,emd,std]=await Promise.all([
    lire('enfants_documents_admin','enfant_id',idsDe('enfant')),
    lire('enfants_pai','enfant_id',idsDe('enfant')),
    lire('vaccins_pj','enfant_id',idsDe('enfant')),
    lire('employes_documents','employe_id',idsDe('employe')),
    lire('stagiaires_documents','stagiaire_id',idsDe('stagiaire'))
  ]);
  const pers=(type,id)=>personnes.find(x=>x.type===type&&String(x.p.id)===String(id));
  const ajoute=(liste,type,col,dossier,table,bucketDefaut)=>liste.forEach(d=>{
    const x=pers(type,d[col]);
    if(x)items.push({x,dossier,d,table,bucketDefaut});
  });
  ajoute(adm,'enfant','enfant_id','administratif','enfants_documents_admin',null);
  ajoute(pai,'enfant','enfant_id','pai','enfants_pai',null);
  ajoute(vac,'enfant','enfant_id','vaccinations','vaccins_pj',null);
  ajoute(emd,'employe','employe_id','embauche','employes_documents',ARCH_EMP_BUCKET);
  ajoute(std,'stagiaire','stagiaire_id','','stagiaires_documents','stagiaires');
  return{personnes,items};
}

async function archTelecharger(it){
  const d=it.d;
  const bucket=d.bucket||it.bucketDefaut;
  if(bucket&&d.path){
    const{data,error}=await sb.storage.from(bucket).download(d.path);
    if(error)throw error;
    return data;
  }
  if(d.url){
    const resp=await fetch(d.url);
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    return await resp.blob();
  }
  throw new Error('ni bucket/path ni url');
}

async function archExporterCreche(){
  try{await archExporterCrecheEtapes();}finally{archStatut('');}
}
async function archExporterCrecheEtapes(){
  if(!PROF||PROF.role!=='direction'){toast('Réservé à la direction.',true);return;}
  if(!crecheId){toast('Choisissez d\'abord une crèche.',true);return;}
  const creche=CRECHES.find(c=>String(c.id)===String(crecheId));
  const nomCreche=creche?creche.name||creche.nom:'creche';

  archStatut('Recherche des dossiers archivés…');
  let col;
  try{col=await archCollecter(crecheId);}
  catch(err){toast('Erreur lors de la lecture des dossiers : '+err.message,true);return;}
  const{personnes,items}=col;
  if(!personnes.length){toast('Aucun dossier archivé pour cette crèche.');return;}
  if(!items.length){toast(personnes.length+' dossier(s) archivé(s), mais aucun document à exporter.');return;}

  const nPers=new Set(items.map(i=>i.x.type+i.x.p.id)).size;
  if(!confirm('Exporter les archives de « '+nomCreche+' » ?\n\n'+items.length+' document(s) de '+nPers+' dossier(s) (enfants, collaborateurs/trices, stagiaires) seront regroupés dans un seul fichier .zip.\n\nAssurez-vous d\'avoir le disque dur (chiffré) sous la main. Les documents ne seront supprimés du stockage en ligne qu\'après votre confirmation, une fois le zip téléchargé.'))return;

  const zip=new JSZip();
  const reussis=[];
  let nEchec=0;
  for(let i=0;i<items.length;i++){
    const it=items[i];
    archStatut('Téléchargement des documents… '+(i+1)+' / '+items.length);
    try{
      const blob=await archTelecharger(it);
      const chemin=[archNomSur(nomCreche),it.x.dossierRacine,archNomPersonne(it.x.p)]
        .concat(it.dossier?[it.dossier]:[]).join('/')
        +'/'+String(it.d.id).slice(0,8)+'_'+archNomSur(it.d.filename||it.d.id);
      zip.file(chemin,blob);
      reussis.push(it);
    }catch(err){
      console.warn('[archExporterCreche] échec sur',it.table,it.d.id,err);
      nEchec++;
    }
  }
  if(!reussis.length){toast('Aucun document n\'a pu être téléchargé — export annulé, rien n\'a été supprimé.',true);return;}

  archStatut('Création du fichier .zip…');
  const contenu=await zip.generateAsync({type:'blob',compression:'STORE'});
  const nomZip='archives_'+archNomSur(nomCreche)+'_'+auj()+'.zip';
  const url=URL.createObjectURL(contenu);
  const a=document.createElement('a');a.href=url;a.download=nomZip;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);

  if(nEchec)toast(nEchec+' document(s) n\'ont pas pu être inclus dans le zip (ignorés, non supprimés) — '+reussis.length+' inclus.',true);

  if(!confirm('Le fichier "'+nomZip+'" a été téléchargé.\n\nL\'avez-vous copié sur le disque dur de la crèche, et vérifié qu\'il s\'ouvre correctement ?\n\nEn confirmant, les '+reussis.length+' document(s) effectivement exportés seront DÉFINITIVEMENT supprimés du stockage en ligne'+(nEchec?' ('+nEchec+' document(s) en échec resteront en ligne, à retenter plus tard)':'')+'. Cette action est IRRÉVERSIBLE.'))return;

  const parPersonne=new Map(); // type+id -> { x, ok, ko }
  for(const it of reussis){
    const k=it.x.type+it.x.p.id;
    if(!parPersonne.has(k))parPersonne.set(k,{x:it.x,ok:0,ko:0});
    const bilan=parPersonne.get(k);
    try{
      const bucket=it.d.bucket||it.bucketDefaut;
      if(bucket&&it.d.path){
        const{error:rmErr}=await sb.storage.from(bucket).remove([it.d.path]);
        if(rmErr)console.warn('[archExporterCreche] fichier non supprimé du stockage',it.d.id,rmErr.message);
      }
      const{error:delErr}=await sb.from(it.table).delete().eq('id',it.d.id);
      if(delErr)throw delErr;
      bilan.ok++;
    }catch(err){
      console.warn('[archExporterCreche] suppression échouée',it.table,it.d.id,err);
      bilan.ko++;
    }
  }

  const journal=[...parPersonne.values()].map(b=>({
    entite_type:b.x.type,
    entite_id:b.x.p.id,
    creche_id:crecheId,
    annee_sortie:b.x.anneeSortie?Number(String(b.x.anneeSortie).slice(0,4)):null,
    motif:b.ok+' document(s) exportés dans '+nomZip+' (export par crèche) puis supprimés du stockage en ligne'+(b.ko?' ('+b.ko+' échec(s) de suppression)':''),
    purge_par:ME?ME.id:null
  }));
  if(journal.length){
    const{error:jErr}=await sb.from('archivage_purges').insert(journal);
    if(jErr)console.warn('[archExporterCreche] journal non écrit',jErr.message);
  }

  const nOk=[...parPersonne.values()].reduce((n,b)=>n+b.ok,0);
  const nKo=[...parPersonne.values()].reduce((n,b)=>n+b.ko,0);
  archStatut('');
  toast(nOk+' document(s) supprimé(s) du stockage en ligne.'+(nKo?' '+nKo+' suppression(s) ont échoué.':'')+'');
}
window.archExporterCreche=archExporterCreche;

/* ---------- COFFRE-FORT : journal des consultations (sql/acces_documents.sql) ---------- */
const COFFRE_LIB={enfant:'Enfant',employe:'Collaborateur/trice',stagiaire:'Stagiaire'};
async function coffreChargerJournal(){
  const box=document.getElementById('coffreJournal');
  if(!box||!crecheId)return;
  box.textContent='Chargement…';
  const{data,error}=await sb.from('acces_documents').select('*')
    .or('creche_id.eq.'+crecheId+',creche_id.is.null')
    .order('ouvert_le',{ascending:false}).limit(50);
  if(error){
    box.innerHTML='<span class="hint">Journal indisponible : '+esc(error.message)+' (le script sql/acces_documents.sql est-il appliqué ?)</span>';
    return;
  }
  if(!data.length){box.innerHTML='<span class="hint">Aucune consultation enregistrée.</span>';return;}
  const ids=[...new Set(data.map(r=>r.user_id))];
  const{data:refs}=await sb.from('referents').select('user_id,name').in('user_id',ids);
  const nom={};(refs||[]).forEach(r=>{nom[r.user_id]=r.name;});
  box.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="text-align:left;color:var(--muted)">'
    +'<th style="padding:4px 8px">Quand</th><th style="padding:4px 8px">Qui</th><th style="padding:4px 8px">Fiche</th><th style="padding:4px 8px">Document</th></tr></thead><tbody>'
    +data.map(r=>'<tr style="border-top:1px solid var(--line,#eee)">'
      +'<td style="padding:4px 8px;white-space:nowrap">'+esc(new Date(r.ouvert_le).toLocaleString('fr-FR'))+'</td>'
      +'<td style="padding:4px 8px">'+esc(nom[r.user_id]||'—')+'</td>'
      +'<td style="padding:4px 8px">'+esc(COFFRE_LIB[r.entite_type]||'—')+'</td>'
      +'<td style="padding:4px 8px">'+esc(r.libelle||r.chemin)+' <span style="color:var(--muted)">('+esc(r.bucket)+')</span></td></tr>').join('')
    +'</tbody></table>';
}
window.coffreChargerJournal=coffreChargerJournal;
