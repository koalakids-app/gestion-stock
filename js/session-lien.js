/* ===========================================================================
   Session courte des pages publiques ouvertes par un lien (?t=jeton) :
   famille, stagiaire, salarié(e) sans compte, devis, contrat...

   Le lien ne sert qu'à OUVRIR une session. Ensuite la page vit de cette
   session, qui se ferme toute seule :
     - après MINUTES minutes sans activité (clic, frappe, défilement...) ;
     - ou au plus tard DUREE_MAX_H heures après l'ouverture.
   Deux minutes avant, un avertissement propose de rester connecté(e). Passé le
   délai, la page est vidée et la personne doit CLIQUER À NOUVEAU sur le lien
   qu'elle a reçu : le jeton est retiré de l'adresse dès l'ouverture, un simple
   rechargement ne rouvre donc rien.

   Côté serveur (mode par défaut), la même règle est appliquée par
   supabase/functions/_shared/session-lien.ts : fermer la page ne suffirait
   pas, la session serait encore valide pour qui aurait copié la requête.
   Garder MINUTES et DUREE_MAX_H alignés avec INACTIVITE_S / DUREE_MAX_S de ce
   fichier-là (le serveur renvoie ses valeurs, qui font foi à l'ouverture).

   Usage dans la page :
     const TOKEN = SessionLien.init({url:FN_URL, anonKey:SUPABASE_ANON_KEY});
     ...
     const j = await SessionLien.appel('get');           // remplace fetch(...)
   init() renvoie '' quand il n'y a ni lien ni session en cours : la page
   affiche alors son message « lien incomplet ». Option {serveur:false} pour
   une fonction qui ne connaît pas encore les sessions : seule la fermeture de
   la page est assurée, le jeton continue de voyager à chaque appel.
   =========================================================================== */
(function(){
  'use strict';

  var MINUTES = 15;            // inactivité tolérée
  var DUREE_MAX_H = 2;         // durée maximale d'une session
  var AVERTIR_S = 120;         // avertissement à N secondes de la fin
  var RENOUVELER_MS = 60000;   // au plus une prolongation par minute

  var cfg = null, token = '', session = '', finMax = Infinity;
  var derniere = 0, dernierRenouv = 0, inactiviteMs = MINUTES * 60000;
  var terminee = false, minuteur = null, ouverture = null, renouv = null;
  var elAvert = null, elInfo = null, avertiDur = false;

  function cleStock(){ return 'session-lien:' + cfg.url; }
  function cleFin(){ return cleStock() + ':fin'; }
  function lire(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
  function ecrire(k,v){ try{ if(v==null) sessionStorage.removeItem(k); else sessionStorage.setItem(k,v); }catch(e){} }

  function sauver(){
    ecrire(cleStock(), JSON.stringify({session:session, token:cfg.serveur?'':token,
      finMax:finMax===Infinity?0:finMax, derniere:derniere, inactiviteMs:inactiviteMs}));
  }

  /* ------------------------------------------------------------- démarrage */

  function init(options){
    cfg = Object.assign({serveur:true}, options||{});
    var p = new URLSearchParams(location.search);
    var t = p.get('t') || '';

    if(t){
      token = t;
      ecrire(cleStock(), null); ecrire(cleFin(), null);
      p.delete('t');
      var q = p.toString();
      try{ history.replaceState(null, '', location.pathname + (q?'?'+q:'') + location.hash); }catch(e){}
    }else{
      var s = null;
      try{ s = JSON.parse(lire(cleStock())||'null'); }catch(e){}
      if(s && Date.now()-s.derniere < (s.inactiviteMs||inactiviteMs) && (!s.finMax || s.finMax>Date.now())
         && (cfg.serveur ? s.session : s.token)){
        session = s.session||''; token = s.token||''; finMax = s.finMax||Infinity;
        inactiviteMs = s.inactiviteMs||inactiviteMs; derniere = s.derniere;
      }else{
        ecrire(cleStock(), null);
        if(lire(cleFin())) afficherFin('inactivite', true);
        return '';
      }
    }
    if(!derniere) derniere = Date.now();
    if(!dernierRenouv) dernierRenouv = Date.now();

    ['pointerdown','pointermove','keydown','touchstart','scroll','input','change','wheel']
      .forEach(function(e){ window.addEventListener(e, activite, {passive:true, capture:true}); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) tic(); });
    window.addEventListener('pagehide', sauver);
    minuteur = setInterval(tic, 1000);
    sauver();
    return 'ok';
  }

  /* ---------------------------------------------------------------- activité */

  function activite(){
    if(terminee || elAvert) return;       // l'avertissement se referme par son bouton
    var m = Date.now();
    derniere = m;
    if(cfg.serveur && session && m - dernierRenouv > RENOUVELER_MS) renouveler();
  }

  function renouveler(){
    if(renouv) return renouv;
    dernierRenouv = Date.now();
    renouv = post({action:'prolonger', session:session}).then(function(j){
      session = j.session; finMax = j.fin_max || finMax; sauver();
    }).catch(function(){ /* réseau : le prochain appel ou la prochaine minute réessaie */ })
      .then(function(){ renouv = null; });
    return renouv;
  }

  /* --------------------------------------------------------------- compte à rebours */

  function tic(){
    if(terminee) return;
    var m = Date.now();
    var finInact = derniere + inactiviteMs;
    var fin = Math.min(finInact, finMax);
    var reste = fin - m;
    if(reste <= 0) return afficherFin(finMax <= finInact && m >= finMax ? 'duree' : 'inactivite');
    if(reste <= AVERTIR_S*1000){
      var dur = finMax <= finInact;
      if(dur && avertiDur) return;        // déjà prévenu(e) de la durée maximale
      avertir(reste, dur);
    }else if(elAvert){
      fermerAvert();
    }
  }

  function dureeTxt(ms){
    var s = Math.max(0, Math.ceil(ms/1000));
    return Math.floor(s/60) + ':' + ('0'+(s%60)).slice(-2);
  }

  function boite(id){
    var d = document.createElement('div');
    d.id = id;
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;'
      +'justify-content:center;padding:16px;background:rgba(30,41,59,.55);font-family:inherit';
    var c = document.createElement('div');
    c.style.cssText = 'background:#fff;color:#1e293b;border-radius:16px;max-width:380px;width:100%;'
      +'padding:24px 22px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3);line-height:1.45';
    d.appendChild(c);
    return {racine:d, carte:c};
  }
  function ligne(parent, tag, txt, css){
    var e = document.createElement(tag); e.textContent = txt; if(css) e.style.cssText = css;
    parent.appendChild(e); return e;
  }
  function bouton(parent, txt, fn){
    var b = ligne(parent, 'button', txt, 'margin-top:16px;padding:12px 22px;border:0;border-radius:10px;'
      +'background:#1e293b;color:#fff;font:inherit;font-weight:700;cursor:pointer;min-height:44px');
    b.type = 'button'; b.addEventListener('click', fn); return b;
  }

  var elCompte = null;
  function avertir(reste, dur){
    if(!elAvert){
      var b = boite('session-lien-avert');
      b.racine.setAttribute('role','alertdialog'); b.racine.setAttribute('aria-live','assertive');
      ligne(b.carte, 'div', '⏱️', 'font-size:34px');
      ligne(b.carte, 'h2', dur ? 'Fin de session proche' : 'Êtes-vous toujours là ?', 'margin:6px 0 8px;font-size:18px');
      ligne(b.carte, 'p', dur
        ? 'Par sécurité, une session dure au maximum '+DUREE_MAX_H+' h. Terminez ce que vous faites : ensuite, rouvrez simplement le lien que vous avez reçu.'
        : 'Sans activité de votre part, la session va se fermer par sécurité. Il suffira alors de rouvrir le lien que vous avez reçu.',
        'margin:0 0 10px;font-size:14px;color:#475569');
      elCompte = ligne(b.carte, 'div', '', 'font-size:30px;font-weight:800;font-variant-numeric:tabular-nums');
      bouton(b.carte, dur ? 'J’ai compris' : 'Rester connecté(e)', function(){
        if(dur){ avertiDur = true; fermerAvert(); return; }
        derniere = Date.now(); fermerAvert();
        if(cfg.serveur && session) renouveler();
      });
      document.body.appendChild(b.racine);
      elAvert = b.racine;
    }
    elCompte.textContent = dureeTxt(reste);
  }
  function fermerAvert(){
    if(elAvert && elAvert.parentNode) elAvert.parentNode.removeChild(elAvert);
    elAvert = null; elCompte = null;
  }

  function afficherFin(raison, sansVider){
    if(terminee) return;
    terminee = true;
    clearInterval(minuteur);
    ecrire(cleStock(), null); ecrire(cleFin(), '1');
    token = ''; session = '';
    function monter(){
      /* On vide la page : rien de personnel ne doit rester à l'écran d'un
         téléphone ou d'un ordinateur laissé ouvert (sansVider : page pas encore
         chargée, il n'y a rien à effacer et la page a besoin de ses éléments). */
      if(!sansVider) Array.prototype.slice.call(document.body.children).forEach(function(n){
        if(n.tagName!=='SCRIPT') n.parentNode.removeChild(n);
      });
      var b = boite('session-lien-fin');
      b.racine.style.background = '#f1f5f9';
      ligne(b.carte, 'div', '🔒', 'font-size:40px');
      ligne(b.carte, 'h2', 'Session terminée', 'margin:6px 0 8px;font-size:20px');
      ligne(b.carte, 'p', raison==='duree'
        ? 'Par sécurité, une session dure au maximum '+DUREE_MAX_H+' h.'
        : 'Par sécurité, la session s’est fermée après '+Math.round(inactiviteMs/60000)+' minutes d’inactivité.',
        'margin:0 0 10px;font-size:14px;color:#475569');
      ligne(b.carte, 'p', 'Pour reprendre, rouvrez le lien que vous avez reçu (e-mail, message…) en cliquant dessus. '
        +'Ce qui a déjà été envoyé est conservé ; ce qui n’était pas encore envoyé est à ressaisir.',
        'margin:0;font-size:14px;color:#475569');
      document.body.appendChild(b.racine);
    }
    if(document.body) monter(); else document.addEventListener('DOMContentLoaded', monter);
  }

  /* ------------------------------------------------------------------ réseau */

  function post(corps){
    return fetch(cfg.url, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':cfg.anonKey,'Authorization':'Bearer '+cfg.anonKey},
      body:JSON.stringify(corps)
    }).then(function(r){
      return r.json().catch(function(){ return null; }).then(function(j){
        if(!r.ok || !j || j.erreur){
          var e = (j && j.erreur) || ('Erreur '+r.status);
          if(e==='session_terminee' || e==='session_requise') afficherFin('inactivite');
          throw new Error(e);
        }
        return j;
      });
    });
  }

  function ouvrir(){
    if(session) return Promise.resolve();
    if(!ouverture){
      ouverture = post({action:'ouvrir', token:token}).then(function(j){
        session = j.session;
        if(j.inactivite_s) inactiviteMs = j.inactivite_s*1000;
        finMax = j.fin_max || Infinity;
        derniere = dernierRenouv = Date.now();
        sauver(); montrerInfo();
      }).then(function(){ ouverture = null; }, function(e){ ouverture = null; throw e; });
    }
    return ouverture;
  }

  /* Remplace le fetch de la page : même résultat, mêmes erreurs (Error(message)). */
  function appel(action, payload){
    if(terminee) return Promise.reject(new Error('session_terminee'));
    if(!cfg.serveur){
      return post(Object.assign({action:action, token:token}, payload||{})).then(function(j){
        montrerInfo();   // une seule fois : elInfo garde la trace
        return j;
      });
    }
    return ouvrir().then(function(){
      return post(Object.assign({action:action, session:session}, payload||{}));
    });
  }

  /* ------------------------------------------------------- information d'ouverture */

  function montrerInfo(){
    if(elInfo || terminee || !document.body) return;
    var d = document.createElement('div');
    d.setAttribute('role','status');
    d.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147482000;max-width:520px;margin:0 auto;'
      +'background:#1e293b;color:#fff;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.4;'
      +'display:flex;gap:10px;align-items:flex-start;box-shadow:0 6px 20px rgba(0,0,0,.25);font-family:inherit';
    var t = document.createElement('span');
    t.style.flex = '1';
    t.textContent = '🔒 Pour votre sécurité, cette page se ferme après '+Math.round(inactiviteMs/60000)
      +' minutes sans activité (et au plus '+DUREE_MAX_H+' h). Vous serez prévenu(e) 2 minutes avant.';
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label','Fermer');
    x.style.cssText = 'border:0;background:none;color:#fff;font-size:16px;cursor:pointer;padding:0 4px';
    function fermer(){ if(d.parentNode) d.parentNode.removeChild(d); }
    x.addEventListener('click', fermer);
    d.appendChild(t); d.appendChild(x);
    document.body.appendChild(d); elInfo = d;
    setTimeout(fermer, 15000);
  }

  window.SessionLien = {init:init, appel:appel};
})();
