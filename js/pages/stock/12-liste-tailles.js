// Support imprimable : enfants de la crèche avec la taille de couche qu'ils portent
// (fiche enfant › taille_couche / type_couche). Lecture seule, pas de SQL.
function ltEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function coucheImprimerTailles() {
  try {
    const auj = new Date().toISOString().slice(0, 10);
    const rows = await sbGet('enfants', `select=prenom,nom,creche_id,taille_couche,type_couche&taille_couche=not.is.null&or=(date_sortie.is.null,date_sortie.gte.${auj})&order=prenom.asc`);
    const creches = couchesCrechesVisibles();
    const parCreche = {};
    creches.forEach(c => { parCreche[c] = []; });
    (rows || []).forEach(r => {
      const c = typeof SK_CRECHE_NAMES !== 'undefined' ? SK_CRECHE_NAMES[r.creche_id] : null;
      if (c && parCreche[c]) parCreche[c].push(r);
    });
    const nomEnf = r => (r.prenom || '') + ' ' + ((r.nom || '').charAt(0) ? (r.nom || '').charAt(0).toUpperCase() + '.' : '');
    const prod = r => (r.type_couche === 'culotte' ? 'Couche-culotte' : 'Couche') + ' T' + r.taille_couche;
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    let pages = '';
    creches.forEach(c => {
      const l = parCreche[c].slice().sort((a, b) => nomEnf(a).localeCompare(nomEnf(b), 'fr'));
      if (!l.length) return;
      const cpt = {};
      l.forEach(r => { cpt[prod(r)] = (cpt[prod(r)] || 0) + 1; });
      const recap = Object.keys(cpt).sort().map(k => `${ltEsc(k)} : <b>${cpt[k]}</b>`).join(' &nbsp;·&nbsp; ');
      pages += `<section><h1>Tailles de couches — ${ltEsc(c)}</h1><div class="sub">Au ${date} · ${l.length} enfant${l.length > 1 ? 's' : ''}</div>
        <table><thead><tr><th>Enfant</th><th>Couche portée</th></tr></thead><tbody>
        ${l.map(r => `<tr><td>${ltEsc(nomEnf(r))}</td><td class="t">${ltEsc(prod(r))}</td></tr>`).join('')}
        </tbody></table><div class="recap">${recap}</div></section>`;
    });
    if (!pages) { showNotif('Aucun enfant avec une taille de couche renseignée.'); return; }
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Tailles de couches</title><style>
      @page{size:A4;margin:14mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0}
      section{page-break-after:always}section:last-of-type{page-break-after:auto}
      h1{font-size:20px;margin:0 0 2px}.sub{font-size:12px;color:#666;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;font-size:15px}
      th{text-align:left;font-size:12px;color:#555;border-bottom:2px solid #333;padding:6px 8px}
      td{padding:7px 8px;border-bottom:1px solid #ccc}td.t{font-weight:700}
      tr{page-break-inside:avoid}.recap{margin-top:14px;font-size:13px}
      .pied{margin-top:18px;font-size:10px;color:#888;text-align:center}
    </style></head><body>${pages}<div class="pied">Application créée par David Bucari</div></body></html>`;
    const ancien = document.getElementById('_print-frame');
    if (ancien) ancien.remove();
    const iframe = document.createElement('iframe');
    iframe.id = '_print-frame';
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { showNotif('⚠ Erreur impression : ' + e.message); } }, 300);
  } catch (e) {
    console.warn('[Couches] liste des tailles :', e);
    showNotif('⚠ Impossible de charger la liste : ' + (e.message || e));
  }
}
