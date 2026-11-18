// Edge function "bloquer-compte-collaborateur"
// ============================================================================
// Bloque (ou rétablit) la connexion du compte auth.users d'un(e) collaborateur/
// trice dont le dossier est archivé (fin de contrat) : Demandes › Collaborateurs l'appelle
// à l'archivage (bloquer: true) et à la réactivation (bloquer: false).
// Le compte n'est pas supprimé : l'historique et la fiche restent intacts, et
// un dossier réactivé retrouve son accès. Le blocage est un « ban » Supabase
// Auth, qui refuse aussi le renouvellement des sessions déjà ouvertes (le
// jeton en cours reste valable jusqu'à son expiration, au plus 1 h).
//
// Même contrôle que creer-compte-collaborateur : l'appelant·e doit être un
// compte referents de la même organisation que la fiche visée. Un compte
// direction ou référent·e n'est jamais bloqué par cette fonction (seul le
// rôle « employe » l'est), pour ne pas verrouiller quelqu'un·e qui gère
// l'application.
//
// Déploiement :
//   supabase functions deploy bloquer-compte-collaborateur
// Secrets nécessaires : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, injectées
// automatiquement par la plateforme Supabase Edge Functions.
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

  let body: { employe_id?: string; bloquer?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { employe_id, bloquer } = body;
  if (!employe_id) return json({ error: "employe_id_manquant" }, 400);
  if (typeof bloquer !== "boolean") return json({ error: "bloquer_manquant" }, 400);

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

    const { data: employe, error: eErr } = await supabase
      .from("employes").select("id, user_id, creche_id").eq("id", employe_id).maybeSingle();
    if (eErr) throw eErr;
    if (!employe) return json({ error: "collaborateur_introuvable" }, 404);
    // Pas de compte de connexion : rien à bloquer, ce n'est pas une erreur.
    if (!employe.user_id) return json({ ok: true, sans_compte: true });

    const { data: creche } = employe.creche_id
      ? await supabase.from("creches").select("org_id").eq("id", employe.creche_id).maybeSingle()
      : { data: null };
    if (!peutGererCreche(caller, creche ? { id: employe.creche_id, org_id: creche.org_id } : null)) {
      return json({ error: "creche_non_autorisee" }, 403);
    }

    const { data: ref } = await supabase
      .from("referents").select("role").eq("user_id", employe.user_id).maybeSingle();
    if (ref && ref.role !== "employe") {
      return json({ error: "compte_direction_ou_referent" }, 400);
    }

    // ~100 ans = bloqué tant qu'on ne le rétablit pas ; « none » lève le blocage.
    const { error } = await supabase.auth.admin.updateUserById(employe.user_id, {
      ban_duration: bloquer ? "876000h" : "none",
    });
    if (error && !/not.*found/i.test(error.message || "")) throw error;
    return json({ ok: true });
  } catch (err) {
    console.error("[bloquer-compte-collaborateur]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
