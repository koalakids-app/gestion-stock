// ─── DÉTECTION CONTEXTE ──────────────────────────────────────────────────────
const IS_LOCAL = (typeof location !== 'undefined') &&
  (location.protocol === 'file:' ||
   (location.hostname && location.hostname.includes('claudeusercontent')));

// ─── DATA ─────────────────────────────────────────────────────────────────

// Valeurs de secours affichées avant la connexion (mode local / hors ligne) —
// la vraie liste des crèches de l'organisation est chargée après login,
// voir loadCrecheUI().
let CRECHES = ['Brunet', 'Cuers', 'Ollioules', 'St Jean', 'Picot 1', 'Picot 2'];
let CRECHE_COLORS = { 'Brunet': '#F59E0B', 'Cuers': '#10B981', 'Ollioules': '#EF4444', 'St Jean': '#8B5CF6', 'Picot 1': '#0EA5E9', 'Picot 2': '#F43F5E' };
const CRECHE_PALETTE = ['#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#0EA5E9', '#F43F5E', '#22C55E', '#F97316', '#6366F1', '#EC4899'];
// Entretien et Cuisine : la structure est facultative à la saisie. La base
// (RLS kk_acces_creche_nom) n'accepte qu'une vraie crèche, donc sans choix
// l'article est rattaché à la structure de l'utilisateur (voir saveArticle).
const CATS_SANS_CRECHE = ['Entretien', 'Cuisine'];
const CAT_ICONS = { 'Sensoriel':'👂','Manipulation':'🤲','Construction':'🧱','Motricité':'🏃','Imitation':'🎭','Expression artistique':'🎨','Mobilier':'🪑','Puériculture':'🍼','Bureautique':'💻','Rangement':'🗂','Décoration':'🎀','Entretien':'🧹','Cuisine':'🍳' };

let ARTICLES = [
  { id:1, nom:'Puzzles encastrement 4 pièces', ref:'MAT-001', cat:'Sensoriel', creche:'Brunet', stock:8, min:3, prix:12.50, fourn:'Nathan Pédagogique', notes:'Bois certifié FSC. Âge : 12-36 mois.' },
  { id:2, nom:'Tapis d\'éveil musical', ref:'MAT-002', cat:'Sensoriel', creche:'Brunet', stock:2, min:2, prix:34.90, fourn:'Halilit', notes:'Vérifier piles régulièrement.' },
  { id:3, nom:'Balles sensorielles (lot 6)', ref:'MAT-003', cat:'Sensoriel', creche:'Cuers', stock:5, min:2, prix:18.00, fourn:'Wesco France', notes:'Nettoyer après chaque usage.' },
  { id:4, nom:'Portique de motricité', ref:'MAT-004', cat:'Motricité', creche:'Ollioules', stock:1, min:1, prix:189.00, fourn:'Wesco France', notes:'Vérifier stabilité mensuelle.' },
  { id:5, nom:'Tunnels de gatage (lot 2)', ref:'MAT-005', cat:'Motricité', creche:'Cuers', stock:3, min:1, prix:45.00, fourn:'Wesco France', notes:'' },
  { id:6, nom:'Livres bain bébé (lot 5)', ref:'MAT-006', cat:'Imitation', creche:'Brunet', stock:0, min:3, prix:8.50, fourn:'Nathan Pédagogique', notes:'Stock épuisé — à commander.' },
  { id:7, nom:'Albums imagier 1-2 ans', ref:'MAT-007', cat:'Imitation', creche:'Ollioules', stock:12, min:4, prix:6.90, fourn:'Nathan Pédagogique', notes:'' },
  { id:8, nom:'Peintures aux doigts (6 couleurs)', ref:'MAT-008', cat:'Expression artistique', creche:'Cuers', stock:4, min:2, prix:14.00, fourn:'Nathan Pédagogique', notes:'Péremption : vérifier dates.' },
  { id:9, nom:'Tampons mousse formes géo.', ref:'MAT-009', cat:'Expression artistique', creche:'Ollioules', stock:6, min:2, prix:9.50, fourn:'Nathan Pédagogique', notes:'' },
  { id:10, nom:'Toboggan extérieur 3 marches', ref:'MAT-010', cat:'Motricité', creche:'Brunet', stock:1, min:1, prix:299.00, fourn:'Wesco France', notes:'Inspection sécurité trimestrielle.' },
  { id:11, nom:'Bac à sable avec couvercle', ref:'MAT-011', cat:'Motricité', creche:'Cuers', stock:2, min:1, prix:85.00, fourn:'Wesco France', notes:'Couvrir systématiquement après usage.' },
  { id:12, nom:'Jouets de plage (lot 10)', ref:'MAT-012', cat:'Motricité', creche:'Ollioules', stock:3, min:2, prix:22.00, fourn:'Hape Toys', notes:'' },
  { id:13, nom:'Cubes d\'empilage en bois', ref:'MAT-013', cat:'Motricité', creche:'Brunet', stock:7, min:3, prix:28.00, fourn:'Goki Spielzeug', notes:'Bois naturel non traité.' },
  { id:14, nom:'Xylophone bois 8 notes', ref:'MAT-014', cat:'Sensoriel', creche:'Cuers', stock:2, min:2, prix:19.50, fourn:'Halilit', notes:'' },
  { id:15, nom:'Gel hydroalcoolique 500mL (lot 6)', ref:'HYG-001', cat:'Puériculture', creche:'Brunet', stock:1, min:4, prix:22.50, fourn:'Nathan Pédagogique', notes:'Péremption à surveiller.' },
  { id:16, nom:'Couches taille 1 (lot 50)', ref:'HYG-002', cat:'Puériculture', creche:'Ollioules', stock:6, min:3, prix:12.00, fourn:'Nathan Pédagogique', notes:'' },
  { id:17, nom:'Anneau de dentition silicone', ref:'MAT-015', cat:'Sensoriel', creche:'Cuers', stock:8, min:4, prix:7.90, fourn:'Hape Toys', notes:'Stériliser hebdomadairement.' },
  { id:18, nom:'Marionnettes animaux (lot 4)', ref:'MAT-016', cat:'Imitation', creche:'Brunet', stock:5, min:2, prix:32.00, fourn:'Goki Spielzeug', notes:'' },
];

let COMMANDES = [];

let FOURNISSEURS = [
  { id:1, nom:'Nathan Pédagogique', contact:'Marie Dumont', tel:'01 42 55 33 21', email:'commandes@nathan-ped.fr', web:'https://nathan-pedagogique.fr', delai:'3-5 jours', spec:'Général', notes:'Remise 10% dès 200€ HT.' },
  { id:2, nom:'Wesco France', contact:'Pierre Martin', tel:'03 88 52 11 44', email:'pro@wesco.fr', web:'https://wesco.fr', delai:'5-7 jours', spec:'Motricité', notes:'Compte pro référence 48291.' },
  { id:3, nom:'Goki Spielzeug', contact:'—', tel:'—', email:'france@goki.de', web:'https://goki.de', delai:'7-10 jours', spec:'Imitation & Expression', notes:'Jouets bois certifiés FSC, peintures sans solvant.' },
  { id:4, nom:'Hape Toys', contact:'Sophie Bernard', tel:'01 56 89 12 00', email:'france@hape.com', web:'https://hape.com', delai:'4-6 jours', spec:'Expression artistique', notes:'Gamme 0-3 ans très complète.' },
  { id:5, nom:'Halilit', contact:'—', tel:'—', email:'contact@halilit.fr', web:'https://halilit.fr', delai:'5-8 jours', spec:'Sensoriel', notes:'Spécialiste instruments musique bébé.' },
];

let HISTORIQUE = [
  { id:1, type:'sortie', article:'Tapis d\'éveil musical', qty:-1, creche:'Brunet', user:'Sophie M.', date:'2024-04-03 09:15', note:'Mise au rebut — défectueux' },
  { id:2, type:'entrée', article:'Anneau dentition silicone', qty:+8, creche:'Cuers', user:'Lucie B.', date:'2024-04-03 08:30', note:'Réception commande BC-2024-039' },
  { id:3, type:'commande', article:'Commande BC-2024-042', qty:0, creche:'Brunet', user:'Admin', date:'2024-04-02 16:45', note:'Nathan Pédagogique — 156,50€' },
  { id:4, type:'entrée', article:'Albums imagier 1-2 ans', qty:+6, creche:'Ollioules', user:'Camille R.', date:'2024-04-02 14:00', note:'Réception commande BC-2024-038' },
  { id:5, type:'commande', article:'Commande BC-2024-041', qty:0, creche:'Ollioules', user:'Admin', date:'2024-04-01 11:30', note:'Wesco France — 312,00€' },
  { id:6, type:'sortie', article:'Livres bain bébé (lot 5)', qty:-3, creche:'Brunet', user:'Sophie M.', date:'2024-03-30 10:00', note:'Utilisation courante' },
  { id:7, type:'entrée', article:'Peintures aux doigts', qty:+4, creche:'Cuers', user:'Lucie B.', date:'2024-03-29 09:00', note:'Réception commande BC-2024-037' },
  { id:8, type:'commande', article:'Commande BC-2024-040', qty:0, creche:'Cuers', user:'Admin', date:'2024-03-28 15:00', note:'Halilit — 97,50€' },
];

// ─── COUCHES ────────────────────────────────────────────────────────────
// Une ligne par crèche × taille (3/4/5/6). Alimenté par stock_couches et
// stock_couches_mouvements (Supabase) — le décompte automatique se fait côté
// base (trigger sur suivi_saisies), voir sql/stock_couches.sql.
// Deux familles d'articles : couche classique (3 à 6) et couche-culotte
// (4/5 seulement, apprentissage de la propreté) — voir sql/stock_couches.sql.
const COUCHES_PRODUITS = [
  { type: 'couche',  label: 'Couches classiques', tailles: ['3','4','5','6'] },
  { type: 'culotte', label: 'Couches-culottes',   tailles: ['4','5'] },
];
let COUCHES = [];      // stock courant : { id, creche, typeCouche, taille, stock, seuilAlerteJours }
let COUCHES_MVTS = []; // journal des mouvements (500 derniers), pour estimer la conso/jour
// Prix d'achat unitaire par type×taille (sql/stock_couches_prix.sql), partagé
// par les 6 crèches — saisi une fois par la direction depuis la vraie facture
// fournisseur, jamais déduit d'un prix public scrapé.
let COUCHES_PRIX = []; // { typeCouche, taille, prixUnitaire, updatedAt }
// Effectif actuel par crèche×type×taille (enfants.creche_id/taille_couche/
// type_couche, enfants encore présents). Sert de repli pour l'estimation
// « jours restants » tant que l'historique réel de changes est trop maigre
// pour être fiable (4,5 couches/jour/enfant, une moyenne courante en crèche).
let COUCHES_EFFECTIF = []; // { creche, typeCouche, taille, count }
// Besoin prévisionnel du mois en cours par crèche×type×taille (4 couches/jour
// × jours de présence réels : jours du contrat, moins fériés, fermetures
// vacances/pédagogiques et absences programmées). Plus précis que
// COUCHES_EFFECTIF pour prévoir une commande : un enfant présent 2 j/semaine
// ne pèse pas comme un enfant à temps plein, alors qu'ils comptent pareil
// dans l'effectif brut.
let COUCHES_BESOIN = []; // { creche, typeCouche, taille, besoinMensuel }

// ─── STATE ─────────────────────────────────────────────────────────────
// ─── PAGINATION ──────────────────────────────────────────────────────────
const PAGE_SIZE = 10;
let currentPageMat = 1;
let currentPageConso = 1;
let currentPage = 'inventaire';
let currentCat = 'all';
let currentCreche = 'all';
let currentHisto = 'all';
let currentInvTab = 'materiel'; // 'materiel' | 'consommable'
let currentCatConso = 'all';
let currentStockStatus = 'all'; // 'all' | 'a-completer' | 'epuise'
let editingId = null;
// ─── INIT ─────────────────────────────────────────────────────────────────
function init() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('c-date').value = today;
  const next = new Date(); next.setDate(next.getDate()+7);
  document.getElementById('c-livraison').value = next.toISOString().split('T')[0];

  // Charger depuis localStorage (cache)
  loadLocalData();

  // Interface immédiate
  switchInvTab('materiel'); renderStats(); renderCommandes(); renderFournisseurs(); renderHistorique();updateCounts();

  // Sync Supabase en arrière-plan (cold start possible jusqu'à 30s)
  // Afficher un message intermédiaire après 5s si toujours en attente
  const coldStartTimer = setTimeout(() => setIndicator('⏳ Démarrage du serveur… (peut prendre jusqu\'à 30s)', 'var(--amber)'), 5000);
  loadData().then(ok => {
    clearTimeout(coldStartTimer);
    switchInvTab(currentInvTab); renderStats(); renderCommandes(); renderFournisseurs(); renderHistorique(); updateCounts();
    if (typeof startPolling === 'function') startPolling(60);
  }).catch(e => {
    clearTimeout(coldStartTimer);
    console.warn('Supabase unavailable:', e.message);
    setIndicator('💻 Mode local', 'var(--ink3)');
  });
}

// ─── RENDER TABLE ─────────────────────────────────────────────────────────
function renderTable() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  let data = ARTICLES.filter(a => {
    const isMateriel = a.depreciable !== false; // exclure consommables
    const matchCat = currentCat === 'all' || a.cat === currentCat;
    const matchCreche = currentCreche === 'all' || a.creche === currentCreche;
    const matchQ = !q || a.nom.toLowerCase().includes(q) || a.ref.toLowerCase().includes(q) || a.fourn.toLowerCase().includes(q);
    const matchStatus = currentStockStatus === 'all'
      || (currentStockStatus === 'a-completer' && getStockStatus(a) === 'À compléter')
      || (currentStockStatus === 'epuise' && getStockStatus(a) === 'Épuisé');
    return isMateriel && matchCat && matchCreche && matchQ && matchStatus;
  });

  let sortCol = window._sortCol || 'nom';
let sortDir = window._sortDir || 'asc';
data.sort((a,b) => {
  const va = String(a[sortCol]||'').toLowerCase();
  const vb = String(b[sortCol]||'').toLowerCase();
  return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
});
const tb = document.getElementById('tableBody');
  // Toujours supprimer l'ancien footer d'abord
  const oldFootEarly = document.getElementById('tableFooter');
  if (oldFootEarly && oldFootEarly.parentNode) oldFootEarly.parentNode.removeChild(oldFootEarly);

  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--ink3)">Aucun article trouvé</td></tr>`;
    return;
  }

  // Pagination
  const totalMat = data.length;
  const totalPagesMat = Math.ceil(totalMat / PAGE_SIZE);
  if (currentPageMat > totalPagesMat) currentPageMat = 1;
  const slicedData = data.slice((currentPageMat - 1) * PAGE_SIZE, currentPageMat * PAGE_SIZE);

  tb.innerHTML = slicedData.map(a => {
    const CAT_ICONS = { 'Sensoriel':'👂','Manipulation':'🤲','Construction':'🧱','Motricité':'🏃','Imitation':'🎭','Expression artistique':'🎨','Mobilier':'🪑','Puériculture':'🍼','Bureautique':'💻','Rangement':'🗂','Décoration':'🎀','Entretien':'🧹','Cuisine':'🍳' };
    const thumb = a.photo
      ? `<img class="article-thumb" src="${a.photo}" alt="${a.nom}" loading="lazy">`
      : `<div class="article-thumb-placeholder">${CAT_ICONS[a.cat]||'📦'}</div>`;

    const montant = a.stock * a.prix;

    return `<tr onclick="showDetail(${a.id})">
      <td>
        <div class="article-name-cell">
          ${thumb}
          <div>
            <div class="item-name">${a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim()}</div>
            <div class="item-ref">${a.ref}</div>
            ${(() => { const e = getArticleEtat(a); return e ? getEtatBadgeHtml(e) : ''; })()}
            ${getStockStatusBadgeHtml(a)}
          </div>
        </div>
      </td>
      <td><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600"><span style="width:8px;height:8px;border-radius:50%;background:${CRECHE_COLORS[a.creche]||'#888'}"></span>${a.creche}</span></td>
      <td><span class="badge badge-blue">${a.cat}</span></td>
      <td style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px">${a.stock}</td>
      
      <td style="font-weight:500">${a.prix > 0 ? a.prix.toFixed(2)+' €' : '—'}</td>
      <td style="font-weight:500;color:var(--accent)">
  ${(() => {
    if (!a.depreciable || !a.date_achat || !a.prix) return '<span style="color:var(--ink3)">—</span>';
    const v = valeurDepreciee(a);
    return v.toFixed(2) + ' €';
  })()}
</td>
      <td style="font-family:'Syne',sans-serif;font-weight:700;color:var(--accent)">
        ${(() => {
  const vLot = (a.depreciable && a.date_achat) ? valeurDepreciee(a) * a.stock : montant;
  return vLot > 0 ? vLot.toFixed(2) + ' €' : '—';
})()}
      </td>
      <td style="color:var(--ink2);font-size:12px">${a.fourn || '—'}</td>
      <td onclick="event.stopPropagation()">
        <div class="action-btns">
          <button class="btn btn-secondary btn-sm" onclick="editArticle(${a.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="onDeleteArticle(${a.id})">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Barre de pagination matériel
  renderPaginationBar('inv-table-materiel', totalMat, currentPageMat, (p) => {
    currentPageMat = p;
    renderTable();
  });

  // ── FOOTER TOTAL PAR STRUCTURE ──────────────────────────────────────────
  const totalGlobal = data.reduce((s,a) => s + a.stock * a.prix, 0);
  const totauxParStructure = CRECHES.map(c => {
    const items = data.filter(a => a.creche === c);
    const total = items.reduce((s,a) => s + a.stock * a.prix, 0);
    return items.length > 0 ? { c, total, count: items.length } : null;
  }).filter(Boolean);

  // Remove old footer if present
  const oldFoot = document.getElementById('tableFooter');
  if (oldFoot && oldFoot.parentNode) oldFoot.parentNode.removeChild(oldFoot);

  const tfoot = document.createElement('tfoot');
  tfoot.id = 'tableFooter';
  tfoot.innerHTML = `
    <tr style="background:var(--bg);border-top:2px solid var(--border)">
      <td colspan="2" style="padding:14px 16px">
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
          <span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink3)">Coût par structure</span>
          ${totauxParStructure.map(({c, total, count}) => `
            <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600">
              <span style="width:8px;height:8px;border-radius:50%;background:${CRECHE_COLORS[c]};flex-shrink:0"></span>
              ${c} :&nbsp;
              <span style="font-family:'Syne',sans-serif;font-weight:800;color:${CRECHE_COLORS[c]}">${total.toFixed(2)} €</span>
              <span style="color:var(--ink3);font-weight:400;font-size:11px">(${count})</span>
            </span>`).join('')}
        </div>
      </td>
      <td colspan="2" style="padding:14px 16px"></td>
      <td style="padding:14px 16px;text-align:right">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink3);margin-bottom:4px">Total général</div>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:20px;color:var(--accent)">${totalGlobal.toFixed(2)} €</div>
      </td>
      <td colspan="2" style="padding:14px 16px"></td>
    </tr>`;
  tb.parentNode.appendChild(tfoot);

  renderStats();
  updateCounts();
  updateInvTabCounts();
}
function switchInvTab(tab) {
  currentInvTab = tab;
  const isMat = tab === 'materiel';
  // Onglets
  const tMat = document.getElementById('inv-tab-materiel');
  const tCon = document.getElementById('inv-tab-consommable');
  if (tMat) { tMat.style.borderBottomColor = isMat ? 'var(--accent)' : 'transparent'; tMat.style.color = isMat ? 'var(--accent)' : 'var(--ink3)'; }
  if (tCon) { tCon.style.borderBottomColor = !isMat ? 'var(--accent)' : 'transparent'; tCon.style.color = !isMat ? 'var(--accent)' : 'var(--ink3)'; }
  // Filtres
  const fMat = document.getElementById('inv-filters-materiel');
  const fCon = document.getElementById('inv-filters-consommable');
  if (fMat) fMat.style.display = isMat ? 'block' : 'none';
  if (fCon) fCon.style.display = !isMat ? 'block' : 'none';
  // Tableaux
  const tbMat = document.getElementById('inv-table-materiel');
  const tbCon = document.getElementById('inv-table-consommable');
  if (tbMat) tbMat.style.display = isMat ? 'block' : 'none';
  if (tbCon) tbCon.style.display = !isMat ? 'block' : 'none';
  if (isMat) renderTable();
  else renderTableConso();
}

function filterCatConso(cat, el) {
  currentCatConso = cat;
  currentPageConso = 1;
  document.querySelectorAll('#inv-filters-consommable .filter-chip').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTableConso();
}

function renderTableConso() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  let data = ARTICLES.filter(a => {
    const isConso = a.depreciable === false;
    const matchCreche = currentCreche === 'all' || a.creche === currentCreche;
    const matchCat = currentCatConso === 'all' || a.cat === currentCatConso;
    const matchQ = !q || a.nom.toLowerCase().includes(q) || (a.ref||'').toLowerCase().includes(q);
    const matchStatus = currentStockStatus === 'all'
      || (currentStockStatus === 'a-completer' && getStockStatus(a) === 'À compléter')
      || (currentStockStatus === 'epuise' && getStockStatus(a) === 'Épuisé');
    return isConso && matchCreche && matchCat && matchQ && matchStatus;
  });
  const sortCol = window._sortCol || 'nom';
  const sortDir = window._sortDir || 'asc';
  data.sort((a,b) => {
    const va = String(a[sortCol]||'').toLowerCase();
    const vb = String(b[sortCol]||'').toLowerCase();
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  const tb = document.getElementById('tableBodyConso');
  if (!tb) return;
  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--ink3)">Aucun consommable trouvé</td></tr>`;
    return;
  }
  // Pagination
  const totalConso = data.length;
  const totalPagesConso = Math.ceil(totalConso / PAGE_SIZE);
  if (currentPageConso > totalPagesConso) currentPageConso = 1;
  const slicedDataConso = data.slice((currentPageConso - 1) * PAGE_SIZE, currentPageConso * PAGE_SIZE);

  tb.innerHTML = slicedDataConso.map(a => {
    const CAT_ICONS_L = { 'Sensoriel':'👂','Manipulation':'🤲','Construction':'🧱','Motricité':'🏃','Imitation':'🎭','Expression artistique':'🎨','Mobilier':'🪑','Puériculture':'🍼','Bureautique':'💻','Rangement':'🗂','Décoration':'🎀','Entretien':'🧹','Cuisine':'🍳' };
    const thumb = a.photo
      ? `<img class="article-thumb" src="${a.photo}" alt="${a.nom}" loading="lazy">`
      : `<div class="article-thumb-placeholder">${CAT_ICONS_L[a.cat]||'🧴'}</div>`;
    const stockAlert = a.min > 0 && a.stock <= a.min;
    return `<tr onclick="showDetail(${a.id})">
      <td>
        <div class="article-name-cell">
          ${thumb}
          <div>
            <div class="item-name">${a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').trim()}</div>
            <div class="item-ref">${a.ref}</div>
            <div style="margin-top:2px">${getStockStatusBadgeHtml(a)}</div>
          </div>
        </div>
      </td>
      <td><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600"><span style="width:8px;height:8px;border-radius:50%;background:${CRECHE_COLORS[a.creche]||'#888'}"></span>${a.creche}</span></td>
      <td><span class="badge badge-blue">${a.cat}</span></td>
      <td style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:${stockAlert?'#DC2626':'inherit'}">${a.stock}${stockAlert?` <span style="font-size:10px">⚠</span>`:''}</td>
      <td style="font-size:12px;color:var(--ink3)">${a.min > 0 ? a.min : '—'}</td>
      <td style="font-weight:500">${a.prix > 0 ? a.prix.toFixed(2)+' €' : '—'}</td>
      <td style="font-size:12px">${a.expiry ? `<span style="color:${expiryColor(a.expiry)};font-weight:600">${formatExpiry(a.expiry)}</span>` : '—'}</td>
      <td style="color:var(--ink2);font-size:12px">${a.fourn || '—'}</td>
      <td onclick="event.stopPropagation()">
        <div class="action-btns">
          <button class="btn btn-secondary btn-sm" onclick="editArticle(${a.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="onDeleteArticle(${a.id})">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Barre de pagination consommables
  renderPaginationBar('inv-table-consommable', totalConso, currentPageConso, (p) => {
    currentPageConso = p;
    renderTableConso();
  });
}

function updateInvTabCounts() {
  const crecheFilter = currentCreche !== 'all' ? currentCreche : null;
  const mat = ARTICLES.filter(a => a.depreciable !== false && (!crecheFilter || a.creche === crecheFilter)).length;
  const con = ARTICLES.filter(a => a.depreciable === false && (!crecheFilter || a.creche === crecheFilter)).length;
  const elM = document.getElementById('inv-count-materiel'); if (elM) elM.textContent = mat;
  const elC = document.getElementById('inv-count-consommable'); if (elC) elC.textContent = con;
}

function renderStats() {
  const data = currentCreche !== 'all' ? ARTICLES.filter(a => a.creche === currentCreche) : ARTICLES;
  const el = document.getElementById('stat-total');
  if (el) el.textContent = data.length;
  const valeur = data.reduce((s,a) => s + a.stock * a.prix, 0);
  const elVal = document.getElementById('stat-valeur');
  if (elVal) elVal.textContent = valeur.toFixed(0)+' €';
  const elCmd = document.getElementById('stat-commandes');
  if (elCmd) elCmd.textContent = COMMANDES.filter(c => c.status === 'en-cours' && (currentCreche === 'all' || c.creche === currentCreche)).length;
  // Tuile "À remplacer" — filtré par crèche comme les autres stats
  const rem = ARTICLES.filter(a => {
    const matchCreche = currentCreche === 'all' || a.creche === currentCreche;
    return matchCreche && getArticleEtat(a) === 'À remplacer';
  });
  const elRem = document.getElementById('stat-remplacer');
  if (elRem) elRem.textContent = rem.length;
  const cardRem = document.getElementById('stat-card-remplacer');
  if (cardRem) cardRem.style.borderLeft = rem.length > 0 ? '3px solid #DC2626' : '';
  // Tuile "À compléter" — articles dont le stock est ≤ au seuil minimum
  const completer = ARTICLES.filter(a => {
    const matchCreche = currentCreche === 'all' || a.creche === currentCreche;
    return matchCreche && getStockStatus(a) === 'À compléter';
  });
  const elCompleter = document.getElementById('stat-completer');
  if (elCompleter) elCompleter.textContent = completer.length;
  const cardCompleter = document.getElementById('stat-card-completer');
  if (cardCompleter) cardCompleter.style.borderLeft = completer.length > 0 ? '3px solid #D97706' : '';
  updateAlertBadge();
}
  
function updateCounts() {
  const page = typeof currentPage !== 'undefined' ? currentPage : 'inventaire';
  const el = document.getElementById('cnt-all');
  if (page === 'commandes') {
    const crecheFilter = currentCreche !== 'all' ? currentCreche : null;
    const enCours = COMMANDES.filter(c => c.status === 'en-cours' && (!crecheFilter || c.creche === crecheFilter));
    if (el) el.textContent = enCours.length;
    CRECHES.forEach((c,i) => {
      const el2 = document.getElementById('cnt-'+i);
      if (el2) el2.textContent = COMMANDES.filter(cmd => cmd.creche === c && cmd.status === 'en-cours').length;
    });
  } else {
    if (el) el.textContent = ARTICLES.length;
    CRECHES.forEach((c,i) => {
      const el2 = document.getElementById('cnt-'+i);
      if (el2) el2.textContent = ARTICLES.filter(a => a.creche === c).length;
    });
  }
}

// ─── FILTERS ──────────────────────────────────────────────────────────────
function filterCat(cat, el) {
  currentCat = cat;
  currentPageMat = 1;
  document.querySelectorAll('.filter-chip').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  renderTable();
}

function filterCreche(creche, el) {
  currentCreche = creche;
  currentPageMat = 1;
  currentPageConso = 1;
  document.querySelectorAll('.creche-badge').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  // Filtrer sur une crèche réduit souvent beaucoup la hauteur de la page
  // (ex. Couches, ou un inventaire filtré) : sans remise à zéro, la position
  // de défilement héritée de la vue précédente laisse un grand vide en haut.
  // Voir showPage() pour l'explication du reset d'overflow. Le second
  // scrollTo (après le prochain paint) rattrape le cas où le rendu qui suit
  // redimensionne encore la page après ce premier appel.
  document.body.style.overflow = '';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
  if (currentPage === 'inventaire') {
    if (currentInvTab === 'consommable') renderTableConso();
    else renderTable();
  }
  else if (currentPage === 'commandes') renderCommandes();
  else if (currentPage === 'historique') renderHistorique();
  else if (currentPage === 'couches') renderCouches();
  else renderTable();
}

function filterTable() {
  currentPageMat = 1;
  currentPageConso = 1;
  if (currentInvTab === 'consommable') renderTableConso();
  else renderTable();
}

// Déclenché par les cartes stat (ex: "À compléter") : active le filtre statut
function filterStockStatus(status) {
  currentStockStatus = (currentStockStatus === status) ? 'all' : status;
  currentPageMat = 1;
  currentPageConso = 1;
  renderActiveInvTable();
  const target = document.getElementById('articles-table');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const label = status === 'a-completer' ? '🟠 À compléter' : status === 'epuise' ? '🔴 Épuisé' : null;
  if (currentStockStatus === 'all') {
    showNotif('Filtre statut désactivé');
  } else if (label) {
    showNotif(`Filtre actif : ${label}`);
  }
}

function renderActiveInvTable() {
  if (currentInvTab === 'consommable') renderTableConso();
  else renderTable();
}
function toggleSort(col) {
  if (window._sortCol === col) {
    window._sortDir = window._sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window._sortCol = col;
    window._sortDir = 'asc';
  }
  renderActiveInvTable();
}
function filterHisto(type, el) {
  currentHisto = type;
  document.querySelectorAll('#page-historique .filter-chip').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  renderHistorique();
}
