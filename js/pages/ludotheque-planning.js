// ─── PLANNING DES PROPOSITIONS LUDIQUES (préfixe plp) ───────────────────────
// Onglet « Planning » de la Ludothèque : l'équipe place les propositions de
// l'onglet « Propositions » (table `univers`, de toutes les crèches) dans une
// semaine du lundi au vendredi, 4 par jour au maximum.
// Table `planning_propositions` (sql/planning_propositions_ludiques.sql) :
// une ligne par proposition placée ; la limite de 4 est tenue par la base
// (position 1 à 4, unique par crèche et par jour).
// Dépend de ludotheque.js (sbGet, sbInsert, sbUpdate, sbDelete, PROPOSITIONS,
// CRECHES, SK_WRITE_CRECHE, showNotif, closeModal…).

const PLP_MAX = 4;
const PLP_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const PLP_TABLE = 'planning_propositions';
const PLP_SEMAINES = 'planning_propositions_semaines';
const PLP_COULEURS = {
  'Sensoriel': '#7C3AED', 'Manipulation': '#D97706', 'Construction': '#2563EB',
  'Motricité': '#16A34A', 'Imitation': '#DB2777', 'Expression artistique': '#F47920',
  'Rangement': '#0891B2', 'Décoration': '#A21CAF', 'Multi-catégories': '#57534E'
};

const PLP = {
  debut: null,          // lundi de la semaine affichée (Date locale)
  creche: null,         // crèche dont on construit le planning
  rows: [],             // lignes planning_propositions de la semaine affichée
  semaine: null,        // état de la semaine (planning_propositions_semaines) : null = brouillon jamais partagé
  filtreCat: 'all',
  filtreCreche: 'all',  // filtre de la bibliothèque (toutes les crèches par défaut)
  q: '',
  jourPicker: 0,
  dragProp: null,       // id d'une proposition glissée depuis la bibliothèque
  dragLigne: null,      // id d'une ligne du planning glissée
  prete: false,
  jeton: 0,             // évite qu'un chargement lent écrase un plus récent
};

function plpEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function plpLundi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function plpAjouterJours(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function plpCle(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function plpPeutEcrire() { return !SK_WRITE_CRECHE || PLP.creche === SK_WRITE_CRECHE; }
function plpProp(id) { return PROPOSITIONS.find(p => String(p.id) === String(id)); }
function plpPhoto(p) {
  if (!p) return null;
  if (p.photos) { try { const a = JSON.parse(p.photos); if (a && a[0]) return a[0]; } catch (e) { /* ignoré */ } }
  return p.photo || null;
}
function plpIcone(p) { return (p && CAT_PROPOSITION_ICONS[p.cat]) || '🧸'; }
function plpCouleur(p) { return (p && PLP_COULEURS[p.cat]) || '#888'; }
function plpJourIdx(ligne) {
  const d = new Date(ligne.jour + 'T00:00:00');
  return (d.getDay() + 6) % 7;
}
function plpLignesJour(j) {
  return PLP.rows.filter(r => plpJourIdx(r) === j).sort((a, b) => a.position - b.position);
}
function plpPlaceLibre(j) {
  const prises = new Set(plpLignesJour(j).map(r => r.position));
  for (let n = 1; n <= PLP_MAX; n++) if (!prises.has(n)) return n;
  return null;
}
function plpPremierJourLibre() {
  for (let j = 0; j < 5; j++) if (plpPlaceLibre(j)) return j;
  return -1;
}

// ─── ENTRÉE DANS L'ONGLET ───────────────────────────────────────────────────
function plpAfficher() {
  if (!PLP.prete) plpInitialiser();
  // La crèche choisie en haut de page sert de point de départ.
  if (currentCreche && currentCreche !== 'all' && currentCreche !== PLP.creche) {
    PLP.creche = currentCreche;
    const sel = document.getElementById('plp-creche');
    if (sel) sel.value = PLP.creche;
  }
  plpCharger();
}

function plpInitialiser() {
  PLP.prete = true;
  PLP.debut = plpLundi(new Date());
  PLP.creche = (currentCreche && currentCreche !== 'all') ? currentCreche : (SK_WRITE_CRECHE || CRECHES[0]);

  const opts = CRECHES.map(n => `<option>${plpEsc(n)}</option>`).join('');
  const sel = document.getElementById('plp-creche');
  sel.innerHTML = opts;
  sel.value = PLP.creche;
  sel.onchange = () => { PLP.creche = sel.value; plpCharger(); };
  const fc = document.getElementById('plp-f-creche');
  fc.innerHTML = '<option value="all">Toutes les crèches</option>' + opts;
  fc.onchange = () => { PLP.filtreCreche = fc.value; plpRendreBiblio(); };

  document.getElementById('plp-rech').oninput = e => { PLP.q = e.target.value.toLowerCase(); plpRendreBiblio(); };
  document.getElementById('plp-chips').onclick = e => {
    const c = e.target.closest('[data-cat]');
    if (c) { PLP.filtreCat = c.dataset.cat; plpRendreBiblio(); }
  };
  document.getElementById('plp-prec').onclick = () => { PLP.debut = plpAjouterJours(PLP.debut, -7); plpCharger(); };
  document.getElementById('plp-suiv').onclick = () => { PLP.debut = plpAjouterJours(PLP.debut, 7); plpCharger(); };
  document.getElementById('plp-auj').onclick = () => { PLP.debut = plpLundi(new Date()); plpCharger(); };
  document.getElementById('plp-copier').onclick = plpCopierPrecedente;
  document.getElementById('plp-vider').onclick = plpViderSemaine;
  document.getElementById('plp-imprimer').onclick = () => window.print();
  document.getElementById('plp-partager').onclick = plpPartager;
  document.getElementById('plp-brouillon').onclick = plpRepasserBrouillon;
  document.getElementById('plp-picker-rech').oninput = plpRendrePicker;

  document.getElementById('plp-biblio').addEventListener('click', e => {
    const c = e.target.closest('[data-prop]');
    if (!c || !plpPeutEcrire()) return;
    const j = plpPremierJourLibre();
    if (j < 0) { showNotif('⚠ Toute la semaine est complète'); return; }
    plpAjouter(j, c.dataset.prop).then(ok => { if (ok) showNotif('Ajouté : ' + PLP_JOURS[j].toLowerCase()); });
  });

  const sem = document.getElementById('plp-semaine');
  sem.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) {
      const id = b.dataset.id;
      if (b.dataset.act === 'x') plpRetirer(id);
      else if (b.dataset.act === 'up') plpEchanger(id, -1);
      else if (b.dataset.act === 'down') plpEchanger(id, 1);
      return;
    }
    const a = e.target.closest('[data-add]');
    if (a && plpPeutEcrire()) plpOuvrirPicker(+a.dataset.add);
  });
  sem.addEventListener('change', e => {
    if (e.target.classList.contains('plp-note')) plpEnregistrerNote(e.target.dataset.id, e.target.value);
  });

  // Glisser-déposer (ordinateur) ; sur tablette : emplacement vide ou clic dans la liste.
  document.addEventListener('dragstart', e => {
    if (!document.getElementById('ltab-content-planning') || document.getElementById('ltab-content-planning').style.display === 'none') return;
    const l = e.target.closest && e.target.closest('.plp-carte');
    const p = e.target.closest && e.target.closest('.plp-prop');
    if (l) { PLP.dragLigne = l.dataset.id; PLP.dragProp = null; }
    else if (p) { PLP.dragProp = p.dataset.prop; PLP.dragLigne = null; }
    else return;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'plp'); }
  });
  document.addEventListener('dragend', () => {
    document.querySelectorAll('.plp-jour.survol').forEach(x => x.classList.remove('survol'));
    PLP.dragProp = PLP.dragLigne = null;
  });
  sem.addEventListener('dragover', e => {
    const j = e.target.closest('.plp-jour');
    if (!j || !plpPeutEcrire() || (!PLP.dragProp && !PLP.dragLigne)) return;
    e.preventDefault();
    sem.querySelectorAll('.survol').forEach(x => x.classList.remove('survol'));
    j.classList.add('survol');
  });
  sem.addEventListener('drop', e => {
    const jEl = e.target.closest('.plp-jour');
    if (!jEl || !plpPeutEcrire()) return;
    e.preventDefault();
    jEl.classList.remove('survol');
    const j = +jEl.dataset.jour;
    if (PLP.dragProp) plpAjouter(j, PLP.dragProp);
    else if (PLP.dragLigne) plpDeplacerJour(PLP.dragLigne, j);
    PLP.dragProp = PLP.dragLigne = null;
  });
}

// ─── DONNÉES ────────────────────────────────────────────────────────────────
async function plpCharger() {
  const jeton = ++PLP.jeton;
  const d0 = plpCle(PLP.debut), d4 = plpCle(plpAjouterJours(PLP.debut, 4));
  if (IS_LOCAL) { plpRendre(); return; }
  try {
    const [rows, sem] = await Promise.all([
      sbGet(PLP_TABLE, `creche=eq.${encodeURIComponent(PLP.creche)}&jour=gte.${d0}&jour=lte.${d4}&order=jour.asc,position.asc`),
      sbGet(PLP_SEMAINES, `creche=eq.${encodeURIComponent(PLP.creche)}&lundi=eq.${d0}&order=lundi.asc`).catch(() => []),
    ]);
    if (jeton !== PLP.jeton) return;
    PLP.rows = Array.isArray(rows) ? rows : [];
    PLP.semaine = (Array.isArray(sem) && sem[0]) || null;
  } catch (e) {
    if (jeton !== PLP.jeton) return;
    console.error('[Planning] chargement', e);
    PLP.rows = [];
    PLP.semaine = null;
    showNotif('⚠ Planning non chargé : ' + e.message);
  }
  plpRendre();
}

async function plpRecharger(message) {
  if (message) showNotif(message);
  await plpCharger();
}

async function plpAjouter(j, propId) {
  if (!plpPeutEcrire()) return false;
  const position = plpPlaceLibre(j);
  if (!position) { showNotif('⚠ ' + PLP_JOURS[j] + ' est complet : ' + PLP_MAX + ' propositions maximum'); return false; }
  const ligne = {
    creche: PLP.creche,
    jour: plpCle(plpAjouterJours(PLP.debut, j)),
    position,
    proposition_id: propId,
  };
  try {
    if (IS_LOCAL) { ligne.id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); PLP.rows.push(ligne); }
    else { const res = await sbInsert(PLP_TABLE, ligne); PLP.rows.push(res[0] || ligne); }
    plpTouche();
    plpRendre();
    return true;
  } catch (e) {
    console.error('[Planning] ajout', e);
    await plpRecharger('⚠ Ajout impossible (la place vient peut-être d\'être prise) — planning rechargé');
    return false;
  }
}

async function plpRetirer(id) {
  try {
    if (!IS_LOCAL) await sbDelete(PLP_TABLE, id);
    PLP.rows = PLP.rows.filter(r => r.id !== id);
    plpTouche();
    plpRendre();
  } catch (e) { console.error('[Planning] retrait', e); await plpRecharger('⚠ Retrait impossible : ' + e.message); }
}

async function plpEnregistrerNote(id, valeur) {
  const l = PLP.rows.find(r => r.id === id);
  if (!l) return;
  const note = valeur.trim() || null;
  try {
    if (!IS_LOCAL) await sbUpdate(PLP_TABLE, id, { note });
    l.note = note;
    plpTouche();
    plpRendreStatut();
  } catch (e) { console.error('[Planning] note', e); showNotif('⚠ Note non enregistrée : ' + e.message); }
}

async function plpDeplacerJour(id, j) {
  const l = PLP.rows.find(r => r.id === id);
  if (!l || plpJourIdx(l) === j) return;
  const position = plpPlaceLibre(j);
  if (!position) { showNotif('⚠ ' + PLP_JOURS[j] + ' est complet : ' + PLP_MAX + ' propositions maximum'); return; }
  const jour = plpCle(plpAjouterJours(PLP.debut, j));
  try {
    if (!IS_LOCAL) await sbUpdate(PLP_TABLE, id, { jour, position });
    l.jour = jour; l.position = position;
    plpTouche();
    plpRendre();
  } catch (e) { console.error('[Planning] déplacement', e); await plpRecharger('⚠ Déplacement impossible — planning rechargé'); }
}

async function plpEchanger(id, delta) {
  const l = PLP.rows.find(r => r.id === id);
  if (!l) return;
  const jour = plpLignesJour(plpJourIdx(l));
  const i = jour.findIndex(r => r.id === id), v = jour[i + delta];
  if (!v) return;
  try {
    if (!IS_LOCAL) {
      const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/rpc/kk_planning_prop_echanger`, {
        method: 'POST', headers: SUPA_HEADERS, body: JSON.stringify({ p_a: l.id, p_b: v.id }),
      });
      if (!r.ok) throw new Error('RPC ' + r.status);
    }
    const p = l.position; l.position = v.position; v.position = p;
    plpTouche();
    plpRendre();
  } catch (e) { console.error('[Planning] échange', e); await plpRecharger('⚠ Changement d\'ordre impossible — planning rechargé'); }
}

async function plpSupprimerSemaine() {
  if (IS_LOCAL) { PLP.rows = []; return; }
  const d0 = plpCle(PLP.debut), d4 = plpCle(plpAjouterJours(PLP.debut, 4));
  const r = await sbFetchAuth(
    `${SUPA_URL}/rest/v1/${PLP_TABLE}?creche=eq.${encodeURIComponent(PLP.creche)}&jour=gte.${d0}&jour=lte.${d4}`,
    { method: 'DELETE', headers: SUPA_HEADERS });
  if (!r.ok) throw new Error('DELETE ' + r.status);
}

async function plpViderSemaine() {
  if (!plpPeutEcrire()) return;
  if (!PLP.rows.length) { showNotif('Le planning de cette semaine est déjà vide'); return; }
  if (!confirm('Vider le planning de cette semaine pour ' + PLP.creche + ' ?')) return;
  try { await plpSupprimerSemaine(); PLP.rows = []; plpTouche(); plpRendre(); showNotif('Semaine vidée'); }
  catch (e) { console.error('[Planning] vider', e); await plpRecharger('⚠ Impossible de vider : ' + e.message); }
}

async function plpCopierPrecedente() {
  if (!plpPeutEcrire()) return;
  const prec = plpAjouterJours(PLP.debut, -7);
  let source = [];
  try {
    if (IS_LOCAL) { showNotif('Copie indisponible en mode local'); return; }
    source = await sbGet(PLP_TABLE,
      `creche=eq.${encodeURIComponent(PLP.creche)}&jour=gte.${plpCle(prec)}&jour=lte.${plpCle(plpAjouterJours(prec, 4))}&order=jour.asc,position.asc`);
  } catch (e) { showNotif('⚠ Semaine précédente illisible : ' + e.message); return; }
  if (!source.length) { showNotif('Rien à copier : la semaine précédente est vide'); return; }
  if (PLP.rows.length && !confirm('Remplacer le planning de cette semaine par celui de la semaine précédente ?')) return;
  try {
    if (PLP.rows.length) await plpSupprimerSemaine();
    const nouvelles = source.map(r => ({
      creche: PLP.creche,
      jour: plpCle(plpAjouterJours(new Date(r.jour + 'T00:00:00'), 7)),
      position: r.position,
      proposition_id: r.proposition_id,
      note: r.note || null,
    }));
    await sbInsert(PLP_TABLE, nouvelles);
    showNotif('Semaine précédente copiée');
  } catch (e) { console.error('[Planning] copie', e); showNotif('⚠ Copie incomplète : ' + e.message); }
  await plpCharger();
}

// ─── AFFICHAGE ──────────────────────────────────────────────────────────────
function plpRendre() {
  const ecrit = plpPeutEcrire();
  const fin = plpAjouterJours(PLP.debut, 4);
  document.getElementById('plp-libelle').textContent =
    'Du ' + PLP.debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) +
    ' au ' + fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const lecture = document.getElementById('plp-lecture');
  lecture.style.display = ecrit ? 'none' : 'block';
  lecture.textContent = '👁 Lecture seule : vous consultez le planning de ' + PLP.creche +
    '. Seule cette crèche peut le modifier' + (SK_WRITE_CRECHE ? ' (vous pouvez modifier celui de ' + SK_WRITE_CRECHE + ').' : '.');
  ['plp-copier', 'plp-vider'].forEach(id => { document.getElementById(id).style.display = ecrit ? '' : 'none'; });
  plpRendreStatut();
  plpRendreBiblio();
  plpRendreSemaine(ecrit);
  plpRendreRecap();
}

function plpCarteBiblio(p, deja, ecrit) {
  const ph = plpPhoto(p);
  return `<div class="plp-prop${deja ? ' deja' : ''}" style="--c:${plpCouleur(p)}" ${ecrit ? 'draggable="true"' : ''} data-prop="${plpEsc(p.id)}">
    ${ph ? `<img class="plp-vignette" src="${plpEsc(ph)}" loading="lazy" alt="" onerror="this.style.display='none'">` : `<span class="plp-ic">${plpIcone(p)}</span>`}
    <div><div class="plp-nom">${plpEsc(p.nom)}</div>
    <div class="plp-meta">${plpEsc(p.cat || '')} · <b>${plpEsc(p.creche || '')}</b></div></div>
  </div>`;
}

function plpFiltrer(q, creche, cat) {
  return PROPOSITIONS.filter(p =>
    (cat === 'all' || p.cat === cat) &&
    (creche === 'all' || p.creche === creche) &&
    String(p.nom || '').toLowerCase().includes(q));
}

function plpRendreBiblio() {
  const ecrit = plpPeutEcrire();
  const cats = ['all', ...Object.keys(CAT_PROPOSITION_ICONS).filter(c => c !== 'Multi-catégories')];
  document.getElementById('plp-chips').innerHTML = cats.map(c =>
    `<button type="button" class="plp-chip${PLP.filtreCat === c ? ' on' : ''}" data-cat="${plpEsc(c)}">${c === 'all' ? 'Tout' : CAT_PROPOSITION_ICONS[c] + ' ' + plpEsc(c)}</button>`).join('');
  const planifiees = new Set(PLP.rows.map(r => String(r.proposition_id)));
  const l = plpFiltrer(PLP.q, PLP.filtreCreche, PLP.filtreCat);
  document.getElementById('plp-biblio').innerHTML = l.length
    ? l.map(p => plpCarteBiblio(p, planifiees.has(String(p.id)), ecrit)).join('')
    : '<div class="plp-aide">Aucune proposition. Créez-les dans l\'onglet « Propositions ».</div>';
}

function plpRendreSemaine(ecrit) {
  const auj = plpCle(new Date());
  document.getElementById('plp-semaine').innerHTML = PLP_JOURS.map((nom, j) => {
    const d = plpAjouterJours(PLP.debut, j);
    const lignes = plpLignesJour(j);
    const cartes = lignes.map((l, i) => {
      const p = plpProp(l.proposition_id);
      const nomP = p ? p.nom : 'Proposition introuvable';
      const ph = plpPhoto(p);
      return `<div class="plp-carte" style="--c:${plpCouleur(p)}" ${ecrit ? 'draggable="true"' : ''} data-id="${plpEsc(l.id)}">
        ${ecrit ? `<button type="button" class="plp-x" title="Retirer" data-act="x" data-id="${plpEsc(l.id)}">✕</button>` : ''}
        <div class="plp-n">PROPOSITION ${i + 1}</div>
        ${ph ? `<img class="plp-photo" src="${plpEsc(ph)}" loading="lazy" alt="" onerror="this.style.display='none'">` : ''}
        <div class="plp-nom">${plpIcone(p)} ${plpEsc(nomP)}</div>
        <div class="plp-cat">${plpEsc(p ? (p.cat || '') : '')}${p && p.creche && p.creche !== PLP.creche ? ' · ' + plpEsc(p.creche) : ''}</div>
        ${ecrit
          ? `<input class="plp-note" type="text" maxlength="200" placeholder="Note (groupe, lieu, matériel…)" value="${plpEsc(l.note || '')}" data-id="${plpEsc(l.id)}">
             <div class="plp-mv"><button type="button" data-act="up" data-id="${plpEsc(l.id)}" title="Monter">↑</button><button type="button" data-act="down" data-id="${plpEsc(l.id)}" title="Descendre">↓</button></div>`
          : (l.note ? `<div class="plp-note-lecture">${plpEsc(l.note)}</div>` : '')}
      </div>`;
    }).join('');
    const vides = ecrit && lignes.length < PLP_MAX
      ? `<div class="plp-slot" data-add="${j}">＋ Ajouter une proposition</div>` : '';
    return `<section class="plp-jour${plpCle(d) === auj ? ' auj' : ''}" data-jour="${j}">
      <div class="plp-jh"><b>${nom}</b><span>${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
        <span class="plp-cpt${lignes.length === PLP_MAX ? ' plein' : ''}">${lignes.length}/${PLP_MAX}</span></div>
      ${cartes}${vides}
      ${lignes.length === PLP_MAX ? '<div class="plp-limite">Journée complète</div>' : ''}
    </section>`;
  }).join('');
}

function plpRendreRecap() {
  const par = {};
  PLP.rows.forEach(r => { const p = plpProp(r.proposition_id); const c = (p && p.cat) || '—'; par[c] = (par[c] || 0) + 1; });
  const jours = new Set(PLP.rows.map(plpJourIdx)).size;
  const diff = new Set(PLP.rows.map(r => String(r.proposition_id))).size;
  document.getElementById('plp-recap').innerHTML =
    `<div><b>${PLP.rows.length} / ${PLP_MAX * 5}</b>propositions planifiées</div>
     <div><b>${jours} / 5</b>jours renseignés</div>
     <div><b>${diff}</b>propositions différentes</div>
     <div class="plp-barres">${Object.entries(par).sort((a, b) => b[1] - a[1]).map(([c, n]) =>
       `<span><i style="background:${PLP_COULEURS[c] || '#888'}"></i>${CAT_PROPOSITION_ICONS[c] || ''} ${plpEsc(c)} · ${n}</span>`).join('') || '<span>Rien de planifié</span>'}</div>`;
}

// ─── SÉLECTEUR (tablette) ───────────────────────────────────────────────────
function plpOuvrirPicker(j) {
  PLP.jourPicker = j;
  document.getElementById('plp-picker-titre').textContent = 'Ajouter — ' + PLP_JOURS[j] + ' ' +
    plpAjouterJours(PLP.debut, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  document.getElementById('plp-picker-rech').value = '';
  plpRendrePicker();
  document.getElementById('modal-plp-picker').classList.add('open');
}
function plpRendrePicker() {
  const q = document.getElementById('plp-picker-rech').value.toLowerCase();
  const l = plpFiltrer(q, PLP.filtreCreche, PLP.filtreCat);
  document.getElementById('plp-picker-liste').innerHTML = l.length
    ? l.map(p => plpCarteBiblio(p, false, false).replace('class="plp-prop"', `class="plp-prop" onclick="plpChoisir('${plpEsc(p.id)}')"`)).join('')
    : '<div class="plp-aide">Aucune proposition (le filtre de crèche de la liste s\'applique).</div>';
}
async function plpChoisir(id) {
  if (await plpAjouter(PLP.jourPicker, id)) closeModal('modal-plp-picker');
}

// ─── BROUILLON / PARTAGE ────────────────────────────────────────────────────
// Brouillon : visible des seules personnes de la crèche. Partagé : lisible par
// toutes les crèches de l'organisation. Une modification après le partage reste
// visible mais marque la semaine « modifiée depuis le partage ».
function plpEtat() {
  const s = PLP.semaine;
  if (!s || !s.partage_le) return 'brouillon';
  const modifie = s._touche || (s.modifie_le && new Date(s.modifie_le) > new Date(s.partage_le));
  return modifie ? 'modifie' : 'partage';
}
function plpTouche() { if (PLP.semaine) PLP.semaine._touche = true; }

function plpRendreStatut() {
  const ecrit = plpPeutEcrire(), etat = plpEtat();
  const el = document.getElementById('plp-etat');
  const quand = PLP.semaine && PLP.semaine.partage_le
    ? new Date(PLP.semaine.partage_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) +
      (PLP.semaine.partage_nom ? ' par ' + PLP.semaine.partage_nom : '') : '';
  el.className = 'plp-etat ' + etat;
  el.textContent = etat === 'brouillon' ? 'Brouillon — visible de votre crèche seulement'
    : etat === 'partage' ? 'Partagé à l\'équipe le ' + quand
    : 'Partagé le ' + quand + ' — modifié depuis';
  el.style.display = (ecrit || etat !== 'brouillon') ? '' : 'none';
  const bp = document.getElementById('plp-partager'), bb = document.getElementById('plp-brouillon');
  bp.style.display = ecrit && etat !== 'partage' ? '' : 'none';
  bp.textContent = etat === 'modifie' ? '📣 Partager à nouveau' : '📣 Partager à l\'équipe';
  bb.style.display = ecrit && etat !== 'brouillon' ? '' : 'none';
  const vide = document.getElementById('plp-vide-lecture');
  if (vide) vide.style.display = (!ecrit && !PLP.rows.length) ? 'block' : 'none';
}

async function plpPartager() {
  if (!plpPeutEcrire()) return;
  if (!PLP.rows.length) { showNotif('⚠ Le planning est vide : rien à partager'); return; }
  const lundi = plpCle(PLP.debut);
  const nom = (SK_PROFILE && SK_PROFILE.name) || '';
  try {
    if (IS_LOCAL) {
      PLP.semaine = { creche: PLP.creche, lundi, partage_le: new Date().toISOString(), partage_nom: nom, modifie_le: new Date().toISOString() };
    } else {
      const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/rpc/kk_planning_prop_partager`, {
        method: 'POST', headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify({ p_creche: PLP.creche, p_lundi: lundi, p_nom: nom }),
      });
      if (!r.ok) throw new Error('RPC ' + r.status + ' ' + await r.text().catch(() => ''));
      PLP.semaine = await r.json();
    }
    plpRendreStatut();
    const n = await plpPrevenir();
    showNotif('✅ Planning partagé à l\'équipe' + (n > 0 ? ' — ' + n + ' personne' + (n > 1 ? 's' : '') + ' prévenue' + (n > 1 ? 's' : '') : ''));
  } catch (e) { console.error('[Planning] partage', e); showNotif('⚠ Partage impossible : ' + e.message); }
}

async function plpRepasserBrouillon() {
  if (!plpPeutEcrire() || !PLP.semaine) return;
  if (!confirm('Repasser ce planning en brouillon ? Les autres crèches ne le verront plus.')) return;
  try {
    if (!IS_LOCAL) {
      const r = await sbFetchAuth(
        `${SUPA_URL}/rest/v1/${PLP_SEMAINES}?creche=eq.${encodeURIComponent(PLP.creche)}&lundi=eq.${plpCle(PLP.debut)}`,
        { method: 'PATCH', headers: SUPA_HEADERS, body: JSON.stringify({ partage_le: null, partage_par: null, partage_nom: null }) });
      if (!r.ok) throw new Error('PATCH ' + r.status);
    }
    PLP.semaine = Object.assign({}, PLP.semaine, { partage_le: null, partage_par: null, partage_nom: null, _touche: false });
    plpRendreStatut();
    showNotif('Planning repassé en brouillon');
  } catch (e) { console.error('[Planning] brouillon', e); showNotif('⚠ Impossible : ' + e.message); }
}

/** Notification push à l'équipe de la crèche (référent·es et employé·es avec un compte).
 *  Jamais bloquante ; renvoie le nombre de destinataires visés. notify-push applique
 *  lui-même le silence réseau et le contrôle d'organisation. */
async function plpPrevenir() {
  if (IS_LOCAL) return 0;
  try {
    const crecheId = Object.keys(SK_CRECHE_NAMES || {}).find(k => SK_CRECHE_NAMES[k] === PLP.creche);
    if (!crecheId) return 0;
    const [refs, emps] = await Promise.all([
      sbGet('referents', `creche_id=eq.${crecheId}&select=id&order=id.asc`).catch(() => []),
      sbGet('employes', `creche_id=eq.${crecheId}&user_id=not.is.null&select=id&order=id.asc`).catch(() => []),
    ]);
    const referent_ids = refs.map(x => x.id).filter(id => !SK_PROFILE || id !== SK_PROFILE.id);
    const employe_ids = emps.map(x => x.id);
    if (!referent_ids.length && !employe_ids.length) return 0;
    const fin = plpAjouterJours(PLP.debut, 4);
    const r = await sbFetchAuth(`${SUPA_URL}/functions/v1/notify-push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referent_ids, employe_ids,
        title: 'Planning des propositions ludiques',
        body: PLP.creche + ' — semaine du ' + PLP.debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) +
          ' au ' + fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
        url: './ludotheque.html',
        tag: 'planning-ludique-' + PLP.creche + '-' + plpCle(PLP.debut),
      }),
    });
    return r.ok ? referent_ids.length + employe_ids.length : 0;
  } catch (e) { console.warn('[Planning] notification', e); return 0; }
}
