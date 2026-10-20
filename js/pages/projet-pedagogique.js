/* Projet pédagogique : le PDF s'affiche comme un livre à feuilleter (pdf.js pour dessiner
   les pages, page-flip pour tourner). Les pages sont dessinées à la demande, autour de celle
   qui est lue. */
(function(){
  const $ = id => document.getElementById(id);
  /* Sans paramètre : le projet pédagogique. Depuis Documents : ?f=<url du PDF>&t=<titre>. */
  const params = new URLSearchParams(location.search);
  const f = params.get('f');
  const PDF = f && /^https:\/\//i.test(f) ? f : 'projet-pedagogique-koalakids.pdf';
  const titre = params.get('t');
  if (titre) {
    document.title = 'Koala Kids — ' + titre;
    $('titre').textContent = titre;
  }
  $('btnTelecharger').href = PDF;
  const etat = $('etat'), etatTxt = $('etatTxt');

  let ouvert = false;
  function echec(e){
    if (ouvert) return;
    etat.hidden = false;
    etat.querySelector('.big').textContent = '📄';
    etatTxt.innerHTML = 'Le livre ne peut pas s\'afficher ici.<br><a href="'+PDF+'" target="_blank" rel="noopener">Ouvrir le document PDF</a>'
      + (e && e.message ? '<br><small style="opacity:.6">'+String(e.message).replace(/</g,'&lt;')+'</small>' : '');
  }
  /* Si rien ne s'affiche au bout de 25 s, on propose le PDF plutôt que d'attendre sans fin. */
  const garde = setTimeout(() => echec(new Error('Délai dépassé')), 25000);
  if (!window.pdfjsLib || !window.St) { echec(); return; }

  const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  /* Le worker vient d'un autre site : on le récupère et on le sert depuis un blob de la page,
     ce qui évite les refus de certains navigateurs pour un worker d'une autre origine. */
  async function preparerWorker(){
    try {
      const r = await fetch(WORKER);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
    } catch (e) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
    }
  }

  let pdf, flip, total = 0, ratio = 1.414;
  const imgs = [];            // <img> de chaque page
  const etatPage = [];        // 0 = à faire, 1 = en cours, 2 = fait
  const urls = [];

  async function dessiner(n){                 // n = index 0
    if (n < 0 || n >= total || etatPage[n]) return;
    etatPage[n] = 1;
    try {
      const page = await pdf.getPage(n + 1);
      const base = page.getViewport({ scale: 1 });
      const largeur = Math.min(1100, Math.max(600, imgs[n].parentNode.clientWidth * (window.devicePixelRatio || 1) * 1.4));
      const vp = page.getViewport({ scale: largeur / base.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      urls[n] = URL.createObjectURL(blob);
      imgs[n].src = urls[n];
      etatPage[n] = 2;
      page.cleanup();
    } catch (e) { etatPage[n] = 0; }
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
      size: 'stretch', minWidth: 240, maxWidth: 700, minHeight: 340, maxHeight: 990,
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

    ouvert = true; clearTimeout(garde);
    etat.hidden = true;
    $('btnPrev').hidden = $('btnNext').hidden = $('barre').hidden = false;
  }

  preparerWorker().then(() => pdfjsLib.getDocument(PDF).promise).then(async doc => {
    pdf = doc; total = doc.numPages;
    const p1 = await doc.getPage(1);
    const v = p1.getViewport({ scale: 1 });
    ratio = v.height / v.width;
    monter();
  }).catch(echec);
})();
