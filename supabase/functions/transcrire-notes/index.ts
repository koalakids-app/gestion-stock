// Edge function "transcrire-notes"
// ============================================================================
// Transcrit en texte des notes manuscrites photographiées pendant une réunion
// (js/reunions-equipe.js, bouton "Photographier mes notes"). Le texte revenu
// est TOUJOURS relu et inséré manuellement par la directrice/le directeur
// technique côté client : cette fonction ne touche jamais la base, elle ne
// fait que transformer image → texte.
//
// RGPD : les comptes rendus peuvent citer des enfants, familles ou salarié·e·s
// (cf. sql/reunions_equipe_*.sql). Les photos ne sont ni stockées ni
// journalisées : elles ne transitent qu'en mémoire, pour l'appel à l'API
// Anthropic, puis sont jetées avec la fin de la requête. Aucun log ne doit
// contenir le contenu des images ou du texte transcrit (voir catch plus bas :
// on ne logue jamais `err` en entier s'il peut contenir la réponse du modèle,
// seulement un message générique).
//
// Contrairement aux autres fonctions de ce dépôt (appelées via callFn, qui
// envoie l'ANON_KEY comme "Authorization: Bearer" — donc sans identifier
// qui appelle), celle-ci reçoit le VRAI jeton de session de la personne
// connectée (voir kkTranscrireNotes dans js/reunions-equipe.js, qui appelle
// fetch directement avec sb.auth.getSession()). On peut donc vérifier ici
// que l'appelant a bien une fiche `referents` (directeur/trice technique ou
// direction) avant d'consommer le moindre appel IA — les auxiliaires n'ont
// pas de fiche referents et sont donc rejetées.
//
// Entrée attendue (JSON) :
//   { images: string[] }   // data URLs "data:image/jpeg;base64,...." — 1 à 5 pages
//
// Sortie (JSON) :
//   { ok: true, texte: string }
//   { ok: false, error: string }
//
// Secret nécessaire : ANTHROPIC_API_KEY (déjà utilisé par generer-planning-ia).
// Déploiement : supabase functions deploy transcrire-notes
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PAGES = 5;
const MAX_DATA_URL_LENGTH = 8_000_000; // ~6 Mo décodés, large marge sur un JPEG 1600px

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(dataUrl || "");
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1. Authentification : le VRAI jeton de la personne connectée, pas
    // l'anon key (cf. commentaire d'en-tête).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ ok: false, error: "Authentification requise." }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "Session invalide ou expirée." }, 401);
    }

    // 2. Autorisation : uniquement directeur/trice technique ou direction
    // (une fiche `referents` existe pour ces deux rôles, jamais pour une
    // auxiliaire).
    const { data: referent } = await admin
      .from("referents")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!referent) {
      return json({ ok: false, error: "Accès réservé aux directeurs techniques et à la direction." }, 403);
    }

    // 3. Entrée.
    const { images } = await req.json();
    if (!Array.isArray(images) || !images.length) {
      return json({ ok: false, error: "Aucune photo reçue." }, 400);
    }
    if (images.length > MAX_PAGES) {
      return json({ ok: false, error: `Trop de pages (maximum ${MAX_PAGES}).` }, 400);
    }

    const blocks: Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } }> = [];
    for (const raw of images) {
      if (typeof raw !== "string" || raw.length > MAX_DATA_URL_LENGTH) {
        return json({ ok: false, error: "Photo invalide ou trop volumineuse." }, 400);
      }
      const parsed = parseDataUrl(raw);
      if (!parsed) {
        return json({ ok: false, error: "Format de photo non supporté (JPEG, PNG ou WebP attendu)." }, 400);
      }
      blocks.push({ type: "image", source: { type: "base64", media_type: parsed.mediaType, data: parsed.data } });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ ok: false, error: "Transcription IA non configurée (clé API manquante)." }, 500);
    }
    const anthropic = new Anthropic({ apiKey });

    const consigne =
      "Tu transcris des notes manuscrites prises pendant une réunion de micro-crèche. " +
      "Transcris fidèlement, en français, exactement ce qui est écrit, sans reformuler, résumer, corriger le style ni inventer de contenu. " +
      "Conserve la structure d'origine : puces, tirets, retours à la ligne, titres de section s'il y en a. " +
      "Si un mot ou un passage est illisible ou incertain, remplace-le par [illisible] plutôt que de deviner. " +
      "S'il y a plusieurs pages, transcris-les dans l'ordre, à la suite. " +
      "Réponds uniquement par le texte transcrit, sans commentaire ni introduction.";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [...blocks, { type: "text", text: consigne }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ ok: false, error: "La transcription a été refusée par l'IA." }, 502);
    }

    const textBlock = (response.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text");
    if (!textBlock?.text) {
      return json({ ok: false, error: "Réponse de l'IA inattendue (pas de texte)." }, 502);
    }

    return json({ ok: true, texte: textBlock.text });
  } catch {
    // Ne jamais loguer `err` en entier : pourrait contenir un extrait du
    // texte transcrit (donc potentiellement des données personnelles).
    console.error("[transcrire-notes] échec de la transcription");
    return json({ ok: false, error: "Erreur inattendue pendant la transcription." }, 500);
  }
});
