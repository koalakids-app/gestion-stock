const FN="https://juyrceadazrovlitxceb.supabase.co/functions/v1/preinscription-publique";
const ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function eur(n){const v=Math.round(Number(n||0)*100)/100;const p=Math.abs(v).toFixed(2).replace('.',',').split(',');
  return (v<0?'− ':'')+p[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+p[1]+' €';}
const JN=['','lundi','mardi','mercredi','jeudi','vendredi'];
const TITRES=['','1 sur 4 · L\'enfant','2 sur 4 · Les parents et le foyer','3 sur 4 · L\'accueil souhaité','4 sur 4 · Récapitulatif'];

async function appel(corps){
  const r=await fetch(FN,{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+ANON},body:JSON.stringify(corps)});
  let d=null;try{d=await r.json();}catch(e){}
  if(!r.ok)throw new Error((d&&d.erreur)||'Une erreur est survenue. Réessayez dans un instant.');
  return d;
}

/* L'adresse peut porter ?c=<identifiant de crèche> (présélection) ou ?o=<slug
   d'organisation>. Ce ne sont pas des secrets : rien n'ouvre de session. */
const Q=new URLSearchParams(location.search);
const CRECHE_URL=Q.get('c')||'',ORG_URL=Q.get('o')||'';

async function init(){
  try{
    const d=await appel({action:'config',creche_id:CRECHE_URL,org:ORG_URL});
    if(d.org.logo_url)$('logo').src=d.org.logo_url;
    $('logo').alt=d.org.nom;document.title=d.org.nom+' — Préinscription';
    if(!d.creches.length)throw new Error('Aucune crèche n\'est ouverte à la préinscription pour le moment.');
    $('aCreche').innerHTML=(d.creches.length>1?'<option value="">— choisir —</option>':'')
      +d.creches.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.nom)+'</option>').join('');
    if(CRECHE_URL&&d.creches.some(c=>c.id===CRECHE_URL))$('aCreche').value=CRECHE_URL;
    $('chargement').style.display='none';$('form').style.display='';
    suivant(1);
  }catch(e){
    $('chargement').style.display='none';
    const f=$('fatal');f.textContent=e.message;f.style.display='';
  }
}

function syncNe(){$('lbDob').innerHTML=($('eNe').value==='a_naitre'?'Terme prévu':'Date de naissance')+' <i>*</i>';}
function syncPai(){$('wrapPai').style.display=$('ePai').checked?'':'none';}
function erreur(m,ids){
  document.querySelectorAll('.bad').forEach(e=>e.classList.remove('bad'));
  (ids||[]).forEach(i=>$(i)&&$(i).classList.add('bad'));
  const e=$('err');e.textContent=m||'';e.style.display=m?'':'none';
  if(m)e.scrollIntoView({block:'center',behavior:'smooth'});
}
const valide={
  1(){
    const ids=[];['ePrenom','eNom','eDob'].forEach(i=>{if(!$(i).value.trim())ids.push(i);});
    return ids.length?[ 'Indiquez le prénom, le nom et la '+($('eNe').value==='a_naitre'?'date de terme':'date de naissance')+' de l\'enfant.',ids]:null;
  },
  2(){
    const ids=[];['p1Prenom','p1Nom'].forEach(i=>{if(!$(i).value.trim())ids.push(i);});
    if(ids.length)return['Indiquez le prénom et le nom du premier parent.',ids];
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('p1Mail').value.trim()))return['Indiquez une adresse e-mail valide.',['p1Mail']];
    if($('p1Tel').value.replace(/\D/g,'').length<9)return['Indiquez un numéro de téléphone valide.',['p1Tel']];
    const m2=$('p2Mail').value.trim();
    if(m2&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m2))return['L\'adresse e-mail du parent 2 est incorrecte.',['p2Mail']];
    return null;
  },
  3(){
    if(!$('aCreche').value)return['Choisissez une crèche.',['aCreche']];
    if(!jours().length)return['Choisissez au moins un jour d\'accueil.',[]];
    if(!$('aHd').value||!$('aHf').value||$('aHf').value<=$('aHd').value)return['L\'arrivée doit précéder le départ.',['aHd','aHf']];
    return null;
  }
};
function jours(){return[...document.querySelectorAll('#jours input:checked')].map(i=>Number(i.value));}

function suivant(n){
  /* Avancer exige que les étapes précédentes soient valides ; reculer est libre. */
  const cur=Number((document.querySelector('.step.on')||{id:'p1'}).id.slice(1));
  if(n>cur){for(let i=cur;i<n;i++){const v=valide[i]&&valide[i]();if(v){erreur(v[0],v[1]);return;}}}
  erreur('');
  document.querySelectorAll('.step').forEach(s=>s.classList.toggle('on',s.id==='p'+n));
  for(let i=1;i<=4;i++)$('st'+i).classList.toggle('on',i<=n);
  $('stl').textContent=TITRES[n];
  if(n===3)estimer();
  if(n===4)recap();
  scrollTo(0,0);
}

/* L'estimation vient du serveur, qui relit la grille tarifaire : la page n'a
   aucun tarif en dur. Les saisies rapides sont regroupées (250 ms) et une
   réponse tardive ne remplace jamais une plus récente. */
let tEst=null,seqEst=0,EST=null;
function corpsAccueil(){
  return{creche_id:$('aCreche').value,jours:jours(),heure_debut:$('aHd').value,heure_fin:$('aHf').value,
    date_entree:$('aEntree').value||null,revenus:$('fRev').value===''?null:Number($('fRev').value),
    isole:$('fIsole').checked,dob:$('eDob').value||null};
}
function estimer(){
  clearTimeout(tEst);EST=null;
  if(!$('aCreche').value||!jours().length||!$('aHd').value||!$('aHf').value||$('aHf').value<=$('aHd').value){
    $('liveTot').textContent='—';$('liveSub').textContent='Choisissez une crèche, des jours et des horaires';return;
  }
  tEst=setTimeout(async()=>{
    const m=++seqEst;
    try{
      const d=await appel(Object.assign({action:'estimer'},corpsAccueil()));
      if(m!==seqEst)return;
      EST=d;$('liveTot').textContent=eur(d.mensuel)+' / mois';
      $('liveSub').textContent=d.reste!=null?'soit environ '+eur(d.reste)+' après aide CAF (CMG)':'avant aide CAF (CMG)';
    }catch(e){if(m===seqEst){$('liveTot').textContent='—';$('liveSub').textContent=e.message;}}
  },250);
}

function recap(){
  const sel=$('aCreche');
  const kv=(k,v)=>'<div class="kv"><span class="k">'+k+'</span><span class="v">'+esc(v||'—')+'</span></div>';
  const d=$('eDob').value.split('-').reverse().join('/');
  $('recap').innerHTML=
    kv('Enfant',$('ePrenom').value.trim()+' '+$('eNom').value.trim())
   +kv($('eNe').value==='a_naitre'?'Terme prévu':'Naissance',d)
   +kv('Parent 1',$('p1Prenom').value.trim()+' '+$('p1Nom').value.trim()+' · '+$('p1Tel').value.trim())
   +kv('E-mail',$('p1Mail').value.trim())
   +kv('Crèche',sel.options[sel.selectedIndex]?sel.options[sel.selectedIndex].text:'')
   +kv('Accueil',jours().map(j=>JN[j]).join(', ')+' · '+$('aHd').value+'–'+$('aHf').value)
   +kv('Estimation',EST?eur(EST.mensuel)+' / mois (avant aides)':'—');
}

async function envoyer(){
  if(!$('cRgpd').checked||!$('cVrai').checked){erreur('Cochez les deux cases pour envoyer votre demande.',[]);return;}
  for(let i=1;i<=3;i++){const v=valide[i]();if(v){suivant(i);erreur(v[0],v[1]);return;}}
  const b=$('btnEnvoi');b.disabled=true;b.textContent='Envoi en cours…';erreur('');
  const parents=[{lien:$('p1Lien').value,prenom:$('p1Prenom').value,nom:$('p1Nom').value,email:$('p1Mail').value,telephone:$('p1Tel').value,profession:$('p1Pro').value}];
  if($('p2Prenom').value.trim()||$('p2Nom').value.trim()||$('p2Mail').value.trim()||$('p2Tel').value.trim())
    parents.push({lien:$('p2Lien').value,prenom:$('p2Prenom').value,nom:$('p2Nom').value,email:$('p2Mail').value,telephone:$('p2Tel').value});
  try{
    const d=await appel(Object.assign({action:'envoyer',
      site_web:$('site_web').value,consentement:true,
      enfant:{prenom:$('ePrenom').value,nom:$('eNom').value,sexe:$('eSexe').value,ne_ou_a_naitre:$('eNe').value,
        allergies:$('eAllergies').value,fratrie:$('eFratrie').checked,pai:$('ePai').checked,pai_detail:$('ePaiDetail').value},
      parents:parents,
      foyer:{adresse:$('fAdresse').value,code_postal:$('fCp').value,ville:$('fVille').value,num_allocataire:$('fAlloc').value,
        separes:$('fSepares').checked,alternee:$('fAlternee').checked},
      comment_connus:$('aConnu').value,message:$('aMessage').value},corpsAccueil()));
    if(d.pdf_joint)$('merciTxt').textContent+=' Votre demande est aussi jointe à l\'e-mail en PDF.';
    $('form').style.display='none';$('merci').style.display='';
    const e=d.estimation||EST;
    if(e){
      $('merciDevis').innerHTML=(e.lignes||[]).map(l=>'<tr><td>'+esc(l.libelle)+'</td><td class="m">'+eur(l.total)+'</td></tr>').join('')
        +(e.reste!=null?'<tr class="neg"><td>Aide CAF estimée (CMG)</td><td class="m">− '+eur(e.cmg)+'</td></tr>':'')
        +'<tr class="tot"><td>'+(e.reste!=null?'Reste à charge estimé':'Total mensuel estimé')+'</td><td class="m">'+eur(e.reste!=null?e.reste:e.mensuel)+'</td></tr>';
    }else $('merciDevis').closest('.card').style.display='none';
    scrollTo(0,0);
  }catch(e){
    erreur(e.message,[]);b.disabled=false;b.textContent='Envoyer ma demande';
  }
}

['fRev','fIsole','eDob'].forEach(i=>$(i).addEventListener('change',()=>{if($('p3').classList.contains('on'))estimer();}));
init();
