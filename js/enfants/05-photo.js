/* Photo de l'enfant dans l'en-tête de la fiche.
   Stockée comme les autres pièces du dossier : bucket privé documents-admin,
   ligne enfants_documents_admin avec piece_key = 'photo_enfant' (une seule par enfant ;
   remplacer = supprimer l'ancienne). Aucune URL publique : URL signée à l'affichage.
   Pas de SQL. Réduite dans le navigateur (600 px, JPEG). */
var ENF_PHOTO_KEY = 'photo_enfant', ENF_PHOTO_BUCKET = 'documents-admin', ENF_PHOTO_TTL = 3600;
var enfPhotoLigne = null;

function enfPhotoReduire(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 600, k = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Image illisible')); }, 'image/jpeg', 0.85);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

function enfPhotoAfficher(url) {
  var av = document.getElementById('enf-fiche-avatar');
  if (!av) return;
  if (url) {
    av.style.cssText = 'background:#fff center/cover no-repeat url("' + url + '");overflow:hidden';
    av.textContent = '';
  } else {
    av.style.cssText = '';
    var e = cacheEnfants.find(function (x) { return String(x.id) === String(enfFicheId); });
    if (e) av.innerHTML = ((e.prenom || '').charAt(0) + (e.nom || '').charAt(0)).toUpperCase() || '<i class="ti ti-mood-kid"></i>';
  }
}

async function enfPhotoCharger(enfantId) {
  enfPhotoLigne = null;
  try {
    var r = await sb.from('enfants_documents_admin').select('*').eq('enfant_id', enfantId)
      .eq('piece_key', ENF_PHOTO_KEY).order('created_at', { ascending: false }).limit(1);
    if (r.error) throw r.error;
    if (String(enfFicheId) !== String(enfantId)) return;
    enfPhotoLigne = (r.data || [])[0] || null;
    if (!enfPhotoLigne) enfPhotoAfficher(null);
    else {
      var u = await sb.storage.from(enfPhotoLigne.bucket || ENF_PHOTO_BUCKET).createSignedUrl(enfPhotoLigne.path, ENF_PHOTO_TTL);
      if (String(enfFicheId) !== String(enfantId)) return;
      enfPhotoAfficher(u.data && u.data.signedUrl);
    }
  } catch (err) { console.warn('[enfPhoto]', err); }
  enfPhotoActions();
}

function enfPhotoActions() {
  var sous = document.getElementById('enf-fiche-sous');
  if (!sous) return;
  var old = document.getElementById('enf-photo-actions');
  if (old) old.remove();
  var s = document.createElement('span');
  s.id = 'enf-photo-actions';
  s.innerHTML = '<a href="#" onclick="enfPhotoChoisir();return false" style="color:var(--koala)"><i class="ti ti-camera"></i> '
    + (enfPhotoLigne ? 'Changer la photo' : 'Ajouter une photo') + '</a>'
    + (enfPhotoLigne ? ' · <a href="#" onclick="enfPhotoRetirer();return false" style="color:var(--red)">Retirer</a>' : '')
    + '<input type="file" id="enf-photo-input" accept="image/*" style="display:none" onchange="enfPhotoEnvoyer(event)"/>';
  sous.appendChild(s);
}

function enfPhotoChoisir() { var i = document.getElementById('enf-photo-input'); if (i) i.click(); }

async function enfPhotoEnvoyer(ev) {
  var f = ev.target.files && ev.target.files[0], eid = enfFicheId;
  if (!f || !eid) return;
  try {
    var blob = await enfPhotoReduire(f);
    var path = eid + '/' + Date.now() + '_photo.jpg';
    var u = await sb.storage.from(ENF_PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
    if (u.error) throw u.error;
    var r = await sb.from('enfants_documents_admin').insert({ enfant_id: eid, bucket: ENF_PHOTO_BUCKET, path: path, filename: 'photo.jpg', piece_key: ENF_PHOTO_KEY }).select().single();
    if (r.error) { await sb.storage.from(ENF_PHOTO_BUCKET).remove([path]); throw r.error; }
    if (enfPhotoLigne) await enfPhotoSupprimer(enfPhotoLigne);
    showBanner('Photo enregistrée ✅');
  } catch (err) { showBanner('Photo impossible : ' + (err.message || err), 'error'); }
  ev.target.value = '';
  enfPhotoCharger(eid);
}

async function enfPhotoSupprimer(l) {
  await sb.from('enfants_documents_admin').delete().eq('id', l.id);
  await sb.storage.from(l.bucket || ENF_PHOTO_BUCKET).remove([l.path]);
}

async function enfPhotoRetirer() {
  if (!enfPhotoLigne || !confirm('Retirer la photo de cet enfant ?')) return;
  var eid = enfFicheId;
  await enfPhotoSupprimer(enfPhotoLigne);
  enfPhotoLigne = null;
  enfPhotoAfficher(null);
  enfPhotoActions();
  showBanner('Photo retirée');
}

/* L'en-tête est redessiné à chaque ouverture / modification : on rattache la photo ensuite. */
(function () {
  var base = window.enfEntete;
  window.enfEntete = enfEntete = function (e) {
    var av = document.getElementById('enf-fiche-avatar'); if (av) av.style.cssText = '';
    base(e);
    if (typeof enfFicheId !== 'undefined' && String(enfFicheId) === String(e.id)) enfPhotoCharger(e.id);
  };
})();
