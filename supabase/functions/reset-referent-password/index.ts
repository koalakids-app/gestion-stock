// Edge function "reset-referent-password"
// ============================================================================
// Réinitialise le mot de passe d'un compte direction/référent·e depuis
// l'espace direction (fonctionnalité de secours si l'invitation par e-mail
// ne peut pas être utilisée).
//
// Récupérée du dashboard Supabase le 26/09/2026 : cette fonction était
// déployée en prod mais jamais versionnée dans le dépôt, et — plus grave —
// ne vérifiait ni l'identité de l'appelant·e ni son organisation avant de
// changer un mot de passe. Elle acceptait un `user_id` fourni tel quel par
// le client, sans le confronter au `referent_id` : N'IMPORTE QUEL compte
// authentifié pouvait donc prendre le contrôle de N'IMPORTE QUEL AUTRE
// compte (toute organisation confondue) en appelant directement la fonction
// avec l'user_id de sa cible. Aucun appelant de cette fonction n'a été
// retrouvé dans le code actuel (front) au moment de la correction — plutôt
// qu'une suppression spéculative, elle est verrouillée pour rester
// utilisable en toute sécurité si un écran vient à la réutiliser.
//
// Corrigé en n'acceptant plus qu'un `referent_id` : le user_id à modifier
// est résolu côté serveur à partir de cette fiche (jamais fourni par le
// client), et l'appelant·e doit avoir le rôle `direction` et appartenir à
// la même organisation que la fiche visée.
//
// Déploiement :
//   supabase functions deploy reset-referent-password
// Secrets nécessaires : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, injectées
// automatiquement par la plateforme Supabase Edge Functions.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Extrait le `sub` (user_id) du JWT porté par l'en-tête Authorization, sans
 *  revérifier sa signature : cette fonction a verify_jwt actif, donc la
 *  plateforme a déjà validé le jeton avant l'exécution de ce code. */
function subDuJeton(authHeader: string | null): string | null {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  const partiePayload = token.split(".")[1];
  if (!partiePayload) return null;
  try {
    let b64 = partiePayload.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { referent_id, password } = await req.json();
    if (!referent_id || !password) {
      return json({ ok: false, error: "referent_id et password requis" }, 400);
    }
    if (String(password).length < 8) {
      return json({ ok: false, error: "Mot de passe trop court (8 caractères minimum)." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const callerId = subDuJeton(req.headers.get("Authorization"));
    if (!callerId) return json({ ok: false, error: "Authentification manquante." }, 401);

    const { data: caller } = await admin
      .from("referents").select("role, org_id").eq("user_id", callerId).maybeSingle();
    if (!caller || caller.role !== "direction") {
      return json({ ok: false, error: "Réservé aux comptes direction." }, 403);
    }

    const { data: cible } = await admin
      .from("referents").select("user_id, org_id").eq("id", referent_id).maybeSingle();
    if (!cible) return json({ ok: false, error: "Fiche introuvable." }, 404);
    if (cible.org_id !== caller.org_id) {
      return json({ ok: false, error: "Cette fiche n'appartient pas à votre organisation." }, 403);
    }
    if (!cible.user_id) {
      return json({ ok: false, error: "Cette fiche n'a pas encore de compte de connexion." }, 400);
    }

    const { error: pwdErr } = await admin.auth.admin.updateUserById(cible.user_id, { password });
    if (pwdErr) return json({ ok: false, error: pwdErr.message }, 400);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
