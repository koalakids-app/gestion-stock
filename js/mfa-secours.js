/* Codes de secours de la double authentification (TOTP). Edge function `mfa-codes-secours`
   (supabase/functions/mfa-codes-secours, sql/mfa_codes_secours.sql — à déployer/appliquer à la main).
   - Écran de saisie du code TOTP (toutes les pages protégées) : lien « Téléphone perdu ? », qui permet
     d'utiliser un code de secours. Le code retire l'ancien appareil ; la page est rechargée et propose
     d'en enregistrer un nouveau.
   - Panneau « Codes de secours » dans Demandes › Sécurité du compte (KKMfaSecours.monterPanneau) :
     génération de 10 codes à usage unique, à conserver hors du téléphone.
   S'appuie sur le client Supabase `sb` de la page. */
(function () {
  'use strict';
  if (window.KKMfaSecours) return;

  var SB_URL = 'https://juyrceadazrovlitxceb.supabase.co';
  var IDS_CODE = ['mfa-gate-code', 'mfaGateCode', 'mfaCode'];

  function client() { try { return typeof sb !== 'undefined' ? sb : null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function appel(action, extra) {
    var c = client();
    if (!c) return { ok: false, error: 'Connexion indisponible.' };
    try {
      var s = await c.auth.getSession();
      var jeton = s && s.data && s.data.session ? s.data.session.access_token : null;
      if (!jeton) return { ok: false, error: 'Session expirée, reconnectez-vous.' };
      var r = await fetch(SB_URL + '/functions/v1/mfa-codes-secours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jeton },
        body: JSON.stringify(Object.assign({ action: action }, extra || {}))
      });
      var d = await r.json().catch(function () { return {}; });
      return r.ok ? d : { ok: false, error: d.error || 'Erreur ' + r.status };
    } catch (e) { return { ok: false, error: (e && e.message) || 'Réseau injoignable.' }; }
  }

  /* ---------- écran de connexion : « Téléphone perdu ? » ---------- */
  function ajouterLien() {
    var champ = null;
    for (var i = 0; i < IDS_CODE.length && !champ; i++) champ = document.getElementById(IDS_CODE[i]);
    if (!champ || document.getElementById('kk-ms-lien')) return;
    var zone = champ.closest('.f, .fg') || champ.parentNode;
    var bloc = document.createElement('div');
    bloc.id = 'kk-ms-lien';
    bloc.style.cssText = 'margin:8px 0;text-align:center;font-size:12.5px';
    bloc.innerHTML = '<a href="#" id="kk-ms-ouvrir" style="color:#3D3580;font-weight:700">Téléphone perdu ? Utiliser un code de secours</a>' +
      '<div id="kk-ms-form" style="display:none;margin-top:8px">' +
      '<input id="kk-ms-code" type="text" maxlength="11" autocomplete="off" placeholder="ABCDE-FGHJK" style="letter-spacing:2px;text-align:center;font-size:16px;text-transform:uppercase;width:100%;box-sizing:border-box;padding:8px;border:1.5px solid #ddd;border-radius:8px"/>' +
      '<button type="button" id="kk-ms-go" style="margin-top:8px;width:100%;padding:9px;border:none;border-radius:8px;background:#3D3580;color:#fff;font-weight:700;cursor:pointer">Utiliser ce code</button>' +
      '<div id="kk-ms-msg" style="margin-top:6px;color:#c0392b"></div>' +
      '<div style="margin-top:6px;color:#666;font-size:11.5px">L’ancien appareil sera retiré : vous en configurerez un nouveau juste après. Pas de code ? Demandez à la direction.</div></div>';
    zone.parentNode.insertBefore(bloc, zone.nextSibling);
    document.getElementById('kk-ms-ouvrir').addEventListener('click', function (e) {
      e.preventDefault();
      var f = document.getElementById('kk-ms-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
      if (f.style.display === 'block') document.getElementById('kk-ms-code').focus();
    });
    var go = document.getElementById('kk-ms-go'), msg = document.getElementById('kk-ms-msg');
    async function utiliser() {
      msg.style.color = '#c0392b';
      var code = document.getElementById('kk-ms-code').value;
      if (code.replace(/[^A-Za-z0-9]/g, '').length !== 10) { msg.textContent = 'Le code de secours compte 10 caractères.'; return; }
      go.disabled = true; msg.textContent = '';
      var r = await appel('utiliser', { code: code });
      if (!r.ok) { msg.textContent = r.error; go.disabled = false; return; }
      msg.style.color = '#2e7d32';
      msg.textContent = 'Code accepté. Configuration d’un nouvel appareil…';
      setTimeout(function () { location.reload(); }, 900);
    }
    go.addEventListener('click', utiliser);
    document.getElementById('kk-ms-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); utiliser(); } });
  }
  function surveiller() {
    ajouterLien();
    /* L'écran de code apparaît après la connexion : on regarde le DOM un moment. */
    var n = 0, t = setInterval(function () { ajouterLien(); if (++n > 120 || document.getElementById('kk-ms-lien')) clearInterval(t); }, 1000);
  }

  /* ---------- panneau de génération (Sécurité du compte) ---------- */
  function telecharger(codes) {
    var txt = 'Koala Kids — codes de secours (double authentification)\n' +
      'Chaque code ne sert qu’une fois. Conservez ce fichier hors de votre téléphone.\n\n' + codes.join('\n') + '\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    a.download = 'codes-de-secours-koalakids.txt';
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function monterPanneau(el) {
    if (!el) return;
    el.innerHTML = '<div style="color:#888;font-size:13px">Codes de secours…</div>';
    var r = await appel('statut');
    var n = r.ok ? r.restants : null;
    el.innerHTML = '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #eee">' +
      '<div style="font-weight:700;margin-bottom:4px"><i class="ti ti-key"></i> Codes de secours</div>' +
      '<div style="font-size:12.5px;color:#555;line-height:1.5;margin-bottom:8px">Si vous perdez votre téléphone, un code de secours (usage unique) vous permet de configurer un nouvel appareil sans aide.</div>' +
      (n === null ? '<div style="color:#c0392b;font-size:12.5px">' + esc(r.error || 'Indisponible') + '</div>'
        : '<div style="font-size:13px;margin-bottom:8px;color:' + (n === 0 ? '#c0392b' : n <= 2 ? '#e67e22' : '#2e7d32') + '">' +
          (n === 0 ? 'Aucun code de secours : générez-les maintenant.' : n + ' code(s) de secours restant(s)' + (n <= 2 ? ' — pensez à en générer de nouveaux.' : '.')) + '</div>') +
      '<button type="button" class="btn-cancel" id="kk-ms-gen">' + (n ? 'Générer de nouveaux codes' : 'Générer mes codes') + '</button>' +
      '<div id="kk-ms-res" style="margin-top:10px"></div></div>';
    function afficher(res, codes) {
      res.innerHTML = '<div style="background:#f4f4f8;border-radius:8px;padding:10px 12px;font-family:monospace;font-size:14px;letter-spacing:1px;line-height:1.9;column-count:2">' +
        codes.map(esc).join('<br>') + '</div>' +
        '<div style="font-size:12px;color:#c0392b;margin:8px 0">Notez-les maintenant : ils ne seront plus affichés. Gardez-les hors de votre téléphone.</div>' +
        '<button type="button" class="btn-cancel" id="kk-ms-dl"><i class="ti ti-download"></i> Télécharger</button> ' +
        '<button type="button" class="btn-cancel" id="kk-ms-cp"><i class="ti ti-copy"></i> Copier</button>';
      document.getElementById('kk-ms-dl').addEventListener('click', function () { telecharger(codes); });
      document.getElementById('kk-ms-cp').addEventListener('click', function () {
        try { navigator.clipboard.writeText(codes.join('\n')); this.textContent = 'Copié'; } catch (e) { /* copie indisponible */ }
      });
    }
    async function generer(res) {
      res.textContent = '…';
      var g = await appel('generer');
      if (!g.ok) { res.innerHTML = '<span style="color:#c0392b;font-size:12.5px">' + esc(g.error) + '</span>'; return; }
      afficher(res, g.codes);
    }
    /* Appareil mémorisé : la session n'est qu'en « aal1 ». On redemande le code TOTP pour la passer en « aal2 ». */
    async function confirmerCode(res) {
      res.innerHTML = '<div style="font-size:12.5px;margin-bottom:6px">Pour votre sécurité, entrez le code à 6 chiffres de votre application :</div>' +
        '<input id="kk-ms-totp" type="text" inputmode="numeric" maxlength="6" placeholder="123456" style="letter-spacing:4px;text-align:center;font-size:16px;width:130px;padding:8px;border:1.5px solid #ddd;border-radius:8px"/> ' +
        '<button type="button" class="btn-primary" id="kk-ms-totp-ok">Valider</button><div id="kk-ms-totp-err" style="color:#c0392b;font-size:12.5px;margin-top:6px"></div>';
      var c = client();
      document.getElementById('kk-ms-totp-ok').addEventListener('click', async function () {
        var err = document.getElementById('kk-ms-totp-err'); err.textContent = '';
        var code = document.getElementById('kk-ms-totp').value.trim();
        if (!/^\d{6}$/.test(code)) { err.textContent = 'Le code doit contenir 6 chiffres.'; return; }
        try {
          var fl = await c.auth.mfa.listFactors();
          var f = ((fl.data && fl.data.totp) || []).filter(function (x) { return x.status === 'verified'; })[0];
          if (!f) throw new Error('Aucun appareil enregistré.');
          var ch = await c.auth.mfa.challenge({ factorId: f.id });
          if (ch.error) throw ch.error;
          var v = await c.auth.mfa.verify({ factorId: f.id, challengeId: ch.data.id, code: code });
          if (v.error) throw v.error;
          await c.auth.refreshSession();
          await generer(res);
        } catch (e) { err.textContent = 'Code invalide ou expiré.'; }
      });
    }
    document.getElementById('kk-ms-gen').addEventListener('click', async function () {
      if (n && !confirm('Les codes actuels ne fonctionneront plus. Continuer ?')) return;
      var res = document.getElementById('kk-ms-res');
      var c = client(), niveau = null;
      try { var a = await c.auth.mfa.getAuthenticatorAssuranceLevel(); niveau = a.data && a.data.currentLevel; } catch (e) { /* on tentera quand même */ }
      if (niveau && niveau !== 'aal2') await confirmerCode(res); else await generer(res);
    });
  }

  /* Rappel discret (Demandes) : personne n'a encore de codes ou presque plus. */
  async function rappel() {
    var c = client();
    try {
      var fl = await c.auth.mfa.listFactors();
      if (!((fl.data && fl.data.totp) || []).some(function (x) { return x.status === 'verified'; })) return;
    } catch (e) { return; }
    var r = await appel('statut');
    if (r.ok && r.restants <= 2 && typeof showBanner === 'function') {
      showBanner(r.restants === 0 ? 'Pensez à générer vos codes de secours (Sécurité du compte).' : 'Il vous reste ' + r.restants + ' code(s) de secours : générez-en de nouveaux (Sécurité du compte).', 'error');
    }
  }

  window.KKMfaSecours = { monterPanneau: monterPanneau, rappel: rappel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', surveiller);
  else surveiller();
})();
