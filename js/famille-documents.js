/* ===========================================================================
   Documents PDF mis à disposition dans l'Espace famille (devis, contrat signé)
   ---------------------------------------------------------------------------
   Le devis et le contrat sont dessinés en PDF dans le navigateur (jsPDF) : rien n'était
   conservé. KkFamilleDocs.publier() dépose la copie dans le bucket privé `famille-docs`
   (<crèche>/<type>-<id>.pdf) et l'indexe dans `famille_documents` (sql/espace_famille_documents.sql,
   à appliquer à la main). Republier remplace la copie. L'edge function `espace-famille` retrouve
   les documents de l'enfant : contrat = contrats.enfant_id, devis = contrats.devis_id.
   Chargé par contrats.html et inscriptions.html (après le client Supabase `sb`).
   =========================================================================== */
window.KkFamilleDocs = {
  /* opts : {type:'devis'|'contrat', sourceId, crecheId, titre, base64}. Renvoie true / lève une erreur. */
  publier: async function(opts){
    if(!opts || !opts.crecheId || !opts.sourceId || !opts.base64) throw new Error('Données de publication incomplètes.');
    var bin = atob(opts.base64), octets = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    var path = opts.crecheId + '/' + opts.type + '-' + opts.sourceId + '.pdf';
    var up = await sb.storage.from('famille-docs').upload(path, new Blob([octets], {type:'application/pdf'}),
      {upsert:true, contentType:'application/pdf'});
    if(up.error) throw up.error;
    var perso = (typeof PROF !== 'undefined' && PROF && PROF.id) ? PROF.id : null;
    var ligne = await sb.from('famille_documents').upsert({
      creche_id: opts.crecheId, type: opts.type, source_id: opts.sourceId,
      titre: opts.titre, path: path, publie_le: new Date().toISOString(), publie_par: perso
    }, {onConflict: 'type,source_id'});
    if(ligne.error) throw ligne.error;
    return true;
  }
};
