/* Barre de navigation entre modules + « Message rapide », présentes sur les pages internes.
   - Barre flottante en bas à gauche : un clic passe d'un module à l'autre sans repasser par le portail.
     Le module en cours est surligné ; sur mobile elle est repliée derrière un bouton.
   - « Message rapide » (direction et référents) : le message aux employés de Demandes, ouvert par-dessus
     la page en cours (mêmes tables que js/pages/demandes/15-messages-employes.js).
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

  var sbPropre = null, profil = null, dock = null, employes = null, creches = null, enCours = false;

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
      '#kk-nav{position:fixed;left:16px;bottom:16px;z-index:9985;display:flex;align-items:center;gap:2px;max-width:calc(100vw - 100px);background:#fff;border:1px solid rgba(61,53,128,.18);border-radius:999px;padding:4px;box-shadow:0 6px 24px rgba(30,25,80,.22);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Nunito,sans-serif;overflow-x:auto;scrollbar-width:none}' +
      '#kk-nav::-webkit-scrollbar{display:none}' +
      '#kk-nav a,#kk-nav button{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;border:none;background:transparent;color:#3D3580;font-size:12.5px;font-weight:600;line-height:1;font-family:inherit;text-decoration:none;white-space:nowrap;cursor:pointer;flex:none}' +
      '#kk-nav a:hover,#kk-nav button:hover{background:rgba(61,53,128,.1)}' +
      '#kk-nav a.kk-cur{background:#3D3580;color:#fff}' +
      '#kk-nav i{font-size:16px}' +
      '#kk-nav .kk-sep{width:1px;height:20px;background:rgba(61,53,128,.2);margin:0 3px;flex:none}' +
      '#kk-nav .kk-msg{background:#F28C28;color:#fff}' +
      '#kk-nav .kk-msg:hover{background:#d97a1c}' +
      '#kk-nav.kk-ferme a:not(.kk-portail),#kk-nav.kk-ferme .kk-sep,#kk-nav.kk-ferme .kk-msg span,#kk-nav.kk-ferme .kk-portail span{display:none}' +
      '#kk-nav.kk-ferme .kk-msg{padding:7px 9px}' +
      '@media (max-width:768px){#kk-nav{bottom:76px;left:10px}#kk-nav a span,#kk-nav .kk-msg span{display:none}#kk-nav a,#kk-nav button{padding:8px 10px}#kk-nav a.kk-cur span{display:inline}}' +
      '#kk-mr-ov{position:fixed;inset:0;background:rgba(20,18,50,.5);z-index:10001;display:none;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Nunito,sans-serif}' +
      '#kk-mr-ov.open{display:flex}' +
      '#kk-mr-box{background:#fff;color:#1a1a1a;border-radius:16px;width:100%;max-width:460px;max-height:92vh;overflow:auto;padding:20px 22px;box-shadow:0 12px 40px rgba(0,0,0,.3)}' +
      '#kk-mr-box h3{margin:0 0 10px;font-size:17px;color:#3D3580}' +
      '#kk-mr-box label.kk-l{display:block;font-size:12px;font-weight:700;color:#666;margin:10px 0 4px}' +
      '#kk-mr-box input[type=text],#kk-mr-box textarea,#kk-mr-box select{width:100%;box-sizing:border-box;border:1.5px solid #ddd;border-radius:8px;padding:8px 10px;font:inherit;font-size:14px}' +
      '#kk-mr-box textarea{resize:vertical}' +
      '#kk-mr-box .kk-r{display:flex;gap:6px;align-items:center;font-size:13px;margin:3px 0}' +
      '#kk-mr-info{font-size:12px;color:#666;margin-top:6px}' +
      '#kk-mr-liste{display:none;max-height:170px;overflow:auto;border:1px solid #ddd;border-radius:8px;padding:6px 10px;margin-top:6px}' +
      '#kk-mr-liste label{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px}' +
      '#kk-mr-box .kk-act{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}' +
      '#kk-mr-box .kk-act button{border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer}' +
      '#kk-mr-annuler{background:#eee;color:#444}' +
      '#kk-mr-envoyer{background:#3D3580;color:#fff}' +
      '#kk-mr-envoyer:disabled{opacity:.6;cursor:default}' +
      '#kk-mr-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:10002;background:#2A2460;color:#fff;padding:10px 16px;border-radius:12px;font:600 13px -apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);display:none}';
    document.head.appendChild(st);
  }

  function construireBarre() {
    if (dock) return;
    css();
    var cur = pageCourante();
    var dir = profil && profil.role === 'direction';
    var h = '<a class="kk-portail" href="index.html" title="Retour au portail"><i class="ti ti-home"></i><span>Portail</span></a><span class="kk-sep"></span>';
    MODULES.forEach(function (m) {
      if (m.direction && !dir) return;
      h += '<a href="' + m.f + '"' + (m.f === cur ? ' class="kk-cur" aria-current="page"' : '') + ' title="' + esc(m.t) + '"><i class="ti ' + m.ico + '"></i><span>' + esc(m.t) + '</span></a>';
    });
    if (profil && profil.role !== 'employe') {
      h += '<span class="kk-sep"></span><button type="button" class="kk-msg" id="kk-nav-msg" title="Écrire un message aux employés sans quitter cette page"><i class="ti ti-message-plus"></i><span>Message</span></button>';
    }
    h += '<button type="button" id="kk-nav-tog" title="Replier / déplier la barre" aria-label="Replier la barre"><i class="ti ti-chevron-left"></i></button>';
    dock = document.createElement('nav');
    dock.id = 'kk-nav';
    dock.setAttribute('aria-label', 'Navigation entre modules');
    dock.innerHTML = h;
    if (lire('kk_nav_ferme') === '1') dock.classList.add('kk-ferme');
    document.body.appendChild(dock);
    document.getElementById('kk-nav-tog').addEventListener('click', function () {
      var f = dock.classList.toggle('kk-ferme');
      ecrire('kk_nav_ferme', f ? '1' : '0');
      this.querySelector('i').className = 'ti ' + (f ? 'ti-chevron-right' : 'ti-chevron-left');
    });
    if (dock.classList.contains('kk-ferme')) document.querySelector('#kk-nav-tog i').className = 'ti ti-chevron-right';
    var bm = document.getElementById('kk-nav-msg');
    if (bm) bm.addEventListener('click', ouvrirMessage);
  }

  /* ---------- message rapide ---------- */
  function toast(t) {
    var el = document.getElementById('kk-mr-toast');
    if (!el) { el = document.createElement('div'); el.id = 'kk-mr-toast'; document.body.appendChild(el); }
    el.textContent = t; el.style.display = 'block';
    clearTimeout(el._t); el._t = setTimeout(function () { el.style.display = 'none'; }, 3500);
  }
  function nomEmp(e) { return ((e.prenom || '') + ' ' + (e.nom || '')).trim() || '(sans nom)'; }
  function modeChoisi() { return document.querySelector('input[name="kk-mr-mode"]:checked').value; }
  function crecheChoisie() { return document.getElementById('kk-mr-creche').value || null; }
  function candidats() {
    var cr = crecheChoisie();
    return (employes || []).filter(function (e) { return !cr || e.creche_id === cr; });
  }
  function majChoix() {
    var mode = modeChoisi(), liste = document.getElementById('kk-mr-liste'), info = document.getElementById('kk-mr-info');
    var cand = candidats(), avec = cand.filter(function (e) { return e.user_id; });
    if (mode === 'creche') {
      liste.style.display = 'none';
      info.textContent = avec.length + ' employé(e)(s) recevront ce message' + (cand.length > avec.length ? ' — ' + (cand.length - avec.length) + ' sans compte « Mon espace » ne pourront pas le lire' : '') + '.';
      return;
    }
    liste.style.display = 'block';
    liste.innerHTML = cand.length
      ? cand.slice().sort(function (a, b) { return nomEmp(a).localeCompare(nomEmp(b), 'fr'); }).map(function (e) {
          return '<label' + (e.user_id ? '' : ' style="opacity:.5"') + '><input type="checkbox" class="kk-mr-p" value="' + esc(e.id) + '"' + (e.user_id ? '' : ' disabled') + '/> <span>' + esc(nomEmp(e)) + (e.user_id ? '' : ' <small>(sans compte)</small>') + '</span></label>';
        }).join('')
      : '<small>Aucun(e) employé(e) dans cette crèche.</small>';
    liste.onchange = majCompte;
    majCompte();
  }
  function majCompte() {
    document.getElementById('kk-mr-info').textContent = document.querySelectorAll('.kk-mr-p:checked').length + ' personne(s) sélectionnée(s).';
  }

  function construireModale() {
    if (document.getElementById('kk-mr-ov')) return;
    var ov = document.createElement('div');
    ov.id = 'kk-mr-ov';
    ov.innerHTML = '<div id="kk-mr-box" role="dialog" aria-modal="true" aria-label="Message aux employés"><h3>Message aux employé(e)s</h3>' +
      '<div style="background:#FFF3E3;border-radius:8px;padding:8px 12px;font-size:12.5px;color:#9a5a10">Message à sens unique : il est lu dans <strong>Mon espace</strong>, avec une notification si l’employé(e) l’a activée.</div>' +
      '<label class="kk-l" for="kk-mr-titre">Titre</label><input type="text" id="kk-mr-titre" maxlength="120" placeholder="Ex. : Réunion d’équipe jeudi"/>' +
      '<label class="kk-l" for="kk-mr-corps">Message</label><textarea id="kk-mr-corps" rows="4"></textarea>' +
      '<label class="kk-l" for="kk-mr-creche">Crèche</label><select id="kk-mr-creche"></select>' +
      '<label class="kk-l">Destinataires</label>' +
      '<label class="kk-r"><input type="radio" name="kk-mr-mode" value="creche" checked/> Toute la crèche</label>' +
      '<label class="kk-r"><input type="radio" name="kk-mr-mode" value="personnes"/> Personnes précises</label>' +
      '<div id="kk-mr-liste"></div><div id="kk-mr-info"></div>' +
      '<div class="kk-act"><button type="button" id="kk-mr-annuler">Annuler</button><button type="button" id="kk-mr-envoyer">Envoyer</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) fermer(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('open')) fermer(); });
    document.getElementById('kk-mr-annuler').addEventListener('click', fermer);
    document.getElementById('kk-mr-envoyer').addEventListener('click', envoyer);
    document.getElementById('kk-mr-creche').addEventListener('change', majChoix);
    ov.querySelectorAll('input[name="kk-mr-mode"]').forEach(function (r) { r.addEventListener('change', majChoix); });
  }
  function fermer() { var ov = document.getElementById('kk-mr-ov'); if (ov) ov.classList.remove('open'); }

  async function ouvrirMessage() {
    var c = getSb();
    if (!c || !profil) return;
    construireModale();
    var dir = profil.role === 'direction';
    try {
      if (!employes) {
        var re = await c.from('employes').select('id,prenom,nom,creche_id,user_id,archive_le');
        employes = (re.data || []).filter(function (e) { return !e.archive_le; });
      }
      if (!creches) {
        var rc = await c.from('creches').select('id,name');
        creches = rc.data || [];
      }
    } catch (e) { toast('Chargement impossible, réessayez.'); return; }
    document.getElementById('kk-mr-titre').value = '';
    document.getElementById('kk-mr-corps').value = '';
    var sel = document.getElementById('kk-mr-creche');
    if (dir) {
      sel.innerHTML = '<option value="">Toutes les crèches</option>' + creches.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name || '') + '</option>'; }).join('');
      sel.disabled = false;
    } else {
      var mc = creches.filter(function (x) { return x.id === profil.creche_id; })[0];
      sel.innerHTML = '<option value="' + esc(profil.creche_id || '') + '">' + esc(mc ? mc.name : 'Ma crèche') + '</option>';
      sel.disabled = true;
    }
    document.querySelector('input[name="kk-mr-mode"][value="creche"]').checked = true;
    majChoix();
    document.getElementById('kk-mr-ov').classList.add('open');
    document.getElementById('kk-mr-titre').focus();
  }

  async function jeton() {
    var s = sessionPage();
    if (s && s.access_token) return s.access_token;
    try { var r = await getSb().auth.getSession(); return r.data.session.access_token; } catch (e) { return SB_ANON_KEY; }
  }

  async function envoyer() {
    if (enCours) return;
    var titre = document.getElementById('kk-mr-titre').value.trim(), corps = document.getElementById('kk-mr-corps').value.trim();
    if (!titre || !corps) { alert('Le titre et le message sont requis.'); return; }
    var mode = modeChoisi();
    var dest = candidats().filter(function (e) {
      if (!e.user_id) return false;
      if (mode === 'creche') return true;
      var cb = document.querySelector('.kk-mr-p[value="' + e.id + '"]');
      return cb && cb.checked;
    });
    if (!dest.length) { alert(mode === 'creche' ? 'Aucun(e) employé(e) de cette crèche n’a de compte « Mon espace ».' : 'Sélectionnez au moins une personne.'); return; }
    var btn = document.getElementById('kk-mr-envoyer');
    enCours = true; btn.disabled = true;
    try {
      var c = getSb();
      var crecheId = crecheChoisie();
      if (!crecheId && mode === 'personnes') {
        var cs = {}; dest.forEach(function (e) { cs[e.creche_id] = 1; });
        var ks = Object.keys(cs);
        if (ks.length === 1) crecheId = ks[0];
      }
      var ins = await c.from('messages_employes').insert({ creche_id: crecheId, auteur_id: profil.id, auteur_nom: profil.name || '', titre: titre, corps: corps }).select().single();
      if (ins.error || !ins.data) { alert('Erreur d’envoi : ' + ((ins.error && ins.error.message) || 'inconnue')); return; }
      var rd = await c.from('messages_employes_destinataires').insert(dest.map(function (e) { return { message_id: ins.data.id, employe_id: e.id }; }));
      if (rd.error) { alert('Message créé mais destinataires en erreur : ' + rd.error.message); return; }
      try {
        await fetch(SB_URL + '/functions/v1/notify-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + await jeton() },
          body: JSON.stringify({ employe_ids: dest.map(function (e) { return e.id; }), title: 'Nouveau message', body: titre, url: './collaborateur.html', tag: 'msg-employe-' + ins.data.id })
        });
      } catch (e) { /* la notification est un plus : le message reste dans Mon espace */ }
      fermer();
      toast('Message envoyé à ' + dest.length + ' employé(e)(s) !');
    } finally { enCours = false; btn.disabled = false; }
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
