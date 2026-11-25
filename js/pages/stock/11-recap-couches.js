// Récapitulatif mensuel de la consommation de couches : par mois (par crèche)
// et par enfant × mois. Source : RPC kk_couches_recap_mensuel
// (sql/stock_couches_recap_mensuel.sql), qui agrège couches_jour.
let COUCHES_RECAP = [];      // { creche, mois, enfantId, prenom, nom, typeCouche, taille, nb, jours }
let COUCHES_RECAP_ETAT = 'inconnu'; // 'inconnu' | 'ok' | 'indisponible'

function recapEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function recapMoisLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const l = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  return l.replace('.', '');
}
// Le récapitulatif démarre en novembre 2026 : les mois antérieurs ne sont ni affichés ni comptés.
const RECAP_DEBUT = '2026-11-01';
function recapMoisListe(n) {
  const out = [], d = new Date(); d.setDate(1);
  for (let i = 0; i < n; i++) {
    const m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    if (m < RECAP_DEBUT) break;
    out.unshift(m);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

async function coucheChargerRecap() {
  try {
    const r = await sbFetchAuth(`${SUPA_URL}/rest/v1/rpc/kk_couches_recap_mensuel`, {
      method: 'POST', headers: { ...SUPA_HEADERS }, body: JSON.stringify({ p_mois: 12 }),
    });
    if (!r.ok) throw new Error(r.status);
    const rows = await r.json();
    COUCHES_RECAP = (rows || []).map(x => ({
      creche: x.creche, mois: x.mois, enfantId: x.enfant_id, prenom: x.prenom, nom: x.nom,
      typeCouche: x.type_couche, taille: x.taille, nb: x.nb, jours: x.jours,
    }));
    COUCHES_RECAP_ETAT = 'ok';
  } catch (e) {
    console.warn('[Couches] récapitulatif mensuel (non-bloquant) :', e.message || e);
    COUCHES_RECAP_ETAT = 'indisponible';
  }
  renderCouchesRecap();
}

function renderCouchesRecap() {
  const box = document.getElementById('couches-recap');
  if (!box) return;
  if (COUCHES_RECAP_ETAT === 'inconnu') { box.innerHTML = ''; return; }
  if (COUCHES_RECAP_ETAT === 'indisponible') {
    box.innerHTML = `<div style="font-size:12px;color:var(--ink3)">Récapitulatif mensuel indisponible (appliquer <code>sql/stock_couches_recap_mensuel.sql</code> sur Supabase).</div>`;
    return;
  }
  const mois = recapMoisListe(12);
  const crechesVisibles = new Set(couchesCrechesVisibles());
  const lignes = COUCHES_RECAP.filter(x => crechesVisibles.has(x.creche) && x.mois >= RECAP_DEBUT);
  const th = 'padding:5px 8px;text-align:right;font-size:11px;color:var(--ink3);white-space:nowrap';
  const td = 'padding:5px 8px;text-align:right;font-size:12.5px;border-top:1px solid var(--border)';
  const tdn = 'padding:5px 8px;text-align:left;font-size:12.5px;border-top:1px solid var(--border);white-space:nowrap';
  // Peu de mois (début en nov. 2026) : colonnes serrées plutôt qu'étirées sur toute la largeur.
  const larg = mois.length > 5 ? 'width:100%' : 'width:auto;min-width:440px';
  const nbf = n => n ? n.toLocaleString('fr-FR') : '<span style="color:var(--ink3)">–</span>';

  let html = `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <span style="font-size:12.5px;color:var(--ink3);font-weight:700">📊 Consommation de couches par mois</span>
      <button class="btn btn-sm btn-secondary" style="margin-left:auto" onclick="coucheRecapCsv()">⬇️ CSV</button>
    </div>
    <div style="font-size:11.5px;color:var(--ink3);margin-bottom:8px">D'après les saisies « Couches du jour » depuis novembre 2026.</div>`;
  if (!lignes.length) html += `<div style="font-size:12.5px;color:var(--ink3)">Aucune consommation saisie sur la période.</div>`;

  // 1) Total par mois, une table par crèche
  [...crechesVisibles].forEach(creche => {
    const l = lignes.filter(x => x.creche === creche);
    if (!l.length) return;
    const parMois = m => l.filter(x => x.mois === m);
    const total = m => parMois(m).reduce((a, x) => a + x.nb, 0);
    const nbEnf = m => new Set(parMois(m).filter(x => x.nb > 0).map(x => x.enfantId)).size;
    const valeur = m => {
      let v = 0, ok = true;
      parMois(m).forEach(x => { const p = couchePrixUnitaire(x.typeCouche, x.taille); if (p === null) { if (x.nb) ok = false; } else v += x.nb * p; });
      return ok ? v : null;
    };
    const euro = v => v === null ? '<span title="prix manquant">?</span>' : (v ? v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '–');
    html += `<div style="font-weight:800;font-size:13.5px;margin:12px 0 4px">${recapEsc(creche)}</div>
      <div style="overflow-x:auto"><table style="border-collapse:collapse;${larg}">
      <tr><th style="${th};text-align:left"></th>${mois.map(m => `<th style="${th}">${recapMoisLabel(m)}</th>`).join('')}</tr>
      <tr><td style="${tdn}"><b>Couches utilisées</b></td>${mois.map(m => `<td style="${td}"><b>${nbf(total(m))}</b></td>`).join('')}</tr>
      <tr><td style="${tdn}">Enfants concernés</td>${mois.map(m => `<td style="${td}">${nbf(nbEnf(m))}</td>`).join('')}</tr>
      <tr><td style="${tdn}">Valeur</td>${mois.map(m => `<td style="${td}">${euro(valeur(m))}</td>`).join('')}</tr>
      </table></div>`;

    // 2) Par enfant × mois
    const enfants = new Map();
    l.forEach(x => {
      if (!enfants.has(x.enfantId)) enfants.set(x.enfantId, { nom: x.prenom + ' ' + (x.nom || '').charAt(0) + '.', prod: (x.typeCouche === 'culotte' ? 'Culotte' : 'Couche') + (x.taille ? ' T' + x.taille : ''), m: {}, tot: 0 });
      const e = enfants.get(x.enfantId); e.m[x.mois] = (e.m[x.mois] || 0) + x.nb; e.tot += x.nb;
    });
    const liste = [...enfants.values()].sort((a, b) => b.tot - a.tot);
    html += `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--accent);font-weight:600">Détail par enfant (${liste.length})</summary>
      <div style="overflow-x:auto;margin-top:6px"><table style="border-collapse:collapse;${larg}">
      <tr><th style="${th};text-align:left">Enfant</th><th style="${th};text-align:left">Produit</th>${mois.map(m => `<th style="${th}">${recapMoisLabel(m)}</th>`).join('')}<th style="${th}">Total</th></tr>
      ${liste.map(e => `<tr><td style="${tdn}">${recapEsc(e.nom)}</td><td style="${tdn};color:var(--ink3)">${e.prod}</td>${mois.map(m => `<td style="${td}">${nbf(e.m[m] || 0)}</td>`).join('')}<td style="${td}"><b>${e.tot.toLocaleString('fr-FR')}</b></td></tr>`).join('')}
      </table></div></details>`;
  });
  html += `</div>`;
  box.innerHTML = html;
}

function coucheRecapCsv() {
  const mois = recapMoisListe(12);
  const crechesVisibles = new Set(couchesCrechesVisibles());
  const enfants = new Map();
  COUCHES_RECAP.filter(x => crechesVisibles.has(x.creche) && x.mois >= RECAP_DEBUT).forEach(x => {
    const k = x.creche + '|' + x.enfantId;
    if (!enfants.has(k)) enfants.set(k, { creche: x.creche, enfant: x.prenom + ' ' + (x.nom || ''), produit: (x.typeCouche === 'culotte' ? 'Culotte' : 'Couche') + ' T' + (x.taille || ''), m: {} });
    const e = enfants.get(k); e.m[x.mois] = (e.m[x.mois] || 0) + x.nb;
  });
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const out = [['Crèche', 'Enfant', 'Produit', ...mois.map(m => m.slice(0, 7)), 'Total'].map(q).join(';')];
  [...enfants.values()].forEach(e => {
    const vals = mois.map(m => e.m[m] || 0);
    out.push([q(e.creche), q(e.enfant), q(e.produit), ...vals, vals.reduce((a, b) => a + b, 0)].join(';'));
  });
  const blob = new Blob(['﻿' + out.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'consommation-couches-par-mois.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
