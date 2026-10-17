/* Journal des consultations de documents sensibles (voir sql/acces_documents.sql).
   Appelé juste avant l'ouverture d'un lien signé. Ne bloque jamais l'ouverture :
   si le journal échoue (réseau, table pas encore créée), on l'ignore.
   meta : { entite_type:'enfant'|'employe'|'stagiaire', entite_id, libelle } */
function kkJournaliserAcces(bucket,chemin,meta){
  try{
    if(typeof sb==='undefined'||!bucket||!chemin)return;
    const m=meta||{};
    const row={bucket:bucket,chemin:chemin,
      entite_type:m.entite_type||null,entite_id:m.entite_id||null,libelle:m.libelle||null};
    Promise.resolve(sb.from('acces_documents').insert(row)).then(function(r){
      if(r&&r.error)console.warn('[journal acces]',r.error.message);
    },function(e){console.warn('[journal acces]',e);});
  }catch(e){console.warn('[journal acces]',e);}
}
