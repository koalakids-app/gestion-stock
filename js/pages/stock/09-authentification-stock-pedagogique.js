
// ─── AUTHENTIFICATION (stock pedagogique) ────────────────────────────────
// Roles autorises : direction, referent, employe. Les comptes kiosque sont refuses.
const SK_ROLES_OK = ['direction', 'referent', 'employe'];

// Correspondance UUID -> nom de creche. Les noms doivent rester identiques
// aux libelles des badges de la sidebar (filterCreche les compare en texte).
// Rempli par loadCrecheUI() une fois connecté.
let SK_CRECHE_NAMES = {};

// creches.name porte la raison sociale complète ("Koalakids Toulon Brunet") ;
// les articles/commandes déjà en base référencent le libellé court
// ("Brunet"). On le dérive en retirant les préfixes d'enseigne/ville — ce qui
// reproduit exactement les libellés historiques Koala Kids. Repli sur le nom
// complet si une organisation ne suit pas ce schéma.
function shortCrecheName(nom) {
  return String(nom || '').replace(/^Koalakids\s+/i, '').replace(/^Toulon\s+/i, '').trim() || nom;
}

/** Reconstruit les badges de la barre latérale à partir de CRECHES/CRECHE_COLORS.
 *  L'index i doit rester aligné avec les id="cnt-i" que updateCounts() cible. */
function renderCrecheBadges() {
  const list = document.getElementById('creche-badges-list');
  if (!list) return;
  list.innerHTML = CRECHES.map((nom, i) => `
    <div class="creche-badge" onclick="filterCreche('${nom.replace(/'/g, "\\'")}', this)">
      <span class="creche-dot" style="background:${CRECHE_COLORS[nom] || '#888'}"></span>
      <span class="creche-name">${nom}</span>
      <span class="creche-count" id="cnt-${i}">0</span>
    </div>`).join('');
}

/** Charge les crèches de l'organisation connectée (RLS: creches_select filtre
 *  déjà par org_id = kk_mon_org()) et reconstruit CRECHES, CRECHE_COLORS,
 *  SK_CRECHE_NAMES, les badges de la sidebar et les <select> de structure. */
async function loadCrecheUI() {
  try {
    const rows = await sbGet('creches', 'select=id,name');
    if (!Array.isArray(rows) || !rows.length) return;
    CRECHES = rows.map(r => shortCrecheName(r.name));
    CRECHE_COLORS = {};
    SK_CRECHE_NAMES = {};
    rows.forEach((r, i) => {
      const nom = shortCrecheName(r.name);
      CRECHE_COLORS[nom] = CRECHE_PALETTE[i % CRECHE_PALETTE.length];
      SK_CRECHE_NAMES[r.id] = nom;
    });
    renderCrecheBadges();
    const optionsHtml = CRECHES.map(n => `<option>${n}</option>`).join('');
    const fCreche = document.getElementById('f-creche');
    if (fCreche) {
      fCreche.innerHTML = '<option value="" id="f-creche-vide" hidden>— Aucune —</option>' + optionsHtml;
      majChampStructure();
    }
    const cCreche = document.getElementById('c-creche-select');
    if (cCreche) cCreche.innerHTML = optionsHtml;
  } catch (e) {
    console.warn('[Stock] loadCrecheUI — repli sur la liste par défaut :', e);
  }
}

function majChampStructure() {
  // Entretien / Cuisine : la structure est facultative (« Aucune » = ma structure).
  const facultatif = CATS_SANS_CRECHE.includes(document.getElementById('f-cat').value);
  const lbl = document.getElementById('f-creche-label');
  if (lbl) lbl.textContent = facultatif ? 'Structure (facultatif)' : 'Structure *';
  const vide = document.getElementById('f-creche-vide');
  if (vide) vide.hidden = !facultatif;
}

// Non nul uniquement pour les employees : verrouille la vue sur leur structure.
let SK_LOCKED_CRECHE = null;

// Non nul pour les referentes : lecture des 6 crèches, ecriture sur la sienne
// uniquement. La direction reste nulle (aucune restriction).
let SK_WRITE_CRECHE = null;

// Verifie qu'une ecriture est permise sur la structure visee.
// Retourne true si l'action peut se poursuivre.
function skCanWrite(crecheNom) {
  if (!SK_WRITE_CRECHE) return true;
  if (crecheNom === SK_WRITE_CRECHE) return true;
  if (typeof showNotif === 'function') {
    showNotif('\u26A0 Modification reservee a ' + SK_WRITE_CRECHE);
  }
  return false;
}
let SK_USER = null, SK_PROFILE = null, SK_REFRESH = null, SK_REFRESH_TIMER = null;

function skTogglePwd(btn) {
  const i = document.getElementById('sk-login-pwd');
  i.type = (i.type === 'password') ? 'text' : 'password';
}

function skLoginError(msg) {
  const e = document.getElementById('sk-login-err');
  e.textContent = msg; e.style.display = 'block';
  const b = document.getElementById('sk-login-btn');
  b.disabled = false; b.textContent = 'Se connecter';
}

async function skDoLogin() {
  const email = document.getElementById('sk-login-email').value.trim();
  const pwd = document.getElementById('sk-login-pwd').value;
  const btn = document.getElementById('sk-login-btn');
  document.getElementById('sk-login-err').style.display = 'none';
  if (!email || !pwd) { skLoginError('Email et mot de passe requis.'); return; }
  btn.disabled = true; btn.textContent = 'Connexion...';

  let session;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email, password: pwd }),
    });
    session = await r.json();
    if (!r.ok || !session.access_token) {
      const m = (session && (session.error_description || session.msg || session.message)) || '';
      skLoginError(m.toLowerCase().includes('confirm')
        ? 'Compte non confirme — contactez la direction.'
        : 'Identifiants incorrects.');
      return;
    }
  } catch (e) {
    skLoginError('Erreur reseau. Reessayez.');
    return;
  }

  // Verification du role avant d'ouvrir l'application
  try {
    const uid = session.user && session.user.id;
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/referents?user_id=eq.${uid}&select=id,name,role,creche_id`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + session.access_token } }
    );
    const rows = await pr.json();
    SK_PROFILE = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!SK_PROFILE || SK_ROLES_OK.indexOf(SK_PROFILE.role) === -1) {
      skLoginError('Acces non autorise pour ce compte.');
      return;
    }
  } catch (e) {
    skLoginError('Profil introuvable. Contactez la direction.');
    return;
  }

  SK_TOKEN = session.access_token;
  SK_REFRESH = session.refresh_token || null;
  SK_USER = session.user;
  skScheduleRefresh(session.expires_in);

  const ov = document.getElementById('sk-login-overlay');
  if (ov) ov.remove();
  document.body.classList.remove('sk-locked');

  const nameEl = document.getElementById('sk-user-name');
  if (nameEl) nameEl.textContent = (SK_PROFILE && SK_PROFILE.name) || (SK_USER && SK_USER.email) || '';

  await loadCrecheUI();
  skApplyCrecheLock();
  skRestrictCrecheSelects();
  skBootApp();
  loadLogo();
}

// ── Verrouillage sur une seule structure (role employe) ──────────────────
// Direction et referentes gardent la vue sur les 6 crèches. Les employees
// sont limitees a leur structure pour eviter les erreurs de saisie.
function skApplyCrecheLock() {
  if (!SK_PROFILE) return;

  // Referente : lecture globale, ecriture limitee a sa structure.
  if (SK_PROFILE.role === 'referent') {
    const n = SK_CRECHE_NAMES[SK_PROFILE.creche_id];
    if (n) SK_WRITE_CRECHE = n;
    else console.warn('[Auth] creche_id inconnu pour la referente :', SK_PROFILE.creche_id);
    return;
  }

  if (SK_PROFILE.role !== 'employe') return;
  const nom = SK_CRECHE_NAMES[SK_PROFILE.creche_id];
  if (!nom) {
    console.warn('[Auth] creche_id inconnu, verrouillage ignore :', SK_PROFILE.creche_id);
    return;
  }
  SK_LOCKED_CRECHE = nom;
  SK_WRITE_CRECHE = nom;
  currentCreche = nom;

  // Ne laisser que le badge de sa structure, marque actif.
  document.querySelectorAll('.creche-badge').forEach(b => {
    const el = b.querySelector('.creche-name');
    const label = el ? el.textContent.trim() : '';
    const onclick = b.getAttribute('onclick') || '';
    const isAll = onclick.indexOf("'all'") !== -1;
    if (isAll || (label && label !== nom)) {
      b.style.display = 'none';
      b.classList.remove('active');
    } else if (label === nom) {
      b.classList.add('active');
    }
  });

  const nameEl = document.getElementById('sk-user-name');
  if (nameEl) nameEl.textContent += ' — ' + nom;
}

// Restreint les listes deroulantes de structure aux seules crèches ou
// l'utilisateur peut ecrire, pour eviter un refus apres coup a l'enregistrement.
function skRestrictCrecheSelects() {
  if (!SK_WRITE_CRECHE) return;
  ['f-creche', 'c-creche-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    Array.from(sel.options).forEach(o => {
      if (o.textContent.trim() !== SK_WRITE_CRECHE) o.remove();
    });
    sel.value = SK_WRITE_CRECHE;
  });
}

// ── Rafraichissement du jeton ────────────────────────────────────────────
// Le jeton Supabase expire par defaut au bout d'une heure. On le renouvelle
// 60 s avant l'echeance pour eviter les echecs d'ecriture silencieux.
function skScheduleRefresh(expiresIn) {
  const delay = Math.max(30, (Number(expiresIn) || 3600) - 60) * 1000;
  if (SK_REFRESH_TIMER) clearTimeout(SK_REFRESH_TIMER);
  SK_REFRESH_TIMER = setTimeout(skRefreshToken, delay);
}

async function skRefreshToken() {
  if (!SK_REFRESH) return;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ refresh_token: SK_REFRESH }),
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) throw new Error('refresh refuse');
    SK_TOKEN = d.access_token;
    SK_REFRESH = d.refresh_token || SK_REFRESH;
    skScheduleRefresh(d.expires_in);
  } catch (e) {
    console.warn('[Auth] Rafraichissement impossible', e);
    setIndicator('Session expiree — rechargez la page', 'var(--red)');
  }
}

// Filet de securite : au retour sur l'onglet apres une longue mise en veille,
// le timer peut avoir ete gele par le navigateur (frequent sur Android).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && SK_TOKEN) skRefreshToken();
});

async function skLogout() {
  if (!confirm('Se deconnecter ?')) return;
  try {
    await fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SK_TOKEN },
    });
  } catch (e) {}
  SK_TOKEN = null; SK_REFRESH = null; SK_USER = null; SK_PROFILE = null;
  if (SK_REFRESH_TIMER) clearTimeout(SK_REFRESH_TIMER);
  window.location.reload();
}

// Verrouillage immediat : aucune donnee n'est chargee avant connexion.
document.body.classList.add('sk-locked');

document.addEventListener('DOMContentLoaded', () => {
  loadLogo();
  const input = document.getElementById('logo-input');
  if (input) input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) uploadLogo(file);
  });
});
  
