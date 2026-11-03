// ============================================================================
// supabase/functions/rappel-sacs-urgence/index.ts
// Koala Kids — novembre 2026  ·  Documents › Protocole urgence et confinement
//
// Prévient chaque semaine des produits des sacs rouge (urgence) et bleu
// (confinement) périmés ou à moins de 30 jours de leur DLC / DLU. Les dates
// sont saisies dans le protocole (documents_reponses.donnees.pu_json, une
// réponse par crèche, colonne « DLC / DLU » des annexes). Même seuil que
// js/pages/documents/06-protocole-urgence.js (PU_SEUIL) et que la section de
// Ma journée (protocoleUrgenceARenouveler, js/pages/demandes-3.js) : à garder
// alignés.
//
// Destinataires : la direction de l'organisation et les référentes de la crèche.
// Une seule notification par crèche et par passage (résumé des produits), sans
// colonne d'état : tant qu'un produit n'est pas renouvelé, le rappel revient
// chaque semaine. notify-push retient le message pendant les heures de silence.
//
// Déclenchée chaque lundi par GitHub Actions
// (.github/workflows/rappel-sacs-urgence.yml) avec le même secret partagé que
// relances-devis-auto (RELANCE_TRIGGER_SECRET, en-tête x-relance-secret).
//
// Essai à blanc : POST {"dry_run": true} liste sans notifier.
//
// DÉPLOIEMENT — appelée par GitHub Actions, sans JWT :
//   supabase functions deploy rappel-sacs-urgence --no-verify-jwt
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const SEUIL_JOURS = 30;   // PU_SEUIL côté page
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const secret = Deno.env.get('RELANCE_TRIGGER_SECRET');
  if (!secret) {
    console.error('[rappel-sacs-urgence] RELANCE_TRIGGER_SECRET absente');
    return json({ erreur: 'Fonction non configurée' }, 500);
  }
  if (req.headers.get('x-relance-secret') !== secret) return json({ erreur: 'Non autorisé' }, 401);

  let dryRun = false;
  try { dryRun = (await req.json())?.dry_run === true; } catch { /* corps vide */ }

  const { data: docs, error: e1 } = await sb.from('documents_koala').select('id').eq('template_key', 'protocole_urgence');
  if (e1) { console.error('[rappel-sacs-urgence] documents', e1); return json({ erreur: 'Lecture impossible' }, 500); }
  const ids = (docs ?? []).map(d => d.id);
  const bilan = { creches: 0, produits: 0, notifies: 0, sans_destinataire: 0, echecs: 0, liste: [] as string[] };
  if (!ids.length) return json({ dry_run: dryRun, ...bilan });

  const { data: reps, error: e2 } = await sb.from('documents_reponses')
    .select('id,creche_id,donnees').in('document_id', ids);
  if (e2) { console.error('[rappel-sacs-urgence] réponses', e2); return json({ erreur: 'Lecture impossible' }, 500); }

  const { data: creches } = await sb.from('creches').select('id,name,org_id');
  const crecheDe = new Map((creches ?? []).map(c => [String(c.id), c]));
  const { data: refs } = await sb.from('referents').select('id,role,creche_id,org_id');

  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const jours = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - aujourdhui.getTime()) / 86400000);

  for (const r of reps ?? []) {
    let st: any = null;
    try { st = JSON.parse(r.donnees?.pu_json || ''); } catch { /* vide ou invalide */ }
    if (!st) continue;
    const items: { m: string; sac: string; j: number }[] = [];
    for (const [k, sac] of [['r', 'sac rouge'], ['b', 'sac bleu']] as const) {
      for (const sec of st[k] ?? []) for (const it of sec.items ?? []) {
        if (!it?.d || !String(it.m ?? '').trim()) continue;
        const j = jours(String(it.d).slice(0, 10));
        if (!Number.isNaN(j) && j <= SEUIL_JOURS) items.push({ m: String(it.m).trim(), sac, j });
      }
    }
    if (!items.length) continue;
    items.sort((a, b) => a.j - b.j);

    const cr = r.creche_id ? crecheDe.get(String(r.creche_id)) : null;
    bilan.creches++; bilan.produits += items.length;
    bilan.liste.push(`${cr?.name ?? 'Crèche inconnue'} : ${items.map(i => `${i.m} (${i.j})`).join(', ')}`);
    if (dryRun) continue;

    const dest = (refs ?? []).filter(x =>
      (x.role === 'direction' && (!cr || x.org_id === cr.org_id)) ||
      (r.creche_id && x.role === 'referent' && String(x.creche_id) === String(r.creche_id))
    ).map(x => x.id);
    if (!dest.length) { bilan.sans_destinataire++; continue; }

    const perimes = items.filter(i => i.j < 0).length;
    const quoi = (i: { m: string; j: number }) => `${i.m} (${i.j < 0 ? 'périmé' : i.j === 0 ? 'aujourd’hui' : 'dans ' + i.j + ' j'})`;
    const res = await fetch(`${SB_URL}/functions/v1/notify-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
      body: JSON.stringify({
        referent_ids: [...new Set(dest)],
        title: 'Sacs urgence / confinement : produits à renouveler',
        body: `${cr ? cr.name + ' : ' : ''}${items.length} produit${items.length > 1 ? 's' : ''} à renouveler`
          + (perimes ? ` dont ${perimes} périmé${perimes > 1 ? 's' : ''}` : '')
          + ` — ${items.slice(0, 3).map(quoi).join(', ')}${items.length > 3 ? '…' : ''}`,
        url: './demandes.html',
        tag: `sacs-urgence-${r.creche_id ?? r.id}`,
      }),
    });
    if (!res.ok) { bilan.echecs++; console.error('[rappel-sacs-urgence] notify-push', r.id, res.status); continue; }
    bilan.notifies++;
  }
  return json({ dry_run: dryRun, ...bilan });
});
