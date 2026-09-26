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

// Le prénom du membre de l'équipe qui a cliqué sur « Envoyer », transmis par
// l'appli. Jamais inséré tel quel dans un en-tête : un retour à la ligne y
// glisserait un en-tête arbitraire (injection SMTP).
function nomExpediteur(s: unknown) {
  const v = typeof s === "string" ? s.replace(/[\r\n<>]/g, "").trim() : "";
  // Seul le prénom du directeur ou de l'admin qui envoie, jamais le nom complet.
  const prenom = v.split(/\s+/)[0] || "";
  return prenom.slice(0, 60) || "Koala Kids";
}

async function sendEmail(to: string[], subject: string, html: string, expediteur?: string, orgNom?: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
  // "From" doit obligatoirement être l'adresse authentifiée elle-même : Gmail
  // rejette silencieusement tout expéditeur différent du compte SMTP utilisé.
  // Seul le nom affiché varie, selon qui a cliqué sur « Envoyer ».
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
      from: `${nomExpediteur(expediteur)} de ${orgNom || "Koalakids"} <${user}>`,
      to,
      subject,
      content: "Ce message nécessite un client de messagerie compatible HTML.",
      html,
    });
  } finally {
    await client.close();
  }
}

function piecesEmailHtml(opts: { enfant: string; creche: string; lien: string; relance: boolean; expire: string; orgNom?: string; logoUrl?: string }) {
  const orgNom = opts.orgNom || "Koala Kids";
  const logoUrl = opts.logoUrl || "https://koalakids-app.github.io/gestion-stock/logo-koalakids.png";
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
    font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;
      border:1px solid #E3E1EF">
      <table role="presentation" width="100%" style="border-collapse:collapse">
        <tr>
          <td style="background:#fff;padding:20px 24px;text-align:center">
            <img src="${logoUrl}" alt="${orgNom}"
              width="220" style="display:inline-block;height:auto">
          </td>
        </tr>
        <tr>
          <td style="background:#3D3580;color:#fff;padding:18px 24px">
            <div style="font-size:20px;font-weight:700">${opts.relance ? "Rappel — " : ""}Documents administratifs de ${opts.enfant}</div>
            <div style="font-size:14px;opacity:.85;margin-top:3px">${orgNom}${opts.creche ? ' · ' + opts.creche : ''}</div>
          </td>
        </tr>
      </table>
      <div style="padding:24px">
        <p style="margin:0 0 18px;font-size:15px">
          Pour compléter le dossier d'inscription de ${opts.enfant}, merci de déposer en ligne les
          documents administratifs demandés (pièce d'identité, justificatif de domicile, etc.).
          Vous pouvez le faire en plusieurs fois, depuis votre téléphone.
        </p>
        <p style="margin:0 0 22px;text-align:center">
          <a href="${opts.lien}" style="display:inline-block;background:#D4891A;color:#fff;text-decoration:none;
            font-weight:700;font-size:16px;padding:14px 30px;border-radius:11px">Déposer mes documents</a>
        </p>
        <p style="margin:0;font-size:13.5px;color:#78748C">Ce lien est valable jusqu'au ${opts.expire}.</p>
      </div>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { dossier_id?: string; relance?: boolean; lien?: string; expediteur?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { dossier_id, relance, lien, expediteur } = body;
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
      ? await supabase.from("creches").select("name, org_id").eq("id", enfant.creche_id).maybeSingle()
      : { data: null };
    let orgNom: string | undefined, logoUrl: string | undefined;
    if (creche?.org_id) {
      const { data: org } = await supabase.from("organisations")
        .select("nom, logo_url").eq("id", creche.org_id).maybeSingle();
      orgNom = org?.nom || undefined;
      logoUrl = org?.logo_url || undefined;
    }

    await sendEmail(
      emails,
      `${relance ? "Rappel — " : ""}Documents administratifs — ${enfant?.prenom || "votre enfant"}`,
      piecesEmailHtml({
        enfant: `${enfant?.prenom || ""} ${enfant?.nom || ""}`.trim() || "votre enfant",
        creche: creche?.name || "",
        lien,
        relance: !!relance,
        expire: new Date(dossier.expire_le).toLocaleDateString("fr-FR"),
        orgNom,
        logoUrl,
      }),
      expediteur,
      orgNom,
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
