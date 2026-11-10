// ============================================================================
// supabase/functions/rappel-visites-medicales/index.ts
// Koala Kids — novembre 2026  ·  Collaborateurs › Visite médicale (Odalia)
//
// Prévient chaque semaine des collaborateurs dont la visite médicale
// obligatoire est en retard ou à moins de 60 jours de l'échéance, sans RDV pris.
// Même règle que js/visites-medicales.js (vismedEtat) et que la section de Ma
// journée (visitesMedicalesARenouveler, js/pages/demandes-3.js) : à garder
// alignées. Visite d'embauche dans les 3 mois après date_debut, puis
// prochaine_le ou +5 ans après la dernière visite effectuée.
//
// Destinataires : la direction de l'organisation et les référentes de la crèche.
// Une notification par crèche et par passage, sans colonne d'état : tant que
// la visite n'est pas planifiée, le rappel revient chaque semaine. notify-push
// retient le message pendant les heures de silence.
//
// Déclenchée chaque lundi par GitHub Actions
// (.github/workflows/rappel-visites-medicales.yml) avec le secret partagé
// RELANCE_TRIGGER_SECRET (en-tête x-relance-secret).
// Essai à blanc : POST {"dry_run": true} liste sans notifier.
//
// DÉPLOIEMENT — appelée par GitHub Actions, sans JWT :
//   supabase functions deploy rappel-visites-medicales --no-verify-jwt
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const SEUIL_JOURS = 60;   // VISMED_SEUIL_JOURS côté page
const PERIODE_ANS = 5;    // VISMED_PERIODE_ANS côté page
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ajout = (iso: string, ans: number, mois = 0) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + ans);
  d.setUTCMonth(d.getUTCMonth() + mois);
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const secret = Deno.env.get('RELANCE_TRIGGER_SECRET');
  if (!secret) {
    console.error('[rappel-visites-medicales] RELANCE_TRIGGER_SECRET absente');
    return json({ erreur: 'Fonction non configurée' }, 500);
  }
  if (req.headers.get('x-relance-secret') !== secret) return json({ erreur: 'Non autorisé' }, 401);

  let dryRun = false;
  try { dryRun = (await req.json())?.dry_run === true; } catch { /* corps vide */ }

  const auj = new Date().toISOString().slice(0, 10);
  const jours = (d: string) => Math.round((new Date(d + 'T12:00:00Z').getTime() - new Date(auj + 'T12:00:00Z').getTime()) / 86400000);

  const { data: emps, error: e1 } = await sb.from('employes')
    .select('id,prenom,nom,creche_id,date_debut,date_fin,archive_le').is('archive_le', null);
  if (e1) { console.error('[rappel-visites-medicales] employes', e1); return json({ erreur: 'Lecture impossible' }, 500); }
  const { data: visites, error: e2 } = await sb.from('employes_visites_medicales').select('employe_id,date_visite,rdv_le,prochaine_le');
  if (e2) { console.error('[rappel-visites-medicales] visites', e2); return json({ erreur: 'Lecture impossible' }, 500); }
  const parEmp = new Map<string, any[]>();
  for (const v of visites ?? []) parEmp.set(v.employe_id, [...(parEmp.get(v.employe_id) ?? []), v]);

  // Collaborateurs à signaler, regroupés par crèche.
  const parCreche = new Map<string, { nom: string; j: number }[]>();
  for (const e of emps ?? []) {
    if (!e.creche_id || (e.date_fin && String(e.date_fin).slice(0, 10) <= auj)) continue;
    const vs = parEmp.get(e.id) ?? [];
    const derniere = vs.filter(v => v.date_visite).sort((a, b) => b.date_visite.localeCompare(a.date_visite))[0];
    const echeance = derniere
      ? (derniere.prochaine_le ?? ajout(String(derniere.date_visite), PERIODE_ANS))
      : (e.date_debut ? ajout(String(e.date_debut).slice(0, 10), 0, 3) : null);
    if (!echeance) continue;
    const j = jours(String(echeance).slice(0, 10));
    if (j > SEUIL_JOURS) continue;
    if (vs.some(v => !v.date_visite && v.rdv_le && v.rdv_le >= auj)) continue;   // RDV déjà pris
    const nom = `${e.prenom ?? ''} ${e.nom ?? ''}`.trim();
    parCreche.set(e.creche_id, [...(parCreche.get(e.creche_id) ?? []), { nom, j }]);
  }

  const bilan = { creches: 0, collaborateurs: 0, notifies: 0, sans_destinataire: 0, echecs: 0, liste: [] as string[] };
  if (!parCreche.size) return json({ dry_run: dryRun, ...bilan });

  const { data: creches } = await sb.from('creches').select('id,name,org_id');
  const crecheDe = new Map((creches ?? []).map(c => [String(c.id), c]));
  const { data: refs } = await sb.from('referents').select('id,role,creche_id,org_id');

  for (const [crecheId, items] of parCreche) {
    items.sort((a, b) => a.j - b.j);
    const cr = crecheDe.get(String(crecheId));
    bilan.creches++; bilan.collaborateurs += items.length;
    bilan.liste.push(`${cr?.name ?? 'Crèche inconnue'} : ${items.map(i => `${i.nom} (${i.j})`).join(', ')}`);
    if (dryRun) continue;

    const dest = (refs ?? []).filter(x =>
      (x.role === 'direction' && (!cr || x.org_id === cr.org_id)) ||
      (x.role === 'referent' && String(x.creche_id) === String(crecheId))
    ).map(x => x.id);
    if (!dest.length) { bilan.sans_destinataire++; continue; }

    const retard = items.filter(i => i.j < 0).length;
    const quoi = (i: { nom: string; j: number }) => `${i.nom} (${i.j < 0 ? 'en retard' : 'dans ' + i.j + ' j'})`;
    const res = await fetch(`${SB_URL}/functions/v1/notify-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
      body: JSON.stringify({
        referent_ids: [...new Set(dest)],
        title: 'Visites médicales (Odalia) à planifier',
        body: `${cr ? cr.name + ' : ' : ''}${items.length} collaborateur${items.length > 1 ? 's' : ''}`
          + (retard ? ` dont ${retard} en retard` : '')
          + ` — ${items.slice(0, 3).map(quoi).join(', ')}${items.length > 3 ? '…' : ''}`,
        url: './demandes.html?section=employes',
        tag: `visites-medicales-${crecheId}`,
      }),
    });
    if (!res.ok) { bilan.echecs++; console.error('[rappel-visites-medicales] notify-push', crecheId, res.status); continue; }
    bilan.notifies++;
  }
  return json({ dry_run: dryRun, ...bilan });
});
