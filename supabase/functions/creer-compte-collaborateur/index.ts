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
// référente) avec le jeton de la session en cours (callFn envoie
// sb.auth.getSession().access_token, pas la clé anon statique).
//
// Vérifie que l'appelant·e est bien un compte referents (direction ou
// référent·e) ET que la fiche employe visée appartient à sa propre
// organisation, avant d'inviter qui que ce soit — ajouté le 26/09/2026 en
// auditant les autres fonctions liées aux comptes après la découverte du
// même trou dans create-referent/delete-referent/reset-referent-password :
// sans ce contrôle, n'importe quel compte authentifié pouvait déclencher
// une invitation pour n'importe quel employe_id, y compris d'une autre
// organisation (impact limité — l'invitation part à l'adresse déjà
// enregistrée sur la fiche visée, pas de prise de contrôle directe possible
// — mais même classe de problème que les autres, corrigé par cohérence).
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
    const callerId = subDuJeton(req.headers.get("Authorization"));
    if (!callerId) return json({ error: "authentification_manquante" }, 401);

    const { data: caller } = await supabase
      .from("referents").select("org_id").eq("user_id", callerId).maybeSingle();
    if (!caller?.org_id) return json({ error: "organisation_introuvable" }, 403);

    const { data: employe, error: eErr } = await supabase
      .from("employes")
      .select("id, prenom, nom, email, user_id, creche_id")
      .eq("id", employe_id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!employe) return json({ error: "collaborateur_introuvable" }, 404);
    if (employe.user_id) return json({ error: "compte_deja_existant" }, 400);
    if (!employe.email) return json({ error: "aucun_email" }, 400);

    const { data: creche } = employe.creche_id
      ? await supabase.from("creches").select("org_id").eq("id", employe.creche_id).maybeSingle()
      : { data: null };
    if (creche?.org_id !== caller.org_id) {
      return json({ error: "organisation_differente" }, 403);
    }

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
