/* Album photos — Demandes › Enfants & suivi › « Album photos ».
   Rassemble les photos de la crèche et les classe par enfant (tri manuel, plusieurs
   photos à la fois). Une photo de groupe est stockée une fois et apparaît dans le
   dossier de chaque enfant. Au départ de l'enfant : dossier .zip remis aux parents,
   puis suppression (aucune archive conservée). Pas de reconnaissance de visage.
   Tables et bucket : sql/album_photos.sql (à appliquer à la main).
   Droits : direction = toutes les crèches ; référent·e = sa crèche. */
var ALB = { creche: '', photos: [], liens: [], urls: {}, vue: 'enfants', enfant: null,
            sel: {}, cibles: {}, recents: [], filtre: '', occupe: false, charge: false, lb: null, zipPret: false, remis: false };
var ALB_BUCKET = 'album';
var ALB_MAX = 1600, ALB_MINI = 360;

function albEsc(s) { return escHtml(String(s == null ? '' : s)); }
function albById(id) { return document.getElementById(id); }
function albDateFr(iso) {
  var p = String(iso || '').slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
}
function albNom(e) { return ((e.prenom || '') + ' ' + (e.nom || '')).trim() || 'Sans nom'; }
function albEnfants() {
  return cacheEnfants.filter(function (e) { return String(e.creche_id) === String(ALB.creche) && !enfIsArchived(e); })
    .sort(function (a, b) { return albNom(a).localeCompare(albNom(b), 'fr'); });
}
function albEnfantsDe(photoId) {
  return ALB.liens.filter(function (l) { return l.photo_id === photoId; }).map(function (l) { return l.enfant_id; });
}
function albPhotosDe(enfantId) {
  var ids = {};
  ALB.liens.forEach(function (l) { if (String(l.enfant_id) === String(enfantId)) ids[l.photo_id] = 1; });
  return ALB.photos.filter(function (p) { return ids[p.id]; });
}
function albAClasser() {
  var classees = {};
  ALB.liens.forEach(function (l) { classees[l.photo_id] = 1; });
  return ALB.photos.filter(function (p) { return !classees[p.id]; });
}

/* ---------- Ouverture ---------- */
async function albInit() {
  var sel = albById('alb-creche');
  if (isDirection) {
    if (!ALB.creche || !cacheCreches.some(function (c) { return c.id === ALB.creche; })) ALB.creche = (cacheCreches[0] || {}).id || '';
    if (sel) {
      sel.innerHTML = cacheCreches.map(function (c) { return '<option value="' + c.id + '">' + albEsc(c.name) + '</option>'; }).join('');
      sel.value = ALB.creche; sel.style.display = '';
    }
  } else {
    ALB.creche = (currentProfile && currentProfile.creche_id) || '';
    if (sel) sel.style.display = 'none';
  }
  ALB.vue = 'enfants'; ALB.enfant = null; ALB.sel = {}; ALB.cibles = {}; ALB.filtre = '';
  await albCharger();
}
function albChangerCreche() {
  var sel = albById('alb-creche');
  ALB.creche = sel ? sel.value : ALB.creche;
  ALB.vue = 'enfants'; ALB.enfant = null; ALB.sel = {}; ALB.cibles = {};
  albCharger();
}

async function albCharger() {
  var z = albById('alb-contenu');
  if (!z) return;
  if (!ALB.creche) { z.innerHTML = '<div class="empty-state"><i class="ti ti-building-off"></i><p>Aucune crèche associée.</p></div>'; return; }
  z.innerHTML = '<div style="padding:24px;color:var(--muted)">Chargement…</div>';
  try {
    var photos = [], from = 0;
    for (;;) {
      var r = await sb.from('album_photos').select('*').eq('creche_id', ALB.creche)
        .order('prise_le', { ascending: false }).order('ajoute_le', { ascending: false }).range(from, from + 999);
      if (r.error) throw r.error;
      photos = photos.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
      from += 1000;
    }
    var liens = [];
    for (var i = 0; i < photos.length; i += 150) {
      var ids = photos.slice(i, i + 150).map(function (p) { return p.id; });
      var l = await sb.from('album_photos_enfants').select('photo_id,enfant_id').in('photo_id', ids);
      if (l.error) throw l.error;
      liens = liens.concat(l.data || []);
    }
    ALB.photos = photos; ALB.liens = liens; ALB.charge = true;
  } catch (e) {
    console.warn('[albCharger]', e);
    z.innerHTML = '<div style="padding:24px;color:var(--red)">Chargement impossible. Vérifiez votre connexion (ou que le script sql/album_photos.sql a été appliqué).</div>';
    return;
  }
  if (typeof albvCharger === 'function') await albvCharger();
  albRender();
}

/* ---------- Liens signés (miniatures et photos) ---------- */
async function albUrls(chemins) {
  var now = Date.now(), manque = chemins.filter(function (c) { return !ALB.urls[c] || ALB.urls[c].exp < now; });
  for (var i = 0; i < manque.length; i += 100) {
    var lot = manque.slice(i, i + 100);
    var r = await sb.storage.from(ALB_BUCKET).createSignedUrls(lot, 3600);
    if (r.error) { console.warn('[albUrls]', r.error.message); continue; }
    (r.data || []).forEach(function (d) { if (d.signedUrl) ALB.urls[d.path] = { u: d.signedUrl, exp: now + 3300 * 1000 }; });
  }
}
function albUrl(chemin) { var o = ALB.urls[chemin]; return o ? o.u : ''; }
function albImg(p, mini) {
  var u = albUrl(mini ? p.chemin_mini : p.chemin);
  return u ? '<img src="' + u + '" alt="" loading="lazy" decoding="async">' : '<span class="alb-vide"><i class="ti ti-photo"></i></span>';
}

/* ---------- Journal ---------- */
function albJournal(action, enfantId, libelle, nb) {
  try {
    Promise.resolve(sb.from('album_journal').insert({ creche_id: ALB.creche, action: action, enfant_id: enfantId || null, libelle: libelle || null, nb: nb == null ? null : nb }))
      .then(function (r) { if (r && r.error) console.warn('[journal album]', r.error.message); }, function (e) { console.warn('[journal album]', e); });
  } catch (e) { console.warn('[journal album]', e); }
}

/* ---------- Affichage ---------- */
function albRender() {
  var z = albById('alb-contenu');
  if (!z) return;
  var nb = albAClasser().length;
  var bt = albById('alb-badge-aclasser');
  if (bt) { bt.textContent = nb; bt.style.display = nb ? '' : 'none'; }
  var tabE = albById('alb-tab-enfants'), tabC = albById('alb-tab-aclasser');
  if (tabE) tabE.classList.toggle('active', ALB.vue !== 'aclasser' && ALB.vue !== 'visage' && ALB.vue !== 'refs');
  if (tabC) tabC.classList.toggle('active', ALB.vue === 'aclasser');
  var tabV = albById('alb-tab-visage'), tabR = albById('alb-tab-refs');
  if (tabV) tabV.classList.toggle('active', ALB.vue === 'visage');
  if (tabR) tabR.classList.toggle('active', ALB.vue === 'refs');
  if (ALB.vue === 'visage' && typeof albvRenderTri === 'function') albvRenderTri(z);
  else if (ALB.vue === 'refs' && typeof albvRenderRefs === 'function') albvRenderRefs(z);
  else if (ALB.vue === 'aclasser') albRenderAClasser(z);
  else if (ALB.vue === 'enfant') albRenderEnfant(z);
  else albRenderEnfants(z);
}
function albVue(v) { ALB.vue = v; ALB.enfant = null; ALB.sel = {}; ALB.cibles = {}; ALB.filtre = ''; albRender(); }

async function albRenderEnfants(z) {
  var enfants = albEnfants();
  if (!enfants.length) { z.innerHTML = '<div class="empty-state"><i class="ti ti-mood-kid"></i><p>Aucun enfant actif dans cette crèche.</p></div>'; return; }
  var cartes = enfants.map(function (e) {
    var ph = albPhotosDe(e.id);
    return { e: e, n: ph.length, couv: ph[0] || null };
  });
  await albUrls(cartes.filter(function (c) { return c.couv; }).map(function (c) { return c.couv.chemin_mini; }));
  var total = ALB.photos.length, nb = albAClasser().length;
  var h = '<div class="alb-stats"><span class="alb-stat"><b>' + total + '</b> photos</span><span class="alb-stat"><b>' + (total - nb) + '</b> classées</span>' +
    (nb ? '<button class="alb-stat alb-stat-warn" onclick="albVue(\'aclasser\')"><b>' + nb + '</b> à classer →</button>' : '<span class="alb-stat"><b>0</b> à classer</span>') + '</div>';
  if (!total) h += '<div class="alb-vide-msg"><i class="ti ti-photo-plus"></i><p>Aucune photo pour l’instant.<br>Utilisez « Ajouter des photos », puis classez-les par enfant.</p></div>';
  h += '<div class="alb-kids">' + cartes.map(function (c) {
    return '<button class="alb-kid" onclick="albOuvrirEnfant(\'' + c.e.id + '\')"><div class="alb-ph">' + (c.couv ? albImg(c.couv, true) : '<span class="alb-vide"><i class="ti ti-mood-kid"></i></span>') + '</div>' +
      '<div class="alb-nm">' + albEsc(albNom(c.e)) + '</div><div class="alb-ct">' + c.n + ' photo' + (c.n > 1 ? 's' : '') + '</div></button>';
  }).join('') + '</div>';
  z.innerHTML = h;
}

/* --- À classer : sélection multiple puis un clic sur l'enfant --- */
async function albRenderAClasser(z) {
  var liste = albAClasser();
  if (!liste.length) { z.innerHTML = '<div class="alb-vide-msg"><i class="ti ti-circle-check"></i><p>Toutes les photos sont classées.</p></div>'; return; }
  await albUrls(liste.map(function (p) { return p.chemin_mini; }));
  var nbSel = liste.filter(function (p) { return ALB.sel[p.id]; }).length;
  var nbCib = Object.keys(ALB.cibles).length;
  var f = (ALB.filtre || '').toLowerCase();
  var enfants = albEnfants();
  enfants.sort(function (a, b) {
    var ra = ALB.recents.indexOf(a.id), rb = ALB.recents.indexOf(b.id);
    if (ra < 0 && rb < 0) return 0;
    if (ra < 0) return 1; if (rb < 0) return -1; return ra - rb;
  });
  if (f) enfants = enfants.filter(function (e) { return albNom(e).toLowerCase().indexOf(f) >= 0; });
  var h = '<div class="alb-aide"><i class="ti ti-hand-click"></i> Touchez les photos à classer, puis touchez <b>tous les enfants</b> qui y figurent (une photo de groupe peut aller dans plusieurs albums) et validez avec « Classer ». Les derniers enfants choisis passent en tête.</div>' +
    '<div class="alb-barre"><button class="btn-sm" onclick="albToutSel(' + (nbSel === liste.length ? 'false' : 'true') + ')">' + (nbSel === liste.length ? 'Tout désélectionner' : 'Tout sélectionner') + '</button>' +
    '<span class="alb-ct">' + nbSel + ' sélectionnée' + (nbSel > 1 ? 's' : '') + ' sur ' + liste.length + '</span>' +
    '<button class="btn-sm" style="margin-left:auto;color:var(--red);border-color:var(--red)" ' + (nbSel ? '' : 'disabled') + ' onclick="albSupprimerSel()"><i class="ti ti-trash"></i> Supprimer</button></div>' +
    '<div class="alb-gal">' + liste.map(function (p) {
      var s = ALB.sel[p.id] ? ' sel' : '';
      return '<div class="alb-ph alb-pick' + s + '" onclick="albBasculer(\'' + p.id + '\')" role="button" tabindex="0" aria-pressed="' + (!!ALB.sel[p.id]) + '">' + albImg(p, true) +
        '<span class="alb-coche"><i class="ti ti-check"></i></span>' +
        '<button class="alb-zoom" title="Agrandir" onclick="event.stopPropagation();albLightbox(\'aclasser\',\'' + p.id + '\')"><i class="ti ti-zoom-in"></i></button>' +
        (typeof albvBadge === 'function' ? albvBadge(p) : '') + '<span class="alb-tag">' + albDateFr(p.prise_le) + '</span></div>';
    }).join('') + '</div>' +
    '<div class="alb-chips-wrap"><div class="alb-chips-top"><b>' + (nbSel ? 'Classer les ' + nbSel + ' photo' + (nbSel > 1 ? 's' : '') + ' dans :' : 'Sélectionnez des photos') + '</b>' +
    '<button class="btn-sm" style="background:var(--koala);color:#fff;border-color:var(--koala)" ' + (nbSel && nbCib ? '' : 'disabled') + ' onclick="albClasserSel()"><i class="ti ti-check"></i> Classer' + (nbCib ? ' dans ' + nbCib + ' album' + (nbCib > 1 ? 's' : '') : '') + '</button>' +
    '<input class="finput" id="alb-filtre" placeholder="Chercher un enfant…" value="' + albEsc(ALB.filtre) + '" oninput="albFiltrer(this.value)" style="width:170px;font-size:12px;padding:4px 8px"></div>' +
    '<div class="alb-chips">' + (enfants.map(function (e) {
      var on = ALB.cibles[e.id];
      return '<button class="alb-chip' + (on ? ' on' : '') + '" aria-pressed="' + (!!on) + '" ' + (nbSel ? '' : 'disabled') + ' onclick="albBasculerCible(\'' + e.id + '\')">' + (on ? '✓ ' : '') + albEsc(albNom(e)) + '</button>';
    }).join('') || '<span class="alb-ct">Aucun enfant trouvé.</span>') + '</div></div>';
  z.innerHTML = h;
  if (f) { var inp = albById('alb-filtre'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
}
function albFiltrer(v) { ALB.filtre = v; albRender(); }
function albBasculer(id) { if (ALB.sel[id]) delete ALB.sel[id]; else ALB.sel[id] = 1; albRender(); }
function albToutSel(oui) { ALB.sel = {}; if (oui) albAClasser().forEach(function (p) { ALB.sel[p.id] = 1; }); albRender(); }

function albBasculerCible(id) { if (ALB.cibles[id]) delete ALB.cibles[id]; else ALB.cibles[id] = 1; albRender(); }

/* Une photo peut aller dans plusieurs albums : un lien (photo, enfant) par enfant coché. */
async function albClasserSel() {
  var ids = Object.keys(ALB.sel), enfantIds = Object.keys(ALB.cibles);
  if (!ids.length || !enfantIds.length || ALB.occupe) return;
  ALB.occupe = true;
  var rows = [];
  enfantIds.forEach(function (eid) { ids.forEach(function (id) { rows.push({ photo_id: id, enfant_id: eid }); }); });
  var r = await sb.from('album_photos_enfants').upsert(rows, { onConflict: 'photo_id,enfant_id', ignoreDuplicates: true });
  ALB.occupe = false;
  if (r.error) { showBanner('Classement impossible : ' + r.error.message, 'error'); return; }
  rows.forEach(function (x) { ALB.liens.push(x); });
  var noms = [];
  enfantIds.forEach(function (eid) {
    ALB.recents = [eid].concat(ALB.recents.filter(function (x) { return x !== eid; })).slice(0, 8);
    var e = cacheEnfants.find(function (x) { return String(x.id) === String(eid); });
    if (e) noms.push(e.prenom || albNom(e));
    albJournal('classement', eid, e ? albNom(e) : null, ids.length);
  });
  var idsClasses = ids.slice();
  ALB.sel = {}; ALB.cibles = {};
  showBanner(ids.length + ' photo' + (ids.length > 1 ? 's' : '') + ' classée' + (ids.length > 1 ? 's' : '') + ' dans ' + (enfantIds.length > 1 ? enfantIds.length + ' albums (' : 'l’album de ') + albEsc(noms.join(', ')) + (enfantIds.length > 1 ? ')' : '') + '.');
  albRender();
  if (enfantIds.length === 1 && typeof albvProposerRef === 'function') albvProposerRef(enfantIds[0], idsClasses);
}

async function albSupprimerSel() {
  var ids = Object.keys(ALB.sel);
  if (!ids.length) return;
  if (!confirm('Supprimer définitivement ' + ids.length + ' photo' + (ids.length > 1 ? 's' : '') + ' ?\n\nCette action est irréversible.')) return;
  await albSupprimerPhotos(ids);
  ALB.sel = {};
  albRender();
}
async function albSupprimerPhotos(ids) {
  var ph = ALB.photos.filter(function (p) { return ids.indexOf(p.id) >= 0; });
  if (!ph.length) return true;
  var chemins = [];
  ph.forEach(function (p) { chemins.push(p.chemin, p.chemin_mini); });
  var s = await sb.storage.from(ALB_BUCKET).remove(chemins);
  if (s.error) { showBanner('Suppression des fichiers impossible : ' + s.error.message, 'error'); return false; }
  var d = await sb.from('album_photos').delete().in('id', ph.map(function (p) { return p.id; }));
  if (d.error) { showBanner('Suppression impossible : ' + d.error.message, 'error'); return false; }
  var gone = {}; ph.forEach(function (p) { gone[p.id] = 1; });
  ALB.photos = ALB.photos.filter(function (p) { return !gone[p.id]; });
  ALB.liens = ALB.liens.filter(function (l) { return !gone[l.photo_id]; });
  albJournal('suppression', null, null, ph.length);
  return true;
}

/* --- Album d'un enfant --- */
function albOuvrirEnfant(id) { ALB.enfant = id; ALB.vue = 'enfant'; ALB.zipPret = false; ALB.remis = false; albRender(); }
async function albRenderEnfant(z) {
  var e = cacheEnfants.find(function (x) { return String(x.id) === String(ALB.enfant); });
  if (!e) { albVue('enfants'); return; }
  var ph = albPhotosDe(e.id);
  await albUrls(ph.map(function (p) { return p.chemin_mini; }));
  var h = '<div class="alb-barre"><button class="btn-sm" onclick="albVue(\'enfants\')"><i class="ti ti-arrow-left"></i> Tous les enfants</button>' +
    '<b style="font-size:16px;color:var(--koala)">Album de ' + albEsc(albNom(e)) + '</b><span class="alb-ct">' + ph.length + ' photo' + (ph.length > 1 ? 's' : '') + '</span>' +
    '<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn-sm" ' + (ph.length ? '' : 'disabled') + ' onclick="albZip(false)"><i class="ti ti-file-zip"></i> Télécharger (.zip)</button>' +
    '<button class="btn-sm" onclick="albPanneauRemise()"><i class="ti ti-gift"></i> Départ : remise aux parents</button></span></div>' +
    '<div id="alb-remise"></div><div id="alb-droit"></div>';
  h += ph.length ? '<div class="alb-gal">' + ph.map(function (p) {
    return '<div class="alb-ph" onclick="albLightbox(\'enfant\',\'' + p.id + '\')" role="button" tabindex="0">' + albImg(p, true) +
      (albEnfantsDe(p.id).length > 1 ? '<span class="alb-groupe" title="Photo de groupe"><i class="ti ti-users"></i></span>' : '') +
      '<span class="alb-tag">' + albDateFr(p.prise_le) + '</span></div>';
  }).join('') + '</div>' : '<div class="alb-vide-msg"><i class="ti ti-photo-off"></i><p>Aucune photo dans cet album.</p></div>';
  z.innerHTML = h;
  albDroitCharger(e.id);
}

/* --- Droit à l'image : import du document papier rempli par les parents ---
   Même table et même bucket que le dossier administratif de la fiche enfant
   (enfants_documents_admin, bucket documents-admin), clé de pièce 'droit_image'. */
var ALB_DROIT_KEY = 'droit_image', ALB_DROIT_BUCKET = 'documents-admin';
async function albDroitCharger(enfantId) {
  var z = albById('alb-droit');
  if (!z) return;
  z.innerHTML = '<div class="alb-ct" style="margin:8px 0">Droit à l’image : chargement…</div>';
  var r = await sb.from('enfants_documents_admin').select('*').eq('enfant_id', enfantId).eq('piece_key', ALB_DROIT_KEY).order('created_at', { ascending: false });
  if (String(ALB.enfant) !== String(enfantId)) return;
  if (r.error) { z.innerHTML = '<div class="alb-ct" style="margin:8px 0;color:var(--red)">Droit à l’image : lecture impossible.</div>'; return; }
  ALB.droits = r.data || [];
  albDroitRender();
}
function albDroitRender() {
  var z = albById('alb-droit');
  if (!z) return;
  var d = ALB.droits || [];
  var h = '<div class="alb-remise" style="margin:10px 0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b>Droit à l’image</b>' +
    (d.length ? '<span style="color:var(--green);font-weight:700;font-size:12px">✅ Reçu le ' + albDateFr(d[0].created_at) + '</span>'
              : '<span style="color:var(--orange);font-weight:700;font-size:12px">⚠ Document non importé</span>') +
    '<button class="btn-sm" style="margin-left:auto" onclick="albDroitChoisir()"><i class="ti ti-upload"></i> Importer le document signé</button></div>' +
    d.map(function (f) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><i class="ti ti-paperclip" style="color:var(--koala)"></i>' +
        '<button type="button" onclick="albDroitOuvrir(\'' + f.id + '\')" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;font-size:12px;color:var(--koala-dark);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + albEsc(f.filename || 'Document') + '</button>' +
        '<span class="alb-ct">' + albDateFr(f.created_at) + '</span>' +
        '<button onclick="albDroitSupprimer(\'' + f.id + '\')" title="Supprimer" style="border:none;background:none;color:var(--red);cursor:pointer"><i class="ti ti-trash"></i></button></div>';
    }).join('') +
    '<input type="file" id="alb-droit-fichier" accept="image/*,application/pdf" multiple style="display:none" onchange="albDroitAjouter(this)"></div>';
  z.innerHTML = h;
}
function albDroitChoisir() { var i = albById('alb-droit-fichier'); if (i) i.click(); }
async function albDroitAjouter(input) {
  var fichiers = Array.prototype.slice.call(input.files || []);
  input.value = '';
  var eid = ALB.enfant;
  if (!fichiers.length || !eid) return;
  var ok = 0;
  for (var i = 0; i < fichiers.length; i++) {
    var f = fichiers[i];
    showBanner('Import du document : ' + (i + 1) + ' / ' + fichiers.length + '…');
    try {
      var ext = (f.name.split('.').pop() || 'bin').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'bin';
      var path = eid + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
      var u = await sb.storage.from(ALB_DROIT_BUCKET).upload(path, f);
      if (u.error) throw u.error;
      var r = await sb.from('enfants_documents_admin').insert({ enfant_id: eid, bucket: ALB_DROIT_BUCKET, path: path, filename: f.name, piece_key: ALB_DROIT_KEY }).select().single();
      if (r.error) { await sb.storage.from(ALB_DROIT_BUCKET).remove([path]); throw r.error; }
      ALB.droits = [r.data].concat(ALB.droits || []); ok++;
    } catch (err) { console.warn('[albDroitAjouter]', f.name, err); showBanner('Import impossible : ' + (err.message || err), 'error'); return albDroitRender(); }
  }
  albDroitRender();
  showBanner(ok + ' document' + (ok > 1 ? 's' : '') + ' importé' + (ok > 1 ? 's' : '') + ' ✅', 'success');
}
async function albDroitOuvrir(id) {
  var d = (ALB.droits || []).find(function (x) { return String(x.id) === String(id); });
  if (!d) return;
  if (typeof kkJournaliserAcces === 'function') kkJournaliserAcces(d.bucket || ALB_DROIT_BUCKET, d.path, { entite_type: 'enfant', entite_id: d.enfant_id, libelle: d.filename });
  var r = await sb.storage.from(d.bucket || ALB_DROIT_BUCKET).createSignedUrl(d.path, 300);
  if (r.error || !r.data) { alert('Ouverture impossible : ' + ((r.error && r.error.message) || 'erreur inconnue')); return; }
  window.open(r.data.signedUrl, '_blank', 'noopener');
}
async function albDroitSupprimer(id) {
  if (!confirm('Supprimer ce document ?')) return;
  var d = (ALB.droits || []).find(function (x) { return String(x.id) === String(id); });
  if (!d) return;
  var r = await sb.from('enfants_documents_admin').delete().eq('id', id);
  if (r.error) { alert('Erreur : ' + r.error.message); return; }
  await sb.storage.from(d.bucket || ALB_DROIT_BUCKET).remove([d.path]);
  ALB.droits = ALB.droits.filter(function (x) { return String(x.id) !== String(id); });
  albDroitRender();
}

/* --- Remise aux parents (départ définitif) --- */
function albPanneauRemise() {
  var e = cacheEnfants.find(function (x) { return String(x.id) === String(ALB.enfant); });
  var z = albById('alb-remise');
  if (!e || !z) return;
  var ph = albPhotosDe(e.id);
  var seules = ph.filter(function (p) { return albEnfantsDe(p.id).length === 1; }).length;
  z.innerHTML = '<div class="alb-remise"><div style="font-weight:700;margin-bottom:4px">Remise des photos aux parents</div>' +
    '<div class="alb-ct" style="margin-bottom:10px">Les photos sont données aux parents, puis supprimées. Rien n’est archivé.</div>' +
    '<label class="alb-etape"><input type="checkbox" id="alb-e1" disabled ' + (ALB.zipPret ? 'checked' : '') + '><span><b>1. Préparer la remise</b> : dossier .zip de ' + ph.length + ' photo' + (ph.length > 1 ? 's' : '') + ' à copier sur une clé USB ou un disque chiffré.' +
    ' <button class="btn-sm" style="display:inline-flex;margin-left:6px" onclick="event.preventDefault();albZip(true)"><i class="ti ti-file-zip"></i> Préparer le .zip</button></span></label>' +
    '<label class="alb-etape"><input type="checkbox" id="alb-e2" ' + (ALB.remis ? 'checked' : '') + ' ' + (ALB.zipPret ? '' : 'disabled') + ' onchange="ALB.remis=this.checked;albMajRemise()"><span><b>2. Remise confirmée</b> : les parents ont bien reçu les photos.</span></label>' +
    '<div class="alb-ct" style="margin:6px 0 10px">Suppression : ' + seules + ' photo' + (seules > 1 ? 's' : '') + ' où ' + albEsc(e.prenom || 'l’enfant') + ' est seul·e ' + (seules > 1 ? 'seront' : 'sera') + ' effacée' + (seules > 1 ? 's' : '') + '. Les photos de groupe restent dans l’album des autres enfants : seul le lien avec cet enfant est retiré.</div>' +
    '<button class="btn-primary" id="alb-e3" disabled onclick="albSupprimerEnfant()"><i class="ti ti-trash"></i> 3. Supprimer les photos de ' + albEsc(e.prenom || 'cet enfant') + '</button></div>';
  albMajRemise();
}
function albMajRemise() { var b = albById('alb-e3'); if (b) b.disabled = !(ALB.zipPret && ALB.remis); }

async function albZip(depuisRemise) {
  var e = cacheEnfants.find(function (x) { return String(x.id) === String(ALB.enfant); });
  if (!e || ALB.occupe) return;
  var ph = albPhotosDe(e.id);
  if (!ph.length) return;
  if (typeof JSZip === 'undefined') { showBanner('Le module .zip n’est pas chargé. Rechargez la page.', 'error'); return; }
  ALB.occupe = true;
  var zip = new JSZip(), n = 0, echec = 0;
  try {
    await albUrls(ph.map(function (p) { return p.chemin; }));
    for (var i = 0; i < ph.length; i++) {
      showBanner('Préparation du .zip : ' + (i + 1) + ' / ' + ph.length + '…');
      try {
        var resp = await fetch(albUrl(ph[i].chemin));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        zip.file(albDateFr(ph[i].prise_le).replace(/\//g, '-') + '_' + String(i + 1).padStart(3, '0') + '.jpg', await resp.blob());
        n++;
      } catch (err) { echec++; console.warn('[albZip]', err); }
    }
    if (!n) throw new Error('aucune photo récupérée');
    var blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    var slug = albNom(e).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'Photos_' + slug + '.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    if (echec) showBanner('Dossier .zip téléchargé, mais ' + echec + ' photo' + (echec > 1 ? 's' : '') + ' n’ont pas pu être ajoutée' + (echec > 1 ? 's' : '') + '. Ne supprimez rien avant d’avoir réessayé.', 'error');
    else { showBanner('Dossier .zip téléchargé (' + n + ' photos).'); if (depuisRemise) ALB.zipPret = true; }
  } catch (err) {
    showBanner('Préparation du .zip impossible : ' + (err.message || err), 'error');
  }
  ALB.occupe = false;
  if (depuisRemise) albPanneauRemise();
}

async function albSupprimerEnfant() {
  var e = cacheEnfants.find(function (x) { return String(x.id) === String(ALB.enfant); });
  if (!e || !ALB.zipPret || !ALB.remis || ALB.occupe) return;
  var ph = albPhotosDe(e.id);
  if (!confirm('Supprimer les photos de ' + albNom(e) + ' ?\n\nElles ont été remises aux parents. Cette action est irréversible.')) return;
  ALB.occupe = true;
  var seules = ph.filter(function (p) { return albEnfantsDe(p.id).length === 1; }).map(function (p) { return p.id; });
  var l = await sb.from('album_photos_enfants').delete().eq('enfant_id', e.id).in('photo_id', ph.map(function (p) { return p.id; }));
  if (l.error) { ALB.occupe = false; showBanner('Suppression impossible : ' + l.error.message, 'error'); return; }
  ALB.liens = ALB.liens.filter(function (x) { return String(x.enfant_id) !== String(e.id); });
  var ok = await albSupprimerPhotos(seules);
  if (typeof albvPurgerEnfant === 'function') await albvPurgerEnfant(e.id);
  albJournal('remise', e.id, albNom(e), ph.length);
  ALB.occupe = false;
  if (ok) showBanner('Photos de ' + albEsc(albNom(e)) + ' supprimées après remise aux parents.');
  ALB.zipPret = false; ALB.remis = false;
  albRender();
}

/* --- Agrandissement --- */
async function albLightbox(source, id) {
  var liste = source === 'enfant' ? albPhotosDe(ALB.enfant) : albAClasser();
  var i = liste.findIndex(function (p) { return p.id === id; });
  if (i < 0) return;
  ALB.lb = { liste: liste, i: i, source: source };
  await albLbMontrer();
}
async function albLbMontrer() {
  var lb = ALB.lb; if (!lb) return;
  var p = lb.liste[lb.i];
  await albUrls([p.chemin]);
  var el = albById('alb-lb');
  if (!el) { el = document.createElement('div'); el.id = 'alb-lb'; el.className = 'alb-lb'; document.body.appendChild(el); }
  var noms = albEnfantsDe(p.id).map(function (eid) {
    var e = cacheEnfants.find(function (x) { return String(x.id) === String(eid); }); return e ? albEsc(e.prenom || albNom(e)) : '';
  }).filter(Boolean).join(', ');
  el.innerHTML = '<div class="alb-lb-box"><div class="alb-lb-img"><img src="' + albUrl(p.chemin) + '" alt="Photo du ' + albDateFr(p.prise_le) + '"></div>' +
    '<div class="alb-barre" style="margin:8px 0 0"><button class="btn-sm" onclick="albLbNav(-1)"' + (lb.i ? '' : ' disabled') + '><i class="ti ti-chevron-left"></i></button>' +
    '<span class="alb-ct">' + (lb.i + 1) + ' / ' + lb.liste.length + ' · ' + albDateFr(p.prise_le) + (noms ? ' · ' + noms : '') + '</span>' +
    '<button class="btn-sm" onclick="albLbNav(1)"' + (lb.i < lb.liste.length - 1 ? '' : ' disabled') + '><i class="ti ti-chevron-right"></i></button>' +
    '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' +
    (lb.source === 'enfant' ? '<button class="btn-sm" onclick="albRetirer()"><i class="ti ti-user-minus"></i> Retirer de cet album</button>' : '') +
    '<button class="btn-sm" style="color:var(--red);border-color:var(--red)" onclick="albLbSupprimer()"><i class="ti ti-trash"></i> Supprimer</button>' +
    '<button class="btn-sm" onclick="albLbFermer()">Fermer</button></span></div></div>';
  el.style.display = 'flex';
}
function albLbNav(d) { var lb = ALB.lb; if (!lb) return; lb.i = Math.max(0, Math.min(lb.liste.length - 1, lb.i + d)); albLbMontrer(); }
function albLbFermer() { var el = albById('alb-lb'); if (el) el.style.display = 'none'; ALB.lb = null; }
async function albRetirer() {
  var lb = ALB.lb; if (!lb) return;
  var p = lb.liste[lb.i];
  var r = await sb.from('album_photos_enfants').delete().eq('photo_id', p.id).eq('enfant_id', ALB.enfant);
  if (r.error) { showBanner('Retrait impossible : ' + r.error.message, 'error'); return; }
  ALB.liens = ALB.liens.filter(function (l) { return !(l.photo_id === p.id && String(l.enfant_id) === String(ALB.enfant)); });
  albJournal('retrait', ALB.enfant, null, 1);
  showBanner('Photo retirée de cet album.');
  albLbFermer(); albRender();
}
async function albLbSupprimer() {
  var lb = ALB.lb; if (!lb) return;
  var p = lb.liste[lb.i];
  if (!confirm('Supprimer définitivement cette photo ?\n\nElle disparaît aussi des albums des autres enfants qui y figurent.')) return;
  if (await albSupprimerPhotos([p.id])) { albLbFermer(); albRender(); }
}
document.addEventListener('keydown', function (ev) {
  if (!ALB.lb) return;
  if (ev.key === 'Escape') albLbFermer();
  else if (ev.key === 'ArrowLeft') albLbNav(-1);
  else if (ev.key === 'ArrowRight') albLbNav(1);
});

/* ---------- Ajout de photos (réduites dans le navigateur) ---------- */
function albChoisir() { var i = albById('alb-fichiers'); if (i) i.click(); }
async function albRedimensionner(fichier, max) {
  var bmp = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  var k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return await new Promise(function (ok, ko) { c.toBlob(function (b) { b ? ok(b) : ko(new Error('conversion impossible')); }, 'image/jpeg', 0.82); });
}
async function albEmpreinte(fichier) {
  try {
    if (!(window.crypto && crypto.subtle)) return null;
    var buf = await fichier.arrayBuffer();
    var h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    return Array.prototype.map.call(h, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (e) { return null; }
}
async function albAjouter(input) {
  var fichiers = Array.prototype.slice.call(input.files || []).filter(function (f) { return /^image\//.test(f.type); });
  input.value = '';
  if (!fichiers.length || ALB.occupe || !ALB.creche) return;
  ALB.occupe = true;
  var ok = 0, echec = 0, ignores = 0;
  /* Doublons : empreinte SHA-256 du fichier d'origine, comparée aux photos de la crèche et au lot en cours. */
  var empreintes = [], connues = {};
  ALB.photos.forEach(function (p) { if (p.empreinte) connues[p.empreinte] = 1; });
  showBanner('Recherche des doublons…');
  for (var h = 0; h < fichiers.length; h++) empreintes.push(await albEmpreinte(fichiers[h]));
  var vus = {}, doublons = 0;
  empreintes.forEach(function (e) { if (e && (connues[e] || vus[e])) doublons++; if (e) vus[e] = 1; });
  var garderDoublons = false;
  if (doublons) {
    garderDoublons = !confirm(doublons + ' photo' + (doublons > 1 ? 's' : '') + ' sur ' + fichiers.length + (doublons > 1 ? ' sont déjà dans l’album (ou en double dans votre sélection)' : ' est déjà dans l’album (ou en double dans votre sélection)') + '.\n\nOK : ignorer les doublons.\nAnnuler : les ajouter quand même.');
  }
  var dejaAjoutes = {};
  for (var i = 0; i < fichiers.length; i++) {
    var emp = empreintes[i];
    if (!garderDoublons && emp && (connues[emp] || dejaAjoutes[emp])) { ignores++; continue; }
    showBanner('Ajout des photos : ' + (i + 1) + ' / ' + fichiers.length + '…');
    var f = fichiers[i], id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
    try {
      if (!id) throw new Error('navigateur trop ancien');
      var grand = await albRedimensionner(f, ALB_MAX), mini = await albRedimensionner(f, ALB_MINI);
      var chemin = ALB.creche + '/' + id + '.jpg', cmini = ALB.creche + '/' + id + '_mini.jpg';
      var u1 = await sb.storage.from(ALB_BUCKET).upload(chemin, grand, { contentType: 'image/jpeg', upsert: false });
      if (u1.error) throw u1.error;
      var u2 = await sb.storage.from(ALB_BUCKET).upload(cmini, mini, { contentType: 'image/jpeg', upsert: false });
      if (u2.error) { await sb.storage.from(ALB_BUCKET).remove([chemin]); throw u2.error; }
      var d = new Date(f.lastModified || Date.now());
      var jour = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var ligne = { id: id, creche_id: ALB.creche, chemin: chemin, chemin_mini: cmini, prise_le: jour, empreinte: emp };
      var r = await sb.from('album_photos').insert(ligne).select().single();
      if (r.error && /empreinte/.test(r.error.message || '')) { /* script SQL pas encore appliqué : on ajoute sans empreinte */
        delete ligne.empreinte; emp = null;
        r = await sb.from('album_photos').insert(ligne).select().single();
      }
      if (r.error) { await sb.storage.from(ALB_BUCKET).remove([chemin, cmini]); throw r.error; }
      ALB.photos.unshift(r.data); ok++;
      if (emp) dejaAjoutes[emp] = 1;
    } catch (err) { echec++; console.warn('[albAjouter]', f.name, err); }
  }
  ALB.occupe = false;
  if (ok) albJournal('ajout', null, null, ok);
  showBanner(ok + ' photo' + (ok > 1 ? 's' : '') + ' ajoutée' + (ok > 1 ? 's' : '') + (ignores ? ' · ' + ignores + ' doublon' + (ignores > 1 ? 's' : '') + ' ignoré' + (ignores > 1 ? 's' : '') : '') + (echec ? ' · ' + echec + ' en échec (format non pris en charge ?)' : '') + '.', echec && !ok ? 'error' : 'success');
  if (ok) { ALB.vue = 'aclasser'; ALB.sel = {}; }
  albRender();
}

window.albInit = albInit;
