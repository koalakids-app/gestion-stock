// Edge function "dossier-pieces"
// ============================================================================
// API publique (aucune session Supabase) pour la page pieces.html, où une
// famille dépose en ligne les documents administratifs demandés à
// l'inscription. Même principe que dossier-famille / famille.html, en
// parallèle : la page ne touche à aucune table directement, tout passe par
// cette fonction en service_role, qui ne renvoie/n'écrit que ce qui
// correspond au jeton reçu.
//
// Actions (POST, body JSON) :
//   {action:'get', token}
//     -> {dossier:{expire_le,statut}, enfant:{prenom,creche_nom}, pieces:[{piece_key,filename,created_at}]}
//   {action:'upload', token, piece_key, filename, content_type, content_base64}
//     -> {ok:true}
//
// Stockage : bucket PRIVÉ `documents-admin` (même bucket que l'import fait
// par les référentes depuis la fiche enfant), table `enfants_documents_admin`.
// Les fichiers déposés par la famille ont piece_key renseigné et dossier_id
// pointant vers ce dossier ; ceux importés par une référente ont
// dossier_id=null. Aucune URL publique enregistrée : la fiche enfant génère
// une URL signée à chaque ouverture.
//
// Taille max acceptée : 8 Mo par fichier (limite de charge utile raisonnable
// pour un scan/photo ; au-delà, la famille doit compresser ou photographier
// en plusieurs fois).
//
// Déploiement :
//   supabase functions deploy dossier-pieces --no-verify-jwt
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

const BUCKET = "documents-admin";
const MAX_BYTES = 8 * 1024 * 1024;

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

  const { data: dossier, error: dErr } = await supabase
    .from("dossiers_pieces")
    .select("id, enfant_id, statut, expire_le")
    .eq("token", token)
    .maybeSingle();
  if (dErr) {
    console.error("[dossier-pieces] lecture dossier", dErr);
    return erreur("erreur_lecture", 500);
  }
  if (!dossier) return erreur("introuvable", 404);
  if (dossier.statut === "annule") return erreur("annule", 410);
  if (new Date(dossier.expire_le).getTime() < Date.now()) return erreur("expire", 410);

  if (action === "get") {
    const { data: enfant } = await supabase
      .from("enfants").select("prenom, nom, creche_id").eq("id", dossier.enfant_id).maybeSingle();
    const { data: creche } = enfant
      ? await supabase.from("creches").select("name").eq("id", enfant.creche_id).maybeSingle()
      : { data: null };

    const { data: pieces, error: pErr } = await supabase
      .from("enfants_documents_admin")
      .select("piece_key, filename, created_at")
      .eq("enfant_id", dossier.enfant_id)
      .not("piece_key", "is", null)
      .order("created_at", { ascending: false });
    if (pErr) {
      console.error("[dossier-pieces] lecture pieces", pErr);
      return erreur("erreur_lecture", 500);
    }
    return json({
      dossier: { expire_le: dossier.expire_le, statut: dossier.statut },
      enfant: { prenom: enfant?.prenom || "", creche_nom: creche?.name || "" },
      pieces: pieces || [],
    });
  }

  if (action === "upload") {
    const pieceKey = ((body.piece_key as string) || "").trim();
    const filename = ((body.filename as string) || "fichier").trim();
    const contentType = (body.content_type as string) || "application/octet-stream";
    const contentBase64 = body.content_base64 as string;
    if (!pieceKey) return erreur("piece_key_manquant");
    if (!contentBase64) return erreur("fichier_manquant");

    let bytes: Uint8Array;
    try {
      const bin = atob(contentBase64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return erreur("fichier_invalide");
    }
    if (bytes.byteLength > MAX_BYTES) return erreur("fichier_trop_volumineux");

    const ext = (filename.split(".").pop() || "bin").toLowerCase();
    const path = `${dossier.enfant_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
    if (upErr) {
      console.error("[dossier-pieces] upload storage", upErr);
      return erreur("upload_impossible", 500);
    }

    const { error: insErr } = await supabase.from("enfants_documents_admin").insert({
      enfant_id: dossier.enfant_id,
      bucket: BUCKET,
      path,
      filename,
      piece_key: pieceKey,
      dossier_id: dossier.id,
    });
    if (insErr) {
      console.error("[dossier-pieces] insertion", insErr);
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      return erreur("enregistrement_impossible", 500);
    }

    return json({ ok: true });
  }

  return erreur("action_inconnue");
});
