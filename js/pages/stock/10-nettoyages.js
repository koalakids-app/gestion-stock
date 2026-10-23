// ─── NETTOYAGES DES JEUX ET DES ESPACES — traçabilité (lien avec le PMS) ─────
// Plan de nettoyage par crèche (nettoyage_plan) + registre horodaté de chaque
// nettoyage réalisé (nettoyage_journal), voir sql/nettoyages_jeux_espaces.sql.
// Le registre est repris dans le plan de maîtrise sanitaire (documents.html,
// js/pages/documents/07-pms-sanitaire.js) pour la crèche choisie.
//
// Droits : toute l'équipe de la crèche coche le registre ; seuls la direction et
// les référent(e)s modifient le plan. Une ligne du registre ne se modifie pas :
// elle se supprime (direction à tout moment, auteur dans les 15 minutes).

const NETT_FREQ = {
  apres_usage: 'Après chaque usage',
  quotidien: 'Chaque jour',
  hebdomadaire: 'Chaque semaine',
  mensuel: 'Chaque mois'
};
const NETT_TYPES = { jeux: 'Jeux et jouets', espace: 'Espaces et mobilier' };
const NETT_JOURS_CHARGES = 62;   // fenêtre lue en base (couvre le mois en cours et les relevés du PMS)
const NETT_ANNULATION_MIN = 15;  // minutes pendant lesquelles l'auteur peut retirer sa ligne

// Plan type proposé à une crèche qui n'a encore rien saisi : [type, libellé, fréquence, méthode].
// Ce sont des repères d'usage, à ajuster par la direction ou la référente selon la structure.
const NETT_PLAN_TYPE = [
  ['jeux', 'Jouets mis à la bouche (bébés)', 'apres_usage', 'Eau chaude et détergent, rinçage à l’eau claire, séchage'],
  ['jeux', 'Jouets en plastique et en caoutchouc', 'hebdomadaire', 'Eau chaude et détergent, rinçage, séchage'],
  ['jeux', 'Jouets en bois', 'hebdomadaire', 'Chiffon légèrement humide avec détergent doux, sans tremper, séchage'],
  ['jeux', 'Peluches et jouets en tissu', 'mensuel', 'Lavage en machine selon l’étiquette, séchage complet'],
  ['jeux', 'Dînette et jouets d’imitation', 'hebdomadaire', 'Eau chaude et détergent, rinçage, séchage'],
  ['jeux', 'Livres cartonnés', 'mensuel', 'Chiffon légèrement humide, séchage'],
  ['jeux', 'Tapis, matelas et modules de motricité', 'quotidien', 'Détergent-désinfectant sur les surfaces lavables, séchage'],
  ['jeux', 'Balles et jouets de motricité', 'hebdomadaire', 'Eau chaude et détergent, rinçage, séchage'],
  ['jeux', 'Jouets d’extérieur et de sable', 'hebdomadaire', 'Eau et détergent, rinçage, séchage ; bac à sable couvert après usage'],
  ['espace', 'Sols de la salle de jeux et des espaces de vie', 'quotidien', 'Balayage humide puis lavage au détergent'],
  ['espace', 'Tables et chaises d’activité', 'quotidien', 'Détergent-désinfectant, séchage'],
  ['espace', 'Espace repas (tables, chaises hautes)', 'apres_usage', 'Nettoyage et désinfection après chaque repas, rinçage'],
  ['espace', 'Plan de change et matelas à langer', 'apres_usage', 'Détergent-désinfectant après chaque change, séchage'],
  ['espace', 'Sanitaires enfants (WC, pots, lavabos)', 'quotidien', 'Détergent-désinfectant ; pots vidés et lavés après chaque usage'],
  ['espace', 'Poignées de portes, interrupteurs, barrières', 'quotidien', 'Lingette ou chiffon avec désinfectant'],
  ['espace', 'Dortoir : sols et surfaces', 'quotidien', 'Aspirateur ou balayage humide, lavage au détergent'],
  ['espace', 'Lits et literie (draps, couvertures)', 'hebdomadaire', 'Draps lavés à 60 °C, changés plus tôt si souillés'],
  ['espace', 'Espace extérieur (terrasse, jardin)', 'hebdomadaire', 'Balayage, contrôle de la propreté et de l’état, évacuation des déchets'],
  ['espace', 'Poubelles', 'quotidien', 'Vidage, lavage du bac au besoin']
];

let NETT_PLAN = [], NETT_JOURNAL = [], NETT_CRECHE = null, NETT_ERREUR = null, NETT_REQ = 0;
let NETT_EDIT_ID = null, NETT_FAIT_ID = null;
const NETT_ENVOI = {};   // lignes en cours d'enregistrement (évite un double clic)

// ── Utilitaires ───────────────────────────────────────────────────────────
function nettEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function nettJour(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function nettDateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || '');
}
function nettQui() {
  return (typeof SK_PROFILE !== 'undefined' && SK_PROFILE && SK_PROFILE.name)
    || (typeof SK_USER !== 'undefined' && SK_USER && SK_USER.email) || '';
}
function nettPeutGerer() {
  return typeof SK_PROFILE !== 'undefined' && SK_PROFILE && (SK_PROFILE.role === 'direction' || SK_PROFILE.role === 'referent');
}
function nettEstDirection() {
  return typeof SK_PROFILE !== 'undefined' && SK_PROFILE && SK_PROFILE.role === 'direction';
}
// Crèche dont on affiche le registre : la sienne pour une référente ou un(e) employé(e),
// la structure choisie dans la barre latérale pour la direction.
function nettCreche() {
  if (typeof SK_LOCKED_CRECHE !== 'undefined' && SK_LOCKED_CRECHE) return SK_LOCKED_CRECHE;
  if (typeof SK_WRITE_CRECHE !== 'undefined' && SK_WRITE_CRECHE) return SK_WRITE_CRECHE;
  return currentCreche === 'all' ? null : currentCreche;
}
// Début de la période en cours pour une fréquence (lundi pour la semaine, le 1er pour le mois).
function nettDebutPeriode(freq) {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (freq === 'hebdomadaire') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (freq === 'mensuel') d.setDate(1);
  return nettJour(d);
}
const NETT_PERIODE_LIBELLE = { apres_usage: 'aujourd’hui', quotidien: 'aujourd’hui', hebdomadaire: 'cette semaine', mensuel: 'ce mois-ci' };

// État d'une ligne du plan sur la période en cours.
function nettStatut(p) {
  const debut = nettDebutPeriode(p.frequence);
  const faits = NETT_JOURNAL.filter(j => j.plan_id === p.id && j.fait_le >= debut);
  const dernier = faits[0] || null;   // le journal est trié du plus récent au plus ancien
  if (p.frequence === 'apres_usage') return { code: 'libre', n: faits.length, dernier };
  if (faits.length) return { code: 'ok', n: faits.length, dernier };
  const jourSemaine = new Date().getDay();
  if (p.frequence === 'quotidien' && (jourSemaine === 0 || jourSemaine === 6)) return { code: 'repos', n: 0, dernier: null };
  return { code: 'afaire', n: 0, dernier: null };
}

// ── Chargement ────────────────────────────────────────────────────────────
async function nettCharger(creche) {
  const req = ++NETT_REQ;
  NETT_ERREUR = null;
  const box = document.getElementById('nett-contenu');
  if (box) box.innerHTML = '<div class="nett-vide">Chargement du registre…</div>';
  try {
    const depuis = nettJour(new Date(Date.now() - NETT_JOURS_CHARGES * 864e5));
    const c = encodeURIComponent(creche);
    const [plan, jour] = await Promise.all([
      sbGet('nettoyage_plan', `select=*&creche=eq.${c}&actif=eq.true&order=type.asc,ordre.asc,libelle.asc`),
      sbGet('nettoyage_journal', `select=*&creche=eq.${c}&fait_le=gte.${depuis}&order=fait_le.desc,created_at.desc`)
    ]);
    if (req !== NETT_REQ) return;   // une autre crèche a été choisie entre-temps
    NETT_PLAN = plan; NETT_JOURNAL = jour;
  } catch (e) {
    if (req !== NETT_REQ) return;
    NETT_PLAN = []; NETT_JOURNAL = [];
    NETT_ERREUR = /PGRST205|42P01|404/.test(String(e && e.message)) ? 'absent' : String((e && e.message) || 'erreur');
  }
  NETT_CRECHE = creche;
  renderNettoyages();
}
function nettRecharger() { NETT_CRECHE = null; renderNettoyages(); }

// ── Affichage ─────────────────────────────────────────────────────────────
function nettBadgeStatut(p, s) {
  const per = NETT_PERIODE_LIBELLE[p.frequence];
  if (s.code === 'ok') {
    const qui = s.dernier && s.dernier.fait_par ? ' · ' + nettEsc(s.dernier.fait_par) : '';
    return `<span class="badge badge-green">✓ Fait le ${nettDateFr(s.dernier.fait_le)}${qui}</span>`;
  }
  if (s.code === 'afaire') return `<span class="badge badge-amber">À faire ${per}</span>`;
  if (s.code === 'repos') return '<span class="badge" style="background:var(--bg);color:var(--ink3)">Week-end</span>';
  return `<span class="badge" style="background:var(--bg);color:var(--ink2)">${s.n} fois ${per}</span>`;
}

function nettLigneHtml(p) {
  const s = nettStatut(p);
  const gestion = nettPeutGerer()
    ? `<button class="btn btn-secondary btn-sm" title="Modifier la ligne" onclick="nettOuvrirPlan('${p.id}')">✏️</button>
       <button class="btn btn-secondary btn-sm" title="Retirer du plan" onclick="nettRetirerPlan('${p.id}')">🗑</button>`
    : '';
  return `<div class="nett-ligne">
    <div class="nett-nom"><b>${nettEsc(p.libelle)}</b>${p.methode ? `<div class="nett-methode">${nettEsc(p.methode)}</div>` : ''}</div>
    <span class="badge badge-blue">${NETT_FREQ[p.frequence] || nettEsc(p.frequence)}</span>
    ${nettBadgeStatut(p, s)}
    <div class="nett-actions">
      <button class="btn btn-primary btn-sm" onclick="nettFait('${p.id}')">✓ Fait</button>
      <button class="btn btn-secondary btn-sm" title="Ajouter une date, un produit ou une observation" onclick="nettOuvrirFait('${p.id}')">…</button>
      ${gestion}
    </div>
  </div>`;
}

function nettHistoriqueHtml() {
  const jours = Number((document.getElementById('nett-hist-jours') || {}).value) || 14;
  const depuis = nettJour(new Date(Date.now() - jours * 864e5));
  const lignes = NETT_JOURNAL.filter(j => j.fait_le >= depuis);
  const monId = typeof SK_USER !== 'undefined' && SK_USER ? SK_USER.id : null;
  const maintenant = Date.now();
  const corps = lignes.map(j => {
    const recent = j.created_at && (maintenant - new Date(j.created_at).getTime()) < NETT_ANNULATION_MIN * 60000;
    const peutRetirer = nettEstDirection() || (monId && j.fait_par_user === monId && recent);
    return `<tr>
      <td>${nettDateFr(j.fait_le)}</td>
      <td><b>${nettEsc(j.libelle)}</b><div class="nett-methode">${NETT_TYPES[j.type] || ''}</div></td>
      <td>${nettEsc(j.fait_par || '—')}</td>
      <td>${nettEsc(j.produit || '')}</td>
      <td>${nettEsc(j.observation || '')}</td>
      <td style="text-align:right">${peutRetirer ? `<button class="btn btn-secondary btn-sm" title="Retirer cette ligne du registre" onclick="nettRetirerJournal('${j.id}')">✕</button>` : ''}</td>
    </tr>`;
  }).join('');
  return lignes.length
    ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Jeu ou espace</th><th>Fait par</th><th>Produit</th><th>Observation</th><th></th></tr></thead><tbody>${corps}</tbody></table></div>`
    : '<div class="nett-vide">Aucun nettoyage noté sur cette période.</div>';
}
function nettMajHistorique() {
  const box = document.getElementById('nett-historique');
  if (box) box.innerHTML = nettHistoriqueHtml();
}

function renderNettoyages() {
  const box = document.getElementById('nett-contenu');
  if (!box) return;
  const creche = nettCreche();
  const titre = document.getElementById('nett-creche');
  if (titre) titre.textContent = creche || '';
  if (typeof SK_TOKEN !== 'undefined' && !SK_TOKEN) {
    box.innerHTML = '<div class="nett-vide">Connectez-vous pour consulter le registre des nettoyages.</div>';
    return;
  }
  if (!creche) {
    box.innerHTML = '<div class="nett-vide">Choisissez une structure dans la barre latérale pour consulter son plan et son registre de nettoyage.</div>';
    return;
  }
  if (NETT_CRECHE !== creche) { nettCharger(creche); return; }
  if (NETT_ERREUR === 'absent') {
    box.innerHTML = '<div class="nett-vide">Le registre des nettoyages n’est pas encore activé : le script <b>sql/nettoyages_jeux_espaces.sql</b> reste à exécuter dans Supabase.</div>';
    return;
  }
  if (NETT_ERREUR) {
    box.innerHTML = `<div class="nett-vide">Lecture impossible : ${nettEsc(NETT_ERREUR)}<br><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="nettRecharger()">Réessayer</button></div>`;
    return;
  }

  const suivis = NETT_PLAN.filter(p => p.frequence !== 'apres_usage');
  const afaire = suivis.filter(p => nettStatut(p).code === 'afaire').length;
  const resume = !NETT_PLAN.length ? ''
    : `<div class="nett-resume ${afaire ? 'nett-resume-alerte' : 'nett-resume-ok'}">${afaire
        ? `⚠ ${afaire} nettoyage${afaire > 1 ? 's' : ''} à faire sur la période en cours`
        : '✓ Tous les nettoyages à fréquence fixe sont notés sur la période en cours'}</div>`;

  let html = resume;
  if (!NETT_PLAN.length) {
    html += `<div class="nett-vide">Aucun plan de nettoyage pour ${nettEsc(creche)}.
      ${nettPeutGerer() ? `<br><button class="btn btn-primary" style="margin-top:12px" onclick="nettChargerPlanType()">Charger le plan type (${NETT_PLAN_TYPE.length} lignes)</button>
      <button class="btn btn-secondary" style="margin-top:12px" onclick="nettOuvrirPlan()">+ Ajouter une ligne</button>` : '<br>La direction ou la référente doit d’abord le créer.'}</div>`;
  } else {
    ['jeux', 'espace'].forEach(t => {
      const lignes = NETT_PLAN.filter(p => p.type === t);
      if (!lignes.length) return;
      html += `<div class="nett-groupe"><div class="nett-groupe-titre">${t === 'jeux' ? '🧸' : '🏠'} ${NETT_TYPES[t]}</div>${lignes.map(nettLigneHtml).join('')}</div>`;
    });
    if (nettPeutGerer()) html += '<div style="padding:4px 20px 0"><button class="btn btn-secondary btn-sm" onclick="nettOuvrirPlan()">+ Ajouter une ligne au plan</button></div>';
  }

  html += `<div class="nett-groupe" style="margin-top:22px">
    <div class="nett-groupe-titre" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">📋 Registre
      <select id="nett-hist-jours" onchange="nettMajHistorique()" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px">
        <option value="7">7 derniers jours</option><option value="14" selected>14 derniers jours</option><option value="30">30 derniers jours</option><option value="62">2 derniers mois</option>
      </select>
      <button class="btn btn-secondary btn-sm" onclick="nettExportCSV()">⬇ Exporter (12 mois)</button>
    </div>
    <div id="nett-historique">${nettHistoriqueHtml()}</div></div>`;
  box.innerHTML = html;
}

// ── Enregistrer un nettoyage ──────────────────────────────────────────────
async function nettEnregistrer(p, extra) {
  if (NETT_ENVOI[p.id]) return false;
  NETT_ENVOI[p.id] = true;
  try {
    const rows = await sbInsert('nettoyage_journal', {
      plan_id: p.id, creche: p.creche, type: p.type, libelle: p.libelle, frequence: p.frequence,
      fait_le: (extra && extra.date) || nettJour(),
      fait_par: nettQui() || null,
      produit: (extra && extra.produit) || null,
      observation: (extra && extra.observation) || null
    });
    if (!rows || !rows.length) throw new Error('refusé');
    NETT_JOURNAL.push(rows[0]);
    NETT_JOURNAL.sort((a, b) => (b.fait_le + (b.created_at || '')).localeCompare(a.fait_le + (a.created_at || '')));
    showNotif('✓ Nettoyage noté : ' + p.libelle);
    return true;
  } catch (e) {
    showNotif('⚠ Nettoyage non enregistré : ' + (e.message || e));
    return false;
  } finally {
    delete NETT_ENVOI[p.id];
  }
}
async function nettFait(planId) {
  const p = NETT_PLAN.find(x => x.id === planId);
  if (!p) return;
  const s = nettStatut(p);
  if (s.code === 'ok' && !confirm('Déjà noté ' + NETT_PERIODE_LIBELLE[p.frequence] + '. Ajouter un nouveau nettoyage ?')) return;
  if (await nettEnregistrer(p)) renderNettoyages();
}
function nettOuvrirFait(planId) {
  const p = NETT_PLAN.find(x => x.id === planId);
  if (!p) return;
  NETT_FAIT_ID = planId;
  document.getElementById('nf-titre').textContent = p.libelle;
  const d = document.getElementById('nf-date');
  d.max = nettJour();
  d.min = nettJour(new Date(Date.now() - 7 * 864e5));
  d.value = nettJour();
  document.getElementById('nf-produit').value = '';
  document.getElementById('nf-obs').value = '';
  // Produits d'entretien du stock : proposés pour garder le lien avec l'inventaire
  const noms = [...new Set((typeof ARTICLES !== 'undefined' ? ARTICLES : [])
    .filter(a => a.cat === 'Entretien' && a.nom).map(a => a.nom))].sort((a, b) => a.localeCompare(b, 'fr'));
  document.getElementById('nf-produits').innerHTML = noms.map(n => `<option value="${nettEsc(n)}">`).join('');
  openModal('nett-fait');
}
async function nettValiderFait() {
  const p = NETT_PLAN.find(x => x.id === NETT_FAIT_ID);
  if (!p) return;
  const date = document.getElementById('nf-date').value;
  if (!date || date > nettJour()) return showNotif('⚠ Choisissez une date qui n’est pas dans le futur.');
  const ok = await nettEnregistrer(p, {
    date,
    produit: document.getElementById('nf-produit').value.trim(),
    observation: document.getElementById('nf-obs').value.trim()
  });
  if (ok) { closeModal('modal-nett-fait'); renderNettoyages(); }
}

// Retrait d'une ligne du registre. La base refuse en silence (aucune ligne renvoyée)
// si le délai de 15 minutes est dépassé pour un(e) non-direction : on le vérifie.
async function nettRetirerJournal(id) {
  const j = NETT_JOURNAL.find(x => x.id === id);
  if (!j || !confirm('Retirer cette ligne du registre ?\n' + j.libelle + ' — ' + nettDateFr(j.fait_le))) return;
  try {
    const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/nettoyage_journal?id=eq.${id}`, {
      method: 'DELETE', headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation' }
    });
    const rows = r.ok ? await r.json() : [];
    if (!r.ok || !rows.length) { showNotif('⚠ Retrait refusé : au-delà de ' + NETT_ANNULATION_MIN + ' minutes, seule la direction peut retirer une ligne.'); return; }
    NETT_JOURNAL = NETT_JOURNAL.filter(x => x.id !== id);
    renderNettoyages();
  } catch (e) { showNotif('⚠ Retrait impossible : ' + (e.message || e)); }
}

// ── Gérer le plan (direction et référent(e)s) ─────────────────────────────
function nettOuvrirPlan(id) {
  const p = id ? NETT_PLAN.find(x => x.id === id) : null;
  NETT_EDIT_ID = p ? p.id : null;
  document.getElementById('np-titre').textContent = p ? 'Modifier la ligne du plan' : 'Ajouter une ligne au plan';
  document.getElementById('np-type').value = p ? p.type : 'jeux';
  document.getElementById('np-libelle').value = p ? p.libelle : '';
  document.getElementById('np-freq').value = p ? p.frequence : 'hebdomadaire';
  document.getElementById('np-methode').value = p ? (p.methode || '') : '';
  openModal('nett-plan');
}
async function nettEnregistrerPlan() {
  const creche = nettCreche();
  const libelle = document.getElementById('np-libelle').value.trim();
  if (!creche) return;
  if (!libelle) return showNotif('⚠ Indiquez le jeu ou l’espace à nettoyer.');
  const ligne = {
    type: document.getElementById('np-type').value,
    libelle,
    frequence: document.getElementById('np-freq').value,
    methode: document.getElementById('np-methode').value.trim() || null
  };
  try {
    if (NETT_EDIT_ID) {
      const rows = await sbUpdate('nettoyage_plan', NETT_EDIT_ID, ligne);
      if (!rows || !rows.length) throw new Error('modification refusée (droits insuffisants)');
    } else {
      const rows = await sbInsert('nettoyage_plan', { ...ligne, creche, ordre: NETT_PLAN.length + 1 });
      if (!rows || !rows.length) throw new Error('ajout refusé (droits insuffisants)');
    }
    closeModal('modal-nett-plan');
    showNotif('✓ Plan de nettoyage mis à jour');
    nettRecharger();
  } catch (e) { showNotif('⚠ Plan non enregistré : ' + (e.message || e)); }
}
// La ligne n'est pas supprimée : elle sort du plan (actif = false), et les nettoyages déjà notés restent lisibles.
async function nettRetirerPlan(id) {
  const p = NETT_PLAN.find(x => x.id === id);
  if (!p || !confirm('Retirer « ' + p.libelle + ' » du plan ?\nLes nettoyages déjà notés restent dans le registre.')) return;
  try {
    const rows = await sbUpdate('nettoyage_plan', id, { actif: false });
    if (!rows || !rows.length) throw new Error('modification refusée (droits insuffisants)');
    nettRecharger();
  } catch (e) { showNotif('⚠ Retrait impossible : ' + (e.message || e)); }
}
async function nettChargerPlanType() {
  const creche = nettCreche();
  if (!creche || !confirm('Créer ' + NETT_PLAN_TYPE.length + ' lignes de plan type pour ' + creche + ' ?\nVous pourrez les modifier ou les retirer ensuite.')) return;
  try {
    const rows = await sbInsert('nettoyage_plan', NETT_PLAN_TYPE.map((l, i) => ({
      creche, type: l[0], libelle: l[1], frequence: l[2], methode: l[3], ordre: i + 1
    })));
    if (!rows || !rows.length) throw new Error('ajout refusé (droits insuffisants)');
    nettRecharger();
  } catch (e) { showNotif('⚠ Plan type non créé : ' + (e.message || e)); }
}

// ── Export du registre (12 mois) ──────────────────────────────────────────
async function nettExportCSV() {
  const creche = nettCreche();
  if (!creche) return;
  try {
    const depuis = nettJour(new Date(Date.now() - 366 * 864e5));
    const c = encodeURIComponent(creche);
    let tout = [];
    for (let off = 0; ; off += 1000) {   // le serveur plafonne une réponse : on lit par pages
      const page = await sbGet('nettoyage_journal', `select=*&creche=eq.${c}&fait_le=gte.${depuis}&order=fait_le.desc,created_at.desc&limit=1000&offset=${off}`);
      tout = tout.concat(page);
      if (page.length < 1000) break;
    }
    const lignes = [['Date', 'Crèche', 'Type', 'Jeu ou espace', 'Fréquence', 'Fait par', 'Produit', 'Observation']]
      .concat(tout.map(j => [nettDateFr(j.fait_le), j.creche, NETT_TYPES[j.type] || j.type, j.libelle, NETT_FREQ[j.frequence] || j.frequence || '', j.fait_par || '', j.produit || '', j.observation || '']));
    const csv = '﻿' + lignes.map(l => l.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'nettoyages_' + creche.replace(/[^a-zA-Z0-9]+/g, '_') + '_' + nettJour() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    showNotif('✓ ' + tout.length + ' nettoyage' + (tout.length > 1 ? 's' : '') + ' exporté' + (tout.length > 1 ? 's' : ''));
  } catch (e) { showNotif('⚠ Export impossible : ' + (e.message || e)); }
}
