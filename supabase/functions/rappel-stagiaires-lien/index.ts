// ============================================================================
// supabase/functions/rappel-stagiaires-lien/index.ts
// Koala Kids — octobre 2026  ·  Module Stagiaires et alternants
//
// Prévient quand une fiche passe en « lien à envoyer » : le stage commence dans
// 14 jours ou moins (ou a commencé) et il n'y a pas de lien des documents
// utilisable — pas de lien, lien expiré, ou lien encore à l'étape « entretien »
// (le bouton « Ouvrir les documents » n'a pas été cliqué). Même règle que
// stgLienAEnvoyer (js/stagiaires/01-chargement.js) : à garder alignées.
//
// Destinataires : la direction de l'organisation et les référentes de la crèche
// de la stagiaire. Une seule notification par fiche (stagiaires.lien_rappel_le,
// remis à nul quand on crée ou renouvelle le lien). notify-push retient le
// message pendant les heures de silence. « Ma journée » affiche de toute façon
// la liste (section « Stagiaires — liens à envoyer »), sans dépendre du push.
//
// Déclenchée chaque jour ouvré par GitHub Actions
// (.github/workflows/rappel-stagiaires-lien.yml) avec le même secret partagé que
// relances-devis-auto (RELANCE_TRIGGER_SECRET, en-tête x-relance-secret).
//
// Essai à blanc : POST {"dry_run": true} liste sans notifier ni écrire.
//
// DÉPLOIEMENT — appelée par GitHub Actions, sans JWT :
//   supabase functions deploy rappel-stagiaires-lien --no-verify-jwt
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const AVANT_JOURS = 14;   // STG_LIEN_AVANT côté page
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const dfr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const secret = Deno.env.get('RELANCE_TRIGGER_SECRET');
  if (!secret) {
    console.error('[rappel-stagiaires-lien] RELANCE_TRIGGER_SECRET absente');
    return json({ erreur: 'Fonction non configurée' }, 500);
  }
  if (req.headers.get('x-relance-secret') !== secret) return json({ erreur: 'Non autorisé' }, 401);

  let dryRun = false;
  try { dryRun = (await req.json())?.dry_run === true; } catch { /* corps vide */ }

  const { data: fiches, error } = await sb.from('stagiaires')
    .select('id,prenom,nom,creche_id,statut,date_debut,token,token_expire_le,lien_etape,lien_rappel_le')
    .not('date_debut', 'is', null)
    .not('statut', 'in', '(demande,termine,refuse,annule)')
    .is('lien_rappel_le', null);
  if (error) {
    console.error('[rappel-stagiaires-lien] lecture', error);
    return json({ erreur: 'Lecture impossible' }, 500);
  }

  const maintenant = Date.now();
  const dues = (fiches ?? []).filter(s => {
    const debut = new Date(String(s.date_debut).slice(0, 10) + 'T12:00:00').getTime();
    if (debut - maintenant > AVANT_JOURS * 86400000) return false;
    if (!s.token || !s.token_expire_le) return true;
    if (new Date(s.token_expire_le).getTime() < maintenant) return true;
    return s.lien_etape === 'entretien';
  });

  const { data: creches } = await sb.from('creches').select('id,name,org_id');
  const crecheDe = new Map((creches ?? []).map(c => [String(c.id), c]));
  const { data: refs } = await sb.from('referents').select('id,role,creche_id,org_id');

  const bilan = { dues: dues.length, notifies: 0, sans_destinataire: 0, echecs: 0, liste: [] as string[] };
  for (const s of dues) {
    const cr = s.creche_id ? crecheDe.get(String(s.creche_id)) : null;
    const nom = [s.prenom, s.nom].filter(Boolean).join(' ') || 'Une stagiaire';
    bilan.liste.push(`${nom}${cr ? ' — ' + cr.name : ''} (début ${s.date_debut})`);
    if (dryRun) continue;

    // Direction de l'organisation (ou de toutes si la crèche est inconnue) + référentes de la crèche.
    const ids = (refs ?? []).filter(r =>
      (r.role === 'direction' && (!cr || r.org_id === cr.org_id)) ||
      (s.creche_id && String(r.creche_id) === String(s.creche_id))
    ).map(r => r.id);
    if (!ids.length) { bilan.sans_destinataire++; continue; }

    const r = await fetch(`${SB_URL}/functions/v1/notify-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
      body: JSON.stringify({
        referent_ids: [...new Set(ids)],
        title: 'Lien à envoyer à une stagiaire',
        body: `${nom}${cr ? ' (' + cr.name + ')' : ''} : le stage commence le ${dfr(String(s.date_debut).slice(0, 10))}. `
          + `Envoyez-lui le lien des documents.`,
        url: './demandes.html',
        tag: `lien-stagiaire-${s.id}`,
      }),
    });
    if (!r.ok) { bilan.echecs++; console.error('[rappel-stagiaires-lien] notify-push', s.id, r.status); continue; }
    await sb.from('stagiaires').update({ lien_rappel_le: new Date().toISOString() }).eq('id', s.id);
    bilan.notifies++;
  }
  return json({ dry_run: dryRun, ...bilan });
});
