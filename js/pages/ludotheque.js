// ─── DÉTECTION CONTEXTE ──────────────────────────────────────────────────────
const IS_LOCAL = (typeof location !== 'undefined') &&
  (location.protocol === 'file:' ||
   (location.hostname && location.hostname.includes('claudeusercontent')));

// ─── DATA ─────────────────────────────────────────────────────────────────
// Valeurs de secours affichées avant la connexion (mode local / hors ligne) —
// la vraie liste des crèches de l'organisation est chargée après login,
// voir loadCreches() / SK_CRECHE_NAMES.
let CRECHES = ['Brunet', 'Cuers', 'Ollioules', 'St Jean', 'Picot 1', 'Picot 2'];
let CRECHE_COLORS = { 'Brunet': '#F59E0B', 'Cuers': '#10B981', 'Ollioules': '#EF4444', 'St Jean': '#8B5CF6', 'Picot 1': '#0EA5E9', 'Picot 2': '#F43F5E' };
const CRECHE_PALETTE = ['#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#0EA5E9', '#F43F5E', '#22C55E', '#F97316', '#6366F1', '#EC4899'];
const CAT_ICONS = { 'Sensoriel':'👂','Manipulation':'🤲','Construction':'🧱','Motricité':'🏃','Imitation':'🎭','Expression artistique':'🎨','Mobilier':'🪑','Puériculture':'🍼','Bureautique':'💻','Rangement':'🗂','Décoration':'🎀' };
const CAT_PROPOSITION_ICONS = {
  'Sensoriel':'👂','Manipulation':'🤲','Construction':'🧱','Motricité':'🏃',
  'Imitation':'🎭','Expression artistique':'🎨','Rangement':'🗂','Décoration':'🎀','Multi-catégories':'🧸'
};

let ARTICLES = [];       // lecture seule, chargé depuis Supabase pour les pickers
let PROPOSITIONS = [];   // table Supabase 'univers' (nom de table conservé)
let SOUSCATS = [];       // table Supabase 'souscats'

let currentCreche = 'all';
let currentPropositionCatFilter = 'all';
let editingPropositionId = null;
let editingSouscatId = null;
let notifTimer = null;

// ─── SUPABASE ─────────────────────────────────────────────────────────────
const SUPA_URL = 'https://juyrceadazrovlitxceb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug';
let SK_TOKEN = null;
function skAuthToken(){ return SK_TOKEN || SUPA_KEY; }

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

const SUPA_HEADERS = {
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
  get apikey(){ return SUPA_KEY; },
  get Authorization(){ return 'Bearer ' + skAuthToken(); },
};

const PHOTO_BUCKET = 'assets';
async function uploadPhotoToStorage(file, idHint, folder = 'propositions-photos') {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
  const path = `${folder}/${idHint}-${Date.now()}.${ext}`;
  const res = await sbFetchAuth(`${SUPA_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
    body: file,
  });
  if (!res.ok) {
    const body = await res.text().catch(()=>'');
    throw new Error(`Upload photo : ${res.status} — ${body}`);
  }
  return `${SUPA_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

function setIndicator(msg, color='var(--ink3)') {
  const el = document.getElementById('save-indicator');
  if (el) { el.textContent = msg; el.style.color = color; el.style.display = 'inline'; }
}
function setSaved() {
  const now = new Date();
  setIndicator('☁️ Sync cloud — ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}), 'var(--green)');
}

async function sbGet(table, params='') {
  let query;
  if (!params) query = 'order=id.asc';
  else if (params.includes('order=')) query = params;
  else query = params + '&order=id.asc';
  const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/${table}?${query}`, { headers: {} });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`GET ${table} : ${r.status} — ${body}`);
  }
  return r.json();
}
async function sbInsert(table, data) {
  const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const errBody = await r.text();
    console.error(`INSERT ${table} body envoyé:`, JSON.stringify(data));
    console.error(`INSERT ${table} réponse Supabase:`, errBody);
    throw new Error(`INSERT ${table} : ${r.status} — ${errBody}`);
  }
  return r.json();
}
async function sbUpdate(table, id, data) {
  const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`UPDATE ${table} : ${r.status}`);
  return r.json();
}
async function sbDelete(table, id) {
  const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: SUPA_HEADERS,
  });
  if (!r.ok) throw new Error(`DELETE ${table} : ${r.status}`);
}

function rowToArticle(r) {
  return { id: r.id, nom: r.nom, ref: r.ref, cat: r.cat, creche: r.creche,
           stock: r.stock, min: r.min, prix: parseFloat(r.prix)||0,
           fourn: r.fourn||'', notes: r.notes||'',
           photo: r.photo||null, photoName: r.photo_name||null,
           depreciable: r.depreciable !== false };
}

// ── Mapping objet JS ↔ colonnes de la table 'univers' (nom conservé en base) ──
function propositionToRow(p) {
  return {
    id: p.id, nom: p.nom, creche: p.creche, cat: p.cat,
    description: p.desc||null, conseils: p.conseils||null,
    articles: typeof p.articles === 'string' ? p.articles : JSON.stringify(p.articles||[]),
    articles_enrichissement: typeof p.articles_enrichissement === 'string' ? p.articles_enrichissement : JSON.stringify(p.articles_enrichissement||[]),
    photo: p.photo||null,
    photos: p.photos||null,
    souscat: p.souscat||null,
    created_at: p.created_at || new Date().toISOString(),
  };
}
async function savePropositionDB(p, isNew) {
  if (IS_LOCAL) return;
  try {
    const row = propositionToRow(p);
    if (isNew) await sbInsert('univers', row);
    else await sbUpdate('univers', p.id, row);
    setSaved();
  } catch(e) {
    console.error('[Supabase] Proposition save:', e);
    showNotif('⚠ Erreur Supabase : ' + e.message);
  }
}
async function deletePropositionDB(id) {
  if (IS_LOCAL) return;
  try { await sbDelete('univers', id); setSaved(); }
  catch(e) { console.error('[Supabase] Proposition delete:', e); }
}

// ── Sous-catégories (table 'souscats', schéma inchangé) ──────────────────
function rowToSouscat(r) {
  return { id: r.id, nom: r.nom, cat: r.cat || '', icon: r.icon || '', desc: r.description || '' };
}
function souscatToRow(sc) {
  return { id: sc.id, nom: sc.nom, cat: sc.cat || null, icon: sc.icon || null, description: sc.desc || null };
}
async function saveSouscatDB(sc, isNew) {
  if (IS_LOCAL) return;
  try {
    if (isNew) await sbInsert('souscats', souscatToRow(sc));
    else await sbUpdate('souscats', sc.id, souscatToRow(sc));
    setSaved();
  } catch(e) {
    console.error('[Supabase] Souscat save:', e);
    showNotif('⚠ Sous-catégorie enregistrée localement seulement : ' + e.message);
  }
}
async function deleteSouscatDB(id) {
  if (IS_LOCAL) return;
  try { await sbDelete('souscats', id); setSaved(); }
  catch(e) {
    console.error('[Supabase] Souscat delete:', e);
    showNotif('⚠ Suppression non synchronisée : ' + e.message);
  }
}

// ─── PERSISTANCE LOCALE (cache hors-ligne) ────────────────────────────────
const LS_KEY = 'ludotheque-solo-v1';

function saveData() {
  try {
    const data = { propositions: PROPOSITIONS, souscats: SOUSCATS, savedAt: new Date().toISOString() };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch(e) { console.warn('[Ludo] Sauvegarde locale impossible:', e); }
}
function loadLocalData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (Array.isArray(data.propositions)) PROPOSITIONS.splice(0, PROPOSITIONS.length, ...data.propositions);
    if (Array.isArray(data.souscats))     SOUSCATS.splice(0, SOUSCATS.length, ...data.souscats);
    return true;
  } catch(e) { console.warn('[Ludo] Chargement local impossible:', e); return false; }
}

async function loadData() {
  if (IS_LOCAL) {
    setIndicator('💻 Mode local — déployez pour activer Supabase', 'var(--ink3)');
    return false;
  }
  setIndicator('⏳ Connexion à Supabase…', 'var(--amber)');
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000));
    const [univs, souscats, arts] = await Promise.race([
      Promise.all([
        sbGet('univers', 'order=id.desc'),
        sbGet('souscats', 'order=id.asc').catch(() => []),
        sbGet('articles').catch(() => []),
      ]),
      timeout.then(() => { throw new Error('Timeout Supabase'); }),
    ]);
    if (Array.isArray(univs)) {
      const mapped = univs.map(u => ({ ...u, desc: u.desc || u.description || '' }));
      PROPOSITIONS.splice(0, PROPOSITIONS.length, ...mapped);
    }
    if (Array.isArray(souscats)) SOUSCATS.splice(0, SOUSCATS.length, ...souscats.map(rowToSouscat));
    if (Array.isArray(arts) && arts.length > 0) ARTICLES.splice(0, ARTICLES.length, ...arts.map(rowToArticle));
    saveData();
    setSaved();
    return true;
  } catch(e) {
    setIndicator('⚠️ Hors ligne — données locales', 'var(--amber)');
    console.error('[Supabase] Erreur chargement :', e);
    return false;
  }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────
function showNotif(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 6000);
}

// ─── CRÈCHE FILTER ────────────────────────────────────────────────────────
function filterCreche(creche) {
  currentCreche = creche;
  renderPropositions();
}

// ─── ONGLET INTERNE ───────────────────────────────────────────────────────
function showLudoTab(tab, btn) {
  ['propositions','souscats'].forEach(t => {
    const el = document.getElementById('ltab-content-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.ludo-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'souscats') renderSouscats();
  if (tab === 'propositions') renderPropositions();
}

// ─── MODALS ───────────────────────────────────────────────────────────────
function openModal(type) {
  if (type === 'proposition') { openModal_proposition(); return; }
  if (type === 'souscat') { openModal_souscat(); return; }
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
const MODALS_SANS_FERMETURE_EXTERIEURE = ['modal-proposition', 'modal-souscat'];
function closeModalClick(e, id) {
  if (MODALS_SANS_FERMETURE_EXTERIEURE.includes(id)) return;
  if (e.target.classList.contains('modal-overlay')) closeModal(id);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => { m.classList.remove('open'); document.body.style.overflow = ''; }); });

// ─── PROPOSITIONS ─────────────────────────────────────────────────────────

function renderPropositions() {
  const list = document.getElementById('proposition-list');
  if (!list) return;
  let data = PROPOSITIONS;
  if (currentCreche !== 'all') data = data.filter(p => p.creche === currentCreche);
  if (currentPropositionCatFilter !== 'all') {
    if (currentPropositionCatFilter.startsWith('subcat:')) {
      const scId = parseInt(currentPropositionCatFilter.split(':')[1]);
      data = data.filter(p => p.souscat === scId || p.souscat === String(scId));
    } else {
      data = data.filter(p => p.cat === currentPropositionCatFilter);
    }
  }

  if (data.length === 0) {
    list.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink3)">
      <div style="font-size:48px;margin-bottom:12px">🧸</div>
      <div style="font-weight:600;font-size:16px;margin-bottom:8px">Aucune proposition créée</div>
      <div style="font-size:13px">Cliquez sur "+ Créer une proposition" pour commencer</div>
    </div>`;
    return;
  }

  list.innerHTML = data.map(p => {
    const artIds = typeof p.articles === 'string' ? JSON.parse(p.articles||'[]') : (p.articles||[]);
    const crecheColor = CRECHE_COLORS[p.creche] || '#888';
    const articleNames = artIds
      .map(id => ARTICLES.find(a => a.id === id))
      .filter(Boolean)
      .map(a => a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim());
    const icon = CAT_PROPOSITION_ICONS[p.cat] || '🧸';
    const tags = articleNames.slice(0, 4).map(n =>
      `<span class="proposition-article-tag">${n}</span>`).join('') +
      (articleNames.length > 4 ? `<span class="proposition-article-tag">+${articleNames.length-4}</span>` : '');

    let allPhotos = [];
    if (p.photos) { try { allPhotos = JSON.parse(p.photos); } catch { allPhotos = [p.photos]; } }
    else if (p.photo) { allPhotos = [p.photo]; }
    const galleryId = 'gal-' + p.id;
    const cardPhotoStr = allPhotos.length === 0 ? '' :
      allPhotos.length === 1
        ? `<div class="proposition-card-gallery single" id="${galleryId}"><img src="${allPhotos[0]}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
        : `<div class="proposition-card-gallery multi" id="${galleryId}" onscroll="updateGalleryDots('${galleryId}',${allPhotos.length})">
            ${allPhotos.map(url => `<img src="${url}" loading="lazy" onerror="this.style.display='none'">`).join('')}
           </div>
           <div class="proposition-gallery-dots" id="dots-${galleryId}">
             ${allPhotos.map((_, i) => `<span class="${i===0?'active':''}"></span>`).join('')}
           </div>`;
    return `<div class="proposition-card" onclick="showPropositionDetail('${p.id}')">${cardPhotoStr}
      <div class="proposition-card-header">
        <span class="proposition-icon">${icon}</span>
        <div style="flex:1">
          <div class="proposition-card-title">${p.nom}</div>
          <div class="proposition-card-meta">
            <span style="background:${crecheColor}22;color:${crecheColor};padding:1px 6px;border-radius:10px;font-size:10px">● ${p.creche||'—'}</span>
            <span style="background:var(--accent-lt);color:var(--accent);padding:1px 6px;border-radius:10px;font-size:10px">${p.cat}</span>
          </div>
        </div>
      </div>
      ${p.desc ? `<div class="proposition-card-desc">${p.desc}</div>` : ''}
      <div class="proposition-articles">${tags}</div>
      <div class="proposition-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editProposition('${p.id}')">✏️ Modifier</button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();printProposition('${p.id}')">🖨 Fiche PDF</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteProposition('${p.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function updateGalleryDots(galleryId, total) {
  const el = document.getElementById(galleryId);
  const dots = document.getElementById('dots-' + galleryId);
  if (!el || !dots) return;
  const idx = Math.round(el.scrollLeft / el.offsetWidth * (total-1));
  dots.querySelectorAll('span').forEach((s, i) => s.classList.toggle('active', i === idx));
}
function scrollCarousel(pid, dir) {
  const track = document.getElementById('ctrack-' + pid);
  if (!track) return;
  track.scrollBy({ left: dir * track.offsetWidth, behavior: 'smooth' });
}
function goCarousel(pid, idx) {
  const track = document.getElementById('ctrack-' + pid);
  if (!track) return;
  track.scrollTo({ left: idx * track.offsetWidth, behavior: 'smooth' });
}
function updateCarouselDots(pid, total) {
  const track = document.getElementById('ctrack-' + pid);
  const dots  = document.getElementById('cdots-' + pid);
  if (!track || !dots) return;
  const idx = Math.round(track.scrollLeft / track.offsetWidth);
  dots.querySelectorAll('span').forEach((s, i) => s.classList.toggle('active', i === idx));
}

function filterPropositions(cat, el) {
  currentPropositionCatFilter = cat;
  document.querySelectorAll('#proposition-cat-filters .filter-chip').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderPropositions();
}
function filterPropositionSubcat(id, el) {
  currentPropositionCatFilter = 'subcat:' + id;
  document.querySelectorAll('#proposition-cat-filters .filter-chip, #proposition-subcat-filters .filter-chip')
    .forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderPropositions();
}

// ─── PHOTOS MULTIPLES ─────────────────────────────────────────────────────
let _propositionPhotos = []; // [{url, file, local}]

function _renderPropositionPhotosPreview() {
  const container = document.getElementById('p-photos-preview');
  if (!container) return;
  if (_propositionPhotos.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = _propositionPhotos.map((p, i) => `
    <div style="position:relative;flex-shrink:0">
      <img src="${p.url}" alt="Photo ${i+1}"
        style="width:90px;height:70px;object-fit:contain;background:var(--bg);border-radius:8px;border:2px solid var(--border);display:block">
      ${p.local ? '<div style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.55);color:#fff;font-size:9px;padding:1px 4px;border-radius:4px">⏳</div>' : ''}
      <button onclick="removePropositionPhoto(${i})"
        style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--red);color:#fff;border:none;cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center">✕</button>
    </div>`).join('');
}
function addPropositionPhotos(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  files.forEach(file => {
    if (!file.type.startsWith('image/')) { showNotif('⚠ Format non supporté : ' + file.name); return; }
    if (file.size > 10 * 1024 * 1024) { showNotif('⚠ Photo trop grande (max 10 Mo) : ' + file.name); return; }
    const blobUrl = URL.createObjectURL(file);
    _propositionPhotos.push({ url: blobUrl, file, local: true });
  });
  event.target.value = '';
  _renderPropositionPhotosPreview();
}
function removePropositionPhoto(i) {
  const p = _propositionPhotos[i];
  if (p && p.local && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  _propositionPhotos.splice(i, 1);
  _renderPropositionPhotosPreview();
}
async function uploadPendingPropositionPhotos(propositionId) {
  for (let i = 0; i < _propositionPhotos.length; i++) {
    const p = _propositionPhotos[i];
    if (!p.local || !p.file) continue;
    try {
      const url = await uploadPhotoToStorage(p.file, `${propositionId}-${i}`, 'propositions-photos');
      if (p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
      _propositionPhotos[i] = { url, local: false };
    } catch(e) {
      console.error('[Photo proposition upload]', e);
      showNotif('⚠ Erreur upload photo ' + (i+1) + ' — conservée en local');
    }
  }
}
function getPropositionPhotosUrls() {
  return _propositionPhotos.filter(p => !p.local).map(p => p.url);
}
function resetPropositionPhotoUI(photosData) {
  _propositionPhotos.forEach(p => { if (p.local && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url); });
  _propositionPhotos = [];
  if (photosData) {
    let urls = [];
    try { urls = JSON.parse(photosData); if (!Array.isArray(urls)) urls = [photosData]; }
    catch { urls = photosData ? [photosData] : []; }
    urls.filter(Boolean).forEach(url => _propositionPhotos.push({ url, local: false }));
  }
  _renderPropositionPhotosPreview();
}

// ─── PICKERS ARTICLES (lecture seule) ─────────────────────────────────────
function _buildPickerHTML(creche, selectedIds, prefix) {
  if (ARTICLES.length === 0) return '<div style="padding:12px;color:var(--ink3);font-size:13px">Aucun article dans l\'inventaire</div>';
  const articlesSource = (creche && creche !== 'all') ? ARTICLES.filter(a => a.creche === creche) : ARTICLES;
  if (articlesSource.length === 0) return `<div style="padding:12px;color:var(--ink3);font-size:13px">Aucun article pour la crèche "${creche}"</div>`;

  function buildList(articles) {
    if (articles.length === 0) return '<div style="padding:12px;color:var(--ink3);font-size:13px">Aucun article dans cette catégorie</div>';
    const byCat = {};
    articles.forEach(a => { if (!byCat[a.cat]) byCat[a.cat] = []; byCat[a.cat].push(a); });
    return Object.entries(byCat).map(([cat, arts]) => `
      <div style="background:var(--bg);padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.5px;color:var(--ink3);text-transform:uppercase;position:sticky;top:0">
        ${CAT_ICONS[cat]||'📦'} ${cat}
      </div>
      ${arts.map(a => {
        const nom = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
        const checked = selectedIds.includes(a.id) ? 'checked' : '';
        return `<div class="article-picker-row" onclick="document.getElementById('${prefix}${a.id}').click()">
          <input type="checkbox" id="${prefix}${a.id}" ${checked} onclick="event.stopPropagation()">
          <div class="article-picker-label">${nom}</div>
          <span class="article-picker-cat">${a.stock} en stock</span>
        </div>`;
      }).join('')}
    `).join('');
  }

  const materiel = articlesSource.filter(a => a.depreciable !== false);
  const conso    = articlesSource.filter(a => a.depreciable === false);
  const tabMat = `${prefix}tab-mat`;
  const tabCon = `${prefix}tab-conso`;
  const listMat = `${prefix}list-mat`;
  const listCon = `${prefix}list-conso`;

  return `
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface)">
      <button id="${tabMat}" onclick="switchPickerTab('${prefix}')"
        style="flex:1;padding:8px;border:none;background:none;font-family:'Instrument Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid var(--accent);color:var(--accent)">
        🧸 Matériel (${materiel.length})
      </button>
      <button id="${tabCon}" onclick="switchPickerTab('${prefix}','conso')"
        style="flex:1;padding:8px;border:none;background:none;font-family:'Instrument Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--ink3)">
        🧴 Consommables (${conso.length})
      </button>
    </div>
    <div id="${listMat}">${buildList(materiel)}</div>
    <div id="${listCon}" style="display:none">${buildList(conso)}</div>
  `;
}
function buildArticlePicker(creche, selectedIds = []) {
  const picker = document.getElementById('p-articles-picker');
  if (picker) picker.innerHTML = _buildPickerHTML(creche, selectedIds, 'pick-');
}
function buildEnrichissementPicker(creche, selectedIds = []) {
  const picker = document.getElementById('p-articles-enrichissement-picker');
  if (picker) picker.innerHTML = _buildPickerHTML(creche, selectedIds, 'enrich-');
}
function switchPickerTab(prefix, tab) {
  const isMat = !tab || tab === 'mat';
  const tMat = document.getElementById(`${prefix}tab-mat`);
  const tCon = document.getElementById(`${prefix}tab-conso`);
  const lMat = document.getElementById(`${prefix}list-mat`);
  const lCon = document.getElementById(`${prefix}list-conso`);
  if (tMat) { tMat.style.borderBottomColor = isMat ? 'var(--accent)' : 'transparent'; tMat.style.color = isMat ? 'var(--accent)' : 'var(--ink3)'; }
  if (tCon) { tCon.style.borderBottomColor = !isMat ? 'var(--accent)' : 'transparent'; tCon.style.color = !isMat ? 'var(--accent)' : 'var(--ink3)'; }
  if (lMat) lMat.style.display = isMat ? 'block' : 'none';
  if (lCon) lCon.style.display = !isMat ? 'block' : 'none';
}
function getSelectedArticleIds() {
  return ARTICLES.filter(a => document.getElementById(`pick-${a.id}`)?.checked).map(a => a.id);
}
function getSelectedEnrichissementIds() {
  return ARTICLES.filter(a => document.getElementById(`enrich-${a.id}`)?.checked).map(a => a.id);
}

// ─── CRUD PROPOSITION ─────────────────────────────────────────────────────
function openModal_proposition() {
  editingPropositionId = null;
  document.getElementById('modalPropositionTitle').textContent = 'Créer une proposition';
  document.getElementById('btn-save-proposition').textContent = '✨ Enregistrer la proposition';
  ['p-nom','p-desc','p-conseils'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const photosPreview = document.getElementById('p-photos-preview');
  if (photosPreview) photosPreview.innerHTML = '';
  const catSel = document.getElementById('p-cat');
  if (catSel) catSel.value = 'Sensoriel';
  const crecheEl = document.getElementById('p-creche');
  if (crecheEl) {
    crecheEl.value = (currentCreche && currentCreche !== 'all') ? currentCreche : (SK_WRITE_CRECHE || CRECHES[0]);
    crecheEl.onchange = () => {
      buildArticlePicker(crecheEl.value, []);
      buildEnrichissementPicker(crecheEl.value, []);
    };
  }
  updateSouscatSelectors();
  const creche = (crecheEl?.value) || SK_WRITE_CRECHE || CRECHES[0];
  buildArticlePicker(creche, []);
  buildEnrichissementPicker(creche, []);
  document.getElementById('modal-proposition').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

async function saveProposition() {
  const nom = document.getElementById('p-nom').value.trim();
  if (!nom) { showNotif('⚠ Nom obligatoire'); return; }

  const propositionId = editingPropositionId || Date.now();

  const hasLocal = _propositionPhotos.some(p => p.local);
  if (hasLocal) showNotif('📤 Envoi des photos…');
  if (!IS_LOCAL) await uploadPendingPropositionPhotos(propositionId);

  const photosUrls = getPropositionPhotosUrls();
  const photoUrl = photosUrls[0] || null;
  const photosJson = photosUrls.length > 0 ? JSON.stringify(photosUrls) : null;

  const creche = document.getElementById('p-creche')?.value || SK_WRITE_CRECHE || CRECHES[0];
  const data = {
    nom,
    creche,
    cat:                     document.getElementById('p-cat').value,
    desc:                    document.getElementById('p-desc').value.trim(),
    conseils:                document.getElementById('p-conseils').value.trim(),
    articles:                JSON.stringify(getSelectedArticleIds()),
    articles_enrichissement: JSON.stringify(getSelectedEnrichissementIds()),
    souscat:                 parseInt(document.getElementById('p-souscat')?.value) || null,
    photo:                   photoUrl,
    photos:                  photosJson,
    created_at:              new Date().toISOString(),
  };

  if (editingPropositionId) {
    const idx = PROPOSITIONS.findIndex(p => p.id === editingPropositionId);
    if (idx >= 0) {
      PROPOSITIONS[idx] = { ...PROPOSITIONS[idx], ...data };
      if (!IS_LOCAL) await savePropositionDB(PROPOSITIONS[idx], false).catch(e => console.warn(e));
    }
    showNotif('✅ Proposition mise à jour');
  } else {
    const newP = { id: propositionId, ...data };
    PROPOSITIONS.unshift(newP);
    if (!IS_LOCAL) await savePropositionDB(newP, true).catch(e => console.warn(e));
    showNotif('✨ Proposition créée !');
  }
  saveData();
  closeModal('modal-proposition');
  renderPropositions();
}

function editProposition(id) {
  const p = PROPOSITIONS.find(x => x.id === id);
  if (!p) return;
  editingPropositionId = id;
  document.getElementById('modalPropositionTitle').textContent = 'Modifier la proposition';
  document.getElementById('btn-save-proposition').textContent = '💾 Mettre à jour';
  document.getElementById('p-nom').value      = p.nom;
  document.getElementById('p-cat').value      = p.cat;
  document.getElementById('p-desc').value     = p.desc || '';
  document.getElementById('p-conseils').value = p.conseils || '';
  updateSouscatSelectors();
  const scEl = document.getElementById('p-souscat'); if (scEl) scEl.value = p.souscat || '';
  const selIds = typeof p.articles === 'string' ? JSON.parse(p.articles||'[]') : (p.articles||[]);
  const enrichIds = typeof p.articles_enrichissement === 'string' ? JSON.parse(p.articles_enrichissement||'[]') : (p.articles_enrichissement||[]);
  const creche2 = p.creche || CRECHES[0];
  const crecheEl2 = document.getElementById('p-creche');
  if (crecheEl2) {
    crecheEl2.value = creche2;
    crecheEl2.onchange = () => {
      buildArticlePicker(crecheEl2.value, []);
      buildEnrichissementPicker(crecheEl2.value, []);
    };
  }
  buildArticlePicker(creche2, selIds);
  buildEnrichissementPicker(creche2, enrichIds);
  resetPropositionPhotoUI(p.photos || p.photo || null);
  document.getElementById('modal-proposition').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function deleteProposition(id) {
  const p = PROPOSITIONS.find(x => x.id === id);
  if (!p || !confirm(`Supprimer "${p.nom}" ?`)) return;
  PROPOSITIONS = PROPOSITIONS.filter(x => x.id !== id);
  saveData();
  renderPropositions();
  showNotif('🗑 Proposition supprimée');
  if (!IS_LOCAL) deletePropositionDB(id).catch(e => {
    console.error('[Supabase] deleteProposition:', e);
    showNotif('⚠ Supprimé localement mais erreur Supabase — rechargez pour vérifier');
  });
}

function showPropositionDetail(id) {
  const p = PROPOSITIONS.find(x => x.id === id);
  if (!p) return;
  const icon = CAT_PROPOSITION_ICONS[p.cat] || '🧸';
  const artIds = typeof p.articles === 'string' ? JSON.parse(p.articles||'[]') : (p.articles||[]);
  const arts = artIds.map(aid => ARTICLES.find(a => a.id === aid)).filter(Boolean);

  let photosUrls = [];
  if (p.photos) { try { photosUrls = JSON.parse(p.photos); } catch { photosUrls = [p.photos]; } }
  else if (p.photo) { photosUrls = [p.photo]; }

  const enrichIds = typeof p.articles_enrichissement === 'string' ? JSON.parse(p.articles_enrichissement||'[]') : (p.articles_enrichissement||[]);
  const enrichArts = enrichIds.map(aid => ARTICLES.find(a => a.id === aid)).filter(Boolean);

  function articleRow(a) {
    const nom = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
    const stockOk = a.stock > 0;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      ${a.photo ? `<img src="${a.photo}" style="width:36px;height:36px;border-radius:6px;object-fit:contain;background:var(--bg)">` :
        `<div style="width:36px;height:36px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px">${CAT_ICONS[a.cat]||'📦'}</div>`}
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${nom}</div>
        <div style="font-size:11px;color:var(--ink3)">${a.cat} · ${a.fourn||'—'}</div>
      </div>
      <span style="font-size:11px;font-weight:600;color:${stockOk?'var(--green)':'var(--red)'}">
        ${stockOk ? `✅ ${a.stock} dispo` : '❌ Rupture'}
      </span>
    </div>`;
  }

  document.getElementById('detail-proposition-title').textContent = p.nom;
  document.getElementById('detail-proposition-body').innerHTML = `
    ${photosUrls.length > 0 ? `
      <div class="proposition-carousel" id="carousel-${p.id}">
        <div class="proposition-carousel-track" id="ctrack-${p.id}" onscroll="updateCarouselDots('${p.id}',${photosUrls.length})">
          ${photosUrls.map((url, i) => `<img src="${url}" alt="Photo ${i+1}" loading="lazy" onerror="this.style.display='none'">`).join('')}
        </div>
        ${photosUrls.length > 1 ? `
          <button class="proposition-carousel-btn prev" onclick="event.stopPropagation();scrollCarousel('${p.id}',-1)">&#8249;</button>
          <button class="proposition-carousel-btn next" onclick="event.stopPropagation();scrollCarousel('${p.id}',1)">&#8250;</button>
          <div class="proposition-carousel-dots" id="cdots-${p.id}">
            ${photosUrls.map((_, i) => `<span class="${i===0?'active':''}" onclick="event.stopPropagation();goCarousel('${p.id}',${i})"></span>`).join('')}
          </div>` : ''}
      </div>` : ''}
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <span style="font-size:48px">${icon}</span>
      <div style="margin-top:6px;font-size:12px;color:var(--ink3)">${p.cat}</div>
    </div>
    ${p.desc ? `<div style="background:var(--bg);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.6;color:var(--ink)"><strong>🎯 Objectifs :</strong><br>${p.desc}</div>` : ''}
    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">🧸 Matériel principal (${arts.length} article${arts.length>1?'s':''})</div>
      ${arts.length === 0 ? '<div style="color:var(--ink3);font-size:13px">Aucun article sélectionné</div>' : arts.map(articleRow).join('')}
    </div>
    ${enrichArts.length > 0 ? `
    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--accent)">✨ Enrichissement (${enrichArts.length} article${enrichArts.length>1?'s':''})</div>
      ${enrichArts.map(articleRow).join('')}
    </div>` : ''}
    ${p.conseils ? `<div style="background:#FEF9C3;border:1px solid #FDE68A;border-radius:8px;padding:14px;font-size:13px;line-height:1.6"><strong>💡 Mise en scène :</strong><br>${p.conseils}</div>` : ''}
  `;
  document.getElementById('detail-proposition-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('modal-proposition-detail')">Fermer</button>
    <button class="btn btn-secondary" onclick="closeModal('modal-proposition-detail');editProposition('${p.id}')">✏️ Modifier</button>
    <button class="btn btn-primary" onclick="printProposition('${p.id}')">🖨 Fiche PDF</button>
  `;
  document.getElementById('modal-proposition-detail').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function printProposition(id) {
  const p = PROPOSITIONS.find(x => x.id === id);
  if (!p) return;
  const icon = CAT_PROPOSITION_ICONS[p.cat] || '🧸';
  const artIds = typeof p.articles === 'string' ? JSON.parse(p.articles||'[]') : (p.articles||[]);
  const arts = artIds.map(aid => ARTICLES.find(a => a.id === aid)).filter(Boolean);
  const enrichIds = typeof p.articles_enrichissement === 'string' ? JSON.parse(p.articles_enrichissement||'[]') : (p.articles_enrichissement||[]);
  const enrichArts = enrichIds.map(aid => ARTICLES.find(a => a.id === aid)).filter(Boolean);

  let pdfPhotos = [];
  if (p.photos) { try { pdfPhotos = JSON.parse(p.photos); } catch { pdfPhotos = [p.photos]; } }
  else if (p.photo) { pdfPhotos = [p.photo]; }
  pdfPhotos = pdfPhotos.filter(Boolean);

  function articleRows(list) {
    return list.map(a => {
      const n = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #E7E5E0">${n}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E7E5E0;text-align:center">${a.cat}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E7E5E0;text-align:center;font-weight:600;color:${a.stock>0?'#16A34A':'#DC2626'}">${a.stock > 0 ? a.stock + ' dispo' : 'Rupture'}</td>
      </tr>`;
    }).join('');
  }
  const rowsHTML = articleRows(arts);
  const enrichRowsHTML = articleRows(enrichArts);

  const html = `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>Fiche proposition — ${p.nom}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Arial,sans-serif; font-size:14px; color:#111; padding:28px; max-width:800px; margin:0 auto; }
      .header { border-bottom:3px solid #1C1917; padding-bottom:16px; margin-bottom:20px; }
      .title { font-size:26px; font-weight:bold; margin-bottom:6px; }
      .meta { display:flex; gap:20px; flex-wrap:wrap; font-size:13px; color:#555; }
      .meta span { background:#F5F5F4; padding:3px 10px; border-radius:20px; }
      .section { margin-bottom:20px; }
      .section h3 { font-size:14px; font-weight:700; margin-bottom:10px; color:#444; text-transform:uppercase; letter-spacing:0.5px; }
      .desc-box { background:#F5F5F4; border-radius:8px; padding:14px; font-size:13px; line-height:1.7; }
      table { width:100%; border-collapse:collapse; }
      thead tr { background:#1C1917; color:white; }
      th { padding:9px 10px; font-size:12px; text-align:left; }
      .conseils-box { background:#FEF9C3; border:1px solid #FDE68A; border-radius:8px; padding:14px; font-size:13px; line-height:1.7; }
      .footer { margin-top:30px; font-size:10px; color:#999; border-top:1px solid #E7E5E0; padding-top:12px; }
      @media print { @page { margin:1.5cm; } body { padding:0; } }
    </style>
    </head><body>
    <div class="header">
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div class="title">${icon} ${p.nom}</div>
          <div class="meta" style="margin-top:8px">
            <span>📂 ${p.cat}</span>
            <span>🏠 ${p.creche||'—'}</span>
          </div>
        </div>
      </div>
    </div>
    ${pdfPhotos.length > 0 ? `<div class="section">
      <h3>📷 Photos</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
        ${pdfPhotos.map((url,i) => `<div style="height:150px;border-radius:8px;overflow:hidden;border:1px solid #E7E5E0"><img src="${url}" alt="Photo ${i+1}" style="width:100%;height:100%;object-fit:contain;background:#F5F5F4" crossorigin="anonymous"></div>`).join('')}
      </div></div>` : ''}
    ${p.desc ? `<div class="section"><h3>🎯 Objectifs pédagogiques</h3><div class="desc-box">${p.desc}</div></div>` : ''}
    <div class="section">
      <h3>🧸 Matériel principal (${arts.length} article${arts.length>1?'s':''})</h3>
      <table><thead><tr>
        <th>Article</th><th style="text-align:center;width:140px">Catégorie</th><th style="text-align:center;width:100px">Disponibilité</th>
      </tr></thead>
      <tbody>${rowsHTML}</tbody></table>
    </div>
    ${enrichArts.length > 0 ? `<div class="section">
      <h3>✨ Enrichissement (${enrichArts.length} article${enrichArts.length>1?'s':''})</h3>
      <table><thead><tr>
        <th>Article</th><th style="text-align:center;width:140px">Catégorie</th><th style="text-align:center;width:100px">Disponibilité</th>
      </tr></thead>
      <tbody>${enrichRowsHTML}</tbody></table>
    </div>` : ''}
    ${p.conseils ? `<div class="section"><h3>💡 Mise en scène</h3><div class="conseils-box">${p.conseils}</div></div>` : ''}
    <div class="footer">Fiche générée le ${new Date().toLocaleDateString('fr-FR')} — Ludothèque Koalakids</div>
    </body></html>`;

  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) showNotif('⚠ Autorisez les popups pour générer la fiche');
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── SOUS-CATÉGORIES ─────────────────────────────────────────────────────
function renderSouscats() {
  const list = document.getElementById('souscats-list');
  if (!list) return;

  if (SOUSCATS.length === 0) {
    list.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink3)">
      <div style="font-size:36px;margin-bottom:8px">🏷</div>
      <div style="font-weight:600;margin-bottom:6px">Aucune sous-catégorie</div>
      <div style="font-size:13px">Cliquez sur "+ Créer" pour commencer</div>
    </div>`;
    return;
  }

  list.innerHTML = SOUSCATS.map(sc => {
    const nbPropositions = PROPOSITIONS.filter(p => p.souscat === sc.id || p.souscat === String(sc.id)).length;
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;display:flex;gap:14px;align-items:center">
      <div style="font-size:32px;flex-shrink:0">${sc.icon || '🏷'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;margin-bottom:2px">${sc.nom}</div>
        ${sc.cat ? `<div style="font-size:11px;color:var(--accent);margin-bottom:4px">${sc.cat}</div>` : ''}
        ${sc.desc ? `<div style="font-size:12px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sc.desc}</div>` : ''}
        <div style="font-size:11px;color:var(--ink3);margin-top:4px">${nbPropositions} proposition${nbPropositions>1?'s':''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" onclick="editSouscat(${sc.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSouscat(${sc.id})">🗑</button>
      </div>
    </div>`;
  }).join('');

  updateSouscatFilters();
  updateSouscatSelectors();
}
function updateSouscatFilters() {
  const container = document.getElementById('proposition-subcat-filters');
  if (!container) return;
  container.innerHTML = SOUSCATS.map(sc =>
    `<div class="filter-chip" onclick="filterPropositionSubcat(${sc.id}, this)">${sc.icon||'🏷'} ${sc.nom}</div>`
  ).join('');
}
function updateSouscatSelectors() {
  const sel = document.getElementById('p-souscat');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Aucune —</option>' +
    SOUSCATS.map(sc => `<option value="${sc.id}">${sc.icon||''} ${sc.nom}${sc.cat?' ('+sc.cat+')':''}</option>`).join('');
  if (current) sel.value = current;
}

function openModal_souscat() {
  editingSouscatId = null;
  document.getElementById('modalSouscatTitle').textContent = 'Créer une sous-catégorie';
  document.getElementById('btn-save-souscat').textContent = '💾 Enregistrer';
  ['sc-nom','sc-icon','sc-desc'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const catEl = document.getElementById('sc-cat'); if (catEl) catEl.value = '';
  document.getElementById('modal-souscat').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}
function saveSouscat() {
  const nom = document.getElementById('sc-nom').value.trim();
  if (!nom) { showNotif('⚠ Nom obligatoire'); return; }
  const data = {
    nom,
    cat:  document.getElementById('sc-cat').value,
    icon: document.getElementById('sc-icon').value.trim(),
    desc: document.getElementById('sc-desc').value.trim(),
  };
  if (editingSouscatId) {
    const idx = SOUSCATS.findIndex(s => s.id === editingSouscatId);
    if (idx >= 0) { SOUSCATS[idx] = { ...SOUSCATS[idx], ...data }; saveSouscatDB(SOUSCATS[idx], false); }
    showNotif('✅ Sous-catégorie mise à jour');
  } else {
    const sc = { id: Date.now(), ...data };
    SOUSCATS.push(sc);
    saveSouscatDB(sc, true);
    showNotif('✅ Sous-catégorie créée');
  }
  saveData();
  closeModal('modal-souscat');
  renderSouscats();
}
function editSouscat(id) {
  const sc = SOUSCATS.find(x => x.id === id); if (!sc) return;
  editingSouscatId = id;
  document.getElementById('modalSouscatTitle').textContent = 'Modifier la sous-catégorie';
  document.getElementById('btn-save-souscat').textContent = '💾 Mettre à jour';
  document.getElementById('sc-nom').value  = sc.nom;
  document.getElementById('sc-cat').value  = sc.cat || '';
  document.getElementById('sc-icon').value = sc.icon || '';
  document.getElementById('sc-desc').value = sc.desc || '';
  document.getElementById('modal-souscat').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}
function deleteSouscat(id) {
  const sc = SOUSCATS.find(x => x.id === id); if (!sc) return;
  const nb = PROPOSITIONS.filter(p => p.souscat === id || p.souscat === String(id)).length;
  const msg = nb > 0
    ? `Supprimer "${sc.nom}" ?\n\n⚠ ${nb} proposition(s) utilisent cette sous-catégorie.`
    : `Supprimer "${sc.nom}" ?`;
  if (!confirm(msg)) return;
  SOUSCATS = SOUSCATS.filter(x => x.id !== id);
  deleteSouscatDB(id);
  saveData();
  renderSouscats();
  showNotif('🗑 Sous-catégorie supprimée');
}

// ─── AUTHENTIFICATION (comptes stock pédagogique, réutilisés) ────────────
const SK_ROLES_OK = ['direction', 'referent', 'employe'];
// Rempli par loadCreches() une fois connecté — id (uuid) -> nom de la crèche.
let SK_CRECHE_NAMES = {};

// creches.name porte la raison sociale complète ("Koalakids Toulon Brunet") ;
// les articles/propositions déjà en base référencent le libellé court
// ("Brunet"). Tant que la table n'a pas de colonne dédiée à ce libellé, on le
// dérive en retirant les préfixes d'enseigne/ville — ce qui reproduit
// exactement les libellés historiques Koala Kids. Une organisation dont les
// noms ne suivent pas ce schéma affichera son nom complet, ce qui reste correct.
function shortCrecheName(nom) {
  return String(nom || '').replace(/^Koalakids\s+/i, '').replace(/^Toulon\s+/i, '').trim() || nom;
}

/** Charge les crèches de l'organisation connectée (RLS: creches_select filtre
 *  déjà par org_id = kk_mon_org()) et reconstruit CRECHES, CRECHE_COLORS,
 *  SK_CRECHE_NAMES ainsi que les <select> de crèche en dur dans le HTML. */
async function loadCreches() {
  try {
    const rows = await sbGet('creches', 'select=id,name');
    if (!Array.isArray(rows) || !rows.length) return;
    const noms = rows.map(r => shortCrecheName(r.name));
    CRECHES = noms;
    CRECHE_COLORS = {};
    SK_CRECHE_NAMES = {};
    rows.forEach((r, i) => {
      const nom = shortCrecheName(r.name);
      CRECHE_COLORS[nom] = CRECHE_PALETTE[i % CRECHE_PALETTE.length];
      SK_CRECHE_NAMES[r.id] = nom;
    });
    const optionsHtml = noms.map(n => `<option>${n}</option>`).join('');
    const filterSel = document.getElementById('creche-filter');
    if (filterSel) filterSel.innerHTML = '<option value="all">Toutes les crèches</option>' + optionsHtml;
    const pCrecheSel = document.getElementById('p-creche');
    if (pCrecheSel) pCrecheSel.innerHTML = optionsHtml;
  } catch (e) {
    console.warn('[Ludo] loadCreches — repli sur la liste par défaut :', e);
  }
}
let SK_LOCKED_CRECHE = null;
let SK_WRITE_CRECHE = null;
function skCanWrite(crecheNom) {
  if (!SK_WRITE_CRECHE) return true;
  if (crecheNom === SK_WRITE_CRECHE) return true;
  showNotif('⚠ Modification reservee a ' + SK_WRITE_CRECHE);
  return false;
}
let SK_USER = null, SK_PROFILE = null, SK_REFRESH = null, SK_REFRESH_TIMER = null;

function skTogglePwd() {
  const i = document.getElementById('sk-login-pwd');
  i.type = (i.type === 'password') ? 'text' : 'password';
}
function skLoginError(msg) {
  const e = document.getElementById('sk-login-err');
  e.textContent = msg; e.style.display = 'block';
  const b = document.getElementById('sk-login-btn');
  b.disabled = false; b.textContent = 'Se connecter';
}

async function skDoLogin() {
  const email = document.getElementById('sk-login-email').value.trim();
  const pwd = document.getElementById('sk-login-pwd').value;
  const btn = document.getElementById('sk-login-btn');
  document.getElementById('sk-login-err').style.display = 'none';
  if (!email || !pwd) { skLoginError('Email et mot de passe requis.'); return; }
  btn.disabled = true; btn.textContent = 'Connexion...';

  let session;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email, password: pwd }),
    });
    session = await r.json();
    if (!r.ok || !session.access_token) {
      const m = (session && (session.error_description || session.msg || session.message)) || '';
      skLoginError(m.toLowerCase().includes('confirm')
        ? 'Compte non confirme — contactez la direction.'
        : 'Identifiants incorrects.');
      return;
    }
  } catch (e) {
    skLoginError('Erreur reseau. Reessayez.');
    return;
  }

  try {
    const uid = session.user && session.user.id;
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/referents?user_id=eq.${uid}&select=id,name,role,creche_id`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + session.access_token } }
    );
    const rows = await pr.json();
    SK_PROFILE = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!SK_PROFILE || SK_ROLES_OK.indexOf(SK_PROFILE.role) === -1) {
      skLoginError('Acces non autorise pour ce compte.');
      return;
    }
  } catch (e) {
    skLoginError('Profil introuvable. Contactez la direction.');
    return;
  }

  SK_TOKEN = session.access_token;
  SK_REFRESH = session.refresh_token || null;
  SK_USER = session.user;
  skScheduleRefresh(session.expires_in);

  const ov = document.getElementById('sk-login-overlay');
  if (ov) ov.remove();
  document.body.classList.remove('sk-locked');

  const nameEl = document.getElementById('sk-user-name');
  if (nameEl) nameEl.textContent = (SK_PROFILE && SK_PROFILE.name) || (SK_USER && SK_USER.email) || '';

  await loadCreches();
  skApplyCrecheLock();
  skRestrictCrecheSelects();
  skBootApp();
}

function skApplyCrecheLock() {
  if (!SK_PROFILE) return;
  if (SK_PROFILE.role === 'referent') {
    const n = SK_CRECHE_NAMES[SK_PROFILE.creche_id];
    if (n) SK_WRITE_CRECHE = n;
    else console.warn('[Auth] creche_id inconnu pour la referente :', SK_PROFILE.creche_id);
    return;
  }
  if (SK_PROFILE.role !== 'employe') return;
  const nom = SK_CRECHE_NAMES[SK_PROFILE.creche_id];
  if (!nom) { console.warn('[Auth] creche_id inconnu, verrouillage ignore :', SK_PROFILE.creche_id); return; }
  SK_LOCKED_CRECHE = nom;
  SK_WRITE_CRECHE = nom;
  currentCreche = nom;
  const sel = document.getElementById('creche-filter');
  if (sel) {
    Array.from(sel.options).forEach(o => { if (o.value === 'all' || (o.textContent.trim() !== nom)) o.remove(); });
    sel.value = nom;
    sel.disabled = true;
  }
  const nameEl = document.getElementById('sk-user-name');
  if (nameEl) nameEl.textContent += ' — ' + nom;
}

function skRestrictCrecheSelects() {
  if (!SK_WRITE_CRECHE) return;
  const sel = document.getElementById('p-creche');
  if (!sel) return;
  Array.from(sel.options).forEach(o => { if (o.textContent.trim() !== SK_WRITE_CRECHE) o.remove(); });
  sel.value = SK_WRITE_CRECHE;
}

function skScheduleRefresh(expiresIn) {
  const delay = Math.max(30, (Number(expiresIn) || 3600) - 60) * 1000;
  if (SK_REFRESH_TIMER) clearTimeout(SK_REFRESH_TIMER);
  SK_REFRESH_TIMER = setTimeout(skRefreshToken, delay);
}
async function skRefreshToken() {
  if (!SK_REFRESH) return;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ refresh_token: SK_REFRESH }),
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) throw new Error('refresh refuse');
    SK_TOKEN = d.access_token;
    SK_REFRESH = d.refresh_token || SK_REFRESH;
    skScheduleRefresh(d.expires_in);
  } catch (e) {
    console.warn('[Auth] Rafraichissement impossible', e);
    setIndicator('Session expiree — rechargez la page', 'var(--red)');
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && SK_TOKEN) skRefreshToken();
});
async function skLogout() {
  if (!confirm('Se deconnecter ?')) return;
  try {
    await fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SK_TOKEN },
    });
  } catch (e) {}
  SK_TOKEN = null; SK_REFRESH = null; SK_USER = null; SK_PROFILE = null;
  if (SK_REFRESH_TIMER) clearTimeout(SK_REFRESH_TIMER);
  window.location.reload();
}

// ─── INIT ─────────────────────────────────────────────────────────────────
function skBootApp() {
  try { init(); }
  catch(e) { console.error('[Init error]', e.message, e.stack); setIndicator('⚠️ Erreur : ' + e.message, 'var(--red)'); }
}
function init() {
  loadLocalData();
  renderPropositions();
  renderSouscats();
  const coldStartTimer = setTimeout(() => setIndicator('⏳ Démarrage du serveur… (peut prendre jusqu\'à 30s)', 'var(--amber)'), 5000);
  loadData().then(() => {
    clearTimeout(coldStartTimer);
    renderPropositions();
    renderSouscats();
  }).catch(e => {
    clearTimeout(coldStartTimer);
    console.error('[Ludo] loadData error:', e);
  });
}
