/* Projet pédagogique : le PDF s'affiche comme un livre à feuilleter (pdf.js pour dessiner
   les pages, page-flip pour tourner). Les pages sont dessinées à la demande, autour de celle
   qui est lue. */
(function(){
  const $ = id => document.getElementById(id);
  /* Sans paramètre : le projet pédagogique. Depuis Documents : ?f=<url du PDF>&t=<titre>. */
  const params = new URLSearchParams(location.search);
  const f = params.get('f');
  const PDF = f && /^https:\/\//i.test(f) ? f : 'projet-pedagogique-koalakids.pdf';
  /* Le projet pédagogique est fourni en images pré-calculées (projet-pedagogique-pages/p-001.jpg…) :
     aucun moteur PDF à faire tourner. Les autres PDF (Documents) passent par pdf.js. */
  const IMAGES = /(^|\/)projet-pedagogique-koalakids\.pdf$/.test(PDF);
  const NB_PAGES = 121;
  const titre = params.get('t');
  if (titre) {
    document.title = 'Koala Kids — ' + titre;
    $('titre').textContent = titre;
  }
  $('btnTelecharger').href = PDF;
  const etat = $('etat'), etatTxt = $('etatTxt');

  let ouvert = false, etape = 'chargement des bibliothèques';
  function echec(e){
    if (ouvert) return;
    etat.hidden = false;
    etat.querySelector('.big').textContent = '📄';
    etatTxt.innerHTML = 'Le livre ne peut pas s\'afficher ici.<br><a href="'+PDF+'" target="_blank" rel="noopener">Ouvrir le document PDF</a>'
      + '<br><small style="opacity:.6">' + String((e && e.message) || 'erreur').replace(/</g,'&lt;') + ' — étape : ' + etape + '</small>';
  }
  /* Si rien ne s'affiche au bout de 25 s, on propose le PDF plutôt que d'attendre sans fin. */
  const garde = setTimeout(() => echec(new Error('Délai dépassé')), 25000);
  if (!window.St || (!IMAGES && !window.pdfjsLib)) { echec(); return; }

  /* Le moteur de lecture est chargé dans la page (pas de Worker) : plus lent à l'ouverture,
     mais il ne dépend d'aucun réglage du navigateur. */
  function chargerMoteur(){
    return new Promise((ok, ko) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      sc.onload = ok; sc.onerror = () => ko(new Error('moteur de lecture inaccessible'));
      document.head.appendChild(sc);
    });
  }

  let pdf, flip, total = 0, ratio = 1.414;
  const imgs = [];            // <img> de chaque page
  const etatPage = [];        // 0 = à faire, 1 = en cours, 2 = fait
  const urls = [];

  const avec = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('délai dépassé')), ms))]);

  async function dessiner(n){                 // n = index 0
    if (n < 0 || n >= total || etatPage[n]) return;
    etatPage[n] = 1;
    if (IMAGES) {
      imgs[n].onerror = () => imgs[n].parentNode.setAttribute('data-erreur', 'Page ' + (n + 1) + ' : image introuvable');
      imgs[n].src = 'projet-pedagogique-pages/p-' + String(n + 1).padStart(3, '0') + '.jpg';
      etatPage[n] = 2;
      return;
    }
    try {
      const page = await avec(pdf.getPage(n + 1), 20000);
      const base = page.getViewport({ scale: 1 });
      const largeur = Math.min(1000, Math.max(600, imgs[n].parentNode.clientWidth * (window.devicePixelRatio || 1) * 1.4));
      const vp = page.getViewport({ scale: largeur / base.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await avec(page.render({ canvasContext: ctx, viewport: vp }).promise, 30000);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      imgs[n].src = blob ? (urls[n] = URL.createObjectURL(blob)) : c.toDataURL('image/jpeg', 0.85);
      etatPage[n] = 2;
      page.cleanup();
    } catch (e) {
      etatPage[n] = 0;                        // sera retentée au prochain tour de page
      console.error('page ' + (n + 1), e);
      imgs[n].parentNode.setAttribute('data-erreur', 'Page ' + (n + 1) + ' : ' + ((e && e.message) || 'erreur'));
    }
  }

  let file = Promise.resolve();
  function autour(i){                         // pages proches d'abord
    [0, 1, 2, -1, 3, 4, -2, 5, 6].forEach(d => {
      const n = i + d;
      file = file.then(() => dessiner(n));
    });
  }

  function majBarre(i){
    const dernier = total - 1;
    $('curseur').value = i + 1;
    $('pgTxt').textContent = (i === 0 || i === dernier || flip.getOrientation() === 'portrait')
      ? 'Page ' + (i + 1) + ' / ' + total
      : 'Pages ' + (i + 1) + '-' + Math.min(i + 2, total) + ' / ' + total;
    $('btnPrev').disabled = i <= 0;
    $('btnNext').disabled = i >= dernier;
  }

  function monter(){
    const livre = $('livre');
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      d.className = 'page';
      if (i === 0 || i === total - 1) d.setAttribute('data-density', 'hard');
      const im = document.createElement('img');
      im.alt = 'Page ' + (i + 1);
      im.draggable = false;
      d.appendChild(im);
      livre.appendChild(d);
      imgs.push(im); etatPage.push(0);
    }
    flip = new St.PageFlip(livre, {
      width: 400, height: Math.round(400 * ratio),
      size: 'stretch', minWidth: 240, maxWidth: 1100, minHeight: 340, maxHeight: 1550,
      showCover: true, maxShadowOpacity: .5, mobileScrollSupport: false,
      usePortrait: true, autoSize: true, flippingTime: 700
    });
    flip.loadFromHTML(livre.querySelectorAll('.page'));
    flip.on('flip', e => { majBarre(e.data); autour(e.data); });
    flip.on('changeOrientation', () => majBarre(flip.getCurrentPageIndex()));
    autour(0);
    majBarre(0);

    $('curseur').max = total;
    $('curseur').oninput = e => { const i = +e.target.value - 1; flip.turnToPage(i); majBarre(i); autour(i); };
    $('btnPrev').onclick = () => flip.flipPrev();
    $('btnNext').onclick = () => flip.flipNext();
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') flip.flipPrev();
      else if (e.key === 'ArrowRight') flip.flipNext();
    });
    $('btnPlein').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    };
    if (!document.documentElement.requestFullscreen) $('btnPlein').hidden = true;

    /* Page en grand (zoom), pour lire le texte sur un petit écran. */
    let lp = 0, zoom = 1;
    const ZOOMS = [1, 1.5, 2, 3];
    const lpAfficher = async () => {
      $('lpTxt').textContent = 'Page ' + (lp + 1) + ' / ' + total;
      $('lpPrev').disabled = lp <= 0; $('lpNext').disabled = lp >= total - 1;
      $('lpMoins').disabled = zoom <= ZOOMS[0]; $('lpPlus').disabled = zoom >= ZOOMS[ZOOMS.length - 1];
      const zone = $('lpZone'), im = $('lpImg');
      const largeur = Math.min(zone.clientWidth, (zone.clientHeight || 600) / ratio);
      im.style.width = Math.round(largeur * zoom) + 'px';
      dessiner(lp);
      for (let k = 0; k < 40 && !imgs[lp].src; k++) await new Promise(r => setTimeout(r, 250));
      im.src = imgs[lp].src;
      zone.scrollTop = 0;
    };
    const lpOuvrir = () => {
      lp = flip.getCurrentPageIndex(); zoom = 1;
      $('loupe').hidden = false; lpAfficher();
    };
    const lpFermer = () => { $('loupe').hidden = true; try { flip.turnToPage(lp); majBarre(lp); autour(lp); } catch (e) {} };
    $('btnLoupe').hidden = false;
    $('btnLoupe').onclick = lpOuvrir;
    $('lpFermer').onclick = lpFermer;
    $('lpPrev').onclick = () => { if (lp > 0) { lp--; lpAfficher(); } };
    $('lpNext').onclick = () => { if (lp < total - 1) { lp++; lpAfficher(); } };
    $('lpPlus').onclick = () => { const i = ZOOMS.indexOf(zoom); if (i < ZOOMS.length - 1) { zoom = ZOOMS[i + 1]; lpAfficher(); } };
    $('lpMoins').onclick = () => { const i = ZOOMS.indexOf(zoom); if (i > 0) { zoom = ZOOMS[i - 1]; lpAfficher(); } };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('loupe').hidden) lpFermer(); });

    ouvert = true; clearTimeout(garde);
    etat.hidden = true;
    $('btnPrev').hidden = $('btnNext').hidden = $('barre').hidden = false;
  }

  if (IMAGES) {
    total = NB_PAGES; ratio = 842 / 596;
    etape = 'mise en page du livre';
    try { monter(); } catch (e) { echec(e); }
    return;
  }
  etape = 'moteur de lecture';
  chargerMoteur().then(() => { etape = 'ouverture du PDF'; return pdfjsLib.getDocument(PDF).promise; }).then(async doc => {
    pdf = doc; total = doc.numPages; etape = 'première page';
    const p1 = await doc.getPage(1);
    const v = p1.getViewport({ scale: 1 });
    ratio = v.height / v.width;
    etape = 'mise en page du livre';
    monter();
  }).catch(echec);
})();
