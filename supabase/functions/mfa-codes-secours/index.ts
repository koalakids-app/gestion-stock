// Edge function "mfa-codes-secours"
// ============================================================================
// Codes de secours de la double authentification (TOTP). Tables : voir
// sql/mfa_codes_secours.sql (à appliquer avant le déploiement).
//
// Actions (POST JSON, jeton de l'utilisateur·trice dans Authorization) :
//   - { action: "statut" }               -> { ok, restants }
//   - { action: "generer" }              -> { ok, codes: ["ABCDE-FGHJK", ...] }
//        Exige une session « aal2 » (code TOTP saisi à cette connexion) : on ne
//        crée pas de codes de secours avec un simple mot de passe. Remplace les
//        codes précédents (ils ne fonctionnent plus).
//   - { action: "utiliser", code }       -> { ok, restants }
//        Session « aal1 » suffisante (mot de passe saisi, TOTP perdu). Si le code
//        est valable, il est consommé et les appareils TOTP du compte sont
//        retirés ; la personne en enregistre un nouveau à l'écran suivant.
//        5 essais ratés = 15 minutes de pause.
//
// Les codes ne sont jamais stockés en clair (SHA-256 de « user_id:CODE »).
//
// Déploiement :
//   supabase functions deploy mfa-codes-secours
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (injectées par la plateforme).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NB_CODES = 10;
const ESSAIS_MAX = 5;
const PAUSE_MS = 15 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 signes, sans I, O, 0, 1

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Contenu du JWT (verify_jwt actif : la plateforme a déjà validé la signature). */
function chargeUtile(authHeader: string | null): Record<string, unknown> | null {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  const partie = token.split(".")[1];
  if (!partie) return null;
  try {
    let b64 = partie.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

function normaliser(code: string): string {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function empreinte(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${normaliser(code)}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nouveauCode(): string {
  const octets = crypto.getRandomValues(new Uint8Array(10));
  const s = Array.from(octets).map((b) => ALPHABET[b % 32]).join("");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, code } = await req.json().catch(() => ({}));
    const jwt = chargeUtile(req.headers.get("Authorization"));
    const userId = jwt && typeof jwt.sub === "string" ? jwt.sub : null;
    if (!userId) return json({ ok: false, error: "Authentification manquante." }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(url, cle, { auth: { autoRefreshToken: false, persistSession: false } });

    const restants = async () => {
      const { count } = await admin.from("mfa_codes_secours")
        .select("id", { count: "exact", head: true }).eq("user_id", userId).is("utilise_le", null);
      return count ?? 0;
    };

    if (action === "statut") return json({ ok: true, restants: await restants() });

    if (action === "generer") {
      if (jwt?.aal !== "aal2") {
        return json({ ok: false, error: "Reconnectez-vous avec votre code d'authentification pour générer des codes." }, 403);
      }
      const codes = Array.from({ length: NB_CODES }, nouveauCode);
      await admin.from("mfa_codes_secours").delete().eq("user_id", userId);
      const lignes = await Promise.all(codes.map(async (c) => ({ user_id: userId, code_hash: await empreinte(userId, c) })));
      const { error } = await admin.from("mfa_codes_secours").insert(lignes);
      if (error) return json({ ok: false, error: "Enregistrement impossible : " + error.message }, 500);
      return json({ ok: true, codes });
    }

    if (action === "utiliser") {
      const saisi = normaliser(code);
      if (saisi.length !== 10) return json({ ok: false, error: "Code de secours invalide." }, 400);

      const { data: ess } = await admin.from("mfa_codes_secours_essais").select("essais, dernier").eq("user_id", userId).maybeSingle();
      const recent = ess && Date.now() - new Date(ess.dernier).getTime() < PAUSE_MS;
      if (ess && recent && ess.essais >= ESSAIS_MAX) {
        return json({ ok: false, error: "Trop d'essais. Réessayez dans 15 minutes." }, 429);
      }

      const h = await empreinte(userId, saisi);
      const { data: ligne } = await admin.from("mfa_codes_secours")
        .select("id").eq("user_id", userId).eq("code_hash", h).is("utilise_le", null).maybeSingle();
      if (!ligne) {
        const essais = (ess && recent ? ess.essais : 0) + 1;
        await admin.from("mfa_codes_secours_essais").upsert({ user_id: userId, essais, dernier: new Date().toISOString() });
        return json({ ok: false, error: "Code de secours invalide ou déjà utilisé." }, 400);
      }

      // Consommation atomique : un seul appel peut passer de « non utilisé » à « utilisé ».
      const { data: pris } = await admin.from("mfa_codes_secours")
        .update({ utilise_le: new Date().toISOString() }).eq("id", ligne.id).is("utilise_le", null).select("id");
      if (!pris || !pris.length) return json({ ok: false, error: "Code de secours invalide ou déjà utilisé." }, 400);

      // Retire les appareils TOTP du compte (API d'administration Auth).
      const entetes = { apikey: cle, Authorization: `Bearer ${cle}` };
      const rl = await fetch(`${url}/auth/v1/admin/users/${userId}/factors`, { headers: entetes });
      if (!rl.ok) return json({ ok: false, error: "Impossible de lire les appareils du compte." }, 500);
      const facteurs = await rl.json();
      for (const f of Array.isArray(facteurs) ? facteurs : []) {
        const rd = await fetch(`${url}/auth/v1/admin/users/${userId}/factors/${f.id}`, { method: "DELETE", headers: entetes });
        if (!rd.ok) return json({ ok: false, error: "Impossible de retirer l'ancien appareil." }, 500);
      }
      await admin.from("mfa_codes_secours_essais").delete().eq("user_id", userId);
      return json({ ok: true, restants: await restants() });
    }

    return json({ ok: false, error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Erreur." }, 500);
  }
});
