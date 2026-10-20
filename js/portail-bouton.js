/* Agrandit le bouton « Portail » (lien vers index.html) sur toutes les pages internes. */
(function () {
  function agrandir() {
    document.querySelectorAll('a[href$="index.html"]').forEach(function (a) {
      if (a.dataset.portailGrand || !/^\W*Portail$/i.test((a.textContent || '').trim())) return;
      a.dataset.portailGrand = '1';
      a.style.setProperty('font-size', '15px', 'important');
      a.style.setProperty('font-weight', '700', 'important');
      a.style.setProperty('padding', '10px 18px', 'important');
      a.style.setProperty('gap', '8px', 'important');
      a.querySelectorAll('i').forEach(function (i) { i.style.setProperty('font-size', '19px', 'important'); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', agrandir);
  else agrandir();
})();
