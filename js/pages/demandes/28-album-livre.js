/* Album photos — livre de souvenirs d'un enfant (départ définitif), mois par mois.
   Dessiné dans le navigateur (jsPDF, aucun envoi extérieur) : couverture, une ou
   plusieurs pages A4 par mois en ordre chronologique (date de prise de vue), page de fin.
   Le .zip remis aux parents range aussi les photos par dossier de mois (albZip,
   20-album-photos.js). Aucun SQL : tout vient de album_photos.prise_le.
   Dépend de 20-album-photos.js (ALB, albPhotosDe, albEnfantsDe, albNom, albDateFr). */
var ALBL_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
var ALBL_MAX = 6;           // photos par page
var ALBL_PX = 1100;         // côté long des photos dans le PDF (poids raisonnable)

/* Options choisies dans le panneau de remise (cases cochées par défaut). */
function albOptions() {
  var o = ALB.opt || (ALB.opt = { couv: true, date: true, fin: true, livre: true });
  return o;
}
function albOptSet(cle, val) { albOptions()[cle] = !!val; }

function albMoisCle(p) { return String(p.prise_le || '').slice(0, 7); }
function albMoisLibelle(cle) {
  var a = cle.slice(0, 4), m = parseInt(cle.slice(5, 7), 10);
  return (ALBL_MOIS[m - 1] || '') + ' ' + a;
}
function albMoisDossier(cle) {
  var m = parseInt(cle.slice(5, 7), 10), nom = ALBL_MOIS[m - 1] || '';
  return cle + ' ' + nom.charAt(0).toUpperCase() + nom.slice(1).normalize('NFD').replace(/[̀-ͯ]/g, '');
}
/* Photos de l'enfant en ordre chronologique, regroupées par mois (mois vides absents). */
function albParMois(photos) {
  var tri = photos.slice().sort(function (a, b) {
    return String(a.prise_le).localeCompare(String(b.prise_le)) || String(a.ajoute_le).localeCompare(String(b.ajoute_le));
  });
  var mois = [], idx = {};
  tri.forEach(function (p) {
    var c = albMoisCle(p);
    if (!(c in idx)) { idx[c] = mois.length; mois.push({ cle: c, photos: [] }); }
    mois[idx[c]].photos.push(p);
  });
  return mois;
}

/* Récupère le fichier de chaque photo (une seule fois, réutilisé par le .zip et le PDF). */
async function albRecupererBlobs(ph, libelle) {
  await albUrls(ph.map(function (p) { return p.chemin; }));
  var blobs = {}, echec = 0;
  for (var i = 0; i < ph.length; i++) {
    showBanner(libelle + ' : ' + (i + 1) + ' / ' + ph.length + '…');
    try {
      var r = await fetch(albUrl(ph[i].chemin));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      blobs[ph[i].id] = await r.blob();
    } catch (err) { echec++; console.warn('[albRecupererBlobs]', err); }
  }
  return { blobs: blobs, echec: echec };
}

/* Photo recadrée au format de sa case (remplissage), réduite, date incrustée si demandé. */
function albRecadrer(blob, largeur, hauteur, dateTxt) {
  return new Promise(function (ok, ko) {
    var u = URL.createObjectURL(blob), img = new Image();
    img.onload = function () {
      try {
        var k = ALBL_PX / Math.max(largeur, hauteur);
        var cw = Math.round(largeur * k), ch = Math.round(hauteur * k);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        var g = c.getContext('2d');
        var s = Math.max(cw / img.width, ch / img.height), w = img.width * s, h = img.height * s;
        g.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
        if (dateTxt) {
          var fs = Math.round(3.4 * k); // 3,4 mm sur le papier, quelle que soit la case
          g.font = fs + 'px Helvetica, Arial, sans-serif';
          var tw = g.measureText(dateTxt).width, px = Math.round(fs * 0.6);
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(px, ch - fs * 1.9, tw + px * 1.6, fs * 1.5);
          g.fillStyle = '#fff'; g.textBaseline = 'middle';
          g.fillText(dateTxt, px * 1.8, ch - fs * 1.15);
        }
        URL.revokeObjectURL(u);
        ok(c.toDataURL('image/jpeg', 0.82));
      } catch (e) { URL.revokeObjectURL(u); ko(e); }
    };
    img.onerror = function () { URL.revokeObjectURL(u); ko(new Error('image illisible')); };
    img.src = u;
  });
}

/* Cases de la page selon le nombre de photos (marges : 15 mm, zone utile 180 x 230 mm). */
function albCases(n) {
  var X = 15, Y = 52, W = 180, H = 225, g = 4;
  var cases = [], i;
  if (n === 1) return [[X, Y, W, H]];
  if (n === 2) { var h2 = (H - g) / 2; return [[X, Y, W, h2], [X, Y + h2 + g, W, h2]]; }
  var w2 = (W - g) / 2;
  if (n === 3) { var hA = (H - g) * 0.58, hB = H - g - hA; return [[X, Y, W, hA], [X, Y + hA + g, w2, hB], [X + w2 + g, Y + hA + g, w2, hB]]; }
  var lignes = n <= 4 ? 2 : 3, hl = (H - g * (lignes - 1)) / lignes;
  for (i = 0; i < n; i++) cases.push([X + (i % 2) * (w2 + g), Y + Math.floor(i / 2) * (hl + g), w2, hl]);
  // dernière photo seule sur sa ligne (5 photos) : pleine largeur
  if (n === 5) cases[4] = [X, cases[4][1], W, hl];
  return cases;
}

async function albConstruireLivre(e, ph, blobs) {
  var o = albOptions();
  if (typeof kkLibs !== 'undefined') await kkLibs.pret();
  var JsPdf = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!JsPdf) throw new Error('module PDF non chargé');
  var doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var prenom = e.prenom || 'l’enfant';
  var creche = (cacheCreches.find(function (c) { return String(c.id) === String(ALB.creche); }) || {}).name || '';
  var dispo = ph.filter(function (p) { return blobs[p.id]; });
  var mois = albParMois(dispo);
  var nbGroupe = dispo.filter(function (p) { return albEnfantsDe(p.id).length > 1; }).length;
  var premier = mois.length ? albMoisLibelle(mois[0].cle) : '', dernier = mois.length ? albMoisLibelle(mois[mois.length - 1].cle) : '';
  var page = 0, fait = 0;

  if (o.couv) {
    page++;
    doc.setFillColor(61, 53, 128); doc.rect(0, 0, 210, 297, 'F');
    doc.setFillColor(244, 121, 32); doc.rect(0, 252, 210, 45, 'F');
    var seule = dispo.find(function (p) { return String(p.id) === String(ALB.couvId); }) ||
      dispo.find(function (p) { return albEnfantsDe(p.id).length === 1; }) || dispo[0];
    if (seule) {
      try { doc.addImage(await albRecadrer(blobs[seule.id], 100, 100, ''), 'JPEG', 55, 62, 100, 100); } catch (err) { console.warn('[albLivre couverture]', err); }
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
    doc.text('L’album de ' + prenom, 105, 190, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(14);
    doc.text('Des souvenirs, mois après mois', 105, 202, { align: 'center' });
    doc.setFontSize(12);
    if (premier) doc.text(premier === dernier ? premier : premier + ' à ' + dernier, 105, 270, { align: 'center' });
    if (creche) { doc.setFontSize(10); doc.text(creche, 105, 280, { align: 'center' }); }
  }

  for (var m = 0; m < mois.length; m++) {
    var lot = mois[m].photos, total = lot.length, debut = 0, suite = 0;
    while (debut < total) {
      // répartition équilibrée si le mois tient sur plusieurs pages
      var restant = total - debut, pages = Math.ceil(restant / ALBL_MAX), n = Math.ceil(restant / pages);
      var groupe = lot.slice(debut, debut + n);
      if (page > 0 || m > 0 || suite > 0) doc.addPage();
      page++;
      doc.setTextColor(61, 53, 128); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
      var titre = albMoisLibelle(mois[m].cle); titre = titre.charAt(0).toUpperCase() + titre.slice(1);
      doc.text(titre + (suite ? ' (suite)' : ''), 15, 28);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(130);
      doc.text(total + ' photo' + (total > 1 ? 's' : ''), 195, 28, { align: 'right' });
      doc.setDrawColor(244, 121, 32); doc.setLineWidth(0.9); doc.line(15, 33, 195, 33);
      var cases = albCases(groupe.length);
      for (var i = 0; i < groupe.length; i++) {
        var c = cases[i], p = groupe[i];
        try {
          var d = await albRecadrer(blobs[p.id], c[2], c[3], o.date ? albDateFr(p.prise_le) : '');
          doc.addImage(d, 'JPEG', c[0], c[1], c[2], c[3]);
        } catch (err) { console.warn('[albLivre photo]', err); }
        fait++;
        if (fait % 5 === 0) showBanner('Livre PDF : ' + fait + ' / ' + dispo.length + ' photos…');
      }
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(prenom, 15, 287); doc.text(String(page), 195, 287, { align: 'right' });
      debut += n; suite++;
    }
  }

  if (o.fin) {
    doc.addPage(); page++;
    doc.setFillColor(254, 240, 230); doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(61, 53, 128); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
    doc.text('Merci pour ces belles années', 105, 100, { align: 'center' });
    var stats = [[String(mois.length), 'mois racontés'], [String(dispo.length), 'photos'], [String(nbGroupe), 'avec les copains']];
    stats.forEach(function (s, k) {
      var x = 55 + k * 50;
      doc.setTextColor(244, 121, 32); doc.setFontSize(26); doc.text(s[0], x, 130, { align: 'center' });
      doc.setTextColor(120); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(s[1], x, 138, { align: 'center' });
      doc.setFont('helvetica', 'bold');
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(80);
    doc.text(doc.splitTextToSize('Toute l’équipe souhaite à ' + prenom + ' et à sa famille une très belle suite et plein d’aventures à venir.', 120), 105, 165, { align: 'center' });
  }
  return doc.output('blob');
}

/* Bouton « Livre PDF » : télécharge seulement le livre (aperçu avant la remise). */
async function albLivre() {
  var e = cacheEnfants.find(function (x) { return String(x.id) === String(ALB.enfant); });
  if (!e || ALB.occupe) return;
  var ph = albPhotosDe(e.id);
  if (!ph.length) return;
  ALB.occupe = true;
  try {
    var r = await albRecupererBlobs(ph, 'Livre PDF — récupération des photos');
    if (!Object.keys(r.blobs).length) throw new Error('aucune photo récupérée');
    var blob = await albConstruireLivre(e, ph, r.blobs);
    albTelecharger(blob, 'Album_' + albSlug(e) + '.pdf');
    showBanner(r.echec ? 'Livre PDF téléchargé, mais ' + r.echec + ' photo' + (r.echec > 1 ? 's' : '') + ' manquante' + (r.echec > 1 ? 's' : '') + '.' : 'Livre PDF téléchargé (' + ph.length + ' photos).', r.echec ? 'error' : 'success');
  } catch (err) {
    console.warn('[albLivre]', err);
    showBanner('Livre PDF impossible : ' + (err.message || err), 'error');
  }
  ALB.occupe = false;
}
function albSlug(e) { return albNom(e).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function albTelecharger(blob, nom) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
}

/* Options du livre : cases à cocher + photo de couverture (panneau de remise et panneau « Livre PDF »). */
function albOptionsHtml() { return '<div id="alb-livre-opt">' + albOptionsInterieur() + '</div>'; }
function albOptionsInterieur() {
  var o = albOptions();
  function c(cle, txt) { return '<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" ' + (o[cle] ? 'checked' : '') + ' onchange="albOptSet(\'' + cle + '\',this.checked)"> ' + txt + '</label>'; }
  var cp = ALB.couvId ? ALB.photos.find(function (p) { return String(p.id) === String(ALB.couvId); }) : null;
  var vignette = cp ? '<span class="alb-couv-v">' + albImg(cp, true) + '</span>' : '';
  return '<div style="background:var(--koala-light);border-radius:8px;padding:8px 10px;margin-bottom:10px"><div style="font-weight:700;font-size:12px;margin-bottom:4px">Livre de souvenirs (mois par mois)</div>' +
    '<div style="display:flex;gap:4px 14px;flex-wrap:wrap">' + c('livre', 'Joindre le livre PDF au .zip') + c('couv', 'Couverture') + c('date', 'Date sur chaque photo') + c('fin', 'Page de fin') + '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px">' + vignette +
    '<span>Photo de couverture : <b>' + (cp ? 'choisie' : 'automatique (photo de l’enfant seul·e)') + '</b></span>' +
    '<button class="btn-sm" type="button" onclick="albCouvChoisir()"><i class="ti ti-photo-star"></i> Choisir la photo</button></div></div>';
}
function albOptionsRafraichir() { var z = albById('alb-livre-opt'); if (z) z.innerHTML = albOptionsInterieur(); }

/* Panneau du bouton « Livre PDF » : options, choix de la couverture, téléchargement. */
function albPanneauLivre() {
  var z = albById('alb-remise');
  if (!z) return;
  z.innerHTML = '<div class="alb-remise"><div style="font-weight:700;margin-bottom:8px">Livre de souvenirs</div>' + albOptionsHtml() +
    '<button class="btn-primary" onclick="albLivre()"><i class="ti ti-book-download"></i> Télécharger le livre PDF</button></div>';
}

/* Choix de la photo de couverture parmi les photos de l'enfant. */
async function albCouvChoisir() {
  var ph = albPhotosDe(ALB.enfant);
  if (!ph.length) return;
  await albUrls(ph.map(function (p) { return p.chemin_mini; }));
  var m = albById('alb-couv-modal');
  if (m) m.remove();
  m = document.createElement('div'); m.id = 'alb-couv-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  m.onclick = function (ev) { if (ev.target === m) m.remove(); };
  var tri = ph.slice().sort(function (a, b) { return String(a.prise_le).localeCompare(String(b.prise_le)); });
  m.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:88vh;display:flex;flex-direction:column;padding:14px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><b style="font-size:15px;color:var(--koala)">Photo de couverture</b>' +
    '<button class="btn-sm" style="margin-left:auto" onclick="albCouvPoser(null)">Automatique</button>' +
    '<button class="btn-sm" onclick="albById(\'alb-couv-modal\').remove()"><i class="ti ti-x"></i></button></div>' +
    '<div style="flex:1 1 auto;min-height:0;overflow-y:auto;padding:4px"><div class="alb-gal" style="align-content:start">' + tri.map(function (p) {
      var cur = String(p.id) === String(ALB.couvId);
      return '<div class="alb-ph" style="' + (cur ? 'box-shadow:0 0 0 3px var(--orange)' : '') + '" onclick="albCouvPoser(\'' + p.id + '\')" role="button" tabindex="0">' + albImg(p, true) +
        (cur ? '<span style="position:absolute;right:5px;top:5px;background:var(--orange);color:#fff;border-radius:99px;font-size:11px;font-weight:700;padding:1px 7px">Couverture</span>' : '') +
        '<span class="alb-tag">' + albDateFr(p.prise_le) + '</span></div>';
    }).join('') + '</div></div></div>';
  document.body.appendChild(m);
}
function albCouvPoser(id) {
  ALB.couvId = id;
  var m = albById('alb-couv-modal'); if (m) m.remove();
  albOptionsRafraichir();
}
