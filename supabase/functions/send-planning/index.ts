// supabase/functions/send-planning/index.ts
// Envoie le planning équipe (ou une commande repas traiteur) en PDF par mail,
// via SMTP Gmail plutôt que Resend : Resend exige un domaine expéditeur
// vérifié (DNS), pas encore disponible (koalakids.fr en attente d'accès DNS).
// Un compte Gmail avec validation en deux étapes + mot de passe d'application
// suffit, sans dépendance à un domaine.
//
// Secrets nécessaires (mêmes noms pour toutes les fonctions d'envoi d'e-mail
// de l'appli) :
//   GMAIL_USER           adresse Gmail d'expédition (ex. koalakids.app@gmail.com)
//   GMAIL_APP_PASSWORD   mot de passe d'application à 16 caractères, généré
//                        depuis myaccount.google.com/apppasswords

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// denomailer encode mal l'en-tête Subject dès qu'il contient des caractères
// non-ASCII (accents, tiret long —) ET qu'un attachment est présent : le
// message entier arrive corrompu (MIME brut affiché comme texte). On
// retombe donc sur un sujet ASCII pour ce cas précis, le seul des fonctions
// d'envoi de l'appli à combiner sujet accentué et pièce jointe.
function asciiSafe(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

Deno.serve(async (req) => {
  // Requête préliminaire du navigateur
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { to, subject, message, filename, pdf_base64 } = await req.json();

    // Vérifications de base
    if (!Array.isArray(to) || to.length === 0) {
      return json({ error: "Aucun destinataire." }, 400);
    }
    if (!pdf_base64) {
      return json({ error: "PDF manquant." }, 400);
    }

    const user = Deno.env.get("GMAIL_USER");
    const pass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!user || !pass) {
      console.error("[send-planning] GMAIL_USER / GMAIL_APP_PASSWORD absente(s)");
      return json({ error: "Configuration Gmail manquante." }, 500);
    }

    // Corps du mail : le message saisi, converti en HTML
    const texte = String(message || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\n/g, "<br>");

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6">
      ${texte}
      <hr style="border:none;border-top:1px solid #E7E5E0;margin:20px 0">
      <div style="font-size:11px;color:#888">Envoye depuis l'application Koala Kids.</div>
    </div>`;

    // "From" doit obligatoirement être l'adresse authentifiée elle-même :
    // Gmail rejette silencieusement tout expéditeur différent du compte SMTP.
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
        subject: asciiSafe(subject || "Planning equipe - Koala Kids"),
        content: "Ce message nécessite un client de messagerie compatible HTML.",
        html,
        attachments: [
          {
            filename: filename || "planning.pdf",
            content: pdf_base64,
            encoding: "base64",
          },
        ],
      });
    } catch (mailErr) {
      console.error("[send-planning] Erreur SMTP :", mailErr);
      return json({ error: String(mailErr) }, 502);
    } finally {
      await client.close();
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("[send-planning] Erreur :", e);
    return json({ error: String(e) }, 500);
  }
});
