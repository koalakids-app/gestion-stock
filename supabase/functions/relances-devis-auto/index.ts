// ============================================================================
// supabase/functions/relances-devis-auto/index.ts
// Koala Kids — octobre 2026
//
// Relances automatiques des devis restés sans réponse. Déclenchée chaque jour
// ouvré par GitHub Actions (.github/workflows/relances-devis-auto.yml), qui
// POSTe ici avec un secret partagé — même principe que sauvegarde-hebdomadaire.
//
// Pour chaque organisation ayant activé l'option (Paramètres > Le réseau >
// Relances de devis), et pour chaque devis « envoyé », sans réponse, au lien
// encore valide et non exclu (devis.relance_auto_stop) :
//
// Deux modes (relances_devis_mode), « validation » par défaut :
//   • validation — rien ne part sans accord. Quand une relance est due, la
//     fonction la PROPOSE : devis.relance_a_valider_le est posé, l'équipe est
//     notifiée, et le devis affiche « Relance à valider » avec le texte
//     modifiable avant envoi (ou « Reporter »). Un seul rappel par devis tant
//     qu'il n'a pas été traité.
//   • auto — le mail part tout seul.
//
//   1. RELANCE RÉGULIÈRE — première relance `delai` jours après l'envoi, puis
//      une tous les `intervalle` jours, jusqu'à `max` relances (compteur
//      devis.relances, partagé avec les relances manuelles : une relance faite
//      à la main décale d'autant la suivante).
//   2. DERNIER RAPPEL — une seule fois, `finale` jours avant l'expiration du
//      lien, avec la date limite dans l'objet. Il remplace la relance
//      régulière si les deux tombent le même jour : jamais deux mails.
//   3. ALERTE ÉQUIPE — quand les relances sont épuisées et que la famille n'a
//      toujours pas répondu après un dernier intervalle : notification push à
//      la direction, et date de rappel posée
//      sur la demande (elle remonte dans « relances en retard »). On ne
//      relance plus : c'est à une personne d'appeler.
//
// Garde-fous : aucun envoi le week-end, un jour férié ou hors 8 h–19 h
// (heure de Paris) ; arrêt dès que le devis est signé, refusé, annulé ou la
// demande close ; 50 mails maximum par exécution ; tout est tracé dans
// devis_relances_log (sql/devis_relances_auto.sql).
//
// Le mail lui-même part par `envoyer-devis` (relance: true), qui incrémente
// devis.relances / derniere_relance seulement si l'envoi a réussi.
//
// VARIABLES D'ENVIRONNEMENT (Supabase > Edge Functions > Secrets) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   déjà posées.
//   RELANCE_TRIGGER_SECRET                    jeton partagé avec le workflow
//                                             GitHub Actions (`openssl rand -hex 32`),
//                                             à poser aussi dans les secrets du dépôt.
//
// DÉPLOIEMENT : --no-verify-jwt (l'appel vient de GitHub Actions ; le secret
// ci-dessus est vérifié plus bas).
//
// Essai à blanc : POST {"dry_run": true} liste ce qui serait envoyé sans rien
// envoyer ni écrire, et ignore la restriction de jours/heures.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const MAX_MAILS_PAR_PASSAGE = 50;
const STATUTS_DEMANDE_CLOS = ['inscrit', 'refuse', 'sans_suite'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- Calendrier (heure de Paris) ----------

function parisMaintenant() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(new Date()).map(x => [x.type, x.value]),
  );
  return {
    annee: Number(p.year), mois: Number(p.month), jour: Number(p.day),
    heure: Number(p.hour) % 24, semaine: p.weekday as string,
  };
}

// Jours fériés français : fixes + ceux qui dépendent de Pâques.
function feries(an: number): Set<string> {
  const a = an % 19, b = Math.floor(an / 100), c = an % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(Date.UTC(an, mois - 1, jour));
  const plus = (n: number) => new Date(paques.getTime() + n * 86400000);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const fixe = (mm: number, dd: number) => `${an}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return new Set([
    fixe(1, 1), fixe(5, 1), fixe(5, 8), fixe(7, 14), fixe(8, 15), fixe(11, 1), fixe(11, 11), fixe(12, 25),
    iso(plus(1)), iso(plus(39)), iso(plus(50)),
  ]);
}

function creneauOuvert(): string | null {
  const n = parisMaintenant();
  if (n.semaine === 'Sat' || n.semaine === 'Sun') return 'week-end';
  const iso = `${n.annee}-${String(n.mois).padStart(2, '0')}-${String(n.jour).padStart(2, '0')}`;
  if (feries(n.annee).has(iso)) return 'jour férié';
  if (n.heure < 8 || n.heure >= 19) return 'hors 8 h–19 h';
  return null;
}

const joursDepuis = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;
const joursAvant = (iso: string) => (new Date(iso).getTime() - Date.now()) / 86400000;
const dfr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

// ---------- Réglages d'une organisation ----------

type Reglages = { actif: boolean; validation: boolean; delai: number; intervalle: number; max: number; finale: number };

function reglages(cfg: Record<string, unknown> | null): Reglages {
  const c = cfg || {};
  const n = (v: unknown, defaut: number, min: number, max: number) => {
    const x = Number(v);
    return Number.isFinite(x) && v !== null && v !== '' ? Math.min(max, Math.max(min, Math.round(x))) : defaut;
  };
  return {
    actif: c.relances_devis_auto_active === true,
    validation: c.relances_devis_mode !== 'auto',
    delai: n(c.relances_devis_delai_jours, 3, 1, 60),
    intervalle: n(c.relances_devis_intervalle_jours, 5, 1, 60),
    max: n(c.relances_devis_max, 2, 0, 10),
    // 0 = pas de dernier rappel
    finale: n(c.relances_devis_finale_jours, 3, 0, 30),
  };
}

// ---------- Appels vers les autres fonctions ----------

async function appelFonction(nom: string, corps: unknown) {
  const r = await fetch(`${SB_URL}/functions/v1/${nom}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
    body: JSON.stringify(corps),
  });
  const texte = await r.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(texte); } catch { /* corps non JSON */ }
  return { ok: r.ok, status: r.status, data };
}

async function journal(l: {
  devis_id: string; preinscription_id: string | null; org_id: string | null;
  type: 'relance' | 'finale' | 'a_valider' | 'alerte' | 'echec'; numero?: number | null; detail?: string;
}) {
  const { error } = await sb.from('devis_relances_log').insert({
    devis_id: l.devis_id, preinscription_id: l.preinscription_id, org_id: l.org_id,
    type: l.type, numero: l.numero ?? null, detail: l.detail ?? null,
  });
  if (error) console.error('[relances-devis-auto] journal', error);
}

// Prévient la direction (c'est elle qui gère les relances), et fait remonter la
// demande dans « relances en retard ». Les deux, car le push peut être coupé
// (droit à la déconnexion) : la date de rappel, elle, reste visible.
async function alerterEquipe(d: Record<string, any>, orgId: string | null, enfant: string, relances: number) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (d.preinscription_id) {
    const { data: p } = await sb.from('preinscriptions')
      .select('id,date_rappel,statut').eq('id', d.preinscription_id).maybeSingle();
    if (p && !STATUTS_DEMANDE_CLOS.includes(p.statut)
        && (!p.date_rappel || String(p.date_rappel).slice(0, 10) > aujourdhui)) {
      await sb.from('preinscriptions').update({ date_rappel: aujourdhui }).eq('id', p.id);
    }
  }
  const { data: refs } = await sb.from('referents').select('id,role,creche_id,org_id');
  const ids = (refs ?? [])
    .filter(r => (!orgId || r.org_id === orgId) && r.role === 'direction')
    .map(r => r.id);
  if (!ids.length) return 'aucun destinataire';
  const push = await appelFonction('notify-push', {
    referent_ids: ids,
    title: 'Devis sans réponse — à appeler',
    body: `${enfant} : ${relances} relance${relances > 1 ? 's' : ''} par mail sans réponse. Un appel s'impose.`,
    url: d.preinscription_id ? `inscriptions.html?open=${d.preinscription_id}` : 'inscriptions.html',
    tag: `devis-sans-reponse-${d.id}`,
  });
  return push.ok ? `push envoyé à ${ids.length} personne(s)` : `push refusé (HTTP ${push.status})`;
}

// ---------- Traitement ----------

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const secret = Deno.env.get('RELANCE_TRIGGER_SECRET');
  if (!secret) {
    console.error('[relances-devis-auto] RELANCE_TRIGGER_SECRET absente');
    return json({ erreur: 'Fonction non configurée' }, 500);
  }
  if (req.headers.get('x-relance-secret') !== secret) return json({ erreur: 'Non autorisé' }, 401);

  let dryRun = false;
  try { dryRun = (await req.json())?.dry_run === true; } catch { /* corps vide */ }

  if (!dryRun) {
    const ferme = creneauOuvert();
    if (ferme) return json({ ok: true, envoyes: 0, ignore: `Pas d'envoi (${ferme}).` });
  }

  try {
    const { data: cfgs, error: eCfg } = await sb.from('reseau_config').select('org_id,config');
    if (eCfg) throw eCfg;
    const parOrg = new Map<string, Reglages>();
    for (const c of cfgs ?? []) {
      const r = reglages(c.config);
      if (r.actif && c.org_id) parOrg.set(c.org_id, r);
    }
    if (!parOrg.size) return json({ ok: true, envoyes: 0, ignore: 'Option désactivée.' });

    const { data: creches } = await sb.from('creches').select('id,org_id');
    const orgDeCreche = new Map((creches ?? []).map(c => [c.id, c.org_id as string]));

    const { data: devis, error: eDev } = await sb.from('devis').select('*')
      .eq('statut', 'envoye').is('repondu_le', null).not('token', 'is', null)
      .eq('relance_auto_stop', false).gt('expire_le', new Date().toISOString())
      .order('envoye_le', { ascending: true });
    if (eDev) throw eDev;

    const ids = (devis ?? []).map(d => d.id);
    const { data: logs } = ids.length
      ? await sb.from('devis_relances_log').select('devis_id,type,detail').in('devis_id', ids)
      : { data: [] as { devis_id: string; type: string; detail: string | null }[] };
    const dejaLog = (id: string, type: string) => (logs ?? []).some(l => l.devis_id === id && l.type === type);
    // En mode validation, le dernier rappel proposé est tracé « a_valider / finale ».
    const finaleDejaProposee = (id: string) =>
      dejaLog(id, 'finale') || (logs ?? []).some(l => l.devis_id === id && l.type === 'a_valider' && l.detail === 'finale');

    const preIds = [...new Set((devis ?? []).map(d => d.preinscription_id).filter(Boolean))];
    const { data: pres } = preIds.length
      ? await sb.from('preinscriptions').select('id,prenom,nom,statut').in('id', preIds)
      : { data: [] as any[] };
    const preParId = new Map((pres ?? []).map(p => [p.id, p]));

    const aValider = new Map<string, { orgId: string | null; crecheId: string | null; n: number }[]>();
    const bilan = { propositions: 0, envoyes: 0, finales: 0, alertes: 0, echecs: 0, examines: 0, a_envoyer: [] as string[] };

    for (const d of devis ?? []) {
      if (bilan.envoyes + bilan.finales >= MAX_MAILS_PAR_PASSAGE) break;
      const orgId = d.org_id || orgDeCreche.get(d.creche_id) || null;
      const rg = orgId ? parOrg.get(orgId) : undefined;
      if (!rg) continue;
      const pre = preParId.get(d.preinscription_id);
      if (pre && STATUTS_DEMANDE_CLOS.includes(pre.statut)) continue;
      if (!String(d.destinataires || '').trim()) continue;
      bilan.examines++;

      const relances = Number(d.relances || 0);
      const reference = d.derniere_relance || d.envoye_le;
      if (!reference) continue;
      const attente = joursDepuis(reference);
      const enfant = pre ? `${pre.prenom || ''} ${pre.nom || ''}`.trim() || 'un enfant' : 'un enfant';
      const prenom = (pre?.prenom || 'votre enfant').trim();

      // Dernier rappel : une fois, dans la fenêtre précédant l'expiration, et
      // seulement si la famille n'a pas été relancée dans les 2 derniers jours.
      const finaleDue = rg.finale > 0 && d.expire_le && joursAvant(d.expire_le) <= rg.finale
        && !finaleDejaProposee(d.id) && (relances === 0 ? attente >= 1 : attente >= 2);
      const regulierDue = relances < rg.max && attente >= (relances === 0 ? rg.delai : rg.intervalle);

      if (finaleDue || regulierDue) {
        const finale = finaleDue;
        const libelle = `${finale ? 'dernier rappel' : 'relance n°' + (relances + 1)} — ${enfant}`;
        if (dryRun) { bilan.a_envoyer.push(libelle); continue; }

        // Mode validation : on propose, on n'envoie pas. Déjà proposée et pas
        // encore traitée → on ne notifie pas une deuxième fois.
        if (rg.validation) {
          if (d.relance_a_valider_le) continue;
          const { error: ePose } = await sb.from('devis')
            .update({ relance_a_valider_le: new Date().toISOString() }).eq('id', d.id);
          if (ePose) { console.error('[relances-devis-auto] pose', d.id, ePose); continue; }
          bilan.propositions++;
          bilan.a_envoyer.push(libelle);
          await journal({
            devis_id: d.id, preinscription_id: d.preinscription_id, org_id: orgId,
            type: 'a_valider', numero: relances + 1, detail: finale ? 'finale' : 'relance',
          });
          const cle = orgId || '';
          aValider.set(cle, [...(aValider.get(cle) ?? []), { orgId, crecheId: d.creche_id, n: 1 }]);
          continue;
        }

        const corps: Record<string, unknown> = { devis_id: d.id, relance: true, expediteur: "L'équipe" };
        if (finale) {
          corps.objet = `Dernier rappel - le devis d'accueil de ${prenom} expire le ${dfr(d.expire_le)}`;
          corps.message = `Le lien vers le devis d'accueil de ${enfant} expire le ${dfr(d.expire_le)}.\n`
            + `Passé cette date, il faudra nous demander un nouveau devis. Si vous avez la moindre question, `
            + `répondez simplement à cet e-mail : nous sommes là pour vous aider.`;
        }
        const r = await appelFonction('envoyer-devis', corps);
        if (r.ok) {
          finale ? bilan.finales++ : bilan.envoyes++;
          await journal({
            devis_id: d.id, preinscription_id: d.preinscription_id, org_id: orgId,
            type: finale ? 'finale' : 'relance', numero: relances + 1,
            detail: `Mail envoyé à ${d.destinataires}`,
          });
        } else {
          bilan.echecs++;
          console.error('[relances-devis-auto] envoyer-devis', d.id, r.status, r.data);
          await journal({
            devis_id: d.id, preinscription_id: d.preinscription_id, org_id: orgId, type: 'echec',
            numero: relances + 1, detail: String(r.data?.erreur || `HTTP ${r.status}`),
          });
        }
        continue;
      }

      // Relances épuisées (ou impossibles) et un dernier intervalle écoulé
      // sans réponse : on passe la main à l'équipe, une seule fois.
      const epuise = relances >= rg.max && (relances > 0 || rg.max === 0);
      const baseAlerte = relances > 0 ? attente : joursDepuis(d.envoye_le || reference);
      if (epuise && baseAlerte >= rg.intervalle && !dejaLog(d.id, 'alerte')) {
        if (dryRun) { bilan.a_envoyer.push(`alerte équipe — ${enfant}`); continue; }
        const detail = await alerterEquipe(d, orgId, enfant, relances);
        bilan.alertes++;
        await journal({
          devis_id: d.id, preinscription_id: d.preinscription_id, org_id: orgId,
          type: 'alerte', numero: relances, detail,
        });
      }
    }

    // Une seule notification par organisation et par passage, quel que soit le
    // nombre de relances proposées : direction uniquement.
    if (!dryRun) {
      for (const [, liste] of aValider) {
        const orgId = liste[0].orgId;
        const { data: refs } = await sb.from('referents').select('id,role,creche_id,org_id');
        const dest = (refs ?? [])
          .filter(r => (!orgId || r.org_id === orgId) && r.role === 'direction')
          .map(r => r.id);
        if (!dest.length) continue;
        const n = liste.length;
        const push = await appelFonction('notify-push', {
          referent_ids: dest,
          title: `${n} relance${n > 1 ? 's' : ''} de devis à valider`,
          body: 'Ouvrez les devis concernés pour relire le message et valider l\'envoi.',
          url: 'inscriptions.html',
          tag: 'relances-devis-a-valider',
        });
        if (!push.ok) console.error('[relances-devis-auto] push validation', push.status);
      }
    }

    return json({ ok: true, dry_run: dryRun, ...bilan });
  } catch (e) {
    console.error('[relances-devis-auto]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
