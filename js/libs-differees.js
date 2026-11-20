// Bibliothèques lourdes (export Excel, zip, QR code, PDF) chargées APRÈS l'affichage de la page,
// au lieu de bloquer le démarrage. Les noms globaux restent les mêmes (XLSX, JSZip, QRCode,
// pdfjsLib, html2canvas, jspdf) : le code existant les utilise au clic, comme avant.
// kkLibs.pret() renvoie une promesse résolue quand tout est chargé.
(function (w) {
  var BASE = 'https://cdnjs.cloudflare.com/ajax/libs/';
  var LIBS = [
    BASE + 'xlsx/0.18.5/xlsx.full.min.js',
    BASE + 'jszip/3.10.1/jszip.min.js',
    BASE + 'qrcodejs/1.0.0/qrcode.min.js',
    BASE + 'pdf.js/3.11.174/pdf.min.js',
    BASE + 'html2canvas/1.4.1/html2canvas.min.js',
    BASE + 'jspdf/2.5.1/jspdf.umd.min.js'
  ];
  var promesse = null;

  function charger(src) {
    return new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { ok(true); };
      s.onerror = function () { console.warn('[libs-differees] échec', src); ok(false); };
      document.head.appendChild(s);
    });
  }

  function lancer() {
    if (promesse) return promesse;
    promesse = Promise.all(LIBS.map(charger)).then(function () {
      if (w.pdfjsLib) w.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.js/3.11.174/pdf.worker.min.js';
    });
    return promesse;
  }

  w.kkLibs = { pret: lancer };

  // Démarrage dès que la page est affichée ; un premier clic / toucher le devance.
  function planifier() {
    if (w.requestIdleCallback) w.requestIdleCallback(lancer, { timeout: 2000 });
    else setTimeout(lancer, 300);
  }
  if (document.readyState === 'complete') planifier();
  else w.addEventListener('load', planifier);
  ['pointerdown', 'keydown'].forEach(function (e) { w.addEventListener(e, lancer, { once: true, capture: true }); });
})(window);
