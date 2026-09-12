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
