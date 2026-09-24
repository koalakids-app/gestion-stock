// Supabase Edge Function : notify-message
// Envoie un e-mail lorsqu'une réponse est postée dans le fil de discussion d'une demande.
// Envoi par SMTP Gmail plutôt que Resend (cf. notify-demand).
//
// Payload attendu (envoyé par demandes.html → sendThreadMessage) :
// { message: { to_email, to_name, author_name, body, subject, creche, demande_id } }
//
// VARIABLES D'ENVIRONNEMENT : GMAIL_USER, GMAIL_APP_PASSWORD.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendEmail(to: string, subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
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
      to: [to],
      subject,
      content: "Ce message nécessite un client de messagerie compatible HTML.",
      html,
    });
  } finally {
    await client.close();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { message } = await req.json();
    if (!message || !message.to_email) {
      return new Response(
        JSON.stringify({ error: "to_email manquant" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const {
      to_email,
      to_name = "",
      author_name = "Un collègue",
      body = "",
      subject = "Demande",
      creche = "",
    } = message;

    const safe = (s: string) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#333">
        <div style="background:#6C5CE7;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
          <div style="font-size:15px;font-weight:700">💬 Nouvelle réponse</div>
          <div style="font-size:12px;opacity:.9;margin-top:2px">${safe(subject)}${creche ? " · " + safe(creche) : ""}</div>
        </div>
        <div style="border:1px solid #eee;border-top:none;padding:18px 20px;border-radius:0 0 10px 10px">
          <p style="margin:0 0 8px;font-size:13px;color:#666">Bonjour ${safe(to_name) || ""},</p>
          <p style="margin:0 0 12px;font-size:14px"><strong>${safe(author_name)}</strong> a répondu à la demande :</p>
          <div style="background:#F4F2EF;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.5;white-space:pre-wrap">${safe(body)}</div>
          <p style="margin:16px 0 0;font-size:12px;color:#999">Connectez-vous à l'application Koala Kids pour répondre à votre tour.</p>
        </div>
      </div>`;

    try {
      await sendEmail(to_email, `💬 Réponse — ${subject}`, html);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "smtp", detail: String(e) }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
