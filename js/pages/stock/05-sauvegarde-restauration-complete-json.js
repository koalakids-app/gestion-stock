
// ─── SAUVEGARDE / RESTAURATION COMPLÈTE (JSON) ───────────────────────────

function exportBackup() {
  const nom = getCrecheName();
  const payload = {
    version:      '1.0',
    creche:       nom,
    exportedAt:   new Date().toISOString(),
    articles:     ARTICLES,
    commandes:    COMMANDES,
    fournisseurs: FOURNISSEURS,
    historique:   HISTORIQUE,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `sauvegarde-${nom.replace(/\s+/g,'-')}-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showNotif(`💾 Sauvegarde téléchargée — ${ARTICLES.length} articles, ${COMMANDES.length} commandes`);
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.articles || !Array.isArray(data.articles)) {
        showNotif('⚠ Fichier invalide — format non reconnu'); return;
      }
      const dateStr = data.exportedAt
        ? new Date(data.exportedAt).toLocaleDateString('fr-FR') : '?';
      const msg = `Restaurer la sauvegarde "${data.creche||'?'}" du ${dateStr} ?\n\n`
        + `${data.articles.length} articles · ${(data.commandes||[]).length} commandes `
        + `· ${(data.fournisseurs||[]).length} fournisseurs\n\n⚠ Les données actuelles seront remplacées.`;
      if (!confirm(msg)) { event.target.value = ''; return; }

      ARTICLES.splice(0,     ARTICLES.length,     ...(data.articles     || []));
      COMMANDES.splice(0,    COMMANDES.length,    ...(data.commandes    || []));
      FOURNISSEURS.splice(0, FOURNISSEURS.length, ...(data.fournisseurs || []));
      HISTORIQUE.splice(0,   HISTORIQUE.length,   ...(data.historique   || []));

      if (data.creche) {
        localStorage.setItem(LS_NAME_KEY, data.creche);
        applyNomCreche(data.creche);
      }
      saveData();
      renderActiveInvTable(); renderStats(); renderCommandes();
      renderFournisseurs(); renderHistorique(); updateCounts();
      showNotif(`✅ Restauration réussie — ${data.articles.length} articles chargés`);
    } catch(err) {
      showNotif('⚠ Erreur de lecture : ' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function exportCSV() {
  const headers = ['Référence','Nom','Catégorie','Structure','Stock','Stock min','Prix unitaire','Montant total','Fournisseur','Notes'];
  const rows = ARTICLES.map(a => [
    a.ref, a.nom, a.cat, a.creche, a.stock, a.min,
    a.prix, (a.stock * a.prix).toFixed(2), a.fourn, a.notes
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));

  // Add per-structure totals at the bottom
  rows.push('');
  rows.push('"Récapitulatif par structure"');
  CRECHES.forEach(c => {
    const items = ARTICLES.filter(a => a.creche === c);
    const total = items.reduce((s,a) => s + a.stock * a.prix, 0);
    rows.push(`"${c}","","","","${items.length} articles","","","${total.toFixed(2)} €","",""`);
  });
  const totalGlobal = ARTICLES.reduce((s,a) => s + a.stock * a.prix, 0);
  rows.push(`"TOTAL GÉNÉRAL","","","","${ARTICLES.length} articles","","","${totalGlobal.toFixed(2)} €","",""`);

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `stocks-creches-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showNotif('⬇ Export CSV téléchargé');
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────
let notifTimer;
function cleanUrl(raw) {
  if (!raw) return '';
  // Extraire la première URL valide (http/https) dans la chaîne
  const match = raw.match(/https?:\/\/[^\s\]\)"'<>]+/);
  if (match) return match[0];
  // Lien collé sans schéma (ex. "amazon.fr/dp/...") : on ajoute https://
  const bare = raw.trim().match(/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?[^\s\]\)"'<>]*$/i);
  return bare ? 'https://' + bare[0] : '';
}

// Échappe une valeur pour l'injecter en toute sécurité dans un onclick="...('...')"
function jsAttr(raw) {
  return String(raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '');
}

function openUrl(raw, e) {
  if (e) e.stopPropagation();
  const url = cleanUrl(raw);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.openUrl = openUrl;

function showNotif(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 6000);
}

// ─── LIGNES D'ARTICLES DANS FORMULAIRE COMMANDE ──────────────────────────

let articleRowCount = 0;
const articleRowPhotos = {}; // idx → URL (ou base64 résiduel d'avant migration) pour l'aperçu
const articleRowFiles = {};  // idx → File brut, uniquement pour les photos nouvellement choisies cette session

function addArticleRow(qty='', nom='', prix='', url='', fourn='', cat='', photo='') {
  const idx = articleRowCount++;
  const container = document.getElementById('articles-rows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'article-row';
  row.id = `article-row-${idx}`;
  row.innerHTML = `
    <input type="number" id="row-qty-${idx}" value="${qty}" min="1" placeholder="Qté"
           oninput="calcCommandeTotal()" style="text-align:center">
    <div style="display:flex;flex-direction:column;border-right:1px solid var(--border)">
      <input type="text" id="row-nom-${idx}" value="${nom}" placeholder="Nom de l'article"
             style="border:none;border-bottom:1px solid var(--border);border-radius:0;flex:1">
      <input type="text" id="row-fourn-${idx}" value="${fourn||''}" placeholder="Fournisseur"
             list="fourn-list-${idx}"
             style="border:none;border-bottom:1px solid var(--border);border-radius:0;flex:1;font-size:11px;color:var(--ink2)">
      <datalist id="fourn-list-${idx}">${FOURNISSEURS.map(f=>`<option value="${f.nom}">`).join('')}</datalist>
      <input type="url" id="row-url-${idx}" value="${url}" placeholder="https://..."
             style="border:none;border-radius:0;flex:1;font-size:11px;color:var(--accent)">
    </div>
    <select id="row-cat-${idx}" style="border:none;border-right:1px solid var(--border);border-radius:0;padding:4px 6px;font-size:11px;background:var(--surface);color:var(--ink)">
      <option value="">— Cat. —</option>
      ${['Sensoriel','Manipulation','Construction','Motricité','Imitation','Expression artistique','Mobilier','Puériculture','Bureautique','Rangement','Décoration','Entretien','Cuisine','Couches'].map(c=>`<option value="${c}" ${cat===c?'selected':''}>${c}</option>`).join('')}
    </select>
    <input type="number" id="row-prix-${idx}" value="${prix}" min="0" step="0.01" placeholder="0.00"
           oninput="calcCommandeTotal()" style="text-align:right">
    <button class="del-row" onclick="removeArticleRow(${idx})" title="Supprimer">×</button>
    <div id="row-photo-zone-${idx}" style="grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:4px 8px 6px;border-top:1px solid var(--border);background:var(--bg);transition:background .15s"
         ondragover="handleRowDragOver(event,${idx})" ondragleave="handleRowDragLeave(event,${idx})" ondrop="handleRowDrop(event,${idx})">
      <label style="font-size:11px;color:var(--ink2);cursor:pointer;display:flex;align-items:center;gap:6px;margin:0">
        <input type="file" accept="image/*" style="display:none"
               onchange="handleRowPhoto(event,${idx})">
        <span id="row-photo-btn-${idx}" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px dashed var(--border);border-radius:5px;font-size:11px;color:var(--ink2);cursor:pointer;transition:border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          📷 ${photo ? 'Photo ✅' : 'Photo article'}
        </span>
      </label>
      <span style="font-size:10px;color:var(--ink3)">ou glissez-déposez une image</span>
      <img id="row-photo-prev-${idx}" src="${photo||''}" alt="" style="display:${photo?'block':'none'};height:36px;width:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">
      <button type="button" id="row-photo-del-${idx}" style="display:${photo?'inline-block':'none'};background:none;border:none;cursor:pointer;font-size:14px;color:var(--red);padding:0 4px" onclick="deleteRowPhoto(${idx})" title="Supprimer la photo">✕</button>
    </div>
  `;
  container.appendChild(row);
  if (photo) articleRowPhotos[idx] = photo; // reprend la photo de l'article/de la commande d'origine
  calcCommandeTotal();
}

function handleRowPhoto(event, idx) {
  const file = event.target.files[0];
  if (!file) return;
  processRowPhotoFile(file, idx);
}

function processRowPhotoFile(file, idx) {
  if (file.size > 5 * 1024 * 1024) { showNotif('⚠ Photo trop grande — max 5 Mo'); return; }
  if (!file.type.startsWith('image/')) { showNotif('⚠ Format non supporté'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    articleRowFiles[idx] = file; // fichier brut conservé pour upload Storage à la sauvegarde
    articleRowPhotos[idx] = e.target.result; // aperçu local uniquement, jamais envoyé en base
    const prev = document.getElementById(`row-photo-prev-${idx}`);
    const del  = document.getElementById(`row-photo-del-${idx}`);
    const btn  = document.getElementById(`row-photo-btn-${idx}`);
    if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
    if (del)  del.style.display = 'inline-block';
    if (btn)  btn.textContent = '📷 Photo ✅';
  };
  reader.readAsDataURL(file);
}

function handleRowDragOver(event, idx) {
  event.preventDefault();
  const z = document.getElementById(`row-photo-zone-${idx}`);
  if (z) z.style.background = 'var(--accent-lt)';
}

function handleRowDragLeave(event, idx) {
  const z = document.getElementById(`row-photo-zone-${idx}`);
  if (z) z.style.background = 'var(--bg)';
}

function handleRowDrop(event, idx) {
  event.preventDefault();
  const z = document.getElementById(`row-photo-zone-${idx}`);
  if (z) z.style.background = 'var(--bg)';
  const file = event.dataTransfer.files[0];
  if (file) processRowPhotoFile(file, idx);
}

function deleteRowPhoto(idx) {
  delete articleRowPhotos[idx];
  delete articleRowFiles[idx];
  const prev = document.getElementById(`row-photo-prev-${idx}`);
  const del  = document.getElementById(`row-photo-del-${idx}`);
  const btn  = document.getElementById(`row-photo-btn-${idx}`);
  if (prev) { prev.src = ''; prev.style.display = 'none'; }
  if (del)  del.style.display = 'none';
  if (btn)  btn.textContent = '📷 Photo article';
}

function removeArticleRow(idx) {
  const row = document.getElementById(`article-row-${idx}`);
  if (row) { row.remove(); calcCommandeTotal(); }
  delete articleRowPhotos[idx];
  delete articleRowFiles[idx];
}

function calcCommandeTotal() {
  const rows = document.querySelectorAll('.article-row');
  let total = 0;
  rows.forEach(row => {
    const idx = row.id.replace('article-row-', '');
    const qty  = parseFloat(document.getElementById(`row-qty-${idx}`)?.value) || 0;
    const prix = parseFloat(document.getElementById(`row-prix-${idx}`)?.value) || 0;
    total += qty * prix;
  });
  const field = document.getElementById('c-montant');
  if (field) field.value = total > 0 ? total.toFixed(2) : '';
}

function editArticleFromDetail(id) {
  // Fermer le modal détail sans remettre overflow à ''
  const detailModal = document.getElementById('modal-detail');
  if (detailModal) detailModal.classList.remove('open');
  // Ouvrir immédiatement le modal de modification
  editArticle(id);
}

function commanderArticle(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) { openModal('commande'); return; }

  // Open and reset modal
  resetCommandeModal();
  document.getElementById('modal-commande').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';

  // Set BC and date
  const bcField = document.getElementById('c-bc');
  const dateField = document.getElementById('c-date');
  if (dateField) dateField.value = new Date().toISOString().split('T')[0];

  // Pré-sélectionner la crèche de l'article
  const crecheSel = document.getElementById('c-creche-select');
  if (crecheSel && a.creche) crecheSel.value = a.creche;
  if (bcField) bcField.value = generateBC();

  // Pre-fill one article row with article data
  const container = document.getElementById('articles-rows');
  if (container) container.innerHTML = '';
  articleRowCount = 0;
  Object.keys(articleRowPhotos).forEach(k => delete articleRowPhotos[k]);
  Object.keys(articleRowFiles).forEach(k => delete articleRowFiles[k]);
  // Clean nom from any price/fourn suffixes
  const nomClean = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
  addArticleRow('1', nomClean, a.prix > 0 ? a.prix.toFixed(2) : '', a.url || '', a.fourn || '');
}

function resetArticleRows() {
  const container = document.getElementById('articles-rows');
  if (container) container.innerHTML = '';
  articleRowCount = 0;
  Object.keys(articleRowPhotos).forEach(k => delete articleRowPhotos[k]);
  Object.keys(articleRowFiles).forEach(k => delete articleRowFiles[k]);
  addArticleRow(); // Toujours au moins une ligne vide
}

// ─── PICKER : PARSER UNE LIGNE DE COMMANDE "3× Nom {Fourn} [cat:Cat] (12.50€) [url]" ──
function parseLigneArticle(ligne) {
  const m = ligne.match(/^[-•]?\s*(\d+)\s*[×xX]\s*(.+)/);
  if (!m) return null;
  const urlM = ligne.match(/\[(?!cat:)(.+?)\]$/);
  const pM   = ligne.match(/\((\d+[.,]?\d*)\s*€?\)/);
  const fM   = ligne.match(/\{(.+?)\}/);
  const catM = ligne.match(/\[cat:([^\]]+)\]/);
  return {
    qty:   parseInt(m[1]) || 1,
    url:   urlM ? urlM[1] : '',
    prix:  pM   ? parseFloat(pM[1].replace(',','.')) : 0,
    fourn: fM   ? fM[1] : '',
    cat:   catM ? catM[1] : '',
    nom:   m[2].replace(/\s*\{.*?\}\s*/g,'')
                .replace(/\s*\(\d+[.,]?\d*\s*€?\)\s*/g,'')
                .replace(/\s*\[cat:[^\]]+\]\s*/g,'')
                .replace(/\s*\[.*?\]\s*$/,'').trim(),
  };
}

// ─── PICKER 1 : CHOISIR DEPUIS LES ARTICLES EXISTANTS ──────────────────────
let pickerArticleSelection = new Set();

function openArticlePicker() {
  pickerArticleSelection = new Set();
  const search = document.getElementById('picker-article-search');
  if (search) search.value = '';
  renderArticlePickerList();
  document.getElementById('modal-article-picker').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function renderArticlePickerList() {
  const q = (document.getElementById('picker-article-search')?.value || '').toLowerCase();
  const crecheSel = document.getElementById('c-creche-select')?.value;
  let list = ARTICLES.filter(a =>
    (!q || a.nom.toLowerCase().includes(q) || (a.ref||'').toLowerCase().includes(q) || (a.fourn||'').toLowerCase().includes(q))
  );
  // Prioriser les articles de la crèche sélectionnée dans le tri, sans exclure les autres
  list = list.slice().sort((a,b) => {
    if (crecheSel) {
      const am = a.creche === crecheSel ? 0 : 1;
      const bm = b.creche === crecheSel ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return a.nom.localeCompare(b.nom);
  });

  const CAT_ICONS = { 'Sensoriel':'👂','Manipulation':'🤲','Construction':'🧱','Motricité':'🏃','Imitation':'🎭','Expression artistique':'🎨','Mobilier':'🪑','Puériculture':'🍼','Bureautique':'💻','Rangement':'🗂','Décoration':'🎀','Entretien':'🧹','Cuisine':'🍳' };
  const container = document.getElementById('picker-article-list');
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">Aucun article trouvé</div>`;
    return;
  }
  container.innerHTML = list.map(a => {
    const checked = pickerArticleSelection.has(a.id) ? 'checked' : '';
    const nomClean = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
    const thumb = a.photo
      ? `<img src="${a.photo}" alt="${nomClean}" style="width:32px;height:32px;border-radius:6px;object-fit:contain;background:var(--bg);flex-shrink:0" loading="lazy">`
      : `<span style="font-size:14px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;flex-shrink:0">${CAT_ICONS[a.cat]||'📦'}</span>`;
    return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <input type="checkbox" ${checked} onchange="togglePickerArticle(${a.id}, this.checked)" style="min-height:auto;width:16px;height:16px">
      ${thumb}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--ink)">${nomClean}</div>
        <div style="font-size:11px;color:var(--ink3)">${a.creche} · ${a.fourn||'—'} ${a.prix>0?`· ${a.prix.toFixed(2)} €`:''}</div>
      </div>
      ${getStockStatusBadgeHtml(a)}
    </label>`;
  }).join('');
}

function togglePickerArticle(id, checked) {
  if (checked) pickerArticleSelection.add(id);
  else pickerArticleSelection.delete(id);
  const cnt = document.getElementById('picker-article-count');
  if (cnt) cnt.textContent = `${pickerArticleSelection.size} article(s) sélectionné(s)`;
}

function confirmArticlePicker() {
  if (pickerArticleSelection.size === 0) { showNotif('⚠ Sélectionnez au moins un article'); return; }
  // Si la seule ligne présente est vide, on la retire avant d'ajouter les sélections
  removeEmptyTrailingRow();
  pickerArticleSelection.forEach(id => {
    const a = ARTICLES.find(x => x.id === id);
    if (!a) return;
    const nomClean = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
    addArticleRow('1', nomClean, a.prix > 0 ? a.prix.toFixed(2) : '', a.url || '', a.fourn || '', a.cat || '', a.photo || '');
  });
  showNotif(`✅ ${pickerArticleSelection.size} article(s) ajouté(s) à la commande`);
  closeModal('modal-article-picker');
}

// ─── PICKER : CHOISIR DES COUCHES ──────────────────────────────────────────
// Ajoute des lignes de couches à la commande en cours, exactement comme les
// articles du catalogue (même addArticleRow) : une fois ajoutées, ce sont des
// lignes de commande ordinaires — même formulaire, même historique, même
// export, même réception. Scopé à la crèche du bon de commande quand elle est
// choisie, pour ne pas noyer la liste avec les 6 structures.
let pickerCoucheSelection = new Set(); // clés "creche|type|taille"

function openCouchesPicker() {
  pickerCoucheSelection = new Set();
  renderCouchesPickerList();
  document.getElementById('modal-couches-picker').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function renderCouchesPickerList() {
  const crecheSel = document.getElementById('c-creche-select')?.value;
  const crechesAffichees = crecheSel ? [crecheSel] : CRECHES;
  const container = document.getElementById('picker-couches-list');
  if (!container) return;
  let html = '';
  crechesAffichees.forEach(creche => {
    COUCHES_PRODUITS.forEach(produit => {
      produit.tailles.forEach(taille => {
        const key = `${creche}|${produit.type}|${taille}`;
        const ev = coucheEvaluer(creche, produit.type, taille);
        const prixUnit = couchePrixUnitaire(produit.type, taille);
        const checked = pickerCoucheSelection.has(key) ? 'checked' : '';
        const badge = ev.enCritique ? '<span style="font-size:11px;font-weight:600;color:#991B1B">🚨 rupture proche</span>'
          : ev.enAlerte ? '<span style="font-size:11px;font-weight:600;color:var(--red)">⚠️ stock bas</span>' : '';
        html += `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
          <input type="checkbox" ${checked} onchange="togglePickerCouche('${key}', this.checked)" style="min-height:auto;width:16px;height:16px">
          <span style="font-size:14px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;flex-shrink:0">🧷</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--ink)">${produit.label} T${taille} — ${creche}</div>
            <div style="font-size:11px;color:var(--ink3)">Stock actuel : ${ev.stock} · ${ev.estimTexte}${prixUnit!==null?` · ${prixUnit.toFixed(2)} €`:''}</div>
          </div>
          ${badge}
        </label>`;
      });
    });
  });
  container.innerHTML = html || `<div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">Aucune référence de couche trouvée</div>`;
}

function togglePickerCouche(key, checked) {
  if (checked) pickerCoucheSelection.add(key);
  else pickerCoucheSelection.delete(key);
  const cnt = document.getElementById('picker-couches-count');
  if (cnt) cnt.textContent = `${pickerCoucheSelection.size} référence(s) sélectionnée(s)`;
}

function confirmCouchesPicker() {
  if (pickerCoucheSelection.size === 0) { showNotif('⚠ Sélectionnez au moins une référence'); return; }
  removeEmptyTrailingRow();
  pickerCoucheSelection.forEach(key => {
    const [creche, type, taille] = key.split('|');
    const produit = COUCHES_PRODUITS.find(p => p.type === type);
    const nom = `${produit ? produit.label : coucheLabel(type)} T${taille} — ${creche}`;
    const prixUnit = couchePrixUnitaire(type, taille);
    addArticleRow('1', nom, prixUnit !== null ? prixUnit.toFixed(2) : '', '', '', 'Couches', '');
  });
  showNotif(`✅ ${pickerCoucheSelection.size} référence(s) de couches ajoutée(s) à la commande`);
  closeModal('modal-couches-picker');
}
