// ══════════════ CHAT D'ASSISTANCE EN DIRECT ══════════════
// Bulle flottante présente sur toutes les pages connectées.
//   - Membre de l'équipe (direction comprise) : écrit au support pour signaler
//     un problème d'utilisation (la page et l'appareil sont joints automatiquement).
//   - Responsable du support (table `support_responsables`, un seul compte) :
//     voit toutes les conversations de son organisation, répond en direct et est
//     alerté·e (pastille, notification push) à chaque message.
// Données : table `support_messages` (sql/support_chat.sql). Mise à jour par
// temps réel quand il est disponible, et par interrogation régulière sinon.
// S'appuie sur le client Supabase `sb` défini par chaque page.
(function () {
  'use strict';
  if (window.__kkSupportChat) return;
  window.__kkSupportChat = true;
  if (window.top !== window.self) return; // pas dans une iframe

  const POLL_OUVERT_MS = 4000;
  const POLL_FERME_MS = 20000;
  const MAX_CAR = 2000;

  let uid = null;
  let me = null;              // { nom, direction }
  let msgs = [];              // messages chargés (ordre chronologique)
  let ouvert = false;
  let convActive = null;      // direction : conversation affichée (null = liste)
  let nonLusPrec = 0;
  let timer = null;
  let canal = null;
  let chargement = false;
  let profilAbsent = null;    // { id, t } : profil introuvable ; on réessaie après DELAI_RETENTE_MS
  const DELAI_RETENTE_MS = 60000;
  let els = null;
  // Présence (onglet « Équipe ») : réservée aux comptes référent·e / direction.
  const PRES_PING_MS = 60000;
  const PRES_LISTE_OUVERT_MS = 15000;
  const PRES_VU_MAX_MS = 150000;      // signal plus vieux = hors ligne
  const PRES_ACTIF_MAX_MS = 300000;   // pas d'activité depuis 5 min = inactif
  let onglet = 'assistance';          // 'assistance' | 'equipe'
  let presence = [];                  // lignes de kk_presence_liste
  let timerPres = null;
  let dernierPing = 0;
  let derniereActivite = Date.now();
  let dernierVu = null;               // heure serveur du dernier signal (ISO), pour le signal de départ
  let jetonPresence = null;           // jeton d'accès gardé à jour pour l'envoi à la fermeture
  const titreOrigine = document.title;
  // Échange direct entre personnes connectées : jamais écrit en base (diffusion Realtime
  // « broadcast » sur un canal privé de l'organisation), gardé en mémoire seulement.
  const EQ_MAX_MSG = 100;             // messages gardés par échange
  const EQ_ACCUSE_MS = 6000;          // sans accusé de réception après ce délai = « non reçu »
  let canalEq = null;
  let eqPret = false;                 // canal abonné
  let eqErreur = false;               // canal refusé (script SQL non appliqué) ou en erreur
  let echanges = {};                  // { idPersonne: [{ id, moi, texte, t, lu, recu, echec }] }
  let convEq = null;                  // échange affiché dans l'onglet Équipe (null = liste)
  let toastCibleEq = null;            // personne à ouvrir quand on clique sur l'alerte

  // Client Supabase : celui de la page (`sb`) ; sur l'accueil (index.html), qui n'en a
  // pas, on en crée un avec la même clé publique : la session ouverte sur une autre
  // page de l'appli est partagée (même stockage navigateur).
  const SB_URL = 'https://juyrceadazrovlitxceb.supabase.co';
  const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug';
  let sbPropre = null;
  // Page qui gère elle-même sa connexion (stock.html) : elle définit
  // window.kkSupportSession = () => ({ user, access_token }) | null.
  // Le widget n'ouvre alors AUCUNE session Supabase de son côté (pas de
  // renouvellement concurrent du jeton) : il emprunte le jeton de la page.
  const sessionPage = () => (typeof window.kkSupportSession === 'function' ? window.kkSupportSession() : null);
  const getSb = () => {
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (e) { /* pas de client de page */ }
    if (!sbPropre && window.supabase && window.supabase.createClient) {
      try {
        sbPropre = typeof window.kkSupportSession === 'function'
          ? window.supabase.createClient(SB_URL, SB_ANON_KEY, {
              accessToken: async () => { const s = sessionPage(); return s ? s.access_token : null; }
            })
          : window.supabase.createClient(SB_URL, SB_ANON_KEY);
      } catch (e) { return null; }
    }
    return sbPropre;
  };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function hhmm(iso) {
    const d = new Date(iso), a = new Date();
    const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === a.toDateString()) return h;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + h;
  }
  function nomPage() {
    const p = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    return p || 'index';
  }
  function appareil() {
    const ua = navigator.userAgent || '';
    const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    return (nav + (os ? ' / ' + os : '') + ' — ' + window.innerWidth + '×' + window.innerHeight).slice(0, 120);
  }

  // ───────── Styles et structure ─────────
  function injecterStyles() {
    if (document.getElementById('kk-sc-style')) return;
    const st = document.createElement('style');
    st.id = 'kk-sc-style';
    st.textContent = `
#kk-sc-btn{position:fixed;right:24px;bottom:88px;z-index:9990;width:70px;height:60px;border-radius:0;border:none;cursor:pointer;background:transparent;color:#fff;font-size:24px;padding:0;filter:drop-shadow(0 4px 8px rgba(0,0,0,.28));display:flex;align-items:center;justify-content:center;font-family:inherit}
#kk-sc-btn:hover{filter:drop-shadow(0 4px 8px rgba(0,0,0,.28)) brightness(1.08)}
#kk-sc-btn.kk-sc-pulse{animation:kkScPulse 1.6s infinite}
@keyframes kkScPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
#kk-sc-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#e03e3e;color:#fff;font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center;border:2px solid #fff;box-sizing:border-box}
#kk-sc-panel{position:fixed;right:24px;bottom:150px;z-index:9991;width:360px;max-width:calc(100vw - 24px);height:480px;max-height:calc(100vh - 170px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Nunito,sans-serif;color:#1a1a1a}
#kk-sc-panel.kk-sc-open{display:flex}
.kk-sc-head{background:var(--koala,#3D3580);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:8px}
.kk-sc-head b{flex:1;font-size:14px;line-height:1.25}
.kk-sc-head small{display:block;font-weight:500;opacity:.8;font-size:11px}
.kk-sc-head button{background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;padding:2px 6px;font-family:inherit}
.kk-sc-body{flex:1;overflow-y:auto;padding:12px;background:#f4f4f6;display:flex;flex-direction:column;gap:8px}
.kk-sc-msg{max-width:84%;padding:8px 11px;border-radius:14px;font-size:13.5px;line-height:1.4;white-space:pre-wrap;word-break:break-word}
.kk-sc-msg.moi{align-self:flex-end;background:var(--koala,#3D3580);color:#fff;border-bottom-right-radius:4px}
.kk-sc-msg.autre{align-self:flex-start;background:#fff;border:1px solid #e0dff0;border-bottom-left-radius:4px}
.kk-sc-meta{display:block;font-size:10.5px;opacity:.7;margin-top:3px}
.kk-sc-ctx{align-self:center;font-size:10.5px;color:#888;text-align:center}
.kk-sc-vide{margin:auto;text-align:center;color:#888;font-size:13px;padding:18px;line-height:1.5}
.kk-sc-foot{border-top:1px solid #e0dff0;padding:8px;display:flex;gap:6px;align-items:flex-end;background:#fff}
.kk-sc-foot textarea{flex:1;resize:none;border:1.5px solid #e0dff0;border-radius:10px;padding:8px 10px;font:inherit;font-size:13.5px;max-height:96px;min-height:38px;outline:none}
.kk-sc-foot textarea:focus{border-color:var(--koala,#3D3580)}
.kk-sc-foot button{border:none;border-radius:10px;background:var(--orange,#F47920);color:#fff;font-weight:700;font-size:13px;padding:0 14px;height:38px;cursor:pointer;font-family:inherit}
.kk-sc-foot button:disabled{opacity:.5;cursor:default}
.kk-sc-conv{background:#fff;border:1px solid #e0dff0;border-radius:12px;padding:10px 12px;cursor:pointer;display:flex;flex-direction:column;gap:2px;text-align:left;font-family:inherit;width:100%}
.kk-sc-conv:hover{border-color:var(--koala,#3D3580)}
.kk-sc-conv.nonlu{border-left:4px solid #e03e3e}
.kk-sc-conv .l1{display:flex;justify-content:space-between;gap:8px;font-size:13.5px}
.kk-sc-conv .l2{font-size:12.5px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kk-sc-conv .l3{font-size:10.5px;color:#999}
.kk-sc-pastille{background:#e03e3e;color:#fff;border-radius:10px;font-size:11px;font-weight:800;padding:0 6px;min-width:18px;text-align:center;align-self:center}
#kk-sc-online{position:absolute;bottom:2px;right:-2px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#2e9e5b;color:#fff;font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center;border:2px solid #fff;box-sizing:border-box}
.kk-sc-tabs{display:flex;background:#fff;border-bottom:1px solid #e0dff0}
.kk-sc-tabs button{flex:1;border:none;background:transparent;padding:9px 6px;font:inherit;font-size:13px;font-weight:700;color:#888;cursor:pointer;border-bottom:3px solid transparent}
.kk-sc-tabs button.on{color:var(--koala,#3D3580);border-bottom-color:var(--koala,#3D3580)}
.kk-sc-pers{background:#fff;border:1px solid #e0dff0;border-radius:12px;padding:9px 12px;display:flex;align-items:center;gap:10px}
.kk-sc-pers .pt{width:11px;height:11px;border-radius:50%;flex:none;background:#c9c9d3}
.kk-sc-pers.en_ligne .pt{background:#2e9e5b;box-shadow:0 0 0 3px rgba(46,158,91,.2)}
.kk-sc-pers.inactif .pt{background:#f0a400}
.kk-sc-pers .pi{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.kk-sc-pers .pi b{font-size:13.5px}
.kk-sc-pers .pi span{font-size:11.5px;color:#777;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kk-sc-pers .ps{font-size:11px;color:#888;text-align:right;flex:none}
.kk-sc-pers.hors{opacity:.75}
.kk-sc-pers.clic{cursor:pointer}
.kk-sc-pers.clic:hover{border-color:var(--koala,#3D3580)}
.kk-sc-grp{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#888;margin:6px 2px 0}
#kk-sc-toast{position:fixed;right:24px;bottom:150px;z-index:9989;max-width:300px;background:#2A2460;color:#fff;padding:10px 14px;border-radius:12px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.3);display:none;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Nunito,sans-serif}
@media (max-width:768px){
  #kk-sc-btn{bottom:140px;right:16px}
  #kk-sc-panel{right:8px;left:8px;bottom:8px;width:auto;max-width:none;height:calc(100vh - 80px);max-height:none}
  #kk-sc-toast{right:16px;bottom:200px}
}`;
    document.head.appendChild(st);
  }

  function creerUI() {
    if (els) return;
    injecterStyles();
    const btn = document.createElement('button');
    btn.id = 'kk-sc-btn';
    btn.type = 'button';
    btn.title = me.direction ? 'Messages de vos équipes' : 'Un problème ? Écrivez-nous';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = '<img src="koala-chat.png" alt="Messages" style="width:70px;height:auto;pointer-events:none"><span id="kk-sc-badge"></span><span id="kk-sc-online" title="Personnes en ligne"></span>';
    btn.addEventListener('click', basculer);

    const panel = document.createElement('div');
    panel.id = 'kk-sc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat d’assistance');
    panel.innerHTML =
      '<div class="kk-sc-head"><button type="button" id="kk-sc-back" style="display:none" aria-label="Retour">←</button>' +
      '<b id="kk-sc-titre"></b><button type="button" id="kk-sc-close" aria-label="Fermer">✕</button></div>' +
      '<div class="kk-sc-tabs" id="kk-sc-tabs" style="display:none"><button type="button" data-onglet="assistance" class="on">💬 Assistance</button>' +
      '<button type="button" data-onglet="equipe" id="kk-sc-tab-equipe">🟢 Équipe</button></div>' +
      '<div class="kk-sc-body" id="kk-sc-body"></div>' +
      '<div class="kk-sc-foot" id="kk-sc-foot"><textarea id="kk-sc-input" rows="1" maxlength="' + MAX_CAR + '"></textarea>' +
      '<button type="button" id="kk-sc-send">Envoyer</button></div>';

    const toast = document.createElement('div');
    toast.id = 'kk-sc-toast';
    toast.addEventListener('click', () => {
      toast.style.display = 'none';
      if (toastCibleEq && me && me.presence) { onglet = 'equipe'; convEq = toastCibleEq; majOnglets(); }
      toastCibleEq = null;
      ouvrir();
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    document.body.appendChild(toast);
    els = {
      btn, panel, toast,
      badge: btn.querySelector('#kk-sc-badge'),
      online: btn.querySelector('#kk-sc-online'),
      tabs: panel.querySelector('#kk-sc-tabs'),
      titre: panel.querySelector('#kk-sc-titre'),
      body: panel.querySelector('#kk-sc-body'),
      foot: panel.querySelector('#kk-sc-foot'),
      input: panel.querySelector('#kk-sc-input'),
      send: panel.querySelector('#kk-sc-send'),
      back: panel.querySelector('#kk-sc-back')
    };
    panel.querySelector('#kk-sc-close').addEventListener('click', fermer);
    if (me.presence) {
      els.tabs.style.display = 'flex';
      els.tabs.querySelectorAll('[data-onglet]').forEach(b => b.addEventListener('click', () => {
        onglet = b.getAttribute('data-onglet');
        convEq = null;
        majOnglets();
        rendre();
        if (onglet === 'equipe') chargerPresence(); else marquerLu();
        planifierPresence();
      }));
    }
    els.back.addEventListener('click', () => {
      if (me.presence && onglet === 'equipe') { convEq = null; rendre(); return; }
      convActive = null; rendre();
    });
    els.send.addEventListener('click', envoyer);
    els.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
    });
    els.input.addEventListener('input', () => {
      els.input.style.height = 'auto';
      els.input.style.height = Math.min(els.input.scrollHeight, 96) + 'px';
    });
  }

  function detruireUI() {
    if (canal) { try { getSb().removeChannel(canal); } catch (e) {} canal = null; }
    clearTimeout(timer); timer = null;
    clearTimeout(timerPres); timerPres = null; presence = []; onglet = 'assistance';
    if (canalEq) { try { getSb().removeChannel(canalEq); } catch (e) {} canalEq = null; }
    eqPret = false; eqErreur = false; echanges = {}; convEq = null; toastCibleEq = null;
    ['kk-sc-btn', 'kk-sc-panel', 'kk-sc-toast'].forEach(id => { const n = document.getElementById(id); if (n) n.remove(); });
    els = null; msgs = []; me = null; uid = null; ouvert = false; convActive = null; nonLusPrec = 0;
    try { sessionStorage.removeItem(CLE_ETAT); } catch (e) { /* ignoré */ }
    document.title = titreOrigine;
  }

  // ───────── Données ─────────
  async function chargerProfil(client, userId) {
    let estSupport = false;
    try {
      const { data: s } = await client.from('support_responsables').select('user_id').eq('user_id', userId).maybeSingle();
      estSupport = !!s;
    } catch (e) { /* table absente ou erreur : simple membre de l'équipe */ }
    // `direction` = « côté support » (voit la liste, répond) dans tout ce fichier.
    try {
      const { data: r } = await client.from('referents').select('*').eq('user_id', userId).maybeSingle();
      if (r) return {
        nom: r.name || r.nom || 'Référent·e', direction: estSupport,
        presence: r.role === 'referent' || r.role === 'direction',
        estDirection: r.role === 'direction',
        org: r.org_id || null
      };
    } catch (e) { /* on tente la fiche collaborateur */ }
    try {
      const { data: e } = await client.from('employes').select('*').eq('user_id', userId).maybeSingle();
      if (e) return { nom: [e.prenom, e.nom].filter(Boolean).join(' ') || 'Collaborateur·trice', direction: estSupport };
    } catch (e) { /* ignoré */ }
    return estSupport ? { nom: 'Support', direction: true } : null;
  }

  async function charger() {
    const client = getSb();
    if (!client || !uid || chargement) return;
    chargement = true;
    try {
      let q = client.from('support_messages').select('*');
      q = me.direction
        ? q.order('created_at', { ascending: false }).limit(600)
        : q.eq('conversation_user_id', uid).order('created_at', { ascending: false }).limit(300);
      const { data, error } = await q;
      if (error) { console.warn('[SupportChat]', error.message); return; }
      msgs = (data || []).slice().reverse();
      majPastille();
      if (ouvert) rendre(true);
    } catch (e) {
      console.warn('[SupportChat]', e);
    } finally {
      chargement = false;
    }
  }

  function nonLus() {
    return msgs.filter(m => me.direction ? (!m.from_support && !m.lu_par_support) : (m.from_support && !m.lu_par_utilisateur));
  }

  function majPastille() {
    if (!els) return;
    const n = nonLus().length;
    const total = n + nonLusEq();
    els.badge.style.display = total ? 'flex' : 'none';
    els.badge.textContent = total > 99 ? '99+' : String(total);
    els.btn.classList.toggle('kk-sc-pulse', total > 0);
    document.title = total ? '(' + total + ') ' + titreOrigine : titreOrigine;
    if (n > nonLusPrec && !ouvert) {
      const dernier = nonLus().slice(-1)[0];
      toastCibleEq = null;
      afficherToast(me.direction
        ? '💬 ' + (dernier.auteur_nom || 'Un membre de l’équipe') + ' : ' + dernier.contenu
        : '💬 Réponse du support : ' + dernier.contenu);
    }
    nonLusPrec = n;
  }

  function afficherToast(texte) {
    if (!els) return;
    els.toast.textContent = texte.length > 140 ? texte.slice(0, 140) + '…' : texte;
    els.toast.style.display = 'block';
    clearTimeout(afficherToast._t);
    afficherToast._t = setTimeout(() => { if (els) els.toast.style.display = 'none'; }, 7000);
  }

  async function marquerLu() {
    const client = getSb();
    if (!client) return;
    try {
      if (me.direction) {
        if (!convActive) return;
        if (!msgs.some(m => m.conversation_user_id === convActive && !m.from_support && !m.lu_par_support)) return;
        await client.rpc('kk_support_marquer_lu_support', { p_conversation_user_id: convActive });
        msgs.forEach(m => { if (m.conversation_user_id === convActive && !m.from_support) m.lu_par_support = true; });
      } else {
        if (!msgs.some(m => m.from_support && !m.lu_par_utilisateur)) return;
        await client.rpc('kk_support_marquer_lu_utilisateur');
        msgs.forEach(m => { if (m.from_support) m.lu_par_utilisateur = true; });
      }
      majPastille();
    } catch (e) { console.warn('[SupportChat] lu', e); }
  }

  // ───────── Rendu ─────────
  function conversations() {
    const map = new Map();
    msgs.forEach(m => {
      let c = map.get(m.conversation_user_id);
      if (!c) { c = { id: m.conversation_user_id, nom: null, dernier: null, nonLus: 0 }; map.set(m.conversation_user_id, c); }
      if (!m.from_support && m.auteur_nom) c.nom = m.auteur_nom;
      c.dernier = m;
      if (!m.from_support && !m.lu_par_support) c.nonLus++;
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.dernier.created_at) - new Date(a.dernier.created_at));
  }

  function rendre(depuisSondage) {
    if (!els) return;
    const body = els.body;
    const proche = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    const saisie = els.input.value;

    if (me.presence && onglet === 'equipe') { rendreEquipe(); return; }

    if (me.direction && !convActive) {
      els.titre.innerHTML = 'Messages de vos équipes<small>Cliquez sur une conversation pour répondre</small>';
      els.back.style.display = 'none';
      els.foot.style.display = 'none';
      const liste = conversations();
      body.innerHTML = liste.length
        ? liste.map(c =>
            '<button type="button" class="kk-sc-conv' + (c.nonLus ? ' nonlu' : '') + '" data-conv="' + esc(c.id) + '">' +
            '<span class="l1"><b>' + esc(c.nom || 'Membre de l’équipe') + '</b>' +
            (c.nonLus ? '<span class="kk-sc-pastille">' + c.nonLus + '</span>' : '') + '</span>' +
            '<span class="l2">' + (c.dernier.from_support ? 'Vous : ' : '') + esc(c.dernier.contenu) + '</span>' +
            '<span class="l3">' + esc(hhmm(c.dernier.created_at)) + '</span></button>').join('')
        : '<div class="kk-sc-vide">Aucune conversation pour le moment.<br>Les questions de vos équipes apparaîtront ici en direct.</div>';
      body.querySelectorAll('[data-conv]').forEach(b => b.addEventListener('click', () => {
        convActive = b.getAttribute('data-conv');
        rendre();
        marquerLu();
        els.input.focus();
      }));
      return;
    }

    // Fil de discussion
    let fil = msgs;
    if (me.direction) {
      fil = msgs.filter(m => m.conversation_user_id === convActive);
      const c = conversations().find(x => x.id === convActive);
      els.titre.innerHTML = esc((c && c.nom) || 'Conversation') + '<small>Répondre depuis ici</small>';
      els.back.style.display = '';
    } else {
      els.titre.innerHTML = 'Un problème avec l’appli ?<small>Écrivez-nous, nous vous répondons ici</small>';
      els.back.style.display = 'none';
    }
    els.foot.style.display = 'flex';
    els.input.placeholder = me.direction ? 'Votre réponse…' : 'Décrivez le problème rencontré…';

    if (!fil.length) {
      body.innerHTML = '<div class="kk-sc-vide">👋 Décrivez ce qui ne fonctionne pas (ce que vous vouliez faire, ce qui s’est passé).<br>La page où vous êtes et votre appareil sont joints automatiquement.</div>';
    } else {
      let derniereCtx = null;
      body.innerHTML = fil.map(m => {
        const moi = me.direction ? m.from_support : !m.from_support;
        const ctx = m.page ? m.page + (m.appareil ? ' · ' + m.appareil : '') : null;
        // Côté direction, on rappelle la page/l'appareil quand ils changent.
        let pre = '';
        if (me.direction && !m.from_support && ctx && ctx !== derniereCtx) {
          pre = '<div class="kk-sc-ctx">📍 ' + esc(ctx) + '</div>';
          derniereCtx = ctx;
        }
        const qui = moi ? '' : (m.from_support ? 'Support · ' : '');
        return pre + '<div class="kk-sc-msg ' + (moi ? 'moi' : 'autre') + '">' + esc(m.contenu) +
          '<span class="kk-sc-meta">' + esc(qui + hhmm(m.created_at)) + '</span></div>';
      }).join('');
    }
    els.input.value = saisie;
    if (!depuisSondage || proche) body.scrollTop = body.scrollHeight;
  }

  // ───────── Présence : qui est connecté ? ─────────
  const NOMS_PAGES = {
    index: 'Accueil', demandes: 'Demandes', inscriptions: 'Devis', contrats: 'Contrats', factures: 'Factures',
    stock: 'Stock', infirmerie: 'Soins', documents: 'Documents', employes: 'Équipe', parametres: 'Paramètres',
    collaborateur: 'Mon espace', suivi: 'Suivi', ludotheque: 'Ludothèque', terrain: 'Accès terrain', devis: 'Devis'
  };
  function statutPres(p) {
    if (!p.vu_le) return 'hors';
    if (p.parti_le && new Date(p.parti_le) >= new Date(p.vu_le)) return 'hors';
    const maintenant = Date.now();
    if (maintenant - new Date(p.vu_le).getTime() > PRES_VU_MAX_MS) return 'hors';
    const actif = p.actif_le ? maintenant - new Date(p.actif_le).getTime() : Infinity;
    return actif > PRES_ACTIF_MAX_MS ? 'inactif' : 'en_ligne';
  }
  function depuis(iso) {
    if (!iso) return 'jamais vu·e';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'à l’instant';
    if (min < 60) return 'il y a ' + min + ' min';
    const d = new Date(iso);
    const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString()
      ? 'aujourd’hui ' + h
      : 'le ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + h;
  }

  async function pingPresence(force) {
    const client = getSb();
    if (!client || !uid || !me || !me.presence) return;
    if (!force && Date.now() - dernierPing < PRES_PING_MS - 5000) return;
    dernierPing = Date.now();
    try {
      const { data } = await client.rpc('kk_presence_ping', {
        p_page: NOMS_PAGES[nomPage()] || nomPage(),
        p_actif: Date.now() - derniereActivite < PRES_ACTIF_MAX_MS && !document.hidden
      });
      if (data) dernierVu = data;
      const s = sessionPage() || (client.auth ? (await client.auth.getSession()).data.session : null);
      if (s && s.access_token) jetonPresence = s.access_token;
    } catch (e) { /* table non créée ou réseau : sans conséquence pour le reste de la bulle */ }
  }

  // Signal de départ : envoyé à la fermeture de la page (fetch keepalive, qui survit à la page).
  // Ignoré côté serveur si un signal plus récent est arrivé (autre page de l'appli, autre onglet).
  function departPresence() {
    if (!me || !me.presence || !dernierVu || !jetonPresence) return;
    try {
      fetch(SB_URL + '/rest/v1/rpc/kk_presence_depart', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SB_ANON_KEY, Authorization: 'Bearer ' + jetonPresence },
        body: JSON.stringify({ p_vu: dernierVu })
      }).catch(() => {});
    } catch (e) { /* sans conséquence : le statut tombera tout seul après 2 min 30 */ }
  }
  window.addEventListener('pagehide', departPresence);

  async function chargerPresence() {
    const client = getSb();
    if (!client || !uid || !me || !me.presence) return;
    try {
      const { data, error } = await client.rpc('kk_presence_liste');
      if (error) { console.warn('[Présence]', error.message); return; }
      presence = data || [];
      majPresenceBulle();
      if (ouvert && onglet === 'equipe') rendre(true);
    } catch (e) { console.warn('[Présence]', e); }
  }

  function majPresenceBulle() {
    if (!els || !me.presence) return;
    const n = presence.filter(p => p.user_id !== uid && statutPres(p) === 'en_ligne').length;
    els.online.style.display = n ? 'flex' : 'none';
    els.online.textContent = String(n);
    els.btn.title = (me.direction ? 'Messages de vos équipes' : 'Un problème ? Écrivez-nous') +
      ' — ' + n + ' autre' + (n > 1 ? 's' : '') + ' personne' + (n > 1 ? 's' : '') + ' en ligne';
    const t = els.tabs.querySelector('#kk-sc-tab-equipe');
    if (t) t.textContent = '🟢 Équipe' + (n ? ' (' + n + ')' : '');
  }

  function majOnglets() {
    if (!els) return;
    els.tabs.querySelectorAll('[data-onglet]').forEach(b => b.classList.toggle('on', b.getAttribute('data-onglet') === onglet));
  }

  function rendreEquipe() {
    if (convEq) { rendreEchangeEq(); return; }
    els.foot.style.display = 'none';
    els.titre.innerHTML = 'Qui est connecté·e ?<small>Direction et référent·es · mis à jour toutes les minutes</small>';
    els.back.style.display = 'none';
    els.foot.style.display = 'none';
    const lignes = presence.map(p => ({ p, st: statutPres(p) }));
    const ordre = { en_ligne: 0, inactif: 1, hors: 2 };
    lignes.sort((a, b) => ordre[a.st] - ordre[b.st] ||
      (new Date(b.p.vu_le || 0) - new Date(a.p.vu_le || 0)) || String(a.p.nom).localeCompare(String(b.p.nom), 'fr'));
    if (!lignes.length) {
      els.body.innerHTML = '<div class="kk-sc-vide">Chargement de l’équipe…</div>';
      return;
    }
    const libelle = { en_ligne: 'En ligne', inactif: 'Inactif·ve', hors: 'Hors ligne' };
    let html = '', groupe = null;
    lignes.forEach(({ p, st }) => {
      if (st !== groupe) {
        groupe = st;
        html += '<div class="kk-sc-grp">' + libelle[st] + ' · ' + lignes.filter(l => l.st === st).length + '</div>';
      }
      const sous = [p.role === 'direction' ? 'Direction' : 'Référent·e', p.creche_nom].filter(Boolean).join(' · ') +
        (st !== 'hors' && p.page ? ' · 📍 ' + p.page : '');
      const droite = st === 'en_ligne' ? 'en ligne' : st === 'inactif' ? 'actif·ve ' + depuis(p.actif_le) : 'vu·e ' + depuis(p.parti_le && new Date(p.parti_le) >= new Date(p.vu_le) ? p.parti_le : p.vu_le);
      const ecrivable = p.user_id !== uid && st !== 'hors' && canalEq;
      const nl = (echanges[p.user_id] || []).filter(m => !m.moi && !m.lu).length;
      html += '<div class="kk-sc-pers ' + (st === 'hors' ? 'hors' : st) + (ecrivable ? ' clic' : '') + '"' +
        (ecrivable ? ' data-pair="' + esc(p.user_id) + '" role="button" tabindex="0"' : '') + '><span class="pt"></span>' +
        '<span class="pi"><b>' + esc(p.nom || 'Sans nom') + (p.user_id === uid ? ' (vous)' : '') + '</b><span>' + esc(sous) + '</span></span>' +
        (nl ? '<span class="kk-sc-pastille">' + nl + '</span>' : '') +
        '<span class="ps">' + (ecrivable ? '💬 ' : '') + esc(droite) + '</span></div>';
    });
    els.body.innerHTML = '<div class="kk-sc-vide" style="padding:2px 6px;font-size:11.5px">Cliquez sur une personne en ligne pour échanger avec elle. Les échanges ne sont pas conservés.</div>' + html;
    els.body.querySelectorAll('[data-pair]').forEach(b => {
      const ouvrirPair = () => { convEq = b.getAttribute('data-pair'); rendre(); marquerLuEq(); els.input.focus(); };
      b.addEventListener('click', ouvrirPair);
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirPair(); } });
    });
  }

  // ───────── Échange direct (éphémère) ─────────
  function nomPers(id, repli) {
    const p = presence.find(x => x.user_id === id);
    return (p && p.nom) || repli || 'Collègue';
  }
  function nonLusEq() {
    let n = 0;
    Object.keys(echanges).forEach(k => echanges[k].forEach(m => { if (!m.moi && !m.lu) n++; }));
    return n;
  }
  function marquerLuEq() {
    if (!convEq || !echanges[convEq]) return;
    echanges[convEq].forEach(m => { m.lu = true; });
    majPastille();
  }
  function ajouterEq(id, m) {
    const l = echanges[id] || (echanges[id] = []);
    l.push(m);
    if (l.length > EQ_MAX_MSG) l.splice(0, l.length - EQ_MAX_MSG);
  }
  function rendreEchangeEq() {
    const p = presence.find(x => x.user_id === convEq);
    const st = p ? statutPres(p) : 'hors';
    els.titre.innerHTML = esc(nomPers(convEq)) + '<small>' +
      (st === 'hors' ? 'Hors ligne · votre message ne sera pas reçu' : st === 'inactif' ? 'Inactif·ve · peut tarder à répondre' : 'En ligne') +
      ' · échange non conservé</small>';
    els.back.style.display = '';
    els.foot.style.display = 'flex';
    els.input.placeholder = 'Votre message…';
    const body = els.body;
    const proche = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    const fil = echanges[convEq] || [];
    body.innerHTML = fil.length
      ? fil.map(m => '<div class="kk-sc-msg ' + (m.moi ? 'moi' : 'autre') + '">' + esc(m.texte) +
          '<span class="kk-sc-meta">' + esc(hhmm(m.t)) + (m.moi ? (m.recu ? ' · ✓ reçu' : m.echec ? ' · ⚠ non reçu' : ' · …') : '') + '</span></div>').join('')
      : '<div class="kk-sc-vide">💬 Échange direct avec ' + esc(nomPers(convEq)) + '.<br>Il disparaît dès que vous fermez la bulle : rien n’est enregistré.</div>';
    if (!eqPret) body.insertAdjacentHTML('afterbegin', '<div class="kk-sc-ctx">' + (eqErreur ? '⚠ Échange direct indisponible' : 'Connexion en cours…') + '</div>');
    if (proche) body.scrollTop = body.scrollHeight;
  }

  function ouvrirCanalEq(client) {
    if (canalEq || !me || !me.presence || !me.org || typeof client.channel !== 'function') return;
    try {
      const c = client.channel('kk-equipe-' + me.org, { config: { private: true, broadcast: { self: false } } });
      c.on('broadcast', { event: 'msg' }, ({ payload }) => recevoirEq(payload))
       .on('broadcast', { event: 'recu' }, ({ payload }) => {
         if (!payload || payload.a !== uid) return;
         Object.keys(echanges).forEach(k => echanges[k].forEach(m => { if (m.id === payload.id) { m.recu = true; m.echec = false; } }));
         if (ouvert && onglet === 'equipe' && convEq) rendre(true);
       })
       .subscribe(status => {
         eqPret = status === 'SUBSCRIBED';
         eqErreur = status === 'CHANNEL_ERROR' || status === 'TIMED_OUT';
         if (eqErreur) console.warn('[Équipe] canal d’échange refusé (appliquer sql/equipe_echange_direct.sql ?)');
         if (ouvert && onglet === 'equipe') rendre(true);
       });
      canalEq = c;
    } catch (e) { /* l'échange direct est facultatif */ }
  }

  function recevoirEq(pl) {
    if (!pl || pl.a !== uid || !pl.de || pl.de === uid || typeof pl.texte !== 'string' || !pl.id) return;
    const texte = pl.texte.slice(0, MAX_CAR);
    const visible = ouvert && onglet === 'equipe' && convEq === pl.de;
    ajouterEq(pl.de, { id: pl.id, moi: false, texte, t: new Date().toISOString(), lu: visible });
    try { canalEq.send({ type: 'broadcast', event: 'recu', payload: { a: pl.de, id: pl.id } }); } catch (e) { /* ignoré */ }
    if (visible) { rendre(true); majPastille(); return; }
    majPastille();
    if (ouvert && onglet === 'equipe' && !convEq) rendre(true);
    if (!ouvert || !(onglet === 'equipe' && convEq === pl.de)) {
      if (!ouvert) {
        afficherToast('💬 ' + nomPers(pl.de, pl.nom) + ' : ' + texte);
        toastCibleEq = pl.de;
      }
    }
  }

  async function envoyerEq() {
    const texte = (els.input.value || '').trim();
    if (!texte || !convEq || !canalEq || !eqPret) return;
    const m = { id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), moi: true, texte: texte.slice(0, MAX_CAR), t: new Date().toISOString(), lu: true };
    ajouterEq(convEq, m);
    els.input.value = '';
    els.input.style.height = 'auto';
    rendre();
    els.body.scrollTop = els.body.scrollHeight;
    try {
      await canalEq.send({ type: 'broadcast', event: 'msg', payload: { id: m.id, de: uid, a: convEq, nom: me.nom, texte: m.texte } });
    } catch (e) { m.echec = true; rendre(true); return; }
    setTimeout(() => { if (!m.recu) { m.echec = true; if (ouvert && onglet === 'equipe' && convEq) rendre(true); } }, EQ_ACCUSE_MS);
  }

  function planifierPresence() {
    clearTimeout(timerPres);
    if (!els || !me || !me.presence) return;
    const delai = ouvert && onglet === 'equipe' ? PRES_LISTE_OUVERT_MS : PRES_PING_MS;
    timerPres = setTimeout(async () => {
      if (!els) return;
      await pingPresence(false);
      await chargerPresence();
      planifierPresence();
    }, delai);
  }

  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev =>
    window.addEventListener(ev, () => { derniereActivite = Date.now(); }, { passive: true, capture: true }));

  // ───────── Envoi ─────────
  async function envoyer() {
    if (me && me.presence && onglet === 'equipe') { envoyerEq(); return; }
    const client = getSb();
    if (!client || !els) return;
    const texte = (els.input.value || '').trim();
    if (!texte) return;
    const conv = me.direction ? convActive : uid;
    if (!conv) return;
    els.send.disabled = true;
    try {
      const avant = msgs.filter(m => m.conversation_user_id === conv && m.from_support === me.direction).slice(-1)[0];
      const { data, error } = await client.from('support_messages').insert({
        conversation_user_id: conv,
        auteur_id: uid,
        auteur_nom: me.nom,
        from_support: me.direction,
        contenu: texte.slice(0, MAX_CAR),
        page: nomPage(),
        appareil: appareil()
      }).select().single();
      if (error) {
        console.warn('[SupportChat] envoi', error);
        alert('Le message n’a pas pu être envoyé. Vérifiez votre connexion et réessayez.');
        return;
      }
      msgs.push(data);
      els.input.value = '';
      els.input.style.height = 'auto';
      rendre();
      els.body.scrollTop = els.body.scrollHeight;
      // Alerte push, sans spammer : une seule si le correspondant n'a pas été prévenu depuis 3 min.
      if (!avant || Date.now() - new Date(avant.created_at).getTime() > 3 * 60 * 1000) prevenir(client, conv, texte);
    } finally {
      els.send.disabled = false;
      els.input.focus();
    }
  }

  async function prevenir(client, conv, texte) {
    try {
      let ids = [];
      if (me.direction) {
        const { data } = await client.from('referents').select('id').eq('user_id', conv);
        ids = (data || []).map(r => r.id);
      } else {
        const { data } = await client.rpc('kk_support_destinataires');
        ids = data || [];
      }
      if (!ids.length) return;
      await client.functions.invoke('notify-push', {
        body: {
          referent_ids: ids,
          title: me.direction ? 'Réponse du support' : 'Chat assistance — ' + me.nom,
          body: texte.slice(0, 120),
          url: './demandes.html',
          tag: 'support-chat-' + conv
        }
      });
    } catch (e) { console.warn('[SupportChat] push', e); }
  }

  // ───────── État conservé d'une page à l'autre ─────────
  // La bulle reste telle quelle (ouverte, onglet, conversation, brouillon) quand on change de
  // page de l'appli, jusqu'à ce que la personne la ferme. Stockage de l'onglet seulement
  // (sessionStorage) : effacé à la fermeture de l'onglet et à la déconnexion.
  const CLE_ETAT = 'kk_sc_etat';
  function sauverEtat() {
    try {
      if (!uid || !els) return;
      if (!ouvert) { sessionStorage.removeItem(CLE_ETAT); return; }
      sessionStorage.setItem(CLE_ETAT, JSON.stringify({
        u: uid, ouvert: true, onglet, convActive, convEq,
        brouillon: els.input.value || '', echanges
      }));
    } catch (e) { /* stockage indisponible : la bulle repart simplement fermée */ }
  }
  function restaurerEtat() {
    let e = null;
    try { e = JSON.parse(sessionStorage.getItem(CLE_ETAT) || 'null'); } catch (x) { e = null; }
    if (!e || e.u !== uid || !e.ouvert) return;
    if (e.echanges && typeof e.echanges === 'object') echanges = e.echanges;
    if (me.presence && e.onglet === 'equipe') { onglet = 'equipe'; convEq = e.convEq || null; }
    if (me.direction && e.convActive) convActive = e.convActive;
    if (typeof majOnglets === 'function') majOnglets();
    ouvrir(true);
    if (e.brouillon) { els.input.value = e.brouillon; els.input.dispatchEvent(new Event('input')); }
  }
  window.addEventListener('pagehide', sauverEtat);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sauverEtat(); });

  // ───────── Ouverture / fermeture / actualisation ─────────
  function ouvrir(restauration) {
    if (!els) return;
    ouvert = true;
    els.panel.classList.add('kk-sc-open');
    els.toast.style.display = 'none';
    rendre();
    marquerLu();
    marquerLuEq();
    planifier();
    if (me.presence && onglet === 'equipe') { chargerPresence(); planifierPresence(); }
    if (!restauration && (!me.direction || convActive)) setTimeout(() => { if (els) els.input.focus(); }, 50);
    sauverEtat();
  }
  function fermer() {
    ouvert = false;
    // Échanges directs : ce qui a été vu disparaît à la fermeture (seuls les messages non lus restent).
    Object.keys(echanges).forEach(k => {
      echanges[k] = echanges[k].filter(m => !m.moi && !m.lu);
      if (!echanges[k].length) delete echanges[k];
    });
    convEq = null;
    if (els) els.panel.classList.remove('kk-sc-open');
    try { sessionStorage.removeItem(CLE_ETAT); } catch (e) { /* ignoré */ }
    planifier();
  }
  function basculer() { ouvert ? fermer() : ouvrir(); }

  function planifier() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!els) return;
      if (!document.hidden) {
        await charger();
        if (ouvert) marquerLu();
      }
      planifier();
    }, ouvert ? POLL_OUVERT_MS : POLL_FERME_MS);
  }

  function ecouterTempsReel(client) {
    if (canal || typeof client.channel !== 'function') return;
    try {
      canal = client.channel('kk-support-chat-' + uid)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, () => {
          charger().then(() => { if (ouvert) marquerLu(); });
        })
        .subscribe();
    } catch (e) { /* l'interrogation régulière prend le relais */ }
  }

  // ───────── Démarrage : suit la connexion de la page ─────────
  async function verifierSession() {
    const client = getSb();
    if (!client) return;
    let session = null;
    if (typeof window.kkSupportSession === 'function') {
      session = sessionPage();
    } else {
      if (!client.auth) return;
      try { session = (await client.auth.getSession()).data.session; } catch (e) { return; }
    }
    const userId = session && session.user ? session.user.id : null;
    if (!userId) { if (uid) detruireUI(); return; }
    if (uid === userId) return;
    if (profilAbsent && profilAbsent.id === userId && Date.now() - profilAbsent.t < DELAI_RETENTE_MS) return;
    if (uid) detruireUI();
    const profil = await chargerProfil(client, userId);
    if (!profil) { profilAbsent = { id: userId, t: Date.now() }; return; } // introuvable (ou échec passager) : on réessaie plus tard
    profilAbsent = null;
    uid = userId; me = profil;
    creerUI();
    ecouterTempsReel(client);
    ouvrirCanalEq(client);
    await charger();
    restaurerEtat();
    planifier();
    if (me.presence) {
      await pingPresence(true);
      await chargerPresence();
      planifierPresence();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !els) return;
    charger();
    if (me && me.presence) { derniereActivite = Date.now(); pingPresence(false).then(chargerPresence); }
  });

  function demarrer() {
    verifierSession();
    // La connexion se fait après le chargement de la page : on surveille la session.
    setInterval(verifierSession, 5000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
