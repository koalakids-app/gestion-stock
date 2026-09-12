import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Envoi par SMTP Gmail plutôt que Resend : Resend exige un domaine expéditeur
// vérifié (DNS), pas encore disponible (koalakids.fr en attente d'accès DNS).
// Secrets nécessaires (mêmes noms pour toutes les fonctions d'envoi d'e-mail
// de l'appli) :
//   GMAIL_USER           adresse Gmail d'expédition (ex. koalakids.app@gmail.com)
//   GMAIL_APP_PASSWORD   mot de passe d'application à 16 caractères, généré
//                        depuis myaccount.google.com/apppasswords
const GMAIL_USER         = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const APP_URL            = Deno.env.get("APP_URL") ?? "https://koalakids.fr";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// denomailer encode mal l'en-tête Subject dès qu'il contient un caractère hors
// du plan multilingue de base (emoji, notamment — 4 octets en UTF-8) : le
// message entier arrive corrompu (MIME brut affiché comme texte). Le corps
// HTML n'est pas concerné, seul le sujet est ramené à de l'ASCII.
function asciiSafe(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
  // "From" doit obligatoirement être l'adresse authentifiée elle-même : Gmail
  // rejette silencieusement tout expéditeur différent du compte SMTP utilisé.
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });
  try {
    await client.send({
      from: GMAIL_USER,
      to,
      subject,
      content: "Ce message nécessite un client de messagerie compatible HTML.",
      html,
    });
  } finally {
    await client.close();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { referent } = await req.json();
    const { id, name, email, creche } = referent;

    if (!email) {
      return new Response(JSON.stringify({ ok: false, reason: "no email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ ok: false, reason: "GMAIL_USER/GMAIL_APP_PASSWORD not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lien personnalisé vers la page référent
    const refUrl = `${APP_URL}/referent.html?id=${id}&name=${encodeURIComponent(name)}&creche=${encodeURIComponent(creche || "")}`;

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f4f4f6;padding:20px">
        <div style="background:#3D3580;border-radius:12px 12px 0 0;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px">🐨 Koala Kids</h1>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px">Espace référent pédagogique</p>
        </div>
        <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e0dff0;border-top:none">
          <p style="color:#555;margin-top:0;font-size:15px">Bonjour <strong>${name}</strong>,</p>
          <p style="color:#555;font-size:14px;line-height:1.6">
            Vous avez été ajouté(e) comme référent(e) pédagogique de la crèche <strong>${creche || "Koala Kids"}</strong>.
          </p>
          <p style="color:#555;font-size:14px;line-height:1.6">
            Votre espace personnel vous permet de :
          </p>
          <ul style="color:#555;font-size:14px;line-height:2;padding-left:20px">
            <li>📋 Consulter et répondre aux consignes de la direction</li>
            <li>📅 Renseigner votre planning hebdomadaire</li>
            <li>📩 Soumettre vos demandes et signalements</li>
          </ul>
          <div style="text-align:center;margin:28px 0 16px">
            <a href="${refUrl}" style="background:#F47920;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
              Accéder à mon espace →
            </a>
          </div>
          <div style="background:#f8f7ff;border-radius:8px;padding:12px 16px;margin-top:16px">
            <p style="margin:0;font-size:12px;color:#888">🔗 Votre lien personnel (à conserver) :</p>
            <p style="margin:6px 0 0;font-size:12px;word-break:break-all"><a href="${refUrl}" style="color:#3D3580">${refUrl}</a></p>
          </div>
        </div>
        <p style="text-align:center;color:#aaa;font-size:11px;margin-top:12px">© Koala Kids — Ce message est automatique.</p>
      </div>`;

    await sendEmail(email, asciiSafe(`Votre accès Koala Kids — ${creche || "Espace référent"}`), html);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
