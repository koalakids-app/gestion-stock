/* ═════════════════════════════════════════════════════════════════
   DOCUMENTS RGPD (Paramètres › Les établissements › « Documents RGPD »)

   - Politique de confidentialité : publique (confidentialite.html, version Word
     docs/politique-confidentialite.docx servie par GitHub Pages).
   - Registre des traitements : PRIVÉ, bucket `rgpd` réservé à la direction
     (sql/rgpd_documents.sql). Ouverture par lien signé de 60 s, inscrite dans
     acces_documents ; la direction dépose ou remplace le fichier ici même.
   ═════════════════════════════════════════════════════════════════ */
const RGPD_BUCKET='rgpd';
const RGPD_REGISTRE='registre-rgpd.docx';
const RGPD_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function rgpdStatut(m,err){const e=document.getElementById('rgpdStatut');if(e){e.textContent=m||'';e.style.color=err?'var(--red,#C62828)':'';}}

async function rgpdActualiser(){
  try{
    const{data,error}=await sb.storage.from(RGPD_BUCKET).list('',{search:RGPD_REGISTRE,limit:1});
    if(error)throw error;
    const f=(data||[]).find(x=>x.name===RGPD_REGISTRE);
    const o=document.getElementById('rgpdOuvrir');if(o)o.disabled=!f;
    rgpdStatut(f?'Registre déposé le '+new Date(f.updated_at||f.created_at).toLocaleDateString('fr-FR')+'.':'Aucun registre déposé : utilisez « Déposer / remplacer ».');
  }catch(e){
    rgpdStatut('Stockage indisponible : '+(e.message||e)+' (le script sql/rgpd_documents.sql est-il appliqué ?)',true);
  }
}

async function rgpdOuvrirRegistre(){
  try{
    const{data,error}=await sb.storage.from(RGPD_BUCKET).createSignedUrl(RGPD_REGISTRE,60);
    if(error)throw error;
    Promise.resolve(sb.from('acces_documents').insert({bucket:RGPD_BUCKET,chemin:RGPD_REGISTRE,libelle:'Registre RGPD'})).catch(function(){});
    window.open(data.signedUrl,'_blank','noopener');
  }catch(e){toast('Ouverture impossible : '+(e.message||e),true);}
}

async function rgpdDeposer(input){
  const f=input.files&&input.files[0];input.value='';
  if(!f)return;
  if(!/\.docx$/i.test(f.name)){toast('Choisissez un fichier Word (.docx).',true);return;}
  if(f.size>8*1024*1024){toast('Fichier trop volumineux (8 Mo maximum).',true);return;}
  if(!confirm('Déposer « '+f.name+' » comme registre RGPD ? Il remplace la version actuelle.'))return;
  rgpdStatut('Envoi…');
  const{error}=await sb.storage.from(RGPD_BUCKET).upload(RGPD_REGISTRE,f,{upsert:true,contentType:RGPD_MIME});
  if(error){rgpdStatut('Échec de l\'envoi : '+error.message,true);toast('Échec de l\'envoi',true);return;}
  toast('Registre déposé');
  rgpdActualiser();
}

window.rgpdActualiser=rgpdActualiser;
window.rgpdOuvrirRegistre=rgpdOuvrirRegistre;
window.rgpdDeposer=rgpdDeposer;
document.addEventListener('DOMContentLoaded',()=>setTimeout(rgpdActualiser,1500));
