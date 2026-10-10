
// ─── MODALS ───────────────────────────────────────────────────────────────
function openModal(type) {
  if (type === 'commande') {
    resetCommandeModal();
    resetArticleRows();
    const bcField = document.getElementById('c-bc');
    if (bcField && !bcField.dataset.editing) bcField.value = generateBC();
  }
  if (type === 'add') {
    editingId = null;
    document.getElementById('modalAddTitle').textContent = 'Ajouter un article';
    ['f-nom','f-ref'].forEach(id => document.getElementById(id).value = '');
    ['f-stock','f-prix'].forEach(id => document.getElementById(id).value = '');
    ['f-min','f-notes'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    ['f-cat','f-creche','f-fourn'].forEach(id => document.getElementById(id).value = '');
    // Directrice technique / employée : sa structure est la seule option, on la pose d'office
    // plutôt que de laisser un select vide qui bloque sur « champs obligatoires ».
    if (SK_WRITE_CRECHE) {
      const fc = document.getElementById('f-creche');
      if (fc && Array.from(fc.options).some(o => o.value === SK_WRITE_CRECHE)) {
        fc.value = SK_WRITE_CRECHE;
      }
    }
    majChampStructure();
    document.getElementById('f-url').value = '';
    const fDA = document.getElementById('f-date-achat'); if (fDA) fDA.value = '';
    const fEt = document.getElementById('f-etat'); if (fEt) fEt.value = '';
    const fDep = document.getElementById('f-depreciable'); if (fDep) fDep.checked = true;
    resetPhotoUpload();
  }
  if (type === 'fournisseur') {
    editingFournisseurId = null;
    document.getElementById('modalFournisseurTitle').textContent = 'Ajouter un fournisseur';
    ['fn-nom','fn-contact','fn-tel','fn-email','fn-web','fn-delai','fn-notes'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const fnSpec = document.getElementById('fn-spec'); if (fnSpec) fnSpec.value = 'Général';
  }
  document.getElementById(`modal-${type}`).classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function editArticle(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  editingId = id;
  document.getElementById('modalAddTitle').textContent = 'Modifier l\'article';
  document.getElementById('f-nom').value = a.nom.replace(/\s*\([\d.,]+[\s€]*\)\s*/g,'').replace(/\s*\{.*?\}\s*/g,'').trim();
  document.getElementById('f-ref').value = a.ref;
  document.getElementById('f-cat').value = a.cat;
  document.getElementById('f-creche').value = a.creche;
  majChampStructure();
  document.getElementById('f-stock').value = a.stock;
  document.getElementById('f-prix').value = a.prix;
  document.getElementById('f-fourn').value = a.fourn;
  document.getElementById('f-url').value = a.url || '';
  const fDateAchat = document.getElementById('f-date-achat');
  if (fDateAchat) fDateAchat.value = a.date_achat || '';
  const fEtat = document.getElementById('f-etat');
  if (fEtat) fEtat.value = a.etat_override || '';
  const fDep = document.getElementById('f-depreciable');
  if (fDep) fDep.checked = a.depreciable !== false;
  // f-min et f-notes supprimés — utiliser les champs cachés si présents
  const fMin = document.getElementById('f-min');
  if (fMin) fMin.value = a.min || 0;
  const fNotes = document.getElementById('f-notes');
  if (fNotes) fNotes.value = a.notes || '';

  // Restore photo preview if article has one
  if (a.photo) {
    showPhotoPreview(a.photo, a.photoName || 'Photo existante');
  } else {
    resetPhotoUpload();
  }

  document.getElementById('modal-add').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
  // Réinitialiser les inputs photo si on ferme le modal-add
  if (id === 'modal-add') {
    const fp = document.getElementById('f-photo'); if(fp) fp.value='';
    const fc = document.getElementById('f-photo-camera'); if(fc) fc.value='';
  }
}

// Modales de saisie : la fermeture au clic/toucher extérieur est désactivée pour
// éviter la perte de saisie en cas de toucher accidentel (clavier virtuel, scroll, etc.)
// Seuls le bouton ✕ ou "Annuler" permettent de les fermer (Échap reste actif partout).
const MODALS_SANS_FERMETURE_EXTERIEURE = [
  'modal-add', 'modal-commande', 'modal-fournisseur', 'modal-import'
];

function closeModalClick(e, id) {
  if (MODALS_SANS_FERMETURE_EXTERIEURE.includes(id)) return;
  if (e.target.classList.contains('modal-overlay')) closeModal(id);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => { m.classList.remove('open'); document.body.style.overflow = ''; }); });

// ─── SAVE ARTICLE ─────────────────────────────────────────────────────────
async function saveArticle() {
  const nom = document.getElementById('f-nom').value.trim();
  const cat = document.getElementById('f-cat').value;
  let creche = document.getElementById('f-creche').value;
  if (!creche && CATS_SANS_CRECHE.includes(cat)) {
    // Dernier recours : première vraie crèche proposée par le formulaire (valeur acceptée par la base)
    const optsReelles = Array.from(document.getElementById('f-creche').options).map(o => o.value).filter(Boolean);
    creche = SK_WRITE_CRECHE || (currentCreche !== 'all' ? currentCreche : '') || optsReelles[0] || CRECHES[0] || '';
  }
  const stock = parseInt(document.getElementById('f-stock').value) || 0;
  if (!nom || !cat || !creche) { showNotif('⚠ Remplissez les champs obligatoires'); return; }
  if (!skCanWrite(creche)) return;
  // Article existant rattache a une autre structure : modification refusee.
  if (editingId) {
    const prev = ARTICLES.find(a => a.id === editingId);
    if (prev && !skCanWrite(prev.creche)) return;
  }

  const articleId = editingId || Date.now();

  // Upload de la photo vers Supabase Storage (au lieu de stocker le base64 en base)
  let photoUrl = editingId ? (ARTICLES.find(a=>a.id===editingId)||{}).photo : null;
  if (currentPhotoFile) {
    try {
      showNotif('📤 Envoi de la photo…');
      photoUrl = await uploadPhotoToStorage(currentPhotoFile, articleId);
    } catch (err) {
      console.error('[Photo]', err.message);
      showNotif('❌ Erreur envoi photo — article enregistré sans photo');
      photoUrl = editingId ? (ARTICLES.find(a=>a.id===editingId)||{}).photo : null;
    }
  }

  const article = {
    id: articleId,
    nom,
    ref: document.getElementById('f-ref').value.trim() || `MAT-${String(Date.now()).slice(-4)}`,
    cat,
    creche,
    stock,
    min: parseInt((document.getElementById('f-min')||{}).value) || 0,
    prix: parseFloat(document.getElementById('f-prix').value) || 0,
    fourn: document.getElementById('f-fourn').value,
    notes: ((document.getElementById('f-notes')||{}).value||'').trim(),
    url:   document.getElementById('f-url').value.trim(),
    date_achat: (document.getElementById('f-date-achat')||{}).value || null,
    etat_override: (document.getElementById('f-etat')||{}).value || null,
    depreciable: document.getElementById('f-depreciable')?.checked !== false,
    photo: photoUrl,
    photoName: currentPhotoName || null,
  };

  // ── Optimistic update : UI immédiate, Supabase en arrière-plan ────────────
  const isNew = !editingId;
  if (isNew) {
    ARTICLES.push(article);
    addHisto('entrée', nom, stock, creche, 'Vous');
  } else {
    const idx = ARTICLES.findIndex(a => a.id === editingId);
    ARTICLES[idx] = article;
    addHisto('sortie', `${nom} mis à jour`, 0, creche, 'Vous');
  }
  saveData();

  currentPhotoData = null;
  currentPhotoName = null;
  currentPhotoFile = null;
  resetPhotoUpload();
  closeModal('modal-add');
  renderActiveInvTable();
  renderHistorique();
  updateCounts();
  showNotif(isNew ? '✅ Article ajouté' : '✅ Article mis à jour');

  // Persistance Supabase en arrière-plan (sans bloquer)
  if (!IS_LOCAL) {
    saveArticleDB(article, isNew).then(() => {
      if (isNew) saveHistoDB(HISTORIQUE[0]).catch(()=>{});
    }).catch(e => {
      console.error('[Supabase] saveArticle:', e);
      showNotif('⚠ Article enregistré localement — erreur Supabase');
    });
  }
}

async function deleteArticle(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) { showNotif('⚠ Article introuvable'); return; }
  if (!skCanWrite(a.creche)) return;
  if (!confirm('Supprimer "' + a.nom + '" définitivement ?')) return;
  ARTICLES = ARTICLES.filter(x => x.id !== id);
  saveData();
  if (!IS_LOCAL) {
    try { await deleteArticleDB(id); }
    catch(e) { console.warn('deleteArticle DB:', e.message); }
  }
  addHisto('sortie', a.nom + ' (supprimé)', 0, a.creche, 'Vous');
  await saveHistoDB(HISTORIQUE[0]).catch(()=>{});
  renderActiveInvTable();
  renderHistorique();
  updateCounts();
  showNotif('🗑 ' + a.nom + ' supprimé');
}

// ─── SAVE COMMANDE ────────────────────────────────────────────────────────
function generateBC() {
  // Utiliser la crèche sélectionnée dans le menu déroulant du bon de commande
  const sel = document.getElementById('c-creche-select');
  const crecheActive = (sel && sel.value) ? sel.value
    : ((currentCreche && currentCreche !== 'all') ? currentCreche : getCrecheName());
  const nom = crecheActive.replace(/\s+/g, '').substring(0, 8).toUpperCase();
  const now = new Date();
  const date = String(now.getFullYear()).slice(2) +
    String(now.getMonth()+1).padStart(2,'0') +
    String(now.getDate()).padStart(2,'0');
  const seq = COMMANDES.length + 1;
  return `${nom}-${date}-${String(seq).padStart(2,'0')}`;
}

// Upload toutes les photos de lignes nouvellement choisies (articleRowFiles) vers Storage,
// met à jour articleRowPhotos avec les URLs obtenues, et retourne le JSON final à persister.
// Les entrées déjà présentes dans articleRowPhotos sans fichier associé (URLs ou base64 résiduel
// d'une commande existante non modifiée) sont conservées telles quelles.
async function uploadRowPhotos(commandeId) {
  const idxToUpload = Object.keys(articleRowFiles);
  for (const idx of idxToUpload) {
    try {
      const url = await uploadPhotoToStorage(articleRowFiles[idx], `${commandeId}-${idx}`, 'commandes-photos');
      articleRowPhotos[idx] = url;
    } catch (err) {
      console.error('[Photo ligne commande]', idx, err.message);
      showNotif(`⚠ Photo ligne ${parseInt(idx)+1} non envoyée — ${err.message}`);
      // on laisse l'aperçu base64 existant dans articleRowPhotos[idx] plutôt que de le perdre
    }
    delete articleRowFiles[idx];
  }
  return Object.keys(articleRowPhotos).length > 0 ? JSON.stringify(articleRowPhotos) : null;
}

async function saveCommande_db() {
  // Un double-clic (ou un double-tap tactile, très facile sur "Passer la
  // commande") relançait cette fonction avant que le premier appel n'ait fini
  // d'attendre uploadRowPhotos — chaque appel poussait sa propre commande,
  // identique, avec le même BC déjà figé dans le champ. D'où des commandes
  // dupliquées à l'identique. Le bouton se désactive donc dès le premier
  // clic et jusqu'à la fin de l'opération, succès ou échec.
  const saveBtn = document.getElementById('btn-save-commande');
  if (saveBtn) { if (saveBtn.disabled) return; saveBtn.disabled = true; }
  try {
    const montant = parseFloat(document.getElementById('c-montant').value) || 0;
    const bc = document.getElementById('c-bc').value.trim() || generateBC();
    const articles = getArticlesFromRows();

    // Crèche = celle choisie dans le menu déroulant du bon de commande
    // Jamais de repli sur CRECHES[0] : une crèche devinée est une commande perdue,
    // soit refusée par skCanWrite, soit enregistrée sur la mauvaise structure.
    const crecheSel = document.getElementById('c-creche-select')?.value;
    const creche = crecheSel
      || SK_WRITE_CRECHE
      || (currentCreche && currentCreche !== 'all' ? currentCreche : '');
    if (!creche) {
      alert('Aucune structure sélectionnée — la commande n\'a pas été enregistrée.\n'
          + 'Choisissez la crèche dans le menu « Structure » puis réessayez.');
      return;
    }
    if (!skCanWrite(creche)) {
      alert('Commande non enregistrée : vous ne pouvez commander que pour '
          + SK_WRITE_CRECHE + ' (structure demandée : ' + creche + ').');
      return;
    }

    // Fournisseur = extraire du premier article renseigné
    const rows = document.querySelectorAll('.article-row');
    let fourn = '';
    rows.forEach(row => {
      if (!fourn) {
        const idx = row.id.replace('article-row-', '');
        const f = document.getElementById(`row-fourn-${idx}`)?.value?.trim();
        if (f) fourn = f;
      }
    });
    if (!fourn) fourn = '—';

    const commandeId = Date.now();

    // Upload des photos de lignes vers Supabase Storage (au lieu de stocker le base64 en base)
    remapRowPhotosToLineIndex();
    if (Object.keys(articleRowFiles).length > 0) showNotif('📤 Envoi des photos…');
    const photosJson = await uploadRowPhotos(commandeId);

    COMMANDES.push({
      id: commandeId,
      fourn, creche,
      date: document.getElementById('c-date').value,
      livraison: '',
      montant, bc,
      status: 'en-cours',
      articles: articles || '—',
      notes: document.getElementById('c-notes').value.trim(),
      url: '',
      photos_json: photosJson,
    });

    addHisto('commande', `Commande ${bc}`, 0, creche, 'Vous', `${fourn} — ${montant.toFixed(2)}€`);
    saveData();

    // UI immédiate, Supabase en arrière-plan
    closeModal('modal-commande');
    renderCommandes();
    renderHistorique();
    renderStats();
    showNotif('🛒 Commande enregistrée');

    if (!IS_LOCAL) {
      saveCommandeDB(COMMANDES[COMMANDES.length-1]).catch(e => {
        console.error('[Supabase] saveCommande:', e);
        showNotif('⚠ Commande locale — erreur Supabase : ' + e.message);
      });
    }
  } finally {
    // resetCommandeModal() (fermeture normale) ne touche pas .disabled : il
    // faut le réactiver explicitement, y compris sur les sorties anticipées
    // ci-dessus (structure manquante, droits insuffisants).
    if (saveBtn) saveBtn.disabled = false;
  }
}
async function markLivree(id) {
  const c = COMMANDES.find(x => x.id === id);
  if (!c) return;

  // Parser les articles de la commande pour proposer la mise à jour des stocks
  const lignes = (c.articles || '').split('\n').filter(Boolean);

  // Trouver les articles correspondants dans l'inventaire (même crèche)
  const updates = [];
  lignes.forEach(ligne => {
    // Format attendu : "3× Nom article" ou "3 x Nom article" ou "- 3 Nom article"
    const match = ligne.match(/^[-•]?\s*(\d+)\s*[×xX]\s*(.+)/);
    if (match) {
      const qty = parseInt(match[1]);
      const nom = match[2].trim().replace(/\s*\(.*?\)\s*$/, '').replace(/\s*\[.*?\]\s*$/, '').trim(); // enlever "(prix)"
      const article = ARTICLES.find(a =>
        a.creche === c.creche &&
        a.nom.toLowerCase().includes(nom.toLowerCase().substring(0, 10))
      );
      updates.push({ ligne, qty, nom, article });
    } else {
      updates.push({ ligne, qty: 0, nom: ligne, article: null });
    }
  });

  // Construire le modal de confirmation
  const lignesHtml = updates.map((u, i) => `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;
                padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:500">${u.nom}</div>
        ${u.article
          ? `<div style="font-size:11px;color:var(--green)">✅ Trouvé : ${u.article.nom} (stock actuel : ${u.article.stock})</div>`
          : `<div style="font-size:11px;color:var(--accent)">🆕 Sera créé automatiquement dans l'inventaire de ${c.creche}</div>`}
      </div>
      <div style="font-size:12px;color:var(--ink2)">Qté reçue :</div>
      <input type="number" id="livraison-qty-${i}" value="${u.qty}" min="0"
             style="width:60px;padding:4px 8px;border:1px solid var(--border);
                    border-radius:6px;font-family:inherit;font-size:13px;text-align:center">
    </div>`).join('');

  document.getElementById('modal-detail').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
  document.getElementById('detail-title').textContent = `📦 Réception commande ${c.bc}`;
  document.getElementById('detail-body').innerHTML = `
    <div style="font-size:13px;color:var(--ink2);margin-bottom:16px">
      Vérifiez les quantités reçues et validez pour mettre à jour l'inventaire de <strong>${c.creche}</strong>.
    </div>
    ${lignesHtml || '<div style="color:var(--ink3);font-size:13px">Aucun article à parser — stocks non mis à jour automatiquement.</div>'}
  `;
  document.getElementById('detail-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('modal-detail')">Annuler</button>
    <button class="btn btn-primary" onclick="confirmerLivraison(${id})">✅ Confirmer la réception</button>
  `;
}

async function confirmerLivraison(id) {
  const c = COMMANDES.find(x => x.id === id);
  if (!c) return;

  const lignes = (c.articles || '').split('\n').filter(Boolean);
  let updated = 0, created = 0;
  const articlesToSave = []; // { article, isNew }
  const histoToSave = [];    // entrées d'historique à pousser vers Supabase

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const m     = ligne.match(/^[-•]?\s*(\d+)\s*[×xX]\s*(.+)/);
    if (!m) continue;

    const urlM  = ligne.match(/\[(?!cat:)(.+?)\]$/);
    const pM    = ligne.match(/\((\d+[.,]?\d*)\s*€?\)/);
    const fM    = ligne.match(/\{(.+?)\}/);
    const catM  = ligne.match(/\[cat:([^\]]+)\]/);
    const art = {
      url:   urlM ? urlM[1] : '',
      prix:  pM   ? parseFloat(pM[1].replace(',','.')) : 0,
      fourn: fM   ? fM[1] : '',
      cat:   catM ? catM[1] : '',
      qty:   parseInt(m[1]) || 0,
      nom:   m[2].replace(/\s*\{.*?\}\s*/g,'')
                  .replace(/\s*\(\d+[.,]?\d*\s*€?\)\s*/g,'')
                  .replace(/\s*\[cat:[^\]]+\]\s*/g,'')
                  .replace(/\s*\[.*?\]\s*$/,'').trim(),
    };

    const input = document.getElementById(`livraison-qty-${i}`);
    const qty = input ? parseInt(input.value) || 0 : art.qty;
    if (qty <= 0) continue;

    // Ligne de couches (ajoutée via le picker 🧷) : créditer stock_couches,
    // jamais l'inventaire générique — sinon la réception crée une ligne
    // fantôme dans ARTICLES, invisible du décompte automatique et des
    // alertes de l'onglet Couches.
    if (art.cat === 'Couches') {
      const cible = coucheParseNomLigne(art.nom);
      // Une ligne éditée à la main peut ne plus correspondre à une vraie
      // crèche : mieux vaut retomber sur le circuit générique (ARTICLES) que
      // créer une ligne stock_couches sous un nom qui n'existe pas.
      if (cible && CRECHES.includes(cible.creche)) {
        try {
          await coucheCrediterReception(cible.creche, cible.type, cible.taille, qty);
          addHisto('entrée', art.nom, qty, cible.creche, 'Vous', `Réception ${c.bc}`);
          histoToSave.push(HISTORIQUE[0]);
          updated++;
        } catch(e) {
          console.error('[Couches] réception depuis commande :', e);
          showNotif('❌ Réception de "' + art.nom + '" impossible : ' + (e.message || e));
        }
        continue;
      }
    }

    let article = ARTICLES.find(a =>
      a.creche === c.creche &&
      a.nom.toLowerCase().includes(art.nom.toLowerCase().substring(0, 10))
    );

    let isNew = false;
    if (!article) {
      // Récupérer la photo de la ligne de commande si disponible
      let rowPhoto = null;
      if (c.photos_json) {
        try { const photos = JSON.parse(c.photos_json); rowPhoto = photos[i] || null; } catch(e) {}
      }
      article = {
        id: Date.now() + i,
        nom: art.nom,
        ref: `REC-${String(Date.now()).slice(-4)}`,
        cat: art.cat || 'Sensoriel',
        creche: c.creche,
        stock: qty,
        min: 0,
        prix: art.prix,
        fourn: art.fourn || '',
        notes: '',
        url: art.url || '',
        photo: rowPhoto,
        date_achat: c.livraison || c.date || new Date().toISOString().split('T')[0],
        etat_override: null,
      };
      ARTICLES.push(article);
      created++;
      isNew = true;
    } else {
      article.stock += qty;
      if (art.prix > 0 && article.prix === 0) article.prix = art.prix;
      if (art.url && !article.url) article.url = art.url;
      if (art.fourn && !article.fourn) article.fourn = art.fourn;
      // Mettre à jour la date d'achat avec la date de livraison
      article.date_achat = c.livraison || c.date || new Date().toISOString().split('T')[0];
      article.etat_override = null; // reset l'override — l'état repart de zéro (Neuf)
      updated++;
    }
    // Transférer la photo de commande si l'article n'en a pas encore
    if (!article.photo && c.photos_json) {
      try {
        const photos = JSON.parse(c.photos_json);
        if (photos[i]) article.photo = photos[i];
      } catch(e) { /* photos_json invalide */ }
    }
    articlesToSave.push({ article, isNew });
    addHisto('entrée', article.nom, qty, article.creche, 'Vous', `Réception ${c.bc}`);
    histoToSave.push(HISTORIQUE[0]);
  }

  c.status = 'livrees';
  saveData();
  closeModal('modal-detail');
  renderActiveInvTable();
  renderCommandes();
  renderHistorique();
  renderStats();
  updateCounts();

  // Persister dans Supabase : articles créés/mis à jour, statut de la commande, historique
  if (!IS_LOCAL) {
    for (const { article, isNew } of articlesToSave) {
      await saveArticleDB(article, isNew).catch(e => console.warn('[Livraison] article DB:', e.message));
    }
    await updateCommandeDB(c).catch(e => console.warn('[Livraison] commande DB:', e.message));
    for (const h of histoToSave) {
      await saveHistoDB(h).catch(e => console.warn('[Livraison] histo DB:', e.message));
    }
  }

  let msg = '✅ Livraison confirmée';
  if (updated > 0) msg += ` — ${updated} stock(s) mis à jour`;
  if (created > 0) msg += ` — ${created} article(s) créé(s)`;
  showNotif(msg);
}

function resetCommandeModal() {
  // Reset titre
  const h2 = document.querySelector('#modal-commande h2');
  if (h2) h2.textContent = 'Nouvelle commande';
  // Reset bouton via id (plus fiable que querySelector)
  const saveBtn = document.getElementById('btn-save-commande');
  if (saveBtn) {
    saveBtn.textContent = '🛒 Passer la commande';
    saveBtn.onclick = () => onSaveCommande();
  }
  // Reset BC editing state
  const bcField = document.getElementById('c-bc');
  if (bcField) delete bcField.dataset.editing;
  // Reset notes
  const notesField = document.getElementById('c-notes');
  if (notesField) notesField.value = '';
  // Reset date to today
  const dateField = document.getElementById('c-date');
  if (dateField) dateField.value = new Date().toISOString().split('T')[0];
  // Pré-sélectionner la crèche.
  // Attention : pour une directrice technique, skRestrictCrecheSelects() a retiré toutes les
  // options sauf la sienne. Affecter une valeur absente de la liste vide le select
  // (selectedIndex = -1) sans erreur, et la commande partait alors sur CRECHES[0],
  // où l'écriture lui est refusée : elle n'était jamais enregistrée.
  const crecheSel = document.getElementById('c-creche-select');
  if (crecheSel) {
    const dispo = Array.from(crecheSel.options).map(o => o.value);
    const voulue = SK_WRITE_CRECHE
      || ((currentCreche && currentCreche !== 'all') ? currentCreche : CRECHES[0]);
    crecheSel.value = dispo.includes(voulue) ? voulue : (dispo[0] || '');
  }
}

// Régénère le N° de bon de commande quand on change de crèche (sauf en modification)
function onChangeCommandeCreche() {
  const bcField = document.getElementById('c-bc');
  if (!bcField) return;
  if (!bcField.dataset.editing) {
    // Nouvelle commande : on régénère entièrement le numéro
    bcField.value = generateBC();
    return;
  }
  // Commande existante : on remplace seulement le préfixe (nom de crèche)
  // tout en gardant la date et le numéro de séquence d'origine
  const sel = document.getElementById('c-creche-select');
  const nom = (sel?.value || '').replace(/\s+/g, '').substring(0, 8).toUpperCase();
  if (!nom) return;
  const parts = bcField.value.split('-');
  if (parts.length >= 2) {
    parts[0] = nom;
    bcField.value = parts.join('-');
  } else {
    bcField.value = nom;
  }
}

function editCommande(id) {
  const c = COMMANDES.find(x => x.id === id);
  if (!c) return;

  // Open modal
  document.getElementById('modal-commande').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
  document.querySelector('#modal-commande h2').textContent = '✏️ Modifier la commande';

  // Fill fields
  const bcField = document.getElementById('c-bc');
  if (bcField) { bcField.value = c.bc; bcField.dataset.editing = id; }
  const dateField = document.getElementById('c-date');
  if (dateField) dateField.value = c.date || '';
  const notesField = document.getElementById('c-notes');
  if (notesField) notesField.value = c.notes || '';
  const crecheSel = document.getElementById('c-creche-select');
  if (crecheSel && c.creche) crecheSel.value = c.creche;

  // Reset and fill article rows
  resetArticleRows();
  // Recharger les photos existantes de la commande
  if (c.photos_json) {
    try {
      const savedPhotos = JSON.parse(c.photos_json);
      Object.assign(articleRowPhotos, savedPhotos);
    } catch(e) {}
  }
  const lignes = (c.articles || '').split('\n').filter(Boolean);
  if (lignes.length > 0) {
    // Remove the empty row added by resetArticleRows
    const container = document.getElementById('articles-rows');
    if (container) container.innerHTML = '';
    articleRowCount = 0;
    lignes.forEach(ligne => {
      const m    = ligne.match(/^[-•]?\s*(\d+)\s*[×xX]\s*(.+)/);
      const urlM = ligne.match(/\[(?!cat:)(.+?)\]$/);
      const pM   = ligne.match(/\((\d+[.,]?\d*)\s*€?\)/);
      const fM   = ligne.match(/\{(.+?)\}/);
      const catM = ligne.match(/\[cat:([^\]]+)\]/);
      const qty  = m ? m[1] : '';
      const fourn= fM ? fM[1] : '';
      const cat  = catM ? catM[1] : '';
      const prix = pM ? pM[1].replace(',','.') : '';
      const url  = urlM ? urlM[1] : '';
      // Ordre important : retirer l'URL finale AVANT les prix, sinon "(prix€) [url]"
      // laisse le prix dans le nom et chaque modification en ajoute un de plus.
      const nom  = (m ? m[2] : ligne)
        .replace(/\s*\[cat:[^\]]*\]\s*/g,' ')
        .replace(/\s*\[.*?\]\s*$/,'')
        .replace(/\s*\{.*?\}\s*/g,' ')
        .replace(/(?:\s*\(\d+[.,]?\d*\s*€\))+\s*$/,'').trim();
      addArticleRow(qty, nom, prix, url, fourn, cat);
    });
    // Restaurer les aperçus photos dans les rows
    Object.entries(articleRowPhotos).forEach(([idx, dataUrl]) => {
      const prev = document.getElementById(`row-photo-prev-${idx}`);
      const del  = document.getElementById(`row-photo-del-${idx}`);
      const btn  = document.getElementById(`row-photo-btn-${idx}`);
      if (prev) { prev.src = dataUrl; prev.style.display = 'block'; }
      if (del)  del.style.display = 'inline-block';
      if (btn)  btn.textContent = '📷 Photo ✅';
    });
  }

  // Update montant
  const montField = document.getElementById('c-montant');
  if (montField) montField.value = c.montant || '';

  // Change save button to update
  const saveBtn = document.getElementById('btn-save-commande');
  if (saveBtn) {
    saveBtn.textContent = '💾 Mettre à jour';
    saveBtn.onclick = () => onUpdateCommande(id).catch(e => { showNotif('⚠ Erreur : '+e.message); console.error(e); });
  }
}

async function onUpdateCommande(id) {
  const c = COMMANDES.find(x => x.id === id);
  if (!c) return;
  if (!skCanWrite(c.creche)) return;
  const cibleCreche = document.getElementById('c-creche-select')?.value;
  if (cibleCreche && !skCanWrite(cibleCreche)) return;
  // Même précaution qu'à la création (saveCommande_db) : un double-clic ne
  // dupliquerait pas la commande ici (c'est une mise à jour en place), mais
  // relancerait l'upload des photos et l'appel Supabase en double.
  const saveBtn = document.getElementById('btn-save-commande');
  if (saveBtn) { if (saveBtn.disabled) return; saveBtn.disabled = true; }
  try {
    c.date     = document.getElementById('c-date')?.value || c.date;
    c.notes    = document.getElementById('c-notes')?.value.trim() || '';
    c.articles = getArticlesFromRows();
    c.montant  = parseFloat(document.getElementById('c-montant')?.value) || c.montant;
    c.bc       = document.getElementById('c-bc')?.value.trim() || c.bc;
    c.creche   = document.getElementById('c-creche-select')?.value || c.creche;

    // Upload des nouvelles photos de lignes vers Supabase Storage avant sauvegarde
    remapRowPhotosToLineIndex();
    if (Object.keys(articleRowFiles).length > 0) showNotif('📤 Envoi des photos…');
    const newPhotosJson = await uploadRowPhotos(id);
    c.photos_json = newPhotosJson || c.photos_json || null;

    resetCommandeModal();
    saveData();
    closeModal('modal-commande');
    if (!IS_LOCAL) updateCommandeDB(c).then(() => saveData()).catch(()=>{});
    renderCommandes();
    showNotif('✅ Commande mise à jour');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function toggleTraitee(id) {
  const c = COMMANDES.find(x => x.id === id);
  if (!c) return;
  c.traitee_le = c.traitee_le ? null : new Date().toISOString();
  c.traitee_touched = true;
  saveData();
  if (!IS_LOCAL) await updateCommandeDB(c).catch(()=>{});
  renderCommandes();
  showNotif(c.traitee_le ? '👁 Commande marquée vue et traitée' : '↩️ Commande marquée non traitée');
}

async function annulerCommande(id) {
  const c = COMMANDES.find(x => x.id === id);
  if (!c) return;
  if (!skCanWrite(c.creche)) return;
  if (!confirm(`Annuler la commande ${c.bc} (${c.fourn}) ?`)) return;
  c.status = 'annulees';
  saveData();
  if (!IS_LOCAL) await updateCommandeDB(c).catch(()=>{});
  addHisto('sortie', `Annulation ${c.bc}`, 0, c.creche, 'Vous', `${c.fourn}`);
  await saveHistoDB(HISTORIQUE[0]).catch(()=>{});
  renderCommandes();
  renderHistorique();
  renderStats();
  showNotif('❌ Commande annulée');
}

async function deleteCommande(id) {
  const c = COMMANDES.find(x => x.id === id);
  if (!c) { showNotif('⚠ Commande introuvable'); return; }
  if (c.status !== 'annulees') { showNotif('⚠ Seule une commande annulée peut être supprimée'); return; }
  if (!skCanWrite(c.creche)) return;
  if (!confirm(`Supprimer définitivement la commande ${c.bc} (${c.fourn}) ?`)) return;
  COMMANDES = COMMANDES.filter(x => x.id !== id);
  saveData();
  if (!IS_LOCAL) {
    try { await deleteCommandeDB(id); }
    catch(e) { console.warn('deleteCommande DB:', e.message); }
  }
  addHisto('sortie', `Commande ${c.bc} (supprimée)`, 0, c.creche, 'Vous');
  await saveHistoDB(HISTORIQUE[0]).catch(()=>{});
  renderCommandes();
  renderHistorique();
  renderStats();
  showNotif('🗑 Commande supprimée');
}
