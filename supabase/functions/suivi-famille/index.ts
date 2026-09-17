// Edge function "suivi-famille"
// ============================================================================
// API publique (aucune session Supabase) pour la page famille-suivi.html, où
// une famille consulte les synthèses publiées de son enfant. Même principe
// que dossier-pieces/famille.html : la page ne touche à aucune table
// directement, tout passe par cette fonction en service_role, qui ne
// renvoie que ce qui correspond au jeton reçu — et seulement le contenu
// marqué "famille" de chaque synthèse (jamais contenu.interne).
//
// Le jeton n'est jamais fabriqué ici : il est créé côté direction/référente,
// sous RLS, dans suivi_acces_famille (voir sql/37e). Connaître son URL ne
// permet donc pas de générer un accès à un autre enfant.
//
// Actions (POST, body JSON) :
//   {action:'get', token}
//     -> {enfant:{prenom}, creche_nom, parent:{prenom,lien}, syntheses:[
//          {id, periode_type, periode_debut, periode_fin, publiee_le, famille:[...]}
//        ]}
//     Journalise une ligne dans suivi_consultations par synthèse renvoyée.
//
// Règle de publication déjà appliquée en amont (trigger SQL
// kk_suivi_verifier_publication) : cette fonction ne fait que filtrer sur
// statut='publiee', elle ne republie ni ne vérifie le départ elle-même.
//
// Déploiement :
//   supabase functions deploy suivi-famille --no-verify-jwt
// (--no-verify-jwt : la famille n'a pas de compte, voir README section
// "Pages publiques".)
// Aucun secret supplémentaire : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
// sont injectées automatiquement par la plateforme.
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

function erreur(msg: string, status = 400) {
  return json({ erreur: msg }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return erreur("method_not_allowed", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erreur("corps_invalide");
  }
  const action = body.action as string;
  const token = ((body.token as string) || "").trim();
  if (!token) return erreur("jeton_manquant");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: acces, error: aErr } = await supabase
    .from("suivi_acces_famille")
    .select("id, enfant_id, creche_id, parent_id, actif")
    .eq("token", token)
    .maybeSingle();
  if (aErr) {
    console.error("[suivi-famille] lecture accès", aErr);
    return erreur("erreur_lecture", 500);
  }
  if (!acces) return erreur("introuvable", 404);
  if (!acces.actif) return erreur("revoque", 410);

  if (action === "get") {
    const [{ data: enfant }, { data: parent }] = await Promise.all([
      supabase.from("enfants").select("prenom, creche_id").eq("id", acces.enfant_id).maybeSingle(),
      supabase.from("enfants_parents").select("prenom, lien").eq("id", acces.parent_id).maybeSingle(),
    ]);
    const { data: creche } = enfant
      ? await supabase.from("creches").select("name").eq("id", enfant.creche_id).maybeSingle()
      : { data: null };

    const { data: syntheses, error: sErr } = await supabase
      .from("suivi_syntheses")
      .select("id, periode_type, periode_debut, periode_fin, publiee_le, contenu")
      .eq("enfant_id", acces.enfant_id)
      .eq("statut", "publiee")
      .order("periode_debut", { ascending: false });
    if (sErr) {
      console.error("[suivi-famille] lecture synthèses", sErr);
      return erreur("erreur_lecture", 500);
    }

    const liste = (syntheses || []).map((s) => ({
      id: s.id,
      periode_type: s.periode_type,
      periode_debut: s.periode_debut,
      periode_fin: s.periode_fin,
      publiee_le: s.publiee_le,
      famille: (s.contenu && s.contenu.famille) || [],
      note_referente:
        s.contenu && typeof s.contenu.note_referente === "string" ? s.contenu.note_referente : "",
    }));

    if (liste.length) {
      const journal = liste.map((s) => ({ acces_id: acces.id, synthese_id: s.id, creche_id: acces.creche_id }));
      const { error: jErr } = await supabase.from("suivi_consultations").insert(journal);
      if (jErr) console.error("[suivi-famille] journalisation consultation", jErr);
    }

    return json({
      enfant: { prenom: enfant?.prenom || "" },
      creche_nom: creche?.name || "",
      parent: { prenom: parent?.prenom || "", lien: parent?.lien || "" },
      syntheses: liste,
    });
  }

  return erreur("action_inconnue");
});
