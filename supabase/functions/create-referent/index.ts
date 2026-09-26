// Edge function "create-referent"
// ============================================================================
// Crée (ou relie) le compte de connexion d'une référente/direction et pose sa
// fiche `referents`. Bascule d'une création directe avec mot de passe choisi
// par la direction vers une invitation Supabase (comme pour les
// collaborateurs/trices, cf. creer-compte-collaborateur) : la personne
// définit elle-même son mot de passe en suivant le lien reçu par e-mail,
// plutôt que de se faire communiquer un mot de passe en clair par un autre
// canal.
//
// Les colonnes must_change_password/temp_password de l'ancienne version
// n'étaient jamais lues côté client (aucun écran ne forçait le changement) —
// elles ne sont plus posées ici.
//
// Appelée depuis demandes.html (saveRef → callFn) avec l'anon key : le
// filtrage par droits est déjà fait côté client (module visible aux comptes
// direction uniquement).
//
// Déploiement :
//   supabase functions deploy create-referent
// Secrets nécessaires : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, injectées
// automatiquement par la plateforme Supabase Edge Functions.
// L'URL passée en `redirect_to` (demandes.html) doit figurer dans la liste
// des "Redirect URLs" autorisées du projet Supabase (Auth > URL
// Configuration) — déjà fait pour collaborateur.html, à vérifier pour
// demandes.html.
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
 *  revérifier sa signature : cette fonction a verify_jwt actif (voir
 *  supabase/config.toml ou le dashboard), donc la plateforme a déjà rejeté
 *  toute requête dont le jeton serait invalide ou expiré avant même que ce
 *  code ne s'exécute. Décoder le payload suffit donc pour connaître
 *  l'identité de l'appelant. (Évite de dépendre d'un deuxième client
 *  Supabase avec la clé anon, dont l'injection automatique en variable
 *  d'environnement s'est révélée peu fiable en pratique.) */
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
    const { email, name, creche_id, poste, role, redirect_to } = await req.json();
    if (!email || !name) {
      return json({ ok: false, error: "Champs requis" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // `referents.org_id` est NOT NULL, mais cette fonction tourne en
    // service_role : elle contourne la RLS et ne connaît donc pas
    // spontanément l'organisation de la personne appelante. On la résout à
    // partir de sa propre fiche referents (même principe que kk_mon_org(),
    // utilisée par les policies RLS, mais en lecture directe via le rôle
    // service pour ne pas dépendre d'un deuxième client anon).
    const callerId = subDuJeton(req.headers.get("Authorization"));
    if (!callerId) {
      return json({ ok: false, error: "Authentification manquante." }, 401);
    }
    const { data: callerRef, error: callerErr } = await admin
      .from("referents").select("org_id").eq("user_id", callerId).maybeSingle();
    if (callerErr || !callerRef?.org_id) {
      return json({ ok: false, error: "Organisation introuvable pour ce compte." }, 403);
    }
    const orgId = callerRef.org_id;

    // Vérifier si l'email existe déjà dans Auth (ex. compte collaborateur/trice
    // ou référent(e) déjà invité(e)) — on ne réinvite pas un compte existant,
    // on se contente de relier sa fiche referents à ce compte.
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string | undefined;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: redirect_to || undefined,
          data: { name, creche_id, poste },
        },
      );
      if (inviteErr) {
        return json({ ok: false, error: inviteErr.message }, 400);
      }
      userId = invited.user?.id;
    }

    // Vérifier si une ligne referents existe déjà pour ce user_id
    const { data: existingRef } = await admin.from("referents").select("id").eq("user_id", userId).maybeSingle();

    const row = {
      name, email,
      poste: poste || "",
      creche_id: creche_id || null,
      role: role || "referent",
      org_id: orgId,
    };

    if (existingRef) {
      const { error: updErr } = await admin.from("referents").update(row).eq("user_id", userId);
      if (updErr) return json({ ok: false, error: updErr.message }, 400);
    } else {
      const { error: dbError } = await admin.from("referents").insert({ ...row, user_id: userId });
      if (dbError) return json({ ok: false, error: dbError.message }, 400);
    }

    return json({ ok: true, user_id: userId });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
