
// ─── RENDER COMMANDES ─────────────────────────────────────────────────────
function renderCommandes() {
  const statusMap = { 'en-cours': ['badge-amber','⏳ En attente'], 'livrees': ['badge-green','✅ Livrée'], 'annulees': ['badge-red','❌ Annulée'] };

  function renderCards(list, showActions, showDelete) {
    if (list.length === 0) return `<div class="empty"><div class="icon">🛒</div><p>Aucune commande.</p></div>`;
    return list.map(c => {
      const [badgeCls, badgeTxt] = statusMap[c.status] || ['badge-gray','—'];
      const items = (c.articles||'').split('\n').filter(Boolean);
      return `<div class="commande-card">
        <div>
          <div class="commande-title">🏭 ${c.fourn} — <span style="color:var(--ink2);font-weight:400">${c.creche}</span></div>
          <div class="commande-meta">
            <span>📅 Commandé le ${c.date}</span>
            <span>📄 ${c.bc}</span>
          </div>
          <div class="commande-items">
            ${items.map(i => {
              // Parser le lien éventuel : "3× Nom (prix€) [https://...]" — uniquement une vraie URL, pas [cat:...]
              const urlMatch = i.match(/\[(?!cat:)((?:https?:\/\/)?[^\]\s]+\.[^\]\s]+)\]/);
              const lineUrl = urlMatch ? urlMatch[1] : null;
              const lineText = i.replace(/\s*\[(?!cat:)(?:https?:\/\/)?[^\]\s]+\.[^\]\s]+\]\s*$/, '');
              return `<div class="commande-item-row">
                <span>${lineText}</span>
                ${lineUrl ? `<a href="#" onclick="openUrl('${jsAttr(lineUrl)}',event)"
                   style="font-size:11px;color:var(--accent);text-decoration:none;white-space:nowrap">🔗 Voir</a>` : ''}
              </div>`;
            }).join('')}
          </div>
          ${c.notes ? `<div style="margin-top:8px;font-size:12px;color:var(--amber);background:var(--amber-lt);padding:6px 10px;border-radius:6px">📌 ${c.notes}</div>` : ''}
          ${c.url ? `<div style="margin-top:8px"><a href="#" onclick="openUrl('${jsAttr(c.url)}', event)" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--accent);background:var(--accent-lt);padding:6px 12px;border-radius:6px;text-decoration:none;font-weight:500">🔗 Accéder à la commande en ligne</a></div>` : ''}
        </div>
        <div>
          <div class="commande-total-label">Total</div>
          <div class="commande-total">${(c.montant||0).toFixed(2)} €</div>
          <span class="badge ${badgeCls}" style="margin-top:8px;display:block;text-align:center">${badgeTxt}</span>
          ${c.traitee_le ? `<span class="badge badge-green" style="margin-top:6px;display:block;text-align:center" title="Vue et traitée le ${new Date(c.traitee_le).toLocaleString('fr-FR')}">👁 Vue et traitée le ${new Date(c.traitee_le).toLocaleDateString('fr-FR')}</span>` : ''}
          ${showActions ? `
          <button class="btn ${c.traitee_le ? 'btn-secondary' : 'btn-primary'} btn-sm" style="margin-top:6px;width:100%" onclick="onToggleTraitee(${c.id})">${c.traitee_le ? '↩️ Marquer non traitée' : '👁 Vue et traitée'}</button>` : ''}
          <button class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%" onclick="exportCommandeExcel(${c.id})">⬇ Excel</button>
          <button class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%" onclick="printBordereau(${c.id})">🖨 PDF / Imprimer</button>
          ${showActions ? `
          <button class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%" onclick="editCommande(${c.id})">✏️ Modifier</button>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px;width:100%" onclick="onMarkLivree(${c.id})">✅ Marquer livré</button>
          <button class="btn btn-danger btn-sm" style="margin-top:6px;width:100%" onclick="onAnnulerCommande(${c.id})">❌ Annuler</button>` : ''}
          ${showDelete ? `
          <button class="btn btn-danger btn-sm" style="margin-top:6px;width:100%" onclick="onDeleteCommande(${c.id})">🗑 Supprimer</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  const crecheFilter = (typeof currentCreche !== 'undefined' && currentCreche !== 'all') ? currentCreche : null;
  const filterCmd = c => !crecheFilter || c.creche === crecheFilter;
  const enCours  = COMMANDES.filter(c => c.status === 'en-cours'  && filterCmd(c));
  const livrees  = COMMANDES.filter(c => c.status === 'livrees'   && filterCmd(c));
  const annulees = COMMANDES.filter(c => c.status === 'annulees'  && filterCmd(c));

  document.getElementById('tab-en-cours').innerHTML  = renderCards(enCours, true);
  document.getElementById('tab-livrees').innerHTML   = renderCards(livrees, false);
  document.getElementById('tab-annulees').innerHTML  = renderCards(annulees, false, true);

  // Mettre à jour les compteurs dans les onglets
  const tabBtns = document.querySelectorAll('#page-commandes .tab-btn');
  const counts = [enCours.length, livrees.length, annulees.length];
  const labels = ['En cours', 'Livrées', 'Annulées'];
  tabBtns.forEach((btn, i) => {
    if (counts[i] !== undefined) btn.textContent = `${labels[i]} (${counts[i]})`;
  });
}

// ─── RENDER FOURNISSEURS ──────────────────────────────────────────────────
const FOURN_ICONS = { 'Général':'🧩','Imitation & Expression':'📚','Motricité':'🏃','Expression artistique':'🎨','Motricité':'🌳','Puériculture':'🧴' };

// ─── MISE À JOUR DYNAMIQUE DES LISTES FOURNISSEURS ───────────────────────
function updateFournisseurSelects() {
  const options = '<option value="">-- Choisir --</option>' +
    FOURNISSEURS.map(f => `<option value="${f.nom}">${f.nom}</option>`).join('');
  ['f-fourn', 'c-fourn'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value; // conserver la valeur sélectionnée
    sel.innerHTML = options;
    sel.value = current; // restaurer si possible
  });
}

function renderFournisseurs() {
  updateFournisseurSelects();
  document.getElementById('fournisseursList').innerHTML = FOURNISSEURS.map(f => `
    <div class="fournisseur-card">
      <div class="fournisseur-avatar" style="background:var(--bg)">${FOURN_ICONS[f.spec]||'🏭'}</div>
      <div class="fournisseur-info">
        <div class="fournisseur-name">${f.nom}</div>
        <div class="fournisseur-meta">
          ${f.contact !== '—' ? `👤 ${f.contact} &nbsp;` : ''}
          ${f.tel !== '—' ? `📞 ${f.tel} &nbsp;` : ''}
          📧 ${f.email} &nbsp;
          🚚 ${f.delai}
          ${f.notes ? `<br>📌 ${f.notes}` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <span class="badge badge-purple">${f.spec}</span>
        <span style="font-size:12px;color:var(--ink3)">${ARTICLES.filter(a=>a.fourn===f.nom).length} articles</span>
        ${f.web && f.web !== '—' ? `<a href="#" onclick="openUrl('${jsAttr(f.web)}', event)" class="btn btn-secondary btn-sm">🌐 Site</a>` : ''}
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editFournisseur(${f.id})">✏️ Modifier</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteFournisseur(${f.id})">🗑 Supprimer</button>
        </div>
      </div>
    </div>`).join('');
}

// ─── RENDER HISTORIQUE ────────────────────────────────────────────────────
const HISTO_ICONS = { entrée:['📥','var(--green-lt)'], sortie:['📤','var(--amber-lt)'], commande:['🛒','var(--accent-lt)'] };

function renderHistorique() {
  let data = currentHisto === 'all' ? HISTORIQUE : HISTORIQUE.filter(h => h.type === currentHisto);
  document.getElementById('histoList').innerHTML = data.map((h,i) => {
    const [icon, bg] = HISTO_ICONS[h.type] || ['📋','var(--bg)'];
    const qtyStr = h.qty > 0 ? `<span class="histo-qty" style="color:var(--green)">+${h.qty}</span>` :
                   h.qty < 0 ? `<span class="histo-qty" style="color:var(--red)">${h.qty}</span>` : '';
    return `<div class="histo-row" style="animation-delay:${i*0.04}s">
      <div class="histo-icon" style="background:${bg}">${icon}</div>
      <div class="histo-info">
        <div class="histo-action">${h.article}</div>
        <div class="histo-detail">
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:6px;height:6px;border-radius:50%;background:${CRECHE_COLORS[h.creche]||'#888'}"></span>
            ${h.creche}
          </span>
          &nbsp;·&nbsp; ${h.user}
          ${h.note ? `&nbsp;·&nbsp; ${h.note}` : ''}
        </div>
      </div>
      ${qtyStr}
      <div class="histo-date">${h.date}</div>
    </div>`;
  }).join('');
}

// ─── COUCHES ──────────────────────────────────────────────────────────────
// Le stock lui-même se décompte tout seul (trigger côté base sur chaque
// « Change » du suivi — sql/stock_couches.sql). Ici on affiche juste l'état
// courant, une estimation « jours restants » à partir de la conso des 14
// derniers jours, et deux actions manuelles : réception d'une commande et
// correction ponctuelle du stock.
function coucheLabel(type) { return type === 'culotte' ? 'Couches-culottes' : 'Couches classiques'; }

function coucheFind(creche, type, taille) {
  return COUCHES.find(c => c.creche === creche && c.typeCouche === type && c.taille === taille);
}

// ── Valorisation ────────────────────────────────────────────────────────
// Prix d'achat unitaire par type×taille, saisi une fois par la direction
// depuis la vraie facture fournisseur (sql/stock_couches_prix.sql) — jamais
// déduit d'un tarif public en ligne, qui ne reflète pas un prix pro négocié.
function couchePrixUnitaire(type, taille) {
  const p = COUCHES_PRIX.find(x => x.typeCouche === type && x.taille === taille);
  return p ? p.prixUnitaire : null;
}

// Nombre d'enfants portant actuellement ce type/cette taille dans une crèche
// (fiche enfant → Protection). Sert de repli pour l'estimation « jours
// restants » — voir COUCHES_EFFECTIF plus haut.
function coucheEffectif(creche, type, taille) {
  const e = COUCHES_EFFECTIF.find(x => x.creche === creche && x.typeCouche === type && x.taille === taille);
  return e ? e.count : 0;
}
// Besoin mensuel prévisionnel (4 couches/j × jours de présence du mois,
// contrat en cours) par crèche×type×taille — voir COUCHES_BESOIN plus haut.
function coucheBesoinMensuel(creche, type, taille) {
  const b = COUCHES_BESOIN.find(x => x.creche === creche && x.typeCouche === type && x.taille === taille);
  return b ? b.besoinMensuel : 0;
}
const COUCHE_CONSO_PAR_ENFANT_PAR_JOUR = 4.5; // moyenne courante en crèche (4 à 5/jour)
// Délai de livraison par défaut (environ 72 h), utilisé tant qu'aucune ligne
// stock_couches n'existe encore pour une référence — sinon c'est
// delaiLivraisonJours (réglable par crèche × type × taille, bouton 🚚) qui
// fait foi. En dessous de ce nombre de jours restants, une commande passée
// aujourd'hui n'arriverait pas à temps — une alerte de rupture, pas juste un
// stock à surveiller.
const COUCHE_DELAI_LIVRAISON_JOURS = 3;

async function coucheEnregistrerPrix() {
  const lignes = [];
  COUCHES_PRODUITS.forEach(produit => {
    produit.tailles.forEach(taille => {
      const input = document.getElementById('prix-' + produit.type + '-' + taille);
      if (!input) return;
      const val = input.value.trim();
      lignes.push({ type: produit.type, taille, prix: val === '' ? null : parseFloat(val) });
    });
  });
  if (lignes.some(l => l.prix !== null && (!Number.isFinite(l.prix) || l.prix < 0))) {
    alert('Un des prix saisis est invalide.');
    return;
  }
  try {
    for (const l of lignes) {
      const existant = COUCHES_PRIX.find(x => x.typeCouche === l.type && x.taille === l.taille);
      if (existant && existant.prixUnitaire === l.prix) continue; // rien à faire
      const nowIso = new Date().toISOString();
      // Upsert plutôt que « existe en cache local ? PATCH : POST » : le cache
      // COUCHES_PRIX peut être en retard sur la base (ex. prix créé par un
      // autre appareil, ou par une tentative précédente restée invisible
      // ici) — décider POST/PATCH sur sa seule présence locale a provoqué un
      // « duplicate key value violates unique constraint » quand la ligne
      // existait déjà côté serveur. on_conflict fait toujours la bonne chose.
      const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/stock_couches_prix?on_conflict=type_couche,taille`, {
        method: 'POST',
        headers: { ...SUPA_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ type_couche: l.type, taille: l.taille, prix_unitaire: l.prix, updated_at: nowIso }),
      });
      // Une policy RLS qui refuse l'écriture ne renvoie pas d'erreur HTTP :
      // PostgREST répond 200/201 avec un tableau vide (0 ligne touchée). Sans
      // cette vérification, l'app affichait « enregistré » alors que rien
      // n'était écrit — corrigé sur ce nouveau stock synchronisé 30s après.
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`${l.type} T${l.taille} : ${r.status} — ${body}`);
      }
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(`${l.type} T${l.taille} : écriture refusée par la base (compte direction requis).`);
      }
      if (existant) existant.prixUnitaire = l.prix;
      else COUCHES_PRIX.push(rowToCouchePrix(rows[0]));
    }
    renderCouches();
    showNotif('✅ Prix d’achat enregistrés.');
  } catch(e) {
    console.error('[Couches] enregistrement des prix :', e);
    showNotif('❌ Erreur lors de l’enregistrement des prix : ' + (e.message || e));
  }
}

function renderCouchesValorisation() {
  const box = document.getElementById('couches-valorisation');
  if (!box) return;
  const estDirection = typeof SK_PROFILE !== 'undefined' && SK_PROFILE && SK_PROFILE.role === 'direction';

  // Total valorisé (crèches affichées) + détail des tailles sans prix connu.
  const crechesAffichees = currentCreche === 'all' ? CRECHES : [currentCreche];
  let total = 0;
  const taillesSansPrix = new Set();
  crechesAffichees.forEach(creche => {
    COUCHES_PRODUITS.forEach(produit => {
      produit.tailles.forEach(taille => {
        const c = coucheFind(creche, produit.type, taille);
        const stock = c ? c.stock : 0;
        const prix = couchePrixUnitaire(produit.type, taille);
        if (prix === null) { if (stock > 0) taillesSansPrix.add(produit.label + ' T' + taille); return; }
        total += stock * prix;
      });
    });
  });

  // Le formulaire de prix n'est reconstruit que tant qu'il est FERMÉ.
  // renderCouches() est appelé très souvent — navigation, réception/ajustement
  // de stock, et toutes les 30 s par la synchro automatique — donc reconstruire
  // sans condition effaçait les <input> en cours de saisie avant que la
  // direction ait cliqué sur « Enregistrer ». Mais ne plus JAMAIS le
  // reconstruire une fois créé (première version de ce correctif) a son
  // propre piège : si la page affiche l'onglet Couches avant que
  // stock_couches_prix ait fini de charger, le formulaire se fige vide pour
  // le reste de la session, même une fois les prix arrivés. Se baser sur
  // l'état ouvert/fermé du <details> couvre les deux cas : fermé (personne
  // n'édite), toujours sûr de rafraîchir ; ouvert, on ne touche à rien.
  const formExistant = document.getElementById('couches-prix-form');
  if (!formExistant || !formExistant.open) {
    const formulaireEdition = estDirection ? `
      <details id="couches-prix-form" style="margin-top:8px">
        <summary style="cursor:pointer;font-size:12px;color:var(--accent);font-weight:600">Modifier les prix d'achat</summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px">
          ${COUCHES_PRODUITS.map(produit => produit.tailles.map(taille => {
            const prix = couchePrixUnitaire(produit.type, taille);
            return `<div>
              <label style="font-size:11px;color:var(--ink3)">${produit.label} T${taille} (€/couche)</label>
              <input type="number" step="0.001" min="0" id="prix-${produit.type}-${taille}" value="${prix!==null?prix:''}"
                style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-size:13px">
            </div>`;
          }).join('')).join('')}
        </div>
        <button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="coucheEnregistrerPrix()">Enregistrer les prix</button>
      </details>` : '';

    box.innerHTML = `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
      <div id="couches-valeur-resume"></div>
      ${formulaireEdition}
    </div>`;
  }

  const resume = document.getElementById('couches-valeur-resume');
  if (resume) {
    resume.innerHTML = `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
      <span style="font-size:12.5px;color:var(--ink3);font-weight:700">💰 Valeur du stock</span>
      <span style="font-size:22px;font-weight:800">${total.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €</span>
    </div>
    ${taillesSansPrix.size ? `<div style="font-size:11.5px;color:var(--amber);margin-top:4px">Prix non renseigné, exclu du total : ${[...taillesSansPrix].join(', ')}</div>` : ''}`;
  }
}

async function sbCoucheEnsureRow(creche, type, taille) {
  const existant = coucheFind(creche, type, taille);
  if (existant) return existant;
  try {
    const rows = await sbInsert('stock_couches', { creche, type_couche: type, taille, stock: 0 });
    const nc = rowToCouche(rows[0]);
    COUCHES.push(nc);
    return nc;
  } catch(e) {
    console.error('[Couches] création ligne stock :', e);
    showNotif('❌ Impossible de créer la ligne de stock : ' + (e.message || e));
    return null;
  }
}

// Créditer une réception de couches — utilisé par le bouton manuel
// (coucheReception) et par la réception d'une commande contenant des lignes
// de couches (confirmerLivraison) : les deux doivent créditer stock_couches,
// jamais l'inventaire générique ARTICLES, sous peine de créer une ligne
// fantôme sans lien avec le vrai décompte automatique.
async function coucheCrediterReception(creche, type, taille, qty) {
  const c = await sbCoucheEnsureRow(creche, type, taille);
  if (!c) return false;
  const nouveauStock = c.stock + qty;
  await sbUpdate('stock_couches', c.id, { stock: nouveauStock });
  const mvts = await sbInsert('stock_couches_mouvements', { creche, type_couche: type, taille, delta: qty, motif: 'reception' });
  c.stock = nouveauStock;
  COUCHES_MVTS.unshift(rowToCoucheMvt(mvts[0]));
  return true;
}

async function coucheReception(creche, type, taille) {
  const saisie = prompt('Quantité reçue — ' + coucheLabel(type) + ' taille ' + taille + ' (' + creche + ')', '');
  if (saisie === null) return;
  const qty = parseInt(saisie, 10);
  if (!Number.isFinite(qty) || qty <= 0) { alert('Quantité invalide.'); return; }
  try {
    await coucheCrediterReception(creche, type, taille, qty);
    renderCouches();
    showNotif('✅ +' + qty + ' — ' + coucheLabel(type) + ' T' + taille + ' (' + creche + ')');
  } catch(e) {
    console.error('[Couches] réception :', e);
    showNotif('❌ Erreur lors de l’enregistrement : ' + (e.message || e));
  }
}

// Reconnaît une ligne de commande ajoutée par le picker Couches
// ("Couches classiques T3 — Cuers") et retrouve son type/taille/crèche.
// Le format est celui produit par confirmCouchesPicker : on ne l'analyse
// nulle part ailleurs, donc le coupler ici n'est pas plus fragile que
// n'importe quel autre format de ligne de commande (déjà du texte parsé).
function coucheParseNomLigne(nom) {
  const m = nom.match(/^(.+?)\s+T(\d)\s+—\s+(.+)$/);
  if (!m) return null;
  const produit = COUCHES_PRODUITS.find(p => p.label === m[1]);
  if (!produit) return null;
  return { type: produit.type, taille: m[2], creche: m[3] };
}

async function coucheAjusterSeuil(creche, type, taille) {
  const c = await sbCoucheEnsureRow(creche, type, taille);
  if (!c) return;
  const saisie = prompt('Seuil d\'alerte « stock bas » (jours restants estimés) — ' + coucheLabel(type) + ' taille ' + taille + ' (' + creche + '), actuellement ' + c.seuilAlerteJours, c.seuilAlerteJours);
  if (saisie === null) return;
  const val = parseInt(saisie, 10);
  if (!Number.isFinite(val) || val < 0) { alert('Valeur invalide.'); return; }
  if (val === c.seuilAlerteJours) return;
  try {
    await sbUpdate('stock_couches', c.id, { seuil_alerte_jours: val });
    c.seuilAlerteJours = val;
    renderCouches();
    showNotif('✅ Seuil d\'alerte corrigé.');
  } catch(e) {
    console.error('[Couches] seuil d\'alerte :', e);
    showNotif('❌ Erreur lors de la correction : ' + (e.message || e));
  }
}

async function coucheAjusterDelai(creche, type, taille) {
  const c = await sbCoucheEnsureRow(creche, type, taille);
  if (!c) return;
  const saisie = prompt('Délai de livraison du fournisseur (jours) — ' + coucheLabel(type) + ' taille ' + taille + ' (' + creche + '), actuellement ' + c.delaiLivraisonJours, c.delaiLivraisonJours);
  if (saisie === null) return;
  const val = parseInt(saisie, 10);
  if (!Number.isFinite(val) || val < 0) { alert('Valeur invalide.'); return; }
  if (val === c.delaiLivraisonJours) return;
  try {
    await sbUpdate('stock_couches', c.id, { delai_livraison_jours: val });
    c.delaiLivraisonJours = val;
    renderCouches();
    showNotif('✅ Délai de livraison corrigé.');
  } catch(e) {
    console.error('[Couches] délai de livraison :', e);
    showNotif('❌ Erreur lors de la correction : ' + (e.message || e));
  }
}

async function coucheAjuster(creche, type, taille) {
  const c = await sbCoucheEnsureRow(creche, type, taille);
  if (!c) return;
  const saisie = prompt('Corriger le stock — ' + coucheLabel(type) + ' taille ' + taille + ' (' + creche + '), actuellement ' + c.stock, c.stock);
  if (saisie === null) return;
  const val = parseInt(saisie, 10);
  if (!Number.isFinite(val) || val < 0) { alert('Valeur invalide.'); return; }
  const delta = val - c.stock;
  if (delta === 0) return;
  try {
    await sbUpdate('stock_couches', c.id, { stock: val });
    const mvts = await sbInsert('stock_couches_mouvements', { creche, type_couche: type, taille, delta, motif: 'ajustement' });
    c.stock = val;
    COUCHES_MVTS.unshift(rowToCoucheMvt(mvts[0]));
    renderCouches();
    showNotif('✅ Stock corrigé.');
  } catch(e) {
    console.error('[Couches] ajustement :', e);
    showNotif('❌ Erreur lors de la correction : ' + (e.message || e));
  }
}

// Évaluation d'une référence (stock, estimation "jours restants", niveaux
// d'alerte) — factorisé pour être réutilisé par l'affichage du stock
// (renderCouches) et par le picker de commande (renderCouchesPickerList),
// qui doivent rester rigoureusement d'accord sur ce qui est "bas" ou
// "critique".
function coucheEvaluer(creche, type, taille) {
  const c = coucheFind(creche, type, taille);
  const stock = c ? c.stock : 0;
  const seuil = c ? c.seuilAlerteJours : 15;
  const delaiLivraison = c ? c.delaiLivraisonJours : COUCHE_DELAI_LIVRAISON_JOURS;
  const since14 = Date.now() - 14 * 24 * 3600 * 1000;
  const conso14 = COUCHES_MVTS.filter(m =>
    m.creche === creche && m.typeCouche === type && m.taille === taille &&
    m.motif === 'change_auto' && new Date(m.createdAt).getTime() >= since14
  ).length;
  const avgDailyReel = conso14 / 14;
  // En dessous de ce nombre de changes réels sur 14 jours, la moyenne
  // extrapole n'importe quoi (ex. 1 change sur la période → des centaines de
  // « jours restants » affichés). Ça ne se « réinitialise » pas à une
  // réception, seul l'usage réel (Change dans le suivi) alimente cette
  // moyenne — en attendant d'avoir assez d'historique, on retombe sur une
  // estimation à partir du nombre d'enfants qui portent cette taille
  // (4,5 couches/jour/enfant).
  const MIN_CHANGES_FIABLE = 5;
  const effectif = coucheEffectif(creche, type, taille);
  let joursRestants = null, estimSource = null;
  if (conso14 >= MIN_CHANGES_FIABLE && avgDailyReel > 0) {
    joursRestants = Math.floor(stock / avgDailyReel);
    estimSource = 'reel';
  } else if (effectif > 0) {
    joursRestants = Math.floor(stock / (effectif * COUCHE_CONSO_PAR_ENFANT_PAR_JOUR));
    estimSource = 'effectif';
  }
  const enAlerte = stock <= 0 || (joursRestants !== null && joursRestants <= seuil);
  // Rupture prévisible avant l'arrivée d'une commande passée aujourd'hui
  // (délai de livraison propre à cette référence, réglable au 🚚) :
  // distincte du simple stock bas, qui laisse encore le temps de
  // commander tranquillement.
  const enCritique = stock <= 0 || (joursRestants !== null && joursRestants <= delaiLivraison);
  const estimTexte = estimSource === 'reel' ? joursRestants + ' j restants (est.)'
    : estimSource === 'effectif' ? joursRestants + ' j restants (est. ' + effectif + ' enf.×4,5/j)'
    : (stock > 0 ? 'aucun enfant sur cette taille' : '—');
  return { stock, seuil, delaiLivraison, joursRestants, estimSource, estimTexte, enAlerte, enCritique };
}

function renderCouches() {
  const box = document.getElementById('couches-grid');
  const alertBox = document.getElementById('couches-alertes');
  if (!box) return;
  renderCouchesValorisation();
  const crechesAffichees = currentCreche === 'all' ? CRECHES : [currentCreche];
  const alertes = [];
  let html = '';

  crechesAffichees.forEach(creche => {
    html += `<div>
      <div style="font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="width:10px;height:10px;border-radius:50%;background:${CRECHE_COLORS[creche]||'#888'}"></span>
        ${creche}
      </div>`;
    COUCHES_PRODUITS.forEach(produit => {
      html += `<div style="margin-bottom:14px">
        <div style="font-size:12.5px;font-weight:700;color:var(--ink3);margin-bottom:6px">${produit.label}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">`;
      produit.tailles.forEach(taille => {
        const ev = coucheEvaluer(creche, produit.type, taille);
        const { stock, seuil, delaiLivraison, enAlerte, enCritique, estimTexte } = ev;
        if (enAlerte) alertes.push({ creche, produit: produit.label, taille, stock, joursRestants: ev.joursRestants, critique: enCritique, seuil, delaiLivraison });
        const bg = enCritique ? '#FCA5A5' : enAlerte ? 'var(--red-lt)' : 'var(--bg)';
        const border = enCritique ? '3px solid #991B1B' : enAlerte ? '2px solid var(--red)' : '1px solid var(--border)';
        const prixUnit = couchePrixUnitaire(produit.type, taille);
        const valeurLigne = prixUnit !== null ? (stock * prixUnit).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €' : null;
        const besoinMensuel = coucheBesoinMensuel(creche, produit.type, taille);
        html += `<div style="border:${border};background:${bg};border-radius:10px;padding:10px 12px">
          <div style="font-size:11.5px;color:var(--ink3);font-weight:700">Taille ${taille}${enCritique ? ' 🚨' : ''}</div>
          <div style="font-size:24px;font-weight:800;margin:2px 0">${stock}</div>
          <div style="font-size:11px;color:var(--ink3)">${estimTexte}</div>
          <div style="font-size:11px;color:var(--ink3);margin-bottom:2px">${besoinMensuel > 0 ? '📅 Besoin mensuel : ' + besoinMensuel + ' couches' : ''}</div>
          <div style="font-size:11px;color:var(--ink3);margin-bottom:8px">${valeurLigne ? valeurLigne+' valorisés' : 'prix non renseigné'}</div>
          <div style="font-size:10.5px;color:var(--ink3);margin-bottom:8px">Seuil d'alerte : ${seuil} j · Livraison : ${delaiLivraison} j</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-secondary" style="flex:1" onclick="coucheReception('${creche}','${produit.type}','${taille}')">+ Réception</button>
            <button class="btn btn-sm btn-secondary" title="Corriger le stock" onclick="coucheAjuster('${creche}','${produit.type}','${taille}')">✏️</button>
            <button class="btn btn-sm btn-secondary" title="Régler le seuil d'alerte" onclick="coucheAjusterSeuil('${creche}','${produit.type}','${taille}')">⚙️</button>
            <button class="btn btn-sm btn-secondary" title="Régler le délai de livraison" onclick="coucheAjusterDelai('${creche}','${produit.type}','${taille}')">🚚</button>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    });
    html += `</div>`;
  });

  box.innerHTML = html;

  const critiques = alertes.filter(a => a.critique);
  const surveiller = alertes.filter(a => !a.critique);
  const ligne = a => `${a.creche} — ${a.produit} taille ${a.taille} : ${a.stock} restante${a.stock>1?'s':''}${a.joursRestants!==null?' (~'+a.joursRestants+' j)':''}`;
  // Le seuil et le délai de livraison se règlent référence par référence
  // (⚙️ / 🚚 sur chaque carte) : on ne peut plus annoncer un nombre de jours
  // unique dès que des lignes s'en écartent des défauts (15 j / 3 j).
  const ligneSurveiller = a => ligne(a) + ' — seuil ' + a.seuil + ' j';
  const ligneCritique = a => ligne(a) + ' — livraison ' + a.delaiLivraison + ' j';
  let alertHtml = '';
  if (critiques.length) {
    alertHtml += `<div style="background:#FCA5A5;border-left:4px solid #991B1B;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#7F1D1D;margin-bottom:8px">
      <b>🚨 Rupture imminente — le délai de livraison dépasse le stock restant, commandez aujourd'hui</b><br>` +
      critiques.map(ligneCritique).join('<br>') + `</div>`;
  }
  if (surveiller.length) {
    alertHtml += `<div style="background:var(--red-lt);border-left:4px solid var(--red);border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#991B1B">
      <b>⚠️ Stock bas (sous le seuil réglé pour chaque référence)</b><br>` +
      surveiller.map(ligneSurveiller).join('<br>') + `</div>`;
  }
  alertBox.innerHTML = alertHtml;
}
