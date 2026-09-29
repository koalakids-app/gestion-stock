// Edge function "delete-referent"
// ============================================================================
// Supprime la fiche `referents` d'un(e) directeur/trice technique et son
// compte de connexion associé (auth.users).
//
// Récupérée du dashboard Supabase le 26/09/2026 : cette fonction était
// déployée en prod mais jamais versionnée dans le dépôt, et — plus grave —
// ne vérifiait ni l'identité de l'appelant·e ni son organisation avant de
// supprimer. N'importe quel compte authentifié pouvait donc supprimer
// N'IMPORTE QUEL·LE référent·e de N'IMPORTE QUELLE organisation, en
// appelant directement la fonction avec un `referent_id` deviné/connu —
// sans passer par l'interface, qui ne montre ce bouton qu'à la direction.
// Corrigé en vérifiant que l'appelant·e a le rôle `direction` ET appartient
// à la même organisation que la fiche visée, avant toute suppression.
//
// Appelée depuis demandes.html (deleteRef → callFn) avec le jeton de la
// session en cours (voir callFn : il envoie sb.auth.getSession().access_token,
// pas la clé anon statique).
//
// Corrigé le 28/09/2026 : la fonction ne vérifiait le résultat d'aucune des
// deux suppressions (ni `referents.delete()`, ni `auth.admin.deleteUser()`)
// et renvoyait {ok:true} dans tous les cas. Repéré sur un cas réel : la
// fiche de Giovana Pethigou refusait de disparaître car des lignes
// `suivi_saisies.auteur_referent_id` la référençaient encore (contrainte
// NO ACTION) — Postgres rejetait la suppression (409), la fonction
// l'ignorait, tentait quand même de supprimer le compte auth.users (échec
// à son tour, 500, la fiche étant toujours là), puis répondait quand même
// {ok:true}. Le front affichait "supprimé" alors que rien ne l'était, d'où
// la réapparition de la fiche au sync suivant. Désormais bloquée avec un
// message explicite quand des saisies de suivi dépendent encore de la
// fiche, plutôt que de mentir sur le succès.
//
// Déploiement :
//   supabase functions deploy delete-referent
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
    const { referent_id } = await req.json();
    if (!referent_id) return json({ ok: false, error: "referent_id requis" }, 400);

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

    const { count: nbSaisies } = await admin
      .from("suivi_saisies").select("id", { count: "exact", head: true })
      .eq("auteur_referent_id", referent_id);
    if (nbSaisies) {
      return json({
        ok: false,
        error: `Impossible : ${nbSaisies} saisie${nbSaisies > 1 ? "s" : ""} de suivi lié${nbSaisies > 1 ? "es" : "e"} à cette fiche. Contactez le support technique.`,
      }, 409);
    }

    const { error: erreurDelete } = await admin.from("referents").delete().eq("id", referent_id);
    if (erreurDelete) {
      return json({ ok: false, error: "Suppression de la fiche impossible : " + erreurDelete.message }, 409);
    }

    if (cible.user_id) {
      const { error: erreurUser } = await admin.auth.admin.deleteUser(cible.user_id);
      if (erreurUser) {
        return json({ ok: false, error: "Fiche supprimée, mais échec de la suppression du compte de connexion : " + erreurUser.message }, 500);
      }
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
