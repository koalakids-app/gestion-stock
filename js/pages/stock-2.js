// ── IMPORT EXCEL ──────────────────────────────────────────────────────────

function triggerImport() {
  document.getElementById('import-result').style.display = 'none';
  document.getElementById('import-options').style.display = 'block';
  document.querySelector('input[name="import-mode"][value="ajouter"]').checked = true;
  document.getElementById('modal-import').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function triggerImportFromModal() {
  document.getElementById('importInput').click();
}

function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const mode = document.querySelector('input[name="import-mode"]:checked').value;
  const reader = new FileReader();

  reader.onload = async function(e) {
    try {
      const data  = new Uint8Array(e.target.result);
      const wb    = XLSX.read(data, { type: 'array' });

      // Look for ARTICLES sheet first, fallback to first sheet
      const sheetName = wb.SheetNames.includes('ARTICLES') ? 'ARTICLES' : wb.SheetNames[0];
      const ws        = wb.Sheets[sheetName];
      const rows      = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Find header row (contains 'Nom' or 'Nom de l\'article')
      let headerRow = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = rows[i].map(c => String(c).toLowerCase());
        if (r.some(c => c.includes('nom') && c.includes('article') || c === 'nom')) {
          headerRow = i;
          break;
        }
      }
      if (headerRow === -1) {
        showImportResult('error', '⚠ En-têtes introuvables. Utilisez le modèle fourni.');
        return;
      }

      const headers = rows[headerRow].map(c => String(c).toLowerCase().trim());
      const colIdx  = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

      const iNom    = colIdx(['nom']);
      const iRef    = colIdx(['référence','reference','ref']);
      const iCat    = colIdx(['catégorie','categorie','cat']);
      const iStruct = colIdx(['structure']);
      const iStock  = colIdx(['stock actuel','stock']);
      const iMin    = colIdx(['minimum','min']);
      const iPrix   = colIdx(['prix','price','unit']);
      const iFourn  = colIdx(['fournisseur','supplier']);
      const iNotes  = colIdx(['notes','note']);

      if (iNom === -1 || iCat === -1 || iStruct === -1 || iStock === -1) {
        showImportResult('error', '⚠ Colonnes obligatoires manquantes (Nom, Catégorie, Structure, Stock actuel).');
        return;
      }

      const CATS_VALID    = ['Sensoriel','Manipulation','Construction','Motricité','Imitation',
                             'Expression artistique','Mobilier','Puériculture','Bureautique','Rangement','Décoration','Entretien','Cuisine'];
      const STRUCTS_VALID = CRECHES;

      let imported = 0, skipped = 0, warnings = [];
      const newArticles = [];

      for (let i = headerRow + 2; i < rows.length; i++) { // +2 to skip note row
        const row = rows[i];
        const nom    = String(row[iNom]    || '').trim();
        const cat    = String(row[iCat]    || '').trim();
        const struct = String(row[iStruct] || '').trim();
        const stockV = row[iStock];

        if (!nom || !cat || !struct || stockV === '') { skipped++; continue; }

        const stock = parseInt(stockV) || 0;
        if (isNaN(stock) || stock < 0) {
          warnings.push(`Ligne ${i+1} : stock invalide pour "${nom}" — ignorée`);
          skipped++; continue;
        }

        if (!CATS_VALID.includes(cat)) {
          warnings.push(`Ligne ${i+1} : catégorie "${cat}" inconnue pour "${nom}" — importée quand même`);
        }
        if (!STRUCTS_VALID.includes(struct)) {
          warnings.push(`Ligne ${i+1} : structure "${struct}" inconnue pour "${nom}" — ignorée`);
          skipped++; continue;
        }

        const ref  = String(row[iRef]   || '').trim() || `IMP-${String(Date.now()).slice(-4)}-${imported+1}`;
        const min  = iMin   !== -1 ? (parseInt(row[iMin])   || 0)   : 0;
        const prix = iPrix  !== -1 ? (parseFloat(String(row[iPrix]).replace(',','.')) || 0) : 0;
        const fourn= iFourn !== -1 ? String(row[iFourn] || '').trim() : '';
        const notes= iNotes !== -1 ? String(row[iNotes] || '').trim() : '';

        newArticles.push({ id: Date.now() + imported, nom, ref, cat, creche: struct,
                           stock, min, prix, fourn, notes, photo: null });
        imported++;
      }

      if (mode === 'remplacer') {
        ARTICLES.length = 0;
      }
      // Bulk insert articles
      for (const a of newArticles) {
        ARTICLES.push(a);
      }
      saveData();
      addHisto('entrée', `Import Excel — ${imported} articles`, imported, 'Toutes', 'Import',
               `Mode : ${mode === 'remplacer' ? 'remplacement total' : 'ajout'}`);

      renderActiveInvTable();
      renderHistorique();
      updateCounts();
      renderStats();

      const warnHtml = warnings.length > 0
        ? `<div style="margin-top:12px;font-size:12px;color:var(--amber);background:var(--amber-lt);padding:10px;border-radius:8px;max-height:120px;overflow-y:auto">
             ⚠ ${warnings.length} avertissement(s) :<br>${warnings.join('<br>')}
           </div>` : '';

      showImportResult('success',
        `<strong>✅ Import réussi !</strong><br>
         ${imported} article(s) importé(s) · ${skipped} ligne(s) ignorée(s)
         ${mode === 'remplacer' ? '<br>⚠ Tous les articles précédents ont été supprimés.' : ''}
         ${warnHtml}`);

      document.getElementById('import-options').style.display = 'none';
      document.querySelector('.modal-footer .btn-primary').textContent = '✕ Fermer';
      document.querySelector('.modal-footer .btn-primary').onclick = () => closeModal('modal-import');

    } catch(err) {
      showImportResult('error', `⚠ Erreur lors de la lecture du fichier : ${err.message}`);
    }

    event.target.value = ''; // reset input
  };

  reader.readAsArrayBuffer(file);
}

function exportCommandesExcel() { showNotif('Utilisez le bouton ⬇ Excel sur chaque commande'); }


function showImportResult(type, html) {
  const el = document.getElementById('import-result');
  el.style.display = 'block';
  const bg    = type === 'success' ? 'var(--green-lt)'  : 'var(--red-lt)';
  const border= type === 'success' ? '#BBF7D0'           : '#FECACA';
  const color = type === 'success' ? 'var(--green)'      : 'var(--red)';
  el.innerHTML = `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:14px 16px;font-size:13px;color:${color};line-height:1.7">${html}</div>`;
}
