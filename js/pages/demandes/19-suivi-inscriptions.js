/* Suivi des inscriptions et des devis en cours — LECTURE SEULE pour les référents.
   Demandes › Pilotage › « Inscriptions en cours ». Les données viennent de la
   fonction SQL suivi_inscriptions_referent (sql/suivi_inscriptions_referents.sql) :
   crèche du référent uniquement, aucun montant, aucun contact. Aucun bouton
   d'écriture ici ; le module Inscriptions reste réservé à la direction. */
var SI = { onglet: 'insc', insc: [], devis: [], sel: null, charge: false, creche: '', tri: 'date' };

var SI_STATUTS = {
  nouvelle:     { l: 'Nouvelle',       bg: '#EEECFA', fg: '#4A3F9F', etape: 1 },
  en_contact:   { l: 'En contact',     bg: '#FFF6DC', fg: '#7A5700', etape: 2 },
  devis_envoye: { l: 'Devis envoyé',   bg: '#FFF1E3', fg: '#A04A00', etape: 3 },
  accepte:      { l: 'Devis accepté',  bg: '#E6F5EE', fg: '#1B6B47', etape: 4 }
};
var SI_DEVIS = {
  brouillon: { l: 'À envoyer',  bg: '#F1EFF7', fg: '#5B5875' },
  envoye:    { l: 'En attente', bg: '#FFF1E3', fg: '#A04A00' },
  accepte:   { l: 'Accepté',    bg: '#E6F5EE', fg: '#1B6B47' }
};

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
function siBadge(t) {
  return '<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:700;background:' + t.bg + ';color:' + t.fg + '">' + siEsc(t.l) + '</span>';
}
function siNom(p) { return ((p.prenom || '') + ' ' + (p.nom || '')).trim() || 'Sans nom'; }

async function siInit() {
  var z = document.getElementById('si-contenu');
  if (!z) return;
  if (!SI.charge) z.innerHTML = '<div style="padding:24px;color:var(--muted)">Chargement…</div>';
  try {
    var r = await sb.rpc('suivi_inscriptions_referent');
    if (r.error) throw r.error;
    SI.insc = (r.data && r.data.inscriptions) || [];
    SI.devis = (r.data && r.data.devis) || [];
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

/* Crèches d'une ligne : la crèche retenue, sinon les crèches souhaitées. */
function siCreches(x) {
  if (x.creche_id) return [String(x.creche_id)];
  var c = x.creches_souhaitees;
  return Array.isArray(c) ? c.map(String) : [];
}
function siNomCreche(id) {
  var c = (typeof cacheCreches !== 'undefined' ? cacheCreches : []).find(function (k) { return String(k.id) === String(id); });
  return c ? c.name : '';
}
function siNomsCreches(x) { return siCreches(x).map(siNomCreche).filter(Boolean).join(' · '); }
function siChangerCreche(v) { SI.creche = v; SI.sel = null; siRender(); }
function siChangerTri(v) { SI.tri = v; siRender(); }
function siFiltrer(l) {
  if (!SI.creche) return l;
  return l.filter(function (x) { return siCreches(x).indexOf(SI.creche) >= 0; });
}
function siTrier(l, insc) {
  var c = {
    date: insc ? function (a, b) { return String(a.date_entree_souhaitee || '9999').localeCompare(String(b.date_entree_souhaitee || '9999')); }
              : function (a, b) { return String(b.envoye_le || '').localeCompare(String(a.envoye_le || '')); },
    recent: function (a, b) { return String(b.created_at || b.envoye_le || '').localeCompare(String(a.created_at || a.envoye_le || '')); },
    nom: function (a, b) { return siNom(a).localeCompare(siNom(b), 'fr'); },
    statut: function (a, b) { return String(a.statut).localeCompare(String(b.statut)) || siNom(a).localeCompare(siNom(b), 'fr'); },
    creche: function (a, b) { return siNomsCreches(a).localeCompare(siNomsCreches(b), 'fr') || siNom(a).localeCompare(siNom(b), 'fr'); }
  }[SI.tri] || null;
  return c ? l.slice().sort(c) : l;
}

function siOnglet(o) { SI.onglet = o; SI.sel = null; siRender(); }
function siChoisir(id) { SI.sel = (SI.sel === id) ? null : id; siRender(); }

function siRender() {
  var z = document.getElementById('si-contenu');
  if (!z) return;
  var insc = SI.onglet === 'insc';
  var lInsc = siFiltrer(SI.insc), lDevis = siFiltrer(SI.devis);
  var nbAttente = lDevis.filter(function (d) { return d.statut === 'envoye'; }).length;
  var multi = !!isDirection;  // la direction choisit la crèche ; un référent n'a que la sienne
  var barre = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">';
  if (multi) {
    barre += '<select class="finput" aria-label="Crèche" onchange="siChangerCreche(this.value)" style="width:auto;min-width:160px;font-size:12px;padding:4px 8px"><option value="">Toutes les crèches</option>'
      + (typeof cacheCreches !== 'undefined' ? cacheCreches : []).map(function (k) {
        return '<option value="' + siEsc(k.id) + '"' + (SI.creche === String(k.id) ? ' selected' : '') + '>' + siEsc(k.name) + '</option>';
      }).join('') + '</select>';
  }
  var optsTri = [['date', insc ? 'Date d\'entrée souhaitée' : 'Date d\'envoi'], ['recent', 'Plus récent'], ['nom', 'Nom'], ['statut', 'Statut']];
  if (multi) optsTri.push(['creche', 'Crèche']);
  barre += '<label style="font-size:12px;color:var(--muted)">Trier par <select class="finput" onchange="siChangerTri(this.value)" style="width:auto;font-size:12px;padding:4px 8px">'
    + optsTri.map(function (o) { return '<option value="' + o[0] + '"' + (SI.tri === o[0] ? ' selected' : '') + '>' + siEsc(o[1]) + '</option>'; }).join('')
    + '</select></label></div>';
  var h = '<div class="filters" style="margin-bottom:12px">'
    + '<button class="fchip' + (insc ? ' active' : '') + '" onclick="siOnglet(\'insc\')">Inscriptions (' + lInsc.length + ')</button>'
    + '<button class="fchip' + (!insc ? ' active' : '') + '" onclick="siOnglet(\'devis\')">Devis en cours (' + lDevis.length + ')</button>'
    + '</div>' + barre;
  if (!insc && nbAttente) h += '<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">' + nbAttente + ' devis en attente de réponse de la famille.</div>';
  var lignes = siTrier(insc ? lInsc : lDevis, insc);
  if (!lignes.length) {
    z.innerHTML = h + '<div style="padding:24px;color:var(--muted)">' + (insc ? 'Aucune inscription en cours pour votre crèche.' : 'Aucun devis en cours pour votre crèche.') + '</div>';
    return;
  }
  h += '<div style="display:flex;flex-direction:column;gap:6px">';
  lignes.forEach(function (x) {
    var id = String(x.id), ouvert = SI.sel === id;
    var t, c2, c3;
    if (insc) {
      t = SI_STATUTS[x.statut] || { l: x.statut, bg: '#EEE', fg: '#333' };
      c2 = x.dob ? (x.ne_ou_a_naitre === 'a_naitre' ? 'terme le ' : 'né(e) le ') + siDate(x.dob) : 'naissance non renseignée';
      c3 = 'entrée souhaitée : ' + siDate(x.date_entree_souhaitee);
    } else {
      t = SI_DEVIS[x.statut] || { l: x.statut, bg: '#EEE', fg: '#333' };
      c2 = siEsc(x.numero || 'Sans numéro');
      c3 = x.envoye_le ? 'envoyé le ' + siDate(x.envoye_le) : 'pas encore envoyé';
    }
    h += '<button type="button" onclick="siChoisir(\'' + id.replace(/'/g, '') + '\')" style="text-align:left;width:100%;border:1px solid var(--border,#e3e1d8);border-radius:10px;background:' + (ouvert ? '#EAF4F2' : '#fff') + ';padding:12px 14px;cursor:pointer;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font:inherit">'
      + '<b style="flex:1 1 160px">' + siEsc(siNom(x)) + (multi && siNomsCreches(x) ? '<span style="display:block;font-weight:400;font-size:11.5px;color:var(--muted)">' + siEsc(siNomsCreches(x)) + '</span>' : '') + '</b>'
      + '<span style="flex:1 1 150px;color:var(--muted);font-size:12.5px">' + (insc ? siEsc(c2) : c2) + '</span>'
      + '<span style="flex:1 1 170px;color:var(--muted);font-size:12.5px">' + siEsc(c3) + '</span>'
      + siBadge(t) + '</button>';
    if (ouvert) h += siDetail(x, insc);
  });
  h += '</div>';
  z.innerHTML = h;
}

function siDetail(x, insc) {
  var etapes, fait;
  if (insc) {
    etapes = ['Demande reçue', 'En contact avec la famille', 'Devis envoyé', 'Devis accepté'];
    fait = (SI_STATUTS[x.statut] || { etape: 1 }).etape;
  } else {
    etapes = ['Devis préparé', 'Devis envoyé à la famille', 'Accepté par la famille'];
    fait = x.statut === 'accepte' ? 3 : x.statut === 'envoye' ? 2 : 1;
  }
  var li = etapes.map(function (l, i) {
    var ok = i < fait;
    return '<li style="display:flex;align-items:center;gap:8px;font-size:13px;color:' + (ok ? 'inherit' : 'var(--muted)') + '">'
      + '<span style="width:18px;height:18px;border-radius:50%;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;'
      + (ok ? 'background:#1F6F6B;color:#fff' : 'border:2px solid #B9B6A9') + '">' + (ok ? '✓' : '') + '</span>' + siEsc(l) + '</li>';
  }).join('');
  var infos = insc
    ? 'Demande reçue le ' + siDate(x.created_at)
    : (x.expire_le ? 'Valable jusqu\'au ' + siDate(x.expire_le) : '') + (x.repondu_le ? ' · Réponse le ' + siDate(x.repondu_le) : '');
  return '<div style="border:1px solid var(--border,#e3e1d8);border-radius:10px;background:#fff;padding:14px 16px;margin:-2px 0 6px">'
    + (infos ? '<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">' + siEsc(infos) + '</div>' : '')
    + '<ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px">' + li + '</ol></div>';
}
