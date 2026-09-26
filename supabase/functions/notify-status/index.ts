// ============================================================================
// supabase/functions/notify-status/index.ts
// Envoi par SMTP Gmail plutôt que Resend (cf. notify-demand).
// VARIABLES D'ENVIRONNEMENT : GMAIL_USER, GMAIL_APP_PASSWORD, APP_URL.
//
// SÉCURITÉ (26/09/2026) : cette fonction acceptait auparavant un objet
// `demand` (destinataire ET contenu de l'e-mail) fourni tel quel par le
// client — même trou que notify-demand. Corrigé : le client ne fournit plus
// que `demande_id`, tout est relu depuis `demandes` (y compris le statut :
// la mise à jour a déjà eu lieu en base avant l'appel à cette fonction, donc
// `demandes.status` EST la vérité, pas besoin de faire confiance à un
// `newStatus` envoyé séparément).
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_URL_DEFAUT = Deno.env.get("APP_URL") ?? "https://koalakids.fr";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** app_url de l'organisation de la crèche si connue, sinon la valeur historique Koala Kids. */
async function resolveAppUrl(crecheId: string | null | undefined): Promise<string> {
  if (!crecheId) return APP_URL_DEFAUT;
  const { data: creche } = await sb.from("creches").select("org_id").eq("id", crecheId).maybeSingle();
  if (!creche?.org_id) return APP_URL_DEFAUT;
  const { data: org } = await sb.from("organisations").select("app_url").eq("id", creche.org_id).maybeSingle();
  return org?.app_url || APP_URL_DEFAUT;
}

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
    const { demande_id: demandeId } = await req.json();
    if (!demandeId) {
      return new Response(JSON.stringify({ ok: false, error: "demande_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: dErr } = await sb
      .from("demandes")
      .select("subject, referent_name, referent_email, to_referent_id, creche_id, status, type")
      .eq("id", demandeId)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!row || row.type !== "demande") {
      return new Response(JSON.stringify({ ok: false, error: "demande_introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, referent_name: referent, referent_email: referentEmail, to_referent_id: referentId, creche_id: crecheId, status: newStatus } = row;
    const { data: crecheRow } = crecheId
      ? await sb.from("creches").select("name").eq("id", crecheId).maybeSingle()
      : { data: null };
    const creche = crecheRow?.name || "";
    const APP_URL = await resolveAppUrl(crecheId);

    if (!referentEmail) {
      return new Response(JSON.stringify({ ok: false, reason: "no email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (await hasActivePush(referentId)) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "push actif" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isTraite = newStatus === "traite";
    const statusLabel = isTraite ? "✅ Traitée" : "⏳ Remise en attente";
    const statusColor = isTraite ? "#2a9d4e" : "#F47920";
    const treatedDate = isTraite ? new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "";

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f4f4f6;padding:20px">
        <div style="background:#3D3580;border-radius:12px 12px 0 0;padding:20px 24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">🐨 Koala Kids</h1>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e0dff0;border-top:none">
          <p style="color:#555;margin-top:0">Bonjour <strong>${referent}</strong>,</p>
          <p style="color:#555">Le statut de votre demande a été mis à jour.</p>
          <div style="background:#f8f7ff;border-left:4px solid ${statusColor};border-radius:0 8px 8px 0;padding:16px;margin:20px 0">
            <div style="font-size:12px;color:#888;margin-bottom:6px">${creche}</div>
            <h2 style="margin:0 0 10px;color:#1a1a1a;font-size:17px">${subject}</h2>
            <span style="background:${statusColor};color:#fff;padding:4px 14px;border-radius:12px;font-size:13px;font-weight:700">${statusLabel}</span>
            ${isTraite ? `<p style="margin:10px 0 0;color:#2a9d4e;font-size:13px">Traitée le ${treatedDate}</p>` : ""}
          </div>
          <div style="text-align:center;margin:20px 0">
            <a href="${APP_URL}" style="background:#3D3580;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Voir l'application →</a>
          </div>
        </div>
        <p style="text-align:center;color:#aaa;font-size:11px;margin-top:12px">© Koala Kids — Ce message est automatique.</p>
      </div>`;

    try {
      await sendEmail(
        referentEmail,
        `${isTraite ? "✅" : "⏳"} Votre demande "${subject}" — ${statusLabel}`,
        html
      );
    } catch (e) {
      console.error("notify-status", e);
      return new Response(JSON.stringify({ ok: false, error: String(e) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
