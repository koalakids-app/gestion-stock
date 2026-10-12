// ══════════════ CHAT D'ASSISTANCE EN DIRECT ══════════════
// Bulle flottante présente sur toutes les pages connectées.
//   - Membre de l'équipe : écrit à la direction pour signaler un problème
//     d'utilisation (la page et l'appareil sont joints automatiquement).
//   - Direction : voit toutes les conversations de son organisation, répond
//     en direct et est alertée (pastille, notification push) à chaque message.
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
  let profilAbsent = null;    // compte connecté sans profil équipe : on n'insiste pas
  let els = null;
  const titreOrigine = document.title;

  const getSb = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (e) { return null; } };
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
#kk-sc-btn{position:fixed;right:24px;bottom:88px;z-index:9990;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;background:var(--orange,#F47920);color:#fff;font-size:24px;box-shadow:0 4px 14px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;font-family:inherit}
#kk-sc-btn:hover{filter:brightness(1.08)}
#kk-sc-btn.kk-sc-pulse{animation:kkScPulse 1.6s infinite}
@keyframes kkScPulse{0%,100%{box-shadow:0 4px 14px rgba(0,0,0,.28),0 0 0 0 rgba(244,121,32,.55)}50%{box-shadow:0 4px 14px rgba(0,0,0,.28),0 0 0 12px rgba(244,121,32,0)}}
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
    btn.innerHTML = '💬<span id="kk-sc-badge"></span>';
    btn.addEventListener('click', basculer);

    const panel = document.createElement('div');
    panel.id = 'kk-sc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat d’assistance');
    panel.innerHTML =
      '<div class="kk-sc-head"><button type="button" id="kk-sc-back" style="display:none" aria-label="Retour">←</button>' +
      '<b id="kk-sc-titre"></b><button type="button" id="kk-sc-close" aria-label="Fermer">✕</button></div>' +
      '<div class="kk-sc-body" id="kk-sc-body"></div>' +
      '<div class="kk-sc-foot" id="kk-sc-foot"><textarea id="kk-sc-input" rows="1" maxlength="' + MAX_CAR + '"></textarea>' +
      '<button type="button" id="kk-sc-send">Envoyer</button></div>';

    const toast = document.createElement('div');
    toast.id = 'kk-sc-toast';
    toast.addEventListener('click', () => { toast.style.display = 'none'; ouvrir(); });

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    document.body.appendChild(toast);
    els = {
      btn, panel, toast,
      badge: btn.querySelector('#kk-sc-badge'),
      titre: panel.querySelector('#kk-sc-titre'),
      body: panel.querySelector('#kk-sc-body'),
      foot: panel.querySelector('#kk-sc-foot'),
      input: panel.querySelector('#kk-sc-input'),
      send: panel.querySelector('#kk-sc-send'),
      back: panel.querySelector('#kk-sc-back')
    };
    panel.querySelector('#kk-sc-close').addEventListener('click', fermer);
    els.back.addEventListener('click', () => { convActive = null; rendre(); });
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
    ['kk-sc-btn', 'kk-sc-panel', 'kk-sc-toast'].forEach(id => { const n = document.getElementById(id); if (n) n.remove(); });
    els = null; msgs = []; me = null; uid = null; ouvert = false; convActive = null; nonLusPrec = 0;
    document.title = titreOrigine;
  }

  // ───────── Données ─────────
  async function chargerProfil(client, userId) {
    try {
      const { data: r } = await client.from('referents').select('*').eq('user_id', userId).maybeSingle();
      if (r) return { nom: r.name || r.nom || 'Référent·e', direction: r.role === 'direction' };
    } catch (e) { /* on tente la fiche collaborateur */ }
    try {
      const { data: e } = await client.from('employes').select('*').eq('user_id', userId).maybeSingle();
      if (e) return { nom: [e.prenom, e.nom].filter(Boolean).join(' ') || 'Collaborateur·trice', direction: false };
    } catch (e) { /* ignoré */ }
    return null;
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
    els.badge.style.display = n ? 'flex' : 'none';
    els.badge.textContent = n > 99 ? '99+' : String(n);
    els.btn.classList.toggle('kk-sc-pulse', n > 0);
    document.title = n ? '(' + n + ') ' + titreOrigine : titreOrigine;
    if (n > nonLusPrec && !ouvert) {
      const dernier = nonLus().slice(-1)[0];
      afficherToast(me.direction
        ? '💬 ' + (dernier.auteur_nom || 'Un membre de l’équipe') + ' : ' + dernier.contenu
        : '💬 Réponse de la direction : ' + dernier.contenu);
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
        const qui = moi ? '' : (m.from_support ? 'Direction · ' : '');
        return pre + '<div class="kk-sc-msg ' + (moi ? 'moi' : 'autre') + '">' + esc(m.contenu) +
          '<span class="kk-sc-meta">' + esc(qui + hhmm(m.created_at)) + '</span></div>';
      }).join('');
    }
    els.input.value = saisie;
    if (!depuisSondage || proche) body.scrollTop = body.scrollHeight;
  }

  // ───────── Envoi ─────────
  async function envoyer() {
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
        const { data } = await client.from('referents').select('id').eq('role', 'direction');
        ids = (data || []).map(r => r.id);
      }
      if (!ids.length) return;
      await client.functions.invoke('notify-push', {
        body: {
          referent_ids: ids,
          title: me.direction ? 'Réponse de la direction' : 'Chat assistance — ' + me.nom,
          body: texte.slice(0, 120),
          url: './demandes.html',
          tag: 'support-chat-' + conv
        }
      });
    } catch (e) { console.warn('[SupportChat] push', e); }
  }

  // ───────── Ouverture / fermeture / actualisation ─────────
  function ouvrir() {
    if (!els) return;
    ouvert = true;
    els.panel.classList.add('kk-sc-open');
    els.toast.style.display = 'none';
    rendre();
    marquerLu();
    planifier();
    if (!me.direction || convActive) setTimeout(() => { if (els) els.input.focus(); }, 50);
  }
  function fermer() {
    ouvert = false;
    if (els) els.panel.classList.remove('kk-sc-open');
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
    if (!client || !client.auth) return;
    let session = null;
    try { session = (await client.auth.getSession()).data.session; } catch (e) { return; }
    const userId = session && session.user ? session.user.id : null;
    if (!userId) { if (uid) detruireUI(); return; }
    if (uid === userId || profilAbsent === userId) return;
    if (uid) detruireUI();
    const profil = await chargerProfil(client, userId);
    if (!profil) { profilAbsent = userId; return; } // compte sans profil équipe
    uid = userId; me = profil;
    creerUI();
    ecouterTempsReel(client);
    await charger();
    planifier();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && els) charger(); });

  function demarrer() {
    verifierSession();
    // La connexion se fait après le chargement de la page : on surveille la session.
    setInterval(verifierSession, 5000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
