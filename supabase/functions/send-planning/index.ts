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
//
// DÉPLOIEMENT : vérification JWT ACTIVE (par défaut ; la fonction n'est pas dans
// la liste --no-verify-jwt de deploy-functions.yml). L'appelant·e est de plus
// identifié·e en base (direction ou référent·e) : la clé anon seule est refusée.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estGestionnaire, identifierAppelant } from "../_shared/appelant.ts";

// Garde-fous : cette fonction envoie depuis l'adresse Gmail de la crèche.
// Sans eux, n'importe qui disposant de la clé anon (publique) pouvait l'utiliser
// comme relais d'e-mails libres (hameçonnage au nom de Koala Kids, blocage du compte Gmail).
const MAX_DESTINATAIRES = 10;
const MAX_PDF_BASE64 = 14 * 1024 * 1024; // ≈ 10 Mo de PDF
const RE_EMAIL = /^[^@\s<>,;"']+@[^@\s<>,;"']+\.[^@\s<>,;"']+$/;
const sansRetourLigne = (s: unknown) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();
const echapper = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

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
    // Appelant·e identifié·e (jeton de session) : direction ou référent·e uniquement.
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const appelant = await identifierAppelant(sb, req);
    if (!appelant) return json({ error: "Authentification manquante." }, 401);
    if (!estGestionnaire(appelant)) return json({ error: "Droits insuffisants." }, 403);

    // org_nom : optionnel, à envoyer par le front une fois qu'il connaît le nom
    // de l'organisation de l'expéditeur (cf. Part 4 — cette fonction n'a accès
    // à aucune table, elle ne peut pas le résoudre elle-même). Tant qu'aucun
    // appelant ne le fournit, on garde "Koala Kids" en repli.
    const { to, subject, message, filename, pdf_base64, org_nom } = await req.json();
    const orgNom = sansRetourLigne(org_nom || "Koala Kids").slice(0, 80);

    // Vérifications de base
    if (!Array.isArray(to) || to.length === 0) {
      return json({ error: "Aucun destinataire." }, 400);
    }
    if (to.length > MAX_DESTINATAIRES) {
      return json({ error: `Trop de destinataires (maximum ${MAX_DESTINATAIRES}).` }, 400);
    }
    const adresses = to.map((a: unknown) => sansRetourLigne(a));
    if (adresses.some((a: string) => !RE_EMAIL.test(a))) {
      return json({ error: "Adresse e-mail invalide." }, 400);
    }
    if (typeof pdf_base64 !== "string" || !pdf_base64) {
      return json({ error: "PDF manquant." }, 400);
    }
    if (pdf_base64.length > MAX_PDF_BASE64) {
      return json({ error: "PDF trop volumineux." }, 413);
    }

    const user = Deno.env.get("GMAIL_USER");
    const pass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!user || !pass) {
      console.error("[send-planning] GMAIL_USER / GMAIL_APP_PASSWORD absente(s)");
      return json({ error: "Configuration Gmail manquante." }, 500);
    }

    // Corps du mail : le message saisi, converti en HTML
    const texte = String(message || "").slice(0, 5000)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\n/g, "<br>");

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6">
      ${texte}
      <hr style="border:none;border-top:1px solid #E7E5E0;margin:20px 0">
      <div style="font-size:11px;color:#888">Envoye depuis l'application ${echapper(orgNom)}.</div>
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
        to: adresses,
        subject: asciiSafe(sansRetourLigne(subject || `Planning equipe - ${orgNom}`)).slice(0, 200),
        content: "Ce message nécessite un client de messagerie compatible HTML.",
        html,
        attachments: [
          {
            // Nom de fichier assaini : pas de retour à la ligne ni de chemin (injection d'en-tête MIME).
            filename: sansRetourLigne(filename || "planning.pdf").replace(/[\\/"]/g, "_").slice(0, 120),
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
