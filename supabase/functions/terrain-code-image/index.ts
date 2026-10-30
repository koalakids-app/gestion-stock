// Edge function "terrain-code-image"
// ============================================================================
// Accès terrain par code image (option par crèche, cf. sql/terrain_code_image.sql).
// La tablette envoie son jeton et le code de 4 images ; la fonction vérifie via
// kk_terrain_identifier (réservée au service, avec blocage après 5 échecs) puis
// renvoie un jeton à usage unique que la page échange contre la session DE LA
// PERSONNE (supabase.auth.verifyOtp). Rien n'est envoyé par e-mail.
//
// POST JSON : { token, code: ["ours", ...4 images] }
//   -> { ok: true, token_hash, label }   ou   { ok: false, error }
//
// Déploiement (sans JWT : la tablette n'a pas de compte) :
//   supabase functions deploy terrain-code-image --no-verify-jwt
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (injectées par la plateforme).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MESSAGES: Record<string, string> = {
  token_invalide: "Tablette non configurée. Contactez la direction.",
  mode_desactive: "L'accès par code image n'est pas activé pour cette crèche.",
  trop_de_tentatives: "Trop d'essais. Réessayez dans 10 minutes.",
  code_invalide: "Choisissez 4 images distinctes.",
  code_inconnu: "Code inconnu. Vérifiez les images et réessayez.",
  code_ambigu: "Ce code correspond à deux personnes. Contactez la direction.",
  code_direction: "La direction se connecte avec son e-mail et son mot de passe.",
  sans_compte: "Votre compte n'est pas encore créé. Contactez la direction.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Méthode non autorisée." }, 405);

  try {
    const { token, code } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token) || !Array.isArray(code)) {
      return json({ ok: false, error: MESSAGES.code_invalide }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(url, cle, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data, error } = await admin.rpc("kk_terrain_identifier", { p_token: token, p_code: code });
    if (error) return json({ ok: false, error: "Vérification impossible : " + error.message }, 500);
    const ligne = Array.isArray(data) ? data[0] : data;
    if (!ligne || !ligne.ok) {
      const e = ligne?.error as string | undefined;
      return json({ ok: false, error: (e && MESSAGES[e]) || "Code refusé.", code: e ?? null }, 403);
    }

    const { data: u, error: ue } = await admin.auth.admin.getUserById(ligne.user_id);
    const email = u?.user?.email;
    if (ue || !email) return json({ ok: false, error: MESSAGES.sans_compte, code: "sans_compte" }, 403);

    const { data: lien, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = lien?.properties?.hashed_token;
    if (le || !tokenHash) return json({ ok: false, error: "Ouverture de session impossible." }, 500);

    return json({ ok: true, token_hash: tokenHash, label: ligne.label });
  } catch (e) {
    return json({ ok: false, error: "Erreur : " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
