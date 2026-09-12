// Edge function "envoyer-dossier-pieces"
// ============================================================================
// Envoie par e-mail (SMTP Gmail) le lien vers pieces.html, où une famille
// dépose en ligne les documents administratifs demandés (pièce d'identité,
// justificatif de domicile, etc.). Même principe que le dossier de
// familiarisation (envoyer-dossier-famille / famille.html), en parallèle :
// pipeline entièrement distincte pour ne pas toucher à celle qui tourne.
//
// Le lien complet est fourni par l'appelant (demandes.html connaît sa propre
// origine — GitHub Pages, domaine perso...) : cette fonction n'a donc pas
// besoin de connaître l'URL de l'app, aucun secret supplémentaire à poser.
//
// Appelée depuis demandes.html (enfConfirmerEnvoiPieces / enfRelancerPieces
// → callFn) avec l'anon key : le filtrage par droits est déjà fait côté
// client (module visible aux comptes direction/référente seulement), et
// cette fonction ne lit que le dossier demandé, via son id.
//
// Envoi par SMTP Gmail plutôt que Resend : Resend exige un domaine expéditeur
// vérifié (DNS), pas encore disponible (koalakids.fr en attente d'accès DNS).
// Un compte Gmail avec validation en deux étapes + mot de passe d'application
// suffit, sans dépendance à un domaine.
//
// Déploiement :
//   supabase functions deploy envoyer-dossier-pieces
// Secrets nécessaires (mêmes noms pour toutes les fonctions d'envoi d'e-mail
// de l'appli — voir `supabase secrets list`) :
//   GMAIL_USER           — adresse Gmail d'expédition (ex. koalakids.app@gmail.com)
//   GMAIL_APP_PASSWORD   — mot de passe d'application à 16 caractères (pas le
//                          mot de passe du compte), généré depuis
//                          myaccount.google.com/apppasswords
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement par
// la plateforme Supabase Edge Functions, pas besoin de les poser à la main.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
  // "From" doit obligatoirement être l'adresse authentifiée elle-même : Gmail
  // rejette silencieusement tout expéditeur différent du compte SMTP utilisé.
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from: user,
      to,
      subject,
      content: "Ce message nécessite un client de messagerie compatible HTML.",
      html,
    });
  } finally {
    await client.close();
  }
}

function piecesEmailHtml(opts: { enfant: string; creche: string; lien: string; relance: boolean; expire: string }) {
  return `
    <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#4A3F9F;margin:0 0 4px">${opts.relance ? "Rappel — " : ""}Documents administratifs de ${opts.enfant}</h2>
      <p style="color:#8E8AA8;margin:0 0 20px">${opts.creche}</p>
      <p style="color:#2B2740;font-size:14px;line-height:1.6">
        Pour compléter le dossier d'inscription de ${opts.enfant}, merci de déposer en ligne les
        documents administratifs demandés (pièce d'identité, justificatif de domicile, etc.).
        Vous pouvez le faire en plusieurs fois, depuis votre téléphone.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="${opts.lien}" style="display:inline-block;background:#D4891A;color:#fff;text-decoration:none;
           padding:12px 24px;border-radius:10px;font-weight:700">Déposer mes documents</a>
      </div>
      <p style="color:#8E8AA8;font-size:12.5px">Ce lien est valable jusqu'au ${opts.expire}.</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { dossier_id?: string; relance?: boolean; lien?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { dossier_id, relance, lien } = body;
  if (!dossier_id) return json({ error: "dossier_id_manquant" }, 400);
  if (!lien) return json({ error: "lien_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: dossier, error: dErr } = await supabase
      .from("dossiers_pieces")
      .select("id, enfant_id, email, expire_le, relances")
      .eq("id", dossier_id)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!dossier) return json({ error: "dossier_introuvable" }, 404);

    const emails = (dossier.email || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!emails.length) return json({ error: "aucun_email" }, 400);

    const { data: enfant } = await supabase
      .from("enfants").select("prenom, nom, creche_id").eq("id", dossier.enfant_id).maybeSingle();
    const { data: creche } = enfant
      ? await supabase.from("creches").select("name").eq("id", enfant.creche_id).maybeSingle()
      : { data: null };

    await sendEmail(
      emails,
      `${relance ? "Rappel — " : ""}Documents administratifs — ${enfant?.prenom || "votre enfant"}`,
      piecesEmailHtml({
        enfant: `${enfant?.prenom || ""} ${enfant?.nom || ""}`.trim() || "votre enfant",
        creche: creche?.name || "",
        lien,
        relance: !!relance,
        expire: new Date(dossier.expire_le).toLocaleDateString("fr-FR"),
      }),
    );

    if (relance) {
      await supabase.from("dossiers_pieces")
        .update({ relances: (dossier.relances || 0) + 1 })
        .eq("id", dossier_id);
    }

    return json({ ok: true, sent_to: emails.length });
  } catch (err) {
    console.error("[envoyer-dossier-pieces]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
