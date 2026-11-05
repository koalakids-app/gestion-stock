/* Plusieurs onglets connectés : chaque module déconnecte à l'ouverture (postes partagés),
   ce qui détruisait la session du premier onglet quand on en ouvrait un second. Chaque
   onglet connecté écrit un signal de vie (localStorage, clé propre à l'onglet, retirée à
   la fermeture) ; un onglet qui s'ouvre garde la session s'il en trouve un de moins de 8 s.
   Tous onglets fermés, la déconnexion à l'ouverture reste de rigueur. */
(function(){
  var PREFIXE='kk_onglet_', ID=Math.random().toString(36).slice(2), cle=PREFIXE+ID, minuteur=null;
  function autre(){
    try{
      var now=Date.now();
      for(var i=0;i<localStorage.length;i++){
        var k=localStorage.key(i);
        if(!k||k.indexOf(PREFIXE)!==0||k===cle)continue;
        var t=parseInt(localStorage.getItem(k),10);
        if(t&&now-t<8000)return true;
      }
    }catch(e){}
    return false;
  }
  /* estConnecte : fonction qui dit si cet onglet porte une session. */
  function suivre(estConnecte){
    if(minuteur)return;
    function signal(){
      try{
        var ok=false;try{ok=!!estConnecte();}catch(e){}
        if(ok)localStorage.setItem(cle,String(Date.now()));
        else localStorage.removeItem(cle);
      }catch(e){}
    }
    minuteur=setInterval(signal,3000);
    window.addEventListener('pagehide',function(){try{localStorage.removeItem(cle);}catch(e){}});
  }
  window.kkOnglets={autre:autre,suivre:suivre};
})();
