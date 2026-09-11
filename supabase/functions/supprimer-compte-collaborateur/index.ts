// Edge function "supprimer-compte-collaborateur"
// ============================================================================
// Supprime le compte de connexion (auth.users) d'un(e) collaborateur/trice.
// Appelée depuis employes.html juste après la suppression de la fiche
// `employes` elle-même (RLS-scopée, faite côté client avec l'anon key) :
// supprimer la ligne `employes` ne supprime pas le compte auth.users associé
// (ça demande le service role), ce qui laissait jusqu'ici un compte orphelin
// bloquant toute réutilisation de son adresse e-mail pour un(e) autre
// collaborateur/trice.
//
// Le filtrage par droits est déjà fait côté client, comme pour
// creer-compte-collaborateur : cette fonction n'est appelée qu'après que la
// suppression de la fiche a réussi sous RLS, ce qui prouve déjà que
// l'appelant avait le droit de gérer ce/cette collaborateur/trice. Elle ne
// vérifie donc pas à nouveau les droits — elle ne fait que l'opération que
// l'anon key ne peut pas faire elle-même : supprimer un compte auth.users.
//
// Déploiement :
//   supabase functions deploy supprimer-compte-collaborateur
// Secrets nécessaires : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, injectées
// automatiquement par la plateforme Supabase Edge Functions.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { user_id } = body;
  if (!user_id) return json({ error: "user_id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { error } = await supabase.auth.admin.deleteUser(user_id);
    // "User not found" n'est pas une erreur ici : le compte a peut-être déjà
    // été supprimé par un appel précédent, le résultat recherché (plus de
    // compte à cette adresse) est déjà atteint.
    if (error && !/not.*found/i.test(error.message || "")) throw error;
    return json({ ok: true });
  } catch (err) {
    console.error("[supprimer-compte-collaborateur]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
