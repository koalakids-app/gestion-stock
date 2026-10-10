
// ─── PICKER 2 : REPRENDRE UNE COMMANDE PRÉCÉDENTE ──────────────────────────
let pickerOrderSelection = new Set(); // clés "commandeId:ligneIdx"

function openOrderHistoryPicker() {
  pickerOrderSelection = new Set();
  renderOrderHistoryPickerList();
  document.getElementById('modal-order-history-picker').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function renderOrderHistoryPickerList() {
  const crecheSel = document.getElementById('c-creche-select')?.value;
  let list = COMMANDES.filter(c => !crecheSel || c.creche === crecheSel);
  // Plus récentes en premier
  list = list.slice().sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

  const container = document.getElementById('picker-order-list');
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">Aucune commande antérieure pour cette crèche</div>`;
    return;
  }
  container.innerHTML = list.map(c => {
    const lignes = (c.articles||'').split('\n').filter(Boolean);
    const items = lignes.map((ligne, idx) => ({ idx, art: parseLigneArticle(ligne) })).filter(x => x.art);
    return `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:10px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg)">
        <div>
          <div style="font-size:13px;font-weight:700">🏭 ${c.fourn} <span style="color:var(--ink3);font-weight:400">· ${c.date||''}</span></div>
          <div style="font-size:11px;color:var(--ink3)">${c.bc||''} · ${items.length} article(s) · ${(c.montant||0).toFixed(2)} €</div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="reprendreCommandeEntiere(${c.id})">🔁 Tout reprendre</button>
      </div>
      <div>
        ${items.map(({idx, art}) => {
          const key = `${c.id}:${idx}`;
          const checked = pickerOrderSelection.has(key) ? 'checked' : '';
          return `<label style="display:flex;align-items:center;gap:10px;padding:7px 12px;border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
            <input type="checkbox" ${checked} onchange="togglePickerOrderLine('${key}', this.checked)" style="min-height:auto;width:16px;height:16px">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600">${art.qty}× ${art.nom}</div>
              <div style="font-size:11px;color:var(--ink3)">${art.fourn||'—'} ${art.prix>0?`· ${art.prix.toFixed(2)} €`:''}</div>
            </div>
          </label>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function togglePickerOrderLine(key, checked) {
  if (checked) pickerOrderSelection.add(key);
  else pickerOrderSelection.delete(key);
  const cnt = document.getElementById('picker-order-count');
  if (cnt) cnt.textContent = `${pickerOrderSelection.size} ligne(s) sélectionnée(s)`;
}

// Récupère la photo associée à une ligne d'une commande (stockée séparément dans photos_json)
function getPhotoFromCommandeLine(c, idx) {
  if (!c.photos_json) return '';
  try { return JSON.parse(c.photos_json)[idx] || ''; } catch(e) { return ''; }
}

function reprendreCommandeEntiere(commandeId) {
  const c = COMMANDES.find(x => x.id === commandeId);
  if (!c) return;
  const lignes = (c.articles||'').split('\n').filter(Boolean);
  const items = lignes.map((ligne, idx) => { const art = parseLigneArticle(ligne); if (art) art._idx = idx; return art; }).filter(Boolean);
  if (items.length === 0) { showNotif('⚠ Aucun article exploitable dans cette commande'); return; }
  removeEmptyTrailingRow();
  items.forEach(art => {
    addArticleRow(String(art.qty), art.nom, art.prix > 0 ? art.prix.toFixed(2) : '', art.url || '', art.fourn || '', art.cat || '', getPhotoFromCommandeLine(c, art._idx));
  });
  showNotif(`✅ ${items.length} article(s) repris de la commande ${c.bc||''}`);
  closeModal('modal-order-history-picker');
}

function confirmOrderHistoryPicker() {
  if (pickerOrderSelection.size === 0) { showNotif('⚠ Sélectionnez au moins une ligne'); return; }
  removeEmptyTrailingRow();
  let count = 0;
  pickerOrderSelection.forEach(key => {
    const [cIdStr, idxStr] = key.split(':');
    const c = COMMANDES.find(x => x.id === parseInt(cIdStr) || String(x.id) === cIdStr);
    if (!c) return;
    const idx = parseInt(idxStr);
    const lignes = (c.articles||'').split('\n').filter(Boolean);
    const art = parseLigneArticle(lignes[idx] || '');
    if (!art) return;
    addArticleRow(String(art.qty), art.nom, art.prix > 0 ? art.prix.toFixed(2) : '', art.url || '', art.fourn || '', art.cat || '', getPhotoFromCommandeLine(c, idx));
    count++;
  });
  showNotif(`✅ ${count} article(s) ajouté(s) à la commande`);
  closeModal('modal-order-history-picker');
}

// Si la seule ligne du formulaire est vide (cas du formulaire vierge), on la retire
// avant d'injecter des lignes choisies depuis un picker, pour éviter une ligne vide parasite.
function removeEmptyTrailingRow() {
  const rows = document.querySelectorAll('.article-row');
  if (rows.length !== 1) return;
  const row = rows[0];
  const idx = row.id.replace('article-row-', '');
  const nom = document.getElementById(`row-nom-${idx}`)?.value?.trim();
  if (!nom) row.remove();
}

function getArticlesFromRows() {
  const rows = document.querySelectorAll('.article-row');
  const lines = [];
  rows.forEach(row => {
    const idx = row.id.replace('article-row-', '');
    const qty   = document.getElementById(`row-qty-${idx}`)?.value?.trim();
    // Purge les prix "(12.50€)" déjà dupliqués en fin de nom (anciennes éditions)
    const nom   = document.getElementById(`row-nom-${idx}`)?.value?.trim().replace(/(?:\s*\(\d+[.,]?\d*\s*€\))+\s*$/,'').trim();
    const fourn = document.getElementById(`row-fourn-${idx}`)?.value?.trim();
    const cat   = document.getElementById(`row-cat-${idx}`)?.value?.trim();
    const prix  = document.getElementById(`row-prix-${idx}`)?.value?.trim();
    const url   = document.getElementById(`row-url-${idx}`)?.value?.trim();
    if (nom && qty) {
      let line = `${qty}× ${nom}`;
      if (fourn) line += ` {${fourn}}`;
      if (cat)   line += ` [cat:${cat}]`;
      if (prix && parseFloat(prix) > 0) line += ` (${parseFloat(prix).toFixed(2)}€)`;
      if (url) line += ` [${url}]`;
      lines.push(line);
    }
  });
  return lines.join('\n');
}

// articleRowPhotos/articleRowFiles sont indexés par l'idx DOM de la ligne
// (compteur qui ne se réaligne jamais, y compris après suppression d'une
// ligne). Mais getArticlesFromRows() saute les lignes sans nom/qté et
// getPhotoFromCommandeLine() relit les photos par position dans le texte
// "articles" une fois sauvegardé : dès qu'une ligne est supprimée ou
// laissée vide, ces deux indexations divergent et les photos se
// retrouvent affichées sur le mauvais article. On réaligne donc les clés
// de articleRowPhotos/articleRowFiles sur la position réelle dans les
// lignes produites par getArticlesFromRows() juste avant l'upload/sauvegarde.
function remapRowPhotosToLineIndex() {
  const rows = document.querySelectorAll('.article-row');
  const photoMap = {};
  const fileMap = {};
  let lineIdx = 0;
  rows.forEach(row => {
    const idx = row.id.replace('article-row-', '');
    const qty = document.getElementById(`row-qty-${idx}`)?.value?.trim();
    const nom = document.getElementById(`row-nom-${idx}`)?.value?.trim();
    if (nom && qty) {
      if (articleRowPhotos.hasOwnProperty(idx)) photoMap[lineIdx] = articleRowPhotos[idx];
      if (articleRowFiles.hasOwnProperty(idx))  fileMap[lineIdx]  = articleRowFiles[idx];
      lineIdx++;
    }
  });
  Object.keys(articleRowPhotos).forEach(k => delete articleRowPhotos[k]);
  Object.keys(articleRowFiles).forEach(k => delete articleRowFiles[k]);
  Object.assign(articleRowPhotos, photoMap);
  Object.assign(articleRowFiles, fileMap);
}

// ─── PHOTO UPLOAD ─────────────────────────────────────────────────────────

let currentPhotoData = null;
let currentPhotoName = null;
let currentPhotoFile = null;

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  // Réinitialiser l'autre input pour éviter les doublons
  const otherId = event.target.id === 'f-photo' ? 'f-photo-camera' : 'f-photo';
  const other = document.getElementById(otherId);
  if (other) other.value = '';
  processPhotoFile(file);
}

function processPhotoFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    showNotif('⚠ Photo trop grande — maximum 5 Mo');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showNotif('⚠ Format non supporté — JPG, PNG ou WEBP uniquement');
    return;
  }
  const reader = new FileReader();
  reader.onload = async e => {
    currentPhotoFile = file; // fichier brut conservé pour upload Storage à la sauvegarde
    currentPhotoData = e.target.result; // aperçu local uniquement, jamais envoyé en base
    currentPhotoName = file.name;
    showPhotoPreview(e.target.result, file.name);
    showNotif('📷 Photo chargée');
  };
  reader.readAsDataURL(file);
}

function showPhotoPreview(dataUrl, filename) {
  const ph = document.getElementById('photo-placeholder');
  if (ph) ph.style.display = 'none';
  const pz = document.getElementById('photo-upload-zone');
  if (pz) pz.style.display = 'none';
  const pc = document.getElementById('photo-preview-container');
  if (pc) pc.style.display = 'block';
  const pi = document.getElementById('photo-preview-img');
  if (pi) pi.src = dataUrl;
  const pf = document.getElementById('photo-filename');
  if (pf) pf.textContent = filename;
}

function resetPhotoUpload() {
  const ph = document.getElementById('photo-placeholder');
  if (ph) ph.style.display = 'flex';
  const pz = document.getElementById('photo-upload-zone');
  if (pz) pz.style.display = 'flex';
  const pc = document.getElementById('photo-preview-container');
  if (pc) pc.style.display = 'none';
  const pi = document.getElementById('photo-preview-img');
  if (pi) pi.src = '';
  const pf = document.getElementById('photo-filename');
  if (pf) pf.textContent = '';
  const fp = document.getElementById('f-photo');
  if (fp) fp.value = '';
  const fc = document.getElementById('f-photo-camera');
  if (fc) fc.value = '';
  currentPhotoData = null;
  currentPhotoName = null;
  currentPhotoFile = null;
}

function removePhoto(event) {
  event.stopPropagation();
  resetPhotoUpload();
  const pz = document.getElementById('photo-upload-zone');
  if (pz) pz.style.display = 'flex';
  showNotif('🗑 Photo supprimée');
}

// Drag & drop
function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('photo-upload-zone').classList.add('drag-over');
}

function handleDragLeave(event) {
  document.getElementById('photo-upload-zone').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('photo-upload-zone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) processPhotoFile(file);
}

// Photo from detail modal (add photo directly on existing article)
function triggerDetailPhotoUpload(id) {
  document.getElementById(`detail-photo-input-${id}`).click();
}

function handleDetailPhotoUpload(event, id) {
  const file = event.target.files[0];
  if (!file) return;
  uploadDetailPhotoFile(file, id);
}

function uploadDetailPhotoFile(file, id) {
  if (file.size > 5 * 1024 * 1024) { showNotif('⚠ Photo trop grande — max 5 Mo'); return; }
  if (!file.type.startsWith('image/')) { showNotif('⚠ Format non supporté'); return; }
  showNotif('📤 Envoi de la photo…');
  uploadPhotoToStorage(file, id).then(url => {
    const a = ARTICLES.find(x => x.id === id);
    if (a) {
      a.photo = url;
      a.photoName = file.name;
      saveData();
      showNotif('📷 Photo ajoutée');
      renderActiveInvTable();
      showDetail(id);
    }
  }).catch(err => {
    console.error('[Photo]', err.message);
    showNotif('❌ Erreur envoi photo — réessayez');
  });
}

function handleDetailDragOver(event, id) {
  event.preventDefault();
  const z = document.getElementById(`detail-photo-zone-${id}`);
  if (z) z.classList.add('drag-over');
}

function handleDetailDragLeave(event, id) {
  const z = document.getElementById(`detail-photo-zone-${id}`);
  if (z) z.classList.remove('drag-over');
}

function handleDetailDrop(event, id) {
  event.preventDefault();
  const z = document.getElementById(`detail-photo-zone-${id}`);
  if (z) z.classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) uploadDetailPhotoFile(file, id);
}

async function removeArticlePhoto(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (a) {
    a.photo = null;
    a.photoName = null;
    saveData();
    showNotif('🗑 Photo supprimée');
    renderActiveInvTable();
    showDetail(id);
  }
}

// ─── SUPABASE CLOUD SYNC ──────────────────────────────────────────────────

const SUPA_URL = 'https://juyrceadazrovlitxceb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug';
// Jeton de la session utilisateur : renseigne apres connexion (cf. skDoLogin).
// Tant qu'il est nul les requetes partent avec la cle anon et sont bloquees par RLS.
let SK_TOKEN = null;
function skAuthToken(){ return SK_TOKEN || SUPA_KEY; }

// Les navigateurs mobiles gelent les timers quand l'application passe en
// arriere-plan : le renouvellement programme du jeton n'a alors pas lieu et la
// premiere ecriture au retour part avec un jeton expire (401). On rejoue la
// requete une fois, apres avoir force le renouvellement.
// Le 403 n'est volontairement pas traite ici : c'est un refus RLS legitime,
// le masquer par un rejeu rendrait les erreurs de droits invisibles.
async function sbFetchAuth(url, opts) {
  const build = () => {
    const o = Object.assign({}, opts);
    o.headers = Object.assign({}, opts.headers, {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + skAuthToken(),
    });
    return o;
  };
  let r = await fetch(url, build());
  if (r.status === 401 && SK_REFRESH) {
    console.warn('[Auth] 401 sur ecriture — renouvellement du jeton puis rejeu');
    await skRefreshToken();
    r = await fetch(url, build());
  }
  return r;
}

// SUPA_HEADERS reste un objet mais ses valeurs sont recalculees a chaque lecture,
// ce qui evite de toucher aux 3 spreads `...SUPA_HEADERS` existants.
const SUPA_HEADERS = {
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
  get apikey(){ return SUPA_KEY; },
  get Authorization(){ return 'Bearer ' + skAuthToken(); },
};

// ── UPLOAD PHOTO VERS SUPABASE STORAGE ──────────────────────────────────
// Remplace le stockage base64 en base par un upload direct vers le bucket "assets",
// suivi du retour de l'URL publique. Évite de surcharger l'egress (cf. migration-photos-storage.html).
const PHOTO_BUCKET = 'assets';
async function uploadPhotoToStorage(file, idHint, folder = 'articles-photos') {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
  const path = `${folder}/${idHint}-${Date.now()}.${ext}`;
  const res = await sbFetchAuth(`${SUPA_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) {
    const body = await res.text().catch(()=>'');
    throw new Error(`Upload photo : ${res.status} — ${body}`);
  }
  return `${SUPA_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

// ── FIX : Supabase en mode dégradé si la clé ne fonctionne pas ──────────
// L'app fonctionne avec les données d'exemple si Supabase est inaccessible

function setIndicator(msg, color='var(--ink3)') {
  const el = document.getElementById('save-indicator');
  if (el) { el.textContent = msg; el.style.color = color; el.style.display = 'inline'; }
}

// ─── SYNCHRONISATION TEMPS RÉEL ──────────────────────────────────────────
// Rafraîchissement automatique toutes les 30 secondes
// Détecte les modifications faites depuis d'autres appareils

let pollingInterval = null;
let isPolling = false;

async function syncFromCloud() {
  if (IS_LOCAL) return;
  if (isPolling) return;
  isPolling = true;
  // Timeout par requête : 20s max (évite que syncFromCloud reste bloqué indéfiniment)
  const withTimeout = (p, ms=20000) => Promise.race([p, new Promise((_,r)=>setTimeout(()=>r(new Error('Timeout')),ms))]);
  try {
    // Fetch chaque table indépendamment — une erreur sur l'une ne détruit pas les autres
    const results = await Promise.allSettled([
      withTimeout(sbGet('articles')),
      withTimeout(sbGet('commandes')),
      withTimeout(sbGet('fournisseurs')),
      withTimeout(sbGet('historique', 'order=id.desc&limit=200')),
      withTimeout(sbGet('stock_couches')),
      withTimeout(sbGet('stock_couches_mouvements', 'order=created_at.desc&limit=500')),
      withTimeout(sbGet('stock_couches_prix', 'order=type_couche.asc')),
    ]);

    const [artsR, cmdsR, fournsR, histosR, couchesR, couchesMvtsR, couchesPrixR] = results;

    // Signature avant/après : si rien n'a changé, on ne redessine rien (sinon l'écran clignote toutes les 60 s)
    const _sig = () => { try { return JSON.stringify([ARTICLES, COMMANDES, FOURNISSEURS, HISTORIQUE, COUCHES, COUCHES_MVTS, COUCHES_PRIX]); } catch(e) { return String(Math.random()); } };
    const _sigAvant = _sig();
    // On ne remplace les données en mémoire QUE si le fetch a réussi
    if (artsR.status === 'fulfilled' && Array.isArray(artsR.value))
      ARTICLES.splice(0, ARTICLES.length, ...artsR.value.map(rowToArticle));
    else if (artsR.status === 'rejected')
      console.warn('[Sync] articles:', artsR.reason?.message);

    if (cmdsR.status === 'fulfilled' && Array.isArray(cmdsR.value)) {
      // Fusionner : garder les commandes locales non encore persistées (id numérique local > id Supabase)
      const dbIds = new Set(cmdsR.value.map(r => r.id));
      const localOnly = COMMANDES.filter(c => !dbIds.has(c.id));
      COMMANDES.splice(0, COMMANDES.length, ...cmdsR.value.map(rowToCommande), ...localOnly);
    } else if (cmdsR.status === 'rejected')
      console.warn('[Sync] commandes:', cmdsR.reason?.message);

    if (fournsR.status === 'fulfilled' && Array.isArray(fournsR.value))
      FOURNISSEURS.splice(0, FOURNISSEURS.length, ...fournsR.value.map(rowToFournisseur));
    else if (fournsR.status === 'rejected')
      console.warn('[Sync] fournisseurs:', fournsR.reason?.message);

    if (histosR.status === 'fulfilled' && Array.isArray(histosR.value))
      HISTORIQUE.splice(0, HISTORIQUE.length, ...histosR.value.map(rowToHisto));
    else if (histosR.status === 'rejected')
      console.warn('[Sync] historique:', histosR.reason?.message);

    if (couchesR.status === 'fulfilled' && Array.isArray(couchesR.value))
      COUCHES.splice(0, COUCHES.length, ...couchesR.value.map(rowToCouche));
    else if (couchesR.status === 'rejected')
      console.warn('[Sync] stock_couches (non-bloquant):', couchesR.reason?.message);

    if (couchesMvtsR.status === 'fulfilled' && Array.isArray(couchesMvtsR.value))
      COUCHES_MVTS.splice(0, COUCHES_MVTS.length, ...couchesMvtsR.value.map(rowToCoucheMvt));
    else if (couchesMvtsR.status === 'rejected')
      console.warn('[Sync] stock_couches_mouvements (non-bloquant):', couchesMvtsR.reason?.message);

    if (couchesPrixR.status === 'fulfilled' && Array.isArray(couchesPrixR.value))
      COUCHES_PRIX.splice(0, COUCHES_PRIX.length, ...couchesPrixR.value.map(rowToCouchePrix));
    else if (couchesPrixR.status === 'rejected')
      console.warn('[Sync] stock_couches_prix (non-bloquant):', couchesPrixR.reason?.message);

    if (_sig() !== _sigAvant) {
      const savedCreche = currentCreche;
      saveData();
      currentCreche = savedCreche;
      renderActiveInvTable(); renderStats(); updateCounts();
      if (currentPage === 'commandes') renderCommandes();
      else if (currentPage === 'fournisseurs') renderFournisseurs();
      else if (currentPage === 'historique') renderHistorique();
      else if (currentPage === 'couches') renderCouches();
    }

    const [artsOk, cmdsOk, fournsOk, histosOk] = [artsR, cmdsR, fournsR, histosR].map(r => r.status === 'fulfilled');
    const allOk = artsOk && cmdsOk && fournsOk && histosOk;
    const now = new Date();
    setIndicator(
      allOk
        ? '☁️ À jour — ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})
        : '⚠️ Sync partiel — ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}),
      allOk ? 'var(--green)' : 'var(--amber)'
    );
  } catch(e) {
    console.warn('[Sync]', e.message);
    setIndicator('⚠️ Hors ligne', 'var(--amber)');
  } finally {
    isPolling = false;
  }
}

function startPolling(intervalSec = 60) {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(syncFromCloud, intervalSec * 1000);
}

function stopPolling() {
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

// Pause le polling quand l'onglet est en arrière-plan (économie batterie)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    syncFromCloud(); // Sync immédiate au retour en avant-plan
    startPolling(60);
  }
});

// Sync immédiate au retour en ligne
window.addEventListener('online', () => {
  setIndicator('🔄 Reconnexion…', 'var(--amber)');
  syncFromCloud().then(() => startPolling(60));
});
