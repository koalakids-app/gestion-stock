// ============================================================================
// supabase/functions/notify-demand/index.ts
// Envoi par SMTP Gmail plutôt que Resend : Resend exige un domaine expéditeur
// vérifié (DNS), pas encore disponible (koalakids.fr en attente d'accès DNS).
// VARIABLES D'ENVIRONNEMENT : GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAIL, APP_URL.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const APP_URL      = Deno.env.get("APP_URL")      ?? "https://koalakids.fr";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// L'email est un filet de secours : si le destinataire a une notification push
// active, il n'a pas besoin d'un email en plus pour la même chose.
async function hasActivePush(referentId: string | null | undefined) {
  if (!referentId) return false;
  const { data } = await sb.from("push_subscriptions").select("id").eq("referent_id", referentId).limit(1);
  return !!(data && data.length);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { demand } = await req.json();
    // Champs tels qu'envoyés par demandes.html (sendNewDemand) : snake_case,
    // referent_name/referent_email désignent le REFERENT DESTINATAIRE de la demande.
    const { subject, referent_name: referent, referent_email: referentEmail, to_referent_id: referentId, creche, priority, description: desc, date } = demand;
    const referentPushActive = await hasActivePush(referentId);

    const priorityLabel = priority === "urgent" ? "🔴 URGENTE" : priority === "info" ? "ℹ️ Information" : "Normale";
    const priorityColor = priority === "urgent" ? "#e03e3e" : priority === "info" ? "#F47920" : "#3D3580";

    const emailBody = (recipientName: string, isAdmin: boolean) => `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f4f4f6;padding:20px">
        <div style="background:#3D3580;border-radius:12px 12px 0 0;padding:20px 24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">🐨 Koala Kids</h1>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0">Suite de gestion pédagogique</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e0dff0;border-top:none">
          <p style="color:#555;margin-top:0">Bonjour <strong>${recipientName}</strong>,</p>
          ${isAdmin
            ? `<p style="color:#555">Une nouvelle demande a été soumise pour <strong>${referent}</strong> de la crèche <strong>${creche}</strong>.</p>`
            : `<p style="color:#555">Une nouvelle demande vous a été transmise par l'équipe de direction.</p>`
          }
          <div style="background:#f8f7ff;border-left:4px solid ${priorityColor};border-radius:0 8px 8px 0;padding:16px;margin:20px 0">
            <div style="font-size:12px;color:#888;margin-bottom:6px">DEMANDE · ${creche}</div>
            <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:17px">${subject}</h2>
            <p style="margin:0 0 12px;color:#555;font-size:14px;line-height:1.5">${desc || "—"}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <span style="background:${priorityColor};color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700">${priorityLabel}</span>
              ${date ? `<span style="background:#f0f0f0;color:#555;padding:3px 10px;border-radius:12px;font-size:12px">${date}</span>` : ""}
              ${referent ? `<span style="background:#eeedf8;color:#3D3580;padding:3px 10px;border-radius:12px;font-size:12px">👤 ${referent}</span>` : ""}
            </div>
          </div>
          <div style="text-align:center;margin:24px 0 8px">
            <a href="${APP_URL}" style="background:#3D3580;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
              ${isAdmin ? "Gérer la demande →" : "Voir l'application →"}
            </a>
          </div>
        </div>
        <p style="text-align:center;color:#aaa;font-size:11px;margin-top:12px">© Koala Kids — Ce message est automatique, merci de ne pas y répondre directement.</p>
      </div>`;

    const errors: string[] = [];

    // ── 1. Email au RÉFÉRENT destinataire (sauf s'il a déjà le push) ─
    if (referentEmail && !referentPushActive) {
      try {
        await sendEmail(
          referentEmail,
          `✅ Nouvelle demande "${subject}" — Koala Kids`,
          emailBody(referent || "Référent", false)
        );
      } catch (e) {
        errors.push(`referent: ${e}`);
      }
    }

    // ── 2. Email à l'ADMIN ───────────────────────────────────────
    if (ADMIN_EMAIL) {
      try {
        await sendEmail(
          ADMIN_EMAIL,
          `📬 Nouvelle demande${priority === "urgent" ? " 🔴 URGENTE" : ""} — ${creche} — ${subject}`,
          emailBody("Administrateur", true)
        );
      } catch (e) {
        errors.push(`admin: ${e}`);
      }
    }

    if (errors.length > 0) console.error("Email errors:", errors);

    return new Response(
      JSON.stringify({ ok: true, sent: { referent: !!referentEmail && !referentPushActive, admin: !!ADMIN_EMAIL }, referentPushActive, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
