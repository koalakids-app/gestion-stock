// ============================================================================
// Edge function « liste-destinataires » — PROJET QUIZ (phbcqxjzobzwuzetgbem)
//
// Appelée par admin.html (écran d'envoi). Vérifie que l'appelant est un
// envoyeur (table envoyeurs_quiz), puis demande la liste des personnes à la
// fonction `liste-destinataires-quiz` du projet gestion-stock, en lui
// présentant le secret partagé. Le navigateur ne voit jamais ce secret.
//
// Renvoie aussi, si on lui donne le quiz ou le module visé, ce qui a déjà été
// envoyé (état, date, nombre de relances) pour repérer les personnes déjà
// contactées.
//
// DÉPLOIEMENT (tableau de bord → Edge Functions → Deploy a new function) :
//   nom : liste-destinataires      « Verify JWT » : ACTIVÉ
// (Le contrôle du rôle est fait dans le code : la clé anon passe aussi la
// vérification JWT de la passerelle, elle ne suffit donc pas.)
//
// SECRETS à poser dans le projet quiz :
//   QUIZ_SHARED_SECRET   la MÊME valeur que dans le projet gestion-stock
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY : automatiques.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GESTION_FN =
  'https://juyrceadazrovlitxceb.supabase.co/functions/v1/liste-destinataires-quiz';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

// Renvoie l'envoyeur connecté ({creche: null = toutes}) ou null.
async function envoyeur(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const sbUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('envoyeurs_quiz')
    .select('creche').eq('user_id', user.id).maybeSingle();
  return data ? { id: user.id, creche: (data.creche as string | null) } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const secret = Deno.env.get('QUIZ_SHARED_SECRET') || '';
  if (!secret) {
    console.error('[liste-destinataires] QUIZ_SHARED_SECRET absent');
    return json({ erreur: 'Fonction non configurée' }, 500);
  }
  const moi = await envoyeur(req);
  if (!moi) return json({ erreur: "Vous n'avez pas le droit d'envoyer des quiz." }, 403);

  try {
    const { kind, item_id } = await req.json().catch(() => ({}));

    const r = await fetch(GESTION_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-quiz-secret': secret },
      body: '{}',
    });
    if (!r.ok) {
      console.error('[liste-destinataires] gestion-stock', r.status, await r.text());
      return json({ erreur: "La liste des personnes n'a pas pu être récupérée." }, 502);
    }
    const g = await r.json();

    // Une directrice technique ne voit que sa crèche.
    const creches = (g.creches || []).filter((c: { name: string }) => !moi.creche || c.name === moi.creche);
    const destinataires = (g.destinataires || []).filter((d: { creche: string }) => !moi.creche || d.creche === moi.creche);

    let envois: unknown[] = [];
    if ((kind === 'quiz' || kind === 'module') && item_id) {
      let q = sb.from('envois_quiz')
        .select('email,etat,envoye_le,nb_relances,relance_le,erreur')
        .eq('kind', kind).eq('item_id', item_id).order('envoye_le', { ascending: false });
      if (moi.creche) q = q.eq('creche', moi.creche);
      const { data } = await q;
      envois = data || [];
    }
    return json({ creches, destinataires, envois, portee: moi.creche });
  } catch (e) {
    console.error('[liste-destinataires]', e);
    return json({ erreur: 'Erreur serveur' }, 500);
  }
});
