// ============================================================================
// supabase/functions/notify-consigne/index.ts
// Envoi par SMTP Gmail plutôt que Resend (cf. notify-demand).
// VARIABLES D'ENVIRONNEMENT : GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAIL, APP_URL.
//
// Une consigne s'adresse à PLUSIEURS référents à la fois : le front
// (demandes.html → saveConsigne) envoie un tableau `destinataires`
// ([{email, name}, ...]), pas un référent unique — contrairement à une
// demande. La version précédente ne lisait que consigne.referentEmail,
// qui est toujours vide pour une consigne (referent_email:'' à la création),
// donc n'envoyait jamais aucun mail.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const APP_URL_DEFAUT = Deno.env.get("APP_URL") ?? "https://koalakids.fr";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** app_url de l'organisation si connue, sinon la valeur historique Koala Kids. */
async function resolveAppUrl(orgId: string | null | undefined): Promise<string> {
  if (!orgId) return APP_URL_DEFAUT;
  const { data } = await sb.from("organisations").select("app_url").eq("id", orgId).maybeSingle();
  return data?.app_url || APP_URL_DEFAUT;
}

// L'email est un filet de secours : si le destinataire a une notification push
// active, il n'a pas besoin d'un email en plus pour la même chose.
async function referentsWithActivePush(referentIds: string[]) {
  if (!referentIds.length) return new Set<string>();
  const { data } = await sb.from("push_subscriptions").select("referent_id").in("referent_id", referentIds);
  return new Set((data ?? []).map((r) => r.referent_id));
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
    const { consigne, destinataires } = await req.json();
    const { id, subject, message, creche, priority, org_id } = consigne;
    const APP_URL = await resolveAppUrl(org_id);

    const priorityColor = priority === "urgent" ? "#e03e3e" : priority === "info" ? "#F47920" : "#3D3580";
    const priorityLabel = priority === "urgent" ? "🔴 Urgente" : priority === "info" ? "ℹ️ Information" : "Normale";

    const emailToRef = (name: string, replyUrl: string) => `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f4f4f6;padding:20px">
        <div style="background:#3D3580;border-radius:12px 12px 0 0;padding:20px 24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">🐨 Koala Kids</h1>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0">Nouvelle consigne de la direction</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e0dff0;border-top:none">
          <p style="color:#555;margin-top:0">Bonjour <strong>${name}</strong>,</p>
          <p style="color:#555">Vous avez reçu une consigne de la direction concernant la crèche <strong>${creche}</strong>.</p>
          <div style="background:#fff3e0;border-left:4px solid #F47920;border-radius:0 8px 8px 0;padding:16px;margin:20px 0">
            <div style="font-size:12px;color:#F47920;font-weight:700;margin-bottom:6px">📋 CONSIGNE — ${creche}</div>
            <h2 style="margin:0 0 10px;color:#1a1a1a;font-size:17px">${subject}</h2>
            <p style="margin:0 0 12px;color:#555;font-size:14px;line-height:1.5;white-space:pre-line">${message}</p>
            <span style="background:${priorityColor};color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700">${priorityLabel}</span>
          </div>
          <p style="color:#555;font-size:14px">Vous pouvez répondre à cette consigne en cliquant sur le bouton ci-dessous :</p>
          <div style="text-align:center;margin:20px 0">
            <a href="${replyUrl}" style="background:#F47920;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
              📩 Répondre à cette consigne →
            </a>
          </div>
          <p style="color:#aaa;font-size:12px;text-align:center">Ou copiez ce lien : <a href="${replyUrl}" style="color:#3D3580">${replyUrl}</a></p>
        </div>
        <p style="text-align:center;color:#aaa;font-size:11px;margin-top:12px">© Koala Kids — Ce message est automatique.</p>
      </div>`;

    const errors: string[] = [];
    let envoyes = 0;
    let ignoresPushActif = 0;

    const pushActif = await referentsWithActivePush((destinataires ?? []).map((d: { id?: string }) => d?.id).filter(Boolean));

    // ── 1. Email à CHAQUE référent destinataire sans push actif ────
    for (const dest of (destinataires ?? [])) {
      if (!dest?.email) continue;
      if (dest.id && pushActif.has(dest.id)) { ignoresPushActif++; continue; }
      const replyUrl = `${APP_URL}/referent.html?id=${id}&name=${encodeURIComponent(dest.name || "")}&creche=${encodeURIComponent(creche || "")}`;
      try {
        await sendEmail(
          dest.email,
          `📋 Consigne : "${subject}" — Koala Kids`,
          emailToRef(dest.name || "Référent", replyUrl)
        );
        envoyes++;
      } catch (e) {
        errors.push(`${dest.email}: ${e}`);
      }
    }

    // ── 2. Confirmation à l'ADMIN ────────────────────────────────
    if (ADMIN_EMAIL) {
      const noms = (destinataires ?? []).map((d: { name?: string }) => d?.name).filter(Boolean).join(", ") || "aucun destinataire";
      const adminConfirm = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#3D3580">Consigne envoyée ✅</h2>
          <p>La consigne <strong>"${subject}"</strong> a été envoyée à ${envoyes} référent(s) : <strong>${noms}</strong>.</p>
          <p style="color:#888;font-size:13px">Message : ${message}</p>
        </div>`;
      try {
        await sendEmail(ADMIN_EMAIL, `✅ Consigne envoyée à ${envoyes} référent(s)`, adminConfirm);
      } catch (e) {
        errors.push(`admin: ${e}`);
      }
    }

    if (errors.length > 0) console.error("Email errors:", errors);

    return new Response(
      JSON.stringify({ ok: true, envoyes, ignoresPushActif, errors }),
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
