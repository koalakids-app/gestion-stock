
// ── saveData : no-op (kept for compatibility) ─────────────────────────────
// ─── NOM DE LA CRÈCHE ────────────────────────────────────────────────────
const LS_NAME_KEY = 'stocks-solo-creche-name';

function getCrecheName() {
  return localStorage.getItem(LS_NAME_KEY) || 'Ma Crèche';
}

function applyNomCreche(nom) {
  // Mettre à jour l'affichage sidebar
  const display = document.getElementById('creche-name-display');
  if (display) display.innerHTML = `${nom} <span style="font-size:9px;opacity:0.5">✏️</span>`;
  // Mettre à jour le titre de la page
  document.title = `Stocks Pédagogiques — ${nom}`;
  // Mettre à jour les selects de structure
  ['f-creche', 'c-creche-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = `<option value="${nom}">${nom}</option>`;
  });
  // Mettre à jour les données en mémoire
  CRECHES[0] = nom;
  CRECHE_COLORS[nom] = '#2563EB';
  // Mettre à jour les articles existants si besoin
  ARTICLES.forEach(a => { if (a.creche === 'Ma Crèche' || !CRECHE_COLORS[a.creche]) a.creche = nom; });
}

function editCrecheName() {
  const nom = getCrecheName();
  const input = document.getElementById('creche-name-input');
  const display = document.getElementById('creche-name-display');
  input.value = nom;
  input.style.display = 'block';
  display.style.display = 'none';
  input.focus();
  input.select();
}

function saveCrecheName() {
  const input = document.getElementById('creche-name-input');
  const display = document.getElementById('creche-name-display');
  const nom = input.value.trim() || 'Ma Crèche';
  localStorage.setItem(LS_NAME_KEY, nom);
  saveStockConfigDB('creche_name', nom);
  input.style.display = 'none';
  display.style.display = 'flex';
  applyNomCreche(nom);
  saveData();
  showNotif(`✅ Nom mis à jour : ${nom}`);
  renderActiveInvTable();
  renderStats();
}
const LS_KEY = 'stocks-solo-v1';

function saveData() {
  try {
    const data = {
      articles:     ARTICLES,
      commandes:    COMMANDES,
      fournisseurs: FOURNISSEURS,
      historique:   HISTORIQUE.slice(0, 300),
      savedAt:      new Date().toISOString(),
    };
    // Essayer avec photos
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch(e) {
      // localStorage plein → sauvegarder sans photos
      const dataLight = { ...data, articles: ARTICLES.map(a => ({...a, photo:null, photoName:null})) };
      localStorage.setItem(LS_KEY, JSON.stringify(dataLight));
      console.warn('[Solo] Photos omises — localStorage plein');
    }
    const now = new Date();
    setIndicator('💾 Sauvegardé à ' + now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}), 'var(--green)');
  } catch(e) {
    console.error('[Solo] Sauvegarde impossible:', e);
    setIndicator('⚠ Sauvegarde échouée', 'var(--red)');
  }
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.articles     && Array.isArray(data.articles))     ARTICLES.splice(0,     ARTICLES.length,     ...data.articles);
    if (data.commandes    && Array.isArray(data.commandes))    COMMANDES.splice(0,    COMMANDES.length,    ...data.commandes);
    if (data.fournisseurs && Array.isArray(data.fournisseurs)) FOURNISSEURS.splice(0, FOURNISSEURS.length, ...data.fournisseurs);
    if (data.historique   && Array.isArray(data.historique))   HISTORIQUE.splice(0,   HISTORIQUE.length,   ...data.historique);
    return data.savedAt || true;
  } catch(e) {
    console.error('[Solo] Chargement impossible:', e);
    return false;
  }
}

function clearData() {
  if (!confirm('⚠️ Supprimer toutes les données et repartir de zéro ?\n\nCette action est irréversible.')) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
}

// ─── PWA ────────────────────────────────────────────────────────────────────

// Service Worker : uniquement sur HTTPS (Netlify, pas en local ni dans Claude)
if ('serviceWorker' in navigator &&
    location.protocol === 'https:' &&
    !location.hostname.includes('claudeusercontent')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(r => console.log('SW registered:', r.scope))
      .catch(e => console.log('SW error:', e));
  });
}

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  if (!sessionStorage.getItem('pwa-stocks-dismissed')) {
    setTimeout(() => document.getElementById('installBar').classList.add('visible'), 4000);
  }
});

function triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(c => {
    if (c.outcome === 'accepted') document.getElementById('installBar').classList.remove('visible');
    deferredPrompt = null;
  });
}

function dismissInstall() {
  document.getElementById('installBar').classList.remove('visible');
  sessionStorage.setItem('pwa-stocks-dismissed', '1');
}

window.addEventListener('appinstalled', () => {
  document.getElementById('installBar').classList.remove('visible');
  deferredPrompt = null;
});

window.addEventListener('online',  () => document.getElementById('offlineBadge').classList.remove('visible'));
window.addEventListener('offline', () => document.getElementById('offlineBadge').classList.add('visible'));
if (!navigator.onLine) document.getElementById('offlineBadge').classList.add('visible');


// ─── FULLSCREEN ──────────────────────────────────────────────────────────
// ─── PAGINATION HELPER ───────────────────────────────────────────────────
function renderPaginationBar(containerId, totalItems, currentPage, onPageChange) {
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const container = document.getElementById(containerId);
  if (!container) return;

  // Supprimer ancienne barre
  const old = document.getElementById(containerId + '-pager');
  if (old) old.remove();

  if (totalPages <= 1) return;

  const bar = document.createElement('div');
  bar.className = 'pagination';
  bar.id = containerId + '-pager';

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalItems);

  // Bouton précédent
  const prev = document.createElement('button');
  prev.className = 'pagination-btn';
  prev.textContent = '‹';
  prev.disabled = currentPage === 1;
  prev.onclick = () => onPageChange(currentPage - 1);
  bar.appendChild(prev);

  // Pages numérotées (max 5 autour de la page courante)
  let pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages = [1];
    let lo = Math.max(2, currentPage - 1);
    let hi = Math.min(totalPages - 1, currentPage + 1);
    if (lo > 2) pages.push('…');
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (hi < totalPages - 1) pages.push('…');
    pages.push(totalPages);
  }

  pages.forEach(p => {
    if (p === '…') {
      const span = document.createElement('span');
      span.className = 'pagination-info';
      span.textContent = '…';
      bar.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'pagination-btn' + (p === currentPage ? ' active' : '');
      btn.textContent = p;
      btn.onclick = () => onPageChange(p);
      bar.appendChild(btn);
    }
  });

  // Bouton suivant
  const next = document.createElement('button');
  next.className = 'pagination-btn';
  next.textContent = '›';
  next.disabled = currentPage === totalPages;
  next.onclick = () => onPageChange(currentPage + 1);
  bar.appendChild(next);

  // Info
  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = start + '–' + end + ' / ' + totalItems;
  bar.appendChild(info);

  container.appendChild(bar);
}

// ─── WRAPPERS SYNCHRONES pour les onclick HTML ────────────────────────────
// Les fonctions async ne peuvent pas être appelées directement depuis onclick
// sur certains navigateurs mobiles — on les enveloppe
// ── DÉPRÉCIATION 20%/AN ──────────────────────────────────────────────────
function getArticleEtat(a) {
  if (a.depreciable === false) return null; // consommable → pas d'état
  if (a.etat_override) return a.etat_override;
  if (!a.date_achat) return null;
  const annees = (Date.now() - new Date(a.date_achat)) / (365.25 * 24 * 3600 * 1000);
  const residuel = Math.max(0, 1 - 0.20 * annees);
  if (residuel >= 0.80) return 'Neuf';
  if (residuel >= 0.60) return 'Bon état';
  if (residuel >= 0.40) return 'Usagé';
  return 'À remplacer';
}

function getEtatBadgeHtml(etat) {
  if (!etat) return '';
  const map = {
    'Neuf':        { bg:'#D1FAE5', color:'#065F46', icon:'🟢' },
    'Bon état':    { bg:'#DBEAFE', color:'#1E40AF', icon:'🔵' },
    'Usagé':       { bg:'#FEF3C7', color:'#92400E', icon:'🟠' },
    'À remplacer': { bg:'#FEE2E2', color:'#991B1B', icon:'🔴' },
  };
  const s = map[etat] || { bg:'var(--bg)', color:'var(--ink2)', icon:'⚪' };
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">${s.icon} ${etat}</span>`;
}

function getArticlesToRemplacer() {
  return ARTICLES.filter(a => getArticleEtat(a) === 'À remplacer');
}

// Statut de stock : "Épuisé" (0), "À compléter" (≤ seuil min, mais seuil renseigné), "OK"
function getStockStatus(a) {
  if (a.stock === 0) return 'Épuisé';
  if (a.min > 0 && a.stock <= a.min) return 'À compléter';
  return 'OK';
}

function getStockStatusBadgeHtml(a) {
  const s = getStockStatus(a);
  const map = {
    'Épuisé':      { bg:'#FEE2E2', color:'#991B1B', icon:'🔴' },
    'À compléter': { bg:'#FFEDD5', color:'#9A3412', icon:'🟠' },
  };
  const cfg = map[s];
  if (!cfg) return '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:${cfg.bg};color:${cfg.color}">${cfg.icon} ${s}</span>`;
}

function getArticlesACompleter() {
  return ARTICLES.filter(a => getStockStatus(a) === 'À compléter');
}

function getLowStockArticles() {
  return ARTICLES.filter(a => a.stock <= a.min && a.min > 0);
}

function getExpiryAlerts() {
  const today = new Date(); today.setHours(0,0,0,0);
  return ARTICLES.filter(a => {
    if (!a.expiry) return false;
    const exp = new Date(a.expiry); exp.setHours(0,0,0,0);
    return Math.round((exp - today) / 86400000) <= 30;
  }).sort((a,b) => new Date(a.expiry) - new Date(b.expiry));
}

function updateAlertBadge() {
  const total = getLowStockArticles().length + getExpiryAlerts().length + getArticlesToRemplacer().length;
  const badge = document.getElementById('nav-alert-badge');
  if (!badge) return;
  badge.style.display = total > 0 ? 'inline-block' : 'none';
  badge.textContent = total;
}

function onSaveArticle()       { saveArticle().catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onDeleteArticle(id)   { deleteArticle(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
// Alias pour compatibilité avec onSaveCommande
const saveCommande = saveCommande_db;

function onSaveCommande()      { saveCommande().catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onMarkLivree(id)      { markLivree(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onToggleTraitee(id)   { toggleTraitee(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onAnnulerCommande(id) { annulerCommande(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onDeleteCommande(id)  { deleteCommande(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }

function onSaveFournisseur()   { saveFournisseur().catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onQuickAdjust(id,d)   { quickAdjust(id,d).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onAdjustStock(id,d)   { adjustStock(id,d).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onAdjustStockCustom(id){ adjustStockCustom(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onRemoveArticlePhoto(id){ removeArticlePhoto(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); }); }
function onClearData()         { clearData().catch(e => console.error(e)); }
// ── SIDEBAR : PWA fullscreen + drawer mobile ──────────────────────────────
function toggleSidebar() {
  // Mode plein écran uniquement (languette latérale)
  const sidebar = document.getElementById('mainSidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// ── PLEIN ÉCRAN (bouton) ──────────────────────────────────────────────────
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      showNotif('⚠ Plein écran impossible : ' + err.message);
    });
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  document.body.classList.toggle('is-fullscreen', isFs);

  const icon = document.getElementById('fullscreenIcon');
  if (icon) icon.textContent = isFs ? '⤓' : '⛶';

  // En sortant du plein écran, on referme la sidebar repliée
  if (!isFs) {
    const sidebar = document.getElementById('mainSidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
});


function openMobileMenu() {
  const sidebar = document.getElementById('mainSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('visible');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  const sidebar = document.getElementById('mainSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

// Ferme la sidebar mobile au clic sur un nav-item ou une crèche
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.nav-item, .creche-badge').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (window.innerWidth <= 768) closeMobileMenu();
    });
  });
});

// Ferme la sidebar si on clique en dehors (plein écran uniquement)
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('mainSidebar');
  const trigger = document.getElementById('sidebarTrigger');
  if (!sidebar) return;
  if (document.body.classList.contains('is-fullscreen')) {
    if (
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      e.target !== trigger
    ) {
      sidebar.classList.remove('open');
    }
  }
});
// Lancer l'app — differe : appele par skDoLogin() une fois la session ouverte.
function skBootApp() {
try {
  init();
} catch(e) {
  console.error('[Init error]', e.message, e.stack);
  // Ne montrer l'erreur que si l'inventaire n'a pas pu se charger
  const tableBody = document.getElementById('tableBody');
  if (!tableBody || tableBody.innerHTML === '') {
    setIndicator('⚠️ Erreur : ' + e.message, 'var(--red)');
  } else {
    // App fonctionnelle malgré l'erreur mineure — silencieux
    console.warn('[Init] Erreur mineure ignorée:', e.message);
  }
}
}
// ─── LOGO SUPABASE ────────────────────────────────────────────────────────
const LOGO_SUPABASE_URL = 'https://juyrceadazrovlitxceb.supabase.co';
const LOGO_ANON = 'sb_publishable_juEwd3M1wOvOXnM3frvDJA_FIeHQB-Q';
const LOGO_BUCKET = 'assets';
const LOGO_FILE = 'logo/koalakids-logo';

async function loadLogo() {
  const extensions = ['png','jpg','jpeg','webp','svg'];
  for (const ext of extensions) {
    const url = `${LOGO_SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${LOGO_FILE}.${ext}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        const img = document.getElementById('logo-img');
        const placeholder = document.getElementById('logo-placeholder');
        img.src = url + '?t=' + Date.now();
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        img.onclick = () => document.getElementById('logo-input').click();
        return;
      }
    } catch(e) {}
  }
}

async function uploadLogo(file) {
  const ext = file.name.split('.').pop();
  const path = `${LOGO_FILE}.${ext}`;
  const res = await fetch(`${LOGO_SUPABASE_URL}/storage/v1/object/${LOGO_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOGO_ANON}`,
      'Content-Type': file.type,
      'x-upsert': 'true'
    },
    body: file
  });
  if (res.ok) {
    const url = `${LOGO_SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
    const img = document.getElementById('logo-img');
    const placeholder = document.getElementById('logo-placeholder');
    img.src = url + '?t=' + Date.now();
    img.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    img.onclick = () => document.getElementById('logo-input').click();
    showNotif('✅ Logo enregistré !');
  } else {
    showNotif('❌ Erreur upload logo (' + res.status + ')');
  }
}
