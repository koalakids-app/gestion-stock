
// ── API helpers ────────────────────────────────────────────────────────────

async function sbGet(table, params='') {
  // Construire l'URL proprement selon que params est vide ou contient déjà un order
  let query;
  if (!params) {
    query = 'order=id.asc';
  } else if (params.includes('order=')) {
    query = params; // déjà un order=, on ne rajoute rien
  } else {
    query = params + '&order=id.asc';
  }
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

// ── Map between app object ↔ DB row ───────────────────────────────────────
// Valeur dépréciée : -20%/an depuis la date d'achat, plancher à 0
function valeurDepreciee(a) {
  if (!a.depreciable || !a.date_achat || !a.prix) return a.prix || 0;
  const achat = new Date(a.date_achat);
  if (isNaN(achat)) return a.prix;
  const ans = (Date.now() - achat.getTime()) / (365.25 * 24 * 3600 * 1000);
  const taux = Math.max(0, 1 - 0.20 * ans);
  return Math.round(a.prix * taux * 100) / 100;
}

// État de l'article : manuel si défini, sinon automatique via dépréciation
function getArticleEtat(a) {
  if (a.etat_override) return a.etat_override;
  if (a.depreciable && a.date_achat && a.prix) {
    const reste = valeurDepreciee(a) / a.prix;
    if (reste <= 0.20) return 'À remplacer';
    if (reste <= 0.45) return 'Usagé';
    if (reste <= 0.70) return 'Bon état';
    return 'Neuf';
  }
  return 'Neuf';
}
function articleToRow(a) {
  return { nom: a.nom, ref: a.ref, cat: a.cat, creche: a.creche,
           stock: a.stock, min: a.min, prix: a.prix, fourn: a.fourn,
           notes: a.notes, photo: a.photo||null, photo_name: a.photoName||null,
           url: a.url||null, date_achat: a.date_achat||null,
           etat: a.etat||'Neuf', depreciable: a.depreciable !== false,
           etat_override: a.etat_override||null };
}
function rowToArticle(r) {
  return { id: r.id, nom: r.nom, ref: r.ref, cat: r.cat, creche: r.creche,
           stock: r.stock, min: r.min, prix: parseFloat(r.prix)||0,
           fourn: r.fourn||'', notes: r.notes||'',
           photo: r.photo||null, photoName: r.photo_name||null,
           url: r.url||null, date_achat: r.date_achat||null,
           etat: r.etat||'Neuf', depreciable: r.depreciable !== false,
           etat_override: r.etat_override||null };
}function commandeToRow(c) {
  const row = {
    fourn:    c.fourn || '—',
    creche:   c.creche || '',
    date:     c.date || new Date().toISOString().split('T')[0],
    livraison: c.livraison || '',
    montant:  parseFloat(c.montant) || 0,
    bc:       c.bc || '',
    status:   c.status || 'en-cours',
    articles: c.articles || '',
    notes:    c.notes || '',
    url:      c.url || '',
  };
  // photos_json uniquement si la colonne existe (ajout progressif)
  if (c.photos_json) row.photos_json = c.photos_json;
  // traitee_le : idem, envoyé seulement une fois utilisé (sql/commandes_traitee.sql)
  if (c.traitee_le || c.traitee_touched) row.traitee_le = c.traitee_le || null;
  return row;
}
function rowToCommande(r) {
  return { id: r.id, fourn: r.fourn, creche: r.creche, date: r.date,
           livraison: r.livraison, montant: parseFloat(r.montant)||0,
           bc: r.bc, status: r.status, articles: r.articles||'',
           notes: r.notes||'', url: r.url||'', photos_json: r.photos_json||null,
           traitee_le: r.traitee_le||null };
}
function fournisseurToRow(f) {
  return { nom: f.nom, contact: f.contact, tel: f.tel, email: f.email,
           web: f.web, delai: f.delai, spec: f.spec, notes: f.notes };
}
function rowToFournisseur(r) {
  return { id: r.id, nom: r.nom, contact: r.contact||'—', tel: r.tel||'—',
           email: r.email||'', web: r.web||'', delai: r.delai||'',
           spec: r.spec||'', notes: r.notes||'' };
}
function histoToRow(h) {
  return { type: h.type, article: h.article, qty: h.qty,
           creche: h.creche, utilisateur: h.user, date: h.date, note: h.note||'' };
}
function rowToHisto(r) {
  return { id: r.id, type: r.type, article: r.article, qty: r.qty,
           creche: r.creche, user: r.utilisateur||'', date: r.date, note: r.note||'' };
}

function rowToCouche(r) {
  return { id: r.id, creche: r.creche, typeCouche: r.type_couche || 'couche', taille: r.taille,
           stock: r.stock, seuilAlerteJours: r.seuil_alerte_jours != null ? r.seuil_alerte_jours : 15,
           delaiLivraisonJours: r.delai_livraison_jours != null ? r.delai_livraison_jours : 3 };
}
function rowToCoucheMvt(r) {
  return { id: r.id, creche: r.creche, typeCouche: r.type_couche || 'couche', taille: r.taille,
           delta: r.delta, motif: r.motif, createdAt: r.created_at };
}
function rowToCouchePrix(r) {
  return { typeCouche: r.type_couche || 'couche', taille: r.taille,
           prixUnitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
           updatedAt: r.updated_at };
}

// Agrège des lignes `enfants` (creche_id, taille_couche, type_couche) en
// effectif par crèche×type×taille. SK_CRECHE_NAMES fait la traduction
// creche_id → nom court (même mapping que pour l'auth), sans avoir à charger
// la table `creches` dans stock.html.
function rowsToCouchesEffectif(rows) {
  const compte = {};
  (rows || []).forEach(r => {
    if (!r.taille_couche) return;
    const creche = (typeof SK_CRECHE_NAMES !== 'undefined' ? SK_CRECHE_NAMES[r.creche_id] : null);
    if (!creche) return;
    const cle = creche + '|' + (r.type_couche || 'couche') + '|' + r.taille_couche;
    compte[cle] = (compte[cle] || 0) + 1;
  });
  return Object.entries(compte).map(([cle, count]) => {
    const [creche, typeCouche, taille] = cle.split('|');
    return { creche, typeCouche, taille, count };
  });
}

// `enfants_contrats.jours` peut revenir en tableau (jsonb), en chaîne JSON
// "[1,2]" ou en "1,2" selon la façon dont la ligne a été créée (même format
// que ctParseJours dans js/enfants.js, dupliqué ici car stock.html ne charge
// pas ce fichier).
function coucheParseJours(j) {
  if (j == null) return [];
  let v = j;
  if (typeof v === 'string') {
    const t = v.trim();
    try { v = JSON.parse(t); } catch (e) { v = t.replace(/[{}\[\]"']/g, '').split(','); }
  }
  if (!Array.isArray(v)) v = [v];
  return v.map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 7);
}
// 4 couches/jour de présence : le besoin théorique demandé pour la prévision
// de commande — distinct de COUCHE_CONSO_PAR_ENFANT_PAR_JOUR (4,5), la
// moyenne réelle constatée, utilisée elle pour l'estimation "jours restants".
const COUCHE_BESOIN_PAR_JOUR = 4;

// Jours fériés français (métropole) d'une année, en ISO — même algorithme
// (calcul de Pâques) que prFeries dans js/presences-reel.js, dupliqué ici
// car stock.html ne charge pas ce fichier.
const _coucheFeriesCache = {};
function coucheAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function coucheFeries(an) {
  if (_coucheFeriesCache[an]) return _coucheFeriesCache[an];
  const a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = an + '-' + String(mois).padStart(2, '0') + '-' + String(jour).padStart(2, '0');
  const s = new Set([an + '-01-01', an + '-05-01', an + '-05-08', an + '-07-14', an + '-08-15', an + '-11-01', an + '-11-11', an + '-12-25',
    coucheAddDays(paques, 1), coucheAddDays(paques, 39), coucheAddDays(paques, 50)]);
  return _coucheFeriesCache[an] = s;
}
function coucheEstFerie(iso) { return coucheFeries(parseInt(iso.slice(0, 4), 10)).has(iso); }

// Fermeture (vacances, journée pédagogique…) de la crèche ou du réseau à une
// date donnée — même source (etablissements.jours_fermeture,
// reseau_config.config.jours_fermeture_reseau) que prEstFerme côté module
// Présences, dupliquée ici pour la même raison.
function coucheEstFerme(fermetures, crecheId, iso) {
  if (!fermetures) return false;
  return ((fermetures.parCreche[crecheId] || []).concat(fermetures.reseau)).some(f => f && f.debut && iso >= f.debut && iso <= (f.fin || f.debut));
}

// Nombre de jours de présence réels du mois en cours pour un enfant : jours
// du contrat couvrant la date qui tombent sur un jour de la semaine
// travaillé, moins les jours fériés, les fermetures (vacances) et les
// absences déjà programmées (justifiées ou non — un enfant annoncé absent
// ne sera pas changé, peu importe le motif).
function coucheJoursPresenceMois(contrats, absences, fermetures, crecheId, an, moisIndex) {
  const dernierJour = new Date(an, moisIndex + 1, 0).getDate();
  let jours = 0;
  for (let j = 1; j <= dernierJour; j++) {
    const d = new Date(an, moisIndex, j);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const contrat = (contrats || []).find(c => (!c.date_debut || c.date_debut <= iso) && (!c.date_fin || c.date_fin >= iso));
    if (!contrat) continue;
    if (!coucheParseJours(contrat.jours).includes(d.getDay())) continue;
    if (coucheEstFerie(iso)) continue;
    if (coucheEstFerme(fermetures, crecheId, iso)) continue;
    if ((absences || []).some(a => a.date_debut <= iso && a.date_fin >= iso)) continue;
    jours++;
  }
  return jours;
}
// Agrège les enfants (avec leurs contrats et absences imbriqués via
// enfants_contrats / enfants_absences) en besoin mensuel par crèche×type×
// taille : 4 couches/jour × jours de présence réels du mois en cours.
function rowsToCouchesBesoin(rows, fermetures) {
  const total = {};
  const now = new Date();
  const an = now.getFullYear(), moisIndex = now.getMonth();
  (rows || []).forEach(r => {
    if (!r.taille_couche) return;
    const creche = (typeof SK_CRECHE_NAMES !== 'undefined' ? SK_CRECHE_NAMES[r.creche_id] : null);
    if (!creche) return;
    const jours = coucheJoursPresenceMois(r.enfants_contrats, r.enfants_absences, fermetures, r.creche_id, an, moisIndex);
    if (!jours) return;
    const besoin = jours * COUCHE_BESOIN_PAR_JOUR;
    const cle = creche + '|' + (r.type_couche || 'couche') + '|' + r.taille_couche;
    total[cle] = (total[cle] || 0) + besoin;
  });
  return Object.entries(total).map(([cle, besoinMensuel]) => {
    const [creche, typeCouche, taille] = cle.split('|');
    return { creche, typeCouche, taille, besoinMensuel };
  });
}

// ── Load all data from Supabase ────────────────────────────────────────────


async function loadData() {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) {
    setIndicator('💻 Mode local — déployez sur Netlify pour activer Supabase', 'var(--ink3)');
    return false;
  }
  setIndicator('⏳ Connexion à Supabase…', 'var(--amber)');
  try {
    // Timeout de 30s (Supabase peut mettre jusqu'à 30s à se réveiller après inactivité)
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000));
    const [arts, cmds, fourns, histos, config, couches, couchesMvts, couchesPrix, enfantsCouches, etabsFermeture, reseauCfg] = await Promise.race([
      Promise.all([
        sbGet('articles'),
        sbGet('commandes'),
        sbGet('fournisseurs'),
        sbGet('historique', 'order=id.desc&limit=200'),
        sbGet('stock_config', 'order=cle.asc').catch(() => []),
        // null (pas []) en cas d'échec : un tableau vide serait ensuite
        // interprété comme « la base est vide » et effacerait des données
        // déjà chargées en mémoire (ex. prix saisis) sur une simple erreur
        // réseau transitoire au rechargement de la page.
        sbGet('stock_couches').catch(() => null),
        sbGet('stock_couches_mouvements', 'order=created_at.desc&limit=500').catch(() => null),
        sbGet('stock_couches_prix', 'order=type_couche.asc').catch(() => null),
        sbGet('enfants', `select=creche_id,taille_couche,type_couche,enfants_contrats(jours,date_debut,date_fin),enfants_absences(date_debut,date_fin)&taille_couche=not.is.null&or=(date_sortie.is.null,date_sortie.gte.${new Date().toISOString().slice(0,10)})`).catch(() => null),
        // Fermetures (vacances, journées pédagogiques) — même source que le
        // module Présences (prChargerFermetures), relue ici car stock.html
        // ne charge pas js/presences-reel.js.
        sbGet('etablissements', 'select=creche_id,jours_fermeture').catch(() => null),
        sbGet('reseau_config', 'select=config').catch(() => null),
      ]),
      timeout.then(() => { throw new Error('Timeout Supabase'); })
    ]);

    if (arts.length > 0) {
      ARTICLES.splice(0, ARTICLES.length, ...arts.map(rowToArticle));
    }
    if (cmds.length > 0) {
      COMMANDES.splice(0, COMMANDES.length, ...cmds.map(rowToCommande));
    }
    if (fourns.length > 0) {
      FOURNISSEURS.splice(0, FOURNISSEURS.length, ...fourns.map(rowToFournisseur));
    }
    if (histos.length > 0) {
      HISTORIQUE.splice(0, HISTORIQUE.length, ...histos.map(rowToHisto));
    }
    // Nom de la crèche : réglage unique, partagé.
    if (Array.isArray(config)) {
      const n = config.find(c => c.cle === 'creche_name');
      if (n && n.valeur) {
        try { localStorage.setItem(LS_NAME_KEY, n.valeur); } catch(e) {}
        applyNomCreche(n.valeur);
      }
    }
    if (Array.isArray(couches)) {
      COUCHES.splice(0, COUCHES.length, ...couches.map(rowToCouche));
    }
    if (Array.isArray(couchesMvts)) {
      COUCHES_MVTS.splice(0, COUCHES_MVTS.length, ...couchesMvts.map(rowToCoucheMvt));
    }
    if (Array.isArray(couchesPrix)) {
      COUCHES_PRIX.splice(0, COUCHES_PRIX.length, ...couchesPrix.map(rowToCouchePrix));
    }
    if (Array.isArray(enfantsCouches)) {
      COUCHES_EFFECTIF.splice(0, COUCHES_EFFECTIF.length, ...rowsToCouchesEffectif(enfantsCouches));
      const fermetures = { parCreche: {}, reseau: [] };
      (etabsFermeture || []).forEach(e => { fermetures.parCreche[e.creche_id] = Array.isArray(e.jours_fermeture) ? e.jours_fermeture : []; });
      const reseauConfigRow = (reseauCfg && reseauCfg[0] && reseauCfg[0].config) || {};
      fermetures.reseau = Array.isArray(reseauConfigRow.jours_fermeture_reseau) ? reseauConfigRow.jours_fermeture_reseau : [];
      COUCHES_BESOIN.splice(0, COUCHES_BESOIN.length, ...rowsToCouchesBesoin(enfantsCouches, fermetures));
    }

    const now = new Date();
    setIndicator('☁️ Sync cloud — ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}), 'var(--green)');
    return true;
  } catch(e) {
    setIndicator('⚠️ Hors ligne — données locales', 'var(--amber)');
    console.error('[Supabase] Erreur chargement :', e);
    return false;
  }
}

// ── Save / update / delete per entity ─────────────────────────────────────

async function saveArticleDB(article, isNew) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try {
    if (isNew) {
      const rows = await sbInsert('articles', articleToRow(article));
      if (rows && rows[0]) article.id = rows[0].id; // use DB id
    } else {
      await sbUpdate('articles', article.id, articleToRow(article));
    }
    setSaved();
  } catch(e) {
    setIndicator('⚠️ Erreur sauvegarde', 'var(--red)'); console.error(e);
    // Message de la base visible à l'écran (sinon l'article disparaît à la synchro sans explication)
    const detail = String((e && e.message) || e).replace(/^INSERT articles : /, '').slice(0, 220);
    showNotif('❌ Article non enregistré en base : ' + detail);
  }
}

async function deleteArticleDB(id) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try { await sbDelete('articles', id); setSaved(); }
  catch(e) { console.error('[Supabase] Delete article :', e); }
}

async function deleteCommandeDB(id) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try { await sbDelete('commandes', id); setSaved(); }
  catch(e) { console.error('[Supabase] Delete commande :', e); }
}

async function saveCommandeDB(commande) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try {
    const rows = await sbInsert('commandes', commandeToRow(commande));
    if (rows && rows[0] && rows[0].id) {
      // Remplacer l'id local par l'id Supabase dans COMMANDES
      const idx = COMMANDES.findIndex(c => c.bc === commande.bc);
      if (idx >= 0) COMMANDES[idx].id = rows[0].id;
      commande.id = rows[0].id;
    }
    setSaved();
  } catch(e) {
    console.error('[Supabase] Insert commande :', e);
    throw e; // remonter l'erreur pour que saveCommande_db puisse l'afficher
  }
}

async function updateCommandeDB(commande) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try {
    const rows = await sbUpdate('commandes', commande.id, commandeToRow(commande));
    if (Array.isArray(rows) && rows.length === 0) {
      // Aucune ligne ne correspond à cet id dans Supabase (ex : commande jamais
      // réellement enregistrée côté serveur) → on la recrée pour ne pas la perdre
      // au prochain sync.
      const inserted = await sbInsert('commandes', commandeToRow(commande));
      if (inserted && inserted[0] && inserted[0].id) commande.id = inserted[0].id;
    }
    setSaved();
  }
  catch(e) { console.error('[Supabase] Update commande :', e); }
}

async function saveFournisseurDB(f) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try {
    const rows = await sbInsert('fournisseurs', fournisseurToRow(f));
    if (rows && rows[0]) f.id = rows[0].id;
    else showNotif('⚠ Fournisseur créé mais id non confirmé — rechargez la page');
    setSaved();
  } catch(e) {
    console.error('[Supabase] Insert fournisseur :', e);
    showNotif('⚠ Erreur sauvegarde fournisseur : ' + e.message);
  }
}

async function updateFournisseurDB(f) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try {
    await sbUpdate('fournisseurs', f.id, fournisseurToRow(f));
    setSaved();
  } catch(e) { console.error('[Supabase] Update fournisseur :', e); }
}

async function saveHistoDB(h) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try { await sbInsert('historique', histoToRow(h)); }
  catch(e) { console.error('[Supabase] Insert histo :', e); }
}

// ── Réglages partagés du module (table clé/valeur) ───────────────────────
async function saveStockConfigDB(cle, valeur) {
  if (IS_LOCAL) return;
  try {
    // upsert : Prefer resolution=merge-duplicates sur la clé primaire
    const r = await fetch(`${SUPA_URL}/rest/v1/stock_config`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ cle: cle, valeur: valeur, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(await r.text());
    setSaved();
  } catch(e) { console.error('[Supabase] stock_config:', e); }
}

async function updateArticleStockDB(article) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try { await sbUpdate('articles', article.id, { stock: article.stock }); setSaved(); }
  catch(e) { console.error('[Supabase] Update stock :', e); }
}

async function updateArticlePhotoDB(article) {
  if (typeof IS_LOCAL !== 'undefined' && IS_LOCAL) return;
  try {
    await sbUpdate('articles', article.id, { photo: article.photo||null, photo_name: article.photoName||null });
    setSaved();
  } catch(e) { console.error('[Supabase] Update photo :', e); }
}

function setSaved() {
  const now = new Date();
  setIndicator('☁️ Sync cloud — ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}), 'var(--green)');
}
