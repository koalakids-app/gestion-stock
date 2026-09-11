// Edge function "creer-compte-collaborateur"
// ============================================================================
// Crée le compte de connexion (auth.users) d'un(e) collaborateur/trice
// (table `employes`) et lie `employes.user_id` au compte créé. Envoie un
// e-mail d'invitation Supabase (lien pour définir son mot de passe), qui
// redirige vers collaborateur.html — la page "Mon espace" où le/la
// collaborateur/trice consulte son planning et son compteur d'heures
// supplémentaires.
//
// Appelée depuis employes.html (module de gestion, réservé direction/
// référente) avec l'anon key : le filtrage par droits est déjà fait côté
// client, RLS limite déjà ce que l'appelant a pu charger. Cette fonction
// utilise le service role uniquement pour l'opération qu'un client anon ne
// peut pas faire elle-même : créer un compte auth.users pour un tiers.
//
// Déploiement :
//   supabase functions deploy creer-compte-collaborateur
// Secrets nécessaires : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, injectées
// automatiquement par la plateforme Supabase Edge Functions.
// L'URL passée en `redirect_to` (collaborateur.html) doit figurer dans la
// liste des "Redirect URLs" autorisées du projet Supabase (Auth > URL
// Configuration), sans quoi Supabase l'ignore et retombe sur l'URL par défaut.
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

  let body: { employe_id?: string; redirect_to?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { employe_id, redirect_to } = body;
  if (!employe_id) return json({ error: "employe_id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: employe, error: eErr } = await supabase
      .from("employes")
      .select("id, prenom, nom, email, user_id")
      .eq("id", employe_id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!employe) return json({ error: "collaborateur_introuvable" }, 404);
    if (employe.user_id) return json({ error: "compte_deja_existant" }, 400);
    if (!employe.email) return json({ error: "aucun_email" }, 400);

    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      employe.email,
      {
        redirectTo: redirect_to || undefined,
        data: {
          prenom: employe.prenom,
          nom: employe.nom,
          role_app: "collaborateur",
        },
      },
    );
    if (inviteErr) throw inviteErr;

    const { error: updErr } = await supabase
      .from("employes")
      .update({ user_id: invited.user.id })
      .eq("id", employe_id);
    if (updErr) throw updErr;

    return json({ ok: true, user_id: invited.user.id });
  } catch (err) {
    console.error("[creer-compte-collaborateur]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
