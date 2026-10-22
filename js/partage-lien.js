/* ===========================================================================
   Partage d'un lien par n'importe quel canal (WhatsApp, SMS, Messenger, Signal,
   AirDrop…).

   Rien ne transite par nos serveurs : c'est le téléphone ou l'ordinateur de la
   personne qui envoie qui ouvre l'application choisie.
   - Téléphone / tablette : feuille de partage de l'appareil (WhatsApp y figure).
   - Ordinateur : la feuille de partage de Windows ne propose pas WhatsApp (ni
     WhatsApp Web, même installé) ; on affiche donc un petit choix avec un bouton
     WhatsApp (lien wa.me : ouvre l'application ou WhatsApp Web), la copie du
     lien et, si elle existe, la feuille de partage du système.

   Usage : PartageLien.partager(url,{titre:'…',texte:'Voici le lien pour … :'})
   =========================================================================== */
window.PartageLien = {
  /* Toujours vrai : WhatsApp (wa.me) et la copie fonctionnent partout. */
  disponible: function(){ return true; },
  _mobile: function(){
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
      || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || ''));
  },
  _copier: async function(url){
    try{ await navigator.clipboard.writeText(url); return 'copie'; }
    catch(e){ prompt('Copiez ce lien :', url); return 'manuel'; }
  },
  _systeme: async function(url, opts){
    try{
      await navigator.share({title: opts.titre || '',
        text: (opts.texte ? opts.texte + '\n\n' : '') + url});
      return 'partage';
    }catch(e){
      if(e && e.name === 'AbortError') return 'annule';
    }
    return PartageLien._copier(url);
  },
  /* Petit choix affiché sur ordinateur. Chaque bouton est un vrai clic de
     l'utilisateur : le navigateur laisse donc window.open ouvrir WhatsApp. */
  _choisir: function(url, opts){
    return new Promise(function(resolve){
      var fond = document.createElement('div');
      fond.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
      var boite = document.createElement('div');
      boite.style.cssText = 'background:#fff;border-radius:14px;padding:20px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:inherit';
      boite.innerHTML = '<div style="font-weight:700;margin-bottom:12px">Partager le lien</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px"></div>';
      var liste = boite.lastChild;
      function fin(r){ document.body.removeChild(fond); resolve(r); }
      function bouton(libelle, action){
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = libelle;
        b.style.cssText = 'padding:10px 14px;border:1px solid #ddd;border-radius:10px;background:#f8f8fb;cursor:pointer;font-size:14px;font-family:inherit;text-align:left';
        b.onclick = action;
        liste.appendChild(b);
      }
      bouton('WhatsApp', function(){
        var texte = (opts.texte ? opts.texte + '\n\n' : '') + url;
        window.open('https://wa.me/?text=' + encodeURIComponent(texte), '_blank', 'noopener');
        fin('partage');
      });
      bouton('Copier le lien', function(){
        PartageLien._copier(url).then(fin);
      });
      if(typeof navigator.share === 'function'){
        bouton('Autres applications…', function(){
          PartageLien._systeme(url, opts).then(fin);
        });
      }
      bouton('Annuler', function(){ fin('annule'); });
      fond.onclick = function(e){ if(e.target === fond) fin('annule'); };
      fond.appendChild(boite);
      document.body.appendChild(fond);
    });
  },
  /* Renvoie 'partage', 'annule' (fenêtre fermée), 'copie' ou 'manuel'. Le lien
     ne doit jamais rester bloqué derrière un bouton : à défaut de partage, on
     retombe sur la copie. */
  partager: async function(url, opts){
    opts = opts || {};
    if(typeof navigator.share === 'function' && PartageLien._mobile())
      return PartageLien._systeme(url, opts);
    return PartageLien._choisir(url, opts);
  }
};
