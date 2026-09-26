// Supabase Edge Function : notify-message
// Envoie un e-mail lorsqu'une réponse est postée dans le fil de discussion d'une demande.
// Envoi par SMTP Gmail plutôt que Resend (cf. notify-demand).
//
// SÉCURITÉ (26/09/2026) : cette fonction acceptait auparavant `to_email`,
// `body`, `subject` et `author_name` fournis tels quels par le client —
// n'importe quel compte authentifié pouvait faire envoyer un e-mail à
// N'IMPORTE QUELLE adresse avec un contenu arbitraire. Corrigé : le client
// ne fournit plus que `message_id` (+ `to_referent_id`, pour savoir QUI
// notifier — un choix métier, pas une donnée sensible puisque l'adresse
// réelle est de toute façon relue depuis `referents`) ; le corps du message
// et son auteur sont relus depuis la ligne `messages` déjà insérée sous RLS,
// jamais depuis la requête.
//
// Payload attendu (envoyé par demandes.html → sendThreadMessage) :
// { message_id, to_referent_id }
//
// VARIABLES D'ENVIRONNEMENT : GMAIL_USER, GMAIL_APP_PASSWORD.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/** Nom de l'organisation via la crèche, avec repli sur "Koala Kids". */
async function nomOrganisation(crecheId: string | null | undefined) {
  if (!crecheId) return "Koala Kids";
  const { data: creche } = await sb.from("creches").select("org_id").eq("id", crecheId).maybeSingle();
  if (!creche?.org_id) return "Koala Kids";
  const { data: org } = await sb.from("organisations").select("nom").eq("id", creche.org_id).maybeSingle();
  return org?.nom || "Koala Kids";
}

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
    const { message_id: messageId, to_referent_id: toReferentId } = await req.json();
    if (!messageId) {
      return new Response(
        JSON.stringify({ error: "message_id manquant" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const { data: message, error: mErr } = await sb
      .from("messages").select("demande_id, author_name, body").eq("id", messageId).maybeSingle();
    if (mErr) throw mErr;
    if (!message) {
      return new Response(
        JSON.stringify({ error: "message_introuvable" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const { data: demande } = await sb
      .from("demandes").select("subject, creche_id, referent_name, referent_email")
      .eq("id", message.demande_id).maybeSingle();

    // Destinataire : la fiche referents visée, avec repli sur les coordonnées
    // figées de la demande (cas d'un référent supprimé depuis) — même
    // logique que sendThreadMessage côté client, mais l'adresse elle-même
    // vient toujours de la base, jamais de la requête.
    const { data: destRef } = toReferentId
      ? await sb.from("referents").select("email, name").eq("id", toReferentId).maybeSingle()
      : { data: null };
    const to_email = destRef?.email || demande?.referent_email || "";
    const to_name = destRef?.name || demande?.referent_name || "";

    if (!to_email) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "aucun destinataire" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const author_name = message.author_name || "Un collègue";
    const body = message.body || "";
    const subject = demande?.subject || "Demande";
    const creche_id = demande?.creche_id || null;
    const orgNom = await nomOrganisation(creche_id);

    if (await hasActivePush(toReferentId)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "push actif" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const safe = (s: string) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#333">
        <div style="background:#6C5CE7;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
          <div style="font-size:15px;font-weight:700">💬 Nouvelle réponse</div>
          <div style="font-size:12px;opacity:.9;margin-top:2px">${safe(subject)}</div>
        </div>
        <div style="border:1px solid #eee;border-top:none;padding:18px 20px;border-radius:0 0 10px 10px">
          <p style="margin:0 0 8px;font-size:13px;color:#666">Bonjour ${safe(to_name) || ""},</p>
          <p style="margin:0 0 12px;font-size:14px"><strong>${safe(author_name)}</strong> a répondu à la demande :</p>
          <div style="background:#F4F2EF;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.5;white-space:pre-wrap">${safe(body)}</div>
          <p style="margin:16px 0 0;font-size:12px;color:#999">Connectez-vous à l'application ${safe(orgNom)} pour répondre à votre tour.</p>
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
