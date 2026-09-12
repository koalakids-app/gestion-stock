// ════════════════════════════════════════════════════════════════════════
// ── IMPORT PLANNING SALARIÉS DEPUIS LE PDF DE PRÉSENCES (Gantt) ──
//
// Le PDF n'expose pas les horaires en texte : ce sont des barres vertes
// vectorielles. On rend donc chaque page sur un canvas et on détecte les
// barres par balayage de pixels. La couche texte ne sert qu'aux noms, à
// l'axe des heures et à la date.
//
// Écrit dans planning_equipe, une ligne par (creche_id, prenom, semaine, jour) :
//   2 segments -> hdebut = début du 1er, hfin = fin du 2e, pause = "12:30-13:30"
//   1 segment  -> hdebut / hfin, pause = null
//
// Préfixe sp* (salariés PDF) pour ne pas entrer en collision avec les
// fonctions ip* déjà utilisées par l'import Excel et l'import Présences.
// ════════════════════════════════════════════════════════════════════════

const SP_BAR_RGB = [51, 204, 102];   // vert des barres de présence
const SP_TOLERANCE = 40;
const SP_SCALE = 2;                  // ~1 px = 1 minute
const SP_ROUND_MIN = 15;             // la grille du PDF est au quart d’heure : on s’y accroche
                                     // pour retenir l’horaire théorique et non le pointage
const SP_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

// Le PDF est vectoriel : les bornes des barres tombent exactement au quart
// d’heure (vérifié sur les exports Familien). On garde donc la mesure telle
// quelle. L’ancien recalage sur une liste de créneaux théoriques falsifiait
// les pauses : une journée réelle 10h30-13h30 / 14h30-18h30 était réécrite
// 13h00-14h00, et une journée hors liste perdait sa pause à l’affichage.
//
// SP_GAP_MIN : en dessous de ce seuil, une coupure entre deux barres est un
// artefact de rendu (trait de grille), pas une pause.
const SP_GAP_MIN = 10;

let _spData = null;

// ── Parsing PDF ────────────────────────────────────────────────────────

// Accepte une liste de fichiers : chaque PDF apporte ses journées, on les
// cumule. Les doublons de date (même journée présente dans deux fichiers) sont
// écartés et signalés, pour ne pas écrire deux fois la même ligne.
async function spParsePdf(files) {
  const liste = Array.isArray(files) ? files : [files];
  const jours = [], warnings = [], titles = [], vues = new Set();

  for (let f = 0; f < liste.length; f++) {
    const fichier = liste[f];
    if (liste.length > 1) showBanner('Lecture ' + (f + 1) + '/' + liste.length + ' \u2014 ' + fichier.name);
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: await fichier.arrayBuffer() }).promise;
    } catch (e) {
      warnings.push(fichier.name + ' : fichier illisible, ignoré.');
      continue;
    }
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      try {
        const r = await spParsePage(page);
        if (r.title) titles.push(r.title);
        if (vues.has(r.dateISO)) {
          warnings.push(spDateFr(r.dateISO) + ' apparaît dans plusieurs fichiers : seule la première lecture est conservée.');
          continue;
        }
        vues.add(r.dateISO);
        jours.push(r);
      } catch (e) {
        warnings.push(fichier.name + ' \u2014 page ' + p + ' ignorée : ' + e.message);
      }
    }
  }
  jours.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return { jours, warnings, titles: [...new Set(titles)] };
}

async function spParsePage(page) {
  const viewport = page.getViewport({ scale: SP_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const tc = await page.getTextContent();
  const items = tc.items.filter(it => (it.str || '').trim()).map(it => {
    const t = pdfjsLib.Util.transform(viewport.transform, it.transform);
    return { texte: it.str.trim(), x: t[4], y: t[5], w: it.width * SP_SCALE };
  });

  const fullText = items.map(i => i.texte).join(' ');
  const dateISO = spLireDate(fullText);
  const axe = spCalibrerAxe(items);
  const bande = spTrouverBandeSalaries(items, canvas.height);
  const tm = fullText.match(/(KOALA\s*KIDS[^]{0,40}?)\s*(?:CRÈCHE|CRECHE|Planning)/i);

  const salaries = [];
  for (const ligne of spGrouperLignes(items, bande)) {
    const segments = spDetecterSegments(px, canvas.width, ligne.y, axe);
    if (!segments.length) continue;          // listé mais absent ce jour-là
    salaries.push({ nomPdf: ligne.nom, segments });
  }

  // Libère le canvas (5 pages en scale 2 sur tablette)
  canvas.width = canvas.height = 0;

  return { dateISO, salaries, title: tm ? tm[1].trim() : '' };
}

// Le titre varie selon l'export ("Planning du lundi 27 juillet 2026", mais un
// planning prévisionnel peut être libellé autrement). On cherche donc un motif
// « jour mois année » n'importe où dans l'en-tête, sans exiger de préfixe.
function spLireDate(txt) {
  const mois = Object.keys(IP_MONTHS).join('|');
  const m = txt.match(new RegExp('(\\d{1,2})(?:er)?\\s+(' + mois + ')\\s+(\\d{4})', 'i'));
  if (!m) throw new Error('date introuvable dans le titre');
  const mon = IP_MONTHS[m[2].toLowerCase()];   // réutilise la table du module Présences
  if (!mon) throw new Error('mois non reconnu : ' + m[2]);
  return m[3] + '-' + String(mon).padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

// L'axe « 7h … 20h » donne la conversion pixels -> heures (espacement linéaire).
function spCalibrerAxe(items) {
  const rep = items.filter(it => /^\d{1,2}h$/.test(it.texte))
    .map(it => ({ h: parseInt(it.texte, 10), x: it.x + it.w / 2 }))
    .sort((a, b) => a.h - b.h);
  if (rep.length < 2) throw new Error('axe des heures introuvable');
  const a = rep[0], b = rep[rep.length - 1];
  const pxH = (b.x - a.x) / (b.h - a.h);
  return { xMin: a.x - pxH / 2, xMax: b.x + pxH / 2, versHeure: x => a.h + (x - a.x) / pxH };
}

// Bande verticale entre l'en-tête « Salariés » et l'en-tête « Totaux ».
// « Salariés » apparaît deux fois quand les totaux sont présents : en-tête de
// section, puis dans les totaux. Un export prévisionnel peut ne pas avoir de
// section « Totaux » : on borne alors au bas de la page.
function spSection(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, ''); }
function spEstSalaries(t) { const k = spSection(t); return k === 'salaries' || k === 'salariees' || k === 'salarie' || k === 'personnel' || k === 'equipe'; }
function spEstEnfants(t) { return spSection(t) === 'enfants'; }
function spEstTotaux(t) { return spSection(t) === 'totaux' || spSection(t) === 'total'; }

function spTrouverBandeSalaries(items, hauteurPage) {
  const tot = items.find(it => spEstTotaux(it.texte));
  const limite = tot ? tot.y : hauteurPage;
  const ent = items.filter(it => spEstSalaries(it.texte) && it.y < limite)
    .sort((a, b) => b.y - a.y);
  if (!ent.length) throw new Error('section « Salariés » introuvable');
  return { haut: ent[0].y + 6 * SP_SCALE, bas: limite - (tot ? 6 * SP_SCALE : 0) };
}

// Un nom sur deux lignes (« France miline » / « STRAZEL ») a un interligne
// d'environ 9 pt, contre 21 pt entre deux salariés : seuil à 13 pt.
//
// Le seuil seul ne suffit pas : quand deux salariés ont chacun un nom sur deux
// lignes, l'écart entre la fin du premier et le début du second se resserre et
// passe sous les 13 pt. Les deux personnes fusionnaient alors en une seule
// entrée (« France miline STRAZEL Juliette CROKAERT Y SAUVANET »), et la
// seconde disparaissait purement et simplement de l'import.
//
// On ajoute donc un second critère, indépendant de la géométrie : une ligne qui
// commence par un prénom (Majuscule suivie de minuscules) ouvre une nouvelle
// personne dès lors que le groupe courant contient déjà un patronyme
// (mot entièrement en majuscules). Ce critère ne peut que séparer davantage,
// jamais regrouper à tort.
function spEstPrenomTok(t) { return !!t && /^[A-ZÀ-Ÿ][a-zà-ÿ]/.test(t); }
function spEstNomTok(t) { return !!t && /^[A-ZÀ-Ÿ][A-ZÀ-Ÿ'’-]+$/.test(t); }

function spGrouperLignes(items, bande) {
  const dans = items.filter(it => it.y > bande.haut && it.y < bande.bas)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // 1) Reconstituer les lignes de texte (même ordonnée à 2 pt près).
  const lignes = [];
  for (const it of dans) {
    const l = lignes[lignes.length - 1];
    if (l && it.y - l.y < 2 * SP_SCALE) { l.toks.push(it.texte); l.ys.push(it.y); }
    else lignes.push({ y: it.y, toks: [it.texte], ys: [it.y] });
  }

  // 2) Regrouper les lignes par personne.
  const seuil = 13 * SP_SCALE, groupes = [];
  for (const l of lignes) {
    const g = groupes[groupes.length - 1];
    const ecart = g ? l.y - g.lignes[g.lignes.length - 1].y : Infinity;
    const patronymeDejaVu = g && g.lignes.some(x => x.toks.some(spEstNomTok));
    const nouveau = !g || ecart >= seuil || (spEstPrenomTok(l.toks[0]) && patronymeDejaVu);
    if (nouveau) groupes.push({ lignes: [l] }); else g.lignes.push(l);
  }

  return groupes.map(g => {
    const toks = g.lignes.flatMap(l => l.toks);
    const ys = g.lignes.flatMap(l => l.ys);
    return {
      nom: toks.join(' ').replace(/\s+/g, ' ').trim(),
      y: ys.reduce((s, y) => s + y, 0) / ys.length
    };
  });
}

function spEstVert(d, i) {
  return Math.abs(d[i] - SP_BAR_RGB[0]) < SP_TOLERANCE
      && Math.abs(d[i + 1] - SP_BAR_RGB[1]) < SP_TOLERANCE
      && Math.abs(d[i + 2] - SP_BAR_RGB[2]) < SP_TOLERANCE;
}

// La barre est centrée ~2 pt au-dessus de la ligne de base du nom et fait
// ~14 pt de haut. On balaie la fenêtre et on retient la ligne la plus verte.
function spDetecterSegments(px, largeur, yLigne, axe) {
  const x0 = Math.max(0, Math.floor(axe.xMin));
  const x1 = Math.min(largeur - 1, Math.ceil(axe.xMax));
  let best = null, bestScore = 0;

  for (let dy = -9 * SP_SCALE; dy <= 5 * SP_SCALE; dy++) {
    const y = Math.round(yLigne + dy);
    if (y < 0 || y >= px.height) continue;
    const runs = []; let deb = null, score = 0;
    for (let x = x0; x <= x1; x++) {
      if (spEstVert(px.data, (y * largeur + x) * 4)) { score++; if (deb === null) deb = x; }
      else if (deb !== null) { runs.push([deb, x - 1]); deb = null; }
    }
    if (deb !== null) runs.push([deb, x1]);
    if (score > bestScore) { bestScore = score; best = runs; }
  }
  if (!best) return [];

  return best.filter(([a, b]) => b - a >= 2 * SP_SCALE)
    .map(([a, b]) => ({ debut: spHeureTexte(axe.versHeure(a)), fin: spHeureTexte(axe.versHeure(b)) }));
}

function spHeureTexte(hd) {
  let mn = Math.round(hd * 60 / SP_ROUND_MIN) * SP_ROUND_MIN;
  mn = Math.max(0, Math.min(24 * 60 - 1, mn));
  return String(Math.floor(mn / 60)).padStart(2, '0') + ':' + String(mn % 60).padStart(2, '0');
}

// Segments -> colonnes planning_equipe.
//   label : la journée complète ("07h00-12h00/13h00-15h00"). C’est LUI que la
//           colonne Horaire du planning équipe affiche (peRenderCreneau) : il
//           porte donc la pause et le total travaillé. Un label à une seule
//           plage = journée affichée comme continue.
//   pause : la coupure la plus longue, pour la colonne dédiée.
function spVersCreneau(segments) {
  if (!segments || !segments.length) {
    return { hdebut: '', hfin: '', pause: null, multi: false, label: '', segments: [] };
  }
  return spMesurer(spFusionner(segments));
}

// Deux barres séparées par moins de SP_GAP_MIN minutes ne forment qu’une plage.
function spFusionner(segments) {
  const s = segments.slice().sort((a, b) => a.debut.localeCompare(b.debut));
  const out = [{ debut: s[0].debut, fin: s[0].fin }];
  for (let i = 1; i < s.length; i++) {
    const p = out[out.length - 1];
    if (spMin(s[i].debut) - spMin(p.fin) < SP_GAP_MIN) {
      if (spMin(s[i].fin) > spMin(p.fin)) p.fin = s[i].fin;
    } else {
      out.push({ debut: s[i].debut, fin: s[i].fin });
    }
  }
  return out;
}

function spLabel(s) {
  return s.map(x => x.debut.replace(':', 'h') + '-' + x.fin.replace(':', 'h')).join('/');
}

function spMesurer(s) {
  const hdebut = s[0].debut, hfin = s[s.length - 1].fin, label = spLabel(s);
  if (s.length === 1) {
    return { hdebut, hfin, pause: null, multi: false, label, segments: s };
  }
  let iMax = 0, dMax = -1;
  for (let i = 0; i < s.length - 1; i++) {
    const d = spMin(s[i + 1].debut) - spMin(s[i].fin);
    if (d > dMax) { dMax = d; iMax = i; }
  }
  return { hdebut, hfin, pause: s[iMax].fin + '-' + s[iMax + 1].debut,
           multi: s.length > 2, label, segments: s };
}
function spMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

/* ═══ HORAIRES DES ENFANTS (barres du planning PDF) ══════════════════════════
   Le PDF Gertrude trace, pour chaque enfant, une barre d'arrivée → départ dans
   EXACTEMENT le même vert que celles des salariés. La couche texte ne contient
   que les noms : l'amplitude horaire ne s'obtient qu'en lisant les pixels, avec
   la même mécanique que spParsePage (axe des heures + détection de segments).

   Distinguer les en-têtes de section du récapitulatif final est essentiel :
   « Enfants », « Salariés » et « Totaux » sont collés à la marge (x ≈ 35 pt)
   alors que les lignes du bloc Totaux sont indentées (x ≈ 50 pt). Sans ce
   critère, les lignes de totaux — qui portent elles aussi des barres vertes —
   seraient lues comme des enfants. */
const EP_X_SECTION = 42 * SP_SCALE;

function epTrouverBandeEnfants(items, hauteurPage) {
  const sections = items.filter(it => it.x < EP_X_SECTION);
  const enf = sections.filter(it => spEstEnfants(it.texte)).sort((a, b) => a.y - b.y)[0];
  if (!enf) throw new Error('section « Enfants » introuvable');
  const fin = sections.filter(it => (spEstSalaries(it.texte) || spEstTotaux(it.texte)) && it.y > enf.y)
    .sort((a, b) => a.y - b.y)[0];
  return { haut: enf.y + 6 * SP_SCALE, bas: (fin ? fin.y : hauteurPage) - 6 * SP_SCALE };
}

async function epParsePage(page) {
  const viewport = page.getViewport({ scale: SP_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const tc = await page.getTextContent();
  const items = tc.items.filter(it => (it.str || '').trim()).map(it => {
    const t = pdfjsLib.Util.transform(viewport.transform, it.transform);
    return { texte: it.str.trim(), x: t[4], y: t[5], w: it.width * SP_SCALE };
  });

  const dateISO = spLireDate(items.map(i => i.texte).join(' '));
  const axe = spCalibrerAxe(items);
  const bande = epTrouverBandeEnfants(items, canvas.height);

  const enfants = [];
  for (const ligne of spGrouperLignes(items, bande)) {
    if (spEstTotaux(ligne.nom) || spEstEnfants(ligne.nom) || spEstSalaries(ligne.nom)) continue;
    const segments = spDetecterSegments(px, canvas.width, ligne.y, axe);
    if (!segments.length) continue;   // listé sans barre : rien à mesurer
    enfants.push({ nomPdf: ipCleanName(ligne.nom), creneau: spVersCreneau(segments) });
  }
  canvas.width = canvas.height = 0;
  return { dateISO, enfants };
}

/* Renvoie { parDate: { '2026-09-07': { 'alize chassard': creneau, … } }, warnings }
   La lecture des horaires ne doit JAMAIS faire échouer l'import des présences :
   toute page illisible est signalée puis ignorée. */
async function epParsePdf(files) {
  const liste = Array.isArray(files) ? files : [files];
  const parDate = {}, warnings = [];
  for (const fichier of liste) {
    let pdf;
    try { pdf = await pdfjsLib.getDocument({ data: await fichier.arrayBuffer() }).promise; }
    catch (e) { warnings.push(fichier.name + ' : horaires enfants illisibles.'); continue; }
    for (let p = 1; p <= pdf.numPages; p++) {
      try {
        const r = await epParsePage(await pdf.getPage(p));
        if (!parDate[r.dateISO]) parDate[r.dateISO] = {};
        r.enfants.forEach(e => { parDate[r.dateISO][ipNormName(e.nomPdf)] = e.creneau; });
      } catch (e) {
        warnings.push(fichier.name + ' — page ' + p + ' : horaires enfants non lus (' + e.message + ')');
      }
    }
  }
  return { parDate, warnings };
}

// ── Correspondance des prénoms ─────────────────────────────────────────
// planning_equipe stocke un PRÉNOM SEUL ("Miline"), le PDF donne l'identité
// complète ("France miline STRAZEL"). Prendre le premier mot ne suffit pas :
// on cherche d'abord un prénom déjà connu parmi TOUS les mots du nom.

function spNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z-]/g, '').trim();
}

// ── Alias des noms du PDF ────────────────────────────────────────────────
// Correspondance entre le nom tel qu'il est écrit dans le PDF des salariées et le
// prénom utilisé dans planning_equipe. Chaque correction est un travail manuel :
// elle est désormais partagée (table planning_alias) au lieu d'être réapprise sur
// chaque appareil. Le localStorage reste le miroir hors ligne.
const SP_ALIAS_LS = 'salPdfAlias_';
let _spAlias = {};   // cache mémoire par crèche, pour garder spLoadAlias synchrone

function spAliasKey(crecheId) { return SP_ALIAS_LS + crecheId; }
function spLoadAlias(crecheId) {
  if (_spAlias[crecheId]) return _spAlias[crecheId];
  let m = {};
  try { m = JSON.parse(localStorage.getItem(spAliasKey(crecheId))) || {}; } catch (e) { m = {}; }
  _spAlias[crecheId] = m;
  return m;
}
function spSaveAlias(crecheId, map) {
  _spAlias[crecheId] = map;
  try { localStorage.setItem(spAliasKey(crecheId), JSON.stringify(map)); } catch (e) {}
  spAliasPush(crecheId, map);
}

async function spAliasPush(crecheId, map) {
  try {
    const { error } = await sb.from('planning_alias')
      .upsert({ creche_id: crecheId, alias: map, updated_at: new Date().toISOString() },
              { onConflict: 'creche_id' });
    if (error) throw error;
  } catch (e) { console.warn('[Alias PDF] écriture :', (e && e.message) || e); }
}

// Relu avant chaque import. La base l'emporte : toute correction faite ici y part
// aussitôt, elle est donc toujours au moins aussi récente que le miroir local.
async function spAliasPull(crecheId) {
  try {
    const { data, error } = await sb.from('planning_alias').select('alias').eq('creche_id', crecheId).maybeSingle();
    if (error) throw error;
    const fusion = Object.assign({}, spLoadAlias(crecheId), (data && data.alias) || {});
    spSaveAlias(crecheId, fusion);
    return true;
  } catch (e) { console.warn('[Alias PDF] lecture :', (e && e.message) || e); return false; }
}

async function spPrenomsConnus(crecheId) {
  const { data, error } = await sb.from('planning_equipe').select('prenom').eq('creche_id', crecheId);
  if (error) { console.error('[ImportSalPdf] prenoms', error.message); return []; }
  return [...new Set((data || []).map(r => r.prenom).filter(Boolean))];
}

function spProposerPrenom(nomPdf, connus, alias) {
  const cle = spNorm(nomPdf.replace(/\s+/g, ''));
  if (alias[cle]) return { prenom: alias[cle], source: 'alias' };

  const mots = nomPdf.split(/\s+/).filter(Boolean);
  for (const mot of mots) {
    const hit = connus.find(c => spNorm(c) === spNorm(mot));
    if (hit) return { prenom: hit, source: 'connu' };
  }
  // Aucun prénom connu : on retient le premier mot, à confirmer manuellement.
  return { prenom: mots[0] || nomPdf, source: 'nouveau' };
}

// ── UI ─────────────────────────────────────────────────────────────────

function spInjecterModale() {
  if (document.getElementById('modal-import-sal-wrap')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div class="overlay" id="modal-import-sal-wrap">
  <div class="modal" style="max-width:680px;max-height:86vh;display:flex;flex-direction:column">
    <h3><i class="ti ti-file-import"></i> Importer le planning des salariés (PDF)</h3>

    <div id="sp-step-config">
      <div class="info-box" style="margin-bottom:14px"><i class="ti ti-info-circle" style="font-size:15px"></i>
        Déposez le ou les <strong>plannings de présences PDF</strong> (ceux utilisés pour les enfants). Plusieurs semaines peuvent être importées en une fois, à condition qu\u2019elles concernent la même crèche.
        Les horaires des salariés y sont lus directement, pauses comprises.
        Une journée coupée devient <strong>07h00-12h00/13h00-15h00</strong> ; une journée continue n'a qu\u2019une plage.
      </div>
      <div class="fg"><label class="flabel">Crèche concernée</label>
        <select class="finput" id="sp-creche"><option value="">— Sélectionner —</option></select>
      </div>
      <div class="fg"><label class="flabel">Référente titulaire</label>
        <select class="finput" id="sp-referent"><option value="">— Sélectionner —</option></select>
        <div style="font-size:11.5px;color:var(--ink2);margin-top:5px">Ses journées seront aussi écrites dans son planning individuel, comme le fait l\u2019import Excel.</div>
      </div>
      <div class="fg">
        <input type="file" id="sp-file" accept="application/pdf" multiple style="display:none" onchange="spHandleFile(event)"/>
        <button class="btn-cancel" style="width:100%" onclick="spTriggerFile()"><i class="ti ti-upload"></i> Choisir un ou plusieurs PDF</button>
        <div id="sp-filename" style="font-size:12px;color:var(--ink2);margin-top:6px"></div>
      </div>
    </div>

    <div id="sp-step-preview" style="display:none;overflow-y:auto;flex:1;font-size:13px"></div>
    <div id="sp-result" style="display:none;margin-top:10px"></div>

    <div class="mactions">
      <button class="btn-cancel" onclick="closeModal('modal-import-sal-wrap')">Fermer</button>
      <button class="btn-primary" id="sp-btn-confirm" style="display:none" onclick="spConfirmImport()"><i class="ti ti-check"></i> Importer ces horaires</button>
    </div>
  </div>
</div>`);
}

function spOpenImportModal() {
  spInjecterModale();
  const sel = document.getElementById('sp-creche');
  sel.innerHTML = '<option value="">— Sélectionner —</option>' +
    (cacheCreches || []).map(c => '<option value="' + c.id + '">' + escHtml(c.name) + '</option>').join('');
  if (!isDirection && currentProfile?.creche_id) sel.value = currentProfile.creche_id;
  sel.onchange = () => spRemplirReferentes(sel.value);
  spRemplirReferentes(sel.value);

  document.getElementById('sp-filename').textContent = '';
  document.getElementById('sp-file').value = '';
  document.getElementById('sp-step-config').style.display = '';
  document.getElementById('sp-step-preview').style.display = 'none';
  document.getElementById('sp-result').style.display = 'none';
  document.getElementById('sp-btn-confirm').style.display = 'none';
  _spData = null;
  document.getElementById('modal-import-sal-wrap').classList.add('open');
}

// Les référentes rattachées à la crèche choisie.
function spRemplirReferentes(crecheId) {
  const sel = document.getElementById('sp-referent');
  if (!sel) return;
  const refs = (cacheReferents || []).filter(r => r.role === 'referent' && (!crecheId || r.creche_id === crecheId));
  sel.innerHTML = '<option value="">— Sélectionner —</option>'
    + refs.map(r => '<option value="' + r.id + '" data-name="' + escHtml(r.name || '') + '">'
      + escHtml(r.name || '') + '</option>').join('');
}

// Retrouve, parmi les prénoms rapprochés, celui de la référente titulaire.
function spPrenomReferente(nomReferente, mapping) {
  const mots = String(nomReferente || '').split(/\s+/).map(spNorm).filter(Boolean);
  for (const k of Object.keys(mapping)) {
    if (mots.includes(spNorm(mapping[k].prenom))) return mapping[k].prenom;
  }
  return null;
}

function spTriggerFile() {
  if (!document.getElementById('sp-creche').value) { alert('Choisissez d\u2019abord la crèche.'); return; }
  if (!document.getElementById('sp-referent').value) { alert('Choisissez la référente titulaire.'); return; }
  document.getElementById('sp-file').click();
}

async function spHandleFile(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length) return;
  if (typeof pdfjsLib === 'undefined') { alert('Bibliothèque PDF non chargée.'); return; }

  const crecheId = document.getElementById('sp-creche').value;
  document.getElementById('sp-filename').textContent = files.map(f => '📄 ' + f.name).join('  ·  ');
  showBanner(files.length > 1 ? 'Lecture de ' + files.length + ' PDF en cours…' : 'Lecture du PDF en cours…');

  let parsed;
  try { parsed = await spParsePdf(files); }
  catch (e) { console.error('[ImportSalPdf]', e); showBanner('Impossible de lire ces PDF.', 'error'); return; }

  const jours = parsed.jours.filter(j => j.salaries.length);
  if (!jours.length) { showBanner('Aucun salarié détecté dans ce PDF.', 'error'); return; }

  const connus = await spPrenomsConnus(crecheId);
  await spAliasPull(crecheId);   // corrections déjà faites depuis un autre appareil
  const alias = spLoadAlias(crecheId);
  const noms = [...new Set(jours.flatMap(j => j.salaries.map(s => s.nomPdf)))];
  const mapping = {};
  noms.forEach(n => { mapping[n] = spProposerPrenom(n, connus, alias); });

  // Cohérence crèche : le titre du PDF doit mentionner la crèche choisie
  const creche = (cacheCreches || []).find(c => c.id === crecheId);
  const cn = spNorm(creche?.name);
  // every() et non some() : avec plusieurs fichiers, un seul PDF d’une autre
  // crèche dans le lot doit alerter, pas passer inaperçu.
  const crecheMatch = !parsed.titles.length || !cn || parsed.titles.every(t => spNorm(t).includes(cn));

  const selRef = document.getElementById('sp-referent');
  const referentId = selRef.value;
  const referentNom = selRef.selectedOptions[0]?.dataset?.name || '';

  _spData = { crecheId, jours, mapping, connus, warnings: parsed.warnings, titles: parsed.titles,
              crecheMatch, referentId, referentNom,
              referentPrenom: spPrenomReferente(referentNom, mapping) };
  spRenderPreview();
}

function spRenderPreview() {
  if (!_spData) return;
  const box = document.getElementById('sp-step-preview');
  const creche = (cacheCreches || []).find(c => c.id === _spData.crecheId);
  const noms = Object.keys(_spData.mapping).sort();

  let html = '';

  if (!_spData.crecheMatch) {
    html += '<div style="background:#fdecea;border-left:4px solid var(--red);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#8b1a1a">'
      + '<strong>⚠ La crèche ne correspond pas.</strong><br>Les PDF concernent <strong>'
      + escHtml(_spData.titles.join(' / ')) + '</strong> alors que vous avez choisi <strong>'
      + escHtml(creche?.name || '—') + '</strong>.</div>';
  }

  html += '<div style="background:#EEEDF8;border-left:4px solid var(--koala);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--koala)">'
    + 'Vérifiez le <strong>prénom en base</strong> de chaque salarié. Il doit être écrit exactement comme dans le planning équipe, '
    + 'sinon une seconde ligne sera créée en doublon. Vos corrections sont mémorisées pour les prochains imports.</div>';

  if (_spData.referentId && !_spData.referentPrenom) {
    html += '<div style="background:var(--amber-lt);border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:var(--orange)">'
      + '<strong>⚠ Référente non retrouvée.</strong><br>Aucun prénom ne correspond à '
      + escHtml(_spData.referentNom) + '. Son planning individuel ne sera pas rempli. '
      + 'Corrigez son prénom ci-dessous pour rétablir le lien.</div>';
  }
  html += '<div style="font-weight:700;margin-bottom:8px">Correspondance des prénoms</div>';
  html += _spData.connus.length
    ? '<datalist id="sp-dl">' + _spData.connus.map(c => '<option value="' + escHtml(c) + '"></option>').join('') + '</datalist>'
    : '';
  html += noms.map(n => {
    const m = _spData.mapping[n];
    const badge = m.source === 'nouveau'
      ? '<span style="font-size:10.5px;background:var(--amber-lt);color:var(--orange);padding:2px 7px;border-radius:20px;font-weight:700">à vérifier</span>'
      : '<span style="font-size:10.5px;background:var(--koala-light);color:var(--koala);padding:2px 7px;border-radius:20px;font-weight:700">reconnu</span>';
    const bRef = (_spData.referentPrenom && m.prenom === _spData.referentPrenom)
      ? ' <span style="font-size:10px;background:var(--koala-light);color:var(--koala);padding:2px 7px;border-radius:8px">référente — planning individuel + équipe</span>'
      : ' <span style="font-size:10px;background:#f0f0f5;color:#888;padding:2px 7px;border-radius:8px">planning équipe</span>';
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">'
      + '<div style="flex:1;min-width:0"><div style="font-size:12.5px">' + escHtml(n) + '</div>' + badge + bRef + '</div>'
      + '<i class="ti ti-arrow-right" style="color:var(--muted)"></i>'
      + '<input class="finput" list="sp-dl" style="max-width:170px;font-size:12.5px" value="' + escHtml(m.prenom) + '" '
      + 'onchange="spSetPrenom(' + JSON.stringify(n).replace(/"/g, '&quot;') + ',this.value)"/>'
      + '</div>';
  }).join('');

  const aVerifier = _spData.jours.reduce((n, j) =>
    n + j.salaries.filter(s => spVersCreneau(s.segments).multi).length, 0);
  const semaines = new Set(_spData.jours.map(j => mondayOfISO(j.dateISO))).size;
  html += '<div style="font-weight:700;margin:16px 0 8px">Horaires détectés \u2014 '
    + _spData.jours.length + ' journée(s) sur ' + semaines + ' semaine(s)</div>';
  html += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">'
    + 'Horaires lus tels quels dans le PDF, au quart d\u2019heure, pauses comprises.'
    + (aVerifier
      ? ' <strong style="color:var(--orange)">' + aVerifier + ' journée(s) à plus de deux plages</strong>, à vérifier.'
      : '') + '</div>';
  html += _spData.jours.map(j => {
    const d = new Date(j.dateISO + 'T12:00:00');
    const jourIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const hors = jourIdx > 4
      ? ' <span style="color:var(--orange);font-size:11px">— week-end, ignoré</span>' : '';
    const lignes = j.salaries.map(s => {
      const cr = spVersCreneau(s.segments);
      const pause = cr.pause
        ? '<span style="color:var(--muted)"> · pause ' + cr.pause + '</span>'
        : '<span style="color:var(--muted)"> · journée continue</span>';
      const warn = cr.multi ? ' <span style="color:var(--orange)">⚠ &gt;2 plages</span>' : '';
      return '<div style="padding:4px 12px;font-size:11.5px;display:flex;justify-content:space-between;gap:10px">'
        + '<span>' + escHtml(_spData.mapping[s.nomPdf].prenom) + '</span>'
        + '<span>' + cr.hdebut + '–' + cr.hfin + pause + warn + '</span></div>';
    }).join('');
    return '<details style="border-bottom:1px solid var(--border)"><summary style="padding:8px 12px;cursor:pointer;font-size:12px;font-weight:700;color:var(--koala)">'
      + spDateFr(j.dateISO) + ' — ' + j.salaries.length + ' salarié(s)' + hors + '</summary>' + lignes + '</details>';
  }).join('');

  if (_spData.warnings.length) {
    html += '<div style="font-size:11px;color:var(--orange);background:var(--amber-lt);padding:8px 10px;border-radius:8px;margin-top:12px">⚠ '
      + _spData.warnings.map(escHtml).join('<br>') + '</div>';
  }

  box.innerHTML = html;
  document.getElementById('sp-step-config').style.display = 'none';
  box.style.display = '';
  document.getElementById('sp-btn-confirm').style.display = '';
}

function spSetPrenom(nomPdf, valeur) {
  if (!_spData || !valeur.trim()) return;
  _spData.mapping[nomPdf] = { prenom: valeur.trim(), source: 'alias' };
  const alias = spLoadAlias(_spData.crecheId);
  alias[spNorm(nomPdf.replace(/\s+/g, ''))] = valeur.trim();
  spSaveAlias(_spData.crecheId, alias);
  _spData.referentPrenom = spPrenomReferente(_spData.referentNom, _spData.mapping);
  spRenderPreview();
}

function spDateFr(iso) {
  return new Date(iso + 'T12:00:00')
    .toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

// ── Écriture ───────────────────────────────────────────────────────────

async function spConfirmImport() {
  if (!_spData) return;
  const btn = document.getElementById('sp-btn-confirm');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Import en cours…';

  const batchId = (crypto?.randomUUID) ? crypto.randomUUID()
    : ('batch-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const creche = (cacheCreches || []).find(c => c.id === _spData.crecheId);
  let saved = 0, failed = 0, skipped = 0, savedRef = 0;

  for (const j of _spData.jours) {
    const d = new Date(j.dateISO + 'T00:00:00');
    const jourIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
    if (jourIdx > 4) { skipped += j.salaries.length; continue; }   // planning_equipe = lundi→vendredi
    const semaine = mondayOfISO(j.dateISO);

    for (const s of j.salaries) {
      const cr = spVersCreneau(s.segments);
      const prenom = _spData.mapping[s.nomPdf].prenom;
      const { error } = await sb.from('planning_equipe').upsert({
        creche_id: _spData.crecheId,
        prenom,
        semaine, jour: jourIdx, type: 'presence',
        label: creche?.name || '', lieu: creche?.name || '',
        hdebut: cr.hdebut, hfin: cr.hfin, pause: cr.pause,
        source_cell: 'PDF présences — ' + s.nomPdf,
        creneau_label: cr.label,
        import_batch_id: batchId
      }, { onConflict: 'creche_id,prenom,semaine,jour' });
      if (error) { console.error('[ImportSalPdf]', error.message); failed++; } else { saved++; }

      // Si c'est la référente titulaire, alimenter aussi son planning individuel.
      // On purge d'abord la journée : l'upsert sur slot NULL ne déduplique pas en SQL
      // (NULL n'est jamais égal à NULL pour une contrainte unique).
      if (_spData.referentId && _spData.referentPrenom && prenom === _spData.referentPrenom) {
        await sb.from('planning').delete().eq('referent_id', _spData.referentId)
          .eq('semaine', semaine).eq('jour', jourIdx).is('slot', null);
        const ok = await planningSave(_spData.referentId, semaine, {
          day: jourIdx, slot: null, type: 'presence',
          label: creche?.name || '', lieu: creche?.name || '',
          hdebut: cr.hdebut, hfin: cr.hfin, pause: cr.pause,
          detachType: '', detachDesc: '', multi: true, batchId
        });
        if (ok) savedRef++; else failed++;
      }
    }
  }

  // referentId renseigné pour que « Réinitialiser ce dernier import » purge aussi la table planning
  localStorage.setItem('lastImportBatch_' + _spData.crecheId,
    JSON.stringify({ batchId, referentId: _spData.referentId || null, date: new Date().toISOString() }));

  btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Importer ces horaires';
  const res = document.getElementById('sp-result');
  res.style.display = '';
  res.innerHTML = failed
    ? '<div style="color:var(--orange);font-size:13px">⚠ Import partiel : ' + saved + ' jour(s) enregistré(s), ' + failed + ' échec(s). Voir la console.</div>'
    : '<div style="color:var(--koala);font-size:13px;font-weight:700">✅ ' + saved + ' jour(s) dans le planning équipe'
      + (savedRef ? ', dont ' + savedRef + ' aussi dans le planning individuel de ' + escHtml(_spData.referentPrenom) : '')
      + (skipped ? ' — ' + skipped + ' ignoré(s) (week-end)' : '') + '.</div>';
  document.getElementById('sp-btn-confirm').style.display = 'none';

  if (typeof peInvalidateAll === 'function') peInvalidateAll(_spData.crecheId);
  if (_spData.referentId && typeof planningInvalidateAll === 'function') planningInvalidateAll(_spData.referentId);
  _spData = null;
  if (typeof renderPlanning === 'function') await renderPlanning();
}

// ── IMPORT UNIFIÉ (présences enfants + planning salariés, même PDF) ─────
// Le bouton « Importer PDF (présences + planning) », présent à la fois dans
// l'onglet Présences et dans l'onglet Planning, ouvre la même modale
// (#modal-import-unifie-wrap, voir le HTML) et fait tourner en parallèle :
//   - ipParsePdf(file)  : lecture texte -> présences des enfants
//   - spParsePdf(files) : lecture image -> horaires des salariés
// sur le(s) même(s) fichier(s), puis écrit les deux résultats en un seul
// clic de confirmation. Remplace les anciens boutons/modales séparés
// « Importer PDF » (Présences) et « Importer salariés (PDF) » (Planning).

let _uniData = null;

function uniDefaultCreche() {
  try { const v = getPresenceCrecheId(); if (v) return v; } catch (e) {}
  if (!isDirection && currentProfile?.creche_id) return currentProfile.creche_id;
  return '';
}

function spRemplirReferentesUni(crecheId) {
  const sel = document.getElementById('uni-referent');
  if (!sel) return;
  const refs = (cacheReferents || []).filter(r => r.role === 'referent' && (!crecheId || r.creche_id === crecheId));
  sel.innerHTML = '<option value="">— Sélectionner —</option>'
    + refs.map(r => '<option value="' + r.id + '" data-name="' + escHtml(r.name || '') + '">'
      + escHtml(r.name || '') + '</option>').join('');
}

function openUnifiedImportModal() {
  const sel = document.getElementById('uni-creche');
  sel.innerHTML = '<option value="">— Sélectionner —</option>' +
    (cacheCreches || []).map(c => '<option value="' + c.id + '">' + escHtml(c.name) + '</option>').join('');
  const defaultCreche = uniDefaultCreche();
  if (defaultCreche) sel.value = defaultCreche;
  sel.onchange = () => spRemplirReferentesUni(sel.value);
  spRemplirReferentesUni(sel.value);

  document.getElementById('uni-filename').textContent = '';
  document.getElementById('uni-file').value = '';
  document.getElementById('uni-step-config').style.display = '';
  document.getElementById('uni-step-preview').style.display = 'none';
  document.getElementById('uni-btn-confirm').style.display = 'none';
  _uniData = null;
  document.getElementById('modal-import-unifie-wrap').classList.add('open');
}

function uniTriggerFile() {
  if (!document.getElementById('uni-creche').value) { alert('Choisissez d’abord la crèche.'); return; }
  if (!document.getElementById('uni-referent').value) { alert('Choisissez la référente titulaire.'); return; }
  document.getElementById('uni-file').click();
}

async function uniHandleFile(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length) return;
  if (typeof pdfjsLib === 'undefined') { alert('Bibliothèque PDF non chargée.'); return; }

  const crecheId = document.getElementById('uni-creche').value;
  document.getElementById('uni-filename').textContent = files.map(f => '📄 ' + f.name).join('  ·  ');
  showBanner(files.length > 1 ? 'Lecture de ' + files.length + ' PDF en cours…' : 'Lecture du PDF en cours…');

  // 1) Présences des enfants (couche texte du PDF)
  let presPages = [];
  _ipDiag = [];
  try { for (const f of files) presPages.push(...await ipParsePdf(f)); presPages = ipDedoublonnerPages(presPages, _ipDiag); }
  catch (e) { console.error('[ImportUnifie] présences', e); showBanner('Impossible de lire les présences dans ce PDF.', 'error'); return; }

  // 2) Horaires des salariés (rendu image du PDF)
  let parsedSal;
  try { parsedSal = await spParsePdf(files); }
  catch (e) { console.error('[ImportUnifie] salariés', e); showBanner('Impossible de lire les horaires salariés dans ce PDF.', 'error'); return; }

  const jours = parsedSal.jours.filter(j => j.salaries.length);
  if (!presPages.length && !jours.length) { showBanner('Aucune présence ni horaire détecté dans ce PDF.', 'error'); return; }

  showBanner('Chargement des enfants…');
  const { data: freshEnf, error: enfErr } = await sb.from('enfants').select('*');
  if (enfErr) { console.error('[ImportUnifie] enfants', enfErr); showBanner('Impossible de charger les enfants.', 'error'); return; }
  const allEnfants = freshEnf || [];
  if (!cacheEnfants.length && allEnfants.length) cacheEnfants.push(...allEnfants);
  const enfCreche = allEnfants.filter(e => e.creche_id === crecheId);
  const byFull = {}, byFirst = {};
  enfCreche.forEach(e => {
    const full = ipNormName((e.prenom || '') + ' ' + (e.nom || '')); byFull[full] = e;
    const f = ipNormName(e.prenom || ''); (byFirst[f] = byFirst[f] || []).push(e);
  });
  const allNamesInPdf = [...new Set(presPages.flatMap(pg => pg.names))];
  const nameMap = {};
  allNamesInPdf.forEach(nm => {
    const norm = ipNormName(nm);
    let e = byFull[norm];
    if (!e) { const parts = norm.split(' '); const cand = byFirst[parts[0]]; if (cand && cand.length === 1) e = cand[0]; }
    if (!e) { e = enfCreche.find(x => { const xn = ipNormName((x.prenom || '') + ' ' + (x.nom || '')); return norm.startsWith(xn) || xn.startsWith(norm); }); }
    nameMap[nm] = e ? { enfant: e, isNew: false } : { enfant: null, isNew: true };
  });
  presPages.forEach(pg => {
    pg.matched = []; pg.toCreate = [];
    pg.names.forEach(nm => { const r = nameMap[nm]; if (r.enfant) pg.matched.push({ name: nm, enfant: r.enfant }); else pg.toCreate.push(nm); });
  });
  const creche = cacheCreches.find(c => c.id === crecheId);
  const presTitles = [...new Set(presPages.map(pg => pg.title || '').filter(Boolean))];
  const crecheNorm = ipNormName(creche ? creche.name : '');
  const presCrecheMatch = (!presTitles.length || !crecheNorm) ? true : presTitles.every(t => ipNormName(t).indexOf(crecheNorm) >= 0);

  const connus = await spPrenomsConnus(crecheId);
  await spAliasPull(crecheId);   // corrections déjà faites depuis un autre appareil
  const alias = spLoadAlias(crecheId);
  const noms = [...new Set(jours.flatMap(j => j.salaries.map(s => s.nomPdf)))];
  const mapping = {};
  noms.forEach(n => { mapping[n] = spProposerPrenom(n, connus, alias); });
  const cn = spNorm(creche?.name);
  const salCrecheMatch = !parsedSal.titles.length || !cn || parsedSal.titles.every(t => spNorm(t).includes(cn));

  const selRef = document.getElementById('uni-referent');
  const referentId = selRef.value;
  const referentNom = selRef.selectedOptions[0]?.dataset?.name || '';

  // Horaires des enfants (barres du PDF) — non bloquant.
  showBanner('Lecture des horaires enfants…');
  let epWarn = [];
  try {
    const eh = await epParsePdf(files);
    epWarn = eh.warnings || [];
    presPages.forEach(pg => {
      const parNom = (eh.parDate || {})[pg.date] || {};
      pg.creneaux = {};
      pg.names.forEach(nm => { const cr = parNom[ipNormName(nm)]; if (cr) pg.creneaux[nm] = cr; });
    });
  } catch (e) { console.warn('[ImportUnifie] horaires enfants', e); presPages.forEach(pg => { pg.creneaux = {}; }); }

  const contratsParEnfant = {};
  try {
    const ids = enfCreche.map(e => e.id);
    if (ids.length) {
      const { data: cts } = await sb.from('enfants_contrats').select('*').in('enfant_id', ids);
      (cts || []).forEach(c => {
        const k = String(c.enfant_id);
        if (!contratsParEnfant[k] || (c.date_debut || '') > (contratsParEnfant[k].date_debut || '')) contratsParEnfant[k] = c;
      });
    }
  } catch (e) { console.warn('[ImportUnifie] contrats', e); }
  _ipContratCreer = true; _ipContratMaj = false;

  _uniData = {
    crecheId, referentId, referentNom,
    pres: { pages: presPages, nameMap, crecheEnfantIds: enfCreche.map(e => e.id), titles: presTitles, crecheMatch: presCrecheMatch, forceCreche: false, replace: true,
            contratsParEnfant, propositions: ipProposerContrats(presPages), epWarn, diag: _ipDiag.slice() },
    sal: { jours, mapping, connus, warnings: parsedSal.warnings, titles: parsedSal.titles, crecheMatch: salCrecheMatch, replace: true, referentPrenom: spPrenomReferente(referentNom, mapping) }
  };
  uniRenderPreview();
}

function uniRenderPreview() {
  if (!_uniData) return;
  const box = document.getElementById('uni-step-preview');
  const creche = cacheCreches.find(c => c.id === _uniData.crecheId);
  const pres = _uniData.pres, sal = _uniData.sal;
  let html = '';

  // ---- Bloc Présences enfants ----
  const toCreateUnique = [...new Set(pres.pages.flatMap(pg => pg.toCreate))];
  let totalPres = 0; const totalNew = toCreateUnique.length;
  html += '<div style="font-weight:800;color:var(--koala);margin-bottom:6px"><i class="ti ti-users"></i> Présences des enfants</div>';
  if (!pres.pages.length) {
    html += '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">Aucune présence enfant détectée dans ce PDF.</div>';
    html += ipHtmlDiag(pres.diag);
  } else {
    html += ipHtmlDiag(pres.diag);
    if (!pres.crecheMatch) {
      html += '<div style="background:#fdecea;border-left:4px solid var(--red);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#8b1a1a">';
      html += '<strong>⚠ La crèche ne correspond pas.</strong><br>Le PDF concerne <strong>' + escHtml(pres.titles.join(' / ')) + '</strong> alors que vous avez choisi <strong>' + escHtml(creche ? creche.name : '—') + '</strong>.<br>';
      html += '<label style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer"><input type="checkbox" id="uni-force-creche" onchange="_uniData.pres.forceCreche=this.checked;uniRenderPreview()"' + (pres.forceCreche ? ' checked' : '') + '/> Importer malgré tout</label></div>';
    }
    html += '<label style="display:flex;align-items:flex-start;gap:8px;background:#EEEDF8;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;color:var(--koala);cursor:pointer"><input type="checkbox" id="uni-replace" onchange="_uniData.pres.replace=this.checked" ' + (pres.replace ? 'checked' : '') + ' style="margin-top:2px"/><span><strong>Remplacer les présences existantes pour ces dates</strong><br><span style="font-weight:400;font-size:11.5px">Le PDF fait foi : les présences déjà enregistrées pour cette crèche aux dates du planning seront effacées avant l’import. Décochez pour cumuler avec l’existant.</span></span></label>';
    if (totalNew) {
      html += '<div style="background:#fff8e1;border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px">';
      html += '<strong>' + totalNew + ' nouvel enfant' + (totalNew > 1 ? 's' : '') + ' seront créés</strong> dans <strong>' + (creche ? creche.name : 'la crèche') + '</strong><br>';
      html += '<span style="color:var(--muted);font-size:11.5px">' + toCreateUnique.map(escHtml).join(', ') + '</span></div>';
    }
    html += ipHtmlContrats(pres.propositions, pres.nameMap, pres.contratsParEnfant, pres.epWarn, pres.pages.length);
    pres.pages.forEach(pg => {
      const nb = pg.matched.length + pg.toCreate.length; totalPres += nb;
      html += '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px">';
      html += '<div style="font-weight:700;color:var(--koala);text-transform:capitalize;margin-bottom:6px">' + ipFmtDate(pg.date) + ' <span style="font-weight:400;color:var(--muted);font-size:11px">' + nb + ' enfant' + (nb > 1 ? 's' : '') + '</span></div>';
      const tags = [
        ...pg.matched.map(mt => '<span style="background:#e8f5e9;color:#2e7d32;border-radius:6px;padding:2px 8px;font-size:11.5px">✓ ' + escHtml(mt.enfant.prenom + ' ' + mt.enfant.nom) + '</span>'),
        ...pg.toCreate.map(nm => '<span style="background:#fff3e0;color:#e65100;border-radius:6px;padding:2px 8px;font-size:11.5px">+ ' + escHtml(nm) + '</span>')
      ];
      html += '<div style="display:flex;flex-wrap:wrap;gap:5px">' + tags.join('') + '</div></div>';
    });
  }

  html += '<div style="height:1px;background:var(--border);margin:16px 0"></div>';

  // ---- Bloc Planning salariés ----
  html += '<div style="font-weight:800;color:var(--koala);margin-bottom:6px"><i class="ti ti-calendar-check"></i> Planning des salariés</div>';
  if (!sal.jours.length) {
    html += '<div style="font-size:12px;color:var(--muted)">Aucun horaire salarié détecté dans ce PDF.</div>';
  } else {
    if (!sal.crecheMatch) {
      html += '<div style="background:#fdecea;border-left:4px solid var(--red);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#8b1a1a">'
        + '<strong>⚠ La crèche ne correspond pas.</strong><br>Les PDF concernent <strong>' + escHtml(sal.titles.join(' / ')) + '</strong> alors que vous avez choisi <strong>' + escHtml(creche?.name || '—') + '</strong>.</div>';
    }
    html += '<div style="background:#EEEDF8;border-left:4px solid var(--koala);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--koala)">'
      + 'Vérifiez le <strong>prénom en base</strong> de chaque salarié. Il doit être écrit exactement comme dans le planning équipe, sinon une seconde ligne sera créée en doublon. Vos corrections sont mémorisées pour les prochains imports.</div>';
    const semainesTouchees = [...new Set(sal.jours.filter(j => { const d = new Date(j.dateISO + 'T12:00:00'); const i = d.getDay() === 0 ? 6 : d.getDay() - 1; return i <= 4; }).map(j => mondayOfISO(j.dateISO)))];
    html += '<label style="display:flex;align-items:flex-start;gap:8px;background:#EEEDF8;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;color:var(--koala);cursor:pointer"><input type="checkbox" id="uni-sal-replace" onchange="_uniData.sal.replace=this.checked" ' + (sal.replace ? 'checked' : '') + ' style="margin-top:2px"/><span><strong>Repartir à zéro sur ' + (semainesTouchees.length > 1 ? 'ces ' + semainesTouchees.length + ' semaines' : 'cette semaine') + '</strong><br><span style="font-weight:400;font-size:11.5px">Le planning équipe de cette crèche est effacé pour ' + (semainesTouchees.length > 1 ? 'ces semaines' : 'cette semaine') + ' avant l’import : le PDF fait foi. Cela supprime aussi les anciennes lignes d’un import précédent et les personnes ajoutées à la main. Décochez pour ne mettre à jour que les salariés lus dans le PDF.</span></span></label>';
    if (_uniData.referentId && !sal.referentPrenom) {
      html += '<div style="background:var(--amber-lt);border-left:4px solid var(--orange);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:var(--orange)">'
        + '<strong>⚠ Référente non retrouvée.</strong><br>Aucun prénom ne correspond à ' + escHtml(_uniData.referentNom) + '. Son planning individuel ne sera pas rempli. Corrigez son prénom ci-dessous pour rétablir le lien.</div>';
    }
    const noms = Object.keys(sal.mapping).sort();
    html += '<div style="font-weight:700;margin-bottom:8px">Correspondance des prénoms</div>';
    html += sal.connus.length ? '<datalist id="uni-dl">' + sal.connus.map(c => '<option value="' + escHtml(c) + '"></option>').join('') + '</datalist>' : '';
    html += noms.map(n => {
      const m = sal.mapping[n];
      const badge = m.source === 'nouveau'
        ? '<span style="font-size:10.5px;background:var(--amber-lt);color:var(--orange);padding:2px 7px;border-radius:20px;font-weight:700">à vérifier</span>'
        : '<span style="font-size:10.5px;background:var(--koala-light);color:var(--koala);padding:2px 7px;border-radius:20px;font-weight:700">reconnu</span>';
      const bRef = (sal.referentPrenom && m.prenom === sal.referentPrenom)
        ? ' <span style="font-size:10px;background:var(--koala-light);color:var(--koala);padding:2px 7px;border-radius:8px">référente — planning individuel + équipe</span>'
        : ' <span style="font-size:10px;background:#f0f0f5;color:#888;padding:2px 7px;border-radius:8px">planning équipe</span>';
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">'
        + '<div style="flex:1;min-width:0"><div style="font-size:12.5px">' + escHtml(n) + '</div>' + badge + bRef + '</div>'
        + '<i class="ti ti-arrow-right" style="color:var(--muted)"></i>'
        + '<input class="finput" list="uni-dl" style="max-width:170px;font-size:12.5px" value="' + escHtml(m.prenom) + '" '
        + 'onchange="uniSetPrenom(' + JSON.stringify(n).replace(/"/g, '&quot;') + ',this.value)"/>'
        + '</div>';
    }).join('');

    const aVerifier = sal.jours.reduce((n, j) => n + j.salaries.filter(s => spVersCreneau(s.segments).multi).length, 0);
    const semaines = new Set(sal.jours.map(j => mondayOfISO(j.dateISO))).size;
    html += '<div style="font-weight:700;margin:16px 0 8px">Horaires détectés — ' + sal.jours.length + ' journée(s) sur ' + semaines + ' semaine(s)</div>';
    html += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Horaires lus tels quels dans le PDF, au quart d’heure, pauses comprises.'
      + (aVerifier ? ' <strong style="color:var(--orange)">' + aVerifier + ' journée(s) à plus de deux plages</strong>, à vérifier.' : '') + '</div>';
    html += sal.jours.map(j => {
      const d = new Date(j.dateISO + 'T12:00:00');
      const jourIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const hors = jourIdx > 4 ? ' <span style="color:var(--orange);font-size:11px">— week-end, ignoré</span>' : '';
      const lignes = j.salaries.map(s => {
        const cr = spVersCreneau(s.segments);
        const pause = cr.pause ? '<span style="color:var(--muted)"> · pause ' + cr.pause + '</span>' : '<span style="color:var(--muted)"> · journée continue</span>';
        const warn = cr.multi ? ' <span style="color:var(--orange)">⚠ &gt;2 plages</span>' : '';
        return '<div style="padding:4px 12px;font-size:11.5px;display:flex;justify-content:space-between;gap:10px">'
          + '<span>' + escHtml(sal.mapping[s.nomPdf].prenom) + '</span>'
          + '<span>' + cr.hdebut + '–' + cr.hfin + pause + warn + '</span></div>';
      }).join('');
      return '<details style="border-bottom:1px solid var(--border)"><summary style="padding:8px 12px;cursor:pointer;font-size:12px;font-weight:700;color:var(--koala)">'
        + spDateFr(j.dateISO) + ' — ' + j.salaries.length + ' salarié(s)' + hors + '</summary>' + lignes + '</details>';
    }).join('');
    if (sal.warnings.length) {
      html += '<div style="font-size:11px;color:var(--orange);background:var(--amber-lt);padding:8px 10px;border-radius:8px;margin-top:12px">⚠ ' + sal.warnings.map(escHtml).join('<br>') + '</div>';
    }
  }

  box.innerHTML = html;
  document.getElementById('uni-step-config').style.display = 'none';
  box.style.display = '';
  const btn = document.getElementById('uni-btn-confirm');
  const blocked = (pres.pages.length && !pres.crecheMatch && !pres.forceCreche);
  btn.disabled = blocked;
  const parts = [];
  if (totalPres || totalNew) parts.push(totalPres + ' présence' + (totalPres > 1 ? 's' : '') + (totalNew ? ' + ' + totalNew + ' création' + (totalNew > 1 ? 's' : '') : ''));
  if (sal.jours.length) parts.push(sal.jours.length + ' journée(s) de planning');
  btn.innerHTML = '<i class="ti ti-check"></i> Confirmer' + (parts.length ? ' — ' + parts.join(' · ') : '');
  btn.style.display = '';
}

function uniSetPrenom(nomPdf, valeur) {
  if (!_uniData || !valeur.trim()) return;
  _uniData.sal.mapping[nomPdf] = { prenom: valeur.trim(), source: 'alias' };
  const alias = spLoadAlias(_uniData.crecheId);
  alias[spNorm(nomPdf.replace(/\s+/g, ''))] = valeur.trim();
  spSaveAlias(_uniData.crecheId, alias);
  _uniData.sal.referentPrenom = spPrenomReferente(_uniData.referentNom, _uniData.sal.mapping);
  uniRenderPreview();
}

async function uniConfirmImport() {
  if (!_uniData) return;
  const btn = document.getElementById('uni-btn-confirm');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Import en cours…';

  const crecheId = _uniData.crecheId, referentId = _uniData.referentId;
  const pres = _uniData.pres, sal = _uniData.sal;
  const creche = cacheCreches.find(c => c.id === crecheId);
  const msgParts = [];
  let presenceOk = true, presErr = '';

  // ---- 1) Présences des enfants ----
  if (pres.pages.length) {
    showBanner('Création des nouveaux enfants…');
    const toCreateNames = [...new Set(pres.pages.flatMap(pg => pg.toCreate))];
    for (const nm of toCreateNames) {
      const parts = nm.trim().split(' ');
      const prenom = parts[0]; const nom = parts.slice(1).join(' ');
      const { data: saved, error } = await sb.from('enfants').insert({ prenom, nom, creche_id: crecheId }).select().single();
      if (saved) {
        cacheEnfants.push(saved);
        pres.nameMap[nm] = { enfant: saved, isNew: false };
        pres.pages.forEach(pg => {
          const idx = pg.toCreate.indexOf(nm);
          if (idx >= 0) { pg.toCreate.splice(idx, 1); pg.matched.push({ name: nm, enfant: saved }); }
        });
      } else { console.error('[ImportUnifie] create enfant', nm, error); }
    }
    showBanner('Enregistrement des présences…');
    const wanted = [];
    pres.pages.forEach(pg => {
      pg.matched.forEach(mt => {
        const cr = (pg.creneaux || {})[mt.name];
        const hd = cr && cr.hdebut ? cr.hdebut : null, hf = cr && cr.hfin ? cr.hfin : null;
        if (!cr || !hd || spMin(hd) < 13 * 60) wanted.push({ enfant_id: mt.enfant.id, presence_date: pg.date, slot: 'M', status: 'present', heure_debut: hd, heure_fin: hf });
        if (!cr || !hf || spMin(hf) > 13 * 60) wanted.push({ enfant_id: mt.enfant.id, presence_date: pg.date, slot: 'A', status: 'present', heure_debut: hd, heure_fin: hf });
      });
    });
    let toInsertCount = 0;
    if (wanted.length) {
      const dates = [...new Set(wanted.map(w => w.presence_date))];
      const ids = [...new Set(wanted.map(w => w.enfant_id))];
      if (pres.replace) {
        showBanner('Nettoyage des présences existantes…');
        const purgeIds = [...new Set([...(pres.crecheEnfantIds || []), ...ids])];
        const { error: delErr } = await sb.from('presences').delete().in('presence_date', dates).in('enfant_id', purgeIds);
        if (delErr) { console.error('[ImportUnifie] purge', delErr); presenceOk = false; }
      }
      if (presenceOk) {
        const { data: existing } = await sb.from('presences').select('id,enfant_id,presence_date,slot').in('presence_date', dates).in('enfant_id', ids);
        const exSet = new Set((existing || []).map(e => e.enfant_id + '_' + e.presence_date + '_' + e.slot));
        const toInsert = ipDedoublonnerLignes(wanted.filter(w => !exSet.has(w.enfant_id + '_' + w.presence_date + '_' + w.slot)));
        toInsertCount = toInsert.length;
        if (toInsert.length) { const r = await ipInsertPresences(toInsert); if (r.error) { console.error('[ImportUnifie] insert presences', r.error); presErr = r.error.message || ''; presenceOk = false; } }
      }
    }
    // Contrats d'accueil (fiche enfant), selon les cases cochées dans l'aperçu.
    if (presenceOk && (_ipContratCreer || _ipContratMaj) && pres.propositions) {
      showBanner('Mise à jour des fiches enfant…');
      try {
        const r = await ipAppliquerContrats(pres.propositions, pres.nameMap, pres.contratsParEnfant);
        if (r.crees) msgParts.push(r.crees + ' contrat' + (r.crees > 1 ? 's' : '') + ' créé' + (r.crees > 1 ? 's' : ''));
        if (r.majs) msgParts.push(r.majs + ' contrat' + (r.majs > 1 ? 's' : '') + ' mis à jour');
      } catch (e) { console.warn('[ImportUnifie] contrats', e); }
    }
    if (presenceOk) {
      msgParts.push((toCreateNames.length ? toCreateNames.length + ' enfant' + (toCreateNames.length > 1 ? 's' : '') + ' créé' + (toCreateNames.length > 1 ? 's' : '') + ', ' : '') + toInsertCount + ' présence' + (toInsertCount > 1 ? 's' : '') + ' enregistrée' + (toInsertCount > 1 ? 's' : ''));
    } else {
      msgParts.push('\u26a0 erreur lors de l\u2019enregistrement des pr\u00e9sences' + (presErr ? ' : ' + presErr : ''));
    }
  }

  // ---- 2) Planning des salariés ----
  let saved = 0, failed = 0, skipped = 0, savedRef = 0, purgees = 0;
  if (sal.jours.length) {
    const batchId = (crypto?.randomUUID) ? crypto.randomUUID() : ('batch-' + Date.now() + '-' + Math.random().toString(36).slice(2));

    // Remise à zéro des semaines concernées : sans elle, les lignes issues d'un
    // import antérieur (autre version du lecteur, autre découpage des créneaux)
    // survivent à côté des nouvelles, puisque l'upsert ne remplace que le triplet
    // (prénom, semaine, jour) effectivement relu dans le PDF. C'est ce qui
    // laissait apparaître deux créneaux concurrents pour la même journée.
    if (sal.replace) {
      const semaines = [...new Set(sal.jours.filter(j => {
        const d = new Date(j.dateISO + 'T12:00:00');
        const i = d.getDay() === 0 ? 6 : d.getDay() - 1;
        return i <= 4;
      }).map(j => mondayOfISO(j.dateISO)))];
      if (semaines.length) {
        showBanner('Nettoyage du planning équipe existant…');
        const { error: delErr } = await sb.from('planning_equipe').delete()
          .eq('creche_id', crecheId).in('semaine', semaines);
        if (delErr) { console.error('[ImportUnifie] purge planning_equipe', delErr); msgParts.push('⚠ le planning existant n’a pas pu être effacé'); }
        else { purgees = semaines.length; }
      }
    }

    for (const j of sal.jours) {
      const d = new Date(j.dateISO + 'T00:00:00');
      const jourIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      if (jourIdx > 4) { skipped += j.salaries.length; continue; }
      const semaine = mondayOfISO(j.dateISO);
      for (const s of j.salaries) {
        const cr = spVersCreneau(s.segments);
        const prenom = sal.mapping[s.nomPdf].prenom;
        const { error } = await sb.from('planning_equipe').upsert({
          creche_id: crecheId, prenom, semaine, jour: jourIdx, type: 'presence',
          label: creche?.name || '', lieu: creche?.name || '',
          hdebut: cr.hdebut, hfin: cr.hfin, pause: cr.pause,
          source_cell: 'PDF présences — ' + s.nomPdf,
          creneau_label: cr.label, import_batch_id: batchId
        }, { onConflict: 'creche_id,prenom,semaine,jour' });
        if (error) { console.error('[ImportUnifie]', error.message); failed++; } else { saved++; }

        if (referentId && sal.referentPrenom && prenom === sal.referentPrenom) {
          await sb.from('planning').delete().eq('referent_id', referentId)
            .eq('semaine', semaine).eq('jour', jourIdx).is('slot', null);
          const ok = await planningSave(referentId, semaine, {
            day: jourIdx, slot: null, type: 'presence',
            label: creche?.name || '', lieu: creche?.name || '',
            hdebut: cr.hdebut, hfin: cr.hfin, pause: cr.pause,
            detachType: '', detachDesc: '', multi: true, batchId
          });
          if (ok) savedRef++; else failed++;
        }
      }
    }
    localStorage.setItem('lastImportBatch_' + crecheId,
      JSON.stringify({ batchId, referentId: referentId || null, date: new Date().toISOString() }));
    msgParts.push(saved + ' jour(s) dans le planning équipe'
      + (purgees ? ' (' + purgees + ' semaine(s) remises à zéro)' : '')
      + (savedRef ? ', dont ' + savedRef + ' aussi dans le planning individuel de ' + sal.referentPrenom : '')
      + (skipped ? ' — ' + skipped + ' ignoré(s) (week-end)' : '')
      + (failed ? ' (' + failed + ' échec(s), voir la console)' : ''));
  }

  if (sal.jours.length) {
    if (typeof peInvalidateAll === 'function') peInvalidateAll(crecheId);
    if (referentId && typeof planningInvalidateAll === 'function') planningInvalidateAll(referentId);
  }

  closeModal('modal-import-unifie-wrap');
  _uniData = null;
  showBanner(msgParts.length ? 'Import terminé : ' + msgParts.join(' · ') + ' ✅' : 'Aucune donnée à importer.', msgParts.length ? undefined : 'error');
  if (pres.pages.length && presenceOk) renderPresence();
  if (sal.jours.length && typeof renderPlanning === 'function') await renderPlanning();
}

