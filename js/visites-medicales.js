/* Suivi des visites médicales obligatoires (médecine du travail — Odalia).
   Calcul partagé par la fiche collaborateur (employes.html), sa liste et
   « Ma journée » (demandes.html). Table : sql/employes_visites_medicales.sql.
   Règles : visite d'information et de prévention dans les 3 mois après
   l'embauche, puis au plus tard tous les 5 ans (prochaine_le, modifiable). */
var VISMED_ORGANISME='Odalia';
var VISMED_PERIODE_ANS=5;
var VISMED_SEUIL_JOURS=60;
var VISMED_TYPES={embauche:'Visite d\'embauche (VIP)',periodique:'Visite périodique',reprise:'Visite de reprise',mi_carriere:'Visite de mi-carrière',a_la_demande:'À la demande',autre:'Autre'};
var VISMED_AVIS={apte:'Apte',apte_amenagements:'Apte avec aménagements',inapte:'Inapte'};

function vismedAjout(iso,ans,mois){
  var d=new Date(iso+'T12:00:00');
  if(ans)d.setFullYear(d.getFullYear()+ans);
  if(mois)d.setMonth(d.getMonth()+mois);
  return d.toISOString().slice(0,10);
}
function vismedJours(iso,auj){
  return Math.round((new Date(iso+'T12:00:00')-new Date(auj+'T12:00:00'))/86400000);
}
function vismedDateFr(iso){return iso?new Date(iso+'T12:00:00').toLocaleDateString('fr-FR'):'';}

/* État d'un collaborateur à partir de ses visites. Renvoie
   {niveau:'retard'|'bientot'|'ok'|'rdv'|'inconnu', echeance, j, rdv, derniere, label}. */
function vismedEtat(emp,visites,auj){
  auj=auj||new Date().toISOString().slice(0,10);
  var faites=(visites||[]).filter(function(v){return v.date_visite;})
    .sort(function(a,b){return b.date_visite.localeCompare(a.date_visite);});
  var derniere=faites[0]||null;
  var rdvs=(visites||[]).filter(function(v){return !v.date_visite&&v.rdv_le&&v.rdv_le>=auj;})
    .sort(function(a,b){return a.rdv_le.localeCompare(b.rdv_le);});
  var rdv=rdvs[0]?rdvs[0].rdv_le:null;
  var rdvHeure=rdvs[0]&&rdvs[0].rdv_heure?String(rdvs[0].rdv_heure).slice(0,5):'';
  var echeance=null;
  if(derniere)echeance=derniere.prochaine_le||vismedAjout(derniere.date_visite,VISMED_PERIODE_ANS);
  else if(emp&&emp.date_debut)echeance=vismedAjout(String(emp.date_debut).slice(0,10),0,3);
  if(!echeance)return{niveau:'inconnu',echeance:null,j:null,rdv:rdv,derniere:derniere,label:'Date d\'embauche non renseignée'};
  var j=vismedJours(echeance,auj);
  var niveau=j<0?'retard':(j<=VISMED_SEUIL_JOURS?'bientot':'ok');
  var label;
  if(rdv&&niveau!=='ok')niveau='rdv';
  if(niveau==='rdv')label='RDV le '+vismedDateFr(rdv)+(rdvHeure?' à '+rdvHeure.replace(':','h'):'');
  else if(niveau==='retard')label=(derniere?'En retard de ':'Jamais passée — en retard de ')+(-j)+' j';
  else if(niveau==='bientot')label='À planifier avant le '+vismedDateFr(echeance)+' ('+j+' j)';
  else label='À jour — prochaine avant le '+vismedDateFr(echeance);
  return{niveau:niveau,echeance:echeance,j:j,rdv:rdv,derniere:derniere,label:label};
}
