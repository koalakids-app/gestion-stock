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

  let org = null as null | { nom: string; app_url: string; couleur_secondaire: string | null };
  const origine = origineDe(req);
  if (origine) {
    // app_url est stockée sans slash final ; on compare origine à origine,
    // jamais de préfixe partiel (éviterait une confusion entre deux domaines
    // dont l'un serait préfixe de l'autre).
    const { data } = await sb.from('organisations')
      .select('nom,app_url,couleur_secondaire')
      .eq('app_url', origine.replace(/\/+$/, ''))
      .maybeSingle();
    if (data) org = data;
  }
  const nom = org?.nom || DEFAUT.nom;
  const appUrl = (org?.app_url || DEFAUT.app_url).replace(/\/+$/, '');
  const themeColor = org?.couleur_secondaire || DEFAUT.couleur_secondaire;

  const manifest = {
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
      { src: `${appUrl}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: `${appUrl}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
    shortcuts: [
      { name: 'Demandes', short_name: 'Demandes', description: 'Demandes, présences, planning', url: `${appUrl}/demandes.html` },
      { name: 'Stock', short_name: 'Stock', description: 'Inventaire et commandes', url: `${appUrl}/stock.html` },
      { name: 'Documents', short_name: 'Documents', description: 'Documents et signatures', url: `${appUrl}/documents.html` },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { ...cors, 'Content-Type': 'application/manifest+json' },
  });
});
