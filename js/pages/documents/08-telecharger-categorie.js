/* ---------- TÉLÉCHARGER TOUS LES FICHIERS D'UNE CATÉGORIE (.zip) ----------
   Un bouton dans l'en-tête de chaque catégorie et sous-catégorie réunit en un seul .zip les fichiers
   (PDF, Word, tableurs…) de la catégorie et de ses sous-catégories, rangés dans des dossiers du même nom.
   Les documents « à remplir en ligne » n'ont pas de fichier : ils ne sont pas inclus.
   Chaque fichier est déjà téléchargeable un par un depuis la liste : le zip ne donne aucun droit de plus
   (la liste des documents vue par la personne connectée est déjà filtrée par ses droits).
   Un fichier qui ne peut pas être récupéré n'arrête pas l'export : il est signalé dans le zip (fichiers-manquants.txt). */

let ZIP_CAT_EN_COURS=false;

/* Fichiers de la catégorie et de toutes ses sous-catégories : [{d: document, cat: catégorie du document}] */
function catZipDocs(catId){
  if(!catId)return[];
  const ids=new Set([catId]);
  let ajout=true;
  while(ajout){
    ajout=false;
    CATS.forEach(c=>{if(c.parent_id&&ids.has(c.parent_id)&&!ids.has(c.id)){ids.add(c.id);ajout=true;}});
  }
  return DOCS.filter(d=>ids.has(d.categorie_id)&&d.fichier_url&&d.type!=='remplissable')
    .sort(DOC_ALPHA)
    .map(d=>({d,cat:CATS.find(c=>c.id===d.categorie_id)}));
}

/* Bouton affiché dans l'en-tête d'une catégorie (vide s'il n'y a aucun fichier à réunir) */
function catZipBtn(catId){
  const n=catZipDocs(catId).length;
  if(!n)return'';
  const quoi=n>1?'les '+n+' fichiers':'le fichier';
  return`<button class="iconbtn catzip" title="Télécharger ${quoi} de cette catégorie (.zip)" aria-label="Télécharger ${quoi} de cette catégorie en un .zip" onclick="event.stopPropagation();catZip('${catId}')"><i class="ti ti-file-zip"></i></button>`;
}

function zipNomSur(t){
  return String(t||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'sans nom';
}
function zipExtension(url){
  try{
    const f=decodeURIComponent(new URL(url,location.href).pathname.split('/').pop()||'');
    const m=f.match(/\.([A-Za-z0-9]{1,5})$/);
    return m?m[1].toLowerCase():'';
  }catch(e){return'';}
}

async function catZip(catId){
  if(ZIP_CAT_EN_COURS)return;
  const racine=CATS.find(c=>c.id===catId);
  const liste=catZipDocs(catId);
  if(!racine||!liste.length){toast('Aucun fichier à télécharger');return;}
  if(typeof JSZip==='undefined'){toast('Le module de compression n’est pas chargé : rechargez la page');return;}
  if(liste.length>25&&!confirm('Télécharger '+liste.length+' fichiers dans un seul zip ? Cela peut prendre un moment.'))return;

  ZIP_CAT_EN_COURS=true;
  const profondeurRacine=catPath(catId).split(' › ').length;
  const zip=new JSZip();
  const pris=new Set();
  const manquants=[];
  let ok=0;
  try{
    for(let i=0;i<liste.length;i++){
      const{d,cat}=liste[i];
      toast('Préparation du zip… '+(i+1)+' / '+liste.length);
      try{
        const r=await fetch(d.fichier_url);
        if(!r.ok)throw new Error('HTTP '+r.status);
        const blob=await r.blob();
        const sousDossiers=cat?catPath(cat.id).split(' › ').slice(profondeurRacine).map(zipNomSur).join('/'):'';
        const ext=zipExtension(d.fichier_url);
        let base=zipNomSur(d.titre);
        if(ext&&base.toLowerCase().endsWith('.'+ext))base=base.slice(0,-(ext.length+1));
        const dossier=sousDossiers?sousDossiers+'/':'';
        let nom=base+(ext?'.'+ext:''),n=2;
        while(pris.has((dossier+nom).toLowerCase())){nom=base+' ('+n+')'+(ext?'.'+ext:'');n++;}
        pris.add((dossier+nom).toLowerCase());
        zip.file(dossier+nom,blob);
        ok++;
      }catch(err){
        console.warn('[catZip] échec sur',d.titre,err);
        manquants.push(d.titre||'(sans titre)');
      }
    }
    if(!ok){toast('Aucun fichier n’a pu être récupéré');return;}
    if(manquants.length)zip.file('fichiers-manquants.txt','Ces fichiers n’ont pas pu être récupérés (à télécharger un par un depuis la liste) :\n\n'+manquants.map(t=>'- '+t).join('\n')+'\n');
    toast('Création du zip…');
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    const date=new Date().toISOString().slice(0,10);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=zipNomSur(racine.nom)+' - '+date+'.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
    toast(ok+' fichier'+(ok>1?'s':'')+' dans le zip'+(manquants.length?' ('+manquants.length+' manquant'+(manquants.length>1?'s':'')+')':''));
  }catch(err){
    console.error('[catZip]',err);
    toast('Le zip n’a pas pu être créé');
  }finally{
    ZIP_CAT_EN_COURS=false;
  }
}
