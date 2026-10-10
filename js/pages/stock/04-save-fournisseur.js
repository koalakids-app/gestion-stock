
// ─── SAVE FOURNISSEUR ─────────────────────────────────────────────────────
let editingFournisseurId = null;

function editFournisseur(id) {
  const f = FOURNISSEURS.find(x => x.id === id);
  if (!f) return;
  editingFournisseurId = id;
  document.getElementById('modalFournisseurTitle').textContent = 'Modifier le fournisseur';
  document.getElementById('fn-nom').value     = f.nom;
  document.getElementById('fn-contact').value = f.contact !== '—' ? f.contact : '';
  document.getElementById('fn-tel').value     = f.tel !== '—' ? f.tel : '';
  document.getElementById('fn-email').value   = f.email || '';
  document.getElementById('fn-web').value     = f.web || '';
  document.getElementById('fn-delai').value   = f.delai || '';
  document.getElementById('fn-spec').value    = f.spec || 'Général';
  document.getElementById('fn-notes').value   = f.notes || '';
  document.getElementById('modal-fournisseur').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function deleteFournisseur(id) {
  const f = FOURNISSEURS.find(x => x.id === id);
  if (!f) return;
  const nb = ARTICLES.filter(a => a.fourn === f.nom).length;
  const msg = nb > 0
    ? `Supprimer "${f.nom}" ?

⚠ Ce fournisseur est utilisé par ${nb} article(s). Il sera retiré de leur fiche.`
    : `Supprimer "${f.nom}" ?`;
  if (!confirm(msg)) return;
  // Remove from articles
  if (nb > 0) ARTICLES.forEach(a => { if (a.fourn === f.nom) a.fourn = ''; });
  FOURNISSEURS = FOURNISSEURS.filter(x => x.id !== id);
  saveData();
  if (!IS_LOCAL) sbDelete('fournisseurs', id).catch(e => console.warn(e.message));
  renderFournisseurs();
  renderActiveInvTable();
  showNotif(`🗑 ${f.nom} supprimé`);
}

async function saveFournisseur() {
  const nom = document.getElementById('fn-nom').value.trim();
  if (!nom) { showNotif('⚠ Nom obligatoire'); return; }

  const data = {
    nom,
    contact: document.getElementById('fn-contact').value.trim() || '—',
    tel:     document.getElementById('fn-tel').value.trim() || '—',
    email:   document.getElementById('fn-email').value.trim(),
    web:     document.getElementById('fn-web').value.trim(),
    delai:   document.getElementById('fn-delai').value.trim(),
    spec:    document.getElementById('fn-spec').value,
    notes:   document.getElementById('fn-notes').value.trim(),
  };

  // Capture l'id AVANT de le remettre à null
  const isFournEdit = !!editingFournisseurId;
  const fournEditId  = editingFournisseurId;

  if (isFournEdit) {
    // Mode modification
    const oldNom = (FOURNISSEURS.find(f => f.id === fournEditId)||{}).nom;
    const idx = FOURNISSEURS.findIndex(f => f.id === fournEditId);
    if (idx >= 0) {
      FOURNISSEURS[idx] = { ...FOURNISSEURS[idx], ...data };
      // Mettre à jour le nom dans les articles si changé
      if (oldNom && oldNom !== nom) {
        ARTICLES.forEach(a => { if (a.fourn === oldNom) a.fourn = nom; });
        renderActiveInvTable();
      }
    }
    document.getElementById('modalFournisseurTitle').textContent = 'Ajouter un fournisseur';
    showNotif('✅ Fournisseur mis à jour');
    if (!IS_LOCAL) updateFournisseurDB({ id: fournEditId, ...data }).catch(()=>{});
  } else {
    // Mode ajout
    FOURNISSEURS.push({ id: Date.now(), ...data });
    showNotif('✅ Fournisseur ajouté');
    if (!IS_LOCAL) saveFournisseurDB(FOURNISSEURS[FOURNISSEURS.length-1]).catch(e => {
      showNotif('⚠ Erreur sauvegarde fournisseur : ' + e.message);
      console.error('[Fournisseur] Insert échoué :', e);
    });
  }

  editingFournisseurId = null;
  saveData();
  closeModal('modal-fournisseur');
  renderFournisseurs();
}

// ─── SHOW DETAIL ──────────────────────────────────────────────────────────
function showDetail(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  const pct = a.min === 0 ? 100 : Math.min(100, Math.round(a.stock / (a.min * 3) * 100));
  const [statusClass, statusLabel, barColor] =
    a.stock === 0 ? ['badge-red','Épuisé','#DC2626'] :
    a.stock <= a.min ? ['badge-amber','Stock bas','#D97706'] :
    ['badge-green','OK','#16A34A'];

  const nomClean = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
  document.getElementById('detail-title').textContent = nomClean;

  const CAT_ICONS = { 'Sensoriel':'👂','Manipulation':'🤲','Construction':'🧱','Motricité':'🏃','Imitation':'🎭','Expression artistique':'🎨','Mobilier':'🪑','Puériculture':'🍼','Bureautique':'💻','Rangement':'🗂','Décoration':'🎀','Entretien':'🧹','Cuisine':'🍳' };

  const photoBlock = a.photo
    ? `<div style="position:relative;margin-bottom:16px">
        <img src="${a.photo}" class="detail-photo" alt="${a.nom}">
        <button class="photo-preview-remove" style="top:8px;right:8px;width:30px;height:30px;font-size:13px" onclick="onRemoveArticlePhoto(${a.id})" title="Supprimer la photo">✕</button>
      </div>`
    : `<div class="detail-photo-placeholder" id="detail-photo-zone-${a.id}" onclick="triggerDetailPhotoUpload(${a.id})"
        ondragover="handleDetailDragOver(event, ${a.id})" ondragleave="handleDetailDragLeave(event, ${a.id})" ondrop="handleDetailDrop(event, ${a.id})">
        <div style="font-size:36px">${CAT_ICONS[a.cat]||'📦'}</div>
        <div style="font-size:13px;color:var(--ink2);font-weight:500">📷 Ajouter une photo</div>
        <div style="font-size:11px;color:var(--ink3)">Cliquez ou glissez-déposez une image ici</div>
        <input type="file" id="detail-photo-input-${a.id}" accept="image/*" style="display:none" onchange="handleDetailPhotoUpload(event, ${a.id})">
      </div>`;
  document.getElementById('detail-body').innerHTML = `
    ${photoBlock}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:var(--bg);border-radius:10px;padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--ink3);margin-bottom:6px">Stock actuel</div>
        <div style="font-family:'Syne',sans-serif;font-size:36px;font-weight:800;color:${barColor}">${a.stock}</div>
        <div class="stock-bar" style="margin-top:8px;width:100%"><div class="stock-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <span class="badge ${statusClass}" style="margin-top:8px">${statusLabel}</span>
      </div>
      <div style="background:var(--bg);border-radius:10px;padding:16px">
        <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--ink3);margin-bottom:6px">Informations</div>
        <table style="font-size:12px;width:100%;border-collapse:collapse">
          <tr><td style="color:var(--ink3);padding:3px 0">Référence</td><td style="font-weight:500">${a.ref}</td></tr>
          <tr><td style="color:var(--ink3);padding:3px 0">Catégorie</td><td style="font-weight:500">${a.cat}</td></tr>
          <tr><td style="color:var(--ink3);padding:3px 0">Structure</td><td style="font-weight:500">${a.creche}</td></tr>
          <tr><td style="color:var(--ink3);padding:3px 0">Stock min.</td><td style="font-weight:500">${a.min}</td></tr>
          <tr><td style="color:var(--ink3);padding:3px 0">Prix unitaire</td><td style="font-weight:500">${a.prix > 0 ? a.prix.toFixed(2)+' €' : '—'}</td></tr>
          <tr><td style="color:var(--ink3);padding:3px 0">Fournisseur</td><td style="font-weight:500">${a.fourn || '—'}</td></tr>
          <tr><td style="color:var(--ink3);padding:3px 0">Valeur stock</td><td style="font-weight:600;color:var(--accent)">${(a.stock*a.prix).toFixed(2)} €</td></tr>
          ${a.url ? `<tr><td style="color:var(--ink3);padding:3px 0">Lien</td><td><a href="#" onclick="openUrl('${jsAttr(a.url)}', event)" rel="noopener" style="color:var(--accent);font-size:12px">🔗 Voir</a></td></tr>` : ''}
          ${a.date_achat ? `<tr><td style="color:var(--ink3);padding:3px 0">Date d'achat</td><td style="font-weight:500">${new Date(a.date_achat).toLocaleDateString('fr-FR')}</td></tr>` : ''}
          ${a.depreciable === false
            ? `<tr><td style="color:var(--ink3);padding:3px 0">Type</td><td><span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#F0FDF4;color:#065F46">🧴 Consommable</span></td></tr>`
            : (() => {
                const etat = getArticleEtat(a);
                if (!etat) return '';
                const annees = a.date_achat ? ((Date.now() - new Date(a.date_achat)) / (365.25*24*3600*1000)).toFixed(1) : null;
                const residuel = annees ? Math.max(0, Math.round((1 - 0.20 * parseFloat(annees)) * 100)) : null;
                return `<tr><td style="color:var(--ink3);padding:3px 0">État</td><td>${getEtatBadgeHtml(etat)}${annees ? `<span style="font-size:11px;color:var(--ink3);margin-left:6px">${annees} ans · résiduel ${residuel}%</span>` : ''}</td></tr>`;
              })()
          }
        </table>
      </div>
    </div>
    ${a.notes ? `<div style="background:var(--amber-lt);border:1px solid #FDE68A;border-radius:8px;padding:12px;font-size:13px;color:#92400E;margin-bottom:16px">📌 ${a.notes}</div>` : ''}
    ${a.url ? `<div style="margin-bottom:16px"><a href="#" onclick="openUrl('${jsAttr(a.url)}', event)" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:var(--accent-lt);color:var(--accent);padding:10px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;border:1px solid #BFDBFE">🔗 Voir la fiche produit</a></div>` : ''}
    <div style="margin-bottom:8px;font-weight:600;font-size:13px">Ajuster le stock</div>
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn btn-secondary" onclick="onAdjustStock(${a.id}, -1)">− Retirer 1</button>
      <button class="btn btn-secondary" onclick="onAdjustStock(${a.id}, +1)">+ Ajouter 1</button>
      <input type="number" id="adj-qty" placeholder="Quantité" style="width:100px">
      <button class="btn btn-primary" onclick="onAdjustStockCustom(${a.id})">Valider</button>
    </div>`;

  document.getElementById('detail-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('modal-detail')">Fermer</button>
    <button class="btn btn-secondary" onclick="editArticleFromDetail(${a.id})">✏️ Modifier</button>
    <button class="btn btn-primary" onclick="closeModal('modal-detail');commanderArticle(${a.id})">🛒 Commander</button>`;

  document.getElementById('modal-detail').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

async function quickAdjust(id, delta) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  if (!skCanWrite(a.creche)) return;
  if (delta < 0 && a.stock === 0) { showNotif('⚠ Stock déjà à zéro'); return; }
  a.stock = Math.max(0, a.stock + delta);
  addHisto(delta > 0 ? 'entrée' : 'sortie', a.nom, delta, a.creche, 'Vous', 'Ajustement rapide');
  saveData();
  renderActiveInvTable();
  renderHistorique();
  showNotif(`${delta > 0 ? '📥 +1 entrée' : '📤 -1 sortie'} — ${a.nom} : ${a.stock} en stock`);
}

async function adjustStock(id, delta) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  if (!skCanWrite(a.creche)) return;
  a.stock = Math.max(0, a.stock + delta);
  addHisto(delta > 0 ? 'entrée' : 'sortie', a.nom, delta, a.creche, 'Vous', 'Ajustement manuel');
  saveData();
  renderActiveInvTable();
  renderHistorique();
  showDetail(id);
  showNotif(`${delta > 0 ? '📥' : '📤'} Stock mis à jour : ${a.stock} unité(s)`);
}

async function adjustStockCustom(id) {
  const qty = parseInt(document.getElementById('adj-qty').value);
  if (!qty || isNaN(qty)) { showNotif('⚠ Entrez une quantité'); return; }
  await adjustStock(id, qty);
}

// ─── HISTORIQUE HELPER ────────────────────────────────────────────────────
function addHisto(type, article, qty, creche, user, note='') {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR')+' '+now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  HISTORIQUE.unshift({ id: Date.now(), type, article, qty, creche, user, date: dateStr, note });
}

// ─── PAGES ────────────────────────────────────────────────────────────────
function showPage(page, btn) {
  currentPage = page;
  ['inventaire','commandes','fournisseurs','historique','couches'].forEach(p => {
    document.getElementById(`page-${p}`).style.display = p === page ? 'block' : 'none';
  });
  // Le contenu défile avec la fenêtre (.main n'a pas son propre scroll) : sans
  // ça, changer d'onglet après avoir fait défiler un long tableau (ex.
  // Inventaire) garde la même position et affiche un grand vide en haut
  // d'un onglet plus court comme Couches. On libère aussi un éventuel verrou
  // de scroll oublié par une fenêtre modale (document.body.style.overflow =
  // 'hidden' posé à l'ouverture, censé être retiré par closeModal()) : sans
  // ça, scrollTo(0,0) n'a aucun effet, la page restant bloquée.
  document.body.style.overflow = '';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const titles = { inventaire:'Inventaire', commandes:'Commandes', fournisseurs:'Fournisseurs', historique:'Historique des mouvements', couches:'Couches' };
  document.getElementById('pageTitle').textContent = titles[page];
  // Re-render page content when switching to ensure fresh data
  if (page === 'commandes') { renderCommandes(); }
  if (page === 'fournisseurs') { renderFournisseurs(); }
  if (page === 'historique') { renderHistorique(); }
  if (page === 'couches') { renderCouches(); }
  if (page === 'inventaire') {
    switchInvTab(currentInvTab); // réaffiche le bon tableau
    renderStats();
  }
}

function showTab(tab, btn) {
  ['en-cours','livrees','annulees'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Re-render when switching tabs to ensure fresh content
  renderCommandes();
}

// ─── EXPORT EXCEL PAR COMMANDE ───────────────────────────────────────────

function exportCommandeExcel(id) {
  if (typeof XLSX === 'undefined') { showNotif('⚠ SheetJS non disponible'); return; }
  const c = COMMANDES.find(x => x.id === id);
  if (!c) return;

  function parseArts(str) {
    return (str||'').split('\n').filter(Boolean).map(ligne => {
      const m    = ligne.match(/^[-•]?\s*(\d+)\s*[×xX]\s*(.+)/);
      const urlM = ligne.match(/\[(?!cat:)((?:https?:\/\/)?[^\]\s]+\.[^\]\s]+)\]/); // URL réelle uniquement, pas [cat:...]
      const pM   = ligne.match(/\((\d+[.,]?\d*)\s*€?\)/);
      const fM   = ligne.match(/\{(.+?)\}/);
      return {
        url:   urlM ? urlM[1] : '',
        prix:  pM   ? parseFloat(pM[1].replace(',','.')) : 0,
        fourn: fM   ? fM[1] : '',
        qty:   m    ? parseInt(m[1]) : 0,
        nom:   (m ? m[2] : ligne)
          .replace(/\s*\{.*?\}\s*/g,'')
          .replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'')
          .replace(/\s*\[.*?\]\s*$/,'').trim(),
      };
    });
  }

  const arts = parseArts(c.articles);
  const nom  = getCrecheName().toUpperCase();
  const wb   = XLSX.utils.book_new();

  // ── Feuille identique au modèle ─────────────────────────────────────────
  // Rows 1-4 vides, Row 5 = BC, Row 6 = crèche+date, Row 7 = headers
  // Articles : ligne nom/fourn/qty/prix/total puis ligne URL dessous
  const aoa = [
    ['', '', '', '', '', ''],  // row 1
    ['', '', '', '', '', ''],  // row 2
    ['', '', '', '', '', ''],  // row 3
    ['', '', '', '', '', ''],  // row 4
    ['Bon de commande :', c.bc || '—', '', '', '', ''],
    ['Nom de la crèche  :', nom, c.date || '', '', '', ''],
    ['Désignation', 'Fournisseur', 'Quantité', 'Prix Unitaire', 'Total', ''],
  ];

  const hyperlinks = {};
  let totalGeneral = 0;

  arts.forEach(art => {
    const total = Math.round((art.qty || 0) * (art.prix || 0) * 100) / 100;
    totalGeneral += total;
    aoa.push([
      art.nom,
      art.fourn || '',
      art.qty || 0,
      art.prix || 0,
      total || '',
      '',
    ]);
    // URL sur la ligne suivante — vrai hyperlien cliquable
    if (art.url) {
      const rowIdx = aoa.length;
      const ref = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
      hyperlinks[ref] = { Target: art.url, Tooltip: 'Voir le produit' };
      aoa.push(['🔗 Voir le produit', '', '', '', '', '']);
    } else {
      aoa.push(['', '', '', '', '', '']);
    }
  });

  // Total achats
  aoa.push(['Total achats', '', '', '', Math.round(totalGeneral * 100) / 100, '']);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Appliquer les hyperliens
  Object.entries(hyperlinks).forEach(([ref, link]) => {
    if (!ws[ref]) ws[ref] = { t:'s', v: link.Tooltip || link.Target };
    ws[ref].l = { Target: link.Target, Tooltip: link.Tooltip };
  });

  // Largeurs identiques au modèle
  ws['!cols'] = [
    { wch: 35.43 },
    { wch: 16.43 },
    { wch: 14.57 },
    { wch: 11.43 },
    { wch:  9.43 },
    { wch: 12.00 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Feuil1');
  const bc = (c.bc || 'bordereau').replace(/[^a-zA-Z0-9-]/g, '_');
  XLSX.writeFile(wb, `bordereau_${bc}.xlsx`);
  showNotif(`⬇ Bordereau ${c.bc || ''} exporté`);
}

let _currentBordereauHTML = '';

function printBordereau(id) {
  try {
    const c = COMMANDES.find(x => x.id === id);
    if (!c) { showNotif('⚠ Commande introuvable'); return; }

    function parseArts(str) {
      return (str||'').split('\n').filter(Boolean).map(ligne => {
        const m    = ligne.match(/^[-•]?\s*(\d+)\s*[×xX]\s*(.+)/);
        const urlM = ligne.match(/\[(.+?)\]$/);
        const pM   = ligne.match(/\((\d+[.,]?\d*)\s*€?\)/);
        const fM   = ligne.match(/\{(.+?)\}/);
        return {
          url:   urlM ? urlM[1] : '',
          prix:  pM   ? parseFloat(pM[1].replace(',','.')) : 0,
          fourn: fM   ? fM[1] : '',
          qty:   m    ? parseInt(m[1]) : 0,
          nom:   (m ? m[2] : ligne)
            .replace(/\s*\{.*?\}\s*/g,'')
            .replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'')
            .replace(/\s*\[.*?\]\s*$/,'').trim(),
        };
      });
    }

    const arts  = parseArts(c.articles);
    const nom   = getCrecheName();
    const total = arts.reduce((s,a) => s + (a.qty||0)*(a.prix||0), 0);

    const lignesHTML = arts.map(a => `
      <tr>
        <td style="padding:8px 10px;vertical-align:top;border-bottom:1px solid #E7E5E0"><strong>${a.nom}</strong></td>
        <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #E7E5E0;vertical-align:top">${a.fourn||'—'}</td>
        <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #E7E5E0;vertical-align:top">${a.qty||0}</td>
        <td style="padding:8px 10px;text-align:right;border-bottom:1px solid #E7E5E0;vertical-align:top">${a.prix ? a.prix.toFixed(2)+' €' : '—'}</td>
        <td style="padding:8px 10px;text-align:right;border-bottom:1px solid #E7E5E0;vertical-align:top;font-weight:600">${((a.qty||0)*(a.prix||0)).toFixed(2)} €</td>
      </tr>`).join('');

    const bordereauHTML = `
      <div style="background:white;padding:32px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);font-family:Arial,sans-serif;font-size:12px;color:#111;max-width:780px;margin:0 auto">
        <div style="border-bottom:3px solid #1C1917;padding-bottom:16px;margin-bottom:20px">
          <div style="font-size:20px;font-weight:bold;margin-bottom:8px">Bon de commande</div>
          <div style="display:flex;gap:32px;flex-wrap:wrap">
            <div><span style="color:#888">N° BC :</span> <strong>${c.bc||'—'}</strong></div>
            <div><span style="color:#888">Crèche :</span> <strong>${nom}</strong></div>
            <div><span style="color:#888">Date :</span> <strong>${c.date||'—'}</strong></div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#1C1917;color:white">
              <th style="padding:8px 10px;text-align:left;font-size:11px;width:28%">Désignation</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;width:16%">Fournisseur</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;width:8%">Qté</th>
              <th style="padding:8px 10px;text-align:right;font-size:11px;width:12%">Prix unit.</th>
              <th style="padding:8px 10px;text-align:right;font-size:11px;width:12%">Total</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;width:12%">Lien</th>
            </tr>
          </thead>
          <tbody>
            ${lignesHTML}
            <tr style="background:#EFF6FF">
              <td colspan="4" style="padding:10px;text-align:right;font-weight:bold;font-size:13px">Total achats</td>
              <td style="padding:10px;text-align:right;font-weight:bold;font-size:14px;color:#2563EB">${total.toFixed(2)} €</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        ${c.notes ? `<div style="margin-top:20px;background:#FEF9C3;border:1px solid #FDE68A;border-radius:6px;padding:12px"><strong>📌 Notes :</strong> ${c.notes}</div>` : ''}
        <div style="margin-top:32px;font-size:10px;color:#888;border-top:1px solid #E7E5E0;padding-top:12px">
          Bordereau généré le ${new Date().toLocaleDateString('fr-FR')} — ${nom}
        </div>
      </div>`;

    // Build print rows HTML (no nested template literals)
    const printRowsHTML = arts.map(a => {
      const lien = a.url ? '<a href="' + cleanUrl(a.url) + '" target="_blank" rel="noopener" style="color:#2563EB;text-decoration:none">🔗 Voir</a>' : '—';
      const t = ((a.qty||0)*(a.prix||0)).toFixed(2);
      return '<tr><td><strong>' + a.nom + '</strong></td>' +
        '<td style="text-align:center">' + (a.fourn||'—') + '</td>' +
        '<td style="text-align:center">' + (a.qty||0) + '</td>' +
        '<td style="text-align:right">' + (a.prix ? a.prix.toFixed(2)+' €' : '—') + '</td>' +
        '<td style="text-align:right;font-weight:600">' + t + ' €</td>' +
        '<td style="text-align:center">' + lien + '</td></tr>';
    }).join('');
    const notesHTML = c.notes ? '<div class="notes"><strong>📌 Notes :</strong> ' + c.notes + '</div>' : '';

    _currentBordereauHTML = '<!DOCTYPE html><html lang="fr"><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0">' +
      '<title>Bordereau ' + (c.bc||'') + '</title>' +
      '<style>' +
        'html { font-size: 18px !important; -webkit-text-size-adjust: 100%; }' +
        '* { margin:0; padding:0; box-sizing:border-box; }' +
        'body { font-family:Arial,sans-serif; color:#111; padding:24px; max-width:960px; margin:0 auto; }' +
        'h1 { font-size:1.8rem; font-weight:bold; margin-bottom:0.6rem; }' +
        '.meta { display:flex; gap:1.4rem; flex-wrap:wrap; margin-bottom:1.2rem; font-size:0.85rem; }' +
        '.meta span { color:#888; }' +
        'table { width:100%; border-collapse:collapse; margin-top:0.4rem; }' +
        'thead tr { background:#1C1917; color:white; }' +
        'th { padding:0.55rem 0.7rem; font-size:0.75rem; }' +
        'td { padding:0.55rem 0.7rem; border-bottom:1px solid #E7E5E0; font-size:0.8rem; vertical-align:top; }' +
        'tr:nth-child(even) td { background:#F9F9F8; }' +
        '.total-row td { background:#EFF6FF !important; font-weight:bold; font-size:0.9rem; }' +
        'a { color:#2563EB; text-decoration:none; }' +
        '.footer { margin-top:1.6rem; font-size:0.65rem; color:#888; border-top:1px solid #E7E5E0; padding-top:0.7rem; }' +
        '.notes { margin-top:1.1rem; background:#FEF9C3; border:1px solid #FDE68A; border-radius:4px; padding:0.7rem; font-size:0.8rem; }' +
        '@media print { html { font-size:12px; } @page { margin:1.5cm; } body { padding:0; } }' +
      '</style>' +
      '</head><body>' +
      '<h1>Bon de commande</h1>' +
      '<div class="meta">' +
        '<div><span>N° BC : </span><strong>' + (c.bc||'—') + '</strong></div>' +
        '<div><span>Crèche : </span><strong>' + getCrecheName() + '</strong></div>' +
        '<div><span>Date : </span><strong>' + (c.date||'—') + '</strong></div>' +
      '</div>' +
      '<table><thead><tr>' +
        '<th style="text-align:left;width:30%">Désignation</th>' +
        '<th style="text-align:center;width:16%">Fournisseur</th>' +
        '<th style="text-align:center;width:8%">Qté</th>' +
        '<th style="text-align:right;width:13%">Prix unit.</th>' +
        '<th style="text-align:right;width:13%">Total</th>' +
        '<th style="text-align:center;width:12%">Lien</th>' +
      '</tr></thead><tbody>' +
      printRowsHTML +
      '<tr class="total-row">' +
        '<td colspan="4" style="text-align:right">Total achats</td>' +
        '<td style="text-align:right;color:#2563EB">' + total.toFixed(2) + ' €</td>' +
        '<td></td>' +
      '</tr></tbody></table>' +
      notesHTML +
      '<div class="footer">Bordereau généré le ' + new Date().toLocaleDateString('fr-FR') + ' — ' + getCrecheName() + '</div>' +
      '</body></html>';

    // Ouvrir le modal de prévisualisation
    const previewBody  = document.getElementById('preview-body');
    const previewModal = document.getElementById('modal-preview');

    if (previewBody && previewModal) {
      previewBody.innerHTML = bordereauHTML;
      previewModal.classList.add('open');
      if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
    } else {
      // Modal introuvable — ouvrir directement
      console.error('modal-preview introuvable dans le DOM');
      doPrint();
    }
  } catch(e) {
    console.error('printBordereau error:', e);
    showNotif('⚠ Erreur : ' + e.message);
  }
}

function doPrint() {
  try {
    // Utiliser un iframe caché pour l'impression (compatible mobile/Chrome)
    const existing = document.getElementById('_print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = '_print-frame';
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(_currentBordereauHTML);
    doc.close();

    // Attendre le chargement des images/styles avant d'imprimer
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch(e) {
        showNotif('⚠ Erreur impression : ' + e.message);
      }
    };
  } catch(e) {
    showNotif('⚠ Erreur : ' + e.message);
  }
}

function telechargerBordereau() {
  // Télécharge le bordereau comme fichier HTML — peut être joint à un mail
  const bc = (_currentBordereauHTML.match(/Bordereau ([A-Z0-9-]+)/) || [])[1] || 'bordereau';
  const blob = new Blob([_currentBordereauHTML], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bordereau_${bc}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showNotif('⬇ Bordereau téléchargé — joignez-le à votre mail');
}

function ouvrirMailBordereau() {
  const bc  = _currentBordereauHTML.match(/N° BC.*?<strong>([^<]+)<\/strong>/)?.[1] || 'Bordereau';
  const nom = getCrecheName();
  const subject = encodeURIComponent(`Bon de commande ${bc} — ${nom}`);
  const body = encodeURIComponent(
    `Bonjour,\n\nVeuillez trouver ci-joint le bon de commande ${bc} de la crèche ${nom}.\n\n` +
    `(Pensez à joindre le fichier téléchargé via le bouton ⬇ Télécharger)\n\nCordialement`
  );
  // Télécharger en même temps pour que le fichier soit prêt à joindre
  telechargerBordereau();
  // Ouvrir le client mail avec sujet et corps pré-remplis
  setTimeout(() => {
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, 500);
}

async function partagerBordereau() {
  const bc = (_currentBordereauHTML.match(/Bordereau ([A-Z0-9-]+)</) || [])[1] || 'bordereau';
  const blob = new Blob([_currentBordereauHTML], { type: 'text/html;charset=utf-8' });
  const file = new File([blob], `bordereau_${bc}.html`, { type: 'text/html' });

  // Web Share API — fonctionne sur Android Chrome
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `Bordereau ${bc}`,
        files: [file],
      });
      return;
    } catch(e) {
      if (e.name !== 'AbortError') console.warn('Share failed:', e);
    }
  }
  // Fallback : téléchargement
  telechargerBordereau();
}
