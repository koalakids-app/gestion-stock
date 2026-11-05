/* Album photos, étape 2 — tri automatique par reconnaissance du visage.
   CIRCUIT FERMÉ : bibliothèque et modèles hébergés dans le dépôt (vendor/face-api),
   calcul dans le navigateur, aucune photo envoyée à un service extérieur.
   - Seule l'empreinte d'un visage de RÉFÉRENCE (128 nombres) est enregistrée, et
     seulement pour un enfant dont les parents ont donné un accord distinct du droit
     à l'image (table album_visages_accord). Les autres visages d'une photo ne sont
     jamais enregistrés (calcul éphémère, perdu à la fin de l'analyse).
   - Désactivé par défaut : la direction l'active par crèche (creches.tri_visage).
   - Au-dessus du seuil, la photo est classée seule ; en dessous, une personne valide.
   Tables et droits : sql/album_tri_visage.sql (à appliquer à la main).
   Dépend de 20-album-photos.js (ALB, albRender, albUrls, albJournal…). */
var ALBV = { actif: false, seuil: 90, accords: {}, refs: [], props: [], lib: null, calc: false, annule: false, msg: '' };
var ALBV_DOSSIER = 'vendor/face-api/';
var ALBV_MAX_REFS = 5;
var ALBV_DIST_OK = 0.52;     // au-delà (≈ 50 % de confiance), aucun enfant n'est proposé
var ALBV_ECART = 0.04;       // écart minimal avec le deuxième enfant le plus proche

/* ---------- Réglage par crèche (direction) et chargement ---------- */
async function albvCharger() {
  ALBV.actif = false; ALBV.accords = {}; ALBV.refs = []; ALBV.props = [];
  try {
    var c = await sb.from('creches').select('tri_visage,tri_visage_seuil').eq('id', ALB.creche).maybeSingle();
    if (c.error || !c.data) { albvMajOnglets(); return; }
    ALBV.actif = !!c.data.tri_visage; ALBV.seuil = c.data.tri_visage_seuil || 90;
    if (ALBV.actif) {
      var a = await sb.from('album_visages_accord').select('enfant_id,accord_le').eq('creche_id', ALB.creche);
      var r = await sb.from('album_references').select('id,enfant_id,descripteur').eq('creche_id', ALB.creche);
      if (a.error) throw a.error; if (r.error) throw r.error;
      (a.data || []).forEach(function (x) { ALBV.accords[x.enfant_id] = x; });
      ALBV.refs = r.data || [];
      var ids = ALB.photos.map(function (p) { return p.id; }), props = [];
      for (var i = 0; i < ids.length; i += 150) {
        var p = await sb.from('album_propositions').select('photo_id,enfant_id,score').in('photo_id', ids.slice(i, i + 150));
        if (p.error) throw p.error; props = props.concat(p.data || []);
      }
      ALBV.props = props;
    }
  } catch (e) { console.warn('[albvCharger]', e); ALBV.actif = false; }
  albvMajOnglets();
}
function albvMajOnglets() {
  var d = ALBV.actif ? '' : 'none';
  ['alb-tab-visage', 'alb-tab-refs'].forEach(function (id) { var b = albById(id); if (b) b.style.display = d; });
  var r = albById('alb-btn-visage-reglage');
  if (r) { r.style.display = isDirection ? '' : 'none'; r.innerHTML = '<i class="ti ti-scan-eye"></i> Tri par visage : ' + (ALBV.actif ? 'activé' : 'désactivé'); }
  if (!ALBV.actif && (ALB.vue === 'visage' || ALB.vue === 'refs')) ALB.vue = 'enfants';
}
async function albvReglage() {
  if (!isDirection) return;
  if (!ALBV.actif) {
    if (!confirm('Activer le tri par visage pour cette crèche ?\n\nÀ faire avant :\n• inscrire ce traitement au registre RGPD (donnée biométrique) et le faire valider par le DPO ;\n• recueillir l’accord des parents, distinct du droit à l’image, pour chaque enfant concerné.\n\nLe calcul reste dans le navigateur : aucune photo ne sort de votre infrastructure.')) return;
  } else if (!confirm('Désactiver le tri par visage ?\n\nLes références déjà enregistrées sont conservées. Pour les effacer, retirez l’accord de chaque enfant (onglet Références).')) return;
  var r = await sb.rpc('kk_album_reglage_visage', { p_creche: ALB.creche, p_actif: !ALBV.actif, p_seuil: null });
  if (r.error) { showBanner('Réglage impossible : ' + r.error.message, 'error'); return; }
  ALBV.actif = !ALBV.actif;
  albJournal('accord', null, 'Tri par visage ' + (ALBV.actif ? 'activé' : 'désactivé') + ' pour la crèche', null);
  await albvCharger(); albRender();
}

/* ---------- Bibliothèque (chargée seulement quand on s'en sert) ---------- */
function albvScript(src) {
  return new Promise(function (ok, ko) {
    var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { ko(new Error('chargement impossible : ' + src)); };
    document.head.appendChild(s);
  });
}
async function albvLib() {
  if (ALBV.lib) return ALBV.lib;
  await albvDelai((async function () {
    if (typeof faceapi === 'undefined') await albvScript(ALBV_DOSSIER + 'face-api.js');
    try { await faceapi.tf.ready(); } catch (e) { console.warn('[albv] WebGL indisponible, repli processeur', e); }
    if (!faceapi.tf.getBackend()) { await faceapi.tf.setBackend('cpu'); await faceapi.tf.ready(); }
    await faceapi.nets.tinyFaceDetector.loadFromUri(ALBV_DOSSIER + 'models');
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(ALBV_DOSSIER + 'models');
    await faceapi.nets.faceRecognitionNet.loadFromUri(ALBV_DOSSIER + 'models');
  })(), 120000, 'le moteur de reconnaissance ne s’est pas chargé (connexion ?)');
  ALBV.lib = faceapi;
  return faceapi;
}
async function albvImage(blobOuUrl) {
  var url = typeof blobOuUrl === 'string' ? blobOuUrl : URL.createObjectURL(blobOuUrl);
  return await new Promise(function (ok, ko) {
    var im = new Image();
    // Les photos viennent de Supabase (autre domaine) : sans ce mode, le navigateur
    // interdit la lecture des pixels et la détection échoue ou reste bloquée.
    if (typeof blobOuUrl === 'string') im.crossOrigin = 'anonymous';
    var t = setTimeout(function () { ko(new Error('chargement de la photo trop long')); }, 30000);
    im.onload = function () { clearTimeout(t); ok(im); };
    im.onerror = function () { clearTimeout(t); ko(new Error('image illisible')); };
    im.src = url;
  });
}
function albvDelai(promesse, ms, message) {
  return new Promise(function (ok, ko) {
    var t = setTimeout(function () { ko(new Error(message)); }, ms);
    promesse.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); ko(e); });
  });
}
async function albvVisages(img) {
  var f = await albvLib();
  return await albvDelai(f.detectAllFaces(img, new f.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.4 })).withFaceLandmarks(true).withFaceDescriptors(),
    90000, 'l’analyse du visage est trop longue sur cet appareil');
}

/* ---------- Comparaison ---------- */
function albvScore(d) { return Math.round(100 * Math.max(0, Math.min(1, (0.75 - d) / 0.45))); }   // 0,30 -> 100 % ; 0,75 -> 0 %
function albvEmpreintes() {
  var par = {};
  ALBV.refs.forEach(function (r) {
    if (!ALBV.accords[r.enfant_id]) return;
    (par[r.enfant_id] = par[r.enfant_id] || []).push(Float32Array.from(r.descripteur));
  });
  return par;
}
/* Pour un visage : { enfant, d, score } ou null. Distance au plus proche des références de chaque enfant. */
function albvCorrespondance(desc, par) {
  var f = ALBV.lib, classes = [];
  Object.keys(par).forEach(function (eid) {
    var m = Infinity;
    par[eid].forEach(function (ref) { var d = f.euclideanDistance(desc, ref); if (d < m) m = d; });
    classes.push({ enfant: eid, d: m });
  });
  classes.sort(function (a, b) { return a.d - b.d; });
  if (!classes.length || classes[0].d > ALBV_DIST_OK) return null;
  if (classes[1] && classes[1].d - classes[0].d < ALBV_ECART) return null;     // deux enfants trop proches : on ne tranche pas
  return { enfant: classes[0].enfant, d: classes[0].d, score: albvScore(classes[0].d) };
}

/* ---------- Analyse des photos à classer ---------- */
async function albvAnalyser(tout) {
  if (ALBV.calc) return;
  var par = albvEmpreintes();
  if (!Object.keys(par).length) { showBanner('Ajoutez d’abord au moins une photo de référence (onglet Références).', 'error'); return; }
  var liste = albAClasser().filter(function (p) { return tout || !p.tri_le; });
  if (!liste.length) { showBanner('Aucune nouvelle photo à analyser.'); return; }
  ALBV.calc = true; ALBV.annule = false; albRender();
  var auto = 0, propo = 0, rien = 0, faits = 0, echecs = 0, derniere = '';
  try {
    ALBV.msg = 'Chargement du moteur de reconnaissance…'; albvMajProgres();
    await albvLib();
    for (var i = 0; i < liste.length; i++) {
      if (ALBV.annule) break;
      var p = liste[i];
      ALBV.msg = 'Analyse ' + (i + 1) + ' / ' + liste.length + '…'; albvMajProgres();
      try {
        await albUrls([p.chemin]);
        var img = await albvImage(albUrl(p.chemin));
        var visages = await albvVisages(img);
        var trouves = {};
        visages.forEach(function (v) {
          var m = albvCorrespondance(v.descriptor, par);
          if (m && (!trouves[m.enfant] || trouves[m.enfant].score < m.score)) trouves[m.enfant] = m;
        });
        var ids = Object.keys(trouves);
        var seuil = ALBV.seuil;
        var sur = ids.length && ids.every(function (k) { return trouves[k].score >= seuil; });
        if (sur) {
          var rows = ids.map(function (k) { return { photo_id: p.id, enfant_id: k }; });
          var r = await sb.from('album_photos_enfants').upsert(rows, { onConflict: 'photo_id,enfant_id', ignoreDuplicates: true });
          if (r.error) throw r.error;
          rows.forEach(function (x) { ALB.liens.push(x); });
          auto++;
        } else if (ids.length) {
          var props = ids.map(function (k) { return { photo_id: p.id, enfant_id: k, score: trouves[k].score }; });
          var q = await sb.from('album_propositions').upsert(props, { onConflict: 'photo_id,enfant_id' });
          if (q.error) throw q.error;
          ALBV.props = ALBV.props.filter(function (x) { return x.photo_id !== p.id; }).concat(props);
          propo++;
        } else rien++;
        var t = new Date().toISOString();
        await sb.from('album_photos').update({ tri_le: t, tri_visages: visages.length }).eq('id', p.id);
        p.tri_le = t; p.tri_visages = visages.length; faits++;
      } catch (e) { console.warn('[albvAnalyser]', p.id, e); echecs++; derniere = (e && e.message) || String(e); }
      await new Promise(function (r) { setTimeout(r, 0); });
    }
  } catch (e) {
    showBanner('Tri par visage impossible : ' + (e.message || e), 'error');
  }
  ALBV.calc = false; ALBV.msg = '';
  if (faits) albJournal('tri_visage', null, auto + ' classées seules, ' + propo + ' à valider, ' + rien + ' sans correspondance', faits);
  if (echecs) showBanner(echecs + ' photo' + (echecs > 1 ? 's' : '') + ' n’ont pas pu être analysée' + (echecs > 1 ? 's' : '') + ' (' + derniere + ').', 'error');
  showBanner(faits + ' photo' + (faits > 1 ? 's' : '') + ' analysée' + (faits > 1 ? 's' : '') + ' : ' + auto + ' classée' + (auto > 1 ? 's' : '') + ' seule' + (auto > 1 ? 's' : '') + ', ' + propo + ' à valider, ' + rien + ' sans correspondance.');
  albRender();
}
function albvAnnuler() { ALBV.annule = true; ALBV.msg = 'Arrêt en cours…'; albvMajProgres(); }
function albvMajProgres() { var el = albById('albv-progres'); if (el) el.textContent = ALBV.msg; }

/* ---------- Écran « Tri par visage » ---------- */
function albvPropsDe(photoId) {
  return ALBV.props.filter(function (x) { return x.photo_id === photoId; }).sort(function (a, b) { return b.score - a.score; });
}
function albvBadge(p) {
  var pr = albvPropsDe(p.id)[0];
  if (!pr) return '';
  var e = cacheEnfants.find(function (x) { return String(x.id) === String(pr.enfant_id); });
  return e ? '<span class="alb-prop" title="Proposition du tri par visage">' + albEsc(e.prenom || albNom(e)) + ' ' + pr.score + ' %</span>' : '';
}
function albvNomEnfant(id) {
  var e = cacheEnfants.find(function (x) { return String(x.id) === String(id); });
  return e ? albNom(e) : '';
}
async function albvRenderTri(z) {
  var par = albvEmpreintes(), nbEnf = Object.keys(par).length;
  var aClasser = albAClasser();
  var nouvelles = aClasser.filter(function (p) { return !p.tri_le; }).length;
  var attente = aClasser.filter(function (p) { return albvPropsDe(p.id).length; });
  var sans = aClasser.filter(function (p) { return p.tri_le && !albvPropsDe(p.id).length; }).length;
  await albUrls(attente.map(function (p) { return p.chemin_mini; }));
  var h = '<div class="alb-aide"><i class="ti ti-shield-lock"></i> Circuit fermé : l’analyse se fait dans ce navigateur, les photos ne quittent pas votre espace. Seuls les enfants dont les parents ont donné leur accord sont reconnus.</div>' +
    '<div class="alb-remise" style="max-width:none"><div class="alb-barre" style="margin-bottom:8px"><b>Seuil de classement automatique : <span id="albv-seuil-v">' + ALBV.seuil + '</span> %</b>' +
    '<input type="range" id="albv-seuil" min="60" max="99" value="' + ALBV.seuil + '" ' + (isDirection ? '' : 'disabled') + ' oninput="albvSeuilVoir(this.value)" onchange="albvSeuil(this.value)" style="max-width:220px"></div>' +
    '<div class="alb-ct">Au-dessus du seuil, la photo est classée seule. En dessous, vous validez. Un visage inconnu ou trop proche de deux enfants n’est jamais classé automatiquement. ' + (isDirection ? '' : 'Réglage réservé à la direction.') + '</div></div>' +
    '<div class="alb-stats" style="margin-top:12px"><span class="alb-stat"><b>' + nbEnf + '</b> enfant' + (nbEnf > 1 ? 's' : '') + ' avec référence</span>' +
    '<span class="alb-stat"><b>' + nouvelles + '</b> à analyser</span><span class="alb-stat"><b>' + attente.length + '</b> à valider</span><span class="alb-stat"><b>' + sans + '</b> sans correspondance</span></div>';
  if (!nbEnf) h += '<div class="alb-vide-msg"><i class="ti ti-user-scan"></i><p>Aucune référence pour l’instant.<br>Dans l’onglet « Références », enregistrez l’accord des parents puis une ou plusieurs photos de chaque enfant.</p><button class="btn-primary" style="margin:0 auto" onclick="albVue(\'refs\')">Ouvrir les références</button></div>';
  else {
    h += '<div class="alb-barre">' + (ALBV.calc ? '<button class="btn-sm" onclick="albvAnnuler()"><i class="ti ti-player-stop"></i> Arrêter</button><span class="alb-ct" id="albv-progres">' + albEsc(ALBV.msg) + '</span>' :
      '<button class="btn-primary" ' + (nouvelles ? '' : 'disabled') + ' onclick="albvAnalyser(false)"><i class="ti ti-scan"></i> Analyser les nouvelles photos (' + nouvelles + ')</button>' +
      '<button class="btn-sm" ' + (aClasser.length ? '' : 'disabled') + ' onclick="albvAnalyser(true)" title="Refaire l’analyse de toutes les photos à classer, par exemple après avoir ajouté des références">Tout réanalyser</button>') + '</div>';
    h += attente.length ? '<div style="font-weight:700;margin:6px 0 8px">À valider</div><div class="alb-queue">' + attente.map(function (p) {
      var pr = albvPropsDe(p.id);
      return '<div class="alb-qi"><div class="alb-ph" style="width:150px;flex:none" onclick="albLightbox(\'aclasser\',\'' + p.id + '\')">' + albImg(p, true) + '<span class="alb-tag">' + albDateFr(p.prise_le) + '</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div class="alb-ct">' + (p.tri_visages > 1 ? p.tri_visages + ' visages détectés' : '1 visage détecté') + '</div>' +
        '<div class="alb-chips">' + pr.map(function (x) {
          return '<button class="alb-chip" onclick="albvValider(\'' + p.id + '\',[\'' + x.enfant_id + '\'])">' + albEsc(albvNomEnfant(x.enfant_id)) + ' · ' + x.score + ' %</button>';
        }).join('') + (pr.length > 1 ? '<button class="alb-chip" onclick="albvValider(\'' + p.id + '\',[' + pr.map(function (x) { return '\'' + x.enfant_id + '\''; }).join(',') + '])">Tous (' + pr.length + ')</button>' : '') +
        '<button class="btn-sm" onclick="albvIgnorer(\'' + p.id + '\')">Ignorer</button></div></div></div>';
    }).join('') + '</div>' : '';
  }
  z.innerHTML = h;
}
function albvSeuilVoir(v) { var s = albById('albv-seuil-v'); if (s) s.textContent = v; }
async function albvSeuil(v) {
  ALBV.seuil = +v;
  var r = await sb.rpc('kk_album_reglage_visage', { p_creche: ALB.creche, p_actif: null, p_seuil: ALBV.seuil });
  if (r.error) showBanner('Seuil non enregistré : ' + r.error.message, 'error');
}
async function albvValider(photoId, enfantIds) {
  var rows = enfantIds.map(function (id) { return { photo_id: photoId, enfant_id: id }; });
  var r = await sb.from('album_photos_enfants').upsert(rows, { onConflict: 'photo_id,enfant_id', ignoreDuplicates: true });
  if (r.error) { showBanner('Classement impossible : ' + r.error.message, 'error'); return; }
  rows.forEach(function (x) { ALB.liens.push(x); });
  await sb.from('album_propositions').delete().eq('photo_id', photoId);
  ALBV.props = ALBV.props.filter(function (x) { return x.photo_id !== photoId; });
  albJournal('classement', enfantIds.length === 1 ? enfantIds[0] : null, 'Proposition du tri par visage validée', enfantIds.length);
  albRender();
}
async function albvIgnorer(photoId) {
  await sb.from('album_propositions').delete().eq('photo_id', photoId);
  ALBV.props = ALBV.props.filter(function (x) { return x.photo_id !== photoId; });
  albRender();
}

/* ---------- Écran « Références » ---------- */
function albvRefsDe(id) { return ALBV.refs.filter(function (r) { return String(r.enfant_id) === String(id); }); }
function albvRenderRefs(z) {
  var enfants = albEnfants();
  var h = '<div class="alb-aide"><i class="ti ti-info-circle"></i> Une photo de référence suffit, 3 à 5 (de face, de profil, avec ou sans bonnet) donnent un tri plus fiable. Seule l’empreinte du visage est conservée, pas la photo. Le droit à l’image est signé à l’entrée ; l’accord ci-dessous est un second accord, propre au tri par visage.</div><div class="alb-refs">';
  h += enfants.map(function (e) {
    var ac = ALBV.accords[e.id], n = albvRefsDe(e.id).length;
    var etat = !ac ? '<span class="alb-pill warn">Sans accord : tri manuel</span>' : n === 0 ? '<span class="alb-pill warn">Aucune référence</span>' : n < 3 ? '<span class="alb-pill">Fiabilité moyenne</span>' : '<span class="alb-pill ok">Bonne fiabilité</span>';
    var peut = ac && n < ALBV_MAX_REFS;
    return '<div class="alb-ref"><div class="alb-barre" style="margin:0"><b class="grow" style="font-size:15px">' + albEsc(albNom(e)) + '</b>' + etat + '</div>' +
      '<label class="alb-etape" style="margin:0"><input type="checkbox" ' + (ac ? 'checked' : '') + ' onchange="albvAccord(\'' + e.id + '\',this.checked,this)"><span><b>Accord des parents pour le tri par visage</b>' + (ac ? ' <span class="alb-ct">(enregistré le ' + albDateFr(ac.accord_le) + ')</span>' : '') + '</span></label>' +
      '<div class="alb-barre" style="margin:0"><span class="alb-ct">' + n + ' référence' + (n > 1 ? 's' : '') + (n ? '' : '') + '</span>' +
      '<button class="btn-sm" ' + (peut ? '' : 'disabled') + ' onclick="albvRefAlbum(\'' + e.id + '\')"><i class="ti ti-photo"></i> Depuis l’album</button>' +
      '<button class="btn-sm" ' + (peut ? '' : 'disabled') + ' onclick="albvRefFichier(\'' + e.id + '\')"><i class="ti ti-camera"></i> Prendre / importer</button>' +
      (n ? '<button class="btn-sm" style="color:var(--red);border-color:var(--red)" onclick="albvRefsEffacer(\'' + e.id + '\')"><i class="ti ti-trash"></i></button>' : '') + '</div></div>';
  }).join('') + '</div><input type="file" id="albv-fichier" accept="image/*" hidden onchange="albvRefDepuisFichier(this)">';
  z.innerHTML = h;
}
async function albvAccord(enfantId, oui, cb) {
  var nom = albvNomEnfant(enfantId);
  if (oui) {
    if (!confirm('Les parents de ' + nom + ' ont-ils signé l’accord spécifique pour le tri par visage ?\n\nSans cet accord, ne cochez pas.')) { cb.checked = false; return; }
    var r = await sb.from('album_visages_accord').upsert({ enfant_id: enfantId, creche_id: ALB.creche }, { onConflict: 'enfant_id' }).select().single();
    if (r.error) { cb.checked = false; showBanner('Enregistrement impossible : ' + r.error.message, 'error'); return; }
    ALBV.accords[enfantId] = r.data; albJournal('accord', enfantId, nom, null);
  } else {
    if (!confirm('Retirer l’accord pour ' + nom + ' ?\n\nSes photos de référence (empreintes) et les propositions en attente seront effacées.')) { cb.checked = true; return; }
    var d = await sb.from('album_visages_accord').delete().eq('enfant_id', enfantId);
    if (d.error) { cb.checked = true; showBanner('Retrait impossible : ' + d.error.message, 'error'); return; }
    delete ALBV.accords[enfantId];
    ALBV.refs = ALBV.refs.filter(function (r) { return String(r.enfant_id) !== String(enfantId); });
    ALBV.props = ALBV.props.filter(function (r) { return String(r.enfant_id) !== String(enfantId); });
    albJournal('accord_retire', enfantId, nom, null);
  }
  albRender();
}
async function albvRefsEffacer(enfantId) {
  if (!confirm('Effacer les références de ' + albvNomEnfant(enfantId) + ' ? L’accord reste enregistré.')) return;
  var d = await sb.from('album_references').delete().eq('enfant_id', enfantId);
  if (d.error) { showBanner('Suppression impossible : ' + d.error.message, 'error'); return; }
  ALBV.refs = ALBV.refs.filter(function (r) { return String(r.enfant_id) !== String(enfantId); });
  albJournal('accord_retire', enfantId, 'Références effacées', null);
  albRender();
}

/* --- Ajout d'une référence : choix du visage puis enregistrement de l'empreinte --- */
var ALBV_CIBLE = null;
function albvFermerModale() { var m = albById('albv-modale'); if (m) m.style.display = 'none'; }
function albvModale(html) {
  var m = albById('albv-modale');
  if (!m) { m = document.createElement('div'); m.id = 'albv-modale'; m.className = 'alb-lb'; document.body.appendChild(m); }
  m.innerHTML = '<div class="alb-lb-box" style="overflow:auto">' + html + '</div>'; m.style.display = 'flex';
}
function albvRefFichier(enfantId) { ALBV_CIBLE = enfantId; var i = albById('albv-fichier'); if (i) i.click(); }
async function albvRefDepuisFichier(input) {
  var f = input.files && input.files[0]; input.value = '';
  if (!f || !ALBV_CIBLE) return;
  try { await albvRefDepuisImage(ALBV_CIBLE, await albvImage(f)); } catch (e) { showBanner('Image illisible : ' + (e.message || e), 'error'); }
}
async function albvRefAlbum(enfantId) {
  ALBV_CIBLE = enfantId;
  var ph = albPhotosDe(enfantId).slice().sort(function (a, b) { return albEnfantsDe(a.id).length - albEnfantsDe(b.id).length; });
  if (!ph.length) { showBanner('Aucune photo dans l’album de cet enfant. Importez une photo à la place.', 'error'); return; }
  await albUrls(ph.map(function (p) { return p.chemin_mini; }));
  albvModale('<div class="alb-barre"><b>Choisissez une photo où ' + albEsc(albvNomEnfant(enfantId)) + ' est bien visible</b><button class="btn-sm" style="margin-left:auto" onclick="albvFermerModale()">Fermer</button></div>' +
    '<div class="alb-gal">' + ph.map(function (p) { return '<div class="alb-ph" onclick="albvRefDepuisPhoto(\'' + p.id + '\')">' + albImg(p, true) + (albEnfantsDe(p.id).length > 1 ? '<span class="alb-groupe"><i class="ti ti-users"></i></span>' : '') + '</div>'; }).join('') + '</div>');
}
async function albvRefDepuisPhoto(photoId) {
  var p = ALB.photos.find(function (x) { return x.id === photoId; });
  if (!p) return;
  albvModale('<div class="alb-vide-msg"><p>Analyse de la photo…</p></div>');
  try { await albUrls([p.chemin]); await albvRefDepuisImage(ALBV_CIBLE, await albvImage(albUrl(p.chemin))); }
  catch (e) { albvFermerModale(); showBanner('Analyse impossible : ' + (e.message || e), 'error'); }
}
async function albvRefDepuisImage(enfantId, img) {
  showBanner('Détection du visage…');
  var v = await albvVisages(img);
  if (!v.length) { albvFermerModale(); showBanner('Aucun visage détecté. Essayez une photo plus nette et de face.', 'error'); return; }
  if (v.length === 1) { await albvEnregistrerRef(enfantId, v[0].descriptor); return; }
  /* plusieurs visages : on fait choisir */
  var k = Math.min(1, 640 / img.naturalWidth), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var cx = c.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
  cx.lineWidth = 3; cx.font = 'bold 16px sans-serif';
  v.forEach(function (x, i) {
    var b = x.detection.box;
    cx.strokeStyle = '#F47920'; cx.strokeRect(b.x * k, b.y * k, b.width * k, b.height * k);
    cx.fillStyle = '#F47920'; cx.fillRect(b.x * k, b.y * k - 20, 24, 20); cx.fillStyle = '#fff'; cx.fillText(String(i + 1), b.x * k + 7, b.y * k - 5);
  });
  ALBV._choix = v;
  albvModale('<div class="alb-barre"><b>Plusieurs visages : lequel est ' + albEsc(albvNomEnfant(enfantId)) + ' ?</b><button class="btn-sm" style="margin-left:auto" onclick="albvFermerModale()">Annuler</button></div>' +
    '<div class="alb-lb-img"><img src="' + c.toDataURL('image/jpeg', 0.85) + '" alt="Visages détectés"></div>' +
    '<div class="alb-chips" style="margin-top:8px">' + v.map(function (x, i) { return '<button class="alb-chip" onclick="albvChoisirVisage(' + i + ')">Visage ' + (i + 1) + '</button>'; }).join('') + '</div>');
}
async function albvChoisirVisage(i) {
  var v = ALBV._choix && ALBV._choix[i]; if (!v) return;
  await albvEnregistrerRef(ALBV_CIBLE, v.descriptor); ALBV._choix = null;
}
async function albvEnregistrerRef(enfantId, descriptor) {
  albvFermerModale();
  if (!ALBV.accords[enfantId]) { showBanner('Accord des parents non enregistré pour cet enfant.', 'error'); return; }
  if (albvRefsDe(enfantId).length >= ALBV_MAX_REFS) { showBanner('Maximum ' + ALBV_MAX_REFS + ' références par enfant.', 'error'); return; }
  var arr = Array.prototype.map.call(descriptor, function (x) { return Math.round(x * 100000) / 100000; });
  var r = await sb.from('album_references').insert({ enfant_id: enfantId, creche_id: ALB.creche, descripteur: arr }).select('id,enfant_id,descripteur').single();
  if (r.error) { showBanner('Enregistrement impossible : ' + r.error.message, 'error'); return; }
  ALBV.refs.push(r.data); albJournal('reference', enfantId, albvNomEnfant(enfantId), 1);
  showBanner('Référence enregistrée pour ' + albEsc(albvNomEnfant(enfantId)) + '.');
  albRender();
}

/* Départ de l'enfant : accord, références et propositions effacés avec les photos */
async function albvPurgerEnfant(enfantId) {
  try {
    await sb.from('album_propositions').delete().eq('enfant_id', enfantId);
    await sb.from('album_visages_accord').delete().eq('enfant_id', enfantId);   // le déclencheur efface les références
  } catch (e) { console.warn('[albvPurgerEnfant]', e); }
  delete ALBV.accords[enfantId];
  ALBV.refs = ALBV.refs.filter(function (r) { return String(r.enfant_id) !== String(enfantId); });
  ALBV.props = ALBV.props.filter(function (r) { return String(r.enfant_id) !== String(enfantId); });
}
