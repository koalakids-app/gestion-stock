/* Barre de navigation entre modules, présente sur les pages internes.
   Barre flottante verticale au-dessus de la bulle koala : un clic passe d'un module à l'autre sans repasser par le portail.
   Le module en cours est surligné ; icônes seules (le nom s’affiche au survol).
   Apparaît seulement une fois connecté·e. Client Supabase : celui de la page (`sb`), sinon un client propre
   (même principe que js/support-chat.js). */
(function () {
  'use strict';
  if (window.__kkNavModules) return;
  window.__kkNavModules = true;
  if (window.top !== window.self) return;

  var MODULES = [
    { f: 'demandes.html', ico: 'ti-building-community', t: 'Demandes' },
    { f: 'inscriptions.html', ico: 'ti-file-description', t: 'Devis' },
    { f: 'contrats.html', ico: 'ti-contract', t: 'Contrats' },
    { f: 'factures.html', ico: 'ti-receipt-2', t: 'Factures' },
    { f: 'stock.html', ico: 'ti-package', t: 'Stock' },
    { f: 'infirmerie.html', ico: 'ti-first-aid-kit', t: 'Soins' },
    { f: 'documents.html', ico: 'ti-files', t: 'Documents' },
    { f: 'employes.html', ico: 'ti-users', t: 'Équipe', direction: true },
    { f: 'parametres.html', ico: 'ti-settings', t: 'Paramètres', direction: true }
  ];

  var SB_URL = 'https://juyrceadazrovlitxceb.supabase.co';
  var SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug';

  var sbPropre = null, profil = null, dock = null;

  function sessionPage() { return typeof window.kkSupportSession === 'function' ? window.kkSupportSession() : null; }
  function getSb() {
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (e) { /* pas de client de page */ }
    if (!sbPropre && window.supabase && window.supabase.createClient) {
      try {
        sbPropre = typeof window.kkSupportSession === 'function'
          ? window.supabase.createClient(SB_URL, SB_ANON_KEY, { accessToken: function () { var s = sessionPage(); return Promise.resolve(s ? s.access_token : null); } })
          : window.supabase.createClient(SB_URL, SB_ANON_KEY);
      } catch (e) { return null; }
    }
    return sbPropre;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pageCourante() { return (location.pathname.split('/').pop() || 'index.html'); }
  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }

  /* ---------- session / profil ---------- */
  async function uidConnecte() {
    var s = sessionPage();
    if (s && s.user) return s.user.id;
    var c = getSb();
    if (!c || !c.auth) return null;
    try { var r = await c.auth.getSession(); return r && r.data && r.data.session ? r.data.session.user.id : null; } catch (e) { return null; }
  }
  async function chargerProfil(uid) {
    var c = getSb();
    if (!c) return null;
    try {
      var r = await c.from('referents').select('id,name,role,creche_id').eq('user_id', uid).maybeSingle();
      return r && r.data ? r.data : null;
    } catch (e) { return null; }
  }

  /* ---------- barre ---------- */
  function css() {
    if (document.getElementById('kk-nav-css')) return;
    if (!document.querySelector('link[href*="tabler-icons"]')) {
      var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css'; document.head.appendChild(lk);
    }
    var st = document.createElement('style');
    st.id = 'kk-nav-css';
    st.textContent =
      '#kk-nav{position:fixed;right:36px;bottom:156px;z-index:9985;display:flex;flex-direction:column;align-items:center;gap:2px;max-height:calc(100vh - 180px);background:#fff;border:1px solid rgba(61,53,128,.18);border-radius:999px;padding:4px;box-shadow:0 6px 24px rgba(30,25,80,.22);overflow-y:auto;scrollbar-width:none}' +
      '#kk-nav::-webkit-scrollbar{display:none}' +
      '#kk-nav a,#kk-nav button{display:flex;align-items:center;justify-content:center;width:38px;height:38px;padding:0;border-radius:50%;border:none;background:transparent;color:#3D3580;text-decoration:none;cursor:pointer;flex:none;font-family:inherit}' +
      '#kk-nav a span{display:none}' +
      '#kk-nav a:hover,#kk-nav button:hover{background:rgba(61,53,128,.1)}' +
      '#kk-nav a.kk-cur{background:#3D3580;color:#fff}' +
      '#kk-nav i{font-size:19px}' +
      '#kk-nav .kk-sep{width:20px;height:1px;background:rgba(61,53,128,.2);margin:3px 0;flex:none}' +
      '#kk-nav-menu{position:fixed;right:92px;bottom:156px;z-index:9986;display:flex;flex-direction:column;background:#fff;border:1px solid rgba(61,53,128,.18);border-radius:16px;padding:6px;box-shadow:0 8px 28px rgba(30,25,80,.25);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Nunito,sans-serif}' +
      '#kk-nav-menu a{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:10px;color:#3D3580;font-size:13.5px;font-weight:600;text-decoration:none}' +
      '#kk-nav-menu a:hover{background:rgba(61,53,128,.1)}#kk-nav-menu a.kk-cur{background:#3D3580;color:#fff}#kk-nav-menu i{font-size:18px}' +
      '#kk-nav.kk-ferme a:not(.kk-portail),#kk-nav.kk-ferme #kk-nav-plus,#kk-nav.kk-ferme .kk-sep{display:none}' +
      '@media (max-width:768px){#kk-nav{right:28px;bottom:208px}#kk-nav-menu{right:80px;bottom:208px}}';
    document.head.appendChild(st);
  }

  function lien(m, cur) {
    return '<a href="' + m.f + '"' + (m.f === cur ? ' class="kk-cur" aria-current="page"' : '') + ' title="' + esc(m.t) + '"><i class="ti ' + m.ico + '"></i><span>' + esc(m.t) + '</span></a>';
  }
  /* Modules consultés récemment (le dernier ouvert en tête), mémorisés dans ce navigateur. */
  var NB_RECENTS = 5, PAR_DEFAUT = ['demandes.html', 'inscriptions.html', 'contrats.html'];
  function noterVisite(cur, permis) {
    var liste = [];
    try { liste = JSON.parse(lire('kk_nav_recents') || '[]'); } catch (e) { liste = []; }
    if (!Array.isArray(liste)) liste = [];
    if (permis.some(function (m) { return m.f === cur; })) liste = [cur].concat(liste.filter(function (f) { return f !== cur; }));
    liste = liste.slice(0, 12);
    ecrire('kk_nav_recents', JSON.stringify(liste));
    PAR_DEFAUT.forEach(function (f) { if (liste.length < 3 && liste.indexOf(f) < 0) liste.push(f); });
    return liste.map(function (f) { return permis.filter(function (m) { return m.f === f; })[0]; })
      .filter(Boolean).slice(0, NB_RECENTS);
  }
  function basculerMenu() {
    var m = document.getElementById('kk-nav-menu');
    if (m) { m.remove(); return; }
    var cur = pageCourante(), dir = profil && profil.role === 'direction';
    m = document.createElement('div');
    m.id = 'kk-nav-menu';
    m.innerHTML = MODULES.filter(function (x) { return !x.direction || dir; }).map(function (x) { return lien(x, cur); }).join('');
    document.body.appendChild(m);
    setTimeout(function () { document.addEventListener('click', function f(e) { if (!m.contains(e.target) && e.target.closest && !e.target.closest('#kk-nav-plus')) { m.remove(); document.removeEventListener('click', f); } }); }, 0);
  }

  function construireBarre() {
    if (dock) return;
    css();
    var cur = pageCourante();
    var dir = profil && profil.role === 'direction';
    var permis = MODULES.filter(function (m) { return !m.direction || dir; });
    var recents = noterVisite(cur, permis);
    var h = '<a class="kk-portail" href="index.html" title="Retour au portail"><i class="ti ti-home"></i><span>Portail</span></a><span class="kk-sep"></span>';
    recents.forEach(function (m) { h += lien(m, cur); });
    h += '<button type="button" id="kk-nav-plus" title="Tous les modules" aria-label="Tous les modules" aria-haspopup="true"><i class="ti ti-layout-grid"></i></button>';
    h += '<button type="button" id="kk-nav-tog" title="Replier / déplier la barre" aria-label="Replier la barre"><i class="ti ti-chevron-down"></i></button>';
    dock = document.createElement('nav');
    dock.id = 'kk-nav';
    dock.setAttribute('aria-label', 'Navigation entre modules');
    dock.innerHTML = h;
    if (lire('kk_nav_ferme') === '1') dock.classList.add('kk-ferme');
    document.body.appendChild(dock);
    document.getElementById('kk-nav-tog').addEventListener('click', function () {
      var f = dock.classList.toggle('kk-ferme');
      ecrire('kk_nav_ferme', f ? '1' : '0');
      this.querySelector('i').className = 'ti ' + (f ? 'ti-chevron-up' : 'ti-chevron-down');
    });
    document.getElementById('kk-nav-plus').addEventListener('click', basculerMenu);
    if (dock.classList.contains('kk-ferme')) document.querySelector('#kk-nav-tog i').className = 'ti ti-chevron-up';
  }

  /* ---------- démarrage : la barre n'apparaît qu'une fois connecté·e ---------- */
  async function essayer() {
    if (dock) return true;
    var uid = await uidConnecte();
    if (!uid) return false;
    profil = await chargerProfil(uid);
    /* Compte sans fiche référent (ex. employé·e) : pas de barre. */
    if (!profil || profil.role === 'employe') return true;
    construireBarre();
    return true;
  }
  function demarrer() {
    var essais = 0;
    (async function boucle() {
      var ok = false;
      try { ok = await essayer(); } catch (e) { /* on réessaie */ }
      if (!ok && ++essais < 200) setTimeout(boucle, 3000);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
