
// ─── STATE ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// SUPABASE + AUTH + CHARGEMENT DES FICHES
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL="https://juyrceadazrovlitxceb.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1eXJjZWFkYXpyb3ZsaXR4Y2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjcyMDIsImV4cCI6MjA5NTQwMzIwMn0.yTEoRjhJFm3qj5oY2tLIcCXOWHHbU3rxWoIn47QKmug";
const sbReglo = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null, currentProfile = null, userRole = null, isDirection = false;
// FICHES : source affichée. Repli sur DATA (en dur) si Supabase indisponible.
let FICHES = DATA;

// Convertit une ligne Supabase (snake_case, jsonb) vers le format interne des fiches
function rowToFiche(r){
  return {
    id: r.id,
    category: r.category,
    tags: r.tags || [],
    caduque: !!r.caduque,
    isNew: !!r.is_new,
    title: r.title,
    ref: r.ref,
    summary: r.summary,
    source: r.source,
    date: r.date,
    update2025: r.update2025 || null,
    detail: r.detail,
    verifiedAt: r.verified_at || null
  };
}

async function loadFichesFromSupabase(){
  try{
    const { data, error } = await sbReglo
      .from('reglementation_fiches')
      .select('*')
      .order('id', { ascending: true });
    if(error) throw error;
    if(data && data.length){
      FICHES = data.map(rowToFiche);
    }else{
      FICHES = DATA; // table vide -> secours
    }
  }catch(e){
    console.warn('Chargement Supabase impossible, repli sur DATA en dur :', e);
    FICHES = DATA;
  }
}

async function regloLogin(){
  const email = document.getElementById('reglo-email').value.trim();
  const pwd   = document.getElementById('reglo-pwd').value;
  const btn   = document.getElementById('reglo-login-btn');
  const err   = document.getElementById('reglo-login-err');
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Connexion…';
  try{
    const { data, error } = await sbReglo.auth.signInWithPassword({ email, password: pwd });
    if(error) throw error;
    currentUser = data.user;
    const { data: prof } = await sbReglo.from('referents').select('*').eq('user_id', currentUser.id).maybeSingle();
    currentProfile = prof || null;
    userRole = currentProfile?.role || null;
    isDirection = userRole === 'direction';
    // MFA obligatoire à la connexion, même portail que demandes.html/documents.html.
    await regloMfaGateCheckAndProceed();
  }catch(e){
    err.textContent = 'Email ou mot de passe incorrect.';
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
}

// --- Portail MFA obligatoire ---
function regloShowLoginForm(msg){
  document.getElementById('reglo-app').style.display = 'none';
  document.getElementById('reglo-login-wrap').style.display = 'flex';
  document.getElementById('reglo-li-form-box').style.display = 'block';
  document.getElementById('reglo-mfa-gate-box').style.display = 'none';
  const err = document.getElementById('reglo-login-err');
  if(msg){ err.textContent = msg; err.style.display = 'block'; }
}
function regloMfaSwitchView(id){
  document.getElementById('reglo-app').style.display = 'none';
  document.getElementById('reglo-login-wrap').style.display = 'flex';
  document.getElementById('reglo-li-form-box').style.display = 'none';
  document.getElementById('reglo-mfa-gate-box').style.display = 'block';
  ['reglo-mfa-challenge-view','reglo-mfa-enroll-view'].forEach(v=>{
    document.getElementById(v).style.display = (v===id ? 'block' : 'none');
  });
}
async function regloMfaGateCheckAndProceed(){
  try{
    const { data, error } = await sbReglo.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error) throw error;
    if(data.currentLevel === 'aal2'){ await enterApp(); return; }
    if(data.nextLevel === 'aal2'){ regloMfaShowChallenge(); return; }
    await regloMfaShowEnroll();
  }catch(e){
    console.error('[MFA Gate]', e);
    try{ await sbReglo.auth.signOut(); }catch(_e){}
    regloShowLoginForm('Erreur de vérification de la double authentification. Réessayez.');
  }
}
function regloMfaShowChallenge(){
  document.getElementById('reglo-mfa-code').value = '';
  document.getElementById('reglo-mfa-challenge-err').style.display = 'none';
  regloMfaSwitchView('reglo-mfa-challenge-view');
  setTimeout(()=>{ const el = document.getElementById('reglo-mfa-code'); if(el) el.focus(); }, 100);
}
let regloMfaFactorId = null;
async function regloMfaShowEnroll(){
  regloMfaSwitchView('reglo-mfa-enroll-view');
  const err = document.getElementById('reglo-mfa-enroll-err');
  err.style.display = 'none';
  try{
    const { data: existing, error: listError } = await sbReglo.auth.mfa.listFactors();
    if(listError) throw listError;
    const stale = (existing.all || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified');
    for(const f of stale){
      try{ await sbReglo.auth.mfa.unenroll({ factorId: f.id }); }catch(e){ console.warn('Nettoyage facteur MFA périmé échoué :', e.message); }
    }
    const { data, error } = await sbReglo.auth.mfa.enroll({ factorType: 'totp' });
    if(error) throw error;
    regloMfaFactorId = data.id;
    const qrEl = document.getElementById('reglo-mfa-qr');
    qrEl.innerHTML = '';
    const qr = data.totp.qr_code || '';
    const svgMatch = qr.match(/<svg[\s\S]*<\/svg>/i);
    if(svgMatch){
      qrEl.innerHTML = svgMatch[0];
      const svg = qrEl.querySelector('svg');
      if(svg){ svg.style.width = '180px'; svg.style.height = '180px'; }
    }else{
      const img = document.createElement('img');
      img.alt = 'QR code MFA';
      img.style.cssText = 'display:block;width:180px;height:180px;object-fit:contain';
      img.src = qr;
      qrEl.appendChild(img);
    }
    document.getElementById('reglo-mfa-secret').textContent = data.totp.secret;
    document.getElementById('reglo-mfa-enroll-code').value = '';
  }catch(e){
    console.error('[MFA Gate enroll]', e);
    err.textContent = "Erreur lors de la préparation de l'enrôlement : " + e.message;
    err.style.display = 'block';
  }
}
async function regloMfaVerifyChallenge(){
  const code = document.getElementById('reglo-mfa-code').value.trim();
  const err = document.getElementById('reglo-mfa-challenge-err');
  err.style.display = 'none';
  if(!/^\d{6}$/.test(code)){ err.textContent = 'Le code doit contenir 6 chiffres.'; err.style.display = 'block'; return; }
  try{
    const { data: factors, error: listError } = await sbReglo.auth.mfa.listFactors();
    if(listError) throw listError;
    const verified = (factors.totp || [])[0];
    if(!verified) throw new Error('Aucun facteur MFA vérifié trouvé sur ce compte.');
    const { data: ch, error: chErr } = await sbReglo.auth.mfa.challenge({ factorId: verified.id });
    if(chErr) throw chErr;
    const { error: vErr } = await sbReglo.auth.mfa.verify({ factorId: verified.id, challengeId: ch.id, code });
    if(vErr) throw vErr;
    await enterApp();
  }catch(e){
    err.textContent = 'Code invalide ou expiré : ' + e.message;
    err.style.display = 'block';
  }
}
async function regloMfaConfirmEnroll(){
  const code = document.getElementById('reglo-mfa-enroll-code').value.trim();
  const err = document.getElementById('reglo-mfa-enroll-err');
  err.style.display = 'none';
  if(!/^\d{6}$/.test(code)){ err.textContent = 'Le code doit contenir 6 chiffres.'; err.style.display = 'block'; return; }
  if(!regloMfaFactorId){ err.textContent = "Session d'enrôlement expirée, réessayez."; err.style.display = 'block'; return; }
  try{
    const { data: ch, error: chErr } = await sbReglo.auth.mfa.challenge({ factorId: regloMfaFactorId });
    if(chErr) throw chErr;
    const { error: vErr } = await sbReglo.auth.mfa.verify({ factorId: regloMfaFactorId, challengeId: ch.id, code });
    if(vErr) throw vErr;
    regloMfaFactorId = null;
    await enterApp();
  }catch(e){
    err.textContent = 'Code invalide ou expiré : ' + e.message;
    err.style.display = 'block';
  }
}
async function regloMfaCancel(){
  if(regloMfaFactorId){
    try{ await sbReglo.auth.mfa.unenroll({ factorId: regloMfaFactorId }); }catch(e){ console.warn('Nettoyage annulation MFA gate échoué :', e.message); }
  }
  regloMfaFactorId = null;
  try{ await sbReglo.auth.signOut(); }catch(e){}
  currentUser = null; currentProfile = null; userRole = null; isDirection = false;
  regloShowLoginForm();
}

function regloCanEdit(){
  return userRole === 'direction';
}

function regloApplyRoleUI(){
  const addBtn = document.getElementById('reglo-add-btn');
  if(addBtn) addBtn.style.display = regloCanEdit() ? 'inline-flex' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// ÉTAPE 3c : édition des fiches (direction only) — voie B semi-manuelle
// ═══════════════════════════════════════════════════════════════
let reditMode = null;      // 'add' | 'verify'
let reditTargetId = null;  // id de la fiche vérifiée
let reditParsed = null;    // fiche JSON analysée, prête à enregistrer

const CAT_KEYS = ['agrement','encadrement','financement','locaux','sante','gestion'];

// Gabarit de fiche attendu, décrit pour le prompt
const FICHE_SCHEMA_TXT = [
  '{',
  '  "id": <nombre>,                     // conserver l\'id existant en vérification',
  '  "category": "<une de: '+CAT_KEYS.join(' | ')+'>",',
  '  "tags": ["decret2025"],             // optionnel, [] sinon',
  '  "caduque": <true|false>,            // true si la règle est modifiée/supprimée par le décret 2025-304',
  '  "isNew": <true|false>,              // true si nouveauté du décret 2025',
  '  "title": "<titre court>",',
  '  "ref": "<références d\'articles>",',
  '  "summary": "<résumé 1-2 phrases>",',
  '  "source": "<source principale>",',
  '  "date": "<libellé de date, ex: Avril 2025>",',
  '  "update2025": [ { "date": "<...>", "text": "<...>" } ],  // ou null',
  '  "detail": {',
  '    "description": "<paragraphe>",',
  '    "points": ["<point 1>", "<point 2>"],',
  '    "details": [ { "label": "<libellé>", "value": "<valeur>" } ],',
  '    "alert": "<point d\'attention>",',
  '    "sources": ["<source 1>", "<source 2>"]',
  '  }',
  '}'
].join('\n');

function buildAddPrompt(subject){
  return [
    'Tu es Lia, assistante réglementaire des micro-crèches (réseau Koala Kids).',
    'Recherche sur le web la réglementation FRANÇAISE à jour (au '+new Date().toLocaleDateString('fr-FR')+') concernant le sujet suivant :',
    '',
    '  « '+subject+' »',
    '',
    'Tiens compte du décret n°2025-304 du 1er avril 2025 et de son calendrier d\'application.',
    'Rédige UNE fiche réglementaire complète pour ma base, en respectant EXACTEMENT ce format JSON (et rien d\'autre en dehors du bloc) :',
    '',
    FICHE_SCHEMA_TXT,
    '',
    'Consignes : id = null (je l\'attribuerai). Sois factuel et précis sur le code cité : les EAJE (micro-crèches) relèvent des articles L.2324-1 à L.2324-4 et R.2324-16 à R.2324-48 du CODE DE LA SANTÉ PUBLIQUE (CSP), et non du CASF ; le CASF traite la petite enfance à ses articles L.214-1 et suivants. Vérifie le code avant de citer. Réponds UNIQUEMENT par le bloc JSON, sans commentaire avant ni après.'
  ].join('\n');
}

function buildVerifyPrompt(fiche){
  const clean = {
    id: fiche.id, category: fiche.category, tags: fiche.tags||[],
    caduque: !!fiche.caduque, isNew: !!fiche.isNew, title: fiche.title,
    ref: fiche.ref, summary: fiche.summary, source: fiche.source, date: fiche.date,
    update2025: fiche.update2025||null, detail: fiche.detail
  };
  return [
    'Tu es Lia, assistante réglementaire des micro-crèches (réseau Koala Kids).',
    'Voici une fiche réglementaire existante de ma base. Vérifie sur le web si elle est TOUJOURS EXACTE et À JOUR au '+new Date().toLocaleDateString('fr-FR')+', en tenant compte du décret n°2025-304 du 1er avril 2025.',
    '',
    'Fiche actuelle :',
    '```json',
    JSON.stringify(clean, null, 2),
    '```',
    '',
    'Si la fiche est toujours correcte : renvoie-la à l\'identique.',
    'Si elle doit être corrigée : renvoie la version CORRIGÉE en conservant le même "id" ('+fiche.id+') et le même format JSON.',
    'Réponds UNIQUEMENT par le bloc JSON de la fiche (corrigée ou identique), sans commentaire avant ni après.'
  ].join('\n');
}

// ── Ouverture de la modale ──
function regloAddFiche(){
  if(!regloCanEdit()) return;
  reditMode = 'add'; reditTargetId = null; reditParsed = null;
  document.getElementById('reditTitle').textContent = 'Ajouter une fiche';
  document.getElementById('reditSubjectWrap').style.display = 'block';
  document.getElementById('reditSubject').value = '';
  document.getElementById('reditPrompt').value = '(saisis d\'abord un sujet ci-dessus, le prompt se génère automatiquement)';
  document.getElementById('reditPaste').value = '';
  reditResetPreview();
  reditGoStep(1);
  document.getElementById('reditOverlay').classList.add('open');
  // Génération dynamique du prompt quand on tape le sujet
  const subj = document.getElementById('reditSubject');
  subj.oninput = () => {
    const s = subj.value.trim();
    document.getElementById('reditPrompt').value = s ? buildAddPrompt(s) : '(saisis d\'abord un sujet ci-dessus)';
  };
}

function regloVerifyFiche(id){
  if(!regloCanEdit()) return;
  const fiche = FICHES.find(f => f.id === id);
  if(!fiche) return;
  reditMode = 'verify'; reditTargetId = id; reditParsed = null;
  document.getElementById('reditTitle').textContent = 'Vérifier : ' + fiche.title;
  document.getElementById('reditSubjectWrap').style.display = 'none';
  document.getElementById('reditPrompt').value = buildVerifyPrompt(fiche);
  document.getElementById('reditPaste').value = '';
  reditResetPreview();
  reditGoStep(1);
  document.getElementById('reditOverlay').classList.add('open');
}

function reditClose(){
  document.getElementById('reditOverlay').classList.remove('open');
}
function reditGoStep(n){
  document.getElementById('reditPane1').style.display = n===1 ? 'block' : 'none';
  document.getElementById('reditPane2').style.display = n===2 ? 'block' : 'none';
  document.getElementById('reditStep1').classList.toggle('active', n===1);
  document.getElementById('reditStep2').classList.toggle('active', n===2);
}
function reditResetPreview(){
  document.getElementById('reditPreview').style.display = 'none';
  document.getElementById('reditDiff').innerHTML = '';
  ['reditMsg1','reditMsg2','reditMsg3'].forEach(id=>{const e=document.getElementById(id);e.className='redit-msg';e.textContent='';});
}

function reditCopyPrompt(){
  const txt = document.getElementById('reditPrompt').value;
  const msg = document.getElementById('reditMsg1');
  navigator.clipboard.writeText(txt).then(()=>{
    msg.className='redit-msg ok'; msg.textContent='Prompt copié ✓ — colle-le dans ta conversation Lia.';
  }).catch(()=>{
    msg.className='redit-msg err'; msg.textContent='Copie impossible — sélectionne le texte manuellement.';
  });
}

// ── Analyse du JSON collé ──
function reditAnalyze(){
  const raw = document.getElementById('reditPaste').value.trim();
  const msg = document.getElementById('reditMsg2');
  if(!raw){ msg.className='redit-msg err'; msg.textContent='Colle d\'abord la réponse JSON.'; return; }
  // extraire un bloc JSON même entouré de ```json ... ```
  let jsonTxt = raw;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence) jsonTxt = fence[1].trim();
  else { const s=raw.indexOf('{'), e=raw.lastIndexOf('}'); if(s>=0&&e>s) jsonTxt=raw.slice(s,e+1); }
  let obj;
  try{ obj = JSON.parse(jsonTxt); }
  catch(err){ msg.className='redit-msg err'; msg.textContent='JSON invalide : '+err.message; return; }

  // validations minimales
  const errs = [];
  if(!obj.title) errs.push('title manquant');
  if(!obj.category || !CAT_KEYS.includes(obj.category)) errs.push('category invalide (attendu: '+CAT_KEYS.join(', ')+')');
  if(!obj.detail || typeof obj.detail!=='object') errs.push('detail manquant');
  else{
    if(!Array.isArray(obj.detail.points)) errs.push('detail.points doit être une liste');
    if(!Array.isArray(obj.detail.details)) errs.push('detail.details doit être une liste');
    if(!Array.isArray(obj.detail.sources)) errs.push('detail.sources doit être une liste');
  }
  if(errs.length){ msg.className='redit-msg err'; msg.textContent='Problèmes : '+errs.join(' · '); return; }

  // normaliser
  obj.tags = Array.isArray(obj.tags)?obj.tags:[];
  obj.caduque = !!obj.caduque; obj.isNew = !!obj.isNew;
  obj.update2025 = obj.update2025||null;

  if(reditMode==='verify') obj.id = reditTargetId;         // on force l'id d'origine
  else obj.id = (FICHES.reduce((m,f)=>Math.max(m,f.id),0))+1; // nouvel id

  reditParsed = obj;
  msg.className='redit-msg ok'; msg.textContent='JSON valide ✓';
  reditRenderDiff();
}

// ── Écran avant / après ──
function reditRenderDiff(){
  const box = document.getElementById('reditDiff');
  const label = document.getElementById('reditPreviewLabel');
  const fields = [
    ['title','Titre'],['category','Catégorie'],['ref','Références'],['summary','Résumé'],
    ['source','Source'],['date','Date'],['caduque','Caduque'],['isNew','Nouveau'],
    ['tags','Tags'],['update2025','MàJ 2025'],['detail','Détail']
  ];
  const fmt = v => {
    if(v===null||v===undefined) return '—';
    if(typeof v==='object') return JSON.stringify(v);
    return String(v);
  };
  let rows='';
  if(reditMode==='verify'){
    label.textContent='Avant / après — fiche #'+reditParsed.id;
    const before = FICHES.find(f=>f.id===reditTargetId);
    let anyChange=false;
    fields.forEach(([k,lab])=>{
      const bv=fmt(before[k]), av=fmt(reditParsed[k]);
      const changed = bv!==av;
      if(changed) anyChange=true;
      rows += '<div class="redit-diff-row'+(changed?' changed':'')+'">'
        + '<div class="redit-diff-key">'+lab+'</div><div class="redit-diff-val">'
        + (changed ? '<span class="redit-diff-old">'+escapeHtml(bv)+'</span><span class="redit-diff-new">'+escapeHtml(av)+'</span>'
                   : '<span class="redit-diff-same">'+escapeHtml(av)+'</span>')
        + '</div></div>';
    });
    if(!anyChange){
      label.textContent='Aucun changement — la fiche est identique';
    }
  }else{
    label.textContent='Aperçu de la nouvelle fiche #'+reditParsed.id;
    fields.forEach(([k,lab])=>{
      rows += '<div class="redit-diff-row"><div class="redit-diff-key">'+lab+'</div>'
        + '<div class="redit-diff-val"><span class="redit-diff-same">'+escapeHtml(fmt(reditParsed[k]))+'</span></div></div>';
    });
  }
  box.innerHTML = rows;
  document.getElementById('reditPreview').style.display='block';
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ── Enregistrement Supabase ──
async function reditSave(){
  const msg = document.getElementById('reditMsg3');
  if(!reditParsed){ return; }
  const btn = document.getElementById('reditSaveBtn');
  btn.disabled=true; btn.textContent='Enregistrement…';
  const row = {
    id: reditParsed.id,
    category: reditParsed.category,
    tags: reditParsed.tags,
    caduque: reditParsed.caduque,
    is_new: reditParsed.isNew,
    title: reditParsed.title,
    ref: reditParsed.ref,
    summary: reditParsed.summary,
    source: reditParsed.source,
    date: reditParsed.date,
    update2025: reditParsed.update2025,
    detail: reditParsed.detail,
    verified_at: new Date().toISOString()
  };
  try{
    const { error } = await sbReglo.from('reglementation_fiches').upsert(row, { onConflict:'id' });
    if(error) throw error;
    msg.className='redit-msg ok'; msg.textContent='Fiche enregistrée ✓';
    await loadFichesFromSupabase();
    updateCounts(); renderCards();
    setTimeout(()=>{ reditClose(); }, 900);
  }catch(e){
    msg.className='redit-msg err';
    msg.textContent = (e.message && /policy|permission|rls/i.test(e.message))
      ? 'Enregistrement refusé : action réservée à la direction.'
      : 'Erreur : '+(e.message||e);
  }finally{
    btn.disabled=false; btn.textContent='💾 Enregistrer';
  }
}
