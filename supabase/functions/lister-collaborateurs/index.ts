// Edge function "lister-collaborateurs"
// ============================================================================
// Renvoie la liste des collaborateurs/trices (table `employes`) et des
// directrices techniques/direction (table `referents`), groupée par crèche,
// pour que l'espace "Quiz & Formations" (koalakids-app/quiz-protocoles,
// admin.html — projet Supabase distinct) puisse proposer une case à cocher
// par personne au moment d'assigner un quiz ou une micro-formation.
//
// admin.html s'authentifie sur SON PROPRE projet Supabase (compte direction
// séparé) : il n'a donc pas de session valable ici, et ne peut pas passer par
// les policies RLS habituelles (qui exigent un `auth.uid()` dans la table
// `referents` de CE projet). Protégé par une clé partagée (`x-formations-key`,
// secret FORMATIONS_SHARED_KEY) plutôt que par une session : la même clé est
// intégrée à admin.html. Elle ne fait qu'écarter un usage non prévu — comme
// tout ce qui est intégré côté client, elle reste visible dans le code source
// de la page, ce qui est cohérent avec le niveau de risque du reste de
// l'application (clé anonyme Supabase déjà publique).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-formations-key",
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

  const sharedKey = Deno.env.get("FORMATIONS_SHARED_KEY");
  if (!sharedKey || req.headers.get("x-formations-key") !== sharedKey) {
    return json({ error: "non_autorise" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const [{ data: employes, error: eErr }, { data: referents, error: rErr }, { data: creches, error: cErr }] =
      await Promise.all([
        supabase.from("employes").select("id, prenom, nom, email, creche_id").order("prenom"),
        supabase.from("referents").select("id, name, email, creche_id").order("name"),
        supabase.from("creches").select("id, name").order("name"),
      ]);
    if (eErr) throw eErr;
    if (rErr) throw rErr;
    if (cErr) throw cErr;

    const crecheNom = (id: string | null) => creches?.find((c) => c.id === id)?.name || "";

    const collaborateurs = [
      ...(employes || []).map((e) => ({
        id: e.id,
        type: "employe" as const,
        nom: `${e.prenom || ""} ${e.nom || ""}`.trim(),
        email: e.email,
        creche: crecheNom(e.creche_id),
      })),
      ...(referents || []).map((r) => ({
        id: r.id,
        type: "referent" as const,
        nom: r.name || "",
        email: r.email,
        creche: crecheNom(r.creche_id),
      })),
    ];

    return json({ collaborateurs }, 200);
  } catch (err) {
    console.error("[lister-collaborateurs]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
