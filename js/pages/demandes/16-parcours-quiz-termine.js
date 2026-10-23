/* Parcours quiz terminé : la cloche de Demandes (direction seulement) signale un·e collaborateur·trice
   dont tous les quiz envoyés (admin du quiz) ont été réalisés. Source : kk_parcours_quiz_termines
   (docs/quiz-envoi/parcours_termines.sql, projet quiz, à appliquer à la main), interrogée par la ref
   de la fiche. Une seule alerte par personne et par nombre de quiz envoyés : un nouvel envoi réarme.
   Au premier passage sur ce navigateur, les parcours déjà terminés sont mémorisés sans notification. */
let _parcoursQuizClient=null,_parcoursQuizEnCours=false;
function parcoursQuizClient(){
  if(_parcoursQuizClient)return _parcoursQuizClient;
  try{_parcoursQuizClient=supabase.createClient('https://phbcqxjzobzwuzetgbem.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoYmNxeGp6b2J6d3V6ZXRnYmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Mjg3ODMsImV4cCI6MjEwMDEwNDc4M30.Cz7_0WN_pWoXeamk484hJr2iCVdKZEatR-m_f0bKj3w');}catch(e){}
  return _parcoursQuizClient;
}
async function detecterParcoursQuizTermines(){
  if(!isDirection||!currentProfile||_parcoursQuizEnCours)return;
  const cl=parcoursQuizClient();if(!cl)return;
  const noms=new Map();
  cacheEmployes.forEach(function(e){if(e.id&&!e.archive_le)noms.set(String(e.id),((e.prenom||'')+' '+(e.nom||'')).trim());});
  cacheReferents.forEach(function(r){if(r.id&&!noms.has(String(r.id)))noms.set(String(r.id),r.name||'');});
  if(!noms.size)return;
  _parcoursQuizEnCours=true;
  try{
    const{data,error}=await cl.rpc('kk_parcours_quiz_termines',{p_refs:Array.from(noms.keys())});
    if(error||!Array.isArray(data))return;
    const cle='koala_parcours_quiz_'+currentProfile.id;
    let vus=null;
    try{vus=JSON.parse(localStorage.getItem(cle)||'null');}catch(e){}
    const premiere=!vus;
    vus=vus||{};
    data.forEach(function(p){
      const sig=p.nb_envois+'';
      if(vus[p.ref]===sig)return;
      vus[p.ref]=sig;
      if(premiere)return;
      const nom=noms.get(String(p.ref))||'Un collaborateur';
      showInAppNotif('Parcours quiz terminé',nom+' a réalisé les '+p.nb_envois+' quiz envoyé'+(p.nb_envois>1?'s':'')+'.','demands');
    });
    try{localStorage.setItem(cle,JSON.stringify(vus));}catch(e){}
  }catch(e){console.warn('[parcours quiz]',e);}
  finally{_parcoursQuizEnCours=false;}
}
