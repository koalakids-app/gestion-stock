/* Jeu de société « Le Sentier du Koala » : plateau, dés, cartes, bilan.
 * Une seule tablette ou un seul téléphone passe de main en main ; les cartes sont dans
 * jeu-societe-cartes.js. La partie est gardée en localStorage (reprise possible). */
(function () {
  'use strict';

  var CARTES = window.KK_JEU_CARTES || [];
  var CHANCE = window.KK_JEU_CHANCE || [];

  var THEMES = {
    dev:    { nom: 'Développement', ico: '🧠' },
    ped:    { nom: 'Pédagogie',     ico: '🎨' },
    pro:    { nom: 'Protocoles',    ico: '🧼' },
    par:    { nom: 'Familles',      ico: '👨‍👩‍👧' },
    partage:{ nom: 'Partage',       ico: '💬' },
    chance: { nom: 'Chance',        ico: '🍀' }
  };
  var THEMES_QUIZ = ['dev', 'ped', 'pro', 'par'];

  var PUBLICS = {
    equipe:  { nom: 'Entre professionnel·les', ico: '🧑‍🏫', desc: "Formation d'équipe, réunion, temps d'analyse de pratiques", tags: ['e', 'x'] },
    parents: { nom: 'Avec des parents',        ico: '👨‍👩‍👧', desc: "Atelier ou café des parents", tags: ['p', 'x'] },
    mixte:   { nom: 'Équipe et parents',       ico: '🤝', desc: "Tous les sujets, pour échanger ensemble", tags: ['e', 'p', 'x'] }
  };

  var PIONS = ['🐨', '🦉', '🦊', '🐘', '🦒', '🐼'];
  var COLONNES = 6;
  var FIN = 41;                       // case 0 = départ, case 41 = arrivée
  var MOTIF = ['dev', 'pro', 'ped', 'par', 'chance', 'pro', 'dev', 'partage', 'ped', 'par'];
  var PLAN = [];                      // type de chaque case
  PLAN[0] = 'depart';
  for (var i = 1; i < FIN; i++) PLAN[i] = MOTIF[(i - 1) % MOTIF.length];
  PLAN[FIN] = 'arrivee';

  var CLE = 'kk_jeu_partie';
  var DES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  var app = document.getElementById('app');
  var voile = document.getElementById('voile');
  var modale = document.getElementById('modale');
  var btnFin = document.getElementById('btnFin');
  var etat = null;                    // partie en cours
  var occupe = false;
  var config = { public: 'equipe', nb: 3, noms: [] };

  /* ───────── Outils ───────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function melange(t) {
    var a = t.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function stockage(fn) { try { return fn(); } catch (e) { return null; } }
  function sauver() { stockage(function () { localStorage.setItem(CLE, JSON.stringify(etat)); }); }
  function charger() { return stockage(function () { var s = localStorage.getItem(CLE); return s ? JSON.parse(s) : null; }); }
  function oublier() { stockage(function () { localStorage.removeItem(CLE); }); }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /* ───────── Fenêtre (carte) ───────── */
  var focusAvant = null;
  function ouvrirModale(html) {
    focusAvant = document.activeElement;
    modale.innerHTML = html;
    voile.hidden = false;
    modale.scrollTop = 0;
    modale.focus();
  }
  function fermerModale() {
    voile.hidden = true;
    modale.innerHTML = '';
    if (focusAvant && focusAvant.focus) { try { focusAvant.focus(); } catch (e) {} }
  }
  /* Affiche html puis attend un clic sur un bouton [data-ok] ; renvoie la valeur de data-ok. */
  function attendre(html) {
    ouvrirModale(html);
    return new Promise(function (resolve) {
      modale.addEventListener('click', function suite(ev) {
        var b = ev.target.closest('[data-ok]');
        if (!b) return;
        modale.removeEventListener('click', suite);
        var v = b.getAttribute('data-ok');
        fermerModale();
        resolve(v);
      });
    });
  }

  /* ───────── Accueil ───────── */
  function ecranAccueil() {
    btnFin.hidden = true;
    var reprise = charger();
    var h = '<section class="accueil">' +
      '<div class="big" aria-hidden="true">🐨🌿</div>' +
      '<h2>Le Sentier du Koala</h2>' +
      '<p class="sous">Un jeu de société pour grandir ensemble : développement de l\'enfant, pédagogie, protocoles et relation aux familles.</p>';
    if (reprise && reprise.joueurs) {
      h += '<div class="bloc"><h3>Une partie est en cours</h3><p>' + reprise.joueurs.length + ' équipes · ' +
        esc(PUBLICS[reprise.public] ? PUBLICS[reprise.public].nom : '') + '</p>' +
        '<div class="actions" style="margin-top:10px"><button class="bt" id="btnReprendre" type="button">▶ Reprendre la partie</button>' +
        '<button class="bt bt-second" id="btnOublier" type="button">Effacer</button></div></div>';
    }
    h += '<div class="bloc"><h3>1. Qui joue ?</h3><div class="choix-liste" role="group" aria-label="Public">';
    Object.keys(PUBLICS).forEach(function (k) {
      var p = PUBLICS[k];
      h += '<button class="choix" type="button" data-public="' + k + '" aria-pressed="' + (config.public === k) + '">' +
        '<span class="ic" aria-hidden="true">' + p.ico + '</span><span><b>' + esc(p.nom) + '</b><small>' + esc(p.desc) + '</small></span></button>';
    });
    h += '</div></div>';
    h += '<div class="bloc"><h3>2. Combien d\'équipes ?</h3><div class="nb-equipes">' +
      '<button type="button" id="moins" aria-label="Une équipe de moins">−</button>' +
      '<output id="nb" aria-live="polite">' + config.nb + '</output>' +
      '<button type="button" id="plus" aria-label="Une équipe de plus">+</button></div><div class="noms" id="noms"></div></div>';
    h += '<div class="bloc"><h3>Les cases du plateau</h3><div class="cat-liste">';
    Object.keys(THEMES).forEach(function (k) {
      h += '<div class="cat-pastille l-' + k + '"><span aria-hidden="true">' + THEMES[k].ico + '</span>' + THEMES[k].nom + '</div>';
    });
    h += '</div></div>';
    h += '<div class="actions"><button class="bt bt-gros" id="btnJouer" type="button">🎲 <span>Commencer la partie</span></button></div>';
    h += '</section>';
    app.innerHTML = h;
    dessinerNoms();

    app.querySelectorAll('[data-public]').forEach(function (b) {
      b.addEventListener('click', function () {
        config.public = b.getAttribute('data-public');
        app.querySelectorAll('[data-public]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      });
    });
    document.getElementById('moins').addEventListener('click', function () { changerNb(-1); });
    document.getElementById('plus').addEventListener('click', function () { changerNb(1); });
    document.getElementById('btnJouer').addEventListener('click', demarrer);
    var br = document.getElementById('btnReprendre');
    if (br) br.addEventListener('click', function () { etat = reprise; ecranJeu(); });
    var bo = document.getElementById('btnOublier');
    if (bo) bo.addEventListener('click', function () { oublier(); ecranAccueil(); });
  }
  function lireNoms() {
    document.querySelectorAll('#noms input').forEach(function (inp, i) { config.noms[i] = inp.value; });
  }
  function changerNb(d) {
    lireNoms();
    config.nb = Math.max(2, Math.min(6, config.nb + d));
    document.getElementById('nb').textContent = config.nb;
    dessinerNoms();
  }
  function dessinerNoms() {
    var h = '';
    for (var i = 0; i < config.nb; i++) {
      h += '<label><span class="pion" aria-hidden="true">' + PIONS[i] + '</span><span class="sr" style="position:absolute;left:-9999px">Nom de l\'équipe ' + (i + 1) + '</span>' +
        '<input type="text" maxlength="24" value="' + esc(config.noms[i] || '') + '" placeholder="Équipe ' + (i + 1) + '" autocomplete="off"></label>';
    }
    document.getElementById('noms').innerHTML = h;
  }

  function demarrer() {
    lireNoms();
    var joueurs = [];
    for (var i = 0; i < config.nb; i++) {
      var nom = (config.noms[i] || '').trim() || ('Équipe ' + (i + 1));
      joueurs.push({ nom: nom, pion: PIONS[i], pos: 0, feuilles: 0, passe: false });
    }
    etat = { public: config.public, joueurs: joueurs, tour: 0, nbTours: 0, vus: {}, stats: {}, rates: [], premier: -1, fini: false };
    THEMES_QUIZ.forEach(function (k) { etat.stats[k] = { ok: 0, total: 0 }; });
    etat.stats.partage = { ok: 0, total: 0 };
    sauver();
    ecranJeu();
  }

  /* ───────── Plateau ───────── */
  function coordonnees(i) {
    var r = Math.floor(i / COLONNES);
    var c = r % 2 === 0 ? i % COLONNES : COLONNES - 1 - (i % COLONNES);
    var rangees = Math.ceil((FIN + 1) / COLONNES);
    return { ligne: rangees - r, col: c + 1 };
  }
  function ecranJeu() {
    btnFin.hidden = false;
    app.innerHTML = '<div class="jeu"><div id="plateau" class="plateau" role="img" aria-label="Plateau de jeu, 42 cases du départ à l\'arrivée"></div>' +
      '<div class="panneau"><div class="tour" id="tour"></div><ul class="score" id="score" aria-label="Score des équipes"></ul>' +
      '<div class="legende" aria-hidden="true">' + Object.keys(THEMES).map(function (k) { return '<span class="l-' + k + '">' + THEMES[k].ico + ' ' + THEMES[k].nom + '</span>'; }).join('') + '</div></div></div>';
    dessinerPlateau();
    dessinerPanneau();
  }
  function dessinerPlateau() {
    var h = '';
    for (var i = 0; i <= FIN; i++) {
      var t = PLAN[i], p = coordonnees(i), ico, cl;
      if (t === 'depart') { ico = '🏠'; cl = 't-bord'; }
      else if (t === 'arrivee') { ico = '🌳'; cl = 't-bord'; }
      else { ico = THEMES[t].ico; cl = 't-' + t; }
      var pions = etat.joueurs.map(function (j) { return j.pos === i ? '<span>' + j.pion + '</span>' : ''; }).join('');
      var cur = etat.joueurs[etat.tour] && etat.joueurs[etat.tour].pos === i ? ' courant' : '';
      h += '<div class="case ' + cl + cur + (pions ? ' avec-pion' : '') + '" style="grid-row:' + p.ligne + ';grid-column:' + p.col + '">' +
        '<span class="n">' + i + '</span><span class="ic">' + ico + '</span><span class="pions">' + pions + '</span></div>';
    }
    document.getElementById('plateau').innerHTML = h;
  }
  function dessinerPanneau(msg, de) {
    var j = etat.joueurs[etat.tour];
    var tour = document.getElementById('tour');
    tour.innerHTML = '<div class="qui">' + j.pion + ' ' + esc(j.nom) + '</div>' +
      '<div class="msg">' + esc(msg || (j.passe ? 'Cette équipe passe son tour.' : 'À vous de jouer ! Lancez le dé.')) + '</div>' +
      '<div class="de-zone"><div class="de" id="de" role="img" aria-label="Dé">' + DES[(de || 6) - 1] + '</div>' +
      '<button class="bt bt-gros" id="btnDe" type="button">🎲 <span>Lancer le dé</span></button></div>';
    document.getElementById('btnDe').addEventListener('click', lancer);
    document.getElementById('score').innerHTML = etat.joueurs.map(function (x, i) {
      return '<li class="' + (i === etat.tour ? 'actif' : '') + '"><span class="p" aria-hidden="true">' + x.pion + '</span>' +
        '<span class="nom">' + esc(x.nom) + '</span><span class="f">' + x.feuilles + ' 🌿</span>' +
        '<span class="case-n">case ' + x.pos + '/' + FIN + '</span></li>';
    }).join('');
  }

  /* ───────── Tour de jeu ───────── */
  async function lancer() {
    if (occupe || etat.fini) return;
    occupe = true;
    var btn = document.getElementById('btnDe');
    if (btn) btn.disabled = true;
    var j = etat.joueurs[etat.tour];
    try {
      if (j.passe) {
        j.passe = false;
        toast(j.nom + ' passe son tour');
        await pause(900);
        suivant();
        return;
      }
      var valeur = 1 + Math.floor(Math.random() * 6);
      await animerDe(valeur);
      dessinerPanneau('Résultat : ' + valeur, valeur);
      document.getElementById('btnDe').disabled = true;
      await deplacer(j, valeur);
      await resoudre(j);
    } finally {
      occupe = false;
    }
  }
  async function animerDe(valeur) {
    var de = document.getElementById('de');
    de.classList.add('roule');
    for (var k = 0; k < 8; k++) { de.textContent = DES[Math.floor(Math.random() * 6)]; await pause(80); }
    de.classList.remove('roule');
    de.textContent = DES[valeur - 1];
  }
  async function deplacer(j, delta) {
    var sens = delta >= 0 ? 1 : -1;
    for (var n = Math.abs(delta); n > 0; n--) {
      var suivante = j.pos + sens;
      if (suivante < 0 || suivante > FIN) break;
      j.pos = suivante;
      dessinerPlateau();
      await pause(230);
    }
  }
  async function resoudre(j) {
    if (j.pos >= FIN) { terminer(j); return; }
    var type = PLAN[j.pos], rejoue = false;
    if (type === 'chance') {
      rejoue = await carteChance(j);
    } else if (type === 'partage') {
      await carteDiscussion(j);
    } else if (type !== 'depart') {
      var ok = await carteQuestion(j, type);
      if (ok) {
        j.feuilles++;
        if (j.pos < FIN) { toast('Bonne réponse : +1 🌿 et 1 case de bonus'); await deplacer(j, 1); }
      }
    }
    if (j.pos >= FIN) { terminer(j); return; }
    if (rejoue) { sauver(); dessinerPlateau(); dessinerPanneau('Rejouez !'); return; }
    suivant();
  }
  function suivant() {
    etat.nbTours++;
    etat.tour = (etat.tour + 1) % etat.joueurs.length;
    sauver();
    dessinerPlateau();
    dessinerPanneau();
  }

  /* ───────── Pioche ───────── */
  function piocher(cat) {
    var tags = PUBLICS[etat.public].tags;
    var pool = CARTES.filter(function (c) { return c.cat === cat && tags.indexOf(c.pub) >= 0; });
    var vus = etat.vus[cat] || [];
    var restantes = pool.filter(function (c) { return vus.indexOf(c.id) < 0; });
    if (!restantes.length) { vus = []; restantes = pool; }
    if (!restantes.length) return null;
    var c = restantes[Math.floor(Math.random() * restantes.length)];
    vus.push(c.id);
    etat.vus[cat] = vus;
    return c;
  }

  async function carteQuestion(j, cat) {
    var c = piocher(cat);
    if (!c) return false;
    var options = melange([{ t: c.bon, bon: true }, { t: c.mauvaises[0] }, { t: c.mauvaises[1] }]);
    var th = THEMES[cat];
    var lettres = ['A', 'B', 'C'];
    var h = '<span class="chip t-' + cat + '"><span aria-hidden="true">' + th.ico + '</span> ' + th.nom + '</span>' +
      '<h2 id="modaleTitre">' + esc(c.q) + '</h2>' +
      '<p class="aide">' + j.pion + ' ' + esc(j.nom) + ' : concertez-vous, puis choisissez une réponse.</p>' +
      '<div class="opts">' + options.map(function (o, i) {
        return '<button class="opt" type="button" data-i="' + i + '"><span class="l" aria-hidden="true">' + lettres[i] + '</span><span>' + esc(o.t) + '</span></button>';
      }).join('') + '</div><div id="retour"></div>';
    ouvrirModale(h);
    var ok = await new Promise(function (resolve) {
      modale.addEventListener('click', function choisir(ev) {
        var b = ev.target.closest('.opt');
        if (!b) return;
        modale.removeEventListener('click', choisir);
        var rep = options[+b.getAttribute('data-i')];
        modale.querySelectorAll('.opt').forEach(function (x, i) {
          x.disabled = true;
          if (options[i].bon) { x.classList.add('bon'); x.insertAdjacentHTML('beforeend', '<span class="verdict" aria-hidden="true">✓</span>'); x.setAttribute('aria-label', 'Bonne réponse : ' + options[i].t); }
          else if (x === b) { x.classList.add('faux'); x.insertAdjacentHTML('beforeend', '<span class="verdict" aria-hidden="true">✗</span>'); }
        });
        var bon = !!rep.bon;
        document.getElementById('retour').innerHTML =
          '<div class="resultat ' + (bon ? 'ok' : 'ko') + '" role="status">' + (bon ? 'Bravo ! +1 🌿' : 'Pas tout à fait…') + '</div>' +
          '<div class="retenir"><b>À retenir.</b> ' + esc(c.retenir) + '</div>' +
          '<div class="pied"><button class="bt" type="button" id="cont">Continuer</button></div>';
        var cont = document.getElementById('cont');
        cont.focus();
        cont.addEventListener('click', function () { resolve(bon); });
      });
    });
    fermerModale();
    var s = etat.stats[cat] || (etat.stats[cat] = { ok: 0, total: 0 });
    s.total++;
    if (ok) s.ok++; else if (etat.rates.indexOf(c.id) < 0) etat.rates.push(c.id);
    return ok;
  }

  async function carteDiscussion(j) {
    var c = piocher('partage');
    if (!c) return;
    var th = THEMES.partage;
    var h = '<span class="chip t-partage"><span aria-hidden="true">' + th.ico + '</span> ' + th.nom + '</span>' +
      '<h2 id="modaleTitre">' + esc(c.q) + '</h2>' +
      '<p class="aide">Pas de bonne ou mauvaise réponse : chacun·e s\'exprime à son tour, sans jugement.</p>' +
      '<div class="pied"><button class="bt bt-second" type="button" id="pistes">💡 Voir des pistes</button>' +
      '<button class="bt" type="button" data-ok="1">Nous en avons parlé · +1 🌿</button></div>';
    ouvrirModale(h);
    var bp = document.getElementById('pistes');
    bp.addEventListener('click', function () {
      bp.insertAdjacentHTML('beforebegin', '<div class="retenir" style="flex-basis:100%">' + esc(c.retenir) + '</div>');
      bp.remove();
    });
    await new Promise(function (resolve) {
      modale.addEventListener('click', function suite(ev) {
        if (!ev.target.closest('[data-ok]')) return;
        modale.removeEventListener('click', suite);
        resolve();
      });
    });
    fermerModale();
    j.feuilles++;
    etat.stats.partage.total++;
    etat.stats.partage.ok++;
  }

  async function carteChance(j) {
    var c = CHANCE[Math.floor(Math.random() * CHANCE.length)];
    await attendre('<span class="chip t-chance"><span aria-hidden="true">🍀</span> Chance</span>' +
      '<h2 id="modaleTitre">' + esc(c.t) + '</h2><p><b>' + esc(c.e) + '</b></p>' +
      '<div class="pied"><button class="bt" type="button" data-ok="1">D\'accord</button></div>');
    if (c.feuille) j.feuilles += c.feuille;
    if (c.passe) j.passe = true;
    if (c.move) await deplacer(j, c.move);
    return !!c.rejoue;
  }

  /* ───────── Fin de partie ───────── */
  function terminer(j) {
    etat.premier = etat.joueurs.indexOf(j);
    etat.fini = true;
    sauver();
    ecranBilan();
  }
  function ecranBilan() {
    btnFin.hidden = true;
    var joueurs = etat.joueurs;
    var meilleur = joueurs.reduce(function (m, x) { return x.feuilles > m.feuilles ? x : m; }, joueurs[0]);
    var gagnants = joueurs.filter(function (x) { return x.feuilles === meilleur.feuilles; });
    var arrive = etat.premier >= 0 ? joueurs[etat.premier] : null;
    var h = '<section class="bilan"><div class="accueil"><div class="big" aria-hidden="true">🌳</div></div>' +
      '<h2>' + (arrive ? 'Bravo, ' + esc(arrive.nom) + ' !' : 'Fin de la partie') + '</h2>' +
      '<p class="sous" style="text-align:center;color:var(--muted)">' + (arrive ? 'Arrivé·e en premier au grand eucalyptus.' : 'Voici le bilan de votre partie.') + '</p>' +
      '<div class="podium">' +
      (arrive ? '<div class="prix"><div class="ic" aria-hidden="true">' + arrive.pion + '</div><b>La première à l\'arrivée</b>' + esc(arrive.nom) + '</div>' : '') +
      '<div class="prix"><div class="ic" aria-hidden="true">🌿</div><b>Le plus de feuilles</b>' +
      gagnants.map(function (x) { return x.pion + ' ' + esc(x.nom); }).join(', ') + ' · ' + meilleur.feuilles + ' 🌿</div></div>';

    h += '<div class="bloc"><h3>Vos résultats par thème</h3>';
    THEMES_QUIZ.concat(['partage']).forEach(function (k) {
      var s = etat.stats[k] || { ok: 0, total: 0 };
      var pct = s.total ? Math.round(100 * s.ok / s.total) : 0;
      h += '<div class="theme-ligne"><span>' + THEMES[k].ico + ' ' + THEMES[k].nom + '</span>' +
        '<span class="barre" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
        '<span class="v">' + (s.total ? s.ok + '/' + s.total : '—') + '</span></div>';
    });
    h += '</div>';

    var rates = etat.rates.map(function (id) { return CARTES[id]; }).filter(Boolean);
    h += '<div class="bloc"><h3>À retenir ' + (rates.length ? '(' + rates.length + ')' : '') + '</h3>';
    if (rates.length) {
      h += '<p>Les questions qui ont posé problème, avec la bonne réponse :</p><div class="revoir">' + rates.map(function (c) {
        return '<article><h4>' + THEMES[c.cat].ico + ' ' + esc(c.q) + '</h4><p class="r">✓ ' + esc(c.bon) + '</p><p>' + esc(c.retenir) + '</p></article>';
      }).join('') + '</div>';
    } else {
      h += '<p>Aucune erreur sur les questions : bravo, toute l\'équipe est au point ! 🎉</p>';
    }
    h += '</div>';
    h += '<div class="bloc"><h3>Mon engagement</h3><p style="margin-bottom:8px">Une chose que je vais changer ou essayer dès demain :</p>' +
      '<label class="sr" for="engagement" style="position:absolute;left:-9999px">Mon engagement</label>' +
      '<textarea id="engagement" maxlength="400" placeholder="Écrivez ici (rien n\'est enregistré)"></textarea></div>';
    h += '<div class="actions"><button class="bt bt-gros" id="btnRejouer" type="button">🔄 <span>Nouvelle partie</span></button>' +
      '<button class="bt bt-second" id="btnImprimer" type="button">🖨️ <span>Imprimer le bilan</span></button></div></section>';
    app.innerHTML = h;
    document.getElementById('btnRejouer').addEventListener('click', function () { oublier(); etat = null; ecranAccueil(); });
    document.getElementById('btnImprimer').addEventListener('click', function () { window.print(); });
    window.scrollTo(0, 0);
  }

  /* ───────── Règles et boutons d'en-tête ───────── */
  document.getElementById('btnRegles').addEventListener('click', function () {
    attendre('<h2 id="modaleTitre">Règles du jeu</h2>' +
      '<ol class="regles">' +
      '<li><b>But du jeu :</b> atteindre le grand eucalyptus 🌳 (case ' + FIN + ') en premier, en récoltant un maximum de feuilles 🌿.</li>' +
      '<li><b>À son tour</b>, l\'équipe lance le dé et avance de ce nombre de cases.</li>' +
      '<li><b>Cases thèmes</b> (🧠 développement, 🎨 pédagogie, 🧼 protocoles, 👨‍👩‍👧 familles) : une question à 3 réponses. Concertez-vous avant de répondre. Bonne réponse : +1 🌿 et une case de bonus.</li>' +
      '<li><b>Case Partage</b> 💬 : un sujet à discuter, sans bonne ou mauvaise réponse. Toute l\'équipe qui en parle gagne 1 🌿.</li>' +
      '<li><b>Case Chance</b> 🍀 : une carte surprise, bonne ou moins bonne.</li>' +
      '<li><b>Après chaque question</b>, lisez le « à retenir » : c\'est là que se passe l\'apprentissage.</li>' +
      '<li><b>Fin :</b> la première équipe arrivée gagne, et celle qui a le plus de feuilles reçoit aussi un prix. Un bilan des points à retenir est affiché.</li>' +
      '</ol>' +
      '<p class="aide">Les contenus sont des repères généraux. En cas de doute, les protocoles de votre établissement et l\'avis des professionnels de santé prévalent.</p>' +
      '<div class="pied"><button class="bt" type="button" data-ok="1">Compris</button></div>');
  });
  btnFin.addEventListener('click', function () {
    if (occupe || !etat) return;
    if (window.confirm('Terminer la partie maintenant et afficher le bilan ?')) {
      etat.fini = true; sauver(); ecranBilan();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !voile.hidden && modale.querySelector('[data-ok]') && !modale.querySelector('.opt')) {
      modale.querySelector('[data-ok]').click();
    }
  });

  /* ───────── Démarrage ───────── */
  var partie = charger();
  if (partie && partie.fini) { etat = partie; ecranBilan(); }
  else ecranAccueil();
})();
