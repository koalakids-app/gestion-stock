// ============================================================================
// js/branding.js
// Applique le branding (couleurs, logo, nom) de l'organisation connectée sur
// les pages internes (direction/référent·e), à partir de la table
// `organisations`. La policy RLS organisations_select (org_id = kk_mon_org())
// fait qu'un simple select sans filtre renvoie toujours la bonne ligne — pas
// besoin de connaître l'org_id côté client.
//
// Nécessite un client Supabase `sb` déjà authentifié : appeler
// KKBranding.applyBranding(sb) une fois la session établie, pas avant.
//
// Ne couvre pas les pages publiques sans session (famille.html,
// signature.html, signature-contrat.html, devis.html, pieces-employe.html) :
// celles-ci passent par une edge function en service_role, qui devrait
// renvoyer elle-même les champs de branding (comme dossier-famille le fait
// déjà pour la liste des crèches) — pas encore fait.
// ============================================================================

(function (window) {
  function clampByte(n) { return Math.max(0, Math.min(255, Math.round(n))); }

  function mix(hex, withHex, ratio) {
    hex = String(hex || '').replace('#', '');
    withHex = String(withHex || '').replace('#', '');
    if (hex.length !== 6 || withHex.length !== 6) return '#' + hex;
    const h = parseInt(hex, 16), w = parseInt(withHex, 16);
    const hr = (h >> 16) & 255, hg = (h >> 8) & 255, hb = h & 255;
    const wr = (w >> 16) & 255, wg = (w >> 8) & 255, wb = w & 255;
    const r = clampByte(hr * (1 - ratio) + wr * ratio);
    const g = clampByte(hg * (1 - ratio) + wg * ratio);
    const b = clampByte(hb * (1 - ratio) + wb * ratio);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // Teinte claire (fonds de badge, surlignage) et foncée (hover, bordure)
  // dérivées de la couleur de base — mêmes proportions que les teintes
  // Koala Kids historiques (ex. #4A3F9F -> #EEECFA, #F47920 -> #C95F0A).
  function lighten(hex) { return mix(hex, '#ffffff', 0.90); }
  function darken(hex) { return mix(hex, '#000000', 0.18); }

  const DEFAUT = {
    primaryVars: ['--violet', '--koala'],
    secondaryVars: ['--orange'],
    primaryLightVars: ['--violet-l', '--koala-light'],
    secondaryLightVars: ['--orange-l', '--orange-light'],
    primaryDarkVars: ['--koala-dark'],
    secondaryDarkVars: ['--orange-dark'],
  };

  // --- Logo dans les PDF générés côté navigateur (jsPDF) -------------------
  // jsPDF veut une image décodée (PNG/JPEG) : on charge le logo de
  // l'organisation, on le redessine dans un canvas (ce qui convertit aussi
  // le SVG/WebP) et on garde le résultat. Tant qu'il n'est pas prêt, ou si
  // l'organisation n'a pas de logo, addLogo() retombe sur le logo Koala Kids
  // fourni par la page appelante — un PDF ne part donc jamais sans logo.
  let pdfLogoData = null; // { data: 'data:image/png;base64,…', ratio: largeur/hauteur }

  function chargerLogoPdf(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const h = Math.min(img.naturalHeight || 200, 300);
          const w = Math.round(h * ((img.naturalWidth || 1) / (img.naturalHeight || 1)));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          pdfLogoData = { data: c.toDataURL('image/png'), ratio: w / h };
        } catch (e) { console.warn('[branding] logo PDF illisible', e); }
        resolve(pdfLogoData);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // Dessine le logo dans la boîte (x, y, w, h) en conservant ses proportions.
  // align 'right' : collé au bord droit de la boîte (logos en haut à droite).
  function addLogo(doc, fallback, x, y, w, h, align) {
    if (!pdfLogoData) return doc.addImage(fallback, 'PNG', x, y, w, h);
    let lw = h * pdfLogoData.ratio, lh = h;
    if (lw > w) { lw = w; lh = w / pdfLogoData.ratio; }
    const lx = align === 'right' ? x + w - lw : x;
    return doc.addImage(pdfLogoData.data, 'PNG', lx, y, lw, lh);
  }

  async function applyBranding(sb, opts) {
    const cfg = Object.assign({}, DEFAUT, opts || {});
    try {
      const { data: org, error } = await sb
        .from('organisations')
        .select('nom,couleur_primaire,couleur_secondaire,logo_url')
        .maybeSingle();
      if (error || !org) return null;

      const root = document.documentElement.style;
      if (org.couleur_primaire) {
        cfg.primaryVars.forEach(v => root.setProperty(v, org.couleur_primaire));
        cfg.primaryLightVars.forEach(v => root.setProperty(v, lighten(org.couleur_primaire)));
        cfg.primaryDarkVars.forEach(v => root.setProperty(v, darken(org.couleur_primaire)));
      }
      if (org.couleur_secondaire) {
        cfg.secondaryVars.forEach(v => root.setProperty(v, org.couleur_secondaire));
        cfg.secondaryLightVars.forEach(v => root.setProperty(v, lighten(org.couleur_secondaire)));
        cfg.secondaryDarkVars.forEach(v => root.setProperty(v, darken(org.couleur_secondaire)));
      }
      if (org.nom) {
        document.title = document.title.replace(/Koala ?Kids/i, org.nom);
        document.querySelectorAll('[data-branding-nom]').forEach(el => {
          el.textContent = el.textContent.replace(/Koala ?Kids/i, org.nom);
        });
      }
      if (org.logo_url) {
        document.querySelectorAll('[data-branding-logo]').forEach(el => {
          el.src = org.logo_url;
        });
        chargerLogoPdf(org.logo_url);
      }
      window.KK_ORG = org;
      return org;
    } catch (e) {
      console.warn('[branding] organisation introuvable, repli sur les valeurs par défaut', e);
      return null;
    }
  }

  window.KKBranding = { applyBranding, addLogo, lighten, darken };
})(window);
