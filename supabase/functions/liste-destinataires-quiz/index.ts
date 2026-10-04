// ============================================================================
// supabase/functions/liste-destinataires-quiz/index.ts
//
// Liste en LECTURE SEULE des personnes à qui l'on peut envoyer un quiz ou une
// micro-formation (module Formation et quiz, koalakids-app/quiz-protocoles,
// projet Supabase distinct de celui-ci) : salarié(e)s, stagiaires et
// alternant(e)s, avec leur adresse mail et leur crèche.
//
// Appelée UNIQUEMENT par l'edge function `liste-destinataires` du projet quiz,
// jamais par un navigateur : le secret partagé ne quitte pas les serveurs.
// Elle ne renvoie que prénom, nom, mail, crèche et statut — jamais de donnée
// d'enfant ni de famille, ni aucune pièce de dossier.
//
// Déploiement, sans JWT (l'appelant n'a pas de session sur ce projet) :
//
//   supabase functions deploy liste-destinataires-quiz --no-verify-jwt
//
// (« Verify JWT » désactivé si déployée depuis le tableau de bord.)
//
// VARIABLES D'ENVIRONNEMENT (Edge Functions → Secrets) :
//   QUIZ_SHARED_SECRET   chaîne aléatoire longue, IDENTIQUE à celle posée dans
//                        le projet quiz. Sans elle, la fonction refuse tout.
//   QUIZ_ORG_ID          id de l'organisation (table `organisations`) dont on
//                        liste les crèches : plusieurs organisations partagent
//                        cette base, aucune autre ne doit être exposée.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Comparaison à temps constant : ne pas révéler le secret par le temps de réponse.
function memeSecret(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

// Libellés identiques à ceux que les liens de l'appli posent déjà dans
// l'adresse du quiz (employes.html, stagiaire.html) : le filtre par statut du
// côté quiz porte sur les mêmes valeurs que la colonne `statut` des résultats.
const STATUT_SALARIE = 'Salarié(e) en poste';
const STATUT_ALTERNANT = 'Alternant(e)';
const STATUT_STAGIAIRE = 'Stagiaire';

const propre = (s: unknown) => String(s ?? '').trim();
const mailValide = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const secret = Deno.env.get('QUIZ_SHARED_SECRET') || '';
  const orgId = Deno.env.get('QUIZ_ORG_ID') || '';
  if (!secret || secret.length < 24 || !orgId) {
    console.error('[liste-destinataires-quiz] QUIZ_SHARED_SECRET (24 car. min.) ou QUIZ_ORG_ID absent');
    return json({ erreur: 'Fonction non configurée' }, 500);
  }
  if (!memeSecret(req.headers.get('x-quiz-secret') || '', secret)) {
    return json({ erreur: 'Non autorisé' }, 401);
  }

  try {
    const { data: creches, error: eCr } = await sb
      .from('creches').select('id,name').eq('org_id', orgId).order('name');
    if (eCr) throw eCr;
    const ids = (creches || []).map((c) => c.id);
    if (!ids.length) return json({ creches: [], destinataires: [] });
    const nomCreche = new Map((creches || []).map((c) => [c.id, c.name as string]));

    const [emp, stg, ref] = await Promise.all([
      sb.from('employes').select('id,prenom,nom,email,creche_id')
        .in('creche_id', ids).is('archive_le', null),
      sb.from('stagiaires').select('id,prenom,nom,email,creche_id,type_contrat,employe_id,date_fin')
        .in('creche_id', ids),
      sb.from('referents').select('id,name,email,creche_id,employe_id')
        .in('creche_id', ids),
    ]);
    if (emp.error) throw emp.error;
    if (stg.error) throw stg.error;
    if (ref.error) throw ref.error;

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const sortie: Record<string, unknown>[] = [];
    const empIndex = new Map((emp.data || []).map((e) => [e.id, e]));
    // Une fiche employes liée à une fiche stagiaires n'est listée qu'une fois
    // (comme alternant·e) : la personne ne doit pas apparaître en double.
    const dejaListes = new Set<string>();

    const ajouter = (o: {
      ref: string; prenom: unknown; nom: unknown; email: unknown;
      creche_id: string | null; statut: string; origine: string;
    }) => {
      const email = propre(o.email).toLowerCase();
      if (!mailValide(email)) return; // sans adresse, rien à envoyer
      sortie.push({
        ref: o.ref,
        prenom: propre(o.prenom),
        nom: propre(o.nom),
        email,
        creche_id: o.creche_id,
        creche: (o.creche_id && nomCreche.get(o.creche_id)) || '',
        statut: o.statut,
        origine: o.origine,
      });
    };

    for (const s of stg.data || []) {
      // Stage ou alternance terminé(e) : on ne propose plus la personne.
      if (s.date_fin && s.date_fin < aujourdhui) continue;
      const lie = s.employe_id ? empIndex.get(s.employe_id) : null;
      if (s.employe_id) dejaListes.add(s.employe_id);
      const src = lie || s; // fiche employes = source de vérité quand elle est liée
      ajouter({
        ref: lie ? lie.id : s.id,
        prenom: src.prenom, nom: src.nom, email: src.email || s.email,
        creche_id: (lie ? lie.creche_id : s.creche_id) ?? s.creche_id,
        statut: s.type_contrat === 'alternant' ? STATUT_ALTERNANT : STATUT_STAGIAIRE,
        origine: 'stagiaires',
      });
    }
    for (const e of emp.data || []) {
      if (dejaListes.has(e.id)) continue;
      dejaListes.add(e.id);
      ajouter({
        ref: e.id, prenom: e.prenom, nom: e.nom, email: e.email,
        creche_id: e.creche_id, statut: STATUT_SALARIE, origine: 'employes',
      });
    }
    // Directrices techniques : listées seulement si leur fiche n'est pas déjà
    // couverte par une fiche employes liée. La direction (sans crèche) est
    // exclue d'office par le filtre sur creche_id.
    for (const r of ref.data || []) {
      if (r.employe_id && dejaListes.has(r.employe_id)) continue;
      const [prenom, ...reste] = propre(r.name).split(/\s+/);
      ajouter({
        ref: r.id, prenom, nom: reste.join(' '), email: r.email,
        creche_id: r.creche_id, statut: STATUT_SALARIE, origine: 'referents',
      });
    }

    sortie.sort((a, b) =>
      String(a.creche).localeCompare(String(b.creche), 'fr') ||
      String(a.nom).localeCompare(String(b.nom), 'fr') ||
      String(a.prenom).localeCompare(String(b.prenom), 'fr'));

    return json({ creches: creches || [], destinataires: sortie });
  } catch (e) {
    console.error('[liste-destinataires-quiz]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
