// Edge function "envoyer-dossier-pieces-employe"
// ============================================================================
// Envoie par e-mail (SMTP Gmail) le lien vers pieces-employe.html, où un(e)
// salarié(e) dépose en ligne les documents demandés à l'embauche (pièce
// d'identité, RIB, diplômes...). Même principe que le dossier de pièces
// famille (envoyer-dossier-pieces / pieces.html), en parallèle : pipeline
// entièrement distincte pour ne pas toucher à celle qui tourne.
//
// Le lien complet est fourni par l'appelant (employes.html connaît sa propre
// origine — GitHub Pages, domaine perso...) : cette fonction n'a donc pas
// besoin de connaître l'URL de l'app, aucun secret supplémentaire à poser.
//
// Appelée depuis employes.html (empConfirmerEnvoiPieces / empRelancerPieces
// → callFn) avec l'anon key : le filtrage par droits est déjà fait côté
// client (module visible aux comptes direction/référente seulement), et
// cette fonction ne lit que le dossier demandé, via son id.
//
// Déploiement :
//   supabase functions deploy envoyer-dossier-pieces-employe
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

async function sendEmail(to: string[], subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
  // "From" doit obligatoirement être l'adresse authentifiée elle-même : Gmail
  // rejette silencieusement tout expéditeur différent du compte SMTP utilisé.
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

function piecesEmailHtml(opts: { employe: string; creche: string; lien: string; relance: boolean; expire: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6FC;padding:24px 12px;
    font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2740;line-height:1.6">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;
      border:1px solid #E3E1EF">
      <table role="presentation" width="100%" style="border-collapse:collapse">
        <tr>
          <td style="background:#fff;padding:20px 24px;text-align:center">
            <img src="https://koalakids-app.github.io/gestion-stock/logo-koalakids.png" alt="Koala Kids"
              width="220" style="display:inline-block;height:auto">
          </td>
        </tr>
        <tr>
          <td style="background:#3D3580;color:#fff;padding:18px 24px">
            <div style="font-size:20px;font-weight:700">${opts.relance ? "Rappel — " : ""}Documents d'embauche de ${opts.employe}</div>
            <div style="font-size:14px;opacity:.85;margin-top:3px">Koala Kids${opts.creche ? ' · ' + opts.creche : ''}</div>
          </td>
        </tr>
      </table>
      <div style="padding:24px">
        <p style="margin:0 0 18px;font-size:15px">
          Pour compléter votre dossier d'embauche, merci de déposer en ligne les documents demandés
          (pièce d'identité, RIB, diplômes, etc.). Vous pouvez le faire en plusieurs fois, depuis votre
          téléphone.
        </p>
        <p style="margin:0 0 22px;text-align:center">
          <a href="${opts.lien}" style="display:inline-block;background:#F47920;color:#fff;text-decoration:none;
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

  let body: { dossier_id?: string; relance?: boolean; lien?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps_invalide" }, 400);
  }
  const { dossier_id, relance, lien } = body;
  if (!dossier_id) return json({ error: "dossier_id_manquant" }, 400);
  if (!lien) return json({ error: "lien_manquant" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: dossier, error: dErr } = await supabase
      .from("dossiers_pieces_employe")
      .select("id, employe_id, email, expire_le, relances")
      .eq("id", dossier_id)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!dossier) return json({ error: "dossier_introuvable" }, 404);

    const emails = (dossier.email || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!emails.length) return json({ error: "aucun_email" }, 400);

    const { data: employe } = await supabase
      .from("employes").select("prenom, nom, creche_id").eq("id", dossier.employe_id).maybeSingle();
    const { data: creche } = employe
      ? await supabase.from("creches").select("name").eq("id", employe.creche_id).maybeSingle()
      : { data: null };

    await sendEmail(
      emails,
      `${relance ? "Rappel — " : ""}Documents d'embauche — ${employe?.prenom || "vous"}`,
      piecesEmailHtml({
        employe: `${employe?.prenom || ""} ${employe?.nom || ""}`.trim() || "vous",
        creche: creche?.name || "",
        lien,
        relance: !!relance,
        expire: new Date(dossier.expire_le).toLocaleDateString("fr-FR"),
      }),
    );

    if (relance) {
      await supabase.from("dossiers_pieces_employe")
        .update({ relances: (dossier.relances || 0) + 1 })
        .eq("id", dossier_id);
    }

    return json({ ok: true, sent_to: emails.length });
  } catch (err) {
    console.error("[envoyer-dossier-pieces-employe]", err);
    return json({ error: (err as Error).message || "erreur_inconnue" }, 500);
  }
});
