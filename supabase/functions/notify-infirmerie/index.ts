// =====================================================================
// Edge Function : notify-infirmerie
// Alerte la direction et la referente de la creche lorsqu'un evenement
// serieux est consigne (secours, eviction, ou incident "grave").
//
// REGLE RGPD : ce message ne contient AUCUNE donnee de sante et AUCUN
// nom d'enfant. Un email n'est pas chiffre de bout en bout. Il signale
// qu'il s'est passe quelque chose et renvoie vers l'application, ou
// l'acces est protege par l'authentification et les policies RLS.
//
// Envoi par SMTP Gmail plutot que Resend (cf. notify-demand) : Resend
// exige un domaine expediteur verifie (DNS), pas encore disponible.
//
// Deploiement :
//   supabase functions deploy notify-infirmerie
// Secrets requis (deja en place pour les autres notify-*) :
//   GMAIL_USER, GMAIL_APP_PASSWORD, APP_URL
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MOTIFS: Record<string, string> = {
  secours:  "appel aux secours",
  eviction: "enfant recupere par sa famille",
  grave:    "incident signale comme grave",
};

async function sendEmail(to: string[], subject: string, html: string) {
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
      to,
      subject,
      content: "Ce message nécessite un client de messagerie compatible HTML.",
      html,
    });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { creche_id, motif, date, heure, source } = await req.json();

    if (!creche_id || !motif) {
      return new Response(JSON.stringify({ error: "creche_id et motif requis" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Client service_role : contourne les RLS pour resoudre les destinataires.
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Nom de la creche (jamais fourni par le client : on le relit en base)
    const { data: creche } = await sb
      .from("creches").select("name, org_id").eq("id", creche_id).maybeSingle();
    const crecheNom = creche?.name ?? "une creche du reseau";

    // Branding par organisation, avec repli sur les valeurs historiques
    // Koala Kids si l'organisation ne peut pas etre resolue.
    let orgNom = "Koala Kids";
    let orgAppUrl: string | null = null;
    if (creche?.org_id) {
      const { data: org } = await sb
        .from("organisations").select("nom, app_url").eq("id", creche.org_id).maybeSingle();
      if (org?.nom) orgNom = org.nom;
      orgAppUrl = org?.app_url || null;
    }

    // Destinataires : toute la direction + la referente de cette creche
    const { data: refs, error: refErr } = await sb
      .from("referents")
      .select("email, name, role, creche_id")
      .not("email", "is", null);
    if (refErr) throw refErr;

    const dest = (refs ?? [])
      .filter((r) =>
        r.role === "direction" ||
        (r.role === "referent" && r.creche_id === creche_id)
      )
      .map((r) => r.email)
      .filter((e): e is string => !!e && e.includes("@"));

    const uniques = [...new Set(dest)];
    if (!uniques.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "aucun destinataire" }),
        { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const appUrl = orgAppUrl ?? Deno.env.get("APP_URL") ?? "";
    const lien = source === "incident"
      ? `${appUrl}/demandes.html`
      : `${appUrl}/infirmerie.html`;
    const libelle = MOTIFS[motif] ?? "evenement necessitant votre attention";
    const quand = [date, heure].filter(Boolean).join(" a ");

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2B2740">
  <div style="background:#FDE8E8;border-left:4px solid #C62828;border-radius:0 8px 8px 0;padding:16px 18px">
    <div style="font-size:17px;font-weight:700;color:#C62828;margin-bottom:6px">
      Evenement a signaler &mdash; ${crecheNom}
    </div>
    <div style="font-size:14px;line-height:1.6">
      Un evenement a ete consigne : <strong>${libelle}</strong>.<br>
      ${quand ? `Survenu le ${quand}.` : ""}
    </div>
  </div>

  <p style="font-size:14px;line-height:1.6;margin:18px 0">
    Le detail n'est pas transmis par courriel. Connectez-vous a l'application
    pour le consulter.
  </p>

  <p style="margin:20px 0">
    <a href="${lien}"
       style="background:#F47920;color:#fff;text-decoration:none;font-weight:700;
              font-size:14px;padding:12px 22px;border-radius:12px;display:inline-block">
      Ouvrir l'application
    </a>
  </p>

  <p style="font-size:11.5px;color:#8E8AA8;line-height:1.6;border-top:1px solid #EFE9F5;padding-top:12px">
    Message automatique de la suite ${orgNom}. Aucune donnee de sante n'y figure :
    le contenu du registre reste accessible uniquement apres authentification.
  </p>
</div>`.trim();

    try {
      await sendEmail(uniques, `[${orgNom}] ${crecheNom} - evenement a signaler`, html);
    } catch (e) {
      return new Response(JSON.stringify({ error: "smtp", detail: String(e) }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ sent: uniques.length }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
