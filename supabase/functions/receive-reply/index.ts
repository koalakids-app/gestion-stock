// Edge function "receive-reply" — DÉSACTIVÉE le 26/09/2026
// ============================================================================
// Fonction legacy : notifiait un e-mail Outlook codé en dur
// (cp1.koalakids@outlook.fr) via Resend quand un(e) référent·e répondait à
// une consigne, et écrivait dans la table `replies`.
//
// Retirée de l'audit multi-tenant du 26/09/2026 : plus aucun appelant dans
// le code actuel (notify-consigne / demandes.html gèrent les consignes
// aujourd'hui), table `replies` vide (0 ligne), branding et destinataire
// Koala Kids en dur — incompatible avec une organisation cliente, et sans
// vérification d'identité/organisation de l'appelant·e (même classe de
// problème que create-referent/delete-referent avant leur correction).
//
// Pas d'outil de suppression d'edge function disponible au moment de cet
// audit : plutôt que de la laisser active, elle est remplacée par ce stub
// qui ne fait plus rien. À supprimer pour de bon depuis le dashboard
// Supabase (Edge Functions > receive-reply > Delete) dès que possible —
// et cette fois retirer aussi ce dossier du dépôt et sa ligne dans
// deploy-functions.yml (si elle y est ajoutée) pour ne pas la redéployer.
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  return new Response(
    JSON.stringify({ error: "Fonction désactivée (legacy, non utilisée)." }),
    { status: 410, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
