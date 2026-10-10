const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function showState(titre,texte,lien){
  document.getElementById('zone').innerHTML=
    '<div class="state"><strong>'+esc(titre)+'</strong>'+esc(texte)+
    (lien?'<br><a href="'+lien+'">Se connecter</a>':'')+'</div>';
}

function render(list){
  if(!list.length){
    showState('Aucun padlet disponible','Aucune ressource ne vous est accessible pour le moment.');
    return;
  }
  document.getElementById('zone').innerHTML='<div class="cards">'+list.map(p=>
    '<a href="'+esc(p.url)+'" target="_blank" rel="noopener" class="card">'+
      '<div class="card-icon">'+esc(p.icone||'📌')+'</div>'+
      '<div class="card-text"><h2>'+esc(p.titre)+'</h2></div>'+
      '<div class="card-arrow">›</div>'+
    '</a>').join('')+'</div>';
}

window.addEventListener('DOMContentLoaded',async function(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){
    showState('Connexion requise','Connectez-vous à l\'application pour accéder aux padlets.','demandes.html');
    return;
  }
  const {data,error}=await sb.from('padlets')
    .select('titre,icone,url,ordre')
    .order('ordre',{ascending:true});
  if(error){
    console.error('[padlets]',error);
    showState('Erreur de chargement','Impossible de récupérer la liste des padlets.');
    return;
  }
  render(data||[]);
});
