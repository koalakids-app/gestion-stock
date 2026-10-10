/* ===========================================================================
   FAMILLE-SUIVI.HTML — page publique de consultation des synthèses
   ---------------------------------------------------------------------------
   Aucune session Supabase ici : la famille n'a pas de compte. Tout passe par
   l'edge function `suivi-famille`, qui s'exécute en service_role et ne
   renvoie que le contenu "famille" des synthèses publiées de l'enfant
   correspondant au jeton de l'URL — jamais le contenu interne. Aucune table
   n'est interrogée directement, aucune policy anon sur les tables suivi_*.
   =========================================================================== */

const SUPABASE_URL = "https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const FN_URL = SUPABASE_URL + '/functions/v1/suivi-famille';

/* Le lien n'ouvre qu'une session courte (js/session-lien.js) : jeton retiré de l'adresse,
   fermeture après inactivité, avertissement avant la fin. */
const TOKEN = SessionLien.init({url:FN_URL,anonKey:SUPABASE_ANON_KEY});
const wrap  = document.getElementById('wrap');

const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function etat(titre,msg,icone){
  wrap.innerHTML='<div class="state"><i class="ti ti-'+(icone||'alert-circle')+'"></i>'
    +'<h2>'+esc(titre)+'</h2><p>'+esc(msg)+'</p></div>';
}

function appel(action,payload){
  return SessionLien.appel(action,payload);
}

const PERIODE_LABEL={jour:'Jour',semaine:'Semaine',mois:'Mois',annee:'Année'};
function numSemaine(dateStr){const d=new Date(dateStr+'T12:00:00');const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const jour=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-jour);const debut=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-debut)/86400000+1)/7);}
function libellePeriode(s){
  const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  if(s.periode_type==='jour')return new Date(s.periode_debut+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  if(s.periode_type==='semaine')return 'Semaine du '+fmt(s.periode_debut)+' au '+fmt(s.periode_fin)+' (S'+numSemaine(s.periode_debut)+')';
  if(s.periode_type==='mois')return new Date(s.periode_debut+'T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  return 'Année '+s.periode_debut.slice(0,4)+'-'+s.periode_fin.slice(0,4);
}

async function boot(){
  if(!TOKEN)return etat('Lien incomplet','Ce lien ne contient pas de jeton. Utilisez celui reçu par la crèche.','link-off');
  try{
    const d=await appel('get');
    ENFANT_PRENOM=d.enfant.prenom||'';CRECHE_NOM=d.creche_nom||'';
    document.getElementById('sousTitre').textContent=
      ENFANT_PRENOM+(CRECHE_NOM?' · '+CRECHE_NOM:'');
    renderListe(d.syntheses||[]);
  }catch(e){
    const m=(e.message||'').toLowerCase();
    if(m.includes('revoque'))
      etat('Lien désactivé','Cet accès n\'est plus valable. Contactez la crèche pour en obtenir un nouveau.','link-off');
    else if(m.includes('introuvable'))
      etat('Lien invalide','Ce lien ne correspond à aucun accès. Vérifiez que vous l\'avez copié en entier.','link-off');
    else
      etat('Erreur','Le suivi n\'a pas pu être chargé. Réessayez dans un instant.','alert-triangle');
  }
}

let ENFANT_PRENOM='',CRECHE_NOM='',SYNTHESES=[];

function renderListe(syntheses){
  SYNTHESES=syntheses;
  if(!syntheses.length){
    wrap.innerHTML='<div class="empty"><i class="ti ti-mood-kid" style="font-size:32px"></i><br>Aucune synthèse publiée pour le moment.<br>Elle apparaîtra ici après le départ de votre enfant.</div>';
    return;
  }
  wrap.innerHTML=syntheses.map((s,i)=>`
    <div class="card">
      <div class="card-head">
        <span class="periode">${esc(libellePeriode(s))}</span>
        <span class="badge ${esc(s.periode_type)}">${esc(PERIODE_LABEL[s.periode_type]||s.periode_type)}</span>
      </div>
      ${s.famille.length?`<ul class="bullets">${s.famille.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p style="color:var(--muted);font-size:13.5px">Rien à signaler de particulier.</p>'}
      ${s.note_referente?`<div class="note-ref">${esc(s.note_referente)}</div>`:''}
      ${(s.periode_type==='mois'||s.periode_type==='annee')?`<div class="mention">Repères élaborés par l'équipe Koala Kids, inspirés des travaux de Francine Ferland.</div>`:''}
      <div class="card-acts"><button class="btn btn-g" data-pdf="${i}"><i class="ti ti-download"></i> Télécharger en PDF</button></div>
    </div>`).join('');
  wrap.querySelectorAll('[data-pdf]').forEach(b=>b.addEventListener('click',()=>telechargerPdf(SYNTHESES[+b.dataset.pdf])));
}

/* Les polices standard de jsPDF (Helvetica) n'encodent que le Latin-1 plus
   quelques signes WinAnsi : un caractère hors de ce jeu fait basculer toute
   la chaîne en UTF-16, illisible. On substitue donc les caractères
   problématiques juste avant l'écriture (repris de documents.html). */
const PDF_WINANSI_EXTRA='\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';
const PDF_SUBST={'\u2265':'>=','\u2264':'<=','\u2260':'\u2260','\u2248':'~','\u2192':'->','\u21D2':'=>','\u00A0':' ','\u202F':' ','\u2044':'/'};
function pdfSafe(v){
  let s=String(v==null?'':v).replace(/[\u2265\u2264\u2248\u2192\u21D2\u00A0\u202F\u2044]/g,c=>PDF_SUBST[c]);
  return s.replace(/[^\u0000-\u00FF]/g,c=>PDF_WINANSI_EXTRA.indexOf(c)>=0?c:' ');
}
function telechargerPdf(s){
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const marge=18;let y=22;
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(61,53,128);
  doc.text(pdfSafe('Suivi de '+(ENFANT_PRENOM||"l'enfant")),marge,y);y+=8;
  doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(120,116,140);
  doc.text(pdfSafe(CRECHE_NOM),marge,y);y+=6;
  doc.text(pdfSafe(libellePeriode(s)),marge,y);y+=10;
  doc.setTextColor(43,39,64);doc.setFontSize(11);
  const largeur=210-2*marge;
  const items=s.famille.length?s.famille:['Rien à signaler de particulier.'];
  items.forEach(t=>{
    const lignes=doc.splitTextToSize(pdfSafe('• '+t),largeur);
    lignes.forEach(l=>{
      if(y>270){doc.addPage();y=22;}
      doc.text(l,marge,y);y+=6;
    });
  });
  if(s.note_referente){
    y+=4;doc.setFont('helvetica','italic');
    const lignes=doc.splitTextToSize(pdfSafe(s.note_referente),largeur);
    lignes.forEach(l=>{
      if(y>270){doc.addPage();y=22;}
      doc.text(l,marge,y);y+=6;
    });
    doc.setFont('helvetica','normal');
  }
  y+=10;doc.setFontSize(8.5);doc.setTextColor(150,146,166);
  doc.text(pdfSafe("Repères élaborés par l'équipe Koala Kids, inspirés des travaux de Francine Ferland."),marge,270);
  doc.save('suivi-'+(ENFANT_PRENOM||'enfant').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+s.periode_debut+'.pdf');
}

boot();
