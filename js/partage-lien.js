/* ===========================================================================
   Partage d'un lien par n'importe quel canal (WhatsApp, SMS, Messenger, Signal,
   AirDrop…) via la feuille de partage de l'appareil.

   Rien ne transite par nos serveurs : c'est le téléphone ou l'ordinateur de la
   personne qui envoie qui ouvre l'application choisie. Sur un appareil sans
   feuille de partage (la plupart des navigateurs de bureau), le bouton n'est pas
   affiché (PartageLien.disponible()) et le lien reste copiable comme avant.

   Usage : PartageLien.partager(url,{titre:'…',texte:'Voici le lien pour … :'})
   =========================================================================== */
window.PartageLien = {
  disponible: function(){ return typeof navigator.share === 'function'; },
  /* Renvoie 'partage', 'annule' (feuille fermée), 'copie' ou 'manuel'. Si le
     partage échoue pour une autre raison, on retombe sur la copie : le lien ne
     doit jamais rester bloqué derrière un bouton. */
  partager: async function(url, opts){
    opts = opts || {};
    try{
      await navigator.share({title: opts.titre || '',
        text: (opts.texte ? opts.texte + '\n\n' : '') + url});
      return 'partage';
    }catch(e){
      if(e && e.name === 'AbortError') return 'annule';
    }
    try{ await navigator.clipboard.writeText(url); return 'copie'; }
    catch(e){ prompt('Copiez ce lien :', url); return 'manuel'; }
  }
};
