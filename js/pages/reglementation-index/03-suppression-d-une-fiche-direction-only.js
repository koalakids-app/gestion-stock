
// ── Suppression d'une fiche (direction only) ──
async function regloDeleteFiche(id){
  if(!regloCanEdit()) return;
  const fiche = FICHES.find(f=>f.id===id);
  if(!fiche) return;
  if(!confirm('Supprimer définitivement la fiche « '+fiche.title+' » ?')) return;
  try{
    const { error } = await sbReglo.from('reglementation_fiches').delete().eq('id', id);
    if(error) throw error;
    closeModal();
    await loadFichesFromSupabase();
    updateCounts(); renderCards();
  }catch(e){
    alert(/policy|permission|rls/i.test(e.message||'') ? 'Suppression réservée à la direction.' : 'Erreur : '+(e.message||e));
  }
}

async function enterApp(){
  kkLoginAlertCheck(sbReglo);
  document.getElementById('reglo-login-wrap').style.display = 'none';
  document.getElementById('reglo-app').style.display = 'block';
  await loadFichesFromSupabase();
  await loadVeille();
  init();
  regloApplyRoleUI();
}

// Reprise de session : si déjà connecté, on saute le login
async function regloLogout(){
  try{ await sbReglo.auth.signOut(); }catch(e){}
  currentUser = null; currentProfile = null; userRole = null; isDirection = false;
  document.getElementById('reglo-app').style.display = 'none';
  document.getElementById('reglo-login-wrap').style.display = 'flex';
  // Réinitialise le formulaire
  document.getElementById('reglo-pwd').value = '';
  const btn = document.getElementById('reglo-login-btn');
  btn.disabled = false; btn.textContent = 'Se connecter';
  document.getElementById('reglo-login-err').style.display = 'none';
}

async function regloBootstrap(){
  try{
    const { data:{ session } } = await sbReglo.auth.getSession();
    if(session && session.user){
      currentUser = session.user;
      const { data: prof } = await sbReglo.from('referents').select('*').eq('user_id', currentUser.id).maybeSingle();
      currentProfile = prof || null;
      userRole = currentProfile?.role || null;
      isDirection = userRole === 'direction';
      // MFA obligatoire, même sur une session restaurée : une session hors AAL2
      // ne doit pas donner un accès direct.
      await regloMfaGateCheckAndProceed();
    }
  }catch(e){ /* reste sur l'écran de login */ }
}

let currentFilter = 'all';
let currentView = 'grid';
let searchQuery = '';

// ─── CATEGORY CONFIG ───────────────────────────────────────────────────
const CAT = {
  agrement:     { label: 'Agrément & Création',     color: '#C4623A', bg: '#FEF0EA', text: '#9A3D1E' },
  encadrement:  { label: 'Encadrement & Personnel',  color: '#5C7A5E', bg: '#EEF5EE', text: '#375239' },
  financement:  { label: 'Financement & Aides',      color: '#D4891A', bg: '#FEF5E5', text: '#8A5700' },
  locaux:       { label: 'Locaux & Sécurité',        color: '#4A6275', bg: '#EBF0F4', text: '#2D4255' },
  sante:        { label: 'Santé & Hygiène',           color: '#9B59B6', bg: '#F5EEF8', text: '#6C3483' },
  gestion:      { label: 'Gestion & Administratif',  color: '#E74C3C', bg: '#FDEDEC', text: '#A93226' },
  decret2025:   { label: 'Décret 2025-304',           color: '#7C3AED', bg: '#F5F3FF', text: '#4C1D95' }
};

// ═══ VEILLE RÉGLEMENTAIRE ═══
// Capture opportuniste : titre + lien. Lecture et ajout ouverts à tous les
// comptes du réseau ; suppression réservée à la direction (voir RLS).
let VEILLE = [];

async function loadVeille(){
  try{
    const { data, error } = await sbReglo
      .from('reglementation_veille')
      .select('*')
      .order('created_at', { ascending: false });
    if(error) throw error;
    VEILLE = data || [];
  }catch(e){
    console.warn('Veille indisponible :', e);
    VEILLE = [];
  }
}

function updateVeilleCount(){
  const el = document.getElementById('count-veille');
  if(el) el.textContent = VEILLE.length;
}

function veilleOpen(prefTitre, prefUrl){
  document.getElementById('veilleTitre').value = prefTitre || '';
  document.getElementById('veilleUrl').value   = prefUrl || '';
  const msg = document.getElementById('veilleMsg');
  msg.style.display = 'none'; msg.textContent = '';
  document.getElementById('veilleOverlay').classList.add('open');
  setTimeout(()=>{ document.getElementById(prefTitre ? 'veilleUrl' : 'veilleTitre').focus(); }, 50);
}

function veilleClose(){
  document.getElementById('veilleOverlay').classList.remove('open');
}

function veilleMsg(cls, txt){
  const m = document.getElementById('veilleMsg');
  m.className = 'veille-msg ' + cls;
  m.textContent = txt;
  m.style.display = 'block';
}

async function veilleSave(){
  const titre = document.getElementById('veilleTitre').value.trim();
  let url     = document.getElementById('veilleUrl').value.trim();
  if(!titre || !url){ veilleMsg('err', 'Le titre et le lien sont tous deux nécessaires.'); return; }
  if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try{ new URL(url); }catch(e){ veilleMsg('err', 'Ce lien ne semble pas valide.'); return; }

  const btn = document.getElementById('veilleSaveBtn');
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  try{
    const { error } = await sbReglo.from('reglementation_veille').insert({
      titre: titre,
      url: url,
      cree_par: currentProfile ? currentProfile.id : null
    });
    if(error) throw error;
    veilleMsg('ok', 'Lien enregistré ✓');
    await loadVeille();
    updateVeilleCount();
    if(currentFilter === 'veille') renderVeille();
    setTimeout(veilleClose, 800);
  }catch(e){
    const m = e.message || String(e);
    veilleMsg('err', /policy|permission|rls/i.test(m)
      ? 'Enregistrement refusé : votre compte n’a pas les droits.'
      : 'Erreur : ' + m);
  }finally{
    btn.disabled = false; btn.textContent = '💾 Enregistrer';
  }
}

async function veilleDelete(id){
  if(!regloCanEdit()) return;
  const v = VEILLE.find(x => x.id === id);
  if(!v) return;
  if(!confirm('Retirer « ' + v.titre + ' » de la veille ?')) return;
  try{
    const { error } = await sbReglo.from('reglementation_veille').delete().eq('id', id);
    if(error) throw error;
    await loadVeille();
    updateVeilleCount();
    renderVeille();
  }catch(e){
    const m = e.message || String(e);
    alert(/policy|permission|rls/i.test(m) ? 'Suppression réservée à la direction.' : 'Erreur : ' + m);
  }
}

function renderVeille(){
  const container = document.getElementById('cardsContainer');
  const empty = document.getElementById('emptyState');
  const list = VEILLE.filter(v => !searchQuery
    || (v.titre || '').toLowerCase().includes(searchQuery)
    || (v.url   || '').toLowerCase().includes(searchQuery));

  document.getElementById('resultsCount').textContent =
    list.length + ' lien' + (list.length > 1 ? 's' : '');

  const p = empty.querySelector('p');
  if(p) p.textContent = searchQuery
    ? 'Aucun lien ne correspond à cette recherche.'
    : 'Aucun lien capturé pour le moment. Utilisez « Capturer un lien ».';

  if(!list.length){ container.innerHTML = ''; container.className = 'veille-list'; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  container.className = 'veille-list';
  container.innerHTML = list.map(v => {
    let host = '';
    try{ host = new URL(v.url).hostname.replace(/^www\./, ''); }catch(e){}
    const d = v.created_at ? new Date(v.created_at).toLocaleDateString('fr-FR') : '';
    // Vrai <a> et non onclick : un handler inline injecté via innerHTML ne
    // s’exécuterait pas dans ce contexte.
    return '<div class="veille-row">'
      + '<a href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener">' + escapeHtml(v.titre) + '</a>'
      + (host ? '<span class="veille-host">' + escapeHtml(host) + '</span>' : '')
      + '<span class="veille-date">' + d + '</span>'
      + (regloCanEdit() ? '<button class="veille-del" onclick="veilleDelete(' + v.id + ')" title="Retirer">✕</button>' : '')
      + '</div>';
  }).join('');
}

// ─── INIT ───────────────────────────────────────────────────────────────
function init() {
  updateCounts();
  updateVeilleCount();
  renderCards();
  // Partage entrant (share_target Android) : ?title=…&url=…
  try{
    const sp = new URLSearchParams(location.search);
    const st = sp.get('title'), su = sp.get('url') || sp.get('text');
    if(st || su){
      veilleOpen(st || '', su || '');
      history.replaceState(null, '', location.pathname);
    }
  }catch(e){}
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderCards();
  });
}

function updateCounts() {
  const total = FICHES.length;
  document.getElementById('totalCount').textContent = total;
  document.getElementById('countAll').textContent = total;
  Object.keys(CAT).forEach(cat => {
    const el = document.getElementById('count-' + cat);
    if (el) el.textContent = FICHES.filter(d => d.category === cat || (d.tags && d.tags.includes(cat))).length;
  });
}

function filterCards(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const titles = {
    all: 'Toutes les fiches',
    agrement: 'Agrément & Création',
    encadrement: 'Encadrement & Personnel',
    financement: 'Financement & Aides',
    locaux: 'Locaux & Sécurité',
    sante: 'Santé & Hygiène',
    gestion: 'Gestion & Administratif',
    decret2025: '🆕 Décret 2025-304 — Nouvelles règles',
    veille: '📌 Veille — articles repérés'
  };
  document.getElementById('sectionTitle').textContent = titles[filter];
  renderCards();
}

function setView(view) {
  currentView = view;
  document.getElementById('gridBtn').classList.toggle('active', view === 'grid');
  document.getElementById('listBtn').classList.toggle('active', view === 'list');
  renderCards();
}

function getFiltered() {
  return FICHES.filter(d => {
    const matchCat = currentFilter === 'all' || d.category === currentFilter || (d.tags && d.tags.includes(currentFilter));
    const matchSearch = !searchQuery ||
      d.title.toLowerCase().includes(searchQuery) ||
      d.summary.toLowerCase().includes(searchQuery) ||
      d.ref.toLowerCase().includes(searchQuery) ||
      CAT[d.category].label.toLowerCase().includes(searchQuery);
    return matchCat && matchSearch;
  });
}

function renderCards() {
  if (currentFilter === 'veille') { renderVeille(); return; }
  const filtered = getFiltered();
  const container = document.getElementById('cardsContainer');
  const empty = document.getElementById('emptyState');
  const pEmpty = empty.querySelector('p');
  if (pEmpty) pEmpty.textContent = 'Aucune fiche trouvée pour cette recherche.';

  document.getElementById('resultsCount').textContent = 
    filtered.length === FICHES.length ? `${filtered.length} fiches` : `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  if (currentView === 'grid') {
    container.className = 'cards-grid';
    container.innerHTML = filtered.map((d, i) => renderGridCard(d, i)).join('');
  } else {
    container.className = 'cards-list';
    container.innerHTML = filtered.map((d, i) => renderListItem(d, i)).join('');
  }
}

// ── Fraîcheur d'une fiche (basée sur verifiedAt) ──
function freshnessBadge(d){
  if(!d.verifiedAt){
    return '<span class="freshness never" title="Jamais vérifiée via Claude">○ Jamais vérifiée</span>';
  }
  const then = new Date(d.verifiedAt);
  const months = Math.floor((Date.now() - then.getTime()) / (1000*60*60*24*30.44));
  let label;
  if(months <= 0) label = 'Vérifiée ce mois-ci';
  else if(months === 1) label = 'Vérifiée il y a 1 mois';
  else label = 'Vérifiée il y a ' + months + ' mois';
  const cls = months > 6 ? 'stale' : 'ok';
  const icon = months > 6 ? '⚠' : '✓';
  return '<span class="freshness ' + cls + '" title="Dernière vérification via Claude">' + icon + ' ' + label + '</span>';
}

function renderGridCard(d, i) {
  const cat = CAT[d.category];
  const badge2025 = d.tags && d.tags.includes('decret2025') ? `<span class="badge-2025">⚡ Décret 2025</span>` : '';
  const badgeCaduque = d.caduque ? `<span class="badge-caduque">⚠ Modifié 2026</span>` : '';
  const badgeNew = d.isNew ? `<span class="badge-new">✦ Nouveau</span>` : '';
  return `
    <div class="card" onclick="openModal(${d.id})" style="animation-delay:${i*0.04}s">
      <div class="card-stripe" style="background:${d.isNew ? '#7C3AED' : cat.color}"></div>
      <div class="card-body">
        <div class="card-meta">
          <span class="tag" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
          <span class="card-ref">#${String(d.id).padStart(2,'0')}</span>
        </div>
        <h3>${d.title}${badge2025}${badgeCaduque}${badgeNew}</h3>
        <p>${d.summary}</p>
        <div class="card-fresh-row">${freshnessBadge(d)}</div>
        <div class="card-footer">
          <span class="card-source">📋 ${d.source}</span>
          <button class="expand-btn">Voir détails →</button>
        </div>
      </div>
    </div>`;
}

function renderListItem(d, i) {
  const cat = CAT[d.category];
  const badge2025 = d.tags && d.tags.includes('decret2025') ? `<span class="badge-2025">⚡ Décret 2025</span>` : '';
  const badgeCaduque = d.caduque ? `<span class="badge-caduque">⚠ Modifié 2026</span>` : '';
  const badgeNew = d.isNew ? `<span class="badge-new">✦ Nouveau</span>` : '';
  return `
    <div class="card-list-item" onclick="openModal(${d.id})" style="animation-delay:${i*0.03}s">
      <div class="list-stripe" style="background:${d.isNew ? '#7C3AED' : cat.color}"></div>
      <div class="list-info">
        <h3>${d.title} ${badge2025}${badgeCaduque}${badgeNew}</h3>
        <p>
          <span style="color:${cat.text}">● ${cat.label}</span>
          <span>📋 ${d.source}</span>
          <span>📄 ${d.ref.split('—')[0].trim()}</span>
        </p>
      </div>
      <span style="font-size:18px;color:#ccc">›</span>
    </div>`;
}

function openModal(id) {
  const d = FICHES.find(x => x.id === id);
  if (!d) return;
  const cat = CAT[d.category];
  const overlay = document.getElementById('modalOverlay');

  const badge2025 = d.tags && d.tags.includes('decret2025') ? `<span class="badge-2025">⚡ Décret 2025</span>` : '';
  const badgeCaduque = d.caduque ? `<span class="badge-caduque">⚠ Partiellement modifié au 1er sept. 2026</span>` : '';
  const badgeNew = d.isNew ? `<span class="badge-new">✦ Nouveau — Décret 2025</span>` : '';

  document.getElementById('modalCategory').innerHTML = `
    <span class="tag" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>`;
  document.getElementById('modalTitle').innerHTML = d.title + badge2025 + badgeCaduque + badgeNew;
  document.getElementById('modalRef').textContent = d.ref;

  const det = d.detail || {};
  const arr = v => Array.isArray(v) ? v : [];

  const update2025Block = Array.isArray(d.update2025) ? `
    <div class="modal-section">
      <div class="modal-section-title" style="color:#7C3AED">⚡ Modifications — Décret 2025-304</div>
      <div class="decret-box">
        <div style="font-weight:700;margin-bottom:8px;">Ce qui change avec le décret n° 2025-304 du 1er avril 2025 :</div>
        <div class="timeline-2025">
          ${d.update2025.map(u => `
            <div class="timeline-2025-item">
              <div class="timeline-date">${u.date}</div>
              <div class="timeline-text">${u.text}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>` : '';

  const verifyBtn = regloCanEdit()
    ? `<button class="reglo-verify-btn" onclick="regloVerifyFiche(${d.id})"><span>🔍</span> Vérifier</button>
       <button class="redit-btn danger" style="padding:9px 14px" onclick="regloDeleteFiche(${d.id})"><span>🗑</span> Supprimer</button>`
    : '';

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-verify-bar">
      <div>${freshnessBadge(d)}</div>
      ${verifyBtn}
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Description</div>
      <p class="modal-text">${det.description || ''}</p>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Points réglementaires clés</div>
      <ul class="requirement-list">
        ${arr(det.points).map(p => `<li>${p}</li>`).join('')}
      </ul>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Chiffres & paramètres</div>
      <div class="detail-grid">
        ${arr(det.details).map(d => `
          <div class="detail-item">
            <div class="detail-label">${d.label}</div>
            <div class="detail-value">${d.value}</div>
          </div>`).join('')}
      </div>
    </div>

    ${update2025Block}

    <div class="modal-section">
      <div class="modal-section-title">⚠ Points d'attention</div>
      <div class="alert-box">${det.alert || ''}</div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Sources & références</div>
      <div>${arr(det.sources).filter(Boolean).map(sourceBadge).join('')}</div>
    </div>
  `;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Associe une source à son site officiel (recherche limitée au domaine officiel,
// pour éviter les liens profonds qui changent). Premier motif qui correspond.
// Liens directs vérifiés (Légifrance, EUR-Lex, CAF) pour les sources principales.
const DIRECT_SOURCES = [
  [/2025-304/, 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000051409641'],
  [/2021-1131/, 'https://www.legifrance.gouv.fr/eli/decret/2021/8/30/SSAS2117575D/jo/texte'],
  [/Arrêté du 31 août 2021/, 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000044025618'],
  [/R\.?\s?2324-\d+/, 'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072665/LEGISCTA000006178555/'],
  [/L\.?\s?226-3\b/, 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045137055'],
  [/L\.?\s?4121-3/, 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043893923'],
  [/2005-102/, 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000809647'],
  [/RGPD/, 'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679'],
  [/Socle national de connaissances/, 'https://solidarites.gouv.fr/sites/solidarite/files/2026-09/SPPE-Socle-national-de-connaissances-pour-professionnels-petite-enfance.pdf'],
  [/Webinaire Petite enfance/, 'https://www.caf.fr/sites/default/files/medias/521/partenaires/supports%20webinaires/webinairepetiteenfance25juin2025.pdf'],
];
const OFFICIAL_SOURCES = [
  [/CSP|CASF|CSS\b|Code (du travail|pénal|des assurances|construction|général des impôts)|CGI|Décret|Arrêté|Loi n|Règlement CE|Règlement UE|RGPD|Circulaire|JO du|IDCC|CCN|Avenant|Norme/i, 'legifrance.gouv.fr'],
  [/Sénat|sénat/, 'senat.fr'],
  [/CNAF|CAF|COG|FNAS|Barème/i, 'caf.fr'],
  [/HAS|RNQAJE/, 'has-sante.fr'],
  [/DGCS|DGS|DGAL|DGESCO|Solidarités|SPPE|min\. /i, 'solidarites.gouv.fr'],
  [/CNIL/, 'cnil.fr'],
  [/INRS/, 'inrs.fr'],
  [/ANSES/, 'anses.fr'],
  [/SPF|Santé publique/, 'santepubliquefrance.fr'],
  [/AMF|Maire-info/, 'amf.asso.fr'],
  [/SNPPE/, 'snppe.fr'],
  [/Pros de la P/, 'lesprosdelapetiteenfance.fr'],
  [/Lassmat/, 'lassmat.fr'],
];
function officialSourceUrl(label) {
  const direct = DIRECT_SOURCES.find(([re]) => re.test(label));
  if (direct) return direct[1];
  const hit = OFFICIAL_SOURCES.find(([re]) => re.test(label));
  const q = (hit ? 'site:' + hit[1] + ' ' : '') + label;
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

// Source cliquable : accepte "texte", "texte https://url" ou {label, url}.
// Sans URL explicite, le lien ouvre une recherche web sur l'intitulé de la source.
function sourceBadge(s) {
  let label, url;
  if (s && typeof s === 'object') { label = s.label || s.url || ''; url = s.url; }
  else {
    const m = String(s).match(/^(.*?)\s*(https?:\/\/\S+)\s*$/);
    label = m ? (m[1] || m[2]) : String(s);
    url = m ? m[2] : null;
  }
  if (!url) url = officialSourceUrl(label);
  return `<a class="source-badge source-link" href="${url}" target="_blank" rel="noopener noreferrer" title="Ouvrir la source">📄 ${label} <span class="source-ext">↗</span></a>`;
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ─── PWA ────────────────────────────────────────────────────────────────────

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW error:', err));
  });
}

// Install prompt
let deferredPrompt = null;
const installBar = document.getElementById('installBar');
const offlineBadge = document.getElementById('offlineBadge');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Show install bar after 3 seconds if not dismissed before
  const dismissed = sessionStorage.getItem('pwa-dismissed');
  if (!dismissed) {
    setTimeout(() => installBar.classList.add('visible'), 3000);
  }
});

function triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      installBar.classList.remove('visible');
    }
    deferredPrompt = null;
  });
}

function dismissInstall() {
  installBar.classList.remove('visible');
  sessionStorage.setItem('pwa-dismissed', '1');
}

// Hide install bar once app is installed
window.addEventListener('appinstalled', () => {
  installBar.classList.remove('visible');
  deferredPrompt = null;
});

// Offline / online detection
function updateOnlineStatus() {
  if (!navigator.onLine) {
    offlineBadge.classList.add('visible');
  } else {
    offlineBadge.classList.remove('visible');
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

regloBootstrap();
