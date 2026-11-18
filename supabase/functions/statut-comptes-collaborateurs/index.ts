// Edge function "statut-comptes-collaborateurs"
// ============================================================================
// Indique, pour les fiches d'une crèche, quels comptes de connexion ont
// réellement été activés par le/la collaborateur/trice (au moins une connexion).
// employes.user_id est posé dès l'invitation : il ne prouve donc pas que
// l'espace a été créé. Demandes › Collaborateurs s'en sert pour distinguer « Compte actif »
// de « Invitation envoyée ». auth.users n'étant pas lisible depuis le
// navigateur, la lecture de last_sign_in_at passe par cette fonction.
//
// Même contrôle que bloquer-compte-collaborateur : l'appelant·e doit être un
// compte referents de la même organisation que la crèche visée.
//
// Déploiement :
//   supabase functions deploy statut-comptes-collaborateurs
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (injectées par la plateforme).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estGestionnaire, identifierAppelant, peutGererCreche } from "../_shared/appelant.ts";

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

  let body: { creche_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { creche_id } = body;
  if (!creche_id) return json({ error: "creche_id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Appelant vérifié auprès de Supabase Auth (plus de décodage du jeton sans contrôle) ; direction ou référent·e seulement :
    // un compte d'accès terrain (rôle « employe ») ne gère pas les comptes des collaborateurs.
    const caller = await identifierAppelant(supabase, req);
    if (!caller) return json({ error: "authentification_manquante" }, 401);
    if (!estGestionnaire(caller)) return json({ error: "droits_insuffisants" }, 403);

    const { data: creche } = await supabase
      .from("creches").select("org_id").eq("id", creche_id).maybeSingle();
    if (!peutGererCreche(caller, creche ? { id: creche_id, org_id: creche.org_id } : null)) {
      return json({ error: "creche_non_autorisee" }, 403);
    }

    const { data: employes, error } = await supabase
      .from("employes").select("user_id").eq("creche_id", creche_id).not("user_id", "is", null);
    if (error) throw error;

    const actifs: string[] = [];
    for (const { user_id } of employes || []) {
      const { data, error: uErr } = await supabase.auth.admin.getUserById(user_id);
      if (uErr || !data?.user) continue;
      if (data.user.last_sign_in_at) actifs.push(user_id);
    }
    return json({ ok: true, actifs });
  } catch (err) {
    console.error("[statut-comptes-collaborateurs]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
