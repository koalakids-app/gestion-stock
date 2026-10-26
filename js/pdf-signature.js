// Mention « Application créée par David Bucari » au pied de chaque page des PDF jsPDF.
// Chargé dans <head> : s'accroche à jsPDF dès son chargement (page ou chargement à la demande).
(function (w) {
  var TEXTE = 'Application créée par David Bucari';

  function signer(doc) {
    if (!doc || doc.__kkSigne || !doc.internal) return;
    doc.__kkSigne = true;
    try {
      var n = doc.getNumberOfPages(), courante = doc.internal.getCurrentPageInfo().pageNumber;
      var f = doc.getFont(), taille = doc.getFontSize(), couleur = doc.getTextColor();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i);
        var pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
        doc.setFont(f.fontName, 'normal'); doc.setFontSize(6.5); doc.setTextColor(150);
        doc.text(TEXTE, pw / 2, ph - 2.5, { align: 'center' });
      }
      doc.setPage(courante);
      doc.setFont(f.fontName, f.fontStyle); doc.setFontSize(taille); doc.setTextColor(couleur);
    } catch (e) { console.warn('[pdf-signature]', e); }
  }

  function patcher(lib) {
    var api = lib && lib.jsPDF && lib.jsPDF.API;
    if (!api || api.__kkPatch || !api.events) return;
    api.__kkPatch = true;
    // output() et save() sont créés dans chaque document : on les enveloppe à l'initialisation.
    api.events.push(['initialized', function () {
      var doc = this;
      ['output', 'save'].forEach(function (m) {
        var orig = doc[m];
        if (typeof orig !== 'function') return;
        doc[m] = function () { signer(doc); return orig.apply(doc, arguments); };
      });
    }]);
  }

  function surveiller(lib) {
    if (!lib || typeof lib !== 'object') return;
    if (lib.jsPDF) return patcher(lib);
    var val;
    Object.defineProperty(lib, 'jsPDF', {
      configurable: true, enumerable: true,
      get: function () { return val; },
      set: function (v) { val = v; patcher(lib); }
    });
  }

  if (w.jspdf) return surveiller(w.jspdf);
  var lib;
  Object.defineProperty(w, 'jspdf', {
    configurable: true, enumerable: true,
    get: function () { return lib; },
    set: function (v) { lib = v; surveiller(v); }
  });
})(window);
