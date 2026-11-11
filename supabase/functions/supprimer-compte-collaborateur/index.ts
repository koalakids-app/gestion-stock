// Edge function "supprimer-compte-collaborateur"
// ============================================================================
// Supprime le compte de connexion (auth.users) d'un(e) collaborateur/trice.
// Appelée depuis Demandes › Collaborateurs AVANT la suppression de la fiche
// `employes` (supprimer la ligne ne supprime pas le compte auth.users, ce qui
// laissait un compte orphelin bloquant la réutilisation de l'adresse e-mail).
//
// CONTRÔLES FAITS ICI (la fonction tourne en service_role : sans eux, la clé
// anon publique + un user_id suffisaient à supprimer n'importe quel compte) :
//   - l'appelant·e est identifié·e (jeton de session, _shared/appelant.ts) ;
//   - c'est la direction ou un·e référent·e ;
//   - la fiche `employes` indiquée existe, porte bien ce `user_id`, et sa
//     crèche relève de l'appelant·e (même règle que la RLS, kk_acces_creche_gestion) ;
//   - le compte n'est pas celui d'un·e directeur/trice ou référent·e.
//
// Corps : { employe_id, user_id }. Le client supprime la fiche seulement si
// cette fonction répond ok.
//
// Déploiement : supabase functions deploy supprimer-compte-collaborateur
// (vérification JWT active, par défaut).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { identifierAppelant, peutGererCreche } from "../_shared/appelant.ts";

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

  let body: { user_id?: string; employe_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { user_id, employe_id } = body;
  if (!user_id) return json({ error: "user_id_manquant" }, 400);
  if (!employe_id) return json({ error: "employe_id_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const appelant = await identifierAppelant(supabase, req);
    if (!appelant) return json({ error: "authentification_manquante" }, 401);
    if (appelant.role !== "direction" && appelant.role !== "referent") {
      return json({ error: "droits_insuffisants" }, 403);
    }

    const { data: employe } = await supabase
      .from("employes").select("id, user_id, creche_id").eq("id", employe_id).maybeSingle();
    if (!employe || employe.user_id !== user_id) return json({ error: "fiche_introuvable" }, 404);
    const { data: creche } = await supabase
      .from("creches").select("id, org_id").eq("id", employe.creche_id).maybeSingle();
    if (!peutGererCreche(appelant, creche)) return json({ error: "creche_non_autorisee" }, 403);

    // Jamais le compte d'un·e directeur/trice ou référent·e (seul l'accès terrain « employe » est lié à une fiche).
    const { data: profil } = await supabase
      .from("referents").select("role").eq("user_id", user_id).maybeSingle();
    if (profil && profil.role !== "employe") return json({ error: "compte_protege" }, 403);

    const { error } = await supabase.auth.admin.deleteUser(user_id);
    // "User not found" n'est pas une erreur : le compte a déjà été supprimé,
    // le résultat recherché est atteint.
    if (error && !/not.*found/i.test(error.message || "")) throw error;
    return json({ ok: true });
  } catch (err) {
    console.error("[supprimer-compte-collaborateur]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
