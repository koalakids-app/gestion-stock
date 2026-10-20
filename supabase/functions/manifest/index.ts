// ============================================================================
// supabase/functions/manifest/index.ts
// Koala Kids — septembre 2026
//
// Manifest PWA généré à la demande, par organisation, plutôt qu'un fichier
// manifest.json statique unique. Résout l'organisation à partir de l'origine
// de la requête (Origin, ou Referer à défaut) comparée à organisations.app_url
// — chaque organisation cliente doit donc pointer son app_url vers le domaine
// qu'elle utilise réellement pour l'app (koalakids.fr aujourd'hui).
//
// IMPORTANT : les chemins du manifest (icons, start_url) sont résolus par le
// navigateur relativement à l'URL DU MANIFEST lui-même, pas à celle de la
// page qui le référence. Comme ce manifest est servi depuis Supabase et non
// depuis le domaine de l'app, ces chemins doivent être des URLs absolues
// vers organisations.app_url — sans quoi l'icône et le point d'entrée de
// l'app installée pointeraient vers ce projet Supabase.
//
// Déploiement : supabase functions deploy manifest --no-verify-jwt
// (page publique, appelée avant toute authentification).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Valeurs historiques Koala Kids, en dernier recours si l'organisation ne
// peut pas être résolue (nouvelle installation depuis une origine inconnue,
// panne de la base…) — l'app doit rester installable dans tous les cas.
const DEFAUT = {
  nom: 'Koala Kids',
  app_url: 'https://koalakids.fr',
  couleur_secondaire: '#E8620C',
  logo_url: null as string | null,
};

function origineDe(req: Request): string | null {
  const o = req.headers.get('origin');
  if (o) return o;
  const ref = req.headers.get('referer');
  if (!ref) return null;
  try { return new URL(ref).origin; } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let org = null as null | { id: string; nom: string; app_url: string; couleur_secondaire: string | null; logo_url: string | null };
  const origine = origineDe(req);
  if (origine) {
    // app_url est stockée sans slash final ; on compare origine à origine,
    // jamais de préfixe partiel (éviterait une confusion entre deux domaines
    // dont l'un serait préfixe de l'autre).
    const { data } = await sb.from('organisations')
      .select('id,nom,app_url,couleur_secondaire,logo_url')
      .eq('app_url', origine.replace(/\/+$/, ''))
      .maybeSingle();
    if (data) org = data;
  }
  // ?app=reglementation : manifest du sous-site /Reglementation/, qui est une
  // PWA à part (propre start_url/scope) mais porte la même identité visuelle.
  const sousSite = new URL(req.url).searchParams.get('app') === 'reglementation';
  const nom = org?.nom || DEFAUT.nom;
  // Origine inconnue (www., aperçu, localhost…) : on reste sur l'origine de la
  // page, sinon start_url/shortcuts pointent ailleurs et le navigateur les
  // ignore (« should be same origin as document »).
  // ?base= : dossier racine de l'app tel que la page le connaît (hébergement
  // sous un sous-chemin, ex. github.io/gestion-stock) — accepté seulement s'il
  // reste sur l'origine de la requête.
  const baseDemandee = new URL(req.url).searchParams.get('base') || '';
  const baseOk = origine && (baseDemandee === origine || baseDemandee.startsWith(origine + '/')) ? baseDemandee : null;
  const appUrl = (org?.app_url || baseOk || origine || DEFAUT.app_url).replace(/\/+$/, '');
  const themeColor = org?.couleur_secondaire || DEFAUT.couleur_secondaire;
  const logoUrl = org?.logo_url || DEFAUT.logo_url;

  // Icônes de l'application installée : si l'organisation a un logo, la
  // direction a (re)généré icon-192/512.png à côté (cf. parametres.js). On
  // vérifie qu'ils existent avant de s'y fier — logo posé à la main en base,
  // par exemple — sinon repli sur les icônes statiques Koala Kids.
  const dossierIcones = sousSite ? `${appUrl}/Reglementation/icons` : appUrl;
  let icon192 = sousSite ? `${dossierIcones}/icon-192.png` : `${appUrl}/icon-192.png`;
  let icon512 = sousSite ? `${dossierIcones}/icon-512.png` : `${appUrl}/icon-512.png`;
  if (org?.logo_url && org.id) {
    const base = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/logos-organisations/${org.id}`;
    try {
      const r = await fetch(`${base}/icon-512.png`, { method: 'HEAD' });
      if (r.ok) { icon192 = `${base}/icon-192.png`; icon512 = `${base}/icon-512.png`; }
    } catch { /* repli statique */ }
  }

  const manifest = sousSite ? {
    name: `Réglementation ${nom}`,
    short_name: 'Réglementation',
    description: `Base réglementaire des micro-crèches — ${nom}`,
    start_url: `${appUrl}/Reglementation/index.html`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1A1208',
    theme_color: '#1A1208',
    lang: 'fr',
    categories: ['education', 'business'],
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
    shortcuts: [
      { name: 'Décret 2025-304', short_name: 'Décret 2025', description: 'Voir les fiches du Décret 2025-304', url: `${appUrl}/Reglementation/index.html#decret2025` },
      { name: 'Encadrement & Personnel', short_name: 'Personnel', description: 'Voir les fiches encadrement', url: `${appUrl}/Reglementation/index.html#encadrement` },
    ],
    _icon_192: icon192,
    _icon_512: icon512,
  } : {
    name: `${nom} — Gestion`,
    short_name: nom,
    description: `Portail de gestion de ${nom}`,
    start_url: `${appUrl}/index.html`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: themeColor,
    lang: 'fr',
    categories: ['business', 'productivity'],
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
    shortcuts: [
      { name: 'Demandes', short_name: 'Demandes', description: 'Demandes, présences, planning', url: `${appUrl}/demandes.html` },
      { name: 'Stock', short_name: 'Stock', description: 'Inventaire et commandes', url: `${appUrl}/stock.html` },
      { name: 'Documents', short_name: 'Documents', description: 'Documents et signatures', url: `${appUrl}/documents.html` },
    ],
    // Champ non standard, ignoré par les navigateurs qui lisent ce document
    // comme un manifeste PWA — réutilisé par index.html (page sans session,
    // qui ne peut pas interroger `organisations` directement) pour afficher
    // son propre logo par organisation sans dupliquer la logique de
    // résolution par origine.
    _logo_url: logoUrl,
    _icon_192: icon192,
    _icon_512: icon512,
  };

  return new Response(JSON.stringify(manifest), {
    headers: { ...cors, 'Content-Type': 'application/manifest+json' },
  });
});
