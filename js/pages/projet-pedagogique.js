/* Projet pédagogique : le PDF s'affiche comme un livre à feuilleter (pdf.js pour dessiner
   les pages, page-flip pour tourner). Les pages sont dessinées à la demande, autour de celle
   qui est lue. */
(function(){
  const $ = id => document.getElementById(id);
  /* Livres fournis en images pré-calculées + index de recherche (tools/projet-pedagogique-generer.py) :
     aucun moteur PDF à faire tourner. Sans paramètre : le projet pédagogique ; ?livre=socle : le socle.
     Les autres PDF (Documents) : ?f=<url du PDF>&t=<titre>, lus avec pdf.js. */
  const LIVRES = {
    'projet-pedagogique': { titre: 'Projet pédagogique', pdf: 'projet-pedagogique-koalakids.pdf', pages: 'projet-pedagogique-pages/p-', mots: 'projet-pedagogique-mots.json', nb: 121 },
    'socle': { titre: 'Socle national de connaissances', pdf: 'socle-connaissances.pdf', pages: 'socle-pages/p-', mots: 'socle-mots.json', nb: 44 }
  };
  const params = new URLSearchParams(location.search);
  const f = params.get('f');
  const livre = LIVRES[params.get('livre')] || (f && /^https:\/\//i.test(f) ? null : LIVRES['projet-pedagogique']);
  const IMAGES = !!livre;
  const PDF = livre ? livre.pdf : f;
  const NB_PAGES = livre ? livre.nb : 0;
  const titre = params.get('t') || (livre && livre.titre);
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
      imgs[n].src = livre.pages + String(n + 1).padStart(3, '0') + '.jpg';
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

  // Bruit de page qui se tourne : enregistrement sons/page-tournee.mp3 ; si le fichier ne charge pas,
  // repli sur un son synthétisé (froissement + petit « poc »).
  let ac, bruit;
  const SON = 'sons/page-tournee.mp3';
  let sonOk = true;
  function sonPage(){
    if (sonOk) {
      try {
        const a = new Audio(SON);
        a.volume = .8;
        a.onerror = () => { sonOk = false; };
        const r = a.play();
        if (r && r.catch) r.catch(() => {});
        return;
      } catch (e) { sonOk = false; }
    }
    sonSynthese();
  }
  function sonSynthese(){
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ac) ac = new AC();
      if (ac.state === 'suspended') ac.resume();
      const sr = ac.sampleRate, dur = .62;
      if (!bruit) {
        bruit = ac.createBuffer(1, Math.round(sr * dur), sr);
        const d = bruit.getChannelData(0), n = d.length;
        let doux = 0, crac = 0;
        for (let i = 0; i < n; i++) {
          const t = i / n, w = Math.random() * 2 - 1;
          doux = doux * .86 + w * .14;                       // bruit adouci (papier)
          if (Math.random() < .018 + .05 * t) crac = (Math.random() * 2 - 1) * 1.6; // craquements
          crac *= .82;
          const env = t < .06 ? t / .06 : Math.pow(1 - (t - .06) / .94, 1.6) * (.55 + .45 * Math.sin(t * 9) ** 2);
          d[i] = (doux * 1.8 + crac * .9) * env;
        }
        // « poc » final : page qui se pose
        const poc = Math.round(sr * .44);
        for (let i = 0; i < sr * .09 && poc + i < n; i++) {
          const e = Math.exp(-i / (sr * .02));
          d[poc + i] += Math.sin(2 * Math.PI * 140 * i / sr) * e * .5 + (Math.random() * 2 - 1) * e * .25;
        }
      }
      const t = ac.currentTime;
      const src = ac.createBufferSource(); src.buffer = bruit;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
      const g = ac.createGain(); g.gain.value = .75;
      src.connect(hp); hp.connect(g); g.connect(ac.destination);
      src.start(t);
    } catch (e) {}
  }

  function monter(){
    const livreEl = $('livre');
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      d.className = 'page';
      if (i === 0 || i === total - 1) d.setAttribute('data-density', 'hard');
      const im = document.createElement('img');
      im.alt = 'Page ' + (i + 1);
      im.draggable = false;
      d.appendChild(im);
      livreEl.appendChild(d);
      imgs.push(im); etatPage.push(0);
    }
    flip = new St.PageFlip(livreEl, {
      width: 400, height: Math.round(400 * ratio),
      size: 'stretch', minWidth: 240, maxWidth: 1100, minHeight: 340, maxHeight: 1550,
      showCover: true, maxShadowOpacity: .5, mobileScrollSupport: false,
      usePortrait: true, autoSize: true, flippingTime: 700
    });
    flip.loadFromHTML(livreEl.querySelectorAll('.page'));
    flip.on('flip', e => { majBarre(e.data); autour(e.data); });
    flip.on('changeState', e => { if (e.data === 'flipping') sonPage(); });
    flip.on('changeOrientation', () => majBarre(flip.getCurrentPageIndex()));
    autour(0);
    majBarre(0);

    $('curseur').max = total;
    $('curseur').oninput = e => { const i = +e.target.value - 1; flip.turnToPage(i); majBarre(i); autour(i); };
    $('btnPrev').onclick = () => flip.flipPrev();
    $('btnNext').onclick = () => flip.flipNext();
    document.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
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
    let motsPage = null, termes = [];          // index de recherche (IMAGES) et mots à surligner
    const surlignerPage = () => {
      const couche = $('lpMarques'); couche.innerHTML = '';
      if (!motsPage || !termes.length) return;
      motsPage[lp].forEach(w => {
        const n = w[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (!termes.some(t => n.includes(t))) return;
        const m = document.createElement('i');
        m.style.cssText = 'left:' + (w[1] / 10 - .15) + '%;top:' + (w[2] / 10 - .1) + '%;width:' + (w[3] / 10 + .3) + '%;height:' + (w[4] / 10 + .2) + '%';
        couche.appendChild(m);
      });
    };
    const ZOOMS = [1, 1.5, 2, 3, 4];
    const lpAfficher = async () => {
      $('lpTxt').textContent = 'Page ' + (lp + 1) + ' / ' + total;
      $('lpPrev').disabled = lp <= 0; $('lpNext').disabled = lp >= total - 1;
      $('lpMoins').disabled = zoom <= ZOOMS[0]; $('lpPlus').disabled = zoom >= ZOOMS[ZOOMS.length - 1];
      const zone = $('lpZone'), im = $('lpImg');
      const largeur = Math.min(zone.clientWidth, (zone.clientHeight || 600) / ratio);
      $('lpWrap').style.width = Math.round(largeur * zoom) + 'px';
      surlignerPage();
      dessiner(lp);
      for (let k = 0; k < 40 && !imgs[lp].src; k++) await new Promise(r => setTimeout(r, 250));
      im.src = imgs[lp].src;
      zone.scrollTop = 0;
    };
    const lpOuvrir = (page) => {
      lp = typeof page === 'number' ? page : flip.getCurrentPageIndex(); zoom = 1;
      $('loupe').hidden = false; lpAfficher();
    };
    const lpFermer = () => { $('loupe').hidden = true; try { flip.turnToPage(lp); majBarre(lp); autour(lp); } catch (e) {} };
    $('btnLoupe').hidden = false;
    $('btnLoupe').onclick = () => lpOuvrir();
    $('lpFermer').onclick = lpFermer;
    $('lpPrev').onclick = () => { if (lp > 0) { lp--; lpAfficher(); } };
    $('lpNext').onclick = () => { if (lp < total - 1) { lp++; lpAfficher(); } };
    $('lpPlus').onclick = () => { const i = ZOOMS.indexOf(zoom); if (i < ZOOMS.length - 1) { zoom = ZOOMS[i + 1]; lpAfficher(); } };
    $('lpMoins').onclick = () => { const i = ZOOMS.indexOf(zoom); if (i > 0) { zoom = ZOOMS[i - 1]; lpAfficher(); } };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('loupe').hidden) lpFermer(); });

    /* Recherche par mot : index des mots de chaque page (projet-pedagogique-mots.json), chargé à la première
       recherche. Sans accents ni majuscules ; un résultat par page, qui ouvre la page en grand avec le mot surligné. */
    if (IMAGES) {
      let textes = null, norm = null;
      const sansAccent = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ');
      const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const charger = async () => {
        if (textes) return;
        $('rechInfo').textContent = 'Chargement du texte…';
        const r = await fetch(livre.mots);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        motsPage = await r.json();
        textes = motsPage.map(p => p.map(w => w[0]).join(' '));
        norm = textes.map(sansAccent);
      };
      const chercher = () => {
        const q = sansAccent($('rechQ').value).trim();
        const liste = $('rechListe'); liste.innerHTML = '';
        if (q.length < 2) { $('rechInfo').textContent = 'Tapez au moins 2 lettres.'; termes = []; return; }
        const mots = q.split(/\s+/);
        termes = mots;
        const trouvees = [];
        norm.forEach((t, i) => { if (mots.every(m => t.includes(m))) trouvees.push(i); });
        $('rechInfo').textContent = trouvees.length
          ? trouvees.length + ' page' + (trouvees.length > 1 ? 's' : '') + ' trouvée' + (trouvees.length > 1 ? 's' : '') + ' — touchez une page pour la lire en grand'
          : 'Aucun résultat pour « ' + $('rechQ').value.trim() + ' ».';
        trouvees.slice(0, 80).forEach(i => {
          const t = textes[i], tn = norm[i];
          const pos = Math.max(0, tn.indexOf(mots[0]));
          const deb = Math.max(0, pos - 60), fin = Math.min(t.length, pos + 110);
          let extrait = esc(t.slice(deb, fin));
          mots.forEach(m => { extrait = extrait.replace(new RegExp('(' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'res';
          b.innerHTML = '<b>Page ' + (i + 1) + '</b><span>' + (deb > 0 ? '… ' : '') + extrait + (fin < t.length ? ' …' : '') + '</span>';
          b.onclick = () => { $('rech').hidden = true; lpOuvrir(i); };
          liste.appendChild(b);
        });
      };
      let delai;
      $('btnRecherche').hidden = false;
      $('btnRecherche').onclick = async () => {
        $('rech').hidden = false; $('rechQ').focus();
        try { await charger(); chercher(); } catch (e) { $('rechInfo').textContent = 'Recherche indisponible (' + e.message + ').'; }
      };
      $('rechQ').oninput = () => { clearTimeout(delai); delai = setTimeout(() => { if (textes) chercher(); }, 200); };
      $('rechFermer').onclick = () => { $('rech').hidden = true; };
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('rech').hidden) $('rech').hidden = true; });
    }

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
