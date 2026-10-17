/* Renvoi d'un(e) employé(e) vers « Mon espace » quand il/elle ouvre un module
   réservé à la direction et aux directeurs/trices techniques (demandes,
   employes, suivi). Affiche d'abord un message clair, puis redirige.
   Mémorise aussi le rôle dans le navigateur pour que l'accueil (index.html)
   masque les cartes inutiles — simple confort, la protection reste côté
   Supabase (RLS). */
function kkRenvoiEmploye(){
  try{localStorage.setItem('kk_role','employe');}catch(e){}
  if(document.getElementById('kkRenvoiEmploye'))return;
  var d=document.createElement('div');
  d.id='kkRenvoiEmploye';
  d.setAttribute('role','alert');
  d.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:#fff7ef;font-family:Nunito,system-ui,sans-serif;text-align:center';
  d.innerHTML='<div style="max-width:420px"><div style="font-size:42px;margin-bottom:10px">🔒</div>'
    +'<h2 style="margin:0 0 10px;font-size:20px;color:#333">Module réservé</h2>'
    +'<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#555">Ce module est réservé à la direction et aux directeurs/trices techniques.<br>Vous êtes redirigé(e) vers <strong>Mon espace</strong>.</p>'
    +'<a href="collaborateur.html" style="display:inline-block;padding:10px 20px;border-radius:12px;background:#f57c00;color:#fff;font-weight:700;text-decoration:none">Aller à Mon espace</a></div>';
  document.body.appendChild(d);
  setTimeout(function(){window.location.replace('collaborateur.html');},3000);
}
