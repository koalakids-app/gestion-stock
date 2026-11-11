/* Entrées à venir — LECTURE SEULE pour les référents.
   Demandes › Pilotage › « Entrées à venir » (ancien suivi des inscriptions en cours).
   Les données viennent de la fonction SQL entrees_a_venir_referent
   (sql/entrees_a_venir_referents.sql) : enfants déjà inscrits dont l'accueil n'a pas
   encore commencé, crèche du référent uniquement (la direction voit toutes les
   crèches), coordonnées des parents comprises, aucun montant. Aucun bouton d'écriture ici ; le module
   Inscriptions reste réservé à la direction. */
var SI = { entrees: [], charge: false, creche: '', tri: 'date' };

/* Référents et direction : oui (la direction garde aussi le module Inscriptions complet). */
function siAccesPermis() {
  return true;
}

function siEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function siDate(d) {
  if (!d) return '—';
  var p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—';
}
function siNom(p) { return ((p.prenom || '') + ' ' + (p.nom || '')).trim() || 'Sans nom'; }

async function siInit() {
  var z = document.getElementById('si-contenu');
  if (!z) return;
  if (!SI.charge) z.innerHTML = '<div style="padding:24px;color:var(--muted)">Chargement…</div>';
  try {
    var r = await sb.rpc('entrees_a_venir_referent');
    if (r.error) throw r.error;
    SI.entrees = Array.isArray(r.data) ? r.data : [];
    SI.charge = true;
  } catch (e) {
    console.warn('[siInit]', e);
    z.innerHTML = '<div style="padding:24px;color:var(--red)">Chargement impossible. Vérifiez votre connexion (ou que le script SQL a été appliqué).</div>';
    return;
  }
  try { siRender(); } catch (e) {
    console.warn('[siRender]', e);
    z.innerHTML = '<div style="padding:24px;color:var(--red)">Affichage impossible : ' + siEsc(e.message || e) + '</div>';
  }
}

function siNomCreche(id) {
  var c = (typeof cacheCreches !== 'undefined' ? cacheCreches : []).find(function (k) { return String(k.id) === String(id); });
  return c ? c.name : '';
}
function siChangerCreche(v) { SI.creche = v; siRender(); }
function siChangerTri(v) { SI.tri = v; siRender(); }
function siTrier(l) {
  var c = {
    date: function (a, b) { return String(a.entree || '9999').localeCompare(String(b.entree || '9999')); },
    nom: function (a, b) { return siNom(a).localeCompare(siNom(b), 'fr'); },
    creche: function (a, b) { return siNomCreche(a.creche_id).localeCompare(siNomCreche(b.creche_id), 'fr') || siNom(a).localeCompare(siNom(b), 'fr'); }
  }[SI.tri] || null;
  return c ? l.slice().sort(c) : l;
}

function siRender() {
  var z = document.getElementById('si-contenu');
  if (!z) return;
  var multi = !!isDirection;  // la direction choisit la crèche ; un référent n'a que la sienne
  var liste = SI.entrees.filter(function (x) { return !multi || !SI.creche || String(x.creche_id) === SI.creche; });
  var barre = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">';
  if (multi) {
    barre += '<select class="finput" aria-label="Crèche" onchange="siChangerCreche(this.value)" style="width:auto;min-width:160px;font-size:12px;padding:4px 8px"><option value="">Toutes les crèches</option>'
      + (typeof cacheCreches !== 'undefined' ? cacheCreches : []).map(function (k) {
        return '<option value="' + siEsc(k.id) + '"' + (SI.creche === String(k.id) ? ' selected' : '') + '>' + siEsc(k.name) + '</option>';
      }).join('') + '</select>';
  }
  var optsTri = [['date', 'Date d\'entrée'], ['nom', 'Nom']];
  if (multi) optsTri.push(['creche', 'Crèche']);
  barre += '<label style="font-size:12px;color:var(--muted)">Trier par <select class="finput" onchange="siChangerTri(this.value)" style="width:auto;font-size:12px;padding:4px 8px">'
    + optsTri.map(function (o) { return '<option value="' + o[0] + '"' + (SI.tri === o[0] ? ' selected' : '') + '>' + siEsc(o[1]) + '</option>'; }).join('')
    + '</select></label></div>';
  var h = '<div style="font-size:13px;color:var(--muted);margin-bottom:10px"><b>' + liste.length + '</b> enfant' + (liste.length > 1 ? 's' : '')
    + ' déjà inscrit' + (liste.length > 1 ? 's' : '') + ', pas encore arrivé' + (liste.length > 1 ? 's' : '') + '.</div>' + barre;
  if (!liste.length) {
    z.innerHTML = h + '<div style="padding:24px;color:var(--muted)">Aucune entrée à venir' + (multi ? '' : ' pour votre crèche') + '.</div>';
    return;
  }
  h += '<div style="display:flex;flex-direction:column;gap:6px">';
  siTrier(liste).forEach(function (x) {
    var parents = (x.parents || []).map(function (p) {
      var nom = ((p.prenom || '') + ' ' + (p.nom || '')).trim();
      var tel = String(p.telephone || '').trim(), mail = String(p.email || '').trim();
      var bouts = [];
      if (tel) bouts.push('<a href="tel:' + siEsc(tel.replace(/[^\d+]/g, '')) + '">' + siEsc(tel) + '</a>');
      if (mail) bouts.push('<a href="mailto:' + siEsc(mail) + '">' + siEsc(mail) + '</a>');
      return (nom || bouts.length) ? '<div>' + (nom ? '<b style="font-weight:600">' + siEsc(nom) + '</b>' + (bouts.length ? ' · ' : '') : '') + bouts.join(' · ') + '</div>' : '';
    }).join('');
    h += '<div style="border:1px solid var(--border,#e3e1d8);border-radius:10px;background:#fff;padding:12px 14px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center">'
      + '<b style="flex:1 1 160px">' + siEsc(siNom(x)) + (multi && siNomCreche(x.creche_id) ? '<span style="display:block;font-weight:400;font-size:11.5px;color:var(--muted)">' + siEsc(siNomCreche(x.creche_id)) + '</span>' : '') + '</b>'
      + '<span style="flex:1 1 150px;color:var(--muted);font-size:12.5px">' + (x.dob ? 'né(e) le ' + siDate(x.dob) : 'naissance non renseignée') + '</span>'
      + '<span style="flex:1 1 170px;font-size:12.5px"><b>entrée le ' + siDate(x.entree) + '</b></span>'
      + '<div style="flex:1 1 100%;font-size:12.5px;color:var(--muted)">' + (parents || 'Coordonnées des parents non renseignées') + '</div>'
      + '</div>';
  });
  h += '</div>';
  z.innerHTML = h;
}
