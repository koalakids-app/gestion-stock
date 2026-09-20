/* ============================================================================
   GARDE DES FENÊTRES (modales) — ne plus perdre une saisie par un clic à côté
   ----------------------------------------------------------------------------
   Toutes les pages ferment une fenêtre quand on clique sur le fond grisé. Deux
   cas faisaient perdre ce qu'on venait de remplir :
     1. sélectionner du texte dans un champ et relâcher la souris hors de la
        fenêtre : le navigateur envoie alors un « clic » sur le fond ;
     2. un simple clic à côté pendant la saisie.
   Ce fichier s'applique seul à tous les fonds de fenêtre (.overlay, .ov,
   .modal-overlay), sans toucher aux pages :
     - un clic dont le bouton a été enfoncé DANS la fenêtre est ignoré ;
     - si l'on a modifié un champ depuis l'ouverture, le clic sur le fond demande
       confirmation avant de fermer. Les fenêtres de simple lecture se ferment
       comme avant.
   Les boutons Annuler / croix ne sont pas concernés.
   ============================================================================ */
(function(){
  var SEL='.overlay,.ov,.modal-overlay';
  var appuiSur=null;
  var CONFIRM='Fermer sans enregistrer ?\n\nCe que vous avez saisi sera perdu.';

  function fond(el){return el&&el.closest?el.closest(SEL):null;}

  // Un champ modifié marque sa fenêtre comme « sale ».
  function marquer(e){
    var f=fond(e.target);
    if(f&&e.target!==f)f.__saisie=true;
  }
  document.addEventListener('input',marquer,true);
  document.addEventListener('change',marquer,true);

  // Ouverture / fermeture d'une fenêtre = attribut class ou style du fond qui change :
  // la saisie précédente ne compte plus.
  if(window.MutationObserver){
    new MutationObserver(function(muts){
      muts.forEach(function(m){
        if(m.target&&m.target.matches&&m.target.matches(SEL))m.target.__saisie=false;
      });
    }).observe(document.documentElement,{attributes:true,attributeFilter:['class','style'],subtree:true});
  }

  document.addEventListener('mousedown',function(e){appuiSur=e.target;},true);
  document.addEventListener('touchstart',function(e){appuiSur=e.target;},true);

  document.addEventListener('click',function(e){
    var t=e.target;
    if(!t||!t.matches||!t.matches(SEL))return;
    var depart=appuiSur;appuiSur=null;
    // Bouton enfoncé dans la fenêtre puis relâché sur le fond (sélection de texte) : on ignore.
    if(depart&&depart!==t){e.stopImmediatePropagation();e.preventDefault();return;}
    if(t.__saisie){
      if(window.confirm(CONFIRM)){t.__saisie=false;}
      else{e.stopImmediatePropagation();e.preventDefault();}
    }
  },true);
})();
