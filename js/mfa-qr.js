/* QR code d'enrôlement de la double authentification (TOTP).
   kkMfaQr(conteneur, totp) : dessine le QR localement à partir de l'URI otpauth:// (qrcodejs, comme les autres
   QR de l'application) sur fond blanc avec marge, ce que les applications d'authentification exigent. Si la
   bibliothèque est indisponible, repli sur l'image fournie par Supabase (totp.qr_code), elle aussi sur fond blanc.
   Un lien « Ouvrir dans l'application » sert quand on est sur le téléphone qui doit enregistrer le compte. */
(function () {
  'use strict';
  var LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  var TAILLE = 200;

  function chargerLib() {
    if (typeof QRCode === 'function') return Promise.resolve(true);
    return new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = LIB;
      s.onload = function () { ok(typeof QRCode === 'function'); };
      s.onerror = function () { ok(false); };
      document.head.appendChild(s);
    });
  }

  function repliSupabase(boite, qr) {
    var svg = (qr || '').match(/<svg[\s\S]*<\/svg>/i);
    var img = document.createElement('img');
    img.alt = 'QR code MFA';
    img.style.cssText = 'display:block;width:' + TAILLE + 'px;height:' + TAILLE + 'px;object-fit:contain';
    if (svg) img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg[0]);
    else img.src = qr || '';
    boite.appendChild(img);
  }

  window.kkMfaQr = async function (el, totp) {
    if (!el) return;
    totp = totp || {};
    el.innerHTML = '';
    el.style.overflow = 'visible';
    el.style.flexDirection = 'column';
    var boite = document.createElement('div');
    boite.style.cssText = 'background:#fff;padding:14px;border-radius:10px;line-height:0;display:inline-block;box-shadow:0 0 0 1px rgba(0,0,0,.12)';
    el.appendChild(boite);

    var fait = false;
    if (totp.uri && await chargerLib()) {
      try {
        new QRCode(boite, { text: totp.uri, width: TAILLE, height: TAILLE, correctLevel: QRCode.CorrectLevel.M });
        fait = true;
      } catch (e) { console.warn('QRCode lib KO', e); boite.innerHTML = ''; }
    }
    if (!fait) repliSupabase(boite, totp.qr_code);

    if (totp.uri) {
      var a = document.createElement('a');
      a.href = totp.uri;
      a.textContent = "Sur le téléphone ? Ouvrir dans l'application d'authentification";
      a.style.cssText = 'display:block;margin-top:10px;font-size:.8rem;line-height:1.3';
      el.appendChild(a);
    }
  };
})();
