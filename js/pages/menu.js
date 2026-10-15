/* Menu du traiteur (et goûters de la crèche, paramètre ?c=<id crèche>) ouvert par une famille via QR code, sans compte. Aucune
   dépendance externe : seule la fonction publique `menu_public` est appelée
   (voir sql/menu_public.sql). Paramètre ?d=AAAA-MM-JJ (lundi de la semaine) ;
   sans paramètre, on affiche la semaine en cours (le week-end : la suivante),
   ce qui permet d'afficher un QR code permanent à l'entrée. */
const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";

const JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const PROFILS=[
  {cle:'bb6',titre:'Bébés − de 6 mois',gouter:null},
  {cle:'bb18',titre:'Bébés 6-18 mois',gouter:'bb18_gouter',creche:'bb18_gouter_creche'},
  {cle:'grand',titre:'Grands',gouter:'grand_gouter',creche:'grand_gouter_creche'}
];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

function lundiCourant(){
  const n=new Date();
  const dow=n.getDay(); // 0 = dimanche
  const decal=dow===0?1:dow===6?2:1-dow; // week-end : lundi suivant
  return iso(new Date(n.getFullYear(),n.getMonth(),n.getDate()+decal));
}
function dateLisible(s){
  const [y,m,j]=s.split('-').map(Number);
  return new Date(y,m-1,j).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
}

const param=new URLSearchParams(location.search).get('d')||'';
const DEBUT=/^\d{4}-\d{2}-\d{2}$/.test(param)?param:lundiCourant();
const crecheParam=new URLSearchParams(location.search).get('c')||'';
const CRECHE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(crecheParam)?crecheParam:null;
const contenu=document.getElementById('contenu');
const tabs=document.getElementById('tabs');
let MENU=[],profil=1;

function etat(icone,titre,msg){
  tabs.style.display='none';
  contenu.innerHTML='<div class="etat"><div class="big">'+icone+'</div><h2>'+esc(titre)+'</h2><p>'+esc(msg)+'</p></div>';
}

async function charger(){
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/menu_public',{method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},
      body:JSON.stringify({p_date:DEBUT,p_creche:CRECHE})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    MENU=await r.json();
  }catch(e){
    etat('⚠️','Menu indisponible','Impossible de charger le menu pour le moment. Réessayez dans un instant.');
    return;
  }
  if(!Array.isArray(MENU)||!MENU.length){
    etat('🍽️','Menu pas encore disponible','Le menu de la semaine du '+dateLisible(DEBUT)+' n’a pas encore été publié.');
    return;
  }
  const num=(MENU.find(function(x){return x.semaine_num;})||{}).semaine_num;
  document.getElementById('sub').textContent='Semaine du '+dateLisible(DEBUT)+(num?' (S'+num+')':'');
  tabs.style.display='flex';
  tabs.innerHTML=PROFILS.map((p,i)=>'<button type="button" role="tab" data-i="'+i+'">'+esc(p.titre)+'</button>').join('');
  tabs.onclick=function(ev){const b=ev.target.closest('button');if(b){profil=+b.dataset.i;afficher();}};
  afficher();
}

function afficher(){
  Array.prototype.forEach.call(tabs.children,function(b,i){b.classList.toggle('on',i===profil);b.setAttribute('aria-selected',i===profil);});
  const p=PROFILS[profil];
  const auj=iso(new Date());
  const parJour={};MENU.forEach(function(m){parJour[m.jour]=m;});
  let html='';
  for(let j=1;j<=5;j++){
    const m=parJour[j];
    const [y,mo,d]=DEBUT.split('-').map(Number);
    const dateJour=iso(new Date(y,mo-1,d+j-1));
    const estAuj=dateJour===auj;
    html+='<section class="jour'+(estAuj?' auj':'')+'"><h2>'+JOURS[j-1]+(estAuj?' <span class="badge">Aujourd’hui</span>':'')+'</h2>';
    if(m&&m.theme)html+='<div class="theme">'+esc(m.theme)+'</div>';
    const lignes=m&&Array.isArray(m[p.cle])?m[p.cle]:[];
    html+=lignes.length?'<ul>'+lignes.map(function(t){return'<li>'+esc(t)+'</li>';}).join('')+'</ul>':'<div class="vide">—</div>';
    if(p.gouter&&m&&m[p.gouter])html+='<div class="gouter">🍪 Goûter : '+esc(m[p.gouter])+(m[p.creche]?' <span class="fait">préparé par la crèche</span>':'')+'</div>';
    html+='</section>';
  }
  contenu.innerHTML=html;
}

charger();
